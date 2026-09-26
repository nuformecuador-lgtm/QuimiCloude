# QC-171 — recortes-con-url-publica · bitácora de implementación

Rama `feature/QC-171-recortes-con-url-publica`, worktree `.worktrees/QC-171-recortes-con-url-publica`.

## T0 — Medida de partida (2026-09-25)

- `./init.sh --rapido` sobre `4cfdf480`: **verde** (typecheck, lint 0 errores / 7 warnings ajenos,
  guardias 51 archivos, 646 tests pasan, 11 skipped).

### Tests afectados, confirmados con `grep` (coinciden con `design.md > 7`)

Se ponen rojos a propósito (cambia lo que protegen):
- `tests/unit/documentos/ports-shape.test.ts`
- `tests/unit/documentos/crop-catalog-supabase.test.ts`
- `tests/unit/proveedores/catalog-line-image-scope.test.ts`
- `tests/unit/proveedores/module-contract.test.ts`

Se rompen por tipo (dobles de `CropCatalog` con `createSignedReadUrl`):
- `tests/unit/documentos/{preview-catalog-import,confirm-catalog-import,catalog-import-authorization}.test.ts`
- `tests/integration/documentos/catalog-import-isolation.int.test.ts`

Se rompen por deps sin `images` (`createListCatalogLines` / `createListSupplierShowcase` / `createListShowcaseLines`):
- `tests/unit/proveedores/{showcase-service,list-use-cases,company-scope,company-isolation-service,catalog-service,authorization}.test.ts`

Fixtures de UI con `imagePath` donde va `imageUrl`:
- `tests/unit/proveedores-ui/{showcase-line-card,supplier-showcase-row,supplier-showcase-page,supplier-detail-page,catalog-columns}.test.tsx`
  (+ `supplier-showcase-list`, `catalog-line-sheet` si tipan filas del listado).

Nota: `run-document-job.test.ts`, `documentos-facade.test.ts`, `read-document.test.ts` y otros usan
`createSignedReadUrl` de **`DocumentStorage`** (PDF), no de `CropCatalog`: no cambian (R20).
`tests/guards/guard-dobles-e2e.test.ts` y `tests/unit/documentos/storage-config.test.ts` nombran los
adaptadores de recortes por ruta; los archivos no cambian de nombre.

No deben cambiar: `crop-pairing`, `crop-catalog-images`, `crop-coordinates`, `crop-storage-config`
(salvo caso nuevo R1), `read-document`, `recipe-image-scope`, `storage-config` (censo = 4),
`guard-dependencias-aprobadas`, `e2e/catalogo-desde-pdf.spec.ts`.

## T3 — `proveedores`: puerto y URL en las tres lecturas (2026-09-25)

### Archivos

Producción:
- `lib/modules/proveedores/ports/catalog-image-url.ts` (nuevo) — `CatalogImageUrl { publicUrl(path) }`.
- `lib/modules/proveedores/domain/catalog-image-url.ts` (nuevo) — `toImageUrl(path, images)`, re-exporta el tipo del puerto.
- `lib/modules/proveedores/domain/catalog-line-view.ts` — anade `CatalogLineListItem`.
- `lib/modules/proveedores/domain/list-catalog-lines.ts` — dep `images`, devuelve `Page<CatalogLineListItem>`.
- `lib/modules/proveedores/domain/list-supplier-showcase.ts` — dep `images`, mapea `ShowcasePageRecord` -> `ShowcasePage`.
- `lib/modules/proveedores/domain/list-showcase-lines.ts` — dep `images`, `ShowcaseLine.imageUrl`.
- `lib/modules/proveedores/domain/supplier-showcase.ts` — `ShowcaseLine.imageUrl` (ya no `imagePath`); nuevos `ShowcaseLineRecord`, `ShowcaseRowRecord`, `ShowcasePageRecord` (lo que el repositorio sigue devolviendo, con la ruta).
- `lib/modules/proveedores/ports/supplier-repository.ts` — `listShowcaseAlive` devuelve `ShowcasePageRecord`.
- `lib/modules/proveedores/adapters/driven/persistence/supplier-prisma.ts` — solo el tipo de retorno de `listShowcaseAliveSuppliers` (la consulta no cambia).
- `lib/modules/proveedores/index.ts` — exporta `CatalogLineListItem`, `CatalogImageUrl`, `toImageUrl` y los tres tipos `*Record` de la vitrina.

