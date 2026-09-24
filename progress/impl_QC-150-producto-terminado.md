# QC-150 — producto-terminado · bitácora del implementer

Rama `feature/QC-150-producto-terminado`, worktree `.worktrees/QC-150-producto-terminado`.

## Base de datos

- **Base propia `QuimiCloude_QC150`**, creada el 2026-09-24 con
  `CREATE DATABASE "QuimiCloude_QC150" TEMPLATE "qct_tpl_51f079471849"` (plantilla de integración de
  la rama tras el merge, `pnpm run db:test template`, 48 migraciones). `prisma migrate status`:
  «Database schema is up to date!».
- **Solo el `.env` del worktree** apunta a ella (`DATABASE_URL` y `DIRECT_URL`); el original quedó en
  `.env.bak-QuimiCloude` (ignorado por git). Además cada comando de migración exporta la variable
  del proceso. `QuimiCloude` (compartida) no se tocó.
- **Borrar `QuimiCloude_QC150` al cerrar la feature.**

## T0 — merge de `origin/dev` y contraste

- `git merge origin/dev` → `86e9873a`, sin conflictos. Trae QC-141 (PR #116) y QC-145 (ya `done`).
- `pnpm install --frozen-lockfile`, `prisma generate`, `next typegen`. `pnpm run typecheck` verde;
  `pnpm run lint` 0 errores, 2 avisos preexistentes (imports sin usar ajenos a la rama).
- Contraste del diseño: **12 divergencias**, anotadas y corregidas en `design.md > 10` (`ea7d39a5`).
  Ninguna cambia un requisito salvo **C12**:
  - **C12 — largo del nombre del producto terminado (BLOQUEA T7).** `recipeNameSchema` 120 + « · » 3
    + `presentationNameSchema` 60 = **183**, frente a los **120** de `productNameSchema`
    (`products.name` es `text` sin límite en la base). T7 manda parar y subirlo.
  - C2 es la más delicada: `product_batches_unit_cost_positive CHECK (unit_cost > 0)` sigue en vigor,
    así que el lote a coste cero de R42 no se podría escribir; T2 lo acota al lote de producción.
  - C6: QC-145 ya retiró la edición a `ENTREGADO`; R27 se cubre con la cláusula de T9.
- Gate `./init.sh --rapido`: lo corre el leader.

## T5 — Cálculos puros (`6c422930`, backend_dev)

- Nuevos: `lib/modules/inventario/domain/finished-goods.ts`, `tests/unit/inventario/finished-goods.test.ts`.
- Modificados: `lib/modules/inventario/index.ts` (exporta `planFinishedGoods` y `FinishedGoodsPlan`),
  `lib/modules/pedidos/domain/order-cost.ts` (`calculateLotIngredientsCost`),
  `lib/modules/pedidos/domain/resolve-ingredients-cost.ts` (`resolveLotIngredientsCost`, lecturas
  compartidas en `loadCostInput`), `tests/unit/pedidos/{order-cost,resolve-ingredients-cost}.test.ts`.
- Formato: cantidades, contenido y coste unitario en `d.dddd`; `packages` como entero plano.
  Desbordamiento en `calculateLotIngredientsCost` → `Error` genérico, que la acción traduce a `unexpected`.
- Tests: 6 archivos / 75 tests verdes (`finished-goods`, `order-cost`, `resolve-ingredients-cost`,
  `inventario/module-contract`, `decimal-quantity`, `unit-cost`). `vitest related` de los 4 archivos
  de `lib`: 231 archivos, 3569 pasados, 6 skipped, 0 fallos. Typecheck limpio; lint 0 errores.
