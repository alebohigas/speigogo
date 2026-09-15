<?php
/**
 * Logos de equipo desde la tabla `equipos`
 * ------------------------------------------------------------------
 * La tabla `equipos` guarda, por torneo:
 *   id | equipo (nombre) | logo (ej. 'logos/logo_4aces.png') | torneoid | subgrupo
 *
 * Este helper arma un índice en memoria con varias llaves posibles
 * (id, nombre normalizado, identificador de grupo) para poder relacionar
 * el logo correcto con `jugadores.grupoid`, que según el torneo puede venir
 * como el nombre del equipo, como el número del equipo o como
 * "AK9001 The Beginners".
 *
 * Se usa en equipos.php, salidas_det.php y resultados_equipos.php para que
 * las tres páginas muestren exactamente la misma imagen por equipo.
 *
 * Sin salida de texto/HTML: cualquier error va a error_log.
 */

if (!function_exists('equipos_logo_norm')) {
    /** Normaliza un texto para comparar nombres de equipo. */
    function equipos_logo_norm($s) {
        $s = (string)$s;
        $s = strtr($s, [
            'á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','ü'=>'u','ñ'=>'n',
            'Á'=>'A','É'=>'E','Í'=>'I','Ó'=>'O','Ú'=>'U','Ü'=>'U','Ñ'=>'N',
        ]);
        $s = strtoupper($s);
        $s = preg_replace('/[^A-Z0-9]/', '', $s);
        return $s === null ? '' : $s;
    }
}

if (!function_exists('equipos_logo_url')) {
    /**
     * Convierte el valor guardado en la base de datos en una URL utilizable.
     *
     * Los logos de equipo viven en el servidor de imágenes, bajo la carpeta
     * /jugadores/, y la base de datos guarda la ruta relativa a esa carpeta:
     *   'logos/equipo-06_1.png'  ->  https://alien.speigogo.com/jugadores/logos/equipo-06_1.png
     *
     * Acepta además '../jugadores/x.png', '/ruta/x.png', 'x.png' o una URL
     * absoluta (que se respeta tal cual).
     */
    function equipos_logo_url($raw) {
        $imgBase = 'https://alien.speigogo.com/jugadores/';
        $raw = trim((string)$raw);
        if ($raw === '') return '';
        if (preg_match('#^https?://#i', $raw)) return $raw;

        $path = str_replace('\\', '/', $raw);
        // '../jugadores/logos/x.png' -> 'logos/x.png'
        $path = preg_replace('#^(\.\./)+#', '', $path);
        $path = preg_replace('#^/?jugadores/#i', '', $path);
        $path = ltrim($path, '/');
        if ($path === '') return '';

        // Codifica cada segmento sin romper las diagonales.
        $segments = array_map('rawurlencode', explode('/', $path));
        return $imgBase . implode('/', $segments);
    }
}

if (!function_exists('equipos_logo_index')) {
    /**
     * Índice de logos del torneo: llave normalizada => URL del logo.
     * @param mysqli $conn
     * @param string|int $torneoid
     */
    function equipos_logo_index($conn, $torneoid) {
        static $cache = [];
        $key = (string)$torneoid;
        if (isset($cache[$key])) return $cache[$key];

        $index = [];
        $cols = [];
        $rc = @$conn->query("SHOW COLUMNS FROM equipos");
        if ($rc) {
            while ($c = $rc->fetch_assoc()) { $cols[strtolower($c['Field'])] = true; }
            $rc->free();
        }
        if (empty($cols) || !isset($cols['logo'])) {
            $cache[$key] = $index;
            return $index;
        }

        $where = '';
        if (isset($cols['torneoid']) && $key !== '') {
            $where = " WHERE torneoid = '" . $conn->real_escape_string($key) . "'";
        }
        $nameCol = isset($cols['equipo']) ? 'equipo' : (isset($cols['nombre']) ? 'nombre' : null);
        $select  = 'logo' . (isset($cols['id']) ? ', id' : '') . ($nameCol ? ", $nameCol AS nombre_equipo" : '');
        $res = @$conn->query("SELECT $select FROM equipos" . $where);
        if (!$res) {
            error_log('_equipos_logos: consulta equipos falló: ' . $conn->error);
            $cache[$key] = $index;
            return $index;
        }

        while ($row = $res->fetch_assoc()) {
            $url = equipos_logo_url($row['logo'] ?? '');
            if ($url === '') continue;
            $add = function ($k) use (&$index, $url) {
                $k = (string)$k;
                if ($k !== '' && !isset($index[$k])) $index[$k] = $url;
            };
            if (isset($row['id'])) $add('ID:' . (int)$row['id']);
            if (isset($row['nombre_equipo'])) {
                $n = equipos_logo_norm($row['nombre_equipo']);
                $add('N:' . $n);
                // "AK9001 The Beginners" → también por su parte numérica.
                $num = preg_replace('/\D/', '', (string)$row['nombre_equipo']);
                if ($num !== '') $add('NUM:' . ltrim($num, '0'));
            }
        }
        $res->free();

        $cache[$key] = $index;
        return $index;
    }
}

if (!function_exists('equipos_logo_find')) {
    /**
     * Busca el logo de un equipo a partir de `jugadores.grupoid`
     * (y opcionalmente el nombre del equipo ya resuelto).
     */
    function equipos_logo_find($index, $grupoid, $teamName = '') {
        if (empty($index)) return '';
        $candidates = [];
        foreach ([$teamName, $grupoid] as $raw) {
            $raw = trim((string)$raw);
            if ($raw === '') continue;
            $candidates[] = 'N:' . equipos_logo_norm($raw);
            // "AK9001 The Beginners" → nombre sin la clave inicial.
            if (preg_match('/^([A-Za-z]*\d+[A-Za-z0-9\-]*)\s+(.+)$/u', $raw, $m)) {
                $candidates[] = 'N:' . equipos_logo_norm($m[2]);
                $num = preg_replace('/\D/', '', $m[1]);
                if ($num !== '') {
                    $candidates[] = 'NUM:' . ltrim($num, '0');
                    $candidates[] = 'ID:' . (int)$num;
                }
            }
            $num = preg_replace('/\D/', '', $raw);
            if ($num !== '' && $num === preg_replace('/\s/', '', $raw)) {
                // grupoid puramente numérico: puede ser el id del equipo.
                $candidates[] = 'ID:' . (int)$num;
                $candidates[] = 'NUM:' . ltrim($num, '0');
            }
        }
        foreach ($candidates as $c) {
            if (isset($index[$c])) return $index[$c];
        }
        return '';
    }
}
