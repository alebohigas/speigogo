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
import { ArrowLeft, Loader2, Users } from 'lucide-react';
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

  /** ============ Leyenda: tees de salida + significado de HI / HC ============ */
  const Leyenda = () => (
    <div className="w-full max-w-4xl mx-auto mb-6">
      <p className="bg-muted-foreground text-white text-center font-bold py-1 rounded-sm">Tee Salidas</p>
      <div className="py-3 space-y-1 text-sm">
        {tees.map((t, i) => (
          <div key={i}>
            <span
              className="px-1"
              style={{ backgroundColor: t.bgcolor || 'transparent', color: t.color || 'inherit' }}
            >
              Tee Salida {t.tee} / Rating {t.rating} / Slope {t.slope} / Par {t.par}
            </span>
          </div>
        ))}
      </div>
      <div className="bg-muted-foreground text-white text-center py-2 rounded-sm text-sm space-y-1">
        <p>H.I = Handicap Índice / H.C. = Handicap Campo</p>
        <p>
          <span className="bg-yellow-300 text-black px-4 py-0.5 inline-block">
            Fondo <strong><em>AMARILLO</em></strong> handicap fuera de rango
          </span>
        </p>
        <p className="font-bold">SPEi Tour by Alien System</p>
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
                  {/* ============ Encabezado de la categoría ============ */}
                  <div className="w-full max-w-4xl mx-auto mb-6">
                    <h2 className="text-2xl font-semibold text-foreground">
                      JUGADORES: <span className="text-primary">{totalJugadores}</span>
                    </h2>
                    <h2 className="text-2xl font-semibold text-foreground">
                      EQUIPOS: <span className="text-blue-700">{totalEquipos}</span>
                    </h2>
                    <h3 className="text-2xl font-light text-foreground mt-3">
                      Categoría: <span className="font-bold">{data?.category.name || selectedCategory.name}</span>
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Handicap {tipoHcp} Mínimo:{' '}
                      <span className="font-bold text-primary">{minDisplay}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Jugadores por Equipo:{' '}
                      <span className="font-bold text-blue-700">{jugadoresEquipo}</span>
                    </p>
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
                              <TableHead className="text-primary-foreground font-bold text-center w-20">Club</TableHead>
                              <TableHead className="text-primary-foreground font-bold">Equipo</TableHead>
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
                                      dbLogo={team.logo}
                                      className="w-auto object-contain rounded inline-block"
                                      style={{ height: '1.875rem' }}
                                    />
                                  </TableCell>
                                  <TableCell className="font-bold pl-6">{team.grupoid}</TableCell>
                                  <TableCell />
                                  <TableCell
                                    className={`text-center text-lg font-bold text-destructive ${
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
                                    <TableCell className="pl-10">{p.nombre}</TableCell>
                                    <TableCell className="text-center">{p.hi}</TableCell>
                                    <TableCell
                                      className="text-center"
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
