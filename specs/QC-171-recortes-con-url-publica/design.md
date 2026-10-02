# QC-171 — recortes-con-url-publica · design.md

> Decisiones técnicas para `requirements.md` (R1–R24). Las decisiones cerradas `[D1]`…`[D9]` no se
> reabren aquí: esto es solo el **cómo**.

## 0. Estado de partida (medido en el código, 2026-09-25)

| Pieza | Hoy | Archivo |
|---|---|---|
| Subida de recortes | `upload(path, png)` contra el bucket de `SUPABASE_CROPS_BUCKET` | `documentos/adapters/driven/storage/crop-storage-supabase.ts` (**no se toca**, frontera `[D8]`) |
| Lectura de recortes | puerto `CropCatalog { list, createSignedReadUrl }` | `documentos/ports/crop-catalog.ts`, `crop-catalog-supabase.ts`, `crop-catalog-memory.ts` |
| Vista previa | `list` + **un `createSignedUrl` por recorte** (1 + N solicitudes) | `documentos/domain/preview-catalog-import.ts:283-287` |
| Vitrina | `ShowcaseLine { id, name, imagePath }`; la tarjeta pinta `imagePath` como `src` | `proveedores/domain/supplier-showcase.ts`, `app/(private)/proveedores/components/showcase-line-card.tsx` |
| Tabla del catálogo | `CatalogLineView.imagePath`; la columna pinta `imagePath` como `src` | `app/(private)/proveedores/[id]/components/catalog-columns.tsx:177` |
| Patrón a reutilizar | `publicUrl(path): string` con `getPublicUrl`, puerto en el dominio, cableado en la composición | `recetas/ports/recipe-image-storage.ts`, `recetas/adapters/driven/storage/recipe-image-supabase.ts:59-63`, `recetas/domain/list-recipes.ts:50` |
| Marcador | `EntityImage` ya cae al marcador con `path` nulo, vacío **o que no carga** (`onError`) | `components/shared/entity-image.tsx` (**no se toca**) |

Consecuencia: la vitrina y la tabla hoy ponen una **ruta** en `src` y por eso nunca se ve la imagen;
la revisión sí la ve, pero pagando un enlace firmado por recorte.

## 1. Almacenamiento: el mismo bucket, ahora público (R1, R17, R18, `[D2]`, `[D4]` enmendada, `[D5]`)

- **No cambia ninguna línea de código de configuración ni de subida, ni ningún valor de entorno.**
  `SUPABASE_CROPS_BUCKET` sigue siendo la única variable del bucket de recortes
  (`crop-storage-config-env.ts`), con **el mismo valor** en cada entorno, y la comparten la subida y la
  lectura, como hoy. Es el bucket propio de QC-110 (`[D17]`), que sigue separado del de recetas.
- **Operación manual (T8)**: el humano cambia ese bucket a **público** en Supabase, en cada entorno. El
  repo no crea ni configura buckets (no hay SQL de `storage.buckets` en `db/`), así que no es una
  migración. Sus límites de tamaño y tipo no cambian.
- `.env.example` actualiza **solo el comentario** de `SUPABASE_CROPS_BUCKET` para decir que el bucket es
  **público**, propio y distinto del de recetas y del privado de PDF (R1). La variable sigue vacía.
- **Recortes ya subidos (`[D4]`)**: siguen en el mismo bucket y con la misma ruta en
  `supplier_catalog_lines.image_path`. Al leer, su URL se compone igual que la de uno nuevo y, con el
  bucket ya público, se ven sin moverlos ni re-importar (R17). Una importación **sin confirmar** de un PDF
  procesado antes del cambio lista sus recortes como siempre y los pinta con URL pública.
- **Imagen que no carga** (objeto inexistente, o bucket aún privado en un entorno sin T8): `EntityImage`
  cae al marcador por `onError` (R24). Sin código nuevo.
- **Nada se mueve ni se reescribe** (R18): ni objetos ni rutas guardadas; el código conoce un solo
  bucket de recortes.

## 2. Puerto `CropCatalog` de `documentos` (R4, R5, R6, R7, R9, R10, R21, R22)

```ts
// lib/modules/documentos/ports/crop-catalog.ts
export interface CropCatalog {
  list(companyId: string, documentFileId: string): Promise<readonly string[]>;
  /** URL pública de lectura de esa ruta. Síncrona: no toca la red. */
  publicUrl(path: string): string;
}
```

- `createSignedReadUrl` **desaparece** del puerto (no queda ningún consumidor: el único era la vista
  previa). `DocumentStorage.createSignedReadUrl` de los PDF **no se toca** (R20).
