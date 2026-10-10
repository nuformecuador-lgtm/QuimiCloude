# QC-23 — registro-de-sesiones · design.md

> Decisiones técnicas. Las de negocio ya están cerradas en `requirements.md` y aquí no se reabren.
> Todo lo de abajo está verificado contra el código de la rama (`d424044`), no supuesto.

## 1. Lo que YA existe y esta ficha no reinventa

Leerlo antes de escribir una línea, porque la mitad del trabajo es **no duplicar**:

| Pieza | Dónde | Qué hace hoy |
| --- | --- | --- |
| Códec del token | `identity/adapters/driven/session/session-token.ts` | `v3`, payload `{sub, iat, exp, role, cid}`, HMAC-SHA-256 con WebCrypto. **Único dueño de la firma** en el repo (QC-8 R5, guardia `guard-firma-sesion-unica`) |
| Transporte | `…/session/session-cookie.ts` | `startSession` / `readSessionClaims` / `clearSession` con `next/headers` |
| Interpretación | `identity/domain/session-claims.ts` | `parseSessionClaims` (zod) + `isSessionExpired` |
| La cadena de cortes | `identity/domain/resolve-session.ts` | **seis** cortes ya escritos: contenido, caducidad, fila viva, empresa que no casa, empresa muerta, `effectiveAccountStatus(record, now) !== 'active'` |
| La única consulta por petición | `…/persistence/session-user-prisma.ts` | UN `findFirst` por PK con `role.name`, `role.permissions`, `companyId`, `company.deletedAt`, `accountStatus`, `lockedUntil` |
| Estado efectivo | `identity/domain/effective-account-status.ts` | traduce columna + plazo a `active`/`blocked`/… (QC-78) |
| Escrituras guardadas | `identity/ports/user-admin-repository.ts` + `…/persistence/user-admin-prisma.ts` | `applyGuardedChange` (`account_status`, `delete`) y `updateAliveInCompany` (incluye el cambio de rol), las dos **transaccionales con bloqueo de fila** |
| Enlace de contraseña | `…/persistence/credential-setup-link-prisma.ts` | `applyCredentialAndActivate`: consumo + hash + activación **en una escritura atómica** |
| Errores | `identity/domain/errors.ts` + `lib/modules/errores` | catálogo cerrado, `UnauthorizedError`, `UserNotFoundError` |
| Identificador de petición | `lib/modules/observabilidad` + `lib/composition` | `readRequestIdHeader`, que consume el traductor único |

**Consecuencia directa (R37):** el corte **inmediato** por cuenta bloqueada, inactiva o borrada
**ya funciona** — lo hacen los cortes 3 y 6 de `resolve-session.ts`, que releen la ficha en cada
petición. Esta ficha **no escribe ni un `if` nuevo para eso**. Lo que añade es que el corte sea
**duradero**: subir el sello en la misma transacción que el cambio, para que desbloquear una cuenta
no reviva las cookies que quedaron por ahí.

## 2. Modelo de datos

### 2.1 La columna del sello: `users.sessions_valid_from`

```prisma
/// QC-23 (R7, R8). Sello «sesiones válidas desde»: toda sesión cuyo `iat` sea ANTERIOR O IGUAL
/// a este instante es inválida. NOT NULL con `@default(now())` —una fila nueva nace sin ninguna
/// sesión emitida, así que el sello puede ser el instante de su nacimiento— y la migración
/// rellena las filas existentes con `now()`, que es justo el efecto aceptado por escrito: al
/// desplegar, todo lo vivo cae (y ya caía, por la subida a `v4`).
/// SE GUARDA TRUNCADO AL SEGUNDO, que es la granularidad con la que `iat` viaja firmado
/// (`session-token.ts > toEpochSeconds`). Ver design.md > 2.3.
/// SIN índice: nunca se filtra por esta columna, solo se lee de la fila que ya se lee por PK.
sessionsValidFrom DateTime @default(now()) @map("sessions_valid_from") @db.Timestamptz(6)
```

Es una columna de `users`, así que **no cuesta ninguna consulta**: sale del `findFirst` que ya se
hacía (R14). Mismo argumento con el que QC-48 metió `companyId` y QC-78 `accountStatus`.

### 2.2 La tabla del registro: `revoked_sessions`

