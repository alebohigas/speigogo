/**
 * AdminInheritControl
 * ------------------------------------------------------------------
 * Control compartido por las pestañas heredables de /admin
 * (Avisos, Anuncio, POP y Patrocinadores).
 *
 *  - En el alcance "General": interruptor "Usar esta configuración en
 *    todos los torneos de la página".
 *  - Dentro de un torneo, con la herencia encendida: aviso
 *    "Tomando configuración general de la página" (solo lectura).
 *
 * Las banderas se guardan en `home_config.inherit` del alcance General.
 */

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Globe, Info, Loader2 } from 'lucide-react';
import { useConfigScope } from '@/lib/configScope';
import { useSaveSiteConfig, type HomeConfig } from '@/hooks/useSiteConfig';
import { useGeneralConfig, useInheritFlags, SECTION_LABELS, type InheritableSection } from '@/hooks/useInheritConfig';
import { getSuperAdminPassword } from '@/lib/superAdminAuth';
import { useToast } from '@/hooks/use-toast';

interface Props {
  section: InheritableSection;
}

const AdminInheritControl = ({ section }: Props) => {
  const scope = useConfigScope();
  const flags = useInheritFlags();
  const general = useGeneralConfig();
  const saveSiteConfig = useSaveSiteConfig();
  const { toast } = useToast();

  const on = !!flags[section];

  /** Guarda la bandera SIEMPRE en el alcance general. */
  const toggle = (next: boolean) => {
    const home = (general?.home_config as HomeConfig | null | undefined) ?? { buttons: [null, null] };
    const payload: HomeConfig = {
      ...home,
      buttons: home.buttons ?? [null, null],
      inherit: { ...(home.inherit ?? {}), [section]: next },
    };
    saveSiteConfig.mutate(
      { password: getSuperAdminPassword(), scope: 'general', home_config: payload },
      {
        onSuccess: () =>
          toast({
            title: next
              ? `${SECTION_LABELS[section]}: configuración general activada`
              : `${SECTION_LABELS[section]}: cada torneo usa su propia configuración`,
          }),
        onError: (err: any) =>
          toast({ title: 'Error al guardar', description: err.message, variant: 'destructive' }),
      },
    );
  };

  if (scope === 'general') {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
        <Globe className="h-4 w-4 text-primary" />
        <div className="flex items-center gap-2">
          <Switch
            id={`inherit-${section}`}
            checked={on}
            disabled={saveSiteConfig.isPending}
            onCheckedChange={toggle}
          />
          <Label htmlFor={`inherit-${section}`} className="cursor-pointer text-sm">
            Usar esta configuración de {SECTION_LABELS[section]} en todos los torneos de la página
          </Label>
        </div>
        {saveSiteConfig.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  if (!on) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <div className="font-medium">Tomando configuración general de la página</div>
        <div className="text-xs">
          Esta sección se edita desde <span className="font-medium">General → {SECTION_LABELS[section]}</span>.
          Los cambios que hagas aquí no se mostrarán mientras la configuración general esté activa.
        </div>
      </div>
    </div>
  );
};

export default AdminInheritControl;
