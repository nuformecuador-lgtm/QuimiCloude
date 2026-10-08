# impl QC-223 — entregar-producto-terminado

## T0 — Publicar el contrato (backend_dev, 2026-10-08)

### Archivos creados
- `lib/modules/pedidos/domain/order-delivery.ts`: tipos, `remainingPackages`, `checkDelivery`, `DELIVERY_MAX_ALLOCATIONS` (implementación real).
- `lib/modules/pedidos/domain/get-order-delivery.ts`: `OrderDeliveryView`, `OrderDeliveryLineView`, `GetOrderDeliveryDeps`, `createGetOrderDelivery` (permiso primero, stub que lanza `ActionNotAllowedError`).
- `lib/modules/pedidos/domain/deliver-order.ts`: `DeliverOrderResult`, `DeliverOrderDeps`, `createDeliverOrder` (ídem).
- `lib/modules/pedidos/ports/order-delivery-repository.ts`, `order-delivery-unit-of-work.ts`.
- `lib/modules/inventario/domain/finished-goods-dispatch.ts`: `wholePackagesIn` (real), `DeliverableBatch`, `FinishedBatchCatalog`, `FinishedGoodsDispatch*`.
- `tests/fixtures/order-delivery.ts`, `tests/unit/pedidos/order-delivery.test.ts`, `tests/unit/inventario/finished-goods-dispatch.test.ts`.

### Archivos modificados
- `lib/modules/pedidos/{index.ts, domain/errors.ts, domain/order-customer.ts, domain/search-order-customer-options.ts, adapters/driving/order-actions.ts}`.
- `lib/modules/inventario/{index.ts, domain/inventory-movement.ts, domain/reservation.ts}`.
- `lib/modules/identity/domain/permissions.ts`, `lib/modules/errores/domain/{error-codes.ts, error-catalog.ts}`, `lib/composition/index.ts`.
- Censos (nota «QC-223 2026-10-08»): `tests/unit/identity/permissions.test.ts`, `tests/unit/errores/catalogo.test.ts`, `tests/unit/pedidos/order-customer-contract.test-d.ts`, `tests/unit/pedidos/order-actions.test.ts`, `tests/unit/navegacion/qc75-convenciones.test.ts`, `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`. Caso nuevo en `tests/unit/pedidos/search-order-customer-options.test.ts`.
- NO tocado (por instrucción): `app/(private)/inventario/components/batch-history.tsx` (frontend_dev).

### Desvío del texto de tasks.md
- `NewInventoryMovement['kind']` NO gana `'delivery'` en T0: el enum de Prisma no lo tiene hasta B1 y `writeMovement` (`batch-movement-prisma.ts:31`) deja de compilar. Gana solo `orderDeliveryId?` (opcional). `InventoryMovementView['kind']` y `BatchHistoryEntry['kind']` sí ganan `'delivery'`. B1/B2 amplían `NewInventoryMovement['kind']` con el cliente regenerado.

### R → test (T0)
- R1 (base): `tests/unit/identity/permissions.test.ts` > «QC-223 — el permiso entregas.modificar».
- R2, R10: `tests/unit/pedidos/search-order-customer-options.test.ts` > «searchOrderCustomers para entregar (QC-223)».
- R11, R12, R15, R16, R18, R20, R26, R27 (función): `tests/unit/pedidos/order-delivery.test.ts`.
- R7, R20 (envases enteros): `tests/unit/inventario/finished-goods-dispatch.test.ts`.
- R18, R20 (códigos y textos únicos): `tests/unit/errores/catalogo.test.ts`.
- R38: tipo `BatchHistoryEntry['kind']`; la etiqueta la pone frontend_dev.

### Verificación «Lotes reservados»
Ningún producto terminado puede ser ingrediente: `isIngredientType` excluye `FINISHED_PRODUCT` (`lib/modules/inventario/domain/product-type.ts:44-46`) y lo aplican todos los caminos que escriben líneas de receta: `create-recipe.ts:59`, `update-recipe.ts:105`, `update-recipe-version.ts:53`, `create-recipe-version.ts:55` (rechazo explícito, también en líneas copiadas) y `documentos/domain/confirm-formula-import.ts:124,147`. Tests: `tests/unit/recetas/qc195-envase-no-es-ingrediente.test.ts:101`, `create-recipe-version.test.ts:173`, `update-recipe-version.test.ts:155`. La regla es de aplicación (no hay CHECK en base).

