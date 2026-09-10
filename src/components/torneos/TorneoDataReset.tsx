/**
 * TorneoDataReset
 * Multi-torneo: la mayoría de los hooks de datos leen el torneo activo desde
 * `localStorage` en el momento de la petición, pero sus claves de caché no
 * incluyen ese identificador. Al navegar del primer torneo al segundo, React
 * Query servía la información ya guardada del torneo anterior (por ejemplo,
 * Akron Invitational mostrando los datos de Akron Experience).
 *
 * Este componente observa el torneo activo (y el alcance de configuración) y,
 * cuando cambia, descarta toda la información cacheada salvo la propia
 * configuración del sitio, forzando a las páginas visibles a volver a pedir
 * los datos del torneo correcto.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConfigScope } from '@/lib/configScope';
import { useTorneoId } from '@/hooks/useTorneoId';

/** Claves que NO deben borrarse: describen el sitio, no un torneo concreto. */
const PRESERVED_KEYS = new Set(['site-config', 'site-torneos', 'modules-config']);

export const TorneoDataReset = () => {
  const queryClient = useQueryClient();
  const scope = useConfigScope();
  const { torneoId } = useTorneoId();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const signature = `${scope}|${torneoId}`;
    if (previous.current === null) {
      previous.current = signature;
      return;
    }
    if (previous.current === signature) return;
    previous.current = signature;

    queryClient.removeQueries({
      predicate: (query) => {
        const root = query.queryKey?.[0];
        return typeof root !== 'string' || !PRESERVED_KEYS.has(root);
      },
    });
    queryClient.refetchQueries({ type: 'active' });
  }, [queryClient, scope, torneoId]);

  return null;
};

export default TorneoDataReset;
