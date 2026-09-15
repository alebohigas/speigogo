<?php
/**
 * Resultados Jugadores (Detail) Endpoint
 * GET /api/resultados_jug.php?catid=XXX&torneoid=XXX&gross=0|1
 * Returns tournament results for a category
 * Supports: Stroke Play (Neto/Gross), Stableford (Neto/Gross)
 *
 * IMPORTANT: Totals only include CLOSED scorecards (statlsc = 1)
 * to avoid counting partial live scoring data.
 * Per-day functions (f_score_dia_sax/sox) already use v_resultar
 * which filters by statlsc = 1.
 *
 * Returns two arrays: 'players' (estatus=NORMAL) and 'cutPlayers'
 * (non-NORMAL: NO SHOW, RETIRO, DESCALIFICADO, etc.)
 * Also returns 'medalCountNeto' (categorias.numganadorneto, default 3) and
 * 'medalCountGross' (categorias.numganadorgross, default 1) for dynamic medal
 * assignment per scoring type. 'medalCount' is preserved for backward
 * compatibility and reflects the count for the requested scoring (?gross=0|1).
 */
require_once 'config.php';

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0'); 

$catid    = require_param('catid');
$torneoid = require_param('torneoid');
$gross    = optional_param('gross', '0');

$cid = esc($conn, $catid);
$tid = esc($conn, $torneoid);

// ============= Get category info (includes per-scoring medal counts) =============
// Medal counts (numganadorneto / numganadorgross) live in `categorias`.
// We probe INFORMATION_SCHEMA so missing columns on legacy databases fall
// back to defaults (3 neto, 1 gross) instead of causing a fatal SQL error.
// numjugprem is kept as legacy fallback for the net count.

/**
 * Checks whether a column exists in `categorias` for the active database.
 * Lets us gracefully degrade when legacy schemas miss optional columns.
 */
function categorias_has_column($conn, $col) {
    $colEsc = esc($conn, $col);
    $res = @$conn->query(
        "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'categorias'
           AND COLUMN_NAME = '$colEsc'
         LIMIT 1"
    );
    if (!$res) return false;
    $exists = $res->num_rows > 0;
    $res->free();
    return $exists;
}

$hasNeto   = categorias_has_column($conn, 'numganadorneto');
$hasGross  = categorias_has_column($conn, 'numganadorgross');
$hasLegacy = categorias_has_column($conn, 'numjugprem');

/** SELECT expression for net medal count, with safe fallbacks */
if ($hasNeto) {
    $netoExpr = $hasLegacy
        ? "IFNULL(a.numganadorneto, IFNULL(a.numjugprem, 3))"
        : "IFNULL(a.numganadorneto, 3)";
} else {
    $netoExpr = $hasLegacy ? "IFNULL(a.numjugprem, 3)" : "3";
}

/** SELECT expression for gross medal count, with safe fallback */
$grossExpr = $hasGross ? "IFNULL(a.numganadorgross, 1)" : "1";

/** GROUP BY additions only for columns that actually exist */
$groupExtras = '';
if ($hasNeto)   $groupExtras .= ', a.numganadorneto';
if ($hasGross)  $groupExtras .= ', a.numganadorgross';
if ($hasLegacy) $groupExtras .= ', a.numjugprem';

$sql = "SELECT a.categoria_id, a.categoria, a.abreviatura, a.sistema, a.formato,
               a.estilo, a.gross, a.porcentaje, a.salida, a.hoyosajugar,
               $netoExpr as numganadorneto,
               $grossExpr as numganadorgross,
               COUNT(b.id) as playerCount
        FROM categorias a
        JOIN jugadores b ON (a.categoria_id = b.categoriaid)
        WHERE a.categoria_id = $cid
        GROUP BY a.categoria_id, a.categoria, a.abreviatura, a.sistema, a.formato,
                 a.estilo, a.gross, a.porcentaje, a.salida, a.hoyosajugar"
        . $groupExtras;

$catInfo = query_one($conn, $sql);
debug_log_query('Category info', $sql);
if (!$catInfo) {
    json_error('Category not found', 404);
}

/**
 * Dispatcher: cuando la categoría es de parejas (formato='PAREJAS'), delegamos
 * a `resultados_parejas.php` que ya implementa la lógica legacy de torneos en
 * pareja (v_jugadores_parejas, f_torneosax/sox, f_score_dia_sax/sox). El
 * endpoint devuelve el mismo shape (con `isParejas: true`, `clubLogo2`, etc.)
 * para que el frontend lo consuma de forma transparente.
 */
if (strtoupper($catInfo['formato'] ?? '') === 'PAREJAS') {
    require __DIR__ . '/resultados_parejas.php';
    exit;
}

/**
 * Dispatcher EQUIPOS (formato AGOGO): la categoría se juega por equipos cuando
 * el formato lo declara, o cuando el torneo admite más de 2 jugadores por grupo
 * y de hecho hay grupos con varios integrantes (`jugadores.grupoid`).
 * En ese caso `resultados_equipos.php` arma el leaderboard por equipo.
 */
