# QC-108 — lectura-de-pdf-con-gemini · design.md

> El **QUÉ** está en `requirements.md`, que viene **sembrado** por `/afinar-feature`: el Alcance, las
> **doce** decisiones cerradas y las tres preguntas abiertas los fijó el humano el 2026-09-18 y aquí
> no se reabren. Este documento es el **CÓMO**, y solo eso.
>
> **Tres cosas pesan más que el resto y están resueltas en §5, §8 y §9:** la **octava enmienda** al
> catálogo cerrado de errores con su **plan B escrito**; cómo se prueba **sin red** —incluido el plazo
> de 60 s **sin esperar 60 segundos**—; y la **propuesta de dependencia `@google/genai`**, que **no se
> instala aquí**.

## 0. Lo que se midió en disco antes de escribir

No de memoria: cada afirmación de esta sección se leyó en el árbol del worktree
`.worktrees/QC-108-lectura-de-pdf-con-gemini`.

### 0.1. Lo que YA existe y esta ficha reutiliza tal cual

| Pieza | Ruta | Qué aporta |
|---|---|---|
| Módulo `documentos` | `lib/modules/documentos/**` (16 archivos) | Existe desde QC-106. No se crea nada de estructura |
| Puerto de conversión | `lib/modules/documentos/ports/pdf-converter.ts` | `countPages(pdf)`, `extractText(pdf)`, `renderPages(pdf, dpi): RenderedPage[]` con `{ pageNumber, png: Uint8Array }`. **Es el que consume el modo imagen (R4)** |
| Errores del módulo | `lib/modules/documentos/domain/errors.ts` | `DocumentosError` abstracta con `code: ErrorCode` y `diagnostic?`, más `UnauthorizedError` y `ValidationError`. **El mensaje sale del catálogo**, ninguna clase acepta `message` |
| Límites únicos | `lib/modules/documentos/domain/limits.ts` | `MAX_PDF_PAGES = 50`, `PAGE_RENDER_DPI = 150`, `MAX_PDF_BYTES`, y **`MILLISECONDS_PER_SECOND`**, que ya existe y es el factor con el que este módulo convierte un plazo en segundos a un instante |
| Configuración perezosa | `lib/modules/documentos/adapters/driven/config/document-storage-config-env.ts` | **El patrón exacto que manda D4**: los nombres viven **solo** como literales de un arreglo `as const`, se leen **dentro de una función**, vacío o solo-espacios cuenta como ausente, y el error **nombra** las que faltan **sin incluir ningún valor** |
| Discriminado por archivo | `lib/modules/documentos/domain/convert-pdf.ts` | `{ ok: true … } \| { ok: false, path, output, reason }`, con `diagnostico(operación, ruta, causa)` y `causaDe(error)` que se queda **solo con el mensaje**. **Este archivo se copia en espíritu, no se modifica** |
| Cableado | `lib/composition/index.ts:1083-1155` | El bloque `documentos` ya ata `DocumentStorage` y `PdfConverter` y exporta la fachada `documentos` con cuatro claves |
| Catálogo de errores | `lib/modules/errores/domain/error-codes.ts` y `error-catalog.ts` | **46 códigos**, cerrado por `satisfies`. La cabecera declara la **sexta enmienda (QC-81, `batch_duplicate_lot`)** |

### 0.2. Lo que NO existe hoy y esta ficha estrena

- Ningún archivo del repo menciona `gemini`, `genai` ni ninguna IA: se comprobó con búsqueda en todo
  el árbol. **Es la primera integración de IA del repositorio.**
- `@google/genai` **no está en `package.json` ni en `node_modules`**. No hay paquete publicado que
  inspeccionar sin red — ver §8.3.
- No existe ninguna variable de entorno de IA en `.env.example` (117 líneas revisadas).
- `ai_unavailable` no existe en el catálogo.

### 0.3. Las tres guardias que una enmienda al catálogo pone en rojo, y hay que tocar a la vez

Esto es medido, no supuesto. Añadir un código **no** son dos archivos: son **cuatro**.

1. `lib/modules/errores/domain/error-codes.ts` — la entrada en `ERROR_CODES`.
2. `lib/modules/errores/domain/error-catalog.ts` — su clave en `ERROR_MESSAGE_KEY` **y** su texto en
   `ERROR_MESSAGES_ES`. Sin las dos, los `satisfies` tumban el typecheck.
