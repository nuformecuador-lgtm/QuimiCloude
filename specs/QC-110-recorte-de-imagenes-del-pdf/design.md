# QC-110 — recorte-de-imagenes-del-pdf · design.md

> Diseño técnico de los requisitos de `requirements.md`. El bloque de Alcance y la tabla de
> «Decisiones cerradas» de ese archivo los fijó el humano ANTES del spec y aquí **no se reabren**:
> este documento solo dice **cómo** se cumplen.

## 0. Hallazgos que el leader tiene que ver antes de aprobar

1. **Esta ficha pone en rojo, a propósito, la guardia de alcance de QC-111.**
   `tests/unit/documentos/qc111-alcance.test.ts` afirma bajo «R12 — SIN RECORTE DE IMAGENES» que
   ningún nombre bajo `lib/modules/documentos/ports/` contiene `recorte`/`crop`/`coordenadas`, y que
   `run-document-job.ts` no los nombra fuera de comentario. Los dos puertos nuevos y el enganche los
   nombran. **No es una contradicción con una decisión cerrada**: la propia QC-111 `[D7]` escribió
   que «QC-110 engancha su paso cuando exista». La salida es **enmendar ese bloque** (T12), dejando
   escrito en el test que la ausencia dejó de ser cierta el día que el paso existió, y **no
   borrarlo**: lo que sigue vivo de R12 —que `db/schema.prisma` no gana ninguna columna de salida del
   recorte— es exactamente `[D10]` de esta ficha y se conserva. Se señala porque toca un test ajeno.
2. **El recorte rasteriza las páginas por SEGUNDA vez en el mismo trabajo.** La lectura con IA de la
   estrategia `catalogo` ya rasterizó (dentro de `read-pdf-with-ai.ts`), pero **no devuelve** las
   páginas: `AiReadResult` solo lleva texto. Enhebrarlas hasta aquí obligaría a cambiar el resultado
   publicado de QC-108 y de QC-109 (ver §12.2). Este diseño **acepta el segundo render** y lo dice:
   es el paso más caro del recorrido y se paga dos veces por archivo de `catalogo`, dentro de una
   función con `maxDuration` acotado. Si el humano prefiere pagar el cambio de contrato en vez del
   render, es decisión suya y cambia §4 y §12.2.
3. **Que `sharp` corra en el runtime de Vercel es un DESCONOCIDO**, igual que lo fue
   `@napi-rs/canvas` (su fila en `docs/dependencias.md` lo dice). Es binario nativo y este diseño se
   escribe sin desplegar. No bloquea el spec —`serverExternalPackages` es la condición conocida para
   que el build termine (R10)—, pero **no se afirma** que funcione en producción hasta que alguien lo
   despliegue.
4. **Las tres preguntas abiertas siguen abiertas** y este diseño **no las rellena**:
   - *Tamaño mínimo de un recorte*: no se implementa ningún umbral. Una región de 3×3 píxeles se
     recorta y se sube. Lo único que hay es el mínimo técnico del adaptador (§6.2): una región que
     redondea a menos de 1 píxel se lleva a 1 píxel para que la librería no reviente, lo que **no es
     un umbral de negocio** y no descarta nada.
   - *Caducidad de los recortes*: nada los borra. No hay poda, ni cron, ni limpieza al reprocesar; un
     PDF reprocesado **sobrescribe** los recortes de la ruta si el identificador del archivo es el
     mismo, y deja huérfanos los que la IA ya no identifique.
   - *Tope de recortes por PDF*: **no hay tope**. Un PDF de 50 páginas con veinte regiones cada una
     son mil recortes y mil subidas en un solo trabajo. El riesgo que la pregunta 3 nombra es real y
     este diseño **no lo mitiga**, porque inventar un tope sería inventar la decisión.

## 1. Qué se construye, en una frase

Un caso de uso nuevo del módulo `documentos` —**recortar las imágenes de un PDF de catálogo**— que
rasteriza las páginas, le pide a la IA **dónde** están las imágenes, recorta cada región con `sharp`
y sube los PNG a un bucket propio; más su **enganche** dentro de `run-document-job`, que lo invoca
**solo** cuando la estrategia de la tanda es `catalogo` (R1).

