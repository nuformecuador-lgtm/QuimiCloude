# QC-159 — formula-desde-pdf · design.md

> Decisiones técnicas para `requirements.md` (R1–R39). Medido el 2026-09-25 sobre el árbol del
> worktree `.worktrees/QC-159-formula-desde-pdf` (rama sacada de `origin/dev` en `942efdec`). El
> precedente es **QC-158** (`specs/QC-158-catalogo-desde-pdf/`): cada sección dice qué se reutiliza tal
> cual, qué se copia en forma y qué es propio de esta ficha.

## 0. Lo medido en el código

| Hecho | Dónde | Consecuencia para esta ficha |
|---|---|---|
| La cola guarda el texto de la IA **tal cual** en `document_files.extracted_text`; `readFileForReview(id, companyId)` devuelve `{status, strategy, extractedText}` o `null` | `ports/document-batch-repository.ts:39-59` (QC-158) | Se **reutiliza sin cambios**; solo se corrige su comentario, que habla de «catálogo». R3, R6. |
| `extractJsonObject(text)` ya existe y es dominio puro | `documentos/domain/json-in-text.ts` | Se reutiliza (R4). |
| El permiso del módulo es `DOCUMENT_UPLOAD_PERMISSION = 'documentos.modificar'` (QC-142), y la vista previa y la confirmación de QC-158 lo exigen | `documentos/domain/actor.ts:38`, `confirm-catalog-import.ts:107` | Esta ficha **no** lo usa para revisar: exige `recetas.modificar` (`> 8`, P2). |
| Los errores de otro módulo que atraviesan un caso de uso de `documentos` **no** los reconoce `createErrorStateTranslator(DocumentosError, …)`: salen como `unexpected_error` | `errores/domain/error-state.ts:142-167`, `catalog-import-actions.ts:36` | La acción traduce con **tres** traductores en cadena (`> 6.2`). No nace ningún código de error. |
| `createCreateRecipe` y `createUpdateRecipe` ya validan todo lo de la receta: `recetas.modificar` primero, esquema, productos vivos de la empresa, **rechazo de producto terminado** (`action_not_allowed`), suma exacta 100,00 %, sin producto repetido | `recetas/domain/create-recipe.ts`, `update-recipe.ts`, `recipe-input.ts:210-236` | Se **inyectan tal cual** desde `lib/composition` (`recetas.createRecipe`, `recetas.updateRecipe`). Nada de su validación se reescribe. |
| `updateRecipe` con `image` **omitido** conserva la imagen; `replaceAlive` concilia líneas y escribe en **una transacción** | `update-recipe.ts:104-140`, `ports/recipe-repository.ts:93-99` | Reemplazar = `updateRecipe(id, {name: <el de la receta>, description, steps, lines})` sin `image` (R18). |
| Unicidad de receta: índice parcial `recipes_company_name_unique (company_id, name_normalized) WHERE deleted_at IS NULL` | `20260916120000_recipes_company_scope/migration.sql:160` | Es el árbitro de R20 y de la doble confirmación (R28). |
| `recipe_lines` tiene `unique(recipe_id, product_id)` y el esquema rechaza producto repetido | `schema.prisma:470`, `recipe-input.ts:211-214` | Ingrediente repetido se **bloquea** en la revisión (R16); nunca llega a la base. |
| `RecipeCatalog` solo busca por id o por texto de búsqueda (incluidas las de baja) | `recetas/domain/recipe-catalog.ts` | Gana `findAliveByNormalizedName` (`> 5.2`). |
| El alta de producto **siempre** crea lote con presentación, existencia y costo; QC-90 lo cerró como decisión («el alta SIEMPRE crea lote») | `inventario/domain/create-product.ts`, `product-input.ts:188-231`, `specs/QC-90…/requirements.md:211` | Crear materia prima «con el nombre leído» choca con esa decisión: **P1** (`> 11.1`). |
| `ProductRepository.create(data, now, scope)` ya existe, crea un producto **sin lote** y ningún caso de uso lo llama | `ports/product-repository.ts:50`, `product-prisma.ts:75-93`, QC-121 `design.md:114-116` | La materia prima se escribe por ese método: **sin migración** (`> 5.3`). |
| `products.unit_id` es anulable (`NULL` = sin lotes) y `products.stock` tiene `DEFAULT 0`; QC-147 [D13] ya muestra y guarda una línea cuyo insumo no tiene unidad | `schema.prisma:281-282`, QC-147 `requirements.md:159` | Una receta con una materia prima recién creada se ve y se ejecuta como hoy con un insumo sin lotes. |
| El nombre de producto **no es único** (`normalizeProductName` no respalda unicidad) | `inventario/domain/product-name.ts:8-12` | La preselección exige **exactamente una** coincidencia (R11), y la reutilización también (R26). |
| Tipos manuales: `PRODUCT` («Producto»), `MACHINE` («Instrumento»), `PACKAGING` («Envase»); el alta de receta pide ingredientes de tipo `PRODUCT` | `product-type.ts:37-41`, `formulas/nueva/page.tsx:44-52`, `product-form.tsx:123` | «Materia prima» = `PRODUCT`. El selector de la revisión filtra `PRODUCT` como la pestaña de ingredientes. |
| Pasos: `RecipeStepsField` ya corrige, borra, añade y reordena (dnd-kit, teclado y anuncios) | `formulas/components/recipe-steps-field.tsx:105-136` | Se **reutiliza** en la revisión (R14). `ProductPicker` también (R12). |
| El listado de fórmulas monta `<DocumentUploadDialog strategy="formula" />` directo, sin `reviewHrefFor` | `formulas/page.tsx:49` | Nace el envoltorio de cliente `FormulaPdfUpload`, igual que `CatalogPdfUpload` (`> 6.3`). |
| La guardia de convenciones de la subida fija los **dos** puntos de montaje y que la única fuente de fórmulas que monta la pieza es `page.tsx` | `tests/unit/documentos-ui/document-upload-convenciones.test.ts:26-34, 188-198` | Se enmienda: el montaje de fórmulas pasa a `components/formula-pdf-upload.tsx` (`> 6.3`). |
| La IA de guion del E2E devuelve coordenadas si el prompt es el del recorte y **el catálogo** en cualquier otro caso; la fórmula se lee con una parte `pdf`, el catálogo con partes `image` | `ai-reader-canned.ts:81-84`, `ports/ai-reader.ts:14-16` | El doble distingue fórmula por la **forma de las partes**, sin leer entorno (`> 10`). |
| Listas cerradas afectadas | `guard-identificador-de-request.test.ts` (lista de E2E), `guard-pantallas-exigen-permiso.test.ts:222-240`, `session-once-per-request-actions.test.ts`, `documentos/module-contract.test.ts` (`EXPORTACIONES_DE_EJECUCION`), contratos de `inventario` y `recetas`, `tests/integration/aislamiento.json` | Altas en T11 (`tasks.md`). `guard-dobles-e2e.test.ts` **no** cambia: no nace ningún doble. |

