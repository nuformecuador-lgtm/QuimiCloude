# QC-129 — textos-definitivos-de-los-prompts · design.md

> Diseño de los requisitos de `requirements.md`. No reabre el alcance ni la tabla de decisiones: las
> fijó el humano el 2026-09-18.
>
> **Regla de lectura.** Donde este documento dice «hoy», habla del estado de `dev` con QC-109 ya
> mergeada.

## 1. Qué se construye, en una frase

El texto del prompt deja de vivir en el repositorio y pasa a ser **configuración de despliegue**:
una variable de entorno por estrategia, leída dentro de la invocación por un adaptador driven de
configuración, inyectada al caso de uso por `lib/composition` y, si falta, un fallo que la nombra
antes de tocar al proveedor. Los dos `.json` y su mapa se borran. La calidad del texto la firma una
persona en un documento de `docs/`.

## 2. La cadena, hoy y después

**Hoy** (QC-109):

```
process-pdf-by-strategy.ts ── import ──> domain/prompts/index.ts ── import ──> catalogo.json
                                                                              formula.json
```

El texto entra en el paquete de despliegue en tiempo de compilación. `PROMPT_BY_STRATEGY[strategy]`
no puede fallar: siempre hay texto.

**Después** (QC-129):

```
lib/composition ── cablea ──> ports/strategy-prompt.ts
                                   ^ implementado por
                              adapters/driven/config/strategy-prompt-env.ts ──> process.env
                                   ^ inyectado como dep
process-pdf-by-strategy.ts ── llama en la invocación ──> promptFor(strategy)  ── puede fallar
```

`promptFor` **se invoca dentro** de `processPdfByStrategy`, no al construir la fachada: eso es lo que
sostiene R2 y lo que permite que `lib/composition` y la suite entera sigan arrancando sin variables
(el mismo motivo escrito en la cabecera de `ai-config-env.ts`).

## 3. Por qué un puerto y un adaptador, y no `process.env` en el dominio

`domain/` es puro y no conoce plataforma (`docs/architecture.md`). Leer `process.env` ahí rompería
esa regla y además haría imposible el test sin manipular el entorno global. El módulo ya tiene el
patrón montado dos veces —`ai-config-env.ts` y `document-storage-config-env.ts`—: **la lectura de
entorno vive en `adapters/driven/config/`**. Lo único nuevo es que aquí el consumidor es el
**dominio**, no otro adaptador, así que hace falta la **abstracción** entre medias: un puerto, igual
que `StrategyRunLog`.

## 4. Archivos

| # | Archivo | Qué pasa | Requisitos |
|---|---|---|---|
| 4.1 | `lib/modules/documentos/ports/strategy-prompt.ts` | **nuevo** | R1, R19 |
| 4.2 | `lib/modules/documentos/adapters/driven/config/strategy-prompt-env.ts` | **nuevo** | R1, R2, R3, R4, R5 |
| 4.3 | `lib/modules/documentos/domain/process-pdf-by-strategy.ts` | **modificado** | R2, R4, R6, R7 |
| 4.4 | `lib/modules/documentos/domain/prompts/` (3 archivos) | **borrado** | R8, R9 |
| 4.5 | `lib/modules/documentos/index.ts` | **modificado** (solo el comentario del último bloque) | R19 |
| 4.6 | `lib/composition/index.ts` | **modificado** (una línea de cableado + su import) | R1, R2 |
| 4.7 | `.env.example` | **modificado** (bloque nuevo, al final) | R14 |
| 4.8 | `docs/revision-de-prompts.md` | **nuevo** | R15, R16, R17 |
| 4.9 | `tests/unit/documentos/qc109-alcance.test.ts` | **modificado** | R20 |
| 4.10 | `specs/QC-109-.../requirements.md` | **modificado** (nota fechada al final) | R21 |
| 4.11 | tests nuevos (ver `§ 8`) | **nuevos** | R1–R9, R19 |

Nada más. **No hay migración, no hay tabla, no hay RLS, no hay endpoint, no hay ruta de Next y no hay
pantalla**: esta ficha no persiste ni expone nada. `§ 6` lo dice a propósito para que el reviewer no
lo busque.