Lo que **no** se construye: ninguna tabla (R15), ninguna pantalla, ningún consumidor de los recortes
(hoy nadie los lee), ninguna ampliación de `DocumentStorage` (R13) ni del puerto `AiReader` (R3).

## 2. Modelo de datos

**Ninguno.** No hay tabla, ni columna, ni migración, ni `down.sql`, ni policy de RLS: los recortes
viven solo en el bucket (`[D10]`, R15). Por lo mismo **no hay `company_id` que declarar** y la lista
cerrada de tablas exentas de `docs/architecture.md > Dominio` no se toca: el aislamiento por empresa
es **la ruta**, igual que en QC-106 (§6.1).

Consecuencia aceptada, dicha aquí para que no sorprenda: sin fila, **nada sabe cuántos recortes salió
de un PDF**. Listar la carpeta del bucket es la única forma de averiguarlo, y eso es lo que `[D9]`
compra al agrupar por archivo.

## 3. Archivos

### 3.1 Nuevos

| Archivo | Qué es |
| --- | --- |
| `lib/modules/documentos/ports/image-cropper.ts` | Puerto: recortar una región de un PNG. Lo implementa `sharp` |
| `lib/modules/documentos/ports/crop-storage.ts` | Puerto: **una sola operación**, subir bytes a una ruta (R13) |
| `lib/modules/documentos/domain/crop-region.ts` | El esquema zod de la región y el **ajuste al borde** (R4, R6, R7) |
| `lib/modules/documentos/domain/crop-coordinates.ts` | Sacar el JSON del texto de la IA y validarlo (R4, R5) |
| `lib/modules/documentos/domain/crop-prompt.ts` | El prompt provisional del recorte (R18) |
| `lib/modules/documentos/domain/crop-catalog-images.ts` | El caso de uso (R1, R16, R17) |
| `lib/modules/documentos/adapters/driven/image/image-cropper-sharp.ts` | **Único archivo del repo que importa `sharp`** (R8) |
| `lib/modules/documentos/adapters/driven/storage/crop-storage-supabase.ts` | El bucket de recortes |
| `lib/modules/documentos/adapters/driven/config/crop-storage-config-env.ts` | Su variable de entorno (R14) |

### 3.2 Tocados

| Archivo | Cambio |
| --- | --- |
| `lib/modules/documentos/domain/document-path.ts` | Gana `buildCropPath`. Sigue siendo **el único sitio** donde se escribe el formato de una ruta del bucket |
| `lib/modules/documentos/domain/run-document-job.ts` | Gana la dependencia del recorte y el enganche condicional (§7). Se limpia su docblock: la frase «Sin recorte de imagenes…» deja de ser cierta |
| `lib/modules/documentos/domain/read-pdf-with-ai.ts` | **Solo** se exporta el corredor de plazo que ya existe (`raceAgainstTimeout`), para no reimplementar el plazo (§4, R2) |
| `lib/modules/documentos/index.ts` | Reexporta `createCropCatalogImages` desde `./domain` |
| `lib/composition/index.ts` | Cablea los dos puertos nuevos y construye el caso de uso; se lo pasa a `runDocumentJob` |
| `next.config.ts` | `serverExternalPackages` pasa a `['@napi-rs/canvas', 'sharp']` (R10) |
| `tests/unit/documentos/canvas-no-empaquetado.test.ts` | Pasa a exigir **los dos** paquetes (R10) |
| `tests/unit/documentos/qc111-alcance.test.ts` | Enmienda del bloque R12 (§0.1) |
| `tests/unit/documentos/run-document-job.test.ts` | Sus dobles ganan la dependencia nueva |
| `package.json`, `docs/dependencias.md`, `.env.example` | `sharp` y la variable del bucket |

## 4. El caso de uso: `crop-catalog-images.ts`