- **Adaptador real** (`crop-catalog-supabase.ts`): `createCropSignedReadUrl` se sustituye por
  `cropPublicUrl(path): string`, que llama a `bucketApi().getPublicUrl(path)` y devuelve
  `data.publicUrl`; mismo cuerpo que `recipeImagePublicUrl`. Vive **en el mismo archivo**, que ya importa
  `@supabase/storage-js`: así el censo de importadores de la librería (`storage-config.test.ts`, R26 de
  QC-106) sigue en **cuatro** (R21). `bucketApi()` lee la configuración en cada llamada, y si falta una
  variable, `readCropStorageConfigFromEnv` ya lanza nombrándolas sin valores (R7).
- **Doble del E2E** (`crop-catalog-memory.ts`): `publicUrl(path)` devuelve
  `` `${E2E_STORAGE_ORIGIN}/crops/${path}` ``, **el mismo formato** que devuelve hoy
  `createSignedReadUrl`. Es lo que intercepta `e2e/catalogo-desde-pdf.spec.ts:306`, así que el E2E pasa sin
  tocarse (R22).
- **Composición** (`lib/composition/index.ts`, bloque de `cropCatalog`): `publicUrl` bifurca con
  `documentsE2EDoublesEnabled()` en cada llamada, igual que `list`.

## 3. Vista previa de la importación (R9–R12, `[D8]`)

Cambian **solo** las líneas 283-287 de `preview-catalog-import.ts`:

```ts
const cropPaths = await deps.crops.list(actor.companyId, documentFileId);
const crops = cropPaths.map((path) => ({ path, url: deps.crops.publicUrl(path) }));
```

- Desaparece el `Promise.all` y con él las N solicitudes de firma (R10). La importación de
  `READ_LINK_TTL_SECONDS` sale de este archivo si queda sin uso (la sigue usando `read-document.ts`).
- `pairCropsWithLines`, `resolveRequestedImagePath`, el orden y el resto de la función **no cambian**
  (R12). No se tocan `crop-pairing.ts`, `crop-catalog-images.ts`, `crop-storage*.ts`, `crop-coordinates.ts`
  ni `crop-region.ts` (R23).
- **Pantalla de la revisión: sin cambios.** `CatalogImportPreviewCrop { path, url }` y
  `CatalogImportPreviewRow { imagePath, imageUrl }` conservan su forma; `catalog-import-row.tsx` ya pinta
  `row.imageUrl` y `crop-picker.tsx` ya pinta `crop.url`, y al elegir recorte `catalog-import-review.tsx`
  copia el `url` que llegó del servidor (R11). Solo cambia el **valor** de esa URL.
- El permiso de la vista previa (`requirePermission(actor, CATALOG_IMPORT_PERMISSION)`) sigue siendo la
  primera línea: sin él, no se llega a `list` ni a `publicUrl` (R19).

## 4. `proveedores`: puerto nuevo y URL en las lecturas (R2, R3, R5, R13–R16, R19)

### 4.1 Puerto

```ts
// lib/modules/proveedores/ports/catalog-image-url.ts   (NUEVO)
export interface CatalogImageUrl {
  publicUrl(path: string): string;
}
```

Solo compone; no sube, no borra, no lista y **no recibe la empresa** (R5). `proveedores` no sabe de qué
bucket sale la URL: se lo da la composición.

### 4.2 Casos de uso

| Caso de uso | Deps nuevas | Salida |
|---|---|---|
| `createListCatalogLines` | `images: CatalogImageUrl` | `Page<CatalogLineListItem>`, con `CatalogLineListItem = CatalogLineView & { readonly imageUrl: string \| null }` |
| `createListSupplierShowcase` | `images: CatalogImageUrl` | `ShowcasePage` cuyas líneas son `ShowcaseLine { id, name, imageUrl }` |
| `createListShowcaseLines` | `images: CatalogImageUrl` | `ShowcaseLinesPage` con `ShowcaseLine { id, name, imageUrl }` |

- Una función pura del dominio, `toImageUrl(path, images)`: `null` o `''` → `null` **sin llamar** a
  `publicUrl` (R16); si no, `images.publicUrl(path)`. Es la misma regla de `list-recipes.ts:50`.
- Se llama **después** de `requirePermission` y de la lectura del repositorio: un actor sin permiso lanza
  antes de que se componga nada (R19).
- **Tabla del catálogo**: `CatalogLineView` **no cambia** —sigue siendo lo que devuelve el repositorio y
  lo que usan el formulario y el diálogo de baja—. El listado devuelve `CatalogLineListItem`, que añade
  `imageUrl` y **conserva `imagePath`**: el formulario de edición la reenvía en su campo oculto
  (`catalog-line-form.tsx:485-490`), así que la edición guarda la misma ruta (R3).
