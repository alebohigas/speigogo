/**
 * Equipos Data Hook
 * Lee /api/equipos.php: jugadores agrupados por equipo (grupoid) con
 * H.I., H.C., totales del equipo y los tees de salida para la leyenda.
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/apiClient';
import { getEquiposUrl, POLL_SLOW } from '@/config/api';

export interface EquipoPlayer {
  id: string;
  nombre: string;
  hi: string;
  hc: string;
  /** Color de fondo del tee de salida del jugador. */
  bgcolor: string;
  /** Color de texto del tee de salida del jugador. */
  color: string;
}

export interface EquipoTeam {
  grupoid: string;
  /** Número/clave del equipo (ej. AK9001), si viene en el identificador. */
  numero?: string;
  /** Nombre del equipo (ej. The Beginners). */
  nombre?: string;
  /** Integrantes reales del equipo. */
  jugadores?: number;
  logo: string;
  /** URL lista del logo propio del equipo (tabla `equipos`). */
  logoUrl?: string;
  totalHcp: number;
  totalIndex: number;
  /** Total mostrado según index_campo del torneo. */
  total: number;
  handicapNeto: number | null;
  /** true cuando el total del equipo queda fuera del mínimo permitido. */
  fueraDeRango: boolean;
  players: EquipoPlayer[];
}

export interface EquipoTee {
  tee: string;
  rating: string;
  slope: string;
  par: string;
  bgcolor: string;
  color: string;
}

export interface EquiposResponse {
  tournament: {
    hcpIndexMin: number;
    /** '1' = Handicap de Campo, '2' = Index */
    indexCampo: string;
    jugadoresEquipo: number;
  };
  category: {
    id: string;
    name: string;
    shortName: string;
    system: string;
    format: string;
    percentage: number;
    campoid: number;
    totalJugadores: number;
    totalEquipos: number;
  };
  teams: EquipoTeam[];
  tees: EquipoTee[];
}

/** Equipos de una categoría. */
export const useEquipos = (catId: string | null) =>
  useQuery<EquiposResponse>({
    queryKey: ['equipos', catId],
    queryFn: () => apiFetch<EquiposResponse>(getEquiposUrl(catId as string)),
    enabled: !!catId,
    staleTime: POLL_SLOW,
    refetchInterval: POLL_SLOW,
  });
