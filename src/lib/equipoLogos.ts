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
  push(num);
  push(`${num}_1`);
  push(id);
  push(`${id}_1`);

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