```prisma
/// @module identity
/// QC-23. Las sesiones cerradas UNA A UNA (R10). Una fila = un `sid` que ya no vale.
/// SIN columna de empresa (R44): no es tabla de operación, cuelga 1-a-N de `users` y su empresa
/// es la de la persona. Mismo criterio y mismo precedente que `credential_setup_tokens`.
/// SIN `updated_at` y SIN `deleted_at` (R45): la fila es un hecho inmutable y su única escritura
/// posterior es el borrado físico de la purga (R39).
model RevokedSession {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sessionId String   @map("session_id") @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  /// Caducidad NATURAL del token cerrado (su `exp`). Es lo que hace posible la purga de R39:
  /// pasada esta fecha la fila ya no protege de nada.
  expiresAt DateTime @map("expires_at") @db.Timestamptz(6)
  revokedAt DateTime @map("revoked_at") @db.Timestamptz(6)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  user User @relation(fields: [userId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@unique([sessionId], map: "revoked_sessions_session_id_key")
  @@index([userId, expiresAt], map: "revoked_sessions_user_id_expires_at_idx")
  @@map("revoked_sessions")
}
```

- `revoked_sessions_session_id_key` **es** R11 y R12: la comprobación por petición es **una
  búsqueda por índice único**, y registrar dos veces el mismo cierre choca con `23505` y se traduce
  a «ya estaba», no a un error.
- `revoked_sessions_user_id_expires_at_idx` **es** R39: la purga es un `DELETE … WHERE user_id = ?
  AND expires_at <= now`, que es exactamente ese índice.
- `ON DELETE RESTRICT`: el borrado de usuario es lógico (QC-66 R37), así que en operación normal no
  se dispara; un borrado físico con filas colgando tiene que ser ruidoso. Mismo criterio que
  `credential_setup_tokens_user_id_fkey`.

### 2.3 Por qué el sello se guarda truncado al segundo, y la comparación es `<=`

`iat` viaja **en segundos** (`toEpochSeconds`, decisión cerrada del 2026-09-01 que este módulo no
puede reinterpretar). Si el sello se guardara con milisegundos, la comparación mezclaría dos
granularidades y el caso «se sube el sello y se reemite la sesión actual en el mismo segundo»
(R31) sería un volado.

La regla queda: **el sello se escribe truncado al segundo**, la comparación es
`claims.issuedAt <= sessionsValidFrom` (fail-closed: «válido desde» significa *estrictamente
después*), y la reemisión de R31 emite el ticket con `issuedAt = sello + 1 s`. Con eso:

| Sesión | `iat` | Resultado |
| --- | --- | --- |
| Otra, emitida antes | `< sello` | inválida |
| Otra, emitida **en el mismo segundo** que el sello | `== sello` | inválida (esto es lo que cierra el hueco) |
| La actual, reemitida por R31 | `sello + 1 s` | válida |

**Alternativa descartada**: comparar `iat < sello` estricto y reemitir con `issuedAt = sello`. Es la
versión obvia y deja un **agujero de hasta un segundo**: una sesión ajena emitida en el mismo
segundo del corte sobreviviría. Un agujero de un segundo en una revocación sigue siendo un agujero
—decisión cerrada 13, «una revocación que se puede saltar no es una revocación»—, y el precio de
cerrarlo es que la sesión reemitida dura un segundo más de ocho horas. Se paga.

### 2.4 La migración

`db/migrations/<ts>_session_revocation/`

**UP** (`migration.sql`):
1. `ALTER TABLE "users" ADD COLUMN "sessions_valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;` — el `DEFAULT` rellena las filas existentes; no hace falta backfill aparte.
2. `CREATE TABLE "revoked_sessions" (…)` + los dos índices + la FK.
3. `ALTER TABLE "revoked_sessions" ENABLE ROW LEVEL SECURITY;` y `… FORCE ROW LEVEL SECURITY;`
   **sin ninguna policy**: deny-by-default para cualquier vía que no sea Prisma (R42). Copiado
   literal del patrón de `credential_setup_tokens` y `product_batches`; la guardia
   `tests/guards/guard-rls-force.test.ts` lo vigila sola.

**DOWN** (`down.sql`): `DROP TABLE IF EXISTS "revoked_sessions";` y
`ALTER TABLE "users" DROP COLUMN IF EXISTS "sessions_valid_from";`. Sin `CASCADE`. Los índices y los
dos `ALTER` de RLS se caen con la tabla.

