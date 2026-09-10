<?php
/**
 * Competencias Master Endpoint
 * GET /api/competencias.php?torneoid=XXX
 * Returns available competition types based on existing data in DB tables
 *
 * Checks: premiosjug (O'Yes), approachjug (Approach), puttjug (Putt), Skeen_tarjetas (Skin Game)
 * Each type includes its groups (prizes) and player counts
 * 
 * Fixed: SQL join error on v_puttunico view - 2026-04-20
 * Note: separator change for cut applied previously - 2026-04-20
 *
 * Optional: ?tipo=oyes|approach|putt|skin - filter to a specific type
 * Optional: ?detalle=1 - include full player data for each group
 */
require_once 'config.php';

// Enable error reporting for debugging 500s
error_reporting(E_ALL);
ini_set('display_errors', '0'); // Don't display, capture instead
ini_set('log_errors', '1');

/**
 * Fatal error / exception safety net.
 * Guarantees the endpoint ALWAYS returns JSON, even on fatal errors
 * (parse errors, undefined functions, out of memory, uncaught exceptions).
 * In ?debug=1 mode, includes the error details in the `_debug` field.
 */
set_exception_handler(function ($e) {
    global $DEBUG_MODE;
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    $payload = ['error' => 'Unhandled exception in competencias.php'];
    if (!empty($DEBUG_MODE)) {
        $payload['_debug'] = [
            'type'    => get_class($e),
            'message' => $e->getMessage(),
            'file'    => $e->getFile(),
            'line'    => $e->getLine(),
            'trace'   => array_slice(explode("\n", $e->getTraceAsString()), 0, 15),
        ];
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
});

register_shutdown_function(function () {
    global $DEBUG_MODE;
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR], true)) {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        $payload = ['error' => 'Fatal error in competencias.php'];
        if (!empty($DEBUG_MODE)) {
            $payload['_debug'] = [
                'type'    => $err['type'],
                'message' => $err['message'],
                'file'    => $err['file'],
                'line'    => $err['line'],
            ];
        }
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    }
});

/** Safe query execution - returns false on failure instead of crashing */
function safe_exec($conn, $sql, $label = '') {
    $result = $conn->query($sql);
    if (!$result) {
        // Log but don't crash - UPDATE failures shouldn't kill the response
        error_log("competencias.php - $label failed: " . $conn->error . " | SQL: $sql");
        return false;
    }
    return $result;
}

/** Safe query_one - returns null on failure instead of dying */
function safe_query_one($conn, $sql) {
  //  debug_log_query('safe_query_one', $sql);
    $result = $conn->query($sql);
    if (!$result) {
        error_log("competencias.php - query failed: " . $conn->error . " | SQL: $sql");
        return null;
    }
    $row = $result->fetch_assoc();
    $result->free();
    return $row;
}

/** Safe query_all - returns empty array on failure instead of dying */
function safe_query_all($conn, $sql) {
    // debug_log_query('safe_query_all', $sql);
    $result = $conn->query($sql);
    if (!$result) {
        error_log("competencias.php - query failed: " . $conn->error . " | SQL: $sql");
        return [];
    }
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    $result->free();
    return $rows;
}

$torneoid = require_param('torneoid');
$tipo     = optional_param('tipo', '');
$detalle  = optional_param('detalle', '0');

$tid = esc($conn, $torneoid);
// // echo "/* Debug: Received request for torneoid=$tid, tipo='$tipo', detalle='$detalle' */\n";
error_log("competencias.php - Request received: torneoid=$tid, tipo='$tipo', detalle='$detalle'");