```ts
export type CropCatalogImagesInput = {
  readonly documentFileId: string;   // agrupa los recortes en el bucket
  readonly companyId: string;        // sale de la FILA del archivo, nunca del mensaje
  readonly path: string;             // solo para poder nombrar el archivo al fallar
  readonly bytes: Uint8Array;        // los MISMOS bytes que ya descargó el trabajo
};

export type CropCatalogImagesResult =
  | { readonly ok: true; readonly uploaded: number; readonly skipped: number }
  | { readonly ok: false; readonly code: ErrorCode; readonly reason: string };

export type CropCatalogImagesDeps = {
  readonly converter: PdfConverter;       // el MISMO de la conversión
  readonly ai: AiReader;                  // el MISMO puerto, sin tocar (R3)
  readonly cropper: ImageCropper;         // puerto nuevo
  readonly storage: CropStorage;          // puerto nuevo, una sola operación (R13)
  readonly log: CropRegionLog;            // puerto nuevo, registra cada región saltada (paso 6)
  readonly prompt?: () => string;         // por defecto, el provisional de §5
  readonly timeout?: TimeoutRunner;       // por defecto, el corredor ya existente
};
```

> Tabla corregida el 2026-09-21 por decisión humana tras el rechazo del reviewer: faltaba `log`, que el paso 6 ya exigía.

Pasos, en este orden:

1. **Contar páginas y aplicar el tope** (`countPages`, `MAX_PDF_PAGES`), igual que hace
   `buildImageParts`: si se pasa, `invalid_input`. Contar es barato; renderizar primero y rechazar
   después sería pagar lo caro para tirarlo.
2. **Rasterizar** con `renderPages(bytes, PAGE_RENDER_DPI)` (R2). Es el segundo render del trabajo, y
   §0.2 lo declara.
3. **Pedir coordenadas**: `ai.read({ prompt, parts, timeoutMs })` con las páginas como partes
   `image` y `timeoutMs = AI_READ_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND`, envuelto en el
   **mismo** corredor de plazo que ya usa la lectura (se exporta, no se reescribe: el número vive una
   sola vez, `domain/limits.ts`). Un fallo o un plazo agotado ⇒ `ai_unavailable` (reintentable, R5 y
   la clasificación que ya existe en `failure-kind.ts`).
4. **Interpretar y validar** el texto (§5). Malformado ⇒ `invalid_input` y el archivo queda en error
   (R5).
5. **Ajustar al borde** cada región (R7) y **agrupar por página**, conservando el orden en que la IA
   las devolvió: ese orden es el que numera `<n>`.
6. **Recortar y subir**, región a región. Cada una: `cropper.crop(png, region)` →
   `storage.upload(buildCropPath(...), recorte)`. **Un fallo de una región no aborta el bucle**
   (R17): se cuenta en `skipped` y se registra la causa por el mismo canal que el resto del módulo.
   Una región que apunta a una página inexistente es exactamente ese caso —no hay PNG que recortar—
   y también se salta.
7. **Devolver** `{ ok: true, uploaded, skipped }`. Cero regiones ⇒ `{ ok: true, uploaded: 0 }` y el
   trabajo termina bien (R16).

El caso de uso **no recibe actor** y no consulta ningún permiso (R19), igual que el resto de piezas
que corren dentro del trabajo de la cola.

## 5. El contrato de las coordenadas

### 5.1 Lo que se le pide a la IA

El prompt provisional (R18) vive en `domain/crop-prompt.ts` como constante, con su cabecera
declarando que es provisional y que afinar el texto no es de esta ficha. Pide, en esencia:

- devolver **solo** un objeto JSON con la forma de §5.2;
- una entrada por **cada imagen, foto o ilustración** que contenga cada página, sin incluir texto,
  tablas ni fondos;
- las medidas **en proporción de la página, entre 0 y 1**, nunca en píxeles (`[D6]`);
- y devolver `{"images": []}` cuando la página no tenga ninguna (`[D12]`).

### 5.2 La forma esperada

```json
{
  "images": [
    { "page": 1, "x": 0.08, "y": 0.12, "width": 0.4, "height": 0.3 }
  ]
}
```

### 5.3 Cómo se extrae del texto

Los modelos envuelven el JSON en prosa o en vallas de código. La extracción es deliberadamente
tonta y está escrita una sola vez en `crop-coordinates.ts`:

1. se quitan las vallas de código si las hay;
2. se toma la subcadena desde el primer `{` hasta el último `}`;
3. `JSON.parse`;
4. **zod** valida: `images` es un arreglo; `page` es entero `>= 1`; `x`, `y`, `width` y `height` son
   números finitos; `width` y `height` son `> 0`; los cuatro están dentro de `[0, 1]` (R4, R6).

