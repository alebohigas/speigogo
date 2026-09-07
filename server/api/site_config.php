<?php
/**
 * Site Config Endpoint
 * GET  /api/site_config.php  - Returns torneoid + menu_order for current domain
 * POST /api/site_config.php  - Saves torneoid and/or menu_order for current domain (admin)
 * 
 * Uses `site_config` table:
 * 
 * CREATE TABLE IF NOT EXISTS site_config (
 *   domain VARCHAR(255) NOT NULL PRIMARY KEY,
 *   torneoid INT NOT NULL,
 *   menu_order TEXT DEFAULT NULL COMMENT 'JSON object mapping pageId to order number',
 *   visibility TEXT DEFAULT NULL COMMENT 'JSON object mapping pageId to boolean',
 *   menu_groups TEXT DEFAULT NULL COMMENT 'JSON array of menu group configs',
 *   page_group_assignments TEXT DEFAULT NULL COMMENT 'JSON object mapping pageId to groupId',
 *   live_scoring_config TEXT DEFAULT NULL COMMENT 'JSON object with live scoring page settings',
 *   sponsors_config TEXT DEFAULT NULL COMMENT 'JSON object with sponsors page display settings (e.g. column count)',
 *   eventos_config TEXT DEFAULT NULL COMMENT 'JSON object with eventos page display settings (cols/gap per breakpoint)',
 *   avisos_config TEXT DEFAULT NULL COMMENT 'JSON object with avisos page display settings (cols/gap per breakpoint)',
 *   theme_config TEXT DEFAULT NULL COMMENT 'JSON object with the active color palette {name, primary, secondary, accent, background} in HSL strings',
 *   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
 * );
 */
require_once 'config.php';
require_once '_staff_auth.php';

// Allow POST for saving config
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

// Get the current domain from Host header
$domain = $_SERVER['HTTP_HOST'] ?? 'localhost';
$domain = esc($conn, $domain);

/**
 * Alcance de la configuración (multi-torneo).
 *  - 'general'  → configuración compartida del dominio (por defecto, y lo que
 *                 usaban los sitios de un solo torneo antes de esta versión).
 *  - '<torneoid>' → configuración propia de ese torneo.
 * Se recibe por ?scope= en GET y por "scope" en el cuerpo del POST.
 */
function site_config_scope($raw) {
    $raw = trim((string)$raw);
    if ($raw === '' || strtolower($raw) === 'general') return 'general';
    // Sólo se aceptan torneoids numéricos como alcance.
    return ctype_digit($raw) ? $raw : 'general';
}

/** ¿La tabla ya tiene la columna scope (migración multi-torneo aplicada)? */
function site_config_has_scope($conn) {
    static $has = null;
    if ($has !== null) return $has;
    $r = $conn->query("SHOW COLUMNS FROM site_config LIKE 'scope'");
    $has = $r && $r->num_rows > 0;
    return $has;
}
$hasScope = site_config_has_scope($conn);

/** Cláusula WHERE del alcance pedido (compatible con esquemas sin scope). */
function site_config_where($conn, $domain, $scope) {
    $w = "domain = '$domain'";
    if (site_config_has_scope($conn)) {
        $w .= " AND scope = '" . esc($conn, $scope) . "'";
    }
    return $w;
}


/**
 * Detect whether the live_scoring_config column exists.
 * This keeps the endpoint backward-compatible on servers
 * where the schema has not been updated yet.
 */
function site_config_has_live_scoring_config($conn) {
    static $hasColumn = null;

    if ($hasColumn !== null) {
        return $hasColumn;
    }

    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'live_scoring_config'");
    $hasColumn = $result && $result->num_rows > 0;

    return $hasColumn;
}

$hasLiveScoringConfig = site_config_has_live_scoring_config($conn);

/**
 * Detect whether the sponsors_config column exists.
 * Keeps endpoint backward-compatible if the schema has not been migrated yet.
 */
function site_config_has_sponsors_config($conn) {
    static $hasColumn = null;

    if ($hasColumn !== null) {
        return $hasColumn;
    }

    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'sponsors_config'");
    $hasColumn = $result && $result->num_rows > 0;

    return $hasColumn;
}

$hasSponsorsConfig = site_config_has_sponsors_config($conn);

/**
 * Detect whether the eventos_config column exists.
 * Keeps endpoint backward-compatible if the schema has not been migrated yet.
 */
function site_config_has_eventos_config($conn) {
    static $hasColumn = null;

    if ($hasColumn !== null) {
        return $hasColumn;
    }

    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'eventos_config'");
    $hasColumn = $result && $result->num_rows > 0;

    return $hasColumn;
}

