# impl QC-215 — estados-de-acondicionamiento

Fase F2.1. Spec aprobado el 2026-10-07. Worktree `.worktrees/QC-215-estados-de-acondicionamiento`.

## Plan de orden (restricción del humano: colisiones al final)

QC-215 choca en archivos con QC-82 y QC-156 (lista del leader, salida de
`scripts/archivos-en-vuelo.mjs --candidata QC-215`). Regla de reparto: cada tanda cierra con
`./init.sh` en verde, así que un cambio de producción va en la fase de los tests que rompe o
que lo cubren. Los archivos en colisión se tocan en la fase A solo si sin ellos no compila o el
gate se pone rojo, con el cambio mínimo y anotado en «Excepciones».

### Fase A — sin colisión

- **A1 · Base de datos y enum (T1, T2, T3, T15 BD, parte de T4/T11/T12/T13).**
  - Migraciones M1 `<ts>_order_conditioning_states` y M2 `<ts+1>_order_terminated_finished_index`
    con su `down.sql` (archivos nuevos).
  - `order-classification.ts`: valores y flujo (R1, R2).
  - Los `Record<OrderStatus, …>` que el `typecheck` exige: `order-transitions.ts` (filas nuevas;
    **provisional**: conserva `EN_EMPAQUE → ENTREGADO` hasta C1, porque quitarlo rompe Terminar el
    empaque, que es colisión), `order-state.ts`, `company-orders-columns.tsx`,
    `order-status-badge.tsx`.
  - Tests nuevos: T2 (`order-conditioning-states-migration.test.ts`) y T3 (dos `.int` nuevos).
- **A2 · Dominio sin colisión.**
  - Puerto `order-conditioning-repository.ts` y dominio `order-conditioning.ts` + su test unitario
    (parte de T7; el adaptador, el catálogo y el cableado van en C1).
  - T8 parte: `error-codes.ts`, `error-catalog.ts`, `catalogo.test.ts` (`errors.ts` va en C2).
  - T5 producción: `transition-order.ts` (R4), `delete-order.ts` (R19) (sus tests, en C2).
- **A3 · UI y listados sin colisión.**
  - T12: `assignment-view-params.ts` + tests de columnas, params y `list-company-orders`.
  - T16 parte: `isExactlyDelivered`, `company-orders-skeleton.tsx`, `resolveOrdering`.
  - T14: `packed-order-notice.tsx` + test.
  - T11 tests sin colisión: `list-packing-orders`, `get-packing-order`, `expire-stale-orders`.
  - `tests/guards/guard-pantalla-pedidos-se-amplia.test.ts` si lo exige.

### Fase C — colisión (al final, una tanda y un commit por bloque)

- **C1 · Núcleo de pedidos (T4 final, T6, T7 resto).** `ALLOWED` exacto de R3,
  `order-packing.ts`, `order-prisma.ts` (`finishPackingAliveOrder`, `setAliveOrderStatus`,
  adaptadores de acondicionamiento), `order-catalog.ts`, `pedidos/index.ts`,
  `lib/composition/index.ts` (`orderCatalog`), `asignaciones/domain/finish-packing.ts` si hace falta.
  Tests: `module-contract`, `order-packing` (unit + int), `order-finished-at.int`,
  `finish-with-finished-goods.int`, `order-conditioning.int` (nuevo).
- **C2 · Casos de uso de `asignaciones` (T8 resto, T9, T10, T11 resto, T5 tests, T17).**
  `asignaciones/domain/errors.ts`, `start-/finish-conditioning.ts`, `asignaciones/index.ts`,
  cableado en `lib/composition/index.ts`, `acondicionamiento-rol.test.ts`. Tests: `order-state`,
  `start-/finish-assigned-order`, `start-/finish-packing`, `transition-/delete-/cancel-/update-order`.
- **C3 · «Terminados» y pantalla de pedidos (T16 resto, T13 tests).** `list-finished-orders.ts`
  + su test + `finished-orders.int`; `order-columns.test.tsx`, `order-row-actions.test.tsx`.
