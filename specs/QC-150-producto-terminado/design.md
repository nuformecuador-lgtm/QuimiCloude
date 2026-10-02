# QC-150 — producto-terminado · design.md

> **Enmienda del 2026-09-26 (QC-170).** §1 (lote en la rama del Finalizar), §4.1 (`planFinishedGoods`
> con `floor`) y §4.3 (el Finalizar da de alta el lote) quedan derogados: el Finalizar ya no da de
> alta nada y Terminar da de alta un lote por línea del reparto. El resto sigue vigente. Detalle en
> `specs/QC-170-pedido-en-varias-presentaciones/design.md > 8`.

> Escrito por `spec_author` el 2026-09-23 sobre la rama `feature/QC-150-producto-terminado`, que hoy
> está a la altura de `dev` (`a8986a10`). **Todo lo de QC-141 que se cita aquí está leído en su
> worktree** (`.worktrees/QC-141-reserva-de-material-del-pedido/`, rama sin mergear, T10 sin cerrar):
> nombres de archivos, de restricciones y firmas pueden cambiar antes de su merge. T0 los vuelve a
> comprobar contra `dev` antes de escribir nada.
>
> **Enmendado el 2026-09-23 con las respuestas de F1.4** (D11-D19 de `requirements.md`). Cambian
> §0, §2, §3, §4, §5, §6, §7, §8 y §9. Lo más gordo: el contenido se **copia** en el pedido y en el
> lote en vez de bloquearse (D16), el coste del lote cuenta como cero el ingrediente sin coste (D13)
> y la edición en Pedidos **no** da de alta producto terminado (D15).

---

## 0. Preguntas: respondidas y abiertas

### 0.1 Respondidas en F1.4 (2026-09-23)

| # | Respuesta | Fila | Requisitos | Efecto en el diseño |
|---|---|---|---|---|
| 1 | Cantidad del pedido en la unidad de su presentación | D11 | R12 | §4.1 sin conversión |
| 2 | Coste / cantidad que entra | D12 | R14 | §4.1 |
| 3 | Ingrediente sin coste = 0; sin ninguno, coste 0; el importe de QC-123 no cambia; `unit_cost` sigue `NOT NULL` | D13 | R15 (derogado), R42, R43 | §4.1, §4.3 (el momento del cálculo lo cierra D21) |
| 4 | Rechazar con `no_whole_package` | D14 | R19 | §4.1, §6 |
| 5 | Solo el Finalizar; la edición en Pedidos no da de alta | D15 | R27 (negativo) | §4.3 |
| 6 | No se bloquea: se **copia** en el pedido y en el lote | D16 | R12, R18, R25, R38-R41, R44 | §2.2-2.5, §3, §4, §5. Desaparece el disparador `presentations_check_content_locked` |
| 7 | Nace uno nuevo | D17 | R35 | §2.3 (índice por vivos) |
| — | Confirmadas: pedido sin presentación no se finaliza; el tipo terminado no cambia; el día del despliegue no se finaliza nada hasta rellenar contenidos | D18 | R4, R18 | — |
| — | Enmienda del catálogo aprobada | D19 | R18, R19, R4, R28, R29, R31 | §6 |

### 0.2 Respondidas al aprobar el spec (2026-09-23)

| # | Respuesta | Fila | Requisitos | Efecto en el diseño |
|---|---|---|---|---|
| 8 | Pedido sin copia del contenido (vivos anteriores a la ficha, o creados cuando su presentación aún no tenía contenido): **al Finalizar se usa el contenido vigente** de la presentación, leído con `FOR SHARE` dentro de la transacción; si tampoco lo tiene, se rechaza con `presentation_without_content` | D20 | R44, R18 | §4.4 paso 2. Sin relleno en la migración |
| 9 | Coste del lote: **si `orders.ingredients_cost` no es nulo, se usa ese**; si es nulo, **se recalcula al Finalizar**, **antes** de consumir, con la regla de QC-123 y el ingrediente sin coste como cero. Se descarta guardar un segundo importe en el pedido | D21 | R42, R43 | §4.1, §4.3 paso 2 |

**No queda ninguna pregunta abierta.**

---

## 1. Mapa de la solución

```
/asignacion/[id]  Finalizar
   asignaciones.finishAssignedOrder            (sin cambios de lógica; traduce resultados nuevos)
        │ OrderCatalog.transitionAliveById
        ▼
   pedidos.createTransitionOrder  ── OrderUnitOfWork.run ── una transacción ──────────────┐
        lockAliveById → [coste del lote] → setStatus → consumeForOrder (QC-141)            │
        → finishedGoods.receiveFromOrder (NUEVO)  → setReservedAt(null)                    │
                                                                                            ▼
   inventario (dominio)  planFinishedGoods (puro)            inventario (driven)  receiveFinishedGoods
                         FinishedGoodsIntake (tipo)                               en product-prisma.ts

/pedidos  alta y edición
   pedidos.createOrder / updateOrder  ── copian presentations.content en orders.presentation_content
```

