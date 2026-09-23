# QC-150 — producto-terminado · design.md

> Escrito por `spec_author` el 2026-09-23 sobre la rama `feature/QC-150-producto-terminado`, que hoy
> está a la altura de `dev` (`a8986a10`). **Todo lo de QC-141 que se cita aquí está leído en su
> worktree** (`.worktrees/QC-141-reserva-de-material-del-pedido/`, rama sin mergear, T10 sin cerrar):
> nombres de archivos, de restricciones y firmas pueden cambiar antes de su merge. T0 los vuelve a
> comprobar contra `dev` antes de escribir nada.

---

## 0. Preguntas abiertas y lo que propone este diseño

Ninguna se da por respondida. Los requisitos que dependen de ellas llevan la marca
**(provisional)** o **(abierto)** y sus tasks esperan a F1.4.

| # | Pregunta | Propuesta | Requisitos | Tasks bloqueadas |
|---|---|---|---|---|
| 1 | Unidad de la cantidad del pedido | Leerla en la unidad de la presentación, que es lo que dice el Alcance. Con «Saco 25 kg» y un pedido de `100`, son 100 kg y 4 sacos. Si la respuesta fuera otra, haría falta conversión de unidades entre la del pedido y la de la presentación, que hoy el pedido no tiene de dónde sacar (no guarda unidad desde `orders_drop_unit_and_unit_price`) | R12 | T5 (solo el cálculo), T7 |
| 2 | Divisor del coste unitario con sobrante | **Coste / cantidad que entra** (el sobrante encarece lo que entra): el coste total del lote coincide con el coste del pedido y nada del dinero consumido desaparece del inventario. La otra opción deja `coste × sobrante / pedido` sin rastro en ningún sitio | R14 | T5 (solo el coste), T7 |
| 3 | Pedido sin coste (`orders.ingredients_cost` nulo) | Sin propuesta firme. Opciones: **(a)** `product_batches.unit_cost` pasa a anulable —toca el coste de QC-123 (`findCostingBatches` tendría que ignorar lotes sin coste), el panel de lotes y el importe del producto—; **(b)** rechazar el Finalizar con un código nuevo; **(c)** recalcular el coste al finalizar —contradice QC-123 D8, «se recalcula en cada edición del pedido y en ningún otro momento»—. R15 fija solo lo que vale con cualquiera: no se guarda cero | R15 | T7 (rama del nulo) |
| 4 | Cero envases enteros | **Rechazar el Finalizar** con código nuevo `no_whole_package`. Entregar sin lote rompería «al Finalizar entra un lote» (D3) y no hay divisor para el coste | R19 | T6 (el código), T7 (la rama) |
| 5 | Entregar desde la edición en Pedidos mientras QC-145 no la retire | **Sí, también por ahí**: es la regla que QC-141 D12 fijó para el consumo («cualquier camino que deje el pedido `ENTREGADO`»), y deja el invariante «todo pedido entregado desde hoy tiene su lote». Si QC-145 se mergea antes que esta ficha, R27 desaparece sin código | R27 | T9 |
| 6 | Cambiar el contenido de una presentación con lotes de producto terminado | **Bloquearlo**, igual que la unidad (`presentations_check_unit_locked`, `20260918130000_product_unit_and_stored_stock/migration.sql:104-124`), con el código existente `presentation_unit_locked` si el humano acepta reutilizarlo o uno nuevo si no. Así la cifra de envases de un lote no cambia nunca | R25 | T3 (disparador), T11 (pintar envases) |
| 7 | Producto terminado dado de baja | **Nace uno nuevo**. Es lo que ya hace el alta manual con un homónimo borrado (`product-repository.ts:77-82`) y lo que permite un índice único parcial por vivos | R35 | T3 (forma del índice), T7 |

**Dos decisiones que este diseño toma sin pregunta, por derivarse de una fila cerrada** (el humano
puede tumbarlas en F1.4):

- **Pedido sin presentación = sin contenido** (R18). Los pedidos anteriores a QC-146 tienen
  `presentation_id` nulo (`20260922130000_orders_presentation/migration.sql:12-14`). Sin presentación
  no hay combinación (D2) ni contenido (D6), así que no se puede finalizar. Consecuencia: **los
  pedidos vivos anteriores a QC-146 no se pueden finalizar** hasta que alguien les ponga presentación
  por la edición.
- **El tipo de un producto terminado no se cambia, y nadie se convierte en producto terminado** (R4).
  Es la única forma de que D1 («no se crea a mano») y D7 (prohibiciones) no se esquiven con una
  edición: `updateProductSchema` acepta hoy `type` (`product-input.ts:53-65`).

---

## 1. Mapa de la solución

