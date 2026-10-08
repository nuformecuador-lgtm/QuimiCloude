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
