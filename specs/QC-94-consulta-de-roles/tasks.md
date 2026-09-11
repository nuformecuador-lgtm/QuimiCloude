# QC-94 — consulta-de-roles · tasks.md

> Zona: `backend` · Complejidad: `low` · depends_on: — · Rama: `feature/QC-94-consulta-de-roles`
>
> El **qué** está en `requirements.md` (R1–R21), el **cómo** en `design.md`. Aquí va el desglose.
> `[P]` = paralelizable con las tareas marcadas igual dentro del mismo bloque.
> Cada task se cierra con `./init.sh --rapido` en verde salvo que diga otra cosa; la feature se cierra
> con `./init.sh` completo (regla 5 de `CLAUDE.md`).

## Archivos que esta feature declara tocar (para la validación de conflicto del leader)

**Producción, nuevos:** `lib/modules/identity/domain/role-view.ts`,
`lib/modules/identity/domain/list-roles.ts`,
`lib/modules/identity/ports/role-catalog-repository.ts`,
`lib/modules/identity/adapters/driven/persistence/role-catalog-prisma.ts`,
`lib/modules/identity/adapters/driving/role-actions.ts`.

**Producción, modificados (solo añadidos, sin reordenar ni reformatear):**
`lib/modules/identity/domain/require-permission.ts`, `lib/modules/identity/domain/actor.ts`,
`lib/modules/identity/index.ts`, `lib/composition/index.ts`.

**NO se tocan:** `db/schema.prisma`, `db/migrations/`, `package.json`, `app/`, `components/`,
`middleware.ts`, `e2e/`, `lib/shared/**`, `lib/modules/<otro>/**`, y **ningún test ajeno**
(`design.md > 9.3`).

---

## T1 — Los dos permisos alternativos, con una sola implementación de la pertenencia

- [x] **T1.** Añadir `assertAnyPermission` a `lib/modules/identity/domain/require-permission.ts` y
      `requireAnyPermission` a `lib/modules/identity/domain/actor.ts` (`design.md > 3.1`), extrayendo
      el cuerpo de la pertenencia a un `holdsPermission` **privado** del primer archivo. El parámetro
      de códigos es una **tupla no vacía** (`readonly [PermissionCode, ...PermissionCode[]]`).
      Reexportar `requireAnyPermission` desde `lib/modules/identity/index.ts`.
      **Hecho cuando:** `tests/unit/identity/require-permission.test.ts` sigue verde **sin ni una
      línea modificada**, y `tests/unit/identity/require-any-permission.test.ts` (T2) cubre los casos
      nuevos. Depende de: —.

- [x] **T2. [P]** `tests/unit/identity/require-any-permission.test.ts`: pertenencia exacta, sin
      normalización y sin coincidencia parcial; falla cerrado con actor ausente, sin conjunto,
      conjunto vacío y conjunto que no es una lista; basta uno de los dos códigos.
      **Hecho cuando:** los casos pasan y **la lista vacía de códigos no compila** (comprobado con un
      `@ts-expect-error` en el propio test). Depende de: T1.

## T3–T5 — El caso de uso y su puerto

- [x] **T3.** `domain/role-view.ts` con `RoleOption = { id, name }` y
      `ports/role-catalog-repository.ts` con `listAll(): Promise<readonly RoleOption[]>`, **sin
      parámetros y sin ningún método de escritura** (`design.md > 4.1`, `> 4.2`).
      **Hecho cuando:** `pnpm run typecheck` pasa y el puerto no expone ninguna escritura (R17).
      Depende de: —.

- [x] **T4.** `domain/list-roles.ts` con `createListRoles(deps)`: `requireAnyPermission` como
      **primera línea**, después `deps.roles.listAll()`, sin ordenar, sin recortar y **sin usar
      `actor.companyId`** (`design.md > 3.2`).
      **Hecho cuando:** el caso de uso cabe en una pantalla y no contiene ningún `if` sobre datos del
      catálogo. Depende de: T1, T3.

- [x] **T5. [P]** `tests/unit/identity/roles/list-roles-authorization.test.ts` y
      `tests/unit/identity/roles/list-roles.test.ts` (`design.md > 9.1`).
      **Hecho cuando:** el doble del puerto **lanza si lo llaman** y los casos de rechazo afirman
      `not.toHaveBeenCalled()`; los dos casos de aceptación (solo `consultar`, solo `modificar`)
      pasan; el caso de las dos empresas pasa; el caso de las claves exactas pasa.
      Depende de: T4.

## T6–T7 — Persistencia

- [x] **T6.** `adapters/driven/persistence/role-catalog-prisma.ts` con `listAllRoles()`:
      `select` **enumerado** (`id`, `name`) y `orderBy: { name: 'asc' }` (`design.md > 4.3`).
      **Hecho cuando:** es el único archivo de la feature que importa `@prisma/client`, y
      `guard-arquitectura-modulos.test.ts` sigue verde. Depende de: T3.

- [x] **T7. [P]** `tests/integration/identity/role-catalog.int.test.ts` (`design.md > 9.2`).
      **Hecho cuando:** afirma que los roles del seed **están**, que cada elemento tiene exactamente
      dos claves y que la secuencia completa está ordenada — **sin** afirmar igualdad exacta contra
      «los dos del seed», por los roles efímeros de `e2e/login.spec.ts`. Depende de: T6.

## T8–T10 — Frontera

- [x] **T8.** Cablear en `lib/composition/index.ts`: `roleCatalogRepository` y
      `listRoles: createListRoles({ roles: roleCatalogRepository })`, **al final del bloque de
      `identity` y sin reordenar nada de lo que hay** (`design.md > 5`).
      **Hecho cuando:** `tests/unit/composition/identity-facade.test.ts` sigue verde con la clave
      nueva presente. Depende de: T4, T6.

