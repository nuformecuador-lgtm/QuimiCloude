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
