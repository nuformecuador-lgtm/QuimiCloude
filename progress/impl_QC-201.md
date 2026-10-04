# impl QC-201 — empacador-no-ejecuta-pedidos

Rama `feature/QC-201-empacador-no-ejecuta-pedidos`, worktree `.worktrees/QC-201-empacador-no-ejecuta-pedidos`,
base `origin/dev` `ad7c20e9`, spec `6322eeed`. Implementer: 2026-10-04. Sin merge de `dev` (F2.3) ni PR.

## Tasks

Hechas todas, de T1 a T11 (marcadas `[x]` en `tasks.md`). T12: gate completo y mapa, abajo.

| Tanda | Commit | Tasks | Subagente |
|---|---|---|---|
| 1 | `81d8000e` | T1, T2, T3, T4, T7c, T7e | backend_dev x2 (identity+migración / puerto pedidos) |
| 2 | `ce66c84e` | T5, T6, T7, T7b, T7d, T8 | backend_dev |
| 3 | `2373ba0f` | T9, T10 | frontend_dev |
| 4 | `6fccb069` | T11 | frontend_dev |
| arreglos del gate | `9e539c67` | E2E movido a `pedidos-asignados.spec.ts`; quitado un total literal en `permissions.test.ts` | frontend_dev / backend_dev |

## Archivos (diff vs `origin/dev`, sin `specs/` ni `progress/`)

Producción:
- `lib/modules/identity/domain/permissions.ts` — `asignaciones.ejecutar` en `PERMISSIONS` y en el seed de Administrador y Operador.
- `db/migrations/20261004150000_execution_permission/{migration.sql,down.sql}` — migración de datos reversible.
- `lib/modules/pedidos/domain/order-catalog.ts`, `domain/list-order-summaries.ts`, `ports/order-summary-reader.ts`, `adapters/driven/persistence/order-catalog-prisma.ts` — `filter?: { packedBy }` en SQL (lista y recuento con el mismo `where`, que sigue llevando `companyId`).
- `lib/modules/asignaciones/domain/{actor.ts, get-assigned-order-execution.ts, start-assigned-order.ts, finish-assigned-order.ts, list-assigned-orders.ts, assignment-views.ts, list-finished-orders.ts}`, `lib/modules/asignaciones/index.ts`.
- `app/(private)/asignacion/[id]/page.tsx`, `app/(private)/asignacion/page.tsx`, `app/(private)/asignacion/components/{assigned-orders-columns,assigned-orders-table,assigned-orders-list-section,assigned-orders-skeleton}.tsx`, `components/index.ts`.

Tests:
- Nuevos: `tests/integration/identity/execution-permission-migration.int.test.ts` (censado en `tests/integration/aislamiento.json`) y `tests/unit/asignaciones-ui/assigned-orders-can-execute.test.tsx`.
- Modificados, identity: `tests/unit/identity/permissions.test.ts`, `tests/unit/identity/seed/seed-initial-access.test.ts`, `tests/integration/identity/identity-seed.int.test.ts`.
- Modificados, asignaciones (unit): `tests/unit/asignaciones/{authorization, get-assigned-order-execution, start-assigned-order, finish-assigned-order, list-assigned-orders, assignment-views, list-finished-orders, list-responsible-candidates, empacador-authorization, module-contract}.test.ts`.
- Modificados, asignaciones-ui: `tests/unit/asignaciones-ui/{order-execution-page, asignacion-page, assigned-orders-columns, assigned-orders-states}.test.tsx`.
- Modificados, pedidos: `tests/unit/pedidos/order-catalog.test.ts` y `tests/integration/pedidos/order-catalog-company-summary.int.test.ts`.
- Solo fixtures (el actor que ejecuta gana `asignaciones.ejecutar`): `tests/integration/asignaciones/{assigned-orders, batch-states, finish-auto-assign-packers, finished-orders, responsible-eligibility}.int.test.ts` y `tests/integration/pedidos/finish-with-finished-goods.int.test.ts`.
- Rojos por el catálogo nuevo, ajustados sin relajar listas exactas:
  - `tests/unit/navegacion/qc75-convenciones.test.ts` y `tests/unit/pedidos/qc146-alcance.test.ts`.
  - `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`: acotado a los códigos de su propia migración.
  - `tests/guards/guard-identificador-de-request.test.ts`: añadida la migración nueva a su lista.