Tests (actualizados): `tests/unit/proveedores/{showcase-service,list-use-cases,company-scope,company-isolation-service,catalog-service,authorization,module-contract,catalog-line-image-scope}.test.ts`.
Tests (nuevo): `tests/unit/proveedores/catalog-image-url.test.ts`.

Sin cambios y verdes: `tests/unit/proveedores/showcase-prisma.test.ts`,
`tests/integration/proveedores/supplier-showcase.int.test.ts` **con una excepcion, ver mas abajo**.

### R\<n\> -> test (T3)

- R5 — `tests/unit/proveedores/catalog-image-url.test.ts`: *"R5 — con ruta, `publicUrl` recibe SOLO la ruta..."*.
- R13 — `tests/unit/proveedores/catalog-image-url.test.ts`: *"cada linea de cada fila sale con `imageUrl`..."* y *"«cargar mas» de una fila (listShowcaseLines) trae la misma URL publica..."*.
- R14 — `tests/unit/proveedores/catalog-image-url.test.ts`: *"linea con ruta: `imagePath` se conserva y `imageUrl` es `publicUrl(ruta)`"*.
- R16 — `tests/unit/proveedores/catalog-image-url.test.ts`: los cuatro casos "R16 — ...". Tambien `showcase-service.test.ts`: *"la salida solo trae id, name e imageUrl"*.
- R19 (vitrina y catalogo) — `tests/unit/proveedores/authorization.test.ts`: `listCatalogLines`, `listSupplierShowcase`, `listShowcaseLines` en la tabla `CASOS_DE_USO`, con el doble `images` que explota si se llama sin autorizacion.

### Hallazgo: conflicto con `supplier-showcase.int.test.ts`

`lib/composition/index.ts` **no se toco** (fuera de alcance de T3, lo hace T4) y hoy cablea
`createListSupplierShowcase({ suppliers })` y `createListShowcaseLines({ catalog })` **sin** la
dependencia `images`, que T3 vuelve OBLIGATORIA. Corrida la suite completa contra Postgres real
(`pnpm exec vitest run tests/integration/proveedores/supplier-showcase.int.test.ts`), **5 de 11
casos fallan** con `TypeError: Cannot read properties of undefined (reading 'publicUrl')` —viene de
`toImageUrl` cuando `deps.images` es `undefined`, en cualquier linea con `imagePath` no nulo—.

`tests/unit/proveedores/showcase-prisma.test.ts` (el otro test que debia seguir verde) SI pasa:
no pasa por la composicion, solo ejercita `supplier-prisma.ts` con Prisma directo.

Esto es esperable dado el orden de `tasks.md` (T4 depende de T1-T3 y cablea `images` en
`lib/composition`), pero como está PROHIBIDO tocar `lib/composition/index.ts` en esta tanda, el
integration test de la vitrina queda temporalmente rojo hasta que T4 cablee `catalogImageUrl` a
los tres casos de uso. Reporto el hallazgo en vez de tocar composicion por mi cuenta.

### Verificacion

- `pnpm exec vitest run` sobre los 8 tests actualizados + el nuevo `catalog-image-url.test.ts`:
  **9 archivos, 148 tests, todos verdes**.