### 4.1 El puerto (`ports/strategy-prompt.ts`)

```ts
import type { PdfStrategy } from '../domain/pdf-strategy';

/**
 * El texto del prompt de una estrategia, resuelto EN LA INVOCACION. Sincrono: la unica fuente
 * prevista es el entorno del proceso, y volverlo asincrono obligaria a await sin necesidad.
 */
export type StrategyPrompt = {
  /** Lanza si el texto no esta configurado. El dominio traduce ese fallo; no lo propaga. */
  readonly promptFor: (strategy: PdfStrategy) => string;
};
```

**Lanzar, no devolver `null`.** Es lo que ya hace `readAiConfigFromEnv`, y unifica el caso: el
dominio ya tiene un `try/catch` alrededor de la llamada a la IA por el mismo motivo. Devolver
`string | null` obligaría al dominio a redactar el nombre de la variable —que es cosa del
adaptador— o a perderlo.

### 4.2 El adaptador (`adapters/driven/config/strategy-prompt-env.ts`)

Copia deliberada de la forma de `ai-config-env.ts`:

- `const ENV_VAR_BY_STRATEGY: Record<PdfStrategy, string> = { catalogo: 'CATALOG_PROMPT', formula:
  'FORMULA_PROMPT' }`. Es un `Record` y no un `switch` por el mismo motivo que `MODE_BY_STRATEGY`:
  si mañana hay una tercera estrategia, **no compila** hasta que alguien le dé su variable.
- Los dos nombres viven **una sola vez**, como valores de ese `Record` (R1).
- Ausente, vacía o solo-espacios cuenta como ausente (R3); el valor se devuelve **sin recortar**,
  igual que `readRequiredEnv`, porque un prompt puede querer su salto de línea final.
- El error dice `falta la variable de entorno CATALOG_PROMPT` y **no incluye ningún valor** (R4, R7).
- Se lee dentro de la función exportada, nunca en el top-level (R2).

### 4.3 El caso de uso (`domain/process-pdf-by-strategy.ts`)

Cambia en tres sitios y en ninguno más:

1. `ProcessPdfByStrategyDeps` gana `readonly prompt: StrategyPrompt` (el tipo del puerto, como ya
   hace con `StrategyRunLog`).
2. Desaparece `import { PROMPT_BY_STRATEGY } from './prompts'`.
3. Donde hoy dice `const prompt = PROMPT_BY_STRATEGY[strategy];` pasa a:

```ts
let prompt: string;
try {
  prompt = deps.prompt.promptFor(strategy);
} catch (error) {
  deps.log.run({ strategy, mode, path: input.path, pages: null, textLength: 0 });
  return {
    ok: false, strategy, path: input.path, mode,
    code: new UnexpectedError().code,
    reason: `process-pdf-by-strategy: ${causaDe(error)}`,
  };
}
```

Puntos que el implementer no puede cambiar sin volver aquí:

- **El `return` va antes de `contarPaginas` y antes de `deps.readPdfWithAi`.** Ese orden ES R4: sin
  variable no se llama al proveedor. Un test lo afirma con un `readPdfWithAi` espía que no debe
  recibir ninguna llamada.
- **`mode` sí se conoce** (la estrategia era válida), así que el resumen lo lleva; `pages` va `null`
  porque no llegó a contarse, exactamente igual que en el rechazo por estrategia inválida.
- **Se registra una vez** (R6), respetando QC-109 R8.
- **`causaDe(error)` transporta el mensaje del adaptador**, que trae el nombre de la variable y
  ningún valor (R4, R7).