```
/asignacion/[id]  Finalizar
   asignaciones.finishAssignedOrder            (sin cambios de lógica; traduce resultados nuevos)
        │ OrderCatalog.transitionAliveById
        ▼
   pedidos.createTransitionOrder  ── OrderUnitOfWork.run ── una transacción ──────────────┐
        lockAliveById → setStatus → consumeForOrder (QC-141)                               │
        → finishedGoods.receiveFromOrder (NUEVO)  → setReservedAt(null)                    │
                                                                                            ▼
   inventario (dominio)  planFinishedGoods (puro)            inventario (driven)  receiveFinishedGoods
                         FinishedGoodsIntake (tipo)                               en product-prisma.ts
```

- **`inventario` es dueño de todo lo que se escribe**: el producto terminado, su lote, su asiento y
  su existencia. `pedidos` le pasa lo que solo `pedidos` sabe (receta, cantidad, presentación,
  coste, nombre de la receta) y `inventario` hace el resto con la presentación que ya es suya.
- **No hay arista nueva en el grafo de módulos**: `pedidos → inventario` y `pedidos → recetas` ya
  existen (QC-141 `design.md > 1`). `inventario` sigue sin importar `pedidos` ni `recetas`: el
  nombre de la receta le llega como cadena.
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
en la misma transacción que lo añade, y la migración siguiente lo usa en `CHECK` e índices. Es el
mismo motivo por el que QC-141 separó `consumption` (su `design.md > 4.1`).

### 2.2 `presentations.content`

```prisma
model Presentation {
  // ...
  /// Cuanto cabe en un envase, en la unidad de la presentacion. NULL = no declarado.
  content Decimal? @db.Decimal(14, 4)
}
```

- `CHECK (content IS NULL OR content > 0)` → `presentations_content_positive`.
- **Anulable y sin valor por defecto** (R6, R9): D6 dice que un pedido cuya presentación no tenga
  contenido no se puede finalizar, o sea que «sin contenido» es un estado legítimo. Ningún relleno.
- `Decimal(14,4)`, como la cantidad del pedido (`orders.quantity`) y la existencia tras QC-141: la
  división del §4.1 opera sobre dos números de la misma escala.
- Si la pregunta 6 se aprueba: disparador `presentations_check_content_locked`, `BEFORE UPDATE OF
  content`, que rechaza el cambio con `ERRCODE 23514` si existe algún lote de la presentación cuyo
  producto sea `FINISHED_PRODUCT`. Mismo patrón que `presentations_check_unit_locked`.

### 2.3 La identidad del producto terminado en `products`

```prisma
model Product {
  // ...
  /// Solo en productos terminados: de que receta y en que presentacion se fabrica.
  recipeId       String? @map("recipe_id") @db.Uuid
  presentationId String? @map("presentation_id") @db.Uuid
}
```

- **Sin `@relation`** en las dos: `Recipe` es de `recetas` y la de `presentations` se escribe a mano
  compuesta, como las demás FK del repo hacia otros módulos o con empresa (drift a propósito).
- FK `products_recipe_id_fkey`: `recipe_id → recipes(id) ON DELETE RESTRICT ON UPDATE CASCADE`.
  `recipes` no tiene clave `(company_id, id)`; añadirla sería tocar la tabla de otro módulo por
  esta ficha. La empresa la garantiza el único escritor (§4.3), que toma la receta **del pedido**, y
  el pedido ya es de la empresa por `orders_company_id_*`.
- FK `products_company_id_presentation_id_fkey`: `(company_id, presentation_id) →
  presentations(company_id, id)` contra `presentations_company_id_id_key`
  (`schema.prisma:260`), igual que `orders_company_id_presentation_id_fkey` (QC-146).
- `CHECK products_finished_identity_matches_type`:
  `(type = 'FINISHED_PRODUCT') = (recipe_id IS NOT NULL AND presentation_id IS NOT NULL)` y
  `(recipe_id IS NULL) = (presentation_id IS NULL)`. Un producto terminado sin combinación, o un
  producto normal con ella, no pueden existir.
- **Índice único parcial** `products_finished_identity_key ON products (company_id, recipe_id,
  presentation_id) WHERE type = 'FINISHED_PRODUCT' AND deleted_at IS NULL` (R22, R23, R35). Por vivos,
  según la propuesta de la pregunta 7. Sirve también de índice de la FK de receta cuando hay
  producto terminado; se añade además `products_recipe_id_idx` total para el `RESTRICT` de `recipes`
  (Postgres no indexa el lado hijo de una FK).
- `products.company_id` ya existe: `guard-empresa-en-esquema` no cambia.

### 2.4 `inventory_movements`

QC-141 añade `order_id` con `CHECK ((kind = 'consumption') = (order_id IS NOT NULL))` y reescribe
`inventory_movements_reason_matches_kind` (su `design.md > 3.2`). Esta ficha:

- Reescribe el primero: `(kind IN ('consumption', 'production')) = (order_id IS NOT NULL)`. El nombre
  exacto de la restricción se lee de la migración de QC-141 ya mergeada (T0); aquí no se inventa.