- **Vitrina**: `ShowcaseLine` pierde `imagePath` y gana `imageUrl`; la vitrina no necesita la ruta. El
  repositorio sigue devolviendo la ruta, así que el tipo que cruza el puerto pasa a ser uno propio del
  registro (`ShowcaseLineRecord { id, name, imagePath }` y su página), y el dominio lo mapea. En
  `supplier-prisma.ts` cambia **solo el nombre del tipo** de retorno de `listShowcaseAliveSuppliers`: la
  consulta no cambia, así que `showcase-prisma.test.ts` y `supplier-showcase.int.test.ts` siguen
  valiendo.
- `index.ts` exporta `CatalogLineListItem` y los tipos de registro que la composición necesite nombrar.

### 4.3 Composición

```ts
const catalogImageUrl: CatalogImageUrl = {
  publicUrl: (path) =>
    documentsE2EDoublesEnabled() ? cropCatalogMemory.publicUrl(path) : cropPublicUrl(path),
};
```

- **Tiene que declararse ANTES de `export const proveedores`** (línea ~932): los casos de uso capturan sus
  deps al construirse, y un `const` declarado más abajo (junto a `cropCatalog`, línea ~1449) daría
  `ReferenceError` al importar la composición.
- Es la composición la que decide que la imagen de una línea de catálogo vive en el bucket de recortes:
  es el único sitio que puede importar un adaptador driven de otro módulo
  (`docs/architecture.md > Punto único de composición`).

### 4.4 Pantallas

| Archivo | Cambio |
|---|---|
| `app/(private)/proveedores/components/showcase-line-card.tsx` | `path={line.imageUrl}` |
| `app/(private)/proveedores/[id]/components/catalog-columns.tsx` | `path={line.imageUrl}`; tipo de fila `CatalogLineListItem` |
| `app/(private)/proveedores/[id]/components/catalog-table.tsx` | tipo de `lines`: `CatalogLineListItem` |

`EntityImage` **no se toca**: su prop se sigue llamando `path` y ya recibe URLs en recetas y en la
revisión. Renombrarla tocaría inventario y recetas, que están fuera (R20). La prop de `EntityImage` se
alimenta del servidor; ningún componente cliente compone nada (R8).

## 5. Contratos de entrada/salida

| Lectura | Entrada | Salida (imagen) |
|---|---|---|
| `documentos.previewCatalogImport` | sin cambios | `crops[].url` y `rows[].imageUrl` = URL **pública**; `rows[].imagePath` = ruta, igual que antes |
| `proveedores.listCatalogLines` | sin cambios | `items[].imagePath` (ruta) + `items[].imageUrl` (URL pública o `null`) |
| `proveedores.listSupplierShowcase` | sin cambios | `items[].lines[].imageUrl` (URL pública o `null`) |
| `proveedores.listShowcaseLines` | sin cambios | `items[].imageUrl` (URL pública o `null`) |

Forma de la URL real: la que devuelve `getPublicUrl` —`<SUPABASE_STORAGE_URL>/storage/v1/object/public/<bucket>/<ruta>`—,
sin `token` ni caducidad (R6). No se escribe a mano (ver alternativa A3).

## 6. Datos, RLS, migraciones

**Ninguna.** No hay tabla, columna ni migración nueva: se sigue guardando la ruta en
`supplier_catalog_lines.image_path` (R2), y ninguna ruta existente se reescribe (R18). Sin RLS nueva. El
único cambio fuera del código es operativo: pasar el bucket actual a público (T8).

## 7. Tests existentes que cambian, y por qué

Candados de regresión que **se ponen rojos a propósito** porque esta ficha cambia lo que protegen; se
actualizan en la misma task que el código, diciendo en el caso qué cambió:

| Test | Qué afirma hoy | Qué pasa a afirmar |
|---|---|---|
| `tests/unit/documentos/ports-shape.test.ts` | `CropCatalog` = `['list', 'createSignedReadUrl']` | `['list', 'publicUrl']` |
| `tests/unit/documentos/crop-catalog-supabase.test.ts` | `createSignedReadUrl` firma con TTL y envuelve el error | `publicUrl` usa `getPublicUrl`, no firma, no llama a la red; falta de variable → error sin valores |
| `tests/unit/proveedores/catalog-line-image-scope.test.ts` | censo de `ports/` = 4; la columna pinta `line.imagePath` | censo = 5 (`catalog-image-url.ts`, que **compone y nada más**); la columna pinta `line.imageUrl`; se mantiene: ninguna línea junta imagen y empresa, cero URL firmada |
| `tests/unit/proveedores/module-contract.test.ts` | lista exacta de `ports/` | añade `ports/catalog-image-url.ts` |