**AVISO heredado**: `prisma migrate dev --create-only` va a emitir además los `DROP CONSTRAINT` y
`DROP INDEX` del drift ya conocido del repo (las FK de auditoría escritas a mano, los índices únicos
funcionales y parciales de QC-4/QC-47, el parcial de QC-79). **Se borran a mano**, como hicieron
QC-65 y QC-79. Esta migración **toca `users`**, así que la revisión es obligatoria y no opcional:
un `DROP INDEX "users_email_unique"` colado aquí pasaría el typecheck y la suite, y solo lo vería
el test de migración de T3.

## 3. El token: `v4`

`SESSION_VALUE_VERSION` sube a `'v4'` y el payload gana `sid`:

```ts
type SessionPayload = { sub, iat, exp, role, cid, sid };   // sid: UUID
```

- `SESSION_CLAIMS_SCHEMA` gana `sid: z.string().uuid()` — `.uuid()` y no `.min(1)` por el mismo
  motivo que `sub` y `cid`: el valor acaba comparándose contra una columna `@db.Uuid` (R6).
- `SessionClaims` gana `sessionId: string`; la traducción `sid → sessionId` ocurre **donde ya
  ocurren** `role → roleName` y `cid → companyId`, y fuera del códec nadie ve la abreviatura.
- `SessionTicket` (`domain/session.ts`) gana `sessionId`, y `createSessionTicket` lo recibe
  **posicional y obligatorio**, sin valor por defecto: un `sid` inventado dentro del dominio sería
  un `sid` no aleatorio. Quien lo genera es un puerto (§ 4).
- **Ninguna rama de lectura de `v3`.** Un `v3` con firma correcta se rechaza antes de tocar el HMAC,
  exactamente como hoy se rechazan `v1` y `v2` (R3, R4).
- **La firma no se toca** (R5): `signSessionValue` sigue siendo la única, el guardia
  `guard-firma-sesion-unica` sigue verde y `session-token.test.ts` sigue comparando `toBe` contra
  `node:crypto`.

**Puerto nuevo `SessionIdFactory`** (`ports/session-id-factory.ts`):

```ts
export interface SessionIdFactory { newSessionId(): string; }
```

Implementado con `crypto.randomUUID()` en
`adapters/driven/session/session-id-crypto.ts` y cableado en `lib/composition/index.ts`. Va por
puerto y no por `crypto.randomUUID()` dentro del dominio porque **el dominio no puede tener fuentes
de azar propias** —es lo que hace testeable R2— y porque es el mismo reparto que ya tiene
`CredentialSetupSecretFactory` en QC-79.

## 4. La comprobación por petición: qué se lee y qué cuesta

El puerto `SessionUserReader` cambia de firma:

```ts
findActiveById(id: string, sessionId: string): Promise<SessionUserRecord | null>;
```

y `SessionUserRecord` gana **dos campos crudos** (nunca cocinados: «válida» es regla de dominio,
mismo argumento que ya está escrito para `companyDeletedAt` y `lockedUntil`):

- `sessionsValidFrom: Date` — columna de `users`, **coste cero**.
- `sessionRevokedAt: Date | null` — el `revoked_at` de la fila del registro para ESE `sid`, o `null`.

El adaptador lo resuelve **en la misma llamada `findFirst`**, por la relación `User.revokedSessions`:

```ts
revokedSessions: { where: { sessionId }, select: { revokedAt: true }, take: 1 }
```

**El coste, medido y declarado (R14):**

| | Hoy | Con QC-23 |
| --- | --- | --- |
| Invocaciones del puerto por petición | 1 | **1** |
| Sentencias SQL de esa invocación | **4** (`users`, `roles`, `role_permissions`, `companies` — Prisma resuelve cada relación en su propia consulta y el esquema no activa `relationJoins`) | **5**: las cuatro de hoy, más un `SELECT revoked_at FROM revoked_sessions WHERE user_id = ? AND session_id = ? LIMIT 1` |
| Filas que devuelve la segunda | — | **0 o 1**, por `revoked_sessions_session_id_key` |
| Escrituras en el camino de lectura | 0 | **0** (R40) |

> **Correccion del 2026-09-12, posterior a la revision.** La version aprobada de esta tabla decia
> «Hoy: 1 sentencia SQL». **Estaba mal por un factor de cuatro**, y no por estimacion sino por no
> haberlo medido: el reviewer instrumento `PrismaClient` con el evento `query` contra la base real
> y conto **4 sentencias sin QC-23 y 5 con QC-23**. El **delta sigue siendo exactamente +1**, que
> es lo unico que el argumento de abajo usa, asi que **ninguna decision cambia**. Se corrige el
> absoluto porque es el numero que **QC-28** va a leer para dimensionar su cache, y partir de una
> linea de base cuatro veces menor le haria sobrevalorar lo que su cache ahorra.

