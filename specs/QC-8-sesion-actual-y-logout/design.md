# QC-8 — sesion-actual-y-logout · design

Referencias: `specs/QC-8-sesion-actual-y-logout/requirements.md`,
`specs/QC-7-login-usuario-y-contrasena/design.md` (secciones 1, 5.1, 5.2, 5.4, 5.7 y 6.2),
`docs/architecture.md > Modulos y arquitectura hexagonal`, `docs/checkpoints-proyecto.md > Modulos
hexagonales`, `tests/guards/guard-arquitectura-modulos.test.ts`.

**Esta feature hereda casi todo.** QC-7 congelo el formato del valor, los atributos de la cookie,
la duracion y la funcion de firma, y dejo escrito el corte: **«QC-7 escribe la cookie; QC-8 la lee
y la borra»** (`QC-7 > design.md > 1`). QC-8 no reabre nada de eso: lo consume. Lo que la tabla de
QC-7 asigna a **QC-9** (el `middleware.ts` que corta antes de renderizar) **no entra aqui**.

**Lo que QC-8 NO toca, dicho explicitamente:** el `where` del compare-and-set de
`user-credentials-prisma.ts` (`QC-7 > design.md > 5.7`) **no se modifica ni se lee** en esta
feature. QC-8 no cuenta intentos, no bloquea cuentas y no escribe en `users`: su unica escritura
es retirar una cookie. Se dice porque ese predicado ya tuvo una version que declaraba imposible
un caso que si ocurria, y el siguiente que lo toque debe hacerlo a proposito, no de paso.

---

## 0. Cobertura de las decisiones cerradas

Cada fila de `requirements.md > Decisiones cerradas (no reabrir)`, mapeada a los requisitos que
la ponen a prueba. Sin este mapa, una decision puede quedarse sin test
(`docs/specs.md > Trazabilidad`).

| Decision (fecha · asunto) | Requisitos que la cubren |
| --- | --- |
| 2026-09-02 · cerrar sesion **no** invalida un codigo ya copiado | **R18**, **R20**, **R21** |
| 2026-09-02 · empleado dado de baja / rol cambiado | **R10**, **R11**, **R12**, **R15** |
| 2026-09-02 · que nombre se muestra en la barra | **R13** |
| 2026-09-02 · que hace la zona privada sin sesion valida | **R16**, **R17** |
| 2026-09-02 · lleva prueba en navegador real | ~~**R24**~~ — **diferida a QC-9** el 2026-09-02 (no hay URL privada). Lo verificable sin navegador queda en **R16** y **R20** |
| 2026-09-01 · formato del valor de la cookie (`v1.`, `sub`/`iat`/`exp`, `timingSafeEqual`) | **R3**, **R4**, **R5**, **R6** |
| 2026-09-01 · caducidad de 8 h absolutas sobre el `exp` firmado | **R7**, **R8** |
| 2026-09-01 · atributos y manejo de la cookie (solo el servidor) | **R2**, **R18**, **R22** |
| 2026-08-06 · tipo `SessionUser` congelado | **R1**, **R14** |
| 2026-08-06 · firma de `logoutAction()` congelada | **R19** |
| 2026-09-01 · capas (adaptador driven detras del puerto, cableado en composicion) | **R22**, **R23** |
| 2026-08-06 · identificadores en ingles y `deleted_at` como baja logica | **R11**, **R15** |

Los tres requisitos que no salen de una fila son consecuencia directa del alcance: **R1** (la
firma del puerto tiene que admitir «no hay sesion», que es lo que pide la description), **R9**
(secreto ausente) y **R23** (donde vive la logica).

---

## 1. La frontera, otra vez y en positivo

