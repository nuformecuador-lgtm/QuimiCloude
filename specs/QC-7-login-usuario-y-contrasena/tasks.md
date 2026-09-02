# QC-7 — login-usuario-y-contrasena · tasks

Reglas de esta lista:

- El repo queda **compilando y en verde en cada task**: `pnpm run typecheck` + `pnpm run
  lint` + `./init.sh --rapido` al cerrar cada tanda. `./init.sh` completo antes del PR.
- `[P]` = se puede hacer en paralelo con las otras `[P]` de su bloque.
- Ninguna task toca `app/` ni `components/`. **Si** se tocan `db/` (migracion del bloqueo) y
  `package.json` + `docs/dependencias.md` (Playwright aprobado): son alcance añadido el
  2026-09-01, no improvisacion.

## Archivos esperados

**Nuevos**

```
lib/modules/identity/domain/session.ts
lib/modules/identity/domain/account-lock.ts
lib/modules/identity/ports/user-credentials-reader.ts
lib/modules/identity/ports/login-attempt-recorder.ts
lib/modules/identity/ports/session-writer.ts
lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts
lib/modules/identity/adapters/driven/session/session-cookie.ts
db/migrations/<ts>_user_login_lockout/migration.sql
db/migrations/<ts>_user_login_lockout/down.sql
tests/unit/identity/session-ticket.test.ts
tests/unit/identity/account-lock.test.ts
tests/unit/identity/verify-credentials.test.ts
tests/unit/identity/session-cookie.test.ts
tests/integration/identity/login.int.test.ts
playwright.config.ts
e2e/login.spec.ts
progress/impl_QC-7-login-usuario-y-contrasena.md
```

**Modificados**

```
lib/modules/identity/domain/verify-credentials.ts
lib/modules/identity/index.ts
lib/composition/index.ts
db/schema.prisma                           (3 columnas en el modelo User)
package.json                               (@playwright/test + script e2e)
docs/dependencias.md                       (fila de @playwright/test)
tests/unit/identity/login-action.test.ts   (solo lo que dice T6b)
tests/unit/identity/schema/identity-schema.test.ts      (las 3 columnas nuevas)
tests/unit/identity/schema/identity-migration.test.ts   (la migracion nueva)
.env.example
```

**Que NO se toca** (si aparece en el diff, es alcance inventado): `session-stub.ts`,
`logout-action.ts`, `login-action.ts`, `login-form-state.ts`, `credentials.ts`,
`app/**`, `components/**`, y ningun modelo de `db/schema.prisma` que no sea `User`.

---

## T0 — Preparar el worktree

- [x] `pnpm install --frozen-lockfile`, `pnpm exec prisma generate --schema db/schema.prisma`,
      `pnpm exec next typegen`, y copiar `.env` (los worktrees no lo heredan; deuda conocida
      de `scripts/wt.sh new` en `progress/current.md`).
- [x] Añadir `SESSION_SECRET` al `.env` local con un valor aleatorio de >= 32 caracteres.
      **Ademas hubo que anadir `DIRECT_URL`**: no estaba en el `.env` del repo principal y
      sin ella `prisma migrate` no arranca (deuda anotada en la bitacora).
- **Hecho cuando:** `./init.sh --rapido` sale verde **antes** de cambiar nada. Si esta rojo
      de entrada, se para y se dice: no se construye sobre un gate roto.

## T1 — `domain/session.ts` (nuevo)  `[P con T2, T3]`

Depende de: T0.

- [x] `SESSION_DURATION_MS` (8 h), tipo `SessionTicket { userId; issuedAt; expiresAt }` y
      `createSessionTicket(userId, now = new Date())`.
- [x] Sin imports de framework, Prisma ni `lib/shared` (bloque 4 de la guardia).
- **Hecho cuando:** `tests/unit/identity/session-ticket.test.ts` afirma que `expiresAt -
      issuedAt === SESSION_DURATION_MS` y que `now` inyectado produce un ticket determinista.
      **Cubre R11 (parte de dominio).**

## T1b — `domain/account-lock.ts` (nuevo)  `[P con T1, T2]`

Depende de: T0. **Alcance añadido el 2026-09-01.**

- [x] `MAX_FAILED_ATTEMPTS = 5`, `LOCK_DURATIONS_MS = [1, 5, 15, 60] min`, tipo
      `AccountLockState`, `isLocked(state, now)` y `nextLockState(state, outcome, now)` segun
      la tabla de `design.md > 5.5`. Puro: sin reloj propio, sin Prisma, sin framework.
