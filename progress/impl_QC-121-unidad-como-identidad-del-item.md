# impl QC-121 — unidad-como-identidad-del-item

## Estado (2026-09-19)

| Task | Estado | Commit |
|---|---|---|
| T1, T2, T3 | hechas | `21c430a0`, `5c4ecf48`, `7a5ea4b7` |
| T4 + T14 | hechas; `[x]` tras `--rapido` del 2026-09-19 (ver abajo) | `0cf25456` |
| T5 | hecha, `[x]` | `46b6f486` |
| T6 | hecha, `[x]` | `156389a2` (back), `48c46ca0` (front) |
| T7 | hecha, `[x]` | `20d11778` |
| T8 | hecha, `[x]` | `93ec24e5` (back), `f2629e30` (front) |
| T9 | commiteada; **sin `[x]`**: su «Hecho» exige `--rapido` verde y el gate murio por memoria | `406e5ffd` |
| T10-T13, T15 | sin empezar | — |

## Tanda T5-T9 (2026-09-19)

### Archivos

- T5: `lib/modules/inventario/domain/product-view.ts`, `…/persistence/product-prisma.ts`,
  `…/persistence/product-catalog-prisma.ts`. Tests: `product-prisma`, `product-catalog` (bloque
  R14), fixtures de `ProductView` en `authorization`, `company-isolation-service`, `company-scope`,
  `product-batches-sheet`, `product-field`, `product-page`, `product-service`,
  `recetas-ui/recipe-form`; y los rojos previstos en `design.md > 12.2` de `qc91-alcance` y
  `unidades/module-contract`. `recipe-service.test.ts` sin cambios (mockea `findRefs`), verde.
- T6 back: `domain/product-queryable.ts` (`stock` ordenable y `numberRange`),
  `product-prisma.ts` (`productOrderBy`/`productFilterWhere`, sin `nulls`: la columna es
  `NOT NULL DEFAULT 0`). Tests: `list-query`, `list-use-cases`, `list-query-products.int` (orden y
  rango sobre Postgres; los 3 rojos reescritos — ver nota abajo).
- T6 front: `app/(private)/inventario/components/{product-columns.tsx,product-list-params.ts,index.ts}`
  (`STOCK_MIN_PARAM`/`STOCK_MAX_PARAM`/`STOCK_COLUMN_ID` recuperados de `9c5c8c43^`;
  `HiddenProductField` pasa a `'unitId'`). Tests: `product-list-params`, `product-page`,
  `product-route-contract` (centinela del campo oculto invertido).
- T7: `app/(private)/produccion/formulas/components/{product-picker.tsx,recipe-lines-field.tsx,unit-group.ts}`
  (este solo comentario), `formulas/nueva/page.tsx`, `formulas/[id]/page.tsx`. Test:
  `recetas-ui/recipe-line-unit-group.test.tsx` (el helper localiza la opcion por «nombre · unidad»;
  mismas aserciones). `unitsOfGroup`/`resolveLineUnitId` intactas.
- T8 back: `ports/presentation-repository.ts` (`'unit_locked'`), `…/presentation-prisma.ts`
  (`isUnitLockedViolation`: `23514` + `presentations_unit_locked_by_batches`),
  `domain/update-presentation.ts`. Tests: `presentation-service`, `presentation-actions`,
  `presentation-unit.int` (4 casos nuevos). La Server Action no cambio: el traductor generico ya
  entrega `presentation_unit_locked`.
- T8 front: `app/(private)/configuracion/presentaciones/components/presentation-form.tsx`
  (`CODE_TO_FIELD`). Test: `configuracion-ui/presentation-sheet.test.tsx`.
- T9: `product-view.ts`, `product-prisma.ts` (`BATCH_STOCK_BY_UNIT` y `batches` fuera),
  comentarios de `product-catalog.ts`, `product-input.ts`, `product-form.tsx`. `ProductRef.stockByUnit`
  se queda (contrato hacia `recetas`). Tests: `qc91-alcance` (R1/R11 reescritos; R21 intactos),
  `unidades/module-contract`, `product-prisma` y fixtures de 12 archivos, `list-query-products.int`.
  `grep -rn latestBatchUnitId lib app` vacio.

### Salida de tests (por subagente, acotada por archivo)

- typecheck y lint: exit 0 tras cada task (T5, T6 x2, T7, T8 x2, T9).
- T5: 239 pasados / 0 en los 16 archivos tocados; guardias de ambito y arquitectura 86/0.
- T6: `list-query` + `list-use-cases` 43/0; `list-query-products.int` 17/0; `product-list-params`
  15/0; `product-page` 62/0; `product-route-contract` 23/0.
- T7: 4 archivos (`recipe-form`, `recipe-line-unit-group`, `unit-group`, `recipe-route-contract`) 87/0.
- T8: unitarios 60/0; `presentation-unit.int` 10/0; `product-unit.int` + `presentation-uniqueness.int`
  + `company-scope.int` 23/24 (el rojo es `23001` vs `23503`, aceptado como ajeno); `presentation-sheet` 20/0.
- T9: 16 archivos unitarios 262/0; `list-query-products.int` 17/0; guardias de arquitectura y
  catalogo 96/0.

### Gate rapido tras T9

`./init.sh --rapido` (salida en `$TEMP/qc121-rapido-t9.log`) **no llego a typecheck**: Claude Code
lo mato por falta de memoria del sistema tras el preflight (verde salvo el aviso
«prisma generate fallo», que es el conocido de cliente bloqueado en Windows). No es un rojo del
gate; no se relanzo sin orden. Por eso T9 queda sin `[x]`.

### Nota de T6 (a confirmar por el reviewer)

De los 3 rojos de `list-query-products.int`, solo 2 tenian de verdad dos unidades en un producto y
se partieron en dos productos. El tercero («lote vencido sigue sumando») tenia una sola unidad y
caia porque el producto no tenia `unit_id`; se arreglo dando al producto la unidad de su
presentacion, para no perder lo que prueba (vencido + vigente suman en el mismo producto).

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

Preflight, typecheck, lint y guardias **verdes**. `test:rapido`: 369 archivos, 5514 pasados, **25 rojos**, 26 skipped (1125 s).
Los 25, clasificados:

- **22 por Postgres local 18.6** (`docs/verification.md`, tabla del gate), en modulos que esta rama
  **no toca** (`git diff origin/dev...HEAD` vacio sobre `lib/modules/unidades` y esos tests):
  - 17 `expected '23001' to be '23503'` (identity 6, asignaciones 3, work-groups 2,
    unidades-constraints 2, inventario-constraints, presentation-uniqueness, pedidos-constraints,
    recetas-constraints).
  - 3 `unit-write.int.test.ts` R24: el adaptador traduce `P2003`; con 18.6 la FK RESTRICT sale como
    `23001`, Prisma no la traduce y llega `PrismaClientUnknownRequestError`. Misma causa.
  - 2 `company-scope.int.test.ts` (proveedores, recetas) «9 vs 10»: la fila `NOT NULL` propia de
    `pg_constraint` en 18.
- **3 `list-query-products.int.test.ts`**: esperados; el disparador de T3 prohibe lotes en dos
  unidades. Los reescribe **T6**.

**Decision humana 2026-09-19**: los rojos de Postgres 18.6 se aceptan como ajenos para cerrar
QC-121. Con eso, T4 y T14 se marcan `[x]`.

## Mapa R<n> -> test

Pendiente (T12).