## 1. Dónde vive cada pieza

```
documentos ──(barrel)──► recetas     (RecipeCatalog.findAliveByNormalizedName, createRecipe/updateRecipe inyectados,
    │                                  normalizeRecipeName, sumPercentages, PERCENTAGE_PATTERN, tipos de paso)
    ├─────(barrel)──► inventario  (ProductCatalog.findRefs, ProductNameLookup, createRawMaterial inyectado,
    │                                  normalizeProductName, PRODUCT_TYPES)
    └── orquesta: interpretar → revisar → confirmar
```

- **`documentos`** es dueño del **contrato con la IA** para `formula` (`> 3`), de las **reglas de la
  revisión** (`> 4`) y de la orquestación. Es el patrón que QC-158 dejó escrito para esta ficha
  (QC-158 `design.md > 1`): «documentos interpreta y delega la escritura al dueño del dato».
- **`recetas`** escribe la receta con sus dos casos de uso **existentes** y publica una búsqueda por
  nombre. No conoce `documentos`.
- **`inventario`** publica la búsqueda de productos por nombre y un caso de uso **nuevo** de alta de
  materia prima (`> 5.3`).
- Ni `recetas` ni `inventario` importan `documentos`. El cableado, solo en `lib/composition/index.ts`.

## 2. Modelo de datos

**Sin cambios.** Ni tabla, ni columna, ni migración, ni `down.sql`, ni RLS (R36). Todo lo que se
escribe cabe en lo que ya hay: `recipes`, `recipe_lines` y `products` (sin lote). La guardia
`guard-empresa-en-esquema` no cambia. No hace falta base propia de rama para migrar; los tests de
integración corren contra la base de tests de siempre.

## 3. Contrato JSON que acepta el sistema (R4, R7, R8, R9, R37)

Enmienda **R11 de QC-129** en la línea que ya decidió QC-157 (porcentaje en vez de cantidad). La forma
se fija aquí; el texto del prompt **no** (R37): el borrador de QC-157 fuera de git se ajusta a ella.

```json
{
  "name": "string | null",
  "description": "string | null",
  "ingredients": [
    {
      "name": "string | null",
      "percentage": "string | null",
      "quantity": "string | null",
      "unit": "string | null"
    }
  ] | null,
  "steps": ["string"] | null
}
```

- `percentage` es lo que se guarda (tras revisar). `quantity` y `unit` son **solo referencia**: si el
  PDF trae cantidades y no porcentajes, la IA debe dejar `percentage` en `null` (QC-129 R13: no
  deducir) y devolver lo leído en `quantity`/`unit`; la pantalla lo enseña al lado (R8) y **no** lo
  convierte. Motivo: pasar de cantidades a porcentaje exige sumar magnitudes, y entre familias
  distintas (L frente a kg) eso es la aproximación sin densidad que QC-147 aceptó solo para el
  consumo, no para escribir una fórmula. Si el humano quiere un «calcular porcentajes» cuando todas
  las cantidades comparten unidad, es ficha propia.
- `steps`: una cadena por paso, en orden. Los saltos de línea dentro de la cadena separan párrafos.
- Sin `image`: la fórmula no recorta (R35, [D8]).

### 3.1 Interpretación tolerante (`documentos/domain/formula-extraction.ts`)

Mismo algoritmo en forma que `catalog-extraction.ts` (QC-158 `> 3.1`), en un archivo propio porque los
campos no se parecen:

1. `extractJsonObject(text)` (`json-in-text.ts`) → `JSON.parse`. Sin objeto o error de parseo → R5.
2. Raíz: objeto; `ingredients` y `steps` listas, `null` o ausentes (= `null` = cero). Otro tipo → R5.
3. `name`, `description`: cadena recortada, vacía → `null`; otro tipo → `null` (R4).
4. Cada elemento de `ingredients` se valida **campo a campo** con zod no estricto y `catch(null)`: un
   tipo que no encaja queda en `null` y el ingrediente sobrevive. Un elemento que no es objeto se
   descarta; uno con `name`, `percentage`, `quantity` y `unit` todos vacíos, también (no aporta nada
   que revisar).
5. **Porcentaje (R7):** `readPercentage(raw: unknown): { value: string | null; read: string | null }`.
   - cadena: recortar, quitar un `%` final, si hay **una** coma y ningún punto cambiarla por punto;
   - número JSON (P3): `Number.isFinite(n)` y `String(n)` sin exponente → esa cadena;
   - la cadena resultante vale si casa con `PERCENTAGE_PATTERN` (barrel de `recetas`) y
     `percentageToHundredths` da `> 0` y `<= 10000`. Si vale → `value`; si no → `value: null`.
   - `read` es siempre el valor leído tal cual (cadena, o `String(n)`), para mostrarlo al lado (R7).
   - **Nunca se redondea**: `33.333` llega vacío con «leído: 33.333».
6. `quantity`, `unit`: cadena recortada o `null`; un número JSON en `quantity` → `String(n)` (es solo
   texto de referencia, no se guarda ni se calcula con él).
