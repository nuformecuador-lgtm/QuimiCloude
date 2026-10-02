# QC-174 — crear-versiones-en-la-receta · tasks.md

> Cada task: **Quién**, **Toca** (archivos, para cruzar en F2.0), **Hacer**, **Hecho cuando**. `[P]` =
> puede ir en paralelo con las demás `[P]` de su tanda. Dependencias en «Tras». Cierre de tanda:
> `./init.sh --rapido`; cierre de feature y antes del PR: `./init.sh`. Las secciones § son de
> `design.md`. Los tests nombran el `R<n>` en el nombre del caso.
>
> **El barrel `formulas/components/index.ts` lo tocan T6, T7 y T10, y `recipe-form.tsx` T7 y T10**:
> ninguna de ellas es `[P]`, así que van en serie y no chocan.
>
> **T1 depende de P1.** Con (a) se hace tal cual; con (b) se borra T1 y T10 relee las versiones tras
> guardar (design §7.2).

## Tanda 0 — medición

### T0 [x] — Medir antes de tocar
**Quién:** implementer. **Toca:** solo `progress/impl_QC-174-crear-versiones-en-la-receta.md` (nuevo).
**Hacer:**
1. Reverificar cada fila de `design.md > 0` con archivo:línea en la rama (puede haber entrado `dev`).
2. Leer `guard-pantallas-exigen-permiso.test.ts` y `guard-rutas-privadas-cubiertas.test.ts`: ¿fijan
   el número de páginas o una lista a mano? Anotar qué hay que tocar al añadir dos `page.tsx`.
3. Listar los tests que montan `RecipeForm` en `edit`, `DeleteRecipeDialog` o la ficha `[id]/page.tsx`
   (se pondrán rojos por la prop `versions` o la lectura nueva), con rutas.
4. Comprobar que `StepDocumentView` dentro de un contenedor `inert` no deja marcar sus casillas en
   jsdom (o anotar la alternativa: `disabled` por prop sin tocar el componente compartido).
5. Anotar el estado de QC-173 en `dev` y si ya tocó `recipe-form.tsx` o `step-document-view.tsx`.
**Hecho cuando:** el archivo de progreso tiene las cinco respuestas con rutas, y cualquier
discrepancia con `design.md` está avisada al leader antes de T1.

## Tanda 1 — servidor y piezas puras

### T1 [x] [P] — `updateRecipeAction` devuelve `propagated` (⚑ P1 a)
Tras T0. **Quién:** backend_dev. **Toca:** `lib/modules/recetas/adapters/driving/recipe-actions.ts`,
`tests/unit/recetas/recipe-actions.test.ts`.
**Hacer:** §3, última fila. Sin tocar dominio, puertos ni barrel.
**Hecho cuando:** test: con un doble de `recetas.updateRecipe` que devuelve dos `propagated`, la
acción responde `{ status: 'success', propagated }` idéntico; sin propagación, `propagated: []`; los
casos de hoy (entrada inválida no llama al caso de uso, advertencias registradas) siguen verdes (R29).

### T2 [x] [P] — Rutas de versión
Tras T0. **Quién:** frontend_dev. **Toca:** `lib/shared/routes.ts`,
`tests/unit/recetas-ui/recipe-route-contract.test.ts`.
**Hacer:** §1, `newRecipeVersionRoute(id)` y `recipeVersionRoute(id, versionId)` derivadas de
`recipeEditRoute`.
**Hecho cuando:** el test de contrato comprueba las dos formas exactas y que ninguna página nueva
incrusta el literal `/versiones` (se amplía el caso existente cuando existan las páginas, T8).

### T3 [x] [P] — `compareWithOriginal`
Tras T0. **Quién:** frontend_dev. **Toca:** `app/(private)/produccion/formulas/components/recipe-version-diff.ts`
(nuevo), `tests/unit/recetas-ui/recipe-version-diff.test.ts` (nuevo).
**Hacer:** §2.1.
**Hecho cuando:** casos: igual; cambiado con `originalPercentage`; añadido; quitado (y en el orden de
la original); línea sin producto → `null`; `5` / `5,0` / `5,00` contra `5.00` → igual; `'5,'` y `''`
contra un ingrediente de la original → cambiado; original vacía → todo añadido; versión vacía → todo
quitado; ingrediente de la original con `productName: null` sale en `removed` con `null` (R17, R18, R19).

## Tanda 2 — componentes