- [x] **T9.** `adapters/driving/role-actions.ts` con `'use server'` y `listRolesAction()`: sin
      argumentos, actor de las dos caras de la sesión, traducción con
      `createErrorStateTranslator(IdentityError)` (`design.md > 6`).
      **Hecho cuando:** el archivo no tiene ningún `console.*`, ningún `revalidatePath` y **no** se
      reexporta desde `index.ts`. Depende de: T8.

- [x] **T10.** Reexportar desde `lib/modules/identity/index.ts` **solo de `./domain`**: `RoleOption`,
      `createListRoles`, `ListRolesDeps` (y `requireAnyPermission`, ya en T1). En un bloque nuevo al
      final, sin tocar las líneas de arriba.
      **Hecho cuando:** el bloque del contrato de `guard-arquitectura-modulos.test.ts` sigue verde
      (nada de `'use server'` en el cierre transitivo). Depende de: T9.

- [x] **T11. [P]** `tests/unit/identity/roles/role-actions.test.ts` (`design.md > 9.1`).
      **Hecho cuando:** los tres casos —forma de entrada, actor de las dos caras, traducción por
      `code`— pasan. Depende de: T9.

## T12 — Alcance, verificación y cierre

- [x] **T12. [P]** `tests/unit/identity/roles/scope.test.ts`: R15, R17, R19, R20, R21
      (`design.md > 9.1`).
      **Hecho cuando:** falla si alguien añade una migración, toca `db/schema.prisma`, mete una
      dependencia, añade un permiso o reexporta la action. Depende de: T10.

- [x] **T13.** Escribir `progress/impl_QC-94-consulta-de-roles.md` con el mapa `R<n> -> test`
      **real** (no el previsto de abajo) y las diferencias con `design.md`, si las hubo
      (`CHECKPOINTS.md > Trazabilidad`).
      **Hecho cuando:** los 21 requisitos aparecen con su test y su archivo. Depende de: T12.

- [ ] **T14.** `./init.sh` **completo** en verde y entrada en `progress/history.md`.
      **Hecho cuando:** typecheck, lint, unit, integración y **todas** las guardias pasan, y la salida
      queda anotada. Depende de: T13.

---

## Trazabilidad prevista (`R<n> -> test`)

El mapa definitivo lo escribe el implementer en `progress/impl_QC-94-consulta-de-roles.md`. Este es el
previsto, y ningún requisito queda sin test.

| R | Test |
| --- | --- |
| R1 | `unit/identity/roles/list-roles-authorization.test.ts` — «exige el permiso antes de tocar el puerto» |
| R2 | `unit/identity/roles/list-roles-authorization.test.ts` — actor ausente / conjunto vacío / no-lista / permiso ajeno, con `not.toHaveBeenCalled()`; y `unit/identity/require-any-permission.test.ts` |
| R3 | `unit/identity/roles/list-roles-authorization.test.ts` — «basta `usuarios.consultar`» y «basta `usuarios.modificar`» |
| R4 | `unit/identity/roles/list-roles-authorization.test.ts` — ningún caso pasa rol; `unit/identity/roles/scope.test.ts` (sin literal de nombre de rol en los archivos nuevos) |
| R5 | `unit/identity/roles/list-roles.test.ts` — el actor entra por parámetro; el dominio no lee sesión |
| R6 | `unit/identity/roles/role-actions.test.ts` — actor de las dos caras, `null` si falta cualquiera |
| R7 | `unit/identity/roles/scope.test.ts` — ninguna migración ni policy nueva; guardia `guard-rls-force.test.ts` (ya existe) |
| R8 | `unit/identity/roles/list-roles.test.ts` + `integration/identity/role-catalog.int.test.ts` |
| R9 | `unit/identity/roles/list-roles.test.ts` (claves exactas) + `integration/identity/role-catalog.int.test.ts` |
| R10 | `integration/identity/role-catalog.int.test.ts` — secuencia ordenada por nombre |
| R11 | `unit/identity/roles/list-roles.test.ts` — dos actores de empresas distintas, mismo resultado; el puerto se llama sin argumentos |
| R12 | `unit/identity/roles/list-roles.test.ts` — la firma no admite consulta; `unit/identity/roles/scope.test.ts` (sin `ListQuery`/`Page`/`ROLE_QUERYABLE` en los archivos nuevos) |
| R13 | `unit/identity/roles/role-actions.test.ts` — sin `FormData`, sin route handler |
| R14 | `unit/identity/roles/role-actions.test.ts` — `unauthorized` por `code`, cualquier otro a `unexpected` |
| R15 | `unit/identity/roles/scope.test.ts` + guardia `guard-arquitectura-modulos.test.ts` (bloque del contrato) |
| R16 | guardia `guard-arquitectura-modulos.test.ts` + `unit/composition/identity-facade.test.ts` |
| R17 | `unit/identity/roles/scope.test.ts` — ninguna escritura sobre `role`/`role_permissions` |
| R18 | `unit/identity/roles/scope.test.ts` — nada bajo `app/`, `components/`, `e2e/` |
| R19 | `unit/identity/roles/scope.test.ts` — cero diff en `db/schema.prisma`, ninguna migración nueva |
| R20 | `unit/identity/roles/scope.test.ts` + guardia `guard-dependencias-aprobadas.test.ts` |
| R21 | `unit/identity/roles/scope.test.ts` — `PERMISSIONS` sigue con trece entradas |
