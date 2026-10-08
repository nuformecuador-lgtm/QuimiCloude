# QC-9 — proteccion-de-rutas-privadas · design.md

> Requisitos en `requirements.md`. Las decisiones cerradas las fijo el humano el 2026-09-02 y **este
> documento no las reabre**: las traduce a piezas.
>
> **Revision del 2026-09-02 (segunda tanda).** El humano cerro la pregunta abierta 1: **el rol viaja
> dentro de la cookie**. Eso **deroga D3** —el formato del token cambia y sube de version— y anula la
> compatibilidad hacia atras. Secciones afectadas: 0, 3.1, 3.3, la nueva 3.6, 4.1, 4.3, 6, 10 y 13.
> Lo que **no** cambia: la parte criptografica de la migracion y su oraculo (3.2 y 3.3).

## 0. Mapa: decision cerrada -> requisito

| # | Decision (fila de `requirements.md`) | Requisitos |
| --- | --- | --- |
| D1 | La firma migra a WebCrypto y el middleware valida de verdad | R3, R15 |
| D2 | Una sola implementacion del HMAC en todo el repositorio | R14 |
| D3 | ~~La migracion no cambia el formato del token~~ **DEROGADA** (D16) | — (lo que sobrevive es la parte criptografica: R16, R17) |
| D4 | Se protege por convencion todo lo que cuelga de `app/(private)/` | R1 |
| D5 | Se vuelve a la ruta pedida tras entrar | R7, R8 |
| D6 | La ruta de vuelta se valida como interna | R9 |
| D7 | Sin acceso a esa ruta -> dashboard, no login | R13 |
| D8 | El middleware comprueba ese permiso; el gancho se construye ya | R12 |
| D9 | Login con sesion valida -> dashboard; publico sin sesion | R10, R11 |
| D10 | Frontera con QC-13: QC-9 es el portero, QC-13 la costura de UI | R6, R8 |
| D11 | Ampliar las guardias a los `.ts` de primer nivel ANTES del middleware | R19 |
| D12 | `docs/architecture.md > Permisos y autenticacion` deja de ser cierto | R23 |
| D13 | Modulo propietario: `identity`; la logica no vive en el archivo de Next | R20, R21 |
| D14 | Libreria nueva: ninguna | R25 |
| D15 | El rol viaja **dentro** de la cookie; el borde no consulta la base | R26, R12 |
| D16 | La version del valor sube y la anterior **se rechaza**; sin compatibilidad | R27, R28 |
| D17 | Un cambio de rol corta la sesion **al instante — en QC-23**; hoy es una foto | R30 |
| D18 | El rol en la cookie **no** convierte al middleware en la frontera de seguridad | R29 |

Requisitos que no salen de una fila pero cierran el alcance: R2 (cortar antes de renderizar), R4
(el borde no toca la base), R5 (no reemitir cookie), R18 (fallo cerrado sin secreto), R22 (assets
fuera), R24 (E2E heredado de QC-8).

## 1. Datos

**Ninguno.** Esta feature no añade tablas, columnas, indices, policies de RLS ni migraciones: la
sesion ya viaja firmada en la cookie (QC-7/QC-8) y el middleware no consulta la base (R4). No hay
`down.sql` que escribir. Se dice explicitamente porque `docs/checkpoints-proyecto.md > Datos y seguridad` se
revisa fila a fila: aqui todas esas filas quedan **no aplica**.

Tampoco hay variables de entorno nuevas: se reutiliza `SESSION_SECRET`, ya declarada por QC-7.

## 2. Las piezas y por que estan donde estan

```
middleware.ts                                   [RAIZ] delega + matcher. Sin logica (R20).
lib/composition/edge.ts                         [COMPOSICION] cableado edge-safe (R21).
lib/composition/index.ts                        [COMPOSICION] sin cambios de comportamiento.
lib/modules/identity/
  index.ts                                      + reexporta la decision de acceso (solo domain).
  domain/route-access.ts                        [DOMINIO] la decision: allow | redirect.
  domain/return-path.ts                         [DOMINIO] ¿este destino de vuelta es interno?
  domain/route-role-rules.ts                    [DOMINIO] tipo de regla + conjunto VACIO (R12).
  domain/session-claims.ts                      [DOMINIO] +`roleName` en el contenido firmado (3.6).
  domain/session.ts                             [DOMINIO] `SessionTicket` +`roleName` (3.6).
  domain/verify-credentials.ts                  [DOMINIO] pasa el rol al ticket (3.6).
  ports/user-credentials-reader.ts              [PUERTO] `AuthenticatableUser` +`roleName`.
  adapters/driven/persistence/user-credentials-prisma.ts  [DRIVEN] +`role: { select: { name } }`.
  ports/session-token-verifier.ts               [PUERTO] valor crudo de cookie -> claims | null.
  adapters/driven/session/session-token.ts      [DRIVEN] UNICO dueño del HMAC. WebCrypto.
  adapters/driven/session/session-cookie.ts     [DRIVEN] I/O de cookie (`next/headers`). Adelgaza.
  adapters/driving/route-guard-middleware.ts    [DRIVING] traduce Request/Response <-> decision.
  adapters/driving/login-action.ts              [DRIVING] honra el destino de vuelta (R8).
lib/shared/routes.ts                            + PRIVATE_ROUTE_PREFIXES, RETURN_PARAM.
app/(public)/login/page.tsx                     + lee `next` y lo pasa al formulario.
app/(public)/login/components/login-form.tsx    + un input oculto `next`. Sin cambio visual.
```

