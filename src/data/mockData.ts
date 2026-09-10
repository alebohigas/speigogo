// Mock data service - Replace with actual API calls
// All data structures are ready for database integration

export interface MenuItem {
  id: string;
  label: string;
  path: string;
  enabled: boolean;
  order: number;
}

export interface Sponsor {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl?: string;
  /**
   * Legacy 'logo_nombre' value from the DB — a human-readable identifier
   * (often the original logo filename). Shown under each logo in the
   * Patrocinadores page to make sponsors easy to identify.
   */
  logoName?: string;
}

export interface TournamentInfo {
  id: string;
  name: string;
  club: string;
  logoUrl: string;
  /** Background image for Hero section (from logo_fondo) */
  heroImageUrl: string;
  /** Logo for header/nav ribbon (from logo_header) */
  logoHeaderUrl: string;
  startDate: string;
  endDate: string;
  venue: string;
  phone: string;
  email: string;
  city: string;
  state: string;
}

export interface Category {
  id: string;
  name: string;
  handicapMin: number;
  handicapMax: number;
  format: 'STROKE PLAY' | 'STABLEFORD';
  ventajas: string;
  maxPlayers: number;
  rounds: string;
  teeMarker: string;
}

/** Stats for the history ribbon section */
export interface TournamentStats {
  totalHistoricalPlayers: number;
  yearsHistory: number;
  yearsHistoryDisplay: string;
  maxCategories: number;
}

// Menu Configuration - Binary enabled/disabled from DB
export const menuConfig: MenuItem[] = [
  { id: 'home', label: 'HOME', path: '/', enabled: true, order: 1 },
  { id: 'convocatoria', label: 'CONVOCATORIA', path: '/convocatoria', enabled: true, order: 2 },
  { id: 'eventos', label: 'EVENTOS', path: '/eventos', enabled: true, order: 3 },
  { id: 'jugadores', label: 'JUGADORES', path: '/jugadores', enabled: true, order: 4 },
  { id: 'equipos', label: 'EQUIPOS', path: '/equipos', enabled: false, order: 4.5 },
  { id: 'salidas', label: 'SALIDAS', path: '/salidas', enabled: true, order: 5 },
  { id: 'live', label: 'LIVE', path: '/live', enabled: true, order: 6 },
  { id: 'resultados', label: 'RESULTADOS', path: '/resultados', enabled: true, order: 7 },
  { id: 'historial', label: 'HISTORIAL', path: '/historial', enabled: false, order: 7.5 },
  { id: 'competicion', label: 'COMPETICIÓN', path: '/competicion', enabled: true, order: 8 },
  { id: 'calendario', label: 'CALENDARIO DE JUEGO', path: '/calendario', enabled: true, order: 10 },
  { id: 'horarios', label: 'HORARIOS DE SALIDAS', path: '/horarios', enabled: true, order: 15 },
  { id: 'avisos', label: 'AVISOS', path: '/avisos', enabled: true, order: 11 },
  { id: 'premios', label: 'PREMIOS', path: '/premios', enabled: true, order: 12 },
  { id: 'menus', label: 'MENÚS', path: '/menus', enabled: true, order: 12.5 },
  { id: 'hoteles', label: 'HOTELES', path: '/hoteles', enabled: true, order: 18 },
  { id: 'patrocinadores', label: 'PATROCINADORES', path: '/patrocinadores', enabled: true, order: 13 },
  { id: 'reglas', label: 'REGLAS Y CC', path: '/reglas', enabled: true, order: 14 },
  { id: 'skinrules', label: 'SKIN RULES', path: '/skinrules', enabled: false, order: 14 },
  { id: 'skinplayers', label: 'SKIN PLAYERS', path: '/skinplayers', enabled: false, order: 14 },
  { id: 'skinscorecards', label: 'SKIN SCORECARDS', path: '/skinscorecards', enabled: false, order: 14 },
  { id: 'skingame', label: 'SKIN GAME', path: '/skingame', enabled: false, order: 14 },
  { id: 'banderas', label: 'BANDERAS', path: '/banderas', enabled: true, order: 17 },
  { id: 'matchplay', label: 'MATCH PLAY', path: '/matchplay', enabled: true, order: 19 },
  { id: 'registro', label: 'PRE-REGISTRO', path: '/registro', enabled: true, order: 16 },
  { id: 'stats', label: 'ESTADÍSTICAS', path: '/stats', enabled: false, order: 20 },
];

/** Sponsors fallback - actual data comes from API via useSponsors hook */
export const sponsors: Sponsor[] = [
];

export const tournamentInfo: TournamentInfo = {
  id: '70',
  name: '56° Torneo Anual de Golf Atlas Country Club 2026',
  club: 'Atlas CC',
  logoUrl: '',
  heroImageUrl: '',
  logoHeaderUrl: '',
  startDate: '2026-04-24',
  endDate: '2026-05-02',
  venue: 'Club de Golf Valle Alto',
  phone: '',
  email: '',
  city: '',
  state: '',
};

export const categories: Category[] = [
  // 56° Torneo Anual de Golf — Atlas Country Club (20–25 Julio 2026)
  { id: '1',  name: 'CAMPEONATO',    handicapMin: 0,    handicapMax: 1.3,  format: 'STROKE PLAY', ventajas: 'SIN VENTAJA', maxPlayers: 20, rounds: '54 HOYOS', teeMarker: 'NEGRAS' },
  { id: '2',  name: 'PRIMERA',       handicapMin: 1.4,  handicapMax: 2.2,  format: 'STROKE PLAY', ventajas: 'SIN VENTAJA', maxPlayers: 42, rounds: '54 HOYOS', teeMarker: 'AZULES' },
  { id: '3',  name: 'SEGUNDA',       handicapMin: 0,    handicapMax: 0,    format: 'STROKE PLAY', ventajas: 'SIN VENTAJA', maxPlayers: 60, rounds: '54 HOYOS', teeMarker: 'BLANCAS' },
  { id: '4',  name: 'TERCERA',       handicapMin: 0,    handicapMax: 0,    format: 'STROKE PLAY', ventajas: 'SIN VENTAJA', maxPlayers: 60, rounds: '54 HOYOS', teeMarker: 'BLANCAS' },
  { id: '5',  name: 'CUARTA',        handicapMin: 0,    handicapMax: 0,    format: 'STROKE PLAY', ventajas: 'SIN VENTAJA', maxPlayers: 60, rounds: '54 HOYOS', teeMarker: 'BLANCAS' },
  { id: '6',  name: 'QUINTA',        handicapMin: 0,    handicapMax: 0,    format: 'STABLEFORD',  ventajas: '80%',         maxPlayers: 48, rounds: '54 HOYOS', teeMarker: 'BLANCAS' },
  { id: '7',  name: 'SEXTA',         handicapMin: 0,    handicapMax: 25.9, format: 'STABLEFORD',  ventajas: '80%',         maxPlayers: 48, rounds: '54 HOYOS', teeMarker: 'BLANCAS' },
  { id: '8',  name: '1RA SENIORS',   handicapMin: 0,    handicapMax: 19.0, format: 'STABLEFORD',  ventajas: '80%',         maxPlayers: 28, rounds: '54 HOYOS', teeMarker: 'DORADAS' },
  { id: '9',  name: '2DA SENIORS',   handicapMin: 19.1, handicapMax: 30.8, format: 'STABLEFORD',  ventajas: '80%',         maxPlayers: 28, rounds: '54 HOYOS', teeMarker: 'DORADAS' },
  { id: '10', name: 'SUPER SENIOR',  handicapMin: 0,    handicapMax: 37.2, format: 'STABLEFORD',  ventajas: '80%',         maxPlayers: 24, rounds: '54 HOYOS', teeMarker: 'PLATINO' },
  { id: '11', name: 'DAMAS',         handicapMin: 0,    handicapMax: 25.6, format: 'STABLEFORD',  ventajas: '80%',         maxPlayers: 10, rounds: '54 HOYOS', teeMarker: 'ROJAS' },
];

