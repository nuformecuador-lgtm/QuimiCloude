# QC-8 — sesion-actual-y-logout · tasks

Rama `feature/QC-8-sesion-actual-y-logout`, en su worktree (`docs/worktrees.md`).
`[P]` = paralelizable con las demas `[P]` del mismo bloque.
Cada task se cierra con un commit propio (`docs/conventions.md > Commits`).

**Antes de empezar:** `pnpm run typecheck` y `pnpm test` en verde sobre la rama base. Si algo ya
esta rojo, se anota antes de tocar nada; si no, el primer rojo propio no se distingue del
heredado.

**Cierre de cada tanda:** `./init.sh --rapido`. **Antes del PR:** `./init.sh` completo, sin
excepcion (`CLAUDE.md`, regla 5).

---

## Bloque 1 — Dominio (sin dependencias entre si)

### [x] T1 [P] — `domain/session-claims.ts`
Tipo `SessionClaims` (`sub`, `issuedAt`, `expiresAt`), esquema zod (`sub` con formato UUID,
`iat`/`exp` enteros positivos), `parseSessionClaims(rawJson): SessionClaims | null` e
`isSessionExpired(claims, now): boolean` con `>=`.
**Hecho:** `tests/unit/identity/session-claims.test.ts` cubre R6 y R7 —JSON invalido, campos que
faltan, `sub` que no es UUID, `exp` justo en el instante, `exp` un segundo despues— y pasa.
El archivo no importa `next/*`, `@prisma/client` ni `lib/shared/**`.

### [x] T2 [P] — `domain/display-name.ts`
`buildDisplayName(firstNames, lastNames, username)`: primer token de cada campo, tolerante a
espacios multiples, con caida al `username` si el resultado queda vacio.
**Hecho:** `tests/unit/identity/display-name.test.ts` cubre R13, incluido el caso literal de la
decision («Ana Maria» + «Perez Gomez» → «Ana Perez») y la comprobacion de que
`getInitials(buildDisplayName(...)) === 'AP'` importando el helper existente de
`lib/shared/ui/initials.ts` **desde el test** (el dominio no lo importa).

### [x] T3 [P] — Puertos `SessionReader` y `SessionUserReader`
`ports/session-reader.ts` y `ports/session-user-reader.ts` con las firmas de `design.md > 4.5`,
mas el tipo `SessionUserRecord`.
**Hecho:** `pnpm run typecheck` pasa; los dos archivos solo importan del propio `domain/`.

### [x] T4 — `domain/resolve-session-user.ts` *(depende de T1, T2, T3)*
`createResolveSessionUser({ session, users })` con el algoritmo de `design.md > 2.1`.
**Hecho:** `tests/unit/identity/resolve-session-user.test.ts` con puertos falsos cubre R1, R10,
R11, R12 y R14, y afirma **explicitamente** que con `claims === null` o con sesion caducada
`users.findActiveById` **no se llama** (R23: la politica esta en el dominio, no en el adaptador).

---

## Bloque 2 — Adaptadores *(dependen del bloque 1)*

### [x] T5 [P] — Ampliar `adapters/driven/session/session-cookie.ts`
Añadir `readSessionClaims()` y `clearSession()`, exportar `SESSION_VALUE_VERSION`, reutilizar
`signSessionValue()`, `SESSION_COOKIE_NAME` y `readSessionSecret()` **sin duplicarlos**. Comparar
longitudes antes de `timingSafeEqual`.
**Hecho:** `tests/unit/identity/session-cookie.test.ts` ampliado cubre R2, R3, R4, R5, R8, R9 y
R18 con los casos de `design.md > 7` nivel 2; el valor valido se obtiene **capturando lo que
escribe `startSession`**, no de un literal. `grep -c createHmac` en el repo sigue devolviendo una
sola implementacion de la firma fuera de `tests/`.

### [x] T6 [P] — `adapters/driven/persistence/session-user-prisma.ts`
`findActiveSessionUserById` con `prisma.user.findFirst`, `where: { id, deletedAt: null }` y
`select` minimo con `role: { select: { name: true } }`.
**Hecho:** `tests/integration/identity/session-user.int.test.ts` (fixture propio con prefijo y
`RUN_ID`, limpieza en `afterAll` dentro de `try`/`finally`) cubre R10, R11, R12 y R15 contra
Postgres real y pasa; `pnpm vitest run integration` queda verde **entero**, incluido
`identity-constraints.int.test.ts` (`user.count() === 0`).

### [x] T7 — Borrar `adapters/driven/session/session-stub.ts` *(depende de T5, T6)*
Se elimina el archivo: su cabecera ya declara que la feature de sesion real lo reemplaza.
**Hecho:** no queda ninguna referencia (`rg session-stub` solo aparece en `specs/` y `progress/`
historicos y en los casos **sinteticos** de `guard-arquitectura-modulos.test.ts`, que construyen
rutas a mano y no leen el disco); `pnpm run typecheck` pasa.

---

## Bloque 3 — Cableado y superficie *(depende del bloque 2)*

### [x] T8 — Puerto, contrato, composicion y ruta de login
Cuatro cambios que van juntos porque por separado dejan el typecheck rojo:
1. `ports/session-provider.ts`: `getSessionUser(): Promise<SessionUser | null>` (R1).
2. `lib/modules/identity/index.ts`: reexportar `createResolveSessionUser`, `buildDisplayName`,
   `isSessionExpired` y el tipo `SessionClaims` (solo de `./domain`).
