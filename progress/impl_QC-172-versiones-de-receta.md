# QC-172 versiones-de-receta — bitácora de implementación

## T0 — medicion

Medido el 2026-10-01 en `feature/QC-172-versiones-de-receta` (HEAD `c20426d6`), con Grep/Read/git.
No se ha tocado ningún archivo de producción ni de tests. No se ha corrido la suite.
El grafo (`codebase-memory-mcp`) no se ha usado: el design ya dejó constancia de que este worktree no
tiene índice.

### 1. Filas de `design.md > 0` contra el árbol

`origin/dev` (`81f1cd8e`) es ancestro de HEAD y `git diff --stat HEAD...origin/dev` sale vacío, así
que desde que se escribió el design no ha entrado nada de `dev`. Las 21 filas siguen siendo correctas:

| Fila | Estado | Comprobado en |
|---|---|---|
| `model Recipe` sin relación consigo misma | OK | `db/schema.prisma:434-453` |
| `model RecipeLine` | OK | `db/schema.prisma:460-473` |
| CHECK `recipe_lines_percentage_range` / suma 100 en zod | OK | `20260922160000_recipe_lines_percentage/migration.sql:33-34`; `recipe-input.ts:227-229` (`superRefine` + `sumPercentages` + `isComplete`) |
| Esa migración vacía `recipe_lines` | OK | misma migración `:13` (`DELETE FROM "recipe_lines";`) |
| `recipes_company_name_unique` | OK | `20260916120000_recipes_company_scope/migration.sql:160-162`; `RAISE` del patrón en `:146-149` |
| `isUniqueNameViolation` mira `meta.target` ⊇ `name_normalized` | OK | `recipe-prisma.ts:136,155-164` |
| `RECIPE_TOTAL_PERCENTAGE`, `sumPercentages` | OK | `recipe-percentage.ts:10,48-61` |
| `RecipeRepository`: 5 métodos, `scope` al final | OK | `ports/recipe-repository.ts:73-106` |
| `RecipeCatalog` (4 métodos) y `RecipeRef {id,name,isDeleted}` | OK | `domain/recipe-catalog.ts:13-17, 24-62` |
| `replaceAliveRecipe` (una `$transaction`) | OK | `recipe-prisma.ts:385-436` (`$transaction` en `:393`) |
| `softDeleteAliveRecipe` (un `updateMany`) | OK | `recipe-prisma.ts:441-452` |
| `buildRecipeWhere` | OK | `recipe-prisma.ts:316-328` |
| Alta exige receta viva | OK | `create-order.ts:108-109` |
| Edición: solo estados no finales; receta viva solo si cambia | OK | `update-order.ts:89` (`assertTransition(row.status,row.status)`), `:95-98` |
| Coste/necesidad con `findExecutionContentById` | OK | `create-order.ts:117-145` (`:144`), `update-order.ts:116-141` (`:141`), `resolve-ingredients-cost.ts:29` |
| Finalizar: `recipeRef.name` → nombre del producto terminado | OK | `transition-order.ts:91,111,131-132`; `product-prisma.ts:1003,1013`; `20260924190100_finished_products_and_content_copies/migration.sql:32-34` |
| Asignaciones: nombre y pasos del catálogo | OK | `get-assigned-order-execution.ts:67-69`; `compose-order-rows.ts:41` |
| Importación de fórmula: `findAliveByNormalizedName` | OK | `confirm-formula-import.ts:155`; `preview-formula-import.ts:145` |
| Formulario de pedido | OK | `order-form.tsx:35,138,364,442-455,606-612`; `recipe-picker.tsx:62,79` |
| Permisos de recetas | OK | `identity/domain/permissions.ts:74-84` |

Además, los números de §6.3: `get-order.ts:93-102` OK; `list-orders.ts:157-160` va un poco
desplazado. Lo real es `findRefsIncludingDeleted` en `:160`, el `Map` id→nombre en `:162` y
`toOrderView` en `:176`.

### 2. Tests que se ven afectados al ampliar tipos y constantes

**`RecipeRef`: 16 archivos.**

a) Tipados como `RecipeRef`: al ganar campos obligatorios, typecheck rojo (7 archivos)
- `tests/unit/asignaciones/list-assigned-orders.test.ts:54-55` (`receta(): RecipeRef`)
- `tests/unit/asignaciones/list-company-orders.test.ts:53-54`
- `tests/unit/asignaciones/list-finished-orders.test.ts:53-54`
- `tests/unit/pedidos/create-order.test.ts:71-73`
- `tests/unit/pedidos/update-order.test.ts:69-71`
- `tests/unit/pedidos/list-orders.test.ts:60-65`
- `tests/unit/pedidos/order-service.test.ts:52-55`

b) Dobles sin tipar o con `as unknown as`: el typecheck no los marca, pero el dominio nuevo leería
`isUnderReview`/`original` como `undefined` (7 archivos)
- `tests/unit/pedidos/company-isolation-service.test.ts:180-181`
- `tests/unit/pedidos/company-scope.test.ts:186-187`
- `tests/unit/pedidos/create-order.test.ts:656`. Es el mismo archivo que en a), así que no suma.
- `tests/unit/pedidos/transition-order.test.ts:63-64`
- `tests/unit/pedidos/quote-order-cost.test.ts:98` (`{ id, isDeleted }`, sin `name`)
- `tests/unit/documentos/confirm-formula-import.test.ts:74,336,362`
- `tests/unit/asignaciones/get-packing-order.test.ts:53` (`{ id, name }`, sin `isDeleted`)
- `tests/unit/asignaciones/list-packing-orders.test.ts:63` (`{ id, name }`, sin `isDeleted`)

c) Forma exacta con `toEqual` o regex sobre el fuente (2 archivos)
- `tests/unit/recetas/recipe-catalog.test.ts:89-90,121,125-129,150-153`
- `tests/integration/recetas/company-scope-queries.int.test.ts:473`

Hay otros 31 archivos que mencionan `findRefsIncludingDeleted` pero no construyen ningún `RecipeRef`
con campos. Son mocks `async () => []` (p. ej. `formula-import-authorization.test.ts:52-55` y
`resolve-ingredients-cost.test.ts:34`), mocks que lanzan error o integración contra la base. Por eso
no se cuentan.

