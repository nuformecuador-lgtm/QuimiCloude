# QC-23 — registro-de-sesiones · design.md

> Modulo propietario: **`identity`**. Zona `backend`. Sin UI (los botones son QC-53 y, el del
> administrador, ninguna ficha todavia — `requirements.md > Preguntas abiertas 2`).
>
> Esta ficha **cierra la deuda que QC-8 y QC-9 dejaron anotadas con nombre y apellido**: QC-8 R21
> («el cierre de sesion NO invalida un valor de cookie ya emitido… la invalidacion real es
> QC-23») y QC-9 R30 («mientras no exista la revocacion de sesiones, el rol firmado es una foto
> del instante de la emision»).

## 0. Mapa: decision cerrada -> requisito

| # | Decision cerrada (2026-09-03) | Requisitos |
| --- | --- | --- |
| 1 | Dos mecanismos, no uno | R1, R2, R3, R7, R8 |
| 2 | El sello NO cambia el formato del token (usa el `iat` que ya viaja) | R2 |
| 3 | El identificador de sesion SI lo cambia: sube de version, rompe las vivas | R3, R4, R5 |
| 4 | Cerrar sesion cierra **solo ese dispositivo** | R7 |
| 5 | «Cerrar todas» las cierra todas, **incluida la actual** | R8 |
| 6 | El administrador no elige dispositivo: lo suyo es **siempre total** | R10 |
| 7 | El usuario **no** ve la lista de sus dispositivos abiertos, y no genera ficha | R17 |
| 8 | Un cambio de rol o una baja cortan al instante y todas | R11, R12 |
| 9 | Permisos: el Administrador sobre otro; cualquiera sobre las suyas. **En el service** | R9, R10 |
| 10 | Si no se puede comprobar la revocacion, **se corta** | R14, R6 |
| 11 | Se comprueba donde ya se resuelve el usuario contra la base; el middleware **no** | R13, R15 |
| 12 | `logoutAction()`: cambia el efecto, no la firma | R16 |
| 13 | Caducidad sin cambios: 8 h absolutas | R18 |
| 14 | Una sola implementacion del HMAC en todo el repositorio | R19 |
| 15 | Modulo `identity`; dominio decide, adaptador driven almacena, cableado en composicion | R20 |
| 16 | Borrado logico donde aplique, con marcas de tiempo | R22 |
| 17 | Idioma de los identificadores de la DB: ingles | R21 |
| 18 | RLS activada **y forzada** | R23 |
| 19 | Migracion `migration.sql` + `down.sql` obligatorio y reversible | R24 |
| 20 | E2E diferido con motivo a QC-53 (deuda con destinatario) | R25 |
| 21 | Libreria nueva: ninguna | R26 |

---

## 1. Son dos mecanismos, y ninguno basta solo

Es la pieza que mas facil se lee mal, asi que va primero y explicita.

### 1.1 Mecanismo (a) — el sello por usuario (`sessions_valid_from`)

Una sola columna en `users`: **el instante desde el que las sesiones de esa persona valen**.
Revocar en bloque es escribir ahi el reloj actual; comprobar es comparar contra el `iat` **que el
token ya lleva firmado** (`lib/modules/identity/domain/session-claims.ts`: `sub`, `iat`, `exp`,
`role`). Verificado al acotar y confirmado al leer el codigo: **no hace falta ningun campo nuevo
en el token, y el formato no cambia por esto** (decision 2, R2).

- **Cubre:** «cerrar todas mis sesiones» (R8) y el cierre total que ejerce el Administrador
  sobre otro (R10). Una escritura, coste constante, sin importar cuantos dispositivos haya.
- **NO cubre:** el cierre de **un** dispositivo. El sello no sabe distinguir dos tokens del
  mismo usuario emitidos con un segundo de diferencia: los mata a los dos o a ninguno. Ese es
  exactamente el caso de la decision 4 —«quien sale en el movil sigue dentro en la oficina»— y
  por eso el sello solo no vale.