- **Hecho cuando:** `tests/unit/identity/account-lock.test.ts` pasa, con `now` inyectado en
      todos los casos (nada de `sleep`):
  - fallo 1 a 4 -> incrementa el contador y NO bloquea. **R22 (negativo)**
  - el quinto fallo -> bloquea, contador a `0`, nivel `1`, `lockedUntil = now + 1 min`. **R22**
  - bloqueos sucesivos -> 1, 5, 15 y 60 min; el quinto bloqueo y los siguientes siguen en 60 y
    el nivel no pasa de 4; `lockedUntil` nunca es `null` al bloquear. **R23**
  - `isLocked` con `now` posterior a `lockedUntil` -> `false`, y un fallo posterior deja el
    contador en `1` conservando el nivel. **R26**
  - `outcome: 'success'` -> `{ failedAttempts: 0, lockLevel: 0, lockedUntil: null }`. **R27**
  - estando bloqueada, `nextLockState(..., 'failure', now)` devuelve el **mismo** estado.
    **R25**

## T2 — Puertos nuevos  `[P con T1, T1b, T3]`

Depende de: T0, T1b (por el tipo `AccountLockState`).

- [x] `ports/user-credentials-reader.ts`: `AuthenticatableUser = { id; passwordHash } &
      AccountLockState` y `findActiveByUsername(username): Promise<AuthenticatableUser | null>`.
- [x] `ports/login-attempt-recorder.ts`: `record(userId, state: AccountLockState): Promise<void>`.
- [x] `ports/session-writer.ts`: `startSession(ticket: SessionTicket): Promise<void>`.
- **Hecho cuando:** `pnpm run typecheck` pasa y `pnpm exec vitest run guard` sigue verde (los
      puertos solo importan del propio `domain/`). **Cubre R17 (parte).**

## T2b — Migracion del bloqueo (3 columnas en `users`)

Depende de: T0. Se puede hacer en paralelo con T1/T1b, pero **antes** de T3.

- [x] Añadir al modelo `User` de `db/schema.prisma`: `failedLoginAttempts Int @default(0)
      @map("failed_login_attempts")`, `lockLevel Int @default(0) @map("lock_level")`,
      `lockedUntil DateTime? @map("locked_until") @db.Timestamptz(6)`. No se toca el
      `/// @module identity` ni ningun indice.
- [x] `pnpm run db:migrate:create` -> `db/migrations/<ts>_user_login_lockout/migration.sql`.
- [x] Escribir `down.sql` **a mano**: `DROP COLUMN` de las tres. Prisma no genera downs.
- [x] `pnpm run db:migrate` para aplicarla; `pnpm exec prisma generate` para el cliente.
- **Hecho cuando:** la migracion aplica, **`pnpm run db:rollback` revierte y deja
      `_prisma_migrations` coherente**, y se vuelve a aplicar sin error (probado de verdad, no
      asumido: `docs/verification.md > Datos`). `tests/guards/guard-rls-force.test.ts` sigue
      verde. **Cubre R30.**

## T3 — Adaptador de persistencia (lectura + registro del intento)  `[P con T1, T1b]`

Depende de: T0, T2, T2b.

- [x] `adapters/driven/persistence/user-credentials-prisma.ts`:
      `findActiveByUsername` con `prisma.$queryRaw` parametrizado
      (`lower(username) = lower($1) AND deleted_at IS NULL LIMIT 1`, `design.md > 4.1`),
      seleccionando tambien las tres columnas de bloqueo.
- [x] `recordLoginAttempt(userId, state)` con `prisma.user.update` por id (API tipada).
- [x] Devuelve **solo** `id`, `passwordHash` y el estado de bloqueo. Nunca loguea la fila.
- **Hecho cuando:** `typecheck` pasa y la guardia de arquitectura sigue verde (unico
      consumidor de `prisma.user` en el modulo dueño). El test real llega en T8.

## T4 — Caso de uso real en el dominio

Depende de: T1, T1b, T2. **Es el corazon de la feature.**

- [x] Reescribir `domain/verify-credentials.ts` como
      `createVerifyCredentials({ users, attempts, hasher, session })`, con el algoritmo de
      `design.md > 2`: parseo, normalizacion del usuario, lectura por puerto, corte por
      bloqueo (paso 3bis), verificacion **siempre** (señuelo cacheado en el closure si no hay
      usuario), registro del resultado del intento y emision del ticket solo en el exito.
