# QC-159 — formula-desde-pdf · tasks.md

> Cada task: **Toca** (archivos, para cruzar en F2.0), **Hacer**, **Hecho cuando** y los **R** que
> cierra con su test. `[P]` = puede ir en paralelo con las demás `[P]` de su tanda. Dependencias en
> «Tras». Cierre de tanda: `./init.sh --rapido`; cierre de feature: `./init.sh`.
>
> Las tasks marcadas ⚑ dependen de una pregunta abierta (`requirements.md > Preguntas abiertas`); se
> implementan con la propuesta de `design.md > 11` **solo** si el humano la aprueba en F1.4. Ninguna
> task crea migraciones (`design.md > 2`).

## Tanda 0 — preparación

### T0 [ ] — Sincronizar y medir
**Toca:** `progress/impl_QC-159-formula-desde-pdf.md` (nuevo).
**Hacer:** rebasar sobre `origin/dev`; confirmar que siguen como las mide `design.md > 0`:
`readFileForReview`, `DocumentUploadDialog.reviewHrefFor`, `createRecipe`/`updateRecipe` con `image`
omitido, `ProductRepository.create` sin llamantes, `RecipeStepsField` y `ProductPicker` exportados por
`formulas/components/index.ts`. Comprobar que ninguna guardia de fórmulas prohíbe importar
`../../../components` desde `formulas/importar/[documentoId]/` y que no existe ya una ruta
`formulas/importar`. Correr `e2e/documentos.spec.ts` para tener su estado de partida. Anotar en la
bitácora si QC-168 o QC-138 ya están en `dev` (solapes de `design.md > 13`).
**Hecho cuando:** bitácora con cada punto «igual» o «cambió: …»; si algo cambió, se para y se vuelve al
spec antes de T1.

## Tanda 1 — piezas de cada módulo dueño

### T1 [ ] [P] — `recetas`: receta viva por nombre
Tras T0. **Toca:** `lib/modules/recetas/domain/recipe-catalog.ts`,
`lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts`, `lib/composition/index.ts`
(objeto `recipeCatalog`), `tests/unit/recetas/recipe-catalog.test.ts`,
`tests/integration/recetas/recipe-catalog-by-name.int.test.ts` (nuevo), `tests/integration/aislamiento.json`.
**Hacer:** `findAliveByNormalizedName(name, companyId)` de `design.md > 5.2`.
**Hecho cuando:** integración: encuentra con mayúsculas/acentos/guiones distintos; no devuelve una
receta dada de baja ni una de otra empresa; nombre que normaliza a `''` ⇒ `null`. Cubre **R17, R20,
R33** (parte `recetas`).

### T2 [ ] [P] — `inventario`: productos vivos por nombre
Tras T0. **Toca:** `lib/modules/inventario/domain/product-name-lookup.ts` (nuevo),
`lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`,
`lib/modules/inventario/index.ts`, `lib/composition/index.ts` (constante `productNameLookup`),
`tests/unit/inventario/module-contract.test.ts` (o el test de contrato del barrel que exista),
`tests/integration/inventario/product-name-lookup.int.test.ts` (nuevo), `tests/integration/aislamiento.json`.
**NO toca** `product-catalog.ts` ni `product-prisma.ts` (QC-168 T9).
**Hacer:** `ProductNameLookup.findAliveByNormalizedNames` de `design.md > 5.3`.
**Hecho cuando:** integración: devuelve todos los homónimos vivos con su `type` (incluido un terminado),
ninguno dado de baja, ninguno de otra empresa; lista vacía ⇒ sin consulta. Guardia de ámbito de
`inventario` verde. Cubre **R11, R26, R33** (parte `inventario`).

### T3 [ ] ⚑P1 — `inventario`: alta de materia prima sin lote
Tras T2 (comparten `inventario/index.ts` y el bloque de `inventario` de la composición).
**Toca:** `lib/modules/inventario/domain/create-raw-material.ts` (nuevo),
`lib/modules/inventario/domain/product-input.ts` (solo **exportar** `productNameSchema` y
`PRODUCT_NAME_MAX_LENGTH = 200`, sin cambiar reglas), `lib/modules/inventario/index.ts`,
`lib/composition/index.ts` (`inventario.createRawMaterial`), `tests/unit/inventario/create-raw-material.test.ts`
(nuevo), `tests/integration/inventario/create-raw-material.int.test.ts` (nuevo),
`tests/integration/aislamiento.json`, test de contrato del barrel de `inventario`.
**NO toca** `create-product.ts` (QC-138 sí).
**Hacer:** `design.md > 5.3`.
**Hecho cuando:** unit: sin `inventario.modificar` ⇒ `unauthorized` sin tocar el puerto; clave de más
⇒ `invalid_input`; nombre de 201 ⇒ `invalid_input`; llama a `products.create` con `type: PRODUCT` y
`qtyAlert: null`. Integración: producto con `unit_id IS NULL`, `stock = 0`, cero filas en
`product_batches` y cero en el libro de movimientos, en la empresa del actor. Los tests de
`create-product` siguen verdes sin tocarlos. Cubre **R25** y la defensa en profundidad de **R31**.