**`RecipeRow`: 7 archivos, todos en `tests/unit/recetas/`.** Si `original` es obligatorio, typecheck rojo.
- `authorization.test.ts:116`
- `company-isolation-service.test.ts:82,122`
- `company-scope.test.ts:71`. Va con `as unknown as`, así que el typecheck no lo marca.
- `recipe-image-lifecycle.test.ts:36`
- `recipe-image-url.test.ts:97,122`
- `recipe-lines-catalog.test.ts:44`
- `recipe-service.test.ts:50` (y los spreads de `:306,505,565`)

`recipe-step-contract.test.ts` solo lo nombra en un comentario.

**`RecipeDetail`: 3 archivos con fixture tipado y 1 de contrato.**
- `tests/unit/pedidos-ui/order-form.test.tsx:187`
- `tests/unit/pedidos-ui/order-form-quote.test.tsx:153`
- `tests/unit/recetas-ui/recipe-form.test.tsx:225`. Es UI de recetas y no está en ninguna task.
- `tests/unit/recetas/recipe-catalog.test.ts:421` solo lista el nombre exportado y no cambia.

**`OrderView` / `OrderSummary` (alias): 16 archivos.**
- Fixtures tipados `pedido(): OrderSummary`, que con `recipeVersion` obligatorio dan typecheck rojo
  (14 archivos):
  - `tests/unit/pedidos-ui/cancel-order-dialog.test.tsx:72`
  - `delete-order-dialog.test.tsx:70`
  - `order-columns.test.tsx:71`
  - `order-form.test.tsx:204`
  - `order-form-quote.test.tsx:170`
  - `order-list-section.test.tsx:207`
  - `order-row-actions.test.tsx:52`
  - `order-row-wiring.test.tsx:104`
  - `order-sheet.test.tsx:219`
  - `order-sheet-coverage.test.tsx:115`
  - `order-sheet-responsibles.test.tsx:157`
  - `order-table.test.tsx:95`
  - `pedidos-viewport.test.tsx:286`
  - `read-only.test.tsx:181`
- `toEqual` exacto de la vista: `tests/unit/pedidos/order-service.test.ts:302-312` (`createGetOrder`).
- Firma de `toOrderView`: `tests/unit/pedidos/company-scope.test.ts:166` pasa
  `new Map([[RECETA, 'Acido citrico 50%']])`, que es id→nombre. Al pasar a `Map` de `RecipeRef`, se
  rompe.
- `tests/unit/pedidos/order-view.test.ts:105-110` comprueba por tipo qué campos declara
  `OrderView`/`OrderRow`. Sigue verde, pero si se quiere fijar `recipeVersion` el sitio es ese.
- `pedidos-convenciones.test.ts` y `clientes-convenciones.test.ts` solo usan el nombre en cadenas y
  no cambian.

**`buildRecipeWhere`: 0 tests.** Ningún test lo importa ni compara su `where` con `toEqual`. A
`listAliveRecipes` solo lo llaman tests de integración contra Postgres, que miran comportamiento y no
la forma: `company-scope-queries.int.test.ts:244-302`, `recipe-crud.int.test.ts`,
`list-query-recipes.int.test.ts`, `documentos/formula-import.int.test.ts:39,90`.

**`ORDER_BUSINESS_FIELDS`: 3 archivos.**
- `tests/unit/pedidos-ui/order-form.test.tsx:291,507` (recorre la lista)
- `tests/unit/pedidos-ui/order-form-quote.test.tsx:380,392`: `toEqual` de las claves del `FormData`
  contra la lista. Si se añade `recipeVersionId`, el `input` oculto tiene que viajar siempre.
- `tests/guards/guard-pantalla-pedidos-se-amplia.test.ts:166` solo exige que el símbolo exista.

### 3. ¿Algún test compara la definición literal de `recipes_company_name_unique`?

Literal contra la migración nueva, ninguno. Pero **dos aserciones de integración leen `indexdef` de
`pg_indexes` y se pondrán rojas** con el índice nuevo. Postgres lo devolverá como
`... WHERE ((deleted_at IS NULL) AND (parent_recipe_id IS NULL))`, y la regex
`/WHERE \(deleted_at IS NULL\)/` deja de casar porque detrás de `WHERE ` aparecen dos paréntesis:
- `tests/integration/inventario/list-query-indexes.int.test.ts:376`
- `tests/integration/recetas/company-scope.int.test.ts:598`

No cambian:
- `company-scope.int.test.ts:532`. `indicesUnicosDeRecipesSobre` compara las columnas exactas
  (`:419-436`) y el índice de versiones va sobre `(parent_recipe_id, name_normalized)`.
- `company-scope.int.test.ts:263,800-840`. Ejecuta el `down.sql` de `recipes_company_scope` sobre el
  esquema vivo y compara índices filtrando por nombre. `recipes_version_name_unique` está antes y
  después, así que en principio no cambia, pero T1 tiene que confirmarlo corriéndolo.
- `tests/unit/recetas/schema/recipes-company-scope-migration.test.ts:233,386,398,583`. Lee el texto
  de la migración antigua, que no se toca.
- `list-query-indexes.int.test.ts:270-277`. Solo exige que existan los 35 índices de `ALL_INDEXES`;
  no es un censo cerrado, así que un índice nuevo no lo pone rojo.

### 4. `SelectField` (`order-form.tsx:748`) y `disabled`

`SelectField` **no** admite `disabled`: sus props (`order-form.tsx:733-741`) son `name`, `label`,
`defaultValue`, `options`, `triggerTestId`, `optionTestId` y `error`. Por debajo usa `Select` de
`components/ui/select.tsx:9`, que es `SelectPrimitive.Root` de `@base-ui/react` (`^1.7.0`), y ese sí
acepta `disabled` (`node_modules/@base-ui/react/select/root/SelectRoot.d.ts:51`). Con `disabled`,
base-ui marca también su `input` oculto como `disabled` (`SelectRoot.js:389,444`), así que el campo
no viaja en el `FormData`. Esto confirma lo que dice el design: hace falta un `input` oculto propio
`recipeVersionId`. Uso recomendado: el `Select`/`SelectTrigger`/`SelectContent`/`SelectItem` de
`components/ui/select.tsx` directamente en `recipe-version-select.tsx`, en modo controlado
(`value`/`onValueChange`) y sin `name`, con el `input` oculto aparte. No hace falta ninguna primitiva
nueva.

