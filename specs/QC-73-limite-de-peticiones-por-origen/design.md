# QC-73 — limite-de-peticiones-por-origen · design.md

> Cubre `requirements.md` R1–R35. Cierra la **pregunta abierta 3** (§3). Las preguntas 1 y 2 siguen
> abiertas; lo que el diseño necesita de ellas está en **§11 Para decidir al aprobar**.
> Dependencias nuevas: **`@upstash/ratelimit` y `@upstash/redis`** (§9), aprobadas por el humano
> sujetas a repetir los cuatro checks en F1.4.

## 0. Lo que hay hoy, leído en disco (no supuesto)

- `middleware.ts` es un cascarón: reexporta `middleware` desde
  `lib/modules/identity/adapters/driving/route-guard-middleware.ts` y declara el `matcher`, que deja
  fuera `_next/static`, `_next/image`, `favicon.ico` e imágenes. `tests/unit/middleware-root-contract.test.ts`
  lo afirma sobre el texto del archivo.
- `route-guard-middleware.ts` lee la cookie, la verifica con `identityEdge`, decide `allow` o
  `redirect` con `decideRouteAccess` y, en `allow`, reescribe la cabecera de **petición**
  `x-request-id` con `observabilidadEdge` (QC-71). **No hace ninguna E/S.**
- `lib/composition/edge.ts` es la mitad del punto de composición que el borde puede cargar. Lee los
  secretos **dentro** de la llamada, no al cargar el módulo (`readSessionSecret()` en `verify`).
- `tests/guards/guard-middleware-edge.test.ts` recorre el cierre de imports **interno** desde
  `middleware.ts` y prohíbe `node:crypto`, `crypto`, `@prisma/client`, `next/headers` y
  `lib/shared/db/prisma`. Los paquetes externos no se recorren: solo se comparan por nombre.
- El login es `app/(public)/login/components/login-form.tsx`: `useActionState(loginAction, …)` y el
  error se muestra con `toast.error` de `sonner`.
- `LOGIN_ROUTE = '/login'` vive en `lib/shared/routes.ts`.
- `playwright.config.ts` arranca **`next dev`** en el puerto 3117, con dos proyectos (Chromium y
  WebKit) y `fullyParallel: true`.
- `@upstash/*` **no** están en `package.json` ni en el `node_modules` del árbol principal: nada de su
  API se ha podido leer en el paquete. Todo lo que este diseño dice de ella está marcado como **a
  verificar en T1**.

## 1. Hechos de Next 16.3.0 que el diseño usa, con su fuente

Todas las rutas son de `node_modules/next/dist/` del árbol principal (el worktree no tiene
`node_modules`). Next instalado: `16.3.0` (`package.json`).

| # | Hecho | Fuente |
|---|---|---|
| N1 | `middleware.ts` está **obsoleto** y renombrado a `proxy.ts`, pero sigue funcionando igual. | `docs/01-app/03-api-reference/03-file-conventions/middleware.md:11-13` |
| N2 | **`middleware.ts` sigue corriendo en el runtime del BORDE**; `proxy.ts` corre en Node y no se puede cambiar: «If you want to continue using the `edge` runtime, keep using `middleware`». | `docs/01-app/02-guides/upgrading/version-16.md:616`; `proxy.md:223` y `:774` |
| N3 | **No hay `request.ip`**: `ip` y `geo` se quitaron de `NextRequest` en v15. El origen solo puede salir de cabeceras. | `docs/01-app/03-api-reference/04-functions/next-request.md:123` |
| N4 | Una Server Action **no es una ruta aparte**: es un POST a la ruta donde se usa, así que pasa por el `matcher` de esa ruta. | `proxy.md:217` |
| N5 | La cabecera `next-action` **sí** llega al middleware: Next solo quita del `request` las cabeceras de Flight (`rsc`, `next-router-state-tree`, `next-router-prefetch`, `next-hmr-refresh`, `next-router-segment-prefetch`), y `next-action` no está en esa lista. | `client/components/app-router-headers.js:96` y `:104-110`; `proxy.md:442` |
| N6 | **Qué recibe el cliente si el middleware contesta a una Server Action con algo que no es la respuesta de la acción**: si la respuesta no es `text/x-component` y no es una redirección de acción, el cliente lanza un `Error`. Su mensaje es **el cuerpo de la respuesta** cuando `status >= 400` **y** `content-type` es **exactamente** `text/plain`; en cualquier otro caso es el texto fijo «An unexpected response was received from the server.». | `client/components/router-reducer/reducers/server-action-reducer.js:135-149` (comparación `contentType === 'text/plain'` en la línea 143) |
| N7 | Esa excepción rechaza la promesa de la acción. Un error sin atrapar dentro de una transición —y la acción de un `<form action>` lo es— **sube al error boundary más cercano**, que pinta el `error.tsx` de la zona. | `server-action-reducer.js:330-333`; `docs/01-app/01-getting-started/10-error-handling.md:372` |
| N8 | En una navegación del cliente (petición RSC), si la respuesta no es Flight o no es `ok`, el cliente **abandona la navegación suave y hace una navegación completa** a la misma URL. | `client/components/router-reducer/fetch-server-response.js:141-149` |
| N9 | Next 16 impide dos `next dev` a la vez sobre el mismo proyecto (fichero de bloqueo). | `version-16.md:907-911` |

