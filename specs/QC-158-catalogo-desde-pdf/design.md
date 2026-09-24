# QC-158 — catalogo-desde-pdf · design.md

> Decisiones técnicas para `requirements.md` (R1–R38). Aprobado en F1.4 el 2026-09-23: las siete
> preguntas abiertas quedaron cerradas con las propuestas de este documento (`> 10`, `[F1]`…`[F7]`).

## 0. Lo medido en el código (rama `feature/QC-158-catalogo-desde-pdf`, base `dev` en `f4b1eb49`)

| Hecho | Dónde | Consecuencia para esta ficha |
|---|---|---|
| El trabajo de la cola guarda el texto de la IA **tal cual** en `document_files.extracted_text` y borra el PDF | `run-document-job.ts:118-119` | Se interpreta **al abrir la revisión**, no en la cola (R7). El PDF ya no existe: todo sale del texto y de los recortes. |
| El recorte hace una **segunda llamada** a la IA, con su propio prompt, que solo devuelve regiones `{page,x,y,width,height}` | `crop-catalog-images.ts:129-136`, `crop-prompt.ts`, `crop-region.ts:14-27` | La IA del catálogo y la del recorte **no comparten índices**: emparejar imagen y línea no es un dato, es una inferencia (pregunta 3). |
| Ruta del recorte `<empresa>/<documentFileId>/<página>-<n>.png`, `n` desde 1 **por página, en el orden en que la IA devolvió las regiones**; regiones saltadas **consumen** su `n` | `document-path.ts:34-41`, `crop-catalog-images.ts:143-181` | Puede haber huecos (`1-1`, `1-3`). La página es fiable; el orden dentro de la página, solo aproximado. |
| Los recortes **no tienen fila** en la base y el puerto `CropStorage` solo sabe **subir** | `ports/crop-storage.ts`, QC-110 `[D10]` `[D11]` | Para listar y mostrar recortes hace falta un puerto nuevo de lectura (`> 5.3`). |
| `DocumentBatch` no guarda el proveedor | `db/schema.prisma:631-643` | Pregunta 5. |
| El permiso de `documentos` es `proveedores.modificar` | `documentos/domain/actor.ts:42` | R31 lo reutiliza; no nace permiso. |
| Línea de catálogo: identidad = índice único parcial `supplier_catalog_lines_name_presentation_unique (supplier_id, name_normalized, presentation_id) WHERE deleted_at IS NULL`; `cost DECIMAL(14,4)` con CHECK `> 0`; `image_path` texto libre sin CHECK | `20260904123854_split_product_and_supplier_catalog/migration.sql:148-150`, `schema.prisma:469-495`, `catalog-line-input.ts:80-87` | La escritura usa ese índice como árbitro (`> 8`). |
| El puerto del catálogo **prohíbe** buscar por nombre, a propósito, para no hacer comprobaciones previas con carrera | `ports/supplier-catalog-repository.ts:9-13` | No se toca: nace un puerto **aparte** para la importación, que lee para **mostrar** y escribe con `ON CONFLICT` (`> 5.2`). |
| `proveedores` **no puede importar nada de `inventario`** (ni un especificador con esa palabra) | `tests/unit/proveedores/scope.test.ts:124-177` (QC-52 R18) | La orquestación **no** puede vivir en `proveedores` (`> 1`, `> 11.A`). |
| Crear presentación exige `inventario.modificar`, nombre ≤ 60, unidad obligatoria | `create-presentation.ts:45`, `presentation-input.ts:16-35`, QC-80 | Preguntas 1 y 6. |
| Solo hay búsqueda de presentaciones **por id** (`PresentationCatalog.findRefs`) | `inventario/domain/presentation-catalog.ts` | Se amplía esa interfaz con búsqueda por nombre normalizado (`> 5.4`). |
| La edición de línea es reemplazo completo y el formulario manda `imagePath: undefined` | `catalog-line-form.tsx:246-258`, `update-catalog-line.ts:71` | **Hoy editar una línea borra su imagen.** Con imágenes importadas eso es pérdida de datos: R29 lo corrige (`> 6.4`). |
| En modo E2E la IA de guion devuelve **siempre** un texto que no es JSON, y `cropStorage` **no tiene doble** | `ai-reader-canned.ts:15-17`, `lib/composition/index.ts:1311` | Con el recorte de QC-110 enganchado, el E2E de `documentos.spec.ts` debería acabar en `error` (`invalid_input` del recorte), no en `done`. **A confirmar en T0** corriéndolo; si está rojo, esta ficha lo arregla como efecto de `> 9`. |
| Listas cerradas afectadas | `guard-identificador-de-request.test.ts:123,210+` (E2E y migraciones), `guard-dobles-e2e.test.ts:40-42` (dobles), `guard-pantallas-exigen-permiso.test.ts:220-234` (pantallas), `session-once-per-request-actions.test.ts:265-320` (acciones), `data-table-alcance.test.ts:469-524` (si el E2E toca la tabla), `proveedores/scope.test.ts:275-284` (solo si el nombre del spec casa `proveedor|supplier`) | Altas en T-guards (`tasks.md`). |

