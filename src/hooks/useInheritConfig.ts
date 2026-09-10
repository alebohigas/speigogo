/**
 * useInheritConfig
 * ------------------------------------------------------------------
 * Herencia de configuración desde el alcance "General" hacia cada
 * torneo del sitio (multi-torneo).
 *
 * Secciones heredables: Avisos, Anuncio, POP y Patrocinadores.
 *
 * Las banderas viven en `site_config(scope='general').home_config.inherit`
 * — no requiere columnas nuevas en la base de datos.
 *
 * Cuando una bandera está encendida:
 *   - El sitio público de CUALQUIER torneo usa los valores de General.
 *   - La pestaña equivalente dentro del torneo queda en solo lectura con
 *     el aviso "Tomando configuración general de la página".
 */

import { useMemo } from 'react';
import { useSiteConfig, type HomeConfig, type SiteConfig } from '@/hooks/useSiteConfig';
import { useSiteTorneos } from '@/hooks/useSiteTorneos';
import { useConfigScope } from '@/lib/configScope';

/** Secciones que pueden heredarse desde General. */
export const INHERITABLE_SECTIONS = ['avisos', 'anuncio', 'pop', 'sponsors'] as const;
export type InheritableSection = (typeof INHERITABLE_SECTIONS)[number];

/** Campos de `site_config` que aporta cada sección heredable. */
const SECTION_FIELDS: Record<InheritableSection, (keyof SiteConfig)[]> = {
  avisos: ['avisos_config'],
  anuncio: ['anuncio_config'],
  pop: ['popup_config'],
  sponsors: ['sponsors_config'],
};

/** Etiqueta legible de cada sección (para avisos en /admin). */
export const SECTION_LABELS: Record<InheritableSection, string> = {
  avisos: 'Avisos',
  anuncio: 'Anuncio',
  pop: 'POP',
  sponsors: 'Patrocinadores',
};

export type InheritFlags = Partial<Record<InheritableSection, boolean>>;

/** Configuración completa del alcance General (vía ?all=1). */
export const useGeneralConfig = (): Partial<SiteConfig> | undefined => {
  const { data } = useSiteTorneos();
  return data?.configs?.general;
};

/** Banderas de herencia definidas en General. */
export const useInheritFlags = (): InheritFlags => {
  const general = useGeneralConfig();
  const home = general?.home_config as HomeConfig | null | undefined;
  return home?.inherit ?? {};
};

/**
 * ¿Esta sección está tomando la configuración general en el alcance actual?
 * Siempre false dentro del propio alcance 'general' (ahí se edita).
 */
export const useIsInherited = (section: InheritableSection): boolean => {
  const scope = useConfigScope();
  const flags = useInheritFlags();
  return scope !== 'general' && !!flags[section];
};

/**
 * useEffectiveSiteConfig
 * Igual que `useSiteConfig`, pero con las secciones heredadas sustituidas
 * por los valores de General. Es la que deben usar las páginas públicas.
 */
export const useEffectiveSiteConfig = () => {
  const query = useSiteConfig();
  const general = useGeneralConfig();
  const flags = useInheritFlags();
  const scope = useConfigScope();

  const data = useMemo(() => {
    if (!query.data) return query.data;
    if (scope === 'general' || !general) return query.data;
    const merged: SiteConfig = { ...query.data };
    INHERITABLE_SECTIONS.forEach((section) => {
      if (!flags[section]) return;
      SECTION_FIELDS[section].forEach((field) => {
        (merged as any)[field] = (general as any)[field] ?? null;
      });
    });
    return merged;
  }, [query.data, general, flags, scope]);

  return { ...query, data };
};
