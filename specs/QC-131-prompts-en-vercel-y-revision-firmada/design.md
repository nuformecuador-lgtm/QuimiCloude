# QC-131 — prompts-en-vercel-y-revision-firmada · design.md

> Ficha **humana**, **solo catálogo** (`[D3]`). Este documento no diseña código y **no contiene el
> texto de ningún prompt** (QC-129 R9, `[D1]`): dice qué debe cumplir el de `catalogo`, dónde está
> su borrador, y trae la **guía** (§4). La mitad fórmula es **QC-157**.

## 1. Qué se entrega, en una frase

Un valor de `CATALOG_PROMPT` en Vercel (Production y Preview, mismo texto) que decide el humano, y
al menos una sección firmada de `catalogo` en `docs/revision-de-prompts.md`, cuya última no tiene
ningún «mal».

## 2. Qué espera el código de la respuesta (verificado, no supuesto)

Leído en el worktree el 2026-09-23:

- **El prompt entra tal cual.** `strategy-prompt-env.ts` devuelve el valor de la variable **sin
  recortar** (vacío o solo espacios = ausente → la fila termina en `error` con el motivo
  `falta la variable de entorno CATALOG_PROMPT`). `ai-reader-genai.ts` lo manda como **primera
  parte de texto**, seguida de las páginas rasterizadas a 150 ppp (`catalogo` es modo `images`,
  tope 50 páginas). No se fija `responseMimeType` ni `responseSchema`: la forma JSON **solo** la
  impone el texto del prompt.
- **Nadie valida la salida.** No existe esquema ni parser de la respuesta de ninguna estrategia.
  `read-pdf-with-ai.ts` → `process-pdf-by-strategy.ts` → `run-document-job.ts` pasan el texto sin
  tocarlo, y `document-batch-repository-prisma.ts#finish` lo guarda en
  **`document_files.extracted_text`**. Es R3 (= QC-129 R12): el módulo no interpreta. Cualquier
  respuesta se guarda igual, también un JSON inválido o envuelto en cercas de markdown.
- **Por eso el borrador se alinea con el consumidor futuro**:
  `lib/modules/proveedores/domain/catalog-line-input.ts` — `name` (texto, ≤120), `presentationId`
  (uuid, obligatoria), `unitId` (uuid, opcional), `cost` (cadena decimal `^\d{1,10}(\.\d{1,4})?$`,
  > 0), `minPurchase` (misma cadena, ≥ 0, opcional), `deliveryTime` (entero de **días** ≥ 0,
  opcional). La IA no puede devolver uuids: devuelve **texto** para presentación y unidad, y el
  importador futuro los resolverá. Importes como **cadena**, nunca como número de coma flotante
  (`docs/architecture.md > Anti-patrones`).

## 3. El prompt de `catalogo`: qué debe cumplir y dónde está el borrador

**Borrador:** `C:\Users\Cristian\Documents\trabajo\arc\labs\borradores-de-prompts\catalogo.md`
(raíz del repo principal, **no versionado**: `.gitignore` → `/borradores-de-prompts/`). Lo que haya
ahí **no es definitivo** hasta que el humano lo decide (R9).

Lo que el texto definitivo debe cumplir, sea cual sea su redacción:

| Regla | Origen |
|---|---|
| Pide, por cada línea, exactamente: nombre, presentación, unidad, precio, compra mínima, tiempo de entrega | R1 |
| No pide moneda, vigencia ni referencia del proveedor | R1 |
| Exige responder en JSON y declara **dentro del texto** la forma exacta | R3 |
| Ordena `null` para lo que el PDF no trae y prohíbe inventar o deducir | R4 |

Forma que propone el borrador (solo **claves y tipos**, no el texto del prompt): objeto raíz con
`lines`, lista de objetos con `name`, `presentation`, `unit`, `cost`, `minPurchase` (cadenas o
`null`) y `deliveryTime` (entero de días o `null`); `lines: null` si no hay ninguna línea. Claves en
inglés, iguales a las del dominio y sin sufijo `Id`; importes con punto decimal, sin separador de
miles ni símbolo; solo el JSON, sin texto alrededor ni cercas de markdown.

