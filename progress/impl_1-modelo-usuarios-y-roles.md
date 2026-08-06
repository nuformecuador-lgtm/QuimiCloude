# impl_1-modelo-usuarios-y-roles.md

> Feature 1 · zona `backend` · complexity `medium` · rama `feature/1-modelo-usuarios-y-roles`
> Worktree: `.worktrees/1-modelo-usuarios-y-roles/`. Implementer coordinando `backend_dev` (4 tandas).
> Fecha: 2026-08-06. **Veredicto: implementacion completa. Todas las tasks cerradas salvo T14,
> que es del leader.**
>
> **Ronda 2 (2026-08-06, tras `progress/review_1-modelo-usuarios-y-roles.md`, veredicto RECHAZADO).**
> El bloqueante B1 esta **RESUELTO**: el humano decidio la opcion 2 (el `DELETE` sobre
> `_prisma_migrations`) y T12 se cerro ejecutando el ciclo de verdad — salida en la seccion 5.
> Menores m2, m3 y m4 corregidos; m1 y m5 quedan anotados como deuda en la seccion 6, que es lo
> que el reviewer pidio para ellos.

## 1. Estado de las tasks

| Task | Estado | Nota |
| --- | --- | --- |
| T0 `.env` en el worktree | [x] | `.env` presente y git-ignorado. Solo traia `DATABASE_URL`; se anadio `DIRECT_URL` con la conexion directa del mismo Postgres local (5432). Ningun valor se copio a un archivo versionado. |
| T1 Prisma | [x] | **Fijado a `^6` a proposito**, ver seccion 6.1. |
| T2 scripts de migracion + rollback | [x] | `db:rollback` cierra el ciclo: `down.sql` + `DELETE` de la fila en `_prisma_migrations`, **en la misma transaccion**. Ver seccion 5. |
| T3 Vitest | [x] | vitest 4.1.10, `vitest.config.mts`, scripts `test` / `test:rapido` / `test:guardias`. |
| T4 `db/schema.prisma` | [x] | |
| T5 `migration.sql` | [x] | Drift comprobado contra shadow DB: **cero drift**. |
| T6 `down.sql` | [x] | |
| T7 `lib/prisma.ts`, `lib/types/identity.ts` | [x] | Sin repos ni services (design 7). |
| T8 test estatico de schema | [x] | 12 tests. |
| T9 test estatico de migracion | [x] | 12 tests. |
| T10 guardias | [x] | 8 tests (G1 4 + G2 4). |
| T11 `.env.example` | [x] | Sin credenciales. `!.env.example` anadido al `.gitignore`. |
| T12 aplicar y revertir de verdad | [x] | Ciclo apply -> rollback -> apply ejecutado limpio, con `_prisma_migrations` coherente en cada paso. **Salida real en la seccion 5.** Cierra R20 en su forma real. |
| T13 tests de integracion | [x] | 23 casos contra la base real (22 + el assert explicito de R3 anadido en la ronda 2). |
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
- `scripts/db-rollback.ts` (nuevo, corregido en la ronda 2) — aplica el `down.sql` de la ultima
  migracion y, **en la misma transaccion**, `DELETE FROM "_prisma_migrations" WHERE
  migration_name = $1` (parametrizado). Atomico a proposito: el DDL de Postgres es transaccional,
  asi que o se revierte todo o no se revierte nada; en dos pasos separados es como se llega a un
  `_prisma_migrations` mintiendo. Falla con mensaje claro (no stacktrace) si falta `DATABASE_URL`
  o si no hay migraciones; si el DELETE afecta 0 filas avisa y sigue.
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
**I** = `tests/integration/identity-constraints.int.test.ts`. Los 57 tests estan **ejecutados y en
verde** (seccion 4). Tres de ellos son de la ronda 2: el assert explicito de R3 (m3) y los dos
estaticos que vigilan la convencion de rollback.

