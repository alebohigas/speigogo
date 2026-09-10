/**
 * SitePopup
 * -----------------------------------------------------------------------
 * Global POP UP overlay rendered by <Layout />. Reads the site-wide
 * popup configuration from `useSiteConfig().popup_config` and shows a
 * centered image with a darkened backdrop on every route listed in
 * `paths`. The overlay opens once per page-load (re-opens on real
 * navigation thanks to useLocation), can be closed via the X button or
 * by clicking the backdrop, and auto-dismisses after `durationSeconds`
 * when > 0.
 *
 * The component is purely presentational — admins configure everything
 * from Admin > POP (AdminPopup.tsx).
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useEffectiveSiteConfig } from '@/hooks/useInheritConfig';
import type { PopupConfig } from '@/hooks/useSiteConfig';
import { cn } from '@/lib/utils';

/**
 * Render a single popup card. Extracted so we can lay out multiple slots
 * side-by-side within a shared modal backdrop.
 */
const PopupCard = ({ popup }: { popup: PopupConfig }) => {
  const widthPx = Math.max(200, popup.widthPx || 480);
  const fontFamilyMap: Record<string, string> = {
    sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    serif: 'ui-serif, Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    display: '"Playfair Display", Georgia, serif',
  };
  const hasText = Boolean(popup.text && popup.text.trim().length > 0);
  const textStyle: React.CSSProperties = {
    fontFamily: fontFamilyMap[popup.textFontFamily || 'sans'],
    fontSize: `${Math.max(10, popup.textFontSize || 16)}px`,
    fontWeight: popup.textBold ? 700 : 400,
    fontStyle: popup.textItalic ? 'italic' : 'normal',
    color: popup.textColor || '#0f172a',
    textAlign: (popup.textAlign || 'center') as React.CSSProperties['textAlign'],
    whiteSpace: 'pre-wrap',
    lineHeight: 1.4,
  };
  const textPosition = popup.textPosition || 'below';
  const hasImage = Boolean(popup.imageUrl);
  return (
    <div
      className={cn(
        'relative rounded-2xl bg-white shadow-2xl ring-1 ring-black/10',
        'animate-in zoom-in-95 duration-200'
      )}
      style={{ width: '100%', maxWidth: `${widthPx}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="rounded-2xl overflow-hidden">
        {hasText && textPosition === 'above' && (
          <div className="px-5 pt-5 pb-3" style={textStyle}>{popup.text}</div>
        )}
        {hasImage && (
          <img
            src={popup.imageUrl}
            alt={popup.altText || 'Anuncio'}
            className="block w-full h-auto max-h-[70vh] object-contain bg-white"
          />
        )}
        {hasText && textPosition === 'below' && (
          <div className="px-5 pt-3 pb-5" style={textStyle}>{popup.text}</div>
        )}
      </div>
    </div>
  );
};

/**
 * SitePopup
 * Renders up to 3 popup cards over a shared backdrop. Cards lay out
 * side-by-side on desktop (flex-row) and stacked on mobile (flex-col).
 */
const SitePopup = () => {
  const { data: siteConfig } = useEffectiveSiteConfig();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const raw = siteConfig?.popup_config;
  const slotsAll: PopupConfig[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

  // Only slots that are enabled, have content, and match this route.
  const slots = slotsAll.filter((p) => {
    if (!p?.enabled) return false;
    const hasContent = Boolean(p.imageUrl || (p.text && p.text.trim().length > 0));
    if (!hasContent) return false;
    const paths = p.paths;
    if (!paths || paths.length === 0) return false;
    return paths.includes('*') || paths.includes(location.pathname);
  });
  const isActive = slots.length > 0;

  useEffect(() => {
    setOpen(isActive);
  }, [isActive, location.pathname]);

  // Auto-dismiss: use the LONGEST duration across active slots (0 = manual only for that slot).
  const maxDuration = slots.reduce((max, p) => Math.max(max, p.durationSeconds || 0), 0);
  useEffect(() => {
    if (!open || maxDuration <= 0) return;
    const t = window.setTimeout(() => setOpen(false), maxDuration * 1000);
    return () => window.clearTimeout(t);
  }, [open, maxDuration]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || slots.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Anuncio"
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center p-4',
        'bg-black/70 backdrop-blur-sm overflow-auto',
        'animate-in fade-in duration-200'
      )}
      onClick={() => setOpen(false)}
    >
      {/* Close-all button lives at the corner of the row so a single X
          dismisses the whole overlay, regardless of how many slots show. */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => setOpen(false)}
        className={cn(
          'absolute top-4 right-4 z-20 inline-flex h-10 w-10 items-center justify-center',
          'rounded-full bg-white text-foreground shadow-lg ring-1 ring-black/10',
          'hover:bg-muted transition-colors'
        )}
      >
        <X className="h-5 w-5" />
      </button>
      <div className="flex flex-col md:flex-row items-center justify-center gap-4 max-w-full">
        {slots.map((p, i) => (
          <PopupCard key={i} popup={p} />
        ))}
      </div>
    </div>
  );
};

export default SitePopup;