- `pnpm exec vitest run tests/unit/proveedores/` completo: **24 archivos, 339 tests, todos verdes**.
- `pnpm exec vitest run guard`: **51 archivos, 646 tests verdes, 11 skipped** (guardias intactas).
- `pnpm exec vitest run tests/unit/proveedores/showcase-prisma.test.ts`: verde, sin cambios.
- `pnpm exec vitest run tests/integration/proveedores/supplier-showcase.int.test.ts`: **6 de 11
  verdes, 5 rojos** por el hallazgo de arriba (pendiente de T4).
- `pnpm run typecheck`: sin errores en `lib/modules/proveedores/**` ni en
  `tests/unit/proveedores/*.test.ts` (no `-ui`). Quedan rojos, y son esperados: 8 en
  `lib/composition/index.ts` (T4, y ademas el bloque `cropCatalog` que toca el otro backend_dev),
  1 en `app/(private)/proveedores/components/showcase-line-card.tsx` y 11 en
  `tests/unit/proveedores-ui/*.test.tsx` (T5, tipan `ShowcaseLine` con `imagePath`).
- `pnpm exec eslint <archivos de T3>`: sin errores.
- No se corrio `pnpm test` ni `./init.sh` completo (fuera de alcance de esta tanda).

## T1, T2, T6 — puerto `CropCatalog`, vista previa y `.env.example` (2026-09-25)

Archivos de produccion:
- `lib/modules/documentos/ports/crop-catalog.ts`: `createSignedReadUrl` -> `publicUrl(path): string`.
- `lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase.ts`: `createCropSignedReadUrl`
  borrado; `cropPublicUrl(path)` con `getPublicUrl` (mismo cuerpo que `recipeImagePublicUrl`).
- `lib/modules/documentos/adapters/driven/storage/crop-catalog-memory.ts`: `publicUrl(path)` sincrona,
  mismo origen y formato `https://documentos-e2e.invalid/crops/<ruta>` que antes.
- `lib/modules/documentos/domain/preview-catalog-import.ts`: bloque de `crops` (lineas 283-287) a
  `cropPaths.map(path => ({ path, url: deps.crops.publicUrl(path) }))`, sin `Promise.all`; se quito el
  import de `READ_LINK_TTL_SECONDS` (sigue usandolo `read-document.ts`, sin cambios).
- `.env.example`: comentario de `SUPABASE_CROPS_BUCKET` dice que el bucket es PUBLICO, propio de los
  recortes y distinto del de recetas y del privado de PDF. Variable sigue vacia.

Tests:
- `tests/unit/documentos/ports-shape.test.ts`: `CropCatalog` = `['list', 'publicUrl']`.
- `tests/unit/documentos/crop-catalog-supabase.test.ts`: R4, R5, R6, R7 sobre `cropPublicUrl` (mock de
  `getPublicUrl`, sin `createSignedUrl`).
- `tests/unit/documentos/crop-catalog-memory.test.ts` (nuevo): R22.
- `tests/unit/documentos/preview-catalog-import.test.ts`: doble de `CropCatalog` con `publicUrl`; casos
  nuevos QC-171 R9, R10, R12, R2; assert de `publicUrl` no llamado sin permiso (R19) en el bloque R31.
- `tests/unit/documentos/confirm-catalog-import.test.ts`,
  `tests/unit/documentos/catalog-import-authorization.test.ts`,
  `tests/integration/documentos/catalog-import-isolation.int.test.ts`: doble actualizado a `publicUrl`;
  el de autorizacion suma la comprobacion R19 de `list`/`publicUrl` no llamados.
- `tests/unit/documentos/crop-storage-config.test.ts`: caso nuevo R1 (`.env.example`).
- `tests/unit/documentos/qc171-alcance.test.ts` (nuevo): R18 (un solo nombre de bucket de recortes en
  produccion, ningun adaptador llama a `move`/`copy`, censo de migraciones que tocan `image_path` sin
  crecer), R20 (`document-storage-supabase.ts` sigue con `createSignedUrl`; `recipe-image-supabase.ts` y
  la lectura de `products` sin `cropPublicUrl`/`getPublicUrl`), R21 (`package.json` sin dependencias sin
  fila en `docs/dependencias.md`).