### T4 [ ] ⚑P3 — `documentos`: interpretación y reglas puras
Tras T3 (usa `PRODUCT_NAME_MAX_LENGTH`). **Toca:** `lib/modules/documentos/domain/formula-extraction.ts`,
`formula-step-text.ts`, `review-formula-import.ts`, `formula-import-input.ts` (nuevos),
`lib/modules/documentos/ports/document-batch-repository.ts` (solo el comentario de `FileForReview`),
`tests/unit/documentos/formula-extraction.test.ts`, `formula-step-text.test.ts`,
`review-formula-import.test.ts` (nuevos).
**Hacer:** `design.md > 3.1` y `> 4`, reutilizando `extractJsonObject`, `PERCENTAGE_PATTERN`,
`percentageToHundredths`, `sumPercentages`, `recipeStepSchema`, `createRecipeSchema.shape` y
`MAX_STEP_ELEMENTS` de los barrels (ningún patrón reescrito).
**Hecho cuando:**
- extracción: cercas, prosa alrededor, `null`/ausente/clave desconocida, tipo erróneo ⇒ vacío sin
  perder el ingrediente (**R4**); sin objeto, `ingredients: 5`, `steps: "x"` ⇒ `invalid_input` (**R5**);
  el texto de entrada no se muta (**R6**);
- porcentaje: `"12,5"`, `"12.5 %"`, `12.5` (número) ⇒ `"12.5"`; `"33.333"`, `"0"`, `"-1"`, `"101"`,
  `"abc"`, `1e2` ⇒ vacío con `read` intacto; nunca redondea (**R7**);
- `quantity`/`unit` pasan como texto y no alimentan el porcentaje (**R8**);
- paso de tres líneas con una vacía ⇒ dos párrafos; paso en blanco ⇒ descartado; orden conservado
  (**R9**);
- reglas: cada `RowProblem` y cada estado de nombre/descripción/pasos, suma `99.99`/`100.00`/`100.01`,
  cero filas, 51 pasos, paso con 31 elementos, receta sin pasos confirmable (**R12–R16**, parte pura);
  repetidas por `productId` y por nombre nuevo normalizado, sin sumar (**R16**).

## Tanda 2 — orquestación y borde

### T5 [ ] ⚑P2 ⚑P4 — `documentos`: vista previa y confirmación
Tras T1, T2, T3, T4. **Toca:** `lib/modules/documentos/domain/actor.ts` (`FORMULA_IMPORT_PERMISSION`),
`preview-formula-import.ts`, `confirm-formula-import.ts` (nuevos), `lib/modules/documentos/index.ts`,
`lib/composition/index.ts` (bloque de `documentos`: `previewFormulaImport`, `confirmFormulaImport` con
`recipeCatalog`, `productCatalog`, `productNameLookup`, `inventario.createRawMaterial`,
`recetas.createRecipe`, `recetas.updateRecipe`), `tests/unit/documentos/preview-formula-import.test.ts`,
`confirm-formula-import.test.ts`, `formula-import-authorization.test.ts` (nuevos),
`tests/unit/documentos/module-contract.test.ts` (`EXPORTACIONES_DE_EJECUCION`),
`tests/unit/documentos/authorization.test.ts` (solo si su recuento de literales de permiso lo exige).
**Hacer:** los once pasos de `design.md > 5.1`.
**Hecho cuando** (con dobles, contando llamadas a cada puerto):
- sin `recetas.modificar` ⇒ `unauthorized` y **cero** llamadas a puertos (**R30**);
- archivo inexistente / de otra empresa / no `done` / tanda `catalogo` ⇒ el mismo `invalid_input`
  (**R3, R33**);
- vista previa: `match` `one`/`none`/`several`, terminado nunca preseleccionado, `nameClash` con el
  nombre extraído y con `name` explícito; cero escrituras (**R10, R11, R17**);
- confirmación: cada rechazo de R15/R16 ⇒ `invalid_input` sin escribir; producto de otra empresa ⇒
  `invalid_input`; terminado ⇒ `action_not_allowed`; ambos **antes** de `createRawMaterial`
  (**R23, R24, R27**);
