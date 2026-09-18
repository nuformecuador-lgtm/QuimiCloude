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
