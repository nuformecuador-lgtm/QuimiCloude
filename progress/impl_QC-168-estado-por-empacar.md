# QC-168 — estado-por-empacar · bitácora del implementer

Rama `feature/QC-168-estado-por-empacar`, worktree `.worktrees/QC-168-estado-por-empacar`, sobre el spec
`07b784ad` (aprobado el 2026-09-25 con los valores por defecto de P1, P2, P5 y P6 y las 5 decisiones de F1.4).

## Base de datos

- **Base propia `QuimiCloude_QC168`**, creada el 2026-09-25 con
  `CREATE DATABASE "QuimiCloude_QC168" TEMPLATE "qct_tpl_87988ea6377c"` (plantilla de la rama, 53 migraciones).
  Solo el `.env` del worktree apunta a ella; el original está en `.env.bak-QuimiCloude` (ignorado por git).
  `QuimiCloude` (la compartida) no se tocó.
- Ciclo con los scripts reales sobre `QuimiCloude_QC168`: `db:rollback` de `20260925120100_packing_permission`
  → `db:migrate`; después, con la carpeta `120100` apartada un momento (el script siempre revierte la última
  carpeta), `db:rollback` de `20260925120000_order_packing_states` → `db:migrate` → se repone `120100` →
  `db:migrate`. Estado final: «Database schema is up to date!», 55 migraciones.
- **Borrar `QuimiCloude_QC168` al cerrar la feature.**

## Tasks y commits

| Task | Estado | Commit |
|---|---|---|
| T1–T3 esquema, matriz, cancelar/borrar | [x] | `43b509d6` |
| T4–T5 permiso y códigos de error | [x] | `aff21491` |
| T6, T7, T9, T14 | [x] | `3656a699` |
| T8 métodos de empaque en `pedidos` | [x] | `33228c6d` |
| rojos del `--rapido` #1 (tipos de documento que se quedaban, censos de permisos) | — | `a2cfe75a` |
| T10 casos de uso de empaque | [x] | `393cfb3d` |
| T11 Server Actions (+ `packedById` en la fila, ver D-1) | [x] | `9ecc6f2e` |
| T15 enmiendas fechadas | [x] | `7b54fd69` |
| T13 pantalla de empaque | [x] | `41b82a9b` |
| T12 pestaña «Por empacar» | [x] | `bba94fd1` |
| censos de `lib/shared/routes.ts` | — | `fb9f331b` |
| T16 E2E **escrito, sin correr** | [ ] | `24b1d6d1` |
| tests de límites R44/R45 (5/5 verdes) + esta bitácora | — | último commit de la rama |
| T17 gate completo | [ ] | lo corre el leader |

## Archivos

Producción: `db/schema.prisma`; `db/migrations/20260925120000_order_packing_states/{migration,down}.sql`,
`db/migrations/20260925120100_packing_permission/{migration,down}.sql`;
`lib/modules/pedidos/{index.ts, domain/order-classification.ts, order-transitions.ts, transition-order.ts,
cancel-order.ts, delete-order.ts, order-catalog.ts, order-packing.ts (nuevo), ports/order-packing-repository.ts (nuevo),
adapters/driven/persistence/order-prisma.ts, order-catalog-prisma.ts}`;
`lib/modules/asignaciones/{index.ts, domain/errors.ts, order-state.ts, start-assigned-order.ts, finish-assigned-order.ts,
list-company-orders.ts, assignment-views.ts, packing-order-view.ts, list-packing-orders.ts, get-packing-order.ts,
start-packing.ts, finish-packing.ts, adapters/driving/order-execution-actions.ts, order-packing-actions.ts}`
(nuevos: los cinco de empaque y `order-packing-actions.ts`);
`lib/modules/inventario/{domain/product-catalog.ts, adapters/driven/persistence/product-prisma.ts}`;
`lib/modules/identity/{domain/permissions.ts, index.ts}`; `lib/modules/errores/domain/{error-codes,error-catalog}.ts`;
`lib/composition/index.ts`; `lib/shared/routes.ts`;
`app/(private)/pedidos/components/{order-status-badge,order-row-actions}.tsx`;
`app/(private)/asignacion/{page.tsx, components/{index.ts, assignment-view-tabs.tsx, assignment-view-params.ts,
company-orders-columns.tsx, assigned-order-delivered-notice.tsx, packing-orders-list-section.tsx,
packing-orders-columns.tsx, packing-orders-skeleton.tsx, packed-order-notice.tsx}}`;
`app/(private)/asignacion/empaque/[id]/{page.tsx, components/{index.ts, packing-order-screen.tsx}}` (nuevos).