### 5. Cómo llega el `FormData` al caso de uso (`order-actions.ts`)

`lib/modules/pedidos/adapters/driving/order-actions.ts`:
- `readFormString(formData, name)` (`:145-148`) devuelve `''` si el campo falta o no es una cadena.
- `readOptionalFormString` (`:157-160`) devuelve `undefined` si falta. Hoy solo lo usa `priority`.
- `buildCreateCandidate` (`:164-171`) arma el objeto `unknown` con `recipeId`, `quantity`, `priority`
  y `presentationId`, y `buildUpdateCandidate` (`:178-180`) lo reutiliza tal cual.
- `createOrderAction` (`:183-198`) y `updateOrderAction(id, …)` (`:201-215`) le pasan ese candidato a
  `pedidos.createOrder`/`updateOrder`, que validan con zod dentro del caso de uso.

Para `recipeVersionId` basta una línea más en `buildCreateCandidate`, y la edición la hereda.
`readFormString` encaja con el `z.preprocess('' → null)` de §6.1, porque el campo ausente llega como
`''` y acaba en `null`.

### 6. Formato de `session-once-per-request-actions.test.ts`

`tests/unit/identity/session-once-per-request-actions.test.ts:165` declara
`const ACCIONES: readonly { archivo: string; nombre: string; invocar: () => Promise<unknown> }[]`,
con 22 entradas. Cada una tiene:
- `archivo`: ruta relativa del `driving`
- `nombre`: nombre de la acción
- `invocar`: un import dinámico con la llamada

Por ejemplo, la de recetas (`:296-303`) es
`{ archivo: 'lib/modules/recetas/adapters/driving/recipe-actions.ts', nombre: 'listRecipesAction', invocar: async () => (await import('@/lib/modules/recetas/adapters/driving/recipe-actions')).listRecipesAction({ page: 1 }) }`.

El censo va **por archivo**. El caso R15 (`:434-444`) busca en disco los archivos de `driving/` que
contienen `identity.getSessionUser()` e `identity.getSessionContext()` (`:390-428`) y exige que su
`archivo` esté en `ACCIONES`. `describe.each(ACCIONES)` (`:457`) comprueba con cada fila que la sesión
se lee una sola vez.

### 7. QC-170, QC-164 y QC-173 en `dev`

`git fetch origin dev` hecho. `origin/dev` = `81f1cd8e`, ancestro de HEAD;
`git log HEAD..origin/dev` y `git diff --stat HEAD...origin/dev` salen vacíos. En `dev` no ha entrado
código de ninguna de las tres. Los últimos 30 commits de `origin/dev` no las mencionan. En el
historial solo aparecen como commits de board: `092cf8ba` (nacen QC-172/173/174), `3a2b02b1` y
`fd44c387` (QC-170) y `7e2b6cfe` (QC-164 acotada).

| Ficha | `feature_list.json` | Rama | Archivos en común con QC-172 |
|---|---|---|---|
| QC-170 pedido-en-varias-presentaciones | `pending`, zona fullstack | `feature/QC-170-…`, local `45b68785` (26 commits por delante de `dev`, 204 archivos) y remota `957cd9ec`, sin mergear | Producción: `order-form.tsx`, `order-actions.ts`, `create-order.ts`, `update-order.ts`, `get-order.ts`, `list-orders.ts`, `order-view.ts`, `order-input.ts`, `transition-order.ts`, `pedidos/domain/errors.ts`, `errores/domain/{error-codes,error-catalog}.ts`, `db/schema.prisma`. Tests: `pedidos-ui/{order-form,order-form-quote}.test.tsx`, `pedidos/{create-order,update-order,list-orders,order-service,order-view,company-scope,quote-order-cost,order-actions}.test.ts` |
| QC-164 unidad-del-pedido | `pending`, zona fullstack | Ni local ni remota. Solo existe `specs/QC-164-unidad-del-pedido/requirements.md` | Ninguno todavía |
| QC-173 fases-en-los-pasos | `pending`, zona fullstack | Ni local ni remota, sin spec en disco | Ninguno todavía |

QC-170 sigue en `pending` en el disco, pero su rama tiene trabajo de implementación. Su último
commit remoto es «implementer rebotado por cuota…». Choca con QC-172 en casi todo `pedidos` y en
`errores`. El que mergee segundo hereda el conflicto.

### Discrepancias con design.md

1. **§10, fila `RecipeRef`.** La lista del design no es la real (detalle en el punto 2):
   - `get-assigned-order-execution.test.ts` sobra: construye `RecipeExecutionContent`, que no cambia,
     y su doble de `findRefsIncludingDeleted` lanza error.
   - Faltan los tres `asignaciones/list-{assigned,company,finished}-orders.test.ts`, tipados como
     `RecipeRef`, y además `get-packing-order.test.ts` y `list-packing-orders.test.ts`.
   - Total: 16 archivos, de los que 7 dan typecheck rojo.
   - T6 dice `tests/unit/{pedidos,asignaciones,documentos}/`, que sí los abarca.
2. **§10, fila `buildRecipeWhere`/`listAliveRecipes` con `toEqual`.** No existe ningún test así (0).
   T4 no tiene nada que actualizar ahí.
3. **§10, fila de índices.** El design dice «si comparan la definición literal». Ninguno compara un
   literal, pero sí se rompen dos regex sobre `indexdef`:
   - `list-query-indexes.int.test.ts:376`
   - `company-scope.int.test.ts:598`

   Las dos entran en T1. Hay que tener en cuenta que `list-query-indexes.int` es de `inventario`,
   fuera de los archivos que §10 asigna a recetas.
4. **§10, fila `session-once-per-request-actions`.** El test **no** se pone rojo con las tres acciones
   nuevas. Van en `recipe-actions.ts`, que ya está en el censo (`:297`), y el censo es por archivo.
   Que T7 añada filas a `ACCIONES` es opcional, solo para cubrirlas en `describe.each`; no es un
   arreglo obligatorio.
5. **§10, fila `OrderView`.** Con `recipeVersion` obligatorio:
   - Dan typecheck rojo 14 tests de UI (`tests/unit/pedidos-ui/*`, lista en el punto 2) además de los
     de dominio. T9 solo lista tests de dominio y T11 solo `order-form{,-quote}`, así que hay 12
     archivos de UI sin task que los cubra.
   - Tampoco está asignado `tests/unit/pedidos/company-scope.test.ts:166`, que cambia por la firma de
     `toOrderView`.
   - El `toEqual` exacto está en `order-service.test.ts:302`, que no figura en T9.
