# QC-9 — proteccion-de-rutas-privadas · design.md

> Requisitos en `requirements.md`. Las decisiones cerradas (D1–D14) las fijo el humano el
> 2026-09-02 y **este documento no las reabre**: las traduce a piezas.

## 0. Mapa: decision cerrada -> requisito

| # | Decision (fila de `requirements.md`) | Requisitos |
| --- | --- | --- |
| D1 | La firma migra a WebCrypto y el middleware valida de verdad | R3, R15 |
| D2 | Una sola implementacion del HMAC en todo el repositorio | R14 |
| D3 | La migracion no cambia el formato del token | R16, R17 |
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

Requisitos que no salen de una fila pero cierran el alcance: R2 (cortar antes de renderizar), R4
(el borde no toca la base), R5 (no reemitir cookie), R18 (fallo cerrado sin secreto), R22 (assets
fuera), R24 (E2E heredado de QC-8).

## 1. Datos

**Ninguno.** Esta feature no añade tablas, columnas, indices, policies de RLS ni migraciones: la
sesion ya viaja firmada en la cookie (QC-7/QC-8) y el middleware no consulta la base (R4). No hay
`down.sql` que escribir. Se dice explicitamente porque `CHECKPOINTS.md > Datos y seguridad` se
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
`CHECKPOINTS.md > Modulos hexagonales` («la logica de negocio esta en `domain/`, no en la Server
Action» — aqui, no en el middleware), y es lo que hace que R7, R9, R10, R12 y R13 se testeen sin
levantar Next.

## 3. La migracion a WebCrypto sin tocar el formato (R14, R15, R16, R17)

### 3.1 Que se parte en dos

Hoy `session-cookie.ts` mezcla dos cosas: **el algoritmo** (`signSessionValue`, `timingSafeEqual`,
troceado y base64url) y **el transporte** (`cookies()` de `next/headers`). El middleware necesita lo
primero y no puede cargar lo segundo. Se separa:

- **`adapters/driven/session/session-token.ts`** — el codec. Sin `next/*`, sin Node-only:

  ```ts
  export const SESSION_VALUE_VERSION = 'v1';
  export const SESSION_COOKIE_NAME = 'qc_session';
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
cambia de firma. **Por eso el archivo no se modifica ni en una linea**, y sigue siendo una
comparacion de la implementacion nueva contra la implementacion vieja del algoritmo. Si WebCrypto
produjera un solo byte distinto, ese test se pone rojo. Es la red de seguridad de D3, y la condicion
de «hecho» de la task T4.

Se añade ademas `tests/unit/identity/session-token.test.ts` con paridad explicita (la firma
WebCrypto igual a `createHmac` para varios secretos y mensajes, incluido uno con caracteres no ASCII
que ancla la codificacion UTF-8) y con el caso de compatibilidad hacia atras: un valor de cookie
construido **enteramente con `node:crypto`**, como los que hay hoy vivos en los navegadores, valida
contra `verifySessionValue`.

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

## 4. La decision de acceso (dominio)

### 4.1 Contrato

```ts
// domain/route-access.ts
export type RouteAccessSession =
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'authenticated'; readonly sub: string; readonly roleName: string | null };

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

> **Limite honesto, y esta escrito en `requirements.md > Preguntas abiertas 1`:** el borde no tiene
> base de datos y el token no lleva el rol (D3 congela el formato), asi que hoy el middleware pasa
> `roleName: null`. Con el conjunto vacio eso no cambia ninguna respuesta. La ficha que traiga la
> primera regla decide de donde sale el rol.

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
      : { kind: 'authenticated', sub: session.sub, roleName: null },
    privatePrefixes: PRIVATE_ROUTE_PREFIXES,
    rules: ROUTE_ROLE_RULES,
    routes: { login: LOGIN_ROUTE, dashboard: DASHBOARD_ROUTE },
  });
  return decision.kind === 'allow'
    ? NextResponse.next()
    : NextResponse.redirect(new URL(decision.to, request.nextUrl));
}
```

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
5. **Llevar el rol dentro del token para poder aplicar reglas ruta→rol en el borde.** Descartada: D3
   congela el formato, y ademas un rol firmado hace 8 h contradice QC-8 R12 («el rol que se aplica es
   siempre el actual»). Queda como opcion (a) de la pregunta abierta 1.
6. **Cookie `return_to` en vez de parametro `next`.** El middleware escribiria una cookie de corta
   vida al redirigir y la consumiria en la primera navegacion autenticada; ventaja real: QC-9 no
   tocaria ni un archivo de UI. Descartada porque añade una segunda cookie con su propio ciclo de
   vida, su caducidad, su borrado y un modo de fallo nuevo (una cookie rancia secuestrando una
   navegacion posterior) a cambio de evitar un `<input type="hidden">`. El parametro en la URL es el
   patron estandar, es visible y muere con la peticion.
7. **Memoizar `getSessionUser` con `cache()` de React** (la salida que QC-8 dejo anotada para esta
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
- **Regresion intacta (unit):** `session-cookie.test.ts` **sin modificar**, que es el oraculo de R16.
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

1. **Se toca codigo ajeno vivo (QC-7/QC-8).** Mitigado por 3.3: el test que ancla el formato no se
   modifica y compara contra la implementacion anterior del algoritmo.
2. **El middleware corre en cada navegacion.** Su coste es un HMAC-SHA-256 sobre ~150 bytes y ninguna
   I/O. R4 y R22 lo mantienen asi.
3. **Sesion revocada.** Sigue sin existir (QC-23): el middleware confia en el `exp` firmado. Nada
   nuevo respecto a QC-8 R21.
4. **La cadena de consulta viaja en `next`.** Si una pantalla futura llevara datos sensibles en la
   URL, apareceran en la barra del login. Se acepta: hoy ninguna ruta privada tiene query, y la
   alternativa (recortar la query) romperia D5 en cuanto exista un filtro compartible por enlace.