- [x] Firma de retorno intacta: `Promise<{ ok: boolean }>`.
- [x] Actualizar `lib/modules/identity/index.ts`: exporta `createVerifyCredentials` y el tipo
      `SessionTicket`; sigue reexportando solo de `./domain`.
- **Hecho cuando:** `tests/unit/identity/verify-credentials.test.ts` (puertos falsos, sin DB
      ni bcrypt real) pasa con estos casos:
  - usuario + contrasena correctos -> `{ ok: true }` y `startSession` llamado una vez con un
    ticket cuyo `userId` es el del usuario. **R1**
  - usuario inexistente -> `{ ok: false }`, mismo resultado que contrasena mala. **R2**
  - contrasena mala -> `{ ok: false }`, **objeto identico** al caso anterior. **R3**
  - `'  ADMIN '` encuentra al usuario `admin`, y `'Secreto'` no vale por `'secreto'`. **R4**
  - el puerto devuelve `null` para un usuario borrado -> `{ ok: false }`. **R5**
  - `hasher.verify` se llama **exactamente una vez** tanto con usuario existente como
    inexistente, y en el segundo caso el hash recibido es el del señuelo. **R6**
  - el señuelo se produce con `hasher.hash` (el mismo del sistema), no con un literal, y se
    calcula una sola vez aunque haya varios intentos fallidos. **R7**
  - entrada vacia / contrasena de 65 caracteres -> `{ ok: false }` y **cero** llamadas a
    `users`, `hasher` y `session`. **R8**
  - en todos los fallos, `startSession` no se llama nunca. **R14**
  - el caso de uso solo se construye con puertos (test que le pasa dobles). **R17**
  - **cuenta bloqueada + contrasena CORRECTA -> `{ ok: false }` y `startSession` no se llama.**
    Es el caso que se olvida. **R24**
  - cuenta bloqueada -> `attempts.record` **no** se llama (ni contador ni fin de bloqueo se
    mueven). **R25**
  - cuenta bloqueada -> el objeto devuelto es **identico** al de contrasena incorrecta y al de
    usuario inexistente (`toEqual` entre los tres). **R28**
  - cuenta bloqueada -> `hasher.verify` se llamo **una vez**, igual que en los otros dos
    caminos. **R29**
  - exito -> `attempts.record` recibe `{ failedAttempts: 0, lockLevel: 0, lockedUntil: null }`
    **antes** de `startSession`. **R27**
  - fallo con usuario existente -> `attempts.record` recibe exactamente lo que devuelve
    `nextLockState`. **R22 (integrado)**
  - usuario inexistente -> `attempts.record` **no** se llama ninguna vez. **R31**

## T5 — Adaptador de cookie de sesion

Depende de: T1, T2.

- [x] `adapters/driven/session/session-cookie.ts`: `SESSION_COOKIE_NAME`,
      `signSessionValue(payload)` con `createHmac('sha256', secret)` y `startSession(ticket)`
      que escribe con `cookies()` de `next/headers`.
- [x] Formato del valor exactamente el de `design.md > 5.1`; atributos exactamente los de
      `design.md > 5.2`.
- [x] Secreto leido **en la llamada**; lanza si falta o mide menos de 32 caracteres.
- **Hecho cuando:** `tests/unit/identity/session-cookie.test.ts` (con `vi.mock('next/headers')`)
      pasa con:
  - `set` se llama con `httpOnly: true`. **R9**
  - `sameSite: 'lax'`, `path: '/'`, y `secure` verdadero con `NODE_ENV=production` y falso
    fuera. **R10**
  - `maxAge === SESSION_DURATION_MS / 1000` y el `exp` del payload coincide con el
    `expiresAt` del ticket. **R11**
  - el test **recomputa** el HMAC con `createHmac` y compara; el payload decodificado tiene
    solo `sub`, `iat`, `exp`, y `sub` es el id (nada de username, correo ni hash). **R12**
  - sin `SESSION_SECRET`, o con uno de 8 caracteres: lanza y `set` **no** se llama. **R13**
  - ningun `console.*` recibe la contrasena, el hash ni el valor de la cookie (spy sobre
    `console` durante un login completo). **R15**

## T6 — Cablear en el punto unico de composicion

Depende de: T3, T4, T5.