3. `tests/unit/errores/catalogo.test.ts:44` — **`expect(ERROR_CODES).toHaveLength(46)`**, conteo
   literal a propósito («un codigo nuevo que nadie anote aqui pone esta linea en rojo»). Pasa a
   **47**. La misma línea manda arreglar los rótulos del `it` que dicen «las 45 entradas» y «los 46
   codigos», que ya venían desfasados.
4. `tests/unit/errores/catalogo.test.ts:183` — el test que exige que **la cabecera de
   `error-codes.ts` redacte la enmienda con su fecha y su aprobación**. Hoy exige la **sexta**; hay
   que **añadir** la octava sin borrar esa afirmación.

`tests/guards/guard-catalogo-de-errores.test.ts` no lleva conteo literal: compara longitudes entre sí
(`:526`), así que se mantiene verde sola si los cuatro puntos de arriba están bien hechos.

**Aviso de colisión con QC-92**, que está pidiendo la **séptima** enmienda: el conteo literal y la
cabecera son **la misma línea física** para las dos fichas. Si QC-92 entra antes, este diseño no
cambia pero los números sí: el conteo pasa a 48 y la cabecera lleva séptima **y** octava. **No se
resuelve aquí** y se anota en §12.

### 0.4. Archivos que esta ficha espera tocar

La lista completa, con rutas, está en `tasks.md > Archivos que la implementación espera tocar`, que
es lo que el leader necesita para validar el conflicto de F1.4. **Adelanto lo que decide ese cálculo:
sí, se toca `lib/composition/index.ts`** (§7).

## 1. El flujo, de punta a punta

```
QC-111 (la cola, futura)
  └─ documentos.readPdfWithAi({ pdf, prompt, mode })      ← fachada cableada, lib/composition
       └─ domain/read-pdf-with-ai.ts                       ← CASO DE USO (puro)
            1. valida la entrada con el esquema (prompt no vacío, mode ∈ {pdf, images})
            2. si mode = 'images':
                 PdfConverter.countPages  → si > MAX_PDF_PAGES ⇒ falla, sin renderizar
                 PdfConverter.renderPages(pdf, PAGE_RENDER_DPI) → PNG por página
            3. una sola llamada al puerto nuevo, con el plazo de 60 s corriendo alrededor
            4. devuelve { ok: true, text } | { ok: false, code, reason }
                 └─ AiReader (puerto nuevo)
                      └─ adapters/driven/ai/ai-reader-genai.ts   ← ÚNICO archivo que importa el tercero
                           · lee clave y modelo del entorno EN LA INVOCACIÓN
                           · manda el PDF o las imágenes con el prompt
                           · devuelve el texto tal cual
```

Nada de esto se invoca en esta ficha: se publica. El único consumidor previsto es **QC-111**.

## 2. Árbol del módulo: qué se añade y qué no se toca

```
lib/modules/documentos/
├── index.ts                         MODIFICADO  (+3 exports: la factory, su Deps y su tipo de salida)
├── domain/
│   ├── errors.ts                    MODIFICADO  (+1 clase: AiUnavailableError)
│   ├── limits.ts                    MODIFICADO  (+1 constante: AI_READ_TIMEOUT_SECONDS)
│   ├── ai-read-input.ts             NUEVO       (esquema del borde + tipo inferido)
│   ├── read-pdf-with-ai.ts          NUEVO       (el caso de uso)
│   ├── convert-pdf.ts               INTACTO
│   ├── read-document.ts             INTACTO
│   ├── issue-upload-links.ts        INTACTO
│   ├── document-path.ts             INTACTO
│   ├── pdf-content.ts               INTACTO
│   ├── upload-input.ts              INTACTO
│   └── actor.ts                     INTACTO     ← esta ficha NO tiene actor (D5, R18)
├── ports/
│   ├── ai-reader.ts                 NUEVO       (el puerto)
│   ├── pdf-converter.ts             INTACTO     ← D11, R4: ni un carácter
│   └── document-storage.ts          INTACTO
└── adapters/driven/
    ├── ai/ai-reader-genai.ts        NUEVO       (el único que importa @google/genai)
    ├── config/ai-config-env.ts      NUEVO       (clave + modelo, leídos en la invocación)
    ├── pdf/pdf-converter-unpdf.ts   INTACTO     ← D11, R4
    └── storage/…                    INTACTO
```

**Por qué `AiUnavailableError` va en `errors.ts` y no en un archivo propio:** ese archivo es *la*
jerarquía del módulo, y su docblock dice que quien traduce decide con **un solo** `instanceof
DocumentosError`. Una tercera clase en otro archivo rompería esa propiedad en dos sitios.

