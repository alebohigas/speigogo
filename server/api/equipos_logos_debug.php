<?php
/**
 * Diagnóstico de logos de equipo
 * GET /api/equipos_logos_debug.php?torneoid=XXX[&catid=XXX]
 *
 * Muestra, en JSON:
 *   · Las filas de la tabla `equipos` para ese torneo (id, equipo, logo).
 *   · Las llaves del índice de logos que arma _equipos_logos.php.
 *   · Los `grupoid` que realmente usan los jugadores de ese torneo/categoría.
 *   · Si cada grupoid encuentra o no logo, y la URL resultante.
 *
 * Sirve para saber si el problema es de relación (grupoid vs equipos.equipo)
 * o de archivo (el logo existe pero el proxy no lo encuentra).
 */
require_once 'config.php';
require_once '_equipos_logos.php';

$torneoid = require_param('torneoid');
$tid      = esc($conn, $torneoid);
$catid    = isset($_GET['catid']) ? esc($conn, $_GET['catid']) : '';

/* ---------- Columnas reales de `equipos` ---------- */
$cols = [];
if ($rc = @$conn->query("SHOW COLUMNS FROM equipos")) {
    while ($c = $rc->fetch_assoc()) $cols[] = $c['Field'];
    $rc->free();
}

/* ---------- Filas de equipos del torneo ---------- */
$rows = [];
$nameCol = in_array('equipo', $cols) ? 'equipo' : (in_array('nombre', $cols) ? 'nombre' : null);
if (in_array('logo', $cols)) {
    $sel = 'logo' . (in_array('id', $cols) ? ', id' : '') . ($nameCol ? ", $nameCol AS nombre_equipo" : '');
    $where = in_array('torneoid', $cols) ? " WHERE torneoid = '$tid'" : '';
    if ($r = @$conn->query("SELECT $sel FROM equipos$where")) {
        while ($row = $r->fetch_assoc()) {
            $rows[] = [
                'id'     => $row['id'] ?? null,
                'equipo' => $row['nombre_equipo'] ?? null,
                'logo'   => $row['logo'] ?? '',
                'url'    => equipos_logo_url($row['logo'] ?? ''),
            ];
        }
        $r->free();
    } else {
        error_log('equipos_logos_debug: ' . $conn->error);
    }
}

/* ---------- Índice construido ---------- */
$index = equipos_logo_index($conn, $torneoid);

/* ---------- Grupos reales de jugadores ---------- */
$groups = [];
$w = "torneoid = '$tid'" . ($catid !== '' ? " AND categoriaid = '$catid'" : '');
if ($r = @$conn->query("SELECT DISTINCT grupoid FROM jugadores WHERE $w ORDER BY grupoid")) {
    while ($row = $r->fetch_assoc()) {
        $g = (string)$row['grupoid'];
        $url = equipos_logo_find($index, $g);
        $groups[] = [
            'grupoid'   => $g,
            'encontrado'=> $url !== '',
            'url'       => $url,
        ];
    }
    $r->free();
}

json_response([
    'torneoid'        => $torneoid,
    'catid'           => $catid,
    'equiposColumns'  => $cols,
    'equiposRows'     => $rows,
    'indexKeys'       => array_keys($index),
    'gruposJugadores' => $groups,
    'resumen'         => [
        'equipos'        => count($rows),
        'grupos'         => count($groups),
        'gruposConLogo'  => count(array_filter($groups, fn($g) => $g['encontrado'])),
    ],
]);
