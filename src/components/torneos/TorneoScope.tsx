/**
 * TorneoScope
 * Multi-torneo: piezas que conectan la dirección de la página con el torneo
 * activo.
 *
 *  - TorneoSlugLayout: monta las páginas que viven bajo el nombre corto de un
 *    torneo (/experience/resultados) y fija ese torneo como alcance activo.
 *  - TorneoScopeSync: cuando la dirección NO empieza con el nombre corto de
 *    un torneo, vuelve al alcance general (sitio compartido).
 *  - useTorneoPrefix: prefijo a usar al construir enlaces del menú.
 */

import { useEffect } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setConfigScope, useConfigScope } from '@/lib/configScope';
import { useSiteTorneos, type SiteTorneo } from '@/hooks/useSiteTorneos';
import { setStoredTorneoId, useTorneoId } from '@/hooks/useTorneoId';
import NotFound from '@/pages/NotFound';

/** Caché completamente independiente para las páginas públicas de cada torneo. */
const tournamentQueryClients = new Map<string, QueryClient>();

const getTournamentQueryClient = (torneoId: string): QueryClient => {
  const existing = tournamentQueryClients.get(torneoId);
  if (existing) return existing;
  const client = new QueryClient();
  tournamentQueryClients.set(torneoId, client);
  return client;
};

/** Busca el torneo cuyo nombre corto coincide con el de la dirección. */
export const findTorneoBySlug = (
  torneos: SiteTorneo[] | undefined,
  slug: string | undefined
): SiteTorneo | undefined => {
  if (!slug || !torneos) return undefined;
  // Con un solo torneo el sitio es de torneo único: no hay direcciones con
  // nombre corto, todo vive en el alcance general como antes.
  if (torneos.length < 2) return undefined;
  const s = slug.toLowerCase();
  return torneos.find((t) => (t.slug || '').toLowerCase() === s);
};

/**
 * Páginas de un torneo concreto. Si el nombre corto no existe todavía
 * (o el sitio maneja un solo torneo) se muestra la página de no encontrado.
 */
export const TorneoSlugLayout = () => {
  const { torneoSlug } = useParams();
  const { data, isLoading } = useSiteTorneos();
  const torneo = findTorneoBySlug(data?.torneos, torneoSlug);
  const scope = useConfigScope();
  const { torneoId } = useTorneoId();
  const expectedTorneoId = torneo ? String(torneo.torneoid) : '';

  useEffect(() => {
    if (!torneo) return;

    // Cambia alcance + torneoid antes de montar la página hija. Si dejamos que
    // el Outlet se monte con el valor anterior, sus hooks alcanzan a solicitar
    // y cachear datos del torneo previo al navegar entre slugs equivalentes.
    setConfigScope(expectedTorneoId);
    setStoredTorneoId(expectedTorneoId);
  }, [torneo]);

  if (isLoading) return null;
  if (!torneo) return <NotFound />;

  // El cambio de torneo es una frontera de datos: no se monta ninguna página
  // pública hasta que ambos identificadores coinciden con el slug de la URL.
  if (scope !== expectedTorneoId || torneoId !== expectedTorneoId) return null;

  return (
    <QueryClientProvider client={getTournamentQueryClient(expectedTorneoId)}>
      <Outlet key={expectedTorneoId} />
    </QueryClientProvider>
  );
};

/**
 * Mantiene el alcance general en todo lo que no cuelga de un torneo
 * (home, /admin, páginas compartidas).
 */
export const TorneoScopeSync = () => {
  const location = useLocation();
  const { data } = useSiteTorneos();

  useEffect(() => {
    const first = location.pathname.split('/').filter(Boolean)[0];
    const torneo = findTorneoBySlug(data?.torneos, first);
    if (!torneo) setConfigScope('general');
  }, [location.pathname, data?.torneos]);

  return null;
};

/**
 * Prefijo para los enlaces del menú: '' en general, '/experience' dentro de
 * un torneo.
 */
export const useTorneoPrefix = (): string => {
  const scope = useConfigScope();
  const { data } = useSiteTorneos();
  if (scope === 'general') return '';
  const torneo = data?.torneos.find((t) => String(t.torneoid) === scope);
  return torneo?.slug ? `/${torneo.slug}` : '';
};