6. **§3.3 / `RecipeDetail`.** `tests/unit/recetas-ui/recipe-form.test.tsx:225` construye un
   `RecipeDetail` tipado y ninguna task lo cubre.
7. **Nombres de tests en tasks.md.** No existen y no se pueden «tocar» como existentes:
   - `tests/unit/pedidos/get-order.test.ts`. `getOrder` se prueba en `order-service.test.ts` y
     `company-scope.test.ts`.
   - `tests/unit/recetas/get-recipe.test.ts` y `tests/unit/recetas/update-recipe.test.ts`.
     `getRecipe`/`updateRecipe` se prueban en `recipe-service.test.ts` y en otros 7 archivos de
     `tests/unit/recetas/`.
   - De `recipe-prisma*.test.ts` solo existe `recipe-prisma-steps.test.ts`.

   O se crean nuevos o se apunta a los existentes. Lo decide el leader.
8. **§6.3, números de línea.** `list-orders.ts:157-160` es en realidad `:160,162,176`. Es menor.
9. **§11, QC-170.** El design la da como «pending (tiene worktree)» con archivos «probables». Ya están
   confirmados (punto 7) y son más de los previstos: también `get-order.ts`, `list-orders.ts`,
   `transition-order.ts`, `pedidos/domain/errors.ts`, `errores/domain/{error-codes,error-catalog}.ts`
   y `db/schema.prisma`, que coinciden con T1, T2 y T9.

## T1 — migracion recipe_versions

### Archivos

Nuevos:
- `db/migrations/20261001120000_recipe_versions/migration.sql` y `down.sql` (§1.2 literal; el
  `RAISE` del down dice como localizarlas).
- `tests/unit/recetas/schema/recipe-versions-migration.test.ts` (estatico, 7 casos).
- `tests/integration/recetas/recipe-versions-constraints.int.test.ts` (Postgres, 9 casos, modo
  `transaccion`).

Modificados:
- `db/schema.prisma`: `parentRecipeId`, `parent`, `versions` en `model Recipe` (§1.1); doc del modelo
  ajustado al nuevo predicado del indice.
- Los dos de T0.3, solo la regex: `WHERE \(deleted_at IS NULL\)` → `WHERE \(+deleted_at IS NULL\)`
  - `tests/integration/inventario/list-query-indexes.int.test.ts:376`
  - `tests/integration/recetas/company-scope.int.test.ts:598`
- Rojos que T0 no listo (todos censos cerrados que ganan una entrada; no cambia lo que comprueban):
  - `tests/unit/recetas/schema/recetas-schema.test.ts`: `RECIPE_COLUMNS` + `parentRecipeId`;
    `scalarNames` excluye tambien el tipo `Recipe`; la lista de `@relation` pasa a
    `['parent','versions','recipe']` (siguen siendo solo intra-modulo; las de otro modulo siguen sin
    `@relation`).
  - `tests/unit/recetas/schema/recipes-company-scope-migration.test.ts:826`: el recorrido de
    restricciones de `recipes` incluye migraciones posteriores y ve las dos nuevas.
  - `tests/integration/recetas/recetas-constraints.int.test.ts:854`: lista cerrada de FK + `recipes_parent_recipe_id_fkey`.
  - `tests/guards/guard-identificador-de-request.test.ts`: `MIGRACIONES_ESPERADAS` + la nueva.
  - `tests/integration/aislamiento.json`: el int nuevo en `transaccion`.

### R → test

| R | Test |
|---|---|
| R12 | int `R12: dos versiones vivas de la misma original con el mismo nombre → 23505 con name_normalized en meta.target`; `R12: una version dada de baja libera su nombre`; unit `R12, R13: parte la unicidad de nombre en dos indices parciales disjuntos` |
| R13 | int `R13: una version con el nombre de una original viva…`, `R13: …version de OTRA original`, `R13: una original con el nombre de una version → aceptada; y dos originales iguales siguen chocando` |
| R42 | int `R42, R43: sin versiones, down → up deja los datos intactos, todas originales, y el esquema igual` (retrato de `recipes`, `recipe_lines` y `orders` antes/despues del UP); unit `R42: anade la columna anulable sin DEFAULT y no toca ningun dato` |
| R43 | int `R43: con una version guardada el down.sql aborta, dice como localizarlas y no cambia nada`; unit `R43: recrea recipes_company_name_unique igual que recipes_company_scope` (comparacion con la definicion de `20260916120000`, con mutacion en memoria), `R43: deshace todo lo del UP…`, `R43: la guardia de versiones es la PRIMERA sentencia…` |

Ademas (sin R): `parent_recipe_id = id → 23514`, FK RESTRICT ante borrado fisico (23503).

### Verificacion (salida real)

- `db:migrate → db:rollback → db:migrate` en base EFIMERA (`qct_qc172_8c9cfd3f_mupuaxsa_twk`, copia
  de la plantilla `qct_tpl_96e0013958f4` recien construida con todas las migraciones), con un script
  temporal que usa `tests/helpers/test-database.ts` y pasa `DATABASE_URL`/`DIRECT_URL` por entorno
  (`loadEnvFile` no pisa variables ya definidas: comprobado). Las cuatro salieron `exit 0`:
  `migrate status` «Database schema is up to date!»; `db:rollback` «20261001120000_recipe_versions
  revertida.»; `db:migrate` «All migrations have been successfully applied.»; `migrate status` «up to
  date». Base borrada al terminar. La base `QuimiCloude` del `.env` no se ha tocado.
- `pnpm exec vitest run tests/unit/recetas/schema tests/integration/recetas tests/integration/inventario/list-query-indexes.int.test.ts guard`:
  `Test Files 68 passed (68)`, `Tests 856 passed | 11 skipped (867)`.
- `pnpm run typecheck`: limpio.
- `pnpm run lint`: `0 errors, 8 warnings` (todas preexistentes, en archivos no tocados).
- `company-scope.int.test.ts:800-840` (down de `recipes_company_scope` sobre el esquema vivo) pasa con
  `recipes_version_name_unique` presente, como preveia T0.
