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

## Tanda 1 — T1, T2, T3 (backend_dev)

Preparacion del worktree (no versionada): `pnpm install --frozen-lockfile` (el worktree no tenia
`node_modules`; ninguna dependencia nueva, `package.json` y el lockfile sin cambios) y
`pnpm exec next typegen` (sin `.next/types`, `tsc` fallaba en `LayoutProps` de `app/layout.tsx`).

### T1 — migracion y esquema `recipe_tools` (`9f9b277b`)

- `db/schema.prisma`: `model RecipeTool` (`/// @module recetas`) y `tools RecipeTool[]` en `Recipe`.
- `db/migrations/20261003120000_recipe_tools/migration.sql` (nuevo): lo de Prisma + a mano la FK
  `recipe_tools_product_id_fkey` RESTRICT, el CHECK `recipe_tools_quantity_positive`, `ENABLE` +
  `FORCE ROW LEVEL SECURITY` sin policies.
- `db/migrations/20261003120000_recipe_tools/down.sql` (nuevo): `DROP TABLE IF EXISTS "recipe_tools"`.
- `tests/unit/recetas/schema/recipe-tools-migration.test.ts` (nuevo).
- `tests/guards/guard-identificador-de-request.test.ts`: alta de la migracion en la lista cerrada.
- `tests/guards/guard-empresa-en-esquema.test.ts`: `recipe_tools` en `EXENTAS`, lista literal a nueve y
  los bullets de prueba de R14 nombrandola.
- `docs/architecture.md`: bullet de exentas «ocho» -> «nueve», con `recipe_tools`.
- `tests/unit/recetas/schema/recetas-schema.test.ts`: los modelos de `recetas` pasan a ser
  `Recipe`, `RecipeLine`, `RecipeTool` (afirmaba la lista cerrada de dos).
- `tests/integration/aislamiento.json`: sin cambios en T1 (no hay test de integracion nuevo).

Base `QuimiCloude` (la del `.env`): `prisma validate` OK; `db:migrate` aplico `20261003120000_recipe_tools`;
`db:rollback` la revirtio (`prisma migrate diff` desde la base volvio a pedir `CREATE TABLE
"recipe_tools"`); `db:migrate` la reaplico; `prisma generate` regenerado. Comprobado en `pg_constraint`:
`recipe_tools_pkey`, `recipe_tools_product_id_fkey` (`ON UPDATE CASCADE ON DELETE RESTRICT`),
`recipe_tools_quantity_positive` (`CHECK ((quantity > 0))`), `recipe_tools_recipe_id_fkey`
(`ON DELETE CASCADE`); `relrowsecurity = relforcerowsecurity = true`. Datos de demo intactos (solo DDL
sobre la tabla nueva).

### T2 — contrato de herramientas (`a676c60e`)

- `lib/modules/recetas/domain/recipe-input.ts`: `MAX_TOOL_QUANTITY`, `recipeToolSchema` (`.strict()`),
  `recipeToolsSchema` (sin repetir producto), `RecipeToolInput`; `tools` en los cuatro esquemas
  (`.default([])` solo en el alta; `.optional()` en edicion, alta de version y edicion de version).
  `sinProductoRepetido` pasa a aceptar cualquier `{ productId }`.
- `lib/modules/recetas/index.ts`: exporta `recipeToolSchema`, `recipeToolsSchema`, `MAX_TOOL_QUANTITY`,
  `RecipeToolInput`.
- `tests/unit/recetas/recipe-input.test.ts`: casos nuevos al final.

### T3 — `propagateByProduct` / `propagateTools` (`2f5c818c`)

- `lib/modules/recetas/domain/recipe-version.ts`: `propagateByProduct<T>(before, after, version, same)`
  con el algoritmo de antes; `propagateLines` = `propagateByProduct(..., samePercentage)`;
  `propagateTools` = mismo con `quantity ===`. Generico en `T` porque `RecipeToolData` del puerto llega en T4.
- `lib/modules/recetas/index.ts`: exporta `propagateTools`.
- `tests/unit/recetas/recipe-version.test.ts`: los casos de `propagateLines` sin tocar; bloques nuevos
  `propagateTools` e `isVersionUnderReview no mira herramientas`.

### Mapa R<n> -> test (lo cubierto en esta tanda)

