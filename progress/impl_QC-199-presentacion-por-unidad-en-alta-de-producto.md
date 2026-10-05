# QC-199 — presentacion-por-unidad-en-alta-de-producto · bitácora de implementación

## T0 — lotes con unidad de presentación distinta de la del producto

- Fecha: 2026-10-05.
- Base: `QuimiCloude` (la de `.env` del worktree; 55 filas en `product_batches`).
- Consulta: la de `design.md > 9`, literal.
- Resultado: **0 filas**. Se sigue con T6 y T7.
- Nota: esa base va 1 migración atrás (`20261004150000_execution_permission`, ajena a esta ficha);
  no afecta a la consulta (no toca `products`, `product_batches` ni `presentations`).

## Contrato

Commit `b24050e4` "feat(QC-199): contrato de servicios para el alta por unidad".

| Pieza | archivo:línea |
|---|---|
| Esquema de unidad (`'Elige una unidad.'`) | `lib/modules/inventario/domain/product-input.ts:94` |
| Rama PRODUCT (`unitId` obligatorio, `presentationId` = clave desconocida) | `product-input.ts:197` |
| Rama PACKAGING con su `presentationId` | `product-input.ts:234` |
| `createProductSchema` / `CreateProductInput` | `product-input.ts:293` / `:296` |
| `CreateProductFormState` (sin cambios) | `lib/modules/inventario/adapters/driving/product-actions.ts:18` |
| `createProductAction(prevState, formData)` (firma sin cambios; PRODUCT lee `unitId`) | `product-actions.ts:179` (lectura `:149`/`:151`) |
| `UnitCatalog.listVisibleRefs(companyId): Promise<readonly UnitRef[]>` | `lib/modules/unidades/domain/unit-catalog.ts:53` |
| Adaptador `listVisibleUnitRefs` (implementado) | `lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma.ts:63` |
| `ListProductFormUnitsDeps` / `ListProductFormUnits` / `createListProductFormUnits` | `lib/modules/inventario/domain/list-product-form-units.ts:8` / `:12` / `:18` |
| `listProductFormUnitsAction(): Promise<ProductFormUnitsResult>` | `product-actions.ts:278` |
| `ProductFormUnitsResult = { status:'success'; data: ProductFormUnits } \| ErrorState` | `product-actions.ts:40` |
| Prop `formUnits`: `ProductFormUnits = readonly UnitRef[]` | `list-product-form-units.ts:6`, reexport `lib/modules/inventario/index.ts:89` |
| Cableado | `lib/composition/index.ts:900`, `:946` |

Imports para la UI: `import type { ProductFormUnits } from '@/lib/modules/inventario'`;
`import { listProductFormUnitsAction } from '@/lib/modules/inventario/adapters/driving/product-actions'`.

Estado transitorio tras el contrato: `create-product.ts:112` lanza `Error` de cableado en el alta de
insumo hasta T8. 25 dobles de `UnitCatalog` en tests ganaron `listVisibleRefs` (sin cambiar aserciones).
Rojos previstos hasta T4/T8/T9/T10: product-input (9), product-actions (5), create-product (33),
authorization (5), company-isolation-service (6), product-service (2), product-page (17),
envase-en-inventario (1); integración product-batch-lot (2), review-blocked-orders (3).
Rojos que ya estaban en HEAD antes del contrato: configuracion-ui/unidades-viewport (2),
configuracion-ui/usuarios-viewport (2), navegacion/pantallas-exigen-permiso (1),
recetas-ui/recipe-page (1), recetas/module-contract (1).

## Commits por tarea

| Tarea | Commit |
|---|---|
| T0 | `55dcfc83` |
| Contrato | `b24050e4` |
| T1 migración | `8be24d8d` (db:migrate / db:rollback / re-migrate; `prisma migrate status` limpio) |
| T2 | `09811975` |
| T3 | `b9b0db04` |
| T5 | `6de5016b` (separado a mano del árbol final; por sí solo no compila) |
| T6 | `a39d27b4` |
| T8 | `4e8ea3f3` |
| T4 | `b5cf6a96` |
| T9 | `3390ba23` |
| T7 | `b064346b` |
| T14 | `baab7e4f` |
| avisos de lint en tests | `07a4cbb4` |
| alta en guardias (`aislamiento.json`, `guard-identificador-de-request`) | `066fa7cd` |
| T10 | `18024566` |
| T10, mock en `pantallas-exigen-permiso` | `dd2a22c5` |

## Archivos

Creados:
- `db/migrations/20261004170000_product_batches_require_product_unit/{migration.sql,down.sql}`
- `lib/modules/inventario/domain/list-product-form-units.ts`
- `tests/unit/inventario/schema/product-batches-require-product-unit-migration.test.ts`
- `tests/integration/inventario/product-batch-require-unit.int.test.ts`
- `tests/integration/inventario/product-unit-without-presentation.int.test.ts`
- `tests/unit/inventario/list-product-form-units.test.ts`
- `tests/integration/unidades/unit-catalog-visible.int.test.ts`
- `tests/unit/inventario-ui/product-form-unidad.test.tsx`

