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

## T12 — guardia de alcance (backend_dev, `547ab378`)

- `tests/unit/documentos/qc159-alcance.test.ts` (nuevo, 17 casos): R36 sin migraciones ni
  `db/schema.prisma` en el diff contra `dev` (ruta real comprobada: `db/migrations`, `db/schema.prisma`);
  exige que existan las seis fuentes de dominio (no pasa en vacío) y recoge `formula-import-actions.ts` y
  `formulas/importar/**` si existen; R35 sin `crop`/`recorte`; R36 claves reales de los dos esquemas
  (leídas del barrel, incluida la unión de `lines`) y de `formula-extraction.ts` contra lista cerrada en
  inglés; R36 sin `delete`/`deleteMany` de `recipe`/`product`; R37 nada bajo `borradores-de-prompts/`,
  `FORMULA_PROMPT` solo en `strategy-prompt-env.ts` y `playwright.config.ts`, `CANNED_FORMULA_TEXT` es
  JSON puro. Cada detector tiene su caso con entrada infractora inventada.

```
vitest run tests/unit/documentos/qc159-alcance.test.ts   17 passed
Rojo a mano 1 (db/migrations/20990101000000_prueba_temporal_qc159/migration.sql, revertido):
  FAIL R36: el diff de esta rama contra dev no trae ninguna migracion ni cambia db/schema.prisma
  db/migrations/20990101000000_prueba_temporal_qc159/migration.sql: expected [ Array(1) ] to deeply equal []
Rojo a mano 2 (clave `nombre` en previewFormulaImportInputSchema, revertido):
  FAIL R36: las claves reales de los esquemas de entrada estan todas en la lista cerrada
  nombre: expected [ 'nombre' ] to deeply equal []
lint 0 errores
```

Pendiente de volver a correrla cuando exista la pantalla de T9 (entra en su barrido).

## T7 — Server Actions (backend_dev, `6508dccd`)

- Nuevos: `lib/modules/documentos/adapters/driving/formula-import-actions.ts`
  (`previewFormulaImportAction(input: unknown): Promise<{status:'success';data:FormulaImportPreview}|ErrorState>`,
  `confirmFormulaImportAction(input: unknown): Promise<{status:'success';data:FormulaImportSummary}|ErrorState>`),
  `lib/modules/documentos/adapters/driving/formula-import-error-translator.ts`,
  `tests/unit/documentos/formula-import-actions.test.ts` (24 casos); alta en
  `tests/unit/identity/session-once-per-request-actions.test.ts`.
- **Desviación de forma respecto a `design.md > 6.2`:** la cadena de tres `createErrorStateTranslator`
  (`DocumentosError` → `RecetasError` → `InventarioError` → `unexpected_error` por el de `documentos`)
  vive en un archivo auxiliar y no dentro del de la acción. En el mismo archivo,
  `guard-catalogo-de-errores.test.ts` (R23 de su ficha) lo marcaba como «traductor casero» porque
  combina `instanceof` con el literal `{ status: 'error', … }` de `invalid_input` en el borde. Revisado:
  el auxiliar **no construye ningún estado**, solo delega en el traductor único; comportamiento y orden
  son los del diseño. Precedente de auxiliar sin `'use server'` en `driving/`: `identity/.../login-form-state.ts`.

```
lint 0 errores
vitest run formula-import-actions + session-once-per-request-actions + tests/guards
  640 verdes, 1 rojo, 5 skip — el rojo era guard-aislamiento-integracion por el archivo de T6 aún sin
  declarar en aislamiento.json (T6 en curso)
```

## T6 — integración de la confirmación (backend_dev, `f06d4fcf`)

- `tests/integration/documentos/formula-import.int.test.ts` (nuevo, 8 casos, empresa efímera por caso;
  adaptadores reales de documentos, recetas, inventario y pedidos), `tests/integration/aislamiento.json`
  (`commit`, con motivo y `desde`).
