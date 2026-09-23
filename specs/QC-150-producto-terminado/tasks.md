# QC-150 — producto-terminado · tasks.md

> Orden de arriba abajo salvo donde se marque `[P]` (paralelizable con la task indicada). Cada task
> dice **qué archivos toca** y su **criterio de hecho**. Nada se da por hecho sin gate
> (`CLAUDE.md`, regla 5): `./init.sh --rapido` al cerrar cada task, `./init.sh` completo al cerrar la
> feature y antes del PR.
>
> **Ninguna task empieza antes de**: (1) aprobación del spec en F1.4, con respuesta a las preguntas
> 1-7 o su aplazamiento explícito, y a la enmienda del catálogo de errores (`design.md > 6`); (2)
> **QC-141 mergeada en `dev`** (`depends_on`). Las tasks marcadas **(según F1.4, pregunta N)** no se
> empiezan si esa pregunta sigue sin respuesta; lo demás de la task sí.
>
> **Base de datos**: toda migración, test de integración y E2E de esta ficha corre contra su **base
> propia `QuimiCloude_QC150`**, con la variable de entorno del proceso apuntando a ella —el `.env`
> del worktree no basta (`progress/history.md`)—. **Nunca** contra la compartida de `.env`
> (`QuimiCloude`): la primera tanda de QC-147 la migró por error y su `down.sql` no devolvía los
> datos. Tras cada merge de `origin/dev`, se migra la base propia antes de correr el gate.
>
> Los comentarios de producción **no citan fichas ni requisitos** (`docs/conventions.md >
> Comentarios`); `R<n>` sí va en el **nombre de los tests**.

---

## T0 — Partir de `dev` con QC-141 dentro `[bloqueante]`

Archivos: los que traiga el merge; `specs/QC-150-producto-terminado/design.md` si algo cambió.

- `git merge origin/dev` en el worktree, con QC-141 ya mergeada.
- Crear `QuimiCloude_QC150` (receta de `docs/verification.md`; si `db:seed` falla, copiar la
  plantilla como hizo QC-81 según `progress/history.md`), aplicar `pnpm run db:migrate` y
  regenerar la plantilla de integración de la rama.
- Comprobar contra `dev` lo que `design.md` cita de QC-141 **leído en su rama**: nombre de la
  restricción `(kind = 'consumption') = (order_id IS NOT NULL)` y de
  `inventory_movements_reason_matches_kind`, forma de `OrderTransactionScope`, de
  `createTransitionOrder` y de sus resultados, `consumeBatchStock`, `recalculateProductStock` en SQL,
  firma decimal de `deriveUnitCost`, `decimal-quantity.ts`, y la última migración de `dev` (para el
  prefijo de T1).

**Hecho cuando:** merge commiteado sin marcadores; `./init.sh --rapido` verde contra
`QuimiCloude_QC150`; cada divergencia con `design.md` anotada y corregida en el diseño (o subida
al leader si cambia un requisito).

## T1 — Migración: valores de enum `[depende de T0]`

Archivos: `db/migrations/<ts>_finished_product_enum_values/{migration.sql,down.sql}`,
`db/schema.prisma` (enums `ProductType` e `InventoryMovementKind`),
`tests/unit/inventario/schema/finished-product-enum-values-migration.test.ts` (nuevo).

- Los dos `ADD VALUE` al final, solos (`design.md > 3.1`).
- `down.sql` recrea los tipos sin el valor y **falla** si hay productos `FINISHED_PRODUCT` o
  asientos `production`.

**Hecho cuando:** `pnpm run db:migrate` y `pnpm run db:rollback` funcionan sobre
`QuimiCloude_QC150`; el test de esquema comprueba el orden de los dos enums (R1) y que el `down.sql`
contiene la guarda (R36); `guard-identificador-de-request` al día si enumera migraciones.

## T2 — Migración: contenido, identidad del producto terminado y libro `[depende de T1]`

Archivos: `db/migrations/<ts+1>_finished_products_and_presentation_content/{migration.sql,down.sql}`,
`db/schema.prisma` (`Presentation.content`, `Product.recipeId`, `Product.presentationId`),
`tests/unit/inventario/schema/*` (nuevos y los que fijan columnas de `Product`/`Presentation`).

