/**
 * Site Config Hook
 * Fetches server-side config (torneoid, menu_order, visibility, groups) for the current domain
 * Syncs to localStorage so all visitors share the same config set by admin
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { API_BASE_URL } from '@/config/api';
import { DEFAULT_SUPERADMIN_PASSWORD, getSuperAdminPassword } from '@/lib/superAdminAuth';
import { setStoredTorneoId } from '@/hooks/useTorneoId';
import { getConfigScope, scopeQuery, useConfigScope } from '@/lib/configScope';

import type { ModulesConfig } from '@/modules/moduleState';


// ============= Types =============

/** Configuration for a single live scoring entry on the Live page */
export interface LiveScoringEntry {
  categoryId: string;
  categoryName: string;
  tipo: 'stroke' | 'stableford';
  gross: 0 | 1;
  enabled: boolean;
  /** Display order on /live page (lower = first). Default: categoryId ASC */
  order?: number;
}

/** Configuration for the Patrocinadores (sponsors) page */
export interface SponsorsConfig {
  /** Number of columns in the sponsor logo grid (1–6) */
  columns: number;
  /**
   * Map of route paths (e.g. "/", "/jugadores") → boolean indicating
   * whether the scrolling sponsor ribbon should be displayed on that page.
   * If undefined, the ribbon defaults to visible on every page (legacy behavior).
   */
  ribbonVisiblePages?: Record<string, boolean>;
  /**
   * Map of route paths → boolean indicating whether the sponsor ribbon should
   * be rendered as `position: sticky` (stuck to the top of the viewport while
   * the page scrolls) **on mobile viewports only**. Desktop always renders
   * the ribbon in its normal in-flow position. When undefined or false for a
   * given path, the ribbon scrolls away with the page as usual.
   */
  ribbonStickyMobilePages?: Record<string, boolean>;
  /**
   * Carousel/ribbon presentation settings.
   *  - order:         Custom sponsor display order as an array of sponsor IDs (numbers).
   *                   Sponsors not present in this list fall back to alphabetical order
   *                   (server default) and are appended after the configured ones.
   *  - randomize:     When true, the displayed order is shuffled on every page load.
   *                   The custom `order` is ignored in this case.
   *  - visibleCount:  Number of logos that should be FULLY visible in the ribbon
   *                   viewport at any moment. Each slot occupies `100% / visibleCount`
   *                   of the container width, so logos entering/leaving on the edges
   *                   are partial (not counted). 0 / undefined = legacy auto sizing.
   *  - enabledIds:    Whitelist of sponsor IDs allowed to appear in the ribbon.
   *                   When undefined, all sponsors with a working logo are shown
   *                   (legacy behavior). When defined (even empty), only the listed
   *                   IDs are rendered.
   */
  carousel?: {
    order?: number[];
    randomize?: boolean;
    visibleCount?: number;
    enabledIds?: number[];
    /**
     * Ribbon scroll speed expressed as SECONDS PER VIEWPORT WIDTH.
     * Higher = slower. Independent of `visibleCount` and sponsor count:
     * the public ribbon measures the real track width and scales the CSS
     * animation duration so the perceived speed stays constant.
     */
    speedSeconds?: number;
    /**
     * Ribbon scroll speed used EXCLUSIVELY on mobile viewports (<768px),
     * expressed as SECONDS PER VIEWPORT WIDTH (higher = slower).
     * Desktop/tablet keep using `speedSeconds`. When undefined, mobile falls
     * back to `speedSeconds` (legacy behavior).
     */
    speedSecondsMobile?: number;
  };
}

/** Spacing presets between attraction cards on the Eventos page */
export type EventosGap = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Configuration for the Eventos page poster grid.
 * Stored independently per breakpoint so admin can tune desktop vs. mobile.
 *  - desktopColumns: 1–4
 *  - mobileColumns:  1–4
 *  - desktopGap / mobileGap: spacing preset between cards
 */