Tests nuevos: `tests/unit/pedidos/schema/order-packing-states-migration.test.ts`, `tests/unit/pedidos/order-packing.test.ts`,
`tests/unit/asignaciones/{list-packing-orders,get-packing-order,start-packing,finish-packing,order-packing-actions,packing-limits}.test.ts`,
`tests/unit/asignaciones-ui/{packing-orders-list-section,packing-orders-columns,packed-order-notice,packing-order-page}.test.tsx`,
`tests/integration/pedidos/{order-packing-constraints,order-packing}.int.test.ts`,
`tests/integration/identity/packing-permission-migration.int.test.ts`,
`tests/integration/inventario/finished-goods-receipts.int.test.ts`, `e2e/empaque.spec.ts`.
Se adaptaron unos 60 tests más (lista: `git diff 07b784ad --name-only -- tests e2e`). Casi todos suponían
`ENTREGADO` tras Finalizar, contaban permisos, rutas o columnas, o eran dobles de `ProductCatalog`/`OrderCatalog`
a los que les faltaba el método nuevo.

Specs enmendados (T15, solo notas añadidas): QC-63 R11/R12/R14/R15; QC-141 R15/R22/R27/R30/R31/R48/R50/R51;
QC-150 R10/R13/R24/R26/R27/R37; QC-145 R3/R30; QC-74 R3/R8; QC-144 R9; `docs/architecture.md` (pregunta 2).
`specs/QC-82-*` sin tocar.

## Mapa R<n> → test

