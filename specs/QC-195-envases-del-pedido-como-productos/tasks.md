# QC-195 — envases-del-pedido-como-productos · tasks.md

> Escrito por `spec_author` en F1.2 (2026-10-03). Ninguna task empieza antes de la aprobación del
> spec. Todas suponen las opciones **recomendadas** de `design.md > 1` (P1-A, P2-A, P3-b, N1-N10);
> si en F1.4 el humano elige otra, T0 reescribe las tasks afectadas antes de seguir.
>
> Cada task cierra con `./init.sh --rapido` en verde y un commit
> (`feat(QC-195): …` / `test(QC-195): …`). La última, con `./init.sh` completo. Los tests llevan
> `R<n>` en el nombre del caso; el código de producción no cita fichas ni requisitos
> (`docs/conventions.md > Comentarios`). `[P]` = paralelizable con las que se indican.

## [ ] T0 — Recontraste y decisiones `[bloquea a todas]`

- Confirmar en el worktree que las referencias `archivo:línea` de `design.md > 6` siguen valiendo
  sobre la punta de `dev`; anotar en `progress/impl_QC-195.md` las que se movieron.
- Copiar a `design.md > 1` lo que el humano decidió en F1.4 sobre P1, P2, P3 y N1-N10, y reescribir
  los requisitos marcados `[P…]`/`[N…]` si cambia alguno.
- Correr la lista de `design.md > 8` contra la punta actual y anotar cuáles están rojos de partida
  (deberían ser cero).

**Hecho cuando:** `progress/impl_QC-195.md` tiene las decisiones de F1.4, el recontraste y el
`./init.sh --rapido` de partida en verde.

## [ ] T1 — Migración y esquema `[depende de T0]`

- `db/migrations/<ts>_packaging_products_in_distribution/migration.sql` y `down.sql` (§2):
  CHECK `products_finished_identity_matches_type` con cuerpo nuevo y mismo nombre;
  `products_company_id_id_key`; `order_presentation_lines.packaging_product_id` con su FK compuesta
  e índice; unidad de sistema de P1-A (idempotente).
- `db/schema.prisma`: `@@unique([companyId, id])` en `Product`, `packagingProductId` en
  `OrderPresentationLine`, comentarios de modelo al día.
- Tests de migración (texto) en `tests/unit/inventario/schema/` y `tests/unit/pedidos/schema/`, y de
  integración contra Postgres: un PRODUCT o MACHINE con presentación se rechaza, un PACKAGING con
  presentación entra, un FINISHED_PRODUCT sin receta se rechaza (R5); una línea con envase de otra
  empresa se rechaza por FK.

**Hecho cuando:** `pnpm run db:migrate` aplica y `down.sql` revierte sobre una base de prueba; tests
R5 verdes; `inventario-constraints.int.test.ts` sigue verde.

## [ ] T2 — El envase en inventario: alta, lote y ajuste `[depende de T1]`

- `product-input.ts`: el alta de PACKAGING lleva la presentación en el producto; existencia entera
  en alta y ajuste (N3).
- `create-product.ts` y `product-prisma.ts` (`createWithFirstBatch`, `addBatchToAlive`,
  `findAliveIdByNameInPresentationUnit`): el envase nace con `presentation_id` y unidad envase; sus
  lotes sin presentación; un lote con otra presentación se rechaza; cambiar la presentación de un
  envase se rechaza bajo el bloqueo del producto.
- Ajuste de lote de envase en envases enteros.

**Hecho cuando:** unit e integración verdes para **R1, R2, R3, R4, R6, R7**; los 6 casos PACKAGING de
`product-input.test.ts` reescritos contra R1/R7.

## [ ] T3 — `PackagingCatalog` `[depende de T1]` `[P con T2]`

- Puerto en `lib/modules/inventario/domain/packaging-catalog.ts`, adaptador Prisma, export en el
  barrel y cableado en `lib/composition`.
- `findRefs`, `listForDistribution` (filtro por unidades de presentación, solo con contenido,
  búsqueda, paginado con `MAX_PAGE_SIZE`) y `findCostingBatches` (con `excludeOrderId`, sin lotes sin
  costo). Disponible desde `findReservedAndAvailableByBatch`.

