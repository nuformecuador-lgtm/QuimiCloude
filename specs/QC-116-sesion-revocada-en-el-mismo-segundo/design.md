# QC-116 — sesion-revocada-en-el-mismo-segundo · design.md

## Lo que ya existe

Buscado `sello`, `sessions_valid_from` / `sessionsValidFrom`, `mismo segundo`, `isStampedOut`,
`firstIssuedAtAfterStamp` en `feature_list.json`, `specs/`, `progress/` y el código (grafo del
proyecto principal en `dev` —el worktree no tiene índice propio— y Grep en el worktree).

| Qué apareció | Dónde | Qué se hace con ello |
| --- | --- | --- |
| La regla del corte, `<=` con `iat` en segundos | `specs/QC-23-registro-de-sesiones/design.md > 2.3`; `lib/modules/identity/domain/session-revocation.ts > isStampedOut` | **Se conserva sin tocar** (R8) |
| La salida de este mismo problema, ya escrita | QC-23 `design.md > 12.4`: «la salida, si alguna vez molesta, es la misma que usa R31: emitir con `firstIssuedAtAfterStamp(sello)` en vez de con `now`» | **Es el diseño de esta ficha** (opción B) |
| `firstIssuedAtAfterStamp(sello)` | `session-revocation.ts`; lo usa `domain/end-other-sessions.ts` (QC-23 R31) | **Se reutiliza**; no se reescribe la desigualdad |
| El diagnóstico del rojo intermitente | `progress/impl_QC-93-…md` y `progress/review_QC-93-…md` (alta con `@default(now())` y microsegundos; dos E2E caídos en `sesion=fin`) | Es el origen de la ficha; los candidatos que proponía (truncar el alta, fijar fixtures) se analizan en § 2 |
| Fixtures E2E con `sessionsValidFrom` en el pasado | `progress/medicion_QC-104-…md` | Lo de `e2e/` es de **QC-255** (`in_progress`) |
| QC-96 (recuperar contraseña) | `specs/QC-96-…/requirements.md:279`: «NO DEBE iniciar sesión automáticamente» | No hereda el problema; nada que coordinar |

Ninguna ficha del board duplica esta. No hay código que ya lo resuelva en el login.

## 1. Diagnóstico, con el código real

- **La emisión.** `domain/verify-credentials.ts` toma `const now = new Date()` y emite
  `createSessionTicket(…, now)`. El códec (`adapters/driven/session/session-token.ts`,
  `toEpochSeconds`) firma `iat` **truncado al segundo**.
- **El corte.** `domain/resolve-session.ts`, paso 7: `isStampedOut(claims, record.sessionsValidFrom)`,
  que es `claims.issuedAt <= sessionsValidFrom`.
- **Las escrituras del sello.**

  | Camino | Dónde | Valor escrito |
  | --- | --- | --- |
  | Alta por el administrador | `user-admin-prisma.ts > create` (no escribe la columna) | `@default(now())` de la **base**, con microsegundos |
  | Usuarios iniciales (seed) | `initial-access-repository-prisma.ts > createInitialAdmin / createInitialMaestro` | ídem |
  | Activación por enlace (QC-79) | `credential-setup-link-prisma.ts > applyCredentialAndActivate` | `floorToSecond(now)` de la **aplicación** |
  | Bloqueo, inactivación, borrado | `user-admin-prisma.ts > applyGuardedChange` → `sessionStampFor` | `floorToSecond(now)` |
  | Cambio de rol | `user-admin-prisma.ts > updateAliveInCompany` → `sessionStampFor` | `floorToSecond(now)` |
  | Cerrar todas / todas menos la actual | `session-revocation-prisma.ts > stampAll` (desde `end-all-sessions.ts`, `end-other-sessions.ts`) | `floorToSecond(now)` |

  Desbloquear y reactivar **no** escriben el sello (QC-23 R36, R37).

- **Por qué nace revocada.** Login a las 10:00:00.516 → `iat = 10:00:00`.
  - Sello con fracción (alta, 10:00:00.500): `10:00:00 <= 10:00:00.500` → revocada.
  - Sello truncado (resto, 10:00:00.000): `10:00:00 <= 10:00:00` → revocada.

  **Truncar no basta**: con el sello truncado el `<=` sigue cortando el login del mismo segundo.
  QC-23 lo aceptó como consecuencia (§ 12.4, «se cura solo»). Lo que no previó es que los fixtures
  y las pruebas entran justo en ese segundo.

