<?php
/**
 * Resultados por EQUIPOS (formato AGOGO)
 * Incluido desde `resultados_jug.php` cuando la categoría se juega por equipos
 * (varios jugadores comparten `jugadores.grupoid`).
 *
 * Réplica de la lógica legacy de leaderboard, pero agrupando por equipo:
 *   · Score de cada ronda y total se calculan con las funciones legacy sobre
 *     cada integrante; el score del EQUIPO es el valor real registrado
 *     (el único distinto de cero; si hay varios, el mejor según el sistema).
 *   · `members` lleva los integrantes para pintarlos bajo el nombre del equipo.
 *   · `playerId` es el integrante que tiene la tarjeta del grupo → sirve para
 *     abrir la tarjeta del equipo al hacer click en R{n}.
 *
 * Variables heredadas del include: $conn, $cid, $tid, $gross, $catInfo,
 * $LOGOS_BASE_URL.
 */

$sistemaEq = strtoupper(trim($catInfo['sistema'] ?? ''));
$isStrokeEq = ($sistemaEq === 'STROKE PLAY');
$grossEq = ($gross == '1') ? '1' : '0';

/** ---------- Fechas de juego ---------- */
$diasEq = [];
$dateRowsEq = query_all($conn, "SELECT fecha FROM caljuego
                                WHERE categoriaid = $cid AND campo > 0
                                ORDER BY fecha");
foreach ($dateRowsEq as $i => $dr) { $diasEq[$i + 1] = $dr['fecha']; }

/** ---------- Funciones legacy según sistema / scoring ---------- */
if ($grossEq === '1') {
    $totalExprEq = $isStrokeEq ? "f_torneosox(j.id, j.torneoid)" : "f_stl_gross(j.id, j.torneoid)";
    $diaFnEq     = $isStrokeEq ? "f_score_dia_sox" : "f_score_stbl_gross";
} else {
    $totalExprEq = $isStrokeEq ? "f_torneosax(j.id, j.torneoid)" : "f_torneosa(j.id, j.torneoid)";
    $diaFnEq     = "f_score_dia_sax";
}

/** ¿Existe la función de logo por equipo? (esquemas legacy pueden no tenerla) */
$hasLogoEq = false;
$rt = @$conn->query("SELECT 1 FROM INFORMATION_SCHEMA.ROUTINES
                     WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_NAME = 'f_logo_jugeq' LIMIT 1");
if ($rt) { $hasLogoEq = $rt->num_rows > 0; $rt->free(); }
$logoEqExpr = $hasLogoEq ? "f_logo_jugeq(j.id)" : "NULL";

/** ---------- Integrantes con sus scores ---------- */
$sqlEq = "SELECT j.id AS jugadorid, j.grupoid, j.numjugador, j.estatus, j.club AS equipo,
                 CONCAT(j.nombre, ' ', j.apellido) AS jugador,
                 b.abr AS clubabr, b.logo AS clublogo,
                 $logoEqExpr AS logoeq,
                 $totalExprEq AS total_main";
foreach ($diasEq as $i => $fechaEq) {
    $sqlEq .= ", $diaFnEq(j.id, '" . esc_raw($conn, $fechaEq) . "') AS d{$i}";
}
$sqlEq .= " FROM jugadores j
            LEFT JOIN clubs b ON (j.clubid = b.id)
            WHERE j.categoriaid = $cid AND j.grupoid <> ''
            ORDER BY j.grupoid, j.nombre, j.apellido";
$rowsEq = query_all($conn, $sqlEq);
if ($rowsEq === null) { $rowsEq = []; }

/** Elige el score real del equipo entre los integrantes (0 = sin tarjeta). */
function equipo_pick($values, $isStroke) {
    $nz = array_values(array_filter($values, fn($v) => $v !== null && (int)$v != 0));
    if (!$nz) return null;
    return $isStroke ? (int)min($nz) : (int)max($nz);
}

/** ---------- Agrupa por equipo ---------- */
$teamsEq = [];
foreach ($rowsEq as $r) {
    $g = (string)$r['grupoid'];
    if (!isset($teamsEq[$g])) {
        $teamsEq[$g] = [
            'grupoid'   => $g,
            'teamName'  => trim((string)($r['equipo'] ?? '')),
            'logo'      => $r['logoeq'] ?: ($r['clublogo'] ?? ''),
            'club'      => $r['clubabr'] ?? '',
            'estatus'   => $r['estatus'] ?? 'NORMAL',
            'members'   => [],
            'rowsRaw'   => [],
        ];
    }
    $teamsEq[$g]['members'][] = [
        'id'     => $r['jugadorid'],
        'nombre' => $r['jugador'],
    ];
    $teamsEq[$g]['rowsRaw'][] = $r;
}

$builtEq = [];
foreach ($teamsEq as $g => $t) {
    $rounds = [];
    foreach ($diasEq as $i => $fechaEq) {
        $rounds[$i] = equipo_pick(array_map(fn($r) => $r["d{$i}"] ?? null, $t['rowsRaw']), $isStrokeEq);
    }
    $total = equipo_pick(array_map(fn($r) => $r['total_main'] ?? null, $t['rowsRaw']), $isStrokeEq);

    // Integrante con la tarjeta del grupo → se usa para abrir la tarjeta.
    $cardHolder = $t['rowsRaw'][0]['jugadorid'] ?? null;
    foreach ($t['rowsRaw'] as $r) {
        if ((int)($r['total_main'] ?? 0) != 0) { $cardHolder = $r['jugadorid']; break; }
    }

    $closed = 0;
    foreach ($rounds as $v) { if ($v !== null) $closed++; }

    $builtEq[] = [
        'playerId'     => $cardHolder,
        'grupoid'      => $g,
        'teamName'     => $t['teamName'],
        'name'         => trim($g . ' ' . $t['teamName']),
        'club'         => $t['club'],
        'clubLogo'     => $t['logo'] ? $LOGOS_BASE_URL . $t['logo'] : '',
        'members'      => array_map(fn($m) => $m['nombre'], $t['members']),
        'memberIds'    => array_map(fn($m) => $m['id'], $t['members']),
        'total'        => $total ?? 0,
        'closedRounds' => $closed,
        'rounds'       => $rounds,
        'estatus'      => $t['estatus'],
    ];
}

/** ---------- Orden: mejor score primero ---------- */
usort($builtEq, function ($a, $b) use ($isStrokeEq) {
    $ta = (int)$a['total']; $tb = (int)$b['total'];
    if ($ta == 0 && $tb != 0) return 1;
    if ($tb == 0 && $ta != 0) return -1;
    if ($ta === $tb) return strcmp((string)$a['grupoid'], (string)$b['grupoid']);
    return $isStrokeEq ? ($ta - $tb) : ($tb - $ta);
});

$playersEq = [];
$cutEq = [];
$posEq = 0;
foreach ($builtEq as $t) {
    $row = [
        'playerId'     => $t['playerId'],
        'grupoid'      => $t['grupoid'],
        'teamName'     => $t['teamName'],
        'name'         => $t['name'],
        'members'      => $t['members'],
        'memberIds'    => $t['memberIds'],
        'club'         => $t['club'],
        'clubLogo'     => $t['clubLogo'],
        'total'        => (int)$t['total'],
        'closedRounds' => $t['closedRounds'],
    ];
    foreach ($t['rounds'] as $i => $v) { $row["r{$i}"] = $v; }

    if (strtoupper((string)$t['estatus']) !== 'NORMAL') {
        $row['position']    = substr((string)$t['estatus'], 0, 1);
        $row['statusLabel'] = $t['estatus'];
        $row['status']      = $t['estatus'];
        $cutEq[] = $row;
    } else {
        $posEq++;
        $row['position'] = $posEq;
        $playersEq[] = $row;
    }
}

json_response([
    'categoryId'      => $catInfo['categoria_id'],
    'categoryName'    => $catInfo['categoria'],
    'shortName'       => $catInfo['abreviatura'] ?? '',
    'system'          => $catInfo['sistema'],
    'format'          => $catInfo['formato'],
    /** Bandera consumida por el frontend para el layout por equipos. */
    'isEquipos'       => true,
    'gross'           => (int)$grossEq,
    'days'            => array_values($diasEq),
    'daysPartial'     => array_fill(0, count($diasEq), false),
    'medalCount'      => 3,
    'medalCountNeto'  => 3,
    'medalCountGross' => 1,
    'cutPlayers'      => $cutEq,
    'players'         => $playersEq,
]);