| R | Test (archivo › caso) |
|---|---|
| R1 | `unit/pedidos/schema/pedidos-schema.test.ts` › «OrderStatus declara…»; `unit/pedidos/module-contract.test.ts`; `unit/pedidos/schema/order-packing-states-migration.test.ts` › «anade POR_EMPACAR y EN_EMPAQUE…» |
| R2 | `unit/pedidos/order-transitions.test.ts` (matriz de 36 pares); `unit/pedidos/transition-order.test.ts` › R2 (destinos `EN_EMPAQUE`/`ENTREGADO` rechazados) |
| R3 | `unit/pedidos/schema/order-packing-states-migration.test.ts` (columna sin default, sin backfill); `integration/pedidos/order-packing-constraints.int.test.ts` |
| R4–R7 | `integration/pedidos/finish-with-finished-goods.int.test.ts` › «R4-R8 — Finalizar deja el pedido POR_EMPACAR…» y los casos de rollback; `unit/pedidos/transition-order.test.ts`; `unit/asignaciones/finish-assigned-order.test.ts` › R5 |
| R8 | `integration/pedidos/order-finished-at.int.test.ts` › R8; `integration/pedidos/order-packing-constraints.int.test.ts` › «rechaza finished_at en un pedido POR_EMPACAR» |
| R9 | `unit/asignaciones-ui/assigned-orders-delivered-notice.test.tsx`; `e2e/empaque.spec.ts` |
| R10 | `unit/asignaciones/finish-assigned-order.test.ts` › «R10: solo EN_CURSO admite un Finalizar»; `integration/pedidos/finish-with-finished-goods.int.test.ts` › un solo lote por pedido, en secuencia y a la vez |
| R11 | `unit/asignaciones/start-assigned-order.test.ts` › «R11: POR_EMPACAR y EN_EMPAQUE no se pueden abrir» |
| R12 | `unit/asignaciones/list-assigned-orders.test.ts` › «…SOLO los dos estados de trabajo (R12)» |
| R13 | `unit/asignaciones/authorization.test.ts` (4 describes nuevos); `unit/composition/asignaciones-facade.test.ts` |
| R14–R16 | `unit/asignaciones/list-packing-orders.test.ts`; `integration/inventario/finished-goods-receipts.int.test.ts`; `unit/asignaciones-ui/packing-orders-{columns,list-section}.test.tsx` |
| R17 | `unit/asignaciones/get-packing-order.test.ts`; `unit/asignaciones-ui/packing-order-page.test.tsx` › «los tres desenlaces de R17» |
| R18–R24 | `unit/pedidos/order-packing.test.ts`; `integration/pedidos/order-packing.int.test.ts` (R19 con dos Comenzar reales a la vez); `unit/asignaciones/{start,finish}-packing.test.ts` |
| R25 | `integration/pedidos/order-packing.int.test.ts` (asientos de inventario sin cambios); bloque «ningun puerto de inventario» en `unit/asignaciones/{list-packing-orders,start-packing,finish-packing}.test.ts` |
| R26 | `unit/asignaciones/order-packing-actions.test.ts`; `unit/asignaciones-ui/packed-order-notice.test.tsx` |
| R27 | `integration/asignaciones/finished-orders.int.test.ts` › «Finalizar -> Comenzar -> Terminar…»; `integration/pedidos/order-packing.int.test.ts` › R27 |
| R28 | `integration/pedidos/order-packing-constraints.int.test.ts` (EN_EMPAQUE sin empacador, empacador fuera de estado, FK con usuario de otra empresa) |
| R29–R31 | `unit/pedidos/cancel-order.test.ts`; `unit/pedidos/expire-stale-orders.test.ts` |
| R32 | `unit/pedidos/update-order.test.ts`; `unit/pedidos/delete-order.test.ts`; `integration/pedidos/order-packing-constraints.int.test.ts` › borrado lógico |
| R33 | `unit/asignaciones/{order-state,unassign-responsible,remove-work-group-from-order,list-order-responsibles}.test.ts` |
| R34–R36 | `unit/identity/permissions.test.ts` › R34/R35/R36; `unit/identity/seed/seed-initial-access.test.ts`; `integration/identity/identity-seed.int.test.ts` |
| R37 | `integration/identity/packing-permission-migration.int.test.ts` (4 casos) |
| R38 | `tests/guards/guard-autorizacion-por-permiso.test.ts` (existente, verde) |
| R39 | `unit/asignaciones/assignment-views.test.ts`; `unit/asignaciones-ui/asignacion-page.test.tsx` |
| R40 | `unit/asignaciones-ui/packing-order-page.test.tsx` › «el corte por permiso ocurre ANTES de leer nada (R40)»; `guards/guard-pantallas-exigen-permiso.test.ts` |
| R41 | `unit/asignaciones-ui/company-orders-columns.test.tsx`, `assignment-view-params.test.ts`; `unit/pedidos-ui/order-columns.test.tsx` |
| R42 | `unit/pedidos-ui/order-row-actions.test.tsx` |
| R43 | `unit/asignaciones-ui/packing-order-page.test.tsx` › R43; `packing-orders-{columns,list-section}.test.tsx` |
| R44, R45 | `unit/asignaciones/packing-limits.test.ts` |
| R46, R47 | `unit/pedidos/schema/order-packing-states-migration.test.ts` (sin tabla nueva; guardia `RAISE` y recreación literal en `down.sql`); ciclo real anotado en «Base de datos» |
| R48 | `e2e/empaque.spec.ts` (**escrito, sin correr**) |

## Salida real de los tests

- `./init.sh --rapido` #1 (tras T8): typecheck y lint verdes; 6 tests rojos en 4 archivos. Tres archivos eran de
  la rama (`identity-constraints.int` por tipos de documento que dejaba `order-packing.int`,
  `packer-role-migration.int`, `qc75-convenciones`), corregidos en `a2cfe75a`. El cuarto,
  `catalog-import-isolation`, es del baseline.
- `./init.sh --rapido` #2 (tras T12): 4 tests rojos → 2 censos de `lib/shared/routes.ts` (corregidos en `fb9f331b`)
  + los 2 de `catalog-import-isolation` (baseline).
- `./init.sh --rapido` #3 (HEAD `fb9f331b`): typecheck ✓, lint ✓, guardias ✓;
  `Test Files 2 failed | 512 passed (514)`, `Tests 3 failed | 7371 passed | 62 skipped (7436)`. Rojos:
  - `tests/integration/documentos/catalog-import-isolation.int.test.ts` (R21, R22): **baseline**, lo arregla QC-169.
  - `tests/unit/configuracion-ui/user-table.test.tsx` › «la accion de editar… (R26)»: un `findByTestId` que vence
    por tiempo bajo carga. En solitario pasa **27/27 tres veces seguidas** y pasó en el `--rapido` #2. La rama no
    toca `configuracion`. Intermitente y ajeno.