- **`inventario` es dueño de todo lo que se escribe en inventario**: el producto terminado, su lote,
  su asiento y su existencia. `pedidos` le pasa lo que solo `pedidos` sabe: receta, cantidad,
  presentación, **copia del contenido**, **coste del lote** y nombre de la receta.
- **`pedidos` es dueño de la copia del contenido en el pedido** (D16): la lee de la presentación con
  `PresentationCatalog.findRefs`, que ya usa para validar la presentación (`create-order.ts:110`,
  `update-order.ts:92`).
- **No hay arista nueva en el grafo de módulos**: `pedidos → inventario`, `pedidos → recetas` y
  `pedidos → unidades` ya existen (`order-cost.ts:6-8`). `inventario` sigue sin importar `pedidos` ni
  `recetas`.
- **La transacción es la de QC-141** (`OrderUnitOfWork`, su `design.md > 5.2`): esta ficha solo
  añade un tercer participante al `OrderTransactionScope`.

---

## 2. Modelo de datos

### 2.1 Enums

| Enum | Hoy | Cambio |
|---|---|---|
| `ProductType` (`db/schema.prisma:371-375`, migración `20260922150000_product_type_enum`) | `PRODUCT`, `MACHINE`, `PACKAGING` | añade **`FINISHED_PRODUCT` al final** (D1). El orden no se toca: Postgres ordena por declaración |
| `InventoryMovementKind` (`schema.prisma:336-339` + `consumption` de QC-141) | `opening`, `adjustment`, `consumption` | añade **`production` al final** (R16) |

Los dos `ADD VALUE` van en una **migración propia** (§3.1): Postgres no deja usar un valor de enum
en la misma transacción en que se añade, y la migración siguiente lo usa en `CHECK` e índices.
QC-141 separó `consumption` por el mismo motivo (su `design.md > 4.1`).

### 2.2 `presentations.content`

```prisma
model Presentation {
  // ...
  /// Cuanto cabe en un envase, en la unidad de la presentacion. NULL = no declarado.
  content Decimal? @db.Decimal(14, 4)
}
```

- `CHECK (content IS NULL OR content > 0)` → `presentations_content_positive`.
- **Anulable y sin valor por defecto** (R6, R9).
- `Decimal(14,4)`, como `orders.quantity` y la existencia tras QC-141.
- **Se puede cambiar siempre** (R40, D16): ningún disparador lo bloquea. Lo protege la copia.

### 2.3 La identidad del producto terminado en `products`

```prisma
model Product {
  // ...
  /// Solo en productos terminados: de que receta y en que presentacion se fabrica.
  recipeId       String? @map("recipe_id") @db.Uuid
  presentationId String? @map("presentation_id") @db.Uuid
}
```

- **Sin `@relation`** en las dos: `Recipe` es de `recetas`, y la FK a `presentations` se escribe a
  mano compuesta, como las demás FK del repo hacia otros módulos o con empresa (drift a propósito).
- FK `products_recipe_id_fkey`: `recipe_id → recipes(id) ON DELETE RESTRICT ON UPDATE CASCADE`.
  `recipes` no tiene clave `(company_id, id)`, y añadirla sería tocar la tabla de otro módulo por
  esta ficha. La empresa la garantiza el único escritor (§4.4), que toma la receta **del pedido**.
- FK `products_company_id_presentation_id_fkey`: `(company_id, presentation_id) →
  presentations(company_id, id)` contra `presentations_company_id_id_key` (`schema.prisma:260`).
- `CHECK products_finished_identity_matches_type`:
  `(type = 'FINISHED_PRODUCT') = (recipe_id IS NOT NULL AND presentation_id IS NOT NULL)` y
  `(recipe_id IS NULL) = (presentation_id IS NULL)`.
- **Índice único parcial** `products_finished_identity_key ON products (company_id, recipe_id,
  presentation_id) WHERE type = 'FINISHED_PRODUCT' AND deleted_at IS NULL` (R22, R23, R35, D17), y
  además `products_recipe_id_idx`, total, para el `RESTRICT` de `recipes`.

### 2.4 `orders.presentation_content` (módulo `pedidos`, D16)

```prisma
model Order {
  // ...
  /// Copia del contenido de la presentacion al crear el pedido o al cambiarle la presentacion.
  /// NULL = la presentacion no tenia contenido entonces, o el pedido es anterior a esta columna.
  presentationContent Decimal? @map("presentation_content") @db.Decimal(14, 4)
}
```

- `CHECK (presentation_content IS NULL OR presentation_content > 0)`, y
  `CHECK (presentation_id IS NOT NULL OR presentation_content IS NULL)`: no hay copia sin
  presentación.
- **Sin relleno** en la migración (D20: el Finalizar usa el contenido vigente cuando no hay copia);
  además, hoy ninguna presentación tiene contenido.
- La escriben `create`/`updateAlive` del repositorio de escritura de `pedidos` (§4.5). Nada más la
  toca.

### 2.5 `product_batches.package_content` (D16, R41)