- E2E: `e2e/pedidos-asignados.spec.ts` gana el `describe` «el Empacador no ejecuta pedidos ni los ve antes del empaque». `e2e/pedidos-terminados.spec.ts` caso B: el Empacador ya no ve «Mis asignados» y los ENTREGADO del fixture los empacó él.

Nota del diff: `git diff origin/dev..HEAD` también lista `app/(private)/configuracion/usuarios/**`, `app/(private)/pedidos/components/order-row-actions.tsx`, `components/shared/row-actions-menu.tsx` y algunos tests de configuracion-ui y pedidos-ui. **No son de QC-201**: `origin/dev` avanzó después de `ad7c20e9`. La rama no los toca (`git diff ad7c20e9..HEAD`; de ahí solo sale `feature_list.json`, del commit del spec `6322eeed`).

## Mapa R<n> -> test

| R | Test |
|---|---|
| R1, R2, R14 | `tests/unit/identity/permissions.test.ts`, describe «QC-201 …» |
| R3, R4 | `tests/unit/identity/permissions.test.ts`, `tests/unit/identity/seed/seed-initial-access.test.ts` y `tests/integration/identity/identity-seed.int.test.ts` (casos «QC-201 R3, R4»); R4 también en `tests/unit/asignaciones/empacador-authorization.test.ts` |
| R5, R6, R7, R7a, R7b | `tests/unit/asignaciones/{get-assigned-order-execution,start-assigned-order,finish-assigned-order}.test.ts`; `empacador-authorization.test.ts` (rechaza sin tocar puertos) |
| R8 | `tests/unit/asignaciones-ui/order-execution-page.test.tsx`; E2E `e2e/pedidos-asignados.spec.ts` «R8 - /asignacion/<id> responde 404 al Empacador…» (estado en BD sin cambios; el Operador sí entra y queda EN_CURSO) |
| R9 | `tests/unit/asignaciones/authorization.test.ts` |
| R10, R11, R11a | `tests/unit/asignaciones-ui/assigned-orders-can-execute.test.tsx` (columna, enlace y skeleton; R11a barre la fuente) y `asignacion-page.test.tsx` (`canExecute` sale de `canExecuteAssignedOrders(sessionUser)`); E2E «R18, R19a, R10» |
| R12, R13 | `tests/integration/identity/execution-permission-migration.int.test.ts` (6 casos: literales SQL == TS, UP sin tocar más filas, idempotencia, DOWN total, DOWN doble) |
| R15 | `tests/unit/asignaciones/module-contract.test.ts`, regla (e): lista exacta y mutaciones en rojo |
| R16, R17 | `tests/unit/asignaciones/list-assigned-orders.test.ts`; `empacador-authorization.test.ts`; `tests/integration/asignaciones/assigned-orders.int.test.ts` |
| R18 | E2E `e2e/pedidos-asignados.spec.ts` «R18, R19a, R10 - el Empacador responsable de…» |
| R19, R19a | `tests/unit/asignaciones/assignment-views.test.ts`; `tests/unit/asignaciones-ui/asignacion-page.test.tsx`; E2E «R18, R19a, R10» |
| R20, R20a | `tests/unit/asignaciones/list-finished-orders.test.ts`, `tests/unit/pedidos/order-catalog.test.ts`, `tests/integration/pedidos/order-catalog-company-summary.int.test.ts`, `tests/integration/asignaciones/finished-orders.int.test.ts` (dos empacadores); E2E «R20 - en «Terminados» el Empacador ve el ENTREGADO que empacó él» |
| R21 | Existente: `tests/integration/identity/session-user.int.test.ts` «trae los permisos del rol sin una segunda consulta» (los permisos de la sesión salen del rol en BD en cada lectura). Riesgo aceptado D11 → va a la descripción del PR |
| R22 | `tests/unit/asignaciones/list-responsible-candidates.test.ts` (permisos del Empacador leídos de `SEED_ROLE_PERMISSIONS`) |

