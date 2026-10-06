# QC-211 — pasos-de-envasado · design.md

> Cubre `requirements.md` R1–R32. Sin dependencias nuevas. Una migración (columna nueva en
> `recipes`). Grafo de código no consultado en esta tanda: lo explorado se leyó con Grep/Read sobre
> el worktree (rama `feature/QC-211-pasos-de-envasado`, base `origin/dev`).

## 1. Resumen

Los pasos de envasado son **una segunda lista de documentos de paso** en la receta, con el mismo
esquema que `steps` y guardada en su propia columna. Se escriben por los mismos casos de uso de
`recetas` (alta, edición e importación) y se leen por dos caminos que no se cruzan:

| Quién lee | Por dónde | Recibe |
|---|---|---|
| Administrador (ficha, formulario, versión) | `getRecipe` → `RecipeDetail` | `steps` y `packingSteps` |
| Operador (`/asignacion/[id]`) | `RecipeCatalog.findExecutionContentById` (sin cambios) | solo `steps` |
| Empacador (`/asignacion/empaque/[id]`) | `RecipePackingStepsReader.findPackingStepsById` (nuevo) | solo `packingSteps` |

La separación de D9 sale **de la forma de los contratos**, no de un filtro: la ejecución del
operador no tiene ningún campo donde puedan llegar los pasos de envasado, y el empaque no tiene
ninguno donde lleguen los del operador.

## 2. Modelo de datos

### 2.1 Columna

```prisma
model Recipe {
  // ...
  steps          Json      @default("[]")
  packingSteps   Json      @default("[]") @map("packing_steps")
  // ...
}
```

Migración `db/migrations/<ts>_recipe_packing_steps/` (`<ts>` posterior a la última de `dev`):

```sql
-- migration.sql
ALTER TABLE "recipes" ADD COLUMN "packing_steps" JSONB NOT NULL DEFAULT '[]';
```

```sql
-- down.sql
ALTER TABLE "recipes" DROP COLUMN "packing_steps";
```

- **Sin relleno de datos** (D13, R5): el `DEFAULT '[]'` deja todas las filas existentes con la lista
  vacía en el mismo `ALTER`. `steps` no se toca.
- **Sin tabla nueva**: no cambia RLS ni la lista de tablas exentas de empresa. `recipes` ya tiene
  `company_id`, RLS y `FORCE ROW LEVEL SECURITY`; la columna hereda todo eso.
- **Sin `CHECK` de forma en la base**, igual que `steps`: la forma la valida el dominio con zod al
  escribir y el adaptador la tolera al leer (§3.3).
- Una versión guarda siempre `[]` (como hace hoy con `steps`) y se lee la de su original (§3.4).

### 2.2 Tests de esquema que cambian

`tests/unit/recetas/schema/recetas-schema.test.ts` fija hoy que `steps` es **el único** campo
`Json` de `Recipe` («no existe ningún modelo de paso»). Se enmienda: los campos `Json` pasan a ser
exactamente `['packingSteps', 'steps']`, `packingSteps` mapea a `packing_steps`, no es opcional y
declara `@default("[]")`. Sigue sin existir ningún modelo ni tabla de paso.

## 3. Dominio `recetas`

### 3.1 Esquemas de entrada (`domain/recipe-input.ts`)

`recipeStepsSchema` (ya existe: `z.array(recipeStepSchema).max(MAX_RECIPE_STEPS).default([])`)
se reutiliza **tal cual** para la lista nueva, de modo que el formato y los topes son los mismos
por construcción (D2, R2) y cada lista cuenta sus 50 por separado (R3):

```ts
export const createRecipeSchema = z.object({
  // ...igual que hoy
  steps: recipeStepsSchema,
  packingSteps: recipeStepsSchema,
  // ...
});

export const updateRecipeSchema = z.object({
  // ...igual que hoy
  steps: recipeStepsSchema,
  packingSteps: recipeStepsSchema,
  // ...
});
```