**El `code` es `unexpected`, y es una elección, no un descuido.** `invalid_input` diría que la
entrada del usuario está mal, y no lo está; `ai_unavailable` diría que el proveedor falló, y ni se
le llamó. Un despliegue sin configurar es un fallo propio: `unexpected` es exactamente eso en el
catálogo (`lib/modules/errores/domain/error-codes.ts`). **No se añade un código nuevo**
(`prompt_not_configured`) porque ampliar el catálogo cerrado exige enmienda y aprobación humana
—las ocho anteriores están fechadas ahí—, y aquí no hay ninguna pantalla que deba distinguir este
caso: quien lo ve es el registro del servidor, y el `reason` ya lo nombra. Si el humano prefiere el
código propio, se decide en la puerta de aprobación de este spec y se anota como novena enmienda.

### 4.4 El borrado

Se borran los tres archivos de `domain/prompts/`. Tras el borrado, `rg -n "PROMPT_BY_STRATEGY|
domain/prompts"` no debe devolver nada fuera de `specs/` y de la nota fechada de QC-109 (R8, R9).

### 4.5 y 4.6 El contrato y el cableado

El barril **no gana ni pierde exportaciones**: hoy ya no publica los prompts, y tampoco publicará el
puerto nuevo (R19). Lo único que cambia es el comentario del último bloque, que hoy dice «los textos
de prompt NO salen por aquí… son detalle interno» y pasa a decir que el prompt llega **por
dependencia, desde el entorno**. En `lib/composition/index.ts`, junto a `strategyRunLog`:

```ts
const strategyPrompt: StrategyPrompt = { promptFor: readStrategyPromptFromEnv };
```

y `processPdfByStrategy: createProcessPdfByStrategy({ readPdfWithAi, countPages, log, prompt:
strategyPrompt })`. **Se referencia, no se invoca**: construir la fachada sigue sin leer una sola
variable, que es lo que afirma `tests/unit/composition/documentos-facade.test.ts`.

### 4.7 `.env.example`

Bloque nuevo al final, con la misma voz que los cuatro que ya hay: dice que se leen en la
invocación, que si falta el procesamiento falla nombrándola y que **no llevan valor de ejemplo**
—escribir aquí medio prompt sería justo el rastro que `[D13]` prohíbe (R9)—.

### 4.8 La plantilla del registro (`docs/revision-de-prompts.md`)

La escribe el arnés; **la rellena y la firma una persona** (R15, R17). Estructura fija:

**Cabecera del documento** (texto, una vez): qué es, por qué no hay test que lo sustituya (`[D5]`),
y la consecuencia aceptada de `[D13]` escrita con todas sus letras: *este registro no copia el texto
del prompt, así que un veredicto no se puede volver a comprobar contra el texto al que se refería*
(R16).

**Una sección por pasada**, con su ficha de cuatro datos:

| Dato | Valor |
|---|---|
| Fecha | `AAAA-MM-DD` |
| Estrategia | `catalogo` \| `formula` |
| PDF de muestra | nombre del archivo y nº de páginas (**el PDF no entra al repositorio**) |
| Firma | nombre de la persona que revisó |

**Y su tabla de veredictos, una fila por campo.** Las filas están **prefijadas por estrategia**: son
exactamente los campos que R10 y R11 exigen pedir, ni uno más.

`catalogo` — seis filas:

| Campo | Veredicto | Nota |
|---|---|---|
| nombre | bien / mal / no estaba | |
| presentación | bien / mal / no estaba | |
| unidad | bien / mal / no estaba | |
| precio | bien / mal / no estaba | |
| compra mínima | bien / mal / no estaba | |
| tiempo de entrega | bien / mal / no estaba | |

`formula` — cinco filas:

| Campo | Veredicto | Nota |
|---|---|---|
| nombre | bien / mal / no estaba | |
| descripción | bien / mal / no estaba | |
| materias primas (cantidad) | bien / mal / no estaba | |
| materias primas (unidad) | bien / mal / no estaba | |
| pasos y su orden | bien / mal / no estaba | |

Y **dos filas de cierre comunes a las dos estrategias**, que son las que prueban `[D3]` y `[D4]`:

| Comprobación | Veredicto | Nota |
|---|---|---|
| la respuesta es JSON con la forma que el prompt declara (R12) | bien / mal | |
| lo que el PDF no traía volvió `null`, sin inventarse (R13) | bien / mal / no aplica | |