Cualquier fallo de los cuatro pasos es **el mismo** resultado: `invalid_input` con un motivo que dice
qué falló y sobre qué ruta, sin volcar el texto entero de la IA al registro (R5).

### 5.4 El ajuste al borde (R7)

Se hace en el **dominio** y en proporciones, antes de tocar ningún píxel:

```
x      = clamp(x, 0, 1)
y      = clamp(y, 0, 1)
width  = clamp(width,  0, 1 - x)
height = clamp(height, 0, 1 - y)
```

Una región que tras el ajuste tenga ancho o alto **cero** no es recortable: se salta como cualquier
otra región fallida (R17). No es un umbral de tamaño —eso sigue abierto (§0.4)—, es la única
respuesta posible a un rectángulo vacío.

## 6. Los dos puertos nuevos

### 6.1 `CropStorage` — una sola operación (R13)

```ts
export interface CropStorage {
  /** Sube los bytes de un PNG a una ruta del bucket de recortes. Lanza si no puede. */
  upload(path: string, png: Uint8Array): Promise<void>;
}
```

Una sola operación porque es lo único que este paso necesita: no firma, no descarga y no borra.
`DocumentStorage` se queda **intacto** —está atado a otro bucket y solo sabe **firmar** subidas para
el navegador, no subir bytes desde el servidor—, y dos buckets con dos adaptadores es lo que ya pasó
con el de recetas y el de PDFs.

El adaptador (`crop-storage-supabase.ts`) resuelve su configuración **en cada llamada**, nunca al
importar, igual que los otros dos adaptadores de Storage del repo: así `lib/composition` se construye
sin leer una variable y la suite corre sin bucket configurado. Variables (R14):

| Variable | Nueva | Por qué |
| --- | --- | --- |
| `SUPABASE_STORAGE_URL` | no | Es del **proyecto**, no del bucket: se reutiliza |
| `SUPABASE_STORAGE_KEY` | no | Es la **credencial** del proyecto: se reutiliza |
| `SUPABASE_CROPS_BUCKET` | **sí** | El bucket es **nuevo y propio** de los recortes |

La ruta se construye en `document-path.ts`, que sigue siendo el único sitio del módulo donde se
escribe el formato de una ruta del bucket:

```ts
buildCropPath(companyId, documentFileId, pageNumber, index) // <empresa>/<id>/<pagina>-<n>.png
```

`<n>` empieza en **1** y numera las regiones **dentro de su página**, en el orden en que llegaron. El
primer segmento es la empresa, de modo que `isPathInCompany` —que ya existe— vale como afirmación en
los tests (R12).

### 6.2 `ImageCropper` — el único sitio de `sharp` (R8)

```ts
/** Región YA ajustada al borde, en proporción de la página (0..1). */
export type CropRegion = {
  readonly x: number; readonly y: number;
  readonly width: number; readonly height: number;
};

export interface ImageCropper {
  /** Recorta la región del PNG y devuelve otro PNG. Lanza si no puede. */
  crop(png: Uint8Array, region: CropRegion): Promise<Uint8Array>;
}
```

El puerto habla en **proporciones** y no en píxeles a propósito: quien conoce el tamaño real del PNG
es la librería, no el dominio, y pedirle píxeles al dominio le obligaría a decodificar la imagen —que
es justo lo que el puerto existe para evitar—. El adaptador lee `metadata()`, multiplica, redondea,
**recorta a los límites reales del PNG** (defensa por si el redondeo se pasa un píxel) y usa un
mínimo de **1 píxel** de ancho y alto para no invocar a la librería con un rectángulo vacío.

`sharp` se carga en el adaptador y sus errores se envuelven diciendo **qué** operación falló, sin
arrastrar la pila de la librería, igual que `pdf-converter-unpdf.ts`.

## 7. El enganche en `run-document-job.ts`

`RunDocumentJobDeps` gana un campo:

```ts
readonly cropCatalogImages: (input: CropCatalogImagesInput) => Promise<CropCatalogImagesResult>;
```

y el flujo, **solo** en la rama de éxito del procesamiento por estrategia:

```
result.ok
  └─ batch.strategy === 'catalogo'  ──sí──> cropCatalogImages({ documentFileId, companyId, path, bytes })
  │                                          ├─ ok    ──> finish(done, texto) + storage.remove(path)
  │                                          └─ !ok   ──> finish(error|requeue, code, reason)   ← NO borra
  └────────────────────────────────no──────> finish(done, texto) + storage.remove(path)
```

Cuatro cosas que esto fija, y por qué:

1. **El recorte corre ANTES de cerrar la fila.** `[D5]` dice que un texto de coordenadas malformado
   deja el archivo **en error con su motivo**; eso solo es posible si el paso ocurre antes del
   `finish`.
2. **Si el recorte falla, el PDF NO se borra.** El borrado sigue atado a terminar bien, que es
   `[D6]` de QC-111 sin enmendar.
3. **La clasificación reintentable/definitivo no cambia**: sale del `failureKind` que ya existe
   —`ai_unavailable` reintenta, `invalid_input` y `unexpected` no—, así que un proveedor caído
   durante el paso de coordenadas vuelve a la cola como cualquier otro fallo de IA.
4. **Reprocesar repite el trabajo entero**, incluidos los recortes ya subidos, que se sobrescriben en
   la misma ruta. No hay estado intermedio: la idempotencia del trabajo sigue siendo la de QC-111
   (`claim` sobre la fila), y esta ficha no añade otra.

La estrategia se lee de la **tanda**, que `run-document-job` ya tiene en la mano (`batch.strategy`):
no nace ninguna columna ni parámetro nuevo por archivo.

## 8. Dependencia nueva: `sharp` (R9, R10)

- **Qué hace y qué código nos ahorra.** Decodificar PNG, recortar una región (`extract`) y volver a
  codificar, con el redimensionado y el manejo de color resueltos. Escribirlo a mano es decodificar y
  recodificar PNG por nuestra cuenta: exactamente lo que `docs/architecture.md > Dependencias de
  terceros` manda no reimplementar.
- **Los cuatro checks — PASAN**, verificados contra el registro de npm y GitHub el **2026-09-21** por
  el humano al acotar la ficha (fila de la tabla de decisiones): sin `deprecated`; última release
  **v0.35.4 del 2026-08-26**; **72.211.349** descargas semanales; licencia **Apache-2.0**. La fila de
  `docs/dependencias.md` se escribe con **estos** números.
- **Aprobación.** Ya la dio el humano al acotar; se reafirma al aprobar este spec (F1.4), como manda
  `AGENTS.md`. **Nada se instala antes** (regla 7 de `CLAUDE.md`).
- **Peso.** Ya está instalada como `optionalDependency` de `next@16.3.0`, así que declararla no añade
  peso al despliegue; declararla igual es lo que evita que el día que Next la cambie o la quite el
  código se rompa sin que nada avise.
- **Aislamiento.** Un solo archivo: `lib/modules/documentos/adapters/driven/image/image-cropper-sharp.ts`,
  detrás del puerto `ImageCropper`. Mismo criterio con el que entraron `unpdf`, `@google/genai`,
  `@upstash/qstash` y `@supabase/storage-js`.
- **Binario nativo.** Entra en `serverExternalPackages` junto a `@napi-rs/canvas`, y la guardia
  `tests/unit/documentos/canvas-no-empaquetado.test.ts` pasa a exigir **las dos**, con su control
  positivo (R10). Sin eso, el precedente medido el 2026-09-21 es que `next build` sale con exit 1.
- **DESCONOCIDO, y se dice**: si el binario carga en el runtime de Vercel no se ha verificado (§0.3).

## 9. Verificación (R22, R23) y trazabilidad

Todo con **dobles**: un `AiReader` que devuelve un texto fijo, un `ImageCropper` que devuelve bytes
fijos o lanza, un `CropStorage` en memoria que apunta las rutas recibidas, y un `PdfConverter` que
devuelve páginas inventadas. **Ningún test llama a la red** ni exige variables de entorno. El
adaptador de `sharp` se ejercita con un PNG minúsculo construido en el propio test: es cómputo local,
no red.

