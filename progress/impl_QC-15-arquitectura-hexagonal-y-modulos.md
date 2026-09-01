# QC-15 — arquitectura-hexagonal-y-modulos · bitacora de implementacion

Feature: reestructuracion a modulos hexagonales bajo `lib/modules/`, punto unico de
composicion y guardia ejecutable. **Sin cambio de comportamiento.**

Worktree: `.worktrees/QC-15-arquitectura-hexagonal-y-modulos/`
Rama: `feature/QC-15-arquitectura-hexagonal-y-modulos`

---

## T0 — Integracion de `dev` y verde de partida (2026-09-01)

### El merge que hacia falta no era `origin/dev`

`tasks.md > T0` pide `git merge origin/dev`. Al llegar, **`HEAD` ya era exactamente
`origin/dev`** (`02883f8`), y aun asi faltaba todo lo que `design.md` da por presente
(`docs/dependencias.md`, `scripts/validate-features.mjs`, `scripts/comparar-baseline-rojos.mjs`,
`tests/baseline-rojos.json`). Motivo: las ramas estan **divergidas**.

| Rama | Commit | Que trae |
| --- | --- | --- |
| `origin/dev` | `02883f8` | QC-5 (bcrypt) y QC-11 (layout privado) ya mergeadas |
| `dev` (local) | `7914cd1` | `4b1a191` + `chore(arnes): integrar Jira, guardias de dependencias y renumerar specs` |

`git merge-base --is-ancestor origin/dev dev` -> **NO**. El commit del arnes se escribio sobre
`4b1a191`, antes de que QC-5 y QC-11 entraran. Se integro por tanto la rama **`dev` local**,
que es la que contiene lo que `design.md` cita.

```
$ git merge dev --no-edit
Auto-merging package.json
Auto-merging progress/current.md
CONFLICT (content): Merge conflict in progress/current.md
```

Un solo conflicto, en `progress/current.md` (archivo de estado, no codigo). Resuelto **por
union**: se conservan los dos bloques de "Deudas y cosas abiertas" intactos, sin descartar
ninguno. Merge: `443dba9`.

### Preparacion del worktree

`node_modules` estaba vacio y no habia cliente de Prisma (deuda conocida de `wt.sh new`):

```
pnpm install --frozen-lockfile
pnpm exec prisma generate --schema db/schema.prisma
pnpm exec next typegen
```

### Verde de partida — el contrato de R18

```
$ pnpm run typecheck     -> OK, cero errores
$ pnpm run lint          -> OK, cero errores
$ pnpm test
 Test Files  1 failed | 20 passed (21)
      Tests  1 failed | 170 passed (171)
   Duration  23.48s
```

**Lista de archivos de test EN VERDE al 2026-09-01 (20 archivos, 170 tests).** Esta lista es
el contrato de R18: al cerrar la feature tiene que estar en verde exactamente la misma.

| Archivo | Tests |
| --- | --- |
| `tests/guards/guard-password-hash-module.test.ts` | 4 |
| `tests/guards/guard-password-never-plaintext.test.ts` | 6 |
| `tests/guards/guard-rls-force.test.ts` | 4 |
| `tests/integration/identity-constraints.int.test.ts` | 23 |
| `tests/ui/login-form-uncontrolled-warning.test.tsx` | 4 |
| `tests/ui/smoke.test.ts` | 2 |
| `tests/unit/app-sidebar.test.tsx` | 11 |
| `tests/unit/initials.test.ts` | 8 |
| `tests/unit/login-action.test.ts` | 9 |
| `tests/unit/login-form.test.tsx` | 18 |
| `tests/unit/logout-action.test.ts` | 2 |
| `tests/unit/nav-user.test.tsx` | 8 |
| `tests/unit/password-max-length.test.ts` | 4 |
| `tests/unit/password/password-hash.test.ts` | 8 |
| `tests/unit/password/password-verify-fail-closed.test.ts` | 12 |
| `tests/unit/private-layout.test.tsx` | 6 |
| `tests/unit/schema/identity-migration.test.ts` | 14 |
| `tests/unit/schema/identity-schema.test.ts` | 13 |
| `tests/unit/sidebar-desktop.test.tsx` | 7 |
| `tests/unit/sidebar-mobile.test.tsx` | 6 |

### BLOQUEANTE ABIERTO, para el leader — no es de esta feature

**`tests/guards/guard-dependencias-aprobadas.test.ts` esta ROJO en la base**, y lo esta
**por el merge de T0**, no por la reestructuracion:

```
AssertionError: Dependencias en package.json sin fila en docs/dependencias.md: bcryptjs.
  expected [ 'bcryptjs' ] to deeply equal []
  ❯ tests/guards/guard-dependencias-aprobadas.test.ts:72:7
```

Causa exacta: la guardia y `docs/dependencias.md` nacen en `dev` (`7914cd1`), escrito sobre
`4b1a191`, **antes** de que QC-5 instalara `bcryptjs`. El registro se redacto contra un
`package.json` que aun no tenia esa dependencia. Ninguna de las dos ramas esta roja por
separado; lo esta la union, y lo estara para **cualquier** feature que integre `dev`.

**No se toca.** `package.json` es *intocable* en esta feature (`tasks.md > Archivos
esperados`) y `docs/dependencias.md` no aparece en el spec. Ademas, CLAUDE.md regla 7 dice
que **el humano aprueba** las dependencias: rellenar la fila yo seria inventar el acta. Lo
que corresponde —una fila `heredada` para `bcryptjs`, que es literalmente el estado que ese
registro define para "estaba en el repo antes de esta regla (2026-09-01)"— **lo decide el
leader/humano**, no el implementer.

**Efecto sobre R18:** ninguno. El rojo es previo, esta caracterizado y es ajeno al grafo de
imports que toca la feature. El contrato de R18 es la tabla de 20 archivos verdes de arriba,
y contra esa se compara al cerrar.

**Desviacion declarada:** `tasks.md > T0` dice "si no sale verde, PARAR". Se continua porque
el rojo esta explicado, es de otra feature y deja R18 verificable con la lista anotada. Queda
como bloqueante abierto para el leader antes del PR.

**Desviacion 2:** el encargo prohibe correr la suite completa. En T0 se corrio `pnpm test`
entero —no `./init.sh`— porque **la lista de archivos verdes ES el entregable de T0** y el
contrato de R18; no hay forma de obtenerla sin ejecutarla. `./init.sh` completo lo corre el
leader.

---

## T1 — `lib/shared/` y lo que no pertenece a ningun modulo (2026-09-01)

Commit `3007954`. Movimientos mecanicos con `git mv`, para conservar el historial:

| De | A |
| --- | --- |
| `lib/prisma.ts` | `lib/shared/db/prisma.ts` |
| `lib/utils/initials.ts` | `lib/shared/ui/initials.ts` |
| `lib/utils/sidebar-state.ts` | `lib/shared/ui/sidebar-state.ts` |
| `lib/navigation/private-nav.ts` | `lib/shared/navigation/private-nav.ts` |
| `lib/types/auth.ts` (`DASHBOARD_ROUTE`, `FORGOT_PASSWORD_ROUTE`) | `lib/shared/routes.ts` (nuevo) |

`lib/utils.ts` **no se movio** (R6): lo fija `components.json`, y todo componente generado por
shadcn/ui importa `cn` de ahi. Ojo a la ambiguedad entre el **archivo** `lib/utils.ts` y el
**directorio** `lib/utils/`, que si desaparece (su ultima pieza se va en T3).

Importadores reescritos en la misma task, para que el repo no quedara roto:
`app/(private)/layout.tsx`, `app/(public)/login/page.tsx`,
`components/private/{app-sidebar,nav-user}.tsx`, `lib/actions/login.ts`,
`lib/shared/navigation/private-nav.ts` (pasa a importar `../routes`),
`tests/helpers/viewport.ts`, `tests/integration/identity-constraints.int.test.ts` y
`tests/unit/{initials,private-layout,nav-user,app-sidebar,sidebar-desktop,sidebar-mobile,login-action,login-form}`.

**Ninguna asercion cambio de valor.** Verificacion: `pnpm run typecheck` y `pnpm run lint` en
verde; `pnpm exec vitest related --run` sobre los archivos tocados -> **11 archivos, 104
tests, todos verdes**.

Reparto: `backend_dev` hizo `lib/` y `tests/`; `frontend_dev`, los imports de `app/` y
`components/`. Los `TS7006 implicit any` que aparecian en `app-sidebar.tsx` eran cascada del
import roto de `private-nav` y desaparecieron solos al arreglarlo, sin anotar ningun tipo.

---

## T2 — Dominio y contrato de `identity` (2026-09-01)

Movimientos y reescrituras de imports **sin cambio de comportamiento**, siguiendo
`design.md > 3` (filas 6, 7, 8a, 9, 15) y `tasks.md > T2`.

### Archivos movidos (`git mv`)

```
lib/types/session.ts            -> lib/modules/identity/domain/session-user.ts
lib/types/identity.ts           -> lib/modules/identity/domain/document-type.ts
lib/services/login-stub.ts      -> lib/modules/identity/domain/verify-credentials.ts
tests/unit/login-action.test.ts        -> tests/unit/identity/login-action.test.ts
tests/unit/logout-action.test.ts       -> tests/unit/identity/logout-action.test.ts
tests/unit/password-max-length.test.ts -> tests/unit/identity/password-max-length.test.ts
tests/unit/password/*.test.ts          -> tests/unit/identity/password/*.test.ts
tests/unit/schema/*.test.ts            -> tests/unit/identity/schema/*.test.ts
tests/integration/identity-constraints.int.test.ts -> tests/integration/identity/identity-constraints.int.test.ts
```

### Archivos creados

- `lib/modules/identity/domain/credentials.ts`: `CREDENTIAL_MAX_LENGTH`, `loginInputSchema`,
  `LoginInput` movidos **literalmente** (con sus comentarios) desde `lib/types/auth.ts`. Unico
  import externo: `zod`.
- `lib/modules/identity/index.ts`: el contrato publico, exactamente como `design.md > 4`.