3. `lib/composition/index.ts`: segun `design.md > 4.4`; fuera el import del stub.
4. `lib/shared/routes.ts`: `LOGIN_ROUTE = '/login'`.
**Hecho:** `pnpm run typecheck` y `pnpm run lint` pasan;
`tests/guards/guard-arquitectura-modulos.test.ts` verde (R22).

### [x] T9 — `logout-action.ts` + su test *(depende de T8)*
Añadir `redirect(LOGIN_ROUTE)` despues de `await identity.endSession()`, **sin tocar la firma**
(R19) y fuera de cualquier `try` (el `redirect` de Next señaliza lanzando).
En `tests/unit/identity/logout-action.test.ts`, alcance **exacto** y nada mas:
- quitar `session-stub.ts` de `MODULOS_INSPECCIONADOS` (ya no existe);
- retirar de `prohibidos` los patrones `next/navigation`, `redirect`, `next/headers` y `cookies`,
  que esta feature revoca a proposito, y **conservar** `prisma`, `PrismaClient`, `supabase`,
  `fetch` y `document.cookie`;
- añadir el test de que la action redirige a `LOGIN_ROUTE` **despues** de `endSession` (orden
  afirmado, no solo ambas llamadas).
**Hecho:** el archivo pasa; el test de la firma congelada (sin parametros, sin retorno) sigue ahi
y verde.

### [x] T10 — `app/(private)/layout.tsx` + su test *(depende de T8)*
`const user = await identity.getSessionUser(); if (user === null) redirect(LOGIN_ROUTE);`. Nada
mas cambia en el layout (la cookie de UI sigue igual).
En `tests/unit/private-layout.test.tsx`, alcance **exacto**:
- en la guardia de codigo de R35, quitar `redirect` de la lista de prohibidos —lo revoca la
  decision del 2026-09-02— y **dejar intactas** las de `prisma`, `PrismaClient`, `supabase`,
  `fetch(`, `document.cookie`, `Set-Cookie`, `cookiestore.set` y `cookiestore.delete`, mas la
  comprobacion de que la unica cookie leida en runtime es `SIDEBAR_STATE_COOKIE`;
- añadir: con `getSessionUser` devolviendo `null`, se llama a `redirect` con `LOGIN_ROUTE` y no se
  pinta la barra lateral (R16);
- conservar el test de «lo pide una sola vez y lo reparte por props» (R17).
**Hecho:** el archivo pasa entero, incluidos los tests de QC-11 que no se tocan.

### T11 — Tanda verde
**Hecho:** `./init.sh --rapido` en verde (typecheck + lint + tests relacionados + **todas** las
guardias).

---

## Bloque 4 — E2E · **FUERA DE ALCANCE** (diferido a QC-9 el 2026-09-02)

> **No se ejecuta ninguna task de este bloque.** El humano difirió el recorrido en navegador a
> QC-9 porque `app/(private)/` no tiene ningún `page.tsx` y Next no renderiza un layout sin
> página: hoy no hay URL que visitar. Ver `requirements.md > Preguntas abiertas 3` (cerrada) y la
> fila revisada de la tabla de decisiones.
>
> **El implementer pasa de T11 directamente a T15.** No crea `e2e/session.spec.ts`, no toca
> `playwright.config.ts` y no añade fixtures con prefijo `qc8_e2e_`.

### ~~T12 — PUERTA: ¿existe una URL privada?~~ · resuelta antes de empezar
La puerta existía para devolver esta pregunta al humano. Ya está respondida: **no se monta la
URL en QC-8**. Nada que comprobar.

### ~~T13 — `e2e/session.spec.ts`~~ · no se escribe en QC-8
Lo hereda QC-9 junto con R24. El patrón de fixtures a seguir cuando llegue sigue siendo
`e2e/login.spec.ts` de QC-7: prefijos propios, `RUN_ID` por worker, limpieza defensiva de
huérfanos y borrado en `afterAll`.

### ~~T14 — Comprobar que el E2E no deja basura~~ · sin objeto
Sin E2E nuevo no hay basura nueva. **Sigue vigente el riesgo ajeno**: un `pnpm run e2e` de QC-7
interrumpido deja huérfanos que ponen en rojo `identity-constraints.int.test.ts`, que afirma
`user.count() === 0`. Si aparece ese rojo, no es de QC-8.

---

## Bloque 5 — Cierre

### T15 — Trazabilidad *(depende de T14)*
Escribir `progress/impl_QC-8-sesion-actual-y-logout.md` con el mapa **`R1`…`R24` -> test
concreto**, sin huecos. R21 se marca como test de caracterizacion del riesgo asumido, con la nota
de que **QC-23 lo pondra rojo a proposito**.
**Hecho:** los 24 requisitos tienen al menos un test nombrado y el archivo existe
(`CHECKPOINTS.md > Trazabilidad`).

### T16 — Gate completo y PR *(depende de T15)*
**Hecho:** `./init.sh` completo en verde, `progress/current.md` actualizado, y el PR abierto con
las tres preguntas abiertas citadas (la 3 con la decision que se tomo).