- [x] `lib/composition/index.ts` segun `design.md > 4.3`. La clave `verifyCredentials` de la
      fachada conserva nombre y firma.
- [x] `session-stub.ts` sigue cableado tal cual para `getSessionUser` / `endSession`.
- **Hecho cuando:** `typecheck` verde y `tests/unit/identity/logout-action.test.ts` pasa
      **sin modificarlo**. **Cubre R20.**

## T6b — Adaptar `tests/unit/identity/login-action.test.ts` (lo minimo, y solo esto)

Depende de: T6. **No es opcional:** ese archivo hoy depende del stub y dejaria de compilar.

- [x] Cambiar el doble por defecto: el `beforeEach` carga hoy el stub real
      (`realStub.verifyCredentials`, que ya no existe: ahora es `createVerifyCredentials`).
      Se sustituye por un `verifyCredentialsMock` explicito por caso — la action se testea
      contra un doble, no contra el dominio real.
- [x] **Borrar** el test `'rechaza todo intento valido mientras no hay verificacion real'`:
      afirma justo el comportamiento que esta feature elimina. Su intencion (un intento
      valido que el dominio rechaza sigue dando `status: 'error'` sin redirigir) ya la cubre
      `'usa el mismo mensaje para usuario inexistente y para contrasena incorrecta'`.
- [x] **Conservar sin tocar** `'no accede a base de datos ni emite cookie'`: sigue siendo
      cierto y ahora vale mas que antes — demuestra que ni la Server Action ni el dominio
      importan Prisma ni `next/headers`, que es lo que obliga a que todo entre por puertos.
- [x] No se toca ninguna otra asercion del archivo: la forma de `LoginFormState`, el
      `attemptId`, el mensaje generico y la redireccion se quedan como estan.
- **Hecho cuando:** el archivo pasa entero y el diff se limita a lo de arriba.
      **Cubre R16, R17 (parte) y R19.**

## T7 — `.env.example` y documentacion del secreto  `[P con T8]`

Depende de: T5.

- [x] Añadir `SESSION_SECRET=` con placeholder y un comentario de una linea (>= 32
      caracteres, distinto por entorno). **Sin valor real.**
- **Hecho cuando:** `guard-password-never-plaintext` y el resto de guardias siguen verdes y
      `.env.example` no contiene ningun secreto. **Refuerza R13.**

## T8 — Integracion contra Postgres real  `[P con T7]`

Depende de: T3, T6.

- [x] `tests/integration/identity/login.int.test.ts` segun `design.md > 7`: `beforeAll` crea
      rol y usuario propios con `username` aleatorio y hash real; `afterAll` los borra por id
      en `finally`.
- [x] Casos: login correcto contra fila real, contrasena incorrecta, usuario con `deleted_at`
      puesto, y nombre de usuario con otra combinacion de mayusculas.
- [x] Casos del bloqueo contra columnas reales: cinco fallos seguidos dejan
      `failed_login_attempts = 0`, `lock_level = 1` y `locked_until` en el futuro; un login
      correcto despues de un par de fallos deja las tres columnas a cero/`null`; un usuario con
      `locked_until` en el futuro no entra ni con la contrasena correcta.
- **Hecho cuando:** el archivo pasa contra la base de test y, corrido dos veces seguidas,
      vuelve a pasar (limpieza correcta). **Cubre R1, R4, R5, R22, R24, R27, R30 end-to-end y
      R21.**

## T9 — Guardia de arquitectura, explicita

Depende de: T6.

- [x] `pnpm exec vitest run guard` — **las cinco guardias**, no solo la de arquitectura.
- [x] Revisar a mano lo que la guardia **no** comprueba (`CHECKPOINTS.md`): que la logica de
      negocio esta en `domain/` y no en la Server Action, y que ningun driving instancia su
      driven.
- **Hecho cuando:** `vitest run guard` en verde con los archivos nuevos, y queda anotado en
      `progress/impl_*.md` que el bloque 13 (fila driven) pasa con `next/headers` en
      `session-cookie.ts` — lo que motiva la **pregunta abierta 5**. **Cubre R18** (bloque 6:
      el contrato no arrastra servidor) **y R17.**

> **No hay T10, y no es un olvido.** La numeracion se dejo con ese hueco al reordenar las
> tasks mientras se escribia el spec; renumerar T11-T13 despues habria invalidado las
> referencias cruzadas del `design.md` y de la tabla de trazabilidad. Se deja el hueco a
> proposito y se dice, que es mas barato que una renumeracion silenciosa.
> (Anotado tras la revision, menor M8.)