- Reescribe el segundo para que `production` vaya **sin** motivo, como `opening` y `consumption`.
- Añade `CHECK (kind <> 'production' OR quantity > 0)`: la producción solo suma.
- Añade el índice único parcial **`inventory_movements_one_production_per_order ON
  inventory_movements (order_id) WHERE kind = 'production'`** (R21). Es la red de la idempotencia: la
  primera es el `UPDATE` condicional del estado del pedido (§4.3), pero un pedido solo puede tener un
  lote de producto terminado aunque alguien llegue a llamar dos veces al adaptador.

### 2.5 `product_batches`

**Sin cambios de esquema.** El lote del producto terminado es un lote como cualquier otro: lo
distingue el tipo de su producto. `product_batches_check_unit` (QC-121) sigue mandando y **encaja
por construcción**: el producto terminado nace con la unidad de la presentación y todos sus lotes van
en esa misma presentación (D2).

`unit_cost` sigue `NOT NULL` salvo que la pregunta 3 se responda con la opción (a).

### 2.6 RLS

Ninguna tabla nueva. `products`, `presentations` e `inventory_movements` siguen `ENABLE` + `FORCE`
sin políticas. Las migraciones no hacen `UPDATE` de datos, así que no necesitan el paréntesis
`NO FORCE` / `FORCE` (mismo razonamiento que `20260922130000_orders_presentation/migration.sql:12-14`).

---

## 3. Migraciones

Escritas **a mano** y aplicadas con `pnpm run db:migrate` (`prisma migrate deploy`): `presentations`
y `products` cargan con FK, disparadores e índices parciales que `migrate dev` lee como drift y
propondría resetear (aviso de la cabecera de `20260911120000_presentation_unit/migration.sql:16-21`).
Prefijo **siempre posterior a la última migración de `dev` en el momento de crearla** —tras el merge
de QC-141 serán las `20260923120x00_*` o posteriores—; ningún par de directorios comparte prefijo
(lección de QC-141 `design.md > 4.0`).

**Toda migración se aplica y se revierte contra la base propia de la ficha (`QuimiCloude_QC150`),
nunca contra la compartida de `.env`** (`progress/history.md`, lección de QC-147).

### 3.1 `<ts>_finished_product_enum_values`

```sql
ALTER TYPE "ProductType" ADD VALUE 'FINISHED_PRODUCT';
ALTER TYPE "InventoryMovementKind" ADD VALUE 'production';
```

`down.sql`: Postgres no quita valores de enum. Recrea cada tipo sin su valor (renombrar, crear,
`ALTER COLUMN ... USING col::text::"Tipo"`, borrar el viejo) **después** de un bloque que falla si
hay algún producto `FINISHED_PRODUCT` o algún asiento `production` (R36): borrarlos sería perder
inventario real. `products.type` tiene `DEFAULT 'PRODUCT'`, que hay que soltar y reponer alrededor
del cambio de tipo.

### 3.2 `<ts>_finished_products_and_presentation_content`

1. `presentations.content` y su `CHECK` (§2.2). Disparador de la pregunta 6 **solo si se aprueba**.
2. `products.recipe_id`, `products.presentation_id`, sus dos FK, el `CHECK`, el índice único parcial
   y `products_recipe_id_idx` (§2.3).
3. Los `CHECK` de `inventory_movements` y el índice único parcial (§2.4).

`down.sql`, en orden inverso, con el mismo bloque de guarda que §3.1 al principio (si hay datos de
producto terminado, falla sin tocar nada). Quitar `presentations.content` pierde los contenidos
tecleados: se acepta porque solo se revierte si no hay ningún producto terminado, y se dice en la
cabecera del archivo.

---

## 4. Dominio y contratos

### 4.1 El cálculo, puro (`inventario/domain/finished-goods.ts`, nuevo)

```ts
export type FinishedGoodsPlan =
  | { readonly kind: 'planned'; readonly packages: string; readonly quantity: string;
      readonly unitCost: string | null }
  | { readonly kind: 'no_content' }
  | { readonly kind: 'no_whole_package' };

export function planFinishedGoods(input: {
  readonly orderQuantity: string;           // Decimal(14,4) como cadena
  readonly content: string | null;          // idem
  readonly ingredientsCost: string | null;  // Decimal(14,4) como cadena
}): FinishedGoodsPlan;
```

- `packages = ⌊orderQuantity / content⌋` con **enteros escalados** (`BigInt` a escala 4): los dos
  operandos tienen escala 4, así que es una división entera de `BigInt` sin redondeo alguno. Nada de
  `Number`, `parseFloat` ni coma flotante (R12; mismo criterio que QC-141 `design.md > 2.3`).
- `quantity = packages × content`, exacto, a escala 4 (R12).
- `unitCost = deriveUnitCost(ingredientsCost, quantity)` de `inventario/domain/unit-cost.ts` —con la
  firma de existencia decimal que deja QC-141 (su `design.md > 2.1`)—: `HALF_UP` a 4 decimales
  (R14). **Una sola división de coste en el repo**, la del alta de lote.
