# QC-174 — crear-versiones-en-la-receta · design.md

> El CÓMO de `requirements.md`. Rutas verificadas en este worktree el 2026-10-02 con Grep/Read: el
> MCP del grafo no se consultó para este spec (anotado en el informe). T0 vuelve a medir antes de
> tocar nada. **No se rediseña nada de QC-172**: este archivo consume su contrato tal como quedó
> mergeado (`specs/QC-172-versiones-de-receta/design.md > 5`).

## 0. Lo que hay hoy

| Hecho | Dónde |
|---|---|
| Acciones de versiones: `createRecipeVersionAction(originalId, {name, lines?})`, `updateRecipeVersionAction(versionId, {name, lines})`, `listRecipeVersionsAction(originalId)` → `RecipeVersionSummary[] = {id, name, displayName, isUnderReview, updatedAt}` ordenadas por nombre | `lib/modules/recetas/adapters/driving/recipe-actions.ts:221-271`; `domain/recipe-view.ts:69-75` |
| Borrar versión = `deleteRecipeAction(versionId)`; borrar original da de baja también sus versiones (cascada en `softDeleteAlive`) | `recipe-actions.ts:180-189`; `domain/delete-recipe.ts:34` |
| Detalle de una versión = `getRecipeAction(versionId)`: `original {id,name}`, `isUnderReview`, `displayName`; `steps`, `description`, `imageUrl` **ya vienen de la original**; `lines` son las de la versión | `domain/get-recipe.ts:57-77`; `recipe-view.ts:59-67` |
| `updateRecipeSchema.propagateToVersionIds` (uuid, sin repetidos, `default([])`) | `domain/recipe-input.ts:274-279` |
| `updateRecipe` devuelve `propagated: {versionId, isUnderReview}[]` (R19 de QC-172)… | `domain/update-recipe.ts:24-28,159` |
| …pero **`updateRecipeAction` lo descarta**: responde `{ status: 'success' }` | `recipe-actions.ts:63-66,169-173` → **P1** |
| Esquemas de versión: `createRecipeVersionSchema {name, lines?}`, `updateRecipeVersionSchema {name, lines}` | `recipe-input.ts:284-292` |
| Ficha: Server Component, `requirePagePermission('recetas.consultar')`, `getRecipeAction` + unidades + 1.ª página de productos y de máquinas en paralelo; `recipe_not_found` → estado «no encontrada»; otro error → `RecipeListError` | `app/(private)/produccion/formulas/[id]/page.tsx` |
| `RecipeForm`: estado controlado, `useTransition`, validación previa con el esquema del contrato, éxito → `toast.success` + `router.push(FORMULAS_ROUTE)` + `refresh` | `formulas/components/recipe-form.tsx:180-260` |
| `RecipeLinesField`: fantasma, suma siempre montada (`recipe-lines-sum`, `data-complete`), clamp al restante, aviso de producto no disponible, pestaña de herramientas (solo UI) | `formulas/components/recipe-lines-field.tsx` |
| `DeleteRecipeDialog({ recipe: RecipeSummary })`: `AlertDialog`, sin confirmar no invoca, error deja el diálogo abierto. Solo lo usa la tabla de la lista | `formulas/components/delete-recipe-dialog.tsx`; `recipe-table.tsx:94` |
| Lectura de pasos sin estado: `StepDocumentView` (documento tipado, sin `innerHTML`) | `components/shared/step-reader/step-document-view.tsx:50` |
| Rutas: `FORMULAS_ROUTE`, `NEW_RECIPE_ROUTE`, `recipeEditRoute(id)` | `lib/shared/routes.ts:46-54` |
| Primitivas ya instaladas: `checkbox`, `badge`, `alert-dialog`, `dialog`, `button`, `input`, `label` | `components/ui/` |
| E2E de QC-172 con Prisma directo para comprobar la base | `e2e/versiones-de-receta.spec.ts` |

