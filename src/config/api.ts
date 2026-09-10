/**
 * API Configuration
 * Central configuration for all API endpoints
 * Points to PHP JSON API wrappers on the same domain
 */

import { getTorneoId } from '@/hooks/useTorneoId';

// ============= Base URL Configuration =============

/**
 * Base URL for the API server
 * Points to the /api/ folder where PHP wrappers live
 */
export const API_BASE_URL = '/api';

// ============= Logos Base URL =============
/** Base URL for club logo images - proxied through our own domain to avoid ad-blocker issues */
export const LOGOS_BASE_URL = '/api/logo.php?file=';

// ============= Polling Intervals (ms) =============
/** Polling for live scoring data - fast refresh */
export const POLL_LIVE = 100_000;      // 100 seconds
/** Polling for active tournament data (results, salidas) */
export const POLL_ACTIVE = 30_000;     // 30 seconds
/** Polling for semi-static data (players, categories) */
export const POLL_SLOW = 120_000;      // 2 minutes
/** No polling - static data (menu, tournament info) */
export const POLL_STATIC = 0;
/**
 * Polling interval used by ALL showcase pages/slides (Showcase 300,
 * ShowcaseRotator, LiveSlide, MejorScoreSlide, etc). Se llama "Showcase 300"
 * precisamente por este refresh de 300 segundos — pensado para pantallas del
 * club donde no hace falta refrescar más seguido.
 */
export const POLL_SHOWCASE = 300_000;  // 300 seconds (5 min)

// ============= Helper: Append torneoid =============

/**
 * Build query string with torneoid and optional extra params
 * @param params - Additional query parameters
 * @returns Query string starting with ?
 */
const buildQuery = (params: Record<string, string> = {}): string => {
  /** Enable backend debug mode when route includes ?debug=1 */
  const debugMode = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('debug')
    : null;
  const torneoId = getTorneoId();
  const baseParams = torneoId ? { torneoid: torneoId } : {};
  const allParams = {
    ...baseParams,
    ...params,
    ...(debugMode === '1' ? { debug: '1' } : {}),
  };
  const qs = new URLSearchParams(allParams).toString();
  return qs ? `?${qs}` : '';
};

// ============= Endpoint Builders =============

/** Health check */
export const getHealthUrl = (): string => `${API_BASE_URL}/health.php`;

/** Site config (torneoid per domain) */
export const getSiteConfigUrl = (): string => `${API_BASE_URL}/site_config.php`;

/** Menu items */
export const getMenuUrl = (): string => `${API_BASE_URL}/menu.php${buildQuery()}`;

/** Sponsors */
export const getSponsorsUrl = (): string => `${API_BASE_URL}/sponsors.php${buildQuery()}`;

/** Tournament info */
export const getTournamentUrl = (): string => `${API_BASE_URL}/tournament.php${buildQuery()}`;

/** Tournament statistics (included in tournament endpoint) */
export const getTournamentStatsUrl = (): string => `${API_BASE_URL}/tournament.php${buildQuery()}`;

/**
 * Categories list.
 * @param opts.skin  When true, appends `?skin=1` so the endpoint returns
 *                   only categories with SKIN GAME players (Skeenjuga=1)
 *                   and counts only those players. Used by /skinplayers.
 */
export const getCategoriesUrl = (opts: { skin?: boolean } = {}): string =>
  `${API_BASE_URL}/categories.php${buildQuery(opts.skin ? { skin: '1' } : {})}`;

/**
 * Players by category ID.
 * @param catId  Category ID from the database
 * @param opts.skin  When true, appends `?skin=1` so the endpoint returns
 *                   only players enrolled in the SKIN GAME (Skeenjuga=1).
 */
export const getPlayersApiUrl = (catId: string, opts: { skin?: boolean } = {}): string =>
  `${API_BASE_URL}/players.php${buildQuery({
    catid: catId,
    ...(opts.skin ? { skin: '1' } : {}),
  })}`;

