# QC-82 — registro-de-ejecucion-de-receta · bitácora del implementer

Rama `feature/QC-82-registro-de-ejecucion-de-receta`, worktree `.worktrees/QC-82-registro-de-ejecucion-de-receta`.
Spec aprobado el 2026-10-06 (`7fdc7cd3`): P1 no anota `already_mine`; P2 `PACK_START`/`PACK_FINISH`;
P3 `asignaciones.ejecutar`; P4 no se anota el envasado; P5 `createOrderPackingRepository(db)`.

## Base de datos

- **Base propia `QuimiCloude_QC82`**, creada el 2026-10-06 con
  `CREATE DATABASE "QuimiCloude_QC82" TEMPLATE "qct_tpl_37e80dfd4330"` (plantilla de integración de la
  rama, `pnpm run db:test template`, 70 migraciones). `prisma migrate status`: «Database schema is up
  to date!».
- `.env` del worktree (git-ignorado) copiado del árbol principal con `DATABASE_URL` y `DIRECT_URL`
  apuntando a `QuimiCloude_QC82`. `QuimiCloude` (compartida) no se toca.
- Preparación: `pnpm install --frozen-lockfile`, `prisma generate`, `next typegen`.
- **Borrar `QuimiCloude_QC82` al cerrar la feature.**

## Tanda 1 (2026-10-06) — T1, T3, T15, T18, T21, T26

| Task | Commit | Quién | Archivos |
| --- | --- | --- | --- |
| T1 | `14e6d25d` | backend_dev | `db/schema.prisma` (+33 al final), `db/migrations/20261006180000_order_execution_entries/{migration,down}.sql`, `tests/unit/asignaciones/schema/order-execution-entries-migration.test.ts` (17 casos) |
| T3 | `659df699` | backend_dev | `lib/modules/pedidos/domain/order-cancellation.ts` (nuevo), `cancel-order.ts`, `lib/modules/pedidos/index.ts` (+4 líneas), `tests/unit/pedidos/order-cancellation.test.ts` |
| T26 | `b5e7e9bd` | backend_dev | `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` (`createOrderPackingRepository(db)` + `lockAndStartPackingAlive` privada), `tests/integration/pedidos/order-packing.int.test.ts` (un `describe` nuevo) |
| T15 | `3900bc87` | frontend_dev | `components/shared/step-reader/step-reader.tsx`, `tests/unit/recetas-ui/step-reader.test.tsx` |
| T18 | `8c58936f` | frontend_dev | `lib/shared/routes.ts` (`CANCELLED_ORDER_PARAM = 'cancelado'`), `app/(private)/asignacion/components/assigned-order-cancelled-notice.tsx` (nuevo), `.../components/index.ts`, `app/(private)/asignacion/page.tsx`, `tests/unit/recetas-ui/recipe-route-contract.test.ts`, `tests/unit/asignaciones-ui/assigned-orders-cancelled-notice.test.tsx` (nuevo) |
| T21 | `1008edc6` | implementer | `specs/QC-63-ejecutar-receta-operador/requirements.md` (solo nota al pie, +5) |

**T1 queda sin marcar**: hecha a la letra de `design.md > 2.1`, pero el tercer `CHECK` choca con R5
(ver «Bloqueo» abajo). T2 no empezó por eso.

### Notas de los subagentes

- T1: el SQL salió de `prisma migrate diff` (sin drift que borrar) + `CHECK`/FK/RLS a mano.
  `prisma generate` dio `EPERM` al renombrar la DLL del motor (otro proceso la tenía abierta); el
  cliente JS/TS sí se regeneró con `OrderExecutionEntry`. Repetir con el worktree sin procesos.
- T3: `cancelInsideTransaction` devuelve `'not_cancellable'` bajo el candado y `cancel-order.ts` lo
  lanza fuera; observable igual (no hay escritura previa). Tests de `cancelOrder` sin tocar, verdes.
- T26: `startPackingAliveOrder` delega en la función privada `lockAndStartPackingAlive`, no en
  `createOrderPackingRepository(tx).startPackingAlive(...)` como dibuja `design.md > 4`: la forma
  literal pone roja `guard-ambito-empresa-pedidos`, que no sigue el ámbito a través de un método del
  objeto devuelto. Mismo cuerpo; la función nueva entra en el barrido (T26-M2).
- T18: el aviso de cancelado usa `bg-muted`, no el verde del de entrega (el spec no fija estilo).

### Mutaciones

- T1: 24 sobre `migration.sql`/`down.sql` + 1 carpeta posterior; todas rojas, ninguna sobrevive.
- T3-M1 `BLOQUEADO` a `false` ⇒ 5 rojos (2 nuevos, 3 de `cancel-order.test.ts`). T3-M2 `CANCELABLES`
  de vuelta + segunda llamada a `cancelAlive` ⇒ 3 tests de fuente rojos.
