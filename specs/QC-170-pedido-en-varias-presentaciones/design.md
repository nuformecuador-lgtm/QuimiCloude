# QC-170 — pedido-en-varias-presentaciones · design.md

> Leído en `origin/dev` `0736e1ff` (worktree `QC-170-pedido-en-varias-presentaciones`, misma punta).
> Incluye QC-121, QC-146, QC-150 y QC-168 ya mergeadas. Todo lo que se cita de código existe ahí;
> donde no se pudo confirmar queda dicho.

## 0. Las 4 preguntas abiertas: opción recomendada (sin cerrarlas)

Ninguna de las cuatro está cerrada. Lo que sigue es la propuesta de `spec_author` para que el humano
decida en F1.4; el diseño de abajo (§§1-9) **da por hecho la opción recomendada** para poder escribir
algo concreto, y cada sitio que depende de ella lo dice.

1. **Cómo se muestra el reparto en los listados.** Recomendado: **la primera línea + «+N»** (p. ej.
   «5 × Botella 200 ml +1»), igual que hacen ya los avatares de responsables en
   `company-orders-columns.tsx` (QC-102) — patrón existente, sin componente nuevo de truncado. Sin
   reparto: «Sin presentación» (R27). Alternativa descartada: «3 presentaciones» a secas, sin nombrar
   ninguna — se pierde la única información que alguien mirando la lista necesita para reconocer el
   pedido de un vistazo.
2. **Línea sin contenido.** Recomendado: **se prohíbe añadirla** al reparto (mismo criterio que
   `no_content` de QC-150 §4.1): un envase sin contenido no es una cantidad, es un dato incompleto de
   Presentaciones, y `PresentationCatalog.findRefs` ya devuelve el contenido (§2). Se avisa en el
   selector, no al guardar. Alternativa: dejarla entrar y calcular «disponible» solo con las líneas
   que sí tienen contenido — descartada porque esconde una línea del cálculo sin decir cuál.
3. **¿Se puede pasar del total?** Recomendado: **se permite**, sin bloquear ni avisar más que con la
   cifra en negativo («-10 L» de disponible): el reparto de QC-170 no es una restricción de
   inventario (esa la pone D4, que ya acepta que el reparto no cubra todo) y forzar que nunca exceda
   obligaría a decidir qué línea se recorta cuando dos personas editan el reparto a la vez. Es
   simétrico con D4 (tampoco tiene que llegar). Alternativa descartada: rechazar la línea que hace
   exceder el total — introduce una carrera entre "cuánto llevas repartido" y "cuánto añades" que
   solo el servidor puede arbitrar con una relectura, y la ficha ya tiene bastante superficie nueva.
4. **Unidad de `quantity`.** Recomendado: **`orders` gana `unit_id`** (nullable, mismo patrón drift
   que `recipe_id`/`presentation_id`), copiado del catálogo de `unidades` (`UnitCatalog`, QC-76) al
   crear el pedido, obligatorio en el alta y conservado en la edición salvo que se cambie a mano.
   `quantity` se interpreta siempre en esa unidad, con o sin reparto. Cada línea de reparto convierte
   `envases × contenido` (en la unidad de la presentación) a `unit_id` con `convertQuantity` (QC-76,
   §3) para el cálculo de R6; si no comparten base, R7 rechaza esa línea. Alternativa descartada:
   derivar la unidad del pedido de la primera línea de reparto que se añada — frágil (si esa línea se
   borra, el pedido se queda sin unidad de referencia a mitad de edición) y no resuelve el caso de un
   pedido sin ninguna línea todavía, que R9 permite.

## 1. Lo que hoy hace el código (medido, no supuesto)