Puntos que decide el humano al ajustar (anotados en el borrador): la conversión de semanas a días,
qué hacer con un rango de entrega y qué precio vale cuando hay varios.

**Fórmula:** su borrador está en `borradores-de-prompts\formula.md` y pertenece a **QC-157**. Pide
cada materia prima en **porcentaje** (enmienda a QC-129 R11, `[D4]`); esta ficha no lo usa.

## 4. Guía para el humano (catálogo)

### 4.0 Antes de empezar

- Usuario con los permisos `proveedores.consultar` (ver la pantalla) y `proveedores.modificar`
  (`DOCUMENT_UPLOAD_PERMISSION`, subir); hoy lo tiene el rol administrador.
- Un proveedor ya dado de alta y un catálogo **real** en PDF (≤ 20 MB, ≤ 50 páginas). **El PDF no
  entra al repo.**
- Las demás variables del módulo ya deben estar en ese entorno (`GEMINI_API_KEY`, `GEMINI_MODEL`,
  las cuatro `QSTASH_*`, buckets de Supabase). Si falta alguna, la fila termina en «Error» y el
  motivo la nombra.

### 4.1 Poner la variable (R8)

1. Vercel → proyecto → **Settings → Environment Variables → Add New**.
2. **Key** `CATALOG_PROMPT`; **Value**: pega el texto definitivo **entero** (los saltos de línea
   valen). **Environments**: marca **Production** y **Preview**. No marques Development (local es la
   pregunta abierta 2 de QC-129, no se toca aquí). Guarda.
3. Comprueba en la lista que aparece en **Production y Preview** con el mismo valor.
4. Sin prefijo `NEXT_PUBLIC_`. No hace falta marcarla como secreta; tampoco estorba.
5. `FORMULA_PROMPT` **no** se pone en esta ficha: es QC-157.

### 4.2 Redesplegar (R10)

Vercel solo aplica variables a despliegues **nuevos**. **Deployments** → el último de Production →
menú `⋯` → **Redeploy** (da igual reutilizar la caché de build: el prompt se lee en ejecución, no
al compilar). Para Preview, el siguiente push a una rama ya la toma; si quieres uno ahora,
**Redeploy** sobre el último Preview. Apunta la hora del redespliegue: la pasada debe ser posterior.

### 4.3 Disparar una lectura real

1. Entra al despliegue de **Production** (propuesta de `[D5]`) → **Proveedores** (`/proveedores`) →
   abre un proveedor → `/proveedores/<id>`.
2. Al final de la página está el componente de carga de QC-107 (modo catálogo). **Elegir PDFs** →
   el catálogo real → **Subir**.
3. La fila pasa por «Subido» → «En cola» → «Procesando» → **«Listo»** o **«Error»** (con motivo).
   Tras leer corre también el **recorte de imágenes** (QC-110): si el recorte falla, la fila acaba
   en «Error» y el texto **no se guarda**. Eso no es un veredicto sobre el prompt: repite la subida.

### 4.4 Dónde ver el resultado

- **La consola (QC-109) NO trae el texto.** En Vercel → **Logs**, busca `[process-pdf-by-strategy]`:
  la línea dice `estrategia=… modo=… ruta='…' paginas=… longitud=…`. Sirve para confirmar que la
  lectura ocurrió y que `longitud` es > 0; por diseño (QC-109, QC-129 R7) nunca incluye la respuesta
  ni el prompt.
- **La respuesta está en la base**: Supabase → **Table Editor → `document_files`**, fila más
  reciente (o la de la `path` que subiste), columna **`extracted_text`**. En SQL:
  `select path, status, extracted_text from document_files order by created_at desc limit 5;`
- Alternativa: DevTools del navegador → **Network**, la respuesta del sondeo de estado de la tanda
  trae `extractedText` de cada archivo (la pantalla no lo pinta).
- Abre el PDF al lado y compara campo por campo.

### 4.5 Rellenar y firmar `docs/revision-de-prompts.md` (R11–R14)

1. Rama: esta (`feature/QC-131-…`). No toques la cabecera, las definiciones de veredicto ni la regla
   de cierre (R14).