| R | Archivo | Caso |
|---|---|---|
| R1 | `tests/unit/recetas/recipe-input.test.ts` | `R1: acepta producto y cantidad entera positiva, hasta el tope de la columna`; `R1: el alta conserva las herramientas enviadas` |
| R1 | `tests/unit/recetas/schema/recipe-tools-migration.test.ts` | `R1: crea la tabla con cantidad entera NOT NULL y sin company_id`; `R1: la FK a la receta va en CASCADE y la de producto, escrita a mano, en RESTRICT` |
| R2 | `recipe-input.test.ts` | `R2, R18: el alta sin tools las deja vacias` |
| R4 | `recipe-input.test.ts` | `R4: rechaza dos herramientas con el mismo producto`; `R4, R6: los cuatro esquemas aplican la misma validacion de herramientas` |
| R4 | `recipe-tools-migration.test.ts` | `R4: una herramienta no se repite en la misma receta (unico compuesto) y el producto lleva indice` |
| R6 | `recipe-input.test.ts` | `R6: rechaza la cantidad %s` (0, -1, 1.5, '2'); `R6: rechaza la cantidad ausente y el producto ausente o que no es uuid` |
| R6 | `recipe-tools-migration.test.ts` | `R6: la base rechaza una cantidad no positiva con un CHECK` |
| R7 | `recipe-input.test.ts` | `R7: lineas al 100 % mas herramientas pasa; las herramientas no cuentan en la suma` |
| R7, R16 | `tests/unit/recetas/recipe-version.test.ts` | `R7, R16: solo recibe porcentajes de lineas: ...` |
| R11 | `recipe-input.test.ts` | `R11: el alta de version sin tools da undefined (copia de la original)` |
| R14 | `recipe-version.test.ts` | los ocho casos `R14: ...` de `propagateTools` |
| R17 | `recipe-input.test.ts` | `R17, R18: la edicion sin tools da undefined y con [] da [], distinguibles`; `R17: la edicion de version sin tools da undefined y con [] da []` |
| R18 | `recipe-input.test.ts` | `R2, R18: ...`; `R17, R18: ...` (la parte de esquema; la de import de PDF es T7) |
| R25 | `recipe-input.test.ts` | `R25: el issue de una fila invalida apunta a [tools, i, campo] dentro de la receta` (solo el `path` de zod; la UI es T10/T11) |

Parciales a proposito: R3, R5 (MACHINE / inexistente) son de dominio (T5); R11 y R17 se completan en T5;
R14 en persistencia en T4.

### Verificacion

- `pnpm run typecheck`: `tsc --noEmit` sin errores.
- `pnpm run lint`: `0 errors, 8 warnings`; ninguno en archivos de esta tanda (todos preexistentes,
  p. ej. `tests/unit/pedidos/order-service.test.ts`).
- Tests nuevos y guardias tocadas: `vitest run tests/unit/recetas/schema tests/guards/guard-empresa-en-esquema.test.ts
  tests/guards/guard-identificador-de-request.test.ts tests/guards/guard-rls-force.test.ts
  tests/guards/guard-arquitectura-modulos.test.ts tests/unit/inventario/scope.test.ts
  tests/unit/pedidos/schema/pedidos-schema.test.ts` -> `14 passed (14)`, `224 passed`.
  `recipe-input.test.ts` -> `48 passed`; `recipe-version.test.ts` -> `33 passed`.
- `vitest related --run recipe-input.ts recipe-version.ts index.ts` -> `Test Files 6 failed | 318 passed (324)`,
  `Tests 8 failed | 4952 passed | 2 skipped`. Los 6 archivos rojos estan todos en
  `tests/baseline-rojos.json` (deuda ajena): `configuracion-ui/unidades-viewport`,
  `configuracion-ui/usuarios-viewport`, `navegacion/pantallas-exigen-permiso`, `inventario/product-page`,
  `recetas-ui/recipe-page`, `recetas/module-contract`. Ninguno toca herramientas.

Veredicto: T0-T3 cerradas en verde; typecheck y lint limpios, sin rojos nuevos.

## Tanda contrato — tipos publicos para frontend en paralelo (backend_dev)

Contrato congelado en `specs/QC-194-herramientas-de-la-receta/contrato-back.md`.

- Tipos: `RecipeToolData`/`RecipeToolRow` y `tools` en `NewRecipe` (`| null`), `RecipeRow`,
  `NewRecipeVersion` (`ports/recipe-repository.ts`); `RecipeToolView` y `RecipeDetail.tools`
  (`recipe-view.ts`); `RecipeExecutionTool` y `RecipeExecutionContent.tools` (`recipe-catalog.ts`);
  `ExecutionToolView` y `AssignedOrderExecutionView.tools` (`asignaciones`). Exportados por los dos barrels.
- Implementacion minima: `RECIPE_INCLUDE` + `toRecipeRow` leen `tools` (real); `getRecipe` con un
  solo `findRefs` sobre lineas + herramientas (real); casos de uso pasan `tools` al puerto (`?? null`
  en edicion, copia de la original en alta de version) sin validar contra el catalogo (T5); el
  adaptador no las escribe (T4); `toRecipeExecutionContent` devuelve `tools: []` (T6);
  `getAssignedOrderExecution` las mapea con el mismo `findRefs` (T8 pone los tests).