| Pieza | Hoy | Cambia a |
|---|---|---|
| `orders.presentation_id`, `orders.presentation_content` (`db/schema.prisma:631-638`) | una presentación, con copia de su contenido | **desaparecen** (R4); las sustituye `order_presentation_lines` (§2) |
| `NewOrder.presentationId` / `.presentationContent` (`order-view.ts:37-47`) | obligatorias | desaparecen; `NewOrder` gana `presentationLines: readonly { presentationId, packages }[]` (puede ser `[]`, R9) |
| `createOrderSchema.presentationId` (`order-input.ts:60-87`) | UUID obligatorio | desaparece; nace `presentationLinesSchema` (§4.1), opcional (`[]` por defecto) |
| `transition-order.ts`, rama `to === 'POR_EMPACAR'` (líneas 81-155) | consume material Y da de alta el lote de producto terminado, las dos cosas en la misma transacción | **solo consume** (R15, R16): se retira todo lo de `finishedGoods` (líneas 84-85, 90-107 quedan, 111-155 se reducen a consumo + `setStatus`) |
| `order-packing.ts` `createStartPacking`/`createFinishPacking` (33 líneas, un `UPDATE` cada uno, **sin** unidad de trabajo de inventario) | no tocan inventario | `createStartPacking` gana el rechazo de R10 (§5.1); `createFinishPacking` pasa a abrir la unidad de trabajo y da de alta un lote por línea (R17, §5.2) |
| `finished-goods.ts` `planFinishedGoods` (una presentación) | recibe una cantidad y un contenido, calcula envases con `floor` | **ya no calcula envases**: el reparto los da directos (R1); pasa a calcular solo `unitCost` compartido (§5.3) y a repetirse una vez por línea |
| `inventory_movements_one_production_per_order` (único parcial por `order_id`, `20260924190100_*`) | un asiento `production` por pedido | **no sirve**: ahora puede haber varios asientos `production` por pedido, uno por línea. Se sustituye por unicidad por línea (§2.4) |
| `OrderCatalog.transitionAliveById` (`order-catalog.ts:109-126`) | el `'ok'` a `POR_EMPACAR` lleva `finishedGoods` | pierde ese campo: `to === 'POR_EMPACAR'` vuelve a devolver `'ok'` sin nada más |
| `OrderCatalog.finishPackingAliveById` (`order-catalog.ts:149-154`) | `'ok' \| 'not_packer' \| 'not_packable' \| 'not_found'` | gana `finishedGoods: FinishedGoodsReceipt` en el `'ok'` (R17) y el caso `presentation_without_content` (R19, por línea) |
| `OrderCatalog.startPackingAliveById` (`:136-141`) | `'ok' \| 'already_mine' \| 'taken' \| 'not_packable' \| 'not_found'` | gana `'without_distribution'` (R10) |
| Matriz `ALLOWED` (`order-transitions.ts:30-37`) | `POR_EMPACAR: ['EN_EMPAQUE']` sin «quedarse igual» ⇒ nada editable en `POR_EMPACAR`/`EN_EMPAQUE` (QC-168 R32) | **sin cambios en la matriz**: el reparto no usa `updateOrder`/`assertTransition`, tiene su propio caso de uso y su propia guardia de estado (§3.3), así que R11-R14 no reabren R32 de QC-168 |
| `AssignedOrderSummary.presentationId` (`order-catalog.ts:170`) | un id o `null` | pasa a `presentationLines: readonly { presentationId; packages }[]` (R26) |
| `findFinishedGoodsReceipts(orderIds)` (QC-168 §4, `product-catalog.ts`) | un texto de envases por pedido, de UN asiento `production` | agrega los asientos `production` de TODAS las líneas de ese pedido (§6) |

## 2. Modelo de datos

### 2.1 `order_presentation_lines` (nueva, módulo `pedidos`)

```prisma
/// El reparto de un pedido: en que presentaciones se entrega lo fabricado y cuantos envases de
/// cada una. Sustituye a la presentacion unica de QC-146. `companyId` es COPIA de la del pedido
/// -no se deriva por JOIN- por el mismo motivo que en `product_batches`: la unicidad y el ambito
/// de esta tabla no pueden depender de otra. `presentationId` no lleva `@relation`: `Presentation`
/// es de `inventario`, es drift, con FK COMPUESTA `(company_id, presentation_id)` igual que
/// `orders.presentation_id` la tenia.
/// @module pedidos
model OrderPresentationLine {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orderId        String   @map("order_id") @db.Uuid
  companyId      String   @map("company_id") @db.Uuid
  presentationId String   @map("presentation_id") @db.Uuid
  /// Numero de envases enteros de esta linea. Entero, no Decimal: no hay "0.5 envases" (R1).
  packages       Int
  /// Copia del contenido de la presentacion al anadir la linea o al cambiar su presentacion.
  /// NULL = la presentacion no tenia contenido en ese instante (R3, mismo criterio que QC-150 D16).
  presentationContent Decimal? @map("presentation_content") @db.Decimal(14, 4)
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  order Order @relation(fields: [orderId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@unique([orderId, presentationId], map: "order_presentation_lines_order_id_presentation_id_key")
  @@index([companyId], map: "order_presentation_lines_company_id_idx")
  @@index([presentationId], map: "order_presentation_lines_presentation_id_idx")
  @@map("order_presentation_lines")
}
```

- **`packages Int`, no `Decimal`** (R1): un envase entero es una unidad, no una cantidad continua.
  `CHECK order_presentation_lines_packages_positive (packages > 0)`.
- **`orderId` con `@relation`** (a diferencia de las FK de `orders` hacia otros módulos): `Order` es
  del MISMO módulo, así que aquí sí hay `@relation` y no es drift — mismo criterio que `RecipeLine`
  hacia `Recipe`. FK simple `order_presentation_lines_order_id_fkey`, sin componer con `companyId`
  porque las dos filas ya son del mismo módulo y `orders_id_company_id_key` no hace falta aquí.