/** Calendario - tournament calendar from caljuego table */
export const getCalendarioUrl = (): string => `${API_BASE_URL}/calendario.php${buildQuery()}`;

/** @deprecated Use getCalendarioUrl instead */
export const getCalendarioDaysUrl = (): string => `${API_BASE_URL}/calendario.php${buildQuery({ modo: 'days' })}`;

/** @deprecated Use getCalendarioUrl instead */
export const getCalendarioSchedulesUrl = (): string => `${API_BASE_URL}/calendario.php${buildQuery({ modo: 'schedules' })}`;

/**
 * All results (master: list of categories).
 * @param torneoIdOverride  Optional tournament id that replaces the active one.
 *                          Used by /historial to query past editions.
 */
export const getResultadosUrl = (torneoIdOverride?: string): string =>
  `${API_BASE_URL}/resultados.php${buildQuery(torneoIdOverride ? { torneoid: torneoIdOverride } : {})}`;
/**
 * Results by category - gross=1 for GROSS scoring, gross=0 (default) for NETO.
 * @param torneoIdOverride  Optional tournament id (historical editions).
 */
export const getResultadosCategoryUrl = (
  categoryId: string,
  gross: '0' | '1' = '0',
  torneoIdOverride?: string,
): string =>
  `${API_BASE_URL}/resultados_jug.php${buildQuery({
    catid: categoryId,
    gross,
    ...(torneoIdOverride ? { torneoid: torneoIdOverride } : {}),
  })}`;

/** Tee times summary */
export const getSalidasUrl = (): string => `${API_BASE_URL}/salidas.php${buildQuery()}`;

/** Tee times by day with format, so pair categories can return both partners */
export const getSalidasDayUrl = (dayId: string, formato: string = 'individual'): string =>
  `${API_BASE_URL}/salidas_det.php${buildQuery({ caljgoid: dayId, formato })}`;

/** Catálogo de días + campos disponibles para el reporte de impresión de salidas */
export const getSalidasImpresionDaysUrl = (): string =>
  `${API_BASE_URL}/salidas_impresion.php${buildQuery({ modo: 'dias' })}`;

/**
 * Reporte imprimible de salidas por día.
 * @param p.fecha   Fecha de juego (YYYY-MM-DD)
 * @param p.campoid ID del campo
 * @param p.hi/p.hf Rango de hoyos de salida
 * @param p.hri/p.hrf Rango de horas de salida (HH:MM)
 */
export const getSalidasImpresionUrl = (p: {
  fecha: string;
  campoid: string;
  hi: string;
  hf: string;
  hri: string;
  hrf: string;
}): string => `${API_BASE_URL}/salidas_impresion.php${buildQuery({ ...p })}`;

/**
 * Reporte TIME LINE (horarios estimados por hoyo) de un día de juego.
 * Mismos filtros que el reporte de salidas.
 */
export const getTimeLineUrl = (p: {
  fecha: string;
  campoid: string;
  hi: string;
  hf: string;
  hri: string;
  hrf: string;
}): string => `${API_BASE_URL}/timeline.php${buildQuery({ ...p })}`;

/**
 * Catálogo (días de juego + campo + categorías) para imprimir tarjetas.
 * Se usa en Admin → pestaña "Tarjetas".
 */
export const getTarjetasImpresionCatalogoUrl = (torneoid?: string): string =>
  `${API_BASE_URL}/tarjetas_impresion.php${buildQuery({
    modo: 'catalogo',
    ...(torneoid ? { torneoid } : {}),
  })}`;

/**
 * Catálogo de TORNEOS con calendario de juego capturado (selector de Admin →
 * Tarjetas), para imprimir tarjetas de un torneo distinto al activo.
 */
export const getTarjetasTorneosUrl = (): string =>
  `${API_BASE_URL}/tarjetas_impresion.php${buildQuery({ modo: 'torneos' })}`;