**N6 y N7 son el punto delicado de la ficha.** Dicen dos cosas: (a) sin hacer nada, un 429 del
middleware a una Server Action termina en la **pantalla de error genérica**, que es justo lo que D4
no quiere; y (b) hay **un** canal documentado en el código para que el texto llegue intacto al
cliente: `status >= 400` y `content-type: text/plain` exacto, sin `;charset=…`. §5 se apoya en (b).

## 2. Dónde vive cada pieza

Módulo nuevo **`lib/modules/rate-limit/`** (identificadores en inglés, D9). No es `identity`: el
límite no sabe nada de usuarios ni de sesiones, y el día que otro punto de entrada lo necesite no
habrá que sacarlo de ahí. Mismo razonamiento con el que QC-71 creó `observabilidad`.

| Pieza | Archivo | Qué hace |
|---|---|---|
| Dominio | `lib/modules/rate-limit/domain/request-origin.ts` | `resolveRequestOrigin(forwardedFor: string \| null): string` — primera entrada, recortada, validada como IP; si no, `UNKNOWN_ORIGIN` (R6, R7) |
| Dominio | `lib/modules/rate-limit/domain/rate-limit-bucket.ts` | `selectBucket(pathname, loginRoute): 'login' \| 'general'` (R2, R3). La ruta del login entra por parámetro, como en `decideRouteAccess` |
| Dominio | `lib/modules/rate-limit/domain/rate-limit-config.ts` | `parseRateLimitConfig(env): { config, warnings }` con los valores por defecto (R17–R20) |
| Dominio | `lib/modules/rate-limit/domain/check-request-rate.ts` | `checkRequestRate(input, deps)` → `allow` \| `block` \| `degraded` con espera máxima (R8, R21, R22) |
| Dominio | `lib/modules/rate-limit/domain/rate-limited-response.ts` | `RATE_LIMITED_MESSAGE`, `renderRateLimitedPage()` (HTML) e `isRateLimitedError(error)` (R10, R11, R13–R16) |
| Puerto | `lib/modules/rate-limit/ports/rate-limiter.ts` | `RateLimiter.consume(key, quota): Promise<{ allowed: boolean }>` |
| Driven | `lib/modules/rate-limit/adapters/driven/in-memory-rate-limiter.ts` | Ventana fija en un `Map`, reloj inyectable (R4, R5, R26, R27) |
| Driven | `lib/modules/rate-limit/adapters/driven/upstash-rate-limiter.ts` | **Único** archivo que importa `@upstash/*` (R25, R27, R28, R31) |
| Contrato | `lib/modules/rate-limit/index.ts` | Reexporta solo `./domain` |
| Cableado | `lib/composition/edge.ts` | Añade la fachada `rateLimitEdge` (§6) |
| Enganche | `lib/modules/identity/adapters/driving/route-guard-middleware.ts` | Consulta el límite **antes** de leer la cookie y, si frena, responde 429 (§4) |
| Cliente | `hooks/use-rate-limited-action-state.ts` | Envoltorio de `useActionState` que convierte el freno en el mensaje sobre el formulario (§5) |

Por qué la regla de dependencias lo permite sin tocarla: el adaptador driving ya importa
`@/lib/composition/edge`; `edge.ts` puede importar adaptadores driven de cualquier módulo porque
`guard-arquitectura-modulos` lo autoriza por **prefijo** `lib/composition/**`; y el hook, en
`hooks/**`, solo importa el barril `@/lib/modules/rate-limit`, que es dominio puro.
`middleware.ts` **no se toca** (R29).

