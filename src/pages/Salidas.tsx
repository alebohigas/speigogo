/**
 * Salidas Page
 * Displays tee times organized by day → category → groups
 * Includes player search across all days/categories
 * Data fetched from salidas.php and salidas_det.php via React Query hooks
 */

import Layout from '@/components/layout/Layout';
import PageHero from '@/components/shared/PageHero';
import PlayerSearchInput from '@/components/shared/PlayerSearchInput';
import EquipoLogo from '@/components/equipos/EquipoLogo';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, Clock, Loader2, Search, Users } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useSalidasMaster, useSalidasDetail } from '@/hooks/useSalidasData';
import type { SalidasDay, SalidasCategory, SalidasDetailResponse, SalidasGroup } from '@/hooks/useSalidasData';
import { apiFetch } from '@/lib/apiClient';
import { getSalidasDayUrl, POLL_ACTIVE } from '@/config/api';
import { ApiError } from '@/lib/apiClient';
import { normalizeSearchText, buildUniqueNameSuggestions } from '@/lib/searchUtils';
import { getTorneoId } from '@/hooks/useTorneoId';

import salidasHero from '@/assets/salidas-hero.jpg';

// ============= Render helpers =============

/**
 * Helpers para MATCH PLAY: ordenar jugadores por match y separar enfrentamientos.
 */

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
 * Tarjeta de un grupo de salida — diseño idéntico al de Equipos:
 *  - Contenedor blanco con borde izquierdo de acento (border-l-primary)
 *  - Encabezado oscuro con hora (izq) y hoyo (der)
 *  - Lista de jugadores/equipos/parejas/match play
 * Se usa tanto en móvil como en escritorio/tablet.
 */
interface SalidaGroupCardProps {
  group: SalidasGroup;
  detail: SalidasDetailResponse;
  torneoId?: string;
  /** Índice del jugador resaltado en búsqueda. */
  matchedPlayerIdx?: number;
}

