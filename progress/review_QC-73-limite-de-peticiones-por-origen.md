# QC-73 — limite-de-peticiones-por-origen · review

> Reviewer, 2026-09-19, sobre `3bc876aa` (rama `feature/QC-73-limite-de-peticiones-por-origen`)
> contra `origin/dev` = `63d15088` (`git diff origin/dev...HEAD`, 78 archivos).

## Veredicto: **RECHAZADO**

Tres bloqueantes, los tres de arreglo corto. Todo lo demas (trazabilidad, baseline, guardias,
dependencias, multiplataforma, alcance congelado) esta en orden; detalle abajo.

## Hallazgos

### BLOQUEANTE

1. **Una URL de Upstash mal formada tumba todas las paginas con un error, en vez de dejar pasar
   (D2, R22, R23).** `new Redis({ url })` lanza `UrlError` de forma sincrona si la URL no casa con
   `^https?://...` (`node_modules/@upstash/redis/chunk-2JFYL2VL.mjs:113-115`). Reproducido con
   `node`: `redis://default:x@eu1.upstash.io:6379` y `"https://x.upstash.io"` (con comillas)
   lanzan; `https://ok.upstash.io` no. En `lib/composition/edge.ts`,
   `getUpstashLimiter(url, token, bucket)` -> `createUpstashRateLimiter` -> `new Redis(...)` se
   evalua como argumento ANTES de entrar en `checkRequestRate`, que es la unica pieza que convierte
   fallos en `degraded`. La excepcion sale de `rateLimitEdge.check` y `middleware()` de
   `route-guard-middleware.ts` no la atrapa: cada peticion del `matcher`, login incluido, termina en
   error. Pegar la URL `redis://` que la consola de Upstash muestra junto a la REST es un error de
   configuracion corriente. D2 fijo que un fallo del contador no para el ERP, y la opcion (a) de
   F1.4 lleva incluso la AUSENCIA de credenciales a «dejar pasar y avisar»; con credenciales rotas
   pasa lo contrario. Ningun test lo cubre (`route-guard-rate-limit.test.ts` simula `check`;
   `rate-limit-edge-wiring.test.ts` no prueba credenciales invalidas).
   **Que falta:** que la construccion del contador de Upstash no pueda escapar de la ruta degradada
   (construirlo dentro de lo que protege `checkRequestRate`, o atrapar en `rateLimitEdge.check` y
   devolver `degraded` con un motivo sin URL ni token), y un test en
   `rate-limit-edge-wiring.test.ts` con `UPSTASH_REDIS_REST_URL` mal formada que afirme `degraded`,
   el aviso, y que el aviso no contiene ni la URL ni el token (R24).

2. **Cita de requisito en un comentario de produccion anadido por el diff**
   (`docs/conventions.md > Comentarios`).
   `lib/modules/rate-limit/adapters/driven/upstash-rate-limiter.ts`, docblock de
   `createUpstashRateLimiter`: «...este es el unico archivo autorizado a tocar `@upstash/*` (R31).»
   Quitar «(R31)».

3. **Cita de ficha y requisito en una linea de produccion que el diff modifica.**
   `app/(private)/configuracion/usuarios/components/work-group-members.tsx`: al reindentar el
   `.then(...)` el diff reescribe `// identificador de peticion (QC-71 R17).`. Es una linea que la
   rama toca, asi que entra en la limpieza. Quitar «(QC-71 R17)» y dejar el porque.

### menor

4. **R28 sin `R28` en el nombre de ningun caso.** El mapa lo lleva a `upstash-rate-limiter.test.ts`
   › «R25 R31 configura fixedWindow...» (afirma `ephemeralCache` instancia de `Map`) y «R27
   reutiliza la MISMA instancia...». **Juicio: la trazabilidad se cumple.** Son tests concretos, no
   vacios. R28 es configurar la cache de la libreria y que viva lo que la instancia, y eso es lo que
   afirman. Que la cache evite consultar Upstash es comportamiento de `@upstash/ratelimit`, leido en
   T1 (`index.d.ts:607-623`). Lo que no se cumple es la convencion (`tasks.md > Trazabilidad`:
   «`R<n>` va en el nombre del caso»): anadir `R28` al nombre de esos dos casos. De paso: «R27
   reutiliza la MISMA instancia y el MISMO Map» no afirma la identidad del `Map`, solo que
   `Ratelimit` se construye una vez.