7. **Pasos (R9)** — `stepTextToDocument(text)` en `documentos/domain/formula-step-text.ts`: partir por
   `\r?\n`, recortar cada línea, descartar las vacías; cada línea no vacía es
   `{ kind: 'paragraph', spans: [{ text: línea }] }`. Cero líneas → el paso se descarta. No se
   interpretan viñetas ni negritas: el revisor tiene el editor completo (R14).
8. Resultado `FormulaExtraction = { name, description, ingredients: ExtractedIngredient[], steps:
   RecipeStepDocument[] }`. La validez de negocio (largos, límites de pasos, suma) **no** se decide
   aquí: se decide en `> 4`, para poder mostrar el valor y decir qué falla.

El texto de guion del E2E (`> 10`) vive en el adaptador doble; el dominio no exporta ningún ejemplo.

## 4. Reglas de la revisión (`documentos/domain/review-formula-import.ts`)

Función **pura** y exportada por el barrel —la usan el servidor (vista previa y confirmación) y la
pantalla (para habilitar «Confirmar» sin ir y volver)—:

```ts
reviewFormulaImport(draft: FormulaDraft): FormulaReviewIssues

type FormulaDraft = {
  name: string; description: string | null;
  lines: readonly DraftLine[];
  steps: readonly RecipeStepDocument[];
};
type DraftLine =
  | { kind: 'existing'; productId: string; percentage: string | null }
  | { kind: 'new'; newProductName: string; percentage: string | null }
  | { kind: 'unassigned'; percentage: string | null };

type FormulaReviewIssues = {
  total: string;                        // sumPercentages(...).total, formateable
  isComplete: boolean;                  // suma exacta 100,00 %
  noLines: boolean;
  rows: readonly { index: number; problems: readonly RowProblem[] }[];  // solo las que tienen
  name: 'ok' | 'empty' | 'too_long' | 'normalizes_empty';
  description: 'ok' | 'too_long';
  steps: 'ok' | 'too_many' | 'invalid';  // recipeStepSchema por paso + tope 50
  canConfirm: boolean;                   // sin choque: el choque lo añade quien llama (> 5.1)
};
type RowProblem = 'unassigned' | 'percentage_missing' | 'percentage_invalid'
                | 'new_name_invalid' | 'repeated';
```

- Validación **reutilizada**, no reescrita: `createRecipeSchema.shape.name` / `.description`,
  `recipeStepSchema` y `MAX_STEP_ELEMENTS` (barrel de `recetas`), `sumPercentages` y
  `PERCENTAGE_PATTERN` para el porcentaje. El nombre de materia prima nueva: 1..200 tras recortar, como
  `productNameSchema` de `inventario` (se publica `PRODUCT_NAME_MAX_LENGTH = 200` en su barrel en vez
  de copiar el número).
- **Repetidas (R16):** clave `existing:<productId>` o `new:<normalizeProductName(name)>`; toda fila con
  clave compartida lleva `repeated`. No se suman ni se fusionan: el revisor quita una fila y corrige el
  porcentaje de la otra. Sumarlas en silencio escondería que el PDF nombra dos veces un ingrediente,
  que suele ser una lectura mala.
- La unicidad cruzada «una materia prima nueva cuyo nombre ya es de un producto que otra fila eligió»
  no se puede ver en el navegador sin buscar; la cierra el servidor (`> 5.1`, paso 6).

## 5. Casos de uso, puertos e interfaces

### 5.1 `documentos`

```ts
// domain/formula-import-input.ts (zod, publicado por el barrel)
previewFormulaImportInputSchema = z.object({
  documentFileId: z.string().uuid(),
  name: z.string().max(1000).optional(),        // presente = solo recomprobar el choque (R17)
});
confirmFormulaImportInputSchema = z.object({
  documentFileId: z.string().uuid(),
  name: z.string(), description: z.string().nullable(),
  lines: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('existing'), productId: z.string().uuid(), percentage: z.string() }).strict(),
    z.object({ kind: z.literal('new'), newProductName: z.string(), percentage: z.string() }).strict(),
  ])).max(200),
  steps: z.array(z.unknown()).max(50),           // se valida con recipeStepSchema dentro
  replaceRecipeId: z.string().uuid().nullable(), // null = crear; id = reemplazar ESA (R17, R20)
}).strict();

createPreviewFormulaImport(deps)(actor, input): Promise<FormulaImportPreview>
createConfirmFormulaImport(deps)(actor, input): Promise<FormulaImportSummary>

type FormulaImportPreview = {
  name: string | null; description: string | null;
  ingredients: readonly {
    readName: string | null;
    percentage: string | null; percentageRead: string | null;   // R7
    quantityRead: string | null; unitRead: string | null;       // R8
    match: { kind: 'one'; productId: string; productName: string; unitId: string | null }
         | { kind: 'none' } | { kind: 'several'; count: number };  // R11
  }[];
  steps: readonly RecipeStepDocument[];
  nameClash: { recipeId: string; recipeName: string } | null;   // R17
};
type FormulaImportSummary = {
  recipeId: string; outcome: 'created' | 'replaced';
  rawMaterialsCreated: number; rawMaterialsReused: number;       // R29
};
```

Orden fijo (R30, R3, R33, R23, R27):

1. `requirePermission(actor, FORMULA_IMPORT_PERMISSION)` — **primera línea**.
   `FORMULA_IMPORT_PERMISSION: PermissionCode = 'recetas.modificar'` en `documentos/domain/actor.ts`,
   escrita una vez (P2).
2. `safeParse` de la entrada → `ValidationError`.
3. `repository.readFileForReview(documentFileId, actor.companyId)`; `null`, estado ≠ `done` o
   estrategia ≠ `formula` ⇒ **el mismo** `ValidationError` (R3).
4. **Vista previa:** interpretar (`> 3.1`) → `productNames.findAliveByNormalizedNames(nombres leídos)`
   → `match` por fila (exactamente uno no terminado ⇒ `one`) → `recipes.findAliveByNormalizedName(
   input.name ?? extraído.name)` → `nameClash`. Termina aquí: **no escribe** (R10).