- Todo `design.md > 2.2-2.4` y `> 3.2`, **sin** el disparador de la pregunta 6.
- Escrita a mano; aplicada con `db:migrate`, nunca con `migrate dev`.

**Hecho cuando:** migra y revierte sobre `QuimiCloude_QC150`; tests de esquema verdes para R6 (tipo
y `CHECK`), R9 (columna anulable sin `DEFAULT` ni `UPDATE`), R21 (índice único parcial por pedido),
R34 (nombres en inglés) y R36; `guard-empresa-en-esquema`, `guard-rls-force` y
`guard-arquitectura-modulos` verdes.

## T3 — Disparador del contenido bloqueado `[depende de T2]` **(según F1.4, pregunta 6)**

Archivos: la migración de T2 (si aún no ha salido de la rama) o una `<ts+2>` propia;
`lib/modules/inventario/adapters/driven/persistence/presentation-prisma.ts` (traducir el `23514`);
`lib/modules/inventario/domain/errors.ts`.

**Hecho cuando:** un test de integración cambia el contenido de una presentación sin lotes de
producto terminado (pasa) y con ellos (falla con el código que decida F1.4). Si F1.4 responde que no
se bloquea, la task se cierra sin código y R25 se reescribe.

## T4 — Contenido de la presentación en el dominio y la pantalla `[depende de T2]` `[P con T5]`

Archivos: `lib/modules/inventario/domain/{presentation-input,presentation-view}.ts`,
`lib/modules/inventario/adapters/driven/persistence/presentation-prisma.ts`,
`lib/modules/inventario/adapters/driving/presentation-actions.ts`,
`app/(private)/configuracion/presentaciones/components/{presentation-form,presentation-columns}.tsx`,
tests de esos archivos.

- `content` opcional y anulable, cadena decimal validada (`design.md > 4.2`); `Prisma.Decimal` al
  escribir, `.toFixed(4)` al leer.
- Campo y columna según `design.md > 5`. `presentation-select.tsx` no cambia.

**Hecho cuando:** tests verdes para R6 (se guarda y se vacía), R7 (cero, negativo, cinco decimales,
once enteros, `1e3`, `1,5` sin convertir en el servidor) y R8 (el formulario lo edita; la columna
pinta «Sin contenido»); `strictObject` sigue rechazando campos de más.

## T5 — El cálculo puro `[depende de T0]` `[P con T1-T4]`

Archivos: `lib/modules/inventario/domain/finished-goods.ts` (nuevo), `lib/modules/inventario/index.ts`,
`tests/unit/inventario/finished-goods.test.ts` (nuevo).

- `planFinishedGoods` según `design.md > 4.1`, sobre `decimal-quantity.ts` y `deriveUnitCost`.
- El divisor del coste **(según F1.4, pregunta 2)**; la lectura de la cantidad **(según F1.4,
  pregunta 1)**; `no_whole_package` **(según F1.4, pregunta 4)**.

**Hecho cuando:** tests verdes, sin base de datos, para R12 (`50.5/1`, `10/3`, `50/0.75`), R14
(redondeo mitad arriba a 4 decimales), R15 (coste nulo → `unitCost: null`, nunca `'0'`) y R19
(`0.5/1`); el archivo no contiene `Number(`, `parseFloat` ni `toFixed` sobre cantidades.

## T6 — Tipo de producto: alta, edición, listado y catálogo de errores `[depende de T1]` `[P con T4, T5]`

Archivos: `lib/modules/inventario/domain/{product-queryable,product-input,product-batch-input,update-product,product-catalog,product-view,errors}.ts`,
`lib/modules/inventario/ports/product-repository.ts`,
`lib/modules/inventario/adapters/driven/persistence/{product-prisma,product-catalog-prisma}.ts`
(`updateAliveProduct`, `findRefs`), `lib/modules/inventario/index.ts`,
`lib/modules/errores/domain/{error-codes,error-catalog}.ts`,
`app/(private)/inventario/components/{product-type-tabs,product-form}.tsx`.