## 1. Dónde vive cada pieza

```
documentos  ──(barrel)──►  proveedores   (tipos + casos de uso inyectados)
    │         ──(barrel)──►  inventario   (PresentationCatalog + createPresentation inyectado)
    │         ──(barrel)──►  unidades     (UnitCatalog.findRefs, UnitRef)
    └── orquesta: interpretar → clasificar → confirmar
```

- **`documentos`** es el dueño del **contrato con la IA** (la forma del JSON, `> 3`) y de la
  **orquestación** de revisar y confirmar. Razón: es el módulo que ya lee la salida de la IA, y QC-159
  hará lo mismo contra `recetas`; poner la orquestación aquí deja un patrón («documentos interpreta y
  delega la escritura al dueño del dato») en vez de dos.
- **`proveedores`** es el dueño de la escritura de líneas: publica un caso de uso de **importación**
  que comprueba su propio permiso y escribe por identidad. Sigue sin conocer `inventario`.
- **`inventario`** publica la búsqueda de presentaciones por nombre normalizado (servicio, como
  `findRefs`) y su caso de uso de alta **ya existente**, que se inyecta con su permiso dentro.
- El cableado, como siempre, solo en `lib/composition/index.ts`.

## 2. Modelo de datos

### 2.1 Migración `<ts>_supplier_catalog_line_material_and_measurements`

`<ts>` provisional `20260923180000`; **debe quedar por detrás de la última migración de `dev` al
mergear** (QC-141 ocupa `20260923150000-150200` en su rama). Escrita a mano (sin `migrate dev`
contra la base compartida):

```sql
-- migration.sql
ALTER TABLE "supplier_catalog_lines" ADD COLUMN "material" TEXT;
ALTER TABLE "supplier_catalog_lines" ADD COLUMN "measurements" JSONB;
ALTER TABLE "supplier_catalog_lines"
  ADD CONSTRAINT "supplier_catalog_lines_material_check"
  CHECK ("material" IS NULL OR btrim("material") <> '');
ALTER TABLE "supplier_catalog_lines"
  ADD CONSTRAINT "supplier_catalog_lines_measurements_check"
  CHECK ("measurements" IS NULL OR jsonb_typeof("measurements") = 'object');

-- down.sql
ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_measurements_check";
ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_material_check";
ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "measurements";
ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "material";
```

- Sin tabla nueva: `guard-empresa-en-esquema` no cambia; la tabla ya tiene RLS + `FORCE` y añadir
  columnas no lo altera. Sin índices: ninguna consulta filtra por estos campos.
- `schema.prisma`: `material String?` y `measurements Json?` en `SupplierCatalogLine` (`@map` no hace
  falta: los nombres coinciden).
- La **forma** de `measurements` y el largo de `material` viven en la validación de aplicación
  (`catalog-line-input.ts`), no en la base: mismo criterio que el largo del nombre de línea
  (`catalog-line-input.ts:47-52`). La base solo garantiza «objeto o nulo» y «texto no en blanco».
- **Base propia**: toda migración y rollback de esta rama contra `QuimiCloude_QC158` (el `.env` del
  worktree apunta ahí), nunca contra la compartida (lección de QC-147/QC-141, `tasks.md > T2`).

### 2.2 Forma de los campos nuevos `[F2]`

```ts
material: string | null                 // trim; 1..120; en blanco -> null
measurements: {
  diameter: { value: string; unit: 'mm' | 'cm' } | null,
  height:   { value: string; unit: 'mm' | 'cm' } | null,
  mouth:    string | null               // texto libre 1..40, p. ej. "28/410" o "24 mm"
} | null                                 // las tres nulas -> null
```

- `value`: cadena decimal con el patrón de `DECIMAL(14,4)` de la línea (`^\d{1,10}(\.\d{1,4})?$`) y
  **mayor que cero** (descartado léxicamente, como el costo). Nunca `number` (R35).
- Cada medida **conserva la unidad que leyó la IA**; no se convierte. Motivo: la boca de un envase se
  escribe a menudo como **acabado de rosca** («28/410»), que no es una longitud; forzar una unidad
  única obligaría a inventar la conversión de algo que no se convierte. Diámetro y alto sí son
  longitudes y llevan su unidad de una lista cerrada.
- Esquema zod único en `proveedores/domain/catalog-line-input.ts` (`materialSchema`,
  `measurementsSchema`), compartido por alta, edición e importación. `catalogLineFieldsShape` pasa de
  siete a **nueve** campos; `CatalogLineFields`/`CatalogLineView` ganan `material` y `measurements`.

## 3. Contrato JSON que acepta el sistema `[F4]`

