# impl QC-116 — sesion-revocada-en-el-mismo-segundo

Implementa la opción B aprobada (`specs/QC-116-sesion-revocada-en-el-mismo-segundo/`): el login
emite con `firstIssuedAtAfterStamp(sello)` cuando el sello cae en su mismo segundo, con un tope de
2 s. No se trunca el sello, no hay migración, el reloj se inyecta (`now?: () => Date`) y no hay E2E
propio. Rama `feature/QC-116-sesion-revocada-en-el-mismo-segundo`.

## Archivos

Producción:
- `lib/modules/identity/domain/session-revocation.ts`: `MAX_ISSUE_LEAD_MS` e `issuedAtForNewSession`
  (sobre `isStampedOut`, `floorToSecond` y `firstIssuedAtAfterStamp`; no reescribe la desigualdad).
- `lib/modules/identity/domain/verify-credentials.ts`: `now?: () => Date` en las dependencias, un
  solo reloj por intento y emisión con `issuedAtForNewSession(now, usuario.sessionsValidFrom)`.
- `lib/modules/identity/ports/user-credentials-reader.ts`: `AuthenticatableUser.sessionsValidFrom`.
- `lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts`:
  `u.sessions_valid_from` en el mismo `SELECT` (sin tocar `WHERE` ni `LIMIT`).

Tests:
- `tests/unit/identity/session-revocation.test.ts` (casos nuevos al final; los anteriores intactos).
- `tests/unit/identity/verify-credentials.test.ts` (campo nuevo en el fixture `USUARIO` + describe nuevo).
- `tests/unit/identity/usuarios/set-user-account-status-lock.test.ts` (solo el campo nuevo en el fixture).
- `tests/integration/identity/login.int.test.ts` (un caso nuevo).
- `tests/integration/identity/login-same-second-stamp.int.test.ts` (nuevo).
- `tests/integration/aislamiento.json` (entrada `commit` del archivo nuevo; la exige
  `guard-aislamiento-integracion`. No estaba en `tasks.md > Archivos esperados`).

Specs:
- `specs/QC-23-registro-de-sesiones/design.md > 12.4`: la línea de la enmienda (T6).

`lib/composition/index.ts`, `db/`, `e2e/` y `package.json`: sin tocar.

## Mapa R → test

| R | Test |
| --- | --- |
| R1 | `session-revocation.test.ts` › «R1: sello truncado…», «R1, R2: sello con fraccion…»; `verify-credentials.test.ts` › «R1: sello en el mismo segundo del login…», «R1: sello con fraccion…» |
| R2 | `login-same-second-stamp.int.test.ts` › «R2: sello truncado por la aplicacion…», «R2: sello con fraccion de segundo puesto por la base en el alta…» |
| R3 | `session-revocation.test.ts` › «R3: un login ya en el segundo siguiente…», «R3: un sello de ayer…»; `verify-credentials.test.ts` › «R3: sello antiguo…» |
| R4 | `session-revocation.test.ts` › «R4: adelanto de exactamente MAX_ISSUE_LEAD_MS…»; `verify-credentials.test.ts` › «R4: sello 5 s en el futuro…» |
| R5 | `verify-credentials.test.ts` › «R5: la caducidad es la emision mas 8 horas exactas…» |
| R6 | `verify-credentials.test.ts` › «R6: un login correcto… lee la base una sola vez»; `login.int.test.ts` › «QC-116 R6: la misma lectura del login trae el sessions_valid_from…» |
| R7 | `session-revocation.test.ts` › «R7: cuando adelanta, el corte deja pasar el instante emitido y corta un milisegundo antes» |
| R8 | `resolve-session.test.ts` y `session-revocation.test.ts` (casos de QC-23 «isStampedOut»), sin editar, en verde |
| R9 | `login-same-second-stamp.int.test.ts` › «R9: una sesion emitida en el segundo del sello SIN adelanto…» |
| R10 | `login-same-second-stamp.int.test.ts` › «R10: sello previo de hace un minuto…», «R10: login adelantado por un sello de otro segundo…» |
| R11 | `end-other-sessions.test.ts`, sin editar, en verde |
| R12 | `session-token.test.ts`, sin editar, en verde; `login-same-second-stamp.int.test.ts` › «R12: la cookie… sigue siendo de la version vigente» |
| R13 | Diff sin `db/` (`git diff --stat origin/dev -- db/` vacío) |
| R14 | Diff sin `package.json`; guardia de dependencias en verde |
| R15 | `verify-credentials.test.ts` › «R15: el reloj se consulta una sola vez por intento», «R15: sin reloj inyectado se usa el del sistema» |
| R16 | `session-revocation.test.ts` › «R16: vive en el dominio de la revocacion sin leer ningun reloj» (+ el caso de QC-23 «el dominio de la revocacion es puro», sin editar) |

## Verificación (salida real)

- `pnpm run typecheck` (tras `next typegen`): `tsc --noEmit` sin errores.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)`, todos preexistentes en archivos que no toco
  (`confirm-catalog-import.test.ts`, `order-service.test.ts`); `eslint` sobre los archivos tocados:
  `No issues found`.
- Unitarios tocados y los de no-regresión (`session-revocation`, `verify-credentials`,
  `set-user-account-status-lock`, `account-status-scope`, `resolve-session`, `end-other-sessions`,
  `session-token`): `Test Files 7 passed (7)`, `Tests 205 passed | 3 skipped (208)` (los 3 `skip`
  son preexistentes de `account-status-scope`, dependen del diff).
- Integración (`login-same-second-stamp`, `login`, `session-user`) contra base efímera
  `qct_qc116_*` copiada de la plantilla en `quimicloude-pg17:5433`, borrada al terminar:
  `Test Files 3 passed (3)`, `Tests 47 passed (47)`. El archivo nuevo, segunda vez: `6 passed (6)`.
- Mutación de control: con `issuedAtForNewSession` devolviendo siempre `now`, el archivo nuevo
  da `3 failed | 3 passed` (las dos R2 y la R10 con adelanto). El test detecta la regresión.
- `pnpm exec vitest run guard`: `Test Files 67 passed (67)`, `Tests 907 passed | 18 skipped (925)`.
- Gate (`set -a; . ../../.env; set +a; ./init.sh`): `✓ typecheck paso`, `✓ lint paso`, tests
  relacionados `Test Files 707 passed (707)`, `Tests 11347 passed | 14 skipped (11361)`;
  `test:rapido` + guardias `Test Files 105 passed (105)`, `Tests 1461 passed | 35 skipped (1496)`;
  `✓ todas las migraciones tienen down.sql`; `== init OK ==`. Ninguna base `qct_qc116_*` queda en
  el contenedor.

## Desviaciones

- `tests/integration/aislamiento.json` no estaba en los archivos esperados: la guardia de
  aislamiento exige censar todo `.int.test.ts` nuevo.
- La bitácora va en `progress/impl_QC-116.md` (lo pidió el leader), no en el nombre largo que dice
  `tasks.md > T7`.

## Veredicto

QC-116 implementada (T1–T7): login en el mismo segundo del sello entra, el corte de QC-23 sigue igual.