Es honesto llamarlo lo que es: **una búsqueda por índice único más por petición**. Es aceptable
porque (a) es un acceso a un btree único que devuelve como mucho una fila, sobre una tabla que la
purga de R39 mantiene pequeña —solo sesiones cerradas y aún no caducadas, cota natural de 8 h—;
(b) el sello, que es el mecanismo que cubre los casos de **seguridad** (baja, bloqueo, rol,
contraseña), cuesta **cero**; y (c) es justo la lectura que **QC-28** viene a quitar de la ruta
caliente.

**El camino a QC-28 queda abierto y explícito**: lo cacheable es el par
`(sessionsValidFrom, sessionRevokedAt)`, un dato pequeño y de clave obvia (`userId` + `sid`), y el
dominio lo consume por el puerto, así que QC-28 se implementa como un **decorador del puerto** sin
tocar `resolve-session.ts`. La condición que QC-28 tiene que respetar la fija R19: puede fallar
abierta **hacia la base**, nunca hacia «válida». Y por eso mismo se descartó la lista de
dispositivos (decisión 12): eso sí habría obligado a una lectura de **N filas** por petición, que no
es cacheable de la misma forma.

### 4.1 Los dos cortes nuevos en `resolve-session.ts`

Se añaden como pasos **7 y 8**, detrás de los seis existentes, que no se tocan ni se reordenan:

```
7. QC-23 R8  — claims.issuedAt <= record.sessionsValidFrom   -> null
8. QC-23 R11 — record.sessionRevokedAt !== null              -> null
```

Cada uno en su `if`, porque cada corte tiene su test y su `R<n>` (criterio ya escrito en ese
archivo). La regla del sello vive en una función pura propia,
`domain/session-revocation.ts > isStampedOut(claims, sessionsValidFrom)`, para que la comparación
`<=` tenga **un solo** cuerpo: lo comparte el corte 7 y el cálculo del `issuedAt` de la reemisión
de R31, y dos copias de esa desigualdad serían dos formas de equivocarse.

**Convivencia sello + identificador (R18):** son dos cortes independientes y **conmutativos** —los
dos salen por el mismo `return null`, que es el mismo camino de salida de siempre—. El sello va
primero por claridad y por coste conceptual, no porque el orden cambie nada: los datos de los dos
llegan juntos en la misma lectura, así que adelantar uno no ahorra IO. Se prueba con un test que
monta el caso en el que **ambos** aplican y afirma el mismo resultado con los dos órdenes de
evaluación (y con el corte 7 desactivado, para ver que el 8 solo también corta).

### 4.2 Fallar cerrado (R16, R17)

`createResolveSession` envuelve **solo** la llamada a `deps.users.findActiveById` en un `try`
acotado a esa línea —igual que `parseSessionClaims` acota el suyo a `JSON.parse`—, y en el `catch`
registra por el puerto `SessionCheckLog` (`log(diagnostic, requestId)`) y devuelve `null`.

- **No es un `catch` vacío** (`docs/conventions.md`): se registra con causa e identificador de
  petición de QC-71 y se traduce a «sin sesión», que es una decisión de negocio, no un silencio.
- **Lo que gana el sello y el identificador sobre el error**: la decisión cerrada 13 manda. Quien
  tenía sesión acaba en el **login**, no en una pantalla de error con un identificador de petición.
  El identificador **sí** existe y **sí** viaja: al registro del servidor. Es la única forma de que
  un corte de base no se confunda con un cierre de sesión al mirar los logs.
- Coste declarado y aceptado: una caída de la base se presenta al usuario como «te echó». Es
  exactamente lo que la decisión 13 compró a cambio de que la revocación no se pueda saltar
  provocando un fallo.

## 5. Las operaciones del service

Tres casos de uso nuevos en `domain/`, más el que reemplaza al `endSession` cableado directo.

### 5.1 `endSession()` — cerrar este dispositivo (R20–R24)

