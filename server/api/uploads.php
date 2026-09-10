<?php
/**
 * Uploads Endpoint
 * -----------------------------------------------------------------------
 * Manages user-uploaded media (images + PDFs) for the dynamic page sections.
 *
 *   GET  /api/uploads.php?section=eventos                → list files
 *   POST /api/uploads.php?section=eventos&action=upload  → upload (multipart)
 *   POST /api/uploads.php?section=eventos&action=delete  → delete (JSON body)
 *
 * Sections (subfolders under /api/uploads/):
 *   - eventos       (images: poster grid for Eventos page)
 *   - avisos        (images: poster grid for Avisos page)
 *   - menus         (images: poster grid for Menús page)
 *   - convocatoria  (images + PDF: poster grid + downloadable convocatoria document)
 *   - reglas        (PDF only: downloadable reglas y CC document)
 *   - pdfs          (legacy bucket — kept for backwards compatibility with
 *                    files uploaded before the per-section split; new
 *                    uploads should target convocatoria/reglas directly)
 *
 * Files are scoped per active domain (Host header) to keep multi-tenant
 * deployments separated. The on-disk layout is:
 *
 *   /api/uploads/{domain}/{section}/{filename}
 *
 * Public URL pattern (same domain → no CORS): `/api/uploads/{domain}/{section}/{file}`.
 *
 * Auth: same `admin2025` shared password as the rest of the admin endpoints.
 * Validation: per-section MIME + extension whitelist, max 15MB per file,
 *             filename sanitized to [a-z0-9._-]+.
 */
require_once 'config.php';
require_once '_staff_auth.php';
require_once '_thumbs.php';

// Allow POST + DELETE for management operations
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
// Upload lists are dynamic admin-managed JSON. Prevent browser/proxy 304
// responses from leaving the public galleries with an empty/stale file list.
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('Vary: Host');

// ============= Configuration =============

/** Maximum allowed file size (bytes). 15 MB covers high-res posters + PDFs. */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Shared admin password (mirrors site_config.php). */
const ADMIN_PASSWORD = 'admin2025';

/**
 * Per-section validation rules.
 *   - exts:  allowed lowercase file extensions
 *   - mimes: allowed MIME types (defensive — checked alongside extension)
 *   - kind:  human-readable label for error messages
 */