**Qué significa cada veredicto**, escrito en el propio documento para que dos personas no lo lean
distinto:

- **bien** — el dato salió y coincide con lo que dice el PDF.
- **mal** — el dato salió y **no** coincide, o salió inventado.
- **no estaba** — el PDF no traía ese dato y la IA lo devolvió **vacío**. Es el veredicto **correcto**
  para un campo ausente: no es un fallo, es `[D4]` funcionando. Si el PDF no lo traía y la IA lo
  rellenó, eso es **mal**.

**Cuándo se da por bueno un prompt:** cuando su tabla no tiene ningún **mal**. La nota es
obligatoria en toda fila con **mal**.

## 5. Contratos de entrada y salida

La firma pública de `processPdfByStrategy` **no cambia**: mismo `ProcessPdfByStrategyInput`, mismo
`StrategyRunResult`. Lo único que cambia es `ProcessPdfByStrategyDeps`, que es lo que ve
`lib/composition` y nadie más. QC-111 puede escribirse contra el contrato de hoy sin enterarse.

Lo que sí cambia es el **conjunto de fallos posibles**: a los de QC-109 R10 se suma uno nuevo con
`code: 'unexpected'` y un `reason` que nombra la variable. Se escribe aquí porque QC-111 tendrá que
decidir qué hace la cola con él (reintentar no lo arregla: falta configuración).

## 6. Modelo de datos, rutas, endpoints, integraciones

**Ninguno.** Sin tabla, sin columna, sin migración, sin política RLS, sin endpoint, sin ruta de Next,
sin Server Action y sin pantalla. La única «integración externa» es el entorno del proceso, y ni
siquiera es una llamada: es `process.env`. El proveedor de IA ya estaba integrado por QC-108 y esta
ficha no toca su adaptador.

**Variables de entorno nuevas:** dos, `CATALOG_PROMPT` y `FORMULA_PROMPT`. Valor: el texto del
prompt, tal cual, con saltos de línea. Sin valor por defecto, sin prefijo `NEXT_PUBLIC_` —no son
públicas, y aunque no son un secreto, no tienen por qué viajar al navegador—.

## 7. Dependencias de terceros

**Ninguna nueva.** Lo que esta ficha hace es leer `process.env`, borrar tres archivos y escribir un
documento; no hay nada que una librería pueda resolver mejor. El `package.json`, el
`pnpm-lock.yaml`, el `tsconfig.json` y el `next.config` **no se tocan**, y la guardia de QC-109 R16
lo seguirá comprobando mientras esta rama esté viva. Si el implementer se encuentra queriendo
instalar algo, es señal de que se salió del diseño: para y pregunta
(`docs/architecture.md > Dependencias de terceros`).

## 8. Verificación y trazabilidad

### 8.1 La declaración que el reviewer tiene que leer antes de contar huecos

`[D5]` dice que **ningún test llama a Gemini**. Por tanto **R10–R14 y R16–R17 no se mapean a un caso
de Vitest**: se mapean a una **fila firmada de `docs/revision-de-prompts.md`**. Es el mismo trato que
QC-114 le dio a la pasada en iPhone real: la evidencia existe, está en disco, tiene fecha y firma, y
no es ejecutable. **No es un hueco de trazabilidad y no debe rechazarse como tal.** Lo que sí es
ejecutable, y se exige entero, es el mecanismo: R1–R9, R15 (la plantilla existe y tiene las filas y
los veredictos previstos), R18, R19, R20 y R21.

### 8.2 Mapa `R<n>` → evidencia

