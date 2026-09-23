# QC-147 — cantidades-de-receta-en-porcentaje · bitácora del implementer (F2.1)

> Worktree `.worktrees/QC-147-cantidades-de-receta-en-porcentaje`, rama
> `feature/QC-147-cantidades-de-receta-en-porcentaje`. Base: `6c9bbaf5`. Sin push ni PR.
> T1–T11 cerradas y commiteadas, una por commit (T8 y T10 llevan un commit de ajuste más cada una).
> **T12 sigue abierta**: pide `./init.sh` completo, y ese lo corre el leader. El E2E ya está
> ejecutado y en verde en Chromium y WebKit: ver «Vuelta 2», al final.

## Commits

| Task | Commit | Qué |
|---|---|---|
| T2 | `55988902` | aritmética del porcentaje (`recipe-percentage.ts`) en el barrel de `recetas` |
| T5 | `fee34529` | `ProductRef.unitId` (inventario) |
| T3 | `959696c1` | contrato de entrada: porcentaje, línea estricta, suma exacta de 100 |
| T1 | `1c3f5310` | migración `20260922160000_recipe_lines_percentage (antes 20260919120000, renombrada en la vuelta 2)` (+ `down.sql`), esquema Prisma |
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

**db/**: `db/migrations/20260922160000_recipe_lines_percentage (antes 20260919120000, renombrada en la vuelta 2)/{migration.sql,down.sql}` (nuevos),
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
| R7 | `tests/unit/recetas/authorization.test.ts` › «QC-74 R12 — con entrada invalida, el rechazo es por PERMISO y no por validacion» (entrada con `lines: []`); `tests/unit/recetas/recipe-service.test.ts` › `R7 — sin permiso, el repositorio no se llama` (97,50 % y sin líneas, `.rejects.toBeInstanceOf(UnauthorizedError)` desde la vuelta 2) |
| R8 | `tests/unit/recetas/schema/recipe-lines-percentage-migration.test.ts` › «el NO FORCE va antes del DELETE…» y «no menciona "recipes"…»; `tests/integration/recetas/recipe-lines-percentage.int.test.ts` › caso de R8, reescrito en la vuelta 2: en una transacción aplica `down.sql`, siembra receta con pasos y una línea vieja, aplica `migration.sql` y comprueba que la receta conserva nombre, descripción, pasos, `updated_at` y `deleted_at` con cero líneas (ROLLBACK) |
| R9 | `tests/integration/recetas/recipe-lines-percentage.int.test.ts` › describe de R9 (vuelta 2): en una transacción aplica `down.sql`, comprueba `quantity numeric(14,4) NOT NULL` + `recipe_lines_quantity_positive` + `unit_id uuid NOT NULL` + `recipe_lines_unit_id_fkey` + índice y sin `percentage`, reaplica `migration.sql` y comprueba que vuelve (ROLLBACK); `tests/unit/recetas/schema/recipe-lines-percentage-migration.test.ts` › `down.sql`; y a mano `db:rollback` + `db:migrate` sobre `QuimiCloude_QC147` (vuelta 2) |
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
| R22 | `e2e/recetas-porcentaje.spec.ts` › escenarios 1–4, **en verde en Chromium y WebKit** (vuelta 2, salida abajo) |
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
7. **E2E.** Se escribió `e2e/recetas-porcentaje.spec.ts` y se pasaron a porcentaje los dos specs de recetas, pero **no se ejecutaron**. Tocan importes, así que el E2E hace falta antes del PR. Los escenarios 3 y 4 usan dos pedidos distintos (uno creado por la UI y otro sembrado ya asignado), por `fullyParallel`. *(Vuelta 2: ya se han ejecutado, ver abajo.)*

---

# Vuelta 2 (2026-09-22): gate rojo y 11 menores del reviewer

Encargo del leader: base propia, renombrar la migración, dos rojos nuevos, los menores y el E2E.
Nada de `./init.sh`, `pnpm test` ni suite completa.

## Commits de la vuelta 2

| Punto | Commit | Qué |
|---|---|---|
| 1 | — (operación de base, sin commit) | rollback en la compartida `QuimiCloude` y base propia `QuimiCloude_QC147` |
| 2 / menor 1 | `294fe0ee` | `20260919120000_recipe_lines_percentage` → `20260922160000_recipe_lines_percentage` (+ lista cerrada de la guardia) |
| 3 | `e1788c4a` | `tests/unit/unidades/module-contract.test.ts` enmendado |
| 5 / menores 2 y 4 | `ccbbbba4` | la migración y su `down.sql` se ejercitan en integración |
| 5 / menor 3 | `5f97f3ad` | R7 afirma `UnauthorizedError` |
| 5 / menores 5 y 7 | `b6279c78` | separador «·» en la línea del Operario; nombre de test que contradecía D7 |
| 5 / menores 6 y 10 | `2d215666` | asertos del E2E del Operario por elemento; comentarios de e2e sin citas |
| 5 / menor 8 | `17bd7895` | comentarios de producción corregidos y acotados (`recipe-view.ts`, `recipe-lines-field.tsx`, `recipe-form-state.ts`) |
| 5 / menor 10 | `fdb26d12` | comentarios de test sin citas |
| 6 | `234176c2`, `cce750d1`, `cab2d2b7` | correcciones que sacó el E2E (abajo) |

## 1. Base de datos

- **Compartida `QuimiCloude` (la del `.env` del árbol principal).** Seguía teniendo aplicada la migración de
  QC-147 (`20260919120000_recipe_lines_percentage`), porque en la vuelta 1 se hizo rollback y
  después se volvió a migrar. En esta vuelta se corrió `pnpm run db:rollback` desde el worktree
  antes del rename. El script revierte la última carpeta del worktree, que era esa: aplicó su
  `down.sql` y borró su fila de `_prisma_migrations`. `recipe_lines` vuelve a
  `id, recipe_id, product_id, created_at, updated_at, quantity, unit_id`. Las demás filas del
  registro no se tocaron. Entre ellas está la ajena `20260922130000_orders_presentation`, que no es
  de esta rama. Las líneas de receta borradas no vuelven (asumido por el leader).
- **Base propia `QuimiCloude_QC147`**, con la receta de QC-81 (`progress/current.md`):
  `pnpm run db:test template` construyó la plantilla `qct_tpl_b7371fba8f31` con las 40
  migraciones de la rama, ya con el nombre nuevo, y después se ejecutó
  `CREATE DATABASE "QuimiCloude_QC147" TEMPLATE "qct_tpl_b7371fba8f31"`. `_prisma_migrations`
  tiene 40 filas, todas terminadas y ninguna revertida.
  **Solo el `.env` del WORKTREE** apunta a `QuimiCloude_QC147` (`DATABASE_URL` y `DIRECT_URL`).
  El `.env` del árbol principal sigue en `QuimiCloude`.
- R9 a mano, **sobre `QuimiCloude_QC147`**: `pnpm run db:rollback` → `db:test status` («1 migración
  atrás») → `pnpm run db:migrate` → `db:test status` («al día: 40 migraciones»).

## 2. Timestamp (menor 1)

La migración se renombró a `20260922160000_recipe_lines_percentage`, posterior a
`20260922150000_product_type_enum`, que es la última de `origin/dev`. La lista cerrada de
`tests/guards/guard-identificador-de-request.test.ts` se actualizó. El test estático de la
migración compara contra todas las carpetas de `db/migrations/` y no contra un literal, así que no
hizo falta tocarlo. **Queda pendiente para F2.3:** al hacer merge con `origin/dev`, esa lista
cerrada de la guardia seguirá dando conflicto, porque las dos ramas añaden su migración.

## 3. `tests/unit/unidades/module-contract.test.ts`

El caso «la unidad del producto es la columna guardada y nunca un texto» se enmendó con el patrón
del propio archivo («QUE AFIRMABA ANTES / QUE AFIRMA AHORA»). Ahora afirma que
`ProductRef.unitId: string | null` existe, porque lo consumen el costo con porcentaje, la tabla de
Pedidos y la ejecución del Operario. Sigue prohibiendo el campo `unit` de texto. No se metió en el
baseline. Resultado: 8/8 en verde.

## 4. `ciclo-de-vida-de-la-base.int.test.ts`, R7: **es del entorno, no se ha tocado**

Evidencia:
- `git diff origin/dev...HEAD -- tests/helpers tests/integration/infra vitest.config.mts scripts`
  no devuelve nada. La rama no toca la infraestructura de tests, y `dropRunDatabase` es un
  `DROP DATABASE … WITH (FORCE)` sobre una base efímera.
- Corridas aisladas en el worktree:
  - Del subagente: 2/5 en rojo justo después de construir la plantilla y copiar
    `QuimiCloude_QC147`, y 5/5 en verde las dos siguientes.
  - Mías: 3 en rojo con 2 saltados (198 s, con el E2E de otro worktree ocupando la máquina), después
    1 en rojo y 4 en verde (104 s), y por último **5/5 en verde (36 s)**.
- En el árbol de dev, en paralelo: 5/5 en verde (54 s y 29 s).
- Cada rojo es un timeout de 20 s en `DROP DATABASE`, y aparece solo con la máquina cargada. En ese
  momento había otros worktrees corriendo E2E en el puerto 3117 (QC-146). Es la misma caída por
  plazo que `docs/verification.md` ya documenta para este archivo. Con la máquina libre, la rama
  pasa igual que dev.

## 5. Menores del reviewer

| n.º | Estado | Cómo |
|---|---|---|
| 1 | cerrado | punto 2 |
| 2 | cerrado | el caso de R8 ejercita de verdad `down.sql` → datos viejos → `migration.sql` en una transacción |
| 3 | cerrado | `recipe-service.test.ts › R7` usa `.rejects.toBeInstanceOf(UnauthorizedError)`; el mapa cita `authorization.test.ts › QC-74 R12` |
| 4 | cerrado | describe de R9 en integración (en una transacción, con ROLLBACK) y rollback manual sobre `QuimiCloude_QC147` |
| 5 | cerrado | «Hipoclorito · 10,00 % · 20 L» con separadores `aria-hidden`; el test compara el `textContent` de la fila entera |
| 6 | cerrado | escenario 4: `line-percentage-0`, `line-quantity-0` y `line-unit-0` con `toHaveText` exacto |
| 7 | cerrado | el describe de `order-execution-screen.test.tsx` pasa a «sin factor de escala, con la cantidad de la linea ya calculada» |
| 8 | cerrado | `recipe-view.ts` (`productStock`: `null` solo si el insumo está de baja), cabecera de `recipe-lines-field.tsx` (ya no contradice R11, 5 líneas), `recipe-form-state.ts` (sin la afirmación del `grep`) |
| 9 | **no se hace, justificado** | los comentarios de `unidades` (`unit-write-prisma.ts:87`, `delete-unit.ts:26`, `errors.ts:164`, `unit-catalog.ts:3`, `ports/unit-write-repository.ts:66`) no están en el diff de esta ficha, y el propio reviewer propone una ficha de limpieza de `unidades`. Además, tocar `lib/modules/unidades` activa las guardias de módulo intacto de QC-39 |
| 10 | cerrado, con 2 excepciones | se quitaron las citas `QC-`/`R<n>`/`D<n>`/`design.md` de los comentarios añadidos en tests y e2e; el `R<n>` solo queda en nombres de caso. Excepción: las listas cerradas de `guard-identificador-de-request.test.ts` y `tests/unit/recetas/scope.test.ts`, donde cada entrada cita su ficha por el patrón del propio archivo |
| 11 | cerrado | T10 cumple ahora su «Hecho cuando»: E2E en verde en Chromium y WebKit (punto 6) |

## 6. E2E, contra `QuimiCloude_QC147`

Lo que salió en las corridas y se corrigió:
- **Escenario 1:** el test comparaba `Decimal.toString()` («92.5») con «92.50». Se corrigió a
  `toFixed(2)`; es un fallo del test.
- **Escenario 4:** el insumo en litro tiene unidades hermanas, así que la fila pinta el selector y
  no existía `order-execution-line-unit-0`. El componente pone ahora ese testid también en el
  `SelectValue`, y hay un test unitario nuevo (L → ml). Además, **el símbolo real de `litro` en el
  catálogo arrancador es «l»** (`units_catalog/migration.sql:118`), no «L» como ponen los ejemplos
  de R18/R22. El E2E afirma el símbolo leído del catálogo; no se cambia el dato.
- **Escenario 1 en WebKit, siempre rojo:**
  - Causa: tras `page.goto`, el `fill()` del nombre llegaba antes de que React hidratara. WebKit
    no despachaba `input`, así que el estado quedaba en `''`, el nombre se borraba al elegir un
    ingrediente, y la acción lo rechazaba («Revisa los campos marcados.», visto en la traza).
  - Arreglo: ese primer campo se teclea con `pressSequentially`. Es un fallo del test, no del
    producto. `e2e/recetas-pasos.spec.ts` ya documenta el mismo síntoma y lo esquiva con
    `fillControlled`.

Salida final: `pnpm exec playwright test e2e/recetas-porcentaje.spec.ts e2e/recetas.spec.ts e2e/recetas-pasos.spec.ts --project=chromium --project=webkit`, exit 0 (títulos recortados):

```
✓   4 [chromium] › e2e\recetas-porcentaje.spec.ts:503:7 › escenario 3 (R13, R15, R25) - un pedido de 200 …
✓   6 [chromium] › e2e\recetas.spec.ts:335:7 › el Administrador entra, da de alta una receta con una linea …
✓   5 [chromium] › e2e\recetas-porcentaje.spec.ts:545:7 › escenario 4 (R18, R22, R25, R26) - el Operario …
✓   3 [chromium] › e2e\recetas-porcentaje.spec.ts:456:7 › escenario 2 (R3, R23) - una receta sin lineas …
✓   2 [chromium] › e2e\recetas-porcentaje.spec.ts:393:7 › escenario 1 (R25) - dos ingredientes escritos …
✓   1 [chromium] › e2e\recetas-pasos.spec.ts:307:7 › el Administrador redacta un paso …
✓   8 [chromium] › e2e\recetas.spec.ts:437:7 › un usuario sin recetas.consultar recibe 404 …
✓   7 [chromium] › e2e\recetas.spec.ts:385:7 › busca las recetas propias por su nombre …
✓  10 [webkit] › e2e\recetas-porcentaje.spec.ts:456:7 › escenario 2 (R3, R23) …
✓  12 [webkit] › e2e\recetas-porcentaje.spec.ts:503:7 › escenario 3 (R13, R15, R25) …
✓  11 [webkit] › e2e\recetas-porcentaje.spec.ts:393:7 › escenario 1 (R25) …
✓   9 [webkit] › e2e\recetas-pasos.spec.ts:307:7 › el Administrador redacta un paso …
✓  13 [webkit] › e2e\recetas.spec.ts:385:7 › busca las recetas propias por su nombre …
✓  14 [webkit] › e2e\recetas-porcentaje.spec.ts:545:7 › escenario 4 (R18, R22, R25, R26) …
✓  15 [webkit] › e2e\recetas.spec.ts:437:7 › un usuario sin recetas.consultar recibe 404 …
✓  16 [webkit] › e2e\recetas.spec.ts:335:7 › el Administrador entra, da de alta una receta …
16 passed (2.9m)
```

(Al cerrar, el servidor de Playwright imprime `[WebServer] ELIFECYCLE Command failed with exit code 1`. Es el apagado del servidor de desarrollo y no afecta al exit 0 de la corrida.)

## Salida real de los tests de la vuelta 2 (tras el último commit)

- `pnpm run typecheck`: exit 0. `pnpm run lint`: exit 0.
- `pnpm exec vitest run <22 archivos de test tocados en 646a88e1..HEAD> recipe-lines-percentage-migration.test.ts unidades/module-contract.test.ts`
  → `Test Files 23 passed (23)` · `Tests 335 passed | 1 skipped (336)`. Incluye los dos de integración de la
  ficha (`recipe-lines-percentage.int.test.ts` y `order-ingredients-cost.int.test.ts`).
- `pnpm exec vitest run guard` → `Test Files 48 passed (48)` · `Tests 593 passed | 9 skipped (602)`.
- Siguen en rojo, y están listados en `tests/baseline-rojos.json`: `tests/unit/recetas/module-contract.test.ts` y
  `tests/unit/recetas-ui/recipe-route-contract.test.ts`, por su caso de diff de rama.

## Qué queda abierto

- T12: `./init.sh` completo, que corre el leader.
- Conflicto que ya se sabe que habrá al hacer merge con `origin/dev` (F2.3): `feature_list.json` y la lista cerrada de migraciones de `guard-identificador-de-request.test.ts`.
- Menor 9: los comentarios de `unidades` siguen citando una FK que ya no existe. Se propone una ficha de limpieza.
- R18/R22 ponen «20 L» de ejemplo, pero en el catálogo el litro es «l». No se ha cambiado nada: se deja anotado por si el humano quiere cambiar el símbolo.