## 3. Pregunta abierta 3 — de qué cabecera sale el origen y cuándo se confía en ella

**Decisión: la primera dirección de `x-forwarded-for`; si falta o no es una IP válida, un único
origen común «desconocido».** (R6, R7)

- **Por qué una cabecera:** N3. No hay otro sitio.
- **Por qué `x-forwarded-for`:** la pregunta sembrada ya recoge que en Vercel esa cabecera la pone la
  plataforma. **Que Vercel la sobrescriba en vez de añadir a lo que manda el cliente NO se ha podido
  verificar aquí** (sin red). Se verifica en T12 sobre un despliegue de preview, pegando la cabecera
  recibida con una `x-forwarded-for` falsa enviada a propósito.
- **Por qué la PRIMERA entrada y no la última:** en Vercel, si sobrescribe, hay una sola y da igual.
  Fuera de Vercel, detrás de un proxy que *añade*, la última sería la difícil de falsear; pero la
  primera es la que permite que el E2E use su propio origen enviando la cabecera (§8), y **el único
  despliegue soportado es Vercel** (`docs/architecture.md > Stack`). El coste está en §11, punto 5.
- **Por qué validar como IP:** lo que no es una IP es texto del cliente. Sin validar, cada valor
  distinto sería un contador distinto y el atacante tendría cuota infinita cambiando basura. La
  validación usa `z.ipv4()` / `z.ipv6()` de `zod` (dominio puede importar `zod`); **que esos dos
  nombres existan en zod 4.4 es a verificar en T2**, y si no, se usa la forma que zod 4 publique —no
  una expresión regular propia—.
- **Por qué un origen común y no dejar pasar:** si la ausencia de cabecera dejara pasar, bastaría con
  no mandarla. En Vercel no debería faltar nunca; en local es el caso normal si `next dev` no la
  rellena (**desconocido**: T12 lo mira) y entonces todo el equipo local comparte un contador, lo
  cual no rompe nada.
- **IPv6:** cada dirección cuenta por separado; agrupar por `/64` no entra (§11, punto 7).

## 4. El enganche en el middleware

```
petición ──▶ route-guard-middleware
              1. origin = resolveRequestOrigin(headers['x-forwarded-for'])
              2. bucket = selectBucket(pathname, LOGIN_ROUTE)
              3. verdict = await rateLimitEdge.check({ origin, bucket })   ◀── espera máxima
                   block    ──▶ respuesta 429 (pantalla o Server Action)   FIN, sin cookie, sin id
                   degraded ──▶ console.warn(aviso sin IP) y sigue en 4
                   allow    ──▶ sigue en 4
              4. lo de hoy, sin cambios: cookie, decideRouteAccess, redirect | next + x-request-id
```

- **El freno va primero (R9).** Una petición frenada no paga el HMAC de la cookie ni genera
  identificador, y un bloqueo por origen no depende de si hay sesión (R14). El camino de hoy queda
  intacto detrás (R23).
- **Una petición cuenta en UNA sola cuota** (R2, R3): el login no suma además en la general. Así la
  cuota general no se come con intentos de login y la de login no depende de la navegación.
- **Server Action o pantalla** se distingue en el adaptador: `request.method === 'POST'` y
  `request.headers.has('next-action')` (N5). Es traducción de la petición, no una regla: vive en el
  driving.
- **Respuesta a una Server Action frenada:**
  `status 429`, `content-type: text/plain` **exacto** (N6), `cache-control: no-store`, cuerpo
  `RATE_LIMITED_MESSAGE`. Sin `Retry-After` ni `X-RateLimit-*` (R13, R16). Se construye con
  `new NextResponse(body, { status, headers })` poniendo la cabecera a mano: el valor por defecto de
  un `Response` con cuerpo de texto es `text/plain;charset=UTF-8`, que **no** cumple la igualdad
  estricta de N6. El test de T10 afirma la cabecera literal por eso.
- **Respuesta a una navegación frenada:** `status 429`, `content-type: text/html; charset=utf-8`,
  `cache-control: no-store`, cuerpo `renderRateLimitedPage()`. Si la navegación era del cliente
  (RSC), N8 hace que el navegador repita la petición como navegación completa, que vuelve a pasar por
  aquí y ve la pantalla. Esa segunda petición también cuenta; está dentro de lo que D1 decidió.