export const tournamentStats: TournamentStats = {
  totalHistoricalPlayers: 344,
  yearsHistory: 51,
  yearsHistoryDisplay: '50+',
  maxCategories: 12,
};

/** Eligibility requirements — 56° Torneo Anual de Golf Atlas Country Club 2026 */
export const eligibilityText =
  "Solamente podrán participar jugadores mayores de 18 años. Cada participante quedará registrado de acuerdo con su GHIN o carta constancia de su INDEX debidamente acreditado por su Club con la firma del Profesional, Gerente o Comisión de Golf; cada jugador es responsable de entregar su hándicap, no se aceptarán jugadores sin ese requisito. El INDEX vigente será válido al día 15 de Junio del 2026, determinando éste la categoría del jugador. Seniors: 60 años en adelante (salida de marcas doradas). Super Senior: 70 años en adelante (salida de marcas platino).";

/** Important notes for eligibility section — 56° Atlas Country Club 2026 */
export const notesText: string[] = [
  "La comisión se reserva el derecho de revisar el Hándicap/INDEX, cotejando ante el GHIN, su club o aplicaciones para manejo de hándicap digital, contra el comprobante presentado por el jugador registrado.",
  "Durante las rondas de juego los caballeros deberán utilizar ropa apropiada para la práctica del golf; no se permite el uso de shorts, bermudas ni jeans. Las damas deberán utilizar playera tipo polo, pantalón o falda propia de golf.",
  "Marcas de salida: Campeonato — negras; 1a. — azules; 2a a 6a. — blancas; Seniors — doradas; Super Senior — platino; Damas — rojas.",
  "Las categorías 2a, 3a, 4a, 5a y 6a (salidas de marcas blancas) serán determinadas dividiendo el número de jugadores inscritos de manera cronológica y de acuerdo a su INDEX; el límite de la división de las categorías se notificará en cuanto queden definidas.",
  "Se permitirá el uso de carritos de golf (propiedad del Club) en todas las categorías.",
  "Cierre de inscripciones: 8 de Julio de 2026 a las 18:00 hrs, o antes si se completa el cupo. El pago del torneo no garantiza su participación.",
  "La cuota de inscripción deberá estar liquidada en su totalidad, su registro en la plataforma de inscripciones concluido y su carta de hándicap INDEX entregada a más tardar el 7 de Julio de 2026 para ser acreedor a algún premio.",
];

export interface ScheduleSlot {
  turno: string;
  horario: string;
  martes: string[];
  miercoles: string[];
  jueves: string[];
  viernes: string[];
  sabado: string[];
}

/** Schedule data - Semana Santa Chilchota 2026 (no detailed schedule in flyer) */
export const scheduleData: ScheduleSlot[] = [];

/** Salidas description */
export const salidasText = "";

/** Handicap rules */
export const handicapText = "";

/** Desempates rules */
export const desempatesText = "";

/** Premios description */
export const premiosText = "";

/** Eventos adicionales */
export const eventosAdicionalesText = "";

/**
 * Inscripciones text default.
 * NOTE: Atlas-specific content (torneoid=354) is provided via the
 * `convocatoria_content` table — keep this empty so other tournaments
 * do not inherit Atlas data.
 */
export const inscripcionesText: string = "";

export interface PricingTier {
  categoria: string;
  costo: string;
  mayo6: string;
  junio5: string;
  julio4: string;
  agosto3: string;
  sept2: string;
}

export interface PricingTable {
  title: string;
  subtitle?: string;
  tiers: PricingTier[];
}

/**
 * Default socios pricing.
 * Atlas-specific cost table (torneoid=354) lives in `convocatoria_content`.
 * Keep empty here so it never shows for other torneos as fallback.
 */
export const sociosPricing: PricingTable[] = [];

/** Foráneos pricing interface */
export interface ForaneosPricing {
  title: string;
  caballeros: string;
  damasSeniors: string;
}

/** Foráneos pricing - not applicable */
export const foraneosPricing: ForaneosPricing[] = [];

/** Contact info interface */
export interface ContactInfo {
  bankName: string;
  clabe: string;
  cuenta: string;
  nombre: string;
  email: string;
  telefono: string;
  telefonoDirecto: string;
}

/**
 * Pricing note default — empty so non-Atlas torneos don't inherit
 * Atlas instructions. Atlas content lives in convocatoria_content (354).
 */
export const pricingNote = "";

/**
 * Default contact info — empty so non-Atlas torneos don't show
 * Atlas phone/data. Tournament-specific overrides live in convocatoria_content.
 */
export const contactInfo: ContactInfo = {
  bankName: '',
  clabe: '',
  cuenta: '',
  nombre: '',
  email: '',
  telefono: '',
  telefonoDirecto: '',
};

/**
 * Default contact warning — empty so non-Atlas torneos don't show
 * Atlas WhatsApp instructions. Overrides live in convocatoria_content (354).
 */
export const contactWarning = "";

/** Día de práctica */
export const diaDePracticaText = "";

/** Información general disclaimer */
export const informacionGeneralText = "";

/** Convocatoria section configuration */
export interface ConvocatoriaSection {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
}

