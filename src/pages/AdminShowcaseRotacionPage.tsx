/**
 * AdminShowcaseRotacionPage — `/admin/showcase-rotacion`
 * ----------------------------------------------------------------------------
 * Constructor visual para abrir la vista rotativa `/showcase/rotacion`.
 *
 * Funcionalidad:
 *  - Lista TODOS los slides disponibles agrupados por sección (Driver,
 *    Approach, Putt, O'Yes, Oyes-X, Mejor Score Diario, Brackets M/F).
 *    Cada slide muestra: checkbox de inclusión + input de segundos (que
 *    cae al `defaultSeconds` cuando se deja vacío).
 *  - Input global de segundos por defecto.
 *  - Tres botones de "abrir vista":
 *      • Brackets — preselecciona automáticamente todos los slides de
 *        bracket (Caballeros + Damas) y abre con esos.
 *      • Por tipo (driver/approach/putt/oyes/oyesx) — preselecciona
 *        todos los slides de un mismo reporte 300.
 *      • Customizado — abre con exactamente la selección actual.
 *
 * Auth: contraseña de superadmin, persistida en sessionStorage. Mismo
 * patrón que /admin/brackets para acceso rápido sin entrar al panel.
 */

import { useMemo, useState, type FormEvent } from 'react';
import Layout from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Lock, Shield, MonitorPlay, Trophy, Target, Crosshair, MousePointerClick, Flag, Layers, ListChecks, ExternalLink, Loader2, ClipboardList, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useShowcaseSlides } from '@/hooks/useShowcaseSlides';
import {
  buildRotatorUrl,
  parseSlideId,
  type ShowcaseSlide,
  type ShowcaseConfig,
  type ShowcaseSlideMeta,
} from '@/lib/showcaseSlides';
import { validateSuperAdminPassword } from '@/lib/superAdminAuth';

/** Sesión admin de la página. */
const SESSION_KEY = 'showcase_rotacion_session';
// ============= Login form =============

const LoginForm = ({ onLogin }: { onLogin: (pwd: string) => Promise<boolean> }) => {
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!(await onLogin(pwd))) { setErr(true); setPwd(''); }
  };
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Showcase Rotación</CardTitle>
          <CardDescription>Acceso al constructor de vistas rotativas</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pwd">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="pwd" type="password" value={pwd}
                  onChange={(e) => { setPwd(e.target.value); setErr(false); }}
                  className={cn('pl-10', err && 'border-destructive focus-visible:ring-destructive')}
                  placeholder="Ingresa la contraseña" />
              </div>
              {err && <p className="text-sm text-destructive">Contraseña incorrecta</p>}
            </div>
            <Button type="submit" className="w-full">Entrar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// ============= Helpers =============

/** Abre la rotación en ventana nueva ~1280x800. */
const openRotator = (cfg: ShowcaseConfig) => {
  const url = buildRotatorUrl(cfg);
  const features = 'noopener,noreferrer,width=1280,height=800';
  window.open(url, '_blank', features);
};

/** Icono por nombre de grupo, incluidos los brackets Putt unificados. */
const groupIcon = (group: string) => {
  if (group.startsWith('Brackets') || group === 'Putt Finales') return Trophy;
  if (group === 'Driver') return Target;
  if (group === 'Approach') return Crosshair;
  if (group === 'Putt') return MousePointerClick;
  if (group === "O'Yes") return Flag;
  if (group === 'Oyes-X') return Layers;
  if (group === 'Mejor Score Diario') return ListChecks;
  if (group === 'Match Play') return Trophy;
  if (group === 'Resultados') return ClipboardList;
  if (group === 'LIVE') return Radio;
  return MonitorPlay;
};

// ============= Dashboard =============

/**
 * Constructor de rotación. Se exporta para poder mostrarlo embebido dentro
 * de /admin → Juego y jugadores → Showcase 300, sin abrir otra ventana.
 */
