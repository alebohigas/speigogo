/**
 * useStatsData
 * ---------------------------------------------------------------
 * React Query hooks that back the /stats page. Each hook maps 1:1 to a
 * PHP endpoint under /api/stats_*.php and forwards the active tournament
 * id through the standard `buildQuery()` helper in config/api.ts (kept
 * inline here to avoid touching that file).
 *
 *  - useStatsClubes()             → /api/stats_clubes.php
 *  - useStatsCategoria(catId)     → /api/stats_categoria.php?categoriaid=..
 *  - useStatsJugadoresList()      → /api/stats_jugador.php   (list mode)
 *  - useStatsJugador(jugadorId)   → /api/stats_jugador.php?jugadorid=..
 * ---------------------------------------------------------------
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/apiClient';
import { API_BASE_URL, POLL_SLOW } from '@/config/api';
import { getTorneoId } from '@/hooks/useTorneoId';
import { useSiteTorneos } from '@/hooks/useSiteTorneos';
import { useConfigScope } from '@/lib/configScope';

// ============= Types =============

export interface StatsClub {
  id: number | null;
  name: string;
  abr: string;
  logo: string | null;
  /** Per-tee breakdown: salidaId → branch counts. */
  byTee: Record<string, {
    caballeros: number;
    seniors: number;
    supersenior: number;
    damas: number;
    total: number;
  }>;
  total: number;
}

export interface StatsTee {
  id: number;
  tee: string;
  color: string;
  bgcolor?: string;
}

/** Jugador listado en el detalle de un estatus NO SHOW. */
export interface StatsNoShowPlayer {
  name: string;
  categoria: string;
}

export interface StatsNoShow {
  retiro: number;
  noShow: number;
  descalificado: number;
  /** Jugadores con estatus "NO CONTIENDE" (N). */
  noContiende?: number;
  total: number;
  /** Detalle de jugadores por estatus (desplegable en /stats). */
  players?: {
    retiro?: StatsNoShowPlayer[];
    noShow?: StatsNoShowPlayer[];
    descalificado?: StatsNoShowPlayer[];
    noContiende?: StatsNoShowPlayer[];
  };
}


export interface StatsClubesResponse {
  total: number;
  clubs: StatsClub[];
  tees: StatsTee[];
  noShow: StatsNoShow;
}

export interface StatsCategoriaHole {
  hole: number;
  par: number | null;
  promedio: number | null;
  rank: number | null;
  aguilas: number;
  birdies: number;
  pares: number;
  bogeys: number;
  dobles: number;
  triples: number;
}
export interface StatsCategoriaSubtotal {
  par: number;
  promedio: number | null;
  aguilas: number;
  birdies: number;
  pares: number;
  bogeys: number;
  dobles: number;
  triples: number;
}
export interface StatsCategoriaResponse {
  categoryName: string;
  tee: string;
  teeColor?: string;
  course: string;
  rounds: number;
  updatedAt: string | null;
  holesToPlay: number;
  holes: StatsCategoriaHole[];
  subtotals: {
    out: StatsCategoriaSubtotal | null;
    in: StatsCategoriaSubtotal | null;
    total: StatsCategoriaSubtotal | null;
  };
}

export interface StatsJugadorListItem {
  id: string;
  name: string;
  club: string;
  categoria: string;
}
export interface StatsJugadorRound {
  label: string;
  date: string | null;
  scores: (number | null)[];
  out: number;
  in: number;
  total: number;
}
export interface StatsJugadorResponse {
  player: {
    id: string;
    name: string;
    club: string;
    categoria: string;
    tee: string;
    teeColor?: string;
    course: string;
  } | null;
  holes: { hole: number; par: number | null; rango: number | null }[];
  rounds: StatsJugadorRound[];
  averages: (number | null)[];
}

// ============= Tee (mesa de salida) stats =============

/** A tee option from stats_tee.php list mode (chip selector source). */
export interface StatsTeeOption {
  id: number;
  tee: string;
  color: string;
  bgcolor?: string;
}

