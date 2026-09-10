/**
 * Salidas Page
 * Displays tee times organized by day → category → groups
 * Includes player search across all days/categories
 * Data fetched from salidas.php and salidas_det.php via React Query hooks
 */

import Layout from '@/components/layout/Layout';
import PageHero from '@/components/shared/PageHero';
import PlayerSearchInput from '@/components/shared/PlayerSearchInput';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Calendar, Loader2, Search, Users } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useSalidasMaster, useSalidasDetail } from '@/hooks/useSalidasData';
import type { SalidasDay, SalidasCategory, SalidasDetailResponse, SalidasGroup } from '@/hooks/useSalidasData';
import { apiFetch } from '@/lib/apiClient';
import { getSalidasDayUrl, POLL_ACTIVE } from '@/config/api';
import { ApiError } from '@/lib/apiClient';
import { normalizeSearchText, buildUniqueNameSuggestions } from '@/lib/searchUtils';

import salidasHero from '@/assets/salidas-hero.jpg';

// ============= Render helpers =============

/**
 * Calcula el total de renglones que ocupará un grupo en la tabla.
 * En PAREJAS cada jugador con `partner` ocupa 2 renglones (uno por integrante);
 * en INDIVIDUAL cada jugador ocupa 1. Se usa para los `rowSpan` de las columnas
 * compartidas (Hoyo / Hora) de un mismo grupo de salida.
 */
const countGroupRows = (players: SalidasGroup['players']): number =>
  (players ?? []).reduce((acc, p) => acc + (p.partner ? 2 : 1), 0);

/**
 * Detecta si un conjunto de jugadores corresponde a categoría de PAREJAS.
 * Se usa para decidir si la tabla muestra la columna "Equipo" (código de
 * grupo/pareja, p.ej. C05) y para ajustar el colSpan del footer.
 */
const hasAnyPair = (players: SalidasGroup['players']): boolean =>
  (players ?? []).some((p) => !!p.partner);

const groupsHaveAnyPair = (groups: SalidasGroup[] | undefined): boolean =>
  (groups ?? []).some((g) => hasAnyPair(g.players ?? []));

/**
 * EQUIPOS: la salida se arma por equipo, pero cada integrante sale desde el tee
 * que le corresponde según su handicap. El API entrega `members` por equipo.
 */
const hasTeamMembers = (players: SalidasGroup['players']): boolean =>
  (players ?? []).some((p) => (p.members?.length ?? 0) > 0);

const groupsHaveTeamMembers = (groups: SalidasGroup[] | undefined): boolean =>
  (groups ?? []).some((g) => hasTeamMembers(g.players ?? []));

/** Renglones que ocupa un grupo en modo EQUIPOS: 1 por equipo + 1 por integrante. */
const countGroupRowsTeam = (players: SalidasGroup['players']): number =>
  (players ?? []).reduce((acc, p) => acc + 1 + (p.members?.length ?? 0), 0);

/** Bolita con el color del tee de salida del jugador + abreviatura del tee. */
const TeeDot = ({ tee, bgColor, color }: { tee?: string; bgColor?: string; color?: string }) => (
  <span className="inline-flex items-center gap-1.5 align-middle">
    <span
      className="inline-block rounded-full border border-border"
      style={{ width: '0.7rem', height: '0.7rem', backgroundColor: bgColor || 'transparent' }}
      aria-hidden
    />
    {tee ? (
      <span
        className="text-[0.7rem] font-semibold px-1 rounded"
        style={{ backgroundColor: bgColor || 'transparent', color: color || 'inherit' }}
      >
        {tee}
      </span>
    ) : null}
  </span>
);

/** Detecta MATCH PLAY a partir del nombre del sistema de juego. */
const isMatchPlaySystem = (system?: string): boolean =>
  !!system && /match\s*play/i.test(system);