$formatoRaw = strtoupper($catInfo['formato'] ?? '');
$isEquiposFormat = (strpos($formatoRaw, 'AGOGO') !== false || strpos($formatoRaw, 'EQUIPO') !== false);
if (!$isEquiposFormat) {
    $torneoRow = query_one($conn, "SELECT nummaxjug FROM torneo WHERE torneo_id = $tid LIMIT 1");
    if ($torneoRow && (int)($torneoRow['nummaxjug'] ?? 0) > 2) {
        $multi = query_one($conn,
            "SELECT COUNT(*) AS grupos FROM (
                SELECT grupoid FROM jugadores
                 WHERE categoriaid = $cid AND grupoid <> ''
                 GROUP BY grupoid HAVING COUNT(*) > 2
             ) x");
        $isEquiposFormat = $multi && (int)$multi['grupos'] > 0;
    }
}
if ($isEquiposFormat) {
    require __DIR__ . '/resultados_equipos.php';
    exit;
}

$sistema = strtoupper($catInfo['sistema']);
$formato = strtoupper($catInfo['formato']);
$medalCountNeto  = (int)$catInfo['numganadorneto'];
$medalCountGross = (int)$catInfo['numganadorgross'];

/** Active medal count for the requested scoring type (back-compat field) */
$medalCount = ($gross == '1') ? $medalCountGross : $medalCountNeto;

// ============= Get play dates =============
// A round column is published in Resultados only when EITHER:
//   (a) at least one eligible NORMAL player has a CLOSED card (statlsc=1)
//       for that date — round is "scoring" and its closed cards roll into
//       Total, OR
//   (b) the round has only open (in-progress) cards — column is shown as a
//       placeholder ("—" line per player), does NOT contribute to Total.
// Rounds with zero cards entirely (future rounds) stay hidden.
//
// `$diasPartial[$i] = true` now means "in-progress placeholder, no closed
// cards yet" — the column is rendered empty (dashes) and produces no score.
// `$diasPartial[$i] = false` means "scoring round" (>=1 closed card) — uses
// legacy f_score_dia_sax/sox and rolls into the Total via $closedSA/$closedSO.
$sql = "SELECT fecha FROM caljuego
        WHERE categoriaid = $cid AND campo > 0
        ORDER BY fecha";
$dateRows = query_all($conn, $sql);

$dias = [];
$diasPartial = []; // 1-indexed map: round# => bool (true = in-progress placeholder, no closed cards)
$eligibleWhere = "j.categoriaid = $cid AND j.torneoid = $tid AND j.estatus = 'NORMAL'";
if ($gross != '1') { $eligibleWhere .= " AND j.campgross = 0"; }
$expectedRow = query_one($conn, "SELECT COUNT(*) AS total FROM jugadores j WHERE $eligibleWhere");
$expectedPlayers = (int)($expectedRow['total'] ?? 0);

