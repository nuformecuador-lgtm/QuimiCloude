# impl — QC-146 presentacion-del-pedido

> F2.1, 2026-09-22. Implementer + `backend_dev` + `frontend_dev`. Rama
> `feature/QC-146-presentacion-del-pedido`, worktree `.worktrees/QC-146-presentacion-del-pedido`.

## Estado de las tasks

T1–T9 y T11 `[x]`. **T10 `[ ]`**: el E2E está escrito (`e2e/pedidos.spec.ts`,
`e2e/aislamiento-pedidos.spec.ts`), pasa typecheck y lint, pero **no se ha ejecutado**: el
implementer no corre E2E (`AGENTS.md > Regla del gate`). Su «hecho» depende de que el leader corra
`pnpm run e2e -- e2e/pedidos.spec.ts e2e/aislamiento-pedidos.spec.ts`.

## Desviaciones del design, con su porqué

1. **Timestamp de la migración: `20260922130000_orders_presentation`**, no `20260922120000`. Al
   sincronizar con `origin/dev` llegó `20260922120000_packer_role` (QC-144) con el mismo
   timestamp; se renombró la carpeta, se actualizó la fila de `_prisma_migrations` de la base de
   desarrollo y se hizo `db:rollback` → `db:migrate` con el nombre nuevo (limpio).
2. **`startAssignedOrder` también recibe `presentations`** (design > 7 decía que no):
   `StartAssignedOrderDeps = GetAssignedOrderExecutionDeps & {...}` y envuelve ese caso de uso, así
   que la dependencia es obligatoria en compilación. Su vista ya lleva `presentationName`.
3. **Tests ajenos adaptados por la FK nueva** (sin cambiar lo que prueban):
   - `tests/unit/pedidos/schema/orders-company-scope-migration.test.ts`: el recuento de
     restricciones «previas» recorría TODAS las migraciones; ahora solo las anteriores a la suya.
   - `tests/integration/proveedores/company-scope.int.test.ts` (R10 de su ficha): su `down.sql` ya
     no puede soltar `presentations_company_id_id_key` con la FK de pedidos viva; el test revierte
     antes, leídos del disco, los `down.sql` de migraciones posteriores que referencian esa clave
     (orden inverso de aplicación, como un rollback real).
   - `tests/unit/inventario/scope.test.ts`: `shared/order-presentation-label.tsx` entra en la
     exclusión de selectores promovidos (casa por nombre; no es pantalla de catálogo).
   - `tests/guards/guard-identificador-de-request.test.ts`: la lista cerrada de migraciones gana
     la de esta ficha.
   - `tests/integration/asignaciones/assigned-orders.int.test.ts` (llegó de dev con QC-144):
     cablea `presentations` en `createListAssignedOrders`.
4. Pregunta abierta 1 (texto de `presentation_in_use`): **no se cambia**, como fijó la aprobación.

## Archivos

**Nuevos:** `db/migrations/20260922130000_orders_presentation/{migration.sql,down.sql}`,
`lib/modules/inventario/domain/presentation-catalog.ts`,
`lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma.ts`,
`components/shared/order-presentation-label.tsx`,
`tests/unit/pedidos/schema/orders-presentation-migration.test.ts`,
`tests/unit/inventario/presentation-catalog.test.ts`, `tests/unit/pedidos/qc146-alcance.test.ts`,
`tests/unit/shared/order-presentation-label.test.tsx`.

**Modificados, producción:** `db/schema.prisma` (solo `Order`); `lib/modules/inventario/index.ts`;
`lib/modules/pedidos/domain/{order-input,order-view,errors,create-order,update-order,get-order,list-orders,order-catalog}.ts`,
`lib/modules/pedidos/index.ts`,
`lib/modules/pedidos/adapters/driven/persistence/{order-prisma,order-catalog-prisma}.ts`,
`lib/modules/pedidos/adapters/driving/order-actions.ts`;
`lib/modules/asignaciones/domain/{assigned-order-view,assigned-order-execution-view,list-assigned-orders,get-assigned-order-execution}.ts`;
`lib/composition/index.ts`;
`app/(private)/pedidos/components/{order-form,order-columns,order-list-skeleton,index}`;
`app/(private)/asignacion/components/{assigned-orders-columns,assigned-orders-skeleton,index}`;
`app/(private)/asignacion/[id]/components/{order-execution-screen,index}`.
Sin tocar: `resolve-ingredients-cost.ts`, `order-cost.ts`, `cancel-order.ts`, `delete-order.ts`,
`order-queryable.ts`, `presentation-prisma.ts`, `presentation-select.tsx`, `permissions.ts`,
`package.json`.

