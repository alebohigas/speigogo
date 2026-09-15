/**
 * Resultados Page
 * Displays tournament results by category and scoring type
 * Supports expandable scorecards when clicking on round scores
 * Shows cut line separator and non-NORMAL players (S/R/D) below
 * Medal count is dynamic based on numjugprem from DB
 */

import Layout from '@/components/layout/Layout';
import PageHero from '@/components/shared/PageHero';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trophy, ArrowLeft, Medal, Loader2, Search } from 'lucide-react';
import resultadosHero from '@/assets/resultados-hero.jpg';
import { useState, useMemo, Fragment } from 'react';
import { useQueries } from '@tanstack/react-query';
import PlayerSearchInput from '@/components/shared/PlayerSearchInput';
import { apiFetch } from '@/lib/apiClient';
import { getResultadosCategoryUrl, POLL_SLOW } from '@/config/api';
import { normalizeSearchText, buildUniqueNameSuggestions } from '@/lib/searchUtils';
import { useAllResults, useCategoryResults, fetchPlayerScorecardFromApi, fetchParejasScorecardFromApi } from '@/hooks/useResultadosData';
import type { ParejaScorecard } from '@/hooks/useResultadosData';
import type { 
  ResultCategory, 
  ScoringType, 
  ScorecardType,
  PlayerResult,
  RoundScorecard,
  CutPlayer,
} from '@/data/resultadosData';
import ScorecardRow from '@/components/resultados/ScorecardRow';
import ScorecardParejas from '@/components/resultados/ScorecardParejas';
import EquipoLogo from '@/components/equipos/EquipoLogo';

// ============= Helper Functions =============

/**
 * Returns medal color class based on position
 * Gold (1st), Silver (2nd), Bronze (3rd+)
 */
const getMedalStyle = (position: number) => {
  if (position === 1) return 'text-yellow-500';
  if (position === 2) return 'text-gray-400';
  return 'text-amber-600'; // bronze for 3rd and beyond
};

/**
 * Returns medal icon if position is within medal count, otherwise null
 * @param position - Player's ranking position
 * @param medalCount - Number of medal winners from DB (numjugprem)
 */
const getPositionIcon = (position: number, medalCount: number) => {
  if (position <= medalCount) {
    return <Medal className={`h-5 w-5 ${getMedalStyle(position)}`} />;
  }
  return null;
};

/**
 * Returns status badge color classes based on status code
 * S = No Show (muted), R = Retiro (warning), D = Descalificado (destructive),
 * C = Corte (info/blue)
 */
const getStatusBadgeClasses = (code: string) => {
  if (code === 'S') return 'bg-muted text-muted-foreground';
  if (code === 'R') return 'bg-amber-100 text-amber-800';
  if (code === 'C') return 'bg-blue-100 text-blue-800';
  if (code === 'N') return 'bg-slate-200 text-slate-700'; // NO CONTIENDE
  return 'bg-red-100 text-red-800'; // D
};

/** Reads the score for any dynamic round key (r1, r2, r3, r4...) without reusing older rounds. */
const getRoundScore = (player: PlayerResult | CutPlayer, round: number) => player[`r${round}`];

/**
 * Format a Stroke Play ROUND score for display.
 *
 * Stroke Play results in this app are stored as a differential vs par
 * (e.g. -2, 0, +3). To match the LIVE view convention we render:
 *   - 0  → "E" (even par)
 *   - >0 → "+N" (over par, with leading +)
 *   - <0 → "-N" (under par, native sign)
 *
 * Stableford scores are absolute points and never receive a sign prefix —
 * call sites should skip this helper for STABLEFORD systems.
 */
const formatStrokeValue = (value: number | string): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (n === 0) return 'E';
  // No prefix for positives — display raw signed value (negatives keep '-').
  return `${n}`;
};

/** True when the active category uses Stroke Play (so we should sign-prefix scores). */
const isStrokePlaySystem = (system?: string): boolean => {
  if (!system) return false;
  return !system.toUpperCase().includes('STABLEFORD');
};

/**
 * Stroke Play score coloring (per tournament spec):
 *   score < par  → ROJO   #FF0000
 *   score = par  → AZUL   #0000FF
 *   score > par  → NEGRO  #000000
 * Returns `undefined` when the system is not Stroke Play or the reference par
 * is unknown, so the cell keeps its default theme color.
 */
const strokeScoreColor = (
  value: number | null | undefined,
  referencePar: number | undefined,
  system: string | undefined,
): string | undefined => {
  if (!isStrokePlaySystem(system)) return undefined;
  const n = Number(value);
  if (!referencePar || !Number.isFinite(n)) return undefined;
  if (n < referencePar) return '#FF0000';
  if (n === referencePar) return '#0000FF';
  return '#000000';
};

/**
 * Number of rounds that count towards the accumulated total, used to build
 * the total's reference par (coursePar × rounds). Prefers the API's
 * `closedRounds`; falls back to counting rounds with a numeric score.
 */
const countedRounds = (
  player: PlayerResult | CutPlayer,
  totalDays: number,
): number => {
  if (typeof player.closedRounds === 'number' && player.closedRounds > 0) return player.closedRounds;
  let n = 0;
  for (let r = 1; r <= totalDays; r++) {
    const v = player[`r${r}`];
    if (v !== undefined && v !== null && Number.isFinite(Number(v))) n++;
  }
  return n;
};

// ============= Component =============

/**
 * ResultadosProps
 * `embedded` + `torneoIdOverride` let the /historial page reuse this exact
 * leaderboard UI for a PAST tournament edition without duplicating code:
 *  - embedded: skip <Layout> and <PageHero> (the host page renders them)
 *  - torneoIdOverride: query the API with another torneoid
 */