| Capacidad | Feature | Aqui |
| --- | --- | --- |
| Escribir la cookie al autenticar | QC-7 | **no se toca** (`session-cookie.ts > startSession`) |
| Leer y verificar la cookie en cada peticion | **QC-8** | puerto `SessionReader` + `session-cookie.ts > readSessionClaims` |
| Decidir si una sesion es valida (version, caducidad, usuario activo) | **QC-8** | `domain/` |
| Resolver el `SessionUser` (nombre mostrable y rol actual) | **QC-8** | puerto `SessionUserReader` + adaptador Prisma |
| Retirar la cookie y volver al login | **QC-8** | `session-cookie.ts > clearSession` + `logout-action.ts` |
| Redirigir desde la zona privada al faltar sesion | **QC-8** | `app/(private)/layout.tsx` |
| Cortar antes de renderizar, en `middleware.ts` | QC-9 | **no se toca** |
| Invalidar un valor ya copiado / cerrar en todos los dispositivos | QC-23 | **no se toca** (ver 6.2) |

---

## 2. Forma de la solucion: que es dominio, que es puerto, que es adaptador

`docs/checkpoints-proyecto.md > Modulos hexagonales` avisa de que **un caso de uso que solo delega pasa las
guardias y esta mal**. Por eso el reparto se justifica pieza a pieza, y por eso el logout **no**
tiene caso de uso.

- **Dominio — «que hace valida a una sesion».** Tres decisiones que no dependen de como viaje el
  dato: (a) que forma tiene que tener el contenido firmado para ser interpretable, (b) que una
  sesion caduca en su `exp` y no antes ni despues, (c) que un usuario no activo **no** tiene
  sesion aunque su cookie sea impecable, y (d) como se compone el nombre mostrable. Se pueden
  ejercitar con dos objetos y un `now`, sin Next, sin cookie y sin Postgres (R23).
- **Puertos — «lo que el dominio necesita del mundo».** Dos:
  `SessionReader` (dame el contenido firmado y verificado que haya llegado, o nada) y
  `SessionUserReader` (dame el usuario activo con ese id, o nada).
- **Adaptadores driven — «como viaja».** La cookie (nombre, atributos, base64url, HMAC en tiempo
  constante) y Prisma. Nada de esto sabe que es una sesion valida.
- **Adaptador driving.** `logoutAction`, que ya existe y solo gana el `redirect`.
- **Composicion.** El unico sitio donde se elige quien cumple cada puerto.

**El caso de uso hace trabajo propio, no delega:** `resolveSessionUser` encadena cuatro cortes
—sin contenido, caducado, sin usuario activo, y solo entonces compone el `SessionUser`— y ese
encadenado es la politica. El test que lo cubre monta dos puertos falsos y comprueba que un
`exp` pasado **no** llega a consultar el lector de usuario: si esa logica se hubiera quedado en
el adaptador, ese test no se podria escribir sin cookie.

**El cierre de sesion NO tiene caso de uso, a proposito.** «Borrar la cookie» no tiene ninguna
decision de negocio: un `endSession` en `domain/` que solo llamara al puerto seria exactamente el
caso de uso vacio que `CHECKPOINTS.md` describe. La composicion cablea `endSession` directamente
al adaptador, y el `redirect` vive en el driving, que es donde vive la navegacion.

### 2.1 Algoritmo de `resolveSessionUser(now = new Date())`

1. `claims = await session.readClaims()`. `null` si no hay cookie, si el prefijo no es `v1.`, si
   la firma no casa o si el contenido no valida contra el esquema (R2–R6).
2. Si `claims === null` → **`null`**. No se toca el lector de usuario.
3. Si `isSessionExpired(claims, now)` → **`null`** (R7). Tampoco se toca la base: una sesion
   caducada no justifica una consulta.
4. `record = await users.findActiveById(claims.sub)` (R10).
5. Si `record === null` → **`null`** (R11: no existe, o `deleted_at` con valor).
6. `toSessionUser(record)` → `{ id, username, displayName: buildDisplayName(...), roleName }`
   (R12, R13, R14).

`now` entra como parametro con valor por defecto, igual que en `createSessionTicket` de QC-7: es
lo que hace testeable la caducidad sin reloj falso ni `sleep`.

---

## 3. Archivo por archivo

