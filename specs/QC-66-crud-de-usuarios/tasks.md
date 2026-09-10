# QC-66 — crud-de-usuarios · tasks.md

> Zona: `backend` · Complejidad: `medium` · depends_on: `QC-65` ·
> Rama: `feature/QC-66-crud-de-usuarios`
>
> Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task indica sus
> dependencias, sus **archivos esperados** y su **criterio de hecho** (verificable, no «parece
> bien»). Un commit por task, formato `docs/conventions.md > Commits`.
>
> **Recordatorio de gate** (`docs/verification.md`, regla 5 de `CLAUDE.md`): el `backend_dev` corre
> **solo** `pnpm run typecheck`, `pnpm run lint` y `pnpm exec vitest related --run <sus archivos>`.
> **No corre la suite completa.** `./init.sh --rapido` lo corre el **leader** al cerrar cada tanda;
> `./init.sh` **completo**, al cerrar la feature y **antes del PR, sin excepción**.

## Declaración de archivos compartidos (para la validación de conflicto del leader)

| Archivo sensible | ¿Lo toca esta feature? |
| --- | --- |
| `db/schema.prisma` | **NO.** Esta ficha no añade ninguna columna, tabla, índice ni tipo (R43). |
| `db/migrations/` | **SÍ.** Una carpeta nueva: `<ts>_user_permissions_catalog/` (`migration.sql` + `down.sql`). Ninguna migración existente se edita. |
| `lib/composition/index.ts` | **SÍ.** Bloque nuevo al final de la fachada `identity`; sin reordenar ni reformatear nada de lo que hay. |
| `lib/modules/identity/index.ts` | **SÍ.** Gana tipos, esquemas, errores y las seis factories, solo de `./domain`. |
| `app/`, `components/`, `middleware.ts`, `e2e/`, `lib/shared/**`, otros módulos | **NO** (R46). |

**Solape con QC-78 (`in_progress`, misma zona).** Cero archivos de **producción** en común: QC-78
declara sus 8 archivos y declara no tocar `db/schema.prisma`, `db/migrations/`, `lib/composition/` ni
`lib/modules/identity/index.ts`. Único solape: **`tests/unit/composition/identity-facade.test.ts`**
(QC-78 «solo fixtures»; aquí se le suman las seis claves nuevas). El leader decide el orden.

---

## Bloque 0 — Lo que se hereda montado

### [x] T0 — Verificar la base heredada (BLOQUEA TODO). No se re-crea nada de esto
- **Depende de**: que QC-65 esté `done` y su base esté en `dev`; worktree montado en F2.0.
- **Qué**: abrir en la rama y comprobar, uno por uno, que **ya existen** (y anotar la evidencia):
  1. `db/schema.prisma` → `model User` con `roleId`, `companyId`, `deletedAt`,
     `mustChangeCredential`, `accountStatus`, `accountStatusChangedAt`, `accountStatusChangedBy`, y
     el `enum UserAccountStatus` con los cuatro valores. **Nada de esto se crea ni se modifica.**
  2. `db/migrations/20260904180600_companies_and_user_company/migration.sql` → los tres índices
     únicos **por empresa** (`users_email_unique`, `users_username_unique`, `users_document_unique`),
     parciales `WHERE deleted_at IS NULL`. **No se tocan** (R38).
  3. `lib/modules/identity/domain/permissions.ts` → `PERMISSIONS` con **once** entradas y
     `SEED_ROLE_PERMISSIONS`; `roles.ts` → `ROLE_ADMINISTRADOR`; `require-permission.ts` →
     `assertPermission`; `account-status.ts` → `USER_ACCOUNT_STATUSES`; `credential-policy.ts` →
     `evaluateCredentialRules` y `createCredentialPolicy`; `credentials.ts` →
     `CREDENTIAL_MAX_LENGTH`; `display-name.ts` → `buildDisplayName`.
  4. `lib/modules/identity/domain/seed-initial-access.ts` → el seed **idempotente** que deriva de
     `PERMISSIONS` y de `SEED_ROLE_PERMISSIONS`. **Su algoritmo no se modifica** (§ 3.4).
  5. `lib/composition/index.ts` → `passwordHasher`, `checkCredentialPolicy`, `identity.getSessionUser`
     y `identity.getSessionContext` **ya cableados**. Se **reutilizan**, no se construyen de nuevo.
  6. `lib/shared/pagination.ts` → `DEFAULT_PAGE_SIZE = 10`, `MAX_PAGE_SIZE = 25`, `toOffsetLimit`,
     `buildPage`. Se consume tal cual.
  7. `lib/modules/<m>/domain/list-query.ts` en los **cinco** módulos con listado, y
     `tests/guards/guard-contrato-listados.test.ts` comparándolos.
  8. Que **no existe** ningún `lib/modules/identity/domain/errors.ts` (la jerarquía de errores nace
     en T3) ni ningún `actor.ts` en `identity`.