5. **Confirmación:** la confirmación **no** reinterpreta el texto (lo revisado manda), pero sí exige el
   paso 3 (R23). `reviewFormulaImport(draft)`; `unassigned` no existe en la entrada de confirmar. Si no
   `canConfirm` ⇒ `ValidationError` con el motivo por fila en el **diagnóstico** (patrón de QC-158
   `design.md > 16`, nota «Motivo por fila»).
6. Productos elegidos: `products.findRefs(ids, companyId)`: falta alguno ⇒ `ValidationError`; alguno
   `FINISHED_PRODUCT` ⇒ `ActionNotAllowedError` de `recetas` (R24). Materias primas nuevas:
   `productNames.findAliveByNormalizedNames(nuevos)`, por nombre: 0 ⇒ crear; 1 no terminado ⇒
   reutilizar (R26); más de 1 ⇒ `ValidationError` (R26); si el reutilizado coincide con un
   `productId` de otra fila ⇒ `ValidationError` (repetida, R16).
7. Choque: `recipes.findAliveByNormalizedName(name)`.
   - hay receta viva y `replaceRecipeId` es `null` o distinto ⇒ `RecipeDuplicateNameError` (R20);
   - `replaceRecipeId` no nulo y no hay receta viva con ese nombre ⇒ si el id sigue vivo con otro
     nombre, `ValidationError`; si no, `RecipeNotFoundError` (R20). Para distinguirlo basta
     `recipes.findRefsIncludingDeleted([replaceRecipeId])` (ya existe).
8. Si hay alguna materia prima que **crear**: `assertPermission(actor, 'inventario.modificar')` vía el
   barrel de `identity` ⇒ `UnauthorizedError` (R31), **antes** de escribir nada (R27). Mismo patrón que
   QC-158 `confirm-catalog-import.ts:176-178`.
9. Crear las materias primas (`createRawMaterial`, `> 5.3`), en el orden de las filas, una por nombre
   normalizado.
10. Escribir la receta: `createRecipe({ name, description, steps, lines })` o
    `updateRecipe(replaceRecipeId, { name: <nombre vivo de esa receta>, description, steps, lines })`
    **sin** `image` (R18, R19). Sus errores (`RecetasError`) se propagan tal cual.
11. Devolver el resumen.

Dependencias inyectadas (`FormulaImportDeps`): `repository` (puerto existente), `recipes:
RecipeCatalog`, `products: ProductCatalog`, `productNames: ProductNameLookup`, `createRawMaterial`,
`createRecipe`, `updateRecipe`. **Ningún error nuevo**, ni en `documentos/domain/errors.ts` ni en
`lib/modules/errores`: `ActionNotAllowedError` (paso 6), `RecipeDuplicateNameError` y
`RecipeNotFoundError` (paso 7) se importan del **barrel de `recetas`**, que ya los publica, y los
traduce la acción (`> 6.2`). El paso 6 existe aunque `createRecipe` vuelva a rechazar el producto
terminado en el paso 10: sirve para rechazar **antes** de crear materias primas (R27).

### 5.2 `recetas`

`RecipeCatalog` gana:

```ts
/** La receta VIVA de esa empresa cuyo nombre normalizado es el de `name`, o `null`. Normaliza
 *  con `normalizeRecipeName` (la misma que escribe la columna); `name` que normaliza a '' ⇒ null. */
findAliveByNormalizedName(name: string, companyId: string): Promise<{ id: RecipeId; name: string } | null>;
```

Adaptador en `recipe-catalog-prisma.ts` (`findFirst` por `company_id`, `name_normalized`,
`deleted_at IS NULL`; el índice único parcial lo cubre). Sin actor, como el resto de `RecipeCatalog`:
el permiso ya lo comprobó `documentos`, y este servicio solo lee.

### 5.3 `inventario`

- **`ProductNameLookup`** (interfaz **nueva**, `domain/product-name-lookup.ts`), y no un método más en
  `ProductCatalog`: QC-168 T9 añade un método a `product-catalog.ts` y así no se pisan (`> 13`).

  ```ts
  interface ProductNameLookup {
    /** Productos VIVOS de esa empresa cuyo `name_normalized` está entre los de `names` (normalizados
     *  aquí con `normalizeProductName`). Incluye terminados, con su `type`: filtrar es de quien llama. */
    findAliveByNormalizedNames(names: readonly string[], companyId: string)
      : Promise<readonly { id: string; name: string; nameNormalized: string; type: ProductType; unitId: string | null }[]>;
  }
  ```
  Adaptador en `product-catalog-prisma.ts` (no en `product-prisma.ts`, que toca QC-168).
- **`createCreateRawMaterial(deps)(input, actor): Promise<{ id: string }>`** (caso de uso **nuevo**,
  `domain/create-raw-material.ts`), P1:
  - `requirePermission(actor, 'inventario.modificar')` primera línea;
  - `z.strictObject({ name: productNameSchema })` (se exporta `productNameSchema` desde
    `product-input.ts` en vez de copiarlo);
  - `deps.products.create({ name, type: PRODUCT_TYPES.PRODUCT, qtyAlert: null }, now(), scope)`: el
    método de puerto que ya existe. Sin lote, sin unidad, `stock` 0 por el `DEFAULT` (R25).
  - No mira homónimos: eso lo decide `documentos` antes (R26). No toca `createCreateProduct`, que sigue
    creando siempre su lote (QC-90 intacto para el alta manual).
- Barrel: `ProductNameLookup` (tipo), `createCreateRawMaterial`, `productNameSchema`,
  `PRODUCT_NAME_MAX_LENGTH`.

## 6. Rutas, acciones y pantalla

### 6.1 Ruta

