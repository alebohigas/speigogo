// Resultados data - prepared for API/database integration

export type ScoringType = 'NETO' | 'GROSS';

/** Scorecard display format - determines which columns the tarjeta shows */
export type ScorecardType = 'hcp' | 'stableford' | 'scratch';

/** Individual hole score for a scorecard */
export interface HoleScore {
  hoyo: number;
  par: number;
  /** Hole difficulty ranking (ventaja) */
  hcp: number;
  /** Gross strokes (Score Original) */
  golpes: number;
  /** Net strokes (Score Adjusted) */
  neto: number;
  /** Handicap strokes received on this hole */
  hcpStrokes?: number;
  /** Stableford points for this hole (only for stableford type) */
  puntos?: number;
  /** +/- result string for scratch type */
  resultado?: string;
}

/** Scorecard for a single round */
export interface RoundScorecard {
  round: number;
  /** Which tarjeta format to render */
  scorecardType: ScorecardType;
  holes: HoleScore[];
  totalGolpes: number;
  totalNeto: number;
  /** Total stableford points (only for stableford) */
  totalPuntos?: number;
  out: number;
  in: number;
  /** Date of the round (YYYY-MM-DD) */
  date?: string;
  /** Last capture timestamp from tarjetas.fecha_cap (only set for live cards) */
  fechaCap?: string;
}

export interface PlayerResult {
  id: string;
  position: number;
  name: string;
  club: string;
  /** Club logo URL (proxied via logo.php) */
  clubLogo?: string;
  /** Segundo logo de club (sólo en torneos de parejas). */
  clubLogo2?: string;
  /** Nombre del compañero (sólo en parejas). */
  partner?: string;
  /** Nombre formateado "Jugador 1 / Jugador 2" (sólo en parejas). */
  pairName?: string;
  /** Dynamic round scores keyed as r1, r2, r3, r4... from the API. */
  [roundKey: `r${number}`]: number | undefined;
  total: number;
  /**
   * Count of CLOSED scorecards (statlsc=1) for this player. Frontend uses it
   * to convert the raw stroke `total` into a differential vs par for display:
   *   diff = total - coursePar * closedRounds
   * 0 means the player has no terminated round yet → UI shows plain "0".
   */
  closedRounds?: number;
  handicapIndex?: number;
  /** Código del equipo (jugadores.grupoid) en categorías por equipos. */
  grupoid?: string;
  /** Nombre del equipo en categorías por equipos. */
  teamName?: string;
  /** Integrantes del equipo, mostrados bajo el nombre del equipo. */
  members?: string[];
}

/** Player who did not complete the tournament (NO SHOW, RETIRO, DQ) */
export interface CutPlayer {
  playerId: string;
  number: string;
  name: string;
  club: string;
  clubLogo?: string;
  /** Segundo logo cuando la pareja fue cortada (categorías PAREJAS). */
  clubLogo2?: string;
  /** Nombre del segundo integrante de la pareja (categorías PAREJAS). */
  partner?: string;
  /** Nombre combinado de la pareja, p.e. "Juan Pérez / Luis López". */
  pairName?: string;
  /** Status code: S = Show-No, R = Retiro, D = Descalificado, C = Corte, N = No Contiende */
  statusCode: 'S' | 'R' | 'D' | 'C' | 'N';
  /** Human-readable status label */
  statusLabel: string;
  /** Dynamic round scores keyed as r1, r2, r3, r4...; null if not played/closed. */
  [roundKey: `r${number}`]: number | null | undefined;
  /** Accumulated total from closed scorecards (0 if no rounds completed) */
  total?: number;
  /** Count of CLOSED scorecards (statlsc=1) — see PlayerResult.closedRounds. */
  closedRounds?: number;
  /** Código del equipo (categorías por equipos). */
  grupoid?: string;
  /** Nombre del equipo (categorías por equipos). */
  teamName?: string;
  /** Integrantes del equipo (categorías por equipos). */
  members?: string[];
}

export interface CategoryScoring {
  scoringType: ScoringType;
  /** Which scorecard format to use when expanding rounds */
  scorecardType?: ScorecardType;
  players: PlayerResult[];
}

