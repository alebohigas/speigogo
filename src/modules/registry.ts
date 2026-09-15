/**
 * Module Registry
 * =============================================================================
 * Catálogo único de "módulos" del proyecto. Un módulo agrupa TODO lo que hace
 * falta para que una funcionalidad exista:
 *
 *   - `pageIds`        → ids de páginas del menú (ver `menuConfig` en src/data/mockData.ts)
 *   - `routes`         → rutas de React Router que pertenecen al módulo
 *   - `adminTabs`      → valores de tab en /admin que se muestran solo si el módulo está activo
 *   - `siteConfigKeys` → columnas JSON de la tabla `site_config` que usa el módulo
 *   - `apiFiles`       → endpoints PHP en server/api/ propios del módulo
 *   - `srcFiles`       → archivos/carpetas del frontend propios del módulo
 *   - `migrations`     → SQL en server/migrations/ requerido por el módulo
 *
 * Este archivo es la fuente de verdad para:
 *   1. La página /setup (encender/apagar módulos por proyecto).
 *   2. El filtrado de rutas, menú y tabs de /admin en tiempo de ejecución.
 *   3. scripts/check-modules.ts (aislamiento) y scripts/prune-modules.ts (poda).
 *
 * REGLA DE ORO: un módulo NO puede ser dependencia del núcleo, y solo puede
 * depender de otro módulo si lo declara en `dependsOn`.
 */

// ============= Tipos =============

/** Agrupación visual usada por la página /setup. */
export type ModuleGroup =
  | 'nucleo'
  | 'informacion'
  | 'competencia'
  | 'inscripciones'
  | 'presentacion';

/** Definición de un módulo. */
export interface ModuleDef {
  /** Identificador estable. NUNCA renombrar: se guarda en la base de datos. */
  id: string;
  /** Nombre visible en /setup. */
  label: string;
  /** Qué hace el módulo, en lenguaje de usuario. */
  description: string;
  /** Qué se pierde al apagarlo (aviso mostrado en /setup). */
  losesOnDisable: string;
  /** Los módulos núcleo no se pueden apagar nunca. */
  core: boolean;
  /** Agrupación en la UI de /setup. */
  group: ModuleGroup;
  /** Ids de página del menú que pertenecen al módulo. */
  pageIds: string[];
  /** Rutas de React Router del módulo (incluye rutas de admin propias). */
  routes: string[];
  /** Tabs de /admin que pertenecen al módulo. */
  adminTabs: string[];
  /** Áreas de permiso de staff relacionadas (ver StaffAuthContext). */
  staffAreas: string[];
  /** Columnas JSON de site_config usadas por el módulo. */
  siteConfigKeys: string[];
  /** Endpoints PHP propios (rutas relativas al repo). */
  apiFiles: string[];
  /** Archivos/carpetas del frontend propios (rutas relativas al repo). */
  srcFiles: string[];
  /** Migraciones SQL necesarias (rutas relativas al repo). */
  migrations: string[];
  /** Otros módulos requeridos para funcionar. */
  dependsOn?: string[];
}

// ============= Catálogo =============

/**
 * NÚCLEO — nunca se apaga.
 * Layout (header/footer/menús), visibilidad de páginas, staff/superadmin,
 * site_config, torneoid por dominio, tema, Archivos (uploads), Heros y Home.
 */
