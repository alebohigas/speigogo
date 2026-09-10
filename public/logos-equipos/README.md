# Logos de equipos

Deja aquí los logos de cada equipo. El sistema los relaciona automáticamente
con el número de equipo (`jugadores.grupoid`).

## Dónde va cada archivo

- Un solo torneo en el sitio: `public/logos-equipos/9001.png`
- Varios torneos: `public/logos-equipos/t371/9001.png`
  (la carpeta `t` + el número de torneo se busca primero)

## Cómo se nombra

El nombre del archivo es el número del equipo. El sufijo `_1` con el que
suelen venir exportados es opcional, todos estos funcionan:

```
9001.png
9001_1.png
AK9001.png
AK9001_1.png
```

Extensiones aceptadas: `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`.

Si un equipo no tiene archivo aquí, se usa el logo que ya está en la base de
datos y, si tampoco existe, un recuadro genérico.

Al publicar el sitio, esta carpeta se copia tal cual dentro de `dist/`, así que
también hay que subirla al hosting junto con el resto de los archivos.
