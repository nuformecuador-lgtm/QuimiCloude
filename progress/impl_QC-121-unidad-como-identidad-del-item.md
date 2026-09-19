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
| T9 | hecha, `[x]` | `406e5ffd`, `7fc6136e` |
| T15 | hecha, `[x]` | `a40f6966` |
| T10 | hecha, `[x]` | `d1e44f0c` |
| T11 | escrita, **E2E sin ejecutar** (entorno, ver abajo); sin `[x]` | `424d8442` |
| T12 | mapa escrito abajo; sin `[x]` hasta que corra el E2E de T11 (R26, R34) | `ec317702` (test de R20 que faltaba) |
| T13 | del leader | — |

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

### Gate rapido relanzado por el leader (`$TEMP/qc121-rapido-t9b.log`)

Typecheck y lint verdes; 24 rojos. 22 de Postgres 18.6 (aceptados como ajenos). Los otros 4:

- **Desviacion no prevista en `design.md > 12.2`**: `tests/unit/recetas-ui/recipe-route-contract.test.ts`
  > «la feature no toca lib/modules/recetas ni db/». La rama toca la ruta de recetas (T7) y
  añade la migracion de T3, que no estaba en `DB_PERMITIDAS`. Arreglado en `7fc6136e` con
  `MIGRACION_QC121` (las dos rutas de `20260918130000_product_unit_and_stored_stock`), mismo patron
  que las constantes hermanas, sin citar la ficha en el comentario; `db/schema.prisma` ya lo cubria
  `MIGRACION_QC34`. Archivo aislado: 26/26 verde.
- **Tiempos agotados por falta de RAM** (pasan solos, corridos uno a uno el 2026-09-19):
  `tests/unit/identity/session-once-per-request-render.test.tsx` (hook `beforeAll` 60 s) → 7/7;
  `tests/unit/configuracion-ui/grupos/work-group-table.test.tsx` («UNKNOWN: unknown error, read»
  al importar) → 28/28; `tests/unit/inventario/product-page.test.tsx` (test de 20 s) → 62/62.

### Gate rapido tras T9, corrida completa (2026-09-19)

`./init.sh --rapido` (tras cerrar Spotify, Slack y WhatsApp; `$TEMP/qc121-rapido-t9d.log`): typecheck y
lint verdes; `test:rapido` 373 archivos, 5594 pasados, **22 rojos**, todos de Postgres 18.6 aceptados por el
humano (17 `23001` vs `23503`, 3 `unit-write` R24, 2 `company-scope` «9 vs 10»). Cero rojos propios.
**T9 marcada `[x]`.**


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

## Tanda T15, T10, T11, T12 (2026-09-19)

### Archivos

- T15 (`a40f6966`, frontend_dev): `app/(private)/inventario/components/product-table.tsx`
  (`ProductBatchesSheet`: `aria-label` del trigger y `SheetTitle` con
  `productDisplayName(product.name, productUnitLabel(product, units))`), `product-columns.tsx`
  (`productUnitLabel` pasa a exportada: la misma regla que la columna de nombre),
  `components/index.ts`. Test: `tests/unit/inventario/product-batches-sheet.test.tsx` (3 casos
  nuevos). Ningún E2E dependía del texto viejo (solo usan `data-testid`).
- T10 (`d1e44f0c`, backend_dev): `tests/unit/inventario/qc121-alcance.test.ts` (nuevo, 29 casos).
- T11 (`424d8442`, frontend_dev): `e2e/inventario.spec.ts` (test nuevo de R26;
  `crearPresentacionEnLinea` gana un `unitId` opcional; usa las unidades de sistema `kilogramo` y
  `litro` de `20260903121404_units_catalog`), `e2e/aislamiento-inventario.spec.ts` (la celda de
  nombre pasa a `productDisplayName(PRODUCT_A_NAME, UNIT_A_NAME)`),
  `e2e/ajuste-de-inventario.spec.ts` (R34: tras cerrar el panel, sin recargar, la celda
  `product-stock` de la fila = `INITIAL_STOCK + HAPPY_DELTA` con su unidad, y `products.stock`
  igual en Postgres). Ningún flujo E2E existente suponía lotes en dos unidades de un producto.