foreach ($dateRows as $dr) {
    $fecha = $dr['fecha'];
    $fecEsc = esc($conn, $fecha);
    // Count any scorecards (open or closed) for that date
    $anyRow = query_one($conn, "SELECT COUNT(DISTINCT t.jugadorid) AS total
                                 FROM tarjetas t
                                 JOIN jugadores j ON (j.id = t.jugadorid)
                                 WHERE $eligibleWhere
                                   AND t.torneoid = $tid
                                   AND DATE(t.fecha_juego) = '$fecEsc'");
    $anyCount = (int)($anyRow['total'] ?? 0);
    if ($anyCount === 0) { continue; } // future round, skip
    // Count CLOSED scorecards (statlsc=1) for that date
    $closedRow = query_one($conn, "SELECT COUNT(DISTINCT t.jugadorid) AS total
                                   FROM tarjetas t
                                   JOIN jugadores j ON (j.id = t.jugadorid)
                                   WHERE $eligibleWhere
                                     AND t.torneoid = $tid
                                     AND DATE(t.fecha_juego) = '$fecEsc'
                                     AND t.statlsc = 1");
    $closedCount = (int)($closedRow['total'] ?? 0);
    // Hide the round column entirely if NO player has closed a card yet
    // (statlsc=1). Empty/in-progress-only rounds are not shown.
    if ($closedCount === 0) { continue; }
    $idx = count($dias) + 1;
    $dias[$idx] = $fecha;
    // All published rounds now have at least one closed card, so they are
    // never "partial". Kept for backward compatibility with downstream code.
    $diasPartial[$idx] = false;
}

// ============= Get course info =============
$sql = "SELECT b.campoid, b.salidaid, rating, slope, tee, parcampo
        FROM caljuego a
        JOIN campo_tee b ON (a.campo = b.campoid AND categoriaid = $cid AND salidaid = " . esc($conn, $catInfo['salida']) . ")
        JOIN salidas s ON (b.salidaid = s.id)
        LIMIT 1";
$courseInfo = query_one($conn, $sql);
/** Course par used for diff-to-par computation in partial Stroke rounds. */
$parcampo = (int)($courseInfo['parcampo'] ?? 72);

// ============= Inline subquery helpers for closed-card totals =============

/**
 * SQL date guard for the accumulated `total` column.
 *
 * Rule (updated): a player's individually CLOSED scorecard (statlsc = 1)
 * always rolls into their Total, regardless of whether the rest of the
 * category has also closed that round. The filter therefore restricts to
 * the set of scheduled round dates (`$dias`) — so future / unscheduled
 * dates are excluded — but no longer requires the round to be fully
 * closed by every eligible player.
 *
 * Previously this only included rounds where EVERY eligible player had
 * closed their card, which meant a player who had already finished
 * (thru = "F") would see "0" in Total until the slowest player in the
 * category also signed off. The new behaviour mirrors what the user sees
 * mid-round: as soon as your card closes, your contribution counts.
 */
$allDates = array_map(function($fecha) use ($conn) { return "'" . esc($conn, $fecha) . "'"; }, array_values($dias));
$closedDateFilter = count($allDates) > 0
    ? " AND DATE(t.fecha_juego) IN (" . implode(',', $allDates) . ")"
    : " AND 1 = 0";

/** Sum SA (neto/stableford points) from CLOSED cards only on fully published rounds */
$closedSA  = "(SELECT IFNULL(SUM(t.SA), 0) FROM tarjetas t WHERE t.jugadorid = j.id AND t.torneoid = j.torneoid AND t.statlsc = 1 $closedDateFilter)";

/** Sum SO (gross strokes) from CLOSED cards only on fully published rounds */
$closedSO  = "(SELECT IFNULL(SUM(t.SO), 0) FROM tarjetas t WHERE t.jugadorid = j.id AND t.torneoid = j.torneoid AND t.statlsc = 1 $closedDateFilter)";

/** Sum totstbgross (stableford gross points) from CLOSED cards only on fully published rounds */
$closedSTBGross = "(SELECT IFNULL(SUM(t.totstbgross), 0) FROM tarjetas t WHERE t.jugadorid = j.id AND t.torneoid = j.torneoid AND t.statlsc = 1 $closedDateFilter)";

/**
 * Count of CLOSED scorecards (statlsc=1) for this player on scheduled round dates.
 *
 * Exposed in the JSON response as `closedRounds` so the frontend can convert
 * the raw stroke total (`total`) into a differential vs par for Stroke Play
 * leaderboards: `displayedTotal = total - parcampo * closedRounds`.
 *
 * When 0 the UI shows a plain "0" because the player has no terminated round yet.
 */
$closedRoundCount = "(SELECT COUNT(*) FROM tarjetas t WHERE t.jugadorid = j.id AND t.torneoid = j.torneoid AND t.statlsc = 1 $closedDateFilter)";

// ============= Legacy countback tiebreaker =============
// Replaces the old r1_chunk / prev_rounds_tiebreaker / partial_round_ordering
// stack with the legacy pattern: JOIN to the helper view that exposes the
// player's LAST closed scorecard split into c1..c5 buckets:
//   c1 = H18           c2 = H17           c3 = H16
//   c4 = H15+H14+H13   c5 = H12+H11+H10
// And then ORDER BY (c1+c2+c3+c4+c5) → (c1+c2+c3+c4) → (c1+c2+c3) → c1
// (a.k.a. holes 10-18 → 13-18 → 16-18 → 18). Direction matches the system:
//   Stroke Play → ASC  (fewer wins)
//   Stableford  → DESC (more wins; same direction as the primary total)
//
// The view used depends on the scoring side:
//   v_cd_ulttar_sa → buckets built from h{n}_a (net / SA)
//   v_cd_ulttar_so → buckets built from h{n}   (gross / SO)

/**
 * Build the legacy countback ORDER BY fragment using the JOINed view's
 * c1..c5 columns. Returns SQL starting with ", " so it can be appended.
 *
 * @param string $direction 'ASC' (Stroke Play) or 'DESC' (Stableford).
 */
function countback_order($direction) {
    return ", (u.c1 + u.c2 + u.c3 + u.c4 + u.c5) {$direction}"
         . ", (u.c1 + u.c2 + u.c3 + u.c4) {$direction}"
         . ", (u.c1 + u.c2 + u.c3) {$direction}"
         . ", u.c1 {$direction}";
}

/**
 * Suma de hoyos de la ÚLTIMA tarjeta cerrada del jugador.
 * Gross → columnas h{n}; Neto → columnas h{n}_a.
 */
function last_card_holes_sum(array $holes, $gross) {
    $suf = ($gross == '1') ? '' : '_a';
    $sum = implode(' + ', array_map(fn($h) => "COALESCE(tc.h{$h}{$suf}, 0)", $holes));
    return "(SELECT ({$sum})
             FROM tarjetas tc
             WHERE tc.jugadorid = j.id
               AND tc.torneoid  = j.torneoid
               AND tc.statlsc   = 1
             ORDER BY tc.fecha_juego DESC
             LIMIT 1)";
}

/**
 * Desempates de la vuelta de ida sobre la última tarjeta cerrada, aplicados
 * después del countback de la vuelta de vuelta (10-18 → 13-18 → 16-18 → 18):
 *   hoyos 4-9 → hoyos 7-9 → hoyo 9.
 * Se comparan golpes, por lo que menos siempre es mejor (ASC).
 */
function front_countback_order($gross) {
    return ", " . last_card_holes_sum([4, 5, 6, 7, 8, 9], $gross) . " ASC"
         . ", " . last_card_holes_sum([7, 8, 9], $gross) . " ASC"
         . ", " . last_card_holes_sum([9], $gross) . " ASC";
}


/**
 * Last-round score alias used right before the countback. Mirrors legacy
 * `f_score_dia_saxU(a.id)` (score of player's last published round).
 * Returns 'NULL' when there are no rounds yet so MySQL skips it cleanly.
 */
function last_round_alias(array $dias) {
    if (empty($dias)) return 'NULL';
    $last = max(array_keys($dias));
    return "d{$last}";
}

// ============= Legacy R1 chunk tiebreaker (c1..c6) =============
/**
 * Build the legacy R1 hole-chunk tiebreaker using the per-hole points stored
 * in `jugadores` columns `c1..c6` (each holds the points for the back-nine
 * chunks of Round 1 — these are computed/maintained by the legacy system).
 *
 * Progression (matches legacy order_by exactly):
 *   (c1+c2+c3+c4+c5) → (c1+c2+c3+c4) → (c1+c2+c3) → c1
 *
 * Direction:
 *   - Stroke Play  → ASC  (fewer strokes wins)
 *   - Stableford   → DESC (more points wins, per legacy SQL)
 *
 * Returns a SQL fragment to append to ORDER BY (starts with ", ").
 */
function legacy_r1_chunks($direction) {
    // Columns c1..c6 come from views v_cd_ulttar_sa (NETO) / v_cd_ulttar_so (GROSS),
    // joined as alias `u`. They represent Round-1 hole groupings:
    //   c1=h18, c2=h17, c3=h16, c4=h15+h14+h13, c5=h12+h11+h10, c6=front nine.
    return ", (u.c1+u.c2+u.c3+u.c4+u.c5) {$direction}"
         . ", (u.c1+u.c2+u.c3+u.c4) {$direction}"
         . ", (u.c1+u.c2+u.c3) {$direction}"
         . ", u.c1 {$direction}";
}

// ============= Legacy "ultima tarjeta" (latest closed round) tiebreaker =============
/**
 * Mirrors the legacy `f_score_dia_saxU(id)` / `f_score_dia_satblU(id)` /
 * `f_score_dia_soxU(id)` functions: the score of the player's MOST RECENT
 * closed scorecard (statlsc = 1). We re-implement it inline as a scalar
 * subquery to avoid depending on those functions being installed in every
 * MySQL instance.
 *
 * @param string $col Column to read from the latest closed tarjeta:
 *                    - 'SA'         → stableford net points / stroke net total
 *                    - 'SO'         → gross strokes
 *                    - 'totstbgross'→ stableford gross points
 */
function latest_card_score($col) {
    return "(SELECT t.{$col}
             FROM tarjetas t
             WHERE t.jugadorid = j.id
               AND t.torneoid  = j.torneoid
               AND t.statlsc   = 1
             ORDER BY t.fecha_juego DESC
             LIMIT 1)";
}

