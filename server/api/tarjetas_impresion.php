<?php
/**
 * Tarjetas — Impresión de tarjetas de juego (Stroke Play / Stableford)
 * -----------------------------------------------------------------------------
 * Réplica del reporte legacy `tarjetas/tar_gross1.php`, expuesta como JSON para
 * que el frontend la renderice con el diseño del sitio del torneo.
 *
 * MODOS
 *   1) Catálogo (formulario de Admin):
 *      GET /api/tarjetas_impresion.php?torneoid=346&modo=catalogo
 *      → { days: [ { fecha, fechaFormato, campoid, campo,
 *                    categories: [ { id, name, shortName, system } ] } ] }
 *
 *   2) Reporte de tarjetas:
 *      GET /api/tarjetas_impresion.php?torneoid=346&fecha=2026-04-30&catid=6337
 *          [&campoid=27]
 *      → { tournament, club, course, logoHeader, fecha, fechaFormato,
 *          cards: [ { ...datos completos de la tarjeta } ] }
 *
 * `catid` acepta varias categorías separadas por coma (6337,6338).
 *
 * CONTENIDO DE CADA TARJETA (idéntico al legacy)
 *   - Encabezado: hoyo+hora de salida (H01 11:10), tee (color), número de
 *     jugador, nombre, ventaja total, abreviatura de categoría y club.
 *   - Renglones por hoyo 1..18 con V1 / V2 / TOTAL: PAR, YARDAS, PAR TIME
 *     (hora estimada de juego) y VENTAJA (ranking del hoyo).
 *   - Renglón HANDICAP con los golpes de ventaja del jugador por hoyo.
 *   - Pie: club del campo, folio (tarjetaid), firma del anotador y nombre.
 *
 * NOTA: la fecha "universal" del legacy NO se incluye por tarjeta; el frontend
 * la imprime una sola vez en el encabezado de 3 cm de cada tarjeta.
 */
require_once 'config.php';

/**
 * Torneo ACTIVO del dominio (`site_config.torneoid`).
 * Permite que el frontend no dependa del parámetro `torneoid`.
 * @return string ID del torneo activo o '' si no hay configuración.
 */