- choque: sin `replaceRecipeId` ⇒ `recipe_duplicate_name`; id de otra receta ⇒ `recipe_duplicate_name`;
  id dado de baja ⇒ `recipe_not_found`; id vivo con otro nombre ⇒ `invalid_input`; en los tres, cero
  materias primas creadas (**R20, R27**);
- materia prima nueva sin `inventario.modificar` ⇒ `unauthorized`, cero escrituras (**R31**);
  0 homónimos ⇒ crea; 1 ⇒ reutiliza; 2 ⇒ `invalid_input`; reutilizado que coincide con otra fila ⇒
  `invalid_input` (**R25, R26**);
- reemplazar llama a `updateRecipe` con el **nombre vivo** de la receta y **sin** clave `image`; crear
  llama a `createRecipe` sin `image` (**R18, R19, R35**);
- las tres filas de `design.md > 7.2` con dobles (**R28**); resumen `created`/`replaced` y recuentos
  (**R29**, parte dominio); sin confirmar no hay ninguna escritura (**R22**).

### T6 [ ] — Integración de la confirmación
Tras T5. **Toca:** `tests/integration/documentos/formula-import.int.test.ts` (nuevo),
`tests/integration/aislamiento.json`.
**Hacer:** contra la base de tests, con los adaptadores reales y el caso de uso compuesto.
**Hecho cuando:**
- reemplazar: mismo `recipes.id`, nombre e `image_path` conservados, líneas y pasos nuevos; con una
  línea que viola el `CHECK` de porcentaje forzada en el adaptador, la receta queda **como estaba**
  (**R18**);
- un pedido con coste guardado sobre esa receta queda **idéntico** fila a fila tras reemplazar (**R21**);
- dos confirmaciones reales seguidas (crear y reemplazar) ⇒ una receta y ninguna materia prima
  duplicada (**R28**); receta que falla tras crear materia prima ⇒ la materia prima queda y la
  segunda confirmación la reutiliza (**R27**);
- archivo, receta y producto de otra empresa ⇒ como inexistentes (**R33**).

### T7 [ ] — Server Actions
Tras T5. **Toca:** `lib/modules/documentos/adapters/driving/formula-import-actions.ts` (nuevo),
`tests/unit/documentos/formula-import-actions.test.ts` (nuevo),
`tests/unit/identity/session-once-per-request-actions.test.ts` (alta).
**Hacer:** `design.md > 6.2`.
**Hecho cuando:** entrada rota ⇒ `invalid_input` sin leer la sesión; `RecipeDuplicateNameError`,
`RecipeNotFoundError`, `ActionNotAllowedError` de `recetas` y `UnauthorizedError` de `inventario` salen
con **su** código (no `unexpected_error`); éxito ⇒ `revalidatePath` de `FORMULAS_ROUTE` y de la ficha;
una lectura de sesión por invocación (**R20, R24, R29, R31**, parte borde).

### T8 [ ] [P] — Ruta y acceso «Revisar» desde la subida de fórmulas
Tras T0. **Toca:** `lib/shared/routes.ts` (`formulaImportRoute`),
`app/(private)/produccion/formulas/components/formula-pdf-upload.tsx` (nuevo),
`app/(private)/produccion/formulas/components/index.ts`, `app/(private)/produccion/formulas/page.tsx`,
`tests/unit/documentos-ui/formula-pdf-upload.test.tsx` (nuevo),
`tests/unit/documentos-ui/document-upload-convenciones.test.ts` (enmienda de `design.md > 6.3`, con el
motivo escrito), `tests/unit/documentos-ui/formulas-upload.test.tsx` (solo si el envoltorio lo exige;
sin cambiar lo que afirma).
**Hacer:** `design.md > 6.1` (helper) y `> 6.3`.
**Hecho cuando:** fila `done` de una tanda `formula` ⇒ enlace a `formulaImportRoute(id)`; `processing`,
`error`, `queued` ⇒ sin enlace (**R1**); sin `documentos.modificar` no hay botón ni subida y la página
sigue llamando a `canUploadDocuments` (**R34**); `document-upload-review-link.test.tsx` y los tests de
QC-107 verdes **sin editarlos**.

### T9 [ ] — Pantalla de revisión
Tras T7, T8. **Toca:** `app/(private)/produccion/formulas/importar/[documentoId]/page.tsx`,
`…/components/{index.ts,formula-import-review.tsx,formula-ingredient-row.tsx,formula-name-clash.tsx,formula-import-summary.tsx}`
(nuevos), `tests/unit/recetas-ui/formula-import-page.test.tsx`,
`tests/unit/recetas-ui/formula-import-review.test.tsx` (nuevos),
`tests/guards/guard-pantallas-exigen-permiso.test.ts` (alta de la ruta).
**NO toca** `RecipeForm`, `RecipeStepsField` ni `ProductPicker` (se importan del barrel de fórmulas).
**Hacer:** `design.md > 6.1` y `> 6.4`.
**Hecho cuando:**
- página: sin `recetas.consultar` o sin `recetas.modificar` ⇒ 404; dos renders con la misma respuesta
  pintan lo mismo; `invalid_input` pinta el estado de error sin datos (**R2, R3, R32**);
