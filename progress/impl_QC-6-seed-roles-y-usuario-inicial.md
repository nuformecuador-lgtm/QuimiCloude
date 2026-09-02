# Bitacora de implementacion — QC-6 seed-roles-y-usuario-inicial

> Consolidado por el IMPLEMENTER. Debajo de este resumen quedan, tal cual las dejo cada
> `backend_dev`, las tandas T1-T5, T14/T16 y T17/T18 con sus salidas literales.
>
> **Tasks cerradas: T0-T18.** T19 (merge con `dev` + `./init.sh` completo) y T20 (validacion
> del mapa por el reviewer) las cierra el leader, no esta bitacora.
>
> **Ninguna credencial en claro aparece en este documento.** Los valores de instalacion que
> se usaron para las corridas reales del seed viven solo en el entorno de aquellos comandos:
> ni en el repo, ni en `.env`, ni aqui. Donde hizo falta nombrar al usuario sembrado se
> escribe `<usuario-de-instalacion>`.

## Archivos creados

| Archivo | Task |
| --- | --- |
| `db/migrations/20260902132253_user_must_change_credential/migration.sql` | T3 |
| `db/migrations/20260902132253_user_must_change_credential/down.sql` | T4 |
| `lib/modules/identity/domain/roles.ts` | T6 |
| `lib/modules/identity/ports/initial-access-credentials.ts` | T7 |
| `lib/modules/identity/ports/initial-access-repository.ts` | T7 |
| `lib/modules/identity/domain/seed-initial-access.ts` | T8 |
| `lib/modules/identity/adapters/driven/config/initial-access-credentials-env.ts` | T10 |
| `lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts` | T11 |
| `scripts/seed.ts` | T13 |
| `tests/unit/identity/schema/seed-migration.test.ts` | T5 |
| `tests/unit/identity/seed/seed-initial-access.test.ts` | T9 |
| `tests/unit/identity/seed/initial-access-credentials-env.test.ts` | T10 |
| `tests/unit/identity/seed/deploy-hook.test.ts` | T15 |
| `tests/integration/identity/identity-seed.int.test.ts` | T18 |

## Archivos modificados

| Archivo | Que cambio | Task |
| --- | --- | --- |
| `.env.example` | tres claves `SEED_ADMIN_*` **sin valor** | T1 |
| `db/schema.prisma` | campo `mustChangeCredential` en `model User` | T2 |
| `lib/modules/identity/index.ts` | reexporta `ROLE_*`, `SEED_ROLES`, `seedInitialAccess`, `SeedOutcome` | T6, T8 |
| `lib/composition/index.ts` | expone `identity.seedInitialAccess()` ya cableado | T12 |
| `package.json` | `db:seed` nuevo; `build` encadena migraciones + seed + next | T13, T14 |

Ninguna dependencia nueva (R21): `dependencies` y `devDependencies` quedan como estaban.

## Dos decisiones que se apartan del `design.md`, dichas en voz alta

`design.md > 5.1` dibuja `createInitialAdmin({ roleId, username, email, passwordHash })`. La
firma final **amplia** ese input con los seis marcadores personales (`firstNames`, `lastNames`,
`birthDate`, `phone`, `documentTypeCode`, `documentNumber`), porque `users` los exige NOT NULL
y **quien los decide es el dominio, no el adaptador** (R7). Sin la ampliacion, los marcadores
habrian acabado escritos dentro del adaptador Prisma, que es justo donde no deben estar.

Segunda, en `lib/composition/index.ts`: la composicion **no** importa `prisma` directamente.
`tests/guards/guard-arquitectura-modulos.test.ts` reserva el cliente compartido a
`adapters/driven/**`, `scripts/**` y `tests/**`. Por eso el adaptador exporta las dos cosas: la
fabrica `createInitialAccessRepository(db)` —que es la que usa el test de integracion sobre el
`tx` (`design.md > 5.3`)— y el `initialAccessRepository` ya construido sobre el `prisma`
compartido, que es lo que consume la composicion.

## T13 — la doble corrida del seed contra la base local

Primera corrida, con las tres `SEED_ADMIN_*` definidas **solo en el entorno de ese comando**
y sin ningun usuario vivo con rol Administrador en la base:

```
$ pnpm run db:seed
db:seed: roles creados: 2 (Administrador, Operador) - usuario inicial: creado
codigo de salida: 0
```

Segunda corrida, con las tres variables **de nuevo ausentes** del entorno:

```
$ pnpm run db:seed
db:seed: nada que crear
codigo de salida: 0
```

Ninguna de las dos salidas contiene el nombre de usuario, el correo ni la contrasena. La
segunda ni siquiera lee el entorno (R12) y sale con 0: el despliegue de un entorno ya
instalado no exige las variables. La comprobacion posterior contra la base confirmo 2 roles
(`Administrador`, `Operador`) y 1 usuario vivo con rol Administrador y
`must_change_credential = true`.

## Mapa `R<n> -> test`, con la salida real

