/**
 * AdminPopup
 * -----------------------------------------------------------------------
 * Admin tab to manage the site-wide POP UP overlay. Lets the admin:
 *   - upload one or more candidate images (stored under the `popup`
 *     uploads section: /api/uploads/{domain}/popup/...)
 *   - pick which uploaded image is "active"
 *   - choose on which routes the popup should appear
 *   - set the auto-dismiss duration (seconds; 0 = stay open until X)
 *   - adjust the rendered image width (pixels)
 *   - toggle the overlay on/off entirely
 *
 * The resulting settings persist to `site_config.popup_config` and are
 * read globally by <SitePopup /> mounted in <Layout />. One popup per
 * domain — same multi-tenant scoping as every other admin tab.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Loader2,
  Upload,
  Trash2,
  Image as ImageIcon,
  CheckCircle2,
  MonitorPlay,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type as TypeIcon,
} from 'lucide-react';
import {
  useUploadsList,
  useUploadFiles,
  useDeleteFile,
  type UploadedFile,
} from '@/hooks/useUploads';
import { useSiteConfig, useSaveSiteConfig, type PopupConfig } from '@/hooks/useSiteConfig';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { menuConfig } from '@/data/mockData';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AdminInheritControl from './AdminInheritControl';

/** Shared admin password (mirrors site_config.php usage). */
const ADMIN_PASSWORD = 'admin2025';

/** Default popup config when none has been saved yet. */
const DEFAULT_POPUP: PopupConfig = {
  enabled: false,
  imageUrl: '',
  paths: ['/'],
  durationSeconds: 0,
  widthPx: 480,
  altText: '',
  text: '',
  textFontSize: 16,
  textFontFamily: 'sans',
  textBold: false,
  textItalic: false,
  textColor: '#0f172a',
  textAlign: 'center',
  textPosition: 'below',
};

/** Format bytes → human-readable string. */
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * AdminPopup — main exported component for the Admin > POP tab.
 */
