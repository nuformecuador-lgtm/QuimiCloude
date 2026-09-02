# tasks.md — QC-6: seed-roles-y-usuario-inicial

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task dice
cuando esta **hecha** de forma comprobable. El gate (`./init.sh`) lo corre el leader, no las
tasks (`AGENTS.md > Regla del gate`).

Los tres entregables de la ficha estan repartidos asi: **migracion** = bloque B ·
**seed** = bloques C y D · **enganche al despliegue** = bloque E.

---

## Bloque A — Preparacion

### [x] T0. Asegurar `.env` dentro del worktree
- Dep: ninguna. **Antes de cualquier `db:*` o de los tests de integracion.**
- `.env` esta git-ignorado y **los worktrees no lo heredan**. Dejarlo disponible dentro de
  `.worktrees/QC-6-seed-roles-y-usuario-inicial/` con `DATABASE_URL` y `DIRECT_URL`.
- **No se pega ninguna cadena de conexion en un archivo versionado ni en el chat.**
- **Hecho cuando:** `pnpm exec prisma validate` resuelve las variables sin error de
  "environment variable not found".

### [x] T1. [P] Anadir las claves del seed a `.env.example`
- Dep: ninguna.
- `SEED_ADMIN_USERNAME=`, `SEED_ADMIN_PASSWORD=`, `SEED_ADMIN_EMAIL=` **sin valores**, con el
  comentario de que solo hacen falta en un entorno nuevo (`design.md > 6`).
- **Hecho cuando:** las tres claves estan en `.env.example`, ninguna trae valor, y el archivo
  no contiene ninguna credencial (R6).

---

## Bloque B — Migracion aditiva (entregable 1)

### [x] T2. Anadir `mustChangeCredential` a `db/schema.prisma`
- Dep: ninguna.
- Campo en `model User`: `mustChangeCredential Boolean @default(false) @map("must_change_credential")`,
  con el comentario que explica que significa y **por que no se llama `mustChangePassword`**
  (`design.md > 2` y `> 3`).
- **Hecho cuando:** `pnpm exec prisma validate` y `pnpm exec prisma generate` pasan,
  `pnpm run typecheck` pasa y `pnpm run test:guardias` sigue verde (si el nombre lleva
  `password`, la guardia cae aqui).

### [x] T3. Generar y **revisar** `migration.sql`
- Dep: T0, T2.
- `pnpm run db:migrate:create` → `db/migrations/<ts>_user_must_change_credential/migration.sql`.
- **Revisarlo entero antes de aplicarlo:** Prisma no conoce los tres indices
  funcionales/parciales de `users` y puede proponer eliminarlos por drift. Si aparece
  cualquier `DROP INDEX` o `DROP`/`ALTER` que no sea el `ADD COLUMN`, se borra a mano.
- **Hecho cuando:** el archivo contiene exactamente un `ALTER TABLE "users" ADD COLUMN
  "must_change_credential" BOOLEAN NOT NULL DEFAULT false;` y ningun `DROP`.

### [x] T4. Escribir `down.sql` a mano
- Dep: T3.
- `ALTER TABLE "users" DROP COLUMN IF EXISTS "must_change_credential";` y nada mas.
- **Hecho cuando:** existe `down.sql` en la carpeta de la migracion, no contiene ningun
  `DROP TABLE` ni `DROP INDEX`, y `./init.sh` no reporta "migraciones sin down.sql".

### [x] T5. [P] Test estatico `tests/unit/identity/schema/seed-migration.test.ts`
- Dep: T2, T3, T4.
- Lee como texto `db/schema.prisma`, el `migration.sql` y el `down.sql` nuevos y afirma: el
  campo con su `@map` y su `@default(false)`; el `ADD COLUMN ... BOOLEAN NOT NULL DEFAULT
  false`; que el UP **no** contiene `DROP`; que el DOWN elimina esa columna y solo esa; y que
  el `migration.sql` de QC-4 conserva sus tres `CREATE UNIQUE INDEX`.
- **Hecho cuando:** pasa y cubre R10, R11.

---

## Bloque C — El seed (entregable 2): dominio y puertos

### [x] T6. `domain/roles.ts`
- Dep: ninguna.
- `ROLE_ADMINISTRADOR`, `ROLE_OPERADOR` y `SEED_ROLES` con nombre + descripcion
  (`design.md > 5.1`). Reexportar los tres desde `lib/modules/identity/index.ts`.
- **Hecho cuando:** `pnpm run typecheck` pasa y ningun archivo escribe los literales
  `'Administrador'` / `'Operador'` a mano fuera de este archivo.

### [x] T7. Puertos `initial-access-repository.ts` e `initial-access-credentials.ts`
- Dep: T6.
- Interfaces de `design.md > 5.1`. El proveedor de credenciales es **una funcion**, no un
  objeto de datos: esa es la forma que hace posible R12 (no leer el entorno si no hace falta).
