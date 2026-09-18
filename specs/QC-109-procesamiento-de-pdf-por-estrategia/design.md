# QC-109 — procesamiento-de-pdf-por-estrategia · design.md

> Diseño técnico de F1.2. Se apoya entero en lo que QC-108 dejó publicado y **no recrea nada de
> eso**. Cubre `R1`–`R16` de `requirements.md`.

## 1. Qué se construye, en una frase

Un caso de uso de dominio, `createProcessPdfByStrategy`, que traduce una **estrategia**
(`catalogo` | `formula`) a un **modo de lectura** y a un **prompt**, delega en el
`readPdfWithAi` que ya existe, registra el resultado y lo devuelve tal cual.

No hay tablas, ni migraciones, ni RLS, ni rutas, ni endpoints, ni Server Actions: esta ficha **no
persiste nada y no la invoca nadie todavía** (`[D2]`, R12). Por eso las secciones de modelo de datos
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
    catalogo-prompt.ts             # texto provisional de `catalogo`, con su cabecera
    formula-prompt.ts              # texto provisional de `formula`, con su cabecera
    index.ts                       # el mapa estrategia -> prompt, en un solo sitio
  process-pdf-by-strategy.ts       # el caso de uso: la fábrica
ports/
  strategy-run-log.ts              # el puerto del registro (R8)
adapters/driven/observability/
  strategy-run-log-console.ts      # la única implementación: escribe en consola
