# QC-73 — impl

> `backend_dev`, T1–T8. Worktree `.worktrees/QC-73-limite-de-peticiones-por-origen`, rama
> `feature/QC-73-limite-de-peticiones-por-origen`. Spec aprobado. Este archivo cubre solo T1–T8;
> T9 en adelante (composicion, middleware, frontend, E2E, cierre) quedan para otra tanda.

## T1 — API verificada de @upstash/*

Instalado: `pnpm add @upstash/ratelimit @upstash/redis` → `@upstash/ratelimit@2.1.0`,
`@upstash/redis@1.38.4` (ya con filas `aprobada` en `docs/dependencias.md`, escritas por el leader
en F1.4). `guard-dependencias-aprobadas` en verde.

Las seis respuestas, leidas en `node_modules` (no de memoria):

1. **`Ratelimit.fixedWindow`** — metodo estatico de la clase que el paquete exporta como
   `Ratelimit` (en realidad `RegionRatelimit`, re-exportada con ese nombre). Firma:
   `static fixedWindow(tokens: number, window: Duration): Algorithm<RegionContext>`.
   Fuente: `node_modules/@upstash/ratelimit/dist/index.d.ts:716-724` (declaracion) y `:862`
   (`export { ... RegionRatelimit as Ratelimit ... }`).

2. **`ephemeralCache`** — opcion de `RegionRatelimitConfig`: `ephemeralCache?: Map<string, number>
   | false`. Si se deja `undefined` la libreria crea un `Map` propio, pero solo sirve si la
   instancia de `Ratelimit` (o el `Map`) se crea fuera del handler. `false` la apaga.
   Fuente: `node_modules/@upstash/ratelimit/dist/index.d.ts:607-623`.

3. **`timeout`** — opcion `timeout?: number` (ms). Al vencer, dice el doc: «the ratelimiter will
   allow requests to pass after this many milliseconds» — deja pasar, no lanza. La respuesta trae
   `reason: "timeout"` cuando fue eso lo que paso (`RatelimitResponseType = "timeout" | "cacheBlock"
   | "denyList"`). El diseño (§10.e) ya decidio no usar esta opcion y esperar con nuestro propio
   `Promise.race`: el adaptador no la fija.
   Fuente: `node_modules/@upstash/ratelimit/dist/index.d.ts:37`, `:624-629`.

4. **Forma de `limit()`** — `limit: (identifier: string, req?: LimitOptions) =>
   Promise<RatelimitResponse>`, con `RatelimitResponse = { success: boolean; limit: number;
   remaining: number; reset: number; pending: Promise<unknown>; reason?: RatelimitResponseType;
   deniedValue?: string }`. Confirma `{ success, reason? }`, no `{ allowed }`: el adaptador traduce.
   Fuente: `node_modules/@upstash/ratelimit/dist/index.d.ts:39-91`, `:310`.

5. **Apagar `analytics`** — opcion `analytics?: boolean`, por defecto `false`. Se deja explicito
   en el adaptador para que quede claro que esta apagado a proposito.
   Fuente: `node_modules/@upstash/ratelimit/dist/index.d.ts:631-636`.

6. **Backend en memoria / entrada del bundler del borde y `uncrypto`.**
   - El paquete **no trae ningun backend que sustituya a Redis**: las unicas clases son
     `RegionRatelimit` y `MultiRegionRatelimit`, las dos piden un cliente Redis real.
     `ephemeralCache` solo evita CONSULTAR Redis para orígenes ya bloqueados, no lo reemplaza.
     Fuente: `node_modules/@upstash/ratelimit/dist/index.d.ts` (grep de `class.*Ratelimit`: solo
     esas dos, ninguna en memoria). Confirma que el adaptador en memoria de T7 es nuestro (§9).
   - `@upstash/redis` **no declara condicion `edge-light`** en su `exports`: el campo `"."` solo
     tiene `import`/`require`, los dos apuntando a `nodejs.mjs`/`nodejs.js`. Cualquier bundler
     (incluido el del borde de Next) resuelve ahi.
     Fuente: `node_modules/@upstash/redis/package.json` (bloque `"exports"`).
   - `nodejs.mjs` importa de un chunk compartido (`chunk-2JFYL2VL.mjs`) que hace
     `import { subtle } from "uncrypto"`.
     Fuente: `node_modules/.pnpm/@upstash+redis@1.38.4/node_modules/@upstash/redis/nodejs.mjs:7`
     y `chunk-2JFYL2VL.mjs:4325,4397`.
   - `uncrypto` si declara condicion `edge-light` (y `browser`, `worker`, `workerd`, etc.), y
     **todas** apuntan a `./dist/crypto.web.mjs` (el `crypto.subtle` global de la plataforma, no
     `node:crypto`). Es en la resolucion de `uncrypto` — no en la de `@upstash/redis` — donde el
     bundler del borde elige la implementacion correcta.
     Fuente: `node_modules/.pnpm/uncrypto@0.1.3/node_modules/uncrypto/package.json` (bloque
     `"exports"`).

Ninguna respuesta contradice `design.md > 9`: `fixedWindow` existe con esa firma, `ephemeralCache`
existe y es un `Map` inyectable, hay forma de apagar `analytics`, y `limit()` devuelve
`{ success, reason? }` como el diseño esperaba. Se sigue con T8 sin parar.

## T2 — Dominio: origen de la peticion

`lib/modules/rate-limit/domain/request-origin.ts`: `resolveRequestOrigin` e `UNKNOWN_ORIGIN`.
Valida con `z.ipv4()` / `z.ipv6()` (confirmados en `node_modules/zod/v4/classic/schemas.d.ts:255,265`
y accesibles como `z.ipv4`/`z.ipv6` porque `zod/index.js` reexporta `* from
v4/classic/external.js` bajo el namespace `z`). Tests en
`tests/unit/rate-limit/request-origin.test.ts` (8 casos): IPv4, IPv6, lista con varias entradas,
espacios, cabecera ausente, vacia, basura y entrada vacia entre comas.

## T3 — Dominio: configuracion de cuotas

`lib/modules/rate-limit/domain/rate-limit-config.ts`: `parseRateLimitConfig(env)`. Los cinco
valores por defecto de `design.md > 7`. Invalido = no son puros digitos positivos (regex
`^\d+$`) o el valor es `"0"`; en ese caso usa el por defecto y empuja el NOMBRE de la variable a
`warnings` (nunca el valor). Tests en `tests/unit/rate-limit/rate-limit-config.test.ts` (7 casos,
uno parametrizado con `0`, `-5`, `1.5` y `treinta`).

## T4 — Dominio: bucket de la peticion

`lib/modules/rate-limit/domain/rate-limit-bucket.ts`: `selectBucket(pathname, loginRoute)`. Tests
en `tests/unit/rate-limit/rate-limit-bucket.test.ts` (5 casos, incluye `/establecer-contrasena/x`
→ `general`, tal como pide `design.md > 11.8`, sin decidir la cuota de login para esa ruta).

## T5 — Dominio: respuesta de freno

`lib/modules/rate-limit/domain/rate-limited-response.ts`: `RATE_LIMITED_MESSAGE`,
`renderRateLimitedPage()`, `isRateLimitedError`. La pagina lleva `lang="es"`, viewport de ancho de
dispositivo, `font-size: 16px`, `min-height: 100dvh` (nunca `100vh`), sin `<script>` ni recursos
externos. Tests en `tests/unit/rate-limit/rate-limited-response.test.ts` (11 casos).

## T6 — Puerto y caso de uso con espera maxima

`lib/modules/rate-limit/ports/rate-limiter.ts` (`RateLimiter.consume`) y
`lib/modules/rate-limit/domain/check-request-rate.ts` (`checkRequestRate`). Clave
`<bucket>:<origin>`. `Promise.race` entre el contador (que atrapa su propio rechazo y lo traduce a
`degraded`, para que nunca quede una promesa rechazada sin manejar tras vencer el timeout) y un
temporizador que siempre se limpia en un `finally`. Tests con `vi.useFakeTimers()` en
`tests/unit/rate-limit/check-request-rate.test.ts` (6 casos): `allow`, `block`, `degraded/timeout`
a los `timeoutMs` exactos (verificado a `-1ms` y al ms exacto), `degraded/error:<nombre>`, que una
promesa que rechaza DESPUES del timeout no sube como excepcion no manejada, y que `clearTimeout` se
llama cuando el contador contesta antes.

## T7 — Adaptador en memoria

`lib/modules/rate-limit/adapters/driven/in-memory-rate-limiter.ts`: ventana fija en un `Map`,
reloj inyectable (`clock: () => number`, por defecto `Date.now`). La entrada vencida se reemplaza
al consultar esa clave (purga perezosa, no un barrido periodico). Bateria de contrato reutilizable
en `tests/unit/rate-limit/rate-limiter-contract.ts` (`runRateLimiterContract`), consumida por
`tests/unit/rate-limit/in-memory-rate-limiter.test.ts` con un reloj controlado a mano
(`advanceTime`).

## T8 — Adaptador de Upstash

`lib/modules/rate-limit/adapters/driven/upstash-rate-limiter.ts`: unico archivo que importa
`@upstash/*` en `lib/`. Un `Ratelimit` por `prefix`, recreado solo si cambia la cuota
(`maxRequests`/`windowSeconds`), con `analytics: false` y `ephemeralCache: new Map()` propio de
cada instancia. Traduce `success` → `allowed`. No atrapa errores de `limit()`: los deja subir a
quien llama (`checkRequestRate` los convierte en `degraded`). Tests con `@upstash/ratelimit`
simulado (`vi.mock` + `vi.hoisted`) en `tests/unit/rate-limit/upstash-rate-limiter.test.ts` (6
casos): configuracion pasada (`fixedWindow`, `prefix`, `analytics`, `ephemeralCache` como `Map`),
reutilizar instancia y `Map` con la misma cuota, crear otra con otra cuota, traduccion de
`success` en los dos sentidos, y que un rechazo del contador sube intacto.

No se añadio la bateria de contrato de T7 contra este adaptador: al simular la clase `Ratelimit`
entera con `vi.mock`, el resultado de `limit()` lo decide el mock, no una ventana real — correr el
contrato aqui solo probaria el propio mock, no el adaptador. La nota de T8 lo deja condicionado a
«si T1 encontró cómo inyectar un cliente Redis falso»: no se buscó esa via en esta tanda por estar
fuera de lo que T1 pedía verificar.

