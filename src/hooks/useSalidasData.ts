/**
 * Salidas (Tee Times) Data Hooks
 * React Query hooks for tee time data from salidas.php and salidas_det.php
 * Uses POLL_ACTIVE for updates during tournament
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/apiClient';
import { getSalidasUrl, getSalidasDayUrl, POLL_ACTIVE } from '@/config/api';

// ============= Types =============

/** Category within a day from salidas.php */
export interface SalidasCategory {
  caljgoid: string;
  categoryId: string;
  categoryName: string;
  shortName: string;
  system: string;
  format: string;
  tee: string;
}

/** Day summary from salidas.php */
export interface SalidasDay {
  date: string;
  dateFormatted: string;
  course: string;
  categories: SalidasCategory[];
}

/** Master response from salidas.php */
interface SalidasMasterResponse {
  tournament: string;
  club: string;
  days: SalidasDay[];
}

/** Player in a tee time group from salidas_det.php */
export interface SalidasPlayer {
  name: string;
  clubLogo: string;
  /** Logo del club del segundo integrante (sólo en categorías PAREJAS). */
  clubLogo2?: string;
  /** Nombre completo del segundo integrante (sólo en categorías PAREJAS).
   *  Cuando viene definido, el render dibuja la pareja como DOS renglones
   *  (uno por jugador) para mantener consistencia visual con la página
   *  Jugadores. */
  partner?: string;
  score: number;
  system: string;
  groupId?: string;
  /** MATCH PLAY: número de match (`elimin_salidas_cat.matchx`) al que pertenece. */
  matchNo?: number;
  /** MATCH PLAY: lado del match (1 = jugida, 2 = jugidb). */
  matchSide?: number;
  /** MATCH PLAY: posición/siembra del jugador dentro de su grupo (`jugadores.grupo`). */
  position?: string | number;
  /** EQUIPOS: integrantes del equipo, cada uno con su tee de salida propio. */
  members?: SalidasTeamMember[];
}

/** EQUIPOS: integrante de un equipo con su tee de salida individual. */
export interface SalidasTeamMember {
  name: string;
  tee: string;
  bgColor?: string;
  color?: string;
  hi?: string | number | null;
}


/** Tee time group from salidas_det.php */
export interface SalidasGroup {
  id: string;
  tee: string;
  time: string;
  players: SalidasPlayer[];
}

/** Detail response from salidas_det.php */
export interface SalidasDetailResponse {
  caljgoid: string;
  date: string;
  course: string;
  categoryId: string;
  categoryName: string;
  shortName: string;
  system: string;
  tee: string;
  /** true cuando la categoría es MATCH PLAY (jugadores agrupados por match). */
  isMatchPlay?: boolean;
  /** true cuando la categoría se juega por equipos (tee individual por jugador). */
  isEquipos?: boolean;
  groups: SalidasGroup[];

}

// ============= Master: Days + Categories =============

/** Fetch all days with their categories from salidas.php */
export const useSalidasMaster = () => {
  return useQuery<SalidasMasterResponse>({
    queryKey: ['salidas-master'],
    queryFn: async () => {
      const data = await apiFetch<any>(getSalidasUrl());
      // Defensive: ensure days is always an array
      return {
        tournament: data?.tournament ?? '',
        club: data?.club ?? '',
        days: Array.isArray(data?.days) ? data.days : [],
      };
    },
    staleTime: POLL_ACTIVE,
    refetchInterval: POLL_ACTIVE,
  });
};

// ============= Detail: Groups by caljgoid =============

/**
 * Fetch tee time groups for a specific calendar game (caljgoid)
 * @param caljgoid - Calendar game ID
 * @param enabled - Whether to enable the query
 */
export const useSalidasDetail = (
  caljgoid: string | null,
  formato: string = 'individual',
  enabled = true
) => {
  return useQuery<SalidasDetailResponse>({
    queryKey: ['salidas-detail', caljgoid, formato],
    queryFn: async () => {
      const data = await apiFetch<any>(getSalidasDayUrl(caljgoid!, formato));
      return {
        caljgoid: data?.caljgoid ?? caljgoid,
        date: data?.date ?? '',
        course: data?.course ?? '',
        categoryId: data?.categoryId ?? '',
        categoryName: data?.categoryName ?? '',
        shortName: data?.shortName ?? '',
        system: data?.system ?? '',
        tee: data?.tee ?? '',
        isMatchPlay: !!data?.isMatchPlay,
        isEquipos: !!data?.isEquipos,
        groups: Array.isArray(data?.groups) ? data.groups : [],

      };
    },
    enabled: enabled && !!caljgoid,
    staleTime: POLL_ACTIVE,
    refetchInterval: POLL_ACTIVE,
  });
};