// ============= Legacy "diax" per-round score expression =============
/**
 * Last legacy tiebreaker: per-round score on the penultimate scheduled day.
 * Returns empty string when there's only one round (no diax).
 *
 * @param string $func Legacy function name:
 *                     - 'sax' → stableford net / stroke net per-day
 *                     - 'sox' → stroke gross per-day (also used for stableford gross legacy)
 * @param string $diax Escaped penultimate round date (YYYY-MM-DD) or '' to skip.
 * @param string $direction 'ASC' or 'DESC' (legacy uses no explicit dir → defaults to ASC).
 */
function diax_tiebreaker($func, $diax, $direction = 'ASC') {
    if ($diax === '') return '';
    return ", f_score_dia_{$func}(j.id, '{$diax}') {$direction}";
}

// ============= Helper: map estatus to short code =============
/**
 * Maps player estatus to a display code:
 * NORMAL → null (active player), NO SHOW/SHOW-NO → S, 
 * RETIRO/ABANDONO → R, DESCALIFICADO/DQ → D, CORTE/CUT → C,
 * NO CONTIENDE → N, other → D
 * (catálogo `estatusjugt`: NORMAL, RETIRO, DESCALIFICADO, SHOW-NO, CORTE, NO CONTIENDE)
 */
function mapEstatus($estatus) {
    $e = strtoupper(trim($estatus));
    if ($e === 'NORMAL') return null;
    if ($e === 'NO SHOW' || $e === 'SHOW-NO' || $e === 'NO-SHOW') return 'S';
    if ($e === 'RETIRO' || $e === 'ABANDONO') return 'R';
    if ($e === 'DESCALIFICADO' || $e === 'DQ') return 'D';
    if ($e === 'CORTE' || $e === 'CUT') return 'C';
    if ($e === 'NO CONTIENDE' || $e === 'NO-CONTIENDE') return 'N';
    return 'D'; // default for unknown non-NORMAL statuses
}

