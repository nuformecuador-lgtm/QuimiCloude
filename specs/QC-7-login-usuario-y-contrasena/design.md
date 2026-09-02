# QC-7 — login-usuario-y-contrasena · design

Referencias: `docs/architecture.md > Modulos y arquitectura hexagonal` y
`> La regla de dependencias`, `tests/guards/guard-arquitectura-modulos.test.ts`,
`specs/QC-7-login-usuario-y-contrasena/requirements.md`.

**Esta es la primera feature que se construye sobre la estructura hexagonal de QC-15.** Lo
que se decide aqui se va a copiar en QC-8 y QC-9, asi que cada pieza lleva su ruta literal.

---

## 1. La frontera QC-7 / QC-8 / QC-9, explicita

| Capacidad | Feature | Aqui |
| --- | --- | --- |
| Buscar el usuario por nombre de usuario | **QC-7** | puerto `UserCredentialsReader` + adaptador Prisma |
| Verificar la contrasena contra el hash | **QC-7** | puerto `PasswordHasher` (ya existe, QC-5) |
| Respuesta uniforme en contenido y en tiempo | **QC-7** | dominio (`verify-credentials.ts`) |
| Contar fallos y bloquear la cuenta con escalada | **QC-7** (alcance añadido 2026-09-01) | dominio (`account-lock.ts`) + puerto `LoginAttemptRecorder` + 3 columnas en `users` |
| Construir el ticket de sesion (quien, desde cuando, hasta cuando) | **QC-7** | dominio (`session.ts`) |
| Firmar el valor y **escribir** la cookie | **QC-7** | puerto `SessionWriter` + adaptador `session-cookie.ts` |
| **Leer** la cookie en cada peticion y resolver el `SessionUser` | **QC-8** | no se toca. `session-stub.ts` intacto |
| **Invalidar** la cookie al cerrar sesion (`endSession`, `logoutAction`) | **QC-8** | no se toca |
| Redirigir por falta de sesion / login con sesion (`middleware.ts`) | **QC-9** | no se toca |
| Crear usuarios (seed) | **QC-6** | no se toca (ver 7) |

Regla de corte, en una frase: **QC-7 escribe la cookie; QC-8 la lee y la borra.**

Para que QC-8 no tenga que inventar nada, QC-7 deja el **formato del valor** congelado
(seccion 5) y exporta desde el mismo adaptador la funcion de firma que QC-8 reutilizara para
verificar. Lo que QC-7 **no** escribe es la funcion de lectura/verificacion: escribir codigo
que nadie llama para "adelantar" QC-8 es alcance inventado y el reviewer lo rechaza.

---

## 2. Forma de la solucion en el dominio

`verifyCredentials` deja de ser una funcion suelta y pasa a ser un **caso de uso construido
con sus puertos**: `createVerifyCredentials(deps)` devuelve la funcion con la firma que hoy
consume `login-action.ts`. Asi el cableado sigue viviendo solo en `lib/composition/index.ts`
(R17) y el dominio no importa nada concreto.

Algoritmo (todo en `domain/verify-credentials.ts`, nada de esto en la Server Action):

1. `loginInputSchema.safeParse(input)` — si falla, `{ ok: false }` **sin** tocar puertos (R8).
2. Normalizar el nombre de usuario: `trim()` + minusculas (R4). La contrasena **no** se toca.
3. `users.findActiveByUsername(normalized)` — el puerto solo devuelve usuarios no borrados
   (R1, R5), con su estado de bloqueo.
3bis. Si hay usuario y `isLocked(user, now)`: se ejecuta **igualmente** una verificacion de
   hash contra su hash real (R29), se **descarta** el resultado, no se escribe nada (R25) y
   se devuelve `{ ok: false }` — el mismo objeto que R2/R3 (R24, R28).
4. **Siempre** una verificacion de hash (R6):
   - usuario encontrado -> `hasher.verify(password, user.passwordHash)`.
   - usuario no encontrado -> `hasher.verify(password, await decoyHash())`, donde
     `decoyHash()` es `hasher.hash(DECOY_SECRET)` calculado **una vez por instancia del caso
     de uso** y cacheado en el closure. Al producirlo con el mismo `PasswordHasher` de
     produccion, hereda automaticamente su coste (R7): no hay ninguna constante de hash
     copiada a mano que se quede desfasada si cambia `BCRYPT_ROUNDS`.
   - el resultado de la rama señuelo se descarta: siempre `{ ok: false }`.
5. Si la verificacion es correcta:
   `attempts.record(user.id, nextLockState(user, 'success', now))` (contador, nivel y bloqueo
   a cero, R27), luego `session.startSession(createSessionTicket(user.id, now))` y
   `{ ok: true }`.
6. Si la verificacion falla **y habia usuario**:
   `attempts.record(user.id, nextLockState(user, 'failure', now))` (R22, R23) y
   `{ ok: false }` (R14: nunca se llama a `startSession`).
7. Si no habia usuario: `{ ok: false }` y **ninguna escritura** (R31). No hay a quien contarle
   los fallos, y crear una fila o una entrada por un usuario inexistente seria un oraculo de
   existencia por efecto lateral.

Detalle que importa: el orden es **verificar y luego emitir**. Si `startSession` lanza (por
ejemplo, secreto ausente, R13), la excepcion se propaga y `loginAction` no redirige: no se da
por autenticado a nadie sin cookie.

`DECOY_SECRET` es una constante literal cualquiera, no una credencial de nadie: su unico
proposito es gastar el mismo trabajo de bcrypt. Se nombra sin el segmento `password` para no
disparar `guard-password-never-plaintext`, igual que ya hizo `CREDENTIAL_MAX_LENGTH`.