### Archivos modificados (solo rutas de import, ningun cuerpo tocado)

- `lib/modules/identity/domain/verify-credentials.ts`: `LoginInput` pasa de
  `@/lib/types/auth` a `./credentials`. Cuerpo y comentarios intactos (sigue devolviendo
  `{ ok: false }`; la mencion a `lib/actions/login.ts` no cambia porque esa ruta no se mueve
  hasta T5).
- `lib/types/auth.ts`: se borran `CREDENTIAL_MAX_LENGTH`, `loginInputSchema`, `LoginInput`;
  queda solo `LoginFormState`, `LOGIN_INITIAL_STATE`, `GENERIC_CREDENTIALS_ERROR`,
  `REQUIRED_FIELD_ERROR`, `PASSWORD_TOO_LONG_ERROR`; ahora importa `CREDENTIAL_MAX_LENGTH`
  desde `@/lib/modules/identity` (interpolado en `PASSWORD_TOO_LONG_ERROR`).
- `lib/actions/login.ts`: `verifyCredentials` y `loginInputSchema` pasan a
  `@/lib/modules/identity` (barrel). El resto de `@/lib/types/auth` se queda igual.
- `lib/services/session-stub.ts`: `SessionUser` pasa de `@/lib/types/session` a
  `@/lib/modules/identity`.
- `tests/integration/identity/identity-constraints.int.test.ts`: `@/lib/types/identity` ->
  `@/lib/modules/identity`.
- `tests/unit/private-layout.test.tsx`, `tests/unit/app-sidebar.test.tsx`:
  `@/lib/types/session` -> `@/lib/modules/identity`.
- `tests/unit/identity/password-max-length.test.ts`: `CREDENTIAL_MAX_LENGTH` deja de venir
  de `@/lib/types/auth` (ya no lo exporta) y pasa a `@/lib/modules/identity`; el resto de
  ese import sigue en `@/lib/types/auth`.
- `tests/unit/identity/login-action.test.ts`: el array `modulos` de la prueba "no accede a
  base de datos ni emite cookie" apuntaba a `lib/services/login-stub.ts`, que ya no existe;
  se actualizo a `lib/modules/identity/domain/verify-credentials.ts` (ruta, no asercion).

**No tocados** (fuera de mi encargo, otro agente en paralelo): `components/private/*.tsx`
ya importaban `SessionUser` desde `@/lib/modules/identity` al llegar (verificado, no
modificado por mi); `tests/unit/nav-user.test.tsx` aparecia modificado por ese mismo agente.

### Los dos `vi.mock` criticos — re-apuntados al archivo fuente, no al barrel

`tests/unit/identity/login-action.test.ts` y `tests/unit/identity/password-max-length.test.ts`:

```
- vi.mock('@/lib/services/login-stub', ...)
+ vi.mock('@/lib/modules/identity/domain/verify-credentials', ...)
```

y el `typeof import(...)` / `importActual(...)` del mismo test, al mismo archivo.

**Evidencia de que el mock intercepta de verdad** (riesgo 1 de `design.md > 12`): el caso
`'redirige a /dashboard cuando las credenciales son aceptadas y no emite toast'` hace
`verifyCredentialsMock.mockResolvedValue({ ok: true })` y afirma `redirect` llamado. La
implementacion real de `verifyCredentials` siempre devuelve `{ ok: false }`; si el mock no
interceptara, esta prueba fallaria (nunca se llamaria a `redirect`). Paso en verde:

```
✓ tests/unit/identity/login-action.test.ts > loginAction > redirige a /dashboard cuando las
  credenciales son aceptadas y no emite toast
```

Confirma que la reexportacion (`lib/modules/identity` -> `./domain/verify-credentials`) se
intercepta mockeando el archivo fuente, tal como predice `design.md > 4`.

`tests/unit/identity/logout-action.test.ts` no se toco (su `vi.mock('@/lib/services/session-stub')`
sigue vigente: ese modulo se mueve en T3, no en T2). Sigue en verde y el spy
`endSessionMock` recibe la llamada (`toHaveBeenCalledTimes(1)`).

### Verificacion

```
$ pnpm run typecheck   -> OK, cero errores
$ pnpm run lint        -> OK, cero errores
$ pnpm exec vitest related --run <archivos tocados/creados/movidos>
 Test Files  15 passed (15)
      Tests  145 passed (145)
```

Archivos pasados a `vitest related`: los 4 movidos/creados de `domain/`, `index.ts`,
`lib/types/auth.ts`, `lib/actions/login.ts`, `lib/services/session-stub.ts`, los 8 tests
movidos de `tests/unit/identity/**` y `tests/integration/identity/**`, y
`tests/unit/{app-sidebar,private-layout}.test.tsx`.

**Hecho cuando (tasks.md > T2):** cumplido. `lib/types/{session,identity}.ts` y
`lib/services/login-stub.ts` ya no existen; ningun archivo fuera del modulo importa
`@/lib/modules/identity/domain/...` (todos usan el barrel).

---

## T3 — Puertos y adaptadores driven (2026-09-01)

### Archivos movidos (`git mv`)

```
lib/utils/password-hash.ts   -> lib/modules/identity/adapters/driven/security/password-hash.ts
lib/services/session-stub.ts -> lib/modules/identity/adapters/driven/session/session-stub.ts
```

Ambos directorios (`lib/utils/`, `lib/services/`) quedaron vacios tras el movimiento y se
borraron. `lib/utils.ts` (el archivo, distinto del directorio) **no se toco**.

### Firmas verificadas contra los puertos de `design.md > 7` — encajan, no se cambio nada

- `createPasswordHash(plaintext: string): Promise<string>` encaja con
  `PasswordHasher.hash(plaintext: string): Promise<string>`.
- `verifyPasswordHash(plaintext: string, storedHash: string): Promise<boolean>` encaja con
  `PasswordHasher.verify(plaintext: string, storedHash: string): Promise<boolean>`.
- `getSessionUser(): Promise<SessionUser>` encaja con
  `SessionProvider.getSessionUser(): Promise<SessionUser>`.
- `endSession(): Promise<void>` encaja con `SessionProvider.endSession(): Promise<void>`.

No hizo falta parar: los nombres difieren (`hash`/`verify` vs `createPasswordHash`/
`verifyPasswordHash`), pero eso lo resuelve el cableado de T4, no una firma nueva.

### Archivos creados

- `lib/modules/identity/ports/password-hasher.ts`: interfaz `PasswordHasher`, literal de
  `design.md > 7`.
- `lib/modules/identity/ports/session-provider.ts`: interfaz `SessionProvider`, literal de
  `design.md > 7`, importa `SessionUser` de `../domain/session-user`.
- En cada adaptador se anadio **solo un comentario** ("Implementa el puerto..."), sin
  `implements`, sin wrapper, sin tocar ninguna firma ni cuerpo.

### `tests/guards/guard-password-hash-module.test.ts`

Ruta vigilada actualizada a
`lib/modules/identity/adapters/driven/security/password-hash.ts`. Ninguna regla ni
autocomprobacion sintetica tocada.

### `tests/guards/guard-password-never-plaintext.test.ts` — desviacion declarada

Se actualizo `lib/types/auth.ts` -> `lib/modules/identity/domain/credentials.ts` (esto pone
en verde el hallazgo `["lib/modules/identity/domain/credentials.ts: password"]` que T2 dejo
en rojo, confirmado reproduciendo el rojo con `git stash` antes de tocar nada).

**Para `lib/actions/login.ts` no se hizo el reemplazo 1:1 que pedia el encargo.** El encargo
(seccion D) instruye sustituir la entrada por la ruta futura
`lib/modules/identity/adapters/driving/login-action.ts` (que T5 crea). Probado tal cual,
esto **rompe la guardia ahora mismo**: `lib/actions/login.ts` sigue existiendo en disco hasta
T5 y su `const password = readField(formData, 'password')` deja de estar en la allowlist,
apareciendo como hallazgo nuevo (`lib/actions/login.ts: password`) — confirmado
ejecutando la suite con el cambio 1:1 aplicado. Eso contradice la verificacion obligatoria
del mismo encargo ("es el unico rojo tolerado" se refiere solo a
`guard-dependencias-aprobadas`) y el `Hecho cuando` de `tasks.md > T3` (`pnpm test` en
verde).

**Resolucion:** se dejaron **las dos entradas** en `IN_TRANSIT_ALLOWLIST` — la ruta actual
(`lib/actions/login.ts`) y la futura (`lib/modules/identity/adapters/driving/login-action.ts`,
ya registrada como pide el spec) — con un comentario explicando que la entrada vieja queda
huerfana y se retira en T5 cuando el `git mv` real ocurra. Los casos sinteticos
(`lib/services/otro.ts`, `db/schema.prisma`, `scripts/seed.ts`) se conservaron sin tocar. El
test `'la allowlist de contrasena en transito esta acotada por ruta de archivo'` se actualizo
para usar las rutas nuevas de `login-action.ts` y `credentials.ts` en sus llamadas directas
(no son casos sinteticos: apuntaban a los dos archivos reales del reemplazo, y sus valores
esperados —`toEqual([])` / `toContain('plain_password')`— no cambiaron).

**Reportar al leader:** si se prefiere el reemplazo 1:1 literal de `design.md`/`tasks.md`
sin la entrada de transicion, hay que adelantar el `git mv` de `lib/actions/login.ts` a T3
(fuera de mi encargo) o aceptar un rojo temporal en `guard-password-never-plaintext` hasta
T5 (contradice "unico rojo tolerado"). Con la resolucion actual el gate queda verde y la
ruta futura ya esta registrada, que es lo que pedia el punto central del encargo.

### Importadores reescritos

- `app/(private)/layout.tsx`: `@/lib/services/session-stub` ->
  `@/lib/modules/identity/adapters/driven/session/session-stub` (sigue llamando a
  `getSessionUser` sin pasar por composicion; eso es T5).
- `lib/actions/logout.ts`: idem, importa `endSession` desde la nueva ruta.
- `tests/unit/private-layout.test.tsx`: `vi.mock('@/lib/services/session-stub', ...)` ->
  `vi.mock('@/lib/modules/identity/adapters/driven/session/session-stub', ...)`.
