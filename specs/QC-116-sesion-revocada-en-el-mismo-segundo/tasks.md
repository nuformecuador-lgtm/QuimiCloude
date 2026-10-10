# QC-116 — sesion-revocada-en-el-mismo-segundo · tasks.md

> Implementa la **opción B** (`design.md > 3`). Si el humano elige C o A en la pregunta abierta 1,
> este archivo se reescribe antes de empezar.
>
> Verificación de cada tanda (`docs/perfil-agentes.md > Todos los agentes`): `pnpm run typecheck`,
> `pnpm run lint`, `pnpm exec vitest related --run <archivos>`, `pnpm exec vitest run guard` y los
> `.int` que se nombran. Los comentarios de producción no citan `QC-<n>` ni `R<n>`.

## T1 — Función pura `issuedAtForNewSession` [P]

- `lib/modules/identity/domain/session-revocation.ts`: `MAX_ISSUE_LEAD_MS = 2_000` e
  `issuedAtForNewSession(now, sessionsValidFrom)` tal como `design.md > 3.1`, sobre `isStampedOut`,
  `floorToSecond` y `firstIssuedAtAfterStamp` (sin escribir otra vez la desigualdad).
- Si el `index.ts` del módulo reexporta `session-revocation`, la nueva función sale por ahí; si no, no
  se añade al contrato (solo la usa el dominio).
- Tests en `tests/unit/identity/session-revocation.test.ts`, con literales y sin reloj:
  - R1: sello truncado `10:00:00.000`, `now = 10:00:00.016` → `10:00:01.000`.
  - R1/R2: sello con fracción `10:00:00.500`, `now = 10:00:00.516` → `10:00:01.000`.
  - R3: `now = 10:00:01.000` con sello `10:00:00.000` → `now` idéntico; sello de ayer → `now`.
  - R4: sello que deja el adelanto en exactamente 2 000 ms → adelanta; 2 001 ms → devuelve `now`.
  - R7: para una tabla de sellos y `now`, `isStampedOut({ issuedAt: floorToSecond(resultado) }, sello)`
    es `false` siempre que hubo adelanto, y es `true` para `resultado − 1 ms`.
  - R16: el archivo no importa ningún reloj (el test ya existente que lee el fuente, si lo hay, sigue
    verde; si no, se afirma con `readFileSync` que no aparece `new Date()` sin argumentos).

**Hecho:** los casos anteriores en verde; ningún test anterior de ese archivo cambia.

## T2 — El login lee el sello en su misma consulta [P]

- `lib/modules/identity/ports/user-credentials-reader.ts`: `AuthenticatableUser` gana
  `readonly sessionsValidFrom: Date`.
- `lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts`: `u.sessions_valid_from`
  en el `SELECT` del `$queryRaw`, en `FilaCredenciales` y en el mapeo (`new Date(…)`). El `WHERE` y el
  `LIMIT 1` no cambian.
- Dobles de `UserCredentialsReader` en los tests unitarios que el typecheck marque: añadir el campo
  con un sello en el pasado (no cambia lo que afirman).
- Test de integración en `tests/integration/identity/login.int.test.ts`: `findActiveByUsername`
  devuelve el `sessions_valid_from` de la fila (R6, lado del adaptador).

**Hecho:** typecheck verde; el `.int` nuevo en verde; ningún otro caso de `login.int.test.ts` cambia.

## T3 — El caso de uso emite con el instante adelantado (depende de T1 y T2)

- `lib/modules/identity/domain/verify-credentials.ts`: `now?: () => Date` en `VerifyCredentialsDeps`
  (R15); un solo `now` por invocación; la emisión con
  `issuedAtForNewSession(now, usuario.sessionsValidFrom)` (`design.md > 3.3`).
- `lib/composition/index.ts` **no se toca**.
- Tests en `tests/unit/identity/verify-credentials.test.ts`, con `now` fijo inyectado:
  - R1: sello en el mismo segundo → el ticket lleva `issuedAt` = segundo siguiente.
  - R3: sello antiguo → `issuedAt` = `now` exacto (igual que hoy).
  - R4: sello 5 s en el futuro → `issuedAt` = `now`.
  - R5: `expiresAt − issuedAt` = 8 h exactas en los tres casos.
  - R6: el doble de `users` se invoca **una** vez por login correcto.
  - R15: sin `now` en las dependencias, el `issuedAt` cae entre dos `Date.now()` tomados antes y
    después de la llamada.

**Hecho:** los casos nuevos en verde y todos los anteriores de `verify-credentials.test.ts` sin
cambios de lo que afirman.

## T4 — Regresión de extremo a extremo contra la base (depende de T3)

`tests/integration/identity/login-same-second-stamp.int.test.ts` (nuevo), con el patrón de fixture de
`login.int.test.ts` (empresa y usuario efímeros, limpieza por id, secreto de firma propio):

