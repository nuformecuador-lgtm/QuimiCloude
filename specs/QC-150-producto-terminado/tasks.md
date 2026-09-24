# QC-150 — producto-terminado · tasks.md

> **Enmendado el 2026-09-23 con las respuestas de F1.4** (D11-D19 de `requirements.md`). Se
> desbloquean las tasks que esperaban a las preguntas 1-7. **T3 se cancela** (D16: no se bloquea el
> contenido). **T9 se reescribe como requisito negativo** (D15). **Nace T14** (copia del contenido en
> el pedido).
>
> **Spec aprobado el 2026-09-23** con las preguntas 8 y 9 cerradas (D20, D21): se desbloquean las
> ramas del pedido sin copia (T7) y del recálculo del coste (T8), y se retira el parche provisional
> de T8. No queda ninguna rama condicionada.
>
> Orden de arriba abajo salvo donde se marque `[P]` (paralelizable con la task indicada). Cada task
> dice **qué archivos toca** y su **criterio de hecho**. Nada se da por hecho sin gate
> (`CLAUDE.md`, regla 5): `./init.sh --rapido` al cerrar cada task, `./init.sh` completo al cerrar la
> feature y antes del PR.
>
> **Ninguna task empieza antes de que QC-141 esté mergeada en `dev`** (`depends_on`).
>
> **Base de datos**: toda migración, test de integración y E2E de esta ficha corre contra su **base
> propia `QuimiCloude_QC150`**, con la variable de entorno del proceso apuntando a ella. El `.env`
> del worktree no basta (`progress/history.md`). **Nunca** contra la compartida de `.env`
> (`QuimiCloude`): la primera tanda de QC-147 la migró por error y su `down.sql` no devolvía los
> datos. Tras cada merge de `origin/dev`, se migra la base propia antes de correr el gate.
>
> Los comentarios de producción **no citan fichas ni requisitos** (`docs/conventions.md >
> Comentarios`); `R<n>` sí va en el **nombre de los tests**.

---

## [x] T0 — Partir de `dev` con QC-141 dentro `[bloqueante]`

Archivos: los que traiga el merge; `specs/QC-150-producto-terminado/design.md` si algo cambió.

- `git merge origin/dev` en el worktree, con QC-141 ya mergeada.
- Crear `QuimiCloude_QC150` (receta de `docs/verification.md`; si `db:seed` falla, copiar la
  plantilla como hizo QC-81 según `progress/history.md`), aplicar `pnpm run db:migrate` y regenerar
  la plantilla de integración de la rama.
- Contrastar con `dev` lo que `design.md` cita de QC-141 **leído en su rama**:
  - el nombre de las restricciones de `inventory_movements`;
  - la forma de `OrderTransactionScope`, `OrderWriteRepository` (`create`, `updateAlive`,
    `lockAliveById`), `createTransitionOrder` y sus resultados;
  - la rama `ENTREGADO` de `update-order.ts`;
  - `consumeBatchStock`, `recalculateProductStock` en SQL, `deriveUnitCost` decimal y
    `decimal-quantity.ts`;
  - la última migración de `dev`.

**Hecho cuando:** merge commiteado sin marcadores; `./init.sh --rapido` verde contra
`QuimiCloude_QC150`; cada divergencia con `design.md` anotada y corregida en el diseño (o subida al
leader si cambia un requisito).

## [x] T1 — Migración: valores de enum `[depende de T0]`

Archivos: `db/migrations/<ts>_finished_product_enum_values/{migration.sql,down.sql}`,
`db/schema.prisma` (enums), `tests/unit/inventario/schema/finished-product-enum-values-migration.test.ts`.

- Los dos `ADD VALUE` al final, solos (`design.md > 3.1`). `down.sql` con guarda.

**Hecho cuando:** `db:migrate` y `db:rollback` funcionan sobre `QuimiCloude_QC150`; el test comprueba
el orden de los dos enums (R1) y la guarda del `down.sql` (R36).

## [x] T2 — Migración: contenido, copias, identidad y libro `[depende de T1]`

Archivos: `db/migrations/<ts+1>_finished_products_and_content_copies/{migration.sql,down.sql}`,
`db/schema.prisma` (`Presentation.content`, `Product.recipeId`/`presentationId`,
`Order.presentationContent`, `ProductBatch.packageContent`), `tests/unit/{inventario,pedidos}/schema/*`.

- Todo `design.md > 2.2-2.6` y `> 3.2`. Escrita a mano; aplicada con `db:migrate`.

**Hecho cuando:** migra y revierte sobre `QuimiCloude_QC150`. Los tests de esquema cubren:

- R6: tipo y `CHECK` del contenido.
- R9: columnas anulables, sin `DEFAULT` y sin `UPDATE`.
- R21: índice único parcial por pedido.
- R34: nombres en inglés.
- R36: la guarda del `down.sql`.
- Los `CHECK` de `orders.presentation_content` (`> 0` y sin copia sin presentación) y de
  `product_batches.package_content`.

`guard-empresa-en-esquema`, `guard-rls-force` y `guard-arquitectura-modulos` siguen verdes.

## ~~T3 — Disparador del contenido bloqueado~~ — **Cancelada el 2026-09-23 (D16)**

El humano eligió copiar el contenido en vez de bloquearlo. Sin código. Su lugar lo ocupan la
columna de T2 y T14.

## [x] T4 — Contenido de la presentación en el dominio y la pantalla `[depende de T2]` `[P con T5]`

Archivos: `lib/modules/inventario/domain/{presentation-input,presentation-view,presentation-catalog}.ts`,
`.../adapters/driven/persistence/{presentation-prisma,presentation-catalog-prisma}.ts`,
`.../adapters/driving/presentation-actions.ts`,
`app/(private)/configuracion/presentaciones/components/{presentation-form,presentation-columns}.tsx`.

- `content` opcional y anulable (`design.md > 4.2`); `PresentationRef.content` para `pedidos`.

**Hecho cuando:** hay tests verdes para:

- R6: se guarda y se vacía.
- R7: se rechazan cero, negativo, cinco decimales, once enteros, `1e3` y `1,5`.
- R8: el formulario lo edita y la columna pinta «Sin contenido».
- R40: cambiar el contenido se acepta aunque la presentación tenga pedidos o lotes.
- `findRefs` devuelve `content`.

## [x] T5 — Cálculos puros `[depende de T0]` `[P con T1-T4]`

Archivos: `lib/modules/inventario/domain/finished-goods.ts` (nuevo), `lib/modules/inventario/index.ts`,
`lib/modules/pedidos/domain/{order-cost,resolve-ingredients-cost}.ts`,
`tests/unit/inventario/finished-goods.test.ts`, `tests/unit/pedidos/order-cost.test.ts`.

- `planFinishedGoods` (`design.md > 4.1`) con la unidad de D11 y el divisor de D12.
- `calculateLotIngredientsCost` y `resolveLotIngredientsCost` (D13), sin tocar
  `calculateIngredientsCost`.

**Hecho cuando:** tests verdes y sin base de datos para:

- R12: `50.5/1`, `10/3` y `50/0.75`.
- R14: redondeo mitad arriba y divisor igual a la cantidad que entra.
- R19: `0.5/1`.
- R41: el plan devuelve el contenido usado.
- R42: un ingrediente sin coste cuenta cero; ninguno con coste da `0.0000`; receta vacía da
  `0.0000`.
- R43: los casos de `calculateIngredientsCost` existentes, sin cambios.

Además, ninguno de los dos archivos contiene `Number(`, `parseFloat` ni `toFixed` sobre cantidades.

## [x] T6 — Tipo de producto: alta, edición, listado y catálogo de errores `[depende de T1]` `[P con T4, T5]`

Archivos: `lib/modules/inventario/domain/{product-queryable,product-input,product-batch-input,update-product,product-catalog,product-view,errors}.ts`,
`.../ports/product-repository.ts`, `.../persistence/{product-prisma,product-catalog-prisma}.ts`,
`lib/modules/inventario/index.ts`, `lib/modules/errores/domain/{error-codes,error-catalog}.ts`,
`app/(private)/inventario/components/{product-type-tabs,product-form}.tsx`.

- `PRODUCT_TYPE_VALUES` con cuatro valores y `MANUAL_PRODUCT_TYPE_VALUES` con tres;
  `ProductRef.type`.
- R4 con `ActionNotAllowedError`.
- Códigos `presentation_without_content` y `no_whole_package` (aprobados, D19), con su línea en la
  cabecera de enmiendas de `error-codes.ts`.

**Hecho cuando:** hay tests verdes para:

- R2: el alta con `FINISHED_PRODUCT` da `invalid_input` y no escribe nada.
- R3: el formulario no ofrece la opción, y en un producto terminado muestra el tipo de solo lectura.
- R4: los dos sentidos, en unit y en integración contra la base propia.
- R5: la pestaña y el filtro.

`guard-catalogo-de-errores` sigue verde, y los contratos de módulo que fijan `ProductRef` quedan
actualizados como ampliación nombrada.

## [x] T14 — Copia del contenido en el pedido `[depende de T2, T4]` `[P con T5-T7]` (nueva, 2026-09-23)

Archivos: `lib/modules/pedidos/domain/{order-view,create-order,update-order}.ts`,
`lib/modules/pedidos/ports/order-write-repository.ts` y su adaptador Prisma (el de QC-141),
`lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` (lectura de `OrderRow`), tests.

- `design.md > 4.5`.

**Hecho cuando:** unit e integración verdes contra la base propia para:

- R38: el alta copia el contenido, y no copia nada si la presentación no lo tiene.
- R39: cambiar la presentación recopia; editar cantidad, prioridad o receta no toca la copia.
- R40: cambiar el contenido de la presentación no modifica pedidos.

`guard-ambito-empresa-pedidos` sigue verde.

## [x] T7 — La escritura del producto terminado `[depende de T2, T5, T6]`

Archivos: `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
(`receiveFinishedGoods`), `.../persistence/finished-goods-prisma.ts` (nuevo),
`.../persistence/batch-movement-prisma.ts` (`kind: 'production'`),
`lib/modules/inventario/domain/{inventory-movement,product-batch-view}.ts`,
`tests/guards/guard-libro-de-inventario.test.ts` (cinco caminos),
`tests/unit/inventario/finished-goods-prisma.test.ts`,
`tests/integration/inventario/finished-goods.int.test.ts`.

- Los pasos 1-7 de `design.md > 4.4`, con el orden de bloqueos escrito ahí.
- **Pedido sin copia (D20)**: se usa el contenido vigente de la presentación, leído en el paso 1
  bajo `FOR SHARE`; si tampoco lo tiene, `presentation_without_content`.
- Medir el largo máximo de `recipeNameSchema` + « · » + 60 frente a los 120 de `productNameSchema`, y
  anotarlo en la bitácora. Si lo supera, parar y subirlo al leader.

**Hecho cuando:** integración verde contra `QuimiCloude_QC150` para:

- R11: el producto nace con tipo, nombre, unidad y combinación, y un segundo pedido lo reutiliza.
- R13 y R16.
- R17.
- R21: la base rechaza una segunda llamada con el mismo pedido.
- R22: con dos conexiones reales, un producto y dos lotes.
- R23 y R35.
- R41: el lote guarda el contenido usado.
- R43: ningún lote queda sin `unit_cost`.
- R44: un pedido sin copia usa el contenido vigente, y sin copia ni contenido se rechaza.

El censo de la guardia del libro pasa con `receiveFinishedGoods` y se pone rojo con un camino
fabricado sin asiento.

## [x] T8 — Engancharlo al Finalizar `[depende de T7, T14]`

Archivos: `lib/modules/pedidos/ports/order-unit-of-work.ts`,
`lib/modules/pedidos/domain/{transition-order,order-catalog,errors}.ts`,
`.../persistence/order-unit-of-work-prisma.ts` (reintento por número de lote),
`lib/modules/asignaciones/domain/{finish-assigned-order,start-assigned-order,errors}.ts`,
`lib/modules/asignaciones/adapters/driving/order-execution-actions.ts`,
`app/(private)/asignacion/components/assigned-order-delivered-notice.tsx`,
`app/(private)/asignacion/[id]/components/order-execution-screen.tsx`, `lib/composition/index.ts`.

- Los pasos 1-7 de `design.md > 4.3`.
- **Coste del lote (D21)**: el `ingredients_cost` guardado si no es nulo; si es nulo,
  `resolveLotIngredientsCost` al Finalizar, **antes** de `consumeForOrder`, con el ingrediente sin
  coste como cero. El importe guardado del pedido no se toca (R43).

**Hecho cuando:** hay tests verdes para:

- Unit con dobles que registran el orden: sin presentación se rechaza antes de consumir, el coste se
  resuelve antes de consumir y la producción va después del consumo.
- Integración: R10, R18, R20 (un fallo forzado tras el lote no deja ni estado, ni consumo, ni
  producto), R21, R24, R26 y R42 con importe guardado.
- R42 con importe nulo: se recalcula antes de consumir, y un ingrediente sin lotes cuenta como
  cero.
- R43: el pedido sigue con su importe nulo después de finalizarlo.

`guard-arquitectura-modulos` y `guard-ambito-empresa-pedidos` siguen verdes.
`e2e/ejecucion-receta.spec.ts` y el E2E de QC-141 siguen verdes **con contenido sembrado en su
presentación antes de crear el pedido**; si hay que añadirlo al fixture, se dice en la bitácora.

## [x] T9 — La edición en Pedidos no da de alta producto terminado `[depende de T8]` (reescrita el 2026-09-23, D15)

Archivos: `lib/modules/pedidos/domain/update-order.ts` (el ámbito sin `finishedGoods`,
`design.md > 4.3`), sus tests.

**Hecho cuando:** los tests unit e integración de R27 están verdes: una edición que deja el pedido
`ENTREGADO` no crea producto, lote ni asiento `production`, y el consumo de QC-141 sigue ocurriendo.
**Si QC-145 ya está en `dev`** y la edición no llega a `ENTREGADO`, el test fija que la transición no
se ofrece, y R27 queda cubierto por ese test.

## [x] T10 — Prohibiciones `[depende de T6]` `[P con T7-T9, T14]`

Archivos: `lib/modules/inventario/domain/{create-product,adjust-batch-stock}.ts`,
`.../ports/product-repository.ts`, `.../persistence/product-prisma.ts`
(`findAliveIdByNameInPresentationUnit`, `addBatchToAlive`, `adjustBatchStock`),
`.../driving/batch-actions.ts`, `lib/modules/recetas/domain/{create-recipe,update-recipe,errors}.ts`,
`app/(private)/produccion/formulas/components/product-picker.tsx`,
`app/(private)/produccion/formulas/{nueva,[id]}/page.tsx`.

- La tabla de `design.md > 4.6`.

**Hecho cuando:** hay tests verdes para:

- R28: un homónimo de producto terminado da `action_not_allowed` y no escribe nada, también por la
  comprobación bajo bloqueo.
- R29: alta y edición de receta.
- R30: el selector filtra los productos terminados.
- R31: un ajuste `+1` da `action_not_allowed`, sin `UPDATE` ni asiento.
- R32: un ajuste `-1` se aplica, y `-(existencia+1)` da `batch_stock_negative`.

`guard-ambito-empresa-inventario` y `guard-ambito-empresa-recetas` siguen verdes.

## [x] T11 — Pantallas de inventario `[depende de T6, T7, T10]` `[P con T8]`

Archivos: `app/(private)/inventario/components/{product-batches-panel,adjust-batch-dialog}.tsx`.

- Los envases salen de `packageContent` (D16), y el aviso de «solo restan» va en el diálogo.

**Hecho cuando:** hay tests de componente verdes para:

- R25: el panel pinta «50 envases» con `packageContent` `1` y `stock` `50`. No pinta nada con
  `stock` `49.5` ni sin `packageContent`.
- R33: el texto es visible y no depende solo de color ni de `:hover`.

La guardia de viewport de inventario sigue verde.

## [x] T12 — E2E `[depende de T4, T8, T10, T11, T14]`

Archivos: `e2e/producto-terminado.spec.ts` (nuevo) y, si hace falta, su fixture.

- El recorrido de `design.md > 8` (fila E2E), incluido el cambio de contenido posterior que no
  altera el lote.

**Hecho cuando:** `pnpm run e2e -- producto-terminado` está verde en local y en el gate completo
(R37).

## T13 — Documentación y trazabilidad `[depende de T1-T12, T14]`

Archivos: `docs/architecture.md` (pregunta 2 del dominio: el lote tiene ya una **entrada** por
producción; tipos de producto), `progress/impl_QC-150-producto-terminado.md` (mapa
`R1..R44 → test`, con R15 marcado derogado).

**Hecho cuando:**

- Los requisitos vigentes (R1-R44 salvo R15) tienen test en el mapa, sin ningún `it.todo`.
- `docs/dependencias.md` no tiene filas nuevas y `guard-dependencias-aprobadas` sigue verde.
- La base propia está anotada para borrarla al cerrar.
- `./init.sh` completo termina en verde contra `QuimiCloude_QC150`.
