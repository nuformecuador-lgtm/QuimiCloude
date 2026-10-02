# QC-174 — bitacora de implementacion

## T0 — Medicion

Rama `feature/QC-174-crear-versiones-en-la-receta`, HEAD `8328fe16` (merge-base con `origin/dev` = `d3535685`).
Fecha: 2026-10-02. Sin cambios de produccion ni de tests.

### 1. Tabla `design.md > 0` reverificada

| Fila | Estado | Dato real |
|---|---|---|
| Acciones de versiones | OK | `recipe-actions.ts:221-271` (create :222, update :242, list :262). `RecipeVersionSummary` en `domain/recipe-view.ts:69-75`. Orden por nombre: `recipe-prisma.ts:559` `orderBy: [{ name: 'asc' }, TIE_BREAKER]` |
| Borrar version / cascada | OK | `deleteRecipeAction` `recipe-actions.ts:180-189`; `softDeleteAlive` en `domain/delete-recipe.ts:34` |
| Detalle de version | OK | `get-recipe.ts:57-77` (`shared = row.original ?? row` :58; `original`, `isUnderReview`, `displayName` :72-77); `RecipeDetail` en `recipe-view.ts:59-67` |
| `propagateToVersionIds` | OK | `recipe-input.ts:274-279` |
| `updateRecipe` devuelve `propagated` | OK | `update-recipe.ts:24-28` (tipo), `:159` (return) |
| `updateRecipeAction` lo descarta (P1) | OK (desfase de 1 linea) | `UpdateRecipeFormState` en `recipe-actions.ts:62-65` (design dice 63-66); `return { status: 'success' }` en `:173` |
| Esquemas de version | OK | `recipe-input.ts:284-292` |
| Ficha `[id]/page.tsx` | OK | `requirePagePermission` antes de `params`; `Promise.all` de 4 lecturas (receta, unidades, productos, maquinas); `recipe_not_found` → `data-testid="recipe-not-found"`; resto → `RecipeListError` |
| `RecipeForm` | OK | `recipe-form.tsx:180` (`export function`), `useTransition` :185, `safeParse` :217, `toast.success`/`router.push(FORMULAS_ROUTE)`/`refresh` :256-258 |
| `RecipeLinesField` | OK (no se verifico linea a linea; sin cambios desde merge-base) | |
| `DeleteRecipeDialog` | OK | `delete-recipe-dialog.tsx:45` `({ recipe }: { readonly recipe: RecipeSummary })`; unico uso `recipe-table.tsx:94` (+ barrel `components/index.ts:3`) |
| `StepDocumentView` | OK | `step-document-view.tsx:50`. Props: `document`, `isItemChecked`, `onToggleItem`, `idPrefix`. **No acepta `disabled`** |
| Rutas | OK | `lib/shared/routes.ts:46-54` |
| Primitivas UI | OK | `checkbox`, `badge`, `alert-dialog`, `dialog`, `button`, `input`, `label` en `components/ui/` |
| E2E QC-172 | OK | `e2e/versiones-de-receta.spec.ts` (Prisma directo via `@/lib/shared/db/prisma`) |

### 2. Guardias de paginas

- `tests/guards/guard-pantallas-exigen-permiso.test.ts` **SI fija una lista a mano**:
  `RUTAS_ESPERADAS_HOY` (`:241-259`, 17 rutas) comparada con `toEqual` en el test
  «el barrido encuentra exactamente las diecisiete pantallas privadas de hoy» (`:262-266`).
  Al anadir las dos `page.tsx` hay que: anadir `'/produccion/formulas/[id]/versiones/[versionId]'` y
  `'/produccion/formulas/[id]/versiones/nueva'` a la lista, renombrar el test a «diecinueve», y anadir
  el comentario fechado de tension (patron de `:236-240`). El comentario «NUEVE» de `:127` ya esta
  desfasado (no es aserción). Las dos paginas deben llamar `requirePagePermission('recetas.consultar')`.
  **Discrepancia con design §5 / tasks T8**: no listan este archivo como a tocar; T8 lo cubre con «lo que T0.2 señale».
