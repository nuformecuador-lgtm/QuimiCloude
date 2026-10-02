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
