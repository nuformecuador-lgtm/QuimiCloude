# QC-66 — crud-de-usuarios · bitacora de implementacion

> Zona: `backend` · Complejidad: `medium` · Rama: `feature/QC-66-crud-de-usuarios`
> Worktree: `.worktrees/QC-66-crud-de-usuarios` · Base: `origin/dev` (`c870825`)
>
> Spec aprobado por el humano el 2026-09-10. **49 requisitos** (R1-R49), **20 tasks** (T0-T20).
> Coordina el `implementer`; implementa `backend_dev`. El gate (`./init.sh --rapido` por tanda,
> `./init.sh` completo antes del PR) lo corre el **leader**.

---

## Bloque 0 — T0: la base heredada, verificada punto por punto

Los ocho puntos de `tasks.md > T0`, con su evidencia leida en esta rama. **Nada de esto se crea
ni se modifica en esta feature.**

| # | Qué | Evidencia |
| --- | --- | --- |
| 1 | `model User` completo + `enum UserAccountStatus` | `db/schema.prisma` L159-223: `roleId` L170, `companyId` L176, `deletedAt` L179, `mustChangeCredential` L188, `accountStatus` L194, `accountStatusChangedAt` L199, `accountStatusChangedBy` L209. Enum L124-129 con `active`/`pending`/`inactive`/`blocked`. |
| 2 | Los tres indices unicos por empresa, parciales | `db/migrations/20260904180600_companies_and_user_company/migration.sql` L171-173: `users_email_unique`, `users_username_unique`, `users_document_unique`, los tres `WHERE "deleted_at" IS NULL`. **No se tocan** (R38). |
| 3 | Las constantes del dominio | `permissions.ts`: `PERMISSIONS` con **11** entradas (`grep -c 'code:'` = 11) + `SEED_ROLE_PERMISSIONS`; `roles.ts` L7 `ROLE_ADMINISTRADOR`; `require-permission.ts` L26 `assertPermission`; `account-status.ts` L33 `USER_ACCOUNT_STATUSES`; `credential-policy.ts` L69 `evaluateCredentialRules`, L86 `createCredentialPolicy`, L19 `CREDENTIAL_MIN_LENGTH = 8`; `credentials.ts` L18 `CREDENTIAL_MAX_LENGTH = 64`; `display-name.ts` L17 `buildDisplayName`. |
| 4 | El seed idempotente, derivado | `seed-initial-access.ts` L5 importa `PERMISSIONS` y `SEED_ROLE_PERMISSIONS`; L112-113 «LEER que falta y CREAR exactamente eso. Sin `upsert` y sin `delete`»; L196 y L221 derivan de las constantes. **Su algoritmo no se modifica** (design.md § 3.4). |
| 5 | El cableado ya existente de composicion | `lib/composition/index.ts` L162 `checkCredentialPolicy`, L163 `passwordHasher`, L178 `getSessionUser`, L180 `getSessionContext`. Se **reutilizan**. |
| 6 | La paginacion compartida | `lib/shared/pagination.ts` L10 `DEFAULT_PAGE_SIZE = 10`, L17 `MAX_PAGE_SIZE = 25`, L33 `toOffsetLimit`, L51 `buildPage`. |
| 7 | Las cinco copias del contrato de lista + su guardia | `lib/modules/{inventario,pedidos,proveedores,recetas,unidades}/domain/list-query.ts`; `tests/guards/guard-contrato-listados.test.ts` L53-54 `MODULOS` con los cinco y el texto «cinco» en L1, L3, L6, L10, L12, L14, L53, L213-261. Pasan a **seis** en T7. |
| 8 | Que **no** existen todavia | `lib/modules/identity/domain/errors.ts` -> no existe; `lib/modules/identity/domain/actor.ts` -> no existe. Nacen en T3 y T6. |

**Veredicto T0: los ocho verificados. No se para.**

### Montaje del worktree (no es una task, pero es condicion de todo lo demas)

El worktree venia sin `node_modules` ni `.env` (solo dos de los cinco worktrees activos los
tenian). Se monto sin tocar el worktree principal:

- `.env` copiado desde `.worktrees/QC-78-estado-de-cuenta-en-el-acceso/.env` (no desde `labs/`).
  **OJO: esto trajo su `DATABASE_URL` y fue un error, corregido en la tanda 1** — ver
  «Una base de datos equivocada». La base de esta feature es `QuimiCloude_QC66`.
- `pnpm install --prefer-offline` -> `Done in 3m 13.6s using pnpm v10.10.0`.
- `pnpm exec prisma generate` -> `Generated Prisma Client (v6.19.3)` (pnpm ignora los build
  scripts de `@prisma/client`, asi que el generate es explicito).
- `pnpm exec prisma migrate status` -> `Database schema is up to date!` (la base real responde,
  asi que los dos tests de integracion de T16/T17 son ejecutables).

### Linea base de verificacion, medida ANTES de escribir una sola linea

Para que nadie me atribuya un rojo ajeno:

- `pnpm exec eslint .` -> **limpio, sin salida**.
- `pnpm run typecheck` -> **3 archivos en rojo, ninguno de esta feature**:
  - `app/layout.tsx(43,56)`: `Cannot find name 'LayoutProps'` (tipo generado por `next build`,
    ausente en un worktree recien montado).
  - `tests/unit/recetas/recipe-lines-catalog.test.ts` y `tests/unit/recetas/recipe-service.test.ts`:
    `Property 'stock' is missing in type ... ProductRef` — es el arreglo en vuelo que el worktree
    principal tiene sin commitear en esos mismos dos archivos.

**Criterio de cierre de cada tanda: el typecheck no gana ningun archivo fuera de esos tres.**

**Ampliacion medida en la tanda 1** (el typecheck y el lint no los veian, porque son tests que
corren git): `tests/unit/recetas/module-contract.test.ts`,
`tests/unit/recetas-ui/recipe-route-contract.test.ts` y `tests/unit/unidades/modulo-intacto.test.ts`
fallan con `el rango git origin/dev...HEAD no estaba disponible`. Son tests de «modulo intacto» que
comparan contra un rango git que un worktree recien montado no tiene. **Linea base real: 5
archivos, ninguno de esta feature.**

---

## Tanda 1 — el catalogo a trece, su ripple, su migracion y la jerarquia de errores (T1-T5)

Dos `backend_dev` en paralelo, sin un solo archivo en comun: uno con T1 -> T2 -> T4 -> T5, otro con T3.

### Una base de datos equivocada, detectada y devuelta a su sitio (antes de T1)

Al montar el worktree copie el `.env` del worktree de QC-78, y con el su `DATABASE_URL`. La
convencion real del repo es **una base por feature** (`QuimiCloude_QC14`, `_QC47`, `_QC65`, `_QC70`,
`_QC74`, `_QC78`... trece en la instancia local), asi que T4 aplico la migracion del catalogo sobre
`QuimiCloude_QC78`, la base de una feature `in_progress` ajena. Corregido entero:

1. `pnpm exec tsx scripts/db-rollback.ts` sobre `QuimiCloude_QC78` ->
   `20260910120000_user_permissions_catalog revertida.`
2. Estado de `QuimiCloude_QC78` comprobado despues: `permissions` = **11**, `role_permissions` =
   **12**, filas `usuarios.*` = **0**, filas de esta migracion en `_prisma_migrations` = **0**.
   **La base de QC-78 quedo exactamente como estaba.**
3. `CREATE DATABASE "QuimiCloude_QC66"`, `.env` repuntado a ella, `prisma migrate deploy` ->
   `All migrations have been successfully applied.`, y `tsx scripts/seed.ts` ->
   `roles creados: 2 ... permisos creados: 11 ... asignaciones permiso-rol creadas: 14 ...`
4. Estado de `QuimiCloude_QC66`: `permissions` = **13**, `role_permissions` = **14**, `usuarios.*` =
   **2**, 1 usuario, 2 roles.