export interface ResultCategory {
  categoryId: string;
  categoryName: string;
  shortName: string;
  /** True cuando la categoría es de parejas (formato='PAREJAS'). El frontend
   *  usa esto en /resultados para renderizar 2 logos + nombres de pareja, y
   *  para enrutar el click de R{n} a `tarjeta_parejas.php` en vez de
   *  `resultados_tarjeta.php`. */
  isParejas?: boolean;
  /** True cuando la categoría se juega por equipos (formato AGOGO). El
   *  leaderboard muestra un renglón por equipo con sus integrantes debajo. */
  isEquipos?: boolean;
  /** Format genérico ('INDIVIDUAL' | 'PAREJAS') del backend. */
  format?: string;
  /** Default scorecard type for this category (can be overridden per scoring) */
  defaultScorecardType?: ScorecardType;
  /** Scoring system from the API: STROKE PLAY, STABLEFORD, etc. */
  system?: string;
  /** Round dates from the API, e.g. ["2026-02-18", "2026-02-19"] */
  days?: string[];
  /**
   * Per-round in-progress flag aligned to `days`. `true` means at least one
   * eligible player still has an open card for that date — the round shows
   * up in its column with an "En vivo" badge and is NOT counted in `total`.
   */
  daysPartial?: boolean[];
  /**
   * Course par for this category (e.g. 72). Used to convert the raw stroke
   * `total` into a differential vs par for Stroke Play leaderboards.
   */
  coursePar?: number;
  /**
   * Number of medal winners for the active scoring type (back-compat).
   * Prefer `medalCountNeto` / `medalCountGross` when picking dynamically.
   */
  medalCount?: number;
  /** Medal winners on the NETO leaderboard (categorias.numganadorneto, default 3) */
  medalCountNeto?: number;
  /** Medal winners on the GROSS leaderboard (categorias.numganadorgross, default 1) */
  medalCountGross?: number;
  /** Players who did not complete (NO SHOW, RETIRO, DQ) */
  cutPlayers?: CutPlayer[];
  scoringTypes: CategoryScoring[];
}