### 1.2 Mecanismo (b) — el identificador de sesion (`sid`) y la tabla de cerradas

El contenido firmado gana un `sid` (UUID, uno por emision). Cerrar **esa** sesion es insertar una
fila en `revoked_sessions` con ese `sid`; comprobar es buscarla.

- **Cubre:** el cierre individual (R7), que es el `logoutAction()` de todos los dias.
- **NO cubre:** el cierre total barato. Con solo este mecanismo, «cerrar todas» exigiria conocer
  los `sid` vivos de esa persona — o sea, **registrar las sesiones abiertas**, que es
  precisamente lo que la decision 7 descarta (y lo que obligaria a una lectura mas por peticion,
  justo lo que QC-28 quiere quitar).
- **Coste:** cambia el formato del token, asi que **la version sube y las sesiones vivas se
  rompen** (decision 3, R4). Se acepta con el mismo criterio literal con que ya se acepto en
  QC-9: *«no existen sesiones vivas y si alguna vive la borramos desde el navegador»*.

### 1.3 En una frase

El sello es **por persona y por fecha**; el `sid` es **por dispositivo**. Cada uno resuelve lo
que el otro no puede hacer sin pagar la estructura que la decision 7 rechaza. Por eso son dos y
por eso los dos se evaluan en la misma peticion (R1).

---

## 2. Modelo de datos

### 2.1 `users.sessions_valid_from` (columna nueva, anulable)

```prisma
/// QC-23 (R1, R2): sello de revocacion en bloque. NULL = nunca se ha revocado en bloque.
/// Se compara contra el `iat` FIRMADO del token, que viaja en segundos: por eso el valor se
/// guarda REDONDEADO HACIA ARRIBA al segundo siguiente (ver design.md > 2.3).
sessionsValidFrom DateTime? @map("sessions_valid_from") @db.Timestamptz(6)
```

Anulable a proposito: `NULL` significa «no hay sello», no «sello en el epoch». Un `NOT NULL
DEFAULT now()` haria que el backfill de la migracion revocara todas las sesiones existentes —da
igual hoy, porque no hay ninguna, pero seria una regla escrita para siempre a partir de una
circunstancia de un dia.

No se añade `deleted_at` ni nada mas a `users`.

### 2.2 `revoked_sessions` (tabla nueva)

```prisma
/// Sesiones cerradas UNA A UNA (QC-23, R1, R7). Guarda las CERRADAS, nunca las abiertas
/// (R17, decision cerrada 7): registrar las abiertas obligaria a una escritura por login y a
/// una lectura por peticion, y es lo que QC-28 quiere quitar.
///
/// NO lleva `deleted_at` a proposito (R22, mismo criterio que `Role`, `Presentation` y `Unit`):
/// una revocacion es un HECHO y no se deshace. «Des-revocar» no es una operacion del modulo.
///
/// `expires_at` es el `exp` del token revocado. No se usa para decidir nada hoy: existe para
/// que la purga de la pregunta abierta 1 sea posible sin otra migracion (R22).
/// @module identity
model RevokedSession {
  id        String   @id @db.Uuid                                  // el `sid` del token
  userId    String   @map("user_id") @db.Uuid
  expiresAt DateTime @map("expires_at") @db.Timestamptz(6)
  revokedAt DateTime @default(now()) @map("revoked_at") @db.Timestamptz(6)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([userId], map: "revoked_sessions_user_id_idx")
  @@map("revoked_sessions")
}
```

- **La PK es el propio `sid`**, no un uuid generado por la base: la busqueda del camino caliente
  (`WHERE id = $sid`) usa el indice primario y no hace falta ningun indice extra.
- **`user_id` es una FK REAL a `users` escrita A MANO en el `migration.sql`, sin `@relation`
  en Prisma.** Mismo criterio que `products.created_by`, `recipes.created_by` y `orders.*`
  (`db/schema.prisma`): la base garantiza la integridad y el cliente Prisma no puede atravesar
  con un `include`. Aqui las dos tablas son **del mismo modulo**, asi que el cruce no romperia
  ninguna regla; se hace igual por consistencia con el resto del esquema y para no obligar a
  declarar `revokedSessions RevokedSession[]` dentro de `User`. `ON DELETE RESTRICT ON UPDATE
  CASCADE`, como el resto del repo. **Es DRIFT para Prisma**: toda migracion futura de
  `revoked_sessions` hay que revisarla a mano para que no la borre.