Enmienda **R10 de QC-129** (de seis a **ocho** datos, más la página). La forma se fija aquí; el texto
del prompt **no** (R36, QC-129 R9/`[D13]`): el borrador fuera de git se ajusta a esta forma.

```json
{
  "lines": [
    {
      "name": "string | null",
      "presentation": "string | null",
      "unit": "string | null",
      "cost": "string | null",
      "minPurchase": "string | null",
      "deliveryTime": "integer | null",
      "material": "string | null",
      "measurements": {
        "diameter": { "value": "string", "unit": "mm | cm" } | null,
        "height":   { "value": "string", "unit": "mm | cm" } | null,
        "mouth": "string | null"
      } | null,
      "page": "integer >= 1 | null"
    }
  ] | null
}
```

Diferencias con el borrador de QC-131 (medido, no copiado): añade `material`, `measurements` y
`page`; el resto de claves y el `{"lines": null}` para «sin líneas» se conservan.

### 3.1 Interpretación tolerante (`documentos/domain/catalog-extraction.ts`)

1. Quitar cercas (```` ```json ````/```` ``` ````) y tomar del primer `{` al último `}` — **mismo
   algoritmo** que `crop-coordinates.ts:16-28`; se extrae a una función compartida
   `extractJsonObject(text)` en `documentos/domain/json-in-text.ts` y `crop-coordinates.ts` pasa a
   usarla (sin cambiar su comportamiento; sus tests siguen verdes).
2. `JSON.parse`. Fallo → R6.
3. Raíz: objeto con `lines` lista o `null` (o ausente = `null`). Otra cosa → R6.
4. **Cada línea se valida campo a campo, no en bloque**: esquema zod `z.object` (no estricto: las
   claves de más se ignoran) donde cada campo es `catch(null)` — un tipo que no encaja queda en
   `null` y la línea sobrevive (R5). Un elemento de `lines` que no es objeto se descarta.
5. `cost`, `minPurchase` y `measurements.*.value`: **solo cadena**. Un `number` JSON → `null` (R35):
   tras `JSON.parse` el literal original ya pasó por coma flotante y no se puede recuperar.
6. Las cadenas se recortan; cadena vacía → `null`.
7. Resultado: `CatalogExtraction = { lines: ExtractedLine[] }`, todos los campos `string | null`
   salvo `deliveryTime: number | null` y `page: number | null`. **La validez de negocio** (patrón
   decimal, costo > 0, largos) no se decide aquí: se decide al clasificar (`> 4`), para poder
   **mostrar** el valor crudo y decir qué está mal.

El texto de guion que usa el E2E (`> 9`) vive en el adaptador doble, con esta forma; el dominio no
exporta ningún ejemplo.

## 4. Clasificación (`documentos/domain/classify-catalog-import.ts`)

Función **pura**: recibe las filas (extraídas o editadas), las presentaciones resueltas por nombre,
las líneas vivas resueltas por identidad y la lista de recortes; devuelve por fila su clase (R9), sus
errores por campo y la imagen propuesta.

- Identidad: `normalizeSupplierName(name)` (barrel de `proveedores`) +
  `normalizePresentationName(presentation)` (barrel de `inventario`) resuelto a `presentationId`.
  Presentación sin resolver ⇒ «nueva» (no puede existir la línea).
- Validación de negocio: se reutiliza `createCatalogLineSchema` **por campo** (`.shape`) para nombre,
  costo, mínimo, plazo, material y medidas, y `createPresentationSchema.shape.name` para la
  presentación (≤ 60). Ningún patrón se reescribe.
- «duplicada»: segunda y siguientes filas con la misma identidad normalizada.
- «cambia» / «sin cambios»: comparación de costo **como decimal exacto** sobre cadenas
  normalizadas (quitar ceros de relleno: `12.5` = `12.5000`), sin `Number(...)`.

## 5. Casos de uso, puertos e interfaces

### 5.1 `documentos` (dominio)

```ts
createPreviewCatalogImport(deps)(actor, input: {
  supplierId: string; documentFileId: string;
  lines?: ReviewedLineInput[];           // ausente = las del texto de la IA
}): Promise<CatalogImportPreview>

createConfirmCatalogImport(deps)(actor, input: {
  supplierId: string; documentFileId: string;
  lines: ReviewedLineInput[];             // solo las incluidas
  newPresentationUnits: { presentation: string; unitId: string }[];
}): Promise<CatalogImportSummary>        // { created, updated, unchanged, presentationsCreated }

type ReviewedLineInput = {
  name: string; presentation: string; cost: string;
  minPurchase: string | null; deliveryTime: number | null;
  material: string | null; measurements: Measurements | null;
  imagePath: string | null;
};
```

Orden fijo en los dos (R31, R3, R4, R34):
1. `requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION)` — primera línea.
2. `repository.readFileForReview(documentFileId, actor.companyId)` → `{ status, strategy, extractedText }`
   o `null`. `null`, estado ≠ `done` o estrategia ≠ `catalogo` ⇒ `ValidationError` único (R3).
