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
| C (fuera) | T3 | cerrada en la tanda E (quedó libre tras T16) |
| D | T11, T14, T21, T25 (Server Action) | cerradas (T25 solo servidor; su UI va en E) |
| E | T16, T15, T22, T25 (UI), T3 | cerradas (ver §Tanda E) |
| final | ajuste T3 + T19 | cerradas (ver §Cierre: ajuste T3 + T19) |

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
  documentales de esta ficha) y lee `git status`: con el árbol sucio sale rojo. Tras el commit
  32de4aa3 (árbol limpio salvo `progress/current.md`): 23/23 verde.
- Guardias completas (`tests/guards`) + `module-contract` de pedidos y asignaciones tras la limpieza de
  citas en comentarios: 46 archivos, 616 verdes, 5 skipped preexistentes.

### T3
Tras esta tanda, T3 solo depende de T16 (T8, T10 y T23 cerradas): `asignaciones` aún tiene el
puente transitorio y la UI lee `presentationId`/`presentationName` de `OrderView`.

## Tanda D (2026-09-27) — T11 y T25 (SOLO servidor) cerradas

En paralelo, otro subagente trabajaba T14 (`order-packing.ts`, `finish-with-finished-goods.int.test.ts`);
no se tocó ninguno de sus archivos (`order-packing.ts`, `order-packing-repository.ts`,
`order-catalog.ts`, `order-prisma.ts`, `finish-packing.ts` de `asignaciones`).

### T11 — «Cuánto queda disponible»
- `lib/modules/pedidos/domain/order-presentation-availability.ts` (nuevo):
  `createQuoteOrderPresentationAvailability`. Mismo patrón de resolución que
  `update-order-presentation-lines.ts` (una llamada a `units.findRefs` para la unidad del
  pedido, otra con los ids únicos que faltan de las presentaciones) y REUTILIZA
  `validateDistribution` (T20) para el cálculo — no repite ninguna aritmética. Devuelve
  `DistributionResult` más dos fallos propios de la RESOLUCIÓN (`unit_not_found`,
  `presentation_not_found`) que `validateDistribution` no puede dar porque recibe
  `UnitConversion` ya resueltas, no ids. `requirePermission(actor, 'pedidos.modificar')` es la
  primera línea (mismo criterio que `quoteOrderCost`); nunca lanza por el reparto en sí —es de
  solo lectura, R39: `exceeds_quantity` con `available` negativo vuelve como dato, no como
  excepción.
- `lib/modules/pedidos/domain/order-input.ts`: `orderPresentationAvailabilitySchema` (`pick` de
  `quantity`/`unitId`/`presentationLines` de `createOrderSchema`, mismos tres datos que hacen
  falta ANTES de guardar).
- `lib/modules/pedidos/index.ts`: exporta el esquema, el tipo de entrada, la factoría y sus dos
  tipos (`OrderPresentationAvailability`, `OrderPresentationAvailabilityDeps`).
- `lib/composition/index.ts`: `pedidos.quoteOrderPresentationAvailability`, cableada con los
  mismos dos catálogos que `updateOrderPresentationLines` (sin transacción: no escribe nada).
- `lib/modules/pedidos/adapters/driving/order-actions.ts`: Server Action
  `quoteOrderPresentationAvailabilityAction(input: unknown)`, mismo patrón que
  `quoteOrderCostAction` — devuelve `{ status: 'success', data }` siempre que el actor y la
  entrada sean válidos, pasando el resultado del dominio tal cual (el formulario de T22 decide
  qué pintar según `data.kind`).
- Test: `tests/unit/pedidos/order-presentation-availability.test.ts` (nuevo), 13 casos: R12
  (sin actor / sin el permiso), R55 (cantidad inválida), unidades iguales, convertibles
  (L↔ml), incompatibles (R7), igual al total (R8), excede (R36/R39), y la resolución de
  catálogos (`unit_not_found`, `presentation_not_found`, `presentation_without_content`/R35,
  reparto vacío, una sola llamada por unidad única).

### T25 — Edición acotada «Reparto y unidad» (SOLO la Server Action; formulario y acción de
fila de la tabla son T22/tanda E)
- `lib/modules/pedidos/domain/order-input.ts`: `updateOrderDistributionSchema` — `z.object({
  unitId, presentationLines }).strict()`. A diferencia de `createOrderSchema`/
  `updateOrderSchema` (que descartan en silencio cualquier clave de más porque cubren el
  pedido ENTERO), este esquema RECHAZA la entrada entera si trae cualquier otro campo
  (cantidad, receta, responsables…), R46.
- `lib/modules/pedidos/index.ts`: exporta el esquema nuevo y su tipo.
- `lib/modules/pedidos/adapters/driving/order-actions.ts`: Server Action
  `updateOrderDistributionAction(id: string, input: unknown)`. Es la ÚNICA de las diez
  Server Actions del archivo que llama `requirePermission` directamente: su caso de uso
  (`updateOrderPresentationLines`, T9) NO comprueba el permiso —lo decidió T9, ver
  `design.md > 4.2`: «la autorización la comprueba QUIEN LLAMA, no este caso de uso», porque
  solo hay un llamador—, así que la frontera de R12 tiene que ponerla esta action. Por el mismo
  motivo es la única que valida con un esquema del dominio ANTES de llamar a la fachada (T9
  recibe `{ unitId, lines }` ya tipado, no `unknown`). Traduce los NUEVE resultados discriminados
  de T9 a las clases de error del catálogo con un `switch`, mismo patrón que
  `resolve-distribution.ts`: `not_found→OrderNotFoundError`,
  `not_editable→OrderPresentationLineNotEditableError` (R13),
  `unit_not_found→UnitNotFoundError` (R41), `without_unit→OrderWithoutUnitError` (R42),
  `presentation_not_found→PresentationNotFoundError`,
  `presentation_without_content→PresentationWithoutContentError` (R35),
  `incompatible_units→IncompatibleUnitsError` (R7),
  `exceeds_quantity→OrderDistributionExceedsQuantityError` (R36). Sin `revalidatePath`: la
  pantalla que lo pinta es de T22 (tanda E), y adivinar su ruta sería inventarla.
- `lib/composition/index.ts`: sin cambio nuevo para T25 —`pedidos.updateOrderPresentationLines`
  ya estaba cableada desde T9 (tanda C); T25 solo la LLAMA desde la action.
- Tests: `tests/unit/pedidos/order-actions-distribution.test.ts` (nuevo, 17 casos: 4 de T11 y 13
  de T25 —R12 sin permiso, R46 esquema `.strict()` rechaza `quantity` de más, la llamada a la
  fachada con los tres argumentos correctos, las ocho traducciones de resultado con `it.each`,
  reparto vacío válido (R9), error ajeno sin detalle—); `tests/unit/pedidos/order-actions.test.ts`
  (ajustado): las diez Server Actions y su aridad exacta, los DIEZ `catch`/`toErrorState` (antes
  ocho), y las DOS excepciones documentadas y ACOTADAS con `replaceAll`/conteo exacto —en vez de
  aflojar la regla en bloque— a la comprobación «la action no repite `requirePermission`» y «la
  action no valida con un esquema del dominio»: ambas siguen protegiendo a las OTRAS nueve
  Server Actions, con el nombre exacto de la única que se sale del patrón.

