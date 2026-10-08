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

## FK compuesta del autor de la entrega (decisión del humano, backend_dev, tanda 2, 2026-10-08)

### Archivos modificados
- `db/migrations/20261008150100_order_deliveries/migration.sql` (editada en el sitio): `order_deliveries_created_by_fkey` = `FOREIGN KEY ("created_by", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE`, como `orders_conditioned_by_company_id_fkey` (`20261007120000`). El índice `order_deliveries_created_by_idx` sigue en una columna, igual que `orders_conditioned_by_idx` en el precedente. `down.sql` sin cambio (hace `DROP TABLE`).
- `db/schema.prisma`: solo el comentario de `OrderDelivery` (las FK del cliente y del autor son compuestas). Sin `@relation`, como `packedBy`/`conditionedBy`.
- `tests/unit/pedidos/schema/order-deliveries-migration.test.ts`: caso nuevo «R31: el autor va contra la clave (id, company_id) de users, y la FK simple ya no esta» (nota fechada).
- `tests/integration/pedidos/order-delivery-constraints.int.test.ts`: caso nuevo «R31: una entrega registrada por un usuario de otra empresa es rechazada por la base» (nota fechada). Con la FK simple el `INSERT` se aceptaría: el usuario de B existe.

### Ciclo contra `QuimiCloude_QC223` (salida real)
- `db:rollback` (150200 aparte la segunda vez) → «20261008150200_delivery_permission revertida.», «20261008150100_order_deliveries revertida.»; carpeta repuesta; `db:migrate` → «All migrations have been successfully applied.»
- Otra vez los tres (`150200` y `150100` apartadas por turno) → «…150200… revertida.», «…150100… revertida.», «20261008150000_inventory_movement_kind_delivery revertida.»; carpetas repuestas; `db:migrate` → «All migrations have been successfully applied.»
- `prisma migrate status` → «79 migrations found in prisma/migrations» / «Database schema is up to date!». `prisma generate` → «Generated Prisma Client (v6.19.3)». `db:seed` → «db:seed: nada que crear».

### Tests (salida real)
- `order-deliveries-migration` + `order-delivery-constraints.int` + `order-delivery-repository.int` (plantilla nueva `qct_tpl_add408c2fe85`): `Test Files 3 passed (3)`, `Tests 34 passed (34)`.
- Suites que escriben entregas o reaplican downs (`finished-goods-dispatch.int`, `ledger-cuadre.int`, `reservations-and-decimal-stock-migration.int`, `pedidos/company-scope.int`, `clientes/scope`, `guard-identificador-de-request`, `delivery-permission-migration.int`, `identity-seed.int`): `Test Files 8 passed (8)`, `Tests 111 passed (111)`.

## B5 — Cableado real, actions e integración del caso de uso (backend_dev, tanda 2, 2026-10-08)

### Archivos modificados
- `lib/composition/index.ts`: fuera los tres dobles de T0. `finishedBatchCatalog = { findDeliverableBatches }` (adaptador real de `inventario`); `orderDeliveryUnitOfWork.run` sobre `withOrderTransaction` con `createOrderWriteRepository(tx)`, `createOrderDeliveryRepository(tx)` y `createFinishedGoodsDispatch(tx)` en la misma `tx`; `getOrderDelivery.deliveries` = `createOrderDeliveryRepository()` sobre el cliente global. Se quita el `import type { OrderDeliveryRepository }` que solo usaba el doble.
- `lib/modules/pedidos/adapters/driving/order-actions.ts`: sin cambio. T0 ya dejó el cuerpo real de las dos actions (`currentActor()` una vez, el caso de uso de `@/lib/composition`, `toErrorState`); B5 solo cambia lo que hay detrás de la fachada.
- `tests/unit/identity/session-once-per-request-actions.test.ts`: `ACCIONES` + `getOrderDeliveryAction` y `deliverOrderAction` (nota «QC-223 2026-10-08»; entrada válida para que llegue a `currentActor()`).
- `tests/integration/aislamiento.json`: las dos suites nuevas en `commit` con motivo y `desde: 2026-10-08`.

