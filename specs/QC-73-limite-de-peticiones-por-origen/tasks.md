# QC-73 — limite-de-peticiones-por-origen · tasks.md

> Zona **fullstack**. Las tasks van partidas en **Backend** (T1–T12), **Frontend** (T13–T15) y
> **Verificación y cierre** (T16–T19). `[P]` = puede ir en paralelo con las demás `[P]` de su bloque
> una vez cumplidas sus dependencias. Cada task cierra con `./init.sh --rapido` en verde salvo que
> diga otra cosa; la feature cierra con `./init.sh` completo (T19).
>
> **Antes de T1 (leader, F1.4):** repetir los cuatro checks de `@upstash/ratelimit` y
> `@upstash/redis`, rellenar la tabla de `design.md > 9` y escribir sus dos filas en
> `docs/dependencias.md`. Sin esas filas, T1 no instala nada. Y responder `design.md > 11`, al
> menos el punto 1: sin él, T9 no cierra.

## Backend

- [x] **T1 — Instalar las dos dependencias y verificar su API publicada.**
  Depende de: F1.4 (filas escritas).
  Archivos: `package.json`, `pnpm-lock.yaml`, `progress/impl_QC-73-limite-de-peticiones-por-origen.md`.
  Hacer: `pnpm add @upstash/ratelimit @upstash/redis`. Leer en `node_modules` —no de memoria— y
  anotar en `progress/impl_…md` con la ruta del archivo leído: `Ratelimit.fixedWindow`, la opción de
  caché en memoria (`ephemeralCache`) y su tipo, la opción `timeout` y qué devuelve al vencer, la forma
  de lo que devuelve `limit()`, cómo se apaga `analytics`, si existe algún backend en memoria, y qué
  entrada del paquete resuelve el bundler del borde (y qué hace `uncrypto` en ella).
  R: R31, R32.
  Hecho cuando: `guard-dependencias-aprobadas` en verde y la nota existe con las seis respuestas. Si
  alguna contradice `design.md > 9`, **se para y se sube al leader**.

- [x] **T2 [P] — Dominio: origen de la petición.**
  Archivos: `lib/modules/rate-limit/domain/request-origin.ts`, `lib/modules/rate-limit/index.ts`,
  `tests/unit/rate-limit/request-origin.test.ts`.
  Hacer: `resolveRequestOrigin(forwardedFor)` y `UNKNOWN_ORIGIN`, validando con los validadores de IP
  de zod 4 (comprobar primero sus nombres reales en `node_modules/zod`).
  R: R6, R7.
  Hecho cuando: los casos IPv4, IPv6, lista con varias entradas, espacios, cabecera ausente, vacía y
  basura tienen test y pasan.

- [x] **T3 [P] — Dominio: configuración de cuotas.**
  Archivos: `lib/modules/rate-limit/domain/rate-limit-config.ts`, `tests/unit/rate-limit/rate-limit-config.test.ts`.
  Hacer: `parseRateLimitConfig(env)` → `{ config, warnings }` con los cinco valores de
  `design.md > 7`; un aviso por variable inválida que la nombra (sin su valor).
  R: R17, R18, R19, R20.
  Hecho cuando: hay test de cada valor por defecto, de un valor válido que manda, de `0`, negativo,
  decimal y texto, y uno que afirma que con los valores por defecto login admite menos pet/s que
  general.

- [x] **T4 [P] — Dominio: qué cuota le toca a la petición.**
  Archivos: `lib/modules/rate-limit/domain/rate-limit-bucket.ts`, `tests/unit/rate-limit/rate-limit-bucket.test.ts`.
  Hacer: `selectBucket(pathname, loginRoute)`; la ruta de login entra por parámetro.
  R: R2, R3.
  Hecho cuando: `/login` → `login`; `/login/…`, `/`, `/dashboard`, `/establecer-contrasena/x` →
  `general`, con test.