- **Si falta cualquiera de los ocho: PARAR y avisar al leader.** No se «arregla» escribiéndolo aquí:
  eso duplicaría trabajo de QC-47, QC-65, QC-74, QC-57 o QC-19 y garantizaría conflicto de merge.
- **Archivos**: ninguno (solo lectura) + `progress/impl_QC-66-crud-de-usuarios.md` (bitácora).
- **Hecho cuando**: los ocho puntos están verificados y anotados con su evidencia en
  `progress/impl_QC-66-crud-de-usuarios.md`.

---

## Bloque 1 — El catálogo de permisos y su ripple (una sola tanda)

### [x] T1 — El catálogo pasa de once a trece
- **Depende de**: T0.
- **Qué**: dos entradas nuevas en `PERMISSIONS` (`usuarios.consultar`, `usuarios.modificar`) y los
  dos códigos en `SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]`, **escritos uno a uno**; el `Operador`
  no recibe ninguno. Actualizar la cabecera del archivo: «once» → «trece» y **escribir la segunda
  enmienda a QC-74** (R1 esta vez, no R2) con esas palabras y su motivo.
- **Archivos**: `lib/modules/identity/domain/permissions.ts`.
- **Cubre**: R8, R9, R12.
- **Hecho cuando**: `typecheck` y `lint` pasan y `PERMISSIONS.length === 13`.

### [x] T2 — Actualizar los SEIS archivos de test ajenos, en la MISMA tanda que T1
- **Depende de**: T1. **No se aplaza al final** (decisión cerrada 1, `design.md > 2`).
- **Qué**: conteo, texto y pertenencia a lista en los seis de `design.md > 2`. En
  `permissions.test.ts`, además, **sumar `'usuarios'` a `MODULOS` y a `MODULOS_CON_ESCRITURA`** (sin
  eso el caso de R1 falla) y **añadir** los dos casos explícitos del `Administrador` con los dos
  códigos y del `Operador` sin ninguno. **Ninguna expectativa se elimina ni se debilita.**
- **Archivos**: `tests/guards/guard-permisos-sembrados.test.ts`,
  `tests/guards/guard-nav-permisos-declarados.test.ts`,
  `tests/unit/navegacion/qc75-convenciones.test.ts`, `tests/unit/identity/permissions.test.ts`,
  `tests/unit/identity/seed/seed-initial-access.test.ts`,
  `tests/integration/identity/identity-seed.int.test.ts`.
- **Cubre**: R48 (y las anclas de R8, R9).
- **Hecho cuando**: los seis pasan; `pnpm exec vitest related --run lib/modules/identity/domain/permissions.ts`
  no deja ningún **séptimo** archivo rojo (si aparece, se anota y se arregla aquí, no luego); y el
  diff demuestra que no se borró ningún `expect` ni se degradó ningún `toEqual`.

### [x] T3 — [P] La jerarquía de errores de `identity`
- **Depende de**: T0.
- **Qué**: `IdentityError` base y las nueve subclases con su `code` estable (`design.md > 6.4`).
- **Archivos**: `lib/modules/identity/domain/errors.ts` (nuevo),
  `tests/unit/identity/usuarios/errors.test.ts`.
- **Cubre**: R41 (la mitad del dominio).
- **Hecho cuando**: cada clase expone su `code` exacto y el test lo afirma por clase, no por texto.

### [x] T4 — La migración de datos del catálogo, con su `down.sql`
- **Depende de**: T1.
- **Qué**: el UP idempotente (`ON CONFLICT DO NOTHING` en las dos tablas, el rol resuelto por
  **nombre** con subselect) y el DOWN que borra **primero** las asignaciones y **después** las dos
  entradas (`design.md > 3.2`, `> 3.3`). Se crea con `pnpm run db:migrate:create` y el `down.sql` se
  escribe **a mano**. **Cero `ALTER`, `CREATE` y `DROP`.**
- **Archivos**: `db/migrations/<ts>_user_permissions_catalog/migration.sql`,
  `db/migrations/<ts>_user_permissions_catalog/down.sql`.
- **Cubre**: R11, R43, R44.
- **Hecho cuando**: `pnpm run db:migrate` aplica sin error, aplicarla dos veces no falla, y el UP no
  contiene ninguna sentencia de esquema.

