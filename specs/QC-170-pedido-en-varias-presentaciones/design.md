# QC-170 — pedido-en-varias-presentaciones · design.md

> Leído en `origin/dev` `0736e1ff` (worktree `QC-170-pedido-en-varias-presentaciones`, misma punta).
> Incluye QC-121, QC-146, QC-150 y QC-168 ya mergeadas. Todo lo que se cita de código existe ahí;
> donde no se pudo confirmar queda dicho.

## 0. Las 4 preguntas de F1.2: CERRADAS por el humano en F1.4 (2026-09-26)

| Id | Estado | Decisión | Requisitos |
|---|---|---|---|
| Q1 | **CERRADA 2026-09-26 por el humano** (= recomendada) | Primera línea + «+N»; sin reparto, «Sin presentación». | R26, R27 |
| Q2 | **CERRADA 2026-09-26 por el humano** (= recomendada) | Se prohíbe añadir una línea sin contenido: aviso en el selector y rechazo en servidor. | R19, R34, R35 |
| Q3 | **CERRADA 2026-09-26 por el humano** (**CAMBIA** la recomendación) | Pasar del total se **rechaza al guardar**, en servidor, dentro de la transacción que reescribe el reparto con la fila del pedido bloqueada. Igual o menor sí. La UI muestra el disponible y avisa antes. | R8, R36-R39 |
| Q4 | **CERRADA 2026-09-26 por el humano** (= opción A) | `orders.unit_id` (FK a `units`), obligatorio en el alta, editable; conversión por línea con `convertQuantity`. **Deroga QC-35bis** en la unidad (§0.6). | R6, R7, R40-R45 |

**D2/D3 sustituidas por el humano (F1.4, 2026-09-26) → `[D2']`/`[D3']`.** Solo quien tiene
`pedidos.modificar` define o cambia el reparto y la unidad, y solo hasta pulsar Comenzar empaque
(`PENDIENTE`, `EN_CURSO`, `POR_EMPACAR`; `BLOQUEADO` si QC-138 ya lo añadió al enum cuando T0
recontraste — hoy no existe en `db/schema.prisma`). El Empacador solo ve el reparto. Efectos en este
diseño: §0.5 (R44 retirado, pregunta 5 cerrada), §2.2 (guardia R49), §4.2 (ventana y entrada con
`unitId`), §4.3 (una sola puerta, dos formularios), §4.4 (sin condición nueva en Finalizar), §4.5
(Comenzar serializa con el guardado, R48), §7 (significado de `order_presentation_line_not_editable`),
§10.5 (alternativa descartada).

Lo que sigue en §0.1-§0.4 es el razonamiento de F1.2, conservado para que se vea qué se propuso;
donde el humano cambió la propuesta (Q3) se dice en el propio punto. §0.5 y §0.6 son nuevos de F1.4.

1. **Cómo se muestra el reparto en los listados.** **CERRADA [Q1] tal cual.** Recomendado: **la primera línea + «+N»** (p. ej.
   «5 × Botella 200 ml +1»), igual que hacen ya los avatares de responsables en
   `company-orders-columns.tsx` (QC-102) — patrón existente, sin componente nuevo de truncado. Sin
   reparto: «Sin presentación» (R27). Alternativa descartada: «3 presentaciones» a secas, sin nombrar
   ninguna — se pierde la única información que alguien mirando la lista necesita para reconocer el
   pedido de un vistazo.
2. **Línea sin contenido.** **CERRADA [Q2] tal cual**, con rechazo también en servidor (R35). Recomendado: **se prohíbe añadirla** al reparto (mismo criterio que
   `no_content` de QC-150 §4.1): un envase sin contenido no es una cantidad, es un dato incompleto de
   Presentaciones, y `PresentationCatalog.findRefs` ya devuelve el contenido (§2). Se avisa en el
   selector, no al guardar. Alternativa: dejarla entrar y calcular «disponible» solo con las líneas
   que sí tienen contenido — descartada porque esconde una línea del cálculo sin decir cuál.
3. **¿Se puede pasar del total?** **CERRADA [Q3] EN CONTRA de esta propuesta: se RECHAZA** (motivo del
   humano: al terminar el empaque entraría al inventario producto que no se produjo). La carrera que
   la propuesta temía se resuelve con la relectura bajo bloqueo de §3.1. Se conserva abajo el texto
   descartado. Propuesta original (descartada): **se permite**, sin bloquear ni avisar más que con la
   cifra en negativo («-10 L» de disponible): el reparto de QC-170 no es una restricción de
   inventario (esa la pone D4, que ya acepta que el reparto no cubra todo) y forzar que nunca exceda
   obligaría a decidir qué línea se recorta cuando dos personas editan el reparto a la vez. Es
   simétrico con D4 (tampoco tiene que llegar). Alternativa descartada: rechazar la línea que hace
   exceder el total — introduce una carrera entre "cuánto llevas repartido" y "cuánto añades" que
   solo el servidor puede arbitrar con una relectura, y la ficha ya tiene bastante superficie nueva.
