/**
 * Resolución de logos de equipo por número de equipo.
 * ---------------------------------------------------------------
 * Los logos se dejan como archivos sueltos en la carpeta pública
 * `public/logos-equipos/`, opcionalmente separados por torneo en
 * `public/logos-equipos/t{torneoid}/`.
 *
 * El nombre del archivo es el número de equipo, ignorando el sufijo
 * `_1` (o `_2`, `_3`…) con el que vienen exportados:
 *
 *   9001_1.png  →  equipo 9001  →  grupoid "AK9001"
 *
 * Como no sabemos de antemano la extensión ni si el archivo trae el
 * prefijo de letras del grupoid, generamos una lista de rutas candidatas
 * y el componente prueba una tras otra hasta que alguna carga.
 */

/** Extensiones soportadas para los archivos de logo. */
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'svg'];

/** Carpeta pública donde se dejan los logos de equipo. */
export const EQUIPO_LOGOS_DIR = '/logos-equipos';

/** Extrae la parte numérica del identificador de equipo ("AK9001" → "9001"). */
export const equipoNumber = (grupoid: string): string => (grupoid || '').replace(/\D/g, '');

/**
 * Construye las rutas candidatas del logo para un equipo.
 * Se buscan primero dentro de la carpeta del torneo y después en la raíz.
 */
export const buildEquipoLogoCandidates = (grupoid: string, torneoId?: string): string[] => {
  const id = (grupoid || '').trim();
  if (!id) return [];
  const num = equipoNumber(id);

  const bases: string[] = [];
  const push = (b: string) => {
    if (b && !bases.includes(b)) bases.push(b);
  };
  // Sólo por número de equipo; si el identificador no trae número se usa
  // el identificador tal cual. Menos combinaciones = menos peticiones.
  if (num) {
    push(num);
    push(`${num}_1`);
  } else {
    push(id);
    push(`${id}_1`);
  }

  const dirs = torneoId
    ? [`${EQUIPO_LOGOS_DIR}/t${torneoId}`, EQUIPO_LOGOS_DIR]
    : [EQUIPO_LOGOS_DIR];

  const urls: string[] = [];
  for (const dir of dirs) {
    for (const base of bases) {
      for (const ext of EXTENSIONS) {
        urls.push(`${dir}/${base}.${ext}`);
      }
    }
  }
  return urls;
};

/**
 * Resolución de logos sin parpadeo.
 * ---------------------------------------------------------------
 * En vez de montar un <img> en la tabla y dejar que falle una y otra
 * vez (cada fallo re-renderiza la fila y provoca saltos de diseño),
 * probamos las rutas candidatas fuera del DOM con `new Image()` y sólo
 * mostramos la imagen cuando ya sabemos cuál carga.
 *
 * Los resultados se guardan en memoria: cada equipo se resuelve una
 * sola vez por sesión y las rutas ya conocidas como inexistentes no se
 * vuelven a pedir (aunque las comparta otro equipo).
 */

/** Resultado ya resuelto por clave de equipo. */
const resolved = new Map<string, string | null>();
/** Promesas en curso, para no duplicar el sondeo. */
const pending = new Map<string, Promise<string | null>>();
/** Rutas ya probadas: true = carga, false = no existe. */
const urlStatus = new Map<string, boolean>();

const probe = (url: string): Promise<boolean> => {
  const known = urlStatus.get(url);
  if (known !== undefined) return Promise.resolve(known);
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ok = img.naturalWidth > 0;
      urlStatus.set(url, ok);
      resolve(ok);
    };
    img.onerror = () => {
      urlStatus.set(url, false);
      resolve(false);
    };
    img.src = url;
  });
};

/** Devuelve la primera ruta que carga, o null si ninguna existe. */
export const resolveEquipoLogo = (
  grupoid: string,
  torneoId?: string,
  dbLogo?: string
): Promise<string | null> => {
  const key = `${torneoId || ''}|${grupoid || ''}|${dbLogo || ''}`;
  if (resolved.has(key)) return Promise.resolve(resolved.get(key) ?? null);
  const inflight = pending.get(key);
  if (inflight) return inflight;

  // El logo guardado en la base de datos manda: si el equipo ya trae su
  // imagen, ésa es la única que se pide. Sólo cuando NO hay imagen en la
  // base se buscan archivos sueltos en la carpeta pública, y ahí se limita
  // la búsqueda a unas pocas rutas para no disparar decenas de peticiones
  // por equipo.
  const candidates = dbLogo
    ? [dbLogo]
    : buildEquipoLogoCandidates(grupoid, torneoId);

  const run = (async () => {
    for (const url of candidates) {
      // Si ya sabemos que esa ruta no existe, ni siquiera la pedimos.
      if (urlStatus.get(url) === false) continue;
      // eslint-disable-next-line no-await-in-loop
      if (await probe(url)) {
        resolved.set(key, url);
        return url;
      }
    }
    resolved.set(key, null);
    return null;
  })();

  pending.set(key, run);
  run.finally(() => pending.delete(key));
  return run;
};

/** Ruta ya resuelta en memoria (sin lanzar sondeo). */
export const getCachedEquipoLogo = (
  grupoid: string,
  torneoId?: string,
  dbLogo?: string
): string | null | undefined => resolved.get(`${torneoId || ''}|${grupoid || ''}|${dbLogo || ''}`);