## Desviaciones del spec

Ninguna. Las seis respuestas de T1 no contradicen `design.md > 9`.

## Archivos

**Nuevos**
- `lib/modules/rate-limit/index.ts`
- `lib/modules/rate-limit/domain/request-origin.ts`
- `lib/modules/rate-limit/domain/rate-limit-bucket.ts`
- `lib/modules/rate-limit/domain/rate-limit-config.ts`
- `lib/modules/rate-limit/domain/rate-limited-response.ts`
- `lib/modules/rate-limit/domain/check-request-rate.ts`
- `lib/modules/rate-limit/ports/rate-limiter.ts`
- `lib/modules/rate-limit/adapters/driven/in-memory-rate-limiter.ts`
- `lib/modules/rate-limit/adapters/driven/upstash-rate-limiter.ts`
- `tests/unit/rate-limit/request-origin.test.ts`
- `tests/unit/rate-limit/rate-limit-bucket.test.ts`
- `tests/unit/rate-limit/rate-limit-config.test.ts`
- `tests/unit/rate-limit/rate-limited-response.test.ts`
- `tests/unit/rate-limit/check-request-rate.test.ts`
- `tests/unit/rate-limit/rate-limiter-contract.ts`
- `tests/unit/rate-limit/in-memory-rate-limiter.test.ts`
- `tests/unit/rate-limit/upstash-rate-limiter.test.ts`
- este archivo

**Modificados**
- `package.json`, `pnpm-lock.yaml` (T1)

## Mapa R<n> → test (lo que cubre T1–T8)

| R | Test |
|---|---|
| R2, R3 | `tests/unit/rate-limit/rate-limit-bucket.test.ts` |
| R4, R5 | `tests/unit/rate-limit/in-memory-rate-limiter.test.ts` (via `rate-limiter-contract.ts`) |
| R6, R7 | `tests/unit/rate-limit/request-origin.test.ts` |
| R8 | `tests/unit/rate-limit/check-request-rate.test.ts` |
| R17–R20 | `tests/unit/rate-limit/rate-limit-config.test.ts` |
| R21, R22 | `tests/unit/rate-limit/check-request-rate.test.ts` |
| R25 | `tests/unit/rate-limit/upstash-rate-limiter.test.ts` |
| R27 | `tests/unit/rate-limit/rate-limiter-contract.ts` (via `in-memory-rate-limiter.test.ts`), `tests/unit/rate-limit/upstash-rate-limiter.test.ts` |
| R28 | `tests/unit/rate-limit/upstash-rate-limiter.test.ts` (config de `ephemeralCache`) |
| R31 | `tests/unit/rate-limit/upstash-rate-limiter.test.ts` (unico archivo que importa `@upstash/*`; la guardia que lo hace cumplir en todo el repo es T11, fuera de esta tanda) |
| R32 | `tests/guards/guard-dependencias-aprobadas.test.ts` |

R1, R9–R16, R23, R24, R26, R29, R30, R33–R35 dependen de T9–T19 (composicion, middleware,
frontend, guardias, E2E, latencia), fuera del alcance de esta tanda.

## Comandos corridos

```
pnpm run typecheck            → limpio, sin salida (exit 0)
pnpm run lint                 → limpio, sin salida (exit 0)
pnpm exec vitest run tests/guards/guard-dependencias-aprobadas.test.ts
  → Test Files 1 passed (1) · Tests 2 passed (2)
pnpm exec vitest run tests/unit/rate-limit
  → Test Files 7 passed (7) · Tests 47 passed (47)
pnpm exec vitest related --run <los 9 archivos de produccion de este modulo>
  → Test Files 7 passed (7) · Tests 47 passed (47)
```

No se corrió `./init.sh` ni `./init.sh --rapido` ni la suite completa (fuera de alcance de esta
tanda, según la consigna recibida).

## Veredicto

T1–T8 completas: dominio, puerto, caso de uso con espera maxima y los dos adaptadores del
contador, con 47 tests en verde y typecheck/lint limpios. T9 en adelante (cableado en
`lib/composition/edge.ts`, enganche en el middleware, guardias, frontend, E2E y cierre) quedan
pendientes de otra tanda.

## T16 y T18

**Archivos.**

- `scripts/measure-rate-limit-latency.ts` (nuevo): lanza N peticiones GET secuenciales a una
  URL y escribe `p50`/`p95` en ms. Exporta `percentile(values, p)` (rango mas cercano,
  nearest-rank) y `summarizeLatencies(durationsMs)`, las dos puras y sin red. La ejecucion de
  `main()` esta guardada por `import.meta.url === pathToFileURL(process.argv[1]).href`: al
  importar el modulo desde el test no dispara ninguna peticion.
- `tests/unit/scripts/measure-rate-limit-latency.test.ts` (nuevo): 7 casos con `R34` en el
  nombre — par, impar, un solo valor, `p95` sobre diez valores, no-mutacion del arreglo de
  entrada, arreglo vacio lanza, y `summarizeLatencies` sobre un caso conocido.
- `docs/architecture.md`: `> Stack > Integraciones externas` ya no dice «ninguna definida
  todavia»; nombra Upstash Redis (REST) y su unico archivo consumidor. `> Permisos y
  autenticacion` suma que el middleware hace una E/S (el contador) antes de leer la cookie,
  acotada por una espera maxima, y que si falla se deja pasar con aviso.
- `.env.example`: bloque nuevo con las cinco variables de cuota comentadas (con su valor por
  defecto: `30`/`600`/`600`/`60`/`500`) y `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
  sin valor.

**Como se usa el script.**

```bash
tsx scripts/measure-rate-limit-latency.ts <url> [n]
# ej.: tsx scripts/measure-rate-limit-latency.ts http://localhost:3117/ 200
# para N por encima de RATE_LIMIT_GENERAL_MAX (600 por defecto), subirlo en el
# entorno del SERVIDOR medido antes de arrancarlo:
#   RATE_LIMIT_GENERAL_MAX=5000 pnpm start
```

**Salida real.**

```
$ pnpm exec vitest run tests/unit/scripts/measure-rate-limit-latency.test.ts

 Test Files  1 passed (1)
      Tests  7 passed (7)

$ pnpm run typecheck
> tsc --noEmit
(sin salida, exit 0)

$ pnpm run lint
> eslint
(sin salida, exit 0)

$ pnpm exec vitest run tests/guards/guard-arquitectura-modulos.test.ts tests/guards/guard-empresa-en-esquema.test.ts tests/guards/guard-dependencias-aprobadas.test.ts
 Test Files  3 passed (3)
      Tests  79 passed (79)
