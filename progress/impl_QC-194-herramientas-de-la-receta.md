# QC-194 — herramientas-de-la-receta · bitacora de implementacion

## T0 — medicion

Medido sobre la rama `feature/QC-194-herramientas-de-la-receta` en `7d4c3420`. El MCP del grafo no se
uso en esta tanda: la medicion se hizo con grep/sed sobre el arbol del worktree.

### 1. Filas de `design.md > 0`

| Fila | Estado | Donde esta hoy |
|---|---|---|
| Tab «Herramientas» solo de pantalla | OK, corrimiento | `recipe-lines-field.tsx:64-73` (tipo), `:156` (doc «UI-only»), `:203` (`useState` de `machines`), `:278-316`, `:554-630` |
| `RecipeMachineFormValue` sin cantidad | OK | `recipe-lines-field.tsx:69-73` |
| `buildRecipePayload` sin herramientas | OK, corrimiento | `recipe-form-state.ts:149-175` |
| 4 paginas cargan `initialMachinePage` (MACHINE) | OK, corrimiento | `nueva/page.tsx:46-60,100`, `[id]/page.tsx:163`, `[id]/versiones/nueva/page.tsx:129`, `[id]/versiones/[versionId]/page.tsx:146` |
| Esquemas de entrada | OK | `recipe-input.ts:250-292` (`createRecipeSchema` 250, `updateRecipeSchema` 268, `createRecipeVersionSchema` 284, `updateRecipeVersionSchema` 289) |
| Edicion valida solo productos nuevos | OK | `update-recipe.ts:99-106`, `update-recipe-version.ts:49` |
| `image` omitida = no tocar | OK | `update-recipe.ts:112-113` |
| Alta de version copia y revalida lineas | OK | `create-recipe-version.ts:51` |
| `propagateLines` | OK, corrimiento | `recipe-version.ts:38-63` (helpers privados `byProduct`/`sameLine` en `:24-31`) |
| Escritura con propagacion en una transaccion | OK | `recipe-prisma.ts:573-653` |
| `replaceAliveRecipe` | OK | `recipe-prisma.ts:409-460` (`updateMany` :418, `recipeLine.deleteMany` :433, `upsert` :441) |
| `findExecutionContentByIdOn` solo `lines` | OK | `recipe-catalog-prisma.ts:190-209` (select :204); tipo `recipe-catalog.ts:85-91` |
| Lectores de `content.lines` | OK | `create-order.ts:160`, `update-order.ts:151`, `review-blocked-orders.ts:124`, `transition-order.ts:72`, `resolve-ingredients-cost.ts:30` |
| Pantalla del operador | OK, corrimiento | `get-assigned-order-execution.ts:75` (`findRefs`), vista `assigned-order-execution-view.ts:18-32`, pantalla `order-execution-screen.tsx:87-90` |
| Import de PDF sin `image` | OK, corrimiento | `confirm-formula-import.ts:184-195` |
| `recipe_lines` unica exenta de receta | OK | `guard-empresa-en-esquema.test.ts:94`, `:261-277`; `docs/architecture.md:33-41` |
| Lista cerrada de migraciones | OK, corrimiento | `guard-identificador-de-request.test.ts:285-416` |
| Ultima migracion | OK | `20261001170100_orders_blocked_index` (igual en `dev` y en `origin/dev`); `20261003120000_recipe_tools` sigue siendo posterior, no se sube |
| `PRODUCT_TYPES.MACHINE` | OK | `product-type.ts:12-17`; `update-recipe.ts:104` lee `ref.type` |

Ninguna fila cambia el diseno: solo corrimientos de linea.

### 2. Que pide una tabla nueva de `recetas`

- **`tests/integration/aislamiento.json`**: no enumera tablas, enumera archivos `*.int.test.ts`. T1 no
  crea tests de integracion, asi que T1 no lo toca. T4 (`recetas/recipe-tools.int.test.ts`) y T6
  (`pedidos/order-reservation-tools.int.test.ts`) tendran que darse de alta (en `commit`, con motivo y
  desde, porque los adaptadores usan el cliente Prisma global y abren su propia `$transaction`, igual
  que `recetas/recipe-versions-repository.int.test.ts`). La limpieza de los tests existentes borra
  recetas y confia en el `ON DELETE CASCADE`: `recipe_tools` cae igual con su FK CASCADE.