### Salida real
- `pnpm run typecheck`: 1 error, `app/(private)/inventario/components/batch-history.tsx(31,7): error TS2741: Property 'delivery' is missing` (esperado: lo cierra frontend_dev). Antes hubo que correr `pnpm exec next typegen` (faltaba `.next/types` en el worktree: `LayoutProps`).
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)` (avisos previos, ninguno en archivos tocados).
- `pnpm exec vitest related --run <tocados>`: `Test Files 5 failed | 683 passed (688)`, `Tests 7 failed | 10619 passed | 40 skipped`.
  - Baseline: `tests/unit/recetas/module-contract.test.ts`, `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`.
  - Transitorios hasta B1 (la base aún no tiene la fila `entregas.modificar`; los arregla la migración de permiso): `tests/integration/identity/identity-seed.int.test.ts` (3), `tests/integration/identity/assignment-directory.int.test.ts` (1).
  - Ajeno: `tests/integration/proveedores/catalog-line.int.test.ts` R32 (`.toMatch() expects a string, got object` en la forma del error de Prisma; el diff no toca `proveedores`).
- `pnpm exec vitest run guard`: `Test Files 55 passed (55)`, `Tests 742 passed | 11 skipped (753)`.

### Veredicto
T0 listo salvo `batch-history.tsx` (frontend_dev) y los tres `.int` de identity, que dependen de la migración de B1.

## B1 — Migraciones, esquema y permiso sembrado (backend_dev, 2026-10-08)

### Comprobaciones previas
- `git fetch origin`: la última migración de `origin/dev` es `20261007120100_order_terminated_finished_index`. Ninguna rama remota tiene migraciones del 2026-10-08 salvo `QC-221` (`20261008120843_integrations_permission`, anterior a las nuestras, sin choque).
- Texto vigente de los CHECK (leído de `pg_constraint` en `QuimiCloude_QC223`): `order_id_matches_kind` = `kind IN (consumption, production)`; `reason_matches_kind` = `adjustment` con motivo o `opening/consumption/production` sin él. Son los de `20260924190100`, sin reescrituras posteriores.
- Clave de `customers`: `customers_company_id_id_key` (índice único `(company_id, id)`).

### Archivos creados
- `db/migrations/20261008150000_inventory_movement_kind_delivery/{migration.sql,down.sql}`
- `db/migrations/20261008150100_order_deliveries/{migration.sql,down.sql}`
- `db/migrations/20261008150200_delivery_permission/{migration.sql,down.sql}`
- `tests/unit/pedidos/schema/order-deliveries-migration.test.ts`
- `tests/unit/identity/schema/delivery-permission-migration.test.ts`
- `tests/integration/identity/delivery-permission-migration.int.test.ts`
- `tests/integration/pedidos/order-delivery-constraints.int.test.ts`

### Archivos modificados
- `db/schema.prisma`: `OrderDelivery`, `OrderDeliveryLine`, `InventoryMovement.orderDeliveryId` (+ índice), `InventoryMovementKind.delivery` (al final), `Order.deliveries`, `OrderPresentationLine.deliveryLines` + `@@unique([id, companyId])`. Sin `prisma format` global: reformatea líneas ajenas (Order, Recipe).
- `lib/modules/inventario/domain/inventory-movement.ts`: `NewInventoryMovement['kind']` gana `'delivery'` (arrastrado de T0).
- Enmiendas de censo, todas con nota «QC-223 2026-10-08» y sin quitar aserciones:
  - `tests/guards/guard-identificador-de-request.test.ts` (`MIGRACIONES_ESPERADAS` + las tres);
  - `tests/unit/pedidos/schema/pedidos-schema.test.ts` (modelos de `pedidos` x2; listas de `Order`: + `deliveries`). `CROSS_MODULE_SCALARS` sin cambio (`Order` no gana escalares);
  - `tests/unit/inventario/schema/finished-product-enum-values-migration.test.ts` (el censo del enum vive aquí; `inventario-schema.test.ts` no lo enumera y sigue verde sin cambios);
  - `tests/unit/clientes/scope.test.ts` (migraciones que nombran `customers`: + `order_deliveries`, que solo la referencia);
  - `tests/integration/identity/identity-seed.int.test.ts` (caso nuevo «QC-223 R1»);
  - `tests/integration/pedidos/company-scope.int.test.ts` (retira/restaura `order_deliveries_order_id_fkey` alrededor del DOWN que suelta `orders_id_company_id_key`, igual que las otras tres FK);
  - `tests/integration/inventario/reservations-and-decimal-stock-migration.int.test.ts` (retira `order_delivery_lines_batch_id_fkey` antes del DOWN que suelta `product_batches_id_company_id_key`);
  - `tests/integration/aislamiento.json` (+ las dos suites nuevas en `transaccion`; JSON sin comentarios, la nota va aquí).

### Desviaciones del design (a revisar por el leader)
- `design.md > 3.2` pide `CREATE UNIQUE INDEX "inventory_movements_one_delivery_per_batch" ... WHERE "kind"::text = 'delivery'`. Postgres lo rechaza (42P17: «las funciones utilizadas en predicados de índice deben estar marcadas IMMUTABLE»; el cast enum→text no es IMMUTABLE). Se usa `WHERE "order_delivery_id" IS NOT NULL`, equivalente por el CHECK `inventory_movements_order_delivery_id_matches_kind` y sin dependencia del enum. Comentado en el SQL y afirmado en el test estático.
- `down.sql` de `delivery`: además de los dos CHECK del molde, suelta y repone `order_presentation_line_id_matches_kind`, `production_quantity_positive` y el índice `one_production_per_line`, que hoy también comparan con un literal del tipo.
- `order_deliveries_created_by_fkey` es simple a `users(id)`, como dice el SQL del design (no compuesta con `company_id`).

### Ciclo de migraciones (contra `QuimiCloude_QC223`)
- Primer `pnpm run db:migrate`: falló en `20261008150100` por el índice (arriba); se corrigió, `prisma migrate resolve --rolled-back` y `db:migrate` → «All migrations have been successfully applied.»
- `db:rollback` x3: el script siempre revierte la última CARPETA, así que entre rollbacks se apartaron un momento `150200` y `150100` (mismo método que QC-168). Salida: «20261008150200_delivery_permission revertida», «20261008150100_order_deliveries revertida», «20261008150000_inventory_movement_kind_delivery revertida». Los CHECK, el enum `{opening,adjustment,consumption,production}` y el índice de producción quedaron como antes.
- `pnpm run db:migrate` otra vez → «All migrations have been successfully applied.»; `prisma migrate status` → «79 migrations found ... Database schema is up to date!».
- Guarda del `down.sql` de `delivery`: en una transacción con ROLLBACK se insertó un asiento `delivery` y se corrió el down → `23514 inventory_movement_kind_delivery_in_use: hay asientos con kind = delivery; ...`. Lo afirma también el test estático.
- `pnpm run db:seed` → «db:seed: nada que crear». Estado final: base migrada, `entregas.modificar` solo en Administrador.

### R → test (B1)
| R | Test |
|---|---|
| R1 | `tests/unit/identity/schema/delivery-permission-migration.test.ts` (8 casos R1); `tests/integration/identity/delivery-permission-migration.int.test.ts` (6 casos R1); `tests/integration/identity/identity-seed.int.test.ts` «QC-223 R1: ... solo la asignacion del Administrador; ningun otro rol lo tiene ...» |
| R24 | `order-deliveries-migration.test.ts` «R24: el UP solo anade el valor delivery», «R24: el DOWN aborta si hay asientos delivery ...», «R24, R31: delivery entra en los CHECK ...»; `order-delivery-constraints.int.test.ts` «R24, R31: delivery exige su entrega, su pedido, cantidad negativa y ningun motivo», «R24, R31: un solo asiento delivery por lote y entrega» |
| R29 | `order-deliveries-migration.test.ts` «R29: la clave de idempotencia es unica por empresa»; `order-delivery-constraints.int.test.ts` «R29, R31: la clave de entrega es unica por empresa ...» |
| R31 | `order-deliveries-migration.test.ts` (RLS ENABLE+FORCE, FK compuestas, CHECK con `::text`, cliente contra `(company_id, id)`); `order-delivery-constraints.int.test.ts` (control positivo + un INSERT crudo rechazado por restricción: pedido/cliente/empresa/autor, línea/reparto/lote de otra empresa, envases y cantidad, lote repetido, asiento con entrega de otra empresa, RLS en `pg_class`) |
| R32 (base) | `order-deliveries-migration.test.ts` «R32: ninguna de las dos tablas tiene updated_at ni deleted_at» |

### Verificación (salida real)
- `pnpm run typecheck`: `tsc --noEmit` sin errores.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)` (todos en archivos ajenos: `confirm-catalog-import.test.ts`, `order-service.test.ts`).
- `pnpm exec vitest related --run <13 archivos tocados>`: `Test Files 11 passed (11)`, `Tests 172 passed (172)`.
- `pnpm exec vitest run guard`: `Test Files 55 passed (55)`, `Tests 742 passed | 11 skipped (753)`.
- Nuevos/enmendados `.int`: `order-delivery-constraints` + `delivery-permission-migration` + `identity-seed` + `assignment-directory` → `Test Files 4 passed (4)`, `Tests 62 passed (62)`. Los 4 transitorios de T0 (identity-seed 3, assignment-directory 1) quedan verdes.
- Barrido extra de suites que reaplican `down.sql` antiguos o nombran las tablas tocadas (38 `.int` + infra): `Test Files 39 passed (39)`, `Tests 591 passed (591)`; unit `pedidos/schema`, `inventario/schema`, `identity`, `asignaciones/schema`, `clientes`: verdes tras la enmienda de `clientes/scope.test.ts`.
- `tests/integration/proveedores/catalog-line.int.test.ts` R32: rojo AJENO. `meta.constraint` de P2003 llega como objeto porque el Postgres local está en español (el commit `f2be3eb8` documenta la dependencia del locale; CI usa en_US). El diff no toca `proveedores`, `supplier_catalog_lines`, `package.json` ni `pnpm-lock.yaml`.

### Veredicto
B1 listo: tres migraciones con down probado, esquema y cliente regenerados, censos enmendados y tests nuevos en verde contra Postgres; una desviación del design (predicado del índice parcial) para validar.