- T26-M1 la fábrica ignora `db` ⇒ rojo el caso de `ROLLBACK`. T26-M2 sin ámbito en
  `lockAndStartPackingAlive` ⇒ 2 rojos de `guard-ambito-empresa-pedidos`.

### Tests de la tanda (subagentes, solo sus archivos)

- T1: `order-execution-entries-migration` + `guard-rls-force`, `guard-empresa-en-esquema`,
  `guard-arquitectura-modulos`: 4 archivos, 98/98.
- T3/T26: `order-packing.int` (13), unit de order-packing, order-cancellation, cancel-order,
  `pedidos/module-contract`, `pedidos/authorization`, `guard-ambito-empresa-pedidos`,
  `guard-arquitectura-modulos`: 8 archivos, 268/268. Integraciones de empaque vecinas: 5 archivos, 50/50.
- T15: `step-reader`, `order-execution-screen`, `packing-order-screen` (los dos últimos sin tocar): 133/133.
- T18: aviso nuevo + `assigned-orders-delivered-notice`, `asignacion-page`, `recipe-route-contract`,
  `guard-pantallas-exigen-permiso`, `guard-rutas-privadas-cubiertas`: 74/74.

### Gate `./init.sh --rapido` (implementer, tras la tanda)

typecheck verde; lint 0 errores (8 avisos ajenos). `test:rapido` sobre 15 archivos del diff:
**373 archivos, 7 rojos / 366 verdes; 5558 tests, 9 rojos / 5504 verdes / 45 omitidos**. Los 7 rojos
están **todos** en `tests/baseline-rojos.json` y ninguno es nuevo:
`recetas/module-contract`, `recetas/scope`, `configuracion-ui/unidades-viewport`,
`configuracion-ui/usuarios-viewport`, `navegacion/pantallas-exigen-permiso`, `recetas-ui/recipe-page`,
`inventario/product-page`. `--rapido` no consulta la lista, así que sale rojo. **La excepción por
baseline no está dada para QC-82: se para aquí y lo decide el humano.**

### Bloqueo — el tercer `CHECK` contradice R5

`design.md > 2.1` fija `CHECK (("action"::text IN ('PACK_START','PACK_FINISH')) = ("step_position" IS NULL))`.
Por ser igualdad, **obliga a las otras seis acciones a llevar posición**: `START` con `NULL` da
`false = true` ⇒ rechazo. Pero R5, la tabla de `## 2.1` («NULL si la receta no tiene pasos»), `## 3.3`
(«con una receta sin pasos, `null` en todas») y T10 («receta sin pasos ⇒ posición `null`») piden lo
contrario. Opciones:
- **(a)** implicación: `CHECK ("action"::text NOT IN ('PACK_START','PACK_FINISH') OR "step_position" IS NULL)`.
  Cumple R5 y R5bis. Corrige `design.md > 2.1`, una línea de la migración y el test/mutación de T1;
  `db:rollback` + `db:migrate`; T2 con el control «acción normal con `NULL`, aceptada».
- **(b)** mantener la igualdad y enmendar R5 (toda acción no de empaque lleva posición), confirmando
  que ninguna receta sin pasos llega a ejecutarse; arrastra T10 y `## 3.3`.

## Decisiones del humano tras la tanda 1 (2026-10-06, vía leader)

- **Excepción de baseline para QC-82: sí**, la misma de QC-209. Una tanda cierra si `--rapido` falla
  solo por archivos de `tests/baseline-rojos.json` y no sale ningún rojo nuevo; se anotan en cada
  tanda. Un rojo nuevo para.
- **Tercer `CHECK`: opción (a), implicación.** Enmienda en `design.md > 2.1` (`ff464ee6`).
- **Para el reviewer:** el desvío de T26 (`startPackingAliveOrder` delega en la privada
  `lockAndStartPackingAlive`, no en `createOrderPackingRepository(tx).startPackingAlive`) queda
  anotado arriba; motivo: `guard-ambito-empresa-pedidos` no sigue el ámbito a través de un método
  del objeto devuelto.

## Tanda 2 (2026-10-06) — T1 (corrección), T2, T6, T7

| Task | Commit | Archivos |
| --- | --- | --- |
| T1 | `f29a6ee3` | `migration.sql` (tercer `CHECK` = `"action"::text NOT IN ('PACK_START','PACK_FINISH') OR "step_position" IS NULL`), test de esquema (17 casos) |
| T2 | `039e6a2f` | `tests/integration/asignaciones/order-execution-entries-constraints.int.test.ts` (14 casos, `transaccion` con `SAVEPOINT`), `tests/integration/aislamiento.json` (+1 línea) |
| T6 | `ab0e05a8` | `asignaciones/domain/execution-entry.ts` (`EXECUTION_ACTIONS`, `ExecutionAction`, `NewExecutionEntry` de tres ramas, `ExecutionAbortedError`, `isExecutionSuccess`), `ports/execution-log-repository.ts`, `ports/execution-transaction.ts`, `domain/errors.ts` (`NotCancellableError`), `tests/unit/asignaciones/execution-log-repository.test.ts` (40) |
| T7 | `d881189b` | `adapters/driven/persistence/execution-log-prisma.ts` (`createExecutionLogRepository`, `EXECUTION_ACTION_TO_PRISMA`), `execution-transaction-prisma.ts` (`withExecutionTransaction`), `tests/unit/asignaciones/execution-log-prisma.test.ts` (19) |