- **`guard-ambito-empresa-recetas.test.ts:520-680`**:
  - el barrido de parametro exime solo a `replaceAliveRecipe` por nombre (`:539`); toda otra `function`
    que toque la base (`TOCA_LA_BASE`, `:237`, casa con `tx.recipeTool.x(`) tiene que declarar
    `scope: RecipeScope` y llevarlo a `./company-scope`.
  - el describe estructural de `replaceAliveRecipe` (`:570-690`) busca `tx.recipeLine.*`; para
    `tx.recipeTool.*` hay que anadir: dentro de la `$transaction`, despues del `updateMany` acotado y de
    su `count === 0`, `recipeId: id` y sin `companyId` en `deleteMany`/`upsert`. `violacionesDeTransaccion`
    (`:739-756`) prohibe `prisma.recipe(?:Line)?.` y habria que ampliarlo a `recipeTool`.
  - **Aviso para T4 (no afecta a T1-T3):** el helper `replaceToolsOn(tx, recipeId, tools)` de
    `design.md > 4` seria una `function` que toca la base sin `scope` y el barrido la pondria en rojo
    («NO hay lista de excepciones»). Hoy las lineas no tienen helper: van en linea dentro de cada
    funcion. T4 debe o escribir las herramientas en linea igual que las lineas, o hacer que el helper
    reciba `scope` y lo consuma, o pactar con el leader una exencion estructural como la de
    `replaceAliveRecipe`.
- Otros tests de esquema que enumeran modelos de `recetas`: `tests/unit/recetas/schema/recetas-schema.test.ts`
  (`:447` exige `['Recipe', 'RecipeLine']`, `:267` cuenta campos escalares de `Recipe`). Se ajustan en T1.

### 3. Selector paginado de herramientas (R24)

Si filtra por MACHINE y por vivos en todas las paginas, no solo en la primera:
- `recipe-lines-field.tsx:584` pasa `productType={PRODUCT_TYPES.MACHINE}` al `ProductPicker`.
- `product-picker.tsx:186-192`: busqueda y paginas siguientes llaman a `listProductsAction` con
  `filters: { type: { kind: 'select', values: [productType] } }` (filtro en servidor).
- `product-prisma.ts:255-274` (`buildProductWhere`, usado por `listAliveProducts` `:281`) mete
  `deletedAt: null` y el ambito de empresa en el `where`.

### 4. Tests que se pondran rojos por los campos nuevos

- `RecipeRow`: `tests/unit/recetas/{authorization,company-isolation-service,company-scope,create-recipe-version,get-recipe,list-recipe-versions,recipe-image-lifecycle,recipe-image-url,recipe-lines-catalog,recipe-service,recipe-step-contract,update-recipe,update-recipe-version}.test.ts`
- `NewRecipe`: `tests/integration/documentos/formula-import.int.test.ts`, `tests/integration/recetas/{company-scope-queries,recipe-catalog-by-name,recipe-crud,recipe-lines,recipe-versions-repository}.int.test.ts`, `tests/unit/recetas/{company-isolation-service,recipe-image-lifecycle,recipe-image-url,recipe-service,update-recipe,update-recipe-version}.test.ts`
- `RecipeDetail`: `tests/unit/pedidos-ui/{order-form,order-form-quote}.test.tsx`, `tests/unit/recetas/{recipe-catalog,recipe-step-contract}.test.ts`, `tests/unit/recetas-ui/{recipe-form,recipe-form-propagation,recipe-version-form,recipe-version-pages}.test.tsx`
- `RecipeExecutionContent`: `tests/unit/asignaciones/{get-assigned-order-execution,start-assigned-order}.test.ts`, `tests/unit/pedidos/resolve-ingredients-cost.test.ts`
- `AssignedOrderExecutionView`: `tests/unit/asignaciones/get-assigned-order-execution.test.ts`, `tests/unit/asignaciones-ui/order-execution-screen.test.tsx`
- monta `RecipeLinesField`: `tests/unit/recetas-ui/{recipe-form-payload.test.ts,recipe-lines-baseline,recipe-lines-no-finished-product,recipe-lines-sum,recipe-lines-tabs,recipe-lines-unavailable}.test.tsx`

(Busqueda por nombre de tipo con `grep -rlw`; un test que construya el objeto sin nombrar el tipo no
aparece aqui.)