| Ruta literal | Estado | Que hace |
| --- | --- | --- |
| `lib/modules/identity/domain/session-claims.ts` | **nuevo** | `SESSION_CLAIMS_SCHEMA` (zod), tipo `SessionClaims` (`sub`, `issuedAt`, `expiresAt`), `parseSessionClaims(json)` y `isSessionExpired(claims, now)`. Puro |
| `lib/modules/identity/domain/display-name.ts` | **nuevo** | `buildDisplayName(firstNames, lastNames, username)`: primer nombre + primer apellido (R13). Puro |
| `lib/modules/identity/domain/resolve-session-user.ts` | **nuevo** | `createResolveSessionUser(deps)` con el algoritmo de 2.1. Puro |
| `lib/modules/identity/domain/session-user.ts` | **sin cambios** | Tipo congelado por QC-11 (R14) |
| `lib/modules/identity/ports/session-reader.ts` | **nuevo** | `interface SessionReader { readClaims(): Promise<SessionClaims \| null> }`. **`clear()` se retiro durante la implementacion (2026-09-02, menor 6 del reviewer):** un puerto modela lo que el **dominio** necesita, y el dominio solo lee; el cierre no tiene caso de uso y la composicion lo cablea directo al adaptador, asi que `clear()` quedaba como superficie inalcanzable que ningun test podia ejercitar |
| `lib/modules/identity/ports/session-user-reader.ts` | **nuevo** | `interface SessionUserReader { findActiveById(id: string): Promise<SessionUserRecord \| null> }` |
| `lib/modules/identity/ports/session-provider.ts` | **modificado** | `getSessionUser(): Promise<SessionUser \| null>` (R1). `endSession()` sin cambios |
| `lib/modules/identity/adapters/driven/session/session-cookie.ts` | **modificado** | Añade `readSessionClaims()` y `clearSession()` junto a `startSession()`. Reutiliza `signSessionValue`, `SESSION_COOKIE_NAME`, la version y `readSessionSecret()` que ya viven ahi (R5) |
| `lib/modules/identity/adapters/driven/session/session-stub.ts` | **BORRADO** | Su cabecera dice que la feature de sesion real lo reemplaza. Dejarlo vivo seria una segunda implementacion del puerto que nadie cablea |
| `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts` | **nuevo** | `findActiveSessionUserById` con `prisma.user.findFirst` (ver 4.2) |
| `lib/modules/identity/adapters/driving/logout-action.ts` | **modificado** | Añade `redirect(LOGIN_ROUTE)` despues de `endSession()`. **Firma intacta** (R19) |
| `lib/modules/identity/index.ts` | **modificado** | Reexporta `createResolveSessionUser`, `buildDisplayName`, `isSessionExpired` y el tipo `SessionClaims`. Solo de `./domain` |
| `lib/composition/index.ts` | **modificado** | Ver 4.4 |
| `lib/shared/routes.ts` | **modificado** | Añade `LOGIN_ROUTE = '/login'` (hoy el literal vive suelto en `login-form.tsx` y en `e2e/login.spec.ts`) |
| `app/(private)/layout.tsx` | **modificado** | `const user = await identity.getSessionUser(); if (user === null) redirect(LOGIN_ROUTE);` (R16). Nada mas cambia |
| `components/private/**` | **sin cambios** | La UI ya existe desde QC-11 y recibe por props (R17) |
| `db/schema.prisma`, `db/migrations/**` | **sin cambios** | No hace falta migracion (R15) |
| `package.json`, `docs/dependencias.md` | **sin cambios** | Ninguna dependencia nueva (6.6) |
| `tests/unit/identity/logout-action.test.ts` | **modificado** | Hoy afirma que `logoutAction` **no** navega y que `session-stub.ts` no toca cookies. Las dos cosas mueren aqui. Alcance exacto en `tasks.md > T9` |
| `tests/unit/private-layout.test.tsx` | **modificado** | Hoy afirma que el layout no contiene `redirect` (R35 de QC-11). Lo revoca la decision del 2026-09-02. Alcance exacto en `tasks.md > T10` |
| `e2e/login.spec.ts` | **sin cambios** | Se extiende con un spec propio, no se reescribe |
| ~~`e2e/session.spec.ts`~~ | **NO SE CREA — diferido a QC-9** | Recorrido de R24 (ver 7). El humano difirio la prueba en navegador el 2026-09-02 porque `app/(private)/` no tiene ningun `page.tsx` y Next no renderiza un layout sin pagina: hoy no hay URL que visitar. **QC-9 lo hereda** |

