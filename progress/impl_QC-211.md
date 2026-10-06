# QC-211 — pasos-de-envasado · bitácora de implementación

Worktree `.worktrees/QC-211-pasos-de-envasado`, rama `feature/QC-211-pasos-de-envasado`.
Base propia para `db:migrate`/`db:rollback` y E2E: **`QuimiCloude_QC211`** (copia de la plantilla
`qct_tpl_0524a8735d8d`, 69 migraciones + sembrado). El `.env` del worktree apunta ahí. La base
compartida `QuimiCloude` **no se tocó**. Sin dependencias nuevas (se corrió `pnpm install
--frozen-lockfile` porque el worktree no tenía `node_modules`).

## Estado de tasks

| Task | Estado | Commit |
|---|---|---|
| T1–T6 (modelo, migración, dominio y lector de `recetas`) | hecho | f266d61c |
| T7, T8 (`getPackingOrder`; ejecución y terminar sin cambios) | hecho | fc156942 |
| T9, T10 (`StepReader` y `RecipeStepsField`) | hecho | bbb47e73 |
| T11, T12, T13 (formulario, versión, pantalla de empaque) | hecho | f42d3238 |
| T14 (importación: dominio y UI) | hecho | fc156942, f42d3238 |
| **T15 (prompt `FORMULA_PROMPT`)** | **pendiente, MANUAL del humano** | — |
| T16 (E2E R32 + gate completo) | hecho | 529d3c6c, 18928fe8 |
| Guardia: tercer montador de `StepReader` | — | a02af0a7 |

Merge de `origin/dev` al empezar (d5684364): trajo la confirmación antes de Comenzar/Terminar
(6ef2b6e9), sin migraciones. Único conflicto, en `specs/QC-211-pasos-de-envasado/requirements.md`
(add/add): se conservó la versión de la rama (EARS + nota de aprobación F1.4), que ya contiene lo de dev.
T13 engancha el `onFinish` del paso a paso a la misma confirmación que el botón Terminar (design 9).

## Migración (T1), sobre `QuimiCloude_QC211`

- `db:migrate`: «No pending migrations to apply» (la plantilla ya la traía).
- `db:rollback`: «20261005120000_recipe_packing_steps revertida».
- `db:migrate` de nuevo: «All migrations have been successfully applied». `migrate status`: «Database schema is up to date!».

## Archivos

Producción:
- `db/schema.prisma`, `db/migrations/20261005120000_recipe_packing_steps/{migration,down}.sql` (nuevos)
- `lib/modules/recetas/`: `domain/{recipe-input,recipe-view,create-recipe,update-recipe,update-recipe-version,get-recipe}.ts`, `domain/recipe-packing-steps-reader.ts` (nuevo), `ports/recipe-repository.ts`, `index.ts`, `adapters/driven/persistence/{recipe-prisma,recipe-catalog-prisma}.ts`
- `lib/modules/asignaciones/`: `domain/{packing-order-view,get-packing-order}.ts`, `index.ts`; `lib/composition/index.ts`
- `lib/modules/documentos/`: `domain/{formula-extraction,preview-formula-import,review-formula-import,formula-import-input,confirm-formula-import}.ts`, `adapters/driven/ai/ai-reader-canned.ts`
- `components/shared/step-reader/step-reader.tsx`
- `app/(private)/produccion/formulas/components/`: `recipe-steps-field.tsx`, `recipe-form.tsx`, `recipe-form-state.ts`, `recipe-version-form.tsx`
- `app/(private)/produccion/formulas/importar/[documentoId]/components/formula-import-review.tsx`
- `app/(private)/asignacion/empaque/[id]/components/packing-order-screen.tsx`, `index.ts`

Tests nuevos: `tests/unit/recetas/packing-steps.test.ts`, `tests/unit/recetas/recipe-packing-steps-reader.test.ts`,
`tests/integration/recetas/packing-steps.int.test.ts`, `tests/integration/recetas/recipe-packing-steps-migration.int.test.ts`
(declarados en `tests/integration/aislamiento.json`), `tests/unit/recetas-ui/recipe-steps-field.test.tsx`,
`tests/unit/recetas-ui/recipe-form-packing-steps.test.tsx`, `e2e/pasos-de-envasado.spec.ts`.

