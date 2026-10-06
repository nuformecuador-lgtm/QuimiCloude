# QC-211 — pasos-de-envasado · review

## Vuelta 1 (completa, origin/dev...64abb261)

Reviewer, 2026-10-05. Diff propio de la rama (sin el contenido que trae el merge d5684364 de dev).
Grafo no usado: la revisión se hizo con git diff, Grep y Read sobre el worktree.

### Verificación ejecutada por el reviewer

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | verde |
| `pnpm run lint` | 0 errores, 8 warnings preexistentes |
| `vitest run` de los unit/guard del diff + `tests/unit/asignaciones-ui` + `step-reader` | 69/71 archivos verdes; los 2 rojos son `recetas/module-contract` y `recetas/scope`, los dos en `tests/baseline-rojos.json` por la misma causa (`app/(private)/pedidos/page.tsx`, deuda de dev 897a4f91). En `module-contract` la aserción de la lista permitida (línea 509, con QC-211) se ejecuta y pasa; el rojo sale después, en la 612 |
| `pnpm run test:guardias` | 51/51 archivos, 682 tests verdes |
| `.int`: `packing-steps`, `recipe-packing-steps-migration`, `formula-import`, `recipe-versions-repository` | 4/4 archivos, 38 tests verdes (base efímera de test; la compartida no se tocó) |
| `git diff origin/dev -- e2e/empaque.spec.ts e2e/helpers app/(private)/asignacion/components` | vacío: idénticos a dev |

No se corrieron `./init.sh` completo ni E2E (los corre el leader).

### Checklist