/** Map status code to descriptive (capitalized) label */
function statusLabel($code) {
    if ($code === 'S') return 'No Show';
    if ($code === 'R') return 'Retiro';
    if ($code === 'D') return 'Descalificado';
    if ($code === 'C') return 'Corte';
    if ($code === 'N') return 'No Contiende';
    return '';
}

// ============= Per-round score expression builder =============
/**
 * Build the SQL expression that returns a player's per-round score for
 * the requested round.
 *
 * - For CLOSED rounds (every eligible player has statlsc=1): we keep using
 *   the legacy `f_score_dia_sax/sox` functions which read from `v_resultar`
 *   (statlsc=1 only). This preserves identical numbers for finished rounds.
 *
 * - For PARTIAL rounds (at least one eligible player has an open card): we
 *   read from `tarjetas` directly with NO `statlsc` filter so in-progress
 *   scores show up. The score column matches what each scoring system shows
 *   in the round column:
 *     STROKE  GROSS → SO - parcampo (diff to par)
 *     STROKE  NETO  → SA - parcampo (net diff to par)
 *     STBLF   GROSS → totstbgross
 *     STBLF   NETO  → SA
 *
 *   `parcampo` for a single round comes from the categoria's course par
 *   (`caljuego JOIN campo_tee.parcampo`). Each scorecard row represents one
 *   played round so the diff is `SUM(score) - parcampo * cards_played`.
 *
 * @param string $sistema  STROKE PLAY | STABLEFORD
 * @param string $gross    '0' | '1'
 * @param string $fecEsc   Escaped YYYY-MM-DD round date
 * @param bool   $partial   Whether the round is in-progress
 * @param int    $parcampo  Course par for this category (default 72)
 * @return string SQL scalar expression that evaluates to the player's score
 *                for that round (or 0 if no card).
 */
function day_score_expr($sistema, $gross, $fecEsc, $partial, $parcampo = 72) {
    // Partial round = nobody has closed yet. We return NULL so the row cell
    // renders as "—" placeholder on the frontend; no live computation runs.
    if ($partial) {
        return 'NULL';
    }
    // Scoring round (>=1 closed card). Read DIRECTLY from `tarjetas` with
    // an explicit `statlsc = 1` filter to guarantee that only finalized
    // cards contribute to the round score. The legacy
    // f_score_dia_sax/sox functions sometimes returned partial values for
    // players whose card was still open (e.g. R2 not started yet showed a
    // value pulled from in-progress data). Querying tarjetas directly
    // eliminates that risk.
    //
    // RESULTADOS shows the RAW per-round total (golpes for Stroke, points for
    // Stableford). The diff-vs-par "+N / -N / E" view belongs to /live ONLY.
    // Therefore we never subtract parcampo here — the round cell mirrors the
    // signed scorecard total, and the global Total is the straight sum.
    //   STABLEFORD GROSS → SUM(totstbgross)
    //   STABLEFORD NETO  → SUM(SA)
    //   STROKE     GROSS → SUM(SO)   (raw gross strokes)
    //   STROKE     NETO  → SUM(SA)   (raw net strokes)
    //
    // Returns NULL when the player has no closed card for that date so the
    // frontend renders a dash instead of a misleading "0".
    if ($sistema === 'STABLEFORD' && $gross == '1') {
        $col = 'SUM(t.totstbgross)';
    } elseif ($sistema === 'STABLEFORD') {
        $col = 'SUM(t.SA)';
    } elseif ($gross == '1') {
        $col = 'SUM(t.SO)';
    } else {
        $col = 'SUM(t.SA)';
    }
    return "(SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE $col END
              FROM tarjetas t
              WHERE t.jugadorid = j.id
                AND t.torneoid  = j.torneoid
                AND DATE(t.fecha_juego) = '$fecEsc'
                AND t.statlsc = 1)";
}

// ============= Player eligibility helper =============
/**
 * "Has any tarjeta in this tournament" — used to keep a player visible in
 * Resultados as soon as their first card is opened, even before any round
 * is fully closed. Without this, the leaderboard would be empty during the
 * very first in-progress round.
 */
$hasAnyCard = "EXISTS (SELECT 1 FROM tarjetas t
                       WHERE t.jugadorid = j.id
                         AND t.torneoid  = j.torneoid)";

/**
 * When there are no rounds with cards yet (`$dias` is empty — e.g. the
 * tournament hasn't started or no scorecards exist for any scheduled date),
 * we still want to show the full eligible roster in Resultados so users can
 * see who's playing in each category, with empty round columns and total=0.
 * In that case we drop the "must have at least one closed/open card" filter.
 */
$rosterFilter = count($dias) === 0 ? '1=1' : '';

// ============= Build main results query (NORMAL players) =============
$players = [];

