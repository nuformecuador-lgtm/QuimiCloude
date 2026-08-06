# impl_1-modelo-usuarios-y-roles.md

> Feature 1 · zona `backend` · complexity `medium` · rama `feature/1-modelo-usuarios-y-roles`
> Worktree: `.worktrees/1-modelo-usuarios-y-roles/`. Implementer coordinando `backend_dev` (4 tandas).
> Fecha: 2026-08-06. **Veredicto: implementacion completa salvo T12, que esta BLOQUEADA por una
> contradiccion real entre `design.md > 8` y el comportamiento de Prisma. Ver seccion 5.**

## 1. Estado de las tasks

| Task | Estado | Nota |
| --- | --- | --- |
| T0 `.env` en el worktree | [x] | `.env` presente y git-ignorado. Solo traia `DATABASE_URL`; se anadio `DIRECT_URL` con la conexion directa del mismo Postgres local (5432). Ningun valor se copio a un archivo versionado. |
| T1 Prisma | [x] | **Fijado a `^6` a proposito**, ver seccion 6.1. |
| T2 scripts de migracion + rollback | [x] | Escritos segun spec. El `db:rollback` no cierra el ciclo por la seccion 5. |
| T3 Vitest | [x] | vitest 4.1.10, `vitest.config.mts`, scripts `test` / `test:rapido` / `test:guardias`. |
| T4 `db/schema.prisma` | [x] | |
| T5 `migration.sql` | [x] | Drift comprobado contra shadow DB: **cero drift**. |
| T6 `down.sql` | [x] | |
| T7 `lib/prisma.ts`, `lib/types/identity.ts` | [x] | Sin repos ni services (design 7). |
| T8 test estatico de schema | [x] | 12 tests. |
| T9 test estatico de migracion | [x] | 12 tests. |
| T10 guardias | [x] | 8 tests (G1 4 + G2 4). |
| T11 `.env.example` | [x] | Sin credenciales. `!.env.example` anadido al `.gitignore`. |
| T12 aplicar y revertir de verdad | **[ ] BLOQUEADA** | Apply OK y verificado. El rollback dropea las tres tablas (R20 a nivel de esquema, OK) pero deja `_prisma_migrations` incoherente. **Ver seccion 5.** |
| T13 tests de integracion | [x] | 22 casos contra la base real. |
| T14 merge con `dev` + `./init.sh` completo | [ ] | **No es del implementer en esta ronda**: el leader corre `./init.sh` (AGENTS.md, Regla del gate) y el merge/PR van despues del reviewer. |
| T15 mapa `R<n> -> test` | [x] | Este archivo. |

## 2. Archivos creados / modificados

**Esquema y datos**
- `db/schema.prisma` (nuevo) — `DocumentType`, `Role`, `User`. Identificadores de base en ingles
  `snake_case` via `@@map`/`@map`. Sin `enum`. Sin `@unique` en email/username/documento (viven
  como indices funcionales+parciales en el SQL, comentado en el propio schema). `Role` **sin**
  `deletedAt`, deliberado. `passwordHash` sin longitud declarada, columna unica.
- `db/migrations/20260806122638_users_and_roles/migration.sql` (nuevo)
- `db/migrations/20260806122638_users_and_roles/down.sql` (nuevo)
- `db/migrations/migration_lock.toml` (generado por Prisma)

**Codigo**
- `lib/prisma.ts` (nuevo) — singleton cacheado en `globalThis`. Unica importacion de `PrismaClient`
  del proyecto (verificado por grep).
- `lib/types/identity.ts` (nuevo) — `DOCUMENT_TYPE_CC` y el tipo de union derivado.

**Herramienta**
- `package.json` (mod) — deps `prisma@^6`, `@prisma/client@^6`, `vitest@^4`, `tsx`, `pg`, `@types/pg`;
  bloque `"prisma": {"schema": "db/schema.prisma"}`; scripts `db:migrate:create`, `db:migrate`,
  `db:rollback`, `test`, `test:rapido`, `test:guardias`.
