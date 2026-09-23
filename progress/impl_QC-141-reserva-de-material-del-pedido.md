# QC-141 — reserva-de-material-del-pedido · progreso de implementacion

> Este archivo se completa tanda a tanda. Esta entrada cubre T1, T2 y T3 de `tasks.md`. El mapa
> `R<n> → test` completo (los 48 requisitos) lo cierra T17; aqui solo van los que esta tanda
> implementa o dan soporte directo.

## Tanda T1 — T3 (2026-09-22)

### Archivos creados

- `db/migrations/20260922160000_inventory_movement_kind_consumption/{migration.sql,down.sql}`
- `db/migrations/20260922160100_reservations_and_decimal_stock/{migration.sql,down.sql}`
- `lib/modules/inventario/domain/decimal-quantity.ts`
- `lib/modules/inventario/domain/batch-order.ts`
- `tests/unit/inventario/schema/inventory-movement-kind-consumption-migration.test.ts`
- `tests/unit/inventario/schema/reservations-and-decimal-stock-migration.test.ts`
- `tests/integration/inventario/reservations-and-decimal-stock-migration.int.test.ts`
- `tests/unit/inventario/decimal-quantity.test.ts`
- `tests/unit/inventario/batch-order.test.ts`
- `progress/impl_QC-141-reserva-de-material-del-pedido.md` (este archivo)

### Archivos modificados

- `db/schema.prisma`: `InventoryMovementKind` gana `consumption`; `Product.stock`/`qtyAlert`,
  `ProductBatch.stock`, `InventoryMovement.quantity` pasan a `Decimal @db.Decimal(14,4)`;
  `InventoryMovement` gana `orderId`; `ProductBatch` gana la unica compuesta
  `product_batches_id_company_id_key`; modelo nuevo `ReservationMovement` (`/// @module
  inventario`); `Order` gana `reservedAt`.
- `lib/modules/inventario/index.ts`: exporta `addQuantities`, `subtractQuantities`,
  `compareQuantities`, `minQuantity`, `ceilToScale4` y `compareBatchesOldestFirst`.
- `lib/modules/pedidos/domain/order-cost.ts`: `compareLots`/`compareBatches` locales se
  retiran; importa `compareBatchesOldestFirst` del barril de `inventario`.
- Adaptadores driven de `inventario` — **cambios PROVISIONALES para que el typecheck quedara
  verde con las columnas ya decimales; T4 los revierte al mover el dominio a cadenas**:
  - `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`:
    `toMovementView` hace `row.quantity.toNumber()`.
  - `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`:
    `findAliveProducts` y `toCostingBatch` hacen `.toNumber()` sobre `stock`.
  - `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`: `toProductView`
    (`stock`, `qtyAlert`), `recalculateProductStock` (suma en JS, deberia moverse a SQL segun
    `design.md > 2.1`), `toBatchView` y `adjustBatchStock` hacen `.toNumber()`.
- Tests de esquema/migracion actualizados de `Int` a `Decimal(14,4)`:
  `tests/unit/inventario/schema/inventario-schema.test.ts`,
  `tests/unit/inventario/qc91-alcance.test.ts`, `tests/unit/pedidos/schema/pedidos-schema.test.ts`
  (censo de `Order` a dieciseis columnas, `reservedAt`).
- Tests unitarios cuyos dobles de Prisma pasaron de `number` a `Prisma.Decimal` para no romper en
  runtime tras el cambio de tipo (mismos archivos que consumen los adaptadores de arriba):
  `tests/unit/inventario/adjust-batch-stock-prisma.test.ts`,
  `tests/unit/inventario/product-batch-lot-retry.test.ts`,
  `tests/unit/inventario/company-scope.test.ts`, `tests/unit/inventario/product-catalog.test.ts`,
  `tests/unit/inventario/product-catalog-costing.test.ts`,
  `tests/unit/inventario/product-prisma.test.ts`,
  `tests/unit/inventario/batch-movement-prisma.test.ts`.
- Tests de integracion con `Prisma.Decimal` en vez de `number` al leer `stock`/`quantity`:
  `tests/integration/inventario/product-stock.int.test.ts`,
  `tests/integration/inventario/ledger-cuadre.int.test.ts`.