---

## 4. Detalle de las piezas

### 4.1 Lectura y borrado de la cookie (`session-cookie.ts`)

Se **extiende el archivo de QC-7 en vez de crear uno nuevo**, y es deliberado: ahi ya viven el
nombre de la cookie, la version del formato, el minimo del secreto y `signSessionValue()`. Un
segundo archivo tendria que importarlos o —peor— redeclararlos, que es justo lo que QC-7 quiso
evitar exportando la funcion de firma. Un solo dueño del formato del valor.

```ts
export async function readSessionClaims(): Promise<SessionClaims | null>
export async function clearSession(): Promise<void>
```

`readSessionClaims`, en orden y sin atajos:

1. `(await cookies()).get(SESSION_COOKIE_NAME)?.value` → si no hay, `null` (R2).
2. Partir en **tres** por `.`. Si no salen exactamente tres partes, `null`.
3. Si la primera parte no es `SESSION_VALUE_VERSION` (`v1`), `null` (R3). La constante deja de
   ser privada del modulo y se exporta, para que lector y escritor no puedan desincronizarse.
4. `esperada = signSessionValue(\`${version}.${payload}\`, readSessionSecret())` (R5, R9).
5. Comparar `esperada` con la firma recibida con `timingSafeEqual` sobre buffers. **Si las
   longitudes difieren, `timingSafeEqual` lanza**: se compara la longitud antes y se devuelve
   `null`, sin `try` que se trague nada mas (R4).
6. `Buffer.from(payload, 'base64url').toString('utf8')` → `parseSessionClaims(...)` del dominio,
   que devuelve `null` si el JSON no valida (R6). El `JSON.parse` va dentro del dominio, en un
   `try` acotado a esa linea: un payload que no es JSON es entrada invalida, no un fallo.

`clearSession`: `(await cookies()).delete({ name: SESSION_COOKIE_NAME, path: '/' })`. El `path`
se repite a proposito: sin el, el navegador no borra una cookie emitida con `path: '/'` si la
peticion viniera de otra ruta. **No lee el secreto** — de ahi la segunda mitad de R9: un
despliegue mal configurado puede echar a la gente aunque no pueda autenticarla.

**`next/headers` en `driven/`:** ya lo hace `startSession` desde QC-7, la guardia lo permite
(bloque 13 solo prohibe composicion, driving propio y UI) y quedo anotado como pregunta abierta
de QC-7. QC-8 no inventa una regla nueva ni la cambia: sigue el precedente.

**Que `cookies()` sea de solo lectura en un Server Component no es un problema**: el layout solo
**lee** (R16) y `clearSession` solo se llama desde `logoutAction`, que es `'use server'`.

### 4.2 Lectura del usuario (`session-user-prisma.ts`)

```ts
prisma.user.findFirst({
  where: { id, deletedAt: null },
  select: { id: true, username: true, firstNames: true, lastNames: true,
            role: { select: { name: true } } },
})
```

- **API tipada, no `$queryRaw`.** El motivo por el que QC-7 bajo a SQL crudo era el indice
  funcional `lower(username)`; aqui se busca por **clave primaria**, donde no hay ningun indice
  que esquivar y la API tipada da el tipo gratis.
- **`deletedAt: null` va en el `where`, no en un `if` posterior.** Un usuario dado de baja no
  debe salir de la base para la sesion, igual que en QC-7 (R11).
- **`select` explicito y minimo** (R14): ni correo, ni telefono, ni documento, ni
  `password_hash`, ni los contadores de bloqueo. Lo que no sale no se puede registrar por error.
- **`role.name` en el mismo `select`**: un `join` por la FK ya indexada (`users_role_id_idx`),
  no una segunda consulta. Es lo que hace barata la decision «el rol es siempre el actual» (R12).
