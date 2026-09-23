# QC-141 — reserva-de-material-del-pedido · tasks.md

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

## [ ] TM — Merge de `origin/dev` y renumeración de migraciones `[primera de lo pendiente]` (enmienda del 2026-09-23)

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

## T10 — Entregar consume: Finalizar y edición `[depende de T8]` `[P con T9]`

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

## T12 — El proceso diario `[depende de T8]` `[P con T9-T11]`

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

## T13 — Inventario muestra reservado, disponible y el historial `[depende de T5, T7]`

Archivos: `lib/modules/inventario/domain/{list-products,list-product-batches,list-batch-movements}.ts`,
`lib/modules/inventario/adapters/driving/batch-actions.ts`,
`app/(private)/inventario/components/{product-columns,product-batches-panel,batch-history,adjust-batch-dialog}.tsx`.

- Según `design.md > 10`, con el historial dentro del lote **(según F1.4, pregunta 4)**.

**Hecho cuando:** tests verdes para `R34`, `R36`, `R37`, `R38`, `R40` (sin permiso no se lee nada)
y `R42` (lote de otra empresa = inexistente), y la guardia de viewport de inventario sigue verde.

## T14 — Cobertura del pedido en Pedidos `[depende de T7, T9]` `[P con T13]`

Archivos: `lib/modules/pedidos/domain/*` (consulta de cobertura), `app/(private)/pedidos/**`
(fila y hoja), `lib/composition/index.ts`.

- Una consulta por página, sin N+1. Etiquetas de N6 **(según F1.4)**.

**Hecho cuando:** tests de componente y de caso de uso verdes para `R35`, con una sola llamada a
`findCoverageByOrderIds` por página.

## T15 — Concurrencia y aislamiento en integración `[depende de T9, T10]`

Archivos: `tests/integration/pedidos/order-reservation-concurrency.int.test.ts` (nuevo),
`tests/integration/aislamiento.json` si procede.

**Hecho cuando:** con dos conexiones reales, dos altas simultáneas de 1.500 sobre 2.000 dejan
exactamente una apartada (`R16`), una merma simultánea a un apartado no deja el lote en negativo,
y ninguna combinación de las operaciones de T9 y T10 sobre el mismo producto se interbloquea en
cien vueltas.

## T16 — E2E `[depende de T10, T13, T14]`

Archivos: `e2e/reserva-de-material.spec.ts` (nuevo).

- El recorrido de `design.md > 12` (fila E2E), *(enmienda del 2026-09-23)* con una receta de una
  sola línea al 100,00 %.

**Hecho cuando:** `pnpm run e2e -- reserva-de-material` verde en local y en el gate completo
(`R48`).

## T17 — Documentación y trazabilidad `[depende de T1-T16]`

Archivos: `docs/architecture.md` (pregunta 2 del dominio: el lote ya tiene consumidor; «Cron
interno» ya existe como caso, se añade que el primero es este y su variable), 
`progress/impl_QC-141-reserva-de-material-del-pedido.md` (mapa `R1..R50 → test`; enmienda del
2026-09-23).

**Hecho cuando:** los 50 requisitos tienen test en el mapa, `R47` lo cubre
`guard-dependencias-aprobadas` sin filas nuevas en `docs/dependencias.md`, y `./init.sh` completo
termina en verde.
