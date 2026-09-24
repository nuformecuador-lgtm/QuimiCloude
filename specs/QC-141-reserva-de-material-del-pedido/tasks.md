# QC-141 — reserva-de-material-del-pedido · tasks.md

> **Enmendado el 2026-09-23 (review 2).** Tras el review de la vuelta 2 (RECHAZADO) y la decisión
> **D22**, lo cerrado sigue cerrado y **lo pendiente es el bloque «Enmienda del review 2»**, al
> final: **TR2** (re-sincronizar con `dev`: QC-122, QC-151, `daa400c5`) va primero; después **TD22**
> (coste por promedio de disponibles), **TV2-B1..TV2-B4** (bloqueantes), **TV2-m1..TV2-m5**
> (menores) y **TC2** (cierre). Tm1 se marca hecha (la bitácora ya tiene el mapa R1-R58); TC queda
> absorbida por TC2.

> **Enmendado el 2026-09-23 (review).** Tras el review F2.2 (RECHAZADO) y la decisión D21, T0-T17
> y TM siguen `[x]`, y **lo pendiente es el bloque «Enmienda del review»**, al final: **TR**
> (re-sincronizar con `dev`: QC-145 y `a01c90cb`) va primero; después TB1-TB4 (bloqueantes),
> Tm1-Tm7 (menores) y **TC** (cierre con E2E en Chromium y WebKit y `./init.sh` completo). T10 y
> T16 quedan cerradas, pero su parte de «entregar por la edición en Pedidos» la retira TB4.

> **Enmendado el 2026-09-23** tras el merge de QC-147 en `dev` (`design.md > 0.3`): nace **TM**
> (merge de `origin/dev` y renumeración de migraciones), primera de lo pendiente; **T6 se rehace**,
> **T7 se reabre** para un ajuste parcial, y cambian T9, T10, T11, T16 y T17. T6 y T10 esperan,
> además, a que el humano apruebe E1 y E2.

> Orden de arriba abajo salvo donde se marque `[P]` (paralelizable con la task indicada). Cada task
> dice **qué archivos toca** y su **criterio de hecho**. Nada se da por hecho sin gate
> (`CLAUDE.md`, regla 5): `./init.sh --rapido` al cerrar cada task, `./init.sh` completo al cerrar
> la feature y antes del PR.
> Los comentarios de producción **no citan fichas ni requisitos** (`docs/conventions.md >
> Comentarios`); `R<n>` sí va en el **nombre de los tests**.
> **Antes de T1**, F1.4 tiene que haber respondido `design.md > 0`. Las tasks marcadas
> **(según F1.4)** cambian de forma con la respuesta; si una pregunta queda sin respuesta, esa task
> no se empieza.

---

## [x] T0 — Lo que se hereda y no se rehace

No es una task de escritura. **Hecho cuando:** leídas y confirmadas en la rama.

| Se hereda | Dónde | Qué NO se hace |
|---|---|---|
| `convertQuantity` y `IncompatibleUnitsError` | `lib/modules/unidades/domain/convert-quantity.ts:188-210` | Ninguna conversión propia. *(Enmienda del 2026-09-23: la reserva ya no convierte; ver la fila siguiente.)* |
| `consumedQuantity` *(enmienda del 2026-09-23, llega con TM)* | `lib/modules/recetas/domain/recipe-percentage.ts:98-104` (`dev`) | Ninguna fórmula propia de pedido × % |
| Orden de lotes del coste | `lib/modules/pedidos/domain/order-cost.ts:94-117` | Se **mueve** a `inventario` (T3), no se copia |
| Bloqueo de la fila de producto en ajuste y alta de lote | `product-prisma.ts:618-625,727-734` | No se añade bloqueo consultivo nuevo a esos caminos |
| Libro `inventory_movements` y `writeMovement` | `batch-movement-prisma.ts:16-33` | No se crea otro libro de existencias |
| `OrderCatalog.transitionAliveById` que usa la planta | `lib/modules/pedidos/domain/order-catalog.ts:69-76` | No cambia su firma; solo gana un resultado |
| Catálogo cerrado de permisos | `lib/modules/identity/domain/permissions.ts` | **Ningún permiso nuevo** (`R41`) |
| `formatDecimalDisplay` / `exactDecimalTitle` | `lib/shared/ui/decimal-display.ts:119,137` | Ningún formateador nuevo |

---

## [x] T1 — Migración: valor `consumption` del enum `[depende de F1.4]`

Archivos: `db/migrations/<ts>_inventory_movement_kind_consumption/{migration.sql,down.sql}`,
`db/schema.prisma` (enum `InventoryMovementKind`).

- `ALTER TYPE ... ADD VALUE 'consumption'`, sola (`design.md > 4.1`).
- `down.sql` recrea el tipo sin el valor y **falla** si hay asientos `consumption`.

**Hecho cuando:** `pnpm run db:migrate` y `pnpm run db:rollback` funcionan sobre la base de
pruebas, y un test de esquema comprueba el orden del enum (`opening`, `adjustment`,
`consumption`) y que el `down.sql` contiene el `RAISE EXCEPTION`.

## [x] T2 — Migración: existencia decimal, libro de reservas y `orders.reserved_at` `[depende de T1]`

Archivos: `db/schema.prisma` (`Product`, `ProductBatch`, `InventoryMovement`, `Order`, enum y
modelo `ReservationMovement` con `/// @module inventario`),
`db/migrations/<ts>_reservations_and_decimal_stock/{migration.sql,down.sql}`,
`tests/unit/inventario/schema/*`, `tests/unit/pedidos/schema/*`.

- Todo lo de `design.md > 3` y `> 4.2`, incluido `qty_alert` **(según F1.4, pregunta 5b)**.
- `down.sql` falla si alguna cantidad tiene parte decimal (`R45`).
- Se actualizan los tests que fijan `Int` (`design.md > 2.4`, filas de esquema).

**Hecho cuando:** migra y revierte; tests de esquema verdes para `R1`, `R2`, `R45`, `R46`;
`guard-empresa-en-esquema`, `guard-rls-force` y `guard-arquitectura-modulos` verdes; un test de
integración siembra enteros antes de migrar y comprueba que valen lo mismo después (`R2`).

## [x] T3 — Decimal exacto y orden de lotes en `inventario` `[P con T2]`

Archivos: `lib/modules/inventario/domain/decimal-quantity.ts` (nuevo),
`lib/modules/inventario/domain/batch-order.ts` (nuevo), `lib/modules/inventario/index.ts`,
`lib/modules/pedidos/domain/order-cost.ts`.

- `compareBatchesOldestFirst` sale de `order-cost.ts:94-117` y se publica en el barril de
  `inventario`; `order-cost.ts` lo importa de ahí.
- Suma, resta, comparación, mínimo y techo a 4 decimales sobre cadenas (`design.md > 2.3`).

**Hecho cuando:** `tests/unit/inventario/decimal-quantity.test.ts` y `batch-order.test.ts` verdes
(con los lotes `'9'` y `'10'`), y `tests/unit/pedidos/order-cost.test.ts` sigue verde **sin
cambios**.

## [x] T4 — Existencia decimal en el módulo `inventario` `[depende de T2, T3]`

Archivos: los de la tabla de `design.md > 2.1` bajo `lib/modules/inventario/**`, y
`lib/modules/recetas/domain/{recipe-view,get-recipe}.ts`.

- Tipos a cadena, esquemas zod del alta y del ajuste, `deriveUnitCost` con existencia decimal,
  mensaje de N9 **(según F1.4)**, lectores de `FormData` decimales, `recalculateProductStock` en SQL
  y exportada, filtros de rango con `Prisma.Decimal`.