export const ShowcaseRotacionDashboard = () => {
  const { isLoading, all, groups } = useShowcaseSlides();

  /** Selección y segundos por slide (state local del builder). */
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [seconds, setSeconds] = useState<Record<string, number>>({});
  const [defaultSeconds, setDefaultSeconds] = useState(30);
  /**
   * Toggle global: mostrar la tira de patrocinadores dentro del showcase.
   * Se codifica dentro del hash de la URL (`sponsorRibbon` en el JSON) y
   * aplica a TODOS los slides de la rotación (no configurable por slide).
   */
  const [sponsorRibbon, setSponsorRibbon] = useState(false);

  /** Toggle de un slide individual. */
  const toggle = (id: string, v: boolean) => setSelected((s) => ({ ...s, [id]: v }));

  /** Marca/desmarca todos los slides de un grupo. */
  const toggleGroup = (groupName: string, v: boolean) => {
    const next = { ...selected };
    (groups[groupName] ?? []).forEach((s) => { next[s.id] = v; });
    setSelected(next);
  };

  /** Construye el ShowcaseConfig a partir del state actual. */
  const buildConfig = (filter?: (m: ShowcaseSlideMeta) => boolean): ShowcaseConfig => {
    const list = filter ? all.filter(filter) : all.filter((m) => selected[m.id]);
    const slides: ShowcaseSlide[] = list.map((m) => {
      const s: ShowcaseSlide = { id: m.id };
      if (seconds[m.id]) s.seconds = seconds[m.id];
      return s;
    });
    return { defaultSeconds, slides, sponsorRibbon };
  };

  const customSelectedCount = useMemo(
    () => all.filter((m) => selected[m.id]).length,
    [all, selected],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Cargando resultados disponibles...</span>
      </div>
    );
  }

  const tiposCon300: { tipo: string; group: string; Icon: any }[] = [
    { tipo: 'driver',   group: 'Driver',   Icon: Target },
    { tipo: 'approach', group: 'Approach', Icon: Crosshair },
    { tipo: 'putt',     group: 'Putt',     Icon: MousePointerClick },
    { tipo: 'oyes',     group: "O'Yes",    Icon: Flag },
    { tipo: 'oyesx',    group: 'Oyes-X',   Icon: Layers },
  ];

  /**
   * Lista de grupos en orden estable.
   * `Putt Finales` corresponde al modo de un solo bracket; no debe confundirse
   * con el reporte S300 del grupo `Putt`.
   */
  const groupOrder = [
    'Driver', 'Approach', 'Putt', "O'Yes", 'Oyes-X',
    'Mejor Score Diario', 'Putt Finales', 'Brackets Caballeros', 'Brackets Damas',
    'Match Play', 'Resultados', 'LIVE',
  ].filter((g) => groups[g]?.length);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <MonitorPlay className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Showcase Rotación</h1>
          <p className="text-muted-foreground">
            Genera vistas rotativas para las pantallas del club.
          </p>
        </div>
      </div>

      {/* Accesos rápidos */}
      <Card>
        <CardHeader>
          <CardTitle>Accesos rápidos</CardTitle>
          <CardDescription>
            Cada botón abre una ventana nueva con TODOS los resultados disponibles
            del tipo elegido, rotando con los segundos por defecto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="defsec">Segundos por defecto</Label>
              <Input
                id="defsec" type="number" min={5} max={300}
                value={defaultSeconds}
                onChange={(e) => setDefaultSeconds(Math.max(5, parseInt(e.target.value || '30', 10)))}
                className="w-32"
              />
            </div>
            {/* Toggle de tira de patrocinadores dentro del showcase. */}
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none pb-1">
              <Checkbox
                checked={sponsorRibbon}
                onCheckedChange={(v) => setSponsorRibbon(Boolean(v))}
              />
              <span className="font-medium">Mostrar carrusel de patrocinadores</span>
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Brackets Putt: unificado (A) o separados (M/F), según el modo activo. */}
            <Button
              variant="outline"
              className="h-auto flex flex-col items-start gap-1 p-4 text-left hover:bg-primary/10"
              disabled={!groups['Putt Finales']?.length
                && !groups['Brackets Caballeros']?.length
                && !groups['Brackets Damas']?.length}
              onClick={() => openRotator(buildConfig((m) =>
                m.group === 'Putt Finales' || m.group.startsWith('Brackets')
              ))}
            >
              <div className="flex items-center gap-2 w-full">
                <Trophy className="h-4 w-4 text-primary" />
                <span className="font-semibold">Brackets Putt</span>
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground whitespace-normal">
                {groups['Putt Finales']?.length
                  ? 'Rota los brackets de Putt Finales'
                  : 'Rota grupos + semis + final (M y F)'}
              </span>
            </Button>

            {/* Por tipo 300 */}
            {tiposCon300.map(({ tipo, group, Icon }) => {
              const count = groups[group]?.length ?? 0;
              return (
                <Button
                  key={tipo}
                  variant="outline"
                  disabled={count === 0}
                  className="h-auto flex flex-col items-start gap-1 p-4 text-left hover:bg-primary/10"
                  onClick={() => openRotator(buildConfig((m) => m.group === group))}
                >
                  <div className="flex items-center gap-2 w-full">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{group}</span>
                    <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-normal">
                    {count > 0 ? `${count} ${count === 1 ? 'vista' : 'vistas'} disponibles` : 'Sin datos'}
                  </span>
                </Button>
              );
            })}

            {/* Mejor Score */}
            <Button
              variant="outline"
              disabled={!groups['Mejor Score Diario']?.length}
              className="h-auto flex flex-col items-start gap-1 p-4 text-left hover:bg-primary/10"
              onClick={() => openRotator(buildConfig((m) => m.group === 'Mejor Score Diario'))}
            >
              <div className="flex items-center gap-2 w-full">
                <ListChecks className="h-4 w-4 text-primary" />
                <span className="font-semibold">Mejor Score Diario</span>
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground whitespace-normal">
                Rota todas las fechas con datos
              </span>
            </Button>

            {/* Match Play (todos los brackets de categorías MATCH PLAY) */}
            <Button
              variant="outline"
              disabled={!groups['Match Play']?.length}
              className="h-auto flex flex-col items-start gap-1 p-4 text-left hover:bg-primary/10"
              onClick={() => openRotator(buildConfig((m) => m.group === 'Match Play'))}
            >
              <div className="flex items-center gap-2 w-full">
                <Trophy className="h-4 w-4 text-primary" />
                <span className="font-semibold">Match Play</span>
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground whitespace-normal">
                {groups['Match Play']?.length
                  ? `${groups['Match Play'].length} categorías`
                  : 'Sin datos'}
              </span>
            </Button>

            {/* Resultados clásicos (Stroke Play / Stableford) */}
            <Button
              variant="outline"
              disabled={!groups['Resultados']?.length}
              className="h-auto flex flex-col items-start gap-1 p-4 text-left hover:bg-primary/10"
              onClick={() => openRotator(buildConfig((m) => m.group === 'Resultados'))}
            >
              <div className="flex items-center gap-2 w-full">
                <ClipboardList className="h-4 w-4 text-primary" />
                <span className="font-semibold">Resultados</span>
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground whitespace-normal">
                {groups['Resultados']?.length
                  ? `${groups['Resultados'].length} leaderboards`
                  : 'Sin datos'}
              </span>
            </Button>

            {/* LIVE — leaderboards en vivo de categorías visibles en /admin */}
            <Button
              variant="outline"
              disabled={!groups['LIVE']?.length}
              className="h-auto flex flex-col items-start gap-1 p-4 text-left hover:bg-primary/10"
              onClick={() => openRotator(buildConfig((m) => m.group === 'LIVE'))}
            >
              <div className="flex items-center gap-2 w-full">
                <Radio className="h-4 w-4 text-primary" />
                <span className="font-semibold">LIVE</span>
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground whitespace-normal">
                {groups['LIVE']?.length
                  ? `${groups['LIVE'].length} categorías en vivo`
                  : 'Sin categorías activas'}
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Builder customizado */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle>Rotación customizada</CardTitle>
            <CardDescription>
              Selecciona exactamente qué slides rotar y opcionalmente cuántos
              segundos mostrar cada uno. Luego abre la vista con la selección actual.
            </CardDescription>
          </div>
          <Button
            disabled={customSelectedCount === 0}
            onClick={() => openRotator(buildConfig())}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir vista customizada ({customSelectedCount})
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {all.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No hay resultados disponibles todavía. Cuando los reportes tengan datos,
              aparecerán aquí automáticamente.
            </div>
          )}

          {groupOrder.map((groupName) => {
            const items = groups[groupName] ?? [];
            if (!items.length) return null;
            const Icon = groupIcon(groupName);
            const allSelected = items.every((s) => selected[s.id]);
            return (
              <div key={groupName} className="space-y-2">
                <div className="flex items-center gap-3 border-b border-border pb-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <h3 className="font-bold text-sm uppercase tracking-wide">{groupName}</h3>
                  <span className="text-xs text-muted-foreground">
                    ({items.length})
                  </span>
                  <Button
                    variant="ghost" size="sm" className="ml-auto h-7 text-xs"
                    onClick={() => toggleGroup(groupName, !allSelected)}
                  >
                    {allSelected ? 'Quitar todos' : 'Seleccionar todos'}
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {items.map((s) => (
                    <SlideRow
                      key={s.id}
                      slide={s}
                      checked={!!selected[s.id]}
                      seconds={seconds[s.id] ?? null}
                      defaultSeconds={defaultSeconds}
                      onToggle={(v) => toggle(s.id, v)}
                      onSeconds={(sec) => setSeconds((m) => {
                        const next = { ...m };
                        if (sec == null) delete next[s.id]; else next[s.id] = sec;
                        return next;
                      })}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

// ============= Fila por slide =============

const SlideRow = ({
  slide, checked, seconds, defaultSeconds, onToggle, onSeconds,
}: {
  slide: ShowcaseSlideMeta;
  checked: boolean;
  seconds: number | null;
  defaultSeconds: number;
  onToggle: (v: boolean) => void;
  onSeconds: (sec: number | null) => void;
}) => {
  const { kind } = parseSlideId(slide.id);
  return (
    <label className={cn(
      'flex items-center gap-3 rounded-md border border-border p-2 cursor-pointer',
      checked ? 'bg-primary/5 border-primary/40' : 'hover:bg-muted/40'
    )}>
      <Checkbox checked={checked} onCheckedChange={(v) => onToggle(!!v)} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{slide.label}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {kind}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Input
          type="number"
          min={5} max={300}
          placeholder={String(defaultSeconds)}
          value={seconds ?? ''}
          onChange={(e) => {
            const v = e.target.value.trim();
            onSeconds(v === '' ? null : Math.max(5, parseInt(v, 10) || defaultSeconds));
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-16 h-8 text-xs"
        />
        <span className="text-[10px] text-muted-foreground">s</span>
      </div>
    </label>
  );
};

// ============= Page =============

const AdminShowcaseRotacionPage = () => {
  const [authed, setAuthed] = useState<boolean>(
    () => sessionStorage.getItem(SESSION_KEY) === '1',
  );
  const onLogin = async (pwd: string) => {
    if (await validateSuperAdminPassword(pwd)) {
      sessionStorage.setItem(SESSION_KEY, '1');
      setAuthed(true);
      return true;
    }
    return false;
  };
  return (
    <Layout>
      {authed ? <Dashboard /> : <LoginForm onLogin={onLogin} />}
    </Layout>
  );
};

export default AdminShowcaseRotacionPage;