`/produccion/formulas/importar/[documentoId]` — helper `formulaImportRoute(documentFileId)` en
`lib/shared/routes.ts`, derivado de `FORMULAS_ROUTE`. El segmento estático `importar` gana al dinámico
`[id]` de la ficha de receta (regla de Next), y un id de receta es un UUID, así que no hay ambigüedad.

`page.tsx` (Server Component): `requirePagePermission('recetas.consultar')` y
`requirePagePermission('recetas.modificar')` (R32; precedente de dos llamadas: QC-158 y
`/configuracion/unidades`). Se aparta a propósito del criterio de `formulas/nueva` («solo
`consultar`»): la revisión no tiene uso de solo lectura y muestra el contenido de un documento. Después,
en paralelo: `previewFormulaImportAction({ documentFileId })`, `listUnitsAction()` y
`listProductsAction({ page: 1, pageSize: MAX_PAGE_SIZE, filters: { type: PRODUCT } })` — lo mismo que
pide `formulas/nueva/page.tsx` para `ProductPicker`.

### 6.2 Server Actions — `lib/modules/documentos/adapters/driving/formula-import-actions.ts`

`previewFormulaImportAction(input)` y `confirmFormulaImportAction(input)`, copia en forma de
`catalog-import-actions.ts`: entrada validada **antes** de resolver el actor (QC-158 `> 16`, primera
nota), actor de las dos caras de la sesión en un `runInRequestScope`. Errores: tres traductores
`createErrorStateTranslator` (con `DocumentosError`, `RecetasError` e `InventarioError`) probados en ese
orden —el primero cuya clase base reconozca el error lo traduce; si ninguno, el de `documentos` lo
convierte en `unexpected_error` como hoy—. La confirmación termina con `revalidatePath(FORMULAS_ROUTE)`
y `revalidatePath(recipeEditRoute(id))`. Alta en `session-once-per-request-actions.test.ts`.

### 6.3 El acceso desde la ventana de subida (R1)

- `app/(private)/produccion/formulas/components/formula-pdf-upload.tsx` (`'use client'`): renderiza
  `<DocumentUploadDialog strategy="formula" reviewHrefFor={formulaImportRoute} />`. Es el mismo
  envoltorio que `CatalogPdfUpload` y por la misma razón: una función no cruza del Server Component al
  cliente. `DocumentUploadDialog` y `DocumentUpload` **no cambian** (la prop ya existe, QC-158/QC-160).
- `formulas/page.tsx`: `{canUpload ? <FormulaPdfUpload /> : null}`; sigue llamando a
  `canUploadDocuments` (R34).
- Enmienda de `document-upload-convenciones.test.ts`: `MONTAJES_PERMITIDOS` pasa a
  `[formulas/components/formula-pdf-upload.tsx, proveedores/[id]/components/catalog-pdf-upload.tsx]`, y
  «la única fuente de fórmulas que monta la pieza» pasa a ser ese envoltorio. `PAGINAS_QUE_MONTAN` (las
  que llaman a `canUploadDocuments`) no cambia. El motivo se escribe en el test.
- **QC-158 R2** («SI formula ENTONCES no ofrecer revisión ni convertir su texto») queda **superado**
  por esta ficha en su primera mitad: la fórmula tiene revisión, pero en **su** pantalla. La pantalla
  del catálogo sigue rechazando un archivo `formula` (QC-158 R3, sin cambios), y sin `reviewHrefFor`
  la fila sigue sin enlace (el test `document-upload-review-link.test.tsx` no cambia).

### 6.4 Componentes de la pantalla

`app/(private)/produccion/formulas/importar/[documentoId]/components/` con su `index.ts`:

- `formula-import-review.tsx` (cliente): estado controlado —nombre, descripción, filas, pasos y la
  elección ante el choque—; llama a `reviewFormulaImport` en cada cambio (R10, R15) y pinta la suma con
  `formatPercentage`. «Confirmar» deshabilitado mientras `!canConfirm`, mientras haya choque sin
  elegir, o mientras haya una comprobación de nombre en vuelo.
- `formula-ingredient-row.tsx`: nombre leído, porcentaje (`inputMode="decimal"`), «leído: …» (R7,
  R8), producto asignado con tres modos —preseleccionado, **elegir** (`ProductPicker` de
  `../../../components`, tipo `PRODUCT`), **crear materia prima** (campo de nombre precargado con el
  leído)— y **Quitar**. Botón «Añadir ingrediente» al final (R12).
- `formula-name-clash.tsx`: aviso con el nombre de la receta existente y dos opciones, **Reemplazar**
  o **Cambiar el nombre** (R17). Texto del aviso: «Ya existe la fórmula «X». Reemplazarla cambia sus
  ingredientes, pasos y descripción; los pedidos que la usan no cambian su coste guardado.» (R21, `> 7.3`).
  Al perder el foco el nombre se llama a `previewFormulaImportAction({ documentFileId, name })` con
  `useTransition` y se actualiza `nameClash` (R17).
- Pasos: `RecipeStepsField` de `../../../components` tal cual (R14).
- `formula-import-summary.tsx`: resumen de R29 y navegación a `recipeEditRoute(recipeId)`.
- Estado de error: `invalid_input` de la vista previa (R3, R5) pinta «No se pudo abrir esta revisión»
  sin datos, con enlace de vuelta al listado.
- Una **lista de tarjetas** por ingrediente, no `DataTable`, por la misma razón que QC-158 `> 6.3`.
  Objetivos ≥ 44 px, letra ≥ 16 px (`text-base`), sin acciones solo con `:hover` (R38).
- Importar desde `../../../components` (el barrel de fórmulas) respeta la regla «los componentes se
  importan solo desde el barrel»; T0 comprueba que ninguna guardia de fórmulas lo prohíba.

## 7. Escritura, atomicidad, idempotencia y efecto en pedidos

### 7.1 Atomicidad

- **Receta, en una transacción**, la de `recetas`: `create` inserta receta y líneas juntas;
  `replaceAlive` concilia líneas y actualiza la receta juntas (R18, R19). No se escribe nada de la
  receta fuera de esos dos métodos.