- Se actualizan los tests de `design.md > 2.4` que no son de esquema.

**Hecho cuando:** tests verdes para `R3`, `R4`, `R5` (con `1.5`, `0.0001`, cinco decimales, cero,
negativo, notación científica) y el test de integración de sumas de `product-stock.int.test.ts`
reescrito con decimales.

## [x] T5 — Existencia decimal en pantallas `[depende de T4]` `[P con T6]`

Archivos: `app/(private)/inventario/components/{product-columns,product-batches-panel,product-form,adjust-batch-dialog,product-cost-amount}.tsx|ts`,
`app/(private)/pedidos/components/order-ingredients-table.tsx`.

- Campos decimales con `inputMode="decimal"`, coma a punto, `font-size >= 16px`.
- Pintado con `formatDecimalDisplay` + `exactDecimalTitle` + `aria-label` **(según F1.4,
  pregunta 5a)**.
- «Restante» con la cadena tal cual y, **si se aprueba N4**, restando del disponible.

**Hecho cuando:** tests de componente verdes para `R6` (ningún `Number(`, `parseFloat` ni
`toFixed` sobre cantidades en esos archivos: se amplía la guardia de convenciones de la ruta si no
los cubre), y `e2e/ajuste-de-inventario.spec.ts` verde con un ajuste de `-0.5`.

## [x] TM — Merge de `origin/dev` y renumeración de migraciones `[primera de lo pendiente]` (enmienda del 2026-09-23)

> **Cerrada por el leader el 2026-09-23.** Merge (`fe240487`) y renumeración (`5e1d7572`) hechos por el implementer. **Rollback probado** por el leader en una base efímera `qct_qc141_rollback`: `migrate deploy` completo, `db:rollback` de `…120200`, `…120100` y `…120000` en ese orden —apartando cada carpeta tras revertirla, solo en una copia de la rama—, las tres OK, y `migrate deploy` las reaplica limpias; base borrada. El paso 1 (revertir en la base local compartida `QuimiCloude`) **se sustituye** por una base propia de la rama, `QuimiCloude_QC141`, a la que apunta el `.env` del worktree; el saneo de `QuimiCloude` queda como deuda local con script entregado al humano.

Archivos: todo lo que traiga el merge; `db/migrations/20260922160000_inventory_movement_kind_consumption/`
y `db/migrations/20260922160100_reservations_and_decimal_stock/` (se renombran),
`tests/guards/guard-identificador-de-request.test.ts` (`MIGRACIONES_ESPERADAS`),
`tests/unit/inventario/schema/{inventory-movement-kind-consumption-migration,reservations-and-decimal-stock-migration}.test.ts`,
`tests/integration/inventario/reservations-and-decimal-stock-migration.int.test.ts`, y cualquier
otro archivo que cite los dos nombres viejos.

Orden (la base local tiene aplicadas las dos migraciones con el nombre viejo):

1. **Revertir en la base local, con el código de la rama sin mergear**: `pnpm run db:rollback`
   revierte `…160100_reservations_and_decimal_stock`; para revertir después
   `…160000_inventory_movement_kind_consumption` hay que sacar temporalmente el directorio de la
   primera para forzar el orden, como hizo T1-T3 (bitácora, «Salida de los comandos»). Comprobar que
   `_prisma_migrations` ya no tiene ninguna de las dos como aplicada.
2. **Renombrar** los dos directorios a `20260923120000_inventory_movement_kind_consumption` y
   `20260923120100_reservations_and_decimal_stock` (`design.md > 4.0`), o a otro prefijo si `dev`
   tiene ya una migración posterior a `20260922160000_recipe_lines_percentage`: tienen que quedar
   **por detrás de la última de `dev`**. Actualizar los nombres en los tests y la guardia listados.
3. **`git merge origin/dev`**. Conflictos esperados (bitácora, «Parada tras T7»), y cómo se
   resuelven:
   - `lib/modules/pedidos/domain/order-cost.ts`: el cuerpo de `dev` (`RecipeCostLine.percentage`,
     `consumedQuantity` en la línea 132) **más** lo nuestro: sin `compareLots`/`compareBatches`
     locales (`dev` 96-119), importando `compareBatchesOldestFirst` de `inventario`, y
     `batch.stock` en vez de `String(batch.stock)` (`dev` 159).
   - `lib/modules/recetas/domain/recipe-view.ts` y `get-recipe.ts`: la forma de `dev`
     (`percentage`, `productUnitId`; `recipe-view.ts:42-44`, `get-recipe.ts:71-73`) con nuestro
     `productStock: string | null` (`'0.0000'` sin lotes) en lugar del `number` de `dev`.
   - `app/(private)/pedidos/components/order-ingredients-table.tsx`: `requiredOf` de `dev`
     (113-114, con `consumedQuantity` y `formatPercentage`) con nuestra cadena en `productStock` (sin
     los `.toString()` de `dev` 118, 181 y 187) y nuestros `aria-label`.
   - `tests/guards/guard-identificador-de-request.test.ts`: unión de las dos listas, con los nombres
     nuevos.
   - `tests/integration/pedidos/order-ingredients-cost.int.test.ts`,
     `tests/unit/inventario/product-catalog.test.ts`, `tests/unit/inventario/product-prisma.test.ts`,
     `tests/unit/pedidos-ui/order-form.test.tsx`: fixtures de `dev` (`percentage`, `type`,
     `ProductRef.unitId`) con nuestras cantidades en cadena o `Prisma.Decimal`.
   - `feature_list.json`: el de `dev`, conservando el estado de QC-141.
4. **Reaplicar**: `pnpm run db:migrate` (aplica `20260922160000_recipe_lines_percentage`, que
   **vacía `recipe_lines` también en la base local**, y después las dos nuestras renombradas),
   `pnpm exec prisma generate`, y regenerar la plantilla de la base de integración de esta rama.

**Hecho cuando:** el merge está commiteado sin marcadores de conflicto; ningún par de directorios de
`db/migrations/` comparte prefijo de fecha; las dos nuestras revierten y reaplican limpias sobre la
base con la migración de QC-147 aplicada; `pnpm run typecheck` sale **sin errores** (desaparecen
los nueve de `Product.type`, que `dev` ya arregló); y `./init.sh --rapido` verde con los tests de
T1-T5 y las guardias. Los tests de T6 y T7 pueden seguir verdes contra el contrato viejo: se
reescriben en T6 y T7.

*Estado al 2026-09-23 (tanda 2):* merge `fe240487`, renumeración `5e1d7572`; typecheck y lint limpios.
Abierto: (a) la base de desarrollo compartida `QuimiCloude` sigue con las dos migraciones con el
nombre viejo aplicadas (no se revirtió: es compartida y la acción se denegó); (b) `…120100` revierte
y reaplica limpia sobre una base efímera con QC-147 aplicada, pero `…120000` no se pudo revertir
ahí porque `db:rollback` elige por directorio y mover la carpeta se denegó. Ver bitácora.

## [x] T6 — Necesidad y reparto, dominio puro `[depende de TM y de la aprobación de E1]` — **REHACER** (enmienda del 2026-09-23)

Archivos: `lib/modules/pedidos/domain/order-requirement.ts`,
`lib/modules/inventario/domain/{plan-reservation,reservation}.ts`, `lib/modules/inventario/index.ts`,
`tests/unit/pedidos/order-requirement.test.ts`, `tests/unit/inventario/plan-reservation.test.ts`.

