# QC-123 — el-total-del-pedido-decidir-donde-vive-el-precio · tasks.md

> Orden de arriba abajo salvo donde se marque `[P]`. Cada task dice **qué archivos toca** y su
> **criterio de hecho**. Nada se da por hecho sin gate (`CLAUDE.md`, regla 5): `./init.sh --rapido`
> por tanda, `./init.sh` completo antes del PR.
> Los comentarios que se escriban en producción **no citan fichas ni requisitos**
> (`docs/conventions.md > Comentarios`); `R<n>` sí va en el **nombre de los tests**.

---

## [x] T0 — Lo que se HEREDA montado y NO se re-crea

No es una task de escritura: es la lista de lo que ya existe y que el implementer **no** debe
volver a construir. Criterio de hecho: leídas las seis piezas y confirmadas en la rama.

| Se hereda | Dónde | Qué NO se hace |
|---|---|---|
| **`convertQuantity`** (QC-76), dominio puro, con su `IncompatibleUnitsError` y su escala interna | `lib/modules/unidades/index.ts:55`, `lib/modules/unidades/domain/convert-quantity.ts` | No se escribe otra conversión, ni un factor propio, ni se toca `CONVERSION_SCALE` |
| **`product_batches` con `purchaseDate` y `unitCost`** (QC-81), `lot` obligatorio y único por empresa | `db/schema.prisma:295-324` | No se añade columna al lote, no se toca `lot`, no se modela «cuánto contiene la presentación» (eso es **QC-130**) |
| **La consulta del listado de pedidos** (QC-68): contrato genérico, búsqueda por nombre de receta, orden, filtros y paginación | `lib/modules/pedidos/domain/list-orders.ts`, `.../adapters/driven/persistence/order-prisma.ts:440-490` | No se reescribe el listado, no se añade el importe a `ORDER_QUERYABLE`, no se toca la paginación |
| **El aislamiento por empresa en pedidos** (QC-60): `scope` al final de cada firma del puerto y su guardia | `lib/modules/pedidos/domain/order-scope.ts`, `tests/guards/guard-ambito-empresa-pedidos.test.ts` | No se cambia la posición de `scope` en ninguna firma; el parámetro nuevo va **antes** de `scope` |
| **El catálogo cerrado de 15 permisos** (QC-74, enmendado por QC-38/66/86) | `lib/modules/identity/domain/permissions.ts:38-130` | **No se añade ningún permiso.** El importe se protege con `pedidos.consultar`, que ya existe |
| **`ProductCatalog` publicado y cableado** | `lib/modules/inventario/index.ts:84`, `lib/composition/index.ts:712` | No se crea un puerto nuevo en `pedidos/ports/`, no se reconstruye `productCatalog` en composición |

---

## [x] T1 — Esquema y migración `[depende de T0]`

Archivos: `db/schema.prisma` (modelo `Order`),
`db/migrations/<ts>_orders_add_ingredients_cost/migration.sql` y `down.sql`.

- Columna `ingredientsCost Decimal? @map("ingredients_cost") @db.Decimal(14, 4)`.
- `migration.sql`: un `ALTER TABLE ... ADD COLUMN`, **sin `UPDATE`** de relleno.
- `down.sql`: el `DROP COLUMN` exacto.

**Hecho cuando:** `pnpm run db:migrate` aplica, `pnpm run db:rollback` revierte y deja
`_prisma_migrations` coherente, y un test de esquema comprueba que la columna es **opcional**,
`Decimal(14,4)`, y que no nació ninguna tabla ni ninguna columna de moneda.

## [x] T2 — El cálculo, dominio puro `[P con T3]` `[depende de T0]`

Archivos: `lib/modules/pedidos/domain/order-cost.ts` (nuevo).

- `calculateIngredientsCost(input): string | null` según `design.md > 4`.
- Aritmética `BigInt` sobre enteros escalados, escala interna 12, redondeo `HALF_UP` a 4
  decimales **una sola vez al final**, en una constante con nombre.
- Comparador de lotes: `purchase_date` ascendente y desempate **numérico si los dos números de
  lote son solo dígitos, como texto si alguno trae otros caracteres** (`[D18]`, `R25`,
  `design.md > 5.2`).
- Conversión de **cantidad Y coste unitario** a la unidad de la línea (`[D19]`, `R26`,
  `design.md > 5.3`).
