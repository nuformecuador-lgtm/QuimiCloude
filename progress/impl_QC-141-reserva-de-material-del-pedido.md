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

## Tanda T4 (2026-09-23)

### Qué hace

Cierra lo que T1-T3 dejó provisional (`design.md > 2.1`, `> 2.4`): tipos de dominio de `inventario`
a cadena, esquemas zod del alta y del ajuste decimales, `deriveUnitCost` con existencia decimal,
mensaje de N9, lectores de `FormData` decimales, `recalculateProductStock` movida a SQL y
exportada, filtros de rango con `Prisma.Decimal`, y el reflejo en `recetas` (`recipe-view.ts`,
`get-recipe.ts`) y en `pedidos/domain/order-cost.ts` (el `String(batch.stock)` provisional).

### Archivos de producción modificados

- `lib/modules/inventario/domain/product-view.ts`: `ProductView.stock`/`.qtyAlert` y
  `NewProduct.qtyAlert` a `string`.
- `lib/modules/inventario/domain/product-batch-view.ts`: `stock: string`.
- `lib/modules/inventario/domain/inventory-movement.ts`: `quantity: string` en las dos vistas (sin
  tocar `kind` ni `orderId`: eso es T7, que además va a añadir una línea al barril).
- `lib/modules/inventario/domain/costing-batch.ts`: `stock: string`.
- `lib/modules/inventario/domain/product-batch.ts`: `NewProductBatch.stock: string`.
- `lib/modules/inventario/domain/product-stock.ts`: reescrito; `sumStockByUnit`/`singleUnitStock`
  suman con `addQuantities`/`compareQuantities` de `decimal-quantity.ts` en vez de `number`.
- `lib/modules/inventario/domain/unit-cost.ts`: `deriveUnitCost(totalCost, stock: string)`;
  divide `total × 10⁴ / stock` sobre enteros escalados, rechaza existencia cero o con forma
  inválida (R5).
- `lib/modules/inventario/domain/product-batch-input.ts`: `stockSchema` pasa a cadena decimal
  (`^\d{1,10}(\.\d{1,4})?$`, R3); el `superRefine` compara con `compareQuantities` en vez de
  `Number.isInteger`/`< 1`; mensaje de existencia cambia a "mayor que 0" (N9).
- `lib/modules/inventario/domain/product-input.ts`: `qtyAlert` pasa de entero a decimal
  (pregunta 5b aprobada).
- `lib/modules/inventario/domain/adjust-batch-stock.ts`: `delta` pasa a cadena decimal con signo
  (R4); el `refine` comprueba primero el patrón para no lanzar dentro de `compareQuantities` con
  una cadena que el `regex` ya rechazó (zod sigue evaluando `refine` aunque `regex` falle);
  devuelve `{ stock: string }`.
