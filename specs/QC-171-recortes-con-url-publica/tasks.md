# QC-171 — recortes-con-url-publica · tasks.md

> Orden de arriba abajo salvo `[P]` (paralelizable con las indicadas). Cada task dice qué archivos
> toca y su criterio de **hecho**. Cada tanda cierra con `./init.sh --rapido`; la feature y el PR, con
> `./init.sh` completo. Comentarios de producción sin citas a fichas, requisitos ni `design.md`; `R<n>`
> va en el nombre de los tests. Al tocar un archivo se limpian los comentarios de **las líneas que toca
> la rama**, no el archivo entero (`docs/conventions.md`).
>
> **Frontera `[D8]`.** Ninguna task toca `crop-catalog-images.ts`, `crop-pairing.ts`,
> `crop-storage-supabase.ts`, `crop-storage-memory.ts`, `crop-storage-config-env.ts`,
> `crop-coordinates.ts`, `crop-region.ts` ni sus tests. Si una task lo necesita, se para y se pregunta.
>
> **Sin base de datos propia.** No hay migración: los tests de integración corren contra la base del
> `.env` del worktree como el resto.

---

## [ ] T0 — Medir antes de escribir

Archivos: `progress/impl_QC-171-recortes-con-url-publica.md` (bitácora, nueva).

- `./init.sh --rapido` en la rama recién creada y anotar que está verde.
- Confirmar con `grep` la lista de tests de `design.md > 7` (los que se pondrán rojos y los que no
  deben cambiar) y anotarla en la bitácora.

**Hecho cuando:** la bitácora tiene el gate de partida verde y la lista de tests afectados.

## [ ] T1 — Puerto `CropCatalog` con URL pública `[P con T3, T6]`

Archivos: `lib/modules/documentos/ports/crop-catalog.ts`,
`lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase.ts`,
`lib/modules/documentos/adapters/driven/storage/crop-catalog-memory.ts`,
`tests/unit/documentos/ports-shape.test.ts`, `tests/unit/documentos/crop-catalog-supabase.test.ts`,
`tests/unit/documentos/crop-catalog-memory.test.ts` (nuevo).

- `createSignedReadUrl` → `publicUrl(path): string` en el puerto (`design.md > 2`).
- Supabase: `cropPublicUrl(path)` con `getPublicUrl`, en el mismo archivo; se borra
  `createCropSignedReadUrl`.
- Memoria: `publicUrl(path)` = `https://documentos-e2e.invalid/crops/<ruta>`.

**Hecho cuando:** `ports-shape` afirma `['list', 'publicUrl']`; `crop-catalog-supabase.test.ts` cubre
**R4** (usa `getPublicUrl`, no `createSignedUrl`, el mock de red no se llama), **R5** (una sola entrada:
la ruta), **R6** (la URL no lleva `token` ni caducidad) y **R7** (sin variables, error que las nombra sin
valores); `crop-catalog-memory.test.ts` cubre **R22** (mismo origen y formato que hoy);
`storage-config.test.ts` sigue viendo **cuatro** importadores de la librería (**R21**), sin modificarlo.

## [ ] T2 — Vista previa con URL pública `[depende de T1]`

Archivos: `lib/modules/documentos/domain/preview-catalog-import.ts` (solo el bloque de `crops`, líneas
283-287, y el import de `READ_LINK_TTL_SECONDS` si queda sin uso),
`tests/unit/documentos/preview-catalog-import.test.ts`,
`tests/unit/documentos/confirm-catalog-import.test.ts`,
`tests/unit/documentos/catalog-import-authorization.test.ts`,
`tests/integration/documentos/catalog-import-isolation.int.test.ts`.

- Sustituir el `Promise.all` de firmas por `cropPaths.map(path => ({ path, url: deps.crops.publicUrl(path) }))`.
- Actualizar los dobles de `CropCatalog` (`createSignedReadUrl` → `publicUrl`).