- [x] Spec: requirements EARS R1–R32, design con alternativas descartadas (§10), tasks.
- [x] Tasks: todas `[x]` salvo T15, manual del humano y sin marcar a propósito (lo dice la nota de aprobación; no bloquea el merge porque R15 tolera que falte `packingSteps`).
- [x] Trazabilidad: cada R1–R32 tiene al menos un caso con su `R<n>` en el nombre, y el caso afirma lo que pide el requisito. Comprobados a mano: R2/R3 (`recipe-input`), R5 (`recetas-schema` + `.int` de UP/DOWN), R13/R29/R30 (`packing-steps.int`), R19/R20/R22/R27/R28/R29 (`get-packing-order`: el lector no se llama en `POR_EMPACAR` ni con otro empacador; sin `empaque.modificar` no se toca ningún puerto), R19/R20/R21/R23/R25/R27/R31 (`packing-order-screen`), R24 (`finish-packing`), R26 (`get-assigned-order-execution` + el `select` del lector de ejecución), R32 (`e2e/pasos-de-envasado.spec.ts`).
- [x] Mapa `R<n> -> test` en `progress/impl_QC-211.md`.
- [x] Autorización en el caso de uso: `getPackingOrder` hace `requirePermission(actor, "empaque.modificar")` antes de validar; los pasos solo se leen si el estado es `EN_EMPAQUE` y `packedBy` es el actor, con la empresa del actor (`lib/modules/asignaciones/domain/get-packing-order.ts:55-58`). El empacador no recibe `recetas.consultar` ni `asignaciones.ejecutar`.
- [x] El operador no recibe `packingSteps`: `RecipeExecutionContent` y su `select` no cambian (lo afirma `recipe-packing-steps-reader.test.ts`).
- [x] El empacador no recibe pasos del operador: `RecipePackingStepsReader` solo puede devolver los de envasado, y `PackingOrderDetail` no lleva `steps`.
- [x] Aislamiento por empresa: no hay modelo nuevo; `findRecipePackingStepsById` filtra con `recipeCompanyScope({ companyId })`; el acceso cruzado da `null` y sale lista vacía (`.int` R29 y unit R29).
- [x] Migración: `migration.sql` (ADD COLUMN JSONB NOT NULL con default de lista vacía) y `down.sql` (DROP COLUMN), sin backfill; D13 se cumple con el default.
- [x] Sin RLS nueva que poner: no hay tabla nueva.
- [x] Importación desde PDF: si falta `packingSteps` o viene `null`, da lista vacía; si no es lista ni `null`, da `ValidationError`, igual que `steps` (`lib/modules/documentos/domain/formula-extraction.ts:163-166`). La confirmación lo vuelve a validar en servidor con `recipeStepSchema`, y en el borde `packingSteps` tiene por defecto la lista vacía.
- [x] Dependencias: `package.json` y lockfile sin cambios.
- [x] Sin secretos ni contexto hardcodeado. Sin webhooks.
- [x] Capas: dominio sin framework; `asignaciones` importa solo el contrato `@/lib/modules/recetas`; el cableado va en `lib/composition`.
- [x] Multiplataforma: sin `100vh` (se mantiene `min-h-dvh`), sin `:hover` nuevo; los botones reutilizan `TOUCH_TARGET`/`PRIMARY_TOUCH_TARGET_EJECUCION`, y el editor de pasos es el mismo `RecipeStepsField` (dnd-kit ya aprobado). Sin inputs nuevos.
- [x] Listas cerradas y guardias ampliadas sin aflojarlas: `E2E_ESPERADOS`, `MIGRACIONES_ESPERADAS`, `data-table-alcance` (26 a 27, con la lista exacta), `CLAVES_PERMITIDAS` (+`packingSteps`), `RECETAS_PERMITIDAS`/`DB_PERMITIDAS` y `AMPLIACIONES_APROBADAS` con los archivos exactos, y el tercer montador de `StepReader` como archivo exacto (la carpeta no). Cada una dice por qué cambia y coincide con design 5.2 y tasks.
- [x] Los tres asertos que cambian no se debilitan: `recipe-versions-repository.int` R8 sigue comparando el `original` exacto con `toEqual`, ahora con `packingSteps` vacío (lo exige el `RecipeOriginalRow` nuevo); `formula-import-review` R29 sigue comparando el payload exacto, ahora con `packingSteps` vacío; `formula-import-actions` espera la entrada válida más `packingSteps` vacío, que es el efecto real del default del esquema. Los tres son igual de estrictos que antes.
- [ ] Comentarios en líneas añadidas o modificadas: ver B1.
- [x] Lo que dice el implementer sobre `e2e/empaque.spec.ts` es cierto: el spec, `e2e/helpers` y `app/(private)/asignacion/components` son idénticos a `origin/dev`. El spec siembra `EN_CURSO` (`e2e/empaque.spec.ts:461`) y en la línea 587 espera `assigned-order-start-confirm`. Pero `assigned-order-enter-trigger.tsx:56-79` pinta un `Link` sin confirmación para `EN_CURSO`, y solo monta `AssignedOrderStartTrigger` (el que tiene el diálogo) en el caso restante. El rojo viene de 6ef2b6e9 en dev y no es de esta rama. No cuenta como hallazgo.

### Hallazgos

- **B1 — BLOQUEANTE.** `app/(private)/produccion/formulas/components/recipe-form-state.ts:308`: el diff reescribe el docblock de `extractStepErrors` (pasa de una línea a un bloque) y la línea modificada mantiene `(R32, R38 del esquema)`. Según `docs/conventions.md > Comentarios`, citar `R<n>` en una línea añadida o modificada de producción bloquea. Para cumplir, hay que quitar la cita de requisitos de ese docblock. Lo que explica el motivo (`root` separa las dos listas, que comparten índices) puede quedarse.
- **m1 — menor.** `app/(private)/asignacion/empaque/[id]/components/packing-order-screen.tsx:249-250` y `components/shared/step-reader/step-reader.tsx:313-317`: mientras termina, el botón del último paso queda deshabilitado con `aria-busy`, pero sigue diciendo «Terminar». El botón suelto de hoy cambia a «Terminando…» (`FINISH_PENDING_LABEL`). R21 no exige ese texto (pide misma acción, errores y navegación) y design 5.1 solo define `finishBusy`, así que no bloquea. Es una diferencia visible frente al flujo sin pasos.
- **m2 — menor.** `app/(private)/produccion/formulas/components/recipe-form.tsx:205-206`: un fallback a lista vacía sobre `recipe.packingSteps`, que el tipo `RecipeDetail` declara obligatorio, con un comentario que habla de «lecturas anteriores a la columna». No he podido verificar ese motivo: el adaptador siempre rellena el campo. Responde a la decisión de la aprobación («al editar, packingSteps ausente = lista vacía»), así que solo es menor.
- **m3 — menor.** `app/(private)/produccion/formulas/components/recipe-version-form.tsx:389-391`: el `<h3>` se parte en tres líneas por un texto corto, en una forma distinta a la de su vecino de pasos heredados. Es cosmético.

