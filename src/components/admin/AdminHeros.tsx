/**
 * AdminHeros
 * -----------------------------------------------------------------------
 * Admin tab to manage the HERO (background image) of every public page,
 * per tournament:
 *
 *   - Torneo selector (defaults to the active torneo_id, e.g. 365 for the
 *     upcoming tournament). "Default (todos)" edits the shared fallback map.
 *   - One row per page: preview, image picker (files uploaded to the `heros`
 *     section), manual upload, AI generation, and an Activar switch.
 *   - A single "Guardar cambios" button persists everything to
 *     `site_config.hero_config`.
 *
 * Public side: `PageHero` resolves the override by route pathname
 * (see `useHeroOverride`), so activating a hero here changes the page
 * background for that tournament without touching page code.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Image as ImageIcon, Loader2, Save, Sparkles, Trash2, Upload } from 'lucide-react';
import { useSiteConfig, useSaveSiteConfig, type HeroConfig, type HeroOverrideMap } from '@/hooks/useSiteConfig';
import { useGenerateHeroAI } from '@/hooks/useHeroOverride';
import { useUploadsList, useUploadFiles } from '@/hooks/useUploads';
import { useTorneoId } from '@/hooks/useTorneoId';
import { useToast } from '@/hooks/use-toast';
import { getSuperAdminPassword } from '@/lib/superAdminAuth';
import { HERO_PAGES } from '@/config/heroPages';

/** Sentinel value of the torneo selector for the shared fallback map. */
const DEFAULT_SCOPE = 'default';

/** Sentinel value used by the image <Select> to mean "sin imagen". */
const NO_IMAGE = '__none__';