**Hecho cuando:** `preview-catalog-import.test.ts` tiene casos de **R9** (`crops[].url` y
`rows[].imageUrl` = `publicUrl(ruta)`, cero firmas), **R10** (`list` llamado una vez con N recortes,
ningún otro método asíncrono del puerto), **R12** (con la misma extracción y los mismos recortes,
`rows[].imagePath` = salida de `pairCropsWithLines`) y **R2** (`imagePath` sigue siendo la ruta, no
empieza por `http`); `catalog-import-authorization.test.ts` afirma **R19** para la revisión (sin
permiso, `list` y `publicUrl` no se llaman); `crop-pairing.test.ts` y `crop-catalog-images.test.ts`
verdes **sin cambios** (**R23**).

## [ ] T3 — `proveedores`: puerto y URL en las tres lecturas `[P con T1, T6]`

Archivos: `lib/modules/proveedores/ports/catalog-image-url.ts` (nuevo),
`lib/modules/proveedores/ports/supplier-repository.ts`,
`lib/modules/proveedores/domain/{list-catalog-lines,list-supplier-showcase,list-showcase-lines,supplier-showcase,catalog-line-view}.ts`,
`lib/modules/proveedores/domain/catalog-image-url.ts` (nuevo, `toImageUrl`),
`lib/modules/proveedores/index.ts`,
`lib/modules/proveedores/adapters/driven/persistence/supplier-prisma.ts` (solo el tipo de retorno de
`listShowcaseAliveSuppliers`),
`tests/unit/proveedores/{showcase-service,list-use-cases,company-scope,company-isolation-service,catalog-service,authorization,module-contract,catalog-line-image-scope}.test.ts`,
`tests/unit/proveedores/catalog-image-url.test.ts` (nuevo).

- Puerto `CatalogImageUrl { publicUrl(path) }`, deps `images` en los tres casos de uso,
  `CatalogLineListItem`, `ShowcaseLine { id, name, imageUrl }` y el tipo de registro del puerto
  (`design.md > 4.1`, `> 4.2`).
- Censos de `ports/` (`module-contract`, `catalog-line-image-scope`) pasan a cinco, con el motivo en el
  caso.

**Hecho cuando:** `catalog-image-url.test.ts` cubre **R13** (primera tanda y «cargar más» devuelven
`imageUrl` = `publicUrl(ruta)`), **R14** (el listado devuelve `imagePath` **y** `imageUrl`), **R16**
(ruta nula o vacía → `imageUrl: null` y `publicUrl` no se llama) y **R5** (`publicUrl` recibe solo la
ruta); `authorization.test.ts` cubre **R19** para vitrina y catálogo (sin `proveedores.consultar`,
`publicUrl` no se llama); `catalog-line-image-scope.test.ts` sigue afirmando que ninguna línea junta
imagen y empresa y que no hay URL firmada; `showcase-prisma.test.ts` y
`tests/integration/proveedores/supplier-showcase.int.test.ts` verdes **sin cambios**.

## [ ] T4 — Composición `[depende de T1, T2, T3]`

Archivos: `lib/composition/index.ts` (bloque `cropCatalog` y una declaración nueva **antes** de
`export const proveedores`), `tests/unit/composition/proveedores-image-url.test.ts` (nuevo),
`tests/integration/proveedores/catalog-image-url.int.test.ts` (nuevo).

- `cropCatalog.publicUrl` bifurcado con `documentsE2EDoublesEnabled()`.
- `catalogImageUrl` declarado antes de la fachada `proveedores` y pasado como `images` a los tres casos
  de uso (`design.md > 4.3`).

