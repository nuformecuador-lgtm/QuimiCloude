# QC-106 — endpoint-de-carga-de-pdf · design.md

> Decisiones técnicas para los requisitos de `requirements.md`. El **alcance y la tabla de
> decisiones cerradas** los fijó el humano el 2026-09-16 y aquí **no se reabren**: lo que sigue es
> **cómo** se cumplen, no **si** se cumplen.
>
> Dos avisos que atraviesan todo el documento:
> - **Nada se instala aquí.** La propuesta de dependencia de §8 la aprueba el humano en F1.4; este
>   documento no toca `package.json` ni `pnpm-lock.yaml` (R24).
> - **Una cosa queda declarada DESCONOCIDA**, no resuelta: si `@napi-rs/canvas` corre en el runtime
>   de Vercel (§9). No se rellena con supuestos (regla 6 de `CLAUDE.md`).

## 0. Lo que se midió en disco, y los archivos exactos que se van a tocar

Medido el 2026-09-16 dentro del worktree `QC-106-endpoint-de-carga-de-pdf`.

### 0.1. Lo que NO existe hoy

| Qué | Estado medido | Consecuencia para esta ficha |
|---|---|---|
| Módulo `documentos` | **No existe.** Hay nueve módulos: `asignaciones`, `errores`, `identity`, `inventario`, `observabilidad`, `pedidos`, `proveedores`, `recetas`, `unidades` | Lo crea esta ficha (D13, R27) |
| `app/api/` y Route Handlers | **No existe ni un `route.ts`** en todo el árbol | Esta ficha **no lo estrena** (R29). Quien lo estrena es QC-111 con el webhook de QStash |
| Tabla o modelo de documentos | Nada en `db/schema.prisma` | Cero migraciones, cero `down.sql` (R14) |
| Códigos de error nuevos | `lib/modules/errores/domain/error-codes.ts` lleva 5 enmiendas y exige aprobación humana para la sexta | Se reutilizan `unauthorized` e `invalid_input` (R33) |
| Permisos nuevos | `lib/modules/identity/domain/permissions.ts`: catálogo cerrado de **15** | No se amplía (R4) |
| Variables `SUPABASE_STORAGE_*` en el `.env` local | **Ausentes** (pregunta abierta 2) | La suite no las necesita (R31) |

### 0.2. Lo que sí existe y se copia

- **El único precedente de subida** es `lib/modules/recetas/adapters/driven/storage/recipe-image-supabase.ts`
  —hoy el **único** archivo del repo que importa `@supabase/storage-js`—, con su puerto en
  `lib/modules/recetas/ports/recipe-image-storage.ts` y su configuración perezosa en
  `lib/modules/recetas/adapters/driven/config/storage-config-env.ts`. De ahí se copia **el patrón, no
  el código**: el puerto de recetas está cableado a `recetas/<uuid>` y a `jpg|png|webp`, así que no
  sirve (D13).
- **La configuración se lee EN CADA LLAMADA**, dentro de una función, nunca en el top-level
  (`storage-config-env.ts:37` y el docblock de `recipe-image-supabase.ts:9-21`). Es lo que permite
  que `lib/composition/index.ts:667-671` construya la fachada **sin leer ninguna variable y sin
  tocar la red**. Este módulo hace exactamente lo mismo (R32).
- **`@supabase/storage-js@2.115.0` ya está instalada y aprobada** (`package.json:28`,
  `docs/dependencias.md:32`), y expone `createSignedUploadUrl`, `uploadToSignedUrl` y
  `createSignedUrl`; los buckets aceptan `fileSizeLimit` y `allowedMimeTypes`. **No es dependencia
  nueva** (R26).
- **`next.config.ts` está vacío** (7 líneas), así que el límite por defecto de 1 MB de Server
  Actions sigue vigente: es el dato que sostiene D2 y por el que los bytes no pueden pasar por la
  aplicación.
- **La autorización por permiso** es `assertPermission` de `@/lib/modules/identity`, y cada módulo
  pone su `requirePermission` y su `UnauthorizedError` (patrón de
  `lib/modules/asignaciones/domain/actor.ts`, que además es el que lleva `companyId` en el `Actor`).