### Mapa R<n> -> test (tanda D)

| R | Test |
|---|---|
| R6, R7 (disponible convertido, marca la línea incompatible) | `tests/unit/pedidos/order-presentation-availability.test.ts` |
| R39 (aviso de solo lectura, no rechaza) | `order-presentation-availability.test.ts`, `order-actions-distribution.test.ts` |
| R7, R13, R35, R36, R41, R42 (traducción de T25) | `tests/unit/pedidos/order-actions-distribution.test.ts` (`it.each` de las ocho traducciones) |
| R12 (`unauthorized` sin escribir nada) | `order-actions-distribution.test.ts` |
| R46 (esquema `.strict()`, solo `unitId`+`presentationLines`) | `order-actions-distribution.test.ts` |

### Salida de tests (tanda D, 2026-09-27)
- `pnpm run typecheck`: **verde para mis archivos.** Al cerrar la tanda, `tsc --noEmit` mostraba
  errores en `tests/integration/pedidos/order-packing.int.test.ts` y
  `tests/unit/pedidos/order-packing.test.ts` (`finishPackingAlive`/`FinishPackingDeps` sin las
  propiedades nuevas) — **no son míos**: son el ripple a medio terminar de T14 (otro subagente,
  en paralelo, sobre `order-packing.ts`/`order-packing-repository.ts`), confirmado por `git
  status` (esos archivos no están en mi lista de tocados) y por que mi build estaba verde ANTES
  de que ese trabajo empezara a aparecer en el árbol compartido.
- `pnpm run lint` (acotado a mis archivos): 0 errores, 0 avisos nuevos.
- `pnpm exec vitest run` de mis archivos: `order-presentation-availability.test.ts` (13/13),
  `order-actions-distribution.test.ts` (17/17), `order-actions.test.ts` (16/16),
  `update-order-presentation-lines.test.ts` (14/14, sin cambio, confirma que no rompí T9),
  `order-distribution.test.ts` (10/10, sin cambio, confirma que no rompí T20),
  `order-input.test.ts` y `tests/unit/errores` (verdes). `tests/guards` completo: 44 archivos,
  584/589, 5 `skipped` preexistentes, 0 rojos.

## Tanda D — T14 (2026-09-27) cerrada

`finishPackingAliveById` (Terminar) da de alta un lote de producto terminado por línea del
reparto, en la MISMA transacción que el cambio de estado (R17-R21). El ripple que el subagente
de T11/T25 vio a medio terminar en su tanda es este trabajo, ya completo.

- `lib/modules/pedidos/ports/order-write-repository.ts`: `FinishPackingOrderRow`,
  `FinishPackingUpdateOutcome`, `FinishPackingLine` (nuevos); dos métodos nuevos en
  `OrderWriteRepository`: `finishPackingAlive` (el `UPDATE` condicional de Terminar, DENTRO de
  la transacción compartida) y `findPresentationLinesForFinish` (`FOR SHARE`, orden de alta).
- `lib/modules/pedidos/ports/order-packing-repository.ts`: pierde `finishPackingAlive` — Terminar
  ya no es un `UPDATE` suelto fuera de la unidad de trabajo, `startPackingAlive` (Comenzar) es
  el único método que queda.
- `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`: `finishPackingAliveOrder`
  (privada, ya no exportada) reescrita sobre `tx` -no el cliente global-, devuelve
  `FinishPackingUpdateOutcome` con `recipeId`/`quantity`/`ingredientsCost` cuando el `UPDATE` sí
  mueve la fila; `findAlivePackingStatus` acepta `tx` (antes solo hablaba con el cliente global);
  `findPresentationLinesForFinishOrder` (nueva, `FOR SHARE`); las dos se cablean en
  `createOrderWriteRepository`.
- `lib/modules/pedidos/domain/order-packing.ts`: `OrderPackingDeps` se separa en
  `StartPackingDeps` (solo `packing`) y `FinishPackingDeps` (`packing`, `unitOfWork`, `recipes`,
  `products`, `units`, `presentations`). `createFinishPacking` abre `unitOfWork.run`, mueve el
  estado, lee las líneas; con `[]` responde `{kind:'ok', finishedGoods:[]}` sin tocar ningún
  catálogo; si no, resuelve la receta (global, `recipe_not_found` si no existe), el coste del
  lote (`ingredientsCost` guardado o `resolveLotIngredientsCost`), el contenido de cada línea
  (copiado, o -defensa en profundidad de R19- el vigente de la presentación vía
  `presentations.findRefs`; si ninguno existe, `PresentationWithoutContentError` con el id de la
  línea, ANTES de llamar a `receiveFromOrder` de cualquier línea) y el `unitCost` único
  (`deriveUnitCost(lotCost, sumaDeCantidades)`, R18); llama a `receiveFromOrder` una vez por
  línea con ese `unitCost` fijo; cualquier `presentation_without_content` de esa llamada también
  aborta todo.
- `lib/modules/pedidos/domain/order-catalog.ts`: `finishPackingAliveById` devuelve
  `{kind:'ok', finishedGoods: readonly FinishedGoodsReceipt[]} | 'not_packer' | 'not_packable' |
  'not_found' | 'recipe_not_found' | 'presentation_without_content'`.
- `lib/modules/inventario/index.ts`: exporta `deriveUnitCost` (ya existía en
  `domain/unit-cost.ts`; R18 lo necesita desde `pedidos`, y el contrato del módulo no lo daba
  todavía — no se reinventa la división).
- `lib/composition/index.ts`: `orderPackingRepository` pierde `finishPackingAlive`;
  `finishPackingAliveById: createFinishPacking({packing, unitOfWork: orderUnitOfWork, recipes:
  recipeCatalog, products: productCatalog, units: unitCatalog, presentations:
  presentationCatalog})`.
- Traducción hasta el borde de `asignaciones` (pedido explícito de la tanda, el tipo cambió):
  `lib/modules/asignaciones/domain/finish-packing.ts` distingue `typeof result === 'object'`
  (éxito, solo devuelve `numberText`: la pantalla de asignaciones no pinta el lote todavía, T22
  la reutiliza si algún día hace falta) de los cinco códigos de cadena, con
  `RecipeNotFoundError`/`PresentationWithoutContentError` (ya existían en
  `asignaciones/domain/errors.ts` desde QC-150, sin llamante desde el ripple de T12 — vuelven a
  tener uno). Su Server Action (`order-packing-actions.ts`) no cambia: solo lee `numberText`.
- `tests/helpers/order-unit-of-work-double.ts`: `fakeOrderWriteRepository` gana los dos métodos
  nuevos en su lista de `explota(...)`.
