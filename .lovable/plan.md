# Multi-torneo en un mismo sitio (speigogo)

Objetivo: que un mismo dominio muestre varios torneos a la vez (274 Akron Experience, 275 Akron Invitational, y los que vengan), cada uno con su propio menú desplegable y sus propias páginas, más un bloque de páginas "General" compartido en la barra superior. En /admin, una pestaña por torneo y una pestaña General.

## Cómo se verá

**Barra superior pública**

```text
HOME | AKRON EXPERIENCE ▾ | AKRON INVITATIONAL ▾ | OYES GENERAL | REGLAS Y PREMIOS | PATROCINADORES
                │                    │
                │                    └── Convocatoria, Equipos, Salidas, Live, Resultados, Oyes
                └── Horarios, Convocatoria, Equipos, Salidas, Live, Resultados, Oyes, Drivers
```

- Cada torneo es un chevron con el nombre del torneo y dentro sólo sus páginas visibles.
- Las páginas "General" van sueltas a la derecha, sin chevron.
- Direcciones: `/experience/resultados`, `/invitational/resultados`. El nombre corto sale automáticamente de la primera palabra del nombre del torneo (Akron Experience → `akron`... si dos torneos chocan se usa la primera palabra distintiva, editable a mano en admin).
- Las páginas generales conservan su dirección actual: `/reglas`, `/patrocinadores`.

**Panel /admin**

```text
[ GENERAL ] [ AKRON EXPERIENCE ] [ AKRON INVITATIONAL ] [ + Torneos ]
```

- Al entrar a la pestaña de un torneo, todo el panel actual (Visibilidad, Convocatoria, Avisos, Eventos, Menús, Premios, Hoteles, POP, Anuncio, Live, Registro, Salidas, Tarjetas…) opera sobre ese torneo.
- La pestaña **General** contiene lo compartido: páginas del menú superior comunes, patrocinadores, tema/colores, imágenes globales y ajustes del sitio.
- La pestaña **Torneos** permite agregar/quitar torneos del sitio, poner el nombre visible, el nombre corto de la dirección y el orden en la barra.

## Cómo funciona por dentro

1. **Nueva tabla `site_torneos`** (`domain`, `torneoid`, `nombre`, `slug`, `orden`, `activo`): define qué torneos vive este dominio y en qué orden aparecen. Sustituye al torneoid único.
2. **`site_config` pasa a tener alcance**: se añade la columna `scope` (`general` o el torneoid) y la clave primaria pasa a `(domain, scope)`. Cada torneo guarda su propia visibilidad, orden de menú, grupos y configuraciones JSON; la fila `general` guarda tema, patrocinadores y las páginas compartidas. Migración: la fila actual se copia a los dos torneos y también a `general`, sin perder nada.
3. **`site_config.php`** acepta `?scope=` en lectura y escritura, y un modo `all` que devuelve la lista de torneos + todas las configuraciones en una sola llamada (para no multiplicar peticiones).
4. **Contexto de torneo activo en el front**: un `TournamentScopeProvider` sustituye al `torneoId` único de localStorage. Se resuelve por el nombre corto de la dirección; las páginas generales usan el torneo marcado como principal cuando necesitan datos. Todos los hooks que hoy leen `getTorneoId()` pasan a leer el torneo del contexto, así ninguna página se queda con el torneo equivocado.
5. **Rutas**: se añade `/:torneoSlug/*` delante de las páginas de torneo, conservando las rutas actuales como redirección al torneo principal para no romper enlaces existentes.
6. **Menú**: `Header` arma un chevron por torneo (con su visibilidad y orden propios) y añade después las páginas del alcance general.

## Orden de trabajo

1. Migraciones SQL (`site_torneos`, columna `scope`, copia de la configuración actual a ambos torneos y a general).
2. `site_config.php` con alcances + endpoint de lista de torneos.
3. Contexto de torneo activo y rutas con nombre corto.
4. Barra superior con chevrones por torneo + enlaces generales.
5. /admin con pestañas Torneos / General / una por torneo.
6. Repaso de páginas y hooks para que todos usen el torneo del contexto.

Nada de esto cambia el aspecto de las páginas ni el contenido ya cargado; sólo dónde vive cada configuración.
