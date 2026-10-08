# QC-177 — bitacora de implementacion

Rama `feature/QC-177-rojos-heredados-de-tabla-y-filtro-de-usuarios`. Spec aprobado 2026-10-08 (D4-D7).

## Tandas

| Tanda | Tasks | Agente | Commit |
|---|---|---|---|
| 1 | T1, T2, T4 | frontend_dev | `b2253536` |
| 1 | T5 | backend_dev | `b2253536` |
| 1 | T6 (enmiendas de specs) | implementer | `b2253536` |
| 2 | T3 (E2E) | frontend_dev | commit de la tanda 2 |
| 2 | T7 (baseline, bitacora) | implementer | commit de la tanda 2 |

## Archivos

**Produccion**
- `app/(private)/inventario/components/product-columns.tsx`: la celda `name` pasa a
  `productDisplayName(product.name, productUnitLabel(product, units))`. `width` y `hideText` se
  quedan. La regla coincide byte a byte con `nameCell` de `a543c84d^`: sin catalogo da `null`
  (nombre solo); con unidad fuera del catalogo da «nombre · —», igual que antes.
- `app/(private)/produccion/formulas/components/recipe-columns.tsx`: se quita
  `defaultPinned: 'right'` de `actions`; `pinnable: false` se queda.
- `lib/modules/identity/domain/people-directory.ts`: exporta
  `ACTIVE_ACCOUNTS_ONLY: PeopleRefFilters = { accountStatus: ['active'] }`.
- `lib/modules/identity/index.ts`: reexporta `ACTIVE_ACCOUNTS_ONLY`.
- `lib/modules/asignaciones/domain/list-responsible-candidates.ts`: pasa `ACTIVE_ACCOUNTS_ONLY`
  como 4.º argumento y el comentario ya no nombra el estado de cuenta. `grep -ciE "account[_ ]?status"` da 0.

**Tests**
- `tests/unit/configuracion-ui/usuarios-viewport.test.tsx`, solo el caso R21 en los dos viewports:
  - se quita «sin `overflow-hidden`»;
  - se añaden dos comprobaciones: el texto de la celda es igual a `usuario.email` y la celda lleva
    `text-ellipsis`;
  - se mantienen: dentro del contenedor, visible, sin `hidden` y sin scroll en `html`/`body`.
- `tests/unit/configuracion-ui/unidades-viewport.test.tsx`, solo el caso R27, con el mismo cambio.
  El texto completo de la celda se compara con `1 kg = 1000 gr` y `1 <UNIDAD_LARGA.name> = 1000000 gr`.
- `tests/baseline-rojos.json`: se borran las 5 entradas de QC-177 (`product-page`, `recipe-page`,
  `unidades-viewport`, `usuarios-viewport` y `account-status-scope`). No se añade ninguna; el diff
  solo borra lineas.
- No cambian `tests/unit/asignaciones/list-responsible-candidates.test.ts` (sigue afirmando
  `{ accountStatus: ['active'] }` en el puerto), `account-status-scope.test.ts`,
  `product-page.test.tsx`, `recipe-page.test.tsx`, `data-table-scroll.test.tsx` y `components/shared/`.

**E2E (T3)**
- Nuevo `e2e/helpers/product-name-cell.ts`: `exactProductNameCellText` compartido (nombre exacto con
  sufijo «· unidad» opcional). Su comentario cita `product-columns.tsx > nameCell`, que ya no existe,
  y conviene limpiarlo.
- `e2e/producto-terminado.spec.ts`: importa el helper y se quita su copia local.
- `e2e/inventario.spec.ts`: `findProductCell({ exact })` y el conteo de homonimos usan el helper.
  `existenciasDeHomonimos` pasa a `filasDeHomonimos`. R26 exige `productDisplayName(X, kg)` y
  `productDisplayName(X, L)`, cada uno con su existencia, tras el alta y tras el segundo lote.
- `e2e/insumo-por-unidad.spec.ts`: `filaDelProducto` pasa de buscar una subcadena a exigir el nombre
  exacto con sufijo opcional.
- `e2e/inventario-importar.spec.ts`: `inventoryRow` usa el helper y se quita `exactNameCellText`.

**Specs (T6, enmiendas fechadas 2026-10-08)**
- `specs/QC-67-pantalla-de-usuarios/design.md` §7: celda de correo (D4).
- `specs/QC-39-pantalla-de-unidades/design.md` §9: celda de equivalencia (D4).
- `specs/QC-55-tabla-de-datos-compartida/design.md` §3.2: `width`, `hideText` y `defaultPinned` (D4).
- `specs/QC-145-pedidos-terminados-en-asignacion/design.md` §3.6: el paso 3 lo añadió `0dbcd68f`; se
  usa `ACTIVE_ACCOUNTS_ONLY` (D7).

Sin `package.json` ni lockfile en el diff (R17).

### Barrido de `data-table-cell-name` en `e2e/`
| Hit | Pantalla | Cambio |
|---|---|---|
| inventario.spec.ts:275, :325, :898 (ahora ~276, ~334, ~913) | /inventario | Si |
| insumo-por-unidad.spec.ts:91 | /inventario | Si |
| inventario-importar.spec.ts:487, :491 (`inventoryRow`) | /inventario | Si (helper compartido) |
| aislamiento-inventario.spec.ts:67/311 | /inventario | No: ya espera `productDisplayName` |
| producto-terminado.spec.ts:137/331 | /inventario | Solo importa el helper |
| aislamiento-recetas, recetas, recetas-pasos | /recetas | No |
| grupos-de-trabajo, presentaciones, unidades | otras | No |
| proveedores:440 | catalogo de proveedor | No |