/** Default sections for convocatoria page — disabled if no info */
export const convocatoriaSections: ConvocatoriaSection[] = [
  { id: 'descripcion', label: 'Descripción', enabled: true, order: 1 },
  { id: 'elegibilidad', label: 'Elegibilidad', enabled: true, order: 2 },
  { id: 'costos', label: 'Costos', enabled: true, order: 3 },
  { id: 'categorias', label: 'Categorías y Sistema de Juego', enabled: true, order: 4 },
  { id: 'premiacion', label: 'Premiación', enabled: true, order: 5 },
  { id: 'desempates', label: 'Desempate', enabled: false, order: 6 },
  // Valores de puntaje Stableford (BD: torneos.valorstable por torneoid).
  // Visible por default; se puede ocultar desde /admin → Convocatoria.
  { id: 'stableford', label: 'Valores Stableford', enabled: true, order: 6.5 },
  { id: 'reglas', label: 'Reglas Locales', enabled: true, order: 7 },
  { id: 'competencias', label: 'Competencias Especiales', enabled: true, order: 8 },
  { id: 'servicios', label: 'Servicios y Horarios del Club', enabled: false, order: 9 },
  { id: 'calendarioJuego', label: 'Calendario y Horarios de Juego', enabled: true, order: 10 },
  { id: 'patrocinadoresOficiales', label: 'Patrocinadores Oficiales', enabled: true, order: 11 },
];

/** Description text — 56° Torneo Anual Atlas Country Club 2026 */
export const convocatoriaDescripcion =
  "Atlas Country Club celebra su 56° Torneo Anual de Golf, que se llevará a cabo del 20 al 25 de Julio de 2026.\n\n" +
  "Se jugará a 54 hoyos stroke play, excepto las categorías 5a, 6a, Seniors y Damas, que se jugarán en formato Stableford al 80% del handicap. Sin corte, de acuerdo con las reglas de la U.S.G.A., F.M.G. y las reglas locales. Será responsabilidad de cada jugador leer las reglas, bases y términos de competencia antes de iniciar su salida.\n\n" +
  "Premios destacados: O´yes en los hoyos par 3 (4, 7, 14 y 17) con bolsa de hasta $350,000 al primer lugar, autos y motocicletas para Hole In One en cada par 3, y un premio especial de $1.5 millones de pesos al primer Hole In One en el Hoyo 14 durante la última ronda de juego.";

/** Premiación data - structured prize descriptions */
export interface PremioCategoria {
  categoria: string;
  premios: string[];
}

/** Premiación / Trofeos — 56° Atlas Country Club 2026 */
export const premiacionData: PremioCategoria[] = [
  {
    categoria: 'Trofeos por Categoría',
    premios: [
      'Trofeos de colección, obra del escultor jalisciense Álvaro Cuevas, a los tres primeros lugares de cada categoría.',
    ],
  },
  {
    categoria: 'Premio Adicional — Mejor Score del Día',
    premios: [
      '$7,750.00 (siete mil setecientos cincuenta pesos 00/100 M.N.) al mejor score del día por categoría. No repetible.',
      'En categorías formato Stableford (Damas, D, E y Seniors) el ganador será la tarjeta con el mayor puntaje.',
    ],
  },
  {
    categoria: "O´YES — Hoyos 4, 7, 14 y 17 (Premios por hoyo par 3)",
    premios: [
      '1° Lugar: $350,000 pesos',
      '2° Lugar: $155,000 pesos',
      '3° Lugar: $75,000 pesos',
      '4° Lugar: $37,500 pesos',
      '5° Lugar: Inscripción Anual 2027',
      '6° Lugar: Reloj Hamilton',
      '7° Lugar: Apple iPad 10.2"',
      '8° Lugar: Apple iPad 10.2"',
      '9° Lugar: Bocina Bose',
      '10° Lugar: Bocina Bose',
      'En caso de empate en O´yes se calificará en orden cronológico, considerando mejor posicionado al que se haya marcado primero. El O´yes no podrá ser repetible por la misma persona en el mismo hoyo.',
    ],
  },
  {
    categoria: 'HOLE IN ONE — Hoyo 4',
    premios: [
      'SUV Geely Monjaro GF 2026',
      'Carrito de golf SEVEN 2026',
      'Motocicleta Triumph Speed 400 2026',
    ],
  },
  {
    categoria: 'HOLE IN ONE — Hoyo 7',
    premios: [
      'SUV GAC Enkoo HEV 2025',
      'Carrito de golf Club Car 2026',
      'Motocicleta Indian Sixty Bobber',
    ],
  },
  {
    categoria: 'HOLE IN ONE — Hoyo 14',
    premios: [
      'Automóvil de lujo',
      'Moto Triumph Scrambler 400 2026',
      'Carrito de golf Hardy Carts',
      '1.5 millones de pesos al primer Hole In One en el Hoyo 14 durante la última ronda del torneo (premio especial).',
    ],
  },
  {
    categoria: 'HOLE IN ONE — Hoyo 17',
    premios: [
      'BMW 220i Coupé 2027',
      'Moto Triumph Scrambler 1200 X 2026',
      'Carrito de golf Golf Lozano',
    ],
  },
  {
    categoria: 'Notas Hole In One',
    premios: [
      'En caso de un segundo Hole In One se considerará como mejor O´yes y así sucesivamente, siguiendo el orden cronológico del evento.',
      'El deducible será pagado por el ganador.',
      'El premio de 1.5 millones de pesos del Hoyo 14 aplica únicamente en la tercera ronda de juego de cada una de las categorías.',
    ],
  },
];

/**
 * Desempates para Corte — criterios oficiales de desempate
 * tomados de los Términos de la Competencia (LXX Anual Valle Alto 2026).
 */
export interface DesempatesData {
  /** Intro / encabezado mostrado arriba de las listas */
  intro: string;
  /** Criterios para desempate del corte (orden importa) */
  paraCorte: string[];
  /** Criterios para desempate de trofeos */
  paraTrofeos: string[];
  /** Nota final mostrada debajo */
  nota?: string;
  /**
   * Interruptores administrables desde /admin → Convocatoria → Desempate.
   * Cuando son `false` el bloque correspondiente no se publica aunque
   * tenga criterios capturados. `undefined` = visible (retrocompatible).
   */
  showCorte?: boolean;
  showTrofeos?: boolean;
}

/** Desempates — no publicado en la convocatoria del 56° Atlas 2026 */
export const desempatesData: DesempatesData = {
  intro: '',
  paraTrofeos: [],
  paraCorte: [],
  nota: '',
  showCorte: true,
  showTrofeos: true,
};

/** Reglas locales - structured rules */
export interface ReglaItem {
  titulo: string;
  contenido: string;
}

