# impl QC-144 — rol-empacador

> Implementer: F2.1 · Rama `feature/QC-144-rol-empacador` · worktree `.worktrees/QC-144-rol-empacador`
> Spec aprobado 2026-09-22. Todo backend (`backend_dev`); sin UI.

## Catálogo previo (anotado antes de T1)

Base: `origin/dev` = `c802c645` (merge PR #106). QC-142 **no** ha entrado.

`PERMISSIONS` en `dev`: **15** códigos, en este orden:
`dashboard.consultar`, `inventario.consultar`, `inventario.modificar`, `recetas.consultar`,
`recetas.modificar`, `unidades.consultar`, `unidades.modificar`, `proveedores.consultar`,
`proveedores.modificar`, `pedidos.consultar`, `pedidos.modificar`, `usuarios.consultar`,
`usuarios.modificar`, `asignaciones.consultar`, `asignaciones.modificar`.

Por tanto: catálogo nuevo = **16**; la enmienda de QC-144 es la **cuarta** (QC-38, QC-66, QC-86).
Asignaciones del seed: Administrador 15 -> 16, Operador 2, Empacador 2 -> total 17 -> **20**.

Última migración en `dev`: `20260918130000_*` (tres carpetas con ese timestamp:
`document_batches_and_files`, `orders_add_ingredients_cost`, `product_unit_and_stored_stock`).

## Commits (rama `feature/QC-144-rol-empacador`)

| Hash | Tasks |
|---|---|
| `0ef4662c` | T1–T3 dominio + recuentos en unitarios/guardias |
| `4f2c46ac` | T7–T10 |
| `b67e902f` | T4–T6 migración `20260922120000_packer_role` + test estático |
| `a20e0b95` | limpieza de comentarios de la migración; `R11`/`R20`/`R26` en los nombres de los casos |
| `383213aa` | T12, T14 |
| `b3943f33` | T11, T13 |
| `c57b579a` | T2, T3 reabiertas (enmienda D10): comentarios sin citas en las líneas de la rama; bloque de enmienda de `permissions.ts` con el texto de `design.md > 2` |
| `4238eaff` | T3: caso R6 enmendado (bloque sin citas, ≤5 líneas, con «enmienda» y `lib/modules/`; simétrico sintético) |
| `aaff8cf0` | T16: `guard-permisos-no-administrables` vigila también `Role` y SQL crudo sobre `roles`/`permissions`/`role_permissions` |

## Archivos

**Producción, modificados:** `lib/modules/identity/domain/roles.ts`,
`lib/modules/identity/domain/permissions.ts`, `lib/modules/identity/index.ts`.

**Producción, nuevos:** `db/migrations/20260922120000_packer_role/migration.sql`,
`db/migrations/20260922120000_packer_role/down.sql`.

**Tests nuevos:** `tests/unit/identity/roles/empacador-rol.test.ts`,
`tests/unit/identity/schema/packer-role-migration.test.ts`,
`tests/unit/asignaciones/empacador-authorization.test.ts`,
`tests/unit/navegacion/menu-empacador.test.ts`,
`tests/integration/identity/packer-role-migration.int.test.ts`.

**Tests modificados:** `tests/unit/identity/permissions.test.ts`,
`tests/guards/guard-permisos-sembrados.test.ts`, `tests/guards/guard-nav-permisos-declarados.test.ts`,
`tests/unit/navegacion/qc75-convenciones.test.ts`, `tests/unit/documentos/authorization.test.ts`,
`tests/unit/asignaciones/schema/order-assignments-migration.test.ts`,
`tests/unit/identity/grupos/scope.test.ts`, `tests/unit/identity/roles/scope.test.ts`,
`tests/unit/identity/seed/seed-initial-access.test.ts`,
`tests/guards/guard-autorizacion-por-permiso.test.ts`,
`tests/integration/identity/identity-seed.int.test.ts`,
`tests/integration/identity/role-catalog.int.test.ts`,
`tests/integration/identity/user-crud.int.test.ts`,
`tests/integration/asignaciones/assigned-orders.int.test.ts`.

**Fuera de la lista declarada en `tasks.md` (los exigen guardias existentes):**
- `tests/guards/guard-identificador-de-request.test.ts`: `MIGRACIONES_ESPERADAS` es una lista
  cerrada; toda migración nueva se nombra a mano (patrón de todas las anteriores).
- `tests/integration/aislamiento.json`: `guard-aislamiento-integracion` exige declarar el archivo
  de integración nuevo (`transaccion`).

**No tocados (verificado en el diff contra `origin/dev`):** `seed-initial-access.ts`,
`scripts/seed.ts`, `db/schema.prisma`, `package.json`, `app/**`, `components/**`, `middleware.ts`,
`lib/shared/**`, `lib/modules/asignaciones/**`, `lib/modules/inventario/**`, `e2e/**`.

## Notas de implementación

- **Migración escrita a mano**, no con `pnpm run db:migrate:create` (T4): `prisma migrate dev
  --create-only` se niega por drift de checksum en cuatro migraciones ajenas ya aplicadas en la base
  local (`20260911130000_inventory_company_scope`, `20260915120000_orders_company_scope`,
  `20260916120000_recipes_company_scope`, `20260917120000_suppliers_company_scope`) y solo ofrece
  `migrate reset`, que no se hizo (base compartida). Consecuencia: la comprobación «Prisma confirma
  que no hay drift de esquema» de `design.md > 3.1` no se ha hecho; la ausencia de DDL la fija el test
  estático y la no-divergencia schema/migraciones la comprueba el gate completo.
- Base local: `db:migrate` aplica la migración (16 permisos, rol + 3 asignaciones); `db:rollback`
  devuelve a 15 y sin filas del Empacador; `db:migrate` la reaplica; `db:seed` dos veces imprime
  «db:seed: nada que crear».
- T12 (d): la base de test devolvió `23503` (no `23001`); la expectativa queda como en el spec.

## Mapa R<n> -> test

| R | Test (archivo › caso) |
|---|---|
| R1 | `tests/unit/identity/roles/empacador-rol.test.ts` › `R1 — …` (fila con descripción no vacía; Administrador y Operador intactos; exactamente tres filas). También `tests/unit/identity/schema/packer-role-migration.test.ts` › «el rol insertado es EXACTAMENTE ROLE_EMPACADOR con su descripcion de SEED_ROLES» |
| R2 | `empacador-rol.test.ts` › `R2 — …` (barrido: solo `roles.ts`; sintético que dispara con las tres comillas; simétrico que no) |
| R3 | `empacador-rol.test.ts` › `R3 — … el modelo Role de db/schema.prisma no declara ninguna columna de empresa`; `tests/integration/identity/identity-seed.int.test.ts` › «la primera corrida sobre base vacia crea los tres roles y el administrador; la segunda no cambia nada» (una sola fila Empacador tras cada corrida); `tests/integration/identity/user-crud.int.test.ts` › `QC-144 R3 — …` › «dos usuarios de dos empresas distintas nacen con el MISMO rol Empacador, cada uno en su empresa» |
| R4 | `tests/unit/identity/permissions.test.ts` › `QC-144 R4: el catalogo contiene terminados.consultar con su modulo, accion y descripcion exactos` |
| R5 | `permissions.test.ts` › `QC-144 R5: el catalogo es el previo mas terminados.consultar, ningun otro codigo cambia` (+ recuentos a 16 en los unitarios y guardias de `design.md > 5`) |
| R6 | `permissions.test.ts` › `R6: la enmienda de terminados.consultar en el fuente no cita ficha ni requisito` (párrafo ≤5 líneas, contiene «enmienda» y `lib/modules/`; ni él ni la primera frase del JSDoc casan con el detector de citas) y `R6: el detector de citas caza un JSDoc sintetico que si nombra una ficha` (simétrico) |
| R7 | `tests/guards/guard-permisos-no-administrables.test.ts` › `ningun archivo de produccion escribe sobre roles, permissions ni role_permissions, salvo el adaptador del seed` (ahora también `Role` y SQL crudo, T16) + `packer-role-migration.test.ts` › `migration.sql — es EXACTAMENTE cuatro INSERT, uno por tabla (R7, R17)`. El hueco anotado en la tanda 1 (nadie vigilaba escrituras en `roles`) lo cierra R27 |
| R8 | `permissions.test.ts` › `QC-144 R8: el Empacador tiene exactamente asignaciones.consultar y terminados.consultar` y `QC-144 R8: el Empacador NO recibe inventario.consultar ni asignaciones.modificar`; `packer-role-migration.test.ts` › `(R8, R17)` |
| R9 | `permissions.test.ts` › `QC-144 R9: el Administrador incluye terminados.consultar y los dieciseis, uno a uno` |
| R10 | `permissions.test.ts` › `QC-144 R10: el Operador sigue con exactamente inventario.consultar y asignaciones.consultar, sin terminados.consultar` |
| R11 | `tests/guards/guard-autorizacion-por-permiso.test.ts` › `QC-144 R11: …` (literal dispara; `ROLE_EMPACADOR` dispara; literal en comentario no dispara) + ancla de patrones tensada |
| R12 | `tests/unit/asignaciones/empacador-authorization.test.ts` › `QC-144 R12 — …` (4 casos: `listAssignedOrders`, `getAssignedOrderExecution`, `startAssignedOrder`, `finishAssignedOrder`) |
| R13 | `empacador-authorization.test.ts` › `QC-144 R13 — …` (6 casos: `listProducts`, `getProduct`, `createProduct`, `assignResponsibles`, `unassignResponsible`, `removeWorkGroupFromOrder`, sin tocar puertos) |
| R14 | `tests/integration/asignaciones/assigned-orders.int.test.ts` › `asignaciones · listAssignedOrders con los permisos del Empacador (integracion, R14)` › «ve solo los pedidos de su empresa en los que es responsable: no los de otro responsable ni los de otra empresa» |
| R15 | `tests/unit/navegacion/menu-empacador.test.ts` › `R15 — el menu del Empacador deja visible solo Asignacion` (4 casos, incluido el simétrico con el Operador) |
| R16 | `empacador-rol.test.ts` › `R16 — …` (barrido: solo `permissions.ts`, el mensaje nombra QC-145; sintético y simétrico) |
| R17 | `tests/integration/identity/packer-role-migration.int.test.ts` › `R17: el UP sobre una base sembrada antes de QC-144 crea el rol, el permiso y las tres asignaciones exactas, y deja al Operador identico`; estáticos `(R7, R17)`, `(R1, R4, R17)`, `(R8, R17)` |
| R18 | `packer-role-migration.int.test.ts` › `R18: aplicar el UP una segunda vez sobre la base ya sembrada no duplica ni reescribe ninguna fila, updated_at incluido`; estático `migration.sql — se puede aplicar dos veces (R18)` |
| R19 | `identity-seed.int.test.ts` › «la primera corrida sobre base vacia crea los tres roles y el administrador; la segunda no cambia nada» y «si solo falta el rol Operador, la corrida crea unicamente ese y deja Administrador y Empacador intactos» |
| R20 | `packer-role-migration.test.ts` › `R20, R26: el UP no toca el esquema: ni ALTER, ni CREATE ni DROP, y cae si se cuela uno` |
| R21 | `packer-role-migration.int.test.ts` › `R21: el DOWN sin ningun usuario Empacador retira el permiso, sus asignaciones y el rol, sin tocar nada mas` y `R21: el DOWN con un usuario que tiene el rol Empacador falla con el SQLSTATE de una FK RESTRICT, y no borra nada`; estático `down.sql — cuatro DELETE, en el orden de design.md > 3.3 (R21)` |
| R22 | `tests/integration/identity/role-catalog.int.test.ts` › `R22 — el rol Empacador tambien esta, con su identificador` (+ el caso preexistente «el rol administrador NO se ofrece») |
| R23 | `user-crud.int.test.ts` › `QC-144 R23 — alta y edicion con el rol Empacador, por un actor con usuarios.modificar` (alta y edición aceptadas y persistidas; sin `usuarios.modificar`, rechazo en alta y en edición) |
| R24 | Verificación de revisión: `git diff --name-only origin/dev...HEAD` no contiene `e2e/` (comprobado) |
| R25 | `identity-seed.int.test.ts` › `R25 — cada rol de semilla tiene en role_permissions exactamente los permisos que declara SEED_ROLE_PERMISSIONS` |
| R26 | `tests/guards/guard-dependencias-aprobadas.test.ts` + `packer-role-migration.test.ts` › `R20, R26: …`; el diff no contiene `package.json` ni `db/schema.prisma` (comprobado) |
| R27 | `tests/guards/guard-permisos-no-administrables.test.ts` › `R27: dispara con un role-actions.ts sintetico que crea un rol` (incluye los ocho verbos sobre `tx.role`), `R27: dispara con SQL crudo de escritura sobre roles, permissions o role_permissions`, `R27: NO dispara con lecturas sobre role, ni con SQL de lectura sobre roles` (+ comentarios en `NO dispara con un comentario …`); anclas tensadas: la exención del seed exige escritura sobre `permission`, `rolePermission` **y** `role`. Prueba manual: `prisma.role.create(...)` y `DELETE FROM "roles"` en un archivo sintético de `app/` ponen roja la guardia nombrando el archivo (revertido) |

## Salida de los tests

Por tanda (subagentes, solo sus archivos):
- T1–T3: `tests/guards` + 8 unitarios: 49 files, 683 passed, 17 skipped.
- T4–T6: 4 files, 93 passed; `tests/guards`: 42 files, 532 passed, 5 skipped.
- T7–T10: 4 files, 37 passed.
- T11+T13 (integration): 3 files, 63 passed. T12+T14 (integration): 2 files, 11 passed.
- Limpieza: `packer-role-migration.test.ts` + `tests/guards`: 43 files, 545 passed, 5 skipped.
- Tanda 2 (T2, T3 reabiertas, T16): `tests/guards`: 42 files, 535 passed, 5 skipped; `tests/guards` + `tests/unit/{identity,asignaciones,documentos,navegacion}`: 225 files, 3253 passed, 65 skipped; integración de la rama (5 archivos): 74 passed. `typecheck` y `lint` limpios. Grep de cierre sobre las líneas `+` de comentario del diff `c802c645..HEAD -- lib db tests` con `QC-\d+|\bR\d+\b|design\.md|decisi[oó]n cerrada`: vacío (solo quedan dos strings de fixture sintético, que no son comentarios).

`./init.sh --rapido` tras T1–T3 (commit `0ef4662c`): rojo esperado. 7 casos de
`identity-seed.int.test.ts` (15/16 y 2/3, tanda T11 aún sin hacer) y 1 de
`tests/unit/configuracion-ui/user-table.test.tsx`, que pasa aislado (27/27): flake de carga.

`./init.sh --rapido` final (HEAD `b3943f33`): **verde, exit 0**.

```
✓ typecheck paso
✓ lint paso
 Test Files  352 passed (352)
      Tests  5213 passed | 25 skipped (5238)
 Test Files  48 passed (48)
      Tests  596 passed | 9 skipped (605)
✓ test:rapido paso
✓ todas las migraciones tienen down.sql
```

`./init.sh` **completo** (sin flags, cierre de la feature, HEAD `aaff8cf0`): **verde, exit 0** (646 s de vitest).

```
✓ typecheck paso
✓ lint paso
 Test Files  613 passed (613)
      Tests  8638 passed | 117 skipped (8755)
aviso: 6 archivo(s) del baseline ya pasan; toca limpiarlos:
  tests/integration/inventario/product-crud.int.test.ts
  tests/unit/configuracion-ui/configuracion-convenciones.test.ts
  tests/unit/configuracion-ui/unidades-convenciones.test.ts
  tests/unit/recetas-ui/recipe-route-contract.test.ts
  tests/unit/recetas/module-contract.test.ts
  tests/unit/unidades/modulo-intacto.test.ts
✓ los tres proyectos corrieron (ui, node, integration)
✓ tests: sin rojos nuevos (0 rojos, todos en el baseline de 6); 6 por limpiar
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
```

Cero rojos, ni propios ni ajenos. El aviso de «6 por limpiar» es deuda del baseline
(`tests/baseline-rojos.json`), ajena a la rama: ninguno de esos seis archivos está en el diff.
Sin E2E: la rama no toca `app/`, `components/` ni `e2e/`.