- **La guardia de arquitectura** (`tests/guards/guard-arquitectura-modulos.test.ts:202-207`) solo
  exige que existan `identity` e `inventario`: un módulo nuevo es legal. Lo que sí impone
  (`:180-200`) es `index.ts` en la raíz y **solo** las carpetas `domain/`, `ports/`, `adapters/`.
- **`tests/guards/guard-rol-administrador-unico.test.ts`** barre `lib`, `app`, `components`, `hooks`
  y exige que `roles.ts` sea el **único** archivo de producción que escriba el literal
  `'Administrador'`. Esto condiciona §4.

### 0.3. Archivos que esta ficha toca

**Nuevos** (todos bajo el módulo, salvo los dos últimos):

```
lib/modules/documentos/index.ts
lib/modules/documentos/domain/actor.ts
lib/modules/documentos/domain/errors.ts
lib/modules/documentos/domain/limits.ts
lib/modules/documentos/domain/pdf-content.ts
lib/modules/documentos/domain/upload-input.ts
lib/modules/documentos/domain/document-path.ts
lib/modules/documentos/domain/issue-upload-links.ts
lib/modules/documentos/domain/convert-pdf.ts
lib/modules/documentos/ports/document-storage.ts
lib/modules/documentos/ports/pdf-converter.ts
lib/modules/documentos/adapters/driven/config/document-storage-config-env.ts
lib/modules/documentos/adapters/driven/storage/document-storage-supabase.ts
lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts
lib/modules/documentos/adapters/driving/document-upload-actions.ts
tests/unit/documentos/**            (los que enumera tasks.md)
```

**Modificados**: `lib/composition/index.ts` (bloque nuevo al final, sin reordenar nada),
`.env.example` (bloque nuevo al final), `package.json` **solo si el humano aprueba §8**.

**Intactos a propósito**: `db/schema.prisma`, `db/migrations/**`, `app/**`, `components/**`,
`e2e/**`, `lib/modules/errores/**`, `lib/modules/identity/domain/permissions.ts`,
`lib/modules/recetas/**`.

## 1. El flujo, de punta a punta

```
navegador (QC-107)            Server Action (documentos)         Supabase Storage
      |                                  |                              |
      |  1. "voy a subir estos N PDFs" ->|                              |
      |                                  | 2. permiso del actor         |
      |                                  | 3. zod + tope de 10          |
      |                                  | 4. ruta <empresa>/<uuid>.pdf |
      |                                  | 5. createSignedUploadUrl --->|
      |<- 6. [{ path, uploadUrl, token, expiresAt }] x N                |
      |                                                                 |
      |  7. PUT de los bytes (uploadToSignedUrl), directo -------------->|
      |                                     el BUCKET impone 20 MB y application/pdf
```

Lo que **no** pasa aquí: encolar (QC-111), convertir de verdad (QC-111 llama a la capacidad de §7),
borrar el PDF temporal (QC-111), pintar nada (QC-107).

## 2. Árbol del módulo y por qué cada pieza

- `domain/actor.ts` — `Actor = { id, companyId, permissions }` y `requirePermission`, copiado de
  `asignaciones` (es el único que ya lleva la empresa dentro del actor). La empresa va **dentro**
  del actor y no como parámetro suelto: así R12 es inexpresable de otro modo (§5).
- `domain/errors.ts` — `DocumentosError` abstracta + `UnauthorizedError` (`unauthorized`) y
  `ValidationError` (`invalid_input`). **Dos clases, cero códigos nuevos** (R33).
- `domain/limits.ts` — las tres constantes únicas de R20: `MAX_FILES_PER_BATCH = 10`,
  `MAX_PDF_PAGES = 50`, `PAGE_RENDER_DPI = 150`, `UPLOAD_LINK_TTL_SECONDS = 15 * 60`, y
  `MAX_PDF_BYTES = 20 * 1024 * 1024` **declarado como el valor que hay que configurar en el bucket**
  (ver §6.3: el código no lo hace cumplir, R18).
