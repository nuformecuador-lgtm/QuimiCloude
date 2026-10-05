# QC-199 — presentacion-por-unidad-en-alta-de-producto · tasks.md

> `[P]` = paralelizable con las otras `[P]` de su mismo bloque. «Hecho» incluye siempre
> `./init.sh --rapido` en verde al cerrar la tanda, y `./init.sh` completo al cerrar la feature.
> Los nombres de los casos llevan `R<n>` (`docs/conventions.md > Tests`). Los comentarios de
> producción, sin citar fichas ni requisitos.

## Bloque 0 — comprobación previa (bloqueante)

- [x] **T0 — Medir los lotes cuya unidad de presentación no coincide con la del producto.** Antes de
  T6 y T7, ejecutar en la base de destino la consulta de `design.md > 9`. No cambia código ni
  datos.
  *Hecho:* el resultado (número y, si hay alguno, las filas) queda en
  `progress/impl_QC-199-presentacion-por-unidad-en-alta-de-producto.md`. **Si sale alguna fila, el
  implementer PARA y lo devuelve al humano con esos datos**, sin seguir con T6, T7 ni con lo que
  dependa de ellas. Con cero filas, sigue.

## Bloque A — base de datos

- [x] **T1 — Migración del disparador.** Crear
  `db/migrations/20261004170000_product_batches_require_product_unit/{migration.sql,down.sql}`
  según `design.md > 2`. `down.sql` restituye el cuerpo exacto de
  `20260918130000/migration.sql:70-98`.
  *Hecho:* `pnpm run db:migrate` aplica; `pnpm run db:rollback` revierte y `prisma migrate status`
  queda limpio; se vuelve a aplicar.
- [x] **T2 — Test estático de la migración** (`tests/unit/inventario/schema/product-batches-require-product-unit-migration.test.ts`). Depende de T1.
  Casos: `R12 la rama sin presentacion rechaza el insumo sin unidad con 23514 y product_batches_product_without_unit`;
  `R13 la rama con presentacion conserva el cuerpo vigente`;
  `R14 down.sql restituye la funcion anterior identica`;
  `R15 la migracion no escribe datos ni toca presentations` (sin `UPDATE`/`DELETE`/`INSERT`, sin `ALTER TABLE "presentations"`).
  *Hecho:* verde.
- [x] **T3 — Test de integración del disparador** (`tests/integration/inventario/product-batch-require-unit.int.test.ts`). Depende de T1.
  Casos: `R12 un lote sin presentacion de un insumo sin unidad se rechaza`;
  `R13 un lote sin presentacion de un instrumento sin unidad entra`;
  `R13 un lote sin presentacion de un envase entra`;
  `R13 un lote con presentacion de otra unidad sigue rechazandose`;
  `R13 un lote con presentacion cuyo producto no tiene unidad sigue rechazandose`;
  `R14 tras aplicar down.sql, el lote sin presentacion de un insumo sin unidad vuelve a entrar` (aplica y re-aplica en una transacción que se revierte, o en el patrón que ya use la suite).
  *Hecho:* verde contra la base de tests.

## Bloque B — dominio y persistencia (depende de A solo para los tests de integración)

- [x] **T4 [P] — Esquema de alta.** `domain/product-input.ts` según `design.md > 3.1`.
  Tests en `tests/unit/inventario/product-input.test.ts`:
  `R6 el alta de insumo exige unitId`, `R6 el alta de insumo con presentationId es invalid_input`,
  `R6 unitId con forma invalida da Elige una unidad.`, `R11 el alta de envase sigue exigiendo presentationId`,
  `R11 el alta de instrumento no cambia`. Ajustar los casos existentes que mandaban `presentationId` en PRODUCT.
  *Hecho:* verde.
