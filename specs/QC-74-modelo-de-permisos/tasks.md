# QC-74 — modelo-de-permisos · tasks.md

> Orden por dependencias. `[P]` = paralelizable con las otras `[P]` de su mismo bloque (no tocan los
> mismos archivos). Cada task dice **que archivos toca** —esa lista se usa despues para validar
> conflictos de paralelismo— y su **criterio de hecho**.
>
> Gate por tanda: `./init.sh --rapido`. Gate de cierre y antes del PR: `./init.sh` completo
> (`docs/verification.md`).

## Bloque A — el catalogo en codigo (sin dependencias)

- [x] **T1. Catalogo de permisos y asignacion sembrada.**
      Archivos: `lib/modules/identity/domain/permissions.ts` (nuevo),
      `lib/modules/identity/index.ts`.
      Exporta `PERMISSIONS` (diez entradas con `code`/`module`/`action`/`description`),
      `type PermissionCode` (union de literales) y `SEED_ROLE_PERMISSIONS` (Administrador: los diez,
      escritos uno a uno; Operador: solo `inventario.consultar`), y los publica por el barrel.
      **Hecho cuando**: `tests/unit/identity/permissions.test.ts` verifica R1, R2, R8, R9 —forma del
      codigo, los diez codigos exactos, `dashboard`/`unidades` con solo `consultar`, los diez del
      Administrador y el unico del Operador— y `pnpm run typecheck` pasa.

- [x] **T2. `assertPermission`, la unica implementacion.** Depende de T1.
      Archivos: `lib/modules/identity/domain/require-permission.ts` (nuevo),
      `lib/modules/identity/index.ts`.
      Firma de `design.md > 5`: `(actor, permission, onDenied) => void`, pertenencia exacta, falla
      cerrado, sin conocer ninguna jerarquia de errores.
      **Hecho cuando**: `tests/unit/identity/require-permission.test.ts` cubre R13 y R14 —actor
      `null`/`undefined`, `permissions` ausente, vacio, con otro codigo, con un prefijo
      (`inventario.` no concede), con el codigo pedido— y verifica que el error lanzado es
      exactamente el que devuelve `onDenied`.

## Bloque B — base de datos (paralelo a A)

- [x] **T3. [P] Modelos Prisma `Permission` y `RolePermission`.**
      Archivos: `db/schema.prisma`.
      Con `/// @module identity`, `Role.permissions`, PK compuesta, `@@index([permissionCode])`,
      FKs `Restrict`, sin columna de empresa.
      **Hecho cuando**: `pnpm run db:migrate:create` genera el `migration.sql` sin diff pendiente y
      `guard-arquitectura-modulos` sigue verde.

- [x] **T4. Migracion con su `down.sql`.** Depende de T3.
      Archivos: `db/migrations/<timestamp>_permissions_and_role_permissions/migration.sql`,
      `.../down.sql`.
      `ENABLE` + `FORCE ROW LEVEL SECURITY` en las dos tablas al final del UP; el DOWN borra
      `role_permissions` y luego `permissions`.
      **Hecho cuando**: `pnpm run db:migrate` aplica, `pnpm run db:rollback` revierte dejando
      `_prisma_migrations` coherente, y se vuelve a aplicar (R22). Queda anotado el comando y su
      salida en `progress/impl_QC-74-modelo-de-permisos.md`.

## Bloque C — seed

- [x] **T5. Puerto y adaptador del seed de permisos.** Depende de T3.
      Archivos: `lib/modules/identity/ports/initial-access-repository.ts`,
      `lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts`.
      Cuatro metodos nuevos: `findExistingPermissionCodes`, `createPermissions`,
      `findRolePermissionCodes`, `createRolePermissions`. Sin `upsert` y sin `update`.
      **Hecho cuando**: typecheck verde y la integracion de T7 los ejercita.

- [x] **T6. El paso de permisos dentro de `seedInitialAccess`.** Depende de T1, T5.
      Archivos: `lib/modules/identity/domain/seed-initial-access.ts`.
      Entre crear roles y crear el administrador; crea solo lo que falta; `SeedOutcome` gana
      `createdPermissions` y `createdRolePermissions`.
      **Hecho cuando**: `tests/unit/identity/seed/seed-initial-access.test.ts` (ampliado) prueba con
      dobles: base vacia crea los diez permisos y las once asignaciones; segunda corrida no crea
      nada; una asignacion preexistente no se toca ni se duplica (R10).

