# QC-167 — recorrido-de-ejecucion-en-el-dashboard · requirements.md

> **Zona** `fullstack` · **Complejidad** `medium` · **depends_on** `QC-82` ·
> **Rama** `feature/QC-167-recorrido-de-ejecucion-en-el-dashboard` (nace de la rama de QC-82)
>
> ## Alcance
>
> El Administrador consulta en el dashboard el registro de ejecución que guarda QC-82. Ve una
> **lista paginada** de pedidos ejecutados, incluidos los que siguen en curso, y puede filtrarla
> por pedido, persona, fechas y cancelados. Cada pedido abre su **recorrido** en una página propia:
> las anotaciones en orden, el tiempo entre una y la siguiente, la duración total y las vueltas
> atrás marcadas.
>
> ## Lo que NO entra
>
> - Escribir el registro → **QC-82**.
> - Purgarlo pasados X días → **QC-124**.
> - Un permiso nuevo o abrir la vista a otro rol: sin ficha, se decidirá si llega a hacer falta.
> - Exportar (CSV/PDF) o mostrar gráficos: sin ficha.
> - Guardar lo que el operario marcó dentro de cada paso: sigue fuera, como fijaron QC-63 y QC-82.
>
> _Sembrado por `/afinar-feature` el 2026-10-07. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- Cómo se cuenta la duración total si un pedido se retomó tras una pausa larga: tiempo de reloj
  de la primera a la última anotación, o la suma de los tramos. Lo propone el spec_author en el
  design y lo aprueba el humano en F1.3.
- Con qué se busca un pedido en el filtro: el identificador visible que usa hoy la pantalla de
  pedidos. Lo comprueba el spec_author en el código, sin inventarlo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-07 | ¿Qué se muestra? | Lista de pedidos ejecutados y, al abrir uno, su recorrido paso a paso |
| 2026-10-07 | ¿Qué cálculos? | Tiempo entre anotaciones, duración total (el empaque aparte) y vueltas atrás marcadas y contadas |
| 2026-10-07 | ¿Filtros? | Pedido, persona, rango de fechas y solo cancelados. Viven en la URL y sobreviven a la paginación y a volver del detalle (heredado de QC-102) |
| 2026-10-07 | ¿Paginación? | En el servidor, 10/25 por página, con la tabla compartida (heredado de QC-55/QC-88) |
| 2026-10-07 | ¿Quién lo ve? | `dashboard.consultar`, que hoy solo tiene el Administrador. Sin permiso nuevo. Se valida en el service y lleva su test |
| 2026-10-07 | ¿Pedidos en curso? | Salen en la lista marcados «en curso», con la duración abierta |
| 2026-10-07 | ¿Dónde vive el detalle? | Página propia bajo `/dashboard`, con URL compartible; volver conserva los filtros |
| 2026-10-07 | ¿Aislamiento? | Todas las consultas filtran por la empresa de la sesión (heredado de QC-82 y QC-102) |
| 2026-10-07 | ¿E2E? | Sí: el Administrador filtra y abre un recorrido; otro rol recibe 404 |
| 2026-10-07 | ¿Costura del dashboard? | La costura vacía de `dashboard-content.tsx` (QC-75) se rellena aquí, y su test negativo se enmienda |