### [x] T5 — [P] El test estático de la migración
- **Depende de**: T4.
- **Qué**: compara el SQL contra `PERMISSIONS` y `ROLE_ADMINISTRADOR` **importados** (nunca literales
  copiados), afirma la ausencia de `ALTER`/`CREATE`/`DROP` y el orden del `down.sql`. Con tests de
  **sensibilidad**: quitar el `ON CONFLICT`, invertir el orden del DOWN.
- **Archivos**: `tests/unit/identity/schema/user-permissions-migration.test.ts` (nuevo).
- **Cubre**: R8, R11, R43, R44.
- **Hecho cuando**: pasa, y cada caso de sensibilidad se pone rojo al alterar a mano su fragmento.

---

## Bloque 2 — Dominio: contrato, actor y entrada

### T6 — [P] `Actor` y `requirePermission` del módulo
- **Depende de**: T3.
- **Qué**: `Actor { id, companyId, permissions }` y `requirePermission` delegando en
  `assertPermission`, importado por **ruta relativa del propio dominio** (`design.md > 5.1`).
- **Archivos**: `lib/modules/identity/domain/actor.ts` (nuevo).
- **Cubre**: R2, R3, R5.
- **Hecho cuando**: `typecheck` pasa y ningún import del archivo sale del propio `domain/`.

### T7 — El contrato de lista, sexta copia, y la guardia de los «cinco módulos»
- **Depende de**: T0.
- **Qué**: copiar **verbatim** `list-query.ts` y `page.ts` a `identity/domain/` (solo cambia el
  nombre del módulo en los comentarios), escribir `user-queryable.ts` con la lista blanca de
  `design.md > 8.1`, y **añadir `identity` a `tests/guards/guard-contrato-listados.test.ts`**
  (`MODULOS`, anclas y el texto «cinco» → «seis»).
- **Archivos**: `lib/modules/identity/domain/list-query.ts`, `…/page.ts`, `…/user-queryable.ts`
  (nuevos), `tests/guards/guard-contrato-listados.test.ts`.
- **Cubre**: R36 (y la forma de R27–R30).
- **Hecho cuando**: la guardia pasa con seis módulos, incluidos sus bloques de equivalencia de
  comportamiento **y** de texto.

### T8 — [P] Los esquemas de entrada y los tipos de salida
- **Depende de**: T3, T7.
- **Qué**: `createUserSchema`, `updateUserSchema`, `setAccountStatusSchema` (`strictObject`, sin
  empresa, sin contraseña, sin estado en el alta, sin contadores) y `UserRow` / `UserDetail` con sus
  claves **exactas**.
- **Archivos**: `lib/modules/identity/domain/user-input.ts`, `…/user-view.ts` (nuevos),
  `tests/unit/identity/usuarios/user-input.test.ts`.
- **Cubre**: R14, R18, R20, R31, R32.
- **Hecho cuando**: el test demuestra que mandar `companyId`, un campo de contraseña, `accountStatus`
  o `failedLoginAttempts` **falla** el `parse`.

---

## Bloque 3 — Dominio: los seis casos de uso

### T9 — El puerto de datos y el puerto de credencial
- **Depende de**: T6, T8.
- **Qué**: `UserAdminRepository` (con `…AliveInCompany`, `excludeUserId` obligatorio, resultados
  discriminados y `applyGuardedChange`) y `InitialCredentialFactory` que devuelve **solo el hash**.
- **Archivos**: `lib/modules/identity/ports/user-admin-repository.ts`,
  `lib/modules/identity/ports/initial-credential-factory.ts` (nuevos).
- **Cubre**: R15, R16, R17, R33, R34, R35 (la parte del puerto).
- **Hecho cuando**: `typecheck` pasa y ningún método del puerto permite omitir la empresa, el hash o
  el usuario a excluir.

### T10 — Los seis casos de uso, con la autorización en la primera línea
- **Depende de**: T9.
- **Qué**: `create-user`, `get-user`, `list-users`, `update-user`, `delete-user`,
  `set-user-account-status`, cada uno factory `createXxx(deps)`, con `requirePermission` **antes** de
  `zod` y antes de cualquier puerto, las dos guardas de R21/R22 en el service, y la traducción de los
  resultados discriminados a los errores de T3.
- **Archivos**: `lib/modules/identity/domain/create-user.ts`, `…/get-user.ts`, `…/list-users.ts`,
  `…/update-user.ts`, `…/delete-user.ts`, `…/set-user-account-status.ts` (nuevos).
- **Cubre**: R1, R2, R3, R4, R5, R13, R19, R21, R22, R25, R26, R34, R35, R37, R39, **R49** (el alta no
  pasa autor del cambio de estado; solo mover el estado lo escribe).