if ($sistema === 'STROKE PLAY' || $sistema === 'STROKE') {

    if ($gross == '1') {
        $sql = "SELECT j.id AS jugadorid, j.numjugador,
                       CONCAT(j.nombre, ' ', j.apellido) as jugador, j.estatus,
                       $closedSO as so,
                       $closedSA as sa,
                       $closedRoundCount as closed_rounds,
                       IFNULL(j.muertesubita, 0) as muertesubita";

        foreach ($dias as $i => $fecha) {
            $expr = day_score_expr($sistema, '1', esc($conn, $fecha), !empty($diasPartial[$i]), $parcampo);
            $sql .= ", $expr as d{$i}";
        }

        $sql .= ", c.abr, c.logo
                 FROM jugadores j
                 LEFT JOIN v_cd_ulttar_so u ON (j.id = u.jugadorid)
                 JOIN clubs c ON (j.clubid = c.id)
                 WHERE j.categoriaid = $cid
                   AND j.torneoid = $tid
                   AND (" . ($rosterFilter ?: "$closedSO > 0 OR $hasAnyCard") . ")
                   AND j.estatus = 'NORMAL'
                 ORDER BY $closedSO ASC";

        // ===== Legacy ORDER BY (Stroke Play GROSS) =====
        // f_torneosox ASC, muertesubita DESC, latest-card SO ASC,
        // (c1+..+c5) ASC, (c1+..+c4) ASC, (c1+..+c3) ASC, c1 ASC,
        // f_score_dia_sox(diax) ASC
        $sql .= ", IFNULL(j.muertesubita, 0) DESC";
        // Legacy ordering: last round score, then countback c1..c5 (ASC for Stroke).
        $sql .= ", " . last_round_alias($dias) . " ASC";
        $sql .= countback_order('ASC');
        $sql .= front_countback_order('1');

    } else {
        $sql = "SELECT j.id AS jugadorid, j.numjugador,
                       CONCAT(j.nombre, ' ', j.apellido) as jugador, j.estatus,
                       $closedSA as sa,
                       $closedSO as so,
                       $closedRoundCount as closed_rounds,
                       IFNULL(j.muertesubita, 0) as muertesubita";

        foreach ($dias as $i => $fecha) {
            $expr = day_score_expr($sistema, '0', esc($conn, $fecha), !empty($diasPartial[$i]), $parcampo);
            $sql .= ", $expr as d{$i}";
        }

        $sql .= ", c.abr, c.logo
                 FROM jugadores j
                 LEFT JOIN v_cd_ulttar_sa u ON (j.id = u.jugadorid)
                 JOIN clubs c ON (j.clubid = c.id)
                 WHERE j.categoriaid = $cid
                   AND j.torneoid = $tid
                   AND (" . ($rosterFilter ?: "$closedSA > 0 OR $hasAnyCard") . ")
                   AND j.estatus = 'NORMAL'
                   AND j.campgross = 0
                 ORDER BY $closedSA ASC";

        // ===== Legacy ORDER BY (Stroke Play NETO) =====
        // f_torneosax ASC, muertesubita DESC, latest-card SA ASC,
        // (c1+..+c5) ASC, (c1+..+c4) ASC, (c1+..+c3) ASC, c1 ASC
        $sql .= ", IFNULL(j.muertesubita, 0) DESC";
        // Legacy ordering: last round score, then countback c1..c5 (ASC for Stroke).
        $sql .= ", " . last_round_alias($dias) . " ASC";
        $sql .= countback_order('ASC');
        $sql .= front_countback_order('0');
    }

} elseif ($sistema === 'STABLEFORD') {

    if ($gross == '1') {
        $sql = "SELECT j.id AS jugadorid, j.numjugador,
                       CONCAT(j.nombre, ' ', j.apellido) as jugador, j.estatus,
                       $closedSTBGross as sa,
                       $closedSO as so,
                       $closedRoundCount as closed_rounds,
                       IFNULL(j.muertesubita, 0) as muertesubita";

        foreach ($dias as $i => $fecha) {
            $expr = day_score_expr($sistema, '1', esc($conn, $fecha), !empty($diasPartial[$i]), $parcampo);
            $sql .= ", $expr as d{$i}";
        }

        $sql .= ", c.abr, c.logo
                 FROM jugadores j
                 LEFT JOIN v_cd_ulttar_so u ON (j.id = u.jugadorid)
                 JOIN clubs c ON (j.clubid = c.id)
                 WHERE j.categoriaid = $cid
                   AND j.torneoid = $tid
                   AND (" . ($rosterFilter ?: "$closedSTBGross > 0 OR $hasAnyCard") . ")
                   AND j.estatus = 'NORMAL'
                 ORDER BY $closedSTBGross DESC";

        // ===== Legacy ORDER BY (Stableford GROSS) =====
        // f_stl_gross DESC, muertesubita DESC, latest-card totstbgross DESC,
        // (c1+..+c5) DESC, (c1+..+c4) DESC, (c1+..+c3) DESC, c1 DESC,
        // f_score_dia_sox(diax) ASC
        $sql .= ", IFNULL(j.muertesubita, 0) DESC";
        // Legacy ordering: last round score, then countback c1..c5 (DESC for Stableford).
        $sql .= ", " . last_round_alias($dias) . " DESC";
        $sql .= countback_order('DESC');
        $sql .= front_countback_order('1');
    } else {
        $sql = "SELECT j.id AS jugadorid, j.numjugador,
                       CONCAT(j.nombre, ' ', j.apellido) as jugador, j.estatus,
                       $closedSA as sa,
                       $closedSO as so,
                       $closedRoundCount as closed_rounds,
                       IFNULL(j.muertesubita, 0) as muertesubita";

        foreach ($dias as $i => $fecha) {
            $expr = day_score_expr($sistema, '0', esc($conn, $fecha), !empty($diasPartial[$i]), $parcampo);
            $sql .= ", $expr as d{$i}";
        }

        $sql .= ", c.abr, c.logo
                 FROM jugadores j
                 LEFT JOIN v_cd_ulttar_sa u ON (j.id = u.jugadorid)
                 JOIN clubs c ON (j.clubid = c.id)
                 WHERE j.categoriaid = $cid
                   AND j.torneoid = $tid
                   AND (" . ($rosterFilter ?: "$closedSA > 0 OR $hasAnyCard") . ")
                   AND j.estatus = 'NORMAL'
                   AND j.campgross = 0
                 ORDER BY $closedSA DESC";

        // ===== Legacy ORDER BY (Stableford NETO) =====
        // f_torneosa DESC, muertesubita DESC, latest-card SA DESC,
        // (c1+..+c5) DESC, (c1+..+c4) DESC, (c1+..+c3) DESC, c1 DESC,
        // f_score_dia_sax(diax) ASC
        $sql .= ", IFNULL(j.muertesubita, 0) DESC";
        // Legacy ordering: last round score, then countback c1..c5 (DESC for Stableford).
        $sql .= ", " . last_round_alias($dias) . " DESC";
        $sql .= countback_order('DESC');
        $sql .= front_countback_order('0');
    }
}