- **Los avisos** (R21, R22, R24) los escribe el adaptador driving con `console.warn`, igual que ya
  hace con el fallo de la cookie: `[rate-limit] contador no disponible, se deja pasar (cuota=<login|general>, motivo=<timeout|error:<nombre del error>>)`.
  **Ni la IP** (es dato personal, `docs/architecture.md > Anti-patrones`), **ni el mensaje del error**
  de Upstash (podría arrastrar la URL o la cabecera de autorización), **ni el token**. Sin línea de
  éxito: el criterio de QC-57/QC-71 contra el ruido.
- **Comentarios:** al tocar `route-guard-middleware.ts` se limpian los comentarios de las líneas que
  toca la rama (`docs/conventions.md > Comentarios`); los nuevos no citan fichas ni requisitos.

## 5. El punto delicado: que el mensaje llegue al formulario (R11, R12)

**Decisión: el middleware contesta con el canal de N6 y un envoltorio de `useActionState` en el
cliente reconoce ese error y lo convierte en el mensaje neutro sobre el formulario, sin error
boundary.**

```
form action ──POST next-action──▶ middleware: 429, text/plain, "Demasiados intentos. …"
cliente Next (N6): throw new Error("Demasiados intentos. …")
useRateLimitedActionState:  catch (e)
    isRateLimitedError(e)  ─▶ toast.error(RATE_LIMITED_MESSAGE); return estado anterior   (R11)
    cualquier otro error   ─▶ throw e  (sigue al error boundary, como hoy)               (R12)
```

- `hooks/use-rate-limited-action-state.ts` expone la misma firma que `useActionState` y envuelve la
  acción en `async (prev, formData) => { try { return await action(prev, formData) } catch … }`.
  Atrapar **dentro** de la acción es lo que impide que el error llegue a la transición y de ahí al
  boundary (N7).
- `isRateLimitedError(e)` es `e instanceof Error && e.message === RATE_LIMITED_MESSAGE`. Compara
  contra la **misma constante** que escribe el middleware; no hay dos textos que puedan divergir.
- **Por qué toast:** el login ya enseña sus errores con `toast.error` sobre el propio formulario, y
  un toast es igual para todos los formularios sin tocar el marcado de cada uno. La alternativa
  —una región de error dentro de cada formulario— está en §11, punto 2.
- **Estado devuelto = el anterior.** No se inventa una variante de estado nueva en cada formulario
  (cada uno tiene su unión propia). Efecto conocido: React 19 restablece los campos no controlados
  de un `<form action>` al terminar la acción a su `defaultValue`; en el login, el nombre de usuario
  vuelve al del estado anterior. Aceptable: la persona no puede reenviar de todos modos.
- **Censo.** Todo `useActionState` de `app/`, `components/` y `hooks/` pasa por el envoltorio. La
  guardia de T11 lo hace cumplir: ningún archivo salvo el envoltorio importa `useActionState` de
  `react`. Las Server Actions que se invocan **fuera** de `useActionState` (llamada directa en un
  manejador o en `startTransition`) **no se han podido contar** —sin `rg` en esta sesión—; T14 las
  censa y les da el mismo trato con `withRateLimitNotice(fn)`, exportado del mismo archivo. Que el
  `Toaster` de `sonner` esté montado en cada zona donde vive un formulario es a verificar en T14
  (el `app/layout.tsx` raíz no lo monta).
- **Lo que esto apuesta, dicho claro:** N6 es código interno del cliente de Next, no una API
  publicada. Si una versión futura cambia la condición o el texto, el envoltorio deja de reconocer
  el freno y el síntoma es la pantalla de error genérica —feo, no inseguro: el freno se sigue
  aplicando en el servidor—. Mitigación, como hizo QC-71 con su propio mecanismo interno: un
  **centinela de versión** en `tests/guards/guard-limite-de-peticiones.test.ts` compara la versión de
  `next` de `package.json` con `16.3.0` (contra la que se leyó N6, con fecha) y falla pidiendo
  repetir la lectura si no coinciden; y el **E2E de R35** ejercita el camino entero en un navegador
  real.
- **Sin JavaScript** (formulario enviado de forma nativa) no hay cabecera `next-action`: la petición
  es una navegación y ve la pantalla de freno. Cumple D4 por el otro lado.

## 6. Cableado en `lib/composition/edge.ts`

```ts
// forma, no código definitivo
export const rateLimitEdge = {
  loginRoute: LOGIN_ROUTE,
  check: (input: { origin: string; bucket: RateLimitBucket }) => Promise<RateLimitVerdict>,
} as const;
```