/** Reglas y Condiciones — 56° Atlas Country Club 2026. */
export const reglasData: ReglaItem[] = [
  { titulo: 'Reglas Generales', contenido: 'Se jugará a 54 hoyos stroke play, excepto las categorías 5a, 6a, Seniors y Damas que se jugarán en formato Stableford al 80% del handicap, sin corte, de acuerdo con las reglas de la U.S.G.A., F.M.G. y las reglas locales. Será responsabilidad de cada jugador leer las reglas, bases y términos de competencia antes de iniciar su salida.' },
  { titulo: 'Handicap / INDEX', contenido: 'Cada participante quedará registrado de acuerdo con su GHIN o carta constancia de su INDEX debidamente acreditado por su Club con la firma del Profesional, Gerente o Comisión de Golf. Cada jugador es responsable de entregar su hándicap; no se aceptarán jugadores sin este requisito. El INDEX vigente será válido al día 15 de Junio del 2026, determinando éste la categoría del jugador.' },
  { titulo: 'Vestimenta', contenido: 'Durante las rondas de juego los caballeros deberán utilizar ropa apropiada para la práctica del golf; no se permite el uso de shorts, bermudas ni jeans. Las damas deberán utilizar playera tipo polo, pantalón o falda propia de golf.' },
  { titulo: 'Marcas de Salida', contenido: 'Campeonato: marcas negras. 1ª: marcas azules. 2ª a 6ª: marcas blancas. Seniors: marcas doradas. Super Senior: marcas platino. Damas: marcas rojas.' },
  { titulo: 'División de Categorías (2ª a 6ª)', contenido: 'Las categorías 2ª, 3ª, 4ª, 5ª y 6ª (salidas de marcas blancas) serán determinadas dividiendo el número de jugadores inscritos de manera cronológica y de acuerdo a su INDEX. El límite de la división de las categorías se notificará en cuanto queden definidas.' },
  { titulo: 'Carritos de Golf', contenido: 'Se permitirá el uso de carritos de golf (propiedad del Club) en todas las categorías.' },
  { titulo: 'Notas Generales', contenido: 'La cuota de inscripción deberá estar liquidada en su totalidad, su registro en la plataforma concluido y su carta de hándicap INDEX entregada a más tardar el 7 de Julio de 2026 para ser acreedor a algún premio. El pago del torneo no garantiza su participación a menos que esté confirmado por el área de Inscripciones. Cualquier controversia será resuelta por la Comisión de Golf. La Comisión se reserva el derecho de hacer los cambios pertinentes para el mejor funcionamiento del torneo.' },
];

/** Reglamento local - structured local rules with collapsible sections */
export interface ReglamentoLocalItem {
  titulo: string;
  contenido: string;
}

