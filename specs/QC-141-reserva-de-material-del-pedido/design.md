# QC-141 — reserva-de-material-del-pedido · design.md

> Cómo se construye lo que pide `requirements.md`. Las referencias `archivo:línea` son del árbol de
> la rama `feature/QC-141-reserva-de-material-del-pedido` al escribir este diseño (2026-09-22).
> Ninguna librería nueva (`[D18]`, `R47`).

---

## 0. Lo que necesita al humano en F1.4

Nada de esta sección se da por cerrado. Cada punto trae una **opción recomendada** para que F1.4
la apruebe o la cambie; los requisitos que dependen de ella están marcados **provisional** en
`requirements.md`.

### 0.1 Las cinco preguntas abiertas de la semilla

| # | Pregunta | Opción recomendada | Por qué | Requisitos |
|---|---|---|---|---|
| 1 | Pedido que nunca se cubre | **Espera indefinidamente**: sin material apartado no hay reserva que caduque, y el proceso diario no lo mira. | Es la lectura literal de D6 («la reserva caduca»), y QC-138 es quien le dará estado (`BLOQUEADO`). Cancelar a los 15 días de creado sería una segunda regla de caducidad que nadie decidió. | R22 |
| 2 | Entregar con el lote apartado mermado | **Completar desde otros lotes con disponible** (más antiguos primero) y, si ni así alcanza, **rechazar la entrega** con `insufficient_material` sin cambiar nada. | El inventario no puede quedar negativo (`CHECK stock >= 0` sigue) y «consumir lo que haya» deja la existencia contando material que salió de verdad. Rechazar solo ocurre si no hay material en ningún lote. | R30 |
| 3 | Canal de aviso de fallos del cron | **Registro estructurado en el log de Vercel** (una línea `console.error` con un nombre de evento fijo, `order_expiry_failed`, número de pedidos fallidos e identificadores de pedido y empresa, sin PII) **y respuesta `500`**, que Vercel marca como ejecución fallida en su panel de Cron Jobs. | No hay ningún canal en el repo, y el correo (Resend) vive en `identity` para otro fin: usarlo exigiría un módulo de notificaciones que nadie pidió. Alternativa si se quiere aviso activo: correo a una variable `OPS_ALERT_EMAIL`, en ficha propia. | R26 |
| 4 | Dónde se consulta el historial | **Dentro del «Historial del lote» que ya existe** (`app/(private)/inventario/components/batch-history.tsx`), intercalando apartados, liberaciones, caducidades y consumos con los movimientos, por fecha descendente. | Cada evento de reserva es de **un lote**, y ese desplegable ya se abre por lote, pide datos solo al abrirse y está protegido por `inventario.consultar`. No hace falta pantalla ni ruta nueva. | R38 |
| 5a | Decimales que se **muestran** | **Dos**, con el valor exacto en el `title` de la celda: `formatDecimalDisplay` y `exactDecimalTitle` de `lib/shared/ui/decimal-display.ts:119,137`. | Es el criterio que Pedidos ya usa desde el 2026-09-17 (`order-ingredients-table.tsx:53-62`); una segunda convención de pantalla sería otra verdad. | R6, R36, R37 |
| 5b | ¿`qty_alert` pasa a decimal? | **Sí**, a `Decimal(14,4)` en la misma migración. | La alerta se compara con la existencia (`product-columns.tsx:110`); comparar un entero con un decimal obliga a convertir uno de los dos en cada lectura. Si se decide que no, `T4` se queda sin ese punto y la comparación convierte el entero a cadena decimal. | — (no hay decisión que lo cubra: si se aprueba, se añade R) |

### 0.2 Preguntas nuevas que aparecen al diseñar

| # | Pregunta | Opción recomendada | Requisitos |
|---|---|---|---|
| N1 | **D5 dice «sin redondear», pero no siempre cabe.** La cantidad necesaria es `línea (4 dec.) × pedido (4 dec.)`: hasta **8 decimales** (`0.1234 × 1.5678 = 0.19346652`), y convertir a la unidad del producto puede dar una división periódica (`convert-quantity.ts:128-153`, escala 12). La columna guarda 4. | **Redondear hacia arriba al cuarto decimal**, una vez por ingrediente y en la unidad del producto. Nunca aparta menos de lo necesario, y el exceso es menor que `0,0001` por ingrediente. Cuando cabe en 4 decimales no se redondea nada, que es D5 al pie de la letra. | R11 |
| N2 | **Entregar un pedido que no tiene nada apartado** (no alcanzó al crearlo). D12 dice que entregar consume, pero no hay qué. | **Calcular con la receta actual y consumir con la regla todo-o-nada de lo disponible**; si no alcanza, rechazar con `insufficient_material`. Misma respuesta que la pregunta 2 para que haya una sola regla de entrega. Coste: hoy el Finalizar de la planta nunca falla por material; con esto puede fallar. | R31 |
| N3 | **D2 y D4 juntas.** D2: «si falta un solo ingrediente, no aparta ninguno». D4: el ingrediente de unidad incompatible «no se reserva». ¿Ese ingrediente cuenta como «falta»? | **No cuenta**: se salta y los demás se apartan. Es lo que QC-138 D1 fijó para el bloqueo («unidad sin base común no bloquea: es un dato incompleto, no falta de material»). | R9 |
| N4 | **La columna «restante» del formulario de pedido** (`order-ingredients-table.tsx:107-112`) resta lo requerido a la existencia **total**. Con reserva, dos pedidos de 1.500 sobre 2.000 se siguen viendo cubiertos en el formulario, que es el síntoma que originó la ficha. | Que reste de lo **disponible** (en una edición, sumando lo que el propio pedido tiene apartado). Cambia `RecipeLineView.productStock` de significado: pasa a ser «disponible». Si se prefiere no tocarlo, queda en total y solo cambia de tipo (R6). | R6 (tipo); el cambio de significado no está en ninguna decisión |
| N5 | **Borrar un pedido vivo** (`delete-order.ts:20` deja borrar `PENDIENTE` y `EN_CURSO`). Ninguna decisión lo menciona, y sin liberar, su material queda apartado para siempre por un pedido invisible. | **Liberar**, igual que cancelar, registrado como liberación. | R19 |
| N6 | **Cómo se ve la cobertura en Pedidos.** D9 exige «sin cobertura completa»; el E2E (D17) necesita ver que el segundo pedido «no aparta». | Una etiqueta en la fila del listado y en la hoja del pedido con tres valores: **«Apartado»**, **«Sin apartar»** y **«Sin cobertura completa»**. Texto y lugar a aprobar. | R35, R48 |
| N7 | **Hora del proceso diario.** Vercel programa en UTC y el repo no dice la zona horaria de la empresa. | `0 7 * * *` (07:00 UTC). En Hobby, Vercel lo ejecuta en algún momento de esa hora. | R23 |
| N8 | **La migración aparta con SQL** (§4.3), así que el reparto por lotes queda escrito **dos veces**: en TypeScript para la operación y en PL/pgSQL para la migración. | Aceptarlo, con un test de integración que compara las dos sobre los mismos datos (§12). La alternativa (un script de TypeScript en el `build`) está descartada en §13.3. | R43 |
| N9 | **Mensaje del alta** «Indica una existencia de 1 o más para derivar el costo del total» (`product-batch-input.ts:97`): con decimales el límite es «mayor que 0». | Cambiar a «Indica una existencia mayor que 0 para derivar el costo del total.». | R5 |
| N10 | **Material que entra después.** Un pedido que no apartó no vuelve a intentarlo cuando entra un lote: D3 solo recalcula al crear y al editar. | No hacer nada en esta ficha: es lo que QC-138 D2 hará al desbloquear. Se anota para que nadie lo lea como un olvido. | — |

