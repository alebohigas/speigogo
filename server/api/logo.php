<?php
/**
 * Logo Proxy
 * Serves club logos from the external server through our own domain
 * to avoid ad-blocker/privacy extension blocking of cross-origin requests.
 * 
 * Usage: /api/logo.php?file=logo_name.png
 */

// ============= CORS Headers =============
header('Access-Control-Allow-Origin: *');

// ============= Validate Input =============
$file = $_GET['file'] ?? '';

// Only allow safe filenames (letters, numbers, hyphens, underscores, dots)
if (!$file || !preg_match('/^[a-zA-Z0-9_\-\.]+$/', $file)) {
    http_response_code(400);
    echo 'Invalid filename';
    exit;
}

// ============= Fetch & Serve =============
/**
 * Resolución del logo.
 *
 * 1) Carpetas locales del hosting (permite subir logos propios por dominio).
 * 2) Servidor legacy alien2019 (varias carpetas conocidas).
 * Se descarta cualquier respuesta que no sea una imagen real (las 302 del
 * servidor legacy devuelven HTML y antes provocaban 404 ruidosos).
 */
$imageData = null;

$localDirs = [
    __DIR__ . '/../logos/',
    __DIR__ . '/../logos-equipos/',
    __DIR__ . '/../../logos/',
    __DIR__ . '/../../logos-equipos/',
];
foreach ($localDirs as $dir) {
    $path = realpath($dir . $file);
    if ($path && is_file($path)) {
        $imageData = file_get_contents($path);
        break;
    }
}

if ($imageData === null) {
    $remoteBases = [
        // Servidor de imágenes actual (logos de equipo).
        'https://alien.speigogo.com/jugadores/logos/',
        'https://alien.speigogo.com/jugadores/',
        'https://alien.speigogo.com/logos/',
        'https://alien.speigogo.com/logos_equipos/',
    ];
    $ctx = stream_context_create(['http' => ['timeout' => 8, 'follow_location' => 0]]);
    foreach ($remoteBases as $base) {
        $data = @file_get_contents($base . $file, false, $ctx);
        if ($data === false || $data === '') continue;
        // Descarta páginas de error/redirección (HTML) servidas con 200/302.
        if (stripos(substr($data, 0, 200), '<html') !== false) continue;
        $imageData = $data;
        break;
    }
}

if ($imageData === null) {
    http_response_code(404);
    echo 'Logo not found';
    exit;
}


// Detect content type from extension
$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
$mimeTypes = [
    'png'  => 'image/png',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'svg'  => 'image/svg+xml',
    'gif'  => 'image/gif',
    'webp' => 'image/webp',
];

$contentType = $mimeTypes[$ext] ?? 'application/octet-stream';

// Cache for 24 hours
header('Content-Type: ' . $contentType);
header('Cache-Control: public, max-age=86400');
header('Content-Length: ' . strlen($imageData));

echo $imageData;
