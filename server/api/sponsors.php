<?php
/**
 * Sponsors Endpoint
 * GET /api/sponsors.php?torneoid=XXX
 * Returns sponsor list for the tournament
 * NOTE: Returns empty array if patrocinadores table doesn't exist
 */
require_once 'config.php';

$torneoid = require_param('torneoid');
$tid = esc($conn, $torneoid);

/**
 * Sponsor logos are hosted on an external domain (not on this server's filesystem).
 * We build absolute URLs pointing directly to that public bucket.
 * Example final URL: https://alien.speigogo.com/logos_patrocinadores/apat-12.png
 */
$SPONSOR_LOGO_BASE = 'https://alien.speigogo.com/logos_patrocinadores/';

/** Check if patrocinadores table exists before querying */
$tableCheck = $conn->query("SHOW TABLES LIKE 'patrocinadores'");
if ($tableCheck && $tableCheck->num_rows > 0) {
    /**
     * Detect which optional columns exist on the patrocinadores table.
     *
     * Schema is being migrated:
     *  - NEW: 'logo'        => holds the relative file path (e.g. "logos_patrocinadores/foo.png")
     *  - OLD: 'logo_nombre' => previously held the path; now becoming a human-readable label
     *  - 'contacto'         => optional, may not exist on every deployment
     *
     * We probe each column with SHOW COLUMNS so the endpoint stays resilient
     * regardless of which migration step a given environment is on.
     */
    $hasLogo       = $conn->query("SHOW COLUMNS FROM patrocinadores LIKE 'logo'");
    $hasLogoNombre = $conn->query("SHOW COLUMNS FROM patrocinadores LIKE 'logo_nombre'");
    $hasContacto   = $conn->query("SHOW COLUMNS FROM patrocinadores LIKE 'contacto'");

    $hasLogo       = $hasLogo && $hasLogo->num_rows > 0;
    $hasLogoNombre = $hasLogoNombre && $hasLogoNombre->num_rows > 0;
    $hasContacto   = $hasContacto && $hasContacto->num_rows > 0;

    // Build SELECT list dynamically based on existing columns
    $selectCols = ['id', 'nombre'];
    if ($hasContacto)   { $selectCols[] = 'contacto'; }
    if ($hasLogo)       { $selectCols[] = 'logo'; }
    if ($hasLogoNombre) { $selectCols[] = 'logo_nombre'; }

    $selectStr = implode(', ', $selectCols);
    $sql = "SELECT $selectStr
            FROM patrocinadores
            WHERE torneoid = $tid
            ORDER BY nombre ASC";

    $rows = query_all($conn, $sql);

    /**
     * Map DB rows to frontend-friendly shape.
     *
     * Field usage (per latest spec):
     *  - 'logo_nombre' → file name/path of the logo image (used to build the URL)
     *  - 'nombre'      → human-readable sponsor name (used as visible label/alt)
     *
     * The 'logo' column is intentionally ignored even if present.
     * Any leading "../" or slashes are stripped so we end up with a clean basename
     * that we can safely append to the external bucket URL.
     */
    $sponsors = array_map(function($row) use ($SPONSOR_LOGO_BASE, $hasLogoNombre, $hasContacto) {
        $logoUrl = null;
        if ($hasLogoNombre && !empty($row['logo_nombre'])) {
            // Normalise: strip "../", leading dots/slashes, and any "logos_patrocinadores/" prefix
            $file = $row['logo_nombre'];
            $file = preg_replace('#^(\.\./)+#', '', $file);     // remove repeated "../"
            $file = ltrim($file, './\\/');                       // remove leading dots/slashes
            $file = preg_replace('#^logos_patrocinadores/#', '', $file); // avoid double folder
            // Se sirve por el proxy propio: busca el archivo en las carpetas
            // locales del servidor (incluida /alien/logos/) y, si no está,
            // lo trae de los servidores de imágenes conocidos.
            $logoUrl = '/api/sponsor_logo.php?file=' . rawurlencode($file);
        }

        return [
            'id'         => (int)$row['id'],
            'name'       => $row['nombre'],
            'logoUrl'    => $logoUrl,
            'websiteUrl' => null,
            'contact'    => $hasContacto ? ($row['contacto'] ?? null) : null,
            /** Visible label under each logo — uses 'nombre' (not 'logo_nombre') */
            'logoName'   => $row['nombre'] ?? null,
        ];
    }, $rows);

    json_response($sponsors);
} else {
    /** Table doesn't exist - return empty array */
    json_response([]);
}