export interface EventosConfig {
  desktopColumns: number;
  mobileColumns: number;
  desktopGap: EventosGap;
  mobileGap: EventosGap;
  /**
   * Toggle de visibilidad para la matriz "Calendario de Eventos"
   * (componente CalendarioEventosTable). Cuando es `true`, la página
   * /eventos renderiza la tabla con días en columnas + áreas en filas
   * (sticky headers). Default: `false` — solo torneos que lo hayan
   * habilitado explícitamente desde /admin lo verán.
   */
  showCalendarioMatriz?: boolean;
  /**
   * Custom poster order shared between desktop and mobile. Stored as a
   * list of zero-based indices into the static poster array defined in
   * the public component. Indices not present in the list fall back to
   * the default static order and are appended at the end.
   */
  posterOrder?: number[];
  /**
   * @deprecated Legacy fields kept for backwards compatibility with
   * configs saved before order was unified across breakpoints. Read at
   * runtime as a fallback when `posterOrder` is missing; never written.
   */
  desktopOrder?: number[];
  /** @deprecated See `desktopOrder`. */
  mobileOrder?: number[];
}

/**
 * Configuration for the Avisos page poster grid.
 * Mirrors EventosConfig (cols + gap per breakpoint) so admins can tune
 * the visual presentation of the avisos posters independently from eventos.
 */
export interface AvisosConfig {
  desktopColumns: number;
  mobileColumns: number;
  desktopGap: EventosGap;
  mobileGap: EventosGap;
  /** Shared custom poster order (see EventosConfig.posterOrder). */
  posterOrder?: number[];
  /** @deprecated Legacy per-breakpoint orders, kept for backwards compat. */
  desktopOrder?: number[];
  /** @deprecated See `desktopOrder`. */
  mobileOrder?: number[];
}

/**
 * Configuration for the Premios page poster grid.
 * Mirrors AvisosConfig/EventosConfig so admins can independently tune
 * the columns + gap per breakpoint for the Premios poster gallery.
 */
export interface PremiosConfig {
  desktopColumns: number;
  mobileColumns: number;
  desktopGap: EventosGap;
  mobileGap: EventosGap;
  /** Shared custom poster order across breakpoints. */
  posterOrder?: number[];
  /** @deprecated Legacy per-breakpoint orders. */
  desktopOrder?: number[];
  /** @deprecated See `desktopOrder`. */
  mobileOrder?: number[];
}

/**
 * Configuration for the Menús page poster grid.
 * Mirrors AvisosConfig (cols + gap per breakpoint + shared poster order)
 * so the Menús gallery can be tuned independently from Avisos.
 */
export interface MenusConfig {
  desktopColumns: number;
  mobileColumns: number;
  desktopGap: EventosGap;
  mobileGap: EventosGap;
  /** Shared custom poster order across breakpoints. */
  posterOrder?: number[];
  /** @deprecated Legacy per-breakpoint orders. */
  desktopOrder?: number[];
  /** @deprecated See `desktopOrder`. */
  mobileOrder?: number[];
}

/**
 * Configuration for the Hoteles page poster grid.
 * Mirrors PremiosConfig/AvisosConfig/EventosConfig so admins can
 * independently tune the columns + gap per breakpoint for the
 * Hoteles poster gallery.
 */
export interface HotelesConfig {
  desktopColumns: number;
  mobileColumns: number;
  desktopGap: EventosGap;
  mobileGap: EventosGap;
  /** Shared custom poster order across breakpoints. */
  posterOrder?: number[];
  /** @deprecated Legacy per-breakpoint orders. */
  desktopOrder?: number[];
  /** @deprecated See `desktopOrder`. */
  mobileOrder?: number[];
}

/**
 * ThemeConfig
 * Active color palette for the tournament's public-facing pages.
 * Each color is stored as an HSL string of the form "H S% L%"
 * (matching the values consumed by tailwind hsl(var(--token))).
 */
export interface ThemeConfig {
  /** Human-readable palette name, e.g. "Verde Bosque" or "Custom". */
  name: string;
  /** Primary brand color (buttons, links, headers). */
  primary: string;
  /** Secondary accent color (badges, highlights). */
  secondary: string;
  /** Tertiary accent color (gold/highlight). */
  accent: string;
  /** Page background color. */
  background: string;
  /**
   * Hex color used for the "Última actualización" stamp shown under every
   * report in /competicion (LastUpdatedStamp). Configurable from
   * Admin > Paleta de Colores. When missing, the app falls back to the
   * historical default #900000.
   */
  lastUpdatedColor?: string;
}

