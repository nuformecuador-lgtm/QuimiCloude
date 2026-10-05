# QC-201-empacador-no-ejecuta-pedidos — tasks

Leyenda: `[P]` = paralelizable con las otras `[P]` del mismo bloque. `dep:` = tasks que deben
estar hechas antes. Cada task cierra con `./init.sh --rapido` en verde; T12 cierra con `./init.sh`
completo.

## Bloque A — catálogo y migración

- [x] **T1. Catálogo y seed** (`lib/modules/identity/domain/permissions.ts`).
  Añadir `asignaciones.ejecutar` a `PERMISSIONS` tras `asignaciones.modificar`; añadirlo a
  Administrador y Operador en `SEED_ROLE_PERMISSIONS`; JSDoc sin citas de fichas.
  Hecho: typecheck verde; `PermissionCode` incluye el literal.
- [x] **T2. Tests de catálogo y roles** — dep: T1.
  Actualizar `tests/unit/identity/permissions.test.ts` (lista de códigos, entradas previas, regla
  de acción con `ejecutar` solo en `asignaciones`, módulos con escritura, listas exactas de Operador
  y Administrador, Empacador sin cambios), `seed-initial-access.test.ts` y
  `identity-seed.int.test.ts`. Sin relajar asertos ajenos.
  Hecho: tests nuevos/ajustados verdes; casos con `R1`, `R2`, `R3`, `R4`, `R14` en el nombre.
- [x] **T3. Migración de datos** [P con T2] — dep: T1.
  Crear `db/migrations/<ts>_execution_permission/{migration.sql,down.sql}` según `design.md > 1`,
  `<ts>` posterior a la última migración.
  Hecho: `pnpm run db:migrate` y `pnpm run db:rollback` aplican sin error en local.
- [x] **T4. Test de migración** — dep: T3.
  `tests/integration/identity/execution-permission-migration.int.test.ts`, calcado de
  `packing-permission-migration.int.test.ts`: UP crea permiso y dos asignaciones, deja Empacador y
  Maestro sin él, idempotente; DOWN retira todo y nada más; literales del SQL == constantes TS.
  Hecho: verde; casos `R12`, `R13`.

## Bloque B — dominio `asignaciones`

- [x] **T5. Predicado `canExecuteAssignedOrders`** — dep: T1.
  En `domain/actor.ts` + barril. Hecho: `tests/unit/asignaciones/authorization.test.ts` (o archivo
  hermano) cubre `true` con el permiso, `false` sin él / con solo `asignaciones.consultar` / solo
  `empaque.modificar` / actor nulo / conjunto vacío, y que coincide con `requirePermission` para
  los mismos conjuntos. Caso `R9`.
- [x] **T6. Autorización de los tres casos de uso** [P con T7] — dep: T1.
  Cambiar la primera línea de `get-assigned-order-execution.ts`, `start-assigned-order.ts` y
  `finish-assigned-order.ts` a `asignaciones.ejecutar`.
  Hecho: en `get-assigned-order-execution.test.ts`, `start-assigned-order.test.ts` y
  `finish-assigned-order.test.ts`, casos que rechazan sin el permiso (incluido actor con
  `asignaciones.consultar` + `empaque.modificar`) **sin invocar ningún puerto ni transicionar ni
  crear asignaciones**, y casos que conceden con solo `asignaciones.ejecutar`. Fixtures existentes
  actualizados. Casos `R5`, `R6`, `R7`, `R7a`, `R7b`.
- [x] **T7. Filtro de «Mis asignados»** [P con T6] — dep: T5.
  `list-assigned-orders.ts` según `design.md > 3.3`.
  Hecho: en `list-assigned-orders.test.ts`, sin `ejecutar` → página vacía `total 0` sin llamar a
  `assignments` ni `orders`; con `ejecutar` → resultado idéntico al de hoy. Casos `R16`, `R17`.
- [x] **T8. Tests de Empacador y contrato del módulo** — dep: T6, T7.
  `empacador-authorization.test.ts`: leer/comenzar/terminar pasan a **rechazar sin tocar puertos**;
  la lista concede y devuelve vacío. `module-contract.test.ts` regla (e): vigilar
  `asignaciones.ejecutar` y mover/añadir consumidores legítimos según `design.md > 6`, con una
  mutación que lo nombre en un archivo no permitido y salga en rojo.
  Hecho: verdes; casos `R4`, `R15`, `R16`.

- [x] **T7b. Vistas de `/asignacion`** [P con T6, T7] — dep: T5.
  `assignment-views.ts > resolveAssignmentViews` según `design.md > 3.4`.
  Hecho: `tests/unit/asignaciones/assignment-views.test.ts` cubre la matriz: seed Administrador →
  `['todos']`; Operador → `['asignados']`; Empacador → `['terminados','por_empacar']`; solo
  `asignaciones.ejecutar`+`terminados.consultar` → `['asignados','terminados']`; conjunto vacío →
  `['asignados']`; y `resolveAssignmentView('asignados', vistasDelEmpacador)` → `'terminados'`.
  Casos `R19`, `R19a`.
- [x] **T7c. Puerto de pedidos con filtro `packedBy`** [P con T6] — dep: ninguna.
  Parámetro opcional `filter` en `OrderCatalog.listAliveSummariesInCompany` y en su adaptador Prisma
  (`design.md > 3.5`); doble de tests actualizado.
  Hecho: `tests/unit/pedidos/order-catalog.test.ts` y
  `tests/integration/pedidos/order-catalog-company-summary.int.test.ts` verifican que con
  `packedBy` solo vuelven los de ese empacador (total y paginación incluidos), que sin él el
  resultado no cambia y que `packed_by NULL` no entra; guardia de ámbito de empresa verde. Caso `R20`.