- `scripts/db-rollback.ts` (nuevo) — aplica el `down.sql` de la ultima migracion y despues
  `prisma migrate resolve --rolled-back`. Falla con mensaje claro (no stacktrace) si falta
  `DATABASE_URL` o si no hay migraciones.
- `scripts/test-rapido.ts`, `scripts/run-pnpm.ts` (nuevos) — `test:rapido` como script de Node
  porque los scripts npm corren en `cmd.exe` en Windows y la sustitucion de comandos no existe alli.
- `vitest.config.mts` (nuevo) — alias `@/*`, `passWithNoTests`.
- `.env.example` (nuevo, versionado, sin credenciales), `.gitignore` (mod: `!.env.example`).

**Tests**
- `tests/unit/schema/identity-schema.test.ts`
- `tests/unit/schema/identity-migration.test.ts`
- `tests/guards/guard-password-never-plaintext.test.ts`
- `tests/guards/guard-rls-force.test.ts`
- `tests/integration/identity-constraints.int.test.ts`

**No se toco nada de UI, ni seed, ni hashing, ni login** (fuera de alcance por spec).

## 3. Mapa `R<n> -> test`

**S** = `tests/unit/schema/identity-schema.test.ts` · **M** = `tests/unit/schema/identity-migration.test.ts` ·
**G1** = `tests/guards/guard-password-never-plaintext.test.ts` · **G2** = `tests/guards/guard-rls-force.test.ts` ·
**I** = `tests/integration/identity-constraints.int.test.ts`. Los 54 tests estan **ejecutados y en verde** (seccion 4).

| R | Test estatico | Test de integracion |
| --- | --- | --- |
| R1 | S · "el modelo User declara los nueve datos del usuario" | I · "crea un usuario con todos sus datos" |
| R2 | S · "todo campo de negocio de User es obligatorio, incluidos telefono y fecha de nacimiento" | I · "rechaza el alta si falta un campo obligatorio" (una vuelta por cada una de las 9 columnas) |
| R3 | S · "User y Role tienen id uuid con default generado" | — |
| R4 | M · "el indice unico de correo es sobre lower(email)" | I · "rechaza un correo repetido exacto" · I · "rechaza un correo repetido aunque cambie el uso de mayusculas" |
| R5 | M · "el indice unico de username es sobre lower(username)" | I · "rechaza un nombre de usuario repetido exacto" · I · "rechaza un nombre de usuario repetido aunque cambie el uso de mayusculas" |
| R6 | M · "el indice unico de documento es compuesto por tipo y numero" | I · "rechaza el mismo tipo y numero de documento repetidos" |
| R7 | M · "el indice unico de documento es compuesto por tipo y numero" | I · "acepta el mismo numero de documento con tipo distinto" |
| R8 | S · "document_type_code es FK a document_types y no hay enum" | I · "rechaza un tipo de documento fuera del catalogo" |
| R9 | M · "la migracion inserta CC como unico tipo de documento" | I · "el catalogo arranca solo con CC" |
| R10 | S · "el tipo de documento no es enum ni check, es tabla" | I · "anadir un tipo nuevo deja intactos los usuarios ya guardados" |
| R11 | G1 · "ninguna columna ni campo guarda la contrasena en claro" | — (guardia estatica; design 9) |
| R12 | S · "passwordHash es String sin longitud declarada" · M · "password_hash es TEXT sin longitud" | — |
| R13 | S · "Role declara name y description obligatorios" | I · "crea un rol con nombre y descripcion" |
| R14 | M · "roles tiene un indice unico sobre name" | I · "rechaza un segundo rol con el mismo nombre" |
| R15 | S · "roleId es obligatorio y FK a Role" | I · "rechaza un usuario sin rol o con rol inexistente" |
| R16 | S · "roleId no tiene restriccion de unicidad" | I · "acepta varios usuarios con el mismo rol" |
| R17 | S · "la relacion User-Role declara onDelete Restrict" · S · "Role no tiene deletedAt" | I · "rechaza borrar un rol con usuarios asignados" · I · "rechaza borrar un rol cuyo unico usuario esta borrado logicamente" |
| R18 | — | I · "permite borrar un rol sin usuarios asignados" |
| R19 | G2 · "toda tabla creada tiene RLS activado y forzado" | — (design 9: un test de RLS con Prisma sale verde pase lo que pase) |
| R20 | M · "down.sql revierte exactamente lo que crea migration.sql" | T12 · ciclo apply -> rollback -> apply. **Esquema OK; el registro `_prisma_migrations` NO. Ver seccion 5.** |
| R21 | S · "User declara deletedAt opcional" | I · "el borrado logico conserva la fila y marca deleted_at" |
| R22 | M · "los tres indices unicos son parciales con WHERE deleted_at IS NULL" | I · "permite re-alta con el correo, username y documento de un usuario borrado" |
| R23 | M · "los tres indices unicos son parciales con WHERE deleted_at IS NULL" | I · "admite dos usuarios borrados que comparten correo y documento" |
| R24 | S · "User y Role declaran createdAt y updatedAt" | I · "created_at y updated_at se rellenan solos y updated_at cambia al modificar" |