- Tests nuevos/reescritos: `tests/unit/pedidos/order-packing.test.ts` (15 casos: Comenzar sin
  cambio + Terminar con doble de `OrderUnitOfWork`/catálogos globales — not_packer/not_packable/
  not_found, `[]` sin tocar catálogos, un lote por línea, el mismo `unitCost` en las dos líneas,
  recálculo sin importe guardado, `presentation_without_content` con y sin rescate vigente,
  ninguna línea nace si `receiveFromOrder` rechaza, `recipe_not_found`);
  `tests/unit/asignaciones/finish-packing.test.ts` (dos casos nuevos, `recipe_not_found`/
  `presentation_without_content`; el resto adaptado a `{kind:'ok', finishedGoods:[]}`);
  `tests/unit/asignaciones/authorization.test.ts` (ajuste mecánico del mismo doble).
- Integración: `tests/integration/pedidos/order-packing.int.test.ts` (cableado real con
  `unitOfWork`+catálogos; los dos casos `'ok'` de Terminar sin reparto ahora esperan
  `{kind:'ok', finishedGoods:[]}`, el resto sin cambio); **REESCRITO por completo**
  `tests/integration/pedidos/finish-with-finished-goods.int.test.ts` (13 casos, todos verdes):
  el lote nace tras Terminar (no tras Finalizar), reparto de dos líneas → dos lotes con el MISMO
  `unitCost`, R19 con una fila escrita a mano (`prisma.orderPresentationLine.updateMany` +
  presentación sin contenido vigente), `recipe_not_found` con un `recipeId` cambiado a mano a
  uno de otra empresa justo antes de Terminar (el caso que hasta QC-150 probaba Finalizar: sigue
  teniendo sentido, ahora contra Terminar, que es quien necesita el nombre de la receta), rollback
  si `receiveFromOrder` lanza tras escribir, idempotencia simple y a la vez, R20 sin cambio de
  comportamiento (edición no da de alta nada), y las tres variantes de coste (guardado,
  recalculado, ingrediente sin costo) con la misma aritmética de antes, ahora tras Comenzar+
  Terminar.
- `tests/integration/asignaciones/finished-orders.int.test.ts`: su doble de
  `finishPackingAliveById` (antes wireado directo a la función cruda `finishPackingAliveOrder`,
  ya no exportada) pasa a `createOrderWriteRepository().finishPackingAlive(...)` traducido al
  `'ok'`/string que `OrderCatalog` exige; no ejercita el alta de lotes (fuera de su alcance),
  así que `'ok'` vuelve con `finishedGoods: []`.

### Mapa R<n> -> test (T14)

| R | Test |
|---|---|
| R17 (un lote por línea) | `order-packing.test.ts`, `finish-with-finished-goods.int.test.ts` («R17») |
| R18 (coste unitario único) | `order-packing.test.ts` («R18»), `finish-with-finished-goods.int.test.ts` («R18 — el coste del lote») |
| R19 (rollback si falta contenido) | `order-packing.test.ts` («R19»), `finish-with-finished-goods.int.test.ts` («R19») |
| R20 (edición no da de alta nada) | `finish-with-finished-goods.int.test.ts` («R20») |
| R21 (idempotencia, también a la vez) | `finish-with-finished-goods.int.test.ts` («R21») |

### Salida de tests (T14, 2026-09-27)
- `pnpm run typecheck`: verde (repo completo).
- `pnpm run lint`: 0 errores, mismos 7 avisos preexistentes.
- `pnpm exec vitest run tests/unit/pedidos/order-packing.test.ts`: 15/15.
- `pnpm exec vitest run` `tests/unit/asignaciones/{finish-packing,authorization,start-packing}.test.ts`
  `tests/unit/pedidos/{transition-order,order-catalog}.test.ts`: 97/97.
- `pnpm exec vitest run tests/integration/pedidos/{order-packing,finish-with-finished-goods}.int.test.ts`: 25/25.
- `pnpm exec vitest run tests/integration/asignaciones/{finished-orders,responsible-eligibility}.int.test.ts
  tests/integration/pedidos/{order-reservation,order-reservation-concurrency}.int.test.ts`: 29/29.
- `pnpm exec vitest related --run` de los 10 archivos de código tocados: 321 archivos, 317
  verdes, 4714/4741 casos, 20 rojos — TODOS ajenos: `tests/unit/pedidos/company-scope.test.ts`
  (ripple de `order-actions.ts`, el otro subagente T11/T25, en curso en paralelo) y
  `tests/unit/pedidos-ui/{order-form,order-form-quote,order-sheet}.test.tsx` (19 casos, ya
  documentados en la tanda C como rojos de T22 — el formulario de `/pedidos` sigue mandando
  `presentationId`). Ninguno toca `order-packing.ts`, `inventario` ni `asignaciones/finish-packing.ts`.
- `pnpm exec vitest run tests/guards`: 44 archivos, 584/589, 5 `skipped` preexistentes, 0 rojos.

## Tanda D — T21 (2026-09-27) cerrada

Sin cambio de código de producción: `update-order.ts` (T8), `update-order-presentation-lines.ts`
(T9) y `startPackingAliveOrder` (T13) ya serializaban sobre el `FOR UPDATE` de la fila del pedido;
la prueba lo confirma con dos conexiones reales sin destapar ningún hueco.

- `tests/integration/pedidos/qc170-distribution-concurrency.int.test.ts` (nuevo, 9 casos, Postgres
  real, empresa efímera por caso con limpieza en `finally`).
- `tests/integration/aislamiento.json`: entrada nueva bajo `commit` (exigida por
  `guard-aislamiento-integracion`).

| R | Test (todos en `qc170-distribution-concurrency.int.test.ts`) |
|---|---|
| R38 (bajar cantidad / cambiar a unidad inconvertible con reparto vigente → rechazo, pedido intacto) | «R38» (2 casos) |
| R37 (dos guardados simultáneos; guardado vs bajada de cantidad → suma ≤ cantidad) | «R37» (2 casos, 8 vueltas con `Promise.all`) |
| R42, R46 (sin unidad: acepta tras asignarla, en edición general y en la acotada en `POR_EMPACAR`) | «R42, R46» (2 casos) |
| R48 (Comenzar vs guardado, los dos órdenes forzados con `pg.Client` que retiene el `FOR UPDATE`) | «R48» (2 casos) |
| R30, R46 (cambio de unidad en `POR_EMPACAR` no altera reservas ni asientos) | «R30, R46» (censo antes/después) |

Hallazgo para el reviewer (no bloqueante): la mitad de **rechazo** de R42 (`order_without_unit`)
no tiene camino de entrada real: los tres esquemas exigen `unitId` UUID y un id que no resuelve da
`unit_not_found`; `'without_unit'` solo sale de `validateDistribution` con `orderUnit: null`, que
ningún llamador de producción pasa. `design.md > 4.2` ya lo anota («solo si la entrada no trae
unidad; el esquema la exige»). Esa rama queda probada solo en dominio puro
(`order-distribution.test.ts`, T20) y en la traducción de la action (`order-actions-distribution.test.ts`).

