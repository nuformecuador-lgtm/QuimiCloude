# QC-170 — pedido-en-varias-presentaciones · tasks.md

> Depende de que F1.4 cierre las 4 preguntas de `design.md > 0` (las 3 del humano + la unidad de
> `orders.quantity`). Si al empezar la implementación siguen abiertas, T0 sube al leader antes de
> tocar código: ninguna task de abajo puede escribirse sin esa respuesta.

## T0 — Recontraste contra `dev` en el momento de implementar [bloqueante, no paralelizable]

Repetir las lecturas de `design.md > 1` contra el `dev` real en ese instante (nombres de CHECK,
línea exacta de `transition-order.ts`, forma de `PresentationRef`, conteo de `ERROR_CODES`). Anotar
cualquier divergencia en un §13 nuevo de `design.md`, con el mismo formato que QC-150 §10.
**Hecho cuando**: `design.md` tiene su §13 (o dice explícitamente «sin divergencias») y el resto de
tasks pueden citar líneas reales.

## Migraciones (bloquean todo lo demás; en orden, no paralelizables entre sí)

### T1 — `order_presentation_lines`, `orders.unit_id`, RLS

**Archivos**: `db/schema.prisma` (modelos `OrderPresentationLine`, `Order.unitId`),
`db/migrations/<ts1>_order_presentation_lines/{migration.sql,down.sql}`.
Depende de: T0.
**Hecho cuando**: `pnpm run db:migrate` aplica y revierte contra `QuimiCloude_QC170`; el test
estático de la migración (nuevo, `tests/unit/pedidos/schema/order-presentation-lines-migration.test.ts`)
comprueba tabla, `CHECK`, únicos, índices y RLS `ENABLE`+`FORCE`; `guard-empresa-en-esquema` y
`guard-rls-force` en verde.

### T2 — `inventory_movements`: columna, FK y unicidad por línea

**Archivos**: `db/schema.prisma` (`InventoryMovement.orderPresentationLineId`),
`db/migrations/<ts2>_inventory_movements_production_per_line/{migration.sql,down.sql}`.
Depende de: T1.
**Hecho cuando**: los tres `CHECK`/índice de `design.md > 2.3` existen y su test estático pasa;
`tests/unit/inventario/schema/inventory-movements-migration.test.ts` (existente, se amplía) refleja
el nuevo censo de columnas y restricciones.

### T3 — Backfill y retiro de `orders.presentation_id`/`presentation_content`

**Archivos**: `db/migrations/<ts3>_order_presentation_lines_backfill_and_drop/{migration.sql,down.sql}`.
Depende de: T1, T2.
**Hecho cuando**: aplicada sobre una base con pedidos de prueba (con presentación+contenido, sin
contenido, sin presentación, con resto que da cero envases), cada uno migra según R22-R25; aplicarla
dos veces falla en el segundo `DROP COLUMN` (se documenta y se prueba, no se evita); `down.sql`
falla con `RAISE` si algún pedido tiene más de una línea (se prueba con un caso que sí y uno que no).
Test de integración `tests/integration/pedidos/qc170-backfill.int.test.ts` (nuevo) cubre los cuatro
casos.

## Dominio de `unidades`/`inventario`: lo que otros necesitan leer

### T4 — `PresentationRef` gana `unitId` [P]

**Archivos**: `lib/modules/inventario/domain/presentation-catalog.ts`,
`lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma.ts`,
`tests/unit/inventario/presentation-catalog.test.ts`.
Depende de: T0.
**Hecho cuando**: `findRefs` devuelve `unitId` y el test lo comprueba; ningún otro campo cambia.

### T5 — `planFinishedGoods` → `planFinishedGoodsLine` (recibe envases, no los calcula) [P]

**Archivos**: `lib/modules/inventario/domain/finished-goods.ts`,
`tests/unit/inventario/finished-goods.test.ts`.
Depende de: T0.
**Hecho cuando**: la función nueva calcula `quantity = packages × content` sin `floor`, devuelve
`no_content` cuando falta el contenido, y el caso `no_whole_package` deja de existir en su tipo; los
casos de test de QC-150 que probaban la división se reescriben o se retiran con una nota de por qué.

