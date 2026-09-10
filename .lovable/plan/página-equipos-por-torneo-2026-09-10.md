# Página "Equipos" por torneo

Nueva página pública **Equipos**, disponible en cada torneo (nunca en General), que muestra la lista de jugadores agrupados en equipos con su H.I. y H.C., replicando el reporte legacy `lista_jug3.php` / `jugadores3.php`.

## Qué verá el usuario

1. **Selección de categoría** con tarjetas, igual que en Jugadores.
2. Al entrar a una categoría:
   - Encabezado: `JUGADORES: 144` y `EQUIPOS: 36`.
   - `Categoría: Experience`, `Handicap de Campo Mínimo: 56`, `Jugadores por Equipo: 4`.
   - **Leyenda arriba, antes de la tabla**: lista de Tees de salida con su color de fondo (`Tee Salida Azules / Rating 72.4 / Slope 136 / Par 72`) y el recuadro gris con `H.I = Handicap Índice / H.C. = Handicap Campo` más el aviso amarillo `Fondo AMARILLO handicap fuera de rango`.
   - **Tabla de equipos**: encabezado Club · Equipo · HI · HC. Cada equipo abre con una fila destacada (logo, nombre del equipo, total del equipo en rojo, fondo amarillo si el total queda fuera del mínimo permitido), seguida de sus jugadores con HI y HC (celda HC con el color del tee del jugador), y una fila final "Handicap Neto" cuando la categoría aplica porcentaje.
   - Separador gris entre equipos, tal como en la referencia.

## Cómo se construye

### Backend (nuevo endpoint)
`server/api/equipos.php?torneoid=&catid=` devuelve JSON con:
- `tournament`: `hcpindexmin`, `index_campo` (1 = handicap de campo, 2 = index), `nummaxjug`.
- `category`: nombre, porcentaje, campoid, totales de jugadores y de equipos.
- `teams[]`: `grupoid`, `logo`, `totalHcp`, `totalIndex`, `handicapNeto`, `fueraDeRango`, y `players[]` con `id`, `nombre`, `hi`, `hc`, `bgcolor`, `color`.
- `tees[]`: `tee`, `rating`, `slope`, `par`, `bgcolor`, `color`.

Usa las mismas funciones de la base que el legacy: `f_logo_jugeq`, `f_sumhcpgrupo`, `f_sumIndexgrupo`, `f_hdccampo`, `f_hdccampogpo`, resolviendo `campoid` vía `caljuego` + `campo_tee` como en `lista_jug3.php`. Sigue el patrón seguro del proyecto (sin GRANTs, sin salida fuera del JSON, `torneoid` obligatorio).

### Frontend
- `src/pages/Equipos.tsx`: página nueva con navegación por tarjetas de categoría (patrón existente), leyenda superior y tabla de equipos.
- `src/hooks/useEquiposData.ts`: hook React Query sobre el nuevo endpoint.
- `src/config/api.ts`: helper `getEquiposUrl(catid)` con `torneoid` y `scope` como el resto.
- `src/App.tsx`: ruta `equipos` dentro de `publicPages` (queda bajo cada torneo y respeta el prefijo por torneo).
- `src/data/mockData.ts`: entrada de menú `EQUIPOS` para que aparezca en visibilidad, orden y grupos de Admin.
- `src/modules/registry.ts`: módulo `equipos` para poder activarlo/desactivarlo.
- `src/config/heroPages.ts`: hero de la página.

Al pertenecer a `publicPages`, la página vive dentro del ámbito de cada torneo y no aparece en el ámbito General.

## Notas
- Requiere subir manualmente `server/api/equipos.php` al hosting IONOS junto con el nuevo `dist`.
- Si la categoría no tiene equipos (`grupoid` vacío), la página muestra un mensaje en lugar de la tabla.