- `domain/pdf-content.ts` — `isPdfContent(bytes)`: la firma `%PDF-` en los primeros bytes (R17).
  Vive en el dominio y es pura, así que se prueba sin nada.
- `domain/document-path.ts` — `buildDocumentPath(companyId)` y `isPathInCompany(path, companyId)`:
  la **única** definición del prefijo de empresa (§5).
- `domain/issue-upload-links.ts` — el caso de uso de la emisión; `domain/convert-pdf.ts` — el de la
  conversión, con el tope de páginas y el fallo por archivo.
- `ports/` y `adapters/driven/` — §3 y §6.
- `adapters/driving/document-upload-actions.ts` — la Server Action (R29).
- `index.ts` — reexporta **solo** de `./domain`: tipos, errores, esquemas, constantes y las dos
  factories. Nunca `ports/`, nunca `adapters/`, nunca `'use server'`.

## 3. Contratos de entrada y salida

### 3.1. Puerto de almacenamiento

```ts
// lib/modules/documentos/ports/document-storage.ts
export type SignedUpload = {
  readonly path: string;        // ruta DENTRO del bucket, con prefijo de empresa
  readonly uploadUrl: string;   // enlace firmado de subida
  readonly token: string;       // el que consume uploadToSignedUrl en el navegador
  readonly expiresAt: string;   // ISO-8601; emision + UPLOAD_LINK_TTL_SECONDS
};

export interface DocumentStorage {
  createSignedUpload(path: string, expiresInSeconds: number): Promise<SignedUpload>;
  createSignedReadUrl(path: string, expiresInSeconds: number): Promise<string>;
  download(path: string): Promise<Uint8Array>;   // lo consume la conversión (QC-111)
}
```

`createSignedReadUrl` y `download` entran aquí y no en QC-111 porque el bucket es **privado** (D1):
sin ellas, el trabajo de la cola no tendría forma de leer el archivo sin conocer Supabase, que es
justo lo que D14 prohíbe. Ninguna de las tres **borra**: el borrado del PDF temporal es de QC-111 y
el puerto no lo expresa, de modo que esta ficha no puede borrar nada aunque alguien lo intente.

### 3.2. Puerto de conversión

```ts
// lib/modules/documentos/ports/pdf-converter.ts
export type RenderedPage = { readonly pageNumber: number; readonly png: Uint8Array };

export interface PdfConverter {
  countPages(pdf: Uint8Array): Promise<number>;
  extractText(pdf: Uint8Array): Promise<string>;
  renderPages(pdf: Uint8Array, dpi: number): Promise<readonly RenderedPage[]>;
}
```

`countPages` es una operación aparte **a propósito**: R19 exige rechazar por páginas **antes** de
renderizar, y un puerto que solo devolviera páginas ya renderizadas obligaría a hacer los 400
renders para poder rechazarlos.

### 3.3. Entrada y salida del caso de uso

```ts
// entrada, validada con zod en el borde (R16)
issueUploadLinksSchema = z.strictObject({
  files: z.array(z.strictObject({
    fileName: z.string().trim().min(1).max(255),
    contentType: z.literal('application/pdf'),
  })).min(1).max(MAX_FILES_PER_BATCH),
});

// salida
type IssuedUploadBatch = { readonly uploads: readonly SignedUpload[] };
```

`contentType` como literal es **comodidad, no garantía**: quien miente en ese campo lo para el
bucket (R18). El `fileName` **no** se usa para construir la ruta —la ruta es `<empresa>/<uuid>.pdf`—
y por tanto no hay travesía de directorios posible; se acepta solo para que QC-107 pueda mostrar de
qué archivo es cada enlace.

La Server Action devuelve `{ status: 'success', data } | ErrorState`, con el traductor único de
`@/lib/modules/errores` (`createErrorStateTranslator`), igual que los siete adaptadores driving que
ya existen.

## 4. Autorización «solo Administrador» sin ampliar el catálogo (D4 + D16)