Modificados, código:
- `lib/modules/inventario/{ports/product-repository.ts, domain/product-view.ts, domain/product-batch-view.ts, domain/create-product.ts, domain/product-input.ts, index.ts}`
- `lib/modules/inventario/adapters/driven/persistence/{product-prisma.ts, product-catalog-prisma.ts}`
- `lib/modules/inventario/adapters/driving/product-actions.ts`
- `lib/modules/unidades/domain/unit-catalog.ts`, `lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma.ts`
- `lib/composition/index.ts`
- `app/(private)/inventario/page.tsx`, `components/{product-form.tsx, product-sheet.tsx, product-name-picker.tsx, product-list-section.tsx}`
  (`product-list-section.tsx`: el estado vacío monta su propio `ProductSheet` de alta y necesita `formUnits`)
- `components/shared/presentation-unit-select.tsx` (prop opcional `helper`, para el texto de ayuda de §6)

Modificados, tests: `tests/unit/inventario/{product-input, create-product, authorization,
company-isolation-service, product-service, product-actions, product-catalog-costing, list-use-cases,
product-page}`, `tests/unit/inventario-ui/envase-en-inventario`, `tests/unit/asignaciones/empacador-authorization`,
`tests/unit/navegacion/pantallas-exigen-permiso`, `tests/integration/inventario/{product-batch-lot, order-batches,
qc195-packaging-product}`, `tests/integration/pedidos/{review-blocked-orders, order-ingredients-cost, order-cost-quote}`,
los 25 dobles de `UnitCatalog` del contrato, `tests/integration/aislamiento.json`, `tests/guards/guard-identificador-de-request.test.ts`.

## Mapa R -> test

| R | Test (archivo › caso) |
|---|---|
| R1 | `tests/unit/inventario-ui/product-form-unidad.test.tsx` › «R1 el alta de insumo muestra Unidad y no Presentacion»; T11 |
| R2 | ídem › «R2 el selector ofrece todas las unidades recibidas incluida unidad (u) y no ofrece sin unidad»; T11 |
| R3 | ídem › «R3 envase muestra Presentacion y no Unidad; instrumento ninguna de las dos» |
| R4 | ídem › «R4 sin unidad muestra Elige una unidad., no llama a la accion y conserva lo escrito» |
| R5 | ídem › «R5 elegir un insumo existente preselecciona su unidad y se puede cambiar» |
| R6 | `tests/unit/inventario/product-input.test.ts` › «R6 el alta de insumo exige unitId», «R6 el alta de insumo con presentationId es invalid_input», «R6 unitId con forma invalida da Elige una unidad.»; `tests/unit/inventario/product-actions.test.ts` › «R6 el alta de insumo envia unitId y no presentationId» |
| R7 | `tests/unit/inventario/create-product.test.ts` › «R7 una unidad inexistente o de otra empresa es invalid_input y no escribe» |
| R8 | `create-product.test.ts` y `tests/unit/inventario/authorization.test.ts` › «R8 sin inventario.modificar se rechaza antes de zod y sin consultar unidades ni productos» |
| R9 | `tests/integration/inventario/product-unit-without-presentation.int.test.ts` › «R9 createWithFirstBatch con unitId crea producto con esa unidad y lote sin presentacion con su asiento»; `create-product.test.ts` › «R9 sin homonimo crea el producto con la unidad y el lote sin presentacion»; T11 |
| R10 | `product-unit-without-presentation.int.test.ts` › «R10 findAliveIdByNameInUnit encuentra el homonimo de la misma unidad y no el de otra»; `create-product.test.ts` › «R10 con homonimo de la misma unidad agrega el lote sin presentacion», «R10 con homonimo de otra unidad crea otro producto»; T11 |
| R11 | `product-input.test.ts` › «R11 el alta de envase sigue exigiendo presentationId», «R11 el alta de instrumento no cambia»; `create-product.test.ts` › «R11 envase e instrumento siguen por su camino»; `product-actions.test.ts` › «R11 el alta de envase sigue enviando presentationId» |
| R12 | `tests/unit/inventario/schema/product-batches-require-product-unit-migration.test.ts` › «R12 la rama sin presentacion rechaza el insumo sin unidad con 23514 y product_batches_product_without_unit»; `tests/integration/inventario/product-batch-require-unit.int.test.ts` › «R12 un lote sin presentacion de un insumo sin unidad se rechaza»; `product-unit-without-presentation.int.test.ts` › «R12 el rechazo product_batches_product_without_unit se traduce a ValidationError» |
| R13 | test estático › «R13 la rama con presentacion conserva el cuerpo vigente»; `product-batch-require-unit.int.test.ts` › «R13 un lote sin presentacion de un instrumento sin unidad entra», «R13 un lote sin presentacion de un envase entra», «R13 un lote con presentacion de otra unidad sigue rechazandose», «R13 un lote con presentacion cuyo producto no tiene unidad sigue rechazandose» |
| R14 | test estático › «R14 down.sql restituye la funcion anterior identica»; `product-batch-require-unit.int.test.ts` › «R14 tras aplicar down.sql, el lote sin presentacion de un insumo sin unidad vuelve a entrar»; rollback manual de T1 |
| R15 | test estático › «R15 la migracion no escribe datos ni toca presentations» |
| R16 | `product-unit-without-presentation.int.test.ts` › «R16 un lote de insumo sin presentacion muestra la unidad del producto», «R16 un lote antiguo con presentacion muestra la unidad del producto», «R16 apartado y disponible del lote salen junto a la unidad del producto»; T11 |
| R17 | `tests/unit/inventario/product-catalog-costing.test.ts` › «R17 toCostingBatch toma la unidad del producto»; `tests/integration/pedidos/order-cost-quote.int.test.ts` › «R17 un insumo con lotes solo sin presentacion tiene coste en la cotizacion»; `tests/integration/pedidos/order-ingredients-cost.int.test.ts` › «R17 el importe guardado del pedido cuenta el lote sin presentacion», «R17 el coste del lote de producto terminado no cuenta ese ingrediente como cero» |
| R18 | `tests/integration/inventario/order-batches.int.test.ts` › «R18 lote de envase y de producto terminado conservan su unidad»; `order-ingredients-cost.int.test.ts` › «R18 los lotes sin costo y los de instrumento siguen fuera», «R18 los lotes de envase siguen fuera de findCostingBatches y los de terminado dentro» |
| R19 | `e2e/insumo-por-unidad.spec.ts` › «R19 el Administrador da de alta un insumo eligiendo kg, lo ve en el listado y en el panel de lotes en kg, y un segundo alta del mismo nombre en kg suma a ese producto» (verde en chromium y webkit) |
| R20 | `tests/unit/inventario/list-product-form-units.test.ts` › «R20 con inventario.modificar y sin unidades.consultar devuelve las unidades visibles», «R20 sin inventario.modificar rechaza con error de permiso y no consulta unidades»; `tests/integration/unidades/unit-catalog-visible.int.test.ts` › «R20 listVisibleRefs devuelve las unidades de la empresa y las de sistema, incluida unidad, y ninguna de otra empresa»; `tests/unit/inventario/product-page.test.tsx` › «R20 la pagina pasa al formulario las unidades de la accion de inventario y no las de listUnitsAction» |