**El senuelo se calienta al CONSTRUIR el caso de uso, y eso tiene un coste de arranque que hay
que decir** (menor M3 de la ronda 1, documentado tras el m11 de la ronda 2). Si se calculara
perezosamente, el **primer** intento con usuario inexistente de cada proceso pagaria `hash()`
**mas** `verify()` —~220 ms frente a ~110—, una asimetria de tiempo de una sola muestra por
proceso. Al lanzarlo en la construccion desaparece.

El precio: `lib/composition/index.ts` construye la fachada **al importarse**, asi que **todo
proceso de servidor paga un bcrypt de coste 10 al arrancar**, tambien si nadie va a hacer login
nunca en ese proceso. No bloquea el arranque —la promesa no se espera, solo se cachea— pero es
un pico de CPU real en el boot y no estaba escrito en ningun sitio. Se asume: ~110 ms una vez
por proceso, a cambio de que ningun intento sea distinguible por tiempo del resto.

Lo que este diseño **no** hace: un reloj falso inyectado por puerto. El dominio recibe `now`
como parametro opcional (`createSessionTicket(userId, now = new Date())`), que es lo que hace
el ticket testeable sin montar un puerto de tiempo.

---

## 3. Archivo por archivo

| Ruta literal | Estado | Que hace |
| --- | --- | --- |
| `lib/modules/identity/domain/verify-credentials.ts` | **modificado** | Deja de ser stub: `createVerifyCredentials(deps)` con el algoritmo de la seccion 2. Exporta `DECOY_SECRET` para el test de R6/R7 |
| `lib/modules/identity/domain/session.ts` | **nuevo** | `SESSION_DURATION_MS`, tipo `SessionTicket` (`userId`, `issuedAt`, `expiresAt`) y `createSessionTicket()`. Puro |
| `lib/modules/identity/domain/account-lock.ts` | **nuevo** | Politica de bloqueo **pura**: `MAX_FAILED_ATTEMPTS`, `LOCK_DURATIONS_MS`, tipo `AccountLockState`, `isLocked(state, now)` y `nextLockState(state, outcome, now)` (seccion 5.5) |
| `lib/modules/identity/ports/user-credentials-reader.ts` | **nuevo** | `interface UserCredentialsReader { findActiveByUsername(username: string): Promise<AuthenticatableUser \| null> }`, con `AuthenticatableUser = { id: string; passwordHash: string } & AccountLockState` |
| `lib/modules/identity/ports/login-attempt-recorder.ts` | **nuevo** | `interface LoginAttemptRecorder { record(userId: string, state: AccountLockState): Promise<void> }`. El dominio **calcula** el estado; el puerto solo lo persiste |
| `lib/modules/identity/ports/session-writer.ts` | **nuevo** | `interface SessionWriter { startSession(ticket: SessionTicket): Promise<void> }` |
| `lib/modules/identity/ports/password-hasher.ts` | sin cambios | Ya existe (QC-5) |
| `lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts` | **nuevo** | Implementa `UserCredentialsReader` con `prisma.$queryRaw` (ver 4.1) |
| `lib/modules/identity/adapters/driven/session/session-cookie.ts` | **nuevo** | Implementa `SessionWriter`: firma el valor (`node:crypto`) y escribe la cookie con `cookies()` de `next/headers`. Exporta tambien `signSessionValue()` y `SESSION_COOKIE_NAME` para QC-8 |
| `lib/modules/identity/adapters/driven/session/session-stub.ts` | **sin cambios** | Es QC-8. No se toca ni se borra |
| `lib/modules/identity/adapters/driving/login-action.ts` | **sin cambios** | Ya llama a `identity.verifyCredentials(parsed.data)` y redirige. Contrato congelado (R16) |
| `lib/modules/identity/index.ts` | **modificado** | Reexporta `createVerifyCredentials` en lugar de `verifyCredentials`, y el tipo `SessionTicket` de `./domain/session`. Sigue reexportando **solo** de `./domain` (R18) |
| `lib/composition/index.ts` | **modificado** | Ver 4.3: construye los tres adaptadores y llama a `createVerifyCredentials` |
| `.env.example` | **modificado** | Añade `SESSION_SECRET` con placeholder, sin valor real |
| `db/schema.prisma` | **modificado** | Tres columnas nuevas en el modelo `User` (seccion 5.6). El modelo ya declara `/// @module identity`: no cambia de dueño |
| `db/migrations/<ts>_user_login_lockout/migration.sql` | **nuevo** | UP: `ALTER TABLE users ADD COLUMN` de las tres columnas |
| `db/migrations/<ts>_user_login_lockout/down.sql` | **nuevo** | DOWN: `DROP COLUMN` de las tres. Obligatorio (convencion propia) |
| `package.json`, `docs/dependencias.md` | **modificado** | `@playwright/test` aprobado (6.4). **En el mismo paso**: instalar + fila en el registro |
| `playwright.config.ts`, `e2e/login.spec.ts` | **nuevo** | E2E del flujo de autenticacion (seccion 7, nivel 4) |
| `app/**`, `components/**` | **sin cambios** | Feature de backend (R16) |
| `tests/unit/identity/login-action.test.ts` | **modificado (minimo)** | Hoy carga el stub real (`realStub.verifyCredentials`) como doble por defecto y tiene un test que afirma "mientras no hay verificacion real". Las dos cosas mueren con esta feature. Alcance exacto en `tasks.md > T6b`; el resto de aserciones no se toca |

---

## 4. Detalle de las piezas nuevas

### 4.1 Lectura del usuario (`user-credentials-prisma.ts`)

```sql
SELECT id, password_hash, failed_login_attempts, lock_level, locked_until FROM users
WHERE lower(username) = lower($1) AND deleted_at IS NULL
LIMIT 1
```