**Ningun R1-R24 se quedo sin test ejecutado.** R20 tiene su test estatico en verde; su mitad
"contra base real" esta verificada a nivel de esquema y bloqueada a nivel de `_prisma_migrations`
(seccion 5).

Tests de sensibilidad anadidos sobre lo que pedia `tasks.md`, para que la trazabilidad no sea
decorativa: M comprueba que sus propios asserts caen si alguien quita el `lower(...)` o el
`WHERE deleted_at IS NULL`; G1 y G2 comprueban que detectan una columna en claro introducida a
proposito y una tabla sin `FORCE`, y que no se conforman con un RLS puesto en un comentario.

## 4. Salida real del gate

Regla de `AGENTS.md > Regla del gate`: el implementer NO corre la suite completa. Corrido:

```
> pnpm run typecheck
> tsc --noEmit
=== EXIT typecheck: 0 ===

> pnpm run lint
> eslint
=== EXIT lint: 0 ===
```

```
> pnpm exec vitest related --run db/schema.prisma db/migrations/20260806122638_users_and_roles/migration.sql
    lib/prisma.ts lib/types/identity.ts tests/unit/schema/identity-schema.test.ts
    tests/unit/schema/identity-migration.test.ts tests/guards/guard-password-never-plaintext.test.ts
    tests/guards/guard-rls-force.test.ts tests/integration/identity-constraints.int.test.ts

 RUN  v4.1.10 C:/Users/Cristian/Documents/trabajo/arc/labs/.worktrees/1-modelo-usuarios-y-roles

 Test Files  5 passed (5)
      Tests  54 passed (54)
   Start at  07:43:02
   Duration  2.51s (transform 78ms, setup 0ms, import 774ms, tests 1.14s, environment 1ms)

=== EXIT: 0 ===
```

Detalle por test (`--reporter=verbose`): los 54 en verde uno a uno, con los nombres de la tabla de
la seccion 3. Los 22 de integracion, literal:

```
 ✓ estructura del usuario > crea un usuario con todos sus datos 50ms
 ✓ estructura del usuario > rechaza el alta si falta un campo obligatorio 101ms
 ✓ unicidad de correo, nombre de usuario y documento > rechaza un correo repetido exacto 12ms
 ✓ unicidad ... > rechaza un correo repetido aunque cambie el uso de mayusculas 12ms
 ✓ unicidad ... > rechaza un nombre de usuario repetido exacto 12ms
 ✓ unicidad ... > rechaza un nombre de usuario repetido aunque cambie el uso de mayusculas 16ms
 ✓ unicidad ... > rechaza el mismo tipo y numero de documento repetidos 12ms
 ✓ unicidad ... > acepta el mismo numero de documento con tipo distinto 13ms
 ✓ conjunto cerrado de tipos de documento > rechaza un tipo de documento fuera del catalogo 12ms
 ✓ conjunto cerrado ... > el catalogo arranca solo con CC 5ms
 ✓ conjunto cerrado ... > anadir un tipo nuevo deja intactos los usuarios ya guardados 13ms
 ✓ roles > crea un rol con nombre y descripcion 6ms
 ✓ roles > rechaza un segundo rol con el mismo nombre 7ms
 ✓ roles > rechaza un usuario sin rol o con rol inexistente 9ms
 ✓ roles > acepta varios usuarios con el mismo rol 9ms
 ✓ roles > rechaza borrar un rol con usuarios asignados 13ms
 ✓ roles > rechaza borrar un rol cuyo unico usuario esta borrado logicamente 17ms
 ✓ roles > permite borrar un rol sin usuarios asignados 11ms
 ✓ borrado logico y marcas de tiempo > el borrado logico conserva la fila y marca deleted_at 93ms
 ✓ borrado logico ... > permite re-alta con el correo, username y documento de un usuario borrado 16ms
 ✓ borrado logico ... > admite dos usuarios borrados que comparten correo y documento 33ms
 ✓ borrado logico ... > created_at y updated_at se rellenan solos y updated_at cambia al modificar 75ms

 Test Files  5 passed (5)
      Tests  54 passed (54)
   Duration  2.39s
```

Aislamiento de los tests de integracion: cada caso corre en una `$transaction` interactiva que
siempre acaba en ROLLBACK, con `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` para poder afirmar el estado
despues de cada rechazo. Verificado a mano: dos ejecuciones seguidas en verde y, al terminar,
`users=0, roles=0, document_types=1`.

Los asserts de violacion de restriccion se hacen sobre el **SQLSTATE** (`23502` NOT NULL,
`23503` FK, `23505` unicidad, leidos de `meta.code`) **mas el efecto observable** (la fila existente
sigue intacta, el `count()` no cambia), no sobre el texto del error: el Postgres de esta maquina
responde en espanol y Prisma no propaga el nombre del indice. Los nombres de los indices los vigila
M (T9), que es donde existen.

## 5. BLOQUEO — T12: `db:rollback` deja `_prisma_migrations` incoherente

**Lo que pasa.** `prisma migrate resolve --rolled-back` **solo admite migraciones en estado
fallido**. Sobre una migracion aplicada con exito devuelve `P3012`. Resultado: el `down.sql` se
aplica (las tablas se van, R20 se cumple a nivel de esquema) pero el registro de Prisma sigue
diciendo "aplicada, no revertida", y a partir de ahi `db:migrate` no reaplica nada.

Salida literal (sin la cadena de conexion):

```
> pnpm run db:migrate
Applying migration `20260806122638_users_and_roles`
All migrations have been successfully applied.

> pnpm run db:rollback
db:rollback: aplicando down.sql de 20260806122638_users_and_roles
db:rollback: marcando 20260806122638_users_and_roles como rolled-back en _prisma_migrations
Error: P3012  Migration `20260806122638_users_and_roles` cannot be rolled back because it is not
in a failed state.
db:rollback: el down.sql se aplico pero "prisma migrate resolve --rolled-back ..." fallo.
_prisma_migrations ha quedado incoherente...   (exit 1)

  -> tablas tras el rollback: [_prisma_migrations]   (users, roles y document_types desaparecen)
  -> _prisma_migrations: finished=true, rolled_back=false   <-- INCOHERENTE

> (reparacion manual: borrada esa fila) + pnpm run db:migrate
All migrations have been successfully applied.
```

**Por que es un bloqueo de spec y no una decision del implementer.** El comando exacto lo mandan
`design.md > 8`, `tasks.md > T2` y `docs/architecture.md > Migraciones up/down`, que ademas dice
que ese segundo paso "no es opcional". Y `CHECKPOINTS.md` exige que `db:rollback` revierta y deje
`_prisma_migrations` coherente. Cumplir la letra de la spec y cumplir su intencion son aqui cosas
distintas, asi que **no se ha improvisado un arreglo**: `scripts/db-rollback.ts` se queda tal como
lo pide la spec y la decision es del leader.