- `identity` es el dueño declarado de `User` y de `Role` (`/// @module identity`), asi que el
  bloque 10 de la guardia queda verde. Es el segundo archivo del modulo que toca `prisma.user`,
  y eso esta permitido: la guardia mira el **modulo**, no el numero de archivos.
- **`sub` con formato invalido no llega aqui.** `id` es `@db.Uuid`; pasarle texto arbitrario haria
  que Prisma lanzara en vez de devolver `null`. Por eso el esquema del dominio exige que `sub`
  tenga forma de UUID (R6) y corta antes.

### 4.3 El dominio, en detalle

```ts
// domain/session-claims.ts
export type SessionClaims = { readonly sub: string; readonly issuedAt: Date; readonly expiresAt: Date };
export function parseSessionClaims(rawJson: string): SessionClaims | null;
export function isSessionExpired(claims: SessionClaims, now: Date): boolean; // now >= expiresAt

// domain/display-name.ts
export function buildDisplayName(firstNames: string, lastNames: string, username: string): string;
```

- El esquema zod exige `sub` con formato UUID, e `iat`/`exp` enteros positivos. `exp` se
  convierte a `Date` **una vez**, en el borde: el resto del dominio razona con fechas, no con
  epochs (`docs/architecture.md > Principios 2`).
- `isSessionExpired` usa `>=`, no `>`: en el instante exacto del `exp` la sesion ya no vale. Es
  una eleccion arbitraria pero fijada, y su test la ancla.
- `buildDisplayName` toma el primer token de cada campo (`trim().split(/\s+/)`), tolera espacios
  multiples y **cae al `username`** si el resultado quedaria vacio (R13). Sin ese corte, un
  nombre vacio dejaria la barra lateral con un avatar sin iniciales y un hueco, que es un
  comportamiento no definido en vez de uno decidido.
- **Las iniciales no se calculan aqui.** `getInitials()` ya existe en `lib/shared/ui/initials.ts`
  y `nav-user.tsx` ya la llama; el dominio no puede importar `lib/shared/**` y no hace falta que
  lo haga. Lo que R13 exige de las iniciales («AP») se verifica componiendo las dos piezas en el
  test, que si puede importar las dos.

### 4.4 El cambio en `lib/composition/index.ts`

```ts
import { createResolveSessionUser } from '@/lib/modules/identity';
import { findActiveSessionUserById } from '@/lib/modules/identity/adapters/driven/persistence/session-user-prisma';
import { clearSession, readSessionClaims, startSession } from '@/lib/modules/identity/adapters/driven/session/session-cookie';

const sessionReader: SessionReader = { readClaims: readSessionClaims };
const sessionUserReader: SessionUserReader = { findActiveById: findActiveSessionUserById };

const sessionProvider: SessionProvider = {
  getSessionUser: createResolveSessionUser({ session: sessionReader, users: sessionUserReader }),
  endSession: clearSession,
};
```

El import del stub desaparece. `verifyCredentials` y su cableado **no se tocan**: QC-8 no entra
en el camino del login.

### 4.5 Contratos de entrada/salida

No hay endpoints nuevos ni rutas nuevas.

| Superficie | Entrada | Salida |
| --- | --- | --- |
| `identity.getSessionUser()` | — (lee la cookie de la peticion en curso) | `Promise<SessionUser \| null>`. **Cambio de contrato**: antes no admitia `null` |
| `identity.endSession()` | — | `Promise<void>`; retira la cookie |
| `logoutAction()` | — | `Promise<void>`; termina en `redirect(LOGIN_ROUTE)`. Firma congelada (R19) |
| `SessionReader.readClaims` | — | `Promise<SessionClaims \| null>` |
| `SessionUserReader.findActiveById` | `string` (uuid) | `Promise<{ id, username, firstNames, lastNames, roleName } \| null>` |
| `PrivateLayout` | `children` | Arbol privado, **o** redireccion al login (R16) |

