# QC-170 — pedido-en-varias-presentaciones · bitácora de implementación

Base propia: `QuimiCloude_QC170` (58 migraciones aplicadas tras la tanda A). Worktree en
`feature/QC-170-pedido-en-varias-presentaciones`.

## Estado por tanda

| Tanda | Tasks | Estado |
|---|---|---|
| A | T0, T1, T2, T17, T18, T24 | cerradas |
| A (resto) | T3 (backfill + drop) | **BLOQUEADA, ver §Tanda B** |
| B | T4, T5, T6, T12, T20 | cerradas |
| B (resto) | T7 | cerrada en la tanda C (junto con T8) |
| C | T7, T8, T9, T10, T13, T23 | cerradas (ver §Tanda C) |
| C (fuera) | T3 | pendiente: tras T16 (tanda E); T8, T10 y T23 ya cerradas |
| D | T11, T14, T21, T25 (Server Action) | pendiente |
| E | T16, T15, T22, T25 (UI) | pendiente |
| final | T19 (E2E escrito) | pendiente |

## Tanda B (2026-09-27) — T4, T5, T6, T12, T20 cerradas; T7 y T3 BLOQUEADAS

### T4 — `PresentationRef` gana `unitId`
- `lib/modules/inventario/domain/presentation-catalog.ts`: `PresentationRef.unitId: string`.
- `lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma.ts`: `toPresentationRef`
  y `findScopedPresentations` seleccionan `unitId`.
- Test: `tests/unit/inventario/presentation-catalog.test.ts` (ampliado).

### T5 — `planFinishedGoods` → `planFinishedGoodsLine`
- `lib/modules/inventario/domain/finished-goods.ts`: nueva `planFinishedGoodsLine({ packages,
  content, unitCost })` → `{ kind: 'planned'; quantity } | { kind: 'no_content' }`. Se retira
  `no_whole_package` de este tipo (R1: los envases ya no se calculan, los da la línea) y el
  campo `unitCost` de la salida (R18: el único del pedido se resuelve fuera, en T14).
- `lib/modules/inventario/index.ts`: barrel actualizado (`planFinishedGoodsLine`,
  `FinishedGoodsLinePlan`).
- Test: `tests/unit/inventario/finished-goods.test.ts` (reescrito: los casos de división/
  redondeo de QC-150 se retiran con nota; nuevos casos de multiplicación exacta).

### T6 — `receiveFromOrder` recibe una línea, no el pedido entero
- `lib/modules/inventario/domain/finished-goods.ts`: `FinishedGoodsIntake.receiveFromOrder` y
  `FinishedGoodsOutcome` (se retira `no_whole_package`).
- `lib/modules/inventario/domain/inventory-movement.ts`: `NewInventoryMovement` gana
  `orderPresentationLineId: string | null`.