4. **Unidad de `quantity`.** **CERRADA [Q4] = esta opción (A)**; migración y nulos en §2.2 y §0.5. Recomendado: **`orders` gana `unit_id`** (nullable, mismo patrón drift
   que `recipe_id`/`presentation_id`), copiado del catálogo de `unidades` (`UnitCatalog`, QC-76) al
   crear el pedido, obligatorio en el alta y conservado en la edición salvo que se cambie a mano.
   `quantity` se interpreta siempre en esa unidad, con o sin reparto. Cada línea de reparto convierte
   `envases × contenido` (en la unidad de la presentación) a `unit_id` con `convertQuantity` (QC-76,
   §3) para el cálculo de R6; si no comparten base, R7 rechaza esa línea. Alternativa descartada:
   derivar la unidad del pedido de la primera línea de reparto que se añada — frágil (si esa línea se
   borra, el pedido se queda sin unidad de referencia a mitad de edición) y no resuelve el caso de un
   pedido sin ninguna línea todavía, que R9 permite.
5. **Pedidos sin unidad tras la migración — pregunta 5 CERRADA 2026-09-26 por el humano vía
   `[D2']`/`[D3']`; R44 RETIRADO.** Estado vigente: un pedido con `unit_id NULL` que llegue a
   `POR_EMPACAR` lo desatasca quien tiene `pedidos.modificar` con la edición acotada de reparto y
   unidad (R46, §4.3). Finalizar (`EN_CURSO → POR_EMPACAR`) **no** gana ninguna condición: queda
   exactamente como en QC-168 (R31). R45 se mantiene (la migración aborta si un `POR_EMPACAR`/
   `EN_EMPAQUE` quedaría sin unidad): en `POR_EMPACAR` ya sería recuperable, pero en `dev` no debe
   existir ninguno y abortar ante lo inesperado es más barato que migrar a ciegas; en `EN_EMPAQUE`
   sigue siendo imprescindible porque ahí el reparto y la unidad ya están fijos (R13). Por el mismo
   motivo nace **R49**: la migración aborta si un `EN_EMPAQUE` quedaría sin ninguna línea. El texto
   de F1.2 que sigue se conserva como histórico. ~~La columna es **anulable en la base y obligatoria en la aplicación** (alta siempre;
   edición la exige si falta, R41). Un pedido con `unit_id NULL` (solo los antiguos sin
   presentación, R43) no puede repartirse (`order_without_unit`, R42) hasta que la edición del pedido
   le asigne una. Para que no quede varado, **Finalizar (`EN_CURSO → POR_EMPACAR`) exige unidad**
   (R44), y la migración **aborta** si algún pedido `POR_EMPACAR`/`EN_EMPAQUE` quedaría sin unidad
   (R45) — en `dev` no debería haber ninguno, porque hasta hoy Finalizar exigía presentación con
   contenido (`transitionAliveById` → `presentation_without_content`), y toda presentación tiene
   `unit_id NOT NULL` (`db/schema.prisma:252`). Alternativa descartada: que el Empacador asigne la
   unidad en su pantalla — abre una segunda puerta de edición de un dato del pedido que QC-168 R32
   cerró en `POR_EMPACAR`, sólo para un caso que la migración ya garantiza que no existe.~~ (Fin del
   texto histórico.) Sigue descartado: `NOT NULL` con un valor por defecto inventado — rompe la
   regla 6 (no inventar).
6. **Derogación explícita de QC-35bis (enmienda de QC-35 del 2026-09-07).** Aquella decisión quitó
   la unidad del pedido («el pedido ya no tiene unidad ni precio unitario»,
   `specs/QC-35-pantalla-de-pedidos/requirements.md > Importes`, `order-view.ts:13-17`,
   `get-order.ts:12-17`, `create-order.ts:34-35`). **Q4 la deroga en lo que toca a la UNIDAD**; el
   precio unitario sigue fuera. Consecuencias en código y pruebas:
   - `create-order.ts`/`update-order.ts` ya tienen `units: UnitCatalog` (lo recuperó QC-123 para el
     coste, `specs/QC-123-*/design.md:327`); ahora además validan `unitId` con
     `UnitCatalog.findRefs` (`unit_not_found`, R41) y lo usan para R6/R36/R38.
   - `get-order.ts` y `list-orders.ts` **vuelven a depender de `UnitCatalog`** para resolver nombre
     y símbolo de la unidad a mostrar junto a la cantidad (una sola llamada por página, ids únicos).
   - Pruebas que afirman la ausencia de la unidad y hay que invertir (cada una con nota «QC-170
     deroga QC-35bis»): `tests/unit/pedidos/module-contract.test.ts:526-537` (hoy exige que
     `order-contents.ts` NO importe `unidades` — se mantiene para ese archivo, pero la nota del
     comentario deja de ser cierta a nivel de módulo), `tests/unit/pedidos/list-orders.test.ts:183`
     (número de consultas), `tests/unit/pedidos/authorization.test.ts:17` (número de puertos),
     `tests/unit/pedidos/order-service.test.ts:269,516`, `tests/unit/pedidos/order-input.test.ts:61`,
     `tests/unit/pedidos-ui/order-columns.test.tsx:105` (número de columnas si la unidad vuelve como
     columna o dentro de la de cantidad), `tests/integration/pedidos/pedidos-constraints.int.test.ts:599`.
   - En `specs/QC-35-pantalla-de-pedidos/requirements.md` se añade una nota de derogación fechada
     tras la enmienda del 2026-09-07 (T24), sin reescribirla.

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
| `OrderCatalog.transitionAliveById` (`order-catalog.ts:109-126`) | el `'ok'` a `POR_EMPACAR` lleva `finishedGoods` | pierde ese campo: `to === 'POR_EMPACAR'` vuelve a devolver `'ok'` sin nada más (R44 retirado: **no** gana `'without_unit'`) |
| `OrderCatalog.finishPackingAliveById` (`order-catalog.ts:149-154`) | `'ok' \| 'not_packer' \| 'not_packable' \| 'not_found'` | gana `finishedGoods: FinishedGoodsReceipt` en el `'ok'` (R17) y el caso `presentation_without_content` (R19, por línea) |
| `OrderCatalog.startPackingAliveById` (`:136-141`) | `'ok' \| 'already_mine' \| 'taken' \| 'not_packable' \| 'not_found'` | gana `'without_distribution'` (R10) y serializa con el guardado del reparto sobre la fila del pedido (R48, §4.5) |
| Matriz `ALLOWED` (`order-transitions.ts:30-37`) | `POR_EMPACAR: ['EN_EMPAQUE']` sin «quedarse igual» ⇒ nada editable en `POR_EMPACAR`/`EN_EMPAQUE` (QC-168 R32) | **sin cambios en la matriz**: el reparto no usa `updateOrder`/`assertTransition`, tiene su propio caso de uso y su propia guardia de estado (§4.2), así que R11-R14 y R46 no reabren R32 de QC-168: en `POR_EMPACAR` solo se abre el reparto y la unidad, el resto del pedido sigue cerrado |
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