const AdminPopup = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Uploads (image bank for the popup overlay)
  const { data: uploadsData, isLoading: isLoadingUploads, refetch } =
    useUploadsList('popup');
  const uploadMutation = useUploadFiles('popup');
  const deleteMutation = useDeleteFile('popup');

  // Site config (where the popup configuration lives)
  const { data: siteConfig, isLoading: isLoadingConfig } = useSiteConfig();
  const saveSiteConfig = useSaveSiteConfig();

  // ---- Multi-slot state ---------------------------------------------------
  // Up to 3 independent POP UP slots. When multiple are enabled on the
  // same page they render side-by-side on desktop and stacked on mobile.
  const [configs, setConfigs] = useState<PopupConfig[]>([
    { ...DEFAULT_POPUP },
    { ...DEFAULT_POPUP },
    { ...DEFAULT_POPUP },
  ]);
  const [activeIdx, setActiveIdx] = useState(0);
  const config = configs[activeIdx];
  /**
   * dirtyRef — true as soon as the admin touches the form.
   * Guards against background refetches of site_config (react-query
   * refetch on focus/reconnect returns a NEW object identity) overwriting
   * unsaved edits. Without this, selecting an image and then saving could
   * persist an empty `imageUrl` because the form had been re-hydrated.
   */
  const dirtyRef = useRef(false);
  /** hydratedRef — ensures the server payload seeds the form only once. */
  const hydratedRef = useRef(false);

  /** Wrapper mirroring React's setState signature but scoped to the active slot. */
  const setConfig: React.Dispatch<React.SetStateAction<PopupConfig>> = (updater) => {
    dirtyRef.current = true;
    setConfigs((cs) =>
      cs.map((c, i) => {
        if (i !== activeIdx) return c;
        return typeof updater === 'function'
          ? (updater as (p: PopupConfig) => PopupConfig)(c)
          : updater;
      }),
    );
  };

  // Hydrate the local form from the server ONCE (or after an explicit save).
  // Accepts both legacy single-object payloads and the new array shape.
  useEffect(() => {
    const raw = siteConfig?.popup_config;
    if (!raw) return;
    if (hydratedRef.current && dirtyRef.current) return;
    const arr: PopupConfig[] = Array.isArray(raw) ? raw : [raw as PopupConfig];
    setConfigs([0, 1, 2].map((i) => ({ ...DEFAULT_POPUP, ...(arr[i] || {}) })));
    hydratedRef.current = true;
  }, [siteConfig?.popup_config]);


  const files: UploadedFile[] = uploadsData?.files ?? [];

  /** Routes the admin can pick from (mirrors public menu). */
  const routeOptions = useMemo(
    () =>
      menuConfig.map((m) => ({
        id: m.id,
        label: m.label,
        path: m.path,
      })),
    []
  );

  /** Upload selected files immediately. */
  const handleFiles = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const filesArr = Array.from(filesList);
    uploadMutation.mutate(
      { files: filesArr, password: ADMIN_PASSWORD },
      {
        onSuccess: (res) => {
          if (res.saved.length > 0) {
            toast({
              title: `${res.saved.length} imagen(es) subida(s)`,
              description: 'Selecciónala abajo para usarla como POP UP.',
            });
          }
          if (res.errors.length > 0) {
            toast({
              title: 'Algunos archivos fallaron',
              description: res.errors.map((e) => `${e.name}: ${e.error}`).join(' · '),
              variant: 'destructive',
            });
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
        },
        onError: (err) =>
          toast({ title: 'Error al subir', description: err.message, variant: 'destructive' }),
      }
    );
  };

  /** Delete a candidate image from the popup bank. */
  const handleDelete = (file: UploadedFile) => {
    deleteMutation.mutate(
      { name: file.name, password: ADMIN_PASSWORD },
      {
        onSuccess: () => {
          toast({ title: 'Imagen eliminada', description: file.name });
          // Clear the deleted image from every slot that referenced it.
          dirtyRef.current = true;
          setConfigs((cs) =>

            cs.map((c) =>
              c.imageUrl === file.url ? { ...c, imageUrl: '', enabled: false } : c,
            ),
          );
        },
        onError: (err) =>
          toast({ title: 'Error al eliminar', description: err.message, variant: 'destructive' }),
      }
    );
  };

  /** Toggle a single route in the config.paths array. */
  const togglePath = (path: string) => {
    setConfig((c) => {
      const has = c.paths.includes(path);
      return { ...c, paths: has ? c.paths.filter((p) => p !== path) : [...c.paths, path] };
    });
  };

  /** Persist the current config to the server. */
  const handleSave = () => {
    const invalid = configs.find(
      (c) => c.enabled && !c.imageUrl && !(c.text && c.text.trim().length > 0),
    );
    if (invalid) {
      toast({
        title: 'Falta contenido',
        description:
          'Cada POP UP activo debe tener una imagen o un texto. Revisa las pestañas.',
        variant: 'destructive',
      });
      return;
    }
    saveSiteConfig.mutate(
      // Send the full array so all 3 slots persist in a single request.
      { password: ADMIN_PASSWORD, popup_config: configs as unknown as PopupConfig },
      {
        onSuccess: () => {
          // Saved state matches the server again, so allow re-hydration.
          dirtyRef.current = false;
          toast({
            title: 'POP UP guardado',
            description: 'La configuración se aplicó a todos los visitantes.',
          });
        },

        onError: (err) =>
          toast({ title: 'Error al guardar', description: err.message, variant: 'destructive' }),
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Herencia desde el alcance General (multi-torneo). */}
      <AdminInheritControl section="pop" />
      {/* Slot selector — one tab per POP UP. Enabled slots show a green dot. */}
      <Tabs value={String(activeIdx)} onValueChange={(v) => setActiveIdx(Number(v))}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          {configs.map((c, i) => (
            <TabsTrigger key={i} value={String(i)} className="gap-2">
              POP {i + 1}
              {c.enabled && (
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-label="Activo" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="text-xs text-muted-foreground">
        Puedes activar hasta 3 POP UP diferentes. Si dos o más coinciden en la
        misma página se muestran lado a lado en escritorio y apilados en móvil.
      </p>

      {/* ===== 1. Image bank ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            Imágenes del POP UP
          </CardTitle>
          <CardDescription>
            Sube las imágenes candidatas y elige cuál se usará en el pop-up.
            Máx. 15 MB por archivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/webp,image/jpeg,image/png,image/gif"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="gap-2"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Subir imagen
          </Button>

          {isLoadingUploads ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando imágenes...
            </div>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Aún no hay imágenes. Sube una para empezar.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {files.map((file) => {
                const isActive = config.imageUrl === file.url;
                return (
                  <div
                    key={file.name}
                    className={cn(
                      'group relative rounded-lg border-2 overflow-hidden bg-white cursor-pointer transition-all',
                      isActive ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
                    )}
                    onClick={() =>
                      setConfig((c) => ({ ...c, imageUrl: file.url, altText: c.altText || file.alt }))
                    }
                  >
                    <img
                      src={file.url}
                      alt={file.alt}
                      className="w-full h-32 object-contain bg-white"
                      loading="lazy"
                    />
                    {isActive && (
                      <Badge className="absolute top-1 left-1 gap-1 bg-primary">
                        <CheckCircle2 className="h-3 w-3" /> Activa
                      </Badge>
                    )}
                    <div className="px-2 py-1 text-[10px] text-muted-foreground bg-card flex items-center justify-between">
                      <span className="truncate">{file.name}</span>
                      <span>{formatBytes(file.size)}</span>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="absolute top-1 right-1 h-7 w-7 bg-background/80 text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(file);
                      }}
                      aria-label={`Eliminar ${file.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* ---- Selected-image summary -------------------------------------
              Makes the current selection of the ACTIVE slot explicit. Without
              this, an admin could enable a slot, forget to click an image and
              save a popup that renders text only (the reported bug). */}
          {config.imageUrl ? (
            <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <img
                src={config.imageUrl}
                alt={config.altText || 'Imagen seleccionada'}
                className="h-16 w-16 object-contain bg-white rounded border border-border"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Imagen del POP {activeIdx + 1}</p>
                <p className="text-xs text-muted-foreground truncate">{config.imageUrl}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfig((c) => ({ ...c, imageUrl: '' }))}
              >
                Quitar
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              El POP {activeIdx + 1} no tiene imagen seleccionada. Haz clic en una
              imagen de arriba y después presiona <strong>Guardar</strong>.
            </div>
          )}
        </CardContent>
      </Card>


      {/* ===== 2. Behavior + page targeting ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorPlay className="h-5 w-5 text-primary" />
            Configuración del POP UP
          </CardTitle>
          <CardDescription>
            Define en qué páginas se muestra, por cuánto tiempo y a qué resolución.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master switch */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label className="text-base">Activar POP UP</Label>
              <p className="text-xs text-muted-foreground">
                Cuando esté apagado, ningún visitante verá el pop-up.
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
            />
          </div>

          {/* Width (image resolution / size) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Ancho de la imagen</Label>
              <span className="text-sm font-mono text-muted-foreground">{config.widthPx}px</span>
            </div>
            <Slider
              min={240}
              max={1200}
              step={20}
              value={[config.widthPx]}
              onValueChange={([v]) => setConfig((c) => ({ ...c, widthPx: v }))}
            />
            <p className="text-xs text-muted-foreground">
              La imagen se renderiza a este ancho máximo; el alto se escala
              proporcionalmente y se limita al viewport en móvil.
            </p>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label htmlFor="popup-duration">Duración (segundos)</Label>
            <Input
              id="popup-duration"
              type="number"
              min={0}
              max={120}
              value={config.durationSeconds}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  durationSeconds: Math.max(0, Number(e.target.value) || 0),
                }))
              }
              className="max-w-[160px]"
            />
            <p className="text-xs text-muted-foreground">
              0 = permanece abierto hasta que el usuario lo cierre con la X.
            </p>
          </div>

          {/* Alt text */}
          <div className="space-y-2">
            <Label htmlFor="popup-alt">Texto alternativo (accesibilidad)</Label>
            <Input
              id="popup-alt"
              type="text"
              value={config.altText ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, altText: e.target.value }))}
              placeholder="Promoción, aviso, anuncio..."
            />
          </div>

          {/* Pages */}
          <div className="space-y-2">
            <Label>Páginas donde se mostrará</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-lg border border-border p-3 max-h-64 overflow-auto">
              {routeOptions.map((opt) => (
                <label
                  key={opt.id}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 rounded"
                >
                  <Checkbox
                    checked={config.paths.includes(opt.path)}
                    onCheckedChange={() => togglePath(opt.path)}
                  />
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground font-mono ml-auto">
                    {opt.path}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Selecciona al menos una página. Se mostrará al inicio cada vez
              que el visitante abra la página.
            </p>
          </div>

          <Button
            type="button"
            onClick={handleSave}
            disabled={saveSiteConfig.isPending || isLoadingConfig}
            className="gap-2"
          >
            {saveSiteConfig.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Guardar configuración
          </Button>
        </CardContent>
      </Card>

      {/* ===== 3. Caption text (rendered together with the image) ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TypeIcon className="h-5 w-5 text-primary" />
            Texto del POP UP
          </CardTitle>
          <CardDescription>
            Texto opcional que se muestra dentro del mismo recuadro que la
            imagen para formar un pop-up cohesivo. Déjalo vacío para mostrar
            solo la imagen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="popup-text">Contenido</Label>
            <Textarea
              id="popup-text"
              value={config.text ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, text: e.target.value }))}
              placeholder="Escribe el mensaje del pop-up..."
              rows={4}
            />
          </div>

          {/* Typography row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Font family */}
            <div className="space-y-2">
              <Label>Fuente</Label>
              <Select
                value={config.textFontFamily ?? 'sans'}
                onValueChange={(v) =>
                  setConfig((c) => ({ ...c, textFontFamily: v as PopupConfig['textFontFamily'] }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sans">Sans-serif (moderna)</SelectItem>
                  <SelectItem value="serif">Serif (clásica)</SelectItem>
                  <SelectItem value="mono">Monoespaciada</SelectItem>
                  <SelectItem value="display">Display (Playfair)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Position */}
            <div className="space-y-2">
              <Label>Posición respecto a la imagen</Label>
              <Select
                value={config.textPosition ?? 'below'}
                onValueChange={(v) =>
                  setConfig((c) => ({ ...c, textPosition: v as PopupConfig['textPosition'] }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="above">Arriba de la imagen</SelectItem>
                  <SelectItem value="below">Debajo de la imagen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Size + color row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Tamaño de fuente</Label>
                <span className="text-sm font-mono text-muted-foreground">
                  {config.textFontSize ?? 16}px
                </span>
              </div>
              <Slider
                min={12}
                max={48}
                step={1}
                value={[config.textFontSize ?? 16]}
                onValueChange={([v]) => setConfig((c) => ({ ...c, textFontSize: v }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="popup-color">Color del texto</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="popup-color"
                  type="color"
                  value={config.textColor ?? '#0f172a'}
                  onChange={(e) => setConfig((c) => ({ ...c, textColor: e.target.value }))}
                  className="h-10 w-16 p-1"
                />
                <Input
                  type="text"
                  value={config.textColor ?? '#0f172a'}
                  onChange={(e) => setConfig((c) => ({ ...c, textColor: e.target.value }))}
                  className="font-mono"
                />
              </div>
            </div>
          </div>

          {/* Style toggles */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="space-y-2">
              <Label>Estilo</Label>
              <ToggleGroup
                type="multiple"
                value={[
                  ...(config.textBold ? ['bold'] : []),
                  ...(config.textItalic ? ['italic'] : []),
                ]}
                onValueChange={(vals) =>
                  setConfig((c) => ({
                    ...c,
                    textBold: vals.includes('bold'),
                    textItalic: vals.includes('italic'),
                  }))
                }
              >
                <ToggleGroupItem value="bold" aria-label="Negritas">
                  <Bold className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="italic" aria-label="Cursiva">
                  <Italic className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-2">
              <Label>Alineación</Label>
              <ToggleGroup
                type="single"
                value={config.textAlign ?? 'center'}
                onValueChange={(v) => {
                  if (!v) return;
                  setConfig((c) => ({ ...c, textAlign: v as PopupConfig['textAlign'] }));
                }}
              >
                <ToggleGroupItem value="left" aria-label="Izquierda">
                  <AlignLeft className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="center" aria-label="Centrado">
                  <AlignCenter className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="right" aria-label="Derecha">
                  <AlignRight className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {/* Live preview of the unified card */}
          <div className="space-y-2">
            <Label>Vista previa</Label>
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 flex justify-center">
              <div
                className="rounded-2xl bg-white shadow-lg ring-1 ring-black/10 overflow-hidden w-full"
                style={{ maxWidth: `${config.widthPx}px` }}
              >
                {config.text && (config.textPosition ?? 'below') === 'above' && (
                  <div
                    className="px-5 pt-5 pb-3"
                    style={{
                      fontFamily:
                        config.textFontFamily === 'serif' ? 'Georgia, serif' :
                        config.textFontFamily === 'mono' ? 'ui-monospace, monospace' :
                        config.textFontFamily === 'display' ? '"Playfair Display", Georgia, serif' :
                        'ui-sans-serif, system-ui, sans-serif',
                      fontSize: `${config.textFontSize ?? 16}px`,
                      fontWeight: config.textBold ? 700 : 400,
                      fontStyle: config.textItalic ? 'italic' : 'normal',
                      color: config.textColor ?? '#0f172a',
                      textAlign: (config.textAlign ?? 'center') as React.CSSProperties['textAlign'],
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {config.text}
                  </div>
                )}
                {config.imageUrl && (
                  <img
                    src={config.imageUrl}
                    alt={config.altText || 'Vista previa'}
                    className="block w-full h-auto max-h-[40vh] object-contain bg-white"
                  />
                )}
                {config.text && (config.textPosition ?? 'below') === 'below' && (
                  <div
                    className="px-5 pt-3 pb-5"
                    style={{
                      fontFamily:
                        config.textFontFamily === 'serif' ? 'Georgia, serif' :
                        config.textFontFamily === 'mono' ? 'ui-monospace, monospace' :
                        config.textFontFamily === 'display' ? '"Playfair Display", Georgia, serif' :
                        'ui-sans-serif, system-ui, sans-serif',
                      fontSize: `${config.textFontSize ?? 16}px`,
                      fontWeight: config.textBold ? 700 : 400,
                      fontStyle: config.textItalic ? 'italic' : 'normal',
                      color: config.textColor ?? '#0f172a',
                      textAlign: (config.textAlign ?? 'center') as React.CSSProperties['textAlign'],
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {config.text}
                  </div>
                )}
                {!config.imageUrl && !config.text && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Sin contenido todavía.
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPopup;