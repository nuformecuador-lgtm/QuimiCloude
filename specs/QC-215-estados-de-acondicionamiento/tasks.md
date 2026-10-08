# QC-215 — estados-de-acondicionamiento · tasks.md

> Zona: `backend` · Complejidad: `medium` · depends_on: `QC-216` · Rama:
> `feature/QC-215-estados-de-acondicionamiento`
>
> El **qué** está en `requirements.md` (R1–R35) y el **cómo** en `design.md`. `[P]` = se puede
> hacer en paralelo con las otras `[P]` del mismo bloque.
>
> **Cierre de cada task:** `pnpm run typecheck`, `pnpm run lint` y `pnpm exec vitest related --run
> <archivos>`. Si la task crea migración o toca capas: `pnpm exec vitest run guard`. **Cierre de la
> feature:** `./init.sh`.
>
> **Comentarios** (`docs/conventions.md > Comentarios`): ningún comentario nuevo cita `QC-<n>`,
> `R<n>`, `design.md` ni «decisión cerrada». En los tests, `R<n>` va en el nombre del caso.
>
> **`TERMINADO` lo crea esta ficha** (D12, 2026-10-07): Bloque 5.

## Bloque 1 — Base de datos

- [x] **T1.** Esquema y M1 (`design.md > 1.1–1.5`).
  - `db/schema.prisma`: los valores del enum y `conditionedBy` con su `@@index`.
  - `pnpm run db:migrate:create`.
  - `migration.sql` a mano: `ADD VALUE`, FK compuesta y los `CHECK` con `::text`.
  - `down.sql` con aborto si hay filas y texto literal.
  - Alta en la lista de migraciones de `tests/guards/guard-identificador-de-request.test.ts`.

  **Hecho cuando:** `pnpm run db:migrate` y `pnpm run db:rollback` funcionan en la base de test y
  la guardia está en verde. Depende de: —.
- [x] **T2.** `[P]` Test estático de M1:
  `tests/unit/pedidos/schema/order-conditioning-states-migration.test.ts`. Comprueba que solo hay
  `ADD VALUE IF NOT EXISTS`, el texto de cada `CHECK` y que el `down.sql` restaura el texto
  literal. **Hecho cuando:** cubre R26 (idempotencia) y R27 (texto). Depende de: T1.
- [x] **T3.** `[P]` Integración contra la base:
  - `tests/integration/pedidos/order-conditioning-constraints.int.test.ts`: R24, R25, filas
    existentes válidas (R26).
  - `tests/integration/pedidos/order-conditioning-states-rollback.int.test.ts`: R27, aborto con un
    pedido `POR_ACONDICIONAR`.
  - Alta de los dos en `tests/integration/aislamiento.json`.

  **Hecho cuando:** los dos casos simétricos (fila válida aceptada y fila inválida rechazada)
  pasan. Depende de: T1.

## Bloque 2 — Dominio de `pedidos`

- [x] **T4.** `order-classification.ts` (valores y flujo) y `order-transitions.ts` (`ALLOWED` de
  R3). Tests: `tests/unit/pedidos/order-transitions.test.ts` (los 100 pares) y
  `tests/unit/pedidos/module-contract.test.ts` (enum = dominio). **Hecho cuando:** R1, R2 y R3
  están en verde y `typecheck` señala todos los `Record<OrderStatus, …>` pendientes. Depende de: T1.
- [ ] **T5.** `transition-order.ts` rechaza los destinos de R4; `delete-order.ts` amplía
  `NO_BORRABLES`. Tests: `transition-order.test.ts`, `delete-order.test.ts`,
  `cancel-order.test.ts` y `update-order.test.ts` (R18, R19 con los estados nuevos). **Hecho
  cuando:** R4, R18 y R19 están en verde. Depende de: T4.
- [x] **T6.** Terminar el empaque deja `POR_ACONDICIONAR` sin `finishedAt`:
  - `order-packing.ts`, `assertTransition`;
  - `order-prisma.ts`, `finishPackingAliveOrder`;
  - `setAliveOrderStatus` deja de escribir `finishedAt`;
  - JSDoc de `order-catalog.ts`.

  Tests: `tests/unit/pedidos/order-packing.test.ts`,
  `tests/integration/pedidos/order-packing.int.test.ts`,
  `tests/integration/pedidos/order-finished-at.int.test.ts` y
  `tests/integration/pedidos/finish-with-finished-goods.int.test.ts`. **Hecho cuando:** R5, R6 y
  R33 (`finishedAt`) están en verde. Depende de: T4.
- [x] **T7.** Puerto `order-conditioning-repository.ts`, adaptador en `order-prisma.ts`, dominio
  `order-conditioning.ts`, dos métodos en `OrderCatalog` y cableado en `lib/composition/index.ts`
  (`design.md > 2`). Tests:
  - `tests/unit/pedidos/order-conditioning.test.ts`: puerto simulado, `assertTransition`;
  - `tests/integration/pedidos/order-conditioning.int.test.ts`: R8, R9, R10 (dos comenzar en
    paralelo), R12, R13 y R14 contra la base.

  **Hecho cuando:** pasan, y la guardia de ámbito de empresa está en verde. Depende de: T1, T4.

## Bloque 3 — Casos de uso de `asignaciones`

- [ ] **T8.** Dos códigos en `lib/modules/errores/domain/error-codes.ts` y `error-catalog.ts`; dos
  errores en `lib/modules/asignaciones/domain/errors.ts`. Test: `tests/unit/errores/catalogo.test.ts`.
  **Hecho cuando:** el catálogo cerrado los contiene con texto. Depende de: —.
- [ ] **T9.** `start-conditioning.ts` y `finish-conditioning.ts`, exportados en
  `lib/modules/asignaciones/index.ts` y cableados en `asignaciones` de `lib/composition/index.ts`.
  Tests:
  - `tests/unit/asignaciones/start-conditioning.test.ts`;
  - `tests/unit/asignaciones/finish-conditioning.test.ts`.

  Cubren R8–R16. R15 se prueba con actores `SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]`,
  `[ROLE_EMPACADOR]` y `null`, con puertos que fallan si se tocan. **Hecho cuando:** pasan.
  Depende de: T7, T8.
- [ ] **T10.** Relajar QC-216 R17 en `tests/unit/identity/roles/acondicionamiento-rol.test.ts`:
  abrir las dos rutas exactas de T9 y mantener el anti-cegado. **Hecho cuando:** R17 está en verde
  y la guardia de autorización por permiso también. Depende de: T9.
- [ ] **T11.** `order-state.ts` con los estados nuevos (`order_produced_frozen`). Tests:
  - `tests/unit/asignaciones/order-state.test.ts` (R20);
  - `tests/unit/asignaciones/start-assigned-order.test.ts` y `finish-assigned-order.test.ts` (R21);
  - `tests/unit/asignaciones/list-packing-orders.test.ts`, `get-packing-order.test.ts`,
    `start-packing.test.ts`, `finish-packing.test.ts`, `tests/unit/pedidos/expire-stale-orders.test.ts`
    (R23).

  **Hecho cuando:** pasan. Depende de: T4.

## Bloque 4 — Etiquetas y «Todos»

- [ ] **T12.** `[P]` `company-orders-columns.tsx` y `assignment-view-params.ts` (R28). Tests:
  `tests/unit/asignaciones-ui/company-orders-columns.test.tsx`,
  `tests/unit/asignaciones-ui/assignment-view-params.test.ts` y
  `tests/unit/asignaciones/list-company-orders.test.ts` (sin filtro incluye los nuevos; con
  filtro, orden de trabajo). Depende de: T4.
- [ ] **T13.** `[P]` `order-status-badge.tsx` y `order-row-actions.tsx` (R22, R29). Tests:
  `tests/unit/pedidos-ui/order-columns.test.tsx`, `tests/unit/pedidos-ui/order-row-actions.test.tsx`
  y `tests/guards/guard-pantalla-pedidos-se-amplia.test.ts` si lo exige. Depende de: T4.
