# docs/diseno/ — la fuente de diseño versionada

Copia literal, sin editar, de la fuente de diseño de QuimiCloud: lo que el equipo consulta antes de
crear o cambiar una pieza de UI (regla de reutilizar del catálogo, `components/shared/`).

## Qué hay aquí

| Archivo | Qué es |
|---|---|
| `guia-de-marca.html` | La guía de marca: logo, color, tipografía y tono. Se abre sola en el navegador (no referencia archivos locales). |
| `sistema.css` | El sistema visual completo: tokens de `app/globals.css` más las piezas. Es **referencia para portar a componentes**; no se importa en la app ni se copia tal cual. |
| `canvas/` | Copia de todos los tableros del canvas: 87 `*.dc.html`, `canvas.json` y `qc.css`. |

`sistema.css` y `canvas/qc.css` son el **mismo archivo, byte a byte**: los tableros cargan `./qc.css`
y no se tocan, así que el sistema visual vive en los dos sitios. Si cambia, se actualizan juntos (la
guardia del catálogo exige que sean idénticos).

## El canvas

- La vista viva es el canvas de Claude Design:
  https://claude.ai/artifact/Voiri77bod5p5EuzCUkPaq
- Es **privado**: el acceso se pide al humano.
- Convención de nombres de los tableros:
  - `<Pantalla>.dc.html` = la pantalla en escritorio;
  - `<Pantalla>Movil.dc.html` y `<Pantalla>Tablet.dc.html` = la misma pantalla en teléfono y tablet;
    el `…Movil` lleva además la ficha por plataforma de la pantalla (Reutiliza / Librerías /
    Escritorio / Tablet / Teléfono / Animación / Por confirmar);
  - `Modales<Modulo>.dc.html` = todos los modales del módulo abiertos.
- `support.js`, el runtime del canvas, **no se versiona**. Los tableros lo cargan (`./support.js`),
  así que abiertos desde aquí no se ven como en el canvas: la copia de `canvas/` es **fuente
  legible** y la vista viva es el canvas.

## Flujo `/design`, paso a paso

`/design` no es un comando del repo: es el pase de diseño con Claude Design.

1. **La ficha pide el pase.** La ficha que necesita una pieza nueva o un cambio visual pide el pase
   de diseño. Lo puede hacer **cualquier persona del equipo**.
2. **Se pide el diseño a Claude.** Desde **Claude Code**, esa persona le pide a Claude un diseño con
   Claude Design: un tablero nuevo en el canvas del proyecto o en un canvas propio compartido con el
   humano. El tablero trae estados, animaciones y el componente o la librería que usa, en
   escritorio, tablet y teléfono, siguiendo `guia-de-marca.html`.
3. **El humano lo aprueba.**
4. **Se copia a la rama de la ficha.** El tablero aprobado se copia a `docs/diseno/canvas/` **en la
   rama de la ficha**. Si cambió el sistema visual, `sistema.css` y `canvas/qc.css` se actualizan
   juntos.
5. **El spec lo cita.** El `design.md` de la ficha cita el tablero.
6. **El catálogo lo lleva.** Al implementar, la fila de la pieza en el catálogo de componentes lo
   lleva en la columna `Diseño`.
