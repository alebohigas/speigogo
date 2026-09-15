<?php
/**
 * Sponsor Logo Proxy
 * Serves sponsor logos from the external directory (one level above web root)
 * to avoid exposing internal server paths to the browser.
 * 
 * Usage: /api/sponsor_logo.php?file=logos_patrocinadores/imagen.png
 * 
 * Security:
 * - Only allows image file extensions (png, jpg, jpeg, gif, webp, svg)
 * - Sanitises filename to prevent directory traversal attacks
 * - Returns 404 if file doesn't exist
 * - Caches for 7 days (sponsor logos rarely change)
 */

// ============= CORS Headers =============
header('Access-Control-Allow-Origin: *');

// ============= Validate Input =============
$file = $_GET['file'] ?? '';

// Strip any leading slashes or dots to prevent traversal
$file = ltrim($file, './\\');

// Only allow safe path characters (letters, numbers, hyphens, underscores, dots, forward slashes)
if (!$file || !preg_match('/^[a-zA-Z0-9_\-\.\/]+$/', $file)) {
    http_response_code(400);
    echo 'Invalid filename';
    exit;
}

// Block directory traversal attempts
if (strpos($file, '..') !== false) {
    http_response_code(400);
    echo 'Invalid path';
    exit;
}

// Only allow image extensions
$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
$allowedExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
if (!in_array($ext, $allowedExts)) {
    http_response_code(400);
    echo 'Only image files allowed';
    exit;
}

// ============= Resolve Path =============
/**
 * Build absolute path to the image file.
 *
 * The `logos_patrocinadores/` folder lives somewhere relative to this script,
 * but its exact depth depends on the deployment layout:
 *
 *   Layout A (subfolder install):
 *     web root:    /htdocs/torneo/         (index.html lives here)
 *     api script:  /htdocs/torneo/api/sponsor_logo.php
 *     logos at:    /htdocs/logos_patrocinadores/   ← TWO levels up
 *
 *   Layout B (root install — e.g. gomez-ia.speitour.mx):
 *     web root:    /htdocs/                (index.html lives here)
 *     api script:  /htdocs/api/sponsor_logo.php
 *     logos at:    /htdocs/logos_patrocinadores/   ← ONE level up
 *
 *   Layout C (sibling folder — fallback):
 *     logos at:    /htdocs/torneo/logos_patrocinadores/   ← SAME level as web root
 *
 * To support every layout without per-domain configuration, we probe each
 * candidate basePath (one, two, three levels up) and use the FIRST one where
 * the requested file actually exists. The chosen basePath is still used to
 * verify the resolved path stays under it (directory-traversal protection).
 */
$candidateBases = array_filter([
    realpath(__DIR__ . '/..'),       // one level up   (Layout B: /htdocs)
    realpath(__DIR__ . '/../..'),    // two levels up  (Layout A: /htdocs)
    realpath(__DIR__ . '/../../..'), // three levels up (deeper installs)
]);

if (empty($candidateBases)) {
    http_response_code(500);
    echo 'Base path not found';
    exit;
}

$basePath     = null;
$resolvedPath = null;

/**
 * Subcarpetas donde pueden vivir los logos, además de la ruta tal cual.
 * En este servidor las imágenes están en /alien/logos/, y en instalaciones
 * anteriores en /logos_patrocinadores/ o /logos/.
 */
$fileBase = basename($file);
$relCandidates = [
    $file,
    'alien/logos/' . $fileBase,
    'alien/logos_patrocinadores/' . $fileBase,
    'logos_patrocinadores/' . $fileBase,
    'logos/' . $fileBase,
];

foreach ($candidateBases as $candidate) {
    foreach ($relCandidates as $rel) {
        $tryResolved = realpath($candidate . '/' . $rel);
        // Accept the first candidate where the file exists AND stays under that base
        if ($tryResolved && strpos($tryResolved, $candidate) === 0 && is_file($tryResolved)) {
            $basePath     = $candidate;
            $resolvedPath = $tryResolved;
            break 2;
        }
    }
}

// Última opción: traerlo de los servidores de imágenes conocidos.
if (!$resolvedPath) {
    $remoteBases = [
        'https://alien.speigogo.com/logos/',
        'https://alien.speigogo.com/logos_patrocinadores/',
    ];
    $ctx = stream_context_create(['http' => ['timeout' => 8, 'follow_location' => 0]]);
    foreach ($remoteBases as $remote) {
        $data = @file_get_contents($remote . rawurlencode($fileBase), false, $ctx);
        if ($data === false || $data === '') continue;
        if (stripos(substr($data, 0, 200), '<html') !== false) continue;
        $mime = [
            'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
            'gif' => 'image/gif', 'webp' => 'image/webp', 'svg' => 'image/svg+xml',
        ][$ext] ?? 'application/octet-stream';
        header('Content-Type: ' . $mime);
        header('Cache-Control: public, max-age=604800');
        header('Content-Length: ' . strlen($data));
        echo $data;
        exit;
    }
}

if (!$resolvedPath) {
    http_response_code(404);
    echo 'Logo not found';
    exit;
}

// ============= Serve Image =============
if (!file_exists($resolvedPath) || !is_file($resolvedPath)) {
    http_response_code(404);
    echo 'Logo not found';
    exit;
}

// MIME type mapping
$mimeTypes = [
    'png'  => 'image/png',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif'  => 'image/gif',
    'webp' => 'image/webp',
    'svg'  => 'image/svg+xml',
];

$contentType = $mimeTypes[$ext] ?? 'application/octet-stream';

// Cache for 7 days (logos rarely change)
header('Content-Type: ' . $contentType);
header('Cache-Control: public, max-age=604800');
header('Content-Length: ' . filesize($resolvedPath));

readfile($resolvedPath);
