# QC-62 — pasos-de-receta-enriquecidos · tasks.md

> Orden y dependencias explícitas. `[P]` = puede correr en paralelo con las tareas marcadas igual,
> porque no tocan los mismos archivos. Cada tarea tiene su criterio de «hecho»; una tarea sin
> criterio comprobable no está hecha, está abandonada.
>
> **Aviso que va en cada commit y en la PR:** T8 **borra los pasos de todas las recetas
> existentes** y es **irreversible** (R14, R15, decisión cerrada 5).

## Fase 1 — Dominio y contrato

- [x] **T1 — Esquema del documento del paso.**
      Archivos: `lib/modules/recetas/domain/recipe-input.ts`.
      Reescribe `recipeStepSchema` como el documento de `design.md > 2`
      (`paragraph`/`checklist`, `spans` con `bold`/`italic`), con `.strict()` en cada objeto,
      **sin `.trim()` y sin `.max()`** en `text`. Añade `MAX_STEP_ELEMENTS`, la función pura
      `countRecipeStepElements` y los `superRefine` de paso vacío, ítem vacío y tope de elementos.
      Borra `RECIPE_STEP_TYPES` y `RecipeStepType`. `recipeStepsSchema` conserva `.max(50)` y
      `.default([])`.
      **Hecho cuando:** el archivo ya no menciona `type` ni `1000`, y `pnpm typecheck` sólo falla en
      los consumidores listados en `design.md > 6` (aún no tocados).
      Depende de: —.

- [x] **T2 — Vista y contrato público.**
      Archivos: `lib/modules/recetas/domain/recipe-view.ts`, `lib/modules/recetas/index.ts`.
      `RecipeStepView` pasa a ser el documento (alias, no copia). El barrel deja de exportar
      `RECIPE_STEP_TYPES`/`RecipeStepType` y publica lo de `design.md > 5`.
      **Hecho cuando:** ningún archivo del repo importa `RecipeStepType`, y el barrel sigue sin
      arrastrar servidor (guardia de arquitectura en verde).
      Depende de: T1.

- [x] **T3 — Lectura desde Prisma.**
      Archivos: `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts`.
      Reescribe `toSteps`: **exportada** (para poder testearla), valida cada elemento del array con
      `recipeStepSchema` y descarta el que no pase, conservando los demás y su orden. Elimina la
      tolerancia a pasos guardados como cadena suelta y el relleno `type: 'texto'`.
      **Hecho cuando:** el archivo no menciona `'texto'` ni `'checklist'` y T10 pasa.
      Depende de: T1, T2.

## Fase 2 — Datos

- [x] **T4 — Migración de borrado de pasos. [P]**
      Archivos: `db/migrations/<timestamp>_recipe_steps_reset/migration.sql` y `down.sql` (nuevos,
      carpeta creada a mano: no hay drift de esquema, ver `design.md > 4`).
      UP: `UPDATE "recipes" SET "steps" = '[]'::jsonb;` **sin `WHERE`** (alcanza a las borradas
      lógicamente). DOWN: el mismo UPDATE, con el comentario que declara la irreversibilidad.
      **NO se abre `db/schema.prisma`.**
      **Hecho cuando:** las dos rutas existen, T11 pasa, y `git diff --stat` no incluye
      `db/schema.prisma`.
      Depende de: —.

## Fase 3 — Puente de la pantalla (R19)

- [x] **T5 — Estado y payload del formulario.**
      Archivos: `app/(private)/produccion/formulas/components/recipe-form-state.ts`.
      Quita `type` de `RecipeStepFormValue` y de `RecipeStepPayload`; `RecipeStepPayload` pasa a ser
      el documento del contrato. Añade las dos funciones puras del puente:
      `textToStepDocument(text)` y `stepDocumentToText(document)`.
      **Hecho cuando:** `buildRecipePayload` produce `{ blocks: [{ kind: 'paragraph', spans: [{ text }] }] }`
      y T12 pasa.
      Depende de: T2.