El choque es real y hay que escribirlo: D4 pide **«solo el Administrador, validado en el service»**
y a la vez que **el catálogo cerrado de 15 permisos no se amplía**; y el repositorio, desde QC-74,
autoriza **por permiso y nunca por rol** (`tests/guards/guard-autorizacion-por-permiso.test.ts`).

**Lo que se propone:** el caso de uso exige `requirePermission(actor, 'proveedores.modificar')`, un
código **que ya existe** y que en `SEED_ROLE_PERMISSIONS` tiene **únicamente** el Administrador
(`permissions.ts:148-165`; el Operador nace con dos permisos y ese no está). Así:

- se cumple D4 (**en el sembrado vigente solo el Administrador puede subir**) y D16 (no nace ningún
  `documentos.*`, no hay migración ni seed ni guardia que tocar);
- se cumple R4 con un test barato y honesto: *el código exigido está en el conjunto del Administrador
  y no en el del Operador*, leído del contrato de `identity`, no escrito a mano;
- se elige `proveedores.modificar` y no otro porque **lo que se sube son catálogos de precios y
  fórmulas de un proveedor** (así lo dice el Alcance y toda la épica QC-105).

**Alternativas descartadas aquí:**

- **(a) Comparar el nombre del rol en el service.** Es lo que la letra de D4 sugiere y es lo que el
  repositorio borró en QC-54/QC-74. `documentos` no está en `BUSINESS_MODULES` de
  `guard-autorizacion-por-permiso.test.ts`, así que *técnicamente pasaría el gate*: por eso hay que
  decir que se descarta por decisión, no por imposibilidad. Reintroduce la deuda que dos fichas
  pagaron y deja el modelo de permisos sin efecto para el módulo nuevo.
- **(b) Añadir `documentos.consultar` / `documentos.modificar`.** Es lo más limpio
  semánticamente y es exactamente lo que **D16 y D4 prohíben**: sería la cuarta enmienda al catálogo
  de QC-74, con migración, seed y guardias. No se hace.

**Lo que el humano decide en F1.4** es solo *cuál* de los permisos existentes se exige. Si prefiere
otro (`recetas.modificar`, `inventario.modificar`), cambia **una constante** en `domain/actor.ts` y
su test; nada más del diseño se mueve.

## 5. Aislamiento por empresa **sin tabla** (D5 + D6)

Sin fila en base no hay `company_id` que filtrar, así que el aislamiento es **la ruta**:

```
<companyId>/<uuid>.pdf        p. ej.  6b1c…-…/8f2a…-….pdf
```

Tres reglas, las tres en `domain/document-path.ts`, que es el único sitio donde se escribe el
formato:

1. **Al firmar la subida**, la ruta la **construye el servidor** con `actor.companyId` y un `uuid`
   nuevo. El cliente **no propone ruta**: no hay ningún camino por el que una ruta de entrada llegue
   a `createSignedUpload`.
2. **Al firmar una lectura o al descargar** (lo que usará QC-111), la ruta sí llega de fuera, y
   entonces `isPathInCompany(path, actor.companyId)` decide: si no empieza por el prefijo exacto de
   la empresa del actor, `UnauthorizedError` **antes** de tocar el puerto (R12). Se compara el
   **segmento completo**, no con `startsWith` pelado: `empresa-A2/...` no puede pasar por `empresa-A`.
3. **La respuesta lleva la ruta, nunca la URL** (R13, heredado de QC-25 D6): cambiar de proyecto o
   de bucket no obliga a reescribir nada, y una URL firmada que se guardara caducaría sola.

**Lo que esto NO da, y se dice:** sin fila, cualquiera con el enlace firmado vivo puede subir o leer
ese archivo durante 15 minutos. Es el mismo riesgo que D3 acota a propósito.

## 6. Storage: bucket, configuración y la enmienda al registro

### 6.1. Un bucket nuevo y privado

Variables nuevas, **declaradas y vacías** en `.env.example` con su documentación (R32):

```
SUPABASE_DOCUMENTS_BUCKET=     # bucket PRIVADO, solo para los PDFs de la épica QC-105
```