- **C4 · E2E (T18)** y cierre (T19).

## Excepciones de colisión tomadas en la fase A

- A1 · `db/schema.prisma`: 3 valores del enum + `conditionedBy` y su `@@index`. Nada más.
- A1 · `tests/guards/guard-identificador-de-request.test.ts`: alta de M1 y M2.
- A1 · `tests/integration/aislamiento.json`: alta de los dos `.int` nuevos.
- A1 · `order-row-actions.tsx`: los 3 estados en los dos `Record` (lo exige el typecheck).
- A1 · `tests/unit/pedidos/module-contract.test.ts`: los 3 estados al final de la lista literal del
  enum (3 líneas). Motivo: el cambio de enum de A1 lo ponía rojo y la tanda debe cerrar en verde.
- A1 · `tests/unit/pedidos-ui/order-row-actions.test.tsx`: los 3 estados en la lista literal de
  finales (R22). Mismo motivo. El nombre del caso aún dice «exactamente ENTREGADO, CANCELADO,
  POR_EMPACAR y EN_EMPAQUE»: se corrige en C3.
- A2 · `tests/unit/pedidos/module-contract.test.ts`: alta de `order-conditioning.ts` en la lista
  literal de consumidores de `assertTransition` (1 línea). Motivo: el design exige que el dominio
  nuevo llame a `assertTransition` y el caso queda rojo sin el alta.

## Tandas

### A1 — BD, enum y Records (2026-10-07)

- Migraciones: `20261007120000_order_conditioning_states`, `20261007120100_order_terminated_finished_index`.
- Producción: `order-classification.ts`, `order-transitions.ts` (conserva `EN_EMPAQUE → ENTREGADO`
  hasta C1), `order-state.ts`, `company-orders-columns.tsx`, `order-status-badge.tsx`
  (TERMINADO = `secondary`, como ENTREGADO), `order-row-actions.tsx`.
- Tests nuevos: `order-conditioning-states-migration.test.ts`, `order-conditioning-constraints.int.test.ts`,
  `order-conditioning-states-rollback.int.test.ts`.
- Tests ajustados (sin colisión): `order-transitions.test.ts`, `pedidos-schema.test.ts`,
  `order-status-blocked-migration.test.ts`, `order-status-blocked-rollback.int.test.ts`,
  `list-company-orders.test.ts`, `list-order-responsibles.test.ts`.
- R → test: R1, R2, R3 (pares nuevos) → `order-transitions.test.ts`; R20 (consulta) →
  `list-order-responsibles.test.ts`; R24, R25, R26, R30 (BD) → `order-conditioning-constraints.int`
  + estático; R27 → `order-conditioning-states-rollback.int` + estático; R28 (sin filtro) →
  `list-company-orders.test.ts`. R3 «EN_EMPAQUE → ENTREGADO prohibido» queda para C1.
- Verificación: typecheck verde; lint 0 errores (8 warnings ajenos); guardias 52/52;
  `.int` (5 archivos de pedidos) 25/25; `vitest related` 9 casos rojos: 7 en 5 archivos de baseline
  y 2 de colisión (`module-contract`, `order-row-actions.test.tsx`).
- Tras las dos excepciones de arriba: `module-contract.test.ts` 9/9, `order-row-actions.test.tsx` 20/20.
- Veredicto: A1 hecha.
- Gate A1 (commit 310665e6): `./init.sh` OK (typecheck, lint 0 errores, guardias 52/52). Releído
  `test:rapido` tras el commit (18 archivos del diff): 334 archivos verdes, 5 rojos y los 5 están en
  `tests/baseline-rojos.json` (unidades-viewport, usuarios-viewport, product-page,
  pantallas-exigen-permiso, recipe-page): `vitest related` no aplica los `--exclude`. Nada propio.

### A2 + A3 — Dominio y UI sin colisión (2026-10-07/08, una sola tanda tras el corte de sesión)