- **`presentationId` compuesta con `companyId`**, drift, hacia `presentations(company_id, id)`:
  mismo patrón que tenía `orders.presentation_id` (`orders_company_id_presentation_id_fkey`,
  `20260922130000_orders_presentation/migration.sql:20-22`).
  `CHECK order_presentation_lines_content_positive (presentation_content IS NULL OR
  presentation_content > 0)`.
- **`@@unique([orderId, presentationId])`** (R2): decisión de diseño, no del humano — si dos veces
  se elige la misma presentación, es la MISMA línea (se suman los envases al editar, nunca se crea
  una segunda fila). Simplifica R6, R17, R18 y el listado: una línea por presentación, sin agregar
  antes de mostrar. Alternativa descartada: permitir líneas repetidas de la misma presentación —
  ninguna decisión cerrada lo pide, y complicaría R17 (¿un lote por línea o por presentación?) sin
  ganar nada, porque sumar los envases da el mismo resultado de inventario.
- **Sin borrado lógico**: la línea vive y muere con la edición del reparto (se reemplaza el conjunto
  entero, mismo patrón que `updateOrderSchema` con el pedido, §4.1). El histórico de qué se repartió
  antes de un cambio no se conserva —ninguna decisión lo pide, y el lote de producto terminado
  (§5.2) es el registro permanente de lo que de verdad entró—.
- **RLS**: sin política propia (patrón del repo: `orders`, `product_batches` tampoco la tienen); se
  activa `ENABLE ROW LEVEL SECURITY` + `FORCE` igual que toda tabla nueva
  (`guard-empresa-en-esquema`, `guard-rls-force`).
- **Migración propia**, después de la última migración de `dev` en el momento de escribirla.

### 2.2 `orders.unit_id` (pregunta abierta 4, §0.4 — el diseño de abajo la asume)

```prisma
model Order {
  // ...
  /// La unidad en que se expresa `quantity`. Sin `@relation`: `Unit` es de `unidades`, es drift,
  /// con FK simple (una unidad no tiene ambito de empresa propio en `units`, ver `unidades`).
  unitId String? @map("unit_id") @db.Uuid
}
```

- **Anulable en la base, obligatorio en la aplicación** desde esta ficha (mismo patrón que QC-146
  hizo con `presentation_id`): los pedidos anteriores quedan en `NULL`, el alta y la edición lo
  exigen. `CHECK` no hace falta porque no hay ninguna fila vieja que romper y la obligatoriedad es
  de `order-input.ts`, no de la base (mismo motivo que QC-146 `design.md > 1.1`).
- **FK simple** `orders_unit_id_fkey → units(id) ON DELETE RESTRICT ON UPDATE CASCADE`: a diferencia
  de `presentation_id`, `units` no tiene ámbito de empresa (`unidades` es catálogo compartido, según
  `convert-quantity.ts` que recibe `UnitConversion` sin `companyId`); T0 de la implementación lo
  reconfirma contra el esquema de `unidades` antes de escribir la migración.
- **Índice** `orders_unit_id_idx` para el `RESTRICT`.

### 2.3 `inventory_movements`: de un asiento de producción por pedido a uno por línea

Hoy: `inventory_movements_one_production_per_order ON inventory_movements (order_id) WHERE kind =
'production'` (`20260924190100_*`). Con R17 puede haber varios asientos `production` por pedido —
uno por línea del reparto—, así que esa unicidad es ahora **falsa** y hay que sustituirla.

- `inventory_movements` gana `order_presentation_line_id UUID NULL`, FK simple hacia
  `order_presentation_lines(id) ON DELETE RESTRICT ON UPDATE CASCADE` (mismo módulo que `order_id`
  en el sentido de que ambos son ids de `pedidos`, pero la columna sigue sin `@relation` porque
  `InventoryMovement` es de `inventario` y no puede cruzar a un modelo de otro módulo — drift, igual
  que ya lo es `order_id`).
- Se reescribe `inventory_movements_order_id_matches_kind` (nombre real en `dev`, no el propuesto en
  QC-150 §2.6 C1) para que siga exigiendo `order_id` en `production`, y se añade
  `inventory_movements_order_presentation_line_id_matches_kind CHECK ((kind = 'production') =
  (order_presentation_line_id IS NOT NULL))`.
- **Se sustituye** `inventory_movements_one_production_per_order` por
  `inventory_movements_one_production_per_line ON inventory_movements
  (order_presentation_line_id) WHERE kind = 'production'` (único parcial): la idempotencia de R21
  pasa a ser por línea, que es la granularidad real del nuevo Terminar.