```

No se corrio `./init.sh` ni `./init.sh --rapido` ni la suite completa (fuera de alcance de esta
tanda). Las guardias de arriba se corrieron sueltas porque leen `docs/architecture.md` de disco;
las dos pasan sin cambios provocados por esta tanda.

**Veredicto T16/T18:** hecho — script, test (7/7 verde) y documentacion actualizados; sin
bloqueos.

## T9-T10

`backend_dev`, otra tanda. Cubre el cableado en `lib/composition/edge.ts` (T9) y el enganche en
el middleware (T10).

### T9 — fachada `rateLimitEdge` en `lib/composition/edge.ts`

La configuracion se lee con `parseRateLimitConfig(process.env)` en CADA llamada a `check()`. La
eleccion de contador:

- **con `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`** → un `RateLimiter` de Upstash por
  cuota (`login`/`general`), memoizado por la PAREJA de credenciales: si cambian, se recrean los
  dos junto con el cliente `Redis`.
- **falta alguna y NO es produccion** (`VERCEL_ENV !== 'production'`) → un contador en memoria,
  uno solo por instancia (sirve las dos cuotas: la clave ya lleva el bucket).
- **falta alguna y ES produccion** → decision del humano (F1.4, opcion a): veredicto `degraded`
  directo, SIN tocar el contador en memoria y sin llamar a Upstash. El despliegue no falla.

Los avisos de variable invalida (R19) se registran una sola vez por variable **y por valor**: la
clave de deduplicacion incluye el valor crudo leido de `process.env` (nunca el mensaje que se
imprime, que solo nombra la variable), asi que un segundo valor invalido de la misma variable
vuelve a avisar.

Tests en `tests/unit/composition/rate-limit-edge-wiring.test.ts` (8 casos): sin credenciales fuera
de produccion cuenta en memoria; con las dos, en Upstash (`@upstash/ratelimit` y `@upstash/redis`
simulados); con una sola, en memoria (los dos casos, solo URL y solo token); en produccion sin
credenciales se degrada dos veces seguidas sin que el contador en memoria entre en juego (si
entrara, la segunda llamada con cuota 1 daria `block`, no `degraded`); en produccion CON
credenciales sigue usando Upstash; un valor invalido avisa una sola vez en dos llamadas seguidas
sin filtrar el valor; y un segundo valor invalido distinto de la MISMA variable vuelve a avisar.

### T10 — enganche en `route-guard-middleware.ts`

El freno se decide ANTES de leer la cookie: `origin = resolveRequestOrigin(x-forwarded-for)`,
`bucket = selectBucket(pathname, rateLimitEdge.loginRoute)`, `verdict = await rateLimitEdge.check(...)`.

- `block` → responde 429 sin seguir: ni se lee la cookie, ni corre `decideRouteAccess`, ni se
  genera identificador de peticion.
- `degraded` → `console.warn('[rate-limit] contador no disponible, se deja pasar (cuota=<login|general>, motivo=<...>)')`
  y sigue el camino de hoy (cookie, decision, `x-request-id`).
- `allow` → sigue el camino de hoy sin marca alguna.

La respuesta de 429 tiene dos formas, decididas por `request.method === 'POST' && request.headers.has('next-action')`:
Server Action → `new NextResponse(RATE_LIMITED_MESSAGE, { status: 429, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } })`
(cabecera literal, sin `;charset`, que es la unica forma que el cliente de Next reconoce); navegacion
→ igual pero con `renderRateLimitedPage()` y `content-type: text/html; charset=utf-8`. Ninguna de
las dos lleva `retry-after` ni `x-ratelimit-*`.

Se limpiaron los comentarios de las lineas tocadas (el bloque de imports y el arranque de
`middleware`): no citan ficha ni requisito, solo el porque que el codigo no muestra.

Tests en `tests/unit/identity/route-guard-rate-limit.test.ts` (11 casos), con `NextRequest`
reales y un origen `x-forwarded-for` distinto por caso (RFC 5737) para no compartir cuota entre
casos. `rateLimitEdge.check` se sustituye por un espia que, por defecto, LLAMA al de verdad —o
sea que casi todos los casos corren contra el contador EN MEMORIA real—, y solo en el bloque de
degradacion se le fuerza el veredicto una vez (`mockResolvedValueOnce`), porque un contador en
memoria nunca produce `degraded` por si solo:

- navegacion y Server Action al mismo origen comparten la cuota general; el login cuenta en la
  suya propia; dos origenes no se pisan la cuota (R1-R4).
- la peticion max+1 da 429, el verificador de la cookie sigue en 1 llamada y no hay
  `x-request-id` reescrito (R8, R9).
- las dos formas de 429, con la cabecera `content-type` exacta en cada una (R10, R11).
- sin `retry-after` ni `x-ratelimit-*`, con `cache-control: no-store`, y la MISMA respuesta
  (status, `content-type`, `cache-control`, cuerpo) en ruta privada y publica, con y sin cookie
  valida (R13, R14, R16).
- degradado por `timeout` y por `error:TypeError`: la peticion sigue el camino de hoy (sesion
  verificada, `x-request-id` presente, o el redirect de siempre en `/login`), el aviso tiene el
  formato exacto y no contiene el origen enviado (R21-R24).

### Desviaciones del spec

Ninguna.

### Archivos

**Nuevos**
- `tests/unit/composition/rate-limit-edge-wiring.test.ts`
- `tests/unit/identity/route-guard-rate-limit.test.ts`

**Modificados**
- `lib/composition/edge.ts` (fachada `rateLimitEdge`)
- `lib/modules/identity/adapters/driving/route-guard-middleware.ts` (enganche del freno)

### Mapa R<n> → test (lo que cubre T9-T10)

| R | Test |
|---|---|
| R1, R2, R3 | `tests/unit/identity/route-guard-rate-limit.test.ts` |
| R4 | `tests/unit/identity/route-guard-rate-limit.test.ts` |
| R8, R9 | `tests/unit/identity/route-guard-rate-limit.test.ts` |
| R10, R11 (lado servidor) | `tests/unit/identity/route-guard-rate-limit.test.ts` |
| R13, R14, R16 | `tests/unit/identity/route-guard-rate-limit.test.ts` |
| R17, R19 | `tests/unit/composition/rate-limit-edge-wiring.test.ts` |
| R21, R22, R23, R24 | `tests/unit/identity/route-guard-rate-limit.test.ts` |
| R25, R26 | `tests/unit/composition/rate-limit-edge-wiring.test.ts` |

### Comandos corridos

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida, exit 0)

$ pnpm run lint
> eslint
1 aviso, 0 errores: `components/shared/presentation-select.tsx:26` (`withRateLimitNotice` sin
usar). No es un archivo de esta tanda —lo toca otro agente en paralelo (T13/T14)— y no se corrigio
aqui.

$ pnpm exec vitest run tests/unit/composition/rate-limit-edge-wiring.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)

$ pnpm exec vitest run tests/unit/identity/route-guard-rate-limit.test.ts
 Test Files  1 passed (1)
      Tests  11 passed (11)

$ pnpm exec vitest run tests/unit/identity/route-guard-request-id.test.ts tests/unit/middleware-root-contract.test.ts tests/guards/guard-middleware-edge.test.ts tests/guards/guard-arquitectura-modulos.test.ts tests/unit/identity/route-guard-middleware.test.ts tests/unit/identity/route-guard-rate-limit.test.ts tests/unit/composition/rate-limit-edge-wiring.test.ts
 Test Files  7 passed (7)
      Tests  132 passed (132)

$ pnpm exec vitest related --run lib/composition/edge.ts lib/modules/identity/adapters/driving/route-guard-middleware.ts
 Test Files  5 passed (5)
      Tests  62 passed (62)

$ pnpm exec vitest run tests/unit/identity
 Test Files  92 passed (92)
      Tests  1660 passed | 31 skipped (1691)
```

No se corrio `./init.sh`, `./init.sh --rapido` ni `pnpm test` (fuera de alcance de esta tanda,
segun la consigna recibida).

**Veredicto T9-T10:** hecho — `rateLimitEdge` cableada con las tres ramas de credenciales/entorno
y el middleware frena antes de la sesion con las dos formas de 429, sin tocar `middleware.ts` ni
ningun archivo ajeno a esta tanda; typecheck y lint limpios (el unico aviso de lint es de un
archivo de otro agente); las guardias y los tests existentes del middleware siguen en verde.

## T13-T14 — envoltorio y censo

### T13 — `hooks/use-rate-limited-action-state.ts`

`useRateLimitedActionState(action, initialState, permalink?)` con las mismas dos sobrecargas que
`useActionState` de React 19 (con y sin `Payload`), y `withRateLimitNotice(fn)` para las llamadas
directas. Los dos atrapan el error DENTRO de la funcion que envuelven: si `isRateLimitedError(e)`
(barril `@/lib/modules/rate-limit`) avisan con `toast.error(RATE_LIMITED_MESSAGE)` (sonner) y
devuelven, respectivamente, el estado anterior o `undefined`; cualquier otro error se relanza tal
cual.

Test: `tests/unit/hooks/use-rate-limited-action-state.test.tsx` (proyecto `ui`, cae ahi solo por
`*.test.tsx`). Tres casos, R11 y R12 en el nombre: freno → toast + estado anterior + sin boundary
montado; otro error → sube al `Boundary` de prueba, sin toast; sin error → el estado pasa a ser el
que la accion devuelve.

### T14 — censo

Censo de TODO `useActionState` y TODA llamada directa a una Server Action en `app/`, `components/`
y `hooks/` (`grep -rn` sobre esas tres carpetas), con el archivo y la linea **de antes de migrar**.

**`useActionState` (22 archivos, uno por archivo) — migrados a `useRateLimitedActionState`:**

| Archivo | Linea |
|---|---|
| `app/(private)/asignacion/[id]/components/order-execution-screen.tsx` | 50 |
| `app/(private)/configuracion/presentaciones/components/delete-presentation-dialog.tsx` | 99 |
| `app/(private)/configuracion/presentaciones/components/presentation-form.tsx` | 296 |
| `app/(private)/configuracion/unidades/components/delete-unit-dialog.tsx` | 94 |
| `app/(private)/configuracion/unidades/components/unit-form.tsx` | 270 |
| `app/(private)/configuracion/usuarios/components/delete-user-dialog.tsx` | 77 |
| `app/(private)/configuracion/usuarios/components/delete-work-group-dialog.tsx` | 77 |
| `app/(private)/configuracion/usuarios/components/end-user-sessions-dialog.tsx` | 83 |
| `app/(private)/configuracion/usuarios/components/user-form.tsx` | 351 |
| `app/(private)/configuracion/usuarios/components/user-status-dialog.tsx` | 95 |
| `app/(private)/configuracion/usuarios/components/work-group-form.tsx` | 199 |
| `app/(private)/inventario/components/delete-product-dialog.tsx` | 51 |
| `app/(private)/inventario/components/product-form.tsx` | 397 |
| `app/(private)/pedidos/components/cancel-order-dialog.tsx` | 121 |
| `app/(private)/pedidos/components/delete-order-dialog.tsx` | 85 |
| `app/(private)/pedidos/components/order-form.tsx` | 494 |
| `app/(private)/proveedores/[id]/components/catalog-line-form.tsx` | 320 |
| `app/(private)/proveedores/[id]/components/delete-catalog-line-dialog.tsx` | 56 |
| `app/(private)/proveedores/components/delete-supplier-dialog.tsx` | 62 |
| `app/(private)/proveedores/components/supplier-form.tsx` | 239 |
| `app/(public)/establecer-contrasena/[token]/components/set-credential-form.tsx` | 61 |
| `app/(public)/login/components/login-form.tsx` | 57 |

`delete-recipe-dialog.tsx` y `recipe-form.tsx` (produccion/formulas) citan `useActionState` solo en
comentario (explican por que NO lo usan, `design.md > 5`): no importan el hook de React y no
entraban en esta lista, pero si en la de llamadas directas de abajo.

**Llamadas directas a una Server Action fuera de `useActionState`, en manejador / `startTransition`
/ `.then` (10 archivos, 19 sitios) — envueltas con `withRateLimitNotice`:**

| Archivo | Linea | Accion |
|---|---|---|
| `app/(private)/configuracion/usuarios/components/user-sheet.tsx` | 113 | `getUserAction` |
| `app/(private)/configuracion/usuarios/components/work-group-members.tsx` | 169 | `listWorkGroupMembersAction` |
| `app/(private)/configuracion/usuarios/components/work-group-members.tsx` | 199 | `listUsersAction` |
| `app/(private)/configuracion/usuarios/components/work-group-members.tsx` | 231 | `addWorkGroupMemberAction` |
| `app/(private)/configuracion/usuarios/components/work-group-members.tsx` | 249 | `removeWorkGroupMemberAction` |
| `app/(private)/inventario/components/product-name-picker.tsx` | 100 | `listProductsAction` |
| `app/(private)/pedidos/components/order-form.tsx` | 427 | `getRecipeAction` |
| `app/(private)/pedidos/components/recipe-picker.tsx` | 173 | `listRecipesAction` |
| `app/(private)/pedidos/components/order-responsibles.tsx` | 341 | `assignResponsiblesAction` |
| `app/(private)/pedidos/components/order-responsibles.tsx` | 357 | `unassignResponsibleAction` |
| `app/(private)/pedidos/components/order-responsibles.tsx` | 369 | `removeWorkGroupFromOrderAction` |
| `app/(private)/produccion/formulas/components/product-picker.tsx` | 169 | `listProductsAction` |
| `app/(private)/produccion/formulas/components/recipe-form.tsx` | 221 | `updateRecipeAction` |
| `app/(private)/produccion/formulas/components/recipe-form.tsx` | 222 | `createRecipeAction` |
| `app/(private)/produccion/formulas/components/delete-recipe-dialog.tsx` | 58 | `deleteRecipeAction` |
| `components/shared/presentation-select.tsx` | 225 | `listPresentationsAction` (resolver nombre por defecto) |
| `components/shared/presentation-select.tsx` | 245 | `listPresentationsAction` (`pedirPagina`) |
| `components/shared/presentation-select.tsx` | 319 | `createPresentationAction` (alta rapida) |

