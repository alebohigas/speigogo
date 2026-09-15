<?php
/**
 * OG Image Endpoint
 * GET /api/og_image.php
 *
 * WhatsApp/Facebook/Twitter leen `og:image` del HTML estático; como el logo
 * del ribbon (header_logo_url) se guarda dinámico por dominio en site_config,
 * este endpoint lo resuelve en el servidor y ENTREGA LOS BYTES de la imagen.
 *
 * IMPORTANTE: NO usar redirect 302 — los crawlers de Facebook/WhatsApp no
 * siguen redirects en og:image y marcan mismatch, obligando a re-scrape manual
 * desde el Sharing Debugger. Aquí se sirve la imagen directamente (proxy),
 * igual que logo.php / sponsor_logo.php.
 *
 * Orden de resolución:
 *   1. site_config(scope='general').home_config.header_logo_url
 *   2. site_config(scope=<primer torneo activo>).home_config.header_logo_url
 *   3. /og-image.jpg (fallback estático)
 */
require_once 'config.php';

// config.php fija Content-Type: application/json; este endpoint no devuelve JSON.
header('Content-Type: text/plain; charset=utf-8');

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
// Respeta proxies (IONOS/Cloudflare) si vienen.
if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
    $scheme = explode(',', $_SERVER['HTTP_X_FORWARDED_PROTO'])[0];
}
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$baseUrl = $scheme . '://' . $host;

$domain = esc($conn, $host);

/** Convierte una ruta guardada (absoluta o relativa) en URL absoluta del sitio. */
function og_abs_url($url, $baseUrl) {
    $url = trim((string)$url);
    if ($url === '') return null;
    if (preg_match('#^https?://#i', $url)) return $url;
    if (strpos($url, '//') === 0) return null; // scheme-relative: evitar hosts raros
    if ($url[0] !== '/') $url = '/' . $url;
    return $baseUrl . $url;
}

/** Lee header_logo_url del home_config de un scope dado. */
function og_header_logo($conn, $domain, $scope) {
    $hasScope = false;
    $r = @$conn->query("SHOW COLUMNS FROM site_config LIKE 'scope'");
    if ($r && $r->num_rows > 0) $hasScope = true;

    $where = "domain = '$domain'";
    if ($hasScope) $where .= " AND scope = '" . esc($conn, $scope) . "'";

    $row = null;
    $res = @$conn->query("SELECT home_config FROM site_config WHERE $where LIMIT 1");
    if ($res && ($rr = $res->fetch_assoc())) $row = $rr;
    if (!$row || empty($row['home_config'])) return null;

    $cfg = json_decode($row['home_config'], true);
    if (!is_array($cfg)) return null;
    $logo = $cfg['header_logo_url'] ?? null;
    return (is_string($logo) && trim($logo) !== '') ? $logo : null;
}

$target = null;

// 1) Logo del ribbon del scope general (Home / configuración compartida).
$logo = og_header_logo($conn, $domain, 'general');

// 2) Respaldo: primer torneo activo del dominio.
if (!$logo) {
    $tid = 0;
    $res = @$conn->query("SELECT torneoid FROM site_torneos WHERE domain = '$domain' AND activo = 1 ORDER BY orden ASC, id ASC LIMIT 1");
    if ($res && ($r = $res->fetch_assoc())) $tid = (int)$r['torneoid'];
    if ($tid > 0) $logo = og_header_logo($conn, $domain, (string)$tid);
}

if ($logo) $target = og_abs_url($logo, $baseUrl);

// 3) Fallback estático.
if (!$target) $target = $baseUrl . '/og-image.jpg';

/** Descarga los bytes de una imagen (local por filesystem, remota por cURL). */
function og_fetch_image($url) {
    // Archivo local del mismo hosting: leer directo del filesystem.
    if (strpos($url, $GLOBALS['baseUrl']) === 0) {
        $docRoot = rtrim($_SERVER['DOCUMENT_ROOT'] ?? '', '/');
        if ($docRoot !== '') {
            $path = substr($url, strlen($GLOBALS['baseUrl']));
            $file = $docRoot . $path;
            if (is_readable($file)) {
                $bytes = @file_get_contents($file);
                if ($bytes !== false && strlen($bytes) > 0) return $bytes;
            }
        }
    }
    // Remota: cURL con timeout corto, sin imprimir nada al output.
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT      => 'facebookexternalhit/1.1 (+og_image.php proxy)',
        ));
        $bytes = curl_exec($ch);
        $code  = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code >= 200 && $code < 300 && is_string($bytes) && strlen($bytes) > 0) return $bytes;
        return null;
    }
    // Último recurso sin cURL.
    $ctx = stream_context_create(array('http' => array('timeout' => 8, 'follow_location' => 1)));
    $bytes = @file_get_contents($url, false, $ctx);
    return ($bytes !== false && strlen($bytes) > 0) ? $bytes : null;
}

/** Detecta el MIME real de unos bytes de imagen. */
function og_mime($bytes) {
    if (function_exists('getimagesize')) {
        $info = @getimagesizefromstring($bytes);
        if ($info && !empty($info['mime'])) return $info['mime'];
    }
    if (strncmp($bytes, "\x89PNG", 4) === 0) return 'image/png';
    if (strncmp($bytes, "\xFF\xD8\xFF", 3) === 0) return 'image/jpeg';
    if (strncmp($bytes, "GIF8", 4) === 0) return 'image/gif';
    if (strncmp($bytes, "RIFF", 4) === 0) return 'image/webp';
    return null;
}

// Servir la imagen directamente (sin redirect).
$data = og_fetch_image($target);
$mime = $data ? og_mime($data) : null;

if (!$data || !$mime || strpos($mime, 'image/') !== 0) {
    // Fallback estático /og-image.jpg si existe.
    $docRoot = rtrim($_SERVER['DOCUMENT_ROOT'] ?? '', '/');
    $data = null;
    if ($docRoot !== '' && is_readable($docRoot . '/og-image.jpg')) {
        $data = @file_get_contents($docRoot . '/og-image.jpg');
    }
    if ($data === false || $data === null || strlen($data) === 0) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'og image not found';
        exit;
    }
    $mime = 'image/jpeg';
}

header_remove('Content-Type');
header('Content-Type: ' . $mime);
header('Content-Length: ' . strlen($data));
// WhatsApp/Facebook cachean por URL; ?v=N en el HTML fuerza re-lectura.
header('Cache-Control: public, max-age=3600');
header('Accept-Ranges: none');
echo $data;
exit;