### Base `QuimiCloude_QC82` tras la corrección de T1

`.env` comprobado (solo `QuimiCloude_QC82`). `db:rollback` (0) → `db:migrate` reaplica
`20261006180000_order_execution_entries` (0) → `prisma generate` v6.19.3 (0, sin `EPERM`). Salida
completa: la primera vuelta `migrate → rollback → migrate` es la de la tanda 1, misma carpeta:

```
db:rollback: aplicando down.sql de 20261006180000_order_execution_entries y borrando su fila de _prisma_migrations
db:rollback: 20261006180000_order_execution_entries revertida.
71 migrations found in prisma/migrations
Applying migration `20261006180000_order_execution_entries`
All migrations have been successfully applied.
```

### Mutaciones

- T1 (corrección): volver a la igualdad ⇒ rojo el caso R5bis (1 rojo / 16 verdes); quitar el `NOT` ⇒ igual.
- T2: cada rechazo con su control positivo (R1 `PAUSE` 22P02; R8 23514; R5 posición 0 23514 y
  **`START` con `NULL` aceptado**; R5bis 23514 / `NULL` aceptado; R6/R7 23503; R32 con control `NO FORCE`).
- T6: `reason?` en cancel, `reason` en pasos, posición numérica en empaque ⇒ `TS2578` en sus
  `@ts-expect-error`; predicado sin objeto / con `already_mine` ⇒ rojo R24; quitar `pack_finish` ⇒ 3 rojos R1;
  `update` en el puerto ⇒ 2 rojos R31 + tsc.
- T7: quitar un par del mapa ⇒ tsc (`satisfies`) + 4 rojos; `deleteMany`/`updateMany` ⇒ 2 rojos R31;
  `timeout` 5_000 ⇒ rojo R24; sin desempate por `id` ⇒ rojo R14; sin `occurredAt` ⇒ 2 rojos R8.

### Tests (subagentes, solo sus archivos)

- T1+T2: 5 archivos / 56 casos (con `guard-rls-force`, `guard-aislamiento-integracion`, `guard-empresa-en-esquema`).
- T6+T7: 5 archivos / 188 casos (con `asignaciones/module-contract`, `guard-arquitectura-modulos`, `guard-catalogo-de-errores`).
- typecheck limpio en las dos.

El gate `--rapido` de esta tanda se corre junto con la tanda 3 (T8–T11, T25 rompen el tipado de los
consumidores hasta T12/T13).

## Tanda 3 (2026-10-06) — T8, T9, T10, T11, T25

| Task | Commit | Archivos | Tests |
| --- | --- | --- | --- |
| T8 | `100fcccf` | `asignaciones/domain/record-step-move.ts`, `tests/unit/asignaciones/record-step-move.test.ts` | 20 |
| T9 | `15bd40d0` | `asignaciones/domain/cancel-assigned-order.ts` (devuelve `CancelAssignedOrderResult = { numberText }`, tipo nuevo), `tests/unit/asignaciones/cancel-assigned-order.test.ts` | 27 |
| T10 | `f997cfd6` | `start-assigned-order.ts`, `assigned-order-execution-view.ts` (`StartedOrderExecution`), `tests/unit/asignaciones/start-assigned-order.test.ts` | 37 |
| T11 | `d2bd34d0` | `finish-assigned-order.ts`, `tests/unit/asignaciones/finish-assigned-order.test.ts` | 49 |
| T25 | `52680e5d` | `start-packing.ts`, `finish-packing.ts`, `tests/unit/asignaciones/{start,finish}-packing.test.ts` | 28 + 40 |

Permiso de la primera línea: `asignaciones.ejecutar` en T8–T11 (P3); `empaque.modificar` en T25.
`order-state.test.ts` existe pero no se tocó: la fila que usa `recordStepMove` se prueba en su test.

### Notas para el reviewer

- **T10**: la vista se lee antes de `run`, así que hay una lectura más del pedido. El test de QC-138
  R32 retocó **la fixture** (secuencia `['PENDIENTE','PENDIENTE','BLOQUEADO']`) y el recuento de lecturas
  de 2 a 3, con nota fechada 2026-10-06. Tras `'stale'`, si relee `EN_CURSO`, reutiliza la vista ya leída
  (el test de QC-63 que cuenta 3 lecturas sigue igual). `resume` con receta sin pasos ⇒ `null`. La
  posición no se recorta en el servidor: lo hace `StepReader` (T15, R14).