### T4 [ ] — `RecipeLinesField` con `baseline`
Tras T3. **Quién:** frontend_dev. **Toca:** `formulas/components/recipe-lines-field.tsx`,
`tests/unit/recetas-ui/recipe-lines-baseline.test.tsx` (nuevo).
**Hacer:** §2.2.
**Hecho cuando:** sin `baseline` el DOM no tiene ninguna marca ni bloque de quitados y los tests
`recipe-lines-*` existentes pasan sin cambios; con `baseline`, cada fila lleva su `data-mark`, la de
`changed` muestra el % de la original, los quitados se listan fuera de las filas y la suma no los
cuenta; teclear un % o quitar una línea cambia las marcas en el mismo render (R17, R18, R19, R11).

### T5 [ ] [P] — `DeleteRecipeDialog` con versiones
Tras T0. **Quién:** frontend_dev. **Toca:** `formulas/components/delete-recipe-dialog.tsx`,
`tests/unit/recetas-ui/delete-recipe-dialog.test.tsx` (nuevo); **no** toca el barrel.
**Hecho cuando:** test con dobles de `listRecipeVersionsAction` y `deleteRecipeAction`: `kind: 'version'`
nombra la versión, no cuenta y confirma una vez; original con 0 / 1 / 3 versiones → texto de hoy /
«su versión» / «sus 3 versiones»; confirmar deshabilitado mientras cuenta; error al contar → mensaje y
confirmar deshabilitado; error al borrar → diálogo abierto con el mensaje; sin confirmar no se invoca
`deleteRecipeAction`; botones con `min-h-11 min-w-11` (R32, R33, R34, R35, R37). La tabla de la lista
sigue llamándolo igual.

### T6 [ ] — `RecipeVersionList`
Tras T2, T5. **Quién:** frontend_dev. **Toca:** `formulas/components/recipe-version-list.tsx` (nuevo),
`formulas/components/index.ts`, `tests/unit/recetas-ui/recipe-version-list.test.tsx` (nuevo).
**Hacer:** §2.5.
**Hecho cuando:** pinta las versiones en el orden recibido con enlace a `recipeVersionRoute`; «Por
revisar» solo en las que lo están; vacío con su texto y sin lista; «Nueva versión» enlaza a
`newRecipeVersionRoute`; borrar una pasa por el diálogo en modo versión; objetivos táctiles (R1, R2, R3,
R4, R32, R37).

### T7 [ ] — `RecipeVersionForm` y su payload
Tras T2, T4. **Quién:** frontend_dev. **Toca:** `formulas/components/recipe-version-form.tsx` (nuevo),
`formulas/components/recipe-form-state.ts` (`toLineFormValues`, `buildRecipeVersionPayload`),
`formulas/components/recipe-form.tsx` (solo para usar `toLineFormValues` en `buildInitialState`),
`formulas/components/index.ts`, `tests/unit/recetas-ui/recipe-version-form.test.tsx` (nuevo),
`tests/unit/recetas-ui/recipe-form-payload.test.ts`.
**Hacer:** §2.3 y §2.4.
**Hecho cuando:** con dobles de las dos acciones: alta precargada con las líneas de la original y nombre
vacío; edición con nombre y líneas de la versión; guardar deshabilitado fuera de 100,00 % o con línea
sin producto y también por Enter; éxito → la acción recibe exactamente `{ name, lines }` (sin claves de
pasos, descripción ni imagen), `toast.success` y `push` a la ficha; duplicado junto al nombre;
`unauthorized` e `invalid_input` en la región de error sin navegar y con lo escrito intacto; inesperado
con identificador; «Guardando…» durante la transición; «Cancelar» enlaza a la ficha sin invocar nada;
en edición, descripción e imagen de la original como texto e imagen sin campos, pasos en lectura sin
casilla marcable, texto de vacío sin pasos, y «Por revisar» si `isUnderReview`; en alta, sin
descripción, imagen ni pasos; `text-base` en el nombre (R8, R9, R11–R16, R20–R23, R37). Los tests de
`recipe-form.test.tsx` siguen verdes tras extraer `toLineFormValues`.

## Tanda 3 — páginas y ficha

### T8 [ ] — Páginas de alta y de versión
Tras T7. **Quién:** frontend_dev. **Toca:** `app/(private)/produccion/formulas/[id]/versiones/nueva/page.tsx`
(nuevo), `app/(private)/produccion/formulas/[id]/versiones/[versionId]/page.tsx` (nuevo),
`tests/unit/recetas-ui/recipe-version-pages.test.tsx` (nuevo),
`tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`, `tests/unit/recetas-ui/recipe-route-contract.test.ts`,
y lo que T0.2 señale de las guardias de páginas.
**Hacer:** §1, filas 2 y 3.
**Hecho cuando:** primera línea `requirePagePermission('recetas.consultar')` antes de `params` y sin
permiso 404 (filas nuevas en el test de navegación, guardia verde); alta con original viva → formulario
de alta; `[id]` inexistente, de otra empresa (doble que devuelve `recipe_not_found`) o que es versión →
«no encontrada» sin formulario; versión cuyo `original.id` no es `[id]` → «no encontrada»; título con
`displayName`; otro error → `RecipeListError` (R8, R9, R10, R36).