- R18: reemplazar conserva id, nombre e `image_path` y cambia líneas y pasos; una línea `150.00`
  inyectada envolviendo `replaceAlive` (tras validar el dominio) la rechaza el `CHECK`
  `recipe_lines_percentage_check` y la receta queda como estaba.
- R21: pedido con `ingredientsCost` guardado (alta real) idéntico fila a fila (`JSON.stringify`) tras reemplazar.
- R27: `createRecipe` que falla tras crear la materia prima ⇒ la materia prima queda; la segunda
  confirmación la reutiliza. R28: crear y luego reconfirmar reemplazando ⇒ una receta, una materia prima.
- R33: archivo, receta a reemplazar y producto de otra empresa ⇒ como inexistentes, nada escrito.

```
typecheck limpio · lint 0 errores
vitest run --project integration tests/integration/documentos/formula-import.int.test.ts   8 passed
vitest run tests/guards/guard-aislamiento-integracion.test.ts                                6 passed
```

## Limpieza de comentarios de la rama (backend_dev, `f433532e`)

- Revisión del implementer: las líneas de producción añadidas por la rama citaban `QC-159`, `design.md`,
  `R<n>`, `T<n>`, `P<n>` (regla de `docs/conventions.md > Comentarios`). Commit solo de comentarios, 13
  archivos de `lib/` (composición, `documentos`, `inventario`, `recetas`); los comentarios preexistentes
  no se tocaron.
- `git diff -U0 origin/dev...HEAD -- lib app components | grep -E '^\+' | grep -E 'QC-[0-9]+|\bR[0-9]+\b|design\.md|\bT[0-9]+\b|\bP[1-4]\b'`
  → vacío (antes de T9; se repite al cerrar T9).
- Incidencia de proceso: el subagente hizo un `git stash push -u -- lib app components` temporal
  (aplicado y borrado por SHA) mientras T9 escribía en `app/`. Comprobado después: los seis archivos de
  T9 siguen en disco y no queda ningún stash de la ficha; la integridad de T9 se verifica con sus tests.

```
typecheck limpio · lint 0 errores
vitest run tests/unit/documentos + create-raw-material + recipe-catalog + tests/guards   127 archivos, 1436 verdes / 34 skip
```

## T9 — pantalla de revisión (frontend_dev, `e818f56b`)

- Nuevos: `app/(private)/produccion/formulas/importar/[documentoId]/page.tsx` y
  `components/{index.ts,formula-import-review.tsx,formula-ingredient-row.tsx,formula-name-clash.tsx,formula-import-summary.tsx}`;
  `tests/unit/recetas-ui/formula-import-page.test.tsx` (7) y `formula-import-review.test.tsx` (20).
- Modificados: `tests/guards/guard-pantallas-exigen-permiso.test.ts` (alta de la ruta, 14 → 15) y
  `tests/unit/recetas-ui/recipe-route-contract.test.ts` (fuera de la lista de T9): esa suite asumía
  **un solo** barrel bajo `formulas/`; `design.md > 6.4` pide que la subruta tenga el suyo, así que
  `importar` entra en `CARPETAS_LEGITIMAS` y el subárbol queda fuera **solo** de los dos asertos de
  «un único barrel» (reexport compartido y lista cerrada de acciones); las demás comprobaciones siguen
  corriendo sobre los archivos nuevos. Revisado por el implementer: coherente con el diseño.
- `RecipeForm`, `RecipeStepsField` y `ProductPicker` sin tocar. Integridad tras el stash de la limpieza:
  typecheck limpio y sus 27 tests verdes.
- Comentarios con `R<n>` y `design.md` en los componentes nuevos: se limpian en un commit aparte antes de T11.

```
typecheck limpio · lint 0 errores (7 avisos preexistentes ajenos)
vitest run tests/unit/recetas-ui tests/unit/documentos/qc159-alcance.test.ts tests/guards
  59 archivos, 890 verdes / 5 skip
```

## Después de T9: limpieza de la pantalla y un fallo real (`03bda24e`, `f1012176`)