Se rompen **por tipo** (dobles o fixtures que no tienen el campo nuevo), sin cambio de lo que afirman:
`preview-catalog-import.test.ts`, `confirm-catalog-import.test.ts`,
`catalog-import-authorization.test.ts`, `tests/integration/documentos/catalog-import-isolation.int.test.ts`
(dobles de `CropCatalog` con `createSignedReadUrl`); `showcase-service.test.ts`, `list-use-cases.test.ts`,
`company-scope.test.ts`, `company-isolation-service.test.ts`, `catalog-service.test.ts`,
`authorization.test.ts` de `tests/unit/proveedores/` (deps sin `images`); `showcase-line-card.test.tsx`,
`supplier-showcase-row.test.tsx`, `supplier-showcase-page.test.tsx`, `supplier-detail-page.test.tsx`,
`catalog-columns.test.tsx` de `tests/unit/proveedores-ui/` (fixtures con `imagePath` donde ahora va
`imageUrl`).

**No deben cambiar** (y su verde es la prueba de R12, R20, R21, R23): `crop-pairing.test.ts`,
`crop-catalog-images.test.ts`, `crop-coordinates.test.ts`, `crop-storage-config.test.ts` (salvo el caso
nuevo de R1 sobre `.env.example`), `read-document.test.ts`, `recipe-image-scope.test.ts`,
`storage-config.test.ts` (censo de importadores = 4), `guard-dependencias-aprobadas.test.ts` y
`e2e/catalogo-desde-pdf.spec.ts`.

## 8. Alternativas descartadas

- **A1. Bucket nuevo y público, re-apuntando `SUPABASE_CROPS_BUCKET`, con los recortes viejos
  perdidos.** Era la propuesta de la primera versión de este spec. La descartó el humano en F1.4
  (`[D4]` enmendada): reutilizar el bucket actual conserva los recortes ya subidos, no exige crear ni
  configurar nada nuevo en cada entorno y deja la variable como está.
- **A2. Variable nueva (`SUPABASE_CROPS_PUBLIC_BUCKET`) para un bucket público aparte.** Obliga a tocar
  la subida —que es de QC-176 (`[D8]`)— o deja dos variables para un mismo concepto, una sin consumidor,
  y además perdería los recortes ya subidos, contra `[D4]`. Descartada.
- **A3. Componer la URL a mano** (`` `${url}/storage/v1/object/public/${bucket}/${path}` ``). Reimplementa
  lo que hace `getPublicUrl` de una librería ya aprobada, y ataría el repo al formato interno de
  Supabase. Contra `docs/architecture.md > Dependencias de terceros` y `[D7]`. Descartada.
- **A4. Componer la URL en la Server Action o en la página.** Serían tres sitios (vitrina, cargar más,
  tabla) con la misma regla, lógica fuera del dominio y sin el test de «sin permiso no se compone nada».
  Recetas lo hace en el caso de uso; se sigue ese patrón. Descartada.
- **A5. Un adaptador driven propio en `proveedores` que lea `SUPABASE_CROPS_BUCKET`.** Dos lectores de la
  misma variable (dos verdades) y un **quinto** importador de `@supabase/storage-js`, que rompe el censo
  de QC-106. La composición ya puede cablear el adaptador de `documentos` al puerto de `proveedores`.
  Descartada.
- **A6. Guardar la URL en vez de la ruta.** Cerrado por `[D3]`; además cambiar de bucket o de proyecto
  exigiría reescribir filas.

## 9. Multiplataforma, dependencias y riesgos

- **UI**: no hay componente nuevo ni cambio de marcado; `<img>` con `loading="lazy"` como hoy. Sin
  excepción de escritorio.
- **Dependencias**: ninguna nueva (`[D7]`). `@supabase/storage-js` ya está aprobada y en uso.
- **Riesgo de conflicto**: `lib/composition/index.ts` es archivo caliente (lo toca cualquier ficha de
  módulo) y además tiene cambios sin commitear en el árbol principal. T4 toca dos bloques acotados
  (`cropCatalog` y la declaración previa a `proveedores`).
- **Riesgo operativo**: si se despliega sin T8, el bucket sigue privado y la URL pública no resuelve:
  toda imagen sale en marcador (R24), **incluida la revisión**, que hoy sí se ve con enlace firmado. No
  rompe ninguna pantalla, pero conviene hacer T8 **antes** de desplegar el código en cada entorno, y la
  ficha no se da por cumplida en un entorno sin T8.