debug_log_query('Main results query (' . $sistema . ', gross=' . $gross . ')', $sql);
$rows = query_all($conn, $sql);

$position = 0;
foreach ($rows as $row) {
    $position++;
    $player = [
        'position'  => $position,
        'playerId'  => $row['jugadorid'],
        'number'    => $row['numjugador'],
        'name'      => $row['jugador'],
        'club'      => $row['abr'],
        'clubLogo'  => $row['logo'] ? $LOGOS_BASE_URL . $row['logo'] : '',
        'total'     => $gross == '1' ? (int)$row['so'] : (int)$row['sa'],
        'totalSO'   => (int)($row['so'] ?? 0),
        'totalSA'   => (int)($row['sa'] ?? 0),
        // Number of CLOSED scorecards (statlsc=1) for this player on scheduled dates.
        // Frontend uses this to compute Stroke Play differential: total - parcampo * closedRounds.
        'closedRounds' => (int)($row['closed_rounds'] ?? 0)
    ];

    foreach ($dias as $i => $fecha) {
        $val = $row["d{$i}"] ?? null;
        // Partial rounds (no closed cards yet) always render as null → "—"
        // placeholder on the frontend. For scoring rounds, 0 historically
        // means "did not play this round" and is also rendered as a dash.
        $player["r{$i}"] = ($val !== null && $val != 0) ? (int)$val : null;
    }

    $players[] = $player;
}

// ============= Fetch non-NORMAL players (cut players: NO SHOW, RETIRO, DQ, etc.) =============
$cutPlayers = [];

/**
 * Build per-day score expressions for cut players using the same scoring
 * functions as the active leaderboard so that any closed scorecards
 * (statlsc = 1) for these players still show up below the cut line.
 *
 * IMPORTANT: We query the `tarjetas` table directly instead of using the
 * legacy f_score_dia_sax/sox functions. Those functions rely on internal
 * views (v_resultar) that filter by player.estatus and only include
 * NORMAL or CORTE players, which is why DQ / RETIRO / NO SHOW players
 * never showed per-round scores even when their scorecards were closed
 * (statlsc = 1). Reading from `tarjetas` directly bypasses that filter
 * and exposes any closed scorecard for non-NORMAL players.
 *
 * Column choice per scoring system:
 * - STABLEFORD + GROSS → totstbgross (stableford gross points)
 * - STABLEFORD + NETO  → SA          (stableford net points)
 * - STROKE     + GROSS → SO          (gross strokes)
 * - STROKE     + NETO  → SA          (net strokes)
 */
$cutDayCols = '';
foreach ($dias as $i => $fecha) {
    $fecEsc = esc($conn, $fecha);
    // Partial rounds (no closed cards yet) → no live data shown for cut
    // players either; force the subquery to return 0/null. Scoring rounds
    // keep the statlsc=1 filter (matches the leaderboard semantics).
    $statFilter = empty($diasPartial[$i]) ? "AND t.statlsc = 1" : "AND 1 = 0";
    if ($sistema === 'STABLEFORD' && $gross == '1') {
        // Stableford GROSS: raw stableford gross points
        $expr = "(SELECT IFNULL(SUM(t.totstbgross), 0)
                  FROM tarjetas t
                  WHERE t.jugadorid   = j.id
                    AND t.torneoid    = j.torneoid
                    AND DATE(t.fecha_juego) = '$fecEsc'
                    $statFilter)";
    } elseif ($sistema === 'STABLEFORD') {
        // Stableford NETO: SA points
        $expr = "(SELECT IFNULL(SUM(t.SA), 0)
                  FROM tarjetas t
                  WHERE t.jugadorid   = j.id
                    AND t.torneoid    = j.torneoid
                    AND DATE(t.fecha_juego) = '$fecEsc'
                    $statFilter)";
    } else {
        // Stroke Play: raw strokes (preserves prior cut-player semantics).
        // The leaderboard column shows diff-to-par for Stroke; cut players
        // historically showed raw strokes here. We keep that to avoid a
        // silent semantic change for closed-round cut data.
        $scoreCol = ($gross == '1') ? 't.SO' : 't.SA';
        $expr = "(SELECT IFNULL(SUM($scoreCol), 0)
                  FROM tarjetas t
                  WHERE t.jugadorid   = j.id
                    AND t.torneoid    = j.torneoid
                    AND DATE(t.fecha_juego) = '$fecEsc'
                    $statFilter)";
    }
    $cutDayCols .= ", $expr as d{$i}";
}