---

## 1. Mapa de la solución

```
                         app / Server Actions / Route Handler del cron
                                        │
                              lib/composition (cablea)
          ┌─────────────────────────────┼──────────────────────────────┐
          ▼                             ▼                              ▼
   pedidos (dominio)             asignaciones (dominio)          inventario (dominio)
   create/update/cancel/         finishAssignedOrder ──► OrderCatalog  planReservation
   delete/transition/expire          (sin cambios de       .transitionAliveById   compareBatchesOldestFirst
        │                             lógica)               (ahora consume)       MaterialReservations (tipo)
        ▼                                                                           ▲
   OrderUnitOfWork.run(work) ──── una transacción ────► { orders(tx), reservations(tx) }
        │                                                                           │
   pedidos/driven: order-unit-of-work-prisma  ── pasa `tx` ──►  inventario/driven: reservation-prisma
                    order-prisma (factory)                                         product-prisma.consumeBatchStock
```

- **`inventario` es dueño de la reserva**: las tablas, el reparto por lotes y el consumo. Es el
  dueño de los lotes y de la existencia; nadie más escribe `product_batches`.
- **`pedidos` decide cuándo** se aparta, libera o consume, porque es quien sabe de la receta y del
  estado. Le pasa a `inventario` la **necesidad ya calculada** (producto, cantidad, unidad).
- **La transacción la abre un adaptador driven de `pedidos`** y la comparten los dos repositorios
  por inyección desde `lib/composition` (§5.2).
- **El grafo de módulos no cambia de forma**: `pedidos → inventario` ya existe
  (`create-order.ts:9`); `inventario` no importa ni `pedidos` ni `recetas`, que cerraría un ciclo
  (`tests/guards/guard-arquitectura-modulos.test.ts:749-832`).

---

## 2. Existencia decimal (absorbe QC-149)

### 2.1 Qué cambia y dónde

| Pieza | Hoy | Cambio |
|---|---|---|
| `db/schema.prisma:279` `Product.stock` | `Int @default(0)` | `Decimal @default(0) @db.Decimal(14, 4)` |
| `db/schema.prisma:280` `Product.qtyAlert` | `Int?` | `Decimal? @db.Decimal(14, 4)` **si se aprueba 0.1-5b** |
| `db/schema.prisma:305` `ProductBatch.stock` | `Int` | `Decimal @db.Decimal(14, 4)` |
| `db/schema.prisma:350` `InventoryMovement.quantity` | `Int` | `Decimal @db.Decimal(14, 4)` |
| `lib/modules/inventario/domain/product-view.ts:47,50` | `stock: number`, `qtyAlert: number \| null` | `stock: string` (4 decimales), `qtyAlert: string \| null` si 5b; más `reserved` y `available` (§10) |
| `.../domain/product-batch-view.ts` | `stock: number` | `stock: string`, más `reserved`, `available`, `overReserved` |
| `.../domain/inventory-movement.ts:5,16` | `quantity: number`, `kind: 'opening' \| 'adjustment'` | `quantity: string`; `kind` gana `'consumption'`; `NewInventoryMovement` gana `orderId: string \| null` |
| `.../domain/product-stock.ts:3-32` | suma `number` | `quantity: string`; `sumStockByUnit` suma con el decimal exacto de §2.3 |
| `.../domain/costing-batch.ts:10` | `stock: number` | `stock: string` |
| `.../domain/product-batch.ts` (`NewProductBatch.stock`) | `number` | `string` |
| `.../domain/product-batch-input.ts:28` | `z.number().int().min(0)` | cadena `^\d{1,10}(\.\d{1,4})?$` (el mismo `DECIMAL_PATTERN` de la línea 13), cero permitido |
| `.../domain/product-batch-input.ts:123,141,147` | `Number.isInteger`, `stock < 1`, `deriveUnitCost(total, stock)` | la existencia se compara como decimal; «mayor que 0» (N9) |
| `.../domain/unit-cost.ts:77-86` | `deriveUnitCost(totalCost: string, stock: number)` | `stock: string`; `total × 10^4 / stock` sobre enteros escalados, `HALF_UP` a 4 |
| `.../domain/adjust-batch-stock.ts:20-27,44` | `delta: z.number().int()`, devuelve `{ stock: number }` | `delta` cadena `^-?\d{1,10}(\.\d{1,4})?$` distinta de cero; devuelve `{ stock: string; reserved: string; overReserved: boolean }` (R33) |
| `.../domain/create-product.ts:33,97` | pasa `stock` numérico | pasa la cadena |
| `.../adapters/driving/batch-actions.ts:30,47-56,86` | `readOptionalFormInt`, mensaje «numero entero» | lector decimal con signo (`^-?\d+(\.\d+)?$`); mensaje «La cantidad del ajuste no es un número decimal válido.»; `AdjustBatchStockFormState.stock: string` |
| `.../adapters/driving/product-actions.ts:105` | `readOptionalFormInt(formData, 'stock')` | lector decimal sin signo |
| `.../adapters/driven/persistence/product-prisma.ts:55,671` | `stock: row.stock` | `row.stock.toFixed(4)` |
| `product-prisma.ts:175-179` | filtro `numberRange` de `stock` con `number` | a `Prisma.Decimal`, como `toDecimalRange` de `order-prisma.ts:368-375` |
| `product-prisma.ts:290-312` `recalculateProductStock` | suma en JS con `singleUnitStock` | `UPDATE products SET stock = COALESCE((SELECT sum(stock) FROM product_batches WHERE product_id = … AND company_id = …), 0)`: la suma la hace Postgres en `numeric`. La comprobación de unidades mezcladas la garantiza ya el disparador `product_batches_check_unit` (`20260918130000_product_unit_and_stored_stock/migration.sql:70-102`). Se exporta para el consumo (§6.4) |
| `product-prisma.ts:393,592,640` | `stock: batch.stock`, `quantity: batch.stock` | `new Prisma.Decimal(batch.stock)` |
| `product-prisma.ts:715-755` `adjustBatchStock` | `delta: number`, `increment: delta` | `delta: string` → `Prisma.Decimal`; además lee el apartado del lote para devolver `overReserved` |
| `.../persistence/batch-movement-prisma.ts:16-33,51-60` | `quantity` numérica | `Prisma.Decimal` al escribir, `.toFixed(4)` al leer; escribe `orderId` |
| `.../persistence/product-catalog-prisma.ts:42-48,79,101-110` | `stock: number` | cadena `.toFixed(4)` |
| `lib/modules/recetas/domain/recipe-view.ts:49`, `get-recipe.ts:19-23` | `productStock: number \| null` | `string \| null` (con `'0.0000'` en vez de `0`) |
| `lib/modules/pedidos/domain/order-cost.ts:154` | `String(batch.stock)` | `batch.stock` (ya es cadena) |
| `app/(private)/pedidos/components/order-ingredients-table.tsx:109,173,179` | `line.productStock.toString()` | la cadena tal cual; significado según N4 |
| `app/(private)/inventario/components/product-columns.tsx:110,129` | `qtyAlert > product.stock` y `String(product.stock)` | comparación decimal exacta (§2.3) y `formatDecimalDisplay` + `exactDecimalTitle` |
| `.../components/product-batches-panel.tsx:43-47` | `String(batch.stock)` | igual que arriba, más «Apartado», «Disponible» y la marca «Sobre-reservado» |
| `.../components/product-cost-amount.ts:85-86,101-102` | `quantity: number` entero | `quantity: string` decimal; el total/unitario de 2 decimales del panel sigue igual |
| `.../components/product-form.tsx:527-532` y `adjust-batch-dialog.tsx` | campo numérico entero | campo de texto decimal con `inputMode="decimal"`, `font-size >= 16px`; coma convertida a punto como en `sanitizeCostInput` (`product-cost-amount.ts:65-76`) |