**Hecho cuando:** importar `@/lib/composition` sin variables de almacenamiento no lanza; el test de
composición afirma que, con los dobles del E2E puestos, la URL de una línea de catálogo sale en
`https://documentos-e2e.invalid/crops/<ruta>` y sin ellos pasa por `cropPublicUrl` (**R1**: la imagen
de la línea y la de la revisión salen del **mismo** bucket de recortes; **R22**); la integración, con
una línea real con `image_path` en la base y los casos de uso cableados, devuelve `imageUrl` en la
tabla y en la vitrina y `imageUrl: null` en la línea sin ruta (**R13**, **R14**, **R16**); y una línea
sembrada con una ruta de recorte **ya existente** (forma `<empresa>/<archivo>/<página>-<n>.png`, sin
pasar por la importación) sale con la misma URL que compone `cropPublicUrl` para esa ruta y con su
`image_path` intacto en la base (**R17**).

## [ ] T5 — Pantallas de vitrina y catálogo `[depende de T3]`

Archivos: `app/(private)/proveedores/components/showcase-line-card.tsx`,
`app/(private)/proveedores/[id]/components/catalog-columns.tsx`,
`app/(private)/proveedores/[id]/components/catalog-table.tsx`,
`tests/unit/proveedores-ui/{showcase-line-card,supplier-showcase-row,supplier-showcase-page,supplier-showcase-list,supplier-detail-page,catalog-columns,catalog-line-sheet}.test.tsx`,
`tests/unit/proveedores/catalog-line-image-scope.test.ts` (caso de la columna),
`tests/unit/proveedores-ui/image-url-screens.test.ts` (nuevo, barrido de fuentes).

- `EntityImage path={line.imageUrl}` en la tarjeta y en la columna; tipos de fila a
  `CatalogLineListItem`. `components/shared/entity-image.tsx` **no se toca**.

**Hecho cuando:** los tests de UI cubren **R15** (con `imageUrl` la miniatura lleva esa URL en `src`,
en vitrina y tabla), **R16** (sin `imageUrl` → marcador con `data-missing`), **R24** (`fireEvent.error`
sobre la miniatura → marcador, en vitrina y tabla) y **R3** (el formulario de edición de una línea con
imagen reenvía en su campo oculto la **ruta**, no la URL); `image-url-screens.test.ts` cubre **R8**
(ningún archivo de las tres pantallas —`proveedores/components`, `proveedores/[id]/components`,
`proveedores/[id]/importar/[documentoId]/components`— contiene `getPublicUrl`, `storage/v1`,
`SUPABASE_` ni concatena una ruta en un `src`); la revisión (`catalog-import-review.test.tsx`) verde
**sin cambios**, que es **R11**.

## [ ] T6 — `.env.example` y alcance `[P con T1, T3]`

Archivos: `.env.example` (solo el comentario de `SUPABASE_CROPS_BUCKET`),
`tests/unit/documentos/crop-storage-config.test.ts` (un caso nuevo),
`tests/unit/documentos/qc171-alcance.test.ts` (nuevo).

- El comentario dice que el bucket es **público**, propio de los recortes y distinto del de recetas y
  del privado de PDF (`design.md > 1`).

**Hecho cuando:** el caso nuevo de `crop-storage-config.test.ts` cubre **R1** (la variable sigue vacía,
el comentario dice «PUBLICO» y la configuración sigue compartiendo dirección y credencial);
`qc171-alcance.test.ts` cubre **R18** (en el código de producción hay **una** sola variable de bucket
de recortes, `SUPABASE_CROPS_BUCKET`, y ningún otro nombre de bucket de recortes; ningún adaptador de
recortes llama a `move` ni `copy`; la rama no añade migración que toque `image_path`), **R20** (`document-storage-supabase.ts` sigue
usando `createSignedUrl`; `recipe-image-supabase.ts` y la lectura de `products` sin `cropPublicUrl`) y
**R21** (`package.json` sin dependencias nuevas frente a `docs/dependencias.md`);
`read-document.test.ts`, `recipe-image-scope.test.ts` y `guard-dependencias-aprobadas.test.ts` verdes
sin cambios.

## [ ] T7 — Cierre y trazabilidad `[depende de T1–T6]`

Archivos: `progress/impl_QC-171-recortes-con-url-publica.md`.