**Quien mas rompe el cambio de `SessionUser` a `SessionUser | null`:** solo
`app/(private)/layout.tsx`, que es el unico llamador **de produccion** (lo dice la cabecera del
stub y lo confirma el grep). TypeScript strict lo señala en el sitio exacto.

> **CORREGIDO durante la implementacion (2026-09-02).** La frase original de este parrafo decia
> «no hay llamadores silenciosos», y **era falsa**. El `typecheck` vio **un** sitio; los tests
> vieron **tres**: ademas del layout, `tests/unit/sidebar-desktop.test.tsx` y
> `tests/unit/sidebar-mobile.test.tsx` renderizan `PrivateLayout` y **si** eran llamadores —
> reventaron con `NEXT_REDIRECT` en el gate. **Un test que renderiza el layout es un llamador
> aunque el compilador no lo cante**: no recibe el `SessionUser` como argumento tipado, lo
> obtiene por un mock que TypeScript nunca comprueba.
>
> Consecuencia practica, y **QC-9 vuelve a pasar por este mismo camino**: ante un cambio de
> **contrato compartido**, `vitest related` no basta —selecciona por grafo de imports, y esos
> archivos no importan el puerto, importan el layout—. Hay que correr `ui`+`node` enteros y
> dejar correr el gate antes de dar el bloque por cerrado. Detalle en
> `progress/impl_QC-8-sesion-actual-y-logout.md`.

---

## 5. Datos, RLS y migraciones

**No hay tabla nueva, no hay columna nueva y no hay migracion** (R15). `users` y `roles` ya tienen
RLS con `FORCE ROW LEVEL SECURITY` desde QC-4 y aqui no se altera nada.

La autorizacion real —«solo tiene sesion un usuario **activo** cuyo token esta firmado y no ha
caducado»— se decide en el dominio y tiene su test, no en una policy
(`docs/architecture.md > Acceso a datos y autorizacion`, `docs/checkpoints-proyecto.md > Datos y seguridad`).
Prisma se conecta como dueño de las tablas, asi que una policy no filtraria nada de esto.

Ningun borrado fisico: lo unico que se «borra» es una cookie del navegador.

---

## 6. Alternativas descartadas

### 6.1 Descartada — leer y verificar la cookie en `app/(private)/layout.tsx`

Es lo mas corto: `cookies().get('qc_session')`, un `createHmac`, un `JSON.parse` y una consulta
Prisma, todo en el layout. Se descarta por tres cosas, en orden de gravedad:

1. **Deja la definicion de «sesion valida» en la UI.** Es el anti-patron literal de
   `docs/checkpoints-proyecto.md > Modulos hexagonales` («la logica de negocio esta en `domain/`, no en la
   Server Action»), aqui en su version de layout.
2. **La guardia lo rechaza igualmente**: `app/**` no puede importar el cliente Prisma (bloque 11,
   R17 de QC-15).
3. **QC-9 tendria que copiarlo.** El `middleware.ts` necesita la misma verificacion de firma;
   con la logica en el layout, o se duplica o se extrae luego. Detras de un puerto, QC-9 reutiliza
   lo que ya existe.

### 6.2 Descartada — tabla `sessions` (revocacion real)

Es la alternativa 6.2 de QC-7, y QC-8 **la confirma en vez de reabrirla**: la cookie llevaria un
identificador opaco y la sesion viviria en Postgres, con migracion, `down.sql`, `FORCE ROW LEVEL
SECURITY` y politica de purga. Daria revocacion inmediata, inventario de sesiones y «cerrar sesion
en todos mis dispositivos».

Se descarta aqui por lo mismo que alli, mas un motivo propio de esta ficha: **el humano ya cerro
la decision el 2026-09-02** («cerrar sesion retira la cookie de ese navegador y nada mas») y creo
**QC-23** para hacerlo bien, bloqueada por esta. Lo que se pierde queda escrito y **con test**:
**R21** afirma que un valor copiado sigue valiendo tras el logout. Es un test incomodo a
proposito — el dia que QC-23 aterrice se pondra rojo, y ese rojo es la señal de que la promesa
cambio, no un fallo.