### Veredicto

**RECHAZADO** por B1. Es el único bloqueante y se arregla con un cambio de comentario de una línea, sin tocar la lógica. En la vuelta 2 basta revisar el rango del arreglo.

## Vuelta 2 (acotada a f28dcc36..HEAD)

Commits: `5c4bdd5f` (arreglos), `da75c71b` (E2E de empaque), `e135eb09` (bitácora y log del E2E).

### Checklist

- [x] Typecheck (`tsc --noEmit`): verde.
- [x] Lint de los 6 archivos tocados: sin avisos.
- [x] `vitest related` del diff: 434/436. Los 2 rojos (`tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`, `tests/unit/recetas-ui/recipe-page.test.tsx`) están en `tests/baseline-rojos.json` y el rango no los toca, así que no cuentan como hallazgo.
- [x] Guardias (`tests/guards`): 44/44 archivos, 612 en verde y 5 omitidos.
- [x] E2E: leí `progress/e2e_QC-211_vuelta2.log`, que da `16 passed`. No lo volví a correr: lo corre el leader.
- [x] Comentarios añadidos o modificados en producción: ninguno cita `R<n>`, `QC-<n>`, `design.md` ni «decisión cerrada».

### Hallazgos de la vuelta 1

- **B1: cerrado.** `recipe-form-state.ts:308` ya no cita `(R32, R38 del esquema)`. Se queda el motivo de `root`.
- **m1: cerrado.** `packing-order-screen.tsx:249` usa `finishPending ? FINISH_PENDING_LABEL : FINISH_LABEL`. Lo cubre el test nuevo de `tests/unit/asignaciones-ui/packing-order-screen.test.tsx` («mientras termina, el ultimo boton dice «Terminando…»»), que comprueba el texto, `disabled` y `aria-busy` y resuelve la promesa en `finally`. Esto encaja con R21 y P2, que piden «el mismo texto que el botón Terminar de hoy», y ese botón ya cambia a «Terminando…» mientras termina.
- **m2: cerrado, se acepta.** El `?? []` se queda. Lo pide la nota de aprobación («al editar, `packingSteps` ausente = lista vacía») y lo comprueba el test R9 de `recipe-form-packing-steps.test.tsx`. El comentario ya no da el motivo falso («lecturas anteriores a la columna»): ahora dice que es una defensa a propósito frente al tipo. Es aceptable.
- **m3: cerrado.** El `<h3>` de `recipe-version-form.tsx` cabe en una línea, igual que su vecino.

### Arreglo del E2E pedido por el humano (`da75c71b`)

- El commit solo toca `e2e/empaque.spec.ts` (+2/-2). No cambia código de producción.
- Mantiene la intención. Por el precondicionado del caso, el pedido nace `EN_CURSO`, y desde `6ef2b6e9` `assigned-order-enter-trigger.tsx:57` pinta «Entrar» como enlace directo para `EN_CURSO`, sin la confirmación de comenzar. El test cambia `clickAndConfirm(..., ASSIGNED_ORDER_START_CONFIRM_TESTID)` por `click()`. Sigue esperando la ruta de ejecución y el título, y luego finaliza con su confirmación (`ORDER_EXECUTION_FINISH_CONFIRM_TESTID`). El recorrido completo (POR_EMPACAR, pestaña, Pedidos, Empacador y Terminados) sigue igual. Se quita el import que ya no se usa.

### Hallazgos nuevos

Ninguno. El rango no trae regresiones.

### Veredicto

**OK**