- Producción nueva: `pedidos/ports/order-conditioning-repository.ts` (puerto, `scope` último),
  `pedidos/domain/order-conditioning.ts` (`createStartConditioning`/`createFinishConditioning`,
  tipos `StartConditioningAliveById`/`FinishConditioningAliveById` con la firma que tendrá
  `OrderCatalog`).
- Producción modificada: `pedidos/domain/transition-order.ts` (destinos reservados + los 3, R4);
  `pedidos/domain/delete-order.ts` (`NO_BORRABLES` + los 3, igual que el CHECK de M1);
  `asignaciones/domain/list-company-orders.ts` (`resolveOrdering`: exactamente `TERMINADO` también);
  `asignacion/components/assignment-view-params.ts` (orden de R2; `isExactlyDelivered` = exactamente
  `ENTREGADO` o exactamente `TERMINADO`); `company-orders-skeleton.tsx` (solo docstring: recibe
  `showFinishedAt` de `page.tsx`); `packed-order-notice.tsx` («Pedido <n> empacado»).
- Tests nuevos: `tests/unit/pedidos/order-conditioning.test.ts`.
- Tests ampliados (sin colisión): `asignaciones/list-company-orders.test.ts`,
  `list-packing-orders.test.ts`, `get-packing-order.test.ts`, `pedidos/expire-stale-orders.test.ts`,
  `asignaciones-ui/assignment-view-params.test.ts`, `company-orders-columns.test.tsx`,
  `packed-order-notice.test.tsx`, `asignacion-page.test.tsx`.
- Arreglo de A1: `tests/integration/pedidos/pedidos-constraints.int.test.ts` (lista literal de
  columnas de `orders` + `conditioned_by`; no está en la lista de colisión).
- **Movido a C2:** los dos códigos de error (`error-codes.ts`, `error-catalog.ts`,
  `catalogo.test.ts`). Se escribieron en A2, pero `guard-catalogo-de-errores` exige que una clase
  declare cada código, y las clases van en `asignaciones/domain/errors.ts` (colisión QC-82). Se
  revirtieron y el diff se guardó en `.git/worktrees/QC-215-estados-de-acondicionamiento/qc215-c2-catalogo-errores.patch`
  para aplicarlo en C2.
- Diferido a C1: los dos métodos de `OrderCatalog` (el literal de `lib/composition/index.ts`
  dejaría de compilar) y el export del puerto en `pedidos/index.ts`.
- Diferido a C3: test de etiquetas/variantes del badge de `/pedidos` (R29, R32): su único test es
  `tests/unit/pedidos-ui/order-columns.test.tsx` (colisión QC-156).
- R → test: R4 → `transition-order.test.ts` sigue verde (casos nuevos en C2); R8, R9, R10, R12, R13
  (dominio) → `order-conditioning.test.ts`; R19, R30 (borrar) → `delete-order.test.ts` sigue verde
  (casos en C2); R23 → `list-packing-orders`, `get-packing-order`, `expire-stale-orders`;
  R28 → `company-orders-columns.test.tsx`, `assignment-view-params.test.ts`, `list-company-orders`;
  R32 (Todos) → `list-company-orders`, `assignment-view-params`, `asignacion-page.test.tsx`;
  R7 → `packed-order-notice.test.tsx`.
- Commit c3bc8989. Antes del corte: typecheck verde, lint 0 errores, tests unitarios de la tanda en
  verde, y `module-contract` + `order-conditioning` 22/22 tras la excepción. **Gate SIN CERRAR:**
  `./init.sh` (2026-10-08) lo mató el sistema por falta de memoria tras pasar las comprobaciones
  de board/perfil y antes de typecheck/tests. Hay que relanzarlo antes de empezar la fase C.

### C1 — Núcleo de pedidos (2026-10-08, tras mergear origin/dev con QC-82 y QC-156)

- Arreglo del merge (QC-156): `order-cancellation.ts` (`CANCELLABLE` exhaustivo: los 3 estados nuevos
  = `false`) y su test (mapa de 10 + caso R18 por estado). `set-order-customer.test.ts` y
  `order-row-actions.test.tsx`: cuenta del enum 7 → 10.