- T12 (`ec317702`, backend_dev): `tests/integration/inventario/presentation-unit-race.int.test.ts`
  (nuevo) y su entrada `commit` en `tests/integration/aislamiento.json`. Cubre la cláusula de
  carrera de R20, que no tenía ningún test: dos `pg.Client` con `BEGIN`/`COMMIT` a mano y la espera
  comprobada en `pg_stat_activity`, con el mismo patrón que `pedidos/order-sequence-race.int.test.ts`.
  `pg` ya era dependencia.

### Salida de tests (acotada por archivo)

- typecheck y lint: exit 0 tras T15, T10, T11 y el test de R20.
- T15: `product-batches-sheet` 7/7; `product-page` 62/62; `product-route-contract` 23/23;
  `scope` 4/4.
- T10: `qc121-alcance` 29/29 (repetido por el implementer: 29/29). Rojo comprobado a mano: sin la
  llamada a `recalculateProductStock` en `addBatchToAlive` fallan 2 (`expected [ 'addBatchToAlive' ]
  to deeply equal []`); revertido, con `git diff` vacío.
- R20 en carrera: `presentation-unit-race.int` 2/2 (5 corridas del subagente y 1 del implementer);
  `guard-aislamiento-integracion` 6/6.

### E2E de T11: NO pasó; lo bloqueó el entorno

Comando (a mano, solo, chromium, 1 worker; log en `$TEMP/qc121-e2e-t11.log`):

```
pnpm exec playwright test e2e/inventario.spec.ts e2e/aislamiento-inventario.spec.ts e2e/ajuste-de-inventario.spec.ts --project=chromium --workers=1 -g "mismo nombre en dos unidades son dos filas|sesion en la empresa A|ajuste con motivo cambia la cantidad del lote"
```

Resultado: «Running 3 tests using 1 worker» y **no terminó ninguno**. Dos causas del entorno:

1. El `next dev` del worktree no compila: `Error: Module not found: Can't resolve '@google/genai'`
   (`lib/modules/documentos/adapters/driven/ai/ai-reader-genai.ts:1`, importado desde
   `lib/composition/index.ts` y `identity/adapters/driving/login-action.ts`). La dependencia está
   en `package.json` y `pnpm-lock.yaml` (entró con QC-108, `fdb33c54`), pero **no está instalada
   en el `node_modules` de este worktree** (`node_modules/@google` no existe). No es nueva ni de
   esta rama (`git diff origin/dev...HEAD -- package.json` vacío). Hace falta un
   `pnpm install --frozen-lockfile` en el worktree; no lo corrí sin orden.
2. Claude Code mató el proceso por falta de memoria del sistema (≈2,9 GB libres al arrancar). El
   `next dev` quedó huérfano en el puerto 3117 (PID 16652, de este worktree) y lo paré.

Mientras no corra, R26 y R34 tienen test escrito pero **no pasado**, y T11 queda sin `[x]`.

## Mapa R<n> -> test

Rutas relativas al worktree. `int/` = `tests/integration/inventario/`; `unit/` =
`tests/unit/inventario/`; `schema/` = `tests/unit/inventario/schema/`.