- El campo de la contrasena en transito se llama `credential`. **Ningun identificador nuevo
  puede contener `password`/`pass`/`contrasena`** salvo terminando en `hash`
  (`design.md > 2`).
- **Hecho cuando:** `pnpm run typecheck` pasa, `ports/` no importa Prisma, `next/*` ni
  `lib/shared/**`, y `pnpm run test:guardias` sigue verde.

### [x] T8. `domain/seed-initial-access.ts` — el caso de uso
- Dep: T7.
- Implementa el algoritmo de `design.md > 5.2` en este orden: leer estado → resolver
  credenciales y hashear **antes** de escribir → crear solo lo que falta → devolver
  `SeedOutcome`.
- Nada de `upsert`, nada de reescritura, nada de `process.env` ni de Prisma en este archivo.
- **Hecho cuando:** `pnpm run typecheck` y `pnpm run lint` pasan y
  `tests/guards/guard-arquitectura-modulos.test.ts` sigue verde.

### [x] T9. Test unitario `tests/unit/identity/seed/seed-initial-access.test.ts`
- Dep: T8.
- Repositorio falso que **registra las llamadas recibidas**. Casos:
  1. base vacia → crea los dos roles y el usuario, con rol Administrador y
     `mustChangeCredential: true`;
  2. base vacia → los cinco marcadores personales y `documentTypeCode: 'CC'` son los de
     `design.md > 5.2`, y el correo/usuario vienen del proveedor;
  3. base vacia → el `passwordHash` guardado es el que devolvio el hasher y **no** es la
     credencial en claro;
  4. rol `Operador` ausente y `Administrador` presente → crea **solo** `Operador`;
  5. admin ya existente → **el proveedor de credenciales no se invoca ni una vez** y no se
     llama a ningun metodo de escritura;
  6. admin ya existente con hash y marca distintos → ninguna llamada de escritura ni de
     actualizacion (R15);
  7. proveedor que lanza por variable ausente → el error se propaga y el repositorio **no
     recibio ninguna escritura**;
  8. en ningun caso se llama a un metodo que toque `document_types` (el puerto ni siquiera lo
     expone, y el test lo afirma sobre la superficie del doble);
  9. se captura `console.log`/`console.error` durante todos los casos y **la credencial no
     aparece en ninguna salida**, ni en el mensaje del error del caso 7.
- Cada caso afirma primero **que ocurrio algo** (numero de llamadas esperado) antes de afirmar
  que el resto no ocurrio: un doble mal cableado que no recibe nada no debe pasar en verde.
- **Hecho cuando:** los nueve casos pasan y cubren R2, R3, R4, R7, R8, R9, R12, R13, R15, R17, R18.

---

## Bloque D — El seed (entregable 2): adaptadores, composicion y entrada

### [x] T10. [P] Adaptador de credenciales `adapters/driven/config/initial-access-credentials-env.ts`
- Dep: T7.
- Lee las tres `SEED_ADMIN_*` **en el momento de invocarlo**, tratando vacio o solo-espacios
  como ausente, y lanza nombrando la o las variables que faltan, **sin incluir ningun valor**.
- Los nombres de las variables aparecen solo como **cadenas literales en posicion de valor o
  argumento** (`design.md > 2`, consecuencia 2).
- **Hecho cuando:** `pnpm run test:guardias` sigue verde y su test unitario
  (`tests/unit/identity/seed/initial-access-credentials-env.test.ts`) cubre: las tres
  presentes → devuelve los tres valores; cada una ausente por separado → lanza nombrandola;
  una en blanco → lanza; el mensaje del error **no contiene** el valor de la credencial.
  Cubre R5, R13, R18.

### [x] T11. Adaptador Prisma `adapters/driven/persistence/initial-access-repository-prisma.ts`
- Dep: T2, T7.
- Fabrica `createInitialAccessRepository(db)` que acepta `PrismaClient` **o**
  `Prisma.TransactionClient` (`design.md > 5.3`): sin eso el test de integracion no puede
  aislarse con `ROLLBACK`.
- `countLiveUsersWithRole` filtra `deletedAt: null`. `createInitialAdmin` escribe
  `mustChangeCredential: true`. `P2002` se traduce a "ya existia", sin sobrescribir.
- Solo toca `prisma.role` y `prisma.user` (modelos de `identity`); nunca `prisma.documentType`.
- **Hecho cuando:** `pnpm run typecheck` pasa y la guardia de arquitectura sigue verde.

### [x] T12. Cablear en `lib/composition/index.ts`
- Dep: T8, T10, T11.
- Exponer `identity.seedInitialAccess` ya cableado con el repositorio Prisma, el
  `passwordHasher` existente y el proveedor de credenciales. La composicion **no** importa
  ningun adaptador driving.
