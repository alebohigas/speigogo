/**
 * RegistroTorneoPicker
 * ------------------------------------------------------------------
 * Sitios con varios torneos: antes de mostrar el formulario público de
 * pre-registro se le pregunta al jugador a cuál torneo quiere entrar.
 *
 * Cada opción es una tarjeta con el nombre del torneo, una descripción
 * y un costo escritos desde /admin → General → Pre-Registro → Torneos.
 * Al elegir, se navega a la dirección del torneo (/experience/registro)
 * y a partir de ahí el formulario trabaja con ese torneo.
 */

import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight, Trophy } from 'lucide-react';
import { type SiteTorneo } from '@/hooks/useSiteTorneos';
import { useGeneralConfig } from '@/hooks/useInheritConfig';
import type { HomeConfig } from '@/hooks/useSiteConfig';

const RegistroTorneoPicker = ({ torneos }: { torneos: SiteTorneo[] }) => {
  const general = useGeneralConfig();
  const opciones = (general?.home_config as HomeConfig | null | undefined)?.registro_opciones ?? {};

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">¿A cuál torneo deseas inscribirte?</h2>
        <p className="text-muted-foreground text-sm">
          Elige una opción para continuar con tu pre-registro.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {torneos.map((t) => {
          const info = opciones[String(t.torneoid)] ?? {};
          return (
            <Link key={t.torneoid} to={`/${t.slug}/registro`} className="group">
              <Card className="h-full transition-colors hover:border-primary">
                <CardContent className="p-6 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-primary" />
                      <span className="font-semibold">{t.nombre}</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                  {info.descripcion && (
                    <p className="text-sm text-muted-foreground whitespace-pre-line">
                      {info.descripcion}
                    </p>
                  )}
                  {info.costo && (
                    <p className="text-sm font-medium">{info.costo}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default RegistroTorneoPicker;