- **T11**: con `'stale'` también se compensa y se reintenta (conserva el comportamiento de hoy). El caso
  QC-63 R16 tensado con nota fechada; las entradas de los tests existentes ganan `stepPosition`.
- **T25**: la única lista existente que cambia es la de deps del test R25 (`['log','now','orders','transaction']`),
  con nota fechada. `deps.log` se declara (§3.3) pero la escritura usa el `log` de `run`.
- **Consumidores rotos hasta T12/T13** (esperado): `lib/composition/index.ts`,
  `tests/unit/asignaciones/authorization.test.ts` (2 rojos por dobles sin `transaction`), integraciones
  `batch-states`, `finished-orders`, `responsible-eligibility`; `asignaciones/module-contract` rojo hasta
  que T12 meta los dos archivos nuevos en `CASOS_DE_USO_QC63`.

### Mutaciones

- T8/T9: 12, todas rojas; quitar la comprobación de `BLOQUEADO` en `recordStepMove` ⇒ 2 rojos.
- T10: quitar el aborto ante no-éxito ⇒ 9 rojos. T11: destino `ENTREGADO` ⇒ 3 rojos; sin compensación al
  fallar `append` ⇒ rojo el caso R24 de `deleteOne`.
- T25: 10, todas rojas; comparar con `'ok'` en Terminar ⇒ 7 rojos; `already_mine` anota ⇒ 1 rojo;
  `already_mine` aborta ⇒ 2; log/orders globales en vez de los de `run` ⇒ 4 y 4.

## Tanda 4 (2026-10-06) — T12, T13, T5, T14, T20, T23, T19 y T16 (parada)

| Task | Commit | Archivos |
| --- | --- | --- |
| T12 | `6ad9d7f7` | `lib/modules/asignaciones/index.ts`, `tests/unit/asignaciones/{module-contract,empacador-authorization,authorization}.test.ts`, `tests/integration/asignaciones/{responsible-eligibility,finished-orders,batch-states,finish-auto-assign-packers}.int.test.ts`, `tests/integration/pedidos/finish-with-finished-goods.int.test.ts`, `tests/helpers/execution-transaction-on-client.ts` (nuevo) |
| T13 | `498514f8` | `lib/composition/index.ts`, `tests/unit/composition/asignaciones-facade.test.ts` |
| T5 | `403b44be` | `tests/guards/guard-ambito-empresa-pedidos.test.ts` (incluye el recuento de seis miembros del ámbito de T13) |
| T14 | `1b54c13b` | `lib/modules/asignaciones/adapters/driving/order-execution-actions.ts`, `tests/unit/asignaciones/order-execution-actions.test.ts` (+13) |
| T23 | `557d6a85` | 9 E2E: `ejecucion-receta`, `empaque`, `envases-del-pedido`, `pasos-de-envasado`, `pedido-en-varias-presentaciones`, `pedidos-asignados` (solo el describe del Empacador), `producto-terminado`, `recetas-porcentaje`, `reserva-de-material` |
| T20 | `e28e33a0` | `e2e/registro-ejecucion.spec.ts` (nuevo) |
| — | `bc015757` | `tests/guards/guard-identificador-de-request.test.ts`: alta de `registro-ejecucion.spec.ts` en `E2E_ESPERADOS` y de `20261006180000_order_execution_entries` en `MIGRACIONES_ESPERADAS` (extensión por diseño de esas listas; no afloja nada) |
| T19 | `90eb4275` | `tests/integration/asignaciones/execution-atomicity.int.test.ts` (nuevo), `tests/integration/aislamiento.json` (`commit`) |

### Notas para el reviewer

- **T12**: los tipos de los puertos **no** se publican en el barril: la regla R10 de
  `guard-arquitectura-modulos` solo deja reexportar `./domain`; `lib/composition` los importa por ruta,
  como ya hacía con el de asignación. `finish-with-finished-goods.int.test.ts` (no listado en T12)
  rompía el tipado; es `commit` y su limpieza borra ahora `orderExecutionEntry` antes que los pedidos.
- **T13**: `tests/unit/composition/asignaciones-facade.test.ts` (lista cerrada no listada en el spec)
  crece con `cancelAssignedOrder` y `recordStepMove`, nota fechada, +2 casos R26.
- **T14**: `finishAssignedOrderAction` exige `stepPosition` en el `FormData` (vacío ⇒ `null`; ausente ⇒
  `invalid_input`).
- **T23**: descartadas `pedidos-terminados` (el `goto` es de un Administrador no asignado y espera el
  error), `pedido-bloqueado` (Entrar deshabilitado), `pedido-conversion-de-unidad` y
  `versiones-de-receta` (solo la lista de pedidos), `recetas-pasos` (fuera por tasks.md) y las de
  `pedidos*`/`aislamiento-pedidos` (no van a asignación ni a empaque).