- `findFinishedGoodsReceipts` (QC-168 §4) sigue agrupando por `order_id` para «Por empacar» (sigue
  siendo correcto: sumar los envases de todos los asientos de un pedido da el total repartido); si
  R26 pide desglosar por presentación en algún listado, se lee además `order_presentation_line_id`.

### 2.4 Migraciones (orden)

1. `<ts1>_order_presentation_lines` — crea la tabla (§2.1), RLS `ENABLE`+`FORCE`, `unit_id` en
   `orders` (§2.2). Ninguna de las dos toca filas existentes: DDL puro.
2. `<ts2>_inventory_movements_production_per_line` — columna, FK y los tres `CHECK`/índice de §2.3.
   **Depende de (1)**: la FK a `order_presentation_lines` no existe hasta esa migración. Van en
   migraciones separadas porque tocan módulos distintos y porque el `ADD VALUE` de ningún enum entra
   aquí (no hace falta ninguno nuevo).
3. `<ts3>_order_presentation_lines_backfill_and_drop` — **con datos** (R22-R25):
   1. `INSERT INTO order_presentation_lines (id, order_id, company_id, presentation_id, packages,
      presentation_content, created_at, updated_at) SELECT gen_random_uuid(), o.id, o.company_id,
      o.presentation_id, FLOOR(o.quantity / o.presentation_content)::int, o.presentation_content,
      now(), now() FROM orders o WHERE o.presentation_id IS NOT NULL AND o.presentation_content IS
      NOT NULL AND FLOOR(o.quantity / o.presentation_content) >= 1` (R22-R24: sin presentación, sin
      contenido copiado, o división en cero, no generan fila — el `WHERE` los excluye a los tres).
   2. `ALTER TABLE "orders" DROP CONSTRAINT "orders_company_id_presentation_id_fkey", DROP COLUMN
      "presentation_id", DROP COLUMN "presentation_content"` y los dos `CHECK` de
      `presentation_content` (`orders_presentation_content_positive`,
      `orders_presentation_content_requires_presentation`) y el índice
      `orders_presentation_id_idx`.
   3. **Reproducible (R25)**: el `INSERT` no tiene forma de repetirse porque el paso 2 ya borró la
      columna que filtra — aplicar la migración completa dos veces falla en el segundo `DROP COLUMN`
      con «column does not exist», que es el fallo correcto (no hay «duplicar filas» posible una vez
      que la fuente desapareció). Se prueba con `db:migrate` dos veces sobre la base propia de la
      ficha y se documenta que el segundo intento debe fallar así, no en silencio.
   4. `down.sql`: repone `presentation_id`/`presentation_content` con sus `CHECK` e índice
      (recuperando SOLO el caso de una única línea por pedido — un pedido con más de una línea no
      puede volver a tener una sola presentación, así que el `down.sql` **falla con `RAISE`** si
      algún pedido tiene más de una línea vigente) y hace `DROP TABLE order_presentation_lines`.
      Es destructivo a conciencia, igual que QC-146 lo fue con la columna que ahora se retira.

Los tres timestamps son estrictamente posteriores al último de `db/migrations/` en el momento de
crear cada uno (hoy `20260925120100_packing_permission`, QC-168 T2). Ninguna comparte prefijo con
QC-138 ni QC-82 (ninguna de las dos toca migraciones nuevas de `orders`, según sus specs).

## 3. Conversión de unidades (QC-76) para «cuánto queda disponible» (R6, R7)

`convertQuantity(quantity, from, to)` (`lib/modules/unidades/domain/convert-quantity.ts`) es dominio
puro y **hoy nadie la llama** («decisión cerrada 18, R26» de su propio spec): esta ficha es su primer
consumidor real. `pedidos` necesita, para cada línea, la `UnitConversion` de la unidad de la
presentación y la del pedido — dos ids que `PresentationCatalog`/`UnitCatalog` no exponen todavía
(`PresentationRef` de QC-150 solo tiene `id`, `name`, `content`; no `unitId`).

- `PresentationRef` (`inventario/domain/presentation-catalog.ts`) gana `unitId: string` (R6): ya lo
  tiene la tabla (`presentations.unit_id`), solo falta publicarlo.
- `pedidos` pide a `UnitCatalog` (ya usado por `resolve-ingredients-cost.ts`) las `UnitConversion` de
  la unidad del pedido y de cada presentación distinta del reparto, y llama `convertQuantity` por
  línea. Un `IncompatibleUnitsError` de esa llamada se traduce a rechazar la línea (R7), no a
  fallar toda la pantalla.
- El cálculo de R6 es de **lectura**, no se persiste: se recalcula cada vez que cambia una cantidad
  o el reparto, en el servidor (Server Action que devuelve el «disponible» al formulario) — mismo
  patrón que `quoteOrderCostSchema`/`quoteOrderCost` ya usan para el coste en vivo.