Salida: typecheck verde; lint 0/0 en el archivo nuevo; el int test corrido 3 veces, 9/9 las tres
(23-27 s); `tests/guards` 584/589 (5 skipped preexistentes).

### Bloqueos / decisiones de esta tanda
- `recipe_not_found` en Terminar: SÍ tiene sentido (decidido, no bloqueado). Terminar necesita el
  nombre de la receta para el producto terminado (`receiveFromOrder.recipeName`), lectura que
  Finalizar ya no hace desde T12 (R15/R16). El caso "receta de otra empresa" de QC-150 (antes
  probado contra Finalizar) se traslada íntegro a Terminar en
  `finish-with-finished-goods.int.test.ts`.
- Ningún caso del spec exige qué pasa si `deriveUnitCost` devuelve `null` (coste que redondea a
  cero unidades): se usa `'0.0000'` como respaldo, documentado en el comentario de
  `order-packing.ts`; no hay requisito que lo pida ni test que lo ejercite -no es una decisión de
  producto, es el mismo criterio que ya usa `calculateLotIngredientsCost` («nunca sin importe»)-.


## Tanda D — cierre y verificación consolidada (2026-09-28)

Sesión interrumpida y retomada: el subagente de T14 se colgó (watchdog) tras dejar su trabajo verde
en disco; se verificó a mano. Todos los `backend_dev` de esta tanda con override `model: sonnet`.

Ajustes del cierre:
- `updateOrderPresentationLines` recibe `actor: Actor` (como `updateOrder`) en vez de
  `companyId`/`actorId` sueltos: `tests/unit/pedidos/company-scope.test.ts` exige que `companyId`
  no aparezca en `order-actions.ts` fuera de `currentActor`. Tocados: `update-order-presentation-lines.ts`,
  `order-actions.ts` y sus tests (`update-order-presentation-lines`, `order-actions-distribution`,
  `qc170-distribution-concurrency.int`).
- Retiradas dos citas de ficha en comentarios (`order-catalog.ts`, `finish-with-finished-goods.int.test.ts`).

Salida real:
- `pnpm run typecheck`: verde. `pnpm run lint`: 0 errores, 7 avisos preexistentes.
- `pnpm exec vitest related --run <12 fuentes de lib tocadas>` (antes del ajuste de `actor`): 320
  archivos, 316 verdes; 4703/4730, 7 skipped, 20 rojos = 19 de `pedidos-ui/{order-form,order-form-quote,order-sheet}`
  (T22, tanda E) + 1 de `company-scope.test.ts` (arreglado después).
- Tras el ajuste: `finish-with-finished-goods.int` + `order-packing.int` + `company-scope` +
  `order-presentation-availability` + `order-packing` + `asignaciones/finish-packing`: 74/74;
  `company-scope`, `order-actions`, `order-actions-distribution`, `update-order-presentation-lines`,
  `module-contract` + `tests/guards`: 655 verdes, 5 skipped; `qc170-distribution-concurrency.int`: 9/9.
- Rojos que deja la tanda: solo los 19 de T22 (`tests/unit/pedidos-ui/{order-form,order-form-quote,order-sheet}.test.tsx`).

## Tanda E (2026-10-01) — T16, T15, T22, T25 (UI) y T3 cerradas

Un subagente a la vez, commit por task (sin push). Commits: `35fb675d`, `b12ea2fa` (T16 dominio),
`19424cf5` (T16 UI), `84e87682` (T15), `fa03b2bf` + `f1600e50` (T22 UI + borde FormData),
`844c19a0` (T25 UI), `8126ac16` (T3), `4b7d37e3` y `8048340b` (ripples de test de T16 y T3).

### T16 — listados y ejecución leen el reparto
- `asignaciones`: tipo nuevo `OrderDistributionLineView {presentationId, presentationName|null, packages}`
  en `domain/order-distribution-view.ts` (con `unitLabelOf`); las cinco vistas (`assigned-order-view`,
  `assigned-order-execution-view`, `company-order-view`, `finished-order-view`, `packing-order-view`)
  pierden `presentationName` y ganan `presentationLines`, `unitId`, `unitLabel` (`PackingOrderRow`
  además `quantity`). Casos de uso `compose-order-rows`, `list-assigned-orders`, `list-company-orders`,
  `list-finished-orders`, `get-assigned-order-execution`: una sola llamada a presentaciones y otra a
  unidades por página; se retira el puente transitorio. `index.ts`, `lib/composition/index.ts`
  (`units: unitCatalog`).
- `pedidos`: `OrderRow` cambia `presentationId/presentationContent` por
  `presentationLines: OrderPresentationLineRow[]`; `OrderView` cambia `presentationId/presentationName`
  por `presentationLines: OrderPresentationLineView[]` (orden de alta). `get-order.ts`,
  `list-orders.ts`, `order-prisma.ts`, `index.ts`.
- UI: `components/shared/order-presentation-label.tsx` → `order-distribution-label.tsx`
  (`OrderDistributionLabel`); columnas `app/(private)/asignacion/components/{assigned,company,finished,packing}-orders-columns.tsx`,
  `app/(private)/pedidos/components/order-columns.tsx`, `app/(private)/asignacion/[id]/components/order-execution-screen.tsx`.
- Tests: `tests/unit/asignaciones/{order-distribution-view (nuevo),list-assigned-orders,get-assigned-order-execution,list-company-orders,list-finished-orders,list-packing-orders,get-packing-order}.test.ts`,
  12 de `tests/unit/pedidos/`, `tests/helpers/order-unit-of-work-double.ts`,
  `tests/integration/asignaciones/{assigned-orders,company-orders,finished-orders}.int.test.ts`,
  `tests/integration/pedidos/order-repository.int.test.ts`, `tests/unit/shared/order-distribution-label.test.tsx`,
  fixtures de `tests/unit/asignaciones-ui/*` y `tests/unit/pedidos-ui/*`; `tests/unit/inventario/scope.test.ts`
  retira la exclusión del label renombrado (ya no casa con `screenPattern`).

### T15 — pantalla del Empacador en solo lectura
- `app/(private)/asignacion/empaque/[id]/components/packing-order-screen.tsx` (+ `index.ts`): cantidad con
  unidad, lista de todas las líneas, «Sin presentación» con reparto vacío, aviso «Falta el reparto: lo
  define quien edita pedidos» solo en `POR_EMPACAR` sin líneas; ningún control.
- Tests: `tests/unit/asignaciones-ui/packing-order-screen.test.tsx` (nuevo), `packing-order-page.test.tsx`.
  R12 (contrato sin escritura) en `tests/unit/asignaciones/order-distribution-view.test.ts`.