- **T20 y T23 están escritas, no ejecutadas**: el E2E lo lanza el leader. Selectores que T20 asume para
  la UI de T17: botón `Cancelar pedido` (exacto), `alertdialog`, `textbox` /motivo/i, confirmar
  `Cancelar pedido` dentro del diálogo y cerrar con otro nombre; posición en `step-reader-position`.

### Mutaciones

- T12: quitar `record-step-move.ts` de `CASOS_DE_USO_QC63` ⇒ rojo; nombrar `asignaciones.consultar` o
  `asignaciones.ejecutar` en `start-packing.ts`/`finish-packing.ts` ⇒ rojo (4 casos).
- T13: quitar `units` del ámbito ⇒ rojo.
- T5: (a) sin `companyId` en `cancelInsideTransaction`, (b) `createCancelAliveOrder` con otra unidad,
  (c) `createOrderPackingRepository(prisma)`, (d) `createFinishPacking` de `executionTransaction` con
  `orderUnitOfWork` ⇒ las cuatro rojas.

### Tests (subagentes)

- T12–T14: `module-contract`, consumidores, `asignaciones-facade`, `guard-arquitectura-modulos`,
  `guard-ambito-empresa-pedidos` (50/50), `guard-aislamiento-integracion`, `guard-catalogo-de-errores`,
  5 integraciones (40/40), `session-once-per-request-actions` sin tocar. typecheck y lint 0 errores.
- T20/T23: `guard-e2e-landing` y `guard-dobles-e2e` 21/21. `guard-identificador-de-request` 23/23 tras `bc015757`.

### Bloqueos de la tanda 4 (parados, vuelven al leader)

1. **`tests/unit/asignaciones/packing-limits.test.ts` (QC-168) prohíbe lo que QC-82 hace.** 3 rojos:
   R44 «el dominio de empezar/terminar/listar empaque no … menciona un puerto de registro de ejecución»
   (`/ExecutionLog/` en `start-packing.ts`, `finish-packing.ts`) — lo rompe T25 (A3, R41, R42);
   R45 ×2 «ningún archivo de QC-82 menciona `QC-168` / `POR_EMPACAR`/`EN_EMPAQUE`» — lo rompe el propio
   spec de QC-82 desde la enmienda del 2026-09-26. No está en el baseline. Ni el spec ni el design lo
   mencionan.
2. **T16: el caso «R18: el envío no lleva la espera y remontar la reinicia» de
   `order-execution-screen.test.tsx:318-345` exige que el `FormData` de Finalizar lleve solo `orderId`**;
   §6.2/T16 añaden `stepPosition`, y §7 dice que en ese test solo se tocan mock y fixture. T16 está
   implementada **sin commit** en el worktree (pantalla, `components/index.ts`, mock/fixture, fixture de
   `order-execution-tools.test.tsx` por tipado, `order-execution-step-log.test.tsx` 8/8); ese caso queda
   rojo (35/36). T17 no empezó.
3. **T19 (`90eb4275`): R16 intermitente por una carrera en producción** (4 de ~17 corridas). El que
   pierde lanza `OrderNotFoundError` en `get-assigned-order-execution.ts:67`, llamado desde la rama
   `PENDIENTE` de `start-assigned-order.ts:83`: la vista lee `PENDIENTE` y luego pide
   `listAliveSummariesByIds(..., ['PENDIENTE'])`; si el otro confirma `EN_CURSO` entre las dos lecturas,
   el resumen sale vacío y solo queda un `START`. La ventana la abre T10, que ahora lee la vista
   **antes** de transicionar. El resto de T19 (13 casos: arrancar/finalizar/cancelar/comenzar/terminar
   con `append` fallido, R44, material y envases insuficientes, `already_mine`, R20, R23/R29 y el
   control `PACK_START`/`PACK_FINISH` con `NULL`) verde en todas las corridas. El fallo de `append` se
   fuerza envolviendo con `vi.mock` el `createExecutionLogRepository(tx)` de la composición real para
   que escriba `stepPosition: 0` (lo rechaza el `CHECK` dentro de la misma transacción). Opciones del
   subagente: **A** la vista pide el resumen con `['PENDIENTE','EN_CURSO']` cuando el estado leído es uno
   de los dos; **B** `startAssignedOrder` trata ese `OrderNotFoundError` como `'stale'` y relee;
   **C** `skip` de R16 (no recomendado). T19 queda sin marcar.

### Gate `./init.sh --rapido` de la tanda 4 (implementer, 2026-10-06)

