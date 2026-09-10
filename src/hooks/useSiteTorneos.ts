/**
 * useSiteTorneos
 * Multi-torneo: lista de torneos que vive este dominio + todas sus
 * configuraciones (general + una por torneo) en una sola petición.
 *
 * Cuando el dominio no tiene torneos dados de alta, la lista llega vacía y
 * la app se comporta exactamente como antes (un solo torneo, alcance
 * 'general').
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '@/config/api';
import { DEFAULT_SUPERADMIN_PASSWORD, getSuperAdminPassword } from '@/lib/superAdminAuth';
import type { SiteConfig } from '@/hooks/useSiteConfig';

// ============= Types =============

export interface SiteTorneo {
  torneoid: number;
  /** Nombre visible en la barra superior y en las pestañas de /admin */
  nombre: string;
  /** Nombre corto usado en la dirección: /experience/resultados */
  slug: string;
  orden: number;
  activo?: boolean;
}

export interface SiteTorneosAll {
  domain: string;
  torneos: SiteTorneo[];
  /** Configuración por alcance: { general: {...}, '274': {...} } */
  configs: Record<string, Partial<SiteConfig>>;
}

// ============= Fetchers =============

const fetchAll = async (): Promise<SiteTorneosAll> => {
  const res = await fetch(`${API_BASE_URL}/site_config.php?all=1`);
  if (!res.ok) throw new Error('Failed to fetch site torneos');
  const data = await res.json();
  return {
    domain: data.domain,
    torneos: Array.isArray(data.torneos) ? data.torneos : [],
    configs: data.configs || {},
  };
};

const saveTorneos = async (torneos: SiteTorneo[], password: string) => {
  const res = await fetch(`${API_BASE_URL}/site_torneos.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password: password === DEFAULT_SUPERADMIN_PASSWORD ? getSuperAdminPassword() : password,
      torneos: torneos.map((t, i) => ({
        ...t,
        // Respeta el orden escrito en /admin; si no hay, usa la posición de la lista.
        orden: Number(t.orden) > 0 ? Number(t.orden) : i + 1,
        activo: t.activo !== false,
      })),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'Failed to save torneos');
  }
  return res.json();
};

// ============= Hooks =============

/** Torneos del dominio + configuraciones de todos los alcances. */
export const useSiteTorneos = () =>
  useQuery<SiteTorneosAll>({
    queryKey: ['site-torneos'],
    queryFn: fetchAll,
    staleTime: 30 * 1000,
    retry: 1,
  });

/** Guardar la lista completa de torneos del dominio (solo superadmin). */
export const useSaveSiteTorneos = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ torneos, password }: { torneos: SiteTorneo[]; password: string }) =>
      saveTorneos(torneos, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-torneos'] });
      queryClient.invalidateQueries({ queryKey: ['site-config'] });
    },
  });
};

/** ¿Este dominio maneja varios torneos a la vez? */
export const useIsMultiTorneo = () => {
  const { data } = useSiteTorneos();
  return (data?.torneos?.length ?? 0) > 1;
};