- `ingredientsCost === null` → `unitCost: null`, y quien escribe decide según la pregunta 3; el plan
  nunca inventa un número (R15).
- Usa `decimal-quantity.ts` de QC-141 para el producto y la comparación con cero. **Sin librería de
  decimales**: QC-90 ya evaluó y descartó una (`unit-cost.ts`), QC-141 lo cerró (su D18) y esta
  ficha no tiene motivo nuevo. No hay ninguna dependencia nueva.

Casos del test (R12, R19): `50.5 / 1 → 50, 50`; `10 / 3 → 3, 9`; `50 / 0.75 → 66, 49.5`;
`0.5 / 1 → no_whole_package`; `content null → no_content`; `9999999999.9999 / 0.0001` sin
desbordar.

### 4.2 Lo que publica `inventario`

En `lib/modules/inventario/index.ts`:

```ts
export type FinishedGoodsOutcome =
  | { readonly kind: 'received'; readonly productId: ProductId; readonly productName: string;
      readonly packages: string }
  | { readonly kind: 'presentation_without_content' }
  | { readonly kind: 'no_whole_package' };           // provisional, pregunta 4

/** Escritura. Siempre dentro de la transaccion que abre quien llama. */
export interface FinishedGoodsIntake {
  receiveFromOrder(input: {
    readonly orderId: string;
    readonly companyId: string;
    readonly recipeId: string;
    readonly recipeName: string;
    readonly presentationId: string;
    readonly orderQuantity: string;
    readonly ingredientsCost: string | null;
    readonly actorId: string;
    readonly now: Date;
  }): Promise<FinishedGoodsOutcome>;
}

export { MANUAL_PRODUCT_TYPE_VALUES } from './domain/product-queryable';
export { planFinishedGoods, type FinishedGoodsPlan } from './domain/finished-goods';
```

- `PRODUCT_TYPE_VALUES` (`product-queryable.ts:31`) pasa a los **cuatro** valores: es la lista del
  filtro y de las pestañas del listado (R5).
- `MANUAL_PRODUCT_TYPE_VALUES` (nuevo) son los tres de siempre: es lo que aceptan el alta y el
  formulario (R2, R3). `productTypeSchema` (`product-input.ts:26-29`) pasa a `z.enum` sobre esta
  lista en el **alta**; la **edición** acepta los cuatro y deja a R4 el rechazo por cambio de tipo,
  porque el formulario de un producto terminado tiene que poder reenviar su propio tipo.
- `ProductRef` (`product-catalog.ts:15-22`) gana `readonly type: ProductType`, para que `recetas`
  rechace el producto terminado sin tocar la tabla (R29). Es la misma ampliación nombrada que ya se
  hizo con `unitId` en QC-147 (`progress/history.md`).
- `PresentationView` y los esquemas de presentación (`presentation-input.ts:53-60`) ganan `content`
  como cadena decimal opcional y anulable, con el patrón `^\d{1,10}(\.\d{1,4})?$` y `> 0` (R6, R7).
  Siguen siendo `strictObject`.

### 4.3 Dónde se engancha (sobre el código de QC-141)

`lib/modules/pedidos/ports/order-unit-of-work.ts` (QC-141):

```ts
export type OrderTransactionScope = {
  readonly orders: OrderWriteRepository;
  readonly reservations: MaterialReservations;
  readonly finishedGoods: FinishedGoodsIntake;   // NUEVO, tipo del barril de inventario
};
```

`lib/modules/pedidos/domain/transition-order.ts` (QC-141, hoy líneas 50-67 de su rama), dentro de la
rama `to === 'ENTREGADO'`:

1. **Antes** de `consumeForOrder`: si `locked.presentationId === null` → lanzar
   `PresentationWithoutContentError` (R18), para no pedir bloqueos de productos en balde; la
   transacción se deshace igual. Lo demás va **después** del consumo.
2. Nombre de la receta con `RecipeCatalog.findRefsIncludingDeleted` —ya en `deps.recipes`, y ya lo
   usan `create-order.ts:105` y `update-order.ts:85`—. Una receta borrada conserva su nombre.
3. `scope.finishedGoods.receiveFromOrder({ ... locked.quantity, locked.ingredientsCost ... })`.
4. `presentation_without_content` / `no_whole_package` → lanzar el error de `pedidos` que toque: la
   transacción entera se deshace —estado, consumo y reservas— (R18, R19, R20).
5. `received` → seguir con `setReservedAt(null)` como hoy y devolver el resultado.

`OrderCatalog['transitionAliveById']` gana los resultados `'presentation_without_content'` y
`'no_whole_package'` (este último provisional), y el `'ok'` pasa a llevar lo que la confirmación
necesita: `{ kind: 'ok'; finishedGoods?: { productName; packages } }`. Es un cambio de firma del
contrato que consume `asignaciones`; lo absorben `finish-assigned-order.ts` y
`start-assigned-order.ts` (este último solo compara con `'ok'`).

