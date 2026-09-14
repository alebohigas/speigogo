/**
 * Equipos Page
 * Formato por equipos (AGOGO): categorías como tarjetas y, al entrar,
 * la lista de equipos con sus jugadores, H.I. y H.C.
 * Réplica del reporte legacy lista_jug3.php / jugadores3.php.
 */

import Layout from '@/components/layout/Layout';
import PageHero from '@/components/shared/PageHero';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronDown, Flag, Loader2, Users } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import jugadoresHero from '@/assets/jugadores-hero.jpg';
import { useState } from 'react';
import { useCategories } from '@/hooks/usePlayersData';
import { useEquipos } from '@/hooks/useEquiposData';
import EquipoLogo from '@/components/equipos/EquipoLogo';
import { getTorneoId } from '@/hooks/useTorneoId';
import type { CategoryDetail } from '@/data/playersData';

const Equipos = () => {
  const [selectedCategory, setSelectedCategory] = useState<CategoryDetail | null>(null);


  /** Torneo activo: los logos locales se buscan en /logos-equipos/t{id}. */
  const torneoId = getTorneoId();

  const { data: categories = [], isLoading: loadingCats } = useCategories();
  const { data, isLoading: loadingTeams } = useEquipos(selectedCategory?.id ?? null);

  const teams = data?.teams ?? [];
  const tees = data?.tees ?? [];
  const totalJugadores = data?.category.totalJugadores ?? 0;
  const totalEquipos = data?.category.totalEquipos ?? 0;
  const percentage = data?.category.percentage ?? 0;
  const hcpIndexMin = data?.tournament.hcpIndexMin ?? 0;
  const indexCampo = data?.tournament.indexCampo ?? '';
  const jugadoresEquipo = data?.tournament.jugadoresEquipo ?? 0;
  /** El torneo puede medir por Handicap de Campo (1) o por Index (2). */
  const tipoHcp = indexCampo === '1' ? 'de Campo' : 'Index';
  const minDisplay = indexCampo === '1' ? Math.round(hcpIndexMin) : hcpIndexMin.toFixed(1);

  /** ============ Leyenda moderna: tees colapsables + significado de HI / HC ============ */
  const [teesOpen, setTeesOpen] = useState(false);

  const Leyenda = () => (
    <div className="w-full max-w-4xl mx-auto mb-6 space-y-3">
      <Collapsible open={teesOpen} onOpenChange={setTeesOpen}>
        <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/70">
          <span className="flex items-center gap-2 font-semibold text-foreground">
            <Flag className="h-4 w-4 text-primary" />
            Tees de salida
            <span className="text-xs font-normal text-muted-foreground">({tees.length})</span>
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${teesOpen ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid gap-2 sm:grid-cols-2 px-1 pt-3">
            {tees.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2 text-sm"
              >
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-border/60"
                  style={{ backgroundColor: t.bgcolor || 'transparent' }}
                />
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">Tee {t.tee}</p>
                  <p className="text-xs text-muted-foreground">
                    Rating {t.rating} · Slope {t.slope} · Par {t.par}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="text-muted-foreground">
          <strong className="text-foreground">H.I.</strong> Handicap Índice ·{' '}
          <strong className="text-foreground">H.C.</strong> Handicap Campo
        </span>
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <span className="h-3.5 w-3.5 rounded-full bg-yellow-300 border border-yellow-500" />
          Fondo amarillo: handicap fuera de rango
        </span>
      </div>
    </div>
  );


  return (
    <Layout>
      <PageHero
        title="Equipos"
        subtitle="Integración de equipos por categoría con handicap índice y de campo"
        backgroundImage={jugadoresHero}
      />
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          {!selectedCategory ? (
            loadingCats ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {categories.map((category) => (
                  <Card key={category.id} className="border-border/50 hover:border-primary/50 transition-colors">
                    <CardContent className="p-4 text-center">
                      <h3 className="font-bold text-foreground">{category.shortName}</h3>
                      <p className="text-2xl font-bold text-primary my-2">{category.playerCount}</p>
                      <Button size="sm" onClick={() => setSelectedCategory(category)} className="w-full">
                        Ver
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => setSelectedCategory(null)}
                className="mb-6 gap-2 bg-primary/10 hover:bg-primary/20"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a categorías
              </Button>

              {loadingTeams ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* ============ Encabezado moderno de la categoría ============ */}
                  <div className="w-full max-w-4xl mx-auto mb-6">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Categoría</p>
                    <h2 className="text-3xl font-bold text-foreground">
                      {data?.category.name || selectedCategory.name}
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                      {[
                        { label: 'Jugadores', value: totalJugadores },
                        { label: 'Equipos', value: totalEquipos },
                        { label: `Hcp ${tipoHcp} mínimo`, value: minDisplay },
                        { label: 'Jugadores por equipo', value: jugadoresEquipo },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="rounded-lg border border-border/60 bg-card px-3 py-3 text-center"
                        >
                          <p className="text-2xl font-bold text-primary leading-none">{s.value}</p>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1">
                            {s.label}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>


                  {/* ============ Leyenda (antes de la tabla) ============ */}
                  <Leyenda />

                  {/* ============ Lista de equipos como tarjetas modernas ============ */}
                  <div className="w-full max-w-4xl mx-auto space-y-6">
                    {/* Encabezado alineado (solo desktop) */}
                    <div className="hidden sm:grid sm:grid-cols-[3.5rem_1fr_5rem_5rem] gap-3 px-4 py-2.5 text-sm font-bold text-primary-foreground bg-primary rounded-lg">
                      <div className="text-center">Equipo</div>
                      <div>Jugador</div>
                      <div className="text-center">H.I.</div>
                      <div className="text-center">H.C.</div>
                    </div>

                    {teams.length === 0 ? (
                      <Card className="border-border/50 bg-white">
                        <CardContent className="text-center text-muted-foreground py-12">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          No hay equipos registrados en esta categoría
                        </CardContent>
                      </Card>
                    ) : (
                      teams.map((team) => (
                        <Card
                          key={team.grupoid}
                          className="overflow-hidden border border-border/60 shadow-sm rounded-xl bg-white"
                        >
                          {/* Header del equipo */}
                          <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 border-b border-border/40 bg-card">
                            <div className="shrink-0 w-10 sm:w-14 flex justify-center">
                              <EquipoLogo
                                grupoid={team.grupoid}
                                torneoId={torneoId}
                                dbLogo={team.logoUrl || team.logo}
                                className="w-auto object-contain rounded inline-block"
                                style={{ height: '1.875rem' }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg sm:text-xl font-bold text-foreground truncate">
                                {team.numero ? (
                                  <>
                                    <span className="text-primary">{team.numero}</span>
                                    <span className="mx-1.5 text-muted-foreground">·</span>
                                    <span>{team.nombre}</span>
                                  </>
                                ) : (
                                  team.nombre || team.grupoid
                                )}
                              </h3>
                            </div>
                            <div
                              className={`text-lg sm:text-xl font-bold italic shrink-0 ${
                                team.fueraDeRango
                                  ? 'bg-yellow-300 text-black px-2 py-0.5 rounded'
                                  : 'text-destructive'
                              }`}
                            >
                              {team.total}
                            </div>
                          </div>

                          {/* Jugadores del equipo */}
                          <div className="divide-y divide-border/30">
                            {team.players.map((p) => (
                              <div
                                key={p.id}
                                className="grid grid-cols-4 gap-2 p-3 sm:grid-cols-[3.5rem_1fr_5rem_5rem] sm:gap-3 sm:px-4 items-center"
                              >
                                {/* Indentación desktop */}
                                <div className="hidden sm:block" />
                                {/* Nombre: 2 cols en móvil, 1 col indentada en desktop */}
                                <div className="col-span-2 sm:col-span-1 min-w-0">
                                  <span
                                    className="block max-h-[2.75rem] overflow-hidden break-words leading-[1.375rem] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] sm:max-h-none sm:overflow-visible sm:[display:block] sm:[-webkit-line-clamp:unset]"
                                    title={p.nombre}
                                  >
                                    {p.nombre}
                                  </span>
                                </div>
                                <div className="text-center whitespace-nowrap text-sm sm:text-base">
                                  {p.hi}
                                </div>
                                <div
                                  className="text-center whitespace-nowrap text-base font-bold italic"
                                  style={{
                                    backgroundColor: p.bgcolor || undefined,
                                    color: p.color || undefined,
                                  }}
                                >
                                  {p.hc}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Handicap Neto del equipo (solo si aplica porcentaje) */}
                          {percentage > 0 && team.handicapNeto !== null && (
                            <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 border-t border-border/40 bg-muted/20 text-sm sm:text-base">
                              <span className="font-semibold text-muted-foreground sm:pl-[3.5rem]">
                                Handicap Neto
                              </span>
                              <span className="text-lg font-bold text-blue-700">
                                {team.handicapNeto}
                              </span>
                            </div>
                          )}
                        </Card>
                      ))
                    )}
                  </div>

                </>
              )}
            </>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default Equipos;