## 2. Las cuatro salidas, y qué garantía deja cada una

La garantía de QC-23 (R9): **una sesión emitida en el instante del corte o antes no sobrevive,
aunque sea en el mismo segundo**. Con `iat` en segundos, un login anterior al corte y uno posterior
dentro del mismo segundo llevan el mismo `iat`. Para distinguirlos solo hay dos caminos: más
precisión en el token (A), o que el login posterior **no** lleve ese `iat` (B, C).

| Opción | Arregla el login del mismo segundo | Garantía de QC-23 | Coste |
| --- | --- | --- | --- |
| **A.** `iat` en milisegundos (cookie `v5`) | Sí (queda una ventana de 1 ms) | Entera, al milisegundo | Todas las sesiones caen al desplegar; toca el códec de la firma y el middleware; reabre la decisión 7 de QC-23 y su R7 («precisión de segundo») |
| **B.** El login emite con `firstIssuedAtAfterStamp(sello)` si el sello está en su segundo | Sí | Entera **salvo** dos sellos de la misma persona en el mismo segundo con un login entre ellos (§ 6) | Una función pura, una columna más en la consulta del login, un parámetro opcional |
| **C.** B + sello que nunca repite segundo (`max(floor(now), floor(anterior) + 1 s)`) | Sí | Entera, también la reemisión de QC-23 R31 | Las cuatro escrituras leen el sello anterior de forma atómica (SQL `GREATEST` o lectura bajo bloqueo de fila); `stampAll` devuelve el sello escrito; el adelanto puede encadenarse |
| **D.** Sello truncado + `<` estricto | Sí | **Se pierde**: sobrevive cualquier sesión ajena emitida en el segundo del corte | Mínimo; ya descartada por QC-23 (alternativa 4, decisión cerrada 13) |

**Se elige B** (pregunta abierta 1). C queda escrita para que, si el humano la prefiere, la tanda
nueva sea añadir encima, no rehacer.

## 3. Diseño (opción B)

### 3.1 Dominio: una función pura nueva

En `lib/modules/identity/domain/session-revocation.ts`, junto a `isStampedOut` y
`firstIssuedAtAfterStamp`:

```ts
export const MAX_ISSUE_LEAD_MS = 2_000;

/** Instante con el que se emite una sesión nueva frente al sello de su persona. */
export function issuedAtForNewSession(now: Date, sessionsValidFrom: Date): Date {
  if (!isStampedOut({ issuedAt: floorToSecond(now) }, sessionsValidFrom)) return now;
  const lifted = firstIssuedAtAfterStamp(sessionsValidFrom);
  return lifted.getTime() - now.getTime() <= MAX_ISSUE_LEAD_MS ? lifted : now;
}
```

- **Compara contra `floorToSecond(now)`**, porque eso es lo que el corte verá cuando el códec
  trunque `iat`. Comparar con `now` crudo dejaría pasar el caso exacto de esta ficha.
- **No escribe la desigualdad**: usa `isStampedOut` y `firstIssuedAtAfterStamp`. R7 se prueba
  contra ellas, no contra números escritos a mano.
- **Devuelve `now` sin tocar** cuando no hay sello en juego (R3): el ticket sigue siendo idéntico
  al de hoy en el 99,9 % de los logins.
- **Tope de 2 s** (R4, pregunta 5): más allá se emite con `now`, la sesión nace inválida como hoy y
  se falla cerrado.

### 3.2 Puerto y adaptador del login

- `ports/user-credentials-reader.ts > AuthenticatableUser` gana
  `readonly sessionsValidFrom: Date` (valor **crudo**, como `accountStatus` y `companyDeletedAt`:
  la regla es del dominio).
- `adapters/driven/persistence/user-credentials-prisma.ts > findActiveByUsername` añade
  `u.sessions_valid_from` al `SELECT` del `$queryRaw` y lo convierte con `new Date(…)`. **Misma
  consulta, mismo `WHERE`, cero lecturas nuevas** (R6). El `$queryRaw` se queda: es el que usa el
  índice funcional parcial.

