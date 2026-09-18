# QC-109 — procesamiento-de-pdf-por-estrategia · design.md

> Diseño técnico de F1.2. Se apoya entero en lo que QC-108 dejó publicado y **no recrea nada de
> eso**. Cubre `R1`–`R17` de `requirements.md`.

## 1. Qué se construye, en una frase

Un caso de uso de dominio, `createProcessPdfByStrategy`, que traduce una **estrategia**
(`catalogo` | `formula`) a un **modo de lectura** y a un **prompt**, delega en el
`readPdfWithAi` que ya existe, registra el resultado y lo devuelve tal cual.

No hay tablas, ni migraciones, ni RLS, ni rutas, ni endpoints, ni Server Actions: esta ficha **no
persiste nada y no la invoca nadie todavía** (`[D2]`, R13). Por eso las secciones de modelo de datos
y de rutas están vacías a propósito, no por olvido.

## 2. El mapeo estrategia → modo, verificado en el código

Esto es lo primero que se comprobó, porque es contraintuitivo por el nombre:

| Estrategia | Lectura | Literal de `AiReadMode` | Qué le llega a la IA |
|---|---|---|---|
| `catalogo` | **imagen** | `'images'` | `buildImageParts(...)`: páginas rasterizadas a `PAGE_RENDER_DPI` |
| `formula` | **texto** | `'pdf'` | `[{ kind: 'pdf', bytes }]`: el PDF entero, sin convertir |

Verificado en `lib/modules/documentos/domain/read-pdf-with-ai.ts:173-174`:

```ts
const parts: readonly AiDocumentPart[] =
  mode === 'pdf' ? [{ kind: 'pdf', bytes }] : await buildImageParts(deps.converter, bytes, path);
```

**Trampa que hay que no caer en ella:** «leer como texto» NO es `PdfConverter.extractText`. El modo
`'pdf'` manda el archivo entero y quien lo lee es el modelo multimodal; `extractText` existe en el
puerto pero `readPdfWithAi` no lo usa, y esta ficha tampoco. Cubre R2 y R3.

## 3. Archivos nuevos

Todos dentro de `lib/modules/documentos/`, ninguno fuera del módulo.

```
domain/
  pdf-strategy.ts                  # el enum cerrado (zod) + su tipo + el mapa estrategia -> modo
  prompts/
    catalogo.json                  # texto provisional de `catalogo`, con sus campos de marca
    formula.json                   # texto provisional de `formula`, con sus campos de marca
    index.ts                       # importa los dos .json y expone el mapa estrategia -> prompt
  process-pdf-by-strategy.ts       # el caso de uso: la fábrica
ports/
  strategy-run-log.ts              # el puerto del registro (R8)
adapters/driven/observability/
  strategy-run-log-console.ts      # la única implementación: escribe en consola
```

Y dos archivos existentes que se tocan, sin reordenar lo que ya tienen:
`lib/modules/documentos/index.ts` (barrel) y `lib/composition/index.ts` (cableado).

### 3.1 El enum (`domain/pdf-strategy.ts`) — R1, R14, R15

```ts
export const pdfStrategySchema = z.union([z.literal('catalogo'), z.literal('formula')]);
export type PdfStrategy = z.infer<typeof pdfStrategySchema>;
```

Unión de literales con zod, **igual que el `mode` de QC-108** (`ai-read-input.ts:20`), no enum de
Prisma ni tabla: aquí no se persiste nada (`[D13]`). Los dos valores del enum son los únicos
identificadores que no están en inglés, y es deliberado: son los nombres del negocio que fijó el
humano en `[D1]`; todo lo demás —`PdfStrategy`, `processPdfByStrategy`, `strategy`, `text`— sí lo
está (`[D11]`, R15).

El mapa a modo vive en este mismo archivo, como un `Record<PdfStrategy, AiReadMode>` (no un
`switch`): un `Record` **no compila** si mañana el enum gana un valor y alguien olvida su modo, y eso
convierte R1 en una garantía del compilador y no solo de un test.