**El archivo de Next es un cascaron.** `middleware.ts` en la raiz existe porque Next lo exige ahi;
no es donde vive la feature. Contiene dos cosas: el reexport del handler y el `matcher`.

```ts
// middleware.ts
export { middleware } from '@/lib/modules/identity/adapters/driving/route-guard-middleware';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
```

El `matcher` es un literal y no una constante importada **a proposito**: Next exige que sea
estaticamente analizable en el bundle, no puede resolver una constante en tiempo de build. Es la
unica duplicacion que esta feature acepta en la raiz, y R22 le pone test.

**Por que el middleware es un adaptador driving y no «el sitio donde se programa esto»:** es el
borde del framework. Recibe una `NextRequest`, pregunta al dominio que hacer y traduce la respuesta
a `NextResponse`. Ni decide que es privado, ni compone la URL de vuelta, ni valida nada. Eso es
`docs/checkpoints-proyecto.md > Modulos hexagonales` («la logica de negocio esta en `domain/`, no en la Server
Action» — aqui, no en el middleware), y es lo que hace que R7, R9, R10, R12 y R13 se testeen sin
levantar Next.

## 3. La migracion a WebCrypto sin tocar el formato (R14, R15, R16, R17)

### 3.1 Que se parte en dos

Hoy `session-cookie.ts` mezcla dos cosas: **el algoritmo** (`signSessionValue`, `timingSafeEqual`,
troceado y base64url) y **el transporte** (`cookies()` de `next/headers`). El middleware necesita lo
primero y no puede cargar lo segundo. Se separa:

- **`adapters/driven/session/session-token.ts`** — el codec. Sin `next/*`, sin Node-only:

  ```ts
  export const SESSION_VALUE_VERSION = 'v2';        // sube por D16: el payload gana el rol
  export const SESSION_COOKIE_NAME = 'qc_session';  // el nombre NO cambia
  export async function signSessionValue(signedPart: string, secret: string): Promise<string>;
  export async function buildSessionValue(ticket: SessionTicket, secret: string): Promise<string>;
  export async function verifySessionValue(raw: string, secret: string): Promise<SessionClaims | null>;
  export function equalsInConstantTime(a: string, b: string): boolean;
  export function readSessionSecret(): string;   // lee en la llamada, nunca al importar
  ```

- **`session-cookie.ts`** — se queda con `startSession`, `readSessionClaims` y `clearSession`, que
  ahora delegan en el codec. **No cambia ninguna de sus tres firmas publicas**, que es exactamente
  lo que permite que `tests/unit/identity/session-cookie.test.ts` no se toque (3.3).

`signSessionValue` pasa de sincrona a `Promise<string>` porque `crypto.subtle.sign` es asincrona.
Sus dos llamadores (`buildSessionValue` y `verifySessionValue`) ya viven dentro de funciones `async`,
asi que el cambio no sube a la superficie del modulo.

### 3.2 Byte a byte: por que la salida es identica

`createHmac('sha256', secret).update(signedPart).digest('base64url')` y la version WebCrypto
coinciden si —y solo si— coinciden cuatro cosas. Se enumeran para que el implementer las verifique
una a una y para que el reviewer sepa que mirar:

| Pieza | `node:crypto` (hoy) | WebCrypto (despues) |
| --- | --- | --- |
| Algoritmo | `'sha256'` con HMAC | `{ name: 'HMAC', hash: 'SHA-256' }` |
| Clave | string tratado como **UTF-8** | `new TextEncoder().encode(secret)` — los mismos bytes |
| Mensaje | `.update(string)` = **UTF-8** | `new TextEncoder().encode(signedPart)` — los mismos bytes |
| Salida | `digest('base64url')`: base64url **sin relleno** | bytes -> base64 (`btoa`) -> `+`→`-`, `/`→`_`, se quita `=` |

```ts
const key = await crypto.subtle.importKey(
  'raw', new TextEncoder().encode(secret),
  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
);
const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPart)));
return bytesToBase64Url(mac);   // 32 bytes -> 43 caracteres, sin '='
```

El payload se sigue codificando y decodificando en base64url sobre los **bytes UTF-8 del JSON**, con
helpers propios (`bytesToBase64Url` / `base64UrlToBytes`, sobre `btoa`/`atob` y `TextEncoder`/
`TextDecoder`) en vez de `Buffer`: `Buffer` no es API de plataforma en el borde y depender de que
Next lo polirellene seria una suposicion, no un hecho (regla 6). Los helpers viven en el mismo
`session-token.ts` porque son parte del formato, no una utilidad general.

### 3.3 El oraculo: por que se puede afirmar «byte a byte» y no solo desearlo

`tests/unit/identity/session-cookie.test.ts` (QC-8) **calcula la firma esperada por su cuenta, con
`node:crypto`**, y la compara contra lo que escribe `startSession`:

```ts
const esperada = createHmac('sha256', SECRETO).update(`${version}.${encodedPayload}`).digest('base64url');
expect(firma).toBe(esperada);
```

Ese archivo es un test (`tests/` esta exento de la guardia de firma unica) e importa solo
`SESSION_COOKIE_NAME`, `startSession`, `readSessionClaims` y `clearSession` — ninguna de las cuales
cambia de firma.

**D16 no rompe este oraculo, y conviene decirlo sin ambiguedad porque es lo que hace seguro tocar
codigo ajeno.** El test **no compara contra un literal**: recalcula la firma esperada **sobre la
parte firmada que acaba de escribir `startSession`**, sea cual sea su contenido. Que el payload gane
un campo y que la version pase a `v2` no le afecta: sigue afirmando «lo que emite la implementacion
nueva es exactamente lo que habria emitido `node:crypto` sobre ese mismo texto». Si WebCrypto
produjera un solo byte distinto, se pone rojo. La red de seguridad de la migracion criptografica
sigue intacta; lo unico que se pierde es la compatibilidad de tokens ya emitidos, que es justo lo que
el humano acepto.

Lo que si cambia en ese archivo, y **nada mas** (alcance exacto, task T5):

- `expect(version).toBe('v1')` -> `'v2'`;
- `expect(Object.keys(payload)).toEqual(['sub', 'iat', 'exp'])` -> incluye `'role'`, y el nombre del
  test («solo lleva sub/iat/exp») se actualiza;
- las llamadas a `createSessionTicket(USER_ID, AHORA)` pasan el rol, por el cambio de firma de 3.6.

Ninguna de esas tres lineas es un vector de firma: la forma de calcular la firma esperada
—`createHmac('sha256', SECRETO).update(signedPart).digest('base64url')`— **no se toca**. Si una
revision futura ve tentador «simplificar» ese calculo reutilizando `signSessionValue()`, se pierde el
oraculo entero: el test pasaria a comparar la implementacion consigo misma.

Se añade ademas `tests/unit/identity/session-token.test.ts` con paridad explicita (la firma WebCrypto
igual a `createHmac` para varios secretos y mensajes, incluido uno con caracteres no ASCII que ancla
la codificacion UTF-8) y con el caso de **rechazo de la version anterior**, que es el sentido
contrario del que tenia antes de D16: un valor `v1.<payload>.<firma correcta>`, construido
enteramente con `node:crypto` y con `exp` en el futuro, **debe resolverse como `null`** — y debe
hacerlo **sin llegar a verificar la firma** (R27). Se subraya porque es facil dejar escrito el test
antiguo, que afirmaba justo lo opuesto.

### 3.4 Tiempo constante sin `node:crypto` (R17)

`timingSafeEqual` tambien es de `node:crypto`, asi que la comparacion actual **no sobrevive** a la
migracion; y WebCrypto no ofrece equivalente. Se escribe `equalsInConstantTime(a, b)`: compara
primero longitudes y luego acumula el XOR de todos los bytes sin cortar en la primera diferencia.
Son ~8 lineas y se documenta aqui porque `docs/architecture.md > Anti-patrones` rechaza «utilidad
escrita a mano que ya resuelve una libreria del stack» **sin explicacion**: la explicacion es que la
unica implementacion disponible en el stack (`node:crypto`) no existe en el runtime donde hay que
comparar, y meter una dependencia para ocho lineas de XOR costaria una aprobacion humana y una fila
en el registro por menos de lo que cuesta testearla. Tiene test propio (mismo largo/distinto largo,
diferencia en el primer byte y en el ultimo).

### 3.5 Como se hace cumplir «una sola implementacion» (R14, R19)

`tests/guards/guard-firma-sesion-unica.test.ts` se reescribe en tres puntos, conservando su
estructura (`findRepoRoot`, funciones puras exportadas, fuentes sinteticos):

1. `PRODUCTION_DIRS` pasa a incluir **los `.ts`/`.tsx` de primer nivel del repositorio** (hoy
   `next.config.ts`, `playwright.config.ts`, `prisma.config.ts` y, tras esta ficha, `middleware.ts`).
   Sin esto, un `createHmac` en la raiz pasa el gate en verde — comprobado por el reviewer de QC-8.
2. La huella deja de ser solo `createHmac(`: pasa a ser `createHmac(` **o** `crypto.subtle` /
   `subtle.importKey(` / `subtle.sign(`. Si no, migrar el algoritmo desactivaria la guardia sin que
   nadie lo notara (y su assert `expect(encontrados).toContain(UNICO_DUENO)` se pondria rojo, que es
   justo el aviso que su autor dejo previsto).
3. `UNICO_DUENO` pasa a `lib/modules/identity/adapters/driven/session/session-token.ts`, y la
   comprobacion de tiempo constante deja de buscar `timingSafeEqual` para buscar la llamada a
   `equalsInConstantTime`, mas un assert nuevo: **el dueño no importa `node:crypto`** (si lo hiciera,
   el middleware no cargaria en el borde).

## 3.6 El rol dentro del contenido firmado (R26, R27, R28)

### Formato `v2`

