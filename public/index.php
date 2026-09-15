<?php
/**
 * index.php — SPA shell con meta tags dinámicos por host (link preview).
 *
 * WhatsApp / Facebook / Twitter / LinkedIn NO ejecutan JS al scrapear,
 * así que react-helmet no sirve para el preview de links. Este shim
 * sirve el mismo `index.html` de la SPA pero sustituye <title>, la
 * meta description y todos los `og:*` / `twitter:*` con los datos del
 * torneo asociado al Host solicitado:
 *   - título / og:title   → torneo.nombre  ("NOMBRE DEL TORNEO")
 *   - og:image            → torneo.logo_header ("LOGO DEL TORNEO")
 *   - descripción         → club del torneo (nunca el slogan fijo)
 *
 * La resolución host → torneoid usa la tabla `site_config` (misma
 * lógica que /api/site_config.php). `$HOST_OVERRIDES` sigue existiendo
 * y tiene prioridad para hosts con assets dedicados (p.ej. Atlas CC).
 */

// ============= Overrides por host =============
/**
 * Mapa host → overrides.
 * Claves soportadas: title, description, image (URL absoluta https).
 * `image` se aplica tanto a og:image como a twitter:image.
 */
$HOST_OVERRIDES = [
    'atlascc.speitour.mx' => [
        'title'       => 'Torneo Anual de Golf',
        'description' => 'El torneo de golf amateur más importante de México. Inscríbete y compite.',
        // Imagen dedicada 1200x630 para preview de WhatsApp/Facebook/Twitter.
        // Servida estáticamente desde /og-atlas354.jpg (public/og-atlas354.jpg).
        'image'       => 'https://atlascc.speitour.mx/og-atlas354.jpg?v=4',
    ],
];

// ============= Overrides dinámicos desde la base de datos =============
/**
 * resolve_tournament_meta()
 * Busca el torneo ligado al host en `site_config` y devuelve
 * ['title' => nombre, 'description' => club, 'image' => url absoluta del
 * logo_header] o null si no se puede resolver (sin credenciales, sin
 * registro para el dominio, error de conexión, etc.).
 *
 * @param string $host Host normalizado (sin puerto).
 * @return array|null
 */
function resolve_tournament_meta(string $host): ?array {
    $credentialsFile = __DIR__ . '/api/credentials.php';
    if (!file_exists($credentialsFile)) {
        return null;
    }
    // credentials.php define $DB_HOST, $DB_USER, $DB_PASS, $DB_NAME, $DB_PORT
    require $credentialsFile;
    if (empty($DB_HOST) || empty($DB_USER) || empty($DB_NAME)) {
        return null;
    }

    mysqli_report(MYSQLI_REPORT_OFF);
    $conn = @new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME, (int)($DB_PORT ?? 3306));
    if ($conn->connect_error) {
        return null;
    }
    $conn->set_charset('utf8');

    $safeHost = $conn->real_escape_string($host);
    $row = null;

    // 1) Dominio → torneoid
    $res = @$conn->query("SELECT torneoid FROM site_config WHERE domain = '$safeHost' LIMIT 1");
    $tid = ($res && ($r = $res->fetch_assoc())) ? (int)$r['torneoid'] : 0;
    if ($tid > 0) {
        // 2) torneoid → nombre + logo_header + club
        $sql = "SELECT a.nombre, a.logo_header, a.logo, b.nombre AS club
                FROM torneo a
                LEFT JOIN clubs b ON (a.club_id = b.id)
                WHERE a.torneo_id = $tid LIMIT 1";
        $res2 = @$conn->query($sql);
        if ($res2) {
            $row = $res2->fetch_assoc();
        }
    }
    $conn->close();

    if (!$row) {
        return null;
    }

    // Candidatos en orden: 1) logo del top menu bar (logo_header),
    // 2) fallback al logo general del torneo (logo).
    $candidates = [
        trim((string)($row['logo_header'] ?? '')),
        trim((string)($row['logo'] ?? '')),
    ];
    $images = [];
    foreach ($candidates as $logoFile) {
        if ($logoFile === '') continue;
        if (!preg_match('/^[a-zA-Z0-9_\-\.]+$/', $logoFile)) continue;
        // Se sirve por el proxy /api/logo.php para evitar hotlink/CORS.
        $url = 'https://' . $host . '/api/logo.php?file=' . rawurlencode($logoFile);
        if (!in_array($url, $images, true)) {
            $images[] = $url;
        }
    }
    $image = $images[0] ?? '';

    return [
        'title'       => trim((string)($row['nombre'] ?? '')),
        'description' => trim((string)($row['club'] ?? '')),
        'image'       => $image,
        'images'      => $images,
    ];
}

// ============= Servir index.html =============
$html = @file_get_contents(__DIR__ . '/index.html');
if ($html === false) {
    http_response_code(500);
    echo 'index.html not found';
    exit;
}