### T6 — `receiveFromOrder` pasa a recibir una línea (no el pedido entero)

**Archivos**: `lib/modules/inventario/domain/finished-goods.ts` (tipo `FinishedGoodsIntake`),
`lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma.ts`,
`lib/modules/inventario/adapters/driven/persistence/product-prisma.ts` (`receiveFinishedGoods`),
`tests/unit/inventario/product-prisma.test.ts` (o el archivo real que lo prueba hoy).
Depende de: T2, T5.
**Hecho cuando**: la firma recibe `presentationId`, `packages`, `orderContent`, `unitCost` ya
resuelto; el lote nace con `package_content` de la línea y el asiento `production` lleva
`order_presentation_line_id`; el test cubre `presentation_without_content` por línea.

## Dominio de `pedidos`: el reparto

### T7 — Esquema de entrada: `presentationLinesSchema`, retiro de `presentationId` del pedido

**Archivos**: `lib/modules/pedidos/domain/order-input.ts`, `lib/modules/pedidos/domain/order-view.ts`
(`NewOrder`, `OrderEdit`), `tests/unit/pedidos/order-input.test.ts`.
Depende de: T0.
**Hecho cuando**: `createOrderSchema`/`updateOrderSchema` validan `presentationLines` (R1, R2, R9) y
`unitId` obligatorio; ya no existe `presentationId` en ninguno de los dos; un envío con una
presentación repetida se rechaza en el borde.

### T8 — `create-order.ts` / `update-order.ts`: escriben el reparto, ya no la presentación única

**Archivos**: `lib/modules/pedidos/domain/create-order.ts`, `update-order.ts`,
`lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` (repositorio de escritura: crea
las filas de `order_presentation_lines` en la misma operación), `order-write-repository.ts` (puerto).
Depende de: T1, T7.
**Hecho cuando**: alta y edición escriben `unit_id` y las líneas de reparto; el `create-order.test.ts`
y `update-order.test.ts` existentes se adaptan (pierden los casos de `presentation_not_found` sobre
un único id, ganan los del reparto); ninguno da de alta producto terminado (R20, ya lo garantizaba
QC-150 y no se toca ese test).

### T9 — Caso de uso `updateOrderPresentationLines` + `REPARTO_EDITABLE_STATUSES`

**Archivos**: `lib/modules/pedidos/domain/update-order-presentation-lines.ts` (nuevo),
`lib/modules/pedidos/ports/order-write-repository.ts` (o el puerto que corresponda tras T0),
`tests/unit/pedidos/update-order-presentation-lines.test.ts` (nuevo).
Depende de: T7, T8.
**Hecho cuando**: acepta `PENDIENTE`/`EN_CURSO`/`POR_EMPACAR`/`EN_EMPAQUE` y rechaza
`ENTREGADO`/`CANCELADO` con `order_presentation_line_not_editable` (R11-R14); reemplaza el conjunto
de líneas; no toca `assertTransition`.

### T10 — `OrderCatalog`: `presentationId` → `presentationLines`, nuevo método de reparto

**Archivos**: `lib/modules/pedidos/domain/order-catalog.ts` (tipo `AssignedOrderSummary`, método
`updatePresentationLinesAliveById`), `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts`,
`tests/unit/pedidos/order-catalog.test.ts`.
Depende de: T9.
**Hecho cuando**: el resumen publicado lleva `presentationLines`; el método nuevo delega en T9 con
ámbito de empresa.

### T11 — «Cuánto queda disponible»: conversión de unidades en el borde de `pedidos`

