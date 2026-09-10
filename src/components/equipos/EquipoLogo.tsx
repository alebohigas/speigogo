/**
 * EquipoLogo
 * Muestra el logo de un equipo buscándolo por número de equipo en la
 * carpeta pública `/logos-equipos` (ver src/lib/equipoLogos.ts).
 * Si ninguna ruta carga, usa el logo que entrega la base de datos y,
 * en último caso, un recuadro genérico.
 */

import { useMemo, useState } from 'react';
import { buildEquipoLogoCandidates } from '@/lib/equipoLogos';

/** Recuadro genérico usado cuando no hay ningún logo disponible. */
const FALLBACK_LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="30"><rect width="50" height="30" fill="%23166534" rx="4"/><text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="9" font-family="sans-serif">Club</text></svg>'
)}`;

interface EquipoLogoProps {
  /** Identificador del equipo (jugadores.grupoid), ej. "AK9001". */
  grupoid: string;
  /** Torneo activo, para buscar primero en /logos-equipos/t{torneoid}. */
  torneoId?: string;
  /** Logo devuelto por la base de datos (respaldo). */
  dbLogo?: string;
  className?: string;
  style?: React.CSSProperties;
}

const EquipoLogo = ({ grupoid, torneoId, dbLogo, className, style }: EquipoLogoProps) => {
  /** Rutas locales + respaldo de la BD + recuadro genérico. */
  const candidates = useMemo(() => {
    const list = buildEquipoLogoCandidates(grupoid, torneoId);
    if (dbLogo) list.push(dbLogo);
    list.push(FALLBACK_LOGO);
    return list;
  }, [grupoid, torneoId, dbLogo]);

  const [index, setIndex] = useState(0);

  return (
    <img
      key={candidates[0]}
      src={candidates[Math.min(index, candidates.length - 1)]}
      alt={`Logo del equipo ${grupoid}`}
      loading="lazy"
      className={className}
      style={style}
      onError={() => setIndex((i) => (i < candidates.length - 1 ? i + 1 : i))}
    />
  );
};

export default EquipoLogo;