## Salida de tests

Subagentes (cada uno, sus archivos):
- typecheck: 0 errores. lint: 0 errores (8 avisos previos, ninguno de esta ficha).
- Integración (15 archivos, backend): Test Files 15 passed (15); Tests 167 passed (167).
- `product-form-unidad.test.tsx`: 5 passed (5). `envase-en-inventario.test.tsx`: 13 passed (13).
- `pantallas-exigen-permiso.test.tsx`: 1 failed | 41 passed (42). El rojo es `'/pedidos'`, de baseline.

`./init.sh --rapido` tras T1-T10 y T14 (implementer, 2026-10-05):
```
Test Files  6 failed | 412 passed (418)
     Tests  8 failed | 6269 passed | 7 skipped (6284)
```
Los 8 rojos están todos en archivos de `tests/baseline-rojos.json` (deuda ajena de dev; `--rapido` no consulta esa lista):
unidades-viewport (2), usuarios-viewport (2), pantallas-exigen-permiso › '/pedidos' (1),
product-page › «R18 — el nombre del producto se pinta junto a la unidad guardada» (1, roto desde a543c84d),
recipe-page (1), recetas/module-contract (1). Ninguno es de esta ficha.

## T11, T12 — E2E (escritos, sin ejecutar)

- `650cf95f` T11: `e2e/insumo-por-unidad.spec.ts` (empresa propia `qc199_e2e_`, comprobación en Postgres con `prisma.$queryRaw`).
- `754e992c` T12: `e2e/inventario.spec.ts`, 6 recorridos de alta de insumo pasan a elegir unidad (helper `elegirUnidad`);
  se quitan `crearPresentacionEnLinea` / `elegirPresentacionExistente`. Dos casos cambian de nombre: el que cubría
  QC-22 R24 (crear presentación en línea sin perder lo escrito) ahora comprueba que elegir unidad no pierde lo escrito,
  porque el insumo ya no tiene presentación; el de «alta con presentacion y solo costo total» pasa a «alta con solo costo total».