- **Omitida = lista vacía** (R1), igual que `steps`. Ver la alternativa descartada §10.F.
- Los esquemas de versión (`createRecipeVersionSchema`, `updateRecipeVersionSchema`) **no cambian**:
  son `z.object` sin `.strict()`, así que una clave `packingSteps` en la entrada se descarta en el
  borde y no llega al caso de uso (R10). Un test lo fija para que nadie lo «arregle» con `.strict()`
  sin darse cuenta de que cambia el contrato.
- La autorización no cambia: `createRecipe`, `updateRecipe` y la confirmación de importación ya
  exigen `recetas.modificar` en su primera línea, antes de validar (R6).

### 3.2 Tipos y puerto del repositorio

| Archivo | Cambio |
|---|---|
| `ports/recipe-repository.ts` | `NewRecipe.packingSteps`, `RecipeRow.packingSteps`, `RecipeOriginalRow.packingSteps` (todos `readonly RecipeStepView[]`). |
| `domain/recipe-view.ts` | `RecipeDetail.packingSteps: readonly RecipeStepView[]`. `RecipeSummary` no cambia: el listado no cuenta ni muestra pasos de envasado. |
| `domain/create-recipe.ts` | pasa `packingSteps: data.packingSteps` al repositorio. |
| `domain/update-recipe.ts` | ídem en las dos vías de reemplazo del repositorio (con y sin propagación a versiones). |
| `domain/update-recipe-version.ts` | pasa `packingSteps: []` explícito a `replaceAlive`, como ya hace con `steps` (R10). `create-recipe-version.ts` no cambia: `NewRecipeVersion` no lleva pasos y el adaptador escribe `[]` (§3.3). |
| `domain/get-recipe.ts` | `packingSteps: shared.packingSteps` (la original si es versión: R11, R13). |

### 3.3 Adaptador Prisma (`adapters/driven/persistence/recipe-prisma.ts`)

- `RECIPE_INCLUDE.parent.select` añade `packingSteps: true`.
- `toRecipeRow` mapea `packingSteps: toSteps(row.packingSteps)` y lo mismo en `original`. Se reusa
  `toSteps`: un elemento que no pasa el esquema se descarta conservando el orden (misma tolerancia
  que `steps`).
- `createRecipe`, `replaceAliveRecipe` y `replaceAliveRecipeWithPropagation` escriben
  `packingSteps`; `createRecipeVersion` escribe `packingSteps: []`, junto al `steps: []` que ya
  escribe.

### 3.4 Lector nuevo para el empaque

Un contrato **aparte** de `RecipeCatalog`, publicado por el barrel de `recetas`:

```ts
// lib/modules/recetas/domain/recipe-packing-steps-reader.ts
export interface RecipePackingStepsReader {
  /** Los pasos de envasado con que se empaca una receta, INCLUIDA UNA DADA DE BAJA. Una versión
   *  devuelve los de su original. `null` = el id no existe o es de otra empresa. */
  findPackingStepsById(id: RecipeId, companyId: string): Promise<readonly RecipeStepView[] | null>;
}
```

Implementación en `adapters/driven/persistence/recipe-catalog-prisma.ts`, junto a
`findExecutionContentByIdOn` y con el mismo criterio:

- `where: { AND: [recipeCompanyScope({ companyId }), { id }] }`, **sin** `deletedAt: null`: una
  receta dada de baja se sigue empacando, igual que se sigue ejecutando (R30).
- `select: { packingSteps: true, parent: { select: { packingSteps: true } } }`, y se devuelve
  `parent === null ? row.packingSteps : row.parent.packingSteps`, pasado por la misma validación
  tolerante que `toExecutionSteps` (R11).
- Función pura exportada `toRecipePackingSteps(row)` para testearla sin base.

Lo cablea `lib/composition/index.ts` en `createGetPackingOrder({ ..., packingSteps: { findPackingStepsById } })`.

**`findExecutionContentById` no cambia**: su `select` no pide `packing_steps`, y
`RecipeExecutionContent` no gana ningún campo. Con eso la ejecución del operador no puede recibir
pasos de envasado (R26). Un test lo fija sobre el `select` y sobre la forma del contenido.

## 4. Dominio `asignaciones` — `getPackingOrder`