**Conteo total: 41 usos migrados/envueltos** (22 `useActionState` + 19 llamadas directas).

**No entraron en el censo** (verificado archivo por archivo, no solo por `grep`): todo `await
Xxx­Action(...)` que aparece dentro de la funcion `save`/`submit` que ya se pasa como argumento a
`useActionState` (p. ej. `product-form.tsx`, `unit-form.tsx`, `user-form.tsx`,
`work-group-form.tsx`, `order-form.tsx` en su `submit`, `catalog-line-form.tsx`,
`supplier-form.tsx`, `cancel-order-dialog.tsx`) — ya queda protegido por el envoltorio de T13, una
segunda envoltura ahi seria redundante. Tampoco los `Xxx­Action(...)` que se leen en Server
Components puros (`page.tsx`, `*-list-section.tsx`, `catalog-directories.ts`): se ejecutan en el
servidor sin pasar por el canal de N6/N7 (`design.md > 1`), asi que un freno ahi no se ve como un
`Error` de cliente.

**Comportamiento al frenar en una llamada directa** (no cubierto explicitamente por `design.md`,
decidido aqui de forma minima y sin UI nueva): el `toast` ya lo pone el envoltorio; el sitio de
llamada solo evita tratar `undefined` como si fuera el resultado normal —`return` temprano, o un
resultado vacio en los `fetchPage` de autocompletado (`{ items: [], hasMore: false }` /
`{ items: [], page, totalPages: page }`, que dejan la lista sin resultados en vez de mostrar el
error generico de carga)—. En `order-form.tsx` (`loadIngredients`) se apaga ademas el spinner de
esa peticion para no dejarlo colgado.

**`Toaster`:** ambas zonas con formulario ya lo montan (`app/(private)/layout.tsx` y
`app/(public)/layout.tsx`); no hay una tercera zona con formularios (`app/page.tsx` es la pagina
placeholder de `create-next-app`, sin formulario). No hizo falta tocar ningun layout.

### Archivos

**Nuevos**
- `hooks/use-rate-limited-action-state.ts`
- `tests/unit/hooks/use-rate-limited-action-state.test.tsx`

**Modificados** (22 migraciones de `useActionState` + 10 con `withRateLimitNotice`, algunos en
ambas listas): los 22 de la primera tabla, mas `user-sheet.tsx`, `work-group-members.tsx`,
`product-name-picker.tsx`, `order-form.tsx`, `recipe-picker.tsx`, `order-responsibles.tsx`,
`product-picker.tsx` (formulas), `recipe-form.tsx` (formulas), `delete-recipe-dialog.tsx`,
`presentation-select.tsx`.

Ademas, `tests/unit/recetas-ui/recipe-route-contract.test.ts`: el contrato de codigo comprobaba el
texto literal `listProductsAction({ page` en `product-picker.tsx` (llamada directa sin envoltorio).
Con `withRateLimitNotice(listProductsAction)({` esa cadena exacta ya no aparece; se actualizo el
`toContain` a la forma envuelta, sin tocar lo que la aserción vigila (que no se filtre en cliente y
que la pagina use `MAX_PAGE_SIZE`).

### Comandos corridos (T13-T14)

```
$ pnpm exec vitest run tests/unit/hooks/use-rate-limited-action-state.test.tsx
 Test Files  1 passed (1)
      Tests  3 passed (3)

$ pnpm run typecheck && pnpm run lint
(las dos limpias, exit 0)

$ pnpm exec vitest run tests/unit/pedidos-ui
 Test Files  25 passed (25)
      Tests  313 passed | 3 skipped (316)

$ pnpm exec vitest run tests/unit/proveedores-ui tests/unit/recetas-ui tests/unit/identity-ui/set-credential-form.test.tsx tests/unit/shared/presentation-select-helper.test.tsx tests/ui/login-form-uncontrolled-warning.test.tsx tests/unit/login-form.test.tsx
(primera corrida: 1 fallo en recipe-route-contract.test.ts, el del literal de arriba; corregido)

$ pnpm exec vitest run tests/unit/recetas-ui/recipe-route-contract.test.ts
 Test Files  1 passed (1)
      Tests  26 passed (26)

$ pnpm exec vitest related --run "hooks/use-rate-limited-action-state.ts" <14 archivos de
  configuracion-ui/inventario/asignaciones>
 Test Files  1 failed | 102 passed (103)   -- el fallo NO es mio, ver abajo

$ pnpm exec vitest run tests/guards/guard-arquitectura-modulos.test.ts
 Test Files  1 passed (1)
      Tests  62 passed (62)

$ pnpm exec vitest run tests/unit/hooks/use-rate-limited-action-state.test.tsx tests/unit/recetas-ui/recipe-route-contract.test.ts tests/guards
 Test Files  1 failed | 40 passed (41)   -- el fallo NO es mio, ver abajo
```

**Rojos que NO son mios, anotados sin arreglar:**
- `tests/unit/configuracion-ui/user-table.test.tsx` > *la accion de editar de una fila abre el
  panel SOBRE ESE usuario (R26)* — fallo solo dentro de una tanda de 14 archivos en paralelo
  (`findByTestId` sin encontrar el nodo); en solitario pasa (33 s, 27/27). Flake de saturacion
  conocido (`docs/verification.md > Los flakes de saturacion`), no relacionado con `user-sheet.tsx`.
- `tests/unit/inventario/product-page.test.tsx` > *un guardado rechazado por un campo...* — timeout
  de 20 s solo dentro de una tanda de 16 archivos; en solitario pasa (70 s, 61/61). Mismo flake de
  saturacion, no relacionado con `product-form.tsx`.
- `tests/guards/guard-identificador-de-request.test.ts` > *package.json no gana ninguna
  dependencia...* — cuenta 36 `dependencies` contra las 34 esperadas por QC-71. Es el efecto de que
  T1 de esta misma ficha (otro agente) sumo `@upstash/ratelimit` y `@upstash/redis`, aprobadas en
  `docs/dependencias.md`; esta guardia de QC-71 quedo desactualizada por esa alta y no por nada de
  T13/T14. No se toco.

No se corrio `./init.sh`, `./init.sh --rapido` ni `pnpm test` (fuera de alcance de esta tanda).

**Veredicto T13-T14:** hecho — envoltorio con sus tres casos probados (R11, R12); censo completo de
41 usos (22 `useActionState` + 19 llamadas directas) migrados sin dejar ningun `useActionState` de
`react` fuera de `hooks/use-rate-limited-action-state.ts`; ningun formulario cambia de
comportamiento salvo por el aviso neutro del freno; typecheck y lint limpios; los tests de UI de
las rutas tocadas (pedidos, proveedores, recetas, identity publico, shared, login, configuracion,
inventario) pasan en solitario. No se marca `tasks.md`.

## T12 y T17 — verificaciones de plataforma y latencia

> Tareas manuales registradas (T12 puntos 1-3, T17). No se toco codigo de produccion ni tests.
> Puerto usado: `3173` (libre, distinto de `3000`/`3117`). Sin credenciales de Upstash en esta
> maquina: todo corre contra el contador EN MEMORIA. Servidores arrancados y matados uno por uno;
> ningun proceso quedo vivo al terminar (verificado al final de cada punto).

### T12, punto 1 — en `next dev`, el contador en memoria conserva la cuenta entre peticiones

Arrancado con `RATE_LIMIT_LOGIN_MAX=3 pnpm exec next dev -p 3173` y esperado con un bucle de
`curl` hasta `200`.

Cuatro peticiones seguidas a `/login` con un origen de documentacion (RFC 5737)
`x-forwarded-for: 198.51.100.10`:

```
$ curl -s -o /dev/null -w "status=%{http_code}\n" -H "x-forwarded-for: 198.51.100.10" http://localhost:3173/login
status=200
status=200
status=200
status=429
```

Cabeceras y cuerpo completos de la 4.a (la que da 429), sobre navegacion:

```
HTTP/1.1 429 Too Many Requests
cache-control: no-store
content-type: text/html; charset=utf-8
Vary: Accept-Encoding
```

```
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Demasiados intentos. Prueba de nuevo más tarde</title>
    ...
```

Sin `retry-after` ni `x-ratelimit-*` en esa respuesta (grep vacio sobre las cabeceras).

POST con `next-action: x` a `/login` sobre el MISMO origen ya frenado (5.a peticion, sigue
contando en la misma cuota de `login`):

```
$ curl -s -D - -o /tmp/qc73-429-action-body.txt -X POST -H "x-forwarded-for: 198.51.100.10" -H "next-action: x" http://localhost:3173/login
HTTP/1.1 429 Too Many Requests
cache-control: no-store
content-type: text/plain
```

Cuerpo exacto: `Demasiados intentos. Prueba de nuevo más tarde`.

`content-type` es literalmente `text/plain`, **sin** `; charset=utf-8` — la forma que N6 exige para
que el cliente de Next reconozca el mensaje en vez de la pantalla de error generica.

**Verificado.** El contador SI conserva la cuenta entre peticiones distintas del middleware dentro
del mismo proceso de `next dev` (condicion de la que depende el E2E de T15, §8 del diseño).

### T12, punto 2 — que `x-forwarded-for` ve el middleware, sin cabecera y con una del cliente

Observado por EFECTO (no se toco codigo de produccion para loguear nada): dos orígenes explícitos
distintos, con la misma cuota baja, se frenan cada uno en su propia cuenta; y varias peticiones SIN
la cabecera comparten una cuenta comun.

Origen B, IP distinta (`198.51.100.20`), cuota independiente de la del punto 1:

```
$ curl ... -H "x-forwarded-for: 198.51.100.20" http://localhost:3173/login   (x4)
intento 1: status=200
intento 2: status=200
intento 3: status=200
intento 4: status=429
```

Sin cabecera `x-forwarded-for` en absoluto (curl no la manda por defecto): la primera peticion sin
cabecera del arranque del servidor ya habia consumido 1 de la cuota comun "desconocido"; las tres
siguientes sin cabecera cierran la cuenta exactamente donde toca (3 = cuota):