/**
 * Total expression for cut players: pick the same closed-card aggregate
 * used for the active leaderboard so a partially-played cut player still
 * shows their accumulated total.
 */
if ($sistema === 'STABLEFORD' && $gross == '1') {
    $cutTotalExpr = "$closedSTBGross as total_score";
} elseif ($gross == '1') {
    $cutTotalExpr = "$closedSO as total_score";
} else {
    $cutTotalExpr = "$closedSA as total_score";
}

$cutSql = "SELECT j.id AS jugadorid, j.numjugador,
                  CONCAT(j.nombre, ' ', j.apellido) as jugador, j.estatus,
                  $cutTotalExpr
                  , $closedRoundCount as closed_rounds
                  $cutDayCols,
                  c.abr, c.logo
           FROM jugadores j
           JOIN clubs c ON (j.clubid = c.id)
           WHERE j.categoriaid = $cid
             AND j.torneoid = $tid
             AND j.estatus != 'NORMAL'
           ORDER BY j.apellido ASC";

debug_log_query('Cut players query', $cutSql);
$cutRows = query_all($conn, $cutSql);

foreach ($cutRows as $row) {
    $statusCode = mapEstatus($row['estatus']);
    /** Extract per-round scores (null when round was not played) */
    $cutRounds = [];
    foreach ($dias as $i => $fecha) {
        $val = $row["d{$i}"] ?? null;
        // Same treatment as NORMAL: 0 / null → render as dash placeholder.
        $cutRounds["r{$i}"] = ($val !== null && $val != 0) ? (int)$val : null;
    }
    $cutTotal = isset($row['total_score']) ? (int)$row['total_score'] : 0;

    $cutPlayers[] = array_merge([
        'playerId'    => $row['jugadorid'],
        'number'      => $row['numjugador'],
        'name'        => $row['jugador'],
        'club'        => $row['abr'],
        'clubLogo'    => $row['logo'] ? $LOGOS_BASE_URL . $row['logo'] : '',
        'statusCode'  => $statusCode ?? 'D',
        'statusLabel' => statusLabel($statusCode ?? 'D'),
        'total'       => $cutTotal,
        'closedRounds' => (int)($row['closed_rounds'] ?? 0),
    ], $cutRounds);
}

/**
 * Orden de los jugadores debajo de la línea de corte (estatus != NORMAL):
 * se acomodan por el Total, sin importar el estatus.
 *  - STROKE PLAY → de menor a mayor (ASC)
 *  - STABLEFORD  → de mayor a menor (DESC)
 * Los que no tienen total (0 / sin tarjetas cerradas) siempre van al final.
 */
usort($cutPlayers, function ($a, $b) use ($sistema) {
    $ta = (int)($a['total'] ?? 0);
    $tb = (int)($b['total'] ?? 0);
    $ea = ($ta === 0) ? 1 : 0;   // sin score → al final
    $eb = ($tb === 0) ? 1 : 0;
    if ($ea !== $eb) return $ea - $eb;
    if ($ea === 1) return strcmp($a['name'], $b['name']);
    if ($ta === $tb) return strcmp($a['name'], $b['name']);
    return ($sistema === 'STABLEFORD') ? ($tb - $ta) : ($ta - $tb);
});

json_response([
    'categoryId'   => $catInfo['categoria_id'],
    'categoryName' => $catInfo['categoria'],
    'shortName'    => $catInfo['abreviatura'],
    'system'       => $catInfo['sistema'],
    'format'       => $catInfo['formato'],
    'gross'        => (int)$gross,
    'medalCount'   => $medalCount,
    'medalCountNeto'  => $medalCountNeto,
    'medalCountGross' => $medalCountGross,
    'course'       => $courseInfo ? [
        'rating'   => (float)($courseInfo['rating'] ?? 0),
        'slope'    => (int)($courseInfo['slope'] ?? 0),
        'tee'      => $courseInfo['tee'] ?? '',
        'par'      => (int)($courseInfo['parcampo'] ?? 72)
    ] : null,
    'days'         => array_values($dias),
    'daysPartial'  => array_values($diasPartial),
    'players'      => $players,
    'cutPlayers'   => $cutPlayers,
]);