```ts
// domain/packing-order-view.ts
export type PackingOrderDetail = PackingOrderRow & {
  /** Vacío salvo `EN_EMPAQUE` a nombre del actor. Nunca trae pasos del operador. */
  readonly packingSteps: readonly RecipeStepView[];
};

// domain/get-packing-order.ts
export type GetPackingOrderDeps = PackingOrderViewDeps & {
  readonly orders: OrderCatalog;
  readonly packingSteps: RecipePackingStepsReader;
};
```

Flujo, en orden:

1. `requirePermission(actor, 'empaque.modificar')` — **sin cambios**, primera línea, antes de
   validar y de tocar ningún puerto (R28). No se añade ningún otro permiso: el empacador no
   necesita `recetas.consultar` ni `asignaciones.ejecutar` (D10).
2. Validar `{ orderId }` y leer el resumen y la fila igual que hoy.
3. **Solo si** `summary.status === 'EN_EMPAQUE' && summary.packedBy === actor.id`, llamar a
   `deps.packingSteps.findPackingStepsById(summary.recipeId, actor.companyId)` y usar `?? []`.
   En cualquier otro caso `packingSteps: []` **sin llamar al lector** (R19, R22).
4. Devolver `{ ...row, packingSteps }`.

Por qué se decide en el servidor y no en la pantalla: con la condición en el caso de uso, «antes de
Comenzar no se muestran» (D6) es cierto también en el HTML y en la respuesta de la página, no solo
en lo que se pinta. La pantalla ya decide `canFinish` con la misma comparación (`packedById ===
actorId`), así que las dos reglas coinciden.

`listPackingOrders` **no cambia**: la lista no lee pasos. `startPacking` y `finishPacking` **no
cambian** (R24): terminar no recibe ni comprueba nada sobre el recorrido.

La empresa sale del actor (R29): un `recipeId` de otra empresa devuelve `null` en el lector y la
pantalla recibe `[]`.

## 5. UI

### 5.1 `StepReader` (`components/shared/step-reader/step-reader.tsx`)

Dos props opcionales nuevas, sin cambiar nada cuando se omiten:

| Prop | Por defecto | Efecto |
|---|---|---|
| `finishLabel?: string` | `'Finalizar'` | Texto del botón del último paso (R21). |
| `finishBusy?: boolean` | `false` | Deshabilita el botón del último paso y pone `aria-busy` mientras la acción de terminar está en curso, para no enviarla dos veces. |

El bloqueo por checks y por espera (R23) es el que ya existe; no se toca. El docblock de la
enmienda de `mode="ejecucion"` se mantiene; estas dos props quedan amparadas por R21 de esta ficha.

### 5.2 Pantalla de empaque (`app/(private)/asignacion/empaque/[id]/components/packing-order-screen.tsx`)

- `order: PackingOrderDetail`. `page.tsx` no cambia de código: ya pasa lo que devuelve
  `getPackingOrder`.
- `const showsPackingSteps = canFinish && order.packingSteps.length > 0`.
- Con `showsPackingSteps`:
  - Se monta `StepReader` con `steps={order.packingSteps}`, `mode="ejecucion"`,
    `minStepSeconds={PACKING_MIN_STEP_SECONDS}` (5), `title="Pasos de envasado"`,
    `finishLabel={FINISH_LABEL}` (el «Terminar» de hoy), `finishBusy={finishPending}`, y
    `onFinish` que **dispara exactamente el mismo manejador que hoy dispara el botón Terminar**
    (hoy: `requestSubmit()` del formulario de terminar). El formulario se conserva oculto con su
    `orderId`, igual que en `order-execution-screen.tsx` (R21).
  - El botón Terminar suelto **no se pinta** (R20).
  - Los errores de terminar se siguen pintando en la misma región `PACKING_ORDER_FINISH_ERROR_TESTID`.
- Sin `showsPackingSteps`, la pantalla es la de hoy, byte a byte en sus tres estados (R25).
- Nuevo testid `packing-order-steps` en el contenedor del paso a paso.
- El estado del recorrido vive en `StepReader`, en memoria (R31): no hay `localStorage` ni URL.