### Mapa R<n> -> test (T1, T2, T6)

| R | Test |
|---|---|
| R1 | `crop-storage-config.test.ts` — "R1 — .env.example: SUPABASE_CROPS_BUCKET sigue vacia..." |
| R2 | `preview-catalog-import.test.ts` — "QC-171 R2 — imagePath sigue siendo la ruta..." |
| R4 | `crop-catalog-supabase.test.ts` — "R4 — publicUrl usa getPublicUrl..." |
| R5 | `crop-catalog-supabase.test.ts` — "R5 — publicUrl recibe solo la ruta..." |
| R6 | `crop-catalog-supabase.test.ts` — "R6 — la URL compuesta no lleva token..." |
| R7 | `crop-catalog-supabase.test.ts` — "R7 — sin las variables de configuracion..." |
| R9 | `preview-catalog-import.test.ts` — "QC-171 R9 — crops[].url y rows[].imageUrl..." |
| R10 | `preview-catalog-import.test.ts` — "QC-171 R10 — list se llama UNA sola vez..." |
| R12 | `preview-catalog-import.test.ts` — "QC-171 R12 — el emparejamiento de filas..." |
| R18 | `qc171-alcance.test.ts` — describe "QC-171 R18 — un unico bucket de recortes..." (3 casos) |
| R19 | `catalog-import-authorization.test.ts` — "R31, R19 — ...: unauthorized, y ni list ni publicUrl..." |
| R20 | `qc171-alcance.test.ts` — describe "QC-171 R20 — los PDF, las recetas y products..." (3 casos) |
| R21 | `qc171-alcance.test.ts` — describe "QC-171 R21 — sin dependencias nuevas..." (2 casos) |
| R22 | `crop-catalog-memory.test.ts` — "R22 — publicUrl compone el mismo origen..." |

### Verificacion (solo T1, T2, T6; no se corrio init.sh completo, por instruccion del encargo)

`pnpm exec vitest run` sobre los archivos de T1, T2 y T6 (incluido el int test contra la base del
`.env` del worktree): **11 Test Files passed, 78 Tests passed**. `crop-pairing`, `crop-catalog-images`,
`crop-coordinates`, `read-document`, `recipe-image-scope`, `storage-config` (censo = 4) y
`guard-dependencias-aprobadas` verdes sin cambios.

`pnpm run typecheck`: rojo, y esperado — todos los errores son de `lib/composition/index.ts`
(borra `createCropSignedReadUrl`, sin `images` en los tres casos de uso de `proveedores`, T4 pendiente)
y de `ShowcaseLine`/`imagePath` en `app/(private)/proveedores/**` y `tests/unit/proveedores-ui/**`
(T3/T5, de otro agente). Ningun error cae en un archivo de T1, T2 o T6.

`pnpm exec eslint` sobre los archivos tocados: 0 errores, solo warnings preexistentes de
`confirm-catalog-import.test.ts` (`_args` sin usar, no relacionados con este cambio).

## T4 — Composicion (2026-09-25)

### Archivos

Produccion (solo `lib/composition/index.ts`, dos bloques):
- Import: `createCropSignedReadUrl` -> `cropPublicUrl` (mismo archivo,
  `crop-catalog-supabase.ts`); se suma `type CatalogImageUrl` al import de `@/lib/modules/proveedores`.
- Bloque `cropCatalog` (~linea 1449): `createSignedReadUrl` -> `publicUrl`, bifurcado con
  `documentsE2EDoublesEnabled()` igual que `list`.
- Declaracion nueva `catalogImageUrl: CatalogImageUrl`, ANTES de `export const proveedores`
  (justo despues de `supplierCatalogRepository`), con la MISMA bifurcacion que `cropCatalog`
  (`cropCatalogMemory.publicUrl` / `cropPublicUrl`).