/**
 * Reporte imprimible de TARJETAS de juego (Stroke Play / Stableford).
 * @param p.fecha   Fecha de juego (YYYY-MM-DD)
 * @param p.catid   Categoría o lista de categorías separadas por coma
 * @param p.campoid ID del campo (opcional; se deduce de la categoría)
 */
export const getTarjetasImpresionUrl = (p: {
  /** Un día (YYYY-MM-DD) o varios separados por coma para imprimir un rango. */
  fecha: string;
  catid: string;
  campoid?: string;
  /** 'auto' | 'stroke' | 'stableford' — filtra las categorías por sistema. */
  sistema?: string;
  /** Torneo a imprimir; por omisión el torneo activo del dominio. */
  torneoid?: string;
  /** Campo de la BD para el HCP. NETO (ver `@/lib/tarjetasHcp`). */
  hcpfield?: string;
  /**
   * '1' → tarjetas de MATCH PLAY: una tarjeta por enfrentamiento con los dos
   * contendientes de `elimin_salidas_cat` dentro de la misma tarjeta.
   */
  matchplay?: string;
}): string =>
  `${API_BASE_URL}/tarjetas_impresion.php${buildQuery({
    fecha: p.fecha,
    catid: p.catid,
    ...(p.campoid ? { campoid: p.campoid } : {}),
    ...(p.sistema ? { sistema: p.sistema } : {}),
    ...(p.torneoid ? { torneoid: p.torneoid } : {}),
    ...(p.hcpfield ? { hcpfield: p.hcpfield } : {}),
    ...(p.matchplay ? { matchplay: p.matchplay } : {}),
  })}`;




/** All competitions (competición - trofeos) */
export const getCompeticionUrl = (): string => `${API_BASE_URL}/competicion.php${buildQuery()}`;

/** Competition detail */
export const getCompeticionDetailUrl = (id: string): string =>
  `${API_BASE_URL}/competicion.php${buildQuery({ id })}`;

/** All competencias (approach, driver, putt, skin) */
export const getCompetenciasUrl = (): string => `${API_BASE_URL}/competencias.php${buildQuery()}`;

/** Competencia detail with full player data */
export const getCompetenciaDetailUrl = (id: string): string =>
  `${API_BASE_URL}/competencias.php${buildQuery({ tipo: id, detalle: '1' })}`;

/** Group players within a competencia - uses specific endpoint */
export const getCompetenciaGroupUrl = (compId: string, groupId: string): string =>
  `${API_BASE_URL}/competencias.php${buildQuery({ tipo: compId, detalle: '1' })}`;

// ============= Brackets — Putt Finales (Caballero / Dama) =============

/** Público: ambos brackets (M/F) con config + matches + visible. */
export const getPuttFinalesUrl = (): string =>
  `${API_BASE_URL}/brackets.php${buildQuery({ action: 'get_putt_finales' })}`;

/** Admin: mismo + candidates_count por sexo. */
export const getPuttFinalesAdminUrl = (): string =>
  `${API_BASE_URL}/brackets.php${buildQuery({ action: 'get_putt_admin' })}`;

/** Endpoint POST genérico — action va en query. */
export const getBracketsActionUrl = (action: string): string =>
  `${API_BASE_URL}/brackets.php${buildQuery({ action })}`;

/** Events */
export const getEventosUrl = (): string => `${API_BASE_URL}/eventos.php${buildQuery()}`;

// ============= Skin Scorecards (/skinscorecards) =============

/**
 * Skin scorecards MASTER — list of dates with their skin groups.
 * Returns { days: [{ date, dateFormatted, groups: [{groupId,campoId}] }] }
 */
export const getSkinScorecardMasterUrl = (): string =>
  `${API_BASE_URL}/skin_scorecard.php${buildQuery()}`;

/**
 * Skin scorecard DETAIL — par per hole + player rows for one
 * (group, date, campo, tipo). `tipo` is 'gross' or 'neto'.
 */