- **Idempotencia:** insertar con `ON CONFLICT ("id") DO NOTHING`. Cerrar dos veces la misma
  sesion —doble clic, reintento— no puede fallar ni duplicar (`docs/architecture.md >
  Principios 3`).
- **RLS (R23):** `ENABLE` + `FORCE ROW LEVEL SECURITY`, **sin policies**: deny-by-default para
  cualquier via que no sea Prisma. Defensa en profundidad; la autorizacion real esta en el
  service (R10).

### 2.3 El detalle del segundo — por que el sello se redondea hacia arriba

`iat` viaja **en segundos** (`toEpochSeconds`, decision cerrada de QC-7 que este modulo no puede
reinterpretar), y el sello es un `timestamptz` con microsegundos. Un token emitido en **el mismo
segundo** que la revocacion es indistinguible de uno emitido justo antes.

Las dos salidas:

- **Truncar el sello hacia abajo** (`date_trunc('second', now())`) y comparar `iat < sello`: una
  sesion nacida hasta 1 s antes de la revocacion **sobrevive**. Falla **abierta**. Descartada:
  contradice la decision 10.
- **Redondear hacia arriba al segundo siguiente** (`ceil`) y comparar `iat < sello`: no
  sobrevive ninguna sesion anterior. Falla **cerrada**. **Elegida.**

Consecuencia que se escribe en vez de disimularse: quien usa «cerrar todas» y vuelve a entrar
**dentro del mismo segundo** puede encontrarse con que su sesion nueva tambien nace revocada y
tiene que entrar otra vez. Ventana maxima: 1 s, y el recorrido real intercala una redireccion al
login y un formulario. Se cubre con un test de reloj fijo, no se deja al azar.

### 2.4 Migracion (R24)

`db/migrations/<ts>_session_revocation/`

- **`migration.sql` (UP):** `ALTER TABLE "users" ADD COLUMN "sessions_valid_from"` ·
  `CREATE TABLE "revoked_sessions"` · su indice `revoked_sessions_user_id_idx` · la FK a mano
  `revoked_sessions_user_id_fkey` · `ENABLE`/`FORCE ROW LEVEL SECURITY` sobre
  `revoked_sessions`. **No** hay `INSERT` de arranque, asi que no aplica la trampa de QC-32 (un
  `INSERT` despues del `FORCE` no inserta nada) — se anota igual para quien copie este archivo.
  Revisar a mano el SQL generado por Prisma para que el drift no borre las FK, CHECK y RLS de
  QC-4/QC-14/QC-20/QC-24/QC-32/QC-33.
- **`down.sql` (DOWN):** en orden inverso — `DROP TABLE "revoked_sessions"` (se lleva su indice,
  su FK y su RLS) y `ALTER TABLE "users" DROP COLUMN "sessions_valid_from"`. `pgcrypto` **no**
  se toca (no la crea esta migracion). El resultado es el esquema **exacto** anterior: la columna
  se añadia al final de `users` y desaparece del final, asi que aqui **no** hay el limite de
  posicion ordinal que anoto QC-32.
- Se aplica con `pnpm run db:migrate:create` → `down.sql` a mano → `pnpm run db:migrate`, y se
  comprueba con `pnpm run db:rollback` (`docs/architecture.md > Migraciones up/down`).

---

## 3. Formato del token: `v2` -> `v3`

`lib/modules/identity/adapters/driven/session/session-token.ts` es el **unico dueño** del formato
y de la firma (QC-9 R14, y `tests/guards/guard-firma-sesion-unica.test.ts` lo hace cumplir en
todo el repo, raiz incluida). Esta ficha toca ese archivo y **no crea ningun segundo codec**
(R19).