| Requisito | Evidencia |
|---|---|
| R1 | `tests/unit/documentos/strategy-prompt-env.test.ts`: cada estrategia lee su propia variable; cambiar una no afecta a la otra |
| R2 | mismo archivo (el import del adaptador con el entorno vacío no lanza) + `tests/unit/composition/documentos-facade.test.ts` (construir la fachada sin variables) |
| R3 | `strategy-prompt-env.test.ts`: ausente, `''` y `'   '` dan el mismo fallo; un valor con espacios alrededor se devuelve sin recortar |
| R4 | `tests/unit/documentos/process-pdf-by-strategy.test.ts`: caso «falta la variable» → `ok:false`, el `reason` contiene el nombre, y el `readPdfWithAi` espía recibe **cero** llamadas |
| R5 | `strategy-prompt-env.test.ts`: con `CATALOG_PROMPT` puesta y `FORMULA_PROMPT` vacía, `formula` falla (no hereda) |
| R6 | `process-pdf-by-strategy.test.ts`: el espía del registro recibe **una** llamada, con `mode` y `pages: null` |
| R7 | `process-pdf-by-strategy.test.ts`: ni el `reason` ni el resumen registrado contienen el texto inyectado |
| R8 | caso de forma en `qc109-alcance.test.ts` (actualizado): las tres rutas de `domain/prompts/` **no existen** en disco y nadie las importa |
| R9 | mismo caso de forma, por búsqueda de `PROMPT_BY_STRATEGY` y `domain/prompts` en los archivos versionados |
| R10 | **fila del registro**: tabla `catalogo` de `docs/revision-de-prompts.md`, seis campos |
| R11 | **fila del registro**: tabla `formula`, cinco campos |
| R12 | **fila del registro**: fila de cierre «la respuesta es JSON con la forma declarada» |
| R13 | **fila del registro**: fila de cierre «lo que no traía volvió `null`» + veredicto «no estaba» |
| R14 | **humano**: T10, escribir las dos variables en Vercel. Cubierto solo para producción mientras la **pregunta abierta 1** siga abierta |
| R15 | test de documento: `docs/revision-de-prompts.md` existe, y trae las once filas de campo y los tres veredictos literales |
| R16 | mismo test de documento: la plantilla no tiene columna para el texto del prompt y la frase de la consecuencia aceptada está presente |
| R17 | **humano**: T11, la pasada firmada |
| R18 | la suite entera corre en el gate sin `GEMINI_API_KEY` ni las dos variables nuevas; los tests del dominio inyectan un `promptFor` falso |
| R19 | caso de `qc109-alcance.test.ts` (ya existente) sobre las reexportaciones del barril, ampliado con `StrategyPrompt` |
| R20 | el propio `qc109-alcance.test.ts` en verde, con sus casos de R11, R13, R14, R15, R16 y R17 intactos |
| R21 | la nota fechada existe en el `requirements.md` de QC-109 (inspección del reviewer) |

### 8.3 Qué se toca del test de QC-109, literalmente

`tests/unit/documentos/qc109-alcance.test.ts` hoy:

- importa `catalogo.json`, `formula.json` y `PROMPT_BY_STRATEGY` (líneas 17–19) → **se quitan los
  tres imports**, que si no el archivo ni compila tras el borrado;
- `ARCHIVOS_NUEVOS` lista los tres archivos de prompts → **salen de la lista** y entran
  `ports/strategy-prompt.ts` y el adaptador de configuración; el `toHaveLength(7)` pasa a `8`;
- el `describe` de **R4** («los prompts entran por import») → se **reescribe** como «R4 derogado por
  QC-129 `[D7]`»: el texto ya no entra por import, y lo que se comprueba ahora es que los tres
  archivos **no existen** y que el dominio sigue sin importar `fs`, `path` ni usar `process.cwd`
  —esa mitad de R4 **sigue vigente**: una variable de entorno no es disco ni red—. El caso del
  detector se conserva tal cual;
- el `describe` de **R6** (la marca de provisional) → **se borra entero**, con una nota en su lugar
  diciendo que QC-129 lo derogó y por qué. No queda `.json` que marcar;
- el caso de **R13** que lista `PROMPT_BY_STRATEGY` entre lo no publicado → **se conserva**, y se le
  suma `StrategyPrompt`: el símbolo ya no existe, pero la guardia sigue diciendo que nada de esa
  familia sale por el barril. En el caso del detector de reexportaciones (que usa
  `PROMPT_BY_STRATEGY` como fuente **inventada**, no como import) el nombre puede quedarse: no
  resuelve nada;