Se implementó con la fórmula `línea × pedido` y la unidad de la línea; `dev` ya no tiene ninguna de
las dos. Se rehace según `design.md > 6.1-6.2` enmendados:

- `buildRequirement(lines: { productId; percentage }[], orderQuantity)` con `consumedQuantity` del
  barril de `recetas`; fuera `RequirementSourceLine.quantity/unitId` y la multiplicación propia.
- `ReservationRequirementLine` sin `unitId`.
- `planReservation` sin `units` ni `convertQuantity`; techo al cuarto decimal (N1); producto sin
  unidad = línea no cubierta (E1).

**Hecho cuando:** `plan-reservation.test.ts` y `order-requirement.test.ts` verdes, sin base de
datos, para `R8`, `R9` (producto sin unidad arrastra al pedido), `R10`, `R11` (`0.0001 × 0.01 %`
aparta `0.0001`; `200 × 10 %` aparta `20` sin redondeo) y `R49` (receta vacía: necesidad vacía y
`reserved` sin asignaciones); ningún caso de unidad sin base común ni de conversión queda en esos
archivos, y `order-requirement.ts` no multiplica por su cuenta.

## [x] T7 — Reservas en la persistencia de `inventario` `[depende de T2, T4, T6]` — **reabierta para un ajuste parcial** (enmienda del 2026-09-23)

*Ajuste de la enmienda (lo demás de T7 está hecho y no se repite):* `createMaterialReservations(db)`
sin `UnitCatalog` ni `resolveUnitConversions` (`reservation-prisma.ts:4,86-92,119,166-171,307-311,370-375`);
`consumeWithoutReservation` con la necesidad nueva y `nothing_to_consume` cuando no hay apartado ni
necesidad (E2); `reservation.int.test.ts` con recetas en porcentaje. **Hecho cuando**, además de lo
de abajo, `reservation.int.test.ts` verde con esos cambios y un caso de `nothing_to_consume` que no
escribe nada.

Archivos: `lib/modules/inventario/adapters/driven/persistence/reservation-prisma.ts` (nuevo),
`product-prisma.ts` (`consumeBatchStock` exportada, `adjustBatchStock` con `overReserved`),
`batch-movement-prisma.ts` (`kind` y `orderId`), `lib/modules/inventario/domain/*` (tipos de
`design.md > 5.1`, `OrderNumberDirectory`, `BatchHistoryEntry`),
`tests/guards/guard-libro-de-inventario.test.ts` (censo de cuatro caminos).

- `createMaterialReservations(db, units)` con `syncForOrder`, `releaseForOrder`, `consumeForOrder`
  (`design.md > 6.3-6.5`), consumo con la pregunta 2 y N2 **(según F1.4)**.
- `ReservationQueries.findCoverageByOrderIds`, agregados de reservado y disponible por producto y
  por lote, historial unido.

**Hecho cuando:** `tests/integration/inventario/reservation.int.test.ts` verde para `R12` (solo la
diferencia en el libro), `R13`, `R17`, `R27`, `R28`, `R30`, `R32`, `R33`, `R39` (ningún `UPDATE`
ni `DELETE` sobre el libro en `lib/**`), y el censo de la guardia del libro pasa con
`consumeBatchStock`.

## [x] T8 — La unidad de trabajo de `pedidos` y su cableado `[depende de T7]`

Archivos: `lib/modules/pedidos/ports/{order-unit-of-work,order-write-repository}.ts` (nuevos),
`lib/modules/pedidos/adapters/driven/persistence/{order-unit-of-work-prisma,order-prisma}.ts`,
`lib/modules/pedidos/adapters/driven/persistence/order-number-directory-prisma.ts` (nuevo),
`lib/composition/index.ts`.

- `withOrderTransaction` con reintento del correlativo; `createOrderWriteRepository(db)`;
  `setReservedAt`; `lockAliveById`; `cancelAlive` con autor anulable.
- Cableado de `orderUnitOfWork`, `OrderNumberDirectory` y `ReservationQueries`.

**Hecho cuando:** `tests/integration/pedidos/order-sequence.int.test.ts` verde **sin cambios**,
`guard-arquitectura-modulos` verde (sin Prisma en composición, sin ciclo), `guard-ambito-empresa-pedidos`
verde con los métodos nuevos, y un test de integración demuestra que un fallo forzado después de
apartar deja sin escribir el pedido y la reserva (`R15`).

## [x] T9 — Crear, editar, cancelar y borrar con reserva `[depende de T8]`

Archivos: `lib/modules/pedidos/domain/{create-order,update-order,cancel-order,delete-order}.ts`,
`lib/composition/index.ts`.

- Según `design.md > 8`. Borrar libera **(según F1.4, N5)**. La edición a `ENTREGADO` consume
  (T10 aporta el consumo; esta task deja la rama llamándolo).

**Hecho cuando:** tests unitarios con dobles que registran el orden (permiso antes de abrir la
unidad) y tests de integración verdes para `R7`, `R12`, `R13`, `R14`, `R18`, `R19`, `R20` y `R41`,
y *(enmienda del 2026-09-23)* `R49`: crear y editar un pedido con receta sin líneas guarda sin error
y deja `reserved_at` nulo. Los datos de prueba usan recetas en porcentaje.

## [x] T10 — Entregar consume: Finalizar y edición `[depende de T8]` `[P con T9]`

Archivos: `lib/modules/pedidos/domain/transition-order.ts` (nuevo),
`lib/modules/pedidos/domain/{order-catalog,errors}.ts`,
`lib/modules/asignaciones/domain/{finish-assigned-order,errors}.ts`,
`lib/modules/errores/domain/{error-codes,error-catalog}.ts`, `lib/composition/index.ts`.

- `transitionAliveById` cableado a `createTransitionOrder`; `'insufficient_material'` traducido en
  `asignaciones`; código `insufficient_material` en el catálogo.

- *(Enmienda del 2026-09-23, tras aprobar E2.)* `nothing_to_consume` → resultado
  `'recipe_without_lines'` en `transitionAliveById`, `RecipeWithoutLinesError` en `pedidos`, su
  traducción en `asignaciones`, y el código `recipe_without_lines` en el catálogo
  (`design.md > 5.4`, `> 11`).

**Hecho cuando:** tests verdes para `R27`, `R28`, `R29`, `R30`, `R31`, `R32` y *(enmienda)* `R50`
por los **dos** caminos (Finalizar y edición), `guard-catalogo-de-errores` verde, y el E2E existente
`e2e/ejecucion-receta.spec.ts` sigue verde.

## [x] T11 — Migración que aparta los pedidos vivos `[depende de T2, T6]` `[P con T7-T10]`

Archivos: `db/migrations/20260923120200_reserve_existing_orders/{migration.sql,down.sql}` (o el
prefijo que toque tras TM: siempre posterior a las dos renombradas),
`tests/integration/inventario/reserve-existing-orders-migration.int.test.ts` (nuevo).

- PL/pgSQL según `design.md > 4.3` **enmendado el 2026-09-23**: lee `recipe_lines.percentage` y
  `products.unit_id`, calcula `ceil(pedido × % × 100) / 10000`, no lee `units` ni convierte, trata
  el producto sin unidad como no cubierto (E1) y no aparta nada para una receta sin líneas (E2).

**Hecho cuando:** el test de integración, sobre una base con dos empresas y pedidos vivos,
cancelados y entregados **y recetas en porcentaje**, comprueba `R43` (orden, todo-o-nada, solo
vivos, receta sin líneas no aparta), `R44` y la **paridad** con `planReservation` sobre los mismos
datos, incluidos un caso de techo a 4 decimales y uno de producto sin unidad (sustituye al de unidad
sin base común).