## 1. Rutas

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/produccion/formulas/[id]` | `[id]/page.tsx` (**cambia**) | Si el detalle es una versión → `redirect(recipeVersionRoute(original.id, id))` (R7). Si es original, pide además `listRecipeVersionsAction(id)` en el mismo `Promise.all`; error → `RecipeListError` (R5). Pinta `RecipeForm` con `versions` y debajo `RecipeVersionList`. |
| `/produccion/formulas/[id]/versiones/nueva` | `[id]/versiones/nueva/page.tsx` (**nueva**) | Alta. `getRecipeAction(id)` + unidades + productos + máquinas. Error `recipe_not_found` **o** detalle con `original !== null` → «no encontrada» (R10). |
| `/produccion/formulas/[id]/versiones/[versionId]` | `[id]/versiones/[versionId]/page.tsx` (**nueva**) | Edición. `getRecipeAction(versionId)` y `getRecipeAction(id)` (líneas de la original, para la diferencia) + unidades + productos + máquinas. «No encontrada» si cualquiera de los dos falla con `recipe_not_found`, si `version.original?.id !== id` o si la de `[id]` no es original (R10). |

- Las dos nuevas abren con `await requirePagePermission('recetas.consultar')` **antes** de `params`,
  como `nueva/page.tsx` y `[id]/page.tsx` (R36): el permiso de escritura lo exige el servicio.
- `nueva` es segmento estático y gana a `[versionId]`; un id es UUID, así que no chocan (mismo
  razonamiento que `formulaImportRoute`, `routes.ts:56-62`).
- `lib/shared/routes.ts` gana `newRecipeVersionRoute(id)` y `recipeVersionRoute(id, versionId)`,
  derivadas de `recipeEditRoute`. No hace falta fila en `PRIVATE_ROUTE_PREFIXES`: `FORMULAS_ROUTE` ya
  cubre los subcaminos por segmentos (`routes.ts:59-61`).
- Sin `loading.tsx`: la ficha de hoy no lo tiene y D9 pide los estados «como ellas».

## 2. Componentes (todos en `formulas/components/`, exportados por su `index.ts`)

### 2.1 `recipe-version-diff.ts` (nuevo, puro, sin React)

```ts
export type VersionLineMark =
  | { kind: 'same' }
  | { kind: 'changed'; originalPercentage: string }   // formato del contrato, «12.50»
  | { kind: 'added' };