export const getSkinScorecardDetailUrl = (
  gpoid: number | string,
  fecha: string,
  campoid: number | string,
  tipo: 'gross' | 'neto',
): string =>
  `${API_BASE_URL}/skin_scorecard.php${buildQuery({
    gpoid: String(gpoid),
    fecha,
    campoid: String(campoid),
    tipo,
  })}`;

// ============= Skin Game winners (/skingame) =============

/**
 * Skin Game MASTER — dates + groups with hasGross/hasNeto flags.
 * Returns { days: [{ date, dateFormatted, groups: [{groupId,hasGross,hasNeto}] }] }
 */
export const getSkinGameMasterUrl = (): string =>
  `${API_BASE_URL}/skin_game.php${buildQuery()}`;

/**
 * Skin Game DETAIL — one winner row per hole (or null when no unique
 * minimum), for a given group / date / tipo (`gross` | `neto`).
 */
export const getSkinGameDetailUrl = (
  gpoid: number | string,
  fecha: string,
  tipo: 'gross' | 'neto',
): string =>
  `${API_BASE_URL}/skin_game.php${buildQuery({
    gpoid: String(gpoid),
    fecha,
    tipo,
  })}`;

/**
 * Live Scoring leaderboard for a specific category
 * @param catId - Category ID
 * @param tipo - Scoring type: stroke | stableford
 * @param gross - 0 for net, 1 for gross
 */
export const getLiveScoringUrl = (catId: string, tipo: string = 'stroke', gross: string = '0'): string =>
  `${API_BASE_URL}/live_scoring.php${buildQuery({ catid: catId, tipo, gross })}`;

/**
 * Player scorecard (hole-by-hole) for a specific round
 * @param jugadorId - Player ID
 * @param categoriaId - Category ID
 * @param fecha - Round date (YYYY-MM-DD)
 * @param tipo - Scoring type: stroke | stableford | parejas
 */
export const getResultadosTarjetaUrl = (
  jugadorId: string,
  categoriaId: string,
  fecha: string,
  tipo: string = 'stroke',
  /** Optional tournament id override (historical editions). */
  torneoIdOverride?: string,
): string =>
  `${API_BASE_URL}/resultados_tarjeta.php${buildQuery({
    jugadorid: jugadorId,
    categoriaid: categoriaId,
    fecha,
    tipo,
    ...(torneoIdOverride ? { torneoid: torneoIdOverride } : {}),
  })}`;

/**
 * Live Tarjeta (real-time scorecard) for a player
 * @param jugadorId - Player ID
 * @param tipo - Scoring type: stroke | stableford | goro_neto | goro_gross
 */
export const getLiveTarjetaUrl = (
  jugadorId: string,
  tipo: string = 'stroke',
  categoriaId?: string
): string =>
  `${API_BASE_URL}/live_tarjeta.php${buildQuery({
    jugadorid: jugadorId,
    tipo,
    ...(categoriaId ? { categoriaid: categoriaId } : {}),
  })}`;

/**
 * Get full logo URL from logo filename
 * @param logoFilename - Logo filename from API response
 */
export const getLogoUrl = (logoFilename: string): string =>
  `${LOGOS_BASE_URL}${logoFilename}`;

// ============= Pre-Registro endpoints =============

/** Form fields configuration (admin + public) */
export const getRegistroFieldsUrl = (): string =>
  `${API_BASE_URL}/registro_fields.php${buildQuery()}`;

/**
 * Socio-type mapping (admin + public).
 * Maps club-specific labels shown to end users to system types
 * (TITULAR/EMERITO/DEPENDIENTE) used by the pricing engine.
 */
export const getRegistroSocioTiposUrl = (): string =>
  `${API_BASE_URL}/registro_socio_tipos.php${buildQuery()}`;

/** Public submission endpoint (POST multipart) */
export const getRegistroSubmitUrl = (): string =>
  `${API_BASE_URL}/registro.php${buildQuery()}`;