const SalidaGroupCard = ({ group, detail, torneoId, matchedPlayerIdx }: SalidaGroupCardProps) => {
  const matchPlay = !!detail.isMatchPlay || isMatchPlaySystem(detail.system);
  const players = sortByMatch(group.players ?? [], matchPlay);
  const vsIdx = vsAfterIndexes(players, matchPlay);
  const vsLabelIdx = vsLabelAfterIndexes(players, matchPlay);
  const hasScore = !matchPlay;

  return (
    <Card className="overflow-hidden border border-border/80 shadow-lg rounded-2xl bg-white border-l-4 border-l-primary">
      <CardContent className="p-0">
        {/* Header: Hora (izq) + Hoyo (der) */}
        <div className="flex items-center justify-between gap-3 p-4 sm:p-5 bg-report-header text-report-header-foreground border-b border-border/40">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 opacity-80" />
            <span className="text-base sm:text-lg font-semibold opacity-95">{group.time}</span>
          </div>
          <div className="font-bold text-lg sm:text-xl leading-tight">Hoyo {group.tee}</div>
        </div>

        {/* Players list */}
        <div>
          {players.map((player, pIdx) => {
            const nextPlayer = players[pIdx + 1];
            const nextIsTeam = (nextPlayer?.members?.length ?? 0) > 0;
            const isPair = !!player.partner;
            const showVs = vsLabelIdx.has(pIdx);
            const showDivider = vsIdx.has(pIdx);
            const isTeam = (player.members?.length ?? 0) > 0;
            const isMatched = pIdx === matchedPlayerIdx;

            return (
              <div
                key={`${group.id}-${pIdx}`}
                className={pIdx > 0 ? 'border-t border-border/30' : ''}
              >
                {/* Main player / team row */}
                <div className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-white ${isMatched ? 'bg-primary/5' : ''}`}>
                  {/* Logo / team logo */}
                  <div className="shrink-0 w-10 sm:w-14 flex justify-center">
                    {isTeam ? (
                      <EquipoLogo
                        grupoid={player.groupId || player.name}
                        torneoId={torneoId}
                        dbLogo={player.teamLogo}
                        className="w-auto object-contain rounded"
                        style={{ height: '1.8rem' }}
                      />
                    ) : player.clubLogo ? (
                      <img
                        src={player.clubLogo}
                        alt="Club"
                        className="w-auto object-contain rounded"
                        style={{ height: '1.8rem' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <span
                      className={`block ${
                        player.members?.length ? 'font-bold text-base sm:text-lg' : 'text-sm sm:text-base'
                      } ${isMatched ? 'text-primary font-bold' : 'text-foreground'}`}
                    >
                      {isTeam
                        ? (player.groupId || player.name)
                        : matchPlay && player.position != null && player.position !== ''
                          ? `${player.position} ${player.name}`
                          : player.name}
                    </span>
                  </div>

                  {/* Score */}
                  {hasScore && (
                    <div className="shrink-0 text-right min-w-[2.5rem] sm:min-w-[3.5rem]">
                      <span className="font-extrabold text-primary text-base sm:text-lg">{player.score || '—'}</span>
                    </div>
                  )}
                </div>

                {/* Team members */}
                {isTeam && (
                  <div className="bg-muted/20 divide-y divide-border/20">
                    {player.members?.map((member, mIdx) => (
                      <div
                        key={mIdx}
                        className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 sm:pl-[4.5rem]"
                      >
                        <div className="flex-1 min-w-0 text-sm sm:text-base text-foreground">
                          {member.name}
                        </div>
                        <div className="shrink-0 text-right min-w-[2.5rem] sm:min-w-[3.5rem]">
                          <TeeDot tee={member.tee} bgColor={member.bgColor} color={member.color} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pair partner */}
                {isPair && (
                  <div className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-white ${isMatched ? 'bg-primary/5' : ''}`}>
                    <div className="shrink-0 w-10 sm:w-14 flex justify-center">
                      {player.clubLogo2 ? (
                        <img
                          src={player.clubLogo2}
                          alt="Club"
                          className="w-auto object-contain rounded"
                          style={{ height: '1.8rem' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className={`block text-sm sm:text-base ${
                          isMatched ? 'text-primary font-bold' : 'text-foreground'
                        }`}
                      >
                        {player.partner}
                      </span>
                    </div>
                  </div>
                )}

                {/* VS label for match play */}
                {showVs && (
                  <div className="py-1 text-center text-sm font-semibold text-muted-foreground bg-muted/30">
                    VS
                  </div>
                )}

                {/* Divider between matches */}
                {showDivider && (
                  <div className="px-3 sm:px-4 py-1">
                    <div className="border-b border-primary/20" />
                  </div>
                )}

                {/* Separator between two teams in the same departure group */}
                {isTeam && nextIsTeam && (
                  <div className="py-2 sm:py-3 px-3 sm:px-4">
                    <div className="border-b border-primary/20" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};


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
  const torneoId = getTorneoId();
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
  /** Búsqueda por nombre dentro de la categoría/día seleccionado (vista detalle) */
  const [detailQuery, setDetailQuery] = useState('');
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
    setDetailQuery('');
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
    setDetailQuery('');
    setSelectedCaljgoid(String(cat.caljgoid));
    setSelectedCatMeta(cat);
  };

  /** Handle back navigation */
  const handleBack = () => {
    setDetailQuery('');
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

  /** Filtro por nombre aplicado a los grupos del detalle (jugador, pareja o integrante) */
  const detailNorm = normalizeSearchText(detailQuery);
  const detailSearchActive = detailNorm.length >= 2;
  const detailSuggestions = useMemo(
    () =>
      buildUniqueNameSuggestions(
        (detail?.groups ?? []).flatMap((g) =>
          (g.players ?? []).flatMap((p) => [p.name, p.partner, ...(p.members ?? []).map((m) => m.name)])
        )
      ),
    [detail]
  );
  const filteredGroups = useMemo(() => {
    const gs = detail?.groups ?? [];
    if (!detailSearchActive) return gs;
    return gs.filter((g) =>
      (g.players ?? []).some(
        (p) =>
          normalizeSearchText(p.name).includes(detailNorm) ||
          normalizeSearchText(p.partner).includes(detailNorm) ||
          (p.members ?? []).some((m) => normalizeSearchText(m.name).includes(detailNorm))
      )
    );
  }, [detail, detailSearchActive, detailNorm]);

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
                      {searchResults.map((result, rIdx) => {
                        const searchDetail: SalidasDetailResponse = {
                          caljgoid: '',
                          date: '',
                          course: result.course,
                          categoryId: '',
                          categoryName: result.categoryName,
                          shortName: '',
                          system: result.system,
                          tee: result.tee,
                          isMatchPlay: !!result.matchPlay,
                          isEquipos: false,
                          groups: [],
                        };
                        return (
                          <div key={rIdx} className="space-y-2">
                            {/* Result context header */}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm px-1">
                              <span className="font-semibold text-foreground capitalize">{result.dayLabel}</span>
                              <span className="text-muted-foreground">{result.course}</span>
                              <span className="text-primary font-medium">{result.categoryName}</span>
                              <span className="text-muted-foreground">{result.system} · Tee: {result.tee}</span>
                            </div>
                            <SalidaGroupCard
                              group={result.group}
                              detail={searchDetail}
                              torneoId={torneoId}
                              matchedPlayerIdx={result.matchedPlayerIdx}
                            />
                          </div>
                        );
                      })}
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

          /* ============= Level 3: Groups Cards ============= */
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
                      {detail.system} · {(detail.groups ?? []).length} grupos
                    </p>
                  </div>

                  {/* Buscador por nombre dentro de la categoría */}
                  <PlayerSearchInput
                    className="max-w-md mx-auto mb-6"
                    value={detailQuery}
                    onChange={setDetailQuery}
                    suggestions={detailSuggestions}
                    placeholder="Buscar jugador en esta categoría..."
                  />

                  {(detail.groups ?? []).length === 0 ? (
                    <div className="text-center py-16">
                      <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                      <p className="text-muted-foreground text-lg">No hay grupos de salida para esta categoría</p>
                    </div>
                  ) : filteredGroups.length === 0 ? (
                    <div className="text-center py-16">
                      <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                      <p className="text-muted-foreground text-lg">No se encontró ningún jugador con "{detailQuery}" en esta categoría</p>
                    </div>
                  ) : (<>
                    <div className="space-y-8 max-w-4xl mx-auto">
                      {filteredGroups.map((group) => (
                        <SalidaGroupCard key={group.id} group={group} detail={detail} torneoId={torneoId} />
                      ))}
                    </div>
                  </>)}
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