- `export const proveedores`: `listCatalogLines`, `listSupplierShowcase` y `listShowcaseLines`
  pasan `images: catalogImageUrl`.

Tests (nuevos):
- `tests/unit/composition/proveedores-image-url.test.ts` — importar la composicion sin lanzar;
  con `DOCUMENTS_E2E_DOUBLES` puesta, la URL de una linea de catalogo sale por
  `cropCatalogMemory.publicUrl`; sin ella, es EXACTAMENTE la misma que compone `cropPublicUrl`
  para esa ruta (mismo bucket que la revision). Dobla `listCatalogLinesBySupplierAlive` con
  `vi.hoisted` (mismo patron que `documentos-facade.test.ts`) para no tocar Postgres.
- `tests/integration/proveedores/catalog-image-url.int.test.ts` — contra la base del `.env` del
  worktree: una empresa efimera con un proveedor y dos lineas (una con `image_path` de forma
  `<empresa>/<archivo>/<pagina>-<n>.png` sembrada como "ya existente", otra sin ruta). Verifica
  `imageUrl` en `listCatalogLines` (tabla) y en `listSupplierShowcase` (vitrina), `imageUrl: null`
  en la linea sin ruta, la URL de la ruta ya existente igual a `cropPublicUrl(ruta)` y su
  `image_path` intacto en la base tras leerla.

### R\<n\> -> test (T4)

| R | Test |
|---|---|
| R1 | `tests/unit/composition/proveedores-image-url.test.ts` — "R1 — sin los dobles, la URL es la MISMA que compone `cropPublicUrl`..." |
| R13 | `tests/integration/proveedores/catalog-image-url.int.test.ts` — describe "QC-171 R13 — listSupplierShowcase devuelve imageUrl en la vitrina" |
| R14 | `tests/integration/proveedores/catalog-image-url.int.test.ts` — describe "QC-171 R14, R16 — listCatalogLines devuelve imageUrl en la tabla del catalogo" |
| R16 | mismo test que R14 (linea sin ruta -> `imageUrl: null`) |
| R17 | `tests/integration/proveedores/catalog-image-url.int.test.ts` — describe "QC-171 R17 — una ruta de recorte YA EXISTENTE compone la misma URL publica que una nueva" (dos casos: URL igual y `image_path` intacto) |
| R22 | `tests/unit/composition/proveedores-image-url.test.ts` — "R22 — con los dobles del E2E puestos, la URL sale en https://documentos-e2e.invalid/crops/&lt;ruta&gt;" |

### Hallazgo (no corregido, fuera de mi alcance de T4)

`pnpm run typecheck` mostro, a mitad de la tanda, 1 error en
`tests/unit/documentos-ui/supplier-detail-upload.test.tsx` (falta `imageUrl` en un fixture
tipado como `CatalogLineListItem`, via `CatalogLineListResult` de
`supplier-catalog-actions.ts`). Ese archivo NO importa `lib/composition` ni nada que T4 toque:
la causa es el tipo nuevo `CatalogLineListItem` de T3 propagado a traves de la Server Action, y
un fixture de un test que ni T3 ni T5 tienen listado en `tasks.md`. No lo edite -cae fuera de mi
alcance declarado (solo `lib/composition/index.ts` y los dos tests nuevos de T4) y del `NO
toques app/(private)/proveedores/**`-. Se resolvio solo, en una corrida posterior, por el avance
en paralelo del `frontend_dev` de T5 sobre archivos compartidos; `pnpm run typecheck` quedo
LIMPIO (cero errores) en la verificacion final de abajo. Lo dejo anotado por si vuelve a
aparecer en otra corrida de `init.sh`.

### Verificacion (T4)

- `pnpm exec vitest run tests/unit/composition/proveedores-image-url.test.ts tests/integration/proveedores/catalog-image-url.int.test.ts tests/integration/proveedores/supplier-showcase.int.test.ts tests/unit/composition/`:
  **6 archivos, 49 tests, todos verdes** (incluye `supplier-showcase.int.test.ts`, que volvio a
  verde SIN modificarlo: el hallazgo de T3 -5 de 11 casos rojos por `images` sin cablear- queda
  cerrado).
