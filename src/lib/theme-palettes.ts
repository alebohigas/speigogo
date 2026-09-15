/**
 * theme-palettes.ts
 * Curated color palette presets for tournament theming, plus helpers
 * to convert between hex (color picker) and the "H S% L%" HSL string
 * format consumed by Tailwind via hsl(var(--token)).
 */

import type { ThemeConfig } from '@/hooks/useSiteConfig';

/** A built-in palette preset shown in the admin grid. */
export interface PalettePreset extends ThemeConfig {
  id: string;
  description: string;
}

/**
 * Six curated presets. Colors are HSL strings ("H S% L%") so they slot
 * directly into the project's existing CSS custom properties.
 */
export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: 'verde-bosque',
    name: 'Verde Bosque',
    description: 'Verde profundo con dorado champagne (paleta por defecto).',
    primary:    '150 40% 22%',
    secondary:  '42 60% 55%',
    accent:     '42 70% 50%',
    background: '0 0% 100%',
  },
  {
    id: 'azul-marino',
    name: 'Azul Marino',
    description: 'Azul corporativo con destellos cian, formal y confiable.',
    primary:    '215 60% 25%',
    secondary:  '200 70% 55%',
    accent:     '195 80% 50%',
    background: '0 0% 100%',
  },
  {
    id: 'borgona-crema',
    name: 'Borgoña & Crema',
    description: 'Vino tinto sobre crema cálida, elegante y deportivo.',
    primary:    '350 55% 28%',
    secondary:  '30 60% 55%',
    accent:     '15 75% 50%',
    background: '40 30% 98%',
  },
  {
    id: 'negro-oro',
    name: 'Negro & Oro',
    description: 'Alto contraste con acentos dorados de lujo.',
    primary:    '0 0% 10%',
    secondary:  '42 70% 50%',
    accent:     '42 80% 55%',
    background: '0 0% 98%',
  },
  {
    id: 'purpura-real',
    name: 'Púrpura Real',
    description: 'Púrpura noble con malva claro, premium y único.',
    primary:    '270 45% 30%',
    secondary:  '280 50% 60%',
    accent:     '290 70% 55%',
    background: '270 20% 98%',
  },
  {
    id: 'coral-tropical',
    name: 'Coral Tropical',
    description: 'Turquesa con coral vibrante, cálido y energético.',
    primary:    '195 70% 25%',
    secondary:  '15 80% 60%',
    accent:     '10 85% 55%',
    background: '200 30% 98%',
  },
];

/**
 * hexToHslString
 * Convert a #rrggbb hex color into the "H S% L%" string format used by
 * the project's CSS variables. Returns null on invalid input.
 */
export function hexToHslString(hex: string): string | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * hslStringToHex
 * Convert "H S% L%" back to a #rrggbb hex string for the color picker.
 */