### 2.2 Los `CHECK` que siguen

`product_batches_stock_non_negative` (`20260909120000_product_batches/migration.sql:57`),
`products_stock_non_negative` (`20260918130000_.../migration.sql:53`) e
`inventory_movements_quantity_not_zero` (`20260917130000_inventory_movements/migration.sql:33`)
**no se tocan**: `ALTER COLUMN ... TYPE numeric(14,4)` los conserva y Postgres los revalida. El
índice parcial `products_stock_idx` se reconstruye solo con el cambio de tipo.

### 2.3 Aritmética decimal sin librería

`inventario/domain/decimal-quantity.ts` (nuevo): `addQuantities`, `subtractQuantities`,
`compareQuantities`, `minQuantity`, `ceilToScale4`, todas sobre cadenas y `BigInt` a escala fija.
Es el mismo patrón que ya tienen `unidades` (`convert-quantity.ts`), `pedidos` (`order-cost.ts`) e
`inventario` (`unit-cost.ts`). **No se usa una librería de decimales** porque `[D18]` lo cierra y
porque QC-90 ya evaluó y descartó una (`unit-cost.ts:5-8`); lo que pide
`docs/architecture.md > Anti-patrones` («utilidad escrita a mano... sin que el design.md explique
por qué») queda explicado aquí. Las sumas por lote y por producto las hace Postgres en `numeric`;
en TypeScript solo se opera al repartir (§6).

### 2.4 Tests que hoy fijan enteros y hay que cambiar

| Test | Qué fija |
|---|---|
| `tests/unit/inventario/schema/inventario-schema.test.ts:270,344,927` | `stock.type === 'Int'` |
| `tests/unit/inventario/qc91-alcance.test.ts:447-450,585-590` | `stock Int` en el esquema |
| `tests/unit/inventario/adjust-batch-stock.test.ts:110` | `delta: 1.5` se rechaza |
| `tests/unit/inventario/batch-actions.test.ts:190` | «rechaza un delta que no es un entero» |
| `tests/unit/inventario/product-batch-input.test.ts:342-346` | `stock: 1.5` se rechaza, `stock` numérico |
| `tests/unit/inventario/product-cost-amount.test.ts:85` | `multiplyCost('12.50', 1.5)` es `null` |
| `tests/unit/inventario/product-batches-panel.test.tsx:76` | la cantidad pintada es `String(batch.stock)` |
| `tests/unit/inventario/product-input.test.ts:221-234` | `qtyAlert: 1.5` se rechaza (solo si 5b) |
| `tests/unit/inventario/authorization.test.ts:96` | entrada mínima del ajuste con delta entero |
| `tests/integration/inventario/product-stock.int.test.ts:386` | sumas enteras de lotes y ajustes |
| `e2e/ajuste-de-inventario.spec.ts` | revisar: teclea deltas enteros |

Los tests de migraciones viejas (`qc121-alcance.test.ts:408,597`,
`inventario-migration.test.ts:385-398`) leen archivos de migraciones ya aplicadas, que no se
tocan: **no cambian**.

---

## 3. Modelo de datos

### 3.1 Tabla nueva `reservation_movements` (módulo `inventario`)

Libro **append-only** de la reserva, con la misma filosofía que `inventory_movements`
(`schema.prisma:340`: «Un asiento no se corrige: se corrige con otro»). Sin `updated_at` ni
`deleted_at`, a propósito (`R39`).

```prisma
enum ReservationMovementKind {
  reserve
  release
  expire
  consume
}

/// @module inventario
model ReservationMovement {
  id        String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  companyId String                  @map("company_id") @db.Uuid
  orderId   String                  @map("order_id") @db.Uuid
  batchId   String                  @map("batch_id") @db.Uuid
  kind      ReservationMovementKind
  quantity  Decimal                 @db.Decimal(14, 4)
  createdBy String?                 @map("created_by") @db.Uuid
  createdAt DateTime                @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([batchId], map: "reservation_movements_batch_id_idx")
  @@index([orderId], map: "reservation_movements_order_id_idx")
  @@index([companyId], map: "reservation_movements_company_id_idx")
  @@index([createdBy], map: "reservation_movements_created_by_idx")
  @@map("reservation_movements")
}
```

- **`quantity` siempre positiva** (`CHECK (quantity > 0)`); el signo lo da `kind`: `reserve` suma,
  los otros tres restan. Lo apartado de un pedido en un lote es
  `Σ reserve − Σ (release + expire + consume)`.
- **FK escritas a mano, sin `@relation`** (drift, como `order_assignments`):
  - `(order_id, company_id) → orders (id, company_id)` contra `orders_id_company_id_key`
    (`schema.prisma:564`): una reserva no puede apuntar a un pedido de otra empresa (`R17`).
  - `(batch_id, company_id) → product_batches (id, company_id)` contra una clave nueva
    `product_batches_id_company_id_key` (`UNIQUE (id, company_id)`). Se prefiere a un disparador
    como `inventory_movements_check_company` porque es la forma que ya usan las tablas nuevas.
  - `company_id → companies`, `created_by → users` (`ON DELETE RESTRICT`).
- **`created_by` NULL = el sistema** (proceso diario, migración), igual que en el resto del repo.
- **`CHECK (kind <> 'expire' OR created_by IS NULL)`**: la caducidad **nunca** tiene autor
  (`[D7]`). No se exige lo contrario para el resto: la migración aparta sin persona (`reserve` sin
  autor), así que un `CHECK` más estricto la rechazaría.