## 4. Dominio de `pedidos`: contratos y casos de uso

### 4.1 Entrada

```ts
const presentationLineSchema = z.object({
  presentationId: z.string().uuid(),
  packages: z.coerce.number().int().positive(),
});
export const presentationLinesSchema = z
  .array(presentationLineSchema)
  .refine(hasNoDuplicatePresentation, { message: 'Cada presentación aparece una sola vez.' })
  .default([]);
```

- `createOrderSchema` y `updateOrderSchema` ganan `presentationLines: presentationLinesSchema` (R9:
  `[]` es válido) y `unitId: z.string().uuid()` (obligatorio, §2.2).
- `presentationId` deja de existir en el esquema de un pedido: **rompe** cualquier código que aún lo
  lea de `createOrderSchema`/`updateOrderSchema` — es la limpieza de R4.

### 4.2 Caso de uso dedicado: `updateOrderPresentationLines` (nuevo)

R11-R14 exigen que el reparto se pueda editar en estados (`POR_EMPACAR`, `EN_EMPAQUE`) donde
`updateOrder` **no** deja tocar nada (QC-168 R32, `ALLOWED.POR_EMPACAR = ['EN_EMPAQUE']` sin
«quedarse igual»). Reabrir esa matriz para permitir una edición parcial sería mezclar dos preguntas
—¿puede cambiar el PEDIDO? ¿puede cambiar su REPARTO?— en una sola respuesta. Se separa en un caso de
uso propio, que NO pasa por `assertTransition`:

```ts
// pedidos/domain/update-order-presentation-lines.ts
const REPARTO_EDITABLE_STATUSES: readonly OrderStatus[] =
  ['PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'EN_EMPAQUE'];

export function createUpdateOrderPresentationLines(deps: {...}) {
  return async function updateOrderPresentationLines(
    orderId: string, companyId: string, actorId: string,
    lines: readonly PresentationLineInput[],
  ): Promise<'ok' | 'not_found' | 'not_editable' | 'presentation_not_found'> { ... };
}
```

- Autorización: la comprueba QUIEN LLAMA (§4.3), no este caso de uso — como `finishAssignedOrder` no
  repite el permiso de `startAssignedOrder`.
- Reemplazo completo del conjunto de líneas (mismo criterio que `updateOrderSchema`, §4.1 de
  QC-33/34): un `DELETE` de las líneas vigentes + `INSERT` de las nuevas, en una transacción corta
  (sin la unidad de trabajo de inventario: no toca material ni existencia).
- `REPARTO_EDITABLE_STATUSES` es una constante NUEVA, deliberadamente distinta de `ALLOWED` de
  `order-transitions.ts`: no es una transición, es una ventana de estados en la que el reparto se
  deja tocar. `ENTREGADO` y `CANCELADO` quedan fuera (R13).

### 4.3 Dos puertas hacia el mismo caso de uso

| Quien llama | Módulo | Permiso | Estados que puede tocar |
|---|---|---|---|
| Edición del pedido en `/pedidos` | `pedidos` (Server Action de `order-actions.ts`) | `pedidos.modificar` | `PENDIENTE`, `EN_CURSO` (el formulario de edición ya no se muestra en `POR_EMPACAR`/`EN_EMPAQUE`, QC-168 R32) |
| Pantalla del Empacador | `asignaciones` (caso de uso nuevo `updatePackingPresentationLines`, que llama a `pedidos.updateOrderPresentationLines` por su contrato público) | `empaque.modificar` | `POR_EMPACAR`, `EN_EMPAQUE` |

`asignaciones` no importa `pedidos/domain/*`: llama al mismo método a través de un contrato nuevo,
`OrderCatalog.updatePresentationLinesAliveById` (mismo patrón que `startPackingAliveById`), para no
violar `guard-arquitectura-modulos`. El caso de `pedidos` (fila 1) sí puede llamar a su propio
dominio directamente.

### 4.4 `transition-order.ts`: se simplifica (R15, R16)

La rama `to === 'POR_EMPACAR'` pierde todo lo de `finishedGoods` (líneas 84-85 y 128-155 del archivo
actual): sin comprobación de presentación, sin `recipeRef`/`lotCost` — **espera**: `lotCost` sigue
haciendo falta, porque R18 lo necesita en Terminar, no aquí. Se **traslada** el cálculo de
`resolveLotIngredientsCost` de aquí a `finishPackingAliveById` (§4.5): calcularlo en Terminar, no en
Finalizar, es más correcto además (los lotes de material ya se consumieron, así que el coste
guardado —`locked.ingredientsCost`— es el mismo dato de siempre, y si hace falta recalcular se hace
sobre los lotes que YA se consumieron, en vez de sobre una foto de un instante antes de consumir que
podía no coincidir). Queda:

```ts
if (to === 'POR_EMPACAR') {
  const content = await scope.recipes.findExecutionContentById(locked.recipeId, companyId);
  const requirement = buildRequirement(content?.lines ?? [], locked.quantity);
  const outcome = await scope.reservations.consumeForOrder({ orderId: id, companyId, fallbackRequirement: requirement, actorId, now });
  if (outcome.kind === 'insufficient') throw new InsufficientMaterialError();
  if (outcome.kind === 'nothing_to_consume') throw new RecipeWithoutLinesError();
  const result = await scope.orders.setStatus(id, from, to, actorId, now, { companyId });
  if (result !== 'ok') throw new StatusChangeAfterConsumptionFailedError(result);
  return 'ok';
}
```

`OrderCatalog.transitionAliveById` pierde `presentation_without_content`, `no_whole_package` y
`recipe_not_found` de sus resultados (R16): esos tres pasan a ser resultados de
`finishPackingAliveById` (§4.5), no de este método.

### 4.5 `order-packing.ts`: donde se mueve el trabajo

**`startPackingAliveById`** (R10): antes de su `UPDATE`, o dentro del mismo `WHERE` con un
`EXISTS`, comprueba que el pedido tiene al menos una línea de reparto. Igual que hoy distingue
`taken` de `not_packable` con una relectura tras un `UPDATE` en 0 filas, distingue ahora
`without_distribution` (estado correcto, cero líneas) de `not_packable` (estado incorrecto).

**`finishPackingAliveById`** (R17-R21): pasa de un `UPDATE` suelto a abrir
`deps.unitOfWork.run(...)` (la misma unidad de trabajo de QC-141/QC-150, con `finishedGoods` en su
ámbito):

1. `UPDATE orders SET status='ENTREGADO', finished_at=$now WHERE id AND company AND
   status='EN_EMPAQUE' AND packed_by=$packer`. `count = 0` → relectura → `not_found` /
   `not_packer` / `not_packable`, exactamente como hoy.
2. Lee las líneas de reparto de ese pedido, `FOR SHARE`.
3. Coste del lote: `locked.ingredientsCost` si no es nulo; si lo es,
   `resolveLotIngredientsCost(...)` (QC-150 §4.1, trasladado desde Finalizar, §4.4).
4. `unitCost` único: `deriveUnitCost(lotCost, sumaDeCantidadesDeTodasLasLineas)` (R18) — **una sola
   vez**, no por línea.
5. Por cada línea: si no tiene contenido copiado NI la presentación tiene hoy contenido vigente,
   `presentation_without_content` con el id de la línea (R19) y se deshace TODA la operación (el
   `throw` dentro de la misma transacción revierte el `UPDATE` del paso 1 también). Si lo tiene,
   `receiveFromOrder` (§5) con `unitCost` fijo del paso 4, no recalculado por línea.
6. `setReservedAt(id, null)`.

`OrderCatalog.finishPackingAliveById` devuelve, en el éxito, `finishedGoods: readonly
FinishedGoodsReceipt[]` (uno por línea) en vez de un único objeto.

## 5. Dominio de `inventario`: un lote por línea, mismo coste unitario

### 5.1 `planFinishedGoods` deja de calcular envases (R1)

`FinishedGoodsPlan` pierde el caso `no_whole_package` (ya no hay división que no dé entero: los
envases los da la línea) y el campo `packages` como salida — pasa a ser una ENTRADA:

```ts
export function planFinishedGoodsLine(input: {
  readonly packages: number;         // de la linea, ya validado > 0 (R1)
  readonly content: string | null;   // copia de la linea, o la vigente si no hay copia (R19)
  readonly unitCost: string;         // el UNICO de todo el pedido (R18), no recalculado aqui
}): { kind: 'planned'; quantity: string } | { kind: 'no_content' };
```

`quantity = packages × content`, exacta — ya no hay `floor` que hacer, la división desaparece de
esta función (la hacía el humano al escribir «5 × Botella 200 ml», no el sistema).

### 5.2 `receiveFromOrder` se repite una vez por línea

`FinishedGoodsIntake.receiveFromOrder` cambia de forma: en vez de una llamada con
`orderQuantity`/`orderContent` del pedido entero, recibe `presentationId`, `packages`,
`orderContent` (de la línea) y el `unitCost` ya resuelto (R18); `receiveFinishedGoods`
(`product-prisma.ts`) sigue haciendo, por llamada: hallar/crear el producto terminado de esa
combinación (§2.3 de QC-150, sin cambios: la identidad sigue siendo receta+presentación), el lote
con `package_content` = contenido de la línea y `unit_cost` = el compartido, el asiento `production`
con `order_id` Y `order_presentation_line_id` (§2.3), y `recalculateProductStock`. `pedidos` llama a
esto en un bucle dentro de la misma transacción del paso 5 de §4.5, y el primer `no_content` que
salga aborta el bucle y deshace todo (R19).

