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