function tj_active_torneoid($conn) {
    $domain = esc($conn, $_SERVER['HTTP_HOST'] ?? 'localhost');

    // Multi-torneo: el torneo principal del dominio es el primero activo
    // registrado en `site_torneos` (por orden). Si la tabla no existe se
    // usa la configuración por dominio como antes.
    $r = @$conn->query("SELECT torneoid FROM site_torneos
                        WHERE domain = '$domain' AND activo = 1
                        ORDER BY orden ASC, id ASC LIMIT 1");
    if ($r) {
        $row = $r->fetch_assoc();
        $r->free();
        if (!empty($row['torneoid'])) return (string)(int)$row['torneoid'];
    }

    $r = @$conn->query("SELECT torneoid FROM site_config WHERE domain = '$domain'
                        ORDER BY (scope = 'general') ASC LIMIT 1");
    if (!$r) {
        $r = @$conn->query("SELECT torneoid FROM site_config WHERE domain = '$domain' LIMIT 1");
    }
    if ($r && ($row = $r->fetch_assoc())) {
        $r->free();
        if (!empty($row['torneoid'])) return (string)(int)$row['torneoid'];
    }
    return '';
}

// `torneoid` es opcional: si no viene, se usa el torneo activo del dominio.
$torneoid = trim((string)(optional_param('torneoid', '') ?? ''));
if ($torneoid === '') {
    $torneoid = tj_active_torneoid($conn);
}
if (!preg_match('/^\d+$/', $torneoid)) {
    json_error('No se pudo determinar el torneo activo del sitio.', 400);
}
$tid = esc($conn, $torneoid);


// Fechas/meses en español para los encabezados del reporte.
@$conn->query("SET lc_time_names = 'es_ES'");

/** Minutos estimados por par cuando el campo no guarda el tiempo por hoyo. */
$TJ_PAR_MINUTES = [3 => 15, 4 => 14, 5 => 19];

// ============= Helpers de consulta (tolerantes a fallos) =============

/** query_all tolerante: registra el error y devuelve [] en lugar de fallar. */
function tj_all($conn, $sql) {
    $r = @$conn->query($sql);
    if (!$r) { error_log('tarjetas_impresion: ' . $conn->error . ' | ' . $sql); return []; }
    $rows = [];
    while ($row = $r->fetch_assoc()) { $rows[] = $row; }
    $r->free();
    return $rows;
}

/** query_one tolerante. */
function tj_one($conn, $sql) {
    $rows = tj_all($conn, $sql);
    return $rows[0] ?? null;
}

/** Lista de columnas de una tabla (vacío si la tabla no existe). */
function tj_columns($conn, $table) {
    $cols = [];
    foreach (tj_all($conn, "SHOW COLUMNS FROM `$table`") as $c) $cols[] = $c['Field'];
    return $cols;
}

/** Primera columna de $table que coincida (case-insensitive) con $candidates. */
function tj_pick_column($conn, $table, $candidates) {
    $cols = tj_columns($conn, $table);
    foreach ($candidates as $cand) {
        foreach ($cols as $col) if (strcasecmp($col, $cand) === 0) return $col;
    }
    return null;
}

/** Columna del hoyo de salida en `salidagrupo` (varía entre instalaciones). */
function tj_hole_column($conn) {
    return tj_pick_column($conn, 'salidagrupo', [
        'hoyo1a', 'hoyoinicio1a', 'hoyoini1a', 'hoyoinicio', 'hoyoini', 'hoyoi', 'hoyo',
    ]);
}

/** Hoyo de salida de un grupo: columna detectada o número extraído del tee. */
function tj_group_hole($g) {
    if (isset($g['hoyo']) && $g['hoyo'] !== null && $g['hoyo'] !== '' && (int)$g['hoyo'] > 0) {
        return (int)$g['hoyo'];
    }
    if (!empty($g['teesal']) && preg_match('/(\d{1,2})/', (string)$g['teesal'], $m)) {
        $n = (int)$m[1];
        if ($n >= 1 && $n <= 18) return $n;
    }
    return null;
}

// ============= Modo 0: catálogo de TORNEOS (selector de Admin) =============
/**
 * GET ...?modo=torneos → { tournaments: [ { id, name, club, year } ] }
 * Lista los torneos que tienen calendario de juego capturado, del más
 * reciente al más antiguo, para que Admin → Tarjetas pueda elegir uno
 * distinto al torneo activo del dominio.
 */
if (optional_param('modo') === 'torneos') {
    $rows = tj_all($conn, "SELECT t.torneo_id, t.nombre, c.nombre AS club,
                                  MIN(cj.fecha) AS primera_fecha
                             FROM torneo t
                        LEFT JOIN clubs c    ON (t.club_id = c.id)
                             JOIN caljuego cj ON (cj.torneoid = t.torneo_id)
                            GROUP BY t.torneo_id, t.nombre, c.nombre
                            ORDER BY t.torneo_id DESC
                            LIMIT 80");
    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'id'    => (string)$r['torneo_id'],
            'name'  => $r['nombre'] ?? '',
            'club'  => $r['club'] ?? '',
            'year'  => !empty($r['primera_fecha']) ? substr((string)$r['primera_fecha'], 0, 4) : '',
        ];
    }
    json_response(['tournaments' => $out]);
}

// ============= Modo 1: catálogo de días + campos + categorías =============
if (optional_param('modo') === 'catalogo') {
    $rows = tj_all($conn, "SELECT DISTINCT cj.fecha,
                                  cj.campo AS campoid,
                                  DATE_FORMAT(cj.fecha, '%W, %e de %M %Y') AS fecha_formato,
                                  ca.campo AS campo_nombre,
                                  cat.categoria_id, cat.categoria, cat.abreviatura, cat.sistema
                             FROM salidagrupo sg
                             JOIN caljuego cj    ON (sg.caljuegoid = cj.id)
                             JOIN categorias cat ON (sg.categoriaid = cat.categoria_id)
                        LEFT JOIN campos ca      ON (cj.campo = ca.id)
                            WHERE cj.torneoid = $tid AND cj.campo > 0
                            ORDER BY cj.fecha ASC, cj.campo ASC, cat.categoria ASC");

    /** Agrupa por (fecha, campo) acumulando sus categorías. */
    $days = [];
    foreach ($rows as $r) {
        $key = $r['fecha'] . '|' . $r['campoid'];
        if (!isset($days[$key])) {
            $days[$key] = [
                'fecha'        => $r['fecha'],
                'fechaFormato' => $r['fecha_formato'],
                'campoid'      => (string)$r['campoid'],
                'campo'        => $r['campo_nombre'] ?? '',
                'categories'   => [],
            ];
        }
        $days[$key]['categories'][] = [
            'id'        => (string)$r['categoria_id'],
            'name'      => $r['categoria'] ?? '',
            'shortName' => $r['abreviatura'] ?? '',
            'system'    => strtoupper($r['sistema'] ?? ''),
        ];
    }
    json_response(['days' => array_values($days)]);
}

// ============= Parámetros del reporte =============
$fechaRaw = trim((string)require_param('fecha'));
$catidRaw = trim((string)require_param('catid'));
$campoid = trim((string)optional_param('campoid', ''));
/**
 * Campo de la BD que se usará para el HCP. NETO impreso en el encabezado.
 * Configurable en Admin → Tarjetas y enviado como `hcpfield=`:
 *   · 'auto'      → primer campo neto disponible y, si no hay, la suma de ventajas.
 *   · 'match'     → valida hcpneto/handicapneto/vtjajug y elige el que mejor
 *                   coincide con el neto calculado por ventajas por hoyo.
 *   · 'hcpneto' | 'handicapneto' | 'vtjajug' → columna específica de la vista.
 *   · 'ventajas'  → forzar la suma de golpes de ventaja por hoyo.
 * Cualquier otro valor se trata como 'auto' (no se aceptan columnas arbitrarias).
 */
$HCP_FIELDS_OK = ['auto', 'match', 'hcpneto', 'handicapneto', 'vtjajug', 'ventajas'];
$hcpField = strtolower(trim((string)optional_param('hcpfield', 'auto')));
if (!in_array($hcpField, $HCP_FIELDS_OK, true)) $hcpField = 'auto';


/** Filtro de tipo de juego: '' | 'auto' (= todas), 'stroke', 'stableford'. */
$sistemaFilter = strtolower(trim((string)optional_param('sistema', 'auto')));

/**
 * MATCH PLAY (`matchplay=1`)
 * -----------------------------------------------------------------------------
 * Réplica del reporte legacy `tarjetas/Print_score_stk_matchplay_ed.php`: en vez
 * de una tarjeta por jugador se emite UNA TARJETA POR ENFRENTAMIENTO, con los
 * dos contendientes del match (`torneos.elimin_salidas_cat`) dentro de la misma
 * tarjeta: renglones Gross / Handicap / NETO por jugador y un renglón DIF.
 * El encabezado es el MISMO de Stroke Play / Stableford.
 */
$matchPlay = optional_param('matchplay') === '1';

/**
 * `fecha` acepta un día (2026-04-30) o varios separados por coma
 * (2026-04-30,2026-05-01) para imprimir un rango en un solo reporte.
 */
$fechas = [];
foreach (explode(',', $fechaRaw) as $piece) {
    $piece = trim($piece);
    if ($piece === '') continue;
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $piece, $fm) ||
        !checkdate((int)$fm[2], (int)$fm[3], (int)$fm[1])) {
        json_error('Parámetro inválido: fecha debe tener formato YYYY-MM-DD.', 400);
    }
    $fechas[$piece] = $piece;
}
if (!$fechas) json_error('Parámetro inválido: fecha es obligatoria.', 400);
$fechas = array_values($fechas);
sort($fechas);
/** Primera fecha: se usa para el encabezado y los datos del campo. */
$fecha = $fechas[0];