**Efecto lateral util, no planificado:** el paso 1 es **R44 verificado contra una base real** —el
`down.sql` devolvio el catalogo a sus once entradas y sus doce asignaciones exactas— y el paso 3
ejerce el camino «base virgen» que `design.md > 3.2` predijo: ahi el `INSERT ... SELECT` de
`role_permissions` inserta **cero** filas porque el rol `Administrador` todavia no existe, y es el
seed el que siembra las catorce asignaciones (de ahi el «asignaciones creadas: 14» frente al
«permisos creados: 11»). **Los dos caminos convergen**, como decia el diseno.

### T1 — el catalogo pasa de once a trece · R8, R9, R12

`lib/modules/identity/domain/permissions.ts` (+29/-5).

- Dos entradas al final de `PERMISSIONS`, con el estilo y el orden de las once anteriores, que
  quedan **sin ningun cambio**.
- Los dos codigos al final de `SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]`, **uno a uno**. El
  `ROLE_OPERADOR` sigue siendo `['inventario.consultar']` exacto (R9).
- Cabecera: «once» -> «trece», y parrafo nuevo que empieza literalmente `**Esto enmienda QC-74 R1**`,
  al lado del de QC-38 que enmendaba su R2. Dice con esas palabras que `usuarios` **no es ninguna
  carpeta** de `lib/modules/`, que el modelo `User` es `/// @module identity`, y que el codigo vale
  igual porque lo lee una persona y `identidad.consultar` no dice QUE se consulta (R12, decision
  cerrada 2). No esta disimulada.

### T2 — el ripple del catalogo compartido, en la MISMA tanda · R48

Los **seis** archivos ajenos que `design.md > 2` habia medido, mas **dos hallazgos** que esa
medicion no tenia:

| # | Archivo | Cambio |
| --- | --- | --- |
| 1 | `tests/guards/guard-permisos-sembrados.test.ts` | titulo y mensaje de fallo a «trece», `.toBe(13)`. Ancla anti-vacuidad intacta |
| 2 | `tests/guards/guard-nav-permisos-declarados.test.ts` | `toHaveLength(13)`. **El arbol de navegacion NO se toca**: sigue con 7 enlaces, el item de usuarios es de QC-67 |
| 3 | `tests/unit/navegacion/qc75-convenciones.test.ts` | `toHaveLength(13)` y los dos codigos en `CODIGOS_QC74`; **mas el septimo caso rojo de abajo** |
| 4 | `tests/unit/identity/permissions.test.ts` | los 13 codigos en `CODIGOS_DEL_REQUISITO`, `toBe(13)`, titulos, **`'usuarios'` sumado a `MODULOS` y a `MODULOS_CON_ESCRITURA`** con el comentario de la enmienda, y **dos casos nuevos** |
| 5 | `tests/unit/identity/seed/seed-initial-access.test.ts` | «trece y catorce», `toBe(14)`, `toHaveLength(13)` |
| 6 | `tests/integration/identity/identity-seed.int.test.ts` | comentarios y titulos a trece/catorce, **y un literal que el diseno decia que no existia** |

**Los dos hallazgos que el `design.md` no tenia, cazados y arreglados aqui y no luego:**

1. **Un septimo caso rojo dentro del archivo 3.** `qc75-convenciones.test.ts` tiene un segundo caso,
   «los modulos son exactamente los cinco de negocio mas dashboard y unidades», que se pone rojo
   porque `usuarios` es un modulo nuevo. El titulo pasa a «...mas dashboard y usuarios» y `esperados`
   suma `'usuarios'` con el comentario de la enmienda. **No** se metio `usuarios` en
   `MODULOS_DE_NEGOCIO`, porque no es un modulo del ERP ni una carpeta: se suma en el punto de la
   asercion.
2. **`design.md > 2` fila 6 se equivoca.** Decia que en `identity-seed.int.test.ts` «los conteos ya
   se derivan de `PERMISSIONS`, asi que no hay numero literal que cambiar». **Si lo hay**:
   `expect(TOTAL_DE_ASIGNACIONES_DEL_SEED).toBe(12)`, y estaba rojo. Pasa a `14`. El resto del
   archivo si deriva.