### 3.3 Caso de uso del login

`domain/verify-credentials.ts`:

- `VerifyCredentialsDeps` gana `readonly now?: () => Date` (R15), el mismo patrón que
  `createEndAllSessions({ revocations, now? })`. Por defecto `() => new Date()`.
- `const now = (deps.now ?? defaultNow)()` sustituye a `new Date()`. **Un solo reloj por
  invocación**, como ya exige el comentario de ese archivo: el mismo `now` sirve para el bloqueo y
  para la emisión.
- La emisión pasa a `createSessionTicket(…, issuedAtForNewSession(now, usuario.sessionsValidFrom))`.
  `createSessionTicket` ya calcula `expiresAt = issuedAt + 8 h` (R5); no se toca.
- Nada más cambia de orden: la verificación de hash, los cortes por estado y por empresa, y el
  registro del éxito van exactamente igual.

`lib/composition/index.ts` **no cambia**: el campo es opcional y producción usa el reloj por defecto.

### 3.4 Lo que no se toca

`isStampedOut` (R8), `resolve-session.ts`, el códec y la versión `v4` de la cookie (R12),
`end-other-sessions.ts` (R11), las cuatro escrituras del sello, `db/schema.prisma` y las
migraciones (R13).

## 4. Modelo de datos

**Sin cambios.** Ninguna tabla, columna, índice, política RLS ni migración. **La base de producción
no se toca** (R13, preguntas 2 y 3). Los sellos con fracción de segundo que ya existen funcionan:
`issuedAtForNewSession` trunca antes de comparar y `firstIssuedAtAfterStamp` trunca el sello.

## 5. Contratos

| Pieza | Antes | Después |
| --- | --- | --- |
| `AuthenticatableUser` | `{ id, passwordHash, roleName, companyId, companyDeletedAt, accountStatus } & AccountLockState` | `+ sessionsValidFrom: Date` |
| `VerifyCredentialsDeps` | `{ users, attempts, hasher, session, ids }` | `+ now?: () => Date` |
| `verifyCredentials(input)` | `Promise<{ ok: boolean }>` | **sin cambios** |
| Cookie de sesión | `v4`, `iat` en segundos | **sin cambios** |

Los dobles de `UserCredentialsReader` de los tests unitarios tienen que añadir el campo
(typecheck). No hay ninguna Server Action ni ruta nueva.

## 6. La garantía: qué se conserva y qué se pierde

| Caso | Hoy | Con B |
| --- | --- | --- |
| Sesión emitida antes del sello, en otro segundo | Inválida | Inválida (R8) |
| Sesión ajena emitida antes del sello, **en su mismo segundo** | Inválida | Inválida (R9): no se adelantó, su `iat` es el segundo del sello |
| Login **después** del sello, en su mismo segundo | **Revocada al nacer** | Válida (R1, R2) |
| Reemisión de «todas menos la actual» | Válida | Igual (R11) |
| Sello más de 2 s en el futuro (reloj o dato raro) | Revocada al nacer | Igual (R4) |
| **Dos sellos de la misma persona en el mismo segundo, con un login correcto entre ellos** | Inválida | **Sobrevive al segundo sello** |

**El hueco, explicado.** El login ve el primer sello (10:00:00) y emite con `iat = 10:00:01`. El
segundo sello, en ese mismo segundo, también se escribe `10:00:00`, así que no corta esa sesión.
Solo importa cuando el segundo sello lo provoca un **cambio de rol** o un **«cerrar todas»**: el
bloqueo y la inactivación los corta el paso 6 de `resolve-session.ts` (estado de cuenta) y el
borrado el paso 3 (fila). Hace falta, además, la contraseña correcta de esa persona en ese
segundo. **No es nuevo**: la reemisión de QC-23 R31 ya lo tiene hoy, con el mismo mecanismo. Se
cierra con la opción C.

**La carrera que ya existía no cambia.** Si el login lee la fila antes de una escritura del sello y
emite después, la sesión cae igual que hoy: el login no vio un sello en su segundo, no adelanta y su
`iat` es el segundo del sello. Si cruza el cambio de segundo, sobrevive, igual que hoy.