`SUPABASE_STORAGE_URL` y `SUPABASE_STORAGE_KEY` **se reutilizan**: son el proyecto y la credencial,
no el bucket, y duplicarlas sería dos verdades para el mismo dato. El adaptador de `documentos` las
lee con su **propio** lector (`document-storage-config-env.ts`), sin importar el de `recetas`: un
driven de otro módulo está prohibido por la regla de dependencias.

### 6.2. Configuración perezosa, calcada de QC-25

```ts
function bucketApi() {
  const config = readDocumentStorageConfigFromEnv();   // EN CADA LLAMADA
  const client = new StorageClient(config.url, { apikey: config.key, Authorization: `Bearer ${config.key}` });
  return client.from(config.bucket);
}
```

Nunca en el top-level. Es lo que hace cierto R31 y lo que permite que `lib/composition` cablee el
puerto sin leer una sola variable.

### 6.3. Los límites los impone el bucket, y eso está fuera del repositorio

`fileSizeLimit: 20MB` y `allowedMimeTypes: ['application/pdf']` son **opciones del bucket**, no de
nuestro código (D11, R18). Como no hay ni un script ni una migración que cree buckets en este
repositorio —el de recetas se creó a mano en la consola (pregunta abierta 1)—, **el gate no puede
comprobar que estén puestos**. Lo que sí se hace: `domain/limits.ts` publica el valor y su docblock
dice que ese número tiene que coincidir con el del bucket. Es trabajo de entorno, y queda anotado
como límite (§12).

### 6.4. Enmienda a `docs/dependencias.md:32` — para que el leader la escriba en F1.4

La fila de `@supabase/storage-js` termina hoy diciendo: *«Lo consume **un solo archivo**:
`lib/modules/recetas/adapters/driven/storage/recipe-image-supabase.ts`, detrás de un puerto»*. Con
esta ficha **son dos**. La fila debe pasar a decir, sin borrar lo anterior:

> Lo consumen **dos archivos**, los dos detrás de un puerto:
> `lib/modules/recetas/adapters/driven/storage/recipe-image-supabase.ts` (QC-25, bucket **público**
> de imágenes de receta) y
> `lib/modules/documentos/adapters/driven/storage/document-storage-supabase.ts` (QC-106, bucket
> **privado** de PDFs, con enlaces firmados). Verificado el 2026-09-16 sobre la versión instalada
> `2.115.0`: expone `createSignedUploadUrl`, `uploadToSignedUrl` y `createSignedUrl`.

No es una dependencia nueva y **no hay cuatro checks que rehacer**: es el acta puesta al día.

## 7. La conversión (D7, D9, D10, D12)

`domain/convert-pdf.ts` orquesta, el adaptador ejecuta:

1. `isPdfContent(bytes)` → si no, `ValidationError` (R17). **Por contenido, nunca por extensión.**
2. `countPages(bytes)` → si `> MAX_PDF_PAGES`, `ValidationError` sin renderizar nada (R19).
3. Según lo que pida quien llama: `extractText` o `renderPages(bytes, PAGE_RENDER_DPI)`.
4. El resultado por archivo se devuelve como un **discriminado**
   `{ ok: true, … } | { ok: false, reason }`, no como una excepción que suba: es lo que hace posible
   que QC-111 procese diez archivos y que el noveno roto no tumbe los otros nueve (R23). El error se
   **registra con contexto** —qué operación y sobre qué ruta— y nunca se traga
   (`docs/conventions.md > Manejo de errores`).

El adaptador `pdf-converter-unpdf.ts` es el **único** archivo que importa `unpdf`; el dominio no la
ve (R28). `renderPageAsImage` de `unpdf` es quien necesita el par nativo; `extractText` no (R25).

## 8. Propuesta de dependencia — **no instalada**, se aprueba en F1.4

Regla 7 de `CLAUDE.md` y `docs/architecture.md > Dependencias de terceros`. Los cuatro checks son
**los de la semilla**, verificados por el humano contra npm el 2026-09-16; este documento **no tiene
red** y no los rehace: los transcribe.

