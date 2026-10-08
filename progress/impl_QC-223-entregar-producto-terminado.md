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

## B3 — Persistencia de la entrega en `pedidos` (backend_dev, 2026-10-08)

### Archivos creados
- `lib/modules/pedidos/adapters/driven/persistence/order-delivery-prisma.ts`: `createOrderDeliveryRepository(tx = prisma)` con `create` (P2002 → `duplicate_key`), `addLines` (`createMany`) y `sumDeliveredPackages` (`groupBy` sobre `order_delivery_lines` con `delivery: { companyId, orderId }`). Toda función declara `scope: OrderScope` y lo lleva a `companyScopeColumns`; ninguna declara `update`, `delete` ni `upsert`.
- `tests/integration/pedidos/order-delivery-repository.int.test.ts` (9 casos, modo `transaccion`).

### Archivos modificados (censos, nota «QC-223 2026-10-08»)
- `tests/unit/pedidos/module-contract.test.ts`: `DUENOS_DE_PRISMA` y `DUENOS_DEL_CLIENTE` + `order-delivery-prisma.ts` (importa `@prisma/client` por `Prisma.Decimal` y el P2002, y el cliente compartido como defecto de la fábrica). Las listas siguen cerradas.
- `tests/integration/aislamiento.json`: + `pedidos/order-delivery-repository.int.test.ts` en `transaccion` (Edit mínimo).
- `tests/guards/guard-ambito-empresa-pedidos.test.ts`: sin cambio; su barrido por archivo recoge el nuevo y queda verde (el cliente se llama `tx` para que `TOCA_LA_BASE` lo vea).

### R → test (B3)
| R | Test (`order-delivery-repository.int.test.ts`) |
|---|---|
| R25 | «R25: create guarda la entrega con su empresa, pedido, cliente, clave, autor e instante», «R25: addLines guarda linea del reparto, lote, envases y cantidad con la empresa del ambito» |
| R29 | «R29: la misma clave en la misma empresa da duplicate_key y no deja una segunda fila», «R29: la clave es unica por empresa: otra empresa puede usar la misma» |
| R31 | «R31: create con el ambito de otra empresa no puede apuntar al pedido de A», «R31: addLines rechaza por FK el lote de otra empresa y no escribe ninguna linea», «R31: addLines con el ambito de B no puede colgar lineas de una entrega de A» |
| R6 | «R6: sumDeliveredPackages suma los envases por linea entre varias entregas, y una linea sin entregas no aparece» |
| R5 (ámbito) | «R5: sumDeliveredPackages no ve las entregas de la empresa B, ni con el ambito de B sobre el pedido de A» |

## B4 — Casos de uso reales (backend_dev, 2026-10-08)

### Archivos modificados
- `lib/modules/pedidos/domain/deliver-order.ts`: cuerpo real. Permiso → zod (`strictObject`, uuids, envases enteros ≥ 1, 1..`DELIVERY_MAX_ALLOCATIONS`, `refine` sin pares línea/lote repetidos) → `requireAliveCustomer` → `assertTransition('TERMINADO','ENTREGADO')` → `unitOfWork.run`. Dentro: `lockAliveById` (null → `order_not_found`; ≠ `TERMINADO` → `action_not_allowed`) → `findPresentationLinesForFinish` (línea ajena → `invalid_input`) → `deliveries.create` (`duplicate_key` → señal privada `DeliveryAlreadyRegisteredSignal`) → `sumDeliveredPackages` → `checkDelivery(lines, null, …)` (≠ ok → `delivery_exceeds_remaining`) → `dispatchForDelivery` por línea (`batch_not_found` / `insufficient` → su error) → `addLines` con la `quantity` de inventario → `setStatus(TERMINADO→ENTREGADO)` solo si `completesOrder` (≠ ok lanza). Fuera: la señal relee `orders.findAliveById` y devuelve `already_registered` con el estado.
- `lib/modules/pedidos/domain/get-order-delivery.ts`: cuerpo real. Permiso → uuid (si no, `order_not_found`) → `findAliveById` (null → `order_not_found`; ≠ `TERMINADO` → `action_not_allowed`) → líneas y entregados en paralelo → `remainingPackages` → `findRefs`, `findDeliverableBatches` (solo presentaciones con envases pendientes; sin pendientes no consulta) y cliente vivo (`findAliveRefById`; sin cliente o `null` → `customer: null`). Línea completa → `batches: []`.
- `tests/unit/pedidos/module-contract.test.ts`: consumidores de `assertTransition` + `deliver-order.ts` (nota «QC-223 2026-10-08»), aserciones previas intactas.
- `tests/unit/pedidos/search-order-customer-options.test.ts`: sin cambio; T0 ya dejó «R10: para entregar pide solo los vivos…» (`includeDeleted: false`) y dos casos R2 con `purpose: 'deliver'`.