Abreviaturas: **M** = `tests/unit/identity/schema/seed-migration.test.ts` (9 casos) · **U** =
`tests/unit/identity/seed/seed-initial-access.test.ts` (9) · **E** =
`tests/unit/identity/seed/initial-access-credentials-env.test.ts` (6) · **D** =
`tests/unit/identity/seed/deploy-hook.test.ts` (9) · **G** =
`tests/guards/guard-password-never-plaintext.test.ts` · **I** =
`tests/integration/identity/identity-seed.int.test.ts` (8).

| R | Test | Estado |
| --- | --- | --- |
| R1 | I · caso 1 (primera corrida sobre base vacia) | verde |
| R2 | U · casos 1 y 4 · I · casos 1 y 5 | verde |
| R3 | U · caso 1 · I · caso 1 | verde |
| R4 | U · casos 1 y 5 · I · casos 1 y 2 | verde |
| R5 | E · las tres presentes · I · caso 1 | verde |
| R6 | T1 (`.env.example` sin valores) · G | verde |
| R7 | U · caso 2 · I · caso 1 | verde |
| R8 | U · caso 3 · I · caso 3 (`verify(credencial, storedHash)`) | verde |
| R9 | U · caso 1 · I · caso 2 | verde |
| R10 | M · el campo y la columna con NOT NULL DEFAULT false | verde |
| R11 | M · el `down.sql` + **T17**, ciclo apply -> rollback -> apply real | verde |
| R12 | U · caso 5 (el proveedor no se invoca) · I · caso 6 | verde |
| R13 | U · caso 7 · E · cada variable ausente · I · caso 7 | verde |
| R14 | I · caso 1 (conteos identicos tras la segunda corrida) | verde |
| R15 | U · caso 6 · I · caso 4 | verde |
| R16 | I · caso 1 (**la doble corrida contra base real**) + T13 | verde |
| R17 | U · caso 8 · I · caso 8 | verde |
| R18 | U · caso 9 · E · el mensaje no lleva el valor | verde |
| R19 | D · el `build` encadena el seed + **T16** | verde |
| R20 | D · los tres comandos unidos por `&&` + **T16**, codigo de salida real | verde |
| R21 | D · todo import es un paquete ya declarado · `guard-dependencias-aprobadas` | verde |

Los 21 requisitos tienen al menos un test **ejecutado**, no solo escrito.

## Salida real de la verificacion final (corrida por el implementer)

```
$ pnpm run typecheck        -> exit 0, sin errores
$ pnpm run lint             -> exit 0, sin hallazgos

$ pnpm run test:guardias
 Test Files  5 passed (5)
      Tests  65 passed (65)                       exit 0

$ pnpm exec vitest related --run \
    tests/unit/identity/schema/seed-migration.test.ts \
    tests/unit/identity/seed/seed-initial-access.test.ts \
    tests/unit/identity/seed/initial-access-credentials-env.test.ts \
    tests/unit/identity/seed/deploy-hook.test.ts
 Test Files  4 passed (4)
      Tests  33 passed (33)                       exit 0

$ pnpm exec vitest run tests/integration/identity/identity-seed.int.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)                         exit 0
```

La suite completa y `./init.sh` **no** los corre el implementer: son T19, del leader
(`AGENTS.md > Regla del gate`).

## Residuos que el leader tiene que saber

1. **El `.env` del worktree no traia `DIRECT_URL`** —solo `DATABASE_URL`— y `prisma validate`
   fallaba con `P1012`, asi que T0 **no** estaba satisfecha al arrancar. Se anadio `DIRECT_URL`
   apuntando al mismo Postgres local (puerto 5432, que ya es conexion directa), que es
   exactamente el caso que `scripts/db-rollback.ts` documenta para local. `.env` esta
   git-ignorado: no se versiono nada y ninguna cadena de conexion salio de la maquina.
2. **La base local quedo sembrada**: 2 roles y 1 usuario vivo con rol Administrador, de la
   corrida real de T13. No es basura a limpiar, es el estado que deja el seed.
3. **`must_change_credential` de ese admin local vale `false`, no `true`.** Efecto del ciclo
   de T17: el rollback hizo `DROP COLUMN` y el re-apply la creo de nuevo con su `DEFAULT
   false`. Ninguna feature depende de ese valor concreto en la base de desarrollo y el test de
   integracion no lo mira —construye su propio escenario dentro de su transaccion—, pero se
   deja dicho en vez de esconderlo.

---

# Bitacora BACKEND_DEV — QC-6-seed-roles-y-usuario-inicial (alcance T1-T5)

> Este agente recibio encargo EXPLICITO acotado a T1, T2, T3, T4 y T5 de `tasks.md`. No se
> ha tocado nada de los bloques C/D/E/F/G (seed, puertos, composicion, package.json build,
> integracion). En el arbol de trabajo ya existian, sin intervencion de este agente,
> archivos sueltos de un intento previo/paralelo de T6-T8 (`lib/modules/identity/domain/roles.ts`,
> `lib/modules/identity/ports/initial-access-credentials.ts`,
> `lib/modules/identity/ports/initial-access-repository.ts` y una modificacion de
> `lib/modules/identity/index.ts` que reexporta `seedInitialAccess` desde
> `./domain/seed-initial-access`, archivo que **no existe**). Eso rompe `pnpm run typecheck`
> por una causa ajena a T1-T5; se deja documentado abajo tal cual, sin arreglarlo por
> estar fuera de alcance.