| | Hoy (`v2`) | Con QC-23 (`v3`) |
| --- | --- | --- |
| Valor | `v2.<payload-b64url>.<hmac-b64url>` | `v3.<payload-b64url>.<hmac-b64url>` |
| Payload | `{ sub, iat, exp, role }` | `{ sub, iat, exp, role, sid }` |
| Algoritmo, clave, codificacion | HMAC-SHA-256 / bytes UTF-8 del secreto / base64url sin relleno | **identicos** |

- `SESSION_VALUE_VERSION` pasa a `'v3'`. `verifySessionValue` ya corta por version **antes** de
  verificar la firma, asi que R4 sale del camino que ya existe: un `v2` se descarta sin tocar el
  HMAC y sin interpretarse.
- `SESSION_CLAIMS_SCHEMA` (dominio) gana `sid: z.string().uuid()`. Ausente, vacio o mal formado
  -> `parseSessionClaims` devuelve `null` -> «sin sesion», sin consultar la base (R5). Es el
  mismo trato que QC-9 le dio a `role`.
- `SessionClaims` gana `sessionId: string`; `SessionTicket` gana `sessionId: string`.
- **Quien genera el `sid`.** No lo inventa el dominio: entra por un puerto nuevo
  `SessionIdGenerator { next(): string }`, cableado en `lib/composition/index.ts` a un adaptador
  driven de una linea sobre `crypto.randomUUID()` (global de plataforma, valido en Node y en el
  borde — **no es una dependencia**, R26). Asi `createSessionTicket` sigue siendo puro y
  determinista en tests, que es lo que QC-7 buscaba al pasarle `now` por parametro.
  `createVerifyCredentials` gana `ids: SessionIdGenerator` en sus deps: es un cambio visible de
  `VerifyCredentialsDeps`, exportado por el contrato, y se anota aqui a proposito.

**Lo que se rompe, dicho en voz alta:** toda cookie `v2` viva deja de valer en cuanto se
despliega. Es la decision 3, con el precedente y la frase del humano de QC-9.

---

## 4. Donde se comprueba, y que pasa si la base no responde

### 4.1 El punto exacto

`lib/modules/identity/domain/resolve-session-user.ts` — el caso de uso que **ya** resuelve el
usuario contra la base **en cada peticion** (QC-8 D2 y R10). No hay ningun sitio nuevo, y el
middleware **no gana ninguna lectura** (decision 11, R15; QC-9 ya decidio que no es la frontera).

Orden de cortes, que **es** la politica (R13):

| # | Corte | ¿Toca la base? |
| --- | --- | --- |
| 1 | `readClaims()` devuelve `null` (sin cookie, version vieja, firma mala, payload invalido, `sid` invalido) | no |
| 2 | `exp` firmado ya paso | no |
| 3 | `findActiveById(sub)` devuelve `null` (no existe o `deleted_at`) → R12 | si |
| 4 | `record.roleName !== claims.roleName` → R11 | (misma lectura) |
| 5 | `sessionsValidFrom !== null && issuedAt < sessionsValidFrom` → R2 | (misma lectura) |
| 6 | `revocations.isRevoked(claims.sessionId)` → R7 | si (2.ª lectura) |
| 7 | cualquier fallo en 3–6 | → «sin sesion» (R14) |

Los pasos 4 y 5 **no cuestan una consulta**: `SessionUserRecord` (el puerto
`SessionUserReader`) gana `sessionsValidFrom: Date | null` y la lectura de `users` ya traia
`roleName`. El unico coste nuevo por peticion es el paso 6: **una lectura por PK** en
`revoked_sessions`.

**R11 sin operacion de cambio de rol.** Hoy **no existe en el repo ninguna operacion que cambie
el rol de un usuario** (no hay pantalla de administracion de usuarios — pregunta abierta 2). Por
eso la garantia no se implementa como «quien cambie el rol que se acuerde de sellar», sino como
**comparacion**: el rol actual contra el rol firmado, en cada peticion. No depende de que nadie
recuerde nada, se puede testear hoy con un usuario y un token, y sigue valiendo el dia que exista
esa pantalla. El sellado en bloque queda ademas disponible para quien quiera cortar tambien la
navegacion del borde.