### Archivos creados
- `tests/unit/pedidos/order-actions-delivery.test.ts` (28 casos).
- `tests/helpers/order-delivery-seed.ts`: siembra confirmada compartida por los dos `.int` (empresa, usuarios, cliente, presentación, pedido con sus CHECK, terminado, lote por la ruta real `addImportedFinishedGoodsBatch`) y limpieza en orden de FK.
- `tests/integration/pedidos/order-delivery.int.test.ts` (8 casos, por la fachada real `pedidos` de `@/lib/composition`).
- `tests/integration/pedidos/order-delivery-concurrency.int.test.ts` (2 casos).

### Censos revisados
- `order-actions.test.ts` ya contaba las dos actions (T0, 15 y no 13). `module-contract` de `pedidos`, `guard-aislamiento-integracion`, `guard-arquitectura-modulos`, `guard-ambito-empresa-*`, `tests/unit/composition`: verdes sin cambio. `guard-teclear-y-plazo` no afecta (el helper no usa `user-event`). Ninguna lista E2E nombra la entrega.

### R → test (B5)
| R | Test |
|---|---|
| R2 | `order-actions-delivery.test.ts` «R2, R5: getOrderDeliveryAction entrega el id y el actor…», «R2: <action> lee cada cara de la sesion una sola vez…», «R2: <action> sin sesion entrega actor null…», «R2: ninguna de las dos actions repite la comprobacion de permiso» |
| R5 | `order-delivery.int.test.ts` «R5, R6, R7, R9: devuelve pedidos, entregados y faltan…», «R5: un pedido de otra empresa es order_not_found y un pedido ENTREGADO es action_not_allowed» |
| R17 | `order-delivery.int.test.ts` «R17: un pedido de la empresa B es order_not_found y un pedido no TERMINADO es action_not_allowed, sin escribir nada» |
| R18, R19, R20 (traducción) | `order-actions-delivery.test.ts` «R18, R19, R20: <action> traduce <code> al ErrorState del catalogo» (8 códigos × 2 actions) |
| R21 | `order-delivery.int.test.ts` «R21: un cliente de la empresa B o un cliente dado de baja es customer_not_found…» |
| R22 | `order-actions-delivery.test.ts` «R22: deliverOrderAction pasa la entrada tal cual al caso de uso…» |
| R25, R26 | `order-delivery.int.test.ts` «R25, R26: una entrega parcial guarda entrega, lineas y asientos…, deja el pedido TERMINADO y no toca orders.customer_id» |
| R27 | `order-delivery.int.test.ts` «R27: la entrega que completa todas las lineas deja ENTREGADO con finished_at, packed_by y conditioned_by intactos» |
| R26, R27, R29 (resultado) | `order-actions-delivery.test.ts` «R26, R27, R29: success lleva el DeliverOrderResult…» (×3) |
| R28 | `order-delivery-concurrency.int.test.ts` «R28: dos entregas a la vez del mismo pedido…», «R28: dos pedidos que piden a la vez al mismo lote…» |
| R29 | `order-delivery.int.test.ts` «R29: la misma clave dos veces deja un solo juego de filas y un solo asiento por lote…» |
| R30 | `order-delivery.int.test.ts` «R30: si el segundo lote no alcanza no queda nada escrito…»; `order-actions-delivery.test.ts` «R30: <action> devuelve un error ajeno como unexpected, sin su detalle» |