// Mock data - replace with API calls to Supabase
export const mockResultsData: ResultCategory[] = [
  {
    categoryId: 'camp',
    categoryName: 'Campeonato',
    shortName: 'Camp',
    scoringTypes: [
      {
        scoringType: 'NETO',
        players: [
          { id: 'p1', position: 1, name: 'Juan García López', club: 'Herradura', r1: 68, r2: 70, r3: 69, total: 207, handicapIndex: 1.2 },
          { id: 'p2', position: 2, name: 'Pedro Martínez', club: 'SCGA', r1: 70, r2: 69, r3: 70, total: 209, handicapIndex: 0.8 },
          { id: 'p3', position: 3, name: 'Carlos Rodríguez', club: 'Tigres', r1: 71, r2: 70, r3: 69, total: 210, handicapIndex: 1.5 },
          { id: 'p4', position: 4, name: 'Miguel Hernández', club: 'CCT', r1: 72, r2: 71, r3: 70, total: 213, handicapIndex: 1.1 },
          { id: 'p5', position: 5, name: 'Roberto Sánchez', club: 'WAGR', r1: 73, r2: 72, r3: 71, total: 216, handicapIndex: 0.9 },
        ],
      },
    ],
  },
  {
    categoryId: 'aa',
    categoryName: 'AA',
    shortName: 'AA',
    scoringTypes: [
      {
        scoringType: 'NETO',
        players: [
          { id: 'p6', position: 1, name: 'Luis Fernández', club: 'CCL', r1: 70, r2: 71, r3: 70, total: 211, handicapIndex: 3.2 },
          { id: 'p7', position: 2, name: 'Antonio Gómez', club: 'CCS', r1: 72, r2: 70, r3: 71, total: 213, handicapIndex: 4.1 },
          { id: 'p8', position: 3, name: 'Francisco López', club: 'CCT', r1: 71, r2: 73, r3: 72, total: 216, handicapIndex: 3.8 },
        ],
      },
    ],
  },
  {
    categoryId: 'a',
    categoryName: 'A',
    shortName: 'A',
    scoringTypes: [
      {
        scoringType: 'NETO',
        players: [
          { id: 'p9', position: 1, name: 'José Ramírez', club: 'Herradura', r1: 71, r2: 72, r3: 70, total: 213, handicapIndex: 6.5 },
          { id: 'p10', position: 2, name: 'Manuel Torres', club: 'SCGA', r1: 73, r2: 71, r3: 72, total: 216, handicapIndex: 7.2 },
        ],
      },
    ],
  },
  {
    categoryId: 'b',
    categoryName: 'B',
    shortName: 'B',
    scoringTypes: [
      {
        scoringType: 'NETO',
        players: [
          { id: 'p11', position: 1, name: 'David Morales', club: 'Tigres', r1: 72, r2: 73, r3: 71, total: 216, handicapIndex: 10.5 },
          { id: 'p12', position: 2, name: 'Sergio Díaz', club: 'CCT', r1: 74, r2: 72, r3: 73, total: 219, handicapIndex: 11.2 },
        ],
      },
    ],
  },
  {
    categoryId: 'c',
    categoryName: 'C',
    shortName: 'C',
    scoringTypes: [
      {
        scoringType: 'NETO',
        players: [
          { id: 'p13', position: 1, name: 'Andrés Vargas', club: 'CCL', r1: 73, r2: 74, r3: 72, total: 219, handicapIndex: 15.0 },
          { id: 'p14', position: 2, name: 'Pablo Ruiz', club: 'CCS', r1: 75, r2: 73, r3: 74, total: 222, handicapIndex: 16.3 },
        ],
      },
    ],
  },
  {
    categoryId: 'd',
    categoryName: 'D',
    shortName: 'D',
    scoringTypes: [
      {
        scoringType: 'NETO',
        players: [
          { id: 'p15', position: 1, name: 'Jorge Castro', club: 'Herradura', r1: 74, r2: 75, r3: 73, total: 222, handicapIndex: 20.0 },
        ],
      },
    ],
  },
  {
    categoryId: 'e',
    categoryName: 'E',
    shortName: 'E',
    scoringTypes: [
      {
        scoringType: 'NETO',
        players: [
          { id: 'p16', position: 1, name: 'Ricardo Méndez', club: 'SCGA', r1: 76, r2: 77, r3: 75, total: 228, handicapIndex: 25.0 },
        ],
      },
    ],
  },
  {
    categoryId: 'sr-cam',
    categoryName: 'Senior Campeonato',
    shortName: 'Sr Cam',
    scoringTypes: [
      {
        scoringType: 'NETO',
        players: [
          { id: 'p17', position: 1, name: 'Alberto Pérez', club: 'Tigres', r1: 70, r2: 71, r3: 69, total: 210, handicapIndex: 2.0 },
          { id: 'p18', position: 2, name: 'Fernando Reyes', club: 'CCT', r1: 72, r2: 70, r3: 71, total: 213, handicapIndex: 2.5 },
        ],
      },
      {
        scoringType: 'GROSS',
        players: [
          { id: 'p17', position: 1, name: 'Alberto Pérez', club: 'Tigres', r1: 72, r2: 73, r3: 71, total: 216, handicapIndex: 2.0 },
          { id: 'p18', position: 2, name: 'Fernando Reyes', club: 'CCT', r1: 74, r2: 72, r3: 73, total: 219, handicapIndex: 2.5 },
        ],
      },
    ],
  },
  {
    categoryId: 'sen-a',
    categoryName: 'Senior A',
    shortName: 'Sen A',
    scoringTypes: [
      {
        scoringType: 'NETO',
        players: [
          { id: 'p19', position: 1, name: 'Eduardo Silva', club: 'CCL', r1: 72, r2: 73, r3: 71, total: 216, handicapIndex: 8.0 },
        ],
      },
    ],
  },
  {
    categoryId: 'sen-b',
    categoryName: 'Senior B',
    shortName: 'Sen B',
    scoringTypes: [
      {
        scoringType: 'NETO',
        players: [
          { id: 'p20', position: 1, name: 'Guillermo Flores', club: 'CCS', r1: 74, r2: 75, r3: 73, total: 222, handicapIndex: 14.0 },
        ],
      },
    ],
  },
  {
    categoryId: 'sup-sr',
    categoryName: 'Super Senior',
    shortName: 'Sup Sr',
    scoringTypes: [
      {
        scoringType: 'NETO',
        players: [
          { id: 'p21', position: 1, name: 'Héctor Navarro', club: 'Herradura', r1: 73, r2: 74, r3: 72, total: 219, handicapIndex: 10.0 },
        ],
      },
    ],
  },
  {
    categoryId: 'dam-a',
    categoryName: 'Damas A',
    shortName: 'Dam A',
    scoringTypes: [
      {
        scoringType: 'NETO',
        players: [
          { id: 'p22', position: 1, name: 'María González', club: 'SCGA', r1: 71, r2: 72, r3: 70, total: 213, handicapIndex: 5.0 },
          { id: 'p23', position: 2, name: 'Laura Martínez', club: 'Tigres', r1: 73, r2: 71, r3: 72, total: 216, handicapIndex: 6.2 },
        ],
      },
      {
        scoringType: 'GROSS',
        players: [
          { id: 'p22', position: 1, name: 'María González', club: 'SCGA', r1: 76, r2: 77, r3: 75, total: 228, handicapIndex: 5.0 },
          { id: 'p23', position: 2, name: 'Laura Martínez', club: 'Tigres', r1: 78, r2: 76, r3: 77, total: 231, handicapIndex: 6.2 },
        ],
      },
    ],
  },
  {
    categoryId: 'dam-b',
    categoryName: 'Damas B',
    shortName: 'Dam B',
    scoringTypes: [
      {
        scoringType: 'NETO',
        players: [
          { id: 'p24', position: 1, name: 'Ana Rodríguez', club: 'CCT', r1: 74, r2: 75, r3: 73, total: 222, handicapIndex: 15.0 },
        ],
      },
    ],
  },
];