- `e2e/ajuste-de-inventario.spec.ts`: `stockBefore` ahora es `Decimal`, se usa `.toNumber()`.
- `tests/guards/guard-identificador-de-request.test.ts`: las dos migraciones nuevas entran en
  `MIGRACIONES_ESPERADAS` (no tocan el identificador de peticion).
- `tests/integration/aislamiento.json`: registra
  `inventario/reservations-and-decimal-stock-migration.int.test.ts` como `transaccion`.

### Lo que queda PROVISIONAL para T4

`design.md > 2.1` es el mapa completo. Lo pendiente exacto, con lo que ya cambio en esta tanda:

1. **Tipos de dominio siguen en `number`** donde `design.md` pide `string`: `ProductView.stock` y
   `.qtyAlert`, `ProductBatchView.stock`, `InventoryMovementView.quantity`,
   `NewInventoryMovement.quantity`, `NewProductBatch.stock`, `NewProduct.qtyAlert`,
   `CostingBatch.stock`, `product-stock.ts` (`ProductStockByUnit`, `sumStockByUnit`,
   `singleUnitStock`). Los `.toNumber()` que esta tanda anadio en los adaptadores desaparecen
   cuando esos tipos pasen a cadena y la aritmetica se haga con `decimal-quantity.ts` (ya
   escrito y probado en esta misma tanda) en vez de con `number`.
2. **Esquemas zod sin tocar**: `product-batch-input.ts` (`stock` sigue `z.number().int().min(0)`)
   y `adjust-batch-stock.ts` (`delta` sigue `z.number().int()`), asi que el alta y el ajuste
   **todavia rechazan decimales** aunque la columna ya los acepte. R3 y R4 no estan
   implementados: solo el tipo de columna (R1) y la conservacion del valor al migrar (R2).
3. **`recalculateProductStock` sigue sumando en JavaScript** (`product-prisma.ts:290-312`) en vez
   de con el `UPDATE ... SET stock = (SELECT sum(...))` que pide `design.md > 2.1`; hoy funciona
   porque convierte cada `Decimal` a `number` antes de sumar, que es exactamente lo que R6
   prohibe en el resultado final (aqui es un paso intermedio, no lo que se guarda, pero sigue
   siendo el `.toNumber()` que T4 tiene que quitar).
4. **Lectores de `FormData`** (`batch-actions.ts`, `product-actions.ts`) siguen leyendo enteros.
5. **`product-batches-panel.tsx`, `product-columns.tsx`, `product-form.tsx`,
   `adjust-batch-dialog.tsx`, `order-ingredients-table.tsx`** sin tocar (T5).
6. **`qty_alert` a decimal (pregunta 5b)** se aplico en el esquema y en la migracion, pero su
   comparacion contra `stock` en `product-columns.tsx:110` sigue sin actualizar (T4/T5).

### Guardia `guard-identificador-de-request.test.ts` — hallazgo NO mio

Al correr la guardia completa aparece un hallazgo sobre `db/migrations/20260922150000_product_type_enum`
(no esta en `MIGRACIONES_ESPERADAS`) y tres tests mas
(`tests/unit/inventario/company-scope.test.ts`, `tests/unit/inventario/list-query.test.ts`,
`tests/unit/inventario/schema/inventario-schema.test.ts`) que fijan un censo de columnas de
`Product` sin la columna `type` que trajo esa misma migracion. Confirmado con
`git stash`+regenerar el cliente de Prisma que **ya estaba asi antes de esta tanda** (la migracion
es de otra ficha, `bc902800`, fusionada desde `dev` antes de que esta rama empezara). No se toca:
lo arregla quien sea dueno de esa migracion, actualizando esos cuatro censos y la lista de la
guardia.

## R → test (lo que esta tanda cubre)