| R | Test |
| --- | --- |
| R1 | `crop-catalog-images.test.ts` + `run-document-job.test.ts`: con `formula` el doble del recorte **no se invoca**; con `catalogo` sí |
| R2 | `crop-catalog-images.test.ts`: `renderPages` recibe `PAGE_RENDER_DPI`; se supera `MAX_PDF_PAGES` ⇒ `invalid_input` |
| R3 | `crop-catalog-images.test.ts`: el doble de `AiReader` recibe partes `image` y el prompt del recorte, y devuelve `string`. `module-contract.test.ts`: el puerto `AiReader` conserva su forma |
| R4 | `crop-coordinates.test.ts`: casos válidos e inválidos del esquema |
| R5 | `crop-coordinates.test.ts` + `crop-catalog-images.test.ts`: texto sin JSON, JSON roto y JSON que no encaja ⇒ `invalid_input`, cero subidas |
| R6 | `crop-coordinates.test.ts`: medidas fuera de `[0,1]`, negativas, cero o no numéricas ⇒ rechazo |
| R7 | `crop-region.test.ts`: región desbordada ⇒ ajustada al borde, y **sigue** recortándose |
| R8 | `qc110-alcance.test.ts`: `sharp` solo aparece en un archivo del repo; `domain/` y `ports/` no lo importan; el cableado solo en `lib/composition` |
| R9 | `qc110-alcance.test.ts`: la única dependencia nueva del diff es `sharp`, y `docs/dependencias.md` trae su fila `aprobada` |
| R10 | `canvas-no-empaquetado.test.ts` (enmendado): `serverExternalPackages` contiene **los dos** |
| R11 | `canvas-no-empaquetado.test.ts` + `qc110-alcance.test.ts`: `@napi-rs/canvas` sigue declarado y sigue siendo quien rasteriza en `pdf-converter-unpdf.ts` |
| R12 | `crop-path.test.ts`: forma exacta de la ruta, numeración desde 1 por página, y `isPathInCompany` cierto para la empresa del archivo y falso para otra |
| R13 | `qc110-alcance.test.ts`: `ports/document-storage.ts` conserva **exactamente** sus cuatro operaciones; `ports/crop-storage.ts` declara **una** |
| R14 | `crop-storage-config.test.ts`: falta la variable ⇒ error que la nombra sin filtrar valor; importar el adaptador sin invocarlo no falla |
| R15 | `qc110-alcance.test.ts`: el diff no trae ninguna migración nueva y `db/schema.prisma` no cambia |
| R16 | `crop-catalog-images.test.ts`: `{"images": []}` ⇒ `ok`, cero subidas; `run-document-job.test.ts` ⇒ fila en «listo» |
| R17 | `crop-catalog-images.test.ts`: el segundo recorte lanza ⇒ el primero y el tercero se suben, resultado `ok` con `skipped: 1` |
| R18 | `crop-prompt.test.ts`: el texto no está vacío ni en blanco, y su cabecera declara que es provisional |
| R19 | `qc110-alcance.test.ts`: ningún archivo nuevo nombra `requirePermission`, `cookies`, `getSessionUser`, `getSessionContext` ni `runInRequestScope` |
| R20 | `qc110-alcance.test.ts`: el diff no toca `db/` |
| R21 | `guard-arquitectura-modulos.test.ts` (ya existe) + `module-contract.test.ts` |
| R22 | `qc110-alcance.test.ts`: ningún test nuevo llama a `fetch(` ni importa `sharp` fuera del test del adaptador |
| R23 | `qc110-alcance.test.ts`: el diff no trae ningún `.spec.ts` bajo `e2e/` |

El mapa completo `R<n> -> test` lo escribe el implementer en `progress/impl_QC-110-recorte-de-imagenes-del-pdf.md`, como exige `CHECKPOINTS.md > Trazabilidad`.

## 10. Comentarios en el código

`docs/conventions.md > Comentarios` rige sin excepción: **ningún comentario de producción cita
`QC-nn`, `R<n>`, `design.md` ni «decisión cerrada»**. El porqué de un paso se escribe como porqué
—«las coordenadas llegan en proporción porque la resolución de rasterizado puede cambiar»—, y la
historia se queda aquí. En los **tests**, `R<n>` **sí** va en el nombre del caso: es el enlace de
trazabilidad. Al tocar `run-document-job.ts` se limpian los comentarios de las líneas que toca la
rama, incluida la frase «Sin recorte de imagenes…» de su cabecera, que deja de ser cierta.