- E2E: **sin correr** (lo corre el leader): `e2e/empaque.spec.ts` y los adaptados `ejecucion-receta`,
  `producto-terminado`, `reserva-de-material` y `pedidos-terminados` (`pedidos-asignados` revisado, sin cambios).

## Decisiones de implementación y puntos abiertos

- **D-1 `packedById` en `PackingOrderRow`.** R17 exige distinguir «a su nombre» de «a nombre de otro», y la fila
  solo traía el nombre. Se expone el id que ya existía (`AssignedOrderSummary.packedBy`) y la pantalla compara
  por id, nunca por nombre. Es contrato interno: no cambia ningún requisito.
- **A-1 [RESUELTO 2026-09-25] Finalizar sobre `PENDIENTE` responde `order_not_found`** (`finish-assigned-order.ts`, `assertFinishable`).
  `design.md > 2` pide rechazar sin llamar a `transitionAliveById`, pero **no dice con qué error**. Para
  `ENTREGADO`, `CANCELADO`, `POR_EMPACAR` y `EN_EMPAQUE` se usa el error propio de cada estado; para `PENDIENTE`
  el subagente eligió `order_not_found`, porque abrir la pantalla ya lo pasa a `EN_CURSO` y solo se llega ahí
  por una llamada directa. Decisión humana: responde `invalid_transition` (código ya existente en el catálogo,
  reutilizado con `InvalidTransitionError` propia de `asignaciones`, mismo patrón que `MaterialShortageError`).
- **A-2 Comenzar, tras éxito, revalida la pantalla del pedido y no redirige.** El spec solo fija el destino de Terminar.
- `list-company-orders.ts` («Todos» sin filtro) pasa a `ORDER_STATUS_FLOW`, como pide `design.md > 1.1`,
  aunque no estaba en el «Toca» de ninguna task.

---

# Anexo — notas de los subagentes (T8, T9)

## T8 — Métodos de empaque en `pedidos`

Archivos creados/modificados:

- `lib/modules/pedidos/domain/order-catalog.ts` — `OrderCatalog` gana `startPackingAliveById` y
  `finishPackingAliveById`; `AssignedOrderSummary` gana `packedBy: string | null`.
- `lib/modules/pedidos/domain/order-packing.ts` (nuevo) — `createStartPacking`/`createFinishPacking`:
  cada uno llama a `assertTransition` con la transición fija que alcanza (`POR_EMPACAR -> EN_EMPAQUE`,
  `EN_EMPAQUE -> ENTREGADO`) y delega en `OrderPackingRepository`, sin abrir la unidad de trabajo de
  `inventario`.
- `lib/modules/pedidos/ports/order-packing-repository.ts` (nuevo) — puerto de las dos escrituras,
  `scope: OrderScope` siempre último parámetro.
- `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` — `startPackingAliveOrder` y
  `finishPackingAliveOrder`: cada uno UN `updateMany` condicional con ámbito de empresa; si `count`
  no es 1, relee la fila (`findAlivePackingStatus`) para clasificar el resultado. Terminar escribe
  `status='ENTREGADO'` y `finishedAt` en la misma sentencia.
- `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts` — `packedBy` en el
  `select`/tipo/mapeo del resumen de asignados.
- `lib/modules/pedidos/index.ts` — exporta `createStartPacking`/`createFinishPacking` y su tipo de
  dependencias.
- `lib/composition/index.ts` — cablea `OrderPackingRepository` sobre las dos funciones crudas de
  `order-prisma.ts` y las dos nuevas entradas de `orderCatalog`.
- `tests/unit/pedidos/order-packing.test.ts` (nuevo) — doble del puerto, sin base de datos: cada
  método delega en el método del puerto que le toca, pasa `companyId` como `OrderScope`, devuelve el
  resultado tal cual y nunca llama al otro método del puerto.
- `tests/unit/pedidos/order-catalog.test.ts`, `module-contract.test.ts` — `packedBy` en los fixtures
  de `toAssignedOrderSummary`; `order-packing.ts` en la lista de consumidores de `assertTransition`.