Corrido sobre lo commiteado hasta `506bdcc9`+bloqueo R16 (la T16 sin commit se apartó con un stash
etiquetado y se restauró después). typecheck verde; lint 0 errores. `test:rapido`: **390 archivos, 8
rojos; 6058 tests, 10 rojos**. Siete son los del baseline (`recetas/scope`, `recetas/module-contract`,
`configuracion-ui/unidades-viewport`, `configuracion-ui/usuarios-viewport`,
`navegacion/pantallas-exigen-permiso`, `recetas-ui/recipe-page`, `inventario/product-page`). **El octavo
era nuestro**: `tests/unit/shared/data-table-alcance.test.ts`, lista cerrada de E2E que referencian
`data-table`; T20 la amplía. Arreglado en `d98a7885` con alta y nota fechada (28 → 29), verde 14/14.
`packing-limits.test.ts` y el R16 de T19 **no** entraron en el grafo de `test:rapido` (barrido de fuente
e integración no relacionada), pero siguen rojos según los subagentes: son los bloqueos 1 y 3.

## Decisiones del humano tras la tanda 4 (2026-10-06, vía leader)

1. `packing-limits.test.ts`: enmendarlo (opción a).
2. T16: la aserción R18 de `order-execution-screen.test.tsx` espera `[orderId, stepPosition]`
   (opción a; el leader enmienda `design.md > 7`, `1d7d4ae9`).
3. Carrera de R16: opción B (`startAssignedOrder` trata como `'stale'` el `OrderNotFoundError` de esa
   carrera y relee).

## Tanda 5 (2026-10-06) — desbloqueos, T16, T17, T19, T24, T22

| Qué | Commit | Archivos |
| --- | --- | --- |
| T16 | `d0dfcce6` | `order-execution-screen.tsx`, `[id]/components/index.ts`, `order-execution-screen.test.tsx` (mock, fixture y la aserción R18 con nota fechada), `order-execution-tools.test.tsx` (solo tipo del fixture), `order-execution-step-log.test.tsx` (8) |
| packing-limits | `38539229` | `tests/unit/asignaciones/packing-limits.test.ts` |
| T17 | `39df10c8` | `order-cancel-dialog.tsx` (nuevo), `[id]/components/index.ts`, `order-execution-screen.tsx`, `order-cancel-dialog.test.tsx` (11) |
| R16 | `c1a22c11` | `start-assigned-order.ts`, `start-assigned-order.test.ts` (43) |

### Desvíos para el reviewer (de esta tanda)

- **`packing-limits.test.ts` (QC-168), enmendado por decisión humana.** R44 «puerto de registro de
  ejecución»: en `start-packing.ts` y `finish-packing.ts` se admiten solo dos líneas exactas (el
  `import type { ExecutionLogRepository }` y `readonly log: ExecutionLogRepository;`); cualquier otra
  mención allí, o cualquiera en `list-packing-orders.ts`, `get-packing-order.ts`,
  `packing-order-view.ts` u `order-packing.ts`, sigue roja (5 mutaciones, las 5 rojas). R44 de
  migraciones, sin cambios. **R45: el bloque desaparece entero** (sus dos casos solo barrían
  `specs/QC-82-*`), con nota fechada; R45 de QC-168 queda sin test y
  `progress/impl_QC-168-estado-por-empacar.md:103` todavía lo mapea a ese archivo.
- **T16**: `design.md > 7` decía que en `order-execution-screen.test.tsx` solo cambiaban mock y
  fixture; cambió además la aserción del caso R18, por decisión humana. El leader enmienda el spec.
- **T17**: el confirmar no se deshabilita con motivo vacío, para que el rechazo se vea como texto
  (`role="alert"` en el DOM). Etiqueta del campo: «Motivo de la cancelación»; cerrar: «Volver».
- **R16 (opción B)**: en la rama `PENDIENTE`, la lectura de la vista va en un `try` que atiende solo
  `OrderNotFoundError` y una sola vez (`viewRaceRetried`). Relee con `findAliveById(orderId,
  actor.companyId)`: si no existe, sigue `PENDIENTE` o ya no está asignado al actor, relanza el error
  original; si no, vuelve al bucle (`EN_CURSO` anota `resume`, como pide R16; `BLOQUEADO` da
  `order_blocked`). `get-assigned-order-execution.ts` no se tocó. Mutaciones: sin la comprobación de
  `PENDIENTE`, 1 rojo; sin la de asignación, 1; tragar todo `OrderNotFoundError`, 3; sin el arreglo, 4.

### T19: integración, 30 corridas seguidas tras `c1a22c11`

`execution-atomicity.int.test.ts`: **30 verdes, 0 rojos** (base efímera desde la plantilla de
`QuimiCloude_QC82`). La carrera no es determinista, así que no consta cuántas corridas entraron en
ella; el camino de la carrera lo fijan los unitarios de R16. Antes del arreglo: 4 rojos de unas 17.

### T24: la migración sigue siendo la última

