# tasks.md — Feature 1: modelo-usuarios-y-roles

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque.

**No hay tareas bloqueadas.** El bloqueo de infraestructura de la primera version se levanto
el 2026-08-06: el repo ya tiene `.env` con `DATABASE_URL`.

---

## Bloque A — Herramienta y configuracion

### [x] T0. Asegurar el `.env` dentro del worktree
- Dep: ninguna. **Primera tarea, antes de cualquier `db:*`.**
- `.env` esta git-ignorado y vive en la raiz del worktree principal; **los worktrees no lo
  heredan**. El implementer tiene que dejarlo disponible dentro de
  `.worktrees/1-modelo-usuarios-y-roles/` (copia local o enlace), y comprobar si ademas de
  `DATABASE_URL` hace falta `DIRECT_URL` para Prisma Migrate (`design.md > 7`).
- **No se pega la cadena de conexion en ningun archivo versionado ni en el chat.** Si algo
  falta, se pregunta al humano; no se inventa.
- **Hecho cuando:** desde el worktree, `pnpm exec prisma validate` resuelve las variables de
  entorno sin error de "environment variable not found".

### [x] T1. Anadir Prisma al proyecto
- Dep: ninguna (puede ir antes que T0; solo `db:*` depende de T0).
- `pnpm add -D prisma` + `pnpm add @prisma/client`. Anadir `"prisma": { "schema": "db/schema.prisma" }` en `package.json`.
- **Hecho cuando:** `pnpm exec prisma validate` resuelve `db/schema.prisma` sin pasar `--schema`, y `pnpm run typecheck` pasa.

### [x] T2. [P] Anadir scripts de migracion y el rollback
- Dep: T1.
- Scripts en `package.json`: `db:migrate:create` (`prisma migrate dev --create-only`), `db:migrate` (`prisma migrate deploy`), `db:rollback` (`tsx scripts/db-rollback.ts`). Crear `scripts/db-rollback.ts`: aplica el `down.sql` de la ultima migracion **y despues** `prisma migrate resolve --rolled-back <migracion>`.
- **Hecho cuando:** los tres scripts aparecen en `pnpm run`, `scripts/db-rollback.ts` typechequea, y el script falla con un mensaje claro (no un stacktrace) si falta `DATABASE_URL`.

### [x] T3. [P] Montar Vitest (no existe suite en el repo)
- Dep: ninguna.
- `pnpm add -D vitest`. `vitest.config.ts` con alias `@/*`. Scripts `test` (suite entera), `test:guardias` (`vitest run guard`), `test:rapido` (`vitest related --run $(git diff --name-only origin/dev...HEAD)` + `test:guardias`). Los tests de integracion se seleccionan por patron `*.int.test.ts` y necesitan base.
- **Hecho cuando:** `./init.sh --rapido` deja de emitir el `warn` "script 'test:rapido' no definido" y termina en verde.

---

## Bloque B — Esquema y migracion

### [x] T4. Escribir `db/schema.prisma`
- Dep: T1.
- Modelos `DocumentType`, `Role`, `User` segun `design.md > 2`, con `@@map`/`@map` a
  `snake_case` en ingles, `datasource` con `url` + `directUrl`, sin ningun `enum`.
- `User` lleva `createdAt`, `updatedAt` (`@updatedAt`) y `deletedAt DateTime?`; `Role` lleva
  `createdAt` y `updatedAt` pero **no** `deletedAt` (`design.md > 2.2`, es lo que sostiene R17).
- **Sin `@unique` en `email`, `username` ni en la pareja documento**: esas tres unicidades son
  indices parciales en SQL crudo (`design.md > 4` y `> 5`). Dejar el comentario en el schema
  explicando donde viven, o el siguiente que lo lea creera que falta.
- **Hecho cuando:** `pnpm exec prisma validate` pasa, `pnpm exec prisma generate` produce el cliente, y `pnpm run typecheck` pasa.

### [x] T5. Generar y completar `migration.sql`
- Dep: T0, T4.
- `pnpm run db:migrate:create` → `db/migrations/<ts>_users_and_roles/migration.sql`. Anadir a
  mano lo que Prisma no genera: `CREATE EXTENSION IF NOT EXISTS pgcrypto`, el `INSERT` de `CC`,
  los **tres indices unicos parciales** (`lower(email)`, `lower(username)`, `(document_type_code,
  document_number)`, los tres con `WHERE deleted_at IS NULL`) y los seis `ALTER TABLE` de RLS.
- **Hecho cuando:** el archivo contiene las tres `CREATE TABLE`, los tres indices unicos
  parciales, las dos FK con `ON DELETE RESTRICT`, los dos indices de FK, el INSERT de `CC` y
  los seis `ALTER TABLE` de RLS.

### [x] T6. Escribir `down.sql` a mano
- Dep: T5.
- Revierte exactamente T5, en orden inverso: `DROP TABLE IF EXISTS "users"`, `"roles"`, `"document_types"` (los indices caen con sus tablas). No toca `pgcrypto`.
- **Hecho cuando:** existe `down.sql` en la carpeta de la migracion y `./init.sh` no reporta "migraciones sin down.sql".