/** Reglamento local — Valle Alto 2026 (no se publica en el PDF). */
export const reglamentoLocalData: ReglamentoLocalItem[] = [
  {
    titulo: 'Sistemas de Juego — Stroke Play',
    contenido:
      'CAMPEONATO, Premier y AA: 54 hoyos sin hándicap. Pasan el corte 12 jugadores (sin empates) después de 36 hoyos.\n\nCATEGORÍA A: 72 hoyos sin hándicap. Habrá 2 cortes: el primero a los 36 hoyos jugados pasando los mejores 24 jugadores sin empates y, el segundo corte, a 54 hoyos jugados pasando a la final los primeros 12 jugadores sin empates.\n\nCAMPEONATO MAYORES: 54 hoyos con hándicap al 80%. Pasan el corte los mejores 4 gross y los mejores 4 neto después de 36 hoyos. Los jugadores deberán tener 50 años o más cumplidos el primer día de juego.\n\nDAMAS A y B: 54 hoyos con el 80% de hándicap. Pasan el corte las mejores 4 gross y las mejores 4 neto después de 36 hoyos. En caso de que alguna jugadora pase a la final Gross y también a la final Neto, deberá jugar únicamente por el trofeo Gross; en este caso la quinta mejor jugadora en Neto, jugará por el trofeo Neto.',
  },
  {
    titulo: 'Sistemas de Juego — Stableford (acumulado)',
    contenido:
      'DAMAS C, D y E: 54 hoyos con el 80% de hándicap. Habrá corte a los 36 hoyos jugados. Las mejores 8 jugadoras sin empates pasarán a la final conservando el acumulado de puntos.\n\nB, C y D: 72 hoyos con hándicap al 80%. Habrá 2 cortes: el primero a los 36 hoyos jugados pasando los mejores 24 jugadores sin empates y, el segundo corte, a 54 hoyos jugados pasando a la final los primeros 12 jugadores sin empates.\n\nSENIORS A y B: 54 hoyos con hándicap al 80%. Pasan el corte los mejores 12 jugadores de cada categoría después de 36 hoyos. Los jugadores deberán tener 60 o más años cumplidos al primer día de juego.\n\nDAMAS ESTELARES: 27 hoyos sin hándicap con corte a los 18 hoyos jugados pasando las mejores 6 jugadoras sin empates.',
  },
  {
    titulo: 'Marcas de Salida',
    contenido:
      'CAMPEONATO: Negras.\nPremier y AA: Azules.\nA, B, C, D y CAMPEONATO MAYORES: Blancas.\nDAMAS: Rojas.\nDAMAS ESTELARES: Naranjas.',
  },
  {
    titulo: 'Hora de Salida',
    contenido:
      'Tanto en stroke play como en stableford, los jugadores deberán estar en su mesa de salida, listos para jugar, a la hora estipulada independientemente del orden en que les toque salir. Si el jugador se presenta hasta con cinco minutos de retraso a su mesa de salida, tendrá 2 golpes de penalidad en el primer hoyo. Después de estos 5 minutos, será descalificado.',
  },
  {
    titulo: 'Ronda Estipulada',
    contenido: '9 hoyos.',
  },
  {
    titulo: 'Vestimenta',
    contenido: 'Según el código interno del Reglamento de Golf.',
  },
  {
    titulo: 'Transportación Automotriz',
    contenido:
      'Los jugadores podrán utilizar transportación automotriz para ellos mismos, su equipo y su caddie.',
  },
  {
    titulo: 'Caddie',
    contenido:
      'Es obligatorio para todos los jugadores contratar los servicios de un caddie (siempre y cuando el club pueda proporcionarles uno), el cual puede ser compartido con otro jugador.',
  },
  {
    titulo: 'Puntuación Stableford',
    contenido:
      '• 2 golpes más que el par (doble bogey): sin puntos\n• 1 golpe más que el par (bogey): un punto\n• Par: dos puntos\n• 1 golpe menos que par (birdie): tres puntos\n• 2 golpes menos que par (águila): cuatro puntos\n• 3 golpes menos que par (albatros): cinco puntos',
  },
  {
    titulo: 'Suspensión de Juego',
    contenido:
      '• Suspensión inmediata del juego: una nota prolongada de sirena.\n• Suspensión del juego: tres notas consecutivas de sirena.\n• Reanudación del juego: dos notas consecutivas de sirena.\n\nCuando el juego ha sido suspendido por el Comité por una situación peligrosa (una nota prolongada de sirena), todos los jugadores deberán SUSPENDER DE INMEDIATO SU JUEGO. Si un jugador no interrumpe de inmediato su juego en esta circunstancia, será DESCALIFICADO.',
  },
  {
    titulo: 'Entrega de Scores',
    contenido:
      'Es responsabilidad del jugador que su tarjeta sea entregada. Ésta deberá entregarse en un lapso no mayor a 15 minutos a partir del momento en el que el grupo haya terminado de jugar el último hoyo de la ronda. Las tarjetas se entregarán en la mesa de recepción ubicada junto a la caseta del starter. Si el jugador no entrega su tarjeta de score en el tiempo indicado será descalificado.',
  },
  {
    titulo: 'Cómo Decidir Empates — Para el Corte',
    contenido:
      'Se tomará como primer criterio el mejor score de la última ronda. Si persistiera el empate, el segundo criterio será comparar el score de los hoyos del 10 al 18 de la última ronda, continuando con los hoyos del 13 al 18, 16 al 18 y por último el hoyo 18. En caso de persistir el empate se hará lo mismo con los hoyos del 1 al 9.',
  },
  {
    titulo: 'Cómo Decidir Empates — Para Trofeos',
    contenido:
      'Sólo para el primer lugar en todas las categorías Gross o Neto se jugará a muerte súbita SIN VENTAJAS (en caso de no poder iniciar o continuar con un desempate a muerte súbita por oscuridad o mal clima, el desempate se llevará a cabo como lo señalado para desempatar para el corte). Para decidir el resto de los empates se utilizarán los mismos criterios que para el corte. Cualquier empate en el campo iniciará a la hora y por el hoyo establecidos por el Comité.',
  },
  {
    titulo: 'Premios de O\u2019yes por Día',
    contenido:
      'Importante: un jugador no podrá ganar más de un O\u2019yes por día.',
  },
  {
    titulo: 'Cierre de la Competencia',
    contenido: 'Al iniciarse la ceremonia de premiación.',
  },
  {
    titulo: 'Recomendaciones',
    contenido:
      '• Marcar la bola antes de levantarla para identificarla (penalidad: 1 golpe si no se marca).\n• No hay "dadas", se debe embocar en todos los hoyos. En Stableford deberá embocarse toda bola que cuente para obtener puntos, de lo contrario podrá ser levantada sin embocar.\n• No se debe cambiar bola en green (penalidad: un golpe).\n• Máximo 14 bastones.\n• No se puede dar ni pedir consejo.\n• Presentarse en su hoyo de salida 5 minutos antes.',
  },
  {
    titulo: 'Aviso General',
    contenido:
      'ESTAS REGLAS LOCALES Y TÉRMINOS DE LA COMPETENCIA DEJAN SIN EFECTO CUALQUIER REGLA LOCAL O TÉRMINO DE LA COMPETENCIA QUE EL CLUB UTILIZA PARA EL JUEGO NORMAL DE SUS SOCIOS, SE ENCUENTREN O NO PUBLICADAS EN CUALQUIER PARTE.',
  },
];
const _reglamentoLocalDataArchived: ReglamentoLocalItem[] = [
  {
    titulo: 'Responsabilidad del Jugador',
    contenido: 'ES RESPONSABILIDAD DEL JUGADOR CONOCER LAS REGLAS DE GOLF, LAS CONDICIONES DE LA COMPETENCIA Y LAS REGLAS LOCALES.'
  },
  {
    titulo: 'Reglas Aplicables',
    contenido: 'Regirán las Reglas de Golf de la USGA adoptadas por FMG, así como las siguientes Condiciones de Competencia y Reglas Locales, mismas que dejan sin efecto otras utilizadas en otros torneos incluyendo las propias del Score Card del Club o cualquier otro documento. Se designa al comité de golf como Juez del Torneo.\n\nLa penalidad por infringir alguna de las presentes será de dos golpes.'
  },
  {
    titulo: 'Handicaps (R3.3)',
    contenido: 'El Comité será el encargado de registrar los hándicaps de los jugadores y ubicarlos en su categoría correspondiente, pero si un jugador sabe que el comité cometió un error con su hándicap deberá informarlo lo más pronto posible, de lo contrario este podría quedar descalificado de la competencia. La fecha de corte del hándicap es al día 15 de marzo 2026. El comité se reserva el derecho de aceptar la validez del hándicap.'
  },
  {
    titulo: 'Jugadores sin Handicap Oficial',
    contenido: 'Si un jugador no cuenta con un hándicap Oficial como GHIN O SPEI, deberá presentar una carta del profesional al club que pertenezca.'
  },
  {
    titulo: 'Hora de Salida (R5.3a)',
    contenido: 'Los jugadores deberán estar en su Área de salida, listos para jugar, a la hora estipulada independientemente del orden en que les toque salir. Si el jugador se presenta hasta con cinco minutos de retraso a su mesa de salida, tendrá dos golpes de castigo. Si el jugador se presenta después de los cinco minutos, será descalificado.'
  },
  {
    titulo: 'Retraso Injustificado (R5.6)',
    contenido: 'Par time para 18 hoyos es de 4:40 hrs. Penalidad por retraso injustificado: un golpe de castigo en primera ocasión, dos golpes en segunda y descalificación en tercera ocasión. Cuando un grupo se retrase, el tiempo para ejecutar su golpe es de 45 segundos al primer jugador en turno y de 40 segundos cada jugador restante.'
  },
  {
    titulo: 'Entrega de Scores (3.3)',
    contenido: 'El jugador deberá entregar la tarjeta lo más pronto posible; el tiempo máximo para entregar la tarjeta es de 15 minutos.'
  },
  {
    titulo: 'Lies Preferidos - Regla Local E-3',
    contenido: 'El jugador podrá tomar alivio colocando su bola a lo largo de una tarjeta score sin acercarse a la bandera y sin cambiar de área del campo en el área general y bunkers, no aplica para áreas de penalidad, ni greenes.'
  },
  {
    titulo: 'Puntuación Stableford',
    contenido: '• 1 golpe sobre par: 1 punto\n• Golpes en el par: 2 puntos\n• 1 golpe bajo el par: 3 puntos\n• 2 golpes bajo el par: 4 puntos\n• 3 golpes bajo el par: 5 puntos\n• 4 golpes bajo el par: 6 puntos'
  },
  {
    titulo: 'Obstrucciones Temporales Inamovibles (RL F-23)',
    contenido: 'Todas las instalaciones de publicidad, anuncios y carpas, que no se puedan mover, así como los vehículos en exhibición instalados especialmente para este Torneo, se consideran Obstrucciones Temporales Inamovibles y podrán tener alivio sin castigo incluyendo la línea de juego.'
  },
  {
    titulo: 'Zonas o Círculos de Dropeo',
    contenido: 'Son una opción más de alivio a la regla aplicable para una bola en área de penalidad, hoyo 12.'
  },
  {
    titulo: 'Equipo para Medir Distancia (R4.3,1)',
    contenido: 'Está permitido. No deberá tener alguna función adicional que pueda medir altura, humedad o temperatura o similar. Penalidad de descalificación.'
  },
  {
    titulo: 'Obstrucciones Inamovibles (R16)',
    contenido: 'Caminos con superficie artificial y jardineras rodeadas por estos; controles de riego, aspersores, bancas de descanso, casetas de bombeo, tapas de registro de cemento y metal. Snack del hoyo 5.'
  },
  {
    titulo: 'Green Equivocado / Zona de Juego Prohibido (2.4)',
    contenido: 'Alivio sin castigo obligatorio.'
  },
  {
    titulo: 'Obstrucciones Movibles (R-15)',
    contenido: 'Esta regla cubre el alivio sin penalidad que está permitido de objetos artificiales como rastrillos u cualquier objeto que cumplen con la definición de obstrucción movible.'
  },
  {
    titulo: 'Obstrucciones Inamovibles Alrededor de los Greenes (Regla Local F-5)',
    contenido: 'Cuando en la línea de juego exista intervención por una obstrucción que se encuentra dentro de dos bastones de la bola que está dentro del largo de dos bastones del Green, habrá alivio sin castigo dropeando la bola lo más cerca posible de su posición original más 1 bastón (R16), que no se acerque al hoyo, evite la intervención, y esta repose en el Área general.'
  },
  {
    titulo: 'Objetos Integrantes del Campo (R8.1a)',
    contenido: 'Todos los muros de contención de las mesas de salida incluyendo los setos del hoyo 9 se consideran objetos integrales del campo, por lo cual no tienen alivio.'
  },
  {
    titulo: 'Condiciones Anormales del Campo (R16)',
    contenido: 'Áreas que estén encerradas con líneas o puntos blancos definen terreno en reparación, Hormigueros, agujeros de animal, Agua Temporal. Los caminos de grava y terracería que involucran a los hoyos 6, 8, 15 y 17.\n\nLas áreas marcadas como terreno en reparación que terminan en caminos con superficie artificial son parte de la misma condición.'
  },
  {
    titulo: 'Bola Enterrada (R16.3)',
    contenido: 'Una bola tendrá alivio sin castigo si está enterrada por su propio impacto a través del campo en área general.'
  },
  {
    titulo: 'Áreas de Penalidad (R17)',
    contenido: 'Se encuentran identificados por estacas y/o líneas pintadas de rojo (lateral). Los cordones de concreto se consideran parte integrante del campo. Las líneas tienen prioridad sobre las estacas.'
  },
  {
    titulo: 'Fuera de Límites',
    contenido: 'Está marcado en la parte inferior interna con estacas, líneas blancas o bardas. Las líneas tienen prioridad sobre cualquier otra cosa.'
  },
  {
    titulo: 'Zonas de Juego Prohibido',
    contenido: 'Identificadas con estaca azul, alivio obligatorio sin castigo, algunas jardineras y árboles recién plantados.'
  },
  {
    titulo: 'Cierre de la Competencia',
    contenido: 'La Competencia se considera cerrada en el momento del inicio de la ceremonia de premiación.'
  },
  {
    titulo: 'Otras Recomendaciones',
    contenido: 'Recuerde que las Reglas contemplan:\n\n• Marcar su bola para identificación.\n• No hay dadas, hay que embocar.\n• No se puede cambiar la bola sobre el Green o en ninguna otra parte a menos que una Regla lo permita.\n• No se pueden usar más de 14 bastones.\n• Estar 10 minutos antes de su hora de salida.\n• No se puede dar o recibir consejo.'
  },
  {
    titulo: 'Desempates',
    contenido: 'Para el primer lugar en todas las categorías será en el campo hoyo por hoyo bajo el mismo sistema jugado durante la competencia con ventajas por el hoyo designado por el Oficial de Reglas y el Comité, el primer criterio será por comparación de tarjetas de la última ronda (mejor score) y como segundo criterio será (retrogresión) en la vuelta 10-18, de la última ronda, en caso de persistir el empate, de los hoyos: 13-18, 16-18, 18.'
  },
  {
    titulo: 'Suspensión',
    contenido: 'En caso de ser necesario la Suspensión de la ronda esta será avisada por medio de un escopetazo, al igual que la reanudación de la misma.'
  }
];

