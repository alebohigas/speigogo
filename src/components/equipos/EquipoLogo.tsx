/**
 * EquipoLogo
 * Muestra el logo de un equipo buscándolo por número de equipo en la
 * carpeta pública `/logos-equipos` (ver src/lib/equipoLogos.ts).
 *
 * La búsqueda se hace fuera del DOM (ver resolveEquipoLogo): así la
 * tabla no monta imágenes rotas ni cambia de tamaño en cada intento,
 * que era lo que hacía parpadear y "bailar" la página cuando faltaban
 * los logos. Mientras se resuelve —o si no existe ninguno— se muestra
 * un recuadro del mismo tamaño para que nada se mueva.
 */

import { useEffect, useState } from 'react';
import { getCachedEquipoLogo, resolveEquipoLogo } from '@/lib/equipoLogos';

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
  const [src, setSrc] = useState<string | null | undefined>(() =>
    getCachedEquipoLogo(grupoid, torneoId, dbLogo)
  );

  useEffect(() => {
    let active = true;
    const cached = getCachedEquipoLogo(grupoid, torneoId, dbLogo);
    if (cached !== undefined) {
      setSrc(cached);
      return;
    }
    setSrc(undefined);
    resolveEquipoLogo(grupoid, torneoId, dbLogo).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [grupoid, torneoId, dbLogo]);

  // Reserva de espacio estable: mismo alto/ancho mínimo siempre.
  const boxStyle: React.CSSProperties = { height: '2.1375rem', minWidth: '2.6rem', ...style };

  if (!src) {
    return (
      <span
        className="inline-flex items-center justify-center rounded bg-muted text-[0.6rem] text-muted-foreground"
        style={boxStyle}
        aria-hidden="true"
      >
        {(grupoid || '').replace(/\D/g, '') || '—'}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={`Logo del equipo ${grupoid}`}
      className={className}
      style={boxStyle}
      decoding="async"
    />
  );
};

export default EquipoLogo;