- **RLS** `ENABLE` + `FORCE`, sin policies (`tests/guards/guard-rls-force.test.ts`).
- **`company_id` obligatoria** (`tests/guards/guard-empresa-en-esquema.test.ts`).

### 3.2 Cambios en `inventory_movements`

- `kind` gana **`consumption`** al final del enum (`ALTER TYPE ... ADD VALUE`, §4.1).
- Columna nueva **`order_id UUID NULL`** con FK compuesta `(order_id, company_id) → orders` y
  `CHECK ((kind = 'consumption') = (order_id IS NOT NULL))`: una salida por entrega siempre dice de
  qué pedido, y ningún otro asiento lleva pedido.
- `inventory_movements_reason_matches_kind` se reescribe: `consumption` va **sin** motivo, como
  `opening`.
- La salida se guarda con **cantidad negativa**, como el ajuste que resta.

### 3.3 Columna nueva en `orders` (módulo `pedidos`)

**`reserved_at TIMESTAMPTZ NULL`**: el instante desde el que cuentan los 15 días (`R20`). La
escribe `pedidos` en la misma transacción:

| Operación | `reserved_at` |
|---|---|
| Crear o editar y **aparta** | `now` (la edición reinicia el plazo, `[D3]`) |
| Crear o editar y **no aparta** | `NULL` |
| Cancelar, caducar, borrar, entregar | `NULL` |
| Migración, pedido que aparta | instante de la migración (`[D10]`) |

Índice parcial para el proceso diario:
`orders_expirable_idx ON orders (reserved_at) WHERE status = 'PENDIENTE' AND deleted_at IS NULL
AND reserved_at IS NOT NULL`.

**Por qué en `orders` y no derivado del libro:** la caducidad es del **pedido** —lo que se cancela
es el pedido— y con la diferencia por lote de `R12` una edición que no cambia lo apartado no
escribe ningún asiento, así que el libro no sabría que el plazo se reinició.

### 3.4 Lecturas derivadas, sin columnas desnormalizadas

- **Apartado por lote**: `Σ` con signo sobre `reservation_movements` agrupado por `batch_id`.
- **Disponible por lote**: `greatest(stock − apartado, 0)`. **Sobre-reservado**: `apartado > stock`.
- **Por producto**: `reserved = Σ apartado`, `available = Σ disponible` de sus lotes (`R36`).
  `total ≠ reserved + available` exactamente cuando hay algún lote sobre-reservado.
- **Cobertura de un pedido** (`R35`, N6): `none` sin apartado vivo; `partial` si alguno de sus lotes
  está sobre-reservado; `full` en otro caso.

No se guarda `reserved` en `product_batches` ni en `products`: sería una segunda verdad de lo que
ya dice el libro. El coste es una agregación por página del listado (≤ 25 productos) con índice
por `batch_id` (§13.4).

---

## 4. Migraciones

Tres, por orden. Cada una con su `down.sql`.

### 4.1 `<ts>_inventory_movement_kind_consumption`

`ALTER TYPE "InventoryMovementKind" ADD VALUE 'consumption';` y nada más. Va sola porque Postgres
no deja **usar** un valor de enum añadido en la misma transacción, y la migración siguiente lo usa
en un `CHECK`.

`down.sql`: Postgres no sabe quitar un valor de enum. Se recrea el tipo sin él (renombrar,
crear, `ALTER COLUMN ... USING kind::text::"InventoryMovementKind"`, borrar el viejo), y **falla
a propósito** si queda algún asiento `consumption` (`DO $$ ... RAISE EXCEPTION`), porque borrarlo
sería perder una salida real.

### 4.2 `<ts>_reservations_and_decimal_stock`

Escrita a mano, con el paréntesis de RLS (`NO FORCE` / `FORCE`) de
`20260918130000_product_unit_and_stored_stock/migration.sql:10-12,129-134`.

1. `ALTER COLUMN ... TYPE numeric(14,4) USING <col>::numeric(14,4)` en `product_batches.stock`,
   `inventory_movements.quantity`, `products.stock` (y `products.qty_alert` si 5b). Los enteros se
   conservan exactos (`R2`).
2. `product_batches_id_company_id_key`.
3. Enum `ReservationMovementKind`, tabla `reservation_movements`, sus FK, `CHECK`, índices, RLS.
4. `inventory_movements.order_id`, su FK, su índice y los dos `CHECK` de §3.2.
5. `orders.reserved_at` y `orders_expirable_idx`.

`down.sql`, en orden inverso: quita lo añadido y devuelve los tipos a `integer`, **después** de un
bloque que falla si alguna de esas columnas tiene parte decimal
(`WHERE stock <> trunc(stock)`), para no truncar existencias en silencio (`R45`).

### 4.3 `<ts>_reserve_existing_orders` (el apartado de los pedidos vivos)

Un bloque `DO $$ ... $$` en PL/pgSQL que, **por empresa y por pedido vivo en orden de
`created_at, order_year, order_sequence, id`**:

1. Lee las líneas de su receta (`recipe_lines`) y la cantidad del pedido.
2. Por línea: `need = line.quantity × order.quantity`; si la unidad de la línea y la del producto
   (`products.unit_id`) no comparten base (`coalesce(units.unit_id, units.id)`), la salta (N3); si
   la comparten, `need = need × factor(línea) / factor(producto)` truncado a 12 decimales si la
   división no termina, y redondeado **hacia arriba** a 4 (N1). Es la misma fórmula que
   `convertQuantity` (`convert-quantity.ts:188-210`).
3. Recorre los lotes del producto con disponible `> 0` por `purchase_date`, y desempata por
   `lot` —numérico si los dos son solo dígitos (`lot ~ '^[0-9]+$'`), texto si no—, restando lo que
   ya apartaron los pedidos anteriores de **esta misma** migración.
4. Si alguna línea no se cubre, no escribe nada para ese pedido (`[D2]`). Si todas se cubren,
   inserta un `reserve` por lote, sin autor, con `created_at = now()`, y pone
   `orders.reserved_at = now()` (`R44`).

El paréntesis de RLS abarca `orders`, `recipe_lines`, `units`, `products`, `product_batches` y
`reservation_movements`.

`down.sql`: `UPDATE orders SET reserved_at = NULL` y el borrado de los asientos `reserve` con
`created_by IS NULL` y `created_at` igual al de la migración. Es la **única** baja física de la
ficha y es una reversión de esquema, no una operación de negocio. En la práctica, revertir 4.2
elimina la tabla entera.

**Por qué SQL y no un script:** §13.3.

---

## 5. Contratos entre módulos

### 5.1 Lo que publica `inventario` (solo tipos y dominio puro)

En `lib/modules/inventario/index.ts`, bloque nuevo al final:

```ts
export type ReservationRequirementLine = {
  readonly productId: ProductId;
  readonly quantity: string;      // ya multiplicada por la cantidad del pedido, en la unidad de la línea
  readonly unitId: UnitId;
};

export type ReservationOutcome = { readonly kind: 'reserved' } | { readonly kind: 'not_reserved' };

export type ConsumptionOutcome =
  | { readonly kind: 'consumed' }
  | { readonly kind: 'insufficient'; readonly productIds: readonly ProductId[] };

export type OrderCoverage = 'full' | 'partial' | 'none';

/** Escritura. Siempre dentro de la transacción que abre quien llama. */
export interface MaterialReservations {
  syncForOrder(input: {
    readonly orderId: string; readonly companyId: string;
    readonly requirement: readonly ReservationRequirementLine[];
    readonly actorId: string | null; readonly now: Date;
  }): Promise<ReservationOutcome>;

  releaseForOrder(input: {
    readonly orderId: string; readonly companyId: string;
    readonly reason: 'release' | 'expire';
    readonly actorId: string | null; readonly now: Date;
  }): Promise<void>;

  consumeForOrder(input: {
    readonly orderId: string; readonly companyId: string;
    /** Solo se usa si el pedido no tiene nada apartado (N2). */
    readonly fallbackRequirement: readonly ReservationRequirementLine[];
    readonly actorId: string; readonly now: Date;
  }): Promise<ConsumptionOutcome>;
}

/** Lectura, fuera de transacción. */
export interface ReservationQueries {
  findCoverageByOrderIds(companyId: string, orderIds: readonly string[]):
    Promise<ReadonlyMap<string, OrderCoverage>>;
}

export { compareBatchesOldestFirst } from './domain/batch-order';
export { planReservation } from './domain/plan-reservation';
```

`compareBatchesOldestFirst` es el comparador que hoy vive privado en
`pedidos/domain/order-cost.ts:94-117` (`compareLots` + `compareBatches`), **movido** al dueño de
los lotes y genérico sobre `{ purchaseDate; lot }`. `order-cost.ts` pasa a importarlo del barril
de `inventario` (arista `pedidos → inventario` que ya existe). Queda **una** definición del orden
para el coste y para la reserva, que es lo que pide `[D4]` al heredar QC-123 D3 y D18.

### 5.2 La transacción compartida

**El problema.** Crear un pedido y apartar su material escriben tablas de dos módulos, y `R15` pide
que las dos cosas pasen o ninguna. Hoy no hay ningún precedente de transacción entre módulos:
`lib/composition` no puede importar el cliente Prisma
(`guard-arquitectura-modulos.test.ts:638-645`), un driven no puede importar el driven de otro
módulo (`docs/architecture.md:299`), y `order-prisma.ts` abre sus propias transacciones
(`order-prisma.ts:180`).

**La solución** es la que dejó escrita `lib/composition/index.ts:1056-1061` para `asignaciones`:
«el día que la operación gane una segunda escritura, quien abre la transacción le pasa el cliente
transaccional a esta misma fábrica».

- **Puerto nuevo** `lib/modules/pedidos/ports/order-unit-of-work.ts`:

  ```ts
  export type OrderTransactionScope = {
    readonly orders: OrderWriteRepository;          // puerto nuevo, §5.3
    readonly reservations: MaterialReservations;    // tipo del barril de inventario
  };
  export interface OrderUnitOfWork {
    run<T>(work: (scope: OrderTransactionScope) => Promise<T>): Promise<T>;
  }
  ```

- **Adaptador** `lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma.ts`:
  exporta `withOrderTransaction(run: (tx) => Promise<T>)`, que envuelve `prisma.$transaction` con
  `timeout` explícito, y reintenta la unidad entera hasta 3 veces si el `INSERT` choca con
  `orders_company_year_sequence_key` (el reintento que hoy hace `order-prisma.ts:178-247`, que no
  puede vivir dentro de una transacción ya abortada).
- **Fábricas sobre cliente**: `createOrderWriteRepository(db = prisma)` en `pedidos` y
  `createMaterialReservations(db = prisma)` en `inventario`, mismo patrón que
  `createOrderAssignmentRepository` (`order-assignment-prisma.ts:69`).
- **Cableado** en `lib/composition/index.ts`, que solo ata:

  ```ts
  const orderUnitOfWork: OrderUnitOfWork = {
    run: (work) => withOrderTransaction((tx) =>
      work({
        orders: createOrderWriteRepository(tx),
        reservations: createMaterialReservations(tx, unitCatalog),
      })),
  };
  ```

  El tipo de `tx` se infiere: la composición no nombra Prisma. `unitCatalog` es la constante que
  ya existe (`lib/composition/index.ts:745-748`): `inventario` necesita las conversiones para
  repartir y no puede importar el driven de `unidades`, así que las recibe por el contrato
  `UnitCatalog`. Esa lectura va por el cliente global, fuera de la transacción: las unidades no
  forman parte de lo que se serializa.

### 5.3 `OrderWriteRepository` (puerto nuevo de `pedidos`)

Los métodos que escriben, sobre el cliente que se les da, más un bloqueo de fila:

| Método | Qué hace |
|---|---|
| `lockAliveById(id, scope)` | `SELECT ... FOR UPDATE` del pedido vivo; `null` si no existe, está borrado o es de otra empresa |
| `create(data, year, actorId, now, ingredientsCost, scope)` | el `INSERT` de `order-prisma.ts:183-210`, sin abrir transacción propia; el choque del correlativo **lanza** para que `withOrderTransaction` reintente |
| `updateAlive(..., scope)` | `order-prisma.ts:521-542` |
| `cancelAlive(id, reason, actorId: string \| null, now, scope)` | `order-prisma.ts:557-574`, con autor anulable (la caducidad no tiene) |
| `softDeleteAlive(...)` | `order-prisma.ts:588-599` |
| `setStatus(id, from, to, actorId, now, scope)` | el `UPDATE` condicional de `order-catalog-prisma.ts:152-155` |
| `setReservedAt(id, reservedAt: Date \| null, scope)` | la columna de §3.3, con `$executeRaw` para no mover `updated_at` |

`scope` sigue siendo el **último** parámetro de cada firma
(`tests/guards/guard-ambito-empresa-pedidos.test.ts`). `OrderRepository` (lecturas y listado) no
cambia; sus cuatro métodos de escritura se quedan hasta que T8 mueva a sus llamantes y luego se
retiran, para no dejar dos caminos de escritura.

### 5.4 `OrderCatalog` (contrato que consume `asignaciones`)

`transitionAliveById` (`order-catalog.ts:69-76`) **conserva su firma** y gana un resultado:
`'ok' | 'not_found' | 'stale' | 'insufficient_material'`. Deja de ser la función cruda de
`order-catalog-prisma.ts:142-160` y pasa a cablearse con un caso de uso de `pedidos`,
`createTransitionOrder({ unitOfWork, recipes })`: abre la unidad, bloquea el pedido, aplica
`assertTransition`, y si el destino es `ENTREGADO` llama a `consumeForOrder`. Así **el Finalizar de
la planta consume sin que `asignaciones` sepa de inventario**: `finish-assigned-order.ts` solo
aprende a traducir `'insufficient_material'` a un error propio (`R27`, `R30`, `R31`).