- **Configuración leída en cada llamada** con `parseRateLimitConfig(process.env)`, como el secreto
  de la sesión: leerla al cargar el módulo rompería el build y congelaría los valores. Los avisos de
  R19 se escriben **una vez por instancia y por valor** (memoria de los ya avisados), para no
  repetir la misma línea en cada petición.
- **Elección del contador** (R25, R26):
  - `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` definidas → adaptador de Upstash, creado
    una vez por instancia y por pareja de credenciales.
  - Falta alguna y **no** es producción → contador en memoria, uno por instancia.
  - Falta alguna y **es** producción → **pregunta abierta 1, sin decidir** (§11, punto 1). «Es
    producción» se lee de `VERCEL_ENV === 'production'`, la variable de sistema de Vercel; **que se
    llame así y tenga ese valor es a verificar en T12**.
- `LOGIN_ROUTE` entra desde `lib/shared/routes` (composición puede importar `lib/shared/**`).

## 7. Cuotas, ventana y espera (D3, D2)

| Variable | Por defecto | Qué es |
|---|---|---|
| `RATE_LIMIT_LOGIN_MAX` | `30` | Peticiones a `/login` por origen y ventana |
| `RATE_LIMIT_LOGIN_WINDOW_SECONDS` | `600` | Ventana del login (10 min) |
| `RATE_LIMIT_GENERAL_MAX` | `600` | Resto de peticiones por origen y ventana |
| `RATE_LIMIT_GENERAL_WINDOW_SECONDS` | `60` | Ventana general (1 min) |
| `RATE_LIMIT_TIMEOUT_MS` | `500` | Espera máxima al contador antes de dejar pasar |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | — | Credenciales; las inyecta la integración de Vercel (ficha) |

Por qué esos números:

- **Login 30 / 10 min** es el orden de magnitud que fijó D3. Una oficina entera detrás de una IP son
  30 aperturas de la pantalla o intentos en 10 minutos; el bloqueo de cuenta sigue cortando a los 5
  fallos por usuario. Frente a un atacante: 30 intentos cada 10 minutos por IP son ~4.300 al día,
  contra los ~785.000 que permite hoy una sola IP a ~110 ms de bcrypt por intento (ficha).
  Ojo: **cuenta la petición, no el fallo**, así que abrir `/login` también consume.
- **General 600 / 1 min** son «cientos por minuto» (D3). Una navegación del ERP con precargas del
  menú es del orden de una decena de peticiones; 600 deja margen a unas veinte personas activas tras
  la misma IP. **No está medido**: el consumo real es parte de lo que mide T17.
- **R20 se cumple con holgura**: 30/600 s = 0,05 pet/s frente a 600/60 s = 10 pet/s.
- **Espera 500 ms**: el techo de lo que una persona tolera añadido a una navegación sin percibirlo
  como cuelgue. **No hay referencia medida** (D6 lo reconoce); se ajusta por variable.
- **«Sin desplegar código»**: en Vercel una variable de entorno nueva se aplica en el siguiente
  despliegue, que puede ser un *redeploy* del mismo commit. Es lo que D3 pide —no cambia código—;
  **que haga falta ese redeploy es conocimiento de la plataforma no verificado aquí** (T12).

**Ventana fija, no deslizante.** Ver alternativa 10.f.

## 8. El E2E (D8, R35) y por qué no rompe el resto de la batería

El problema: la batería E2E entera (dos navegadores, en paralelo) sale del **mismo** origen local y
entra al login muchas veces. Con 30 por 10 minutos, **el propio límite frenaría los E2E que ya
existen**. Y no se puede levantar un segundo `next dev` con otra configuración (N9).

Decisión:

1. `playwright.config.ts > webServer.env` fija `RATE_LIMIT_LOGIN_MAX` a un valor **N_e2e** alto y
   sin credenciales de Upstash (contador en memoria, D8). N_e2e lo fija T15 **contando** los logins
   de la batería por navegador, con margen; no se inventa aquí. El valor vive en una constante del
   propio `playwright.config.ts` que el spec importa, para que no haya dos números.
2. `e2e/rate-limit.spec.ts` usa **su propio origen**:
   `test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.73' } })` (rango de
   documentación, RFC 5737). Un navegador distinto por proyecto → un origen distinto por proyecto,
   para que Chromium y WebKit no se roben la cuota en paralelo.