- **Hecho cuando:** `pnpm run typecheck` pasa y la guardia de arquitectura sigue verde.

### [x] T13. `scripts/seed.ts` y el script `db:seed`
- Dep: T12.
- Cascara: `process.loadEnvFile()` cuando exista `.env` (`tsx` no lo carga solo, ver
  `scripts/db-rollback.ts`), llamada a la composicion por **import relativo**
  (`design.md > 5`), resumen por consola **sin secretos**, `process.exit(1)` con mensaje claro
  ante cualquier error, y `$disconnect()` al terminar.
- `"db:seed": "tsx scripts/seed.ts"` en `package.json`.
- **Hecho cuando:** `pnpm run db:seed` corre de punta a punta contra la base local; la salida
  pegada en `progress/impl_QC-6-seed-roles-y-usuario-inicial.md` no contiene ninguna
  credencial; y una segunda ejecucion imprime "nada que crear" y sale con 0.

---

## Bloque E — Enganche al despliegue (entregable 3)

### [ ] T14. Encadenar el seed en el `build`
- Dep: T13.
- `"build": "prisma migrate deploy && tsx scripts/seed.ts && next build"` (`design.md > 7`).
  El orden y los `&&` son el requisito: cortan la cadena y dejan la version nueva sin publicar
  si el seed falla.
- **Hecho cuando:** `pnpm run build` funciona en local contra la base de desarrollo y T15 pasa.

### [ ] T15. [P] Test estatico `tests/unit/identity/seed/deploy-hook.test.ts`
- Dep: T14.
- Lee `package.json` y afirma: existe `scripts.build`; contiene `prisma migrate deploy`,
  `scripts/seed.ts` y `next build` **en ese orden**; los tres van unidos por `&&` (no por `;`
  ni `||`, que no cortarian ante un fallo); existe `scripts["db:seed"]`.
- Ademas: todo import bare de los archivos nuevos del seed (`lib/modules/identity/**/*seed*`,
  `**/initial-access*`, `scripts/seed.ts`) esta entre los paquetes ya declarados en
  `package.json` o es un builtin de Node — ninguna dependencia nueva (R21).
- Afirma primero que **encontro los archivos** (lista no vacia) antes de afirmar que todos
  cumplen: barrer una lista vacia pasaria en verde para siempre.
- **Hecho cuando:** pasa y cubre R19, R20, R21.

### [ ] T16. Comprobar a mano que el fallo del seed rompe el despliegue
- Dep: T14.
- En una terminal con la base accesible pero **sin** `SEED_ADMIN_PASSWORD` y con la base
  vacia de administradores: `pnpm run build` tiene que salir con codigo distinto de 0 y sin
  llegar a `next build`. Leer `$?` de un archivo redirigido, **no** de una tuberia a `head`
  (`docs/verification.md > Trampas conocidas`).
- **Hecho cuando:** el codigo de salida y la salida (sin credenciales) quedan pegados en
  `progress/impl_QC-6-seed-roles-y-usuario-inicial.md`. Cierra R20 en su forma real.

---

## Bloque F — Verificacion contra base real

### [ ] T17. Ciclo real de la migracion
- Dep: T0, T3, T4.
- `pnpm run db:migrate` → comprobar la columna (`\d users` o `information_schema.columns`) →
  `pnpm run db:rollback` → comprobar que la columna desaparece, que **los tres indices unicos
  de `users` siguen ahi** y que `_prisma_migrations` queda coherente → `pnpm run db:migrate`
  otra vez.
- **Hecho cuando:** el ciclo apply → rollback → apply termina limpio y la salida queda pegada
  en `progress/impl_QC-6-seed-roles-y-usuario-inicial.md`. Cierra R11 en su forma real.

### [ ] T18. Test de integracion `tests/integration/identity/identity-seed.int.test.ts` — **la doble corrida**
- Dep: T12, T17.
- Patron de aislamiento de `identity-constraints.int.test.ts`: cada `it` dentro de
  `prisma.$transaction` que termina en `ROLLBACK`, con el repositorio construido sobre el `tx`
  (por eso T11 es una fabrica).