Constante local `PACKING_MIN_STEP_SECONDS = 5` en vez de importar la de la ejecución del operador:
`order-execution-screen.tsx` no exporta la suya y tocarla añadiría un archivo al diff (§9). El test
de la pantalla fija los 5 s con temporizadores falsos, que es lo que hace cumplir D7.

### 5.3 Editor de pasos (`app/(private)/produccion/formulas/components/recipe-steps-field.tsx`)

Se vuelve reutilizable dos veces en el mismo formulario con props opcionales:

| Prop | Por defecto (pasos del operador) | Pasos de envasado |
|---|---|---|
| `title` | `'Pasos'` | `'Pasos de envasado'` |
| `addLabel` | `'Añadir paso'` | `'Añadir paso de envasado'` |
| `testIdPrefix` | `'recipe-step'` | `'recipe-packing-step'` |

Con el prefijo por defecto, **todos** los `data-testid` de hoy se conservan
(`recipe-steps-field`, `recipe-step-add`, `recipe-steps-list`, `recipe-step-row`,
`recipe-step-handle-N`, `recipe-step-text-N`, `recipe-step-field-error-N`, `recipe-step-remove-N`):
los E2E y tests existentes no cambian. Con el prefijo de envasado salen
`recipe-packing-steps-field`, `recipe-packing-step-add`, `recipe-packing-step-text-N`, etc. Cada
instancia tiene su propio `DndContext`, así que arrastrar en una lista no mueve la otra. Los
anuncios de `aria-live` hablan de «paso» en las dos; no hace falta distinguirlos porque el foco ya
está dentro de la sección.

### 5.4 Formulario de fórmula (`recipe-form.tsx`, `recipe-form-state.ts`)

- `RecipeFormState.packingSteps: readonly RecipeStepFormValue[]`; `buildInitialState` la carga
  desde `recipe.packingSteps` (R9) o `[]` en alta.
- `RecipePayload.packingSteps` y `buildRecipePayload` la proyectan a documentos, en orden (R8).
- `extractStepErrors(issues, root = 'steps')`: el segundo parámetro permite extraer los errores de
  `['packingSteps', i]` sin mezclarlos con los de `['steps', i]` (R8).
- La sección nueva va **después** de «Pasos» y antes de los botones.
- La vista previa sigue mostrando solo los pasos del operador: previsualizar el envasado no está
  pedido.

### 5.5 Versión (`recipe-version-form.tsx`)

Bloque de solo lectura calcado del de los pasos heredados: `inert`, `aria-readonly`,
`StepDocumentView` sin marcado. Testids `recipe-version-inherited-packing-steps` y
`recipe-version-packing-steps-empty` («La receta original no tiene pasos de envasado.») (R12).

### 5.6 Multiplataforma

Sin excepción: el paso a paso del empaque es el modo `ejecucion` de `StepReader`, que ya cumple la
regla (botonera `sticky` con `env(safe-area-inset-bottom)`, objetivos de 64 px, sin `:hover`). El
editor es el mismo que ya se usa en el formulario.

## 6. Importación desde PDF

### 6.1 Estructura (código)

El proveedor, el lector y el puerto de IA **no cambian**. Cambia lo que se pide (prompt, §6.2) y lo
que se lee:

| Archivo | Cambio |
|---|---|
| `documentos/domain/formula-extraction.ts` | Lee `parsed.packingSteps` con el mismo tratamiento que `parsed.steps`: ausente o `null` → `[]` (R15); ni lista ni `null` → `ValidationError` con el diagnóstico `'packingSteps' no es ni lista ni null`; cada cadena pasa por `stepTextToDocument` (R14). `FormulaExtraction.packingSteps`. |
| `documentos/domain/preview-formula-import.ts` | `FormulaImportPreview.packingSteps = extraction.packingSteps`. |
| `documentos/domain/review-formula-import.ts` | `FormulaDraft.packingSteps`; `FormulaReviewIssues.packingSteps: 'ok' \| 'too_many' \| 'invalid'` con la misma `stepsStatus`; `canConfirm` exige también `packingSteps === 'ok'` (R17). |
| `documentos/domain/formula-import-input.ts` | `confirmFormulaImportInputSchema` añade `packingSteps: z.array(z.unknown()).max(MAX_RECIPE_STEPS).default([])`. |
| `documentos/domain/confirm-formula-import.ts` | Revisa con `packingSteps`, añade `pasos de envasado: …` al diagnóstico, parsea cada uno con `recipeStepSchema` y los pasa a `createRecipe`/`updateRecipe` (R17, R18). |
| `documentos/adapters/driven/ai/ai-reader-canned.ts` | `CANNED_FORMULA_TEXT` gana `packingSteps` con dos pasos (constantes exportadas para los tests). Sigue siendo solo JSON (QC-159 R37c). |
| `app/(private)/produccion/formulas/importar/[documentoId]/components/formula-import-review.tsx` | Segundo `RecipeStepsField` con el prefijo de envasado; el estado y el payload de confirmar llevan `packingSteps`; motivo propio: «Hay más de 50 pasos de envasado.» / «Revisa los pasos de envasado: alguno no es válido.» (R16, R17). |
| `tests/unit/documentos/qc159-alcance.test.ts` | `CLAVES_PERMITIDAS` añade `'packingSteps'` (inglés, `[a-zA-Z]+`, cumple la regla de esa guardia). |

Orden de despliegue: el código es tolerante en los dos sentidos. Con el prompt viejo, la IA no
devuelve `packingSteps` y la importación sigue igual que hoy con la lista vacía (R15). Con el prompt
nuevo y código viejo, la clave extra se ignora.

### 6.2 Cómo separa la IA los pasos (resuelve la pregunta abierta)

**Decisión: lo separa el prompt; el código no aplica ninguna heurística.** La IA ya lee el
documento entero y es quien mejor distingue «envasar en garrafas de 5 L» de «agitar 10 minutos»;
una lista de palabras clave en código sería frágil, dependería del idioma y del vocabulario de cada
empresa, y duplicaría una decisión que de todas formas revisa el Administrador (D5, R16).

El prompt vive fuera del repo (`FORMULA_PROMPT`, leído en
`documentos/adapters/driven/config/strategy-prompt-env.ts`, sin texto por defecto; QC-129). Este
spec **no** puede cambiarlo: propone el añadido y **el humano lo aprueba y lo carga** en `.env` y
en Vercel, en cada entorno (task T15). Texto propuesto para añadir al prompt actual, junto a la
descripción de `steps`:

```text
Además de "steps", devuelve "packingSteps": una lista de cadenas con los pasos de ENVASADO, en
el orden del documento, una cadena por paso y un salto de línea entre las líneas de un mismo paso.
Son pasos de envasado los que ocurren con el producto ya fabricado: llenar o envasar en
recipientes, tapar, sellar, etiquetar, codificar o marcar lotes, embalar, encajar, paletizar o
preparar para despacho.
- Si el documento tiene una sección de envasado, empaque o acondicionamiento, sus pasos van a
  "packingSteps" y no a "steps".
- Si no la tiene, pasa a "packingSteps" solo los pasos que sean claramente de envasado según la
  lista anterior. Si dudas, déjalo en "steps".
- Ningún paso puede ir en las dos listas.
- Si no hay pasos de envasado, devuelve "packingSteps": [].
```

La regla de la duda es deliberada: un paso de envasado que se queda con el operador se ve en la
revisión y se mueve a mano; un paso de fabricación que se va al empacador lo dejaría fuera de la
ejecución del operador si nadie lo revisa.

## 7. Contratos de entrada y salida (resumen)

| Contrato | Antes | Después |
|---|---|---|
| `createRecipeSchema` / `updateRecipeSchema` | `steps` | `steps`, `packingSteps` (ambas `default([])`) |
| `RecipeDetail` | `steps` | `steps`, `packingSteps` |
| `RecipeExecutionContent` (operador) | `steps` | **sin cambios** |
| `RecipePackingStepsReader` | — | `findPackingStepsById(id, companyId)` |
| `getPackingOrder` → | `PackingOrderRow` | `PackingOrderDetail` (`PackingOrderRow` + `packingSteps`) |
| JSON de la IA (fórmula) | `name, description, ingredients, steps` | + `packingSteps` (opcional) |
| `confirmFormulaImportInputSchema` | `steps` | `steps`, `packingSteps` (`default([])`) |
| `StepReaderProps` | — | + `finishLabel?`, `finishBusy?` |
| `RecipeStepsFieldProps` | — | + `title?`, `addLabel?`, `testIdPrefix?` |

