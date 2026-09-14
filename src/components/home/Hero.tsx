/**
 * Hero Section
 * Displays tournament name (split: Roman numeral + rest), dates, and club name
 * Data fetched from tournament.php via useTournamentInfo hook
 * 
 * Tournament names follow the pattern: "XLVI TORNEO ANUAL SEMANA SANTA"
 * - Roman numeral prefix is displayed large in gold (secondary)
 * - Remaining name is displayed as h1 below
 * - Club name (from clubs table) shown in gold italic
 * - Document title is also set dynamically
 */

import { useEffect } from 'react';
import { useTournamentInfo } from '@/hooks/useTournamentData';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSiteConfig } from '@/hooks/useSiteConfig';
import { menuConfig } from '@/data/mockData';
import { useIsMultiTorneo, useSiteTorneos } from '@/hooks/useSiteTorneos';
import { useHeroOverride } from '@/hooks/useHeroOverride';

/** Regex to match leading Roman numerals (I, V, X, L, C, D, M) */
const ROMAN_NUMERAL_REGEX = /^([IVXLCDM]+)\s+(.+)$/;

/**
 * Split tournament name into Roman numeral prefix and the rest.
 * E.g. "XLVI TORNEO ANUAL SEMANA SANTA" → { roman: "XLVI", rest: "TORNEO ANUAL SEMANA SANTA" }
 */
const parseTournamentName = (name: string) => {
  const match = name.trim().match(ROMAN_NUMERAL_REGEX);
  if (match) {
    return { roman: match[1], rest: match[2] };
  }
  return { roman: '', rest: name };
};

const Hero = () => {
  const { data: tournamentInfo } = useTournamentInfo();
  const { data: siteConfig } = useSiteConfig();
  const isMultiTorneo = useIsMultiTorneo();
  /** Torneos del sitio + su configuración, para los botones cruzados. */
  const { data: siteTorneos } = useSiteTorneos();
  const torneos = siteTorneos?.torneos ?? [];
  const configs = siteTorneos?.configs ?? {};

  /**
   * Resuelve un slot del hero:
   *   1. Toma el pageId configurado desde /admin → Página → Botones Home.
   *   2. Verifica que la página exista y no esté oculta en visibility.
   *   3. Si falla cualquiera de los dos, cae al fallback del slot.
   *
   * Fallbacks (compat con comportamiento previo):
   *   - Slot 1 → /convocatoria (o /salidas en Atlas CC 354)
   *   - Slot 2 → /jugadores
   */
  const isAtlas354 = String(tournamentInfo?.id ?? '') === '354';
  const fallback1 = isAtlas354
    ? { label: 'Ver Salidas',       href: '/salidas' }
    : { label: 'Ver Convocatoria',  href: '/convocatoria' };
  const fallback2 = { label: 'Ver Jugadores', href: '/jugadores' };

  /**
   * El valor guardado puede ser:
   *   - "salidas"        → página del alcance actual.
   *   - "t274:salidas"   → página de un torneo concreto del sitio
   *                        (se muestra como "Akron Experience Salidas").
   */
  const resolveSlot = (value: string | null | undefined, fallback: { label: string; href: string }) => {
    if (!value) return fallback;
    const pretty = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();

    if (value.includes(':')) {
      const [rawTorneo, pageId] = value.split(':');
      const torneoId = rawTorneo.replace(/^t/, '');
      const torneo = torneos.find((t) => String(t.torneoid) === torneoId);
      const item = menuConfig.find((m) => m.id === pageId);
      if (!torneo || !item) return fallback;
      const visible = configs[torneoId]?.visibility?.[pageId];
      if (visible === false) return fallback;
      return {
        label: `${torneo.nombre || `Torneo ${torneo.torneoid}`} ${pretty(item.label)}`,
        href: torneo.slug ? `/${torneo.slug}${item.path}` : item.path,
      };
    }

    const item = menuConfig.find((m) => m.id === value);
    if (!item) return fallback;
    const visible = siteConfig?.visibility?.[value];
    // If visibility isn't defined, we assume the page is visible (legacy).
    if (visible === false) return fallback;
    return { label: pretty(item.label), href: item.path };
  };

  const [cfg1, cfg2] = siteConfig?.home_config?.buttons ?? [null, null];
  const slot1 = resolveSlot(cfg1, fallback1);
  const slot2 = resolveSlot(cfg2, fallback2);

  /** Parse tournament name into roman numeral and rest */
  const sharedTitle = isMultiTorneo ? siteConfig?.home_config?.title?.trim() : '';
  const displayTitle = sharedTitle || tournamentInfo?.name || '';
  const parsed = displayTitle
    ? parseTournamentName(displayTitle)
    : { roman: '', rest: '' };

  /** Set document/tab title dynamically from tournament name + club */
  useEffect(() => {
    if (sharedTitle) {
      document.title = sharedTitle;
    } else if (tournamentInfo?.name) {
      const club = tournamentInfo.club || '';
      document.title = club
        ? `${tournamentInfo.name} | ${club}`
        : tournamentInfo.name;
    }
  }, [sharedTitle, tournamentInfo?.name, tournamentInfo?.club]);

  /** Format date range for display */
  /** Format date range avoiding timezone offset issues by parsing as UTC */
  const formatDate = (start: string, end: string) => {
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    return `Del ${startDate.toLocaleDateString('es-MX', options)} al ${endDate.toLocaleDateString('es-MX', { ...options, year: 'numeric' })}`;
  };

  return (
    <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: tournamentInfo?.heroImageUrl 
            ? `url('${tournamentInfo.heroImageUrl}')` 
            : `url('https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&w=1920&q=80')`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-golf-dark/70 via-golf-dark/50 to-golf-dark/80" />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center">
        <div className="max-w-4xl mx-auto">
          {/* Roman numeral from tournament name (e.g. "XLVI") */}
          {parsed.roman && (
            <div className="mb-6 animate-fade-in-up">
              <span className="inline-block text-8xl md:text-9xl font-display font-bold text-secondary drop-shadow-lg">
                {parsed.roman}
              </span>
            </div>
          )}

          {/* Rest of tournament name (e.g. "TORNEO ANUAL SEMANA SANTA") */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold text-primary-foreground mb-4 animate-fade-in-up animation-delay-100">
            {parsed.rest || 'Torneo de Golf'}
          </h1>

          {/* Club name in gold italic */}
          <p className="text-xl md:text-2xl font-display italic text-secondary mb-8 animate-fade-in-up animation-delay-200">
            {tournamentInfo?.club || ''}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10 animate-fade-in-up animation-delay-300">
            {tournamentInfo?.startDate && tournamentInfo?.endDate && (
              <div className="flex items-center gap-2 text-primary-foreground/90">
                <Calendar className="h-5 w-5 text-secondary" />
                <span className="text-lg">{formatDate(tournamentInfo.startDate, tournamentInfo.endDate)}</span>
              </div>
            )}
            {tournamentInfo?.venue && (
              <>
                <span className="hidden sm:block text-primary-foreground/50">|</span>
                <div className="flex items-center gap-2 text-primary-foreground/90">
                  <MapPin className="h-5 w-5 text-secondary" />
                  <span className="text-lg">{tournamentInfo.venue}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up animation-delay-400">
            <Button asChild size="lg" className="bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-gold font-semibold px-8">
              <Link to={slot1.href}>{slot1.label}</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-primary-foreground/30 text-foreground bg-background/90 hover:bg-background">
              <Link to={slot2.href}>{slot2.label}</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default Hero;