| R | Qué exige | Test |
|---|---|---|
| R1 | Decimal(14,4) en lote, movimiento y producto | `tests/unit/inventario/schema/inventario-schema.test.ts` (`stock`/`qtyAlert` de `Product` y `ProductBatch`), `tests/unit/inventario/qc91-alcance.test.ts` (`R21: product_batches.stock sigue siendo la existencia del lote, ahora decimal(14,4)`), `tests/unit/inventario/schema/reservations-and-decimal-stock-migration.test.ts` (`R1: convierte las cuatro columnas...`) |
| R2 | La migración conserva el valor exacto de enteros ya guardados | `tests/integration/inventario/reservations-and-decimal-stock-migration.int.test.ts` (`R2: convertir a decimal(14,4) conserva exactamente el valor de un entero ya guardado`) |
| R45 | `down.sql` falla si queda parte decimal, y revierte limpio si no la hay | `tests/unit/inventario/schema/inventory-movement-kind-consumption-migration.test.ts` (`R45: el down.sql falla...`), `tests/unit/inventario/schema/reservations-and-decimal-stock-migration.test.ts` (`R45: el down.sql falla...`), `tests/integration/inventario/reservations-and-decimal-stock-migration.int.test.ts` (dos casos `R45`) |
| R46 | Identificadores en inglés, sin baja física en tablas de negocio | `tests/unit/inventario/schema/inventory-movement-kind-consumption-migration.test.ts` (`R46: no nombra ninguna tabla ni columna fuera de ingles...`), `tests/unit/inventario/schema/reservations-and-decimal-stock-migration.test.ts` (idéntico caso); `reservation_movements` sin `UPDATE`/`DELETE` en el SQL de la migración (revisado a mano, sin caso dedicado aún: T7 lo cierra con `guard-libro-de-inventario`) |
| R8 (parcial) | Orden de lotes: fecha ascendente, desempate numérico de lote | `tests/unit/inventario/batch-order.test.ts` (los cinco casos `R8:`) |

Los demás 43 requisitos (R3-R7, R9-R44, R47-R48) dependen de T4-T16 y se mapean en esas tandas.

## Salida de los comandos

### `pnpm run typecheck`

9 errores, los mismos antes y después de esta tanda (confirmado con `git stash` + regenerar el
cliente de Prisma sobre `HEAD`): todos por la columna `Product.type` que trajo
`20260922150000_product_type_enum`, no relacionados con esta ficha.

```
lib/modules/inventario/adapters/driven/persistence/product-prisma.ts(178,26): error TS2322 ...
tests/unit/inventario/product-prisma.test.ts(40,26): error TS2345 ... (x8, todas "Property 'type' is missing")
```

### `pnpm run lint`

Limpio, sin salida (`exit 0`).

### Tests

- Guardias `guard-empresa-en-esquema`, `guard-rls-force`, `guard-arquitectura-modulos`: **81/81
  verdes**.
- `guard-identificador-de-request`: 22/23 verdes; el único rojo es el hallazgo ajeno descrito
  arriba (`product_type_enum`).
- `guard-libro-de-inventario`: 13/13 verdes.
- Archivos nuevos y tocados de esta tanda (schema/migración, decimal-quantity, batch-order,
  order-cost, y los adaptadores/tests de `inventario` listados arriba): **todos verdes**.
- Corrida completa de los proyectos `node` + `ui` (7812 tests): **7691 pasan, 117 se saltan, 4
  fallan** — los mismos cuatro del hallazgo `product_type_enum` de arriba
  (`guard-identificador-de-request`, `company-scope.test.ts`, `list-query.test.ts`,
  `inventario-schema.test.ts`). Ningún otro archivo del proyecto `node`/`ui` quedó en rojo.
- Migraciones: `pnpm run db:migrate` (aplica T1+T2) → `pnpm run db:rollback` (revierte T2) →
  rollback adicional de T1 (moviendo T2 fuera del directorio para forzar el orden) → reaplicadas
  ambas con `pnpm run db:migrate`. `pnpm exec prisma generate` al final.

## Veredicto

T1, T2 y T3 completas y verificadas: migraciones aplican y revierten limpio (incluida la
reversión que falla a propósito con parte decimal), el dominio decimal-quantity/batch-order está
probado, `order-cost.test.ts` sigue verde sin cambios, y el typecheck/lint/tests no tienen ningún
rojo nuevo — solo el hallazgo `product_type_enum`, confirmado ajeno. T4 recibe el mapa exacto de
lo que quedó provisional.
