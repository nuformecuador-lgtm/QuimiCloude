# QC-159 — formula-desde-pdf · bitácora del implementer

Rama `feature/QC-159-formula-desde-pdf`, worktree `.worktrees/QC-159-formula-desde-pdf`.
Spec aprobado el 2026-09-25 (`8e80bf60`).

## Base de datos

- **Base propia `QuimiCloude_QC159`**, creada el 2026-09-25 con
  `CREATE DATABASE "QuimiCloude_QC159" TEMPLATE "qct_tpl_a120af3d84d6"` (plantilla de integración de
  la rama tras el merge, `pnpm run db:test template`: «plantilla reutilizada … 54 migraciones»).
  `prisma migrate status`: «54 migrations found … Database schema is up to date!».
- **Solo el `.env` del worktree** apunta a ella (`DATABASE_URL` y `DIRECT_URL`); el original quedó en
  `.env.bak-QuimiCloude` (ignorado por git). `QuimiCloude` (compartida) y las bases de otras fichas no
  se tocaron. La ficha no trae migraciones (`design.md > 2`).
- Los tests de integración siguen creando su base efímera desde la plantilla (QC-77); esta base es
  para `next dev` / E2E.
- **Borrar `QuimiCloude_QC159` al cerrar la feature.**

## T0 — sincronizar y medir

