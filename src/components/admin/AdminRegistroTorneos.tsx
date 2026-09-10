/**
 * AdminRegistroTorneos
 * ------------------------------------------------------------------
 * Sub-pestaña de /admin → Pre-Registro (solo en la vista General de un
 * sitio con varios torneos).
 *
 * Permite escribir la descripción y el costo que verá el jugador cuando
 * el pre-registro le pregunte a cuál torneo quiere entrar.
 *
 * Se guarda en `site_config(scope='general').home_config.registro_opciones`.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Trophy } from 'lucide-react';
import { useSaveSiteConfig, type HomeConfig } from '@/hooks/useSiteConfig';
import { useGeneralConfig } from '@/hooks/useInheritConfig';
import { useSiteTorneos } from '@/hooks/useSiteTorneos';
import { useToast } from '@/hooks/use-toast';
import { getSuperAdminPassword } from '@/lib/superAdminAuth';

type Opciones = NonNullable<HomeConfig['registro_opciones']>;

const AdminRegistroTorneos = () => {
  const general = useGeneralConfig();
  const { data: siteTorneos } = useSiteTorneos();
  const saveSiteConfig = useSaveSiteConfig();
  const { toast } = useToast();

  const torneos = (siteTorneos?.torneos ?? []).filter((t) => t.activo !== false);
  const [opciones, setOpciones] = useState<Opciones>({});

  useEffect(() => {
    const home = general?.home_config as HomeConfig | null | undefined;
    setOpciones(home?.registro_opciones ?? {});
  }, [general?.home_config]);

  const update = (id: string, key: 'descripcion' | 'costo', v: string) =>
    setOpciones((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: v } }));

  const handleSave = () => {
    const home = (general?.home_config as HomeConfig | null | undefined) ?? { buttons: [null, null] };
    const payload: HomeConfig = {
      ...home,
      buttons: home.buttons ?? [null, null],
      registro_opciones: opciones,
    };
    saveSiteConfig.mutate(
      { password: getSuperAdminPassword(), scope: 'general', home_config: payload },
      {
        onSuccess: () => toast({ title: 'Opciones de pre-registro guardadas' }),
        onError: (err: any) =>
          toast({ title: 'Error al guardar', description: err.message, variant: 'destructive' }),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          Elección de torneo en el pre-registro
        </CardTitle>
        <CardDescription>
          Cuando la página maneja varios torneos, al entrar al pre-registro se
          le pregunta al jugador a cuál desea inscribirse. Escribe aquí la
          descripción y el costo que verá en cada opción.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {torneos.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            Esta página maneja un solo torneo, por lo que no se muestra la pregunta.
          </p>
        ) : (
          <>
            {torneos.map((t) => {
              const id = String(t.torneoid);
              const row = opciones[id] ?? {};
              return (
                <div key={id} className="space-y-2 rounded-lg border p-4">
                  <div className="font-medium">{t.nombre}</div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`desc-${id}`}>Descripción</Label>
                    <Textarea
                      id={`desc-${id}`}
                      rows={3}
                      value={row.descripcion ?? ''}
                      onChange={(e) => update(id, 'descripcion', e.target.value)}
                      placeholder="Ej. Solo categorías Campeonato y hándicap menor a 5."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`costo-${id}`}>Costo (texto libre)</Label>
                    <Input
                      id={`costo-${id}`}
                      value={row.costo ?? ''}
                      onChange={(e) => update(id, 'costo', e.target.value)}
                      placeholder="Ej. Inscripción $10,000"
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saveSiteConfig.isPending} className="gap-2">
                {saveSiteConfig.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar cambios
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminRegistroTorneos;