- Nota: Postgres devuelve 23503 (no 23001) para la FK `ON DELETE RESTRICT`.

## T2 — codigo de error recipe_version_under_review

Commit `28d193f0`.

### Archivos
- `lib/modules/errores/domain/error-codes.ts`: `recipe_version_under_review` al final de `ERROR_CODES`.
- `lib/modules/errores/domain/error-catalog.ts`: clave `errors.recipe_version_under_review` y texto
  literal del design §6.2 («La versión elegida está por revisar: ajústala antes de usarla en un
  pedido.»). Nota: es el primer texto del catalogo con tildes; ninguna guardia exige ASCII.
- `lib/modules/pedidos/domain/errors.ts`: `RecipeVersionUnderReviewError` (`PedidosError`). No se
  publica aun en `pedidos/index.ts`: lo lanza `create-order`/`update-order` (T8), dentro del modulo.
- `tests/unit/errores/catalogo.test.ts`: conteo literal 60 → 61 y caso nuevo por el traductor.

### R → test
| R | Test |
|---|---|
| R33 | `catalogo.test.ts` › `QC-172 R33: recipe_version_under_review sale por el traductor con su texto, distinto de recipe_not_found` (`createErrorStateTranslator(PedidosError, …)` → `{status, code, message}` exacto) |

## T3 — reglas puras de version

Commit `a09d92d3`.

### Archivos
- `lib/modules/recetas/domain/recipe-version.ts` (nuevo): `VERSION_NAME_SEPARATOR`,
  `recipeDisplayName`, `isVersionUnderReview`, `propagateLines` (§2). Comparacion por centesimas
  con `percentageToHundredths`; salida en orden de `A` y luego lineas propias de `V`.
- `lib/modules/recetas/index.ts`: exporta las cuatro.
- `tests/unit/recetas/recipe-version.test.ts` (nuevo, 24 casos, importa del barrel).

### R → test (todos en `recipe-version.test.ts`)
| R | Casos |
|---|---|
| R11 | `R11: una version se muestra como «original · version»`; `R11: una original (sin original) se muestra con su nombre tal cual` |
| R15 | Filas de §2.3: `V igual a B → toma A`; `V igual a B y A ausente → la linea desaparece`; `V y B ausentes (⊥ = ⊥) → toma A`; `V distinto de B → se queda V`; `V ausente y B presente → sigue ausente`. Casos enumerados: sube un % no tocado; quita uno conservado igual; quita uno ya quitado; anade uno nuevo; anade uno ya anadido por la version (gana la version); la version cambio el %; `"5"` = `"5.00"`; orden de salida; no muta entradas |
| R20 | `R20: el resultado no suma 100 → por revisar`; `R20: el resultado queda vacio → por revisar` |
| R21 | original sin lineas → `false`; original que no suma 100 → `false`; version sin lineas → `true`; 99,99 → `true`; 100,01 → `true`; 100,00 → `false` |

## Verificacion T2 + T3 (salida real)
- `pnpm run typecheck`: limpio.
- `pnpm run lint`: `0 errors, 8 warnings` (las 8 preexistentes de T1).
- `pnpm exec vitest run tests/unit/recetas/recipe-version.test.ts tests/unit/errores tests/guards/guard-catalogo-de-errores.test.ts tests/unit/recetas/module-contract.test.ts tests/guards/guard-arquitectura-modulos.test.ts`:
  `Test Files 6 passed (6)`, `Tests 177 passed (177)`.
- `pnpm exec vitest related --run <7 archivos tocados>` (arrastra casi toda la suite por los barrels
  de `errores` y `recetas`): `Test Files 4 failed | 521 passed (525)`, `Tests 6 failed | 7446 passed
  | 30 skipped (7482)`. Los 6 rojos son de UI (`configuracion-ui/{unidades,usuarios}-viewport`,
  `inventario/product-page`, `recetas-ui/recipe-page`) y **fallan igual en `14aae6d4` (T1)**: 4
  archivos, 6 tests rojos, sin los cambios de T2/T3. Preexistentes, no de esta tanda.

## T4 — repositorio y adaptador de versiones

Commit `c06dc08e`. Grafo no usado (este worktree no tiene indice); todo con Grep/Read.

### Archivos
Produccion:
- `lib/modules/recetas/ports/recipe-repository.ts`: `RecipeRow.original` (`RecipeOriginalRow | null`),
  tipos `NewRecipeVersion`, `PropagatedVersion`, `ReplaceWithPropagationResult`; metodos
  `createVersion`, `listAliveVersions`, `replaceAliveWithPropagation` (todos con `scope` al final).
- `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts`: `RECIPE_INCLUDE` con
  `parent { id, name, description, imagePath, steps }` y `toRecipeRow` rellena `original`;
  `buildRecipeWhere` + `parentRecipeId: null`; `softDeleteAliveRecipe` en `$transaction` con baja en
  cascada (misma fecha y autor); nuevas `createRecipeVersion` (`SELECT … FOR SHARE` crudo con
  `companyScopeColumns(scope)`), `listAliveRecipeVersions` (`name asc, id asc`) y
  `replaceAliveRecipeWithPropagation` (design §4 paso 5; centinela `VersionNotFound` →
  `'version_not_found'`; llama a `propagateLines`/`isVersionUnderReview` del dominio).
- `lib/composition/index.ts`: cableado de los tres metodos nuevos en `recipeRepository`.

Dominio: **no hizo falta tocar nada** para que compile (el dominio solo lee `RecipeRow`). Lo que
rompia typecheck eran dobles de test que construyen `RecipeRow` o implementan `RecipeRepository`;
el minimo fue anadir `original: null` y los tres metodos nuevos (que lanzan o devuelven vacio):
`tests/unit/recetas/{authorization,company-isolation-service,list-recipes,recipe-image-lifecycle,recipe-image-url,recipe-lines-catalog,recipe-service}.test.ts`
y el cableado a mano de `tests/integration/{recetas/recipe-crud,documentos/formula-import}.int.test.ts`.
Ningun aserto cambia. `getRecipe` de una version sigue devolviendo sus propios pasos (vacios): eso es T5.