3. El spec abre `/login` (1), **gasta** el resto de la cuota con `page.request.get('/login')` hasta
   N_e2e —peticiones baratas que llevan la misma cabecera del contexto—, envía el formulario con
   credenciales cualesquiera y afirma que aparece el mensaje neutro **en la pantalla de login**
   (R11); luego navega a `/login` y afirma el estado 429 y el mensaje en la pantalla de freno (R10).

Depende de dos cosas **no verificadas** que T12 comprueba antes de escribir el spec: que el estado del
contador en memoria **sobrevive entre peticiones** en el middleware de `next dev`, y que la
`x-forwarded-for` enviada por Playwright llega al middleware como primera entrada.

## 9. Dependencias nuevas (regla 7)

**Qué nos ahorran.** `@upstash/redis` es el cliente **REST** de Upstash: habla por `fetch`, que es lo
único que el borde tiene (N2) y lo que permite que el contador viva en el middleware sin abrir un
socket TCP. `@upstash/ratelimit` trae la ventana fija contra Redis de forma atómica (un script en el
servidor, sin carreras entre instancias) y la **caché en memoria de orígenes bloqueados** que D5
exige. Hacerlo a mano sería escribir y probar la atomicidad del contador contra Redis y esa caché;
el adaptador en memoria sí es nuestro porque la librería no trae backend en memoria (**a verificar
en T1**).

**Los cuatro checks.** Los de la ficha son del **2026-09-07 y están caducados** (D7). **En esta
sesión no hay red**, así que no se han vuelto a verificar: los repite el leader en F1.4 y rellena la
última columna. Las cifras de la izquierda son las de la ficha, puestas solo como referencia.

| Paquete | Dato de la ficha (2026-09-07, caducado) | 1 · sin `deprecated` | 2 · release < 12 meses | 3 · ≥ 10.000 desc./sem. | 4 · licencia | Verificado en F1.4 |
|---|---|---|---|---|---|---|
| `@upstash/ratelimit` | `2.0.8`, 2026-01-12, 1.683.065/sem, MIT | pendiente | pendiente | pendiente | pendiente | **pendiente (leader)** |
| `@upstash/redis` | `1.38.4`, 2026-09-04, 4.532.523/sem, MIT | pendiente | pendiente | pendiente | pendiente | **pendiente (leader)** |

- Transitivas según la ficha: `@upstash/core-analytics` y `uncrypto`. No llevan fila (la guardia
  compara solo las directas). **`uncrypto` es el nombre que hay que mirar**: su trabajo es elegir
  entre la `crypto` global y la de Node; que en el bundle del borde elija la global es a verificar en
  T1 con `pnpm build` —si no, el build del middleware falla y la ficha se para—.
- **Aislamiento:** solo `upstash-rate-limiter.ts` las importa (R31), con guardia. Sustituirlas es
  reescribir ese archivo.
- **Multiplataforma:** no aplica; corren en el servidor.
- Las filas de `docs/dependencias.md` las escribe el leader al aprobar el spec, como en QC-25 y QC-55.

**Lo que T1 verifica en el paquete publicado antes de escribir el adaptador** (hoy es memoria, no
dato): `Ratelimit.fixedWindow(max, '<n> s')`; la opción de caché en memoria (`ephemeralCache`,
recibe un `Map`); la opción `timeout` de la librería y qué devuelve al vencer —este diseño **no**
depende de ella: la espera máxima la impone nuestro dominio (10.e)—; que `limit(key)` devuelve
`{ success, reason? }`; y que `analytics` puede apagarse. Si alguna no existe, T1 para y lo sube.

## 10. Alternativas descartadas

**10.a — Limitar en cada Server Action en vez de en el middleware.** Deja fuera la navegación (D1),
reparte el mismo código por diez módulos y lo pone *después* del trabajo caro: la acción ya abrió la
sesión, consultó la base o pagó bcrypt. El Alcance fija el middleware.

**10.b — Contestar a una Server Action frenada con una redirección o con la pantalla HTML.** Por N6
el cliente lo convierte en «An unexpected response was received from the server.» y, por N7, en la
pantalla de error genérica. Incumple D4 y además enseña un mensaje en inglés.

**10.c — Dejar pasar la Server Action marcada con una cabecera y que la acción devuelva un estado
de error tipado.** Sería lo más limpio en el cliente, pero la acción **se ejecutaría**: cada una
tendría que leer la cabecera antes de hacer nada, en ~20 acciones y diez módulos, y una que se
olvidara quedaría sin freno. Convierte un límite central en veinte límites que hay que recordar.