### Verificación (salida real)
- `pnpm run typecheck`: `tsc --noEmit` sin errores.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)` (los 7 heredados de `confirm-catalog-import.test.ts` y `order-service.test.ts`).
- `pnpm exec vitest run guard tests/unit/pedidos/module-contract.test.ts tests/unit/inventario tests/unit/composition`: `Test Files 159 passed (159)`, `Tests 2377 passed | 16 skipped (2393)`.
- `order-actions-delivery.test.ts`: `Tests 28 passed (28)`; `session-once-per-request-actions.test.ts`: `Tests 70 passed (70)`.
- `order-delivery.int` + `order-delivery-concurrency.int`: `Test Files 2 passed (2)`, `Tests 10 passed (10)`.
- `pnpm exec vitest related --run <10 archivos de los pasos 3 y 4>`: `Test Files 1 failed | 271 passed (272)`, `Tests 1 failed | 4255 passed | 2 skipped (4258)`. El único rojo es `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` («'/pedidos' se sirve con el permiso…»), en `tests/baseline-rojos.json`. Las dos suites nuevas pasaron aquí por segunda vez.
- El MCP del grafo no se usó (Grep/Read).

### Veredicto
B5 listo: cableado real sin dobles y en verde contra Postgres, también con concurrencia. Queda abierto el bloqueo de la desviación 2 (tipo de `orderStatus` en `already_registered`), que tiene que decidir el humano.

## Cierre de la tanda 2 (implementer, 2026-10-08)

- B2, B3 y B5 marcadas [x]. B4 queda abierta: su código y sus tests están en verde, pero falta aplicar la
  desviación 2 (reintento con la clave ya registrada responde `already_registered` sin revalidar el
  estado). Está bloqueada porque `DeliverOrderResult.orderStatus` solo admite `'TERMINADO' | 'ENTREGADO'`;
  hay tres opciones (a/b/c) en la sección del paso 2 para que decida el humano.
- La desviación 1 está aceptada y documentada en design §4. Fixture `numberText` = `'2026-0000007'`.
- FK compuesta `created_by` → `users(id, company_id)` editada en la migración, en el sitio. Ciclo
  migrate/rollback/migrate limpio en QuimiCloude_QC223. Test «R31: una entrega registrada por un usuario de
  otra empresa es rechazada por la base».
- El predicado del índice parcial (`order_delivery_id IS NOT NULL`), validado por el humano, queda en
  design §3.2 con nota fechada. R31 incluye la empresa del usuario («decisión del humano 2026-10-08»).
- Comprobaciones del implementer: `pnpm run typecheck` sin errores; `pnpm exec vitest run guard`:
  `Test Files 55 passed (55)`, `Tests 747 passed | 11 skipped (758)`.
- Pendiente para TC: el caso R16 exige importar del barrel de `pedidos`, pero los casos de uso importan de
  `./order-delivery` (evita un ciclo). TC debe aceptar esa ruta.

## B4 opción b (backend_dev, 2026-10-08)

Decisión del leader 2026-10-08, opción b: la clave de entrega se comprueba antes del cliente, del
bloqueo y del estado; un acierto responde `already_registered` con el estado del pedido DE LA
ENTREGA registrada. `DeliverOrderResult` sin cambios.

### Archivos
- `lib/modules/pedidos/ports/order-delivery-repository.ts`: `RegisteredOrderDelivery` y
  `findByKey(deliveryKey, scope)`.
- `lib/modules/pedidos/adapters/driven/persistence/order-delivery-prisma.ts`: `findByKey` por el
  único `(company_id, delivery_key)`, con la empresa en el `where`.
- `lib/modules/pedidos/domain/deliver-order.ts`: dep nueva `deliveries: Pick<…, 'findByKey'>`.
  Orden: permiso → `safeParse` → `findByKey` (acierto → `alreadyRegistered(orderId de la entrega)`)
  → cliente → `assertTransition` → transacción. El camino `duplicate_key` (P2002) se conserva para
  la carrera: tras deshacer, vuelve a leer con `findByKey` y responde con el pedido de la entrega.
- `lib/composition/index.ts`: `deliveries: createOrderDeliveryRepository()` en `deliverOrder`.
- `specs/QC-223-entregar-producto-terminado/design.md`: §2.3 (puerto), §2.4 (orden de validación,
  paso 3 nuevo), §4 (paso 0 nuevo, paso 3 aclarado), §4.1 (reescrito el primer y el segundo párrafo).
  Todo con la nota «decisión del leader 2026-10-08, opción b».
- Tests: `tests/unit/pedidos/deliver-order.test.ts`,
  `tests/integration/pedidos/order-delivery.int.test.ts`,
  `tests/integration/pedidos/order-delivery-repository.int.test.ts`.
- Censos: ninguno se rompió (guardias en verde sin enmiendas).

### R → test (R29, nuevos)
- R29 → `deliver-order.test.ts` «R29: un reintento sobre un pedido que la primera ya dejo ENTREGADO es already_registered con ENTREGADO, sin bloquear ni escribir».
- R29 → `deliver-order.test.ts` «R29: una clave reutilizada contra OTRO pedido de la empresa responde con el estado del pedido de la entrega, no del pedido pedido».
- R29 → `deliver-order.test.ts` «R29: la clave registrada en OTRA empresa no la ve la lectura con el ambito del actor, y la entrega se registra».
- R29 → `deliver-order.test.ts` «R29: si otra peticion inserta la clave entre la lectura y el INSERT, duplicate_key vuelve a leer la entrega y responde con su pedido».
- R29 → `order-delivery.int.test.ts` «R29: reintentar con la misma clave la entrega que dejo el pedido ENTREGADO es already_registered con ENTREGADO, sin escribir nada mas».
- R29 → `order-delivery-repository.int.test.ts` «R29: findByKey devuelve la entrega de la empresa con su pedido, y no ve la clave de otra empresa».
- R2 y R22: `ningunPuerto` ahora también exige que `findByKey` no se llame.

### Puntos del spec para el humano
- R29 dice «con el mismo estado del pedido que dejó la primera». La implementación responde con el
  estado ACTUAL del pedido de la entrega. Coinciden salvo un caso: una entrega parcial (dejó
  `TERMINADO`) cuyo pedido otra entrega completó después; su reintento responde `ENTREGADO`, no
  `TERMINADO`. El estado posterior a cada entrega no se guarda en `order_deliveries`. Leerlo
  literalmente exigiría una columna nueva. No se ha hecho: queda abierto.
- Clave reutilizada contra otro pedido: R29 no lo distingue («clave ya registrada en la empresa»),
  así que la opción b no contradice el spec. La respuesta lleva el estado del pedido de la entrega
  registrada, no del pedido pedido.
- La clave se comprueba también antes de `requireAliveCustomer`. Si se comprobara después, un
  reintento con el cliente dado de baja entre medias daría `customer_not_found`, en contra de R29.
  §2.4 lo recoge.

### Verificación (salida real)
- `pnpm run typecheck`: un solo error, `app/(private)/pedidos/components/order-sheet.tsx(20,36): error TS2307: Cannot find module './order-delivery-sheet'`. Es el trabajo en curso de frontend_dev; ningún error en archivos de backend.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)` (avisos previos en documentos/confirm-catalog-import y pedidos/order-service).
- `pnpm exec vitest run tests/unit/pedidos/deliver-order.test.ts`: `Test Files  1 passed (1)`, `Tests  49 passed (49)`.
- `pnpm exec vitest run tests/integration/pedidos/order-delivery.int.test.ts tests/integration/pedidos/order-delivery-repository.int.test.ts tests/integration/pedidos/order-delivery-concurrency.int.test.ts`: `Test Files  3 passed (3)`, `Tests  21 passed (21)`.
- `pnpm exec vitest run guard`: `Test Files  55 passed (55)`, `Tests  747 passed | 11 skipped (758)`.
- `pnpm exec vitest related --run <archivos tocados>`: `Test Files  1 failed | 337 passed (338)`, `Tests  1 failed | 5347 passed | 2 skipped (5350)`. El rojo es `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` ('/pedidos', `loadFormCatalogs` en `app/(private)/pedidos/page.tsx:96`), que está en `tests/baseline-rojos.json`.