- `tests/guards/guard-rutas-privadas-cubiertas.test.ts`: **no** fija numero ni lista; censa por
  segmentos contra `PRIVATE_ROUTE_PREFIXES` (`:132-146`) y solo exige `length > 0` y `/dashboard`
  (`:123-130`). El prefijo de `FORMULAS_ROUTE` cubre las nuevas → no se toca.
- `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`: lista a mano `PAGINAS`; fórmulas en
  `:191-212` (design dice 192-210). A tocar: importar las dos paginas nuevas, anadir dos entradas
  (`params` con `parametroEspia`), y **el `vi.mock` de `recipe-actions` (`:88-94`) no exporta
  `listRecipeVersionsAction`**: si `[id]/page.tsx` o las nuevas la importan, hay que anadirla al mock
  (y a `actions` en `:57-62` si debe contar como lectura). El `describe` dice «las ocho pantallas».

### 3. Tests que montan las piezas afectadas

| Test | Que monta | Riesgo |
|---|---|---|
| `tests/unit/recetas-ui/recipe-form.test.tsx` | `RecipeForm mode="edit"` (`:264`) y `EditarRecetaPage` (`:638`); mock de `recipe-actions` en `:115` | prop `versions` obligatoria; mock sin `listRecipeVersionsAction` |
| `tests/unit/recetas-ui/recipe-page.test.tsx` | `FormulasPage` → `RecipeTable` → `DeleteRecipeDialog` (testids `delete-recipe-*` `:165-168`, `:1195-1261`); mock en `:130` | si el dialogo cuenta versiones al abrir, el mock necesita `listRecipeVersionsAction` |
| `tests/unit/documentos-ui/formulas-upload.test.tsx` | `FormulasPage` (`:71`, `:117`), mock de `recipe-actions` en `:56` | igual que el anterior (no aparece en design §5) |
| `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` | `EditarRecetaPage` (`:6`, `:206-212`) | ver punto 2 |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | barrido de archivos/rutas | T2/T8 |

`RecipeForm` en `create` / sin edit: `recipe-form-payload.test.ts`, `recipe-lines-sum.test.tsx` no lo montan en `edit`.
`StepDocumentView`: solo via `StepReader` en `tests/unit/recetas-ui/step-reader.test.tsx`.

### 4. `inert` en jsdom (medido)