## [x] T12 — El proceso diario `[depende de T8]` `[P con T9-T11]`

Archivos: `vercel.json` (nuevo), `app/api/cron/caducar-pedidos/route.ts` (nuevo),
`lib/modules/pedidos/adapters/driving/order-expiry-cron-route.ts` (nuevo),
`lib/modules/pedidos/adapters/driven/config/cron-secret-env.ts` (nuevo),
`lib/modules/pedidos/domain/{expire-stale-orders,order-expiry}.ts` (nuevos),
`lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` (`findExpirableOrders`),
`.env.example`, `lib/composition/index.ts`.

- Según `design.md > 9`, con la hora de N7 y el aviso de la pregunta 3 **(según F1.4)**.

**Hecho cuando:** tests verdes para `R21` (motivo exacto, sin autor, `expire` en el libro), `R22`,
`R23` (lee `vercel.json` y comprueba ruta y una sola expresión diaria), `R24` (401 y 500 sin tocar
el repositorio), `R25` (dos ejecuciones seguidas y dos solapadas en integración) y `R26` (un pedido
que falla no impide los demás y se registra el evento); `tests/unit/documentos/route-segment-config.test.ts`
o uno equivalente comprueba los literales de la ruta nueva.

*Estado al 2026-09-23 (tanda 3):* **hecha**, empresa por empresa según `design.md > 9.1` enmendado
(`3c721563`, `2ac1333f`, `d9209950`, `1b6caa8b`, `3df0a342`). `guard-ambito-empresa-pedidos` verde sin
excepciones. Ver bitácora, «Tanda 3».

## [x] T13 — Inventario muestra reservado, disponible y el historial `[depende de T5, T7]`

Archivos: `lib/modules/inventario/domain/{list-products,list-product-batches,list-batch-movements}.ts`,
`lib/modules/inventario/adapters/driving/batch-actions.ts`,
`app/(private)/inventario/components/{product-columns,product-batches-panel,batch-history,adjust-batch-dialog}.tsx`.

- Según `design.md > 10`, con el historial dentro del lote **(según F1.4, pregunta 4)**.

**Hecho cuando:** tests verdes para `R34`, `R36`, `R37`, `R38`, `R40` (sin permiso no se lee nada)
y `R42` (lote de otra empresa = inexistente), y la guardia de viewport de inventario sigue verde.

## [x] T14 — Cobertura del pedido en Pedidos `[depende de T7, T9]` `[P con T13]`

Archivos: `lib/modules/pedidos/domain/*` (consulta de cobertura), `app/(private)/pedidos/**`
(fila y hoja), `lib/composition/index.ts`.

- Una consulta por página, sin N+1. Etiquetas de N6 **(según F1.4)**.

**Hecho cuando:** tests de componente y de caso de uso verdes para `R35`, con una sola llamada a
`findCoverageByOrderIds` por página.

## [x] T15 — Concurrencia y aislamiento en integración `[depende de T9, T10]`

Archivos: `tests/integration/pedidos/order-reservation-concurrency.int.test.ts` (nuevo),
`tests/integration/aislamiento.json` si procede.

**Hecho cuando:** con dos conexiones reales, dos altas simultáneas de 1.500 sobre 2.000 dejan
exactamente una apartada (`R16`), una merma simultánea a un apartado no deja el lote en negativo,
y ninguna combinación de las operaciones de T9 y T10 sobre el mismo producto se interbloquea en
cien vueltas.

## [x] T16 — E2E `[depende de T10, T13, T14]`

> **Cerrada el 2026-09-23.** `reserva-de-material`, `ejecucion-receta` y `ajuste-de-inventario` en Chromium y WebKit: 14/14 verdes sobre `QuimiCloude_QC141` (commits `5b0794ea`, `b1e7b8a3`, `a6f3d073`; detalle en la bitácora, «Tanda 4»).

Archivos: `e2e/reserva-de-material.spec.ts` (nuevo).

- El recorrido de `design.md > 12` (fila E2E), *(enmienda del 2026-09-23)* con una receta de una
  sola línea al 100,00 %.

**Hecho cuando:** `pnpm run e2e -- reserva-de-material` verde en local y en el gate completo
(`R48`).

## [x] T17 — Documentación y trazabilidad `[depende de T1-T16]`

> **Cerrada el 2026-09-23.** Mapa R1–R50 completo en la bitácora; `./init.sh` completo verde (643/643 archivos, sin rojos, baseline vacío).

Archivos: `docs/architecture.md` (pregunta 2 del dominio: el lote ya tiene consumidor; «Cron
interno» ya existe como caso, se añade que el primero es este y su variable), 
`progress/impl_QC-141-reserva-de-material-del-pedido.md` (mapa `R1..R50 → test`; enmienda del
2026-09-23).

**Hecho cuando:** los 50 requisitos tienen test en el mapa, `R47` lo cubre
`guard-dependencias-aprobadas` sin filas nuevas en `docs/dependencias.md`, y `./init.sh` completo
termina en verde.

---

# Enmienda del review (2026-09-23) — cerrada en la vuelta 2, salvo TC (absorbida por TC2)

> Decisión D21 de `requirements.md`; diseño en `design.md > 0.4` y las secciones que allí se citan.
> Orden: **TR primero**; después, en este orden salvo `[P]`. Cada task cierra con
> `./init.sh --rapido`; TC con `./init.sh` completo. Los comentarios de producción no citan fichas,
> requisitos ni `design.md`; `R<n>` va en el nombre de los tests.

## [x] TR — Re-sincronizar con `origin/dev` (QC-145 y `a01c90cb`) `[primera de lo pendiente]`

Archivos: todo lo que traiga el merge; `db/migrations/20260923120000_inventory_movement_kind_consumption/`,
`…120100_reservations_and_decimal_stock/` y `…120200_reserve_existing_orders/` (se renombran);
`tests/guards/guard-identificador-de-request.test.ts` (`MIGRACIONES_ESPERADAS`) y todo test que
cite los tres nombres; `lib/modules/pedidos/ports/order-write-repository.ts`,
`lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` (`setStatus`),
`lib/modules/pedidos/domain/transition-order.ts`,
`tests/integration/pedidos/order-reservation.int.test.ts`, `tests/unit/pedidos/transition-order.test.ts`.

1. **Poner la base propia en su sitio, antes de mergear** (con el código de la rama tal cual, porque
   los `down.sql` son los de los nombres actuales). En `QuimiCloude_QC141` (a la que apunta el
   `.env` del worktree; **nunca** la compartida `QuimiCloude`): `db:rollback` de `…120200`, luego
   `…120100`, luego `…120000`, forzando el orden como en TM. **Aviso** (`design.md > 15`): los E2E
   dejaron asientos `consumption` y existencias con decimales, y los `down` de `…120100` y
   `…120000` **fallan a propósito** con esos datos. **Si fallan, PARAR y preguntar al humano**: no
   se borran filas a mano ni se recrea la base sin su permiso. Comprobar al final que
   `_prisma_migrations` no tiene ninguna de las tres como aplicada.
2. **Renumerar** a `20260923150000_…`, `20260923150100_…` y `20260923150200_…`
   (`design.md > 4.0`, segunda renumeración), o al prefijo que haga falta para quedar **por detrás
   de la última migración de `dev`** en el momento del merge. Actualizar nombres en tests y guardia.
