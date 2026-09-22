# QC-147 — cantidades-de-receta-en-porcentaje · bitácora del implementer (F2.1)

> Worktree `.worktrees/QC-147-cantidades-de-receta-en-porcentaje`, rama
> `feature/QC-147-cantidades-de-receta-en-porcentaje`. Base: `6c9bbaf5`. Sin push ni PR.
> T1–T11 cerradas y commiteadas, una por commit (T8 y T10 llevan un commit de ajuste más cada una).
> **T12 sigue abierta**: pide `./init.sh` completo, y ese lo corre el leader. El E2E se escribió
> pero **no se ha ejecutado**: lo corre el leader.

## Commits

| Task | Commit | Qué |
|---|---|---|
| T2 | `55988902` | aritmética del porcentaje (`recipe-percentage.ts`) en el barrel de `recetas` |
| T5 | `fee34529` | `ProductRef.unitId` (inventario) |
| T3 | `959696c1` | contrato de entrada: porcentaje, línea estricta, suma exacta de 100 |
| T1 | `1c3f5310` | migración `20260919120000_recipe_lines_percentage` (+ `down.sql`), esquema Prisma |
| T4 | `1b838ff3` | servicio, puertos y persistencia de `recetas` |
| T7 | `823d808b` | tabla de ingredientes de Pedidos |
| T8 | `190e7a64` | vista y pantalla de ejecución del Operario, sin factor |
| T6 | `439d2b80` | costo de ingredientes con porcentaje |
| T9 | `88be3b2d` | formulario de recetas en porcentaje + indicador de suma |
| T11 | `d8bb8c50` | `docs/architecture.md`, guardia de esquema, comentarios de producción sin citas |
| T8 (ajuste) | `809131d2` | «Pedido 200» con `formatDecimalDisplay`, no «Pedido 200.0000» |
| T10 | `92951b1d` | E2E nuevo + `recetas.spec.ts` / `recetas-pasos.spec.ts` a una línea al 100 % |
| T10 (ajuste) | `94a33a10` | registro del E2E nuevo en los dos inventarios cerrados de `e2e/` |

## Archivos tocados (82 en `git diff --stat 6c9bbaf5..HEAD`)