`lib/modules/asignaciones/domain/finish-assigned-order.ts`: traduce los dos resultados a errores
propios con los códigos del catálogo (§6) y devuelve `{ numberText, packages, productName }`. La
Server Action (`order-execution-actions.ts:63-78`) los añade a la redirección y
`assigned-order-delivered-notice.tsx` los pinta (R24).

**Edición en Pedidos (R27, provisional pregunta 5).** QC-141 deja la edición a `ENTREGADO` dentro de
`unitOfWork.run` en `update-order.ts` (su `design.md > 8`). La misma llamada del paso 3 se añade ahí,
con el mismo rechazo. Si QC-145 se mergea antes, T9 se cancela.

**Idempotencia (R21).** El Finalizar ya es idempotente por el `UPDATE ... WHERE status = from` bajo
`lockAliveById`: un segundo envío encuentra `ENTREGADO` y `assertOrderAcceptsWrites` lo rechaza
(`finish-assigned-order.ts:53-55`). El índice único parcial de §2.4 es la segunda red.

**Permiso (R26).** No cambia: `requirePermission(actor, 'asignaciones.consultar')` es la primera
línea de `finishAssignedOrder` (`finish-assigned-order.ts:39`), antes de zod y de cualquier puerto.
`receiveFromOrder` no tiene actor propio: solo existe dentro de la unidad de trabajo, y
`FinishedGoodsIntake` no se expone a ninguna Server Action ni a la composición pública de
`inventario`.

### 4.4 La escritura (`receiveFinishedGoods`, en `product-prisma.ts`)

Vive en `product-prisma.ts` porque `tests/guards/guard-libro-de-inventario.test.ts:244` exige que
**toda** escritura de `product_batches` esté ahí y asiente con `writeMovement(`. El censo pasa de
los cuatro caminos que deja QC-141 (`createWithFirstBatch`, `addBatchToAlive`, `adjustBatchStock`,
`consumeBatchStock`) a **cinco**. La fábrica `createFinishedGoodsIntake(db)` en un archivo nuevo del
mismo módulo (`finished-goods-prisma.ts`) solo la envuelve sobre el cliente transaccional, igual que
`createMaterialReservations(db)` (driven → driven del mismo módulo, permitido).

Pasos, todos sobre el `tx` que recibe:

1. **Presentación** de la empresa por id, `FOR SHARE` (bloquea un cambio de contenido o de unidad
   concurrente): `name`, `unit_id`, `content`. Sin fila → `presentation_without_content` (el pedido
   la tenía; si ya no existe es una carrera contra un borrado físico que el `RESTRICT` de los lotes
   no cubre). `content IS NULL` → `presentation_without_content`.
2. `planFinishedGoods` (§4.1). `no_content` / `no_whole_package` → devolver sin escribir.
3. **El producto terminado vivo**, sin carrera (R22):
   ```sql
   INSERT INTO products (id, name, name_normalized, type, unit_id, recipe_id, presentation_id,
                         company_id, stock, created_at, updated_at)
   VALUES (gen_random_uuid(), $name, $normalized, 'FINISHED_PRODUCT', $unit, $recipe, $presentation,
           $company, 0, $now, $now)
   ON CONFLICT (company_id, recipe_id, presentation_id)
     WHERE type = 'FINISHED_PRODUCT' AND deleted_at IS NULL
   DO NOTHING;
   SELECT id, name FROM products
    WHERE company_id = $company AND recipe_id = $recipe AND presentation_id = $presentation
      AND type = 'FINISHED_PRODUCT' AND deleted_at IS NULL
    FOR NO KEY UPDATE;
   ```
   El nombre es `` `${recipeName} · ${presentation.name}` `` y `name_normalized` sale de
   `normalizeProductName`, la única definición del repo. `qty_alert` nulo. Dos Finalizar simultáneos
   de la misma combinación: el segundo `INSERT` espera al índice único y, al comitear el primero, no
   inserta; el `SELECT ... FOR NO KEY UPDATE` devuelve el del primero (R22).
4. **Lote**: el número con el mismo `resolveBatchLot` de `writeBatchWithLotRetry`
   (`product-prisma.ts:339-369`, bloqueo consultivo por empresa, QC-81), **después** del bloqueo de
   la fila —el mismo orden que `addBatchToAlive` (`product-prisma.ts:638-640`)—. `purchase_date` =
   fecha civil UTC de `now`, `expiry_date` nulo, `created_by` = quien finaliza (R13).
5. `writeMovement` con `kind: 'production'`, cantidad positiva, `orderId` y autor (R16).
6. `recalculateProductStock` del producto terminado (R17), la versión SQL que deja QC-141.
7. Devuelve `received` con `productId`, `productName` y `packages`.

