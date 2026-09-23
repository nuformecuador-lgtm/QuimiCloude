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

## Tanda T5 (2026-09-22)

### Qué hace

Cierra la superficie de UI que T4 dejó pendiente (`design.md > 2.1`, filas de `app/`): pintado
decimal con `formatDecimalDisplay` + `exactDecimalTitle` + `aria-label` (pregunta 5a), campos
decimales con `inputMode="decimal"` y coma→punto en el alta de lote y el ajuste, y la aritmética
exacta de los dos importes derivados del panel de costo con una cantidad decimal.

### Archivos de producción modificados

- `app/(private)/inventario/components/product-columns.tsx`: `stockCell`/`existenceLabel` pintan
  con `formatDecimalDisplay`, `title` con `exactDecimalTitle` y `aria-label` con la cifra completa
  (`trimDecimal`); nueva `qtyAlertCell` con el mismo tratamiento (antes `formatOptionalInt` pintaba
  la cadena cruda). `isBelowAlert` ya comparaba con `compareQuantities` desde T4; sin cambios ahí.
- `app/(private)/inventario/components/product-batches-panel.tsx`: `quantityLabel` pinta con
  `formatDecimalDisplay`; `title`/`aria-label` nuevos en la celda de cantidad.
- `app/(private)/inventario/components/product-form.tsx`: los campos `stock` y `qtyAlert` pasan de
  `type="number"` a `type="text"` + `inputMode="decimal"`, controlados con `sanitizeQuantityInput`
  (coma a punto, 4 decimales) — antes eran incontrolados con `defaultValue`. `parseInteger`
  (convertía a `number`) se sustituye por `parseDecimalField` (deja la cadena, sólo valida forma):
  el esquema de zod ya exige cadena decimal desde T4 y antes se le pasaba un `number`, que
  `safeParse` acepta sin error de tipos por ser `unknown` pero rechaza siempre en tiempo de
  ejecución — bug real que este cambio corrige, no sólo de tipos.
- `app/(private)/inventario/components/adjust-batch-dialog.tsx`: el campo `delta` pasa de
  `type="number" step={1}` a `type="text"` + `inputMode="decimal"`, controlado con
  `sanitizeDeltaInput` (con signo, coma a punto, 4 decimales). El chequeo de cero en cliente pasa
  de `INTEGER_PATTERN`/`Number(delta) === 0` a `DECIMAL_DELTA_PATTERN`/`ZERO_DELTA_PATTERN` sobre
  la cadena.
- `app/(private)/inventario/components/product-cost-amount.ts`: `multiplyCost`/`divideCost` pasan
  de `quantity: number` (con `Number.isInteger` como guarda) a `quantity: string` decimal; la
  aritmética escala la cantidad a 4 decimales con `BigInt` en vez de multiplicar/dividir por un
  entero de JavaScript. `sanitizeCostInput` se apoya en una `sanitizeUnsignedDecimalInput` interna,
  parametrizada por escala, de la que sale también `sanitizeQuantityInput` (4 decimales) para el
  alta de lote y `product-form.tsx`.
- `app/(private)/inventario/components/product-cost-fields.tsx`: `readQuantity` deja de convertir a
  `Number` y devuelve la cadena decimal tal cual (con el mismo patrón que el esquema del lote).
- `app/(private)/pedidos/components/order-ingredients-table.tsx`: `aria-label` nuevo en las cuatro
  celdas decimales (cantidad, stock, requerida, restante), con la cifra exacta
  (`trimDecimal`) — el `title` con `exactDecimalTitle` ya estaba desde antes de esta ficha. Se
  quita un `.toString()` redundante sobre `line.productStock`, que T4 ya dejó en `string`.
  «Restante» sigue restando de la existencia TOTAL, no de la disponible: N4 no tiene decisión que
  lo cambie (`design.md > 0.2`).
- `e2e/ajuste-de-inventario.spec.ts`: `fillAdjustDialog` recibe `delta: string` en vez de `number`;
  `HAPPY_DELTA` pasa de `6` a `'-0.5'` (negativo y decimal, el caso que pide `tasks.md > T5`). Los
  asserts que comparaban `Prisma.Decimal` con `.toBe(número)` pasan por `.toNumber()`. No se
  ejecutó (el encargo lo prohíbe expresamente en esta fase).

### Tests actualizados

Fixtures `stock`/`qtyAlert` de `number` a `string` (mismo `type: 'PRODUCT'` que ya traían donde
hacía falta): `tests/unit/inventario/{product-field,product-batches-panel,product-batches-sheet,
product-page}.test.tsx`, `tests/unit/pedidos-ui/order-form.test.tsx` (`productStock`),
`tests/unit/recetas-ui/recipe-form.test.tsx` (`stock`, `productStock`).
`tests/unit/inventario/batch-history.test.tsx`: `quantity: -3` a `'-3'`.
`tests/unit/inventario/adjust-batch-dialog.test.tsx`: fixture de lote a cadena; el resultado de
éxito de la action gana `reserved`/`overReserved` (tipo ampliado por T7, en paralelo, ajeno a esta
tanda); dos casos nuevos (`R6`: delta decimal `-0.5` viaja tal cual; coma se convierte en punto).
`tests/unit/inventario/product-cost-amount.test.ts`: reescrito con `quantity: string`; dos casos
nuevos (`R6`: `multiplyCost('12.50', '1.5')` y `divideCost('150.00', '2.5')`, que antes de esta
tanda rechazaban por no ser enteros y ahora dan resultado). `tests/unit/inventario/product-page.
test.tsx`: `Number(ALTA_VALIDA.stock)`/`Number(valor)` en los asserts de `toHaveValue` se quitan —
los campos ya no son `type="number"`—; dos casos nuevos (`R6`: pintado de `0.0001`/`1.5`/
`12345.6789` en `product-stock` y `product-qty-alert`, con `title`/`aria-label`).
`tests/unit/pedidos-ui/order-form.test.tsx`: se añaden los asserts de `aria-label` al caso ya
existente de «cantidad requerida»/«restante».

### Archivo nuevo