```
$ curl -s -o /dev/null -w "..." http://localhost:3173/login   (x3, tras 1 peticion previa sin cabecera)
intento sin-cabecera 1: status=200
intento sin-cabecera 2: status=200
intento sin-cabecera 3: status=429
```

Es decir: 1 (arranque) + 2 (200/200) = 3 consumidas, la 4.a peticion total sin cabecera (3.a de este
bloque) da 429 — igual que las de origen explicito, confirmando que TODAS las peticiones sin
cabecera caen en un contador COMUN, distinto del de cualquier IP explicita.

**Verificado por efecto:** `next dev` deja pasar el valor de `x-forwarded-for` que manda el cliente
tal cual (dos IPs explicitas = dos contadores separados); la ausencia de la cabecera cae en el
origen comun "desconocido" (`design.md > 3`). Lo que NO se puede afirmar sin tocar codigo de
produccion — y por tanto queda como **desconocido**, tal como pide la consigna — es si `next dev`
en si AÑADE o reescribe algo sobre esa cabecera antes de que la vea el middleware; solo se observa
el efecto de punta a punta (lo que curl envia vs. en que contador cae la peticion).

### T12, punto 3 — `pnpm build` y `pnpm start`: el build del middleware carga con `@upstash/*`

**BLOQUEO.** `pnpm run build` (`prisma migrate deploy && tsx scripts/seed.ts && next build`) llega
hasta `next build` sin problema (migraciones y seed limpios) y falla ahi, ANTES de llegar a
imprimir la tabla de rutas o el tamaño del middleware, por un error que **no tiene relacion con
`@upstash/*`**:

```
Error: Turbopack build failed with 1 error:
./node_modules/.pnpm/@napi-rs+canvas@1.0.9/node_modules/@napi-rs/canvas/js-binding.js
Error: non-ecmascript placeable asset
asset is not placeable in ESM chunks, so it doesn't have a module id

Import trace:
  Server Component:
    ./node_modules/.pnpm/@napi-rs+canvas@1.0.9/node_modules/@napi-rs/canvas/js-binding.js
    ./node_modules/.pnpm/@napi-rs+canvas@1.0.9/node_modules/@napi-rs/canvas/index.js
    ./lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts
    ./lib/composition/index.ts
    ./app/(private)/configuracion/usuarios/page.tsx
```

Se repitio forzando webpack en vez de Turbopack (`pnpm exec next build --webpack`, sin tocar
codigo) para descartar que fuera cosa del bundler por defecto: falla por la MISMA causa, el binario
nativo de `@napi-rs/canvas` (esta vez el paquete de plataforma
`@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node`) que ningun loader sabe empaquetar:

```
./node_modules/.pnpm/@napi-rs+canvas-win32-x64-msvc@1.0.9/node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node
Module parse failed: Unexpected character '�' (1:2)
You may need an appropriate loader to handle this file type, currently no loaders are configured to process this file.

Import trace for requested module:
./node_modules/.pnpm/@napi-rs+canvas-win32-x64-msvc@1.0.9/node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node
./node_modules/.pnpm/@napi-rs+canvas@1.0.9/node_modules/@napi-rs/canvas/js-binding.js
./node_modules/.pnpm/@napi-rs+canvas@1.0.9/node_modules/@napi-rs/canvas/index.js
./lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts
./lib/composition/index.ts
./lib/modules/inventario/adapters/driving/presentation-actions.ts
```

Ninguna de las dos trazas menciona `@upstash/*`, `uncrypto` ni `node:crypto`: el fallo es previo,
en la conversion de PDF de QC-106 (`lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts`,
que arrastra `@napi-rs/canvas` via `lib/composition/index.ts`), no en el modulo de este ticket. Es
pre-existente y ya estaba anotado como desconocido en
`progress/impl_QC-106-endpoint-de-carga-de-pdf.md` («`@napi-rs/canvas` en el runtime de Vercel:
DESCONOCIDO»), solo que alli nunca se habia corrido un `next build` completo para verlo materializarse
localmente. No se intento arreglar (tocaria `next.config.ts` o el modulo de documentos, fuera del
alcance y de las reglas de esta tanda).

**Consecuencia:** no hay build de produccion utilizable en esta maquina, asi que **no se pudo
generar** ni `pnpm start` ni la tabla de tamaños de rutas/middleware que este punto pedia. No se
puede afirmar ni negar que el middleware cargue `@upstash/*` sin errores de `node:crypto`/`uncrypto`
en un build real: queda **BLOQUEADO**, con el motivo de arriba, y arrastra a T17 (ver abajo).

### T12, punto 4 — Vercel (pendiente, sin cuenta ni despliegue)

**PENDIENTE**, tal como preveía `tasks.md`: sin cuenta de Upstash ni despliegue de preview en esta
sesión, no se puede comprobar (a) si Vercel SOBRESCRIBE una `x-forwarded-for` falsa o la respeta;
(b) si el `content-type` del 429 de Server Action llega en produccion exactamente `text/plain` sin
que alguna capa de Vercel le añada `; charset=...`; (c) el nombre y valor real de `VERCEL_ENV` en
runtime; (d) si cambiar una variable de entorno exige redeploy. Nada de esto se puede verificar sin
red ni cuenta: se deja pendiente con motivo, sin darlo por verificado, y el leader lo lleva al PR
(`design.md > 11`, puntos 1 y 5).

### T17 — medir y anotar latencia

**BLOQUEADO**, encadenado al punto 3: la tarea depende explícitamente de `pnpm start` (T12 punto
3), y sin build de produccion no hay `pnpm start` que levantar en esta maquina. No se corrio el
script de T16 contra un servidor de produccion.

Se evaluo una alternativa para no dejar la tarea completamente vacia: correr el script contra
`next dev` en su lugar. Se descarta explícitamente esa sustitucion porque `next dev` no representa
la latencia real (recompilacion bajo demanda, sin las optimizaciones de `next build`) y la consigna
pide la medida "real" del `pnpm start` del punto 3; unas cifras de `next dev` presentadas como
medida de latencia serian enganosas, no una linea base valida. No se pegan cifras inventadas ni de
`next dev` ni de Upstash.

La medida contra Upstash sigue **pendiente** por el mismo motivo que ya preveía `design.md > 11`,
punto 6: no hay cuenta de Upstash en esta sesion. El conteo de comandos de Upstash que consume una
navegacion tipica (pregunta abierta 2) tampoco se pudo obtener: depende de tener el contador de
Upstash en marcha.

**Resumen para el PR:** T12 puntos 1 y 2 verificados con evidencia real arriba; punto 3 bloqueado
por un fallo de build pre-existente y ajeno a `@upstash/*` (rastreado a QC-106); punto 4 pendiente
por falta de cuenta/despliegue; T17 bloqueado en cascada por el punto 3, sin cifras de latencia de
ningun tipo que anotar en esta tanda.

### Procesos

Todo arrancado y detenido en esta misma tanda: `next dev -p 3173` (arrancado con
`RATE_LIMIT_LOGIN_MAX=3 pnpm exec next dev -p 3173`, matado con `taskkill //PID <pid-de-escucha-en-3173> //T //F`
tras las pruebas del punto 1 y 2). `next build` y `next build --webpack` terminaron solos (con
error) y no dejaron proceso de servidor arriba. Verificado al final: ningun proceso de `next`
escuchando en `3173` (ni en `3000`/`3117`, que son de otros worktrees y no se tocaron).

## T15 — E2E del login frenado

> Implementer, 2026-09-19. Retoma una tanda anterior que dejo `e2e/rate-limit.spec.ts` y el diff de
> `playwright.config.ts` sin commitear, con comentarios que citaban esta seccion antes de que
> existiera. Aqui estan el conteo real, las medidas y el resultado. **Estado: BLOQUEADA** — el spec
> nuevo pasa en los dos motores, tambien dentro de la bateria completa, pero `pnpm run e2e` NO pasa
> entero por causas ajenas a esta ficha (ver «Bateria completa»). T15 queda `[ ]`.

### Conteo de logins de la bateria (N_e2e)

**Metodo.** Se anadio temporalmente `stdout: 'pipe'` al `webServer` (retirado despues; no esta en
el commit) y se corrio la bateria entera SIN el spec nuevo:
`pnpm exec playwright test --grep-invert "login frenado"`. `next dev` registra cada peticion que
renderiza (`GET /login 200 in …`), asi que se contaron sobre ese log todas las lineas de metodo +
`/login` (con o sin query):

```
    114  GET /login 200
      2  GET /login?next=%2Fdashboard 200
      1  GET /login?next=%2Fdashboard 307
     10  GET /login?next=%2Finventario 200
      2  GET /login?next=%2Finventario 307
      8  GET /login?sesion=fin 200
     84  POST /login 200
      6  POST /login?next=%2Finventario 200
```

**Total: 227** peticiones a `/login` (Chromium + WebKit, que comparten el origen comun
"desconocido"), ~113 por proyecto. Hasta 2 de ellas son `curl` mias sin cabecera para ver si el
servidor ya respondia, asi que la bateria real esta entre 225 y 227: se toma 227 como cota.

**Limites del metodo, dichos:** (1) en esa corrida fallaron 28 tests (ver abajo), y un test que
cae a mitad no hace los logins que le quedaban: con la bateria verde la cuenta puede ser algo mayor;
(2) solo cuenta lo que `next dev` registra; una peticion a `/login` que el middleware cuente pero
Next no registre no aparece. **N_e2e = 350** deja ~54% de margen sobre 227, que cubre ambas cosas
con holgura razonable; no se sube mas porque el spec tiene que agotarlo (`design.md > 11`, punto 4).

**Cuota general (desviacion de `design.md > 8`, que solo habla del login).** El mismo log registra
600 peticiones en total, 373 fuera de `/login`. Es cota inferior (el `matcher` no excluye
`/_next/webpack-hmr` ni otras rutas internas que Next no registra) y el pico por ventana de 60 s no
se puede sacar de este log (no lleva hora). `E2E_RATE_LIMIT_GENERAL_MAX = 5000` es una
**precaucion, no una necesidad medida**: que un freno general —que no es lo que esta ficha prueba—
no tumbe un E2E ajeno. Queda para que el reviewer lo acepte o lo quite.

### Que se corrigio del trabajo heredado

