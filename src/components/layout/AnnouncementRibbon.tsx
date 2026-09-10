/**
 * AnnouncementRibbon
 * -----------------------------------------------------------------------
 * Site-wide scrolling text ribbon rendered between the top header and the
 * sponsor ribbon. Configuration lives in `site_config.anuncio_config`
 * (managed from Admin > Anuncio) and applies to every page of the site.
 *
 * Reuses the existing `scroll-sponsors` keyframes (translateX 0 → -50%)
 * with a duplicated content string, so the loop is seamless.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useEffectiveSiteConfig } from '@/hooks/useInheritConfig';
import type { AnuncioConfig } from '@/hooks/useSiteConfig';
import { isAnuncioWithinSchedule } from '@/lib/anuncioSchedule';

/**
 * Maps the admin-selected font family preset to a CSS font-family stack.
 * Kept in sync with the AdminAnuncio font picker.
 */
const FONT_FAMILY_MAP: Record<string, string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, serif',
  mono: 'ui-monospace, SFMono-Regular, monospace',
  display: '"Playfair Display", Georgia, serif',
};

/**
 * Renders a single scrolling ribbon for one AnuncioConfig slot.
 * Kept as a subcomponent so the parent can stack N of them vertically.
 */
const RibbonRow = ({ cfg }: { cfg: AnuncioConfig }) => {
  const raw = (cfg.text ?? '').trim();
  if (!raw) return null;
  const unit = `${raw}\u00A0\u00A0\u00A0•\u00A0\u00A0\u00A0`;
  const repeatedText = unit.repeat(8);
  const speed = Math.max(5, Number(cfg.speedSeconds) || 30);
  const textStyle: React.CSSProperties = {
    color: cfg.textColor || '#ffffff',
    fontFamily: FONT_FAMILY_MAP[cfg.fontFamily] || FONT_FAMILY_MAP.sans,
    fontSize: `${cfg.fontSize || 16}px`,
    fontWeight: cfg.bold ? 700 : 500,
    fontStyle: cfg.italic ? 'italic' : 'normal',
    letterSpacing: '0.02em',
  };
  return (
    <div
      className="w-full overflow-hidden border-y border-border"
      style={{ backgroundColor: cfg.bgColor || '#111827' }}
      role="marquee"
      aria-label="Anuncio del torneo"
    >
      <div
        className="sponsor-scroll flex whitespace-nowrap py-2"
        style={{ animationDuration: `${speed}s` }}
      >
        <span className="px-4" style={textStyle}>{repeatedText}</span>
        <span className="px-4" aria-hidden="true" style={textStyle}>{repeatedText}</span>
      </div>
    </div>
  );
};

/**
 * AnnouncementRibbon
 * Reads global config and renders up to 3 scrolling messages stacked
 * vertically, one per enabled/matching slot. Returns null when nothing
 * qualifies for the current route.
 */
const AnnouncementRibbon = () => {
  const { data: siteConfig } = useEffectiveSiteConfig();
  const location = useLocation();
  const raw = siteConfig?.anuncio_config;
  // Normalize legacy single-object payloads to an array.
  const slots: AnuncioConfig[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

  // Reloj interno: se refresca cada 15 s para que la tira aparezca/desaparezca
  // exactamente al llegar la hora de inicio o de fin del temporizador.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  const active = slots.filter((cfg) => {
    if (!cfg?.enabled) return false;
    if (!cfg.text || !cfg.text.trim()) return false;
    if (!isAnuncioWithinSchedule(cfg, now)) return false;
    const paths = cfg.paths;
    return (
      !paths ||
      paths.length === 0 ||
      paths.includes('*') ||
      paths.includes(location.pathname)
    );
  });

  if (active.length === 0) return null;
  /**
   * Si algún anuncio activo está marcado como sticky, el stack completo se
   * fija debajo del header (usando la variable CSS `--header-height` que
   * publica <Header />) en todos los dispositivos, quedando entre el menú y
   * el carrusel de patrocinadores.
   */
  const isSticky = active.some((cfg) => cfg.sticky);
  return (
    <div
      className={`w-full flex flex-col ${isSticky ? 'sticky z-40 shadow-sm' : ''}`}
      style={isSticky ? { top: 'var(--header-height, 0px)' } : undefined}
    >
      {active.map((cfg, i) => (
        <RibbonRow key={i} cfg={cfg} />
      ))}
    </div>
  );
};

export default AnnouncementRibbon;