`tests/unit/inventario/decimal-quantity-convenciones.test.ts` — R6: ningún `Number(`,
`parseFloat(` ni `.toFixed(` en los seis archivos de esta tanda, con detector puro + barrido real +
caso negativo (mismo patrón que `conversionesDeImporte` de `pedidos-convenciones.test.ts`). No hay
guardia de ruta que cubra `app/(private)/inventario/components` con este alcance -
`product-route-contract.test.ts` vigila otras quince reglas, no ésta- ni `order-ingredients-
table.tsx`, que no vive bajo esa ruta.

### R → test de esta tanda

| R | Qué exige | Test |
|---|---|---|
| R6 | Pintado con `formatDecimalDisplay`/`exactDecimalTitle`/`aria-label`; ninguna cantidad pasa por coma flotante | `product-page.test.tsx` (dos casos `R6 —`), `product-batches-panel.test.tsx` (`R6 —`), `order-form.test.tsx` (aria-label en «cantidad requerida»/«restante»), `product-cost-amount.test.ts` (dos casos `R6 —`), `adjust-batch-dialog.test.tsx` (dos casos `R6 —`), `decimal-quantity-convenciones.test.ts` (los dos casos) |

R3, R4, R5 ya quedaron cubiertos por T4. El resto de los 48 requisitos dependen de T6-T16 y se
mapean en esas tandas; el mapa completo lo consolida T17.

### Salida de los comandos

**`pnpm run typecheck`**: 9 errores, los mismos de siempre — el hallazgo ajeno `product_type_enum`
(`product-prisma.ts` y las ocho líneas de `product-prisma.test.ts`). Ningún error de `app/**` ni de
`e2e/**`. Los errores nuevos que aparecieron a mitad de la tanda por `AdjustBatchStockFormState`
ganando `reserved`/`overReserved` (T7, en paralelo) se corrigieron en el mock del test propio
(`adjust-batch-dialog.test.tsx`).

**`pnpm run lint`**: limpio, sin salida (sólo un warning preexistente en
`reservation-prisma.ts`, de T7, ajeno a esta tanda).

**Tests**: `pnpm exec vitest related --run` sobre los siete archivos de producción tocados:
**461/461 pasan** (34 archivos). Además, dirigidos: `product-page.test.tsx` (62/62),
`order-form.test.tsx`/`recipe-form.test.tsx` (65/65), `product-cost-amount.test.ts`,
`product-batches-panel.test.tsx`, `product-batches-sheet.test.tsx`, `adjust-batch-dialog.test.tsx`,
`batch-history.test.tsx`, `product-field.test.tsx`, `decimal-quantity-convenciones.test.ts`: todos
verdes. Guardias: `product-route-contract.test.ts`, `pedidos-convenciones.test.ts` (20/20, 3
saltados por rango git ausente, igual que siempre), `guard-arquitectura-modulos.test.ts`: verdes.
No se corrió la suite completa ni `pnpm run e2e` (fuera del encargo de esta tanda).

## Veredicto T5

Hecho cuando pide `tasks.md`: pintado decimal con `formatDecimalDisplay`/`exactDecimalTitle` en los
cinco componentes de `design.md > 2.1` más `qtyAlert`, `aria-label` con la cifra completa en todos
ellos (decisión de F1.4 ampliada por el encargo: `aria-label`, no sólo `title`, para no depender de
`:hover`), campos con `inputMode="decimal"` y coma→punto en el alta y el ajuste, R6 con test de
componente para `0.0001`/`1.5`/`12345.6789` y guardia dedicada sin `Number(`/`parseFloat(`/
`.toFixed(`, y `e2e/ajuste-de-inventario.spec.ts` adaptado a un delta `-0.5` (sin ejecutar). No se
tocó `lib/**`; los únicos rojos son los nueve del hallazgo ajeno `product_type_enum`. No se hicieron
commits.

## Tanda T7 (2026-09-22)

### Qué hace

La reserva en la persistencia de `inventario` (`design.md > 6.3-6.5`, `> 5.1`, `> 5.5`, `> 10`):
`createMaterialReservations` (`syncForOrder`, `releaseForOrder`, `consumeForOrder`) sobre el
cliente que recibe, `consumeBatchStock` (decremento condicional del consumo) y `adjustBatchStock`
con `reserved`/`overReserved` (R33) en `product-prisma.ts`, `orderId`/`kind: 'consumption'` en
`batch-movement-prisma.ts`, los tipos de dominio que faltaban (`OrderNumberDirectory`,
`BatchHistoryEntry`, `ReservationMovementKind`), `ReservationQueries.findCoverageByOrderIds` y los
agregados de reservado/disponible por producto y por lote (para que T13 los consuma), el censo de
`guard-libro-de-inventario` a cuatro caminos, y `tests/integration/inventario/reservation.int.test.ts`.

### Archivos nuevos

- `lib/modules/inventario/adapters/driven/persistence/reservation-prisma.ts`: `createMaterialReservations(db, units)`
  implementa `MaterialReservations`; `createReservationQueries(db)` implementa `ReservationQueries`;
  `findReservedAndAvailableByBatch`/`findReservedAndAvailableByProduct` exportadas para T13.
- `lib/modules/inventario/domain/reservation-ledger.ts`: `netReservedQuantity`/`netReservedByBatch`,
  dominio puro (suma con signo de `reservation_movements`), compartido por `product-prisma.ts`
  (R33) y `reservation-prisma.ts` sin crear un import driven-a-driven cruzado (los dos son driven
  del mismo módulo, pero el cálculo no toca la base).
- `tests/integration/inventario/reservation.int.test.ts`: R12, R13, R17, R27, R28, R30, R32, R33,
  R39, más un caso directo de `consumeBatchStock`.

### Archivos modificados

- `lib/modules/inventario/domain/reservation.ts`: gana `OrderNumberDirectory` y `BatchHistoryEntry`
  (§5.5, §10; solo tipos, el caso de uso y las pantallas son T13).
