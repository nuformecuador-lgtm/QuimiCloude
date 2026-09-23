# QC-132 — cantidad-del-pedido-sin-title-exacto · requirements.md

> **Zona** frontend · **Complejidad** low · **depends_on** — · **Rama** feature/QC-132-cantidad-del-pedido-sin-title-exacto
>
> **Alcance.** Tres cifras que se pintan redondeadas a dos decimales ganan su valor exacto en el `title`,
> con `exactDecimalTitle`: la columna Cantidad de `/pedidos`, la cantidad del pedido y la de cada línea
> de receta en la ejecución de `/asignacion/[id]`. Si lo pintado ya es exacto, no hay `title`.
>
> **Lo que NO entra.** Rehacer el redondeo de `lib/shared/ui/decimal-display.ts` (PR #85, no se toca);
> los tests que QC-127 ya dejó completos; `order-field.tsx`, que redondea lo tecleado.
>
> Sembrado por `/afinar-feature` el 2026-09-23. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Línea convertida a otra unidad.** En la ejecución, la cantidad de la línea puede mostrarse en otra
   unidad (`convertQuantity`, hasta 12 decimales, truncando). El `title` mostraría el valor convertido
   entero (p. ej. `0.333333333333`). No está decidido si eso vale tal cual o si hay que acotarlo; no
   se rellena con un supuesto.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿La cantidad del listado de pedidos lleva su valor exacto? | Sí. Fue un olvido, no una decisión: `title` con `exactDecimalTitle`, como el restante y el mínimo de compra. |
| 2026-09-23 | ¿Otras pantallas en el mismo caso? | Entran también la cantidad del pedido y la de cada línea en `/asignacion/[id]`. Censo del leader: son los únicos otros usos de `formatDecimalDisplay` que muestran una cifra sin `title`. |
| 2026-09-23 | ¿E2E? | No. Tests de componente que comprueban el `title` en el DOM; no es un flujo crítico de `CHECKPOINTS.md`. |
| 2026-09-23 | El `title` no se ve en móvil ni en papel | Se acepta, heredado de QC-127. |
| 2026-09-23 | Utilidad de redondeo | Se reutiliza `lib/shared/ui/decimal-display.ts` sin tocarla (PR #85). |