```
v2.<base64url(JSON)>.<base64url(HMAC-SHA-256)>      JSON = { sub, iat, exp, role }
```

`role` es el **nombre** del rol (`'Administrador'`, `'Operador'`), el mismo texto que `roles.name` y
que `SessionUser.roleName`: no se inventa un codigo nuevo ni se firma el `role_id`, que obligaria al
borde a traducir un identificador de base sin base. Sigue sin viajar nada mas: ni nombre, ni correo,
ni documento (QC-8 R12 sobre el contenido de la cookie no se relaja).

### La cadena de emision

Meter el rol en la cookie obliga a que el rol **llegue** hasta quien la firma. Hoy no llega, asi que
la cadena se alarga en cuatro puntos, todos dentro de `identity`:

| Pieza | Cambio |
| --- | --- |
| `ports/user-credentials-reader.ts` | `AuthenticatableUser` gana `roleName: string` |
| `adapters/driven/persistence/user-credentials-prisma.ts` | el `select` añade `role: { select: { name: true } }` |
| `domain/session.ts` | `SessionTicket` gana `roleName`; `createSessionTicket(userId, roleName, now)` |
| `domain/verify-credentials.ts` | pasa `usuario.roleName` al ticket |

Es codigo de QC-7 y se toca con la misma red que el resto: sus tests
(`verify-credentials.test.ts`, `session-ticket.test.ts`, `login.int.test.ts`) se adaptan **solo** en
la firma, no en lo que afirman. El rol sale de la base en la misma consulta que ya se hacia para
autenticar: **cero consultas nuevas** en el login (R26, «de la base y nunca del cliente» — el rol no
entra por `FormData` en ningun punto).

### El dominio

`domain/session-claims.ts` (QC-8) crece en tres sitios y en ninguno mas:

```ts
const SESSION_CLAIMS_SCHEMA = z.object({
  sub: z.string().uuid(),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  role: z.string().min(1),          // R28: ausente, vacio o no-texto -> null
});

export type SessionClaims = {
  readonly sub: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly roleName: string;        // el rol FIRMADO, no el actual
};
```

El nombre `roleName` y no `role` a secas es deliberado: coincide con `SessionUser.roleName` y hace
evidente en el sitio de uso que se esta hablando de un rol. El rechazo de la version anterior ocurre
**antes** que todo esto, en el codec (`verifySessionValue`), que compara el primer trozo con
`SESSION_VALUE_VERSION` y sale sin leer el secreto ni verificar nada (R27) — es el mismo corte que
QC-8 ya tenia para «version desconocida», solo que ahora `v1` cae dentro de esa categoria.

**Lo que NO cambia:** `resolve-session-user.ts` sigue consultando la base por el `sub` y sigue
devolviendo el rol **de la base** en `SessionUser.roleName`. QC-8 R12 («el rol que se aplica es
siempre el actual») se mantiene intacto para todo lo que renderiza la zona privada. El rol firmado lo
usa **solo** el middleware.

### 3.7 El rol firmado no es autorizacion (R29, R30)

Dos frases que este documento deja escritas a proposito, porque un rol dentro de una cookie invita
exactamente al error contrario:

1. **El middleware no es la frontera de seguridad.**
   `docs/architecture.md > Acceso a datos y autorizacion` sigue mandando: la autorizacion se valida
   **en el service**, antes de tocar el repositorio. Lo unico que hace el rol firmado es evitar
   enseñar una pantalla que el usuario no va a poder usar. Un permiso implementado solo como corte de
   ruta **no cuenta como implementado**, igual que no cuenta uno implementado solo como policy de
   RLS. Por eso `decideRouteAccess` devuelve `allow | redirect` y nada mas: no expone capacidades, no
   devuelve permisos y ningun service debe preguntarle.
2. **El rol firmado envejece.** Es una foto del instante del login y vale hasta 8 h (D17). Un
   ascenso o una degradacion no surten efecto en el borde hasta que la sesion caduca, asi que puede
   darse el caso de que el middleware deje pasar a una pantalla que el service deniega (molesto, pero
   seguro: la frontera real corta) o que corte una a la que la persona ya tendria derecho (molesto y
   se resuelve volviendo a entrar). **La invalidacion inmediata es QC-23**, y esta ficha no la
   simula: nada de reemitir la cookie al leerla, que ademas violaria R5. El limite lleva test de
   caracterizacion (R30), igual que QC-8 hizo con su R21, y **QC-23 lo pondra rojo a proposito**.

## 4. La decision de acceso (dominio)

### 4.1 Contrato

```ts
// domain/route-access.ts
export type RouteAccessSession =
  | { readonly kind: 'anonymous' }
  // D15: `roleName` es el rol FIRMADO en la cookie, obligatorio desde `v2`. No es anulable:
  // un contenido firmado sin rol valido no llega hasta aqui, se resuelve como «sin sesion» (R28).
  | { readonly kind: 'authenticated'; readonly sub: string; readonly roleName: string };

export type RouteAccessInput = {
  readonly pathname: string;                       // '/dashboard/reportes'
  readonly search: string;                         // '?desde=ayer' o ''
  readonly session: RouteAccessSession;
  readonly privatePrefixes: readonly string[];     // ['/dashboard']
  readonly rules: readonly RouteRoleRule[];        // hoy: []
  readonly routes: { readonly login: string; readonly dashboard: string };
};

export type RouteAccessDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'redirect'; readonly to: string; readonly reason: RedirectReason };

export function decideRouteAccess(input: RouteAccessInput): RouteAccessDecision;
```