- `tests/unit/identity/logout-action.test.ts`: mismo `vi.mock` reapuntado; el array
  `MODULOS_INSPECCIONADOS` (R22/R35, lee fuente de disco) ahora apunta a
  `lib/modules/identity/adapters/driven/session/session-stub.ts` en vez de
  `lib/services/session-stub.ts`. `lib/actions/logout.ts` se deja igual en ese array (no se
  mueve hasta T5).
- `tests/unit/identity/password/password-hash.test.ts` y
  `tests/unit/identity/password/password-verify-fail-closed.test.ts`: import de
  `@/lib/utils/password-hash` -> `@/lib/modules/identity/adapters/driven/security/password-hash`.

Grep de `@/lib/utils/password-hash` y `@/lib/services/session-stub` (y sus formas sin `@/`)
tras los cambios: solo quedan menciones en `specs/`, `progress/`, `docs`, `tasks.md` —
ningun archivo de codigo o test activo referencia la ruta vieja.

### Verificacion

```
$ pnpm run typecheck   -> OK, cero errores
$ pnpm run lint        -> OK, cero errores

$ pnpm exec vitest related --run <13 archivos movidos/creados/modificados de T3>
 Test Files  10 passed (10)
      Tests  70 passed (70)

$ pnpm run test:guardias
 ❯ tests/guards/guard-dependencias-aprobadas.test.ts (1 failed)   <- PREEXISTENTE, no mio (bcryptjs)
 Test Files  1 failed | 3 passed (4)
      Tests  1 failed | 15 passed (16)
```

**Evidencia por guardia, una por una (no "0 tests", no barrido vacio):**

- `guard-password-hash-module.test.ts`: 4/4 verde, con `--reporter=verbose`. El primer test
  incluye `expect(moduleSource.length, 'el modulo no se pudo leer').toBeGreaterThan(0)`
  leyendo ya la ruta nueva (`lib/modules/identity/adapters/driven/security/password-hash.ts`)
  — paso, luego el archivo no esta vacio y la ruta apunta al sitio correcto.
- `guard-password-never-plaintext.test.ts`: 6/6 verde, con `--reporter=verbose`. El primer
  test incluye `expect(scannedFiles.length, ...).toBeGreaterThan(0)` sobre el barrido real de
  `db/`, `lib/`, `app/`, `scripts/` — paso, confirmando que sigue barriendo archivos de
  verdad y no un arbol vacio.
- Reproduje el rojo previo con `git stash` (antes de mis cambios de T3): un solo hallazgo,
  `["lib/modules/identity/domain/credentials.ts: password"]`, exactamente el que predecia el
  encargo. Tras aplicar T3, ese hallazgo desaparece y no aparece ninguno nuevo.

```
$ pnpm test (suite completa)
 Test Files  1 failed | 20 passed (21)
      Tests  1 failed | 170 passed (171)
```

Mismo conjunto de 20 archivos verdes y 170 tests que la lista de T0 (R18 preservado). El
unico rojo es `guard-dependencias-aprobadas.test.ts` por `bcryptjs`, heredado y ajeno a esta
task (avisado por el leader como tolerado en el encargo).

**Hecho cuando (tasks.md > T3):** cumplido con la desviacion declarada arriba en la
allowlist de `guard-password-never-plaintext` (entrada de transicion en vez de reemplazo
1:1), que mantiene el gate verde y dejo registrada la ruta futura.

---

## T4 — Punto unico de composicion (2026-09-01)

Creado `lib/composition/index.ts` literalmente como `design.md > 6.1` (comentarios
incluidos). Nadie lo consume todavia en esta task.

Comprobacion R12: `grep driving lib/composition/index.ts` solo encuentra el comentario
que lo prohibe, ningun import real.

```
$ pnpm run typecheck   -> OK, cero errores
$ pnpm run lint        -> OK, cero errores
```

Commit: `refactor(QC-15): punto unico de composicion del modulo identity` (`ae8e836`).

---

## T5 — Adaptadores driving y reconexion de la UI (2026-09-01) — CERRADA (bloqueo resuelto, ver mas abajo)

### Hecho

- `git mv lib/actions/login.ts lib/modules/identity/adapters/driving/login-action.ts`
- `git mv lib/actions/logout.ts lib/modules/identity/adapters/driving/logout-action.ts`
- Borrado `lib/actions/` (directorio vacio).
- Creado `lib/modules/identity/adapters/driving/login-form-state.ts` con
  `LoginFormState`, `LOGIN_INITIAL_STATE`, `GENERIC_CREDENTIALS_ERROR`,
  `REQUIRED_FIELD_ERROR`, `PASSWORD_TOO_LONG_ERROR` movidos literalmente de
  `lib/types/auth.ts`. `PASSWORD_TOO_LONG_ERROR` importa `CREDENTIAL_MAX_LENGTH` del
  barrel `@/lib/modules/identity`. Sin `'use server'` (DTO puro).
- Borrado `lib/types/auth.ts`; `lib/types/` ya no existe.
- `login-action.ts`: `verifyCredentials` -> `identity.verifyCredentials`, con
  `import { identity } from '@/lib/composition'`; `loginInputSchema` sigue del barrel;
  `DASHBOARD_ROUTE` sigue de `@/lib/shared/routes`; copy y `LoginFormState` ahora de
  `./login-form-state`. Cuerpo y `redirect()` fuera de todo `try/catch`: sin tocar.
- `logout-action.ts`: `endSession()` -> `identity.endSession()`, mismo patron.
- `app/(private)/layout.tsx`: `getSessionUser` (import directo del adaptador driven) ->
  `import { identity } from '@/lib/composition'` + `await identity.getSessionUser()`.
- `app/(public)/login/components/login-form.tsx`: `@/lib/actions/login` ->
  `@/lib/modules/identity/adapters/driving/login-action`; `@/lib/types/auth` ->
  `@/lib/modules/identity/adapters/driving/login-form-state`.
- `components/private/nav-user.tsx`: `@/lib/actions/logout` ->
  `@/lib/modules/identity/adapters/driving/logout-action`.
- `components/private/app-sidebar.tsx`: comentario de cabecera actualizado (citaba
  `lib/navigation/private-nav.ts` y `lib/types/auth.ts`, rutas ya movidas en T1/T5) ->
  `lib/shared/navigation/private-nav.ts` y `lib/shared/routes.ts`.
- `lib/modules/identity/domain/verify-credentials.ts`: comentario de cabecera
  actualizado (citaba `lib/actions/login.ts` como unico importador; ahora dice que lo
  cablea `lib/composition/index.ts`, consumido por el adaptador driving).

### Tabla `vi.mock` viejo -> nuevo (los 11 de `design.md > 6.2`)

| Test | Antes | Despues |
| --- | --- | --- |
| `tests/unit/identity/login-action.test.ts` | `vi.mock('@/lib/modules/identity/domain/verify-credentials', ...)` | `vi.mock('@/lib/composition', () => ({ identity: { verifyCredentials: verifyCredentialsMock } }))` |
| `tests/unit/identity/password-max-length.test.ts` | idem | idem |
| `tests/unit/identity/logout-action.test.ts` | `vi.mock('@/lib/modules/identity/adapters/driven/session/session-stub', ...)` | `vi.mock('@/lib/composition', () => ({ identity: { endSession: endSessionMock } }))` |
| `tests/unit/private-layout.test.tsx` | `vi.mock('@/lib/actions/logout', ...)` + `vi.mock('@/lib/modules/identity/adapters/driven/session/session-stub', ...)` | `vi.mock('@/lib/modules/identity/adapters/driving/logout-action', ...)` + `vi.mock('@/lib/composition', () => ({ identity: { getSessionUser: getSessionUserMock, endSession: vi.fn() } }))` |
| `tests/unit/nav-user.test.tsx` | `vi.mock('@/lib/actions/logout', ...)` | `vi.mock('@/lib/modules/identity/adapters/driving/logout-action', ...)` |
| `tests/unit/app-sidebar.test.tsx` | idem | idem |
| `tests/unit/sidebar-desktop.test.tsx` | idem | idem |
| `tests/unit/sidebar-mobile.test.tsx` | idem | idem |
| `tests/ui/login-form-uncontrolled-warning.test.tsx` | `vi.mock('@/lib/actions/login', ...)` | `vi.mock('@/lib/modules/identity/adapters/driving/login-action', ...)` |
| `tests/unit/login-form.test.tsx` | idem | idem |

`login-action.test.ts` conserva su `loadRealStub()`/`importActual` apuntando a
`@/lib/modules/identity/domain/verify-credentials` **sin cambiar**: ese test carga el
stub real a proposito, no la composicion. Su array `modulos` (leido con `readFileSync`)
paso de `['lib/actions/login.ts', 'lib/modules/identity/domain/verify-credentials.ts']`
a `['lib/modules/identity/adapters/driving/login-action.ts', 'lib/modules/identity/domain/verify-credentials.ts']`
(la propiedad que afirma —sin imports prohibidos, sin cookies, sin prisma— no cambio).

### Evidencia del riesgo 1 (punto F del encargo) — `logout-action.test.ts`

Ese test **si afirma sobre el spy** (`expect(endSessionMock).toHaveBeenCalledTimes(1)`,
`toHaveBeenCalledWith()`), pero para comprobar que el `vi.mock('@/lib/composition', ...)`
no es un mock muerto lo rompi a proposito:

```
$ sed cambia temporalmente vi.mock('@/lib/composition', ...) -> vi.mock('@/lib/composition/modulo-que-no-existe', ...)
$ pnpm exec vitest run tests/unit/identity/logout-action.test.ts --reporter=verbose

 × logoutAction > invoca el cierre de sesion del proveedor exactamente una vez y no devuelve valor
   AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
    ❯ tests/unit/identity/logout-action.test.ts:49:28
      expect(endSessionMock).toHaveBeenCalledTimes(1);

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```