- [x] **T5 [P] — Dominio: la respuesta de freno.**
  Archivos: `lib/modules/rate-limit/domain/rate-limited-response.ts`, `tests/unit/rate-limit/rate-limited-response.test.ts`.
  Hacer: `RATE_LIMITED_MESSAGE` (texto exacto de D4), `renderRateLimitedPage()` (HTML con
  `lang="es"`, `meta viewport` de ancho de dispositivo, texto ≥ 16 px, `min-height: 100dvh` y nunca
  `100vh`, sin JavaScript, sin recursos externos, sin cifras de tiempo) e `isRateLimitedError(e)`.
  R: R10, R13, R14, R15.
  Hecho cuando: los tests afirman el texto exacto en la página, la ausencia de `100vh` y de dígitos
  de tiempo, la presencia del viewport y del tamaño, y que `isRateLimitedError` es cierto solo para
  un `Error` con ese mensaje exacto (falso para otro `Error`, para un texto parecido y para no-`Error`).

- [x] **T6 — Puerto y caso de uso con espera máxima.**
  Depende de: T3, T4.
  Archivos: `lib/modules/rate-limit/ports/rate-limiter.ts`, `lib/modules/rate-limit/domain/check-request-rate.ts`,
  `tests/unit/rate-limit/check-request-rate.test.ts`.
  Hacer: `checkRequestRate({ origin, bucket, quota }, { limiter, timeoutMs })` →
  `allow | block | degraded(reason)`; clave `<bucket>:<origin>`; `Promise.race` con temporizador que
  se limpia siempre; nunca lanza.
  R: R8, R21, R22.
  Hecho cuando: con temporizadores falsos, un contador que no contesta da `degraded/timeout` a los
  `timeoutMs` exactos y no después; uno que rechaza da `degraded/error` con el nombre del error; uno
  que dice `allowed:false` da `block`.

- [x] **T7 [P] — Adaptador en memoria.**
  Depende de: T6 (puerto).
  Archivos: `lib/modules/rate-limit/adapters/driven/in-memory-rate-limiter.ts`,
  `tests/unit/rate-limit/in-memory-rate-limiter.test.ts`, `tests/unit/rate-limit/rate-limiter-contract.ts`
  (batería de contrato reutilizable).
  Hacer: ventana fija con reloj inyectable; purga de entradas vencidas al consultar.
  R: R4, R5, R27.
  Hecho cuando: la batería de contrato (max permitidas y la max+1 frenada; dos orígenes
  independientes; vuelve a pasar al cambiar de ventana) pasa contra este adaptador.

- [x] **T8 — Adaptador de Upstash.**
  Depende de: T1, T6.
  Archivos: `lib/modules/rate-limit/adapters/driven/upstash-rate-limiter.ts`,
  `tests/unit/rate-limit/upstash-rate-limiter.test.ts`.
  Hacer: un `Ratelimit` por cuota (`fixedWindow(max, '<window> s')`, prefijo por cuota, `analytics`
  apagado, caché en memoria con un `Map` que vive lo que la instancia), recreado solo si cambia la
  cuota. Traduce `success` a `allowed`. No captura errores: los deja al caso de uso.
  R: R25, R27, R28, R31.
  Hecho cuando: con `@upstash/ratelimit` simulado (`vi.mock`), los tests afirman la configuración
  pasada, que dos llamadas de la misma cuota reutilizan la MISMA instancia y el MISMO `Map`, que
  cambiar la cuota crea otra, y la traducción `success` → `allowed`. Si T1 encontró cómo inyectar un
  cliente Redis falso, se añade además la batería de contrato de T7 contra este adaptador.

- [ ] **T9 — Cableado en `lib/composition/edge.ts`.**
  Depende de: T2–T8, y de la respuesta a `design.md > 11`, punto 1.
  Archivos: `lib/composition/edge.ts`, `tests/unit/composition/rate-limit-edge-wiring.test.ts`.
  Hacer: fachada `rateLimitEdge` (`design.md > 6`): configuración leída en cada llamada, avisos de
  configuración una vez por instancia y valor, elección de contador por credenciales, la rama de
  producción sin credenciales según lo que decida el humano.
  R: R17, R19, R25, R26.
  Hecho cuando: con `vi.stubEnv`, sin credenciales y fuera de producción se usa el contador en
  memoria; con las dos se usa el de Upstash (simulado); con una sola, en memoria; la rama de
  producción hace lo decidido; un valor inválido avisa una sola vez en dos llamadas seguidas.