Los demas specs que visitan /inventario (pedido-bloqueado, reserva-de-material,
ajuste-de-inventario...) localizan por `product-stock` o `data-table-row-`, no por el nombre exacto.

## Mapa R -> test

| R | Test |
|---|---|
| R1, R2 | `tests/unit/shared/data-table-scroll.test.tsx` › «ausente o true = truncado con ellipsis» (sin cambio) |
| R3 | `tests/unit/shared/data-table-scroll.test.tsx` › «false = el texto salta de linea…» (sin cambio) |
| R4 | `tests/unit/configuracion-ui/usuarios-viewport.test.tsx` › «la columna de correo va DENTRO del desplazador… (R21)» ×2 viewports (adaptado) y «el desbordamiento se resuelve DENTRO de la tabla… (R21)» |
| R5 | `tests/unit/configuracion-ui/unidades-viewport.test.tsx` › «la columna de equivalencia va DENTRO del desplazador… (R27)» ×2 viewports (adaptado) y «el desbordamiento se resuelve DENTRO de la tabla… (R27)» |
| R6 | `tests/unit/inventario/product-page.test.tsx` › «R18 — el nombre del producto se pinta junto a la unidad guardada» |
| R7 | `tests/unit/inventario/product-page.test.tsx` › «R18 — sin unidad guardada o sin catalogo…»; `tests/unit/inventario/product-display-name.test.ts` |
| R8 | `e2e/inventario.spec.ts` › «el mismo nombre en dos unidades son dos filas… (R26)» (pendiente de correr en verde, ver abajo) |
| R9, R10 | `tests/unit/recetas-ui/recipe-page.test.tsx` › «R21: las acciones van en una columna que no se puede fijar…» |
| R11 | `tests/unit/asignaciones/list-responsible-candidates.test.ts` |
| R12, R13 | `tests/unit/identity/account-status-scope.test.ts` › «R19 — … EXACTAMENTE los de la lista cerrada» y las anclas positivas (lista sin cambios) |
| R14 | `gate-completo` en CI sin las 5 entradas en `tests/baseline-rojos.json` (pendiente del PR) |
| R15 | diff: solo cambian los casos R21/R27 de los dos viewports |
| R16 | las cuatro enmiendas fechadas de arriba |
| R17 | `tests/guards/guard-identificador-de-request.test.ts`; diff sin `package.json` |

## Salida real

**Los cinco archivos del alcance y sus vecinos** (implementer, tras borrar las entradas del baseline):
```
pnpm exec vitest run tests/unit/inventario/product-page.test.tsx tests/unit/recetas-ui/recipe-page.test.tsx \
  tests/unit/configuracion-ui/unidades-viewport.test.tsx tests/unit/configuracion-ui/usuarios-viewport.test.tsx \
  tests/unit/identity/account-status-scope.test.ts tests/unit/asignaciones/list-responsible-candidates.test.ts \
  tests/unit/shared/data-table-scroll.test.tsx tests/unit/inventario/product-display-name.test.ts
 Test Files  8 passed (8)
      Tests  209 passed | 3 skipped (212)
```

**Guardias** (`pnpm exec vitest run guard`):
```
 Test Files  53 passed (53)
      Tests  717 passed | 11 skipped (728)
```

**`vitest related --run`**
- frontend_dev, sobre los 2 archivos de produccion y los 2 viewports:
  `Test Files 1 failed | 36 passed (37)`. El rojo es `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`,
  que esta en el baseline (QC-180) y falla igual aislado.
- backend_dev, sobre los 3 archivos de `identity`/`asignaciones` (el barrel arrastra casi toda la suite):
  `Test Files 3 failed | 581 passed (584)`, `Tests 3 failed | 8794 passed | 13 skipped (8810)`. Los 3 rojos
  estan en el baseline: `catalog-line.int` (D33), `pantallas-exigen-permiso` y `recetas/module-contract` (QC-180).

**Typecheck y lint** (estado final):
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm run typecheck`: exit 0.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)`. Los avisos son previos y estan en
  `confirm-catalog-import.test.ts` y `order-service.test.ts`, que este cambio no toca.

**`./init.sh` (rapido)**: exit 1 por el validador de features:
`faltan specs para features sdd en vuelo: QC-156 QC-167`, dos features de otra persona ajenas a QC-177.
Corta antes del resto; el typecheck, el lint, las guardias y los related se corrieron a mano (arriba).

**E2E (T3)**
```
pnpm exec playwright test e2e/inventario.spec.ts e2e/insumo-por-unidad.spec.ts \
  e2e/inventario-importar.spec.ts e2e/aislamiento-inventario.spec.ts
  18 failed
  4 passed (4.3m)
```
La causa es de infraestructura y no del cambio. A la base local (localhost:5433/QuimiCloude) le faltan tres migraciones
que ya estan en `dev`:
- `20261006120000_inventory_imports`
- `20261006140000_inventory_movements_adjustment_count`
- `20261006234105_conditioning_role`

Por eso toda alta falla con «The column `inventory_movements.stock_before` does not exist in the
current database.». Los 9 casos que fallan en cada navegador crean producto antes de llegar a las
aserciones nuevas. Pasan, en chromium y webkit, R27 de aislamiento y el 404 de R4.

Bloqueo: el implementer intento `pnpm exec prisma migrate deploy` y el permiso lo denego, porque
la base es un recurso compartido. Falta que el humano o el leader apliquen las migraciones y
vuelvan a correr los cuatro specs. Hasta entonces R8 no tiene evidencia verde.