`reason` (`'unauthenticated' | 'already-authenticated' | 'forbidden'`) no cambia el destino: existe
para que los tests afirmen **por que** se redirige y no solo a donde, y para que un log futuro no
tenga que reconstruirlo.

Orden de decision, y ese orden **es** la politica:

1. ¿La ruta esta bajo un prefijo privado? Si no lo esta y no es el login -> `allow` (R11).
2. Ruta privada + `anonymous` -> `redirect` a `login?next=<ruta pedida>` (R2, R7).
3. Ruta de login + `authenticated` -> `redirect` al destino de vuelta valido, si lo hay, o al
   dashboard (R10).
4. Ruta privada + `authenticated` + regla que exige un rol que no tiene -> `redirect` al
   **dashboard** (R13). Si la ruta no autorizada ya fuera el dashboard, `allow`: redirigir el
   dashboard al dashboard es el bucle que R13 prohibe.
5. Resto -> `allow`.

### 4.2 Destino de vuelta interno (R9)

```ts
// domain/return-path.ts
export const RETURN_PARAM = 'next';
export function isInternalPath(candidate: string): boolean;
export function resolveReturnPath(candidate: string | null | undefined, fallback: string): string;
export function buildLoginRedirect(loginRoute: string, pathname: string, search: string): string;
```

`isInternalPath` acepta **solo** lo que empieza por una unica `/` y no continua con `/` ni `\`, no
contiene `\`, no trae esquema (`:` antes de la primera `/`) ni caracteres de control, y sobrevive a
un `decodeURIComponent` (un `%2F%2Fevil.com` decodificado no es interno). Todo lo demas se descarta
en silencio y se cae al `fallback`. Sin esta funcion, un enlace fabricado
`/login?next=https://evil.example` sacaria al usuario del ERP **justo despues de autenticarse**, con
la sesion recien creada: es el agujero clasico del patron y por eso D6 lo cierra.

`buildLoginRedirect` codifica la ruta pedida con `encodeURIComponent`, asi que la cadena de consulta
original no se mezcla con la del login.

### 4.3 Reglas ruta→rol (R12)

```ts
// domain/route-role-rules.ts
export type RouteRoleRule = { readonly prefix: string; readonly roles: readonly string[] };
export const ROUTE_ROLE_RULES: readonly RouteRoleRule[] = [];   // vacio A PROPOSITO (D8)
export function findRouteRule(rules: readonly RouteRoleRule[], pathname: string): RouteRoleRule | null;
```

El conjunto esta vacio y el gancho existe: `decideRouteAccess` lo consulta siempre, y sus tests lo
ejercitan con reglas **sinteticas** (no con `ROUTE_ROLE_RULES`), asi que R13 tiene test real hoy y la
primera ficha que añada una regla no estrena codigo. La regla mas larga que case gana, para que
`/productos/nuevo` pueda ser mas estricta que `/productos`.

> **Revisado el 2026-09-02 (D15).** El gancho ya no es un cascaron: el rol llega **firmado en la
> cookie** (3.6), asi que el middleware evalua las reglas de verdad, en el borde y sin consultar la
> base. La primera ficha que añada una regla solo tiene que escribir la fila. Lo que hereda —y esta
> en R30— es que ese rol es una foto del login, no el rol vivo.

## 5. Composicion edge (R15, R21)

`lib/composition/index.ts` importa adaptadores Prisma; importarlo desde el middleware arrastraria
`@prisma/client` al bundle del borde. Por eso se añade un **segundo archivo dentro del mismo punto
de composicion**:

```ts
// lib/composition/edge.ts — cableado que puede correr en el borde.
import { readSessionSecret, verifySessionValue, SESSION_COOKIE_NAME }
  from '@/lib/modules/identity/adapters/driven/session/session-token';
import type { SessionTokenVerifier } from '@/lib/modules/identity/ports/session-token-verifier';

const sessionTokenVerifier: SessionTokenVerifier = {
  cookieName: SESSION_COOKIE_NAME,
  verify: (raw) => verifySessionValue(raw, readSessionSecret()),
};

export const identityEdge = { sessionTokenVerifier } as const;
```

Sigue habiendo **un solo punto de composicion**: `guard-arquitectura-modulos` autoriza el import de
adaptadores driven a todo `lib/composition/**` (prefijo, no archivo), asi que la regla no se toca y
la frontera no se ensancha. El middleware importa `@/lib/composition/edge`, nunca el adaptador.

`lib/composition/index.ts` (Node) no cambia de comportamiento: sus `startSession`, `readClaims` y
`endSession` siguen viniendo de `session-cookie.ts`.

## 6. El adaptador driving

