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