**Hecho cuando:** integración verde: solo PACKAGING vivos, de la empresa y con presentación fija
(**R9**); filtro por familia de unidad (**R8**, el ejemplo l/ml frente a kg/g); disponible en envases
con los de cero incluidos (**R10**); `guard-tipos-de-producto`, `guard-arquitectura-modulos` y
`guard-ambito-empresa-inventario` verdes.

## [ ] T4 — `consumeForOrder` por subconjunto de productos `[depende de T0]` `[P con T1-T3]`

- `MaterialReservations.consumeForOrder` gana `productIds?`; sin él, idéntico a hoy.
- Tests de `reservation-prisma` contra Postgres: con `productIds` solo consume esos lotes apartados y
  deja intacto lo demás; el respaldo se filtra igual.

**Hecho cuando:** tests nuevos verdes y los existentes de consumo siguen verdes sin tocar.

## [ ] T5 — Necesidad y resolución del reparto en `pedidos` `[depende de T3]`

- `buildOrderRequirement` (receta + envases, fase, suma por producto) en `order-requirement.ts`.
- Resolución compartida de líneas (envase o línea antigua sin cambios) usada por
  `resolve-distribution.ts`, `order-presentation-availability.ts` y
  `update-order-presentation-lines.ts`; `order-input.ts` con `packagingProductId`.
- `order-distribution.ts` **no se toca**; su test sigue verde sin cambios.

**Hecho cuando:** unit verdes para **R11, R12, R13, R14, R34, R35** y para la necesidad (40 botellas
→ línea de 40) de **R15**.

## [ ] T6 — Alta, edición y revisión de bloqueados con envases `[depende de T5]`

- `create-order.ts`, `update-order.ts`, `review-blocked-orders.ts` con `buildOrderRequirement`.
- Integración contra Postgres: aparta envases del lote más antiguo al más nuevo y todo o nada; falta
  de envase → `order_would_block`, con confirmación `BLOQUEADO`; `EN_CURSO` rechaza; revisión de
  bloqueados no desbloquea si falta envase; cancelar, borrar y caducar liberan envases; otros pedidos
  intactos.

**Hecho cuando:** verdes **R15, R16, R17, R18 (edición completa), R19 (edición completa), R21, R22,
R23**.

## [ ] T7 — «Reparto y unidad» toca la reserva `[depende de T5]` `[P con T6]`

- `update-order-presentation-lines.ts` sobre `OrderUnitOfWork`, con `confirmBlocked` y los dos
  resultados nuevos; `updateOrderDistributionAction` los traduce.
- Reescribir `update-order-presentation-lines.test.ts:327` contra R15/R20 (el caso sigue exigiendo
  que no se toquen cantidad ni receta).
- Integración: quitar o bajar envases libera la diferencia; en `POR_EMPACAR` no se reaparta materia
  prima consumida; concurrencia de QC-170 sigue verde.

**Hecho cuando:** verdes **R17, R18, R19, R20, R24** por esta vía; `qc170-*.int.test.ts` verdes.

## [ ] T8 — Costo de los envases `[depende de T3, T5]` `[P con T6, T7]`

- `calculatePackagingCost` y `calculateOrderCost` puros en `order-cost.ts`; `resolveOrderCost` y el
  costeo del lote con envases; `quoteOrderCostSchema` con el reparto.
- Unit: el ejemplo de R27 da `24.0000` sumado a los ingredientes; disponible insuficiente → sin
  importe; lote sin costo fuera; lo apartado del propio pedido cuenta en la edición; cotización y
  guardado iguales.

**Hecho cuando:** verdes **R27, R28, R29 (dominio), R30, R31**.

## [ ] T9 — Consumo al Terminar `[depende de T4, T6]`

- `transition-order.ts`: `POR_EMPACAR` consume solo receta.
- `order-packing.ts`: consume envases antes del alta del producto terminado; `'insufficient_material'`
  hacia `asignaciones` (`finish-packing.ts`) y su mensaje.
