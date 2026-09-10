/**
 * AdminAvisos Component
 * -------------------------------------------------------------
 * Admin tab for configuring the Avisos page poster grid.
 *
 * Mirrors AdminEventos in structure and behavior, but persists to a
 * separate `avisos_config` field on `site_config` so the Avisos page
 * can be tuned independently from Eventos.
 *
 * Features:
 *  - Independent column count (1–4) for desktop and mobile.
 *  - Independent gap preset (sm/md/lg/xl) for desktop and mobile.
 *  - Live preview frames simulating both desktop (~1100px) and mobile
 *    (~390px) widths, mirroring the AdminEventos pattern.
 *  - Persists settings server-side via `site_config.avisos_config`.
 *
 * The public Avisos page (`AvisosPostersSection`) reads this config from
 * `useSiteConfig` and applies the appropriate columns/gap per breakpoint.
 */

import { type DragEvent, useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Bell,
  Save,
  CheckCircle2,
  Monitor,
  Smartphone,
  GripVertical,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useSiteConfig,
  useSaveSiteConfig,
  type AvisosConfig,
  type EventosGap,
} from '@/hooks/useSiteConfig';
import { useToast } from '@/hooks/use-toast';
import { resolveOrder, identityOrder, moveItem } from '@/lib/posterOrder';
// Auto-discovered Avisos posters from `src/assets/avisos/`.
// Mirrors what AvisosPostersSection renders on the public page so the
// admin preview always matches the live site.
import { AVISOS_POSTERS } from '@/lib/posterAssets';
// Server-uploaded posters take precedence over build-time assets so the
// admin preview matches what visitors actually see on /avisos.
import { useUploadsList } from '@/hooks/useUploads';
import AdminInheritControl from './AdminInheritControl';

// ============= Constants =============

/** Allowed column counts (1–4 to match Eventos) */
const COLUMN_OPTIONS = [1, 2, 3, 4] as const;

/** Gap preset options: label + Tailwind-equivalent pixel value used in preview */
const GAP_OPTIONS: { value: EventosGap; label: string; px: number }[] = [
  { value: 'sm', label: 'SM', px: 8 },
  { value: 'md', label: 'MD', px: 16 },
  { value: 'lg', label: 'LG', px: 24 },
  { value: 'xl', label: 'XL', px: 32 },
];

/** Default config when nothing is stored on the server yet */
export const DEFAULT_AVISOS_CONFIG: AvisosConfig = {
  desktopColumns: 3,
  mobileColumns: 1,
  desktopGap: 'md',
  mobileGap: 'sm',
};

/**
 * Build-time fallback poster URLs from `src/assets/avisos/`. Used only when
 * no images have been uploaded to the server via `/admin` → tab "Archivos".
 */
const BUILT_IN_PREVIEW_POSTERS: string[] = AVISOS_POSTERS.map((p) => p.src);

// ============= Helpers =============

/** Get the px value of a gap preset (used inline for accurate preview spacing) */
const gapToPx = (g: EventosGap) =>
  GAP_OPTIONS.find((opt) => opt.value === g)?.px ?? 16;

// ============= Sub-component: Column / Gap selector =============

interface SelectorRowProps {
  label: string;
  columns: number;
  gap: EventosGap;
  onColumnsChange: (n: number) => void;
  onGapChange: (g: EventosGap) => void;
}

/**
 * SelectorRow
 * Renders the column-count and gap pickers for one breakpoint (desktop or mobile).
 */