**Colisión de número de lote.** `writeBatchWithLotRetry` reintenta abriendo **su propia**
transacción, cosa que dentro de la unidad de trabajo no puede hacer. Aquí el número se calcula bajo
el bloqueo consultivo, así que la única colisión posible es con un número que alguien teclee a mano
a la vez. Se propone que `withOrderTransaction` (QC-141, `order-unit-of-work-prisma.ts`) reintente
también ante `P2002` sobre `product_batches_company_lot_unique`, como ya hace con el correlativo del
pedido. Si no, ese caso raro sale como `unexpected` y el operario vuelve a pulsar Finalizar.

**Orden de bloqueos** (extiende QC-141 `design.md > 7`): (1) fila del pedido; (2) filas de
productos ingrediente por `id` ascendente (consumo); (3) fila de la presentación `FOR SHARE`;
(4) fila del producto terminado; (5) bloqueo consultivo del número de lote. Un producto terminado
**nunca** es ingrediente (R29), así que (2) y (4) no se cruzan; el ajuste y el alta manual solo
toman (4)→(5) o solo (5). Sin ciclos de espera.

### 4.5 Las prohibiciones

| Req | Dónde | Cómo |
|---|---|---|
| R2 | `product-batch-input.ts` (`createProductWithFirstBatchSchema`) | `type` sobre `MANUAL_PRODUCT_TYPE_VALUES`: `FINISHED_PRODUCT` es `invalid_input` por zod |
| R3 | `app/(private)/inventario/components/product-form.tsx:542-550` | las opciones del select salen de `MANUAL_PRODUCT_TYPE_VALUES`; para un producto terminado el campo se muestra de solo lectura y reenvía su tipo |
| R4 | `update-product.ts` + `product-prisma.ts` (`updateAliveProduct`) | el `UPDATE` lleva `WHERE type = $actual OR (type <> 'FINISHED_PRODUCT' AND $nuevo <> 'FINISHED_PRODUCT')`; el puerto distingue `'type_locked'` de `false` para lanzar `ActionNotAllowedError` |
| R28 | `create-product.ts:109-125` | `findAliveIdByNameInPresentationUnit` devuelve también el tipo; si es `FINISHED_PRODUCT`, `ActionNotAllowedError` antes de `addBatchToAlive`. Y `addBatchToAlive` lo vuelve a comprobar con la fila bloqueada, para que no haya ventana |
| R29 | `recetas/domain/create-recipe.ts:51-57` y `update-recipe.ts:90` | con `ProductRef.type`: una línea nueva con producto terminado → `ActionNotAllowedError` de `recetas` |
| R30 | `app/(private)/produccion/formulas/components/product-picker.tsx:180` y las páginas `nueva` y `[id]` | la petición a `listProductsAction` lleva el filtro `type: { kind: 'select', values: MANUAL_PRODUCT_TYPE_VALUES }`, que el listado ya soporta (`product-prisma.ts:173-179`) |
| R31, R32 | `product-prisma.ts` (`adjustBatchStock`, `:736-745`) | la consulta que ya bloquea el producto lee también su `type`; `delta > 0` sobre `FINISHED_PRODUCT` → resultado `'increase_not_allowed'` sin `UPDATE` ni asiento; el caso de uso lo traduce a `ActionNotAllowedError`. El negativo sigue el camino de siempre, con `BatchStockNegativeError` |
| R33 | `adjust-batch-dialog.tsx` | `ProductBatchView` gana `productType` (o el panel lo recibe del producto): texto «Solo se admiten ajustes que restan» visible, no solo color, y el campo sin opción de sumar |

`ActionNotAllowedError` usa el código **existente** `action_not_allowed` (`error-codes.ts:78-81`):
«la entrada tiene la forma correcta y el actor tiene permiso; lo que la regla de negocio rechaza es
la acción pedida». Encaja literalmente con las cuatro prohibiciones y evita cuatro códigos nuevos.
`inventario` y `recetas` ganan cada uno su clase con ese código.

---

## 5. Pantallas

| Qué | Dónde | Cambio |
|---|---|---|
| Pestañas de tipo | `inventario/components/product-type-tabs.tsx:15-19` | `FINISHED_PRODUCT: 'Producto terminado'` (R5) |
| Formulario de producto | `product-form.tsx:542-550` | ver R3 en §4.5 |
| Lotes de un producto | `product-batches-panel.tsx` | si el producto es terminado y la presentación tiene contenido: «50 envases» junto a «50 L» (R25, provisional pregunta 6). El número sale de `quantity / content` con el decimal exacto; solo se pinta si es entero |
| Diálogo de ajuste | `adjust-batch-dialog.tsx` | R33 |
| Presentaciones | `configuracion/presentaciones/components/{presentation-form,presentation-columns}.tsx` | campo «Contenido» de texto con `inputMode="decimal"`, coma a punto, `font-size >= 16px`, la unidad elegida como sufijo; columna «Contenido» con `formatDecimalDisplay` y «Sin contenido» cuando es nulo (R8). `presentation-select.tsx` (alta rápida desde otros formularios) **no** gana el campo: sigue creando presentaciones sin contenido, que es un estado válido |
| Confirmación del Finalizar | `asignacion/components/assigned-order-delivered-notice.tsx` | «Pedido X entregado. Entraron 50 envases de Desengrasante industrial · Botella 1L.» (R24) |
| Error del Finalizar | `asignacion/[id]/components/order-execution-screen.tsx` | pinta el mensaje del catálogo, como ya hará con `insufficient_material` de QC-141 |