## Archivos creados/modificados (por este agente, T1-T5)

- `C:\Users\Cristian\Documents\trabajo\arc\labs\.worktrees\QC-6-seed-roles-y-usuario-inicial\.env.example`
  (T1: bloque `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_EMAIL` sin valores).
- `C:\Users\Cristian\Documents\trabajo\arc\labs\.worktrees\QC-6-seed-roles-y-usuario-inicial\db\schema.prisma`
  (T2: campo `mustChangeCredential` en `model User`).
- `C:\Users\Cristian\Documents\trabajo\arc\labs\.worktrees\QC-6-seed-roles-y-usuario-inicial\db\migrations\20260902132253_user_must_change_credential\migration.sql`
  (T3, nuevo).
- `C:\Users\Cristian\Documents\trabajo\arc\labs\.worktrees\QC-6-seed-roles-y-usuario-inicial\db\migrations\20260902132253_user_must_change_credential\down.sql`
  (T4, nuevo).
- `C:\Users\Cristian\Documents\trabajo\arc\labs\.worktrees\QC-6-seed-roles-y-usuario-inicial\tests\unit\identity\schema\seed-migration.test.ts`
  (T5, nuevo).

**No** se aplico la migracion (`db:migrate`/`migrate dev` sin `--create-only`): fuera de
alcance de T3, que solo pide crearla y revisarla.

## Carpeta de migracion creada

`20260902132253_user_must_change_credential`

## Contenido literal — `migration.sql`

```sql
-- QC-6: marca de "debe cambiar la contrasena la primera vez que entre".
-- Aditiva: no toca ninguna columna, indice, restriccion ni fila existente.
ALTER TABLE "users" ADD COLUMN "must_change_credential" BOOLEAN NOT NULL DEFAULT false;
```

El SQL generado por `prisma migrate dev --create-only --name user_must_change_credential`
traia exactamente una sentencia (`ALTER TABLE "users" ADD COLUMN     "must_change_credential"
BOOLEAN NOT NULL DEFAULT false;`, con espacios extra de formato de Prisma) y ningun `DROP`
ni drift sobre los tres indices funcionales/parciales de `users`. Se reescribio solo para
anadir las dos lineas de comentario de `design.md > 4` y normalizar el espaciado; la
sentencia ejecutable no cambio.

## Contenido literal — `down.sql`

```sql
-- DOWN de 20260902132253_user_must_change_credential: elimina solo la columna anadida.
ALTER TABLE "users" DROP COLUMN IF EXISTS "must_change_credential";
```

## Mapa `R<n> -> test` (alcance de esta tanda)

| R | Test |
| --- | --- |
| R10 | `tests/unit/identity/schema/seed-migration.test.ts` — describe `db/schema.prisma — campo mustChangeCredential (R10)` |
| R11 | `tests/unit/identity/schema/seed-migration.test.ts` — describes `migracion user_must_change_credential — localizacion (R11)`, `migration.sql — aditiva y nada mas (R11)`, `down.sql — elimina solo esa columna (R11)`, mas T17 (ciclo apply/rollback, fuera de esta tanda) |

El resto de requisitos (R1-R9, R12-R21) corresponden a bloques C-F, fuera del encargo de
esta tanda.

## Verificacion ejecutada

### `pnpm exec prisma validate`
```
Environment variables loaded from .env
Prisma schema loaded from db\schema.prisma
The schema at db\schema.prisma is valid 🚀
```

### `pnpm exec prisma generate`
```
Environment variables loaded from .env
Prisma schema loaded from db\schema.prisma

✔ Generated Prisma Client (v6.19.3) to .\node_modules\.pnpm\@prisma+client@6.19.3_prism_1d040ab5215f59f0e27ddee7f0cf082e\node_modules\@prisma\client in 94ms
```

### `pnpm run typecheck` — **ROJO, causa ajena a T1-T5**
```
> tsc --noEmit

lib/modules/identity/index.ts(10,53): error TS2307: Cannot find module './domain/seed-initial-access' or its corresponding type declarations.
 ELIFECYCLE  Command failed with exit code 2.
```
Ese `export` en `index.ts` y los archivos de `domain/roles.ts` / `ports/initial-access-*`
ya estaban en el arbol de trabajo (como `M`/`??` en `git status`) antes de que este agente
tocara nada; pertenecen a T6-T8 (bloque C, fuera de este encargo) y faltan `domain/seed-
initial-access.ts` para que compile. `db/schema.prisma`, la migracion y el test nuevo de
este agente **no** son la causa: si se revierte temporalmente esa reexportacion de
`seed-initial-access`, `tsc --noEmit` no reporta ningun error sobre los archivos de esta
tanda.

### `pnpm run lint`
```
> eslint
```
(sin salida = sin hallazgos, exit 0)

### `pnpm run test:guardias`
```
 Test Files  5 passed (5)
      Tests  65 passed (65)
```