3. **`git merge origin/dev`.** Conflictos esperados según el review, a confirmar:
   - `db/schema.prisma`: `Order.finishedAt` de QC-145 **y** nuestro `reservedAt`; `ProductBatch`
     con `presentation_id`/`unit_cost` anulables (`a01c90cb`) **y** nuestro `stock Decimal(14,4)`.
   - `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts`: QC-145 hace que
     `transitionAliveOrder` escriba `finished_at`. **No se conserva ahí**: ese cambio se traslada a
     `setStatus` (paso 4) y la función se borra en Tm2.
   - `update-order.ts`, `order-input.ts`, `order-transitions.ts` y la UI de edición: la forma de
     QC-145 (la edición no mueve el estado) con nuestro recálculo de reserva; la rama de consumo se
     retira en TB4.
   - `asignaciones/domain/finish-assigned-order.ts`: lo de QC-145 con nuestra traducción de
     `insufficient_material` y `recipe_without_lines`.
   - `product-prisma.ts`, `product-form.tsx` y los esquemas de alta de lote (`a01c90cb`) con
     nuestra existencia decimal.
   - `lib/composition/index.ts`, `tests/guards/guard-identificador-de-request.test.ts` (unión, con
     los nombres nuevos), `feature_list.json` (el de `dev`, conservando el estado de QC-141).
4. **Adaptar el Finalizar a `finished_at`** (`design.md > 5.3` y `> 5.4` enmendados): `setStatus`
   escribe `status = 'ENTREGADO'` y `finished_at` en el mismo `UPDATE` condicional, con el valor
   que escribe QC-145 en `dev` (anotar en la bitácora de dónde sale); `createTransitionOrder` hace
   consumo + `setStatus` + `setReservedAt(null)` en una unidad, y todo resultado distinto de `'ok'`
   la deshace.
5. **Reaplicar**: `pnpm run db:migrate` sobre `QuimiCloude_QC141` (aplica
   `20260923120000_orders_finished_at`, `20260923140000_product_batch_nullable_machine` y las tres
   nuestras renumeradas), `pnpm exec prisma generate`, y regenerar la plantilla de integración.
   **No correr la app ni E2E sobre esa base hasta cerrar Tm5-Tm6** (tocan `…150200`).

**Hecho cuando:** merge commiteado sin marcadores; ningún par de directorios de `db/migrations/`
comparte prefijo y las tres nuestras van por detrás de la última de `dev`; `_prisma_migrations` de
`QuimiCloude_QC141` tiene las de `dev` y las tres con el nombre nuevo, ninguna con el viejo;
`pnpm run typecheck` sin errores; tests verdes para **R27** y **R51** (Finalizar con material:
`ENTREGADO`, `finished_at` no nulo, consumo; con `insufficient_material` y con
`recipe_without_lines`: `status`, `finished_at`, lotes, libro y `products.stock` sin cambios) y
**R50**; `./init.sh --rapido` verde, con los rojos que traiga `dev` (si los trae) declarados como
heredados según `docs/verification.md` (`design.md > 15`).

## [x] TB1 — Comentarios de producción sin citas `[depende de TR]`

Archivos: `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` (hoy `:772`),
`lib/composition/index.ts` (hoy `:997`), y cualquier otro que salga del barrido.

- Quitar «R21-R26» y «T12, design.md > 9»; dejar el motivo.
- Barrer el diff de la rama contra `origin/dev` buscando en comentarios de producción (`lib/`,
  `app/`, `db/` salvo lo que la convención exceptúe) `R\d+`, `T\d+`, `QC-\d+`, `design.md`,
  `requirements.md`, `tasks.md`.

**Hecho cuando:** el barrido no encuentra ninguna cita en comentarios de producción añadidos por la
rama, y la lista de comandos y resultado queda en la bitácora.

## [x] TB2 — El proceso diario re-comprueba `reserved_at` bajo el candado `[depende de TR]`

Archivos: `lib/modules/pedidos/domain/expire-stale-orders.ts`, el tipo de fila que devuelve
`lockAliveById` (`OrderRow` o el que corresponda) y su adaptador,
`tests/unit/pedidos/expire-stale-orders.test.ts`,
`tests/integration/pedidos/order-expiry.int.test.ts`.

- `lockAliveById` devuelve `reservedAt`; `expireOne` no hace nada si es `null` o posterior al
  umbral, ni si el estado no es `PENDIENTE` (`design.md > 9.2.1`).

**Hecho cuando:** unit verdes para **R53** (edición intercalada que reinicia el plazo y que deja
`reserved_at` nulo: no cancela, no libera) y **R22**; integración verde con la edición intercalada
por otra conexión (**R53**); `R21` y `R25` siguen verdes.

## [x] TB3 — Excepción con nombre en `guard-ambito-empresa-pedidos` `[depende de TR]` `[P con TB2]`

Archivos: `lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma.ts`,
`tests/guards/guard-ambito-empresa-pedidos.test.ts`.

- Fuera el alias: `import { prisma } from '@/lib/shared/db/prisma'`.
- Exención por nombre de archivo con el motivo que cita D21; en el exento, todo `prisma.` es
  `prisma.$transaction`; ningún `import { prisma as … }` en `pedidos` (`design.md > 5.2.1`).

**Hecho cuando:** la guardia está verde con el archivo importando `prisma`; tres anti-placebos con
fuente fabricada salen en rojo —otra consulta en el archivo exento, un alias en otro archivo de
`pedidos`, y una consulta sin empresa en un archivo no exento—; el caso de la guardia lleva **R58**
en el nombre.

## [x] TB4 — Solo el Finalizar consume: fuera la entrega por la edición `[depende de TR]`

Archivos: `lib/modules/pedidos/domain/update-order.ts`, `lib/modules/pedidos/domain/errors.ts` (si
un error queda sin lanzador), `tests/unit/pedidos/update-order.test.ts`,
`tests/integration/pedidos/order-reservation.int.test.ts`, `e2e/reserva-de-material.spec.ts`,
y los tests cuyo nombre cite `R29`.

- `update-order.ts` sin rama `ENTREGADO`, sin `consumeForOrder` y sin los errores que solo ella
  lanzaba (`design.md > 5.4` y `> 8` enmendados).
- Tests de `R29`: se borran o se reescriben contra **R52**.
- E2E: el paso final entrega B por el **Finalizar de la planta** (`design.md > 12` enmendado).

**Hecho cuando:** unit verde para **R52** (ninguna edición llama a `consumeForOrder` ni a
`setStatus`); integración: una edición no escribe `consumption` ni `consume`; ningún test cita
`R29`; `R12` verde sin «estado» entre los campos editables; `guard-catalogo-de-errores` verde.

## [x] Tm1 — Marcas «provisional» (hecho en el spec) y mapa `[depende de TB4]`

> **Hecha** (marcada en la enmienda del review 2, m-V2-4): la bitácora tiene «R → test: mapa completo
> R1–R58» con «R29 — retirado (D21)» y dice que E1, E2 y las preguntas 1-7 están resueltas.

Archivos: `progress/impl_QC-141-reserva-de-material-del-pedido.md`.

El spec ya no marca nada como provisional (esta enmienda). Queda reflejarlo en la bitácora.

**Hecho cuando:** el mapa de la bitácora va de R1 a R58, con «R29 — retirado (D21)», y no dice que
E1/E2 o ninguna pregunta esperen aprobación.

## [x] Tm2 — Retirar los caminos de escritura muertos `[depende de TB3, TB4]`

Archivos: `lib/modules/pedidos/adapters/driven/persistence/{order-prisma,order-catalog-prisma}.ts`,
`tests/integration/pedidos/order-sequence.int.test.ts`,
`tests/guards/guard-ambito-empresa-pedidos.test.ts` (anti-placebo), `tests/guards/module-contract*`
si lista esos métodos.