- [x] **T7d. «Terminados» filtrado** — dep: T5, T7c.
  `list-finished-orders.ts` según `design.md > 3.5`.
  Hecho: `tests/unit/asignaciones/list-finished-orders.test.ts`: sin `ejecutar` llama al puerto
  con `{ packedBy: actor.id }`; con `ejecutar` lo llama sin filtro (resultado idéntico al de hoy).
  `tests/integration/asignaciones/finished-orders.int.test.ts`: dos empacadores, cada uno ve solo
  lo suyo. Casos `R20`, `R20a`.
- [x] **T7e. Elegibilidad sin cambios** [P] — dep: T1.
  Hecho: test en `tests/unit/asignaciones/list-responsible-candidates.test.ts` (o
  `responsible-eligibility`) con el conjunto del seed del Empacador leído de
  `SEED_ROLE_PERMISSIONS`: sigue siendo candidato. Caso `R22`.

## Bloque C — ruta y UI

- [x] **T9. Página de ejecución** — dep: T1.
  `app/(private)/asignacion/[id]/page.tsx` exige `asignaciones.ejecutar`.
  Hecho: `tests/unit/asignaciones-ui/order-execution-page.test.tsx` cubre 404 sin el permiso (sin
  llamar a `startAssignedOrderAction`) y render con él; `guard-pantallas-exigen-permiso` verde.
  Caso `R8`.
- [x] **T10. Columna «Entrar» por props** — dep: T5.
  `page.tsx` → `AssignedOrdersListSection` → `AssignedOrdersTable` → `buildAssignedOrdersColumns({ canExecute })`
  y `AssignedOrdersSkeleton` según `design.md > 4.2`.
  Hecho: tests de `asignaciones-ui` verifican que con `canExecute=false` no hay columna `enter` ni
  enlace a `/asignacion/[id]` en el DOM y el skeleton tiene el mismo número de columnas; con `true`,
  igual que hoy; y un test de la página verifica que `canExecute` sale de
  `canExecuteAssignedOrders(sessionUser)` (sin rol ni literal del código). Casos `R10`, `R11`, `R11a`.

## Bloque D — punta a punta y cierre

- [x] **T11. E2E del Empacador** — dep: T3, T7, T7b, T7d, T9, T10.
  Nuevo caso (en `e2e/empaque.spec.ts` o `e2e/pedidos-asignados.spec.ts`): un Empacador responsable
  de un pedido `PENDIENTE` no lo ve en ninguna vista de `/asignacion`, no ve la pestaña
  «Mis asignados» (`?vista=asignados` aterriza en «Terminados») y `/asignacion/<id>` responde 404
  sin cambiar el estado del pedido; en «Terminados» ve un pedido que empacó él y no uno empacado
  por otro; un Operador responsable del mismo pedido sí entra. Revisar que
  `ejecucion-receta.spec.ts`, `pedidos-asignados.spec.ts` y `pedidos-terminados.spec.ts` siguen
  verdes (este último puede asumir que el Empacador ve todos los terminados: ajustarlo a R20).
  Casos `R8`, `R10`, `R18`, `R19a`, `R20`.
- [x] **T12. Gate completo y trazabilidad** — dep: todo lo anterior.
  `./init.sh` completo en verde; mapa `R<n> -> test` en `progress/impl_QC-201-empacador-no-ejecuta-pedidos.md`.
  Riesgo aceptado D11 (sesiones vivas hasta 8 h) escrito en la descripción del PR. R21 se
  verifica con el test existente de que el login carga los permisos del rol desde BD
  (identificarlo y citarlo en el mapa; si no existe, añadir uno en `tests/integration/identity/`).

## Trazabilidad prevista

| Requisito | Test previsto |
|---|---|
| R1, R2 | `tests/unit/identity/permissions.test.ts` (T2) |
| R3, R4 | `tests/unit/identity/permissions.test.ts`, `seed-initial-access.test.ts`, `identity-seed.int.test.ts` (T2); `empacador-authorization.test.ts` (T8) |
| R5 | `tests/unit/asignaciones/get-assigned-order-execution.test.ts` (T6) |
| R6 | `tests/unit/asignaciones/start-assigned-order.test.ts` (T6) |
| R7, R7a, R7b | `tests/unit/asignaciones/finish-assigned-order.test.ts` + los dos anteriores (T6) |
| R8 | `tests/unit/asignaciones-ui/order-execution-page.test.tsx` (T9); E2E (T11) |
| R9 | `tests/unit/asignaciones/authorization.test.ts` (T5) |
| R10, R11, R11a | tests de columnas/tabla/skeleton/página en `tests/unit/asignaciones-ui/` (T10); E2E (T11) |
| R12, R13 | `tests/integration/identity/execution-permission-migration.int.test.ts` (T4) |
| R14 | `tests/unit/identity/permissions.test.ts` (T2) |
| R15 | `tests/unit/asignaciones/module-contract.test.ts` (T8) |
| R16, R17 | `tests/unit/asignaciones/list-assigned-orders.test.ts` (T7); `empacador-authorization.test.ts` (T8) |
| R18 | E2E del Empacador (T11) |
| R19, R19a | `tests/unit/asignaciones/assignment-views.test.ts` (T7b); E2E (T11) |
| R20, R20a | `tests/unit/asignaciones/list-finished-orders.test.ts`, `tests/unit/pedidos/order-catalog.test.ts`, `finished-orders.int.test.ts`, `order-catalog-company-summary.int.test.ts` (T7c, T7d); E2E (T11) |
| R21 | test de integración de login/sesión con permisos desde BD (T12) |
| R22 | `tests/unit/asignaciones/list-responsible-candidates.test.ts` (T7e) |