$SECTION_RULES = [
    'eventos' => [
        'exts'  => ['webp', 'jpg', 'jpeg', 'png', 'gif'],
        'mimes' => ['image/webp', 'image/jpeg', 'image/png', 'image/gif'],
        'kind'  => 'imagen',
    ],
    // Hero backgrounds per page/tournament. Managed from Admin > Heros
    // (manual upload or AI generation via /api/hero_ai.php, which writes
    // its output straight into this folder). Image-only.
    'heros' => [
        'exts'  => ['webp', 'jpg', 'jpeg', 'png', 'gif'],
        'mimes' => ['image/webp', 'image/jpeg', 'image/png', 'image/gif'],
        'kind'  => 'imagen',
    ],
    'avisos' => [
        'exts'  => ['webp', 'jpg', 'jpeg', 'png', 'gif'],
        'mimes' => ['image/webp', 'image/jpeg', 'image/png', 'image/gif'],
        'kind'  => 'imagen',
    ],
    'menus' => [
        // Menús poster grid (mirrors avisos behavior). Image-only.
        'exts'  => ['webp', 'jpg', 'jpeg', 'png', 'gif'],
        'mimes' => ['image/webp', 'image/jpeg', 'image/png', 'image/gif'],
        'kind'  => 'imagen',
    ],
    'premios' => [
        // Premios poster grid (mirrors eventos/avisos behavior). Image-only.
        'exts'  => ['webp', 'jpg', 'jpeg', 'png', 'gif'],
        'mimes' => ['image/webp', 'image/jpeg', 'image/png', 'image/gif'],
        'kind'  => 'imagen',
    ],
    'hoteles' => [
        // Hoteles poster grid (mirrors premios behavior). Image-only.
        'exts'  => ['webp', 'jpg', 'jpeg', 'png', 'gif'],
        'mimes' => ['image/webp', 'image/jpeg', 'image/png', 'image/gif'],
        'kind'  => 'imagen',
    ],
    'convocatoria' => [
        // Convocatoria mixes a poster gallery (images) with the official
        // tournament PDF — both upload through the same section so admins
        // see one cohesive panel.
        'exts'  => ['webp', 'jpg', 'jpeg', 'png', 'gif', 'pdf'],
        'mimes' => ['image/webp', 'image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
        'kind'  => 'imagen o PDF',
    ],
    'reglas' => [
        // Reglas only carries the downloadable rulebook PDF — no gallery.
        'exts'  => ['pdf'],
        'mimes' => ['application/pdf'],
        'kind'  => 'PDF',
    ],
    'skinrules' => [
        // Skin Rules only carries the downloadable skin game rulebook PDF.
        'exts'  => ['pdf'],
        'mimes' => ['application/pdf'],
        'kind'  => 'PDF',
    ],
    'banderas' => [
        // Banderas (pin sheet) — fallback / scanned copy of the official
        // pin sheet PDF or image. The page renders a custom visualization
        // first; uploaded files appear below as a downloadable poster grid.
        'exts'  => ['webp', 'jpg', 'jpeg', 'png', 'gif', 'pdf'],
        'mimes' => ['image/webp', 'image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
        'kind'  => 'imagen o PDF',
    ],
    'pdfs' => [
        // Legacy bucket — still listable/deletable so admins can clean up
        // pre-existing files, but no new uploads are routed here from the UI.
        'exts'  => ['pdf'],
        'mimes' => ['application/pdf'],
        'kind'  => 'PDF',
    ],
    'popup' => [
        // Images used by the site-wide POP UP overlay configured from the
        // Admin > POP tab. Image-only — the overlay never renders PDFs.
        'exts'  => ['webp', 'jpg', 'jpeg', 'png', 'gif'],
        'mimes' => ['image/webp', 'image/jpeg', 'image/png', 'image/gif'],
        'kind'  => 'imagen',
    ],
];

// ============= Helpers =============

/**
 * Normalize the active domain into a safe folder name.
 * Lowercases, strips port, and removes anything that isn't a-z/0-9/dot/dash.
 */
function safe_domain_folder() {
    $host = strtolower($_SERVER['HTTP_HOST'] ?? 'localhost');
    // Strip port if present (e.g. localhost:8080 → localhost)
    if (($pos = strpos($host, ':')) !== false) {
        $host = substr($host, 0, $pos);
    }
    return preg_replace('/[^a-z0-9.\-]/', '', $host) ?: 'localhost';
}

/**
 * Sanitize a filename: strip directories, lowercase the extension,
 * replace runs of unsafe characters with `-`, and collapse repeated dashes.
 */
function safe_filename($raw) {
    // basename() blocks path traversal attempts (../, etc.)
    $name = basename($raw);
    // Split into stem + extension to lowercase the extension only.
    $dot = strrpos($name, '.');
    if ($dot === false) {
        $stem = $name;
        $ext  = '';
    } else {
        $stem = substr($name, 0, $dot);
        $ext  = strtolower(substr($name, $dot + 1));
    }
    // Replace anything outside [a-z0-9._-] with '-'
    $stem = strtolower($stem);
    $stem = preg_replace('/[^a-z0-9._-]+/', '-', $stem);
    $stem = preg_replace('/-+/', '-', $stem);
    $stem = trim($stem, '-.');
    if ($stem === '') {
        $stem = 'file-' . substr(md5(uniqid('', true)), 0, 8);
    }
    return $ext === '' ? $stem : "$stem.$ext";
}

/**
 * Alcance activo (multi-torneo): 'general' o el torneoid.
 * Se recibe como `?scope=274`. 'general' conserva la ruta histórica
 * `{domain}/{section}` para no mover los archivos ya subidos.
 */
function upload_scope() {
    $raw = strtolower(trim((string)($_GET['scope'] ?? $_POST['scope'] ?? '')));
    $raw = preg_replace('/[^a-z0-9_-]/', '', $raw);
    if ($raw === '' || $raw === 'general') return 'general';
    return $raw;
}

/** Segmento de carpeta del alcance ('' para general, 't274/' para un torneo). */
function scope_segment() {
    $scope = upload_scope();
    return $scope === 'general' ? '' : ('t' . $scope . '/');
}

/**
 * Resolve the absolute upload directory for a section, creating it if needed.
 * @return string Absolute path WITHOUT trailing slash
 */
function section_dir($section) {
    $domain = safe_domain_folder();
    $base = __DIR__ . '/uploads/' . $domain . '/' . scope_segment() . $section;
    if (!is_dir($base)) {
        @mkdir($base, 0775, true);
    }
    return $base;
}

/**
 * Build the public URL for a file under the given section.
 */
function public_url($section, $filename) {
    $domain = safe_domain_folder();
    $scope = scope_segment();
    $scopePath = $scope === '' ? '' : (rawurlencode(rtrim($scope, '/')) . '/');
    return '/api/uploads/' . rawurlencode($domain) . '/' . $scopePath . rawurlencode($section) . '/' . rawurlencode($filename);
}

/**
 * Build a cache-busted public URL for a listed file.
 * The server intentionally overwrites files with the same sanitized name;
 * adding mtime+size prevents browsers from reusing a stale 304 image after
 * an admin replaces a problematic upload with a corrected version.
 */
function public_versioned_url($section, $filename, $fullPath) {
    $mtime = @filemtime($fullPath) ?: time();
    $size = @filesize($fullPath) ?: 0;
    return public_url($section, $filename) . '?v=' . rawurlencode($mtime . '-' . $size);
}

/**
 * Build a cache-busted public URL for a generated thumbnail.
 * Thumbnails live in `{section}/_thumbs/`, which is served by the same
 * static path as the originals (no rewrite rules required).
 */
function public_thumb_url($section, $thumbName, $thumbPath) {
    $domain = safe_domain_folder();
    $mtime = @filemtime($thumbPath) ?: time();
    $scope = scope_segment();
    $scopePath = $scope === '' ? '' : (rawurlencode(rtrim($scope, '/')) . '/');
    return '/api/uploads/' . rawurlencode($domain) . '/' . $scopePath . rawurlencode($section)
        . '/' . THUMB_DIR_NAME . '/' . rawurlencode($thumbName) . '?v=' . rawurlencode((string)$mtime);
}

/**
 * Build the `thumbs` payload for a listed image, generating any missing
 * sizes on the fly (first request after a deploy / cache purge).
 *
 * @return array<string,string> size key → public thumbnail URL
 */
function build_thumbs_payload($section, $dir, $filename, $fullPath) {
    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    if (!in_array($ext, ['webp', 'jpg', 'jpeg', 'png', 'gif'], true)) return [];
    $urls = [];
    foreach (generate_all_thumbnails($fullPath, $dir) as $key => $thumbName) {
        $urls[$key] = public_thumb_url($section, $thumbName, $dir . '/' . THUMB_DIR_NAME . '/' . $thumbName);
    }
    return $urls;
}

/**
 * Validate browser-compatible image dimensions before accepting an upload.
 * Very tall/wide images can be under 15 MB but exceed browser decoder limits,
 * which makes galleries appear blank with no useful console/network error.
 */
function validate_image_dimensions($tmpPath, $originalName) {
    $info = @getimagesize($tmpPath);
    if ($info === false || empty($info[0]) || empty($info[1])) {
        return "No se pudo leer como imagen válida";
    }

    $width = (int)$info[0];
    $height = (int)$info[1];
    $maxSide = 32767;

    if ($width > $maxSide || $height > $maxSide) {
        return "Dimensiones demasiado grandes ({$width}×{$height}px). Máximo recomendado: {$maxSide}px por lado para que el navegador la pueda mostrar.";
    }

    return null;
}

/**
 * Convert an uploaded raster image to WebP in-place to shrink page weight.
 * -----------------------------------------------------------------------
 * Runs AFTER move_uploaded_file() has written the final file to disk. If
 * conversion succeeds, the original file is deleted and the new .webp file
 * replaces it. If GD isn't available, the source format isn't convertible,
 * or the encoded WebP would actually be LARGER than the original (rare,
 * tiny PNGs / already-optimized JPGs), we silently keep the original.
 *
 * Returns the final filename on disk (either "<stem>.webp" or the original
 * $cleanName unchanged). PDFs and existing .webp files are skipped.
 *
 * @param string $fullPath   Absolute path of the file just written
 * @param string $cleanName  Sanitized filename already used for $fullPath
 * @param string $dir        Section directory (without trailing slash)
 * @return string            Final filename to record in the response
 */
function maybe_convert_to_webp($fullPath, $cleanName, $dir) {
    // Skip non-images and files already in WebP.
    $ext = strtolower(pathinfo($cleanName, PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'gif'], true)) {
        return $cleanName;
    }
    // GD is required for in-PHP conversion. IONOS ships with it enabled,
    // but guard anyway so the upload still succeeds without conversion.
    if (!function_exists('imagewebp') || !function_exists('imagecreatefromstring')) {
        return $cleanName;
    }

    // Load the source image. imagecreatefromstring handles JPG/PNG/GIF/BMP/WebP
    // transparently and is more forgiving than the per-format constructors.
    $raw = @file_get_contents($fullPath);
    if ($raw === false) return $cleanName;
    $img = @imagecreatefromstring($raw);
    if ($img === false) return $cleanName;

    // Preserve alpha channel (PNG/GIF transparency → WebP transparency).
    @imagepalettetotruecolor($img);
    @imagealphablending($img, false);
    @imagesavealpha($img, true);

    // Encode to a temp file first so a failed encode never deletes the original.
    $stem = preg_replace('/\.[^.]+$/', '', $cleanName);
    $webpName = $stem . '.webp';
    $webpPath = $dir . '/' . $webpName;
    $tmpWebp = $webpPath . '.tmp';

    // Quality 82 is a sweet spot: visually lossless for posters, ~70–90%
    // smaller than the source PNG/JPG in our internal tests.
    $ok = @imagewebp($img, $tmpWebp, 82);
    @imagedestroy($img);
    if (!$ok || !is_file($tmpWebp)) {
        @unlink($tmpWebp);
        return $cleanName;
    }

    // Only swap if WebP is actually smaller than the original; otherwise
    // discard the conversion to avoid bloating tiny/optimized assets.
    $originalSize = @filesize($fullPath) ?: PHP_INT_MAX;
    $webpSize = @filesize($tmpWebp) ?: PHP_INT_MAX;
    if ($webpSize >= $originalSize) {
        @unlink($tmpWebp);
        return $cleanName;
    }

    // Promote tmp → final, drop the original, and return the new filename.
    if (!@rename($tmpWebp, $webpPath)) {
        @unlink($tmpWebp);
        return $cleanName;
    }
    @chmod($webpPath, 0664);
    // If the original happened to share the same name (.webp already), don't
    // delete what we just wrote.
    if ($webpPath !== $fullPath) {
        @unlink($fullPath);
    }
    return $webpName;
}

/**
 * Convert PHP shorthand size strings (e.g. 8M, 128K, 1G) to bytes.
 * Used only for clearer upload-limit diagnostics when PHP discards the body.
 */
function php_size_to_bytes($value) {
    $value = trim((string)$value);
    if ($value === '') return 0;
    $unit = strtolower(substr($value, -1));
    $number = (float)$value;
    switch ($unit) {
        case 'g': $number *= 1024;
        case 'm': $number *= 1024;
        case 'k': $number *= 1024;
    }
    return (int)$number;
}

/**
 * Convert a snake/dash filename stem into a Title Case alt label.
 * Example: "01-clima-aviso" → "01 Clima Aviso"
 */
function filename_to_alt($filename) {
    $stem = preg_replace('/\.[^.]+$/', '', $filename);
    $stem = preg_replace('/[-_]+/', ' ', $stem);
    $stem = trim($stem);
    if ($stem === '') return $filename;
    $words = preg_split('/\s+/', $stem);
    $words = array_map(function ($w) {
        if ($w === '') return $w;
        return mb_strtoupper(mb_substr($w, 0, 1)) . mb_substr($w, 1);
    }, $words);
    return implode(' ', $words);
}

/**
 * Require the admin password (from POST body or query).
 * Aborts with 401 on mismatch.
 */
function require_admin($body) {
    global $conn;
    $pw = $body['password'] ?? ($_POST['password'] ?? ($_GET['password'] ?? ''));
    if (!is_superadmin_password($conn, $pw)) {
        // Mezcla: para el body buscamos token también en $_POST (multipart)
        $merged = is_array($body) ? $body : [];
        if (!empty($_POST['staff_token']))     $merged['staff_token'] = $_POST['staff_token'];
        $staff = staff_check_area($conn, $merged, 'uploads');
        if (!$staff) json_error('Unauthorized', 401);
    }
}

// ============= Routing =============

global $SECTION_RULES;

$section = isset($_GET['section']) ? strtolower(trim($_GET['section'])) : '';
if ($section === '' || !isset($SECTION_RULES[$section])) {
    json_error('Invalid or missing section. Allowed: ' . implode(', ', array_keys($SECTION_RULES)), 400);
}
$rules = $SECTION_RULES[$section];

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? strtolower(trim($_GET['action'])) : '';

// ============= GET → list files =============
if ($method === 'GET') {
    $dir = section_dir($section);
    $files = [];
    if (is_dir($dir)) {
        foreach (scandir($dir) as $entry) {
            if ($entry === '.' || $entry === '..') continue;
            $full = $dir . '/' . $entry;
            if (!is_file($full)) continue;
            $ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
            if (!in_array($ext, $rules['exts'], true)) continue;
            // Thumbnails are generated lazily here so pre-existing uploads
            // (from before this feature) also gain fast grid variants.
            $thumbs = build_thumbs_payload($section, $dir, $entry, $full);
            $files[] = [
                'name'     => $entry,
                'url'      => public_versioned_url($section, $entry, $full),
                'alt'      => filename_to_alt($entry),
                'size'     => filesize($full),
                'modified' => filemtime($full),
                // size key → URL ('small' for grids, 'medium' for lightbox)
                'thumbs'   => $thumbs,
                'thumbUrl' => $thumbs['small'] ?? null,
            ];
        }
    }
    // Sort by name (case-insensitive natural order) so numeric prefixes work.
    usort($files, function ($a, $b) {
        return strnatcasecmp($a['name'], $b['name']);
    });
    json_response([
        'section' => $section,
        'kind'    => $rules['kind'],
        'files'   => $files,
    ]);
}

// ============= POST → upload or delete =============
if ($method !== 'POST') {
    json_error('Method not allowed', 405);
}

// ----- DELETE a single file -----
if ($action === 'delete') {
    // Body is JSON: { password, name }
    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    require_admin($body);

    $name = isset($body['name']) ? safe_filename($body['name']) : '';
    if ($name === '') {
        json_error('Missing file name', 400);
    }
    $target = section_dir($section) . '/' . $name;
    if (!is_file($target)) {
        json_error('File not found', 404);
    }
    if (!@unlink($target)) {
        json_error('Failed to delete file', 500);
    }
    // Drop derived thumbnails so the cache never outlives the original.
    delete_thumbnails($name, section_dir($section));
    json_response(['deleted' => true, 'name' => $name]);
}

// ----- UPLOAD one or more files -----
if ($action === 'upload') {
    // Multipart form: password + files[] (or single `file`)
    if (empty($_FILES)) {
        // When the request body exceeds post_max_size, PHP discards both
        // $_POST and $_FILES *before* this script runs. CONTENT_LENGTH is
        // still set by the web server, so we can detect the silent drop
        // before auth and return a useful error instead of a misleading 401.
        $postMax = ini_get('post_max_size');
        $uploadMax = ini_get('upload_max_filesize');
        $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
        $postMaxBytes = php_size_to_bytes($postMax);
        if ($contentLength > 0 && $postMaxBytes > 0 && $contentLength > $postMaxBytes) {
            json_error(
                "El archivo excede el límite del servidor PHP (post_max_size=$postMax, upload_max_filesize=$uploadMax). " .
                "Sube un archivo más pequeño o aumenta los límites en .user.ini.",
                413
            );
        }
        json_error('No files received. Use multipart/form-data with field "files[]".', 400);
    }

    require_admin($_POST);

    // Normalize $_FILES into a uniform list of [name, tmp_name, size, error, type]
    $items = [];
    foreach ($_FILES as $field => $info) {
        if (is_array($info['name'])) {
            $count = count($info['name']);
            for ($i = 0; $i < $count; $i++) {
                $items[] = [
                    'name'     => $info['name'][$i],
                    'tmp_name' => $info['tmp_name'][$i],
                    'size'     => $info['size'][$i],
                    'error'    => $info['error'][$i],
                    'type'     => $info['type'][$i],
                ];
            }
        } else {
            $items[] = $info;
        }
    }

    $dir = section_dir($section);
    $saved = [];
    $errors = [];

    foreach ($items as $item) {
        $original = $item['name'] ?? 'unknown';

        if (($item['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            // Map PHP upload error codes to actionable Spanish messages so the
            // admin UI can show why a specific file was rejected (size, partial
            // upload, missing tmp dir, etc.) instead of a bare numeric code.
            $errCode = $item['error'];
            $errMsg = [
                UPLOAD_ERR_INI_SIZE   => 'Excede upload_max_filesize del servidor PHP',
                UPLOAD_ERR_FORM_SIZE  => 'Excede MAX_FILE_SIZE del formulario',
                UPLOAD_ERR_PARTIAL    => 'Subida incompleta — reintenta',
                UPLOAD_ERR_NO_FILE    => 'No se recibió archivo',
                UPLOAD_ERR_NO_TMP_DIR => 'Falta directorio temporal en el servidor',
                UPLOAD_ERR_CANT_WRITE => 'No se pudo escribir al disco',
                UPLOAD_ERR_EXTENSION  => 'Una extensión PHP bloqueó la subida',
            ][$errCode] ?? ('Upload error code ' . $errCode);
            $errors[] = ['name' => $original, 'error' => $errMsg];
            continue;
        }
        if ($item['size'] > MAX_UPLOAD_BYTES) {
            $errors[] = ['name' => $original, 'error' => 'File too large (max 15MB)'];
            continue;
        }

        $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
        if (!in_array($ext, $rules['exts'], true)) {
            $errors[] = ['name' => $original, 'error' => "Extension .$ext not allowed for {$rules['kind']}"];
            continue;
        }

        // Sniff actual MIME from file contents (defensive)
        $detectedMime = '';
        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo) {
                $detectedMime = finfo_file($finfo, $item['tmp_name']) ?: '';
                finfo_close($finfo);
            }
        }
        // Some servers return image/jpg instead of image/jpeg — normalize.
        if ($detectedMime === 'image/jpg') $detectedMime = 'image/jpeg';
        if ($detectedMime !== '' && !in_array($detectedMime, $rules['mimes'], true)) {
            $errors[] = ['name' => $original, 'error' => "MIME $detectedMime not allowed"];
            continue;
        }

        if (strpos($detectedMime, 'image/') === 0) {
            $dimensionError = validate_image_dimensions($item['tmp_name'], $original);
            if ($dimensionError !== null) {
                $errors[] = ['name' => $original, 'error' => $dimensionError];
                continue;
            }
        }

        $cleanName = safe_filename($original);
        $target = $dir . '/' . $cleanName;

        // Move uploaded file (overwrites if a file with the same sanitized
        // name already exists — intentional, lets users replace by re-upload).
        if (!move_uploaded_file($item['tmp_name'], $target)) {
            $errors[] = ['name' => $original, 'error' => 'Failed to write file'];
            continue;
        }
        @chmod($target, 0664);

        // Auto-convert JPG/PNG/GIF → WebP to keep gallery pages lightweight.
        // The helper returns the final filename (may have changed extension).
        $cleanName = maybe_convert_to_webp($target, $cleanName, $dir);
        $target = $dir . '/' . $cleanName;

        // Pre-generate thumbnails right after the upload so the first
        // visitor never pays the resize cost. Stale variants from a replaced
        // file are cleared first.
        delete_thumbnails($cleanName, $dir);
        $thumbs = build_thumbs_payload($section, $dir, $cleanName, $target);

        $saved[] = [
            'name'     => $cleanName,
            'original' => $original,
            'url'      => public_versioned_url($section, $cleanName, $target),
            'size'     => filesize($target),
            'thumbs'   => $thumbs,
            'thumbUrl' => $thumbs['small'] ?? null,
        ];
    }

    json_response([
        'section' => $section,
        'saved'   => $saved,
        'errors'  => $errors,
    ]);
}

json_error('Unknown action. Use ?action=upload or ?action=delete.', 400);