- `pnpm run typecheck`: **limpio, cero errores** (salida completa: solo las dos lineas del
  script, sin ningun `error TS`).
- No se corrio `pnpm test`, la suite completa ni `./init.sh` (fuera de alcance de esta tanda,
  por instruccion del encargo). No se hizo commit.

**Veredicto T4: hecho.** `cropCatalog` y `catalogImageUrl` comparten bifurcacion y bucket (R1,
R22); las tres lecturas de `proveedores` quedan cableadas con `images`; la integracion demuestra
`imageUrl` en tabla y vitrina, `null` sin ruta, y una ruta de recorte anterior a la ficha
componiendo la misma URL sin tocar `image_path` (R13, R14, R16, R17); `supplier-showcase.int.test.ts`
verde sin cambios.

### Correccion posterior: censo de aislamiento (QC-77)

`tests/integration/proveedores/catalog-image-url.int.test.ts` no estaba declarado en
`tests/integration/aislamiento.json` y la guardia `guard-aislamiento-integracion.test.ts` >
"ningun archivo del arbol se queda fuera del censo (R19)" salia roja. El archivo siembra una
empresa efimera, un proveedor, una presentacion y dos lineas de catalogo con `prisma.create` y
lee con `proveedores.listCatalogLines`/`listSupplierShowcase` de `lib/composition` -cuyos
adaptadores driven usan el cliente Prisma GLOBAL, no un `tx` inyectado-, y limpia todo por id
exacto en el `afterAll`: mismo criterio que `proveedores/supplier-showcase.int.test.ts`, asi que
se declaro en el mismo modo, `commit`, con `motivo` y `desde: "2026-09-25"`. No se toco el test
(ya afirmaba R13, R14, R16, R17 tal cual). `pnpm exec vitest run guard` y el propio archivo
quedaron verdes.

## T5 — Pantallas de vitrina y catalogo (2026-09-25)

### Archivos

Produccion:
- `app/(private)/proveedores/components/showcase-line-card.tsx`: `EntityImage path={line.imageUrl}`.
- `app/(private)/proveedores/[id]/components/catalog-columns.tsx`: tipo de fila
  `CatalogLineListItem` (`CatalogColumn`, `CatalogColumnsDeps.rowActions`); celda de imagen con
  `path={line.imageUrl}`; se quito el comentario de la celda que ya no describia el comportamiento
  (contaba que `image_path` estaba siempre vacia, que dejo de ser cierto).
- `app/(private)/proveedores/[id]/components/catalog-table.tsx`: `CatalogTableProps.lines` a
  `readonly CatalogLineListItem[]`.

Hallazgo de spec (reportado, no bloqueante — corregido): `lib/modules/proveedores/adapters/driving/
supplier-catalog-actions.ts` no esta en el reparto de archivos de `design.md` ni de `tasks.md` (T3
lista el dominio y los puertos; T5 solo lista las tres pantallas), pero `CatalogLineListResult`
declaraba `data: Page<CatalogLineView>` a mano en vez de importar `CatalogLineListItem`: con el
tipo de fila de `catalog-table.tsx` ya en `CatalogLineListItem`, `catalog-list-section.tsx` (que SI
es de `app/(private)/proveedores/**`) dejaba de tipar al pasarle `items` a `<CatalogTable>`. Ajuste
SOLO el tipo -import y el alias `CatalogLineListResult`-, sin tocar ninguna logica de la action, y
lo dejo anotado aqui tal como pide el encargo.