```

Y dos archivos existentes que se tocan, sin reordenar lo que ya tienen:
`lib/modules/documentos/index.ts` (barrel) y `lib/composition/index.ts` (cableado).

### 3.1 El enum (`domain/pdf-strategy.ts`) — R1, R13, R14

```ts
export const pdfStrategySchema = z.union([z.literal('catalogo'), z.literal('formula')]);
export type PdfStrategy = z.infer<typeof pdfStrategySchema>;
```

Unión de literales con zod, **igual que el `mode` de QC-108** (`ai-read-input.ts:20`), no enum de
Prisma ni tabla: aquí no se persiste nada (`[D13]`). Los dos valores del enum son los únicos
identificadores que no están en inglés, y es deliberado: son los nombres del negocio que fijó el
humano en `[D1]`; todo lo demás —`PdfStrategy`, `processPdfByStrategy`, `strategy`, `text`— sí lo
está (`[D11]`, R14).

El mapa a modo vive en este mismo archivo, como un `Record<PdfStrategy, AiReadMode>` (no un
`switch`): un `Record` **no compila** si mañana el enum gana un valor y alguien olvida su modo, y eso
convierte R1 en una garantía del compilador y no solo de un test.

### 3.2 Los prompts (`domain/prompts/*`) — R4, R5, R6

Son **archivos `.ts` que exportan una constante de texto**. Se importan como cualquier módulo, así
que entran en el paquete de despliegue por el mismo camino que el resto del código: no hay `fs`, no
hay `path`, no hay `process.cwd()` y no hay nada que pueda faltar en Vercel (`[D6]`, R4). Ver la
alternativa descartada en `## 7`.

Cada archivo abre con una cabecera que dice, en su primera línea de comentario, que el texto es
**provisional** y que el definitivo lo escribe QC-129, que además quita esa cabecera (`[D4]`, R6).

> **Nota de convención:** `docs/conventions.md` prohíbe citar fichas en comentarios de producción.
> Esta cabecera es la **excepción que la propia decisión `[D4]` crea**, y es la única de la ficha:
> sin la cita a QC-129 la marca no dice quién la retira y deja de cumplir su función. El reviewer
> tiene que verla escrita aquí para no tratarla como incumplimiento. Es un punto que conviene que el
> humano confirme al aprobar el spec.

El texto provisional tiene que **funcionar de verdad**, no ser un relleno: `aiReadInputSchema` exige
`trim().min(1)` (`ai-read-input.ts:19`), así que un prompt vacío o de espacios haría que las dos
estrategias nacieran incapaces de ejecutarse — que es exactamente lo que `[D3]` derogó. Serán dos
frases cortas, una por estrategia, que pidan a la IA lo que la estrategia necesita leer.

### 3.3 El caso de uso (`domain/process-pdf-by-strategy.ts`) — R7, R9, R10, R11, R12

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
      readonly mode: AiReadMode; readonly code: ErrorCode; readonly reason: string };

export type ProcessPdfByStrategyDeps = {
  readonly readPdfWithAi: (input: AiReadRequestInput) => Promise<AiReadResult>;
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
   ni se traduce el `code`: el catálogo de `ErrorCode` es el mismo (R9).
3. **La dependencia es el CASO DE USO ya construido, no el puerto `AiReader`.** Es una función, no
   una interfaz, porque eso es lo que `createReadPdfWithAi` devuelve y lo que `lib/composition` ya
   tiene cableado en `documentos.readPdfWithAi`. Reconstruirlo aquí a partir de `AiReader` +
   `PdfConverter` duplicaría el plazo, el tope de páginas y el manejo de errores — justo lo que
   `[D9]` y `[D10]` prohíben. Consecuencia buena: esta ficha **no toca `limits.ts` ni lo importa**,
   porque el único que necesita esos números es el caso de uso de dentro (R10).
4. **Sin actor y sin permiso** (`[D7]`, R11). La firma no lo admite, así que no se puede colar. Es la
   misma postura que ya tiene `convertPdfs` en `lib/composition/index.ts:1158`.

Flujo, entero:

```
strategy -> (zod)            si falla: resultado ok:false con code 'invalid_input', SIN llamar a IA
         -> modo + prompt    desde el Record y el mapa de prompts
         -> readPdfWithAi({ path, bytes, prompt, mode })
         -> log.run(...)     exactamente una vez, en éxito y en fallo
         -> resultado        con `strategy` añadido, texto TAL CUAL
```

El caso de uso **no lanza nunca**: `readPdfWithAi` ya devuelve `ok:false` en lugar de lanzar, y esta
capa mantiene ese contrato (R9).

### 3.4 El registro (`ports/strategy-run-log.ts`) — R8

Un puerto, no un `console.log` suelto en el dominio. Dos motivos, los mismos que ya justifican
`ports/list-query-log.ts` en cinco módulos de este repo:

- el dominio no conoce el mundo exterior (`docs/architecture.md > La regla de dependencias`);
- **R8 solo es testeable si el test puede espiar la llamada**; parchear la consola global ensucia el
  resto de la suite.

La implementación única vive en `adapters/driven/observability/strategy-run-log-console.ts` y acepta
la función de escritura por parámetro con `console.log` por defecto, igual que
`identity/adapters/driven/observability/session-check-log-console.ts`. El cableado
puerto → implementación va en `lib/composition/index.ts`, dentro del bloque `documentos` que ya
existe, **sin reordenar nada de lo de arriba**.

> **BLOQUEANTE para el implementer.** La **firma** del puerto depende de la pregunta abierta de
> `requirements.md`: qué se registra y con qué recorte. Lo que este diseño fija es que hay **una**
> llamada por ejecución y que pasa por el puerto; los parámetros exactos —`text` completo, recortado
> a un tope, o solo estrategia + páginas + tamaño— los decide el humano. **No se rellena con un
> supuesto** (regla 6 de `CLAUDE.md`). Hasta que se responda, la tarea T6 de `tasks.md` está
> bloqueada.

### 3.5 El barrel (`index.ts`) — R12, R13

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
así lo dice el propio archivo en su cabecera. Los textos de prompt tampoco: son detalle interno de
la estrategia, y publicarlos invitaría a que alguien de fuera los pasara por parámetro y saltara
`[D3]`.

## 4. Modelo de datos, rutas, endpoints, integraciones

- **Tablas, RLS, migraciones:** ninguna. Esta ficha no persiste nada, por eso `[D13]` cierra que el
  enum se valida con zod y no con un enum de Prisma.
- **Rutas / endpoints / Server Actions:** ninguna. `[D2]`: la capacidad se publica, no se dispara.
  Lo que la invocará es el trabajo de la cola (QC-111).
- **Integraciones externas:** ninguna nueva. La única, Gemini, ya entró con QC-108 y se alcanza
  **solo** a través del `readPdfWithAi` inyectado (`[D8]`, R13).

## 5. Dependencias de terceros

**Ninguna nueva** (`[D12]`, R15). Los archivos nuevos importan `zod` —ya aprobada— y código del
propio módulo. `package.json` no se toca, y
`tests/guards/guard-dependencias-aprobadas.test.ts` sigue verde sin cambios en
`docs/dependencias.md`. Si durante la implementación aparece la necesidad de una librería, eso es
señal de que algo se torció: se **para** y se sube la propuesta al humano.

## 6. Verificación

Todo unitario, en `tests/unit/`, contra la fábrica con dobles: un `readPdfWithAi` falso y un `log`
espía. No hace falta ni red, ni claves de IA, ni un PDF real (los `bytes` pueden ser cualquier
`Uint8Array` no vacío, porque quien los interpreta es el doble).

**Sin E2E, con motivo** (`[D14]`, R16): no hay pantalla ni recorrido de usuario que ejercitar —esta
ficha no la invoca nadie todavía—. El E2E de la cadena lo pone QC-107, que es quien aporta la
interfaz.

Mapa `R<n> -> test` previsto (lo cierra el implementer en `progress/impl_QC-109.md`):

| R | Test |
|---|---|
| R1 | rechaza una estrategia desconocida sin llamar a la lectura |
| R2 | `catalogo` pide la lectura en modo `images` |
| R3 | `formula` pide la lectura en modo `pdf` |
| R4 | el cierre de imports de los prompts no contiene `fs`, `path` ni `process.cwd` |
| R5 | el prompt de cada estrategia pasa `aiReadInputSchema` |
| R6 | cada archivo de prompt declara su cabecera de provisional y cita a QC-129 |
| R7 | devuelve el texto de la IA sin alterar, con su estrategia |
| R8 | registra exactamente una vez por ejecución, en éxito y en fallo |
| R9 | un fallo de la lectura vuelve como `ok:false` con su `code`, sin lanzar |
| R10 | ningún archivo nuevo contiene los literales de los límites |
| R11 | la firma pública no admite actor y no se exige ningún permiso |
| R12 | el barrel publica la fábrica y no publica el puerto; nadie la invoca desde `app/` |
| R13 | ningún archivo de `domain/` ni `ports/` nombra al proveedor ni a un adaptador |
| R14 | los símbolos exportados son los nombres en inglés esperados |
| R15 | los imports de los archivos nuevos son solo `zod` y código del módulo |
| R16 | no se añade ningún archivo bajo `e2e/` |

## 7. Alternativa descartada: los prompts como archivos `.md` leídos del disco

**Qué era.** Poner cada prompt en un `.md` de verdad —`domain/prompts/catalogo.md`— y leerlo con
`readFileSync` al arrancar, o importarlo crudo con un loader de webpack (`?raw`).

**Por qué es tentadora.** Un `.md` se edita sin tocar código, no hay que escapar comillas invertidas
ni `${`, y QC-129 tendría que cambiar un archivo de texto en vez de una constante de TypeScript. Con
prompts largos, que es lo que vienen a ser, se lee mucho mejor en un diff.

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
   desincronizar, para ahorrar dos comillas invertidas.

**Qué se pierde al descartarla.** Editar un prompt sigue siendo editar un `.ts`, con sus comillas
invertidas escapadas. Es un coste real y se acepta: QC-129 va a tocar esos dos archivos una vez, y
el precio de la alternativa es un fallo que solo se ve en producción.

## 8. Alternativa descartada (secundaria): una estrategia, un objeto con su propio comportamiento

Modelar cada estrategia como un objeto con su `prompt` y su método `read()`, y elegir el objeto por
el enum. Se descarta porque con **dos** estrategias que solo difieren en dos datos —un modo y un
texto— un `Record<PdfStrategy, ...>` dice lo mismo en tres líneas, y el compilador obliga a cubrir
cualquier valor nuevo del enum. `[D1]` cierra que no habrá un tercer valor, así que la
extensibilidad que compraría el objeto no tiene comprador.