- [ ] **T14.** `[P]` `packed-order-notice.tsx` (R7). Test:
  `tests/unit/asignaciones-ui/packed-order-notice.test.tsx`. Depende de: —.

## Bloque 5 — `TERMINADO`

- [x] **T15.** `TERMINADO` en el enum de T1 y las filas [P1] de `design.md > 1.3` en M1; M2
  con el índice `orders_company_terminated_idx` y su `down.sql`, dado de alta en la guardia de
  migraciones. Tests: amplían T2 y T3 (R30, base). Depende de: T1.
- [ ] **T16.** «Terminados» = `TERMINADO` (`list-finished-orders.ts`); «Todos» exactamente
  `TERMINADO` (`list-company-orders.ts`, `assignment-view-params.ts`,
  `company-orders-skeleton.tsx`); etiqueta «Terminado». Tests:
  - `tests/unit/asignaciones/list-finished-orders.test.ts`;
  - `tests/integration/asignaciones/finished-orders.int.test.ts`;
  - T12 y T13 ampliados.

  **Hecho cuando:** R31 y R32 están en verde. Depende de: T15, T12.
- [ ] **T17.** `TERMINADO` cerrado en la aplicación (R30). T5 y T11 ampliados con `TERMINADO`.
  Depende de: T15.

## Bloque 6 — E2E existentes y cierre

- [ ] **T18.** Ajustar solo las aserciones de `ENTREGADO`, y de «Terminados», tras Terminar el
  empaque (R34): `e2e/empaque.spec.ts`, `e2e/pasos-de-envasado.spec.ts`,
  `e2e/envases-del-pedido.spec.ts`, `e2e/pedido-en-varias-presentaciones.spec.ts`,
  `e2e/producto-terminado.spec.ts`, `e2e/pedidos-terminados.spec.ts` y
  `e2e/pedidos-asignados.spec.ts`. Ningún spec nuevo. **Hecho cuando:**
  `pnpm exec playwright test <cada spec tocado>` está en verde. Depende de: T6, T14, T16.
- [ ] **T19.** Mapa `R<n> → test` en `progress/impl_QC-215-estados-de-acondicionamiento.md`,
  sin que falte ningún R1–R35. R35: `package.json` no aparece en el diff. Después, `./init.sh`.
  **Hecho cuando:** está en verde. Depende de: todo.

## Archivos esperados

**Producción:**
`db/schema.prisma`,
`db/migrations/<ts>_order_conditioning_states/migration.sql`,
`db/migrations/<ts>_order_conditioning_states/down.sql`,
`db/migrations/<ts>_order_terminated_finished_index/migration.sql`,
`db/migrations/<ts>_order_terminated_finished_index/down.sql`,
`lib/modules/pedidos/domain/order-classification.ts`,
`lib/modules/pedidos/domain/order-transitions.ts`,
`lib/modules/pedidos/domain/transition-order.ts`,
`lib/modules/pedidos/domain/order-packing.ts`,
`lib/modules/pedidos/domain/delete-order.ts`,
`lib/modules/pedidos/domain/order-catalog.ts`,
`lib/modules/pedidos/domain/order-conditioning.ts`,
`lib/modules/pedidos/ports/order-conditioning-repository.ts`,
`lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`,
`lib/modules/pedidos/index.ts`,
`lib/modules/asignaciones/domain/start-conditioning.ts`,
`lib/modules/asignaciones/domain/finish-conditioning.ts`,
`lib/modules/asignaciones/domain/errors.ts`,
`lib/modules/asignaciones/domain/order-state.ts`,
`lib/modules/asignaciones/domain/finish-packing.ts`,
`lib/modules/asignaciones/domain/list-company-orders.ts`,
`lib/modules/asignaciones/domain/list-finished-orders.ts`,
`lib/modules/asignaciones/index.ts`,
`lib/modules/errores/domain/error-codes.ts`,
`lib/modules/errores/domain/error-catalog.ts`,
`lib/composition/index.ts`,
`app/(private)/asignacion/components/company-orders-columns.tsx`,
`app/(private)/asignacion/components/assignment-view-params.ts`,
`app/(private)/asignacion/components/company-orders-skeleton.tsx`,
`app/(private)/asignacion/components/packed-order-notice.tsx`,
`app/(private)/pedidos/components/order-status-badge.tsx`,
`app/(private)/pedidos/components/order-row-actions.tsx`.