/**
 * Admin listing endpoint (requires ?password=).
 * Por defecto limita al torneoid activo del dominio. En sitios multi-torneo
 * se puede pedir otro torneo (`torneo = 267`) o todos a la vez
 * (`torneo = 'all'` → ?all=1, sin torneoid).
 */
export const getRegistroListUrl = (password: string, torneo?: number | 'all'): string => {
  if (torneo === 'all') {
    // buildQuery siempre añade torneoid; para "todos" lo quitamos y pasamos all=1.
    const debugMode = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('debug')
      : null;
    const qs = new URLSearchParams({ password, all: '1', ...(debugMode === '1' ? { debug: '1' } : {}) }).toString();
    return `${API_BASE_URL}/registro.php?${qs}`;
  }
  const extra: Record<string, string> = { password };
  if (typeof torneo === 'number' && torneo > 0) extra.torneoid = String(torneo);
  return `${API_BASE_URL}/registro.php${buildQuery(extra)}`;
};

/** Admin verify toggle endpoint (POST JSON body) */
export const getRegistroVerifyUrl = (): string =>
  `${API_BASE_URL}/registro.php?action=verify`;

/** Admin: toggle status_pago entre 1 (registrado) y 99 (des-registrado). */
export const getRegistroUnregisterUrl = (): string =>
  `${API_BASE_URL}/registro.php?action=unregister`;

/** Admin: marca jugadores.estatus = 'BAJA' usando el correo del registro. */
export const getRegistroBajaUrl = (): string =>
  `${API_BASE_URL}/registro.php?action=baja`;

/** Admin: envía correo "su registro fue validado" (POST JSON {id,password}). */
export const getRegistroEmailUrl = (): string =>
  `${API_BASE_URL}/registro_email.php`;

/** Admin: envía correo de BIENVENIDA tras completar el registro (sec4). */
export const getRegistroWelcomeEmailUrl = (): string =>
  `${API_BASE_URL}/registro_welcome_email.php`;

/**
 * Catálogo `estatuspago` (primeras 6 opciones). Alimenta el dropdown
 * de status_pago en el dashboard de pre-registros.
 */
export const getEstatuspagoUrl = (): string =>
  `${API_BASE_URL}/estatuspago.php`;

/**
 * Admin: promueve un registro de lista de espera (status_pago=67) al
 * flujo normal (status_pago=0) y envía automáticamente el correo con
 * datos bancarios. POST JSON {id, password}.
 */
export const getRegistroPromoteUrl = (): string =>
  `${API_BASE_URL}/registro_promote.php`;

/** Public: GET datos del registro por token. */
export const getRegistroPublicoUrl = (token: string): string =>
  `${API_BASE_URL}/registro_publico.php?token=${encodeURIComponent(token)}`;

/** Public: POST multipart (token + reg_archivo) para subir comprobante. */
export const getRegistroPublicoSubmitUrl = (): string =>
  `${API_BASE_URL}/registro_publico.php`;

/** Stream binary attachment for a single registro row */
export const getRegistroArchivoUrl = (id: number, password: string): string =>
  `${API_BASE_URL}/registro_archivo.php?id=${id}&password=${encodeURIComponent(password)}`;

/**
 * Admin: sube (o reemplaza) el archivo adjunto de un registro.
 * POST multipart/form-data con campos: id, password, reg_archivo (File).
 * El backend guarda el binario en `reg_archivo` y el nombre original en
 * `reg_archivo_nombre` (más el mime en `reg_archivo_mime` si existe).
 */
export const getRegistroUploadArchivoUrl = (): string =>
  `${API_BASE_URL}/registro.php?action=upload_archivo`;


// ============= Pre-Registro · Precios =============

/** Admin / lectura pública: lista completa de reglas de precio del torneo. */
export const getRegistroPreciosUrl = (): string =>
  `${API_BASE_URL}/registro_precios.php${buildQuery()}`;