const AdminHeros = () => {
  const { data: siteConfig, isLoading } = useSiteConfig();
  const saveSiteConfig = useSaveSiteConfig();
  const { torneoId } = useTorneoId();
  const { toast } = useToast();

  /** Uploaded hero images available to pick from. */
  const { data: uploads, isLoading: isLoadingUploads } = useUploadsList('heros');
  const uploadFiles = useUploadFiles('heros');
  const generateAI = useGenerateHeroAI();

  /** Scope currently being edited: a torneo_id string or DEFAULT_SCOPE. */
  const [scope, setScope] = useState<string>(String(torneoId || DEFAULT_SCOPE));
  /** Local editable copy of the whole hero_config. */
  const [config, setConfig] = useState<HeroConfig>({ byTorneo: {}, default: {} });
  /** Extra torneo ids added manually in this session (e.g. 365). */
  const [extraScopes, setExtraScopes] = useState<string[]>([]);
  /** Free-text torneo id input for adding a new scope. */
  const [newScope, setNewScope] = useState('');
  /** Per-page AI prompt drafts, keyed by page path. */
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  /** Path currently being generated with AI (spinner target). */
  const [generatingPath, setGeneratingPath] = useState<string | null>(null);
  /** Path currently uploading a manual file. */
  const [uploadingPath, setUploadingPath] = useState<string | null>(null);
  /** One hidden file input per page row. */
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  /** Hydrate local state whenever the server config changes. */
  useEffect(() => {
    const cfg = siteConfig?.hero_config;
    setConfig({ byTorneo: cfg?.byTorneo ?? {}, default: cfg?.default ?? {} });
  }, [siteConfig?.hero_config]);

  /** Hydrate the header logo from the saved home_config. */
  useEffect(() => {
    setHeaderLogo(siteConfig?.home_config?.header_logo_url ?? '');
  }, [siteConfig?.home_config?.header_logo_url]);

  /** Keep the scope aligned with the active tournament on first load. */
  useEffect(() => {
    if (torneoId) setScope((prev) => (prev === DEFAULT_SCOPE && !prev ? String(torneoId) : prev));
  }, [torneoId]);

  /** Overrides of the currently selected scope. */
  const currentMap: HeroOverrideMap = useMemo(
    () => (scope === DEFAULT_SCOPE ? config.default ?? {} : config.byTorneo?.[scope] ?? {}),
    [config, scope],
  );

  /** Torneo options: active id + any ids already stored + session extras. */
  const scopeOptions = useMemo(() => {
    const ids = new Set<string>();
    if (torneoId) ids.add(String(torneoId));
    Object.keys(config.byTorneo ?? {}).forEach((id) => ids.add(id));
    extraScopes.forEach((id) => ids.add(id));
    return Array.from(ids).sort((a, b) => Number(b) - Number(a));
  }, [config.byTorneo, extraScopes, torneoId]);

  /** Patch one page override inside the selected scope. */
  const updatePage = (path: string, patch: Partial<{ url: string; active: boolean; prompt: string }>) => {
    setConfig((prev) => {
      const map = { ...(scope === DEFAULT_SCOPE ? prev.default ?? {} : prev.byTorneo?.[scope] ?? {}) };
      const existing = map[path] ?? { url: '', active: true };
      const next = { ...existing, ...patch };
      if (!next.url) {
        delete map[path];
      } else {
        map[path] = next;
      }
      return scope === DEFAULT_SCOPE
        ? { ...prev, default: map }
        : { ...prev, byTorneo: { ...(prev.byTorneo ?? {}), [scope]: map } };
    });
  };

  /** Manual upload for a specific page row: uploads then assigns the file. */
  const handleUpload = (path: string, files: FileList | null, input: HTMLInputElement | null) => {
    if (!files || files.length === 0) return;
    setUploadingPath(path);
    uploadFiles.mutate(
      { files: [files[0]], password: getSuperAdminPassword() },
      {
        onSuccess: (res) => {
          const saved = res.saved[0];
          if (saved) {
            updatePage(path, { url: saved.url, active: true });
            toast({ title: 'Imagen subida', description: `${saved.name} asignada. No olvides Guardar.` });
          } else {
            toast({
              title: 'No se pudo subir',
              description: res.errors[0]?.error || 'Formato no permitido.',
              variant: 'destructive',
            });
          }
        },
        onError: (err) => toast({ title: 'Error al subir', description: err.message, variant: 'destructive' }),
        onSettled: () => {
          setUploadingPath(null);
          if (input) input.value = '';
        },
      },
    );
  };

  /** Generate the hero with AI and assign the result to the page row. */
  const handleGenerate = (path: string, defaultPrompt: string) => {
    const prompt = (prompts[path] ?? defaultPrompt).trim();
    if (!prompt) {
      toast({ title: 'Escribe un prompt', description: 'Describe la imagen que quieres generar.', variant: 'destructive' });
      return;
    }
    setGeneratingPath(path);
    generateAI.mutate(
      { prompt, password: getSuperAdminPassword(), page: path.replace(/\//g, '') || 'inicio' },
      {
        onSuccess: (res) => {
          updatePage(path, { url: res.url, active: true, prompt });
          toast({ title: 'Imagen generada', description: 'Se asignó a la página. No olvides Guardar.' });
        },
        onError: (err) => toast({ title: 'Error de IA', description: err.message, variant: 'destructive' }),
        onSettled: () => setGeneratingPath(null),
      },
    );
  };

  /** Sube el logo del encabezado a la carpeta `heros` y lo asigna. */
  const handleUploadLogo = (files: FileList | null, input: HTMLInputElement | null) => {
    if (!files || files.length === 0) return;
    setUploadingLogo(true);
    uploadFiles.mutate(
      { files: [files[0]], password: getSuperAdminPassword() },
      {
        onSuccess: (res) => {
          const saved = res.saved[0];
          if (saved) {
            setHeaderLogo(saved.url);
            toast({ title: 'Logo subido', description: `${saved.name} asignado. No olvides Guardar.` });
          } else {
            toast({
              title: 'No se pudo subir',
              description: res.errors[0]?.error || 'Formato no permitido.',
              variant: 'destructive',
            });
          }
        },
        onError: (err) => toast({ title: 'Error al subir', description: err.message, variant: 'destructive' }),
        onSettled: () => {
          setUploadingLogo(false);
          if (input) input.value = '';
        },
      },
    );
  };

  /** Persist the full hero_config (all scopes) to the server. */
  const handleSave = () => {
    const payload: HeroConfig = {
      byTorneo: config.byTorneo ?? {},
      default: config.default ?? {},
    };
    /** Conserva el resto de home_config y solo cambia el logo. */
    const homePayload = {
      ...(siteConfig?.home_config ?? { buttons: [null, null] as [string | null, string | null] }),
      header_logo_url: headerLogo || null,
    };
    saveSiteConfig.mutate(
      { password: getSuperAdminPassword(), hero_config: payload, home_config: homePayload },
      {
        onSuccess: () =>
          toast({ title: 'Heros guardados', description: 'Los fondos activos ya se aplican en las páginas públicas.' }),
        onError: (err) => toast({ title: 'Error al guardar', description: err.message, variant: 'destructive' }),
      },
    );
  };

  /** Register a new torneo scope typed by the admin (e.g. 365). */
  const addScope = () => {
    const id = newScope.trim();
    if (!/^\d+$/.test(id)) {
      toast({ title: 'torneo_id inválido', description: 'Escribe solo números, por ejemplo 365.', variant: 'destructive' });
      return;
    }
    setExtraScopes((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setScope(id);
    setNewScope('');
  };

  const activeCount = Object.values(currentMap).filter((h) => h.active !== false && h.url).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" />
          Heros por torneo
        </CardTitle>
        <CardDescription>
          Sube, genera con IA o selecciona la imagen de fondo (hero) de cada página y actívala por torneo.
          Si no hay hero activo, la página usa su imagen por default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ---- Scope selector: torneo actual, default, o un torneo nuevo ---- */}
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3 bg-muted/30">
          <div className="space-y-1">
            <Label className="text-xs">Torneo</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_SCOPE}>Default (todos los torneos)</SelectItem>
                {scopeOptions.map((id) => (
                  <SelectItem key={id} value={id}>
                    torneo {id}{String(torneoId) === id ? ' (activo)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Agregar torneo (ej. 365)</Label>
            <div className="flex gap-2">
              <Input
                value={newScope}
                onChange={(e) => setNewScope(e.target.value)}
                placeholder="365"
                className="w-28"
                inputMode="numeric"
              />
              <Button type="button" variant="outline" onClick={addScope}>Agregar</Button>
            </div>
          </div>
          <Badge variant="secondary" className="ml-auto">{activeCount} hero(s) activos</Badge>
        </div>

        {/* ---- Logo del encabezado ---- */}
        <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[10rem,1fr] md:items-start">
          <div className="space-y-1">
            <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded bg-muted p-2">
              {headerLogo ? (
                <img src={headerLogo} alt="Logo del encabezado" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">Logo del torneo</span>
              )}
            </div>
            <p className="text-sm font-medium">Logo del encabezado</p>
            <p className="text-xs text-muted-foreground">Se muestra arriba, en todas las páginas</p>
          </div>
          <div className="space-y-2">
            <Select
              value={headerLogo || NO_IMAGE}
              onValueChange={(value) => setHeaderLogo(value === NO_IMAGE ? '' : value)}
            >
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder={isLoadingUploads ? 'Cargando…' : 'Selecciona una imagen'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_IMAGE}>— Usar el logo del torneo —</SelectItem>
                {(uploads?.files ?? []).map((file) => (
                  <SelectItem key={`logo-${file.url}`} value={file.url}>{file.name}</SelectItem>
                ))}
                {headerLogo && !(uploads?.files ?? []).some((f) => f.url === headerLogo) && (
                  <SelectItem value={headerLogo}>{headerLogo.split('/').pop()}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              <input
                ref={logoInput}
                type="file"
                accept="image/webp,image/jpeg,image/png,image/gif"
                className="hidden"
                onChange={(e) => handleUploadLogo(e.target.files, e.currentTarget)}
              />
              <Button type="button" variant="outline" disabled={uploadingLogo} onClick={() => logoInput.current?.click()}>
                {uploadingLogo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Subir logo
              </Button>
              {headerLogo && (
                <Button type="button" variant="ghost" onClick={() => setHeaderLogo('')} aria-label="Quitar logo del encabezado">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          </div>
        </div>


        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-3">
            {HERO_PAGES.map((page) => {
              const entry = currentMap[page.path];
              const isGenerating = generatingPath === page.path;
              const isUploading = uploadingPath === page.path;
              return (
                <div
                  key={page.path}
                  className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[10rem,1fr,auto] md:items-start"
                >
                  {/* Preview */}
                  <div className="space-y-1">
                    <div className="aspect-video w-full overflow-hidden rounded bg-muted">
                      {entry?.url ? (
                        <img
                          src={entry.url}
                          alt={`Hero ${page.label}`}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                          Default
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-medium">{page.label}</p>
                    <p className="text-xs text-muted-foreground">{page.path}</p>
                  </div>

                  {/* Picker + AI prompt */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Select
                        value={entry?.url || NO_IMAGE}
                        onValueChange={(value) =>
                          updatePage(page.path, { url: value === NO_IMAGE ? '' : value, active: true })
                        }
                      >
                        <SelectTrigger className="w-full sm:w-72">
                          <SelectValue placeholder={isLoadingUploads ? 'Cargando…' : 'Selecciona una imagen'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_IMAGE}>— Usar imagen por default —</SelectItem>
                          {(uploads?.files ?? []).map((file) => (
                            <SelectItem key={file.url} value={file.url}>{file.name}</SelectItem>
                          ))}
                          {/* Keep an assigned URL selectable even if it was
                              generated in this session and the list is stale. */}
                          {entry?.url && !(uploads?.files ?? []).some((f) => f.url === entry.url) && (
                            <SelectItem value={entry.url}>{entry.url.split('/').pop()}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>

                      <input
                        ref={(el) => { fileInputs.current[page.path] = el; }}
                        type="file"
                        accept="image/webp,image/jpeg,image/png,image/gif"
                        className="hidden"
                        onChange={(e) => handleUpload(page.path, e.target.files, e.currentTarget)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isUploading}
                        onClick={() => fileInputs.current[page.path]?.click()}
                      >
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        Subir
                      </Button>
                      {entry?.url && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => updatePage(page.path, { url: '' })}
                          aria-label={`Quitar hero de ${page.label}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={prompts[page.path] ?? page.aiPrompt}
                        onChange={(e) => setPrompts({ ...prompts, [page.path]: e.target.value })}
                        placeholder="Describe la imagen para la IA"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="shrink-0"
                        disabled={isGenerating}
                        onClick={() => handleGenerate(page.path, page.aiPrompt)}
                      >
                        {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Generar con IA
                      </Button>
                    </div>
                  </div>

                  {/* Activation switch */}
                  <div className="flex items-center gap-2 md:flex-col md:items-end">
                    <Label className="text-xs text-muted-foreground">Activar</Label>
                    <Switch
                      checked={entry?.active !== false && !!entry?.url}
                      disabled={!entry?.url}
                      onCheckedChange={(checked) => updatePage(page.path, { active: checked })}
                      aria-label={`Activar hero de ${page.label}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ---- Save ---- */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saveSiteConfig.isPending}>
            {saveSiteConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminHeros;