$hasEventosConfig = site_config_has_eventos_config($conn);

/**
 * Detect whether the avisos_config column exists.
 * Keeps endpoint backward-compatible if the schema has not been migrated yet.
 */
function site_config_has_avisos_config($conn) {
    static $hasColumn = null;

    if ($hasColumn !== null) {
        return $hasColumn;
    }

    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'avisos_config'");
    $hasColumn = $result && $result->num_rows > 0;

    return $hasColumn;
}

$hasAvisosConfig = site_config_has_avisos_config($conn);

/**
 * Detect whether the menus_config column exists.
 * Keeps the endpoint backward-compatible until the schema migration runs.
 */
function site_config_has_menus_config($conn) {
    static $hasColumn = null;

    if ($hasColumn !== null) {
        return $hasColumn;
    }

    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'menus_config'");
    $hasColumn = $result && $result->num_rows > 0;

    return $hasColumn;
}

$hasMenusConfig = site_config_has_menus_config($conn);

/**
 * Detect whether the premios_config column exists.
 * Keeps endpoint backward-compatible until the schema migration runs.
 */
function site_config_has_premios_config($conn) {
    static $hasColumn = null;
    if ($hasColumn !== null) return $hasColumn;
    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'premios_config'");
    $hasColumn = $result && $result->num_rows > 0;
    return $hasColumn;
}

$hasPremiosConfig = site_config_has_premios_config($conn);

/**
 * Detect whether the hoteles_config column exists.
 * Keeps endpoint backward-compatible until the schema migration runs.
 */
function site_config_has_hoteles_config($conn) {
    static $hasColumn = null;
    if ($hasColumn !== null) return $hasColumn;
    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'hoteles_config'");
    $hasColumn = $result && $result->num_rows > 0;
    return $hasColumn;
}

$hasHotelesConfig = site_config_has_hoteles_config($conn);

/**
 * Detect whether the theme_config column exists.
 * Keeps endpoint backward-compatible if the schema has not been migrated yet.
 */
function site_config_has_theme_config($conn) {
    static $hasColumn = null;
    if ($hasColumn !== null) return $hasColumn;
    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'theme_config'");
    $hasColumn = $result && $result->num_rows > 0;
    return $hasColumn;
}

$hasThemeConfig = site_config_has_theme_config($conn);

/**
 * Detect whether the stats_config column exists.
 * Stores per-domain overrides for the home Stats ribbon (numbers shown
 * to users). Missing column => endpoint silently returns null so the
 * frontend always falls back to auto-computed values.
 */
function site_config_has_stats_config($conn) {
    static $hasColumn = null;
    if ($hasColumn !== null) return $hasColumn;
    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'stats_config'");
    $hasColumn = $result && $result->num_rows > 0;
    return $hasColumn;
}

$hasStatsConfig = site_config_has_stats_config($conn);

/**
 * Detect whether the popup_config column exists.
 * Stores the site-wide POP UP overlay configuration (active image URL,
 * which routes it shows on, auto-dismiss duration, and rendered width).
 * Missing column => endpoint silently returns null so the frontend
 * disables the overlay until the schema is migrated.
 */
function site_config_has_popup_config($conn) {
    static $hasColumn = null;
    if ($hasColumn !== null) return $hasColumn;
    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'popup_config'");
    $hasColumn = $result && $result->num_rows > 0;
    return $hasColumn;
}

$hasPopupConfig = site_config_has_popup_config($conn);

/**
 * Detect whether the anuncio_config column exists.
 * Stores the scrolling announcement ribbon settings that render between
 * the top header and the sponsor ribbon.
 */
function site_config_has_anuncio_config($conn) {
    static $hasColumn = null;
    if ($hasColumn !== null) return $hasColumn;
    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'anuncio_config'");
    $hasColumn = $result && $result->num_rows > 0;
    return $hasColumn;
}

$hasAnuncioConfig = site_config_has_anuncio_config($conn);

/**
 * Detect whether the stats_page_config column exists.
 * Stores per-domain config for the public /stats page: section order,
 * per-section visibility, and manual overrides (clubes/categoria/jugador).
 */
function site_config_has_stats_page_config($conn) {
    static $hasColumn = null;
    if ($hasColumn !== null) return $hasColumn;
    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'stats_page_config'");
    $hasColumn = $result && $result->num_rows > 0;
    return $hasColumn;
}

$hasStatsPageConfig = site_config_has_stats_page_config($conn);