### 2.2 `orders.unit_id` (CERRADA [Q4], R40-R45)

```prisma
model Order {
  // ...
  /// La unidad en que se expresa `quantity` (QC-170 Q4, deroga QC-35bis en la unidad). Sin
  /// `@relation`: `Unit` es de `unidades`, es drift. NULL solo en pedidos anteriores sin
  /// presentacion (R43); la aplicacion la exige en el alta y en la edicion (R41).
  unitId String? @map("unit_id") @db.Uuid
}
```

- **Anulable en la base, obligatoria en la aplicación** (R41): el alta la exige siempre; la edición
  la exige también (el formulario siempre la envía), así que un pedido antiguo en `NULL` la gana en
  cuanto alguien lo edita. No hay `CHECK NOT NULL` porque R43 deja filas legítimas en `NULL`.
- **FK simple** `orders_unit_id_fkey → units(id) ON DELETE RESTRICT ON UPDATE CASCADE`. `units`
  **sí tiene ámbito** (`units.company_id` anulable: `NULL` = unidad del sistema, valor = unidad de
  una empresa; `db/schema.prisma:558-572`), así que la FK compuesta con `company_id` no sirve (una
  unidad del sistema tiene `company_id NULL`). La visibilidad para la empresa del pedido la garantiza
  la aplicación con `UnitCatalog.findRefs(ids, companyId)` antes de escribir (`unit_not_found`,
  R41), mismo patrón que `products.unit_id` y `presentations.unit_id` (FK simple también). T0 lo
  reconfirma leyendo esas dos migraciones.