- [x] **T7. Resumen del seed y verificacion contra base real.** Depende de T6.
      Archivos: `scripts/seed.ts`, `tests/integration/identity/identity-seed.int.test.ts`.
      **Hecho cuando**: la integracion comprueba, contra la base de test, que tras el seed el
      Administrador tiene los diez permisos y el Operador exactamente `inventario.consultar` (R8, R9,
      R10), y que una segunda corrida no cambia el conteo.

## Bloque D — el conjunto de permisos llega al servicio

- [x] **T8. La sesion trae los permisos.** Depende de T3.
      Archivos: `lib/modules/identity/ports/session-user-reader.ts`,
      `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts`,
      `lib/modules/identity/domain/session-user.ts`,
      `lib/modules/identity/domain/resolve-session-user.ts`.
      `SessionUserRecord` y `SessionUser` ganan `permissions: readonly string[]`; el `select` gana
      `role.permissions`, en la MISMA llamada a `findFirst`. `roleName` se queda (display).
      **Hecho cuando**: `tests/unit/identity/resolve-session-user.test.ts` prueba que los permisos
      viajan; un test del adaptador (o la integracion) demuestra **una sola** consulta por peticion
      (R11).

## Bloque E — los cinco modulos (uno por task, `[P]` entre si; dependen de T2 y T8)

Cada task del bloque hace lo mismo en su modulo: `Actor` pasa a `{ id, permissions }`,
`requireAdmin` pasa a `requirePermission(actor, <codigo>)` con el codigo de la tabla R16, el barrel
renombra el export, y el adaptador driving construye el actor con `permissions`. **Ningun bloque de
traduccion de errores cambia**: `error instanceof <Modulo>Error` sigue igual (R15).

- [x] **T9. [P] `inventario`.**
      Archivos: `lib/modules/inventario/domain/actor.ts`, `.../domain/{get-product,list-products,
      list-presentations,create-product,update-product,delete-product,create-presentation,
      update-presentation,delete-presentation}.ts`, `lib/modules/inventario/index.ts`,
      `lib/modules/inventario/adapters/driving/{product-actions,presentation-actions}.ts`,
      `tests/unit/inventario/authorization.test.ts` (+ los `tests/unit/inventario/*.test.ts` que
      construyen un `Actor`).
      **Hecho cuando**: para los nueve casos de uso hay test de concesion con el permiso exacto y de
      rechazo sin el, incluyendo el cruzado (`inventario.consultar` no abre una escritura y viceversa)
      (R13, R16, R17), y el rechazo ocurre sin tocar ningun puerto (espias sin llamadas) (R12).

- [x] **T10. [P] `recetas`.**
      Archivos: `lib/modules/recetas/domain/actor.ts`, `.../domain/{get-recipe,list-recipes,
      create-recipe,update-recipe,delete-recipe}.ts`, `lib/modules/recetas/index.ts`,
      `lib/modules/recetas/adapters/driving/recipe-actions.ts`,
      `tests/unit/recetas/authorization.test.ts` (+ los `tests/unit/recetas/*.test.ts` con `Actor`).
      **Hecho cuando**: mismo criterio que T9 para los cinco casos de uso.

- [x] **T11. [P] `unidades`.**
      Archivos: `lib/modules/unidades/domain/actor.ts`, `lib/modules/unidades/domain/list-units.ts`,
      `lib/modules/unidades/index.ts`,
      `lib/modules/unidades/adapters/driving/unit-actions.ts`,
      `tests/unit/unidades/{list-units,list-units-query,unit-actions}.test.ts`.
      **Hecho cuando**: `listUnits` exige `unidades.consultar`; los casos que hoy prueban rechazo por
      rol (`''`, `null`, `'Operador'`, `'Administradores externos'`) pasan a probar rechazo por
      conjunto de permisos (R14, R16).