- Dobles: `tools: []` (o `null` donde la edicion no las manda) en los listados de T0 punto 4, mas
  `company-scope`, `recipe-catalog`, `order-packing`, `create-order`, `update-order`,
  `review-blocked-orders` y la lista de claves de `get-assigned-order-execution`.
- Discrepancia con `design.md > 7`: el issue de producto repetido tiene `path: ['tools']`, no
  `['tools', i, ...]` (es un `refine` del array); va como error general del tab.

Verificacion: `pnpm run typecheck` limpio; `pnpm run lint` `0 errors, 8 warnings` (preexistentes);
`vitest run guard` `51 passed`; `vitest related --run <tocados>` -> solo rojos de
`tests/baseline-rojos.json` (`module-contract`, `recipe-page`, `product-page`, `pantallas-exigen-permiso`,
`unidades-viewport`, `usuarios-viewport`).

## Tanda 3 — UI (frontend_dev): T9-T12

Programado contra `contrato-back.md` (b95a1732); sin tocar `lib/` ni los tests de backend.

### Archivos por task

- **T9** (`6bbf580a`): `formulas/components/recipe-form-state.ts` (`RecipeToolFormValue`, `tools` en
  los dos estados y payloads, `toToolFormValues`, `extractToolErrors` con texto propio por `path`,
  `extractGeneralToolsError` para `['tools']`), `components/index.ts`, estado inicial en
  `recipe-form.tsx` / `recipe-version-form.tsx` (`RecipeVersionFormOriginal.tools`), las dos paginas
  de version pasan `original.tools`. Test nuevo `tests/unit/recetas-ui/recipe-form-state.test.ts`;
  ajustados `recipe-form-payload.test.ts`, `recipe-lines-unavailable.test.tsx`,
  `recipe-version-form.test.tsx` (fixtures con `tools`, y el payload de version pasa a ser
  `{ name, lines, tools }` porque el contrato exige mandar siempre la clave).
- **T10** (`cfff6243`): `recipe-lines-field.tsx` controlado (`tools`/`onToolsChange`/`toolErrors`/
  `toolsGeneralError`), campo de cantidad (`inputMode="numeric"`, solo digitos, `min-h-11`,
  `text-base`), cantidad `1` al elegir si estaba vacia, «Herramienta no disponible», error general
  del tab, se abre el tab Herramientas cuando solo ellas fallan; fuera `RecipeMachineFormValue` y los
  comentarios «UI-only». Test nuevo `recipe-lines-field-tools.test.tsx`; harness con `tools` en
  `recipe-lines-{baseline,no-finished-product,sum,tabs,unavailable}.test.tsx`.
- **T11** (`9dc540aa`): validacion previa y errores por fila en `recipe-form.tsx` y
  `recipe-version-form.tsx` (`RECIPE_TOOL_ERROR_MESSAGES`). Casos nuevos en `recipe-form.test.tsx`,
  `recipe-version-form.test.tsx`, `recipe-version-pages.test.tsx`.
- **T12** (`f035d9ff`): `asignacion/[id]/components/order-execution-tools.tsx` (nuevo), barrel y
  montaje en `order-execution-screen.tsx` entre lineas y `StepReader`. Test nuevo
  `tests/unit/asignaciones-ui/order-execution-tools.test.tsx`; fixture con `tools: []` en
  `order-execution-page.test.tsx`.

### Mapa R -> test (UI)