Hoy `lib/composition` cablea `endSession: clearSession` **directo al adaptador**, con este comentario
en `ports/session-reader.ts`: *«cerrar sesión no tiene caso de uso a propósito — borrar la cookie no
encierra ninguna decisión de negocio»*. **QC-23 lo deja de ser cierto**, y se dice con estas
palabras en vez de disimularlo: ahora hay que leer el `sid`, registrar el cierre, purgar y después
borrar la cookie. Nace `domain/end-session.ts`:

```ts
createEndSession({ session: SessionReader, revocations: SessionRevocationRepository,
                   cookie: SessionEraser, log: SessionCheckLog, now? }) => () => Promise<void>
```

Orden, que es el requisito:
1. `readClaims()`. Si no hay, **solo** borrar la cookie y salir: nada que registrar.
2. `revocations.revokeSession({ sessionId, userId, expiresAt, now })` — inserta la fila **y purga**
   las caducadas de esa persona en la misma transacción (R39). Un `23505` significa «ya estaba»: no
   es error.
3. `cookie.clear()`, **siempre**, también si el paso 2 lanzó (R23), registrando la causa con el
   identificador de petición.

`SessionEraser` es un puerto nuevo de una sola función (`clear()`), implementado por el `clearSession`
que ya existe: no cambia el adaptador, cambia quién lo llama. La clave de la fachada sigue
llamándose `endSession`, así que **`logoutAction()` no cambia ni una línea** (R21) y
`tests/unit/identity/logout-action.test.ts` sigue verde sin tocarlo — esa es la red de la migración.

### 5.2 `endAllSessions(actor, targetUserId)` — cierre total (R25–R29, R51)

```ts
createEndAllSessions({ revocations, now? })
  => (actor: Actor | null | undefined, targetUserId: string) => Promise<void>
```

**Primera línea, siempre, antes de tocar el puerto:**

```ts
if (targetUserId !== actor?.id) requirePermission(actor, 'usuarios.modificar');
else requireActor(actor);   // falla cerrado igual: sin actor no hay sesión propia que cerrar
```

- **`usuarios.modificar` y no un permiso nuevo.** Alternativa descartada: crear
  `sesiones.modificar`. Sería la **cuarta** enmienda al catálogo cerrado de QC-74 (tras QC-38, QC-66
  y QC-86), obligaría a migración y seed de `role_permissions`, y no separa ninguna capacidad real:
  quien puede borrar a una persona y cambiarle el rol ya puede cerrarle las sesiones por esos dos
  caminos. QC-101 exigirá ese mismo permiso para pintar su botón.
- **Autorizar por permiso y no por nombre de rol** es la regla del repo (QC-66 R4). «El
  Administrador» de la decisión 17 se implementa como «quien trae `usuarios.modificar`», que hoy es
  exactamente el Administrador según `SEED_ROLE_PERMISSIONS`.
- **Cerrarse las propias NO es `self_operation`.** QC-66 prohíbe apuntarse a uno mismo al borrar,
  al cambiar el rol y al mover el estado; aquí es al revés: apuntarse a uno mismo **es** el caso de
  uso de R25 («cerrar todas mis sesiones, incluida la actual»). Tampoco aplica la guarda del
  **último administrador**: cerrar sesiones no deja a ninguna empresa sin administrador.
- **Ámbito**: el puerto sube el sello con `WHERE id = ? AND company_id = ? AND deleted_at IS NULL`
  y devuelve un resultado discriminado `'ok' | 'not_found'`; los tres casos —no existe, borrada,
  otra empresa— se traducen al **mismo** `UserNotFoundError` (R28). El filtro vive en el puerto y no
  en el dominio, exactamente como en `UserAdminRepository`, para que ningún caso de uso futuro pueda
  olvidarlo.
- **No emite ninguna cookie y no lee ninguna.** Si el actor se cierra las suyas, su siguiente
  petición no resuelve sesión y el layout privado lo manda al login: eso ya lo hace el corte 7. Esta
  es la operación que **QC-101 y QC-53** invocarán; aquí **no se crea ninguna Server Action, página
  ni componente** (R51).

### 5.3 `endOtherSessions(actor, session)` — todas menos la actual (R30, R31, R32)

```ts
createEndOtherSessions({ revocations, sessions: SessionWriter, ids: SessionIdFactory, now? })
  => (actor, current: { roleName, companyId, sessionId }) => Promise<void>
```