export type RemovedLine = { productId: string; productName: string | null; percentage: string };
export function compareWithOriginal(
  original: readonly Pick<RecipeLineView, 'productId' | 'productName' | 'percentage'>[],
  lines: readonly Pick<RecipeLineFormValue, 'productId' | 'percentage'>[],
): { marks: readonly (VersionLineMark | null)[]; removed: readonly RemovedLine[] };
```

- `marks[i]` corresponde a `lines[i]`; `null` si `productId === ''` (R17).
- Compara **centésimas** con `percentageToHundredths` del barrel de `recetas`, tras el mismo
  `replace(',', '.')` que hacen `buildRecipePayload` y el indicador de suma: nunca `number`, nunca
  una copia de la regla (R19). `null` en el lado de la versión con el ingrediente presente en la
  original → `changed` (R19).
- `removed`: líneas de la original cuyo `productId` no está en ninguna línea con producto, en el orden
  de la original (R18).
- Es comparación **para pintar**, no regla de negocio: no decide nada que el servidor vaya a aceptar o
  rechazar. Por eso vive junto a la pantalla (ver alternativa 7.3).

### 2.2 `RecipeLinesField` (cambia: una prop opcional)

`baseline?: readonly RecipeLineView[]` — las líneas de la original. Sin ella, el campo es
**exactamente** el de hoy (los tests existentes de `recipe-lines-*` no cambian). Con ella:
- llama a `compareWithOriginal(baseline, lines)` en cada render (R19);
- pinta en cada fila una `Badge` con `data-testid="recipe-line-mark-<i>"` y `data-mark` =
  `same|changed|added`; en `changed`, «Original: ‹formatPercentage› %» al lado (R17);
- debajo de las filas y fuera de `rows`, la lista «Quitados de la original» (`recipe-lines-removed`,
  una fila `recipe-line-removed-<i>` por línea, con nombre o «Ingrediente no disponible» y su %) (R18).
  No entra en `total`, que ya se calcula solo sobre `lines`.

Es la única forma de cumplir D1 («se reutiliza el editor de líneas; no se crea otro»): la diferencia
se monta **dentro** del editor existente.

### 2.3 `RecipeVersionForm` (nuevo, cliente)

Props: `mode: 'create' | 'edit'`, `original: { id; name; lines: RecipeLineView[] }`,
`version?: RecipeDetail` (en `edit`), `units`, `initialProductPage`, `initialMachinePage`.

- Estado: `{ name, lines }` con `RecipeLineFormValue` de `recipe-form-state.ts`. En `create` las líneas
  salen de `original.lines` con la misma proyección que `buildInitialState` de `recipe-form.tsx`
  (R8); en `edit`, de `version.lines` (R9). La proyección se extrae a `recipe-form-state.ts`
  (`toLineFormValues(lines)`) y la usan los dos formularios: una sola copia.
- `recipe-form-state.ts` gana `buildRecipeVersionPayload(state) → { name, lines }` (R22): mismo
  saneado de líneas que `buildRecipePayload`, sin pasos, descripción ni imagen.
- `canSubmit` = misma expresión que `RecipeForm` (suma completa y todas con producto) (R11).
- Validación previa con `createRecipeVersionSchema` / `updateRecipeVersionSchema` del barrel; errores
  por campo y por línea con los `extract*` de `recipe-form-state.ts`.
- Envío en `useTransition`: `createRecipeVersionAction(original.id, payload)` o
  `updateRecipeVersionAction(version.id, payload)`. Éxito → `toast.success` +
  `router.push(recipeEditRoute(original.id))` + `refresh` (R12, R13). `recipe_duplicate_name` → junto
  al nombre; resto → región de error con `UnexpectedErrorNotice` para el inesperado (R15). Botón
  «Guardando…» con `isPending` (R16). «Cancelar» es un `Link` a la ficha (R14).
- Renderiza: título (lo pone la página), marca «Por revisar» si `version?.isUnderReview` (R23),
  nombre, `RecipeLinesField` con `baseline={original.lines}`, y en `edit` el bloque heredado (§2.4).

### 2.4 Bloque heredado de la original (dentro de `RecipeVersionForm`, solo en `edit`)

- Imagen (`<img>` con `version.imageUrl`, o nada) y descripción como texto, bajo el rótulo «De la
  receta original»; ningún `Input`/`Textarea` (R20).
- Pasos: `version.steps.map(step => <StepDocumentView document={step} isItemChecked={() => false}
  onToggleItem={noop} idPrefix=… />)`, envuelto en un contenedor `inert` + `aria-readonly` para que las
  casillas de las listas de verificación **no** se puedan marcar (R21). Sin pasos: «La receta original
  no tiene pasos.» Se usa la vista sin estado y no `StepReader` porque éste es un asistente paso a
  paso con avance y bloqueo, no una lectura de la ficha.
- En `create` no hay bloque heredado ni campos de descripción o imagen (R20).

### 2.5 `RecipeVersionList` (nuevo, cliente)

Props: `originalId`, `versions: readonly RecipeVersionSummary[]`.
- `section` con encabezado «Versiones» y el enlace «Nueva versión» a `newRecipeVersionRoute` (R4).
- Vacío → `recipe-versions-empty` «Esta receta todavía no tiene versiones.» (R3).
- Una fila por versión en el orden recibido (R1): enlace con `name` a `recipeVersionRoute`, `Badge`
  «Por revisar» (`recipe-version-under-review`) si `isUnderReview` (R2), y `DeleteRecipeDialog` en
  modo versión (R32). `router.refresh()` tras borrar hace que la fila desaparezca.

### 2.6 `DeleteRecipeDialog` (cambia)

Props pasan a `{ recipe: { id; name }; kind?: 'recipe' | 'version' }` (`RecipeSummary` sigue
encajando: la tabla no cambia de llamada).
- `kind: 'version'` → título «Borrar versión», texto «Se va a borrar la versión «‹name›». Esta acción
  no se puede deshacer.»; no cuenta nada (R32).
- `kind: 'recipe'` (por defecto) → al abrir pide `listRecipeVersionsAction(recipe.id)`, descartando
  respuestas de una apertura anterior (mismo patrón de `ref` que `order-form.tsx`). Mientras carga,
  confirmar deshabilitado (R34). N = 0 → texto de hoy; N ≥ 1 → añade «También se borrarán sus N
  versiones.» / «su versión» (R33). Error → `delete-recipe-error` y confirmar deshabilitado (R34).
- Error del borrado: el diálogo sigue abierto, como hoy (R35).

### 2.7 `RecipeForm` (cambia, solo `mode: 'edit'`)

- Prop nueva `versions: readonly RecipeVersionSummary[]` en la rama `edit`.
- `handleSubmit`: tras la validación previa, si `versions.length > 0` abre `PropagateVersionsDialog`
  y **no** invoca nada (R24); si no, el camino de hoy (R28).
- `PropagateVersionsDialog` (nuevo, `AlertDialog`): título «N versiones parten de esta receta» /
  «1 versión parte de esta receta», una `Checkbox` con `Label` por versión (todas marcadas al abrir),
  acciones «Guardar y propagar» (deshabilitada con cero marcadas, R25), «Guardar sin propagar» (R26) y
  «Cancelar» (R27). Cada acción llama a `save(propagateToVersionIds)`, que hace lo de hoy añadiendo el
  campo al payload ya validado.
- Éxito: con ⚑ P1 (a) `result.propagated` llega en la respuesta. Si alguna tiene `isUnderReview`, no
  navega: `toast.success`, `router.refresh()` y estado `underReview: {id, name}[]` (nombres desde la
  prop `versions`) que pinta `recipe-form-under-review` con un enlace por versión (R29). Si ninguna,
  lo de hoy (R30). Error → región de error de hoy (R31).

## 3. Contrato con el servidor

| Uso | Acción | Cambia |
|---|---|---|
| Listar en ficha y contar al borrar | `listRecipeVersionsAction` | no |
| Detalle de versión y de original | `getRecipeAction` | no |
| Alta / edición de versión | `createRecipeVersionAction` / `updateRecipeVersionAction` | no |
| Borrar versión o original | `deleteRecipeAction` | no |
| Guardar original con propagación | `updateRecipeAction(id, { …, propagateToVersionIds })` | **⚑ P1 (a)**: `UpdateRecipeFormState` éxito pasa a `{ status: 'success'; propagated: UpdateRecipeResult['propagated'] }` y la acción devuelve `propagated` del caso de uso. `UpdateRecipeResult` ya sale por el barrel (`index.ts:104`): ni dominio, ni puerto, ni barrel cambian. |

Lo que se comprobó que **no** falta: borrar una versión (`deleteRecipeAction` sirve a las dos) y el
detalle de una versión (`getRecipeAction` ya devuelve pasos/descripción/imagen de la original). Sin
modelo de datos, migración ni RLS nuevos.

## 4. Multiplataforma

Sin excepción declarada. Botones, enlaces y casillas nuevos con `min-h-11 min-w-11` (el `TOUCH_TARGET`
de la ruta); el campo de nombre con `text-base`; diálogos con `max-h-[85dvh]` y scroll interno, como la
vista previa de `RecipeForm`; nada se descubre por `:hover` (R37). La `Checkbox` va dentro de un
`Label` de alto ≥ 44 px para que el objetivo sea la fila entera.

## 5. Guardias y tests existentes que tocan

| Qué | Por qué | Task |
|---|---|---|
| `tests/guards/guard-pantallas-exigen-permiso.test.ts` | Recorre `app/(private)/**/page.tsx`: las dos páginas nuevas entran solas y deben llamar a `requirePagePermission('recetas.consultar')`. Su comentario cuenta «NUEVE» páginas: T0 mira si el número está fijado en una aserción | T0, T8 |
| `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` | Lista a mano las páginas de fórmulas (`:192-210`): añadir las dos nuevas | T8 |
| `tests/guards/guard-rutas-privadas-cubiertas.test.ts` | Puede censar páginas contra `PRIVATE_ROUTE_PREFIXES`: debería salir verde por segmentos; T0 lo confirma | T0 |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | «las tres rutas existen…» y «ningún archivo incrusta el literal de la ruta»: las páginas nuevas usan las funciones de `routes.ts` | T2 |
| `tests/unit/recetas-ui/recipe-form.test.tsx`, `recipe-page.test.tsx` | `RecipeForm` en `edit` exige `versions`; la ficha pide una lectura más | T9, T10 |
| `tests/unit/recetas/recipe-actions.test.ts` | Forma del éxito de `updateRecipeAction` (P1 a) | T1 |
| `tests/unit/identity/session-once-per-request-actions.test.ts` | **No** cambia: no hay acciones nuevas | — |
| `guard-dependencias-aprobadas`, `guard-arquitectura-modulos` | No deben ponerse rojas (R39; los componentes importan solo el barrel y `adapters/driving`, como hoy) | — |

## 6. Trazabilidad prevista (R → test)

| R | Test |
|---|---|
| R1, R2, R3, R4 | `tests/unit/recetas-ui/recipe-version-list.test.tsx` |
| R5, R7 | `tests/unit/recetas-ui/recipe-page.test.tsx` (casos nuevos) |
| R6 | `e2e/versiones-en-la-receta.spec.ts` (la lista de fórmulas no muestra la versión creada) |
| R8, R9, R10, R36 | `tests/unit/recetas-ui/recipe-version-pages.test.tsx`; R36 además `guard-pantallas-exigen-permiso` y `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` |
| R11, R12, R13, R14, R15, R16, R20, R21, R22, R23 | `tests/unit/recetas-ui/recipe-version-form.test.tsx` (R22 también `recipe-form-payload.test.ts`) |
| R17, R18, R19 | `tests/unit/recetas-ui/recipe-version-diff.test.ts` (puro) y `tests/unit/recetas-ui/recipe-lines-baseline.test.tsx` (render) |
| R24–R31 | `tests/unit/recetas-ui/recipe-form-propagation.test.tsx`; R29 servidor: `tests/unit/recetas/recipe-actions.test.ts` |
| R32, R33, R34, R35 | `tests/unit/recetas-ui/delete-recipe-dialog.test.tsx` (nuevo) |
| R37 | Aserciones de clase en `recipe-version-form`, `recipe-version-list`, `recipe-form-propagation` y `delete-recipe-dialog` |
| R38 | `e2e/versiones-en-la-receta.spec.ts` |
| R39 | `tests/guards/guard-dependencias-aprobadas.test.ts` |

### 6.1 El E2E (R38, D4)

Siembra con Prisma (patrón de `e2e/versiones-de-receta.spec.ts`): empresa, admin, tres insumos A, B,
C y una original «A 60 / B 40». Por pantalla:
1. Ficha → «Nueva versión» «Copia» sin tocar líneas → guarda (queda A 60 / B 40).
2. «Nueva versión» «Cambiada»: B 30 y añade C 10 → guarda. Edita «Cambiada» y la renombra
   «Cambiada 2» (cubre la edición).
3. Lista de fórmulas: no aparece ninguna de las dos (R6).
4. Ficha de la original: A 70 / B 30 → Guardar → aviso con dos casillas marcadas → «Guardar y propagar».
5. Postgres: «Copia» queda A 70 / B 30 (suma 100, no por revisar). «Cambiada 2»: A no la cambió → 70; B
   y C sí → 30 y 10; suma 110 → por revisar (QC-172 R15/R21).
6. Pantalla: aviso persistente nombra solo «Cambiada 2» (R29); en la sección «Versiones», «Por revisar»
   solo en ella.

## 7. Alternativas descartadas

1. **Un tercer modo `version` en `RecipeForm`.** Ahorraría un archivo, pero la versión no tiene imagen,
   descripción ni pasos editables, usa otros esquemas y otras acciones, y vuelve a otra página: cada
   rama de `RecipeForm` (estado inicial, payload, esquema, acción, navegación, render) ganaría un `if`.
   Lo que D1 obliga a reutilizar es el **editor de líneas**, y eso se reutiliza entero (§2.2).
2. **Releer las versiones tras guardar para saber cuáles quedaron por revisar (P1 b).** Sin tocar
   servidor, pero son dos peticiones y lo pintado sería el estado de la segunda lectura, no el
   resultado de la escritura que D3 cita (QC-172 R19). Se recomienda (a).
3. **Calcular la diferencia en el dominio de `recetas`** (`lib/modules/recetas/domain`). Ningún caso de
   uso la necesita y nada en el servidor decide con ella; meterla allí sería código de servidor en una
   ficha `frontend` para algo que solo pinta. Se compara con `percentageToHundredths` del barrel, así
   que la aritmética de porcentajes sigue en un único sitio.
4. **Casillas de propagación siempre visibles en la ficha** en vez del aviso al guardar. Descartada por
   D3 («al guardar … aviso»): además pediría decidir antes de saber si se iba a cambiar algo.
5. **Borrar la versión desde su propia página** en vez de desde la lista de la ficha. Se descarta para
   no duplicar el diálogo: la lista es donde se ven todas y es el mismo patrón que la lista de fórmulas
   (borrar desde la fila).
6. **`StepReader` para los pasos heredados.** Es un asistente con avance, bloqueo por casillas y
   espera; la página de la versión solo tiene que enseñar los pasos (§2.4).

## 8. Cruce con otras fichas (para F2.0)

| Ficha | Estado | Archivos en común |
|---|---|---|
| QC-173 fases-en-los-pasos | pending | Probables: `recipe-steps-field.tsx`, `recipe-step-*`, `recipe-form.tsx` (si el editor de pasos cambia de props) y `step-document-view.tsx` (si las fases cambian el render de lectura). Esta ficha toca `recipe-form.tsx` (T10) y **usa** `StepDocumentView` sin modificarlo |
| QC-170 / QC-164 | pending | Ninguno (`pedidos`) |

## 9. Dependencias

Ninguna nueva (R39, D9): `checkbox`, `badge`, `alert-dialog`, `sonner` y `lucide-react` ya están.
