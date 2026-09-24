# QC-109 — procesamiento-de-pdf-por-estrategia · bitácora de implementación

> Fase F2.1. Worktree `.worktrees/QC-109-procesamiento-de-pdf-por-estrategia`, rama
> `feature/QC-109-procesamiento-de-pdf-por-estrategia`. Spec aprobado por el humano.
> Tasks `[x]`: **T0–T10**. Sin marcar: **T11** (el gate completo lo corre el leader, no el implementer).
>
> **Incluye la enmienda fechada del 2026-09-18** decidida por el humano —la entrada inválida SÍ se
> registra, con el modo vacío—, que **cambia T3**. Motivo y alcance en `## 5.1`.

## 1. Archivos

### Creados — producción (todos en `lib/modules/documentos/`)

| Archivo | Task | Qué es |
|---|---|---|
| `domain/pdf-strategy.ts` | T1 | `pdfStrategySchema` (unión de literales zod), `PdfStrategy` y `MODE_BY_STRATEGY: Record<PdfStrategy, AiReadMode>` con `catalogo -> 'images'`, `formula -> 'pdf'`. `Record` y no `switch`: si el enum gana un valor y nadie le pone modo, **no compila**. |
| `domain/prompts/catalogo.json` | T2 | `{ "provisional": true, "loDefine": "QC-129", "prompt": "..." }`. Texto que **funciona**, no relleno. |
| `domain/prompts/formula.json` | T2 | Idem, con el texto de la otra estrategia. |
| `domain/prompts/index.ts` | T2 | Import por defecto de los dos `.json` y `PROMPT_BY_STRATEGY: Record<PdfStrategy, string>`. Unica fuente del prompt. Sin `fs`, `path` ni `process.cwd()`. |
| `ports/strategy-run-log.ts` | T3 | `StrategyRunSummary` (`strategy`, `mode` **anulable** por la enmienda de `## 5.1`, `path`, `pages` anulable, `textLength`) y `StrategyRunLog.run(summary)`. **La firma no admite el texto**: R9 la hace cumplir el compilador. |
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
(mismo precedente que `read-pdf-with-ai.ts:18`; por que eso **no** es una dependencia de terceros,
en la nota fechada de R16 y de `design.md > 5`, y el porque del hallazgo en `## 5.4`).

## 2. Mapa `R<n> -> test` (17/17, sin huecos)

`P` = `tests/unit/documentos/process-pdf-by-strategy.test.ts` ·
`A` = `tests/unit/documentos/qc109-alcance.test.ts`

| R | Archivo | Nombre exacto del caso |
|---|---|---|
| R1 | P | `R1 — una estrategia desconocida se rechaza con invalid_input y modo vacio, sin llamar a la lectura con IA` |
| R2 | P | `R2 — catalogo pide la lectura en modo images` |
| R3 | P | `R3 — formula pide la lectura en modo pdf` |
| R4 | A | `R4: el prompt de cada estrategia sale del .json importado como modulo, sin tocar disco ni red` |
| R5 | P | `R5 — la entrada que construye cada estrategia trae un prompt que pasa aiReadInputSchema, sin que el llamante aporte texto` |
| R6 | A | `R6: los dos .json traen provisional true, loDefine QC-129 y un prompt no vacio` |
| R7 | P | `R7 — devuelve el texto de la IA byte a byte, con su estrategia` |
| R8 | P | `R8 — registra exactamente una vez por ejecucion, en exito y en fallo, con los cinco campos` + (enmienda) `R8 — el rechazo por estrategia invalida se registra una vez, con el modo vacio y la estrategia tal como llego` |
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
- `design 3.4 — la red de seguridad del catch: si readPdfWithAi LANZA, la excepcion no se propaga y
  vuelve como ok:false con el code de UnexpectedError, registrando igual` — anadido por el menor 3 de
  la review; ver `## 5.5`.
- `R8 — pages sale del countPages inyectado y no de ningun otro sitio`.
- Adaptador: `R9 — la linea que escribe lleva la longitud y nunca el texto de la IA`,
  `R8 — con pages null escribe su hueco en vez de un numero inventado` y
  `R8 — con mode null escribe su hueco en vez de volcar el nulo`.
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

### Tras la enmienda del 2026-09-18 (`## 5.1`), vuelta a correr

`pnpm typecheck` y `pnpm lint` siguen sin errores ni hallazgos. La corrida, ahora con **3 casos mas**
—el nuevo de R8 para el rechazo registrado, el del hueco `sin-modo` del adaptador, y el R1
reescrito—:

```
$ pnpm exec vitest run tests/unit/documentos/process-pdf-by-strategy.test.ts \
    tests/unit/documentos/qc109-alcance.test.ts \
    tests/unit/documentos/module-contract.test.ts \
    tests/unit/composition/documentos-facade.test.ts \
    tests/unit/documentos/read-pdf-with-ai.test.ts

 Test Files  5 passed (5)
      Tests  69 passed (69)
   Duration  4.54s
```

`qc109-alcance.test.ts` **no hizo falta tocarlo**: sus listas son de **nombres** de exports y de
campos, no de tipos, así que el cambio de firma no las desfasa. El hueco `SIN_MODO` del adaptador se
dejó **sin exportar** justamente para no alterar la lista de exports que vigila R15.

### Tras los menores de la review (`## 5.4`), vuelta a correr

`pnpm typecheck` y `pnpm lint` siguen sin errores ni hallazgos. Con el caso de la rama `catch`
(`## 5.5`), uno más:

```
$ pnpm exec vitest run tests/unit/documentos/process-pdf-by-strategy.test.ts \
    tests/unit/documentos/qc109-alcance.test.ts \
    tests/unit/documentos/module-contract.test.ts \
    tests/unit/composition/documentos-facade.test.ts \
    tests/unit/documentos/read-pdf-with-ai.test.ts

 Test Files  5 passed (5)
      Tests  70 passed (70)
   Duration  4.09s
```

De los tres menores, **solo uno tocó `tests/`** y **ninguno tocó producción**: `git diff` sobre
`lib/` sale vacío en esta tanda. Los otros dos fueron notas fechadas en el spec y una renumeración
de epígrafes en esta bitácora.

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

## 5. El choque que se escalo, y como lo cerro el humano

### 5.1 El `mode` con estrategia invalida — **ENMIENDA APLICADA (2026-09-18)**

**Lo que se escalo.** `design.md > 3.3` fijaba `mode: AiReadMode` en **las dos** ramas de
`StrategyRunResult`, pero **el modo sale de la estrategia**: con una estrategia invalida no hay
ninguno que poner sin inventarlo. Se anulo el modo en la rama de fallo —se descarto poner `'pdf'` o
`'images'` a dedo, que seria una mentira que QC-111 leeria como verdad— y, como
`StrategyRunSummary.mode` NO era anulable, **ese rechazo salia mudo del registro**, lo que rozaba la
letra de R8. No se resolvio por cuenta propia: se paro y se subio.

**Lo que decidio el humano.** **La entrada invalida SI se registra, con el modo vacio.** Es una
enmienda fechada al spec aprobado, no un arreglo del implementer.

**El motivo, que es lo que importa:** **QC-111 va a leer la estrategia de la BASE DE DATOS**, no de
una constante del codigo. Un valor invalido **puede llegar de verdad en ejecucion** — no es solo un
error de programacion que TypeScript ya frena en el borde. Y ese es **exactamente** el caso que se
querria ver en los registros, justo el que la firma anterior dejaba mudo.

**Que se cambio, en disco:**

1. `ports/strategy-run-log.ts` — `StrategyRunSummary.mode` pasa a `AiReadMode | null`, igual que ya
   hacia `pages`, con doc de campo que dice **cuando** esta vacio. **Esto es cambiar T3**, que fijaba
   los cinco campos «exactamente» asi.
2. `domain/process-pdf-by-strategy.ts` — la rama de estrategia invalida **registra antes de
   devolver**: `mode: null`, `pages: null` (no se llama a `countPages` ahi), `textLength: 0`, `path`,
   y la estrategia **tal como llego**. El valor de retorno de esa rama **no cambia**.
3. `specs/.../design.md > 3.4` y `specs/.../tasks.md > T3` — **nota fechada 2026-09-18 con el POR
   QUE**, no solo el valor nuevo. De paso se corrigieron en `design.md` cuatro sitios que la enmienda
   dejaba desmentidos: el flujo de `## 3.3`, el «**Dos** consecuencias no obvias» que pasaban a ser
   tres, las filas de R1 y R8 de la tabla de `## 6`, y el bloque de codigo de `## 3.3`, cuya rama de
   fallo seguia mostrando el modo no anulable que el humano ya habia dado por bueno como anulable.

**R8 queda cumplido a la letra** —«exactamente una vez por ejecucion, tanto en exito como en
fallo»— y **su redaccion NO se toco**.