/**
 * Detail response from stats_tee.php for one or several tees.
 * holes/subtotals intentionally reuse the StatsCategoria* shapes so the
 * shared holes matrix component renders them without mapping.
 */
export interface StatsTeeDetailResponse {
  /** "Negras" for one tee, "Negras + Azules" for several. */
  teeName: string;
  /** Tee color — only set when exactly one tee is selected. */
  teeColor?: string;
  /** How many of the requested tees exist in the salidas table. */
  teeCount: number;
  course: string;
  rounds: number;
  updatedAt: string | null;
  holes: StatsCategoriaHole[];
  subtotals: StatsCategoriaResponse['subtotals'];
}

// ============= Helpers =============

/** Build a URL with the current torneoid appended plus optional extras. */
const buildUrl = (path: string, extra: Record<string, string> = {}) => {
  const torneoid = getTorneoId();
  const params = new URLSearchParams({
    ...(torneoid ? { torneoid } : {}),
    ...extra,
  }).toString();
  return `${API_BASE_URL}/${path}${params ? `?${params}` : ''}`;
};

// ============= Hooks =============

/**
 * useCombinedTorneoIds
 * Devuelve la lista de torneos a sumar cuando el sitio muestra la vista
 * General y el administrador activó "sumar estadísticas de los torneos".
 * En cualquier otro caso devuelve null (comportamiento de un solo torneo).
 */
export const useCombinedTorneoIds = (): string[] | null => {
  const scope = useConfigScope();
  const { data } = useSiteTorneos();
  const general = data?.configs?.general;
  const combine = !!general?.stats_page_config?.combineTorneos;
  if (scope !== 'general' || !combine) return null;
  const ids = (data?.torneos ?? [])
    .filter((t) => t.activo !== false)
    .map((t) => String(t.torneoid))
    .filter((id) => id && id !== '0');
  return ids.length > 1 ? ids : null;
};

/** Suma varias respuestas de stats_clubes.php en una sola. */
const mergeClubes = (parts: StatsClubesResponse[]): StatsClubesResponse => {
  const clubs = new Map<string, StatsClub>();
  const tees = new Map<number, StatsTee>();
  const noShow: StatsNoShow = {
    retiro: 0, noShow: 0, descalificado: 0, noContiende: 0, total: 0,
    players: { retiro: [], noShow: [], descalificado: [], noContiende: [] },
  };

  parts.forEach((p) => {
    (p?.tees ?? []).forEach((t) => { if (!tees.has(t.id)) tees.set(t.id, t); });

    (p?.clubs ?? []).forEach((c) => {
      const key = c.id != null ? `id:${c.id}` : `n:${(c.name || '').toLowerCase()}`;
      const prev = clubs.get(key);
      if (!prev) {
        clubs.set(key, { ...c, byTee: { ...c.byTee } });
        return;
      }
      prev.total += c.total;
      Object.entries(c.byTee || {}).forEach(([teeId, v]) => {
        const acc = prev.byTee[teeId] ?? { caballeros: 0, seniors: 0, supersenior: 0, damas: 0, total: 0 };
        prev.byTee[teeId] = {
          caballeros:  acc.caballeros  + v.caballeros,
          seniors:     acc.seniors     + v.seniors,
          supersenior: acc.supersenior + v.supersenior,
          damas:       acc.damas       + v.damas,
          total:       acc.total       + v.total,
        };
      });
      if (!prev.logo && c.logo) prev.logo = c.logo;
    });

    const ns = p?.noShow;
    if (ns) {
      noShow.retiro        += ns.retiro || 0;
      noShow.noShow        += ns.noShow || 0;
      noShow.descalificado += ns.descalificado || 0;
      noShow.noContiende   = (noShow.noContiende || 0) + (ns.noContiende || 0);
      noShow.total         += ns.total || 0;
      (['retiro', 'noShow', 'descalificado', 'noContiende'] as const).forEach((k) => {
        const list = ns.players?.[k] ?? [];
        noShow.players![k] = [...(noShow.players![k] ?? []), ...list];
      });
    }
  });

  // Orden alfabético dentro de cada estatus (igual que en un solo torneo).
  (['retiro', 'noShow', 'descalificado', 'noContiende'] as const).forEach((k) => {
    noShow.players![k] = (noShow.players![k] ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, 'es'));
  });

  const clubList = [...clubs.values()].sort((a, b) => b.total - a.total);
  return {
    total: clubList.reduce((s, c) => s + c.total, 0),
    clubs: clubList,
    tees: [...tees.values()],
    noShow,
  };
};