interface ResultadosProps {
  embedded?: boolean;
  torneoIdOverride?: string;
}

/**
 * ResultadosSearchHit
 * Un jugador encontrado por el buscador por nombre, junto con la categoría
 * (y el tipo de puntuación) donde aparece, para poder saltar a ella.
 */
interface ResultadosSearchHit {
  category: ResultCategory;
  position: number;
  name: string;
  partner?: string;
  club: string;
  clubLogo: string;
  total: number | string;
}

const Resultados = ({ embedded = false, torneoIdOverride }: ResultadosProps = {}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedScoringType, setSelectedScoringType] = useState<ScoringType | null>(null);
  /** Búsqueda de jugador por nombre (misma UX que JUGADORES y SALIDAS) */
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedQuery = normalizeSearchText(searchQuery);
  const searchActive = normalizedQuery.length >= 2;

  /** Track which scorecard is expanded: "playerId-round" */
  const [expandedScorecard, setExpandedScorecard] = useState<string | null>(null);
  const [scorecardData, setScorecardData] = useState<RoundScorecard | null>(null);
  /** Datos cuando la categoría es de parejas (Go Go / Bola Baja / Suma Scores). */
  const [parejaScorecardData, setParejaScorecardData] = useState<ParejaScorecard | null>(null);
  const [scorecardLoading, setScorecardLoading] = useState(false);

  // Fetch all categories from API
  const { data: categories = [], isLoading: loadingCats } = useAllResults(torneoIdOverride);

  /**
   * Carga en paralelo el leaderboard NETO de TODAS las categorías (sólo cuando
   * hay búsqueda activa) para poder localizar a un jugador sin abrir categorías.
   */
  const searchQueries = useQueries({
    queries: categories.map((cat) => ({
      queryKey: ['resultados-search', cat.categoryId, torneoIdOverride ?? 'active'],
      queryFn: async () => {
        const raw = await apiFetch<any>(
          getResultadosCategoryUrl(cat.categoryId, '0', torneoIdOverride)
        );
        const list: any[] = Array.isArray(raw?.players)
          ? raw.players
          : (raw?.scoringTypes?.[0]?.players ?? []);
        const hits = list.map((p: any, idx: number) => ({
          category: cat,
          position: p.position ?? idx + 1,
          name: p.name || p.pairName || '',
          partner: p.partner || '',
          club: p.club || '',
          clubLogo: p.clubLogo || '',
          total: p.total ?? p.totalSA ?? 0,
        })) as ResultadosSearchHit[];
        return hits;
      },
      staleTime: POLL_SLOW,
      enabled: searchActive,
    })),
  });

  /** Nombres únicos para el autocompletado */
  const playerSuggestions = useMemo(() => {
    const names: string[] = [];
    for (const q of searchQueries) {
      for (const hit of q.data ?? []) {
        if (hit.name) names.push(hit.name);
        if (hit.partner) names.push(hit.partner);
      }
    }
    return buildUniqueNameSuggestions(names);
  }, [searchQueries]);

  /** Resultados de búsqueda entre todas las categorías cargadas */
  const searchResults = useMemo<ResultadosSearchHit[]>(() => {
    if (!searchActive) return [];
    const out: ResultadosSearchHit[] = [];
    for (const q of searchQueries) {
      for (const hit of q.data ?? []) {
        if (
          normalizeSearchText(hit.name).includes(normalizedQuery) ||
          normalizeSearchText(hit.partner).includes(normalizedQuery)
        ) {
          out.push(hit);
        }
      }
    }
    return out;
  }, [searchActive, normalizedQuery, searchQueries]);

  /** Cargando mientras ninguna categoría ha resuelto todavía */
  const searchLoading =
    searchActive && searchQueries.length > 0 && searchQueries.every((q) => q.isLoading);

  // Fetch selected category detail from API (passes gross param based on scoring type)
  const { data: categoryDetail, isLoading: loadingDetail } = useCategoryResults(
    selectedCategoryId,
    !!selectedCategoryId && !!selectedScoringType,
    selectedScoringType || 'NETO',
    torneoIdOverride,
  );

  /** Find the selected category object from the list (metadata only) */
  const selectedCategory = categories.find(c => c.categoryId === selectedCategoryId) || null;

  /**
   * Medal count for the currently selected scoring type.
   * NETO uses categorias.numganadorneto (default 3).
   * GROSS uses categorias.numganadorgross (default 1).
   * Falls back to the legacy `medalCount` field for back-compat.
   */
  const medalCount = (() => {
    if (!categoryDetail) return 3;
    if (selectedScoringType === 'GROSS') {
      return categoryDetail.medalCountGross ?? categoryDetail.medalCount ?? 1;
    }
    return categoryDetail.medalCountNeto ?? categoryDetail.medalCount ?? 3;
  })();

  /** Cut players (non-NORMAL status) from API */
  const cutPlayers: CutPlayer[] = categoryDetail?.cutPlayers || [];

  /** Get players for the selected scoring type - MUST use categoryDetail for full data */
  const players: PlayerResult[] = (() => {
    if (!categoryDetail || !selectedScoringType) return [];
    const scoring = categoryDetail.scoringTypes?.find(s => s.scoringType === selectedScoringType);
    return scoring?.players || [];
  })();

  /** Handle category card click - auto-select scoring if only one type */
  const handleCategoryClick = (category: ResultCategory) => {
    setSelectedCategoryId(category.categoryId);
    setExpandedScorecard(null);
    setScorecardData(null);
    if (category.scoringTypes.length === 1) {
      setSelectedScoringType(category.scoringTypes[0].scoringType as ScoringType);
    } else {
      setSelectedScoringType(null);
    }
  };

  /** Handle scoring type selection */
  const handleScoringClick = (scoringType: ScoringType) => {
    setExpandedScorecard(null);
    setScorecardData(null);
    setSelectedScoringType(scoringType);
  };

  /** Handle back navigation */
  const handleBack = () => {
    setExpandedScorecard(null);
    setScorecardData(null);
    setParejaScorecardData(null);
    if (selectedScoringType) {
      const cat = categories.find(c => c.categoryId === selectedCategoryId);
      if (cat && cat.scoringTypes.length <= 1) {
        setSelectedCategoryId(null);
        setSelectedScoringType(null);
      } else {
        setSelectedScoringType(null);
      }
    } else {
      setSelectedCategoryId(null);
    }
  };

  /** Determine which scorecard type to use */
  const getActiveScorecardType = (): ScorecardType => {
    if (!categoryDetail || !selectedScoringType) return 'hcp';
    const scoring = categoryDetail.scoringTypes.find(s => s.scoringType === selectedScoringType);
    if (scoring?.scorecardType) return scoring.scorecardType;
    if (categoryDetail.defaultScorecardType) return categoryDetail.defaultScorecardType;
    return selectedScoringType === 'GROSS' ? 'scratch' : 'hcp';
  };

  /** Handle round score click - fetch scorecard from API and toggle expansion */
  const handleRoundClick = async (player: PlayerResult, round: number) => {
    const key = `${player.id}-${round}`;
    const roundScore = getRoundScore(player, round);
    
    if (roundScore === undefined || roundScore === null) return;

    if (expandedScorecard === key) {
      setExpandedScorecard(null);
      setScorecardData(null);
      setParejaScorecardData(null);
      return;
    }

    const days = categoryDetail?.days || [];
    const fecha = days[round - 1];

    if (!fecha || !categoryDetail) {
      console.warn('No date found for round', round, 'days:', days);
      setExpandedScorecard(key);
      setScorecardData(null);
      setParejaScorecardData(null);
      return;
    }

    setExpandedScorecard(key);
    setScorecardData(null);
    setParejaScorecardData(null);
    setScorecardLoading(true);

    try {
      // Cuando la categoría es de parejas, golpeamos el endpoint específico
      // (`tarjeta_parejas.php`) que detecta el estilojuego del día y devuelve
      // los datos crudos para que ScorecardParejas elija el layout.
      if (categoryDetail.isParejas) {
        const pareja = await fetchParejasScorecardFromApi(
          player.id,
          categoryDetail.categoryId,
          fecha,
          torneoIdOverride,
        );
        setParejaScorecardData(pareja);
      } else {
        const scorecard = await fetchPlayerScorecardFromApi(
          player.id,
          categoryDetail.categoryId,
          fecha,
          categoryDetail.system || '',
          selectedScoringType || 'NETO',
          round,
          torneoIdOverride,
        );
        setScorecardData(scorecard);
      }
    } catch (err) {
      console.error('Failed to fetch scorecard:', err);
      setScorecardData(null);
      setParejaScorecardData(null);
    } finally {
      setScorecardLoading(false);
    }
  };

  /** Total columns count for colSpan calculations */
  const totalCols = 3 + (categoryDetail?.days?.length || 0) + 1;

  const isLoading = loadingCats || loadingDetail;

  /**
   * body
   * Leaderboard markup shared by the standalone /resultados page and the
   * embedded usage inside /historial.
   */
  const body = (
    <>
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          {!selectedCategoryId ? (
            <>
              {/* Header */}
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-foreground">
                  CATEGORÍAS: <span className="text-primary">{loadingCats ? '…' : categories.length}</span>
                </h2>
              </div>

              {/* ============= Buscador por nombre (igual que JUGADORES / SALIDAS) ============= */}
              <PlayerSearchInput
                className="max-w-md mx-auto mb-8"
                value={searchQuery}
                onChange={setSearchQuery}
                suggestions={playerSuggestions}
              />

              {searchActive ? (
                /* ============= Resultados de búsqueda ============= */
                <div className="max-w-4xl mx-auto">
                  {searchLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-12">
                      <Search className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                      <p className="text-muted-foreground">
                        No se encontró ningún jugador con "{searchQuery}"
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <p className="text-sm text-muted-foreground text-center">
                        {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} encontrado{searchResults.length !== 1 ? 's' : ''}
                      </p>
                      {searchResults.map((hit, idx) => (
                        <Card key={`${hit.category.categoryId}-${idx}`} className="border-border/50 bg-white">
                          <CardContent className="p-0 bg-white">
                            <div className="bg-muted/50 px-4 py-2 border-b border-border/30 flex flex-wrap gap-x-4 gap-y-1 text-sm items-center justify-between">
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                <span className="font-semibold text-foreground">{hit.category.categoryName}</span>
                                <span className="text-primary font-medium">{hit.category.shortName}</span>
                                <span className="text-muted-foreground">{hit.category.system}</span>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSearchQuery('');
                                  handleCategoryClick(hit.category);
                                }}
                                className="text-primary hover:text-primary hover:bg-primary/10"
                              >
                                Ver categoría
                              </Button>
                            </div>
                            <div className="overflow-x-auto bg-white">
                              <Table className="bg-white tournament-table">
                                <TableHeader>
                                  <TableRow className="bg-primary hover:bg-primary">
                                    <TableHead className="text-primary-foreground font-bold text-center w-16">Pos</TableHead>
                                    <TableHead className="text-primary-foreground font-bold text-center">Club</TableHead>
                                    <TableHead className="text-primary-foreground font-bold">Jugador</TableHead>
                                    <TableHead className="text-primary-foreground font-bold text-center">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  <TableRow className="bg-white hover:bg-white">
                                    <TableCell className="text-center font-semibold">{hit.position}</TableCell>
                                    <TableCell className="p-1 text-center align-middle">
                                      {hit.clubLogo ? (
                                        <img
                                          src={hit.clubLogo}
                                          alt="Club"
                                          className="w-auto object-contain rounded inline-block"
                                          style={{ height: '2.1375rem' }}
                                        />
                                      ) : (
                                        <span className="text-xs">{hit.club}</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="player-name-cell">
                                      <span className="player-name-clamp">{hit.name}</span>
                                      {hit.partner ? (
                                        <span className="block text-xs text-muted-foreground">{hit.partner}</span>
                                      ) : null}
                                    </TableCell>
                                    <TableCell className="text-center font-extrabold text-primary">{hit.total}</TableCell>
                                  </TableRow>
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              ) : loadingCats ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                /* Categories Grid */
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
                  {categories.map((category) => (
                    <Card 
                      key={category.categoryId} 
                      className="border-border/50 hover:border-primary/50 transition-all hover:shadow-lg cursor-pointer"
                      onClick={() => handleCategoryClick(category)}
                    >
                      <CardContent className="p-5 text-center">
                        <Trophy className="h-6 w-6 mx-auto mb-2 text-primary" />
                        <h3 className="font-bold text-foreground text-lg mb-2">{category.shortName}</h3>
                        <div className="flex justify-center gap-1 flex-wrap">
                          {category.scoringTypes.map((scoring) => (
                            <span
                              key={scoring.scoringType}
                              className={`text-xs px-2 py-0.5 rounded text-white ${
                                scoring.scoringType === 'NETO' ? 'bg-sky-500' : 'bg-green-600'
                              }`}
                            >
                              {scoring.scoringType}
                            </span>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : !selectedScoringType ? (
            <>
              {/* Category Selected - Choose Scoring Type */}
              <Button variant="ghost" onClick={handleBack} className="mb-6 gap-2 bg-primary/10 hover:bg-primary/20">
                <ArrowLeft className="h-4 w-4" />
                Volver a categorías
              </Button>

                <>
                  <div className="text-center mb-10">
                    <h2 className="text-3xl font-bold text-foreground mb-2">
                      {selectedCategory?.categoryName}
                    </h2>
                    <p className="text-muted-foreground">Selecciona el tipo de puntuación</p>
                  </div>

                  <div className="flex justify-center gap-4 flex-wrap max-w-md mx-auto">
                    {selectedCategory?.scoringTypes?.map((scoring) => (
                  <Card 
                    key={scoring.scoringType}
                    className="border-border/50 hover:border-primary/50 transition-all hover:shadow-lg cursor-pointer flex-1 min-w-[140px]"
                    onClick={() => handleScoringClick(scoring.scoringType as ScoringType)}
                  >
                    <CardContent className="p-6 text-center">
                      <div className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${
                        scoring.scoringType === 'NETO' ? 'bg-sky-500' : 'bg-green-600'
                      }`}>
                        <Trophy className="h-6 w-6 text-white" />
                      </div>
                      <h3 className="font-bold text-foreground text-xl mb-1">{scoring.scoringType}</h3>
                      <p className="text-sm text-muted-foreground">
                        {scoring.players.length} jugadores
                      </p>
                    </CardContent>
                  </Card>
                    ))}
                  </div>
                </>
            </>
          ) : (
            <>
              {/* Results Detail View */}
              <Button variant="ghost" onClick={handleBack} className="mb-6 gap-2 bg-primary/10 hover:bg-primary/20">
                <ArrowLeft className="h-4 w-4" />
                {selectedCategory?.scoringTypes.length === 1 
                  ? 'Volver a categorías' 
                  : `Volver a ${selectedCategory?.shortName}`}
              </Button>

              <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold text-foreground mb-2">
                  {selectedCategory?.categoryName}
                </h2>
                <span className={`inline-block px-4 py-1 rounded-full text-white font-semibold ${
                  selectedScoringType === 'NETO' ? 'bg-sky-500' : 'bg-green-600'
                }`}>
                  {selectedScoringType}
                </span>
              </div>

              {loadingDetail ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  <Card className="border-border/50 bg-white max-w-5xl mx-auto">
                  <CardContent className="p-0 bg-white">
                    {categoryDetail?.isEquipos && (
                    <div className="p-4 space-y-4 md:hidden">
                      {players.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">Sin resultados aún.</div>
                      ) : (
                        players.map((player) => {
                          const name1 = player.name;
                          return (
                            <div key={player.id} className="border border-border/50 rounded-xl bg-white overflow-hidden shadow-sm">
                              <div className="bg-muted/50 px-4 py-3 border-b border-border/30 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="flex items-center gap-1 shrink-0">
                                    {getPositionIcon(player.position, medalCount)}
                                    <span className={player.position <= medalCount ? getMedalStyle(player.position) : ''}>
                                      {player.position}
                                    </span>
                                  </div>
                                  <EquipoLogo
                                    grupoid={player.grupoid || ''}
                                    torneoId={torneoIdOverride}
                                    dbLogo={player.clubLogo}
                                    className="w-auto object-contain rounded inline-block shrink-0"
                                    style={{ height: '2.1375rem' }}
                                  />
                                  <span className="font-bold text-foreground truncate">{name1}</span>
                                </div>
                                <span className="font-bold text-primary text-lg shrink-0">{player.total ?? 0}</span>
                              </div>
                              <div className="p-4 space-y-3">
                                <div className="text-sm text-muted-foreground space-y-0.5">
                                  {(player.members || []).map((m, mi) => (
                                    <span key={mi} className="block">{m}</span>
                                  ))}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(categoryDetail?.days || []).map((_, i) => {
                                    const round = i + 1;
                                    const score = getRoundScore(player, round);
                                    if (score === undefined || score === null) return null;
                                    const isExpanded = expandedScorecard === `${player.id}-${round}`;
                                    return (
                                      <button
                                        key={round}
                                        onClick={() => handleRoundClick(player, round)}
                                        className={`inline-flex flex-col items-center px-3 py-1.5 rounded-md border text-sm transition-colors ${
                                          isExpanded
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border bg-white hover:border-primary/50 hover:bg-primary/5'
                                        }`}
                                        title={`Ver tarjeta R${round}`}
                                        style={{ color: strokeScoreColor(score as number, categoryDetail?.coursePar, categoryDetail?.system) }}
                                      >
                                        <span className="text-[10px] text-muted-foreground leading-none">R{round}</span>
                                        <span className="font-bold leading-none mt-0.5">{score}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              {expandedScorecard?.startsWith(`${player.id}-`) && (
                                <div className="border-t border-border/30 p-0">
                                  {scorecardLoading ? (
                                    <div className="text-center py-6 text-muted-foreground">Cargando tarjeta...</div>
                                  ) : parejaScorecardData && categoryDetail?.isParejas ? (
                                    <div className="overflow-x-auto">
                                      <table className="w-full">
                                        <tbody>
                                          <ScorecardParejas
                                            scorecard={parejaScorecardData}
                                            pairLabel={player.pairName || player.name}
                                            roundLabel={`Ronda ${expandedScorecard.split('-').pop()}`}
                                            onClose={() => { setExpandedScorecard(null); setScorecardData(null); setParejaScorecardData(null); }}
                                            colSpan={1}
                                          />
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : scorecardData ? (
                                    <div className="overflow-x-auto">
                                      <table className="w-full">
                                        <tbody>
                                          <ScorecardRow
                                            scorecard={scorecardData}
                                            playerName={player.name}
                                            roundLabel={`Ronda ${expandedScorecard.split('-').pop()}`}
                                            onClose={() => { setExpandedScorecard(null); setScorecardData(null); setParejaScorecardData(null); }}
                                            colSpan={1}
                                          />
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                      {cutPlayers.length > 0 && (
                        <>
                          <div className="text-center py-2">
                            <span className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">— Corte —</span>
                          </div>
                          {cutPlayers.map((cp) => (
                            <div key={cp.playerId} className="border border-border/50 rounded-xl bg-muted/20 overflow-hidden opacity-80">
                              <div className="bg-muted/50 px-4 py-3 border-b border-border/30 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${getStatusBadgeClasses(cp.statusCode)}`}>
                                    {cp.statusCode}
                                  </span>
                                  <EquipoLogo
                                    grupoid={cp.grupoid || ''}
                                    torneoId={torneoIdOverride}
                                    dbLogo={cp.clubLogo}
                                    className="w-auto object-contain rounded inline-block shrink-0"
                                    style={{ height: '2.1375rem' }}
                                  />
                                  <span className="font-bold text-foreground truncate">{cp.name}</span>
                                </div>
                                <span className="font-bold text-muted-foreground text-lg shrink-0">{cp.total && cp.total > 0 ? cp.total : '—'}</span>
                              </div>
                              <div className="p-4 space-y-3">
                                <div className="text-sm text-muted-foreground space-y-0.5">
                                  {(cp.members || []).map((m, mi) => (
                                    <span key={mi} className="block">{m}</span>
                                  ))}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(categoryDetail?.days || []).map((_, i) => {
                                    const round = i + 1;
                                    const score = getRoundScore(cp, round);
                                    if (score === undefined || score === null) return null;
                                    const isExpanded = expandedScorecard === `${cp.playerId}-${round}`;
                                    return (
                                      <button
                                        key={round}
                                        onClick={() => handleRoundClick(
                                          { ...cp, ...Object.fromEntries((categoryDetail?.days || []).map((_, idx) => [`r${idx + 1}`, getRoundScore(cp, idx + 1) ?? undefined])), id: cp.playerId, position: 0, total: cp.total ?? 0 } as PlayerResult,
                                          round,
                                        )}
                                        className={`inline-flex flex-col items-center px-3 py-1.5 rounded-md border text-sm transition-colors ${
                                          isExpanded
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border bg-white hover:border-primary/50 hover:bg-primary/5'
                                        }`}
                                        title={`Ver tarjeta R${round}`}
                                        style={{ color: strokeScoreColor(score as number, categoryDetail?.coursePar, categoryDetail?.system) }}
                                      >
                                        <span className="text-[10px] text-muted-foreground leading-none">R{round}</span>
                                        <span className="font-bold leading-none mt-0.5">{score}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              {expandedScorecard?.startsWith(`${cp.playerId}-`) && (
                                <div className="border-t border-border/30 p-0">
                                  {scorecardLoading ? (
                                    <div className="text-center py-6 text-muted-foreground">Cargando tarjeta...</div>
                                  ) : scorecardData ? (
                                    <div className="overflow-x-auto">
                                      <table className="w-full">
                                        <tbody>
                                          <ScorecardRow
                                            scorecard={scorecardData}
                                            playerName={cp.name}
                                            roundLabel={`Ronda ${expandedScorecard.split('-').pop()}`}
                                            onClose={() => { setExpandedScorecard(null); setScorecardData(null); }}
                                            colSpan={1}
                                          />
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                    <div className="overflow-x-auto bg-white hidden md:block">
                      <Table className="bg-white tournament-table">
                        <TableHeader>
                          <TableRow className="bg-primary hover:bg-primary">
                            {/*
                             * Sticky leading columns (Pos · Club · Jugador).
                             * The user requested Pos and Jugador to be sticky;
                             * because Club sits between them we also pin Club so
                             * the three columns stay glued together when the
                             * user scrolls horizontally on narrow viewports.
                             * Left offsets must match each column's rendered
                             * width: Pos = 4rem (w-16), Club ≈ 3.5rem.
                             * z-20 keeps headers above sticky body cells (z-10).
                             */}
                            <TableHead className="text-primary-foreground font-bold w-16 sticky left-0 z-20 bg-primary">Pos</TableHead>
                            <TableHead className="text-primary-foreground font-bold text-center sticky z-20 bg-primary" style={{ left: '4rem' }}>{categoryDetail?.isEquipos ? 'Grupo' : 'Club'}</TableHead>
                            <TableHead className="text-primary-foreground font-bold sticky z-20 bg-primary" style={{ left: '7.5rem' }}>{categoryDetail?.isEquipos ? 'Equipo' : 'Jugador'}</TableHead>
                            {/* Dynamic round columns based on days array */}
                            {(categoryDetail?.days || []).map((_, i) => (
                              <TableHead
                                key={`r${i + 1}`}
                                className="text-primary-foreground font-bold text-center"
                              >
                                R{i + 1}
                              </TableHead>
                            ))}
                            <TableHead className="text-primary-foreground font-bold text-center">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {players.length > 0 ? (
                            players.map((player) => {
                              /* En categorías de PAREJAS: render = 2 renglones (uno por integrante)
                               * y las columnas compartidas (Pos / Club logo / R1..Rn / Total) se
                               * centran verticalmente con rowSpan=2 — equivalente a la imagen
                               * de Jugadores que pidió el usuario. */
                              const isPair = !!(categoryDetail?.isParejas && player.partner);
                              const rowSpan = isPair ? 2 : 1;
                              /* `player.name` ya es el nombre del JUGADOR 1 (capitán) tal cual
                               * lo regresa la API, y `player.partner` es el segundo integrante.
                               * No parseamos pairName aquí porque el orden de pairName puede
                               * NO coincidir con el orden (name, partner) de la API (la BD
                               * legacy concatena los nombres en orden alfabético). */
                              const name1 = player.name;
                              return (
                              <Fragment key={player.id}>
                                <TableRow className={`bg-white hover:bg-white ${isPair ? 'border-b-0' : ''}`}>
                                  {/* Position con medalla — abarca los 2 renglones en parejas */}
                                  <TableCell rowSpan={rowSpan} className="font-semibold sticky left-0 z-10 bg-white align-middle">
                                    <div className="flex items-center gap-2">
                                      {getPositionIcon(player.position, medalCount)}
                                      <span className={player.position <= medalCount ? getMedalStyle(player.position) : ''}>
                                        {player.position}
                                      </span>
                                    </div>
                                  </TableCell>
                                  {/* Club Logo del jugador 1 (en parejas también es 1 logo por renglón) */}
                                  <TableCell className="p-1 text-center align-middle sticky z-10 bg-white" style={{ left: '4rem' }}>
                                    {categoryDetail?.isEquipos ? (
                                      /* Logo del equipo: primero /logos-equipos, luego el de la BD. */
                                      <EquipoLogo
                                        grupoid={player.grupoid || ''}
                                        torneoId={torneoIdOverride}
                                        dbLogo={player.clubLogo}
                                        className="w-auto object-contain rounded inline-block"
                                        style={{ height: '2.1375rem' }}
                                      />
                                    ) : player.clubLogo ? (
                                      <img
                                        src={player.clubLogo}
                                        alt="Club"
                                        className="w-auto object-contain rounded inline-block"
                                        style={{ height: '2.1375rem' }}
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="%23166534" rx="4"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="9" font-family="sans-serif">Club</text></svg>')}`;
                                        }}
                                      />
                                    ) : (
                                      <span className="text-xs text-muted-foreground">{player.club}</span>
                                    )}
                                  </TableCell>
                                  {/* Nombre recortado a 4 renglones en móvil vía span interno (.player-name-clamp) */}
                                  {/* En categorías por equipos el renglón muestra el nombre del
                                      equipo en negritas y debajo la lista de integrantes. */}
                                  <TableCell className="font-medium player-name-cell sticky z-10 bg-white" style={{ left: '7.5rem' }}>
                                    {categoryDetail?.isEquipos ? (
                                      <div className="py-1">
                                        <span className="block font-bold">{name1}</span>
                                        {(player.members || []).map((m, mi) => (
                                          <span key={`${player.id}-m${mi}`} className="block text-sm text-muted-foreground leading-tight">
                                            {m}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="player-name-clamp">{name1}</span>
                                    )}
                                  </TableCell>
                                  {/* Round score cells — rowSpan=2 en parejas para centrar el score compartido */}
                                  {(categoryDetail?.days || []).map((_, i) => {
                                    const round = i + 1;
                                    const score = getRoundScore(player, round);
                                    const isExpanded = expandedScorecard === `${player.id}-${round}`;
                                    // RESULTADOS: round shows RAW total (golpes / puntos).
                                    // The signed diff-vs-par ("+N / -N / E") view is used
                                    // only on /live — never here.
                                    return (
                                      <TableCell key={round} rowSpan={rowSpan} className="text-center p-0 align-middle">
                                        {score !== undefined && score !== null ? (
                                          <button
                                            onClick={() => handleRoundClick(player, round)}
                                            className={`w-full py-3 px-2 font-medium transition-colors cursor-pointer hover:bg-primary/10 hover:text-primary ${
                                              isExpanded ? 'bg-primary/15 text-primary font-bold underline underline-offset-2' : ''
                                            }`}
                                            title={`Ver tarjeta R${round}`}
                                            // Stroke Play round coloring vs course par.
                                            style={{ color: strokeScoreColor(score as number, categoryDetail?.coursePar, categoryDetail?.system) }}
                                          >
                                            {/* Raw round total (golpes for Stroke, puntos for Stableford). */}
                                            {score}
                                          </button>
                                        ) : (
                                          <span className="py-3 px-2 inline-block">-</span>
                                        )}
                                      </TableCell>
                                    );
                                  })}
                                  <TableCell
                                    rowSpan={rowSpan}
                                    className="text-center font-bold text-primary text-lg align-middle"
                                    // Total coloring: compares accumulated strokes vs coursePar × rounds played.
                                    style={{
                                      color: strokeScoreColor(
                                        player.total,
                                        (categoryDetail?.coursePar || 0) * countedRounds(player, categoryDetail?.days?.length || 0) || undefined,
                                        categoryDetail?.system,
                                      ),
                                    }}
                                  >
                                    {/* Total comes directly from the API: Stroke Play = total strokes, Stableford = total points. */}
                                    {player.total ?? 0}
                                  </TableCell>
                                </TableRow>

                                {/* Segundo renglón: integrante 2 de la pareja.
                                    Sólo contiene logo del club 2 + nombre del compañero;
                                    las demás columnas las cubre el rowSpan=2 del renglón anterior. */}
                                {isPair && (
                                  <TableRow className="bg-white hover:bg-white">
                                    <TableCell className="p-1 text-center align-middle sticky z-10 bg-white" style={{ left: '4rem' }}>
                                      {player.clubLogo2 ? (
                                        <img
                                          src={player.clubLogo2}
                                          alt="Club 2"
                                          className="w-auto object-contain rounded inline-block"
                                          style={{ height: '2.1375rem' }}
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                          }}
                                        />
                                      ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="font-medium player-name-cell sticky z-10 bg-white" style={{ left: '7.5rem' }}>
                                      <span className="player-name-clamp">{player.partner}</span>
                                    </TableCell>
                                  </TableRow>
                                )}

                                {/* Expanded scorecard row */}
                                {expandedScorecard?.startsWith(`${player.id}-`) && (
                                  scorecardLoading ? (
                                    <TableRow className="bg-white hover:bg-white">
                                      <TableCell colSpan={totalCols} className="text-center py-6 text-muted-foreground">
                                        Cargando tarjeta...
                                      </TableCell>
                                    </TableRow>
                                  ) : parejaScorecardData && categoryDetail?.isParejas ? (
                                    <ScorecardParejas
                                      scorecard={parejaScorecardData}
                                      pairLabel={player.pairName || player.name}
                                      roundLabel={`Ronda ${expandedScorecard.split('-').pop()}`}
                                      onClose={() => { setExpandedScorecard(null); setScorecardData(null); setParejaScorecardData(null); }}
                                      colSpan={totalCols}
                                    />
                                  ) : scorecardData ? (
                                    <ScorecardRow
                                      scorecard={scorecardData}
                                      playerName={player.name}
                                      roundLabel={`Ronda ${expandedScorecard.split('-').pop()}`}
                                      onClose={() => { setExpandedScorecard(null); setScorecardData(null); setParejaScorecardData(null); }}
                                      colSpan={totalCols}
                                    />
                                  ) : null
                                )}
                              </Fragment>
                              );
                            })
                          ) : (
                            <TableRow>
                              <TableCell colSpan={totalCols} className="text-center text-muted-foreground py-8">
                                No hay resultados disponibles
                              </TableCell>
                            </TableRow>
                          )}

                          {/* ============= CUT LINE SEPARATOR ============= */}
                          {cutPlayers.length > 0 && (
                            <>
                              {/* Visual cut line: grey separator row */}
                              <TableRow className="bg-muted/60 hover:bg-muted/60 border-t-2 border-b-2 border-border">
                                <TableCell colSpan={totalCols} className="text-center py-3">
                                  <span className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
                                    — Corte —
                                  </span>
                                </TableCell>
                              </TableRow>

                              {/* Non-NORMAL players (S/R/D) */}
                              {cutPlayers.map((cp) => {
                                /* Mismo patrón que la sección NORMAL: parejas se renderizan en 2
                                 * renglones, columnas compartidas con rowSpan=2. */
                                const isPair = !!(categoryDetail?.isParejas && cp.partner);
                                const rowSpan = isPair ? 2 : 1;
                                const name1 = isPair
                                  ? (cp.pairName?.split('/')[0]?.trim() || cp.name)
                                  : cp.name;
                                return (
                                <Fragment key={cp.playerId}>
                                <TableRow className={`bg-muted/20 ${isPair ? 'border-b-0' : ''}`}>
                                  {/* Status code instead of position */}
                                  <TableCell rowSpan={rowSpan} className="font-semibold text-center sticky left-0 z-10 bg-muted/20 align-middle" style={{ backgroundColor: 'hsl(var(--muted) / 0.2)' }}>
                                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${getStatusBadgeClasses(cp.statusCode)}`}>
                                      {cp.statusCode}
                                    </span>
                                  </TableCell>
                                  {/* Club Logo */}
                                  <TableCell className="p-1 text-center align-middle sticky z-10" style={{ left: '4rem', backgroundColor: 'hsl(var(--muted) / 0.2)' }}>
                                    {cp.clubLogo ? (
                                      <img
                                        src={cp.clubLogo}
                                        alt="Club"
                                        className="w-auto object-contain rounded inline-block opacity-60"
                                        // Height reduced 5% (2.25rem → 2.1375rem) — consistent across tables
                                        style={{ height: '2.1375rem' }}
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="%23166534" rx="4"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="9" font-family="sans-serif">Club</text></svg>')}`;
                                        }}
                                      />
                                    ) : (
                                      <span className="text-xs text-muted-foreground">{cp.club}</span>
                                    )}
                                  </TableCell>
                                  {/*
                                   * Player name + status label.
                                   * Status is rendered as a block under the name so on
                                   * mobile the long status text (e.g. "(descalificado)")
                                   * never sits beside the surname and never widens the
                                   * column / scrolls the table horizontally.
                                   */}
                                  <TableCell className="font-medium text-muted-foreground player-name-cell sticky z-10" style={{ left: '7.5rem', backgroundColor: 'hsl(var(--muted) / 0.2)' }}>
                                    <span className={`block leading-tight player-name-clamp ${categoryDetail?.isEquipos ? 'font-bold' : ''}`}>{name1}</span>
                                    {categoryDetail?.isEquipos && (cp.members || []).map((m, mi) => (
                                      <span key={`${cp.playerId}-m${mi}`} className="block text-sm leading-tight text-muted-foreground">
                                        {m}
                                      </span>
                                    ))}
                                    <span className="block text-[11px] leading-tight text-muted-foreground/70">
                                      ({cp.statusLabel})
                                    </span>
                                  </TableCell>
                                  {/*
                                   * Round score cells for cut players.
                                   * If a round was completed (closed scorecard) we still
                                   * show the score and allow expanding the scorecard,
                                   * just like NORMAL players. Otherwise we render a dash.
                                   */}
                                  {(categoryDetail?.days || []).map((_, i) => {
                                    const round = i + 1;
                                    const score = getRoundScore(cp, round);
                                    const isExpanded = expandedScorecard === `${cp.playerId}-${round}`;
                                    // RESULTADOS: raw round total — never the diff-vs-par.
                                    if (score === undefined || score === null) {
                                      return (
                                        <TableCell key={round} rowSpan={rowSpan} className="text-center text-muted-foreground align-middle">—</TableCell>
                                      );
                                    }
                                    return (
                                      <TableCell key={round} rowSpan={rowSpan} className="text-center p-0 align-middle">
                                        <button
                                          onClick={() => handleRoundClick(
                                            // Reuse PlayerResult-shaped object so handler signature stays the same
                                            { ...cp, ...Object.fromEntries((categoryDetail?.days || []).map((_, idx) => [`r${idx + 1}`, getRoundScore(cp, idx + 1) ?? undefined])), id: cp.playerId, position: 0, total: cp.total ?? 0 } as PlayerResult,
                                            round,
                                          )}
                                          className={`w-full py-3 px-2 font-medium transition-colors cursor-pointer hover:bg-primary/10 hover:text-primary ${
                                            isExpanded ? 'bg-primary/15 text-primary font-bold underline underline-offset-2' : ''
                                          }`}
                                          title={`Ver tarjeta R${round}`}
                                          // Stroke Play round coloring vs course par.
                                          style={{ color: strokeScoreColor(score as number, categoryDetail?.coursePar, categoryDetail?.system) }}
                                        >
                                          {score}
                                        </button>
                                      </TableCell>
                                    );
                                  })}
                                  {/* Total: show accumulated total when player has at least one closed round */}
                                  <TableCell
                                    rowSpan={rowSpan}
                                    className="text-center font-bold text-muted-foreground align-middle"
                                    // Total coloring for cut players (Stroke Play only).
                                    style={{
                                      color: cp.total && cp.total > 0
                                        ? strokeScoreColor(
                                            cp.total,
                                            (categoryDetail?.coursePar || 0) * countedRounds(cp, categoryDetail?.days?.length || 0) || undefined,
                                            categoryDetail?.system,
                                          )
                                        : undefined,
                                    }}
                                  >
                                    {/* Total comes directly from the API: Stroke Play = total strokes, Stableford = total points. */}
                                    {cp.total && cp.total > 0 ? cp.total : '—'}
                                  </TableCell>
                                </TableRow>

                                {/* Segundo integrante (parejas) */}
                                {isPair && (
                                  <TableRow className="bg-muted/20">
                                    <TableCell className="p-1 text-center align-middle sticky z-10" style={{ left: '4rem', backgroundColor: 'hsl(var(--muted) / 0.2)' }}>
                                      {cp.clubLogo2 ? (
                                        <img
                                          src={cp.clubLogo2}
                                          alt="Club 2"
                                          className="w-auto object-contain rounded inline-block opacity-60"
                                          style={{ height: '2.1375rem' }}
                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                      ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="font-medium text-muted-foreground player-name-cell sticky z-10" style={{ left: '7.5rem', backgroundColor: 'hsl(var(--muted) / 0.2)' }}>
                                      <span className="block leading-tight player-name-clamp">{cp.partner}</span>
                                    </TableCell>
                                  </TableRow>
                                )}

                                {/* Expanded scorecard row for cut players (same UX as NORMAL players) */}
                                {expandedScorecard?.startsWith(`${cp.playerId}-`) && (
                                  scorecardLoading ? (
                                    <TableRow className="bg-white hover:bg-white">
                                      <TableCell colSpan={totalCols} className="text-center py-6 text-muted-foreground">
                                        Cargando tarjeta...
                                      </TableCell>
                                    </TableRow>
                                  ) : scorecardData ? (
                                    <ScorecardRow
                                      scorecard={scorecardData}
                                      playerName={cp.name}
                                      roundLabel={`Ronda ${expandedScorecard.split('-').pop()}`}
                                      onClose={() => { setExpandedScorecard(null); setScorecardData(null); }}
                                      colSpan={totalCols}
                                    />
                                  ) : null
                                )}
                                </Fragment>
                                );
                              })}
                            </>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );

  /** Embedded mode: host page (e.g. /historial) provides Layout + hero. */
  if (embedded) return body;

  return (
    <Layout>
      <PageHero
        title="Resultados"
        subtitle="Consulta los resultados de cada ronda y clasificación general"
        backgroundImage={resultadosHero}
      />
      {body}
    </Layout>
  );
};

export default Resultados;