- `PRODUCT_TYPE_VALUES` con cuatro valores, `MANUAL_PRODUCT_TYPE_VALUES` con tres
  (`design.md > 4.2`); `ProductRef.type`.
- R4 en el `UPDATE` condicional (`design.md > 4.5`), `ActionNotAllowedError` de `inventario`.
- Códigos `presentation_without_content` y, **si F1.4 aprueba la pregunta 4**, `no_whole_package`,
  con su texto (`design.md > 6`), en la cabecera de enmiendas de `error-codes.ts`.

**Hecho cuando:** tests verdes para R2 (alta con `FINISHED_PRODUCT` → `invalid_input`, nada escrito),
R3 (el formulario no ofrece la opción y la muestra de solo lectura en un producto terminado), R4 (los
dos sentidos, en unit y en integración contra la base propia), R5 (pestaña y filtro);
`guard-catalogo-de-errores` verde; los contratos de módulo que fijan `ProductRef` actualizados como
ampliación nombrada.

## T7 — La escritura del producto terminado `[depende de T2, T5, T6]`

Archivos: `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
(`receiveFinishedGoods`), `.../persistence/finished-goods-prisma.ts` (nuevo, `createFinishedGoodsIntake`),
`.../persistence/batch-movement-prisma.ts` (`kind: 'production'`),
`lib/modules/inventario/domain/{inventory-movement,finished-goods}.ts`,
`tests/guards/guard-libro-de-inventario.test.ts` (censo de cinco caminos),
`tests/unit/inventario/finished-goods-prisma.test.ts`,
`tests/integration/inventario/finished-goods.int.test.ts` (nuevos).

- Los pasos 1-7 de `design.md > 4.4`, con el orden de bloqueos escrito ahí.
- La rama del coste nulo **(según F1.4, pregunta 3)**: sin respuesta, lanza y el test lo deja
  como `it.todo` con el número de la pregunta; **no** se escribe un coste.
- Índice parcial por vivos **(según F1.4, pregunta 7)**.
- Medir el largo máximo de `recipeNameSchema` + « · » + 60 frente a los 120 de `productNameSchema`
  (`design.md > 9`) y anotar el resultado en la bitácora; si puede superarlo, parar y subirlo.

**Hecho cuando:** integración verde contra `QuimiCloude_QC150` para R11 (nace con tipo, nombre,
unidad y combinación; el segundo pedido reutiliza), R13, R16, R17, R21 (segunda llamada con el mismo
pedido rechazada por la base), R22 (dos conexiones reales, misma combinación, un producto y dos
lotes), R23 (otra empresa con la misma receta y presentación no recibe nada) y R35; el censo de la
guardia del libro pasa con `receiveFinishedGoods` y rechaza un camino fabricado sin asiento.

## T8 — Engancharlo al Finalizar `[depende de T7]`

Archivos: `lib/modules/pedidos/ports/order-unit-of-work.ts`,
`lib/modules/pedidos/domain/{transition-order,order-catalog,errors}.ts`,
`lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma.ts` (reintento por número
de lote, `design.md > 4.4`), `lib/modules/asignaciones/domain/{finish-assigned-order,start-assigned-order,errors}.ts`,
`lib/modules/asignaciones/adapters/driving/order-execution-actions.ts`,
`app/(private)/asignacion/components/assigned-order-delivered-notice.tsx`,
`app/(private)/asignacion/[id]/components/order-execution-screen.tsx`, `lib/composition/index.ts`.

- `OrderTransactionScope.finishedGoods`, cableado con `createFinishedGoodsIntake(tx)`.
- Los pasos 1-5 de `design.md > 4.3`; resultados nuevos de `transitionAliveById` y su traducción.
- Confirmación con envases y nombre del producto (R24).

**Hecho cuando:** unit con dobles que registran el orden (sin presentación se rechaza antes de
consumir; producción después del consumo; permiso antes de todo) y integración verdes para R10, R18,
R20 (fallo forzado tras el lote: ni estado, ni consumo, ni producto), R21 (doble Finalizar), R24 y
R26; `guard-arquitectura-modulos` (sin Prisma en composición, sin ciclo) y
`guard-ambito-empresa-pedidos` verdes; `e2e/ejecucion-receta.spec.ts` y el E2E de QC-141 siguen
verdes **con contenido sembrado en su presentación** (si no lo tienen, se les añade en el fixture y
se dice en la bitácora).

## T9 — Entregar por la edición en Pedidos `[depende de T8]` **(según F1.4, pregunta 5)**

Archivos: `lib/modules/pedidos/domain/update-order.ts`, sus tests.

- La misma llamada que T8 dentro del `unitOfWork.run` que deja la edición a `ENTREGADO`.

**Hecho cuando:** unit e integración verdes para R27 por ese camino, con R18 y R20. **Si QC-145 ya
está en `dev`** y la edición no llega a `ENTREGADO`, la task se cierra sin código y R27 se retira del
spec con la aprobación del humano.

## T10 — Prohibiciones `[depende de T6]` `[P con T7-T9]`

Archivos: `lib/modules/inventario/domain/{create-product,adjust-batch-stock}.ts`,
`lib/modules/inventario/ports/product-repository.ts`,
`lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
(`findAliveIdByNameInPresentationUnit`, `addBatchToAlive`, `adjustBatchStock`),
`lib/modules/inventario/adapters/driving/batch-actions.ts`,
`lib/modules/recetas/domain/{create-recipe,update-recipe,errors}.ts`,
`app/(private)/produccion/formulas/components/product-picker.tsx`,
`app/(private)/produccion/formulas/{nueva,[id]}/page.tsx`.