- **Hecho cuando**: pasan los tres tests de T11 y `typecheck`/`lint` están verdes.

### T11 — [P] Los tests de dominio: autorización, servicio y guardas
- **Depende de**: T10.
- **Qué**: tres archivos. El de autorización usa **dobles que lanzan si los llaman**, para demostrar
  que no se llega al repositorio; el de guardas cubre las tres operaciones sobre uno mismo y el
  último administrador; el de servicio, los caminos felices y los de «no encontrado».
- **Archivos**: `tests/unit/identity/usuarios/authorization.test.ts`,
  `…/user-service.test.ts`, `…/admin-guards.test.ts` (nuevos).
- **Cubre**: R1–R5, R13, R14, R17–R22, R24–R26, R33–R35, R37, R39.
- **Hecho cuando**: los tres pasan y el de autorización afirma `not.toHaveBeenCalled()` sobre cada
  método del puerto en los seis casos.

---

## Bloque 4 — Adaptadores

### T12 — La fábrica de credencial inicial: `node:crypto` + política de QC-19
- **Depende de**: T9.
- **Qué**: `randomInt`, 24 caracteres con al menos uno de cada alfabeto, mezcla Fisher–Yates,
  verificación contra la **política completa** (reglas propias + lista de filtradas) con reintento
  acotado, hash con el `PasswordHasher`, y **devolver solo el hash**. Ningún `console.*`, ninguna
  credencial en ningún error.
- **Archivos**: `lib/modules/identity/adapters/driven/security/initial-credential-factory-crypto.ts`
  (nuevo), `tests/unit/identity/usuarios/credential-factory.test.ts` (nuevo).
- **Cubre**: R15, R16, R47.
- **Hecho cuando**: 1.000 credenciales generadas cumplen `evaluateCredentialRules`, el test demuestra
  que el valor devuelto es un hash bcrypt y no la candidata, y
  `tests/guards/guard-password-never-plaintext.test.ts` sigue verde.

### T13 — El adaptador Prisma, con la transacción de la guarda
- **Depende de**: T9.
- **Qué**: implementación de los cinco métodos; `select` con **columnas enumeradas** (nunca un
  `findMany` sin `select`); `toOffsetLimit`/`buildPage` de `lib/shared/pagination`; orden
  `last_names, first_names, id` con desempate estable; búsqueda sobre los tres campos; filtro
  `select` de estado; traducción de `P2002` **por columna** y de `P2003` a `role_not_found`; y
  `applyGuardedChange` como `$transaction` con `SELECT … FOR UPDATE` sobre los administradores
  activos de la empresa (`design.md > 9.2`).
- **Archivos**: `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts` (nuevo).
- **Cubre**: R17, R22, R23, R27–R31, R33, R34, R37, R38.
- **Hecho cuando**: pasan los dos tests de integración de T16 y T17.

### T14 — Las seis Server Actions
- **Depende de**: T10, T15.
- **Qué**: `'use server'`; `FormData` en las cuatro mutaciones, argumentos tipados en las dos
  consultas; actor de las **dos caras** de la sesión vía `@/lib/composition`; traducción del error por
  su `code`, nunca por el texto; ninguna decisión de negocio; sin `revalidatePath`.
- **Archivos**: `lib/modules/identity/adapters/driving/user-actions.ts` (nuevo),
  `tests/unit/identity/usuarios/user-actions.test.ts` (nuevo).
- **Cubre**: R6, R40, R41, R16 (el estado serializado no lleva credencial).
- **Hecho cuando**: el test cubre los seis caminos y demuestra que sin una de las dos caras de la
  sesión el resultado es `unauthorized` sin tocar el puerto.

### T15 — El contrato del módulo y el punto de composición
- **Depende de**: T10, T12, T13.
- **Qué**: el barrel reexporta tipos, esquemas, errores y las **seis factories**, solo de `./domain`
  (ningún `'use server'`, ningún Prisma en su cierre transitivo); la fachada `identity` de
  `lib/composition` gana las seis claves, el repositorio y la fábrica de credencial, **reutilizando**
  `passwordHasher` y `checkCredentialPolicy` ya construidos y **sin reordenar nada**.
- **Archivos**: `lib/modules/identity/index.ts`, `lib/composition/index.ts`,
  `tests/unit/composition/identity-facade.test.ts` (se amplía — **ojo al solape con QC-78**).
- **Cubre**: R42.
- **Hecho cuando**: `tests/guards/guard-arquitectura-modulos.test.ts` pasa y el barrel sigue
  importable desde un componente de cliente.

---

## Bloque 5 — Integración y cierre