**Archivos**: `lib/modules/pedidos/domain/order-cost.ts` o un archivo nuevo
`order-presentation-availability.ts`, `lib/modules/pedidos/adapters/driving/*` (Server Action que
devuelve el disponible al formulario), `tests/unit/pedidos/order-presentation-availability.test.ts`
(nuevo).
Depende de: T4, T9.
**Hecho cuando**: dado `quantity`+`unitId` del pedido y las líneas del reparto (con su `unitId` de
presentación), devuelve el disponible convertido (R6) y rechaza con `IncompatibleUnitsError` → error
de línea (R7) cuando no comparten base; casos: unidades iguales, unidades convertibles, unidades
incompatibles, reparto que excede el total (§0.3: se acepta y da negativo).

### T12 — `transition-order.ts`: retira el lote, conserva el consumo

**Archivos**: `lib/modules/pedidos/domain/transition-order.ts`,
`tests/unit/pedidos/transition-order.test.ts`.
Depende de: T0.
**Hecho cuando**: `to === 'POR_EMPACAR'` ya no llama a `finishedGoods`, ya no exige presentación ni
`recipeRef`; el `'ok'` del método vuelve a ser sin `finishedGoods`; los tests de QC-150 que
afirmaban el lote en este punto se retiran o se mueven a T14.

### T13 — `order-packing.ts`: `startPackingAliveById` exige reparto

**Archivos**: `lib/modules/pedidos/domain/order-packing.ts`,
`lib/modules/pedidos/ports/order-packing-repository.ts`,
`lib/modules/pedidos/adapters/driven/persistence/order-packing-prisma.ts` (o el nombre real tras T0),
`tests/unit/pedidos/order-packing.test.ts`.
Depende de: T1, T0.
**Hecho cuando**: `startPackingAliveById` devuelve `'without_distribution'` cuando el pedido está
`POR_EMPACAR` sin ninguna línea (R10), y `'ok'`/`'taken'`/`'already_mine'`/`'not_packable'` sin
cambios en los demás casos; el `EXISTS` no rompe la idempotencia ya probada de Comenzar.

### T14 — `order-packing.ts`: `finishPackingAliveById` da de alta un lote por línea

**Archivos**: `lib/modules/pedidos/domain/order-packing.ts`,
`lib/modules/pedidos/ports/order-unit-of-work.ts` (si `finishPackingAliveById` necesita el ámbito de
inventario que hoy no recibe), `tests/unit/pedidos/order-packing.test.ts`,
`tests/integration/pedidos/finish-with-finished-goods.int.test.ts` (se reescribe: ya no cuelga de
Finalizar sino de Terminar).
Depende de: T6, T10, T12, T13.
**Hecho cuando**: Terminar abre la unidad de trabajo, calcula el coste único (R18), llama a
`receiveFromOrder` una vez por línea, deshace TODO si alguna línea da `presentation_without_content`
(R19), y el `'ok'` lleva `finishedGoods: readonly FinishedGoodsReceipt[]`; dos Terminar simultáneos
no duplican lotes (prueba de carrera, R21).

## `asignaciones`: la puerta del Empacador

### T15 — Puerta de reparto para el Empacador

**Archivos**: `lib/modules/asignaciones/domain/update-packing-presentation-lines.ts` (nuevo),
`app/(private)/asignacion/empaque/[id]/components/*` (control de reparto en la pantalla de empaque),
Server Action en `asignaciones/adapters/driving/order-packing-actions.ts`,
`tests/unit/asignaciones/update-packing-presentation-lines.test.ts` (nuevo).
Depende de: T10.
**Hecho cuando**: exige `empaque.modificar` (R12); llama a `OrderCatalog.updatePresentationLinesAliveById`;
rechaza fuera de `POR_EMPACAR`/`EN_EMPAQUE` con el mismo código que T9.

### T16 — Listados y ejecución: `presentationLines` en vez de `presentationId` [P]

