/**
 * AdminHomeButtons
 * ------------------------------------------------------------------
 * Admin block (rendered inside the "Página" tab) that lets a
 * superadmin/staff pick which two pages the two CTA buttons on the
 * public home hero point to.
 *
 * Storage: `site_config.home_config = { buttons: [pageId1, pageId2] }`.
 *
 * Fallback logic (applied on the public site by <Hero />):
 *   - If the configured page is missing or hidden, slot 1 falls back
 *     to "/convocatoria" and slot 2 to "/jugadores".
 *   - Both slots may independently be null (= use the fallback).
 *
 * Only 2 buttons are ever rendered on the hero. This UI enforces that
 * limit by exposing exactly two <Select>s (button 1 and button 2).
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MousePointerClick, Save } from 'lucide-react';
import { useSiteConfig, useSaveSiteConfig, type HomeConfig } from '@/hooks/useSiteConfig';
import { usePageVisibility } from '@/contexts/PageVisibilityContext';
import { useToast } from '@/hooks/use-toast';
import { getSuperAdminPassword } from '@/lib/superAdminAuth';

/** Sentinel value used by the Select to represent "use fallback". */
const NONE = '__none__';

const AdminHomeButtons = () => {
  const { data: siteConfig, isLoading } = useSiteConfig();
  const saveSiteConfig = useSaveSiteConfig();
  const { getAllMenuItems, visibilitySettings } = usePageVisibility();
  const { toast } = useToast();

  /** Full menu items list (admin view — includes hidden pages). */
  const menuItems = useMemo(() => getAllMenuItems(), [getAllMenuItems]);

  /** Local selection for each of the two slots (null = fallback). */
  const [btn1, setBtn1] = useState<string | null>(null);
  const [btn2, setBtn2] = useState<string | null>(null);

  /** Hydrate from server config whenever it changes. */
  useEffect(() => {
    const cfg = siteConfig?.home_config;
    setBtn1(cfg?.buttons?.[0] ?? null);
    setBtn2(cfg?.buttons?.[1] ?? null);
  }, [siteConfig?.home_config]);

  /** Persist current selection to site_config. */
  const handleSave = () => {
    const payload: HomeConfig = {
      ...siteConfig?.home_config,
      buttons: [btn1, btn2],
    };
    saveSiteConfig.mutate(
      { password: getSuperAdminPassword(), home_config: payload },
      {
        onSuccess: () =>
          toast({ title: 'Botones del home guardados', description: 'Los cambios se aplican inmediatamente.' }),
        onError: (err) =>
          toast({ title: 'Error al guardar', description: err.message, variant: 'destructive' }),
      },
    );
  };

  /** Utility — renders a single slot picker (used twice). */
  const renderSlot = (idx: 1 | 2, value: string | null, setValue: (v: string | null) => void) => {
    const fallbackLabel = idx === 1 ? '/convocatoria' : '/jugadores';
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">Botón {idx}</Label>
        <Select
          value={value ?? NONE}
          onValueChange={(v) => setValue(v === NONE ? null : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={`Fallback (${fallbackLabel})`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>
              — Fallback ({fallbackLabel}) —
            </SelectItem>
            {menuItems
              .filter((m) => m.id !== 'home')
              .map((m) => {
                const visible = visibilitySettings[m.id] ?? true;
                return (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label} <span className="text-muted-foreground">— {m.path}</span>
                    {!visible && <span className="ml-2 text-xs text-amber-600">(oculta)</span>}
                  </SelectItem>
                );
              })}

            {/* Páginas de cada torneo del sitio: "Akron Invitational Salidas". */}
            {torneos.map((t) => {
              const cfg = configs[String(t.torneoid)];
              const nombre = t.nombre || `Torneo ${t.torneoid}`;
              return menuItems
                .filter((m) => m.id !== 'home')
                .filter((m) => (cfg?.visibility?.[m.id] ?? true) !== false)
                .map((m) => (
                  <SelectItem key={`t${t.torneoid}:${m.id}`} value={`t${t.torneoid}:${m.id}`}>
                    {nombre} {m.label}
                    <span className="text-muted-foreground">
                      {' '}— {t.slug ? `/${t.slug}${m.path}` : m.path}
                    </span>
                  </SelectItem>
                ));
            })}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Si la página seleccionada está oculta en /admin, el botón cae automáticamente al fallback{' '}
          <span className="font-mono">{fallbackLabel}</span>.
        </p>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MousePointerClick className="h-5 w-5 text-primary" />
          Botones del Home
        </CardTitle>
        <CardDescription>
          Elige a qué páginas apuntan los dos botones principales del hero
          en la página de inicio. Puedes activar cualquier página del menú,
          pero solo se muestran dos botones. Si una página se oculta
          después, el botón se sustituye por el fallback correspondiente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {renderSlot(1, btn1, setBtn1)}
              {renderSlot(2, btn2, setBtn2)}
            </div>
            <div className="pt-2">
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

export default AdminHomeButtons;