// API simulation functions - ready for Supabase integration
export const fetchAllCategories = async (): Promise<ResultCategory[]> => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return mockResultsData;
};

export const fetchCategoryResults = async (
  categoryId: string, 
  scoringType: ScoringType
): Promise<PlayerResult[] | undefined> => {
  await new Promise(resolve => setTimeout(resolve, 100));
  const category = mockResultsData.find(c => c.categoryId === categoryId);
  const scoring = category?.scoringTypes.find(s => s.scoringType === scoringType);
  return scoring?.players;
};

export const fetchCategoryById = async (categoryId: string): Promise<ResultCategory | undefined> => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return mockResultsData.find(c => c.categoryId === categoryId);
};

/**
 * Generate mock scorecard data for a player's round
 * Generates different data fields based on the scorecard type
 */
const generateMockScorecard = (
  playerId: string,
  round: number,
  scorecardType: ScorecardType,
  roundScore?: number
): RoundScorecard => {
  const coursePars = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];
  const courseHcps = [7, 3, 15, 1, 9, 17, 5, 11, 13, 8, 16, 2, 6, 10, 18, 4, 12, 14];
  
  const totalPar = coursePars.reduce((s, p) => s + p, 0);
  const target = roundScore || (totalPar + Math.floor(Math.random() * 8) - 2);
  const diff = target - totalPar;
  
  const holes: HoleScore[] = coursePars.map((par, i) => {
    const adjustment = i < Math.abs(diff) ? (diff > 0 ? 1 : -1) : 0;
    const golpes = par + adjustment;
    const hcpValue = courseHcps[i] <= 10 ? 1 : 0;
    const neto = golpes - hcpValue;
    
    // Stableford points calculation
    const netDiff = neto - par;
    const puntos = Math.max(0, 2 - netDiff); // 0=double+, 1=bogey, 2=par, 3=birdie, 4=eagle
    
    // +/- resultado for scratch
    const golpesDiff = golpes - par;
    const resultado = golpesDiff === 0 ? 'E' : golpesDiff > 0 ? `+${golpesDiff}` : `${golpesDiff}`;

    return {
      hoyo: i + 1,
      par,
      hcp: courseHcps[i],
      golpes,
      neto,
      puntos,
      resultado,
    };
  });

  const front9 = holes.slice(0, 9);
  const back9 = holes.slice(9, 18);

  return {
    round,
    scorecardType,
    holes,
    totalGolpes: holes.reduce((s, h) => s + h.golpes, 0),
    totalNeto: holes.reduce((s, h) => s + h.neto, 0),
    totalPuntos: holes.reduce((s, h) => s + (h.puntos || 0), 0),
    out: front9.reduce((s, h) => s + h.golpes, 0),
    in: back9.reduce((s, h) => s + h.golpes, 0),
  };
};

/** Fetch a player's scorecard for a specific round */
export const fetchPlayerScorecard = async (
  playerId: string,
  round: number,
  scorecardType: ScorecardType = 'hcp',
  roundScore?: number
): Promise<RoundScorecard> => {
  await new Promise(resolve => setTimeout(resolve, 150));
  return generateMockScorecard(playerId, round, scorecardType, roundScore);
};
