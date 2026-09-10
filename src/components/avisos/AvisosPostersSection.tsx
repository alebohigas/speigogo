/**
 * AvisosPostersSection
 * -------------------------------------------------------------
 * Renders a responsive grid of aviso poster cards (climatological notice,
 * pricing tables, etc.). Mirrors `MenusPostersSection` / `AtraccionesSection`
 * in structure and behavior so the Avisos page shares the same visual
 * language and lightbox UX.
 *
 * Each card displays a poster imported from `src/assets/avisos` or uploaded
 * through /admin. Clicking a card opens a lightbox dialog showing the full
 * image, with keyboard (← →) and on-screen navigation between images.
 *
 * Design notes:
 *  - Uses semantic tokens only (bg-card, border-border, text-foreground...).
 *  - Mobile: image fills the card width at its natural height (no letterbox).
 *  - Desktop: image fills a 3/4 box with `object-cover` for uniform grids.
 *  - Lazy-loaded images for performance.
 *  - Layout (columns + gap per breakpoint) is controlled by the admin via
 *    `site_config.avisos_config` and read through `useSiteConfig`.
 */

import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type AvisosConfig, type EventosGap } from '@/hooks/useSiteConfig';
import { useEffectiveSiteConfig } from '@/hooks/useInheritConfig';
import { applyOrder } from '@/lib/posterOrder';
import { useUploadsList } from '@/hooks/useUploads';
// Auto-discovered poster list — anything dropped into `src/assets/avisos/`
// is picked up automatically (sorted alphabetically by file name). See
// `src/lib/posterAssets.ts` for the discovery rules.
import { AVISOS_POSTERS as DISCOVERED_AVISOS_POSTERS } from '@/lib/posterAssets';

/**
 * AvisoCard - shape describing one poster card.
 * `src` : imported image module (string URL after Vite processing).
 * `alt` : accessibility label.
 */
interface AvisoCard {
  /** Full-resolution image URL (used by the lightbox). */
  src: string;
  /** Accessibility label. */
  alt: string;
  /** ~480px WebP thumbnail for the grid card (optional). */
  thumbSmall?: string;
  /** ~1000px WebP thumbnail — lightbox placeholder while `src` loads. */
  thumbMedium?: string;
}

/**
 * Ordered list of aviso posters.
 *
 * The list is **auto-discovered** from `src/assets/avisos/` via
 * `posterAssets.ts`, then mapped to the local `AvisoCard` shape. To add
 * or remove a poster, simply drop / delete a `.webp` (or `.jpg`/`.png`)
 * file in that folder — no code edit required. Files are sorted in
 * case-insensitive natural order, so prefix names with numeric tokens
 * (e.g. `01-clima.webp`, `02-tabla.webp`) to control the default order.
 * The admin panel can still override the order at runtime.
 */
/**
 * Build-time fallback list. Used when no images have been uploaded to the
 * server yet — keeps the page functional out of the box.
 */
const BUILT_IN_AVISOS_POSTERS: AvisoCard[] = DISCOVERED_AVISOS_POSTERS.map((p) => ({
  src: p.src,
  alt: p.alt,
}));

/** @deprecated Kept for backward-compat with any external imports. */
export const AVISOS_POSTERS: AvisoCard[] = BUILT_IN_AVISOS_POSTERS;

// ============= Layout helpers =============

/** Default layout when no admin config is set */
const DEFAULT_CONFIG: AvisosConfig = {
  desktopColumns: 3,
  mobileColumns: 1,
  desktopGap: 'md',
  mobileGap: 'sm',
};

/**
 * Static Tailwind class maps. Defined as full class strings so Tailwind's
 * JIT compiler can detect and include them in the build.
 */
const MOBILE_COL_CLASS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

const DESKTOP_COL_CLASS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

const MOBILE_GAP_CLASS: Record<EventosGap, string> = {
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
};

const DESKTOP_GAP_CLASS: Record<EventosGap, string> = {
  sm: 'md:gap-2',
  md: 'md:gap-4',
  lg: 'md:gap-6',
  xl: 'md:gap-8',
};

/**
 * AvisosPostersSection
 * Displays the poster grid + lightbox modal with keyboard navigation.
 */