- [x] **T6 — Campo de pasos sin selector de tipo. [P con T7]**
      Archivos: `app/(private)/produccion/formulas/components/recipe-steps-field.tsx`.
      Retira el `<Select>` de tipo, `STEP_TYPE_LABELS` y el import de `RECIPE_STEP_TYPES`; el resto
      (arrastre, teclado, asa ≥ 44×44 px) **no se toca**.
      **Hecho cuando:** el archivo no importa nada de tipos de paso y `pnpm lint` pasa.
      Depende de: T5.

- [x] **T7 — Precarga de edición. [P con T6]**
      Archivos: `app/(private)/produccion/formulas/components/recipe-form.tsx`.
      La precarga usa `stepDocumentToText(step)` en vez de `step.body`/`step.type`.
      **Hecho cuando:** `pnpm typecheck` pasa **en todo el repo** (esta es la tarea que cierra la
      compilación).
      Depende de: T5.

## Fase 4 — Tests

- [x] **T8 — Tests del documento del paso.** (nuevo)
      Archivos: `tests/unit/recetas/recipe-step-document.test.ts`.
      Cubre R1–R8, R11, R12, R13 según la tabla de trazabilidad.
      **Hecho cuando:** cada requisito de esa lista tiene al menos un caso positivo y uno negativo.
      Depende de: T1.

- [x] **T9 — Test del contrato público.** (nuevo)
      Archivos: `tests/unit/recetas/recipe-step-contract.test.ts`.
      Afirma en runtime que el barrel **no** exporta `RECIPE_STEP_TYPES` y que un `RecipeDetail`
      construido desde el puerto no lleva `type` en sus pasos (R9, R10).
      **Hecho cuando:** el test falla si alguien reintroduce el símbolo.
      Depende de: T2.

- [x] **T10 — Test de lectura tolerante.** (nuevo)
      Archivos: `tests/unit/recetas/recipe-prisma-steps.test.ts`.
      `toSteps` sobre: array válido, array con un elemento basura entre dos válidos, cadena suelta
      heredada, valor no-array (R17).
      **Hecho cuando:** el caso «basura en medio» devuelve los dos válidos y no lanza.
      Depende de: T3.

- [x] **T11 — Test estático del SQL de la migración.** (nuevo)
      Archivos: `tests/unit/recetas/schema/recipe-steps-reset-migration.test.ts`.
      Mismo método que `recetas-migration.test.ts` (predicados sobre el SQL real **y** sobre una
      versión mutada en memoria): el UP actualiza `recipes.steps` a `'[]'` y **no** lleva `WHERE`;
      el UP y el DOWN no contienen `CREATE TABLE`, `ALTER TABLE` ni `ADD COLUMN`; el `down.sql`
      existe y no restaura (R14, R15, R16).
      **Hecho cuando:** las mutaciones «añadir `WHERE deleted_at IS NULL`» y «convertir el UPDATE en
      un no-op» hacen fallar el test.
      Depende de: T4.

- [x] **T12 — Tests de la pantalla y fixtures. [P con T11]**
      Archivos: `tests/unit/recetas-ui/recipe-form-payload.test.ts`,
      `tests/unit/recetas-ui/recipe-form.test.tsx`, `tests/unit/recetas/recipe-input.test.ts`,
      `tests/unit/recetas/recipe-service.test.ts`, `tests/unit/recetas/recipe-actions.test.ts`,
      `tests/unit/recetas/recipe-image-lifecycle.test.ts`,
      `tests/unit/recetas/recipe-image-url.test.ts`,
      `tests/unit/recetas/recipe-lines-catalog.test.ts`,
      `tests/unit/recetas/authorization.test.ts`,
      `tests/integration/recetas/*.int.test.ts`.
      Sustituye todos los fixtures `{ body, type }` por documentos, y cubre R19 (ida y vuelta del
      puente, y ausencia del selector de tipo en pantalla).
      **Hecho cuando:** `grep -r "type: 'texto'\|RECIPE_STEP_TYPES" tests/` no devuelve nada.
      Depende de: T5, T6, T7.