- Borrar `createOrder` y `transitionAliveOrder`; el `INSERT` del correlativo, solo en
  `insertAliveOrder` (`design.md > 5.3` enmendado).
- `order-sequence.int.test.ts` sobre `withOrderTransaction` + `createOrderWriteRepository`.

**Hecho cuando:** ningún `createOrder` ni `transitionAliveOrder` en `lib/**`; un solo `INSERT INTO
orders` en el driven de `pedidos`; `order-sequence.int` verde (**R15** del correlativo); el
anti-placebo de la guardia apunta a `insertAliveOrder` y sigue saliendo en rojo con su fuente
fabricada.

## [x] Tm3 — Guardia: quien consume recalcula `products.stock` `[depende de TR]` `[P con TB2, TB3]`

Archivos: `tests/unit/inventario/qc121-alcance.test.ts` (o la guardia donde viva
`EXCEPCIONES_SIN_RECALCULO`).

- Toda función de `lib/**` que llama a `consumeBatchStock` llama también a
  `recalculateProductStock` (`design.md > 6.4` enmendado).

**Hecho cuando:** la comprobación está verde con los llamantes actuales de `reservation-prisma.ts`,
y dos anti-placebos de fuente fabricada (sin recálculo: rojo; con recálculo: verde) llevan **R28** en
el nombre.

## [x] Tm4 — Errores del proceso diario `[depende de TB2]`

Archivos: `lib/modules/pedidos/domain/expire-stale-orders.ts`,
`lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` (`findExpirableOrders` con
cursor), `lib/modules/pedidos/adapters/driving/order-expiry-cron-route.ts`,
`tests/unit/pedidos/expire-stale-orders.test.ts`, el test del handler.

- Bucle y registro de `design.md > 9.2.1`: `stage`, `code` (`codeOf`), cursor
  `(reserved_at, id)`, log en todo fallo, `500` si hubo alguno.
- Docblock de `expire-stale-orders.ts` que diga lo que el código hace; el test de «una empresa que
  falla al listar sus candidatos» pasa a hacerla fallar de verdad.

**Hecho cuando:** unit verdes para **R26** (cada fallo lleva `id`, `companyId` y `code`), **R54**
(fallo al listar empresas → log + 500; fallo al buscar candidatos de una empresa → la siguiente se
procesa) y **R55** (un pedido que falla siempre, en una empresa con más de 100 candidatos, sale una
vez en `failed` y la empresa siguiente se procesa); el log no lleva mensajes de error ni datos del
pedido; `R24` y `R25` siguen verdes.

## [x] Tm5 — Orden de lotes de la migración igual que en TypeScript `[depende de TR]` `[P con TB1-TB4]`

## [x] Tm6 — `down` de la migración que aparta, coherente tras uso `[depende de Tm5]`

Las dos tocan `db/migrations/20260923150200_reserve_existing_orders/` (nombre tras TR) y
`tests/integration/inventario/reserve-existing-orders-migration.int.test.ts`; van seguidas.

Procedimiento con la base propia, **antes de cualquier E2E o uso de la app sobre ella**:
`db:rollback` de `…150200` con el `down.sql` todavía sin cambiar; editar `migration.sql` (Tm5) y
`down.sql` (Tm6); `db:migrate`; regenerar la plantilla de integración.

- **Tm5** (`design.md > 4.3.1`): comparador por pares `lot_precedes` en `pg_temp`, ordenación por
  inserción dentro de cada fecha, `COLLATE "C"`. **No** se toca `compareBatchesOldestFirst` hasta
  que el humano responda la pregunta abierta 7.
- **Tm6** (`design.md > 4.3.2`): bloque que falla si algún pedido apartado por la migración tiene
  otro asiento o un `reserved_at` distinto del de la migración.

**Hecho cuando:** paridad verde con `'-X'`/`'5'`, `'a'`/`'B'` y la mezcla de cuatro lotes sin ciclo
(**R56**, **R43**); el `down` falla con un `release` posterior sin cambiar nada y revierte limpio sin
actividad (**R57**); `R44` sigue verde.

## [x] Tm7 — La receta se lee con el cliente de la transacción `[depende de TB4]`

Archivos: `lib/modules/pedidos/ports/order-unit-of-work.ts` (`recipes` en el scope),
`lib/modules/recetas/adapters/driven/persistence/*` (fábrica sobre cliente, si no existe),
`lib/composition/index.ts`, `lib/modules/pedidos/domain/{create-order,update-order,transition-order}.ts`,
sus tests unitarios.

- `design.md > 5.2.2`.

**Hecho cuando:** unit verdes con un lector global de recetas que falla si se le llama dentro de
`run` (crear, editar y finalizar); `guard-arquitectura-modulos` verde (sin Prisma en composición,
sin ciclo); R7, R12, R27 y R31 siguen verdes.

## [ ] TC — Cierre: E2E, gate completo y trazabilidad `[depende de TR, TB1-TB4, Tm1-Tm7]`

> **Absorbida por TC2** (enmienda del review 2): el rollback y los E2E de la vuelta 2 se hicieron
> sobre una rama que ya no se integra con `dev`, y el `./init.sh` completo no terminó. Se marca
> `[x]` junto con TC2, no antes.

Archivos: `progress/impl_QC-141-reserva-de-material-del-pedido.md`.

- **Rollback** de las tres migraciones renumeradas probado en una base efímera, como en TM
  (`…150200`, `…150100`, `…150000`, y `migrate deploy` las reaplica limpias).
- **E2E en Chromium y WebKit** sobre la rama sincronizada: `reserva-de-material`, `ejecucion-receta`,
  `ajuste-de-inventario` y los E2E de Pedidos y del Finalizar que traiga QC-145. **Una sola E2E a la
  vez en la máquina** (`progress/current.md`, puerto y base compartidos).
- **`./init.sh` completo** verde; rojos heredados de `dev`, si los hay, declarados.
- Mapa R1-R58 completo (R29 retirado) y, para el PR, la nota del review sobre las guardias de
  fichas cerradas que cambian lo que afirmaban (`qc91-alcance`, `qc121-alcance`, `qc111-alcance`,
  `pedidos/scope`, `module-contract`, `credencial/scope`) más la excepción nueva de D21.

**Hecho cuando:** los E2E verdes en los dos navegadores (**R48**), `./init.sh` completo verde, y la
bitácora con comandos y resultados.

---

# Enmienda del review 2 (2026-09-23) — PENDIENTE

> Review de la vuelta 2 (V2-B1..V2-B4, m-V2-1..m-V2-5) y decisión **D22** de `requirements.md`;
> diseño en `design.md > 0.5` y las secciones que allí se citan. Orden: **TR2 primero**; después
> TD22 y las demás en este orden salvo `[P]`. Cada task cierra con `./init.sh --rapido`; TC2 con
> `./init.sh` completo. Los comentarios de producción no citan fichas, requisitos, `design.md` ni
> etiquetas de review (`B1`, `m2`…); `R<n>` va en el nombre de los tests.
> **TD22 no empieza** hasta que el humano responda las preguntas abiertas **8** y **9** (R65, R66);
> las demás tasks no dependen de ellas.

## [ ] TR2 — Re-sincronizar con `origin/dev` (QC-122, QC-151, `daa400c5`) `[primera de lo pendiente]`