Tests ampliados: `recipe-input`, `recetas-schema`, `get-packing-order`, `finish-packing`,
`get-assigned-order-execution`, `formula-extraction`, `preview-formula-import`, `review-formula-import`,
`confirm-formula-import`, `formula-import.int`, `step-reader`, `recipe-version-form`,
`formula-import-review`, `packing-order-screen`.

Solo fixtures (`packingSteps: []`, sin cambiar asertos): 18 unit de `recetas`; en `recetas-ui`
`recipe-form`, `recipe-form-propagation`, `recipe-form-payload`, `recipe-form-state`,
`recipe-lines-unavailable`, `recipe-version-pages`, `formula-import-page`; 4 de `pedidos-ui`;
`asignaciones-ui/packing-order-page` y `qc195-lineas-antiguas`; integración de `recetas` (5) y `pedidos` (3).

Asertos que SÍ cambiaron, por el contrato nuevo del spec (no para relajar):
- `tests/integration/recetas/recipe-versions-repository.int.test.ts` R8: el `original` esperado incluye `packingSteps: []` (compara el objeto exacto).
- `tests/unit/recetas-ui/formula-import-review.test.tsx` R29: el payload de confirmar lleva `packingSteps: []` (design 6.1).
- `tests/unit/documentos/formula-import-actions.test.ts`: la acción recibe `packingSteps: []` (default del esquema).

Guardias y listas cerradas ampliadas con el patrón propio de cada una:
- `tests/unit/recetas/scope.test.ts`: campo `packingSteps` de `Recipe`.
- `tests/unit/recetas/module-contract.test.ts` y `tests/unit/recetas-ui/recipe-route-contract.test.ts`: entrada QC-211 con los archivos de `lib/modules/recetas` y `db/`.
- `recipe-route-contract.test.ts`: `packing-order-screen.tsx` como tercer montador permitido de `StepReader` (design 5.2, R20).
- `tests/guards/guard-identificador-de-request.test.ts`: migración nueva, y `pasos-de-envasado.spec.ts` en `E2E_ESPERADOS`.
- `tests/unit/shared/data-table-alcance.test.ts`: el spec nuevo en la lista cerrada (de 26 a 27).
- `tests/unit/documentos/qc159-alcance.test.ts`: `packingSteps` en `CLAVES_PERMITIDAS`.

## Mapa R<n> → test

| R | Test |
|---|---|
| R1 | `tests/unit/recetas/recipe-input.test.ts` (2 casos R1); `tests/unit/recetas/packing-steps.test.ts` (R1, edición sin la clave) |
| R2 | `recipe-input.test.ts` (R2: paso vacío, más de 30 elementos, clave desconocida) |
| R3 | `recipe-input.test.ts` (R3: 50 + 50 se aceptan; 51 de envasado se rechazan) |
| R4 | `recipe-input.test.ts` (R4); `packing-steps.test.ts` (5 casos); `tests/integration/recetas/packing-steps.int.test.ts` (3 casos) |
| R5 | `tests/unit/recetas/schema/recetas-schema.test.ts` (2 casos); `tests/integration/recetas/recipe-packing-steps-migration.int.test.ts` (UP y DOWN) |
| R6 | `packing-steps.test.ts` (alta y edición sin permiso, sin tocar puertos); `tests/unit/documentos/confirm-formula-import.test.ts` |
| R7 | `tests/unit/recetas-ui/recipe-steps-field.test.tsx` (4 casos); `tests/unit/recetas-ui/recipe-form-packing-steps.test.tsx` |
| R8 | `recipe-form-packing-steps.test.tsx` (error por lista; orden del payload) |
| R9 | `recipe-form-packing-steps.test.tsx` (marcas y checklist intactas con `toStrictEqual`; clave ausente = vacía) |
| R10 | `recipe-input.test.ts` (los esquemas de versión descartan `packingSteps`); `packing-steps.test.ts` (2 casos) |
| R11 | `packing-steps.test.ts`; `tests/unit/recetas/recipe-packing-steps-reader.test.ts` (4 casos); `packing-steps.int.test.ts` |
| R12 | `tests/unit/recetas-ui/recipe-version-form.test.tsx` (3 casos) |
| R13 | `packing-steps.int.test.ts` (editar la original y releer la versión) |
| R14, R15 | `tests/unit/documentos/formula-extraction.test.ts`; `tests/unit/documentos/preview-formula-import.test.ts` |
| R16 | `tests/unit/recetas-ui/formula-import-review.test.tsx` (3 casos) |
| R17 | `tests/unit/documentos/review-formula-import.test.ts` (5); `confirm-formula-import.test.ts`; `formula-import-review.test.tsx` (2); `tests/integration/documentos/formula-import.int.test.ts` |
| R18 | `confirm-formula-import.test.ts`; `formula-import.int.test.ts` (crear y reemplazar) |
| R19, R20, R22 | `tests/unit/asignaciones/get-packing-order.test.ts`; `tests/unit/asignaciones-ui/packing-order-screen.test.tsx` |
| R21 | `tests/unit/recetas-ui/step-reader.test.tsx` (5 casos); `packing-order-screen.test.tsx` (pasa por la confirmación de Terminar) |
| R23, R25, R31 | `packing-order-screen.test.tsx` (temporizadores falsos) |
| R24 | `tests/unit/asignaciones/finish-packing.test.ts` |
| R26 | `tests/unit/asignaciones/get-assigned-order-execution.test.ts` (2); `recipe-packing-steps-reader.test.ts` (2: `select` de ejecución y claves del contenido) |
| R27 | `get-packing-order.test.ts`; `packing-order-screen.test.tsx` |
| R28 | `get-packing-order.test.ts` |
| R29 | `get-packing-order.test.ts`; `recipe-packing-steps-reader.test.ts`; `packing-steps.int.test.ts` (otra empresa da `null`) |
| R30 | `packing-steps.int.test.ts` (receta dada de baja); `recipe-packing-steps-reader.test.ts` (sin `deletedAt`) |
| R32 | `e2e/pasos-de-envasado.spec.ts` |