**10.d — Reescribir (`rewrite`) la navegación frenada a una página de la aplicación.** Pintaría el
freno con el tema y las fuentes de la aplicación, pero no se ha verificado qué estado HTTP sale de
un `rewrite` a una página de App Router, y la página renderizaría el layout raíz —que lee cookies—
para una petición que se acaba de frenar precisamente por abuso. La pantalla es HTML en línea,
mínima y sin E/S.

**10.e — Confiar la espera máxima a la opción `timeout` de `@upstash/ratelimit`.** Por lo que se
recuerda de la librería, al vencer deja pasar **en silencio**, y D2 exige aviso. Además dejaría el
fallo abierto sin prueba posible sin red. Se implementa en el dominio (`Promise.race` con un
temporizador), probado con temporizadores falsos contra un contador que no contesta.

**10.f — Ventana deslizante.** Más justa en los bordes de la ventana (con ventana fija, un origen
puede colar hasta el doble a caballo entre dos ventanas), pero cuesta más trabajo por petición en
Redis y D5 pide ahorrar comandos. Con el bloqueo de cuenta detrás, 60 intentos de login en el peor
caso siguen siendo del mismo orden. Además la ventana fija es trivial de reproducir en memoria con
la misma semántica (R27).

**10.g — Un segundo `webServer` de Playwright con cuotas bajas para el E2E.** Aislaría el spec sin
tocar cuotas, pero N9 impide dos `next dev` sobre el mismo proyecto.

**10.h — Tomar la ÚLTIMA entrada de `x-forwarded-for`.** Más difícil de falsear detrás de un proxy
que añade; en Vercel da lo mismo si sobrescribe, y rompería el aislamiento del E2E (§8).

## 11. Para decidir al aprobar

No se resuelven aquí. Ninguna reabre una decisión cerrada; son lo que las decisiones dejan sin fijar.

1. **Pregunta abierta 1 — producción sin credenciales.** El diseño deja una sola rama para ello
   (§6). Las dos opciones de la pregunta: (a) tratarlo como «Upstash no responde»: se deja pasar y se
   avisa —coherente con D2, pero el límite no existe hasta que haya cuenta—; (b) que el despliegue
   falle —el límite no puede faltar sin que se note, pero sin cuenta **ningún** despliegue de
   producción sale—. Hay que decidir también qué cuenta como producción (propuesta:
   `VERCEL_ENV === 'production'`; los *preview* irían al contador en memoria). **Hasta que se
   decida, T9 no puede cerrarse.**
2. **D4, «en el formulario».** Este diseño lo lee como «sin salir de la pantalla del formulario» y lo
   pinta con un **toast** sobre él, igual que ya hace el login. Si D4 quería el mensaje **dentro**
   del formulario (una región bajo los campos), cada formulario tiene que pintar esa región: más
   archivos en T14, mismo mecanismo en §5.
3. **D1 incluye las precargas.** Next 16 hace más peticiones de precarga, más pequeñas
   (`version-16.md:571-578`), y cada una cuenta y es un comando en Upstash. Excluirlas solo se puede
   en el `matcher` (con `missing` sobre `next-router-prefetch`), que vive en `middleware.ts`, que D9
   deja congelado. Se aceptan como cuentan hoy; entran en la medición de consumo de la pregunta 2.
4. **El E2E sube la cuota de login de toda la batería E2E** a N_e2e (§8), y el spec gasta N_e2e
   peticiones para llegar al freno. Si N_e2e sale muy alto, el spec se alarga.
5. **Fuera de Vercel, el origen se puede falsear** enviando `x-forwarded-for`. Con Vercel como único
   despliegue soportado no aplica, pero un despliegue en otro sitio dejaría el límite por origen sin
   efecto real. Además, que Vercel **sobrescriba** la cabecera está sin verificar (T12).
6. **D6 depende de la pregunta 1.** Sin cuenta de Upstash no hay latencia que medir contra Upstash.
   Si al abrir el PR no hay cuenta, T17 solo puede anotar la medición en memoria y decir que la de
   Upstash falta: ¿se acepta así el PR?
7. **IPv6.** Cada dirección cuenta por separado, así que quien tiene un `/64` tiene cuota casi
   infinita. Agruparlas es una decisión aparte.
8. **`/establecer-contrasena`** (enlace con secreto, QC-79) cae en la cuota **general**. Si se quiere
   la de login, es una línea en `selectBucket`, pero no está decidido.