5. **`withRateLimitNotice` no tiene test de comportamiento.** Se usa en 13 archivos, varios de
   mutacion (`addWorkGroupMember`, `deleteRecipe`, `create/updateRecipe`, `createPresentation`), y
   solo lo tocan comprobaciones de texto (`guard-limite-de-peticiones`, `recipe-route-contract`).
   No es bloqueante porque R11 y R12 tienen test por el camino del hook. Falta un caso que afirme
   que con el freno devuelve `undefined` y pone el toast, y que con otro error relanza sin toast.
6. **El contador en memoria no purga las claves vencidas de otros origenes.** T7 pedia «purga de
   entradas vencidas al consultar»; solo se reemplaza la clave consultada, asi que el `Map` crece
   con cada origen distinto mientras viva la instancia. No aplica en produccion (Upstash o
   degradado), pero si en los preview de Vercel (sin credenciales van a memoria) y en `next dev`.
   La bitacora lo describe («purga perezosa») pero declara «Desviaciones: ninguna».
7. **Comentarios con citas en tests y E2E** (`docs/conventions.md`: «Tests (`tests/`, `e2e/`): la
   misma regla para los comentarios»). Los hay en `e2e/rate-limit.spec.ts` (QC-73,
   `design.md > 8`, R35, R10, R11, `progress/impl_...`), en `playwright.config.ts` (QC-73, D8,
   `design.md`), en el alta de `guard-identificador-de-request.test.ts` y en la nota de
   `usuarios-convenciones.test.ts`. Ademas, los bloques de `playwright.config.ts` pasan de ~5
   lineas.
8. **`recipe-route-contract.test.ts` pierde la afirmacion de `page`.** Se cambio
   `toContain('listProductsAction({ page')` por
   `toContain('withRateLimitNotice(listProductsAction)({')`, y ya no se comprueba que se pase
   `page`. Conviene afirmar tambien `page,`; `pageSize` si sigue afirmado.
9. **La tabla de `design.md > 9` sigue en «pendiente (leader)».** Los cuatro checks si estan
   verificados y fechados en `docs/dependencias.md` y en `progress/current.md`, y la aprobacion
   humana esta en `requirements.md > Decisiones cerradas`. Lo desfasado es la tabla del diseno.
10. **`E2E_RATE_LIMIT_GENERAL_MAX = 5000`** es una precaucion sin medida, y la bitacora la deja
    para que el reviewer la acepte: **se acepta**. Solo afecta al `next dev` del runner E2E y el
    motivo esta escrito.

## Checklist

### 1. Trazabilidad: PASA (con el menor 4)
Los 35 R estan en `progress/impl_...md > Mapa R<n> -> test, con el nombre real de cada caso`, y cada
uno apunta a casos concretos. Revise los de riesgo:
- R9: el caso max+1 afirma que el verificador no se llama y que no hay `x-request-id`.
- R11: cabecera `text/plain` literal, hook y E2E.
- R13, R14 y R16: cabeceras e identidad de la respuesta con y sin cookie.
- R21-R24: linea de aviso exacta y sin el origen.
- R29 y R33: tests intactos y diff vacio.

R34 tiene el test del percentil, pero no hay cifras (T17 pendiente, ver 2).

### 2. Tasks: NO todas `[x]`
T12, T15, T17 y T19 siguen `[ ]`. Hay una excepcion humana **registrada en disco**
(`progress/current.md`, 2026-09-19): T12.3, T12.4 y T17 quedan pendientes con motivo en el PR, y se
abre el PR con el gate rojo solo por QC-114. Lo comprobe:
- **QC-114:** `node scripts/validate-features.mjs` da rc=1 por QC-114, que esta `in_progress` con
  `sdd: true` igual en `origin/dev`.
- **Build roto:** documentado con la traza de `@napi-rs/canvas` (QC-106).
- **E2E:** los 20 rojos, comparados archivo:linea contra `63d15088`.

No lo cuento como bloqueante del reviewer, pero la feature **no** pasa a `done` hasta cerrarlas
(CHECKPOINTS > Especificacion).

### 3. CHECKPOINTS
- [x] requirements EARS R1-R35 · [x] design con 8 alternativas descartadas · [ ] todas las tasks `[x]` (ver 2)
- [x] mapa R->test en el impl
- [x] typecheck, corrido por mi: exit 0 · [x] lint, corrido por mi: exit 0
- [~] `pnpm test`: el `test:json` del leader sobre `95cb1433` da 14 archivos rojos, **todos en el
  baseline**; el comparador dice «sin rojos nuevos», exit 0 (`gate-73b.log:4750-4767`). Yo corri los
  archivos de QC-73 y los que la rama toca: 20/20 verdes. Todas las guardias: 42/42 verdes.