/** Lista de categorías solicitadas (enteros positivos, sin duplicados). */
$catIds = [];
foreach (explode(',', $catidRaw) as $piece) {
    $piece = trim($piece);
    if ($piece === '') continue;
    if (!preg_match('/^\d+$/', $piece)) {
        json_error('Parámetro inválido: catid debe ser numérico (o lista separada por comas).', 400);
    }
    $catIds[(int)$piece] = (int)$piece;
}
if (!$catIds) json_error('Parámetro inválido: catid es obligatorio.', 400);
$catIds = array_values($catIds);
$catList = implode(',', $catIds);

$fEsc = esc($conn, $fecha);
$cEsc = ($campoid !== '' && preg_match('/^\d+$/', $campoid)) ? (int)$campoid : 0;

// ============= Encabezado del reporte =============
$head = tj_one($conn, "SELECT a.nombre, a.logo_header, b.nombre AS club
                         FROM torneo a JOIN clubs b ON (a.club_id = b.id)
                        WHERE a.torneo_id = $tid");
$fechaFmt = tj_one($conn, "SELECT DATE_FORMAT('$fEsc', '%W, %e de %M %Y') AS f");

// ============= Categorías solicitadas =============
/**
 * `categorias` NO tiene columna `campoid` en todas las instalaciones, por eso
 * las columnas opcionales se resuelven con tj_columns antes de armar el SELECT:
 * si se pide una columna inexistente MySQL falla y el reporte quedaba vacío
 * ("No se encontraron las categorías solicitadas").
 */
$catCols = tj_columns($conn, 'categorias');
$catSelect = ['categoria_id', 'categoria', 'abreviatura', 'sistema', 'salida'];
foreach (['campoid', 'campo_id', 'campo'] as $optCol) {
    if (in_array($optCol, $catCols, true)) { $catSelect[] = "`$optCol` AS campoid"; break; }
}
$cats = [];
foreach (tj_all($conn, "SELECT " . implode(', ', $catSelect) . "
                          FROM categorias
                         WHERE categoria_id IN ($catList) AND torneo_id = $tid") as $c) {
    $cats[(int)$c['categoria_id']] = $c;
}
if (!$cats) json_error('No se encontraron las categorías solicitadas.', 404);


/**
 * Filtro por tipo de juego: si Admin fuerza Stroke Play o Stableford se
 * descartan las categorías del otro sistema ('auto' imprime todas).
 */
if ($sistemaFilter === 'stroke' || $sistemaFilter === 'stableford') {
    foreach ($cats as $k => $c) {
        $isStable = strpos(strtoupper((string)($c['sistema'] ?? '')), 'STABLE') !== false;
        if (($sistemaFilter === 'stableford') !== $isStable) unset($cats[$k]);
    }
    if (!$cats) {
        json_error('Ninguna categoría seleccionada corresponde al tipo de juego elegido.', 404);
    }
    $catIds = array_keys($cats);
    $catList = implode(',', $catIds);
}

// Campo del reporte: el recibido, el de la categoría (si existe la columna) o
// el primer campo válido del calendario de juego de esa fecha.
if (!$cEsc) {
    foreach ($cats as $c) { if ((int)($c['campoid'] ?? 0) > 0) { $cEsc = (int)$c['campoid']; break; } }
}
if (!$cEsc) {
    $cjRow = tj_one($conn, "SELECT campo FROM caljuego
                             WHERE torneoid = $tid AND fecha = '$fEsc' AND campo > 0
                             ORDER BY campo ASC LIMIT 1");
    $cEsc = $cjRow ? (int)$cjRow['campo'] : 0;
}

$courseRow = $cEsc ? tj_one($conn, "SELECT campo FROM campos WHERE id = $cEsc LIMIT 1") : null;

// ============= Hoyos del campo por tee de salida =============

/**
 * Convierte un valor de tiempo por hoyo a minutos.
 * Acepta minutos numéricos ("14", "14.0") y relojes ("00:14", "00:14:00").
 */
function tj_to_minutes($v) {
    if ($v === null) return 0;
    $s = trim((string)$v);
    if ($s === '') return 0;
    if (preg_match('/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/', $s, $m)) {
        return (int)$m[1] * 60 + (int)$m[2] + ((int)($m[3] ?? 0) >= 30 ? 1 : 0);
    }
    if (preg_match('/^\d+(?:\.\d+)?$/', $s)) return (int)round((float)$s);
    return 0;
}

/**
 * Minutos (y par) por hoyo tomados de la tabla `hoyos` — fuente editable por
 * el staff y por eso de máxima prioridad para el PAR TIME de la tarjeta.
 * @return array numero => ['par' => int, 'minutes' => int]
 */
function tj_hoyos_table($conn, $campoid) {
    $numCol   = tj_pick_column($conn, 'hoyos', ['numero', 'hoyo', 'num', 'nohoyo']);
    $campoCol = tj_pick_column($conn, 'hoyos', ['campoid', 'campo_id', 'campo']);
    $parCol   = tj_pick_column($conn, 'hoyos', ['par']);
    $minCol   = tj_pick_column($conn, 'hoyos', [
        'tiempo', 'minutos', 'tiempojuego', 'tiempo_juego', 'hora', 'horas',
        'partime', 'par_time', 'timepar', 'tpo', 'mins', 'minutosjuego',
    ]);
    if (!$numCol || !$minCol) return [];
    $sel = "`$numCol` AS numero, `$minCol` AS minutos" . ($parCol ? ", `$parCol` AS par" : ', NULL AS par');
    $where = ($campoCol && $campoid) ? "WHERE `$campoCol` = " . (int)$campoid : '';
    $out = [];
    foreach (tj_all($conn, "SELECT $sel FROM `hoyos` $where ORDER BY `$numCol` ASC") as $r) {
        $n = (int)$r['numero'];
        if ($n < 1 || $n > 18) continue;
        $out[$n] = ['par' => (int)($r['par'] ?? 0), 'minutes' => tj_to_minutes($r['minutos'])];
    }
    return $out;
}

/** Tiempos editables por el staff, cacheados una sola vez por request. */
$hoyosTable = tj_hoyos_table($conn, $cEsc);

/**
 * Hoyos (par / yardaje / ventaja / minutos) de un tee de salida del campo.
 * @return array numero => ['par','yardas','ventaja','minutes']
 */
function tj_holes($conn, $campoid, $salidaid, $hoyosTable, $parMinutes) {
    $holes = [];
    if (!$campoid) return $holes;
    $rows = tj_all($conn, "SELECT numero, par, yardaje, ventaja
                             FROM hoyosxsalida
                            WHERE campoid = " . (int)$campoid . "
                              AND salidaid = " . (int)$salidaid . "
                            ORDER BY numero ASC");
    foreach ($rows as $h) {
        $n = (int)$h['numero'];
        if ($n < 1 || $n > 18) continue;
        $par = (int)$h['par'];
        if ($par <= 0 && !empty($hoyosTable[$n]['par'])) $par = (int)$hoyosTable[$n]['par'];
        // Prioridad de minutos: `hoyos` (staff) → estimación por par.
        $min = (int)($hoyosTable[$n]['minutes'] ?? 0);
        if ($min <= 0) $min = $parMinutes[$par] ?? 15;
        $holes[$n] = [
            'par'     => $par,
            'yardas'  => (int)$h['yardaje'],
            'ventaja' => (int)$h['ventaja'],
            'minutes' => $min,
        ];
    }
    ksort($holes);
    return $holes;
}

/**
 * Hora estimada de juego por hoyo para un grupo.
 * El orden arranca en el hoyo de salida y da la vuelta (10,11,…,18,1,…,9).
 * @return array numero => "HH:MM"
 */
function tj_times($start, $hole, $holes) {
    if (!$holes || !preg_match('/^(\d{1,2}):(\d{2})/', (string)$start, $m)) return [];
    $mins = (int)$m[1] * 60 + (int)$m[2];
    $first = ($hole >= 1 && $hole <= 18) ? $hole : 1;
    $out = [];
    for ($i = 0; $i < 18; $i++) {
        $n = (($first - 1 + $i) % 18) + 1;
        if (!isset($holes[$n])) continue;
        $mins += (int)$holes[$n]['minutes'];
        $out[(string)$n] = sprintf('%02d:%02d', intdiv($mins, 60) % 24, $mins % 60);
    }
    return $out;
}

// ============= Grupos de salida de las categorías del día =============
$holeCol  = tj_hole_column($conn);
$holeExpr = $holeCol ? "sg.`$holeCol`" : 'NULL';
/*
 * ORDEN DE IMPRESIÓN DE TARJETAS: 1) hora inicial de salida, 2) número de
 * hoyo de salida. Los grupos sin hoyo registrado van al final del bloque de
 * su hora (COALESCE 99) en lugar de al principio.
 */
$holeOrderExpr = $holeCol ? "COALESCE(sg.`$holeCol`, 99)" : 'sg.id';

/** Grupos de salida por cada fecha solicitada (rango de días). */
$groupsByFecha = [];
/** Fecha larga en español por cada día, para la cabecera de cada tarjeta. */
$fechaFormatos = [];
foreach ($fechas as $f) {
    $fe = esc($conn, $f);
    $where = ["cj.torneoid = $tid", "cj.fecha = '$fe'", "sg.categoriaid IN ($catList)"];
    if ($cEsc) $where[] = "cj.campo = $cEsc";
    $where[] = "TIME(sg.horainicio1a) <> '00:00:00'";

    $groupsByFecha[$f] = tj_all($conn, "SELECT sg.id, sg.categoriaid,
                                LEFT(RIGHT(sg.horainicio1a, 8), 5) AS hora,
                                $holeExpr AS hoyo,
                                sg.teesal
                           FROM salidagrupo sg
                           JOIN caljuego cj ON (sg.caljuegoid = cj.id)
                           WHERE " . implode(' AND ', $where) . "
                           ORDER BY sg.horainicio1a ASC, $holeOrderExpr ASC, sg.id ASC");
    $row = tj_one($conn, "SELECT DATE_FORMAT('$fe', '%W, %e de %M %Y') AS f");
    $fechaFormatos[$f] = $row['f'] ?? $f;
}

/** Cache de hoyos por tee de salida (una consulta por salidaid). */
$holesBySalida = [];

/**
 * Cache del NOMBRE (color) del tee de salida por salidaid — el "AZULES" que
 * aparece bajo la hora en la tarjeta. Se lee de `campo_tee` por (campo, tee).
 */
$teeBySalida = [];
/** Devuelve el color del tee de salida para el campo del reporte. */
$teeName = function ($salidaid) use ($conn, $cEsc, &$teeBySalida) {
    if (!isset($teeBySalida[$salidaid])) {
        $row = $cEsc ? tj_one($conn, "SELECT tee FROM campo_tee
                                       WHERE campoid = " . (int)$cEsc . "
                                         AND salidaid = " . (int)$salidaid . " LIMIT 1") : null;
        $teeBySalida[$salidaid] = $row['tee'] ?? '';
    }
    return $teeBySalida[$salidaid];
};



/** Columnas realmente disponibles en la vista de salidas por jugador. */
$vsjCols  = tj_columns($conn, 'v_sal_jug');
$hasCol   = function ($name) use ($vsjCols) {
    foreach ($vsjCols as $c) if (strcasecmp($c, $name) === 0) return true;
    return false;
};

$cards = [];
foreach ($groupsByFecha as $gFecha => $groups) {
foreach ($groups as $g) {
    $catId = (int)$g['categoriaid'];
    if (!isset($cats[$catId])) continue;
    $cat = $cats[$catId];

    $salidaid = (int)$cat['salida'];
    if (!isset($holesBySalida[$salidaid])) {
        $holesBySalida[$salidaid] = tj_holes($conn, $cEsc, $salidaid, $hoyosTable, $TJ_PAR_MINUTES);
    }
    $holes = $holesBySalida[$salidaid];

    $hole  = tj_group_hole($g);
    $times = tj_times($g['hora'] ?? '', $hole, $holes);
    $gid   = (int)$g['id'];

    // Jugadores del grupo, en el orden de la salida.
    $sel = ["jugadorid", "nombre", "apellido"];
    /*
      Además de los datos del jugador se piden las columnas que la BD pueda
      exponer con el HANDICAP NETO ya calculado (`hcpneto` / `vtjajug` /
      `handicapneto`). Si existen se usan como fuente de verdad; si no, el
      neto se deriva sumando los golpes de ventaja por hoyo (ventajasjug).
    */
    foreach ([
        'numjugador', 'club', 'tee', 'ventajasjug', 'tarjetaid', 'indexjgo', 'orden',
        'hcpneto', 'handicapneto', 'vtjajug',
    ] as $opt) {
        if ($hasCol($opt)) $sel[] = $opt;
    }
    $players = tj_all($conn, "SELECT " . implode(', ', $sel) . "
                                FROM v_sal_jug
                               WHERE salidagrupoid = $gid
                               ORDER BY " . ($hasCol('orden') ? 'orden ASC, ' : '') . "apellido ASC, nombre ASC");

    foreach ($players as $p) {
        /** Golpes de ventaja por hoyo (CSV en la vista) — 18 valores. */
        $ventajas = [];
        $csv = isset($p['ventajasjug']) ? (string)$p['ventajasjug'] : '';
        $parts = $csv !== '' ? array_map('intval', explode(',', $csv)) : [];
        for ($i = 0; $i < 18; $i++) $ventajas[] = $parts[$i] ?? 0;

        /** Renglones de hoyo 1..18 con par / yardas / ventaja / par time. */
        $holeRows = [];
        for ($n = 1; $n <= 18; $n++) {
            $h = $holes[$n] ?? null;
            $holeRows[] = [
                'numero'   => $n,
                'par'      => $h ? $h['par'] : null,
                'yardas'   => $h ? $h['yardas'] : null,
                'ventaja'  => $h ? $h['ventaja'] : null,
                'parTime'  => $times[(string)$n] ?? '',
                'handicap' => $ventajas[$n - 1],
            ];
        }

        /** Totales de ida (V1), vuelta (V2) y totales generales. */
        $sum = function ($from, $to, $key) use ($holeRows) {
            $t = 0;
            for ($i = $from; $i <= $to; $i++) $t += (int)($holeRows[$i - 1][$key] ?? 0);
            return $t;
        };

        /*
          Resuelve el HCP. NETO según el campo configurado en Admin
          (`hcpfield`), con la suma de ventajas por hoyo como respaldo.

          Modo 'match': valida automáticamente todas las columnas netas
          disponibles (hcpneto, handicapneto, vtjajug) contra el neto calculado
          por ventajas por hoyo y elige la que menos difiere. Con empate gana
          el orden de preferencia; si ninguna existe se usa la suma de ventajas.
        */
        $hcpSuma = array_sum($ventajas);
        $hcpPick = ['value' => $hcpSuma, 'source' => 'ventajas'];
        /**
         * Valores crudos de las columnas netas de la BD, para la AUDITORÍA en
         * pantalla (modo auditoría de Admin → Tarjetas). Sólo se incluyen las
         * columnas que la vista realmente expone.
         */
        $hcpDb = [];
        foreach (['hcpneto', 'handicapneto', 'vtjajug'] as $col) {
            if (isset($p[$col]) && $p[$col] !== '' && $p[$col] !== null) {
                $hcpDb[$col] = (int)round((float)$p[$col]);
            }
        }
        /** Regla aplicada para elegir el valor impreso (texto legible). */
        $hcpRule = 'Suma de ventajas por hoyo (sin columna neta en la BD)';
        if ($hcpField === 'match') {
            $mejor = null; // ['value','source','diff']
            foreach (['hcpneto', 'handicapneto', 'vtjajug'] as $col) {
                if (!isset($hcpDb[$col])) continue;
                $val = $hcpDb[$col];
                $diff = abs($val - $hcpSuma);
                if ($mejor === null || $diff < $mejor['diff']) {
                    $mejor = ['value' => $val, 'source' => $col . ' (match)', 'diff' => $diff, 'col' => $col];
                }
                if ($diff === 0) break; // coincidencia exacta: no hay mejor opción
            }
            if ($mejor !== null) {
                $hcpPick = ['value' => $mejor['value'], 'source' => $mejor['source']];
                $hcpRule = 'Mejor coincidencia: ' . $mejor['col']
                    . ' (diferencia ' . $mejor['diff'] . ' vs ventajas por hoyo)';
            } else {
                $hcpRule = 'Mejor coincidencia: ninguna columna neta disponible, se usó la suma de ventajas';
            }
        } elseif ($hcpField !== 'ventajas') {
            $candidatos = $hcpField === 'auto'
                ? ['hcpneto', 'handicapneto', 'vtjajug']
                : [$hcpField];
            foreach ($candidatos as $col) {
                if (isset($hcpDb[$col])) {
                    $hcpPick = ['value' => $hcpDb[$col], 'source' => $col];
                    $hcpRule = ($hcpField === 'auto' ? 'Automático: ' : 'Columna fija: ') . $col;
                    break;
                }
            }
        } else {
            $hcpRule = 'Forzado: suma de ventajas por hoyo';
        }



        $cards[] = [
            'groupId'      => (string)$gid,
            /** Día de juego de esta tarjeta (útil al imprimir un rango). */
            'fecha'        => (string)$gFecha,
            'fechaFormato' => $fechaFormatos[$gFecha] ?? (string)$gFecha,
            'hole'         => $hole,
            'time'         => $g['hora'] ?? '',
            'teeSal'       => $g['teesal'] ?? '',
            /** Color del tee: el de la vista y, si viene vacío, el de campo_tee. */
            'tee'          => !empty($p['tee']) ? $p['tee'] : $teeName($salidaid),

            'playerId'     => (string)($p['jugadorid'] ?? ''),
            /*
              ID impreso en la tarjeta: SIEMPRE el ID DE JUGADOR de la base
              (`jugadorid`), no el ID SPEi (`numjugador`), que sólo queda como
              respaldo cuando el registro no trae jugadorid.
            */
            'playerNumber' => (string)($p['jugadorid'] ?? ($p['numjugador'] ?? '')),
            'name'         => trim(($p['nombre'] ?? '') . ' ' . ($p['apellido'] ?? '')),
            'club'         => $p['club'] ?? '',
            'folio'        => (string)($p['tarjetaid'] ?? ''),
            'categoryId'   => (string)$catId,
            'categoryName' => $cat['categoria'] ?? '',
            'shortName'    => $cat['abreviatura'] ?? '',
            'system'       => strtoupper($cat['sistema'] ?? ''),
            /**
             * HCP. NETO del jugador (handicap de juego que se imprime arriba).
             * Prioridad:
             *   1) Columna con el neto ya calculado en la BD (hcpneto /
             *      handicapneto / vtjajug), cuando la vista la expone.
             *   2) Suma de los golpes de ventaja por hoyo (ventajasjug), que es
             *      exactamente el mismo neto repartido hoyo por hoyo.
             * Nunca se usa el índice (indexjgo), que es HCP índice y no neto.
             */
            /*
              HCP. NETO impreso + datos para la VALIDACIÓN en pantalla:
                · hcp          → valor que se imprime (según `hcpfield`).
                · hcpVentajas  → neto derivado de la suma de ventajas por hoyo.
                · hcpSource    → de dónde salió el valor impreso.
              La interfaz compara `hcp` vs `hcpVentajas` y marca discrepancias.
              Nunca se usa el índice (indexjgo), que es HCP índice y no neto.
            */
            'hcp'          => $hcpPick['value'],
            'hcpVentajas'  => array_sum($ventajas),
            'hcpSource'    => $hcpPick['source'],
            /** Regla legible con la que se eligió el valor impreso. */
            'hcpRule'      => $hcpRule,
            /** Valores crudos de las columnas netas de la BD (auditoría). */
            'hcpDb'        => $hcpDb,
            /**
             * Golpes de ventaja por hoyo del jugador (18 valores). El reparto
             * depende de la MESA DE SALIDA (tee) registrada al jugador, no del
             * handicap de la categoría: por eso es la referencia de auditoría.
             */
            'hcpPorHoyo'   => $ventajas,

            'holes'        => $holeRows,
            'totals'       => [
                'parOut'      => $sum(1, 9, 'par'),
                'parIn'       => $sum(10, 18, 'par'),
                'par'         => $sum(1, 18, 'par'),
                'yardasOut'   => $sum(1, 9, 'yardas'),
                'yardasIn'    => $sum(10, 18, 'yardas'),
                'yardas'      => $sum(1, 18, 'yardas'),
                'handicapOut' => $sum(1, 9, 'handicap'),
                'handicapIn'  => $sum(10, 18, 'handicap'),
                'handicap'    => $sum(1, 18, 'handicap'),
            ],
        ];
    }
}
}

// ============= MATCH PLAY: una tarjeta por enfrentamiento =============
/**
 * Agrupa las tarjetas individuales en tarjetas de MATCH: cada tarjeta queda con
 * el jugador A en su nivel principal (para reutilizar el encabezado de Stroke
 * Play / Stableford) y el jugador B en `opponent`.
 *
 * Fuente de los enfrentamientos: `torneos.elimin_salidas_cat`
 * (catid, matchx, jugida, jugidb, fecha). Un jugador puede aparecer en varias
 * rondas, por eso se prioriza la fila cuya fecha coincide con el día impreso y
 * se exige que AMBOS contendientes estén en el mismo grupo de salida.
 * Si la base no tiene el enfrentamiento, se emparejan de dos en dos en el orden
 * de la salida (mismo criterio que la vista pública de Salidas).
 */
if ($matchPlay) {
    /** Filas canónicas de enfrentamientos de las categorías impresas. */
    $matchRows = tj_all($conn, "SELECT catid, matchx, jugida, jugidb, fecha
                                  FROM elimin_salidas_cat
                                 WHERE catid IN ($catList)");

    /** Siembra/posición del jugador (columna variable entre instalaciones). */
    $posByPlayer = [];
    $posCol = tj_pick_column($conn, 'jugadores', ['grupo', 'posgrupo', 'posicion']);
    if ($posCol) {
        $ids = [];
        foreach ($cards as $c) { if ((int)$c['playerId'] > 0) $ids[(int)$c['playerId']] = true; }
        if ($ids) {
            $idList = implode(',', array_map('intval', array_keys($ids)));
            foreach (tj_all($conn, "SELECT id, `$posCol` AS pos FROM jugadores WHERE id IN ($idList)") as $r) {
                if ($r['pos'] !== null && $r['pos'] !== '') $posByPlayer[(int)$r['id']] = (string)$r['pos'];
            }
        }
    }

    /**
     * Busca el enfrentamiento de dos jugadores de una categoría.
     * @return array|null ['matchNo' => string, 'exact' => bool]
     */
    $findMatch = function ($catId, $a, $b) use ($matchRows) {
        $hit = null;
        foreach ($matchRows as $r) {
            if ((int)$r['catid'] !== (int)$catId) continue;
            $ja = (int)$r['jugida'];
            $jb = (int)$r['jugidb'];
            if (($ja === (int)$a && $jb === (int)$b) || ($ja === (int)$b && $jb === (int)$a)) {
                $hit = ['matchNo' => (string)$r['matchx'], 'fecha' => (string)($r['fecha'] ?? '')];
                break;
            }
        }
        return $hit;
    };

    /** Datos del segundo contendiente que se imprimen dentro de la tarjeta. */
    $opponentOf = function ($c) use ($posByPlayer) {
        return [
            'playerId'   => $c['playerId'],
            'name'       => $c['name'],
            'club'       => $c['club'],
            'folio'      => $c['folio'],
            'hcp'        => $c['hcp'],
            'hcpPorHoyo' => $c['hcpPorHoyo'],
            'position'   => $posByPlayer[(int)$c['playerId']] ?? '',
        ];
    };

    /** Tarjetas agrupadas por (día, grupo de salida) conservando el orden. */
    $byGroup = [];
    foreach ($cards as $c) {
        $byGroup[$c['fecha'] . '|' . $c['groupId']][] = $c;
    }

    $matchCards = [];
    foreach ($byGroup as $groupCards) {
        $pending = $groupCards;
        while ($pending) {
            $a = array_shift($pending);
            $partnerIdx = null;
            $matchNo = '';
            // 1) Enfrentamiento real de la base, dentro del mismo grupo de salida.
            foreach ($pending as $i => $b) {
                $hit = $findMatch($a['categoryId'], $a['playerId'], $b['playerId']);
                if ($hit) { $partnerIdx = $i; $matchNo = $hit['matchNo']; break; }
            }
            // 2) Respaldo: de dos en dos en el orden de la salida.
            if ($partnerIdx === null && $pending) $partnerIdx = array_key_first($pending);
            $b = null;
            if ($partnerIdx !== null) {
                $b = $pending[$partnerIdx];
                unset($pending[$partnerIdx]);
                $pending = array_values($pending);
            }
            $card = $a;
            $card['matchNo']  = $matchNo;
            $card['position'] = $posByPlayer[(int)$a['playerId']] ?? '';
            $card['opponent'] = $b ? $opponentOf($b) : null;
            $matchCards[] = $card;
        }
    }
    $cards = $matchCards;
}



$payload = [
    'tournament'   => $head['nombre'] ?? '',
    'club'         => $head['club'] ?? '',
    'course'       => $courseRow['campo'] ?? '',
    /** Logo del encabezado del torneo (`torneo.logo_header`). */
    'logoHeader'   => !empty($head['logo_header']) ? $LOGOS_BASE_URL . $head['logo_header'] : '',
    'fecha'        => $fecha,
    'fechaFormato' => $fechaFmt['f'] ?? $fecha,
    /** Todos los días incluidos en el reporte (rango). */
    'fechas'       => $fechas,
    'cards'        => $cards,
];

// Modo diagnóstico (?debug=1): no altera la forma del JSON de producción.
if (optional_param('debug') === '1') {
    $payload['_debug'] = [
        'holeColumn'  => $holeCol,
        'groupsFound' => count($groups),
        'cardsBuilt'  => count($cards),
        'campoid'     => $cEsc,
        'salidas'     => array_keys($holesBySalida),
        'holesPerSalida' => array_map('count', $holesBySalida),
    ];
}

json_response($payload);