- [ ] **T10 — Enganche en el middleware.**
  Depende de: T9.
  Archivos: `lib/modules/identity/adapters/driving/route-guard-middleware.ts`,
  `tests/unit/identity/route-guard-rate-limit.test.ts`; y, solo si hace falta, los tests existentes
  del middleware que superen la cuota (se les sube con `vi.stubEnv`, sin tocar lo que afirman).
  Hacer: `design.md > 4`. Limpiar los comentarios de las líneas que toca la rama; los nuevos no
  citan fichas ni requisitos.
  R: R1, R8, R9, R10, R11 (lado servidor), R13, R14, R16, R21, R22, R23, R24.
  Hecho cuando, con `NextRequest` reales y el contador en memoria:
  - navegación, POST con `next-action` y `/login` cuentan (R1);
  - la petición max+1 da 429 y el verificador de la cookie **no** se llama y no hay
    `x-middleware-request-x-request-id` (R8, R9);
  - la forma pantalla lleva `content-type: text/html; charset=utf-8` y el mensaje; la forma Server
    Action lleva `content-type` **literalmente** `text/plain` y el cuerpo exacto (R10, R11);
  - ninguna de las dos lleva `retry-after` ni cabecera `x-ratelimit-*`, las dos llevan
    `cache-control: no-store` (R13, R16), y la respuesta es idéntica con y sin cookie válida y en
    ruta privada y pública (R14);
  - con un contador que no contesta o que falla, la respuesta es la misma que sin límite (redirect o
    `next` con `x-request-id`), hay un `console.warn` y ese aviso no contiene la IP enviada ni el
    token (R21–R24);
  - `tests/unit/identity/route-guard-request-id.test.ts` y el resto de tests del middleware siguen
    en verde.

- [ ] **T11 — Guardias.**
  Depende de: T10, T13.
  Archivos: `tests/guards/guard-middleware-edge.test.ts` (solo añade), `tests/guards/guard-limite-de-peticiones.test.ts`.
  Hacer:
  - en `guard-middleware-edge`, **añadir** `expect(files).toContain(…)` para
    `lib/modules/rate-limit/domain/check-request-rate.ts` y
    `lib/modules/rate-limit/adapters/driven/upstash-rate-limiter.ts`. No se quita ni se relaja nada.
  - guardia nueva con tres reglas, cada una con su caso sintético que la pone roja y su simétrico:
    (1) ningún archivo fuera de `upstash-rate-limiter.ts` importa `@upstash/*`; (2) ningún archivo de
    `app/`, `components/` ni `hooks/` salvo `hooks/use-rate-limited-action-state.ts` importa
    `useActionState` de `react`; (3) centinela: la versión de `next` en `package.json` es `16.3.0`,
    y si no, falla con un mensaje que pide releer `server-action-reducer.js` (`design.md > 1`, N6).
  R: R11, R29, R30, R31.
  Hecho cuando: las dos guardias en verde sobre el repo, las sintéticas en rojo, y
  `tests/unit/middleware-root-contract.test.ts` pasa **sin haberse tocado** (R29).

- [ ] **T12 — Verificaciones de plataforma que el diseño dejó abiertas.** (manual, registrada)
  Depende de: T10. **Va antes de T15.**
  Archivos: `progress/impl_QC-73-limite-de-peticiones-por-origen.md`.
  Hacer y pegar la evidencia:
  1. en `next dev`, el contador en memoria conserva la cuenta entre peticiones del middleware;
  2. en `next dev`, qué `x-forwarded-for` ve el middleware sin cabecera y con una enviada por el cliente;
  3. en `pnpm build && pnpm start`, que el build del middleware carga con `@upstash/*` dentro;
  4. cuando exista un despliegue de preview: que Vercel **sobrescribe** una `x-forwarded-for`
     falsa; que la respuesta 429 de Server Action llega con `content-type` exactamente `text/plain`;
     el nombre y valor de `VERCEL_ENV`; y si cambiar una variable exige redeploy.
  R: soporte de R6, R11, R26, R35.
  Hecho cuando: 1–3 tienen evidencia. El punto 4 depende de la cuenta (pregunta 1): si no hay, queda
  escrito como pendiente con motivo y **el leader lo lleva al PR**; no se da por verificado.

## Frontend