### Archivos creados
- `tests/unit/pedidos/deliver-order.test.ts` (45 casos) y `tests/unit/pedidos/get-order-delivery.test.ts` (20 casos).

### Desviaciones del design (a validar por el leader)
1. **Orden de `create` frente al tope (R29).** `design.md > 4` pone `sumDeliveredPackages` + `checkDelivery` (pasos 3–4) ANTES de `deliveries.create` (paso 5). Con ese orden, el reintento con la misma clave de una entrega parcial ya aplicada responde `delivery_exceeds_remaining` en vez de `already_registered` si lo pedido supera ahora lo que falta, contra R29. Aquí la entrega se crea tras validar las líneas y ANTES de sumar y comprobar el tope: la entrega recién creada aún no tiene líneas, así que la suma no cambia, y cualquier fallo posterior lo deshace todo (R30). Lo fija «R29: el reintento de una entrega parcial ya aplicada responde already_registered aunque hoy excederia lo que falta». Volver al orden del design es mover un bloque.
2. **`already_registered` con el pedido releído fuera de `TERMINADO`/`ENTREGADO` o ya no vivo.** El design no lo dice; se lanza `action_not_allowed` / `order_not_found` en vez de devolver un `orderStatus` fuera del tipo.
3. `deliver-order.ts` y `get-order-delivery.ts` importan `checkDelivery`/`remainingPackages` de `./order-delivery`, no del barrel: ningún archivo de `pedidos/domain` importa su propio barrel (sería un ciclo). El caso R16 de TC («importan del barrel de `pedidos`») tendrá que aceptar la ruta propia para el caso de uso.
4. El fixture `deliveryView().numberText` es `'2026-0007'`, que no es la forma real de `formatOrderNumber` (`'2026-0000007'`). Cosmético, de frontend; no se tocó.

### R → test (B4)
| R | Test |
|---|---|
| R2 | `deliver-order.test.ts` «R2: sin entregas.modificar responde unauthorized antes de validar, y ningun puerto se llama»; `get-order-delivery.test.ts` «R2: sin entregas.modificar responde unauthorized y ningun puerto se llama»; `search-order-customer-options.test.ts` (T0) dos casos R2 con `deliver` |
| R3 | `deliver-order.test.ts` «R3: un actor con entregas.modificar y otro rol es aceptado», «R3: un Administrador sin entregas.modificar en su conjunto es rechazado» |
| R5 | `get-order-delivery.test.ts` «R5: un id sin forma de uuid…», «R5: inexistente, borrado o de otra empresa…», «R5: un pedido <estado> es action_not_allowed…» (×9) |
| R6 | `get-order-delivery.test.ts` «R6: por cada presentacion devuelve nombre, pedidos, entregados y faltan…», «R6: no devuelve ningun listado de entregas anteriores» |
| R7 | `get-order-delivery.test.ts` «R7: cada linea pendiente lleva los lotes de su presentacion…» (el filtro real es del `.int` de B2) |
| R8 | `get-order-delivery.test.ts` «R8: una linea completa lleva batches vacio…», «R8: si no falta nada en ninguna linea no consulta lotes» |
| R9 | `get-order-delivery.test.ts` «R9: el cliente vivo…», «R9: un pedido sin cliente…», «R9: un cliente dado de baja…» |
| R10 | `search-order-customer-options.test.ts` (T0) «R10: para entregar pide solo los vivos de la empresa del actor» |
| R17 | `deliver-order.test.ts` «R17: un pedido que no vuelve del bloqueo…», «R17: un pedido <estado> es action_not_allowed y no escribe nada» (×9) |
| R18 | `deliver-order.test.ts` «R18: mas envases que los que faltan en una linea…», «R18: cualquier envase a una linea que ya esta completa…» |
| R19 | `deliver-order.test.ts` «R19: batch_not_found de inventario es batch_not_found…» |
| R20 | `deliver-order.test.ts` «R20: insufficient de inventario es delivery_batch_insufficient…» |
| R21 | `deliver-order.test.ts` «R21: un cliente que no vuelve del catalogo…», «R21: un cliente sin forma de uuid…» |
| R22 | `deliver-order.test.ts` «R22: <caso> es invalid_input y no lee ni escribe nada» (×17), «R22: una linea del reparto que no es del pedido…», «R22: un pedido sin lineas del reparto…» |
| R24 (caso de uso) | `deliver-order.test.ts` «R24: despacha una vez por linea con la receta del pedido…», «R24: con dos lineas pendientes despacha cada una con su presentacion» |
| R26 | `deliver-order.test.ts` «R26: si a alguna linea le siguen faltando envases el pedido sigue TERMINADO…» |
| R27 | `deliver-order.test.ts` «R27: si no le falta nada a ninguna linea pasa a ENTREGADO…», «R27: si setStatus no mueve el pedido la entrega entera falla» |
| R29 | `deliver-order.test.ts` «R29: duplicate_key es already_registered con el estado leido…», «R29: el reintento de una entrega parcial ya aplicada…» |

