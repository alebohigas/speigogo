/**
 * heroPages.ts
 * -----------------------------------------------------------------------
 * Catalog of the public pages whose HERO background can be replaced per
 * tournament from Admin > Heros.
 *
 * The `path` is the route pathname and doubles as the storage key inside
 * `site_config.hero_config` — `PageHero` resolves its override by matching
 * the current pathname against these keys, so no page needs extra props.
 *
 * `aiPrompt` is the default prompt pre-filled in the AI generator so an
 * admin can create a fitting hero in one click.
 */

/** One configurable hero slot. */
export interface HeroPageDef {
  /** Route pathname, also the hero_config key (e.g. '/convocatoria'). */
  path: string;
  /** Label shown in the admin table. */
  label: string;
  /** Default prompt used by the AI generator for this page. */
  aiPrompt: string;
}

export const HERO_PAGES: HeroPageDef[] = [
  { path: '/', label: 'Inicio', aiPrompt: 'Campo de golf al amanecer con fairway impecable y neblina baja' },
  { path: '/convocatoria', label: 'Convocatoria', aiPrompt: 'Fairway exuberante en hora dorada con bunkers y palmeras' },
  { path: '/resultados', label: 'Resultados', aiPrompt: 'Pelota de golf junto al hoyo en un green perfectamente cortado' },
  { path: '/live', label: 'LIVE', aiPrompt: 'Golfista en silueta al atardecer con ambiente de torneo' },
  { path: '/salidas', label: 'Salidas', aiPrompt: 'Primer tee al amanecer con carritos de golf alineados' },
  { path: '/jugadores', label: 'Jugadores', aiPrompt: 'Bolsas y palos de golf recargados en hora dorada' },
  { path: '/equipos', label: 'Equipos', aiPrompt: 'Grupo de golfistas en equipo caminando por el fairway en hora dorada' },
  { path: '/competicion', label: 'Competición', aiPrompt: 'Hoyo par 3 sobre el agua en hora dorada con bandera' },
  { path: '/premios', label: 'Premios', aiPrompt: 'Trofeos dorados sobre paño verde con luz de reflector' },
  { path: '/eventos', label: 'Eventos', aiPrompt: 'Terraza de casa club con luces colgantes de noche' },
  { path: '/avisos', label: 'Avisos', aiPrompt: 'Tablero de avisos en el pórtico de una casa club al atardecer' },
  { path: '/menus', label: 'Menús', aiPrompt: 'Mesa elegante de restaurante de casa club con luz de vela' },
  { path: '/hoteles', label: 'Hoteles', aiPrompt: 'Hotel resort junto al campo de golf iluminado al anochecer' },
  { path: '/reglas', label: 'Reglas y CC', aiPrompt: 'Tarjeta de score, lápiz y pelota sobre mesa de madera' },
  { path: '/calendario', label: 'Calendario', aiPrompt: 'Vista aérea de fairways y bunkers de un campo de golf' },
  { path: '/horarios', label: 'Horarios', aiPrompt: 'Rayos de sol y neblina sobre un fairway al alba' },
  { path: '/registro', label: 'Pre-Registro', aiPrompt: 'Entrada de casa club de torneo en hora dorada' },
  { path: '/banderas', label: 'Banderas', aiPrompt: 'Bandera de golf ondeando en un green al amanecer' },
  { path: '/matchplay', label: 'Match Play', aiPrompt: 'Dos pelotas de golf frente al hoyo en duelo, luz baja' },
  { path: '/skingame', label: 'Skin Game', aiPrompt: 'Pelota cayendo en el hoyo en hora dorada, ángulo dramático' },
  { path: '/skinrules', label: 'Skin Reglas', aiPrompt: 'Reglamento de skins sobre mesa de madera con pelota de golf' },
  { path: '/skinplayers', label: 'Skin Jugadores', aiPrompt: 'Grupo de golfistas caminando por el fairway en hora dorada' },
  { path: '/skinscorecards', label: 'Skin Tarjetas', aiPrompt: 'Tarjetas de score y lápiz sobre el green al atardecer' },
  { path: '/patrocinadores', label: 'Patrocinadores', aiPrompt: 'Vallas de patrocinadores en blanco junto al fairway al atardecer' },
  { path: '/stats', label: 'Estadísticas', aiPrompt: 'Vista panorámica de un campo de golf con luz cálida' },
  { path: '/historial', label: 'Historial', aiPrompt: 'Campo de golf clásico con árboles maduros en luz cálida vintage' },
];

/** Lookup a hero page definition by pathname (exact match). */
export const findHeroPage = (pathname: string): HeroPageDef | undefined =>
  HERO_PAGES.find((p) => p.path === pathname);

/**
 * Legacy hero_config keys kept for backwards compatibility.
 * Older saved configs used route names that never matched the real routes
 * (e.g. '/competencias' instead of '/competicion'), so `useHeroOverride`
 * also looks under these aliases before falling back to the bundled image.
 */
export const HERO_PATH_ALIASES: Record<string, string[]> = {
  '/competicion': ['/competencias'],
  '/skingame': ['/skin'],
};
