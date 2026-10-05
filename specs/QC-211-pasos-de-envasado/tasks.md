# QC-211 — pasos-de-envasado · tasks.md

Leyenda: `[P]` = paralelizable con las otras `[P]` del mismo bloque. `dep:` = tasks que deben estar
hechas antes. **Archivos:** lo que la task toca (para la comprobación de conflictos de F2.0). Cada
task cierra con `./init.sh --rapido` en verde y su commit; T16 cierra con `./init.sh` completo.
`R<n>` va en el nombre de cada caso de test.

## Solapes declarados con otras fichas

| Ficha | Estado | Archivos en común | Consecuencia |
|---|---|---|---|
| QC-210 | `pending` | `app/(private)/produccion/formulas/components/recipe-form.tsx`, `recipe-form-state.ts`, `tests/unit/recetas-ui/recipe-form*.test.tsx` | No en paralelo; la segunda rebasa. |
| QC-202 | `pending` | `app/(private)/asignacion/empaque/[id]/components/packing-order-screen.tsx`, `tests/unit/asignaciones-ui/packing-order-screen.test.tsx`, `e2e/empaque.spec.ts` (solo si hubiera que ajustarlo) | No en paralelo; la segunda rebasa. |
| Cambio sin commitear en el árbol principal (`confirm-action-dialog`) | sin ficha conocida | `packing-order-screen.tsx`, `order-execution-screen.tsx` | El leader averigua de qué ficha es antes de F2.0 (`design.md > 9`). |

## Bloque A — modelo y dominio `recetas`

- [ ] **T1. Columna y migración.**
  Archivos: `db/schema.prisma`, `db/migrations/<ts>_recipe_packing_steps/migration.sql`,
  `db/migrations/<ts>_recipe_packing_steps/down.sql`.
  Según `design.md > 2.1`. `<ts>` posterior a la última migración de `dev`.
  Hecho: `pnpm run db:migrate` y `pnpm run db:rollback` aplican sin error en local; `prisma
  generate` ok.
- [ ] **T2. Tests de esquema y migración** — dep: T1.
  Archivos: `tests/unit/recetas/schema/recetas-schema.test.ts`,
  `tests/integration/recetas/recipe-packing-steps-migration.int.test.ts` (nuevo).
  Enmendar el caso «steps es el único campo Json» a `['packingSteps', 'steps']` y añadir
  `['packingSteps', 'packing_steps']` a `RECIPE_COLUMNS`. Integración: UP sobre recetas existentes
  con `steps` no vacíos → `packing_steps = '[]'` y `steps` idénticos; DOWN quita la columna y nada
  más.
  Hecho: verdes; casos `R5`.
- [ ] **T3. Esquemas de entrada** [P con T4] — dep: ninguna.
  Archivos: `lib/modules/recetas/domain/recipe-input.ts`, `tests/unit/recetas/recipe-input.test.ts`.
  `packingSteps: recipeStepsSchema` en alta y edición (`design.md > 3.1`).
  Hecho: casos que aceptan sin la clave (→ `[]`), con `[]`, con 50 + 50; rechazan 51 de envasado,
  paso vacío, 31 elementos, clave desconocida en un bloque; y que los esquemas de versión descartan
  `packingSteps`. Casos `R1`, `R2`, `R3`, `R10`.
- [ ] **T4. Tipos, puerto y casos de uso de `recetas`** — dep: T1, T3.
  Archivos: `lib/modules/recetas/ports/recipe-repository.ts`,
  `lib/modules/recetas/domain/recipe-view.ts`, `lib/modules/recetas/domain/create-recipe.ts`,
  `lib/modules/recetas/domain/update-recipe.ts`, `lib/modules/recetas/domain/update-recipe-version.ts`,
  `lib/modules/recetas/domain/get-recipe.ts`,
  `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts`,
  `tests/unit/recetas/packing-steps.test.ts` (nuevo); ajustar fixtures de `RecipeRow` en los tests
  unitarios de `recetas` que no compilen (solo añadir `packingSteps: []`, sin cambiar asertos).
  Según `design.md > 3.2`, `> 3.3`.
  Hecho: con dobles del repositorio, alta y edición pasan `packingSteps` en orden; versión escribe
  `[]` aunque la entrada los traiga; `getRecipe` de una versión devuelve los de la original; sin
  `recetas.modificar` rechaza sin tocar el repositorio. Casos `R4`, `R6`, `R10`, `R11`.