### Verificación B3 + B4 (salida real)
- `pnpm run typecheck`: `tsc --noEmit` sin errores.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)` (ajenos: `confirm-catalog-import.test.ts`, `order-service.test.ts`).
- `pnpm exec vitest run guard`: `Test Files 55 passed (55)`, `Tests 747 passed | 11 skipped (758)`.
- `deliver-order.test.ts`: `Tests 45 passed (45)`; `get-order-delivery.test.ts`: `Tests 20 passed (20)`.
- `order-delivery-repository.int.test.ts` contra Postgres (copia `qct_qc223_…` de la plantilla): `Test Files 1 passed (1)`, `Tests 9 passed (9)`.
- `pnpm exec vitest related --run <8 archivos tocados>`: `Test Files 1 failed | 335 passed (336)`, `Tests 1 failed | 5296 passed | 2 skipped (5299)`. El único rojo es `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` («'/pedidos' se sirve con el permiso…»), que está en `tests/baseline-rojos.json`.
- Censos de `pedidos` (`module-contract`, `scope`, `company-scope`, `search-order-customer-options`): `Tests 40 passed (40)`.

### Veredicto
B3 y B4 listos y en verde contra dobles y contra Postgres. Hay una desviación del design para validar: la entrega se crea antes de comprobar el tope, para que se cumpla R29.

## B2 — Salida física en `inventario` (backend_dev, 2026-10-08)

### Archivos creados
- `lib/modules/inventario/adapters/driven/persistence/finished-goods-dispatch-prisma.ts`: `createFinishedGoodsDispatch(tx)` (molde de `createFinishedGoodsIntake`).
- `lib/modules/inventario/adapters/driven/persistence/deliverable-batches-prisma.ts`: `findDeliverableBatches(recipeId, presentationIds, companyId)` sobre el cliente global; la consulta vive en `findBatchesWithStock(..., scope: InventoryScope)` para pasar `guard-ambito-empresa-inventario` (mismo molde que `findFinishedGoodsReceipts`).
- `tests/unit/inventario/finished-goods-dispatch-prisma.test.ts` (tx doblado, 10 casos).
- `tests/integration/inventario/finished-goods-dispatch.int.test.ts` (modo `transaccion`, 4 casos).
- `tests/integration/inventario/deliverable-batches.int.test.ts` (modo `commit`, 2 casos).

### Archivos modificados
- `product-prisma.ts`: `dispatchFinishedGoods` (`design.md > 4.2`): `FOR NO KEY UPDATE` del terminado vivo → `findMany` de lotes (empresa, producto, `package_content IS NOT NULL`) → por asignación `updateMany` condicional (`stock >= qty`) + `writeMovement` `delivery` negativo → un `recalculateProductStock`. Sin allocations devuelve `dispatched` vacío sin tocar la base.
- `batch-movement-prisma.ts`: `writeMovement` escribe `orderDeliveryId` solo cuando llega (los demás asientos no nombran la columna; el test de forma exacta de `writeMovement` sigue verde).
- `domain/finished-goods-dispatch.ts`: + `quantityForPackages(packages, packageContent)` (BigInt, `'d.dddd'`). No se publica en el barrel.
- Enmiendas de censo, con nota «QC-223 2026-10-08» y sin quitar aserciones previas:
  - `tests/guards/guard-libro-de-inventario.test.ts`: `CAMINOS_ESPERADOS` + `dispatchFinishedGoods`, y el título del caso.
  - `tests/unit/inventario/qc121-alcance.test.ts`: `CAMINOS_ESPERADOS` + `dispatchFinishedGoods`; fuente fabricada de siete caminos; «séptimo» → «octavo» camino fabricado; «seis» → «siete» en el censo real.
  - `tests/unit/inventario/qc91-alcance.test.ts`: `llamaAMetodoFueraDe`/`llamaAUpdateManyFueraDe` aceptan uno o varios nombres (con uno se comportan igual: los casos sintéticos previos no cambian); el caso real usa `['consumeBatchStock', 'dispatchFinishedGoods']` y además afirma que solo con `consumeBatchStock` el real SÍ da hallazgo; caso sintético nuevo: un tercer `updateMany` sigue en rojo.
  - `tests/unit/inventario/batch-movement-prisma.test.ts`: caso nuevo de `orderDeliveryId`.
  - `tests/unit/inventario/finished-goods-dispatch.test.ts`: casos de `quantityForPackages`.
  - `tests/integration/inventario/ledger-cuadre.int.test.ts`: caso con entrega.
  - `tests/integration/aislamiento.json`: `inventario/finished-goods-dispatch.int.test.ts` en `transaccion`; `inventario/deliverable-batches.int.test.ts` en `commit` con motivo y `desde: 2026-10-08` (edición mínima, sin reescribir el archivo).
- Revisados sin cambio (verdes): `guard-ambito-empresa-inventario` (barre los archivos nuevos), `tests/unit/inventario/scope.test.ts`, `company-scope.test.ts`, `inventario-schema.test.ts` (barrel sin cambio).

### Decisiones
- `findDeliverableBatches.presentationId` sale de `products.presentation_id` (la combinación filtrada), no de `product_batches.presentation_id`.
- El orden lo pone Postgres (`purchase_date ASC, lot ASC`); `lot` es único por empresa, así que no hace falta desempate.

### R → test (B2)
| R | Test |
|---|---|
| R7 | `deliverable-batches.int.test.ts` «R7: devuelve los lotes de produccion e importacion con al menos un envase, por fecha de entrada y luego por lote» (excluye <1 envase, sin existencia, sin contenido, otra presentación, otra receta, producto de baja, empresa B; comprueba orden y forma) y «R7: sin presentaciones pedidas ...» |
| R19 | `finished-goods-dispatch-prisma.test.ts` (producto ausente, lote que no vuelve —ajeno/otro producto—, lote sin contenido; lectura acotada); `finished-goods-dispatch.int.test.ts` «R19: un lote de la empresa B ...», «R19: un lote de otro producto ...» |
| R20 | `finished-goods-dispatch-prisma.test.ts` «R20: count === 0 da insufficient ...», «R20: si el segundo lote no alcanza ...»; `finished-goods-dispatch.int.test.ts` «R20: pedir mas envases enteros ...» |
| R23 | `finished-goods-dispatch-prisma.test.ts` «R23: producto -> lotes -> ...»; `finished-goods-dispatch.int.test.ts` «R23, R24: ...»; `finished-goods-dispatch.test.ts` `quantityForPackages (R23)`; `ledger-cuadre.int.test.ts` «QC-223 R23, R24: cuadra con un lote ... entrega» |
| R24 | `finished-goods-dispatch-prisma.test.ts` «R24: cada asiento es delivery ...», «R24: dispatchForDelivery ...»; `batch-movement-prisma.test.ts` «QC-223 R24: escribe orderDeliveryId ...»; `finished-goods-dispatch.int.test.ts` «R23, R24: ...» |
| R28 (parte inventario) | `finished-goods-dispatch-prisma.test.ts` «R28: el decremento es condicional ...» |

### Salida real
- `pnpm run typecheck`: `tsc --noEmit` sin errores.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)` (los mismos 7 heredados, en `confirm-catalog-import.test.ts` y `order-service.test.ts`).
- `pnpm exec vitest run guard` + `qc121-alcance` + `qc91-alcance` + `batch-movement-prisma`: `Test Files 58 passed (58)`, `Tests 826 passed | 11 skipped (837)`.
- Nuevos unit: `Test Files 3 passed (3)`, `Tests 38 passed (38)`.
- Nuevos/enmendados `.int` (`finished-goods-dispatch`, `deliverable-batches`, `ledger-cuadre`) contra `QuimiCloude_QC223`: `Test Files 3 passed (3)`, `Tests 12 passed (12)`.
- `pnpm exec vitest related --run <14 archivos tocados>`: `Test Files 2 failed | 469 passed (471)`, `Tests 2 failed | 7546 passed | 8 skipped (7556)`. Los dos rojos son de baseline: `tests/unit/recetas/module-contract.test.ts` y `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` ('/pedidos').
- El MCP del grafo no se usó en esta tanda (Grep/Read).