## 8. Dependencias

Ninguna nueva. Todo se hace con zod, Prisma, dnd-kit y los componentes que ya están en el repo.

## 9. Coordinación con otras fichas

- **QC-202** (`pending`, cambia el estado al que lleva Terminar el empaque). Esta ficha **no toca**
  `finish-packing.ts`: R21 exige «terminar exactamente como hoy», que después de QC-202 será lo que
  QC-202 deje. Las dos tocan `packing-order-screen.tsx` y su test (QC-202 R24 cambia la
  confirmación que se pinta al terminar), así que no pueden estar `in_progress` a la vez sin
  resolver ese solape. Conviene que la segunda en mergear rebase sobre la primera.
- **QC-210** (`pending`, frontend). Toca `recipe-form.tsx` (acciones Guardar / Guardar y salir /
  Cancelar y versiones en el alta) y, con toda probabilidad, `recipe-form-state.ts`. **Solape de
  archivos declarado**: no pueden ir en paralelo en F2.0; la segunda rebasa.
- **QC-173** (fases en los pasos del operador). Fuera de alcance (D del alcance). Si llega a tocar
  `recipe-input.ts` o `recipe-steps-field.tsx`, solapa con esta ficha en esos dos archivos.
- **Trabajo sin commitear en el árbol principal** (`dev`, fuera del worktree): `git status` muestra
  cambios en `packing-order-screen.tsx` y `order-execution-screen.tsx` y un
  `components/shared/confirm-action-dialog.tsx` nuevo (diálogo de confirmación antes de Comenzar y
  Terminar). No es de esta ficha y no está en `origin/dev`. Si entra antes, el `onFinish` del paso a
  paso **debe pasar por la misma confirmación** que el botón Terminar (R21 dice «misma acción»): el
  implementer engancha `onFinish` al manejador del botón, no al `requestSubmit()` directamente.
  El leader debe saber de qué ficha es ese cambio antes de F2.0.

## 10. Alternativas descartadas

- **A. Una sola columna `steps` con una marca por paso (`phase: 'packing'`).** Descartada. D2 pide
  guardarlos aparte. Además obliga a **todo** consumidor de `steps` a filtrar —ejecución, versión,
  vista previa, importación—, y un filtro olvidado le enseña al operador los pasos del empacador,
  justo lo que prohíbe D9. Y chocaría con QC-173, que va a meter fases en los pasos del operador.
- **B. Tabla `recipe_packing_steps` (una fila por paso).** Descartada. Los pasos del operador son un
  `Json` en `recipes` y el test de esquema fija que no hay modelo de paso; tener dos formas para lo
  mismo duplicaría la validación, la tolerancia de lectura y la reordenación (que con `Json` es
  reescribir la lista). Una tabla nueva tampoco aporta nada pedido: no hay consulta por paso.
- **C. Añadir `packingSteps` a `RecipeExecutionContent`.** Descartada. La ejecución del operador
  recibiría los pasos de envasado y dependería de que nadie los pintara: D9 dejaría de cumplirse por
  construcción y pasaría a cumplirse por disciplina.
- **D. Añadir el método a `RecipeCatalog`.** Descartada. `RecipeCatalog` lo consumen `pedidos` y
  `asignaciones` para cosas que no son empacar, y tiene dobles completos en ~24 archivos de test que
  habría que tocar todos para que compilen. Un contrato aparte de un solo método solo lo recibe
  `getPackingOrder`.
- **E. Heurística en código para separar los pasos del PDF** (palabras clave como «envasar»,
  «etiquetar»). Descartada en §6.2.
