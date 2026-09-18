# QC-109 — procesamiento-de-pdf-por-estrategia · bitácora de implementación

> Fase F2.1. Worktree `.worktrees/QC-109-procesamiento-de-pdf-por-estrategia`, rama
> `feature/QC-109-procesamiento-de-pdf-por-estrategia`. Spec aprobado por el humano.
> Tasks `[x]`: **T0–T10**. Sin marcar: **T11** (el gate completo lo corre el leader, no el implementer).

## 1. Archivos

### Creados — producción (todos en `lib/modules/documentos/`)

| Archivo | Task | Qué es |
|---|---|---|
| `domain/pdf-strategy.ts` | T1 | `pdfStrategySchema` (unión de literales zod), `PdfStrategy` y `MODE_BY_STRATEGY: Record<PdfStrategy, AiReadMode>` con `catalogo -> 'images'`, `formula -> 'pdf'`. `Record` y no `switch`: si el enum gana un valor y nadie le pone modo, **no compila**. |
| `domain/prompts/catalogo.json` | T2 | `{ "provisional": true, "loDefine": "QC-129", "prompt": "..." }`. Texto que **funciona**, no relleno. |
| `domain/prompts/formula.json` | T2 | Idem, con el texto de la otra estrategia. |
| `domain/prompts/index.ts` | T2 | Import por defecto de los dos `.json` y `PROMPT_BY_STRATEGY: Record<PdfStrategy, string>`. Unica fuente del prompt. Sin `fs`, `path` ni `process.cwd()`. |
| `ports/strategy-run-log.ts` | T3 | `StrategyRunSummary` (`strategy`, `mode`, `path`, `pages` anulable, `textLength`) y `StrategyRunLog.run(summary)`. **La firma no admite el texto**: R9 la hace cumplir el compilador. |
| `domain/process-pdf-by-strategy.ts` | T4 | `createProcessPdfByStrategy`. No importa `limits.ts`, ni `AiReader`, ni ningun adaptador, ni nombra al proveedor. Sin actor. |
| `adapters/driven/observability/strategy-run-log-console.ts` | T5 | Implementacion unica. Escritura por parametro con `console.log` por defecto; un test la espia sin parchear la consola global. |

### Creados — tests

- `tests/unit/documentos/process-pdf-by-strategy.test.ts` (T6) — comportamiento, con dobles.
- `tests/unit/documentos/qc109-alcance.test.ts` (T6) — forma y ausencia, patron de `qc108-alcance.test.ts`
  (merge-base contra `origin/dev`/`dev`, salto ruidoso fuera de la rama, ancla anti-vacuidad y
  detectores puros con su caso de «muerde»).

### Modificados

- `lib/modules/documentos/index.ts` (T7) — anade al final `pdfStrategySchema`, `PdfStrategy`,
  `createProcessPdfByStrategy`, `ProcessPdfByStrategyDeps`, `ProcessPdfByStrategyInput`,
  `StrategyRunResult`. **No** salen el puerto, los `.json` ni el adaptador. Diff puramente aditivo.
- `lib/composition/index.ts` (T8) — `readPdfWithAi` se extrae a una const (misma llamada, misma
  semantica) para que la fachada y el procesamiento por estrategia compartan una sola construccion;
  `strategyRunLog = createStrategyRunLogConsole()`; y `processPdfByStrategy` en la fachada
  `documentos`. Imports nuevos al final de sus bloques. Nada reordenado. Construir la fachada sigue
  sin leer una variable de entorno ni tocar la red.
- `tests/unit/documentos/module-contract.test.ts` — **lista congelada extendida** con los 2 simbolos
  de ejecucion y los 4 tipos que el barril gana. Sigue con igualdad exacta; no se relajo nada.
- `tests/unit/composition/documentos-facade.test.ts` — la lista de claves de la fachada gana
  `processPdfByStrategy`. El **nombre del caso y la cabecera** decian «junto a las cuatro claves que
  ya tenia» nombrando un solo anadido: se reescribieron porque lo nuevo los desmentia.

**Nada mas se toco.** `git diff --stat` contra la merge-base **no** incluye `package.json`,
`pnpm-lock.yaml`, `tsconfig.json` ni `next.config` (T9). Cero dependencias nuevas: los archivos
nuevos importan `zod`, codigo del propio modulo y el tipo `ErrorCode` de `@/lib/modules/errores`
(mismo precedente que `read-pdf-with-ai.ts`).

## 2. Mapa `R<n> -> test` (17/17, sin huecos)

`P` = `tests/unit/documentos/process-pdf-by-strategy.test.ts` ·
`A` = `tests/unit/documentos/qc109-alcance.test.ts`

