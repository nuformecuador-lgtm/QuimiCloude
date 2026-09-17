# QC-91 — existencia-por-lote · bitácora de implementación

> En curso. Cierra la **tanda 1 (aditiva, T1–T6)**. La tanda 2 (retirada, T7–T9) y la
> tanda 3 (verificación, T10–T13) están pendientes. El mapa `R<n> -> test` completo es T12.

## Tanda 1 — aditiva (T1–T6)

Rama `feature/QC-91-existencia-por-lote`, desde `origin/dev` en `433bad2`.

| Task | Commit | Qué entró |
|---|---|---|
| T1 | `26fa388` | `sumStockByUnit` y `ProductStockByUnit`, pieza pura del dominio |
| T2 | `daa4106` | `ProductView.stockByUnit` y `BATCH_STOCK_BY_UNIT` en el adaptador |
| T4 | `4edab3c` | `ProductRef.stockByUnit` en el contrato público hacia `recetas` |
| T5 | `1788ad9` | `get-recipe` elige la existencia de la unidad de la línea |
| T3 | `0c28c46` | El listado pinta una existencia por unidad y la alerta nueva |
| T6 | `e489baf` | El pedido distingue existencia ausente de existencia cero |

### Archivos creados

- `lib/modules/inventario/domain/product-stock.ts`
- `tests/unit/inventario/product-stock.test.ts`

### Archivos modificados (producción)

- `lib/modules/inventario/index.ts`
- `lib/modules/inventario/domain/product-view.ts`
- `lib/modules/inventario/domain/product-catalog.ts`
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
- `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`
- `lib/modules/recetas/domain/get-recipe.ts`
- `lib/modules/recetas/domain/recipe-view.ts`
- `app/(private)/inventario/components/product-columns.tsx`
- `app/(private)/inventario/components/product-table.tsx`
- `app/(private)/inventario/components/product-list-section.tsx`
- `app/(private)/pedidos/components/order-form.tsx` (solo el comentario de `:380`)

### Tests tocados

`tests/unit/inventario/product-stock.test.ts` (nuevo), `product-prisma.test.ts`,
`product-catalog.test.ts`, `product-page.test.tsx`, `authorization.test.ts`,
`company-scope.test.ts`, `company-isolation-service.test.ts`, `product-service.test.ts`,
`tests/unit/recetas/recipe-service.test.ts`, `recipe-lines-catalog.test.ts`,
`tests/unit/recetas-ui/recipe-form.test.tsx`, `tests/unit/pedidos-ui/order-form.test.tsx`,
`tests/integration/inventario/list-query-products.int.test.ts`.

### Salida real de la verificación acotada (por task; el gate lo corre el leader)

- T1 — `pnpm typecheck` limpio · `pnpm lint` limpio · `vitest related`: 141 archivos, 2273 passed, 4 skipped, 0 failed.
- T2 — `pnpm typecheck` limpio · `pnpm lint` limpio · `vitest related`: 142 archivos, 2305 passed, 1 skipped, 0 failed (incluye integración contra Postgres efímero).
- T4 — `pnpm typecheck` limpio · `pnpm lint` limpio · `vitest related`: 144 archivos, 2277 passed, 1 skipped, 0 failed.
  - Guardia de riesgo declarada en `design.md > 6`: `pnpm exec vitest run tests/unit/unidades/module-contract.test.ts` → **8/8 verdes, sin tocar la guardia**.
- T5 — incluido en la corrida de T4 (mismo agente, misma tanda).
- T3 — `pnpm typecheck` limpio · `pnpm lint` limpio · `vitest related`: 5 archivos, 109 passed.
- T6 — `pnpm typecheck` limpio · `pnpm lint` limpio · `vitest related`: 24 archivos, 316 passed.

### Desviaciones declaradas (no se ajustaron en silencio)

1. **T6 no tocó `order-ingredients-table.tsx`**, que el censo (`design.md > 1.2`, fila 20)
   daba por seguro. Medido en el árbol: `line.productStock ?? MISSING_VALUE_MARK`,
   `remainingOf` devolviendo `null` solo con `productStock === null` e `isShort` para el
   negativo ya cumplían R12, R13 y R14 una vez que T5 entrega el dato ya elegido. Se
   añadieron los tres tests igualmente; no se tocó el archivo por no cambiar nada.
2. **T3 tocó `product-table.tsx`**, que no está en el censo. Hizo falta para bajar `units`
   desde `product-list-section.tsx` hasta `buildProductColumns`; el censo saltó ese
   eslabón intermedio. Sin cambio de comportamiento.
3. **T2 cambió una aserción de `product-prisma.test.ts`**: `PRODUCT_SELECT.batches.take === 1`
   pasó a `expect(PRODUCT_SELECT.batches).not.toHaveProperty('take')`. `take` dejó de existir
   en el tipo al ampliar la lectura a todos los lotes; la aserción afirma lo mismo en la
   forma que compila.
4. **T3 invirtió un caso de `product-page.test.tsx`**: el viejo esperaba que un producto sin
   existencia NO alertara. R17 (decisión humana del 2026-09-17) exige lo contrario.
5. Ningún subagente traía `node_modules` en el worktree; el primero corrió
   `pnpm install --frozen-lockfile`, `prisma generate` y `next typegen`. Sin dependencias
   nuevas: `package.json` y el lockfile intactos.