## Salida de los tests

Gate completo `./init.sh` (sin flags), HEAD 18928fe8:

```
✓ typecheck paso
✓ lint paso
 Test Files  8 failed | 882 passed (890)
      Tests  10 failed | 12596 passed | 128 skipped (12734)
✓ tests: sin rojos nuevos (8 rojos, todos en el baseline de 8)
== init OK ==
```

Los 8 archivos rojos están en `tests/baseline-rojos.json`: `configuracion-ui/unidades-viewport`,
`configuracion-ui/usuarios-viewport`, `navegacion/pantallas-exigen-permiso`, `inventario/product-page`,
`recetas-ui/recipe-page`, `identity/account-status-scope`, `recetas/module-contract`, `recetas/scope`.
Una primera corrida completa dio 2 rojos nuevos: las listas cerradas de e2e de
`guard-identificador-de-request` y `data-table-alcance`. Se dio de alta el spec nuevo en las dos y
la segunda corrida es la de arriba.

E2E R32 (`progress/e2e_QC-211_pasos-de-envasado.log`), contra `QuimiCloude_QC211`:

```
  ✓  [chromium] › e2e\pasos-de-envasado.spec.ts › … R32 …
  ✓  [webkit]   › e2e\pasos-de-envasado.spec.ts › … R32 … (34.5s)
  2 passed (39.0s)
```

Regresión de los 5 E2E que pide T16 (`progress/e2e_QC-211_regresion.log`, `12 passed, 2 failed`):
`ejecucion-receta`, `recetas-pasos`, `formula-desde-pdf` y `versiones-de-receta` en verde.
**`empaque.spec.ts` rojo en los dos navegadores**, y no es de esta rama: `e2e/empaque.spec.ts`,
`app/(private)/asignacion/components/` y `e2e/helpers` son idénticos a `origin/dev`. El spec siembra el pedido en
`EN_CURSO` (línea 461) y espera la confirmación `assigned-order-start-confirm`, que el disparador
solo pinta para un pedido `PENDIENTE`. Lo rompió 6ef2b6e9 (confirmación antes de Comenzar) en
`dev`. El E2E de esta ficha tenía el mismo fallo y se arregló sembrando `PENDIENTE`, como
`ejecucion-receta.spec.ts`.

## Pendiente para el humano

- **T15**: cargar el añadido de `design.md > 6.2` en `FORMULA_PROMPT` (`.env` local y Vercel, en cada
  entorno). No bloquea el merge: el código tolera la ausencia de `packingSteps` (R15).
- `e2e/empaque.spec.ts` rojo en `dev` (ver arriba): deuda ajena, para otra ficha o un arreglo en `dev`.