3. Interpretar (`> 3.1`) — solo en la vista previa sin `lines`; la confirmación **no** interpreta,
   pero sí exige el paso 2 (R14).
4. Resolver presentaciones por nombre (`> 5.4`), unidades candidatas y líneas vivas (`> 5.2`).
5. Listar recortes del archivo (`> 5.3`) y, en la vista previa, firmar su lectura.
6. Clasificar (`> 4`).
7. Solo la confirmación: rechazar si hay incompletas/duplicadas/imagen ajena/presentación nueva sin
   unidad (R18, R20, R26); crear presentaciones (`> 5.4`, R17, R33); escribir líneas (`> 5.2`).

Dependencias inyectadas (`CatalogImportDeps`): `repository` (puerto existente ampliado),
`crops: CropCatalog` (nuevo), `presentations: PresentationCatalog` (ampliado), `createPresentation`
(el caso de uso de `inventario`, tipo `(input, actor) => Promise<{id}>`), `units: UnitCatalog`,
`catalog: { findAliveByIdentity, importLines }` (los dos casos de uso de `proveedores`, `> 5.2`),
`now`.

Errores: los ya existentes (`ValidationError` → `invalid_input`, `UnauthorizedError`), más los de los
otros módulos que se propagan (`supplier_not_found`, `presentation_duplicate_name` nunca llega: se
resuelve, `> 5.4`). **Ningún código nuevo** en `lib/modules/errores`.

### 5.2 `proveedores`

Puerto **nuevo** `ports/supplier-catalog-import-repository.ts` (el de `> 0` queda intacto):

```ts
interface SupplierCatalogImportRepository {
  findAliveByIdentities(supplierId, keys: {nameNormalized; presentationId}[], scope)
    : Promise<{ lines: {id; nameNormalized; presentationId; cost}[] } | 'supplier_not_found'>;
  upsertCostByIdentity(supplierId, lines: ImportLine[], actorId, now, scope)
    : Promise<{ created; updated; unchanged } | 'supplier_not_found'>;
}
```

Casos de uso nuevos, con `requirePermission(actor, 'proveedores.modificar')` como primera línea y el
esquema de campos de `> 2.2`:
- `createFindCatalogLinesByIdentity` (lectura para mostrar «cambia»).
- `createImportCatalogLines` (escritura; `> 8`).

`findAliveByIdentities` **lee para mostrar**; no es la comprobación previa que el puerto viejo prohíbe:
la escritura no depende de esa lectura.

### 5.3 `documentos` — puerto nuevo `CropCatalog`

```ts
interface CropCatalog {
  list(companyId: string, documentFileId: string): Promise<readonly string[]>;  // rutas completas
  createSignedReadUrl(path: string, expiresInSeconds: number): Promise<string>;
}
```

Adaptador `adapters/driven/storage/crop-catalog-supabase.ts` (mismo bucket y config que
`crop-storage-supabase.ts`, `list(prefix)` y `createSignedUrl` de `@supabase/storage-js`, **ya
aprobada**). `CropStorage` **no se toca** (QC-110 `[D11]`). Plazo de firma: `READ_LINK_TTL_SECONDS`.
Función de dominio `isCropPathOf(path, companyId, documentFileId)` en `document-path.ts`, al lado de
`buildCropPath`, que exige el formato exacto y ningún `..` (R26); la confirmación además exige que la
ruta esté en `list(...)`.

### 5.4 `inventario`

- `PresentationCatalog` gana `findByNormalizedNames(names, companyId): Promise<{id; name;
  nameNormalized; unitId}[]>` (adaptador `presentation-catalog-prisma.ts`). Sin actor, como `findRefs`.
- Alta: se inyecta **`inventario.createPresentation`** tal cual (permiso `inventario.modificar`
  dentro, `> 7`). Si devuelve `PresentationDuplicateNameError` (carrera con otra alta), se vuelve a
  buscar por nombre y se usa la existente.

### 5.5 `unidades`

Sin cambios: `UnitCatalog.findRefs` valida la unidad elegida para cada presentación nueva (visible
para la empresa). La **sugerencia** de unidad (R19) es una función pura de `documentos`,
`suggestUnitId(readUnit, units: UnitRef[])`, que compara con `name` y `symbol` normalizados y
devuelve `null` si hay cero o más de una coincidencia; la pantalla ya tiene la lista de unidades
(`listUnitsAction`, como el detalle).

## 6. Rutas, acciones y pantalla

### 6.1 Ruta

`/proveedores/[id]/importar/[documentoId]` — helper `supplierCatalogImportRoute(supplierId,
documentFileId)` en `lib/shared/routes.ts`, derivado de `supplierDetailRoute`. La ruta queda bajo la
carpeta de la pantalla de proveedores, que es lo que exige `proveedores/scope.test.ts:243-261`.