### 5.3 Alternativa descartada: una función que reciba todas las líneas de una vez

Una `receiveFromOrderLines(lines[])` única, en vez de una llamada por línea. Descartada: el número de
líneas de un reparto no tiene tope fijado por ninguna decisión, así que una función variádica no
simplifica nada sobre un bucle simple en `pedidos`, y separar «una línea, un lote» en una función por
llamada es lo que ya prueba `finished-goods.test.ts` de QC-150 hoy — cambiar la forma del contrato
rompe menos si se mantiene esa granularidad.

## 6. Lo que consume el resultado (asignaciones, listados)

- `AssignedOrderSummary.presentationId` → `presentationLines: readonly { presentationId: string;
  packages: number }[]` (R26). `asignaciones` resuelve los nombres con `PresentationCatalog.findRefs`
  igual que hoy resuelve uno solo, con los ids únicos de TODAS las líneas de la página (una sola
  llamada, mismo patrón que QC-146 §3.4 para el listado de pedidos).
- `findFinishedGoodsReceipts` (QC-168 §4) sigue devolviendo un texto por pedido para «Por empacar»:
  ahora agrega (`SUM(quantity)`) sobre los varios asientos `production` de ese pedido, y sigue siendo
  la cifra que de verdad entró (no la que el reparto dice).
- La representación exacta del reparto en cada pantalla es lo que la pregunta abierta 1 deja sin
  cerrar (§0.1): el mecanismo de datos (una lista de `{ presentationName, packages }` por pedido) es
  el mismo cualquiera que sea el formato visual que el humano elija.

## 7. Errores nuevos (amplían el catálogo cerrado, sin citar ninguna ficha)

| Código | Mensaje | Lo lanza |
|---|---|---|
| `order_without_distribution` | «El pedido no tiene ningún reparto: añade al menos una presentación antes de comenzar el empaque.» | `pedidos` (`startPackingAliveById`, R10) |
| `order_presentation_line_not_editable` | «El reparto de este pedido ya no se puede cambiar.» | `pedidos` (`updateOrderPresentationLines`, R13) |
| `presentation_without_content` | (ya existe, QC-150) — se reusa para R19, ahora identificando la línea en el DIAGNÓSTICO (nunca en el mensaje) | `pedidos` |
| `presentation_not_found` | (ya existe, QC-146) — se reusa cuando una línea nombra una presentación inexistente o ajena | `pedidos` |

`no_whole_package` (QC-150) **se retira del catálogo activo**: ya no hay ninguna operación que
pueda producir «la cantidad no llena ni un envase» (el humano ya no divide, elige envases enteros
directamente). Se decide DEJARLO en el catálogo (no borrarlo: `ERROR_CODES` es un array append-only
en la práctica del repo, y quitarlo bajaría el conteo que otra ficha en curso podría estar asumiendo)
pero sin ningún emisor: el test de cobertura de errores (`guard-catalogo-de-errores`, si exige que
todo código tenga al menos un emisor) es el primer sitio a mirar en T-implementación; si lo exige,
se retira del array en la misma tarea. `ERROR_CODES` pasa de 60 a 62 (dos altas: R28).

## 8. Enmiendas a specs ya cerrados

- **QC-168** (`specs/QC-168-estado-por-empacar/design.md`): §2 («la rama de consumo + lote pasa de
  `to === 'ENTREGADO'` a `to === 'POR_EMPACAR'`... mismos resultados») queda **derogado en la mitad
  del lote**: sigue siendo cierto para el consumo, falso para el lote, que se traslada a
  `finishPackingAliveById` (§4.5, §4.4 de esta ficha). §3 («Ninguno abre la unidad de trabajo de
  inventario: no hay consumo ni lote», R25 de QC-168) queda derogado para `finishPackingAliveById`
  únicamente: SÍ abre la unidad de trabajo desde esta ficha. §4 (envases leídos de
  `findFinishedGoodsReceipts`) se ajusta a la agregación de §6.
- **QC-150** (`specs/QC-150-producto-terminado/design.md`): §1 («`transition-order.ts`, rama
  `ENTREGADO`... `receiveFromOrder`»), §4.1 (`planFinishedGoods` con `floor`), §4.3 (el Finalizar da
  de alta el lote) quedan derogados por §4.4/§4.5/§5 de esta ficha: el Finalizar YA NO da de alta
  nada; Terminar sí, una vez por línea. El resto de QC-150 (identidad del producto terminado §2.3,
  `package_content` §2.5, el catálogo de errores §6 salvo lo dicho en §7) sigue vigente sin cambios.