- [ ] **T5. Lector de pasos de envasado** — dep: T1.
  Archivos: `lib/modules/recetas/domain/recipe-packing-steps-reader.ts` (nuevo),
  `lib/modules/recetas/index.ts`,
  `lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts`,
  `tests/unit/recetas/recipe-packing-steps-reader.test.ts` (nuevo).
  Según `design.md > 3.4`.
  Hecho: `toRecipePackingSteps` devuelve los propios en una original y los de la original en una
  versión, descarta el elemento inválido conservando el orden; el `select` de
  `findExecutionContentByIdOn` no pide `packingSteps` y `toRecipeExecutionContent` no devuelve esa
  clave. Casos `R11`, `R26`.
- [ ] **T6. Integración de `recetas`** — dep: T4, T5.
  Archivos: `tests/integration/recetas/packing-steps.int.test.ts` (nuevo).
  Contra Postgres: guardar y releer las dos listas intactas y separadas; versión sin pasos propios;
  editar la original y releer la versión (lo nuevo); el lector devuelve `null` para una receta de
  otra empresa y los pasos de una receta dada de baja.
  Hecho: verde; casos `R4`, `R11`, `R13`, `R29`, `R30`.

## Bloque B — empaque (`asignaciones`)

- [ ] **T7. `getPackingOrder` con pasos de envasado** — dep: T5.
  Archivos: `lib/modules/asignaciones/domain/packing-order-view.ts`,
  `lib/modules/asignaciones/domain/get-packing-order.ts`, `lib/modules/asignaciones/index.ts`
  (exportar `PackingOrderDetail`), `lib/composition/index.ts` (cablear `packingSteps`),
  `tests/unit/asignaciones/get-packing-order.test.ts`.
  Según `design.md > 4`.
  Hecho: `POR_EMPACAR` → `packingSteps: []` sin llamar al lector; `EN_EMPAQUE` de otro → ídem;
  `EN_EMPAQUE` del actor → los del lector, en orden, y `[]` si el lector da `null`; la salida no
  tiene ninguna clave con pasos del operador; actor con solo `empaque.modificar` los recibe; sin
  `empaque.modificar` rechaza sin validar y sin llamar a ningún puerto (lector incluido); el lector
  recibe la empresa del actor. Casos `R19`, `R20`, `R22`, `R27`, `R28`, `R29`.
- [ ] **T8. Sin cambios en ejecución y en terminar** [P con T7] — dep: T5.
  Archivos: `tests/unit/asignaciones/get-assigned-order-execution.test.ts`,
  `tests/unit/asignaciones/finish-packing.test.ts`.
  Solo tests: la vista de ejecución construida desde un contenido de receta no tiene
  `packingSteps` (R26); `finishPacking` termina un pedido `EN_EMPAQUE` del actor con la entrada
  `{ orderId }` sola, sin ninguna prueba de recorrido, y su esquema sigue siendo exactamente ese
  `strictObject` (R24).
  Hecho: verdes; casos `R24`, `R26`.

## Bloque C — UI

- [ ] **T9. `StepReader`: `finishLabel` y `finishBusy`** [P con T10] — dep: ninguna.
  Archivos: `components/shared/step-reader/step-reader.tsx`,
  `tests/unit/recetas-ui/step-reader.test.tsx`.
  Según `design.md > 5.1`.
  Hecho: sin las props, el texto sigue siendo «Finalizar» y todos los casos existentes siguen
  verdes; con `finishLabel` el último botón lleva ese texto; con `finishBusy` está deshabilitado y
  con `aria-busy`, y `onFinish` no se llama. Casos `R21`.
- [ ] **T10. `RecipeStepsField` reutilizable** [P con T9] — dep: ninguna.
  Archivos: `app/(private)/produccion/formulas/components/recipe-steps-field.tsx`,
  `tests/unit/recetas-ui/recipe-steps-field.test.tsx` (nuevo, o el archivo que ya lo cubra).
  Según `design.md > 5.3`.
  Hecho: sin props, todos los `data-testid` de hoy idénticos; con `testIdPrefix`, título y texto de
  añadir propios; dos instancias en el mismo árbol no comparten pasos ni arrastre. Casos `R7`.
- [ ] **T11. Formulario de fórmula** — dep: T3, T4, T10.
  Archivos: `app/(private)/produccion/formulas/components/recipe-form.tsx`,
  `app/(private)/produccion/formulas/components/recipe-form-state.ts`,
  `tests/unit/recetas-ui/recipe-form-packing-steps.test.tsx` (nuevo).
  Según `design.md > 5.4`.
  Hecho: la sección «Pasos de envasado» aparece en alta y edición, separada de «Pasos»; añadir,
  escribir, quitar y reordenar llegan al payload en orden; un error en `['packingSteps', i]` se
  pinta en ese paso de envasado y no en el paso del operador `i`, y al revés; editar carga los
  documentos con marcas y checklist intactos y guardar sin tocar los deja iguales. Casos `R7`,
  `R8`, `R9`.
