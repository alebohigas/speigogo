<?php
/**
 * Site Torneos Endpoint (multi-torneo)
 *
 * GET  /api/site_torneos.php   → torneos configurados para este dominio.
 * POST /api/site_torneos.php   → guarda la lista completa (solo superadmin).
 *      body: { password, torneos: [{ torneoid, nombre, slug, orden, activo }] }
 *
 * Tabla: site_torneos (ver server/migrations/2026_09_07_multitorneo_01_scope.sql)
 */
require_once 'config.php';
require_once '_staff_auth.php';

header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

$domain = esc($conn, $_SERVER['HTTP_HOST'] ?? 'localhost');

/** Nombre corto para la dirección: primera palabra utilizable del nombre. */
function torneo_slug($nombre, $torneoid) {
    $n = strtolower(trim((string)$nombre));
    $n = iconv('UTF-8', 'ASCII//TRANSLIT', $n);
    $n = preg_replace('/[^a-z0-9 ]+/', ' ', $n);
    $parts = array_values(array_filter(explode(' ', $n), function ($w) {
        return $w !== '' && !is_numeric($w) && !in_array($w, ['torneo', 'de', 'del', 'la', 'el', 'los', 'las', 'anual', 'golf'], true);
    }));
    $slug = $parts[0] ?? ('torneo' . $torneoid);
    return substr($slug, 0, 40);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $torneos = [];
    $res = @$conn->query("SELECT torneoid, nombre, slug, orden, activo FROM site_torneos WHERE domain = '$domain' ORDER BY orden ASC, torneoid ASC");
    if ($res) {
        while ($r = $res->fetch_assoc()) {
            $torneos[] = [
                'torneoid' => (int)$r['torneoid'],
                'nombre'   => $r['nombre'],
                'slug'     => $r['slug'],
                'orden'    => (int)$r['orden'],
                'activo'   => (int)$r['activo'] === 1,
            ];
        }
    }
    json_response(['domain' => $_SERVER['HTTP_HOST'], 'torneos' => $torneos]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!$body) json_error('Invalid JSON body', 400);

    if (!is_superadmin_password($conn, $body['password'] ?? '')) {
        json_error('Unauthorized', 401);
    }

    $torneos = isset($body['torneos']) && is_array($body['torneos']) ? $body['torneos'] : [];

    // Reescribe la lista completa del dominio.
    @$conn->query("DELETE FROM site_torneos WHERE domain = '$domain'");

    $orden = 0;
    $usados = [];
    foreach ($torneos as $t) {
        $tid = (int)($t['torneoid'] ?? 0);
        if ($tid <= 0) continue;
        $orden++;
        $nombre = trim((string)($t['nombre'] ?? ''));
        if ($nombre === '') {
            $r = query_one($conn, "SELECT nombre FROM torneo WHERE torneo_id = $tid LIMIT 1");
            $nombre = $r['nombre'] ?? ('Torneo ' . $tid);
        }
        $slug = trim(strtolower((string)($t['slug'] ?? '')));
        if ($slug === '') $slug = torneo_slug($nombre, $tid);
        $slug = preg_replace('/[^a-z0-9-]+/', '', $slug);
        if ($slug === '') $slug = 'torneo' . $tid;
        // Evita choques entre torneos con la misma primera palabra.
        $base = $slug; $i = 2;
        while (in_array($slug, $usados, true)) { $slug = $base . $i; $i++; }
        $usados[] = $slug;

        $activo = !empty($t['activo']) ? 1 : 0;
        $sql = "INSERT INTO site_torneos (domain, torneoid, nombre, slug, orden, activo)
                VALUES ('$domain', $tid, '" . esc($conn, $nombre) . "', '" . esc($conn, $slug) . "', $orden, $activo)
                ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), slug = VALUES(slug), orden = VALUES(orden), activo = VALUES(activo)";
        if (!$conn->query($sql)) {
            json_error('Failed to save torneos: ' . $conn->error);
        }
    }

    json_response(['domain' => $_SERVER['HTTP_HOST'], 'saved' => true]);
}

json_error('Method not allowed', 405);