/**
 * Detect whether the home_config column exists. Stores home page
 * customizations (CTA buttons on the hero). Missing column => endpoint
 * silently returns null so the frontend uses the default fallback pair.
 */
function site_config_has_home_config($conn) {
    static $hasColumn = null;
    if ($hasColumn !== null) return $hasColumn;
    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'home_config'");
    $hasColumn = $result && $result->num_rows > 0;
    return $hasColumn;
}

$hasHomeConfig = site_config_has_home_config($conn);

/**
 * Detect whether the historial_config column exists. Stores the /historial
 * page config: up to 5 previous editions (year + torneo_id) used to query
 * past leaderboards. If the column is missing we attempt to create it once
 * (self-healing migration) so the admin tab works without manual SQL; if the
 * hosting user lacks ALTER privileges the endpoint keeps returning null.
 */
function site_config_has_historial_config($conn) {
    static $hasColumn = null;
    if ($hasColumn !== null) return $hasColumn;
    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'historial_config'");
    $hasColumn = $result && $result->num_rows > 0;
    if (!$hasColumn) {
        // Self-healing: create the column on first use (MySQL has no
        // "ADD COLUMN IF NOT EXISTS", hence the prior existence check).
        if (@$conn->query("ALTER TABLE site_config ADD COLUMN historial_config TEXT DEFAULT NULL COMMENT 'JSON object with /historial page config'")) {
            $hasColumn = true;
        } else {
            error_log('site_config: could not add historial_config column: ' . $conn->error);
        }
    }
    return $hasColumn;
}

$hasHistorialConfig = site_config_has_historial_config($conn);

/**
 * Detect whether the tarjetas_config column exists. Stores the Admin >
 * Tarjetas print layout: margen de cabecera (mm), margen lateral (mm),
 * escala (%) y tipo de juego (auto/stroke/stableford), de modo que la
 * maquetación no dependa del localStorage del navegador.
 *
 *   { "sistema": "auto", "headerMm": 30, "marginMm": 8, "scale": 100 }
 *
 * Self-healing: crea la columna en el primer uso (no-op si el usuario de
 * hosting no tiene privilegios de ALTER).
 */
function site_config_has_tarjetas_config($conn) {
    static $hasColumn = null;
    if ($hasColumn !== null) return $hasColumn;
    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'tarjetas_config'");
    $hasColumn = $result && $result->num_rows > 0;
    if (!$hasColumn) {
        if (@$conn->query("ALTER TABLE site_config ADD COLUMN tarjetas_config TEXT DEFAULT NULL COMMENT 'JSON object with Admin > Tarjetas print layout config'")) {
            $hasColumn = true;
        } else {
            error_log('site_config: could not add tarjetas_config column: ' . $conn->error);
        }
    }
    return $hasColumn;
}

$hasTarjetasConfig = site_config_has_tarjetas_config($conn);

/**
 * Detect whether the hero_config column exists. Stores the per-tournament
 * hero (page background) overrides configured in Admin > Heros:
 *
 *   { "byTorneo": { "365": { "/convocatoria": { "url": "...", "active": true } } },
 *     "default":  { "/convocatoria": { "url": "...", "active": true } } }
 *
 * Self-healing: creates the column on first use so the admin tab works
 * without manual SQL (no-op when the hosting user lacks ALTER privileges).
 */
function site_config_has_hero_config($conn) {
    static $hasColumn = null;
    if ($hasColumn !== null) return $hasColumn;
    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'hero_config'");
    $hasColumn = $result && $result->num_rows > 0;
    if (!$hasColumn) {
        if (@$conn->query("ALTER TABLE site_config ADD COLUMN hero_config TEXT DEFAULT NULL COMMENT 'JSON object with per-tournament hero image overrides'")) {
            $hasColumn = true;
        } else {
            error_log('site_config: could not add hero_config column: ' . $conn->error);
        }
    }
    return $hasColumn;
}

$hasHeroConfig = site_config_has_hero_config($conn);

/**
 * Detect whether the modules_config column exists. Stores which optional
 * MODULES of the app are turned on/off for this project (see /setup and
 * src/modules/registry.ts):
 *
 *   { "modules": { "skins": { "enabled": false, "lockedBy": "superadmin",
 *                             "updatedAt": "2026-08-13T00:00:00Z" } } }
 *
 * A missing entry means "module enabled". Self-healing: creates the column on
 * first use (no-op when the hosting user lacks ALTER privileges).
 */