- `lib/modules/inventario/domain/inventory-movement.ts`: `InventoryMovementView.kind` y
  `NewInventoryMovement.kind` ganan `consumption`; `NewInventoryMovement` gana
  `orderId: string | null`.
- `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`: `writeMovement`
  escribe `orderId`.
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`: los dos `writeMovement`
  de `createWithFirstBatch`/`addBatchToAlive` pasan `orderId: null`; `adjustBatchStock` devuelve
  `{ stock, reserved, overReserved }` (lee `reservation_movements` del lote en la misma
  transacción); nueva `consumeBatchStock` exportada (decremento condicional
  `productBatch.updateMany({ where: { id, companyId, stock: { gte: quantity } } })` + `writeMovement`
  `kind: consumption`, cantidad negativa, `orderId` en el cuerpo). No usa `.update()` singular para
  no chocar con el "un solo `update` en `adjustBatchStock`" que ya vigilaba `qc91-alcance`; usa
  `updateMany` a propósito, con su propio detector (ver más abajo).
- `lib/modules/inventario/ports/product-repository.ts` y `domain/adjust-batch-stock.ts`:
  `adjustBatchStock` devuelve `{ stock: string; reserved: string; overReserved: boolean }`.
- `lib/modules/inventario/adapters/driving/batch-actions.ts`: `AdjustBatchStockFormState` y
  `adjustBatchStockAction` propagan `reserved`/`overReserved`.
- `lib/modules/inventario/index.ts`: exporta `OrderNumberDirectory`, `BatchHistoryEntry`.
- `tests/guards/guard-libro-de-inventario.test.ts`: censo pasa de tres a cuatro caminos
  (`+ consumeBatchStock`).
- `tests/unit/inventario/qc91-alcance.test.ts`: `escrituraDestructivaDeLotes` deja de tratar
  `updateMany` como destructivo (era un falso positivo contra el `updateMany` legítimo y acotado
  de `consumeBatchStock`: su `where` ya trae el identificador único, así que solo puede tocar cero
  o una fila); nuevo detector `llamaAUpdateManyFueraDe` (mismo patrón que `llamaAUpdateFueraDe`,
  para `updateMany`) con sus propios casos fabricados, y una guardia real de que el único
  `updateMany` vive en `consumeBatchStock`.
- `tests/unit/inventario/qc121-alcance.test.ts`: `consumeBatchStock` es la única excepción
  documentada a "toda escritura exportada de `product_batches` recalcula `products.stock` en su
  propio cuerpo" — recalcula una vez por producto en `consumeForOrder`/`consumeWithoutReservation`
  (`reservation-prisma.ts`), no una vez por lote, para no sumar la misma tabla varias veces en una
  entrega con varios lotes del mismo producto. El recalculo sigue en la misma transacción (R28).
- Tests que ya rompían por el cambio de forma de `adjustBatchStock`/`writeMovement` (regresión
  directa de esta tanda, no del hallazgo ajeno): `tests/unit/inventario/authorization.test.ts`,
  `tests/unit/inventario/batch-movement-prisma.test.ts`,
  `tests/unit/inventario/adjust-batch-stock-prisma.test.ts` (añade el doble de
  `reservationMovement.findMany`, `orderId: null` en los `movementCreate` esperados, y un caso
  nuevo de R33).
- Tests de integración corregidos por `Prisma.Decimal` vs número crudo (pendiente de la tanda
  anterior, confirmado y resuelto en esta):
  `tests/integration/inventario/presentation-unit.int.test.ts` (`stock.toFixed(4)`),
  `tests/integration/inventario/inventario-constraints.int.test.ts` (`qtyAlert`/`stock` en cuatro
  sitios más la reescritura completa del caso `qty_alert es integer` a `numeric(14,4)`, pregunta 5b
  aprobada: el título, el tipo esperado y el aserto de que SÍ conserva el decimal, en vez de
  truncarlo), `tests/integration/inventario/inventory-movements-constraints.int.test.ts`
  (`batch.stock.toFixed(4)`, y el caso "clase fuera del enum" cambia su ejemplo de `consumption`
  —que ya es un valor válido del enum desde T1— a `bogus_kind`). `reservations-and-decimal-stock-migration.int.test.ts`
  y `product-stock.int.test.ts`/`company-scope-queries.int.test.ts` (los dos últimos, forma de
  `adjustBatchStock`) también se revisaron: solo los dos últimos necesitaban `reserved`/`overReserved`
  añadidos a su `toEqual`.
- `tests/integration/aislamiento.json`: registra `inventario/reservation.int.test.ts` como
  `commit`, con motivo.

### Decisiones de diseño tomadas dentro de T7 (no estaban en `design.md` al nivel de detalle del código)

1. **`consume` en `reservation_movements` se escribe por el importe QUE ESTABA RESERVADO, no por
   lo que el lote pudo dar de verdad.** Si una merma deja el lote con menos de lo apartado, el
   déficit se cubre de otro lote (pregunta 2); el asiento `consume` del lote ORIGINAL sigue siendo
   la cantidad completa que tenía reservada, porque lo que se resuelve es el apartado de ESE
   pedido en ESE lote (pasa a cero), no cuánto salió físicamente de él. Los lotes de RESPALDO
   -los que cubren el déficit sin haber tenido una reserva previa de este pedido- NO ganan ningún
   asiento en `reservation_movements`: no había ningún `reserve` que resolver, y escribir uno
   igualmente restaría del total agregado del lote (`design.md > 3.4`) sin que nadie lo hubiera
   apartado, hundiendo el «reservado» que ven otros pedidos sobre ese lote por debajo de la
   realidad. El libro FÍSICO (`inventory_movements`, `kind: consumption`) sí se asienta en TODOS
   los lotes tocados, con o sin reserva previa: es la salida real.
2. **N2 (pedido sin nada apartado) tampoco escribe `reservation_movements`**: no hay ningún
   `reserve` previo que netear, y por el mismo argumento del punto 1 un `consume` sin `reserve`
   correspondiente distorsionaría el agregado. Solo queda el rastro físico
   (`inventory_movements`).
3. **`insufficient` no lo deshace `reservation-prisma.ts`.** El contrato (§5.1) dice que las tres
   operaciones de `MaterialReservations` corren SIEMPRE dentro de la transacción que abre quien
   llama; si `consumeForOrder` devuelve `insufficient` después de escrituras parciales (p. ej. el
   consumo completo del lote mermado, antes de descubrir que el resto tampoco alcanza), es el
   LLAMANTE (T10, `pedidos`) quien tiene que lanzar para abortar la transacción entera (R15). El
   caso de integración de R30/`insufficient` lo demuestra envolviendo la llamada en su propia
   `prisma.$transaction` con una señal de rollback, simulando ese contorno.
4. **Bloqueo de productos, uno por uno y en orden ascendente**, en vez de un único
   `SELECT ... WHERE id IN (...) FOR NO KEY UPDATE`: no hay precedente en el repo de castear una
   lista de identificadores dentro de SQL crudo (`Prisma.join` no se usa en ningún sitio), y el
   patrón de una fila por vez con `${id}::uuid` ya es el que usan `addBatchToAlive` y
   `adjustBatchStock`. El orden ascendente sigue siendo el mismo tanto en una sentencia como en
   varias.

### R → test de esta tanda

| R | Qué exige | Test |
|---|---|---|
| R12 | Editar recalcula desde cero pero solo asienta la DIFERENCIA por lote | `reservation.int.test.ts` (`'bajar de 10 a 6 deja un reserve de 10 y un release de 4...'`) |
| R13 | Si tras editar ya no cubre, libera TODO lo apartado | `reservation.int.test.ts` (`'un pedido que ya no cabe en su lote libera su apartado entero'`) |
| R17 | Ningún asiento de reserva apunta a un pedido de otra empresa | `reservation.int.test.ts` (`'la FK compuesta (order_id, company_id) rechaza un pedido ajeno'`) |
| R27 | Entregar consume: baja el lote, asienta la salida, asienta el consumo | `reservation.int.test.ts` (`'consumeForOrder baja el lote apartado...'`, `'decrementa condicionalmente y asienta la salida negativa con el pedido'`) |
| R28 | Recalcula `products.stock` en la misma transacción | `reservation.int.test.ts` (mismo caso de R27: `productStockOf` tras `consumeForOrder`) |
| R30 | Merma completa desde otros lotes; si no alcanza, rechaza sin cambiar nada | `reservation.int.test.ts` (`'lo que falte en el lote apartado se cubre del siguiente lote...'`, `'SI NI ASI ALCANZA, rechaza la entrega con insufficient...'`) |
| R32 | No consume dos veces el material de un mismo pedido | `reservation.int.test.ts` (`'una segunda llamada de entrega, sin nada que respaldarla, no vuelve a tocar el lote'`) |
| R33 | Ajuste que deja el lote sobre-reservado se acepta y lo indica | `reservation.int.test.ts` (`'adjustBatchStock devuelve overReserved...'`), `adjust-batch-stock-prisma.test.ts` (`'R33: un delta que deja el apartado por encima...'`) |
| R39 | Ningún `UPDATE`/`DELETE` sobre los dos libros en `lib/**` | `reservation.int.test.ts` (`'ni reservation_movements ni inventory_movements se corrigen nunca...'` + detector probado con fuentes fabricadas) |

R1-R11, R14-R16, R18-R26, R29, R31, R34-R38, R40-R48 dependen de T8-T16 y se mapean en esas
tandas; el mapa completo lo cierra T17.

### Salida de los comandos

**`pnpm run typecheck`**: 9 errores, exactamente los del hallazgo ajeno `product_type_enum`
(`product-prisma.ts` filtro de `type`, 8 líneas de `product-prisma.test.ts` con
`Property 'type' is missing`). Ninguno nuevo.

**`pnpm run lint`**: limpio, sin salida.

**Tests**:
- `tests/integration/inventario/reservation.int.test.ts` (nuevo): **11/11 verdes**, contra la base
  efímera de integración (`qct_qc141_...`, plantilla reutilizada).
- `tests/integration/inventario/**` completo: **203/204 pasan**; el único rojo es el censo de
  columnas de `products` del hallazgo ajeno (`type`).
- `tests/unit/inventario`, `tests/unit/pedidos`, `tests/unit/recetas`, `tests/unit/asignaciones`:
  **2032 pasan, 3 fallan** — los tres del hallazgo ajeno (`company-scope.test.ts`,
  `list-query.test.ts`, `inventario-schema.test.ts`).
- Guardias (`vitest run guard`): **600 pasan, 1 falla** (`guard-identificador-de-request`, mismo
  hallazgo ajeno), incluidas `guard-libro-de-inventario` (censo de cuatro caminos),
  `guard-arquitectura-modulos`, `guard-empresa-en-esquema` en verde.
- `tests/integration/inventario/inventario-constraints.int.test.ts`,
  `inventory-movements-constraints.int.test.ts`, `presentation-unit.int.test.ts`: los tres
  corregidos por `Prisma.Decimal` crudo, **verdes salvo el hallazgo ajeno** (censo de columnas de
  `products` en `inventario-constraints`).
- `pnpm exec vitest related` sobre los diez archivos de producción tocados de esta tanda más
  `tests/integration/inventario` completo: sin ningún rojo nuevo fuera del hallazgo ajeno.
- No se corrió la suite completa ni E2E (fuera del encargo).

### Lo que queda para T8+

- `reservation-prisma.ts` no se cablea todavía en `lib/composition` (eso es T8, con
  `OrderUnitOfWork`).
- `findCoverageByOrderIds`, `findReservedAndAvailableByBatch/Product` están implementadas y
  probadas indirectamente por los casos de arriba, pero sin pantalla ni caso de uso que las
  consuma: T13/T14.
- `OrderNumberDirectory` es solo el tipo; su implementación (driven de `pedidos`) y su cableado son
  T8 (§5.5).

## Veredicto T7

Hecho cuando pide `tasks.md`: `reservation.int.test.ts` verde para R12, R13, R17, R27, R28, R30,
R32, R33, R39, y el censo de `guard-libro-de-inventario` pasa con `consumeBatchStock`. Sin
commits. Dos guardias hermanas (`qc91-alcance`, `qc121-alcance`) se actualizaron para reflejar la
misma decisión de diseño que ya modificaba `guard-libro-de-inventario` -un cuarto camino de
escritura con reglas propias, documentadas, no una relajación muda-. Se corrigieron además los
`Prisma.Decimal` crudos pendientes de la tanda anterior en tres archivos de integración, incluida
una reescritura de fondo (no solo de forma) en el caso de `qty_alert` que probaba lo contrario de
lo que la pregunta 5b aprobó.

---

## Parada tras T7 (2026-09-22) — el spec choca con `origin/dev`

**Estado.** T0–T7 cerradas y commiteadas. T8–T17 pendientes. `./init.sh --rapido` rojo en `typecheck`:
solo 9 errores de `Product.type` (deuda de `bc902800`, que llegó con el merge de `dev`). `dev`
ya la arregló (`645228b8`, `c77ec8b8`, `a57570f4`), pero esta rama todavía no ha mergeado esos commits.

**Por qué se para.** `origin/dev` ya trae QC-147 (`9003bf70`, migración
`20260922160000_recipe_lines_percentage`): `recipe_lines` pierde `quantity` y `unit_id`, gana
`percentage DECIMAL(5,2)` (las líneas suman 100 %), y la migración **borra todas las líneas de receta
existentes**. Lo que consume un pedido pasa a ser `cantidad del pedido × %` en la unidad del insumo, y
QC-147 dice expresamente que QC-141 «hereda la fórmula nueva». Contradice el spec aprobado en:
- design §6.1 / T6: `buildRequirement` = línea × pedido, con la unidad de la línea (ya implementado así).
- design §5.1: `ReservationRequirementLine.unitId` (la línea ya no tiene unidad).
- design §6.2, R9 y N3: la regla de la unidad sin base común deja de tener sentido tal como está escrita.
- R11 y N1: la escala de la necesidad cambia (4 decimales × 2 decimales / 100).
- design §4.3, T11 y R43: el SQL lee `recipe_lines.quantity` y la unidad de la línea; además, tras
  QC-147 los pedidos vivos no tienen líneas, así que la migración no apartaría nada.
- Colisión de timestamp: `20260922160000_inventory_movement_kind_consumption` (esta rama) y
  `20260922160000_recipe_lines_percentage` (dev) comparten prefijo.
- Merge con `origin/dev`: conflictos en `order-ingredients-table.tsx`, `order-cost.ts`,
  `get-recipe.ts`, `recipe-view.ts`, `guard-identificador-de-request.test.ts`,
  `order-ingredients-cost.int.test.ts`, `product-catalog.test.ts`, `product-prisma.test.ts`,
  `order-form.test.tsx` y `feature_list.json`.

---

## Paso 0, T6 (rehecha) y T7 (ajuste parcial) — 2026-09-23

### Paso 0 — censos de pedidos tras el merge

- `tests/integration/pedidos/order-crud.int.test.ts`: `expect(stockDespues.stock).toBe(batch.stock)`
  comparaba dos `Prisma.Decimal` con `toBe` (igualdad por referencia, no por valor: pasaba de
  casualidad). Cambia a `.toFixed(4)` en los dos lados.
- `tests/integration/pedidos/pedidos-constraints.int.test.ts`: el censo de columnas de `orders`
  no tenía `reserved_at` (QC-141). Añadida en su sitio alfabético, con un comentario de una línea
  igual al patrón de las demás columnas del censo.
- Commit `46cc70fd`.

### T6 — necesidad y reparto, rehechos según `design.md > 6.1-6.2` enmendados

- `lib/modules/pedidos/domain/order-requirement.ts`: `buildRequirement(lines: { productId;
  percentage }[], orderQuantity)` usa `consumedQuantity` del barril de `recetas` por línea; se
  retira toda la aritmética de cadenas propia (`parseDecimal`/`multiplyExact`/`formatScaled`) y
  `RequirementSourceLine` pierde `quantity`/`unitId`.
- `lib/modules/inventario/domain/reservation.ts`: `ReservationRequirementLine` pierde `unitId`;
  `ConsumptionOutcome` gana `{ kind: 'nothing_to_consume' }` (E2).
- `lib/modules/inventario/domain/plan-reservation.ts`: `PlanReservationInput` pierde `units`;
  se retira `resolveNeed` (convertía con `convertQuantity`/`IncompatibleUnitsError`). Un producto
  sin unidad ahora **cuenta como línea no cubierta** (`insufficientProductIds.add`) en vez de
  saltarse con `continue` — el bug de la versión N3 derogada. `need = ceilToScale4(line.quantity)`
  directo, sin conversión previa.
- Tests reescritos sin ningún caso de conversión ni de unidad sin base común:
  `tests/unit/pedidos/order-requirement.test.ts`, `tests/unit/inventario/plan-reservation.test.ts`.

### T7 — ajuste parcial: sin `UnitCatalog` en la persistencia

- `lib/modules/inventario/adapters/driven/persistence/reservation-prisma.ts`:
  `createMaterialReservations(db = prisma)` pierde el parámetro `units`; se retiran
  `resolveUnitConversions` y toda la reunión de `unitIds` antes de cada `planReservation`. Las tres
  llamadas (`syncForOrder`, la rama de déficit de `consumeForOrder`, `consumeWithoutReservation`)
  pasan `products`/`batches`/`requirement` directo. `consumeWithoutReservation` devuelve
  `{ kind: 'nothing_to_consume' }` sin tocar la base cuando `fallbackRequirement` está vacío (antes
  devolvía `consumed` sin escribir nada, que ocultaba el caso bajo un nombre que no era el suyo).
- `tests/integration/inventario/reservation.int.test.ts`: se retira `unitCatalogDe` y el `unitId`
  de `requirementOf`; el segundo caso de R32 (segunda entrega sin nada que respaldarla) ahora
  espera `nothing_to_consume` en vez de `consumed`, que es el contrato correcto tras el cambio.
  Caso nuevo `R50` (`'un pedido sin nada apartado y con la receta sin lineas devuelve
  nothing_to_consume sin escribir nada'`): comprueba que ni `reservation_movements` ni
  `inventory_movements` ganan filas y que el lote/producto no cambian de existencia.
- No hubo que tocar `lib/composition` ni otro llamante: `createMaterialReservations` todavía no
  está cableada (T8).
- Commits `a4c02ad3` (T6) y `152d8efe` (T7).

### R → test de esta tanda

| R | Qué exige | Test |
|---|---|---|
| R8 | Orden de lotes: fecha ascendente, desempate numérico de lote | `plan-reservation.test.ts` (los dos casos `R8:`) |
| R9 | Producto sin unidad = línea no cubierta, arrastra a todo el pedido (E1) | `plan-reservation.test.ts` (`'R9: un producto sin unidad no se cubre y arrastra a todo el pedido'`) |
| R10 | Todo o nada: un ingrediente que no alcanza no aparta ninguno | `plan-reservation.test.ts` (`'R10: si un ingrediente no alcanza...'`) |
| R11 | Aparta exacto sin redondear cuando cabe en 4 decimales; techo hacia arriba si no cabe | `plan-reservation.test.ts` (los tres casos `R11:`), `order-requirement.test.ts` (los dos casos `R11:`) |
| R49 | Receta vacía: necesidad vacía y `reserved` sin asignaciones (E2) | `plan-reservation.test.ts` (`'R49: ...'`), `order-requirement.test.ts` (`'R49: ...'`) |
| R12 | Editar recalcula, asienta solo la diferencia | `reservation.int.test.ts` (sin cambio de tanda, sigue verde) |
| R13 | Si ya no cubre, libera todo | `reservation.int.test.ts` (sigue verde) |
| R17 | Ningún asiento apunta a un pedido de otra empresa | `reservation.int.test.ts` (sigue verde) |
| R27, R28 | Entregar consume y recalcula `products.stock` en la misma transacción | `reservation.int.test.ts` (sigue verde) |
| R30 | Merma completa desde otro lote; si no alcanza, rechaza sin cambiar nada | `reservation.int.test.ts` (sigue verde) |
| R32 | No consume dos veces | `reservation.int.test.ts` (ajustado a `nothing_to_consume`) |
| R33 | Ajuste que sobre-reserva se acepta y se marca | `reservation.int.test.ts` (sigue verde) |
| R39 | Ningún `UPDATE`/`DELETE` sobre los dos libros en `lib/**` | `reservation.int.test.ts` (sigue verde) |
| R50 | Entregar sin apartado y sin necesidad de respaldo: `nothing_to_consume` sin escribir nada | `reservation.int.test.ts` (`'R50: ...'`) |

### Salida de los comandos

**`pnpm run typecheck`**: limpio, 0 errores (el hallazgo ajeno `product_type_enum` ya lo arregló
`dev` antes del merge de esta rama).

**`pnpm run lint`**: limpio, sin salida.

**Tests**:
- `pnpm exec vitest related --run` sobre los cuatro archivos de dominio/adaptador tocados
  (`order-requirement.ts`, `reservation.ts`, `plan-reservation.ts`, `reservation-prisma.ts`),
  proyecto `node`: **1271 pasan, 5 se saltan** (67 archivos).
- `tests/integration/inventario/reservation.int.test.ts` (`--project=integration`): **12/12
  pasan** (11 + el caso nuevo `R50`).
- `tests/integration/pedidos/order-crud.int.test.ts` + `pedidos-constraints.int.test.ts`
  (`--project=integration`): **49/49 pasan**.
- `tests/integration/inventario/**` completo (`--project=integration`): **207/207 pasan**.
- `tests/guards/guard-libro-de-inventario.test.ts` + `guard-arquitectura-modulos.test.ts`:
  **76/76 pasan**.
- `tests/unit/inventario` + `tests/unit/pedidos` + `tests/unit/recetas` completos: **1712 pasan, 1
  falla, 8 se saltan** — el único rojo es
  `tests/unit/recetas/schema/recipe-lines-percentage-migration.test.ts` (`'el timestamp es
  posterior al de la ultima migracion conocida'`), un hallazgo **ajeno**: quedó así tras la
  renumeración de migraciones de la tanda TM (commit `5e1d7572`, previo a esta sesión, dueño de
  `20260922160000_recipe_lines_percentage` de QC-147), no lo tocó ni lo causó esta tanda. No
  estaba en el encargo del Paso 0 ni de T6/T7; no se corrige aquí.

### Veredicto

Paso 0, T6 y T7 (ajuste parcial) cerrados: `plan-reservation.ts`, `reservation.ts` y
`order-requirement.ts` sin ninguna conversión de unidades ni caso de unidad sin base común;
`reservation-prisma.ts` sin `UnitCatalog`; `nothing_to_consume` cubierto con un caso que demuestra
que no escribe nada en ningún libro. `typecheck` y `lint` limpios. Único rojo detectado en la
corrida amplia es ajeno (migración de QC-147, tanda TM anterior a esta sesión).

*Nota del implementer:* ese rojo no era ajeno: lo causó la renumeración de TM. Se corrigió en
`9cbf62cc` (el orden se mide contra las migraciones de las que depende).

---

## Tanda 2 (2026-09-23): TM, T8-T16 y limpieza de comentarios

Consolida lo que el implementer coordinó tras la enmienda (D19; E1 y E2 aprobados).

### Estado de las tasks

| Task | Estado | Commits |
|---|---|---|
| TM | **abierta**: código hecho, faltan dos verificaciones de base (abajo) | `5e1d7572` renumeración, `fe240487` merge de `origin/dev` (`0093acf9`: QC-147 y QC-146), `46cc70fd`, `9cbf62cc`, `4b45c83b` (tests rotos por el merge o la renumeración) |
| T6 | [x] | `a4c02ad3` |
| T7 | [x] | `152d8efe` |
| T8 | [x] | `cac9f6c9` |
| T9 | [x] | `94f566b4`, `9b28f846`, `f36df156` |
| T10 | [x] (su E2E sin ejecutar) | `ff9dfd6b`, `1ec2a2b5`, `c1cd169b`, `810e9876`; fixture E2E `28ea602c` |
| T11 | [x] | `167d9c93` |
| T12 | **parcial, bloqueada** | `3c721563` (dominio, secreto y unitarios) |
| T13 | [x] | `3ff3cfad` (backend), `9a76ed95` (UI) |
| T14 | [x] | `c1b3167a` (backend), `b080fc0b` (UI) |
| T15 | [x] | `b7ca7fdb` |
| T16 | escrita, **sin ejecutar** | `edf2ef8b`, `c029c262` (censo de la guardia) |
| T17 | pendiente | — |
| Comentarios de la rama | limpios | `0a222afe`, `514b9905`, `c37559cc`, `b5076ba2` |

### TM: lo que queda abierto

1. **No se tocó la base de desarrollo compartida `QuimiCloude`.** Otra sesión ya le había aplicado
   `20260922130000_orders_presentation` y `20260922160000_recipe_lines_percentage`, y todavía tiene
   aplicadas nuestras dos migraciones con el nombre viejo. El clasificador de permisos denegó
   revertirlas ahí («Modify Shared Resources»). El gate no depende de esa base (la integración usa
   bases efímeras desde plantilla), pero `db:test status` la verá con dos migraciones que ya no
   existen en disco y tres por aplicar. Lo decide el humano.
2. **No está demostrado que `…120000` revierta sobre una base con QC-147.** Sobre una base efímera
   copiada de la plantilla, `…120100` revierte y reaplica limpia. Para revertir `…120000`,
   `scripts/db-rollback.ts` tiene que verla como la última carpeta, y eso exige mover
   temporalmente la de `…120100`: acción denegada («Irreversible Local Destruction»). Su `down.sql`
   lo cubren los tests de esquema de T1.

### Bloqueo de T12 (decisión humana)

`findExpirableOrders` (`design.md > 9.1`) lee `orders` de **todas** las empresas: el proceso diario
no actúa en nombre de ninguna. `guard-ambito-empresa-pedidos` la rechaza (sin `scope`, SQL sin
`company_id`). Según su cabecera, una consulta sin ámbito solo entra con una excepción con nombre
aprobada por un humano en el spec, y nunca la añade quien escribe el adaptador. El spec aprobado
dice «todas las empresas», pero no menciona la guardia. Hecho: `order-expiry.ts`,
`expire-stale-orders.ts` (dominio puro), `cron-secret-env.ts` y sus unitarios. Falta: la consulta,
el handler, `app/api/cron/caducar-pedidos/route.ts`, `vercel.json`, `.env.example`, el cableado y
los tests de R23, R24 (handler) y R25 (integración con ejecuciones solapadas).

### Para la revisión: decisiones de subagentes sobre guardias

- **T8**: `order-unit-of-work-prisma.ts` importa `prisma` con el alias `sharedPrismaClient`. Motivo:
  la expresión `TOCA_LA_BASE` de `guard-ambito-empresa-pedidos` solo reconoce `prisma.`/`tx.`, y
  daba un falso positivo en una función que solo abre la transacción. En la práctica **esquiva la
  guardia cambiando el nombre**: decide el reviewer o el humano.
- **T8**: `insertAliveOrder` copia el `INSERT` de `createOrder`, porque un test anti-placebo de la
  misma guardia exige SQL crudo dentro de `order-prisma.ts:createOrder`. `createOrder` se conserva
  porque lo usa `order-sequence.int.test.ts`.
- **T10**: la misma guardia ganó en `cableadoDe` el reconocimiento de `metodo: fabrica(...)` y un
  `METODOS_DELEGADOS_EN_DOMINIO` para `transitionAliveById`, que ahora cablea `createTransitionOrder`.
  No es una consulta sin ámbito, pero amplía la guardia y la escribió quien hizo el cableado.
- **`error-codes.ts`**: en su registro de enmiendas todas las entradas previas citan su ficha; la
  entrada nueva va sin cita, por la regla de comentarios.

### Archivos creados en esta tanda (además de los de «Paso 0, T6 y T7»)

- `db/migrations/20260923120200_reserve_existing_orders/{migration.sql,down.sql}`.
- `lib/modules/pedidos/ports/{order-unit-of-work,order-write-repository}.ts`.
- `lib/modules/pedidos/adapters/driven/persistence/{order-unit-of-work-prisma,order-number-directory-prisma}.ts`.
- `lib/modules/pedidos/adapters/driven/config/cron-secret-env.ts`.
- `lib/modules/pedidos/domain/{transition-order,find-coverage,order-expiry,expire-stale-orders}.ts`.
- `tests/helpers/order-unit-of-work-double.ts`.
- `tests/integration/inventario/reserve-existing-orders-migration.int.test.ts`,
  `tests/integration/pedidos/{order-unit-of-work,order-reservation,order-reservation-concurrency}.int.test.ts`,
  `tests/unit/pedidos/{transition-order,find-coverage,expire-stale-orders,cron-secret-env}.test.ts`,
  `tests/unit/pedidos-ui/order-sheet-coverage.test.tsx`, `e2e/reserva-de-material.spec.ts`.

### Archivos modificados (principales)

`db/schema.prisma` (merge), `lib/composition/index.ts`; en `pedidos`: `create-order`, `update-order`,
`cancel-order`, `delete-order`, `order-catalog`, `errors`, `index`, `ports/order-repository`,
`order-prisma`, `order-actions`; en `asignaciones`: `finish-assigned-order`, `errors`,
`start-assigned-order`, `index`; en `errores`: `error-codes`, `error-catalog`; en `inventario`:
`product-view`, `product-batch-view`, `list-batch-movements`, `ports/product-repository`,
`product-prisma`, `batch-movement-prisma`, `company-scope`, `reservation-prisma`, `batch-actions`;
en `recetas`: `recipe-view` y `get-recipe` (merge). En UI:
`app/(private)/inventario/components/{product-columns,product-columns-skeleton,product-batches-panel,batch-history,adjust-batch-dialog,index}`
y `app/(private)/pedidos/components/{order-status-badge,order-columns,order-list-section,order-table,order-sheet,order-form,order-list-skeleton,order-ingredients-table,index}`.
Además: `e2e/ejecucion-receta.spec.ts` (receta con una línea al 100 % y un lote), las guardias
`guard-identificador-de-request` (censos de migraciones y E2E) y `guard-ambito-empresa-pedidos`,
`tests/integration/aislamiento.json`, y los tests ajustados que lista cada commit.

### R → test (acumulado; T17 lo cierra)

| R | Test |
|---|---|
| R1, R2, R45, R46 | ver «Tanda T1 — T3» |
| R3, R4, R5 | ver «Tanda T4» |
| R6 | ver «Tanda T5»; `batch-history.test.tsx` («R6 — la cantidad de cada asiento…») |
| R7, R20 | `tests/integration/pedidos/order-reservation.int.test.ts` («R7, R20 — crear aparta y fija reserved_at») |
| R8, R10 | `tests/unit/inventario/plan-reservation.test.ts` (casos `R8:`, `R10:`) |
| R9 | `plan-reservation.test.ts` («R9: un producto sin unidad no se cubre y arrastra a todo el pedido») |
| R11 | `plan-reservation.test.ts` (tres `R11:`), `tests/unit/pedidos/order-requirement.test.ts` (dos `R11:`) |
| R12, R13 | `tests/integration/inventario/reservation.int.test.ts`; `order-reservation.int.test.ts` («R12 — …», «R13 — …») |
| R14 | `order-reservation.int.test.ts` («R14 — editar la receta no toca lo apartado…») |
| R15 | `tests/integration/pedidos/order-unit-of-work.int.test.ts`; rechazos sin cambios en `order-reservation.int.test.ts` |
| R16 | `tests/integration/pedidos/order-reservation-concurrency.int.test.ts` («R16 — dos altas simultaneas…») |
| R17 | `reservation.int.test.ts` (FK compuesta) |
| R18, R19 | `order-reservation.int.test.ts` («R18 — cancelar libera con autor», «R19 — borrar libera») |
| R21, R22, R25, R26 | `tests/unit/pedidos/expire-stale-orders.test.ts` (solo dominio: T12 bloqueada) |
| R23 | **sin test** (T12 bloqueada) |
| R24 | `tests/unit/pedidos/cron-secret-env.test.ts` (solo el secreto; falta el handler) |
| R27, R28 | `reservation.int.test.ts`; `tests/unit/pedidos/transition-order.test.ts`; `order-reservation.int.test.ts` («R27, R28: Finalizar…») |
| R29 | `order-reservation.int.test.ts` («R29 — editar a ENTREGADO cambiando cantidad recalcula y consume») |
| R30, R31 | `reservation.int.test.ts`; `transition-order.test.ts`; `order-reservation.int.test.ts`; `tests/unit/asignaciones/finish-assigned-order.test.ts` |
| R32 | `reservation.int.test.ts`; `order-reservation.int.test.ts` («R32: un segundo Finalizar…») |
| R33 | `reservation.int.test.ts`, `adjust-batch-stock-prisma.test.ts`, `adjust-batch-dialog.test.tsx` («R33 — …») |
| R34, R37 | `reservation.int.test.ts` («R34, R37 — …»); `product-batches-panel.test.tsx` |
| R35 | `tests/unit/pedidos/find-coverage.test.ts`; `order-columns.test.tsx`, `order-list-section.test.tsx`, `order-sheet-coverage.test.tsx` |
| R36 | `reservation.int.test.ts` («R36 — …»); `product-page.test.tsx` |
| R38 | `reservation.int.test.ts`; `adjust-batch-stock.test.ts`; `batch-history.test.tsx` |
| R39 | `reservation.int.test.ts` |
| R40 | `tests/unit/inventario/authorization.test.ts` |
| R41 | `create-order`, `update-order`, `cancel-order` y `delete-order.test.ts` («R41: el permiso se exige ANTES…»); `tests/unit/pedidos/authorization.test.ts` |
| R42 | `reservation.int.test.ts` («R42 — …») |
| R43, R44 | `tests/integration/inventario/reserve-existing-orders-migration.int.test.ts` (con paridad contra `planReservation`) |
| R47 | `guard-dependencias-aprobadas` (sin cambios en `package.json`) |
| R48 | `e2e/reserva-de-material.spec.ts` (**sin ejecutar**) |
| R49 | `plan-reservation`, `order-requirement`, `create-order` y `update-order.test.ts`; `order-reservation.int.test.ts`; `reserve-existing-orders-migration.int.test.ts` |
| R50 | `reservation.int.test.ts`, `transition-order.test.ts`, `update-order.test.ts`, `finish-assigned-order.test.ts`, `order-reservation.int.test.ts` |

Sin test: **R23**. R21, R22, R24, R25 y R26 solo en su parte de dominio (T12).

### Salida de los comandos al cierre (HEAD `b5076ba2` más `tasks.md`)

- `pnpm run typecheck`: sin errores. `pnpm run lint`: sin salida.
- `pnpm run test:rapido` (los tests que corre `./init.sh --rapido`): relacionados **424 archivos,
  6245 pasan, 29 saltados, 0 fallan**; guardias **48 archivos, 605 pasan, 9 saltados, 0 fallan**.
- `./init.sh --rapido`: **rojo antes de los tests**, en la validación de `feature_list.json`:
  `zona fullstack: QC-121, QC-141, QC-146, QC-147 (4 in_progress, max 3)`. QC-146 y QC-147 llegan
  en `in_progress` con el `feature_list.json` de `dev`, con sus PR ya mergeados. Es bookkeeping del
  leader, no de esta rama.
- No se ejecutaron, por regla: la suite completa, `./init.sh` completo y los E2E (nuevo
  `reserva-de-material.spec.ts`; modificados `ejecucion-receta.spec.ts` y `ajuste-de-inventario.spec.ts`).