2. Al **final** del documento añade **una sección por pasada**: `## Pasada AAAA-MM-DD — catalogo`,
   su **ficha** (fecha, estrategia, nombre del PDF y nº de páginas, tu nombre), la tabla
   `catalogo` (seis filas) y las **dos filas de cierre**. La tabla `formula` no se rellena aquí.
3. Veredicto por fila: **bien** / **mal** / **no estaba** (definiciones en el propio documento).
   Nota **obligatoria** en toda fila con **mal**. En la fila «la respuesta es JSON con la forma que
   el prompt declara»: si `extracted_text` llega envuelto en cercas de markdown o con texto
   alrededor, anótalo en la nota; tú decides si es **mal**.
4. **No copies el texto del prompt** ni una parte de él (QC-129 R16).
5. Firmar = tu nombre en la ficha + commit con tu autoría. **Desde ese commit la sección no se
   edita.**
6. Si hay algún **mal**: corrige el texto en Vercel (**Production y Preview**, mismo texto), vuelve a
   4.2 y repite en una **sección nueva** debajo. La anterior se queda como está.
7. Hecho cuando la **última** sección de `catalogo` no tiene ningún **mal** (R13).

## 5. Modelo de datos, rutas, endpoints, integraciones, dependencias

**Ninguno.** Sin tabla, migración, RLS, endpoint, Server Action ni pantalla. Sin librería nueva. La
única integración es el panel de Vercel y la lectura de `document_files`, las dos manuales.

## 6. Verificación y trazabilidad

`[QC-129 D5]`: ningún test llama a Gemini. Esta ficha **no añade tests**; su evidencia es humana o de
inspección, y el reviewer no debe contarlo como hueco.

| Requisito | Evidencia |
|---|---|
| R1 | tabla `catalogo` de la última sección firmada, sin **mal** |
| R2 | **va a QC-157** — sin evidencia en esta ficha |
| R3 | fila de cierre «JSON con la forma declarada» de la sección `catalogo` |
| R4 | fila de cierre «lo que no traía volvió `null`» + veredictos «no estaba» |
| R5, R8 | declaración firmada del humano (T3) de que `CATALOG_PROMPT` está en Production y Preview con el mismo texto |
| R6 | existe la sección `catalogo` firmada, con nombre de PDF real y firma de persona |
| R7 | inspección: ninguna cadena de los borradores aparece en archivos versionados; `git diff dev --stat` sin archivos fuera de `specs/`, `progress/` y `docs/revision-de-prompts.md` |
| R9 | inspección: ningún commit de agente añade contenido a `docs/revision-de-prompts.md` |
| R10 | la fecha de cada sección es posterior al redespliegue anotado en T4 |
| R11, R12 | inspección del diff de `docs/revision-de-prompts.md`: solo adiciones; ninguna línea de una sección ya firmada cambia |
| R13 | inspección de la última sección de `catalogo` |
| R14 | inspección: el diff de `docs/revision-de-prompts.md` es solo de adición al final |

Gate: `./init.sh` completo antes del PR, aunque el diff sea solo de documento (regla 5).

## 7. Alternativa descartada: forzar la forma con salida estructurada de Gemini

**La idea.** En vez de declarar la forma en el texto, pasar a `generateContent` un
`responseMimeType: 'application/json'` y un `responseSchema` por estrategia. Gemini garantizaría
JSON válido con esas claves, sin cercas de markdown, y la fila de cierre de R3 dejaría de fallar.

**Por qué no.** (1) `[QC-129 D3]` y R3 fijan la forma **dentro del texto del prompt** y que el
módulo **no interpreta** la respuesta; un esquema en el adaptador es justo interpretarla y reabre
una decisión cerrada. (2) Exige diff en `ai-reader-genai.ts` y en el puerto `AiReader`, y `[D1]`
dice que esta ficha no produce código. (3) Pondría la forma en el repo, versionada junto al código,
mientras el texto vive en Vercel: dos fuentes que se desincronizan en el primer ajuste del prompt.
Si la revisión demuestra que el modelo no respeta la forma, es una ficha nueva con su spec.

**Descartada también:** dejar los borradores dentro de `design.md` (la primera versión de este
spec). Incumple QC-129 R9 en cuanto el humano adopta un borrador casi tal cual, y ninguna guardia lo
detectaría. `[D1]` los saca a una carpeta no versionada.