1. Autorización: solo sobre **uno mismo** (es el gancho de QC-36); `requireActor(actor)`.
2. `revocations.stampAll(actor.id, actor.companyId, floorToSecond(now))` → el sello sube.
3. `sessions.startSession(createSessionTicket(actor.id, roleName, companyId,
   ids.newSessionId(), new Date(sello + 1000)))` → la sesión actual sobrevive, con `sid` nuevo
   (§ 2.3).

Los pasos 2 y 3 **no** son atómicos entre sí y no pueden serlo: uno escribe en Postgres y el otro en
una cookie. Si el 3 falla, el efecto es que el actor también acaba en el login — **fallo cerrado**,
que es el lado correcto por el que caer.

### 5.4 Los tres caminos de la contraseña (R30, R32)

**El gancho no es una función que haya que acordarse de llamar: es una regla sobre la escritura.**
Toda transacción que escriba `users.password_hash` **tiene que subir `sessions_valid_from` en la
misma sentencia**. Así:

| Camino | Estado | Qué hace esta ficha |
| --- | --- | --- |
| **QC-79** (enlace) | mergeado | `applyCredentialAndActivate` añade `sessionsValidFrom` a su `UPDATE`, dentro de la transacción que ya existe. Hoy su efecto es nulo medible —la cuenta era `pending` y no tenía sesiones—, y se hace igual: es la puerta que queda cerrada si QC-89 reutiliza ese camino |
| **QC-36** (cambio propio) | `pending` | Usa `endOtherSessions` (§ 5.3). Implementado y probado aquí; la pantalla es de QC-36 |
| **QC-89** (el admin restablece la de otro) | `pending` | Usa `endAllSessions(actor, targetId)` (§ 5.2) — no hay «sesión actual» del objetivo que preservar, y la del administrador no se toca porque el sello es **por usuario** |

Lo hace cumplir una guardia nueva, `tests/guards/guard-sesiones-cortadas.test.ts`: recorre
`lib/modules/identity/adapters/driven/persistence/**`, busca escrituras de Prisma con
`passwordHash:` en su `data` y se pone roja si en el mismo objeto no hay `sessionsValidFrom:`. Es
barata, es exacta —no hay más sitios donde se escriba un hash— y es lo que impide que QC-89 se
olvide dentro de seis semanas.

### 5.5 Los cuatro cortes (R33–R38)

La **decisión** de si un cambio corta sesiones es dominio, y vive en una función pura:

```ts
// domain/session-revocation.ts
export function changeRevokesSessions(change:
  | { kind: 'account_status'; next: UserAccountStatus }
  | { kind: 'role'; changed: boolean }
  | { kind: 'delete' }): boolean
```

- `account_status` → `true` para `blocked` e `inactive`; **`false` para `pending` y `active`**
  (R36).
- `role` → `true` solo si el `role_id` **cambió de verdad** (R35). Una edición que reescribe el
  mismo rol no cierra sesiones: R19 de QC-66 es reemplazo completo y casi toda edición pasa por ahí.
- `delete` → `true` (R34).

La **aplicación** vive en el adaptador, **dentro de las transacciones con bloqueo que ya existen**
(R38): `applyGuardedChange` y `updateAliveInCompany` de `user-admin-prisma.ts` añaden
`sessionsValidFrom: floorToSecond(now)` a su `data` cuando la función pura dice que sí. Un driven
puede importar `../../domain` (`docs/architecture.md > La regla de dependencias`), así que la regla
sigue estando en un solo sitio testeable con objetos planos, y la atomicidad sigue estando donde
sabe estar: en el adaptador que ya abre la transacción.

**Por qué no hay un caso de uso «revocar» que llame QC-66:** serían **dos** escrituras y dos
transacciones sobre la misma fila, y una ventana en la que la cuenta ya está bloqueada pero sus
cookies todavía valen. Es el mismo argumento con el que QC-66 metió el cambio de rol dentro de
`updateAliveInCompany` en vez de darle un método propio.

## 6. El puerto del almacén

```ts
// ports/session-revocation-repository.ts
export interface SessionRevocationRepository {
  /** Cierra UNA sesión y purga de paso las caducadas de esa persona (R20, R39). */
  revokeSession(input: { sessionId: string; userId: string; expiresAt: Date; now: Date }): Promise<void>;
  /** Sube el sello de una persona VIVA de esa empresa, y purga sus filas caducadas (R25, R39). */
  stampAll(input: { userId: string; companyId: string; validFrom: Date }): Promise<'ok' | 'not_found'>;
}
```