B4 opción b lista: la clave se comprueba antes del cliente, el bloqueo y el estado, y se conserva la carrera P2002. Todo en verde salvo rojos ajenos (baseline y frontend en curso). Queda abierta para el humano la lectura literal de «el estado que dejó la primera».

## F1-F4 — Frontend (frontend_dev, 2026-10-08)

### Archivos
- F1:
  - `app/(private)/pedidos/components/order-row-actions.tsx`: `canDeliver`, `onDeliver`, `ORDER_STATUS_ACCEPTS_DELIVERY`, `acceptsDelivery`, `ORDER_ACTION_DELIVER_TESTID`.
  - `order-list-section.tsx`: `canDeliver` con `entregas.modificar`, dentro del `Promise.all`. Una sola lectura de sesión para los dos permisos (`loadRowPermissions`), así el conteo de `order-list-section.test.tsx` R32 (2 lecturas) se queda igual.
  - `order-table.tsx` y `order-columns.tsx`: pasan el prop.
  - `order-sheet.tsx` (`OrderRowSheetActions`): monta `OrderDeliverySheet` solo mientras está abierto. **Desviación de tasks.md:** el sheet lo monta la celda de acciones, como los otros diálogos de la fila, y no `order-table.tsx`. `order-table.tsx` no guarda ningún pedido elegido.
  - `tests/unit/pedidos-ui/order-row-actions.test.tsx`.
