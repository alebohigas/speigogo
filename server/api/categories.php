<?php
/**
 * Categories Endpoint
 * GET /api/categories.php?torneoid=XXX
 * Returns all active categories with player counts
 */
require_once 'config.php';

$torneoid = require_param('torneoid');
$tid = esc($conn, $torneoid);

/**
 * Check whether a table exists without throwing SQL output into the JSON body.
 * Used here because some deployed tournament databases lag behind optional
 * Pre-Registro schema additions.
 */
function categories_table_exists($conn, $table) {
    $table = esc($conn, $table);
    $r = @$conn->query("SHOW TABLES LIKE '$table'");
    $exists = $r && $r->num_rows > 0;
    if ($r) $r->free();
    return $exists;
}

/**
 * Check whether a column exists in a table. Keeps categories.php backwards
 * compatible with older IONOS MySQL schemas where registro columns may differ.
 */
function categories_column_exists($conn, $table, $column) {
    $table = esc($conn, $table);
    $column = esc($conn, $column);
    $r = @$conn->query("SHOW COLUMNS FROM `$table` LIKE '$column'");
    $exists = $r && $r->num_rows > 0;
    if ($r) $r->free();
    return $exists;
}

/**
 * Return the first existing column from a list of legacy-compatible names.
 */
function categories_first_existing_column($conn, $table, $columns) {
    foreach ($columns as $column) {
        if (categories_column_exists($conn, $table, $column)) return $column;
    }
    return null;
}

/**
 * Optional `?skin=1` flag.
 * When set, the endpoint returns only categories that have at least one
 * player enrolled in the SKIN GAME (jugadores.Skeenjuga = 1), and the
 * `playerCount` reflects only those skin-enrolled players. Also filters
 * out related sub-categories (categorias.catrel <> 0) so the /skinplayers
 * grid mirrors the legacy `jugadores_skin.php` view.
 */
$skinOnly = isset($_GET['skin']) && $_GET['skin'] === '1';
$playerJoinCond = $skinOnly
    ? "(a.categoria_id = b.categoriaid AND b.Skeenjuga = 1)"
    : "(a.categoria_id = b.categoriaid)";
$skinCatFilter = $skinOnly ? " AND a.catrel = 0 " : '';

/** Detect new optional age-range columns added for the Pre-Registro feature. */
$ageMinExists = $conn->query("SHOW COLUMNS FROM categorias LIKE 'age_range_min'");
$ageMinExists = $ageMinExists && $ageMinExists->num_rows > 0;
$ageMaxExists = $conn->query("SHOW COLUMNS FROM categorias LIKE 'age_range_max'");
$ageMaxExists = $ageMaxExists && $ageMaxExists->num_rows > 0;
$ageMinSel = $ageMinExists ? ', a.age_range_min' : '';
$ageMaxSel = $ageMaxExists ? ', a.age_range_max' : '';

/**
 * registeredCount source for Pre-Registro availability.
 *
 * Recent behavior: count existing rows in `registro` for the same tournament
 * and category so the public form shows the real queue/lista de espera. This
 * block is defensive: if an older production DB is missing `registro` or uses
 * a legacy tournament/category column name, the endpoint still returns
 * categories with registeredCount=0 instead of failing the whole dropdown.
 */
$registeredCountSelect = '0 AS registeredCount';
if (categories_table_exists($conn, 'registro')) {
    $registroTorneoCol = categories_first_existing_column($conn, 'registro', [
        'reg_id_torneo', 'torneo_id', 'id_torneo', 'idtorneo', 'reg_torneoid', 'reg_torneo_id', 'torneoid'
    ]);
    $registroCategoriaCol = categories_first_existing_column($conn, 'registro', [
        'reg_categoria', 'categoriaid', 'categoria_id', 'catid'
    ]);
    if ($registroTorneoCol && $registroCategoriaCol) {
        $statusFilter = categories_column_exists($conn, 'registro', 'status_pago')
            ? ' AND (r.`status_pago` IS NULL OR r.`status_pago` <> 99)'
            : '';
        $registeredCountSelect = "(SELECT COUNT(*) FROM registro r
                   WHERE r.`$registroTorneoCol` = a.torneo_id
                     AND r.`$registroCategoriaCol` = a.categoria_id$statusFilter) AS registeredCount";
    }
}