### T22 — formulario del pedido con unidad y reparto
- `app/(private)/pedidos/components/order-distribution-field.tsx` (nuevo, reutilizable),
  `use-order-distribution-availability.ts` (nuevo; llama a `quoteOrderPresentationAvailabilityAction`
  con 400 ms de espera y descarta respuestas superadas), `order-form.tsx` (unidad obligatoria y
  controlada, reparto en lugar de presentación única, precarga en edición, Guardar deshabilitado si
  el disponible bloquea), `index.ts`; `components/shared/presentation-select.tsx` gana
  `name`/`onSelect`/`requireContent` opcionales (sin contenido = deshabilitada y marcada).
- Borde FormData: `lib/modules/pedidos/adapters/driving/order-actions.ts` (`buildCreateCandidate` lee
  `unitId` y une por posición `presentationLines.presentationId`/`presentationLines.packages`;
  longitudes distintas → `invalid_input`), constantes en `order-input.ts` exportadas por el barrel.
- Tests: `tests/unit/pedidos-ui/{order-form,order-form-quote,order-sheet,pedidos-viewport}.test.tsx`
  (los 19 rojos heredados, ahora verdes), `order-distribution-field.test.tsx` (nuevo),
  `tests/unit/pedidos/order-actions.test.ts` (bloque nuevo con el esquema real).

### T25 (UI) — «Reparto y unidad» en `POR_EMPACAR`
- `app/(private)/pedidos/components/order-distribution-dialog.tsx` (nuevo); permiso resuelto en
  servidor en `order-list-section.tsx` (`pedidos.modificar` → `canEditDistribution`) y bajado por
  `order-table.tsx`, `order-columns.tsx`, `order-row-actions.tsx`, `order-sheet.tsx`. `BLOQUEADO` no
  entra (design §13: no existe en el enum). Refresca con `router.refresh()`.
  `order-distribution-field.tsx` importa los nombres de campo de `@/lib/modules/pedidos`.
- Tests: `tests/unit/pedidos-ui/order-distribution-dialog.test.tsx` (nuevo), `order-list-section.test.tsx`.
- `guard-pantallas-exigen-permiso` verde sin cambio (solo censa páginas con `requirePagePermission`).

### T3 — backfill y retiro de `orders.presentation_id`/`presentation_content`
- `db/migrations/20260927120200_order_presentation_lines_backfill_and_drop/{migration.sql,down.sql}`,
  `db/schema.prisma` (`Order` sin las dos columnas ni su índice). Aplicada en `QuimiCloude_QC170`
  (59 migraciones; la base no tenía pedidos).
- Tests: `tests/integration/pedidos/qc170-backfill.int.test.ts` (nuevo, 9 casos, transacción
  revertida con DDL); ajustados `order-crud.int`, `pedidos-constraints.int`,
  `presentation-content.int`, `tests/unit/pedidos/schema/pedidos-schema.test.ts`, comentarios en
  `inventario-constraints.int`, `company-scope-queries.int`, `list-query-orders.int`,
  `order-repository.int`; censos `tests/integration/aislamiento.json` y `MIGRACIONES_ESPERADAS`
  (`guard-identificador-de-request`); `tests/integration/proveedores/company-scope.int.test.ts`
  (`migracionesDependientes` gana el criterio «la posterior retira una restricción que el down
  elegido espera»). E2E ajustados para compilar, SIN correr:
  `e2e/{ejecucion-receta,empaque,pedidos,producto-terminado}.spec.ts` (revisar en T19).
- **Desvíos frente a `design.md > 2.4` que el reviewer debe mirar** (no decididos aquí: copiados del
  diseño o forzados por el esquema):
  1. `down.sql` no hace `DROP TABLE order_presentation_lines` (la FK de `inventory_movements` de
     `20260927120100` lo impide y la tabla la borra el down de `20260927120000`): solo devuelve la
     línea única a las columnas y borra las líneas.
  2. La segunda aplicación falla en el guardia del paso 0 (también lee `presentation_id`), no en el
     `DROP COLUMN`; mismo 42703. El test prueba además que cada `DROP COLUMN` suelto falla.
  3. Copiado tal cual del diseño: el guardia de R45 no filtra `deleted_at` y el de R49 sí; el
     `INSERT` crea líneas también para pedidos borrados/entregados/cancelados aunque R22 dice «pedido vivo».
  4. No estaba en el spec: up y down abren y cierran `NO FORCE`/`FORCE` RLS (patrón de
     `reserve_existing_orders`) para ver las filas si la migración no corre como superusuario.

### Mapa R<n> -> test (tanda E)

| R | Test |
|---|---|
| R26 (primera línea + «+N», cantidad con unidad) | `tests/unit/shared/order-distribution-label.test.tsx`, `tests/unit/pedidos-ui/order-columns.test.tsx`, `tests/unit/asignaciones-ui/*-columns.test.tsx`, `tests/unit/asignaciones/list-*.test.ts`, `order-repository.int.test.ts` |
| R27 («Sin presentación» con reparto vacío) | mismos archivos que R26 |
| R47 (Empacador: todo el reparto en solo lectura, aviso «Falta el reparto») | `tests/unit/asignaciones-ui/packing-order-screen.test.tsx`, `tests/unit/asignaciones/get-packing-order.test.ts` |
| R12 (`asignaciones` sin escritura; acción oculta sin `pedidos.modificar`) | `tests/unit/asignaciones/order-distribution-view.test.ts`, `tests/unit/pedidos-ui/order-distribution-dialog.test.tsx`, `order-list-section.test.tsx` |
| R34 (presentación sin contenido marcada, no se añade) | `tests/unit/pedidos-ui/order-distribution-field.test.tsx` |
| R6 (disponible en la unidad del pedido tras cada cambio) | `order-distribution-field.test.tsx`, `order-form.test.tsx` |
| R39 (negativo, aviso, Guardar deshabilitado) | `order-distribution-field.test.tsx`, `order-form.test.tsx`, `order-distribution-dialog.test.tsx` |
| R7 (línea incompatible marcada) | `order-distribution-field.test.tsx` |
| R41 (unidad obligatoria en alta, editable) | `order-form.test.tsx`, `tests/unit/pedidos/order-actions.test.ts` |
| R42 (sin unidad: falta la unidad, sin líneas ni disponible) | `order-distribution-field.test.tsx`, `order-form.test.tsx`, `order-distribution-dialog.test.tsx`, `tests/unit/asignaciones/list-*.test.ts` |
| R11, R13 (acción solo en `POR_EMPACAR`) | `order-distribution-dialog.test.tsx` (`it.each` EN_EMPAQUE/ENTREGADO/CANCELADO) |
| R46 (el diálogo envía solo `unitId`+`presentationLines`) | `order-distribution-dialog.test.tsx` |
| R36 (rechazo del servidor junto al reparto, sin perder lo escrito) | `order-form.test.tsx`, `order-distribution-dialog.test.tsx` |
| R1, R9 (borde FormData del reparto) | `tests/unit/pedidos/order-actions.test.ts` |
| R22, R23, R24, R43 (backfill y `unit_id`) | `tests/integration/pedidos/qc170-backfill.int.test.ts` |
| R45, R49 (abortos, y no-aborto en `POR_EMPACAR`) | `qc170-backfill.int.test.ts` |
| R25 (doble aplicación falla), down con más de una línea | `qc170-backfill.int.test.ts` |

