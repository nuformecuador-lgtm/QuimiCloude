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