const SelectorRow = ({
  label,
  columns,
  gap,
  onColumnsChange,
  onGapChange,
}: SelectorRowProps) => (
  <div className="space-y-3">
    <Label className="text-sm font-semibold">{label}</Label>

    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Columnas</Label>
      <div className="flex flex-wrap gap-2">
        {COLUMN_OPTIONS.map((opt) => (
          <Button
            key={opt}
            variant={columns === opt ? 'default' : 'outline'}
            size="sm"
            onClick={() => onColumnsChange(opt)}
            className={cn('min-w-[2.75rem]', columns === opt && 'pointer-events-none')}
          >
            {opt}
          </Button>
        ))}
      </div>
    </div>

    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Espaciado</Label>
      <div className="flex flex-wrap gap-2">
        {GAP_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={gap === opt.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => onGapChange(opt.value)}
            className={cn('min-w-[2.75rem]', gap === opt.value && 'pointer-events-none')}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  </div>
);

// ============= Sub-component: Preview Frame =============

interface PreviewFrameProps {
  /** Frame width in pixels — simulates the device viewport */
  frameWidth: number;
  /** Number of grid columns to render */
  columns: number;
  /** Spacing preset between cards */
  gap: EventosGap;
  /** Header label rendered above the frame */
  title: string;
  /** Icon component shown next to the title */
  icon: React.ReactNode;
  /**
   * Resolved poster order (full list of indices into `posters`).
   * Drag-and-drop mutates this list via `onOrderChange`.
   */
  order: number[];
  /**
   * Source poster URLs the `order` indices refer to. Provided by the
   * parent so the preview can switch between server-uploaded files and
   * the build-time fallback without code duplication.
   */
  posters: string[];
  /** Called with a NEW order array whenever the admin drags a poster. */
  onOrderChange: (next: number[]) => void;
  /** Optional handler to restore the default static order. */
  onReset?: () => void;
}

/**
 * PreviewFrame
 * Fixed-width container that renders the poster grid exactly as it will
 * appear on the public page for the corresponding breakpoint.
 *
 * Drag-and-drop: each poster has a small grip handle. Reordering only
 * updates the local draft state — the admin must press "Guardar cambios"
 * to persist it to `site_config.avisos_config`.
 */
const PreviewFrame = ({
  frameWidth,
  columns,
  gap,
  title,
  icon,
  order,
  posters,
  onOrderChange,
  onReset,
}: PreviewFrameProps) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  /**
   * Resolve the insertion slot from the cursor position inside a card.
   * Left half = insert before the card, right half = insert after it.
   * This avoids the upward-drag blind spot caused by separate overlay zones
   * in a wrapped grid layout.
   */
  const getDropSlot = (event: DragEvent<HTMLDivElement>, position: number) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const isRightHalf = event.clientX >= bounds.left + bounds.width / 2;
    return isRightHalf ? position + 1 : position;
  };

  /**
   * Commit a reorder by inserting the dragged poster before the target slot.
   * Explicit before/after targets solve the multi-row grid limitation of
   * list-oriented DnD libraries and preserve horizontal placement.
   */
  const commitDrop = (targetIndex: number) => {
    if (dragIndex === null) return;
    const next = moveItem(order, dragIndex, targetIndex);
    onOrderChange(next);
    setDragIndex(null);
    setDropIndex(null);
  };

  return (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-medium">{title}</span>
        <span className="text-xs">({frameWidth}px)</span>
      </div>
      {onReset && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="gap-1 h-7 text-xs"
          title="Restaurar orden original"
        >
          <RotateCcw className="h-3 w-3" />
          Restablecer
        </Button>
      )}
    </div>

    <div className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3">
      <div
        className="mx-auto bg-background rounded-md p-3 shadow-inner"
        style={{ width: frameWidth, maxWidth: '100%' }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: `${gapToPx(gap)}px`,
          }}
        >
          {order.map((posterIdx, position) => {
            const src = posters[posterIdx];
            if (!src) return null;

            const showBeforeMarker = dropIndex === position;
            const showAfterMarker = dropIndex === position + 1;
            const isDragging = dragIndex === position;

            return (
              <div
                key={`${title}-${posterIdx}`}
                className="relative"
                onDragOver={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  setDropIndex(getDropSlot(e, position));
                }}
                onDrop={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  commitDrop(getDropSlot(e, position));
                }}
              >
                {showBeforeMarker && (
                  <div className="absolute left-[-6px] top-2 bottom-2 z-30 w-[3px] rounded-full bg-primary" />
                )}
                {showAfterMarker && position === order.length - 1 && (
                  <div className="absolute right-[-6px] top-2 bottom-2 z-30 w-[3px] rounded-full bg-primary" />
                )}

                <div
                  draggable
                  onDragStart={() => {
                    setDragIndex(position);
                    setDropIndex(position);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDropIndex(null);
                  }}
                  className={cn(
                    'relative aspect-[9/16] overflow-hidden rounded-md border bg-card transition-opacity',
                    isDragging ? 'border-primary ring-2 ring-primary shadow-lg opacity-70' : 'border-border/50'
                  )}
                >
                  <div
                    className="absolute top-1 left-1 z-10 p-1 rounded bg-background/80 backdrop-blur-sm text-foreground/80 hover:text-foreground hover:bg-background cursor-grab active:cursor-grabbing"
                    title="Arrastra para reordenar"
                    aria-label="Arrastra para reordenar este aviso"
                  >
                    <GripVertical className="h-3 w-3" />
                  </div>
                  <div className="absolute bottom-1 right-1 z-10 px-1.5 py-0.5 rounded bg-background/80 backdrop-blur-sm text-[10px] font-mono font-bold text-foreground">
                    {position + 1}
                  </div>
                  <img
                    src={src}
                    alt={`Aviso ${posterIdx + 1}`}
                    loading="lazy"
                    className="h-full w-full object-contain pointer-events-none"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </div>
  );
};