### Salida real (2026-10-01)
- `pnpm run typecheck`: `tsc --noEmit` sin errores (exit 0).
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)`, todos preexistentes
  (`tests/unit/documentos/confirm-catalog-import.test.ts`, `tests/unit/pedidos/order-service.test.ts`).
- `./init.sh --rapido`, 1.ª corrida: `Test Files 1 failed | 542 passed (543)`, `Tests 3 failed | 7755
  passed | 30 skipped` — los 3 de R10 en `tests/integration/proveedores/company-scope.int.test.ts`
  (ripple de T3: `42704` al soltar `orders_presentation_content_requires_presentation`). Arreglado en `8048340b`.
- `./init.sh --rapido`, 2.ª corrida: `Test Files 1 failed | 542 passed (543)`, `Tests 1 failed | 7757
  passed | 30 skipped` — `tests/unit/configuracion-ui/user-table.test.tsx` «la accion de editar de una
  fila abre el panel SOBRE ESE usuario (R26)» (`findByTestId` agotado bajo carga). Ajeno a esta tanda
  (ningún commit toca `configuracion`); corrido solo 3 veces: 27/27 las tres.
- `./init.sh --rapido`, 3.ª corrida (HEAD `8048340b`): **verde, `== init OK ==`**. Relacionados:
  `Test Files 543 passed (543)`, `Tests 7758 passed | 30 skipped (7788)`; todas las guardias:
  `Test Files 51 passed (51)`, `Tests 652 passed | 11 skipped (663)`; «todas las migraciones tienen down.sql».
- Pendiente fuera de esta tanda: T19 (E2E) y `./init.sh` completo antes del PR. El rojo
  `pedidos-convenciones › no cambia package.json` que vieron los subagentes en corridas acotadas no
  aparece en el gate (deriva de `origin/dev`, a mirar al sincronizar).

## Cierre: ajuste T3 + T19 (2026-10-01)

Decisión humana 2026-10-01 sobre los puntos abiertos de T3 (§Tanda E): backfill solo de pedidos
vivos; se aceptan como están el `down.sql` sin `DROP TABLE`, la segunda aplicación fallando en el
guardia (42703) y el paréntesis `NO FORCE`/`FORCE` RLS. Documentado como nota de enmienda en
`design.md > 2.4` (única edición del spec; `requirements.md` intacto).

### Commits

- `76a6276e` fix: T3 backfill solo de pedidos vivos (`backend_dev`).
- `45b68785` docs: nota de enmienda en `design.md > 2.4`.
- `3320fa7a` test: T19 E2E de pedido en varias presentaciones (`frontend_dev`).

### Archivos

- `db/migrations/20260927120200_order_presentation_lines_backfill_and_drop/migration.sql`: el
  `INSERT` filtra `deleted_at IS NULL` y `status NOT IN ('ENTREGADO','CANCELADO')`; el guardia de
  R45 cuenta solo pedidos no borrados. Sin cambios en el `UPDATE` de `unit_id`, RLS ni `down.sql`.
- `tests/integration/pedidos/qc170-backfill.int.test.ts`: dos tests nuevos y uno ajustado (su
  `CANCELADO` esperaba línea; ahora `[]`). El test de R45 con pedido borrado retira dentro de su
  transacción el CHECK `orders_delivered_not_deleted`, que en una base real impide ese caso: el
  filtro es defensivo.
- `specs/QC-170-pedido-en-varias-presentaciones/design.md` (nota de enmienda §2.4).
- `e2e/pedido-en-varias-presentaciones.spec.ts` (nuevo).
- `e2e/pedidos.spec.ts` (alta con unidad y una línea de reparto; limpieza de líneas),
  `e2e/producto-terminado.spec.ts` (lote tras Terminar, no tras Finalizar; `gotoSettled` para
  WebKit), `e2e/ejecucion-receta.spec.ts` y `e2e/empaque.spec.ts` (solo limpieza: borrar
  `order_presentation_lines` antes que los pedidos por la FK RESTRICT).
- `tests/guards/guard-identificador-de-request.test.ts`: el spec nuevo en `E2E_ESPERADOS`.
- `pedidos-terminados.spec.ts` y `pedidos-asignados.spec.ts`: revisados, sin cambios (no usan la
  presentación del pedido).

### Mapa R<n> -> test (cierre)

| R | Test |
|---|------|
| R22 | `qc170-backfill.int.test.ts` › «R22: solo los pedidos vivos ganan reparto; borrado, ENTREGADO y CANCELADO quedan sin lineas» (+ el de R22, R23, R24, R43 ajustado) |
| R45 | `qc170-backfill.int.test.ts` › «R45: un pedido POR_EMPACAR sin presentacion pero borrado NO aborta la migracion» (+ los abortos previos) |
| R33, R36, R39 | `e2e/pedido-en-varias-presentaciones.spec.ts` › «R33, R36, R39 - alta con unidad y dos lineas de reparto, aviso y rechazo del reparto que pasa del total, produccion, empaque y un lote por linea con el mismo coste unitario» |
| R47, R10, R46, R13, R14 | `e2e/pedido-en-varias-presentaciones.spec.ts` › «R47, R10, R46, R13, R14 - sin reparto en Por empacar el Empacador lo ve sin controles y no puede comenzar, el administrador reparte con la edicion acotada y, tras Comenzar, el reparto queda fijado» |
| R37 (QC-150, enmendado) | `e2e/producto-terminado.spec.ts`: Finalizar no crea lote; Terminar sí |

### Salida real

- `qc170-backfill.int.test.ts`: 1 archivo, 11 passed, 0 failed.
- E2E, `--workers=1`, 7 archivos (`pedido-en-varias-presentaciones`, `ejecucion-receta`,
  `empaque`, `pedidos`, `producto-terminado`, `pedidos-terminados`, `pedidos-asignados`):
  - Chromium: **14 passed, 0 failed**.
  - WebKit: 1a corrida 12/2 y 2a 13/1, todos por «navigation interrupted» (`page.goto` contra el
    `router.refresh()` de un guardado previo); corregido en los tests con reintento / `gotoSettled`;
    `--repeat-each=2` de los dos archivos afectados: **6/6 passed**. No hay re-corrida completa de
    los 7 en WebKit tras el último ajuste.
  - Ninguno de los 11 rojos heredados de dev está en estos archivos; ningún rojo nuevo.
- `./init.sh --rapido` (sobre `3320fa7a`): typecheck y lint verdes (0 errores, 7 avisos
  previos); related `Test Files 543 passed (543)`, `Tests 7760 passed | 30 skipped (7790)`;
  guardias `Test Files 51 passed (51)`, `Tests 652 passed | 11 skipped (663)`; `init OK`.

### Pendiente para el leader

1. **E2E que crean pedidos por pantalla sin tocar ni correr**: `pedidos-cotizacion`,
   `reserva-de-material`, `recetas-porcentaje`, `aislamiento-pedidos` (y revisar los demás que
   nombran presentaciones). El alta exige ahora unidad (R41) y el reparto sustituye al selector de
   presentación, así que probablemente fallen; si eligen presentación, también su limpieza por la
   FK de `order_presentation_lines`. Aparecerán en el E2E completo / `./init.sh` antes del PR.
2. **Posible hueco de spec en R18**: `finishPackingAliveById` suma `envases × contenido` de todas
   las líneas sin convertirlas a una misma unidad; con presentaciones en l y ml el coste unitario
   saldría mal. El E2E usa dos presentaciones en litros. Código sin tocar: decide el humano.
3. Detalle de UI: reabrir «Reparto y unidad» justo tras guardar, antes de que acabe
   `router.refresh()`, muestra los valores anteriores.
4. `./init.sh` completo antes del PR.

## Arreglos del review 1 (2026-10-01)

Informe: `progress/review_QC-170-pedido-en-varias-presentaciones.md` (RECHAZADO, 4 bloqueantes y 6
menores). Los puntos 1-3 de «Pendiente para el leader» de la sección anterior quedan resueltos aquí.

### Commits

- `931246ce` docs: enmienda R18 (decisión humana 2026-10-01) y task T26 (spec, sin otros cambios).
- `7e3af322` fix: T26 / B3 — coste por unidad convertido a la unidad del pedido (`backend_dev`).
- `f7df4103` test: B4 — aislamiento entre empresas en la edición del reparto y la unidad (`backend_dev`).
- `888eaa16` fix: m1 — «Reparto y unidad» reabre con lo recién guardado (`frontend_dev`).
- `0c6c770f` test: B2 — cuatro E2E adaptados al alta con unidad y reparto (`frontend_dev`).
- `668aeb77` chore: B1 — limpia citas en comentarios de producción (`backend_dev`).

### Por hallazgo

**B3 / T26 — cerrado, con un punto a confirmar.**
- `order-packing.ts`: el total es la suma de `packages × content` de cada línea convertida a
  `orders.unit_id` con `convertQuantity` (sin convertir si coinciden). La suma vive en
  `sumInOrderUnit` (`order-distribution.ts`), que también usa `validateDistribution`: guardar y
  Terminar no pueden divergir.
- No usa `deriveUnitCost` (solo admite 4 decimales y la cantidad convertida puede llevar hasta 12):
  un `divideCost` con BigInt y redondeo half-up, una división por unidad de presentación.
- `FinishPackingOrderRow` gana `unitId` (mismo select tras el `UPDATE`); `incompatible_units` y
  `order_without_unit` se lanzan dentro de la transacción: ningún lote nace y el pedido sigue
  `EN_EMPAQUE`. `asignaciones` traduce los dos resultados nuevos (`IncompatibleUnitsError`,
  `OrderWithoutUnitError`, códigos ya en catálogo; sin códigos nuevos).
- **Punto a confirmar (lectura de R18).** Cada lote guarda el coste por unidad del pedido
  **expresado en la unidad de su presentación** (lote en L: 16,3934/L; lote en ml: 0,0164/ml), porque
  el stock del lote está en la unidad de su presentación (`plan.quantity = packages × content`). La
  lectura literal de T26 («todos los lotes salen con el MISMO `unit_cost`») valoraría el lote de
  1000 ml a 16.393. Si el humano prefiere la literal, son pocas líneas en
  `unitCostByPresentationUnit` y las cifras de los tests nuevos.
- Efecto del redondeo a 4 decimales (`decimal(14,4)`): en el ejemplo los lotes valen 16,40 + 983,604
  = 1000,004. Con unidades muy pequeñas y producto barato el coste por unidad puede redondear a
  `0.0000` y el lote valdría 0: el spec no lo cubre (abierto).

**B4 — cerrado.** `tests/integration/pedidos/qc170-distribution-company-scope.int.test.ts` (nuevo,
8 casos, Postgres real, dos empresas efímeras), alta en `tests/integration/aislamiento.json`
(`commit`, lo exige `guard-aislamiento-integracion`). Cubre la edición acotada en `POR_EMPACAR`
(caso de uso y adaptador `updatePresentationLinesAlive` con el ámbito de B) y la general
(`updateOrder` y adaptador `updateAlive`): `not_found` / `OrderNotFoundError`, foto completa del
pedido de A y sus líneas igual antes y después; controles positivos desde A; y A no puede repartir
en una presentación de B (`presentation_not_found`). No se comprobó el rojo quitando el filtro (el
modo automático bloqueó tocar producción para el experimento).

**m1 — cerrado.** Opción (a): `OrderRowSheetActions` guarda el último reparto guardado junto con el
objeto `order` vigente y se lo pasa al diálogo (`saved?`, `onSaved?`) mientras siga siendo ese mismo
objeto; el refresco trae otro objeto y lo local se descarta solo. Tests en
`order-distribution-dialog.test.tsx` (`describe` «reabrir "Reparto y unidad" antes de que llegue el
refresco»): reabre con lo guardado, el segundo guardado no reenvía los valores viejos, y tras el
refresco manda el pedido nuevo. Supuesto: la fila mantiene el mismo objeto entre refrescos.

**B2 — cerrado.** `pedidos-cotizacion`, `reserva-de-material`, `recetas-porcentaje` y
`aislamiento-pedidos`: eligen unidad y añaden una línea de reparto donde guardan; los fixtures de
presentación ganan `content: '1'`; las limpiezas borran `order_presentation_lines` antes que
`orders`. Además `recetas-porcentaje` borra `reservation_movements`/`inventory_movements` antes que
los pedidos (su `afterAll` fallaba por esa FK: hueco del fixture, no de producción). Nota:
`aislamiento-pedidos.spec.ts` estaba en CRLF en el repo y queda normalizado a LF por
`.gitattributes` (por eso su diff es de archivo entero; `git diff -w --ignore-cr-at-eol` da +42).

**B1 — cerrado salvo migraciones.** 32 archivos (31 de `lib/` + `db/schema.prisma`), solo
comentarios (`git diff -w` sin líneas de código). Grep final sobre `git diff -U0 0736e1ff -- lib app
components db`: **0** citas fuera de migraciones; **5** dejadas a propósito en
`db/migrations/20260927120000_order_presentation_lines/migration.sql:1,30,57,58` y
`20260927120100_inventory_movements_production_per_line/migration.sql:1`: Prisma guarda el checksum
de cada `migration.sql` aplicada y cambiar un byte obliga a resetear las bases que ya la tengan
aplicada. Decide el humano/leader. Quedan referencias a tasks (`T9`, `T20`, `T25`) en algunos
comentarios que el grep del informe no busca.

**m2 — no se toca** (desfase con `dev`, se resuelve al sincronizar; no es de esta rama).
**m3 — no se toca** (`user-table`, no es de esta rama).
**m4 — anotado.** El rechazo `order_without_unit` sigue sin entrada real por formulario (los tres
esquemas exigen `unitId`). Desde T26 tiene además un uso defensivo en Terminar, probado en
`order-packing.test.ts` («R18: un pedido con reparto y sin unidad rechaza con order_without_unit...»).
**m5 — anotado en el mapa de abajo.**
**m6 — cerrado:** mapa consolidado debajo.

### Mapa R<n> -> test consolidado

El mapa entero, archivo a archivo, es el de `progress/review_QC-170-pedido-en-varias-presentaciones.md
> Mapa de trazabilidad`, que se da por válido con estos cambios:

| R | Cambio respecto al mapa del review |
|---|---|
| R18 | + `order-packing.test.ts` «R18: con un reparto en L y en ml, suma el total convertido...», «R18: una presentacion en la misma unidad que el pedido no se convierte», «R7, R18: ... incompatible_units y NO da de alta ningun lote», «R18: ... order_without_unit ...»; `finish-with-finished-goods.int.test.ts` › «R18 — reparto en dos unidades» (2 casos); `asignaciones/finish-packing.test.ts` (2 casos de traducción de errores) |
| R7 | + los casos `incompatible_units` de Terminar arriba |
| R29 | + `qc170-distribution-company-scope.int.test.ts` (8 casos) |
| R11 | + `order-distribution-dialog.test.tsx` (3 casos de reabrir antes del refresco) |
| R31 | indirecto: casos QC-168 de `order-packing.test.ts`/`.int` (aceptado por el reviewer, m5) |
| R32 | sin test: no hay log de ejecución en el esquema (QC-82 no ha entrado); se cumple sin hacer nada (m5) |
| R41, R42 | + E2E adaptados (`pedidos-cotizacion`, `reserva-de-material`, `recetas-porcentaje`, `aislamiento-pedidos`) ejercen el alta con unidad |

### Salida real

- T26: `vitest run` de `finish-with-finished-goods.int`, `order-packing`, `order-presentation-availability`,
  `order-distribution` y `asignaciones/finish-packing`: **5 archivos, 71 passed**.
  `pedidos-convenciones.test.ts`: 22 passed, 1 failed (`no cambia package.json`, desfase con `dev`).
- B4: `qc170-distribution-company-scope.int.test.ts`: **8 passed**. Guardias: 42/44 archivos en la
  corrida del subagente; los dos rojos (`guard-editor-aislado`, `guard-teclear-y-plazo`) fueron
  timeout por carga y solos dan 13/13.
- m1: `vitest related` de los 4 archivos: **32 archivos, 487 passed**.
- B2: Playwright Chromium `--workers=1`, 2a corrida: `aislamiento-pedidos` 1/0, `pedidos-cotizacion`
  2/0, `recetas-porcentaje` 4/0, `reserva-de-material` 1/0 → **8 passed (2.1m)**. 1a corrida 7/1
  (el `afterAll` de `recetas-porcentaje`, arreglado). WebKit no corrido. Puerto 3117 libre antes y
  después.
- B1: typecheck 0 errores; lint 0 errores, 7 avisos previos; `vitest run tests/guards` 44/44, 584
  passed, 5 skipped.
- `./init.sh --rapido` (sobre `668aeb77`): typecheck verde; lint 0 errores, 7 avisos previos;
  related `Test Files 544 passed (544)`, `Tests 7779 passed | 30 skipped (7809)`; guardias
  `Test Files 51 passed (51)`, `Tests 652 passed | 11 skipped (663)`; `init OK`. Ningún rojo (el de
  `pedidos-convenciones › no cambia package.json` no entró en la selección de related).
- Pendiente: sincronizar con `dev`, `./init.sh` completo y E2E en WebKit antes del PR.

## F2.3 — cuelgue tras el merge (2026-10-02)

**Causa.** `tests/integration/asignaciones/finish-auto-assign-packers.int.test.ts` (llega de dev con
el PR #130) dobla `OrderCatalog.transitionAliveById` con el contrato de dev:
`{ kind: 'ok', finishedGoods: {...} }`. En QC-170 el `'ok'` de ese puerto es el literal (el
Finalizar ya no da de alta producto terminado; pasa a Terminar el empaque), y
`finish-assigned-order.ts` solo sale del `for (;;)` con `result === 'ok'`. El objeto no casa con
ningun resultado, cae en la rama `'stale'`, relee (`findAliveById` doblado devuelve `EN_CURSO`) y
reintenta sin fin: bucle de microtareas sin E/S a Postgres, por eso CPU girando y
`pg_stat_activity` vacio. El doble va con `as unknown as OrderCatalog`, asi que el typecheck no lo
vio. No es de dev: en `origin/dev` el caso de uso sale con `typeof result === 'object'`
(`git show origin/dev:lib/modules/asignaciones/domain/finish-assigned-order.ts`, l.218), asi que
alli el doble es correcto; es de la combinacion. No hizo falta worktree temporal: el contrato de
dev se lee con `git show`.

**Arreglo** (capa mas estrecha, solo el test): el doble devuelve `'ok' as const`, como declara el
puerto en `lib/modules/pedidos/domain/order-catalog.ts`. Sin cambio de produccion ni de semantica.

**Salida real.**

```
pnpm exec vitest run tests/integration/asignaciones/finish-auto-assign-packers.int.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  3.12s