## 7. Pruebas sin reloj (R15, R16)

- **Unitarias del dominio** (`tests/unit/identity/session-revocation.test.ts`): solo literales.
  Sello truncado y sello con fracción; `now` en el mismo segundo, el anterior y el siguiente; tope
  de 2 s justo en el borde y 1 ms por encima; complementariedad con `isStampedOut` (R7).
- **Unitarias del caso de uso** (`tests/unit/identity/verify-credentials.test.ts`): `now` fijo por
  la dependencia nueva; se afirma el `issuedAt` y el `expiresAt` del ticket que recibe el espía del
  `SessionWriter`.
- **Integración** (`tests/integration/identity/login-same-second-stamp.int.test.ts`, nuevo): base de
  test real, `findActiveByUsername` real, bcrypt real, `buildSessionValue` / `verifySessionValue`
  reales y `createResolveSession` con `session-user-prisma` real, todos con el **mismo instante
  fijo**. Dos variantes: sello escrito por la aplicación (truncado, vía `stampAll`) y sello con
  fracción (fila creada con el `@default(now())` de la base, leído y usado como «ahora» + 16 ms).
  Afirma que la resolución devuelve a la persona (R2) y que una sesión emitida **sin** adelanto en
  ese segundo no resuelve (R9).
- **Sin E2E propio** (pregunta 4).

## 8. Alternativas descartadas

1. **A: `iat` en milisegundos.** Conserva la garantía entera, pero saca a todo el mundo al
   desplegar, reabre la decisión 7 y la R7 de QC-23 y toca el códec que comparte el middleware.
   Mucho coste para una ficha `low` cuyo hueco residual es de menos de un segundo y ya existe.
2. **C: sello que nunca repite segundo.** Correcta y cierra también el hueco de R31. Descartada
   **por ahora**, no por mala: cuatro sitios de escritura, lectura atómica del sello anterior y un
   cambio de puerto. Queda como opción del humano (pregunta 1).
3. **D: sello truncado + `<` estricto.** Descartada por QC-23 (alternativa 4) y por su decisión
   cerrada 13: un hueco de un segundo en una revocación sigue siendo un hueco.
4. **Solo truncar el sello del alta** (lo que proponía la revisión de QC-93). No arregla nada:
   con el sello truncado, `iat == sello` y el `<=` corta (§ 1).
5. **Arreglarlo en los fixtures** (sello en el pasado). Arregla las pruebas y no a las personas: el
   login real del mismo segundo seguiría naciendo revocado. Lo de los fixtures es de QC-255.
6. **Adelantar sin tope.** Un sello en el futuro por un dato raro o un salto de reloj daría
   sesiones de más de 8 h sin límite. El tope de 2 s falla cerrado.

## 9. Dependencias de terceros

**Ninguna** (R14).

## 10. Multiplataforma

No aplica: no se toca ninguna interfaz.

## 11. Enmiendas a specs cerrados

- `specs/QC-23-registro-de-sesiones/design.md > 12.4` («Entrar en el MISMO segundo… se cura
  solo»): se añade al final una línea que diga que el login lo resuelve desde QC-116 emitiendo con
  `firstIssuedAtAfterStamp`, y que el hueco de dos sellos en el mismo segundo está en
  `specs/QC-116-…/design.md > 6`. No cambia ningún requisito de QC-23.

## 12. Consecuencias declaradas y deudas

1. **El hueco de § 6** queda abierto, como ya lo estaba en QC-23 R31. Se cierra con la opción C si el
   humano la pide.
2. **Una sesión puede durar hasta 8 h y 2 s** desde el login (R5): la misma clase de precio que QC-23
   ya pagó en R31 (8 h y 1 s).
3. **El comentario de `db/schema.prisma`** sobre `sessionsValidFrom` («las escrituras lo truncan al
   segundo») es inexacto para el alta y el seed, que usan el valor por defecto de la base. No se
   toca aquí (pregunta 2). Deuda menor de documentación para la próxima ficha que toque ese modelo.
4. **Los E2E que hoy caen en `sesion=fin`** por este motivo dejan de caer con esta ficha, aunque QC-255
   no los toque. Las dos fichas no chocan en archivos: esta no toca `e2e/`.