**Ningun octavo archivo.** `tests/guards/guard-contrato-listados.test.ts` —el septimo que
`design.md > 8.1` declara— **no se toco y esta verde** con el catalogo a trece: su ancla de «cinco
modulos» es de listados, no del catalogo. Se toca en **T7**, que es su sitio.

**Prueba de que ninguna expectativa se elimino ni se debilito (R48).** El diff de `tests/` borra
exactamente **6** lineas que contienen `expect(`, y las seis son la misma asercion reemitida con el
numero nuevo (`11->13`, `12->14`). Las demas lineas borradas son titulos de `it(` reescritos. Ni un
`toEqual` degradado a `toContain`, ni un caso saltado, ni un `expect` perdido. Y
`permissions.test.ts` **gana** dos casos:

- `QC-66 R9: el Administrador tiene usuarios.consultar Y usuarios.modificar, escritos uno a uno`
- `QC-66 R9: el Operador no recibe ninguno de los dos permisos de usuarios`

### T3 — la jerarquia de errores de `identity` · R41 (mitad de dominio)

`lib/modules/identity/domain/errors.ts` (**nuevo**; `identity` no tenia ninguna clase de error) y
`tests/unit/identity/usuarios/errors.test.ts` (**nuevo**, carpeta nueva).

`export abstract class IdentityError extends Error` con `abstract readonly code: string`, y las
**nueve** subclases con los `code` exactos de `design.md > 6.4`: `unauthorized`, `not_found`,
`duplicate_email`, `duplicate_username`, `duplicate_document`, `role_not_found`, `self_operation`,
`last_administrator`, `invalid_input`.

Patron **copiado** de `lib/modules/unidades/domain/errors.ts` (identico en `proveedores`): base
abstracta con `abstract readonly code`, subclases con `readonly code = '...'` sin union ni enum,
mensaje por defecto como unico parametro opcional, `this.name = new.target.name` y
`Object.setPrototypeOf(this, new.target.prototype)` en la base, **sin `cause`** y **sin type guard**,
porque ningun modulo del repo los usa y la discriminacion del repositorio es
`error instanceof <Modulo>Error` + `error.code`. `invalid_input` es el mismo `code` que ya comparten
los otros cuatro modulos.

El test afirma el `code` **por clase**, nunca por el texto del mensaje (R41), el `instanceof` y la
unicidad de los nueve codigos. Importa por ruta profunda a proposito: el barrel es **T15**.

### T4 — la migracion de DATOS del catalogo, con su `down.sql` · R11, R43, R44

`db/migrations/20260910120000_user_permissions_catalog/{migration.sql,down.sql}` (nuevos).

El SQL es el de `design.md > 3.2` y `> 3.3`, literal, con su cabecera de comentarios. **Cero
`ALTER`, `CREATE` y `DROP`**: solo dos `INSERT`. `ON CONFLICT DO NOTHING` en las dos tablas (R11);
el rol resuelto **por nombre** con subselect, nunca un uuid a mano; `updated_at` explicito porque
`permissions` no lo tiene por defecto. El DOWN borra **primero** `role_permissions` y **despues**
`permissions`, porque la FK es `RESTRICT`, y acota por codigo.

**Decision del `backend_dev` que conviene que conste: NO uso `pnpm run db:migrate:create`.** Envuelve
`prisma migrate dev`, que ante el drift conocido de este repo (19 `DROP CONSTRAINT` + 9 `DROP INDEX`
documentados en QC-65/QC-74) puede ofrecerse a **resetear la base real**, que aqui responde. Creo la
carpeta a mano y escribio el SQL. Se aparta de la letra de T4 y esta bien: el criterio de hecho de
T4 es el SQL resultante, no la herramienta.

Verificacion real:

```
pnpm run db:migrate
  Applying migration `20260910120000_user_permissions_catalog`
  All migrations have been successfully applied.
pnpm run db:migrate  (segunda vez)
  No pending migrations to apply.
prisma db execute  (reejecutando el MISMO migration.sql, que es la idempotencia de verdad)
  Script executed successfully.
```

