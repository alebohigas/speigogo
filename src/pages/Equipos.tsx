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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, ChevronDown, Flag, Loader2, Users } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import jugadoresHero from '@/assets/jugadores-hero.jpg';
import { Fragment, useState } from 'react';
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

                  {/* ============ Tabla de equipos ============ */}
                  <Card className="border-border/50 bg-white w-full max-w-4xl mx-auto">
                    <div className="overflow-x-auto bg-white">
                      {teams.length === 0 ? (
                        <div className="text-center text-muted-foreground py-12">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          No hay equipos registrados en esta categoría
                        </div>
                      ) : (
                        <Table className="bg-white tournament-table">
                          <TableHeader>
                            <TableRow className="bg-primary hover:bg-primary">
                              <TableHead className="text-primary-foreground font-bold text-center w-20">Equipo</TableHead>
                              <TableHead className="text-primary-foreground font-bold">Nombre</TableHead>
                              <TableHead className="text-primary-foreground font-bold text-center w-20">HI</TableHead>
                              <TableHead className="text-primary-foreground font-bold text-center w-20">HC</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {teams.map((team) => (
                              <Fragment key={team.grupoid}>
                                {/* Separador gris entre equipos */}
                                <TableRow key={`sep-${team.grupoid}`} className="hover:bg-transparent">
                                  <TableCell colSpan={4} className="p-0 h-2 bg-muted" />
                                </TableRow>
                                {/* Fila del equipo */}
                                <TableRow key={`team-${team.grupoid}`} className="bg-white hover:bg-white">
                                  <TableCell className="p-1 text-center align-middle">
                                    <EquipoLogo
                                      grupoid={team.grupoid}
                                      torneoId={torneoId}
                                      dbLogo={team.logoUrl || team.logo}
                                      className="w-auto object-contain rounded inline-block"
                                      style={{ height: '1.875rem' }}
                                    />
                                  </TableCell>
                                  <TableCell className="font-bold pl-6">
                                    {team.numero ? (
                                      <span className="flex flex-wrap items-baseline gap-2">
                                        <span className="text-primary">{team.numero}</span>
                                        <span>{team.nombre}</span>
                                      </span>
                                    ) : (
                                      team.nombre || team.grupoid
                                    )}
                                  </TableCell>
                                  <TableCell />
                                  <TableCell
                                    className={`text-center text-lg font-bold italic text-destructive ${
                                      team.fueraDeRango ? 'bg-yellow-300 text-black' : ''
                                    }`}
                                  >
                                    {team.total}
                                  </TableCell>
                                </TableRow>
                                {/* Jugadores del equipo */}
                                {team.players.map((p) => (
                                  <TableRow key={`p-${p.id}`} className="bg-white hover:bg-white">
                                    <TableCell />
                                    <TableCell className="pl-10">
                                      {/* Máximo 3 renglones en móvil; escritorio muestra completo */}
                                      <span
                                        className="block max-h-[4.125rem] overflow-hidden break-words leading-[1.375rem] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] sm:max-h-none sm:overflow-visible sm:[display:block] sm:[-webkit-line-clamp:unset]"
                                        title={p.nombre}
                                      >
                                        {p.nombre}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-center">{p.hi}</TableCell>
                                    <TableCell
                                      className="text-center text-base font-bold italic"
                                      style={{
                                        backgroundColor: p.bgcolor || undefined,
                                        color: p.color || undefined,
                                      }}
                                    >
                                      {p.hc}
                                    </TableCell>
                                  </TableRow>
                                ))}
                                {/* Handicap Neto del equipo (solo si aplica porcentaje) */}
                                {percentage > 0 && team.handicapNeto !== null && (
                                  <TableRow key={`hn-${team.grupoid}`} className="bg-white hover:bg-white">
                                    <TableCell />
                                    <TableCell className="pl-10 font-bold text-muted-foreground">
                                      Handicap Neto
                                    </TableCell>
                                    <TableCell />
                                    <TableCell className="text-center text-lg font-bold text-blue-700">
                                      {team.handicapNeto}
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Fragment>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </Card>
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