**Por qué `AI_READ_TIMEOUT_SECONDS` va en `limits.ts`:** es la «una sola definición» que pide D1, y
ese archivo existe precisamente por eso —su docblock: *«un numero repetido en dos archivos se
desincroniza en silencio»*—. Además el módulo ya cuenta plazos **en segundos** (`READ_LINK_TTL_SECONDS`)
y ya tiene `MILLISECONDS_PER_SECOND` para convertirlos: se sigue la misma unidad.

## 3. Contratos de entrada y salida

### 3.1. El puerto nuevo (`ports/ai-reader.ts`)

```ts
/** Lo que se le manda a la IA: el PDF entero, o sus páginas ya rasterizadas. */
export type AiDocumentPart =
  | { readonly kind: 'pdf'; readonly bytes: Uint8Array }
  | { readonly kind: 'image'; readonly png: Uint8Array; readonly pageNumber: number };

export type AiReadRequest = {
  readonly prompt: string;
  readonly parts: readonly AiDocumentPart[];
  /** El plazo, en milisegundos, que el llamante NO va a esperar más. Sale de la constante única. */
  readonly timeoutMs: number;
};

export interface AiReader {
  /** Devuelve el texto que la IA escribió, tal cual. Lanza si no puede. */
  read(request: AiReadRequest): Promise<string>;
}
```

Tres decisiones dentro de esas quince líneas:

1. **Un solo método.** El puerto no sabe de modos ni de conversión: recibe partes ya preparadas. Quien
   decide si la parte es el PDF o sus páginas es el caso de uso, que es quien conoce `PdfConverter`.
   Así el modo imagen **no** es una segunda implementación del tercero.
2. **`timeoutMs` viaja al puerto** aunque el dominio también lo haga cumplir (§4). El adaptador lo
   necesita para poder **abortar de verdad** la petición HTTP en vez de dejarla viva mientras el
   llamante ya se fue. Que la librería admita ese aborto es **desconocido** (§8.3): si no lo
   admitiera, el adaptador ignora el parámetro y la garantía del plazo la sigue dando el dominio.
   Esa degradación queda escrita como límite en §12, no disimulada.
3. **Lanza, no devuelve discriminado.** El discriminado lo construye el caso de uso, igual que hace
   `convert-pdf.ts`: el puerto es un tercero envuelto, no un orquestador.

### 3.2. Entrada y salida del caso de uso

```ts
export type AiReadMode = 'pdf' | 'images';

export type AiReadRequestInput = {
  readonly path: string;        // solo para poder nombrar el archivo al fallar
  readonly bytes: Uint8Array;   // el PDF
  readonly prompt: string;      // R2: lo pone quien llama, nunca este módulo
  readonly mode: AiReadMode;
};

export type AiReadResult =
  | { readonly ok: true;  readonly path: string; readonly mode: AiReadMode; readonly text: string }
  | { readonly ok: false; readonly path: string; readonly mode: AiReadMode;
      readonly code: ErrorCode; readonly reason: string };

export type ReadPdfWithAiDeps = {
  readonly ai: AiReader;
  readonly converter: PdfConverter;   // el MISMO de QC-106, no otro
  readonly timeout?: TimeoutRunner;   // §4: sustituible desde el test
};

export function createReadPdfWithAi(deps: ReadPdfWithAiDeps):
  (input: AiReadRequestInput) => Promise<AiReadResult>;
```

**`text` es una cadena y nada más** (D3, R6): ni `json`, ni `lines`, ni `pages`. Interpretarlo es de
quien lo pide, y hoy QC-109 solo hace `console.log` con él.

**Por qué el fallo lleva `code` y `reason` por separado:** `code` es del catálogo cerrado y es lo que
QC-107 va a mirar para decir «la lectura automática no está disponible»; `reason` es diagnóstico para
el registro del servidor —qué operación, sobre qué ruta, con qué causa—, exactamente el formato que ya
usa `convert-pdf.ts`. Mezclarlos sería obligar a la pantalla a leer texto libre.

### 3.3. El esquema del borde (`domain/ai-read-input.ts`)

`zod`, `strictObject` (R23, D12): `prompt` recortado y no vacío, `mode` literal `'pdf' | 'images'`,
`path` no vacío, `bytes` instancia de `Uint8Array` no vacía. Campo desconocido ⇒ rechazo. Se valida
**antes de tocar ningún puerto**, y el rechazo es `ValidationError` (`invalid_input`), que ya existe:
esta parte **no** necesita código de error nuevo.

## 4. El plazo de 60 s: dónde vive y cómo se prueba sin dormir 60 s