Tests:
- `tests/guards/guard-ambito-empresa-recetas.test.ts`: anti-placebo ve las cuatro funciones; comentario
  de la exencion corregido (`replaceAliveRecipe` ya no es la unica que toca `recipeLine`; la nueva
  NO se exime y pasa el barrido por parametro); tres `describe` estructurales nuevos, cada uno con
  comprobacion sobre el fuente real + mutaciones en memoria que la hacen morir:
  `replaceAliveRecipeWithPropagation` (quitar `recipeCompanyScope(scope)` del `updateMany` de la
  version, quitar `parentRecipeId: id`, quitar el `throw`), `createRecipeVersion` (quitar
  `company_id` del SQL, quitar `FOR SHARE`) y `softDeleteAliveRecipe` (quitar el ambito de la cascada).
- `tests/integration/recetas/recipe-versions-repository.int.test.ts` (nuevo, 16 casos, modo `commit`
  registrado en `tests/integration/aislamiento.json`).
- `tests/unit/recetas/module-contract.test.ts`: lista `VERSIONES_DE_RECETA_QC172` (14 rutas de T3-T7)
  dentro de `AMPLIACIONES_APROBADAS`; mensaje de la asercion actualizado.

### R → test (`recipe-versions-repository.int.test.ts` salvo indicacion)
| R | Casos |
|---|---|
| R4 | `R4: crear una version desde una version devuelve not_found y no crea ninguna fila` |
| R5 | `R5: una original dada de baja devuelve not_found y no crea ninguna fila` |
| R7 | `R7, R40: devuelve not_found si el id es una version, de otra empresa o de baja` |
| R8 | `R8: findAliveById de una version trae su original con pasos, descripcion e imagen…` |
| R9 | `R9: ni la pagina ni su total cuentan versiones, sin consulta, con busqueda y con filtro` |
| R10 | `R10, R40: listAliveVersions devuelve las vivas por nombre…` (lado repositorio; el caso de uso es T5) |
| R12 | `R12: un nombre ya usado por otra version viva de la misma original devuelve duplicate` |
| R14, R15, R19 | `R14, R15, R19: guarda la original y propaga a las versiones elegidas lo que no cambiaron` |
| R17 | `R17: un id que no es version viva de esa original devuelve version_not_found y no deja nada cambiado` (version de otra original, de baja, de otra empresa, una original, la propia original, uuid inexistente) |
| R18 | `R18: un fallo forzado a mitad de la propagacion no deja nada cambiado` (trigger acotado a la 2.ª version) |
| R20 | `R20, R19: una version que queda fuera de 100 % no impide guardar y sale como por revisar` |
| R23 | `R23: dar de baja una original da de baja sus versiones vivas con la misma fecha y autor…` |
| R24 | `R24: dar de baja una version solo la da de baja a ella` |
| R40 | los de R7/R10 y `R40: una original de otra empresa…`, `R40: la baja desde otra empresa…`; guardia de ambito |

### Verificacion (salida real)
- `pnpm run typecheck`: limpio (0 errores).
- `pnpm run lint`: `0 errors, 8 warnings` (las 8 preexistentes).
- `pnpm exec vitest run tests/guards/guard-ambito-empresa-recetas.test.ts`: `Tests 38 passed (38)`.
- `pnpm exec vitest run tests/integration/recetas/recipe-versions-repository.int.test.ts` (base efimera
  del `globalSetup`): `Tests 16 passed (16)`.
- `pnpm exec vitest run tests/unit/recetas tests/guards/guard-ambito-empresa-recetas.test.ts tests/guards/guard-aislamiento-integracion.test.ts tests/guards/guard-arquitectura-modulos.test.ts tests/integration/recetas tests/integration/documentos/formula-import.int.test.ts`:
  `Test Files 2 failed | 55 passed (57)`, `Tests 2 failed | 890 passed (892)`. Los dos rojos NO son de T4:
  - `tests/unit/recetas-ui/recipe-page.test.tsx` R21: preexistente (ya listado en T2/T3).
  - `tests/unit/recetas/scope.test.ts:433` «el conjunto de columnas, indices y restricciones de recipes…
    es exactamente el esperado»: censo cerrado de `model Recipe` que no conoce `parentRecipeId`,
    `parent` y `versions`. Lo pone rojo el `db/schema.prisma` de **T1** (T4 no toca el esquema); T1 no
    lo corrio. Arreglo: anadir esas tres entradas al censo. Pendiente de asignar.

## T5 — casos de uso de versiones

Commit `18fb888e`. Grafo no usado (este worktree no tiene indice); todo con Grep/Read.

### Archivos
Produccion:
- `lib/modules/recetas/domain/create-recipe-version.ts` (nuevo): permiso → zod → `findAliveById`
  (null → no encontrada; version → accion no permitida) → `lines ?? copia de la original` por
  `recipeLinesSchema` → productos (existen, no terminados) → `createVersion`.
- `lib/modules/recetas/domain/update-recipe-version.ts` (nuevo): permiso → zod → `findAliveById`
  (original → accion no permitida) → solo valida productos nuevos → `replaceAlive` con `steps: []`,
  `description`/`imagePath` `null`.
- `lib/modules/recetas/domain/list-recipe-versions.ts` (nuevo): `recetas.consultar`; original
  inexistente o que es version → no encontrada; `RecipeVersionSummary[]` en el orden del repositorio.
- `update-recipe.ts`: version → `ActionNotAllowedError` antes de validar productos o subir imagen;
  sin ids → `replaceAlive` (camino de hoy); con ids → `replaceAliveWithPropagation`
  (`version_not_found` → `ValidationError`); `UpdateRecipeResult.propagated` (vacio sin propagar).
- `get-recipe.ts`: `original`, `isUnderReview`, `displayName`; pasos, `stepCount`, descripcion e
  imagen de la original si es version.
- `recipe-input.ts`: `propagateToVersionIds` (uuid, sin repetidos, `default([])`) en
  `updateRecipeSchema`; `createRecipeVersionSchema` (`lines` opcional) y `updateRecipeVersionSchema`;
  `recipeLinesSchema` pasa a exportarse (sin barrel) para validar las lineas copiadas.
- `recipe-view.ts`: `RecipeDetail` + `original`/`isUnderReview`/`displayName`; `RecipeVersionSummary`.
- `index.ts`: los tres factories, sus `Deps`, los dos esquemas, sus tipos y `RecipeVersionSummary`.
- `lib/composition/index.ts`: `recetas.createRecipeVersion`, `updateRecipeVersion`, `listRecipeVersions`.