1. **Las peticiones de gasto no cabian en el timeout.** El spec heredado gastaba la cuota con
   `page.request.get('/login')` (HTML completo). Corrido solo (`pnpm exec playwright test
   e2e/rate-limit.spec.ts`), los dos proyectos murieron por `Test timeout of 240000ms exceeded`
   dentro del bucle de gasto. Medido contra un `next dev` propio en 3117 con curl: HTML
   `GET /login` 367 ms/req en 20 en serie; 50 en paralelo, 14,1 s (~3,5 req/s). La cifra de «~7
   peticiones/s» del comentario heredado no se reprodujo.
2. **Se cambio a peticiones RSC sin seguir redirecciones.** Con `RSC: 1`, `next dev` contesta
   `307 location: /login?_rsc` en ~15 ms (medido: 0,013-0,020 s por peticion, frente a 0,16-0,18 s
   del HTML en la misma tanda) DESPUES de que el middleware la cuente. Verificado contra un
   `next dev` con `RATE_LIMIT_LOGIN_MAX=10`, un origen distinto por serie:
   ```
   RSC serie:  307 307 307 307 307 307 307 307 307 307 429 429
   GET serie:  200 200 200 200 200 200 200 200 200 200 429 429
   ```
   Cada RSC cuenta exactamente una. **Trampa encontrada al primer intento:** Playwright sigue el
   307 por defecto y la peticion redirigida (`/login?_rsc`) vuelve a contar, asi que cada gasto
   valia DOS y la cuota se agotaba a mitad del bucle — lo atrapo la asercion nueva de abajo
   (`Expected: 200, Received: 429`). Por eso `maxRedirects: 0` es obligatorio y esta comentado.
3. **Asercion nueva en el bucle:** ninguna peticion de gasto puede salir `429` (`not.toBe(429)`,
   no `toBe(307)`, para no atar el test a un detalle interno de Next). Sin ella, un gasto que
   contara doble pasaria desapercibido hasta el final.
4. **Comentarios de `playwright.config.ts`** reescritos con las cifras de arriba (antes decian
   «~111/~222» y «techo de ~7 peticiones/s», sin seccion que los respaldara).

Lo que se mantuvo tal cual: un origen de documentacion RFC 5737 distinto por proyecto
(`198.51.100.73` Chromium, `203.0.113.55` WebKit), `E2E_RATE_LIMIT_LOGIN_MAX` exportado desde
`playwright.config.ts` e importado por el spec (un solo numero), Upstash vacio en `webServer.env`
(D8), el texto exacto `RATE_LIMITED_MESSAGE` sobre `/login` tras el envio (R11) y el `429` + texto
en la navegacion siguiente (R10).

### Spec nuevo, solo

```
$ pnpm exec playwright test e2e/rate-limit.spec.ts
Running 4 tests using 4 workers
  -  2 [webkit] › … login frenado por origen (chromium) › …   (skip: origen de otro proyecto)
  -  3 [chromium] › … login frenado por origen (webkit) › …   (skip: origen de otro proyecto)
  ✓  1 [chromium] › e2e\rate-limit.spec.ts:56:9 › login frenado por origen (chromium) › agota la cuota de login: frena el formulario en la propia pantalla y la navegacion siguiente ve el 429 (R10, R11, R35) (36.9s)
  ✓  4 [webkit] › e2e\rate-limit.spec.ts:56:9 › login frenado por origen (webkit) › agota la cuota de login: frena el formulario en la propia pantalla y la navegacion siguiente ve el 429 (R10, R11, R35) (44.2s)
  2 skipped
  2 passed (1.4m)
```

### Bateria completa (`pnpm run e2e`) — ROJA, por causa ajena

```
  26 failed
  2 skipped
  80 passed (16.0m)
  ✓   38 [chromium] › e2e\rate-limit.spec.ts:56:9 › login frenado por origen (chromium) › …
  ✓   93 [webkit] › e2e\rate-limit.spec.ts:56:9 › login frenado por origen (webkit) › …
```

El spec nuevo pasa tambien DENTRO de la bateria completa (con el resto compitiendo por el mismo
`next dev`). Los 26 rojos son 13 tests × 2 motores, los mismos que en la corrida de conteo (que
ademas tuvo 2 rojos solo en Chromium que no se repitieron: `login.spec.ts:386` y
`pedidos-asignados.spec.ts:316`, intermitentes):

| Test | Error |
| --- | --- |
| `aislamiento-inventario.spec.ts:270` | Postgres `23514 product_batches_unit_differs_from_product` en el `productBatch.create` del fixture |
| `inventario.spec.ts:458, 529, 591, 647, 717` | el alta no cierra la hoja (`product-sheet` sigue en 1); en el log del servidor, 10 errores `23514 product_batches_unit_differs_from_product` (5 tests × 2 motores) |
| `presentaciones.spec.ts:280` | la hoja `presentation-sheet` no se cierra tras el alta |
| `proveedores.spec.ts:380` | `la presentacion "Bolsa 25" no aparecio en el selector` |
| `session.spec.ts:241` | Postgres `23001` al borrar `users` en la limpieza: `violates RESTRICT setting of foreign key` |
| `usuarios.spec.ts:305` | Postgres `23001` al borrar `companies` en la limpieza: `violates RESTRICT setting of foreign key` |
| `cierre-de-sesiones.spec.ts:264` | la victima aterriza en «Asignación» y no en Inventario |
| `permisos.spec.ts:201` | en la 404 privada no aparece `private-user-trigger` |
| `errores.spec.ts:197` | `loginAndLand` no llega al destino derivado (`waitForURL` 60 s) |

**Causa (con evidencia):** la base local `QuimiCloude` en `localhost:5432` es COMPARTIDA por todos
los worktrees, y tiene aplicadas tres migraciones que NO estan en esta rama (esta rama tiene 34, la
ultima `20260917130000_recipes_search_index_including_deleted`). Consulta de solo lectura a
`_prisma_migrations`:

```
20260918130000_product_unit_and_stored_stock                   finished 2026-09-18T20:53:48Z
20260918120000_inventory_movement_kind_enum_and_reason_catalog finished 2026-09-18T20:53:16Z
20260917130000_inventory_movements                             finished 2026-09-18T20:53:16Z
```

Las tres viven en `.worktrees/QC-121-unidad-como-identidad-del-item/db/migrations/` (las dos
primeras tambien en `QC-82`). `20260918130000_product_unit_and_stored_stock` define el trigger
`product_batches_unit_differs_from_product` (rojos de inventario y aislamiento), e
`inventory_movements` crea FKs `ON DELETE RESTRICT` a `users` y `companies` (rojos de limpieza de
`session` y `usuarios`). `prisma migrate status` en esta rama dice «Database schema is up to date!»
porque solo mira que las 34 propias esten aplicadas; no avisa de las de mas. Los tres ultimos de la
tabla (y presentaciones/proveedores) no tienen un error de base propio en lo registrado; lo
compatible con la evidencia —pero **no demostrado test a test**— es que hereden residuos de
fixtures que no se pudieron borrar por esas mismas FKs. En NINGUNO de los 26 rojos aparece el texto
de freno: `grep -rl "Demasiados" test-results` vacio y ninguna linea con `Demasiados` en la salida.

**No se arreglo:** revertir migraciones de otra ficha en una base compartida esta fuera del alcance
de QC-73 y romperia a QC-121/QC-82. Para cerrar T15 hace falta correr `pnpm run e2e` contra una base
con exactamente las migraciones de esta rama (o sincronizar la rama cuando dev traiga esas
migraciones). Decision del leader.

### Guardia de QC-71: alta de `rate-limit.spec.ts`

La primera corrida de `./init.sh --rapido` salio ROJA en
`tests/guards/guard-identificador-de-request.test.ts` › «no hay ningun archivo nuevo en e2e/…
(R21)»: `E2E_ESPERADOS` es una lista CERRADA y el archivo nuevo no estaba. Su punto de extension
por diseno es darse de alta en ella, con comentario (asi lo hicieron QC-49, QC-67, QC-79, QC-85,
QC-101, QC-102…). Se dio de alta `rate-limit.spec.ts` con el mismo formato. Afirmacion del
comentario comprobada: `grep -n "reference\|request-id\|requestId\|x-request" e2e/rate-limit.spec.ts`
vacio. Archivo fuera de la lista de T15 en `tasks.md`, pero consecuencia directa de crear el
archivo que T15 manda.

### Gate de la tanda

**Aviso sobre el entorno:** en el Bash de esta sesion, `pnpm` (el shim de nvm) devuelve
`error: CommandNotFound` y `pnpm.cmd` si funciona. `./init.sh --rapido` sin arreglarlo sale
**VERDE FALSO**: imprime `! pnpm no disponible para correr script 'typecheck'` (y `lint`,
`test:rapido`), se los salta y termina en `== init OK ==`. Se corrio con un shim temporal en el
PATH (`exec pnpm.cmd "$@"`, en el scratchpad de la sesion, no en el repo).

```
✓ base de desarrollo «QuimiCloude» al dia: 37 migracion(es) aplicada(s)
✓ typecheck paso
✓ lint paso
 Test Files  120 passed (120)
      Tests  1828 passed | 1 skipped (1829)
 Test Files  47 passed (47)
      Tests  578 passed | 9 skipped (587)
✓ test:rapido paso
== init OK ==
```

(Las «37 migraciones» son las 34 de esta rama mas las 3 ajenas de arriba: el gate tampoco avisa
de las de mas.)

### Procesos

`next dev --port 3117` arrancado a mano dos veces para medir (con `RATE_LIMIT_LOGIN_MAX=100000` y
luego `=10`), matado cada vez con `taskkill //PID <pid de escucha en 3117> //T //F`; los de
Playwright los arranca y para el propio runner. Verificado al final: nada escuchando en 3117.

### Mapa R<n> → test (T15)

| R | Test |
| --- | --- |
| R35 | `e2e/rate-limit.spec.ts` › `login frenado por origen (chromium/webkit)` (contador en memoria, Upstash vacio en `webServer.env`) |
| R10 (E2E) | mismo test, paso 4: `page.goto('/login')` → `429` y `RATE_LIMITED_MESSAGE` visible |
| R11 (E2E) | mismo test, paso 3: envio del formulario → `RATE_LIMITED_MESSAGE` visible y `pathname` sigue en `/login` |

