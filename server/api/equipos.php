<?php
/**
 * Equipos Endpoint (formato AGOGO / juego por equipos)
 * GET /api/equipos.php?torneoid=XXX&catid=XXX
 *
 * Réplica del reporte legacy `lista_jug3.php` + `jugadores3.php`:
 *   · Jugadores agrupados por `jugadores.grupoid` (equipo)
 *   · H.I. (indexjgo) y H.C. (f_hdccampo) por jugador
 *   · Total del equipo (f_sumhcpgrupo / f_sumIndexgrupo) y Handicap Neto
 *     del grupo (f_hdccampogpo)
 *   · Tees de salida del campo para la leyenda superior
 *
 * Sin salida de texto/HTML fuera del JSON (usar error_log para depurar).
 */
require_once 'config.php';

$torneoid = require_param('torneoid');
$catid    = require_param('catid');
$tid      = esc($conn, $torneoid);
$cid      = esc($conn, $catid);

/** ---------- Torneo ---------- */
$torneo = query_one($conn, "SELECT hcpindexmin, index_campo, nummaxjug FROM torneo WHERE torneo_id = '$tid' LIMIT 1");
$hcpIndexMin = $torneo ? (float)($torneo['hcpindexmin'] ?? 0) : 0;
$indexCampo  = $torneo ? (string)($torneo['index_campo'] ?? '') : '';
$numMaxJug   = $torneo ? (int)($torneo['nummaxjug'] ?? 0) : 0;