```ts
// lib/modules/identity/adapters/driving/route-guard-middleware.ts
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const raw = request.cookies.get(identityEdge.sessionTokenVerifier.cookieName)?.value;
  const session = await readSession(raw);        // claims | null, fallo cerrado (R18)
  const decision = decideRouteAccess({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    session: session === null
      ? { kind: 'anonymous' }
      // D15: el rol sale del contenido FIRMADO, no de la base. El borde no consulta nada.
      : { kind: 'authenticated', sub: session.sub, roleName: session.roleName },
    privatePrefixes: PRIVATE_ROUTE_PREFIXES,
    rules: ROUTE_ROLE_RULES,
    routes: { login: LOGIN_ROUTE, dashboard: DASHBOARD_ROUTE },
  });
  return decision.kind === 'allow'
    ? NextResponse.next()
    : NextResponse.redirect(new URL(decision.to, request.nextUrl));
}
```

- **Version anterior (R27):** un `v1.…` cae en el corte de version del codec y sale como «sin
  sesion» sin verificarse; el usuario acaba en el login y su siguiente entrada emite un `v2`. No hay
  rama de compatibilidad que mantener.
- **Caducidad (R3):** `verifySessionValue` devuelve `SessionClaims`; el adaptador aplica
  `isSessionExpired(claims, new Date())`, la misma funcion del dominio que ya usa QC-8. No hay una
  segunda nocion de «caducada».
- **Fallo cerrado (R18):** `readSession` envuelve la verificacion en un `try` acotado a la llamada;
  cualquier excepcion —`SESSION_SECRET` ausente o corto es la unica prevista— se traduce a
  `anonymous`. En el borde una excepcion no capturada devolveria 500 en **cada** navegacion,
  incluido el login, y dejaria al usuario sin sitio adonde ir; fallar cerrado lo manda al login, que
  es publico. El `catch` no es vacio: registra el mensaje del error, que por QC-8 R9 nunca contiene
  el secreto (`docs/conventions.md > Manejo de errores`).
- **No toca la cookie (R5):** solo hay `NextResponse.next()` y `NextResponse.redirect()`. Ninguna
  llamada a `cookies.set` ni `cookies.delete`, y su test lo afirma.
- **No toca la base (R4):** no importa la composicion Node ni ningun repositorio; la guardia de 8.2
  lo hace cumplir sobre el cierre de imports.

## 7. Que rutas son privadas (R1)

`app/(private)/` es un route group: **no aparece en la URL**, asi que el middleware no puede
deducirlo del camino. Se declara el conjunto y se ata al arbol de archivos con una guardia:

```ts
// lib/shared/routes.ts
export const PRIVATE_ROUTE_PREFIXES = ['/dashboard'] as const;
```

`tests/guards/guard-rutas-privadas-cubiertas.test.ts` recorre `app/(private)/`, calcula la URL de
cada carpeta que contiene `page.tsx` (ignorando `components/` y los route groups entre parentesis) y
exige que **cada una** este cubierta por un prefijo de la constante, y que ningun prefijo sobre.
Resultado: una pantalla nueva bajo `(private)/` queda protegida por nacer ahi, y si alguien la crea
sin tocar la constante **el gate se pone rojo con el nombre de la ruta**. La convencion se cumple
sola o falla ruidosamente; lo que no puede es fallar en silencio.

`lib/shared/routes.ts` es hoja del grafo y ya lo importan `app/`, los driving y `lib/shared`: no se
rompe ninguna regla de dependencias. El dominio **no** lo importa: recibe los prefijos como
parametro (4.1), que es lo que lo mantiene puro (R20).

## 8. Vuelta a la ruta pedida (R7, R8)

Cadena completa:

1. `GET /dashboard/reportes` sin sesion -> `307 /login?next=%2Fdashboard%2Freportes` (middleware).
2. `app/(public)/login/page.tsx` (Server Component) lee `searchParams.next`, lo pasa por
   `resolveReturnPath(...)` y se lo entrega a `<LoginForm next={...} />`.
3. `LoginForm` lo lleva en un `<input type="hidden" name="next">`. Sin cambio visual, sin estado
   nuevo, sin cambiar los campos no controlados de QC-7.
4. `loginAction` lee ese campo, lo vuelve a validar con `resolveReturnPath(next, DASHBOARD_ROUTE)`
   —la validacion del cliente no cuenta— y hace `redirect(destino)`. **La firma congelada no cambia**
   (`prevState`, `formData`), y el destino por defecto sigue siendo el dashboard.

**Por que esto no invade QC-13 (D10).** La frontera es «QC-9 es servidor, QC-13 es UI». Lo que se
toca aqui es el transporte de un dato del servidor al servidor: un campo oculto y una lectura de
`searchParams`. No hay comportamiento visible nuevo, no se toca la autenticacion del formulario, ni
el layout privado, ni el cierre de sesion — que es lo que D10 reserva a QC-13. La decision y la
validacion viven en el dominio; el formulario solo es el sobre.

**Doble validacion a proposito:** en el paso 2 para no pintar basura, y en el paso 4 porque el campo
oculto es entrada externa (`docs/architecture.md > Principios 2`) y un POST fabricado puede traer
cualquier cosa. El unico que protege de verdad es el del paso 4.

## 9. Guardias que se amplian o se crean