**Lo que NO cambio:** la firma del puerto **sigue sin admitir el texto** de la IA (R9). Lo que se
anulo es el modo, no la prohibicion.

### 5.2 Prosa que la enmienda dejo desmentida, y se reescribio

Misma trampa que ya se cazo en el test de la fachada: prosa vieja que el cambio nuevo convierte en
mentira. Se reviso y se reescribio en cuatro sitios ademas de los del design:

- `domain/process-pdf-by-strategy.ts`, comentario de la rama invalida: decia «Nada se ejecuto —ni
  lectura, ni conteo— y el resumen exige un modo, asi que aqui no hay ninguna entrada que
  registrar.» Era **falso** tras la enmienda.
- `domain/process-pdf-by-strategy.ts`, cabecera: ahora dice que **toda** llamada registra un
  resumen, incluida la que rechaza la estrategia.
- `process-pdf-by-strategy.test.ts`, cabecera: decia «con una estrategia desconocida no se lee nada
  y no se registra nada».
- El mensaje de asercion del caso R1, que explicaba que el retorno temprano ocurria ANTES de
  registrar.

La cabecera del puerto se releyo entera y **no** quedaba desmentida: solo afirma por que es un
puerto y que la firma no admite el texto, las dos cosas siguen siendo ciertas.

### 5.3 Nada mas choco

El mapeo `catalogo -> 'images'` / `formula -> 'pdf'` se verifico contra `read-pdf-with-ai.ts:173-174`
antes de escribir nada, y `extractText` del `PdfConverter` **no se usa** —la trampa estaba avisada—.
`resolveJsonModule` ya estaba activo: no se toco `tsconfig.json`, `next.config` ni `vitest.config`, y
no entro ningun loader.

### 5.4 Menores de la review, atendidos (2026-09-18)

La review salio **APROBADA: 0 bloqueantes, 6 menores**
(`progress/review_QC-109-procesamiento-de-pdf-por-estrategia.md`, commit `55654be`). De los seis, al
implementer le tocaron **tres**:

- **menor 2 — R16 y `@/lib/modules/errores`.** El test de forma admite ese import por el tipo
  `ErrorCode` y la **letra** de R16 no lo contemplaba. **El codigo no cambia y el test tampoco**: hoy
  afirma lo correcto, y relajarlo seria empeorarlo. Lo que faltaba era la linea que lo recoge, y se
  ha escrito con **nota fechada 2026-09-18** en dos sitios: el enunciado de **R16** en
  `requirements.md` y la seccion 5 de `design.md`. Dice lo mismo en los dos: un import del contrato
  publico de otro modulo **del propio repositorio** no es una dependencia de terceros —no toca
  `package.json`, no pasa los cuatro checks, no necesita fila en `docs/dependencias.md`—, que es de
  lo que habla `[D12]`. Mismo precedente que `read-pdf-with-ai.ts:18`, y ademas **impuesto por el
  propio diseño**: `design.md > 3.3` decide que el `code` no se traduce, y para no traducirlo hay que
  nombrar ese tipo. **La sustancia de R16 no se relaja.**
- **menor 3 — la rama `catch` sin test.** Ver `## 5.5`. Resumen: **la rama es alcanzable**, es una red
  de seguridad legitima y no codigo muerto, asi que se ha escrito el caso en vez de quitar el
  `catch`.
- **menor 6 — dos epigrafes numerados 5.2** en esta bitacora. Renumerado: el segundo es ahora `5.3`.
  Comprobado que ninguna referencia cruzada apuntaba al numero viejo.

Los otros tres no son del implementer y **no se han tocado**: T11 es del leader; el menor de
`current.md` («14 decisiones» y «una pregunta abierta» cuando son 16 y cero) lo corrigio el leader en
`6ba4b82`; y las cabeceras de 8-11 lineas frente a las ~5 de `conventions.md` **se quedan**, porque
replican el formato ya aprobado en QC-108 y cambiarlas aqui dejaria el modulo hablando dos idiomas
—es una ficha de limpieza por modulo, no un parche en esta—.

#### Nota sobre la verificacion de la review

El reviewer no se fio de que los tests pasaran: los probo con **tres mutaciones propias** —invertir
el mapa estrategia -> modo, meter un `trim()` al texto devuelto y suprimir el registro del rechazo
invalido— y dieron **3, 3 y 2 rojos**. Los tests muerden.

### 5.5 La rama `catch`: alcanzable, y ahora con caso que la ejercita