- Integración: Terminar consume los envases apartados y da de alta el producto terminado en la
  presentación copiada; sin disponible rechaza sin mover nada; una línea antigua no consume envases.

**Hecho cuando:** verdes **R25, R26** y **R14** (alta en la presentación copiada) y **R33** (línea
antigua termina como hoy).

## [ ] T10 — Acción y selector de envases `[depende de T3]` `[P con T6-T9]`

- `listDistributionPackagingAction` con `pedidos.modificar` (N1) y su caso de uso.
- `PackagingSelect` y `order-distribution-field.tsx`: nombre, presentación y disponible; etiquetas en
  envases; líneas antiguas marcadas.

**Hecho cuando:** unit de UI verdes para **R8, R10, R36**; `guard-autorizacion-por-permiso` y
`guard-doc-permisos` verdes.

## [ ] T11 — Formulario del pedido y diálogo de reparto `[depende de T7, T8, T10]`

- `order-form.tsx`, `use-order-distribution-availability.ts`, `use-saved-line-contents.ts`,
  `use-order-cost-quote.ts`: líneas con envase; la cotización se recalcula al cambiar el reparto.
- Diálogo «Reparto y unidad» con la confirmación de bloqueo.

**Hecho cuando:** verdes **R29 (UI), R37** y los tests de `pedidos-ui` adaptados.

## [ ] T12 — Inventario: formulario y panel de lotes del envase `[depende de T2]` `[P con T10, T11]`

- `product-form.tsx`: presentación en el producto para Envase, existencia en envases entera.
- `product-batches-panel.tsx`: lote de envase en envases.
- Marca visible del envase legado sin presentación fija (P2-A).

**Hecho cuando:** unit de UI verdes para **R1, R6, R7** en la interfaz.

## [ ] T13 — Lecturas que siguen con líneas antiguas `[depende de T5]` `[P con T10-T12]`

- Ficha, listado, empaque y ejecución pintan línea antigua y línea con envase.
- Test de que ninguna línea antigua se modifica ni aparta al desplegar (sobre una base con un pedido
  sembrado antes de la migración).

**Hecho cuando:** verdes **R32, R33**.

## [ ] T14 — E2E `[depende de T9, T11, T12, T13]`

- Adaptar las E2E de `design.md > 8` sembrando envases. Nueva: pedido en litros con un envase de
  500 ml y otro de 1 l, 40 botellas apartadas, falta de envase con aviso y `BLOQUEADO`, cotización
  con el envase sumado y Terminar consumiendo los envases.
- Una E2E a la vez en la máquina; borrar `.next/dev/types` antes.

**Hecho cuando:** las E2E de pedidos, empaque, producto terminado, cotización y reserva verdes.

## [ ] T15 — Cierre `[depende de todas]`

- `./init.sh` completo en verde.
- `progress/impl_QC-195.md` con el mapa `R1..R37 -> test` sin huecos, y la lista de tests de
  `design.md > 8` que se reescribieron con su motivo.
- Limpieza de comentarios en las líneas tocadas (`docs/conventions.md > Comentarios`).

**Hecho cuando:** gate completo verde y trazabilidad completa.

## Mapa R -> task

| R | Task | R | Task | R | Task |
|---|---|---|---|---|---|
| R1 | T1, T2, T12 | R14 | T5, T9 | R27 | T8 |
| R2 | T2 | R15 | T5, T6, T7 | R28 | T8 |
| R3 | T2 | R16 | T6 | R29 | T8, T11 |
| R4 | T2 | R17 | T6, T7 | R30 | T8 |
| R5 | T1 | R18 | T6, T7 | R31 | T8 |
| R6 | T2, T12 | R19 | T6, T7 | R32 | T13 |
| R7 | T2, T12 | R20 | T7 | R33 | T9, T13 |
| R8 | T3, T10 | R21 | T6 | R34 | T5 |
| R9 | T3 | R22 | T6 | R35 | T5 |
| R10 | T3, T10 | R23 | T6 | R36 | T10 |
| R11 | T5 | R24 | T7 | R37 | T11 |
| R12 | T5 | R25 | T9 | | |
| R13 | T5 | R26 | T9 | | |