- **Guarda de desbordamiento** (`[D17]`, `R24`): si el resultado redondeado no cabe en
  `Decimal(14,4)`, devuelve `null`. Va **aquí**, en el dominio, no como `catch` del `22003` en el
  adaptador.
- Los **cinco** caminos de «sin importe» devuelven `null` y son **indistinguibles**.

**Hecho cuando:** `tests/unit/pedidos/order-cost.test.ts` cubre cobertura justa, insuficiente por
una milésima, dos lotes con misma fecha de compra (con lotes `'9'` y `'10'`), unidades
convertibles, unidades sin base común, receta sin líneas, producto sin lotes, promedio simple de
dos lotes de coste distinto y un resultado que desborda la columna — **todo sin base de datos**.

## [x] T3 — `inventario` publica los lotes costeables `[P con T2]` `[depende de T0]`

Archivos: `lib/modules/inventario/domain/product-catalog.ts` (amplía el tipo y el interface),
`lib/modules/inventario/index.ts` (reexporta `CostingBatch`),
`lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`
(`findCostingBatches`).

- Una sola consulta para todos los `productId`; `stock > 0`; producto vivo; ámbito por
  `batchCompanyScope`; `unitId` desde `presentation`.
- **No ordena** (el orden es del dominio de `pedidos`) y **no escribe nada**.

**Hecho cuando:** `tests/unit/inventario/product-catalog-costing.test.ts` comprueba el mapeo puro
y la exclusión de `stock = 0`, y la guardia de módulos sigue verde (solo `inventario` toca
`prisma.productBatch`).

## [x] T4 — El puerto de pedidos acepta el importe `[depende de T1]`

Archivos: `lib/modules/pedidos/ports/order-repository.ts`,
`lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`,
`lib/modules/pedidos/domain/order-view.ts`.

- `create` y `updateAlive` ganan `ingredientsCost: string | null` **antes** de `scope`.
- `ORDER_SELECT` gana la columna; `toOrderRow` la mapea con `fromDecimal`; `null` sigue `null`.
- `OrderRow` y `OrderView` ganan `ingredientsCost: string | null`. `NewOrder` **no**.

**Hecho cuando:** `typecheck` verde, `tests/guards/guard-ambito-empresa-pedidos.test.ts` verde y
`tests/unit/pedidos/order-view.test.ts` comprueba que la salida lleva el campo, que `null` no se
vuelve `'0.0000'` y que no existe ningún campo de precio ni de moneda.

## [x] T5 — Alta y edición calculan `[depende de T2, T3, T4]`

Archivos: `lib/modules/pedidos/domain/create-order.ts`, `.../update-order.ts`.

- `CreateOrderDeps`/`UpdateOrderDeps` ganan `products: ProductCatalog` y `units: UnitCatalog`.
- El cálculo va **después** de `requirePermission` y de zod, y **después** de las validaciones de
  receta y de transición: un alta o edición rechazada no lee lotes.
- Las unidades se piden **deduplicadas y en una sola llamada**.

**Hecho cuando:** `tests/unit/pedidos/create-order.test.ts` y `.../update-order.test.ts` pasan con
dobles que **fallan si se los llama** sin permiso, y **cuentan invocaciones** de puerto (una a
lotes y una a unidades por escritura, tenga la receta 1 o 20 líneas).

## [x] T6 — Composición `[depende de T5]`

Archivos: `lib/composition/index.ts` (solo el bloque de `pedidos`, `:941-950`, y la constante
`productCatalog` de `:712`).

- `productCatalog` gana `findCostingBatches`; `createOrder` y `updateOrder` reciben
  `products` y `units`. **Diff mínimo**: no se reordena ni reformatea nada más.

**Hecho cuando:** `typecheck` y `lint` verdes y las guardias de arquitectura siguen verdes.

## [x] T7 — Las lecturas NO recalculan `[P con T8]` `[depende de T4]`

Archivos: ninguno de producción (verificación); `tests/unit/pedidos/list-orders.test.ts`,
`tests/unit/pedidos/order-service.test.ts`.

**Hecho cuando:** hay un test que demuestra que `getOrder` y `listOrders` **no reciben**
`products` ni `units` y devuelven el importe **tal como está guardado**, y otro que demuestra que
cambiar los lotes no altera el importe de un pedido ya creado.