### T9 [ ] — Ficha de la original
Tras T6, T10. **Quién:** frontend_dev. **Toca:** `app/(private)/produccion/formulas/[id]/page.tsx`,
`tests/unit/recetas-ui/recipe-page.test.tsx`.
**Hacer:** §1, fila 1.
**Hecho cuando:** id de versión → `redirect` a `recipeVersionRoute(original.id, id)` sin pintar
`RecipeForm`; original → `listRecipeVersionsAction(id)` en el mismo `Promise.all`, `RecipeForm` recibe
`versions` y debajo sale `RecipeVersionList`; error al listar → `RecipeListError` sin formulario (R1, R5,
R7). Los casos de hoy de la página siguen verdes.

### T10 [ ] — Propagación en `RecipeForm`
Tras T1, T7 (comparte `recipe-form.tsx`). **Quién:** frontend_dev. **Toca:**
`formulas/components/recipe-form.tsx`, `formulas/components/propagate-versions-dialog.tsx` (nuevo),
`formulas/components/index.ts`, `tests/unit/recetas-ui/recipe-form-propagation.test.tsx` (nuevo),
`tests/unit/recetas-ui/recipe-form.test.tsx` (pasa `versions: []` en `edit`).
**Hacer:** §2.7.
**Hecho cuando:** con un doble de `updateRecipeAction`: sin versiones guarda sin aviso como hoy; con
1 y con 3 versiones abre el aviso con el título en singular / plural y todas las casillas marcadas, sin
haber llamado a la acción; desmarcar una y propagar → `propagateToVersionIds` con exactamente las
marcadas; cero marcadas → «Guardar y propagar» deshabilitado; «Guardar sin propagar» → `[]`; cerrar →
ninguna llamada y el formulario intacto; respuesta con una por revisar → no navega, `refresh`, aviso
persistente que nombra solo esa con enlace a su página; ninguna por revisar → toast y lista de fórmulas;
error → región de error sin navegar; casillas y botones con objetivo táctil (R24–R31, R37). Si la
validación previa falla, no se abre el aviso.

## Tanda 4 — E2E y cierre

### T11 [ ] — E2E `versiones-en-la-receta`
Tras T8, T9, T10. **Quién:** implementer (frontend_dev escribe, implementer corre). **Toca:**
`e2e/versiones-en-la-receta.spec.ts` (nuevo).
**Hacer:** §6.1.
**Hecho cuando:** el spec pasa contra la base de E2E; comprueba en Postgres las líneas de las dos
versiones tras propagar (suma 100 en «Copia», 110 en «Cambiada 2»), que la lista de fórmulas no muestra
ninguna versión, y en pantalla el aviso persistente y la marca «Por revisar» solo en «Cambiada 2» (R6,
R38).

### T12 [ ] — Gate y trazabilidad
Tras T11. **Quién:** implementer. **Toca:** `progress/impl_QC-174-crear-versiones-en-la-receta.md`.
**Hecho cuando:** `./init.sh` completo verde (sin archivos rojos fuera de `tests/baseline-rojos.json`),
salida pegada, mapa `R1…R39 → test` completo según `design.md > 6` con cualquier desvío explicado, y
`package.json` sin cambios (R39).

## Mapa de archivos por task (F2.0)

| Archivo | Tasks |
|---|---|
| `lib/modules/recetas/adapters/driving/recipe-actions.ts` | T1 |
| `lib/shared/routes.ts` | T2 |
| `formulas/components/recipe-version-diff.ts` | T3 |
| `formulas/components/recipe-lines-field.tsx` | T4 |
| `formulas/components/delete-recipe-dialog.tsx` | T5 |
| `formulas/components/recipe-version-list.tsx` | T6 |
| `formulas/components/recipe-version-form.tsx`, `recipe-form-state.ts` | T7 |
| `formulas/components/recipe-form.tsx` | T7 (extracción mínima), T10 — en serie |
| `formulas/components/propagate-versions-dialog.tsx` | T10 |
| `formulas/components/index.ts` | T6, T7, T10 — en serie |
| `formulas/[id]/versiones/nueva/page.tsx`, `formulas/[id]/versiones/[versionId]/page.tsx` | T8 |
| `formulas/[id]/page.tsx` | T9 |
| `e2e/versiones-en-la-receta.spec.ts` | T11 |
| Tests de `tests/unit/recetas-ui/`, `tests/unit/recetas/recipe-actions.test.ts`, `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` | los indicados en cada task |

`formulas/` = `app/(private)/produccion/formulas/`. Cruce con otras fichas en `design.md > 8`.