### 4.2 Fallar cerrado (decision 10, R14)

`isRevoked` **puede lanzar** (base caida, pool agotado, timeout). El caso de uso envuelve los
pasos 3–6 y traduce **cualquier** fallo a «sin sesion». No es un `catch` vacio
(`docs/conventions.md > Manejo de errores`): quien **registra** el fallo con contexto —operacion
e identificador, nunca el secreto ni PII— es el adaptador driven, que loguea y relanza; el
dominio solo decide que ante lo desconocido no hay sesion.

La consecuencia se escribe entera: **si la base no responde, nadie tiene sesion** y todo el mundo
acaba en el login. Es lo que la decision 10 pide con todas sus letras —«una revocacion que se
puede saltar provocando un fallo no es una revocacion»— y el precio es que un incidente de base
deja de ser «paginas vacias» para ser «todo el mundo fuera». Se acepta a conciencia.

### 4.3 La tension con QC-28, anotada donde se ve

**QC-28 (`cache-de-sesion-en-redis`) exigira lo contrario para su cache: fallar ABIERTO y caer a
la base.** Una cache que corta el acceso cuando se cae es peor que no tener cache.

Las dos reglas conviven solo si se entiende que **no dicen lo mismo sobre la misma cosa**:

| | Fallo de la **cache** (QC-28) | Fallo del **estado de revocacion** (QC-23, R14) |
| --- | --- | --- |
| Que se pierde | una **copia** de un dato que esta en la base | el dato que dice si la sesion sigue valiendo |
| Salida correcta | ir a la base (**abierto**) | tratar la sesion como invalida (**cerrado**) |

De ahi la consecuencia que esta ficha deja escrita para la siguiente: **el estado de revocacion
no puede vivir SOLO en la memoria rapida**. Si QC-28 cachea el resultado de la comprobacion,
tiene que poder recomputarlo contra la base cuando la cache no responde; si algun dia se pensara
en escribir la revocacion **solo** en Redis, R6 y R14 lo prohiben —perder Redis seria resucitar
sesiones cerradas, en silencio—. Ademas, una revocacion cacheada tiene un techo de obsolescencia
que QC-28 tendra que fijar y justificar: cachear 30 s significa que un cierre tarda hasta 30 s en
surtir efecto, y eso es una decision de producto, no de infraestructura. **No se decide aqui**;
se deja anotado porque es la razon de ser de la decision 10.

---

## 5. Las operaciones y el contrato publico (R17)

Tres, ni una mas. **No hay listado de sesiones abiertas** (decision 7).

### 5.1 Cerrar la sesion en curso — `logoutAction()`

**Firma congelada, efecto nuevo** (decision 12, R16). El adaptador driving
`lib/modules/identity/adapters/driving/logout-action.ts` **no cambia ni una linea**: sigue siendo

```ts
export async function logoutAction(): Promise<void> {
  await identity.endSession();
  redirect(LOGIN_ROUTE);
}
```

Lo que cambia es **a que esta cableado `endSession`** en `lib/composition/index.ts`: al caso de
uso nuevo `createEndSession({ session, revocations, cookies })`, que

1. lee los claims en curso (`SessionReader.readClaims()`);
2. si los hay, registra `{ sid, userId, expiresAt }` en `revoked_sessions` (idempotente);
3. retira la cookie (`clearSession`), **tambien si el paso 2 fallo**;
4. si el paso 2 fallo, **propaga** el error tras retirar la cookie (R7): no se afirma un cierre
   que no ocurrio. La persona ve el fallo y puede reintentar; lo que no pasa es que el sistema
   diga «cerrado» mientras el token sigue vivo.

El contrato del puerto `SessionProvider.endSession(): Promise<void>` **no cambia**.

### 5.2 Cerrar todas las mias — operacion nueva