`page.tsx` (Server Component): `requirePagePermission('proveedores.consultar')` y
`requirePagePermission('proveedores.modificar')` (precedente de dos llamadas: `/configuracion/unidades`),
después en paralelo `getSupplierAction(id)`, `listUnitsAction()` y
`previewCatalogImportAction({ supplierId, documentFileId })`.

### 6.2 Server Actions — `lib/modules/documentos/adapters/driving/catalog-import-actions.ts`

`previewCatalogImportAction(input: unknown)` y `confirmCatalogImportAction(input: unknown)`; actor de
las **dos caras** de la sesión en un solo `runInRequestScope` (patrón de `document-batch-actions.ts`),
entrada validada con el esquema publicado por el barrel, errores con `createErrorStateTranslator`.
Alta en `session-once-per-request-actions.test.ts`. La confirmación termina con
`revalidatePath(supplierDetailRoute(id))` y devuelve el resumen.

### 6.3 Componentes

- `components/shared/document-upload`: prop **opcional** `reviewHrefFor?: (documentFileId: string)
  => string`; la fila pinta un enlace «Revisar» solo si la prop existe y el estado es `done` (R1). Sin
  la prop, el componente se comporta como hoy (tests de QC-107 sin cambios).
- `app/(private)/proveedores/[id]/components/catalog-pdf-upload.tsx` (`'use client'`): envuelve
  `DocumentUpload strategy="catalogo"` y le pasa `reviewHrefFor` con la ruta de `> 6.1`. `page.tsx` del
  detalle lo monta en lugar de `DocumentUpload` directo. Una función no puede cruzar del Server
  Component al cliente; por eso el envoltorio.
- `app/(private)/proveedores/[id]/importar/[documentoId]/components/`: `catalog-import-review.tsx`
  (cliente, formulario controlado por filas), `catalog-import-row.tsx`, `crop-picker.tsx`,
  `new-presentation-units.tsx`, `catalog-import-summary.tsx`, con su `index.ts`. Una **lista de
  tarjetas**, no `DataTable`: cada fila tiene hasta once controles y en móvil una tabla no cabe.
  Reclasificación (R10): al perder el foco nombre o presentación se llama a
  `previewCatalogImportAction` con las filas editadas (con `useTransition`), y «Confirmar» queda
  deshabilitado mientras hay una reclasificación en vuelo.
- `measurements` en formulario: diámetro y alto con `inputMode="decimal"` + selector `mm|cm`; boca
  como texto. Letra ≥ 16 px, objetivos ≥ 44 px (R37).

### 6.4 Pantalla del catálogo (R28, R29)

- `catalog-line-form.tsx`: campos `material`, `diameter`/`height` (valor + unidad) y `mouth`;
  `imagePath` pasa a **campo oculto precargado** con el valor de la línea (hoy se emite `undefined`
  y la edición la borra). En el alta sigue vacío.
- `supplier-catalog-actions.ts`: lee los campos nuevos del `FormData` y arma `measurements`
  (tres vacíos ⇒ `null`).
- `catalog-columns.tsx`: columna **Material** y columna **Medidas** (texto compacto «Ø 7.5 cm · alto
  12 cm · boca 28/410»), no ordenables ni filtrables (no entran en `SUPPLIER_CATALOG_LINE_QUERYABLE`).
  `catalog-columns-skeleton.ts` sube el número de columnas.
- Adaptador driven del listado (`supplier-catalog-line-prisma.ts`, `list-query-sql.ts`) devuelve las
  dos columnas.

## 7. Permisos

| Operación | Comprobación | Dónde |
|---|---|---|
| Abrir pantalla | `proveedores.consultar` + `proveedores.modificar` → 404 | `page.tsx` (R32) |
| Vista previa / confirmar | `proveedores.modificar`, primera línea | `documentos` (R31) |
| Leer/escribir líneas | `proveedores.modificar` | `proveedores` (defensa en profundidad) |
| Crear presentación | `inventario.modificar` | `inventario.createPresentation` (`[F6]`, R33) |

Para R33 la confirmación **comprueba antes de escribir nada** si alguna fila necesita presentación
nueva y, en ese caso, `assertPermission(actor, 'inventario.modificar')` vía el barrel de `identity`;
así no se crea media confirmación antes de que `inventario` rechace.

## 8. Escritura, atomicidad e idempotencia

- **Líneas, en una transacción** (`upsertCostByIdentity`, SQL crudo en el adaptador driven de
  `proveedores`), por fila:
  ```sql
  INSERT INTO supplier_catalog_lines (..., cost, material, measurements, image_path, created_by, updated_by, company_id, ...)
  VALUES (...)
  ON CONFLICT (supplier_id, name_normalized, presentation_id) WHERE deleted_at IS NULL
  DO UPDATE SET cost = EXCLUDED.cost, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
    WHERE supplier_catalog_lines.cost IS DISTINCT FROM EXCLUDED.cost
  RETURNING (xmax = 0) AS inserted;
  ```
  Sin fila devuelta ⇒ «sin cambios»; `inserted` ⇒ creada; si no ⇒ actualizada (R15, R16). El índice
  único parcial es el árbitro: no hay `SELECT` previo del que dependa la escritura, así que dos
  confirmaciones simultáneas no duplican (R22). Antes, `SELECT ... FOR SHARE` del proveedor vivo de
  la empresa dentro de la misma transacción (R4, R34): una baja concurrente del proveedor espera.
  Las FK compuestas existentes siguen garantizando empresa de proveedor y presentación.