La escritura del resultado del intento (`recordLoginAttempt`) va con la API tipada,
`prisma.user.update({ where: { id }, data: { failedLoginAttempts, lockLevel, lockedUntil } })`:
es por clave primaria, no necesita el indice funcional y asi queda tipada.

Se usa `prisma.$queryRaw` (parametrizado, nunca interpolado) y no la API tipada con
`mode: 'insensitive'` por una razon concreta: la unicidad del nombre de usuario vive como
**indice funcional parcial** `users_username_unique` sobre `lower(username) WHERE deleted_at
IS NULL` (escrito a mano en la migracion de QC-4, ver el comentario del modelo `User`).
`mode: 'insensitive'` genera `ILIKE`, que **no usa ese indice**: el login haria un seq scan
sobre `users` en la ruta mas caliente de la aplicacion.

El adaptador devuelve **solo** `id`, `passwordHash` y el estado de bloqueo. No trae correo,
documento, nombre ni telefono:
lo que no sale de la base no se puede filtrar por error en un log (R15). El `SessionUser`
completo (nombre mostrable y rol) lo resuelve QC-8, que es quien lo necesita.

Este es el unico archivo del modulo que toca `prisma.user`, y `identity` es el dueño
declarado del modelo (`/// @module identity`), asi que el bloque 10 de la guardia queda
verde.

### 4.2 Escritura de la cookie (`session-cookie.ts`)

```ts
import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
```

> Solo `createHmac`. `timingSafeEqual` **no** entra aqui: hace falta para *verificar* la firma,
> que es QC-8 (ver 5.1). Escribir en QC-7 codigo que nadie llama para adelantar QC-8 es alcance
> inventado. (Corregido tras la revision, menor M8.)