- F2: `order-delivery-draft.ts` y `use-order-delivery-draft.ts` (nuevos, en el barrel), `tests/unit/pedidos-ui/order-delivery-draft.test.ts` (nuevo).
- F3: `order-delivery-sheet.tsx` (nuevo, en el barrel) y `tests/unit/pedidos-ui/order-delivery-sheet.test.tsx` (nuevo).
  - Validación con `checkDelivery`, sin aritmética de tope propia. «Faltan» sale de `line.remainingPackages`.
  - Cerrar con la X, Escape o un clic fuera conserva el borrador (`disableEscapeDismissal={false}`, `disablePointerDismissal={false}`).
  - **Desviación de §6.2:** el campo de envases NO se sanea a dígitos. Guarda el texto tal cual y muestra el aviso de R13. Sanear convertiría «2,5» en «25» sin decir nada, y R13 no podría darse nunca.
- F4: `tests/unit/inventario/batch-history.test.tsx`, caso R38. `KIND_LABELS.delivery` ya venía de T0.
- `app/(private)/pedidos/components/index.ts`: exporta todo lo nuevo. Lo exige `pedidos-convenciones` («nadie importa por ruta profunda»).

### Censos enmendados
- `tests/unit/inventario/batch-history.test.tsx`: la lista del caso «cada tipo de asiento tiene una etiqueta propia» gana `'delivery'`, con la nota «QC-223 2026-10-08».
- Ningún otro censo se rompió. En verde, sin cambios:
  - guardias (55 archivos);
  - `pedidos-convenciones` y `order-route-contract`;
  - `qc75-convenciones` y `guard-pantalla-pedidos-se-amplia`;
  - los `*-convenciones` / `*route-contract` / `scope` / `a11y` / `viewport` del repo.

### R → test
- R4 → `order-row-actions.test.tsx`:
  - «R4: con canDeliver aparece en TERMINADO, habilitada, y emite su enganche con la fila»;
  - «R4: con canDeliver no aparece en %s» (9 estados);
  - «R4: sin canDeliver no esta en el DOM en %s» (10 estados);
  - «R4: va al final del menu»;
  - «R4: los otros nueve estados…».

  También `order-delivery-sheet.test.tsx` «R4: solo se monta al pulsar «Entregar» en la fila…».
- R6 → `order-delivery-sheet.test.tsx` «R6: cada presentacion muestra su nombre, pedidos, entregados y faltan, sin listado de entregas».
- R7 → «R7: lista los lotes de la fixture con codigo, envases disponibles, entrada y vencimiento si existe».
- R8 → «R8: la presentacion completa sale como «Completa» y sin ningun campo de envases».
- R9 → los tres casos «R9: …» del sheet, más `order-delivery-draft.test.ts` «R35, R9: …» y «R9: … dado de baja».
- R11 → «R11: si la suma de una presentacion supera lo que falta…», más «R37: un borrador restaurado que supera lo que falta…».
- R12 → «R12: si un lote supera sus envases disponibles…».
- R13 → «R13: «%s» no es un entero no negativo…» (2.5, -1, 2,5, dos).
- R14 → «R14: confirmar sin cliente…».
- R15 → «R15: confirmar con todos los campos vacios…» y «… en cero…».
- R33 → «R33: tras %s borra el borrador, cierra, avisa y refresca» (partial, completed, already_registered).
- R34 → «R34: tras %s sigue abierto, muestra el mensaje, relee y conserva el borrador» (los dos códigos), más «R34, R37: si al releer un lote ya no se ofrece…».
- R35:
  - sheet: «R35: cerrar con %s conserva el borrador y al reabrir lo restaura con su clave» (la X, Escape) y «R35: restaura el cliente guardado…»;
  - draft: «R35: escribe y lee por pedido, con su clave de entrega» y «R35: el borrador de un pedido no se lee desde otro».