pnpm exec vitest run tests/integration/asignaciones tests/integration/pedidos   (EXIT=0)
 Test Files  42 passed (42)
      Tests  355 passed (355)
   Duration  47.95s
```

**Diagnostico, sin tocar: `tests/integration/unidades/unidades-constraints.int.test.ts`.** Rojo
aislado (1 fallo / 29 verdes) y NO es el `23001` vs `23503` de Postgres 18.6: el caso «la base
rechaza un unit_id inexistente aunque Prisma no declare la relacion» compara con `toEqual` la
lista EXACTA de FKs hacia `units` y aparece una de mas, `orders_unit_id_fkey`
(`confdeltype r`, `confupdtype c`), que crea la migracion propia de QC-170
`20260927120000_order_presentation_lines`. El test no cambia desde QC-147 (ya en la rama antes
del merge), asi que es un rojo de QC-170, no del merge ni de dev: falta añadir esa FK a la lista
esperada (o decidir otra cosa sobre ella). Pendiente de decision del leader.

**Arreglo de unidades-constraints (decision del leader: `orders.unit_id` vuelve, aprobado en F1.4).** `orders_unit_id_fkey` entra en la lista exacta esperada (`r`/`c`); aislado: `Test Files 1 passed (1)`, `Tests 30 passed (30)`, 1.48s.