### Veredicto
B2 listo: salida física, lectura de lotes entregables y las tres guardias enmendadas, en verde contra Postgres.

### Re-verificación de B2 contra el worktree (backend_dev, tanda 2, 2026-10-08)
- Los 4 archivos de `lib/` y los 7 de `tests/` de `tasks.md > B2` existen. Las enmiendas llevan nota «QC-223 2026-10-08»: `guard-libro-de-inventario` (`CAMINOS_ESPERADOS` y título), `qc121-alcance` (censo, fuente fabricada, octavo camino), `qc91-alcance` (dos funciones permitidas y el caso sintético «R30: updateMany en consumeBatchStock y dispatchFinishedGoods no es hallazgo; uno en una tercera funcion si»), `ledger-cuadre` (caso «QC-223 R23, R24: cuadra con un lote ... entrega»). `aislamiento.json`: `finished-goods-dispatch` en `transaccion`, `deliverable-batches` en `commit` con motivo y `desde`. Sin huecos.
- Unit + guardia (`finished-goods-dispatch-prisma`, `finished-goods-dispatch`, `batch-movement-prisma`, `qc121-alcance`, `qc91-alcance`, `guard-libro-de-inventario`): `Test Files 6 passed (6)`, `Tests 125 passed (125)`.
- `.int` (`finished-goods-dispatch`, `deliverable-batches`, `ledger-cuadre`): `Test Files 3 passed (3)`, `Tests 12 passed (12)` (plantilla `qct_tpl_7dede18c795f`).