**La pregunta que habia que contestar antes de escribir nada** era si esa rama es **codigo muerto** o
una **red de seguridad legitima**, porque la respuesta cambia lo que hay que hacer: si nadie puede
provocarla, se quita; si alguien puede, se prueba. Fabricar un test artificial para tapar una rama
inalcanzable habria sido lo peor de los dos mundos.

**Es alcanzable, y de la forma mas simple posible:** `readPdfWithAi` entra **por parametro**
(`ProcessPdfByStrategyDeps`), asi que un doble puede lanzar sin ningun truco. Que hoy la
implementacion real devuelva `ok:false` en vez de lanzar es una propiedad del **contrato** de esa
dependencia, no del tipo: nada en la firma impide que una implementacion futura —o un adaptador mal
portado— lance. El `catch` es lo que sostiene que **esta** capa no lance y que **el resumen se
registre igual** si eso pasara, que es justo lo que R8 y R10 prometen. Se queda, y ahora esta
probado.

Caso nuevo:

```
design 3.4 — la red de seguridad del catch: si readPdfWithAi LANZA, la excepcion no se propaga y
vuelve como ok:false con el code de UnexpectedError, registrando igual
```

Sin `R<n>` en el nombre, a proposito: es consecuencia de diseño, no requisito, y sigue el estilo del
`design 3.4 —` que ya existia para el `countPages` que revienta.

Afirma las cuatro cosas juntas: que la excepcion **no se propaga** —con `try/catch` manual y
comprobando **que hay resultado**, porque un `.resolves` a secas pasaria verde aunque no lo hubiera—;
que el `code` es el de `UnexpectedError` **leido del propio error**, no un literal `'unexpected'`
escrito a mano; que el `reason` contiene el mensaje de lo que lanzo; que `strategy` y `mode` **no**
quedan vacios, porque aqui la estrategia si era valida; y que se registra **exactamente una vez** con
`textLength: 0`.

**Comprobado por mutacion, no supuesto.** Con `throw error;` como primera linea del `catch`
—equivalente a que el `catch` no exista—, el caso nuevo es **el unico** que se pone rojo
(`1 failed | 15 passed`). Eso prueba dos cosas: que muerde, y que **ningun otro caso cubria ya esa
rama**. La mutacion se revirtio y `git diff` sobre el archivo de produccion sale **vacio**:
verificado por mi, no solo reportado.

## 6. Decisiones de forma donde el design dejaba margen

- Nombres de los dos mapas: `MODE_BY_STRATEGY` y `PROMPT_BY_STRATEGY`, en mayusculas como
  `limits.ts`. Ninguno sale por el barril.
- `catch` defensivo alrededor del `readPdfWithAi` inyectado: convierte un lanzamiento en un fallo con
  el codigo de `UnexpectedError`, para que «no lanza nunca» y «registra exactamente una vez» sean
  ciertos **por este archivo** y no por confianza en el doble o en el adaptador. No reimplementa
  plazo ni topes.
- Linea del adaptador: prefijo fijo `[process-pdf-by-strategy]` con estrategia, modo, ruta, paginas y
  longitud, y huecos legibles en vez de volcar nulos: `sin-paginas` cuando no se pudo contar y
  `sin-modo` cuando la estrategia era invalida (mismo patron que `session-check-log-console.ts`).
  Las dos constantes de hueco se quedan **sin exportar**.
- Textos de prompt en espanol —es el idioma del negocio y del documento—; todos los
  **identificadores** en ingles salvo los dos literales del enum, que son nombres del negocio
  fijados en `[D1]`.
- Sin citas de ficha ni de requisito en comentarios de produccion. El `loDefine` de los `.json` si
  esta, y es correcto: es un campo de datos, no un comentario (`[D4]`/`[D15]`).

## 7. Que queda

1. **T11 — `./init.sh` completo**, que corre el leader antes del PR. Recordatorio del contexto: el
   gate del repo esta **rojo por deuda ajena** (QC-82 y QC-121 en vuelo sin spec en disco); eso no es
   de esta ficha.
2. ~~La decision de 5.1~~ — **cerrada por el humano el 2026-09-18 y ya aplicada** (`## 5.1`). No
   queda nada pendiente ahi.
3. **E2E: no hace falta en esta ficha**, y asi lo dicen `[D14]` y R17 —no hay pantalla ni recorrido
   de usuario que ejercitar, la capacidad no la invoca nadie todavia—. El E2E de la cadena lo aporta
   **QC-107**.
4. Los textos de prompt son **provisionales** y lo declaran en sus propios campos: los definitivos
   son de **QC-129**.
