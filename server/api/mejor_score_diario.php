<?php
/**
 * Mejor Score Diario Endpoint
 * GET /api/mejor_score_diario.php?torneoid=XXX
 *
 * Replicates legacy report `mejor-score-diario.php`. For each (premio, fecha)
 * returned by `mejorscorep`, fetches winners from the legacy view
 * `v_mejorscorejugp`, joins to `categorias` to determine the scoring
 * formato so the frontend can split players into Stableford vs Stroke Play
 * within the same day section.
 *
 * Returns:
 *   [
 *     {
 *       premio: int,
 *       fecha: "YYYY-MM-DD",
 *       fechaLabel: "viernes, 24 de abril de 2026",
 *       stableford: [ { jugador, cat, score, clubLogo } ],
 *       strokePlay: [ { jugador, cat, score, clubLogo } ]
 *     }, ...
 *   ]
 */
require_once 'config.php';

$torneoid = require_param('torneoid');
$tid = esc($conn, $torneoid);

/** Spanish day/month labels (server-locale-independent) */
$DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
$MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

/**
 * Format a YYYY-MM-DD date as "viernes, 24 de abril de 2026"
 * Avoids reliance on setlocale / IntlDateFormatter which may not be
 * configured on shared hosting.
 */
function format_dia_es($iso) {
    global $DIAS, $MESES;
    $parts = explode('-', $iso);
    if (count($parts) !== 3) return $iso;
    [$y, $m, $d] = $parts;
    $ts = mktime(12, 0, 0, (int)$m, (int)$d, (int)$y);
    if ($ts === false) return $iso;
    $diaIdx = (int)date('w', $ts);
    $mesIdx = (int)$m - 1;
    return sprintf('%s, %d de %s de %d',
        $DIAS[$diaIdx] ?? '',
        (int)$d,
        $MESES[$mesIdx] ?? '',
        (int)$y
    );
}

/**
 * Algunas bases legacy no tienen el módulo de mejor score diario
 * (`mejorscorep` / `v_mejorscorejugp`). En ese caso se responde una lista
 * vacía en vez de un error 500.
 */
$hasTables = true;
foreach (['mejorscorep', 'v_mejorscorejugp'] as $t) {
    $rs = @$conn->query("SHOW TABLES LIKE '" . esc($conn, $t) . "'");
    if (!$rs || $rs->num_rows === 0) { $hasTables = false; }
    if ($rs) { $rs->free(); }
}
if (!$hasTables) { json_response([]); }

// 1) Distinct premio+fecha combinations from mejorscorep
$sql = "SELECT DISTINCT premio, fecha
        FROM mejorscorep
        WHERE torneoid = $tid
        ORDER BY fecha ASC, premio ASC";
$sections = query_all($conn, $sql);