- [x] **T12. [P] `proveedores`.**
      Archivos: `lib/modules/proveedores/domain/actor.ts`, `.../domain/{get-supplier,list-suppliers,
      list-catalog-lines,create-supplier,update-supplier,delete-supplier,create-catalog-line,
      update-catalog-line,delete-catalog-line}.ts`, `lib/modules/proveedores/index.ts`,
      `lib/modules/proveedores/adapters/driving/{supplier-actions,supplier-catalog-actions}.ts`,
      `tests/unit/proveedores/authorization.test.ts` (+ los `tests/unit/proveedores/*.test.ts` con
      `Actor`).
      **Hecho cuando**: mismo criterio que T9 para los nueve casos de uso.

- [x] **T13. [P] `pedidos`.**
      Archivos: `lib/modules/pedidos/domain/actor.ts`, `.../domain/{get-order,list-orders,
      create-order,update-order,cancel-order,delete-order}.ts`, `lib/modules/pedidos/index.ts`,
      `lib/modules/pedidos/adapters/driving/order-actions.ts`,
      `tests/unit/pedidos/authorization.test.ts` (+ los `tests/unit/pedidos*/**.test.ts` con `Actor`).
      **Hecho cuando**: mismo criterio que T9 para los seis casos de uso. La mitad centinela que hoy
      vigila el literal del rol en `tests/unit/pedidos/authorization.test.ts` se retira: la sustituye
      la guardia de T15, que es global.

## Bloque F — retirada de lo viejo

- [x] **T14. Borrar `assertAdminRole`.** Depende de T9-T13.
      Archivos: `lib/modules/identity/domain/require-admin.ts` (borrado),
      `lib/modules/identity/index.ts`, `tests/unit/identity/require-admin.test.ts` (borrado).
      **NO se tocan** `lib/modules/identity/domain/roles.ts`,
      `lib/composition/route-role-rules.ts`, `middleware.ts` ni
      `tests/guards/guard-rol-administrador-unico.test.ts` (R23).
      **Hecho cuando**: `pnpm run typecheck` y `pnpm test` verdes sin ninguna referencia a
      `assertAdminRole` ni `requireAdmin` en produccion, y `guard-rol-administrador-unico` sigue
      verde con sus dos anclas.

## Bloque G — guardias (`[P]` entre si)

- [x] **T15. [P] Guardia: ningun permiso declarado sin rol.** Depende de T1.
      Archivos: `tests/guards/guard-permisos-sembrados.test.ts` (nuevo).
      **Hecho cuando**: falla en rojo con un catalogo sintetico que declara un permiso sin asignar,
      pasa con el real, comprueba tambien el sentido inverso, y tiene las anclas contra el verde por
      vacuidad (R19, R21).

- [x] **T16. [P] Guardia: ningun servicio autoriza por nombre de rol.** Depende de T9-T14.
      Archivos: `tests/guards/guard-autorizacion-por-permiso.test.ts` (nuevo).
      Barrido y exenciones segun `design.md > 6.2`; patron derivado de `ROLE_ADMINISTRADOR` /
      `ROLE_OPERADOR`, `stripComments` de linea antes que de bloque.
      **Hecho cuando**: dispara sobre un `actor.ts` sintetico con `roleName` y sobre uno con el
      literal del rol; no dispara sobre el `actor.ts` real ni sobre un comentario que mencione el
      rol; el barrido excluye `identity`, `lib/composition/route-role-rules.ts`, `middleware.ts`,
      `tests/`, `e2e/`, `scripts/` y `db/` (R20, R21).

## Bloque H — cierre

- [ ] **T17. Mapa de trazabilidad.** Depende de todo lo anterior.
      Archivos: `progress/impl_QC-74-modelo-de-permisos.md`.
      **Hecho cuando**: contiene el mapa `R1..R24 -> test concreto` (archivo + nombre del caso), sin
      ningun requisito sin test, y la bitacora de comandos con su salida (`CHECKPOINTS.md >
      Trazabilidad`).

- [ ] **T18. Gate completo.** Depende de T17.
      **Hecho cuando**: `./init.sh` termina en verde y queda anotado en
      `progress/impl_QC-74-modelo-de-permisos.md`. Sin E2E nuevo: desviacion declarada en
      `design.md > 10` por la decision 12.