- revisión: filas en orden con leído, «leído: …» y referencia de cantidad; preseleccionado / elegir /
  crear con nombre editable / quitar / añadir; selector filtrado a `PRODUCT` (**R10, R11, R12, R8**);
  nombre y descripción con sus errores (**R13**); pasos con corregir/borrar/añadir/reordenar y
  confirmar sin pasos (**R14**); suma en vivo y «Confirmar» deshabilitado con el motivo por fila en
  cada caso de R15 y R16 (**R15, R16**);
- choque: aviso con el nombre existente y el texto de `> 6.4`; sin elección no confirma; cambiar el
  nombre llama a la vista previa con `name` y quita el aviso (**R17, R21**);
- confirmación en vuelo deshabilita el botón; éxito ⇒ resumen de R29 y navegación a la ficha (**R29**);
- ninguna imagen ni recorte en la pantalla (**R35**); objetivos `min-h-11 min-w-11`, campos
  `text-base`, sin acción solo en `hover:` (**R38**).

### T10 [ ] [P] — Doble de IA para fórmulas
Tras T4 (forma del JSON). **Toca:** `lib/modules/documentos/adapters/driven/ai/ai-reader-canned.ts`,
`tests/unit/documentos/ai-reader-canned.test.ts` (nuevo o ampliado).
**Hacer:** `design.md > 10` (tercer caso por forma de las partes; constantes `CANNED_FORMULA_*`).
**Hecho cuando:** partes solo `pdf` ⇒ `CANNED_FORMULA_TEXT`, que la interpretación de `formula-extraction.ts` acepta con tres
ingredientes (uno con porcentaje vacío y cantidad) y tres pasos; partes `image` ⇒ catálogo; prompt del
recorte ⇒ coordenadas; `e2e/documentos.spec.ts` y `e2e/catalogo-desde-pdf.spec.ts` siguen verdes.

## Tanda 3 — extremo a extremo, alcance y cierre

### T11 [ ] — E2E
Tras T9, T10. **Toca:** `e2e/formula-desde-pdf.spec.ts` (nuevo),
`tests/guards/guard-identificador-de-request.test.ts` (lista de E2E),
`tests/unit/shared/data-table-alcance.test.ts` (solo si el spec afirma filas de la tabla de fórmulas;
no previsto).
**Hacer:** `design.md > 10`, dos casos.
**Hecho cuando:** verde en Chromium y WebKit sin red, con los contadores de `PUT` interceptados como
ancla; limpieza por empresa en `try/finally` (**R39**; recorre también R1, R11, R12, R14, R17, R18, R19,
R25).

### T12 [ ] [P] — Guardia de alcance
Tras T5. **Toca:** `tests/unit/documentos/qc159-alcance.test.ts` (nuevo).
**Hacer:** las comprobaciones de la fila R35–R37 de `design.md > 16`.
**Hecho cuando:** verde, y rojo a mano al añadir una migración de prueba o una clave en castellano al
esquema de entrada (se prueba y se revierte) (**R35, R36, R37**).

### T13 [ ] [P] — Notas fechadas en specs afectados
Tras T5. **Toca:** `specs/QC-129-textos-definitivos-de-los-prompts/requirements.md` (nota: R11 se
enmienda con la forma de `design.md > 3` de QC-159), `specs/QC-158-catalogo-desde-pdf/requirements.md`
(nota: R2 superado en su primera mitad por QC-159; R3 intacto), `specs/QC-90-alta-del-primer-lote/requirements.md`
(nota, **solo si P1 se aprueba**: excepción de la materia prima desde la revisión de fórmula).
**Hacer:** notas fechadas al final de cada archivo, sin tocar sus tablas ni sus requisitos.
**Hecho cuando:** las tres notas enlazan a este spec; ninguna tabla de decisiones ajena cambió.

### T14 [ ] — Cierre
Tras todas. **Toca:** `progress/impl_QC-159-formula-desde-pdf.md`.
**Hecho cuando:** `./init.sh` verde; mapa `R1..R39 → test` completo con el test concreto de cada uno
(plan de `design.md > 16`); solapes con QC-168/QC-138 anotados con su resolución si alguna llegó a
`dev` antes.
