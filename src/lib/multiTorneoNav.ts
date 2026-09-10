/**
 * multiTorneoNav
 * Construcción del menú superior cuando el sitio maneja varios torneos.
 *
 * Cada torneo aporta un desplegable con sus propias páginas (visibilidad,
 * orden y grupos propios, guardados en /admin bajo la pestaña del torneo) y
 * sus enlaces apuntan al nombre corto del torneo: /experience/resultados.
 *
 * Las páginas compartidas (alcance "general") se muestran sueltas en la barra,
 * sin prefijo: /patrocinadores.
 */

import { menuConfig, type MenuItem } from '@/data/mockData';
import type { SiteConfig } from '@/hooks/useSiteConfig';
import type { SiteTorneo } from '@/hooks/useSiteTorneos';
import { isPageIdModuleDisabled } from '@/modules/moduleState';

/** Elemento del menú: enlace suelto o desplegable con hijos. */
export interface NavConfigItem {
  type: 'link' | 'group';
  id: string;
  label: string;
  path?: string;
  children?: (MenuItem & { hidden?: boolean })[];
  wrapText?: boolean;
  hidden?: boolean;
  /** Posición en la barra superior (mezcla torneos y páginas compartidas). */
  orden?: number;
}

/** Páginas visibles de una configuración, ya ordenadas y con prefijo. */
const visiblePages = (config: Partial<SiteConfig> | undefined, prefix: string): MenuItem[] => {
  const visibility = config?.visibility ?? {};
  const order = config?.menu_order ?? {};
  return menuConfig
    .filter((item) => !isPageIdModuleDisabled(item.id))
    .filter((item) => visibility[item.id] ?? item.enabled)
    .map((item) => ({ ...item, path: `${prefix}${item.path}` }))
    .sort((a, b) => (order[a.id] ?? a.order) - (order[b.id] ?? b.order));
};

/**
 * Menú de una configuración concreta (un torneo o el alcance general),
 * respetando sus grupos.
 */
export const buildNavItemsFromConfig = (
  config: Partial<SiteConfig> | undefined,
  prefix = ''
): NavConfigItem[] => {
  const pages = visiblePages(config, prefix);
  const groups = config?.menu_groups ?? [];
  const assignments = config?.page_group_assignments ?? {};
  const order = config?.menu_order ?? {};
  /** Posición de una página en la barra (la configurada o la de fábrica). */
  const posOf = (page: MenuItem) => order[page.id] ?? page.order;

  const items: NavConfigItem[] = [];
  const done = new Set<string>();
  const doneGroups = new Set<string>();

  for (const page of pages) {
    if (done.has(page.id)) continue;
    const groupId = assignments[page.id];

    if (groupId && !doneGroups.has(groupId)) {
      doneGroups.add(groupId);
      const group = groups.find((g) => g.id === groupId);
      if (!group || group.visible === false) continue;
      const children = pages.filter((p) => assignments[p.id] === groupId);
      if (children.length === 0) continue;
      items.push({
        type: 'group',
        id: groupId,
        label: group.name,
        children,
        wrapText: group.wrapText,
        orden: Math.min(...children.map(posOf)),
      });
      children.forEach((c) => done.add(c.id));
    } else if (!groupId) {
      items.push({ type: 'link', id: page.id, label: page.label, path: page.path, orden: posOf(page) });
      done.add(page.id);
    }
  }

  return items;
};

/**
 * Barra superior completa de un sitio multi-torneo.
 *
 * Cada torneo es un desplegable más de la barra: se coloca según su "orden"
 * configurado en /admin → Torneos, mezclado con los enlaces compartidos
 * (que usan el orden del menú general). Home siempre queda al principio.
 */
export const buildMultiTorneoNav = (
  torneos: SiteTorneo[],
  configs: Record<string, Partial<SiteConfig>>
): NavConfigItem[] => {
  const torneoItems: NavConfigItem[] = torneos
    .filter((t) => t.activo !== false)
    .map((t, i) => {
      const prefix = t.slug ? `/${t.slug}` : '';
      const children = visiblePages(configs[String(t.torneoid)], prefix).filter(
        (p) => p.id !== 'home'
      );
      return {
        type: 'group' as const,
        id: `torneo-${t.torneoid}`,
        label: t.nombre || `Torneo ${t.torneoid}`,
        children,
        orden: configs.general?.menu_order?.[`torneo-${t.torneoid}`]
          ?? (Number(t.orden) > 0 ? Number(t.orden) : i + 1),
      };
    })
    .filter((g) => (g.children?.length ?? 0) > 0);

  const generalItems = buildNavItemsFromConfig(configs.general, '');

  const merged = [...torneoItems, ...generalItems].sort((a, b) => {
    // Home siempre primero, sin importar el orden guardado.
    if (a.id === 'home') return -1;
    if (b.id === 'home') return 1;
    return (a.orden ?? 999) - (b.orden ?? 999);
  });

  return merged;
};