- **Materias primas, antes y fuera** de esa transacción: `inventario` tiene su propio adaptador y no hay
  unidad de trabajo entre módulos (mismo límite que QC-158 `> 8`). **Limitación declarada (R27):** si la
  receta falla después —carrera con otra alta del mismo nombre, o la receta que se iba a reemplazar se
  borró entre el paso 7 y el 10—, las materias primas creadas **se quedan**. Mitigaciones: todo lo
  rechazable se comprueba antes (pasos 2–8), y la siguiente confirmación las **reutiliza** por R26 en
  vez de duplicarlas.

### 7.2 Doble confirmación (R28, P4)

Sin marcar el archivo, como QC-158 (`> 8`, «Reconfirmar»):

| Segunda confirmación | Qué pasa | Estado final |
|---|---|---|
| Receta **nueva** (`replaceRecipeId: null`) | el paso 7 ve la receta que creó la primera ⇒ `recipe_duplicate_name` antes de escribir | igual que tras la primera |
| **Reemplazar** | reescribe el mismo contenido sobre la misma receta | igual (salvo `updated_at`/`updated_by`) |
| Materias primas | el paso 6 encuentra exactamente una con ese nombre ⇒ la reutiliza | ninguna duplicada |
| Dos confirmaciones **simultáneas** de receta nueva | el índice único parcial deja pasar una; la otra recibe `recipe_duplicate_name` de `recetas` | una receta; las materias primas de la perdedora pueden quedar **una vez** duplicadas si las dos llegaron al paso 9 a la vez (no hay índice único de nombre de producto, QC-14 decisión 6) |

La última fila es el único agujero, y es la carrera de dos clics simultáneos: la pantalla deshabilita
«Confirmar» mientras la acción está en vuelo, que es lo que la hace improbable. Cerrarla del todo
exigiría una unicidad de nombre de producto que QC-14 descartó, o marcar el archivo (P4).

### 7.3 Reemplazar y los pedidos (R21)

Reemplazar es **exactamente** editar la receta desde `/produccion/formulas/[id]`, con el mismo caso de
uso, así que su efecto es el que ya tiene editarla, y esta ficha no añade ninguno:

- **Coste del pedido**: se guarda y se recalcula **solo al editar el pedido** (QC-123,
  `docs/architecture.md > Preguntas abiertas del dominio`, punto 4). Reemplazar no lo toca.
- **Reservas de material** (QC-141): se calcularon con las líneas de entonces; reemplazar no reserva ni
  libera nada.
- **Ejecución** (QC-63) y consumo al finalizar (QC-150): leen el contenido **actual** de la receta
  (`RecipeCatalog.findExecutionContentById`). Un pedido que aún no se ha ejecutado se ejecutará con la
  fórmula reemplazada, igual que si se hubiera editado a mano. Por eso el aviso de choque lo dice
  (`> 6.4`). Congelar la fórmula por pedido sería una ficha de pedidos, no de importación.

## 8. Permisos

| Operación | Comprobación | Dónde |
|---|---|---|
| Abrir la pantalla | `recetas.consultar` + `recetas.modificar` → 404 | `page.tsx` (R32) |
| Vista previa / confirmar | `recetas.modificar`, primera línea (P2) | `documentos` (R30) |
| Escribir la receta | `recetas.modificar` | `recetas.createRecipe` / `updateRecipe` (defensa en profundidad) |
| Crear materia prima | `inventario.modificar`, antes de escribir nada | `documentos` paso 8 (R31) y `createRawMaterial` |
| Subir | `documentos.modificar` | sin cambios (QC-142, QC-160; R34) |

## 9. Empresa (R33)

Cada lectura lleva `actor.companyId`: `readFileForReview`, `findAliveByNormalizedName`,
`findAliveByNormalizedNames`, `findRefs`, `findRefsIncludingDeleted`; las escrituras la toman del actor
dentro de `recetas` e `inventario`. Un producto o una receta de otra empresa no vuelve de ninguna
búsqueda ⇒ `invalid_input` / sin choque / `recipe_not_found`, igual que si no existiera. La FK de
`recipe_lines.product_id` no garantiza empresa; la garantiza `findRefs` acotado (como hoy en el alta).

## 10. E2E sin red (R39)

Patrón de QC-107/QC-158: dobles solo con `DOCUMENTS_E2E_DOUBLES`, ya activos en `playwright.config.ts`.

| Puerto | Hoy en E2E | Cambio |
|---|---|---|
| `AiReader` | `readCannedText`: coordenadas si el prompt es el del recorte, catálogo si no | Tercer caso: si **todas** las partes son `kind: 'pdf'` (lectura por texto = fórmula) devuelve `CANNED_FORMULA_TEXT`, con la forma de `> 3`. No mira el prompt ni el entorno. Exporta las constantes del guion. |
| `DocumentStorage`, cola, `CropStorage`, `CropCatalog` | dobles existentes | Sin cambios. La fórmula no recorta. |

Guion (`CANNED_FORMULA_*`, prefijo `guion-e2e-formula`): nombre fijo; tres ingredientes —uno con el
nombre de un producto que el spec siembra (preselección), uno que no existe (materia prima nueva, 60 %)
y uno con `percentage: null`, `quantity: "250"`, `unit: "g"` (vacío + referencia)—, y tres pasos, uno
de ellos de dos líneas.

- Spec **`e2e/formula-desde-pdf.spec.ts`** (nuevo). Fixture `qc159_e2e_` + `RUN_ID`: empresa propia,
  Administrador sembrado (tiene `documentos.modificar`, `recetas.*` e `inventario.modificar`), el
  producto preseleccionable, y una receta viva con el nombre del guion. Dos casos (R39): **reemplazar**
  y **renombrar**. Afirma en base: mismo `recipes.id` y líneas nuevas (reemplazar), receta nueva y la
  sembrada intacta (renombrar), materia prima con `type = PRODUCT`, `unit_id IS NULL` y **cero** filas en
  `product_batches`. Afirma en pantalla la ficha de la receta. Limpieza `try/finally` por empresa.