### [x] T7. [P] `lib/prisma.ts` y `lib/types/identity.ts`
- Dep: T4.
- Singleton de PrismaClient con cache en `globalThis`. `identity.ts` exporta `DOCUMENT_TYPE_CC` y el tipo de union derivado. Sin repositorios ni servicios (ver `design.md > 7`).
- **Hecho cuando:** `pnpm run typecheck` y `pnpm run lint` pasan y ningun archivo importa `PrismaClient` fuera de `lib/prisma.ts`.

---

## Bloque C — Tests estaticos (no necesitan base)

### [x] T8. [P] `tests/unit/schema/identity-schema.test.ts`
- Dep: T3, T4.
- Lee `db/schema.prisma` como texto y afirma: modelos y campos, obligatoriedad, `deletedAt`
  opcional en `User` y **ausente** en `Role`, `onDelete: Restrict` en las dos relaciones,
  ausencia de `enum`, ausencia de longitud declarada en `passwordHash`.
- **Hecho cuando:** pasa y cubre R1, R2, R3, R8, R10(parcial), R12, R13, R15, R16, R17(parcial), R21, R24.

### [x] T9. [P] `tests/unit/schema/identity-migration.test.ts`
- Dep: T3, T5, T6.
- Lee `migration.sql` y `down.sql` como texto: los tres indices unicos **con `lower(...)` y
  con `WHERE deleted_at IS NULL`** (si alguien quita el `lower` o el `WHERE`, este test cae),
  el `INSERT` de `CC` como unica fila de `document_types`, `password_hash` declarado `TEXT`
  sin longitud, las FK con `RESTRICT`, y que `down.sql` dropea exactamente las tres tablas del UP.
- **Hecho cuando:** pasa y cubre R4, R5, R6, R7, R9, R12, R14, R20, R22, R23.

### [x] T10. [P] Guardias
- Dep: T3, T5.
- `tests/guards/guard-password-never-plaintext.test.ts`: barre `db/`, `lib/`, `app/`, `scripts/` y falla si aparece una columna/campo `password`, `pass`, `plain_password`, `clear_password` o `contrasena` sin sufijo `_hash`.
- `tests/guards/guard-rls-force.test.ts`: por cada `CREATE TABLE` en cualquier `db/migrations/**/migration.sql`, exige su `ENABLE ROW LEVEL SECURITY` **y** su `FORCE ROW LEVEL SECURITY`.
- Ambas recorren el arbol de archivos, no el grafo de imports: por eso van en `test:guardias` y se seleccionan por patron `guard`.
- **Hecho cuando:** `pnpm run test:guardias` pasa y cubre R11, R19.

---

## Bloque D — Base de datos real

### [x] T11. `.env.example`
- Dep: T0.
- Versionar `.env.example` con las claves `DATABASE_URL` y `DIRECT_URL` **sin valores**, solo
  el formato esperado. No se copia nada del `.env` real.
- **Hecho cuando:** existe `.env.example`, no contiene ninguna credencial, y `./init.sh` reporta `.env` presente.

### [ ] T12. Aplicar y revertir la migracion de verdad — **BLOQUEADA** (ver `progress/impl_1-modelo-usuarios-y-roles.md` seccion 5: `prisma migrate resolve --rolled-back` devuelve P3012 sobre una migracion aplicada con exito; apply verificado, rollback deja `_prisma_migrations` incoherente)
- Dep: T5, T6, T0.
- `pnpm run db:migrate` → comprobar el esquema (incluidos los tres indices parciales, con
  `\d users` o `pg_indexes`) → `pnpm run db:rollback` → comprobar que las tres tablas
  desaparecen y que `_prisma_migrations` queda coherente → volver a aplicar.
- **Hecho cuando:** el ciclo apply → rollback → apply termina limpio y la salida queda pegada en `progress/impl_1-modelo-usuarios-y-roles.md`. Cierra R20 en su forma real.

### [x] T13. `tests/integration/identity-constraints.int.test.ts`
- Dep: T3, T12.
- Cada caso en transaccion con rollback. Casos: alta valida; falta de campo obligatorio
  (incluye telefono y fecha de nacimiento); correo duplicado exacto; **correo duplicado
  cambiando solo mayusculas**; username duplicado exacto; **username duplicado cambiando solo
  mayusculas**; (tipo, numero) duplicado; mismo numero con tipo distinto; tipo de documento
  inexistente; `CC` como unico tipo inicial; alta de un tipo nuevo + usuarios previos
  intactos; rol duplicado; usuario sin rol / con rol inexistente; dos usuarios con el mismo
  rol; borrado de rol con usuarios rechazado; **borrado de rol cuyo unico usuario esta
  borrado logicamente, tambien rechazado**; borrado de rol sin usuarios permitido; borrado
  logico conserva la fila y marca `deleted_at`; **re-alta con el correo, username y documento
  de un usuario borrado**; **dos usuarios borrados compartiendo correo y documento**;
  `created_at`/`updated_at` se rellenan solos y `updated_at` cambia al modificar.