- **Presentaciones, antes y fuera** de esa transacción: `inventario` tiene su propio adaptador y no
  hay unidad de trabajo entre módulos en este repo. **Limitación declarada (R21):** si las líneas
  fallan después, las presentaciones creadas se quedan; son entidades de catálogo reutilizables y la
  siguiente confirmación las encuentra por nombre en vez de duplicarlas.
- **Auditoría**: `created_by`/`updated_by`/`updated_at` de la línea. No se registra desde qué PDF
  vino (no está pedido; `document_files` no gana columnas).
- **Reconfirmar** un PDF viejo más tarde vuelve a aplicar sus costos: es una acción deliberada del
  revisor con la vista previa delante («cambia» con viejo y nuevo). No se bloquea (pregunta 5).
- Tamaño: el cuerpo de una Server Action tiene un tope por defecto de Next (1 MB; `next.config.ts` no
  lo cambia). Estimado ~300 B por fila ⇒ ~3.000 filas. **A medir en T8** con un documento de 50
  páginas del ejemplo de QC-129; si no cabe, se decide con el humano (no se sube el tope a ciegas).

## 9. E2E sin red (R38)

Patrón de QC-107: dobles solo con `DOCUMENTS_E2E_DOUBLES`, elegidos **en cada llamada** en
`lib/composition`.

| Puerto | Hoy en E2E | Cambio |
|---|---|---|
| `AiReader` | `ai-reader-canned.ts` devuelve un texto fijo no JSON | Devuelve **coordenadas** (JSON de `crop-region`) si el prompt es `CROP_COORDINATES_PROMPT`, y **el JSON de catálogo de `> 3`** en cualquier otro caso. Los dos textos se exportan como constantes para que el spec afirme contra ellos. |
| `CropStorage` | real (Supabase) — sin doble | Doble **nuevo** `crop-storage-memory.ts`: guarda los bytes en un `Map` del proceso. |
| `CropCatalog` (nuevo) | — | Doble `crop-catalog-memory.ts` que lista ese mismo `Map` y firma `https://documentos-e2e.invalid/crops/<ruta>`; el spec intercepta esa URL con `page.route()` y sirve un PNG. |
| `DocumentStorage`, cola | dobles ya existentes | Sin cambios. |

- `guard-dobles-e2e.test.ts`: los dos dobles nuevos entran en su lista `DOBLES`.
- El PDF mínimo del doble de almacenamiento (una página 200×200) rasteriza y `sharp` recorta de
  verdad: el recorte corre entero sin red.
- Spec: `e2e/catalogo-desde-pdf.spec.ts` (nombre sin `proveedor|supplier` para no tocar la lista de
  `proveedores/scope.test.ts`), fixture con prefijo `qc158_e2e_` + `RUN_ID`, empresa propia, rol
  Administrador sembrado, una presentación existente con unidad, una línea viva para producir «cambia»
  y una unidad cuyo símbolo **no** casa con la leída para forzar la elección manual. Alta en
  `guard-identificador-de-request.test.ts` (lista de E2E) y en `data-table-alcance.test.ts` si
  comprueba filas en la tabla del catálogo.
- `documentos.spec.ts` (QC-107) pasa a recibir coordenadas válidas en el recorte: si hoy está rojo
  (`> 0`), vuelve a verde; si está verde, sigue verde.

## 10. Preguntas cerradas en F1.4 (2026-09-23)

El humano aprobó el spec y aceptó **tal cual** las siete propuestas de abajo; son las decisiones
`[F1]`…`[F7]` de la nota fechada de `requirements.md`. Ninguna task queda bloqueada por ellas. Las
alternativas se conservan como registro de lo que se descartó.

### 10.1 Pregunta 1 — unidad de una presentación nueva `[F1]`
**Decidido:** el revisor **elige** la unidad entre las visibles para la empresa, con preselección
cuando la unidad leída casa **exactamente una** por nombre o símbolo normalizado (R19). Sin unidad, la
confirmación entera se rechaza nombrando las filas (R18). No se crean unidades desde aquí (exigiría
`unidades.modificar` y decidir derivación y factor). **Descartado:** rechazar la línea en silencio —
el revisor perdería filas sin saberlo—. **Afecta a:** T6 (sugerencia), T10 (confirmación), T12 (UI).