Coste real, dicho sin adornos: entre el cierre de sesion y el `exp`, una copia robada del valor
sigue autenticando. Exige un robo previo (la cookie es `httpOnly`, asi que no basta un XSS de
lectura), esta acotado a 8 h y hay salida de emergencia: dar de baja al usuario (`deleted_at`) o
cambiarle el rol surte efecto en la **siguiente peticion**, porque el usuario se resuelve contra
la base cada vez (R10, R11). Esa es la contrapartida que hace tolerable no tener tabla.

### 6.3 Descartada — meter `displayName` y `roleName` en el payload de la cookie

Ahorraria la consulta por peticion: el layout pintaria la barra lateral sin tocar Postgres. Se
descarta porque contradice de frente la decision del 2026-09-02: un rol revocado o un empleado
dado de baja seguirian dentro hasta que caducara la cookie (8 h), y ademas metria PII en un valor
que viaja en cada peticion, que es justo lo que QC-7 evito en su 5.1. La consulta no es un coste
añadido: **hace falta igual** para saber si el usuario sigue activo.

### 6.4 Descartada — memoizar `getSessionUser` con `cache()` de React ahora

Evitaria una segunda consulta si mañana hubiera dos consumidores en el mismo render. Hoy hay
**uno** (el layout), y el `middleware.ts` de QC-9 corre en Edge, donde no hay Prisma y por tanto
no puede resolver el usuario: lo mas que hara es verificar la cookie firmada. Memoizar un unico
llamador es codigo que ningun test puede poner en rojo. La salida esta escrita en
`requirements.md > Preguntas abiertas 1` y cuesta una linea en la composicion el dia que haga
falta.

### 6.5 Descartada — un modulo propio de verificacion de firma

Tentador por simetria («escribir aqui, leer alla»). Se descarta porque duplicaria la constante de
version, el minimo del secreto y la lectura de `SESSION_SECRET`, y porque QC-7 exporto
`signSessionValue()` **exactamente para que esto no pasara** (`QC-7 > design.md > 5.1`). Un
formato con dos dueños se desincroniza en silencio: el escritor cambia y el lector deja de casar
sin que nada compile en rojo. R5 lo fija como requisito, no como estilo.

### 6.6 Dependencias: **ninguna nueva**

`node:crypto` (`createHmac`, `timingSafeEqual`), `next/headers` (`cookies`), `next/navigation`
(`redirect`), `@prisma/client` y `zod` cubren todo lo que se ejecuta. `@playwright/test` ya esta
instalado y registrado desde QC-7: **el E2E de R24 se añade al proyecto existente, no se vuelve a
montar**.

Se comprobo si alguna libreria ahorraria codigo aqui, como manda
`docs/architecture.md > Dependencias de terceros`, y la respuesta es la misma que dio QC-7 en su
6.3: una libreria de JWT (`jose`) solo aportaria el sobre y el manejo de `alg` —la parte con
historial de vulnerabilidades— sobre un formato que aqui es fijo y de un solo algoritmo, y no se
puede adoptar a medias: verificar con `jose` lo que QC-7 firma con `createHmac` obligaria a
reescribir tambien la emision. Coste (una parada por aprobacion humana, una dependencia mas)
mayor que el beneficio (unas quince lineas).

**No se propone ninguna dependencia, asi que no hay cuatro checks que rellenar ni fila nueva en
`docs/dependencias.md`.**

---

## 7. Como se verifica

Cinco niveles. La trazabilidad `R<n> -> test` la cierra el implementer.

1. **Dominio, sin nada montado** (`tests/unit/identity/session-claims.test.ts`,
   `display-name.test.ts`, `resolve-session-user.test.ts`, entorno `node`). Puertos falsos
   escritos en el test. Cubre R1, R6, R7, R10–R14 y R23. Dos aserciones que importan mas que las
   otras: que un `exp` pasado **no llama** al lector de usuario, y que un usuario con
   `deleted_at` devuelve `null` aunque el token sea impecable.