/**
 * Columnas opcionales de `categorias`.
 *
 * Algunas bases (p. ej. speigogo) no tienen todas las columnas legacy
 * (`catrel`, `corte`, `Skin_grupo_id`, ...). Antes esto provocaba un 500
 * ("Unknown column 'a.catrel'") y dejaba /equipos y /jugadores sin datos.
 * Ahora cada columna ausente se sustituye por `NULL AS <columna>`.
 */
$optionalCols = [
    'abreviatura', 'sistema', 'formato', 'estilo', 'hcpIdxMin', 'hcpIdxMax',
    'porcentaje', 'hoyosajugar', 'hoyosacorte', 'salida', 'gross', 'catrel',
    'sexo', 'corte', 'maxjugadores', 'hoyosxronda', 'Skin_grupo_id',
    'Skeenporcent', 'age_range_min', 'age_range_max',
];
$selParts = [];
$groupParts = [];
foreach ($optionalCols as $col) {
    if (categories_column_exists($conn, 'categorias', $col)) {
        $selParts[] = "a.`$col`";
        $groupParts[] = "a.`$col`";
    } else {
        $selParts[] = "NULL AS `$col`";
    }
}
$optSel = $selParts ? ', ' . implode(', ', $selParts) : '';
$optGroup = $groupParts ? ', ' . implode(', ', $groupParts) : '';

/** El filtro de sub-categorías del skin solo aplica si existe `catrel`. */
if ($skinCatFilter !== '' && !categories_column_exists($conn, 'categorias', 'catrel')) {
    $skinCatFilter = '';
}
/** El join del skin solo usa `Skeenjuga` si la columna existe. */
if ($skinOnly && !categories_column_exists($conn, 'jugadores', 'Skeenjuga')) {
    $playerJoinCond = "(a.categoria_id = b.categoriaid)";
}
/** `salidas`/`campo_tee` requieren `categorias.salida`. */
$hasSalida = categories_column_exists($conn, 'categorias', 'salida');
$salidaJoins = $hasSalida
    ? "LEFT JOIN salidas s ON (a.salida = s.id)
        LEFT JOIN campo_tee ct ON (ct.salidaid = a.salida AND ct.campoid = COALESCE(
            (SELECT cj.campo FROM caljuego cj
              WHERE cj.categoriaid = a.categoria_id AND cj.campo > 0
              ORDER BY cj.campo ASC LIMIT 1),
            (SELECT ct2.campoid FROM campo_tee ct2
              WHERE ct2.salidaid = a.salida
              ORDER BY ct2.campoid ASC LIMIT 1)
        ))"
    : '';
$teeSel = $hasSalida
    ? "s.tee AS teeName, s.color AS teeColorName, ct.rating, ct.slope, ct.parcampo"
    : "NULL AS teeName, NULL AS teeColorName, NULL AS rating, NULL AS slope, NULL AS parcampo";
$teeGroup = $hasSalida ? ", s.tee, s.color, ct.rating, ct.slope, ct.parcampo" : '';

/** Query: fetch categories with player count, tee info, rating & slope */
$sql = "SELECT a.categoria_id, a.torneo_id, a.categoria$optSel,
                COUNT(b.id) as playerCount,
                $registeredCountSelect,
                $teeSel
        FROM categorias a
        LEFT JOIN jugadores b ON $playerJoinCond
        $salidaJoins
        WHERE a.estatus = 1 AND a.torneo_id = $tid $skinCatFilter
        GROUP BY a.categoria_id, a.torneo_id, a.categoria$optGroup$teeGroup
        " . ($skinOnly ? " HAVING playerCount > 0 " : "") . "
        ORDER BY a.categoria_id ASC";