- **Sincronización:** `git merge origin/dev` → `02bba3e4`, sin conflictos (merge y no rebase: la rama ya
  estaba publicada con los commits del spec; mismo criterio que el T0 de QC-150 y QC-154). Trae
  QC-154 (clientes, PR #124) y QC-169 (permiso de la confirmación del catálogo, PR #123).
  `pnpm install --frozen-lockfile` sin cambios.
- **QC-169:** `documentos/domain/actor.ts` gana `CATALOG_IMPORT_PERMISSION = 'proveedores.modificar'`
  y la vista previa y la confirmación del catálogo lo usan en vez de `DOCUMENT_UPLOAD_PERMISSION`.
  La fila de `design.md > 0` que dice que el catálogo exige `documentos.modificar` **cambió**, pero no
  afecta a esta ficha: el diseño ya prescribe una constante propia (`FORMULA_IMPORT_PERMISSION =
  'recetas.modificar'`, P2), que es exactamente el patrón que QC-169 dejó. Sin vuelta al spec.
- **QC-154:** módulo `clientes` nuevo, `lib/composition/index.ts` (bloque de clientes),
  `guard-identificador-de-request.test.ts`, `aislamiento.json`, `guard-autorizacion-por-permiso`
  (`BUSINESS_MODULES` gana `clientes`). Ninguno de los archivos que toca esta ficha salvo listas
  cerradas, donde nuestras altas van en entradas propias. Sin vuelta al spec.

| Punto de `design.md > 0` / T0 | Resultado |
|---|---|
| `readFileForReview(id, companyId)` en el puerto (`ports/document-batch-repository.ts:59`), adaptador Prisma y usado por el catálogo | igual |
| `DocumentUploadDialog.reviewHrefFor` (prop opcional; la fila enlaza solo en `done`) | igual (`document-upload-row.tsx:47`) |
| `createRecipe` con `image` omitido no toca el almacenamiento; `updateRecipe` con `image` omitido conserva `imagePath` | igual (`create-recipe.ts:62-64`, `update-recipe.ts:104-109`) |
| `ProductRepository.create(data, now, scope)` sin llamantes | igual (`product-repository.ts:50`; el único alta llama a `createWithFirstBatch`) |
| `RecipeStepsField` y `ProductPicker` exportados por `formulas/components/index.ts` | igual |
| Ninguna guardia prohíbe importar `../../../components` desde `formulas/importar/[documentoId]/` | igual: la única guardia de fórmulas sobre el barrel (`guard-editor-aislado`) solo veta reexportar `recipe-step-schema`; `nueva/` y `[id]/` ya importan `../components` |
| No existe ruta `formulas/importar` | igual (solo `[id]`, `components`, `nueva`) |
| `formulas/page.tsx` monta `<DocumentUploadDialog strategy="formula" />` directo y llama a `canUploadDocuments` | igual (líneas 31 y 49) |
| Barrel de `recetas`: `PERCENTAGE_PATTERN`, `percentageToHundredths`, `sumPercentages`, `recipeStepSchema`, `createRecipeSchema`, `MAX_STEP_ELEMENTS`, `normalizeRecipeName`, `formatPercentage`, `RecipeDuplicateNameError`, `RecipeNotFoundError`, `ActionNotAllowedError`, `RecetasError`; `RecipeCatalog.findRefsIncludingDeleted` | igual |
| Barrel de `inventario`: `normalizeProductName`, `PRODUCT_TYPES`, `ProductCatalog.findRefs` (con `type`), `InventarioError`, `UnauthorizedError`; `productNameSchema` aún privado (`product-input.ts:22`, lo exporta T3) | igual |
| `extractJsonObject` en `documentos/domain/json-in-text.ts` | igual |
| QC-168 / QC-138 en `dev` | **no**: en `origin/dev` solo están sus commits de spec (`chore(QC-168): spec aprobado…`, `chore(QC-138): spec aprobado; espera al merge de QC-168…`). Ningún solape de `design.md > 13` que resolver todavía. |

**E2E de partida** (`e2e/documentos.spec.ts`, puerto 3117 comprobado libre, contra `QuimiCloude_QC159`).
El primer intento falló antes de cargar ningún test porque el worktree no tenía el cliente de Prisma
generado (`lib/shared/db/prisma.ts:1` → «No tests found»); tras `prisma generate` y `next typegen`:

```
$ pnpm exec playwright test e2e/documentos.spec.ts --reporter=line
  6 passed (51.0s)
exit=0
```

**T0 cerrada:** todo «igual» salvo la fila de QC-169, que cambió en el sentido que el diseño ya
prescribe. No hace falta volver al spec.

## T8 — ruta y acceso «Revisar» desde la subida de fórmulas (frontend_dev, `de71c4b6`)

- Nuevos: `app/(private)/produccion/formulas/components/formula-pdf-upload.tsx`,
  `tests/unit/documentos-ui/formula-pdf-upload.test.tsx`.
- Modificados: `lib/shared/routes.ts` (`formulaImportRoute`), `formulas/components/index.ts`,
  `formulas/page.tsx` (`{canUpload ? <FormulaPdfUpload /> : null}`, sigue con `canUploadDocuments`),
  `tests/unit/documentos-ui/document-upload-convenciones.test.ts` (enmienda de `design.md > 6.3` con el
  motivo escrito).
- **Fuera de la lista de T8, por efecto directo del cambio** (sin cambiar lo que afirman):
  `tests/unit/recetas-ui/recipe-form.test.tsx` (el barrel de fórmulas arrastra ahora
  `DocumentUploadDialog` → `observabilidad`; su doble de `@/lib/composition` gana
  `observabilidad.readRequestIdHeader`, como ya hace `formulas-upload.test.tsx`) y
  `tests/unit/recetas-ui/recipe-route-contract.test.ts` (lista cerrada de exports de `routes.ts`: alta
  de `formulaImportRoute`).
- `document-upload-review-link.test.tsx` y `formulas-upload.test.tsx` verdes **sin editarlos**.

```
typecheck: limpio · lint: 0 errores (7 avisos preexistentes ajenos)
vitest run tests/unit/documentos-ui/formula-pdf-upload.test.tsx      1 archivo, 5 tests verdes
vitest run tests/unit/documentos-ui                                   13 archivos, 66 tests verdes
vitest run tests/unit/proveedores-ui/catalog-pdf-upload.test.tsx      1 archivo, 3 tests verdes
vitest run tests/unit/recetas-ui                                      12 archivos, 267 tests verdes
vitest run guard-rutas-privadas-cubiertas + guard-arquitectura-modulos 2 archivos, 69 tests verdes
```

## T1 — `recetas`: receta viva por nombre (backend_dev, `7dadb385`)

- `lib/modules/recetas/domain/recipe-catalog.ts` (`findAliveByNormalizedName`),
  `adapters/driven/persistence/recipe-catalog-prisma.ts`, `lib/composition/index.ts` (`recipeCatalog`),
  `tests/unit/recetas/recipe-catalog.test.ts`, `tests/integration/recetas/recipe-catalog-by-name.int.test.ts`
  (nuevo), `tests/integration/aislamiento.json`.
- **Colateral no previsto en el spec:** el método nuevo es obligatorio en `RecipeCatalog`, así que los
  dobles/cableados de la interfaz en `tests/integration/asignaciones/{assigned-orders,company-orders,
  finished-orders,responsible-eligibility}.int.test.ts`, `tests/integration/pedidos/{finish-with-finished-goods,
  order-content-copy,order-cost-quote,order-expiry,order-ingredients-cost,order-reservation-concurrency,
  order-reservation}.int.test.ts` y `tests/unit/pedidos/resolve-ingredients-cost.test.ts` ganan ese campo
  (sin tocar lógica). **Solape posible con QC-168** (pedidos) al sincronizar con `dev` en F2.3: unión.

## T2 — `inventario`: productos vivos por nombre (backend_dev, `09a28ba4`)

- `lib/modules/inventario/domain/product-name-lookup.ts` (nuevo), `adapters/driven/persistence/product-catalog-prisma.ts`,
  `lib/modules/inventario/index.ts`, `lib/composition/index.ts` (`productNameLookup`, sin consumidor
  hasta T5: un aviso de lint `no-unused-vars` esperado), `tests/unit/inventario/product-name-lookup.test.ts`
  (nuevo), `tests/integration/inventario/product-name-lookup.int.test.ts` (nuevo), `aislamiento.json`.
- `product-catalog.ts` y `product-prisma.ts` **sin tocar**.

## T3 — `inventario`: alta de materia prima sin lote (backend_dev, `90cc18b9`)

- `lib/modules/inventario/domain/create-raw-material.ts` (nuevo), `product-input.ts` (exporta
  `productNameSchema` y `PRODUCT_NAME_MAX_LENGTH = 200`, regla intacta), `inventario/index.ts`,
  `lib/composition/index.ts` (`inventario.createRawMaterial`), `tests/unit/inventario/create-raw-material.test.ts`,
  `tests/integration/inventario/create-raw-material.int.test.ts` (nuevos), `aislamiento.json`,
  `tests/unit/inventario/schema/inventario-schema.test.ts` (lista cerrada de factorías del barrel).
- `create-product.ts` **sin tocar**; sus tests verdes sin editarlos.

### Salida de verificación de T1–T3

```
typecheck: 0 errores · lint: 0 errores, 8 avisos (preexistentes + productNameLookup hasta T5)
vitest run tests/unit/recetas tests/unit/pedidos/resolve-ingredients-cost.test.ts   40 archivos, 599 tests verdes
vitest run tests/unit/inventario                                                     67 archivos, 1023 verdes / 5 skip
vitest run --project integration recipe-catalog-by-name + product-name-lookup
  + create-raw-material + tests/integration/asignaciones + tests/integration/pedidos 38 archivos, 305 tests verdes
vitest run guard-aislamiento-integracion + guard-ambito-empresa-inventario           33 tests verdes
```

## T4 — `documentos`: interpretación y reglas puras (backend_dev, `700fcbdf` + `174ef725`)

- Nuevos: `lib/modules/documentos/domain/{formula-extraction,formula-step-text,review-formula-import,formula-import-input}.ts`,
  `tests/unit/documentos/{formula-extraction,formula-step-text,review-formula-import}.test.ts` (64 casos).
- `ports/document-batch-repository.ts`: solo los comentarios de `FileForReview`/`readFileForReview`
  (ya no hablan de «catálogo»).
- Todo interno a `documentos`: el barrel y `module-contract.test.ts` se tocan en T5.
- **Corrección `174ef725`:** la primera versión escribía el tope de pasos como `100 / 2` en
  `documentos` para esquivar la guardia de números sueltos del módulo (`ai-limits.test.ts`). Se
  rechazó: esquiva la guardia y reescribe una regla de `recetas`. Ahora `recetas` publica
  `MAX_RECIPE_STEPS = 50` (`recipe-input.ts`, la regla de su esquema no cambia; se limpió el comentario
  con citas de esas líneas) y `documentos` lo importa del barrel.
- **Lectura del caso `1e2` de T4 (R7):** tras `JSON.parse`, el número JSON `1e2` es `100`, que P3
  acepta (`String(100) = "100"`), así que el único `1e2` que puede llegar vacío es la **cadena**
  `"1e2"` (no casa con `PERCENTAGE_PATTERN`). Se implementó y se probó así; el camino numérico de P3
  se prueba con `12.5`. Un número JSON cuya `String(n)` sí lleve exponente (p. ej. `1e-7`) llega vacío.
  No contradice ni P3 ni R7; queda anotado para el reviewer.

```
typecheck limpio · lint 0 errores
vitest related --run <5 archivos de T4>                         3 archivos, 64 tests verdes
vitest run tests/unit/documentos (T4)                           76 archivos, 735 verdes / 29 skip
tras 174ef725: vitest run tests/unit/documentos tests/unit/recetas   115 archivos, 1324 verdes / 29 skip
tras 174ef725: vitest related --run <4 archivos>                253 archivos, 3716 verdes / 1 skip
```

## T10 — doble de IA para fórmulas (backend_dev, `ef5c8b27`)

- `lib/modules/documentos/adapters/driven/ai/ai-reader-canned.ts`: partes todas `pdf` ⇒
  `CANNED_FORMULA_TEXT`; el prompt del recorte sigue mandando primero; lo demás ⇒ catálogo.
  Constantes `CANNED_FORMULA_*`: nombre `guion-e2e-formula-nombre`; ingredientes
  `guion-e2e-formula-preseleccion` (25), `guion-e2e-formula-materia-prima-nueva` (60) y uno **sin
  nombre** con `percentage: null`, `quantity: "250"`, `unit: "g"` (`CANNED_FORMULA_MISSING_PERCENTAGE = '15'`
  para cuadrar 100); tres pasos, el segundo de dos líneas. El nombre del tercero no lo fija
  `design.md > 10`; sin nombre, el E2E tiene que **elegir** un producto en esa fila (recorre R12).
- `tests/unit/documentos/ai-reader-canned.test.ts` ampliado; el texto de guion se parsea entero como JSON.

```
vitest run tests/unit/documentos tests/guards/guard-dobles-e2e.test.ts   77 archivos, 742 verdes / 29 skip
typecheck limpio · lint 0 errores
```

## Cierre de la tanda 1 (T1–T4, más T8 y T10) — `./init.sh --rapido`

```
$ ./init.sh --rapido           (sobre 174ef725)
 Test Files  340 passed (340)
      Tests  4849 passed | 49 skipped (4898)        (relacionados, incluida integración en base efímera)
test-db: borrada la base de la corrida: qct_qc159_15d32d70_muh7ctmf_ge4.
[test:rapido] todas las guardias
 Test Files  51 passed (51)
      Tests  647 passed | 11 skipped (658)
✓ test:rapido paso · ✓ todas las migraciones tienen down.sql · == init OK ==
exit 0
```

### E2E de regresión de T10 (`documentos.spec.ts` y `catalogo-desde-pdf.spec.ts`, puerto 3117 libre)

```
$ pnpm exec playwright test e2e/documentos.spec.ts e2e/catalogo-desde-pdf.spec.ts --reporter=line
  2 failed   [chromium] y [webkit] catalogo-desde-pdf.spec.ts:281 — getByTestId('document-upload') Received: hidden
  6 passed (2.1m)                                        (documentos.spec.ts: 6/6)
```

- **Rojo ajeno, deuda de `dev`:** QC-160 (`b03f4811`, 2026-09-24 18:42) metió la subida del detalle de
  proveedor en un diálogo con botón `document-upload-open` y actualizó `documentos.spec.ts`, pero
  `catalogo-desde-pdf.spec.ts` (QC-158, último cambio `121f3bd5` a las 14:55 del mismo día, que no tiene
  QC-160 en su historia) sigue esperando la sección visible sin abrir el diálogo. Esta rama no toca
  `proveedores/` ni `components/shared/document-upload/`. No está en `tests/baseline-rojos.json`.
- **Prueba de que T10 no rompe el catálogo:** con un parche **local y revertido** (abrir el diálogo
  antes de la línea 325; `git checkout -- e2e/catalogo-desde-pdf.spec.ts`, árbol limpio):
  `pnpm exec playwright test e2e/catalogo-desde-pdf.spec.ts` → `2 passed (30.1s)`.
- No se arregla aquí: es un archivo de QC-158/QC-160 fuera de las tasks de esta ficha. **Para el leader.**

## T5 — `documentos`: vista previa y confirmación (backend_dev, `4ec88dab`, `92949ff6`, `0e8d7091`)

- Nuevos: `lib/modules/documentos/domain/{preview-formula-import,confirm-formula-import}.ts`;
  `tests/unit/documentos/{preview-formula-import (13),confirm-formula-import (22),formula-import-authorization (14)}.test.ts`.
- Modificados: `documentos/domain/actor.ts` (`FORMULA_IMPORT_PERMISSION = 'recetas.modificar'`, no sale
  por el barrel, igual que `CATALOG_IMPORT_PERMISSION`); `documentos/index.ts` (publica casos de uso,
  `reviewFormulaImport`, `extractFormulaFromText`, `stepTextToDocument`, esquemas y tipos);
  `lib/composition/index.ts` (solo el bloque de `documentos`: `previewFormulaImport`,
  `confirmFormulaImport`); `tests/unit/documentos/module-contract.test.ts`;
  `tests/unit/composition/documentos-facade.test.ts` (censo cerrado de la fachada, 12 → 14 claves; no
  estaba en la lista de T5, lo exige el cableado).

```
typecheck limpio · lint 0 errores (7 avisos preexistentes ajenos; desaparece el de productNameLookup)
vitest run tests/unit/documentos tests/guards tests/unit/composition/documentos-facade.test.ts
  124 archivos, 1370 verdes / 34 skip
vitest related: tests/unit/configuracion-ui/user-table.test.tsx rojo en la corrida grande y 27/27 aislado
  (saturación de jsdom; ajeno)
```

## T13 — notas fechadas en specs afectados (implementer)

- Notas añadidas **al final** de `specs/QC-129-textos-definitivos-de-los-prompts/requirements.md` (R11
  enmendado con la forma de `design.md > 3`), `specs/QC-158-catalogo-desde-pdf/requirements.md` (R2
  superado en su primera mitad; R3 intacto) y `specs/QC-90-alta-del-primer-lote/requirements.md`
  (excepción de la materia prima sin lote, P1). Las tres enlazan a este spec; `git diff` = solo
  añadidos al final (10 + 9 + 9 líneas), ninguna tabla ni requisito ajeno cambiado.