**db/**: `db/migrations/20260919120000_recipe_lines_percentage/{migration.sql,down.sql}` (nuevos),
`db/schema.prisma`.

**lib/**: `recetas/domain/{recipe-percentage.ts (nuevo), recipe-input.ts, create-recipe.ts,
update-recipe.ts, get-recipe.ts, recipe-view.ts, recipe-catalog.ts}`, `recetas/index.ts`,
`recetas/ports/recipe-repository.ts`, `recetas/adapters/driven/persistence/{recipe-prisma.ts,
recipe-catalog-prisma.ts}`, `inventario/domain/product-catalog.ts`,
`inventario/adapters/driven/persistence/product-catalog-prisma.ts`,
`pedidos/domain/{order-cost.ts, resolve-ingredients-cost.ts}`,
`asignaciones/domain/{assigned-order-execution-view.ts, get-assigned-order-execution.ts}`,
`lib/composition/index.ts` (solo se quita `units` del cableado de alta y edición de receta).

**app/**: `pedidos/components/order-ingredients-table.tsx`;
`produccion/formulas/components/{recipe-lines-field.tsx, recipe-form-state.ts, recipe-form.tsx,
index.ts}`; **borrados** `unit-picker.tsx`, `unit-group.ts`;
`asignacion/[id]/components/{order-execution-lines.tsx, order-execution-screen.tsx, index.ts}`;
**borrado** `order-scale-banner.tsx`.

**docs/**: `docs/architecture.md` (Dominio, punto 1: la línea de receta ya no apunta a unidades).

**e2e/**: `recetas-porcentaje.spec.ts` (nuevo), `recetas.spec.ts`, `recetas-pasos.spec.ts`.

**tests/** nuevos: `unit/recetas/recipe-percentage.test.ts`,
`unit/recetas/schema/recipe-lines-percentage-migration.test.ts`,
`integration/recetas/recipe-lines-percentage.int.test.ts` (declarado en `aislamiento.json` como
`transaccion`), `unit/pedidos/resolve-ingredients-cost.test.ts`,
`unit/pedidos-ui/order-ingredients-table.test.tsx`, `unit/recetas-ui/recipe-lines-sum.test.tsx`.
**Borrados**: `unit/recetas-ui/unit-group.test.ts`, `unit/recetas-ui/recipe-line-unit-group.test.tsx`.
Modificados: los de la tabla de `design.md > 12` más `unit/asignaciones/start-assigned-order.test.ts`,
`unit/pedidos/{create-order,update-order}.test.ts`,
`integration/pedidos/order-ingredients-cost.int.test.ts`,
`integration/unidades/unit-write.int.test.ts`,
`unit/recetas/schema/recipes-company-scope-migration.test.ts`,
`guards/guard-identificador-de-request.test.ts` (migración nueva y E2E nuevo en sus listas cerradas),
`unit/recetas/scope.test.ts` (E2E nuevo en su lista cerrada).

## Mapa R<n> -> test

| R | Test |
|---|---|
| R1 | `tests/unit/recetas-ui/recipe-form-payload.test.ts` › «cada línea viaja con productId y percentage, sin unidad…»; `tests/unit/recetas/recipe-service.test.ts` › «R33 — la lista no trae lineas, el detalle si» (forma exacta, sin `unitId`); `tests/unit/recetas/recipe-input.test.ts` › `recipeLineSchema — sin unidad (R5)` |
| R2 | `tests/unit/recetas/recipe-input.test.ts` › `recipeLineSchema — porcentaje invalido (R2)` (`'0','-1','100.01','12.345','abc'`, issue en `['lines', i, 'percentage']`) |
| R3 | `tests/unit/recetas/recipe-input.test.ts` › `suma distinta de 100,00 % (R3)` y `receta sin ninguna linea (R3, R23)`; `tests/unit/recetas/recipe-service.test.ts` › `R3 — suma invalida, el service rechaza sin llamar al repositorio`; `tests/unit/recetas/recipe-percentage.test.ts` › `sumPercentages — R3, R10`; `tests/unit/recetas-ui/recipe-form.test.tsx` › «R3 — un rechazo atribuido a las líneas se pinta en el bloque de líneas» (ver nota 3); E2E escenario 2 |
| R4 | `tests/unit/recetas/recipe-input.test.ts` › `suma exacta de 100,00 % (R4)`; `tests/unit/recetas/recipe-service.test.ts` › `R4 — guarda y relee…`; `tests/integration/recetas/recipe-crud.int.test.ts` › `R4: guarda y relee…` › «92,50 % + 7,50 % se guardan y se releen exactos, contra Postgres real»; E2E escenario 1 |
| R5 | `tests/unit/recetas/recipe-input.test.ts` › `recipeLineSchema — sin unidad (R5)` |
| R6 | `tests/integration/recetas/recipe-lines-percentage.int.test.ts` › `rango y redondeo (R6)` (0/-1/100.01 → 23514; acepta 100.00; 12.345 → 12.35); `tests/integration/recetas/recetas-constraints.int.test.ts` (CHECK de rango); `tests/unit/recetas/schema/recipe-lines-percentage-migration.test.ts` › «declara percentage DECIMAL(5,2) con el CHECK de rango (R6)» |
| R7 | `tests/unit/recetas/recipe-service.test.ts` › `R7 — sin permiso, el repositorio no se llama` (97,50 % y sin líneas); `tests/unit/recetas/authorization.test.ts` › «R16 — sin el codigo exigido se rechaza…» |
| R8 | `tests/unit/recetas/schema/recipe-lines-percentage-migration.test.ts` › «el NO FORCE va antes del DELETE…» y «no menciona "recipes"…»; `tests/integration/recetas/recipe-lines-percentage.int.test.ts` › «una receta con cero lineas conserva nombre, pasos y updated_at» |
| R9 | `tests/unit/recetas/schema/recipe-lines-percentage-migration.test.ts` › `down.sql` › «existe y revierte el UP en orden inverso…»; **más verificación manual** (nota 1) de `db:rollback` + re-`db:migrate` |
| R10 | `tests/unit/recetas-ui/recipe-lines-sum.test.tsx` › `el indicador de suma (R10, R25)`; `tests/unit/recetas/recipe-percentage.test.ts` › `sumPercentages — R3, R10` |
| R11 | `tests/unit/recetas-ui/recipe-lines-sum.test.tsx` › «R11, R23 — sin ninguna línea…»; `tests/unit/recetas-ui/recipe-form.test.tsx` › «R27 — añadir y quitar líneas; sin líneas no se guarda» (Enter incluido; **invertido** por D14); E2E escenarios 1 y 2 |
| R12 | `tests/unit/recetas-ui/recipe-form.test.tsx` › `R12 — sin selector de unidad; el ingrediente se ve con su unidad` (3 casos) |
| R13 | `tests/unit/recetas/recipe-percentage.test.ts` › `consumedQuantity — R13, R21` (200×10→20, 200×2→4, 0,0001×0,01 exacto); `tests/unit/pedidos/order-cost.test.ts` y `resolve-ingredients-cost.test.ts` › «pedido 200, 10 % de un insumo en L con un lote de 50 L a 2,0000 -> 40,0000 (R13, R15)»; E2E escenario 3 |
| R14 | `tests/unit/inventario/product-catalog.test.ts` (`findRefs` devuelve `unitId`, `null` sin lotes); `tests/unit/recetas/recipe-service.test.ts` › `R14, R24 — existencia del insumo en SU PROPIA unidad`; `tests/unit/recetas/recipe-lines-catalog.test.ts` (insumo de baja → `productUnitId` null) |
| R15 | `tests/unit/pedidos/order-cost.test.ts` (casos `(R15)`: orden de lotes, promedio, redondeo, conversión); `tests/unit/pedidos/resolve-ingredients-cost.test.ts` (canónico, unidad hermana, llamadas por catálogo constantes); `tests/integration/pedidos/order-ingredients-cost.int.test.ts` (8 casos); E2E escenario 3 (`orders.ingredients_cost = 40.0000`) |
| R16 | `tests/unit/pedidos/order-cost.test.ts` (casos `(R16)`, incluido `unitId: null`); `tests/unit/pedidos/resolve-ingredients-cost.test.ts` › «receta sin lineas devuelve sin importe (R16)», «existencia insuficiente devuelve sin importe (R16)» |
| R17 | `tests/unit/pedidos-ui/order-ingredients-table.test.tsx` › `R17 — la cantidad requerida y el restante escalan…` (200/10 %/existencia 15 → 20 y −5 resaltado; sin cantidad → 0) |
| R18 | `tests/unit/asignaciones/get-assigned-order-execution.test.ts` › `R18: porcentaje y cantidad de la linea`; `tests/unit/asignaciones-ui/order-execution-lines.test.tsx` › «muestra "Hipoclorito · 10,00 % · 20 L"»; E2E escenario 4 |
| R19 | `tests/unit/asignaciones/get-assigned-order-execution.test.ts` › `R19: sin factor de escala` (claves exactas); `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` › «no monta ningun banner ni factor de escala» |
| R20 | `tests/unit/asignaciones-ui/order-execution-lines.test.tsx` › «elegir mL muestra 20000 y el "10,00 %" no cambia»; `tests/unit/asignaciones/get-assigned-order-execution.test.ts` › `R20: unidades hermanas` |
| R21 | `tests/unit/recetas/recipe-percentage.test.ts` › `consumedQuantity — R13, R21` (200/300 → 2:3); `tests/unit/pedidos/resolve-ingredients-cost.test.ts` › «…pedidos de 200 y 300 … proporcion 2:3 (R21)»; `tests/unit/asignaciones/get-assigned-order-execution.test.ts` › `R21: proporcionalidad entre pedidos` |
| R22 | `e2e/recetas-porcentaje.spec.ts` › escenarios 1–4 (**escrito, no ejecutado**) |
| R23 | `tests/unit/recetas/recipe-input.test.ts` › `receta sin ninguna linea (R3, R23)` (alta y edición, `lines: []` y clave ausente); `tests/unit/recetas/recipe-service.test.ts` › `R23 — editar una receta sembrada sin lineas se rechaza`; `tests/integration/recetas/recipe-crud.int.test.ts` › «rechaza cambiar solo el nombre de una receta viva sin lineas, y el nombre no cambia»; E2E escenario 2 |
| R24 | `tests/unit/recetas/recipe-service.test.ts` › «R24: un insumo sin lotes se guarda…», «R24: un insumo dado de baja sale sin unidad…»; `tests/unit/recetas-ui/recipe-form.test.tsx` › `R24 — un ingrediente SIN NINGÚN LOTE…`; `tests/unit/pedidos-ui/order-ingredients-table.test.tsx` › `R24 — un insumo sin unidad resoluble…`; `tests/unit/asignaciones-ui/order-execution-lines.test.tsx` › `unidad desconocida (R24)`; `tests/unit/asignaciones/get-assigned-order-execution.test.ts` › `R24: insumo sin unidad resoluble` |
| R25 | `tests/unit/recetas/recipe-percentage.test.ts` › `formatPercentage — R25`; `tests/unit/recetas-ui/recipe-lines-sum.test.tsx`; `tests/unit/recetas-ui/recipe-form.test.tsx` › «R25 — la precarga muestra cada porcentaje con formatPercentage»; `tests/unit/pedidos-ui/order-ingredients-table.test.tsx` › `R25 — el porcentaje se pinta con coma y dos decimales`; `tests/unit/asignaciones-ui/order-execution-lines.test.tsx` (R18/R20); E2E escenarios 1, 3, 4 |
| R26 | `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` › `R26: la cantidad del pedido en su propia linea` (incluye «200.0000» → «Pedido 200»); `tests/unit/asignaciones/get-assigned-order-execution.test.ts` › `R26: la cantidad del pedido sigue en la vista`; E2E escenario 4 |

## Tests de QC-26 invertidos o ajustados por D14

- `tests/unit/recetas-ui/recipe-form.test.tsx` › `R27` de QC-26 («una receta sin ninguna se guarda») **invertido** a «sin líneas no se guarda» (Guardar deshabilitado, Enter no llama a la acción); el resto de casos que guardaban sin líneas pasan a una línea al 100 %.
- `tests/unit/recetas/authorization.test.ts`: casos sin permiso intactos; con permiso, una línea al 100 %.
- `tests/unit/recetas/{company-isolation-service,recipe-image-url,recipe-image-lifecycle}.test.ts`: entradas que se guardan pasan a una línea al 100 %. `company-scope.test.ts` no lo necesitó.
- `tests/unit/recetas/recipe-input.test.ts`: los casos que aceptaban sin líneas se invierten o pasan a 60 + 40.
- `tests/unit/recetas-ui/recipe-form-payload.test.ts:72`: se queda (solo arma el payload).
- `tests/unit/recetas/recipe-catalog.test.ts`: lecturas sin líneas, se quedan.
- Integración (`recipe-crud`, `recipe-lines`, `company-scope`, `company-scope-queries`): lo que pasa por el servicio lleva una línea al 100 %; lo que va directo al repositorio se queda.
- `e2e/recetas.spec.ts` y `e2e/recetas-pasos.spec.ts`: su único guardado por la UI pasa a una línea al 100 % sin unidad. Las dos recetas sembradas sin líneas de `recetas.spec.ts` (~:283) nunca se editan ni se guardan por la UI.

## Salida real de los tests (la corrió el implementer tras el último commit de código)

- `pnpm run typecheck` → `tsc --noEmit`, exit 0, sin errores.
- `pnpm run lint` → `eslint`, sin salida, sin errores.
- `pnpm exec vitest run <43 archivos de test añadidos/modificados en 6c9bbaf5..HEAD> tests/unit/recetas/module-contract.test.ts`
  → `Test Files 2 failed | 42 passed (44)` · `Tests 2 failed | 631 passed | 1 skipped (634)`.
  Los 2 rojos están en `tests/baseline-rojos.json` (rojo estructural conocido, por el caso de diff de rama):
  - `tests/unit/recetas/module-contract.test.ts` › «la feature no anade ningun route handler bajo app/, y lib/modules/recetas no cambio de forma (la pantalla es QC-26)»
  - `tests/unit/recetas-ui/recipe-route-contract.test.ts` › «la feature no toca lib/modules/recetas ni db/»
  Ambos casos cuentan `lib/modules/recetas` / `db/` en el diff de rama y culpan a QC-26. Esta ficha cambia `lib/modules/recetas` y `db/` porque su spec lo pide.
- `pnpm exec vitest run guard` → `Test Files 48 passed (48)` · `Tests 593 passed | 9 skipped (602)`.
- Integración, corrida por los subagentes en sus tandas: T1 (constraints + migración + guardias) 55 archivos, 696 passed | 9 skipped; T4 14 archivos, 193/193; T6 `order-ingredients-cost.int.test.ts` 8/8.
- **No se corrieron** ni `pnpm test`, ni `./init.sh`, ni Playwright.

## Notas para el leader y el reviewer

1. **R9 y la base de desarrollo.** El rollback no tiene test automatizado. Se verificó a mano **sobre la base de DESARROLLO de `.env` (`QuimiCloude`)**: `pnpm run db:migrate` (aplica) → `pnpm run db:rollback` (`recipe_lines` vuelve a `quantity numeric NOT NULL` + `unit_id uuid NOT NULL`, y se borra su fila en `_prisma_migrations`) → `pnpm run db:migrate` (reaplica, `rolled_back_at: null`). **La base de desarrollo queda migrada**: cualquier línea de receta que tuviera se ha borrado, como dice D6.
2. **`consumedQuantity` quita los ceros de cola** («20», no «20.000000» como ponía el ejemplo de design §3). No cambia ningún valor, ni exacto ni pintado.
3. **R3 en la UI.** El formulario no puede mostrar un rechazo *por suma* que venga del servidor: R11 deja Guardar deshabilitado antes de llegar. El test prueba el mismo camino de pintado (issue en `['lines']` → error general del bloque) con un rechazo por producto repetido. El rechazo del servidor por suma lo prueban `recipe-service.test.ts` y el E2E.
4. **Ajuste fuera de la letra de las tasks.** El E2E encontró que la pantalla del Operario pintaba «Pedido 200.0000». Ahora usa `formatDecimalDisplay` (commit `809131d2`), para cumplir R26 («Pedido 200»).
5. **`tests/integration/unidades/unit-write.int.test.ts`.** Se quitaron dos casos que usaban `recipe_lines.unit_id`, porque esa columna ya no existe. Lo que probaban de unidades sigue cubierto por los casos paralelos con presentaciones.
6. **Comentario desactualizado, sin tocar.** `lib/modules/unidades/adapters/driven/persistence/unit-write-prisma.ts:87` todavía nombra `recipe_lines_unit_id_fkey`. Ningún test depende de él.
7. **E2E.** Se escribió `e2e/recetas-porcentaje.spec.ts` y se pasaron a porcentaje los dos specs de recetas, pero **no se ejecutaron**. Tocan importes, así que el E2E hace falta antes del PR. Los escenarios 3 y 4 usan dos pedidos distintos (uno creado por la UI y otro sembrado ya asignado), por `fullyParallel`.