- `tests/guards/guard-ambito-empresa-pedidos.test.ts` — las dos entradas nuevas en
  `METODOS_DELEGADOS_EN_DOMINIO`.
- `tests/integration/pedidos/order-packing.int.test.ts` (nuevo) — contra Postgres real, cableado
  igual que `lib/composition`: los cinco/cuatro resultados de cada método, concurrencia real de dos
  Comenzar (R19), `already_mine`/`taken` sin escritura (updated_at intacto), `not_packable` en cada
  estado que no admite la acción, `not_found` para inexistente/dado de baja/otra empresa, sin ningún
  `inventory_movement` escrito, y el pedido terminado con `finished_at`.
- `tests/integration/aislamiento.json` — entrada `commit` para el archivo anterior: las dos funciones
  usan el cliente Prisma global sin `tx`, así que envolver la corrida en una transacción de test
  impediría la carrera real de R19.
- Ajustes de otro autor en la misma tanda (ya en el worktree al retomar T8): `finish-assigned-order`
  ahora entrega `'POR_EMPACAR'` en vez de `'ENTREGADO'`, así que los tests de integración de
  `asignaciones` (`finished-orders`, `responsible-eligibility`) y sus dobles de `OrderCatalog` se
  actualizaron para reflejarlo (`transitionAliveByIdReal` comprueba `to === 'POR_EMPACAR'`, y los
  dobles añaden `startPackingAliveById`/`finishPackingAliveById`).

Nota sobre el "dado de baja" de R24: `orders_delivered_not_deleted` prohíbe `deleted_at` en
`POR_EMPACAR`/`EN_EMPAQUE`, así que el caso de un pedido de empaque "dado de baja" solo puede venir
de un estado anterior (`PENDIENTE`) al que se le puso `deleted_at`; el test lo construye así.

## Mapa R18–R25, R28 → test

- **R18** (Comenzar sobre `POR_EMPACAR` deja `EN_EMPAQUE` con ese empacador, una sola escritura):
  `tests/unit/pedidos/order-packing.test.ts` (`R18: ok delega...`);
  `tests/integration/pedidos/order-packing.int.test.ts` (`R18: Comenzar sobre POR_EMPACAR...`).
- **R19** (dos Comenzar a la vez ⇒ uno `ok`, el otro `taken` sin escribir a su nombre):
  `tests/unit/pedidos/order-packing.test.ts` (`R19, R20: taken...`);
  `tests/integration/pedidos/order-packing.int.test.ts` (`R19: dos Comenzar reales a la vez...`,
  concurrencia real con `Promise.all`, dos conexiones).
- **R20** (`EN_EMPAQUE` de otro ⇒ `taken`; del propio actor ⇒ éxito sin escribir):
  `tests/unit/pedidos/order-packing.test.ts` (`R20: already_mine...`);
  `tests/integration/pedidos/order-packing.int.test.ts` (`R20: Comenzar de nuevo el mismo
  empacador...`, `R20: Comenzar sobre un EN_EMPAQUE de otro...`, ambos comprueban que la fila queda
  intacta con `toEqual`).
- **R21** (Terminar deja `ENTREGADO` con `finished_at` en la misma escritura):
  `tests/unit/pedidos/order-packing.test.ts` (`R21: ok delega...`);
  `tests/integration/pedidos/order-packing.int.test.ts` (`R21: Terminar sobre su EN_EMPAQUE...`).
- **R22** (Terminar por quien no empaca ⇒ `order_packing_taken`, i.e. `not_packer` sin escribir):
  `tests/unit/pedidos/order-packing.test.ts` (`R22: not_packer...`);
  `tests/integration/pedidos/order-packing.int.test.ts` (`R22: Terminar activado por quien no
  empaca...`).
- **R23** (estado que no admite la acción ⇒ `not_packable`): `tests/unit/pedidos/order-packing.test.ts`
  (`R23: not_packable...` en ambos describe); `tests/integration/pedidos/order-packing.int.test.ts`
  (`R23: Comenzar sobre PENDIENTE, EN_CURSO...`, `R23: Terminar sobre POR_EMPACAR, PENDIENTE...`,
  recorre los cinco/cuatro estados que no tocan).