| R | Test estatico | Test de integracion |
| --- | --- | --- |
| R1 | S · "el modelo User declara los nueve datos del usuario" | I · "crea un usuario con todos sus datos" |
| R2 | S · "todo campo de negocio de User es obligatorio, incluidos telefono y fecha de nacimiento" | I · "rechaza el alta si falta un campo obligatorio" (una vuelta por cada una de las 9 columnas) |
| R3 | S · "User y Role tienen id uuid con default generado" | I · "cambiar los datos de negocio del usuario no cambia su identificador" (anadido en la ronda 2 por m3: cambia `email` y `phone` y relee **por `document_number`, no por el id**, que seria tautologico) |
| R4 | M · "el indice unico de correo es sobre lower(email)" | I · "rechaza un correo repetido exacto" · I · "rechaza un correo repetido aunque cambie el uso de mayusculas" |
| R5 | M · "el indice unico de username es sobre lower(username)" | I · "rechaza un nombre de usuario repetido exacto" · I · "rechaza un nombre de usuario repetido aunque cambie el uso de mayusculas" |
| R6 | M · "el indice unico de documento es compuesto por tipo y numero" | I · "rechaza el mismo tipo y numero de documento repetidos" |
| R7 | M · "el indice unico de documento es compuesto por tipo y numero" | I · "acepta el mismo numero de documento con tipo distinto" |
| R8 | S · "document_type_code es FK a document_types y no hay enum" | I · "rechaza un tipo de documento fuera del catalogo" |
| R9 | M · "la migracion inserta CC como unico tipo de documento" | I · "el catalogo arranca solo con CC" |
| R10 | S · "el tipo de documento no es enum ni check, es tabla" | I · "anadir un tipo nuevo deja intactos los usuarios ya guardados" |
| R11 | G1 · "ninguna columna ni campo guarda la contrasena en claro" | — (guardia estatica; design 9) |
| R12 | S · "passwordHash es String sin longitud declarada" · M · "password_hash es TEXT sin longitud" | I · el caso que guarda un `password_hash` de **10.000 caracteres** y lo relee entero (corregido en la ronda 2 por m4: la tabla ponia "—" e infravaloraba la cobertura real) |
| R13 | S · "Role declara name y description obligatorios" | I · "crea un rol con nombre y descripcion" |
| R14 | M · "roles tiene un indice unico sobre name" | I · "rechaza un segundo rol con el mismo nombre" |
| R15 | S · "roleId es obligatorio y FK a Role" | I · "rechaza un usuario sin rol o con rol inexistente" |
| R16 | S · "roleId no tiene restriccion de unicidad" | I · "acepta varios usuarios con el mismo rol" |
| R17 | S · "la relacion User-Role declara onDelete Restrict" · S · "Role no tiene deletedAt" | I · "rechaza borrar un rol con usuarios asignados" · I · "rechaza borrar un rol cuyo unico usuario esta borrado logicamente" |
| R18 | — | I · "permite borrar un rol sin usuarios asignados" |
| R19 | G2 · "toda tabla creada tiene RLS activado y forzado" | — (design 9: un test de RLS con Prisma sale verde pase lo que pase) |
| R20 | M · "down.sql revierte exactamente lo que crea migration.sql" · M · "el rollback aplica el down.sql y ademas deja `_prisma_migrations` sin la fila de la migracion" · M · "el rollback ya no depende de prisma migrate resolve --rolled-back, que devuelve P3012" | T12 · ciclo apply -> rollback -> apply **ejecutado y limpio**, esquema y `_prisma_migrations` coherentes. Salida en la seccion 5. |
| R21 | S · "User declara deletedAt opcional" | I · "el borrado logico conserva la fila y marca deleted_at" |
| R22 | M · "los tres indices unicos son parciales con WHERE deleted_at IS NULL" | I · "permite re-alta con el correo, username y documento de un usuario borrado" |
| R23 | M · "los tres indices unicos son parciales con WHERE deleted_at IS NULL" | I · "admite dos usuarios borrados que comparten correo y documento" |
| R24 | S · "User y Role declaran createdAt y updatedAt" | I · "created_at y updated_at se rellenan solos y updated_at cambia al modificar" |

**Ningun R1-R24 se quedo sin test ejecutado, y R20 ya no esta a medias:** sus tres tests estaticos
estan en verde y su mitad "contra base real" (T12) se ejecuto entera, con `_prisma_migrations`
coherente en cada paso del ciclo.

Tests de sensibilidad anadidos sobre lo que pedia `tasks.md`, para que la trazabilidad no sea
decorativa: M comprueba que sus propios asserts caen si alguien quita el `lower(...)` o el
`WHERE deleted_at IS NULL`; G1 y G2 comprueban que detectan una columna en claro introducida a
proposito y una tabla sin `FORCE`, y que no se conforman con un RLS puesto en un comentario.