- **Por que un adaptador driven y no la Server Action:** la cookie es un detalle de
  transporte. Si la escribiera `login-action.ts`, la decision "cuando hay sesion y hasta
  cuando" quedaria fuera del dominio, que es justo lo que `CHECKPOINTS.md > Modulos
  hexagonales` marca como mal hecho. El dominio decide *que* sesion se abre; el adaptador
  sabe *como* se transporta.
- **`next/headers` en `driven/`:** la fila `adapters/driven/**` de la tabla de dependencias
  no menciona `next/*`, ni para permitirlo ni para prohibirlo, y la guardia (bloque 13) solo
  le prohibe la composicion, el driving propio y la UI — asi que esto pasa en verde. Queda
  como **pregunta abierta 2** (la numeracion es la de `requirements.md`) para que el humano
  lo confirme y se anote la fila; no se
  inventa una regla nueva en el `.md` de arquitectura desde una feature.
- `cookies()` solo permite escribir dentro de una Server Action o un route handler. El unico
  llamador es `loginAction`, que es `'use server'`. Correcto por construccion.
- El secreto se lee de `process.env.SESSION_SECRET` **en el momento de la llamada**, no al
  cargar el modulo: leerlo en el import rompe el build de Vercel y hace intestable R13.

### 4.3 El cambio en `lib/composition/index.ts`

```ts
import { createVerifyCredentials } from '@/lib/modules/identity';
import { createPasswordHash, verifyPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import { findActiveByUsername, recordLoginAttempt } from '@/lib/modules/identity/adapters/driven/persistence/user-credentials-prisma';
import { startSession } from '@/lib/modules/identity/adapters/driven/session/session-cookie';
import { endSession, getSessionUser } from '@/lib/modules/identity/adapters/driven/session/session-stub';

const passwordHasher: PasswordHasher = { hash: createPasswordHash, verify: verifyPasswordHash };
const userCredentialsReader: UserCredentialsReader = { findActiveByUsername };
const loginAttemptRecorder: LoginAttemptRecorder = { record: recordLoginAttempt };
const sessionWriter: SessionWriter = { startSession };
const sessionProvider: SessionProvider = { getSessionUser, endSession };

export const identity = {
  verifyCredentials: createVerifyCredentials({
    users: userCredentialsReader,
    attempts: loginAttemptRecorder,
    hasher: passwordHasher,
    session: sessionWriter,
  }),
  passwordHasher,
  ...sessionProvider,
} as const;
```

La clave `verifyCredentials` de la fachada **no cambia de nombre ni de firma**: por eso
`login-action.ts` no se toca (R16).

---

## 5. El modelo de la sesion: que viaja en la cookie y por que

### 5.1 Forma del valor

```
v1.<payload-base64url>.<hmac-base64url>
payload = {"sub":"<uuid del usuario>","iat":<epoch segundos>,"exp":<epoch segundos>}
hmac    = HMAC-SHA256(SESSION_SECRET, "v1.<payload-base64url>")
```

- **Token firmado y sin estado, no opaco contra base.** No hay tabla `sessions` ni consulta
  extra por peticion. Ver la alternativa descartada en 6.2.
- **`v1.` delante** para que QC-8 pueda rechazar formatos viejos si el esquema cambia, sin
  adivinar por la forma del texto.
- **`exp` va dentro y firmado**, no solo en el `Max-Age`: el `Max-Age` lo controla el
  navegador y un cliente hostil puede conservar la cookie mas alla de su caducidad. La
  caducidad que vale es la que verifica el servidor (R11), y QC-8 la comprobara sobre este
  campo.
- **`sub` es el id del usuario y nada mas.** Nada de nombre, rol, correo ni permisos: eso
  cambia (un rol revocado seguiria viajando en la cookie hasta que caduque) y ademas es PII
  en un valor que viaja en cada peticion (R12).
- **Comparacion en tiempo constante** (`timingSafeEqual`) cuando QC-8 verifique la firma; la
  funcion de firma queda exportada desde aqui para que QC-8 no la reimplemente.

### 5.2 Atributos de la cookie

| Atributo | Valor | Por que |
| --- | --- | --- |
| Nombre | `qc_session` | Prefijo del producto, sin decir "auth"/"token"; no colisiona con `sidebar_state` (preferencia de UI de QC-11) |
| `httpOnly` | `true` | Lo pide la description (D3): un XSS no puede leer la sesion |
| `secure` | `process.env.NODE_ENV === 'production'` | En produccion (Vercel, HTTPS) siempre; en `localhost` sobre `http` una cookie `Secure` **no se guarda** y el login local no funcionaria |
| `sameSite` | `lax` | Corta CSRF desde sitios de terceros conservando la navegacion normal por enlaces. `strict` romperia el retorno desde un enlace externo (correo, chat) y no aporta aqui: las mutaciones son Server Actions, que ya son POST del mismo origen |
| `path` | `/` | La sesion vale para toda la aplicacion |
| `maxAge` | `SESSION_DURATION_MS / 1000` | Cookie de duracion fija, no de sesion de navegador: si no se declara, sobrevive indefinidamente en navegadores que restauran pestañas |
| `domain` | **no se declara** | Sin subdominios que compartan sesion; declararlo la ampliaria a todos |

### 5.3 El secreto

`SESSION_SECRET`, variable de entorno, minimo 32 caracteres. Si falta o es mas corto, el
adaptador **lanza** y el login falla sin cookie (R13): *fail closed*. Se añade a
`.env.example` como placeholder — nunca un valor real en el repo
(`docs/architecture.md > Principios 4`).

### 5.4 Duracion

`SESSION_DURATION_MS = 8 h`, constante del dominio. Ocho horas es una jornada de trabajo de
un ERP interno: cubre el dia sin obligar a reautenticar en mitad de una operacion, y no deja
la sesion viva un mes en un equipo compartido. **No hay renovacion deslizante**: la caducidad
es absoluta desde la emision, que es lo mas simple de razonar y de testear; añadir renovacion
despues es tocar solo QC-8, que es quien lee.

No va por variable de entorno a proposito: no es un parametro que cambie entre entornos
(`docs/architecture.md > Principios 4` habla de lo que si cambia), es una decision de
producto. **Confirmado por el humano el 2026-09-01** (D10): 8 h, sin "recordarme" y sin
renovacion deslizante. Decision cerrada, no se reabre.

### 5.5 Politica de bloqueo (`domain/account-lock.ts`)

Todo esto es **dominio puro**: dos funciones sin efectos, sin reloj propio (`now` entra como
parametro) y sin ningun conocimiento de Prisma. Es lo que hace que la escalada se pueda testear
entera sin base de datos.

```ts
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATIONS_MS = [1, 5, 15, 60].map((m) => m * 60_000); // niveles 1..4
export type AccountLockState = {
  readonly failedAttempts: number;
  readonly lockLevel: number;
  readonly lockedUntil: Date | null;
};
export function isLocked(state: AccountLockState, now: Date): boolean;
export function nextLockState(state: AccountLockState, outcome: 'success' | 'failure', now: Date): AccountLockState;
```

Reglas, sin ambiguedad (es lo que pidio el humano):

| Situacion | `failedAttempts` | `lockLevel` | `lockedUntil` |
| --- | --- | --- | --- |
| Fallo y aun no se llega a 5 | `+1` | igual | igual (`null`) |
| Fallo que **alcanza** 5 (R22) | vuelve a `0` | `min(lockLevel + 1, 4)` | `now + LOCK_DURATIONS_MS[nivel - 1]` |
| Fallo **estando bloqueada** (R25) | igual | igual | igual — no se escribe nada |
| Exito (R27) | `0` | `0` | `null` |
| Bloqueo caducado y luego fallo | `1` | se conserva | `null` hasta volver a 5 |

- **Cuando se incrementa el nivel:** solo al consumar un bloqueo, o sea cada 5 fallos. El
  contador se reinicia en ese momento para que el siguiente bloqueo necesite otros 5.
- **Cuando se reinicia:** un login **exitoso** pone contador **y nivel** a cero. El dueño de
  la cuenta demostro su identidad; mantenerle el nivel alto lo castigaria por un ataque que no
  es suyo.
- **Tope:** nivel 4 = 60 minutos, y ahi se queda para siempre (R23). No hay bloqueo permanente
  **porque no hay pantalla de administracion** en el repo ni en el backlog: un bloqueo
  permanente dejaria al usuario fuera hasta tocar la base a mano.
- **El nivel no decae con el tiempo.** Alternativa considerada y descartada: una ventana de
  "buen comportamiento" (por ejemplo, bajar un nivel tras 24 h sin fallos) exigiria una cuarta
  columna con la fecha del ultimo fallo y una regla mas que testear, para acotar algo que ya
  esta acotado en 60 minutos. Si el humano lo quiere, es una columna y una linea.

**El bloqueo no tiene mensaje propio (R28).** Un "cuenta bloqueada" distinto del generico
convertiria el login en un oraculo doble: solo un usuario **que existe** puede estar bloqueado,
asi que el mensaje delataria que el nombre de usuario es real, y ademas le confirmaria al
atacante que su fuerza bruta esta surtiendo efecto. El precio es real y se acepta: un usuario
legitimo que se bloquea a si mismo ve "usuario o contrasena incorrectos" hasta 60 minutos sin
saber por que. Cuando exista la recuperacion de contrasena (hoy `FORGOT_PASSWORD_ROUTE` da
404, deuda de QC-10) se puede avisar por correo **al dueño de la cuenta**, que es el canal que
no filtra nada a terceros.

**Uniformidad de tiempo con el camino nuevo (R29).** El bloqueo añade un tercer desenlace que
podria responder antes que los otros dos: comprobar `lockedUntil` es una comparacion de fechas,
mientras que los otros dos caminos pagan ~100 ms de bcrypt. Por eso el camino bloqueado
**tambien verifica el hash** y tira el resultado. Queda una diferencia residual: los caminos
que escriben (fallo con usuario existente) pagan un `UPDATE` de mas. Es del orden del
milisegundo frente a los ~100 ms de bcrypt, o sea que no es un oraculo utilizable; se anota
como limite conocido en vez de fingir que la uniformidad es perfecta.

### 5.6 Persistencia del bloqueo (columnas nuevas, R30)

Tres columnas en `users`, modelo **propiedad de `identity`** (`/// @module identity`, ya
declarado; no cambia). Nombres de base en ingles y `snake_case`, como manda el esquema:

```prisma
failedLoginAttempts Int       @default(0) @map("failed_login_attempts")
lockLevel           Int       @default(0) @map("lock_level")
lockedUntil         DateTime? @map("locked_until") @db.Timestamptz(6)
```

- Columnas del propio `User` y no una tabla `login_attempts` aparte: lo que hay que guardar es
  **estado actual**, no historico. Una tabla de intentos es un registro de auditoria, y eso es
  otra feature (pregunta abierta 1).
- Las tres tienen valor por defecto o son nulables: la migracion se aplica sobre filas
  existentes sin `NOT NULL` roto ni backfill.
- `lockedUntil` es `timestamptz`, como el resto de instantes del esquema: comparar un bloqueo
  en hora local seria un error de una hora dos veces al año.
- Sin indice nuevo: no se consulta por estas columnas, se leen junto a la fila del usuario que
  ya se localiza por `users_username_unique`.
- `users` ya tiene RLS con `FORCE ROW LEVEL SECURITY` desde QC-4; añadir columnas no lo altera.
- La migracion se crea con `pnpm run db:migrate:create` y su **`down.sql` se escribe a mano**
  (`DROP COLUMN` de las tres, en orden inverso). Prisma no genera downs.


### 5.7 El registro del intento es ATOMICO (anadido tras la revision, M-A1)

La primera version tenia un agujero que **ningun test podia encontrar porque nadie escribio la
pregunta**: el registro del fallo era **lectura-modificacion-escritura no atomica**, con ~110 ms
de bcrypt en medio. El dominio leia `failedAttempts`, verificaba el hash, y el adaptador escribia
un **valor absoluto** calculado sobre aquella lectura ya vieja.

Consecuencia: 50 intentos en paralelo contra la misma cuenta leen todos `0` y escriben todos `1`.
**El contador no llega nunca a 5 y R22 no se dispara jamas.** Y esto no es una carrera de manual:
**lanzar intentos en paralelo es exactamente lo que hace un ataque de fuerza bruta**. El control
quedaba anulado justo en el unico escenario para el que existe — un atacante secuencial se
bloqueaba; uno concurrente, que es el que importa, no.

**Decision: compare-and-set con reintento acotado.** La politica de escalada sigue viviendo
**solo** en `domain/account-lock.ts`; lo que cambia es como se persiste.

El puerto `LoginAttemptRecorder` pasa a exponer dos primitivas de persistencia, y el dominio
sigue calculando todos los estados:

```ts
compareAndSet(userId, esperado, siguiente): Promise<boolean>  // aplica solo si nada cambio
set(userId, estado): Promise<void>                            // incondicional
```

- **Fallo -> `compareAndSet`.** El `UPDATE` lleva el estado leido en el `WHERE`. Si otro intento
  se adelanto, no afecta a ninguna fila, y el dominio **relee y recalcula la politica sobre el
  estado fresco**. En cada ronda gana exactamente un CAS, asi que el contador sube de verdad y
  tras cinco rondas ganadoras la cuenta se bloquea; los que pierden, al releer, ven el bloqueo y
  salen sin escribir.
- **Exito -> `set`.** El estado de exito es todo ceros: **no depende del valor previo**, es
  idempotente y no tiene el problema de lectura-modificacion-escritura.
- **El predicado del CAS compara los dos enteros por igualdad y el bloqueo por RANGO.**
  De los enteros se exige que no hayan cambiado; de `locked_until`, solo que **no haya bloqueo
  vigente** (`IS NULL OR <= now`). Las dos mitades tienen motivo distinto:
  - **Por que el bloqueo va por rango y no por igualdad:** `locked_until` es `timestamptz(6)`
    —microsegundos en Postgres— y un `Date` de JS solo llega al milisegundo. Una igualdad exacta
    es una comparacion que un dia deja de casar en silencio y dejaria el CAS sin aplicar nunca.
    Un rango es inmune a eso.
  - **Por que el bloqueo tiene que estar en el predicado, aunque sea por rango.** Aqui hubo un
    error, y se deja escrito porque el siguiente que lea esto se iba a fiar de la frase anterior.
    La primera version de este documento decia que no hacia falta mirar `locked_until` porque
    *"el par de enteros ya identifica cada estado de la cadena"*. **Es falso, y el reviewer lo
    demostro ejecutandolo.** El par `(0, 1)` aparece con dos `locked_until` distintos:

    | estado | `failed` | `level` | `locked_until` |
    | --- | --- | --- | --- |
    | bloqueo recien consumado | 0 | 1 | `T` (futuro) |
    | ese mismo bloqueo ya caducado | 0 | 1 | `T` (pasado) |

    y se vuelve a pasar por `(0,1)` cada vez que un login correcto reinicia a `(0,0,null)` y se
    acumulan otros cinco fallos. Es un **ABA**: el par vuelve a su valor anterior y el CAS no
    distingue una cosa de la otra. Consecuencia medida contra Postgres: un intento que leyo
    `(0,1,caducado)` y llego tarde **aplicaba sobre un bloqueo activo y lo borraba**, dejando
    `(1,1,null)`. O sea que un atacante bloqueado podia **quitarse el bloqueo** con un intento
    fallido en el momento justo — el mismo control anulado por segunda vez, ahora por el arreglo
    del primer fallo.

    Con la condicion de rango el CAS **no puede aplicar nunca sobre un bloqueo vivo**: pierde, el
    dominio relee, ve el bloqueo y sale sin escribir. Que es exactamente lo que ya hacia el
    dominio y lo que la escritura se estaba saltando.
- **Por que el camino de exito NO lleva esa condicion.** No es un olvido. `set` escribe todo
  ceros, que es lo que R27 pide, y ese estado **no depende del valor previo**: no hay ABA que
  pisar. Y si un bloqueo aparece entre la lectura y la escritura de un login **correcto**, borrarlo
  es lo deseable, no un agujero: quien acaba de demostrar que sabe la contrasena es el dueno de la
  cuenta, y R27 manda dejarsela limpia. El corte de R24 ya se evaluo sobre el estado que ese
  intento leyo.

Lo que **no** cambia, y hay que seguir vigilando: sigue habiendo **exactamente una** verificacion
de hash en los tres caminos (R6, R29); la rama de usuario inexistente **sigue sin tocar el puerto
de escritura** (R31); y un intento durante el bloqueo **sigue sin escribir nada**, ahora tambien
cuando el bloqueo aparece entre la lectura y la escritura (R25).

**Alternativas descartadas.** Un `UPDATE ... SET failed_login_attempts = failed_login_attempts + 1`
con toda la politica en SQL (`CASE WHEN ... >= umbral THEN ...`) seria atomico de una sola
sentencia, pero **duplicaria la tabla de escalada de 5.5 dentro del adaptador**: la politica
dejaria de vivir en un solo sitio, que es justo lo que hace que se pueda testear sin base. Y un
`SELECT ... FOR UPDATE` dentro de una transaccion obligaria al dominio a ejecutarse **dentro** de
una transaccion, filtrando semantica de base a traves del puerto.

**Limite que queda, escrito:** si el CAS pierde la carrera 10 veces seguidas, ese intento no se
cuenta. Es una perdida de un intento bajo contencion extrema, no una perdida del bloqueo: el
contador es monotono y el bloqueo acaba disparandose igual.
---

## 6. Alternativas descartadas

### 6.1 Descartada — escribir la cookie desde `login-action.ts` (Server Action)

Es lo mas corto: `cookies().set(...)` justo antes del `redirect`, sin puerto `SessionWriter`
ni adaptador nuevo. Se descarta porque deja la decision "hay sesion y dura hasta X" en un
adaptador driving: el dominio devolveria `{ ok: true }` y la Server Action decidiria el
resto. Eso es exactamente el anti-patron que `CHECKPOINTS.md > Modulos hexagonales` marca
("la logica de negocio esta en `domain/`, no en la Server Action") y que la guardia **no**
detecta. Ademas haria imposible testear la emision de sesion sin montar el runtime de Next.

### 6.2 Descartada — sesion opaca con tabla `sessions` en Postgres

La cookie llevaria un identificador aleatorio y la sesion real viviria en una tabla
(`user_id`, `expires_at`, `revoked_at`, `created_at`), con su migracion, su `down.sql` y su
`FORCE ROW LEVEL SECURITY`. Ventajas reales: revocacion inmediata (cerrar sesion en todos los
dispositivos), inventario de sesiones activas y rotacion de secreto sin echar a nadie.

Se descarta **para QC-7** por tres motivos:

1. **Coste por peticion.** QC-9 valida la sesion en cada navegacion; con tabla, cada
   navegacion es una consulta a Postgres a traves del pooler. El token firmado se verifica
   con un HMAC en memoria.
2. **Alcance.** La description pide "una cookie httpOnly que caduca", no gestion de
   sesiones. Una tabla nueva arrastra migracion, RLS, `down.sql` y politica de purga: es una
   feature, no un detalle.
3. **Lo que se pierde es acotado y reversible.** Sin tabla, el logout de QC-8 borra la cookie
   del navegador —que es lo que la description de QC-8 pide— pero un valor ya firmado que
   alguien hubiera copiado seguiria siendo valido hasta su `exp`. Con 8 horas de vida el
   riesgo esta acotado, y migrar a sesiones opacas mas adelante toca **solo** el adaptador
   `session-cookie.ts` y el lector de QC-8: el dominio y los puertos no se enteran.

**Se deja escrito para QC-8:** el logout borra la cookie, no revoca el token. Si el humano
quiere revocacion real, es la alternativa 6.2 y hay que darla de alta.

### 6.3 Descartada — libreria de JWT (`jose`, `jsonwebtoken`)

Firmar un JSON con HMAC-SHA256 y comparar en tiempo constante son **dos llamadas a
`node:crypto`**, que ya esta en el runtime. `docs/architecture.md > Dependencias de terceros`
manda preferir la libreria antes que reimplementar, pero aqui no se reimplementa un algoritmo
—`createHmac` **es** la implementacion mantenida—: lo unico que ahorraria una libreria de JWT
es el formato de sobre y el manejo de `alg`, que es precisamente la parte con historial de
vulnerabilidades (`alg: none`, confusion HS/RS) y que aqui no existe porque el formato es
fijo y de un solo algoritmo. Añadirla costaria una parada por aprobacion humana y una
dependencia mas en el registro, a cambio de menos codigo del que la propia validacion de
entrada ya nos obliga a escribir.

Es exactamente la leccion inversa de QC-5 (donde implementar scrypt a mano genero el 80% del
codigo): alli lo que se reconstruia a mano era un **esquema completo de almacenamiento de
contrasenas**; aqui es una firma de una linea.

### 6.4 Dependencias: una nueva, `@playwright/test`, ya aprobada

**El codigo de produccion no necesita ninguna dependencia nueva.** `node:crypto` (firma),
`next/headers` (cookie), `@prisma/client` (persistencia del bloqueo), `bcryptjs` (QC-5) y
`zod` cubren todo lo que se ejecuta en runtime.

La unica que entra es de **desarrollo**, para el E2E que `CHECKPOINTS.md` exige en flujos
criticos (la autenticacion lo es) y que hasta ahora se venia difiriendo feature tras feature
(QC-10, QC-11 en `progress/current.md`).

| Paquete | `@playwright/test` v1.62.1 |
| --- | --- |
| Que codigo nos ahorra | Runner E2E completo: arranque y control de navegadores reales (Chromium/WebKit/Firefox), esperas automaticas, aserciones sobre cookies del contexto (`context.cookies()`, que es la unica forma honesta de comprobar `httpOnly` desde fuera), trazas y reintentos. Escribirlo a mano seria reimplementar un runner, justo lo que `docs/architecture.md > Dependencias de terceros` prohibe |
| Check 1 — ¿deprecada? | **No** |
| Check 2 — release < 12 meses | **Si**: ultima publicacion **2026-09-01** |
| Check 3 — >= 10.000 descargas/semana | **Si**: **58,4 M/semana** |
| Check 4 — licencia MIT/Apache-2.0/BSD/ISC | **Si**: **Apache-2.0** |
| Puerta humana | **Aprobada por el humano el 2026-09-01** |

Ademas cubre de paso la regla multiplataforma (`docs/architecture.md > Componentes`): WebKit
es el motor de iOS, y con Playwright ese navegador se puede ejercitar de verdad.

**Instalacion y registro van en el MISMO paso** (`tasks.md > T11`). La guardia
`guard-dependencias-aprobadas` es **bidireccional**: una fila en `docs/dependencias.md` sin el
paquete instalado da rojo igual que un paquete sin fila. Hacerlo en dos commits deja el gate
rojo en medio.

### 6.5 Riesgo aceptado: bloqueo por cuenta (no por IP)

Bloquear por cuenta permite que cualquiera deje fuera a un usuario conocido durante hasta 60
minutos con 5 intentos fallidos. **El humano lo asumio explicitamente el 2026-09-01** (D12):
es un ERP de un solo tenant, con usuarios conocidos y sin registro publico, asi que el
atacante interno ya tiene formas mas baratas de molestar y el externo no conoce los nombres de
usuario.

El limite **por IP** se ofrecio y **se descarto**: es mas trabajo del pedido y, sobre Vercel,
la IP del cliente llega por cabecera (`x-forwarded-for`) — falsificable si el borde no esta
bien configurado, con lo que daria una sensacion de proteccion que no es real. **Aqui no se
implementa** y no se sustituye por nada.

Lo que si acota el daño, y por eso esta en R23 y R25: el bloqueo **caduca solo** (60 min como
techo) y **los intentos durante un bloqueo no lo alargan**, asi que nadie puede mantener una
cuenta bloqueada indefinidamente martilleandola.

---

## 7. Como se prueba el camino feliz sin el seed (QC-6)

QC-6 (`seed-roles-y-usuario-inicial`) esta `pending` y **no es dependencia de esta feature**:
el login no necesita que exista un usuario concreto, necesita que *dado* un usuario, funcione.
Poner QC-7 a esperar a QC-6 seria invertir el orden por comodidad de los tests.

Cuatro niveles, y ninguno mira el seed:

1. **Unit del dominio** (`tests/unit/identity/verify-credentials.test.ts`, entorno `node`).
   Puertos falsos escritos en el test: un `UserCredentialsReader` que devuelve lo que el caso
   pide, un `PasswordHasher` que cuenta llamadas y responde deterministicamente, un
   `LoginAttemptRecorder` que guarda el estado recibido y un `SessionWriter` que guarda el
   ticket. Sin base de datos, sin bcrypt real, sin Next. Aqui se cubre el grueso: R1-R8, R14,
   R17, R24, R25, R27-R29, R31.
   La escalada en si (`nextLockState`, `isLocked`) se testea aparte en
   `tests/unit/identity/account-lock.test.ts`, con `now` inyectado: sin reloj real no hay
   test lento ni intermitente. Cubre R22, R23, R26.
2. **Unit del adaptador de cookie** (`tests/unit/identity/session-cookie.test.ts`). Se mockea
   `next/headers` con `vi.mock` y se afirma sobre los argumentos con los que se llamo a
   `set`: nombre, atributos y valor firmado (que el test **recomputa** con `createHmac`, en
   vez de compararlo con un literal copiado). Cubre R9-R13.
3. **Integracion contra Postgres real**
   (`tests/integration/identity/login.int.test.ts`), unica pieza que necesita datos:
   - `beforeAll`: crea un `Role` y un `User` propios con `username` aleatorio
     (`qc7_login_<uuid>`), `password_hash` producido con el `createPasswordHash` real y
     `document_type_code: 'CC'` — esa fila **ya la inserta la migracion de QC-4**, asi que ni
     de eso depende. El correo y el numero de documento tambien llevan el uuid, para no
     chocar con los indices unicos.
   - los `it` ejercitan el adaptador Prisma real: usuario existente, usuario con
     `deleted_at` puesto, nombre de usuario con otra combinacion de mayusculas.
   - `afterAll`: borra **sus** filas por id (usuario y rol) en un `finally`. Es un fixture de
     test, no una operacion de negocio: el veto al borrado fisico de
     `docs/architecture.md > Anti-patrones` aplica al codigo de produccion, y `tests/**` esta
     exento en la tabla de dependencias.
   - No se usa el patron de transaccion con rollback de
     `identity-constraints.int.test.ts`: aquel escribe y lee **con el mismo `tx`**, y aqui lo
     que se quiere ejercitar es el adaptador real, que usa el cliente `prisma` compartido y
     por tanto **no veria** filas de una transaccion sin confirmar. Es el motivo de commitear
     y limpiar en `afterAll`.

4. **E2E con Playwright** (`e2e/login.spec.ts`), aprobado en 6.4. Ejercita el flujo real en
   navegador contra `next dev`:
   - **camino feliz**: rellenar el formulario con el usuario de prueba y comprobar que la URL
     acaba en `DASHBOARD_ROUTE` y que `context.cookies()` trae `qc_session` con
     `httpOnly: true`. Que `/dashboard` sea todavia un 404 (QC-12 esta `pending`) **no
     invalida el test**: lo que se afirma es el destino y la cookie, no el contenido de la
     pagina. Es la deuda "E2E diferido" de QC-10/QC-11, que aqui se salda.
   - **camino de error**: credenciales malas -> se sigue en `/login`, se ve el mensaje
     generico y **no** hay cookie `qc_session`.
   - el usuario de prueba lo crea y lo borra el mismo fixture de siempre, no el seed (R21).

Cuando QC-6 aterrice, estos tests **no cambian**: depender del seed los volveria a acoplar a
datos que otra feature puede modificar.

Lo que **no** se testea con reloj real: la caducidad del bloqueo (R26) se prueba inyectando un
`now` posterior a `lockedUntil`, nunca con un `sleep` de 60 segundos.

---

## 8. Contratos de entrada/salida

No hay endpoints nuevos. La unica superficie es la Server Action ya existente.

| Superficie | Entrada | Salida |
| --- | --- | --- |
| `loginAction(prevState, formData)` | `FormData` con `username`, `password` | `LoginFormState` (`invalid` \| `error`) o **redireccion** a `DASHBOARD_ROUTE`. Sin cambios (R16) |
| `identity.verifyCredentials(input)` | `LoginInput` | `Promise<{ ok: boolean }>`. Efecto lateral en el exito: cookie emitida. Firma sin cambios |
| `UserCredentialsReader.findActiveByUsername` | `string` normalizado | `{ id, passwordHash, failedAttempts, lockLevel, lockedUntil } \| null` |
| `LoginAttemptRecorder.record` | `userId`, `AccountLockState` | `Promise<void>` |
| `SessionWriter.startSession` | `SessionTicket` | `Promise<void>`; lanza si falta el secreto |

## 9. Datos, RLS y migraciones

**No hay tabla nueva**, pero **si hay migracion**: tres columnas en `users` (5.6), con su
`migration.sql` y su `down.sql` escrito a mano. `users` y `roles` ya tienen RLS con
`FORCE ROW LEVEL SECURITY` desde QC-4 y añadir columnas no lo altera.

La lectura y la escritura del login pasan por Prisma, que se conecta como dueño de las tablas:
la autorizacion real —"solo autentica un usuario no borrado, no bloqueado y con la contrasena
correcta"— se decide en el dominio y tiene su test
(`docs/architecture.md > Acceso a datos y autorizacion`), no en una policy.

Nada de esto es borrado fisico ni toca una tabla transaccional: son contadores de estado que
se sobrescriben. El historico de intentos, si algun dia hace falta, es la pregunta abierta 1.

## 10. Multiplataforma

Feature de backend: no toca `app/` ni `components/`. La regla de
`docs/architecture.md > Componentes > multiplataforma` no aplica. La cookie con
`SameSite=Lax` y `Secure` en produccion es estandar y funciona igual en Safari/WebKit (iOS) y
Chrome Android; no se usa ninguna API de cookies especifica de un navegador. El E2E de 7 se
configura con Chromium y WebKit, que es el motor de iOS.

## 11. ¿El bloqueo deberia ser una ficha aparte del board?

**Recomendacion: NO. Se queda en QC-7.** Se escribe aqui porque el coordinador pidio decidirlo
y decirlo, no darlo por hecho en ninguno de los dos sentidos; la palabra final es del humano.

A favor de sacarlo a ficha propia: casi duplica el trabajo (migracion + `down.sql` + politica
+ puerto + adaptador de escritura + su tanda de tests), sube la complejidad a `high`, y retrasa
a QC-8 y QC-9, que estan bloqueadas por esta.

A favor de dejarlo dentro, que es lo que pesa mas:

1. **Es el mismo camino de codigo, no uno nuevo.** El contador se lee y se escribe *dentro* de
   `verifyCredentials`, entre la lectura del usuario y la verificacion del hash. Partirlo
   obliga a escribir el caso de uso y sus tests **dos veces**: una sin bloqueo y otra
   reescribiendolo entero.
2. **La respuesta uniforme se diseña una vez.** El bloqueo añade un tercer desenlace que
   compite con R2/R3 en contenido y en tiempo (5.5). Retrofitear uniformidad sobre un login ya
   mergeado es exactamente como se cuelan los oraculos: se piensa en el mensaje y se olvida el
   reloj.
3. **Evita una ventana con autenticacion sin freno.** Si se parte, QC-7 se mergea y QC-8/QC-9
   construyen encima de un login sin ningun limite de intentos, con el riesgo vivo hasta que
   la otra ficha se programe.

Si el humano decide partirlo igualmente, el corte esta limpio y sale barato: se llevan
`domain/account-lock.ts`, `ports/login-attempt-recorder.ts`, `recordLoginAttempt`, la migracion
y los requisitos **R22-R31** completos, y en QC-7 quedan los pasos 3bis, 5 y 6 del algoritmo
sin escribir. Nada mas cambia.