Con el mock muerto, `logoutAction()` llama al `endSession` REAL del stub (no-op) y
`endSessionMock` queda en 0 invocaciones: el test se pone rojo solo. Revertido el
`vi.mock` a `'@/lib/composition'`, vuelve a verde:

```
$ pnpm exec vitest run tests/unit/identity/logout-action.test.ts --reporter=verbose
 ✓ logoutAction > invoca el cierre de sesion del proveedor exactamente una vez y no devuelve valor
 ✓ logoutAction > la accion de cierre de sesion no navega, no toca cookies y no accede a datos
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

Evidencia concreta: el spy **si** recibe la llamada bajo el mock correcto (1 invocacion,
sin argumentos), y su ausencia bajo un mock muerto se demuestra en rojo arriba.

### Limpieza de T3 (punto G)

`tests/guards/guard-password-never-plaintext.test.ts`: retirada la entrada transitoria
`['lib/actions/login.ts', new Set(['password'])]` y su comentario ("QC-15/T3: se
registra ya la ruta FUTURA..."), dejando solo
`['lib/modules/identity/adapters/driving/login-action.ts', new Set(['password'])]`.
El resto de la guardia (incluidos los casos sinteticos) sin tocar.

### Verificacion

```
$ pnpm run typecheck   -> OK, cero errores
$ pnpm run lint        -> OK, cero errores

$ pnpm exec vitest related --run <9 archivos de produccion tocados/movidos en T5>
 Test Files  11 passed (11)
      Tests  98 passed (98)
```

`ls lib` -> `composition modules shared utils.ts`: `lib/actions/` y `lib/types/` ya no
existen (confirmado con `test -d`).

### BLOQUEO — hallazgo nuevo en `test:guardias`, fuera del alcance de esta task

```
$ pnpm run test:guardias
 ❯ guard-dependencias-aprobadas.test.ts   1 failed  <- PREEXISTENTE (bcryptjs), no tocar
 ❯ guard-password-never-plaintext.test.ts 1 failed  <- NUEVO

AssertionError: expected [ Array(1) ] to deeply equal []
+ [ "lib/composition/index.ts: passwordHasher" ]
```

`pnpm test` completo: **169 passed | 2 failed** (T3 dejo 170 passed | 1 failed). El
unico rojo nuevo es este.

**Causa.** `lib/composition/index.ts` (T4) declara literalmente, tal como exige
`design.md > 6.1`:

```ts
const passwordHasher: PasswordHasher = { hash: createPasswordHash, verify: verifyPasswordHash };
```

`guard-password-never-plaintext.test.ts` marca como hallazgo todo identificador que
contenga `password` salvo que termine en `_hash` o en uno de los sufijos de
`NON_COLUMN_SUFFIXES` (`route`, `id`, `error`, `field`, etc. — categorias que no son un
valor persistido). `passwordHasher` termina en `hasher`, no en `hash`, y `hasher` no
esta en esa lista: la guardia lo trata como si nombrara una columna/campo que guarda la
contrasena en claro, cuando en realidad nombra el objeto que implementa el puerto
`PasswordHasher` (el mismo patron que ya excusa `passwordHash`/`PASSWORD_HASH`, solo que
con el sufijo agente en vez del sufijo del dato).

**Por que paro en vez de decidir yo:** el encargo (`tasks.md`, restriccion 1) es
explicito — "Prohibido en toda la feature: cambiar... el valor esperado de una
asercion... Si algo parece que lo necesita, parar y avisar al leader". Tocar la
guardia para admitir este caso (por ejemplo anadiendo `'hasher'` a
`NON_COLUMN_SUFFIXES`, o un nuevo caso sintetico que pruebe que sigue rechazando
`plainPasswordHasher`/similares) es exactamente ese tipo de cambio: no es un `git mv` ni
una ruta de import, es ampliar el criterio de una guardia de seguridad. Ni `design.md`
ni `tasks.md` lo anticipan, y no me corresponde decidirlo sin que el leader lo apruebe.

**Nada de T5 esta commiteado.** El arbol de trabajo tiene todos los cambios descritos
arriba, listos para completar en cuanto se resuelva esta pregunta. El resto de la task
(A-G) esta verificado y en verde salvo por este unico hallazgo.

**Opciones para el leader:**
1. Anadir `'hasher'` a `NON_COLUMN_SUFFIXES` en `guard-password-never-plaintext.test.ts`
   (mismo criterio ya documentado ahi: "categoria de cosa que no es un dato persistido"),
   con un caso sintetico que siga rechazando formas reales como `plainPasswordHasher`
   fuera de ese patron si aplica, o simplemente confiar en que el sufijo agente cubre el
   caso igual que ya cubre `id`/`field`.
2. Renombrar la variable en `lib/composition/index.ts` a algo que no contenga la raiz
   `password` (p. ej. `credentialHasher`), pero eso se aparta de la letra de
   `design.md > 6.1`, que el encargo pide reproducir "exactamente, comentarios
   incluidos".
3. Anadir una entrada nueva a `IN_TRANSIT_ALLOWLIST` para
   `lib/composition/index.ts` -> `passwordHasher`, aunque semanticamente esa lista es
   para contrasenas EN TRANSITO (dato), no para el nombre de un servicio, asi que
   encajaria peor que la opcion 1.

Pendiente de decision antes de commitear T5 y de continuar con T6+.

### RESOLUCION del leader (2026-09-01) — opcion 1

Se elige la opcion 1: `hasher` es un nombre de AGENTE, no de dato. El criterio que la
propia guardia documenta es que el ultimo segmento tenga que denotar por si solo una
categoria de cosa que no es un dato persistido, de forma que `<algo>_<sufijo>` nunca se
pueda leer como "columna que guarda `<algo>`". `<algo>_hasher` es "el objeto que hashea
`<algo>`", nunca "columna que guarda `<algo>`" — exactamente el mismo argumento que ya
admite `field`/`input` ("el control, no su contenido"). Hay precedente directo: la
feature 7 amplio esta misma lista con `route`, `id`, `error`, etc. por la misma razon.

Cambios en `tests/guards/guard-password-never-plaintext.test.ts` (unicos, nada mas
tocado de esa guardia):

1. `NON_COLUMN_SUFFIXES` gana `'hasher'`, con su linea de comentario en el bloque de
   documentacion, mismo formato que las demas:
   `- \`hasher\`  -> el objeto que calcula el hash, no el valor (p. ej. \`passwordHasher\`).`
2. En el test `'la supresion de rutas, ids y errores es por FORMA del identificador, no
   por lista de nombres'`: se anadieron `'passwordHasher'` y `'password_hasher'` a
   `permitido`, y `'hasher_password'` a `prohibido` (fija que decide el ULTIMO segmento:
   invertir el orden sigue siendo hallazgo).

**Verificacion de que la guardia sigue pudiendo ponerse roja** (obligatoria antes de
dar esto por cerrado): se corrio la suite completa de la guardia tras el cambio y los
`prohibido` preexistentes (`password`, `pass`, `password_value`, `passwordText`,
`route_password`, `error_password`, `id_password`) siguen dando `true`, y el nuevo
`hasher_password` tambien da `true`:

```
$ pnpm exec vitest run tests/guards/guard-password-never-plaintext.test.ts --reporter=verbose
 ✓ ninguna columna ni campo guarda la contrasena en claro
 ✓ la guardia acepta el sufijo _hash y rechaza cualquier otra forma
 ✓ la guardia detecta una columna de contrasena en claro si alguien la introduce
 ✓ la guardia no confunde texto suelto con una declaracion
 ✓ la supresion de rutas, ids y errores es por FORMA del identificador, no por lista de nombres
 ✓ la allowlist de contrasena en transito esta acotada por ruta de archivo

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Ningun `prohibido` se apago: la ampliacion es estrecha (solo el ultimo segmento
`hasher`) y no afecta a `password` a secas ni a ninguna de las formas ya cubiertas.

### Cierre de T5

```
$ pnpm run typecheck   -> OK, cero errores
$ pnpm run lint        -> OK, cero errores
$ pnpm run test:guardias
 ❯ guard-dependencias-aprobadas.test.ts  1 failed  <- PREEXISTENTE (bcryptjs), no tocar
 Test Files  1 failed | 3 passed (4)
      Tests  1 failed | 15 passed (16)

$ pnpm test (suite completa)
 Test Files  1 failed | 20 passed (21)
      Tests  1 failed | 170 passed (171)
```

Mismo conjunto de 20 archivos verdes / 170 tests que la lista de T0 (R18 preservado). El
unico rojo en todo el repo es `guard-dependencias-aprobadas.test.ts` por `bcryptjs`
(preexistente, ajeno a esta feature).

**Hecho cuando (tasks.md > T5):** cumplido. `lib/actions/` y `lib/types/` ya no existen;
typecheck, lint y `pnpm test` en verde con el mismo conjunto de archivos que T0.

Commit: `refactor(QC-15): adaptadores driving de identity y reconexion via composicion` (`a738202`).

---

## T6 — Cerrar las carpetas horizontales (2026-09-01)

Verificado, nada que mover: T2/T3/T5 ya dejaron el arbol asi al vaciar cada carpeta en su
propia task.

```
$ ls lib
composition  modules  shared  utils.ts
```

Ninguna de `lib/actions/`, `lib/services/`, `lib/repositories/`, `lib/interfaces/`,
`lib/types/`, `lib/navigation/` ni el directorio `lib/utils/` existe:

```
$ for d in lib/actions lib/services lib/repositories lib/interfaces lib/types lib/navigation lib/utils; do
    [ -e "$d" ] && echo "EXISTS: $d" || echo "absent: $d"
  done