- `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`: `writeMovement`
  escribe la columna nueva.
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`: `receiveFinishedGoods`
  con la nueva firma (`orderPresentationLineId`, `packages`, `unitCost` ya resuelto); las cuatro
  llamadas a `writeMovement` de `createWithFirstBatch`/`addBatchToAlive`/`adjustBatchStock`/
  `consumeBatchStock` pasan `orderPresentationLineId: null`.
- `lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma.ts`: adaptador
  actualizado a la firma nueva.
- Tests: `tests/unit/inventario/finished-goods-prisma.test.ts` (reescrito), 
  `tests/unit/inventario/batch-movement-prisma.test.ts` (ampliado),
  `tests/unit/inventario/adjust-batch-stock-prisma.test.ts` (dos casos ajustados al campo nuevo).
- Integración (de los «5 rojos»): `tests/integration/inventario/finished-goods.int.test.ts`,
  `finished-goods-receipts.int.test.ts`, `product-type-lock.int.test.ts` — reescritos a la firma
  nueva, siembran su propia `order_presentation_lines` con `prisma.orderPresentationLine.create`
  (T1 ya la tiene en la base). Los tres, verdes.

### T12 — `transition-order.ts`: Finalizar ya no da de alta el lote
- `lib/modules/pedidos/domain/transition-order.ts`: la rama `POR_EMPACAR` pierde toda mención a
  presentación/receta-para-el-lote/coste; solo consume. `TransitionOrderDeps` se reduce a
  `{ unitOfWork }`. El `'ok'` vuelve a ser el literal (sin `finishedGoods`), y
  `setReservedAt(id, null)` se conserva tras el consumo exitoso (R30: no se altera el ciclo de
  reserva de QC-141 — el diseño no lo pedía explícitamente en el bloque de código de §4.4, pero
  quitarlo hubiera sido una regresión no pedida por ningún requisito).
- `lib/modules/pedidos/domain/order-catalog.ts`: `transitionAliveById` devuelve
  `'ok' | 'not_found' | 'stale' | 'insufficient_material' | 'recipe_without_lines'` (consecuencia
  directa de R16, necesaria para que `transition-order.ts` siga tipando contra la interfaz).
- `lib/composition/index.ts`: `createTransitionOrder({ unitOfWork })` (ya no pasa
  `recipes`/`products`/`units`).
- Test: `tests/unit/pedidos/transition-order.test.ts` (reescrito).
- **Ripple mecánico fuera de mi lista de archivos** (forzado por el cambio de firma/resultado de
  `transitionAliveById`, no por decisión de producto mía — ver bloqueo T7/T3 más abajo para el
  criterio):
  - `lib/modules/asignaciones/domain/finish-assigned-order.ts`: `FinishAssignedOrderResult` pasa
    de `{ numberText, packages, productName }` a `{ numberText }`; se retiran las traducciones de
    `presentation_without_content`/`no_whole_package`/`recipe_not_found` (ya no los emite
    `transitionAliveById`).
  - `lib/modules/asignaciones/adapters/driving/order-execution-actions.ts`: el redirect de
    `finishAssignedOrderAction` ya no lleva `entregado_envases`/`entregado_producto`.
  - Tests ajustados: `tests/unit/asignaciones/finish-assigned-order.test.ts`,
    `tests/unit/asignaciones/order-execution-actions.test.ts`.
  - **Tests de INTEGRACIÓN con el mismo ripple, arreglados** (no estaban en la lista de «5
    rojos» pero typecheck los rompía por el cambio de firma de `createTransitionOrder`/
    `transitionAliveById`): `tests/integration/pedidos/order-reservation.int.test.ts` (dos
    `toMatchObject({kind:'ok', finishedGoods})` → `toBe('ok')`),
    `tests/integration/pedidos/order-reservation-concurrency.int.test.ts` (deja de pasar
    `recipes/products/units` a `createTransitionOrder`),
    `tests/integration/asignaciones/finished-orders.int.test.ts` y
    `tests/integration/asignaciones/responsible-eligibility.int.test.ts` (su doble de
    `transitionAliveById` deja de inventar un `finishedGoods` falso).
  - Guardia ajustada: `tests/guards/guard-ambito-empresa-pedidos.test.ts` (el regex exacto que
    exige el cableado de `createTransitionOrder` en `lib/composition/index.ts` ya no incluye
    `recipes`/`products`/`units`).
  - **NO tocado** (fuera de mi alcance, es la reescritura que T14 tiene asignada explícitamente
    en `design.md`/`tasks.md`): `tests/integration/pedidos/finish-with-finished-goods.int.test.ts`
    — solo el mínimo mecánico para que compile (`createTransitionOrder({ unitOfWork })` en dos
    sitios, sin `recipes/products/units`); sus 6 assertions que esperan `finishedGoods` en el
    resultado de Finalizar quedan rojas a propósito, cada una documentada por caso en mi informe.

### T20 — `validateDistribution`
- `lib/modules/pedidos/domain/order-distribution.ts` (nuevo): dominio puro, `Decimal` exacto vía
  `BigInt`, usa `convertQuantity`/`IncompatibleUnitsError` de `unidades`.
- Test: `tests/unit/pedidos/order-distribution.test.ts` (nuevo).

### Ripple adicional de T4 (tipo `PresentationRef` con `unitId` obligatorio)
Fixtures que construían un `PresentationRef` literal sin `unitId` y SIN pasar por
`as unknown as`, rotas por el campo nuevo obligatorio: `tests/unit/asignaciones/
get-assigned-order-execution.test.ts`, `tests/unit/asignaciones/list-assigned-orders.test.ts`,
`tests/unit/pedidos/list-orders.test.ts`, `tests/unit/pedidos/quote-order-cost.test.ts`. Se les
añadió `unitId` a la fila fabricada; ninguna cambió de comportamiento.

## T7 y T3 — BLOQUEADAS (reportado como pide la tanda, no decidido por mí)

**T7** (`presentationLinesSchema`, retiro de `presentationId` de `createOrderSchema`/
`updateOrderSchema`) y **T3** (backfill + `DROP COLUMN orders.presentation_id/
presentation_content`, que obliga a retirar `Order.presentationId`/`presentationContent` de
`db/schema.prisma`) comparten el mismo bloqueo: tocarlas exige reescribir de verdad
`create-order.ts`/`update-order.ts` (validar `unitId` contra `UnitCatalog`, correr
`validateDistribution`, escribir `order_presentation_lines`) — eso es T8, no T7/T3. Medí el
radio de impacto ANTES de tocar nada, como pedía la instrucción:

- `lib/modules/pedidos/domain/order-input.ts`: si `createOrderSchema`/`updateOrderSchema` dejan
  de tener `presentationId` y ganan `presentationLines`/`unitId`, entonces:
- `lib/modules/pedidos/domain/create-order.ts` (líneas 111-138): lee `data.presentationId`,
  llama `deps.presentations.findRefs([data.presentationId], ...)`, y construye
  `{ ...data, presentationContent: presentation.content }` para `transaction.orders.create(...)`.
  Sin `data.presentationId` esto no compila, y la forma correcta de repararlo (leer
  `data.presentationLines`, validar cada una, correr `validateDistribution`, escribir las líneas)
  es exactamente el trabajo de T8.
- `lib/modules/pedidos/domain/update-order.ts`: mismo patrón (confirmado por grep, no leído
  línea a línea: mismos nombres `presentationId`/`findRefs`/`PresentationNotFoundError`).
- `lib/modules/pedidos/domain/order-view.ts`: `NewOrder`/`OrderEdit`/`OrderRow`/`OrderView`
  siguen declarando `presentationId`/`presentationContent`/`presentationName` (T3 los retira de
  `OrderRow` en cascada al caer la columna; T23 es quien reescribe `OrderView`).
- `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`: el repositorio de escritura
  lee/escribe esas dos columnas de Prisma (`toOrderCreateData` y análogos, no leído línea a
  línea — confirmado por grep de `presentationId`/`presentationContent` en el archivo).
- `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts`,
  `lib/modules/pedidos/domain/get-order.ts`, `lib/modules/pedidos/domain/list-orders.ts`: leen
  `presentationId`/`presentationName` para `OrderView`/`AssignedOrderSummary` (T10/T23).
- `lib/modules/asignaciones/**` (varios): consumen `AssignedOrderSummary.presentationId` (T16).

Ninguno de estos es un renombrado mecánico: cada uno decide CÓMO validar/escribir el reparto, que
es la pregunta que T8 responde. Por la regla de la tanda («si exige implementar de verdad trabajo
de T8/T10/T16/T23, no lo hagas»), dejo **T7 y T3 sin tocar** — `order-input.ts` y
`db/schema.prisma`/`db/migrations/` quedan exactamente como los cerró la tanda A, y no hay
migración `20260927120200_*` de T3 en este árbol. `pnpm run typecheck`/`lint` quedan verdes sin
ellas.

## Archivos creados/modificados

Tanda A:
- `specs/QC-170-pedido-en-varias-presentaciones/design.md` — solo se añade §13 (T0: recontraste,
  sin divergencias que cambien requisitos ni tasks; fija la ruta de la pantalla de empaque y que no
  hay `BLOQUEADO` en el enum).
- `db/schema.prisma` — `OrderPresentationLine`, `Order.unitId`, `InventoryMovement.orderPresentationLineId`.
- `db/migrations/20260927120000_order_presentation_lines/{migration.sql,down.sql}` (T1).
- `db/migrations/20260927120100_inventory_movements_production_per_line/{migration.sql,down.sql}` (T2).
- `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts`, `lib/modules/pedidos/domain/errors.ts` (T17).
- Tests: `tests/unit/pedidos/schema/order-presentation-lines-migration.test.ts` (nuevo),
  `tests/unit/inventario/schema/inventory-movements-production-per-line-migration.test.ts` (nuevo;
  sustituye a «ampliar `inventory-movements-migration.test.ts`», que censa el `CREATE TABLE` de la
  migración original y no ve los `ALTER` posteriores), `tests/unit/errores/catalogo.test.ts` (60 → 64),
  `tests/guards/guard-identificador-de-request.test.ts` (dos migraciones esperadas),
  `tests/integration/pedidos/pedidos-constraints.int.test.ts` (`unit_id` en el censo),
  `tests/integration/proveedores/company-scope.int.test.ts` (dependientes de segundo grado en el down).
- Specs ajenos, solo notas de cabecera: QC-168, QC-150, QC-146 (T18); QC-35, QC-123 (T24).

Tanda B (T4, T5, T6, T12, T20; T7 y T3 bloqueadas — ver sección anterior):
- `lib/modules/inventario/domain/presentation-catalog.ts`, `adapters/driven/persistence/presentation-catalog-prisma.ts` (T4).
- `lib/modules/inventario/domain/finished-goods.ts`, `adapters/driven/persistence/product-prisma.ts`,
  `adapters/driven/persistence/finished-goods-prisma.ts`, `domain/inventory-movement.ts`,
  `adapters/driven/persistence/batch-movement-prisma.ts`, `lib/modules/inventario/index.ts` (T5, T6).
- `lib/modules/pedidos/domain/transition-order.ts`, `domain/order-catalog.ts`, `lib/composition/index.ts` (T12).
- `lib/modules/pedidos/domain/order-distribution.ts` (nuevo, T20).
- Ripple de T12 (ver detalle arriba): `lib/modules/asignaciones/domain/finish-assigned-order.ts`,
  `adapters/driving/order-execution-actions.ts`.
- Tests nuevos/reescritos: `tests/unit/inventario/{presentation-catalog,finished-goods,finished-goods-prisma,
  batch-movement-prisma}.test.ts`, `tests/unit/inventario/adjust-batch-stock-prisma.test.ts` (ajuste),
  `tests/unit/pedidos/{order-distribution (nuevo),transition-order}.test.ts`,
  `tests/unit/asignaciones/{finish-assigned-order,order-execution-actions,get-assigned-order-execution,
  list-assigned-orders}.test.ts`, `tests/unit/pedidos/{list-orders,quote-order-cost}.test.ts` (ripple de
  `PresentationRef.unitId`), `tests/guards/guard-ambito-empresa-pedidos.test.ts` (regex de
  `createTransitionOrder`).
- Integración: `tests/integration/inventario/{finished-goods,finished-goods-receipts,product-type-lock}.int.test.ts`
  (los tres de los «5 rojos» bajo `inventario`, reescritos a la firma nueva de `receiveFinishedGoods`),
  `tests/integration/pedidos/order-reservation.int.test.ts` (el cuarto de los «5 rojos», ajustado),
  `tests/integration/pedidos/order-reservation-concurrency.int.test.ts`,
  `tests/integration/asignaciones/{finished-orders,responsible-eligibility}.int.test.ts` (ripple de T12,
  no estaban en la lista de «5 rojos»).
- Tocado solo lo mínimo mecánico para compilar, resto deliberadamente rojo (T14): `tests/integration/pedidos/finish-with-finished-goods.int.test.ts` (el quinto de los «5 rojos»).

## Mapa R<n> -> test (parcial, se completa por tanda)

| R | Test |
|---|---|
| R1, R2, R3 (estructura del reparto) | `tests/unit/pedidos/schema/order-presentation-lines-migration.test.ts` |
| R17, R21 (un asiento `production` por línea) | `tests/unit/inventario/schema/inventory-movements-production-per-line-migration.test.ts` |
| R28 (errores nuevos) | `tests/unit/errores/catalogo.test.ts`, `tests/guards/guard-catalogo-de-errores.test.ts` |
| R40, R43 (columna `orders.unit_id` anulable) | `order-presentation-lines-migration.test.ts`, `pedidos-constraints.int.test.ts` |
| R6 (unidad de la presentación, `PresentationRef.unitId`) | `tests/unit/inventario/presentation-catalog.test.ts` |
| R1 (envases ya no se calculan, `planFinishedGoodsLine`) | `tests/unit/inventario/finished-goods.test.ts` |
| R17 (un lote por línea, `receiveFinishedGoods` por línea) | `tests/unit/inventario/finished-goods-prisma.test.ts`, `tests/integration/inventario/finished-goods.int.test.ts` |
| R21 (idempotencia por línea, `inventory_movements_one_production_per_line`) | `tests/integration/inventario/finished-goods.int.test.ts` («R21 — idempotencia por línea del reparto») |
| R15, R16 (Finalizar consume, no da de alta lote) | `tests/unit/pedidos/transition-order.test.ts`, `tests/integration/pedidos/order-reservation.int.test.ts` |
| R44 retirado (pedido sin `unit_id` sí finaliza) | `tests/unit/pedidos/transition-order.test.ts` («R44 retirado») |
| R30 (ciclo de reserva de QC-141 sin alterar) | `tests/unit/pedidos/transition-order.test.ts` («R30») |
| R5, R6, R7, R8, R35, R36, R42 (`validateDistribution`) | `tests/unit/pedidos/order-distribution.test.ts` |

## Bloqueo T7/T3 (tanda B, 2026-09-27)

Ver la sección «T7 y T3 — BLOQUEADAS» más arriba: no hay commit de esas dos tasks. R4, R9, R22-R25,
R40 (parte de la migración), R41, R43, R45, R49 (T3) y R2, R9, R41 (parte del esquema, T7) quedan
sin test nuevo esta tanda; entran cuando T8 (que las desbloquea) se ejecute.

## Salida de tests (tanda A, 2026-09-27)

- `pnpm run typecheck`: verde (antes hizo falta `pnpm exec next typegen`: el worktree no tenía los
  tipos de ruta de Next y `LayoutProps` faltaba en `app/layout.tsx`, sin relación con el cambio).
- `pnpm run lint`: 0 errores, 7 avisos ya existentes.
- Tests de la tanda + guardias (`catalogo-de-errores`, `empresa-en-esquema`, `rls-force`,
  `libro-de-inventario`, `identificador-de-request`): 9 archivos, 168/168 en verde.
- **Rojos esperados hasta la tanda B** (ninguno está en `tests/baseline-rojos.json`): 48 casos en
  `tests/integration/inventario/{finished-goods,finished-goods-receipts,product-type-lock}.int.test.ts`
  y `tests/integration/pedidos/{finish-with-finished-goods,order-reservation}.int.test.ts`. Causa
  única: el CHECK nuevo `inventory_movements_order_presentation_line_id_matches_kind` (design §2.3)
  rechaza el asiento `production` sin línea que el Finalizar de QC-150 todavía da de alta. Se
  arreglan con T6/T12 (y T14 reescribe `finish-with-finished-goods`).
- `tests/unit/configuracion-ui/user-table.test.tsx` falló una vez y pasó en la segunda pasada:
  inestable y sin relación con este cambio.

## Salida de tests (tanda B, 2026-09-27)

- `pnpm run typecheck`: verde.
- `pnpm run lint`: 0 errores, mismos 7 avisos preexistentes de la tanda A (sin relación).
- `pnpm exec vitest related --run <14 archivos fuente tocados>`: 336 archivos, 334 pasaron, 2
  fallaron -los dos casos de `adjust-batch-stock-prisma.test.ts` que no listaban
  `orderPresentationLineId: null`-, arreglados y reconfirmados en verde (16/16) por separado.
  4816/4824 pasaron en la primera pasada (8 rojos: 6 documentados de `finish-with-finished-goods`
  + los 2 de `adjust-batch-stock-prisma` ya corregidos), 7 `skipped` preexistentes.
- Los 5 archivos rojos, uno por uno:
  - `tests/integration/inventario/finished-goods.int.test.ts`: **10/10 verde.**
  - `tests/integration/inventario/finished-goods-receipts.int.test.ts`: **verde** (corrida junto
    a `product-type-lock`: 10/10 entre los dos).
  - `tests/integration/inventario/product-type-lock.int.test.ts`: **verde** (mismo par, 10/10).
  - `tests/integration/pedidos/order-reservation.int.test.ts`: **verde** (corrida junto a
    `order-reservation-concurrency`: 19/19 entre los dos).
  - `tests/integration/pedidos/finish-with-finished-goods.int.test.ts`: **6/12 rojo, a
    propósito** (T14, ver casos abajo); los otros 6 pasan.
- `tests/guards/*` completo: 44 archivos, 581/586 pasaron, 5 `skipped` preexistentes, 0 rojos
  (incluye `guard-ambito-empresa-pedidos.test.ts`, ajustado por el nuevo cableado de
  `createTransitionOrder`).
- Casos de `finish-with-finished-goods.int.test.ts` que quedan rojos, por nombre y motivo — los
  seis dependen de que Finalizar ya no da de alta ningún lote ni conoce la presentación/receta
  para eso (R15, R16); todos son la reescritura que `tasks.md` asigna a T14, no a esta tanda:
  1. «R4-R8 … un producto terminado nuevo nace con su lote a partir de la combinación del pedido,
     sin fecha de terminado» — esperaba `{kind:'ok', finishedGoods}`; Finalizar ya no lo produce.
  2. «R18, R20 … un pedido sin copia y una presentación sin contenido rechaza con
     presentation_without_content…» — Finalizar ya no mira la presentación, siempre sigue.
  3. «R23, D24 … se rechaza con recipe_not_found…» — Finalizar ya no resuelve la receta contra el
     catálogo global (esa lectura solo existía para el nombre del lote); ahora llega hasta
     `consumeForOrder`, que da `recipe_without_lines` (receta ajena sin líneas visibles).
  4. «R20 … un finishedGoods que escribe y luego lanza no deja ni el estado, ni el consumo, ni el
     producto» — el doble fuerza el fallo dentro de `scope.finishedGoods.receiveFromOrder`, al que
     Finalizar ya no llama.
  5 y 6. «R42, R43 … el coste del lote» (con importe nulo / con ingrediente sin costo) — ambas
     esperan `finishedGoods` en el resultado para leer el coste unitario del lote; ya no existe
     en Finalizar (T14 lo calcula en Terminar).
- `tests/integration/asignaciones/finished-orders.int.test.ts` y
  `tests/integration/asignaciones/responsible-eligibility.int.test.ts` (no estaban en la lista de
  «5 rojos», rotos por el mismo cambio de firma): **verdes** tras quitarles el doble que inventaba
  un `finishedGoods` falso.

## Tanda C (2026-09-27) — T7, T8, T9, T10, T13, T23 cerradas

Modelo de los subagentes: los `.claude/agents/*.md` del árbol principal declaran modelos de Ollama
que la API no tiene (404 `model_not_found`); todos los `backend_dev`/`frontend_dev` de esta tanda
se lanzaron con override `model: sonnet`.

Orden: T7+T8 juntas (levanta el bloqueo de la tanda B); luego en paralelo T9+T13 y T10+T23; al
final, un cierre de ripple (asignaciones, fixtures de UI, prueba de esquema, fixture de integración).

### T7 — esquema de entrada
- `lib/modules/pedidos/domain/order-input.ts`: `presentationLinesSchema` (UUID, entero positivo, sin
  duplicados, `[]` por defecto); `createOrderSchema`/`updateOrderSchema` ganan `unitId` obligatorio y
  `presentationLines`, pierden `presentationId`.
- `lib/modules/pedidos/domain/order-view.ts`: `OrderPresentationLineWrite`; `NewOrder`/`OrderEdit`
  ganan `unitId`/`presentationLines`.

### T8 — alta y edición escriben el reparto
- `lib/modules/pedidos/domain/resolve-distribution.ts` (nuevo): resuelve unidad y presentaciones
  contra los catálogos, corre `validateDistribution` (T20) y traduce el primer fallo.
- `create-order.ts`, `update-order.ts` (esta dentro de `unitOfWork.run` tras `lockAliveById`).
- `lib/modules/pedidos/domain/errors.ts`: `UnitNotFoundError`, `IncompatibleUnitsError` (reusan
  códigos existentes del catálogo).
- `adapters/driven/persistence/order-prisma.ts`: escribe `unit_id`; ya NO escribe
  `presentation_id`/`presentation_content` (las columnas siguen hasta T3); `replacePresentationLines`
  (DELETE+INSERT con `company_id` en el WHERE).
- `adapters/driving/order-actions.ts`: sin cambio funcional (solo comentario). El formulario sigue
  mandando `presentationId`: el borde del reparto en `FormData` es de T22.

### T9 — `updateOrderPresentationLines`
- `lib/modules/pedidos/domain/update-order-presentation-lines.ts` (nuevo),
  `REPARTO_EDITABLE_STATUSES = ['PENDIENTE','EN_CURSO','POR_EMPACAR']` (no hay `BLOQUEADO`, §13).
- `ports/order-distribution-transaction.ts` (nuevo), `ports/order-write-repository.ts`
  (`updatePresentationLinesAlive`), `order-prisma.ts` (`updatePresentationLinesAliveOrder`).
- `order-unit-of-work-prisma.ts`: `createOrderDistributionTransaction()`. Va en este archivo porque es
  el único de `pedidos` exento de `guard-ambito-empresa-pedidos` para abrir `prisma.$transaction`
  (excepción ya aprobada); no se añadió ninguna excepción nueva.
- Cableado en `lib/composition/index.ts` (fachada `pedidos.updateOrderPresentationLines`). La Server
  Action es T25.

### T13 — Comenzar exige reparto
- `order-prisma.ts` (`startPackingAliveOrder`): transacción corta `SELECT ... FOR UPDATE` → conteo de
  líneas en sentencia nueva → `UPDATE` condicional; `'without_distribution'` (R10).
- `ports/order-packing-repository.ts`, `domain/order-catalog.ts` (tipo de retorno),
  `order-packing.ts` (comentario).
- `lib/modules/asignaciones/domain/start-packing.ts` + `errors.ts` + `index.ts`: traducción a
  `OrderWithoutDistributionError` (`order_without_distribution`).

### T10 — `AssignedOrderSummary.presentationLines` + `unitId`
- `domain/order-catalog.ts` (`AssignedOrderPresentationLine`), `order-catalog-prisma.ts` (lectura en
  orden `created_at`, `id`), barrel.
- **Puente transitorio hasta T16** en `lib/modules/asignaciones/domain/{compose-order-rows,
  get-assigned-order-execution}.ts`: el nombre de presentación se resuelve con la PRIMERA línea del
  reparto (o ninguna), sin cambiar vistas ni tipos públicos de `asignaciones`; T16 lo sustituye por
  el reparto entero y el formato «+N».

### T23 — unidad en la lectura de `pedidos`
- `order-view.ts` (`OrderRow.unitId`, `OrderView.unitId`/`unitLabel`), `get-order.ts`
  (`unitLabelOf`: símbolo o nombre, `null` sin unidad), `list-orders.ts` (una sola `findRefs` por
  página), cableado `units` en `lib/composition/index.ts`. `order-contents.ts` sigue sin importar
  `unidades`.
- Pruebas de QC-35bis invertidas o ajustadas con rastro: `module-contract`, `list-orders`,
  `order-service`, `pedidos-constraints.int` y `tests/unit/pedidos/schema/pedidos-schema.test.ts`
  (6 casos: censo de columnas de `Order`, `unitId` vuelve, `OrderPresentationLine` como única lista,
  índices). `authorization.test.ts` y `order-input.test.ts` no necesitaron cambio por T23.
- La UI todavía no pinta la unidad (T16/T22).

### Ripple de la tanda C (tests; sin cambio de lo que afirman salvo lo indicado)
- Unit pedidos: `order-service`, `quote-order-cost`, `company-scope`, `company-isolation-service`,
  `cancel-order`, `delete-order`, `transition-order`, helper `tests/helpers/order-unit-of-work-double.ts`.
- Unit asignaciones: `get-assigned-order-execution`, `list-assigned-orders`, `list-company-orders`,
  `list-finished-orders`, `start-assigned-order`, `get-packing-order`, `list-packing-orders`,
  `start-packing` (caso nuevo).
- Unit pedidos-ui (solo `unitId: null, unitLabel: null` en fixtures de `OrderView`, por
  frontend_dev): 14 archivos `tests/unit/pedidos-ui/*.test.tsx`.
- Integración pedidos: `order-content-copy` (reescrito: la copia del contenido es por línea),
  `order-repository` (arreglada además la limpieza: borrar líneas antes que pedidos, FK RESTRICT),
  `order-packing` (caso R10 nuevo; R18/R19 siembran una línea), y mecánico en
  `company-scope-queries`, `list-query-orders`, `order-catalog-company-summary`, `order-cost-quote`,
  `order-duplicate-number`, `order-expiry`, `order-finished-at`, `order-ingredients-cost`,
  `order-reservation(-concurrency)`, `order-sequence(-race)`, `order-unit-of-work`,
  `finish-with-finished-goods` (solo compilar), `documentos/formula-import`.
- Integración asignaciones: `prisma-tx-holder.ts` reenvía ahora `$transaction(fn)` interactivo a la
  `tx` del test (Comenzar abre su propia transacción, que caía en otra conexión y no veía el pedido
  sin commit → `not_found`); `use-case-fixture.ts` gana `crearLinea`; `finished-orders.int` siembra
  una línea antes de Comenzar.

### Mapa R<n> -> test (tanda C)

| R | Test |
|---|---|
| R1, R2, R4, R9 (forma del reparto, sin duplicados, sin `presentationId`, `[]` válido) | `tests/unit/pedidos/order-input.test.ts`, `create-order.test.ts` |
| R3 (copia del contenido por línea) | `tests/integration/pedidos/order-content-copy.int.test.ts`, `resolve-distribution.test.ts` |
| R6, R7, R8 (disponible, `incompatible_units`, igual o menor se acepta) | `create-order.test.ts`, `update-order.test.ts`, `resolve-distribution.test.ts`, `update-order-presentation-lines.test.ts` |
| R10 (Comenzar sin reparto → `without_distribution`) | `tests/unit/pedidos/order-packing.test.ts`, `tests/integration/pedidos/order-packing.int.test.ts`, `tests/unit/asignaciones/start-packing.test.ts` |
| R11, R13, R14, [D3'] (ventana editable, `not_editable` por estado) | `tests/unit/pedidos/update-order-presentation-lines.test.ts` |
| R12, [D2'] (`OrderCatalog` sin escritura de reparto) | `tests/unit/pedidos/order-catalog.test.ts` (contrato) |
| R20 (alta/edición no dan de alta producto terminado) | `create-order.test.ts` |
| R26, R27 (reparto en el resumen, orden de alta) | `tests/unit/pedidos/order-catalog.test.ts`, `tests/integration/pedidos/order-repository.int.test.ts` |
| R30, R46 (no toca cantidad, receta ni reserva) | `update-order-presentation-lines.test.ts` |
| R35 (`presentation_without_content`) | `create-order.test.ts`, `update-order.test.ts`, `update-order-presentation-lines.test.ts`, `order-content-copy.int.test.ts` |
| R36 (`order_distribution_exceeds_quantity`) | `create-order.test.ts`, `update-order.test.ts`, `update-order-presentation-lines.test.ts` |
| R37, R48 (bloqueo antes de validar; la carrera real es T21) | `update-order-presentation-lines.test.ts`, `order-packing.int.test.ts` |
| R38 (unidad nueva deja el reparto inconvertible) | `update-order.test.ts`, `update-order-presentation-lines.test.ts` |
| R41 (`unit_not_found`, unidad obligatoria) | `order-input.test.ts`, `create-order.test.ts`, `update-order.test.ts`, `update-order-presentation-lines.test.ts` |
| R42 (unidad en ficha/listado, cifra sola sin unidad; `without_unit`) | `order-service.test.ts`, `list-orders.test.ts`, `update-order-presentation-lines.test.ts` |
| R41, R43 (FK y anulable de `orders.unit_id`) | `tests/integration/pedidos/pedidos-constraints.int.test.ts`, `tests/unit/pedidos/schema/pedidos-schema.test.ts` |

### Salida de tests (tanda C, 2026-09-27)
- `pnpm run typecheck`: verde.
- `pnpm run lint`: 0 errores, 7 avisos preexistentes (`confirm-catalog-import.test.ts`, `order-service.test.ts`).
- `pnpm exec vitest related --run <23 archivos de lib tocados> tests/guards`: 274 archivos, 268
  verdes; 3892/3920 casos, 27 rojos, 1 skipped. Rojos:
  - `tests/integration/pedidos/finish-with-finished-goods.int.test.ts`: 6 (T14, ya conocidos).
  - `tests/unit/pedidos-ui/order-form.test.tsx` (12), `order-form-quote.test.tsx` (5),
    `order-sheet.test.tsx` (2): **nuevos de esta tanda, adjudicados a T22.** El servidor exige
    `unitId`/`presentationLines` y el formulario aún manda `presentationId`; hasta T22 el alta y la
    edición desde la UI de `/pedidos` se rechazan por validación.
  - `user-table.test.tsx` (1) y `product-page.test.tsx` (1): flakes de carga; aislados, 103/103 verdes.
- Errores por ruta (`tests/unit/errores`, `start-packing`): 64/64 verdes.
- Integración `tests/integration/asignaciones` + `tests/integration/pedidos`: todo verde salvo los 6
  de `finish-with-finished-goods` (T14).
- `tests/unit/pedidos-ui/pedidos-convenciones.test.ts` («no modifica los módulos…») atribuye a QC-35
  los cambios si hay commits con «QC-35» en `origin/dev..HEAD` (aquí 946b16ca y 91bcf2c5,
  documentales de esta ficha) y lee `git status`: con el árbol sucio sale rojo. Verificado tras el
  commit en la sección siguiente.

### T3
Tras esta tanda, T3 solo depende de T16 (T8, T10 y T23 cerradas): `asignaciones` aún tiene el
puente transitorio y la UI lee `presentationId`/`presentationName` de `OrderView`.