Estado despues: `permissions` = 13, `usuarios.*` presentes, `role_permissions` = 14, las dos
asignaciones del `Administrador` y **sin duplicar**.

### T5 — el test estatico de la migracion · R8, R11, R43, R44

`tests/unit/identity/schema/user-permissions-migration.test.ts` (nuevo), 11 casos.

Los dos codigos y sus descripciones se comparan contra `PERMISSIONS` **importado** y el nombre del
rol contra `ROLE_ADMINISTRADOR` **importado**: en el test no hay **ni un literal de codigo copiado**,
que es lo que impide que las dos escrituras del catalogo divergan. Afirma ademas que el UP no
contiene `ALTER`/`CREATE`/`DROP`, que las dos sentencias llevan `ON CONFLICT ... DO NOTHING`, y que el
`down.sql` borra las asignaciones **antes** del permiso.

**Los dos casos de sensibilidad, alterados en disco, corridos y revertidos** (no afirmados de
palabra):

```
1) quitando `ON CONFLICT ("code") DO NOTHING` de migration.sql
   x las DOS sentencias que insertan llevan ON CONFLICT ... DO NOTHING, y cae si falta una
   Test Files  1 failed | Tests  1 failed | 10 passed (11)
   revertido -> Test Files  1 passed | Tests  11 passed (11)

2) invirtiendo el orden de down.sql (permiso antes que asignaciones)
   x el orden es el inverso del UP, y cae si se invierte
   Test Files  1 failed | Tests  1 failed | 10 passed (11)
   revertido -> Test Files  1 passed | Tests  11 passed (11)
```

Mas las mutaciones **en memoria** del patron de `account-status-migration.test.ts` (QC-65):
renombrar el codigo, cambiar la descripcion, quitar el `INSERT`, `DO UPDATE` en vez de `DO NOTHING`,
renombrar el rol, meter un uuid, asignar solo uno de los dos, colar un `ALTER`/`CREATE`/`DROP`,
quitar el `WHERE` del DOWN.

### Verificacion de la tanda 1

```
pnpm run typecheck   -> la linea base exacta, ni un archivo rojo mas
                        (app/layout.tsx + los dos tests/unit/recetas/*)
pnpm exec eslint .   -> sin salida (limpio)

pnpm exec vitest related --run lib/modules/identity/domain/errors.ts tests/unit/identity/usuarios/errors.test.ts
  Test Files  1 passed (1)
       Tests  22 passed (22)

los 6 ajenos + el nuevo de T5, aislados
  Test Files  7 passed
       Tests  105

pnpm exec vitest related --run lib/modules/identity/domain/permissions.ts tests/unit/identity/schema/user-permissions-migration.test.ts
  Test Files  5 failed | 166 passed (171)
       Tests  5 failed | 2278 passed | 2 skipped (2285)
```

**Los 5 rojos de esa ultima corrida son linea base, verificada con el mismo mensaje de asercion antes
de tocar nada** (se volco `git show HEAD:...permissions.ts` sobre el archivo y se corrieron): los dos
de `tests/unit/recetas/*` por `ProductRef.stock`, y **tres que mi medicion inicial no tenia porque
solo media typecheck y lint**: `recetas/module-contract.test.ts`,
`recetas-ui/recipe-route-contract.test.ts` y `unidades/modulo-intacto.test.ts`, los tres por
`el rango git origin/dev...HEAD no estaba disponible` / `expected '' to contain 'unit-prisma.ts'`.
Son tests de «modulo intacto» que comparan contra un rango git que **en un worktree recien montado no
existe**.

**LINEA BASE AMPLIADA A 5 ARCHIVOS; ninguno es de esta feature.** Los tres nuevos son un artefacto
del worktree, no del cambio: conviene que el leader lo sepa antes de correr el gate.

Nota de flake, no de rojo: en la primera corrida conjunta `identity-seed.int.test.ts` dio 3 falsos
rojos por contencion de la base con otra suite de integracion en paralelo. Solo, pasa 13/13.

**Tasks cerradas en la tanda 1: T1, T2, T3, T4, T5.**

---

## Mapa de trazabilidad `R<n> -> test`

(T20)