/**
 * StatsConfig
 * Per-tournament overrides for the home Stats ribbon numbers.
 * Each field is optional: a `null` or missing value means
 * "use the auto-computed value from the tournament API".
 * Numeric value (>= 0) forces the displayed number.
 *
 *  - totalHistoricalPlayers: Big number for "Participantes Registrados".
 *  - yearsHistory:           Raw years of history (used to derive display).
 *  - maxCategories:          Max categories shown ribbon (e.g. "12+").
 */
export interface StatsConfig {
  totalHistoricalPlayers?: number | null;
  yearsHistory?: number | null;
  maxCategories?: number | null;
}

/**
 * StatsPageConfig
 * -----------------------------------------------------------------------
 * Per-domain configuration for the public /stats page rendered from
 * Admin > Estadísticas Página. Controls section order, per-section
 * visibility, and manual overrides that beat the API-computed values.
 *
 *  - sections: ordered list of section ids with individual enabled flag.
 *  - overrides: manual value pins per section. Any null field means
 *               "use the auto value from the corresponding API".
 *
 * Note: the master on/off for /stats is handled by the general page
 * visibility settings (Admin > Páginas), not here.
 */
export interface StatsPageSection {
  /** 'tees' = Estadísticas por Tee de Salida (mesa de salida / color). */
  /** 'noshow' = tarjeta NO SHOW (retiros, no shows, descalificados). */
  id: 'clubes' | 'categoria' | 'tees' | 'jugador' | 'noshow';
  enabled: boolean;
}

export interface StatsPageOverrides {
  /** Manual total players number for the Clubes Asistentes header. */
  clubesTotal?: number | null;
  /** Manual "última actualización" timestamp for the Categoría section. */
  categoriaUpdatedAt?: string | null;
  /** Manual rounds count for the Categoría section header. */
  categoriaRounds?: number | null;
  /** Free-form note shown at the top of the Jugador section. */
  jugadorNote?: string | null;
  /**
   * Which club identifier to display in the Clubes Asistentes table.
   *  - 'name' → full club name (default)
   *  - 'abr'  → abbreviation from clubs.abr (falls back to name if empty)
   */
  clubNameField?: 'name' | 'abr' | null;
  /**
   * Slogan del footer (tagline debajo del nombre del torneo).
   * Cuando null/vacío se usa el default histórico
   * "El torneo de golf amateur más importante del país/de México".
   */
  footerTagline?: string | null;
}

export interface StatsPageConfig {
  /** @deprecated Master visibility is controlled from Admin > Páginas. */
  enabled?: boolean;
  sections: StatsPageSection[];
  overrides?: StatsPageOverrides;
  /**
   * Solo en el alcance General de un sitio con varios torneos: suma las
   * estadísticas de todos los torneos activos en una sola vista.
   */
  combineTorneos?: boolean;
}

/**
 * HomeConfig
 * -----------------------------------------------------------------------
 * Home page ("/") configurable pieces. Includes the shared site title and
 * the two hero CTA buttons. The admin picks up to 2 page ids from the menu; if a selected
 * page is hidden or missing the Hero falls back per slot to the legacy
 * routes ("/convocatoria" for slot 1 and "/jugadores" for slot 2).
 *
 *  - buttons: [pageId | null, pageId | null]
 */
export interface HomeConfig {
  buttons: [string | null, string | null];
  /** Título de la portada compartida en sitios con varios torneos. */
  title?: string | null;
  /**
   * Secciones que TODOS los torneos del sitio toman de la configuración
   * General (Avisos, Anuncio, POP y Patrocinadores). Solo se lee del
   * alcance 'general'; cuando una bandera está encendida, los torneos
   * muestran los valores generales y su pestaña queda en modo lectura.
   */
  inherit?: Partial<Record<'avisos' | 'anuncio' | 'pop' | 'sponsors', boolean>>;
  /**
   * Texto que se muestra al elegir torneo en el pre-registro de un sitio
   * con varios torneos. Clave = torneoid.
   */
  registro_opciones?: Record<string, { descripcion?: string | null; costo?: string | null }>;
}

/**
 * HistorialEdition
 * One past tournament edition shown on the /historial page. `year` drives the
 * selector button label and `torneoId` is the tournament id queried against
 * the results endpoints.
 */
export interface HistorialEdition {
  year: number;
  torneoId: string;
  /** Optional label shown under the year (e.g. "LXX Torneo Anual"). */
  label?: string;
}