/** Competencias especiales data */
export interface CompetenciaEspecial {
  nombre: string;
  descripcion: string;
  premios?: string;
}

/** Competencias especiales — 56° Atlas Country Club 2026. */
export const competenciasEspecialesData: CompetenciaEspecial[] = [
  { nombre: 'O´YES (Closest to the Pin)', descripcion: 'Premios en los hoyos par 3 (4, 7, 14 y 17). En caso de empate se califica en orden cronológico (mejor posicionado el que se marcó primero). El O´yes no es repetible por la misma persona en el mismo hoyo.', premios: '1°: $350,000 · 2°: $155,000 · 3°: $75,000 · 4°: $37,500 · 5°: Inscripción Anual 2027 · 6°: Reloj Hamilton · 7°-8°: Apple iPad 10.2" · 9°-10°: Bocina Bose.' },
  { nombre: 'Hole In One — Hoyo 4', descripcion: 'Premio al primer Hole In One en el Hoyo 4. El deducible será pagado por el ganador.', premios: 'SUV Geely Monjaro GF 2026 + Carrito SEVEN 2026 + Motocicleta Triumph Speed 400 2026.' },
  { nombre: 'Hole In One — Hoyo 7', descripcion: 'Premio al primer Hole In One en el Hoyo 7.', premios: 'SUV GAC Enkoo HEV 2025 + Carrito Club Car 2026 + Motocicleta Indian Sixty Bobber.' },
  { nombre: 'Hole In One — Hoyo 14', descripcion: 'Premio al primer Hole In One en el Hoyo 14. El premio especial de 1.5 millones aplica únicamente en la tercera (última) ronda de juego de cada categoría.', premios: 'Automóvil de lujo + Moto Triumph Scrambler 400 2026 + Carrito Hardy Carts + 1.5 millones de pesos (última ronda).' },
  { nombre: 'Hole In One — Hoyo 17', descripcion: 'Premio al primer Hole In One en el Hoyo 17.', premios: 'BMW 220i Coupé 2027 + Moto Triumph Scrambler 1200 X 2026 + Carrito Golf Lozano.' },
  { nombre: 'Premio Adicional — Mejor Score del Día', descripcion: 'Premio al mejor score del día por categoría. No repetible. En categorías Stableford (Damas, D, E y Seniors) gana la tarjeta con mayor puntaje.', premios: '$7,750.00 por día por categoría.' },
  { nombre: '¡Grandes Sorpresas!', descripcion: 'Rifas durante la feria del pueblo y la ceremonia de premiación entre los participantes inscritos.', premios: 'Diversos premios sorpresa.' },
];

// ============= Servicios y Horarios del Club =============

/** Schedule of meals/services for a single tournament day */
export interface ServicioDia {
  /** Day label, e.g. "Viernes 26 de Junio" */
  dia: string;
  /** Bullet list of meal/service slots */
  servicios: string[];
}