| Guardia | Cambio | Requisito |
| --- | --- | --- |
| `guard-firma-sesion-unica.test.ts` | raiz en `PRODUCTION_DIRS`, huella `crypto.subtle`, dueño nuevo, tiempo constante | R14, R17, R19 |
| `guard-arquitectura-modulos.test.ts` | raiz en `SCAN_ROOTS`; los archivos de primer nivel se juzgan con las reglas de `app/**` | R19, R21 |
| `guard-middleware-edge.test.ts` (nueva) | recorre el cierre de imports desde `middleware.ts` y prohibe `node:crypto`, `@prisma/client`, `lib/shared/db/prisma` y `next/headers` | R4, R15 |
| `guard-rutas-privadas-cubiertas.test.ts` (nueva) | `app/(private)/**` vs `PRIVATE_ROUTE_PREFIXES` | R1 |
| `guard-doc-permisos.test.ts` (nueva) | `docs/architecture.md > Permisos y autenticacion` no dice «existencia de cookie» y si dice firma y caducidad | R23 |
| `guard-dependencias-aprobadas.test.ts` | sin cambios; ya cubre R25 | R25 |

La ampliacion de las dos primeras es **bloqueante y va antes que `middleware.ts`** (D11, R19): si se
escribe el middleware primero, la guardia nace ya adaptada a lo que hay y nadie sabe si habria
cazado el fallo. El orden esta en `tasks.md` (T1, T2) y su criterio de hecho incluye un archivo
sintetico en la raiz que la ponga en rojo, borrado despues.

`guard-arquitectura-modulos` con la raiz dentro barre tres archivos de configuracion existentes
(`next.config.ts`, `playwright.config.ts`, `prisma.config.ts`); se ha comprobado que sus imports
(`next`, `@playwright/test`, `prisma/config`) son externos y no disparan ninguna regla. Si alguno
diera un hallazgo inesperado, se corrige el archivo, **no** se añade una excepcion a la guardia.

## 10. Alternativas descartadas

1. **Middleware que solo comprueba que la cookie existe.** Es lo que `docs/architecture.md` describe
   hoy y lo mas barato de escribir. Descartada por D1 y con razon tecnica: una cookie caducada o
   falsificada pasaria el corte y llegaria hasta la pagina, donde el layout la rechazaria; el
   portero no aportaria nada y sembraria la falsa sensacion de que la ruta esta protegida.
2. **Correr el middleware en runtime Node (`export const runtime = 'nodejs'`).** Permitiria seguir
   usando `node:crypto` y no migrar nada. Descartada por D1: saca al middleware de su camino por
   defecto y lo hace pagar arranque de Node en **cada** navegacion, para ahorrar una migracion que se
   hace una vez.
3. **Lista explicita de rutas protegidas en el `matcher`.** Descartada por D4: olvidar una entrada no
   rompe ningun test, solo deja una pantalla abierta. La alternativa elegida (prefijos + guardia
   contra el arbol de archivos) falla ruidosamente ante el mismo olvido.
4. **Denegar por defecto y mantener una lista blanca de rutas publicas.** Aun mas estricta que la
   elegida, y tentadora. Descartada porque invierte el riesgo hacia la disponibilidad: cada ruta
   publica futura (recuperar contraseña, un webhook en `app/api/`, una pagina de estado) nace rota, y
   los fallos de «lo he olvidado» se convierten en usuarios que no pueden entrar. Ademas obliga a
   enumerar assets y rutas internas de Next, que cambian con la version del framework.
5. ~~**Llevar el rol dentro del token para poder aplicar reglas ruta→rol en el borde.**~~
   **ADOPTADA el 2026-09-02 (D15)**, despues de que el humano cerrara la pregunta abierta 1. Se habia
   descartado por dos razones y las dos cayeron: la primera (D3 congelaba el formato) porque **D3
   quedo derogada** al confirmarse que no hay sesiones vivas que preservar; la segunda (un rol
   firmado hace 8 h contradice QC-8 R12) porque **no la contradice**: R12 rige donde se autoriza —el
   service y el layout, que siguen leyendo el rol de la base en cada peticion— y el rol firmado solo
   decide si se enseña una pantalla (R29). Se deja la fila escrita, y no borrada, porque el motivo
   por el que se descarto primero es la mitad de la historia de esta decision.
   Las dos alternativas que se descartaron **en su lugar**:
   - **Que la regla de rol la aplique el Server Component de cada pantalla** y el middleware corte
     solo por autenticacion. Descartada por D8: dejaria el gancho del middleware sin efecto real y
     movería a cada pantalla una decision que se quiso central.
   - **Una consulta del borde a un endpoint interno** para resolver el rol. Descartada por coste: una
     ida y vuelta de red **en cada navegacion**, incluidas las que van a acabar en `allow`.
6. **Aceptar `v1` y `v2` a la vez durante una temporada.** Es lo que se haria si hubiera sesiones
   vivas que no se pueden romper. Descartada por D16: no las hay («y si alguna vive la borramos desde
   el navegador»), y mantener dos formatos significa mantener **dos caminos de verificacion vivos**,
   uno de ellos sin rol —que obligaria a decidir que hace el gancho de reglas cuando el token no lo
   trae—. La migracion sin compatibilidad se paga una vez, en un login; la compatibilidad se paga en
   cada lectura y en cada test, para siempre.