### 10.2 Pregunta 2 — unidad de cada medida `[F2]`
**Decidido:** `> 2.2` — diámetro y alto con su unidad (`mm|cm`) tal como se leyó, **sin convertir**;
boca como texto libre. **Alternativa descartada:** una sola unidad (`mm`) convirtiendo al
importar (×10 exacto sobre cadena); más simple para filtrar en QC-140, pero obligaba a decidir qué
hacer con «28/410». **Afecta a:** T3 (esquema), T11 y T12 (UI). La migración (T2) no depende: la
base solo exige «objeto o nulo».

### 10.3 Pregunta 3 — emparejar imagen y línea `[F3]`
Medido (`> 0`): dos llamadas a la IA, índices independientes; la página es fiable, el orden dentro de
la página no.
**Decidido:** el JSON de catálogo trae `page` por línea (`> 3`). Para cada página: si el número de
filas con esa `page` es **igual** al número de recortes de esa página, se emparejan en orden (fila
i ↔ recorte i, recortes ordenados por `n`); si no, ninguna fila de esa página lleva imagen propuesta.
Siempre se ve la miniatura al lado de la fila y el revisor puede quitarla o elegir **cualquier**
recorte del archivo (R24, R25). La imagen de la línea es la **clave del recorte en su bucket**
(`<empresa>/<archivo>/<página>-<n>.png`); QC-140 la firma para mostrarla.
**Alternativa descartada:** que el recorte deje de hacer su propia llamada y use
cajas por producto devueltas por el prompt de catálogo — emparejamiento exacto, pero reabre el paso
de QC-110 (`[D5]`, `[D14]`) y el trabajo de la cola.
**Riesgo:** QC-110 dejó abierto si los recortes se borran (su pregunta 2); si algún día caducan, la
imagen de la línea apuntaría a nada. **Afecta a:** T6 (emparejamiento), T12 (selector).

### 10.4 Pregunta 4 — contrato JSON `[F4]`
**Decidido:** `> 3` tal cual, con `page` incluido (lo exige 10.3); enmienda R10 de QC-129; costo
numérico = vacío; el texto del prompt fuera del repositorio. El humano ajusta el borrador fuera de git
y lo sube a Vercel en QC-131. **Afecta a:** T5 (interpretación), T14 y T15 (texto de guion E2E).

### 10.5 Pregunta 5 — volver a revisar más tarde `[F5]`
**Decidido:** pantalla propia (`> 6.1`): la revisión se abre desde la fila, sobrevive a recargar y a
compartir el enlace. **No** se añade `supplier_id` a la tanda ni una lista de pendientes; si hace
falta, ficha propia. **Afecta a:** T12, T13.

### 10.6 Pregunta 6 — `inventario.modificar` para crear presentación `[F6]`
**Decidido:** sí, se exige (R33, `> 7`), porque el alta de presentación ya lo exige y crearla por la
puerta de atrás sería un permiso esquivado. En el sembrado vigente no cambia nada para nadie.
**Afecta a:** T10.

### 10.7 Pregunta 7 — qué es «precio» `[F7]`
**Decidido:** solo `cost` (R15). **Afecta a:** T4 (el `DO UPDATE`).

## 11. Alternativas descartadas

**A. Orquestar en `proveedores`.** Es donde viven las líneas y parecía natural. Descartada: necesita
buscar y crear presentaciones, y `proveedores` tiene prohibido importar `inventario`
(`proveedores/scope.test.ts:124-177`, decisión cerrada 3 de QC-52). Reabrir esa frontera para una
ficha de importación costaría más que orquestar desde `documentos`, que ya tiene que importar
`proveedores` para escribir y no tiene esa prohibición.

**B. Interpretar el JSON dentro del trabajo de la cola y guardar líneas «en borrador» en una tabla.**
Validaría una sola vez y permitiría listar pendientes. Descartada: tabla nueva con empresa, RLS,
migración y ciclo de vida de borradores que nadie pidió; y QC-129 R12 dejó escrito que la cola
devuelve el texto «tal cual». Interpretar al abrir la revisión cuesta un `JSON.parse` por visita.

**C. Revisión en un panel lateral del detalle del proveedor** (como el alta de línea). Sin ruta ni
alta en la guardia de pantallas. Descartada: un catálogo de 50 páginas da cientos de filas con once
controles cada una; en un panel móvil no se trabaja, y se pierde al recargar.

**D. Actualizar la línea existente con `SELECT` previo + `UPDATE`/`INSERT`.** Descartada: es la
carrera que el puerto del catálogo prohíbe a propósito; `ON CONFLICT` sobre el índice parcial la
cierra en una sentencia.

## 12. Solapes de archivos con otras ramas en curso

