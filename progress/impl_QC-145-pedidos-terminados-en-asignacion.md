# QC-145 — pedidos-terminados-en-asignacion · bitácora de implementación (F2.1)

> Implementer, 2026-09-23. Rama `feature/QC-145-pedidos-terminados-en-asignacion`, worktree
> `.worktrees/QC-145-pedidos-terminados-en-asignacion`. Sin push ni PR. No se autoaprueba:
> decide el reviewer.

## Base de datos

- **Base propia: `QuimiCloude_QC145`**, creada con
  `CREATE DATABASE "QuimiCloude_QC145" TEMPLATE "qct_tpl_fdfc67d8876c"`, a partir de la plantilla ya
  migrada y sembrada que dio `pnpm run db:test template` (43 migraciones, antes de esta ficha).
- Solo el `.env` del worktree (git-ignorado, `.gitignore:38`) apunta a ella, en `DATABASE_URL` y
  `DIRECT_URL`. El árbol principal y la base compartida `QuimiCloude` no se tocaron.
- `prisma migrate status` confirmó `Datasource "db": PostgreSQL database "QuimiCloude_QC145"` antes
  de aplicar nada. Todos los subagentes lo volvieron a comprobar antes de migrar, correr tests de
  integración o lanzar el E2E.
- Los tests de integración corren, como siempre, sobre una base efímera `qct_qc145_*`, copiada de la
  plantilla `qct_tpl_d83c74aff6e2` (ya con la migración nueva) y borrada al terminar.
- **Al cerrar la ficha**, la base `QuimiCloude_QC145` sobra y se puede borrar (`pnpm run db:test clean`).

### Ciclo de T1 sobre `QuimiCloude_QC145` (salida real, recortada al aviso de versión de Prisma)

```
== pnpm run db:migrate (1) ==
Datasource "db": PostgreSQL database "QuimiCloude_QC145", schema "public" at "localhost:5432"
44 migrations found in prisma/migrations
Applying migration `20260923120000_orders_finished_at`
All migrations have been successfully applied.
exit:0
== pnpm run db:rollback ==
db:rollback: aplicando down.sql de 20260923120000_orders_finished_at y borrando su fila de _prisma_migrations
db:rollback: 20260923120000_orders_finished_at revertida.
exit:0
== pnpm run db:migrate (2) ==
Datasource "db": PostgreSQL database "QuimiCloude_QC145", schema "public" at "localhost:5432"
44 migrations found in prisma/migrations
Applying migration `20260923120000_orders_finished_at`
All migrations have been successfully applied.
exit:0
== pnpm exec prisma generate ==
Generated Prisma Client (v6.19.3) ... in 317ms
exit:0
== pnpm exec prisma migrate status ==
Datasource "db": PostgreSQL database "QuimiCloude_QC145", schema "public" at "localhost:5432"
44 migrations found in prisma/migrations
Database schema is up to date!
exit:0
```

La migración `20260923120000` es posterior a la última de `origin/dev`
(`20260922160000_recipe_lines_percentage`) y lleva su `down.sql`.

## Tasks

T1-T16 cerradas `[x]`. **T17 queda `[ ]`**: su parte de código está hecha (test de alcance y
limpieza de comentarios), pero su criterio de «hecho» es `./init.sh` completo en verde, y ese lo
corre el leader.

## Commits (32 sobre el merge-base con `origin/dev`, más el de esta bitácora)

| Task | Commit(s) |
|---|---|
| T1 | `a7e2453c` migración + esquema + test; `13708eef` alta en `MIGRACIONES_ESPERADAS` de `guard-identificador-de-request`; `4f286f56` `finished_at` en la lista cerrada de columnas de `pedidos-constraints.int` |
| T2 | `428bd57b` |
| T3 | `9cee67b0` (su export `OrderEdit` en `pedidos/index.ts` quedó dentro de `2254e199`, por una carrera entre carriles) |
| T4 | `2254e199` (incluye el cableado de `listAliveSummariesInCompany` en `lib/composition/index.ts`, necesario para compilar) |
| T5 | `306a8386` |
| T6 | `8d22bc91` |
| T7 | `f5a53816` + `26e5198e` (el primero arrastró por carrera dos líneas de T9 en `asignaciones/index.ts` y el segundo restaura el bloque de Terminados; el contenido final es correcto) |
| T8 | `53c773f2`, `3ee70f58` |
| T9 | `94ba2a28`, `e9dd64ed` (conteo literal del catálogo de errores a 52) |
| T10 | `14334d35` |
| T11 | `0eb43f03`, `deabb328` |
| T12 | `9d950b10` |
| T13 | `8f959410`; `bce85449` fix (`isExactlyDelivered` fuera del módulo `'use client'`); `951204df` fix (testid de sección) |
| T14 | `0dbaf349` |
| T15 | `8fceaeeb` |
| T16 | `e2189445`; `2f52091f` alta en `E2E_ESPERADOS` de `guard-identificador-de-request` |
| T17 | `0408bbf9` test de alcance; `3250a968` limpieza de comentarios (solo comentarios) |

