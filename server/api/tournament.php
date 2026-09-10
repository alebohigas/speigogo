<?php
/**
 * Tournament Info Endpoint
 * GET /api/tournament.php?torneoid=XXX
 * Returns tournament details and statistics
 */
require_once 'config.php';

$torneoid = require_param('torneoid');
$tid = esc($conn, $torneoid);

/**
 * Algunas bases de datos legacy no tienen todas las columnas de branding en
 * `torneo` (ej. `logo_fondo`, `logo_header`). Se detectan antes de consultar
 * para no romper el endpoint con "Unknown column".
 */
$torneoCols = [];
if ($rs = @$conn->query("SHOW COLUMNS FROM torneo")) {
    while ($c = $rs->fetch_assoc()) { $torneoCols[$c['Field']] = true; }
    $rs->free();
}
$optCols = ['estilo','sistemajuego','tipotorneo','color_cinta','imagen_gif','telefono','correotorne','logo_fondo','logo_header'];
$selOpt = '';
foreach ($optCols as $c) {
    $selOpt .= isset($torneoCols[$c]) ? ", a.`$c`" : ", NULL AS `$c`";
}

// Tournament info
$sql = "SELECT a.torneo_id, a.nombre, a.fecha_ini, a.fecha_fin, a.status,
               a.logo, a.formato $selOpt,
               b.nombre as club, b.logo as club_logo, b.ciudad, b.estado
        FROM torneo a
        JOIN clubs b ON (a.club_id = b.id)
        WHERE a.torneo_id = $tid";

$torneo = query_one($conn, $sql);
if (!$torneo) {
    json_error('Tournament not found', 404);
}

// Total historical players across all tournaments for this club
$sql = "SELECT SUM(j.total) as total
        FROM (SELECT COUNT(*) as total FROM jugadores 
              WHERE torneoid IN (SELECT torneo_id FROM torneo WHERE club_id = (SELECT club_id FROM torneo WHERE torneo_id = $tid))
              GROUP BY torneoid) j";
$allPlayersStats = query_one($conn, $sql);

// Years of history: calculate from min/max fecha_ini for same club_id
$sql = "SELECT MIN(YEAR(fecha_ini)) as min_year, MAX(YEAR(fecha_ini)) as max_year
        FROM torneo
        WHERE club_id = (SELECT club_id FROM torneo WHERE torneo_id = $tid)";
$yearStats = query_one($conn, $sql);
$yearsHistory = 0;
if ($yearStats && $yearStats['min_year'] && $yearStats['max_year']) {
    $yearsHistory = (int)$yearStats['max_year'] - (int)$yearStats['min_year'];
}
// Round down to nearest multiple of 2
$yearsHistoryRounded = (int)(floor($yearsHistory / 2) * 2);

// Max categories in any single tournament for this club
$sql = "SELECT MAX(x.categorias_por_torneo) AS max_categorias
        FROM (SELECT t.torneo_id, COUNT(c.categoria_id) AS categorias_por_torneo
              FROM torneo t
              JOIN categorias c ON c.torneo_id = t.torneo_id
              WHERE t.club_id = (SELECT club_id FROM torneo WHERE torneo_id = $tid)
              GROUP BY t.torneo_id) AS x";
$maxCatStats = query_one($conn, $sql);

json_response([
    'id'          => $torneo['torneo_id'],
    'name'        => $torneo['nombre'],
    'club'        => $torneo['club'],
    'clubLogo'    => $torneo['club_logo'] ? $LOGOS_BASE_URL . $torneo['club_logo'] : null,
    'logo'        => $torneo['logo'] ? $LOGOS_BASE_URL . $torneo['logo'] : null,
    'startDate'   => $torneo['fecha_ini'],
    'endDate'     => $torneo['fecha_fin'],
    'status'      => $torneo['status'],
    'format'      => $torneo['formato'],
    'style'       => $torneo['estilo'],
    'system'      => $torneo['sistemajuego'],
    'type'        => $torneo['tipotorneo'],
    'ribbonColor' => $torneo['color_cinta'],
    'heroImage'   => $torneo['logo_fondo'] ? $LOGOS_BASE_URL . $torneo['logo_fondo'] : ($torneo['imagen_gif'] ? $LOGOS_BASE_URL . $torneo['imagen_gif'] : null),
    'logoHeader'  => $torneo['logo_header'] ? $LOGOS_BASE_URL . $torneo['logo_header'] : null,
    'phone'       => $torneo['telefono'] ?? '',
    'email'       => $torneo['correotorne'] ?? '',
    'city'        => $torneo['ciudad'] ?? '',
    'state'       => $torneo['estado'] ?? '',
    'stats' => [
        'totalHistoricalPlayers' => (int)($allPlayersStats['total'] ?? 0),
        'yearsHistory'           => $yearsHistory,
        'yearsHistoryRounded'    => $yearsHistoryRounded,
        'maxCategories'          => (int)($maxCatStats['max_categorias'] ?? 0),
    ]
]);