### 3.2 Los prompts (`domain/prompts/*`) — R4, R5, R6

Son **archivos `.json`, uno por estrategia** (`[D15]`), con esta forma:

```json
{ "provisional": true, "loDefine": "QC-129", "prompt": "..." }
```

**Por qué `.json` y no una constante de TypeScript.** `[D6]` no se eligió solo para que el texto
entrara en el paquete de despliegue: se eligió para que el prompt se editara **como documento, sin
tocar código**. Un `.json` sigue siendo un archivo de datos y a la vez se **importa como módulo**,
así que entra en el bundle por el mismo camino que el resto del código: no hay `fs`, no hay `path`,
no hay `process.cwd()` y no hay nada que pueda faltar en Vercel (R4).

**Verificado, no supuesto:** `tsconfig.json:12` tiene **`resolveJsonModule: true`**, con
`module: "esnext"`, `moduleResolution: "bundler"` y `esModuleInterop: true`. El import por defecto
del `.json` tipa solo —`prompt` sale como `string`— sin loader, sin `?raw` y sin tocar
`next.config`; Vite/Vitest resuelve JSON de serie, así que el gate no necesita configuración
aparte. Esto es lo que hacía inviable la variante `.md` y hace viable esta: ver `## 7`.

`domain/prompts/index.ts` importa los dos `.json` y expone el `Record<PdfStrategy, string>`, que es
el único sitio del que sale el prompt de una estrategia. Es también donde se estrecha el tipo que
TypeScript infiere del JSON al que usa el dominio.

**La marca de provisional es un CAMPO, no un comentario** (`[D4]` + `[D15]`, R6): `provisional` y
`loDefine` son datos del archivo. Esto disuelve el roce que tenía el diseño anterior con
`docs/conventions.md` —que prohíbe citar fichas en comentarios de producción—: **ya no hace falta
ninguna excepción**, porque no hay comentario que cite nada. QC-129 escribirá el texto definitivo y
pondrá `provisional` en `false`. Que la marca sea un dato tiene además una ventaja práctica: un test
la comprueba leyendo el objeto importado, sin tener que parsear comentarios.

El texto provisional tiene que **funcionar de verdad**, no ser un relleno: `aiReadInputSchema` exige
`trim().min(1)` (`ai-read-input.ts:19`), así que un prompt vacío o de espacios haría que las dos
estrategias nacieran incapaces de ejecutarse — que es exactamente lo que `[D3]` derogó. Serán dos
frases cortas, una por estrategia, que pidan a la IA lo que la estrategia necesita leer.

### 3.3 El caso de uso (`domain/process-pdf-by-strategy.ts`) — R7, R10, R11, R12, R13

Contrato de entrada y salida:

```ts
export type ProcessPdfByStrategyInput = {
  readonly strategy: PdfStrategy;
  readonly path: string;
  readonly bytes: Uint8Array;
};

export type StrategyRunResult =
  | { readonly ok: true;  readonly strategy: PdfStrategy; readonly path: string;
      readonly mode: AiReadMode; readonly text: string }
  | { readonly ok: false; readonly strategy: PdfStrategy; readonly path: string;
      // `null` SOLO cuando lo invalido es la estrategia: el modo sale de ella. Ver 3.4.
      readonly mode: AiReadMode | null; readonly code: ErrorCode; readonly reason: string };

export type ProcessPdfByStrategyDeps = {
  readonly readPdfWithAi: (input: AiReadRequestInput) => Promise<AiReadResult>;
  readonly countPages: PdfConverter['countPages'];   // solo para el resumen del registro, ver 3.4
  readonly log: StrategyRunLog;
};

export function createProcessPdfByStrategy(
  deps: ProcessPdfByStrategyDeps,
): (input: ProcessPdfByStrategyInput) => Promise<StrategyRunResult>;
```

Cuatro decisiones de forma, y el porqué de cada una:

1. **Devuelve, no solo registra** (`[D5]`, R7). La ficha original decía «solo un `console.log`». Una
   función que no devuelve nada obliga a QC-111 a rehacerla el día que tenga que guardar el
   resultado, y esta ficha es la raíz de la cadena.
2. **`StrategyRunResult` es `AiReadResult` + `strategy`**, con los mismos nombres de campo y el mismo
   `ok` discriminante. Quien ya sabe leer un `AiReadResult` sabe leer este. No se reetiquetan campos
   ni se traduce el `code`: el catálogo de `ErrorCode` es el mismo (R10). **Con una diferencia, y es
   la única:** el `mode` de la rama de fallo es anulable aquí y no en `AiReadResult`, porque esta
   capa tiene un fallo que aquella no puede tener —la estrategia inválida, anterior a que exista
   modo alguno—. Ver la enmienda de `## 3.4`.
3. **La dependencia es el CASO DE USO ya construido, no el puerto `AiReader`.** Es una función, no
   una interfaz, porque eso es lo que `createReadPdfWithAi` devuelve y lo que `lib/composition` ya
   tiene cableado en `documentos.readPdfWithAi`. Reconstruirlo aquí a partir de `AiReader` +
   `PdfConverter` duplicaría el plazo, el tope de páginas y el manejo de errores — justo lo que
   `[D9]` y `[D10]` prohíben. Consecuencia buena: esta ficha **no toca `limits.ts` ni lo importa**,
   porque el único que necesita esos números es el caso de uso de dentro (R11).
4. **Sin actor y sin permiso** (`[D7]`, R12). La firma no lo admite, así que no se puede colar. Es la
   misma postura que ya tiene `convertPdfs` en `lib/composition/index.ts:1158`.

Flujo, entero:

```
strategy -> (zod)            si falla: se REGISTRA el rechazo (mode y pages nulos, ver enmienda de
                             3.4) y se devuelve ok:false con code 'invalid_input', SIN llamar a IA
         -> modo + prompt    desde el Record y el mapa de prompts
         -> countPages       solo para el resumen; si revienta, `pages: null` (ver 3.4)
         -> readPdfWithAi({ path, bytes, prompt, mode })
         -> log.run(resumen) exactamente una vez, en éxito y en fallo
         -> resultado        con `strategy` añadido, texto TAL CUAL
```

El caso de uso **no lanza nunca**: `readPdfWithAi` ya devuelve `ok:false` en lugar de lanzar, y esta
capa mantiene ese contrato (R10).

### 3.4 El registro (`ports/strategy-run-log.ts`) — R8, R9

Un puerto, no un `console.log` suelto en el dominio. Dos motivos, los mismos que ya justifican
`ports/list-query-log.ts` en cinco módulos de este repo:

- el dominio no conoce el mundo exterior (`docs/architecture.md > La regla de dependencias`);
- **R8 solo es testeable si el test puede espiar la llamada**; parchear la consola global ensucia el
  resto de la suite.

La firma sale directa de `[D16]` — **un resumen, sin el texto**:

```ts
export type StrategyRunSummary = {
  readonly strategy: PdfStrategy;
  readonly mode: AiReadMode | null;
  readonly path: string;
  readonly pages: number | null;
  readonly textLength: number;
};

export interface StrategyRunLog {
  run(summary: StrategyRunSummary): void;
}
```