`git fetch origin dev` el 2026-10-06: la última de `origin/dev` es
`20261006140000_inventory_movements_adjustment_count`, anterior a
`20261006180000_order_execution_entries`. No hace falta renombrar. `origin/dev` va 28 commits por
delante de la rama: el merge lo decide el leader, y al mergear se repite T24.

### T20 y T23

Escritas (`e28e33a0`, `557d6a85`) y **no ejecutadas**: su «Hecho cuando» exige Playwright contra
`QuimiCloude_QC82`, una sola E2E a la vez. Las lanza el leader; quedan sin marcar hasta entonces.

## T22: cierre, mapa `R<n> -> test`

Abreviaturas: `mig` = `tests/unit/asignaciones/schema/order-execution-entries-migration.test.ts`;
`cons` = `tests/integration/asignaciones/order-execution-entries-constraints.int.test.ts`; `atom` =
`tests/integration/asignaciones/execution-atomicity.int.test.ts`; `ua/` = `tests/unit/asignaciones/`;
`ui/` = `tests/unit/asignaciones-ui/`.

| R | Test |
|---|---|
| R1 | `mig` ocho valores; `cons` `PAUSE` rechazado y las ocho aceptadas; `ua/execution-log-repository.test.ts` (una por valor); `ua/execution-log-prisma.test.ts` mapa de ocho pares |
| R2 | `mig` lista exacta de columnas; `ua/execution-log-repository.test.ts` tipos |
| R3 | `mig` una sola columna de tiempo |
| R4 | `mig` sin texto ni id del paso |
| R5 | `mig` y `cons` posición >= 1 y `START` con `NULL` aceptado; `ua/start-assigned-order.test.ts` receta sin pasos da `null` |
| R5bis | `mig` tercer `CHECK` (implicación); `cons`; `ua/execution-log-repository.test.ts` `@ts-expect-error`; `ua/start-packing.test.ts`, `ua/finish-packing.test.ts`; `atom` control `PACK_START`/`PACK_FINISH` con `NULL` |
| R6 | `cons` pedido inexistente; `mig` FK |
| R7 | `cons` empresa cruzada (pedido y persona); `mig` FK compuestas |
| R8 | `mig`; `cons`; `ua/execution-log-repository.test.ts`; `ua/execution-log-prisma.test.ts` |
| R9 | `ua/cancel-assigned-order.test.ts`; `ui/order-cancel-dialog.test.tsx` |
| R10 | `ua/cancel-assigned-order.test.ts` tope 500/501 frente a `cancelOrderSchema` |
| R11 | `ui/order-cancel-dialog.test.tsx` retroceder sin diálogo; `ui/order-execution-step-log.test.tsx` |
| R12 | `ua/start-assigned-order.test.ts`; `atom` arrancar con `append` fallido |
| R13 | `ua/start-assigned-order.test.ts`; `tests/unit/recetas-ui/step-reader.test.tsx`; `ui/order-execution-step-log.test.tsx`; `e2e/registro-ejecucion.spec.ts` (sin correr) |
| R14 | `ua/start-assigned-order.test.ts`; `step-reader.test.tsx` recorte; `ua/execution-log-prisma.test.ts` desempate por `id`; `ui/order-execution-step-log.test.tsx` |
| R15 | `ua/start-assigned-order.test.ts` |
| R16 | `ua/start-assigned-order.test.ts` (incluida la carrera); `atom` carrera (30/30) |
| R17 | `ua/record-step-move.test.ts`; `step-reader.test.tsx`; `ui/order-execution-step-log.test.tsx` |
| R18 | `ua/record-step-move.test.ts`; `step-reader.test.tsx`; `ui/order-execution-step-log.test.tsx` |
| R19 | `ui/order-execution-step-log.test.tsx` (tres casos) |
| R20 | `ua/record-step-move.test.ts` (incluido `BLOQUEADO`); `atom` sobre `ENTREGADO` |
| R21 | `ua/finish-assigned-order.test.ts` destino `POR_EMPACAR`; `ui/order-execution-step-log.test.tsx` |
| R22 | `ua/cancel-assigned-order.test.ts`; `ui/order-cancel-dialog.test.tsx` |
| R23 | `ua/cancel-assigned-order.test.ts`; `atom`; `ui/order-cancel-dialog.test.tsx` |
| R24 | `ua/start-assigned-order.test.ts`; `ua/finish-assigned-order.test.ts` (compensación); `ua/cancel-assigned-order.test.ts`; `ua/start-packing.test.ts`; `ua/finish-packing.test.ts`; `ua/execution-log-repository.test.ts` predicado; `ua/execution-log-prisma.test.ts` `timeout`; `atom` (ocho gestos); `tests/integration/pedidos/order-packing.int.test.ts` fábrica sobre `tx`; `ui/order-cancel-dialog.test.tsx` error pintado |
| R25 | `ui/assigned-orders-cancelled-notice.test.tsx`; `ua/order-execution-actions.test.ts` redirección; `e2e/registro-ejecucion.spec.ts` (sin correr) |
| R26 | `ua/record-step-move.test.ts`; `ua/cancel-assigned-order.test.ts`; `ua/start-assigned-order.test.ts`; `ua/finish-assigned-order.test.ts`; `ua/start-packing.test.ts`; `ua/finish-packing.test.ts`; `ua/module-contract.test.ts`; `tests/unit/composition/asignaciones-facade.test.ts` |
| R27 | `ua/record-step-move.test.ts`; `ua/cancel-assigned-order.test.ts` (Empacador rechazado) |
| R28 | `ua/record-step-move.test.ts`; `ua/cancel-assigned-order.test.ts` |
| R29 | `tests/unit/pedidos/order-cancellation.test.ts` (siete estados, una definición); `ua/cancel-assigned-order.test.ts`; `atom` liberación |
| R30 | `ua/cancel-assigned-order.test.ts` sin `pedidos.modificar` ni `asignaciones.modificar`; `mig` sin `INSERT` de permisos |
| R31 | `ua/execution-log-repository.test.ts` forma del puerto; `ua/execution-log-prisma.test.ts` fuente sin `update`/`upsert`/`delete` |
| R32 | `mig` RLS al final; `cons` `relforcerowsecurity` |
| R33 | `mig` identificadores |
| R34 | `mig` `down.sql`; salida de `db:rollback` arriba |
| R35 | `tests/guards/guard-dependencias-aprobadas.test.ts`; `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` fuera del diff (comprobado) |
| R36 | `ui/order-cancel-dialog.test.tsx` (dos casos) |
| R37 | `step-reader.test.tsx`; `ui/packing-order-screen.test.tsx` sin tocar; caso R18 de lista cerrada de `ui/order-execution-screen.test.tsx` sin tocar |
| R38 | `ua/start-assigned-order.test.ts` (R9 de QC-63 tensado); nota de T21 |
| R39 | `e2e/registro-ejecucion.spec.ts` (a), sin correr |
| R40 | `e2e/registro-ejecucion.spec.ts` (b), sin correr |
| R41 | `ua/start-packing.test.ts`; `ua/finish-packing.test.ts`; `atom` (a), (b), (b2) y (c) |
| R42 | `ua/start-packing.test.ts`; `ua/finish-packing.test.ts`; `ua/module-contract.test.ts`; `tests/guards/guard-ambito-empresa-pedidos.test.ts` (T5) |
| R43 | (a) `ua/record-step-move.test.ts`; (b) `tests/unit/pedidos/order-cancellation.test.ts` y `ua/cancel-assigned-order.test.ts`; (c) limpieza de `e2e/empaque.spec.ts` (T23, sin correr) |
| R44 | `ua/start-assigned-order.test.ts` `BLOQUEADO` y `stale` que relee `BLOQUEADO`; `atom` cero filas |