/**
 * Match de precio para un jugador específico.
 * Cualquier parámetro puede omitirse — el backend usa NULL como comodín.
 */
export const getRegistroPrecioMatchUrl = (params: {
  categoria?: string;
  tipo_socio?: string;
  genero?: string;
  edad?: string | number;
  handicap?: string | number;
}): string => {
  const clean: Record<string, string> = { action: 'match' };
  if (params.tipo_socio)  clean.tipo_socio = params.tipo_socio;
  // Genero y edad participan en el matching del backend (precios
  // diferenciados por sexo y por rango de edad, p.ej. menores de 18).
  if (params.genero) clean.genero = params.genero;
  if (params.edad !== undefined && params.edad !== null && params.edad !== '') {
    clean.edad = String(params.edad);
  }
  // categoria/handicap se ignoran — viven en categorias_reglas.
  return `${API_BASE_URL}/registro_precios.php${buildQuery(clean)}`;
};

// ============= Pre-Registro · Categorías Elegibles =============

/** Lista de reglas de elegibilidad de categoría para este torneo. */
export const getCategoriasReglasUrl = (): string =>
  `${API_BASE_URL}/categorias_reglas.php${buildQuery()}`;

// ============= Banderas (Pin Sheet) =============

/**
 * Pin sheet por torneo (lectura pública + POST admin).
 *
 * @param opts.fecha  Fecha específica (YYYY-MM-DD). Si se omite, el backend
 *                    devuelve la fecha activa (más reciente <= hoy con datos).
 * @param opts.admin  Modo admin: incluye `admin=1&password=...` para que el
 *                    backend devuelva también fechas futuras (lectura).
 */
export const getBanderasUrl = (opts: {
  fecha?: string;
  admin?: boolean;
  password?: string;
} = {}): string => {
  const params: Record<string, string> = {};
  if (opts.fecha) params.fecha = opts.fecha;
  if (opts.admin) {
    params.admin = '1';
    if (opts.password) params.password = opts.password;
  }
  return `${API_BASE_URL}/banderas.php${buildQuery(params)}`;
};

// ============= Parejas (Tarjetas y Estilo de Juego) =============

/**
 * Devuelve el estilojuego (Personal | Go Go | Bola Baja | Suma Scores) y el
 * formato (INDIVIDUAL | PAREJAS) para una categoría en una fecha específica.
 */
export const getCaljuegoEstiloUrl = (catId: string, fecha: string): string =>
  `${API_BASE_URL}/caljuego_estilo.php${buildQuery({ catid: catId, fecha })}`;

/**
 * Tarjeta detallada de una pareja para un día específico.
 * Reemplaza a `resultados_tarjeta.php` cuando la categoría es de parejas.
 */
export const getTarjetaParejasUrl = (
  jugadorId: string,
  categoriaId: string,
  fecha: string,
  /** Optional tournament id override (historical editions). */
  torneoIdOverride?: string,
): string =>
  `${API_BASE_URL}/tarjeta_parejas.php${buildQuery({
    jugadorid: jugadorId,
    categoriaid: categoriaId,
    fecha,
    ...(torneoIdOverride ? { torneoid: torneoIdOverride } : {}),
  })}`;

/** Cascading location dropdowns */
export const getLocationsCountriesUrl = (): string =>
  `${API_BASE_URL}/locations.php?kind=countries`;
export const getLocationsStatesUrl = (countryId: number | string): string =>
  `${API_BASE_URL}/locations.php?kind=states&country_id=${encodeURIComponent(String(countryId))}`;
export const getLocationsCitiesUrl = (stateId: number | string): string =>
  `${API_BASE_URL}/locations.php?kind=cities&state_id=${encodeURIComponent(String(stateId))}`;

/** Clubs list (for Pre-Registro autocomplete) */
export const getClubsUrl = (): string =>
  `${API_BASE_URL}/clubs.php`;