> **Enmienda fechada — 2026-09-18. `mode` pasa de `AiReadMode` a `AiReadMode | null`.**
>
> **Qué decía antes.** `mode: AiReadMode`, no anulable, y con ello el rechazo por estrategia inválida
> **no se registraba**: el modo SALE de la estrategia, así que con una estrategia inválida no había
> ninguno que poner sin inventarlo, y el flujo de `## 3.3` devolvía el fallo antes de `log.run`.
>
> **Por qué cambia, que es lo que importa.** Porque ese caso **puede ocurrir de verdad en ejecución**.
> **QC-111 va a leer la estrategia de la BASE DE DATOS**, no de una constante del código: un valor
> inválido no es solo un error de programación que TypeScript ya frena en el borde, es un dato que
> puede llegar podrido en producción. Y ese es **exactamente** el caso que se querría ver en los
> registros — justo el que la firma anterior dejaba mudo.
>
> **Qué implica.** El caso de uso registra también el rechazo, antes de devolver el fallo, con
> `mode: null`, `pages: null`, `textLength: 0` y la estrategia **tal como llegó**. Con esto **R8 queda
> cumplido a la letra** («exactamente una vez por ejecución, tanto en éxito como en fallo») y su
> redacción NO se toca. Cambia **T3**, que fijaba estos campos «exactamente» así.
>
> **Lo que NO cambia.** La firma **sigue sin admitir el texto** de la IA (R9): lo que se anula es el
> modo, no la prohibición. Y `StrategyRunResult` mantiene el modo anulado solo en su rama de fallo.

**La firma no admite el texto, así que registrarlo por descuido no es posible** (R9) — el mismo
truco que usa `ListQueryLog` para que no se pueda registrar el valor de un filtro. El texto puede ser
enorme y puede traer datos de terceros; quien lo necesite lo tiene en el valor de retorno, que es lo
que `[D5]` fija.

Tres consecuencias no obvias de `[D16]`, dichas aquí para que nadie las descubra implementando —la
tercera la añade la enmienda del 2026-09-18—:

1. **De dónde sale `pages`.** `AiReadResult` **no** trae el número de páginas, así que el resumen no
   se puede componer solo con lo que devuelve la lectura. Por eso `ProcessPdfByStrategyDeps` recibe
   `countPages` del `PdfConverter` ya cableado (`lib/composition/index.ts:1123-1127`): es la fuente
   que ya existe, y usarla no reimplementa nada. **Coste que se acepta:** con `catalogo` el PDF se
   cuenta dos veces —aquí y dentro de `buildImageParts`—; es un parseo barato del archivo, no una
   llamada de IA más. La alternativa era que `pages` la aportara QC-111 por parámetro, y eso le
   impone forma a la ficha que todavía no existe, que es justo lo que esta ficha quiere evitar.
2. **Qué se registra cuando algo falla.** Si `countPages` revienta —PDF corrupto—, `pages` va `null`
   y la ejecución **sigue**: contar páginas es para el registro, no para el resultado, y un fallo de
   conteo no puede convertirse en un fallo de lectura que no ocurrió. Si la lectura falla,
   `textLength` es `0`, porque no hubo texto. En los dos casos se registra igual: R8 exige **una**
   entrada por ejecución, también en fallo.
3. **Y también se registra el rechazo por estrategia inválida** (enmienda del 2026-09-18, arriba),
   con `mode: null` y `pages: null` porque en esa rama no se resolvió modo ni se contó nada. Es el
   único caso en el que se registra sin haber llamado a la lectura.

La implementación única vive en `adapters/driven/observability/strategy-run-log-console.ts` y acepta
la función de escritura por parámetro con `console.log` por defecto, igual que
`identity/adapters/driven/observability/session-check-log-console.ts`. El cableado
puerto → implementación va en `lib/composition/index.ts`, dentro del bloque `documentos` que ya
existe, **sin reordenar nada de lo de arriba**.

### 3.5 El barrel (`index.ts`) — R13, R14

Se publica con el mismo criterio que lo de QC-108: **la fábrica**, nunca el puerto ni el adaptador.

```ts
export { pdfStrategySchema, type PdfStrategy } from './domain/pdf-strategy';
export {
  createProcessPdfByStrategy,
  type ProcessPdfByStrategyDeps,
  type ProcessPdfByStrategyInput,
  type StrategyRunResult,
} from './domain/process-pdf-by-strategy';
```