| R | Archivo | Caso |
|---|---|---|
| R20 | `tests/unit/recetas-ui/recipe-lines-field-tools.test.tsx` | `R20 — la de baja se pinta como no disponible, con su cantidad y el aviso del tab` |
| R22 | `recipe-form-state.test.ts` | `R22 — el estado inicial de edición sale de recipe.tools con nombre y cantidad, en orden` |
| R22 | `recipe-lines-field-tools.test.tsx` | `R22 — pinta nombre y cantidad de cada herramienta guardada` |
| R22 | `recipe-form.test.tsx` | `R22, R26 — la edición precarga las guardadas y las reenvía, incluida la no disponible` |
| R22 | `recipe-version-pages.test.tsx` | `R22: la pagina de una version pinta sus propias herramientas, no las de la original` |
| R23 | `recipe-form-state.test.ts` | `R23 — la precarga de alta de versión conserva la no disponible y vuelve al payload intacta` |
| R23 | `recipe-version-pages.test.tsx` | `R23: el alta de version precarga las herramientas de la original, incluida la no disponible` |
| R23 | `recipe-version-form.test.tsx` | `R23, R26 — el alta precarga las de la original y envía exactamente esas, incluida la no disponible` |
| R24 | `recipe-lines-field-tools.test.tsx` | `R24 — elegir una herramienta pone la cantidad en 1, editable`; `R24 — el selector no ofrece la herramienta ya elegida en otra fila`; `R24 — cambiar de herramienta no pisa la cantidad ya escrita` |
| R25 | `recipe-form-state.test.ts` | `R25 — fila sin herramienta: error de producto en su índice, con el texto propio`; `R25 — cantidad "" / "0": error de cantidad en su fila`; `R25 — nunca pinta el mensaje en inglés de zod` |
| R25 | `recipe-lines-field-tools.test.tsx` | `R25 — el error de cantidad se pinta en su fila y abre el tab de herramientas`; `R25 — el error de producto se pinta en el selector de su fila`; `R25 — la cantidad solo admite dígitos` |
| R25 | `recipe-form.test.tsx` | `R25 — cantidad "" / "0": no invoca la acción, pinta el error en la fila y conserva lo escrito`; `R25 — una fila sin herramienta no invoca la acción y el error sale en su fila` |
| R25 | `recipe-version-form.test.tsx` | `R25 — cantidad vacía: no invoca la acción y el error sale en su fila` |
| R26 | `recipe-form-state.test.ts` | `R26 — el payload lleva siempre la clave tools, también vacía, en los dos builders`; `R26 — cada herramienta viaja como { productId, quantity } con la cantidad entera, sin key ni nombre`; `R26 — la herramienta no disponible viaja tal cual, con su cantidad` |
| R26 | `recipe-lines-field-tools.test.tsx` | `R26 — añadir, cambiar y quitar herramientas no cambia la suma ni lo que falta` |
| R26 | `recipe-form.test.tsx` | `R26 — el alta envía exactamente las herramientas del tab, con cantidad entera`; `R26 — la edición sin herramientas manda tools vacío, no omite la clave` |
| R26 | `recipe-version-form.test.tsx` | `R26 — la edición envía las herramientas de la versión tras quitar una en el tab` |
| R27 | `recipe-form.test.tsx` | `R27 — un rechazo del servidor por las herramientas sale en la región de error sin navegar` |
| R27 | `recipe-version-form.test.tsx` | `R27 — un rechazo del servidor sale en la región de error sin navegar ni perder lo escrito` |
| R28 | `tests/unit/asignaciones-ui/order-execution-tools.test.tsx` | `R28 — pinta cada herramienta con su nombre y su cantidad`; `R28 — es de solo lectura: ni botones, ni enlaces, ni campos`; `R28 — la pantalla monta el bloque con las herramientas de la vista` |
| R29 | `order-execution-tools.test.tsx` | `R29 — la cantidad pintada es la de la receta, sea cual sea la del pedido` |
| R30 | `order-execution-tools.test.tsx` | `R30 — la de baja se lee «Herramienta no disponible» con su cantidad` |
| R31 | `order-execution-tools.test.tsx` | `R31 — sin herramientas el bloque no está en el DOM`; `R31 — la pantalla sin herramientas no monta el bloque` |
| R33 | `recipe-lines-field-tools.test.tsx` | `R33 — controles de al menos 44×44 px y campo de cantidad a 16 px` |
| R33 | `order-execution-tools.test.tsx` | `R33 — el texto del bloque va a 16 px` |

### Salida real

- `pnpm run typecheck`: limpio (0 errores).
- `pnpm run lint`: `0 errors, 8 warnings` (preexistentes, ninguno en archivos de esta tanda).
- `vitest run tests/unit/recetas-ui`: `Tests 2 failed | 438 passed (440)`. Rojos:
  `recipe-page.test.tsx` (baseline) y `recipe-route-contract.test.ts > la feature no toca
  lib/modules/recetas ni db/` (ver abajo).
- `vitest run tests/unit/asignaciones-ui`: `Test Files 22 passed`, `Tests 226 passed`.
- `vitest run tests/unit/pedidos-ui/order-form{,-quote}.test.tsx`: `Tests 71 passed`.
- `vitest related --run <archivos de UI tocados>`: `Tests 2 failed | 488 passed (490)`; los dos rojos
  (`recipe-page`, `pantallas-exigen-permiso`) estan en `tests/baseline-rojos.json`.

### Abierto para el leader

- `tests/unit/recetas-ui/recipe-route-contract.test.ts > la feature no toca lib/modules/recetas ni db/`
  se pone rojo en cuanto la rama toca la ruta de formulas y `lib/modules/recetas` a la vez:
  `create-recipe-version.ts`, `recipe-version.ts`, `update-recipe-version.ts` no estan en
  `RECETAS_PERMITIDAS` (y la migracion de `recipe_tools` probablemente tampoco en `DB_PERMITIDAS`).
  Es la lista de ampliaciones nombradas por ficha; hay que anadir la de QC-194. No lo toque: no es UI.