- **Hecho cuando:** los 21 casos pasan y cubren R1, R2, R4-R10, R14-R18, R21-R24.

---

## Bloque E — Cierre

### [ ] T14. Sincronizar con `dev` y correr el gate completo — pendiente: la corre el leader tras el reviewer (AGENTS.md, Regla del gate)
- Dep: T0-T13.
- `git fetch origin dev` → `git merge origin/dev` → `./init.sh` sin flags.
- **Hecho cuando:** `./init.sh` termina en `== init OK ==` en verde.

### [x] T15. Documentar el mapa `R<n> → test`
- Dep: T14.
- Copiar la tabla de trazabilidad de abajo a `progress/impl_1-modelo-usuarios-y-roles.md` con la salida real de los tests.
- **Hecho cuando:** el archivo existe, cada `R1`-`R24` tiene al menos un test **ejecutado** (no solo escrito) y el reviewer lo valida.

---

## Trazabilidad `R<n> → test`

Abreviaturas: **S** = `tests/unit/schema/identity-schema.test.ts` · **M** =
`tests/unit/schema/identity-migration.test.ts` · **G1** =
`tests/guards/guard-password-never-plaintext.test.ts` · **G2** =
`tests/guards/guard-rls-force.test.ts` · **I** =
`tests/integration/identity-constraints.int.test.ts`.

| R | Test estatico | Test de integracion (contra base real) |
| --- | --- | --- |
| R1 | S · "el modelo User declara los nueve datos del usuario" | I · "crea un usuario con todos sus datos" |
| R2 | S · "todo campo de negocio de User es obligatorio, incluidos telefono y fecha de nacimiento" | I · "rechaza el alta si falta un campo obligatorio" |
| R3 | S · "User y Role tienen id uuid con default generado" | — |
| R4 | M · "el indice unico de correo es sobre lower(email)" | I · "rechaza un correo repetido aunque cambie el uso de mayusculas" |
| R5 | M · "el indice unico de username es sobre lower(username)" | I · "rechaza un nombre de usuario repetido aunque cambie el uso de mayusculas" |
| R6 | M · "el indice unico de documento es compuesto por tipo y numero" | I · "rechaza el mismo tipo y numero de documento repetidos" |
| R7 | M · "el indice unico de documento es compuesto por tipo y numero" | I · "acepta el mismo numero de documento con tipo distinto" |
| R8 | S · "document_type_code es FK a document_types y no hay enum" | I · "rechaza un tipo de documento fuera del catalogo" |
| R9 | M · "la migracion inserta CC como unico tipo de documento" | I · "el catalogo arranca solo con CC" |
| R10 | S · "el tipo de documento no es enum ni check, es tabla" | I · "anadir un tipo nuevo deja intactos los usuarios ya guardados" |
| R11 | G1 · "ninguna columna ni campo guarda la contrasena en claro" | — (guardia estatica, no necesita base) |
| R12 | S · "passwordHash es String sin longitud declarada" · M · "password_hash es TEXT sin longitud" | — |
| R13 | S · "Role declara name y description obligatorios" | I · "crea un rol con nombre y descripcion" |
| R14 | M · "roles tiene un indice unico sobre name" | I · "rechaza un segundo rol con el mismo nombre" |
| R15 | S · "roleId es obligatorio y FK a Role" | I · "rechaza un usuario sin rol o con rol inexistente" |
| R16 | S · "roleId no tiene restriccion de unicidad" | I · "acepta varios usuarios con el mismo rol" |
| R17 | S · "la relacion User-Role declara onDelete Restrict" · S · "Role no tiene deletedAt" | I · "rechaza borrar un rol con usuarios asignados" · I · "rechaza borrar un rol cuyo unico usuario esta borrado logicamente" |
| R18 | — | I · "permite borrar un rol sin usuarios asignados" |
| R19 | G2 · "toda tabla creada tiene RLS activado y forzado" | — (un test de RLS con Prisma no significa nada; ver `design.md > 9`) |
| R20 | M · "down.sql revierte exactamente lo que crea migration.sql" | T12 · ciclo apply → rollback → apply |
| R21 | S · "User declara deletedAt opcional" | I · "el borrado logico conserva la fila y marca deleted_at" |
| R22 | M · "los tres indices unicos son parciales con WHERE deleted_at IS NULL" | I · "permite re-alta con el correo, username y documento de un usuario borrado" |
| R23 | M · "los tres indices unicos son parciales con WHERE deleted_at IS NULL" | I · "admite dos usuarios borrados que comparten correo y documento" |
| R24 | S · "User y Role declaran createdAt y updatedAt" | I · "created_at y updated_at se rellenan solos y updated_at cambia al modificar" |

Los 24 requisitos tienen test ejecutable. R3, R11, R12 y R19 se cierran solo con tests
estaticos **a proposito**, no por falta de cobertura: son propiedades del esquema y del SQL,
y un test contra la base no anadiria informacion (el caso de R19 esta razonado en
`design.md > 9`).