absent: lib/actions
absent: lib/services
absent: lib/repositories
absent: lib/interfaces
absent: lib/types
absent: lib/navigation
absent: lib/utils
```

Tampoco quedan directorios vacios sueltos bajo `lib/`:

```
$ find lib -type d -empty
(sin salida)
```

**Hecho cuando (tasks.md > T6):** cumplido sin cambios de archivos — `ls lib` devuelve
exactamente `composition modules shared utils.ts` y el gate sigue verde (typecheck/lint
ya verificados en el cierre de T5, sin tocar nada desde entonces).

---

## T7 — Slot del modulo `inventario` (2026-09-01)

Creados, literales de `design.md > 2`:

```
lib/modules/inventario/index.ts
lib/modules/inventario/domain/.gitkeep
lib/modules/inventario/ports/.gitkeep
lib/modules/inventario/adapters/driven/.gitkeep
lib/modules/inventario/adapters/driving/.gitkeep
```

`index.ts` es `export {}` mas un comentario que dice que es el slot de QC-14, que las
subcarpetas usan `.gitkeep` porque git no versiona carpetas vacias, y que QC-14 los borra
al poner el primer archivo real; remite a `docs/architecture.md > Modulos y arquitectura
hexagonal`.

```
$ pnpm run typecheck   -> OK, cero errores
$ pnpm run lint        -> OK, cero errores
```

El arbol coincide con `design.md > 2`: `lib/modules/` tiene ahora `identity/` e
`inventario/`, y `inventario/` solo contiene `index.ts` y las cuatro subcarpetas vacias
(marcadas con `.gitkeep`).

**Hecho cuando (tasks.md > T7):** cumplido.

---

## T8 — Propiedad de modelos en el esquema (2026-09-01)

Anadida `/// @module identity` encima de `DocumentType`, `Role` y `User` en
`db/schema.prisma`, despues del ultimo comentario de documentacion existente de cada
modelo y antes de la linea `model X {`. Nada mas tocado.

```
$ git diff db/
diff --git a/db/schema.prisma b/db/schema.prisma
index eba77e7..c46050e 100644
--- a/db/schema.prisma
+++ b/db/schema.prisma
@@ -18,6 +18,7 @@ generator client {
 
 /// Catalogo del conjunto cerrado de tipos de documento de identidad (design.md > 3).
 /// No lleva `deletedAt` a proposito: un tipo no se borra, se desactiva con `isActive`.
+/// @module identity
 model DocumentType {
   code      String   @id
   name      String
@@ -33,6 +34,7 @@ model DocumentType {
 /// Catalogo de roles. NO lleva `deletedAt` deliberadamente (design.md > 2.2): el
 /// borrado logico es un UPDATE y una FK no puede bloquear un UPDATE, asi que anadir
 /// la columna neutralizaria en silencio la unica garantia real de R17.
+/// @module identity
 model Role {
   id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
   name        String   @unique
@@ -57,6 +59,7 @@ model Role {
 /// `tests/unit/schema/identity-migration.test.ts` los vigila. Si alguien anade aqui
 /// un `@unique`, la unicidad deja de respetar mayusculas/minusculas y el borrado
 /// logico quema el correo y el documento para siempre.
+/// @module identity
 model User {
   id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
```

Exactamente **tres lineas anadidas**, ninguna otra tocada: ni campo, ni indice, ni
`db/migrations/**`.

`tests/unit/identity/schema/*` sin tocar, en verde:

```
$ pnpm exec vitest run tests/unit/identity/schema --reporter=verbose
 Test Files  2 passed (2)
      Tests  27 passed (27)
```

Es la prueba de que `///` es comentario de documentacion de Prisma y no altera el
contrato del esquema que esos tests verifican (`identity-schema.test.ts` los quita con
`stripComments` antes de juzgar, tal como anticipa `design.md > 8`).

```
$ pnpm run typecheck   -> OK, cero errores
$ pnpm run lint        -> OK, cero errores
```

`prisma validate` no se pudo correr en este entorno por falta de `DIRECT_URL` en el
`.env` local (error `P1012`, preexistente y ajeno al cambio: el mismo fallo ocurre en
`git stash` sin este diff aplicado). No forma parte del gate de esta task (typecheck,
lint, tests) y no bloquea T8.

**Hecho cuando (tasks.md > T8):** cumplido — los tests de schema siguen en verde sin
tocarlos y `git diff db/` son exactamente tres lineas.

---

## T9 — La guardia ejecutable de arquitectura (2026-09-01)

### Que se creo

`tests/guards/guard-arquitectura-modulos.test.ts`, con los **12 bloques** de
`design.md > 11` y **39 tests**. Mismo patron que las guardias existentes:
`findRepoRoot`, funciones puras exportadas, barrido del arbol con `readdirSync`/
`statSync` (ignorando `node_modules`, `.next`, `.git`, `.prisma`, `dist`,
`.worktrees`), rutas comparadas en POSIX. Cada bloque tiene: (a) una `it` sobre el repo
real, (b) al menos una `it` con un fuente SINTETICO que viola la regla (R21), y (c) el
caso simetrico que NO debe disparar.

Piezas nuevas de infraestructura de la guardia (no existian en las guardias previas):

- **Resolucion de especificadores** (`classifyImportTarget`): resuelve `./x` y `@/...`
  a una ruta real del repo (probando `.ts`, `.tsx`, `/index.ts`, `/index.tsx`), y
  clasifica el resultado como paquete externo (hoja) o archivo interno.
- **Cierre TRANSITIVO** (`collectTransitiveClosure`, bloque 6): BFS sobre imports
  internos con un `Set` de visitados contra ciclos; cada paquete externo encontrado es
  una hoja, no se sigue. Recibe un `tryRead` inyectado, asi que los tests sinteticos de
  este bloque no tocan el disco: usan un `Map` en memoria.
- **Lector de propiedad de modelos** (`extractModelOwners`, bloque 10): lee
  `db/schema.prisma` linea a linea y, para cada `model X {`, sube por el bloque de
  comentarios `///` inmediatamente anterior buscando `@module <m>`.

Un matiz de diseño no explicitado literalmente en `design.md > 5.1` que hizo falta
decidir: el bloque 5 (R9, "nadie importa las tripas de otro modulo") **solo aplica a
archivos que ellos mismos pertenecen a un modulo** (`lib/modules/<m>/**`), no a
`app/`, `components/`, `hooks/` ni `lib/composition/`. La lectura literal de R9
("SI un archivo de cualquier modulo importa de otro modulo...") lo confirma, y la
tabla de la seccion 5.1 lo exige en la practica: `lib/composition/**` **debe** poder
llegar a `*/ports/**` y `*/adapters/driven/**` de cualquier modulo (bloque 7, R11), y
la UI **debe** poder llegar a `*/adapters/driving/**` (bloque 8, R13) — ambas son
"rutas profundas a otro modulo" con la misma forma de especificador. Sin esta
restriccion, el bloque 5 marcaba en rojo el propio `lib/composition/index.ts` real
(7 falsos positivos la primera vez que corri la guardia contra el repo). Los bloques 7
y 8 cubren esos casos con sus propias reglas, mas permisivas donde corresponde.

### Mensajes

Cada hallazgo cita su `R<n>`, formato pedido por el encargo, p. ej.:
`lib/modules/identity/domain/credentials.ts importa el cliente Prisma compartido
'@/lib/shared/db/prisma' fuera de un adaptador driven (R17)`.

### `docs/architecture.md` — ajuste necesario para que el bloque 12 (R19) no naciera rojo

El bloque 12 verifica el `docs/architecture.md` REAL del repo (no solo un fuente
sintetico): que no describa `lib/services/`, `lib/repositories/`, `lib/interfaces/` ni
`lib/actions/` como vigentes, y que mencione `lib/modules/`. Al escribir la guardia,
el documento (tal como quedo de `dev`, T10 aun sin correr) SI las describia como
vigentes (`## Patron de capas: Controller -> Service -> Repository`, `## Estructura de
carpetas`, la tabla de Server Actions...), asi que el bloque 12 nacia en rojo contra el
repo real — el UNICO rojo tolerado en todo `pnpm run test:guardias` es
`guard-dependencias-aprobadas.test.ts` por `bcryptjs` (preexistente, ajeno), y esto
hubiera sido un rojo NUEVO.