Esta es la parte que el encargo marca como condición dura, así que va explícita.

```ts
// domain/limits.ts
export const AI_READ_TIMEOUT_SECONDS = 60;
```

**El plazo lo hace cumplir el DOMINIO**, no el adaptador, envolviendo la llamada al puerto:

```ts
export type TimeoutRunner = <T>(promise: Promise<T>, ms: number) => Promise<T>;
```

`TimeoutRunner` entra por `deps` con un valor por defecto que es un `Promise.race` contra un
`setTimeout` —el único `setTimeout` de la ficha, y vive en el dominio sin importar nada—. Si gana el
temporizador, lanza; si gana la lectura, el temporizador se limpia y no deja el proceso vivo.

**Cómo se ejercita el plazo en la suite, sin esperar un minuto — las tres vías, y se usan las tres:**

1. **Inyectando el `TimeoutRunner`**: el test pasa uno que vence *inmediatamente*, y afirma que el
   resultado es `{ ok: false, code: 'ai_unavailable' }` y que **el doble del puerto se llamó una sola
   vez** (R9). Coste: microsegundos.
2. **Con un doble que nunca resuelve** (`new Promise(() => {})`) más
   `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(60_000)`, para ejercitar el
   `TimeoutRunner` **real** —el `Promise.race` de verdad— sin tiempo real. El repo ya usa temporizadores
   falsos en varios tests (p. ej. `tests/unit/identity/session-revocation.test.ts`), así que no
   estrena técnica.
3. **Afirmando el número**: que `AI_READ_TIMEOUT_SECONDS` vale 60 y que **aparece una sola vez** en el
   árbol del módulo (mismo barrido que QC-106 hizo con sus cinco constantes, R7).

**Lo que NO se hace, y por qué:** poner el plazo *solo* dentro del adaptador. Sería el diseño natural
si la librería trae su propio `timeout`, pero entonces el plazo únicamente se podría probar
construyendo el adaptador real —que importa el tercero y quiere red—, y D9 lo prohíbe. Con el plazo en
el dominio, la garantía «el llamante no espera más de 60 s» es cierta **independientemente de lo que
haga la librería**, que además es el único dato que hoy es desconocido (§8.3).

**Cero reintentos (R9), y se prueba:** el doble **cuenta sus llamadas** y el test afirma `1` tras un
fallo y tras un plazo agotado. No hay bucle, no hay `for`, no hay backoff en ningún archivo de la
ficha.

## 5. La OCTAVA enmienda al catálogo cerrado, y su plan B

**Lo que se pide** (D2, R10, R11): añadir `ai_unavailable`.

| Enmienda | Ficha | Código | Estado |
|---|---|---|---|
| Sexta | QC-81 | `batch_duplicate_lot` | Aprobada el 2026-09-15, escrita en la cabecera de `error-codes.ts` |
| Séptima | QC-92 | — | **En curso**, no en disco todavía |
| **Octava** | **QC-108** | **`ai_unavailable`** | **Propuesta. La aprueba el humano en F1.4** |

**Los cuatro puntos que hay que tocar juntos están en §0.3.** El texto propuesto, que tiene que ser
distinto del de todos los demás (guardia de textos únicos):

```
'errors.ai_unavailable': 'La lectura automatica no esta disponible en este momento. Intentalo mas tarde.'
```

Y la clase, junto a las dos que ya hay:

```ts
export class AiUnavailableError extends DocumentosError {
  readonly code = 'ai_unavailable';
  constructor(diagnostic?: string) { super('ai_unavailable', diagnostic); }
}
```

**Por qué merece código propio y no cae en `invalid_input` ni en `unexpected`:** la entrada era
correcta y no hay bug nuestro; lo que pasó es que un tercero no contestó. Con `unexpected`, la pantalla
de QC-107 diría «Ocurrio un error inesperado» —que invita a reportar un bug— y el registro no
distinguiría un corte de Google de un fallo del código.

### 5.1. PLAN B — si el humano NO aprueba la enmienda en F1.4

Escrito entero, porque es condición del encargo:

1. **No se toca el catálogo.** `error-codes.ts`, `error-catalog.ts`,
   `tests/unit/errores/catalogo.test.ts` quedan **idénticos a `dev`**, y la guardia de alcance de la
   ficha (T12) lo afirma contra el merge-base, igual que hizo `qc106-alcance.test.ts:387`.
2. **No nace `AiUnavailableError`.** El fallo del proveedor se señala con
   **`unexpected`** —`UNEXPECTED_ERROR_CODE`, que ya está en el catálogo— a través de una clase
   `AiReadError` del módulo cuyo `code` es `unexpected`.