Sin librerías de UI nuevas; targets de 44 px; nada depende de `:hover`.

---

## 6. Errores: enmienda al catálogo cerrado

En `lib/modules/errores/domain/error-codes.ts` y `error-catalog.ts` (la guardia
`guard-catalogo-de-errores.test.ts` exige las dos mitades). **Enmienda explícita, a aprobar en F1.4**:

| Código | Mensaje propuesto | Lo lanzan | Estado |
|---|---|---|---|
| `presentation_without_content` | «La presentación del pedido no indica su contenido: complétala en Presentaciones antes de finalizar.» | `pedidos` y su traducción en `asignaciones` | nuevo (R18) |
| `no_whole_package` | «La cantidad del pedido no llena ni un envase de su presentación.» | ídem | nuevo, **solo si se aprueba la pregunta 4** (R19) |
| `action_not_allowed` | el existente | `inventario`, `recetas` | reutilizado (R4, R28, R29, R31) |

Si la pregunta 6 se aprueba con código propio, se añade un tercero (`presentation_content_locked`);
con la propuesta de reutilizar `presentation_unit_locked`, no.

---

## 7. Alternativas descartadas

### 7.1 Encontrar el producto terminado por su nombre

Buscar un producto vivo que se llame «receta · presentación» con `findAliveIdByNameInPresentationUnit`
y no añadir ninguna columna. **Descartada**: renombrar la receta o la presentación haría nacer un
segundo producto terminado de la misma combinación (rompe D2), y un producto normal que alguien
llamara igual recibiría lotes de producción. Además, dos Finalizar simultáneos crearían dos productos,
porque `name` no es único a propósito (`schema.prisma:265`). Las columnas `recipe_id` y
`presentation_id` con un índice único parcial resuelven las tres cosas; lo que cuestan es una FK
hacia `recetas` escrita a mano y un `CHECK`.

### 7.2 Asentar la entrada como `opening`

Reutilizar el `kind` del alta de lote y no tocar el enum. **Descartada**: `opening` va sin pedido
(`CHECK` de QC-141), así que el libro no diría **de qué pedido** salió la existencia, y
`docs/architecture.md > Dominio` pide que todo movimiento de existencias sea auditable («quién,
cuándo, sobre qué»). Con `production` + `order_id` el historial del lote enlaza la entrada con su
pedido igual que el consumo enlaza la salida, y el índice único de §2.4 da la idempotencia gratis.

### 7.3 Un producto terminado por receta, con la presentación solo en el lote

Un único «Desengrasante industrial» con lotes en «Botella 1L» y en «Garrafa 5L». **Descartada**: D2
lo cierra («uno por receta + presentación»), y además `product_batches_check_unit` impediría tener
lotes en presentaciones de unidades distintas bajo el mismo producto.

### 7.4 Que `pedidos` escriba el producto terminado

Hacer el alta desde el driven de `pedidos`. **Descartada**: `prisma.product` y
`prisma.productBatch` son de `inventario` (`/// @module inventario`), y
`guard-arquitectura-modulos` rechaza su uso fuera de su módulo. `inventario` es dueño de los lotes.

### 7.5 Guardar el número de envases en el lote

Una columna `packages` en `product_batches`. **Descartada**: D5 dice «las botellas solo se muestran»;
una segunda cantidad guardada podría contradecir a la primera tras un ajuste que reste 0,5 L. Se
deriva al pintar (y la pregunta 6 decide si el contenido puede cambiar debajo).

---

## 8. Cómo se prueba