## Fase 5 — Cierre

- [ ] **T13 — Gate.**
      `./init.sh --rapido` al cerrar la tanda y `./init.sh` completo antes de la PR.
      **Hecho cuando:** termina en verde, incluida la guardia de dependencias (esta ficha **no
      añade ninguna**, `design.md > 7`).
      Depende de: todas.

- [x] **T14 — Mapa de trazabilidad.**
      Archivos: `progress/impl_QC-62-pasos-de-receta-enriquecidos.md`.
      Copia la tabla de abajo con el **nombre real** de cada `it(...)`.
      **Hecho cuando:** los 19 requisitos aparecen con un test existente.
      Depende de: T13.

## Trazabilidad `R<n> → test`

| R | Qué se prueba | Test |
| --- | --- | --- |
| R1 | Orden conservado; documento que mezcla párrafo y checklist en cualquier orden se acepta y sale igual | `recipe-step-document.test.ts` |
| R2 | `paragraph` y `checklist` se aceptan; `checklist` sin ítems se rechaza; párrafo sin `spans` (línea en blanco) se acepta y se conserva | `recipe-step-document.test.ts` |
| R3 | `bold`, `italic` y las dos juntas se aceptan; `text: ''` se rechaza | `recipe-step-document.test.ts` |
| R4 | `kind: 'heading'`, un `link`, una marca desconocida y una clave extra (`level`) se rechazan | `recipe-step-document.test.ts` |
| R5 | `'  Mezclar  '` sale con sus espacios intactos del `parse` | `recipe-step-document.test.ts` |
| R6 | `createRecipeSchema`/`updateRecipeSchema` rechazan el documento inválido antes de llegar al caso de uso; un texto «raro» pero bien formado se acepta | `recipe-input.test.ts` |
| R7 | Documento con sólo espacios se rechaza; ítem con sólo espacios se rechaza | `recipe-step-document.test.ts` |
| R8 | El `issue.path` del paso 2 inválido es `['steps', 1, …]` | `recipe-input.test.ts` |
| R9 | El barrel no exporta `RECIPE_STEP_TYPES` ni `RecipeStepType`; el parse no deja ningún `type` en la salida | `recipe-step-contract.test.ts` |
| R10 | El paso de `RecipeDetail` es el documento y no trae marca derivada de checklist | `recipe-step-contract.test.ts` |
| R11 | `MAX_STEP_ELEMENTS` elementos pasa, `+1` se rechaza; el conteo suma párrafos e ítems | `recipe-step-document.test.ts` |
| R12 | Un párrafo de 5.000 caracteres se acepta | `recipe-step-document.test.ts` |
| R13 | 50 pasos pasa, 51 se rechaza; sin `steps` sale `[]` | `recipe-input.test.ts` |
| R14 | El UP actualiza `recipes.steps` a `'[]'` y no lleva `WHERE` (mutación: añadir `WHERE` hace fallar) | `recipe-steps-reset-migration.test.ts` |
| R15 | Existe `down.sql`, no contiene ningún `SELECT`/restauración y deja `steps` en `'[]'` | `recipe-steps-reset-migration.test.ts` |
| R16 | Ni el UP ni el DOWN contienen `CREATE TABLE`/`ALTER TABLE`/`ADD COLUMN`; `Recipe.steps` sigue siendo `Json` en `schema.prisma` | `recipe-steps-reset-migration.test.ts` |
| R17 | `toSteps` descarta el elemento basura y devuelve los válidos; no lanza con un valor no-array | `recipe-prisma-steps.test.ts` |
| R18 | Las cinco operaciones siguen exigiendo Administrador con el actor por parámetro | `authorization.test.ts` |
| R19 | `buildRecipePayload` proyecta el texto a un documento de un párrafo; la precarga aplana el documento a texto; la pantalla no ofrece selector de tipo | `recipe-form-payload.test.ts`, `recipe-form.test.tsx` |