**45 de 45** con test. R13 y R25 en parte, y R39, R40 y R43(c) del todo, dependen de E2E que no se han
ejecutado.

### Comprobaciones de cierre (T22)

- `tests/guards/` frente a la base común con `origin/dev`: solo adiciones
  (`guard-ambito-empresa-pedidos` +228, `guard-identificador-de-request` +6). Ninguna guardia más
  laxa. Fuera de `tests/guards/` se ampliaron listas cerradas con nota fechada (`data-table-alcance`,
  `recipe-route-contract`, `asignaciones/module-contract`, `asignaciones-facade`) y se enmendó
  `packing-limits` por decisión humana.
- Fuera del diff: `order-catalog-prisma.ts`, `order-catalog.ts`, `order-packing.ts`,
  `order-packing-repository.ts`, `order-state.ts`, `package.json`, `docs/dependencias.md`. De
  `order-prisma.ts`, solo la fábrica de T26 y su función privada.
- `./init.sh` completo y E2E: los lanza el leader.

### Gate `./init.sh --rapido` de la tanda 5 (implementer, 2026-10-06, sobre `c1a22c11`)

typecheck verde; lint 0 errores. `test:rapido`: **393 archivos, 7 rojos / 386 verdes; 6086 tests,
9 rojos / 6032 verdes / 45 omitidos**. Los 7 rojos son **todos** del baseline y no hay ninguno nuevo:
`recetas/scope`, `recetas/module-contract`, `configuracion-ui/unidades-viewport`,
`configuracion-ui/usuarios-viewport`, `navegacion/pantallas-exigen-permiso`, `recetas-ui/recipe-page`,
`inventario/product-page`. Con la excepción del baseline que dio el humano, **la tanda cierra**.

Explícitos, porque `--rapido` no los incluye: `pnpm exec vitest run
tests/unit/asignaciones/packing-limits.test.ts tests/integration/asignaciones/execution-atomicity.int.test.ts`
⇒ **2 archivos, 17/17 verdes**.
