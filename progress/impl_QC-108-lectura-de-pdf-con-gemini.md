# QC-108 — lectura-de-pdf-con-gemini · bitacora de implementacion

> Rama `feature/QC-108-lectura-de-pdf-con-gemini`, worktree
> `.worktrees/QC-108-lectura-de-pdf-con-gemini`, desde `fdb33c5`.
> El gate completo lo corre el leader (`AGENTS.md > Regla del gate`).

## T0 — La puerta F1.4, cerrada por el humano el 2026-09-18

Las tres respuestas, tal como salieron:

1. **La OCTAVA enmienda al catalogo cerrado: SI.** Se anade `ai_unavailable`.
   **El plan B de `design.md > 5.1` queda DESCARTADO**: el fallo del proveedor NO cae a
   `unexpected`. **El camino de R12 que se ejecuta es el de la enmienda**, no el plan B, asi que
   no hay perdida de matiz que anotar: QC-107 podra distinguir un corte del proveedor de un bug
   nuestro, y el registro tambien.
2. **La dependencia `@google/genai`: SI, y ya estaba instalada por el humano** al abrir F2.0:
   `2.23.0` en `package.json`, con su fila ya escrita en `docs/dependencias.md:36`.
   La implementacion **no la reinstala y no toca esa fila**.
3. **El conflicto con QC-68 por `lib/composition/index.ts`: salida (d)** — se implementa
   **entero, T10 incluida**. No se espera a QC-68 y el cableado no se deja fuera. La escritura va
   **al final del bloque `documentos`** (`:1083-1155`), sin reordenar ni reformatear nada, y
   reutilizando la constante `pdfConverter` que QC-106 cableo en `:1118`.

### Efecto colateral de la instalacion aprobada, arreglado como primer paso de T0

`tests/guards/guard-identificador-de-request.test.ts` lleva el censo de dependencias **escrito a
mano** (QC-71, R20). La instalacion de `@google/genai` lo puso en rojo: declaraba 34 y esperaba
33. Se sube `DEPENDENCIAS_ESPERADAS` a **34** (`:250`) y se actualiza el comentario de cabecera
(`:238-243`) con la nota fechada del alta, con el mismo patron con el que ese archivo registro
las altas anteriores. **No se silencio ni se salto la guardia.**

## Los tres DESCONOCIDOS de `design.md > 8.3`, CERRADOS con la API real

`design.md > 8.3` los declaro desconocidos porque se escribio sin red y sin `node_modules`. Con el
paquete ya instalado se leyeron **sus declaraciones de tipos**, no de memoria. Todas las citas son
de `node_modules/@google/genai/dist/genai.d.ts`, version **2.23.0**
(`node_modules/@google/genai/package.json:3`).

| Pregunta | Estado | Lo que dice la API real |
|---|---|---|
| Como se pide un **plazo maximo** | **CERRADO** | Dos vias, y **son distintas**. (a) `GenerateContentConfig.httpOptions?: HttpOptions` (`genai.d.ts:5899`), y `HttpOptions.timeout?: number` — *«Timeout for the request in milliseconds»* (`genai.d.ts:8172`). (b) `GenerateContentConfig.abortSignal?: AbortSignal` (`genai.d.ts:5906`) |
| Como viaja un **PDF** | **CERRADO** | Como `Part.inlineData?: Blob` (`genai.d.ts:12351`), donde `Blob` es `{ data?: string, mimeType?: string, displayName?: string }` y `data` esta **codificado en base64** (`genai.d.ts:1378-1386`). Hay helper: `createPartFromBase64(data, mimeType)` (`genai.d.ts:2903`). `mimeType` = `application/pdf` |
| Como viaja una **imagen** | **CERRADO** | **Por el mismo camino**: `inlineData` con `mimeType` = `image/png`. El `.d.ts` no ofrece ninguna forma distinta para imagen: el docblock de `Part.inlineData` dice literalmente *«can be used to include images, audio, or video»* (`genai.d.ts:12350`) |

La forma completa de la llamada, tambien leida:
`new GoogleGenAI({ apiKey })` (`genai.d.ts:7084`, opcion `apiKey` en `:7192`) →
`ai.models.generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>`
(`genai.d.ts:11445`), con `{ model: string, contents: ContentListUnion, config?: GenerateContentConfig }`
(`genai.d.ts:6060-6069`) y el texto en el getter `GenerateContentResponse.text: string | undefined`
(`genai.d.ts:6117`). `createPartFromText` (`genai.d.ts:2927`) y `createUserContent`
(`genai.d.ts:3046`) arman el turno.

### Lo que este cierre **confirma**, y es un limite, no una buena noticia

El limite 2 de `design.md > 12` era una sospecha; ahora esta **verificado en el `.d.ts`**. El
docblock de `abortSignal` lo dice con todas las letras (`genai.d.ts:5900-5905`):

> *«NOTE: AbortSignal is a client-only operation. Using it to cancel an operation will not cancel
> the request in the service. You will still be charged usage for any applicable operations.»*

Es decir: **abortar deja de esperar, pero no deja de pagar**. Ni `abortSignal` ni
`httpOptions.timeout` evitan el cobro de una lectura que el proveedor ya empezo. Consecuencia
directa: el plazo de la libreria **no sustituye** al de R7. El plazo de 60 s lo hace cumplir **el
dominio**, con un `Promise.race` sobre un `TimeoutRunner` inyectable, que es lo unico que puede
probarse sin red (D9) y lo unico que garantiza el plazo **sea cual sea** lo que haga la libreria.
El plazo se le pasa **ademas** al adaptador para que aborte de verdad la peticion HTTP en vez de
dejarla viva. Destinatario del limite del gasto: **QC-111** — con la salvedad de la pregunta
abierta 3, que dice que **hoy nadie lo mide**.

## T12 — El E2E, diferido como deuda con destinatario

**No hay E2E en esta ficha**, y no es una exencion de `CHECKPOINTS.md > Calidad de codigo`: es
**deuda con destinatario**. El motivo es que esta ficha **no anade ningun recorrido navegable** que
un test E2E pueda visitar — no hay pantalla, ni ruta, ni Server Action (R17, D5), porque es una
capacidad interna que invocara por dentro el trabajo de la cola de QC-111. **El destinatario de la
deuda es QC-107**, que es la ficha que trae la pantalla. Mismo criterio que QC-106 D17 y QC-25 D23.
La verificacion de esta ficha es **unitaria** (R19), y se cita desde el mapa de trazabilidad.