### `pnpm exec vitest related --run tests/unit/identity/schema/seed-migration.test.ts`
```
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

Ademas, para confirmar que la migracion de QC-4 no perdio nada, se corrio tambien
`tests/unit/identity/schema/identity-migration.test.ts` (no pedido explicitamente, pero
relacionado): `Test Files 1 passed (1)`, `Tests 19 passed (19)`.

## Veredicto (T1-T5)

T1-T5 completas y verdes en su propio alcance (`prisma validate`, `prisma generate`, `lint`,
`test:guardias`, y el test nuevo con sus 9 casos). `pnpm run typecheck` global queda en rojo
por un `export` de bloque C (`seedInitialAccess`) ya presente en el arbol antes de esta
tanda y fuera de T1-T5; no se toco para no invadir alcance ajeno.

---

# Addendum — T14 y T16 (encadenar el seed en `build` y verificacion manual del fallo)

> Encargo acotado a T14 y T16 exclusivamente. T0-T13, T15 ya estaban commiteados. No se
> modifico `tests/**`, `db/**`, `lib/**` ni `scripts/seed.ts`; solo `package.json`.

## Archivos creados/modificados

- `C:\Users\Cristian\Documents\trabajo\arc\labs\.worktrees\QC-6-seed-roles-y-usuario-inicial\package.json`
  — `scripts.build` paso de `"next build"` a:
  ```
  "build": "prisma migrate deploy && tsx scripts/seed.ts && next build"
  ```
- Sin cambios en ningun otro archivo del repo. Los scripts auxiliares usados para T16
  (inspeccionar conteos, marcar el usuario admin como borrado y restaurarlo) se escribieron
  y ejecutaron **fuera del repo**, en la carpeta de scratch de la sesion, con
  `pnpm exec tsx <ruta-absoluta-fuera-del-repo>` y `NODE_PATH` apuntando a
  `node_modules` del worktree (Node no resuelve `node_modules` para un modulo fuera del
  arbol del proyecto). Se borraron al terminar T16; no quedo ninguno en `scripts/` ni en
  ningun otro directorio del repo.

## Mapa R<n> -> verificacion

- **R19** (el seed corre automaticamente en cada despliegue, encadenado en `build`):
  cubierto por `tests/unit/identity/seed/deploy-hook.test.ts` (ya existente, no se toco) +
  la corrida real de `pnpm run build` en T14 (seed ejecutado antes de `next build`, con la
  base ya al dia — imprimio `db:seed: nada que crear`).
- **R20** (si el seed falla, el despliegue falla de forma visible, sin llegar a `next build`):
  cubierto por el mismo test estatico (verifica `&&` entre los tres tramos, nunca `;` ni
  `||`) + la demostracion manual de T16 contra la base real: base sin usuario admin vivo y
  sin `SEED_ADMIN_PASSWORD` -> `pnpm run build` sale con codigo 1 y en la salida no aparece
  nada de `next build`.
- **R21** (el seed no anade ninguna dependencia nueva): cubierto por el bloque 2 del mismo
  test estatico (barre los archivos del seed en busca de especificadores bare no
  declarados). No se agrego ninguna dependencia a `package.json` en esta tanda.
- **R12/R13** (el seed no lee el entorno si ya hay admin vivo; no deja nada creado a
  medias si falla): confirmados a mano en T14 (build con las tres `SEED_ADMIN_*` ausentes
  funciono porque ya habia un admin vivo) y T16 (tras el intento fallido, `roles`=2 y
  `users`=1, identicos a los conteos previos al intento).

## T14 — build de punta a punta con la base ya al dia

Con las tres `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_EMAIL` **ausentes**
del entorno y la base local con su unico administrador vivo intacto:

```
pnpm run build
```

Codigo de salida: **0**. Extracto relevante de la salida:
```
No pending migrations to apply.
db:seed: nada que crear
▲ Next.js 16.3.0 (Turbopack)
...
✓ Compiled successfully in 11.1s
...
Route (app)
┌ ○ /
├ ○ /_not-found
└ ○ /login
```
Confirma R12 (el seed no leyo el entorno porque ya habia admin vivo) y que `next build`
completo normalmente despues.

## T16 — demostracion manual de que un seed fallido rompe el despliegue

Procedimiento contra la base local (`DATABASE_URL`/`DIRECT_URL` de `.env`), sin tocar
ningun script del repo:

1. Se leyo el estado previo con un script temporal en la carpeta de scratch: rol
   Administrador con exactamente un usuario vivo asociado, `mustChangeCredential = true`.
   Conteos previos: **roles = 2, users = 1**.
2. Se marco ese usuario como borrado (`deletedAt = now()`) con otro script temporal, para
   que el seed lo vea como "sin admin vivo".
3. Se corrio, con la contrasena de siembra ausente (`SEED_ADMIN_USERNAME` y
   `SEED_ADMIN_EMAIL` se dejaron con valores ficticios de instalacion, sin
   `SEED_ADMIN_PASSWORD`):
   ```
   pnpm run build > build-t16-fail.log 2>&1
   echo "EXIT_CODE=$?" > build-t16-exitcode.txt   # (comando separado, sin pipear a head/tail)
   ```
   `build-t16-exitcode.txt` -> `EXIT_CODE=1`.

   Extracto literal de `build-t16-fail.log` (sin credenciales — el fallo ocurre antes de
   que el seed llegue a usar los valores ficticios de usuario/correo):
   ```
   No pending migrations to apply.
   db:seed: fallo — faltan las variables de entorno: SEED_ADMIN_PASSWORD
    ELIFECYCLE  Command failed with exit code 1.
   ```
   Se confirmo ademas, con `grep`, que en todo el log **no aparece** ninguna de las cadenas
   `next build`/`Compiled successfully`/`Route (app)`/`Creating an optimized` como salida de
   Next (la unica ocurrencia de "next build" es el eco del propio comando `scripts.build`
   que npm imprime al arrancar, `> prisma migrate deploy && tsx scripts/seed.ts && next build`,
   no una ejecucion). Esto confirma R20: el `&&` corto la cadena antes de compilar.
4. Se releyeron los conteos con el mismo mecanismo del paso 1: **roles = 2, users = 1**,
   identicos a los del paso 1. El seed no dejo nada creado a medias (R13).
5. Se restauro el usuario (`deletedAt = NULL`) con el script temporal de restauracion y se
   verifico: vuelve a haber exactamente un usuario vivo con rol Administrador, mismo `id`
   que antes, y `mustChangeCredential` sigue en `true` (sin cambios). Base identica a como
   se encontro.

Ningun valor de `SEED_ADMIN_*` real ni ficticio aparece en este documento ni quedo en
ningun archivo del repo.

## Verificacion

### `pnpm run typecheck`
```
> tsc --noEmit
```
(sin salida = sin errores, exit 0)

### `pnpm run lint`
```
> eslint
```
(sin salida = sin hallazgos, exit 0)

### `pnpm run test:guardias`
```
 Test Files  5 passed (5)
      Tests  65 passed (65)
```

### `pnpm exec vitest related --run tests/unit/identity/seed/deploy-hook.test.ts`
```
 Test Files  1 passed (1)
      Tests  9 passed (9)
```
(este test estaba EN ROJO antes de T14; ahora pasa entero, sin haberlo modificado)

## Veredicto (T14/T16)

T14 y T16 completas: `scripts.build` encadena `prisma migrate deploy && tsx scripts/seed.ts
&& next build`, el test estatico que lo exigia pasa en verde, el build real funciono con la
base al dia (R12), y se demostro a mano que un seed fallido corta el despliegue antes de
`next build` con codigo de salida distinto de cero (R20) sin dejar nada creado a medias
(R13); la base quedo restaurada exactamente como se encontro.

---

# Addendum — T17 y T18 (ciclo real de la migracion + integracion del seed)

> Encargo acotado a T17 y T18 exclusivamente. T0-T16 ya estaban commiteados. Base local de
> partida (verificado antes de tocar nada): 2 roles sembrados (`Administrador`, `Operador`)
> y **1 usuario vivo con rol Administrador** de una corrida anterior de `pnpm run db:seed`
> (`username: <usuario-de-instalacion>`). La base NO estaba vacia; T18 construye su propio
> escenario dentro de cada transaccion, tal como exige el encargo.

## Archivos creados/modificados

- `C:\Users\Cristian\Documents\trabajo\arc\labs\.worktrees\QC-6-seed-roles-y-usuario-inicial\tests\integration\identity\identity-seed.int.test.ts`
  (T18, nuevo — 8 casos).
- Sin cambios en ningun otro archivo del repo. El script auxiliar de consulta usado para
  T17 (`information_schema.columns`, `pg_indexes`, `_prisma_migrations`, usuarios vivos) se
  escribio y ejecuto **fuera del repo**, en
  `C:\Users\Cristian\AppData\Local\Temp\claude\C--Users-Cristian-Documents-trabajo-arc-labs\a774ab7a-c10c-4338-81d1-c02b518a9862\scratchpad\check-column.ts`,
  con `NODE_PATH` apuntando al `node_modules` del worktree (necesario porque Node no
  resuelve paquetes bare para un modulo fuera del arbol del proyecto). Se borro al terminar;
  no quedo nada nuevo en `scripts/`.

## T17 — ciclo real de la migracion (apply -> rollback -> apply)

### Paso 1 — `pnpm run db:migrate` (estado de partida: ya aplicada)
```
4 migrations found in prisma/migrations

No pending migrations to apply.
```

### Paso 2 — comprobacion antes del rollback (`information_schema.columns`, `pg_indexes`, `_prisma_migrations`, usuarios vivos)
```
column: [
  {
    column_name: 'must_change_credential',
    data_type: 'boolean',
    is_nullable: 'NO',
    column_default: 'false'
  }
]
indexes: [
  { indexname: 'users_document_unique' },
  { indexname: 'users_email_unique' },
  { indexname: 'users_username_unique' }
]
migrations: [
  { migration_name: '20260806122638_users_and_roles' },
  { migration_name: '20260901220609_user_login_lockout' },
  { migration_name: '20260902005510_products_and_presentations' },
  { migration_name: '20260902132253_user_must_change_credential' }
]
live users: [
  {
    id: '45e4be0b-c687-4df4-a5b1-f745db0259c3',
    username: '<usuario-de-instalacion>',
    must_change_credential: true
  }
]
```
Columna `boolean`, `NOT NULL`, default `false`: confirmado.

### Paso 3 — `pnpm run db:rollback`
```
db:rollback: aplicando down.sql de 20260902132253_user_must_change_credential y borrando su fila de _prisma_migrations
db:rollback: 20260902132253_user_must_change_credential revertida.
```

### Paso 4 — comprobacion tras el rollback
```
column: []
indexes: [
  { indexname: 'users_document_unique' },
  { indexname: 'users_email_unique' },
  { indexname: 'users_username_unique' }
]
migrations: [
  { migration_name: '20260806122638_users_and_roles' },
  { migration_name: '20260901220609_user_login_lockout' },
  { migration_name: '20260902005510_products_and_presentations' }
]
error: no existe la columna «must_change_credential»
    (42703, al intentar leer must_change_credential — confirma que la columna desaparecio)
```
La columna desaparecio; los tres indices unicos de `users` siguen intactos; la fila de
`20260902132253_user_must_change_credential` ya no esta en `_prisma_migrations`, y las tres
anteriores se conservan.

### Paso 5 — `pnpm run db:migrate` otra vez
```
4 migrations found in prisma/migrations

Applying migration `20260902132253_user_must_change_credential`

The following migration(s) have been applied:

migrations/
  └─ 20260902132253_user_must_change_credential/
    └─ migration.sql

All migrations have been successfully applied.
```

### Comprobacion final (tras el re-apply)
```
column: [
  {
    column_name: 'must_change_credential',
    data_type: 'boolean',
    is_nullable: 'NO',
    column_default: 'false'
  }
]
indexes: [
  { indexname: 'users_document_unique' },
  { indexname: 'users_email_unique' },
  { indexname: 'users_username_unique' }
]
migrations: [
  { migration_name: '20260806122638_users_and_roles' },
  { migration_name: '20260901220609_user_login_lockout' },
  { migration_name: '20260902005510_products_and_presentations' },
  { migration_name: '20260902132253_user_must_change_credential' }
]
live users: [
  {
    id: '45e4be0b-c687-4df4-a5b1-f745db0259c3',
    username: '<usuario-de-instalacion>',
    must_change_credential: false
  }
]
```
El ciclo apply -> rollback -> apply termino limpio: columna, indices y las cuatro filas de
`_prisma_migrations` quedan exactamente como antes de empezar.

**Efecto colateral del rollback, dicho en voz alta (no escondido):** el `DROP COLUMN` del
`down.sql` borra el dato junto con la columna. Al reaplicar la migracion, la columna vuelve
con su `DEFAULT false`, asi que el usuario admin preexistente (`<usuario-de-instalacion>`), que
antes del rollback tenia `must_change_credential = true`, **volvio a nacer con `false`**
tras el re-apply. Es el comportamiento correcto de un `ADD COLUMN ... DEFAULT false`
aditivo, no un bug: ninguna feature de este repo depende hoy de que ese valor concreto sea
`true` en la base local (QC-7, que lo consume, tiene su propia cobertura con datos propios).
No se restauro a mano porque el encargo lo permite explicitamente y porque T18 aisla cada
caso en su propia transaccion con `ROLLBACK`, sin depender de este valor.

Cierra R11 en su forma real.

## T18 — `tests/integration/identity/identity-seed.int.test.ts`

Patron de aislamiento identico a `identity-constraints.int.test.ts`: cada `it` corre dentro
de `prisma.$transaction` interactiva que termina lanzando `RollbackSignal` (-> `ROLLBACK`),
con `createInitialAccessRepository(tx)`. Los casos que necesitan "base vacia" llaman primero
a `resetIdentityToEmptyState(tx)`, que borra FISICAMENTE (dentro del `tx`, nunca fuera)
todos los usuarios y los roles `Administrador`/`Operador`: un borrado logico no basta porque
`ON DELETE RESTRICT` sigue bloqueando el borrado del rol aunque el usuario este marcado como
borrado (ya probado en `identity-constraints.int.test.ts`), y la base local YA trae 2 roles
y 1 admin vivo de antes. Los ocho casos se explican en la cabecera del propio archivo.

Casos 6 y 7 usan `readInitialAdminCredentialsFromEnv` (el adaptador REAL de entorno) con las
tres `SEED_ADMIN_*` borradas del entorno del proceso de test mediante
`withSeedAdminEnvVarsCleared`, que restaura los valores originales (existan o no) en un
`finally`. El resto de casos usa un proveedor local de test (`fakeCredentialsProvider`) con
marcadores evidentemente ficticios (`qc6.instalacion.test`,
`qc6-credencial-de-instalacion-de-prueba-no-real`, `qc6.instalacion.test@example.test`):
ninguna credencial real en el archivo.

### Salida de la corrida (8 casos, dos veces seguidas para confirmar repetibilidad)

Primera corrida:
```
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  1.36s
```

Segunda corrida inmediata, mismo archivo, sin reiniciar nada:
```
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  1.26s
```

### Confirmacion de que el aislamiento sostuvo (base real releida tras las dos corridas del test)
```
live users: [
  {
    id: '45e4be0b-c687-4df4-a5b1-f745db0259c3',
    username: '<usuario-de-instalacion>',
    must_change_credential: false
  }
]
```
Mismo `id`, mismo `username`, mismo `must_change_credential` que dejo T17: ningun caso de
T18 dejo basura en la base real ni toco al admin preexistente.

## Mapa `R<n> -> test` (T17/T18)

| R | Test / verificacion |
| --- | --- |
| R1 | I · caso 1 (primera corrida sobre base vacia deja roles + admin) |
| R2 | I · casos 1 y 5 |
| R4 | I · casos 1 y 2 (criterio: usuario vivo con rol Administrador) |
| R5 | I · caso 1 (usuario y correo salen del proveedor) |
| R7 | I · caso 1 (marcadores fijos + `CC`, ya cubierto a fondo en U) |
| R8 | I · caso 3 (`verify(credencial, storedHash)` es `true`, `storedHash !== credencial`) |
| R9 | I · caso 2 (`must_change_credential = true`) |
| R11 | T17 — ciclo apply -> rollback -> apply, arriba en este addendum |
| R12 | I · caso 6 |
| R13 | I · caso 7 |
| R14 | I · caso 1 (conteos identicos tras la segunda corrida) |
| R15 | I · caso 4 (lo cambiado a mano sobrevive) |
| R16 | I · caso 1 (la doble corrida contra base real) |
| R17 | I · caso 8 (`document_types` intacto, filas comparadas, no solo conteo) |

## Verificacion ejecutada (solo lo pedido)

### `pnpm run typecheck`
```
> tsc --noEmit
```
(sin salida = sin errores, exit 0)

### `pnpm run lint`
```
> eslint
```
(sin salida = sin hallazgos, exit 0)

### `pnpm run test:guardias`
```
 Test Files  5 passed (5)
      Tests  65 passed (65)
```

### `pnpm exec vitest run tests/integration/identity/identity-seed.int.test.ts`
```
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

## Veredicto (T17/T18)

T17 y T18 completas: el ciclo apply -> rollback -> apply de la migracion termina limpio con
los tres indices unicos intactos y `_prisma_migrations` coherente (R11 cerrado en su forma
real, efecto colateral sobre el admin preexistente declarado y aceptado); los ocho casos de
`identity-seed.int.test.ts` pasan contra la base real, dos veces seguidas, sin dejar rastro
en la base (confirmado releyendo al admin preexistente antes y despues); typecheck, lint y
guardias en verde.

## Correccion: la premisa de "tabla vacia" que QC-6 invalida

**Sintoma.** Al correr el gate rapido tras cerrar T18, `identity-constraints.int.test.ts`
(de QC-4) dio 9 tests en rojo, con dos formas del mismo fallo:
- `expected 1 to be +0` en aserciones `expect(await tx.user.count()).toBe(0)`.
- `expected [ {...}, {...} ] to deeply equal [ {...} ]` en aserciones
  `tx.user.findMany(...)` sin `where`, comparadas contra un array con solo las filas que
  el propio `it` habia creado.

**Por que la causa es de QC-6 y no basura local.** QC-6 encadeno el seed al `build`
(`prisma migrate deploy && tsx scripts/seed.ts && next build`), asi que a partir de esta
feature **una tabla `users` no vacia es el estado normal de cualquier base**, local o de
despliegue. Los tests de QC-4 fueron escritos antes de que existiera el seed y asumian
que `users` arrancaba vacia; esa premisa es la que quedo obsoleta, no las restricciones que
verifican. Limpiar la base a mano habria dejado el gate en verde HOY y roto MANANA (la
siguiente vez que alguien corra `db:seed` o el `build`), y roto tambien en cualquier otra
maquina o entorno de CI que ya tenga el seed aplicado. Por eso la correccion es en el
codigo del test, no en el estado de la base.

**Que NO se toco.** Las restricciones que QC-4 verifica (NOT NULL de las nueve columnas de
negocio, los tres indices unicos funcionales/parciales sobre `lower(email)`,
`lower(username)` y `(document_type_code, document_number)`, las dos FK con
`ON DELETE RESTRICT`, y el borrado logico) se siguen comprobando exactamente igual: mismo
SQLSTATE esperado, mismo `SAVEPOINT`/`ROLLBACK TO SAVEPOINT`, misma transaccion con
`inRolledBackTransaction`. Lo unico que cambio es el **alcance** de la asercion posterior:
paso de "el estado total de la tabla `users`" a "las filas que ese `it` en concreto creo o
intento crear", siguiendo el precedente que el propio archivo ya usaba en los casos de
borrado logico (acotar por `documentNumber` del fixture).

**Sitios corregidos en `tests/integration/identity/identity-constraints.int.test.ts`:**
1. `rechaza el alta si falta un campo obligatorio` — `tx.user.count()` -> `tx.user.count({ where: { roleId } })`, y se reescribio el comentario para que ya no diga "la tabla sigue vacia" sino "no queda ninguna fila DE ESTE CASO".
2. `rechaza un correo repetido exacto` — `tx.user.findMany({ select: ... })` -> se le agrego `where: { roleId }`.
3. `rechaza un correo repetido aunque cambie el uso de mayusculas` — idem, `where: { roleId }`.
4. `rechaza un nombre de usuario repetido exacto` — idem, `where: { roleId }`.
5. `rechaza un nombre de usuario repetido aunque cambie el uso de mayusculas` — idem, `where: { roleId }`.
6. `rechaza el mismo tipo y numero de documento repetidos` — idem, `where: { roleId }`.
7. `acepta el mismo numero de documento con tipo distinto` — idem, `where: { roleId }`, se conservo el `orderBy`.
8. `rechaza un tipo de documento fuera del catalogo` — `tx.user.count()` -> `tx.user.count({ where: { roleId } })`.
9. `rechaza un usuario sin rol o con rol inexistente` — aqui NO hay `roleId` util (el caso inserta a proposito con `role_id` nulo y con un uuid inexistente). Se extrajo `documentNumber` del fixture a una constante local (`const documentNumber = '111000111'`) reusada en `userSqlValues` y en los dos `tx.user.count({ where: { documentNumber } })`, para que no haya dos literales que puedan divergir.

No aparecio ningun otro caso rojo por esta misma causa en ese archivo, aparte de los nueve
listados en el encargo.

**Barrido de `tests/integration/**` — archivo por archivo:**
- `tests/integration/identity/login.int.test.ts` (T8, de QC-7): revisado completo. Todas
  las lecturas y aserciones estan acotadas por `usuarioId`/`nombreDeUsuario`, ambos
  generados con `randomUUID()` en el propio archivo (patron distinto: fixture propio
  comiteado en `beforeAll` y limpiado por id en `afterAll`, no transaccion con rollback).
  No hay ningun `count()`/`findMany()` sin `where` sobre `users`, `roles` ni
  `document_types`. No se toco nada.
- `tests/integration/inventario/inventario-constraints.int.test.ts` (QC-14, opera sobre
  `products`/`presentations`): revisado completo. QC-6 no siembra estas tablas, y de
  hecho el propio docstring del archivo ya declara la regla ("NINGUNA AFIRMACION GLOBAL")
  y todas las lecturas ya estan acotadas por `id`/`presentationId` propios del `it`. No
  habia nada que arreglar.
- `tests/integration/identity/identity-seed.int.test.ts` (T18, de QC-6 mismo): revisado
  completo. Este archivo YA asume de entrada que la base local no esta vacia (lo dice su
  propio comentario de cabecera) y por eso cada `it` llama primero a
  `resetIdentityToEmptyState(tx)`, que borra fisicamente, DENTRO del mismo `tx` que
  termina en `ROLLBACK`, todos los usuarios y los roles Administrador/Operador. Las
  aserciones absolutas que vienen despues (`tx.user.count()`, `tx.role.findMany(...)`,
  etc.) son correctas porque afirman sobre un estado que el propio `it` acaba de
  construir de forma determinista dentro de su propia transaccion, no sobre el estado
  real de la base compartida. No se toco nada.

**Excepciones dejadas intactas a proposito:**
- `el catalogo arranca solo con CC` (`tx.documentType.findMany()` comparado con
  `[DOCUMENT_TYPE_CC]`, en `identity-constraints.int.test.ts`): QC-6 no toca
  `document_types` (es su R17, verificado ademas por el caso 8 de
  `identity-seed.int.test.ts`), asi que la asercion absoluta sobre ese catalogo sigue
  siendo correcta y valiosa. No se cambio.
- Cualquier asercion ya acotada por un nombre de rol con `randomUUID()` (por ejemplo
  `permite borrar un rol sin usuarios asignados`, que usa `roleId` de un
  `uniqueRoleName()`): ya eran irrepetibles por construccion y no necesitaban cambio.

**Verificacion ejecutada (solo lo pedido, sin `./init.sh` ni `pnpm test` completo):**
- `pnpm run typecheck` -> limpio, sin salida de error.
- `pnpm run lint` -> limpio, sin salida de error.
- `pnpm run test:guardias` -> `Test Files 5 passed (5)`, `Tests 65 passed (65)`.
- `pnpm exec vitest run tests/integration/identity/identity-constraints.int.test.ts` ->
  `Test Files 1 passed (1)`, `Tests 23 passed (23)` (antes: 9 rojos; ahora: 0).
- `pnpm exec vitest run tests/integration/identity/identity-seed.int.test.ts` ->
  `Test Files 1 passed (1)`, `Tests 8 passed (8)`.
- `pnpm exec vitest run tests/integration/identity/login.int.test.ts` -> `Test Files 1
  passed (1)`, `Tests 13 passed (13)`.
- `pnpm exec vitest run tests/integration/inventario/inventario-constraints.int.test.ts`
  -> `Test Files 1 passed (1)`, `Tests 19 passed (19)`.

**Recomendacion para el leader (no implementada, es solo sugerencia):** si el gate rapido
va a seguir corriendo contra una base local que arrastra el seed real de QC-6, conviene
documentar en `docs/verification.md` que los tests de integracion de identidad DEBEN
acotar toda asercion sobre `users`/`roles` por un identificador propio del caso (patron ya
establecido en este archivo), y que ningun test nuevo puede volver a afirmar sobre el
estado absoluto de esas dos tablas salvo que, como `identity-seed.int.test.ts`, construya
su propio estado "vacio" dentro de la misma transaccion que hace el rollback.