| R | Archivo | Nombre exacto del caso |
|---|---|---|
| R1 | P | `R1 — una estrategia desconocida se rechaza con invalid_input, sin leer y sin registrar` |
| R2 | P | `R2 — catalogo pide la lectura en modo images` |
| R3 | P | `R3 — formula pide la lectura en modo pdf` |
| R4 | A | `R4: el prompt de cada estrategia sale del .json importado como modulo, sin tocar disco ni red` |
| R5 | P | `R5 — la entrada que construye cada estrategia trae un prompt que pasa aiReadInputSchema, sin que el llamante aporte texto` |
| R6 | A | `R6: los dos .json traen provisional true, loDefine QC-129 y un prompt no vacio` |
| R7 | P | `R7 — devuelve el texto de la IA byte a byte, con su estrategia` |
| R8 | P | `R8 — registra exactamente una vez por ejecucion, en exito y en fallo, con los cinco campos` |
| R9 | P | `R9 — el resumen registrado no contiene el texto por ningun lado, y textLength coincide con su longitud` |
| R10 | P | `R10 — un fallo de la lectura vuelve con su mismo code y reason, sin lanzar y sin inventar texto` |
| R11 | A | `R11: ningun archivo nuevo escribe a mano un literal de limite ni importa domain/limits.ts` |
| R12 | P | `R12 — la firma no admite actor y el caso corre entero sin recibir ninguno ni exigir permiso` |
| R13 | A | `R13: el barrel exporta el esquema y la fabrica, y no el puerto, ni los prompts, ni el adaptador` + `R13: ningun archivo de app/ ni ningun adaptador driving invoca processPdfByStrategy` |
| R14 | A | `R14: ningun archivo de domain/ ni de ports/ del modulo nombra al proveedor ni a un adaptador` |
| R15 | A | `R15: los simbolos y campos que introduce la ficha son los nombres ingleses esperados, y solo los literales del enum no lo son` |
| R16 | A | `R16: los archivos nuevos solo importan zod, codigo del propio modulo y el catalogo de errores` + `R16: el diff de la rama no toca package.json, pnpm-lock.yaml, tsconfig.json ni next.config` |
| R17 | A | `R17: el diff de la rama no trae ningun archivo bajo e2e/` |

Casos de refuerzo, no de requisito:

- `design 3.4 — si countPages LANZA, el resumen va con pages null y la ejecucion sigue igual`
  (compara el resultado **entero** contra una corrida con conteo sano, con `toEqual`).
- `R8 — pages sale del countPages inyectado y no de ningun otro sitio`.
- Adaptador: `R9 — la linea que escribe lleva la longitud y nunca el texto de la IA` y
  `R8 — con pages null escribe su hueco en vez de un numero inventado`.
- Cada detector de `A` tiene su caso de «muerde» con una entrada infractora inventada, y cada caso
  de diff su ancla anti-vacuidad (`specs/QC-109-.../` en el rango; los 7 archivos nuevos leidos no
  vacios; mas de cero archivos escaneados bajo `app/` y `adapters/driving/`).

Ningun requisito se apoya en un test que pase por otra razon, y ninguno queda «demostrado por
partes»: R1, R5, R7, R8, R9 y R10 tienen cada uno un caso que ejercita el enunciado entero.

## 3. Salida real de los tests

`pnpm typecheck` y `pnpm lint` — sin errores ni hallazgos (no hizo falta `next typegen`):

```
> quimicloude@0.1.0 typecheck
> tsc --noEmit

> quimicloude@0.1.0 lint
> eslint
```

Corrida final, la que cierra la tanda:

```
$ pnpm exec vitest run tests/unit/documentos/process-pdf-by-strategy.test.ts \
    tests/unit/documentos/qc109-alcance.test.ts \
    tests/unit/documentos/module-contract.test.ts \
    tests/unit/composition/documentos-facade.test.ts \
    tests/unit/documentos/qc108-alcance.test.ts \
    tests/unit/documentos/read-pdf-with-ai.test.ts

 RUN  v4.1.10 C:/Users/Cristian/.../QC-109-procesamiento-de-pdf-por-estrategia

 Test Files  6 passed (6)
      Tests  72 passed | 8 skipped (80)
   Duration  5.54s
```

Los **8 saltados** son los casos de diff de `qc108-alcance.test.ts`: se saltan ruidosamente porque
estamos en la rama de QC-109 y no en la suya. Es el comportamiento que esa guardia declara, no un
agujero. Los 33 casos propios de QC-109 pasan, ninguno saltado.

### Lo que encontro la corrida intermedia (y ya esta arreglado)

`pnpm exec vitest related --run` sobre los nueve archivos tocados arrastro 147 archivos
—`lib/composition` lo importa medio repositorio— y dio **3 rojos**, los tres NUESTROS y **ninguno en
`tests/baseline-rojos.json`** (ahi solo figura `tests/unit/recetas/module-contract.test.ts`):

- `module-contract.test.ts` x2 — las listas congeladas del barril no conocian los 6 simbolos nuevos.
- `documentos-facade.test.ts` x1 — la lista de claves de la fachada no conocia `processPdfByStrategy`.

