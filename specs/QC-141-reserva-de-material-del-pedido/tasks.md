# QC-141 — reserva-de-material-del-pedido · tasks.md

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
| `convertQuantity` y `IncompatibleUnitsError` | `lib/modules/unidades/domain/convert-quantity.ts:188-210` | Ninguna conversión propia |
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

## T4 — Existencia decimal en el módulo `inventario` `[depende de T2, T3]`

Archivos: los de la tabla de `design.md > 2.1` bajo `lib/modules/inventario/**`, y
`lib/modules/recetas/domain/{recipe-view,get-recipe}.ts`.

- Tipos a cadena, esquemas zod del alta y del ajuste, `deriveUnitCost` con existencia decimal,
  mensaje de N9 **(según F1.4)**, lectores de `FormData` decimales, `recalculateProductStock` en SQL
  y exportada, filtros de rango con `Prisma.Decimal`.
- Se actualizan los tests de `design.md > 2.4` que no son de esquema.

**Hecho cuando:** tests verdes para `R3`, `R4`, `R5` (con `1.5`, `0.0001`, cinco decimales, cero,
negativo, notación científica) y el test de integración de sumas de `product-stock.int.test.ts`
reescrito con decimales.

## T5 — Existencia decimal en pantallas `[depende de T4]` `[P con T6]`

Archivos: `app/(private)/inventario/components/{product-columns,product-batches-panel,product-form,adjust-batch-dialog,product-cost-amount}.tsx|ts`,
`app/(private)/pedidos/components/order-ingredients-table.tsx`.

- Campos decimales con `inputMode="decimal"`, coma a punto, `font-size >= 16px`.
- Pintado con `formatDecimalDisplay` + `exactDecimalTitle` + `aria-label` **(según F1.4,
  pregunta 5a)**.
- «Restante» con la cadena tal cual y, **si se aprueba N4**, restando del disponible.

**Hecho cuando:** tests de componente verdes para `R6` (ningún `Number(`, `parseFloat` ni
`toFixed` sobre cantidades en esos archivos: se amplía la guardia de convenciones de la ruta si no
los cubre), y `e2e/ajuste-de-inventario.spec.ts` verde con un ajuste de `-0.5`.

## [x] T6 — Necesidad y reparto, dominio puro `[depende de T3]` `[P con T4, T5]`

Archivos: `lib/modules/pedidos/domain/order-requirement.ts` (nuevo),
`lib/modules/inventario/domain/plan-reservation.ts` (nuevo), `lib/modules/inventario/index.ts`.

- `buildRequirement` y `planReservation` según `design.md > 6.1-6.2`, con N1 y N3 **(según
  F1.4)**.

**Hecho cuando:** `plan-reservation.test.ts` y `order-requirement.test.ts` verdes, sin base de
datos, para `R8`, `R9`, `R10`, `R11`: FIFO, desempate numérico, todo-o-nada, unidad sin base común,
conversión, techo solo con más de cuatro decimales, receta vacía.

## T7 — Reservas en la persistencia de `inventario` `[depende de T2, T4, T6]`

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

## T8 — La unidad de trabajo de `pedidos` y su cableado `[depende de T7]`

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

## T9 — Crear, editar, cancelar y borrar con reserva `[depende de T8]`

Archivos: `lib/modules/pedidos/domain/{create-order,update-order,cancel-order,delete-order}.ts`,
`lib/composition/index.ts`.

- Según `design.md > 8`. Borrar libera **(según F1.4, N5)**. La edición a `ENTREGADO` consume
  (T10 aporta el consumo; esta task deja la rama llamándolo).

**Hecho cuando:** tests unitarios con dobles que registran el orden (permiso antes de abrir la
unidad) y tests de integración verdes para `R7`, `R12`, `R13`, `R14`, `R18`, `R19`, `R20` y `R41`.

## T10 — Entregar consume: Finalizar y edición `[depende de T8]` `[P con T9]`

Archivos: `lib/modules/pedidos/domain/transition-order.ts` (nuevo),
`lib/modules/pedidos/domain/{order-catalog,errors}.ts`,
`lib/modules/asignaciones/domain/{finish-assigned-order,errors}.ts`,
`lib/modules/errores/domain/{error-codes,error-catalog}.ts`, `lib/composition/index.ts`.

- `transitionAliveById` cableado a `createTransitionOrder`; `'insufficient_material'` traducido en
  `asignaciones`; código `insufficient_material` en el catálogo.

**Hecho cuando:** tests verdes para `R27`, `R28`, `R29`, `R30`, `R31`, `R32` por los **dos**
caminos (Finalizar y edición), `guard-catalogo-de-errores` verde, y el E2E existente
`e2e/ejecucion-receta.spec.ts` sigue verde.

## T11 — Migración que aparta los pedidos vivos `[depende de T2, T6]` `[P con T7-T10]`

Archivos: `db/migrations/<ts>_reserve_existing_orders/{migration.sql,down.sql}`,
`tests/integration/inventario/reserve-existing-orders-migration.int.test.ts` (nuevo).

- PL/pgSQL según `design.md > 4.3` **(según F1.4, N8)**.

**Hecho cuando:** el test de integración, sobre una base con dos empresas y pedidos vivos,
cancelados y entregados, comprueba `R43` (orden, todo-o-nada, solo vivos), `R44` y la **paridad**
con `planReservation` sobre los mismos datos, incluidos un caso de techo a 4 decimales y uno de
unidad sin base común.

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

- El recorrido de `design.md > 12` (fila E2E).

**Hecho cuando:** `pnpm run e2e -- reserva-de-material` verde en local y en el gate completo
(`R48`).

## T17 — Documentación y trazabilidad `[depende de T1-T16]`

Archivos: `docs/architecture.md` (pregunta 2 del dominio: el lote ya tiene consumidor; «Cron
interno» ya existe como caso, se añade que el primero es este y su variable), 
`progress/impl_QC-141-reserva-de-material-del-pedido.md` (mapa `R1..R48 → test`).

**Hecho cuando:** los 48 requisitos tienen test en el mapa, `R47` lo cubre
`guard-dependencias-aprobadas` sin filas nuevas en `docs/dependencias.md`, y `./init.sh` completo
termina en verde.