/** Convierte la posición/siembra enviada por la BD a un entero utilizable. */
const numericMatchPosition = (position: SalidasGroup['players'][number]['position']): number | null => {
  const parsed = Number.parseInt(String(position ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Obtiene la llave del enfrentamiento a partir de la siembra.
 * Ejemplo en cuadro de 32: 1–32 comparten llave 1 y 16–17 comparten llave 16.
 * Sirve como respaldo mientras un endpoint anterior todavía no envía matchNo.
 */
const inferredMatchKeys = (players: SalidasGroup['players']): Map<number, number> | null => {
  const positions = players.map((player) => numericMatchPosition(player.position));
  if (positions.some((position) => position === null)) return null;
  const highestPosition = Math.max(...positions.map((position) => position ?? 0));
  if (highestPosition <= 0) return null;
  const bracketSize = 2 ** Math.ceil(Math.log2(highestPosition));
  const keys = new Map<number, number>();
  positions.forEach((position, index) => {
    if (position !== null) keys.set(index, Math.min(position, bracketSize + 1 - position));
  });
  return keys;
};

/**
 * MATCH PLAY — ordena los jugadores de un grupo (hora de salida) por número de
 * match y, dentro del match, por lado (jugida = 1, jugidb = 2). Si el API aún
 * no entrega `matchNo`, se conserva el orden generado tal cual.
 */
const sortByMatch = (
  players: SalidasGroup['players'],
  matchPlay = false
): SalidasGroup['players'] => {
  const list = players ?? [];
  if (!matchPlay) return list;
  const hasCompleteMatchNumbers = list.length > 0 && list.every((player) => player.matchNo != null);
  if (hasCompleteMatchNumbers) {
    return [...list].sort((a, b) => {
      const ma = a.matchNo ?? Number.MAX_SAFE_INTEGER;
      const mb = b.matchNo ?? Number.MAX_SAFE_INTEGER;
      if (ma !== mb) return ma - mb;
      return (a.matchSide ?? 0) - (b.matchSide ?? 0);
    });
  }

  const inferredKeys = inferredMatchKeys(list);
  if (!inferredKeys) return list;
  return list
    .map((player, originalIndex) => ({ player, originalIndex }))
    .sort((a, b) => {
      const keyDifference = (inferredKeys.get(a.originalIndex) ?? Number.MAX_SAFE_INTEGER)
        - (inferredKeys.get(b.originalIndex) ?? Number.MAX_SAFE_INTEGER);
      if (keyDifference !== 0) return keyDifference;
      return (numericMatchPosition(a.player.position) ?? Number.MAX_SAFE_INTEGER)
        - (numericMatchPosition(b.player.position) ?? Number.MAX_SAFE_INTEGER);
    })
    .map(({ player }) => player);
};

/**
 * MATCH PLAY — índices de jugador después de los cuales se inserta la línea
 * divisoria clara y delgada que separa UN MATCH DEL SIGUIENTE.
 *  - Con `matchNo`: se divide cuando cambia el número de match.
 *  - Sin `matchNo` (endpoint viejo): se divide cada 2 jugadores.
 */
const vsAfterIndexes = (
  players: SalidasGroup['players'],
  matchPlay = false
): Set<number> => {
  const set = new Set<number>();
  const list = players ?? [];
  const hasCompleteMatchNumbers = list.length > 0 && list.every((player) => player.matchNo != null);
  const inferredKeys = hasCompleteMatchNumbers ? null : inferredMatchKeys(list);
  list.forEach((p, i) => {
    const next = list[i + 1];
    if (!next) return;
    if (hasCompleteMatchNumbers) {
      if (next.matchNo !== p.matchNo) set.add(i);
    } else if (inferredKeys) {
      const currentPosition = numericMatchPosition(p.position);
      const nextPosition = numericMatchPosition(next.position);
      const highestPosition = Math.max(
        ...list.map((player) => numericMatchPosition(player.position) ?? 0),
      );
      const bracketSize = 2 ** Math.ceil(Math.log2(highestPosition));
      const currentKey = currentPosition === null ? null : Math.min(currentPosition, bracketSize + 1 - currentPosition);
      const nextKey = nextPosition === null ? null : Math.min(nextPosition, bracketSize + 1 - nextPosition);
      if (currentKey !== nextKey) set.add(i);
    } else if (matchPlay && i % 2 === 1) {
      set.add(i);
    }
  });
  return set;
};


/**
 * MATCH PLAY — índices de jugador después de los cuales se inserta el renglón
 * con la etiqueta "VS" que separa a los DOS CONTENDIENTES DEL MISMO MATCH.
 * Es el complemento de `vsAfterIndexes` (líneas entre matches distintos).
 */
const vsLabelAfterIndexes = (
  players: SalidasGroup['players'],
  matchPlay = false
): Set<number> => {
  const set = new Set<number>();
  if (!matchPlay) return set;
  const list = players ?? [];
  const dividers = vsAfterIndexes(list, matchPlay);
  list.forEach((_p, i) => {
    if (!list[i + 1]) return;
    if (!dividers.has(i)) set.add(i);
  });
  return set;
};

/**
 * Total de renglones de un grupo incluyendo los separadores de MATCH PLAY
 * (líneas entre matches y renglones "VS" dentro de cada match).
 * Se usa para el `rowSpan` de las columnas Hoyo / Hora.
 */
const countGroupRowsWithVs = (
  players: SalidasGroup['players'],
  matchPlay = false
): number =>
  countGroupRows(players)
  + vsAfterIndexes(players, matchPlay).size
  + vsLabelAfterIndexes(players, matchPlay).size;




// ============= Search Result Type =============

/** Represents a player search match with full group context */
interface SearchResult {
  /** Day display label */
  dayLabel: string;
  /** Course name */
  course: string;
  /** Category name */
  categoryName: string;
  /** Scoring system (e.g. Medal Play, Stableford) */
  system: string;
  /** Tee assignment */
  tee: string;
  /** The full group containing the matched player */
  group: SalidasGroup;
  /** Index of matched player within the group */
  matchedPlayerIdx: number;
  /** true cuando la categoría se muestra como MATCH PLAY (VS por match). */
  matchPlay?: boolean;
}

// ============= Component =============

const Salidas = () => {
  /** Currently selected day index */
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null);
  /** Currently selected caljgoid for detail view */
  const [selectedCaljgoid, setSelectedCaljgoid] = useState<string | null>(null);
  /** Selected category metadata for header display */
  const [selectedCatMeta, setSelectedCatMeta] = useState<SalidasCategory | null>(null);
  /** Player search query */
  const [searchQuery, setSearchQuery] = useState('');
  /**
   * Whether the search results UI should take over the day-selection screen.
   * Derived from searchQuery length (no separate boolean to avoid stale state).
   */
  const normalizedQuery = normalizeSearchText(searchQuery);
  const searchActive = normalizedQuery.length >= 2;

  // Fetch master data: days + categories
  const { data: master, isLoading: loadingMaster } = useSalidasMaster();

  const days = master?.days ?? [];


  /** Collect all caljgoids across all days for search queries */
  const allCategories = useMemo(() => {
    return days.flatMap((day) =>
      day.categories.map((cat) => ({
        caljgoid: String(cat.caljgoid),
        formato: cat.format?.toLowerCase().includes('pareja') ? 'parejas' : 'individual',
        dayLabel: day.dateFormatted,
        course: day.course,
      }))
    );
  }, [days]);

  /**
   * Fetch ALL category details in parallel as soon as we know the categories.
   * We need this data both for the autocomplete suggestions AND for the
   * search results — fetching only on-demand caused inconsistent results
   * because suggestions never populated until after typing started, and
   * late-arriving fetches were ignored by the UI.
   *
   * IMPORTANT: This MUST use a different queryKey than `useSalidasDetail`
   * because it stores a WRAPPED object ({ ...cat, detail }) rather than the
   * raw SalidasDetailResponse. Sharing the key would corrupt the cache used
   * by the detail view, causing it to render with `detail.groups === undefined`.
   */
  const searchQueries = useQueries({
    queries: allCategories.length > 0
      ? allCategories.map((cat) => ({
          queryKey: ['salidas-search', cat.caljgoid, cat.formato],
          queryFn: async () => {
            const data = await apiFetch<any>(getSalidasDayUrl(cat.caljgoid, cat.formato));
            return {
              ...cat,
              detail: {
                caljgoid: data?.caljgoid ?? cat.caljgoid,
                date: data?.date ?? '',
                course: data?.course ?? cat.course,
                categoryId: data?.categoryId ?? '',
                categoryName: data?.categoryName ?? '',
                shortName: data?.shortName ?? '',
                system: data?.system ?? '',
                tee: data?.tee ?? '',
                groups: Array.isArray(data?.groups) ? data.groups : [],
              } as SalidasDetailResponse,
            };
          },
          staleTime: POLL_ACTIVE,
        }))
      : [],
  });

  /** Filter search results based on query (whitespace/accent tolerant) */
  const searchResults = useMemo<SearchResult[]>(() => {
    if (normalizedQuery.length < 2) return [];

    const results: SearchResult[] = [];
    for (const query of searchQueries) {
      if (!query.data?.detail) continue;
      const { dayLabel, course, detail } = query.data;
      for (const group of (detail.groups ?? [])) {
        const players = group.players ?? [];
        const matchIdx = players.findIndex((p) =>
          normalizeSearchText(p.name).includes(normalizedQuery)
        );
        if (matchIdx !== -1) {
          results.push({
            dayLabel,
            course,
            categoryName: detail.categoryName,
            system: detail.system,
            tee: detail.tee,
            group,
            matchedPlayerIdx: matchIdx,
            matchPlay: !!detail.isMatchPlay,
          });
        }
      }
    }
    return results;
  }, [normalizedQuery, searchQueries]);


  /**
   * Build unique player-name suggestions from already-loaded data.
   * Salidas fetches detail only when search is active, so suggestions populate
   * progressively as queries resolve.
   */
  const playerSuggestions = useMemo(() => {
    const allNames: string[] = [];
    for (const query of searchQueries) {
      if (!query.data?.detail) continue;
      for (const group of (query.data.detail.groups ?? [])) {
        for (const p of (group.players ?? [])) {
          if (p?.name) allNames.push(p.name);
        }
      }
    }
    return buildUniqueNameSuggestions(allNames);
  }, [searchQueries]);

  /**
   * True only while NO query has resolved yet. We intentionally avoid
   * `some(isLoading)` — that would block the UI even when most days have
   * already loaded, hiding partial matches the user could already see.
   */
  const searchLoading = searchActive && searchQueries.length > 0 && searchQueries.every((q) => q.isLoading);

  /** Count of failed search queries — used to surface silent fetch failures
      that would otherwise hide a player's tee time on a specific day. */
  const searchFailures = useMemo(() => {
    const failed = searchQueries.filter((q) => q.isError);
    if (failed.length > 0) {
      // Log details to console so the developer can see which day/category failed
      // eslint-disable-next-line no-console
      console.warn('[Salidas search] Some category fetches failed:', failed.map((q, i) => ({
         category: allCategories[i],
         error: q.error,
      })).filter((x) => x.error));
    }
    return failed.length;
  }, [searchQueries, allCategories]);

  /** Normalize selected format to endpoint-compatible values */
  const selectedFormato = selectedCatMeta?.format?.toLowerCase().includes('pareja') ? 'parejas' : 'individual';

  // Fetch detail for selected category
  const {
    data: rawDetail,
    isLoading: loadingDetail,
    isError: detailIsError,
    error: detailError,
  } = useSalidasDetail(selectedCaljgoid, selectedFormato);

  /** Detalle mostrado tal como lo entrega el endpoint. */
  const detail: SalidasDetailResponse | undefined = rawDetail;


  /** Currently selected day object */
  const selectedDay: SalidasDay | null = selectedDayIdx !== null ? days[selectedDayIdx] : null;

  /** Fetch group counts for all categories of the selected day (for card badges) */
  const categoryGroupQueries = useQueries({
    queries: selectedDay && !selectedCaljgoid
      ? selectedDay.categories.map((cat) => ({
          queryKey: ['salidas-group-count', String(cat.caljgoid), cat.format?.toLowerCase().includes('pareja') ? 'parejas' : 'individual'],
          queryFn: async () => {
            const fmt = cat.format?.toLowerCase().includes('pareja') ? 'parejas' : 'individual';
            const data = await apiFetch<any>(getSalidasDayUrl(String(cat.caljgoid), fmt));
            const groups = Array.isArray(data?.groups) ? data.groups : [];
            return { caljgoid: String(cat.caljgoid), groupCount: groups.length };
          },
          staleTime: POLL_ACTIVE,
        }))
      : [],
  });

  /** Map caljgoid → group count for quick lookup */
  const groupCountMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const q of categoryGroupQueries) {
      if (q.data) map[q.data.caljgoid] = q.data.groupCount;
    }
    return map;
  }, [categoryGroupQueries]);

  /** Handle day card click - if only one category, go directly to detail */
  const handleDayClick = (dayIdx: number) => {
    const day = days[dayIdx];
    if (day.categories.length === 1) {
      setSelectedDayIdx(dayIdx);
      setSelectedCaljgoid(String(day.categories[0].caljgoid));
      setSelectedCatMeta(day.categories[0]);
    } else {
      setSelectedDayIdx(dayIdx);
      setSelectedCaljgoid(null);
      setSelectedCatMeta(null);
    }
  };

  /** Handle category click */
  const handleCategoryClick = (cat: SalidasCategory) => {
    setSelectedCaljgoid(String(cat.caljgoid));
    setSelectedCatMeta(cat);
  };

  /** Handle back navigation */
  const handleBack = () => {
    if (selectedCaljgoid) {
      const day = selectedDayIdx !== null ? days[selectedDayIdx] : null;
      if (day && day.categories.length > 1) {
        setSelectedCaljgoid(null);
        setSelectedCatMeta(null);
      } else {
        setSelectedDayIdx(null);
        setSelectedCaljgoid(null);
        setSelectedCatMeta(null);
      }
    } else {
      setSelectedDayIdx(null);
    }
  };

  /** Clear search and return to normal view */
  const handleClearSearch = () => {
    setSearchQuery('');
  };

  return (
    <Layout>
      <PageHero
        title="Salidas"
        subtitle="Horarios de salida y grupos de juego"
        backgroundImage={salidasHero}
      />
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">

          {/* ============= Level 1: Day Selection ============= */}
          {selectedDayIdx === null ? (
            <>
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-foreground">
                  DÍAS DE JUEGO: <span className="text-primary">{loadingMaster ? '…' : days.length}</span>
                </h2>
              </div>

              {/* ============= Player Search Bar (with autocomplete) =============
                  Always rendered at day-selection level (mirrors Competición).
                  Visible even while master data is loading or when no days exist. */}
              <PlayerSearchInput
                className="max-w-md mx-auto mb-8"
                value={searchQuery}
                onChange={setSearchQuery}
                suggestions={playerSuggestions}
              />

              {/* ============= Search Results ============= */}
              {searchActive && searchQuery.trim().length >= 2 ? (
                <div className="max-w-5xl mx-auto">
                  {searchLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-12">
                      <Search className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                      <p className="text-muted-foreground">No se encontró ningún jugador con "{searchQuery}"</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <p className="text-sm text-muted-foreground text-center mb-4">
                        {searchResults.length} grupo{searchResults.length !== 1 ? 's' : ''} encontrado{searchResults.length !== 1 ? 's' : ''}
                      </p>
                      {searchFailures > 0 && (
                        <p className="text-sm text-destructive text-center mb-2">
                          ⚠️ {searchFailures} día(s)/categoría(s) no se pudieron cargar — algunos resultados pueden faltar. Revisa la consola.
                        </p>
                      )}
                      {searchResults.map((result, rIdx) => (
                        <Card key={rIdx} className="border-border/50 bg-white">
                          <CardContent className="p-0 bg-white">
                            {/* Result context header */}
                            <div className="bg-muted/50 px-4 py-2 border-b border-border/30 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                              <span className="font-semibold text-foreground capitalize">{result.dayLabel}</span>
                              <span className="text-muted-foreground">{result.course}</span>
                              <span className="text-primary font-medium">{result.categoryName}</span>
                              <span className="text-muted-foreground">{result.system} · Tee: {result.tee}</span>
                            </div>
                            {/* Group table */}
                            <div className="overflow-x-auto bg-white">
                              <Table className="bg-white tournament-table">
                                <TableHeader>
                                  <TableRow className="bg-primary hover:bg-primary">
                                    <TableHead className="text-primary-foreground font-bold text-center w-20">Hoyo</TableHead>
                                    <TableHead className="text-primary-foreground font-bold text-center w-20">Hora</TableHead>
                                    {hasAnyPair(result.group.players ?? []) && (
                                      <TableHead className="text-primary-foreground font-bold text-center w-20">Equipo</TableHead>
                                    )}
                                    <TableHead className="text-primary-foreground font-bold text-center w-16">Club</TableHead>
                                    <TableHead className="text-primary-foreground font-bold">Jugador</TableHead>
                                    {/* MATCH PLAY: la columna Score no aplica en enfrentamientos. */}
                                    {!(!!result.matchPlay || isMatchPlaySystem(result.system)) && (
                                      <TableHead className="text-primary-foreground font-bold text-center w-20">Score</TableHead>
                                    )}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(() => {
                                    /* En PAREJAS cada jugador se renderiza como 2 renglones (uno por integrante)
                                     * y la celda de Score abarca ambos con rowSpan=2 para quedar centrada. */
                                    const matchPlay = !!result.matchPlay || isMatchPlaySystem(result.system);
                                    /* MATCH PLAY: ordenar por número de match y lado. */
                                    const players = sortByMatch(result.group.players ?? [], matchPlay);
                                    /* MATCH PLAY: línea divisoria entre un match y el siguiente. */
                                    const vsIdx = vsAfterIndexes(players, matchPlay);
                                    /* MATCH PLAY: renglón "VS" entre los dos contendientes del match. */
                                    const vsLabelIdx = vsLabelAfterIndexes(players, matchPlay);
                                    const totalRows = countGroupRowsWithVs(players, matchPlay);
                                    const showTeam = hasAnyPair(players);
                                    const lineCols = showTeam ? 5 : 4;
                                    let firstRowEmitted = false;
                                    const rows: JSX.Element[] = [];

                                    players.forEach((player, pIdx) => {
                                      const isPair = !!player.partner;
                                      const isMatched = pIdx === result.matchedPlayerIdx;
                                      const renderHoleHora = !firstRowEmitted;
                                      firstRowEmitted = true;
                                      // ----- Renglón principal (jugador 1) -----
                                      rows.push(
                                        <TableRow
                                          key={`${pIdx}-a`}
                                          /* `border-b-0` en MATCH PLAY y en el primer renglón de una pareja
                                           * para que no aparezca una línea entre contendientes del mismo match/equipo. */
                                          className={`bg-white hover:bg-white ${isMatched ? 'bg-primary/5 hover:bg-primary/5' : ''} ${(matchPlay || isPair) ? 'border-b-0' : ''}`}
                                        >
                                          {renderHoleHora ? (
                                            <>
                                              <TableCell className="text-center font-bold text-base text-foreground" rowSpan={totalRows}>
                                                {result.group.tee}
                                              </TableCell>
                                              <TableCell className="text-center font-bold text-base text-foreground" rowSpan={totalRows}>
                                                {result.group.time}
                                              </TableCell>
                                            </>
                                          ) : null}
                                          {showTeam && (
                                            /* Código de pareja/equipo (p.ej. C05). Abarca ambos renglones
                                             * de la pareja con rowSpan=2 para que se centre verticalmente. */
                                            <TableCell className="text-center font-bold text-foreground align-middle" rowSpan={isPair ? 2 : 1}>
                                              {player.groupId || '—'}
                                            </TableCell>
                                          )}
                                          <TableCell className="p-1 text-center align-middle">
                                            {player.clubLogo ? (
                                              <img src={player.clubLogo} alt="Club" className="w-auto object-contain rounded inline-block" style={{ height: '2.1375rem' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                            ) : (<span className="text-xs text-muted-foreground">—</span>)}
                                          </TableCell>
                                          <TableCell className={`font-medium player-name-cell ${isMatched ? 'text-primary font-bold' : 'text-foreground'}`}>
                                            {/* Recorte a 4 renglones en móvil (.player-name-clamp).
                                              * MATCH PLAY: prefijo con la posición del jugador en su grupo. */}
                                            <span className="player-name-clamp">
                                              {matchPlay && player.position != null && player.position !== ''
                                                ? `${player.position} ${player.name}`
                                                : player.name}
                                            </span>
                                          </TableCell>
                                          {/* Score: en parejas se centra entre los dos renglones (rowSpan=2).
                                            * En MATCH PLAY la columna se omite por completo. */}
                                          {!matchPlay && (
                                            <TableCell className="text-center font-bold text-primary align-middle" rowSpan={isPair ? 2 : 1}>
                                              {player.score || '—'}
                                            </TableCell>
                                          )}
                                        </TableRow>
                                      );
                                      // ----- Renglón secundario (jugador 2) si es pareja -----
                                      if (isPair) {
                                        rows.push(
                                          <TableRow
                                            key={`${pIdx}-b`}
                                            className={`bg-white hover:bg-white ${isMatched ? 'bg-primary/5 hover:bg-primary/5' : ''} ${matchPlay ? 'border-b-0' : ''}`}
                                          >
                                            <TableCell className="p-1 text-center align-middle">
                                              {player.clubLogo2 ? (
                                                <img src={player.clubLogo2} alt="Club" className="w-auto object-contain rounded inline-block" style={{ height: '2.1375rem' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                              ) : (<span className="text-xs text-muted-foreground">—</span>)}
                                            </TableCell>
                                            <TableCell className={`font-medium player-name-cell ${isMatched ? 'text-primary font-bold' : 'text-foreground'}`}>
                                              <span className="player-name-clamp">{player.partner}</span>
                                            </TableCell>
                                          </TableRow>
                                        );
                                      }
                                      // ----- Renglón "VS" entre los dos contendientes del mismo match -----
                                      if (vsLabelIdx.has(pIdx)) {
                                        rows.push(
                                          <TableRow key={`${pIdx}-vslabel`} className="bg-white hover:bg-white border-b-0">
                                            <TableCell colSpan={showTeam ? 2 : 1} className="p-0" />
                                            <TableCell className="py-0 font-semibold text-muted-foreground">VS</TableCell>
                                          </TableRow>
                                        );
                                      }
                                      // ----- Línea divisoria delgada entre matches dentro del mismo horario -----
                                      if (vsIdx.has(pIdx)) {
                                        rows.push(
                                          <TableRow key={`${pIdx}-vs`} className="bg-white hover:bg-white border-none">
                                            <TableCell colSpan={lineCols} className="p-0">
                                              <div className="border-b border-primary/20" />
                                            </TableCell>
                                          </TableRow>
                                        );
                                      }
                                    });

                                    return rows;
                                  })()}
                                </TableBody>
                                {/* Footer with category name */}
                                <tfoot>
                                  <tr className="bg-primary">
                                    <td
                                      colSpan={(hasAnyPair(result.group.players ?? []) ? 6 : 5) - ((!!result.matchPlay || isMatchPlaySystem(result.system)) ? 1 : 0)}
                                      className="text-primary-foreground font-bold text-center py-2 text-sm"
                                    >
                                      CATEGORÍA: {result.categoryName}
                                    </td>
                                  </tr>
                                </tfoot>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* ============= Day Cards Grid ============= */
                <>
                  {loadingMaster ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : days.length === 0 ? (
                    <div className="text-center py-16">
                      <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                      <p className="text-muted-foreground text-lg">No hay salidas disponibles</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                      {days.map((day, idx) => (
                        <Card
                          key={idx}
                          className="border-border/50 hover:border-primary/50 transition-all hover:shadow-lg cursor-pointer"
                          onClick={() => handleDayClick(idx)}
                        >
                          <CardContent className="p-6 text-center">
                            <Calendar className="h-8 w-8 mx-auto mb-3 text-primary" />
                            <h3 className="font-bold text-foreground text-lg mb-1 capitalize">{day.dateFormatted}</h3>
                            <p className="text-muted-foreground text-sm mb-3">{day.course}</p>
                            <div className="flex justify-center gap-4 text-sm">
                              <div>
                                <span className="text-2xl font-bold text-primary">{day.categories.length}</span>
                                <p className="text-muted-foreground">Categorías</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>

          /* ============= Level 2: Category Selection (multi-category days) ============= */
          ) : !selectedCaljgoid && selectedDay ? (
            <>
              <Button variant="ghost" onClick={handleBack} className="mb-6 gap-2 bg-primary/10 hover:bg-primary/20">
                <ArrowLeft className="h-4 w-4" />
                Volver a días
              </Button>

              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-foreground mb-2 capitalize">{selectedDay.dateFormatted}</h2>
                <p className="text-muted-foreground">{selectedDay.course}</p>
                <p className="text-muted-foreground mt-1">Selecciona una categoría</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
                {selectedDay.categories.map((cat) => (
                  <Card
                    key={cat.caljgoid}
                    className="border-border/50 hover:border-primary/50 transition-all hover:shadow-lg cursor-pointer"
                    onClick={() => handleCategoryClick(cat)}
                  >
                    <CardContent className="p-5 text-center">
                      <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
                      <h3 className="font-bold text-foreground text-lg mb-1">{cat.shortName || cat.categoryName}</h3>
                      <p className="text-xs text-muted-foreground mb-2">{cat.tee}</p>
                      {/* Group count badge */}
                      {groupCountMap[String(cat.caljgoid)] !== undefined ? (
                        <p className="text-sm text-muted-foreground">
                          <span className="text-lg font-bold text-primary">{groupCountMap[String(cat.caljgoid)]}</span> grupo{groupCountMap[String(cat.caljgoid)] !== 1 ? 's' : ''}
                        </p>
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>

          /* ============= Level 3: Groups Table ============= */
          ) : (
            <>
              <Button variant="ghost" onClick={handleBack} className="mb-6 gap-2 bg-primary/10 hover:bg-primary/20">
                <ArrowLeft className="h-4 w-4" />
                {selectedDay && selectedDay.categories.length > 1 ? 'Volver a categorías' : 'Volver a días'}
              </Button>

              {loadingDetail ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : detail ? (
                <>
                  {/* Header: left-aligned on mobile, centered on desktop */}
                  <div className="mb-8 text-left md:text-center">
                    <h2 className="text-3xl font-bold text-foreground mb-1">
                      {detail.categoryName}
                    </h2>
                    <p className="text-muted-foreground text-lg">{detail.course}</p>
                    <p className="text-muted-foreground text-lg">{selectedDay?.dateFormatted}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {detail.system} · Tee: {detail.tee} · {(detail.groups ?? []).length} grupos
                    </p>
                  </div>

                  {(detail.groups ?? []).length === 0 ? (
                    <div className="text-center py-16">
                      <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                      <p className="text-muted-foreground text-lg">No hay grupos de salida para esta categoría</p>
                    </div>
                  ) : (
                    <Card className="border-border/50 bg-white max-w-5xl mx-auto">
                      <CardContent className="p-0 bg-white">
                        <div className="overflow-x-auto bg-white">
                          <Table className="bg-white tournament-table">
                            <TableHeader>
                              <TableRow className="bg-primary hover:bg-primary">
                                <TableHead className="text-primary-foreground font-bold text-center w-20">Hoyo</TableHead>
                                <TableHead className="text-primary-foreground font-bold text-center w-20">Hora</TableHead>
                                {groupsHaveAnyPair(detail.groups) && (
                                  <TableHead className="text-primary-foreground font-bold text-center w-20">Equipo</TableHead>
                                )}
                                <TableHead className="text-primary-foreground font-bold text-center w-16">Club</TableHead>
                                <TableHead className="text-primary-foreground font-bold">Jugador</TableHead>
                                {/* MATCH PLAY: sin columna Score (no aplica en enfrentamientos). */}
                                {!(!!detail.isMatchPlay || isMatchPlaySystem(detail.system)) && (
                                  <TableHead className="text-primary-foreground font-bold text-center w-20">Score</TableHead>
                                )}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(detail.groups ?? []).map((group, gIdx) => {
                                /* Igual que el bloque de búsqueda: parejas → 2 renglones por jugador.
                                 * Hoyo/Hora abarcan TODOS los renglones del grupo;
                                 * Score abarca los 2 renglones de cada pareja. */
                                const matchPlay = !!detail.isMatchPlay || isMatchPlaySystem(detail.system);
                                /* MATCH PLAY: ordenar por número de match y lado dentro del horario. */
                                const players = sortByMatch(group.players ?? [], matchPlay);
                                /* MATCH PLAY: línea divisoria entre un match y el siguiente. */
                                const vsIdx = vsAfterIndexes(players, matchPlay);
                                /* MATCH PLAY: renglón "VS" entre los dos contendientes del match. */
                                const vsLabelIdx = vsLabelAfterIndexes(players, matchPlay);
                                const totalRows = countGroupRowsWithVs(players, matchPlay);
                                const showTeam = groupsHaveAnyPair(detail.groups);
                                const lineCols = showTeam ? 5 : 4;
                                const totalCols = lineCols + (!matchPlay ? 1 : 0);
                                const isLastGroup = gIdx >= (detail.groups ?? []).length - 1;
                                let firstRowEmitted = false;
                                const rows: JSX.Element[] = [];

                                players.forEach((player, pIdx) => {
                                  const isPair = !!player.partner;
                                  const renderHoleHora = !firstRowEmitted;
                                  firstRowEmitted = true;

                                    // ----- Renglón principal -----
                                    rows.push(
                                      <TableRow
                                        key={`${group.id}-${pIdx}-a`}
                                         /* `border-b-0` en MATCH PLAY y cuando es pareja: oculta la línea
                                          * divisoria por defecto entre contendientes del mismo match/equipo. */
                                         className={`bg-white hover:bg-white ${(matchPlay || isPair) ? 'border-b-0' : ''}`}
                                      >
                                      {renderHoleHora ? (
                                        <>
                                          <TableCell className="text-center font-bold text-base text-foreground" rowSpan={totalRows}>
                                            {group.tee}
                                          </TableCell>
                                          <TableCell className="text-center font-bold text-base text-foreground" rowSpan={totalRows}>
                                            {group.time}
                                          </TableCell>
                                        </>
                                      ) : null}
                                      {showTeam && (
                                        /* Columna "Equipo": código de pareja/grupo (p.ej. C05).
                                         * rowSpan=2 cuando hay pareja para centrar verticalmente. */
                                        <TableCell className="text-center font-bold text-foreground align-middle" rowSpan={isPair ? 2 : 1}>
                                          {player.groupId || '—'}
                                        </TableCell>
                                      )}
                                      <TableCell className="p-1 text-center align-middle">
                                        {player.clubLogo ? (
                                          <img src={player.clubLogo} alt="Club" className="w-auto object-contain rounded inline-block" style={{ height: '2.1375rem' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                        ) : (<span className="text-xs text-muted-foreground">—</span>)}
                                      </TableCell>
                                       <TableCell className="font-medium text-foreground player-name-cell">
                                         {/* MATCH PLAY: se antepone la posición del jugador en su grupo. */}
                                         <span className="player-name-clamp">
                                           {matchPlay && player.position != null && player.position !== ''
                                             ? `${player.position} ${player.name}`
                                             : player.name}
                                         </span>
                                       </TableCell>
                                      {/* En MATCH PLAY se omite la celda de Score. */}
                                      {!matchPlay && (
                                        <TableCell className="text-center font-bold text-primary align-middle" rowSpan={isPair ? 2 : 1}>
                                          {player.score || '—'}
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  );
                                  // ----- Renglón secundario (segundo integrante de la pareja) -----
                                  if (isPair) {
                                    rows.push(
                                      <TableRow key={`${group.id}-${pIdx}-b`} className={`bg-white hover:bg-white ${matchPlay ? 'border-b-0' : ''}`}>
                                        <TableCell className="p-1 text-center align-middle">
                                          {player.clubLogo2 ? (
                                            <img src={player.clubLogo2} alt="Club" className="w-auto object-contain rounded inline-block" style={{ height: '2.1375rem' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                          ) : (<span className="text-xs text-muted-foreground">—</span>)}
                                        </TableCell>
                                        <TableCell className="font-medium text-foreground player-name-cell">
                                          <span className="player-name-clamp">{player.partner}</span>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  }
                                  // ----- Renglón "VS" entre los dos contendientes del mismo match -----
                                  if (vsLabelIdx.has(pIdx)) {
                                    rows.push(
                                      <TableRow key={`${group.id}-${pIdx}-vslabel`} className="bg-white hover:bg-white border-b-0">
                                        <TableCell colSpan={showTeam ? 2 : 1} className="p-0" />
                                        <TableCell className="py-0 font-semibold text-muted-foreground">VS</TableCell>
                                      </TableRow>
                                    );
                                  }
                                  // ----- Línea divisoria delgada entre matches dentro del mismo horario -----
                                  if (vsIdx.has(pIdx)) {
                                    rows.push(
                                      <TableRow key={`${group.id}-${pIdx}-vs`} className="bg-white hover:bg-white border-none">
                                        <TableCell colSpan={lineCols} className="p-0">
                                          <div className="border-b border-primary/20" />
                                        </TableCell>
                                      </TableRow>
                                    );
                                  }
                                });

                                // ----- Línea divisoria entre grupos de salida (diferente hora) -----
                                if (!isLastGroup) {
                                  rows.push(
                                    <TableRow key={`${group.id}-sep`} className="bg-white hover:bg-white border-none">
                                      <TableCell colSpan={totalCols} className="p-0">
                                        <div className="border-b-2 border-primary/30" />
                                      </TableCell>
                                    </TableRow>
                                  );
                                }

                                return rows;
                              })}
                            </TableBody>
                            {/* Footer row repeating category name */}
                            <tfoot>
                              <tr className="bg-primary">
                                <td
                                  colSpan={(groupsHaveAnyPair(detail.groups) ? 6 : 5) - ((!!detail.isMatchPlay || isMatchPlaySystem(detail.system)) ? 1 : 0)}
                                  className="text-primary-foreground font-bold text-center py-2 text-sm"
                                >
                                  CATEGORÍA: {detail.categoryName}
                                </td>
                              </tr>
                            </tfoot>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : detailIsError ? (
                <div className="text-center py-16">
                  <p className="text-muted-foreground mb-2">Error al cargar los datos</p>
                  <p className="text-xs text-muted-foreground break-all">
                    {detailError instanceof ApiError
                      ? `${detailError.status} · ${detailError.message}`
                      : 'Error desconocido'}
                  </p>
                  {detailError instanceof ApiError && detailError.endpoint.includes('debug=1') ? (
                    <pre className="mt-4 text-left text-[11px] leading-5 text-muted-foreground bg-muted p-3 rounded-md overflow-auto max-w-4xl mx-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(
                        (detailError.responseData as { _debug?: unknown; _debug_queries?: unknown })?._debug ??
                          (detailError.responseData as { _debug_queries?: unknown })?._debug_queries ??
                          detailError.responseData ??
                          detailError.responseBody ??
                          null,
                        null,
                        2
                      )}
                    </pre>
                  ) : null}
                </div>
              ) : (
                <div className="text-center py-16">
                  <p className="text-muted-foreground">Sin datos para la categoría seleccionada</p>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default Salidas;