const AvisosPostersSection = () => {
  // Pull admin-configurable layout from site_config (with safe defaults).
  const { data: siteConfig } = useEffectiveSiteConfig();
  const cfg: AvisosConfig = {
    ...DEFAULT_CONFIG,
    ...(siteConfig?.avisos_config ?? {}),
  };

  // Server-side uploaded posters. Take precedence over build-time assets so
  // editors can replace/extend the grid via /admin without a re-deploy.
  const { data: uploadsData } = useUploadsList('avisos');
  // Server-generated thumbnails (see server/api/_thumbs.php) keep the grid
  // light: cards load the ~480px variant instead of the multi-MB poster.
  const serverPosters: AvisoCard[] = (uploadsData?.files ?? []).map((f) => ({
    src: f.url,
    alt: f.alt,
    thumbSmall: f.thumbs?.small ?? f.thumbUrl ?? undefined,
    thumbMedium: f.thumbs?.medium ?? undefined,
  }));
  const sourcePosters: AvisoCard[] = serverPosters.length > 0
    ? serverPosters
    : BUILT_IN_AVISOS_POSTERS;

  // Single shared poster order for desktop AND mobile. Falls back to the
  // legacy per-breakpoint fields (preferring desktopOrder) so previously
  // saved configs keep working without a migration.
  const activeOrder = cfg.posterOrder ?? cfg.desktopOrder ?? cfg.mobileOrder;
  const orderedPosters = applyOrder(sourcePosters, activeOrder);

  /**
   * Compose the responsive grid class string from the admin-selected
   * column counts and gap presets. Mobile = base, desktop = md: prefix.
   */
  const gridClass = cn(
    'grid',
    MOBILE_COL_CLASS[cfg.mobileColumns] ?? 'grid-cols-1',
    DESKTOP_COL_CLASS[cfg.desktopColumns] ?? 'md:grid-cols-3',
    MOBILE_GAP_CLASS[cfg.mobileGap] ?? 'gap-4',
    DESKTOP_GAP_CLASS[cfg.desktopGap] ?? 'md:gap-6'
  );

  // Index of the currently open image in the lightbox; null = closed.
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // Navigation helpers (memoized so they're stable for the keydown handler).
  const goPrev = useCallback(() => {
    setOpenIndex((i) => (i === null ? null : (i - 1 + orderedPosters.length) % orderedPosters.length));
  }, [orderedPosters.length]);

  const goNext = useCallback(() => {
    setOpenIndex((i) => (i === null ? null : (i + 1) % orderedPosters.length));
  }, [orderedPosters.length]);

  // Keyboard navigation while the lightbox is open.
  useEffect(() => {
    if (openIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [openIndex, goPrev, goNext]);

  /**
   * Set of poster URLs whose grid thumbnail has finished decoding. Used to
   * cross-fade each card in and hide its skeleton placeholder.
   */
  const [loadedCards, setLoadedCards] = useState<Set<string>>(() => new Set());

  /** Mark one card as loaded (idempotent — never re-renders twice per image). */
  const markLoaded = useCallback((src: string) => {
    setLoadedCards((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
  }, []);

  const current = openIndex !== null ? orderedPosters[openIndex] : null;

  /**
   * True once the full-resolution image of the currently open poster has
   * finished downloading. Until then the lightbox shows the medium
   * thumbnail, so opening a poster feels instant.
   */
  const [fullLoaded, setFullLoaded] = useState(false);

  useEffect(() => {
    if (!current) return;
    setFullLoaded(false);
    const img = new Image();
    img.onload = () => setFullLoaded(true);
    img.src = current.src;
    // Already in the HTTP cache → resolve synchronously.
    if (img.complete) setFullLoaded(true);
    return () => {
      img.onload = null;
    };
  }, [current?.src]);

  /**
   * Prefetch the medium thumbnails of the previous/next posters while the
   * lightbox is open, so ← → navigation paints without a blank frame.
   */
  useEffect(() => {
    if (openIndex === null || orderedPosters.length < 2) return;
    const neighbours = [
      orderedPosters[(openIndex + 1) % orderedPosters.length],
      orderedPosters[(openIndex - 1 + orderedPosters.length) % orderedPosters.length],
    ];
    const imgs = neighbours.map((n) => {
      const img = new Image();
      img.src = n.thumbMedium ?? n.src;
      return img;
    });
    return () => {
      imgs.forEach((img) => { img.src = ''; });
    };
  }, [openIndex, orderedPosters]);

  return (
    <section className="py-8 md:py-16 bg-muted/30">
      <div className="container mx-auto px-2 md:px-4">
        {/* ---------- Section header ---------- */}
        <div className="text-center mb-6 md:mb-10">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-2">
            Comunicados Importantes del Torneo
          </h2>
          <p className="text-muted-foreground">
            Avisos importantes, tablas de inscripción y accesos para participantes
          </p>
        </div>

        {/* ---------- Responsive poster grid ---------- */}
        <div className={gridClass}>
          {orderedPosters.map((card, idx) => (
            <button
              key={card.src}
              type="button"
              onClick={() => setOpenIndex(idx)}
              className={cn(
                'group relative overflow-hidden rounded-lg border border-border/50 bg-card',
                'shadow-card transition-all duration-300',
                'hover:shadow-elegant hover:-translate-y-1 hover:border-primary/40',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background'
              )}
              aria-label={`Ver ${card.alt} en grande`}
            >
              {/*
                Mobile: drop the fixed 9/16 box so the poster fills the full
                card width with its natural height — no letterbox padding
                above/below. Desktop keeps a 3/4 ratio so the multi-column
                grid stays uniform; `object-cover` trims edges but fills the
                frame.
              */}
              <div className="relative w-full min-h-[200px] overflow-hidden bg-card md:aspect-[3/4]">
                {/*
                  Skeleton placeholder: a shimmering muted block that occupies
                  the card box until the thumbnail decodes. On mobile it is
                  pinned while the natural-height image loads; on desktop it
                  fills the fixed 3/4 box.
                */}
                {!loadedCards.has(card.src) && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-muted/60 to-muted"
                  />
                )}
                {/*
                  Prefer the generated thumbnails. `srcSet` lets the browser
                  pick the 480px variant on phones/cards and the 1000px one on
                  wide, few-column layouts; `src` stays as a safe fallback for
                  build-time assets or servers without GD.
                */}
                <img
                  src={card.thumbSmall ?? card.src}
                  srcSet={
                    card.thumbSmall && card.thumbMedium
                      ? `${card.thumbSmall} 480w, ${card.thumbMedium} 1000w`
                      : undefined
                  }
                  sizes="(max-width: 768px) 100vw, 33vw"
                  alt={card.alt}
                  /* First two cards are above the fold on every layout →
                     load them eagerly with high priority; the rest wait for
                     the viewport (native lazy loading). */
                  loading={idx < 2 ? 'eager' : 'lazy'}
                  fetchPriority={idx < 2 ? 'high' : 'low'}
                  decoding="async"
                  onLoad={() => markLoaded(card.src)}
                  onError={() => markLoaded(card.src)}
                  className={cn(
                    'relative w-full h-auto object-contain',
                    'md:absolute md:inset-0 md:h-full md:w-full md:object-cover',
                    'transition-[opacity,transform] duration-500 group-hover:scale-105',
                    loadedCards.has(card.src) ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Lightbox dialog ---------- */}
      <Dialog open={openIndex !== null} onOpenChange={(o) => !o && setOpenIndex(null)}>
        <DialogContent
          className={cn(
            'max-w-3xl w-[95vw] p-0 bg-transparent border-0 shadow-none',
            '[&>button]:hidden' // Hide the default Dialog close button; we render a custom one.
          )}
        >
          {/* Accessible label for screen readers */}
          <DialogTitle className="sr-only">
            {current ? current.alt : 'Aviso'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Vista ampliada del aviso. Use las flechas para navegar.
          </DialogDescription>
          {current && (
            <div className="relative">
              {/* Custom close button */}
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-2 right-2 z-10 rounded-full bg-background/80 backdrop-blur hover:bg-background"
                onClick={() => setOpenIndex(null)}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </Button>

              {/* Previous navigation button */}
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/80 backdrop-blur hover:bg-background"
                onClick={goPrev}
                aria-label="Imagen anterior"
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>

              {/* Next navigation button */}
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/80 backdrop-blur hover:bg-background"
                onClick={goNext}
                aria-label="Imagen siguiente"
              >
                <ChevronRight className="h-6 w-6" />
              </Button>

              {/*
                Progressive lightbox image: the already-cached medium
                thumbnail paints immediately, then the full-resolution file
                swaps in once decoded (see `fullLoaded`).
              */}
              {/* Placeholder behind the image: keeps the dialog from showing
                  a transparent hole before the first byte paints. */}
              {!fullLoaded && !current.thumbMedium && (
                <div
                  aria-hidden="true"
                  className="absolute inset-0 animate-pulse rounded-lg bg-muted/70"
                />
              )}
              <img
                src={fullLoaded || !current.thumbMedium ? current.src : current.thumbMedium}
                alt={current.alt}
                decoding="async"
                fetchPriority="high"
                className="relative w-full h-auto max-h-[90vh] object-contain rounded-lg"
              />

              {/* Counter label */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-background/80 backdrop-blur text-xs text-foreground font-medium">
                {(openIndex ?? 0) + 1} / {orderedPosters.length}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default AvisosPostersSection;