`ports/strategy-run-log.ts` **no** sale por el barrel: los puertos los ve solo `lib/composition`, y
así lo dice el propio archivo en su cabecera. Los `.json` de prompt tampoco: son detalle interno de
la estrategia, y publicarlos invitaría a que alguien de fuera los pasara por parámetro y saltara
`[D3]`. Que no salgan por el barrel además lo mantiene importable desde un componente de cliente,
que es la condición que el propio `index.ts` declara.

## 4. Modelo de datos, rutas, endpoints, integraciones

- **Tablas, RLS, migraciones:** ninguna. Esta ficha no persiste nada, por eso `[D13]` cierra que el
  enum se valida con zod y no con un enum de Prisma.
- **Rutas / endpoints / Server Actions:** ninguna. `[D2]`: la capacidad se publica, no se dispara.
  Lo que la invocará es el trabajo de la cola (QC-111).
- **Integraciones externas:** ninguna nueva. La única, Gemini, ya entró con QC-108 y se alcanza
  **solo** a través del `readPdfWithAi` inyectado (`[D8]`, R14).

## 5. Dependencias de terceros

**Ninguna nueva** (`[D12]`, R16). Los archivos nuevos importan `zod` —ya aprobada— y código del
propio módulo. `package.json` no se toca, y

> **Nota fechada — 2026-09-18.** Hay **un** import que no es ni `zod` ni del propio módulo: el tipo
> `ErrorCode`, que `domain/process-pdf-by-strategy.ts` trae de `@/lib/modules/errores`. **No es una
> dependencia de terceros** y por tanto no toca nada de esta sección: es el contrato público de otro
> módulo del mismo repositorio, no añade una línea a `package.json`, no pasa por los cuatro checks
> de salud y no necesita fila en `docs/dependencias.md`. Es el mismo precedente que
> `domain/read-pdf-with-ai.ts:18`, y viene impuesto por el propio diseño: `## 3.3` decide que el
> `code` **no se traduce** porque el catálogo de `ErrorCode` es el mismo, y para no traducirlo hay
> que nombrar ese tipo. Se anota porque la letra de R16 no lo contemplaba; la sustancia —cero
> dependencias nuevas— se cumple entera.

`tests/guards/guard-dependencias-aprobadas.test.ts` sigue verde sin cambios en
`docs/dependencias.md`. Si durante la implementación aparece la necesidad de una librería, eso es
señal de que algo se torció: se **para** y se sube la propuesta al humano.

Los prompts en `.json` **no cambian esto** (`[D15]`): `resolveJsonModule` es una opción del
compilador que ya estaba activa, no un paquete. No entra ningún loader, ningún plugin y ninguna
línea en `next.config`.

## 6. Verificación

Todo unitario, en `tests/unit/`, contra la fábrica con dobles: un `readPdfWithAi` falso, un
`countPages` falso y un `log` espía. No hace falta ni red, ni claves de IA, ni un PDF real (los
`bytes` pueden ser cualquier `Uint8Array` no vacío, porque quien los interpreta son los dobles).

**Sin E2E, con motivo** (`[D14]`, R17): no hay pantalla ni recorrido de usuario que ejercitar —esta
ficha no la invoca nadie todavía—. El E2E de la cadena lo pone QC-107, que es quien aporta la
interfaz.

Mapa `R<n> -> test` previsto (lo cierra el implementer en `progress/impl_QC-109.md`):

