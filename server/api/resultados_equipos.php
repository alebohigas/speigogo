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

/**
 * Tabla `equipos`: en algunas bases no existe o no trae las mismas columnas
 * (nombre / logo / torneoid). Se detecta todo antes de armar la consulta para
 * que el leaderboard nunca falle por una columna ausente.
 */
$eqCols = [];
$rc = @$conn->query("SHOW COLUMNS FROM equipos");
if ($rc) { while ($c = $rc->fetch_assoc()) { $eqCols[strtolower($c['Field'])] = true; } $rc->free(); }
$hasEqTable = !empty($eqCols) && isset($eqCols['equipo']);

$eqNombreExpr = ($hasEqTable && isset($eqCols['nombre'])) ? 'e.nombre' : "''";
$eqLogoExpr   = ($hasEqTable && isset($eqCols['logo']))   ? 'e.logo'   : "''";
$eqJoin = '';
if ($hasEqTable) {
    $eqJoin = " LEFT JOIN equipos e ON (j.grupoid = e.equipo"
            . (isset($eqCols['torneoid']) ? " AND j.torneoid = e.torneoid" : '') . ")";
}

/** ---------- Desempates sobre la última tarjeta cerrada ----------
 *  Progresión solicitada: mejor score del último día → hoyos 10-18 →
 *  13-18 → 16-18 → 18 → 4-9 → 7-9 → 9. Se comparan golpes (menos es mejor).
 */
$sufEq = ($grossEq === '1') ? '' : '_a';
function tb_sum_eq($holes, $suf) {
    $sum = implode(' + ', array_map(fn($h) => "COALESCE(tc.h{$h}{$suf}, 0)", $holes));
    return "(SELECT ({$sum})
             FROM tarjetas tc
             WHERE tc.jugadorid = j.id
               AND tc.torneoid  = j.torneoid
               AND tc.statlsc   = 1
             ORDER BY tc.fecha_juego DESC
             LIMIT 1)";
}
$tbSetsEq = [
    'tb1' => [10, 11, 12, 13, 14, 15, 16, 17, 18],
    'tb2' => [13, 14, 15, 16, 17, 18],
    'tb3' => [16, 17, 18],
    'tb4' => [18],
    'tb5' => [4, 5, 6, 7, 8, 9],
    'tb6' => [7, 8, 9],
    'tb7' => [9],
];

/** ---------- Integrantes con sus scores ---------- */
$sqlEq = "SELECT j.id AS jugadorid, j.grupoid, j.numjugador, j.estatus,
                 CONCAT(j.nombre, ' ', j.apellido) AS jugador,
                 b.abr AS clubabr, b.logo AS clublogo,
                 $eqNombreExpr AS equiponombre, $eqLogoExpr AS equipologo,
                 $logoEqExpr AS logoeq,
                 $totalExprEq AS total_main";
foreach ($tbSetsEq as $alias => $holes) {
    $sqlEq .= ", " . tb_sum_eq($holes, $sufEq) . " AS {$alias}";
}
foreach ($diasEq as $i => $fechaEq) {
    $sqlEq .= ", $diaFnEq(j.id, '" . esc($conn, $fechaEq) . "') AS d{$i}";
}
$sqlEq .= " FROM jugadores j
            LEFT JOIN clubs b ON (j.clubid = b.id)"
        . $eqJoin
        . " WHERE j.categoriaid = $cid AND j.grupoid <> ''
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
        // El nombre real del equipo se toma de la tabla `equipos` si existe;
        // si no, se parsea del identificador de grupo, igual que en equipos.php.
        // NUNCA se usa `j.club` porque ese es el club del integrante, no el
        // nombre del equipo.
        $numeroEq = '';
        $nombreEq = trim((string)($r['equiponombre'] ?? ''));
        if ($nombreEq === '') {
            $nombreEq = $g;
            if (preg_match('/^([A-Za-z]*\d+[A-Za-z0-9\-]*)\s+(.+)$/u', $g, $m)) {
                $numeroEq = $m[1];
                $nombreEq = $m[2];
            }
        }
        $teamsEq[$g] = [
            'grupoid'   => $g,
            'numero'    => $numeroEq,
            'teamName'  => $nombreEq,
            'logo'      => $r['logoeq'] ?: ($r['equipologo'] ?: ($r['clublogo'] ?? '')),
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

    // Valores de desempate del equipo: se toma el mejor (menor) de sus
    // integrantes con tarjeta cerrada en cada segmento de hoyos.
    $tb = [];
    foreach (array_keys($tbSetsEq) as $alias) {
        $vals = array_values(array_filter(
            array_map(fn($r) => $r[$alias] ?? null, $t['rowsRaw']),
            fn($v) => $v !== null && $v !== ''
        ));
        $tb[$alias] = $vals ? (int)min($vals) : null;
    }

    $builtEq[] = [
        'playerId'     => $cardHolder,
        'grupoid'      => $g,
        'teamName'     => $t['teamName'],
        /** En Resultados debe mostrarse ÚNICAMENTE el nombre del equipo,
         *  no el identificador de grupo ni el club del integrante. */
        'name'         => $t['teamName'] ?: $g,
        'club'         => $t['club'],
        /* Logo del EQUIPO: primero la tabla `equipos` del torneo, después el
         * valor legacy (f_logo_jugeq / e.logo / logo del club). */
        'clubLogo'     => equipos_logo_find($eqLogoIndex, $g, $t['teamName'])
                          ?: equipos_logo_url($t['logo'] ?? ''),
        'members'      => array_map(fn($m) => $m['nombre'], $t['members']),
        'memberIds'    => array_map(fn($m) => $m['id'], $t['members']),
        'total'        => $total ?? 0,
        'closedRounds' => $closed,
        'rounds'       => $rounds,
        'lastRound'    => empty($rounds) ? null : $rounds[max(array_keys($rounds))],
        'tb'           => $tb,
        'estatus'      => $t['estatus'],
    ];
}

/** ---------- Orden: mejor score primero, luego desempates ---------- */
usort($builtEq, function ($a, $b) use ($isStrokeEq, $tbSetsEq) {
    $ta = (int)$a['total']; $tb2 = (int)$b['total'];
    if ($ta == 0 && $tb2 != 0) return 1;
    if ($tb2 == 0 && $ta != 0) return -1;
    if ($ta !== $tb2) return $isStrokeEq ? ($ta - $tb2) : ($tb2 - $ta);

    // 1) Mejor score de la última ronda jugada.
    $la = $a['lastRound']; $lb = $b['lastRound'];
    if ($la !== null && $lb !== null && (int)$la !== (int)$lb) {
        return $isStrokeEq ? ((int)$la - (int)$lb) : ((int)$lb - (int)$la);
    }

    // 2) Countback por segmentos de hoyos (golpes: menos es mejor).
    foreach (array_keys($tbSetsEq) as $alias) {
        $va = $a['tb'][$alias] ?? null;
        $vb = $b['tb'][$alias] ?? null;
        if ($va === null || $vb === null || $va === $vb) continue;
        return $va - $vb;
    }

    return strcmp((string)$a['grupoid'], (string)$b['grupoid']);
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