2. **Adaptador de cookie** (`tests/unit/identity/session-cookie.test.ts`, ampliando el de QC-7).
   `vi.mock('next/headers')`. Cubre R2–R5, R8, R9 y R18. El valor valido del caso feliz se
   **construye llamando a `startSession`** y capturando lo que escribio, no copiando un literal:
   asi el test comprueba de verdad que escritor y lector se entienden. Casos: sin cookie, prefijo
   `v0.`, firma alterada en un byte, firma de longitud distinta, payload que no es JSON, `sub` que
   no es UUID, secreto ausente (lectura lanza / `clearSession` no), y que leer **no** llama a
   `cookieStore.set`.
3. **Integracion contra Postgres** (`tests/integration/identity/session-user.int.test.ts`).
   Ejercita `findActiveSessionUserById` real: usuario activo (devuelve nombre y rol), usuario con
   `deleted_at` (devuelve `null`), id inexistente (`null`), y **el rol cambiado entre dos lecturas
   devuelve el nuevo** (R12). Mismo patron que `login.int.test.ts`: fixture propio con `username`,
   correo, documento y nombre de rol con uuid, y borrado por prefijo en `afterAll` dentro de
   `try`/`finally`. **Obligatorio**: `identity-constraints.int.test.ts` afirma
   `user.count() === 0` sobre el estado global de la tabla, y por eso los tests de integracion
   estan serializados en `vitest.config.mts`. Una fila huerfana pone rojo a otra feature.
4. **Layout privado** (`tests/unit/private-layout.test.tsx`, ampliado). Con `getSessionUser`
   devolviendo `null`, el layout llama a `redirect(LOGIN_ROUTE)` y no pinta la barra (R16); con un
   usuario, lo pide **una sola vez** y lo reparte por props (R17). El `redirect` se mockea desde
   `next/navigation`.
5. **E2E** (`e2e/session.spec.ts`), R24. **Playwright ya esta montado**: se añade un archivo al
   `testDir` existente y se reutilizan `playwright.config.ts` y sus dos proyectos (Chromium y
   WebKit, el motor de iOS). Recorrido: entrar con el usuario del fixture → esperar la URL privada
   → comprobar que `private-user-name` muestra el nombre **real** (el compuesto por R13, no un
   relleno) → abrir el menu y pulsar cerrar sesion → esperar la URL del login → comprobar que ya
   no hay cookie `qc_session` en `context.cookies()` → `page.goBack()` y comprobar que se acaba en
   el login y no en la zona privada (R20).
   - **Datos:** mismo patron que `e2e/login.spec.ts` — prefijo propio (`qc8_e2e_`), `RUN_ID` por
     worker, limpieza defensiva de huerfanos con edad minima y borrado en `afterAll`. No se
     comparte fixture con `login.spec.ts`: los dos proyectos corren a la vez y los prefijos tienen
     que ser distintos para que la limpieza de uno no toque las filas del otro.
   - **Nombre real, no cualquier nombre:** el usuario se crea con `firstNames: 'Ana Maria'` y
     `lastNames: 'Perez Gomez'`, y el test afirma exactamente `Ana Perez` e iniciales `AP`. Con un
     nombre de una sola palabra, R13 seria verde por casualidad.
   - **Precondicion no resuelta:** hoy no existe ninguna URL bajo `app/(private)/`
     (`requirements.md > Preguntas abiertas 3`). Sin esa pagina este spec no se puede ejecutar, y
     `tasks.md > T12` para y pregunta en vez de improvisar una.

Lo que **no** se prueba con reloj real: la caducidad (R7) se ejercita inyectando `now`, nunca
esperando ocho horas ni manipulando el reloj del sistema.

---

## 8. Multiplataforma

Feature de backend. El unico cambio en `app/` es un `redirect` de servidor y no hay ningun
componente nuevo, asi que `docs/architecture.md > Componentes > multiplataforma` no aplica a
codigo nuevo de UI. La cookie ya la valido QC-7 en WebKit; el E2E de R24 corre en los mismos dos
proyectos, asi que el borrado de cookie tambien se ejercita en el motor de iOS —donde el manejo de
cookies `SameSite` es el que mas se aparta de Chromium.