- La tabla de `design.md > 4.5` para R28-R32.

**Hecho cuando:** tests verdes para R28 (homónimo de un producto terminado → `action_not_allowed`,
nada escrito, también con la comprobación bajo bloqueo), R29 (alta y edición de receta), R30 (la
petición del selector lleva el filtro y no devuelve productos terminados), R31 (ajuste `+1` →
`action_not_allowed`, ni `UPDATE` ni asiento) y R32 (ajuste `-1` aplicado; `-(existencia+1)` →
`batch_stock_negative`); `guard-ambito-empresa-inventario` y `guard-ambito-empresa-recetas` verdes.

## T11 — Pantallas de inventario `[depende de T6, T10]` `[P con T8]`

Archivos: `app/(private)/inventario/components/{product-batches-panel,adjust-batch-dialog}.tsx`,
`lib/modules/inventario/domain/product-batch-view.ts` (si el panel necesita tipo y contenido).

- Envases en el panel **(según F1.4, pregunta 6)**; aviso de «solo restan» en el diálogo.

**Hecho cuando:** tests de componente verdes para R25 (pinta «50 envases» con contenido `1`; no
pinta nada si la división no es entera o no hay contenido) y R33 (el texto es visible y no depende
solo de color ni de `:hover`); la guardia de viewport de inventario sigue verde.

## T12 — E2E `[depende de T4, T8, T10, T11]`

Archivos: `e2e/producto-terminado.spec.ts` (nuevo) y, si hace falta, su fixture de siembra.

- El recorrido de `design.md > 8` (fila E2E), contra `QuimiCloude_QC150`.

**Hecho cuando:** `pnpm run e2e -- producto-terminado` verde en local y en el gate completo (R37).

## T13 — Documentación y trazabilidad `[depende de T1-T12]`

Archivos: `docs/architecture.md` (pregunta 2 del dominio: el lote tiene ya una **entrada** por
producción además del consumo de QC-141; tipos de producto), `progress/impl_QC-150-producto-terminado.md`
(mapa `R1..R37 → test`, con los provisionales que F1.4 haya retirado o reescrito marcados).

**Hecho cuando:** los 37 requisitos vigentes tienen test en el mapa, ninguna fila nueva en
`docs/dependencias.md` (`guard-dependencias-aprobadas` verde), la base propia está anotada para
borrarla al cerrar, y `./init.sh` completo termina en verde contra `QuimiCloude_QC150`.