Archivos: todo lo que traiga el merge; los 10 en conflicto según el review:
`app/(private)/pedidos/components/{order-form,order-table}.tsx`, `lib/composition/index.ts`,
`lib/modules/pedidos/adapters/driving/order-actions.ts`, `lib/modules/pedidos/index.ts`,
`tests/integration/aislamiento.json`, `order-form.test.tsx`, `order-sheet.test.tsx`,
`pedidos-viewport.test.tsx`, `order-actions.test.ts`, `data-table-alcance.test.ts`; y
`tests/baseline-rojos.json` si `daa400c5` deja fuera el rojo heredado.

1. **Migraciones.** El review dice que `dev` no trae migraciones nuevas. Comprobarlo con
   `git diff --name-only HEAD...origin/dev -- db/migrations`. **Si trae alguna con prefijo posterior a
   `20260923150000`**, renumerar las tres nuestras por detrás de la última de `dev` con el
   procedimiento de TR (pasos 1-2: revertir antes en `QuimiCloude_QC141` en orden `…150200`,
   `…150100`, `…150000`; **si un `down` falla por los datos de los E2E, PARAR y preguntar al
   humano**; nunca tocar la base compartida `QuimiCloude`), y actualizar nombres en tests y en
   `guard-identificador-de-request`. Si no trae ninguna, no se renombra nada.
2. **`git merge origin/dev`.** Resolución de los conflictos:
   - `order-form.tsx`: la cotización de QC-151 (recotizar a 500 ms, atenuado, guion sin importe) **y**
     nuestra columna «restante» sobre el disponible en cadena decimal (R6, N4) y los `aria-label`.
   - `order-table.tsx`: búsqueda y columnas de QC-122 **y** nuestra etiqueta de cobertura (N6, R35).
   - `lib/composition/index.ts`, `order-actions.ts`, `pedidos/index.ts`: unión (acción y consulta de
     cotización de QC-151, búsqueda de QC-122, y nuestro `orderUnitOfWork`, cobertura y caducidad).
     Anotar en la bitácora el nombre y la ruta reales de la consulta de cotización (lo usa TD22).
   - `aislamiento.json`: unión de las dos listas.
   - Tests en conflicto: casos de las dos ramas; fixtures de `dev` con nuestras cantidades en cadena
     o `Prisma.Decimal`. Ningún caso de ninguna de las dos se borra ni se debilita.
3. **Base propia al día**: `pnpm run db:migrate` sobre `QuimiCloude_QC141` (a la que apunta el `.env`
   del worktree), `pnpm exec prisma generate` y regenerar la plantilla de la base de integración.
4. Con `daa400c5`, `guard-arquitectura-modulos` debe salir verde: si `tests/baseline-rojos.json`
   sigue listando ese rojo, se retira de ahí.

**Hecho cuando:** merge commiteado sin marcadores; ningún par de directorios de `db/migrations/`
comparte prefijo y las tres nuestras van por detrás de la última de `dev`; `_prisma_migrations` de
`QuimiCloude_QC141` al día con los nombres vigentes; `pnpm run typecheck` sin errores;
`guard-arquitectura-modulos` verde sin baseline; `./init.sh --rapido` verde; la bitácora lista los
conflictos reales frente a los 10 esperados.

## [ ] TD22 — Coste del pedido por promedio de los lotes con disponible `[depende de TR2 y de las preguntas 8 y 9]`

Archivos (a confirmar en el paso 1): `lib/modules/pedidos/domain/{order-cost,resolve-ingredients-cost,update-order,create-order}.ts`,
la consulta de cotización de QC-151 y su esquema de entrada, `order-form.tsx` (envía `orderId` en
edición), `lib/modules/inventario/domain/{costing-batch,product-catalog}.ts`,
`lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`,
`lib/composition/index.ts`, `tests/unit/pedidos/order-cost.test.ts`,
`tests/integration/pedidos/order-ingredients-cost.int.test.ts`,
`tests/integration/pedidos/order-reservation.int.test.ts`, los tests de QC-151 que afirmen el
cálculo viejo, `e2e/pedidos-cotizacion.spec.ts`.

1. **Confirmar en el código** (tras TR2) dónde vive el cálculo que comparten la cotización de QC-151 y
   el importe de QC-123 (`design.md > 6.6`), y anotarlo en la bitácora con `archivo:línea`. Si hay
   dos cálculos, dejar uno solo antes de cambiarlo (R62).
2. `CostingBatch.available` y `findCostingBatches(ids, companyId, { excludeOrderId? })` con el
   agregado del libro de reservas, filtrando por empresa las dos tablas y manteniendo la exclusión de
   lotes sin presentación o sin coste (según la respuesta a la pregunta 9).
3. `calculateLineCost`: suma de disponibles para la cobertura, promedio simple de **todos** los lotes
   con disponible, sin ordenar ni cortar; misma escala interna y un solo redondeo final.
   `order-cost.ts` deja de importar `compareBatchesOldestFirst`.
4. `resolveIngredientsCost(..., { orderId? })`; la edición pasa el `id` y la cotización de edición
   también (según la respuesta a la pregunta 8).
5. Reescribir los casos de QC-123/QC-151 que afirman «acumula hasta cubrir» o «promedio de los usados»
   contra R59-R61, con «D22 de QC-141 deroga QC-123 D3/D4» en el nombre, y listarlos en la bitácora
   para la nota del PR.

**Hecho cuando:** unit verdes para **R59** (el ejemplo de D22 da `370.0000`), **R60** (no ponderado,
lote no necesario incluido, lote con disponible cero excluido, orden indiferente), **R61** y **R63**;
integración verde para **R59/R64** (alta de 30 con A/B/C: importe `370.0000`, apartado 20 de A y 10
de B, nada de C), **R60** (lote apartado entero por otro pedido fuera del promedio), **R61**
(disponible insuficiente con existencia total suficiente → sin importe), **R62** (cotización y alta
iguales, y los dos nulos), **R63** (edición recalcula, también a nulo), **R65** y **R66**, y el caso
de aislamiento con `excludeOrderId` de otra empresa; `guard-ambito-empresa-inventario` y
`guard-arquitectura-modulos` verdes; `R8`, `R12`, `R16` siguen verdes (la reserva no cambia).

## [ ] TV2-B1 — Comentarios de producción sin citas (V2-B1) `[depende de TR2]` `[P con TD22]`

Archivos: `lib/composition/index.ts` (hoy `:983`),
`lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` (`:543`),
`lib/modules/pedidos/domain/{create-order,transition-order,update-order}.ts` (`:142`, `:47`, `:132`),
`lib/modules/pedidos/ports/order-unit-of-work.ts` (`:10`),
`lib/modules/recetas/adapters/driven/persistence/{company-scope,recipe-catalog-prisma}.ts` (`:5`,
`:161`). Las líneas son las del review sobre `c13add6a`; tras TR2 pueden moverse.

- Quitar «`design.md > 5.2.2`», «`design.md > 5.3`», «m2», «m7» y dejar el motivo.
- **Al final de la vuelta** (después de TC2 salvo el `./init.sh` completo, no a mitad), repetir el
  barrido de TB1 sobre las líneas `+` de `git diff $(git merge-base origin/dev HEAD) HEAD -- lib app
  db components` buscando en comentarios `R\d+`, `T\w*\d+`, `QC-\d+`, `design.md`,
  `requirements.md`, `tasks.md` y etiquetas de review (`\bB\d\b`, `\bm\d\b`, `V2-`).

**Hecho cuando:** el barrido final no encuentra ninguna cita en comentarios de producción añadidos
por la rama, con el comando y su salida en la bitácora.

## [ ] TV2-B2 — `qc145-estado-solo-planta` correcto con QC-141 ya en `dev` (V2-B2) `[depende de TR2]` `[P con TD22]`