$out = [];
foreach ($sections as $sec) {
    $premio = (int)$sec['premio'];
    $fecha = $sec['fecha'];
    $fechaEsc = esc($conn, $fecha);

    // 2) Per-section players, joined to categorias to detect Stableford vs Stroke Play.
    //    `formato` typically contains 'STABLEFORD' or 'STROKE PLAY'.
    //    Also LEFT JOIN `tarjetas` (matched by jugadorid + fecha) to pull the
    //    last-9 / last-6 / last-3 / last-1 hole sums used for tie-breaking,
    //    mirroring the criterion used in /resultados and /live (9-6-3-1).
    $sql = "SELECT v.id,
                   v.jugador,
                   v.abreviatura       AS cat,
                   ROUND(v.distancia,0) AS score,
                   v.logojug           AS clubLogo,
                   v.categoriaid,
                   COALESCE(c.sistema, '')  AS sistema,
                   COALESCE(c.formato, '')  AS formato,
                   -- Stroke (gross) back-nine partial sums
                   (COALESCE(t.h10,0)+COALESCE(t.h11,0)+COALESCE(t.h12,0)+COALESCE(t.h13,0)+COALESCE(t.h14,0)+COALESCE(t.h15,0)+COALESCE(t.h16,0)+COALESCE(t.h17,0)+COALESCE(t.h18,0)) AS back9_so,
                   (COALESCE(t.h13,0)+COALESCE(t.h14,0)+COALESCE(t.h15,0)+COALESCE(t.h16,0)+COALESCE(t.h17,0)+COALESCE(t.h18,0)) AS back6_so,
                   (COALESCE(t.h16,0)+COALESCE(t.h17,0)+COALESCE(t.h18,0)) AS back3_so,
                   COALESCE(t.h18,0) AS last_so,
                   -- Stableford / neto (h*_a) back-nine partial sums
                   (COALESCE(t.h10_a,0)+COALESCE(t.h11_a,0)+COALESCE(t.h12_a,0)+COALESCE(t.h13_a,0)+COALESCE(t.h14_a,0)+COALESCE(t.h15_a,0)+COALESCE(t.h16_a,0)+COALESCE(t.h17_a,0)+COALESCE(t.h18_a,0)) AS back9_sa,
                   (COALESCE(t.h13_a,0)+COALESCE(t.h14_a,0)+COALESCE(t.h15_a,0)+COALESCE(t.h16_a,0)+COALESCE(t.h17_a,0)+COALESCE(t.h18_a,0)) AS back6_sa,
                   (COALESCE(t.h16_a,0)+COALESCE(t.h17_a,0)+COALESCE(t.h18_a,0)) AS back3_sa,
                   COALESCE(t.h18_a,0) AS last_sa
            FROM v_mejorscorejugp v
            LEFT JOIN categorias c ON (c.categoria_id = v.categoriaid)
            LEFT JOIN tarjetas t ON (t.jugadorid = v.jugadorid AND t.fecha_juego = v.fecha)
            WHERE v.premio = $premio
              AND v.torneoid = $tid
              AND v.fecha = '$fechaEsc'
            ORDER BY v.categoriaid DESC";
    $rows = query_all($conn, $sql);

    $stableford = [];
    $strokePlay = [];
    foreach ($rows as $r) {
        // Categoria scoring system lives in `sistema` ('STABLEFORD' / 'STROKE PLAY' /
        // 'MATCH PLAY'). `formato` is the play format (Individual / Parejas / etc.)
        // and is checked as a safe fallback only.
        $sysStr = strtoupper(($r['sistema'] ?? '') . ' ' . ($r['formato'] ?? ''));
        $isStableford = strpos($sysStr, 'STABLEFORD') !== false;
        $player = [
            'jugador'  => $r['jugador'],
            'cat'      => $r['cat'],
            'score'    => (int)$r['score'],
            'clubLogo' => $r['clubLogo'],
            // Internal sort keys (not exposed to client, removed before output)
            '_categoriaid' => (int)$r['categoriaid'],
            '_b9'  => $isStableford ? (int)$r['back9_sa'] : (int)$r['back9_so'],
            '_b6'  => $isStableford ? (int)$r['back6_sa'] : (int)$r['back6_so'],
            '_b3'  => $isStableford ? (int)$r['back3_sa'] : (int)$r['back3_so'],
            '_b1'  => $isStableford ? (int)$r['last_sa']  : (int)$r['last_so'],
        ];
        if ($isStableford) {
            $stableford[] = $player;
        } else {
            $strokePlay[] = $player;
        }
    }

    /**
     * Sort comparator:
     *  1) categoriaid DESC (primary grouping inside each format block)
     *  2) score (Stableford: DESC = higher better; Stroke: ASC = lower better)
     *  3) Tie-break by last 9, 6, 3, 1 holes (9-6-3-1 rule)
     *     Stableford: higher partial wins; Stroke: lower partial wins.
     */
    $makeCmp = function (bool $isStableford) {
        return function ($a, $b) use ($isStableford) {
            if ($a['_categoriaid'] !== $b['_categoriaid']) {
                return $b['_categoriaid'] <=> $a['_categoriaid']; // DESC
            }
            if ($a['score'] !== $b['score']) {
                return $isStableford ? ($b['score'] <=> $a['score']) : ($a['score'] <=> $b['score']);
            }
            foreach (['_b9','_b6','_b3','_b1'] as $k) {
                if ($a[$k] !== $b[$k]) {
                    return $isStableford ? ($b[$k] <=> $a[$k]) : ($a[$k] <=> $b[$k]);
                }
            }
            return 0;
        };
    };
    usort($stableford, $makeCmp(true));
    usort($strokePlay, $makeCmp(false));

    // Strip internal sort keys before serialization
    $strip = function ($p) {
        unset($p['_categoriaid'], $p['_b9'], $p['_b6'], $p['_b3'], $p['_b1']);
        return $p;
    };
    $stableford = array_map($strip, $stableford);
    $strokePlay = array_map($strip, $strokePlay);

    $out[] = [
        'premio'     => $premio,
        'fecha'      => $fecha,
        'fechaLabel' => format_dia_es($fecha),
        'stableford' => $stableford,
        'strokePlay' => $strokePlay,
    ];
}

json_response($out);