/** ---------- Categoría ---------- */
$cat = query_one($conn, "SELECT categoria_id, categoria, abreviatura, sistema, formato, porcentaje, salida
                         FROM categorias WHERE categoria_id = '$cid' LIMIT 1");
$porcentaje = $cat ? (float)($cat['porcentaje'] ?? 0) : 0;
$salidaid   = $cat ? (int)($cat['salida'] ?? 0) : 0;

/** ---------- Campo del calendario de juego ---------- */
$campoRow = query_one($conn, "SELECT b.campoid, b.salidaid, b.rating, b.slope, s.tee, b.parcampo
                              FROM caljuego a
                              JOIN campo_tee b ON (a.campo = b.campoid AND a.categoriaid = '$cid' AND b.salidaid = $salidaid)
                              JOIN salidas s ON (b.salidaid = s.id)
                              LIMIT 1");
$campoid = $campoRow ? (int)$campoRow['campoid'] : 0;

/** ---------- Totales de la categoría ---------- */
$totRow = query_one($conn, "SELECT COUNT(*) AS tot, COUNT(DISTINCT grupoid) AS equipos
                            FROM jugadores WHERE categoriaid = '$cid' AND torneoid = '$tid'");
$totalJugadores = $totRow ? (int)$totRow['tot'] : 0;
$totalEquipos   = $totRow ? (int)$totRow['equipos'] : 0;

/** ---------- Jugadores por equipo ---------- */
$teams = [];
if ($campoid > 0) {
    $sql = "SELECT a.id, a.grupoid, a.numjugador,
                   CONCAT(a.nombre, ' ', a.apellido) AS jugador,
                   f_logo_jugeq(a.id) AS logo,
                   s.bgcolor, s.color,
                   f_sumhcpgrupo(a.grupoid, $campoid, a.categoriaid) AS tothcp,
                   f_sumIndexgrupo(a.grupoid, $campoid, a.categoriaid) AS totindex,
                   a.indexjgo AS hi,
                   f_hdccampo(a.indexjgo, a.teesalidaid, $campoid) AS hc,
                   f_hdccampogpo(a.grupoid, $campoid, a.categoriaid) AS hn
            FROM jugadores AS a
            LEFT JOIN clubs AS b ON (a.clubid = b.id)
            JOIN salidas s ON (a.teesalidaid = s.id)
            WHERE a.categoriaid = '$cid'
            ORDER BY a.grupoid, a.nombre, a.apellido";
    $res = $conn->query($sql);
    if (!$res) {
        error_log('equipos.php players query failed: ' . $conn->error);
    } else {
        $byGroup = [];
        while ($row = $res->fetch_assoc()) {
            $g = (string)($row['grupoid'] ?? '');
            if (!isset($byGroup[$g])) {
                // El identificador del equipo puede venir como "AK9001 The Beginners":
                // separamos número/clave del nombre para mostrarlos por separado.
                $numero = '';
                $nombre = $g;
                if (preg_match('/^([A-Za-z]*\d+[A-Za-z0-9\-]*)\s+(.+)$/u', $g, $m)) {
                    $numero = $m[1];
                    $nombre = $m[2];
                }
                $byGroup[$g] = [
                    'grupoid'      => $g,
                    'numero'       => $numero,
                    'nombre'       => $nombre,
                    'logo'         => $row['logo'] ?? '',
                    // Totales legacy (pueden estar limitados a n jugadores fijos)
                    'legacyHcp'    => $row['tothcp'] !== null ? (float)$row['tothcp'] : 0,
                    'legacyIndex'  => $row['totindex'] !== null ? (float)$row['totindex'] : 0,
                    'totalHcp'     => 0,
                    'totalIndex'   => 0,
                    'total'        => 0,
                    'handicapNeto' => $row['hn'] !== null ? (float)$row['hn'] : null,
                    'fueraDeRango' => false,
                    'players'      => [],
                ];
            }
            // Sumamos dinámicamente a TODOS los integrantes del equipo.
            $byGroup[$g]['totalHcp']   += $row['hc'] !== null ? (float)$row['hc'] : 0;
            $byGroup[$g]['totalIndex'] += $row['hi'] !== null ? (float)$row['hi'] : 0;
            $byGroup[$g]['players'][] = [
                'id'      => $row['id'],
                'nombre'  => $row['jugador'],
                'hi'      => $row['hi'] !== null ? (string)$row['hi'] : '',
                'hc'      => $row['hc'] !== null ? (string)$row['hc'] : '',
                'bgcolor' => $row['bgcolor'] ?? '',
                'color'   => $row['color'] ?? '',
            ];
        }
        $res->free();

        $maxPorEquipo = 0;
        foreach ($byGroup as $g => $t) {
            $n = count($t['players']);
            if ($n > $maxPorEquipo) $maxPorEquipo = $n;
            $byGroup[$g]['totalHcp']   = round($t['totalHcp'], 1) + 0;
            $byGroup[$g]['totalIndex'] = round($t['totalIndex'], 1) + 0;
            $comparado = ($indexCampo === '1') ? $byGroup[$g]['totalHcp'] : $byGroup[$g]['totalIndex'];
            $byGroup[$g]['total']        = $comparado;
            $byGroup[$g]['fueraDeRango'] = $hcpIndexMin > $comparado;
            $byGroup[$g]['jugadores']    = $n;
        }
        if ($maxPorEquipo > 0) $numMaxJug = $maxPorEquipo;
        $teams = array_values($byGroup);
    }
}

/** ---------- Tees de salida (leyenda) ---------- */
$tees = [];
if ($campoid > 0) {
    $teeRes = $conn->query("SELECT a.rating, a.slope, a.parcampo, b.tee, b.bgcolor, b.color
                            FROM campo_tee AS a JOIN salidas AS b ON (a.salidaid = b.id)
                            WHERE a.campoid = $campoid");
    if (!$teeRes) {
        error_log('equipos.php tees query failed: ' . $conn->error);
    } else {
        while ($t = $teeRes->fetch_assoc()) {
            $tees[] = [
                'tee'     => $t['tee'] ?? '',
                'rating'  => $t['rating'] ?? '',
                'slope'   => $t['slope'] ?? '',
                'par'     => $t['parcampo'] ?? '',
                'bgcolor' => $t['bgcolor'] ?? '',
                'color'   => $t['color'] ?? '',
            ];
        }
        $teeRes->free();
    }
}

json_response([
    'tournament' => [
        'hcpIndexMin'    => $hcpIndexMin,
        'indexCampo'     => $indexCampo,
        'jugadoresEquipo' => $numMaxJug,
    ],
    'category' => [
        'id'             => $cat['categoria_id'] ?? $catid,
        'name'           => $cat['categoria'] ?? '',
        'shortName'      => $cat['abreviatura'] ?? '',
        'system'         => $cat['sistema'] ?? '',
        'format'         => $cat['formato'] ?? '',
        'percentage'     => $porcentaje,
        'campoid'        => $campoid,
        'totalJugadores' => $totalJugadores,
        'totalEquipos'   => $totalEquipos,
    ],
    'teams' => $teams,
    'tees'  => $tees,
]);