### 5.5 Puertos que `inventario` declara para no importar `pedidos`

`inventario` no puede importar `pedidos` (ciclo). Para el historial (`R38`) necesita el número
visible del pedido; declara en su dominio:

```ts
export interface OrderNumberDirectory {
  findNumberTexts(companyId: string, orderIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
```

y `lib/composition` lo cabla con una función nueva del driven de `pedidos`,
`findOrderNumberTextsByIds` (incluye cancelados, entregados y borrados: el historial no pierde el
pedido), que compone con `formatOrderNumber`. Es el patrón de `people: assignmentDirectoryPrisma`
en `listBatchMovements` (`lib/composition/index.ts:720-723`).

---

## 6. Algoritmos

### 6.1 La necesidad (dominio de `pedidos`, `order-requirement.ts` nuevo)

`buildRequirement(lines, orderQuantity)` → por línea `{ productId, unitId, quantity: línea × pedido }`
con multiplicación exacta de cadenas (la de `order-cost.ts:71-73` a escala entera, sin truncar).
Lee las líneas con `RecipeCatalog.findExecutionContentById`, igual que el coste
(`resolve-ingredients-cost.ts:20`).

### 6.2 El reparto (dominio de `inventario`, `plan-reservation.ts` nuevo, puro)

```
planReservation({ requirement, products: Map<productId, unitId|null>,
                  batches: [{ id, productId, lot, purchaseDate, available }], units })
  para cada línea:
    si el producto no tiene unidad o no comparte base con la línea  -> saltar (N3)
    need := ceilToScale4(convertQuantity(line.quantity, lineUnit, productUnit))   (N1)
    si need == 0 -> saltar
    lotes := batches del producto con available > 0, ordenados con compareBatchesOldestFirst
    tomar min(available, pendiente) de cada lote hasta pendiente == 0
    si pendiente > 0 -> devolver { kind: 'insufficient', productIds: [...] }
  devolver { kind: 'reserved', allocations: [{ batchId, quantity }] }
```

Todos los lotes de un producto están en la unidad del producto
(`product_batches_check_unit`), así que se convierte **una vez por línea**, no por lote. Una
receta sin líneas, o con todas saltadas, da `reserved` con cero asignaciones, que para `pedidos` es
«sin apartar» (`reserved_at = NULL`).

### 6.3 `syncForOrder` (driven de `inventario`, `reservation-prisma.ts` nuevo)

1. Bloquea las filas de `products` de la necesidad, **ordenadas por `id`**, con
   `FOR NO KEY UPDATE` (§7).
2. Lee los lotes de esos productos con su apartado **por otros pedidos**
   (`Σ` del libro excluyendo `order_id` propio) y el apartado **propio** por lote.
3. `planReservation` con `available = max(stock − apartado_por_otros, 0)`.
4. Diferencia por lote entre el plan (o vacío si `insufficient`) y lo propio: `reserve` por lo que
   sube, `release` por lo que baja (`R12`, `R13`).
5. Devuelve `reserved` si el plan cubrió y hay alguna asignación; `not_reserved` en otro caso.

`pedidos` pone `reserved_at` según el resultado (§3.3).

### 6.4 `consumeForOrder`

1. Bloquea los productos de los lotes que el pedido tiene apartados (o de la necesidad de
   respaldo, N2), ordenados por `id`.
2. Por cada lote con apartado propio `q`: decremento **condicional**
   `productBatch.updateMany({ where: { id, companyId, stock: { gte: q } }, data: { stock: { decrement: q } } })`
   —el `UPDATE` condicional de QC-111—. Si `count = 0`, el lote no tiene `q` (merma): lo que tenga
   se consume y el resto se reparte con `planReservation` sobre los demás lotes libres (pregunta 2).
   Si no alcanza → `insufficient` y la transacción se deshace entera.
3. Por cada lote consumido: `writeMovement` con `kind: 'consumption'`, `quantity` negativa y
   `orderId`; y un `consume` en `reservation_movements` por lo que estaba apartado.
4. `recalculateProductStock` de cada producto tocado, en la misma transacción (`[D14]`, `R28`).

El decremento vive en una función **exportada de `product-prisma.ts`**, `consumeBatchStock`, con
su `writeMovement` en el cuerpo: `tests/guards/guard-libro-de-inventario.test.ts:18,244-265` exige
que toda escritura de `product_batches` esté en ese archivo y asiente, y su censo pasa de tres a
cuatro caminos. `reservation-prisma.ts` la llama (driven → driven del mismo módulo).

### 6.5 `releaseForOrder`

Lee lo apartado propio por lote e inserta un `release` o `expire` por cada lote con saldo positivo.
Si no hay saldo, no escribe nada (idempotente, `R25`).

---

## 7. Concurrencia

**Mecanismo elegido: el bloqueo de la fila del producto** (`FOR NO KEY UPDATE`), el mismo que ya
toman `adjustBatchStock` (`product-prisma.ts:727-734`) y `addBatchToAlive`
(`product-prisma.ts:618-625`), **más el `UPDATE` condicional** para el decremento del consumo.

- Dos pedidos que apartan del mismo lote bloquean el mismo producto: el segundo espera, y en
  `READ COMMITTED` su lectura del apartado es una sentencia posterior al bloqueo, así que ve lo que
  el primero comiteó (`R16`). Es el mismo razonamiento de «sentencia aparte» de
  `product-prisma.ts:345-347`.
- **Una merma concurrente se serializa también**, porque el ajuste ya bloquea el producto. Un
  bloqueo consultivo por empresa (QC-81) no lo haría: el ajuste y el alta no lo piden (§13.2).
- **Orden de bloqueos, siempre el mismo**: (1) bloqueo consultivo del correlativo, solo en el alta
  (`order-prisma.ts:183-185`); (2) fila del pedido; (3) filas de productos por `id` ascendente.
  El ajuste y el alta de lote solo toman (3) sobre un producto. Sin ciclos de espera posibles.
- El `CHECK stock >= 0` sigue siendo la última red.

---

## 8. Dónde se engancha