## [x] T8 — La vía de `asignaciones` y el catálogo de permisos, intactos `[P con T7]`

Archivos: ninguno de producción. Tests:
`tests/unit/asignaciones/list-assigned-orders.test.ts`,
`tests/unit/asignaciones/get-assigned-order-execution.test.ts`,
`tests/unit/identity/` (el test del catálogo de permisos).

**Hecho cuando:** hay tests que fallan si `AssignedOrderSummary`, la vista de ejecución o
`OrderCatalog` ganan el importe, y el catálogo sigue teniendo **quince** permisos con el Operador
en dos.

## [x] T9 — No ordenable ni filtrable, y sin pantalla `[P con T7, T8]`

Archivos: ninguno de producción. Tests: `tests/unit/pedidos/list-orders.test.ts`,
`tests/unit/pedidos-ui/order-columns.test.tsx`.

**Hecho cuando:** un test comprueba que `ORDER_QUERYABLE` **no** declara el importe y que pedirlo
como orden o filtro se **poda y se anota** sin fallar la consulta; y otro comprueba que la tabla
de pedidos **no** pinta ninguna columna de importe (lo hace QC-122).

## [x] T10 — Integración contra la base real `[depende de T6]`

Archivos: `tests/integration/pedidos/order-ingredients-cost.int.test.ts` (nuevo).

- Alta que calcula y guarda; edición que recalcula; lotes cambiados después que **no** tocan el
  pedido; pedido anterior a la columna que sigue en `NULL` tras una lectura.
- **Aislamiento**: un lote de otra empresa no entra en el cálculo.
- **Solo lectura**: tras alta y edición, `product_batches` e `inventory_movements` quedan
  **byte a byte igual**.
- **Desbordamiento** (`[D17]`, `R24`): un pedido cuyo importe no cabe en la columna **queda
  creado**, con `ingredients_cost` en `NULL`, y la base **no** devuelve `22003`.

**Hecho cuando:** el archivo pasa contra la base de test y demuestra los siete puntos.

## T11 — Cierre `[depende de todas]`

Archivos: `progress/impl_QC-123-....md` (mapa `R<n> -> test`), `progress/current.md`.

**Hecho cuando:** `./init.sh` completo en verde, el mapa de trazabilidad de abajo está copiado en
`progress/impl_...` con los nombres reales de los casos, y `package.json` **no cambió** (sin
dependencia nueva, `docs/dependencias.md` intacto).

---

## Trazabilidad `R<n> -> test`

Ningún `R<n>` mapea a un test E2E, y eso es `[D15]`: la cobertura es unidad + integración, y el
E2E se difiere a **QC-122**.