export function hslStringToHex(hsl: string): string {
  const m = /^\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/.exec(hsl);
  if (!m) return '#000000';
  const h = parseFloat(m[1]) / 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(Math.round(r * 255))}${toHex(Math.round(g * 255))}${toHex(Math.round(b * 255))}`;
}

/**
 * getLightness
 * Extract the L% component from an HSL string. Used to pick foreground
 * contrast tokens automatically.
 */
function getLightness(hsl: string): number {
  const m = /(\d+(?:\.\d+)?)%\s*$/.exec(hsl);
  return m ? parseFloat(m[1]) : 50;
}

/**
 * applyThemeConfig
 * Inject the active palette into the document by overriding the
 * project's CSS custom properties on :root. Re-runs whenever the
 * palette changes; passing null restores the stylesheet defaults.
 */
export function applyThemeConfig(theme: ThemeConfig | null): void {
  const root = document.documentElement;
  const tokens = [
    '--primary', '--primary-foreground',
    '--secondary', '--secondary-foreground',
    '--accent', '--accent-foreground',
    '--background', '--foreground',
    '--ring',
    '--golf-green', '--golf-green-light',
    '--golf-gold', '--golf-gold-light',
    '--sidebar-primary', '--sidebar-primary-foreground',
    '--report-header', '--report-header-foreground',
  ];
  if (!theme) {
    tokens.forEach(t => root.style.removeProperty(t));
    root.style.removeProperty('--gradient-stats');
    return;
  }
  const primaryFg    = getLightness(theme.primary)    < 55 ? '0 0% 100%' : '0 0% 10%';
  const secondaryFg  = getLightness(theme.secondary)  < 55 ? '0 0% 100%' : '0 0% 10%';
  const accentFg     = getLightness(theme.accent)     < 55 ? '0 0% 100%' : '0 0% 10%';
  const backgroundFg = getLightness(theme.background) < 55 ? '0 0% 100%' : '150 30% 10%';
  const reportHeader = hexToHslString(theme.reportHeaderColor || '#999999') || '0 0% 60%';
  const reportHeaderFg = getLightness(reportHeader) < 55 ? '0 0% 100%' : '0 0% 10%';

  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--primary-foreground', primaryFg);
  root.style.setProperty('--secondary', theme.secondary);
  root.style.setProperty('--secondary-foreground', secondaryFg);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-foreground', accentFg);
  root.style.setProperty('--background', theme.background);
  root.style.setProperty('--foreground', backgroundFg);
  root.style.setProperty('--ring', theme.primary);
  root.style.setProperty('--golf-green', theme.primary);
  root.style.setProperty('--golf-green-light', theme.primary);
  root.style.setProperty('--golf-gold', theme.accent);
  root.style.setProperty('--golf-gold-light', theme.secondary);
  root.style.setProperty('--sidebar-primary', theme.primary);
  root.style.setProperty('--sidebar-primary-foreground', primaryFg);
  root.style.setProperty('--report-header', reportHeader);
  root.style.setProperty('--report-header-foreground', reportHeaderFg);

  // Update gradient-stats so the StatsSection ("fun facts" ribbon)
  // automatically follows the active primary color instead of staying
  // hard-coded to the default green palette.
  const primaryL = getLightness(theme.primary);
  const darkerL = Math.max(0, primaryL - 4);
  const darkerPrimary = theme.primary.replace(/\d+(\.\d+)?%\s*$/, `${darkerL}%`);
  root.style.setProperty(
    '--gradient-stats',
    `linear-gradient(180deg, hsl(${darkerPrimary}) 0%, hsl(${theme.primary}) 100%)`
  );
}

/**
 * ============= Custom Palette Presets (user-saved) =============
 * Custom palettes built via the admin "Crear nueva paleta" builder are
 * persisted in localStorage keyed by domain, so each tournament site
 * keeps its own library of saved presets that show alongside the
 * built-in ones in the admin grid.
 */

/** A user-saved palette preset. Same shape as a built-in preset but flagged as custom. */
export interface CustomPalettePreset extends PalettePreset {
  /** Always true — distinguishes user-saved presets from built-ins. */
  custom: true;
  /** Epoch ms when the preset was saved (for sorting / debugging). */
  createdAt: number;
}

/** localStorage key for the custom-preset library (per domain). */
const CUSTOM_PRESETS_KEY = 'tournament_custom_palettes';

/**
 * loadCustomPresets
 * Read the user-saved palette library from localStorage. Returns an
 * empty array if nothing has been saved yet or the value is malformed.
 */
export function loadCustomPresets(): CustomPalettePreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * saveCustomPreset
 * Append (or replace by id/name) a palette in the custom library.
 * Returns the updated library so callers can refresh state immediately.
 */
export function saveCustomPreset(theme: ThemeConfig): CustomPalettePreset[] {
  const existing = loadCustomPresets();
  const id = `custom-${theme.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
  const next: CustomPalettePreset = {
    id,
    name: theme.name.trim() || 'Personalizada',
    description: 'Paleta personalizada guardada por el administrador.',
    primary: theme.primary,
    secondary: theme.secondary,
    accent: theme.accent,
    background: theme.background,
    custom: true,
    createdAt: Date.now(),
  };
  // De-dup by exact color match: replace if a custom preset with the
  // same 4 colors already exists (avoid library bloat from re-saves).
  const filtered = existing.filter(
    p => !(p.primary === theme.primary &&
           p.secondary === theme.secondary &&
           p.accent === theme.accent &&
           p.background === theme.background),
  );
  const updated = [...filtered, next];
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(updated));
  return updated;
}

/**
 * deleteCustomPreset
 * Remove a custom preset by id. Returns the updated library.
 */
export function deleteCustomPreset(id: string): CustomPalettePreset[] {
  const updated = loadCustomPresets().filter(p => p.id !== id);
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(updated));
  return updated;
}