function site_config_has_modules_config($conn) {
    static $hasColumn = null;
    if ($hasColumn !== null) return $hasColumn;
    $result = $conn->query("SHOW COLUMNS FROM site_config LIKE 'modules_config'");
    $hasColumn = $result && $result->num_rows > 0;
    if (!$hasColumn) {
        if (@$conn->query("ALTER TABLE site_config ADD COLUMN modules_config TEXT DEFAULT NULL COMMENT 'JSON object with enabled/disabled app modules'")) {
            $hasColumn = true;
        } else {
            error_log('site_config: could not add modules_config column: ' . $conn->error);
        }
    }
    return $hasColumn;
}

$hasModulesConfig = site_config_has_modules_config($conn);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $scope = site_config_scope($_GET['scope'] ?? 'general');

    /**
     * ?all=1 → lista de torneos del dominio + TODAS las configuraciones
     * (general + una por torneo) en una sola llamada, para que la barra
     * superior pueda armar un desplegable por torneo sin N peticiones.
     */
    if (!empty($_GET['all'])) {
        $torneos = [];
        $res = @$conn->query("SELECT torneoid, nombre, slug, orden, activo FROM site_torneos WHERE domain = '$domain' AND activo = 1 ORDER BY orden ASC, torneoid ASC");
        if ($res) {
            while ($r = $res->fetch_assoc()) {
                $torneos[] = [
                    'torneoid' => (int)$r['torneoid'],
                    'nombre'   => $r['nombre'],
                    'slug'     => $r['slug'],
                    'orden'    => (int)$r['orden'],
                ];
            }
        }

        $configs = [];
        $where = "domain = '$domain'";
        $rows = @$conn->query("SELECT * FROM site_config WHERE $where");
        if ($rows) {
            while ($r = $rows->fetch_assoc()) {
                $key = site_config_has_scope($conn) ? (string)$r['scope'] : 'general';
                $out = ['domain' => $_SERVER['HTTP_HOST'], 'torneoid' => isset($r['torneoid']) ? (int)$r['torneoid'] : null];
                foreach ($r as $col => $val) {
                    if ($col === 'domain' || $col === 'torneoid' || $col === 'scope' || $col === 'updated_at') continue;
                    $out[$col] = ($val === null || $val === '') ? null : json_decode($val, true);
                }
                $configs[$key] = $out;
            }
        }

        json_response([
            'domain'  => $_SERVER['HTTP_HOST'],
            'torneos' => $torneos,
            'configs' => $configs,
        ]);
    }

    // Return full config for current domain + scope

    $selectFields = 'torneoid, menu_order, visibility, menu_groups, page_group_assignments';
    if ($hasLiveScoringConfig) {
        $selectFields .= ', live_scoring_config';
    }
    if ($hasSponsorsConfig) {
        $selectFields .= ', sponsors_config';
    }
    if ($hasEventosConfig) {
        $selectFields .= ', eventos_config';
    }
    if ($hasAvisosConfig) {
        $selectFields .= ', avisos_config';
    }
    if ($hasMenusConfig) {
        $selectFields .= ', menus_config';
    }
    if ($hasPremiosConfig) {
        $selectFields .= ', premios_config';
    }
    if ($hasHotelesConfig) {
        $selectFields .= ', hoteles_config';
    }
    if ($hasThemeConfig) {
        $selectFields .= ', theme_config';
    }
    if ($hasStatsConfig) {
        $selectFields .= ', stats_config';
    }
    if ($hasPopupConfig) {
        $selectFields .= ', popup_config';
    }
    if ($hasAnuncioConfig) {
        $selectFields .= ', anuncio_config';
    }
    if ($hasStatsPageConfig) {
        $selectFields .= ', stats_page_config';
    }
    if ($hasHomeConfig) {
        $selectFields .= ', home_config';
    }
    if ($hasHistorialConfig) {
        $selectFields .= ', historial_config';
    }
    if ($hasTarjetasConfig) {
        $selectFields .= ', tarjetas_config';
    }
    if ($hasHeroConfig) {
        $selectFields .= ', hero_config';
    }
    if ($hasModulesConfig) {
        $selectFields .= ', modules_config';
    }

    $where = site_config_where($conn, $domain, $scope);
    $sql = "SELECT $selectFields FROM site_config WHERE $where LIMIT 1";
    $row = query_one($conn, $sql);

    // Un torneo sin configuración propia todavía hereda la general.
    if (!$row && $scope !== 'general') {
        $whereGen = site_config_where($conn, $domain, 'general');
        $row = query_one($conn, "SELECT $selectFields FROM site_config WHERE $whereGen LIMIT 1");
        if ($row) $row['torneoid'] = (int)$scope;
    }

    
    if ($row) {
        json_response([
            'domain'                => $_SERVER['HTTP_HOST'],
            'torneoid'              => (int)$row['torneoid'],
            'menu_order'            => $row['menu_order'] ? json_decode($row['menu_order'], true) : null,
            'visibility'            => $row['visibility'] ? json_decode($row['visibility'], true) : null,
            'menu_groups'           => $row['menu_groups'] ? json_decode($row['menu_groups'], true) : null,
            'page_group_assignments'=> $row['page_group_assignments'] ? json_decode($row['page_group_assignments'], true) : null,
            'live_scoring_config'   => $hasLiveScoringConfig && !empty($row['live_scoring_config']) ? json_decode($row['live_scoring_config'], true) : null,
            'sponsors_config'       => $hasSponsorsConfig && !empty($row['sponsors_config']) ? json_decode($row['sponsors_config'], true) : null,
            'eventos_config'        => $hasEventosConfig && !empty($row['eventos_config']) ? json_decode($row['eventos_config'], true) : null,
            'avisos_config'         => $hasAvisosConfig && !empty($row['avisos_config']) ? json_decode($row['avisos_config'], true) : null,
            'menus_config'          => $hasMenusConfig && !empty($row['menus_config']) ? json_decode($row['menus_config'], true) : null,
            'premios_config'        => $hasPremiosConfig && !empty($row['premios_config']) ? json_decode($row['premios_config'], true) : null,
            'hoteles_config'        => $hasHotelesConfig && !empty($row['hoteles_config']) ? json_decode($row['hoteles_config'], true) : null,
            'theme_config'          => $hasThemeConfig && !empty($row['theme_config']) ? json_decode($row['theme_config'], true) : null,
            'stats_config'          => $hasStatsConfig && !empty($row['stats_config']) ? json_decode($row['stats_config'], true) : null,
            'popup_config'          => $hasPopupConfig && !empty($row['popup_config']) ? json_decode($row['popup_config'], true) : null,
            'anuncio_config'        => $hasAnuncioConfig && !empty($row['anuncio_config']) ? json_decode($row['anuncio_config'], true) : null,
            'stats_page_config'     => $hasStatsPageConfig && !empty($row['stats_page_config']) ? json_decode($row['stats_page_config'], true) : null,
            'home_config'           => $hasHomeConfig && !empty($row['home_config']) ? json_decode($row['home_config'], true) : null,
            'historial_config'      => $hasHistorialConfig && !empty($row['historial_config']) ? json_decode($row['historial_config'], true) : null,
            'tarjetas_config'       => $hasTarjetasConfig && !empty($row['tarjetas_config']) ? json_decode($row['tarjetas_config'], true) : null,
            'hero_config'           => $hasHeroConfig && !empty($row['hero_config']) ? json_decode($row['hero_config'], true) : null,
            'modules_config'        => $hasModulesConfig && !empty($row['modules_config']) ? json_decode($row['modules_config'], true) : null,
        ]);
    } else {
        json_response([
            'domain'                => $_SERVER['HTTP_HOST'],
            'torneoid'              => null,
            'menu_order'            => null,
            'visibility'            => null,
            'menu_groups'           => null,
            'page_group_assignments'=> null,
            'live_scoring_config'   => null,
            'sponsors_config'       => null,
            'eventos_config'        => null,
            'avisos_config'         => null,
            'menus_config'          => null,
            'premios_config'        => null,
            'hoteles_config'        => null,
            'theme_config'          => null,
            'stats_config'          => null,
            'popup_config'          => null,
            'anuncio_config'        => null,
            'stats_page_config'     => null,
            'home_config'           => null,
            'historial_config'      => null,
            'tarjetas_config'       => null,
            'hero_config'           => null,
            'modules_config'        => null,
        ]);
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Read JSON body
    $body = json_decode(file_get_contents('php://input'), true);
    
    if (!$body) {
        json_error('Invalid JSON body', 400);
    }
    
    // Auth: superadmin password or a normal staff user with permission for the edited area.
    $password = $body['password'] ?? '';
    if (!is_superadmin_password($conn, $password)) {
        $fieldAreas = [
            'live_scoring_config'    => 'live',
            'sponsors_config'        => 'uploads',
            'eventos_config'         => 'eventos',
            'avisos_config'          => 'avisos',
            'menus_config'           => 'menus',
            'premios_config'         => 'premios',
            'hoteles_config'         => 'hoteles',
            'stats_config'           => 'stats',
            'popup_config'           => 'pop',
            'stats_page_config'      => 'stats',
            'home_config'            => 'pagina',
            'historial_config'       => 'pagina',
            'tarjetas_config'        => 'tarjetas',
            'hero_config'            => 'pagina',
        ];
        $staffAllowed = false;
        foreach ($fieldAreas as $field => $area) {
            if (array_key_exists($field, $body) && staff_check_area($conn, $body, $area)) {
                $staffAllowed = true;
            }
        }
        if (!$staffAllowed) json_error('Unauthorized', 401);
    }
    
    // Alcance al que se guarda (multi-torneo). Por defecto, 'general'.
    $scope = site_config_scope($body['scope'] ?? 'general');

    // Build dynamic UPDATE fields from provided data
    $fields = [];
    $insertFields = ['domain'];
    $insertValues = ["'$domain'"];
    if ($hasScope) {
        $insertFields[] = 'scope';
        $insertValues[] = "'" . esc($conn, $scope) . "'";
    }

    
    if (isset($body['torneoid'])) {
        $tid = (int)$body['torneoid'];
        $fields[] = "torneoid = $tid";
        $insertFields[] = 'torneoid';
        $insertValues[] = $tid;
    }
    
    if (array_key_exists('menu_order', $body)) {
        $val = $body['menu_order'] !== null ? "'" . esc($conn, json_encode($body['menu_order'])) . "'" : 'NULL';
        $fields[] = "menu_order = $val";
        $insertFields[] = 'menu_order';
        $insertValues[] = $val;
    }
    
    if (array_key_exists('visibility', $body)) {
        $val = $body['visibility'] !== null ? "'" . esc($conn, json_encode($body['visibility'])) . "'" : 'NULL';
        $fields[] = "visibility = $val";
        $insertFields[] = 'visibility';
        $insertValues[] = $val;
    }
    
    if (array_key_exists('menu_groups', $body)) {
        $val = $body['menu_groups'] !== null ? "'" . esc($conn, json_encode($body['menu_groups'])) . "'" : 'NULL';
        $fields[] = "menu_groups = $val";
        $insertFields[] = 'menu_groups';
        $insertValues[] = $val;
    }
    
    if (array_key_exists('page_group_assignments', $body)) {
        $val = $body['page_group_assignments'] !== null ? "'" . esc($conn, json_encode($body['page_group_assignments'])) . "'" : 'NULL';
        $fields[] = "page_group_assignments = $val";
        $insertFields[] = 'page_group_assignments';
        $insertValues[] = $val;
    }
    
    if (array_key_exists('live_scoring_config', $body)) {
        if (!$hasLiveScoringConfig) {
            json_error("Missing DB column live_scoring_config in site_config. Run: ALTER TABLE site_config ADD COLUMN live_scoring_config TEXT DEFAULT NULL COMMENT 'JSON object with live scoring page settings';", 500);
        }

        $val = $body['live_scoring_config'] !== null ? "'" . esc($conn, json_encode($body['live_scoring_config'])) . "'" : 'NULL';
        $fields[] = "live_scoring_config = $val";
        $insertFields[] = 'live_scoring_config';
        $insertValues[] = $val;
    }

    if (array_key_exists('sponsors_config', $body)) {
        if (!$hasSponsorsConfig) {
            json_error("Missing DB column sponsors_config in site_config. Run: ALTER TABLE site_config ADD COLUMN sponsors_config TEXT DEFAULT NULL COMMENT 'JSON object with sponsors page display settings';", 500);
        }

        $val = $body['sponsors_config'] !== null ? "'" . esc($conn, json_encode($body['sponsors_config'])) . "'" : 'NULL';
        $fields[] = "sponsors_config = $val";
        $insertFields[] = 'sponsors_config';
        $insertValues[] = $val;
    }

    if (array_key_exists('eventos_config', $body)) {
        if (!$hasEventosConfig) {
            json_error("Missing DB column eventos_config in site_config. Run: ALTER TABLE site_config ADD COLUMN eventos_config TEXT DEFAULT NULL COMMENT 'JSON object with eventos page display settings';", 500);
        }

        $val = $body['eventos_config'] !== null ? "'" . esc($conn, json_encode($body['eventos_config'])) . "'" : 'NULL';
        $fields[] = "eventos_config = $val";
        $insertFields[] = 'eventos_config';
        $insertValues[] = $val;
    }

    if (array_key_exists('avisos_config', $body)) {
        if (!$hasAvisosConfig) {
            json_error("Missing DB column avisos_config in site_config. Run: ALTER TABLE site_config ADD COLUMN avisos_config TEXT DEFAULT NULL COMMENT 'JSON object with avisos page display settings';", 500);
        }

        $val = $body['avisos_config'] !== null ? "'" . esc($conn, json_encode($body['avisos_config'])) . "'" : 'NULL';
        $fields[] = "avisos_config = $val";
        $insertFields[] = 'avisos_config';
        $insertValues[] = $val;
    }

    if (array_key_exists('menus_config', $body)) {
        if (!$hasMenusConfig) {
            json_error("Missing DB column menus_config in site_config. Run: ALTER TABLE site_config ADD COLUMN menus_config TEXT DEFAULT NULL COMMENT 'JSON object with menus page display settings';", 500);
        }

        $val = $body['menus_config'] !== null ? "'" . esc($conn, json_encode($body['menus_config'])) . "'" : 'NULL';
        $fields[] = "menus_config = $val";
        $insertFields[] = 'menus_config';
        $insertValues[] = $val;
    }

    if (array_key_exists('premios_config', $body)) {
        if (!$hasPremiosConfig) {
            json_error("Missing DB column premios_config in site_config. Run: ALTER TABLE site_config ADD COLUMN premios_config TEXT DEFAULT NULL COMMENT 'JSON object with premios page display settings';", 500);
        }

        $val = $body['premios_config'] !== null ? "'" . esc($conn, json_encode($body['premios_config'])) . "'" : 'NULL';
        $fields[] = "premios_config = $val";
        $insertFields[] = 'premios_config';
        $insertValues[] = $val;
    }

    if (array_key_exists('hoteles_config', $body)) {
        if (!$hasHotelesConfig) {
            json_error("Missing DB column hoteles_config in site_config. Run: ALTER TABLE site_config ADD COLUMN hoteles_config TEXT DEFAULT NULL COMMENT 'JSON object with hoteles page display settings';", 500);
        }

        $val = $body['hoteles_config'] !== null ? "'" . esc($conn, json_encode($body['hoteles_config'])) . "'" : 'NULL';
        $fields[] = "hoteles_config = $val";
        $insertFields[] = 'hoteles_config';
        $insertValues[] = $val;
    }

    if (array_key_exists('theme_config', $body)) {
        if (!$hasThemeConfig) {
            json_error("Missing DB column theme_config in site_config. Run: ALTER TABLE site_config ADD COLUMN theme_config TEXT DEFAULT NULL COMMENT 'JSON object with the active color palette';", 500);
        }
        $val = $body['theme_config'] !== null ? "'" . esc($conn, json_encode($body['theme_config'])) . "'" : 'NULL';
        $fields[] = "theme_config = $val";
        $insertFields[] = 'theme_config';
        $insertValues[] = $val;
    }

    if (array_key_exists('stats_config', $body)) {
        if (!$hasStatsConfig) {
            json_error("Missing DB column stats_config in site_config. Run: ALTER TABLE site_config ADD COLUMN stats_config TEXT DEFAULT NULL COMMENT 'JSON object overriding home stats ribbon values';", 500);
        }
        $val = $body['stats_config'] !== null ? "'" . esc($conn, json_encode($body['stats_config'])) . "'" : 'NULL';
        $fields[] = "stats_config = $val";
        $insertFields[] = 'stats_config';
        $insertValues[] = $val;
    }

    if (array_key_exists('popup_config', $body)) {
        if (!$hasPopupConfig) {
            json_error("Missing DB column popup_config in site_config. Run: ALTER TABLE site_config ADD COLUMN popup_config TEXT DEFAULT NULL COMMENT 'JSON object with site-wide popup overlay settings';", 500);
        }
        $val = $body['popup_config'] !== null ? "'" . esc($conn, json_encode($body['popup_config'])) . "'" : 'NULL';
        $fields[] = "popup_config = $val";
        $insertFields[] = 'popup_config';
        $insertValues[] = $val;
    }

    if (array_key_exists('anuncio_config', $body)) {
        if (!$hasAnuncioConfig) {
            json_error("Missing DB column anuncio_config in site_config. Run: ALTER TABLE site_config ADD COLUMN anuncio_config TEXT DEFAULT NULL COMMENT 'JSON object with scrolling announcement ribbon settings';", 500);
        }
        $val = $body['anuncio_config'] !== null ? "'" . esc($conn, json_encode($body['anuncio_config'])) . "'" : 'NULL';
        $fields[] = "anuncio_config = $val";
        $insertFields[] = 'anuncio_config';
        $insertValues[] = $val;
    }

    if (array_key_exists('stats_page_config', $body)) {
        if (!$hasStatsPageConfig) {
            json_error("Missing DB column stats_page_config in site_config. Run: ALTER TABLE site_config ADD COLUMN stats_page_config TEXT DEFAULT NULL COMMENT 'JSON object with /stats page config';", 500);
        }
        $val = $body['stats_page_config'] !== null ? "'" . esc($conn, json_encode($body['stats_page_config'])) . "'" : 'NULL';
        $fields[] = "stats_page_config = $val";
        $insertFields[] = 'stats_page_config';
        $insertValues[] = $val;
    }

    if (array_key_exists('home_config', $body)) {
        if (!$hasHomeConfig) {
            json_error("Missing DB column home_config in site_config. Run: ALTER TABLE site_config ADD COLUMN home_config TEXT DEFAULT NULL COMMENT 'JSON object with home page config';", 500);
        }
        $val = $body['home_config'] !== null ? "'" . esc($conn, json_encode($body['home_config'])) . "'" : 'NULL';
        $fields[] = "home_config = $val";
        $insertFields[] = 'home_config';
        $insertValues[] = $val;
    }

    if (array_key_exists('historial_config', $body)) {
        if (!$hasHistorialConfig) {
            json_error("Missing DB column historial_config in site_config. Run: ALTER TABLE site_config ADD COLUMN historial_config TEXT DEFAULT NULL COMMENT 'JSON object with /historial page config';", 500);
        }
        $val = $body['historial_config'] !== null ? "'" . esc($conn, json_encode($body['historial_config'])) . "'" : 'NULL';
        $fields[] = "historial_config = $val";
        $insertFields[] = 'historial_config';
        $insertValues[] = $val;
    }

    /** Maquetación de impresión de tarjetas (Admin > Tarjetas). */
    if (array_key_exists('tarjetas_config', $body)) {
        if (!$hasTarjetasConfig) {
            json_error("Missing DB column tarjetas_config in site_config. Run: ALTER TABLE site_config ADD COLUMN tarjetas_config TEXT DEFAULT NULL COMMENT 'JSON object with Admin > Tarjetas print layout config';", 500);
        }
        $val = $body['tarjetas_config'] !== null ? "'" . esc($conn, json_encode($body['tarjetas_config'])) . "'" : 'NULL';
        $fields[] = "tarjetas_config = $val";
        $insertFields[] = 'tarjetas_config';
        $insertValues[] = $val;
    }

    if (array_key_exists('hero_config', $body)) {
        if (!$hasHeroConfig) {
            json_error("Missing DB column hero_config in site_config. Run: ALTER TABLE site_config ADD COLUMN hero_config TEXT DEFAULT NULL COMMENT 'JSON object with per-tournament hero image overrides';", 500);
        }
        $val = $body['hero_config'] !== null ? "'" . esc($conn, json_encode($body['hero_config'])) . "'" : 'NULL';
        $fields[] = "hero_config = $val";
        $insertFields[] = 'hero_config';
        $insertValues[] = $val;
    }

    /**
     * modules_config — qué módulos de la app están encendidos en este proyecto.
     * SOLO el superadmin puede escribirlo: un módulo apagado no debe poder
     * reactivarlo ningún usuario de staff (ver /setup).
     */
    if (array_key_exists('modules_config', $body)) {
        if (!is_superadmin_password($conn, $password)) {
            json_error('Solo el superadmin puede cambiar los módulos', 403);
        }
        if (!$hasModulesConfig) {
            json_error("Missing DB column modules_config in site_config. Run: ALTER TABLE site_config ADD COLUMN modules_config TEXT DEFAULT NULL COMMENT 'JSON object with enabled/disabled app modules';", 500);
        }
        $val = $body['modules_config'] !== null ? "'" . esc($conn, json_encode($body['modules_config'])) . "'" : 'NULL';
        $fields[] = "modules_config = $val";
        $insertFields[] = 'modules_config';
        $insertValues[] = $val;
    }
    
    if (empty($fields)) {
        json_error('No fields to update', 400);
    }
    
    // Ensure torneoid has a default for INSERT
    if (!isset($body['torneoid'])) {
        $insertFields[] = 'torneoid';
        $insertValues[] = 0;
    }
    
    $updateClause = implode(', ', $fields);
    $insertFieldsStr = implode(', ', $insertFields);
    $insertValuesStr = implode(', ', $insertValues);
    
    $sql = "INSERT INTO site_config ($insertFieldsStr) 
            VALUES ($insertValuesStr)
            ON DUPLICATE KEY UPDATE $updateClause";
    
    if (!$conn->query($sql)) {
        json_error('Failed to save config: ' . $conn->error);
    }
    
    json_response([
        'domain' => $_SERVER['HTTP_HOST'],
        'saved'  => true,
    ]);
} else {
    json_error('Method not allowed', 405);
}