/**
 * Clubs registered for the active tournament (from `clubs_registro`).
 * Pre-Registro uses this to restrict the "Club" datalist when the
 * applicant marks reg_es_socio = SI — a socio may only belong to a
 * club that is registered for the current tournament.
 */
export const getClubsByTorneoUrl = (): string =>
  `${API_BASE_URL}/clubs.php${buildQuery({ action: 'torneo' })}`;

/**
 * Registro Preferente config for the active tournament.
 * Devuelve la ventana global (fecha_inicio/fecha_fin), el flag
 * same_range, la lista de clubes autorizados y — precomputado por el
 * servidor — active_now + allowed_club_ids para el "hoy" del servidor.
 */
export const getRegistroPreferenteUrl = (): string =>
  `${API_BASE_URL}/registro_preferente.php${buildQuery()}`;

/** Server-side email validation (syntax + MX + typo suggestions). */
export const getEmailValidateUrl = (email: string): string =>
  `${API_BASE_URL}/email_validate.php?email=${encodeURIComponent(email)}`;

/**
 * Check whether a (nombre, apellido, correo) triple is already registered
 * for the active tournament. El backend SOLO marca `exists: true` cuando
 * coinciden los tres campos (case-insensitive). Permite al formulario
 * advertir antes del submit. `torneoid` lo añade buildQuery().
 */
export const getRegistroEmailCheckUrl = (
  email: string,
  nombre?: string,
  apellido?: string,
): string =>
  `${API_BASE_URL}/registro.php${buildQuery({
    action: 'check_email',
    email,
    nombre: nombre ?? '',
    apellido: apellido ?? '',
  })}`;

/**
 * Lookup an existing player's stored club by name + birthdate.
 * Used to pre-fill the club field in Pre-Registro when the same person
 * is already in the `jugadores` table.
 */
export const getClubLookupUrl = (
  nombre: string,
  apellido: string,
  fechanac: string,
  correo: string = '',
  spei: string = '',
  ghin: string = '',
): string => {
  const qs = new URLSearchParams({
    action: 'lookup',
    nombre,
    apellido,
    fechanac,
    correo,
    spei,
    ghin,
  }).toString();
  return `${API_BASE_URL}/clubs.php?${qs}`;
};

/**
 * Lookup an existing player by SPEI or GHIN. Used when the user types
 * either identifier in Pre-Registro to pre-fill nombre, apellido, correo,
 * club, sexo, fecha de nacimiento, etc. Either one may be empty.
 */
export const getPlayerLookupByIdUrl = (spei: string, ghin: string): string => {
  const qs = new URLSearchParams({
    action: 'lookup',
    spei,
    ghin,
  }).toString();
  return `${API_BASE_URL}/clubs.php?${qs}`;
};

/**
 * Admin CRUD de categorías (/admin → Jugadores).
 * GET lista categorías + catálogos de tees y campos; POST crea/edita/borra.
 */
export const getCategoriasAdminUrl = (): string =>
  `${API_BASE_URL}/categorias_admin.php${buildQuery()}`;

/**
 * ALIEN SYSTEM → Jugadores. Listado/edición de jugadores del torneo con
 * par del campo, handicaps (HI/HJ/HN) y categoría.
 * @param opts.catid  Filtra por categoría.
 * @param opts.q      Búsqueda por nombre, ID o club.
 */
export const getJugadoresAdminUrl = (
  opts: { catid?: string; q?: string } = {},
): string => {
  const params: Record<string, string> = {};
  if (opts.catid) params.catid = opts.catid;
  if (opts.q) params.q = opts.q;
  return `${API_BASE_URL}/jugadores_admin.php${buildQuery(params)}`;
};

/**
 * ALIEN SYSTEM → Campos. Campos del torneo con horarios, categorías,
 * tees (rating/slope/par) y hoyos — misma fuente que las tarjetas.
 */
export const getCamposAdminUrl = (): string =>
  `${API_BASE_URL}/campos_admin.php${buildQuery()}`;