| R | Test |
|---|---|
| R1 | rechaza una estrategia desconocida sin llamar a la lectura (sí la registra: enmienda de `## 3.4`) |
| R2 | `catalogo` pide la lectura en modo `images` |
| R3 | `formula` pide la lectura en modo `pdf` |
| R4 | los prompts se importan como módulo; su cierre no contiene `fs`, `path` ni `process.cwd` |
| R5 | el prompt de cada estrategia pasa `aiReadInputSchema` |
| R6 | cada `.json` de prompt trae `provisional: true` y `loDefine: 'QC-129'` |
| R7 | devuelve el texto de la IA sin alterar, con su estrategia |
| R8 | registra exactamente una vez por ejecución, en éxito y en fallo, con los cinco campos — y, por la enmienda de `## 3.4`, también en el rechazo por estrategia inválida, contando **invocaciones** |
| R9 | el resumen registrado no contiene el texto; `textLength` coincide con su longitud |
| R10 | un fallo de la lectura vuelve como `ok:false` con su `code`, sin lanzar |
| R11 | ningún archivo nuevo contiene los literales de los límites |
| R12 | la firma pública no admite actor y no se exige ningún permiso |
| R13 | el barrel publica la fábrica y no publica el puerto; nadie la invoca desde `app/` |
| R14 | ningún archivo de `domain/` ni `ports/` nombra al proveedor ni a un adaptador |
| R15 | los símbolos exportados son los nombres en inglés esperados |
| R16 | los imports de los archivos nuevos son solo `zod` y código del módulo |
| R17 | no se añade ningún archivo bajo `e2e/` |

Un caso extra, que no es de ningún requisito pero cubre la consecuencia 1 de `## 3.4`: **si
`countPages` revienta, `pages` va `null` y la ejecución sigue**.

## 7. Alternativa descartada: los prompts como archivos `.md` leídos del disco

**Qué era.** Poner cada prompt en un `.md` de verdad —`domain/prompts/catalogo.md`— y leerlo con
`readFileSync` al arrancar, o importarlo crudo con un loader de webpack (`?raw`).

**Por qué es tentadora.** Un `.md` se edita sin tocar código y no hay que escapar nada. Es la misma
virtud que buscaba `[D6]` y que acabó recogiendo `[D15]` — con la diferencia de que el `.json` la
consigue **sin** los tres problemas de abajo.

**Por qué se descarta.**

1. **Choca de frente con `[D6]`.** La app corre en Vercel: lo que no entra en el paquete de
   despliegue no existe en tiempo de ejecución. Un `readFileSync` sobre `process.cwd()` funciona en
   local y devuelve `ENOENT` en producción, y el fallo aparece **la primera vez que alguien procesa
   un PDF de verdad**, no en el gate.
2. **`fs` en el dominio está prohibido** por `docs/architecture.md > La regla de dependencias`.
   Salvarlo significaría inventar un puerto `PromptSource` y un adaptador que lee disco: más piezas
   que mantener para un texto que es constante.
3. **El `?raw` de webpack es configuración nueva** en `next.config` que afecta a todo el repo, y
   además no la ve `vitest` sin configurarla otra vez. Dos configuraciones que se pueden
   desincronizar. El `.json` no necesita ninguna de las dos: `resolveJsonModule` ya está activo y
   Vite lo resuelve de serie.

**Qué se pierde al descartarla.** El texto del prompt vive dentro de una cadena JSON, así que los
saltos de línea van como `\n` y las comillas se escapan. Es peor de leer que un `.md` en un diff, y
es el único coste que queda tras `[D15]`. Se acepta: a cambio no hay loader, no hay `fs`, no hay
puerto nuevo y no hay un fallo que solo aparezca en producción.

**Nota histórica, para que no se repita la discusión.** Este diseño propuso primero una constante en
un archivo `.ts`. Técnicamente funcionaba y por los mismos tres motivos de arriba, pero el humano ya
había descartado esa variante al acotar: `[D6]` se eligió para que el prompt se editara **como
documento**, y un `.ts` obliga a abrir código. `[D15]` cerró la tercera vía, que es la que está
implementada arriba.

## 8. Alternativa descartada (secundaria): una estrategia, un objeto con su propio comportamiento

Modelar cada estrategia como un objeto con su `prompt` y su método `read()`, y elegir el objeto por
el enum. Se descarta porque con **dos** estrategias que solo difieren en dos datos —un modo y un
texto— un `Record<PdfStrategy, ...>` dice lo mismo en tres líneas, y el compilador obliga a cubrir
cualquier valor nuevo del enum. `[D1]` cierra que no habrá un tercer valor, así que la
extensibilidad que compraría el objeto no tiene comprador.