## Migración: UP/DOWN/UP en base efímera

En la base efímera `qct_qc201_eph_migcheck` (`TEMPLATE qct_tpl_d5fa668a5080`, `DATABASE_URL` y `DIRECT_URL` pasadas solo en cada orden):
- con la migración aplicada: 24 permisos y 29 asignaciones; `asignaciones.ejecutar` lo tienen Administrador y Operador;
- tras `pnpm run db:rollback`: 23 permisos, 27 asignaciones y ninguna fila del permiso nuevo;
- tras `pnpm run db:migrate`: «Applying migration `20261004150000_execution_permission`», 24/29 otra vez.

Se repitió el ciclo DOWN/UP con el mismo resultado y después se borró la base. La base compartida `QuimiCloude` no se tocó, tampoco en el E2E: se corrió contra `qct_qc201_e2e`, copiada de la misma plantilla y ya borrada.

## Salida real del gate

- `./init.sh --rapido` al cerrar las tandas 1 y 2: typecheck verde; lint con 0 errores y 8 warnings ajenos; 51/51 archivos de guardias verdes. `vitest related` dio 9 rojos: 8 están en `tests/baseline-rojos.json` y el noveno es qc138 R37 (abajo).
- Primer `./init.sh` completo: `Tests 14 failed | 12301 passed | 128 skipped`, con 4 archivos rojos fuera del baseline. Tres eran nuestros y se arreglaron en `9e539c67`:
  - `guard-identificador-de-request` y `data-table-alcance` R36: los rompía el `.spec.ts` nuevo, que se movió a `pedidos-asignados.spec.ts`;
  - `catalogo-sin-total-fijo`: un `toHaveLength(1)` sobre `PERMISSIONS`.
- **`./init.sh` completo final (HEAD `9e539c67`): `Tests 11 failed | 12304 passed | 128 skipped (12443)`, `Test Files 9 failed | 861 passed (870)`.** Fuera del baseline queda un solo archivo, `tests/unit/pedidos/qc138-transversales.test.ts`. Los demás rojos (`account-status-scope`, `recetas/module-contract`, `recetas/scope`, `unidades-viewport`, `usuarios-viewport`, `product-page`, `pantallas-exigen-permiso` `/pedidos` y `recipe-page`) son deuda listada en el baseline.

### E2E (contra la base efímera `qct_qc201_e2e`)

- Corrida 1 (`empacador-no-ejecuta`, `pedidos-terminados`, `pedidos-asignados`, `ejecucion-receta` y `empaque`, en chromium y webkit): 22 passed y 2 failed.
- Corrida 2, tras mover el E2E (`pedidos-asignados` y `pedidos-terminados`): 14 passed y 2 failed. Los casos de QC-201 (R8; R18, R19a, R10; R20) y el caso B ajustado de `pedidos-terminados` pasan en los dos navegadores.
- Los 2 failed son en las dos corridas el mismo caso, el D de `pedidos-terminados.spec.ts:636` («panel de edicion del Administrador…»), uno por navegador. **Es ajeno**: desde `527a9902`/`57a01471` (dev, 2026-10-02) las acciones de la fila de `/pedidos` van dentro de un menú de 3 puntos y el E2E sigue haciendo clic directo en `order-action-edit`, que ya no está visible. QC-201 no toca `/pedidos`.

## Bloqueos para el leader / humano

1. **`tests/unit/pedidos/qc138-transversales.test.ts` R37** («todo código del catálogo ya estaba en el padre de la rama»). Por construcción falla en cualquier rama que añada un permiso, y R1 lo exige. Cambiarlo es relajar un aserto ajeno, así que lo tiene que decidir el humano: retirarlo, acotarlo a la rama de QC-138 o meterlo en el baseline con su motivo. T12 sigue `[ ]` por esto.
2. El caso D de `e2e/pedidos-terminados.spec.ts` está roto en `dev` por el menú de 3 puntos (ver arriba). Hay que decidir si se arregla aquí o en otra ficha.
3. No está hecho: el merge de `dev` (F2.3; `origin/dev` ya va por `57a01471`), ni el PR. Pendiente para el PR: el riesgo D11 y el orden migración/código (design §9).