/** Clubes asistentes — aggregated player counts per club. */
export const useStatsClubes = () => {
  const combined = useCombinedTorneoIds();
  return useQuery<StatsClubesResponse>({
    queryKey: ['stats-clubes', combined ? combined.join(',') : getTorneoId()],
    queryFn: async () => {
      if (!combined) return apiFetch<StatsClubesResponse>(buildUrl('stats_clubes.php'));
      const parts = await Promise.all(
        combined.map((id) =>
          apiFetch<StatsClubesResponse>(`${API_BASE_URL}/stats_clubes.php?torneoid=${id}`)),
      );
      return mergeClubes(parts);
    },
    staleTime: POLL_SLOW,
  });
};

/** Estadísticas por categoría — hoyo por hoyo. */
export const useStatsCategoria = (categoriaId: string | null) =>
  useQuery<StatsCategoriaResponse>({
    queryKey: ['stats-categoria', getTorneoId(), categoriaId],
    queryFn: () =>
      apiFetch<StatsCategoriaResponse>(
        buildUrl('stats_categoria.php', { categoriaid: String(categoriaId) }),
      ),
    enabled: !!categoriaId,
    staleTime: POLL_SLOW,
  });

/** Player list for search autocomplete on the Jugador stats section. */
export const useStatsJugadoresList = () =>
  useQuery<{ players: StatsJugadorListItem[] }>({
    queryKey: ['stats-jugadores-list', getTorneoId()],
    queryFn: () =>
      apiFetch<{ players: StatsJugadorListItem[] }>(buildUrl('stats_jugador.php')),
    staleTime: POLL_SLOW,
  });

/** Per-player hole-by-hole stats. */
export const useStatsJugador = (jugadorId: string | null) =>
  useQuery<StatsJugadorResponse>({
    queryKey: ['stats-jugador', getTorneoId(), jugadorId],
    queryFn: () =>
      apiFetch<StatsJugadorResponse>(
        buildUrl('stats_jugador.php', { jugadorid: String(jugadorId) }),
      ),
    enabled: !!jugadorId,
    staleTime: POLL_SLOW,
  });

/** List of tees (mesas de salida) used by the tournament's categories. */
export const useStatsTeesList = () =>
  useQuery<{ tees: StatsTeeOption[] }>({
    queryKey: ['stats-tees', getTorneoId()],
    queryFn: () => apiFetch<{ tees: StatsTeeOption[] }>(buildUrl('stats_tee.php')),
    staleTime: POLL_SLOW,
  });

/**
 * Aggregated hole-by-hole stats for one or several tees.
 * @param salidaIds — explicit tee id list; the caller passes ALL tee ids
 *                    when the "Todas" (no selection) filter is active.
 *                    Empty array → query disabled.
 */
export const useStatsTee = (salidaIds: number[]) =>
  useQuery<StatsTeeDetailResponse>({
    queryKey: ['stats-tee', getTorneoId(), salidaIds.join(',')],
    queryFn: () =>
      apiFetch<StatsTeeDetailResponse>(
        buildUrl('stats_tee.php', { salidaids: salidaIds.join(',') }),
      ),
    enabled: salidaIds.length > 0,
    staleTime: POLL_SLOW,
  });