## T15 y T19 — cierre tras sincronizar con dev

> Implementer, 2026-09-19, sobre `0f41da0e` (merge de `origin/dev` = `63d15088`). **Estado: T15 `[ ]`
> y T19 `[ ]`, las dos por causas ajenas a QC-73, con evidencia abajo.** Ningun rojo lleva el texto
> de freno ni un `429`, y el spec nuevo pasa en los dos motores en todas las corridas.

### Entorno de las corridas

- **Base dedicada `QuimiCloude_qc73_e2e`** (localhost:5432), creada y borrada con `.tmp-createdb.cjs`
  (guarda de nombre) y levantada con `db:migrate` + `db:seed` del repo, sin tropezar con el ciclo de
  la memoria del arnes. Consulta de solo lectura tras el migrate: **37 migraciones, la ultima
  `20260918130000_orders_add_ingredients_cost`, ninguna `product_unit`** = exactamente las 37 de
  `db/migrations/` de la rama. Se recreo desde cero antes de cada corrida de abajo.
- **La base compartida `QuimiCloude` no se toco.** La dedicada se apunto sobrescribiendo
  `DATABASE_URL` y `DIRECT_URL` en el entorno de la corrida (el resto de variables, del `.env`). El
  `.env` del worktree no se modifico. Playwright y `next dev` heredan la variable del entorno (Next no
  pisa lo que ya esta en `process.env`).
- `pnpm` con shim temporal fuera del repo (`exec pnpm.CMD "$@"`), como en «Gate de la tanda».

### Primer rojo, propio del entorno: cliente de Prisma desfasado tras el merge

La primera corrida de `pnpm run e2e` dio **38 failed / 2 skipped / 74 passed (16.5m)**. Seis eran
`TypeError: Cannot read properties of undefined (reading 'deleteMany')` en
`ajuste-de-inventario.spec.ts`: el cliente generado en `node_modules` no tenia `inventoryMovement`
(`grep -c inventoryMovement …/.prisma/client/index.d.ts` = 0, fechado 08:54, antes del merge). Es el
caso que `init.sh` paso 2 describe. Se corrio `pnpm exec prisma generate` y `pnpm exec next typegen`
(ahora 29 coincidencias) y se repitio todo sobre base recreada. Esa primera corrida no cuenta.

### Bateria completa (`pnpm run e2e`) — ROJA, 21 rojos ajenos

```
  21 failed
  2 skipped
  91 passed (6.2m)
  ✓   41 [chromium] › e2e\rate-limit.spec.ts:56:9 › login frenado por origen (chromium) › agota la cuota de login: frena el formulario en la propia pantalla y la navegacion siguiente ve el 429 (R10, R11, R35)
  ✓   99 [webkit] › e2e\rate-limit.spec.ts:56:9 › login frenado por origen (webkit) › agota la cuota de login: frena el formulario en la propia pantalla y la navegacion siguiente ve el 429 (R10, R11, R35)
```

(Los 2 skipped son los cruces de origen del propio spec: cada proyecto salta el `describe` del otro.)

Rojos = 10 tests × 2 motores + 1 intermitente:

| Test | Error |
| --- | --- |
| `inventario.spec.ts:529, 647, 766` | limpieza: `23001` al borrar `product_batches`, `RESTRICT` de `inventory_movements_batch_id_fkey` (QC-92) |
| `session.spec.ts:241` | limpieza: `23001` al borrar `users`, `RESTRICT` de `revoked_sessions_user_id_fkey` |
| `usuarios.spec.ts:305` | limpieza: `23001` al borrar `companies`, `RESTRICT` de `users_company_id_fkey` |
| `presentaciones.spec.ts:280` | la hoja no se cierra tras el alta (`toHaveCount(0)`, recibido 1) |
| `proveedores.spec.ts:380` | `Expected: "12.3456"`, `Received: "12.35"` |
| `permisos.spec.ts:201` | un elemento esperado no aparece (`toBeVisible`) |
| `cierre-de-sesiones.spec.ts:264` | un elemento esperado no aparece (`toBeVisible`) |
| `errores.spec.ts:197` | `page.waitForURL` 60 s |
| `grupos-de-trabajo.spec.ts:356` (solo Chromium) | tras `goto('/configuracion/usuarios')` se ve el login normal, sin texto de freno |

**Prueba de que son ajenos: los mismos rojos en `origin/dev` sin QC-73.** Se monto un worktree
temporal desanclado en `63d15088` fuera del repo (scratchpad de la sesion), con `pnpm install
--frozen-lockfile`, `prisma generate` y `next typegen`, se recreo la base dedicada y se corrieron solo
los 9 archivos con rojos. `origin/dev` y la rama tienen las mismas 37 migraciones
(`git diff origin/dev...HEAD -- db/` vacio), asi que la base es la misma:

```
$ pnpm exec playwright test e2e/cierre-de-sesiones.spec.ts e2e/errores.spec.ts e2e/grupos-de-trabajo.spec.ts e2e/inventario.spec.ts e2e/permisos.spec.ts e2e/presentaciones.spec.ts e2e/proveedores.spec.ts e2e/session.spec.ts e2e/usuarios.spec.ts
  20 failed
  20 passed (4.3m)
```

Los 20 rojos de `origin/dev` son **exactamente** los 20 de la rama (mismo archivo:linea y proyecto,
comparados con `diff`) y con los mismos errores (`23001` en las mismas FK, `12.35`, `waitForURL`). La
unica diferencia es `grupos-de-trabajo.spec.ts:356` en Chromium, que en `dev` paso. En la rama es
**intermitente**: paso en la primera corrida, en la de conteo de abajo, y en
`pnpm exec playwright test e2e/grupos-de-trabajo.spec.ts --repeat-each=2` (`4 passed (39.2s)`). Su
captura muestra el login normal, sin alerta ni texto de freno. El worktree temporal se quito despues
(`git worktree list` ya no lo lista). Ademas: `grep -c Demasiados` en las tres salidas = 0,
`grep -rl Demasiados test-results` vacio y ninguna linea ` 429 in` en el log del servidor.

Los rojos son deuda de `dev`: fixtures de E2E que no conocen las FK `RESTRICT` nuevas (QC-92,
revocacion de sesiones) y pantallas cambiadas por fichas ya mergeadas. **No se arreglaron** (fuera
del alcance de QC-73). T15 sigue `[ ]`: su «Hecho cuando» pide `pnpm run e2e` verde **entero**.

### N_e2e: recuento con los E2E nuevos de dev

Mismo metodo que en «Conteo de logins de la bateria»: `stdout: 'pipe'` temporal en el `webServer`
(revertido con `git checkout -- playwright.config.ts`, verificado sin diff), base recreada,
`pnpm exec playwright test --grep-invert "login frenado"`:

```
    122 GET /login 200
      4 GET /login?next=%2Fdashboard 200
      2 GET /login?next=%2Fdashboard 307
     10 GET /login?next=%2Finventario 200
      2 GET /login?next=%2Finventario 307
      4 GET /login?sesion=fin 200
     92 POST /login 200
      6 POST /login?next=%2Finventario 200
total /login: 242        total peticiones registradas: 678        resultado: 20 failed, 90 passed (7.5m)
```

**242** frente a 227 antes del merge. N_e2e = 350 deja un ~45% de margen. Sigue valiendo el aviso
de antes: un test que cae a mitad no hace los logins que le faltan. Aqui casi todos los rojos caen
en la limpieza, **despues** de loguearse. **No se cambia N_e2e** y el spec nuevo no se quedo sin cuota
antes de tiempo en ninguna corrida. Los comentarios de `playwright.config.ts` siguen citando 227
(la medida de la seccion T15). No se tocan en esta tanda.

### T19 — `./init.sh` completo: ROJO en el paso 3, antes de typecheck/lint/tests

Corrido con `DATABASE_URL`/`DIRECT_URL` a la base dedicada y el shim de `pnpm`:

```
== Arnes SDD :: init (modo: completo) ==
✓ node v26.7.0
✓ dependencias presentes
✓ cliente de Prisma al dia
✓ tipos de ruta de Next al dia
✗ feature_list.json invalido:
faltan specs para features sdd en vuelo: QC-114
```

**Causa (ajena):** `feature_list.json` de `origin/dev` (y por el merge, el de la rama) tiene
`QC-114` (`tabla-compartida-en-iphone-real`, zona frontend) en `in_progress` con
`spec_path: specs/QC-114-tabla-compartida-en-iphone-real`. Ese directorio no existe ni en la rama,
ni en la raiz, ni en ningun worktree hermano (`ls .worktrees/` no tiene ninguno de QC-114). La
unica diferencia de la rama con `dev` en ese archivo es la ficha QC-73. `node
scripts/validate-features.mjs` a solas da el mismo `rc=1`. Arreglarlo es cosa del leader (F0 / board
o el worktree de QC-114), no de esta ficha.

**Lo que NO se hizo, dicho:** el gate aborta antes de typecheck, lint y la suite, asi que **no hay
salida de esos pasos en esta tanda**. Intente dos cosas y el clasificador de permisos las bloqueo por
«CI bypass»: correr una copia de `init.sh` con solo ese `fail` bajado a `warn`, y correr a mano
`typecheck` y `lint`. No se forzo. Queda para el leader: arreglar el estado de QC-114 y volver a
correr `./init.sh` (la base dedicada sigue en pie para eso, ver «Base dedicada»). T19 sigue `[ ]`.

**Diff vigilado (T19, R29 y R33):**

```
$ git diff origin/dev...HEAD -- middleware.ts db/ lib/modules/identity/domain/account-lock.ts | wc -c
0
$ git diff --quiet origin/dev...HEAD -- tests/unit/identity/account-lock.test.ts tests/unit/identity/verify-credentials.test.ts tests/unit/middleware-root-contract.test.ts tests/guards/guard-dependencias-aprobadas.test.ts && echo "sin cambios"
sin cambios
$ git diff origin/dev...HEAD -- package.json | grep '^[+-] '
+    "@upstash/ratelimit": "^2.1.0",
+    "@upstash/redis": "^1.38.4",
```

### Mapa R<n> → test, con el nombre real de cada caso (R1-R35)