9. **Upstash guardará las IP** como claves, con caducidad igual a la ventana. Es un dato personal en
   un tercero. No se cifran ni se resumen: resumir una IPv4 sin secreto no protege (2³² valores).

## 12. Datos, rutas y contratos

- **Modelo de datos: ninguno.** Ni tabla, ni migración, ni `down.sql`, ni RLS. `db/` no se toca.
- **Rutas nuevas: ninguna.** No hay route handler ni página nueva; el `matcher` no cambia (R29).
- **Contrato del borde:** una respuesta nueva, 429, en dos formas (§4). El resto de respuestas del
  middleware no cambia.
- **Contrato del cliente:** `useRateLimitedActionState` con la misma firma que `useActionState`, y
  `withRateLimitNotice` para las llamadas directas.
- **Documentación:** `docs/architecture.md > Stack` dice «Integraciones externas: ninguna definida
  todavía»; Upstash es la primera y se documenta allí. `> Permisos y autenticación` debe decir que
  el middleware ya hace una E/S (el contador).

## 13. Archivos que se tocan

**Nuevos**

- `lib/modules/rate-limit/index.ts`
- `lib/modules/rate-limit/domain/request-origin.ts`
- `lib/modules/rate-limit/domain/rate-limit-bucket.ts`
- `lib/modules/rate-limit/domain/rate-limit-config.ts`
- `lib/modules/rate-limit/domain/check-request-rate.ts`
- `lib/modules/rate-limit/domain/rate-limited-response.ts`
- `lib/modules/rate-limit/ports/rate-limiter.ts`
- `lib/modules/rate-limit/adapters/driven/in-memory-rate-limiter.ts`
- `lib/modules/rate-limit/adapters/driven/upstash-rate-limiter.ts`
- `hooks/use-rate-limited-action-state.ts`
- `scripts/measure-rate-limit-latency.ts`
- `e2e/rate-limit.spec.ts`
- `tests/unit/rate-limit/*.test.ts` (los de `tasks.md > Trazabilidad`)
- `tests/unit/identity/route-guard-rate-limit.test.ts`
- `tests/unit/composition/rate-limit-edge-wiring.test.ts`
- `tests/unit/hooks/use-rate-limited-action-state.test.tsx`
- `tests/unit/scripts/measure-rate-limit-latency.test.ts`
- `tests/guards/guard-limite-de-peticiones.test.ts`

**Modificados**

- `lib/composition/edge.ts`
- `lib/modules/identity/adapters/driving/route-guard-middleware.ts`
- `app/(public)/login/components/login-form.tsx` y **cada** archivo cliente con `useActionState` o
  llamada directa a una Server Action (lista exacta: T14; hoy desconocida)
- el layout de cada zona que no monte el `Toaster` (T14; hoy desconocido)
- `tests/guards/guard-middleware-edge.test.ts` (solo **añade** aserciones de alcance; no quita nada)
- `playwright.config.ts` (`webServer.env`)
- `package.json`, `pnpm-lock.yaml`
- `docs/dependencias.md` (leader, F1.4), `docs/architecture.md`
- `.env.example`, **si existe** (no se comprobó)

**No se tocan:** `middleware.ts`, `db/**`, `lib/modules/identity/domain/account-lock.ts`.
El leader comprueba en F2.0 que ninguna feature `in_progress` declara `route-guard-middleware.ts`,
`lib/composition/edge.ts` ni los formularios del censo.

## 14. Riesgos declarados por adelantado

- **N6 es interno de Next** (§5): centinela de versión + E2E.
- **El contenido-tipo exacto en producción.** Que Vercel no añada `;charset=…` a la respuesta del
  middleware es desconocido. Si lo añade, el formulario enseña la pantalla de error genérica. Se
  comprueba en el despliegue de preview de T12; sin cuenta de Upstash se puede probar igual con el
  contador en memoria y una cuota baja.
- **Una llamada de red por petición en el borde**, que hoy no hace ninguna. Acotada por la espera
  máxima y medida en T17.
- **Avisos en ráfaga si Upstash cae:** una línea por petición mientras dure la caída. Se acepta: es
  una caída y tiene que verse.
- **Los tests existentes del middleware** usan el contador en memoria (sin credenciales en el gate)
  y un origen «desconocido» común. Si alguno supera 30 peticiones a `/login` en un archivo, se
  frenará; T10 lo detecta y sube la cuota en ese test con `vi.stubEnv`, que funciona porque la
  configuración se lee en cada llamada.
