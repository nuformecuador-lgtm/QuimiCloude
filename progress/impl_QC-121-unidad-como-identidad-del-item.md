# impl QC-121 — unidad-como-identidad-del-item

## Estado (2026-09-19)

| Task | Estado | Commit |
|---|---|---|
| T1, T2, T3 | hechas | `21c430a0`, `5c4ecf48`, `7a5ea4b7` |
| T4 + T14 | hechas; `[x]` tras `--rapido` del 2026-09-19 (ver abajo) | `0cf25456` |
| T5-T13, T15 | sin empezar | — |

T4 y T14 van en un solo commit: los dos tocan `product-prisma.ts` y `product-stock.int.test.ts`,
y el trabajo venia mezclado de la sesion cortada.

## Parada: el gate rapido lo mato la falta de memoria

`./init.sh --rapido` tras T4/T14 llego a typecheck y lint **verdes** y fue detenido por Claude
Code a mitad de `test:rapido` porque el sistema se quedo sin memoria (no es un fallo del gate).
No se relanza sin orden. Nota: `test:rapido` selecciona por el diff **commiteado** contra
`origin/dev`, por eso se commiteo antes de repetirlo.

## Entorno

- En el Bash de esta maquina `pnpm` del PATH por defecto (shim de nvm) falla con
  `CommandNotFound`. Funciona anteponiendo `export PATH="$HOME/AppData/Local/pnpm/bin:$PATH"`.
- Postgres local es **18.6** (`SELECT version()`); el objetivo es 17.

## Archivos de T4/T14

Produccion: `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`,
`lib/modules/inventario/ports/product-repository.ts`, `lib/modules/inventario/domain/create-product.ts`,
`lib/composition/index.ts`.
Tests: `tests/integration/inventario/product-stock.int.test.ts` (nuevo, en `aislamiento.json` como
`commit`), `tests/unit/inventario/{product-batch-lot-retry,adjust-batch-stock-prisma,create-product,authorization,company-isolation-service,list-use-cases,product-input,product-service}.test.ts`,
`tests/unit/unidades/schema/unidades-schema.test.ts`, fixtures de
`tests/integration/inventario/{company-scope,company-scope-queries,inventario-constraints,inventory-movements-constraints,ledger-cuadre,presentation-uniqueness,presentation-unit,product-batch-lot,product-batch-write}.int.test.ts`,
`tests/integration/{unidades/unidades-constraints,recetas/recetas-constraints}.int.test.ts`,
`e2e/{aislamiento-inventario,ajuste-de-inventario}.spec.ts`.
Los casos de `product-prisma.test.ts` que pide T4 viven en `product-batch-lot-retry.test.ts`
(`createWithFirstBatch — unidad del producto y recalculo`, `addBatchToAlive — no toca el producto
salvo su stock recalculado`).

## Salida de tests (backend_dev, 2026-09-19)

- `pnpm run typecheck` y `pnpm run lint`: exit 0.
- `vitest related --run --project node --project ui` sobre los 4 archivos de `lib/`: 157 archivos,
  2486 pasados, 6 skipped, 0 fallidos.
- `vitest run guard`: 47 archivos, 588 pasados, 9 skipped, 0 fallidos.
- `vitest run --project integration tests/integration/inventario` + `unidades-constraints` +
  `recetas-constraints`: 17 archivos (12 verdes, 5 rojos); 237 tests (229 verdes, 8 rojos).
  `product-stock.int.test.ts` solo: 9/9 verde.
  - `list-query-products.int.test.ts` (3 rojos): producto con lotes en dos unidades; el disparador
    de T3 lo prohibe. Lo reescribe **T6** (`design.md > 12.2`).
  - 5 casos `expected '23001' to be '23503'` en `inventario-constraints`, `presentation-uniqueness`,
    `recetas-constraints`, `unidades-constraints`: fallan igual en `origin/dev`; es el sintoma de
    Postgres 18.6 documentado en `docs/verification.md` (tabla del gate). No estan en
    `tests/baseline-rojos.json`. Ajenos a esta rama.

## Gate rapido tras T4/T14 (2026-09-19, relanzado)

Preflight, typecheck, lint y guardias **verdes**. : 369 archivos, 5514 pasados, **25 rojos**, 26 skipped (1125 s).
Los 25, clasificados:

- **22 por Postgres local 18.6** (, filas de la tabla del gate), en modulos que esta rama **no toca** ( vacio sobre ellos):
  - 17  (identity 6, asignaciones 3, work-groups 2, unidades-constraints 2, inventario-constraints, presentation-uniqueness, pedidos-constraints, recetas-constraints).
  - 3  R24: el adaptador mapea ; con 18.6 la FK RESTRICT sale como  y Prisma no la traduce, llega . Misma causa.
  - 2  (proveedores, recetas) «9 vs 10»: fila  en  propia de 18.
- **3 **: esperados; el disparador de T3 prohibe lotes en dos unidades. Los reescribe **T6**.

**Decision humana 2026-09-19**: los rojos de Postgres 18.6 se aceptan como ajenos para cerrar QC-121. Con eso, T4 y T14 se marcan .

## Mapa R<n> -> test

Pendiente (T12).