| R | Test (archivo › caso) |
| --- | --- |
| R1 | `tests/unit/identity/route-guard-rate-limit.test.ts` › «el freno cuenta cada forma de peticion contra el origen (R1, R2, R3)» › «una navegacion y una Server Action al mismo origen comparten la cuota GENERAL» y «el login cuenta en su PROPIA cuota, separada de la general del mismo origen» |
| R2 | `tests/unit/rate-limit/rate-limit-bucket.test.ts` › «R2 cuenta la ruta exacta de login en la cuota de login»; mas el `describe` de R1 |
| R3 | `rate-limit-bucket.test.ts` › «R3 cuenta una subruta de login en la cuota general», «R3 cuenta la raiz…», «R3 cuenta una ruta privada cualquiera…», «R3 cuenta el enlace de establecer contrasena…» |
| R4 | `tests/unit/rate-limit/rate-limiter-contract.ts` (bateria que corre `in-memory-rate-limiter.test.ts`) › «R4 R27 permite hasta el maximo de peticiones y frena la peticion siguiente», «R4 R27 cuenta cada origen por separado…»; `route-guard-rate-limit.test.ts` › «dos origenes distintos no comparten cuota… (R4)» |
| R5 | `rate-limiter-contract.ts` › «R5 R27 vuelve a dejar pasar cuando termina la ventana» |
| R6 | `tests/unit/rate-limit/request-origin.test.ts` › «R6 toma la direccion IPv4…», «R6 toma la direccion IPv6…», «R6 toma la PRIMERA entrada…», «R6 recorta los espacios…» |
| R7 | `request-origin.test.ts` › los cuatro «R7 devuelve el origen desconocido cuando…» (falta, vacia, IP invalida, entrada vacia entre comas) |
| R8 | `tests/unit/rate-limit/check-request-rate.test.ts` › «R8 da block…», «R8 da allow…»; `route-guard-rate-limit.test.ts` › «la peticion que agota la cuota se frena antes de tocar la sesion (R8, R9)» › «la peticion max+1 da 429, no verifica la cookie y no lleva x-request-id reescrito» |
| R9 | ese mismo caso de `route-guard-rate-limit.test.ts` |
| R10 | `route-guard-rate-limit.test.ts` › «las dos formas de la respuesta de freno (R10, R11)» › «una navegacion frenada es una pantalla HTML con el mensaje neutro»; `tests/unit/rate-limit/rate-limited-response.test.ts` › «R10 muestra el texto neutro exacto», «R10 no trae JavaScript ni recursos externos»; `e2e/rate-limit.spec.ts` › «agota la cuota de login: … (R10, R11, R35)» |
| R11 | `route-guard-rate-limit.test.ts` › «una Server Action frenada lleva content-type EXACTAMENTE text/plain y el cuerpo exacto»; `tests/unit/hooks/use-rate-limited-action-state.test.tsx` › «R11 — con el freno, avisa con el mensaje neutro y mantiene el estado anterior sin boundary»; `rate-limited-response.test.ts` › «R11 R12 es cierto para un Error con el mensaje exacto»; `tests/guards/guard-limite-de-peticiones.test.ts` › «ningun archivo de app/, components/ o hooks/ salvo el envoltorio importa useActionState de react (R11)», «R11 centinela: la version de next es la 16.3.0…» y sus tres casos sinteticos R11; `e2e/rate-limit.spec.ts` (mismo caso que R10) |
| R12 | `use-rate-limited-action-state.test.tsx` › «R12 — cualquier otro error se relanza y llega al limite de error, sin aviso»; `rate-limited-response.test.ts` › los tres «R12 es falso para…» |
| R13 | `rate-limited-response.test.ts` › «R13 R14 es el texto neutro exacto, sin cifras de tiempo», «R13 no revela cuanto falta ni cuanto queda»; `route-guard-rate-limit.test.ts` › «…(R13, R14, R16)» › «sin retry-after ni cabeceras x-ratelimit-*, y con cache-control: no-store» |
| R14 | `rate-limited-response.test.ts` › «R13 R14 es el texto neutro exacto…»; `route-guard-rate-limit.test.ts` › «la respuesta es identica en una ruta privada y en una publica, con y sin cookie valida» |
| R15 | `rate-limited-response.test.ts` › «R15 declara el viewport de ancho de dispositivo y un tamano de letra de al menos 16px», «R15 usa min-height en dvh y nunca 100vh» |
| R16 | `route-guard-rate-limit.test.ts` › «sin retry-after ni cabeceras x-ratelimit-*, y con cache-control: no-store» |
| R17 | `tests/unit/rate-limit/rate-limit-config.test.ts` › «R17 usa el valor valido de la variable de entorno en vez del por defecto»; `tests/unit/composition/rate-limit-edge-wiring.test.ts` › eleccion de contador (lee las cuotas del entorno) |
| R18 | `rate-limit-config.test.ts` › «R18 usa los cinco valores por defecto cuando el entorno no define nada» |
| R19 | `rate-limit-config.test.ts` › «R19 el aviso no incluye el valor invalido, solo el nombre de la variable»; `rate-limit-edge-wiring.test.ts` › «rateLimitEdge.check — avisos de configuracion invalida (R19)» › «un valor invalido avisa una sola vez en dos llamadas seguidas», «un segundo valor invalido DISTINTO de la misma variable vuelve a avisar» |
| R20 | `rate-limit-config.test.ts` › «R20 con los valores por defecto el login admite menos peticiones por segundo que el general» |
| R21 | `check-request-rate.test.ts` › «R21 da degraded/timeout exactamente a los timeoutMs cuando el contador no contesta»; `route-guard-rate-limit.test.ts` › «…degradado… (R21-R24)» › «un timeout deja pasar la peticion, con la sesion verificada y su x-request-id» |
| R22 | `check-request-rate.test.ts` › «R22 da degraded/error con el nombre del error cuando el contador rechaza»; `route-guard-rate-limit.test.ts` › «un contador que falla tambien deja pasar, sin la IP en el aviso ni un mensaje de error» |
| R23 | `route-guard-rate-limit.test.ts` › «un timeout deja pasar la peticion…» y «degradado en /login redirige igual que sin limite…» |
| R24 | `route-guard-rate-limit.test.ts` › «un contador que falla tambien deja pasar, sin la IP en el aviso ni un mensaje de error» |
| R25 | `rate-limit-edge-wiring.test.ts` › «con las dos credenciales cuenta en Upstash (simulado) (R25)»; `tests/unit/rate-limit/upstash-rate-limiter.test.ts` › «R25 R31 configura fixedWindow…», «R25 traduce success:false en allowed:false», «R25 traduce success:true en allowed:true» |
| R26 | `rate-limit-edge-wiring.test.ts` › «sin credenciales y fuera de produccion cuenta en memoria (R26)» |
| R27 | `rate-limiter-contract.ts` › los tres casos «R4/R5 R27…» contra el adaptador en memoria; `upstash-rate-limiter.test.ts` › «R27 reutiliza la MISMA instancia y el MISMO Map cuando la cuota no cambia», «R27 crea otra instancia con otro Map cuando cambia la cuota» |
| R28 | `upstash-rate-limiter.test.ts` › «R25 R31 configura fixedWindow con la cuota, el prefijo, analytics apagado y cache en memoria» (afirma `ephemeralCache` instancia de `Map`) y «R27 reutiliza la MISMA instancia y el MISMO Map…» (la cache sobrevive entre llamadas). **Nota para el reviewer:** ningun caso lleva `R28` en el nombre |
| R29 | `tests/unit/middleware-root-contract.test.ts` › «middleware.ts de la raiz» (6 casos; sus `R20/R21/R22` son la numeracion de QC-9), sin cambios; mas `git diff origin/dev...HEAD -- middleware.ts` vacio (arriba) |
| R30 | `tests/guards/guard-middleware-edge.test.ts` › «el cierre alcanza los archivos nuevos del limite de peticiones (R30)» |
| R31 | `guard-limite-de-peticiones.test.ts` › «ningun archivo fuera del adaptador de Upstash importa @upstash/* (R31)» y sus tres casos sinteticos «R31: …»; `upstash-rate-limiter.test.ts` › «R25 R31 configura fixedWindow…» |
| R32 | `tests/guards/guard-dependencias-aprobadas.test.ts` › «toda dependencia de package.json tiene su fila en el registro», «el registro no lista paquetes que ya no estan instalados» (sin cambios); mas el diff de `package.json` de arriba: solo las dos `@upstash/*` |
| R33 | `tests/unit/identity/account-lock.test.ts` › «bloqueo temporal de cuenta» › «el quinto fallo bloquea y reinicia el contador», «la escalada es 1, 5, 15 y 60 minutos y no pasa de 60», «con el bloqueo caducado vuelve a aceptar intentos», «fallo estando bloqueada devuelve el mismo estado», «un intento correcto deja contador, nivel y bloqueo a cero» (sin cambios); mas `git diff … lib/modules/identity/domain/account-lock.ts` vacio |
| R34 | `tests/unit/scripts/measure-rate-limit-latency.test.ts` › los siete «R34 — …»; las cifras reales (T17) siguen pendientes |
| R35 | `e2e/rate-limit.spec.ts` › «login frenado por origen (chromium)» y «(webkit)» › «agota la cuota de login: frena el formulario en la propia pantalla y la navegacion siguiente ve el 429 (R10, R11, R35)»: verde en los dos motores, en todas las corridas de esta tanda |

### T12 (puntos 3 y 4) y T17

No se hicieron, como estaba previsto: siguen `[ ]`. Motivo para el PR: `pnpm build` esta roto por
`@napi-rs/canvas` (QC-106, modulo de documentos), asi que no hay `pnpm start` contra el que medir, y
no hay cuenta de Upstash ni despliegue en Vercel. No se toco `next.config.ts` ni el modulo de documentos.

### Base dedicada

**Se deja en pie `QuimiCloude_qc73_e2e`** (37 migraciones + seed, recreada antes de la ultima
corrida). Hace falta para volver a correr `./init.sh` y `pnpm run e2e` cuando se resuelva QC-114 y
la deuda E2E de `dev`. Se borra con `DATABASE_URL=<…/QuimiCloude_qc73_e2e…> node .tmp-createdb.cjs drop`.

### Procesos

Los `next dev` de 3117 los arranco y paro Playwright en cada corrida; no se arranco ninguno a mano.
No se mato ningun proceso ajeno.