Tests nuevos: `tests/unit/recetas/{create-recipe-version,update-recipe-version,list-recipe-versions,update-recipe,get-recipe}.test.ts`.

Fixtures ajustados (solo campos nuevos obligatorios; ningun aserto cambia):
- `tests/unit/recetas-ui/recipe-form.test.tsx` (enmienda 2).
- `tests/unit/recetas/scope.test.ts`: censo de `model Recipe` + `parentRecipeId`, `parent`, `versions`.
- **Fuera de la lista de T5, por typecheck rojo**: `tests/unit/pedidos-ui/{order-form,order-form-quote,order-sheet,pedidos-viewport}.test.tsx`
  (construyen `RecipeDetail`; T0 solo contaba los dos primeros) y
  `tests/unit/documentos/{confirm-formula-import,formula-import-authorization}.test.ts` (doble de
  `updateRecipe` sin `propagated`). Y `tests/unit/recetas/company-scope.test.ts` (fila con
  `as unknown as` sin `original`: rojo en ejecucion, no en typecheck).

### R → test
| R | Casos |
|---|---|
| R1 | `create-recipe-version` › `R1, R40: crea la version con sus lineas, vinculada a la original…` |
| R2 | `create-recipe-version` › `R2: sin lineas, la version nace con una copia…`; `R2, R3: …original que no suma 100…` |
| R3 | `create-recipe-version` › `R3: con lineas {que no suman 100, que suman mas de 100, vacias, con un producto repetido, con tres decimales}`, `R3: …producto terminado…`, `R3: …producto que no existe…`; `update-recipe-version` › `R3: …` (3 + terminado) |
| R4 | `create-recipe-version` › `R4: crear desde una version → accion no permitida…` |
| R5 | `create-recipe-version` › `R5, R40: original inexistente…`; `R5: …not_found entre la lectura y el alta` |
| R6 | `update-recipe-version` › `R6, R8, R40: reemplaza nombre y lineas…`; `R6: solo valida contra el catalogo el producto nuevo` |
| R7 | `update-recipe` › `R7: editar una version con la operacion de recetas originales…`; `update-recipe-version` › `R7: editar una original con la operacion de versiones…` |
| R8 | `get-recipe` › `R8, R11: el detalle de una version trae los pasos, la descripcion y la imagen de su original…` |
| R10 | `list-recipe-versions` › `R10, R11, R21, R40: …`, `R10, R40: …no encontrada`, `R10: pedir las versiones de una version…` |
| R11 | `get-recipe` › `R8, R11`, `R11, R21: una original se muestra con su nombre…`; `list-recipe-versions` |
| R12 | `create-recipe-version` y `update-recipe-version` › `R12: …nombre duplicado` |
| R14, R19, R20 | `update-recipe` › `R14, R19, R20: con versiones indicadas guarda y propaga…`; `R14: la propagacion que responde {not_found, duplicate}…` |
| R16 | `update-recipe` › `R16: sin versiones indicadas…`, `R16: una lista vacia…` |
| R17 | `update-recipe` › `R17: si alguna version indicada no es una version viva…`, `R17: con versiones {repetidas, que no son uuid}…` |
| R21 | `get-recipe` › `R21: una version {que no suma 100, sin lineas} sale por revisar`; `R11, R21` |
| R22 | `update-recipe-version` › `R22: editar una version por revisar con lineas validas la deja de considerar por revisar` (repositorio con estado + `getRecipe`) |
| R38 | los cinco archivos › `R38: … rechaza antes de llamar a ningun doble` |
| R40 | `create-recipe-version`, `update-recipe-version`, `list-recipe-versions`, `get-recipe` (scope = empresa del actor; otra empresa = no encontrada) |

### Verificacion (salida real)
- `pnpm run typecheck`: limpio.
- `pnpm run lint`: `0 errors, 8 warnings` (las 8 preexistentes).
- `pnpm exec vitest run tests/unit/recetas tests/unit/recetas-ui/recipe-form.test.tsx tests/unit/documentos/confirm-formula-import.test.ts tests/unit/documentos/formula-import-authorization.test.ts tests/unit/pedidos-ui/{order-form,order-form-quote,order-sheet,pedidos-viewport}.test.tsx tests/guards/guard-arquitectura-modulos.test.ts tests/guards/guard-ambito-empresa-recetas.test.ts`:
  `Test Files 1 failed | 55 passed (56)`, `Tests 1 failed | 918 passed (919)`. El rojo es
  `recetas-ui/recipe-page.test.tsx` R21, preexistente (T2/T3/T4). `scope.test.ts` ya en verde.
- `pnpm exec vitest run tests/guards`: `Test Files 44 passed (44)`, `Tests 593 passed | 5 skipped (598)`.
- No corridos (por indicacion): suite completa, `./init.sh`, `vitest related`.

## T6 — catalogo publico con versiones

Commit `9111b03e`. Grafo no usado; todo con Grep/Read.

### Archivos
Produccion:
- `lib/modules/recetas/domain/recipe-catalog.ts`: `RecipeRef` gana `ownName`, `isUnderReview` y
  `original`; `name` pasa a ser el mostrado. Doc de `findExecutionContentById`,
  `findIdsMatchingName` y `findAliveByNormalizedName` al dia. Se limpiaron las citas de fichas del
  comentario de `RecipeRef` (lineas tocadas).
- `lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts`:
  - `toRecipeRef` compone el nombre con `recipeDisplayName` y calcula `isUnderReview` con
    `isVersionUnderReview` (lineas a `toFixed(2)`).
  - `findRecipeRefsIncludingDeleted`: el `select` gana `parent { id, name }` y
    `lines { percentage }`; sigue siendo un solo `findMany`.
  - `toRecipeExecutionContent`/`findExecutionContentByIdOn`: `parent { name, steps }` sin filtro de
    vida; nombre compuesto y pasos de la original si es version; lineas propias.
  - `findRecipeIdsMatchingName`: `AND: [scope, { OR: [{ nameNormalized }, { parent: { nameNormalized } }] }]`.
  - `findAliveRecipeByNormalizedName`: `parentRecipeId: null`.

Tests:
- `tests/unit/recetas/recipe-catalog.test.ts`: filas de los casos previos con `parent: null`,
  `lines: []` y `RecipeRef` con los tres campos nuevos (ningun aserto cambia de sentido); el `select`
  y el `where` de busqueda/choque se fijan con su forma nueva. Casos nuevos (abajo).