| Camino | Hoy | Con la ficha |
|---|---|---|
| Crear (`pedidos/domain/create-order.ts:99-123`) | calcula coste y `orders.create` | coste fuera de la transacción (igual que hoy); `unitOfWork.run`: `create` → `buildRequirement` → `syncForOrder` → `setReservedAt` |
| Editar (`update-order.ts:64-98`) | `findAliveById`, `assertTransition`, `updateAlive` | lectura previa igual; `unitOfWork.run`: `lockAliveById`, **repetir** `assertTransition` sobre la fila bloqueada, `updateAlive`; si el destino es `ENTREGADO` → `syncForOrder` + `consumeForOrder` (`R29`); si no → `syncForOrder` + `setReservedAt` |
| Cancelar (`cancel-order.ts:58-67`) | `cancelAlive` | `unitOfWork.run`: `lockAliveById`, `cancelAlive`, `releaseForOrder('release')`, `setReservedAt(null)` |
| Borrar (`delete-order.ts:46-56`) | `softDeleteAlive` | ídem con `softDeleteAlive` (N5) |
| Finalizar (`asignaciones/domain/finish-assigned-order.ts:68-87`) | `orders.transitionAliveById(..., 'ENTREGADO')` | **misma llamada**; el contrato consume por dentro (§5.4). Nuevo: `'insufficient_material'` → `MaterialShortageError` de `asignaciones` |
| Iniciar (`start-assigned-order.ts:50-67`) | `PENDIENTE → EN_CURSO` | la misma transición; al no ser `ENTREGADO`, no toca la reserva |
| Edición que deja `ENTREGADO` | permitida por `order-transitions.ts:23-24` y `order-input.ts:86-102` | consume (`[D12]`). QC-145 la retirará |
| Coste (`resolve-ingredients-cost.ts`) | total de lotes con existencia | **no cambia** (QC-123 sigue mandando sobre el importe) |

`CreateOrderDeps`, `UpdateOrderDeps`, `CancelOrderDeps` y `DeleteOrderDeps` ganan una dependencia
`unitOfWork`. Cancelar y borrar no necesitan la receta: liberar solo lee el libro.
`createTransitionOrder` sí recibe `recipes` para la necesidad de respaldo de N2.

---

## 9. El proceso diario (primer cron del sistema)

### 9.1 Piezas

| Pieza | Archivo |
|---|---|
| Declaración | `vercel.json` (nuevo): `{ "crons": [{ "path": "/api/cron/caducar-pedidos", "schedule": "0 7 * * *" }] }` (N7) |
| Ruta | `app/api/cron/caducar-pedidos/route.ts`: reexporta `GET` y declara `runtime = 'nodejs'` y `maxDuration = 300` **con literal**, igual que `app/api/documentos/trabajos/route.ts:19-57` |
| Handler | `lib/modules/pedidos/adapters/driving/order-expiry-cron-route.ts` |
| Secreto | `lib/modules/pedidos/adapters/driven/config/cron-secret-env.ts`: lee `CRON_SECRET` **al invocar**, compara `Authorization: Bearer <secreto>` con `timingSafeEqual`; devuelve `'ok' \| 'unauthorized' \| 'misconfigured'` |
| Caso de uso | `lib/modules/pedidos/domain/expire-stale-orders.ts` (`createExpireStaleOrders`) |
| Candidatos | `findExpirableOrders(threshold, limit)` en el driven de `pedidos`: todas las empresas, `status = 'PENDIENTE' AND deleted_at IS NULL AND reserved_at <= threshold`, orden `reserved_at, id`, usa `orders_expirable_idx` |
| Variable | `.env.example`: `CRON_SECRET=` con su bloque explicativo. Vercel lo envía solo como `Authorization: Bearer` cuando la variable existe en el proyecto |

`/api/**` no está en `PRIVATE_ROUTE_PREFIXES` (`lib/shared/routes.ts:206-244`), así que el
middleware no exige sesión: la única puerta es el secreto, como la firma del webhook de QC-111
(`document-job-route.ts:23-28`).

### 9.2 Flujo

```
GET /api/cron/caducar-pedidos
  auth = cronSecret.verify(header)
    'misconfigured' -> log order_expiry_misconfigured, 500, sin leer nada        (R24)
    'unauthorized'  -> 401, sin leer nada                                         (R24)
  now = reloj; threshold = now - 15 días
  hasta vaciar candidatos o agotar 240 s:
    lote = findExpirableOrders(threshold, 100)
    por cada { id, companyId }:
      try unitOfWork.run:
        fila = lockAliveById(id, { companyId })
        si fila == null o status != PENDIENTE o reserved_at > threshold -> nada (idempotencia, R25)
        cancelAlive(id, 'pedido caducado', null, now)                             (R21, [D7])
        releaseForOrder('expire', actorId null)
        setReservedAt(null)
      catch -> anotar { id, companyId, code } y seguir                             (R26)
  si hubo fallos -> console.error order_expiry_failed {...}, 500                   (pregunta 3)
  si no          -> 200 { expired: n }
```

- **Idempotente por construcción**: la segunda ejecución encuentra `CANCELADO` bajo el bloqueo y no
  hace nada; dos ejecuciones solapadas se serializan en la fila del pedido (`R25`).
- **Un pedido que falla no arrastra a los demás**: una transacción por pedido (`R26`). Si el mismo
  pedido falla siempre, sale en el log cada día hasta que alguien lo mire.
- **Sin actor**: es una operación del sistema; no hay permiso que comprobar y la puerta es el
  secreto. `R41` no se contradice: no escribe fuera de una operación de `pedidos`.
- El motivo es la constante `EXPIRED_ORDER_REASON = 'pedido caducado'` de
  `pedidos/domain/order-expiry.ts`, y el plazo `ORDER_RESERVATION_TTL_DAYS = 15` (un solo sitio;
  el plazo configurable por empresa está fuera de alcance).

---

## 10. Lecturas y pantallas

| Qué | Dónde | Cambio |
|---|---|---|
| Listado de inventario | `listAliveProducts` (`product-prisma.ts:226-245`) | una segunda consulta agregada por página devuelve `reserved`/`available` por producto; `ProductView` gana los dos (cadenas de 4 decimales). Columnas «Total», «Reservado», «Disponible» en `product-columns.tsx` |
| Lotes de un producto | `findBatchesOfAliveProduct` (`product-prisma.ts:680-693`) | añade `reserved`, `available`, `overReserved` por lote. `product-batches-panel.tsx` pinta los tres y la marca «Sobre-reservado» (`R34`, `R37`) |
| Historial de un lote | `findBatchMovements` (`batch-movement-prisma.ts:67-84`) y `list-batch-movements.ts` | une asientos de `inventory_movements` y `reservation_movements` en un `BatchHistoryEntry` con `kind` (`opening`, `adjustment`, `consumption`, `reserve`, `release`, `expire`, `consume`), `quantity`, `reason`, `orderNumberText`, `authorName`, `createdAt`; resuelve autores con `PeopleDirectory` (como hoy) y números con `OrderNumberDirectory` (§5.5). `batch-history.tsx` etiqueta cada tipo y muestra «Sistema» cuando no hay autor (pregunta 4) |
| Respuesta del ajuste | `adjust-batch-dialog.tsx` | si `overReserved`, un aviso visible —no solo color— «El lote queda sobre-reservado: hay pedidos sin cobertura completa.» (`R33`) |
| Cobertura en Pedidos | `app/(private)/pedidos/...` | la página pide `pedidos.findCoverage(orderIds)` (nuevo, `ReservationQueries` detrás) una vez por página, como el lote de responsables de QC-102; etiqueta en fila y hoja (N6, `R35`) |
| Restante del formulario | `order-ingredients-table.tsx:107-112` | tipo cadena; significado según N4 |