$host = strtolower($_SERVER['HTTP_HOST'] ?? '');
// Normaliza: strip puerto si lo hubiera
$host = preg_replace('/:\d+$/', '', $host);

$ov = $HOST_OVERRIDES[$host] ?? null;
if (!$ov) {
    $ov = resolve_tournament_meta($host);
}

if ($ov) {
    $title = htmlspecialchars($ov['title']       ?? '', ENT_QUOTES, 'UTF-8');
    $desc  = htmlspecialchars($ov['description'] ?? '', ENT_QUOTES, 'UTF-8');
    $img   = htmlspecialchars($ov['image']       ?? '', ENT_QUOTES, 'UTF-8');

    if ($title !== '') {
        $html = preg_replace('#<title>.*?</title>#is', '<title>' . $title . '</title>', $html, 1);
        $html = preg_replace(
            '#<meta\s+property="og:title"[^>]*>#i',
            '<meta property="og:title" content="' . $title . '" />',
            $html
        );
        $html = preg_replace(
            '#<meta\s+name="twitter:title"[^>]*>#i',
            '<meta name="twitter:title" content="' . $title . '" />',
            $html
        );
    }
    // Se aplica siempre que haya override (incluso vacío) para eliminar
    // el slogan fijo del index.html.
    {
        $html = preg_replace(
            '#<meta\s+name="description"[^>]*>#i',
            '<meta name="description" content="' . $desc . '" />',
            $html
        );
        $html = preg_replace(
            '#<meta\s+property="og:description"[^>]*>#i',
            '<meta property="og:description" content="' . $desc . '" />',
            $html
        );
        $html = preg_replace(
            '#<meta\s+name="twitter:description"[^>]*>#i',
            '<meta name="twitter:description" content="' . $desc . '" />',
            $html
        );
    }
    if ($img !== '') {
        // Lista ordenada de imágenes: la primera es la del top menu bar
        // (logo_header); las siguientes son fallbacks. WhatsApp/Facebook
        // usan la primera que puedan descargar y renderizar.
        $images = $ov['images'] ?? [$img];

        // MIME por extensión del archivo original (WhatsApp NO acepta webp
        // de forma confiable: mejor JPG/PNG).
        $mimeByExt = [
            'png'  => 'image/png',
            'jpg'  => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'gif'  => 'image/gif',
            'webp' => 'image/webp',
        ];
        $ogImageTags = '';
        foreach ($images as $u) {
            $uEsc = htmlspecialchars($u, ENT_QUOTES, 'UTF-8');
            $ogImageTags .= '<meta property="og:image" content="' . $uEsc . '" />' . "\n    ";
            $ogImageTags .= '<meta property="og:image:secure_url" content="' . $uEsc . '" />' . "\n    ";
            $ext = strtolower(pathinfo(parse_url($u, PHP_URL_QUERY) ?? '', PATHINFO_EXTENSION));
            // El query trae file=nombre.ext; extraemos la extensión de ahí.
            parse_str((string)parse_url($u, PHP_URL_QUERY), $qs);
            $fExt = strtolower(pathinfo((string)($qs['file'] ?? ''), PATHINFO_EXTENSION));
            $mime = $mimeByExt[$fExt] ?? $mimeByExt[$ext] ?? 'image/png';
            $ogImageTags .= '<meta property="og:image:type" content="' . $mime . '" />' . "\n    ";
        }

        // Reemplaza el bloque og:image* del index.html estático (image,
        // secure_url, type, width, height) por las etiquetas dinámicas.
        $html = preg_replace(
            '#<meta\s+property="og:image"[^>]*>\s*'
            . '(<meta\s+property="og:image:secure_url"[^>]*>\s*)?'
            . '(<meta\s+property="og:image:type"[^>]*>\s*)?'
            . '(<meta\s+property="og:image:width"[^>]*>\s*)?'
            . '(<meta\s+property="og:image:height"[^>]*>\s*)?#i',
            $ogImageTags,
            $html,
            1
        );
        $html = preg_replace(
            '#<meta\s+name="twitter:image"[^>]*>#i',
            '<meta name="twitter:image" content="' . $img . '" />',
            $html
        );
    }

    // og:url siempre apunta a la página solicitada (WhatsApp lo usa para
    // validar el preview y resolver rutas relativas).
    $pageUrl = 'https://' . $host . ($_SERVER['REQUEST_URI'] ?? '/');
    $pageUrl = htmlspecialchars($pageUrl, ENT_QUOTES, 'UTF-8');
    $html = preg_replace(
        '#<meta\s+property="og:url"[^>]*>#i',
        '<meta property="og:url" content="' . $pageUrl . '" />',
        $html
    );
}

header('Content-Type: text/html; charset=utf-8');
// Que los scrapers no cacheen agresivamente para poder iterar
header('Cache-Control: public, max-age=300');
echo $html;