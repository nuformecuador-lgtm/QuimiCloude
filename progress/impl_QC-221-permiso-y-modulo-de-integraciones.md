# QC-221 — permiso-y-modulo-de-integraciones · bitácora de implementación

Implementer: delega T1–T10 en `backend_dev` (no hay trabajo de frontend). Fecha: 2026-10-08.

## Catálogo previo (antes de T1, `origin/dev` 6c1a87b0, incluido en HEAD)

- `PERMISSIONS`: 25 códigos, en orden: dashboard.consultar, inventario.consultar,
  inventario.modificar, recetas.consultar, recetas.modificar, unidades.consultar,
  unidades.modificar, proveedores.consultar, proveedores.modificar, pedidos.consultar,
  pedidos.modificar, usuarios.consultar, usuarios.modificar, asignaciones.consultar,
  asignaciones.modificar, asignaciones.ejecutar, terminados.consultar, clientes.consultar,
  clientes.modificar, documentos.consultar, documentos.modificar, empaque.modificar,
  empresas.consultar, empresas.modificar, acondicionamiento.modificar.
- Administrador: 21 permisos (los 21 primeros, de dashboard.consultar a documentos.modificar).
- Última migración: `20261007120100_order_terminated_finished_index`.
- Base local: 25 permisos, 31 role_permissions, 5 roles.

Coincide con el spec. Tras la feature: 26 códigos, 22 en el Administrador.

## Archivos

**Producción, modificados**
- `lib/modules/identity/domain/permissions.ts` — entrada al final de `PERMISSIONS`, párrafo JSDoc, última entrada del Administrador.
- `lib/shared/routes.ts` — 3 constantes tras `CUSTOMERS_ROUTE`, comentario de 2 líneas (aditivo; choque previsto con QC-167).

**Producción, nuevos**
- `lib/modules/integraciones/index.ts` (`export {};`)
- `lib/modules/integraciones/{domain,ports,adapters/driven,adapters/driving}/.gitkeep`
- `db/migrations/20261008120843_integrations_permission/migration.sql`
- `db/migrations/20261008120843_integrations_permission/down.sql`

**Tests nuevos**
- `tests/unit/integraciones/module-shape.test.ts`
- `tests/unit/integraciones/integration-routes.test.ts`
- `tests/unit/identity/schema/integrations-permission-migration.test.ts`
- `tests/integration/identity/integrations-permission-migration.int.test.ts`

**Tests modificados (lista de tasks.md)**
- `tests/unit/identity/permissions.test.ts` (aditivo; choque previsto con QC-167)
- `tests/unit/navegacion/qc75-convenciones.test.ts`
- `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`
- `tests/integration/identity/identity-seed.int.test.ts`
- `tests/integration/identity/session-user.int.test.ts`

**Tests modificados fuera de la lista de tasks.md** (se pusieron rojos; se nombra la entrada nueva, nada se relaja, `design.md > 6`):
- `tests/unit/recetas-ui/recipe-route-contract.test.ts` — su lista cerrada de exports de `routes.ts` suma las 3 constantes.
- `tests/guards/guard-identificador-de-request.test.ts` — `MIGRACIONES_ESPERADAS` suma la migración nueva (como QC-216).
- `tests/integration/aislamiento.json` — declara el `.int` nuevo como `transaccion` (lo exige `guard-aislamiento-integracion`).

**No se tocan:** `e2e/`, `app/`, `components/`, `hooks/`, `lib/shared/navigation/`, `middleware.ts`,
`route-guard-middleware.ts`, `lib/composition/`, `package.json`, `pnpm-lock.yaml`, `db/schema.prisma`.

## Nota sobre la migración

`pnpm run db:migrate:create` no se pudo usar: Prisma detectó drift en la base local compartida
(migraciones de otras ramas) y pidió `reset`; abortó sin tocar nada. Siguiendo `progress/deudas.md`
D3, la carpeta se creó a mano con timestamp posterior a todas las de dev y otros worktrees, y se
aplicó con `migrate deploy`. Prisma no generó DDL.

Ciclo sobre la base local:

| Paso | Resultado |
|---|---|
| Antes | 25 permisos / 31 role_permissions, migración no registrada |
| `db:migrate` | 26 / 32; el permiso asignado solo al Administrador |
| `db:rollback` | 25 / 31, mismo hash de role_permissions que antes, fila de `_prisma_migrations` borrada |
| `db:migrate` | 26 / 32 |
| `db:seed` ×2 | «nada que crear» ambas veces; estado idéntico, `updated_at` incluido |

La migración queda **aplicada** en la base local.

## Mapa R<n> -> test