- T4 final: `ALLOWED` exacto de R3 (fuera `EN_EMPAQUE → ENTREGADO`); `order-transitions.test.ts`
  12 permitidos, `EN_EMPAQUE → ENTREGADO` en prohibidos, `ENTREGADO` solo desde `TERMINADO`.
- T6: `order-packing.ts` (`assertTransition('EN_EMPAQUE','POR_ACONDICIONAR')`); `order-prisma.ts`
  (`finishPackingAliveOrder` → `POR_ACONDICIONAR` sin `finishedAt`; `setAliveOrderStatus` ya no
  escribe `finishedAt`); JSDoc de `order-catalog.ts` y `asignaciones/domain/finish-packing.ts`.
- T7: `OrderCatalog` + `startConditioningAliveById`/`finishConditioningAliveById`; adaptadores
  `startConditioningAliveOrder`/`finishConditioningAliveOrder` en `order-prisma.ts` (un `updateMany`
  condicional + relectura que clasifica, sin unidad de trabajo); barrel `pedidos/index.ts`;
  `lib/composition/index.ts` (`orderConditioningRepository` + dos métodos en `orderCatalog`).
- Tests ajustados: `module-contract` (comentario), `order-packing` unit (R5, R6) e int, `order-finished-at.int`
  (R33), `finish-with-finished-goods.int` (R5), `order-catalog.test.ts` (R33), `qc145-estado-solo-planta`
  (un solo `data:` con `finishedAt`, el de TERMINADO; 6 escrituras de estado),
  `execution-atomicity.int` (QC-82: Terminar deja `POR_ACONDICIONAR`; el caso R20 siembra ENTREGADO a
  mano). Fakes de `OrderCatalog`: 6 `.int` de asignaciones + `assign-responsibles.test.ts`.
  Guardia `guard-ambito-empresa-pedidos`: los dos métodos en `METODOS_DELEGADOS_EN_DOMINIO`.
- Test nuevo: `tests/integration/pedidos/order-conditioning.int.test.ts` (alta `commit` en
  `aislamiento.json`, desde 2026-10-08).
- R → test: R3 → `order-transitions.test.ts`; R5 → `order-packing.test.ts`, `order-packing.int`,
  `finish-with-finished-goods.int`, `execution-atomicity.int`; R6 → `order-packing.test.ts` y los casos
  de rechazo de `finish-with-finished-goods.int`; R8, R9, R10, R12, R13, R14 → `order-conditioning.int`
  (+ `order-conditioning.test.ts`); R18 → `order-cancellation.test.ts`; R33 → `order-finished-at.int`,
  `order-catalog.test.ts`, `qc145-estado-solo-planta.test.ts`.
- Verificación (sin `./init.sh` por OOM, a petición del humano): typecheck verde; lint 0 errores
  (7 warnings ajenos); guardias 55 archivos, 742 verdes, 11 skipped; `tests/unit/pedidos` +
  `pedidos-ui` 111 archivos, 2083 casos, verdes; `tests/unit/asignaciones` + `composition` 67/67,
  1260 verdes; `.int` de pedidos (conditioning, packing, finished-at, finish-with-finished-goods)
  53/53; `order-repository.int` + `execution-atomicity.int` 27/27; `.int` de asignaciones con fakes
  25/26.
- **Rojo conocido:** `finished-orders.int.test.ts` > «R27: Finalizar -> Comenzar -> Terminar deja el
  pedido en «Terminados»». Lo causa T6 (Terminar ya no deja ENTREGADO) y se arregla con
  `list-finished-orders.ts` → `TERMINADO` + el recorrido de acondicionamiento en el test (C3/T16).
- Veredicto: C1 hecha salvo ese rojo, que depende de C3.

## Pendiente

- Cerrar el gate de A2+A3 (`./init.sh`).
- C1, C2 (aplicar antes el parche del catálogo de errores), C3, C4 + T19.