- `17d01ea2`: `e2e/pedido-bloqueado.spec.ts` › `addBatchThroughInventory` ya no elige presentación; comprueba que la unidad del
  insumo viene preseleccionada. Barrido del resto de `e2e/`: ningún otro recorrido da de alta un insumo por el formulario.
- Validado: typecheck, lint y `playwright test --list` (16 tests en los dos specs; 2 en pedido-bloqueado).
- Ejecución: ver la subsección siguiente. Comando:
  `pnpm run e2e e2e/insumo-por-unidad.spec.ts e2e/inventario.spec.ts e2e/pedido-bloqueado.spec.ts`
  (base migrada y sembrada).

### Ejecución (2026-10-05)

Arreglos solo en los tests, con el componente sin tocar:
- `2be0ca6f`: la unidad elegida se lee en `[data-slot="select-value"]`, porque el texto del disparador incluye el glifo «▼».
- `19e81a1d`: R19 recarga el listado antes de reabrir el panel de lotes. `product-batches-sheet.tsx`, igual que en `dev`,
  pide los lotes solo en la primera apertura, y el `router.refresh()` del alta conserva ese estado.
- `595387de`: QC-90 R32 compara `Number(stock)`, porque `$queryRaw` devuelve el decimal como texto.
- `13b04679`: R19 espera sin navegar a que el listado refleje el alta antes del `goto` siguiente. Si no, WebKit aborta
  la navegación con el refresco todavía en vuelo; es el mismo patrón que `pedido-bloqueado.spec.ts`.

`pnpm run e2e e2e/insumo-por-unidad.spec.ts e2e/inventario.spec.ts e2e/pedido-bloqueado.spec.ts --project=<b>`:

| Navegador | Pasados | Fallados |
|---|---|---|
| chromium | 8 | 1: `inventario.spec.ts:783` R26 |
| webkit | 8 | 1: `inventario.spec.ts:783` R26 |

R26 busca la celda «<nombre> · kg», que el listado no pinta desde `a543c84d`. Es la misma deuda que `product-page.test.tsx`
R18 del baseline y queda pendiente de decisión humana. T11 queda marcada; T12 sigue sin marcar solo por R26.
Logs: `progress/e2e_QC-199_chromium.log`, `progress/e2e_QC-199_webkit.log`.

## T13 — gate completo

Primera corrida: 5 archivos rojos fuera del baseline, todos guardias de alcance que congelaban piezas que el spec cambia
(lista cerrada de E2E en `guard-identificador-de-request` y `data-table-alcance`, factorías del barrel en
`inventario-schema`, `NewProduct` sin `unitId` en `qc121-alcance` y `unidades/module-contract`). Ajustadas en `2a819eb2`
sin aflojarlas: siguen siendo listas cerradas, y la unidad sigue comprobándose como id (`unitId?: string`, uuid en el
esquema, una sola lectura de `'unitId'` en la acción) y nunca como texto.

Segunda corrida de `./init.sh` (2026-10-05):
```
 Test Files  8 failed | 874 passed (882)
      Tests  10 failed | 12436 passed | 128 skipped (12574)
✓ los tres proyectos corrieron (ui, node, integration)
✓ tests: sin rojos nuevos (8 rojos, todos en el baseline de 8)
✓ todas las migraciones tienen down.sql
== init OK ==
```

## Review, vuelta 1 (progress/review_QC-199-presentacion-por-unidad-en-alta-de-producto.md)

- B1, m2, m4: se arreglan (hashes abajo).
- m1 (la ayuda de «Unidad» solo se ve por hover o foco, sin soporte táctil verificado): **aceptado sin cambio** por el leader. Es el mismo patrón que `product-field.tsx` y `presentation-select.tsx`; si la ayuda tiene que llegar en táctil, es una ficha para todos los helpers.
- m3 (bloque etiqueta + botón + tooltip duplicado entre `presentation-unit-select.tsx`, `presentation-select.tsx` y `product-field.tsx`): **aceptado sin cambio** por el leader. Extraerlo queda fuera del alcance de esta ficha.

Commits: B1 `c02b74ea` (también quita un «(R5)» de la misma línea tocada), m2 `e4fafbb2` (`tests/unit/configuracion-ui/presentation-unit-select.test.tsx`, 3 casos), m4 `99fe9be7` (`product-page.test.tsx` › «R20 el alta del estado vacio ofrece las unidades del formulario y no las de listUnitsAction»; comprobado que falla si se quita `formUnits`).

`./init.sh --rapido` tras la vuelta 1:
```
 Test Files  6 failed | 416 passed (422)
      Tests  8 failed | 6358 passed | 9 skipped (6375)
```
Los 8 rojos son los mismos casos de `tests/baseline-rojos.json` que en la tanda anterior; ninguno nuevo.