## 11. Alternativa descartada (principal): recortar con `@napi-rs/canvas`

**Qué era.** No instalar nada: `@napi-rs/canvas` ya está aprobada, instalada y es quien rasteriza las
páginas. Recortar con ella es posible: se crea un lienzo del tamaño de la región, se dibuja el PNG
desplazado con `drawImage(img, -x, -y)` y se vuelve a codificar con `toBuffer('image/png')`.

**Por qué se descarta.**

1. **Obliga a decodificar, redibujar y recodificar** cada región a mano: cada recorte pasa por
   decodificar el PNG completo de la página, pintar en un lienzo nuevo y volver a comprimir. `sharp`
   lo resuelve con una operación (`extract`) sobre una tubería pensada para eso. Escribir a mano lo
   que una librería mantenida ya hace es justo el anti-patrón que `docs/architecture.md >
   Dependencias de terceros` rechaza.
2. **Mezcla dos papeles en un puerto.** El lienzo entró al repo como **rasterizador de páginas**, par
   opcional de `unpdf`, y así está escrito en su fila del registro. Meterle el recorte lo convierte en
   «la librería de imagen» y borra la frontera que `[D4]` fija: una rasteriza páginas, la otra recorta
   regiones.
3. **El coste que evitaría ya no existe.** El argumento de peso a favor del lienzo era «no añadir una
   dependencia»; `[D2]` lo cerró midiendo que `sharp` **ya viaja** en el despliegue como
   `optionalDependency` de Next, así que declararla no añade peso.

**Lo que se pierde al descartarla, dicho:** una segunda dependencia nativa que declarar en
`serverExternalPackages` y un segundo binario cuya carga en Vercel es un desconocido (§0.3).

## 12. Alternativas descartadas (secundarias)

### 12.1 Ampliar `DocumentStorage` con un `upload`

Habría ahorrado un puerto, un adaptador y un lector de configuración. Se descarta porque
`DocumentStorage` está **atado a un bucket** —el privado de los PDF, resuelto en
`document-storage-config-env.ts`— y porque solo sabe **firmar** subidas para el navegador: subir
bytes desde el servidor a **otro** bucket no es «una operación más» del mismo puerto, es otro puerto.
Además `[D11]` lo cerró. Dos buckets, dos adaptadores, que es lo que ya pasó con el de recetas y el
de PDFs.

### 12.2 Enhebrar las páginas ya rasterizadas desde la lectura con IA

Evitaría el segundo render (§0.2). Se descarta **en esta ficha** porque obliga a cambiar
`AiReadResult` y `StrategyRunResult` —contratos que publicaron QC-108 y QC-109— para arrastrar hasta
50 PNG por un camino que hoy solo lleva texto, y a que `process-pdf-by-strategy.ts`, que
deliberadamente «devuelve el texto tal cual», pase a devolver imágenes. El coste del render se paga y
se declara; si el humano prefiere lo contrario, es un cambio acotado a §4 y a esos dos tipos.

### 12.3 El prompt de coordenadas por variable de entorno

Sería lo consistente con `strategy-prompt-env.ts`, donde el texto de cada estrategia vive en el
entorno y **no hay valor por defecto**. Se descarta porque `[D14]` pide un prompt **provisional pero
funcional**, y una variable vacía en `.env.example` es exactamente la versión «con contenido vacío»
que ya resultó **incapaz de ejecutarse** —la lectura rechaza un prompt en blanco sin llamar al
proveedor—. El texto nace aquí como constante del dominio, declarado provisional en su cabecera;
moverlo al entorno cuando alguien lo afine es reescribir un archivo y es trabajo de **QC-131**.

### 12.4 Registrar los recortes en una tabla

Daría un inventario consultable sin listar el bucket. Se descarta por `[D10]`: sin consumidor, sería
una tabla, una migración, su `down.sql`, su RLS forzada y su columna de empresa para algo que hoy
**nadie lee**, y el mismo criterio con el que QC-123 guardó solo el total y no qué lotes usó.