3. **Lo que se pierde, dicho sin adornos:** (a) la pantalla de QC-107 **no puede** distinguir «la
   lectura automática no está disponible» de «ocurrió un error inesperado», y mostrará el mensaje
   neutro de un bug ante un corte de Google; (b) en el registro, un corte del proveedor y un fallo
   nuestro comparten código, así que contar «cuántas veces falló la IA» deja de ser una consulta y
   pasa a ser leer `reason` a ojo; (c) QC-111 no puede decidir reintentar **por el código**, y tendrá
   que inventarse otra señal o reintentarlo todo.
4. **Qué cambia en el resto del diseño: nada.** El puerto, el caso de uso, el plazo, el adaptador y
   los tests son los mismos; cambia **una** constante de `code` y el rótulo de dos tests. Por eso esto
   es un plan B y no un rediseño.
5. **R12 queda cubierto en los dos escenarios**, y el mapa de trazabilidad dirá cuál de los dos se
   ejecutó.

**T0 de `tasks.md` es bloqueante por esto**: hasta que la respuesta esté escrita en
`progress/impl_QC-108-*.md`, la task del catálogo no se abre y la del caso de uso no se cierra.

## 6. Configuración: dos variables, leídas en la invocación (D4, D6)

`adapters/driven/config/ai-config-env.ts`, **calcado** de `document-storage-config-env.ts` —mismo
arreglo `as const` de nombres, misma lectura dentro de función, mismo error que **nombra** las que
faltan y **nunca** incluye un valor—:

```ts
const REQUIRED_ENV_VAR_NAMES = ['GEMINI_API_KEY', 'GEMINI_MODEL'] as const;
export function readAiConfigFromEnv(): AiConfig  // { apiKey, model }
```

Bloque **nuevo al final** de `.env.example`, con las dos **vacías** y documentadas:

```
# ---------------------------------------------------------------------------
# Lectura de PDF con IA (QC-108). Se leen en el momento de la invocacion, nunca al
# importar el modulo (lib/modules/documentos/adapters/driven/config/ai-config-env.ts);
# si falta alguna, la lectura falla nombrandola, sin filtrar ningun valor.
# ---------------------------------------------------------------------------

# Credencial del proveedor de IA. SECRETO: nunca al repo. UNA SOLA por despliegue: no
# hay clave por empresa.
GEMINI_API_KEY=

# Nombre del modelo. OBLIGATORIA: si falta, la lectura falla con un error explicito y NO
# cae a ningun modelo por defecto. "Gemini Flash" es una familia, no una version, y un id
# escrito a mano deja de existir sin avisar.
GEMINI_MODEL=
```

**Por qué el modelo falla cerrado y no tiene defecto (D6, R16):** mismo criterio que `SESSION_SECRET`,
que no se degrada cuando falta. Un valor por defecto escrito hoy es un id que Google retira dentro de
seis meses y que se descubre en producción — el arnés ya pagó eso (`AGENTS.md > Modelos`).

**Por qué la lectura es perezosa (R13, R22):** porque `lib/composition/index.ts` lo importa *todo*, y
la suite entera importa `lib/composition`. Si estas dos variables se leyeran al importar, **ningún**
test del repositorio arrancaría sin clave de Gemini. El bloque de `documentos` ya está escrito con esa
propiedad y se mantiene: **ninguna función se invoca en el punto de composición, solo se referencia.**

## 7. Cableado (D8, R21, R22) — y sí, toca `lib/composition/index.ts`

Bloque **nuevo al final** del bloque `documentos` existente (`lib/composition/index.ts:1083-1155`),
sin reordenar ni reformatear nada:

```ts
const aiReader: AiReader = { read: readWithGenai };

export const documentos = {
  …las cuatro claves de QC-106, sin tocar…
  readPdfWithAi: createReadPdfWithAi({ ai: aiReader, converter: pdfConverter }),
} as const;
```

`pdfConverter` **NO se vuelve a construir**: se reutiliza la constante que QC-106 dejó cableada
(`index.ts:1118`). Dos instancias del mismo puerto serían dos cableados que pueden divergir — el mismo
criterio con el que `proveedores` reutiliza `productCatalog`.

**AVISO DE CONFLICTO, para la validación de F1.4.** `lib/composition/index.ts` es uno de los dos
archivos que **QC-68 declaró intocables**. No hay forma de cablear un puerto nuevo sin tocarlo:
`docs/architecture.md` lo llama **punto ÚNICO de composición** y la guardia de arquitectura falla si
un adaptador driven se importa desde otro sitio. Las salidas posibles, para que decida el humano y no
yo:

- **(a) QC-108 espera** a que QC-68 cierre. Es la salida limpia y no requiere nada más.
- **(b) Se implementa todo menos el cableado** (T11), dejando la ficha al 95 % y el cableado como
  primera task del día en que QC-68 cierre. El módulo compila y sus tests pasan sin cablear: el caso
  de uso se prueba con dobles, no con la fachada.
- **(c) Se acepta el conflicto** y alguien resuelve el merge a mano. **No se recomienda**: son 1156
  líneas y ocho sesiones han escrito ahí.

**No se propone una cuarta vía de «cablear en otro archivo»**, porque sería romper la regla que hace
que este problema exista.

## 8. Propuesta de dependencia — **no instalada**, se aprueba en F1.4

Regla 7 de `CLAUDE.md` y `docs/architecture.md > Dependencias de terceros`. **Aquí no se instala
nada, no se toca `package.json` y no se escribe en `docs/dependencias.md`**: eso es F1.4 tras el «sí».

### 8.1. Qué código nos ahorra

Hablar con la API de Gemini a mano es: construir el cuerpo multimodal (partes de texto + partes
binarias con su `mimeType` y su base64), gestionar el tamaño del adjunto —un PDF de 20 MB en base64 no
cabe en cualquier ruta de subida—, la autenticación por cabecera, el manejo de errores de cuota y
sobrecarga, y seguir el versionado del endpoint. Es el mismo argumento con el que entró `resend`: el
cliente oficial es el que sigue al servicio cuando el servicio cambia.

### 8.2. Los cuatro checks

Son **los de la semilla**, verificados por el humano contra npm el **2026-09-18**; este documento **no
tiene red** y **no los rehace: los transcribe**.

| Paquete | Check 1 (no deprecated) | Check 2 (release < 12 meses) | Check 3 (≥ 10k desc./sem.) | Check 4 (licencia) |
|---|---|---|---|---|
| `@google/genai` | OK — sin `deprecated` | OK — **2.23.0 del 2026-09-16** | OK — **22.124.413** | OK — **Apache-2.0** |

**La fila tal cual iría en `docs/dependencias.md`**, para que el leader la pegue en F1.4 y no la
redacte de nuevo:

```
| `@google/genai` | Cliente oficial de Google para leer un PDF con Gemini (QC-108): construccion del cuerpo multimodal (prompt + PDF o PNG por pagina), autenticacion y manejo de la respuesta. La alternativa es un `fetch` a mano contra la API generativa, con base64, `mimeType` y versionado del endpoint por nuestra cuenta | aprobada | 2026-09-18 | **Los cuatro checks PASAN**, verificados contra el registro de npm el 2026-09-18 al acotar QC-108: sin `deprecated`; ultima release **`2.23.0` del 2026-09-16**; **22.124.413** descargas semanales; licencia **Apache-2.0**. Aprobada por el humano al aprobar el spec de QC-108 (F1.4), como manda `AGENTS.md`. **Aislada en un solo archivo**, `lib/modules/documentos/adapters/driven/ai/ai-reader-genai.ts`, detras del puerto `AiReader`, para que sustituirla sea reescribir ese archivo y no buscarla por el repo. Mismo criterio con el que entraron `@supabase/storage-js`, `resend`, `unpdf` y las nueve de TipTap. **DESCONOCIDO, y se dice**: como se pide un plazo maximo y como viaja un PDF o una imagen en su API publicada **no se pudo verificar en el paquete** —se escribio sin red y sin `node_modules`—, al contrario que con `unpdf` y `@supabase/storage-js`, que si se verificaron. Se cierra en la primera task del adaptador (`specs/QC-108-lectura-de-pdf-con-gemini/design.md > 8.3`) |
```

### 8.3. Lo que NO se pudo verificar, y por eso se declara DESCONOCIDO

El encargo pide comprobar **en la API publicada del paquete, no de memoria**, dos cosas: cómo se pide
un **plazo máximo** y cómo se manda un **PDF** y una **imagen**. **No es posible en este entorno**, y
se dice en vez de rellenarlo (regla 6 de `CLAUDE.md`):

- `@google/genai` **no está instalada**: no hay `node_modules/@google/genai` que leer, al contrario
  que con `@supabase/storage-js` en QC-106 —donde QC-106 sí pudo citar
  `dist/index.d.cts` y por eso enmendó una decisión con pruebas—.