- `e2e/documentos.spec.ts` (QC-160 R17, sube dos fórmulas y espera `done`) sigue verde: ahora la IA de
  guion devuelve JSON de fórmula en vez del de catálogo, y el caso no mira el texto.
- Listas cerradas: `guard-identificador-de-request.test.ts` (lista de E2E) gana
  `formula-desde-pdf.spec.ts`; `data-table-alcance.test.ts` solo si el spec afirma filas del listado de
  fórmulas (no está previsto: se afirma en la ficha). `guard-dobles-e2e.test.ts` sin cambios.

## 11. Preguntas de F1.4 (aprobadas)

### 11.1 P1 — Materia prima sin lote (R25)
**Aprobada 2026-09-25 (F1.4)**, con la propuesta tal cual.
**Choque medido:** QC-90 cerró «el alta SIEMPRE crea lote» y [D4] pide crear el ingrediente «con el
nombre leído», sin presentación ni costo, que el lote exige.
**Propuesta:** excepción **acotada a esta revisión**: `createRawMaterial` crea un `PRODUCT` sin lote,
sin unidad, existencia 0 y sin cantidad de alerta, por el método de puerto que ya existe. El alta
manual de inventario sigue creando siempre su lote. Coherente con lo que ya soporta el sistema (QC-121
R8/R23 y QC-147 [D13]: producto sin lotes = existencia 0 y sin unidad). Efecto aceptado: editar ese
producto desde inventario pedirá rellenar la cantidad de alerta (su esquema de edición la exige).
**Alternativa:** exigir en la revisión presentación, costo y existencia para crear el primer lote —
reutiliza el alta tal cual, pero convierte la revisión de una fórmula en un alta de inventario y obliga
a inventar un costo—. **Afecta a:** R25, T3, T8.

### 11.2 P2 — Permiso de la vista previa (R30)
**Aprobada 2026-09-25 (F1.4)**, con la propuesta tal cual.
**Propuesta:** `recetas.modificar` (el mismo que confirmar) y **no** `documentos.modificar`. Motivo:
[D9] fija confirmar en recetas; exigir además el de documentos impediría revisar a quien no sube, y
revisar es trabajo de recetas. **Alternativa:** exigir los dos, como QC-158 (que exige
`documentos.modificar`). **Afecta a:** R30, T5.

### 11.3 P3 — Porcentaje como número JSON (R7)
**Aprobada 2026-09-25 (F1.4)**, con la propuesta tal cual.
**Propuesta:** aceptarlo si `String(n)` casa con `PERCENTAGE_PATTERN`. Con hasta 5 cifras
significativas el número de coma flotante vuelve **exactamente** a su literal decimal (el `toString`
de JS da el más corto que se relee igual), así que no se pierde nada; lo que no cabe llega vacío con
«leído: …». QC-158 R35 trató el costo numérico como vacío porque `DECIMAL(14,4)` sí puede perder
cifras. **Alternativa:** vacío siempre, como QC-158 — más uniforme, pero un modelo que escriba `12.5`
en vez de `"12.5"` obligaría a teclear todos los porcentajes. **Afecta a:** R7, T4.

### 11.4 P4 — Bloquear la segunda confirmación (R28)
**Aprobada 2026-09-25 (F1.4)**, con la propuesta tal cual.
**Propuesta:** no marcar el archivo (`> 7.2`), como QC-158. **Alternativa:** columna
`document_files.imported_at` (migración + `down.sql`) y rechazo de la segunda: cierra la carrera de dos
clics, pero impide volver a importar el mismo PDF tras borrar la receta, y mete en `documentos` un
estado de negocio de `recetas`. **Afecta a:** R28, T5; con la alternativa, una task de migración más.

## 12. Alternativas descartadas

**A. Orquestar en `recetas`.** Es donde vive la receta, y `recetas` ya importa `inventario`. Descartada:
tendría que leer `document_files` (tabla de `documentos`) o importar `documentos`, y dejaría dos
patrones distintos para «importar desde PDF» (catálogo en `documentos`, fórmula en `recetas`). QC-158
fijó a propósito el reparto contrario (`design.md > 1`).

**B. Crear las materias primas dentro de la transacción de la receta** (un adaptador que escriba
`products` y `recipes` a la vez). Cerraría la limitación de `> 7.1`. Descartada: un adaptador de un
módulo escribiendo la tabla de otro rompe «se comparten servicios vía interfaz, nunca tablas»
(`docs/architecture.md > Dominio`, punto 2), y no hay unidad de trabajo entre módulos en el repo.

**C. Fusionar automáticamente los ingredientes repetidos** sumando porcentajes. Descartada: el PDF que
nombra dos veces el mismo ingrediente suele ser una lectura mala o dos ingredientes distintos con nombre
parecido; sumar en silencio lo escondería. Quitar una fila cuesta un toque (R16).

**D. Reemplazar con una operación nueva de `recetas` («sustituir contenido, conservar nombre e
imagen»).** Descartada: `updateRecipe` con `image` omitido ya hace exactamente eso, con su validación
y su transacción. Una segunda puerta de escritura sería otra validación que mantener.

**E. Reutilizar la pantalla de alta/edición (`RecipeForm`) precargada con lo leído.** Parecía barato.
Descartada: no sabe mostrar lo leído al lado, ni crear productos, ni el choque de nombre, y su
payload exige `productId` en todas las líneas. Se reutilizan sus piezas (`RecipeStepsField`,
`ProductPicker`), no el formulario.

## 13. Solapes de archivos con otras ramas

### 13.1 QC-168 (`estado-por-empacar`, en curso) — medido en su `tasks.md`