| R | Test(s) |
|---|---|
| R1 | `int/product-stock.int.test.ts` > «R1, R8, R9 — el alta fija la unidad del producto…»; `unit/product-batch-lot-retry.test.ts` > «createWithFirstBatch — unidad del producto y recalculo» > «lee la unidad de la presentacion con el ambito de empresa y la escribe en el producto» |
| R2 | `unit/product-input.test.ts` > «el alta NO acepta ninguna unidad: `unitId` es campo desconocido» (también afirma que `updateProductSchema` con `unitId` se rechaza); `unit/product-batch-lot-retry.test.ts` > «addBatchToAlive — no toca el producto salvo su stock recalculado»; `unit/qc121-alcance.test.ts` > «R2 — NewProduct no lleva unidad ni existencia» |
| R3 | `int/product-unit.int.test.ts` > «rechaza con 23514 product_batches_unit_differs_from_product…», «rechaza un lote sobre un producto sin unidad, llegue por la aplicacion o por SQL directo»; `unit/create-product.test.ts` > «QC-121 R3 — el rechazo de la base por unidad llega al llamante como invalid_input» |
| R4 | `unit/product-page.test.tsx` > «R18 — el nombre del producto se pinta junto a la unidad guardada», «R16 — …junto a la unidad del producto», «R17 — …existencia guardada»; `tests/unit/recetas-ui/recipe-line-unit-group.test.tsx` (`option.unitId` sale de `ProductView.unitId`); `unit/qc91-alcance.test.ts` > «R14: PRODUCT_SELECT trae products.stock y products.unit_id, sin catalogo de lotes» |
| R5 | `int/product-stock.int.test.ts` > «R5, R6, R7 — el alta busca por nombre Y unidad»; `unit/create-product.test.ts` > «R17, R18 — el nombre corresponde a un producto que ya existe» |
| R6 | `int/product-stock.int.test.ts` > «el mismo nombre en kg y en L crea DOS productos, cada uno con su propia existencia»; `unit/create-product.test.ts` > «QC-121 R6 — mismo nombre en otra unidad: nace otro producto, sin aviso» |
| R7 | `int/product-batch-write.int.test.ts` > «R20: con homonimos vivos se elige siempre el mismo producto» > «elige el de creacion mas antigua y desempata por identificador ascendente» (ya con unidad); `unit/create-product.test.ts` > «QC-121 R7 — con varios homonimos en la misma unidad, usa el que el puerto elige» |
| R8 | `int/product-stock.int.test.ts` > «tres lotes de 5 en la misma unidad dejan products.stock en 15», «un producto sin ningun lote tiene existencia 0»; `unit/product-stock.test.ts` > «singleUnitStock» > «R8: sin lotes devuelve 0», «R8: tres lotes de 5…dan 15» |
| R9 | `unit/product-batch-lot-retry.test.ts` > «recalcula stock DESPUES del asiento del lote…», «si el recalculo lanza, no queda ni el producto ni el lote (R9)», y en `addBatchToAlive` «si el recalculo lanza, el resultado se rechaza…(R9)»; `int/product-stock.int.test.ts` > «R1, R8, R9» |
| R10 | `int/product-stock.int.test.ts` > «R10» > «dos addBatchToAlive simultaneos sobre el mismo producto dejan stock = suma de los tres lotes» |
| R11 | `unit/product-batch-lot-retry.test.ts` > «no llama a presentation.findFirst ni a ninguna escritura del producto: solo el lote y el recalculo»; `unit/qc91-alcance.test.ts` > «R11: los tres escritores de producto no escriben products.stock» |
| R12 | `schema/product-unit-and-stored-stock-migration.test.ts` > «ninguna funcion de la migracion escribe products.stock»; `unit/qc121-alcance.test.ts` > «R12 — ninguna migracion mantiene products.stock con un disparador o columna generada» |
| R13 | `unit/product-stock.test.ts` > «R13: lotes en dos unidades lanza»; `unit/qc91-alcance.test.ts` > «R1: recalculateProductStock arma la existencia desde los lotes con singleUnitStock»; el aborto al lanzar lo cubren los casos «si el recalculo lanza» de R9 |
| R14 | `unit/product-catalog.test.ts` > «R14 — findRefs lee la existencia y la unidad de las columnas del producto» (un valor / vacío) |
| R15 | `unit/list-query.test.ts` > «el listado de productos vuelve a ordenar y filtrar por existencia (R15)»; `unit/product-list-params.test.ts` > «R15: se puede ordenar y filtrar por la existencia guardada», «R15: un extremo de existencia roto no se lleva el filtro entero»; `int/list-query-products.int.test.ts` > «el listado vuelve a ordenar y a filtrar por existencia guardada (R15)» |
| R16 | `unit/product-page.test.tsx` > «R16 — la celda muestra la existencia guardada junto a la unidad del producto», «R16 — un producto sin unidad muestra su existencia como 0» |
| R17 | `unit/product-page.test.tsx` > «R17 — la existencia se pinta en rojo…», «R17 — un producto sin lotes y con alerta…», «R17 — sin cantidad de alerta configurada…» |
| R18 | `unit/product-display-name.test.ts` (3 casos); `unit/product-page.test.tsx` > «R18 — el nombre del producto se pinta junto a la unidad guardada», «R18 — sin unidad guardada o sin catalogo de unidades, el nombre se pinta solo»; `tests/unit/recetas-ui/recipe-line-unit-group.test.tsx` (el selector se localiza por «nombre · unidad», y sin unidad solo por el nombre) |
| R19 | `tests/unit/recetas/recipe-service.test.ts` > «R12, R13, R14, R15 — existencia de la linea en su propia unidad» (0 / cantidad / `null`) |
| R20 | `int/product-unit.int.test.ts` > «rechaza con 23514 presentations_unit_locked_by_batches…»; `int/presentation-unit.int.test.ts` > «R20/R21» > «rechaza el cambio de unidad con PresentationUnitLockedError…», «el rechazo por unidad bloqueada es DISTINGUIBLE…»; `int/presentation-unit-race.int.test.ts` > «R20 (orden a…)», «R20 (orden b…)»; `unit/presentation-service.test.ts` > «traduce 'unit_locked' a PresentationUnitLockedError…» |
| R21 | `int/product-unit.int.test.ts` > «acepta el cambio de unidad de una presentacion sin lotes», «acepta actualizar una presentacion con lotes cuando la unidad no cambia»; `int/presentation-unit.int.test.ts` > los dos «acepta…» de «R20/R21» |
| R22 | `tests/unit/configuracion-ui/presentation-sheet.test.tsx` > «QC-121 — presentation_unit_locked» > «la edicion rechazada por unidad bloqueada (R20) se pinta junto al selector, sin cerrar ni perder lo escrito (R22)»; `unit/presentation-actions.test.ts` > «traduce PresentationUnitLockedError a su code estable…(R20, R22)» |
| R23 | `schema/product-unit-and-stored-stock-migration.test.ts` > «R23: el relleno», «down.sql — revierte exactamente lo que crea el up» |
| R24 | `unit/authorization.test.ts` > «un actor con solo inventario.consultar es rechazado en los siete casos de escritura», «un actor con solo inventario.modificar es rechazado en los cinco casos de lectura»; `unit/create-product.test.ts` > «R23 — el permiso se comprueba antes que nada»; `unit/presentation-service.test.ts` > «traduce 'unit_locked'…sin exigir mas permiso que inventario.modificar» |
| R25 | `unit/qc121-alcance.test.ts` > «R25 — sin borrado fisico de productos ni de lotes», «R25 — los identificadores nuevos de la migracion son ingles ASCII»; `schema/inventario-schema.test.ts` |
| R26 | `e2e/inventario.spec.ts` > «el mismo nombre en dos unidades son dos filas, cada una con su propia existencia (R26)»: **escrito, no ejecutado** (ver el E2E arriba). Respaldo en integración: `int/product-stock.int.test.ts` > «el mismo nombre en kg y en L crea DOS productos…» |
| R27 | `./init.sh` completo (T13, del leader) |
| R28 | `tests/guards/guard-dependencias-aprobadas.test.ts`; `git diff origin/dev...HEAD -- package.json pnpm-lock.yaml` vacío (medido el 2026-09-19) |
| R29 | `int/product-stock.int.test.ts` > «tres lotes de 5 y un ajuste +6 y -9 dejan stock en 12…»; `unit/adjust-batch-stock-prisma.test.ts` > «si el recalculo lanza, el ajuste se rechaza en vez de darse por bueno (R29)»; `unit/qc121-alcance.test.ts` > «R29 — toda escritura exportada de product_batches recalcula products.stock»; `int/ledger-cuadre.int.test.ts` (verde en `--rapido`) |
| R30 | `int/product-stock.int.test.ts` > «R30» > «un ajuste que dejaria el lote en negativo…stock no cambia», «un lote de otra empresa devuelve null y no cambia el stock de ninguno de los dos productos» |
| R31 | `int/product-stock.int.test.ts` > «R31» > «dos ajustes simultaneos sobre dos lotes del mismo producto…», «un ajuste y una alta de lote simultaneos…» |
| R32 | `int/product-stock.int.test.ts` > «…name/qty_alert/unit_id/updated_at intactos»; `unit/adjust-batch-stock-prisma.test.ts` > «recalcula DESPUES del asiento, y la unica columna que escribe en products es stock (R32)» |
| R33 | `schema/product-unit-and-stored-stock-migration.test.ts` > «R33: el libro de movimientos queda intacto» |
| R34 | `e2e/ajuste-de-inventario.spec.ts` > «un ajuste con motivo cambia la cantidad del lote y queda su asiento junto al de alta, en Postgres» (aserción de la celda `product-stock` y de `products.stock`): **escrito, no ejecutado** |

T15 no tiene `R<n>` propio: la decisión del humano («¿El panel de lotes se titula «nombre ·
unidad»? Sí») no se tradujo a requisito. Su test: `unit/product-batches-sheet.test.tsx` > «el
panel se titula «nombre · unidad» (T15)».

`package.json` no se tocó en toda la rama (R28).