## 4. Salida real del gate

Regla de `AGENTS.md > Regla del gate`: el implementer NO corre la suite completa. Corrido **tras
las correcciones de la ronda 2**:

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
    lib/prisma.ts lib/types/identity.ts scripts/db-rollback.ts tests/unit/schema/identity-schema.test.ts
    tests/unit/schema/identity-migration.test.ts tests/guards/guard-password-never-plaintext.test.ts
    tests/guards/guard-rls-force.test.ts tests/integration/identity-constraints.int.test.ts

 RUN  v4.1.10 C:/Users/Cristian/Documents/trabajo/arc/labs/.worktrees/1-modelo-usuarios-y-roles

 Test Files  5 passed (5)
      Tests  57 passed (57)
   Start at  08:10:59
   Duration  956ms (transform 51ms, setup 0ms, import 527ms, tests 456ms, environment 1ms)

=== EXIT: 0 ===
```

`scripts/db-rollback.ts` no lo selecciona el grafo de imports (ningun test lo importa: se vigila
estaticamente como texto, que es justo lo que `docs/verification.md` avisa que `--rapido` no cubre).

Detalle por test (`--reporter=verbose`) de la corrida anterior a la ronda 2, cuando eran 54: en
verde uno a uno, con los nombres de la tabla de la seccion 3. Los 22 de integracion de entonces,
literal (en la ronda 2 se les sumo el caso de R3, que va el primero del bloque "estructura del
usuario"):

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

## 5. T12 cerrada — el ciclo apply -> rollback -> apply, ejecutado de verdad

**Historia corta.** En la ronda 1 esto era un bloqueo de spec: `design.md > 8`, `tasks.md > T2` y
`docs/architecture.md > Migraciones up/down` mandaban `prisma migrate resolve --rolled-back`, que
**solo admite migraciones en estado fallido** y devuelve `P3012` sobre una aplicada con exito. El
`down.sql` se aplicaba, pero `_prisma_migrations` quedaba diciendo "aplicada, no revertida" y
`db:migrate` ya no reaplicaba nada. Se escalo en vez de parchearlo, porque era cambio de spec.

**Decision del humano (2026-08-06): opcion 2, el `DELETE`.** Tras aplicar el `down.sql`,
`scripts/db-rollback.ts` hace `DELETE FROM "_prisma_migrations" WHERE migration_name = $1`. Se
descartaron explicitamente la opcion 1 (`UPDATE` de `rolled_back_at`) y la opcion 3 (intentar el
comando de Prisma y caer al fallback ante `P3012`), esta ultima pese a ser la que recomendaba el
reviewer. **Coste aceptado por el humano: se pierde el rastro historico de que esa migracion llego
a aplicarse.** Queda escrito aqui para que nadie lo lea despues como un descuido.

Decision de implementacion, no de spec: el `DELETE` va **en la misma transaccion** que el
`down.sql`. El DDL de Postgres es transaccional, asi que o se revierte todo o no se revierte nada;
en dos pasos separados es exactamente como se llega a la incoherencia que causo el rechazo.

Spec y docs actualizados para que digan lo que el codigo hace de verdad: `design.md > 8`,
`tasks.md > T2` y **solo** la viñeta 4 de `docs/architecture.md > Migraciones up/down`.

### Salida real del ciclo (sin la cadena de conexion)

```
> pnpm run db:migrate            # estado de partida: YA APLICADA
1 migration found in prisma/migrations
No pending migrations to apply.                                   === EXIT: 0 ===

> pnpm run db:rollback
db:rollback: aplicando down.sql de 20260806122638_users_and_roles y borrando su fila de _prisma_migrations
db:rollback: 20260806122638_users_and_roles revertida.            === EXIT: 0 ===

> comprobacion del estado tras el rollback
tablas en public: _prisma_migrations
_prisma_migrations: (0 filas)                                     === EXIT: 0 ===
   (users, roles y document_types NO existen)

> pnpm exec prisma migrate status
1 migration found in prisma/migrations
Following migration have not yet been applied:
20260806122638_users_and_roles
To apply migrations in development run prisma migrate dev.        === EXIT: 1 ===  (pendiente, correcto)