// ============= Main Component =============

/**
 * AdminAvisos
 * Top-level admin section: selectors + dual preview + save action.
 */
const AdminAvisos = () => {
  const { data: siteConfig, isLoading } = useSiteConfig();
  const saveSiteConfig = useSaveSiteConfig();
  const { toast } = useToast();

  /** Local draft state — starts from server value or defaults */
  const [draft, setDraft] = useState<AvisosConfig>(DEFAULT_AVISOS_CONFIG);

  /**
   * Server-uploaded posters for this section. When present, they are the
   * source of truth shown by the public `AvisosPostersSection` page, so
   * the admin preview MUST mirror them — otherwise drag-to-reorder would
   * generate indices into the wrong list and persisted orders would not
   * match what visitors see.
   */
  const { data: uploadsData } = useUploadsList('avisos');
  const previewPosters = useMemo<string[]>(() => {
    const serverUrls = (uploadsData?.files ?? []).map((f) => f.url);
    return serverUrls.length > 0 ? serverUrls : BUILT_IN_PREVIEW_POSTERS;
  }, [uploadsData]);

  // Sync local draft whenever the server config (re)loads
  useEffect(() => {
    if (siteConfig?.avisos_config) {
      setDraft({ ...DEFAULT_AVISOS_CONFIG, ...siteConfig.avisos_config });
    }
  }, [siteConfig?.avisos_config]);

  /** Detect unsaved changes vs. server state */
  const savedConfig = siteConfig?.avisos_config ?? DEFAULT_AVISOS_CONFIG;

  /**
   * Single, shared poster order used by BOTH desktop and mobile previews
   * (and by the public site at every breakpoint). Falls back to the legacy
   * per-breakpoint fields when reading a config saved before unification,
   * so admins don't lose their previous customization.
   */
  const posterOrder = useMemo(
    () =>
      resolveOrder(
        previewPosters.length,
        draft.posterOrder ?? draft.desktopOrder ?? draft.mobileOrder
      ),
    [previewPosters.length, draft.posterOrder, draft.desktopOrder, draft.mobileOrder]
  );
  const savedPosterOrder = useMemo(
    () =>
      resolveOrder(
        previewPosters.length,
        savedConfig.posterOrder ?? savedConfig.desktopOrder ?? savedConfig.mobileOrder
      ),
    [previewPosters.length, savedConfig.posterOrder, savedConfig.desktopOrder, savedConfig.mobileOrder]
  );

  /** Compare two number arrays for equality (used to detect order changes) */
  const arraysEqual = (a: number[], b: number[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  const hasChanges = useMemo(
    () =>
      draft.desktopColumns !== savedConfig.desktopColumns ||
      draft.mobileColumns !== savedConfig.mobileColumns ||
      draft.desktopGap !== savedConfig.desktopGap ||
      draft.mobileGap !== savedConfig.mobileGap ||
      !arraysEqual(posterOrder, savedPosterOrder),
    [draft, savedConfig, posterOrder, savedPosterOrder]
  );

  /** Persist current draft to the server */
  const handleSave = () => {
    saveSiteConfig.mutate(
      {
        password: 'admin2025',
        // Always send a fully-resolved shared order so partial drafts
        // don't drift. Legacy per-breakpoint fields are dropped on save.
        avisos_config: {
          desktopColumns: draft.desktopColumns,
          mobileColumns: draft.mobileColumns,
          desktopGap: draft.desktopGap,
          mobileGap: draft.mobileGap,
          posterOrder,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: 'Configuración guardada',
            description: `Avisos: Desktop ${draft.desktopColumns} col / Mobile ${draft.mobileColumns} col.`,
          });
        },
        onError: (err) => {
          toast({
            title: 'Error al guardar',
            description: err.message,
            variant: 'destructive',
          });
        },
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Configuración de Avisos
        </CardTitle>
        <CardDescription>
          Define la cantidad de columnas y el espaciado del grid de avisos.
          Desktop y móvil se configuran por separado. Menos columnas = imágenes más grandes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Herencia desde el alcance General (multi-torneo). */}
        <AdminInheritControl section="avisos" />
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando configuración...
          </div>
        ) : (
          <>
            {/* Saved value indicator */}
            <p className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Guardado:&nbsp;
              <span className="font-mono font-bold">
                Desktop {savedConfig.desktopColumns}c/{savedConfig.desktopGap}
              </span>
              &nbsp;·&nbsp;
              <span className="font-mono font-bold">
                Mobile {savedConfig.mobileColumns}c/{savedConfig.mobileGap}
              </span>
            </p>

            {/* Selectors: side-by-side on desktop, stacked on mobile */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-lg border border-border bg-muted/20">
              <SelectorRow
                label="🖥️ Desktop"
                columns={draft.desktopColumns}
                gap={draft.desktopGap}
                onColumnsChange={(n) => setDraft((d) => ({ ...d, desktopColumns: n }))}
                onGapChange={(g) => setDraft((d) => ({ ...d, desktopGap: g }))}
              />
              <SelectorRow
                label="📱 Mobile"
                columns={draft.mobileColumns}
                gap={draft.mobileGap}
                onColumnsChange={(n) => setDraft((d) => ({ ...d, mobileColumns: n }))}
                onGapChange={(g) => setDraft((d) => ({ ...d, mobileGap: g }))}
              />
            </div>

            {/* Save button */}
            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={!hasChanges || saveSiteConfig.isPending}
                size="sm"
                className="gap-2"
              >
                {saveSiteConfig.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar cambios
              </Button>
            </div>

            {/* Dual preview */}
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-sm text-muted-foreground">
                  Vista previa en vivo · arrastra los pósters para reordenarlos
                </Label>
              </div>
              {/*
                Both previews share the SAME `posterOrder`. Dragging in
                either frame updates the single shared order, which then
                applies to desktop and mobile alike on the public page.
              */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <PreviewFrame
                  frameWidth={1100}
                  columns={draft.desktopColumns}
                  gap={draft.desktopGap}
                  title="Desktop"
                  icon={<Monitor className="h-4 w-4" />}
                  order={posterOrder}
                  posters={previewPosters}
                  onOrderChange={(next) =>
                    setDraft((d) => ({ ...d, posterOrder: next }))
                  }
                  onReset={() =>
                    setDraft((d) => ({
                      ...d,
                      posterOrder: identityOrder(previewPosters.length),
                    }))
                  }
                />
                <PreviewFrame
                  frameWidth={390}
                  columns={draft.mobileColumns}
                  gap={draft.mobileGap}
                  title="Mobile"
                  icon={<Smartphone className="h-4 w-4" />}
                  order={posterOrder}
                  posters={previewPosters}
                  onOrderChange={(next) =>
                    setDraft((d) => ({ ...d, posterOrder: next }))
                  }
                  onReset={() =>
                    setDraft((d) => ({
                      ...d,
                      posterOrder: identityOrder(previewPosters.length),
                    }))
                  }
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminAvisos;