7. **Cookie `return_to` en vez de parametro `next`.** El middleware escribiria una cookie de corta
   vida al redirigir y la consumiria en la primera navegacion autenticada; ventaja real: QC-9 no
   tocaria ni un archivo de UI. Descartada porque añade una segunda cookie con su propio ciclo de
   vida, su caducidad, su borrado y un modo de fallo nuevo (una cookie rancia secuestrando una
   navegacion posterior) a cambio de evitar un `<input type="hidden">`. El parametro en la URL es el
   patron estandar, es visible y muere con la peticion.
8. **Memoizar `getSessionUser` con `cache()` de React** (la salida que QC-8 dejo anotada para esta
   ficha). No hace falta: R4 mantiene el middleware fuera de la base, asi que sigue habiendo **una**
   consulta por render, hecha por el layout. Se implementaria codigo que nadie ejercita.

## 11. Dependencias de terceros

**Ninguna nueva (D14, R25).** WebCrypto (`globalThis.crypto.subtle`) es API estandar de la
plataforma: existe en Node 20+ y en el runtime del borde, y no se instala. `btoa`/`atob`,
`TextEncoder` y `TextDecoder` son igualmente globales. No hay, por tanto, ningun bloque de cuatro
checks que rellenar ni fila nueva en `docs/dependencias.md`; `guard-dependencias-aprobadas` seguira
verde sin tocar nada. Las ~8 lineas de comparacion en tiempo constante y los dos helpers de base64url
son la unica utilidad escrita a mano, y 3.2/3.4 explican por que (lo exige
`docs/architecture.md > Anti-patrones`).

## 12. Verificacion

- **Dominio (unit, sin Next):** `route-access`, `return-path`, `route-role-rules`. Son la mayor
  parte de los requisitos de comportamiento (R2, R7, R9–R13) y corren en milisegundos.
- **Codec (unit):** `session-token` — paridad con `node:crypto`, compatibilidad hacia atras, tiempo
  constante.
- **Regresion (unit):** `session-cookie.test.ts`, oraculo de R16, con **solo** las tres lineas de
  3.3 modificadas; su forma de recomputar la firma esperada no se toca.
- **Emision del rol (unit + integracion):** `verify-credentials.test.ts` y `login.int.test.ts`
  afirman que el rol firmado es el que la base tiene en ese instante (R26).
- **Adaptador driving (unit):** `route-guard-middleware` con `NextRequest` reales construidas a
  mano; afirma la traduccion y que no se toca la cookie.
- **Guardias:** las seis de la tabla de 9.
- **E2E (Playwright):** R24, el recorrido heredado de QC-8 mas la vuelta a la ruta pedida. Es
  flujo critico de autenticacion, asi que `CHECKPOINTS.md > Calidad de codigo` lo exige. Fixtures con
  prefijo propio y `RUN_ID`, limpieza en `afterAll` dentro de `try`/`finally`, igual que
  `e2e/login.spec.ts`. Ojo al riesgo ajeno ya documentado en QC-8: un `pnpm run e2e` interrumpido
  deja huerfanos que ponen en rojo `identity-constraints.int.test.ts`.

**UI y multiplataforma:** esta feature no añade interfaz visible (el unico elemento nuevo es un input
oculto), asi que la regla de `docs/architecture.md > Componentes > multiplataforma` no aplica y no se
invoca ninguna excepcion. El E2E corre igualmente en Chromium y WebKit, que es donde se comprueba que
la cookie y las redirecciones se comportan igual en el motor de iOS.

## 13. Riesgos asumidos

1. **Se toca codigo ajeno vivo (QC-7/QC-8).** Mitigado por 3.3: el test que ancla la firma sigue
   recomputandola con `node:crypto` sobre lo que emite la implementacion nueva, y de el solo cambian
   el literal de version y la lista de claves del payload.
1-bis. **Todas las sesiones vivas se rompen** al subir a `v2` (D16). Aceptado explicitamente por el
   humano; el efecto es que quien tuviera una sesion abierta aparece en el login y vuelve a entrar.
   Si al desplegar apareciera una sesion rara, se borra la cookie desde el navegador.
1-ter. **El rol firmado envejece hasta 8 h** (D17, R30). Corta de verdad la frontera del service, no
   el middleware (R29). La invalidacion inmediata es QC-23, que pondra rojo el test de
   caracterizacion de R30 a proposito.
2. **El middleware corre en cada navegacion.** Su coste es un HMAC-SHA-256 sobre ~150 bytes y ninguna
   I/O. R4 y R22 lo mantienen asi.
3. **Sesion revocada.** Sigue sin existir (QC-23): el middleware confia en el `exp` firmado. Nada
   nuevo respecto a QC-8 R21.
4. **La cadena de consulta viaja en `next`.** Si una pantalla futura llevara datos sensibles en la
   URL, apareceran en la barra del login. Se acepta: hoy ninguna ruta privada tiene query, y la
   alternativa (recortar la query) romperia D5 en cuanto exista un filtro compartible por enlace.
