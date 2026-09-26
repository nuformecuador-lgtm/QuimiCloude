# QC-150 — producto-terminado · bitácora del implementer

Rama `feature/QC-150-producto-terminado`, worktree `.worktrees/QC-150-producto-terminado`.

## Base de datos

- **Base propia `QuimiCloude_QC150`**, creada el 2026-09-24 con
  `CREATE DATABASE "QuimiCloude_QC150" TEMPLATE "qct_tpl_51f079471849"` (plantilla de integración de
  la rama tras el merge, `pnpm run db:test template`, 48 migraciones). `prisma migrate status`:
  «Database schema is up to date!».
- **Solo el `.env` del worktree** apunta a ella (`DATABASE_URL` y `DIRECT_URL`); el original quedó en
  `.env.bak-QuimiCloude` (ignorado por git). Además cada comando de migración exporta la variable
  del proceso. `QuimiCloude` (compartida) no se tocó.
- **Borrar `QuimiCloude_QC150` al cerrar la feature.**

## T0 — merge de `origin/dev` y contraste

- `git merge origin/dev` → `86e9873a`, sin conflictos. Trae QC-141 (PR #116) y QC-145 (ya `done`).
- `pnpm install --frozen-lockfile`, `prisma generate`, `next typegen`. `pnpm run typecheck` verde;
  `pnpm run lint` 0 errores, 2 avisos preexistentes (imports sin usar ajenos a la rama).
- Contraste del diseño: **12 divergencias**, anotadas y corregidas en `design.md > 10` (`ea7d39a5`).
  Ninguna cambia un requisito salvo **C12**:
  - **C12 — largo del nombre del producto terminado (BLOQUEA T7).** `recipeNameSchema` 120 + « · » 3
    + `presentationNameSchema` 60 = **183**, frente a los **120** de `productNameSchema`
    (`products.name` es `text` sin límite en la base). T7 manda parar y subirlo.
  - C2 es la más delicada: `product_batches_unit_cost_positive CHECK (unit_cost > 0)` sigue en vigor,
    así que el lote a coste cero de R42 no se podría escribir; T2 lo acota al lote de producción.
  - C6: QC-145 ya retiró la edición a `ENTREGADO`; R27 se cubre con la cláusula de T9.
- Gate `./init.sh --rapido`: lo corre el leader.

## T5 — Cálculos puros (`6c422930`, backend_dev)

- Nuevos: `lib/modules/inventario/domain/finished-goods.ts`, `tests/unit/inventario/finished-goods.test.ts`.
- Modificados: `lib/modules/inventario/index.ts` (exporta `planFinishedGoods` y `FinishedGoodsPlan`),
  `lib/modules/pedidos/domain/order-cost.ts` (`calculateLotIngredientsCost`),
  `lib/modules/pedidos/domain/resolve-ingredients-cost.ts` (`resolveLotIngredientsCost`, lecturas
  compartidas en `loadCostInput`), `tests/unit/pedidos/{order-cost,resolve-ingredients-cost}.test.ts`.
- Formato: cantidades, contenido y coste unitario en `d.dddd`; `packages` como entero plano.
  Desbordamiento en `calculateLotIngredientsCost` → `Error` genérico, que la acción traduce a `unexpected`.
- Tests: 6 archivos / 75 tests verdes (`finished-goods`, `order-cost`, `resolve-ingredients-cost`,
  `inventario/module-contract`, `decimal-quantity`, `unit-cost`). `vitest related` de los 4 archivos
  de `lib`: 231 archivos, 3569 pasados, 6 skipped, 0 fallos. Typecheck limpio; lint 0 errores.

## T1 y T2 — Migraciones (`cab48edd`, `7f71478e`, backend_dev)

- Nuevos: `db/migrations/20260924120000_finished_product_enum_values/{migration,down}.sql`,
  `db/migrations/20260924120100_finished_products_and_content_copies/{migration,down}.sql`,
  `tests/unit/inventario/schema/finished-product-enum-values-migration.test.ts`,
  `tests/unit/{inventario,pedidos}/schema/finished-products-and-content-copies-migration.test.ts`.
- Modificados: `db/schema.prisma`. Ampliaciones nombradas de tests que fijaban el esquema anterior:
  `tests/unit/inventario/schema/inventario-schema.test.ts`,
  `tests/unit/inventario/schema/inventory-movement-kind-consumption-migration.test.ts` (enum por
  prefijo), `tests/unit/pedidos/schema/pedidos-schema.test.ts`,
  `tests/guards/guard-identificador-de-request.test.ts` (`MIGRACIONES_ESPERADAS`).
- C2 aplicado: `product_batches_unit_cost_positive` pasa a `unit_cost > 0 OR (unit_cost = 0 AND
  package_content IS NOT NULL)` y nace `product_batches_package_content_requires_unit_cost`.
- Sobre `QuimiCloude_QC150`: `db:migrate` aplica las dos; `db:rollback` revierte T2 y luego T1;
  `db:migrate` las reaplica limpias. Guarda del `down.sql` de T1 y T2 probada contra Postgres real
  en transacción con `ROLLBACK`: falla con `23514`. Los 12 `CHECK`/índices nuevos probados igual.
  Plantilla regenerada (50 migraciones).
- Tests: `vitest run tests/unit/inventario tests/unit/pedidos tests/guards` → 175 archivos, 2540
  pasados, 13 skipped, 0 rojos. Typecheck limpio; lint 0 errores.

## T4 — Contenido de la presentación, backend (`e39c54e6`, backend_dev)

- Modificados: `lib/modules/inventario/domain/{presentation-input,presentation-view,presentation-catalog,create-presentation,update-presentation}.ts`,
  `lib/modules/inventario/ports/presentation-repository.ts`,
  `lib/modules/inventario/adapters/driven/persistence/{presentation-prisma,presentation-catalog-prisma}.ts`,
  `lib/modules/inventario/adapters/driving/presentation-actions.ts`.
- Tests nuevos o ampliados: `tests/unit/inventario/{presentation-input,presentation-prisma,presentation-catalog}.test.ts`,
  `tests/integration/inventario/presentation-content.int.test.ts` (declarado `commit` en
  `aislamiento.json`). Fixtures de 20 tests ajenos ampliados solo con `content` por tipos.
- Tests: 21 archivos afectados → 414/414; integración nueva 3/3; guardias de aislamiento y de ámbito
  de inventario 32/32. Typecheck limpio; lint 0 errores.

## T6 — Tipo de producto, backend (`583f4e98`, `335ce297`, `daa4b1b1`, `f480e5ce`, backend_dev)

- Modificados: `lib/modules/inventario/domain/{product-type,product-queryable,product-input,errors,update-product,product-catalog}.ts`,
  `lib/modules/inventario/ports/product-repository.ts`,
  `lib/modules/inventario/adapters/driven/persistence/{product-prisma,product-catalog-prisma}.ts`
  (`updateAliveProduct` bloquea la fila `FOR NO KEY UPDATE` y devuelve `'type_locked'`),
  `lib/modules/inventario/index.ts`, `lib/modules/errores/domain/{error-codes,error-catalog}.ts`
  (duodécima enmienda), `lib/modules/pedidos/domain/errors.ts` (`PresentationWithoutContentError`,
  `NoWholePackageError`), `app/(private)/inventario/components/product-type-tabs.tsx` (solo la
  etiqueta, para compilar).
- Tests: `tests/guards/guard-tipos-de-producto.test.ts` (4 tipos), `tests/unit/errores/catalogo.test.ts`,
  `tests/unit/inventario/{product-batch-input,product-service,product-catalog,product-prisma}.test.ts`,
  `tests/integration/inventario/product-type-lock.int.test.ts` (nuevo); fixtures de `ProductRef`
  ampliados en tests de pedidos, recetas y asignaciones.
- **Para el reviewer**: la edición de un producto terminado admite `name` + `qtyAlert` (misma forma
  que `PACKAGING`); la edición nunca escribió ni tipo ni unidad y sigue igual. El spec no dice nada
  más de la edición de un producto terminado.
- Tests: 71 archivos (inventario, errores y 5 guardias) → 1169 pasados, 5 skipped; integración 3/3.

## T4 — UI (`5a8d0074`, frontend_dev) · T4 cerrada

- Modificados: `app/(private)/configuracion/presentaciones/components/{presentation-form,presentation-columns,presentation-row-actions,presentation-list-skeleton,index}.tsx|ts`
  (los tres últimos, una línea cada uno: la precarga en edición y el conteo de columnas del esqueleto).
- Tests: `tests/unit/configuracion-ui/{presentation-columns,presentation-sheet}.test.tsx`.
- Tests: 6 archivos de presentaciones → 95/95; 6 guardias → 75/75;
  `configuracion-viewport.test.tsx` 16/16 (lo corrió el implementer).

## T6 — UI (`45f2ca6c`, frontend_dev) · T6 cerrada

- Modificado: `app/(private)/inventario/components/product-form.tsx` (opciones de
  `MANUAL_PRODUCT_TYPE_VALUES`; un producto terminado muestra su tipo de solo lectura y lo reenvía en
  un campo oculto). `product-type-tabs.tsx` no necesitó más que la etiqueta del backend.
- Tests: `tests/unit/inventario/product-page.test.tsx` → 76/76, incluido el de viewport de
  inventario; contratos de módulo `recetas` y `unidades` (fijan `ProductRef`) 13/13.

## T14 — Copia del contenido en el pedido (backend_dev) · T14 cerrada

- Modificados: `lib/modules/pedidos/domain/{order-view,create-order,update-order}.ts`,
  `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` (lectura en `ORDER_SELECT`/`toOrderRow`;
  escritura en `insertAliveOrder` y `updateAliveOrder`). El puerto no cambió de firma: la copia viaja
  en `NewOrder`/`OrderEdit`.
- Tests: `tests/unit/pedidos/{create-order,update-order}.test.ts`,
  `tests/integration/pedidos/order-content-copy.int.test.ts` (nuevo, `commit` en `aislamiento.json`);
  fixtures de `OrderRow` ampliados en `tests/helpers/order-unit-of-work-double.ts` y en 9 unit + 15
  integración de pedidos, sin cambiar lo que afirman.
- Tests: `tests/unit/pedidos` 69 archivos → 1060 pasados, 3 skipped (incluye
  `guard-ambito-empresa-pedidos`); `tests/integration/pedidos` 19 archivos → 194 pasados;
  `guard-aislamiento-integracion` 6/6.

## T10 — Prohibiciones, backend (`c0fa3445`, `a3fcb844`, backend_dev)

- Modificados: `lib/modules/inventario/ports/product-repository.ts`,
  `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
  (`findAliveIdByNameInPresentationUnit` devuelve `{ id, type }`; `addBatchToAlive` devuelve
  `'finished_product'` leyendo el tipo bajo su `FOR NO KEY UPDATE`; `adjustBatchStock` devuelve
  `'increase_not_allowed'` antes del `UPDATE`), `lib/modules/inventario/domain/{create-product,adjust-batch-stock}.ts`,
  `lib/modules/recetas/domain/{errors,create-recipe,update-recipe}.ts`, `lib/modules/recetas/index.ts`
  (`ActionNotAllowedError` propia). `batch-actions.ts` sin cambios: ya traduce por código.
- Tests: `tests/unit/inventario/{create-product,adjust-batch-stock,adjust-batch-stock-prisma}.test.ts`,
  `tests/unit/recetas/recipe-service.test.ts`,
  `tests/integration/inventario/finished-product-prohibitions.int.test.ts` (nuevo, `commit`),
  `tests/helpers/product-batch-result.ts` (nuevo); ajustes mecánicos de tipo en 6 integraciones de
  inventario y en `tests/integration/pedidos/order-ingredients-cost.int.test.ts`.
- R30: el selector de recetas ya pide un solo tipo (`PRODUCT` o `MACHINE`), así que nunca ofrece
  productos terminados. Falta su test de UI (encargado a frontend_dev).
- Tests: 10 unit → 240; 8 integración → 107; `order-ingredients-cost` 13/13; `vitest run guard`
  49 archivos → 619 pasados, 9 skipped. Typecheck limpio; lint 0 errores.

## R30 y R33 (`880beb5f`, `eebc80d1`, frontend_dev) · T10 cerrada

- R30: sin cambio de producción; `tests/unit/recetas-ui/recipe-lines-no-finished-product.test.tsx` (nuevo).
- R33 (parte de T11): `app/(private)/inventario/components/adjust-batch-dialog.tsx` (prop `productType`,
  texto «Solo se admiten ajustes que restan.») y `product-table.tsx` (pasa el tipo);
  `tests/unit/inventario/adjust-batch-dialog.test.tsx`.
- Tests: recetas-ui 3 archivos → 11; inventario (diálogo, panel, `product-page` con viewport) 3
  archivos → 104. Typecheck limpio.

## Estado al parar (2026-09-24)

- Cerradas: **T0, T1, T2, T4, T5, T6, T10, T14** (T3 cancelada en el spec).
- **T7 bloqueada por C12** (largo del nombre, decisión humana). En cascada: T8, T9, T11 (queda R25;
  R33 ya hecho), T12 y T13.
- Verificación final del implementer sobre `HEAD`: `pnpm run typecheck` limpio; `pnpm run lint` 0 errores,
  2 avisos preexistentes en `tests/unit/pedidos/order-service.test.ts`. El gate lo corre el leader.

## Mapa R<n> → test (parcial)

| R | Test |
|---|---|
| R1 | `tests/unit/inventario/schema/finished-product-enum-values-migration.test.ts` › R1 |
| R2 | `tests/unit/inventario/product-batch-input.test.ts` › R2; `tests/unit/inventario/product-service.test.ts` › R2 |
| R3 | `tests/unit/inventario/product-page.test.tsx` › R3 (4 casos) |
| R4 | `tests/unit/inventario/product-service.test.ts` › R4; `tests/integration/inventario/product-type-lock.int.test.ts` › R4 |
| R5 | `tests/unit/inventario/product-prisma.test.ts` › R5; `tests/unit/inventario/product-page.test.tsx` › R5 (2 casos) |
| R6 | `tests/unit/inventario/presentation-input.test.ts` › R6; `tests/integration/inventario/presentation-content.int.test.ts` › R6; schema de T2 (inventario) › R6 |
| R7 | `tests/unit/inventario/presentation-input.test.ts` › los seis rechazos (R7) |
| R8 | `tests/unit/configuracion-ui/presentation-sheet.test.tsx` › R8 (7 casos); `presentation-columns.test.tsx` › R8 |
| R9 | `tests/unit/{inventario,pedidos}/schema/finished-products-and-content-copies-migration.test.ts` › R6/R9 |
| R10, R11, R13, R16-R18, R20, R22-R24, R26, R27, R35, R37, R44 | **pendientes** (T7, T8, T9, T12) |
| R12, R14, R19 | `tests/unit/inventario/finished-goods.test.ts` › R12 (3), R14 (2), R19 — integración en T7/T8 pendiente |
| R15 | derogado |
| R21 | schema de T2 (inventario) › R21 — integración en T7/T8 pendiente |
| R25 | **pendiente** (T11, depende de T7) |
| R28 | `tests/unit/inventario/create-product.test.ts` › R28; `tests/integration/inventario/finished-product-prohibitions.int.test.ts` › R28 |
| R29 | `tests/unit/recetas/recipe-service.test.ts` › R29 |
| R30 | `tests/unit/recetas-ui/recipe-lines-no-finished-product.test.tsx` › R30 |
| R31, R32 | `tests/unit/inventario/{adjust-batch-stock,adjust-batch-stock-prisma}.test.ts`; `finished-product-prohibitions.int.test.ts` › R31, R32 |
| R33 | `tests/unit/inventario/adjust-batch-dialog.test.tsx` › R33 |
| R34 | schema de T2 (inventario y pedidos) › R34 |
| R36 | schema de T1 y T2 › R36; guarda probada contra Postgres real |
| R38, R39 | `tests/unit/pedidos/{create-order,update-order}.test.ts`; `tests/integration/pedidos/order-content-copy.int.test.ts` |
| R40 | `tests/integration/inventario/presentation-content.int.test.ts` › R40; `order-content-copy.int.test.ts` › R40 |
| R41 | `tests/unit/inventario/finished-goods.test.ts` › R41 — integración en T7 pendiente |
| R42 | `finished-goods.test.ts` › R42 (2); `tests/unit/pedidos/{order-cost,resolve-ingredients-cost}.test.ts` — Finalizar en T8 pendiente |
| R43 | `tests/unit/pedidos/order-cost.test.ts` › R43 — Finalizar en T8 pendiente |

## Vuelta 2 (2026-09-24): D22 y rojos del `--rapido` del leader en `7100b08f`

- **D22** (`edcb8fcc`, humano): tope del nombre de producto a 200. Desbloquea T7.
- **Rojo a)** `tests/integration/proveedores/company-scope.int.test.ts` (R10 de QC-59, `2BP01` sobre
  `presentations_company_id_id_key`). Causa: el test detecta las migraciones posteriores que
  dependen de esa clave buscando el texto exacto `REFERENCES "presentations" ("company_id", "id")`,
  con espacio, y la migración nueva lo escribe sin espacio: no se detectaba y su `down.sql` no corría
  antes. Se arregla en el test (detección tolerante al espacio), sin tocar la migración ya aplicada.
- **Rojo b)** `tests/unit/configuracion-ui/user-table.test.tsx` › «la accion de editar de una fila
  abre el panel SOBRE ESE usuario (R26)». Aislado **7 corridas: 6 verdes y 1 roja**; la roja coincidió
  con otro subagente ejecutando tests en paralelo, y en las 4 corridas con captura de log no apareció
  el error. Ningún archivo que importa el test (`configuracion/usuarios`, `data-table`, `identity`,
  `lib/shared/{pagination,routes}`, helpers) está en el diff de la rama. **Flake ajeno, el de QC-126**
  (pendiente en el board); no está en `tests/baseline-rojos.json`. No se toca.
- `scripts/_tmp-guard-check.ts`: no existe en el worktree; nada que borrar.

### D22 y rojo a) (`e32e7547`, `7474b3de`, backend_dev)

- D22: `lib/modules/inventario/domain/product-input.ts` (`productNameSchema` hasta 200) y el mensaje de
  `app/(private)/inventario/components/product-form.tsx`. Tests: `tests/unit/inventario/{product-input,product-service}.test.ts`,
  `product-page.test.tsx` (201 rechazado en pantalla), y `tests/integration/inventario/product-batch-write.int.test.ts`
  › D22 (183 caracteres guardados completos en Postgres).
- Rojo a): `tests/integration/proveedores/company-scope.int.test.ts` detecta con una regex tolerante
  al espacio y fija que `20260924120100_finished_products_and_content_copies` es dependiente. 29/29 verde.
- Tests: `product-input`, `product-service`, `product-page` 107/107; `product-batch-write` 12/12.
- **Rojo nuevo que no había visto nadie**: `tests/integration/inventario/inventario-constraints.int.test.ts`
  (3 casos), cuyo censo del esquema real de `products` no incluye lo que añadió T2. Encargado aparte.
- Censo arreglado (`a43f161b`): `inventario-constraints.int.test.ts` gana las dos columnas, las dos
  FK y el `CHECK` de identidad de `products`; 19/19. Los demás censos del esquema real (pedidos,
  recetas, proveedores, unidades y otros cinco de inventario) ya estaban verdes sin cambios.

## T7 — La escritura del producto terminado (`6a4349c2`..`8f8a65f4`, backend_dev) · T7 cerrada

- Nuevos: `lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma.ts`
  (`createFinishedGoodsIntake(tx)`), `tests/unit/inventario/finished-goods-prisma.test.ts`,
  `tests/integration/inventario/finished-goods.int.test.ts` (`commit` en `aislamiento.json`).
- Modificados: `lib/modules/inventario/domain/{finished-goods,inventory-movement,product-batch-view}.ts`,
  `lib/modules/inventario/index.ts`, `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
  (`receiveFinishedGoods`, pasos 1-7 de `design.md > 4.4`), `tests/guards/guard-libro-de-inventario.test.ts`
  y `tests/unit/inventario/qc121-alcance.test.ts` (cinco caminos: los dos censos de escritura de
  lotes), fixtures de `ProductBatchView` (`packageContent: null`) en 4 tests de inventario.
- Largo del nombre: con D22 cabe entero (183 ≤ 200); el test de integración guarda uno de 183.
- `ON CONFLICT ... WHERE type = 'FINISHED_PRODUCT'` lleva el literal sin parametrizar (Postgres
  resuelve el índice parcial al analizar la sentencia), derivado de `PRODUCT_TYPES` con `Prisma.raw`
  para no romper `guard-tipos-de-producto`.
- La guardia del libro ya tenía el caso rojo con un camino fabricado sin asiento (`:312`).
- Tests: `vitest run tests/unit/inventario tests/guards tests/integration/inventario` → 131 archivos,
  1801 pasados, 10 skipped (`finished-goods.int.test.ts` 9 casos). Typecheck limpio; lint 0 errores.

## T11 — R25 (`fd19010f`, frontend_dev) · T11 cerrada (R33 ya estaba en `eebc80d1`)

- `app/(private)/inventario/components/product-batches-panel.tsx`: «N envases» («1 envase») junto a la
  cantidad si `stock / packageContent` es entero exacto (BigInt a escala 4); nada en otro caso.
- Tests: `tests/unit/inventario/product-batches-panel.test.tsx` › R25 (4 casos). Ojo: en ese archivo
  ya había un caso con «(R25)» de otra ficha (objetivo táctil); se dejó igual.
- `product-batches-panel`, `product-batches-sheet`, `product-page` (viewport) → 98/98.

## T8 — Engancharlo al Finalizar, backend (`88bf0067`..`af296973`, backend_dev)

- Modificados: `lib/modules/pedidos/domain/{transition-order,order-catalog}.ts`,
  `lib/modules/pedidos/ports/order-unit-of-work.ts` (`finishedGoods`), `lib/modules/pedidos/index.ts`,
  `lib/composition/index.ts` (`createFinishedGoodsIntake(tx)`; `recipes`/`products`/`units` a
  `createTransitionOrder`), `lib/modules/asignaciones/domain/{errors,finish-assigned-order}.ts`,
  `lib/modules/asignaciones/index.ts`, `lib/modules/asignaciones/adapters/driving/order-execution-actions.ts`,
  `lib/shared/routes.ts` (`entregado_envases`, `entregado_producto`).
- Pasa a ENTREGADO → `{ kind: 'ok', finishedGoods }`; otros destinos siguen devolviendo `'ok'`.
- Tests: `tests/unit/pedidos/transition-order.test.ts`, `tests/unit/asignaciones/{finish-assigned-order,order-execution-actions}.test.ts`,
  `tests/integration/pedidos/finish-with-finished-goods.int.test.ts` (nuevo); `tests/helpers/order-unit-of-work-double.ts`
  (`fakeFinishedGoodsIntake`, lanza si se llama sin configurar); ámbitos a mano en 7 integraciones de pedidos
  y dobles de `transitionAliveById` en 2 de asignaciones; `order-reservation.int.test.ts` siembra
  contenido `1.0000`; `guard-ambito-empresa-pedidos` acepta el cableado nuevo.
- **Para el reviewer**: «un ingrediente sin lotes cuenta como cero» (R42 con importe nulo) no llega
  a Finalizar en integración, porque QC-141 no deja finalizar un pedido si falta material. Queda cubierto en unit
  (`resolve-ingredients-cost`, `order-cost`, `transition-order`); la integración del importe nulo usa
  una receta cambiada tras el alta.
- Tests: `vitest run tests/unit/pedidos tests/unit/asignaciones tests/integration/pedidos
  tests/integration/asignaciones guard` → 191 archivos, 2554 pasados, 12 skipped.

## T9 — R27 (`55575d4a`, backend_dev) · T9 cerrada

- Solo tests; producción ya lo cumplía (QC-145): `updateOrderSchema` no declara `status`,
  `update-order.ts` hace `assertTransition(row.status, row.status)` y `ENTREGADO` no admite ninguna
  transición. El formulario de Pedidos ya no pinta el select de estado
  (`e2e/pedidos-terminados.spec.ts:641` lo afirma).
- Tests: `tests/unit/pedidos/update-order.test.ts` › R27 (3 casos, incluido el de la cláusula de T9:
  un pedido `ENTREGADO` rechaza la edición con `invalid_transition`);
  `tests/integration/pedidos/finish-with-finished-goods.int.test.ts` › R27 (edición real: ni
  producto, ni lote con `package_content`, ni asiento `production`, ni consumo). 43/43 con la
  guardia de aislamiento.
- Incidente sin pérdida: frontend_dev hizo `reset --hard HEAD~1` sobre su propio commit
  (`5790736e`), que había arrastrado los archivos de T9 sin commitear, y lo rehízo como `2bbdf3e8`
  sin ellos. Comprobado con el reflog: no se perdió ningún commit.

## T8 UI, fixtures E2E y T12 (`9e4e4e73`, `2bbdf3e8`, `ae9208d2`, frontend_dev) · T8 cerrada

- UI: `app/(private)/asignacion/components/{assigned-order-delivered-notice.tsx,index.ts}`,
  `app/(private)/asignacion/page.tsx` (lee `entregado_envases`/`entregado_producto`).
  `order-execution-screen.tsx` sin cambios: ya pinta el mensaje del catálogo para cualquier código.
- Tests: `tests/unit/asignaciones-ui/{assigned-orders-delivered-notice,order-execution-screen}.test.tsx`;
  `tests/unit/asignaciones*` 39 archivos → 616 pasados.
- **Fixtures E2E con contenido sembrado** (lo pide T8): `e2e/ejecucion-receta.spec.ts` (contenido `1`
  en la presentación, y el pedido sembrado gana `presentationId` y `presentationContent`) y
  `e2e/reserva-de-material.spec.ts` (contenido `1`; el pedido lo crea la UI, que ya copia).
  `pedidos-asignados` y `pedidos-terminados` siembran `ENTREGADO` por Prisma y no pasan por Finalizar.
- **T12**: `e2e/producto-terminado.spec.ts` (R37), el recorrido de `design.md > 8` entero. Se lista con
  `playwright test --list` (chromium y webkit). **No se ha corrido**: lo corre el leader con
  `pnpm exec playwright test e2e/producto-terminado.spec.ts e2e/ejecucion-receta.spec.ts e2e/reserva-de-material.spec.ts`
  contra `QuimiCloude_QC150`. T12 queda sin marcar hasta verlo verde.

## T13 — Documentación y trazabilidad

- `docs/architecture.md` (`840ce301`): la pregunta 2 del dominio gana el párrafo de la entrada por
  producción y el cuarto tipo de producto.
- `docs/dependencias.md`, `package.json` y `pnpm-lock.yaml` sin cambios en la rama.
- Ningún `it.todo` ni `skip` en los archivos nuevos de la ficha.
- Base propia `QuimiCloude_QC150` anotada arriba para borrarla al cerrar.
- Sin marcar: su criterio exige `./init.sh` completo verde, que corre el leader.

## Estado final de esta vuelta (2026-09-24)

- Cerradas: **T0, T1, T2, T4, T5, T6, T7, T8, T9, T10, T11, T14** (T3 cancelada).
- Pendientes del gate del leader: **T12** (E2E) y **T13** (`./init.sh` completo).
- `HEAD`: `pnpm run typecheck` sale con 0; `pnpm run lint` 0 errores, 2 avisos preexistentes en
  `tests/unit/pedidos/order-service.test.ts`. Árbol limpio.

## Mapa R<n> → test (final; sustituye al parcial de arriba)

| R | Test |
|---|---|
| R1 | `tests/unit/inventario/schema/finished-product-enum-values-migration.test.ts` › R1 |
| R2 | `tests/unit/inventario/product-batch-input.test.ts` › R2; `tests/unit/inventario/product-service.test.ts` › R2 |
| R3 | `tests/unit/inventario/product-page.test.tsx` › R3 (4 casos) |
| R4 | `tests/unit/inventario/product-service.test.ts` › R4; `tests/integration/inventario/product-type-lock.int.test.ts` › R4 |
| R5 | `tests/unit/inventario/product-prisma.test.ts` › R5; `tests/unit/inventario/product-page.test.tsx` › R5 |
| R6 | `tests/unit/inventario/presentation-input.test.ts` › R6; `tests/integration/inventario/presentation-content.int.test.ts` › R6; `tests/unit/inventario/schema/finished-products-and-content-copies-migration.test.ts` › R6 |
| R7 | `tests/unit/inventario/presentation-input.test.ts` › seis rechazos (R7) |
| R8 | `tests/unit/configuracion-ui/presentation-sheet.test.tsx` › R8; `presentation-columns.test.tsx` › R8 |
| R9 | `tests/unit/{inventario,pedidos}/schema/finished-products-and-content-copies-migration.test.ts` › R6/R9 |
| R10 | `tests/unit/pedidos/transition-order.test.ts` › R10, R41; `tests/integration/pedidos/finish-with-finished-goods.int.test.ts` (producto nuevo al Finalizar) |
| R11 | `tests/integration/inventario/finished-goods.int.test.ts` › R11… (nace) y reutilización; `e2e/producto-terminado.spec.ts` |
| R12 | `tests/unit/inventario/finished-goods.test.ts` › R12 (3 casos) |
| R13 | `finished-goods.int.test.ts` › caso R11, R13, R16, R17, R41, R43 |
| R14 | `tests/unit/inventario/finished-goods.test.ts` › R14 (2 casos) |
| R15 | derogado (D13) |
| R16, R17 | `finished-goods.int.test.ts` › caso R11, R13, R16, R17, R41, R43 |
| R18 | `transition-order.test.ts` › R18; `finish-with-finished-goods.int.test.ts` (sin copia ni contenido); `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` › R18, R19 |
| R19 | `finished-goods.test.ts` › R19; `transition-order.test.ts` › R19, R20; `order-execution-screen.test.tsx` › R18, R19 |
| R20 | `transition-order.test.ts` › R18, R20 y R19, R20; `finish-with-finished-goods.int.test.ts` (fallo forzado tras el lote) |
| R21 | `finished-goods.int.test.ts` › segunda llamada con el mismo pedido; `finish-with-finished-goods.int.test.ts` › dos Finalizar seguidos y a la vez; schema de T2 › R21 |
| R22 | `finished-goods.int.test.ts` › dos conexiones reales |
| R23 | `finished-goods.int.test.ts` › dos empresas |
| R24 | `tests/unit/asignaciones/finish-assigned-order.test.ts` › R24; `order-execution-actions.test.ts`; `finish-with-finished-goods.int.test.ts` › R24; `tests/unit/asignaciones-ui/assigned-orders-delivered-notice.test.tsx` › R24 |
| R25 | `tests/unit/inventario/product-batches-panel.test.tsx` › R25 (4 casos) |
| R26 | `finish-assigned-order.test.ts` (permiso antes de leer); `finish-with-finished-goods.int.test.ts` › R26 |
| R27 | `tests/unit/pedidos/update-order.test.ts` › R27 (3); `finish-with-finished-goods.int.test.ts` › R27 |
| R28 | `tests/unit/inventario/create-product.test.ts` › R28; `tests/integration/inventario/finished-product-prohibitions.int.test.ts` › R28 |
| R29 | `tests/unit/recetas/recipe-service.test.ts` › R29 |
| R30 | `tests/unit/recetas-ui/recipe-lines-no-finished-product.test.tsx` › R30 |
| R31, R32 | `tests/unit/inventario/{adjust-batch-stock,adjust-batch-stock-prisma}.test.ts`; `finished-product-prohibitions.int.test.ts` › R31, R32 |
| R33 | `tests/unit/inventario/adjust-batch-dialog.test.tsx` › R33 |
| R34 | schema de T2 (inventario y pedidos) › R34 |
| R35 | `finished-goods.int.test.ts` › tras la baja nace uno nuevo |
| R36 | schema de T1 y T2 › R36 |
| R37 | `e2e/producto-terminado.spec.ts` › R37 (**sin correr**) |
| R38, R39 | `tests/unit/pedidos/{create-order,update-order}.test.ts`; `tests/integration/pedidos/order-content-copy.int.test.ts` |
| R40 | `presentation-content.int.test.ts` › R40; `order-content-copy.int.test.ts` › R40 |
| R41 | `finished-goods.test.ts` › R41; `finished-goods.int.test.ts` (el lote guarda su contenido) |
| R42 | `finished-goods.test.ts` › R42; `tests/unit/pedidos/{order-cost,resolve-ingredients-cost}.test.ts`; `transition-order.test.ts` › R42 (guardado y nulo); `finish-with-finished-goods.int.test.ts` (importe guardado y nulo) |
| R43 | `order-cost.test.ts` › R43; `finished-goods-prisma.test.ts` (coste cero, nunca sin `unit_cost`); `transition-order.test.ts` › R42, R43; `finish-with-finished-goods.int.test.ts` (el pedido sigue con importe nulo) |
| R44 | `finished-goods.int.test.ts` › sin copia usa el vigente / sin copia ni contenido rechaza |
| D22 | `tests/unit/inventario/product-input.test.ts` › D22 (200/201 y 183 en alta y edición); `product-service.test.ts` › D22; `tests/integration/inventario/product-batch-write.int.test.ts` › D22; `finished-goods.int.test.ts` (nombre compuesto de 183) |

## Vuelta 3 (2026-09-24): rojos del E2E del leader en `e5a4311f`

- Leader: 6 rojos (3 specs × chromium/webkit) contra `QuimiCloude_QC150`.
- **Limpieza por FK** (`243b32f0`, `45a8ed51`, `ca20b97a`, frontend_dev): `e2e/{ejecucion-receta,reserva-de-material,producto-terminado}.spec.ts`
  borran primero movimientos y lotes de la empresa, luego el producto terminado (por `recipeId`),
  la receta y el resto de productos (el de fórmula sigue atado por `recipe_lines` hasta que cae la
  receta). La limpieza de huérfanos de `beforeAll` sigue el mismo orden, filtrando por prefijo y
  empresa sembrados.
- **R38 en el E2E**: `presentationContent` se compara por valor (`Decimal.equals`), no como texto.
- Corrida 2 (`scratchpad/qc150-e2e-v2.log`): **8 passed, 2 failed**. `ejecucion-receta` 4/4 y
  `reserva-de-material` 2/2 verdes en los dos navegadores. `producto-terminado` (R37) rojo en los dos por
  otra causa, que antes quedaba tapada: tras Finalizar, la fila del producto terminado no aparece en
  Inventario (pestaña «Producto terminado» con búsqueda) en 60 s, aunque el producto existe en base.
  En diagnóstico. Puerto 3117 libre antes y después.
- **Causa del rojo de R37** (`1b4d06fd`, frontend_dev): era del test. La celda de nombre de Inventario
  pinta «<nombre> · <símbolo de unidad>» para todo producto con unidad (`product-columns.tsx`,
  comportamiento de antes), y el producto terminado lleva la unidad de la presentación (`l`). El
  test exigía el texto exacto sin sufijo. Ahora exige el nombre completo al principio y admite solo
  un sufijo « · <unidad>». El nombre guardado se sigue comprobando exacto por Prisma.
- Corrida 3 (`scratchpad/qc150-e2e-v3.log`): **9 passed, 1 failed**. `producto-terminado` verde en
  chromium y webkit; `reserva-de-material` verde en los dos; `ejecucion-receta` verde en chromium y
  en webkit R30 y R9. El rojo, R29 en webkit, fue `waitForURL` tras Finalizar a los 60 s, con el
  servidor dando `Error: aborted` y `destination stream closed early` bajo carga (2,3 min frente a
  1,4 min en chromium). Ya había pasado en la corrida 2.
- Corrida 4, solo R29 en webkit (`scratchpad/qc150-e2e-v4-r29.log`, implementer): **1 passed**
  (19,1 s). Rojo de carga, no de la rama. Puerto 3117 libre antes y después de cada corrida.
- **T12 cerrada.** T13 queda a falta del `./init.sh` completo del leader.

## Vuelta 4 (2026-09-24): censos cerrados del `./init.sh` completo del leader en `5082deac`

- Leader: 9545 verdes y 4 rojos nuevos, todos listas cerradas que la rama amplía. Ampliadas con su
  motivo, en el estilo de cada archivo, y sin aflojar la igualdad exacta (backend_dev, un commit por archivo):
  - `tests/guards/guard-identificador-de-request.test.ts` (`ded1ba24`): `producto-terminado.spec.ts`
    en `E2E_ESPERADOS`. El test sustituto que exige la guardia
    (`tests/unit/identity/route-guard-request-id.test.ts`) ya existía y no cambia.
  - `tests/unit/inventario/scope.test.ts` (`1129f9ae`): cuarto spec que casa con el patrón de
    catálogo; no es una segunda pantalla de catálogo.
  - `tests/unit/shared/data-table-alcance.test.ts` (`b9429079`): de 21 a 22 E2E con data-table.
  - `tests/unit/recetas-ui/recipe-route-contract.test.ts` (`090a2a92`): `DELIVERED_ORDER_PACKAGES_PARAM`
    y `DELIVERED_ORDER_PRODUCT_PARAM`.
- Verificación, solo esos 4 archivos: **4 archivos, 67 pasados, 2 skipped** (ninguno añadido por la
  rama); eslint limpio.
- T13 sigue a falta de un `./init.sh` completo verde del leader.

## Vuelta 5 (2026-09-24): review RECHAZADO (`progress/review_QC-150-producto-terminado.md`, `6576626a`)

- **B3 + merge de `dev`** (backend_dev). Nuestras dos migraciones se revirtieron sobre `QuimiCloude_QC150`.
  Antes hubo que borrar 10 `products` `FINISHED_PRODUCT` de empresas de fixture E2E (`qc141_e2e_*`,
  `qc150_e2e_*`, `qc63_e2e_*`), sin lotes ni asientos; ninguno de empresa real. Merge `eb326a95`, con 3
  conflictos resueltos sin ambigüedad: `docs/architecture.md` (versión de dev + nuestro párrafo),
  `MIGRACIONES_ESPERADAS` (las de las dos ramas) y `data-table-alcance` (dev quita
  `aislamiento-proveedores`, nosotros sumamos `producto-terminado`: se queda en 21). Renombradas en
  `89754188` a **`20260924130000_finished_product_enum_values`** y
  **`20260924130100_finished_products_and_content_copies`** (la última de dev es
  `20260924120000_customers`). `db:migrate` al día (51); cliente, typegen y plantilla
  (`qct_tpl_c15c5644c9a4`) regenerados. `pnpm install --frozen-lockfile` sincronizó
  `react-intersection-observer`, que ya venía aprobada en dev (QC-140). Los 8 archivos afectados: 132/132.
- **D23** (`1dce4135`): decisión humana registrada al final de `requirements.md`.
- **B1** (`571f6400`, `3479dfcf`, `aed97b1d`, `1df98667`, `0303d214`, backend_dev): 54 líneas de
  comentario de producción con cita → 0 (filtro sobre el diff contra el merge-base con `origin/dev`).
  Solo comentarios; los que venían de dev no se tocaron. Tests de esquema 42/42.
- **B2** (`1b963dd5`): `tests/integration/inventario/finished-goods.int.test.ts` › «R23 — acceso cruzado». La empresa B
  pasa el `presentationId` de A y obtiene `presentation_without_content`; productos, lotes y asientos de
  las dos empresas no cambian.
- **m9, sin arreglar y para el leader**: con su presentación pero el `recipeId` de A, la empresa B **sí
  escribe** un producto terminado propio con `recipe_id` de otra empresa (lo probó una sonda efímera,
  retirada). La FK `products_recipe_id_fkey` es simple. Hoy lo cubre el único llamante, que toma la
  receta del pedido bloqueado por empresa. No hay test permanente: fijar esa escritura sería
  consagrarla.
- **m2** (`8977b31f`): `finish-with-finished-goods.int.test.ts` › R42. Un ingrediente `MACHINE` con
  lote en existencia y `unit_cost` nulo (y con presentación, sin la cual la reserva lo da por
  insuficiente) cuenta cero; el pedido sigue con importe nulo (R43).
- **D23** (`9b3303c2`): `product-type-lock.int.test.ts` › «D23 — editar un producto terminado con su
  mismo tipo…» (el caso de `:155`, renombrado) y «D23 — renombrar un producto terminado y volver a
  recibir la misma combinación suma el lote al mismo producto».
- **m3**: los dos «R25» ajenos (`product-batches-panel.test.tsx:241`, `adjust-batch-dialog.test.tsx:327`)
  vienen de `7db6944a` (QC-92), ya en dev antes de la rama: no se tocan.
- **m5** (`52f2a483`): de 49 comentarios con cita en tests y e2e añadidos por la rama a 0. Queda un falso
  positivo en `product-page.test.tsx` (una cita a R20 que ya venía de dev, en una línea cambiada).
- Tests de B2, m2, D23 y m5, en serie: 516 pasados, 2 skipped.
- **E2E**, una corrida de los tres specs (`scratchpad/qc150-e2e-v5.log`): 9 passed y 1 failed, R37 en
  webkit, con `goto('/login')` interrumpido por una redirección de la página anterior tras
  `clearCookies`. Arreglado en el spec con `goto('about:blank')` antes de cada cambio de sesión
  (`5d3d77c4`). `producto-terminado` repetido (`qc150-e2e-v6.log`): 2/2 en chromium y webkit. Puerto 3117 libre
  antes y después de cada corrida.
- **Rojo que no es de esta ficha (para el leader)**: `tests/unit/proveedores-ui/guard-convenciones-showcase.test.ts`
  › «R29: el diff de la rama contra origin/dev no añade ningun archivo bajo db/» (QC-140, llegó con el
  merge). Compara la rama en curso contra `origin/dev`, así que se pone rojo en **cualquier** rama que
  añada una migración mientras tenga commits propios. No se toca: su alcance es de QC-140.

## Vuelta 6 (2026-09-24): decisiones humanas sobre m9 y la guardia de QC-140

- **D24** (m9), registrada en `requirements.md`. `receiveFinishedGoods` (`product-prisma.ts`) comprueba,
  como primer paso y antes de leer la presentación, que la receta sea de la empresa (`SELECT` sobre
  `recipes` filtrado por `company_id`, en la misma transacción). Si no lo es, devuelve
  `{ kind: 'recipe_not_found' }` sin escribir nada. `pedidos` lo convierte en su `RecipeNotFoundError`
  y `asignaciones` gana la suya; las dos llevan el código **existente** `recipe_not_found`, así que
  no se amplía el catálogo (`ee008498`).
  - Tests (`584cb77c`): `tests/integration/inventario/finished-goods.int.test.ts` › «R23, D24 — la
    empresa B con su propia presentacion y el recipeId de la empresa A no escribe nada en ninguna de
    las dos»; `tests/unit/inventario/finished-goods-prisma.test.ts` › «sin fila de receta de la
    empresa: rechaza sin escribir nada…»; `tests/unit/pedidos/transition-order.test.ts` › «D24:
    recipe_not_found del alta de inventario deshace la transaccion entera».
- **Arreglo de deuda ajena, para decirlo en el PR** (`ae5597ce`):
  `tests/unit/proveedores-ui/guard-convenciones-showcase.test.ts`, casos R29 (nada bajo `db/`) y D20
  (`entity-image.tsx` intocado), de QC-140. Comparaban todo el diff de la rama en curso contra
  `origin/dev`, así que se ponían rojos en cualquier rama con migraciones. Ahora miran solo los
  archivos de los commits firmados `QC-140` del rango, más el árbol sin commitear, el mismo patrón que
  `guard-convenciones-proveedores.test.ts`. Sin commits de QC-140 en el rango (ya mergeada), hacen
  `ctx.skip` con motivo, en vez de pasar en verde sin mirar. En la rama de QC-140 siguen mordiendo
  igual.
- Tests, en serie: `finished-goods.int` 11, `finished-goods-prisma` 7, `transition-order` 15,
  `finish-assigned-order` 17 (sin cambios), `guard-convenciones-showcase` 4 pasados y 2 skipped con
  motivo; guardias de módulos, ámbito de inventario y de pedidos, catálogo de errores y libro: 174/174.
  Typecheck y lint salen con 0. No se repitió el E2E: el Finalizar feliz no cambia.

## Vuelta 7 (2026-09-24): review vuelta 2 RECHAZADO por B4 (`0a651347`)

- **Corrección a la vuelta 6:** el D24 de la vuelta 6 hacía que `inventario` leyera la tabla `recipes`
  con SQL crudo (violaba «ningún módulo consulta un modelo ajeno»), y su comentario citaba un precedente
  que no existía. Retirado.
- **B4** (`7b23af62`, `76966d5c`): la comprobación de D24 está ahora en `pedidos/domain/transition-order.ts`,
  rama `ENTREGADO`, justo después del rechazo por falta de presentación y **antes** del coste del lote,
  del consumo y de `setStatus`. Usa `deps.recipes.findRefsIncludingDeleted([recipeId], companyId)`:
  acotado por empresa y con las recetas borradas incluidas, así que una receta dada de baja después del
  alta no rechaza. Sin referencia → `RecipeNotFoundError`; el nombre de la receta que se pasa a la producción sale de esa misma
  lectura. `inventario` pierde la consulta y el `kind: 'recipe_not_found'` de `FinishedGoodsOutcome`;
  `grep '"recipes"' lib/modules/inventario` sale vacío. Texto de D24 enmendado en `requirements.md`.
  - Tests de D24: `tests/integration/pedidos/finish-with-finished-goods.int.test.ts` › «R23, D24 — un
    pedido de la empresa B con su presentación y el recipeId de la empresa A se rechaza con
    recipe_not_found y no escribe nada en ninguna empresa» (el pedido sigue `PENDIENTE`; conteos de
    las dos empresas iguales); `tests/unit/pedidos/transition-order.test.ts` › «D24: sin receta de la
    empresa en el catalogo global, rechaza ANTES de consumir y no escribe nada». Se retiran los casos
    de inventario que probaban la consulta quitada.
- **n3** (`604ebc51`): `tests/unit/asignaciones/finish-assigned-order.test.ts` › «D24: `recipe_not_found`
  se traduce a RecipeNotFoundError, sin reintentar».
- **n1** (`88ad567e`): la cuenta de «49 → 0» de la vuelta 5 **era falsa**: aquel filtro no veía las
  líneas que abren con `/**`. Contado ahora con un tokenizador de comentarios sobre las líneas añadidas
  por la rama: 31 → 11. Se limpiaron las 21 del alcance, en 13 archivos. Las 11 que quedan son a
  propósito:
  - 10 en `tests/unit/proveedores-ui/guard-convenciones-showcase.test.ts`, que nombran `QC-140` porque
    es el dato que filtra la guardia, no una cita;
  - 1 en `tests/unit/inventario/product-page.test.tsx`, una cita a R20 que ya venía de dev y que el diff
    marca porque la rama cambió el número de la misma frase.
- **n2** (`df6d0894`): la guardia de QC-140 filtra los commits por asunto con `/^\w+\(QC-140\)/`, no
  por cualquier mensaje que nombre la ficha. En esta rama R29 y D20 se **saltan** con motivo (4
  pasados y 2 skipped); antes corrían por culpa de `ae5597ce`. En el PR hay que decir que se tocó un
  test de otra ficha.
- Tests, en serie: `transition-order` 15, `finish-assigned-order` 18, `finished-goods-prisma` 6,
  `finished-goods.int` 10, `finish-with-finished-goods.int` 12, guardias de módulos y de ámbito
  125/125, más los 13 archivos de n1 (6 unit, 99 pasados; 6 de integración, todos verdes).
  Typecheck y lint salen con 0. Sin E2E.

## F2.3 (2026-09-24): merge de `origin/dev` antes del PR (QC-153 #117, QC-158 #119)

- Merge `a8aefc16` (backend_dev). 7 conflictos, todos resueltos sin ambigüedad:
  - `guard-identificador-de-request` (`MIGRACIONES_ESPERADAS` con las de las dos ramas);
  - tres integraciones de pedidos (imports de las dos ramas);
  - `quote-order-cost.test.ts` (el doble de `PresentationCatalog` lleva `content` y `findByNormalizedNames`);
  - `data-table-alcance` (20 → 21 con `catalogo-desde-pdf`, 21 → 22 con `producto-terminado`);
  - `guard-convenciones-showcase`.
- **Para el leader, sobre `guard-convenciones-showcase`:** `dev` traía (`b37929e8`) un parche sobre la
  función vieja `baseDeFusionOMuda`, que comprobaba el nombre de rama `feature/QC-140-`. Esta rama ya la había
  sustituido entera por el filtro de commits firmados `tipo(QC-140)` más el árbol sin commitear. Se
  conservó la versión de la rama: la de dev habría dejado `baseDeFusionOMuda` sin llamantes, y el filtro
  por commits cubre lo mismo sin depender del nombre de la rama. R29 y D20 se saltan con motivo.
- **Migraciones renombradas otra vez**: `dev` trae `20260924180000_supplier_catalog_line_material_and_measurements`,
  posterior a las de la ficha. Revertidas en `QuimiCloude_QC150` sin tener que borrar nada;
  `ff8d1915` las renombra a **`20260924190000_finished_product_enum_values`** y
  **`20260924190100_finished_products_and_content_copies`**, y actualiza
  `tests/integration/proveedores/company-scope.int.test.ts` (y el censo de la guardia, ya en el merge). `db:migrate`
  aplica las tres; `migrate status` al día; cliente, typegen y plantilla (`qct_tpl_a0eeaf1c4c63`, 52)
  regenerados.
- `83fb4b84`: `dev` amplió `PresentationCatalog` con `findByNormalizedNames`, y dos integraciones de la
  ficha que no chocaban dejaban de compilar; completados sus dobles.
- El merge no toca los E2E de la ficha (solo trae `e2e/catalogo-desde-pdf.spec.ts` de QC-158): sin E2E.
- Verificación: typecheck sale con 0; lint 0 errores; `vitest run tests/guards` 43 archivos → 560
  pasados, 5 skipped. En serie, los 7 archivos con conflicto, `company-scope.int` y los 3 de esquema de
  la ficha, todos verdes.

### F2.3, gate completo del leader en `3f590fb6`: 1 rojo ajeno de 10007

- **Arreglo de deuda ajena, para decirlo en el PR** (`338b6678`): `tests/unit/documentos/qc158-alcance.test.ts`,
  R36a de QC-158, exigía que el diff de la rama en curso trajera algo bajo
  `specs/QC-158-catalogo-desde-pdf/`, y fallaba en cualquier otra rama. Es el mismo defecto que la
  guardia de QC-140. Mismo patrón: esa aserción pasa a un caso propio que mira solo los commits
  firmados `tipo(QC-158)` del rango más el árbol sin commitear, y sin ninguno hace `ctx.skip` con
  motivo. Lo que no depende de la rama sigue corriendo siempre: nada versionado bajo
  `borradores-de-prompts/`, R36b, R36c, los detectores y la precondición de rama. R36d ya se saltaba
  bien y no se tocó.
- Verificación: el archivo da 8 pasados y 3 skipped con motivo; `tests/guards` 560 pasados, 5
  skipped; eslint limpio; typecheck sale con 0.

## F2.3 (2) (2026-09-24): segundo merge de `origin/dev` (QC-142, PR #120)

- Merge `a0f5912d` (implementer). Un conflicto, `tests/unit/documentos/qc158-alcance.test.ts`.
- **Corrección, para el PR:** las dos guardias ajenas que esta rama arreglaba ya las arregló QC-142 en
  `dev`: `qc158-alcance.test.ts` (su `b23b7569`) y el centinela de `db/` de
  `guard-convenciones-showcase.test.ts` (su `e476cfd1`). En los dos archivos se conserva **la versión de
  `dev`**, idéntica a `origin/dev`, y se descartan nuestros cambios (`ae5597ce`, `df6d0894`,
  `1f53a137`, `338b6678`). **Esta rama ya no arregla deuda ajena**: lo que dicen de ella la vuelta 6,
  la vuelta 7 (n2) y la sección F2.3 anterior queda superado. En esta rama, las versiones de `dev` dan:
  `qc158-alcance` 8 pasados y 3 skipped; `guard-convenciones-showcase` 4 pasados y 2 skipped.
- Migración nueva de dev, `20260924130000_documents_permissions`: anterior a las de la ficha
  (`20260924190000`/`190100`), así que no se renombra nada. `db:migrate` la aplica en `QuimiCloude_QC150`; `migrate
  status` al día; cliente, typegen y plantilla (`qct_tpl_87988ea6377c`, 53) regenerados. Lockfile sin
  cambios. El merge no obligó a ampliar ningún censo.
- Verificación: typecheck sale con 0; lint 0 errores (7 avisos, ninguno de la rama); `tests/guards`
  43 archivos → 560 pasados, 5 skipped.
