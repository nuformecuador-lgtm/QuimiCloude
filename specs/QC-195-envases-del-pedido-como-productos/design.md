# QC-195 — envases-del-pedido-como-productos · design.md

> Escrito por `spec_author` en F1.2 (2026-10-03), leído sobre el worktree
> `.worktrees/QC-195-envases-del-pedido-como-productos` (rama `feature/QC-195-…`, salida de `dev`
> en `555c62f6`). Las referencias `archivo:línea` son de esa punta; T0 las recontrasta. Explorado con
> el grafo (`search_graph`, `search_code`) y Grep/Read para SQL, specs y textos de UI. El MCP
> respondió en toda la sesión.
>
> Requisitos: `requirements.md` R1-R37. Decisiones cerradas del humano: D1-D7 (orden de la tabla).

## 0. Resumen

El reparto deja de nombrar **presentaciones** y pasa a nombrar **envases** (productos PACKAGING).
Cada envase lleva su presentación en `products.presentation_id` —la columna que hoy solo puede
usar FINISHED_PRODUCT— y cuenta su stock en envases. La línea del reparto gana
`packaging_product_id` y sigue copiando `presentation_id` y `presentation_content`, así que
`order-distribution.ts` y el alta de producto terminado no cambian `[D5]`. Los envases entran en la
**misma necesidad** (`ReservationRequirementLine[]`) que ya reservan las materias primas, con
`quantity = packages`: el todo-o-nada, el orden de lotes, el aviso y el `BLOQUEADO` salen del código
de QC-141/QC-138 sin duplicarlo `[D4]`. El costo de los envases se suma al importe con el mismo
promedio simple de D22 `[D7]`.

Lo único que cambia de forma de verdad es que **la edición acotada del reparto pasa a tocar la
reserva**: hoy `updateOrderPresentationLines` no la toca, y sus tests lo afirman (§8).

## 1. Decisiones pendientes de F1.4

Ninguna se ha decidido aquí. Cada una trae opciones, una **recomendada** y los requisitos que
dependen de ella. El resto del diseño está escrito con las recomendadas.

### 1.1 P1 — Unidad «envase» — **PENDIENTE DE DECISIÓN HUMANA (F1.4)**

Hoy no hay unidad de sistema para contar piezas: las cuatro sembradas son `ml`, `l`, `gr`, `kg`
(`db/migrations/20260903121404_units_catalog/migration.sql:116-120`). El stock en envases `[D2]`
necesita una, porque `planReservation` trata un producto sin unidad como insuficiente
(`lib/modules/inventario/domain/plan-reservation.ts:52-56`). Y el disparador
`product_batches_check_unit` exige que la unidad de la presentación del lote sea la del producto
(`db/migrations/20260918130000_product_unit_and_stored_stock/migration.sql:70-102`): un envase en
«envases» con lotes en una presentación en `ml` lo dispara.

| Opción | Qué es | A favor | En contra |
|---|---|---|---|
| **A (recomendada)** | Nueva unidad **de sistema** base, sin derivación (nombre y símbolo los fija el humano; propuesta: `unidad`, `u`). El envase lleva `unit_id` = esa unidad y su presentación en `products.presentation_id`. Sus **lotes no llevan presentación** (`presentation_id NULL`, como MACHINE desde `20260923140000`). | El disparador **no se toca**: con `presentation_id NULL` sale por `IF NOT FOUND THEN RETURN NEW` (línea 87). La unidad base sin familia hace imposible convertir envases a litros por error (`convertQuantity` lanza `IncompatibleUnitsError`). | El costeo actual descarta los lotes sin presentación (`product-catalog-prisma.ts:150`) y toma la unidad de la presentación del lote (`:127`): el costo de envases necesita su propia lectura (§3.3). Una empresa con una unidad propia del mismo nombre: hay que comprobar los índices de nombre por ámbito de `units_equivalence_and_scope` en T1. |
| B | Misma unidad nueva, pero los lotes **sí** llevan la presentación del producto, y el disparador se reescribe: para PACKAGING compara `batch.presentation_id = product.presentation_id` en vez de unidades. | El lote sigue diciendo en qué envase se compró. | Reescribe un disparador con dos guardias de migración encima (`qc121-alcance.test.ts:704-731`, `product-unit-and-stored-stock-migration.test.ts:257-278`) y obliga igual a cambiar el costeo, porque la unidad de la presentación (`ml`) no es la del stock (envases). |
| C | Sin unidad nueva: el envase usa la unidad de su presentación y el stock se guarda en esa unidad. | Cero migración de unidades. | Contradice `[D2]` (40 botellas apartarían 40 ml). Descartada salvo que el humano reabra D2. |

Requisitos que dependen: R6 (y la forma de R7, R15, R25).

### 1.2 P2 — Envases ya cargados con stock en l/kg — **PENDIENTE DE DECISIÓN HUMANA (F1.4)**

Hoy un PACKAGING no tiene `presentation_id` (lo prohíbe el CHECK) y su stock está en la unidad de
la presentación de sus lotes (`createWithFirstBatch`, `product-prisma.ts:650-659`). No sé cuántos
hay en producción: es un dato que no está en disco.

| Opción | Qué es | A favor | En contra |
|---|---|---|---|
| **A (recomendada)** | **Se quedan como legado.** La migración no los toca; no tienen presentación fija, así que el selector no los lista (R9) y sus lotes siguen como están. Para usar ese envase en un reparto se da de alta de nuevo como envase. La ficha de inventario los marca como «envase sin presentación fija». | No migra datos de inventario (mismo espíritu que «Lo que NO entra»). No inventa conversiones. | Conviven dos formas de PACKAGING. El CHECK tiene que admitir `PACKAGING` con `presentation_id NULL` (§2.1) y la obligatoriedad de R1 vive en la aplicación. Añadir un lote a un legado: hay que decidir si sigue el camino viejo (recomendado) o se bloquea. |
| B | **Se convierten** en la migración cuando es inequívoco: todos sus lotes en una sola presentación con contenido y `stock / contenido` entero → `presentation_id` = esa, `unit_id` = unidad envase, cada lote `stock := stock / contenido`, `unit_cost := unit_cost × contenido`. Los que no cumplan, abortan la migración con la lista. | Un solo modelo de envase tras la migración. | Toca stock, costo y el libro (`inventory_movements` tendría asientos en dos unidades para el mismo lote). Abortar con datos reales bloquea el despliegue. |
| C | La migración **aborta** si existe algún PACKAGING con lotes, y se dan de alta de nuevo a mano antes de desplegar. | Simple y explícito. | Trabajo manual del cliente antes del despliegue. |

Requisitos que dependen: R9 (válido con las tres), R6 («a partir de esta feature»).

### 1.3 P3 — Cuándo se consume el envase — **PENDIENTE DE DECISIÓN HUMANA (F1.4)**

| Opción | Qué es | A favor | En contra |
|---|---|---|---|
| a | Con las materias primas, al pasar a `POR_EMPACAR` (`transition-order.ts:68-91`). | Cero cambio en el consumo: `consumeForOrder` consume todo lo apartado del pedido (`reservation-prisma.ts:193-310`). | El reparto **sigue siendo editable en `POR_EMPACAR`** (`REPARTO_EDITABLE_STATUSES`, `update-order-presentation-lines.ts:34-39`). Editar el reparto después de consumir obligaría a consumir o devolver envases fuera del libro de reserva, un camino nuevo que nadie ha pedido. |
| **b (recomendada)** | Al **Terminar el empaque** (`createFinishPacking`, `order-packing.ts:166-233`), en la misma transacción que da de alta el producto terminado. | Es cuando el envase se llena de verdad. Mientras el reparto sea editable los envases siguen apartados, y editarlo es solo resincronizar la reserva (R24). | `consumeForOrder` tiene que aprender a consumir solo un subconjunto de productos (§3.2). Terminar gana un fallo nuevo (`insufficient_material`) que `asignaciones` tiene que mapear. |
| c | Al Comenzar el empaque (`POR_EMPACAR → EN_EMPAQUE`). | El reparto ya está fijo. | `createStartPacking` es hoy un `UPDATE` fuera de la unidad de trabajo (`order-packing.ts:58-64`); habría que meterlo dentro. Sin ventaja sobre b. |

Requisitos que dependen: R24, R25, R26. Con a, R25 y R26 se reescriben y R24 pasa a «consumir o
devolver la diferencia».

### 1.4 Decisiones que no salen de la acotación — **PENDIENTES DE DECISIÓN HUMANA (F1.4)**

| Id | Pregunta | Recomendación | Alternativa | Requisito |
|---|---|---|---|---|
| N1 | Permiso del selector de envases. Hoy el selector de presentaciones del pedido llama a `listPresentationsAction`, que exige `inventario.consultar` (`list-presentations.ts:43`). | Una acción nueva de `pedidos` que exige **`pedidos.modificar`**, el permiso del formulario donde vive. | Reutilizar `listProductsAction` con `inventario.consultar` (quien crea pedidos tendría que tener también ese permiso). | R8 |
| N2 | ¿El selector muestra el disponible y lista envases con disponible cero? | **Sí a las dos**: sin listarlos no se puede llegar al aviso y al `BLOQUEADO` de `[D4]`. | Ocultar los de cero (el aviso solo saltaría por carreras). | R10 |
| N3 | ¿La existencia de un envase es entera? | **Sí**, en alta y en ajuste: no hay medio envase. | Decimal como cualquier lote. | R7 |
| N4 | ¿Dónde se guarda el costo de los envases? | **En el mismo importe** (`orders.ingredients_cost`): la cotización es una sola cifra y el lote de producto terminado ya se costea con ella (`order-packing.ts:181-192`). | Columna propia `orders.packaging_cost` y la UI suma; obliga a tocar el costeo del lote de producto terminado y todas las lecturas del importe. | R27 |
| N5 | Editar un pedido antiguo **sin tocar su reparto** (solo cantidad o prioridad). El formulario reenvía siempre las líneas. | Una línea antigua que llega **igual** (misma presentación, mismos envases) se conserva como antigua; una nueva o cambiada exige envase. | Exigir sustituir todas las líneas antiguas en cualquier guardado. | R34, R35 |
| N6 | ¿Puede un reparto llevar dos envases con la misma presentación (dos modelos de botella de 500 ml)? | **No**: se conserva el índice único `(order_id, presentation_id)` (`20260927120000_order_presentation_lines/migration.sql:31-32`) y la identidad del producto terminado `(receta, presentación)` sigue siendo una por línea. | Permitirlo: índice único por `(order_id, packaging_product_id)` y dos líneas que dan de alta el mismo producto terminado. | R12 |
| N7 | Un PACKAGING sigue pudiendo ser **ingrediente de una receta** (solo se rechaza FINISHED_PRODUCT, `create-recipe.ts:58`). Con P1-A su unidad sería «envase» y el porcentaje de la receta no tiene sentido sobre ella. | **Fuera de alcance**: no se cambia aquí; se registra el riesgo y se propone una ficha aparte. `buildOrderRequirement` suma por producto, así que un mismo envase como ingrediente y en el reparto no se reserva dos veces por separado. | Prohibir PACKAGING como ingrediente en esta misma ficha. | — |
| N8 | Lote de producto terminado sin importe guardado: ¿su costo incluye los envases? | **Sí**, con la regla de R27 contando lo apartado del pedido. | Solo ingredientes, como hoy. | R31 |
| N9 | Falta de envase al editar un pedido `EN_CURSO` o `POR_EMPACAR`. | **Rechazar** con `insufficient_material`, igual que la edición completa de un `EN_CURSO` hoy (`update-order.ts:177-179`). `POR_EMPACAR → BLOQUEADO` no existe en la matriz. | Bloquear también: exigiría una transición nueva. | R18 |
| N10 | Alta de un envase con el nombre de otro envase vivo. Hoy el alta con homónimo **añade un lote** al existente (`create-product.ts:119-139`), buscando por nombre y unidad (`product-prisma.ts:324-349`). Con P1-A todos los envases comparten unidad. | Mismo camino que hoy (se añade lote al homónimo), y **R3** rechaza si la presentación pedida no es la suya. | Exigir nombre único entre envases y rechazar el homónimo con otro mensaje. | R3 |

## 2. Modelo de datos

Una migración escrita a mano, `db/migrations/<ts>_packaging_products_in_distribution/` con
`migration.sql` y `down.sql`, aplicada con `pnpm run db:migrate` (mismo patrón que
`20260924190100`). Identificadores en inglés ASCII.

### 2.1 `products`

- **CHECK `products_finished_identity_matches_type`**: `DROP` y `ADD` con **el mismo nombre** (así
  `inventario-constraints.int.test.ts:896-903`, que lista los nombres, no cambia) y cuerpo nuevo:

  ```sql
  CHECK (
    ("type" = 'FINISHED_PRODUCT') = ("recipe_id" IS NOT NULL)
    AND ("type" <> 'FINISHED_PRODUCT' OR "presentation_id" IS NOT NULL)
    AND ("type" IN ('FINISHED_PRODUCT', 'PACKAGING') OR "presentation_id" IS NULL)
  )
  ```

  R5 queda en la base. Con P2-A el PACKAGING puede tener `presentation_id NULL` (legado); la
  obligatoriedad de R1 vive en la aplicación (esquema zod del alta).
- **Clave candidata `products_company_id_id_key` UNIQUE `(company_id, id)`**, para la FK compuesta
  de §2.2. Hoy `products` no la tiene (grep sin resultados en `db/migrations`). Se declara también
  en `db/schema.prisma` (`@@unique([companyId, id], map: …)`), como `presentations_company_id_id_key`.
- **Inmutabilidad de la presentación de un PACKAGING (R2)**: en la aplicación, con un `UPDATE`
  condicional (`WHERE presentation_id IS NULL OR presentation_id = $nueva`) bajo el `FOR NO KEY
  UPDATE` del producto que ya toma `addBatchToAlive`. Sin disparador: ninguna ruta de la aplicación
  actualiza esa columna salvo el alta.
- **P1-A**: `INSERT` de la unidad de sistema (nombre y símbolo de F1.4), idempotente.

### 2.2 `order_presentation_lines`

- `packaging_product_id UUID NULL`. `NULL` = línea antigua `[D6]`. Sin `NOT NULL` ni relleno: R32.
- FK compuesta `order_presentation_lines_company_id_packaging_product_id_fkey`
  `(company_id, packaging_product_id) → products(company_id, id)` `ON DELETE RESTRICT ON UPDATE
  CASCADE`. Es drift para Prisma, como la de `presentation_id` (`schema.prisma:672-674`).
- Índice `order_presentation_lines_packaging_product_id_idx` (para el RESTRICT).
- Se **conserva** `order_presentation_lines_order_id_presentation_id_key` (N6). `presentation_id`
  y `presentation_content` siguen siendo `NOT NULL`/anulable como hoy: las copia el guardado desde
  la presentación del envase (R14).
- Que el producto sea PACKAGING no lo puede expresar una FK; lo garantiza la aplicación bajo la
  transacción del guardado (R11). No se añade disparador: la única escritura es
  `orders.create`/`updateAlive`/`updatePresentationLinesAlive` de `order-prisma.ts`.

### 2.3 RLS

Ninguna tabla nueva. Las dos tablas tocadas ya tienen RLS activada y forzada.

### 2.4 `down.sql`

Inverso exacto: quita FK, índice y columna de `order_presentation_lines`; quita la clave candidata;
vuelve a poner el CHECK con el cuerpo de `20260924190100:27-30`, lo que **falla** si ya existe un
PACKAGING con presentación — es intencional, igual que los `down.sql` de QC-170 que abortan con
datos nuevos. Con P1-A, la unidad de sistema solo se borra si nadie la usa.

## 3. Contratos

### 3.1 `inventario` → nuevo puerto público `PackagingCatalog`

En `lib/modules/inventario/domain/packaging-catalog.ts`, exportado por el barrel y cableado en
`lib/composition`. `pedidos` no toca `prisma.product` (`guard-arquitectura-modulos`).

```ts
export type PackagingRef = {
  readonly id: ProductId;
  readonly name: string;
  readonly presentationId: string;
  readonly presentationName: string;
  readonly content: string | null;   // contenido vigente de la presentación
  readonly unitId: string;           // unidad de la PRESENTACIÓN (para convertir, D5)
  readonly available: string;        // disponible en envases (N2)
};

export interface PackagingCatalog {
  /** Solo PACKAGING vivos, de la empresa y con presentación fija; el resto no viene. */
  findRefs(ids: readonly ProductId[], companyId: string, options?: { readonly excludeOrderId?: string }): Promise<readonly PackagingRef[]>;
  /** Para el selector (R8): filtra por unidades de presentación ya resueltas por quien llama
   *  (`compatibleUnitIds` del pedido), solo con contenido, paginado y con búsqueda por nombre. */
  listForDistribution(companyId: string, query: { readonly unitIds: readonly string[]; readonly search?: string; readonly page?: number }): Promise<{ readonly items: readonly PackagingRef[]; readonly hasMore: boolean }>;
  /** Lotes con disponible > 0 y costo de los envases pedidos (R27, R30). */
  findCostingBatches(ids: readonly ProductId[], companyId: string, options?: { readonly excludeOrderId?: string }): Promise<readonly { readonly productId: ProductId; readonly unitCost: string; readonly available: string }[]>;
}
```

Las tres consultas usan `productCompanyScope`/`batchCompanyScope` (guardia
`guard-ambito-empresa-inventario`) y el tipo vía `PRODUCT_TYPES.PACKAGING`, nunca el literal en el
SQL (`guard-tipos-de-producto`, que barre `lib/` y `app/`). El disponible sale de
`findReservedAndAvailableByBatch` (`reservation-prisma.ts:427`), el mismo agregado de siempre.

### 3.2 `inventario` → `MaterialReservations`

- `syncForOrder`: **sin cambio de firma**. Un envase entra como una línea más:
  `{ productId: packagingProductId, quantity: String(packages) }`. Ojo: `syncForOrder` libera lo
  apartado de cualquier producto que ya no esté en la necesidad (`reservation-prisma.ts:114-130`),
  así que **todo** llamador tiene que pasar la necesidad completa (§4.1) o liberaría los envases.
- `consumeForOrder` (P3-b): gana `productIds?: readonly ProductId[]`. Si llega, solo se consumen
  los lotes apartados de esos productos y el respaldo `fallbackRequirement` se filtra igual. Lo
  apartado de los demás productos queda intacto. Sin él, se comporta como hoy.

### 3.3 `pedidos` — dominio

| Pieza | Cambio |
|---|---|
| `order-requirement.ts` | `buildRequirement` pasa a `buildOrderRequirement({ recipeLines, quantity, packagingLines, phase })`. `phase: 'before_consumption'` (PENDIENTE, EN_CURSO, BLOQUEADO) = receta + envases; `'materials_consumed'` (POR_EMPACAR) = solo envases (R24). Suma por `productId` (N7). Única fuente de la necesidad. |
| `resolve-distribution.ts` | La entrada es `{ packagingProductId, packages }` o, solo para N5, `{ presentationId, packages }` de una línea antigua sin cambios. Resuelve el envase con `PackagingCatalog.findRefs`, rechaza R11/R12/R34, y construye el `DistributionLine` con la presentación del envase: `order-distribution.ts` **no cambia** `[D5]`. Devuelve también las `packagingLines` para la necesidad. |
| `order-presentation-availability.ts` | Misma resolución que arriba (comparte función con `resolve-distribution.ts` en vez de repetir la tercera copia que hay hoy). |
| `create-order.ts`, `update-order.ts`, `review-blocked-orders.ts` | La necesidad con `buildOrderRequirement`; el resto (aviso, `BLOQUEADO`, `EN_CURSO` rechaza) ya existe. `review-blocked-orders` lee las líneas del pedido bloqueado (R21). |
| `update-order-presentation-lines.ts` | Pasa de `OrderDistributionTransaction` a **`OrderUnitOfWork`** (necesita `reservations` y `recipes`). Entrada gana `confirmBlocked`. Resultado gana `'would_block'` e `'insufficient_material'`. PENDIENTE/BLOQUEADO con falta → aviso o `BLOQUEADO` (R17); EN_CURSO/POR_EMPACAR con falta → rechazo (R18); BLOQUEADO cubierto → PENDIENTE (R19). Fija `reserved_at` igual que `update-order.ts:191-195`. |
| `order-cost.ts` | Nueva función pura `calculatePackagingCost(lines, batches)`: por línea, `packages × promedio simple`; `null` si el disponible no cubre (R28) o no hay lote con costo. `calculateOrderCost = ingredientes + envases`, `null` si cualquiera es `null`; redondeo único a 4 decimales mitad arriba como D22 (`order-cost.ts:83-88`). |
| `resolve-ingredients-cost.ts` | `resolveOrderCost(..., packagingLines, { orderId })` lee también `PackagingCatalog.findCostingBatches` (R30). `resolveLotIngredientsCost` suma envases (N8). |
| `quote-order-cost.ts`, `order-input.ts:187-189` | `quoteOrderCostSchema` gana las líneas del reparto (R29). |
| `transition-order.ts:74-80` (P3-b) | `consumeForOrder({ …, productIds: productos de la receta })` (R26). |
| `order-packing.ts:171-223` (P3-b) | Antes de dar de alta el producto terminado, `consumeForOrder({ productIds: envases de las líneas, fallbackRequirement: envases })`; `insufficient` → lanza y Terminar devuelve `'insufficient_material'` (R25). Las líneas antiguas no aportan envases. |

Códigos de error: **ninguno nuevo**. Se reutilizan `product_not_found` (R11 envase inválido),
`incompatible_units`, `presentation_without_content`, `order_distribution_exceeds_quantity`,
`order_would_block`, `insufficient_material`, `action_not_allowed` (R2) e `invalid_input` (R1, R7,
R12). Si al implementar hace falta uno, entra en `lib/modules/errores` sin citar ficha
(`guard-catalogo-de-errores`).

### 3.4 Bordes (acciones)

- `pedidos`: `listDistributionPackagingAction({ unitId, search?, page? })` en
  `order-actions.ts`, con `pedidos.modificar` (N1). Resuelve `compatibleUnitIds` con
  `UnitCatalog.findRefsSharingBaseInCompany` y llama a `PackagingCatalog.listForDistribution`.
- `updateOrderDistributionAction` (`order-actions.ts:422`) acepta `confirmBlocked` y traduce los dos
  resultados nuevos.
- `inventario`: el esquema de alta de PACKAGING (`product-input.ts:221-228`) mueve `presentationId`
  del lote al producto (sigue llegando con el mismo nombre de campo), exige existencia entera (N3);
  el alta de lote sobre un PACKAGING no acepta otra presentación (R3).

## 4. Flujos

### 4.1 Guardar (alta, edición, «Reparto y unidad»)

1. Resolver unidad y envases (fuera o dentro de la transacción, como hoy en cada caso de uso).
2. `validateDistribution` sin cambios (R13).
3. Dentro de la unidad de trabajo: escribir pedido y líneas (con `packaging_product_id`,
   `presentation_id` y `presentation_content` copiados, R14); `buildOrderRequirement` con la fase
   del estado bloqueado; `syncForOrder`; tratar `insufficient` según el estado (R16-R19).
4. Importe calculado fuera de la transacción como hoy, y a `null` si queda `BLOQUEADO`.

### 4.2 Consumo (P3-b)

`EN_CURSO → POR_EMPACAR` consume solo receta; `POR_EMPACAR` permite editar el reparto y solo mueve
envases; Terminar consume envases y da de alta el producto terminado en la misma transacción.
Caducidad, cancelación y borrado ya liberan todo lo del pedido (`releaseForOrder` no filtra por
producto), así que R22 sale gratis; se cubre con test.

## 5. Interfaz

| Archivo | Cambio |
|---|---|
| `app/(private)/pedidos/components/order-distribution-field.tsx:302-308` | `PresentationSelect` → nuevo `PackagingSelect` (en `app/(private)/pedidos/components/`), alimentado por `listDistributionPackagingAction`; muestra nombre, presentación y disponible (R10). Título «Reparto en envases»; etiquetas de `LABELS` (`:53-70`) pasan de presentación a envase. Las líneas antiguas se pintan como hoy, marcadas como antiguas (R33, R35). |
| `app/(private)/pedidos/components/use-order-distribution-availability.ts`, `use-saved-line-contents.ts`, `order-form.tsx` | Las líneas llevan `packagingProductId`; la cotización (`use-order-cost-quote.ts`) se recalcula al cambiar el reparto (R29). |
| Diálogo «Reparto y unidad» | Misma confirmación de bloqueo que el formulario del pedido (R37). |
| `app/(private)/inventario/components/product-form.tsx:383-415` | Para Envase: presentación en el producto (obligatoria en el alta, fija después), existencia y ajuste «en envases», enteros. |
| `app/(private)/inventario/components/product-batches-panel.tsx` | Un lote de envase se pinta en envases y sin presentación propia. |
| `lib/modules/asignaciones/domain/order-distribution-view.ts:9-35` | Sin cambio obligatorio: sigue leyendo `presentationId`, que la línea conserva. |

## 6. Sitios afectados

| # | Archivo:línea | Qué hay hoy | Qué cambia | R |
|---|---|---|---|---|
| 1 | `db/migrations/20260924190100_finished_products_and_content_copies/migration.sql:27-30` | CHECK que prohíbe `presentation_id` fuera de FINISHED_PRODUCT | Lo reemplaza la migración nueva (§2.1) | R1, R5 |
| 2 | `db/migrations/20260918130000_product_unit_and_stored_stock/migration.sql:70-102` | `product_batches_check_unit` | P1-A: no se toca (lotes de envase sin presentación). P1-B: se reescribe | R6 |
| 3 | `db/migrations/20260927120000_order_presentation_lines/migration.sql:12-35` | Línea con `presentation_id` y único por presentación | Gana `packaging_product_id` (§2.2) | R14, R32 |
| 4 | `db/schema.prisma:279-302`, `:311-346`, `:676-695` | `Product`, `ProductBatch`, `OrderPresentationLine` | `@@unique([companyId, id])` en `Product`; `packagingProductId` en la línea; comentarios del modelo | R1, R14 |
| 5 | `lib/modules/inventario/domain/product-input.ts:146-153`, `:221-228` | `presentationId` en el lote de PACKAGING | Al producto; existencia entera | R1, R3, R7 |
| 6 | `lib/modules/inventario/domain/create-product.ts:103-139` | El lote declara la presentación; homónimo añade lote | Producto con presentación; homónimo con otra presentación rechaza | R1, R3, N10 |
| 7 | `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:324-349`, `:644-669` | Unidad del producto = unidad de la presentación del lote | PACKAGING: unidad envase (P1-A) y `presentation_id` en el producto | R1, R6 |
| 8 | `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts:138-158`, `:127` | Costeo solo con lotes con presentación | Sin cambio para ingredientes; el de envases va por `PackagingCatalog` | R27 |
| 9 | `lib/modules/inventario/domain/plan-reservation.ts:52-56` | Producto sin unidad = insuficiente | Sin cambio: el envase tiene unidad (P1-A) | R15 |
| 10 | `lib/modules/inventario/adapters/driven/persistence/reservation-prisma.ts:109-174`, `:193-310` | `syncForOrder` libera lo que no está en la necesidad; `consumeForOrder` consume todo | `consumeForOrder` con `productIds` (P3-b) | R20, R25, R26 |
| 11 | `lib/modules/pedidos/domain/order-requirement.ts:18-26` | Necesidad solo de receta | `buildOrderRequirement` con envases y fase | R15, R24 |
| 12 | `lib/modules/pedidos/domain/resolve-distribution.ts:25-86` | Resuelve presentaciones | Resuelve envases (+ antiguas sin cambios) | R11-R14, R34, R35 |
| 13 | `lib/modules/pedidos/domain/order-distribution.ts:13-19`, `:99-156` | Cálculo del reparto | **Sin cambio** | R13 |
| 14 | `lib/modules/pedidos/domain/update-order-presentation-lines.ts:34-176` | No toca la reserva | Unidad de trabajo, reserva y bloqueo | R15-R20, R24 |
| 15 | `lib/modules/pedidos/domain/order-presentation-availability.ts:35-89` | Resuelve presentaciones | Resuelve envases | R13 |
| 16 | `lib/modules/pedidos/domain/create-order.ts:125-168` | Necesidad de receta | Necesidad con envases | R15-R17 |
| 17 | `lib/modules/pedidos/domain/update-order.ts:113-195` | Ídem | Ídem | R15-R20 |
| 18 | `lib/modules/pedidos/domain/review-blocked-orders.ts:99-142` | Ídem | Lee el reparto del pedido | R21 |
| 19 | `lib/modules/pedidos/domain/transition-order.ts:68-91` | Consume todo lo apartado | Solo receta (P3-b) | R26 |
| 20 | `lib/modules/pedidos/domain/order-packing.ts:166-233` | Alta de producto terminado | Consume envases antes (P3-b) y costea con envases (N8) | R25, R31 |
| 21 | `lib/modules/pedidos/domain/order-cost.ts:175-227`, `resolve-ingredients-cost.ts:20-85` | Costo de ingredientes | + costo de envases | R27-R31 |
| 22 | `lib/modules/pedidos/domain/quote-order-cost.ts:50-58`, `order-input.ts:71-90`, `:187-204` | Cotización sin reparto; línea con `presentationId` | Cotización con reparto; línea con `packagingProductId` | R11, R29 |
| 23 | `lib/modules/pedidos/adapters/driving/order-actions.ts:373`, `:399`, `:422` | Acciones de cotización, disponible y reparto | Entradas nuevas; acción del selector | R8, R17, R37 |
| 24 | `lib/composition/index.ts:1184`, `:1247`, `:1260`, `:1267`, `:1329`, `:1513` | Cableado | `PackagingCatalog` y `OrderUnitOfWork` en el reparto | — |
| 25 | `lib/modules/asignaciones/domain/finish-packing.ts:41` | Mapea los resultados de Terminar | Mapea `'insufficient_material'` (P3-b) | R25 |
| 26 | `app/(private)/pedidos/components/order-distribution-field.tsx:6-9`, `:53-70`, `:142-177`, `:302-308` | Selector de presentaciones | Selector de envases | R8-R10, R36 |
| 27 | `app/(private)/pedidos/components/compatible-unit-ids.ts:10-20` | Familia de unidades en cliente | Se reutiliza tal cual | R8 |
| 28 | `app/(private)/inventario/components/product-form.tsx:125-164`, `:383-415` | Envase con presentación en el lote | En el producto, en envases | R1, R6, R7 |

## 7. Sin dependencias nuevas

Nada de lo de arriba necesita una librería que el repo no tenga: zod, Prisma y los componentes
compartidos ya están. `package.json` no cambia.

## 8. Guardias y tests que se pondrán en rojo

Previstos, no ejecutados (F1.2 no corre la suite). T0 los confirma y el implementer los ajusta
**contra los requisitos nuevos**, nunca para que pasen sin más.

| Test / guardia | Por qué se pone rojo | Qué hacer |
|---|---|---|
| `tests/unit/pedidos/update-order-presentation-lines.test.ts:327` («no toca quantity, receta ni reserva») | El reparto pasa a tocar la reserva (R15, R20) | Reescribir: sigue sin tocar cantidad ni receta; la reserva sí, con el motivo en el nombre del caso |
| `tests/unit/pedidos/update-order-presentation-lines.test.ts` (resto), `tests/integration/pedidos/qc170-distribution-concurrency.int.test.ts`, `qc170-distribution-company-scope.int.test.ts` | Transacción distinta y entrada con envase | Adaptar dobles (`tests/helpers/order-unit-of-work-double.ts`) |
| `tests/unit/pedidos/order-input.test.ts`, `order-actions-distribution.test.ts`, `order-actions.test.ts`, `create-order.test.ts`, `update-order.test.ts`, `order-presentation-availability.test.ts`, `quote-order-cost.test.ts`, `review-blocked-orders*.test.ts` | Línea con `packagingProductId`; necesidad con envases | Adaptar y añadir los casos R |
| `tests/unit/pedidos/transition-order.test.ts:206-260`, `order-packing.test.ts` | `consumeForOrder` con `productIds`; Terminar consume (P3-b) | Adaptar |
| `tests/unit/pedidos-ui/order-distribution-field.test.tsx`, `order-distribution-dialog.test.tsx`, `order-form.test.tsx`, `order-form-quote.test.tsx` | Selector y etiquetas | Adaptar |
| `tests/unit/inventario/product-input.test.ts` (6 casos PACKAGING) | `presentationId` al producto; existencia entera | Adaptar |
| `tests/integration/inventario/inventario-constraints.int.test.ts:896-903` | Lista exacta de CHECK de `products` | No cambia si se conserva el nombre (§2.1); vigilar la de índices si la hay |
| `tests/integration/pedidos/pedidos-constraints.int.test.ts:1326`, `order-content-copy.int.test.ts`, `finish-with-finished-goods.int.test.ts`, `tests/integration/inventario/finished-goods*.int.test.ts` | Inserciones de líneas sin envase siguen valiendo (columna anulable); Terminar consume envases | Revisar; añadir los de R25 |
| `tests/unit/pedidos/schema/pedidos-schema.test.ts:651` | Lee `db/schema.prisma`: columnas en `snake_case` | Debe seguir verde; si lista columnas exactas, se amplía |
| `tests/guards/guard-tipos-de-producto.test.ts` | Un `'PACKAGING'` literal en SQL crudo dentro de `lib/` | Usar `PRODUCT_TYPES.PACKAGING` |
| `tests/guards/guard-arquitectura-modulos.test.ts` | `pedidos` leyendo productos fuera del barrel | Solo por `PackagingCatalog` |
| `tests/guards/guard-ambito-empresa-inventario.test.ts`, `guard-ambito-empresa-pedidos.test.ts` | Consultas nuevas | Con `*CompanyScope` |
| `tests/guards/guard-autorizacion-por-permiso.test.ts`, `guard-doc-permisos.test.ts` | Acción nueva del selector | `requirePermission(actor, 'pedidos.modificar')` en el caso de uso |
| E2E: `pedido-en-varias-presentaciones.spec.ts`, `pedidos.spec.ts`, `pedido-bloqueado.spec.ts`, `empaque.spec.ts`, `producto-terminado.spec.ts`, `pedidos-cotizacion.spec.ts`, `reserva-de-material.spec.ts`, `aislamiento-pedidos.spec.ts` | Siembran y eligen presentaciones en el reparto | Sembrar envases; una E2E a la vez |

## 9. Alternativas descartadas

1. **Asociar el envase a su presentación por sus lotes** (sin columna en el producto). Es lo que hay
   hoy, y permite que un mismo envase tenga lotes en dos presentaciones: contradice `[D1]` y deja
   sin respuesta qué contenido usar en el cálculo `[D5]`.
2. **Un libro de reserva propio para envases** (`order_packaging_reservations`). Duplica el
   todo-o-nada, el orden de lotes, la caducidad, la cobertura y la liberación que
   `reservation_movements` ya resuelve; `[D4]` pide el mismo flujo, y dos libros pueden divergir.
3. **Seguir recibiendo `presentationId` y deducir el envase.** Varios envases pueden compartir
   presentación (N6 solo lo prohíbe dentro de un mismo reparto): la deducción es ambigua.
4. **Stock del envase en la unidad del contenido** y apartar `envases × contenido`. Contradice
   `[D2]` y mezcla la cantidad de producto con la cantidad de piezas.
5. **Que la edición acotada del reparto siga sin tocar la reserva** y los envases se aparten solo
   en la edición completa. El reparto se edita sobre todo por la vía acotada (hasta `POR_EMPACAR`):
   lo apartado quedaría desfasado del reparto real.
6. **Columna `packaging_cost` aparte** (N4, alternativa). Descartada en la recomendación porque
   obliga a tocar todas las lecturas del importe y el costeo del producto terminado para un dato
   que el humano pidió ver sumado.

## 10. Riesgos

- **Pedidos vivos con líneas antiguas en `POR_EMPACAR`/`EN_EMPAQUE`**: siguen sin envases
  apartados (R32); Terminar no consume nada por ellas. Es lo pedido en `[D6]`.
- **Carrera selector/guardado**: el disponible del selector es informativo; manda la reserva bajo
  `FOR NO KEY UPDATE` de `lockProductsAscending` (`reservation-prisma.ts:63-82`).
- **P2-A deja envases legados** con stock en litros conviviendo con los nuevos; la ficha de
  inventario tiene que distinguirlos para que nadie los confunda.
- **N7**: un envase usado como ingrediente con la unidad «envase» daría necesidades sin sentido.
  Fuera de alcance; propuesto como ficha aparte.