- `./init.sh` completo.
- `pnpm run e2e -- catalogo-desde-pdf` en Chromium, **sin modificar** el spec.
- Mapa `R1…R24 → test` en la bitácora.

**Hecho cuando:** gate completo verde; el E2E de QC-158 pasa sin cambios (**R22**); cada `R<n>` tiene al
menos un test nombrado en la bitácora; `git diff --stat dev` no incluye ningún archivo de la frontera
`[D8]` listado arriba (**R23**).

## [ ] T8 — El humano pasa a público el bucket de recortes actual en cada entorno `[humano]`

Archivos: ninguno del repo. **No** se toca `SUPABASE_CROPS_BUCKET` ni ninguna variable de Vercel.

- En Supabase (desarrollo y producción), cambiar a **público** el bucket que ya nombra
  `SUPABASE_CROPS_BUCKET`. Sus límites de tamaño y tipo se quedan como están.
- Hacerlo **antes** de desplegar el código en ese entorno: sin ello la revisión, que hoy se ve con
  enlace firmado, pasaría a salir en marcador (`design.md > 9`).
- Comprobación manual: una línea importada **antes** de la ficha se ve en la vitrina y en la tabla del
  catálogo (**R17**), e importar un PDF nuevo la muestra en la revisión, la vitrina y la tabla.

**Hecho cuando:** el humano anota en la bitácora el entorno, la fecha y el resultado de la comprobación.
No bloquea el merge del código (sin T8 las imágenes salen en marcador, **R24**), pero sí dar la ficha
por cumplida en ese entorno.

---

## Mapa de archivos por task (para cruzar conflictos en F2.0)

| Task | Producción | Tests |
|---|---|---|
| T1 | `lib/modules/documentos/ports/crop-catalog.ts`, `.../adapters/driven/storage/crop-catalog-supabase.ts`, `.../adapters/driven/storage/crop-catalog-memory.ts` | `tests/unit/documentos/{ports-shape,crop-catalog-supabase,crop-catalog-memory}.test.ts` |
| T2 | `lib/modules/documentos/domain/preview-catalog-import.ts` | `tests/unit/documentos/{preview-catalog-import,confirm-catalog-import,catalog-import-authorization}.test.ts`, `tests/integration/documentos/catalog-import-isolation.int.test.ts` |
| T3 | `lib/modules/proveedores/ports/{catalog-image-url,supplier-repository}.ts`, `lib/modules/proveedores/domain/{list-catalog-lines,list-supplier-showcase,list-showcase-lines,supplier-showcase,catalog-line-view,catalog-image-url}.ts`, `lib/modules/proveedores/index.ts`, `lib/modules/proveedores/adapters/driven/persistence/supplier-prisma.ts` | `tests/unit/proveedores/{showcase-service,list-use-cases,company-scope,company-isolation-service,catalog-service,authorization,module-contract,catalog-line-image-scope,catalog-image-url}.test.ts` |
| T4 | `lib/composition/index.ts` | `tests/unit/composition/proveedores-image-url.test.ts`, `tests/integration/proveedores/catalog-image-url.int.test.ts` |
| T5 | `app/(private)/proveedores/components/showcase-line-card.tsx`, `app/(private)/proveedores/[id]/components/{catalog-columns,catalog-table}.tsx` | `tests/unit/proveedores-ui/*` (ver T5), `tests/unit/proveedores/catalog-line-image-scope.test.ts` |
| T6 | `.env.example` | `tests/unit/documentos/{crop-storage-config,qc171-alcance}.test.ts` |
| T7 | — | `progress/impl_QC-171-recortes-con-url-publica.md` |

Archivos calientes: `lib/composition/index.ts` (cualquier ficha de módulo), `lib/modules/proveedores/index.ts`
y `lib/modules/documentos/domain/preview-catalog-import.ts` (QC-176 lo rodea: esta ficha solo toca el
bloque de `crops`).