| Archivo | QC-141 (`.worktrees/QC-141-reserva-de-material-del-pedido`) | Esta ficha | Resolución |
|---|---|---|---|
| `db/schema.prisma` | `Product`, `ProductBatch`, `InventoryMovement`, `Order`, enum nuevo | `SupplierCatalogLine` | Bloques distintos; conflicto textual improbable. |
| `db/migrations/` | `20260923150000`, `…150100`, `…150200` | `20260923180000` (provisional) | La nuestra **por detrás** de la última de `dev` al mergear; renumerar si hace falta. |
| `tests/guards/guard-identificador-de-request.test.ts` | `MIGRACIONES_ESPERADAS` (+3) y lista E2E (`reserva-de-material.spec.ts`) | `MIGRACIONES_ESPERADAS` (+1) y lista E2E (`catalogo-desde-pdf.spec.ts`) | **Conflicto seguro**: unión de las dos listas. |
| `lib/composition/index.ts` | bloques de `pedidos`/`inventario` (unidad de trabajo, reservas, cron) | bloques de `documentos`, `proveedores` e `inventario` (`presentationCatalog`) | Conflicto probable en el bloque de `inventario`; unión. |
| `lib/modules/inventario/index.ts` | exporta decimal y orden de lotes | nada (la interfaz ampliada ya se exporta como tipo) | Sin solape si el tipo sale por el export existente de `presentation-catalog`. |
| `tests/unit/shared/data-table-alcance.test.ts` | si su E2E referencia la tabla | ídem | Unión, lista ordenada. |
| `tests/unit/identity/session-once-per-request-actions.test.ts` | no consta | +1 archivo de acciones | Sin solape medido. |
| `feature_list.json` | estado de QC-141 | estado de QC-158 | El de `dev` + el estado propio. |

Otros worktrees vivos, no pedidos pero vistos: QC-131 (borradores de prompt, sin archivos de
producción comunes conocidos), QC-150 y QC-151 (no medidos aquí; el leader los contrasta en F1.5).

## 13. Riesgos

- Emparejamiento por orden (10.3) puede proponer la imagen equivocada: mitigado porque se ve y se
  corrige antes de confirmar.
- Presentaciones huérfanas si la confirmación falla tras crearlas (R21).
- Tope de 1 MB de la Server Action (`> 8`).
- `imagePath` pasa a tener forma de facto (clave del bucket de recortes) solo para líneas importadas;
  las de alta manual siguen sin imagen. QC-140 lo consume.

## 14. Dependencias

**Ninguna nueva.** `zod`, `@supabase/storage-js`, `sharp` ya aprobadas en `docs/dependencias.md`.

## 15. Plan de trazabilidad (R → test)

| R | Test previsto |
|---|---|
| R1, R2 | `tests/unit/documentos-ui/document-upload-review-link.test.tsx`; `catalog-pdf-upload.test.tsx` |
| R3, R4, R34 | `tests/unit/documentos/preview-catalog-import.test.ts` (dobles); `tests/integration/documentos/catalog-import-isolation.int.test.ts` |
| R5, R6, R7, R35 | `tests/unit/documentos/catalog-extraction.test.ts`, `json-in-text.test.ts` |
| R8–R12 | `tests/unit/documentos/classify-catalog-import.test.ts`; `tests/unit/proveedores-ui/catalog-import-review.test.tsx` |
| R13–R18, R20–R22, R26 | `tests/unit/documentos/confirm-catalog-import.test.ts`; `tests/integration/proveedores/catalog-import-upsert.int.test.ts` |
| R19 | `tests/unit/documentos/suggest-unit.test.ts` |
| R23 | `catalog-import-review.test.tsx` (resumen) |
| R24, R25 | `tests/unit/documentos/crop-pairing.test.ts`; `crop-path.test.ts` (`isCropPathOf`) |
| R27, R30 | `tests/unit/proveedores/catalog-line-input.test.ts`; `tests/unit/proveedores/schema/material-measurements-migration.test.ts`; `tests/integration/proveedores/material-measurements-migration.int.test.ts` |
| R28, R29 | `tests/unit/proveedores-ui/catalog-line-form.test.tsx`, `catalog-columns.test.tsx`, `supplier-catalog-actions.test.ts` |
| R31, R33 | `tests/unit/documentos/catalog-import-authorization.test.ts` |
| R32 | `guard-pantallas-exigen-permiso.test.ts` (alta) + `tests/unit/proveedores-ui/catalog-import-page.test.tsx` |
| R36 | `tests/unit/documentos/qc158-alcance.test.ts`: ningún archivo del diff está bajo `borradores-de-prompts/`, ninguno lee `CATALOG_PROMPT` fuera de `strategy-prompt-env.ts`, y el texto de guion del doble es **solo JSON** (se parsea entero), así que no puede llevar instrucciones — mismo enfoque «por forma» que QC-129 usó para su R9 (`QC-129 design.md:288`), sin copiar el texto para compararlo |
| R37 | `catalog-import-review.test.tsx` (clases de tamaño) + pasada manual en WebKit del E2E |
| R38 | `e2e/catalogo-desde-pdf.spec.ts` (Chromium y WebKit) |
