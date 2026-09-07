/**
 * configScope
 * Alcance de configuración activo (multi-torneo).
 *
 *   'general'      → configuración compartida del sitio.
 *   '<torneoid>'   → configuración propia de un torneo.
 *
 * Es un singleton (no un hook) porque lo consultan tanto React como las
 * funciones de red que corren fuera de un componente. Los componentes se
 * suscriben con `useConfigScope()`.
 */

import { useSyncExternalStore } from 'react';

export type ConfigScope = string; // 'general' | '274' | ...

const STORAGE_KEY = 'tournament_config_scope';

let currentScope: ConfigScope = 'general';
const listeners = new Set<() => void>();

/** Alcance activo. */
export const getConfigScope = (): ConfigScope => currentScope;

/** Cambia el alcance activo y notifica a todos los suscriptores. */
export const setConfigScope = (scope: ConfigScope) => {
  const next = (scope || 'general').trim() || 'general';
  if (next === currentScope) return;
  currentScope = next;
  try {
    sessionStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* almacenamiento no disponible: el alcance vive solo en memoria */
  }
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Hook de lectura del alcance activo. */
export const useConfigScope = (): ConfigScope =>
  useSyncExternalStore(subscribe, getConfigScope, getConfigScope);

/** Sufijo de consulta para las peticiones al servidor. */
export const scopeQuery = (scope: ConfigScope = currentScope) =>
  `scope=${encodeURIComponent(scope)}`;