- **R2, sello truncado:** se escribe el sello con `stampAll` en `T = floorToSecond(fijo)`; login real
  con `now = T + 16 ms`; el ticket pasa por `buildSessionValue` y `verifySessionValue`; `createResolveSession`
  con el adaptador real de `session-user-prisma` y un `SessionReader` que devuelve esos claims, con
  `now = T + 20 ms` → devuelve a la persona.
- **R2, sello con fracción:** usuario creado con el `@default(now())` de la base; se lee su
  `sessions_valid_from` y se usa ese valor + 16 ms como «ahora» → la resolución devuelve a la persona.
- **R9:** con el mismo sello, un ticket emitido con `createSessionTicket(…, T + 16 ms)` **sin**
  adelanto → la resolución da `null`.
- **R10:** sello previo de hace un minuto; login con adelanto imposible (no hay sello en su segundo);
  luego `stampAll` en el segundo del login → la resolución da `null`.
- **R12:** el valor construido empieza por el prefijo de versión vigente (`v4`), el mismo que afirma
  `tests/unit/identity/session-token.test.ts`.

**Hecho:** el archivo en verde dos veces seguidas; ningún `sleep` ni `vi.useFakeTimers()`.

## T5 — Lo que no debe moverse (depende de T3) [P]

- R8: `tests/unit/identity/resolve-session.test.ts` y `tests/unit/identity/session-revocation.test.ts`
  (los casos de QC-23 «iat igual al sello → null») siguen verdes **sin editarlos**.
- R11: `tests/unit/identity/end-other-sessions.test.ts` sigue verde **sin editarlo**.
- R12: `tests/unit/identity/session-token.test.ts` sigue verde **sin editarlo**.
- R13 y R14: el diff no toca `db/` ni `package.json` (lo comprueba el reviewer con
  `git diff --stat origin/dev`).

**Hecho:** los cuatro archivos de tests citados, sin cambios en el diff y en verde.

## T6 — Enmienda a QC-23 [P]

- `specs/QC-23-registro-de-sesiones/design.md > 12.4`: una línea al final, según
  `design.md > 11`.

**Hecho:** la línea existe y no cambia ningún requisito de QC-23.

## T7 — Cierre de la tanda (depende de T1–T6)

- `pnpm run typecheck`, `pnpm run lint`, `pnpm exec vitest related --run` con los archivos tocados,
  `pnpm exec vitest run guard`, y los dos `.int` (`login.int.test.ts`,
  `login-same-second-stamp.int.test.ts`) más `session-user.int.test.ts`.
- `progress/impl_QC-116-sesion-revocada-en-el-mismo-segundo.md` con el mapa `R<n> -> test` de abajo,
  completado con los nombres reales de los casos.

**Hecho:** todo en verde y el mapa completo.

## Trazabilidad prevista

| R | Test |
| --- | --- |
| R1 | `session-revocation.test.ts` (T1) + `verify-credentials.test.ts` (T3) |
| R2 | `login-same-second-stamp.int.test.ts`, las dos variantes (T4) |
| R3 | `session-revocation.test.ts` + `verify-credentials.test.ts` |
| R4 | `session-revocation.test.ts` + `verify-credentials.test.ts` |
| R5 | `verify-credentials.test.ts` |
| R6 | `verify-credentials.test.ts` (una invocación) + `login.int.test.ts` (columna leída) |
| R7 | `session-revocation.test.ts` (complementariedad) |
| R8 | `resolve-session.test.ts` y `session-revocation.test.ts` de QC-23, sin editar |
| R9 | `login-same-second-stamp.int.test.ts` |
| R10 | `login-same-second-stamp.int.test.ts` |
| R11 | `end-other-sessions.test.ts`, sin editar |
| R12 | `session-token.test.ts`, sin editar + prefijo en `login-same-second-stamp.int.test.ts` |
| R13 | Revisión del diff (sin `db/`) |
| R14 | Revisión del diff (sin `package.json`) + guardia de dependencias del gate |
| R15 | `verify-credentials.test.ts` |
| R16 | `session-revocation.test.ts` |

## Archivos esperados

- `lib/modules/identity/domain/session-revocation.ts`
- `lib/modules/identity/domain/verify-credentials.ts`
- `lib/modules/identity/ports/user-credentials-reader.ts`
- `lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts`
- `tests/unit/identity/session-revocation.test.ts`
- `tests/unit/identity/verify-credentials.test.ts`
- `tests/unit/identity/usuarios/set-user-account-status-lock.test.ts`
- `tests/unit/identity/account-status-scope.test.ts`
- `tests/integration/identity/login.int.test.ts`
- `tests/integration/identity/login-same-second-stamp.int.test.ts`
- `specs/QC-23-registro-de-sesiones/design.md`
- `progress/impl_QC-116-sesion-revocada-en-el-mismo-segundo.md`
- `progress/features/QC-116.md`

Los dos tests de `usuarios/set-user-account-status-lock.test.ts` y `account-status-scope.test.ts`
entran **solo si** el typecheck los marca por construir un `AuthenticatableUser` literal.
