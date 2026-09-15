<?php
/**
 * OG Image Endpoint
 * GET /api/og_image.php
 *
 * WhatsApp/Facebook/Twitter leen `og:image` del HTML estático; como el logo
 * del ribbon (header_logo_url) se guarda dinámico por dominio en site_config,
 * este endpoint lo resuelve en el servidor y hace redirect 302 a la imagen.
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

// Cache corto: WhatsApp cachea agresivamente, pero el admin puede cambiar el logo.
header('Cache-Control: public, max-age=300');
header('Location: ' . $target, true, 302);
exit;