Tests actualizados (fixtures a `imageUrl`, casos nuevos R15/R16/R24/R3):
- `tests/unit/proveedores-ui/showcase-line-card.test.tsx`
- `tests/unit/proveedores-ui/supplier-showcase-row.test.tsx`
- `tests/unit/proveedores-ui/supplier-showcase-page.test.tsx`
- `tests/unit/proveedores-ui/catalog-columns.test.tsx` (mas describe nuevo de imagen)
- `tests/unit/proveedores-ui/supplier-detail-page.test.tsx` (imagen: `imageUrl` en el `src`, `null`
  -> marcador, `fireEvent.error` -> marcador)
- `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx` (caso nuevo R3)
- `tests/unit/proveedores/catalog-line-image-scope.test.ts` (el caso de la columna, ahora
  `line.imageUrl`)

Tests ajustados solo por tipo (mismo patron: `linea()`/`paginaDeLineas()` tipadas con
`CatalogLineListItem`, sin cambiar ninguna afirmacion), rotos por el ajuste de
`supplier-catalog-actions.ts` de arriba y no listados en `tasks.md > T5`:
- `tests/unit/proveedores-ui/catalog-line-form.test.tsx`
- `tests/unit/proveedores-ui/delete-catalog-line-dialog.test.tsx`
- `tests/unit/documentos-ui/supplier-detail-upload.test.tsx` (el fixture inline sumó `imageUrl: null`)

Nuevo: `tests/unit/proveedores-ui/image-url-screens.test.ts` (barrido de las tres pantallas: sin
`getPublicUrl`, sin `storage/v1`, sin `SUPABASE_`, sin plantilla ni concatenacion dentro de un `src`).

`components/shared/entity-image.tsx` y la pantalla de revision (`importar/[documentoId]`) **no se
tocaron**.

### R\<n\> -> test (T5)

| R | Test |
|---|---|
| R15 | `showcase-line-card.test.tsx` — "R15 — con imageUrl pinta esa URL en el src..."; `catalog-columns.test.tsx` — "R15 — con imageUrl, la miniatura de la tabla lleva esa URL en su src"; `supplier-detail-page.test.tsx` — "R15 — la primera columna es la imagen..." |
| R16 | `showcase-line-card.test.tsx` — "R16 — con imageUrl null pinta el marcador..."; `catalog-columns.test.tsx` — "R16 — sin imageUrl, la miniatura..."; `supplier-detail-page.test.tsx` — "R16 — sin imageUrl, la miniatura cae al marcador..." |
| R24 | `showcase-line-card.test.tsx` — "R24 — si la imagen no resuelve al cargarse..."; `catalog-columns.test.tsx` — "R24 — si la imagen de la tabla no resuelve..."; `supplier-detail-page.test.tsx` — "R24 — si la imagen de la tabla no resuelve al cargarse..." |
| R3 | `catalog-line-sheet.test.tsx` — "R3 — una linea con imagen reenvia en su campo oculto la RUTA, no la URL con la que se pinto" |
| R8 | `tests/unit/proveedores-ui/image-url-screens.test.ts` — los cuatro casos del barrido |
| R11 | `tests/unit/proveedores-ui/catalog-import-review.test.tsx` — sin cambios, verde |

### Verificacion

- `pnpm exec vitest run tests/unit/proveedores-ui/ tests/unit/proveedores/catalog-line-image-scope.test.ts`:
  **25 archivos, 267 tests, 6 skipped, todos verdes**.
- `pnpm run typecheck`: **limpio, cero errores**.
- `pnpm exec eslint` sobre los archivos de produccion y de test tocados en T5 (mas
  `supplier-detail-upload.test.tsx`): **0 errores**.
- No se corrio `pnpm test`, la suite completa ni `./init.sh` (fuera de alcance de esta tanda, por
  instruccion del encargo). No se hizo commit.

**Veredicto T5: hecho.** Las tres pantallas pintan `imageUrl` (R15), caen al marcador sin ruta o
si la carga falla (R16, R24), la edicion sigue reenviando la ruta y no la URL (R3), y ningun
archivo de las tres pantallas compone una direccion por su cuenta (R8, R11 intacto).