- el caso de **R15** compara la lista exacta de símbolos exportados, que incluye
  `PROMPT_BY_STRATEGY` → **se actualiza**: sale ese nombre, entra `StrategyPrompt` (y el nombre de
  la función del adaptador, si el archivo entra en `ARCHIVOS_NUEVOS`);
- **R11, R14, R16 y R17 no se tocan.** Siguen mordiendo sobre la lista nueva de archivos.

El criterio es el de la **T3 de QC-81**: el test se actualiza porque la ficha hizo justo lo que la
ficha pedía, y el cambio se deja **escrito en el propio test**, no silenciado.

### 8.4 El gate

`./init.sh --rapido` al cerrar cada tanda y `./init.sh` completo antes del PR (regla 5 de
`CLAUDE.md`). **Aviso heredado:** hoy `scripts/validate-features.mjs` corta antes de typecheck con
`faltan specs para features sdd en vuelo: QC-82`. **No es deuda de esta rama** y no se arregla desde
aquí; si sigue rojo al cerrar, se declara en la tarea del gate como hizo la T11 de QC-109, con la
lista de lo que sí se corrió a mano.

## 9. Alternativa descartada (principal): una sola variable con los dos textos en JSON

**La idea.** Una `STRATEGY_PROMPTS` con `{"catalogo": "...", "formula": "..."}`, parseada al
invocar. Una variable que administrar en vez de dos, y la forma del `Record` se conserva.

**Por qué no.** Tres motivos, y el primero es una decisión cerrada:

1. **`[D8]` ya eligió dos**, una por estrategia, y este documento no reabre la tabla.
2. **Editar el prompt del catálogo obligaría a reescribir el de la fórmula** en el mismo campo de
   texto de Vercel. Un prompt es un párrafo largo con comillas, saltos de línea y llaves —justo lo
   que hay que escapar dentro de un JSON—: el error más probable no es semántico, es una comilla mal
   puesta que **rompe las dos estrategias a la vez**.
3. **El fallo dejaría de nombrar qué falta.** Con una variable, «falta `STRATEGY_PROMPTS`» o «el
   JSON no parsea» es lo máximo que se puede decir; con dos, el mensaje dice `CATALOG_PROMPT` y
   quien lo lee sabe exactamente qué campo abrir en Vercel. `[D9]` pide justo eso.

## 10. Alternativa descartada (secundaria): dejar los `.json` como red de seguridad

**La idea.** Conservar `domain/prompts/` como valor por defecto y usar la variable solo si está:
`promptFor(s) ?? PROMPT_BY_STRATEGY[s]`. Ningún entorno se quedaría sin poder procesar, y la
pregunta abierta 1 —quién pone las variables en preview— dejaría de doler.

**Por qué no.** Es exactamente lo que `[D9]` y `[D11]` prohíben, y por el motivo que ya está escrito
en `ai-config-env.ts`: **un valor por defecto se descubre en producción, no en un test**. Un prompt
provisional de relleno que sigue funcionando es el peor caso posible — no falla, **responde mal**: un
catálogo leído con el prompt de prueba devuelve datos plausibles e incompletos, y nadie se entera
hasta que alguien compra con ellos. Un fallo que dice «falta `CATALOG_PROMPT`» se arregla en dos
minutos; un catálogo mal leído en silencio no se arregla nunca, porque no se ve.

**Lo que sí se acepta como consecuencia.** Un preview sin variables **no puede procesar ningún PDF**.
Está escrito, es la pregunta abierta 1 y **no se cierra aquí con un supuesto**.

## 11. Alternativa descartada (terciaria): guardar una huella del texto en el registro

**La idea.** Añadir al registro de revisión un hash corto del prompt vigente, para poder saber al
menos **si** el texto revisado es el que hay hoy en Vercel.

**Por qué no.** `[D13]` cerró que **no queda ningún rastro del texto vigente en el repositorio**, y
un hash es un rastro. Se anota aquí, y no se propone, para que quede claro que la limitación de R16
—un veredicto no se puede volver a comprobar— es **una consecuencia aceptada a conciencia** y no un
descuido del diseño.