- **Caso de uso** (dominio): `createRevokeAllOwnSessions({ session, revocations, cookies })`.
  Lee los claims, escribe el sello del **propio** `sub` con `ceilToNextSecond(now)`, retira la
  cookie. Sin parametros de entrada mas alla del reloj: el objetivo **es** el usuario de la
  sesion en curso, y no se acepta un identificador por parametro —seria una via para cerrar las
  de otro sin pasar por R10—.
- **Adaptador driving:** `logout-all-sessions-action.ts`, `'use server'`, **sin parametros y sin
  valor de retorno**, terminando en `redirect(LOGIN_ROUTE)`. Misma forma que `logoutAction()`
  porque hace lo mismo desde fuera: sale al login (R8). **El boton es QC-53**; aqui se entrega la
  accion, no la pantalla.

### 5.3 Cerrar todas las de otro — operacion nueva, solo Administrador

- **Caso de uso** (dominio): `createRevokeAllSessionsOfUser({ revocations })`, con firma
  `(actor: { id, roleName }, targetUserId: string, now?: Date) => Promise<void>`.
- **El actor entra por parametro**, no se resuelve en `lib/composition`: mismo criterio que
  `inventario`, `recetas`, `proveedores` (`lib/composition/index.ts` lo dice explicitamente).
- **Sin adaptador driving.** Es deliberado y es la pregunta abierta 2: no existe pantalla de
  administracion de usuarios ni ficha que la cree, asi que una Server Action sin llamador seria
  una puerta de entrada al sistema que nadie puede probar en un recorrido real. La capacidad
  queda **implementada, cableada en `lib/composition` y cubierta por tests de service**, y sin
  forma de invocarse desde la interfaz.

---

## 6. Permisos: en el service, con test (decision 9, R9, R10)

`lib/modules/identity/domain/errors.ts` (nuevo): `IdentityError` base + `UnauthorizedError`, misma
forma que `lib/modules/inventario/domain/errors.ts` (`code: 'unauthorized'`, `name` del
constructor, `setPrototypeOf`). No se importa el de `inventario`: seria una ruta profunda a otro
modulo, prohibida por `docs/architecture.md > La regla de dependencias`.

`revokeAllSessionsOfUser` empieza, **antes de tocar ningun puerto**, por:

```
if (actor?.roleName !== ROLE_ADMINISTRADOR) throw new UnauthorizedError();   // R10
if (actor.id === targetUserId)              throw new UnauthorizedError();   // R10
```

- Comparacion de **igualdad exacta** con `ROLE_ADMINISTRADOR` (`domain/roles.ts`, el unico sitio
  del repo que escribe ese literal): sin `includes` ni normalizacion, para que un rol llamado
  «Administradores externos» no se cuele.
- El segundo corte no es cosmetico: obliga al administrador a usar 5.2 para lo suyo, y deja la
  operacion «sobre otro» con un unico significado.
- **El middleware no participa**: QC-9 ya decidio que no es la frontera y esta ficha no lo
  reabre. Ninguna regla ruta→rol se añade. RLS forzada tampoco cuenta como este permiso
  (`CHECKPOINTS.md > Datos y seguridad`).

---

## 7. Capas, puertos y cableado (R20)