## T11 — Instalar Playwright Y registrarlo, EN EL MISMO PASO  `[P con T8]`

Depende de: T0. Aprobado por el humano el 2026-09-01 (`design.md > 6.4`).

> **No lo partas en dos commits.** `guard-dependencias-aprobadas` es **bidireccional**: una
> fila sin el paquete instalado da rojo igual que un paquete sin fila. Ya se intento por
> separado y salio rojo.

- [x] `pnpm add -D @playwright/test@1.62.1` y `pnpm exec playwright install chromium webkit`.
- [x] **En el mismo cambio**, añadir a `docs/dependencias.md`:
      `| @playwright/test | Runner E2E del flujo de autenticacion (QC-7) | aprobada |
      2026-09-01 | dev — cuatro checks OK: no deprecada; ultima publicacion 2026-09-01;
      58,4M descargas/semana; Apache-2.0. Aprobada por el humano |`.
- [x] `playwright.config.ts` con proyectos **chromium** y **webkit** (WebKit es el motor de
      iOS) y `webServer` levantando `next dev`. Excluir `e2e/` del `include` de Vitest para
      que los dos runners no se pisen.
- [x] Script `"e2e": "playwright test"` en `package.json`.
- **Hecho cuando:** `pnpm exec vitest run guard` pasa **entero** (en especial
      `guard-dependencias-aprobadas`, en las dos direcciones) y `pnpm exec playwright test
      --list` no falla.

## T12 — E2E del flujo de autenticacion

Depende de: T6, T8, T11.

- [x] `e2e/login.spec.ts` segun `design.md > 7` nivel 4: fixture que crea su usuario de prueba
      y lo borra al final (**no** usa el seed de QC-6).
- [x] Camino feliz: la URL acaba en `DASHBOARD_ROUTE` y `context.cookies()` trae `qc_session`
      con `httpOnly: true`. Que `/dashboard` sea hoy un 404 (QC-12 `pending`) **no invalida el
      test**: se afirma el destino y la cookie, no el contenido.
- [x] Camino de error: credenciales malas -> se sigue en `/login`, se ve
      `GENERIC_CREDENTIALS_ERROR` y **no** hay cookie `qc_session`.
- **Hecho cuando:** `pnpm run e2e` pasa en chromium y webkit. **Cubre R1, R2, R9 y R19 en
      navegador real**, y salda la deuda "E2E diferido" que arrastran QC-10 y QC-11 en
      `progress/current.md`.

## T13 — Gate completo y trazabilidad (ultima)

Depende de: T1-T9, T11, T12.

- [x] `./init.sh` completo en verde (obligatorio antes del PR, sin excepcion). Corrido por
      el leader el 2026-09-01 **tras cerrar M-B1**: 27 archivos, 278 tests, sin rojos nuevos,
      baseline vacio. La corrida anterior (274 tests) quedo invalidada por los cambios del
      arreglo: una casilla marcada sobre una corrida vieja es una casilla mentirosa.
- [x] `progress/impl_QC-7-login-usuario-y-contrasena.md` con la salida real de los tests y el
      mapa `R<n> -> test` de la tabla de abajo.
- [x] Anotar en `progress/current.md > Deudas`: (a) el logout de QC-8 borra la cookie pero no
      revoca el token (`design.md > 6.2`); (b) bloqueo **por cuenta**, riesgo de DoS dirigido
      aceptado por el humano y sin limite por IP (`design.md > 6.5`); (c) un usuario bloqueado
      no sabe que lo esta — revisar cuando exista recuperacion de contrasena
      (`design.md > 5.5`); (d) el nivel de escalada solo baja con un login exitoso, no decae
      con el tiempo.
- [x] Anotar en `progress/current.md` que la complejidad real de la ficha fue **`high`** (el
      board la tiene sin complejidad asignada) y que el bloqueo entro como alcance añadido.
- **Hecho cuando:** los tres puntos estan hechos y `CHECKPOINTS.md` se recorre entero sin
      casilla vacia (salvo el E2E, que queda con su razon escrita).

---

## Trazabilidad `R<n> -> test`