- **Índice** `orders_unit_id_idx` para el `RESTRICT`.
- **Migración de datos** (R43, R45) — en `<ts3>` (§2.4), ANTES del `DROP COLUMN presentation_id`:
  1. `DO $$ ... IF EXISTS (SELECT 1 FROM orders WHERE status IN ('POR_EMPACAR','EN_EMPAQUE') AND
     presentation_id IS NULL) THEN RAISE EXCEPTION ...` (R45: aborta toda la migración).
  1 bis. **R49 [D3']**: en el mismo bloque, `IF EXISTS (SELECT 1 FROM orders WHERE status =
     'EN_EMPAQUE' AND deleted_at IS NULL AND (presentation_id IS NULL OR presentation_content IS NULL
     OR FLOOR(quantity / presentation_content) < 1)) THEN RAISE EXCEPTION ...`: mismo predicado que
     excluye filas en el `INSERT` de §2.4 paso 1, restringido a `EN_EMPAQUE`, donde el reparto ya no
     se puede corregir (R13). (T0 confirma si `orders` tiene `deleted_at`; si no, se omite.)
  2. `UPDATE orders o SET unit_id = p.unit_id FROM presentations p WHERE p.id = o.presentation_id
     AND p.company_id = o.company_id` (R43). Incluye pedidos `ENTREGADO`/`CANCELADO`: el dato se
     conserva aunque ya no se edite. Los que no tenían presentación quedan en `NULL`.

### 2.2 bis Validación del reparto contra el total (CERRADA [Q3], R36-R39)

La regla: `Σ convertQuantity(packages_i × content_i, unidad(presentation_i), orders.unit_id) ≤
orders.quantity`, con aritmética `Decimal` exacta (R5). Igual se acepta (D4, R8).

- **Dónde se decide**: en el servidor, en `updateOrderPresentationLines` (§4.2, la edición acotada
  de §4.3; también valida la unidad nueva si cambia, R46), en `createOrder` (el alta con reparto) y en `updateOrder` cuando cambia
  `quantity` o `unitId` (R38). El formulario repite el cálculo solo para avisar (R39); nunca decide.
- **Concurrencia (R37)**: dentro de la transacción que reescribe el reparto, lo primero es
  `SELECT quantity, unit_id, status FROM orders WHERE id = $1 AND company_id = $2 AND deleted_at IS
  NULL FOR UPDATE`. Con la fila bloqueada: se comprueba estado (R13) y unidad (R42), se leen los
  contenidos vigentes de las presentaciones (R3, R35), se convierte y se suma, se compara contra la
  `quantity` releída, y solo entonces `DELETE` + `INSERT` de las líneas. `updateOrder` toma el mismo
  bloqueo (hoy ya lo toma para la reserva de QC-141, T0 lo confirma) y relee las líneas vigentes
  antes de aceptar una `quantity`/`unitId` nueva. Como ambos caminos serializan en la MISMA fila,
  ningún intercalado deja un reparto que pase del total: el segundo en llegar ve lo que escribió
  el primero.
- **Conversión**: las `UnitConversion` de la unidad del pedido y de las presentaciones salen de UNA
  llamada a `UnitCatalog.findRefs` (ids únicos). `IncompatibleUnitsError` → `incompatible_units`
  (R7); la unidad del pedido no visible → `unit_not_found`.
- **Error**: `order_distribution_exceeds_quantity` (§7). El diagnóstico (no el mensaje) lleva la
  suma convertida y la cantidad.

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
3. `<ts3>_order_presentation_lines_backfill_and_drop` — **con datos** (R22-R25, R43, R45):
   0. Guardias de R45 y R49 y `UPDATE orders SET unit_id` de R43 (§2.2), antes de todo lo demás.
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
   3 bis. **El backfill nunca pasa del total (R36)**: `⌊q / c⌋ × c ≤ q`, y la unidad de la línea
      (la de la presentación) es la que el paso 0 copia a `orders.unit_id`, así que no hace falta
      conversión ni validación extra en la migración.
   4. `down.sql`: repone `presentation_id`/`presentation_content` con sus `CHECK` e índice
      (recuperando SOLO el caso de una única línea por pedido — un pedido con más de una línea no
      puede volver a tener una sola presentación, así que el `down.sql` **falla con `RAISE`** si
      algún pedido tiene más de una línea vigente) y hace `DROP TABLE order_presentation_lines`.
      Es destructivo a conciencia, igual que QC-146 lo fue con la columna que ahora se retira.

> **Nota de enmienda (2026-10-01) — decisión humana 2026-10-01**, al cerrar T3. Ajusta el paso 3
> anterior; el resto de §2.4 queda como estaba.
>
> - **Backfill solo de pedidos vivos (R22).** El `INSERT` del paso 1 añade `o.deleted_at IS NULL`
>   y excluye los estados `ENTREGADO` y `CANCELADO` (valores reales de `OrderStatus`). Un pedido
>   borrado, entregado o cancelado queda sin líneas. El guardia de R45 sigue mirando
>   `POR_EMPACAR`/`EN_EMPAQUE`, pero solo de pedidos no borrados (`deleted_at IS NULL`), igual que
>   ya hacía el de R49. El `UPDATE` de `orders.unit_id` (R43) no cambia: sigue alcanzando a todos.
> - **Desviación aceptada 1 — el `down.sql` no borra la tabla.** No hace `DROP TABLE
>   order_presentation_lines`: la FK de `inventory_movements` (migración (2)) lo impide, y la tabla
>   la borra el `down.sql` de la migración (1). Solo devuelve la línea única a las columnas y borra
>   las líneas.
> - **Desviación aceptada 2 — dónde falla la segunda aplicación (R25).** Falla en el guardia del
>   paso 0, que también lee `presentation_id`, no en el `DROP COLUMN`; el error es el mismo
>   (42703, columna inexistente) y sigue sin duplicar líneas.
> - **Desviación aceptada 3 — paréntesis de RLS.** `up` y `down` abren `NO FORCE ROW LEVEL
>   SECURITY` sobre las tablas que leen y lo cierran con `ENABLE`+`FORCE` al final, para ver las
>   filas aunque la migración no corra como superusuario. Si un guardia aborta, la transacción lo
>   deshace.

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
  `[]` es válido) y `unitId: z.string().uuid()` (obligatorio en los dos, R41, §2.2).
- El esquema **no** valida contenido (R35) ni total (R36): necesitan datos de la base leídos bajo
  bloqueo (§2.2 bis). Solo forma: UUID, entero positivo, sin duplicados.
- `presentationId` deja de existir en el esquema de un pedido: **rompe** cualquier código que aún lo
  lea de `createOrderSchema`/`updateOrderSchema` — es la limpieza de R4.

### 4.2 Caso de uso dedicado: `updateOrderPresentationLines` (nuevo)

R11 y R46 (`[D2']`/`[D3']`) exigen que el reparto y la unidad se puedan editar en `POR_EMPACAR`, donde
`updateOrder` **no** deja tocar nada (QC-168 R32, `ALLOWED.POR_EMPACAR = ['EN_EMPAQUE']` sin
«quedarse igual»). Reabrir esa matriz para permitir una edición parcial sería mezclar dos preguntas
—¿puede cambiar el PEDIDO? ¿puede cambiar su REPARTO?— en una sola respuesta. Se separa en un caso de
uso propio, que NO pasa por `assertTransition`:

```ts
// pedidos/domain/update-order-presentation-lines.ts
// [D3'] hasta Comenzar empaque. 'BLOQUEADO' se añade SOLO si T0 lo encuentra en el enum (QC-138).
const REPARTO_EDITABLE_STATUSES: readonly OrderStatus[] =
  ['PENDIENTE', 'EN_CURSO', 'POR_EMPACAR'];

export function createUpdateOrderPresentationLines(deps: {...}) {
  return async function updateOrderPresentationLines(
    orderId: string, companyId: string, actorId: string,
    input: { readonly unitId: string; readonly lines: readonly PresentationLineInput[] }, // R46
  ): Promise<
    | 'ok' | 'not_found' | 'not_editable' | 'presentation_not_found'
    | 'unit_not_found'                 // R41 [Q4], unidad nueva no visible
    | 'presentation_without_content'   // R35 [Q2]
    | 'incompatible_units'             // R7  [Q4]
    | 'without_unit'                   // R42 [Q4] (solo si la entrada no trae unidad; el esquema la exige)
    | 'exceeds_quantity'               // R36 [Q3]
  > { ... };
}
```

Orden de comprobación dentro de la transacción (con la fila del pedido `FOR UPDATE`, §2.2 bis):
`not_found` → `not_editable` → `unit_not_found` → `without_unit` → `presentation_not_found` →
`presentation_without_content` → `incompatible_units` → `exceeds_quantity` → escribir (`UPDATE
orders SET unit_id` si cambió + `DELETE`/`INSERT` de líneas). El primer fallo aborta sin escribir
nada, ni la unidad ni las líneas. La unidad y el reparto se guardan juntos porque R38 los valida
juntos: cambiar la unidad sin revalidar el reparto vigente podría dejarlo inconvertible o por encima
del total. **No** se toca `quantity`, la receta ni la reserva (R46, R30): este caso de uso no abre la
unidad de trabajo de inventario.

- Autorización: la comprueba QUIEN LLAMA (§4.3), no este caso de uso — como `finishAssignedOrder` no
  repite el permiso de `startAssignedOrder`. Solo hay un llamador, con `pedidos.modificar` (R12).
- Reemplazo completo del conjunto de líneas (mismo criterio que `updateOrderSchema`, §4.1 de
  QC-33/34): un `DELETE` de las líneas vigentes + `INSERT` de las nuevas, en una transacción corta
  (sin la unidad de trabajo de inventario: no toca material ni existencia), precedida del
  `SELECT ... FOR UPDATE` de la fila del pedido y de las validaciones de §2.2 bis (R37).
- `createOrder` y `updateOrder` hacen la misma validación (mismo helper de dominio puro
  `validateDistribution(quantity, orderUnit, lines, conversions)`, en
  `pedidos/domain/order-distribution.ts`) dentro de su propia unidad de trabajo, que ya bloquea la
  fila del pedido para la reserva de QC-141.
- `REPARTO_EDITABLE_STATUSES` es una constante NUEVA, deliberadamente distinta de `ALLOWED` de
  `order-transitions.ts`: no es una transición, es una ventana de estados en la que el reparto se
  deja tocar. `EN_EMPAQUE`, `ENTREGADO` y `CANCELADO` quedan fuera (R13, `[D3']`): el reparto se
  fija al Comenzar (R14), no al Terminar.

### 4.3 Una sola puerta (`pedidos.modificar`), dos formularios — `[D2']`

| Formulario | Estados | Qué guarda | Por dónde |
|---|---|---|---|
| Edición general del pedido en `/pedidos` | `PENDIENTE`, `EN_CURSO` (los de `ALLOWED` que admiten «quedarse igual») | todo el pedido, incluidos `unitId` y `presentationLines` | `updateOrder` (T8), que usa `validateDistribution` bajo su propio bloqueo |
| **Edición acotada «Reparto y unidad»** en `/pedidos` (acción nueva de la fila) | `POR_EMPACAR` (y `BLOQUEADO` si existe y la edición general está cerrada en él) | solo `unitId` + `presentationLines` (R46) | Server Action nueva `updateOrderDistributionAction` en `order-actions.ts` → `updateOrderPresentationLines` (§4.2) |

- Ambas exigen `pedidos.modificar` en el servidor (R12, `unauthorized`); la guardia de pantallas y
  permisos exige además que la acción de la fila solo se pinte con ese permiso.
- La edición acotada **no** pinta cantidad, receta, responsables ni ningún otro campo: no es un
  formulario general con campos deshabilitados, es otro formulario (así ningún campo cerrado viaja
  por error). Reutiliza el control de reparto de T22.
- **El Empacador no tiene ninguna puerta de escritura** (R12, R47): `asignaciones` no gana ningún
  caso de uso ni Server Action que escriba el reparto, y `OrderCatalog` **no** gana
  `updatePresentationLinesAliveById` (lo que F1.2 proponía para esa puerta desaparece). La pantalla de
  empaque recibe `presentationLines` en `AssignedOrderSummary` (§6) y los pinta en solo lectura con la
  unidad; si el pedido está `POR_EMPACAR` sin líneas, pinta el aviso de R47 («Falta el reparto: lo
  define quien edita pedidos») y el rechazo de Comenzar sigue siendo el de R10 en servidor.
- **Qué se puede tocar en `POR_EMPACAR` y qué no (R46)**: se puede el reparto (añadir, quitar,
  cambiar envases, vaciarlo — R9/R10 solo exigen líneas al Comenzar) y la unidad del pedido (sujeta a
  R38 contra el reparto que se guarda en la misma operación). No se puede: `quantity`, receta,
  responsables ni ningún otro campo de `updateOrder` (sigue el rechazo de QC-168 R32 con el mismo
  código que hoy; esta ficha no lo cambia). Cambiar la unidad no reconsume ni reserva: el material ya se
  consumió al Finalizar con `quantity` y la receta, que no cambian.

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

~~**R44 [Q4] (pregunta abierta 5):** antes de `consumeForOrder`, `if (locked.unitId === null) throw
new OrderWithoutUnitError()` → resultado `'without_unit'` de `transitionAliveById`.~~ **Retirado
2026-09-26** (R44 retirado por `[D2']`/`[D3']`, §0.5): Finalizar no mira la unidad; el bloque de
código de arriba es el definitivo.

### 4.5 `order-packing.ts`: donde se mueve el trabajo

**`startPackingAliveById`** (R10, R14, R48): pasa de un `UPDATE` suelto a una transacción corta (sin
la unidad de trabajo de inventario): (1) `SELECT status, packed_by FROM orders WHERE id AND company
... FOR UPDATE`; (2) en una sentencia NUEVA (en `READ COMMITTED` ve lo que el guardado del reparto
confirmó mientras esperaba el bloqueo) cuenta las líneas de reparto; cero → `without_distribution`;
(3) el `UPDATE` condicional de hoy. Se descarta el `EXISTS` dentro del `WHERE` del `UPDATE` que
proponía F1.2: al reevaluar tras esperar un bloqueo, Postgres relee la fila de `orders` pero la
subconsulta sobre `order_presentation_lines` puede usar la foto del inicio de la sentencia, y un
guardado que vació el reparto dejaría comenzar con cero líneas — justo lo que R48 prohíbe.
`updateOrderPresentationLines` toma el MISMO `FOR UPDATE` (§2.2 bis), así que Comenzar y el guardado
del reparto se serializan: el que llega segundo ve el estado que dejó el primero (el guardado ve
`EN_EMPAQUE` → `not_editable`; Comenzar ve las líneas nuevas). Se sigue distinguiendo `taken`/
`already_mine`/`not_packable` como hoy, y `without_distribution` (estado correcto, cero líneas) de
`not_packable` (estado incorrecto).

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

> **Nota de enmienda (2026-10-01) — decisión humana 2026-10-01** (R18 enmendado, hallazgo B3 de
> `progress/review_QC-170-pedido-en-varias-presentaciones.md`). Sustituye el paso 4 anterior; el
> resto de la secuencia queda igual.
>
> - **La cantidad total se suma en la unidad del pedido.** Antes del paso 4, Terminar lee
>   `orders.unit_id` de la fila ya bloqueada y la `UnitConversion` de esa unidad y de cada unidad de
>   presentación distinta del reparto (`UnitCatalog`, igual que §3; `PresentationRef.unitId`, T4).
>   La cantidad de cada línea (`packages × content`, en la unidad de su presentación) se convierte
>   con `convertQuantity(cantidad, unidadPresentación, unidadPedido)` —la misma conversión que R6 y
>   `validateDistribution` (T20), sin conversión si las dos unidades coinciden— y el total es la suma
>   de esas cantidades convertidas. `unitCost = deriveUnitCost(lotCost, totalEnUnidadDelPedido)`,
>   una sola vez: es coste **por unidad del pedido**.
> - **Inconvertible (R7).** Un `IncompatibleUnitsError` de esa conversión se traduce a
>   `incompatible_units` (código ya en el catálogo, QC-76) y se lanza dentro de la misma transacción,
>   como el `presentation_without_content` del paso 5: deshace el `UPDATE` del paso 1 y ningún lote
>   nace. No hay código nuevo. Es defensa en profundidad: R7 (al guardar), R38 (al editar cantidad o
>   unidad) y R13/R14 (reparto fijado) impiden llegar a Terminar con un reparto inconvertible. Un
>   pedido con líneas siempre tiene unidad (R41-R43, R45), así que `unit_id` nulo con líneas tampoco
>   es alcanzable sin escribir en la base; si aparece, se rechaza con `order_without_unit` (código
>   ya existente, R42), también deshaciendo todo. Pendiente de confirmar por el humano: no lo cubre
>   la decisión del 2026-10-01.
> - **Alternativa descartada: sumar sin convertir (la versión anterior).** Con un reparto en L y ml
>   la suma mezclaba magnitudes (p. ej. 2 L + 500 ml = 502) y cada lote salía con un coste por
>   unidad incorrecto, contra D6.
> - **Alternativa descartada: convertir a la unidad base de QC-76 en vez de a la del pedido.** Daría
>   un coste coherente entre lotes, pero en una unidad que no es la del pedido ni la de R6; la
>   decisión humana fija la unidad del pedido.

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
- **Formato cerrado [Q1] (R26, R27)**: un único componente compartido
  `components/shared/order-distribution-label.tsx` (sustituye a `order-presentation-label.tsx`)
  recibe `readonly { presentationName, packages }[]` en el orden de alta de las líneas (`created_at`,
  desempate por `id`) y pinta «<packages> × <presentationName>» de la primera + « +N» si hay N > 0
  más; con `[]` pinta «Sin presentación». Patrón «+N» ya usado por los avatares de
  `company-orders-columns.tsx` (QC-102). El `title`/tooltip lista todas las líneas. El formulario y
  la pantalla del Empacador pintan la lista completa, no este resumen; **en la del Empacador es una
  lista de solo lectura** (R47, `[D2']`), sin selector, sin botones de añadir/quitar y sin
  disponible editable. `AssignedOrderSummary` gana también la unidad del pedido (`unitId` + etiqueta
  resuelta por `asignaciones` con el barrel de `unidades`, o la cifra sola si es `NULL`) para que la
  pantalla muestre «5 × Botella 200 ml» junto a la cantidad con su unidad.
- **Cantidad con unidad**: donde se muestra `quantity` se muestra al lado el símbolo (o el nombre si
  no hay símbolo) de `orders.unit_id`; sin unidad (R42), la cifra sola.

## 7. Errores nuevos (amplían el catálogo cerrado, sin citar ninguna ficha)

| Código | Mensaje | Lo lanza |
|---|---|---|
| `order_without_distribution` | «El pedido no tiene ningún reparto: añade al menos una presentación antes de comenzar el empaque.» | `pedidos` (`startPackingAliveById`, R10) |
| `order_presentation_line_not_editable` | «El reparto de este pedido ya no se puede cambiar: el empaque ya comenzó o el pedido está cerrado.» | `pedidos` (`updateOrderPresentationLines`, R13, R48). **Cambia de significado en F1.4 (`[D3']`)**: antes era «pedido `ENTREGADO`/`CANCELADO`»; ahora es «empaque ya comenzado (`EN_EMPAQUE`) o pedido cerrado (`ENTREGADO`/`CANCELADO`)», y cubre también la unidad del pedido. El código aún no existe en `dev`, así que el cambio no rompe nada publicado. |
| `order_distribution_exceeds_quantity` | «El reparto pasa de la cantidad del pedido: quita envases o elige presentaciones más pequeñas.» | `pedidos` (`updateOrderPresentationLines`, `createOrder`, `updateOrder`; R36, R38) — **nuevo en F1.4 [Q3]** |
| `order_without_unit` | «El pedido no tiene unidad: asígnale una desde la edición del pedido antes de repartirlo.» | `pedidos` (`updateOrderPresentationLines`, R42) — **nuevo en F1.4 [Q4]**; ya **no** lo emite `transitionAliveById` (R44 retirado) |
| `presentation_without_content` | (ya existe, QC-150) — se reusa para R19 (línea en el DIAGNÓSTICO, nunca en el mensaje) y para R35 [Q2] | `pedidos` |
| `presentation_not_found` | (ya existe, QC-146) — se reusa cuando una línea nombra una presentación inexistente o ajena | `pedidos` |
| `incompatible_units` | (ya existe, QC-76) — se reusa para R7/R38 [Q4] | `pedidos` |
| `unit_not_found` | (ya existe, QC-76) — se reusa para la unidad del pedido inexistente o no visible (R41) [Q4] | `pedidos` |

`no_whole_package` (QC-150) **se retira del catálogo activo**: ya no hay ninguna operación que
pueda producir «la cantidad no llena ni un envase» (el humano ya no divide, elige envases enteros
directamente). Se decide DEJARLO en el catálogo (no borrarlo: `ERROR_CODES` es un array append-only
en la práctica del repo, y quitarlo bajaría el conteo que otra ficha en curso podría estar asumiendo)
pero sin ningún emisor: el test de cobertura de errores (`guard-catalogo-de-errores`, si exige que
todo código tenga al menos un emisor) es el primer sitio a mirar en T-implementación; si lo exige,
se retira del array en la misma tarea. `ERROR_CODES` pasa de **60 a 64** (cuatro altas, R28:
`order_without_distribution`, `order_presentation_line_not_editable`,
`order_distribution_exceeds_quantity`, `order_without_unit`); 63 si T17 retira `no_whole_package`.
Conteo actual (60) leído en `tests/unit/errores/catalogo.test.ts:46`.

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
  en la cabecera de ese `design.md` en la tarea de documentación (`tasks.md` T18), sin reescribirlo.
- **QC-35 / QC-35bis** (`specs/QC-35-pantalla-de-pedidos/requirements.md > Importes`, enmienda del
  2026-09-07): **derogada en la unidad** por [Q4] (§0.6). Nota fechada tras esa enmienda en T24.
  QC-123 (`design.md:327-333`, «lo que NO vuelve es la unidad del pedido») queda también superado en
  esa frase; la nota de T24 lo menciona.

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

4. **[Q3] Validar el total con una restricción de base de datos** (trigger sobre
   `order_presentation_lines` que sume y compare con `orders.quantity`). Descartada: la suma exige
   convertir unidades con los factores del catálogo de `unidades` (otro módulo) dentro de SQL,
   duplicando `convertQuantity`; y un trigger por fila vería estados intermedios del
   `DELETE`+`INSERT`. El bloqueo de fila de §2.2 bis da la misma garantía en el dominio.
5. **[D2'] Conservar la puerta del Empacador en solo lectura por permiso** (dejar el control de
   edición en la pantalla de empaque y mostrarlo solo a quien, además de `empaque.modificar`, tenga
   `pedidos.modificar`). Descartada: duplica en `asignaciones` una escritura que ya vive en `/pedidos`,
   obliga a mantener el contrato `OrderCatalog.updatePresentationLinesAliveById` y la dependencia
   `asignaciones → pedidos` de escritura para un caso que el humano quitó, y mezcla en una pantalla de
   ejecución una edición administrativa. El administrador que también empaca usa `/pedidos`.
6. **[D3'] Reabrir la edición general del pedido en `POR_EMPACAR` con campos deshabilitados** en vez
   de un formulario acotado. Descartada: exigiría abrir `ALLOWED.POR_EMPACAR` a «quedarse igual»
   (contradice QC-168 R32) y confiar en que el servidor ignore los campos deshabilitados; con un
   caso de uso y un esquema propios (solo `unitId` + `presentationLines`) ningún otro campo puede
   llegar ni por error.

## 11. Dependencias

Ninguna nueva. `convertQuantity` (QC-76) ya existe en el repo; no hace falta ninguna librería de
decimales (mismo criterio heredado de QC-90/QC-141/QC-150).

## 12. Trazabilidad (mapa completo en `progress/impl_QC-170-pedido-en-varias-presentaciones.md`)

Cada `R<n>` de `requirements.md` se prueba al menos una vez en unidad y, cuando toca una migración o
una transacción con inventario, también en integración; R33 es el único E2E. El implementer escribe
el mapa exacto `R<n> → test` al abrir la implementación; este diseño no lo repite para no
desincronizarse de los nombres reales de los casos.

## 13. Contraste con `dev` al implementar (T0, 2026-09-27)

Leído en el worktree `QC-170-pedido-en-varias-presentaciones` (`946b16ca`, al día con `origin/dev`
`0736e1ff`). **Sin divergencias que cambien ningún requisito ni ninguna task**: todo lo citado en
`design.md > 1` y en las tasks se confirma tal cual contra el código real.

| # | Lo que dice el diseño | Lo que hay en el worktree | Efecto |
|---|---|---|---|
| C1 | `orders_presentation_content_positive`, `orders_presentation_content_requires_presentation`, `orders_presentation_id_idx`, `orders_company_id_presentation_id_fkey` (§2.4 paso 3.2) | Confirmados tal cual: los dos `CHECK` nacen en `20260924190100_finished_products_and_content_copies/migration.sql:43,45`; el índice y la FK compuesta nacen en `20260922130000_orders_presentation/migration.sql:18,20`; ningún nombre cambió desde entonces | Ninguno; T3 puede citar estos cuatro nombres literalmente en el `DROP` |
| C2 | `transition-order.ts`, rama `to === 'POR_EMPACAR'` retira `finishedGoods` de las líneas 84-85 y 111-155 (§1, §4.4) | El archivo mide 170 líneas; el `if (to === 'POR_EMPACAR')` abre en la línea 81; la llamada a `scope.finishedGoods.receiveFromOrder` está en la línea 128 y el bloque de resultado en 141-155; el rango citado por el diseño sigue siendo correcto | Ninguno; T12 recorta ese mismo tramo |
| C3 | `PresentationRef` solo tiene `id`, `name`, `content`; no `unitId` (§3) | Confirmado (`lib/modules/inventario/domain/presentation-catalog.ts:5-10`): `{ id, name, content }` | Ninguno; T4 añade `unitId` tal como describe el diseño |
| C4 | Conteo de `ERROR_CODES` = 60 antes de las cuatro altas de R28 (§7) | `tests/unit/errores/catalogo.test.ts:46` afirma `expect(ERROR_CODES).toHaveLength(60)` | Ninguno; T17 sube el `toHaveLength` a 64 |
| C5 | `enum OrderStatus` no tiene `BLOQUEADO` todavía (QC-138 no ha entrado); `REPARTO_EDITABLE_STATUSES` no incluye ese valor (§4.2) | `db/schema.prisma:575-583`: `PENDIENTE, EN_CURSO, ENTREGADO, CANCELADO, POR_EMPACAR, EN_EMPAQUE`, sin `BLOQUEADO`. No hay ninguna referencia a `BLOQUEADO` en `order-transitions.ts` ni `order-classification.ts` | Ninguno; `REPARTO_EDITABLE_STATUSES` queda `['PENDIENTE', 'EN_CURSO', 'POR_EMPACAR']`, sin condicional para T0 futuro |
| C6 | La pantalla del Empacador vive en `app/(private)/asignacion/**` (T0 fija la ruta exacta, T15) | Es `app/(private)/asignacion/empaque/[id]/page.tsx` y `.../components/packing-order-screen.tsx`; ese subárbol también resuelve la ejecución en `order-execution-lines.tsx` | T15/T16/T22 citan esta ruta, no una genérica |
| C7 | `asignaciones` ya importa el barrel de `unidades` (relevante para si T15/T16 disparan `guard-arquitectura-modulos`, §«Guardias») | Ningún archivo bajo `lib/modules/asignaciones/**` importa `@/lib/modules/unidades` hoy | T15/T16 son quienes introducen esa importación por primera vez en `asignaciones`; la guardia se revisa en esas tasks, no antes |