- **F. `packingSteps` opcional en la edición con «omitida = conservar»** (el patrón de `tools`).
  Descartada. `tools` lo necesita porque la confirmación por PDF no las manda; aquí las dos vías que
  editan (formulario e importación) siempre mandan la lista, y el reemplazo por PDF **debe**
  sustituir los pasos de envasado igual que sustituye los del operador (R18). Un tercer estado
  añadiría un `null` en el puerto sin ningún llamador que lo use.
- **G. Ocultar los pasos antes de Comenzar solo en la pantalla.** Descartada en §4: viajarían en el
  HTML de una pantalla en `POR_EMPACAR`.
- **H. Validar en el servidor que se recorrieron los pasos antes de Terminar.** Fuera de alcance
  (D7 y «Lo que NO entra»).

## 11. Riesgos

- **El prompt no se actualiza.** La importación sigue funcionando y nunca propone pasos de
  envasado; el Administrador los escribe a mano en la revisión. No rompe nada (R15), pero D5 queda
  a medias hasta T15. Se dice en el PR.
- **Doble envío de Terminar desde el último paso.** Lo cubre `finishBusy`; si aun así llegaran dos,
  `finishPacking` rechaza el segundo porque el pedido ya no está `EN_EMPAQUE`.
- **Editar los pasos con un empacador a mitad de recorrido** (D11). Lo que tiene en pantalla no
  cambia hasta que la recargue; al recargar empieza desde el primer paso con los nuevos (R30, R31).
  Aceptado por el humano.

## 12. Trazabilidad prevista

| Requisito | Test previsto |
|---|---|
| R1, R2, R3 | `tests/unit/recetas/recipe-input.test.ts` |
| R4 | `tests/unit/recetas/packing-steps.test.ts`; `tests/integration/recetas/packing-steps.int.test.ts` |
| R5 | `tests/unit/recetas/schema/recetas-schema.test.ts`; `tests/integration/recetas/recipe-packing-steps-migration.int.test.ts` |
| R6 | `tests/unit/recetas/packing-steps.test.ts`; `tests/unit/documentos/confirm-formula-import.test.ts` |
| R7, R8, R9 | `tests/unit/recetas-ui/recipe-form-packing-steps.test.tsx` |
| R10, R11 | `tests/unit/recetas/packing-steps.test.ts`; `tests/unit/recetas/recipe-packing-steps-reader.test.ts`; `tests/integration/recetas/packing-steps.int.test.ts` |
| R12 | `tests/unit/recetas-ui/recipe-version-form.test.tsx` |
| R13 | `tests/integration/recetas/packing-steps.int.test.ts` |
| R14, R15 | `tests/unit/documentos/formula-extraction.test.ts` |
| R16 | `tests/unit/recetas-ui/formula-import-review.test.tsx` |
| R17 | `tests/unit/documentos/review-formula-import.test.ts`; `tests/unit/documentos/confirm-formula-import.test.ts`; `tests/unit/recetas-ui/formula-import-review.test.tsx` |
| R18 | `tests/unit/documentos/confirm-formula-import.test.ts`; `tests/integration/documentos/formula-import.int.test.ts` |
| R19, R22 | `tests/unit/asignaciones/get-packing-order.test.ts`; `tests/unit/asignaciones-ui/packing-order-screen.test.tsx` |
| R20, R21, R23, R25, R31 | `tests/unit/asignaciones-ui/packing-order-screen.test.tsx`; `tests/unit/recetas-ui/step-reader.test.tsx` (props nuevas) |
| R24 | `tests/unit/asignaciones/finish-packing.test.ts` |
| R26 | `tests/unit/asignaciones/get-assigned-order-execution.test.ts`; `tests/unit/recetas/recipe-packing-steps-reader.test.ts` (el `select` de ejecución no pide `packingSteps`) |
| R27 | `tests/unit/asignaciones/get-packing-order.test.ts`; `tests/unit/asignaciones-ui/packing-order-screen.test.tsx` |
| R28 | `tests/unit/asignaciones/get-packing-order.test.ts` |
| R29, R30 | `tests/integration/recetas/packing-steps.int.test.ts`; `tests/unit/asignaciones/get-packing-order.test.ts` |
| R32 | `e2e/pasos-de-envasado.spec.ts` |