- `tests/integration/recetas/company-scope-queries.int.test.ts`: `toEqual` de `:473` con los campos
  nuevos; `describe` nuevo de versiones con siembra propia (un producto por empresa, para no tocar
  el recuento de lineas del producto sembrado que fija el caso de `recipe_lines`) y su `afterAll`
  (versiones -> originales -> productos). El `afterAll` global borra antes las versiones (FK RESTRICT).
- Dobles de `RecipeRef` (solo campos nuevos; `ownName` = `name`, `isUnderReview: false`,
  `original: null`):
  - `pedidos/{create-order,update-order,list-orders,order-service,company-isolation-service,company-scope,quote-order-cost,transition-order}.test.ts`;
  - `asignaciones/{list-assigned-orders,list-company-orders,list-finished-orders,get-packing-order,list-packing-orders}.test.ts`
    (los cinco de la enmienda);
  - `documentos/confirm-formula-import.test.ts` (el doble anade los campos al devolver).
- No hizo falta tocar `OrderView`/`toOrderView` para compilar: `pedidos` solo lee `ref.name`, que
  ahora es el mostrado. Nada de T9 adelantado.

### R -> test
| R | Casos |
|---|---|
| R8 | `recipe-catalog` › `R8, R11: una version se ejecuta con el nombre compuesto, los pasos de su original…`, `R8: los pasos propios de una version no se usan…`, `R8, R25: pide los pasos de la original sin filtro de vida…`; int › `R8, R25: …version dada de baja trae los pasos de su original, tambien de baja`, `R8, R11: …version viva…` |
| R11 | `recipe-catalog` › `toRecipeRef de una version` › `R11: el nombre mostrado es «Original · Version»…`, `R11: una version dada de baja conserva su nombre compuesto`; int › `R11, R21: la referencia de una version publica la original…` |
| R21 | `recipe-catalog` › `R21: …no suman 100…`, `R21: una version sin lineas…`, `R21: una original sin lineas NO esta por revisar…` |
| R25 | int › `R8, R25`; `recipe-catalog` › `R8, R25` |
| R37 | `recipe-catalog` › `R37: findAliveRecipeByNormalizedName solo mira originales`; int › `R37: findAliveByNormalizedName ignora una version viva…` |
| R40, R41 | `recipe-catalog` › `R41, R40: el OR … va DENTRO del AND con el ambito`; int › `R41, R40: una version se encuentra por su nombre y por el de su original, y nunca la de otra empresa` |

### Verificacion (salida real)
- `pnpm run typecheck`: limpio (0 errores).
- `pnpm run lint`: `0 errors, 8 warnings` (las 8 preexistentes).
- `pnpm exec vitest run tests/unit/recetas tests/unit/pedidos tests/unit/asignaciones tests/unit/documentos`:
  `Test Files 1 failed | 251 passed (252)`, `Tests 1 failed | 3393 passed | 33 skipped (3427)`. El rojo
  es `recetas-ui/recipe-page.test.tsx` R21, preexistente.
- `pnpm exec vitest run tests/integration/recetas/company-scope-queries.int.test.ts` (base efimera):
  `Tests 32 passed (32)`.
- `pnpm exec vitest run tests/guards`: `Test Files 44 passed (44)`, `Tests 593 passed | 5 skipped (598)`.

## T7 — server actions de versiones

Commit `e9298bb0`.

### Archivos
- `lib/modules/recetas/adapters/driving/recipe-actions.ts`: `createRecipeVersionAction(originalId, input)`,
  `updateRecipeVersionAction(versionId, input)` (validan con `createRecipeVersionSchema` /
  `updateRecipeVersionSchema` antes de leer sesion o llamar al caso de uso) y
  `listRecipeVersionsAction(originalId)`; mismo `currentActor` + `toErrorState`. Tipos de estado
  `CreateRecipeVersionFormState`, `UpdateRecipeVersionFormState`, `RecipeVersionListResult`.
  `listRecipeVersionsAction` no valida el id en el borde, igual que `getRecipeAction`/`deleteRecipeAction`.
- `tests/unit/recetas/recipe-actions.test.ts`: tres `describe` nuevos y las tres acciones en el censo
  de `QC-50 R13` (el caso «las cinco actions» pasa a «todas las actions»).
- `tests/unit/identity/session-once-per-request-actions.test.ts`: tres filas en `ACCIONES` (opcional
  segun T0.6; encaja con el formato), con entradas validas para que lleguen a `currentActor`.

### R -> test
| R | Casos |
|---|---|
| R38 | `recipe-actions` › `createRecipeVersionAction` › `R38: rechaza la entrada invalida ({sin nombre, lineas que no suman 100, lineas vacias, no objeto}) sin llamar al caso de uso`, `R38: sin permiso → …`; `updateRecipeVersionAction` › `R38: rechaza … ({sin lineas, no suman 100, sin nombre})`; `listRecipeVersionsAction` › `R38: sin permiso → …`; `session-once-per-request-actions` › filas de las tres |
| R2 | `recipe-actions` › `R2: sin lineas es valida y llega al caso de uso…` |
| R4, R5, R12 | `recipe-actions` › `createRecipeVersionAction` › `R4/R5/R12 … → estado de error traducido` |
| R7 | `recipe-actions` › `R7: editar una original por esta via devuelve accion no permitida traducida` |
| R10 | `recipe-actions` › `R10: original inexistente, de baja o version → estado de error traducido` |

### Verificacion (salida real)
- `pnpm run typecheck`: limpio.
- `pnpm run lint`: `0 errors, 8 warnings` (las 8 preexistentes).
- `pnpm exec vitest run tests/unit/recetas/recipe-actions.test.ts tests/unit/identity/session-once-per-request-actions.test.ts`:
  `Test Files 2 passed (2)`, `Tests 84 passed (84)`.
- `pnpm exec vitest run tests/guards tests/unit/recetas tests/unit/identity/session-once-per-request-actions.test.ts`:
  `Test Files 1 failed | 92 passed (93)`, `Tests 1 failed | 1375 passed | 5 skipped (1381)`. El rojo
  es `recetas-ui/recipe-page.test.tsx` R21, preexistente.
- No corridos (por indicacion): suite completa, `./init.sh`, `vitest related`.