- R36 → sheet: «R36: «Cancelar» borra el borrador y cierra». Draft: «R36: borra el borrador del pedido y deja los de los demas».
- R37 → sheet: «R37: al restaurar descarta los lotes que ya no se ofrecen, avisa y aplica R11 y R12…». Draft: «R37: descarta los envases…» y «R37: un lote retirado sin envases escritos no cuenta como ajuste».
- `purpose="deliver"` → «el selector de cliente se monta con purpose="deliver"».
- R38 → `batch-history.test.tsx` «R38 — un asiento de entrega se pinta como «Entrega a cliente», con la cantidad en negativo, el pedido, el autor y la fecha».

### Verificación (salida real)
- `pnpm run typecheck`: `tsc --noEmit`, sin errores.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)` (los avisos previos de documentos y order-service).
- `pnpm exec vitest run tests/unit/pedidos-ui/order-delivery-sheet.test.tsx`: `Test Files  1 passed (1)`, `Tests  33 passed (33)`.
- `pnpm exec vitest run tests/unit/pedidos-ui/order-delivery-draft.test.ts`: `Tests  14 passed (14)`.
- `pnpm exec vitest run tests/unit/inventario/batch-history.test.tsx tests/unit/pedidos-ui/order-row-actions.test.tsx`: `Test Files  2 passed (2)`, `Tests  84 passed (84)`.
- `pnpm exec vitest related --run <archivos tocados>`: `Test Files  1 failed | 44 passed (45)`, `Tests  1 failed | 806 passed (807)`.
  - El rojo es `pantallas-exigen-permiso.test.tsx` ('/pedidos', `loadFormCatalogs` en `page.tsx:96`), que está en la baseline.
- `pnpm exec vitest run guard`: `Test Files  55 passed (55)`, `Tests  747 passed | 11 skipped (758)`.
- `pnpm exec vitest run convenciones route-contract qc75 a11y viewport alcance scope pantallas data-table`: `Test Files  2 failed | 100 passed (102)`. Los dos rojos son ajenos a esta rama:
  - el de baseline de arriba;
  - `tests/unit/recetas/scope.test.ts`, que señala `app/(private)/pedidos/page.tsx`, un archivo que esta rama no toca.

F1-F4 hechos: la acción, el borrador, el sheet y el R38 están en verde, salvo los rojos ajenos (baseline y `recetas/scope`). Hay dos desviaciones menores anotadas arriba para el reviewer.

## Cierre de la tanda 3 (implementer, 2026-10-08)

- B4 (opción b, 7770a7bc), F1, F2, F4 (2ddc5c79) y F3 (a74a6db0) marcadas [x].
- TC: los casos de uso importan `checkDelivery`/`remainingPackages` de `./order-delivery` y no del barrel
  de `pedidos`, porque el barrel crearía un ciclo. El caso R16 de TC tiene que aceptar esa ruta.
- Rojos vistos en esta tanda que no son nuestros: `navegacion/pantallas-exigen-permiso` y `recetas/scope`
  (los dos en `tests/baseline-rojos.json`; `app/(private)/pedidos/page.tsx` es igual a `origin/dev`).
- Abierto para el humano: R29 pide «el mismo estado del pedido que dejó la primera»; el código responde con
  el estado actual del pedido de la entrega (solo difiere si una entrega parcial ya registrada queda
  seguida de otra que completa el pedido). Ver la sección «B4 opción b».
- Desviaciones de frontend para el reviewer: el sheet lo monta `order-sheet.tsx` (`OrderRowSheetActions`),
  no `order-table.tsx`; el campo de envases no se recorta a dígitos, para que el aviso R13 pueda aparecer.