/**
 * HistorialConfig
 * /historial page config: up to 5 previous editions (most recent first).
 */
export interface HistorialConfig {
  editions: HistorialEdition[];
}

/**
 * HeroOverride
 * One hero (page background) override configured from Admin > Heros.
 *  - url:    image URL (uploaded file under /api/uploads/{domain}/heros/,
 *            an AI-generated file, or any absolute https URL).
 *  - active: master switch — when false the page keeps its bundled default
 *            hero, so an admin can stage an image before publishing it.
 *  - prompt: prompt used when the image came from the AI generator (kept for
 *            traceability / regeneration).
 */
export interface HeroOverride {
  url: string;
  active: boolean;
  prompt?: string;
}

/** Map of route pathname (e.g. '/convocatoria') → hero override. */
export type HeroOverrideMap = Record<string, HeroOverride>;

/**
 * HeroConfig
 * Per-tournament hero overrides. `byTorneo` is keyed by torneo_id as string
 * (so the same domain can stage heros for the upcoming tournament, e.g. 365)
 * and `default` applies to any tournament without its own entry.
 */
export interface HeroConfig {
  byTorneo?: Record<string, HeroOverrideMap>;
  default?: HeroOverrideMap;
}

/**
 * PopupConfig
 * -----------------------------------------------------------------------
 * Site-wide POP UP overlay configuration set from Admin > POP tab.
 * The overlay renders once per page load on any route listed in `paths`,
 * centered over a darkened backdrop, with a close button. When
 * `durationSeconds > 0`, it auto-dismisses after that many seconds.
 *  - enabled:         master on/off switch.
 *  - imageUrl:        absolute or app-relative URL of the popup image.
 *  - paths:           list of route pathnames where the popup is shown.
 *                     Use ['*'] (or empty) to show on every page.
 *  - durationSeconds: auto-close delay in seconds (0 = stay until X click).
 *  - widthPx:         rendered max-width in pixels (image scales to fit,
 *                     clamped by the viewport on small screens).
 *  - altText:         accessible alt text for the popup image.
 */
export interface PopupConfig {
  enabled: boolean;
  imageUrl: string;
  paths: string[];
  durationSeconds: number;
  widthPx: number;
  altText?: string;
  /** Optional caption text shown together with the image inside the popup card. */
  text?: string;
  /** Caption font size in pixels (12–48). */
  textFontSize?: number;
  /** Font family preset for the caption. */
  textFontFamily?: 'sans' | 'serif' | 'mono' | 'display';
  /** Bold weight toggle for the caption. */
  textBold?: boolean;
  /** Italic toggle for the caption. */
  textItalic?: boolean;
  /** Hex color for the caption text. */
  textColor?: string;
  /** Horizontal text alignment. */
  textAlign?: 'left' | 'center' | 'right';
  /** Whether the caption sits above or below the image inside the popup card. */
  textPosition?: 'above' | 'below';
}

/**
 * AnuncioConfig
 * -----------------------------------------------------------------------
 * Scrolling announcement ribbon rendered between the site header and the
 * sponsor ribbon, on every page. Configured from Admin > Anuncio.
 *   - enabled:      master on/off switch.
 *   - text:         the message that scrolls across the ribbon.
 *   - bgColor:      hex background color of the ribbon.
 *   - textColor:    hex color of the text.
 *   - fontFamily:   preset font family for the text.
 *   - fontSize:     text size in pixels (10–48).
 *   - bold:         bold weight toggle.
 *   - italic:       italic toggle.
 *   - speedSeconds: seconds for the text to travel one full viewport
 *                   width (higher = slower).
 *   - paths:        list of route pathnames where the ribbon should
 *                   appear. Use ['*'] (or empty/undefined for legacy
 *                   configs) to show on every page.
 */