Son exactamente lo que esas guardias existen para provocar: el contrato no crece en silencio. Se
**extendio** la lista esperada en los tres, manteniendo la igualdad exacta. No se relajo ninguna
asercion, no se salto ningun caso y el caso de «la regla muerde» de `module-contract` sigue intacto
y en verde.

## 4. Lo que NO se corrio, a proposito

- `pnpm test` (suite completa), `pnpm e2e` y `./init.sh`: **el gate lo corre el leader**
  (`AGENTS.md > Regla del gate: quien corre que`). Ningun subagente lo hizo.
- **T6 tiene un roce con esa regla**: su criterio de «Hecho» dice literalmente `pnpm test` verde.
  Se cumplio el espiritu —los 17 requisitos tienen caso y los archivos relacionados estan verdes—
  pero la suite entera la cierra T11, que queda para el leader.

## 5. Choques entre spec y codigo — **para el leader, no resueltos en silencio**

### 5.1 El `mode` en el fallo por estrategia invalida (desviacion real de `design.md > 3.3`)

`design.md > 3.3` fija `mode: AiReadMode` en **las dos** ramas de `StrategyRunResult`. Pero **el modo
sale de la estrategia**: con una estrategia invalida no hay ningun modo que poner sin inventarlo.

Resuelto asi, y es la **unica** desviacion respecto del design:

- La rama de fallo declara el modo como anulable. La rama de exito queda intacta, con `AiReadMode`.
  El `null` solo aparece en el caso de estrategia invalida; un fallo de lectura trae el modo real.
- Se descarto poner `'pdf'` o `'images'` a dedo: seria una mentira en el resultado que QC-111
  leeria como verdad.

**Consecuencia, y es la parte que conviene mirar:** `StrategyRunSummary.mode` NO es anulable —T3 lo
fija «exactamente» asi y no se toco—, asi que **la estrategia invalida no se registra**. Es coherente
con el flujo escrito en `design.md > 3.3`, donde el retorno temprano por estrategia invalida ocurre
**antes** de `log.run`. Pero roza la letra de **R8** («exactamente una vez por ejecucion, tanto en
exito como en fallo»): aqui «ejecucion» se ha entendido como «se intento leer». Si la lectura que
quieres de R8 es «tambien en entrada invalida», hay que anular el modo **tambien en el puerto**, y
eso es cambiar T3. **No se ha hecho por cuenta propia.**

### 5.2 Nada mas choco

El mapeo `catalogo -> 'images'` / `formula -> 'pdf'` se verifico contra `read-pdf-with-ai.ts:173-174`
antes de escribir nada, y `extractText` del `PdfConverter` **no se usa** —la trampa estaba avisada—.
`resolveJsonModule` ya estaba activo: no se toco `tsconfig.json`, `next.config` ni `vitest.config`, y
no entro ningun loader.

## 6. Decisiones de forma donde el design dejaba margen

- Nombres de los dos mapas: `MODE_BY_STRATEGY` y `PROMPT_BY_STRATEGY`, en mayusculas como
  `limits.ts`. Ninguno sale por el barril.
- `catch` defensivo alrededor del `readPdfWithAi` inyectado: convierte un lanzamiento en un fallo con
  el codigo de `UnexpectedError`, para que «no lanza nunca» y «registra exactamente una vez» sean
  ciertos **por este archivo** y no por confianza en el doble o en el adaptador. No reimplementa
  plazo ni topes.
- Linea del adaptador: prefijo fijo `[process-pdf-by-strategy]` con estrategia, modo, ruta, paginas y
  longitud, y `sin-paginas` cuando no se pudo contar (mismo patron de hueco que
  `session-check-log-console.ts`).
- Textos de prompt en espanol —es el idioma del negocio y del documento—; todos los
  **identificadores** en ingles salvo los dos literales del enum, que son nombres del negocio
  fijados en `[D1]`.
- Sin citas de ficha ni de requisito en comentarios de produccion. El `loDefine` de los `.json` si
  esta, y es correcto: es un campo de datos, no un comentario (`[D4]`/`[D15]`).

## 7. Que queda

1. **T11 — `./init.sh` completo**, que corre el leader antes del PR. Recordatorio del contexto: el
   gate del repo esta **rojo por deuda ajena** (QC-82 y QC-121 en vuelo sin spec en disco); eso no es
   de esta ficha.
2. **La decision de 5.1**, si el leader quiere que la estrategia invalida tambien se registre.
3. **E2E: no hace falta en esta ficha**, y asi lo dicen `[D14]` y R17 —no hay pantalla ni recorrido
   de usuario que ejercitar, la capacidad no la invoca nadie todavia—. El E2E de la cadena lo aporta
   **QC-107**.
4. Los textos de prompt son **provisionales** y lo declaran en sus propios campos: los definitivos
   son de **QC-129**.