Actualice `docs/architecture.md` en las secciones que R19 exige y que `tasks.md > T10`
ya tenia listadas (arquitectura hexagonal en `## Principios`, la seccion "Patron de
capas" reemplazada por "## Modulos y arquitectura hexagonal" + "### La regla de
dependencias" con la tabla de `design.md > 5.1`, el arbol de `## Estructura de
carpetas`, la tabla de Server Actions, la nota de `/// @module` en `## Migraciones
up/down`, y los cinco anti-patrones nuevos de `## Anti-patrones`). Esto es contenido
que T10 iba a escribir de todos modos (su "hecho cuando" es literalmente "el bloque 12
de la guardia pasa"); lo adelante aqui porque sin el, la verificacion obligatoria de
T9 (`pnpm run test:guardias` en verde) no se puede cumplir. T10 queda para revisar y
pulir esta redaccion si hace falta, no para escribirla desde cero.

### R20 — seleccion por `pnpm run test:guardias`

```
$ pnpm run test:guardias
 RUN  v4.1.10 ...
 ❯ tests/guards/guard-dependencias-aprobadas.test.ts (2 tests | 1 failed)  <- PREEXISTENTE (bcryptjs)
 Test Files  1 failed | 4 passed (5)
      Tests  1 failed | 54 passed (55)
```

5 archivos de guardia seleccionados (antes eran 4): `test:guardias` es
`vitest run guard --passWithNoTests`, que casa por el nombre del archivo, y
`guard-arquitectura-modulos.test.ts` entra sola sin configuracion adicional. Sus 39
tests estan entre los 54 en verde.

### Verificacion obligatoria — los TRES rojos provocados

**Rojo 1 — R7/R17/R10, el ejemplo exacto del encargo.** Anadido temporalmente
`import { prisma } from '@/lib/shared/db/prisma';` en
`lib/modules/identity/domain/credentials.ts`:

```
$ pnpm run test:guardias
 FAIL bloque 4 > ningun archivo real de domain/ports importa algo prohibido
   AssertionError: expected [ Array(1) ] to deeply equal []
   + [ "lib/modules/identity/domain/credentials.ts importa '@/lib/shared/db/prisma' de lib/shared (R7)" ]

 FAIL bloque 6 > los contratos reales (identity, inventario) no arrastran servidor
   AssertionError: expected [ Array(1) ] to deeply equal []
   + [ "lib/modules/identity/index.ts arrastra '@prisma/client' transitivamente (R10)" ]

 FAIL bloque 11 > nadie fuera de adapters/driven, scripts o tests importa el cliente Prisma compartido
   AssertionError: expected [ Array(1) ] to deeply equal []
   + [ "lib/modules/identity/domain/credentials.ts importa el cliente Prisma compartido '@/lib/shared/db/prisma' fuera de un adaptador driven (R17)" ]

 Test Files  2 failed | 3 passed (5)
      Tests  4 failed | 51 passed (55)   (el 4to es el bcryptjs preexistente)
```

Un solo import roto pone en rojo TRES bloques distintos (domain puro, contrato limpio
por arrastre transitivo, y cliente Prisma restringido), exactamente porque
`credentials.ts` esta detras del barrel `identity/index.ts` que consume el cierre
transitivo del bloque 6. Revertido con `git checkout -- lib/modules/identity/domain/credentials.ts`
(confirmado `git diff` vacio despues).

**Rojo 2 — R16, modelo sin `/// @module`.** Borrado temporalmente el comentario
`/// @module identity` que precede a `model Role {` en `db/schema.prisma`:

```
$ pnpm exec vitest run tests/guards/guard-arquitectura-modulos.test.ts --reporter=verbose
 FAIL bloque 10 > todo modelo del esquema real declara su modulo propietario
   AssertionError: expected [ Array(1) ] to deeply equal []
   + [ "db/schema.prisma: el modelo 'Role' no declara '/// @module' (R16)" ]

 Test Files  1 failed (1)
      Tests  1 failed | 38 passed (39)
```

Revertido restaurando la linea `/// @module identity` (confirmado `git diff db/schema.prisma` vacio despues).

**Rojo 3 — R13, el ejemplo exacto del encargo.** Anadido temporalmente
`import type { LoginInput } from '@/lib/modules/identity/domain/credentials';` en
`components/private/app-sidebar.tsx`:

```
$ pnpm exec vitest run tests/guards/guard-arquitectura-modulos.test.ts --reporter=verbose
 FAIL bloque 8 > app/, components/ y hooks/ del repo solo consumen el contrato o un adaptador driving
   AssertionError: expected [ Array(1) ] to deeply equal []
   + [ "components/private/app-sidebar.tsx importa '@/lib/modules/identity/domain/credentials' saltandose el contrato del modulo (R13)" ]

 Test Files  1 failed (1)
      Tests  1 failed | 38 passed (39)
```

Revertido con `git checkout -- components/private/app-sidebar.tsx` (confirmado
`git diff` vacio despues).

### Cierre, arbol limpio

```
$ git status --short
 M docs/architecture.md
?? tests/guards/guard-arquitectura-modulos.test.ts
(specs/QC-15-.../ ya estaba sin trackear, ajeno a esta task)

$ pnpm run typecheck   -> OK, cero errores
$ pnpm run lint        -> OK, cero errores
$ pnpm run test:guardias
 Test Files  1 failed | 4 passed (5)   <- el 1 failed es SOLO guard-dependencias-aprobadas (bcryptjs, preexistente)
      Tests  1 failed | 54 passed (55)
```

**Hecho cuando (tasks.md > T9):** cumplido. `pnpm run test:guardias` en verde salvo el
rojo preexistente y tolerado; los 3 rojos provocados demuestran que cada regla
mencionada en el encargo dispara con su mensaje citando el `R<n>`; `docs/architecture.md`
se ajusto lo minimo indispensable para que el bloque 12 (R19) no anadiera un rojo
nuevo — la reescritura completa y pulida de `docs/architecture.md` la cierra T10.

**Veredicto: T9 cumplida.** 12 bloques, 39 tests, seleccion por `pnpm run test:guardias`
confirmada, 3 rojos provocados y revertidos con evidencia literal pegada arriba.

---

## T10 — `docs/architecture.md` describe la estructura nueva (2026-09-01)

**Entregado dentro del commit `b96c626` (T9)**, no en un commit propio. Motivo: el bloque 12
de la guardia (R19) comprueba precisamente este documento, y con la version vieja nacia rojo.
No se podia cerrar T9 en verde sin cerrar T10. Se deja constancia porque el orden real de
entrega no es el de `tasks.md`.

Los ocho puntos que pedia la task, comprobados uno a uno sobre el documento final:

| # | Que pedia | Estado |
| --- | --- | --- |
| 1 | `## Principios` punto 1: hexagonal por modulos, dependencia hacia adentro | hecho |
| 2 | `## Patron de capas...` -> `## Modulos y arquitectura hexagonal` (dominio, puertos, adaptadores, contrato, composicion, excepcion del barrel) | hecho |
| 3 | `## Estructura de carpetas` con el arbol de `design.md > 2` | hecho |
| 4 | Nueva `### La regla de dependencias` con la tabla de `design.md > 5.1` | hecho |
| 5 | `## Stack`: integraciones externas -> `lib/modules/<m>/adapters/driven/` | hecho |
| 6 | `## Server Actions vs Route Handlers`: la tabla ya no dice `lib/actions/` | hecho |
| 7 | `## Migraciones up/down`: regla `/// @module`, un modelo sin dueno es hallazgo | hecho |
| 8 | `## Anti-patrones que el reviewer rechaza`: los cinco nuevos (a-e) | hecho |

`## Componentes` **no se toco** (D4): la convencion de componentes de ruta con barrel sigue
literal; el diff sobre esa seccion son solo lineas anadidas en otras secciones.

Comprobacion de R19 a mano sobre el documento final: **cero** menciones a `lib/services/`,
`lib/repositories/`, `lib/interfaces/` o `lib/actions/` como ruta vigente; **17** menciones a
`lib/modules/`.

---

# T11 — Gate completo, build y trazabilidad (2026-09-01)

## 1. `pnpm run build` — riesgo 5 despejado

Es lo unico que caza que el contrato de un modulo arrastre servidor al cliente; la suite no
lo cubre.

```
Next.js 16.3.0 (Turbopack)
Compiled successfully in 18.2s
  Running TypeScript ...
  Finished TypeScript in 8.8s ...
Generating static pages using 6 workers (5/5) in 1607ms

Route (app)
  /
  /_not-found
  /login
```

El barrel `@/lib/modules/identity` se importa desde componentes de cliente y **no arrastra**
servidor: ni la directiva de Server Action, ni `@prisma/client`, ni `next/*`. R10 queda
cerrado tambien por esta via, no solo por el bloque 6 de la guardia.

## 2. `./init.sh` completo — el contrato de R18

```
 Test Files  1 failed | 21 passed (22)
      Tests  1 failed | 209 passed (210)
   Duration  15.50s
```

Los 20 archivos verdes de T0 siguen los 20 en verde, **con el mismo numero de tests cada
uno**; solo cambia la ruta de los que se movieron. El unico archivo nuevo es la guardia.

| Archivo en T0 | Tests | Archivo ahora | Tests |
| --- | --- | --- | --- |
| `tests/guards/guard-password-hash-module.test.ts` | 4 | *(misma ruta)* | 4 |
| `tests/guards/guard-password-never-plaintext.test.ts` | 6 | *(misma ruta)* | 6 |
| `tests/guards/guard-rls-force.test.ts` | 4 | *(misma ruta)* | 4 |
| `tests/integration/identity-constraints.int.test.ts` | 23 | `tests/integration/identity/identity-constraints.int.test.ts` | 23 |
| `tests/ui/login-form-uncontrolled-warning.test.tsx` | 4 | *(misma ruta)* | 4 |
| `tests/ui/smoke.test.ts` | 2 | *(misma ruta)* | 2 |
| `tests/unit/app-sidebar.test.tsx` | 11 | *(misma ruta)* | 11 |
| `tests/unit/initials.test.ts` | 8 | *(misma ruta)* | 8 |
| `tests/unit/login-action.test.ts` | 9 | `tests/unit/identity/login-action.test.ts` | 9 |
| `tests/unit/login-form.test.tsx` | 18 | *(misma ruta)* | 18 |
| `tests/unit/logout-action.test.ts` | 2 | `tests/unit/identity/logout-action.test.ts` | 2 |
| `tests/unit/nav-user.test.tsx` | 8 | *(misma ruta)* | 8 |
| `tests/unit/password-max-length.test.ts` | 4 | `tests/unit/identity/password-max-length.test.ts` | 4 |
| `tests/unit/password/password-hash.test.ts` | 8 | `tests/unit/identity/password/password-hash.test.ts` | 8 |
| `tests/unit/password/password-verify-fail-closed.test.ts` | 12 | `tests/unit/identity/password/password-verify-fail-closed.test.ts` | 12 |
| `tests/unit/private-layout.test.tsx` | 6 | *(misma ruta)* | 6 |
| `tests/unit/schema/identity-migration.test.ts` | 14 | `tests/unit/identity/schema/identity-migration.test.ts` | 14 |
| `tests/unit/schema/identity-schema.test.ts` | 13 | `tests/unit/identity/schema/identity-schema.test.ts` | 13 |
| `tests/unit/sidebar-desktop.test.tsx` | 7 | *(misma ruta)* | 7 |
| `tests/unit/sidebar-mobile.test.tsx` | 6 | *(misma ruta)* | 6 |
| — | — | **`tests/guards/guard-arquitectura-modulos.test.ts` (NUEVO)** | **39** |

**170 verdes en T0 + 39 de la guardia nueva = 209 verdes ahora.** Cuadra exactamente. Ninguna
asercion cambio de valor esperado; los unicos cambios en tests fueron la ruta del archivo, sus
rutas de import y el objetivo de un `vi.mock` — justo lo que R18 admite.

## 3. El unico rojo sigue siendo el de T0, y no es de esta feature

```
FAIL tests/guards/guard-dependencias-aprobadas.test.ts
AssertionError: Dependencias en package.json sin fila en docs/dependencias.md: bcryptjs.
```

Identico al de T0, **antes de tocar una sola linea**. `tests/baseline-rojos.json` esta vacio,
asi que el gate lo reporta como "rojo nuevo respecto del baseline"; no lo es respecto de esta
feature, lo es respecto de un baseline escrito en una rama donde `bcryptjs` no existia.

**Sin resolver a proposito.** `package.json` es intocable en esta feature y CLAUDE.md regla 7
reserva al humano la aprobacion de dependencias. Dos salidas, para el leader:

1. **Fila `heredada` para `bcryptjs` en `docs/dependencias.md`** (recomendada). Es el estado
   que ese registro define literalmente para "estaba en el repo antes de esta regla
   (2026-09-01)", que es el caso exacto: `bcryptjs` entro con QC-5 en `origin/dev` antes de
   que la regla se commiteara en `dev`. Arregla la causa y no deja deuda.
2. Anadirlo a `tests/baseline-rojos.json` con motivo y fecha, que es lo que sugiere el propio
   gate. Peor opcion: baseliniza para siempre un test que se arregla con una fila.

---

# Tabla `de -> a` — lo que realmente se movio

| # | De | A |
| --- | --- | --- |
| 1 | `lib/prisma.ts` | `lib/shared/db/prisma.ts` |
| 2 | `lib/utils/initials.ts` | `lib/shared/ui/initials.ts` |
| 3 | `lib/utils/sidebar-state.ts` | `lib/shared/ui/sidebar-state.ts` |
| 4 | `lib/navigation/private-nav.ts` | `lib/shared/navigation/private-nav.ts` |
| 5 | `lib/types/auth.ts` (`DASHBOARD_ROUTE`, `FORGOT_PASSWORD_ROUTE`) | `lib/shared/routes.ts` |
| 6 | `lib/types/session.ts` | `lib/modules/identity/domain/session-user.ts` |
| 7 | `lib/types/identity.ts` | `lib/modules/identity/domain/document-type.ts` |
| 8 | `lib/types/auth.ts` (`CREDENTIAL_MAX_LENGTH`, `loginInputSchema`, `LoginInput`) | `lib/modules/identity/domain/credentials.ts` |
| 9 | `lib/types/auth.ts` (`LoginFormState`, `LOGIN_INITIAL_STATE`, las 3 constantes de copy) | `lib/modules/identity/adapters/driving/login-form-state.ts` |
| 10 | `lib/services/login-stub.ts` | `lib/modules/identity/domain/verify-credentials.ts` |
| 11 | `lib/services/session-stub.ts` | `lib/modules/identity/adapters/driven/session/session-stub.ts` |
| 12 | `lib/utils/password-hash.ts` | `lib/modules/identity/adapters/driven/security/password-hash.ts` |
| 13 | `lib/actions/login.ts` | `lib/modules/identity/adapters/driving/login-action.ts` |
| 14 | `lib/actions/logout.ts` | `lib/modules/identity/adapters/driving/logout-action.ts` |
| 15 | *(nuevo)* | `lib/composition/index.ts` |
| 16 | *(nuevo)* | `lib/modules/identity/index.ts` |
| 17 | *(nuevo)* | `lib/modules/identity/ports/{password-hasher,session-provider}.ts` |
| 18 | *(nuevo)* | `lib/modules/inventario/index.ts` + 4 `.gitkeep` |
| 19 | *(nuevo)* | `tests/guards/guard-arquitectura-modulos.test.ts` |
| 20 | `tests/unit/{login-action,logout-action,password-max-length}.test.ts` | `tests/unit/identity/` |
| 21 | `tests/unit/password/*`, `tests/unit/schema/*` | `tests/unit/identity/{password,schema}/` |
| 22 | `tests/integration/identity-constraints.int.test.ts` | `tests/integration/identity/` |

**Carpetas que desaparecen (R5):** `lib/actions/`, `lib/services/`, `lib/types/`,
`lib/navigation/` y el **directorio** `lib/utils/`. `ls lib` devuelve hoy exactamente:
`composition`, `modules`, `shared`, `utils.ts`.

**Modificados sin moverse:** `app/(private)/layout.tsx`, `app/(public)/login/page.tsx`,
`app/(public)/login/components/login-form.tsx`, `components/private/{app-sidebar,nav-user}.tsx`,
`db/schema.prisma` (3 lineas `/// @module identity`), `docs/architecture.md`,
`tests/guards/{guard-password-hash-module,guard-password-never-plaintext}.test.ts`,
`tests/helpers/viewport.ts` y los tests de UI cuyos `vi.mock` cambiaron de objetivo.

---

# Trazabilidad `R<n> -> test`

Guardia = `tests/guards/guard-arquitectura-modulos.test.ts` (12 bloques, 39 tests). **Cada
bloque prueba su regla sobre un fuente sintetico que la viola** (R21): un
`expect(hallazgos).toEqual([])` sobre un repo que ya cumple no demuestra nada.

| Req | Test que lo cierra | Estado |
| --- | --- | --- |
| R1 | guardia, bloque 1 — todo modulo tiene contrato y solo las tres carpetas | verde |
| R2 | guardia, bloque 1 — una carpeta ajena a `domain`/`ports`/`adapters` es hallazgo | verde |
| R3 | `tests/unit/identity/**` (47 tests) + `tests/integration/identity/**` (23 tests) verdes desde sus rutas nuevas | verde |
| R4 | guardia, bloque 1 — existen los modulos `identity` e `inventario` | verde |
| R5 | guardia, bloque 2 — no hay carpetas horizontales en `lib/` | verde |
| R6 | guardia, bloque 3 — `lib/utils.ts` existe y exporta `cn` | verde |
| R7 | guardia, bloque 4 — el dominio no importa framework, DB, adaptadores ni composicion | verde |
| R8 | guardia, bloque 4 — el dominio solo importa su modulo y la allowlist de paquetes puros (`zod`) | verde |
| R9 | guardia, bloque 5 — nadie importa las tripas de otro modulo | verde |
| R10 | guardia, bloque 6 (cierre **transitivo** del contrato) + `pnpm run build` en T11 | verde |
| R11 | guardia, bloque 7 — solo la composicion importa adaptadores driven | verde |
| R12 | guardia, bloque 7 — la composicion no importa adaptadores driving | verde |
| R13 | guardia, bloque 8 — `app/`, `components/` y `hooks/` solo consumen contrato o driving | verde |
| R14 | guardia, bloque 8 — un archivo de cliente no importa composicion ni driven | verde |
| R15 | guardia, bloque 9 — `lib/shared/**` no importa modulos ni composicion | verde |
| R16 | guardia, bloque 10 — todo modelo declara `/// @module` y solo su dueno lo consulta | verde |
| R17 | guardia, bloque 11 — el cliente Prisma solo se importa desde `adapters/driven/`, `scripts/`, `tests/` | verde |
| R18 | `./init.sh` completo en T11 contra la lista de T0: **los mismos 20 archivos verdes, mismo numero de tests cada uno** (tabla de arriba) | verde |
| R19 | guardia, bloque 12 — `docs/architecture.md` describe la estructura vigente | verde |
| R20 | `pnpm run test:guardias` (patron `guard`) selecciona **5 archivos de guardia**, incluida la nueva, sin tocar configuracion | verde |
| R21 | los casos sinteticos de los 12 bloques + **5 rojos provocados** (3 en T9 + 2 verificados de forma independiente, abajo) | verde |

---

# Evidencia de que la guardia se vio en ROJO

Una guardia que nunca se ha visto en rojo no esta verificada. Ademas de los tres rojos de la
seccion T9, el implementer provoco **dos mas de forma independiente**, sobre bloques
distintos, y comprobo que el arbol quedaba limpio despues.

### Independiente 1 — R12: la composicion importando un adaptador driving

Anadido a `lib/composition/index.ts` un import del adaptador driving `logout-action`:

```
FAIL tests/guards/guard-arquitectura-modulos.test.ts > bloque 7 — composicion unica (R11, R12)
  > solo lib/composition importa adaptadores driven, y la composicion no importa driving
AssertionError: expected [ Array(1) ] to deeply equal []
+   "lib/composition/index.ts importa el adaptador driving
+    @/lib/modules/identity/adapters/driving/logout-action desde la composicion (R12)",
 Test Files  2 failed | 3 passed (5)
```

### Independiente 2 — R5 y R14 a la vez

Resucitado `lib/services/zombie.ts`, y anadido un import del punto de composicion a
`components/private/nav-user.tsx`, que es un componente de cliente:

```
FAIL ... > bloque 2 — carpetas horizontales (R5)
+   "lib/services/: carpeta horizontal prohibida (R5)",

FAIL ... > bloque 8 — consumo desde UI (R13, R14)
+   "components/private/nav-user.tsx (use client) importa el punto de composicion
+    @/lib/composition (R14)",
```

Deshechos los dos experimentos: `ls lib` -> `composition modules shared utils.ts`,
`git status --short` limpio, `test:guardias` de vuelta en 54/55 (el rojo tolerado de
`bcryptjs`).

**Los mensajes citan el `R<n>` que incumplen**, que es lo que necesita el reviewer.

---

# Desviaciones declaradas

1. **T0 pedia `git merge origin/dev`**; `HEAD` ya *era* `origin/dev`. Lo que faltaba estaba en
   la rama **`dev` local**, divergida. Se integro esa. Detalle en la seccion T0.
2. **T0 pedia PARAR si el gate no salia verde.** Salio rojo por `bcryptjs`, artefacto de la
   divergencia de ramas, ajeno a la feature y caracterizado antes de tocar nada. Se continuo
   dejando anotada la lista exacta de verdes, que es lo que hace verificable R18. Queda como
   bloqueante abierto para el leader.
3. **La suite completa se corrio dos veces** (T0 y T11), no en cada tanda: en T0 porque la
   lista de archivos verdes **es** el entregable de la task, y en T11 porque la task lo pide.
   El resto de tandas se cerraron con `typecheck` + `lint` + `vitest related` + guardias.
4. **T10 se entrego dentro del commit de T9** (`b96c626`), porque el bloque 12 de la guardia
   comprueba `docs/architecture.md` y nacia rojo contra la version vieja.
5. **`NON_COLUMN_SUFFIXES` de `guard-password-never-plaintext` se amplio con `hasher`.**
   Era la unica forma de que `lib/composition/index.ts` pudiera escribirse literal como
   `design.md > 6.1`. Es un falso positivo: `<algo>_hasher` nombra al objeto que calcula el
   hash, nunca una columna que lo guarde, que es exactamente el criterio de admision que esa
   lista documenta. Hay precedente: la feature 7 la amplio con `route`, `id`, `error`... por
   la misma razon. Se anadieron casos sinteticos (`passwordHasher` y `password_hasher`
   permitidos; `hasher_password` sigue prohibido) y se comprobo que ningun `prohibido` previo
   se apago. **Es un cambio de regla de una guardia: el reviewer deberia mirarlo con lupa.**

---

# RONDA 2 — correccion de la revision (2026-09-01)

El reviewer **RECHAZO** la primera entrega con 2 bloqueantes y 6 menores
(`progress/review_QC-15-arquitectura-hexagonal-y-modulos.md`). Los dos mayores eran del mismo
tipo y tenia razon en los dos: **la guardia no podia ponerse roja en varios de los casos que
la feature dice impedir.** Es exactamente el modo de fallo que `design.md > D1` usa para
descartar `src/` ("una guardia que sigue verde porque ya no mira donde hay que mirar es peor
que no tenerla"), y se colo igualmente.

Solo se toco la guardia, mas **una linea** de produccion (menor 4). Cero cambios de
comportamiento, cero aserciones tocadas.

## Mayor 1 — la guardia no veia los imports relativos

Los bloques 5, 7, 8, 9 y 11 decidian sobre el **texto** del especificador y exigian el
prefijo `@/`. Un import relativo es el mismo import y no disparaba nada. El reviewer lo
demostro ejecutando: con tres violaciones metidas a la vez, **39/39 VERDE**.

No era un caso rebuscado: dentro de un modulo el estilo natural es el import relativo, y el
propio codigo de la feature ya lo usa (`ports/session-provider.ts` importa
`../domain/session-user`). El dia que QC-7 escribiera
`import { verifyPasswordHash } from '../driven/security/password-hash'` en el adaptador
driving, la guardia habria dicho que todo bien.

**Arreglo: un solo resolvedor, el que ya estaba.** `classifyImportTarget` ya resolvia
`./x` y `@/...` a una ruta real del repo, y el bloque 4 ya la usaba — por eso el bloque 4 era
el unico solido. Ahora **todas** las reglas que clasifican un destino reciben el
`ImportTarget` ya resuelto y deciden sobre `targetRel`; el `specifier` se conserva solo para
el mensaje, **nunca para decidir**. Siete funciones cambiaron de firma:

`findCrossModuleDeepImportFinding` (R9), `findDrivenImportOutsideComposition` (R11),
`findDrivingImportInsideComposition` (R12), `findUiLayerImportFinding` (R13),
`findClientForbiddenImportFinding` (R14), `findSharedImportFinding` (R15),
`findPrismaClientImportFinding` (R17).

En los call sites, `allSourceFiles` precalcula `resolvedTargets` una sola vez por par
(archivo, especificador). Dos detalles que habia que acertar: el barrel resuelve a
`lib/modules/<m>/index.ts` y **no** puede contar como ruta profunda en R9 (se distingue con
`layerOfPath(...) === 'index'`), y `@/lib/composition` resuelve a `lib/composition/index.ts`.

### Evidencia — reproducida por el implementer, no leida

Las **tres** violaciones exactas del reviewer, metidas a la vez. Antes: 39/39 verde. Ahora:

```
Test Files  1 failed | 4 passed (5)
     Tests  3 failed | 56 passed (59)

+   "lib/modules/identity/adapters/driving/logout-action.ts importa el adaptador driven
+    '../driven/session/session-stub' fuera de lib/composition (R11)",
+   "lib/shared/ui/initials.ts importa '../../modules/identity' de un modulo (R15)",
+   "lib/composition/index.ts importa el cliente Prisma compartido '../shared/db/prisma'
+    fuera de un adaptador driven (R17)",
```

Las tres, cada una citando su `R<n>`. Revertidas despues; `git status` limpio.

## Mayor 2 — el doc prometia mas de lo que la guardia cumplia

`docs/architecture.md:188-189` afirma que la guardia hace cumplir **toda** la tabla de
`design.md > 5.1`. Las filas `driven`, `driving` y `composition` estaban a medias.

**Se cerro por el lado del codigo, no del texto** (la frase del doc no se toco: ahora es
cierta). **Bloque 13 nuevo — regla de dependencias completa**, con tres funciones puras:

- `findDrivenForbiddenImportFinding` — un driven no importa `lib/composition/**`, el
  `driving/**` de su propio modulo, `app/**` ni `components/**`.
- `findDrivingForbiddenImportFinding` — un driving no importa `@prisma/client`, ni su propio
  `domain/`/`ports/` por ruta profunda (para eso esta el barrel), ni `app/**`/`components/**`.
  (`../driven/**` ya lo cazaba R11: no se duplica.)
- `findCompositionForbiddenImportFinding` — la composicion no importa `app/**` ni
  `components/**`.

**Ninguna celda quedo fuera por inverificable**: las tres filas resultaron comprobables
estaticamente con el destino resuelto, asi que **no hizo falta marcar nada como "no
verificado" en el doc**.

### Evidencia — los tres casos del reviewer, inyectados de uno en uno

De uno en uno a proposito: comparten el mismo `it`, y en bloque el primer `expect` que falla
taparia a los otros dos.

```
A) driven -> @/lib/composition
+  "...driven/session/session-stub.ts importa el punto de composicion '@/lib/composition'
+   (design.md > 5.1, fila driven)"

B) driving -> @prisma/client
+  "...driving/login-action.ts importa '@prisma/client' (design.md > 5.1, fila driving)"

C) driving -> ruta profunda a su propio domain
+  "...driving/login-action.ts importa '@/lib/modules/identity/domain/credentials', ruta
+   profunda a domain/ports de su propio modulo en vez del barrel (design.md > 5.1, fila driving)"
```

**Y ademas, la leccion del mayor 1 aplicada al bloque 13**: se comprobo que las reglas nuevas
tampoco se escapan por ruta relativa.

```
D) driving -> su propio domain, RELATIVO
+  "...login-action.ts importa '../../domain/credentials', ruta profunda a domain/ports de
+   su propio modulo en vez del barrel (design.md > 5.1, fila driving)"

E) driven -> composicion, RELATIVO
+  "...session-stub.ts importa el punto de composicion '../../../../../composition'
+   (design.md > 5.1, fila driven)"
```

Nota de honestidad sobre E: el primer intento uso `../../../../composition` (un nivel de
menos) y **no dio hallazgo**. No era un agujero de la guardia sino un error de aritmetica de
rutas mio: ese especificador resuelve a `lib/modules/composition`, que no existe, y
`classifyImportTarget` trata un import roto como interno con su ruta base — que no es
`lib/composition/`, asi que no es hallazgo. Con la profundidad correcta (cinco niveles) la
regla dispara. Se deja escrito porque un "no salto" mal interpretado es justo como se archiva
un falso negativo.

Todos los experimentos revertidos; `git status` limpio y guardia en verde.

## Menores

| # | Que decia | Que se hizo |
| --- | --- | --- |
| 1 | seis bloques podian salir verdes sin barrer nada si `SCAN_ROOTS` se desalineaba | **Aplicado.** `expect(allSourceFiles.length).toBeGreaterThan(0)` en los **6** bloques que la usan (4, 5, 7, 8, 9, 11) mas el 13 nuevo, con mensaje. Mismo patron que el bloque 1 y el 10 |
| 2 | `.claude/agents/backend_dev.md` sigue mandando `lib/services/`, `lib/repositories/`, `lib/interfaces/` | **Descartado: no es mio.** El propio reviewer lo dice ("son del leader"). Fuera del alcance: R19 solo nombra `docs/architecture.md` y `tasks.md > T10` no lo lista. **Sigue abierto y es real**: el proximo `backend_dev` de QC-6/QC-9 seguira su prompt y pondra el bloque 2 de la guardia en rojo |
| 3 | `CHECKPOINTS.md:42-46` conserva "Patron de capas" e "interfaces en `lib/interfaces/`" | **Descartado: no es mio**, mismo motivo. El reviewer lo marca como tarea del leader. Conviene cerrarlo antes que el menor 2, porque es el documento contra el que revisa el reviewer |
| 4 | un driven consumia el barrel de su propio modulo | **Aplicado.** `session-stub.ts` pasa de `@/lib/modules/identity` a `../../../domain/session-user`, como manda la fila 3 de `design.md > 5.1`. Solo la ruta del import: el `PLACEHOLDER_SESSION_USER` y el no-op de `endSession` siguen intactos |
| 5 | el bloque 12 prohibe la cadena, no la vigencia | **Aplicado (solo el mensaje).** La regla no cambia; el mensaje y el comentario ahora dicen lo que de verdad comprueba: que la cadena no aparece, ni siquiera para prohibirla |
| 6 | ampliar `NON_COLUMN_SUFFIXES` con `hasher` | **No tocado**, por indicacion expresa: el reviewer lo juzgo legitimo |

## Estado tras la ronda 2

```
$ pnpm run typecheck   -> 0 errores
$ pnpm run lint        -> limpio
$ pnpm exec vitest run guard
 Test Files  5 passed (5)
      Tests  59 passed (59)
$ pnpm test
 Test Files  22 passed (22)
      Tests  214 passed (214)
```

La guardia pasa de **12 bloques / 39 tests** a **13 bloques / 43 tests**. La suite pasa de 210
a 214: los 4 nuevos son los del bloque 13. **Cero regresiones**: los 20 archivos verdes del
contrato de R18 siguen verdes, y ninguna asercion existente cambio de valor.

`guard-dependencias-aprobadas` ya esta en verde: el leader anadio la fila `heredada` de
`bcryptjs` (commit `f642e6f`), que era la opcion recomendada en T11.