Todo con `inventario.consultar` o `pedidos.consultar`, que ya exigen esas pantallas y sus
acciones (`R40`, `[D15]`). Targets táctiles de 44 px. El valor exacto del `title` no es la única
vía de verlo: la celda lleva también un `aria-label` con la cifra completa, así que no depende de
`:hover`.

---

## 11. Errores nuevos

En `lib/modules/errores/domain/error-codes.ts` y `error-catalog.ts` (la guardia
`guard-catalogo-de-errores.test.ts` exige las dos mitades):

| Código | Mensaje | Lo lanzan |
|---|---|---|
| `insufficient_material` | «No hay material suficiente en inventario para entregar el pedido.» | `pedidos` (`InsufficientMaterialError`) y `asignaciones` (`MaterialShortageError`) |

La respuesta del ajuste sobre-reservado **no es un error** (`R33`): es un campo del éxito.

---

## 12. Cómo se prueba

| Nivel | Qué |
|---|---|
| Unit, puro | `plan-reservation.test.ts`: FIFO, desempate `'9'`/`'10'`, todo-o-nada, unidad sin base común saltada, conversión, redondeo hacia arriba solo con más de 4 decimales, receta vacía. `decimal-quantity.test.ts`. `batch-order.test.ts` y el `order-cost.test.ts` actual en verde con el comparador movido. `order-requirement.test.ts` |
| Unit, casos de uso | crear/editar/cancelar/borrar/transicionar con dobles de `OrderUnitOfWork` que registran el orden de llamadas; autorización antes de abrir la unidad (dobles que fallan si los llaman); `expire-stale-orders.test.ts` (un fallo no para los demás, idempotencia); handler del cron (401, 500 sin secreto, 500 con fallos, 200) |
| Integración (`tests/integration/inventario/reservation.int.test.ts`, `.../pedidos/order-reservation.int.test.ts`) | carrera real de dos altas por 1.500 sobre 2.000 con dos conexiones (`R16`); edición a la baja deja solo la diferencia en el libro; cancelar y borrar liberan; entregar baja lote, asiento `consumption`, `products.stock` y `consume`; merma deja el lote sobre-reservado; la segunda entrega no consume (`R32`); aislamiento por empresa; `CHECK` y FK de §3 |
| Migraciones | tests de esquema de la tabla, enum, columnas, `numeric(14,4)`; `down.sql` falla con decimales; **paridad**: la migración 4.3 y `planReservation` producen el mismo reparto sobre los mismos datos (N8) |
| Guardias | `guard-libro-de-inventario` con cuatro caminos; `guard-empresa-en-esquema`, `guard-rls-force`, `guard-arquitectura-modulos` (sin ciclo, sin Prisma en composición), `guard-ambito-empresa-*`, `guard-dependencias-aprobadas` (sin cambios en `package.json`, `R47`) |
| E2E (`e2e/reserva-de-material.spec.ts`) | `R48`: lote de 2.000; pedido A de 1.500 → inventario muestra 1.500 reservado y 500 disponible; pedido B de 1.500 → «Sin apartar» y el reservado sigue en 1.500; cancelar A → reservado 0; editar B (reintenta) → aparta; entregar B por la edición en Pedidos → total 500, reservado 0, historial con el consumo |

Cada `R<n>` va en el nombre de su caso; el mapa `R → test` lo escribe el implementer en
`progress/impl_QC-141-reserva-de-material-del-pedido.md`.

---

## 13. Alternativas descartadas

### 13.1 La reserva como filas con estado (`active` → `released`/`consumed`)

Una fila por pedido y lote que cambia de estado. Descartada: es una tabla transaccional que se
**actualiza**, y el historial completo de `[D11]` («cada apartado, liberación, caducidad y consumo»)
no cabe en una fila con un solo estado final: una edición que sube, otra que baja y una
cancelación dejarían una fila que ya no cuenta lo que pasó. El libro append-only lo cuenta
por construcción y sigue el precedente de `inventory_movements`.

### 13.2 Bloqueo consultivo por empresa (precedente QC-81)

`pg_advisory_xact_lock(141, hashtext('reservas:' || company_id))` en toda operación de reserva.
Descartada como mecanismo principal: **el ajuste y el alta de lote no lo piden**, así que una merma
podría bajar la existencia entre la lectura y la escritura de una reserva; habría que añadirlo a
los tres caminos de `product-prisma.ts`. Además serializa productos que no tienen nada que ver. El
bloqueo de la fila del producto ya existe en esos caminos y es más fino.

### 13.3 Apartar los pedidos existentes con un script de TypeScript en el `build`

Reutilizaría `planReservation` sin duplicarlo. Descartada: `build` corre en **cada** despliegue
(`package.json:7`), así que el script necesitaría una marca de «ya ejecutado», y guardarla exigiría
una tabla sin empresa que `guard-empresa-en-esquema` no admite. Además volvería a intentar apartar
en cada despliegue los pedidos que no alcanzaron, que no es lo que dice `[D10]`. La migración SQL
corre una sola vez por construcción (`_prisma_migrations`). El coste —la regla escrita dos veces—
se paga con el test de paridad (N8).

### 13.4 `reserved` desnormalizado en `product_batches` y `products`

Ahorraría la agregación de lectura. Descartada por ahora: sería una segunda verdad de lo que dice
el libro, mantenida a mano en cada camino, cuando el listado pagina a 25 y el índice por
`batch_id` basta. Si el libro crece hasta notarse, es una ficha propia con su medida.

### 13.5 Transacciones separadas y compensación

Guardar el pedido y apartar después, en otra transacción, deshaciendo a mano si falla. Descartada:
viola `R15`, y cancelar o entregar con la reserva fuera de la transacción deja material apartado
por un pedido muerto o existencia sin bajar por uno entregado.

---

## 14. Dependencias

**Ninguna** (`[D18]`, `R47`). La tarea programada es `vercel.json`, que no es un paquete. La
comparación en tiempo constante es `node:crypto`. Los decimales, `BigInt` (§2.3).

---

## 15. Riesgos

- **La refactorización de `order-prisma.ts` a fábrica** toca el alta con su reintento del
  correlativo; su test `tests/integration/pedidos/order-sequence.int.test.ts` tiene que seguir
  verde sin cambiar.
- **La migración 4.3 sobre datos reales**: si hay muchos pedidos vivos, corre dentro del
  `prisma migrate deploy` del `build`. Se mide en la base de pruebas con un volumen parecido antes
  del PR.
- **El Finalizar puede fallar** por material si se aprueban 2 y N2: hoy nunca falla. La pantalla
  del operario tiene que mostrar el mensaje del catálogo.
- **Paralelismo**: la ficha toca `lib/composition/index.ts`, `db/schema.prisma`,
  `order-prisma.ts`, `product-prisma.ts` y `finish-assigned-order.ts`. Cualquier otra ficha
  `in_progress` sobre esos archivos choca (`AGENTS.md > Paralelismo`).