```prisma
model ProductBatch {
  // ...
  /// Contenido del envase con el que se contaron las unidades del lote. Solo en lotes de producto
  /// terminado.
  packageContent Decimal? @map("package_content") @db.Decimal(14, 4)
}
```

- `CHECK (package_content IS NULL OR package_content > 0)`.
- Solo lo escribe `receiveFinishedGoods`. Que sea obligatorio en los lotes de producto terminado lo
  garantiza ese único escritor: un `CHECK` no puede mirar el tipo del producto, y un disparador
  sería un objeto más con drift sobre la tabla con más guardias del repo.
- `unit_cost` **sigue `NOT NULL`** (D13, R43). `product_batches_check_unit` (QC-121) no cambia y
  encaja por construcción.

### 2.6 `inventory_movements`

QC-141 añade `order_id` con `CHECK ((kind = 'consumption') = (order_id IS NOT NULL))` y reescribe
`inventory_movements_reason_matches_kind` (su `design.md > 3.2`). Esta ficha:

- Reescribe el primero: `(kind IN ('consumption', 'production')) = (order_id IS NOT NULL)`. El nombre
  exacto se lee de la migración de QC-141 ya mergeada (T0).
- Reescribe el segundo para que `production` vaya **sin** motivo.
- Añade `CHECK (kind <> 'production' OR quantity > 0)`.
- Añade **`inventory_movements_one_production_per_order ON inventory_movements (order_id) WHERE
  kind = 'production'`**, único parcial (R21).

### 2.7 RLS

Ninguna tabla nueva. `products`, `presentations`, `product_batches`, `orders` e
`inventory_movements` siguen `ENABLE` + `FORCE` sin políticas. Las migraciones no hacen `UPDATE` de
datos, así que no necesitan el paréntesis `NO FORCE` / `FORCE`
(`20260922130000_orders_presentation/migration.sql:12-14`).

---

## 3. Migraciones

Escritas **a mano** y aplicadas con `pnpm run db:migrate` (`prisma migrate deploy`): `presentations`,
`products`, `product_batches` y `orders` cargan con FK, disparadores e índices parciales que
`migrate dev` lee como drift (cabecera de `20260911120000_presentation_unit/migration.sql:16-21`).
Prefijo **siempre posterior a la última migración de `dev` en el momento de crearla**; ningún par de
directorios comparte prefijo (QC-141 `design.md > 4.0`).

**Toda migración se aplica y se revierte contra la base propia de la ficha (`QuimiCloude_QC150`),
nunca contra la compartida de `.env`** (`progress/history.md`, lección de QC-147).

### 3.1 `<ts>_finished_product_enum_values`

```sql
ALTER TYPE "ProductType" ADD VALUE 'FINISHED_PRODUCT';
ALTER TYPE "InventoryMovementKind" ADD VALUE 'production';
```

`down.sql`: recrea cada tipo sin su valor **después** de un bloque que falla si hay algún producto
`FINISHED_PRODUCT` o algún asiento `production` (R36). `products.type` tiene
`DEFAULT 'PRODUCT'`, que hay que soltar y reponer alrededor del cambio de tipo.

### 3.2 `<ts>_finished_products_and_content_copies`

1. `presentations.content` y su `CHECK` (§2.2).
2. `products.recipe_id`, `products.presentation_id`, sus dos FK, el `CHECK`, el índice único parcial
   y `products_recipe_id_idx` (§2.3).
3. `orders.presentation_content` y sus dos `CHECK` (§2.4).
4. `product_batches.package_content` y su `CHECK` (§2.5).
5. Los `CHECK` y el índice de `inventory_movements` (§2.6).

`down.sql`, en orden inverso, con la misma guarda de §3.1 al principio. Quitar las columnas pierde
los contenidos tecleados y las copias de los pedidos. Se acepta porque solo se revierte si no hay
ningún producto terminado, y se dice en la cabecera.

---

## 4. Dominio y contratos

### 4.1 Cálculos puros

**`inventario/domain/finished-goods.ts`** (nuevo):

```ts
export type FinishedGoodsPlan =
  | { readonly kind: 'planned'; readonly packages: string; readonly quantity: string;
      readonly content: string; readonly unitCost: string }
  | { readonly kind: 'no_content' }
  | { readonly kind: 'no_whole_package' };

export function planFinishedGoods(input: {
  readonly orderQuantity: string;   // Decimal(14,4), en la unidad de la presentacion (D11)
  readonly content: string | null;  // la copia del pedido, o la vigente si no hay copia (R44)
  readonly lotCost: string;         // nunca nulo (D13, R43)
}): FinishedGoodsPlan;
```

- `packages = ⌊orderQuantity / content⌋` con **enteros escalados** (`BigInt` a escala 4), sin
  redondeo alguno (R12).
- `quantity = packages × content`, exacto (R12). `content` se devuelve para guardarlo en el lote
  (R41).
- `unitCost = deriveUnitCost(lotCost, quantity)` (`inventario/domain/unit-cost.ts`, con la firma
  decimal que deja QC-141): `HALF_UP` a 4 decimales, dividiendo entre la **cantidad que entra**
  (R14, D12). `lotCost = '0.0000'` da `unitCost = '0.0000'` (R42).
