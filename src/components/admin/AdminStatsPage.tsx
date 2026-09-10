/**
 * AdminStatsPage Component
 * ---------------------------------------------------------------
 * Admin panel that controls the public /stats page.
 *
 * Features:
 *  - Reorder the three sections (Clubes, Categoría, Jugador) using
 *    up/down arrows.
 *  - Per-section visibility toggle.
 *  - Manual overrides per section (Clubes total, Categoría rounds
 *    and updatedAt, Jugador note).
 *
 * Persistence: everything is saved into `site_config.stats_page_config`
 * via the shared useSaveSiteConfig hook.
 *
 * Note: the master on/off for /stats is handled from Admin > Páginas.
 * ---------------------------------------------------------------
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ArrowDown, ArrowUp, BarChart3, Eye, Loader2, Save } from 'lucide-react';
import { useSiteConfig, useSaveSiteConfig, type StatsPageConfig, type StatsPageSection } from '@/hooks/useSiteConfig';
import { useToast } from '@/hooks/use-toast';
import { getSuperAdminPassword } from '@/lib/superAdminAuth';
import { useConfigScope } from '@/lib/configScope';
import { useSiteTorneos } from '@/hooks/useSiteTorneos';

// ============= Constants =============

/** Default section order and enabled state used when config is empty. */
const DEFAULT_SECTIONS: StatsPageSection[] = [
  { id: 'clubes',    enabled: true },
  { id: 'categoria', enabled: true },
  { id: 'tees',      enabled: true },
  { id: 'jugador',   enabled: true },
  { id: 'noshow',    enabled: true },
];

/** Human-readable labels for each section id. */
const SECTION_LABELS: Record<StatsPageSection['id'], string> = {
  clubes:    'Clubes Asistentes',
  categoria: 'Estadísticas por Categoría',
  tees:      'Estadísticas por Tee de Salida',
  jugador:   'Estadísticas por Jugador',
  noshow:    'NO SHOW (retiros / descalificados)',
};

// ============= Component =============