export interface AnuncioConfig {
  enabled: boolean;
  text: string;
  bgColor: string;
  textColor: string;
  fontFamily: 'sans' | 'serif' | 'mono' | 'display';
  fontSize: number;
  bold: boolean;
  italic: boolean;
  speedSeconds: number;
  /** Routes where the ribbon should be shown. Missing = every page (legacy). */
  paths?: string[];
  /**
   * Cuando es true, la tira queda fija (sticky) justo debajo del header —
   * entre el menú y el carrusel de patrocinadores — en todos los
   * dispositivos (desktop, tablet y móvil). Missing/false = en flujo normal.
   */
  sticky?: boolean;
  /**
   * Temporizador de publicación (opcional). Cuando `enabled` es true, la tira
   * solo se muestra dentro de la ventana indicada, evaluada con la hora de
   * Ciudad de México:
   *   - startDate: día de inicio en formato YYYY-MM-DD.
   *   - endDate:   día de fin en formato YYYY-MM-DD (puede ser igual a startDate).
   *   - startTime: hora de inicio en formato HH:MM (24 h).
   *   - endTime:   hora de fin en formato HH:MM (24 h).
   * `date` se mantiene como alias legacy de startDate.
   * Missing/enabled=false = sin temporizador (se publica siempre).
   */
  schedule?: {
    enabled: boolean;
    startDate?: string;
    endDate?: string;
    /** @deprecated Legacy field, treated as startDate. */
    date?: string;
    startTime: string;
    endTime: string;
  };
}

/**
 * TarjetasPrintConfig
 * -----------------------------------------------------------------------
 * Maquetación del reporte imprimible de tarjetas (Admin > Tarjetas).
 * Se guarda en la base (`site_config.tarjetas_config`) para que los
 * márgenes, la escala y el tipo de juego no dependan del navegador.
 *   - sistema:  'auto' detecta Stroke Play/Stableford por categoría.
 *   - headerMm: alto de la cabecera superior en mm (3 cm por defecto).
 *   - marginMm: margen lateral en mm.
 *   - scale:    escala del contenido en porcentaje (60–130).
 */
export interface TarjetasPrintConfig {
  /** 'matchplay' imprime una tarjeta por enfrentamiento (dos jugadores). */
  sistema: 'auto' | 'stroke' | 'stableford' | 'matchplay';
  headerMm: number;
  marginMm: number;
  scale: number;
  /** Alto de cada renglón de la tabla de hoyos en mm (se acota a 1/2 carta). */
  rowMm?: number;
  /** Padding-bottom (mm) al final de la tarjeta, bajo el renglón SCORE ANOTADOR. */
  padMm?: number;
  /** Padding-top (mm) al inicio de cada tarjeta, antes de la cabecera del torneo. */
  padTopMm?: number;
  /** Orden y visibilidad de los renglones de la tarjeta (ver `@/lib/tarjetasRows`). */
  rowOrder?: string[];
  /** Campos y orden del encabezado de 3 renglones (ver `@/lib/tarjetasHeader`). */
  headerOrder?: string[];
  /** Tamaño de letra (pt) del hoyo y la hora de salida en el encabezado. */
  fsHoyoPt?: number;
  /** Tamaño de letra (pt) del nombre de la categoría en el encabezado. */
  fsCatPt?: number;
  /** Tamaño de letra (pt) del ID + nombre del jugador (`fsj=`). */
  fsJugPt?: number;
  /**
   * Campo de la BD usado para el HCP. NETO del encabezado
   * ('auto' | 'hcpneto' | 'handicapneto' | 'vtjajug' | 'ventajas').
   * Ver `@/lib/tarjetasHcp`.
   */
  hcpField?: string;
  /**
   * Imprimir (o no) el logo del torneo en la cabecera de cada tarjeta.
   * Viaja al reporte como `logo=1|0`. Por defecto true.
   */
  showLogo?: boolean;
}

/** Full server response for site config */
export interface SiteConfig {
  domain: string;
  torneoid: number | null;
  menu_order: Record<string, number> | null;
  visibility: Record<string, boolean> | null;
  menu_groups: any[] | null;
  page_group_assignments: Record<string, string> | null;
  live_scoring_config: LiveScoringEntry[] | null;
  sponsors_config: SponsorsConfig | null;
  eventos_config: EventosConfig | null;
  avisos_config: AvisosConfig | null;
  /** Menús page poster grid layout/order. */
  menus_config: MenusConfig | null;
  premios_config: PremiosConfig | null;
  hoteles_config: HotelesConfig | null;
  theme_config: ThemeConfig | null;
  stats_config: StatsConfig | null;
  /**
   * POP UP config. Historically a single object; now supports an array of
   * up to 3 independent slots (rendered side-by-side desktop, stacked mobile).
   * Legacy single-object payloads are auto-wrapped as `[obj]`.
   */
  popup_config: PopupConfig | PopupConfig[] | null;
  /**
   * Anuncio ribbons. Same shape story as `popup_config` — supports up to
   * 3 independent ribbons rendered one on top of the other in normal flow.
   */
  anuncio_config: AnuncioConfig | AnuncioConfig[] | null;
  stats_page_config: StatsPageConfig | null;
  home_config: HomeConfig | null;
  /** /historial page config (past editions). Null = not configured. */
  historial_config: HistorialConfig | null;
  /** Maquetación de impresión de tarjetas (Admin > Tarjetas). Null = default. */
  tarjetas_config: TarjetasPrintConfig | null;

