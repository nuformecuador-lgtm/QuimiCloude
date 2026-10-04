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

## 1. Decisiones de F1.4

Las decidió el humano una a una el **2026-10-03**. Se conservan las opciones para que se vea qué se
descartó. Dos de ellas (**N1** y **N7**) van **contra** la recomendación de F1.2; el resto del
diseño ya está escrito con lo decidido. **P4** (§1.5), nacida al aplicar N7, decidida 2026-10-03: opción A.

### 1.1 P1 — Unidad «envase» — **Decidido 2026-10-03: A**, unidad `unidad`, símbolo `u`

Hoy no hay unidad de sistema para contar piezas: las cuatro sembradas son `ml`, `l`, `gr`, `kg`
(`db/migrations/20260903121404_units_catalog/migration.sql:116-120`). El stock en envases `[D2]`
necesita una, porque `planReservation` trata un producto sin unidad como insuficiente
(`lib/modules/inventario/domain/plan-reservation.ts:52-56`). Y el disparador
`product_batches_check_unit` exige que la unidad de la presentación del lote sea la del producto
(`db/migrations/20260918130000_product_unit_and_stored_stock/migration.sql:70-102`): un envase en
«envases» con lotes en una presentación en `ml` lo dispara.

| Opción | Qué es | A favor | En contra |
|---|---|---|---|
| **A (elegida)** | Nueva unidad **de sistema** base, sin derivación: `unidad`, símbolo `u`. El envase lleva `unit_id` = esa unidad y su presentación en `products.presentation_id`. Sus **lotes no llevan presentación** (`presentation_id NULL`, como MACHINE desde `20260923140000`). | El disparador **no se toca**: con `presentation_id NULL` sale por `IF NOT FOUND THEN RETURN NEW` (línea 87). La unidad base sin familia hace imposible convertir envases a litros por error (`convertQuantity` lanza `IncompatibleUnitsError`). | El costeo actual descarta los lotes sin presentación (`product-catalog-prisma.ts:150`) y toma la unidad de la presentación del lote (`:127`): el costo de envases necesita su propia lectura (§3.3). Una empresa con una unidad propia del mismo nombre: hay que comprobar los índices de nombre por ámbito de `units_equivalence_and_scope` en T1. |
| B | Misma unidad nueva, pero los lotes **sí** llevan la presentación del producto, y el disparador se reescribe: para PACKAGING compara `batch.presentation_id = product.presentation_id` en vez de unidades. | El lote sigue diciendo en qué envase se compró. | Reescribe un disparador con dos guardias de migración encima (`qc121-alcance.test.ts:704-731`, `product-unit-and-stored-stock-migration.test.ts:257-278`) y obliga igual a cambiar el costeo, porque la unidad de la presentación (`ml`) no es la del stock (envases). |
| C | Sin unidad nueva: el envase usa la unidad de su presentación y el stock se guarda en esa unidad. | Cero migración de unidades. | Contradice `[D2]` (40 botellas apartarían 40 ml). Descartada salvo que el humano reabra D2. |

Requisitos que dependen: R6 (y la forma de R7, R15, R25).

### 1.2 P2 — Envases ya cargados con stock en l/kg — **Decidido 2026-10-03: A** (legado)

Hoy un PACKAGING no tiene `presentation_id` (lo prohíbe el CHECK) y su stock está en la unidad de
la presentación de sus lotes (`createWithFirstBatch`, `product-prisma.ts:650-659`). No sé cuántos
hay en producción: es un dato que no está en disco.

| Opción | Qué es | A favor | En contra |
|---|---|---|---|
| **A (elegida)** | **Se quedan como legado.** La migración no los toca; no tienen presentación fija, así que el selector no los lista (R9) y sus lotes siguen como están. Para usar ese envase en un reparto se da de alta de nuevo como envase. La ficha de inventario los marca como «envase sin presentación fija». | No migra datos de inventario (mismo espíritu que «Lo que NO entra»). No inventa conversiones. | Conviven dos formas de PACKAGING. El CHECK tiene que admitir `PACKAGING` con `presentation_id NULL` (§2.1) y la obligatoriedad de R1 vive en la aplicación. Añadir un lote a un legado: hay que decidir si sigue el camino viejo (recomendado) o se bloquea. |
| B | **Se convierten** en la migración cuando es inequívoco: todos sus lotes en una sola presentación con contenido y `stock / contenido` entero → `presentation_id` = esa, `unit_id` = unidad envase, cada lote `stock := stock / contenido`, `unit_cost := unit_cost × contenido`. Los que no cumplan, abortan la migración con la lista. | Un solo modelo de envase tras la migración. | Toca stock, costo y el libro (`inventory_movements` tendría asientos en dos unidades para el mismo lote). Abortar con datos reales bloquea el despliegue. |
| C | La migración **aborta** si existe algún PACKAGING con lotes, y se dan de alta de nuevo a mano antes de desplegar. | Simple y explícito. | Trabajo manual del cliente antes del despliegue. |

Requisitos que dependen: R9 (válido con las tres), R6 («a partir de esta feature»).

### 1.3 P3 — Cuándo se consume el envase — **Decidido 2026-10-03: b** (al Terminar el empaque)

| Opción | Qué es | A favor | En contra |
|---|---|---|---|
| a | Con las materias primas, al pasar a `POR_EMPACAR` (`transition-order.ts:68-91`). | Cero cambio en el consumo: `consumeForOrder` consume todo lo apartado del pedido (`reservation-prisma.ts:193-310`). | El reparto **sigue siendo editable en `POR_EMPACAR`** (`REPARTO_EDITABLE_STATUSES`, `update-order-presentation-lines.ts:34-39`). Editar el reparto después de consumir obligaría a consumir o devolver envases fuera del libro de reserva, un camino nuevo que nadie ha pedido. |
| **b (elegida)** | Al **Terminar el empaque** (`createFinishPacking`, `order-packing.ts:166-233`), en la misma transacción que da de alta el producto terminado. | Es cuando el envase se llena de verdad. Mientras el reparto sea editable los envases siguen apartados, y editarlo es solo resincronizar la reserva (R24). | `consumeForOrder` tiene que aprender a consumir solo un subconjunto de productos (§3.2). Terminar gana un fallo nuevo (`insufficient_material`) que `asignaciones` tiene que mapear. |
| c | Al Comenzar el empaque (`POR_EMPACAR → EN_EMPAQUE`). | El reparto ya está fijo. | `createStartPacking` es hoy un `UPDATE` fuera de la unidad de trabajo (`order-packing.ts:58-64`); habría que meterlo dentro. Sin ventaja sobre b. |

Requisitos que dependen: R24, R25, R26.

### 1.4 Decisiones que no salen de la acotación — **Decidido 2026-10-03**

Elegida = la recomendación en todas salvo **N1** y **N7**, donde el humano eligió la alternativa
(columna «Decidido»).

| Id | Pregunta | Recomendación de F1.2 | Alternativa | Decidido | Requisito |
|---|---|---|---|---|---|
| N1 | Permiso del selector de envases. Hoy el selector de presentaciones del pedido llama a `listPresentationsAction`, que exige `inventario.consultar` (`list-presentations.ts:43`). | Una acción nueva de `pedidos` con `pedidos.modificar`. | Reutilizar `listProductsAction` con `inventario.consultar`. | **Alternativa.** Se reutiliza `listProductsAction`; quien reparte necesita también `inventario.consultar` (§3.4, R38). | R8, R38 |
| N2 | ¿El selector muestra el disponible y lista envases con disponible cero? | **Sí a las dos**: sin listarlos no se puede llegar al aviso y al `BLOQUEADO` de `[D4]`. | Ocultar los de cero (el aviso solo saltaría por carreras). | Recomendación. | R10 |
| N3 | ¿La existencia de un envase es entera? | **Sí**, en alta y en ajuste: no hay medio envase. | Decimal como cualquier lote. | Recomendación. | R7 |
| N4 | ¿Dónde se guarda el costo de los envases? | **En el mismo importe** (`orders.ingredients_cost`): la cotización es una sola cifra y el lote de producto terminado ya se costea con ella (`order-packing.ts:181-192`). | Columna propia `orders.packaging_cost` y la UI suma; obliga a tocar el costeo del lote de producto terminado y todas las lecturas del importe. | Recomendación. | R27 |
| N5 | Editar un pedido antiguo **sin tocar su reparto** (solo cantidad o prioridad). El formulario reenvía siempre las líneas. | Una línea antigua que llega **igual** (misma presentación, mismos envases) se conserva como antigua; una nueva o cambiada exige envase. | Exigir sustituir todas las líneas antiguas en cualquier guardado. | Recomendación. | R34, R35 |
| N6 | ¿Puede un reparto llevar dos envases con la misma presentación (dos modelos de botella de 500 ml)? | **No**: se conserva el índice único `(order_id, presentation_id)` (`20260927120000_order_presentation_lines/migration.sql:31-32`) y la identidad del producto terminado `(receta, presentación)` sigue siendo una por línea. | Permitirlo: índice único por `(order_id, packaging_product_id)` y dos líneas que dan de alta el mismo producto terminado. | Recomendación. | R12 |
| N7 | Un PACKAGING sigue pudiendo ser **ingrediente de una receta** (solo se rechaza FINISHED_PRODUCT, `create-recipe.ts:58`). Con P1-A su unidad sería `u` y el porcentaje de la receta no tiene sentido sobre ella. | Fuera de alcance, ficha aparte. | Prohibir PACKAGING como ingrediente en esta misma ficha. | **Alternativa.** Se prohíbe aquí, con `action_not_allowed`, en alta y edición de receta y de versión, y en la importación de fórmulas (§3.5, R39-R41). Las recetas que ya lo tienen: **P4**, decidida A (§1.5). `buildOrderRequirement` sigue sumando por producto, por si P4 conserva esas líneas. | R39-R41 |
| N8 | Lote de producto terminado sin importe guardado: ¿su costo incluye los envases? | **Sí**, con la regla de R27 contando lo apartado del pedido. | Solo ingredientes, como hoy. | Recomendación. | R31 |
| N9 | Falta de envase al editar un pedido `EN_CURSO` o `POR_EMPACAR`. | **Rechazar** con `insufficient_material`, igual que la edición completa de un `EN_CURSO` hoy (`update-order.ts:177-179`). `POR_EMPACAR → BLOQUEADO` no existe en la matriz. | Bloquear también: exigiría una transición nueva. | Recomendación. | R18 |
| N10 | Alta de un envase con el nombre de otro envase vivo. Hoy el alta con homónimo **añade un lote** al existente (`create-product.ts:119-139`), buscando por nombre y unidad (`product-prisma.ts:324-349`). Con P1-A todos los envases comparten unidad. | Mismo camino que hoy (se añade lote al homónimo), y **R3** rechaza si la presentación pedida no es la suya. | Exigir nombre único entre envases y rechazar el homónimo con otro mensaje. | Recomendación. | R3 |

### 1.5 P4 — Recetas que ya tienen un ingrediente PACKAGING — **Decidido 2026-10-03: A (se conservan)**

N7 prohíbe el envase como ingrediente **nuevo**, pero no dice qué pasa con las recetas que ya lo
tienen, y el código no lo resuelve de una sola forma:

- Editar una original o una versión valida **solo** las líneas que no tenía
  (`update-recipe.ts:91-106`, `update-recipe-version.ts:42-55`): una línea PACKAGING existente
  seguiría pasando.
- Crear una versión valida **todas** las líneas, también las copiadas de la original
  (`create-recipe-version.ts:42-56`): con R39 aplicado a las copiadas, una original con un envase
  dejaría de poder versionarse.
- Un pedido con esa receta reserva y costea el envase como ingrediente. Con P2-A el envase legado
  conserva su unidad en `l`/`kg` y la cuenta sigue siendo la de hoy; no hay forma de que un envase
  **nuevo** (en `u`) esté en una receta, porque R39-R41 lo impiden desde ya.

No sé cuántas recetas así hay: el dato no está en disco.

| Opción | Qué es | A favor | En contra |
|---|---|---|---|
| **A (recomendada)** | **Se conservan**, como hoy se conserva un ingrediente dado de baja: la edición no las rechaza, y crear una versión **copiando** las líneas tampoco (R39 se aplica solo a las líneas indicadas en la entrada; las copiadas pasan con la misma exención que la edición). Los pedidos con esa receta siguen funcionando. La ficha de la receta marca la línea como «envase como ingrediente». | No rompe recetas en uso ni migra datos. Coherente con P2-A y con la exención que ya existe para la edición. | Quedan recetas con un envase como ingrediente hasta que alguien las corrija a mano. |
| B | **Se conservan, pero la edición exige quitarlas**: cualquier guardado de una receta con una línea PACKAGING se rechaza hasta que se elimine. | Fuerza la limpieza al primer contacto. | Bloquea correcciones urgentes de una fórmula (cambiar un porcentaje) por un motivo ajeno. |
| C | **La migración aborta** si existe alguna línea de receta con un producto PACKAGING, y se corrigen a mano antes de desplegar. | Estado limpio garantizado. | Trabajo manual previo al despliegue; misma objeción que P2-C. |

Requisitos que dependen: R39 (alcance de «líneas indicadas») y un requisito nuevo que se escribirá
en F1.4 con la opción elegida. T0 no cierra hasta que P4 esté decidida.

### 1.6 Enmienda 1 (F2.1, 2026-10-03) — decidida por el humano

Cuatro preguntas que salieron al implementar, decididas una a una. No reabren nada de §1.1-§1.5.

| # | Pregunta | Decisión | Requisito | Task |
|---|---|---|---|---|
| E1 | Versión que copia de la original una línea PACKAGING | **Pasa si la original ya la tenía**; una línea PACKAGING que la original no tenía se rechaza con `action_not_allowed`. Misma exención que la edición (concreta P4-A). | R42 | T11 |
| E2 | Nombre del envase en las pantallas de `asignaciones` | `AssignedOrderPresentationLine` y `OrderDistributionLineView` ganan `packagingName: string \| null` (`null` en la línea antigua; la UI cae al nombre de la presentación). **Revierte** lo que §5 y §11.7 decían («`asignaciones` no cambia»). | R44 | T15 |
| E3 | Doble consumo si el envase del reparto es también ingrediente | Terminar consume de ese envase **solo lo que siga apartado**; si no queda nada (se consumió en `POR_EMPACAR` como ingrediente), no consume del disponible y no falla. | R43 | T10 |
| E4 | Texto de `insufficient_material` al Terminar | **El del catálogo, tal cual.** Sin mensaje propio ni código nuevo. | R25 | T10 |

**Lo que E3 cambia de lo escrito.** §3.3 decía que Terminar llama a
`consumeForOrder({ productIds: envases, fallbackRequirement: envases })`, y así está hecho
(`order-packing.ts:192-200`). Con nada apartado, `consumeForOrder` cae a `consumeWithoutReservation`
(`reservation-prisma.ts:208-210`) y **consume del disponible**: eso contradice R43. Se corrige así:
los envases que son también ingrediente de la receta del pedido salen del respaldo
(`fallbackRequirement`) de Terminar; para ellos solo cuenta lo apartado. Los envases que no son
ingrediente siguen como estaban (R25). Las líneas antiguas no aportan nada ni al `productIds` ni al
respaldo (R32).

**Alcance real de E3.** Con las reglas ya escritas, el caso no se alcanza desde la aplicación: un
envase que puede estar en un reparto tiene presentación fija y no puede ser ingrediente (R9, R11,
R39-R42), y un envase legado puede ser ingrediente pero no tiene presentación fija, porque el alta
con homónimo solo busca envases que ya la tienen (`findAlivePackagingByName`,
`product-prisma.ts:430-450`; `addBatchToAlive`, `:832-836`). R43 es una salvaguarda; su test siembra
el caso directamente en la base.

### 1.7 Enmienda 2 (F2.2, 2026-10-04) — B1 del review y decisión E5

**B1 (bloqueante del review, vuelta 1).** `update-order-presentation-lines.ts` sincroniza la reserva
pero no recalcula el importe. Solo lo pone a `null` cuando el pedido queda `BLOQUEADO`
(`update-order-presentation-lines.ts:171-172`), y sus dependencias no incluyen los catálogos de
costo. Desde N4 el importe incluye los envases, así que guardar el reparto por el diálogo deja el
importe viejo (rompe R27/R29) y un `BLOQUEADO → PENDIENTE` queda sin importe (rompe R19). Se corrige
con **R45-R47**:

| Estado al guardar | Resultado | Importe guardado | R |
|---|---|---|---|
| `PENDIENTE`, `EN_CURSO` | no queda `BLOQUEADO` | `resolveOrderCost(catalogs, receta, cantidad, envases del reparto nuevo, companyId, { orderId })`, el mismo cálculo que `quoteOrderCost` | R45 |
| `BLOQUEADO` | pasa a `PENDIENTE` | Ídem | R46 |
| `PENDIENTE`, `BLOQUEADO` | queda `BLOQUEADO` (con confirmación) | `null`, como hoy | R17 |
| `POR_EMPACAR` | — | parte de ingredientes guardada + `calculatePackagingCost(envases nuevos, lotes con { excludeOrderId })` | R47 (E5) |

Igual que la edición completa (`update-order.ts:113-121`), el importe se calcula **fuera** de la
transacción con `{ orderId }` y se escribe dentro con `setIngredientsCost` cuando el resultado no es
`BLOQUEADO`. `UpdateOrderPresentationLinesDeps` gana `recipes` y `products`, los mismos catálogos que
ya recibe `updateOrder`. El test «las dependencias declaradas son solo packaging, presentations,
units, unitOfWork y now» se reescribe contra R45.

**E5 (decisión del humano, 2026-10-04).** En `POR_EMPACAR` la receta ya se consumió, así que sus
ingredientes no tienen disponible que costear: el importe es **la parte de ingredientes ya guardada,
que se conserva, más el costo de los envases recalculado** con R27 (R47).

**P6 — Cómo se separa la parte de ingredientes — Decidido 2026-10-04: A (columna `orders.packaging_cost`).**

Lo que hay en el código:
- `orders.ingredients_cost` guarda un solo número: `calculateOrderCost(ingredientes, envases)`
  (`order-cost.ts:297-305`, `resolve-ingredients-cost.ts:118-130`), que es lo que N4 decidió.
- Nada guarda el desglose. Terminar usa el total guardado como costo del lote si no es `null`, y si
  lo es lo recalcula con `resolveLotCost` (R31, `order-packing.ts`).
- El costo de los envases depende de los lotes **de cada momento** (promedio de los que tienen
  disponible, R27, R30), así que el de hoy no tiene por qué ser el que se sumó al guardar.

| Opción | Qué es | A favor | En contra |
|---|---|---|---|
| **A (recomendada)** | **Columna nueva `orders.packaging_cost DECIMAL(14,4) NULL`** con la parte de envases del importe guardado. `ingredients_cost` sigue siendo el **total**, así que N4, Terminar, la ficha, el listado y la cotización no cambian. Toda escritura del importe (alta, edición, revisión de bloqueados, «Reparto y unidad», el `null` al bloquear) escribe las dos columnas a la vez. En `POR_EMPACAR`: `total nuevo = (ingredients_cost − packaging_cost) + envases recalculados`. La migración rellena `packaging_cost = 0` donde `ingredients_cost IS NOT NULL` y el pedido no tiene líneas con envase: es exacto, porque antes de esta feature el importe no incluía envases. CHECK: `packaging_cost` es `NULL` si y solo si `ingredients_cost` lo es. | Exacto. No cambia lo que se lee ni lo que decidió N4: solo añade el desglose. | Una columna y un CHECK más, y seis sitios de escritura que tienen que mantener las dos columnas iguales (el CHECK lo garantiza). La migración ya está mergeada en la rama, así que va en una migración nueva de esta misma ficha. |
| B | **Sin columna: restar el costo viejo de los envases recalculado con la misma regla.** `parte de ingredientes = ingredients_cost − calculatePackagingCost(envases viejos, lotes de hoy)`. | Sin migración. | **Inexacto.** Si cambiaron los lotes o sus costos, la resta no devuelve lo que se sumó: la parte de ingredientes deriva, e incluso puede salir negativa. Además, si hoy un envase viejo no tiene lote con costo, la resta es «sin importe» aunque el importe guardado no lo fuera. |
| C | **Cambiar N4: guardar las dos partes por separado** (`ingredients_cost` solo ingredientes y `packaging_cost` solo envases) y que quien lee las sume. | Nombres honestos. | Reabre N4 y obliga a cambiar todas las lecturas del importe (ficha, listado, cotización, Terminar, R31). Es lo que N4 descartó. |
| D | **Dejar sin importe** el pedido en `POR_EMPACAR` al cambiar el reparto. | Trivial. | Contradice E5. Solo se lista para completar; el review lo planteó como alternativa antes de E5. |

Hasta que el humano decida P6, T18 implementa R45 y R46 y deja el caso `POR_EMPACAR` (R47) para
después de la decisión. Con A, T18 incluye la migración, la columna en `db/schema.prisma` y la
escritura doble; con B, solo la resta en el caso de uso.

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
  /** Lotes con disponible > 0 y costo de los envases pedidos (R27, R30). */
  findCostingBatches(ids: readonly ProductId[], companyId: string, options?: { readonly excludeOrderId?: string }): Promise<readonly { readonly productId: ProductId; readonly unitCost: string; readonly available: string }[]>;
}
```

`PackagingCatalog` es solo para el **servidor** de `pedidos` (validar R11 y costear R27). El
**selector** no lo usa: por N1 va por `listProductsAction` (§3.4). Las dos consultas usan
`productCompanyScope`/`batchCompanyScope` (guardia
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
| `order-packing.ts:171-223` (P3-b) | Antes de dar de alta el producto terminado, `consumeForOrder({ productIds: envases de las líneas, fallbackRequirement: envases que no son ingrediente de la receta })`; `insufficient` → lanza y Terminar devuelve `'insufficient_material'` con el texto del catálogo (R25). Un envase que es también ingrediente solo consume lo que siga apartado (R43, Enmienda 1). Las líneas antiguas no aportan envases (R32). |

Códigos de error: **ninguno nuevo**. Se reutilizan `product_not_found` (R11 envase inválido),
`incompatible_units`, `presentation_without_content`, `order_distribution_exceeds_quantity`,
`order_would_block`, `insufficient_material`, `action_not_allowed` (R3, R39-R41) e `invalid_input`
(R1, R2, R7, R12, R34). El detalle por acción está en §11. Si al implementar hace falta uno, entra en `lib/modules/errores` sin citar ficha
(`guard-catalogo-de-errores`).

### 3.4 Bordes (acciones)

- **Selector de envases (N1, decidido 2026-10-03): sin acción nueva.** El selector llama a
  `listProductsAction` (`product-actions.ts:233`), que exige `inventario.consultar`
  (`list-products.ts:58`). Para que pueda servir a R8 cambia lo siguiente en `inventario`:
  - `PRODUCT_QUERYABLE` (`product-queryable.ts:20-29`) gana el filtro `presentationUnitId: 'select'`.
    Solo coincide con productos que tienen presentación fija **con contenido** cuya unidad está
    entre los valores; un producto sin presentación fija nunca coincide (R9). El comentario de la
    lista blanca que excluye `unitId` sigue valiendo: el filtro nuevo es sobre la presentación, no
    sobre la unidad del producto.
  - `ProductView` (`product-view.ts:37-66`) gana cuatro campos opcionales que rellena
    `listAliveProducts`: `presentationId`, `presentationName`, `presentationContent`,
    `presentationUnitId` (§11.2). `available` ya existe.
  - Quien llama pasa `type = [PACKAGING]` y `presentationUnitId = compatibleUnitIds` del pedido
    (`compatible-unit-ids.ts:10-20`, ya en el formulario).
  - **Consecuencia (R38):** quien tenga `pedidos.modificar` sin `inventario.consultar` recibe
    `unauthorized` del selector; la UI lo pinta como «falta el permiso de consultar inventario» y no
    ofrece envases. Hoy pasa lo mismo con el selector de presentaciones (`list-presentations.ts:43`),
    así que no es una regresión, pero queda dicho. Administrador, el único rol sembrado con
    `pedidos.modificar`, tiene los dos (`permissions.ts:221-244`).
- `createOrderAction`/`updateOrderAction` (`order-actions.ts:219`, `:237`): el `FormData` lleva las
  líneas con un campo repetido nuevo para el envase (§11.3).
- `updateOrderDistributionAction` (`order-actions.ts:422`) acepta `confirmBlocked` y traduce los dos
  resultados nuevos.
- `quoteOrderCostAction` (`order-actions.ts:373`) recibe además las líneas del reparto.
- `inventario`: el esquema de alta de PACKAGING (`product-input.ts:221-228`) mueve `presentationId`
  del lote al producto (sigue llegando con el mismo nombre de campo), exige existencia entera (N3);
  el alta de lote sobre un PACKAGING no acepta otra presentación (R3).
- `finishPackingAction` (`order-packing-actions.ts:67`) puede devolver `insufficient_material`
  (P3-b).

### 3.5 `recetas` y `documentos`: el envase no es ingrediente (N7, decidido 2026-10-03)

Mismo sitio y mismo error que hoy rechazan un producto terminado (`action_not_allowed`, sin código
nuevo):

| Caso de uso | Archivo:línea | Cambio |
|---|---|---|
| Alta de receta | `lib/modules/recetas/domain/create-recipe.ts:58-59` | Rechaza también `PRODUCT_TYPES.PACKAGING` (R39) |
| Alta de versión | `lib/modules/recetas/domain/create-recipe-version.ts:54-56` | Una línea PACKAGING pasa si la original ya la tenía y se rechaza si no (R39, R42, Enmienda 1) |
| Edición de receta | `lib/modules/recetas/domain/update-recipe.ts:104-105` | Ídem, solo líneas que la receta no tenía (R40) |
| Edición de versión | `lib/modules/recetas/domain/update-recipe-version.ts:52-54` | Ídem (R40) |
| Vista previa de importación | `lib/modules/documentos/domain/preview-formula-import.ts:94` | Los candidatos excluyen PACKAGING (R41) |
| Confirmación de importación | `lib/modules/documentos/domain/confirm-formula-import.ts:114`, `:138` | Rechaza y excluye PACKAGING (R41) |

La comprobación se escribe una vez como función del contrato de `inventario` (p. ej.
`isIngredientType(type)`, NEW) para que las seis llamadas no repitan la lista de tipos, y para que
`guard-tipos-de-producto` siga verde. Los selectores de ingredientes de la UI ya filtran por
`PRODUCT_TYPES.PRODUCT` y `MACHINE` (`app/(private)/produccion/formulas/nueva/page.tsx:48-56` y sus
hermanas), así que la UI no ofrece envases hoy: el cambio es de servidor.

## 4. Flujos

### 4.1 Guardar (alta, edición, «Reparto y unidad»)

1. Resolver unidad y envases (fuera o dentro de la transacción, como hoy en cada caso de uso).
2. `validateDistribution` sin cambios (R13).
3. Dentro de la unidad de trabajo: escribir pedido y líneas (con `packaging_product_id`,
   `presentation_id` y `presentation_content` copiados, R14); `buildOrderRequirement` con la fase
   del estado bloqueado; `syncForOrder`; tratar `insufficient` según el estado (R16-R19).
4. Importe calculado fuera de la transacción como hoy, y a `null` si queda `BLOQUEADO`. *(Enmienda 2:
   también en «Reparto y unidad», que no lo hacía; en `POR_EMPACAR` con la regla de R47, §1.7.)*

### 4.2 Consumo (P3-b)

`EN_CURSO → POR_EMPACAR` consume solo receta; `POR_EMPACAR` permite editar el reparto y solo mueve
envases; Terminar consume envases y da de alta el producto terminado en la misma transacción.
Terminar consume solo lo apartado de un envase que sea también ingrediente, sin caer al disponible
(R43, §1.6 E3); las líneas antiguas no consumen nada (R32). Caducidad, cancelación y borrado ya liberan todo lo del pedido (`releaseForOrder` no filtra por
producto), así que R22 sale gratis; se cubre con test.

## 5. Interfaz

| Archivo | Cambio |
|---|---|
| `app/(private)/pedidos/components/order-distribution-field.tsx:302-308` | `PresentationSelect` → nuevo `PackagingSelect` (en `app/(private)/pedidos/components/`), alimentado por `listProductsAction` con `type = [PACKAGING]` y `presentationUnitId = compatibleUnitIds` (N1); muestra nombre, presentación y disponible (R10); con `unauthorized` pinta el aviso de permiso de R38. Título «Reparto en envases»; etiquetas de `LABELS` (`:53-70`) pasan de presentación a envase. Las líneas antiguas se pintan como hoy, marcadas como antiguas (R33, R35). |
| `app/(private)/pedidos/components/use-order-distribution-availability.ts`, `use-saved-line-contents.ts`, `order-form.tsx` | Las líneas llevan `packagingProductId`; la cotización (`use-order-cost-quote.ts`) se recalcula al cambiar el reparto (R29). |
| Diálogo «Reparto y unidad» | Misma confirmación de bloqueo que el formulario del pedido (R37). |
| `app/(private)/inventario/components/product-form.tsx:383-415` | Para Envase: presentación en el producto (obligatoria en el alta, fija después), existencia y ajuste «en envases», enteros. |
| `app/(private)/inventario/components/product-batches-panel.tsx` | Un lote de envase se pinta en envases y sin presentación propia. |
| ~~`lib/modules/asignaciones/domain/order-distribution-view.ts:9-35` — sin cambio obligatorio~~ | **Revertido por la Enmienda 1 (E2):** ver las tres filas siguientes. |
| `lib/modules/pedidos/domain/order-catalog.ts:177-180` (`AssignedOrderPresentationLine`) | Gana `packagingName: string \| null` (R44). *(Enmienda 2, m2: no lo rellena el adaptador de `pedidos`, que no puede leer `products` por `guard-arquitectura-modulos`. Lo resuelve el **dominio**: `lib/modules/pedidos/domain/list-order-summaries.ts` lee las líneas por el puerto `lib/modules/pedidos/ports/order-summary-reader.ts` y pide los nombres a `PackagingCatalog` con `companyId`.)* |
| `lib/modules/asignaciones/domain/order-distribution-view.ts:9-35` (`OrderDistributionLineView`, `toDistributionLines`) | Gana `packagingName: string \| null`, copiado de la línea; llega a `compose-order-rows.ts:93` y `get-assigned-order-execution.ts:142` sin más cambios (R44). |
| `app/(private)/asignacion/empaque/[id]/components/packing-order-screen.tsx:69-70`, `app/(private)/asignacion/[id]/components/order-execution-screen.tsx:84`, `components/shared/order-distribution-label.tsx` | Pintan `packagingName ?? presentationName ?? MISSING_VALUE_MARK` (R44, R33). Las columnas de listados de `asignacion` usan `OrderDistributionLabel` y heredan el cambio. |

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
| 23 | `lib/modules/pedidos/adapters/driving/order-actions.ts:182-190`, `:373`, `:399`, `:422` | Lectura de líneas del `FormData`; cotización, disponible y reparto | Campo del envase; entradas nuevas; sin acción nueva (N1) | R11, R17, R29, R37 |
| 23b | `lib/modules/inventario/domain/product-queryable.ts:20-29`, `product-view.ts:37-66`, `list-products.ts:58` | Lista blanca y vista del listado de productos | Filtro `presentationUnitId`; cuatro campos de presentación en `ProductView` | R8, R9, R10, R38 |
| 23c | `lib/modules/recetas/domain/create-recipe.ts:58`, `create-recipe-version.ts:54`, `update-recipe.ts:104`, `update-recipe-version.ts:52`, `lib/modules/documentos/domain/preview-formula-import.ts:94`, `confirm-formula-import.ts:114`, `:138` | Rechazan solo FINISHED_PRODUCT como ingrediente | También PACKAGING (§3.5) | R39-R41 |
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
| `tests/guards/guard-contrato-listados.test.ts`, `tests/unit/shared/listas-blancas-listados.test.ts`, `tests/unit/inventario/list-query.test.ts`, `list-use-cases.test.ts`, `product-service.test.ts`, `product-list-params.test.ts`, `tests/integration/inventario/list-query-indexes.int.test.ts` | `PRODUCT_QUERYABLE` gana `presentationUnitId` | Ampliar la lista blanca esperada; índice si `list-query-indexes` lo exige |
| `tests/unit/recetas/*` (alta, edición y versiones), `tests/unit/documentos/*formula-import*` | Nuevo rechazo de PACKAGING | Añadir los casos R39-R41; los de FINISHED_PRODUCT siguen igual |
| E2E: `pedido-en-varias-presentaciones.spec.ts`, `pedidos.spec.ts`, `pedido-bloqueado.spec.ts`, `empaque.spec.ts`, `producto-terminado.spec.ts`, `pedidos-cotizacion.spec.ts`, `reserva-de-material.spec.ts`, `aislamiento-pedidos.spec.ts` | Siembran y eligen presentaciones en el reparto | Sembrar envases; una E2E a la vez |
| `tests/unit/inventario/module-contract.test.ts` *(Enmienda 2, m2)* | Afirmaba «`ProductView` sin presentación»; §3.4/§11.2 le añaden cuatro campos | Reescrito: exige exactamente esos cuatro, en compilación y en test (aceptado por el review) |
| `e2e/versiones-de-receta.spec.ts` *(Enmienda 2, m2)* | Siembra repartos y versiones de receta; le alcanzan el reparto en envases y R42 | Sembrar envases donde reparte |
| `tests/unit/pedidos/update-order-presentation-lines.test.ts` («las dependencias declaradas son solo packaging, presentations, units, unitOfWork y now») *(Enmienda 2, B1)* | Gana `recipes` y `products` para el importe | Reescribir contra R45 |

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
7. **Acción propia de `pedidos` para el selector con `pedidos.modificar`** (recomendación de F1.2
   para N1). Descartada por el humano el 2026-10-03: se reutiliza `listProductsAction` y se acepta
   que repartir exija `inventario.consultar` (R38).
8. **Dejar el envase como ingrediente posible y abrir otra ficha** (recomendación de F1.2 para N7).
   Descartada por el humano el 2026-10-03: se prohíbe en esta ficha (R39-R41).

## 10. Riesgos

- **Pedidos vivos con líneas antiguas en `POR_EMPACAR`/`EN_EMPAQUE`**: siguen sin envases
  apartados (R32); Terminar no consume nada por ellas. Es lo pedido en `[D6]`.
- **Carrera selector/guardado**: el disponible del selector es informativo; manda la reserva bajo
  `FOR NO KEY UPDATE` de `lockProductsAscending` (`reservation-prisma.ts:63-82`).
- **P2-A deja envases legados** con stock en litros conviviendo con los nuevos; la ficha de
  inventario tiene que distinguirlos para que nadie los confunda.
- **N7/P4**: los envases nuevos (en `u`) ya no pueden ser ingrediente (R39-R41). Las recetas que
  ya tengan un envase legado como ingrediente quedan a lo que se decida en P4 (§1.5).
- **N1**: un rol personalizado con `pedidos.modificar` y sin `inventario.consultar` deja de poder
  añadir líneas al reparto (R38). Lo tiene que saber quien administra roles.

## 11. Contrato front↔back

Es lo que `frontend_dev` puede dar por fijo desde la task **TC** (`tasks.md`), sin esperar al backend real. Los
nombres y tipos salen del código actual; lo que no existe todavía lleva **NEW**. Los literales de
tipo de producto se escriben siempre `PRODUCT_TYPES.PACKAGING` (`@/lib/modules/inventario`), nunca a
mano (`guard-tipos-de-producto`).

### 11.1 Convenciones comunes

- Toda acción devuelve `{ status: 'success', … } | ErrorState`. `ErrorState`
  (`lib/modules/errores/domain/error-state.ts:27-29`):

  ```ts
  type ErrorState =
    | { status: 'error'; code: Exclude<ErrorCode, 'unexpected'>; message: string }
    | { status: 'error'; code: 'unexpected'; message: string; reference: string };
  ```

  La UI decide por `code`, nunca por `message` (el texto sale del catálogo). `unexpected` puede salir
  de cualquier acción; no se repite abajo.
- Sin sesión, el actor es `null` y la respuesta es `unauthorized`, igual que sin el permiso.
- Decimales siempre como `string` (`docs/architecture.md > Anti-patrones`): cantidades, envases
  disponibles, costos.
- Las acciones de formulario (`createOrderAction`, `updateOrderAction`, `createProductAction`,
  `adjustBatchStockAction`) reciben `FormData` y se usan con `useActionState` y estado inicial
  `{ status: 'idle' }`. Las de consulta reciben un argumento tipado.

### 11.2 Selector de envases — `listProductsAction` (existente, con cambios)

```ts
// lib/modules/inventario/adapters/driving/product-actions.ts:233
export async function listProductsAction(query: unknown): Promise<ProductListResult>;

export type ProductListResult =
  | { status: 'success'; data: Page<ProductView> }
  | ErrorState;

// lib/modules/inventario/domain/page.ts:7
type Page<T> = { readonly items: readonly T[]; readonly total: number; readonly page: number;
                 readonly pageSize: number; readonly totalPages: number };

// lib/modules/inventario/domain/list-query.ts:54 (forma de `query`)
type ListQuery = { readonly page: number; readonly pageSize?: number; readonly sort: ListSort | null;
                   readonly filters: Readonly<Record<string, ListFilterValue>>; readonly search: string };
```

`ProductView` (`lib/modules/inventario/domain/product-view.ts:37-66`), con los campos NEW:

```ts
export type ProductView = {
  readonly id: string;
  readonly name: string;
  readonly imagePath: string | null;
  readonly stock: string;              // envases, en la unidad `u`, para un envase nuevo
  readonly unitId: string | null;      // id de la unidad de sistema `unidad` para un envase nuevo
  readonly qtyAlert: string | null;
  readonly type: ProductType;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly reserved?: string;
  readonly available?: string;         // lo que pinta el selector (R10)
  readonly presentationId?: string | null;       // NEW. null = sin presentación fija (legado, R9)
  readonly presentationName?: string | null;     // NEW
  readonly presentationContent?: string | null;  // NEW. contenido por envase, en su unidad
  readonly presentationUnitId?: string | null;   // NEW. unidad del contenido (para convertir, R13)
};
```

- **Filtro NEW** en `PRODUCT_QUERYABLE`: `presentationUnitId: 'select'`. Solo coincide con productos
  con presentación fija y con contenido cuya unidad está en `values`.
- **Permiso:** `inventario.consultar` (`list-products.ts:58`).
- **Errores:** `unauthorized` (sin `inventario.consultar` o sin sesión: la UI pinta el aviso de R38 y
  no lista nada); `invalid_input` (forma de `query` rota).
- **Ejemplo de llamada** (pedido en `l`; `compatibleUnitIds` = ids de `l` y `ml`):

  ```ts
  await listProductsAction({
    page: 1,
    pageSize: MAX_PAGE_SIZE,                // importado de '@/lib/shared/pagination'
    sort: null,
    search: 'botella',
    filters: {
      type: { kind: 'select', values: [PRODUCT_TYPES.PACKAGING] },
      presentationUnitId: { kind: 'select', values: compatibleUnitIds },   // NEW
    },
  });
  // -> { status: 'success', data: { items: [{ id: 'a1…', name: 'Botella PET 500 ml',
  //      presentationId: 'p5…', presentationName: '500 ml', presentationContent: '500.0000',
  //      presentationUnitId: '<ml>', available: '120.0000', stock: '150.0000', unitId: '<u>', … }],
  //      total: 1, page: 1, pageSize: 25, totalPages: 1 } }
  ```

### 11.3 Alta y edición del pedido con líneas de envase (existentes, con cambios)

```ts
// lib/modules/pedidos/adapters/driving/order-actions.ts:219, :237
export async function createOrderAction(prev: CreateOrderFormState, formData: FormData): Promise<CreateOrderFormState>;
export async function updateOrderAction(id: string, prev: OrderMutationFormState, formData: FormData): Promise<OrderMutationFormState>;

export type CreateOrderFormState =
  | { status: 'idle' } | { status: 'success'; id: string; numberText: string } | ErrorState;
export type OrderMutationFormState =
  | { status: 'idle' } | { status: 'success' } | ErrorState;
```

Campos del `FormData` (`order-actions.ts:182-207`). Las líneas viajan como **tres** listas
repetidas, unidas por posición; en cada posición va **uno solo** de los dos identificadores y el otro
como cadena vacía (`readPresentationLines` convierte la cadena vacía en ausencia antes del esquema,
**NEW**; con los dos o ninguno, `invalid_input`):

| Campo | Constante (exportada por `@/lib/modules/pedidos`) | Valor |
|---|---|---|
| `recipeId`, `quantity`, `priority`, `unitId`, `recipeVersionId` | — | Sin cambio |
| `presentationLines.packagingProductId` | `ORDER_DISTRIBUTION_PACKAGING_FIELD` **NEW** | id del envase (línea nueva o con envase) |
| `presentationLines.presentationId` | `ORDER_DISTRIBUTION_PRESENTATION_FIELD` | solo para una línea antigua que se conserva sin cambios (N5, R35) |
| `presentationLines.packages` | `ORDER_DISTRIBUTION_PACKAGES_FIELD` | entero positivo |
| `confirmBlocked` | — | `'true'` solo tras aceptar el aviso |

Esquema de una línea (`order-input.ts:70-73`, cambia a unión) **NEW**:

```ts
type PresentationLineInput =
  | { readonly packagingProductId: string; readonly packages: number }  // envase
  | { readonly presentationId: string; readonly packages: number };     // línea antigua sin cambios
```

- **Permiso:** `pedidos.modificar`.
- **Errores** (`code` y cuándo):

| `code` | Cuándo |
|---|---|
| `unauthorized` | Sin `pedidos.modificar` |
| `invalid_input` | Forma rota; el mismo envase dos veces o dos envases con la misma presentación (R12); una línea antigua que llega cambiada o que el pedido no tenía (R34) |
| `recipe_not_found`, `recipe_version_under_review` | Como hoy |
| `unit_not_found` | La unidad del pedido no es visible para la empresa |
| `product_not_found` | Un `packagingProductId` no existe, es de otra empresa, está dado de baja, no es PACKAGING o no tiene presentación fija (R11). Código existente; en `pedidos` nace la clase **NEW** que lo lleva |
| `incompatible_units` | La presentación del envase no comparte unidad base con el pedido (R11) |
| `presentation_without_content` | La presentación del envase no tiene contenido |
| `order_distribution_exceeds_quantity` | El reparto pasa de la cantidad (R13) |
| `order_would_block` | Falta disponible de un envase o de materia prima y `confirmBlocked` no es `'true'` (R17). La UI muestra la confirmación de QC-138 y reenvía con `confirmBlocked=true`; el pedido queda `BLOQUEADO` |
| `insufficient_material` | Solo edición: pedido `EN_CURSO` con falta (R18) |
| `order_not_found`, `invalid_transition` | Solo edición, como hoy |

Ejemplo (alta: 20 l repartidos en 40 botellas de 500 ml):

```
recipeId=7c1…  quantity=20  unitId=<l>  priority=MEDIA
presentationLines.packagingProductId=a1…   presentationLines.presentationId=   presentationLines.packages=40
```

### 11.4 Edición acotada «Reparto y unidad» — `updateOrderDistributionAction` (existente, con cambios)

```ts
// lib/modules/pedidos/adapters/driving/order-actions.ts:422
export async function updateOrderDistributionAction(id: string, input: unknown): Promise<OrderMutationFormState>;

// input (esquema `.strict()`, order-input.ts:213-218)
type UpdateOrderDistributionInput = {
  readonly unitId: string;
  readonly presentationLines: readonly PresentationLineInput[];   // unión de §11.3
  readonly confirmBlocked?: boolean;                              // NEW, por defecto false
};
```

- **Permiso:** `pedidos.modificar` (la comprueba la propia acción, `order-actions.ts:429`).
- **Errores:** los de §11.3 salvo `recipe_*`, más `order_presentation_line_not_editable` (estado
  fuera de `PENDIENTE`, `EN_CURSO`, `POR_EMPACAR`, `BLOQUEADO`), `order_without_unit`,
  `presentation_not_found` (línea antigua cuya presentación ya no existe), y ahora también
  `order_would_block` (pedido `PENDIENTE`/`BLOQUEADO`, R17) e `insufficient_material` (pedido
  `EN_CURSO`/`POR_EMPACAR`, R18). Ambos **NEW en esta acción**, códigos existentes.
- **Ejemplo:**

  ```ts
  await updateOrderDistributionAction(orderId, {
    unitId: '<l>',
    presentationLines: [{ packagingProductId: 'a1…', packages: 30 }, { packagingProductId: 'b2…', packages: 5 }],
    confirmBlocked: false,
  });
  // -> { status: 'error', code: 'order_would_block', message: '…' }   // falta envase
  ```

### 11.5 Disponible del reparto — `quoteOrderPresentationAvailabilityAction` (existente, con cambios)

```ts
// order-actions.ts:399
export async function quoteOrderPresentationAvailabilityAction(input: unknown): Promise<OrderPresentationAvailabilityResult>;
export type OrderPresentationAvailabilityResult =
  | { status: 'success'; data: OrderPresentationAvailability } | ErrorState;

// input: { quantity: string; unitId: string; presentationLines: PresentationLineInput[] }

// lib/modules/pedidos/domain/order-presentation-availability.ts:30-33 + order-distribution.ts:21-26
type OrderPresentationAvailability =
  | { kind: 'ok'; available: string }
  | { kind: 'without_unit' }
  | { kind: 'presentation_without_content'; presentationId: string }
  | { kind: 'incompatible_units'; presentationId: string }
  | { kind: 'exceeds_quantity'; available: string }
  | { kind: 'unit_not_found' }
  | { kind: 'presentation_not_found' }
  | { kind: 'packaging_not_found'; packagingProductId: string };   // NEW
```

`presentationId` en los fallos por línea es el de la presentación del envase; es único en el reparto
(N6), así que la UI marca la línea por él. **Permiso:** `pedidos.modificar`. **Errores:**
`unauthorized`, `invalid_input`.

### 11.6 Importe del pedido — `quoteOrderCostAction` (existente, con cambios)

```ts
// order-actions.ts:373
export async function quoteOrderCostAction(input: unknown): Promise<OrderCostQuoteResult>;
export type OrderCostQuoteResult = { status: 'success'; data: OrderCostQuote } | ErrorState;

// lib/modules/pedidos/domain/quote-order-cost.ts:21 — mismo campo; ahora incluye envases (N4)
export type OrderCostQuote = { readonly ingredientsCost: string | null };

// input (order-input.ts:187-189)
type QuoteOrderCostInput = {
  readonly recipeId: string;
  readonly quantity: string;
  readonly orderId?: string;                                        // solo edición
  readonly presentationLines?: readonly PresentationLineInput[];   // NEW; las antiguas no cuestan
};
```

`null` = sin importe (cualquier ingrediente o envase sin disponible suficiente, R28). La UI lo
recalcula al cambiar el reparto (R29). **Permiso:** `pedidos.modificar`. **Errores:**
`unauthorized`, `invalid_input`.

Ejemplo: `{ recipeId: '7c1…', quantity: '20', presentationLines: [{ packagingProductId: 'a1…', packages: 40 }] }`
→ `{ status: 'success', data: { ingredientsCost: '524.0000' } }` (500 de ingredientes + 24 de envases,
R27).

### 11.7 Vistas del pedido que pinta la UI

`OrderPresentationLineView` (`lib/modules/pedidos/domain/order-view.ts:41-46`), dentro de
`OrderView.presentationLines` (`getOrderAction`) y del listado:

```ts
export type OrderPresentationLineView = {
  readonly presentationId: string;
  readonly presentationName: string | null;
  readonly packages: number;
  readonly packagingProductId: string | null;   // NEW. null = línea antigua (R33)
  readonly packagingName: string | null;        // NEW. null en línea antigua o si no vuelve del catálogo
};
```

`OrderView.ingredientsCost` (`order-view.ts:146`) sigue siendo `string | null` e incluye envases.
`OrderView.status` puede ser `'BLOQUEADO'` como hoy.

~~Las vistas de `asignaciones` (`order-distribution-view.ts:9-14`) no cambian.~~ **Enmienda 1 (E2):**
cambian las dos siguientes, que alimentan la pantalla de empaque, la de ejecución y las columnas de
listado de `asignacion` (R44):

```ts
// lib/modules/pedidos/domain/order-catalog.ts:177
export type AssignedOrderPresentationLine = {
  readonly presentationId: string;
  readonly packages: number;
  readonly packagingName: string | null;   // NEW (Enmienda 1). null = línea antigua
};

// lib/modules/asignaciones/domain/order-distribution-view.ts:9
export type OrderDistributionLineView = {
  readonly presentationId: string;
  readonly presentationName: string | null;
  readonly packages: number;
  readonly packagingName: string | null;   // NEW (Enmienda 1). La UI pinta packagingName ?? presentationName
};
```

Tipo de cliente que ya existe y cambia (`app/(private)/pedidos/components/use-order-distribution-availability.ts:20-28`):

```ts
export type OrderDistributionLine = {
  readonly presentationId: string;
  readonly presentationName: string | null;
  readonly packages: string;
  readonly content: string | null;
  readonly unitId: string | null;
  readonly packagingProductId: string | null;   // NEW. null = línea antigua
  readonly packagingName: string | null;        // NEW
  readonly available: string | null;            // NEW. disponible en envases al elegirlo (R10)
};
```

### 11.8 Terminar el empaque — `finishPackingAction` (existente, con cambios)

```ts
// lib/modules/asignaciones/adapters/driving/order-packing-actions.ts:64-70
export type FinishPackingResult = { status: 'success' } | ErrorState;
export async function finishPackingAction(prev: FinishPackingResult, formData: FormData): Promise<FinishPackingResult>;
```

**Permiso:** `empaque.modificar` (`finish-packing.ts:49`). **Error NEW en esta acción:**
`insufficient_material` cuando no hay envases que consumir (R25), con el **texto del catálogo tal
cual** (Enmienda 1, E4). No salta por un envase que es también ingrediente y ya no tiene nada
apartado (R43). Los demás, como hoy.

### 11.9 Alta, lote y ajuste del envase en inventario (existentes, con cambios)

```ts
// lib/modules/inventario/adapters/driving/product-actions.ts:10-13, :157
export type CreateProductFormState =
  | { status: 'idle' } | { status: 'success'; id: string; lot?: string } | ErrorState;
export async function createProductAction(prev: CreateProductFormState, formData: FormData): Promise<CreateProductFormState>;

// lib/modules/inventario/adapters/driving/batch-actions.ts:15-18, :80
export type AdjustBatchStockFormState =
  | { status: 'idle' } | { status: 'success'; stock: string; reserved: string; overReserved: boolean } | ErrorState;
export async function adjustBatchStockAction(prev: AdjustBatchStockFormState, formData: FormData): Promise<AdjustBatchStockFormState>;
```

`FormData` del alta de envase (`product-actions.ts:121-139`): `name`, `type = PRODUCT_TYPES.PACKAGING`,
`presentationId` (**ahora del producto, obligatorio**, R1), `stock` (entero de envases, R7),
`unitCost` o `totalCost` (por envase), `lot?`, `purchaseDate?`, `qtyAlert`. Sin `expiryDate`, como
hoy. Añadir un lote a un envase existente es la misma acción por el camino del homónimo
(`create-product.ts:119-139`): se manda el mismo `name` y la misma `presentationId`.

Ajuste: `batchId`, `delta` (entero con signo, para un envase), `reason`.

- **Permiso:** `inventario.modificar` (`create-product.ts:89`, `adjust-batch-stock.ts:64`).
- **Errores:**

| `code` | Cuándo |
|---|---|
| `unauthorized` | Sin `inventario.modificar` |
| `invalid_input` | Envase sin presentación (R1); existencia o `delta` no enteros (R7); costo ausente; `presentationId` de otra empresa; intentar cambiar la presentación por `updateProductAction`, que no acepta ese campo (R2) |
| `action_not_allowed` | Lote sobre un envase homónimo con otra presentación (R3); homónimo producto terminado, como hoy |
| `batch_duplicate_lot`, `product_not_found` | Como hoy |
| `batch_not_found`, `batch_stock_negative` | Ajuste, como hoy |

`ProductBatchView` (`product-batch-view.ts:1-18`): para un lote de envase, `unitId` es `null` (el lote
no lleva presentación, P1-A); la UI toma la unidad del producto (`ProductView.unitId`, la de `u`) y
la presentación de `ProductView.presentationName`. Sin campos nuevos.

### 11.10 Recetas e importación: rechazo del envase como ingrediente (existentes, comportamiento nuevo)

```ts
// lib/modules/recetas/adapters/driving/recipe-actions.ts:144, :161, :223, :243
export async function createRecipeAction(input: unknown): Promise<CreateRecipeFormState>;
export async function updateRecipeAction(id: string, input: unknown): Promise<UpdateRecipeFormState>;
export async function createRecipeVersionAction(originalId: string, input: unknown): Promise<CreateRecipeVersionFormState>;
export async function updateRecipeVersionAction(versionId: string, input: unknown): Promise<UpdateRecipeVersionFormState>;
// lib/modules/documentos/adapters/driving/formula-import-actions.ts:57, :75
export async function previewFormulaImportAction(input: unknown): Promise<PreviewFormulaImportResult>;
export async function confirmFormulaImportAction(input: unknown): Promise<ConfirmFormulaImportResult>;
```

Las líneas son `{ productId: string; percentage: string }` (`recipe-input.ts:34-39`), sin cambio de
forma.

- **Permiso:** `recetas.modificar` (las seis; la importación por `FORMULA_IMPORT_PERMISSION`).
- **Error NEW de comportamiento:** `action_not_allowed` cuando una línea indicada (alta) o nueva
  (edición) nombra un PACKAGING (R39, R40), o la confirmación de importación lo nombra (R41). Mismo
  código que ya devuelve con un producto terminado; la UI no tiene que distinguirlos. La vista previa
  simplemente no propone envases como emparejamiento.
- **Ejemplo:** `createRecipeAction({ name: 'Jabón', description: null, steps: [], lines: [{ productId: '<envase>', percentage: '100' }] })`
  → `{ status: 'error', code: 'action_not_allowed', message: '…' }`.
- La UI de recetas no cambia: sus selectores ya piden solo `PRODUCT` y `MACHINE`.