**Archivos**: `lib/modules/asignaciones/domain/list-assigned-orders.ts`,
`get-assigned-order-execution.ts`, `assigned-order-view.ts`, `assigned-order-execution-view.ts`,
`app/(private)/asignacion/components/*-columns.tsx`,
`app/(private)/asignacion/[id]/components/order-execution-screen.tsx`,
`app/(private)/pedidos/components/order-columns.tsx`, `components/shared/order-presentation-label.tsx`
(o su sustituto), y los tests unitarios de cada uno.
Depende de: T10; **bloqueada hasta que F1.4 cierre la pregunta abierta 1** (formato de
presentación).
**Hecho cuando**: ninguna pantalla lee `presentationId`/`presentationName` de un pedido; todas
muestran el reparto con el formato que F1.4 cierre; «Sin presentación» sigue apareciendo cuando el
reparto está vacío (R27).

## Catálogo de errores y permisos

### T17 — Altas del catálogo de errores [P]

**Archivos**: `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts`,
`tests/unit/errores/catalogo.test.ts` (el `toHaveLength`).
Depende de: T0.
**Hecho cuando**: `order_without_distribution` y `order_presentation_line_not_editable` existen con
sus mensajes (`design.md > 7`); el conteo del test refleja el nuevo total; se decide y se aplica si
`no_whole_package` se retira (según lo que diga `guard-catalogo-de-errores` en ese momento).

## Documentación de specs ya cerrados

### T18 — Anotar las enmiendas en QC-168, QC-150 y QC-146 [P]

**Archivos**: `specs/QC-168-estado-por-empacar/design.md`, `specs/QC-150-producto-terminado/design.md`,
`specs/QC-146-presentacion-del-pedido/design.md` (cabecera con fecha y referencia a `design.md > 8`
de esta ficha, sin reescribir el resto).
Depende de: ninguna (documental, puede ir en paralelo con todo).
**Hecho cuando**: las tres cabeceras tienen la nota fechada; ningún otro contenido de esos tres
archivos cambia.

## E2E

### T19 — `e2e/pedido-en-varias-presentaciones.spec.ts` (nuevo)

**Archivos**: `e2e/pedido-en-varias-presentaciones.spec.ts`, y el ajuste de
`e2e/producto-terminado.spec.ts` (QC-150) para que ya no espere el lote tras Finalizar sino tras
Terminar, y `e2e/pedidos-terminados.spec.ts`/`pedidos-asignados.spec.ts` si asumen
`presentationId`/`presentationName` de un pedido (QC-168 §10 ya los daba por rojos por otro motivo;
esta ficha añade el suyo).
Depende de: T1-T17 (es el último paso; solo corre con todo lo demás en verde).
**Hecho cuando**: R33 se cumple: alta con reparto de dos presentaciones, producción, empaque,
Terminar, y las afirmaciones de dos lotes con la cantidad y el coste unitario esperados y la
existencia del inventario subiendo por las dos combinaciones.

## Guardias que se ponen rojas y quién las arregla

`guard-catalogo-de-errores` (T17), `guard-empresa-en-esquema` y `guard-rls-force` (T1),
`guard-arquitectura-modulos` (T15, por el contrato nuevo entre `asignaciones` y `pedidos`),
`guard-ambito-empresa-pedidos` (T8, T9: nuevos archivos de `adapters/driven/persistence/`),
`guard-libro-de-inventario` (T6: nuevo camino de escritura si `receiveFinishedGoods` cambia de
archivo o de firma de forma que el censo lo note), `guard-pantallas-exigen-permiso` (T15, ruta
nueva o control nuevo con permiso). Cada una se arregla en la task que la rompe, no al final.

## Orden sugerido (no todo depende de todo)

```
T0 → T1 → T2 → T3
T0 → T4 [P] , T5 [P] (no dependen de T1-T3)
T5 → T6 (depende tambien de T2)
T0 → T7 → T8 (depende tambien de T1)
T7,T8 → T9 → T10 → T11 (depende tambien de T4), T13 (depende tambien de T1)
T6,T10,T12,T13 → T14
T10 → T15 → T16 (bloqueada por F1.4, pregunta 1)
T0 → T17 [P]
cualquier momento → T18 [P]
todo → T19
```
