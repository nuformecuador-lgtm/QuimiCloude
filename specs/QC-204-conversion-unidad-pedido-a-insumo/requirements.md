# QC-204 — conversion-unidad-pedido-a-insumo · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** — · **Rama** feature/QC-204-conversion-unidad-pedido-a-insumo
>
> **Alcance.** La necesidad de cada insumo (cantidad del pedido × %) se expresa en la **unidad del
> pedido** y se **convierte** a la unidad del insumo antes de costear, apartar y mostrar. Hoy no se
> convierte: un pedido de 1000 kg y uno de 1000 g dan el mismo costo y apartan lo mismo.
>
> **Lo que NO entra.** La densidad por producto (descartada, sin ficha). La precisión de `unit_cost`
> (**QC-178**). Agrupar insumos homónimos por familia de unidad (**QC-203**). Bloquear el cambio de
> base o factor de una unidad en uso (**QC-206**). Recalcular o migrar los pedidos ya guardados.
>
> Sembrado por `/afinar-feature` el 2026-10-05. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Reserva y Finalizar con una línea no convertible (D4).** D4 solo cierra el costo. Falta decidir
   si un pedido con un insumo no convertible pasa a `BLOQUEADO` como falta de material (QC-138), o
   se rechaza al guardar.
2. **Cómo se muestra «incluye una aproximación» en el costo** (texto, icono o tooltip) y la marca
   «aprox.» de la línea (D7). Es de `design.md`.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-05 | ¿En qué unidad está la necesidad del insumo? | Cantidad × % en la **unidad del pedido**, convertida después a la unidad guardada del insumo. Heredado de **QC-147** (fórmula) y **QC-164** (conversión). |
| 2026-10-05 | ¿Misma familia (kg ↔ g, l ↔ ml)? | Conversión **exacta** con `convertQuantity` y los factores de **QC-76**. Heredado de **QC-164**. |
| 2026-10-05 | ¿Masa ↔ volumen (pedido en l, insumo en kg)? | **Aproximación sin densidad**: la cantidad en la base de su familia (mililitro) se toma igual en la base de la otra (gramo): 1 ml ≈ 1 g, 1 l ≈ 1 kg. Ratifica **QC-164**. |
| 2026-10-05 | ¿Cualquier otra combinación (kg ↔ unidad, docena…)? | **No convertible.** El pedido queda **sin costo** (`null`, como hoy cuando falta existencia) y la tabla de ingredientes **avisa** que la unidad no es convertible. |
| 2026-10-05 | ¿Pedidos ya creados? | **Sin migración**: conservan el costo y la reserva guardados. |
| 2026-10-05 | ¿Recálculos posteriores de esos pedidos? | Todo recálculo que ya ocurre hoy (editar, desbloquear, repartir, costo del lote al empacar, cotización) usa la **fórmula nueva**. Los pedidos **sin unidad** (`unit_id` NULL) se calculan como hoy (**QC-164**). |
| 2026-10-05 | ¿Se avisa de la aproximación? | **Sí.** La línea aproximada lleva la marca «aprox.» en la tabla de ingredientes y en la ejecución; el costo del pedido indica que incluye una aproximación. |
| 2026-10-05 | ¿Quién usa el cálculo nuevo? | El **costo** (`order-cost.ts` y sus llamantes, más la cotización `quote-order-cost.ts`, que pasa a recibir `unitId`), la **reserva** (`order-requirement.ts`, **QC-141**), la **ejecución** del operario (`get-assigned-order-execution.ts`) y la **tabla de ingredientes** de Pedidos. |
| 2026-10-05 | ¿Permisos? | **Sin cambios**: `pedidos.modificar`, validado en el service. Heredado de **QC-86**. |
| 2026-10-05 | ¿E2E? | **Sí**, toca importes (`CHECKPOINTS.md`): pedido en g sobre insumo en kg (exacto) y pedido en l sobre insumo en kg (aproximado), comprobando costo y cantidad apartada. |
| 2026-10-05 | Identificadores, borrado y dependencias | **Heredado**: identificadores en inglés y borrado lógico (**QC-4**). Sin dependencias nuevas. |