## Archivos tocados

**Producción**
- `db/schema.prisma`, `db/migrations/20260923120000_orders_finished_at/{migration.sql,down.sql}`
- `lib/modules/pedidos/`: `domain/{order-catalog,order-input,order-view,update-order}.ts`,
  `ports/order-repository.ts`, `adapters/driven/persistence/{order-catalog-prisma,order-prisma}.ts`,
  `adapters/driving/order-actions.ts`, `index.ts`
- `lib/modules/asignaciones/`: nuevos `domain/{assignment-views,compose-order-rows,finished-order-view,list-finished-orders,company-order-view,list-company-orders,responsible-eligibility,list-responsible-candidates}.ts`;
  modificados `domain/{assign-responsibles,errors,list-assigned-orders}.ts`,
  `adapters/driving/order-assignment-actions.ts`, `index.ts`
- `lib/modules/identity/`: `domain/people-directory.ts`, `adapters/driven/persistence/assignment-directory-prisma.ts`
- `lib/modules/errores/domain/{error-codes,error-catalog}.ts`
- `lib/composition/index.ts`
- `app/(private)/asignacion/page.tsx`. En `components/`: nuevos `assignment-view-{params,tabs}`,
  `finished-orders-{columns,empty,list-section,skeleton,table}` y
  `company-orders-{columns,empty,list-section,skeleton,table}`; modificados
  `assigned-orders-{list-params,list-section,table}` e `index.ts`
- `app/(private)/pedidos/components/{order-form,order-list-section}.tsx`
- **No tocados** (D17): `get-assigned-order-execution.ts`, `start-assigned-order.ts`,
  `finish-assigned-order.ts` y `app/(private)/asignacion/[id]/**`. Se comprobó con grep sobre el diff.

**Tests nuevos**
- unit: `pedidos/schema/orders-finished-at-migration`, `pedidos/qc145-estado-solo-planta`,
  `asignaciones/{assignment-views,list-finished-orders,list-company-orders,responsible-eligibility,list-responsible-candidates}`,
  `asignaciones-ui/{asignacion-page,assignment-view-params,finished-orders-columns,finished-orders-list-section,company-orders-columns,company-orders-list-section}`
- integración (registrados en `tests/integration/aislamiento.json`):
  `pedidos/{order-finished-at,order-catalog-company-summary}`,
  `asignaciones/{finished-orders,company-orders,responsible-eligibility}`
- E2E: `e2e/pedidos-terminados.spec.ts`

**Tests modificados**, con el motivo escrito en el propio test y **ninguno en el baseline**:
- Enmiendas de contratos de otras fichas:
  - `identity/roles/empacador-rol`: la puerta R16 se abre solo a `assignment-views.ts` y
    `list-finished-orders.ts`, por ruta exacta.
  - `guard-qc87-no-reimplementado`: `ACCIONES` +3.
  - `composition/asignaciones-facade`: el censo pasa de 9 a 12.
  - `errores/catalogo`: el conteo pasa a 52.
  - `guard-identificador-de-request`: la migración y el E2E nuevos entran en sus listas cerradas.
  - `integration/pedidos/pedidos-constraints`: `finished_at` entra en la lista de columnas de `orders`.
  - `session-once-per-request-actions`: no hizo falta, porque su censo es por archivo.