  /** Per-tournament hero image overrides (Admin > Heros). Null = none. */
  hero_config: HeroConfig | null;
  /**
   * Qué módulos opcionales de la app están encendidos en este proyecto
   * (configurado en /setup). Null = todos encendidos.
   */
  modules_config: ModulesConfig | null;
}

/** Payload for saving config (all fields optional except password) */
export interface SaveConfigPayload {
  password: string;
  /** Alcance donde guardar: 'general' o un torneoid. Por defecto, el activo. */
  scope?: string;
  torneoid?: number;

  menu_order?: Record<string, number> | null;
  visibility?: Record<string, boolean> | null;
  menu_groups?: any[] | null;
  page_group_assignments?: Record<string, string> | null;
  live_scoring_config?: LiveScoringEntry[] | null;
  sponsors_config?: SponsorsConfig | null;
  eventos_config?: EventosConfig | null;
  avisos_config?: AvisosConfig | null;
  menus_config?: MenusConfig | null;
  premios_config?: PremiosConfig | null;
  hoteles_config?: HotelesConfig | null;
  theme_config?: ThemeConfig | null;
  /** Desde General, copia la paleta guardada a todos los torneos del dominio. */
  apply_theme_to_all?: boolean;
  stats_config?: StatsConfig | null;
  popup_config?: PopupConfig | null;
  anuncio_config?: AnuncioConfig | null;
  /** Multi-slot payload for saving (up to 3 popups). */
  popup_configs?: PopupConfig[] | null;
  /** Multi-slot payload for saving (up to 3 anuncios). */
  anuncio_configs?: AnuncioConfig[] | null;
  stats_page_config?: StatsPageConfig | null;
  home_config?: HomeConfig | null;
  historial_config?: HistorialConfig | null;
  tarjetas_config?: TarjetasPrintConfig | null;

  hero_config?: HeroConfig | null;
  /** Solo el superadmin puede enviar este campo (ver /setup). */
  modules_config?: ModulesConfig | null;
}

// ============= Constants =============

const TORNEO_ID_KEY = 'golf-app-torneo-id';
const MENU_ORDER_KEY = 'tournament_menu_item_order';
const VISIBILITY_KEY = 'tournament_page_visibility';
const GROUPS_KEY = 'tournament_menu_groups';
const PAGE_GROUPS_KEY = 'tournament_page_group_assignments';
const LIVE_SCORING_KEY = 'tournament_live_scoring_config';
const SPONSORS_CONFIG_KEY = 'tournament_sponsors_config';
const EVENTOS_CONFIG_KEY = 'tournament_eventos_config';
const AVISOS_CONFIG_KEY = 'tournament_avisos_config';
/** LocalStorage mirror of the Menús page grid config. */
const MENUS_CONFIG_KEY = 'tournament_menus_config';
const PREMIOS_CONFIG_KEY = 'tournament_premios_config';
const HOTELES_CONFIG_KEY = 'tournament_hoteles_config';

// ============= Fetch Functions =============

/**
 * Fetch full site config from server
 */
const fetchSiteConfig = async (scope: string): Promise<SiteConfig> => {
  const res = await fetch(`${API_BASE_URL}/site_config.php?${scopeQuery(scope)}`);
  if (!res.ok) throw new Error('Failed to fetch site config');
  return res.json();
};

/**
 * Save config fields to server
 */
