# QC-195 — envases-del-pedido-como-productos · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** — · **Rama:** `feature/QC-195-envases-del-pedido-como-productos`
>
> **Alcance:** el reparto del pedido deja de elegir presentaciones y pasa a elegir productos
> PACKAGING (envases). Cada envase tiene una sola presentación fija, de la que sale el contenido
> para el cálculo actual. El selector solo lista los envases cuya presentación tiene la misma
> unidad base que la cantidad del pedido (l → l, ml). Los envases elegidos se apartan con el
> mismo flujo que las materias primas, con el aviso y el bloqueo de QC-138, y su costo se suma a
> la cotización.
>
> **Lo que NO entra:** migrar los repartos de pedidos ya existentes.
>
> Sembrado por `/afinar-feature` el 2026-10-03. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- **Unidad «envase».** No existe una unidad de sistema para contar piezas. Hay que decidir si
  se crea (por ejemplo `unidad`) y cómo convive con el trigger `product_batches_check_unit`,
  que hoy exige que el lote use la unidad de su presentación. Toca unidades de medida
  (`docs/architecture.md > Preguntas abiertas del dominio`).
- **Envases ya cargados.** Qué pasa con los productos PACKAGING que ya tienen stock en litros o
  kilos: si se convierten o si se exige darlos de alta de nuevo.
- **Cuándo se consume el envase.** Si es con las materias primas, al pasar a `POR_EMPACAR`, o
  al Terminar el empaque (`createFinishPacking`).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-03 | Envase y presentación | Un producto PACKAGING tiene una sola presentación fija; «Botella PET 500 ml» y «Botella PET 1 L» son productos distintos. Requiere ajustar `products_finished_identity_matches_type`. |
| 2026-10-03 | ¿En qué se cuenta su stock? | En envases. Un reparto de 40 botellas aparta 40 envases. |
| 2026-10-03 | ¿Qué envases lista el selector? | Solo los que tienen la misma unidad base que la cantidad del pedido (QC-76: `baseUnitId ?? id`). |
| 2026-10-03 | Reserva y aviso | Mismo flujo que las materias primas (QC-141): todo o nada, del lote más antiguo al más nuevo. Si falta stock, aviso y `BLOQUEADO` como en QC-138. |
| 2026-10-03 | Cálculo del reparto | Se mantiene `order-distribution.ts`: envases × contenido de la presentación, convertido a la unidad del pedido. |
| 2026-10-03 | Pedidos existentes | Quedan como están, sin apartar envases. Si se edita su reparto, hay que elegir productos PACKAGING. |
| 2026-10-03 | Costo | El costo del envase se suma a la cotización, con el costo promedio de QC-141 D22. |