| Paquete | Qué código nos ahorra | Check 1 (no deprecated) | Check 2 (release < 12 meses) | Check 3 (≥ 10k desc./sem.) | Check 4 (licencia) |
|---|---|---|---|---|---|
| `unpdf` | **Las dos** conversiones con una sola librería: `extractText` y `renderPageAsImage`. Escribirlo a mano es un parser de PDF | OK | OK — **1.8.1 del 2026-08-13** | OK — **2.568.072** | OK — **MIT** |
| `@napi-rs/canvas` | El lienzo nativo sobre el que `unpdf` rasteriza la página. Par **OPCIONAL**: sin él, la conversión a texto sigue en pie | OK | OK — **1.0.9 del 2026-09-09** | OK — **17.616.629** | OK — **MIT** |

`unpdf` declara además **cero dependencias propias**, lo que hace que el árbol crezca en exactamente
estas dos entradas.

**Descartada a sabiendas: `mupdf`.** Técnicamente es la mejor —render y texto de una pieza—, y
**falla el check 4**: `AGPL-3.0-or-later`. No se propone ni siquiera como excepción: la licencia
contagia, y esto es un ERP privativo.
**También descartadas:** `pdf-lib` (última publicación 2022-05-12, falla el check 2) y `pdf2pic`
(falla el check 2 y además exige binarios de ImageMagick instalados en la máquina).

**Condición de la aprobación**, para que se pueda escribir en la fila del registro: las dos entradas
quedan **aisladas en un solo archivo** (`pdf-converter-unpdf.ts`), detrás del puerto de §3.2, de modo
que cambiarlas sea reescribir ese archivo y no buscarlas por el repositorio. Mismo criterio con el
que entraron `@supabase/storage-js`, `resend` y las nueve de TipTap.

## 9. La pregunta abierta 3: ¿`@napi-rs/canvas` corre en el runtime de Vercel?

**Respuesta: DESCONOCIDO.** No se rellena con un sí (regla 6 de `CLAUDE.md`).

**Lo que sí se puede afirmar, con su evidencia:**

- Es un **binario nativo** (N-API), no JavaScript puro: se distribuye como `.node` precompilado por
  plataforma. Eso lo dice la propia naturaleza del paquete `@napi-rs/*` y es la razón de la pregunta.
- **Ninguna de las dependencias actuales del repositorio es nativa**, así que no hay ningún
  precedente en disco del que deducir el comportamiento (`package.json`, 33 + 26 entradas, revisadas
  una a una).
- El paquete está **en la propuesta, no instalado**: no hay `node_modules` que inspeccionar ni
  despliegue contra el que probar. La verificación contra el registro de npm y contra la
  documentación de Vercel **necesita red**, y este documento se escribió sin ella.
- **La verificación no bloquea la ficha**, y esto sí es diseño y no rodeo: `extractText` **no**
  necesita el par nativo (R25). Si el binario no cargara en el runtime de destino, la conversión a
  texto sigue funcionando y **solo** la de imagen queda sin vía.

**Cómo se cierra, y quién:** la comprobación barata es un despliegue de prueba en Vercel que importe
el adaptador y renderice una página; si falla, las salidas conocidas son (i) ejecutar la conversión
de imagen fuera del runtime serverless —lo que encaja con QC-111, que ya trae cola—, o (ii) otra vía
de rasterizado. **No se elige ninguna aquí**: eso sería inventar. Queda como riesgo declarado de
§12, con destinatario **QC-111**, que es quien primero invoca la conversión de verdad.

## 10. Cómo se prueba sin red y sin bucket (R31)

- **Dos dobles en memoria**, uno por puerto. `DocumentStorage` doble: `createSignedUpload` devuelve
  una ruta y una URL fabricadas y **registra con qué ruta se le llamó** —así el test de R12 puede
  afirmar que el puerto **no se llamó** cuando el prefijo no era el de la empresa—. `PdfConverter`
  doble: devuelve un número de páginas y un texto fijos, o lanza, según el caso.