**Salidas posibles, para que la decision sea rapida** (ninguna aplicada):
1. Tras el `down.sql`, `UPDATE _prisma_migrations SET rolled_back_at = now() WHERE migration_name = ...`
   — es exactamente lo que escribe el comando de Prisma, conserva el rastro historico y hace que
   `migrate deploy` reaplique. Es la que mas se parece a la intencion de `architecture.md`.
2. `DELETE FROM _prisma_migrations WHERE migration_name = ...` — funciona, pero pierde el rastro.
3. Dejar el comando de Prisma como primer intento y caer al fallback 1 solo cuando devuelve `P3012`.

Cualquiera de las tres implica retocar `design.md > 8`, `tasks.md > T2` y la frase de
`docs/architecture.md`, que es justo lo que un implementer no debe decidir solo.

**Estado actual de la base:** coherente y con la migracion aplicada. Reparada a mano borrando la
fila huerfana y reaplicando. `pnpm exec prisma migrate status` responde `Database schema is up to date!`.

Verificacion del esquema realmente aplicado (la parte de T12 que si cerro):
- Las tres tablas existen.
- `pg_indexes`: `users_email_unique` y `users_username_unique` con `lower(...)` y
  `WHERE (deleted_at IS NULL)`; `users_document_unique` sobre
  `(document_type_code, document_number) WHERE (deleted_at IS NULL)`.
- `users_document_type_code_fkey` y `users_role_id_fkey` con `ON DELETE RESTRICT`.
- `document_types` = 1 fila: `CC / Cedula de ciudadania / true`.
- `pg_class`: `relrowsecurity` y `relforcerowsecurity` **true** en las tres tablas.

## 6. Desviaciones y deuda que el reviewer debe mirar

1. **Prisma fijado a `^6` (6.19.3), no a la ultima.** `pnpm add -D prisma` instala 7.9.1, que
   invalida `design.md > 7` en dos puntos verificados: el CLI de Prisma 7 ya no lee
   `package.json#prisma`, y `datasource { url = env(...) }` da `P1012: The datasource property
   'url' is no longer supported in schema files` (Prisma 7 exige `prisma.config.ts` mas driver
   adapters). Con `^6` el design se cumple literal. Prisma 6 emite un `warn` de que
   `package.json#prisma` desaparece en Prisma 7: **deuda conocida** para cuando se suba de mayor.
2. **`DIRECT_URL` no existia en el `.env`.** `design.md > 7` previo el caso y mando comprobarlo en
   T0: la base es un Postgres local en 5432 (conexion directa, no pooler), asi que `DIRECT_URL`
   toma el mismo valor. Ningun archivo versionado contiene la cadena.
3. **Bug atrapado por la comprobacion de drift, ya corregido.** El primer `INSERT` de `CC` no
   incluia `updated_at`, que es NOT NULL y cuyo valor lo pone el cliente Prisma (`@updatedAt`), no
   un DEFAULT: la migracion reventaba con `P3006`. Corregido anadiendo la columna con
   `CURRENT_TIMESTAMP`. Habria reventado T12 en cualquier entorno.
4. **Drift comprobado de verdad**, no afirmado: `prisma migrate diff --from-migrations db/migrations
   --to-schema-datamodel db/schema.prisma --shadow-database-url <scratch>` sobre una base scratch
   creada y borrada al vuelo. Salida: `-- This is an empty migration.`, exit 0.
5. **`pnpm run typecheck` puede salir rojo en una maquina limpia** con
   `app/layout.tsx(20,50): Cannot find name 'LayoutProps'` si no existe `.next/types`. Es
   preexistente, no de esta feature; se arregla con `pnpm exec next typegen`. Relevante si
   `./init.sh` corre en CI sin build previo.
6. **T14 no ejecutada a proposito.** El merge con `dev`, el `./init.sh` completo y el PR van
   despues del reviewer, y el `init.sh` lo corre el leader (`AGENTS.md > Regla del gate`).