- `03bda24e` (frontend_dev): solo comentarios en `formulas/importar/[documentoId]/**` (sin citas).
  `git diff -U0 origin/dev...HEAD -- lib app components | grep '^+' | grep -E 'QC-…|R<n>|design.md|T<n>|P<n>'`
  → vacío. (El `order-form.tsx` de `pedidos` que salió en un grep con `origin/dev` de dos puntos es de
  `dev`, que avanzó con el PR #125; la rama no lo toca.)
- **Fallo de T9 destapado al volver a correr sus tests** (`formula-import-review.test.tsx`, «un nombre
  vacío se marca…», `TypeError … reading 'status'` en `handleNameBlur`): el componente recomprobaba el
  choque al perder el foco **aunque el nombre ya fuera inválido** y no capturaba un rechazo de la
  acción; era intermitente (rechazo dentro de `startTransition`), por eso T9 lo vio verde. No venía del
  stash de la limpieza (`git diff e818f56b` lo confirma). Arreglo `f1012176`: `handleNameBlur` sale si
  `issues.name !== 'ok'` y un fallo de la acción conserva el aviso previo. Dos casos nuevos: nombre
  inválido no recomprueba; error de la acción no rompe la pantalla.

```
vitest run tests/unit/recetas-ui/formula-import-review.test.tsx   22/22 verdes
vitest run tests/unit/recetas-ui                                  14 archivos, 296 verdes
typecheck limpio · lint 0 errores
```

## T11 — E2E (INCOMPLETA, `3d86fad0`)

- `e2e/formula-desde-pdf.spec.ts` (454 líneas, un caso que recorre reemplazar y renombrar) y el alta
  en `tests/guards/guard-identificador-de-request.test.ts`: escritos por backend_dev, que se cortó por
  el límite de la API **antes de ver verde**. Guardados en `3d86fad0`, marcado «SIN verificar».
  Queda en `test-results/` un rojo de WebKit de esa corrida, sin analizar.
- **Bloqueo al retomar (2026-09-25):** el puerto 3117 lo tiene un `next dev` **de este mismo worktree**
  (PID 21260, bajo `cmd` 13616, creado 14:12) y un Playwright WebKit de la corrida cortada (PID 11660).
  Pararlos lo denegó el clasificador de permisos, y después también el `typecheck`. No se ha
  ejecutado nada más. Con `reuseExistingServer: false`, el E2E no puede correr mientras el puerto siga
  ocupado.
- **Pendiente:** liberar el puerto (humano/leader), correr
  `pnpm exec playwright test e2e/formula-desde-pdf.spec.ts --reporter=line` hasta verde en Chromium y
  WebKit, repetir `e2e/documentos.spec.ts`, `typecheck` y la guardia de identificador, y marcar T11.
  La tanda 2/3 **no** se ha cerrado con `--rapido` (lo último verde con `--rapido` es la tanda 1, sobre
  `174ef725`).

## T14 — cierre (preparado; el `./init.sh` completo lo corre el leader)

### Mapa R → test

| R | Test |
|---|---|
| R1 | `tests/unit/documentos-ui/formula-pdf-upload.test.tsx`; E2E `e2e/formula-desde-pdf.spec.ts` |
| R2 | `tests/unit/recetas-ui/formula-import-page.test.tsx` (dos renders iguales); E2E |
| R3 | `tests/unit/documentos/preview-formula-import.test.ts`; `formula-import-page.test.tsx` |
| R4, R5, R6 | `tests/unit/documentos/formula-extraction.test.ts` |
| R7 | `formula-extraction.test.ts` (incluido el caso `"1e2"` como cadena, ver T4); E2E |
| R8 | `formula-extraction.test.ts`; `tests/unit/recetas-ui/formula-import-review.test.tsx` |
| R9 | `formula-extraction.test.ts`; `tests/unit/documentos/formula-step-text.test.ts` |
| R10 | `preview-formula-import.test.ts` (cero escrituras); `formula-import-review.test.tsx` |
| R11 | `preview-formula-import.test.ts`; `tests/integration/inventario/product-name-lookup.int.test.ts`; `formula-import-review.test.tsx`; E2E |
| R12 | `tests/unit/documentos/review-formula-import.test.ts`; `formula-import-review.test.tsx`; E2E |
| R13 | `review-formula-import.test.ts`; `formula-import-review.test.tsx` |
| R14 | `review-formula-import.test.ts`; `formula-import-review.test.tsx`; E2E |
| R15, R16 | `review-formula-import.test.ts`; `tests/unit/documentos/confirm-formula-import.test.ts`; `formula-import-review.test.tsx` |
| R17 | `preview-formula-import.test.ts`; `tests/integration/recetas/recipe-catalog-by-name.int.test.ts`; `formula-import-review.test.tsx`; E2E |
| R18 | `confirm-formula-import.test.ts`; `tests/integration/documentos/formula-import.int.test.ts`; E2E |
| R19 | `confirm-formula-import.test.ts`; E2E |
| R20 | `confirm-formula-import.test.ts`; `recipe-catalog-by-name.int.test.ts`; `tests/unit/documentos/formula-import-actions.test.ts` |
| R21 | `formula-import.int.test.ts` (pedido idéntico fila a fila); `formula-import-review.test.tsx` (texto del aviso) |
| R22 | `preview-formula-import.test.ts` (la vista previa no llama a ningún puerto de escritura) y los casos de rechazo de `confirm-formula-import.test.ts` («cero escrituras»). **No hay caso con `R22` en el nombre.** |
| R23 | `confirm-formula-import.test.ts`: «R15, R16 — la revisión del servidor rechaza antes de escribir nada» y «R24 — el producto elegido se relee en el servidor». **No hay caso con `R23` en el nombre.** |
| R24 | `confirm-formula-import.test.ts`; `formula-import-actions.test.ts` |
| R25 | `tests/unit/inventario/create-raw-material.test.ts`; `tests/integration/inventario/create-raw-material.int.test.ts`; `confirm-formula-import.test.ts`; E2E |
| R26 | `confirm-formula-import.test.ts`; `product-name-lookup.int.test.ts` |
| R27 | `confirm-formula-import.test.ts`; `formula-import.int.test.ts` |
| R28 | `confirm-formula-import.test.ts` (tres filas de `design.md > 7.2`); `formula-import.int.test.ts` |
| R29 | `confirm-formula-import.test.ts`; `formula-import-actions.test.ts`; `formula-import-review.test.tsx`; E2E |
| R30 | `tests/unit/documentos/formula-import-authorization.test.ts` |
| R31 | `formula-import-authorization.test.ts`; `create-raw-material.test.ts`; `formula-import-actions.test.ts` |
| R32 | `formula-import-page.test.tsx`; `tests/guards/guard-pantallas-exigen-permiso.test.ts` (alta de la ruta) |
| R33 | `formula-import.int.test.ts`; `product-name-lookup.int.test.ts`; `recipe-catalog-by-name.int.test.ts` |
| R34 | `tests/unit/documentos-ui/formulas-upload.test.tsx` (sin `documentos.modificar` no hay botón; casos nombrados con los R de QC-107) y `document-upload-convenciones.test.ts` («las dos páginas que montan la pieza llaman a canUploadDocuments»). **No hay caso con `R34` en el nombre.** |
| R35 | `tests/unit/documentos/qc159-alcance.test.ts`; `confirm-formula-import.test.ts` (sin `image`); `formula-import-review.test.tsx` |
| R36, R37 | `qc159-alcance.test.ts` (rojo a mano probado, ver T12) |
| R38 | `formula-import-review.test.tsx` (`min-h-11 min-w-11`, `text-base`, sin `hover:` como única vía); E2E en WebKit |
| R39 | `e2e/formula-desde-pdf.spec.ts` (Chromium y WebKit, verde el 2026-09-25) |

### Solapes con QC-168 / QC-138

- A 2026-09-25 ninguna de las dos ha llegado a `dev` (solo sus commits de spec). Nada que resolver aún.
- Previsto al sincronizar (F2.3): listas cerradas y registros (`lib/composition/index.ts`,
  `lib/shared/routes.ts`, `guard-pantallas-exigen-permiso`, `guard-identificador-de-request`,
  `session-once-per-request-actions`, `aislamiento.json`) → unión; **más** los once tests de
  `pedidos`/`asignaciones` cuyo doble de `RecipeCatalog` ganó `findAliveByNormalizedName` (T1), que
  QC-168 puede tocar.

### Deudas y avisos para el leader

- `e2e/catalogo-desde-pdf.spec.ts` rojo en `dev` por QC-160 (le falta abrir el diálogo), no está en
  `tests/baseline-rojos.json`; comprobado que con el diálogo abierto pasa 2/2 con el doble de T10.
- Borrar `QuimiCloude_QC159` al cerrar la feature; restaurar `.env` desde `.env.bak-QuimiCloude` si hace falta.

## T11 — cierre (2026-09-25, tras liberar el leader el puerto 3117)

- **Rojo de WebKit en `formula-desde-pdf.spec.ts:419`** (el aviso de choque no desaparece al renombrar).
  **Causa**, confirmada con la traza y el log del servidor: en WebKit el `fill` del nombre ocurre antes
  de que React termine de hidratar la página (llega pintada del servidor). El `input` no llega a
  `onChange`, el estado se queda con el nombre leído, `handleNameBlur` recomprueba con el nombre viejo
  (`previewFormulaImportAction({…,"name":"guion-e2e-formula-nombre"})`, única llamada tras reabrir) y el
  siguiente render **devuelve el campo al nombre viejo** (snapshot tras `Tab`: valor
  `guion-e2e-formula-nombre`, «Comprobando»). Es un fallo de la pantalla: un usuario de Safari que escriba
  al abrir la página perdería el texto igual.
- **Arreglo `42dbe083`** (frontend_dev): `handleNameBlur` lee el valor del DOM; si difiere del estado lo
  sincroniza (y anula la elección de reemplazar) y recomprueba con ese valor; la guarda de nombre
  inválido usa `createRecipeSchema.shape.name` sobre el valor del DOM. Dos casos nuevos en
  `formula-import-review.test.tsx` (texto entrado sin `input`/`change` + `blur` ⇒ recomprueba con el
  valor nuevo, quita el aviso y el campo lo conserva; DOM vacío ⇒ no recomprueba). El test E2E **no** se
  cambió. Aviso: cualquier otro campo controlado de la pantalla (descripción, porcentajes) puede perder
  lo tecleado antes de hidratar; no se tocó (es el comportamiento general de React en el repo).

```
vitest run tests/unit/recetas-ui                                     14 archivos, 298 verdes
$ pnpm exec playwright test e2e/formula-desde-pdf.spec.ts --workers=1 --reporter=line
  [1/2] [chromium] … [2/2] [webkit] …   2 passed (44.4s)
$ pnpm exec playwright test e2e/documentos.spec.ts --workers=1 --reporter=line
  6 passed (1.0m)
Puerto 3117: libre antes y después de cada corrida (sin `next dev` ni Playwright vivos).
```

## Cierre de las tandas 2 y 3 — `./init.sh --rapido` (sobre `42dbe083`)

```
 Test Files  356 passed (356)
      Tests  5098 passed | 49 skipped (5147)        (relacionados, incluida integración en base efímera)
test-db: borrada la base de la corrida: qct_qc159_15d32d70_muhhubpf_dpo.
 Test Files  51 passed (51)                          (todas las guardias)
      Tests  647 passed | 11 skipped (658)
✓ test:rapido paso · == init OK == · exit 0
```

Con esto R39 queda cubierto por `e2e/formula-desde-pdf.spec.ts` **verificado** en Chromium y WebKit.
T14 queda a falta del `./init.sh` completo, que corre el leader.