| Nivel | Qué |
|---|---|
| Unit, puro | `tests/unit/inventario/finished-goods.test.ts`: los casos de §4.1 (R12, R14, R19), coste nulo sin número inventado (R15), ningún `Number(`/`parseFloat` en el archivo. `product-input.test.ts`: alta rechaza `FINISHED_PRODUCT` (R2). `presentation-input.test.ts`: los rechazos de R7 y el vacío admitido (R6) |
| Unit, casos de uso | `transition-order.test.ts` con dobles de `OrderUnitOfWork` que registran el orden: consumo antes que producción, rechazo sin presentación antes de consumir, error de producción deshace (R10, R18, R20); `finish-assigned-order.test.ts`: permiso antes de todo (R26), traducción de los resultados nuevos; `update-product.test.ts` (R4); `create-product.test.ts` (R28); `create-recipe`/`update-recipe` (R29); `adjust-batch-stock.test.ts` (R31, R32) |
| Integración, base propia | `tests/integration/inventario/finished-goods.int.test.ts`: nace el producto con nombre, unidad, tipo y combinación (R11); segundo pedido reutiliza (R11); lote con lote correlativo, fecha y autor (R13); asiento `production` con pedido (R16); `products.stock` recalculado (R17); dos Finalizar simultáneos de la misma combinación con dos conexiones → un producto, dos lotes (R22); aislamiento por empresa (R23); baja lógica y nuevo nacimiento (R35); `CHECK` e índices de §2 (R21 por la base). `tests/integration/pedidos/finish-with-finished-goods.int.test.ts`: fallo forzado tras el lote deja pedido, consumo y producto sin escribir (R20); doble Finalizar (R21) |
| Migraciones | esquema: orden de los dos enums, columnas, `CHECK`, índices (R1, R9, R34); `down.sql` falla con datos de producto terminado (R36); aplicar y revertir contra `QuimiCloude_QC150` |
| Componentes | `product-type-tabs` (R5), `product-form` sin la opción (R3), `presentation-form`/`presentation-columns` (R8), `product-batches-panel` con envases (R25), `adjust-batch-dialog` (R33), `product-picker` con el filtro (R30), `assigned-order-delivered-notice` (R24) |
| Guardias | `guard-libro-de-inventario` con cinco caminos; `guard-catalogo-de-errores`; `guard-arquitectura-modulos` (sin ciclo, sin `prisma.product` fuera de `inventario`); `guard-ambito-empresa-inventario` con los métodos nuevos; `guard-empresa-en-esquema`, `guard-rls-force`, `guard-dependencias-aprobadas` sin filas nuevas |
| E2E | `e2e/producto-terminado.spec.ts` (R37): contenido `1` en «Botella 1L»; pedido de `50.5` con esa presentación y una receta de una línea al 100 % con material de sobra; asignar, iniciar y Finalizar; la confirmación dice 50 envases; inventario → pestaña «Producto terminado» → el producto «receta · Botella 1L» con un lote de 50 y «50 envases»; el diálogo de ajuste solo resta |

Cada `R<n>` va en el nombre de su caso; el mapa `R → test` lo escribe el implementer en
`progress/impl_QC-150-producto-terminado.md`.

---

## 9. Riesgos, solapes y coste

- **Bloqueada por QC-141** (depends_on). Todo §4.3-4.4 se apoya en código de QC-141 que **aún no
  está en `dev`** (`transition-order.ts`, `order-unit-of-work.ts`, `consumeBatchStock`,
  `decimal-quantity.ts`, `inventory_movements.order_id`, `deriveUnitCost` decimal). Si su forma cambia
  al mergear, T0 ajusta este diseño antes de T1; no se escribe contra la rama de QC-141.
- **Solape con QC-145** (pendiente, sin requisitos EARS todavía), que puede correr en paralelo:
  escribe la fecha de terminado en la misma operación del Finalizar y retira la edición a
  `ENTREGADO`. Archivos compartidos probables: `db/schema.prisma`, `lib/composition/index.ts`,
  `lib/modules/pedidos/domain/transition-order.ts`, `pedidos/ports/order-write-repository.ts`
  (`setStatus`), `pedidos/domain/update-order.ts` y `order-transitions.ts` (si la pregunta 5 dice
  sí), `asignaciones/domain/finish-assigned-order.ts`, `errores/domain/{error-codes,error-catalog}.ts`
  y posiblemente `order-execution-screen.tsx`. **No deben estar las dos `in_progress` a la vez**
  (`AGENTS.md > Paralelismo`) salvo que el leader reparta esos archivos.
- **Pedidos anteriores a QC-146** sin presentación: no se pueden finalizar (§0). Y **toda
  presentación existente nace sin contenido** (R9): el día del despliegue ningún pedido se puede
  finalizar hasta que alguien rellene el contenido de su presentación. Es lo que dice D6, pero el
  humano debería saber que el efecto es inmediato y general.
- **El Finalizar gana dos motivos nuevos de fallo** (tres con QC-141). La pantalla del operario tiene
  que mostrar el mensaje del catálogo.
- **Nombre del producto terminado**: se fija al nacer. Renombrar la receta o la presentación después
  no lo cambia (la identidad son las columnas, no el nombre). La receta admite nombres largos y la
  presentación hasta 60: el nombre compuesto puede superar los 120 de `productNameSchema`, y entonces
  **editar** ese producto fallaría por longitud. Se detecta en T7 midiendo el máximo real de
  `recipeNameSchema`; si lo supera, se lleva a F1.4 en vez de truncar en silencio.
- **Coste que se acepta**: dos migraciones escritas a mano sobre tablas con drift, una FK más hacia
  otro módulo, un quinto camino en la guardia del libro y un tercer participante en la transacción de
  QC-141.