- [ ] **T13 — Envoltorio de `useActionState`.**
  Depende de: T5.
  Archivos: `hooks/use-rate-limited-action-state.ts`, `tests/unit/hooks/use-rate-limited-action-state.test.tsx`
  (proyecto `ui` de Vitest: confirmar en `vitest.config.mts` qué nombre lo selecciona).
  Hacer: `useRateLimitedActionState(action, initialState)` con la firma de `useActionState`, y
  `withRateLimitNotice(fn)` para las llamadas directas (`design.md > 5`). Toast con `toast.error` de
  `sonner`.
  R: R11, R12.
  Hecho cuando: con una acción que lanza `new Error(RATE_LIMITED_MESSAGE)`, el test ve el toast con
  el texto exacto, el estado sigue siendo el anterior y no se monta ningún error boundary; con una
  acción que lanza otro `Error`, el error llega al boundary como hoy y **no** hay toast; con una que
  devuelve estado, el estado es el devuelto.

- [ ] **T14 — Censo y migración de formularios.**
  Depende de: T13.
  Archivos: `app/(public)/login/components/login-form.tsx` y **cada** archivo que el censo encuentre;
  los layouts de zona que no monten el `Toaster`.
  Hacer: listar en `progress/impl_…md` todo uso de `useActionState` y toda llamada directa a una
  Server Action en `app/`, `components/` y `hooks/` (con ruta y línea); migrar cada uno a
  `useRateLimitedActionState` o `withRateLimitNotice`; comprobar que cada zona con formulario monta
  el `Toaster`. Multiplataforma: no se añade UI nueva salvo el toast que ya existe.
  R: R11.
  Hecho cuando: la regla (2) de la guardia de T11 pasa, la lista del censo está en el `impl` con su
  conteo, y los tests de UI de los formularios migrados siguen en verde.

- [ ] **T15 — E2E del login frenado.**
  Depende de: T10, T12 (puntos 1 y 2), T14.
  Archivos: `e2e/rate-limit.spec.ts`, `playwright.config.ts`.
  Hacer: `design.md > 8`. Contar antes los logins de la batería por navegador y fijar N_e2e con
  margen, en una constante exportada que el spec importa. Un origen de documentación distinto por
  proyecto.
  R: R35 (y E2E de R10 y R11).
  Hecho cuando: `pnpm run e2e` pasa **entero** en Chromium y WebKit —el spec nuevo y los que ya
  había—, el spec afirma el texto exacto en la pantalla de login tras el envío y el 429 con el texto
  en la navegación siguiente.

## Verificación y cierre

- [ ] **T16 [P] — Procedimiento de medida de latencia.**
  Archivos: `scripts/measure-rate-limit-latency.ts`, `tests/unit/scripts/measure-rate-limit-latency.test.ts`.
  Hacer: script que lanza N peticiones secuenciales a una URL y escribe p50 y p95; función de
  percentil exportada. Usa una ruta de la cuota **general** y un N por debajo de ella (o sube la
  cuota por variable en la corrida), para no medir frenos.
  R: R34.
  Hecho cuando: el test del percentil pasa con casos conocidos (par, impar, un solo valor) y el
  script tiene su modo de uso en la cabecera.

- [ ] **T17 — Medir y anotar.** (manual)
  Depende de: T16, T12 punto 3.
  Archivos: `progress/impl_…md`; descripción del PR (la escribe el leader).
  Hacer: correr T16 contra `pnpm start` con el contador en memoria y, si hay cuenta, con Upstash
  (mejor contra el preview, que es donde la latencia es la real). Anotar p50/p95 de cada corrida y la
  diferencia. Anotar también cuántos comandos de Upstash consume una navegación típica, que es el
  dato que la pregunta abierta 2 necesita.
  R: R34.
  Hecho cuando: las cifras están en el `impl`. Sin cuenta de Upstash: la medición en memoria está, y
  la de Upstash queda escrita como pendiente con su motivo (`design.md > 11`, punto 6).

- [ ] **T18 [P] — Documentación.**
  Archivos: `docs/architecture.md` (`> Stack > Integraciones externas` y `> Permisos y autenticación`),
  `.env.example` si existe.
  Hacer: `design.md > 12`. Las cinco variables de cuota y las dos de Upstash, sin valores reales.
  R: —.
  Hecho cuando: el texto ya no dice que no hay integraciones externas ni que el middleware no hace
  E/S.

