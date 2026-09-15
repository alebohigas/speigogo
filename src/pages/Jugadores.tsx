/**
 * Jugadores Page
 * Shows tournament categories as cards, then players table on category click
 * Includes player search across all categories (same logic as Salidas)
 * Data fetched from categories.php and players.php via React Query hooks
 */

import Layout from '@/components/layout/Layout';
import PageHero from '@/components/shared/PageHero';
import PlayerSearchInput from '@/components/shared/PlayerSearchInput';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, Users, Loader2, HelpCircle, Search } from 'lucide-react';
import jugadoresHero from '@/assets/jugadores-hero.jpg';
import { useState, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useCategories, usePlayers } from '@/hooks/usePlayersData';
import { useTournamentInfo } from '@/hooks/useTournamentData';
import { apiFetch } from '@/lib/apiClient';
import { getPlayersApiUrl, POLL_SLOW } from '@/config/api';
import { normalizeSearchText, buildUniqueNameSuggestions } from '@/lib/searchUtils';
import type { Player, CategoryDetail } from '@/data/playersData';

/** Search result with player and its category context */
interface JugadoresSearchResult {
  category: CategoryDetail;
  player: Player;
}

const Jugadores = () => {
  /** Currently selected category (null = show grid) */
  const [selectedCategory, setSelectedCategory] = useState<CategoryDetail | null>(null);
  /** Player search query */
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedQuery = normalizeSearchText(searchQuery);
  const searchActive = normalizedQuery.length >= 2;
  /** Búsqueda por nombre dentro de la categoría seleccionada (vista detalle) */
  const [detailQuery, setDetailQuery] = useState('');

  // Fetch categories from API
  const { data: categories = [], isLoading: loadingCats } = useCategories();
  const { data: tournamentInfo } = useTournamentInfo();
  /** Atlas CC (torneoid=354) pidió sustituir el contador de jugadores
   *  por la palabra "CATEGORÍAS" en el header de esta página. */
  const isAtlas354 = String(tournamentInfo?.id ?? '') === '354';

  // Fetch players for ALL categories in parallel to enable global search
  const searchQueries = useQueries({
    queries: categories.length > 0
      ? categories.map((cat) => ({
          queryKey: ['jugadores-search', cat.id],
          queryFn: async () => {
            const data = await apiFetch<{
              players: {
                id: string;
                numjugador: string;
                jugador: string;
                logo: string;
                hi: string;
                hj: string;
                hn: string;
                grupoid?: string;
              }[];
              fechaHandicap: string;
              isParejas?: boolean;
            }>(getPlayersApiUrl(cat.id));

            const players: Player[] = (data.players || []).map((p) => ({
              id: p.id,
              clubLogo: p.logo,
              name: p.jugador,
              handicapIndex: parseFloat(p.hi) || 0,
              handicapJuego: parseFloat(p.hj) || 0,
              handicapNeto: parseFloat(p.hn) || 0,
              categoryId: cat.id,
              grupoid: (p.grupoid || '').trim(),
            }));

            return { category: cat, players };
          },
          staleTime: POLL_SLOW,
          enabled: searchActive,
        }))
      : [],
  });

  /** Unique player-name suggestions from already-loaded categories */
  const playerSuggestions = useMemo(() => {
    const allNames: string[] = [];
    for (const query of searchQueries) {
      if (!query.data?.players) continue;
      for (const p of query.data.players) {
        if (p?.name) allNames.push(p.name);
      }
    }
    return buildUniqueNameSuggestions(allNames);
  }, [searchQueries]);

  /** Filter search results across all loaded categories */
  const searchResults = useMemo<JugadoresSearchResult[]>(() => {
    if (normalizedQuery.length < 2) return [];

    const results: JugadoresSearchResult[] = [];
    for (const query of searchQueries) {
      if (!query.data?.players) continue;
      const { category, players } = query.data;
      for (const player of players) {
        if (normalizeSearchText(player.name).includes(normalizedQuery)) {
          results.push({ category, player });
        }
      }
    }
    return results;
  }, [normalizedQuery, searchQueries]);

  /** Loading only while no query has resolved yet */
  const searchLoading = searchActive && searchQueries.length > 0 && searchQueries.every((q) => q.isLoading);

  /** Count failed queries to warn about missing results */
  const searchFailures = useMemo(() => {
    return searchQueries.filter((q) => q.isError).length;
  }, [searchQueries]);

  // Fetch players only when a category is selected
  const { data: playersData, isLoading: loadingPlayers } = usePlayers(
    selectedCategory?.id ?? null,
    !!selectedCategory
  );
  const players = playersData?.players ?? [];
  const fechaHandicap = playersData?.fechaHandicap ?? '';
  /** Cuando isParejas=true mostramos cards "Grupo {grupoid}" en vez de la
   *  tabla plana. Los grupos vienen pre-armados desde el hook. */
  const isParejas = playersData?.isParejas ?? false;
  const groups = playersData?.groups ?? [];

  /** Filtro por nombre aplicado a la vista de detalle de la categoría */
  const detailNorm = normalizeSearchText(detailQuery);
  const detailSearchActive = detailNorm.length >= 2;
  const detailSuggestions = useMemo(
    () => buildUniqueNameSuggestions(players.map((p) => p.name)),
    [players]
  );
  const visiblePlayers = useMemo(
    () => (detailSearchActive ? players.filter((p) => normalizeSearchText(p.name).includes(detailNorm)) : players),
    [players, detailSearchActive, detailNorm]
  );
  const visibleGroups = useMemo(
    () =>
      detailSearchActive
        ? groups
            .map((g) => ({ ...g, players: g.players.filter((p) => normalizeSearchText(p.name).includes(detailNorm)) }))
            .filter((g) => g.players.length > 0)
        : groups,
    [groups, detailSearchActive, detailNorm]
  );

  /** Total players across all categories */
  const totalPlayers = categories.reduce((sum, cat) => sum + cat.playerCount, 0);

  /** Navigate back to category grid */
  const handleBack = () => setSelectedCategory(null);

  /** Navigate to a category from a search result */
  const handleResultClick = (category: CategoryDetail) => {
    setSelectedCategory(category);
    setSearchQuery('');
  };

  /** Clear search and return to normal grid view */
  const handleClearSearch = () => setSearchQuery('');

  return (
    <Layout>
      <PageHero
        title="Jugadores"
        subtitle="Lista completa de participantes inscritos en el torneo"
        backgroundImage={jugadoresHero}
      />
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          {!selectedCategory ? (
            <>
              {/* Total Players Header */}
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-foreground">
                  {isAtlas354 ? (
                    'CATEGORÍAS'
                  ) : (
                    <>JUGADORES: <span className="text-primary">{loadingCats ? '…' : totalPlayers}</span></>
                  )}
                </h2>
              </div>

              {/* ============= Player Search Bar (with autocomplete) =============
                  Always rendered at category-selection level (mirrors Salidas).
                  Visible even while master data is loading or when no categories exist. */}
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
                        {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} encontrado{searchResults.length !== 1 ? 's' : ''}
                      </p>
                      {searchFailures > 0 && (
                        <p className="text-sm text-destructive text-center mb-2">
                          ⚠️ {searchFailures} categoría(s) no se pudieron cargar — algunos resultados pueden faltar. Revisa la consola.
                        </p>
                      )}
                      {searchResults.map((result, rIdx) => (
                        <Card key={rIdx} className="border-border/50 bg-white">
                          <CardContent className="p-0 bg-white">
                            {/* Result context header */}
                            <div className="bg-muted/50 px-4 py-2 border-b border-border/30 flex flex-wrap gap-x-4 gap-y-1 text-sm items-center justify-between">
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                <span className="font-semibold text-foreground">{result.category.name}</span>
                                <span className="text-primary font-medium">{result.category.shortName}</span>
                                <span className="text-muted-foreground">{result.category.system}</span>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleResultClick(result.category)}
                                className="text-primary hover:text-primary hover:bg-primary/10"
                              >
                                Ver categoría
                              </Button>
                            </div>
                            {/* Player table */}
                            <div className="overflow-x-auto bg-white">
                              <Table className="bg-white tournament-table">
                                <TableHeader>
                                  <TableRow className="bg-primary hover:bg-primary">
                                    <TableHead className="text-primary-foreground font-bold text-center">Club</TableHead>
                                    <TableHead className="text-primary-foreground font-bold">Jugador</TableHead>
                                    <TableHead className="text-primary-foreground font-bold text-center">HI</TableHead>
                                    <TableHead className="text-primary-foreground font-bold text-center">HJ</TableHead>
                                    <TableHead className="text-primary-foreground font-bold text-center">HN</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  <TableRow className="bg-white hover:bg-white">
                                    <TableCell className="p-1 text-center align-middle">
                                      <img
                                        src={result.player.clubLogo}
                                        alt="Club logo"
                                        className="w-auto object-contain rounded inline-block"
                                        style={{ height: '2.1375rem' }}
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="%23166534" rx="4"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="9" font-family="sans-serif">Club</text></svg>')}`;
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell className="player-name-cell"><span className="player-name-clamp">{result.player.name}</span></TableCell>
                                    <TableCell className="text-center">{result.player.handicapIndex.toFixed(1)}</TableCell>
                                    <TableCell className="text-center">{result.player.handicapJuego}</TableCell>
                                    <TableCell className="text-center font-extrabold text-base text-primary">{result.player.handicapNeto}</TableCell>
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
              ) : (
                /* Loading State or Categories Grid */
                loadingCats ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  /* Categories Grid */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {categories.map((category) => (
                      <Card key={category.id} className="border-border/50 hover:border-primary/50 transition-colors">
                        <CardContent className="p-4 text-center">
                          <h3 className="font-bold text-foreground">{category.shortName}</h3>
                          <p className="text-2xl font-bold text-primary my-2">{category.playerCount}</p>
                          <Button
                            size="sm"
                            onClick={() => setSelectedCategory(category)}
                            className="w-full"
                          >
                            Ver
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )
              )}
            </>
          ) : (
            <>
              {/* Category Detail View */}
              <Button
                variant="ghost"
                onClick={handleBack}
                className="mb-6 gap-2 bg-primary/10 hover:bg-primary/20"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a categorías
              </Button>

              {/* Category Info Header */}
              {/* Category Info Header with tee, rating, slope, par details */}
              {/* Category Info Header - centered */}
              <div className="mb-8 text-left md:text-center">
                <h2 className="text-2xl font-light text-foreground mb-2">
                  Categoría: <span className="font-bold">{selectedCategory.name}</span>
                </h2>
                <div className="text-muted-foreground space-y-1">
                  {/* Todas las filas se renderizan SIEMPRE; cuando el dato no
                      existe en la BD se muestra un guion largo para que la
                      ficha de categoría nunca aparezca incompleta. */}
                  <p><span className="font-bold text-foreground">Tee Salida:</span> {selectedCategory.teeName || selectedCategory.teeColorName || selectedCategory.teeColor || '—'}</p>
                  <p>
                    <span className="font-bold text-foreground">Rating:</span> {selectedCategory.rating != null ? selectedCategory.rating : '—'}{' '}
                    <span className="font-bold text-foreground">Slope:</span> {selectedCategory.slope != null ? selectedCategory.slope : '—'}{' '}
                    <span className="font-bold text-foreground">Par:</span> {selectedCategory.par != null ? selectedCategory.par : '—'}
                  </p>
                  <p><span className="font-bold text-foreground">Sistema:</span> {selectedCategory.system || '—'}</p>
                  <p><span className="font-bold text-foreground">Rango Handicaps:</span> {selectedCategory.hcpMin} - {selectedCategory.hcpMax}</p>
                  {/* Día Handicap: shown between Rango and Porcentaje. Displays formatted date or em-dash when no fechahandicap is set */}
                  <p>
                    <span className="font-bold text-foreground">Día Handicap:</span>{' '}
                    {fechaHandicap
                      ? (() => {
                          const [y, m, d] = fechaHandicap.split('-').map(Number);
                          const date = new Date(y, m - 1, d);
                          return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
                        })()
                      : '—'}
                  </p>
                  <p><span className="font-bold text-foreground">Porcentaje Handicap:</span> {selectedCategory.percentage}%</p>
                  <p><span className="font-bold text-foreground">Total jugadores:</span>{' '}
                    <span className="text-primary font-bold">{selectedCategory.playerCount}</span>
                  </p>
                </div>
              </div>

              {/* Players Table - full width, centered */}
              <Card className="border-border/50 bg-white w-full max-w-4xl mx-auto">
                <div className="overflow-x-auto bg-white">
                  {loadingPlayers ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : isParejas ? (
                    /* ============ Vista de parejas: una tabla por grupo ============ */
                    <div className="p-4 space-y-6 bg-white">
                      {groups.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          No hay parejas registradas en esta categoría
                        </div>
                      ) : (
                        groups.map((g) => (
                          <div key={g.grupoid} className="border border-border/50 rounded-lg overflow-hidden">
                            <div className="bg-primary/10 px-4 py-2 flex items-center justify-between">
                              <span className="font-bold text-foreground">Grupo {g.grupoid}</span>
                              <span className="text-xs text-muted-foreground">
                                HCP Total: <span className="font-bold text-primary">{g.handicapTotal}</span>
                              </span>
                            </div>
                            <Table className="bg-white tournament-table">
                              <TableHeader>
                                <TableRow className="bg-primary hover:bg-primary">
                                  <TableHead className="text-primary-foreground font-bold text-center">Club</TableHead>
                                  <TableHead className="text-primary-foreground font-bold">Jugador</TableHead>
                                  <TableHead className="text-primary-foreground font-bold text-center">HI</TableHead>
                                  <TableHead className="text-primary-foreground font-bold text-center">HJ</TableHead>
                                  <TableHead className="text-primary-foreground font-bold text-center">HN</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {g.players.map((player) => (
                                  <TableRow key={player.id} className="bg-white hover:bg-white">
                                    <TableCell className="p-1 text-center align-middle">
                                      <img
                                        src={player.clubLogo}
                                        alt="Club"
                                        className="w-auto object-contain rounded inline-block"
                                        style={{ height: '2.1375rem' }}
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="%23166534" rx="4"/></svg>')}`;
                                        }}
                                      />
                                    </TableCell>
                                    {/* Nombre recortado a 4 renglones en móvil (.player-name-clamp) */}
                                    <TableCell className="player-name-cell"><span className="player-name-clamp">{player.name}</span></TableCell>
                                    <TableCell className="text-center">{player.handicapIndex.toFixed(1)}</TableCell>
                                    <TableCell className="text-center">{player.handicapJuego}</TableCell>
                                    <TableCell className="text-center font-extrabold text-base text-primary">{player.handicapNeto}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <Table className="bg-white tournament-table">
                      <TableHeader>
                        <TableRow className="bg-primary hover:bg-primary">
                          <TableHead className="text-primary-foreground font-bold text-center">Club</TableHead>
                          <TableHead className="text-primary-foreground font-bold">Jugador</TableHead>
                          {/* HI, HJ, HN headers with help tooltips */}
                          <TableHead className="text-primary-foreground font-bold text-center">
                            {/* HI header: Popover so it works on tap (mobile) and click (desktop) */}
                            <Popover>
                              <PopoverTrigger asChild>
                                <button type="button" className="inline-flex items-center gap-1 cursor-help font-bold text-primary-foreground">
                                  HI <HelpCircle className="h-3.5 w-3.5 opacity-70" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="bottom" className="max-w-[240px] w-auto text-xs p-3">
                                <p className="font-bold mb-1">Handicap Índice</p>
                                <p>Medida portátil de la habilidad del jugador, calculada a partir de sus mejores 8 de las últimas 20 rondas.</p>
                              </PopoverContent>
                            </Popover>
                          </TableHead>
                          <TableHead className="text-primary-foreground font-bold text-center">
                            {/* HJ header: Popover for mobile tap support */}
                            <Popover>
                              <PopoverTrigger asChild>
                                <button type="button" className="inline-flex items-center gap-1 cursor-help font-bold text-primary-foreground">
                                  HJ <HelpCircle className="h-3.5 w-3.5 opacity-70" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="bottom" className="max-w-[240px] w-auto text-xs p-3">
                                <p className="font-bold mb-1">Handicap de Juego</p>
                                <p>Golpes que el jugador recibe en un campo específico, ajustado por el rating y slope del tee de salida.</p>
                              </PopoverContent>
                            </Popover>
                          </TableHead>
                          <TableHead className="text-primary-foreground font-bold text-center">
                            {/* HN header: Popover for mobile tap support */}
                            <Popover>
                              <PopoverTrigger asChild>
                                <button type="button" className="inline-flex items-center gap-1 cursor-help font-bold text-primary-foreground">
                                  HN <HelpCircle className="h-3.5 w-3.5 opacity-70" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="bottom" className="max-w-[240px] w-auto text-xs p-3">
                                <p className="font-bold mb-1">Handicap Neto</p>
                                <p>Handicap de juego ajustado por el porcentaje de la categoría, usado para calcular el score neto del torneo.</p>
                              </PopoverContent>
                            </Popover>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                       <TableBody>
                         {players.length > 0 ? (
                           players.map((player) => (
                             <TableRow key={player.id} className="bg-white hover:bg-white">
                               {/* Club Logo column */}
                               <TableCell className="p-1 text-center align-middle">
                                 <img
                                   src={player.clubLogo}
                                   alt="Club logo"
                                   className="w-auto object-contain rounded inline-block"
                                   // Height reduced 5% (2.25rem → 2.1375rem) to keep visual consistency across all tables
                                   style={{ height: '2.1375rem' }}
                                   onError={(e) => {
                                     (e.target as HTMLImageElement).src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="%23166534" rx="4"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="9" font-family="sans-serif">Club</text></svg>')}`;
                                   }}
                                 />
                               </TableCell>
                               {/* Nombre recortado a 4 renglones en móvil (.player-name-clamp) */}
                               <TableCell className="player-name-cell"><span className="player-name-clamp">{player.name}</span></TableCell>
                              {/* HI/HJ/HN values centered under their respective column headers */}
                              <TableCell className="text-center">{player.handicapIndex.toFixed(1)}</TableCell>
                              <TableCell className="text-center">{player.handicapJuego}</TableCell>
                              {/* HN is the most important stat — emphasize with primary color, bolder weight, and larger size */}
                              <TableCell className="text-center font-extrabold text-base text-primary">{player.handicapNeto}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              No hay jugadores registrados en esta categoría
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default Jugadores;