**Tests nuevos:**
`tests/unit/pedidos/schema/order-conditioning-states-migration.test.ts`,
`tests/unit/pedidos/order-conditioning.test.ts`,
`tests/unit/asignaciones/start-conditioning.test.ts`,
`tests/unit/asignaciones/finish-conditioning.test.ts`,
`tests/integration/pedidos/order-conditioning.int.test.ts`,
`tests/integration/pedidos/order-conditioning-constraints.int.test.ts`,
`tests/integration/pedidos/order-conditioning-states-rollback.int.test.ts`.

**Tests modificados:**
`tests/unit/pedidos/order-transitions.test.ts`,
`tests/unit/pedidos/module-contract.test.ts`,
`tests/unit/pedidos/transition-order.test.ts`,
`tests/unit/pedidos/delete-order.test.ts`,
`tests/unit/pedidos/cancel-order.test.ts`,
`tests/unit/pedidos/update-order.test.ts`,
`tests/unit/pedidos/order-packing.test.ts`,
`tests/unit/pedidos/expire-stale-orders.test.ts`,
`tests/unit/asignaciones/order-state.test.ts`,
`tests/unit/asignaciones/start-assigned-order.test.ts`,
`tests/unit/asignaciones/finish-assigned-order.test.ts`,
`tests/unit/asignaciones/list-packing-orders.test.ts`,
`tests/unit/asignaciones/get-packing-order.test.ts`,
`tests/unit/asignaciones/start-packing.test.ts`,
`tests/unit/asignaciones/finish-packing.test.ts`,
`tests/unit/asignaciones/list-company-orders.test.ts`,
`tests/unit/asignaciones/list-finished-orders.test.ts`,
`tests/unit/asignaciones-ui/company-orders-columns.test.tsx`,
`tests/unit/asignaciones-ui/assignment-view-params.test.ts`,
`tests/unit/asignaciones-ui/packed-order-notice.test.tsx`,
`tests/unit/pedidos-ui/order-columns.test.tsx`,
`tests/unit/pedidos-ui/order-row-actions.test.tsx`,
`tests/unit/errores/catalogo.test.ts`,
`tests/unit/identity/roles/acondicionamiento-rol.test.ts`,
`tests/guards/guard-identificador-de-request.test.ts`,
`tests/guards/guard-pantalla-pedidos-se-amplia.test.ts`,
`tests/integration/aislamiento.json`,
`tests/integration/pedidos/order-packing.int.test.ts`,
`tests/integration/pedidos/order-finished-at.int.test.ts`,
`tests/integration/pedidos/finish-with-finished-goods.int.test.ts`,
`tests/integration/asignaciones/finished-orders.int.test.ts`.

**E2E modificados (solo aserciones):**
`e2e/empaque.spec.ts`,
`e2e/pasos-de-envasado.spec.ts`,
`e2e/envases-del-pedido.spec.ts`,
`e2e/pedido-en-varias-presentaciones.spec.ts`,
`e2e/producto-terminado.spec.ts`,
`e2e/pedidos-terminados.spec.ts`,
`e2e/pedidos-asignados.spec.ts`.

**Progreso:** `progress/impl_QC-215-estados-de-acondicionamiento.md`.

**NO se tocan:** `package.json`, `specs/QC-202-estado-terminado-tras-empaque/**` (pendiente del
leader), `lib/modules/identity/**`, ninguna Server Action ni `page.tsx` nuevos (QC-217/QC-218).