- **No existe ningún método de listado.** Es decisión 12 escrita en el tipo: sin él, «enséñame mis
  dispositivos» ni siquiera es expresable, y nadie lo añade por descuido.
- Los dos métodos son transaccionales y llevan la purga dentro (R39). La purga es un `DELETE …
  WHERE user_id = ? AND expires_at <= ?` acotado a **esa** persona: no recorre la tabla.
- `revokeSession` traduce el `23505` de `revoked_sessions_session_id_key` a éxito (R12). Nunca hay
  `SELECT` previo de existencia: entre el `SELECT` y el `INSERT` cabe otra transacción, criterio ya
  fijado por QC-38, QC-43 y QC-66.
- El adaptador es `adapters/driven/persistence/session-revocation-prisma.ts`, y es el **único** sitio
  con `prisma.revokedSession` (`/// @module identity`, lo vigila `guard-arquitectura-modulos`).

## 7. Errores (R48, R17)

**No nace ningún código nuevo.** Los tres que se usan ya están en el catálogo cerrado de QC-70:
`unauthorized` (R27), `user_not_found` (R28) y `unexpected` (el fallo no previsto, con su
identificador de petición). Ningún sitio que lanza escribe texto: los constructores de
`IdentityError` no admiten mensaje y el `diagnostic` va **solo** al registro del servidor.

**El `diagnostic` de esta ficha nunca lleva el `sid`.** Un identificador de sesión es material de
autenticación: con él y la firma correcta se entra. Mismo criterio con el que QC-79 prohibió poner
el secreto del enlace o su huella en el `diagnostic` (R13 de aquella).

## 8. Composición y capas (R46)

Cinco líneas nuevas en `lib/composition/index.ts`, en un bloque **al final** —sin reordenar ni
reformatear nada— salvo el `sessionProvider`, que sí cambia porque `endSession` deja de ser un
cableado directo:

```ts
const sessionIds: SessionIdFactory = { newSessionId: () => crypto.randomUUID() };
const sessionEraser: SessionEraser = { clear: clearSession };
const sessionRevocations: SessionRevocationRepository = { revokeSession, stampAll };
const sessionCheckLog: SessionCheckLog = { log: logSessionCheckFailure };
// …
endSession: createEndSession({ session: sessionReader, revocations: sessionRevocations,
                               cookie: sessionEraser, log: sessionCheckLog }),
endAllSessions: createEndAllSessions({ revocations: sessionRevocations }),
endOtherSessions: createEndOtherSessions({ revocations: sessionRevocations,
                                           sessions: sessionWriter, ids: sessionIds }),
```

El `resolveSession` sigue construyéndose **una sola vez** y de él salen las dos proyecciones: no se
toca esa estructura (QC-48 R21). El **actor no se resuelve aquí** (criterio de los seis módulos):
entra por parámetro y lo construye quien invoque, que hoy no es nadie y mañana será QC-101.

## 9. Alternativas descartadas

1. **Un solo mecanismo: solo el sello.** Es mucho más barato —cero lecturas nuevas por petición— y
   fue la propuesta inicial de 2026-09-03. **Descartada por decisión 6 y 9**: el sello no sabe
   distinguir dispositivos, así que cerrar sesión en el móvil echaría a la persona de la oficina.
   Está cerrada arriba y se registra aquí porque es la alternativa que explica todo el coste de § 4.
2. **Un solo mecanismo: solo el registro de sesiones cerradas.** Cubriría el cierre individual y,
   para el total, bastaría con insertar una fila por cada sesión viva… si supiéramos cuáles son. No
   lo sabemos, porque no se guardan las sesiones **abiertas** (decisión 12), y guardarlas es
   exactamente la lista de dispositivos descartada. **Descartada.**
3. **Guardar las sesiones abiertas y marcarlas como cerradas.** Daría la lista de dispositivos
   gratis y un cierre individual más natural. **Descartada por decisión 12**: obliga a escribir una
   fila en cada login y a leer N filas por petición, justo lo que QC-28 quiere quitar, y deja una
   tabla que crece con cada inicio de sesión.
4. **Comparar `iat < sello` estricto.** Ver § 2.3: deja un hueco de hasta un segundo.
5. **Un permiso nuevo `sesiones.modificar`.** Ver § 5.2: cuarta enmienda al catálogo cerrado de
   QC-74 sin separar ninguna capacidad real.