- Sin librería de decimales (QC-90, QC-141 D18); se usa `decimal-quantity.ts` de QC-141.

**`pedidos/domain/order-cost.ts`**: gana `calculateLotIngredientsCost(input: CostInput): string`, que
recorre las líneas con el mismo `calculateLineCost` (`order-cost.ts:122-189`) pero suma **cero**
donde este devuelve `null`, y devuelve `'0.0000'` si todas lo son o no hay líneas (R42). **No toca
`calculateIngredientsCost`** (R43). Un resultado que desborda `Decimal(14,4)` sigue siendo un error,
no un cero: se lanza como `unexpected`. `resolveIngredientsCost` gana una hermana,
`resolveLotIngredientsCost`, que comparte las lecturas.

Casos de test: `50.5 / 1 → 50, 50`; `10 / 3 → 3, 9`; `50 / 0.75 → 66, 49.5`;
`0.5 / 1 → no_whole_package`; `content null → no_content`; coste `100 / 50 → 2.0000`; coste
`'0.0000'` → `0.0000`; dos ingredientes con uno sin lotes → solo el otro; ninguno con coste →
`0.0000`.

### 4.2 Lo que publica `inventario`

```ts
export type FinishedGoodsOutcome =
  | { readonly kind: 'received'; readonly productId: ProductId; readonly productName: string;
      readonly packages: string }
  | { readonly kind: 'presentation_without_content' }
  | { readonly kind: 'no_whole_package' };

export interface FinishedGoodsIntake {
  receiveFromOrder(input: {
    readonly orderId: string;
    readonly companyId: string;
    readonly recipeId: string;
    readonly recipeName: string;
    readonly presentationId: string;
    readonly orderQuantity: string;
    readonly orderContent: string | null;   // copia del pedido (D16)
    readonly lotCost: string;               // ya resuelto por pedidos (§4.3)
    readonly actorId: string;
    readonly now: Date;
  }): Promise<FinishedGoodsOutcome>;
}
```

- `PRODUCT_TYPE_VALUES` (`product-queryable.ts:31`) pasa a cuatro valores (R5);
  `MANUAL_PRODUCT_TYPE_VALUES` (nuevo) son los tres de siempre (R2, R3). El **alta** valida contra
  esta, la **edición** acepta los cuatro y R4 rechaza el cambio de tipo.
- `ProductRef` gana `type` (R29).
- `PresentationRef` (`presentation-catalog.ts:5-8`) gana `content: string | null`, para que
  `pedidos` copie sin tocar la tabla (R38, R39).
- `PresentationView` y los esquemas de presentación ganan `content` opcional y anulable,
  `^\d{1,10}(\.\d{1,4})?$`, `> 0` (R6, R7).
- `ProductBatchView` gana `packageContent: string | null` (R25).

### 4.3 El Finalizar (sobre el código de QC-141)

`OrderTransactionScope` (`pedidos/ports/order-unit-of-work.ts`, QC-141) gana
`readonly finishedGoods: FinishedGoodsIntake`.

`pedidos/domain/transition-order.ts` (QC-141), rama `to === 'ENTREGADO'`:

1. Tras `lockAliveById`: si `locked.presentationId === null` → `PresentationWithoutContentError`
   (R18), antes de consumir.
2. **Coste del lote, antes de consumir** (R42, D21): si
   `locked.ingredientsCost !== null`, es ese; si es nulo, `resolveLotIngredientsCost(...)` con
   `locked.recipeId` y `locked.quantity`. Tiene que ir antes de `consumeForOrder`: después, los lotes
   ya habrían bajado. Las lecturas van por los catálogos públicos (cliente global), que leen lo
   comiteado; es la misma foto que vería una edición en ese instante. `TransitionOrderDeps` gana
   `products` y `units` (ya los tiene `create-order`).
3. `setStatus` y `consumeForOrder`, como en QC-141.
4. Nombre de la receta con `RecipeCatalog.findRefsIncludingDeleted`.
5. `scope.finishedGoods.receiveFromOrder({ ..., orderContent: locked.presentationContent, lotCost })`.
6. `presentation_without_content` / `no_whole_package` → error de `pedidos`: la transacción entera se
   deshace (R18, R19, R20).
7. `received` → `setReservedAt(null)` y devolver `{ kind: 'ok', finishedGoods: { productName,
   packages } }`.

`OrderCatalog['transitionAliveById']` gana `'presentation_without_content'` y `'no_whole_package'`,
y el `'ok'` lleva lo que pide la confirmación. `finish-assigned-order.ts` los traduce y devuelve
`{ numberText, packages, productName }`; `order-execution-actions.ts:63-78` los pasa en la
redirección y `assigned-order-delivered-notice.tsx` los pinta (R24). `start-assigned-order.ts` solo
compara con `'ok'`.