| R | Test |
|---|---|
| R1 | `tests/unit/identity/permissions.test.ts` › «R1: el catalogo contiene integraciones.modificar…» |
| R2 | ídem › «R2: el catalogo es el previo… mas integraciones.modificar al final» |
| R3 | ídem › «R3: el JSDoc del catalogo tiene el parrafo…» y «R3: el caso simetrico: el detector rechaza un parrafo sintetico…» |
| R4 | `tests/unit/identity/schema/integrations-permission-migration.test.ts` › «R4: ninguna otra migracion nombra integraciones.modificar», «R4: ningun archivo de produccion escribe permisos salvo el adaptador del seed…»; además `guard-permisos-no-administrables` |
| R5 | `permissions.test.ts` › «R5: el Administrador recibe integraciones.modificar como ultima entrada…» |
| R6 | ídem › «R6: Operador, Empacador, Maestro y Administrador de acondicionamiento conservan exactamente…» |
| R7 | `tests/integration/identity/session-user.int.test.ts` › «R7: la sesion de un Administrador incluye…», «R7: la sesion de un Operador, un Empacador o un Administrador de acondicionamiento no incluye…» |
| R8 | `tests/unit/integraciones/module-shape.test.ts` › «R8: ningun archivo de codigo del modulo nombra un rol…», «R8: el detector dispara con un fuente sintetico…» |
| R9 | ídem › «R9: el codigo del permiso solo aparece en el catalogo y en db/migrations/» (anticegado), «R9: la regla rechaza un archivo de produccion ajeno…» |
| R10 | ídem › «R10: la raiz tiene index.ts…» |
| R11 | ídem › «R11: el contrato no exporta ningun simbolo…», «R11: domain/, ports/ y adapters/ no contienen…», «R11: el detector caza un domain/x.ts sintetico…» |
| R12 | ídem › «R12: ningun archivo fuera del modulo lo importa…», «R12: el detector reconoce un import…», «R12: lib/composition no nombra el modulo» |
| R13 | ídem › «R13: db/schema.prisma no tiene ningun modelo de integraciones» |
| R14 | `tests/unit/integraciones/integration-routes.test.ts` › cinco casos «R14: …» (valores exactos, solo 3 constantes bajo /integraciones, literal único, el barrido ignora comentarios, `/integraciones/inventarios` no cae bajo `/inventario`) |
| R15 | ídem › «R15: ninguna de las tres URL ni /integraciones esta en PRIVATE_ROUTE_PREFIXES», «R15: ningun enlace del menu privado…», «R15: no existe ningun page.tsx…» |
| R16 | estático: `integrations-permission-migration.test.ts` › «R16: el UP son dos INSERT…», «R16: la fila insertada es exactamente la entrada de PERMISSIONS…», «R16: la asignacion va solo al Administrador…»; integración: `tests/integration/identity/integrations-permission-migration.int.test.ts` › «R16: sobre una base sembrada sin el permiso…» |
| R17 | estático: «R17: los dos INSERT llevan ON CONFLICT…»; integración: «R17: aplicar el UP dos veces…», «R17: sobre una base que ya tiene el permiso…» |
| R18 | `tests/integration/identity/identity-seed.int.test.ts` › «QC-221 R18 — sobre la base ya sembrada salvo integraciones.modificar…», «QC-221 R21, R18 — sobre base vacia…» |
| R19 | estático › «R19: el UP no toca el esquema ni escribe en roles…» |
| R20 | estático › «R20: borra primero las asignaciones…», «R20: cada DELETE va acotado…», «R20: no lleva CASCADE…»; integración › «R20: el DOWN, leido del archivo, deja la base exactamente como antes del UP» |
| R21 | `identity-seed.int.test.ts` › «QC-221 R21, R18 — sobre base vacia, integraciones.modificar lo tiene solo el Administrador, cada rol tiene exactamente lo declarado…» |
| R22 | revisión + guardia: el diff no toca `e2e/` |
| R23 | revisión + guardia: `guard-dependencias-aprobadas` en verde; el diff no toca `package.json` ni las rutas prohibidas |

## Pruebas de sensibilidad

- T5: quitar el `ON CONFLICT` de `role_permissions` → rojo R17; invertir el orden del `down.sql` → rojo R20 (orden); quitar el `WHERE` del primer `DELETE` → rojos los dos R20 (orden y acotado). Restaurado: 25/25 verde.
- T6: un `domain/x.ts` sintético → rojo R11 («no contienen .ts»). Borrado: 31/31 verde.

## Salida de los comandos (reportada por backend_dev)

Preparación del worktree: copia de `.env` (ignorado), `pnpm install --frozen-lockfile`, `prisma generate`, `next typegen`.

- `pnpm run typecheck`: OK.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)` — preexistentes, en archivos no tocados.
- 7 archivos unitarios nuevos/tocados: `Test Files 7 passed (7) · Tests 227 passed | 3 skipped (230)`.
- 3 `.int` nuevos/tocados: `Test Files 3 passed (3) · Tests 49 passed (49)` (base efímera `qct_qc221_…`, borrada al terminar).
- `pnpm exec vitest run guard`: `Test Files 55 passed (55) · Tests 742 passed | 11 skipped (753)`.
- `pnpm exec vitest related --run <13 archivos>`: `Test Files 4 failed | 647 passed (651) · Tests 4 failed | 10090 passed | 65 skipped`.
  Los 4 rojos fallan igual sobre `git archive HEAD` sin los cambios (`Tests 4 failed | 62 passed (66)`):
  - `tests/unit/recetas/scope.test.ts`, `tests/unit/recetas/module-contract.test.ts`,
    `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` — están en `tests/baseline-rojos.json` (comprobado).
  - `tests/integration/proveedores/catalog-line.int.test.ts` — problema de Postgres 18 documentado en `docs/verification.md`.

## Pendiente

- T11: `./init.sh` lo corre el leader (gate). El mapa R1–R23 ya está completo arriba.
- T11 marcada `[x]` (arreglo del review, hallazgo 1): gate local rojo solo por 4 tests ajenos (3 de baseline no excluidos en Windows + `catalog-line.int.test.ts`, rojo también en `dev`); ver `progress/features/QC-221.md > Tandas`.
- Choque conocido con QC-167 (PR #171) en `lib/shared/routes.ts` y `tests/unit/identity/permissions.test.ts`: cambios aditivos; la que mergee después reubica.