- **R24** (inexistente/dado de baja/otra empresa ⇒ `not_found`):
  `tests/unit/pedidos/order-packing.test.ts` (`R24: not_found...` en ambos describe);
  `tests/integration/pedidos/order-packing.int.test.ts` (`R24: Comenzar sobre un pedido
  inexistente...`, `R24: Terminar sobre un pedido inexistente...`).
- **R25** (ningún consumo, lote ni asiento de inventario): `tests/integration/pedidos/order-packing.int.test.ts`
  (`R18`, `R21` comprueban `movementCountDe` sin cambios antes/después).
- **R27** (pedido terminado aparece con `finished_at`): `tests/integration/pedidos/order-packing.int.test.ts`
  (`R27: un pedido terminado por Terminar aparece con su finished_at...`).
- **R28** (nada deja `EN_EMPAQUE` sin empacador ni empacador fuera de `EN_EMPAQUE`/`ENTREGADO`): lo
  hace cumplir el CHECK `orders_packed_by_matches_status` de T1–T3, ya probado en
  `tests/integration/pedidos/order-packing-constraints.int.test.ts`; aquí `guard-ambito-empresa-pedidos`
  verifica que las dos escrituras de este módulo son las únicas vías de escritura de `packedBy`.

## Salida real

`pnpm run typecheck` (repo completo): **verde**, sin errores.

`pnpm exec eslint` sobre todos los archivos de producción y test tocados en T8: **verde**, sin salida.

`pnpm exec vitest run tests/unit/pedidos tests/unit/asignaciones`:
```
Test Files  109 passed (109)
     Tests  1719 passed | 3 skipped (1722)
```

`pnpm exec vitest run guard` (las 50 suites de guardias, incluida `guard-ambito-empresa-pedidos`):
```
Test Files  50 passed (50)
     Tests  630 passed | 11 skipped (641)
```

`pnpm exec vitest run tests/integration/pedidos/order-packing.int.test.ts` (contra la base efímera
del globalSetup):
```
Test Files  1 passed (1)
     Tests  11 passed (11)
```

Resto de los `*.int.test.ts` tocados por el diff de T8 (`finish-with-finished-goods`,
`order-reservation-concurrency`, `order-reservation`, `pedidos-constraints`, y los cuatro de
`asignaciones`), corridos uno por uno tras un primer intento en lote que dio dos falsos rojos por
contención de recursos al correr 8 archivos de integración a la vez (uno perdió su propio timeout de
120 s en las cien vueltas de concurrencia; el otro contó un `orderSequence=3` sin filtrar por
empresa, capturado por un commit de otro archivo corriendo en paralelo — nada de esto toca código de
T8): **todos verdes** al correrlos por separado, incluida `pedidos-constraints.int.test.ts` con sus
30 casos (el censo de columnas ya incluye `packed_by`).

No se corrió `pnpm test`, `vitest related` ni `./init.sh` (indicado explícitamente para esta tanda:
se cuelgan). No quedó ningún proceso en segundo plano.

## Veredicto T8

T8 completa: los dos métodos de empaque implementados como UN `UPDATE` condicional cada uno, sin
abrir la unidad de trabajo de inventario, con los cinco/cuatro resultados de `design.md > 3`,
concurrencia real probada con dos conexiones, `guard-ambito-empresa-pedidos` verde, unit e
integración nuevos, y typecheck/lint en verde. Marcada `[x]` en `tasks.md`.

## T9 — Envases del lote por pedido en `inventario`

Archivos creados/modificados:

- `lib/modules/inventario/domain/product-catalog.ts` — `ProductCatalog` gana
  `findFinishedGoodsReceipts(orderIds, companyId): Promise<readonly { orderId: string; packages: string }[]>`.
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts` — implementación:
  `findProductionMovements` (lectura con `scope: InventoryScope`, compone `movementCompanyScope`)
  + `packagesFromReceipt` (división exacta con `BigInt`, escala 4) + `findFinishedGoodsReceipts`
  (firma pública `(orderIds, companyId)`, atajo sin consulta con lista vacía).
- `lib/composition/index.ts` — importa `findFinishedGoodsReceipts` de `product-prisma.ts` y lo
  añade a la constante `productCatalog`.
- `tests/unit/inventario/product-catalog.test.ts` — nuevo describe `R14 — findFinishedGoodsReceipts…`
  (mapeo puro con mock de `prisma.inventoryMovement.findMany`).
- `tests/integration/inventario/finished-goods-receipts.int.test.ts` (nuevo) — contra Postgres real,
  vía `receiveFinishedGoods` para escribir el asiento `production` real.
- `tests/integration/aislamiento.json` — entrada `commit` para el archivo anterior (lee con el
  cliente global, no con `tx`).
- `specs/QC-168-estado-por-empacar/tasks.md` — T9 marcada `[x]`.

Efecto colateral inevitable (contrato compartido `ProductCatalog` ganó un método obligatorio):
se añadió `findFinishedGoodsReceipts` a los dobles/instancias reales de `ProductCatalog` que ya
existían fuera de `inventario`, sin tocar ningún archivo de `lib/modules/pedidos/**`,
`lib/modules/asignaciones/**` ni `app/` (solo tests):

- `tests/integration/pedidos/{finish-with-finished-goods,order-content-copy,order-cost-quote,order-expiry,order-ingredients-cost,order-reservation-concurrency,order-reservation}.int.test.ts`
- `tests/integration/recetas/recipe-crud.int.test.ts`
- `tests/unit/asignaciones/{get-assigned-order-execution,start-assigned-order}.test.ts`
- `tests/unit/pedidos/resolve-ingredients-cost.test.ts`
- `tests/unit/recetas/{authorization,company-scope,recipe-image-lifecycle,recipe-image-url,recipe-lines-catalog,recipe-service}.test.ts`

Sin este ajuste `pnpm run typecheck` quedaba rojo en todo el repo (contrato roto), así que se
incluyó aquí en vez de dejarlo para T10.

## Mapa R14 → test

- **R14** (lista «Por empacar» trae envases enteros, D3/D7, `design.md > 4`):
  - `tests/unit/inventario/product-catalog.test.ts` — describe `R14 — findFinishedGoodsReceipts
    divide la cantidad del asiento production por el contenido del lote` (5 casos: división
    exacta, división con contenido≠1, forma del `where`/ámbito, lista vacía sin consulta, pedido
    sin asiento → no aparece).
  - `tests/integration/inventario/finished-goods-receipts.int.test.ts` (5 casos: un pedido con
    asiento → envases correctos; varios pedidos en una llamada; pedido sin asiento → no aparece;
    pedido de OTRA empresa → no aparece aunque tenga asiento; lista vacía → sin consulta).

## Salida real

`pnpm run typecheck` (repo completo): **verde**, sin errores.

`pnpm exec eslint lib/modules/inventario/domain/product-catalog.ts lib/modules/inventario/adapters/driven/persistence/product-prisma.ts lib/composition/index.ts tests/unit/inventario/product-catalog.test.ts tests/integration/inventario/finished-goods-receipts.int.test.ts`: **verde**, sin salida.

`pnpm exec vitest run tests/unit/inventario/product-catalog.test.ts tests/guards/guard-ambito-empresa-inventario.test.ts tests/guards/guard-aislamiento-integracion.test.ts`:
```
Test Files  3 passed (3)
     Tests  49 passed (49)
```

`pnpm exec vitest run tests/integration/inventario/finished-goods-receipts.int.test.ts` (contra la
base efímera del globalSetup):
```
Test Files  1 passed (1)
     Tests  5 passed (5)
```

`pnpm exec vitest related --run lib/modules/inventario/domain/product-catalog.ts lib/modules/inventario/adapters/driven/persistence/product-prisma.ts lib/composition/index.ts`:
arrastró un grafo enorme por el fan-in de `lib/composition/index.ts` (lo importa casi todo el
árbol de adaptadores driving) y no terminó en el tiempo disponible; se descartó y se corrieron a
mano los archivos de arriba, como autoriza la instrucción de la tarea.

No se corrió `pnpm test`, la suite completa ni `./init.sh` (fuera de alcance de esta tanda).

## Veredicto

T9 completa: `findFinishedGoodsReceipts` implementado, cableado, acotado por empresa
(`guard-ambito-empresa-inventario` verde), con test unitario e integración nuevos y typecheck/lint
en verde; el efecto colateral en dobles de `ProductCatalog` fuera de `inventario` quedó resuelto
sin tocar código de producción de `pedidos`/`asignaciones`/`app`.