- [ ] **T12. Formulario de versión** [P con T11] — dep: T4.
  Archivos: `app/(private)/produccion/formulas/components/recipe-version-form.tsx`,
  `tests/unit/recetas-ui/recipe-version-form.test.tsx`.
  Según `design.md > 5.5`.
  Hecho: los pasos de envasado heredados se ven, dentro de un contenedor `inert` y sin controles de
  edición; sin pasos en la original, el aviso. Casos `R12`.
- [ ] **T13. Pantalla de empaque** — dep: T7, T9.
  Archivos: `app/(private)/asignacion/empaque/[id]/components/packing-order-screen.tsx`,
  `tests/unit/asignaciones-ui/packing-order-screen.test.tsx`.
  Según `design.md > 5.2`. Si para entonces existe en `dev` la confirmación antes de Terminar,
  `onFinish` pasa por ella (`design.md > 9`).
  Hecho, con temporizadores falsos: `POR_EMPACAR` con pasos en la prop → no se pinta ninguno (R19);
  `EN_EMPAQUE` propio con pasos → paso a paso con `packing-order-steps`, sin botón Terminar suelto,
  un paso por pantalla (R20); el último botón dice «Terminar» y al pulsarlo dispara la acción de
  terminar con el `orderId` y pinta sus errores en la región de siempre (R21); con un check sin
  marcar o antes de 5 s no se avanza ni se termina, y el motivo es texto visible (R23); sin pasos,
  los tres estados se pintan como hoy (los casos existentes siguen verdes sin cambiar asertos) (R25);
  ningún texto de los pasos del operador aparece (R27); desmontar y volver a montar empieza en el
  paso 1 sin marcas (R31). Casos `R19`, `R20`, `R21`, `R23`, `R25`, `R27`, `R31`.

## Bloque D — importación desde PDF

- [ ] **T14. Extracción, revisión y confirmación** — dep: T3, T4, T10.
  Archivos: `lib/modules/documentos/domain/formula-extraction.ts`,
  `lib/modules/documentos/domain/preview-formula-import.ts`,
  `lib/modules/documentos/domain/review-formula-import.ts`,
  `lib/modules/documentos/domain/formula-import-input.ts`,
  `lib/modules/documentos/domain/confirm-formula-import.ts`,
  `lib/modules/documentos/adapters/driven/ai/ai-reader-canned.ts`,
  `app/(private)/produccion/formulas/importar/[documentoId]/components/formula-import-review.tsx`,
  `tests/unit/documentos/formula-extraction.test.ts`,
  `tests/unit/documentos/review-formula-import.test.ts`,
  `tests/unit/documentos/preview-formula-import.test.ts`,
  `tests/unit/documentos/confirm-formula-import.test.ts`,
  `tests/unit/documentos/qc159-alcance.test.ts` (`CLAVES_PERMITIDAS` + `'packingSteps'`),
  `tests/unit/recetas-ui/formula-import-review.test.tsx`,
  `tests/integration/documentos/formula-import.int.test.ts`.
  Según `design.md > 6.1`.
  Hecho: JSON con `packingSteps` → documentos en orden y separados de `steps` (R14); sin la clave o
  `null` → `[]`; con un objeto o un número → `ValidationError` (R15); la revisión pinta su propia
  sección editable (R16); 51 pasos de envasado o uno inválido → `canConfirm: false` con motivo
  propio, y la confirmación en servidor rechaza entera (R17); confirmar crea, o reemplaza
  sustituyendo, con los pasos de envasado revisados (R18); el texto de guion sigue siendo solo JSON;
  sin `recetas.modificar` la confirmación rechaza sin tocar puertos (R6).
  Casos `R6`, `R14`, `R15`, `R16`, `R17`, `R18`.
- [ ] **T15. Prompt de fórmula — MANUAL, lo hace el humano** — dep: aprobación del spec.
  Archivos: ninguno del repo. `FORMULA_PROMPT` en `.env` local y en Vercel, en cada entorno.
  Añadir al prompt actual el bloque de `design.md > 6.2` (o la versión que apruebe el humano).
  Hecho: el humano confirma que está cargado en cada entorno y una importación real de un PDF con
  sección de envasado propone esos pasos en su sección. No bloquea el merge: el código es
  tolerante sin él (R15). Queda anotado en el PR.

## Bloque E — punta a punta y cierre

