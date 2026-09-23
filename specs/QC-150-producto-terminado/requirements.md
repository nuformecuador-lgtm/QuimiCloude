# QC-150 — producto-terminado · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** QC-141 · **Rama** feature/QC-150-producto-terminado
>
> **Alcance.** Nace el tipo de producto «producto terminado» (`FINISHED_PRODUCT`). Al **Finalizar** un
> pedido, entra al inventario un **lote** del producto terminado de su **receta + presentación**
> («Desengrasante industrial · Botella 1L»), que nace solo la primera vez. La cantidad son **envases
> enteros**: ⌊cantidad del pedido / contenido de la presentación⌋, guardada en la unidad de la
> presentación. La presentación gana su **contenido** (lo que era QC-130). Un producto terminado no
> se crea a mano, no admite alta manual de lotes, no es ingrediente de receta y solo admite ajustes
> que **restan**.
>
> **Lo que NO entra.** Consumir los ingredientes al entregar y la existencia decimal → **QC-141**
> (bloquea esta). Una pantalla de ventas → sin ficha: la salida se hace hoy con el ajuste de
> **QC-92**. Arreglar los tests que rompió `cd7f07a6` → PR `fix/rojos-de-cd7f07a6`.
>
> Sembrado por `/afinar-feature` el 2026-09-23. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Unidad de la cantidad del pedido.** El pedido no guarda unidad propia (QC-147: el consumo es
   cantidad × % en la unidad de cada insumo). Esta ficha la lee en la unidad de su presentación
   (50 con «Botella 1L» = 50 L). Falta confirmar que siempre es así, p. ej. con un «Saco 25 kg».
2. **Coste unitario con sobrante.** Si se costó 50,5 L y entran 50 L, ¿el coste unitario es
   coste / 50 (el sobrante encarece lo que entra) o coste / 50,5 (el sobrante se pierde a su coste)?
3. **Pedido sin coste** (QC-123 lo deja en nulo): el lote entra sin coste unitario. ¿Vale un lote sin
   coste, o hay que admitir el nulo en `unit_cost`?

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Qué es un producto terminado? | Un valor nuevo del tipo de producto, `FINISHED_PRODUCT`, añadido al final del enum `ProductType` (el que creó `cd7f07a6`). No se puede elegir al crear un producto a mano. |
| 2026-09-23 | ¿Qué producto entra al terminar? | Uno por **receta + presentación**, con nombre «receta · presentación». Nace solo la primera vez que se finaliza un pedido de esa combinación. Su unidad es la de la presentación (encaja con QC-121). |
| 2026-09-23 | ¿Cuándo entra? | Al **Finalizar** en `/asignacion/[id]` (pedido → `ENTREGADO`, QC-63/QC-145), en la misma operación. |
| 2026-09-23 | ¿Qué entra? | Un **lote**: presentación = la del pedido (QC-146); cantidad = envases enteros × contenido; coste unitario = coste de ingredientes (QC-123) / cantidad (ver pregunta 2). |
| 2026-09-23 | ¿Cómo se cuenta? | En **envases enteros, redondeando hacia abajo**: 50,5 L en «Botella 1L» → 50 botellas; el sobrante no entra. Se guarda en la **unidad de la presentación** (50 L), como QC-91; las botellas solo se muestran. |
| 2026-09-23 | ¿De dónde sale el contenido del envase? | La **presentación gana el campo «contenido»** (cantidad en su unidad), editable en la pantalla de presentaciones (QC-45). Es el alcance de QC-130, absorbido aquí. Un pedido cuya presentación no tenga contenido **no se puede finalizar**. |
| 2026-09-23 | ¿Qué se prohíbe? | Alta manual de lotes; ser ingrediente de una receta; ajustes que **suman**. Se permiten los ajustes que **restan** (la «venta» de hoy, QC-92). |
| 2026-09-23 | Existencia decimal | La trae **QC-141**, que por eso bloquea esta ficha. |
| 2026-09-23 | ¿E2E? | **Sí**: es un movimiento de inventario (`CHECKPOINTS.md`). Finalizar un pedido y ver entrar el lote. |
| 2026-09-23 | Identificadores y borrado | En inglés (QC-4); el producto terminado usa el borrado lógico que ya existe. |
