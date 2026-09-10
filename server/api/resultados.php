<?php
/**
 * Resultados Master Endpoint
 * GET /api/resultados.php?torneoid=XXX
 * Returns categories list with their scoring systems for results navigation
 * Separates Stroke Play from Match Play (Eliminación Directa)
 */
require_once 'config.php';

$torneoid = require_param('torneoid');
$tid = esc($conn, $torneoid);

/**
 * Some deployed tournament databases are missing optional `categorias`
 * columns (catrel, abreviatura, estilo...). Detect them so the endpoint
 * degrades gracefully instead of returning HTTP 500.
 */
function resultados_column_exists($conn, $table, $column) {
    $table = esc($conn, $table);
    $column = esc($conn, $column);
    $r = @$conn->query("SHOW COLUMNS FROM `$table` LIKE '$column'");
    $exists = $r && $r->num_rows > 0;
    if ($r) $r->free();
    return $exists;
}

$optional = ['abreviatura', 'estilo', 'gross', 'hcpIdxMin', 'hcpIdxMax',
             'porcentaje', 'hoyosajugar', 'hoyosacorte', 'salida', 'catrel'];
$cols = ['a.categoria_id', 'a.torneo_id', 'a.categoria', 'a.sistema', 'a.formato'];
foreach ($optional as $c) {
    if (resultados_column_exists($conn, 'categorias', $c)) $cols[] = "a.`$c`";
}
$colList = implode(', ', $cols);

// Get categories with active results
$sql = "SELECT $colList, COUNT(b.id) as playerCount
        FROM categorias a
        JOIN jugadores b ON (a.categoria_id = b.categoriaid)
        WHERE a.estatus = 1 AND a.torneo_id = $tid
        GROUP BY $colList
        ORDER BY a.categoria_id ASC";

$rows = query_all($conn, $sql);
debug_log_query('Categories with results', $sql);

// Separate by system type
$strokePlay = [];
$matchPlay = [];

foreach ($rows as $row) {
    $cat = [
        'categoryId'  => $row['categoria_id'],
        'name'        => $row['categoria'],
        'shortName'   => $row['abreviatura'],
        'system'      => $row['sistema'],
        'format'      => $row['formato'],
        'style'       => $row['estilo'],
        'gross'       => (int)$row['gross'],
        'playerCount' => (int)$row['playerCount'],
        'relatedCat'  => $row['catrel'],
        /** Detección de torneo de parejas — la categoría es de parejas cuando formato='PAREJAS'. */
        'isParejas'   => (strtoupper($row['formato']) === 'PAREJAS')
    ];

    if (strtoupper($row['sistema']) === 'MATCH PLAY') {
        $matchPlay[] = $cat;
    } else {
        $strokePlay[] = $cat;
    }
}

json_response([
    'strokePlay' => $strokePlay,
    'matchPlay'  => $matchPlay
]);