// Wrap the entire main flow in try/catch so any thrown error becomes JSON
try {
// ============= Get tournament config =============
$sql = "SELECT oyesnumprem FROM torneo WHERE torneo_id = $tid";
// // echo $sql;
$torneoInfo = safe_query_one($conn, $sql);
if (!$torneoInfo) {
    json_error("Tournament $torneoid not found", 404);
}
$numPrem = (int)($torneoInfo['oyesnumprem'] ?? 3);

$competencias = [];

/**
 * Debug accumulator (only emitted when ?debug=1).
 * Tracks per-section: row counts, executed SQL snippets, and query errors.
 * Helps diagnose why a competition type may be missing from the response
 * (e.g. SQL error from a missing column/function, or empty result set).
 */
$DEBUG_SECTIONS = [
    'oyes'     => ['enabled' => false, 'reason' => '', 'queries' => [], 'errors' => [], 'group_count' => 0],
    'approach' => ['enabled' => false, 'reason' => '', 'queries' => [], 'errors' => [], 'group_count' => 0],
    'putt'     => ['enabled' => false, 'reason' => '', 'queries' => [], 'errors' => [], 'group_count' => 0],
    'driverp'  => ['enabled' => false, 'reason' => '', 'queries' => [], 'errors' => [], 'group_count' => 0],
    'driverd'  => ['enabled' => false, 'reason' => '', 'queries' => [], 'errors' => [], 'group_count' => 0],
];

/**
 * Run a query and record diagnostics into $DEBUG_SECTIONS for the given section.
 * Returns rows array (empty on failure). Behaves like safe_query_all but with tracing.
 */
function dbg_query_all($conn, $sql, $section, $label) {
    global $DEBUG_SECTIONS;
    $result = $conn->query($sql);
    if (!$result) {
        $err = $conn->error;
        error_log("competencias.php - $section.$label failed: $err | SQL: $sql");
        $DEBUG_SECTIONS[$section]['errors'][] = ['label' => $label, 'error' => $err, 'sql' => $sql];
        return [];
    }
    $rows = [];
    while ($row = $result->fetch_assoc()) { $rows[] = $row; }
    $result->free();
    $DEBUG_SECTIONS[$section]['queries'][] = ['label' => $label, 'rows' => count($rows), 'sql' => $sql];
    return $rows;
}

/**
 * Run a query expecting a single row, with diagnostics. Returns null on failure or empty.
 */
function dbg_query_one($conn, $sql, $section, $label) {
    global $DEBUG_SECTIONS;
    $result = $conn->query($sql);
    if (!$result) {
        $err = $conn->error;
        error_log("competencias.php - $section.$label failed: $err | SQL: $sql");
        $DEBUG_SECTIONS[$section]['errors'][] = ['label' => $label, 'error' => $err, 'sql' => $sql];
        return null;
    }
    $row = $result->fetch_assoc();
    $result->free();
    $DEBUG_SECTIONS[$section]['queries'][] = ['label' => $label, 'rows' => $row ? 1 : 0, 'sql' => $sql];
    return $row;
}

// ============= O'Yes (Approach / Closest to Pin in a course hole. Not to be confused with approach, which is a single set approach separate from the course par 3's) =============
if ($tipo === '' || $tipo === 'oyes') {
    $DEBUG_SECTIONS['oyes']['enabled'] = true;
    $sql = "SELECT COUNT(DISTINCT premio) as cnt FROM premiosjug WHERE torneoid = $tid";
    $row = dbg_query_one($conn, $sql, 'oyes', 'count_distinct_premio');
    $DEBUG_SECTIONS['oyes']['count'] = (int)($row['cnt'] ?? 0);

    if ($row && (int)$row['cnt'] > 0) {
        // Mirror the legacy report query EXACTLY (do not filter by premiosjug
        // intersection — legacy code lists every active premio and then
        // joins to premiosjug + jugadores when fetching winners):
        //   SELECT premio, descripcion
        //   FROM premios
        //   WHERE torneoid = $tid AND premio > 0
        //   GROUP BY premio, descripcion
        // `hoyo` here = number of winners per prize (lugares), same convention
        // as approach/driver/driverp/putt. MAX() collapses any duplicate
        // (fecha,campo,categoria) rows for the same premio.
        $sql = "SELECT premio as id, TRIM(descripcion) as name, MAX(hoyo) as hoyo
                FROM premios
                WHERE torneoid = $tid
                  AND premio > 0
                GROUP BY premio, descripcion
                ORDER BY premio ASC";
        $prizes = dbg_query_all($conn, $sql, 'oyes', 'list_prizes_legacy');

        // Fallback: if the `premios` table is empty for this torneo,
        // build prize list from premiosjug so O'Yes is never silently dropped.
        if (empty($prizes)) {
            $sql = "SELECT pj.premio as id,
                           TRIM(pj.descripcion) as name,
                           MAX(pj.hoyo) as hoyo
                    FROM premiosjug pj
                    WHERE pj.torneoid = $tid
                    GROUP BY pj.premio, pj.descripcion
                    ORDER BY pj.premio ASC";
            $prizes = dbg_query_all($conn, $sql, 'oyes', 'list_prizes_fallback_premiosjug');
        }
        // Final fallback in PHP for any null/empty descriptions
        foreach ($prizes as &$pr) {
            if (empty($pr['name'])) {
                $pr['name'] = 'Premio ' . $pr['id'];
            }
        }
        unset($pr);
        $groups = [];
    } else {
        $DEBUG_SECTIONS['oyes']['reason'] = 'no rows in premiosjug for this torneoid';
        $prizes = [];
        $groups = [];
    }

    if (!empty($prizes)) {

        foreach ($prizes as $p) {
            $premioId = esc($conn, $p['id']);

            // Per-prize cut: use `lugares` from the premios row.
            // Falls back to torneo.oyesnumprem when lugares is null/0
            // (e.g. when the prize came from the premiosjug fallback list).
            $lugares = (int)($p['lugares'] ?? 0);
            if ($lugares <= 0) { $lugares = $numPrem; }

            // Count players using the SAME join logic as get_oyes_players()
            // (premios joined on fecha/campo/hoyo/categoriaid). The previous
            // count relied on `orden = 1`, but the orden flag is only set
            // inside get_oyes_players() — when the card list is fetched
            // without ?detalle=1 those UPDATEs never run, so the count
            // would always return 0. Capped by this prize's `lugares`.
            $sql = "SELECT COUNT(*) as cnt
                    FROM premiosjug a
                    JOIN jugadores j ON (a.jugadorid = j.id)
                    JOIN premios c ON (a.fecha = c.fecha AND a.campo = c.campo
                                       AND a.hoyo = c.hoyo AND j.categoriaid = c.categoriaid)
                    WHERE a.torneoid = $tid AND c.premio = $premioId";
            $countRow = safe_query_one($conn, $sql);
            $playerCount = min((int)($countRow['cnt'] ?? 0), $lugares);

            $group = [
                'id'          => 'oyes-' . $p['id'],
                'name'        => $p['name'],
                'shortName'   => $p['name'],
               # 'hoyo'        => (int)$p['hoyo'],
                'maxPlayers'  => $lugares,
                'playerCount' => $playerCount,
            ];


            // Include full player data if requested
            if ($detalle === '1') {
                // Use the per-prize lugares so the player list matches the card.
                $group['players'] = get_oyes_players($conn, $tid, $premioId, $lugares);
                $group['lastUpdated'] = get_oyes_last_updated($conn, $tid, $premioId);
                
            }

            $groups[] = $group;
        }
        
        $competencias[] = [
            'id'          => 'oyes',
            'name'        => "O'Yes",
            'shortName'   => "O'Yes",
            'description' => 'Approach - Más cerca de la bandera',
            'icon'        => 'target',
            'endpoint'    => 'oyes',
            'order'       => 1,
            'enabled'     => true,
            'groupCount'  => count($groups),
            'groups'      => $groups,
            'columns'     => [
                ['key' => 'position', 'label' => 'Po', 'align' => 'center', 'width' => '50px', 'format' => 'medal'],
                ['key' => 'clubLogo', 'label' => 'Club', 'align' => 'center', 'width' => '50px'],
                ['key' => 'name', 'label' => 'Jugador', 'align' => 'left'],
                ['key' => 'category', 'label' => 'Cat', 'align' => 'center', 'width' => '60px'],
                ['key' => 'hole', 'label' => 'Ho', 'align' => 'center', 'width' => '60px'],
                ['key' => 'distance', 'label' => 'Dist', 'align' => 'center', 'width' => '80px', 'format' => 'distance'],
            ],
        ];
    }
}


// ============= Approach, done in a single set approach separate from the course par 3's) =============
if ($tipo === '' || $tipo === 'approach') {
    $DEBUG_SECTIONS['approach']['enabled'] = true;
    $sql = "SELECT COUNT(DISTINCT premio) as cnt FROM approach WHERE torneoid = $tid AND premio > 0";
    $row = dbg_query_one($conn, $sql, 'approach', 'count_distinct_premio');
    $DEBUG_SECTIONS['approach']['count'] = (int)($row['cnt'] ?? 0);

    if ($row && (int)$row['cnt'] > 0) {
        // Get groups (premio, descripcion, hoyo). The f_ultfechaapproach() function
        // is OPTIONAL — if it doesn't exist on this DB the whole SELECT would fail,
        // so we fall back to a no-function variant on error.
        $sql = "SELECT premio as id, descripcion as name, hoyo,
                       LEFT(f_ultfechaapproach(descripcion, torneoid), 16) AS ultact
                FROM approach
                WHERE torneoid = $tid AND premio > 0
                GROUP BY premio, descripcion, hoyo
                ORDER BY premio ASC";
        $prizes = dbg_query_all($conn, $sql, 'approach', 'list_prizes_with_fn');
        if (empty($prizes) && !empty($DEBUG_SECTIONS['approach']['errors'])) {
            // Function may be missing — retry without it
            $sql = "SELECT premio as id, descripcion as name, hoyo, NULL AS ultact
                    FROM approach
                    WHERE torneoid = $tid AND premio > 0
                    GROUP BY premio, descripcion, hoyo
                    ORDER BY premio ASC";
            $prizes = dbg_query_all($conn, $sql, 'approach', 'list_prizes_no_fn');
        }

        $groups = [];
        foreach ($prizes as $p) {
            $premioId = esc($conn, $p['id']);
            $descripcion = esc($conn, $p['name']);
            $hoyo = (int)$p['hoyo'];

            $group = [
                'id'          => 'approach-' . $p['id'],
                'name'        => $p['name'],
                'shortName'   => $p['name'],
               # 'hoyo'        => $hoyo,
                'maxPlayers'  => $hoyo, // hoyo = number of slots
                'playerCount' => 0,
            ];

            if ($detalle === '1') {
                $group['players'] = get_approach_players($conn, $tid, $descripcion, $hoyo);
                $group['lastUpdated'] = $p['ultact'] ?? null;
            }

            // Count actual players returned
            if ($detalle === '1') {
                $group['playerCount'] = count($group['players']);
            } else {
                // Quick count without full data
                $sql2 = "SELECT COUNT(*) as cnt FROM approachjug WHERE torneoid = $tid AND premiosjugcol = '$descripcion'";
                $cntRow = safe_query_one($conn, $sql2);
                $group['playerCount'] = min((int)($cntRow['cnt'] ?? 0), $hoyo);
            }

            $groups[] = $group;
        }
        $DEBUG_SECTIONS['approach']['group_count'] = count($groups);

        if (count($groups) > 0) {
            $competencias[] = [
            'id'          => 'approach',
            'name'        => 'Approach',
            'shortName'   => 'Approach',
            'description' => 'Approach - Más cerca de la bandera',
            'icon'        => 'crosshair',
            'endpoint'    => 'approach',
            'order'       => 3,
            'enabled'     => true,
            'groupCount'  => count($groups),
            'groups'      => $groups,
            'columns'     => [
                ['key' => 'position', 'label' => 'Pos', 'align' => 'center', 'width' => '50px', 'format' => 'medal'],
                ['key' => 'clubLogo', 'label' => 'Club', 'align' => 'center', 'width' => '50px'],
                ['key' => 'name', 'label' => 'Jugador', 'align' => 'left'],
                ['key' => 'category', 'label' => 'Cat', 'align' => 'center', 'width' => '60px'],
                ['key' => 'distance', 'label' => 'Dist', 'align' => 'center', 'width' => '80px', 'format' => 'distance'],
            ],
            ];
        } else {
            $DEBUG_SECTIONS['approach']['reason'] = 'no groups built (prizes query empty or all filtered)';
        }
    } else {
        $DEBUG_SECTIONS['approach']['reason'] = 'no rows in approach with premio > 0';
    }
}
error_log("competencias.php - Completed Approach section, competencias count: " . count($competencias));


// ============= Putt =============
if ($tipo === '' || $tipo === 'putt') {
    $DEBUG_SECTIONS['putt']['enabled'] = true;
    // Prize catalog lives in `putt` (one row per prize). `puttjug` only holds
    // per-player submissions, so the list of prizes (and their `hoyo` =
    // "lugares") must come from `putt`.
    $sql = "SELECT COUNT(DISTINCT premio) as cnt FROM putt WHERE torneoid = $tid";
    $row = dbg_query_one($conn, $sql, 'putt', 'count_distinct_premio');
    $DEBUG_SECTIONS['putt']['count'] = (int)($row['cnt'] ?? 0);

    if ($row && (int)$row['cnt'] > 0) {
        // Pre-update marks (safe - won't crash on failure)
        safe_exec($conn, "UPDATE puttjug SET orden = 0 WHERE torneoid = $tid", 'putt reset orden');
        // Mark the best Putt per player WITHIN each configured prize group.
        // The legacy v_puttunico view groups only by tournament/player, which
        // can make Damas/Caballeros use the wrong best shot when the same
        // player has entries in multiple premio/descripcion groups.
        safe_exec($conn, "UPDATE puttjug a
                      JOIN (
                          SELECT torneoid, premio, premiosjugcol, jugadorid, MIN(distancia) as mindistancia
                          FROM puttjug
                          WHERE torneoid = $tid
                          GROUP BY torneoid, premio, premiosjugcol, jugadorid
                      ) b ON (a.torneoid = b.torneoid
                              AND a.premio = b.premio
                              AND a.premiosjugcol <=> b.premiosjugcol
                              AND a.jugadorid = b.jugadorid
                              AND a.distancia = b.mindistancia)
                      SET a.orden = 1
                      WHERE a.torneoid = $tid", 'putt set orden by prize group');

        // Pull each configured Putt prize from `putt`:
        //   - putt.descripcion -> displayed name and matching player group
        //   - putt.hoyo        -> per-prize winner slots ("lugares")
        // This keeps Damas/Caballeros and any other prize using its own cut.
        $sql = "SELECT p.premio as id,
                       TRIM(p.descripcion) as name,
                       MIN(NULLIF(p.hoyo, 0)) as lugares,
                       LEFT(f_ultfechaputt(p.descripcion, p.torneoid), 16) AS ultact
                FROM putt p
                WHERE p.torneoid = $tid AND p.premio > 0
                GROUP BY p.premio, p.descripcion
                ORDER BY p.premio ASC";
        $prizes = dbg_query_all($conn, $sql, 'putt', 'list_prizes_with_fn');
        if (empty($prizes)) {
            // Fallback if f_ultfechaputt() doesn't exist on this DB
            $sql = "SELECT p.premio as id,
                           TRIM(p.descripcion) as name,
                           MIN(NULLIF(p.hoyo, 0)) as lugares,
                           NULL AS ultact
                    FROM putt p
                    WHERE p.torneoid = $tid AND p.premio > 0
                    GROUP BY p.premio, p.descripcion
                    ORDER BY p.premio ASC";
            $prizes = dbg_query_all($conn, $sql, 'putt', 'list_prizes_no_fn');
        }
        if (empty($prizes)) {
            $sql = "SELECT DISTINCT pj.premio as id,
                           TRIM(pj.premiosjugcol) as name,
                           NULL as lugares,
                           NULL AS ultact
                    FROM puttjug pj
                    WHERE pj.torneoid = $tid
                    ORDER BY pj.premio ASC";
            $prizes = dbg_query_all($conn, $sql, 'putt', 'list_prizes_fallback_puttjug');
        }
        $groups = [];

        foreach ($prizes as $p) {
            $premioId = esc($conn, $p['id']);
            $descripcion = trim((string)($p['name'] ?? ''));
            $descripcionEsc = esc($conn, $descripcion);

            // Per-prize cut: use `lugares` from premios; fall back to oyesnumprem
            // when the prize is missing from the master table.
            $lugares = (int)($p['lugares'] ?? 0);
            if ($lugares <= 0) { $lugares = $numPrem; }

            // Count unique non-STK player ids for this Putt prize. Counting rows
            // from puttjug can overstate the cut when the same jugadorid has
            // multiple category rows or a duplicated STK entry.
            $sql = "SELECT COUNT(DISTINCT pj.jugadorid) as cnt
                    FROM puttjug pj
                    JOIN jugadores j ON (pj.jugadorid = j.id)
                    LEFT JOIN categorias cat ON (j.categoriaid = cat.categoria_id)
                    WHERE pj.torneoid = $tid
                      AND pj.premio = $premioId
                      AND pj.premiosjugcol = '$descripcionEsc'
                      AND UPPER(TRIM(COALESCE(cat.abreviatura, cat.categoria, ''))) NOT LIKE '%STK'";
            $countRow = safe_query_one($conn, $sql);
            $playerCount = min((int)($countRow['cnt'] ?? 0), $lugares);

            $group = [
                'id'          => 'putt-' . $p['id'],
                'name'        => $p['name'],
                'shortName'   => $p['name'],
              #  'hoyo'        => (int)$p['hoyo'],
                'maxPlayers'  => $lugares,
                'playerCount' => $playerCount,
            ];

            if ($detalle === '1') {
                // Cap the player list by THIS prize's `lugares` so the
                // displayed list matches the number shown on the card
                // (different prizes — e.g. Damas vs Caballeros — can have
                // different cut sizes).
                $group['players'] = get_putt_players($conn, $tid, $premioId, $descripcion, $lugares);
                $group['lastUpdated'] = $p['ultact'] ?? null;
            }

            $groups[] = $group;
        }
        $DEBUG_SECTIONS['putt']['group_count'] = count($groups);

        if (count($groups) > 0) {
            $competencias[] = [
            'id'          => 'putt',
            'name'        => 'Putt',
            'shortName'   => 'Putt',
            'description' => 'Competencia de Putt',
            'icon'        => 'target',
            'endpoint'    => 'putt',
            'order'       => 2,
            'enabled'     => true,
            'groupCount'  => count($groups),
            'groups'      => $groups,
            'columns'     => [
                ['key' => 'position', 'label' => 'Pos', 'align' => 'center', 'width' => '50px', 'format' => 'medal'],
                ['key' => 'clubLogo', 'label' => 'Club', 'align' => 'center', 'width' => '50px'],
                ['key' => 'name', 'label' => 'Jugador', 'align' => 'left'],
                ['key' => 'category', 'label' => 'Cat', 'align' => 'center', 'width' => '60px'],
                ['key' => 'distance', 'label' => 'Dist', 'align' => 'center', 'width' => '80px', 'format' => 'distance'],
            ],
            ];
        } else {
            $DEBUG_SECTIONS['putt']['reason'] = 'no groups built';
        }
    } else {
        $DEBUG_SECTIONS['putt']['reason'] = 'no rows in putt for this torneoid';
    }
}


// ============================================================================
// Driver Precisión
// ----------------------------------------------------------------------------
// Source table: `driverp` (one row per configured prize hole/description).
// Detection: any row with premio > 0 for this torneoid enables the section.
// Mirrors legacy SQL (driverp-4.php):
//   SELECT premio, descripcion, hoyo,
//          LEFT(f_ultfechadriverp(descripcion, torneoid), 16) AS ultact
//   FROM driverp
//   WHERE torneoid = $tid AND premio > 0
//   GROUP BY premio, descripcion, hoyo
//
// IMPORTANT: A single tournament can have MULTIPLE Driver Precisión prizes
// (e.g. one per hole / category split). Each (premio, descripcion, hoyo)
// row in `driverp` is its own card.
//
// Per-prize cut (winners shown) = `driverp.hoyo` (NOT premios.lugares — in
// the legacy schema `hoyo` is overloaded to mean "Lugares" for these side
// games). Falls back to torneo.oyesnumprem if 0/null.
// ============================================================================
if ($tipo === '' || $tipo === 'driverp') {
    $DEBUG_SECTIONS['driverp']['enabled'] = true;
    $sql = "SELECT COUNT(DISTINCT premio) as cnt FROM driverp WHERE torneoid = $tid AND premio > 0";
    $row = dbg_query_one($conn, $sql, 'driverp', 'count_distinct_premio');
    $DEBUG_SECTIONS['driverp']['count'] = (int)($row['cnt'] ?? 0);

    if ($row && (int)$row['cnt'] > 0) {
        // Try with optional last-update function first; fall back if missing.
        // EXACT legacy grouping: premio + descripcion + hoyo. This produces
        // one card per configured prize, supporting multiple prizes inside
        // the same competition type.
        $sql = "SELECT premio as id,
                       descripcion as name,
                       hoyo,
                       LEFT(f_ultfechadriverp(descripcion, torneoid), 16) AS ultact
                FROM driverp
                WHERE torneoid = $tid AND premio > 0
                GROUP BY premio, descripcion, hoyo
                ORDER BY premio ASC, descripcion ASC";
        $prizes = dbg_query_all($conn, $sql, 'driverp', 'list_prizes_with_fn');
        if (empty($prizes) && !empty($DEBUG_SECTIONS['driverp']['errors'])) {
            $sql = "SELECT premio as id,
                           descripcion as name,
                           hoyo,
                           NULL AS ultact
                    FROM driverp
                    WHERE torneoid = $tid AND premio > 0
                    GROUP BY premio, descripcion, hoyo
                    ORDER BY premio ASC, descripcion ASC";
            $prizes = dbg_query_all($conn, $sql, 'driverp', 'list_prizes_no_fn');
        }

        // Pre-process orden flags ONCE for the whole section (legacy does
        // this inside the per-prize loop, but the result is identical and
        // it's cheaper to run it a single time per request).
        safe_exec($conn, "UPDATE driverjugp AS a SET a.orden = 0 WHERE a.torneoid = $tid",
                  'driverp reset orden');
        safe_exec($conn, "UPDATE driverjugp AS a
                          JOIN v_driverunicop AS b ON (a.jugadorid = b.jugadorid
                                                      AND a.distancia = b.mindistancia
                                                      AND a.torneoid = $tid)
                          SET a.orden = 1", 'driverp set orden');

        $groups = [];
        foreach ($prizes as $p) {
            $premioId    = esc($conn, $p['id']);
            $descripcion = esc($conn, $p['name']);
            // Winners cut comes from driverp.hoyo (legacy "Lugares").
            $lugares     = (int)($p['hoyo'] ?? 0);
            if ($lugares <= 0) { $lugares = $numPrem; }

            $group = [
                // Composite id: premio + descripcion slug so each prize
                // (multiple per type) has a unique route key.
                'id'          => 'driverp-' . $p['id'] . '-' . preg_replace('/[^a-z0-9]+/i', '-', strtolower((string)$p['name'])),
                'name'        => $p['name'],
                'shortName'   => $p['name'],
                'maxPlayers'  => $lugares,
                'playerCount' => 0,
            ];

            if ($detalle === '1') {
                $group['players']     = get_driverp_players($conn, $tid, $premioId, $descripcion, $lugares);
                $group['playerCount'] = count($group['players']);
                $group['lastUpdated'] = $p['ultact'] ?? null;
            } else {
                // Best-effort count using same filter as get_driverp_players.
                $sql2 = "SELECT COUNT(DISTINCT a.jugadorid) as cnt
                         FROM driverjugp a
                         WHERE a.torneoid = $tid
                           AND a.premio = $premioId
                           AND a.premiosjugcol = '$descripcion'
                           AND a.orden = 1";
                $cntRow = safe_query_one($conn, $sql2);
                $group['playerCount'] = min((int)($cntRow['cnt'] ?? 0), $lugares);
            }

            $groups[] = $group;
        }
        $DEBUG_SECTIONS['driverp']['group_count'] = count($groups);

        if (count($groups) > 0) {
            $competencias[] = [
                'id'          => 'driverp',
                'name'        => 'Driver Precisión',
                'shortName'   => 'Driver Prec.',
                'description' => 'Driver más cercano a la línea central',
                'icon'        => 'crosshair',
                'endpoint'    => 'driverp',
                'order'       => 4,
                'enabled'     => true,
                'groupCount'  => count($groups),
                'groups'      => $groups,
                'columns'     => [
                    ['key' => 'position', 'label' => 'Pos', 'align' => 'center', 'width' => '50px', 'format' => 'medal'],
                    ['key' => 'clubLogo', 'label' => 'Club', 'align' => 'center', 'width' => '50px'],
                    ['key' => 'name', 'label' => 'Jugador', 'align' => 'left'],
                    ['key' => 'category', 'label' => 'Cat', 'align' => 'center', 'width' => '60px'],
                    ['key' => 'distance', 'label' => 'Dist', 'align' => 'center', 'width' => '80px', 'format' => 'distance'],
                ],
            ];
        } else {
            $DEBUG_SECTIONS['driverp']['reason'] = 'no groups built';
        }
    } else {
        $DEBUG_SECTIONS['driverp']['reason'] = 'no rows in driverp with premio > 0';
    }
}


// ============================================================================
// Driver Distancia
// ----------------------------------------------------------------------------
// Source tables: `driver` (one row per configured prize hole/description),
// `driverjug` (player shots), `v_driver` (prize/category/course matrix),
// and `jugadores` (player + club).
//
// Detection: any row with premio > 0 in `driver` for this torneoid.
//
// Mirrors legacy SQL (driver-5.php) EXACTLY:
//   SELECT premio, descripcion, hoyo,
//          LEFT(f_ultfechadriver(descripcion, torneoid), 16) AS ultact
//   FROM driver
//   WHERE torneoid = $tid AND premio > 0
//   GROUP BY premio, descripcion, hoyo
//
// Multiple Driver Distancia prizes per tournament are supported: each
// (premio, descripcion, hoyo) row in `driver` becomes its own card.
//
// Per-prize cut (winners shown) = `driver.hoyo` (legacy "Lugares").
// Falls back to torneo.oyesnumprem if 0/null.
// Sorted DESC (longest drive wins).
// ============================================================================
if ($tipo === '' || $tipo === 'driverd') {
    $DEBUG_SECTIONS['driverd']['enabled'] = true;
    $sql = "SELECT COUNT(DISTINCT premio) as cnt FROM driver WHERE torneoid = $tid AND premio > 0";
    $row = dbg_query_one($conn, $sql, 'driverd', 'count_distinct_premio');
    $DEBUG_SECTIONS['driverd']['count'] = (int)($row['cnt'] ?? 0);

    if ($row && (int)$row['cnt'] > 0) {
        // Try with optional last-update function first; fall back if missing.
        $sql = "SELECT premio as id,
                       descripcion as name,
                       hoyo,
                       LEFT(f_ultfechadriver(descripcion, torneoid), 16) AS ultact
                FROM driver
                WHERE torneoid = $tid AND premio > 0
                GROUP BY premio, descripcion, hoyo
                ORDER BY premio ASC, descripcion ASC";
        $prizes = dbg_query_all($conn, $sql, 'driverd', 'list_prizes_with_fn');
        if (empty($prizes) && !empty($DEBUG_SECTIONS['driverd']['errors'])) {
            $sql = "SELECT premio as id,
                           descripcion as name,
                           hoyo,
                           NULL AS ultact
                    FROM driver
                    WHERE torneoid = $tid AND premio > 0
                    GROUP BY premio, descripcion, hoyo
                    ORDER BY premio ASC, descripcion ASC";
            $prizes = dbg_query_all($conn, $sql, 'driverd', 'list_prizes_no_fn');
        }

        // Pre-process orden flags ONCE for the whole section (legacy does
        // this inside the per-prize loop; result is identical run once).
        safe_exec($conn, "UPDATE driverjug AS a SET a.orden = 0 WHERE a.torneoid = $tid",
                  'driverd reset orden');
        safe_exec($conn, "UPDATE driverjug AS a
                          JOIN v_driverunico AS b ON (a.jugadorid = b.jugadorid
                                                     AND a.distancia = b.mindistancia
                                                     AND a.torneoid = $tid)
                          SET a.orden = 1", 'driverd set orden');

        $groups = [];
        foreach ($prizes as $p) {
            $premioId    = esc($conn, $p['id']);
            $descripcion = esc($conn, $p['name']);
            // Winners cut comes from driver.hoyo (legacy "Lugares").
            $lugares     = (int)($p['hoyo'] ?? 0);
            if ($lugares <= 0) { $lugares = $numPrem; }

            $group = [
                // Composite id: premio + descripcion slug so each prize
                // (multiple per type) has a unique route key.
                'id'          => 'driverd-' . $p['id'] . '-' . preg_replace('/[^a-z0-9]+/i', '-', strtolower((string)$p['name'])),
                'name'        => $p['name'],
                'shortName'   => $p['name'],
                'maxPlayers'  => $lugares,
                'playerCount' => 0,
            ];

            if ($detalle === '1') {
                $group['players']     = get_driverd_players($conn, $tid, $premioId, $descripcion, $lugares);
                $group['playerCount'] = count($group['players']);
                $group['lastUpdated'] = $p['ultact'] ?? null;
            } else {
                $sql2 = "SELECT COUNT(DISTINCT a.jugadorid) as cnt
                         FROM driverjug a
                         WHERE a.torneoid = $tid
                           AND a.premio = $premioId
                           AND a.premiosjugcol = '$descripcion'
                           AND a.orden = 1";
                $cntRow = safe_query_one($conn, $sql2);
                $group['playerCount'] = min((int)($cntRow['cnt'] ?? 0), $lugares);
            }

            $groups[] = $group;
        }
        $DEBUG_SECTIONS['driverd']['group_count'] = count($groups);

        if (count($groups) > 0) {
            $competencias[] = [
                'id'          => 'driverd',
                'name'        => 'Driver Distancia',
                'shortName'   => 'Driver Dist.',
                'description' => 'Drive más largo',
                'icon'        => 'ruler',
                'endpoint'    => 'driverd',
                'order'       => 5,
                'enabled'     => true,
                'groupCount'  => count($groups),
                'groups'      => $groups,
                'columns'     => [
                    ['key' => 'position', 'label' => 'Pos', 'align' => 'center', 'width' => '50px', 'format' => 'medal'],
                    ['key' => 'clubLogo', 'label' => 'Club', 'align' => 'center', 'width' => '50px'],
                    ['key' => 'name', 'label' => 'Jugador', 'align' => 'left'],
                    ['key' => 'category', 'label' => 'Cat', 'align' => 'center', 'width' => '60px'],
                    ['key' => 'distance', 'label' => 'Dist', 'align' => 'center', 'width' => '100px', 'format' => 'distance'],
                ],
            ];
        } else {
            $DEBUG_SECTIONS['driverd']['reason'] = 'no groups built';
        }
    } else {
        $DEBUG_SECTIONS['driverd']['reason'] = 'no rows in driverjug for this torneoid';
    }
}


// ============= Skin Game =============
// if ($tipo === '' || $tipo === 'skin') {
//     $sql = "SELECT COUNT(DISTINCT a.categoria_id) as cnt 
//             FROM categorias a
//             JOIN caljuego c ON (a.categoria_id = c.categoriaid AND c.campo > 0 AND c.cierre = 1 AND c.skin = 1)
//             WHERE a.torneo_id = $tid AND a.estatus = 1 AND a.Skin_grupo_id > 0";
//     $row = safe_query_one($conn, $sql);
    
//     if ($row && (int)$row['cnt'] > 0) {
//         $conn->query("SET lc_time_names = 'es_ES'");

//         // Get available dates and groups
//         $sql = "SELECT DISTINCT fecha,
//                        DATE_FORMAT(fecha, '%W %e de %M') as fechaFormato
//                 FROM categorias a
//                 JOIN caljuego c ON (a.categoria_id = c.categoriaid AND c.campo > 0 AND c.cierre = 1 AND c.skin = 1)
//                 WHERE a.torneo_id = $tid AND a.estatus = 1 AND a.Skin_grupo_id > 0
//                 ORDER BY fecha";
//         $dateRows = safe_query_all($conn, $sql);

//         $groups = [];
//         foreach ($dateRows as $dr) {
//             $fec = esc($conn, $dr['fecha']);

//             $sql = "SELECT DISTINCT Skin_grupo_id
//                     FROM categorias a
//                     JOIN caljuego c ON (a.categoria_id = c.categoriaid AND c.campo > 0 AND c.cierre = 1 AND c.skin = 1)
//                     WHERE a.torneo_id = $tid AND a.estatus = 1 AND a.Skin_grupo_id > 0 AND c.fecha = '$fec'
//                     ORDER BY Skin_grupo_id";
//             $groupRows = safe_query_all($conn, $sql);

//             foreach ($groupRows as $gr) {
//                 $gid = (int)$gr['Skin_grupo_id'];
//                 $groups[] = [
//                     'id'          => "skin-{$dr['fecha']}-g{$gid}",
//                     'name'        => ucfirst($dr['fechaFormato']) . " - Grupo $gid",
//                     'shortName'   => "G$gid - " . $dr['fechaFormato'],
//                     'date'        => $dr['fecha'],
//                     'groupId'     => $gid,
//                     'maxPlayers'  => 18,
//                     'playerCount' => 0,
//                 ];
//             }
//         }

//         $competencias[] = [
//             'id'          => 'skin-game',
//             'name'        => 'Skin Game',
//             'shortName'   => 'Skin',
//             'description' => 'Competencia Skin Game por hoyo',
//             'icon'        => 'award',
//             'endpoint'    => 'skin_game',
//             'order'       => 40,
//             'enabled'     => true,
//             'groupCount'  => count($groups),
//             'groups'      => $groups,
//             'columns'     => [
//                 ['key' => 'hole', 'label' => 'Hoyo', 'align' => 'center', 'width' => '50px'],
//                 ['key' => 'clubLogo', 'label' => 'Club', 'align' => 'center', 'width' => '50px'],
//                 ['key' => 'name', 'label' => 'Jugador', 'align' => 'left'],
//                 ['key' => 'category', 'label' => 'Cat.', 'align' => 'center', 'width' => '60px'],
//                 ['key' => 'score', 'label' => 'Score', 'align' => 'center', 'width' => '60px', 'format' => 'number'],
//             ],
//         ];
//     }
// }

// ============================================================================
// O'Yes 300 (NEW — distinct from regular O'Yes)
// ----------------------------------------------------------------------------
// Source tables: `oyesx` (prize catalog) and `oyesxjug` (player results).
// Each row in `oyesx` defines ONE hole-group:
//   - `hoyo`   = HOLE NUMBER (e.g. 1, 4, 11) — used to identify the hole
//                and to filter `oyesxjug` rows for that group's table.
//   - `premio` = NUMBER OF WINNERS / "Lugares" displayed for that hole.
// Winners are ABSOLUTE (across all players, no category filter), sorted
// by distance ASC (closest to pin). Multiple winners allowed per hole.
//
// Coexists with /api/oyesx.php which reads the same tables but filters by
// description containing 'driver' / 'precision' / 'approach'. Here we
// EXCLUDE those keywords so we only return true O'Yes 300 prizes.
// ============================================================================
if ($tipo === '' || $tipo === 'oyes300') {
    $DEBUG_SECTIONS['oyes300'] = ['enabled' => true, 'reason' => '', 'queries' => [], 'errors' => [], 'group_count' => 0];

    $excludeFilter = " AND LOWER(descripcion) NOT LIKE '%driver%'
                       AND LOWER(descripcion) NOT LIKE '%precision%'
                       AND LOWER(descripcion) NOT LIKE '%approach%' ";

    // Count distinct prizes available. In `oyesx`:
    //   - `premio` = internal prize id (matches `oyesxjug.premio`)
    //   - `hoyo`   = number of winners (lugares) for that prize
    //   - `descripcion` = title shown to users (real hole # is embedded here)
    $sql = "SELECT COUNT(DISTINCT premio) as cnt
            FROM oyesx
            WHERE torneoid = $tid AND premio > 0 $excludeFilter";
    $row = dbg_query_one($conn, $sql, 'oyes300', 'count_distinct_premio');
    $DEBUG_SECTIONS['oyes300']['count'] = (int)($row['cnt'] ?? 0);

    if ($row && (int)$row['cnt'] > 0) {
        // List groups — one per prize. Mapping confirmed by the user:
        //   oyesx.premio => internal prize id (join key for oyesxjug.premio)
        //   oyesx.hoyo   => number of winners (lugares / LIMIT)
        //   descripcion  => human title; real hole number is embedded inside.
        $sql = "SELECT premio as prize_id,
                       MAX(hoyo) as lugares,
                       TRIM(MAX(descripcion)) as descripcion
                FROM oyesx
                WHERE torneoid = $tid AND premio > 0 $excludeFilter
                GROUP BY premio
                ORDER BY premio ASC";
        $prizes = dbg_query_all($conn, $sql, 'oyes300', 'list_prizes');

        $groups = [];
        foreach ($prizes as $p) {
            // Field mapping (confirmed):
            //   oyesx.premio  -> internal prize id (filters oyesxjug.premio)
            //   oyesx.hoyo    -> number of winners for this prize (lugares)
            //   descripcion   -> real hole number is the LAST integer here
            $prizeId  = (int)$p['prize_id'];
            $descRaw  = (string)($p['descripcion'] ?? '');
            $holeNum  = 0;
            if (preg_match_all('/\d+/', $descRaw, $m) && !empty($m[0])) {
                $holeNum = (int)end($m[0]); // last number in the text
            }
            $lugares = (int)($p['lugares'] ?? 0);
            if ($lugares <= 0) { $lugares = $numPrem; }
            $prizeIdEsc  = esc($conn, $prizeId);   // filters oyesxjug.premio
            $descripcion = $descRaw !== '' ? $descRaw : ('Hoyo ' . $holeNum);

            // Count results for THIS prize.
            // Según el torneo, `oyesxjug` guarda el premio en `premio` o el
            // número de hoyo en `hoyo`. Se prueba `premio` y, si no hay
            // resultados, se cae a `hoyo` para no mostrar grupos vacíos.
            $filterEq = "premio = $prizeIdEsc";
            $sql2 = "SELECT COUNT(*) as cnt
                     FROM oyesxjug
                     WHERE torneoid = $tid AND $filterEq";
            $cntRow = dbg_query_one($conn, $sql2, 'oyes300', "count_prize_$prizeId");
            $cntVal = (int)($cntRow['cnt'] ?? 0);
            if ($cntVal === 0 && $holeNum > 0) {
                $altFilter = "hoyo = " . (int)$holeNum;
                $altRow = dbg_query_one($conn,
                    "SELECT COUNT(*) as cnt FROM oyesxjug WHERE torneoid = $tid AND $altFilter",
                    'oyes300', "count_hole_$holeNum");
                if ((int)($altRow['cnt'] ?? 0) > 0) {
                    $cntVal = (int)$altRow['cnt'];
                    $filterEq = $altFilter;
                }
            }
            $playerCount = min($cntVal, $lugares);
            // Also log distinct premio values present in oyesxjug for this tournament
            // so we can see what the column actually contains (one-time per request).
            if (!isset($DEBUG_SECTIONS['oyes300']['distinct_premio_logged'])) {
                dbg_query_all($conn, "SELECT DISTINCT premio, COUNT(*) as n FROM oyesxjug WHERE torneoid = $tid GROUP BY premio ORDER BY premio",
                              'oyes300', 'distinct_premio_in_oyesxjug');
                $DEBUG_SECTIONS['oyes300']['distinct_premio_logged'] = true;
            }

            $group = [
                'id'          => 'oyes300-' . $prizeId,
                'name'        => $descripcion,
                'shortName'   => $descripcion,
                // Use the full prize title as description so the card header
                // shows e.g. "Mejor Oyes General... Hoyo 17" instead of just
                // "Hoyo X". The hole chip below still shows the hole number.
                'description' => $descripcion,
                'hoyo'        => $holeNum,
                'maxPlayers'  => $lugares,
                'playerCount' => $playerCount,
            ];

            if ($detalle === '1') {
                // Pass the internal prize id ($prizeId) — that's what the
                // results table uses for filtering.
                $group['players']     = get_oyes300_players($conn, $tid, $prizeId, $lugares, $filterEq);
                $group['lastUpdated'] = get_oyes300_last_updated($conn, $tid, $descripcion, $prizeIdEsc);
            }

            $groups[] = $group;
        }
        $DEBUG_SECTIONS['oyes300']['group_count'] = count($groups);

        if (count($groups) > 0) {
            $competencias[] = [
                'id'          => 'oyes300',
                'name'        => "O'Yes X",
                'shortName'   => "O'Yes X",
                'description' => "",
                'icon'        => 'target',
                'endpoint'    => 'oyes300',
                'order'       => 8,
                'enabled'     => true,
                'groupCount'  => count($groups),
                'groups'      => $groups,
                'columns'     => [
                    ['key' => 'position', 'label' => 'Po', 'align' => 'center', 'width' => '50px', 'format' => 'medal'],
                    ['key' => 'clubLogo', 'label' => 'Club', 'align' => 'center', 'width' => '50px'],
                    ['key' => 'name', 'label' => 'Jugador', 'align' => 'left'],
                    ['key' => 'category', 'label' => 'Cat', 'align' => 'center', 'width' => '70px'],
                    // O'Yes X shows 3-decimal precision (mm-level) for closest-to-pin distances.
                    ['key' => 'distance', 'label' => 'Dist', 'align' => 'center', 'width' => '80px', 'format' => 'distance3'],
                ],
            ];
        } else {
            $DEBUG_SECTIONS['oyes300']['reason'] = 'no groups built';
        }
    } else {
        $DEBUG_SECTIONS['oyes300']['reason'] = 'no rows in oyesx with premio > 0 (excluding driver/precision/approach)';
    }
}
error_log("competencias.php - Completed O'Yes 300 section, competencias count: " . count($competencias));

// ============= Putt Finales (Brackets por sexo) =============
/**
 * Inyecta hasta dos pseudo-competencias para los brackets putt-finales
 * (M y F) cuando estén configuradas Y marcadas visible=1 en bracket_config.
 *
 * Cada una se modela como una competencia con un único grupo cuyo `bracketSexo`
 * indica al frontend qué bracket pedir a /api/brackets.php. La tabla de
 * jugadores queda vacía; el render real es <BracketView sexo="M"|"F" />.
 *
 * Sólo se considera 'putt' o '' como tipo (mismo gating que el resto).
 */
if ($tipo === '' || $tipo === 'putt' || $tipo === 'putt_finales') {
    $sqlFinales = "SELECT prize_id, sexo, bracket_size AS size, visible, status
                   FROM bracket_config
                   WHERE torneoid = $tid AND prize_table = 'putt_finales' AND visible = 1
                   ORDER BY prize_id ASC";
    $finalesRows = safe_query_all($conn, $sqlFinales);
    /**
     * Modo bracket ÚNICO: si existe un bracket unificado visible (sexo 'A',
     * prize_id 3) se publica SOLO ese, con la etiqueta "Putt Finales", y se
     * ignoran los brackets por sexo para no duplicar la competición.
     */
    $hasUnified = false;
    foreach ($finalesRows as $fr) {
        if (strtoupper((string)$fr['sexo']) === 'A' || (int)$fr['prize_id'] === 3) { $hasUnified = true; break; }
    }
    if ($hasUnified) {
        $finalesRows = array_values(array_filter($finalesRows, function ($fr) {
            return strtoupper((string)$fr['sexo']) === 'A' || (int)$fr['prize_id'] === 3;
        }));
    }
    foreach ($finalesRows as $idx => $fr) {
        $rawSx    = strtoupper((string)$fr['sexo']);
        $sx       = in_array($rawSx, ['F', 'A'], true) ? $rawSx : 'M';
        if ((int)$fr['prize_id'] === 3) $sx = 'A';
        $idSuffix = $sx === 'M' ? 'm' : ($sx === 'F' ? 'f' : 'a');
        $label    = $sx === 'A'
            ? 'Putt Finales'
            : ($sx === 'M' ? 'Putt Finales Caballero' : 'Putt Finales Dama');
        $competencias[] = [
            'id'          => 'putt-finales-' . $idSuffix,
            'name'        => $label,
            'shortName'   => $label,
            'description' => 'Match-Play final — sembrado desde ranking acumulado de putt',
            'icon'        => 'trophy',
            'endpoint'    => 'putt_finales',
            'order'       => 50 + $idx, // al final del listado
            'enabled'     => true,
            'groupCount'  => 1,
            'groups'      => [[
                'id'          => 'putt-finales-' . $idSuffix . '-bracket',
                'name'        => $label,
                'shortName'   => $label,
                'maxPlayers'  => (int)$fr['size'],
                'playerCount' => (int)$fr['size'],
                // El frontend usa bracketSexo para renderizar BracketView en
                // lugar de la tabla estándar de competencias.
                'bracketSexo' => $sx,
            ]],
            'columns'     => [], // no aplica — se renderiza un bracket
        ];
    }
    error_log("competencias.php - Putt Finales injected: " . count($finalesRows));
}

// Sort by order
usort($competencias, function($a, $b) {
    return $a['order'] - $b['order'];
});

/**
 * Final response.
 * In ?debug=1 mode we wrap the array inside an object so we can attach
 * a `_debug` payload describing what each section did. The frontend treats
 * the response as an array of competencias, so debug mode is intended for
 * manual curl/browser inspection only — DO NOT enable in normal traffic.
 */
if (!empty($DEBUG_MODE)) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'competencias' => $competencias,
        '_debug' => [
            'torneoid'     => (int)$tid,
            'tipo_filter'  => $tipo,
            'detalle'      => $detalle,
            'numPrem'      => $numPrem,
            'returned'     => count($competencias),
            'returned_ids' => array_map(fn($c) => $c['id'], $competencias),
            'sections'     => $DEBUG_SECTIONS,
        ],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
json_response($competencias);

} catch (\Throwable $e) {
    // Caught by the main try: return JSON with details in debug mode
    global $DEBUG_MODE;
    http_response_code(500);
    $payload = ['error' => 'competencias.php threw an exception'];
    if (!empty($DEBUG_MODE)) {
        $payload['_debug'] = [
            'type'    => get_class($e),
            'message' => $e->getMessage(),
            'file'    => $e->getFile(),
            'line'    => $e->getLine(),
            'trace'   => array_slice(explode("\n", $e->getTraceAsString()), 0, 15),
        ];
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

// ============= Helper Functions =============

/** Get O'Yes players for a prize group */
function get_oyes_players($conn, $tid, $premioId, $numPrem) {
    global $LOGOS_BASE_URL;
    
    // Pre-update (safe - won't crash on failure)
    safe_exec($conn, "UPDATE premiosjug SET orden = 0 WHERE torneoid = $tid", 'oyes reset orden');
    safe_exec($conn, "UPDATE premiosjug a
                  JOIN v_oyesunicas b ON (a.jugadorid = b.jugadorid AND a.torneoid = b.torneoid)
                  SET a.orden = 1
                  WHERE a.torneoid = $tid", 'oyes set orden');


    // Legacy winner query — joins premios on (fecha, campo, hoyo, categoriaid)
    // so a player only counts for the premio that matches THEIR category and
    // the hole/course where the shot was recorded.
    $sql = "SELECT a.jugadorid,
                   CONCAT(j.nombre, ' ', j.apellido) as jugador,
                   ROUND(TRUNCATE(a.distancia, 3), 2) as distancia,
                   a.hoyo,
                   COALESCE(cat.abreviatura, cat.categoria, '') as categoria,
                   cl.logo, cl.nombre as club
            FROM premiosjug a
            JOIN jugadores j ON (a.jugadorid = j.id AND a.orden = 1)
            JOIN clubs cl ON (j.clubid = cl.id)
            LEFT JOIN categorias cat ON (j.categoriaid = cat.categoria_id)
            JOIN premios c ON (a.fecha = c.fecha AND a.campo = c.campo
                               AND a.hoyo = c.hoyo AND j.categoriaid = c.categoriaid)
            WHERE a.torneoid = $tid AND c.premio = $premioId
            ORDER BY c.premio, a.distancia ASC
            LIMIT $numPrem";

    $winners = safe_query_all($conn, $sql);

    $players = [];
    $pos = 0;
    foreach ($winners as $w) {
        $pos++;
        $players[] = [
            'id'        => (string)$w['jugadorid'],
            'position'  => $pos,
            'name'      => $w['jugador'],
            'hole'      => (int)$w['hoyo'],
            'distance'  => (float)$w['distancia'],
            'category'  => $w['categoria'] ?? '',
            'club'      => $w['club'],
            'clubLogo'  => $w['logo'] ? $LOGOS_BASE_URL . $w['logo'] : '',
        ];
    }
    return $players;
}

/** Get O'Yes last updated timestamp */
function get_oyes_last_updated($conn, $tid, $premioId) {
    $sql = "SELECT f_ultact($tid, $premioId) as lastUpdated";
    $row = safe_query_one($conn, $sql);
    return $row['lastUpdated'] ?? null;
}

/**
 * Get Driver Precisión players for a prize group.
 * Reads `driverjugp` joined to `v_driverp`; lower distance wins.
 */
function get_driverp_players($conn, $tid, $premioId, $descripcion, $limit = 3) {
    global $LOGOS_BASE_URL;
    $limit = max(1, (int)$limit);

    $sql = "SELECT a.jugadorid,
                   a.hoyo,
                   ROUND(TRUNCATE(a.distancia, 3), 2) as distancia,
                   CONCAT(b.nombre, ' ', b.apellido) as jugador,
                   cl.nombre as club, cl.logo as logo,
                   COALESCE(cat.abreviatura, cat.categoria, '') as categoria,
                   c.descripcion
            FROM driverjugp a
            JOIN jugadores b ON (a.jugadorid = b.id)
            JOIN clubs cl ON (b.clubid = cl.id)
            LEFT JOIN categorias cat ON (b.categoriaid = cat.categoria_id)
            JOIN v_driverp c ON (a.campo = c.campo
                                 AND b.categoriaid = c.categoriaid
                                 AND a.premiosjugcol = c.descripcion)
            WHERE a.torneoid = $tid AND c.descripcion = '$descripcion'
            ORDER BY c.descripcion, a.distancia ASC
            LIMIT $limit";

    $winners = safe_query_all($conn, $sql);

    $players = [];
    $pos = 0;
    foreach ($winners as $w) {
        $pos++;
        $players[] = [
            'id'        => (string)$w['jugadorid'],
            'position'  => $pos,
            'name'      => $w['jugador'],
            'hole'      => (int)($w['hoyo'] ?? 0),
            'distance'  => (float)$w['distancia'],
            'category'  => $w['categoria'] ?? '',
            'club'      => $w['club'] ?? '',
            'clubLogo'  => $w['logo'] ? $LOGOS_BASE_URL . $w['logo'] : '',
        ];
    }
    return $players;
}

/**
 * Get Driver Distancia players for a prize group.
 * Reads `driverjug` joined to `v_driver`; higher distance wins.
 */
function get_driverd_players($conn, $tid, $premioId, $descripcion, $limit = 3) {
    global $LOGOS_BASE_URL;
    $limit = max(1, (int)$limit);

    $sql = "SELECT a.jugadorid,
                   a.fecha, a.campo, a.hoyo,
                   ROUND(TRUNCATE(a.distancia, 3), 2) as distancia,
                   CONCAT(b.nombre, ' ', b.apellido) as jugador,
                   cl.nombre as club, cl.logo as logo,
                   COALESCE(cat.abreviatura, cat.categoria, '') as categoria,
                   b.categoriaid, c.descripcion
            FROM driverjug a
            JOIN jugadores b ON (a.jugadorid = b.id)
            JOIN clubs cl ON (b.clubid = cl.id)
            LEFT JOIN categorias cat ON (b.categoriaid = cat.categoria_id)
            JOIN v_driver c ON (a.campo = c.campo
                                AND b.categoriaid = c.categoriaid
                                AND a.premiosjugcol = c.descripcion)
            WHERE a.torneoid = $tid AND c.descripcion = '$descripcion'
            ORDER BY c.descripcion, a.distancia DESC
            LIMIT $limit";

    $winners = safe_query_all($conn, $sql);

    $players = [];
    $pos = 0;
    foreach ($winners as $w) {
        $pos++;
        $players[] = [
            'id'        => (string)$w['jugadorid'],
            'position'  => $pos,
            'name'      => $w['jugador'],
            'hole'      => (int)($w['hoyo'] ?? 0),
            'distance'  => (float)$w['distancia'],
            'category'  => $w['categoria'] ?? '',
            'club'      => $w['club'] ?? '',
            'clubLogo'  => $w['logo'] ? $LOGOS_BASE_URL . $w['logo'] : '',
        ];
    }
    return $players;
}

/**
 * Get Putt players for a prize group, capped by the number of available spots ("lugares").
 *
 * @param mysqli $conn      Database connection.
 * @param int    $tid       Active tournament id.
 * @param int    $premioId  Prize id within puttjug.
 * @param string $descripcion Configured prize description used to separate
 *                            groups like Damas/Caballeros under same premio.
 * @param int    $limit     Max number of players to return (defaults to 3).
 *                          Comes from torneo.oyesnumprem and matches the
 *                          card's `playerCount`/`maxPlayers` so the rendered
 *                          list never exceeds the displayed cut value.
 */
function get_putt_players($conn, $tid, $premioId, $descripcion, $limit = 3) {
    global $LOGOS_BASE_URL;

    // Defensive: ensure a sane positive integer LIMIT
    $limit = max(1, (int)$limit);
    $descripcionEsc = esc($conn, $descripcion);

    // De-dup estrictamente por jugadorid: la subconsulta devuelve una sola
    // fila por jugador con su mejor distancia. Además se excluyen categorías
    // que terminan en STK para evitar duplicados visibles B / B STK cuando el
    // origen trae registros paralelos para el mismo competidor.
    $sql = "SELECT best.jugadorid,
                   CONCAT(j.nombre, ' ', j.apellido) as jugador,
                   best.distancia,
                   COALESCE(cat.abreviatura, cat.categoria, '') as categoria,
                   c.logo as logo,
                   c.nombre as club
            FROM (
                SELECT pj.jugadorid, MIN(pj.distancia) as distancia
                FROM puttjug pj
                JOIN jugadores j2 ON (pj.jugadorid = j2.id)
                LEFT JOIN categorias cat2 ON (j2.categoriaid = cat2.categoria_id)
                WHERE pj.torneoid = $tid
                  AND pj.premio = $premioId
                  AND pj.premiosjugcol = '$descripcionEsc'
                  AND UPPER(TRIM(COALESCE(cat2.abreviatura, cat2.categoria, ''))) NOT LIKE '%STK'
                GROUP BY pj.jugadorid
            ) best
            JOIN jugadores j ON (best.jugadorid = j.id)
            JOIN clubs c ON (j.clubid = c.id)
            LEFT JOIN categorias cat ON (j.categoriaid = cat.categoria_id)
            ORDER BY best.distancia ASC, jugador ASC
            LIMIT $limit";


    $winners = safe_query_all($conn, $sql);

    $players = [];
    $pos = 0;

    foreach ($winners as $w) {
        $pos++;
        $players[] = [
            'id'        => (string)$w['jugadorid'],
            'position'  => $pos,
            'name'      => $w['jugador'],
            'distance'  => (float)$w['distancia'],
            'category'  => $w['categoria'] ?? '',
            'club'      => $w['club'],
            'clubLogo'  => $w['logo'] ? $LOGOS_BASE_URL . $w['logo'] : '',
        ];
        
    }
    return $players;
}

/** Get Putt last updated timestamp */
function get_putt_last_updated($conn, $tid, $premio) {
    $sql = "SELECT f_ultfechaputt($premio,$tid) as lastUpdated";
    $row = safe_query_one($conn, $sql);
    return $row['lastUpdated'] ?? null;
}

/** Get Approach players for a prize group */
function get_approach_players($conn, $tid, $descripcion, $limit) {
    global $LOGOS_BASE_URL;

    // Pre-update: reset orden and mark unique best distances
    safe_exec($conn, "UPDATE approachjug SET orden = 0 WHERE torneoid = $tid", 'approach reset orden');
    safe_exec($conn, "UPDATE approachjug a
                  JOIN v_approachunico b ON (a.jugadorid = b.jugadorid AND a.distancia = b.mindistancia AND a.torneoid = $tid)
                  SET a.orden = 1", 'approach set orden');

    // Fetch players joined with v_approach for category matching
    $sql = "SELECT a.id, a.fecha, a.campo, a.hoyo, a.jugadorid,
                   ROUND(TRUNCATE(a.distancia, 3), 2) as distancia,
                   CONCAT(b.nombre, ' ', b.apellido) as jugador,
                   cl.nombre as club, b.categoriaid,
                   COALESCE(cat.abreviatura, cat.categoria, '') as categoria,
                   c.descripcion,
                   cl.logo as logo
            FROM approachjug a
            JOIN jugadores b ON (a.jugadorid = b.id)
            JOIN clubs cl ON (b.clubid = cl.id)
            LEFT JOIN categorias cat ON (b.categoriaid = cat.categoria_id)
            JOIN v_approach c ON (a.campo = c.campo AND b.categoriaid = c.categoriaid AND a.premiosjugcol = c.descripcion)
            WHERE a.torneoid = $tid AND c.descripcion = '$descripcion'
            ORDER BY c.descripcion, a.distancia ASC
            LIMIT $limit";

    $winners = safe_query_all($conn, $sql);

    $players = [];
    $pos = 0;
    foreach ($winners as $w) {
        $pos++;
        $logoPath = $w['logo'] ?? '';
        $players[] = [
            'id'        => (string)$w['jugadorid'],
            'position'  => $pos,
            'name'      => $w['jugador'],
            'distance'  => (float)$w['distancia'],
            'category'  => $w['categoria'] ?? '',
            'club'      => $w['club'] ?? '',
            'clubLogo'  => $logoPath ? $LOGOS_BASE_URL . $logoPath : '',
        ];
    }
    return $players;
}

// End of competencias.php - Fixed SQL join error 2026-04-20

/**
 * Get O'Yes 300 winners for a HOLE group.
 *
 * Reads `oyesxjug` (results) filtered by hole number and joins jugadores +
 * clubs (+ categoria for display). Picks ABSOLUTE winners across ALL players
 * with no category filter — sort by distance ASC (closest to pin). Capped
 * to $limit ("lugares" = oyesx.premio for this hole).
 *
 * @param mysqli $conn     Active MySQLi connection
 * @param int    $tid      Tournament id (already escaped)
 * @param int    $holeNum  Hole number (oyesx.hoyo / oyesxjug.hoyo)
 * @param int    $limit    Maximum winners to return (oyesx.premio)
 * @return array<int, array<string, mixed>> Ordered list of winners
 */
function get_oyes300_players($conn, $tid, $holeNum, $limit = 3, $filterEq = null) {
    global $LOGOS_BASE_URL;
    $limit  = max(1, (int)$limit);
    $hole   = (int)$holeNum;
    /** Filtro efectivo: `premio` o, si ese no trae datos, `hoyo`. */
    $where = $filterEq ? "a." . $filterEq : "a.premio = $hole";

    // NOTE: For O'Yes 300, the hole id lives in `oyesxjug.premio` (not `hoyo`,
    // which is empty for this competition). The `categorias` table uses
    // `categoria` for the label and `categoria_id` as the join key.
    $sql = "SELECT a.jugadorid,
                   CONCAT(j.nombre, ' ', j.apellido) as jugador,
                   ROUND(a.distancia, 3) as distancia,
                   COALESCE(NULLIF(a.hoyo, 0), a.premio) as hoyo,
                   COALESCE(NULLIF(cat.abreviatura,''), cat.categoria, '') as categoria,
                   cl.logo, cl.nombre as club
            FROM oyesxjug a
            JOIN jugadores j ON (a.jugadorid = j.id)
            JOIN clubs cl ON (j.clubid = cl.id)
            LEFT JOIN categorias cat ON (j.categoriaid = cat.categoria_id)
            WHERE a.torneoid = $tid AND $where
            ORDER BY a.distancia ASC
            LIMIT $limit";

    $winners = safe_query_all($conn, $sql);

    $players = [];
    $pos = 0;
    foreach ($winners as $w) {
        $pos++;
        $logoPath = $w['logo'] ?? '';
        $players[] = [
            'id'        => (string)$w['jugadorid'],
            'position'  => $pos,
            'name'      => $w['jugador'],
            'hole'      => (int)($w['hoyo'] ?? 0),
            'category'  => $w['categoria'] ?? '',
            'distance'  => (float)$w['distancia'],
            'club'      => $w['club'] ?? '',
            'clubLogo'  => $logoPath ? $LOGOS_BASE_URL . $logoPath : '',
        ];
    }
    return $players;
}


/**
 * Get O'Yes 300 (O'Yes X) last updated timestamp.
 *
 * Estrategia en cascada (algunos torneos —p.ej. 361— no tienen datos
 * en la función legacy, por lo que el sello no se mostraba):
 *   1) Función legacy f_ultfechaoyesx(descripcion, torneoid).
 *   2) MAX() de la primera columna de fecha existente en `oyesxjug`
 *      filtrando por torneo + premio (id interno del premio).
 *   3) Igual que (2) pero solo por torneo.
 * Devuelve 'YYYY-MM-DD HH:MM' o null si no hay ninguna fecha.
 *
 * @param mysqli $conn
 * @param string $tid       torneoid ya escapado
 * @param string $descripcion  descripción del premio (clave de la función legacy)
 * @param string|int $prizeId  oyesx.premio (id interno) para el fallback
 */
function get_oyes300_last_updated($conn, $tid, $descripcion, $prizeId = null) {
    // --- 1) Función legacy -------------------------------------------------
    if (!empty($descripcion)) {
        $desc = esc($conn, $descripcion);
        $row = safe_query_one($conn, "SELECT LEFT(f_ultfechaoyesx('$desc', $tid), 16) as lastUpdated");
        if (!empty($row['lastUpdated'])) return $row['lastUpdated'];
    }

    // --- 2/3) Fallback directo sobre oyesxjug ------------------------------
    // Detecta qué columna de fecha existe en la tabla (varía por instalación).
    static $dateCol = false;
    if ($dateCol === false) {
        $dateCol = null;
        $res = @$conn->query("SHOW COLUMNS FROM oyesxjug");
        if ($res) {
            $cols = [];
            while ($c = $res->fetch_assoc()) { $cols[strtolower($c['Field'])] = true; }
            $res->free();
            foreach (['ultact', 'fechahora', 'fecha_hora', 'fecha', 'ultimaactualizacion', 'updated_at'] as $cand) {
                if (isset($cols[$cand])) { $dateCol = $cand; break; }
            }
        }
    }
    if (!$dateCol) return null;

    if ($prizeId !== null && $prizeId !== '') {
        $pid = esc($conn, $prizeId);
        $row = safe_query_one($conn, "SELECT LEFT(MAX(`$dateCol`), 16) as lastUpdated
                                        FROM oyesxjug
                                       WHERE torneoid = $tid AND premio = $pid");
        if (!empty($row['lastUpdated'])) return $row['lastUpdated'];
    }

    $row = safe_query_one($conn, "SELECT LEFT(MAX(`$dateCol`), 16) as lastUpdated
                                    FROM oyesxjug WHERE torneoid = $tid");
    return !empty($row['lastUpdated']) ? $row['lastUpdated'] : null;
}


// End of competencias.php - Driver Precisión + Distancia added 2026-04-28