- **No tengo red ni herramienta de consulta de paquetes** en esta sesión: no puedo hacer `npm view`,
  `npm pack` ni consultar la documentación del proveedor.

**Estado, entonces:**

| Pregunta | Estado |
|---|---|
| ¿Cómo se pide un plazo máximo? | **DESCONOCIDO.** No se escribe ninguna forma concreta en este diseño |
| ¿Cómo se manda un PDF? | **DESCONOCIDO.** Ni el nombre de la opción, ni si acepta bytes o base64, ni el límite de tamaño en línea |
| ¿Cómo se manda una imagen? | **DESCONOCIDO**, por lo mismo |

**Por qué esto NO bloquea el spec, y sí condiciona una task:** el diseño está construido para que esos
tres desconocidos vivan **dentro de un solo archivo** —`ai-reader-genai.ts`— detrás de un puerto de
**un método**. El caso de uso, el plazo, el discriminado, el código de error y **todos los tests** son
ciertos con cualquier forma que tenga esa API, porque ninguno la toca. La task del adaptador (T8)
**empieza verificando el paquete instalado** y anota lo que encuentre; si resultara que la librería no
admite abortar la petición, se aplica lo dicho en §3.1 y queda como límite (§12).

### 8.4. Alternativas descartadas

1. **`fetch` a mano contra la API generativa de Google, sin dependencia.** Es honesta y tiene
   precedente: QC-79 la registró para `resend`. **Descartada por D7**, que ya cerró la librería, y
   porque aquí el cuerpo es **multimodal** —no un JSON de tres campos como un correo—: base64 de hasta
   20 MB o hasta 50 PNG, `mimeType` por parte, y un endpoint versionado. Es bastante más que 25 líneas,
   y cuando Google cambie el formato lo descubriríamos en producción.
2. **`@google/generative-ai`** (el cliente anterior). Descartada: D7 nombra `@google/genai`, que es el
   SDK vigente, y proponer el otro sería reabrir una decisión cerrada.
3. **Una capa de abstracción de varios proveedores** (tipo «AI SDK»). Descartada por alcance: ninguna
   ficha de la épica QC-105 pide un segundo proveedor, y el puerto `AiReader` **ya es** la abstracción
   —cambiar de proveedor es reescribir un archivo—. Añadir una librería para abstraer lo que un puerto
   de un método ya abstrae es pagar dos veces.
4. **Respuesta estructurada** (pedirle a la IA un JSON con esquema). Técnicamente es lo que evitaría la
   pregunta abierta 1, y **está descartada a sabiendas por D3**. Se anota aquí para que quien acote
   QC-110 sepa que existe la vía.
5. **Que el modo imagen rasterice por su cuenta** con otra librería o con otros DPI. Descartada por
   D11 y R4: `PdfConverter` ya lo hace, con PNG a 150 DPI elegidos **precisamente pensando en lo que
   Gemini iba a leer** (QC-106 D9).
6. **Meter el plazo y los reintentos juntos aquí.** Descartada por D1 con su motivo escrito: dos capas
   reintentando multiplican el gasto en silencio.
7. **Guardar el resultado de la lectura en una fila.** Descartada por D10: el estado por archivo es de
   QC-111, que además tiene abierto dónde vive.

## 9. Cómo se prueba, sin red y sin claves (R26, R27, D9)

- **Un doble del puerto `AiReader`**, en memoria, que **registra sus llamadas**: cuántas veces, con
  qué prompt, con cuántas partes y de qué clase. Con eso se afirman R2 (el prompt que llega es el que
  se manda), R3/R4 (en modo imagen llegan N partes `image`; en modo pdf, una `pdf`) y R9 (una sola
  llamada).
- **Un doble del `PdfConverter`**, el mismo patrón que ya usa `tests/unit/documentos/convert-pdf.test.ts`:
  devuelve un número de páginas y páginas fabricadas, o lanza.
- **Ningún test construye el adaptador real.** Que la configuración se lea en la invocación (§6) hace
  que **importar** `ai-reader-genai.ts` y `ai-config-env.ts` con las variables vacías **no lance**, y
  eso sí se prueba: es el test que sostiene «la suite corre sin claves».
- **El plazo, con las tres vías de §4.** Ninguna espera tiempo real.
- **Los bytes se fabrican**: `%PDF-1.7…` como PDF válido y `Uint8Array` cortos como PNG. **Cero
  archivos binarios nuevos** en el repositorio.