**Solo por el Finalizar (R27, D15).** La edición en Pedidos que deja el pedido `ENTREGADO` (camino
de QC-141 en `update-order.ts`, que QC-145 retirará) **no** llama a `finishedGoods`. Para que ese
«no» no dependa de que nadie se acuerde, la rama `ENTREGADO` de `update-order.ts` no recibe
`finishedGoods` en su ámbito: se le da un `OrderTransactionScope` sin él (tipo
`Omit<OrderTransactionScope, 'finishedGoods'>`) o un doble que lanza. Un test lo fija.

**Idempotencia (R21)**: el `UPDATE ... WHERE status = from` bajo bloqueo, más el índice de §2.6.

**Permiso (R26)**: `requirePermission(actor, 'asignaciones.consultar')` sigue siendo la primera
línea de `finishAssignedOrder`. `FinishedGoodsIntake` solo existe dentro de la unidad de trabajo.

### 4.4 La escritura (`receiveFinishedGoods`, en `product-prisma.ts`)

Vive en `product-prisma.ts` por `guard-libro-de-inventario.test.ts:244`: el censo pasa de los cuatro
caminos que deja QC-141 a **cinco**. `createFinishedGoodsIntake(db)` (nuevo,
`finished-goods-prisma.ts`) la envuelve sobre el cliente transaccional.

1. **Presentación** de la empresa, `FOR SHARE`: `name`, `unit_id`, `content`. Sin fila →
   `presentation_without_content`.
2. **Contenido a usar** = `orderContent` si no es nulo (D16); si lo es, el `content` vigente de la
   presentación (R44, D20); si los dos son nulos → `presentation_without_content`
   (R18).
3. `planFinishedGoods`. `no_whole_package` → devolver sin escribir.
4. **Producto terminado vivo**, sin carrera (R22): `INSERT ... ON CONFLICT (company_id, recipe_id,
   presentation_id) WHERE type = 'FINISHED_PRODUCT' AND deleted_at IS NULL DO NOTHING`, y después
   `SELECT id, name ... FOR NO KEY UPDATE`. Nombre `` `${recipeName} · ${presentation.name}` ``,
   `name_normalized` con `normalizeProductName`, `unit_id` de la presentación, `qty_alert` nulo.
5. **Lote**: número con `resolveBatchLot` (`product-prisma.ts:339-369`) **después** del bloqueo de
   la fila, como `addBatchToAlive` (`:638-640`). `purchase_date` = fecha civil UTC de `now`,
   `expiry_date` nulo, `created_by` = quien finaliza, `unit_cost` = el del plan,
   **`package_content` = el contenido usado** (R13, R41).
6. `writeMovement` con `kind: 'production'`, cantidad positiva, `orderId` y autor (R16).
7. `recalculateProductStock` (R17).

**Colisión de número de lote**: se propone que `withOrderTransaction` (QC-141) reintente también ante
`P2002` sobre `product_batches_company_lot_unique`. Si no, sale como `unexpected` y el operario
vuelve a pulsar Finalizar.

**Orden de bloqueos** (extiende QC-141 `design.md > 7`): (1) pedido; (2) productos ingrediente por
`id`; (3) presentación `FOR SHARE`; (4) producto terminado; (5) bloqueo consultivo del número de
lote. Un producto terminado nunca es ingrediente (R29). Sin ciclos.

### 4.5 La copia del contenido en el pedido (R38, R39)

- `NewOrder` (`pedidos/domain/order-view.ts:37-44`) gana `presentationContent: string | null`, y
  `OrderRow` también.
- `create-order.ts:110`: ya pide `presentations.findRefs([data.presentationId])`; el `content` de ese
  `PresentationRef` va a `NewOrder` (R38).
- `update-order.ts:92`: igual, pero **solo si la presentación cambia**. Si no cambia, conserva la
  copia de la fila leída (R39). No se recopia por editar otros campos.
- El repositorio de escritura (`create`/`updateAlive` del `OrderWriteRepository` de QC-141) escribe
  la columna.
- La copia se lee fuera de la transacción, como hoy se lee la presentación para validarla. Si la
  presentación cambia de contenido justo entre esa lectura y el `INSERT`, el pedido queda con el
  valor anterior. Es el mismo instante que ya decide qué presentación se valida, y se acepta.

### 4.6 Las prohibiciones

| Req | Dónde | Cómo |
|---|---|---|
| R2 | `product-batch-input.ts` | `type` sobre `MANUAL_PRODUCT_TYPE_VALUES` |
| R3 | `product-form.tsx:542-550` | opciones de `MANUAL_PRODUCT_TYPE_VALUES`; en un producto terminado, el campo es de solo lectura y reenvía su tipo |
| R4 | `update-product.ts` + `updateAliveProduct` | `UPDATE` condicional sobre el tipo; el puerto devuelve `'type_locked'` → `ActionNotAllowedError` |
| R28 | `create-product.ts:109-125`, `addBatchToAlive` | la búsqueda de homónimo devuelve el tipo y rechaza; `addBatchToAlive` lo comprueba de nuevo con la fila bloqueada |
| R29 | `create-recipe.ts:51-57`, `update-recipe.ts:90` | con `ProductRef.type` |
| R30 | `produccion/formulas/components/product-picker.tsx:180` y páginas `nueva`, `[id]` | filtro `type: { kind: 'select', values: MANUAL_PRODUCT_TYPE_VALUES }` (`product-prisma.ts:173-179`) |
| R31, R32 | `adjustBatchStock` (`product-prisma.ts:736-745`) | la consulta que ya bloquea el producto lee su `type`; `delta > 0` en `FINISHED_PRODUCT` → `'increase_not_allowed'` sin `UPDATE` ni asiento |
| R33 | `adjust-batch-dialog.tsx` | texto visible «Solo se admiten ajustes que restan» |