6. **Purgar en el camino de lectura**, aprovechando que cada petición ya mira el registro.
   **Descartada**: convertiría la ruta más caliente de la aplicación en una **escritura** por
   petición, con su contención de bloqueos, y R40 lo prohíbe explícitamente. La decisión 3 dice
   «quien consulta las sesiones **de un usuario**», y eso es lo que hacen las dos operaciones del
   § 6, no la comprobación por petición —que no consulta las sesiones de nadie: mira si **una**
   existe—.
7. **Aplicar la comprobación en el middleware.** **Descartada por decisión 14 y por QC-9**: el borde
   no es la frontera de seguridad, no consulta la base y `guard-middleware-edge.test.ts` se pondría
   roja en cuanto el cierre de imports del middleware tocara un repositorio.

## 10. Dependencias de terceros

**Ninguna** (R47). Todo lo que hace falta ya está: `crypto.randomUUID()` es API de plataforma —la
misma `crypto` global que ya usa `session-token.ts` con WebCrypto—, la firma no cambia, y el resto
es esquema, migración y dominio. No se abre ninguna propuesta bajo
`docs/architecture.md > Dependencias de terceros`, así que no hay cuatro checks que reportar.

## 11. Multiplataforma

No aplica: la feature no añade ni toca **ninguna** UI (R51, R50). La única consecuencia visible es
que, al desplegar, quien tuviera sesión abierta aparece en el login (R4) — en las tres plataformas
por igual, por el camino de redirección que ya existe.

## 12. Consecuencias declaradas y deudas

1. **Al desplegar caen todas las sesiones vivas** (R4), por la subida a `v4` y porque el sello nace
   en `now()`. Aceptado por decisión 8, con el mismo criterio de QC-9 y QC-48. Lo que ve la persona:
   su siguiente clic la lleva al login, sin mensaje y sin explicación — igual que hoy si su cookie
   caduca.
2. **Una petición más barata no existe:** § 4 declara la búsqueda por índice único añadida. QC-28 es
   quien la quita.
3. **`pending` no corta (R36), y eso tiene un borde:** mover una cuenta `active` a `pending` y
   devolverla a `active` dentro de las 8 h **revive** sus cookies, porque ninguna de las dos
   transiciones sube el sello. Es consecuencia directa de la decisión 1 y se escribe aquí para que
   nadie la descubra de sorpresa; si algún día molesta, es una línea en
   `changeRevokesSessions` y su test.
4. **Entrar en el MISMO segundo en que sube el sello rebota al login, y se cura solo** (añadido el
   2026-09-12, tras la revisión: es consecuencia directa del `<=` de § 2.3 y esta lista no la
   enumeraba). `isStampedOut` es `<=` e `iat` viaja truncado al segundo, así que un login que
   ocurra en el **mismo segundo** en que subíó el sello de esa persona —cambio de rol, bloqueo,
   borrado o el enlace de QC-79— emite una cookie que su **primera** petición ya rechaza: vuelve al
   login y el segundo intento entra. La ventana es de menos de un segundo y no deja a nadie fuera
   de forma duradera. **Es el precio correcto**: la alternativa es el `<` estricto, que deja
   sobrevivir una sesión ajena emitida en el segundo del corte —descartada en § 2.3 y por la
   decisión cerrada 13—. Hoy **nadie la pisa**, y está comprobado: `applyCredentialAndActivate` no
   invoca `startSession`, así que consumir el enlace de QC-79 no hace auto-login. **QC-89 y QC-96
   heredan este borde** el día que decidan entrar a la persona justo después de cambiarle la
   contraseña; la salida, si alguna vez molesta, es la misma que usa R31: emitir con
   `firstIssuedAtAfterStamp(sello)` en vez de con `now`.
   **Resuelto en el login desde QC-116** (2026-10-10): `verifyCredentials` emite con
   `firstIssuedAtAfterStamp(sello)` si el sello cae en el segundo del login (tope de 2 s). El hueco
   que deja —dos sellos de la misma persona en el mismo segundo con un login entre ellos— está en
   `specs/QC-116-sesion-revocada-en-el-mismo-segundo/design.md > 6`. Ningún requisito de QC-23 cambia.
5. **Una caída de la base se ve como un cierre de sesión** (§ 4.2). Precio de la decisión 13.
6. **E2E diferida a QC-53** (R50): deuda con destinatario, no exención.
7. **El botón del administrador no existe hasta QC-101** (R51): la operación queda implementada,
   probada y sin ninguna vía de invocación desde la interfaz.