/** Servicios y Horarios — no publicado en la convocatoria del 56° Atlas 2026 */
export const serviciosHorariosData: ServicioDia[] = [];
const _serviciosHorariosArchived: ServicioDia[] = [
  {
    dia: 'Viernes 26 de Junio',
    servicios: [
      'Desayuno en la Casa Club: 06:00 – 11:00 hrs',
      'Comida en la Terraza: 13:00 – 18:00 hrs',
      'Snacks en el campo: 07:00 – 17:00 hrs',
      'Cocktail de bienvenida — Terraza Bar "La Vista": 20:00 hrs',
    ],
  },
  {
    dia: 'Sábado 27 de Junio',
    servicios: [
      'Desayuno en la Casa Club: 06:00 – 11:00 hrs',
      'Comida en la Terraza: 13:00 – 18:00 hrs',
      'Snacks en el campo: 07:00 – 17:00 hrs',
      'Cena buffet en el Salón Principal: 20:00 – 23:00 hrs',
    ],
  },
  {
    dia: 'Domingo 28 de Junio',
    servicios: [
      'Desayuno en la Casa Club: 06:00 – 11:00 hrs',
      'Comida en la Terraza: 13:00 – 18:00 hrs',
      'Snacks en el campo: 07:00 – 17:00 hrs',
      'Domingo familiar — Asado y música en vivo: 14:00 – 18:00 hrs',
    ],
  },
  {
    dia: 'Lunes 29 de Junio',
    servicios: [
      'Desayuno en la Casa Club: 06:00 – 11:00 hrs',
      'Comida en la Terraza: 13:00 – 18:00 hrs',
      'Snacks en el campo: 07:00 – 17:00 hrs',
    ],
  },
  {
    dia: 'Martes 30 de Junio',
    servicios: [
      'Desayuno en la Casa Club: 06:00 – 11:00 hrs',
      'Comida en la Terraza: 13:00 – 18:00 hrs',
      'Snacks en el campo: 07:00 – 17:00 hrs',
    ],
  },
  {
    dia: 'Miércoles 1 de Julio',
    servicios: [
      'Desayuno en la Casa Club: 06:00 – 11:00 hrs',
      'Comida en la Terraza: 13:00 – 18:00 hrs',
      'Snacks en el campo: 07:00 – 17:00 hrs',
      'Noche mexicana — Salón Principal: 20:00 hrs',
    ],
  },
  {
    dia: 'Jueves 2 de Julio',
    servicios: [
      'Desayuno en la Casa Club: 06:00 – 11:00 hrs',
      'Comida en la Terraza: 13:00 – 18:00 hrs',
      'Snacks en el campo: 07:00 – 17:00 hrs',
      'Final Long Driver Caballeros — Terraza "La Vista": 17:00 – 19:30 hrs',
    ],
  },
  {
    dia: 'Viernes 3 de Julio',
    servicios: [
      'Desayuno en la Casa Club: 06:00 – 11:00 hrs',
      'Comida en la Terraza: 13:00 – 18:00 hrs',
      'Snacks en el campo: 07:00 – 17:00 hrs',
      'Final Approach Mixto — Terraza "La Vista": 20:30 hrs',
    ],
  },
  {
    dia: 'Sábado 4 de Julio',
    servicios: [
      'Desayuno en la Casa Club: 06:00 – 11:00 hrs',
      'Comida en la Terraza: 13:00 – 18:00 hrs',
      'Snacks en el campo: 07:00 – 17:00 hrs',
      'Ceremonia de Premiación y cena de gala: 21:00 hrs',
    ],
  },
];

// ============= Patrocinadores Oficiales (Hole in One / Mejor O'Yes) =============

/** Single official sponsor card */
export interface PatrocinadorOficial {
  /** Premio o categoría que patrocinan, e.g. "Hole in One" */
  premio: string;
  /** Nombre del patrocinador */
  patrocinador: string;
  /** Descripción del premio aportado */
  descripcion: string;
}

/** Patrocinadores oficiales — 56° Atlas Country Club 2026. */
export const patrocinadoresOficialesData: PatrocinadorOficial[] = [
  { premio: 'Hole In One — Hoyo 4',  patrocinador: 'Geely / SEVEN / Triumph',                  descripcion: 'SUV Geely Monjaro GF 2026, Carrito SEVEN 2026 y Motocicleta Triumph Speed 400 2026.' },
  { premio: 'Hole In One — Hoyo 7',  patrocinador: 'GAC / Club Car / Indian Motorcycle',       descripcion: 'SUV GAC Enkoo HEV 2025, Carrito Club Car 2026 y Motocicleta Indian Sixty Bobber.' },
  { premio: 'Hole In One — Hoyo 14', patrocinador: 'Triumph / Hardy Carts / Atlas Country Club', descripcion: 'Automóvil de lujo, Moto Triumph Scrambler 400 2026, Carrito Hardy Carts y $1.5 millones de pesos al primer Hole In One en la última ronda.' },
  { premio: 'Hole In One — Hoyo 17', patrocinador: 'BMW / Triumph / Golf Lozano',              descripcion: 'BMW 220i Coupé 2027, Moto Triumph Scrambler 1200 X 2026 y Carrito Golf Lozano.' },
  { premio: 'World Amateur Golf Ranking', patrocinador: 'WAGR',                                descripcion: 'Torneo reconocido por el World Amateur Golf Ranking.' },
];

// ============= Eventos Sociales (Lifestyle) =============

/** Single social/lifestyle event entry */
export interface EventoSocial {
  /** Day label, e.g. "Viernes 26 de Junio" */
  dia: string;
  /** Time, e.g. "20:00 hrs" */
  hora: string;
  /** Event title */
  titulo: string;
  /** Optional venue */
  lugar?: string;
  /** Optional extra detail */
  descripcion?: string;
}

/**
 * Eventos sociales / lifestyle — datos por torneo.
 *
 * IMPORTANT: This content is tournament-specific. It must NEVER bleed across
 * tournaments. Each torneoid that has social events declares them here under
 * its own key. Tournaments not listed have NO social events (empty array).
 *
 * - 354 → 56° Torneo Anual de Golf Atlas Country Club 2026.
 *   Fuente: posters publicados en /admin → Archivos → Eventos del sitio
 *   https://atlascc.speitour.mx (evento-1, evento-2, evento-5, evento-3).
 *
 * Consumed by /eventos via `getEventosSocialesByTorneo(torneoId)`.
 */