**Modificados, tests:** `tests/unit/pedidos/*` (order-input, create-order, update-order,
cancel-order, delete-order, authorization, company-isolation-service, company-scope, list-orders,
order-service, order-catalog, order-view, order-actions, schema/pedidos-schema,
schema/orders-company-scope-migration); `tests/unit/asignaciones/{list-assigned-orders,get-assigned-order-execution,start-assigned-order,authorization}`;
`tests/unit/pedidos-ui/*` (order-form, order-columns, order-sheet, order-table, order-row-wiring,
order-sheet-responsibles, read-only, order-list-section, pedidos-viewport, order-row-actions,
cancel-order-dialog, delete-order-dialog);
`tests/unit/asignaciones-ui/{assigned-orders-columns,order-execution-screen,order-execution-page}`;
`tests/integration/pedidos/*` (pedidos-constraints, order-crud, order-repository,
company-scope-queries, list-query-orders, order-sequence, order-sequence-race,
order-duplicate-number, order-ingredients-cost); `tests/integration/inventario/company-scope-queries`;
los ajenos del punto 3; `e2e/pedidos.spec.ts`, `e2e/aislamiento-pedidos.spec.ts`.

## Mapa R<n> → test

| R | Test |
|---|---|
| R1 | `tests/integration/pedidos/pedidos-constraints.int.test.ts` › «R1: guarda y relee un pedido con una presentacion de su empresa»; `tests/unit/pedidos/schema/pedidos-schema.test.ts` › «presentationId es uuid anulable, sin @relation y con su indice (R1, R2, R5)» |
| R2 | `tests/unit/pedidos/schema/orders-presentation-migration.test.ts` (describes de migration.sql y down.sql, R2); `pedidos-constraints.int.test.ts` › «R2: un pedido sin presentacion se acepta y se relee con ausencia de valor» |
| R3 | `pedidos-constraints.int.test.ts` › «R3: rechaza una presentacion de otra empresa y una inexistente con 23503»; `orders-presentation-migration.test.ts` › FK compuesta (R3, R4) |
| R4 | `pedidos-constraints.int.test.ts` › «R4: borrar una presentacion usada por un pedido vivo, cancelado o dado de baja se rechaza con 23503 y deja las dos filas»; `tests/unit/inventario/presentation-service.test.ts` (existente, `in_use` → `presentation_in_use`) |
| R5 | `tests/integration/pedidos/order-crud.int.test.ts` › «R5: la baja logica conserva la presentacion»; `pedidos-schema.test.ts` (R1, R2, R5) |
| R6 | `tests/unit/pedidos/order-input.test.ts` › «R6: rechaza la presentacion ausente o con forma que no es un uuid»; `create-order.test.ts` › «R6: sin presentacion lanza invalid_input y no escribe» |
| R7 | `order-input.test.ts` › «R7: la edicion exige presentacion…»; `update-order.test.ts` › «R7: editar un pedido sin presentacion exige elegir una» |
| R8 | `create-order.test.ts` › «R8: una presentacion ausente del catalogo de la empresa -> presentation_not_found, sin escribir»; `update-order.test.ts` (R8); `company-isolation-service.test.ts` › «R8: una presentación de otra empresa se rechaza como inexistente» |
| R9 | `update-order.test.ts` › «R9: un pedido PENDIENTE y uno EN_CURSO cambian de presentacion»; `order-crud.int.test.ts` › «R9: editar sustituye la presentacion por otra de la misma empresa» |
| R10 | `update-order.test.ts` › «R10: ENTREGADO y CANCELADO rechazan con invalid_transition sin consultar el catalogo de presentaciones» |
| R11 | `cancel-order.test.ts` › «R11: un pedido sin presentación se cancela»; `delete-order.test.ts` › «R11: un pedido sin presentación se da de baja» |
| R12 | `tests/unit/pedidos/authorization.test.ts` › «R12: createOrder/updateOrder sin pedidos.modificar rechaza con unauthorized y no llama a presentations.findRefs» |
| R13 | `create-order.test.ts` › «R13: el coste y la cantidad no dependen de la presentacion»; `qc146-alcance.test.ts` › «R13 — el costo de ingredientes no nombra la presentacion» |
| R14 | `order-crud.int.test.ts` › «R14: el alta y la edicion con presentacion no escriben movimientos ni cambian la existencia de los lotes» |
| R15 | `qc146-alcance.test.ts` › «R15 — ningun permiso nombra la presentacion, y el Operador conserva sus dos permisos» |
| R16 | `tests/unit/pedidos-ui/order-form.test.tsx` › «R16: el alta ofrece el campo Presentación obligatorio» |
| R17 | `order-form.test.tsx` › «R17: el selector de presentación no ofrece crear» |
| R18 | `order-form.test.tsx` › «R18: la edición precarga la presentación; sin presentación el campo arranca vacío y no guarda» |
| R19 | `order-form.test.tsx` › «R19: presentation_not_found se pinta junto al campo y conserva lo escrito» |
| R20 | `tests/unit/pedidos-ui/order-columns.test.tsx` › «R20: la columna Presentación pinta el nombre o Sin presentación»; `order-list-skeleton.test.tsx` (relativo a `ORDER_COLUMNS.length`, ahora 10) |
| R21 | `order-columns.test.tsx` › «R21: Presentación no ordena ni filtra»; `list-orders.test.ts` › «R21: ordenar o filtrar por presentacion se OMITE y se anota…» |
| R22 | `list-orders.test.ts` › «R22: una sola llamada al catalogo de presentaciones por pagina…» y «R22: ninguna llamada… si ningun pedido de la pagina tiene presentacion» |
| R23 | `order-service.test.ts` › «R23: la ficha devuelve id y nombre de la presentacion…» y «R23: un pedido sin presentacion devuelve su ausencia, sin consultar el catalogo» |
| R24 | `tests/unit/asignaciones/list-assigned-orders.test.ts` › «R24: cada fila lleva el nombre de la presentacion, o null, con una sola llamada al catalogo»; `tests/unit/asignaciones-ui/assigned-orders-columns.test.tsx` › «R24: columna Presentación» |
| R25 | `tests/unit/asignaciones/get-assigned-order-execution.test.ts` › «R25: la vista lleva el nombre de la presentacion…» / «R25: un pedido sin presentacion…»; `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` › «R25: muestra la presentación o Sin presentación» |
| R26 | `list-assigned-orders.test.ts` › «R26: un actor con solo asignaciones.consultar recibe la presentacion…»; `order-execution-screen.test.tsx` › «R26: no hay ningún control de presentación» |
| R27 | `tests/unit/pedidos/order-catalog.test.ts` › «R27: copia presentationId tal cual, con y sin presentacion»; `tests/integration/pedidos/order-repository.int.test.ts` › «R27 — listAliveOrderSummariesByIds devuelve la presentacion» |
| R28 | `tests/unit/inventario/presentation-catalog.test.ts` › «R28 — findRefs compone el ambito con presentationCompanyScope y con ids vacios no consulta»; `tests/integration/inventario/company-scope-queries.int.test.ts` › «R28 … PresentationCatalog.findRefs no devuelve presentaciones de otra empresa» |
| R29 | `e2e/pedidos.spec.ts` › «el Administrador entra, da de alta un pedido, lo ve por su correlativo y lo cancela con motivo (R48, R29)». **Escrito, sin ejecutar** |
| R30 | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente); `qc146-alcance.test.ts` › «R30 — package.json no gana ninguna dependencia» |

## Salida real de los tests

`./init.sh --rapido` (cierre de la tanda T3–T9, 2026-09-22):

```
✓ typecheck paso
✓ lint paso
 Test Files  216 passed (216)
      Tests  3165 passed | 6 skipped (3171)
 (guardias) Test Files  48 passed (48)
      Tests  594 passed | 9 skipped (603)
✓ test:rapido paso
```

`./init.sh` completo (tras sincronizar con `origin/dev` `cc5f34c0`, 2026-09-22):

```
✓ typecheck paso
✓ lint paso
 Test Files  617 passed (617)
      Tests  8708 passed | 117 skipped (8825)
✓ los tres proyectos corrieron (ui, node, integration)
✓ tests: sin rojos nuevos (617 archivos ejecutados, baseline vacio)
✓ todas las migraciones tienen down.sql
== init OK ==
```

Migración: `db:migrate` → `db:rollback` → `db:migrate` hecho dos veces (con el nombre original y
con `20260922130000`); `_prisma_migrations` con una sola fila, sin `rolled_back_at`.

E2E: **no ejecutado** (ver T10).