`ActionNotAllowedError` usa el código existente `action_not_allowed` (D19).

---

## 5. Pantallas

| Qué | Dónde | Cambio |
|---|---|---|
| Pestañas de tipo | `product-type-tabs.tsx:15-19` | `FINISHED_PRODUCT: 'Producto terminado'` (R5) |
| Formulario de producto | `product-form.tsx:542-550` | R3 |
| Lotes de un producto | `product-batches-panel.tsx` | si el lote tiene `packageContent`: «50 envases» junto a «50 L», con `stock / packageContent` exacto; nada si no es entero (R25) |
| Diálogo de ajuste | `adjust-batch-dialog.tsx` | R33 |
| Presentaciones | `configuracion/presentaciones/components/{presentation-form,presentation-columns}.tsx` | campo «Contenido» de texto, `inputMode="decimal"`, coma a punto, `font-size >= 16px`, unidad como sufijo; columna con «Sin contenido» (R8). `presentation-select.tsx` no gana el campo |
| Formulario de pedido | ninguno | la copia es invisible: no se pinta ni se edita (D16 no pide mostrarla) |
| Confirmación del Finalizar | `assigned-order-delivered-notice.tsx` | «Pedido X entregado. Entraron 50 envases de Desengrasante industrial · Botella 1L.» (R24) |
| Error del Finalizar | `order-execution-screen.tsx` | mensaje del catálogo |

Sin librerías de UI nuevas; targets de 44 px; nada depende de `:hover`.

---

## 6. Errores: enmienda al catálogo (aprobada en F1.4, D19)

| Código | Mensaje | Lo lanzan |
|---|---|---|
| `presentation_without_content` | «La presentación del pedido no indica su contenido: complétala en Presentaciones antes de finalizar.» | `pedidos` y su traducción en `asignaciones` (R18) |
| `no_whole_package` | «La cantidad del pedido no llena ni un envase de su presentación.» | ídem (R19) |
| `action_not_allowed` | el existente | `inventario`, `recetas` (R4, R28, R29, R31) |

Con D16 ya no hace falta ningún código de «contenido bloqueado».

Con D20, `presentation_without_content` solo sale cuando ni el pedido tiene copia ni la presentación
tiene contenido, así que el mensaje («complétala en Presentaciones») es siempre la corrección.

---

## 7. Alternativas descartadas

### 7.1 Encontrar el producto terminado por su nombre

Buscar un producto vivo llamado «receta · presentación» sin añadir columnas. **Descartada**: un
renombrado haría nacer un segundo producto de la misma combinación (rompe D2), un producto normal
con ese nombre recibiría lotes de producción, y dos Finalizar simultáneos crearían dos productos
porque `name` no es único (`schema.prisma:265`).

### 7.2 Asentar la entrada como `opening`

**Descartada**: `opening` va sin pedido, y el libro no diría de qué pedido salió la existencia
(`docs/architecture.md > Dominio`: movimientos auditables). `production` + `order_id` da además la
idempotencia por índice.

### 7.3 Un producto terminado por receta, con la presentación solo en el lote

**Descartada**: D2 lo cierra, y `product_batches_check_unit` impediría lotes de unidades distintas
bajo un producto.

### 7.4 Que `pedidos` escriba el producto terminado

**Descartada**: `prisma.product`/`prisma.productBatch` son de `inventario`, y
`guard-arquitectura-modulos` lo rechaza.

### 7.5 Guardar el número de envases en el lote

**Descartada**: D5 dice «las botellas solo se muestran», y dos cantidades guardadas se contradirían
tras un ajuste que reste 0,5 L. Lo que se guarda es el **contenido** (D16), del que se derivan los
envases.

### 7.6 Bloquear el cambio de contenido con un disparador (propuesta original de la pregunta 6)

Un `presentations_check_content_locked` como el de la unidad. **Descartada por el humano en F1.4
(D16)** a favor de la copia: el bloqueo obligaba a crear otra presentación para corregir un
contenido mal tecleado, y la copia deja la presentación libre sin cambiar nada de lo ya hecho.

---

## 8. Cómo se prueba

