/**
 * SponsorRibbon Component
 * Infinite scrolling ribbon of sponsor logos
 * Data fetched from sponsors.php via useSponsors hook
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSponsors } from '@/hooks/useTournamentData';
import { useEffectiveSiteConfig } from '@/hooks/useInheritConfig';
import SponsorLogoImage, { type SponsorLogoStatus } from '@/components/sponsors/SponsorLogoImage';
import { useIsMobile } from '@/hooks/use-mobile';

/**
 * Legacy localStorage key that used to persist "broken logo" sponsor IDs
 * between sessions. That cache proved harmful: a single transient network
 * failure (slow logo proxy, offline moment) permanently removed a sponsor
 * from the ribbon for that browser, so users only saw the most recently
 * added logos. Broken logos are now tracked in memory only (per page load)
 * and this key is purged on mount so old caches stop hiding sponsors.
 */
const LEGACY_BROKEN_SPONSORS_LS_KEY = 'sponsor-ribbon-broken-ids';

/** Remove the legacy persisted broken-ID cache (best-effort). */
const clearLegacyBrokenIds = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LEGACY_BROKEN_SPONSORS_LS_KEY);
  } catch {
    /* ignore storage errors */
  }
};

/**
 * SponsorRibbon
 * Infinite scrolling ribbon of sponsor logos.
 *
 * Visibility per route is admin-controlled via `sponsors_config.ribbonVisiblePages`
 * (managed in /admin → tab Patrocinadores). If no per-page config exists,
 * the ribbon defaults to visible everywhere.
 *
 * Order, randomization and the on-screen logo count are admin-controlled
 * via `sponsors_config.carousel` (Admin → Patrocinadores → Carrusel):
 *   - carousel.order:        custom display order (array of sponsor IDs)
 *   - carousel.randomize:    shuffle order on every render (overrides custom order)
 *   - carousel.visibleCount: how many logos are visible in the viewport at any
 *                            given time. Each slot is sized to `100% / visibleCount`
 *                            of the container width. The full sponsor set still
 *                            scrolls — this only controls visual density.
 *                            0 / undefined = legacy auto sizing.
 */