| R | Test |
| --- | --- |
| R1 | `tests/unit/identity/verify-credentials.test.ts` — "acepta usuario activo con contrasena correcta"; `tests/integration/identity/login.int.test.ts` — "autentica contra una fila real" |
| R2 | `verify-credentials.test.ts` — "usuario inexistente devuelve el resultado generico" |
| R3 | `verify-credentials.test.ts` — "contrasena incorrecta devuelve un resultado indistinguible del de usuario inexistente" |
| R4 | `verify-credentials.test.ts` — "el usuario no distingue mayusculas ni espacios, la contrasena si"; `login.int.test.ts` — "encuentra al usuario escrito en otra caja" |
| R5 | `verify-credentials.test.ts` — "un usuario borrado no autentica"; `login.int.test.ts` — "con deleted_at no autentica" |
| R6 | `verify-credentials.test.ts` — "verifica un hash señuelo cuando el usuario no existe" |
| R7 | `verify-credentials.test.ts` — "el señuelo se produce con el hasher del sistema y se calcula una sola vez" |
| R8 | `verify-credentials.test.ts` — "entrada invalida no toca ningun puerto" |
| R9 | `tests/unit/identity/session-cookie.test.ts` — "la cookie se emite httpOnly" |
| R10 | `session-cookie.test.ts` — "sameSite lax, path / y secure solo en produccion" |
| R11 | `session-cookie.test.ts` — "maxAge y exp coinciden con la duracion"; `tests/unit/identity/session-ticket.test.ts` — "el ticket caduca a las 8 h" |
| R12 | `session-cookie.test.ts` — "el valor va firmado con HMAC y solo lleva sub/iat/exp" |
| R13 | `session-cookie.test.ts` — "sin secreto valido lanza y no escribe cookie" |
| R14 | `verify-credentials.test.ts` — "ningun fallo emite sesion" |
| R15 | `session-cookie.test.ts` — "no se registra contrasena, hash ni valor de cookie" |
| R16 | `tests/unit/identity/login-action.test.ts` — "conserva el usuario escrito tras un intento rechazado", "el estado devuelto nunca contiene la contrasena", "genera un attemptId distinto por invocacion" (aserciones **intactas**; el archivo solo cambia lo que dice T6b) |
| R17 | `verify-credentials.test.ts` — "el caso de uso se construye con puertos"; `tests/guards/guard-arquitectura-modulos.test.ts` (bloques 4, 7, 13) |
| R18 | `guard-arquitectura-modulos.test.ts` — bloque 6 (contrato limpio, cierre transitivo) |
| R19 | `login-action.test.ts` — "redirige a /dashboard cuando las credenciales son aceptadas y no emite toast" (existente, sin cambios) |
| R20 | `tests/unit/identity/logout-action.test.ts` (existente, **sin modificar**) |
| R21 | `login.int.test.ts` — `beforeAll`/`afterAll` crean y limpian sus propios datos; ninguna referencia al seed; `e2e/login.spec.ts` usa el mismo fixture |
| R22 | `tests/unit/identity/account-lock.test.ts` — "el quinto fallo bloquea y reinicia el contador"; `login.int.test.ts` — "cinco fallos dejan la cuenta bloqueada en la base" |
| R23 | `account-lock.test.ts` — "la escalada es 1, 5, 15 y 60 minutos y no pasa de 60" |
| R24 | `verify-credentials.test.ts` — "una cuenta bloqueada no entra ni con la contrasena correcta"; `login.int.test.ts` — mismo caso contra fila real |
| R25 | `verify-credentials.test.ts` — "un intento durante el bloqueo no escribe nada"; `account-lock.test.ts` — "fallo estando bloqueada devuelve el mismo estado" |
| R26 | `account-lock.test.ts` — "con el bloqueo caducado vuelve a aceptar intentos" |
| R27 | `verify-credentials.test.ts` — "el exito reinicia contador, nivel y bloqueo"; `account-lock.test.ts` — caso `success`; `login.int.test.ts` — columnas a cero |
| R28 | `verify-credentials.test.ts` — "bloqueada, contrasena mala y usuario inexistente devuelven el mismo objeto" |
| R29 | `verify-credentials.test.ts` — "el camino bloqueado verifica el hash una vez, igual que los otros" |
| R30 | `tests/unit/identity/schema/identity-schema.test.ts` + `identity-migration.test.ts` (extendidos con las tres columnas); verificacion manual de `db:migrate` / `db:rollback` en T2b, pegada en `progress/impl_*.md` |
| R31 | `verify-credentials.test.ts` — "un usuario inexistente no provoca ninguna escritura" |