| Nivel | Qué |
|---|---|
| Unit, puro | `finished-goods.test.ts`: casos de §4.1 (R12, R14, R19, R41, R42 con coste cero). `order-cost.test.ts`: `calculateLotIngredientsCost` con un ingrediente sin coste, todos sin coste y receta vacía (R42), y `calculateIngredientsCost` **sin cambios** (R43). `product-input.test.ts` (R2), `presentation-input.test.ts` (R6, R7) |
| Unit, casos de uso | `transition-order.test.ts` con dobles que registran el orden: sin presentación se rechaza antes de consumir; coste resuelto antes de consumir; importe guardado usado tal cual y recálculo solo si es nulo (R42, R43); la producción va después del consumo y un error suyo lo deshace todo (R10, R18, R20). `update-order.test.ts`: la edición a `ENTREGADO` no toca `finishedGoods` (R27) y la copia solo cambia si cambia la presentación (R39). `create-order.test.ts` (R38). `finish-assigned-order.test.ts` (R24, R26). `update-product` (R4), `create-product` (R28), recetas (R29), `adjust-batch-stock` (R31, R32) |
| Integración, base propia | `finished-goods.int.test.ts`: R11, R13, R16, R17, R21, R22 (dos conexiones), R23, R35, R41 (el lote guarda su contenido), R44 (pedido sin copia usa el vigente), y que el lote nunca queda sin `unit_cost` (R43). `finish-with-finished-goods.int.test.ts`: R20 (fallo forzado), R21. `order-content-copy.int.test.ts`: R38, R39, R40 (cambiar el contenido de la presentación no toca pedidos ni lotes) |
| Migraciones | enums, columnas, `CHECK`, índices (R1, R9, R34); `down.sql` falla con datos de producto terminado (R36); aplicar y revertir contra `QuimiCloude_QC150` |
| Componentes | `product-type-tabs` (R5), `product-form` (R3), `presentation-form`/`presentation-columns` (R8), `product-batches-panel` (R25: entero y no entero), `adjust-batch-dialog` (R33), `product-picker` (R30), `assigned-order-delivered-notice` (R24) |
| Guardias | `guard-libro-de-inventario` con cinco caminos; `guard-catalogo-de-errores`; `guard-arquitectura-modulos`; `guard-ambito-empresa-inventario` y `-pedidos`; `guard-empresa-en-esquema`, `guard-rls-force`, `guard-dependencias-aprobadas` sin filas nuevas |
| E2E | `e2e/producto-terminado.spec.ts` (R37): contenido `1` en «Botella 1L»; pedido de `50.5` **creado después** de poner el contenido; asignar, iniciar y Finalizar; la confirmación dice 50 envases; inventario → «Producto terminado» → lote de 50 y «50 envases»; cambiar el contenido de la presentación a `2` y comprobar que el lote sigue diciendo 50 envases; el ajuste solo resta |

Cada `R<n>` va en el nombre de su caso; el mapa `R → test` lo escribe el implementer en
`progress/impl_QC-150-producto-terminado.md`.

---

## 9. Riesgos, solapes y coste

- **Bloqueada por QC-141.** §4.3-4.5 se apoyan en código de QC-141 que **aún no está en `dev`**
  (`transition-order.ts`, `order-unit-of-work.ts`, `OrderWriteRepository`, `consumeBatchStock`,
  `decimal-quantity.ts`, `inventory_movements.order_id`, `deriveUnitCost` decimal). T0 lo contrasta.
- **Solape con QC-145** (pendiente, sin requisitos EARS). Tras D16 **crece**: además de
  `db/schema.prisma` (modelo `Order`), `lib/composition/index.ts`, `transition-order.ts`,
  `order-write-repository.ts`, `finish-assigned-order.ts`, `error-codes.ts`/`error-catalog.ts` y
  quizá `order-execution-screen.tsx`, esta ficha toca ahora **`create-order.ts`, `update-order.ts`,
  `order-view.ts` y la persistencia de pedidos**, que QC-145 también toca para retirar la edición a
  `ENTREGADO`. **No deben estar las dos `in_progress` a la vez** salvo reparto de archivos.
- **Pedidos anteriores a QC-146** sin presentación no se pueden finalizar (D18). **Toda
  presentación nace sin contenido** (R9, aceptado en D18).
- **Coste del lote cuando falta un ingrediente** (D21, aceptado al aprobar): dos lotes
  de pedidos iguales pueden tener costes calculados en momentos distintos: uno en la última edición
  (importe completo) y otro al Finalizar (importe parcial). Es la consecuencia de no añadir columna.
- **Dos motivos nuevos de fallo del Finalizar** (tres con QC-141).
- **Nombre del producto terminado**: se fija al nacer. El nombre compuesto puede superar los 120 de
  `productNameSchema`; T7 lo mide y, si pasa, se lleva al humano en vez de truncar en silencio.
- **Coste que se acepta**: dos migraciones a mano sobre tablas con drift, dos columnas de copia, una
  FK más hacia otro módulo, un quinto camino en la guardia del libro y un tercer participante en la
  transacción de QC-141.

---

## 10. Contraste con `dev` tras el merge de QC-141 y QC-145 (T0, 2026-09-24)