> pnpm run db:migrate
Applying migration `20260806122638_users_and_roles`
The following migration(s) have been applied:
migrations/
  └─ 20260806122638_users_and_roles/
    └─ migration.sql
All migrations have been successfully applied.                    === EXIT: 0 ===

> comprobacion del esquema reaplicado
tablas en public: _prisma_migrations, document_types, roles, users
_prisma_migrations: [{"migration_name":"20260806122638_users_and_roles","finished":true,"rolled_back":false}]
indice: CREATE UNIQUE INDEX users_document_unique ON public.users USING btree (document_type_code, document_number) WHERE (deleted_at IS NULL)
indice: CREATE UNIQUE INDEX users_email_unique ON public.users USING btree (lower(email)) WHERE (deleted_at IS NULL)
indice: CREATE UNIQUE INDEX users_username_unique ON public.users USING btree (lower(username)) WHERE (deleted_at IS NULL)
document_types: [{"code":"CC","name":"Cedula de ciudadania","is_active":true}]
rls document_types: enable=true force=true
rls roles: enable=true force=true
rls users: enable=true force=true                                 === EXIT: 0 ===
```

El script de comprobacion fue temporal y esta borrado: no queda en el arbol.

**Esto cierra T12 y con ella R20 en su forma real**, no solo a nivel de esquema: las tres tablas
se van y vuelven, y `_prisma_migrations` queda coherente en los dos extremos del ciclo.

Para que no vuelva a depender de que alguien lo corra a mano (punto 4 opcional del reviewer), hay
dos tests estaticos nuevos en `tests/unit/schema/identity-migration.test.ts` que leen
`scripts/db-rollback.ts` como texto y exigen que borre la fila de `_prisma_migrations` y que ya no
dependa de `prisma migrate resolve --rolled-back`.

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

### Deuda de la ronda 2 (el reviewer pidio documentarla, no arreglarla)

7. **m1 — el `FORCE ROW LEVEL SECURITY` es inerte en esta maquina, y de que depende en produccion
   no esta escrito en ningun sitio.** El rol local de conexion es `postgres`, superusuario con
   BYPASSRLS: RLS no se le aplica aunque este forzado, y por eso los tests de integracion pueden
   escribir. R19 se cumple tal como esta redactado (el `FORCE` esta en el SQL y en la base) y esto
   **no** invalida ningun test, pero hay una consecuencia real que hay que verificar antes del
   primer deploy: con `FORCE` y **cero policies**, que la aplicacion funcione en produccion depende
   de que el rol con el que Prisma se conecte tenga BYPASSRLS. **Si no lo tiene, toda query de la
   app devuelve vacio o falla.** `design.md > 9` describe el `FORCE` como deny-by-default para las
   vias que no son Prisma, pero no deja escrito de que privilegio depende que Prisma si pase.
   **Accion pendiente, de otra feature o del despliegue:** comprobarlo en el proyecto de Supabase y
   anotarlo en `docs/architecture.md > Acceso a datos y autorizacion`. No se toco nada por esto.
8. **m5 — deuda ya conocida, confirmada por el reviewer:** Prisma fijado a la mayor 6 (punto 1) y
   `typecheck` fragil en maquina limpia por `LayoutProps` (punto 5). Sin cambios.

### Archivos de spec y docs modificados en la ronda 2

Cambiar la spec no es cosa del implementer salvo cuando el codigo ya no dice lo mismo que ella. Se
toco lo minimo y solo lo autorizado:

- `specs/1-modelo-usuarios-y-roles/design.md` §8 y `tasks.md > T2`: el paso 2 del rollback pasa a
  ser el `DELETE`, con el porque del descarte de `prisma migrate resolve --rolled-back` (`P3012`) y
  el coste aceptado.
- `specs/1-modelo-usuarios-y-roles/tasks.md`: T12 marcada `[x]`; tabla de trazabilidad corregida en
  R12 (m4) y R3 (m3).
- `docs/architecture.md > Migraciones up/down`: **solo la viñeta 4**, la que mandaba un comando que
  no puede funcionar. El resto del documento, intacto (verificado con `git diff`).
- `progress/impl_modelo-usuarios-y-roles.md`: **borrado** (m2). El nombre canonico es este archivo.