- **QC-146** (`specs/QC-146-presentacion-del-pedido/design.md`): entero derogado por R4/R22-R25 de
  esta ficha — la columna que creó desaparece y la migración de datos la absorbe. Se anota con fecha
  en la cabecera de ese `design.md` en la tarea de documentación (`tasks.md` T-doc), sin reescribirlo.

## 9. Cruce de archivos con fichas en curso o a punto de entrar

- **QC-138** (`estado-bloqueado-por-inventario-insuficiente`, `spec_ready`, a punto de F2.0): toca
  `enum OrderStatus`, `ORDER_STATUS_VALUES` (`order-classification.ts`), `order-transitions.ts`
  (nueva fila `BLOQUEADO` en `ALLOWED`) y las uniones de estado de `asignaciones`
  (`assigned-order-view.ts`, `assigned-order-execution-view.ts`, `list-assigned-orders.ts`,
  `get-assigned-order-execution.ts`). Esta ficha **no** añade ningún valor al enum ni cambia
  `ALLOWED` (§4.2: el reparto usa una constante propia, no la matriz), así que el choque de
  contenido es bajo; el choque real es de MÉRITO: si QC-138 entra primero, `AssignedOrderSummary`
  que esta ficha cambia (`presentationId → presentationLines`) tendrá que convivir con el estado
  `BLOQUEADO` que QC-138 añade a la misma unión. **No deben estar las dos `in_progress` a la vez**
  sobre `order-catalog.ts`, `assigned-order-view.ts` y `list-assigned-orders.ts` salvo reparto
  explícito de quién entra primero.
- **QC-82** (`registro-de-ejecucion-de-receta`, `spec_ready`): toca `finish-assigned-order.ts`,
  `start-assigned-order.ts`, `order-state.ts`, `order-execution-actions.ts` (según QC-168
  `design.md > 9`, todavía sin aplicar). Esta ficha toca `finishPackingAliveById` y
  `startPackingAliveById` en `pedidos`, que son los puertos que esos archivos de `asignaciones`
  invocan — el archivo compartido es `asignaciones/domain/order-packing-actions.ts` (o como se llame
  tras QC-82) si QC-82 llega a envolver también las dos acciones de empaque en su
  `transaction.run` (QC-168 `design.md > 9.3`). Mismo criterio: no las dos `in_progress` sobre esos
  archivos a la vez.
- **Ninguna otra ficha `in_progress` de la zona `fullstack`** (cupo de 3) declara tocar `orders`,
  `presentations` o `product_batches` en este commit — se revalida en el momento de reservar cupo
  (`AGENTS.md > Paralelismo`).

## 10. Alternativas descartadas (generales, aparte de las de §0 y §5.3)

1. **Guardar el reparto como JSON en una columna de `orders`** (`presentation_lines JSONB`), en vez
   de una tabla. Descartada: no se puede poner una FK compuesta hacia `presentations` dentro de un
   JSON, así que una presentación borrada dejaría una línea huérfana sin que ningún `RESTRICT` lo
   impida (rompe la garantía que QC-146 construyó a propósito), y no se puede indexar por
   presentación para el `EXISTS` de R10.
2. **Un solo `UPDATE` de `finishPackingAliveById` con un `jsonb_populate_recordset` para escribir
   todos los lotes en una sentencia.** Descartada: `receiveFinishedGoods` ya hace cinco pasos por
   lote (presentación, contenido, plan, upsert de producto, lote, asiento, existencia) que dependen
   unos de otros y de bloqueos de fila; meterlo en SQL puro sería reescribir en SQL lo que
   `product-prisma.ts` ya tiene en TypeScript probado.
3. **Migrar los pedidos existentes a una sola línea con `packages = quantity` sin dividir por
   contenido.** Descartada por R22: la decisión cerrada es `⌊quantity / content⌋`, no `quantity`
   directo — un pedido de 100 L con presentación de 1 L de contenido migra a 100 envases, no a un
   envase de 100 L inexistente.

## 11. Dependencias

Ninguna nueva. `convertQuantity` (QC-76) ya existe en el repo; no hace falta ninguna librería de
decimales (mismo criterio heredado de QC-90/QC-141/QC-150).

## 12. Trazabilidad (mapa completo en `progress/impl_QC-170-pedido-en-varias-presentaciones.md`)

Cada `R<n>` de `requirements.md` se prueba al menos una vez en unidad y, cuando toca una migración o
una transacción con inventario, también en integración; R33 es el único E2E. El implementer escribe
el mapa exacto `R<n> → test` al abrir la implementación; este diseño no lo repite para no
desincronizarse de los nombres reales de los casos.