export const EVENTOS_SOCIALES_BY_TORNEO: Record<string, EventoSocial[]> = {
  // ---------- torneoid 354 — Atlas Country Club ----------
  '354': [
    {
      dia: 'Lunes 20 de Julio',
      hora: '19:00 hrs',
      titulo: 'Ceremonia de Inauguración',
      lugar: 'Salón La Hacienda',
      descripcion: 'Apertura oficial del 56° Torneo Anual de Golf — Atlas Country Club.',
    },
    {
      dia: 'Miércoles 22 de Julio',
      hora: '19:00 hrs',
      titulo: 'Feria del Pueblo',
      lugar: 'Salón La Hacienda',
      descripcion: 'Jugador en cortesía. Invitado adulto $500 · Invitado niño $250.',
    },
    {
      dia: 'Viernes 24 de Julio',
      hora: '19:00 hrs',
      titulo: 'Bingo',
      lugar: 'Salón La Hacienda',
      descripcion: 'Jugador en cortesía. Invitado adulto $500 · Invitado niño $250.',
    },
    {
      dia: 'Sábado 25 de Julio',
      hora: '19:00 hrs',
      titulo: 'Ceremonia de Clausura',
      lugar: 'Salón La Hacienda',
      descripcion: 'Premiación y cierre del torneo. Jugador en cortesía. Entrada general $500.',
    },
  ],
};

/**
 * getEventosSocialesByTorneo
 * Returns the social events list for the given torneoid, or [] when the
 * tournament has no registered social events. Prevents Atlas (354) data
 * from bleeding into Valle Alto (346) or any other tournament.
 */
export const getEventosSocialesByTorneo = (torneoId: string | number | null | undefined): EventoSocial[] => {
  if (torneoId === null || torneoId === undefined || torneoId === '') return [];
  return EVENTOS_SOCIALES_BY_TORNEO[String(torneoId)] ?? [];
};

/**
 * @deprecated Do not use. Kept only as a fallback alias that resolves to
 * an empty array so unrelated tournaments never inherit Atlas content.
 * Use `getEventosSocialesByTorneo(torneoId)` instead.
 */
export const eventosSocialesData: EventoSocial[] = [];
const _eventosSocialesArchived: EventoSocial[] = [
  {
    dia: 'Viernes 26 de Junio',
    hora: '20:00 hrs',
    titulo: 'Cocktail de bienvenida',
    lugar: 'Terraza Bar "La Vista"',
    descripcion: 'Inauguración oficial del torneo con cocktail, música en vivo y bocadillos.',
  },
  {
    dia: 'Sábado 27 de Junio',
    hora: '20:00 hrs',
    titulo: 'Cena de gala',
    lugar: 'Salón Principal',
    descripcion: 'Cena buffet con barra abierta y entretenimiento.',
  },
  {
    dia: 'Domingo 28 de Junio',
    hora: '14:00 hrs',
    titulo: 'Domingo familiar',
    lugar: 'Terraza y Áreas Verdes',
    descripcion: 'Asado, actividades para niños y música en vivo.',
  },
  {
    dia: 'Miércoles 1 de Julio',
    hora: '20:00 hrs',
    titulo: 'Noche mexicana',
    lugar: 'Salón Principal',
    descripcion: 'Cena temática con mariachi y folclor mexicano.',
  },
  {
    dia: 'Sábado 4 de Julio',
    hora: '21:00 hrs',
    titulo: 'Ceremonia de Premiación y Cena de Gala',
    lugar: 'Salón Principal',
    descripcion: 'Entrega de premios, cena de gala y rifa del Hole in One.',
  },
];
// API simulation functions - replace with actual fetch calls
export const fetchMenuConfig = async (): Promise<MenuItem[]> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 100));
  return menuConfig.filter(item => item.enabled).sort((a, b) => a.order - b.order);
};

export const fetchSponsors = async (): Promise<Sponsor[]> => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return sponsors;
};

export const fetchTournamentInfo = async (): Promise<TournamentInfo> => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return tournamentInfo;
};

export const fetchCategories = async (): Promise<Category[]> => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return categories;
};

export const fetchTournamentStats = async (): Promise<TournamentStats> => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return tournamentStats;
};

// Events data
export interface EventItem {
  time: string;
  event: string;
}

export interface EventDay {
  date: string;
  dayName: string;
  events: EventItem[];
  sorteos: string[];
}

export const eventosData: EventDay[] = [
  {
    date: '30 de Septiembre',
    dayName: 'Martes',
    events: [
      { time: '6:40 y 11:20 HRS', event: 'INICIO DE SALIDAS - DÍA 1' },
      { time: '20:00 HRS', event: 'INAUGURACIÓN' },
      { time: '20:30 HRS', event: 'INAUGURACIÓN GALERÍA DE ARTE' },
      { time: '21:00 HRS', event: 'TORNEO DE APPROACH' },
      { time: '21:00 HRS', event: 'SHOOTOUT' },
      { time: '', event: 'PREMIACIÓN SCORE DIARIO Y RIFAS' },
    ],
    sorteos: ['CARRITO DE GOLF', 'REGALOS PATROCINADORES'],
  },
  {
    date: '1 de Octubre',
    dayName: 'Miércoles',
    events: [
      { time: '6:40 y 11:20 HRS', event: 'INICIO DE SALIDAS - DÍA 2' },
      { time: '19:00 HRS', event: 'TORNEO DE APPROACH' },
      { time: '19:00 HRS', event: 'SHOOTOUT' },
      { time: '19:30 HRS', event: 'DESFILE CIMACO' },
      { time: '', event: 'PREMIACIÓN SCORE DIARIO Y RIFAS' },
    ],
    sorteos: ['CARRITO DE GOLF', 'REGALOS PATROCINADORES'],
  },
  {
    date: '2 de Octubre',
    dayName: 'Jueves',
    events: [
      { time: '6:40 y 11:20 HRS', event: 'INICIO DE SALIDAS - DÍA 3' },
      { time: '19:00 HRS', event: 'TORNEO DE PUTT' },
      { time: '21:00 HRS', event: 'TORNEO DE DRIVER - FINAL' },
      { time: '', event: 'PREMIACIÓN SCORE DIARIO Y RIFAS' },
    ],
    sorteos: ['REGALOS PATROCINADORES'],
  },
  {
    date: '3 de Octubre',
    dayName: 'Viernes',
    events: [
      { time: '6:40 y 11:20 HRS', event: 'INICIO DE SALIDAS - DÍA 4' },
      { time: '20:00 HRS', event: 'FINAL SHOOTOUT' },
      { time: '', event: 'PREMIACIÓN SCORE DIARIO Y RIFAS' },
    ],
    sorteos: ['CARRITO DE GOLF', 'REGALOS PATROCINADORES'],
  },
  {
    date: '4 de Octubre',
    dayName: 'Sábado',
    events: [
      { time: '6:40 y 11:20 HRS', event: 'INICIO DE SALIDAS - DÍA 5' },
      { time: '21:30 HRS', event: 'CEREMONIA DE PREMIACIÓN' },
      { time: '23:00 HRS', event: 'SHOW DE CLAUSURA: MARÍA JOSÉ' },
    ],
    sorteos: ['AUTOMÓVIL', 'CARRITO DE GOLF'],
  },
];

export const fetchEventos = async (): Promise<EventDay[]> => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return eventosData;
};