- **El catálogo**, si la enmienda se aprueba: los cuatro puntos de §0.3 y un test que afirme que el
  texto de `ai_unavailable` es distinto del de `invalid_input` y del de `unexpected` — la misma forma
  que QC-81 usó con `batch_duplicate_lot` (`tests/unit/errores/catalogo.test.ts:178`).
- **Guardia de alcance de la ficha** (patrón `tests/unit/documentos/qc106-alcance.test.ts`): contra el
  merge-base con `origin/dev`, cero archivos bajo `app/**`, `components/**`, `e2e/**` y `db/**`; y
  `ports/pdf-converter.ts` y su adaptador **idénticos** a los de `dev` (R4). Si T0 salió «no»,
  `error-codes.ts` y `error-catalog.ts` también idénticos.

**Sin E2E, con motivo** (D5, R19): esta ficha no añade recorrido navegable. Es **deuda con
destinatario QC-107**, no exención de `CHECKPOINTS.md > Calidad de codigo`. Mismo criterio que QC-106
D17 y QC-25 D23.

## 10. Lo que esta ficha NO hace (y es criterio de rechazo si aparece)

- Ningún archivo bajo `app/**`, `components/**`, `app/api/**` ni `e2e/**` (R17, R19).
- Ningún adaptador **driving**, ninguna Server Action, ninguna ruta (R17).
- Ningún cambio en `db/schema.prisma`, ninguna migración, ningún `down.sql` (R20).
- Ninguna entrada nueva en `lib/modules/identity/domain/permissions.ts` (R18).
- Ni un carácter en `ports/pdf-converter.ts` ni en `pdf-converter-unpdf.ts` (R4).
- Ninguna dependencia instalada antes de T0 (R25).
- Ningún archivo de prompt ni texto de prompt en el código (R2) — eso es QC-109.

## 11. Trazabilidad prevista (requisito → dónde se demuestra)

El mapa definitivo lo escribe el implementer en `progress/impl_QC-108-*.md`; aquí va el previsto, para
que ninguna task nazca sin dueño. Está en `tasks.md > Mapa requisito → task`.

## 12. Límites aceptados, y quién los hereda

1. **La API de `@google/genai` es un desconocido declarado** (§8.3): plazo, PDF e imagen. Se cierra en
   T8, con red. **No bloquea el spec** porque vive en un solo archivo detrás de un puerto de un método.
2. **Si la librería no admite abortar la petición**, el plazo de 60 s garantiza que *el llamante* deja
   de esperar, pero la petición HTTP puede seguir viva hasta que el proveedor la cierre — y **la
   llamada ya se cobró**. Destinatario: **QC-111**, que es quien mide el gasto… salvo que la pregunta
   abierta 3 dice que **hoy nadie lo mide**.
3. **Nadie valida lo que la IA contesta** (pregunta abierta 2 de la semilla). Ningún requisito de esta
   ficha detecta un precio inventado. Sin ficha asignada.
4. **El gasto no tiene tope** (pregunta abierta 3). Una tanda en modo imagen son hasta 500 llamadas.
   Fuera de alcance y **sin ficha**.
5. **QC-110 recibe texto, no coordenadas** (pregunta abierta 1). Escrito para que quien acote QC-110
   llegue sabiendo.
6. **Colisión de la enmienda con QC-92** (§0.3): comparten la línea del conteo literal y la de la
   cabecera. Si QC-92 entra antes, el conteo es 48 y la cabecera lleva las dos. **No se resuelve
   aquí**.
7. **`lib/composition/index.ts` colisiona con QC-68** (§7). Es lo que decide si esta ficha corre en
   paralelo o espera. **Lo decide el humano en F1.4.**

## 13. Lo que el humano tiene que mirar al aprobar (F1.4)

1. **La octava enmienda al catálogo** (§5): `ai_unavailable`. **Sin ese «sí», se aplica el plan B de
   §5.1** y la pantalla de QC-107 pierde el matiz. Es la decisión más cara de deshacer después.
2. **La dependencia `@google/genai`** (§8), con la fila ya redactada y con el **desconocido de §8.3
   dicho de frente**.
3. **El conflicto con QC-68 por `lib/composition/index.ts`** (§7): esperar, implementar sin cablear, o
   aceptar el merge a mano.
4. **Los nombres de las dos variables** `GEMINI_API_KEY` y `GEMINI_MODEL` (§6): es lo único de la
   configuración que la tabla de decisiones no fija.
5. **El desajuste 11/12 en la tabla de decisiones**: el encargo hablaba de once filas y **hay doce**.
   Los requisitos cubren las doce; **la tabla no se ha tocado**.