| Req | Test |
|---|---|
| R1 | `tests/unit/pedidos/order-view.test.ts` — «la salida del pedido no declara ningún campo de precio de venta (R1)» + `tests/unit/pedidos/order-cost.test.ts` — «el importe sale del coste de los lotes y no de ningún precio (R1)» |
| R2 | `order-cost.test.ts` — «la cantidad necesaria es la de la línea por la del pedido (R2)» |
| R3 | `order-cost.test.ts` — «usa solo lotes con existencia, del más antiguo al más nuevo, hasta cubrir (R3)» y «desempata por número de lote cuando la fecha de compra empata (R3)»; `tests/unit/inventario/product-catalog-costing.test.ts` — «no devuelve lotes con existencia cero (R3)» |
| R4 | `order-cost.test.ts` — «la fecha de vencimiento no altera el orden ni la selección (R4)» |
| R5 | `order-cost.test.ts` — «promedia los costes unitarios de los lotes usados sin ponderar (R5)» |
| R6 | `order-cost.test.ts` — «convierte la existencia y el coste cuando las unidades comparten base (R6)» |
| R7 | `order-cost.test.ts` — «un ingrediente con unidad sin base común no tiene coste (R7)» |
| R8 | `order-cost.test.ts` — «devuelve sin importe si la existencia no cubre (R8)», «… si un ingrediente no se puede convertir (R8)», «… si la receta no tiene líneas (R8)», «nunca devuelve cero ni un importe parcial (R8)»; `tests/integration/pedidos/order-ingredients-cost.int.test.ts` — «un pedido anterior a la columna sigue sin importe (R8, R13)» |
| R9 | `order-cost.test.ts` — «los cuatro casos sin importe devuelven exactamente la misma salida (R9)» |
| R10 | `tests/unit/pedidos/create-order.test.ts` — «el alta calcula el importe y lo pasa al puerto (R10)»; `order-ingredients-cost.int.test.ts` — «el alta lo deja guardado en la fila (R10)» |
| R11 | `tests/unit/pedidos/update-order.test.ts` — «la edición recalcula y sustituye el importe (R11)»; `order-ingredients-cost.int.test.ts` — «la edición lo reescribe, incluso a nulo (R11)» |
| R12 | `tests/unit/pedidos/list-orders.test.ts` — «el listado no recibe catálogo de productos ni de unidades (R12)»; `order-ingredients-cost.int.test.ts` — «comprar un lote después no cambia el importe de un pedido ya creado (R12)» |
| R13 | `tests/unit/pedidos/schema/orders-ingredients-cost-migration.test.ts` — «la columna nace opcional y la migración no rellena ninguna fila (R13)»; `order-ingredients-cost.int.test.ts` — «(R8, R13)» de arriba |
| R14 | `tests/unit/pedidos/order-service.test.ts` — «la ficha y el listado devuelven el importe a quien tiene pedidos.consultar (R14)»; `order-ingredients-cost.int.test.ts` — «un pedido de otra empresa no se alcanza ni por identificador (R14, R21)» |
| R15 | `tests/unit/asignaciones/list-assigned-orders.test.ts` — «el pedido asignado no lleva importe (R15)»; `tests/unit/asignaciones/get-assigned-order-execution.test.ts` — «la pantalla de ejecución no lleva importe (R15)»; test del catálogo de permisos — «el catálogo sigue teniendo quince permisos (R15)» |
| R16 | `tests/unit/pedidos/schema/pedidos-schema.test.ts` — «no nace ninguna columna de moneda (R16)» |
| R17 | `tests/unit/pedidos/list-orders.test.ts` — «el importe no está en la lista blanca y pedirlo como orden o filtro se poda y se anota (R17)» |
| R18 | `tests/unit/pedidos-ui/order-columns.test.tsx` — «la tabla de pedidos no pinta el importe (R18)» |
| R19 | `order-cost.test.ts` — «el importe viaja como cadena decimal de cuatro decimales y nunca como número (R19)»; `tests/guards/guard-dependencias-aprobadas.test.ts` (sin dependencia nueva) |
| R20 | `tests/unit/pedidos/schema/pedidos-schema.test.ts` — «orders gana una columna decimal(14,4) opcional en snake_case y ninguna tabla nueva (R20)»; `orders-ingredients-cost-migration.test.ts` — «la migración tiene su down.sql y revierte exactamente (R20)» |
| R21 | `order-ingredients-cost.int.test.ts` — «(R14, R21)» de arriba, y «un lote de otra empresa no entra en el cálculo (R21)» |
| R22 | `order-ingredients-cost.int.test.ts` — «tras el alta y la edición, los lotes y los asientos quedan intactos (R22)»; `tests/unit/inventario/product-catalog-costing.test.ts` — «el contrato de costeo no expone ninguna escritura (R22)» |
| R23 | `tests/unit/pedidos/create-order.test.ts` y `.../update-order.test.ts` — «sin pedidos.modificar no se lee ni un lote ni una unidad (R23)», con dobles que fallan si se los llama |
| R24 | `order-cost.test.ts` — «un importe que no cabe en decimal(14,4) sale sin número y no distinguible de los otros cuatro casos (R24)»; `tests/unit/pedidos/create-order.test.ts` — «el alta se completa aunque el importe desborde (R24)»; `order-ingredients-cost.int.test.ts` — «el pedido queda creado con el importe en blanco y la base no lanza 22003 (R24)» |
| R25 | `order-cost.test.ts` — «con la misma fecha de compra el lote 9 se usa antes que el 10 (R25)» y «si un número de lote no es solo dígitos el desempate es por texto (R25)» |
| R26 | `order-cost.test.ts` — «convierte también el coste unitario a la unidad de la línea: 20.000 por bidón de 20 L son 1.000 por litro (R26)» y «no promedia costes unitarios de unidades distintas (R26)» |