- `lib/modules/inventario/ports/product-repository.ts`: `adjustBatchStock(delta: string): Promise<{ stock: string } | null>`.
- `lib/modules/inventario/adapters/driving/batch-actions.ts` y `product-actions.ts`: lectores de
  `FormData` decimales (`readOptionalFormDecimal`) en vez de enteros; mensajes actualizados.
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`: `toProductView`,
  `toBatchView` y `adjustBatchStock` leen con `.toFixed(4)`; filtros `numberRange` de
  `stock`/`qtyAlert` pasan por un `toDecimalRange` local (mismo patrón que
  `pedidos/order-prisma.ts`); `recalculateProductStock` reescrita a
  `UPDATE products SET stock = COALESCE((SELECT sum(stock) FROM product_batches WHERE …), 0)` y
  **exportada** (ya no usa `tx.productBatch.findMany` ni `singleUnitStock`).
- `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`: `toMovementView`
  con `.toFixed(4)`.
- `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`:
  `findAliveProducts`/`toCostingBatch` con `.toFixed(4)` en vez de `.toNumber()`.
- `lib/modules/recetas/domain/recipe-view.ts` y `get-recipe.ts`: `RecipeLineView.productStock:
  string | null`; `'0.0000'` en vez de `0` cuando el producto no tiene lotes.
- `lib/modules/pedidos/domain/order-cost.ts`: `String(batch.stock)` → `batch.stock` (ya es
  cadena).

### Componentes tocados por typecheck forzado (mínimo, NO es el trabajo de T5)

- `app/(private)/inventario/components/product-columns.tsx`: `formatOptionalInt` acepta
  `string | null`; `isBelowAlert` compara `typeof === 'string'` en vez de `'number'` —
  **la comparación sigue siendo lexicográfica, no decimal exacta** (queda un `TODO` en el
  archivo); T5 tiene que cambiarla a `compareQuantities` del barril de `inventario` como parte de
  su propio trabajo de `design.md > 2.1` fila `product-columns.tsx`.
- `app/(private)/inventario/components/product-name-picker.tsx`: `ProductNameOption.qtyAlert:
  string | null`.

Nada más de `app/**` se tocó. `product-batches-panel.tsx`, `product-form.tsx`,
`adjust-batch-dialog.tsx`, `order-ingredients-table.tsx` (y sus tests `.test.tsx`) son T5.

### Tests actualizados (fixtures/expectativas, mismo comportamiento salvo donde el requisito cambió)

`decimal-quantity.test.ts`/`batch-order.test.ts` no se tocaron (ya en verde desde T3). Se
actualizaron por el cambio `number → string`/`Prisma.Decimal`:
`tests/unit/inventario/{unit-cost,product-stock,product-batch-input,product-input,create-product,
adjust-batch-stock,batch-actions,product-actions,authorization,company-isolation-service,
product-catalog,product-catalog-costing,product-service,product-prisma,adjust-batch-stock-prisma,
product-batch-lot-retry,batch-movement-prisma,qc91-alcance}.test.ts`,
`tests/unit/pedidos/{order-cost,create-order,update-order}.test.ts`,
`tests/unit/recetas/recipe-service.test.ts`,
`tests/integration/inventario/{product-stock,ledger-cuadre,company-scope-queries,
list-query-indexes,list-query-products,product-batch-lot,product-batch-write}.int.test.ts`,
`tests/integration/pedidos/order-ingredients-cost.int.test.ts`.

`qc91-alcance.test.ts`: el único caso que cambia de aserción (no solo de fixture) es
`'R1 (QC-141 R6): recalculateProductStock suma los lotes en SQL, no en JavaScript'` — antes
exigía `singleUnitStock`/`sumStockByUnit` y prohibía `SUM(...)` en SQL crudo dentro de esa
función; ahora exige lo contrario porque `design.md > 2.1` movió la suma a Postgres (R6: ningún
`Decimal` pasa por `number` antes de sumar). Es la única guardia de QC-91 que el cambio de T4
contradice, y se corrige en vez de dejarla roja.

`product-stock.int.test.ts`: reescrito con decimales según pide `tasks.md > T4`. Añade el caso
`'R3: dos lotes con decimales exactos suman sin rastro de coma flotante'` (`1.5` + `0.0001` =
`1.5001`, que en coma flotante binaria no cuadra).

### R → test de esta tanda

| R | Qué exige | Test |
|---|---|---|
| R3 | Alta acepta existencia decimal ≥ 0 hasta 4 decimales; rechaza negativa, >4 decimales, >10 enteros o no-plana | `product-batch-input.test.ts` ('acepta el importe...', 'R3: el alta exige la existencia...'), `product-stock.int.test.ts` ('R3: dos lotes con decimales exactos...') |
| R4 | Ajuste acepta cantidad con signo, ≠0, hasta 4 decimales; rechaza cero, >4 decimales, no-plana | `adjust-batch-stock.test.ts` (bloque 'QC-92 R4 — la cantidad decimal del ajuste', los siete casos) |
| R5 | Deriva `total / existencia` decimal con redondeo mitad arriba; existencia cero rechaza | `unit-cost.test.ts` (todos los casos, incluido 'R5: divide con una existencia decimal, no solo entera') |
| R6 (parcial) | Ninguna cantidad pasa por coma flotante binaria | `unit-cost.test.ts` ('no convierte ningún importe...'), `qc91-alcance.test.ts` ('R1 (QC-141 R6)...'), `product-stock.int.test.ts` ('R3: dos lotes con decimales exactos...') |

R1, R2, R45, R46, R8(parcial) ya estaban cubiertos por T1-T3. El resto de los 48 requisitos
dependen de T5-T16 y se cierran en esas tandas; el mapa completo lo consolida T17.

### Salida de los comandos

**`pnpm run typecheck`**: 45 errores, sin ningún error nuevo fuera de lo esperado:
- 9 son el hallazgo ajeno `product_type_enum` de siempre (`product-prisma.ts` línea 188 por el
  desplazamiento del `toDecimalRange` nuevo, y las 8 líneas de `product-prisma.test.ts` con
  `Property 'type' is missing`).
- 36 son `Type 'number' is not assignable to type 'string'` en ocho archivos `.tsx`/`.ts` de T5:
  `adjust-batch-dialog.test.tsx`, `batch-history.test.tsx`, `product-batches-panel.test.tsx`,
  `product-batches-sheet.test.tsx`, `product-field.test.tsx`, `product-page.test.tsx`,
  `pedidos-ui/order-form.test.tsx`, `recetas-ui/recipe-form.test.tsx` — todos prueban componentes
  que T5 tiene que actualizar a cadena; arreglarlos aquí sería adelantar ese trabajo sin ver el
  componente real.

**`pnpm run lint`**: limpio, sin salida.

**Tests** (`pnpm exec vitest run … --project=node`, más `--project=integration` para los `.int.`):
- `tests/unit/inventario/`, `tests/unit/pedidos/`, `tests/unit/recetas/`: **1516 pasan, 5 se
  saltan, 3 fallan** — los mismos tres del hallazgo `product_type_enum`
  (`company-scope.test.ts`, `list-query.test.ts`, `inventario-schema.test.ts`).
- `tests/guards/`: **534 pasan, 1 falla** (`guard-identificador-de-request`, mismo hallazgo
  ajeno), incluidos `guard-libro-de-inventario` (13/13) y `guard-arquitectura-modulos` en verde.
- Integración (base efímera propia, `qct_qc141_…`): `product-stock`, `ledger-cuadre`,
  `company-scope-queries`, `list-query-indexes`, `list-query-products`, `product-batch-lot`,
  `product-batch-write`, `order-ingredients-cost`: **124/124 pasan**.
- No se corrió la suite completa ni E2E (prohibido por el encargo). Otros `.int.test.ts` que leen
  `stock`/`quantity` por Prisma crudo sin pasar por los adaptadores de este módulo
  (`inventario-constraints.int.test.ts`, `inventory-movements-constraints.int.test.ts`,
  `presentation-unit.int.test.ts`, `reservations-and-decimal-stock-migration.int.test.ts`) NO se
  corrieron ni se tocaron: no están en la lista de `design.md > 2.4` ni en el encargo de T4: si
  siguen comparando un `Prisma.Decimal` con `.toBe(número)` van a fallar por el mismo motivo que
  los que sí se corrigieron aquí, heredado de la migración de T2, no de esta tanda.

### Lo que queda para T5

1. `product-columns.tsx`: `isBelowAlert` compara `qtyAlert > stock` lexicográficamente; cambiar a
   `compareQuantities`.
2. Pintado con `formatDecimalDisplay`/`exactDecimalTitle`/`aria-label` en
   `product-columns.tsx`, `product-batches-panel.tsx`, `product-form.tsx`,
   `adjust-batch-dialog.tsx`, `order-ingredients-table.tsx` (`design.md > 2.1`, T5 de
   `tasks.md`).
3. Los ocho archivos de test `.tsx` listados arriba en "typecheck" quedan en rojo hasta que T5
   actualice el componente Y su test a la vez (arreglar solo el test sin ver el componente real
   habría sido adivinar la forma final).
4. `qtyAlert` en `product-form.tsx`/`product-name-picker.tsx` sigue leyéndose con
   `readOptionalFormInt`/comparado como antes en el resto del formulario: el candidato del alta
   ahora envía `qtyAlert` como cadena hacia el caso de uso (ya corregido en
   `product-actions.ts`), pero el `<input type="number">` y su validación en cliente
   (`product-form.tsx`) siguen sin ofrecer decimales; no se tocó por ser UI.

## Veredicto T4

Hecho cuando pide `tasks.md`: `R3`, `R4`, `R5` con los seis casos pedidos (`1.5`, `0.0001`, cinco
decimales, cero, negativo, notación científica) tienen test y pasan; el test de integración de
sumas de `product-stock.int.test.ts` está reescrito con decimales y pasa contra Postgres real.
Typecheck y tests no tienen ningún rojo nuevo fuera de los nueve del hallazgo ajeno
`product_type_enum` y los treinta y seis que son la superficie exacta de T5. No se hicieron
commits.