- [x] **T5 [P] — Repositorio: búsqueda por unidad y alta con unidad.** `ports/product-repository.ts`,
  `domain/product-view.ts` (`NewProduct.unitId?`), `pp` (`findAliveIdByNameInUnit`,
  `createWithFirstBatch`, `translateBatchWriteError`) según `design.md > 5.1`; cableado del método
  nuevo en `lib/composition/index.ts`.
  Tests de integración en `tests/integration/inventario/product-batch-write.int.test.ts` (o uno nuevo
  `product-unit-without-presentation.int.test.ts`):
  `R9 createWithFirstBatch con unitId crea producto con esa unidad y lote sin presentacion con su asiento`,
  `R10 findAliveIdByNameInUnit encuentra el homonimo de la misma unidad y no el de otra`,
  `R12 el rechazo product_batches_product_without_unit se traduce a ValidationError`.
  *Hecho:* verde.
- [x] **T6 [P] — Vista de lotes por la unidad del producto.** Depende de T0 (cero filas). `BATCH_VIEW_SELECT`/`toBatchView` y
  `findBatchesOfOrder` en `pp`; comentario de `domain/product-batch-view.ts`.
  Tests de integración (`tests/integration/inventario/order-batches.int.test.ts` o nuevo):
  `R16 un lote de insumo sin presentacion muestra la unidad del producto`,
  `R16 un lote antiguo con presentacion muestra la unidad del producto`,
  `R16 apartado y disponible del lote salen junto a la unidad del producto`;
  regresión: `R18 lote de envase y de producto terminado conservan su unidad`.
  *Hecho:* verde.
- [x] **T7 [P] — Costeo.** Depende de T0 (cero filas). `pcp` según `design.md > 5.2`.
  Unit en `tests/unit/inventario/product-catalog-costing.test.ts`:
  `R17 toCostingBatch toma la unidad del producto`.
  Integración en `tests/integration/pedidos/order-ingredients-cost.int.test.ts` y
  `order-cost-quote.int.test.ts`:
  `R17 un insumo con lotes solo sin presentacion tiene coste en la cotizacion`,
  `R17 el importe guardado del pedido cuenta el lote sin presentacion`,
  `R17 el coste del lote de producto terminado no cuenta ese ingrediente como cero`,
  `R18 los lotes sin costo y los de instrumento siguen fuera`,
  `R18 los lotes de envase siguen fuera de findCostingBatches y los de terminado dentro`.
  *Hecho:* verde.
- [x] **T8 — Servicio de alta.** `domain/create-product.ts` según `design.md > 4`; `CreateProductDeps.units`
  cableado en `lib/composition/index.ts`. Depende de T4 y T5.
  Tests en `tests/unit/inventario/create-product.test.ts` y `tests/unit/inventario/authorization.test.ts`:
  `R7 una unidad inexistente o de otra empresa es invalid_input y no escribe`,
  `R8 sin inventario.modificar se rechaza antes de zod y sin consultar unidades ni productos`,
  `R9 sin homonimo crea el producto con la unidad y el lote sin presentacion`,
  `R10 con homonimo de la misma unidad agrega el lote sin presentacion`,
  `R10 con homonimo de otra unidad crea otro producto`,
  `R11 envase e instrumento siguen por su camino`.
  *Hecho:* verde.
- [x] **T9 — Acción.** `adapters/driving/product-actions.ts` según `design.md > 3.2`. Depende de T4.
  Test en `tests/unit/inventario/product-actions.test.ts`:
  `R6 el alta de insumo envia unitId y no presentationId`, `R11 el alta de envase sigue enviando presentationId`.
  *Hecho:* verde.

- [x] **T14 [P] — Unidades del formulario con `inventario.modificar`.** Según `design.md > 6.1`:
  `UnitCatalog.listVisibleRefs` en `unidades` (contrato y `unit-catalog-prisma.ts`), caso de uso
  `inventario/domain/list-product-form-units.ts`, `listProductFormUnitsAction` y cableado en
  `lib/composition/index.ts`.
  Tests:
  `tests/unit/inventario/list-product-form-units.test.ts`:
  `R20 con inventario.modificar y sin unidades.consultar devuelve las unidades visibles`,
  `R20 sin inventario.modificar rechaza con error de permiso y no consulta unidades`.
  `tests/integration/unidades/unit-catalog-visible.int.test.ts`:
  `R20 listVisibleRefs devuelve las unidades de la empresa y las de sistema, incluida unidad, y ninguna de otra empresa`.
  *Hecho:* verde.