- **Ningún test construye el adaptador real de Supabase ni el de `unpdf`.** Que la configuración se
  lea en la invocación (§6.2) hace que importar el archivo no falle con las variables vacías; eso es
  exactamente lo que ya sostiene la suite de QC-25 con el bucket sin configurar.
- **Los bytes de prueba se fabrican**: `%PDF-1.7\n…` como caso válido de `isPdfContent`, y un PNG o
  un texto plano como casos que deben rechazarse. Cero archivos binarios nuevos en el repositorio.
- **El caso de uso se prueba entero contra los dobles**: permiso, tope de 10, prefijo de empresa,
  caducidad, forma de la salida. No hace falta red para ninguno.

## 11. Alternativas descartadas (además de las de §4 y §8)

1. **Route Handler en `app/api/upload`** en vez de Server Action. Descartada por
   `docs/architecture.md > Server Actions vs Route Handlers`: esto es una mutación de un componente
   propio, no un webhook ni una API para terceros. Además estrenaría `app/api/`, que es de QC-111.
2. **Subir los bytes a través de la aplicación** (Server Action con `FormData`). Descartada por
   D2 con un dato medido: `next.config.ts` está vacío, el límite por defecto es **1 MB** y la tanda
   son hasta **200 MB**. Subir el límite de Server Actions movería el problema al tiempo de función
   de Vercel.
3. **Colgar esto del módulo `recetas`** reutilizando su `RecipeImageStorage`. Descartada por D13 y
   porque ese puerto está cableado a `recetas/<uuid>` y a extensiones de imagen: adaptarlo rompería
   QC-25 para no escribir un archivo nuevo.
4. **Un bucket único compartido con el de recetas, con carpetas.** Descartada porque
   `fileSizeLimit`/`allowedMimeTypes` son **del bucket**: un solo bucket no puede ser a la vez
   público para imágenes de 5 MB y privado para PDFs de 20 MB (D1, D11).
5. **Devolver también las conversiones en la respuesta de la subida.** Descartada por el propio
   Alcance —cambio humano del 2026-09-14—: hasta 50 PNG en una respuesta.
6. **Guardar una fila con el estado de cada archivo.** Descartada por D5: esa tabla es de QC-111,
   que además tiene declarado abierto dónde vive. Dos fichas decidiendo la misma tabla es peor que
   esperar.

## 12. Límites aceptados, y quién los hereda

- **Los límites del bucket no los verifica el gate** (§6.3, pregunta abierta 1). Trabajo de entorno.
- **Un enlace firmado filtrado sirve durante 15 minutos** (§5). Acotado a conciencia por D3.
- **Huérfanos**: un PDF subido cuya tanda nunca se procesa no lo borra nadie. El borrado del PDF
  temporal es de **QC-111**, dicho en el Alcance.
- **`@napi-rs/canvas` en Vercel: desconocido** (§9). Destinatario **QC-111**.
- **Sin E2E** (R34, D17): no hay pantalla que visitar. Deuda con destinatario **QC-107**, no
  exención de `CHECKPOINTS.md`.
- **El módulo nuevo no entra en `guard-autorizacion-por-permiso.test.ts`** (§4). Ampliar su
  `BUSINESS_MODULES` a `documentos` sería lo correcto y **no se hace aquí**: es tocar la guardia de
  otra ficha. Queda propuesto para que el humano decida en F1.4 si entra en esta ficha o en la suya.

## 13. Lo que el humano tiene que mirar al aprobar (F1.4)

1. **La dependencia de §8**: `unpdf` + `@napi-rs/canvas`. Sin ese «sí», T-conversión no se empieza.
2. **El permiso reutilizado de §4**: se propone `proveedores.modificar`. Es la única decisión de
   diseño que la tabla de decisiones no fija y que cambia el significado de «solo el Administrador».
3. **La enmienda a `docs/dependencias.md:32`** de §6.4, que escribe el leader.
4. **El desajuste 17/18**: la tabla de decisiones tiene **18 filas** y el Alcance dice 17. Los
   requisitos cubren las 18; no se ha tocado la tabla.