Archivos: `tests/unit/.../qc145-estado-solo-planta.test.ts` (hoy `:363-366`).

- El esperado deja de sumar `ESPERADOS_DE_ESTA_RAMA` a mano: es la **unión sin duplicar** de los
  modelos del merge-base y `['ReservationMovement']` (`design.md > 12`, enmienda del review 2).

**Hecho cuando:** el caso está verde hoy; un caso con fuente fabricada en la que el esquema del
merge-base **ya** contiene `ReservationMovement` sigue verde (sin duplicado); otro con un modelo
nuevo no declarado sale en rojo; los nombres de los casos citan el requisito de QC-145 que ya
citaban.

## [ ] TV2-B3 — El correlativo agotado vuelve a dar `duplicate_number` (V2-B3) `[depende de TR2]` `[P con TD22]`

Archivos: `lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma.ts`,
`tests/integration/pedidos/order-duplicate-number.int.test.ts`, `tests/unit/pedidos/order-actions.test.ts`
(solo si hace falta), el test unitario del adaptador si existe.

- `withOrderTransaction` lanza `DuplicateOrderNumberError` cuando el tercer intento vuelve a chocar
  con `orders_company_year_sequence_key`; otros errores suben igual (`design.md > 5.2.3`).
- `order-duplicate-number.int` vuelve a afirmar lo que afirmaba en `899c3d22`: comparar con
  `git show 899c3d22:tests/integration/pedidos/order-duplicate-number.int.test.ts`.

**Hecho cuando:** `order-duplicate-number.int` verde afirmando `DuplicateOrderNumberError` /
`duplicate_number` tras **3** transacciones, sin fila duplicada y sin apartado escrito; el diff del
test contra `899c3d22` no quita ninguna aserción (o la bitácora explica cada una); `order-sequence.int`
y `order-sequence-race.int` siguen verdes (**R15**); `guard-catalogo-de-errores` verde.

## [ ] TV2-B4 — Integración con `dev` y cotización (V2-B4) `[depende de TR2, TD22]`

No es una task de escritura propia: V2-B4 lo cierran **TR2** (merge), **TD22** (D22, R59-R66) y
**TC2** (E2E y gate sobre la rama mergeada).

**Hecho cuando:** TR2, TD22 y TC2 están `[x]`, y `git merge-tree --write-tree HEAD origin/dev` sobre
el `origin/dev` del momento del cierre no da conflictos (si `dev` volvió a avanzar, se repite TR2
antes de TC2).

## [ ] TV2-m1 — Comentarios que ya no son verdad `[depende de TR2]` `[P con TV2-B1]`

Archivos: `order-prisma.ts` (`:615-621`), `order-unit-of-work-prisma.ts` (`:12`),
`lib/modules/asignaciones/domain/errors.ts` (`:159-160`).

- Describir `setAliveOrderStatus` por lo que hace, sin compararla con `transitionAliveOrder`; quitar
  «mismo tope que `createOrder`» (decir el tope); «desde la planta», sin «desde la edicion».

**Hecho cuando:** ningún comentario de `lib/**` nombra `transitionAliveOrder` ni `createOrder`, y el
de `asignaciones/domain/errors.ts` solo habla de la planta; sin citas (TV2-B1).

## [ ] TV2-m2 — `setStatus` distinto de `ok` tras consumir deshace la unidad `[depende de TR2]` `[P con TD22]`

Archivos: `lib/modules/pedidos/domain/transition-order.ts` (`:62-63`),
`tests/unit/pedidos/transition-order.test.ts`.

- Lanzar dentro de la unidad y devolver el resultado fuera (`design.md > 5.4`, enmienda del review 2).

**Hecho cuando:** unit verde con **R51** en el nombre: `setStatus` doble que devuelve `'stale'` tras
un consumo `consumed` → la unidad se deshace (el doble de `run` ve la excepción) y el resultado es
`'stale'`; los casos R27, R30, R31, R50 y R51 siguen verdes.

## [ ] TV2-m3 — Alias y `tx.` en `guard-ambito-empresa-pedidos` `[depende de TR2]` `[P con TV2-m2]`

Archivos: `tests/guards/guard-ambito-empresa-pedidos.test.ts`.

- `aliasDePrisma` reconoce `import { a, prisma as X }`, comillas dobles e
  `import * as X from '@/lib/shared/db/prisma'`.
- En el archivo exento, ningún `tx.<modelo>` (`design.md > 12`, enmienda del review 2).

**Hecho cuando:** cuatro anti-placebos nuevos con fuente fabricada, con **R58** en el nombre, salen
en rojo (varios especificadores, comillas dobles, `import * as`, `tx.order.findMany` en el exento), y
la guardia está verde sobre el código real.

## [ ] TV2-m4 — Spec al día (m-V2-4) `[hecha en el spec; queda la bitácora]`

Hecho en esta enmienda: `requirements.md` ya no dice que la pregunta 7 siga abierta; el título
«PENDIENTE» del bloque del review 1 se cambió; Tm1 marcada `[x]`; TC queda absorbida por TC2.

**Hecho cuando:** la bitácora lo registra y TC y TC2 se marcan `[x]` juntas al cerrar.

## [ ] TV2-m5 — Lista exacta de escrituras de `status:` en `order-prisma.ts` `[depende de TR2]` `[P con TV2-m3]`

Archivos: `qc145-estado-solo-planta.test.ts` (caso R10, segundo).

- Fijar la lista exacta de funciones de `order-prisma.ts` con un bloque `status:` (confirmar en el
  código; hoy `setAliveOrderStatus` con `status: to` y `cancelAlive`) y afirmar que no hay más.

**Hecho cuando:** el caso está verde sobre el código real, y un anti-placebo con una escritura nueva
`status: <variable>` en otra función de `order-prisma.ts` sale en rojo.

## [ ] TC2 — Cierre: E2E, gate completo y trazabilidad `[depende de TR2, TD22, TV2-B1..TV2-B4, TV2-m1..TV2-m5]`

Archivos: `progress/impl_QC-141-reserva-de-material-del-pedido.md`.

- **Rollback** de las tres migraciones probado en base efímera, como en TC, **solo si TR2 las
  renumeró**; si no, basta con la prueba de la vuelta 2.
- **E2E en Chromium y WebKit** sobre la rama mergeada con el `origin/dev` actual:
  `reserva-de-material`, `ejecucion-receta`, `ajuste-de-inventario`, `pedidos`,
  `pedidos-terminados`, **`pedidos-busqueda`** y **`pedidos-cotizacion`** (con el caso de D22 de
  TD22 si se pudo sembrar). **Una sola E2E a la vez en la máquina**; borrar `.next/dev/types` antes
  del gate si el `next dev` del E2E lo dejó truncado.
- **`./init.sh` completo** que **termine**, con la máquina liberada; rojos heredados de `dev`, si
  los hay, declarados según `docs/verification.md`. No relanzarlo sin permiso del humano si lo mata
  la memoria: parar y avisar.
- Barrido final de TV2-B1.
- Mapa **R1-R66** en la bitácora (R29 retirado) y, para el PR, la nota con las guardias de fichas
  cerradas que cambian lo que afirman (las de TC más `qc145-estado-solo-planta`) y los tests de
  QC-123/QC-151 reescritos por D22.

**Hecho cuando:** E2E verdes en los dos navegadores (**R48**, y R59 si se sembró), `./init.sh`
completo verde, mapa R1-R66 completo, TC y TC2 marcadas `[x]`, y la bitácora con comandos y
resultados.