const CORE_MODULES: ModuleDef[] = [
  {
    id: 'core',
    label: 'Núcleo del sitio',
    description:
      'Home, encabezado, pie de página, menús, tema de colores, torneoid por dominio, ' +
      'sesión de superadmin y staff, y la configuración general de /admin.',
    losesOnDisable: 'No se puede apagar: sin esto el sitio no existe.',
    core: true,
    group: 'nucleo',
    pageIds: ['home'],
    routes: ['/', '/admin', '/setup'],
    adminTabs: ['config', 'pagina', 'usuarios'],
    staffAreas: [],
    siteConfigKeys: [
      'torneoid',
      'menu_order',
      'visibility',
      'menu_groups',
      'page_group_assignments',
      'theme_config',
      'home_config',
      'modules_config',
    ],
    apiFiles: [
      'server/api/config.php',
      'server/api/health.php',
      'server/api/site_config.php',
      'server/api/menu.php',
      'server/api/tournament.php',
      'server/api/categories.php',
      'server/api/clubs.php',
      'server/api/locations.php',
      'server/api/logo.php',
      'server/api/og_image.php',
      'server/api/admin_auth.php',
      'server/api/staff_login.php',
      'server/api/staff_session.php',
      'server/api/staff_users.php',
      'server/api/_staff_auth.php',
      'server/api/sponsors.php',
      'server/api/sponsor_logo.php',
    ],
    srcFiles: [
      'src/App.tsx',
      'src/main.tsx',
      'src/components/layout',
      'src/components/ui',
      'src/contexts',
      'src/modules',
      'src/pages/Index.tsx',
      'src/pages/Admin.tsx',
      'src/pages/Setup.tsx',
      'src/pages/NotFound.tsx',
    ],
    migrations: [],
  },
  {
    id: 'archivos',
    label: 'Archivos (uploads)',
    description:
      'Subida y borrado de imágenes/PDF desde /admin hacia el servidor, sin necesidad de FTP. ' +
      'Lo usan Eventos, Avisos, Menús, Premios, Hoteles, Convocatoria, Reglas y Heros.',
    losesOnDisable: 'No se puede apagar: varios módulos dependen de él.',
    core: true,
    group: 'nucleo',
    pageIds: [],
    routes: [],
    adminTabs: ['archivos'],
    staffAreas: ['uploads'],
    siteConfigKeys: [],
    apiFiles: ['server/api/uploads.php', 'server/api/_thumbs.php'],
    srcFiles: ['src/hooks/useUploads.ts', 'src/components/admin/AdminUploads.tsx'],
    migrations: [],
  },
  {
    id: 'heros',
    label: 'Heros (fondos por página)',
    description:
      'Imagen de portada de cada página, por torneo, seleccionable o generada con IA desde /admin.',
    losesOnDisable: 'No se puede apagar: cada página usa su hero por defecto igualmente.',
    core: true,
    group: 'nucleo',
    pageIds: [],
    routes: [],
    adminTabs: ['heros'],
    staffAreas: [],
    siteConfigKeys: ['hero_config'],
    apiFiles: ['server/api/hero_ai.php'],
    srcFiles: [
      'src/components/admin/AdminHeros.tsx',
      'src/config/heroPages.ts',
      'src/hooks/useHeroOverride.ts',
    ],
    migrations: ['server/migrations/2026_08_11_add_hero_config_to_site_config.sql'],
    dependsOn: ['archivos'],
  },
];