- [ ] **T19 — Gate completo y trazabilidad.**
  Depende de: todas.
  Archivos: `progress/impl_QC-73-limite-de-peticiones-por-origen.md`.
  Hacer: `./init.sh` completo; pegar la salida; copiar el mapa de abajo con el nombre real de cada
  caso; confirmar que `git diff origin/dev...HEAD -- middleware.ts db/ lib/modules/identity/domain/account-lock.ts`
  sale vacío.
  R: R29, R33 y el mapa entero.
  Hecho cuando: el gate está en verde y cada R tiene su test nombrado.

## Trazabilidad prevista (`R<n> -> test`)

Los nombres de caso los fija el implementer; `R<n>` va en el nombre del caso (`docs/conventions.md > Comentarios`).

| R | Test previsto |
|---|---|
| R1 | `tests/unit/identity/route-guard-rate-limit.test.ts` |
| R2, R3 | `tests/unit/rate-limit/rate-limit-bucket.test.ts` |
| R4, R5 | `tests/unit/rate-limit/in-memory-rate-limiter.test.ts` (batería `rate-limiter-contract.ts`) |
| R6, R7 | `tests/unit/rate-limit/request-origin.test.ts` |
| R8, R9 | `tests/unit/identity/route-guard-rate-limit.test.ts`; `tests/unit/rate-limit/check-request-rate.test.ts` (R8) |
| R10 | `tests/unit/identity/route-guard-rate-limit.test.ts`; `tests/unit/rate-limit/rate-limited-response.test.ts`; `e2e/rate-limit.spec.ts` |
| R11 | `tests/unit/hooks/use-rate-limited-action-state.test.tsx`; `tests/unit/identity/route-guard-rate-limit.test.ts` (cabecera literal); `tests/guards/guard-limite-de-peticiones.test.ts` (censo y centinela); `e2e/rate-limit.spec.ts` |
| R12 | `tests/unit/hooks/use-rate-limited-action-state.test.tsx`; `tests/unit/rate-limit/rate-limited-response.test.ts` |
| R13, R14 | `tests/unit/identity/route-guard-rate-limit.test.ts`; `tests/unit/rate-limit/rate-limited-response.test.ts` |
| R15 | `tests/unit/rate-limit/rate-limited-response.test.ts` |
| R16 | `tests/unit/identity/route-guard-rate-limit.test.ts` |
| R17–R20 | `tests/unit/rate-limit/rate-limit-config.test.ts`; R17 y R19 también `tests/unit/composition/rate-limit-edge-wiring.test.ts` |
| R21, R22 | `tests/unit/rate-limit/check-request-rate.test.ts`; `tests/unit/identity/route-guard-rate-limit.test.ts` |
| R23, R24 | `tests/unit/identity/route-guard-rate-limit.test.ts` |
| R25, R26 | `tests/unit/composition/rate-limit-edge-wiring.test.ts` |
| R27 | `tests/unit/rate-limit/rate-limiter-contract.ts` contra `in-memory-rate-limiter.test.ts`; `tests/unit/rate-limit/upstash-rate-limiter.test.ts` |
| R28 | `tests/unit/rate-limit/upstash-rate-limiter.test.ts` |
| R29 | `tests/unit/middleware-root-contract.test.ts` (sin cambios) |
| R30 | `tests/guards/guard-middleware-edge.test.ts` |
| R31 | `tests/guards/guard-limite-de-peticiones.test.ts` |
| R32 | `tests/guards/guard-dependencias-aprobadas.test.ts` |
| R33 | los tests existentes del bloqueo de cuenta de `identity`, sin cambios (su ruta exacta la anota T19; no se ha podido listar en esta sesión) |
| R34 | `tests/unit/scripts/measure-rate-limit-latency.test.ts` + cifras en el `impl` y en el PR (T17) |
| R35 | `e2e/rate-limit.spec.ts` |

Decisiones cerradas cubiertas: D1 (R1, R3, R4, R8), D2 (R21–R24), D3 (R2, R3, R5, R17–R20),
D4 (R10–R16, R35), D5 (R28), D6 (R34), D7 (R25, R31, R32), D8 (R26, R35), D9 (R9, R25–R27, R29, R30).