- [x] E2E de autenticacion: `e2e/rate-limit.spec.ts`, verde en Chromium y WebKit; 8/8 con
  `ajuste-de-inventario` en el log del leader.
- [x] Multiplataforma: la pantalla de freno lleva viewport de ancho de dispositivo, 16px y `100dvh`
  (nunca `100vh`), sin JS y con test. No hay UI nueva salvo el toast que ya existia.
- [x] Dependencias: solo las dos `@upstash/*`, cada una con su fila y sus cuatro checks en
  `docs/dependencias.md`, y la aprobacion humana citada (ver menor 9). `guard-dependencias-aprobadas`
  en verde.
- [x] Datos, empresa, RLS, migraciones y webhooks: no aplica. `git diff origin/dev...HEAD -- db/`
  sale vacio y no hay modelo nuevo.
- [x] Secretos: `.env.example` sin valores; las credenciales se leen en cada llamada.
- [x] Hexagonal: dominio puro (solo `zod`), un puerto y dos adaptadores driven. El driving pide el
  contador a `lib/composition/edge.ts` y `@upstash/*` solo entra en su adaptador (guardia R31).
  `guard-middleware-edge` solo **anade** (R30).
- [x] Configuracion: cuotas y espera por variable de entorno, con sus valores por defecto.
- [ ] `./init.sh` verde: corrido por mi, corta en el paso 3 por QC-114 (ajeno, ver 2).
- [ ] history.md y desmontar el worktree: son de F2.5 y F2.6, todavia no aplican.

### 4. Verificacion ejecutable (corrida por el reviewer)
- `./init.sh` con shim de `pnpm.cmd`: `x feature_list.json invalido: faltan specs para features sdd en vuelo: QC-114`.
- `pnpm.cmd run typecheck` sale 0; `pnpm.cmd run lint` sale 0.
- `vitest run` sobre los archivos de QC-73, `middleware-root-contract`, `account-lock`,
  `route-guard-request-id`, `usuarios-convenciones`, `recipe-route-contract` y las guardias tocadas:
  20 archivos, 185 pasan y 4 skipped.
- `vitest run tests/guards`: 42 archivos, 535 pasan y 5 skipped.
- `git diff origin/dev...HEAD -- middleware.ts db/ lib/modules/identity/domain/account-lock.ts`
  sale **vacio** (0 lineas).

### 5. Baseline (`tests/baseline-rojos.json`, `7407d293`): PASA
Entran 12 entradas nuevas (11 de integracion y `documentos-facade`). Todas llevan `motivo`,
`desde: 2026-09-19`, salida limpia y coste aceptado. Se amplian dos que ya existian
(`qc75-convenciones` y `unidades-convenciones`): la dependencia nueva rompe su caso de «package.json
igual a dev», y `guard-dependencias-aprobadas` sigue verde.

La afirmacion «falla igual en dev» esta respaldada en la bitacora
(`## Rojos tras sincronizar con dev > Prueba en origin/dev`): worktree desanclado en `63d15088`, los
mismos 22 casos y el `diff` de las lineas FAIL vacio. Coincide con el log del leader
(`gate-73b.log:4250-4719`).

Los rojos son de dos tipos, 23001 en lugar de 23503 en FK `RESTRICT` y filas `n` de NOT NULL en
`pg_constraint`. Los dos son compatibles con Postgres 18 y ninguno roza codigo de QC-73, que no toca
`db/`. `credential-setup` **no** se metio en el baseline (flake), y es lo correcto. **Ningun archivo
del baseline tapa un test de QC-73.**

### 6. Guardia ajena `usuarios-convenciones.test.ts`: NO se aflojo
El barrido pasa de `useActionState(` a `useActionState(|useRateLimitedActionState(`: cubre **mas**,
no menos. La anti-vacuidad queda intacta y entran tres casos sinteticos nuevos (true/true/false). La
alternativa, quedar ciega ante los formularios migrados, si habria sido aflojarla.
`guard-identificador-de-request` gana el alta del spec en la lista cerrada, por su punto de
extension, y `DEPENDENCIAS_ESPERADAS` pasa de 34 a 36 con las dos dependencias aprobadas.

### 7. Comentarios: ver bloqueantes 2 y 3 y menor 7
Las demas lineas de produccion que anade el diff (`edge.ts`, `route-guard-middleware.ts`, el dominio,
el hook, los componentes) no citan fichas ni requisitos, y sus bloques son cortos.