## Decisiones del humano sobre las desviaciones de B4 (backend_dev, tanda 2, 2026-10-08)

- **Desviación 1 (ACEPTADA).** `design.md > 4` reordenado: `deliveries.create` es el paso 3, antes de `sumDeliveredPackages` (4) y `checkDelivery` (5), con nota «decisión del humano 2026-10-08». Las referencias de §4.1 al «paso 5» pasan a «paso 3». El código ya tenía ese orden; sin cambio en `deliver-order.ts`.
- **Desviación 2 (NO APLICADA, bloqueo para el humano).** `DeliverOrderResult.orderStatus` es `'TERMINADO' | 'ENTREGADO'` y no puede representar otros estados. `alreadyRegistered` relee `input.orderId`, que no tiene por qué ser el pedido de la entrega existente (la clave es única por empresa, no por pedido): ese pedido puede estar en cualquier estado o no existir. Además, `lockAliveById` + estado (paso 1) va antes de `create`, así que un reintento sobre un pedido ya `ENTREGADO` sigue saliendo por `action_not_allowed` antes de ver la clave (lo dice `design.md > 4.1`, segundo párrafo). Por instrucción, se para y se reporta en vez de inventar el valor. `deliver-order.ts` sin cambio.
- **Fixture.** `tests/fixtures/order-delivery.ts`: `numberText` `'2026-0007'` → `'2026-0000007'`. Ningún test lo afirmaba (las coincidencias de `'2026-0007'` en `finished-stock-table.test.tsx` son su propio fixture).

### Salida real
- `deliver-order.test.ts` + `get-order-delivery.test.ts`: `Test Files 2 passed (2)`, `Tests 65 passed (65)`.