| Archivo | QC-168 | Esta ficha | Resolución |
|---|---|---|---|
| `lib/composition/index.ts` | T8, T9, T10 (bloques de `pedidos`, `inventario`, `asignaciones`) | bloque de `documentos` + cableado de `productNameLookup` y `createRawMaterial` | Bloques distintos; unión al rebasar. |
| `lib/shared/routes.ts` | T11: `packingOrderRoute`, `PACKED_ORDER_PARAM` | `formulaImportRoute` | Añadidos en zonas distintas; unión. |
| `tests/guards/guard-pantallas-exigen-permiso.test.ts` | T13 (su pantalla de empaque) | `/produccion/formulas/importar/[documentoId]` | Lista cerrada: **conflicto seguro**, unión. |
| `tests/guards/guard-identificador-de-request.test.ts` | T15 (`empaque.spec.ts`) y migraciones de T1/T4 | `formula-desde-pdf.spec.ts` (sin migraciones) | Lista cerrada: **conflicto seguro**, unión. |
| `tests/unit/identity/session-once-per-request-actions.test.ts` | T11 (acciones de empaque) | `formula-import-actions.ts` | Lista cerrada: unión. |
| `tests/integration/aislamiento.json` | T1, T4, T8, T9 | tests de aislamiento de T3, T4 y T6 | Registro: unión. |
| `lib/modules/inventario/domain/product-catalog.ts`, `…/product-prisma.ts` | T9 | **no se tocan** (interfaz nueva `ProductNameLookup` en archivo propio; adaptador en `product-catalog-prisma.ts`) | Sin solape, por diseño. |

Ningún archivo de `pedidos`, `asignaciones`, `identity` (código) ni `errores` en esta ficha.

### 13.2 QC-138 (`estado-bloqueado`, aprobado, espera)

Comparte `lib/composition/index.ts` y `lib/modules/inventario/index.ts` (barrel: ella exporta un
oyente de existencias; esta, `createCreateRawMaterial`, `ProductNameLookup`, `productNameSchema`,
`PRODUCT_NAME_MAX_LENGTH`). Unión. No toca `create-product.ts` (QC-138 sí): esta ficha deja ese archivo
intacto y solo **exporta** `productNameSchema` desde `product-input.ts`, que QC-138 no toca.

## 14. Riesgos

- **Materias primas huérfanas** si la receta falla tras crearlas (`> 7.1`), y duplicado posible en la
  carrera de dos clics simultáneos (`> 7.2`).
- **Ejecución con la fórmula reemplazada** de pedidos aún no ejecutados (`> 7.3`): es el efecto de
  editar la receta, no uno nuevo; queda dicho en el aviso.
- **Tope de 1 MB de la Server Action**: una fórmula son decenas de líneas y pasos; muy por debajo.
- **P1** es la decisión con más alcance (aprobada 2026-09-25, F1.4): la materia prima sin lote es una
  excepción a QC-90 limitada a esta revisión.

## 15. Dependencias

**Ninguna nueva.** `zod`, `@dnd-kit/*` (dentro de `RecipeStepsField`), `@base-ui/react` ya aprobadas en
`docs/dependencias.md`. No se toca `package.json`.

## 16. Plan de trazabilidad (R → test)

| R | Test previsto |
|---|---|
| R1 | `tests/unit/documentos-ui/formula-pdf-upload.test.tsx`; `formulas-upload.test.tsx` (sigue verde) |
| R2 | `tests/unit/recetas-ui/formula-import-page.test.tsx` (misma respuesta en dos renders) + E2E |
| R3, R33 | `tests/unit/documentos/preview-formula-import.test.ts`; `tests/integration/documentos/formula-import.int.test.ts` (aislamiento) |
| R4, R5, R6, R7, R8, R9 | `tests/unit/documentos/formula-extraction.test.ts`, `formula-step-text.test.ts` |
| R10, R11 | `preview-formula-import.test.ts`; `tests/integration/inventario/product-name-lookup.int.test.ts` |
| R12, R13, R14, R15, R16 | `tests/unit/documentos/review-formula-import.test.ts`; `tests/unit/recetas-ui/formula-import-review.test.tsx` |
| R17 | `preview-formula-import.test.ts` (choque con y sin `name`); `formula-import-review.test.tsx`; `tests/integration/recetas/recipe-catalog-by-name.int.test.ts` |
| R18, R19, R20, R22, R23, R24, R26, R27 | `tests/unit/documentos/confirm-formula-import.test.ts`; `formula-import.int.test.ts` |
| R21 | `formula-import.int.test.ts`: un pedido con coste guardado sobre la receta; tras reemplazar, `orders` idéntico fila a fila |
| R25 | `tests/unit/inventario/create-raw-material.test.ts`; `tests/integration/inventario/create-raw-material.int.test.ts` (sin filas en `product_batches`, `unit_id` nulo, `stock` 0) |
| R28 | `confirm-formula-import.test.ts` (tres filas de `> 7.2`) y `formula-import.int.test.ts` (dos confirmaciones reales) |
| R29 | `formula-import-review.test.tsx` (resumen y navegación) |
| R30, R31 | `tests/unit/documentos/formula-import-authorization.test.ts` (ningún puerto tocado sin permiso) |
| R32 | `guard-pantallas-exigen-permiso.test.ts` (alta) + `formula-import-page.test.tsx` |
| R34 | `formulas-upload.test.tsx` y `document-upload-convenciones.test.ts` (enmendado, sigue exigiendo `canUploadDocuments`) |
| R35, R36, R37 | `tests/unit/documentos/qc159-alcance.test.ts`: el diff no añade migraciones ni toca `db/schema.prisma`; ninguna fuente de la ficha nombra `crop`/`recorte`; las claves del JSON y de los esquemas nuevos son `[a-zA-Z]+` en inglés (lista cerrada); ningún archivo bajo `borradores-de-prompts/`; `FORMULA_PROMPT` solo se lee en `strategy-prompt-env.ts`; el texto de guion del doble se parsea **entero** como JSON (no puede llevar instrucciones) — mismo enfoque que QC-158 R36 |
| R38 | `formula-import-review.test.tsx` (clases de tamaño, sin `hover:` como única vía) + E2E en WebKit |
| R39 | `e2e/formula-desde-pdf.spec.ts` (Chromium y WebKit) |