```
lib/modules/identity/
  domain/
    session-claims.ts          (M) `sid` en el esquema y en `SessionClaims`
    session.ts                 (M) `sessionId` en `SessionTicket` y `createSessionTicket`
    session-revocation.ts      (N) puro: isRevokedByStamp(), ceilToNextSecond()
    resolve-session-user.ts    (M) los cortes 4, 5, 6 y el fallo cerrado
    end-session.ts             (N) caso de uso: cerrar la sesion en curso
    revoke-sessions.ts         (N) casos de uso: todas las mias / todas las de otro
    errors.ts                  (N) UnauthorizedError del modulo
    verify-credentials.ts      (M) pide un `sid` al generador
  ports/
    session-revocation-reader.ts  (N) isRevoked(sessionId): Promise<boolean>
    session-revocation-writer.ts  (N) revokeSession(...), stampUserSessions(...)
    session-id-generator.ts       (N) next(): string
    session-user-reader.ts        (M) `SessionUserRecord.sessionsValidFrom`
  adapters/driven/
    persistence/session-revocation-prisma.ts  (N) unico sitio con `prisma.revokedSession`
    persistence/session-user-prisma.ts        (M) select + `sessions_valid_from`
    session/session-id-crypto.ts              (N) crypto.randomUUID()
    session/session-token.ts                  (M) v3 y `sid` en el payload
  adapters/driving/
    logout-action.ts              (=) NO cambia
    logout-all-sessions-action.ts (N) 'use server', sin parametros, redirige al login
lib/composition/index.ts          (M) cablea los puertos nuevos y reapunta `endSession`
lib/composition/edge.ts           (=) NO cambia: el borde no lee revocacion (R15)
```

- El dominio decide **que** invalida una sesion; el adaptador driven sabe **donde** esta escrito.
  Los tres puertos nuevos se cablean **solo** en `lib/composition/index.ts`.
- `prisma.revokedSession` **solo** puede aparecer en el driven de `identity`
  (`guard-arquitectura-modulos`, via `/// @module identity` en el esquema).
- `lib/composition/edge.ts` no se toca: si esta ficha metiera ahi la lectura de revocacion,
  arrastraria Prisma al bundle del borde y `guard-middleware-edge` pondria el gate en rojo. Es la
  guardia que hace cumplir R15 sola.

---

## 8. Alternativas descartadas

### 8.1 Un solo mecanismo: tabla de **sesiones activas** («allow-list»)

Registrar cada login en una tabla `sessions` y validar cada peticion contra ella; cerrar una es
borrar su fila, cerrar todas es borrar las del usuario. **Es la solucion de libro y resuelve los
dos casos con una sola estructura.**

**Descartada** porque:
1. Obliga a **conocer las sesiones abiertas**, que es exactamente lo que la decision 7 rechaza —y
   ademas regalaria la lista de dispositivos que se descarto a proposito.
2. Una **escritura por login** y una **lectura por peticion** que solo puede fallar cerrada:
   trabajo que QC-28 esta pensada para quitar, no para añadir.
3. Convierte la sesion en estado de servidor. Todo el diseño de QC-7/QC-8/QC-9 es un token
   firmado y autocontenido; cambiarlo por una tabla de sesiones es una decision de arquitectura
   de otro tamaño, y el humano ya cerro la contraria (decision 1).

Lo que se pierde al descartarla: no se puede saber **cuantas** sesiones hay abiertas ni desde
donde. Se asume; es lo mismo que dice la decision 7.

### 8.2 Solo el sello, y que «cerrar sesion» cierre todo

Cero cambios de formato, cero tabla nueva, una columna. **Fue la propuesta inicial al acotar** y
el humano la aparto a proposito: mezcla la comodidad del usuario (salir del movil) con la accion
de seguridad (cortar todo). Decision 4, no se reabre.

### 8.3 Lista negra de tokens completos, en vez de `sid`

Guardar el valor de la cookie (o su hash) en vez de un identificador dentro del token: no
cambiaria el formato ni la version. **Descartado**: obliga a guardar material de sesion en la
base —un secreto con 8 h de vida—, la clave seria de 200+ caracteres en vez de un UUID, y el
`logoutAction` tendria que acceder al **valor crudo** de la cookie, que hoy solo ve el codec.
Guardar solo un hash lo arregla a medias y añade una segunda cosa que hashear al repo, con la
regla de «una sola implementacion» encima.

### 8.4 Comprobar la revocacion en el middleware

Cortaria antes y ahorraria render. **Imposible y ademas prohibido**: el borde no tiene cliente
Prisma (QC-9 R4, R15) y `guard-middleware-edge` lo veta; y QC-9 ya decidio que el middleware no
es la frontera. La comprobacion va donde ya se toca la base (decision 11).

### 8.5 Cambio de rol: sellar desde la operacion que cambia el rol