const saveSiteConfigApi = async (payload: SaveConfigPayload): Promise<{ domain: string; saved: boolean }> => {
  /** Always submit the active session password, even from legacy admin forms. */
  const effectivePayload = {
    /** Multi-torneo: se guarda en el alcance activo salvo que el llamador indique otro. */
    scope: getConfigScope(),
    ...payload,
    password: payload.password === DEFAULT_SUPERADMIN_PASSWORD ? getSuperAdminPassword() : payload.password,
  };

  const res = await fetch(`${API_BASE_URL}/site_config.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(effectivePayload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'Failed to save config');
  }
  return res.json();
};


// ============= Hooks =============

/**
 * useSiteConfig
 * Fetches server-side config and syncs all values to localStorage
 * so the app uses server-defined settings for all visitors
 */
export const useSiteConfig = () => {
  /** Multi-torneo: la configuración depende del alcance activo. */
  const scope = useConfigScope();

  const query = useQuery<SiteConfig>({
    queryKey: ['site-config', scope],
    queryFn: async () => {
      const config = await fetchSiteConfig(scope);

      // Sync menu order
      if (config.menu_order) {
        localStorage.setItem(MENU_ORDER_KEY, JSON.stringify(config.menu_order));
      }

      // Sync visibility
      if (config.visibility) {
        localStorage.setItem(VISIBILITY_KEY, JSON.stringify(config.visibility));
      }

      // Sync menu groups
      if (config.menu_groups) {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(config.menu_groups));
      }

      // Sync page group assignments
      if (config.page_group_assignments) {
        localStorage.setItem(PAGE_GROUPS_KEY, JSON.stringify(config.page_group_assignments));
      }

      // Sync live scoring config
      if (config.live_scoring_config) {
        localStorage.setItem(LIVE_SCORING_KEY, JSON.stringify(config.live_scoring_config));
      }

      // Sync sponsors config
      if (config.sponsors_config) {
        localStorage.setItem(SPONSORS_CONFIG_KEY, JSON.stringify(config.sponsors_config));
      }

      // Sync eventos config
      if (config.eventos_config) {
        localStorage.setItem(EVENTOS_CONFIG_KEY, JSON.stringify(config.eventos_config));
      }

      // Sync avisos config
      if (config.avisos_config) {
        localStorage.setItem(AVISOS_CONFIG_KEY, JSON.stringify(config.avisos_config));
      }

      // Sync menús config
      if (config.menus_config) {
        localStorage.setItem(MENUS_CONFIG_KEY, JSON.stringify(config.menus_config));
      }

      // Sync premios config
      if (config.premios_config) {
        localStorage.setItem(PREMIOS_CONFIG_KEY, JSON.stringify(config.premios_config));
      }

      // Sync hoteles config
      if (config.hoteles_config) {
        localStorage.setItem(HOTELES_CONFIG_KEY, JSON.stringify(config.hoteles_config));
      }

      /**
       * Avisa a los consumidores basados en localStorage (visibilidad,
       * orden y grupos del menú) de que ya llegó la configuración del
       * alcance activo, para que vuelvan a leerla.
       */
      window.dispatchEvent(new Event('tournament-config-synced'));

      return config;

    },
    staleTime: 30 * 1000, // 30 seconds - keep fresh for admin changes
    retry: 1,
  });

  useEffect(() => {
    if (!query.data) return;

    // En un alcance de torneo, la URL/scope es la autoridad. No usamos aquí
    // un torneoid devuelto por una petición anterior: una respuesta tardía del
    // torneo 267 podía sobrescribir el 270 después de cambiar de página.
    if (/^\d+$/.test(scope)) {
      setStoredTorneoId(scope);
      return;
    }

    // En General no existe un torneoid propio; conserva el torneo de respaldo
    // que resuelve el servidor para las páginas legacy sin slug.
    if (query.data.torneoid) {
      setStoredTorneoId(String(query.data.torneoid));
    }
  }, [query.data, scope]);

  return query;
};

/**
 * useSaveSiteConfig
 * Mutation to save any config fields to server
 */
export const useSaveSiteConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SaveConfigPayload) => saveSiteConfigApi(payload),
    onSuccess: () => {
      // Invalidate to re-fetch fresh config
      queryClient.invalidateQueries({ queryKey: ['site-config'] });
      queryClient.invalidateQueries({ queryKey: ['site-torneos'] });
      queryClient.invalidateQueries({ queryKey: ['tournament'] });
      queryClient.invalidateQueries({ queryKey: ['tournament-stats'] });
    },
  });
};