const AdminStatsPage = () => {
  const { data: siteConfig, isLoading } = useSiteConfig();
  const saveSiteConfig = useSaveSiteConfig();
  const { toast } = useToast();

  /** Local editor state — synced from server config on load. */
  const [sections, setSections] = useState<StatsPageSection[]>(DEFAULT_SECTIONS);
  const [clubesTotal, setClubesTotal] = useState<string>('');
  const [categoriaUpdatedAt, setCategoriaUpdatedAt] = useState<string>('');
  const [categoriaRounds, setCategoriaRounds] = useState<string>('');
  const [jugadorNote, setJugadorNote] = useState<string>('');
  /** Which club identifier to show in the Clubes table ('name' or 'abr'). */
  const [clubNameField, setClubNameField] = useState<'name' | 'abr'>('name');
  /** General: suma las estadísticas de todos los torneos del sitio. */
  const [combineTorneos, setCombineTorneos] = useState(false);

  /** Hydrate editor state whenever the server config changes. */
  useEffect(() => {
    const cfg = siteConfig?.stats_page_config;
    if (cfg?.sections?.length) {
      // Merge with defaults so every id is present exactly once.
      const known = new Set(cfg.sections.map((s) => s.id));
      setSections([
        ...cfg.sections,
        ...DEFAULT_SECTIONS.filter((s) => !known.has(s.id)),
      ]);
    } else {
      setSections(DEFAULT_SECTIONS);
    }
    const o = cfg?.overrides ?? {};
    setClubesTotal(o.clubesTotal != null ? String(o.clubesTotal) : '');
    setCategoriaUpdatedAt(o.categoriaUpdatedAt ?? '');
    setCategoriaRounds(o.categoriaRounds != null ? String(o.categoriaRounds) : '');
    setJugadorNote(o.jugadorNote ?? '');
    setClubNameField((o.clubNameField ?? 'name') === 'abr' ? 'abr' : 'name');
    setCombineTorneos(!!cfg?.combineTorneos);
  }, [siteConfig?.stats_page_config]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============= Section reordering =============

  /** Move a section up (idx-1) or down (idx+1) in the local list. */
  const moveSection = (idx: number, dir: -1 | 1) => {
    const next = [...sections];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setSections(next);
  };

  /** Toggle a single section visibility. */
  const toggleSection = (idx: number, checked: boolean) => {
    const next = [...sections];
    next[idx] = { ...next[idx], enabled: checked };
    setSections(next);
  };

  // ============= Save =============

  const handleSave = () => {
    const parseNum = (s: string): number | null => {
      const n = Number(s);
      return Number.isFinite(n) && n >= 0 && s !== '' ? Math.floor(n) : null;
    };
    // Preserve footerTagline (managed from Admin > Estadísticas) so we
    // don't clobber it when saving from this tab.
    const existingTagline =
      siteConfig?.stats_page_config?.overrides?.footerTagline ?? null;
    const payload: StatsPageConfig = {
      sections,
      overrides: {
        clubesTotal:        parseNum(clubesTotal),
        categoriaUpdatedAt: categoriaUpdatedAt.trim() || null,
        categoriaRounds:    parseNum(categoriaRounds),
        jugadorNote:        jugadorNote.trim() || null,
        clubNameField,
        footerTagline:      existingTagline,
      },
      combineTorneos,
    };

    saveSiteConfig.mutate(
      {
        password: getSuperAdminPassword(),
        stats_page_config: payload,
      },
      {
        onSuccess: () =>
          toast({
            title: 'Configuración guardada',
            description: 'Los cambios se aplican inmediatamente en /stats.',
          }),
        onError: (err) =>
          toast({
            title: 'Error al guardar',
            description: err.message,
            variant: 'destructive',
          }),
      },
    );
  };

  // ============= Render =============

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Página de Estadísticas (/stats)
        </CardTitle>
        <CardDescription>
          Controla el orden de las secciones y los valores manuales que se
          muestran en la página pública <strong>/stats</strong>. La
          configuración se guarda por dominio. La visibilidad general de
          /stats se maneja desde Admin &gt; Páginas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando configuración...
          </div>
        ) : (
          <>
            {/* Section order + visibility */}
            <div className="space-y-2">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Orden y visibilidad de secciones
              </Label>
              <div className="space-y-2">
                {sections.map((s, idx) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
                  >
                    <span className="font-mono text-xs text-muted-foreground w-6 text-center">
                      #{idx + 1}
                    </span>
                    <div className="flex-1 font-medium">{SECTION_LABELS[s.id]}</div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveSection(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Subir"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveSection(idx, 1)}
                        disabled={idx === sections.length - 1}
                        aria-label="Bajar"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <Switch
                      checked={s.enabled}
                      onCheckedChange={(v) => toggleSection(idx, v)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Manual overrides */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">
                Overrides manuales (opcional)
              </Label>
              <p className="text-xs text-muted-foreground -mt-3">
                Deja vacío cualquier campo para usar el valor calculado
                automáticamente desde los datos del torneo.
              </p>

              {/* Club name vs abbreviation toggle (Clubes table) */}
              <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 items-center">
                <Label htmlFor="club-name-field">Nombre de club (Clubes)</Label>
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${clubNameField === 'name' ? 'font-semibold' : 'text-muted-foreground'}`}>Nombre completo</span>
                  <Switch
                    id="club-name-field"
                    checked={clubNameField === 'abr'}
                    onCheckedChange={(v) => setClubNameField(v ? 'abr' : 'name')}
                  />
                  <span className={`text-sm ${clubNameField === 'abr' ? 'font-semibold' : 'text-muted-foreground'}`}>Abreviatura</span>
                </div>
              </div>

              {/* Clubes total */}
              <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 items-center">
                <Label htmlFor="clubes-total">Total de jugadores (Clubes)</Label>
                <Input
                  id="clubes-total"
                  type="number"
                  min={0}
                  value={clubesTotal}
                  onChange={(e) => setClubesTotal(e.target.value)}
                  placeholder="Auto"
                  className="font-mono max-w-xs"
                />
              </div>

              {/* Categoria rounds */}
              <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 items-center">
                <Label htmlFor="cat-rounds">Rondas (Categoría)</Label>
                <Input
                  id="cat-rounds"
                  type="number"
                  min={0}
                  value={categoriaRounds}
                  onChange={(e) => setCategoriaRounds(e.target.value)}
                  placeholder="Auto"
                  className="font-mono max-w-xs"
                />
              </div>

              {/* Categoria updatedAt */}
              <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 items-center">
                <Label htmlFor="cat-updated">Última actualización (Categoría)</Label>
                <Input
                  id="cat-updated"
                  type="text"
                  value={categoriaUpdatedAt}
                  onChange={(e) => setCategoriaUpdatedAt(e.target.value)}
                  placeholder="Auto (o ej. 2026-05-31 13:05)"
                  className="font-mono max-w-xs"
                />
              </div>

              {/* Jugador note */}
              <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
                <Label htmlFor="jug-note" className="mt-2">
                  Nota (Jugador)
                </Label>
                <Textarea
                  id="jug-note"
                  value={jugadorNote}
                  onChange={(e) => setJugadorNote(e.target.value)}
                  placeholder="Opcional — se muestra arriba del buscador"
                  rows={2}
                />
              </div>

              {/* NOTA: el "Slogan del footer" se administra desde
                  Admin &gt; Estadísticas (AdminStats), no aquí. */}
            </div>

            {/* Suma de torneos — solo en la vista General de un sitio
                que maneja varios torneos a la vez. */}
            {scope === 'general' && torneos.length > 1 && (
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label className="text-base">Sumar las estadísticas de todos los torneos</Label>
                  <p className="text-xs text-muted-foreground">
                    En la portada común, Clubes Asistentes y No Show muestran
                    los jugadores de {torneos.map((t) => t.nombre).join(' + ')}.
                  </p>
                </div>
                <Switch checked={combineTorneos} onCheckedChange={setCombineTorneos} />
              </div>
            )}

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

export default AdminStatsPage;