/** MÓDULOS OPCIONALES — se pueden apagar desde /setup. */
const OPTIONAL_MODULES: ModuleDef[] = [
  {
    id: 'convocatoria',
    label: 'Convocatoria',
    description:
      'Página de convocatoria con secciones dinámicas (descripción, elegibilidad, costos, ' +
      'categorías, premiación, desempates, valores Stableford, competencias, calendario) y su editor en /admin.',
    losesOnDisable: 'Se oculta /convocatoria y su editor. El contenido queda en la base de datos.',
    core: false,
    group: 'informacion',
    pageIds: ['convocatoria'],
    routes: ['/convocatoria'],
    adminTabs: ['convocatoria'],
    staffAreas: ['convocatoria', 'reglas'],
    siteConfigKeys: [],
    apiFiles: [
      'server/api/convocatoria_content.php',
      'server/api/valorstable.php',
      'server/api/categorias_reglas.php',
    ],
    srcFiles: [
      'src/pages/Convocatoria.tsx',
      'src/components/admin/AdminConvocatoria.tsx',
      'src/components/admin/convocatoria',
      'src/components/admin/AdminCategoriasReglas.tsx',
      'src/hooks/useConvocatoriaContent.ts',
      'src/hooks/useConvocatoriaSections.ts',
      'src/hooks/useCategoriasReglas.ts',
      'src/hooks/useValorStable.ts',
    ],
    migrations: ['server/migrations/2026_05_22_categorias_reglas.sql'],
  },
  {
    id: 'reglas',
    label: 'Reglas y CC',
    description: 'Página de reglas locales y condiciones de competencia, con PDF opcional.',
    losesOnDisable: 'Se oculta /reglas.',
    core: false,
    group: 'informacion',
    pageIds: ['reglas'],
    routes: ['/reglas'],
    adminTabs: [],
    staffAreas: ['reglas'],
    siteConfigKeys: [],
    apiFiles: [],
    srcFiles: ['src/pages/Reglas.tsx'],
    migrations: [],
  },
  {
    id: 'jugadores',
    label: 'Jugadores',
    description: 'Listado de jugadores por categoría con club, hándicap y ventajas.',
    losesOnDisable: 'Se oculta /jugadores.',
    core: false,
    group: 'competencia',
    pageIds: ['jugadores'],
    routes: ['/jugadores'],
    adminTabs: ['jugadores'],
    staffAreas: [],
    siteConfigKeys: [],
    apiFiles: ['server/api/players.php', 'server/api/categorias_admin.php'],
    srcFiles: [
      'src/pages/Jugadores.tsx',
      'src/hooks/usePlayersData.ts',
      'src/data/playersData.ts',
      'src/components/admin/AdminJugadores.tsx',
      'src/hooks/useCategoriasAdmin.ts',
    ],
    migrations: [],
  },
  {
    id: 'equipos',
    label: 'Equipos',
    description: 'Listado de equipos (formato AGOGO) por categoría con H.I. y H.C. de cada jugador.',
    losesOnDisable: 'Se oculta /equipos.',
    core: false,
    group: 'competencia',
    pageIds: ['equipos'],
    routes: ['/equipos'],
    adminTabs: [],
    staffAreas: [],
    siteConfigKeys: [],
    apiFiles: ['server/api/equipos.php'],
    srcFiles: ['src/pages/Equipos.tsx', 'src/hooks/useEquiposData.ts'],
    migrations: [],
  },
  {
    id: 'salidas',
    label: 'Salidas y horarios',
    description: 'Grupos de salida por día y categoría, más la matriz de horarios de salida.',
    losesOnDisable: 'Se ocultan /salidas y /horarios.',
    core: false,
    group: 'competencia',
    pageIds: ['salidas', 'horarios'],
    routes: ['/salidas', '/horarios'],
    adminTabs: [],
    staffAreas: [],
    siteConfigKeys: [],
    apiFiles: ['server/api/salidas.php', 'server/api/salidas_det.php', 'server/api/horarios.php'],
    srcFiles: [
      'src/pages/Salidas.tsx',
      'src/pages/Horarios.tsx',
      'src/hooks/useSalidasData.ts',
      'src/hooks/useHorariosData.ts',
      'src/data/salidasData.ts',
    ],
    migrations: [],
  },
  {
    id: 'resultados',
    label: 'Resultados',
    description:
      'Resultados por categoría (Stroke Play / Stableford, Neto y Gross), parciales, ' +
      'tarjetas hoyo por hoyo y eliminación directa.',
    losesOnDisable: 'Se oculta /resultados.',
    core: false,
    group: 'competencia',
    pageIds: ['resultados'],
    routes: ['/resultados'],
    adminTabs: [],
    staffAreas: [],
    siteConfigKeys: [],
    apiFiles: [
      'server/api/resultados.php',
      'server/api/resultados_jug.php',
      'server/api/resultados_parejas.php',
      'server/api/resultados_parciales.php',
      'server/api/resultados_tarjeta.php',
      'server/api/resultados_ed.php',
      'server/api/tarjeta_parejas.php',
    ],
    srcFiles: [
      'src/pages/Resultados.tsx',
      'src/hooks/useResultadosData.ts',
      'src/data/resultadosData.ts',
    ],
    migrations: [],
  },
  {
    id: 'historial',
    label: 'Historial de ediciones',
    description: 'Resultados de hasta 5 ediciones anteriores, configurables desde /admin.',
    losesOnDisable: 'Se oculta /historial y su configuración.',
    core: false,
    group: 'competencia',
    pageIds: ['historial'],
    routes: ['/historial'],
    adminTabs: ['historial'],
    staffAreas: [],
    siteConfigKeys: ['historial_config'],
    apiFiles: [],
    srcFiles: ['src/pages/Historial.tsx', 'src/components/admin/AdminHistorial.tsx'],
    migrations: ['server/migrations/2026_08_08_add_historial_config_to_site_config.sql'],
    dependsOn: ['resultados'],
  },
  {
    id: 'live',
    label: 'LIVE (scoring en vivo)',
    description:
      'Leaderboard en vivo con refresco automático, tarjetas hoyo por hoyo y colores de score.',
    losesOnDisable: 'Se ocultan /live y /live-scoring, y su tab en /admin.',
    core: false,
    group: 'competencia',
    pageIds: ['live'],
    routes: ['/live', '/live-scoring'],
    adminTabs: ['live'],
    staffAreas: ['live'],
    siteConfigKeys: ['live_scoring_config'],
    apiFiles: ['server/api/live_scoring.php', 'server/api/live_tarjeta.php'],
    srcFiles: [
      'src/pages/Live.tsx',
      'src/pages/LiveScoring.tsx',
      'src/components/admin/AdminLiveScoring.tsx',
      'src/data/liveData.ts',
    ],
    migrations: [],
  },
  {
    id: 'competicion',
    label: 'Competición (premios laterales)',
    description:
      "O'Yes, Putt, Approach, Driver (distancia y precisión), Skins y Mejor Score del Día.",
    losesOnDisable: 'Se oculta /competicion.',
    core: false,
    group: 'competencia',
    pageIds: ['competicion'],
    routes: ['/competicion'],
    adminTabs: [],
    staffAreas: [],
    siteConfigKeys: [],
    apiFiles: [
      'server/api/competencias.php',
      'server/api/oyes.php',
      'server/api/oyesx.php',
      'server/api/putt.php',
      'server/api/mejor_score_diario.php',
    ],
    srcFiles: [
      'src/pages/Competencias.tsx',
      'src/data/competencias',
      'src/data/competenciasConfig.ts',
      'src/hooks/useCompetenciasData.ts',
      'src/hooks/useAllCompetenciasData.ts',
      'src/hooks/useMejorScoreAvailability.ts',
    ],
    migrations: [],
  },
  {
    id: 'matchplay',
    label: 'Match Play y Brackets',
    description:
      'Brackets de Match Play y de Putt Finales (Caballeros, Damas o unificado), con podio y ' +
      'partido por el 3er lugar, administrables desde /admin.',
    losesOnDisable: 'Se ocultan /matchplay, /admin/brackets y sus tabs.',
    core: false,
    group: 'competencia',
    pageIds: ['matchplay'],
    routes: ['/matchplay', '/admin/brackets'],
    adminTabs: ['matchplay', 'brackets'],
    staffAreas: ['matchplay', 'brackets'],
    siteConfigKeys: [],
    apiFiles: [
      'server/api/brackets.php',
      'server/api/matchplay_admin.php',
      'server/api/matchplay_categories.php',
    ],
    srcFiles: [
      'src/pages/MatchPlay.tsx',
      'src/pages/AdminBracketsPage.tsx',
      'src/pages/PuttCalificados.tsx',
      'src/components/admin/AdminBrackets.tsx',
      'src/components/admin/AdminMatchPlay.tsx',
      'src/hooks/useBrackets.ts',
      'src/hooks/useMatchPlay.ts',
      'src/lib/bracketLive.ts',
    ],
    migrations: [
      'server/migrations/2026_05_18_putt_finales_brackets.sql',
      'server/migrations/2026_07_03_matchplay_third_place.sql',
    ],
  },
  {
    id: 'skins',
    label: 'Skin Game',
    description: 'Reglas, jugadores, tarjetas y resultados del Skin Game (Gross y Neto).',
    losesOnDisable: 'Se ocultan /skingame, /skinrules, /skinplayers y /skinscorecards.',
    core: false,
    group: 'competencia',
    pageIds: ['skingame', 'skinrules', 'skinplayers', 'skinscorecards'],
    routes: ['/skingame', '/skinrules', '/skinplayers', '/skinscorecards'],
    adminTabs: [],
    staffAreas: [],
    siteConfigKeys: [],
    apiFiles: ['server/api/skin_game.php', 'server/api/skin_scorecard.php'],
    srcFiles: [
      'src/pages/SkinGame.tsx',
      'src/pages/SkinRules.tsx',
      'src/pages/SkinPlayers.tsx',
      'src/pages/SkinScorecards.tsx',
    ],
    migrations: [],
  },
  {
    id: 'stats',
    label: 'Estadísticas',
    description:
      'Página /stats con clubes asistentes, estadísticas por categoría y por jugador, más los ' +
      'números del listón del Home.',
    losesOnDisable: 'Se oculta /stats y sus tabs en /admin.',
    core: false,
    group: 'informacion',
    pageIds: ['stats'],
    routes: ['/stats'],
    adminTabs: ['stats', 'stats-page'],
    staffAreas: ['stats'],
    siteConfigKeys: ['stats_config', 'stats_page_config'],
    apiFiles: [
      'server/api/stats_clubes.php',
      'server/api/stats_categoria.php',
      'server/api/stats_jugador.php',
    ],
    srcFiles: [
      'src/pages/Stats.tsx',
      'src/components/admin/AdminStats.tsx',
      'src/components/admin/AdminStatsPage.tsx',
      'src/hooks/useStatsData.ts',
    ],
    migrations: [
      'server/migrations/2026_06_10_site_config_stats.sql',
      'server/migrations/2026_07_21_add_stats_page_config_to_site_config.sql',
    ],
  },
  {
    id: 'registro',
    label: 'Pre-registro de jugadores',
    description:
      'Formulario público de pre-registro, precios por tipo de socio, registro preferente, ' +
      'lista de espera, correos automáticos, comprobantes de pago y tablero de registros.',
    losesOnDisable:
      'Se ocultan /registro, /admin/registros y /registro/comprobante. Los registros existentes quedan en la base.',
    core: false,
    group: 'inscripciones',
    pageIds: ['registro'],
    routes: ['/registro', '/registro/comprobante', '/admin/registros'],
    adminTabs: ['registro', 'registros'],
    staffAreas: ['preregistros'],
    siteConfigKeys: [],
    apiFiles: [
      'server/api/registro.php',
      'server/api/registro_archivo.php',
      'server/api/registro_email.php',
      'server/api/registro_email_test.php',
      'server/api/registro_fields.php',
      'server/api/registro_precios.php',
      'server/api/registro_preferente.php',
      'server/api/registro_promote.php',
      'server/api/registro_publico.php',
      'server/api/registro_socio_tipos.php',
      'server/api/registro_welcome_email.php',
      'server/api/_registro_emails.php',
      'server/api/_smtp.php',
      'server/api/email_validate.php',
      'server/api/estatuspago.php',
      'server/api/PHPMailer',
    ],
    srcFiles: [
      'src/pages/Registro.tsx',
      'src/pages/AdminRegistros.tsx',
      'src/pages/Comprobante.tsx',
      'src/components/admin/AdminRegistro.tsx',
      'src/components/admin/AdminRegistroPrecios.tsx',
      'src/components/admin/AdminRegistroPreferente.tsx',
      'src/components/admin/AdminSocioTipos.tsx',
      'src/hooks/useRegistroFields.ts',
      'src/hooks/useRegistroPrecios.ts',
      'src/hooks/useRegistroPreferente.ts',
      'src/hooks/useRegistroSocioTipos.ts',
      'src/lib/properName.ts',
      'src/lib/properNameDiff.ts',
    ],
    migrations: [
      'server/migrations/2026_05_19_registro_precios.sql',
      'server/migrations/2026_05_20_registro_precios_hcp.sql',
      'server/migrations/2026_07_16_registro_preferente.sql',
      'server/migrations/2026_07_21_registro_socio_tipos.sql',
    ],
  },
  {
    id: 'posters',
    label: 'Galerías (Eventos, Avisos, Menús, Premios, Hoteles)',
    description:
      'Páginas de galería con imágenes subidas desde /admin, con columnas, espaciado y orden ' +
      'configurables por dispositivo.',
    losesOnDisable: 'Se ocultan /eventos, /avisos, /menus, /premios y /hoteles con sus tabs.',
    core: false,
    group: 'informacion',
    pageIds: ['eventos', 'avisos', 'menus', 'premios', 'hoteles'],
    routes: ['/eventos', '/avisos', '/menus', '/premios', '/hoteles'],
    adminTabs: ['eventos', 'avisos', 'menus', 'premios', 'hoteles'],
    staffAreas: ['eventos', 'avisos', 'menus', 'premios', 'hoteles'],
    siteConfigKeys: [
      'eventos_config',
      'avisos_config',
      'menus_config',
      'premios_config',
      'hoteles_config',
    ],
    apiFiles: [],
    srcFiles: [
      'src/pages/Eventos.tsx',
      'src/pages/Avisos.tsx',
      'src/pages/Menus.tsx',
      'src/pages/Premios.tsx',
      'src/pages/Hoteles.tsx',
      'src/components/admin/AdminEventos.tsx',
      'src/components/admin/AdminAvisos.tsx',
      'src/components/admin/AdminMenus.tsx',
      'src/components/admin/AdminPremios.tsx',
      'src/components/admin/AdminHoteles.tsx',
      'src/lib/posterAssets.ts',
      'src/lib/posterOrder.ts',
    ],
    migrations: [
      'server/migrations/2026_08_01_add_menus_config_to_site_config.sql',
      'server/migrations/2026_06_18_add_premios_config_to_site_config.sql',
      'server/migrations/2026_06_22_add_hoteles_config_to_site_config.sql',
    ],
    dependsOn: ['archivos'],
  },
  {
    id: 'calendario',
    label: 'Calendario de juego',
    description: 'Matriz de días de juego por categoría, con fechas localizadas.',
    losesOnDisable: 'Se oculta /calendario.',
    core: false,
    group: 'informacion',
    pageIds: ['calendario'],
    routes: ['/calendario'],
    adminTabs: [],
    staffAreas: [],
    siteConfigKeys: [],
    apiFiles: ['server/api/calendario.php', 'server/api/caljuego_estilo.php'],
    srcFiles: [
      'src/pages/Calendario.tsx',
      'src/hooks/useCalendarioData.ts',
      'src/data/calendarioData.ts',
    ],
    migrations: [],
  },
  {
    id: 'banderas',
    label: 'Banderas',
    description: 'Asignación de banderas por día y categoría, administrable desde /admin.',
    losesOnDisable: 'Se oculta /banderas y su tab.',
    core: false,
    group: 'competencia',
    pageIds: ['banderas'],
    routes: ['/banderas'],
    adminTabs: ['banderas'],
    staffAreas: ['banderas'],
    siteConfigKeys: [],
    apiFiles: ['server/api/banderas.php'],
    srcFiles: [
      'src/pages/Banderas.tsx',
      'src/components/admin/AdminBanderas.tsx',
      'src/hooks/useBanderasData.ts',
      'src/data/banderasData.ts',
    ],
    migrations: [
      'server/migrations/2026_06_21_banderas.sql',
      'server/migrations/2026_06_22_banderas_fecha.sql',
    ],
  },
  {
    id: 'patrocinadores',
    label: 'Patrocinadores',
    description:
      'Página de patrocinadores y configuración del listón deslizante (orden, velocidad, ' +
      'logos visibles y páginas donde aparece).',
    losesOnDisable: 'Se oculta /patrocinadores y su tab. El listón deja de configurarse.',
    core: false,
    group: 'presentacion',
    pageIds: ['patrocinadores'],
    routes: ['/patrocinadores'],
    adminTabs: ['sponsors'],
    staffAreas: [],
    siteConfigKeys: ['sponsors_config'],
    apiFiles: [],
    srcFiles: [
      'src/pages/Patrocinadores.tsx',
      'src/components/admin/AdminSponsors.tsx',
      'src/components/admin/sponsors',
    ],
    migrations: [],
  },
  {
    id: 'showcase',
    label: 'Showcase para pantallas',
    description:
      'Reportes a pantalla completa con desplazamiento automático y refresco periódico, para ' +
      'monitores del club, incluido el rotador de slides.',
    losesOnDisable: 'Se ocultan las rutas /showcase/* y su tab.',
    core: false,
    group: 'presentacion',
    pageIds: [],
    routes: ['/showcase/:tipo', '/showcase/rotacion', '/showcase/calificados/:sexo'],
    adminTabs: ['showcase-rotacion'],
    staffAreas: [],
    siteConfigKeys: [],
    apiFiles: ['server/api/showcase300.php'],
    srcFiles: [
      'src/pages/Showcase300.tsx',
      'src/pages/ShowcaseRotator.tsx',
      'src/pages/AdminShowcaseRotacionPage.tsx',
      'src/components/admin/AdminShowcase300.tsx',
      'src/hooks/useShowcaseSlides.ts',
      'src/lib/showcaseSlides.ts',
      'src/hooks/useAutoScrollLoop.ts',
    ],
    migrations: [],
  },
  {
    id: 'avisos-sitio',
    label: 'POP UP y Anuncio',
    description:
      'Ventana emergente y listón de anuncio desplazable en todo el sitio, con hasta 3 ranuras cada uno.',
    losesOnDisable: 'Dejan de mostrarse los POP UP y los anuncios, y se ocultan sus tabs.',
    core: false,
    group: 'presentacion',
    pageIds: [],
    routes: [],
    adminTabs: ['popup', 'anuncio'],
    staffAreas: ['pop'],
    siteConfigKeys: ['popup_config', 'anuncio_config'],
    apiFiles: [],
    srcFiles: [
      'src/components/popup',
      'src/components/layout/AnnouncementRibbon.tsx',
      'src/components/admin/AdminPopup.tsx',
      'src/components/admin/AdminAnuncio.tsx',
    ],
    migrations: [
      'server/migrations/2026_06_18_add_popup_config_to_site_config.sql',
      'server/migrations/2026_07_17_add_anuncio_config_to_site_config.sql',
    ],
  },
];