const SponsorRibbon = () => {
  const { data: sponsors = [] } = useSponsors();
  const { data: siteConfig, isVisualConfigReady } = useEffectiveSiteConfig();
  const { pathname } = useLocation();
  /**
   * Mobile override:
   * En vista mobile el `visibleCount` configurado por el admin (pensado para
   * desktop) provoca logos diminutos. Forzamos un slot ancho (1 logo "page"
   * por viewport) para que el patrocinador llene el alto disponible (h-20)
   * sin escalarse hacia abajo, y aceleramos el desplazamiento del ribbon.
   */
  const isMobile = useIsMobile();
  /**
   * Measured visible width of the ribbon viewport (the masked wrapper inside
   * the `.container`). We use this instead of `vw` so desktop respects the
   * exact configured `visibleCount`, even when the content is constrained by
   * Tailwind's `container` max-width.
   */
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(0);
  /**
   * Ref + measured width of the scrolling track (`.sponsor-scroll`). Measuring
   * the real rendered width lets us derive an animation duration that produces
   * a CONSTANT pixel-per-second speed, independent of how many logos are
   * visible or how many sponsors exist.
   */
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState<number>(0);
  /**
   * Window width, used as the STABLE reference for the ribbon's pixel speed.
   * Unlike the measured container width, it is never 0 during the first paint,
   * so the animation duration is identical on a fresh load and after a
   * client-side route change (Layout remounts the ribbon on every page).
   */
  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );

  /** Keep `windowWidth` in sync with the viewport. */
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /**
   * Keep `viewportWidth` in sync with the actual rendered ribbon width.
   * `ResizeObserver` catches desktop resizes, responsive breakpoint changes,
   * and container width changes without manual polling.
   */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const updateWidth = () => {
      setViewportWidth(el.clientWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  /**
   * Keep `trackWidth` in sync with the rendered sponsor strip width.
   *
   * Logos are <img> elements with `w-auto`, so the strip only reaches its final
   * width once every image has decoded. On a client-side navigation the images
   * come from cache and resolve at unpredictable times, which previously left
   * `trackWidth` stale and made the ribbon crawl until a hard refresh.
   * We therefore re-measure on: mount, ResizeObserver ticks, every image `load`
   * (captured on the track) and a couple of animation frames afterwards.
   */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const w = el.scrollWidth;
      setTrackWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
    };
    const scheduleUpdate = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    update();
    scheduleUpdate();
    const observer = new ResizeObserver(() => scheduleUpdate());
    observer.observe(el);
    el.addEventListener('load', scheduleUpdate, true);
    return () => {
      observer.disconnect();
      el.removeEventListener('load', scheduleUpdate, true);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [sponsors.length, pathname]);

  /**
   * Apply admin carousel config (order / randomize / visibleCount) to the
   * raw sponsor list before duplicating it for the infinite-scroll loop.
   * Memoized so randomization happens once per mount/data change instead of
   * on every re-render.
   */
  const carousel = siteConfig?.sponsors_config?.carousel;
  /**
   * Track sponsor IDs whose logo image failed to load IN THIS SESSION only.
   * Never persisted: a transient failure must not permanently exclude a
   * sponsor from the ribbon, which previously made only the newest sponsors
   * appear on some browsers.
   */
  const [brokenIds, setBrokenIds] = useState<Set<string>>(() => new Set());
  /** Sponsors whose image has completed successfully during this page load. */
  const [readyIds, setReadyIds] = useState<Set<string>>(() => new Set());

  /** Purge any legacy persisted broken-ID cache from previous versions. */
  useEffect(() => {
    clearLegacyBrokenIds();
  }, []);

  /** Mark/unmark a sponsor as broken based on the image load status. */
  const handleStatus = useCallback((id: string, status: SponsorLogoStatus) => {
    setBrokenIds((prev) => {
      const isBroken = status === 'error';
      if (isBroken && prev.has(id)) return prev;
      if (!isBroken && !prev.has(id)) return prev;
      const next = new Set(prev);
      if (isBroken) next.add(id);
      else next.delete(id);
      return next;
    });
    setReadyIds((prev) => {
      const isReady = status === 'ok';
      if (isReady && prev.has(id)) return prev;
      if (!isReady && !prev.has(id)) return prev;
      const next = new Set(prev);
      if (isReady) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const orderedSponsors = useMemo(() => {
    if (!sponsors.length) return [];
    // Drop sponsors with no logo URL up-front; broken-on-load ones are
    // additionally filtered via `brokenIds` after render.
    let list = sponsors.filter((s) => Boolean(s.logoUrl) && !brokenIds.has(String(s.id)));

    // Admin whitelist: when `enabledIds` is defined, only render those sponsors.
    // When undefined (legacy / never configured), show every sponsor with a logo.
    if (carousel?.enabledIds) {
      const allow = new Set(carousel.enabledIds.map((n) => Number(n)));
      list = list.filter((s) => allow.has(Number(s.id)));
    }

    if (carousel?.randomize) {
      // Fisher–Yates shuffle for an unbiased random order
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    } else if (carousel?.order && carousel.order.length > 0) {
      // Apply custom order: configured IDs first (in admin order), then any
      // sponsors not present in the order array (preserves server alphabetical order).
      const indexById = new Map<number, number>();
      carousel.order.forEach((id, idx) => indexById.set(id, idx));
      list.sort((a, b) => {
        const ai = indexById.has(Number(a.id)) ? (indexById.get(Number(a.id)) as number) : Number.POSITIVE_INFINITY;
        const bi = indexById.has(Number(b.id)) ? (indexById.get(Number(b.id)) as number) : Number.POSITIVE_INFINITY;
        return ai - bi;
      });
    }

    return list;
  }, [sponsors, brokenIds, carousel?.randomize, carousel?.order, carousel?.enabledIds]);

  // Per-page visibility map from server config — undefined = legacy default (show everywhere)
  const ribbonVisiblePages = siteConfig?.sponsors_config?.ribbonVisiblePages;
  // Never paint the ribbon with provisional visibility while scoped/general
  // config is still loading; doing so caused a temporary white band above Hero.
  if (!isVisualConfigReady) {
    return null;
  }
  if (ribbonVisiblePages && ribbonVisiblePages[pathname] === false) {
    return null;
  }

  /**
   * Per-page sticky-on-mobile configuration. When enabled for the current
   * route AND the viewport is mobile, render the ribbon container with
   * `sticky top-0 z-40` so it stays pinned while the user scrolls the page.
   * Desktop always renders the ribbon in-flow.
   */
  const ribbonStickyMobilePages = siteConfig?.sponsors_config?.ribbonStickyMobilePages;
  const isStickyMobile = isMobile && ribbonStickyMobilePages?.[pathname] === true;

  // Load logos without occupying layout space. The visible white ribbon is
  // mounted only after at least one image succeeds, preventing a temporary
  // empty band when every configured image is slow or broken.
  const hasReadySponsor = orderedSponsors.some((sponsor) => readyIds.has(String(sponsor.id)));
  const probeSponsors = hasReadySponsor ? [] : orderedSponsors;

  /**
   * On-screen logo density.
   *  - Desktop: respects the admin-configured `visibleCount`.
   *  - Mobile: ignores `visibleCount` entirely so the ribbon can pack as many
   *    logos as possible using each image's natural width.
   */
  const configuredVisibleCount = carousel?.visibleCount ?? 0;
  const visibleCount = isMobile ? 0 : configuredVisibleCount;
  /**
   * Slot sizing:
   *  - Desktop with visibleCount > 0: fixed fractional width per logo.
   *  - Mobile / auto mode: natural width with minimal horizontal spacing so
   *    logos fill the ribbon without large empty gaps.
   *
   * IMPORTANT: The flex track (`.sponsor-scroll`) uses `width: max-content`
   * for seamless infinite scrolling. Because of that, percentage-based slot
   * widths are unreliable there. Instead, we measure the VISIBLE ribbon width
   * (`viewportWidth`) and assign each slot an exact pixel width:
   *
   *   slotWidthPx = viewportWidth / visibleCount
   *
   * We also add `box-border` so the horizontal padding is INCLUDED inside that
   * width. Without `box-border`, padding made each slot wider than expected,
   * which is why desktop showed fewer logos than the configured count.
   */
  const slotClass =
    visibleCount > 0
      ? 'box-border flex-shrink-0 px-4 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity duration-300'
      : isMobile
        ? 'box-border flex-shrink-0 px-2 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity duration-300'
        : 'box-border flex-shrink-0 mx-8 opacity-60 hover:opacity-100 transition-opacity duration-300';
  const slotStyle: React.CSSProperties =
    visibleCount > 0 && viewportWidth > 0
      ? { width: `${viewportWidth / visibleCount}px` }
      : {};

  /**
   * Animation speed.
   * The animation translates the track by `-50%` (= one full pass of
   * `interleaved`). When slots are sized in `vw`, a pass measures
   *   passWidthVw = interleaved.length * (100 / visibleCount)
   * To keep a constant perceived speed (~one viewport every `secondsPerViewport`
   * seconds) regardless of how many logos are visible at once or how many
   * sponsors exist, we scale the animation duration with the track width:
   *   duration = (passWidthVw / 100) * secondsPerViewport
   * This way visibleCount=5 with many logos doesn't feel like a freight train,
   * and visibleCount=1 with few logos doesn't feel sluggish.
   */

  /**
   * Build the visible sequence by repeating the sponsor list enough times
   * so the ribbon always shows ≥`visibleCount` logos on screen at once,
   * with the same logo never appearing back-to-back.
   *
   * The legacy ribbon comfortably fits ≈4 logos in the viewport. So when
   * the admin asks for `visibleCount = N`, we need each base "page" of
   * sponsors repeated enough times to fill ≥N logos per viewport width.
   * Concretely: `sponsorRepeats = ceil(N / sponsors.length) * baseFactor`
   * where `baseFactor` lifts low values so 1 sponsor with N=2 → 4 copies
   * per loop (interleaved becomes A A A A — but with multiple sponsors it
   * round-robins, e.g. [A,B] × 4 → A,B,A,B,A,B,A,B).
   */
  // Repeat the sponsor list enough times so a SINGLE pass (`interleaved`) is
  // already wider than the viewport. The CSS animation translates the strip
  // by -50% (one full pass), so if a single pass is narrower than the screen
  // the ribbon visibly "jumps back" when the loop wraps. Targeting at least
  // 2× visibleCount logos per pass — and never fewer than 12 — keeps the
  // scroll continuous even when the admin selected only 1–3 sponsors and
  // the viewport is wide enough to show 6+ slots simultaneously.
  const targetPerPass = Math.max(visibleCount > 0 ? visibleCount * 3 : 12, 12);
  const copiesPerSponsor =
    orderedSponsors.length === 0
      ? 1
      : Math.max(1, Math.ceil(targetPerPass / orderedSponsors.length));
  const interleaved = orderedSponsors.length === 0
    ? []
    : Array.from({ length: copiesPerSponsor }).flatMap(() => orderedSponsors);
  // Duplicate once more for the seamless CSS infinite-scroll loop.
  const duplicatedSponsors = [...interleaved, ...interleaved];

  /**
   * Compute the animation duration so the ribbon advances at a constant
   * perceived speed (≈ one viewport width every `secondsPerViewport` seconds)
   * regardless of `visibleCount` or sponsor count.
   *
   *   passWidthVw = interleaved.length * (100 / visibleCount)
   *   duration    = (passWidthVw / 100) * secondsPerViewport
   *
   * Mobile uses natural-width slots (visibleCount = 0) — fall back to a
   * fixed 18s loop which felt right in QA.
   */
  /**
   * Admin-configured speed (Admin → Patrocinadores → Carrusel → "Velocidad"),
   * expressed as SECONDS PER SCREEN WIDTH: menor = más rápido.
   * Clamped to the same range exposed by the admin slider (2s … 60s) so a
   * stale/incorrect stored value can never freeze the ribbon.
   */
  /**
   * Mobile uses its own slider (`speedSecondsMobile`) because natural-width
   * slots make the desktop value feel wrong on phones. Falls back to the
   * desktop value when the mobile speed was never configured.
   */
  const rawSpeed = isMobile
    ? Number(carousel?.speedSecondsMobile) || Number(carousel?.speedSeconds) || 6
    : Number(carousel?.speedSeconds) || 6;
  const SECONDS_PER_SCREEN = Math.min(60, Math.max(2, rawSpeed));
  /**
   * Reference width used to translate "seconds per screen" into pixels/second.
   * Prefer the measured ribbon viewport (respects the `container` max-width)
   * and fall back to the window width before the first measurement lands.
   */
  const referenceWidth = viewportWidth || windowWidth || 1280;
  /** Constant pixel speed, independent of logo count / visibleCount. */
  const pxPerSec = referenceWidth / SECONDS_PER_SCREEN;
  /**
   * Duration of a full `-50%` pass (= one copy of `interleaved`).
   * passWidth = trackWidth / 2 → duration = passWidth / pxPerSec.
   * While `trackWidth` is still unknown (first paint), estimate the pass width
   * from the number of logos so the ribbon never starts at a wrong speed.
   */
  const estimatedPassWidth = Math.max(1, interleaved.length) * 160;
  const passWidth = trackWidth > 0 ? trackWidth / 2 : estimatedPassWidth;
  const animationDurationSec = Math.max(1, passWidth / pxPerSec);
  const animationStyle: React.CSSProperties = {
    animationDuration: `${animationDurationSec.toFixed(2)}s`,
  };

  if (orderedSponsors.length === 0 && probeSponsors.length === 0) return null;

  if (!hasReadySponsor) {
    return (
      <div aria-hidden="true" className="fixed h-0 w-0 overflow-hidden pointer-events-none">
        {probeSponsors.map((sponsor) => (
          <SponsorLogoImage
            key={`probe-${sponsor.id}`}
            url={sponsor.logoUrl}
            alt=""
            onStatusChange={(status) => handleStatus(String(sponsor.id), status)}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`bg-white border-y border-border py-3 md:py-4 overflow-hidden ${
        isStickyMobile ? 'sticky top-[6.65rem] z-40 shadow-sm' : ''
      }`}
    >
      <div className="container mx-auto">
        <div ref={viewportRef} className="fade-edge-left">
          <div ref={trackRef} className="flex items-center sponsor-scroll" style={animationStyle}>
            {duplicatedSponsors.map((sponsor, index) => (
              <div
                key={`${sponsor.id}-${index}`}
                className={slotClass}
                style={slotStyle}
              >
                {sponsor.websiteUrl ? (
                  <a
                    href={sponsor.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <SponsorLogoImage
                      url={sponsor.logoUrl}
                      alt={sponsor.name}
                      onStatusChange={(s) => handleStatus(String(sponsor.id), s)}
                      className="h-[56px] md:h-[72px] w-auto max-w-none object-contain transition-all duration-300"
                    />
                  </a>
                ) : (
                  <SponsorLogoImage
                    url={sponsor.logoUrl}
                    alt={sponsor.name}
                    onStatusChange={(s) => handleStatus(String(sponsor.id), s)}
                    className="h-[56px] md:h-[72px] w-auto max-w-none object-contain transition-all duration-300"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SponsorRibbon;