Que quien edite el rol de un usuario escriba tambien el sello. **Descartado hoy**: no existe
ninguna operacion asi en el repo, seria codigo que nadie ejercita (y por tanto un test verde por
construccion), y la garantia dependeria de que cada escritor futuro se acuerde. La comparacion
rol-firmado / rol-actual (4.1) no depende de la memoria de nadie. Cuando exista la pantalla de
usuarios, puede añadir el sellado **ademas**, para cortar tambien el paso por el middleware.

---

## 9. Dependencias de terceros

**Ninguna nueva** (decision 21, R26). Todo lo que hace falta ya esta: Prisma, zod, WebCrypto y
`crypto.randomUUID()` (global de plataforma en Node y en el borde, no un paquete). No hay
propuesta que abrir bajo `docs/architecture.md > Dependencias de terceros`, y por tanto no hay
fila nueva en `docs/dependencias.md` ni aprobacion humana que pedir mas alla de la del spec.

---

## 10. Verificacion (`docs/verification.md`, `CHECKPOINTS.md`)

- **Unitarios de dominio** (sin cookie, sin Next, sin base): los seis cortes de 4.1, el
  redondeo del sello (2.3), los dos rechazos de permiso (R10), el fallo cerrado (R14) con un
  puerto que lanza, y `parseSessionClaims` con `sid` ausente/vacio/mal formado (R5).
- **Unitarios de codec:** `v3` se emite y se verifica; un valor `v2` se rechaza **sin** llamar a
  la firma (R4); dos emisiones no comparten `sid` (R3).
- **Unitarios de esquema/migracion** (estilo `tests/unit/**/schema/*-migration.test.ts`): la
  tabla lleva `ENABLE` **y** `FORCE ROW LEVEL SECURITY` (R23), los identificadores estan en
  ingles (R21), `created_at`/`updated_at`/`expires_at` existen (R22), y el `down.sql` revierte
  exactamente el UP (R24).
- **Integracion:** cerrar una sesion no toca la otra (R7); «cerrar todas» tumba las dos (R8);
  cambio de rol y `deleted_at` cortan en la peticion siguiente (R11, R12); el `ON CONFLICT` hace
  idempotente el doble cierre.
- **Guardias ya existentes** que cubren requisitos sin escribir nada nuevo:
  `guard-firma-sesion-unica` (R19), `guard-arquitectura-modulos` (R20),
  `guard-middleware-edge` (R15), `guard-dependencias-aprobadas` (R26).
- **QC-9 R30 (R11).** Su test de caracterizacion afirma hoy lo contrario de lo que esta ficha
  implementa. **Se sustituye, no se borra**: el test nuevo cita R30 y explica que la deuda quedo
  cerrada aqui, y la fila de QC-9 se deja como esta (una decision cerrada de otra ficha no se
  reescribe desde esta).
- **E2E: diferido a QC-53** con motivo (R25). Aqui no hay pantalla que visitar; el recorrido
  necesita dos contextos de navegador y el boton que trae QC-53. **Deuda con destinatario**, no
  exencion: `CHECKPOINTS.md` pide E2E para autenticacion. Mismo criterio con el que QC-8 difirio
  su prueba en navegador a QC-9.

## 11. Limites conocidos

1. **+1 lectura por peticion** en la zona privada (la de `revoked_sessions`). Es el precio de la
   decision 1 y el objetivo declarado de QC-28.
2. **Si la base no responde, nadie tiene sesion** (4.2). Decision 10, asumida.
3. **Ventana de 1 s** al reentrar inmediatamente despues de «cerrar todas» (2.3).
4. **Las cookies `v2` vivas se rompen** al desplegar (3).
5. **La capacidad del administrador no tiene por donde invocarse** hasta que exista pantalla de
   administracion de usuarios (pregunta abierta 2).
6. **`revoked_sessions` crece sin limite** mientras no se decida la purga (pregunta abierta 1).
   No rompe nada: una fila caducada nunca cambia una decision, porque el token ya no vale por
   `exp`.