/** Catálogo completo (núcleo + opcionales). */
export const MODULES: ModuleDef[] = [...CORE_MODULES, ...OPTIONAL_MODULES];

/** Solo los módulos que se pueden apagar desde /setup. */
export const OPTIONAL_MODULE_IDS: string[] = OPTIONAL_MODULES.map((m) => m.id);

/** Etiquetas visibles de cada agrupación en /setup. */
export const MODULE_GROUP_LABELS: Record<ModuleGroup, string> = {
  nucleo: 'Núcleo (siempre activo)',
  competencia: 'Competencia',
  informacion: 'Información del torneo',
  inscripciones: 'Inscripciones',
  presentacion: 'Presentación y pantallas',
};

// ============= Utilidades =============

/** Busca un módulo por id. */
export const getModule = (id: string): ModuleDef | undefined =>
  MODULES.find((m) => m.id === id);

/** Devuelve el módulo dueño de un pageId del menú, si existe. */
export const getModuleByPageId = (pageId: string): ModuleDef | undefined =>
  MODULES.find((m) => m.pageIds.includes(pageId));

/** Devuelve el módulo dueño de un tab de /admin, si existe. */
export const getModuleByAdminTab = (tab: string): ModuleDef | undefined =>
  MODULES.find((m) => m.adminTabs.includes(tab));

/** Módulos que dependen del módulo indicado (para avisar al apagarlo). */
export const getDependents = (id: string): ModuleDef[] =>
  MODULES.filter((m) => (m.dependsOn ?? []).includes(id));