## Bloque C — interfaz (depende de T4 y T14)

- [x] **T10 — Formulario y selector de nombre.** `product-form.tsx` y `product-name-picker.tsx`
  según `design.md > 6`. Incluye `page.tsx` y `product-sheet.tsx` con la prop `formUnits`
  (`design.md > 6.1`). Limpiar los comentarios de las líneas tocadas.
  Además, en `tests/unit/inventario/product-page.test.tsx`:
  `R20 la pagina pasa al formulario las unidades de la accion de inventario y no las de listUnitsAction`.
  Tests en `tests/unit/inventario-ui/product-form-unidad.test.tsx` (nuevo):
  `R1 el alta de insumo muestra Unidad y no Presentacion`,
  `R2 el selector ofrece todas las unidades recibidas incluida unidad (u) y no ofrece sin unidad`,
  `R3 envase muestra Presentacion y no Unidad; instrumento ninguna de las dos`,
  `R4 sin unidad muestra Elige una unidad., no llama a la accion y conserva lo escrito`,
  `R5 elegir un insumo existente preselecciona su unidad y se puede cambiar`.
  Ajustar `tests/unit/inventario-ui/envase-en-inventario.test.tsx` y `tests/unit/inventario/product-page.test.tsx`
  si dependían de la presentación en PRODUCT.
  *Hecho:* verde.

## Bloque D — recorrido y regresión

- [ ] **T11 — E2E del alta de un insumo con unidad** (`e2e/insumo-por-unidad.spec.ts`). Depende de T0-T10 y T14.
  Caso `R19 el Administrador da de alta un insumo eligiendo kg, lo ve en el listado y en el panel de lotes en kg, y un segundo alta del mismo nombre en kg suma a ese producto`.
  Comprobación contra Postgres dentro del caso: `products.unit_id` = kg y los dos lotes con
  `presentation_id` NULL, un solo producto vivo con ese nombre. Incluye ver la opción «u» en el
  selector (R2).
  *Hecho:* el spec pasa en Playwright con el comando E2E del repo (`docs/verification.md`).
- [ ] **T12 — Adaptar los E2E existentes del alta de insumo.** `e2e/inventario.spec.ts` (los recorridos
  que crean un PRODUCT con `crearPresentacionEnLinea`/`elegirPresentacionExistente`, :529-1000
  aprox.) pasan a elegir unidad; los recorridos de envase no cambian. Depende de T10.
  *Hecho:* `e2e/inventario.spec.ts` verde sin casos saltados.
- [x] **T13 — Gate completo y trazabilidad.** `./init.sh` completo en verde; mapa `R1..R20 -> test`
  en `progress/impl_QC-199-presentacion-por-unidad-en-alta-de-producto.md`. Depende de todo lo anterior.
  *Hecho:* gate verde y cada `R<n>` con al menos un test nombrado.

## Mapa previsto R -> test

| R | Test(s) |
|---|---|
| R1 | T10 `product-form-unidad.test.tsx`; T11 |
| R2 | T10; T11 |
| R3 | T10 |
| R4 | T10 |
| R5 | T10 |
| R6 | T4 `product-input.test.ts`; T9 `product-actions.test.ts` |
| R7 | T8 `create-product.test.ts` |
| R8 | T8 `authorization.test.ts` |
| R9 | T5 integración; T8; T11 |
| R10 | T5 integración; T8; T11 |
| R11 | T4; T8; T9 |
| R12 | T2; T3; T5 |
| R13 | T2; T3 |
| R14 | T2; T3; T1 (rollback manual) |
| R15 | T2 |
| R16 | T6; T11 |
| R17 | T7 |
| R18 | T6; T7 |
| R19 | T11 |
| R20 | T14 `list-product-form-units.test.ts`, `unit-catalog-visible.int.test.ts`; T10 `product-page.test.tsx` |