$rows = query_all($conn, $sql);

/** Map DB rows to JSON response format */
$categories = array_map(function($row) {
    return [
        'id'          => $row['categoria_id'],
        'name'        => $row['categoria'],
        'shortName'   => $row['abreviatura'],
        'system'      => $row['sistema'],
        'format'      => $row['formato'],
        'style'       => $row['estilo'],
        'hcpMin'      => (float)$row['hcpIdxMin'],
        'hcpMax'      => (float)$row['hcpIdxMax'],
        'percentage'  => (float)$row['porcentaje'],
        /** Valor textual EXACTO de categorias.porcentaje tal como está en la BD
         *  (p.ej. "80.00", "87.5"). El frontend lo usa en la columna VENTAJAS
         *  de /convocatoria para respetar el redondeo/decimales originales. */
        'percentageRaw' => isset($row['porcentaje']) && $row['porcentaje'] !== null
                            ? (string)$row['porcentaje']
                            : null,
        'holes'       => (int)$row['hoyosajugar'],
        'cutHoles'    => (int)$row['hoyosacorte'],
        // Final cut count (categorias.corte) — number of players advancing to the final round.
        'finalCut'    => isset($row['corte']) ? (int)$row['corte'] : 0,
        'teeId'       => $row['salida'],
        'gross'       => (int)$row['gross'],
        'relatedCat'  => $row['catrel'],
        'gender'      => $row['sexo'],
        'playerCount' => (int)$row['playerCount'],
        /** True cuando la categoría es de parejas (formato='PAREJAS'). El frontend
         *  usa esto en /jugadores y /resultados para activar agrupación por grupoid
         *  y tarjetas de parejas (Go Go, Bola Baja, Suma Scores).
         */
        'isParejas'   => (strtoupper($row['formato'] ?? '') === 'PAREJAS'),
        // Number of players actively registered in this category via the
        // Pre-Registro flow (jugadores.tipoinsc=1 AND tipoinsc2=3). Used by
        // the public registration form to display "spots available" next to
        // each category in the dropdown.
        'registeredCount' => isset($row['registeredCount']) ? (int)$row['registeredCount'] : 0,
        'maxPlayers'  => isset($row['maxjugadores']) ? (int)$row['maxjugadores'] : 0,
        'holesPerRound'=> isset($row['hoyosxronda']) ? (int)$row['hoyosxronda'] : 18,
        'teeName'     => $row['teeName'] ?? '',
        'teeColorName'=> $row['teeColorName'] ?? '',
        'rating'      => $row['rating'] !== null ? (float)$row['rating'] : null,
        'slope'       => $row['slope'] !== null ? (int)$row['slope'] : null,
        'par'         => $row['parcampo'] !== null ? (int)$row['parcampo'] : null,
        // Age-range bounds for senior/age-restricted categories. NULL when
        // the column is absent or the value is not configured.
        'ageMin'      => isset($row['age_range_min']) && $row['age_range_min'] !== null ? (int)$row['age_range_min'] : null,
        'ageMax'      => isset($row['age_range_max']) && $row['age_range_max'] !== null ? (int)$row['age_range_max'] : null,
        /** Skin game grouping identifier (categorias.Skin_grupo_id).
         *  Categorías con el mismo Skin_grupo_id comparten bolsa de skins. */
        'skinGroupId' => isset($row['Skin_grupo_id']) ? (string)$row['Skin_grupo_id'] : '',
        /** Porcentaje de handicap aplicado específicamente para el Skin Game
         *  (categorias.Skeenporcent). Distinto de `percentage` regular. */
        'skinPercent' => isset($row['Skeenporcent']) ? (float)$row['Skeenporcent'] : 0,
    ];
}, $rows);

json_response($categories);