- Casos:
  1. **doble corrida sobre base vacia** — primera: `createdRoles` trae los dos nombres,
     `createdAdmin` es `true`, y la base tiene 2 roles y 1 usuario vivo con rol Administrador.
     Segunda: `createdRoles` vacio, `createdAdmin` `false`, y **las filas releidas son
     identicas campo a campo**, `id`, `password_hash`, `updated_at` y `must_change_credential`
     incluidos;
  2. **el usuario inicial nace obligado a cambiar la contrasena** — `must_change_credential`
     es `true` y su rol es Administrador;
  3. **la contrasena quedo hasheada por el puerto** — `identity.passwordHasher.verify(
     credencial, storedHash)` es `true` y `storedHash !== credencial`. Nada de comparar textos;
  4. **datos cambiados a mano sobreviven** — tras la primera corrida se modifican
     `password_hash` y `must_change_credential` del admin y la descripcion de un rol; la
     siguiente corrida deja las tres cosas exactamente como estaban (R15);
  5. **solo falta un rol** — se borra `Operador` (sin usuarios, borrable) y se corre: crea
     `Operador` y deja `Administrador` intacto;
  6. **admin presente y variables ausentes** — con las `SEED_ADMIN_*` borradas del entorno del
     test, el seed termina con exito y no crea nada (R12);
  7. **admin ausente y variables ausentes** — el seed lanza nombrando la variable y **ni los
     roles quedan creados** (R13, transaccion);
  8. **`document_types` intacto** — el conteo y las filas de `document_types` son las mismas
     antes y despues de las dos corridas (R17).
- Cada caso afirma que encontro algo antes de afirmar que esta bien (conteos > 0, filas
  releidas no nulas).
- **Hecho cuando:** los ocho casos pasan y cubren R1, R2, R4, R5, R7, R8, R9, R12, R13, R14,
  R15, R16, R17.

---

## Bloque G — Cierre

### [ ] T19. Sincronizar con `dev` y correr el gate completo
- Dep: T0-T18. **La corre el leader tras el reviewer** (`AGENTS.md > Regla del gate`).
- `git fetch origin dev` → `git merge origin/dev` → `./init.sh` sin flags.
- **Hecho cuando:** `./init.sh` termina en `== init OK ==`.

### [ ] T20. Documentar el mapa `R<n> → test`
- Dep: T19.
- Copiar la tabla de abajo a `progress/impl_QC-6-seed-roles-y-usuario-inicial.md` con la salida
  real de los tests.
- **Hecho cuando:** cada `R1`-`R21` tiene al menos un test **ejecutado** (no solo escrito) y el
  reviewer lo valida.

---

## Trazabilidad `R<n> → test`

Abreviaturas: **M** = `tests/unit/identity/schema/seed-migration.test.ts` · **U** =
`tests/unit/identity/seed/seed-initial-access.test.ts` · **E** =
`tests/unit/identity/seed/initial-access-credentials-env.test.ts` · **D** =
`tests/unit/identity/seed/deploy-hook.test.ts` · **G** =
`tests/guards/guard-password-never-plaintext.test.ts` · **I** =
`tests/integration/identity/identity-seed.int.test.ts`.

| R | Test | Nota |
| --- | --- | --- |
| R1 | I · caso 1 (primera corrida sobre base vacia) | el seed deja roles + admin |
| R2 | U · casos 1 y 4 · I · casos 1 y 5 | crea el rol que falta, y solo ese |
| R3 | U · caso 1 (solo se crean los dos nombres) · I · caso 1 (la base queda con 2 roles) | |
| R4 | U · casos 1 y 5 · I · casos 1 y 2 | criterio: usuario vivo con rol Administrador |
| R5 | E · las tres presentes · I · caso 1 | usuario y correo salen del entorno |
| R6 | T1 (`.env.example` sin valores) · G | ninguna credencial literal en el repo |
| R7 | U · caso 2 · I · caso 1 | marcadores fijos + `CC` |
| R8 | U · caso 3 · I · caso 3 | `verify(credencial, storedHash)` es `true` |
| R9 | U · caso 1 · I · caso 2 | `must_change_credential = true` |
| R10 | M · el campo y la columna con `NOT NULL DEFAULT false` | |
| R11 | M · el `down.sql` elimina solo esa columna | + T17, ciclo apply → rollback → apply |
| R12 | U · caso 5 (el proveedor no se invoca) · I · caso 6 | |
| R13 | U · caso 7 · E · cada variable ausente · I · caso 7 | error claro y nada creado |
| R14 | I · caso 1 (conteos identicos tras la segunda corrida) | |
| R15 | U · caso 6 · I · caso 4 | lo cambiado a mano sobrevive |
| R16 | I · caso 1 | **la doble corrida contra base real** |
| R17 | U · caso 8 · I · caso 8 | `document_types` intacto |
| R18 | U · caso 9 · E · el mensaje no lleva el valor | ninguna credencial en logs ni errores |
| R19 | D · el `build` encadena el seed | + T16 |
| R20 | D · los tres comandos van unidos por `&&` | + T16, codigo de salida real |
| R21 | D · todo import es un paquete ya declarado · `guard-dependencias-aprobadas` | |

R6, R19, R20 y R21 se cierran con tests **estaticos** a proposito: son propiedades del
repositorio y del pipeline, no del comportamiento en ejecucion; R11 y R20 se rematan ademas con
las comprobaciones reales de T17 y T16, cuya salida se pega en `progress/`.