- Fixtures y dobles:
  - pedidos: `pedidos-schema`, `order-catalog`, `update-order`, `order-input`, `order-actions`, `order-service`
  - asignaciones: `assign-responsibles`, `authorization`, `get-assigned-order-execution`,
    `start-assigned-order`, `list-assigned-orders` (sin cambio de expectativas), `list-order-responsibles`,
    `list-responsibles-for-orders`, `order-assignment-actions`
  - inventario: `inventario/{authorization,adjust-batch-stock}`
  - UI: `pedidos-ui/{order-form,order-list-section,order-sheet,pedidos-viewport}`,
    `asignaciones-ui/{a11y-tactil,assigned-orders-list-params}`
  - integración: `integration/pedidos/{order-repository,company-scope-queries}`,
    `integration/asignaciones/{assigned-orders,use-case-fixture}`,
    `integration/identity/assignment-directory`

## Mapa `R<n>` → test (verificado contra `design.md > 10`; en todos, R<n> va en el nombre del caso)

| R | Test |
|---|---|
| R1 | `tests/unit/pedidos/schema/orders-finished-at-migration.test.ts`; `tests/unit/pedidos/schema/pedidos-schema.test.ts` |
| R2 | `orders-finished-at-migration.test.ts` (sin DEFAULT ni backfill; `down.sql` inverso); `tests/integration/pedidos/order-finished-at.int.test.ts` (entregado previo con `finished_at` NULL) |
| R3 | `order-finished-at.int.test.ts` (Finalizar real → `ENTREGADO` y `finished_at = now` en la misma escritura); `tests/unit/pedidos/order-catalog.test.ts` (a ENTREGADO lleva `finishedAt`; a EN_CURSO no) |
| R4 | `order-finished-at.int.test.ts` (CHECK, SQLSTATE 23514); `orders-finished-at-migration.test.ts` |
| R5 | `tests/unit/pedidos/qc145-estado-solo-planta.test.ts` (fuente); `order-finished-at.int.test.ts` (editar y cancelar no tocan `finished_at`) |
| R6 | `tests/unit/pedidos/update-order.test.ts`, `order-input.test.ts`, `order-service.test.ts`; `tests/integration/pedidos/order-repository.int.test.ts` (desviación: ver abajo) |
| R7 | `tests/unit/pedidos-ui/order-form.test.tsx`; `e2e/pedidos-terminados.spec.ts` |
| R8 | `update-order.test.ts` (ENTREGADO/CANCELADO → `invalid_transition` sin escribir); `order-service.test.ts` |
| R9 | `tests/unit/pedidos/cancel-order.test.ts` (existente, verde); `order-finished-at.int.test.ts`; `order-service.test.ts` |
| R10 | `qc145-estado-solo-planta.test.ts`; `update-order.test.ts` |
| R11 | `tests/unit/asignaciones/assignment-views.test.ts`; `tests/unit/asignaciones-ui/asignacion-page.test.tsx`; `list-assigned-orders.test.ts` sin cambio de expectativas |
| R12 | `assignment-views.test.ts`; `asignacion-page.test.tsx` |
| R13 | `assignment-views.test.ts`; `asignacion-page.test.tsx` |
| R14 | `assignment-views.test.ts` |
| R15 | `assignment-views.test.ts`; `asignacion-page.test.tsx`; `assignment-view-params.test.ts` |
| R16 | `tests/unit/identity/permissions.test.ts` (existente); `qc145-estado-solo-planta.test.ts` (16 permisos) |
| R17 | `tests/unit/asignaciones/list-finished-orders.test.ts`; `tests/integration/asignaciones/finished-orders.int.test.ts`; `tests/integration/pedidos/order-catalog-company-summary.int.test.ts` |
| R18 | `tests/unit/asignaciones/authorization.test.ts`; `list-finished-orders.test.ts`; `finished-orders.int.test.ts` |
| R19 | `list-finished-orders.test.ts`; `finished-orders.int.test.ts`; `tests/unit/asignaciones-ui/finished-orders-list-section.test.tsx` |
| R20 | `finished-orders.int.test.ts` (recientes primero; «sin fecha» al final por número descendente; estable entre páginas); `order-catalog-company-summary.int.test.ts`; `order-catalog.test.ts` (`nulls: 'last'` explícito) |
| R21 | `tests/unit/asignaciones-ui/finished-orders-columns.test.tsx`; `list-finished-orders.test.ts` (responsables con el actor incluido) |
| R22 | `tests/unit/asignaciones/list-company-orders.test.ts`; `tests/integration/asignaciones/company-orders.int.test.ts`; `order-catalog-company-summary.int.test.ts` |
| R23 | `authorization.test.ts`; `list-company-orders.test.ts`; `company-orders.int.test.ts` |
| R24 | `list-company-orders.test.ts` (exactamente ENTREGADO, mezcla, duplicados); `company-orders.int.test.ts`; `tests/unit/asignaciones-ui/company-orders-columns.test.tsx` (filtro) |
| R25 | `company-orders-columns.test.tsx`; `list-company-orders.test.ts` |
| R26 | `finished-orders-columns.test.tsx`, `company-orders-columns.test.tsx` (sin acción ni enlace a `/asignacion/<id>`) |
| R27 | `list-finished-orders.test.ts`, `list-company-orders.test.ts`; `finished-orders-list-section.test.tsx`, `company-orders-list-section.test.tsx`; `asignacion-page.test.tsx`; `assignment-view-params.test.ts` |
| R28 | `e2e/pedidos-terminados.spec.ts` (los tres roles del seed) |
| R29 | `qc145-estado-solo-planta.test.ts` (sin dependencias nuevas frente a `origin/dev`; mismos 23 modelos); `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) |
| R30 | `finished-orders.int.test.ts` (Finalizar por el caso de uso real → aparece con fecha; el previo sale sin fecha); `e2e/pedidos-terminados.spec.ts` |
| R31 | `company-orders-columns.test.tsx` (la fecha solo aparece con el filtro exactamente ENTREGADO); `assignment-view-params.test.ts` (`isExactlyDelivered` y regresión de la frontera servidor/cliente) |
| R32 | `tests/unit/asignaciones/list-responsible-candidates.test.ts`; `tests/unit/pedidos-ui/order-list-section.test.tsx`; `tests/integration/identity/assignment-directory.int.test.ts` (`listAliveInCompany`, permisos, ámbito y tope 25); E2E |
| R33 | `tests/unit/asignaciones/assign-responsibles.test.ts` (persona suelta → `user_cannot_be_responsible`, sin escribir, orden de rechazos); `tests/unit/asignaciones/responsible-eligibility.test.ts`; `tests/integration/asignaciones/responsible-eligibility.int.test.ts`; `order-assignment-actions.test.ts` (traducción por `code`) |
| R34 | `assign-responsibles.test.ts`; `responsible-eligibility.int.test.ts`; `responsible-eligibility.test.ts` |
| R35 | `responsible-eligibility.int.test.ts` (Administrador no asignado: get/start/finish reales → `order_not_found`, sin escribir); E2E (`/asignacion/<id>` → no encontrado) |
| R36 | `assign-responsibles.test.ts`; `responsible-eligibility.int.test.ts` (grupo con Administrador y Operador: no falla, el Operador queda y el Administrador sin fila) |
| R37 | `responsible-eligibility.int.test.ts` (fila sembrada directa en `order_assignments` → sigue abriendo, arrancando y finalizando); `orders-finished-at-migration.test.ts` (el SQL no nombra `order_assignments`) |

37 declarados, 37 mapeados. Todos los archivos citados existen y pasan.

## Salida real de la verificación

- `pnpm run typecheck` → `tsc --noEmit` sin salida (verde).
- `pnpm run lint` → `eslint` sin salida (verde).
- `pnpm exec vitest related --run <49 archivos de producción de la rama>` (primera corrida):
  ```
  test-db: la corrida de integracion va contra qct_qc145_e4261b2c_mue9hazz_jhk (copia de qct_tpl_d83c74aff6e2).
   FAIL  |integration| tests/integration/pedidos/pedidos-constraints.int.test.ts > el pedido como fila completa > la tabla real no tiene ninguna columna de total, subtotal, impuesto ni cliente
   Test Files  1 failed | 403 passed (404)
        Tests  1 failed | 5937 passed | 29 skipped (5967)
  ```
  Era la lista cerrada de columnas de `orders`, sin `finished_at`. Se enmendó en `4f286f56`.
- `pnpm exec vitest related --run` (misma lista, tras la enmienda):
  ```
  test-db: la corrida de integracion va contra qct_qc145_e4261b2c_mue9utpk_2mc (copia de qct_tpl_d83c74aff6e2).
   Test Files  404 passed (404)
        Tests  5938 passed | 29 skipped (5967)
  test-db: borrada la base de la corrida: qct_qc145_e4261b2c_mue9utpk_2mc.
  ```
- `pnpm exec vitest run tests/guards` (tras `2f52091f`):
  ```
   Test Files  42 passed (42)
        Tests  537 passed | 5 skipped (542)
  ```
- **No se corrió** `pnpm test`, la suite completa ni `./init.sh`. Los corre el leader.

## E2E (contra `QuimiCloude_QC145`, puerto 3117, `--workers=1`, una corrida cada vez)

Specs: `e2e/pedidos-terminados.spec.ts`, `pedidos.spec.ts`, `pedidos-asignados.spec.ts` y
`pedidos-responsables.spec.ts`. Salida completa en el scratchpad de la sesión (`e2e-salida.txt`).

- **Corridas 1 y 2**: 6 passed y 2 failed, en Chromium y en WebKit. El E2E destapó dos defectos de
  T13 que los tests de jsdom no ven:
  1. `page.tsx` (Server Component) llamaba a `isExactlyDelivered` desde un módulo `'use client'`, y
     la vista «Todos» respondía 500. Arreglado en `bce85449`, con un test de fuente de regresión.
  2. Las constantes `*_SECTION_TESTID` se exportaban, pero ningún nodo las llevaba. Arreglado en
     `951204df`, con tests de sección.
- **Corrida 3 (final)**:
  ```
  --- chromium ---
    8 passed (45.8s)
  --- webkit ---
    8 passed (1.3m)
  ```
  Los ocho, en los dos proyectos: Operador solo «Mis asignados» (R28); Empacador «Terminados» (R28,
  R30); Administrador «Todos», filtro Entregado y `/asignacion/<id>` no encontrado (R28, R35);
  `/pedidos` sin estado y selector sin otro Administrador (R7, R32); `pedidos-asignados` R27;
  `pedidos-responsables` R37; `pedidos` R48/R29 y R49.
- `pedidos.spec.ts`, `pedidos-asignados.spec.ts` y `pedidos-responsables.spec.ts` no necesitaron
  ajuste: no usaban el selector de estado ni asignaban a un Administrador.
- El resto de `e2e/` **no** se corrió. Lo corre el leader con el gate; el E2E de `dev` arrastra 11
  rojos ajenos, listados en `progress/current.md > Deudas`.

## Desviaciones y notas para el reviewer

1. **R6 en integración**: el test va en `order-repository.int.test.ts` y no en
   `order-crud.int.test.ts`. Este último prueba SQL crudo con transacciones revertidas y no ejecuta
   el adaptador. Tanto él como `company-scope-queries.int.test.ts` se corrieron en verde.
2. **Constantes muertas**: `order-form.tsx` sigue exportando `ORDER_STATUS_FIELD`,
   `ORDER_STATUS_SELECT_TESTID` y `ORDER_STATUS_OPTION_TESTID` sin ningún nodo que las use.
   `tests/guards/guard-pantalla-pedidos-se-amplia.test.ts` exige que el barrel las publique por
   nombre. Retirarlas obliga a enmendar esa guardia, y se deja a decisión del reviewer o del leader.
3. **Commits cruzados por carrera** entre carriles paralelos sobre `pedidos/index.ts` y
   `asignaciones/index.ts` (T3 dentro de T4; T7 con dos líneas de T9, corregido en `26e5198e`). El
   contenido final se verificó: typecheck en verde y todos los exports presentes.
4. **`lib/composition/index.ts`** se tocó en T4, antes que en T11, porque sin ese cambio el repo no
   compilaba tras ampliar `OrderCatalog`.
5. **`page.tsx` en T13**: usa los esqueletos propios de cada vista. No estaba en la lista de
   archivos de T13.
6. **Comentarios**: `3250a968` limpió 43 citas nuevas en 24 archivos de producción. Quedan 3 citas
   `R27`/`R28` preexistentes en `order-form.tsx` y `order-list-section.tsx`, en líneas que esta
   rama no toca.
7. **Revisión multiplataforma de T13**: se hizo leyendo el código (reutiliza `DataTable`,
   `ResponsibleAvatars`, `OrderPresentationLabel` y enlaces con `min-h-11 min-w-11`) y con el E2E en
   WebKit de escritorio. No se probó en un dispositivo iOS/Android real.
8. **Degradación del selector** (`design.md > 3.6`, declarada al aprobar): la lista de personas ya
   no depende de `usuarios.consultar`, solo de `asignaciones.modificar`. El test de la vieja
   degradación se reescribió con su motivo.