Test temporal `tests/unit/tmp-qc174-inert.test.tsx` (ya borrado), `StepDocumentView` con un item dentro de
`<div inert>`, `isItemChecked={() => false}`, `onToggleItem = vi.fn()`. Corrido con el vitest del arbol
principal (el worktree no tiene `node_modules`; `pnpm exec vitest` → «Command "vitest" not found"):
`node ../../node_modules/vitest/vitest.mjs run tests/unit/tmp-qc174-inert.test.tsx` → 5 passed. Resultado:

- `hasAttribute('inert')` = true, pero `element.inert` = `undefined` (jsdom no implementa inert).
- `user.click` en la casilla → `onToggleItem` llamado **1 vez**, sin error.
- `user.click` en la etiqueta → 1 llamada. `fireEvent.click` → 1 llamada.
- `user.tab()` enfoca la casilla (true) y `keyboard(' ')` → 1 llamada.

**Conclusion: `inert` NO impide marcar en jsdom.** `StepDocumentView` no tiene prop `disabled`.
Alternativa sin tocar el componente compartido: el test afirma (a) que el contenedor lleva `inert`
(y `aria-disabled`/texto si procede) y (b) que con `isItemChecked={() => false}` y `onToggleItem` noop,
tras `user.click` la casilla sigue `aria-checked="false"` / `data-state="unchecked"` (Radix controlado).
La garantia real de «no se puede marcar» en navegador queda para el E2E (Chromium y WebKit soportan `inert`).

### 5. QC-173 en `dev`

`git fetch origin dev` → `origin/dev` = `5b632439`. Unico commit nuevo frente a la rama:
`5b632439 feat(grupos): columna de miembros en la tabla de grupos de trabajo` (19 archivos de
`configuracion/usuarios`, `identity`, `responsible-avatars`, `feature_list.json`, `progress/`).
`git diff HEAD...origin/dev --stat` **no toca** `recipe-form.tsx`, `step-document-view.tsx`, `step-reader/` ni `formulas/`.
QC-173 (`fases-en-los-pasos`) esta `pending` en `feature_list.json` tanto en HEAD como en `origin/dev`;
no hay rama remota de QC-173. Sin conflicto hoy.

### 6. E2E

- Script: `"e2e": "playwright test"`. `pnpm run e2e -- <archivo>` **no filtra en Git Bash**
  (`progress/history.md:4734`): usar `pnpm exec playwright test`.
- Comando de un spec (como QC-172): `pnpm exec playwright test e2e/versiones-en-la-receta.spec.ts --project=chromium`
  (y `--project=webkit`; sin `--project` corre los dos). Filtrar un caso: `-g "R38"`.
- `playwright.config.ts`: `webServer` arranca SIEMPRE `pnpm run dev --port 3117` (`reuseExistingServer: false`,
  timeout 180 s) con `DOCUMENTS_E2E_DOUBLES=1` y prompts ficticios. Proyectos `chromium` y `webkit`.
- Necesita: `node_modules` en el worktree (hoy NO hay: `./init.sh` hace `pnpm install` + `prisma generate`
  + `next typegen`), `.env` presente (lo esta; `DATABASE_URL` → Postgres local `localhost:5432/QuimiCloude`,
  la misma base que dev; no hay base de E2E aparte), Postgres levantado con migraciones al dia, y usuario
  admin del seed (`SEED_ADMIN_*`). El spec importa `prisma` de `@/lib/shared/db/prisma`.
- **Spec nuevo = dos listas CERRADAS de E2E** a las que darlo de alta (lo que le paso a QC-172 en T12):
  `tests/guards/guard-identificador-de-request.test.ts` (~`:222`) y `tests/unit/recetas/scope.test.ts`
  (~`:252`). **No figuran en el mapa de archivos de T11** → discrepancia con tasks.md.

## T1

**Archivos:** `lib/modules/recetas/adapters/driving/recipe-actions.ts` (exito de `UpdateRecipeFormState` =
`{ status: 'success'; propagated: UpdateRecipeResult['propagated'] }`; la accion devuelve el `propagated`
del caso de uso), `tests/unit/recetas/recipe-actions.test.ts` (dobles con `propagated`, dos casos nuevos).
Dominio, puertos y barrel sin tocar.

**R -> test:**
- R29 (servidor) -> `tests/unit/recetas/recipe-actions.test.ts` > `updateRecipeAction — R38, R47-R49` >
  `R29: devuelve tal cual las versiones propagadas que devuelve el caso de uso` y
  `R29: sin propagacion responde propagated vacio`. Casos previos (entrada invalida no llama al caso de
  uso, advertencias registradas) siguen verdes.

**Verificacion:**
- `pnpm run typecheck`: ROJO, 1 error fuera del alcance de T1:
  `tests/unit/recetas-ui/recipe-form.test.tsx(516,44): error TS2345: Argument of type '{ status: "success"; }' is not assignable to parameter of type 'UpdateRecipeFormState'.`
  El doble `updateRecipeActionMock.mockResolvedValue({ status: 'success' })` necesita `propagated: []`.
  Archivo de UI (lo toca T10 segun tasks.md); no lo arregla backend_dev. `recipe-form.tsx` compila.
- `pnpm run lint`: `✖ 8 problems (0 errors, 8 warnings)` (warnings ajenos).
- `pnpm exec vitest related --run lib/modules/recetas/adapters/driving/recipe-actions.ts tests/unit/recetas/recipe-actions.test.ts`:
  `Test Files  1 failed | 44 passed (45)` / `Tests  1 failed | 754 passed (755)`. El rojo es
  `tests/unit/recetas-ui/recipe-page.test.tsx > R21 ...44x44`, listado en `tests/baseline-rojos.json` (deuda de dev).

## T2 — Rutas de version
- `lib/shared/routes.ts`: `newRecipeVersionRoute(id)`, `recipeVersionRoute(id, versionId)` sobre `recipeEditRoute`.
- `tests/unit/recetas-ui/recipe-route-contract.test.ts`: caso «las rutas de version cuelgan de recipeEditRoute con su forma exacta» + alta en la lista cerrada de exportaciones de `routes.ts` (QC-64 R12).
- Sin R directo (base de R4/R7).

## T3 — compareWithOriginal
- `formulas/components/recipe-version-diff.ts` (nuevo, puro), `tests/unit/recetas-ui/recipe-version-diff.test.ts` (12 casos, R17/R18/R19 en el nombre).
- Ingrediente repetido en la original: se compara con su primera linea.
- `formulas/components/index.ts` reexporta `compareWithOriginal`, `VersionLineMark`, `RemovedLine` (lo exige el caso del barrel de `recipe-route-contract`, ~:898).
- `tests/unit/recetas-ui/recipe-form.test.tsx:516`: doble de exito con `propagated: []` (tipo ampliado en T1).
- `vitest run` recipe-form + recipe-route-contract + recipe-version-diff: `Test Files 3 passed (3)` / `Tests 74 passed (74)`.

## Cierre tanda 1 (commit 757ec149) — `./init.sh --rapido`
- `vitest related` sobre 8 archivos del diff: `Test Files 4 failed | 262 passed (266)` / `Tests 6 failed | 3819 passed | 44 skipped (3869)`.
- Los 6 rojos son los casos ya listados en `tests/baseline-rojos.json` (unidades-viewport R27 x2, usuarios-viewport R21 x2, product-page R18, recipe-page R21; deuda de dev, QC-177). `--rapido` no consulta la lista. Ningun rojo propio.
- typecheck y lint verdes; guardias verdes.

## T4 — RecipeLinesField con baseline
- `formulas/components/recipe-lines-field.tsx` (prop `baseline?`), `tests/unit/recetas-ui/recipe-lines-baseline.test.tsx` (nuevo).
- Marca por fila «Igual/Cambiado/Añadido» (`recipe-line-mark-<i>`, `data-mark`); testid extra `recipe-line-original-<i>` para el % de la original; `recipe-lines-removed` solo se monta si hay quitados; fila en blanco sin marca.
- R17: «R17 — sin baseline no pinta ninguna marca…», «R17 — cada línea lleva su marca…», «R17 — la fila en blanco…»; R18/R11: «R18, R11 — los quitados se listan fuera de las filas y la suma no los cuenta»; R19: «R19 — teclear un % cambia la marca…», «R19, R18 — quitar una línea…».
- `vitest run tests/unit/recetas-ui/recipe-lines`: `Test Files 5 passed (5)` / `Tests 35 passed (35)`; recipe-lines-* previos sin cambios.

## T5 — DeleteRecipeDialog con versiones
- `formulas/components/delete-recipe-dialog.tsx`, `tests/unit/recetas-ui/delete-recipe-dialog.test.tsx` (nuevo, 15 casos); mocks de `recipe-page.test.tsx` y `documentos-ui/formulas-upload.test.tsx` ganan `listRecipeVersionsAction` (vacía).
- Desvío menor: el toast tras borrar una versión sigue siendo «Receta borrada.» (el spec no da otro texto).
- R32: «nombra la versión, … no cuenta y sin confirmar no invoca nada», «confirmar borra esa versión una sola vez…», «sin confirmar no se invoca el borrado…»; R33: «sin versiones el texto es el de hoy», «con una versión…», «con tres versiones… sus 3 versiones», «la cuenta de una apertura anterior que llega tarde no pisa…»; R34: «mientras cuenta… deshabilitado», «si no se puede contar…», «un error inesperado al contar enseña su identificador»; R35: «si falla el borrado de la versión/original el diálogo sigue abierto…»; R37: «abrir, cancelar y confirmar tienen min-h-11 y min-w-11» (it.each recipe/version).
- vitest (3 archivos): `Test Files 1 failed | 2 passed (3)` / `Tests 1 failed | 62 passed (63)` — el rojo es recipe-page R21, de baseline.

## T7 — RecipeVersionForm y su payload
- Nuevos: `formulas/components/recipe-version-form.tsx`, `tests/unit/recetas-ui/recipe-version-form.test.tsx`. Cambian: `recipe-form-state.ts` (`toLineFormValues`, `buildRecipeVersionPayload`, helper comun `toLinePayloads`), `recipe-form.tsx` (solo `buildInitialState` usa `toLineFormValues`), `index.ts`, `tests/unit/recetas-ui/recipe-form-payload.test.ts`.
- Desvio 1: `inert` + `aria-readonly` van en un `<div data-testid="recipe-version-inherited-steps">` que envuelve el `<ol>` (jsx-a11y no admite `aria-readonly` en role list). En jsdom `inert` no bloquea (medido en T0): el test afirma el atributo y que la casilla sigue `aria-checked="false"` tras el clic; el bloqueo real lo cubre el navegador.
- Desvio 2 (no previsto en design §5): `tests/unit/recetas-ui/recipe-route-contract.test.ts` tenia dos listas cerradas que el spec obliga a ampliar: operaciones permitidas (+ `listRecipeVersionsAction`, `createRecipeVersionAction`, `updateRecipeVersionAction`, «diez operaciones») e importadores del step-reader (excepcion exacta y unica para el import de `step-document-view` desde `recipe-version-form.tsx`; caso renombrado). Ambas siguen cerradas.
- R8: «R8 — el alta abre con el nombre vacío y las líneas de la original»; payload «R8, R9 — formatea el % con coma…». R9: «R9 — la edición abre con el nombre propio y las líneas de la versión…»; payload «R9 — conserva la línea de un producto dado de baja…». R11: «R11 — fuera de 100,00 % … Enter tampoco envía», «R11 — una línea sin producto deshabilita…». R12/R22: «R12, R22 — el alta envía exactamente { name, lines }…». R13/R22: «R13, R22 — la edición envía exactamente { name, lines }…». R14: «R14 — «Cancelar» es un enlace a la ficha…». R15: «R15 — nombre duplicado…», «R15 — %s va a la región de error…» (unauthorized, invalid_input), «R15 — el error inesperado se pinta con su identificador». R16: «R16 — mientras se guarda… «Guardando…»». R20: «R20 — en edición, imagen y descripción…», «R20 — en edición sin imagen…», «R20, R21 — el alta no ofrece descripción, imagen ni pasos». R21: «R21 — los pasos de la original se leen dentro de un contenedor inert…», «R21 — sin pasos…». R22 (payload): «R22 — el payload es exactamente { name, lines }…», «R22 — sanea las líneas igual que buildRecipePayload», «R22 — el payload pasa el esquema…». R23: «R23 — la versión por revisar lleva la marca…», «R23 — sin revisión pendiente…». R37: «R37 — nombre con text-base y objetivos táctiles…».
- vitest recipe-version-form + recipe-form-payload + recipe-form + recipe-lines*: `Test Files 8 passed (8)` / `Tests 112 passed (112)`; recipe-route-contract + recipe-version-form + delete-recipe-dialog tras el ajuste: 3 archivos, 61 tests passed.

## T6 — RecipeVersionList
- Nuevos: `formulas/components/recipe-version-list.tsx`, `tests/unit/recetas-ui/recipe-version-list.test.tsx`; `index.ts` exporta `RecipeVersionList`.
- R1: «R1: pinta una fila por versión en el orden recibido con enlace a su página»; R2: «R2: «Por revisar» aparece solo en las versiones que lo están»; R3: «R3: sin versiones muestra el texto de vacío y ninguna lista»; R4: «R4: «Nueva versión» enlaza a la página de alta» (con y sin versiones); R32: «R32: borrar una versión pasa por el diálogo en modo versión y confirma con su id»; R37: «R37: enlaces y botones nuevos tienen objetivo táctil de al menos 44x44».
- vitest: `Test Files 1 passed (1)` / `Tests 7 passed (7)`.