### T16 — Integración: el CRUD contra Postgres real
- **Depende de**: T13, T15.
- **Qué**: alta con empresa heredada, los tres duplicados **por empresa**, paginación 10/25, búsqueda,
  filtro por estado, orden estable con dos homónimos, aislamiento entre empresas, exclusión del propio
  actor, el borrado lógico y que **libera** correo, usuario y documento; y que tras el alta la columna
  `account_status_changed_by` quedó **nula** (R49).
- **Archivos**: `tests/integration/identity/user-crud.int.test.ts` (nuevo).
- **Cubre**: R13, R17, R27–R31, R33, R34, R35, R37, R38, **R49**.
- **Hecho cuando**: pasa, y el `beforeAll` falla con un mensaje claro si falta la migración de T4.

### T17 — Integración: la carrera del último administrador
- **Depende de**: T13.
- **Qué**: **dos conexiones de verdad** apagando dos administradores activos distintos de la misma
  empresa a la vez; se afirma que una falla con `last_administrator` y que al final queda ≥ 1
  administrador en `active`. Más el caso simétrico que **no** debe fallar (tres administradores).
- **Archivos**: `tests/integration/identity/last-administrator.int.test.ts` (nuevo).
- **Cubre**: **R23**, R22.
- **Hecho cuando**: pasa de forma repetible (se corre tres veces seguidas) y el caso simétrico no
  rechaza.

### T18 — [P] El test de alcance
- **Depende de**: T13, T14.
- **Qué**: cero diff en `db/schema.prisma`; ninguna migración de esta feature que nombre los tres
  índices únicos; ninguna mención a `failed_login_attempts`, `lock_level` ni `locked_until` en los
  archivos de la feature; nada nuevo bajo `app/`, `components/` ni `e2e/`; ningún `console.*` en el
  adaptador de credencial; `package.json` sin dependencias nuevas.
- **Archivos**: `tests/unit/identity/usuarios/scope.test.ts` (nuevo).
- **Cubre**: R38, R43, R45, R46, R47.
- **Hecho cuando**: pasa y cada aserción se pone roja al violarla a mano.

### T19 — Ciclo real de migración
- **Depende de**: T4, T16.
- **Qué**: `pnpm run db:migrate` → `pnpm run db:rollback` → `pnpm run db:migrate`, comprobando entre
  medias que el catálogo vuelve a **once** entradas y que las dos asignaciones del `Administrador`
  desaparecieron, y que `_prisma_migrations` queda coherente.
- **Archivos**: ninguno de producción; salida pegada en
  `progress/impl_QC-66-crud-de-usuarios.md`.
- **Cubre**: R44.
- **Hecho cuando**: las tres órdenes terminan en verde y la salida está en la bitácora.

### T20 — Trazabilidad y cierre
- **Depende de**: todas las anteriores.
- **Qué**: escribir el mapa **`R1…R49 → test`** en `progress/impl_QC-66-crud-de-usuarios.md`
  (`CHECKPOINTS.md > Trazabilidad`), anotar el estado de **P1, P2 y P3** (qué sigue abierto y por qué;
  **P4 se cerró el 2026-09-10** y es la decisión 18, escrita por R49), y dejar constancia del ripple de § 2 y del séptimo archivo de T7.
- **Archivos**: `progress/impl_QC-66-crud-de-usuarios.md`.
- **Hecho cuando**: ningún `R<n>` queda sin test nombrado y el leader puede correr `./init.sh`
  completo en verde.

---

## Trazabilidad (mapa previsto `R<n> → task`)

| Requisitos | Task que los cierra |
| --- | --- |
| R1–R5 | T6, T10, T11 |
| R6 | T14 |
| R7 | guardia existente (`guard-rls-force`), verificada en T18 |
| R8, R9, R12 | T1, T2, T5 |
| R10 | T2 (tests del seed), T16 |
| R11, R44 | T4, T5, T19 |
| R13, R14 | T8, T10, T11, T16 |
| R15, R16 | T9, T12, T14 |
| R17 | T9, T13, T16 |
| R18, R20 | T8 |
| R19 | T10, T11 |
| R21, R22, R24 | T10, T11 |
| R23 | **T17** |
| R25, R26 | T10, T11 |
| R27–R31 | T7, T13, T16 |
| R32 | T8, T16 |
| R33–R35 | T9, T10, T11, T16 |
| R36 | T7 |
| R37 | T10, T13, T16 |
| R38, R43, R45, R46, R47 | T18 (+T4, T12) |
| R39 | T10, T11, T18 |
| R40, R41 | T3, T14 |
| R42 | T15 |
| R48 | T2 |
| **R49** | T10, T11, T16 |