- [ ] **T16. E2E y gate completo** — dep: T1–T14.
  Archivos: `e2e/pasos-de-envasado.spec.ts` (nuevo),
  `progress/impl_QC-211-pasos-de-envasado.md`.
  E2E: el Administrador crea una fórmula con pasos del operador y dos pasos de envasado (uno con
  lista de verificación); se crea el pedido, se asigna y el operador lo ejecuta sin que aparezca
  ningún texto de envasado; el empacador abre el pedido `POR_EMPACAR` y no ve pasos de envasado,
  pulsa Comenzar, los ve uno a uno, no avanza con el check sin marcar ni antes de la espera,
  termina con el botón del último paso, y en ningún momento ve los pasos del operador. Revisar que
  `empaque.spec.ts`, `ejecucion-receta.spec.ts`, `recetas-pasos.spec.ts`,
  `formula-desde-pdf.spec.ts` y `versiones-de-receta.spec.ts` siguen verdes sin cambios.
  Hecho: `./init.sh` completo en verde; mapa `R<n> -> test` completo en
  `progress/impl_QC-211-pasos-de-envasado.md`; el PR dice que T15 es manual y su estado. Caso
  `R32`.

## Trazabilidad prevista

| Requisito | Task | Test |
|---|---|---|
| R1, R2, R3 | T3 | `tests/unit/recetas/recipe-input.test.ts` |
| R4 | T4, T6 | `tests/unit/recetas/packing-steps.test.ts`, `tests/integration/recetas/packing-steps.int.test.ts` |
| R5 | T2 | `tests/unit/recetas/schema/recetas-schema.test.ts`, `tests/integration/recetas/recipe-packing-steps-migration.int.test.ts` |
| R6 | T4, T14 | `tests/unit/recetas/packing-steps.test.ts`, `tests/unit/documentos/confirm-formula-import.test.ts` |
| R7 | T10, T11 | `tests/unit/recetas-ui/recipe-steps-field.test.tsx`, `tests/unit/recetas-ui/recipe-form-packing-steps.test.tsx` |
| R8, R9 | T11 | `tests/unit/recetas-ui/recipe-form-packing-steps.test.tsx` |
| R10 | T3, T4 | `tests/unit/recetas/recipe-input.test.ts`, `tests/unit/recetas/packing-steps.test.ts` |
| R11 | T4, T5, T6 | `tests/unit/recetas/packing-steps.test.ts`, `tests/unit/recetas/recipe-packing-steps-reader.test.ts`, `tests/integration/recetas/packing-steps.int.test.ts` |
| R12 | T12 | `tests/unit/recetas-ui/recipe-version-form.test.tsx` |
| R13 | T6 | `tests/integration/recetas/packing-steps.int.test.ts` |
| R14, R15 | T14 | `tests/unit/documentos/formula-extraction.test.ts` |
| R16 | T14 | `tests/unit/recetas-ui/formula-import-review.test.tsx` |
| R17 | T14 | `tests/unit/documentos/review-formula-import.test.ts`, `tests/unit/documentos/confirm-formula-import.test.ts`, `tests/unit/recetas-ui/formula-import-review.test.tsx` |
| R18 | T14 | `tests/unit/documentos/confirm-formula-import.test.ts`, `tests/integration/documentos/formula-import.int.test.ts` |
| R19, R22 | T7, T13 | `tests/unit/asignaciones/get-packing-order.test.ts`, `tests/unit/asignaciones-ui/packing-order-screen.test.tsx` |
| R20 | T7, T13 | ídem |
| R21 | T9, T13 | `tests/unit/recetas-ui/step-reader.test.tsx`, `tests/unit/asignaciones-ui/packing-order-screen.test.tsx` |
| R23, R25, R31 | T13 | `tests/unit/asignaciones-ui/packing-order-screen.test.tsx` |
| R24 | T8 | `tests/unit/asignaciones/finish-packing.test.ts` |
| R26 | T5, T8 | `tests/unit/recetas/recipe-packing-steps-reader.test.ts`, `tests/unit/asignaciones/get-assigned-order-execution.test.ts` |
| R27 | T7, T13 | `tests/unit/asignaciones/get-packing-order.test.ts`, `tests/unit/asignaciones-ui/packing-order-screen.test.tsx` |
| R28 | T7 | `tests/unit/asignaciones/get-packing-order.test.ts` |
| R29 | T6, T7 | `tests/integration/recetas/packing-steps.int.test.ts`, `tests/unit/asignaciones/get-packing-order.test.ts` |
| R30 | T6 | `tests/integration/recetas/packing-steps.int.test.ts` |
| R32 | T16 | `e2e/pasos-de-envasado.spec.ts` |