Leído en la rama tras `git merge origin/dev` (`86e9873a`). Ninguna divergencia cambia un requisito
salvo la última, que T7 manda subir. Donde este anexo contradice una sección anterior, manda el anexo.

| # | Lo que decía el diseño | Lo que hay en `dev` | Corrección |
|---|---|---|---|
| C1 | §2.6: el `CHECK` de `order_id` sin nombre | `inventory_movements_order_id_matches_kind` y `inventory_movements_reason_matches_kind` (`20260923150100_*`); además `inventory_movements_reason_in_catalog` y `_quantity_not_zero`; `order_id` es FK compuesta `(order_id, company_id)`; índice `inventory_movements_order_id_idx` no único | T2 reescribe esos dos nombres; los otros dos no cambian |
| C2 | §2.5, §4.1: `unit_cost` sigue `NOT NULL`; un lote a coste `0.0000` es posible | `unit_cost` es **anulable** desde `20260923140000_product_batch_nullable_machine`, y sigue en vigor `product_batches_unit_cost_positive CHECK (unit_cost > 0)`: un lote a coste cero (R42) lo violaría | T2 sustituye ese `CHECK` por `unit_cost > 0 OR (unit_cost = 0 AND package_content IS NOT NULL)` (solo el lote de producción puede costar cero) y añade `CHECK (package_content IS NULL OR unit_cost IS NOT NULL)` (R43). El `down.sql` repone el original tras la guarda |
| C3 | §4.1: `deriveUnitCost('0.0000', q) = '0.0000'` | `deriveUnitCost` devuelve `null` si el resultado redondea a cero o la entrada no es un decimal plano | `planFinishedGoods` devuelve `'0.0000'` cuando el coste del lote es cero o `deriveUnitCost` redondea a cero; valida la entrada antes |
| C4 | §4.3, §9: `finishedGoods` es el tercer participante del ámbito | `OrderTransactionScope` ya tiene `orders`, `reservations` y `recipes`; `TransitionOrderDeps` solo `unitOfWork`; el ámbito se monta en `lib/composition/index.ts` | `finishedGoods` es el cuarto; `TransitionOrderDeps` gana `recipes`, `products` y `units` |
| C5 | §4.3 paso 2: `resolveLotIngredientsCost` con receta y cantidad | `resolveIngredientsCost` ya admite `{ orderId }` para contar como disponible lo apartado por el propio pedido; con la regla de promedio de QC-141, un insumo sin disponible suficiente da `null` en su línea | La hermana recibe también `orderId` (el pedido a finalizar tiene su material apartado); la línea que da `null` cuenta cero |
| C6 | §4.3 (R27): la rama `ENTREGADO` de `update-order.ts` recibe un ámbito sin `finishedGoods` | QC-145 ya retiró la edición a `ENTREGADO`: `OrderEdit = Omit<NewOrder, 'status'>` y el Finalizar es el único camino | Se aplica la cláusula de T9: R27 lo fija un test de que la edición no puede llevar a `ENTREGADO` ni llama a la producción. El `Omit` del ámbito no hace falta |
| C7 | §4.4 paso 5: `resolveBatchLot` | No existe con ese nombre: es `resolveLot(tx, batch, scope)` (privada, `pg_advisory_xact_lock` + `max(lot)+1`), envuelta por `writeBatchWithLotRetry` sobre su propia transacción | `receiveFinishedGoods` llama a `resolveLot` sobre la transacción del Finalizar; el bloqueo consultivo evita la colisión, así que no se toca el reintento de `withOrderTransaction` |
| C8 | §4.4 / §4.3: reintento ante `P2002` del número de lote | `withOrderTransaction` reintenta ante **cualquier** `23505` de SQL crudo (`isDuplicateOrderNumber`) y al tercero lanza `DuplicateOrderNumberError` | El lote se inserta con la API tipada (`tx.productBatch.create`, que además es lo que cuenta el censo de la guardia del libro) y el producto con `ON CONFLICT DO NOTHING`, así que ninguno cae en ese reintento |
| C9 | §4.6 R4, R28, R29, R31: `ActionNotAllowedError` | Solo existe en `identity/domain/errors.ts` | `inventario` y `recetas` declaran la suya con el código `action_not_allowed` |
| C10 | §4.6 y T6: `PRODUCT_TYPE_VALUES` en `product-queryable.ts` | Se define en `inventario/domain/product-type.ts` y `product-queryable.ts` la reexporta | T6 toca `product-type.ts` |
| C11 | Números de línea (`create-order.ts:110`, `update-order.ts:92`, `order-cost.ts:122-189`, `product-prisma.ts:736-745`…) | Se movieron; `calculateLineCost` es privada y devuelve `bigint` a escala 12 | Solo orientativo |
| C12 | §9: el nombre compuesto «receta · presentación» puede pasar de 120 | **Medido**: `recipeNameSchema` 120 + « · » 3 + `presentationNameSchema` 60 = **183 > 120** (`productNameSchema`); la columna `products.name` es `text` sin límite | **Sube al leader** (T7): T7 no empieza hasta que el humano decida |
