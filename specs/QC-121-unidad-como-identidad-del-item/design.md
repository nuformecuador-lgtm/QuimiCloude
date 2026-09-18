# QC-121 — unidad-como-identidad-del-item · design.md

> Escrito contra `feature/QC-121-unidad-como-identidad-del-item` (worktree
> `.worktrees/QC-121-unidad-como-identidad-del-item`), que ya contiene QC-91 mergeada. Rutas y
> números de línea **medidos en ese árbol**, no de memoria. Lo que no se pudo medir desde aquí
> (sin shell: el historial de git y la base local) está marcado como tal.
>
> **Enmienda del 2026-09-18.** La rama se sincronizó con `origin/dev` en `3d66790e`, que trae
> **QC-92 (ajuste de inventario) mergeada** (PR #91), y también QC-108 y QC-68. Los números de
> línea de este documento se **volvieron a medir** sobre ese árbol donde QC-92 los movió; lo que
> QC-92 añade está en §1.4 y lo que cambia del plan, en §15. Sin shell ni búsqueda por contenido
> en esta sesión (`rg` no está instalado): los archivos se leyeron uno a uno por ruta; lo que no se
> pudo localizar así queda marcado «a medir».

## 1. Censo: dónde vive hoy la unidad y la existencia del producto

La ficha cambia **dos contratos de lectura** (la unidad pasa de derivada a guardada; la existencia
pasa de calculada a guardada) y **una regla de escritura** (el alta busca por nombre y unidad).
Importa separar lo que cambia de lo que se queda intacto.

### 1.1 `lib/`

| # | Archivo:línea | Qué es hoy | Destino |
|---|---|---|---|
| 1 | `lib/modules/inventario/domain/product-view.ts:23-26` (`NewProduct`) | `{ name, qtyAlert }`, sin unidad ni existencia | **INTACTO**: la unidad no viaja en la entrada; la pone el adaptador desde la presentación (§4) |
| 2 | `lib/modules/inventario/domain/product-view.ts:48-49` (`ProductView.stockByUnit`), `:51-65` (`latestBatchUnitId`) | existencia por unidad calculada y unidad del lote más reciente | **CAMBIA**: gana `stock: number` y `unitId: UnitId \| null`; pierde `stockByUnit` y `latestBatchUnitId` en la retirada (§3.1) |
| 3 | `lib/modules/inventario/domain/product-stock.ts:3-21` (`ProductStockByUnit`, `sumStockByUnit`) | agregación por unidad | **SE QUEDA** (D9) y gana `singleUnitStock` (§5) |
| 4 | `lib/modules/inventario/domain/product-catalog.ts:21-26` (`ProductRef.stockByUnit`) | contrato hacia `recetas` | **FORMA INTACTA**, cambia el origen: un solo valor, leído de columnas (§3.2) |
| 5 | `lib/modules/inventario/domain/product-queryable.ts:17-18`, `:23-30` | lista blanca sin `stock` | **CAMBIA**: `stock` vuelve a `sortable` y a `filterable: numberRange` (D5) |
| 6 | `lib/modules/inventario/domain/create-product.ts:107-130` | busca por nombre (`findAliveIdByName`) | **CAMBIA**: busca por nombre y unidad de la presentación (§4) |
| 7 | `lib/modules/inventario/domain/update-presentation.ts:28-30`, `:50-63` | reemplaza la unidad sin condición (QC-80 R12) | **CAMBIA**: traduce el nuevo `'unit_locked'` a error propio (§6) |
| 8 | `lib/modules/inventario/domain/errors.ts` | 7 clases | **CAMBIA**: gana `PresentationUnitLockedError` (§8) |
| 9 | `lib/modules/inventario/domain/product-input.ts:29` | comentario sobre `latestBatchUnitId` | **CAMBIA**: sólo el comentario (se limpia, sin citar fichas) |
| 10 | `lib/modules/inventario/index.ts:50-51` | reexporta `ProductView`, `ProductStockByUnit`, `sumStockByUnit` | **CAMBIA**: añade `singleUnitStock`, `productDisplayName`, `PresentationUnitLockedError` |
| 11 | `lib/modules/inventario/ports/product-repository.ts:76` (`findAliveIdByName`), `:84-85` (comentario «el producto no tiene columna propia»), `:91-96`, `:116-121`; `:123-141` (`adjustBatchStock`, QC-92) | puerto del alta y del ajuste | **CAMBIA**: `findAliveIdByName` se sustituye por `findAliveIdByNameInPresentationUnit` (§4); el comentario de `:84-85` deja de ser cierto y se reescribe; el de `adjustBatchStock` gana el recálculo (§5.1). Ninguna otra firma cambia |
| 12 | `lib/modules/inventario/ports/presentation-repository.ts:77-81` (`replace`) | unión `'ok' \| 'not_found' \| 'duplicate' \| 'invalid_unit'` | **CAMBIA**: gana `'unit_locked'` |
| 13 | `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:37-41` (`BATCH_STOCK_BY_UNIT`), `:43-51` (`PRODUCT_SELECT`), `:55-68` (`toProductView`) | lee todos los lotes de cada producto de la página | **CAMBIA**: `PRODUCT_SELECT` lee `stock` y `unitId` de la fila y **deja de traer lotes** |
| 14 | `…/product-prisma.ts:148-166` (`productOrderBy`), `:168-199` (`productFilterWhere`) | sin `stock` | **CAMBIA**: `case 'stock'` en los dos (D5) |
| 15 | `…/product-prisma.ts:252-267` (`findAliveIdByName`) | filtra por `nameNormalized` | **SE SUSTITUYE** (§4) |
| 16 | `…/product-prisma.ts:402-430` (traducción de errores del lote: `isBatchCompanyScopeViolation` `:411-414`, `isBatchStockNegativeViolation` `:416-422` de QC-92, `translateBatchWriteError` `:426-430`) | `23514` de empresa → `ValidationError` | **CAMBIA**: añade el `23514` de unidad (§4.3) |
| 17 | `…/product-prisma.ts:498-533` (`createWithFirstBatch`, lote en `:519`, asiento en `:524-529`), `:539-579` (`addBatchToAlive`, bloqueo en `:550-557`, lote en `:565`, asiento en `:570-575`) | escriben producto/lote/asiento | **CAMBIAN**: unidad del producto desde la presentación, y recálculo de `stock` en la misma transacción (§4, §5) |
| 17b | `…/product-prisma.ts:638-665` (`adjustBatchStock`, QC-92) | `tx.productBatch.update` relativo + `writeMovement`, sin tocar `products` | **CAMBIA (enmienda)**: toma el bloqueo de fila del producto y recalcula `stock` en la misma transacción (§5.1) |
| 18 | `…/product-catalog-prisma.ts:25-45`, `:52-91` (`findProductRefs`) | suma lotes con `sumStockByUnit` | **CAMBIA**: lee `stock` y `unitId` de la fila; ya no trae lotes (§3.2) |
| 19 | `…/presentation-prisma.ts:217-242` (`replacePresentation`) | traduce `P2002`/`P2003`/`23514` de empresa | **CAMBIA**: traduce el `23514` del disparador nuevo a `'unit_locked'` (§6) |
| 20 | `lib/modules/errores/domain/error-codes.ts:14-72`, `error-catalog.ts` | **49** códigos (QC-92 y QC-108 sumaron tres) | **CAMBIA**: `presentation_unit_locked` (**novena** enmienda, §8) |
| 21 | `lib/composition/index.ts:637-652` (`productRepository`, `findAliveIdByName` en `:646`) | cablea `findAliveIdByName` | **CAMBIA**: cablea el método renombrado |
| 22 | `lib/modules/recetas/domain/get-recipe.ts:17-23`, `:74` (`stockInLineUnit`) | elige la existencia de la unidad de la línea | **INTACTO**: con `stockByUnit` de un solo valor sigue dando 0 / cantidad / `null` (R19) |

### 1.2 `app/`

| # | Archivo:línea | Qué es hoy | Destino |
|---|---|---|---|
| 23 | `app/(private)/inventario/components/product-columns.tsx:56-59` (`HiddenProductField` con `latestBatchUnitId`), `:104-108` (`unitLabel`), `:118-123` (`isBelowAlert`), `:126-135` (`existenceLabel`), `:185-196` (columnas «Nombre» y «Existencia») | celda por unidad, alerta contra el lote más reciente | **CAMBIA**: nombre «nombre · unidad» (R18), existencia `stock` + unidad (R16), alerta contra `stock` (R17), columna `stock` ordenable y filtrable (R15) |
| 24 | `app/(private)/inventario/components/product-list-params.ts:45-53`, `:153-157`, `:187-191` | sólo el filtro de alerta | **CAMBIA**: vuelven el filtro y el orden por existencia (§7) |
| 25 | `app/(private)/inventario/components/index.ts` | barrel de la ruta | **CAMBIA** si vuelven a exportarse las constantes de existencia |
| 26 | `app/(private)/inventario/components/product-form.tsx:539-549` | comentario sobre `latestBatchUnitId` | **CAMBIA**: sólo el comentario |
| 27 | `app/(private)/produccion/formulas/components/product-picker.tsx:87-107` (`ProductPickerOption.unitId`), `:184`, `:245`, `:282` | unidad derivada; pinta sólo `option.name` | **CAMBIA**: `unitId` sale de `item.unitId`; la opción y el valor elegido se pintan «nombre · unidad» (R18) |
| 28 | `app/(private)/produccion/formulas/nueva/page.tsx:76`, `[id]/page.tsx:120` | `unitId: item.latestBatchUnitId` | **CAMBIA**: `unitId: item.unitId` |
| 29 | `app/(private)/produccion/formulas/components/recipe-lines-field.tsx:59-70`, `:225-238` | comentario y paso de `units` | **CAMBIA**: pasa `units` al selector; el comentario se limpia |
| 30 | `app/(private)/produccion/formulas/components/unit-group.ts:70-75` | comentario sobre el origen de la unidad | **CAMBIA**: sólo el comentario; la lógica (`unitsOfGroup`, `resolveLineUnitId`) **no se toca** |
| 31 | `app/(private)/configuracion/presentaciones/components/presentation-form.tsx:146-148` (`CODE_TO_FIELD`) | sólo `presentation_duplicate_name` | **CAMBIA**: `presentation_unit_locked → unitId` (R22) |
| 32 | `app/(private)/pedidos/components/order-ingredients-table.tsx` | resta sobre `productStock` | **INTACTO**: el contrato `RecipeLineView.productStock` no cambia |
| 33 | `app/(private)/inventario/components/product-batches-panel.tsx:8` (importa `EMPTY_CELL` de `product-columns`), `:37-47` (unidad de cada lote desde `ProductBatchView.unitId`) — QC-92 | cantidad del lote con la unidad de su presentación | **INTACTO**: con el disparador de §4.2 la unidad de la presentación de cada lote **es** la del producto, así que lo que pinta no cambia. T6 **no debe quitar** `EMPTY_CELL` de `product-columns.tsx`: lo consume este panel |
| 34 | `app/(private)/inventario/components/product-table.tsx:51-113` (`ProductBatchesSheet`, título `:81` y `aria-label` `:72` con `product.name`) — QC-92 | panel lateral de lotes | **INTACTO** salvo que el humano responda la pregunta abierta 2 (`requirements.md`); ver T15 |
| 35 | `app/(private)/inventario/components/adjust-batch-dialog.tsx:104-109` — QC-92 | tras un ajuste, `router.refresh()` | **INTACTO**: ese `refresh` vuelve a pedir el listado, que ya leerá `products.stock` recalculado (R34). No hace falta tocar la pantalla del ajuste |

### 1.3 Base de datos

| Archivo:línea | Qué es | Destino |
|---|---|---|
| `db/schema.prisma:265-286` (`model Product`) | sin `unitId` ni `stock`; comentario «la unidad no se guarda» | **CAMBIA**: `unitId String? @map("unit_id") @db.Uuid` (escalar, sin `@relation`: `units` es de otro módulo), `stock Int @default(0)`, `@@index([unitId], map: "products_unit_id_idx")` |
| `db/schema.prisma:295-323` (`model ProductBatch`) | sin unidad propia | **INTACTO**, a propósito: ver §9, alternativa 1 |
| `db/migrations/20260911130000_inventory_company_scope/migration.sql:279-316` | disparador `product_batches_check_company` | **INTACTO**; es el precedente de forma de los dos disparadores nuevos |
| `db/migrations/20260917120000_drop_product_stock/*` | quitó `products.stock`, su CHECK y su índice | histórico; la migración nueva vuelve a crear **los mismos nombres** |
| `db/migrations/20260917130000_inventory_movements/migration.sql:6-69` — QC-92 | tabla `inventory_movements`, FK a `product_batches` `RESTRICT`, CHECK `quantity <> 0` y `reason_matches_kind`, RLS, disparador `inventory_movements_check_company` (`BEFORE INSERT`) | **INTACTO**. La migración nueva va **después** y su `down.sql` no la toca (R33) |
| `db/migrations/20260918120000_inventory_movement_kind_enum_and_reason_catalog/migration.sql:7-20` — QC-92 | enum `InventoryMovementKind`, CHECK `inventory_movements_reason_in_catalog` | **INTACTO**. **Ocupa el timestamp `20260918120000` que el plan original daba a la migración de esta ficha**: ver §11 |

### 1.4 Censo de QC-92 (enmienda del 2026-09-18)

Todo lo que QC-92 añadió o cambió y que escribe `product_batches.stock`, crea lotes o lee lo que
esta ficha cambia. Medido en el árbol de `3d66790e`.

**Caminos de escritura de `product_batches`** — son **tres** y los fija en positivo
`tests/guards/guard-libro-de-inventario.test.ts:18` (`CAMINOS_ESPERADOS`):

| # | `archivo:línea` | Qué escribe | Recalcula hoy `products.stock` | Qué le hace esta ficha |
|---|---|---|---|---|
| C1 | `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:498-533` `createWithFirstBatch` | producto + lote (`:519`) + asiento `opening` (`:524-529`) | no (la columna no existe) | unidad + recálculo (T4) |
| C2 | `…/product-prisma.ts:539-579` `addBatchToAlive` | lote (`:565`) + asiento `opening` (`:570-575`), con la fila del producto bloqueada (`:550-557`) | no | recálculo (T4) |
| C3 | `…/product-prisma.ts:638-665` `adjustBatchStock` | `tx.productBatch.update({ stock: { increment: delta } })` (`:650-654`) + asiento `adjustment` (`:656`); traduce `P2025` a `null` y el CHECK de negativo a `BatchStockNegativeError` (`:660-663`) | no | **bloqueo de fila del producto + recálculo (T14, R29–R32)** |

**Lo que rodea a esos caminos y NO escribe lotes** (se lee para no romperlo):

| `archivo:línea` | Qué es | Destino |
|---|---|---|
| `lib/modules/inventario/domain/adjust-batch-stock.ts:42-73` | caso de uso del ajuste: permiso, zod (`delta` entero ≠ 0, `reason` del catálogo), puerto | **INTACTO**: el recálculo es del adaptador, como en el alta |
| `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts:16-33` (`writeMovement`), `:67-84` (`findBatchMovements`) | escritor del asiento con la `tx` de fuera; lectura del historial | **INTACTO**. El asiento no lleva unidad: su unidad es la de la presentación del lote, que tras §4.2 es la del producto. **No hace falta requisito de unidad sobre el libro** |
| `lib/modules/inventario/domain/inventory-movement.ts:3-19` | `InventoryMovementView`, `NewInventoryMovement` (`kind`, `quantity` con signo, `reason`) | **INTACTO** |
| `lib/modules/inventario/domain/movement-ledger.ts:2` | `LEDGER_START = '20260917130000'` | **INTACTO**; no depende del timestamp de la migración de esta ficha |
| `lib/modules/inventario/domain/product-batch-view.ts` y `…/product-prisma.ts:581-623` (`BATCH_VIEW_SELECT`, `toBatchView`, `findBatchesOfAliveProduct`) | lotes del panel, con `unitId` de la presentación | **INTACTO** (ver fila 33 de §1.2) |
| `lib/modules/inventario/adapters/driven/persistence/company-scope.ts` | QC-92 reintrodujo `batchCompanyScope` y creó `movementCompanyScope` | **Se usa**: la lectura de lotes de `recalculateProductStock` lleva `batchCompanyScope(scope)` (§5) |
| `lib/modules/inventario/adapters/driving/batch-actions.ts:80-105` | `adjustBatchStockAction` | **INTACTO** |
| `lib/composition/index.ts:649-651`, `:685-689` | cableado de `adjustBatchStock`, `findBatchesOfAliveProduct`, `findBatchMovements` y de sus casos de uso | **INTACTO** |

## 2. Lo que se comprobó en disco antes de apoyarse en ello

- **No hay índice único sobre el nombre del producto** (`db/schema.prisma:265`,
  `list_query_indexes/migration.sql:65`, `:82`): la mitad «el nombre se repite» de D1 no exige
  trabajo, como dice la propia decisión.
- **`create-product` es la única alta** (`create-product.ts:65-71`). Los escritores de lotes
  eran dos cuando se escribió el spec; **desde QC-92 son tres**: `createWithFirstBatch` y
  `addBatchToAlive` crean (`product-prisma.ts:519`, `:565`) y `adjustBatchStock` actualiza
  (`:650`). Los tres los fija `guard-libro-de-inventario.test.ts:18` (§1.4). El
  método de puerto `create` (`product-prisma.ts:71-88`, cableado en `composition/index.ts:638`) crea
  un producto **sin lote**, y ningún caso de uso lo llama: esta ficha no lo toca (queda un producto
  sin unidad y con existencia 0, que es coherente con R8 y R23).
- **`addBatchToAlive` ya toma el bloqueo de la fila del producto** (`FOR NO KEY UPDATE`,
  `product-prisma.ts:550-557`) antes de escribir el lote. El recálculo concurrente (R10) se apoya en
  ese mismo bloqueo; no hace falta uno nuevo. **`adjustBatchStock` (QC-92) no lo toma**: bloquea
  sólo la fila del lote (la del `UPDATE`). Para R31 tiene que tomarlo (§5.1).
- **La presentación no expone ningún método de búsqueda** (`presentation-repository.ts:29-35`, a
  propósito). Por eso la unidad de la presentación la resuelve el adaptador de producto, no el
  dominio pidiéndola a otro puerto (§4).
- **El formulario de presentación ya sabe pintar un código en un campo** (`CODE_TO_FIELD`,
  `presentation-form.tsx:146`): R22 es una entrada más en ese mapa.
- **No medido desde aquí** (sin shell): el commit `9c5c8c43` que quitó el orden y el filtro por
  existencia, y el estado de la base local. Los nombres que había antes de QC-91 salen del censo
  escrito en `specs/QC-91-existencia-por-lote/design.md > 1.2`, fila 18: `stockMin`/`stockMax` y
  `STOCK_COLUMN_ID`. El implementer los **recupera** de `git show 9c5c8c43^:<ruta>` y no los
  reinventa; si difieren del censo, manda el historial.

## 3. Contratos

### 3.1 `ProductView` (lectura del listado)

```ts
export type ProductView = {
  readonly id: string;
  readonly name: string;
  readonly imagePath: string | null;
  readonly stock: number;              // products.stock, entero >= 0 (R8)
  readonly unitId: UnitId | null;      // products.unit_id; null = producto sin lotes (R23)
  readonly qtyAlert: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
```

- **`latestBatchUnitId` se renombra a `unitId`** porque vuelve a ser una columna del producto: el
  mismo criterio con el que QC-80 lo renombró al revés. El renombre hace que el typecheck lleve a
  cada consumidor (filas 23, 27, 28 del censo).
- **`stockByUnit` sale de `ProductView`** y se queda en `ProductRef` (§3.2). En el listado, la
  existencia de un solo valor es `stock` + `unitId`; tener además `stockByUnit` serían tres campos
  para un mismo dato. D9 conserva **el tipo y la agregación**, no el campo de esta vista (ver §9,
  alternativa 4).
- `stock` tiene que ser una clave de `ProductView` porque el id de columna de la tabla es
  `keyof ProductView` (`product-columns.tsx:73-76`) y el orden viaja como `sort=stock:…` (R15).

### 3.2 `ProductRef` (contrato hacia `recetas`)

La forma **no cambia**: `{ id, name, stockByUnit }`. Cambia de dónde sale:

```ts
stockByUnit: row.unitId === null ? [] : [{ unitId: row.unitId, quantity: row.stock }]
```

Es la «existencia por unidad que degenera a un valor» de D9, y deja `get-recipe.ts` sin tocar: sus
tres respuestas (0 sin lotes, cantidad en la unidad del producto, `null` en otra unidad) siguen
saliendo del mismo código (R19). `product-catalog.ts` no gana la cadena `unitId`, así que
`tests/unit/unidades/module-contract.test.ts:617` sigue verde.

### 3.3 Funciones puras nuevas del dominio

```ts
// lib/modules/inventario/domain/product-stock.ts (se añade)
/** Existencia de un producto a partir de sus lotes; lanza si mezclan unidades. */
export function singleUnitStock(rows: readonly { stock: number; unitId: UnitId }[]): number;
// = sumStockByUnit(rows): 0 filas -> 0; 1 -> su quantity; >1 -> throw Error (R13)

// lib/modules/inventario/domain/product-display-name.ts (nuevo)
/** «nombre · unidad», o solo el nombre si no hay etiqueta de unidad (R18). */
export function productDisplayName(name: string, unitLabel: string | null): string;
```

`singleUnitStock` no suma por su cuenta: delega en `sumStockByUnit`, que sigue siendo el único
sitio que agrupa y suma (lo vigila `qc91-alcance.test.ts > R1`). Lanza un `Error` plano —no un
`InventarioError`— porque es una invariante rota (el disparador de §4.2 lo hace imposible), no una
entrada del usuario: sale como `unexpected`.

`productDisplayName` vive en el módulo porque la usan **dos rutas** (inventario y fórmulas) y el
separador « · » es la regla de D8: una sola definición. La **etiqueta** de la unidad (símbolo o
nombre) la resuelve cada pantalla con el catálogo que ya tiene, como hoy.

## 4. El alta: nombre + unidad

### 4.1 Flujo del caso de uso (`create-product.ts`)

1. Permiso, zod, reloj y fecha de compra: **igual que hoy**.
2. `findAliveIdByNameInPresentationUnit(name, presentationId, scope)` sustituye a
   `findAliveIdByName(name, scope)`. El adaptador lee `unit_id` de la presentación **con su ámbito
   de empresa**; si no existe o es de otra empresa devuelve `null` (el alta seguirá por crear y
   fallará allí con `invalid_input`, igual que hoy con la FK). Si existe, busca el producto vivo de
   la empresa con ese `name_normalized` **y** ese `unit_id`, `ORDER BY created_at, id` (R5, R7).
3. Hay producto → `addBatchToAlive` (R5). No hay → `createWithFirstBatch` (R6). Sin aviso, sin
   rechazo (D1, D8).

El nombre del método dice lo que hace: no recibe una unidad, recibe la presentación de la que la
saca. No contiene palabras de lote, así que `qc81-alcance > R32` no lo confunde con una operación
de lotes.

### 4.2 La base rechaza un lote en otra unidad (D2)

**Mecanismo elegido: un disparador `BEFORE INSERT OR UPDATE OF product_id, presentation_id` en
`product_batches`**, gemelo de forma de `product_batches_check_company`:

```sql
CREATE OR REPLACE FUNCTION product_batches_check_unit() RETURNS TRIGGER AS $fn$
DECLARE product_unit_id UUID; presentation_unit_id UUID;
BEGIN
  SELECT p."unit_id" INTO product_unit_id FROM "products" p WHERE p."id" = NEW."product_id";
  IF NOT FOUND THEN RETURN NEW; END IF;              -- lo rechaza la FK, no este disparador
  SELECT pr."unit_id" INTO presentation_unit_id
    FROM "presentations" pr WHERE pr."id" = NEW."presentation_id" FOR SHARE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF product_unit_id IS NULL OR product_unit_id <> presentation_unit_id THEN
    RAISE EXCEPTION 'product_batches_unit_differs_from_product: ...' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $fn$ LANGUAGE plpgsql;
```

- **Producto sin unidad ⇒ rechazo** (R3). La aplicación nunca escribe un lote sobre un producto sin
  unidad: `createWithFirstBatch` fija la unidad antes del lote, y la búsqueda de R5 nunca encuentra
  un producto sin unidad (`unit_id = X` no casa con `NULL`).
- **`FOR SHARE` sobre la presentación** choca con el `FOR NO KEY UPDATE` que toma un `UPDATE
  presentations SET unit_id`, y cierra la carrera con §6 en los dos órdenes (ver §6).
- **D6**: un disparador **no revalida las filas existentes**, así que la migración no falla con un
  producto mezclado; la consecuencia está en §11.
- **D4**: el disparador **no toca `stock`** (R12). Mantener la existencia es de la aplicación.

### 4.3 Adaptador (`product-prisma.ts`)

- `createWithFirstBatch`: dentro de la transacción, lee `unit_id` de la presentación con
  `presentationCompanyScope(scope)`; si no hay fila → `ValidationError` (se aborta la transacción
  y no queda nada, R3). Crea el producto **con** `unitId`, crea el lote, **recalcula** (§5).
- `addBatchToAlive`: igual que hoy (bloqueo de fila, lote), **más** el recálculo (§5). No escribe
  `unit_id` ni `name` ni `qty_alert` (R2, R11).
- `translateBatchWriteError`: añade `product_batches_unit_differs_from_product` como `23514`
  reconocible → `ValidationError` (R3). Se identifica por SQLSTATE **y** nombre, con el mismo
  patrón que `isBatchCompanyScopeViolation` (`:411-414`) y que `isBatchStockNegativeViolation` de
  QC-92 (`:416-422`): un `23514` sin nombre conocido se relanza.
- Cuándo puede llegar ese rechazo por la aplicación: sólo en carrera —la presentación (aún sin
  lotes) cambia de unidad entre la búsqueda de §4.1 y la escritura—. Reintentar el alta lo resuelve
  por el camino correcto.

## 5. La existencia guardada y su recálculo (D3, D4, D9)

Columna `products.stock INTEGER NOT NULL DEFAULT 0` con `CHECK ("stock" >= 0)`
(`products_stock_non_negative`) e índice parcial `products_stock_idx ON products(stock) WHERE
deleted_at IS NULL`: **los mismos nombres y la misma forma** que retiró QC-91, para que D5 recupere
«exactamente eso».

- **`DEFAULT 0`** hace que los ~21 archivos de test que insertan productos a mano sin lotes sigan
  válidos (R8: sin lotes, 0). No se usa como atajo de la aplicación: el alta siempre recalcula.
- **Recálculo** — ayudante `recalculateProductStock(tx, productId, scope)` en `product-prisma.ts`,
  llamado por los **tres** caminos de escritura de lotes (§1.4): los dos del alta, después de
  `tx.productBatch.create` y de su `writeMovement`, y el ajuste (§5.1). **No es exportado** y **no
  escribe `product_batches`**: así no entra en el censo de `guard-libro-de-inventario` (que cuenta
  llamadas `productBatch.create/update/…` por función exportada) ni necesita asiento propio.
  1. lee `stock` y `presentation.unitId` de **todos** los lotes del producto (con el ámbito de
     empresa por `batchCompanyScope(scope)`, que QC-92 reintrodujo en `./company-scope`: lo exige
     `guard-ambito-empresa-inventario`);
  2. `singleUnitStock(rows)` (dominio puro, §3.3; R13);
  3. escribe con `tx.$executeRaw` `UPDATE "products" SET "stock" = $n WHERE "id" = $id AND
     "company_id" = $empresa`. **SQL crudo a propósito**: `updateMany` dispararía el `@updatedAt` de
     Prisma y tocaría `updated_at`, que R11 (heredado de QC-90 R17) prohíbe; y el listado ordena por
     `updated_at`.
- **Concurrencia (R10)**: `addBatchToAlive` ya tiene la fila del producto bloqueada; en READ
  COMMITTED cada sentencia toma instantánea nueva, así que la lectura del paso 1 ve los lotes de la
  otra transacción cuando esta ya ha confirmado. `createWithFirstBatch` escribe un producto que nadie
  más ve hasta el commit.
- **Atomicidad (R9)**: todo va dentro del mismo `prisma.$transaction` de `writeBatchWithLotRetry`;
  si el recálculo lanza, no queda ni lote ni producto.
- **Riesgo aceptado (D4)**: un cuarto escritor de lotes que no llame al ayudante deja `stock`
  desfasado sin que la base lo impida. Mitigación barata, no garantía: un test de alcance (T10)
  exige que **toda** función exportada de `lib/` que escriba `product_batches` —con el **mismo
  patrón** que usa `guard-libro-de-inventario.test.ts:182-186` (`create`, `createMany`, `update`,
  `updateMany`, `upsert`)— llame también a `recalculateProductStock`. ~~QC-92 hereda la
  obligación~~: **sustituido el 2026-09-18** — QC-92 entró antes y esta ficha cubre su camino
  (`requirements.md`, nota bajo la tabla; R29–R32).

### 5.1 El ajuste de QC-92 recalcula (enmienda del 2026-09-18; R29–R32)

`adjustBatchStock` (`product-prisma.ts:638-665`) pasa a esta forma, **dentro del mismo
`prisma.$transaction`** que ya abre:

```
1. SELECT p."id" FROM "products" p
     JOIN "product_batches" b ON b."product_id" = p."id"
    WHERE b."id" = $batchId AND b."company_id" = $companyId
      FOR NO KEY UPDATE OF p                      -- 0 filas => null (lote ajeno o inexistente)
2. tx.productBatch.update({ stock: { increment: delta }, updatedBy, updatedAt })   -- igual que hoy
3. writeMovement(tx, { kind: 'adjustment', ... })                                   -- igual que hoy
4. recalculateProductStock(tx, productId, scope)                                    -- NUEVO
```

- **Bloqueo del producto primero, lote después.** Es el mismo orden que ya sigue `addBatchToAlive`
  (fila del producto → lock de aviso → `INSERT` del lote) y el que tendría cualquier camino futuro
  que parta del producto. Con un orden único no hay abrazo mortal entre ajuste y alta. Dos ajustes
  sobre lotes distintos del mismo producto se serializan en el paso 1; el segundo, al seguir, ve en
  su paso 4 —sentencia nueva, instantánea nueva en READ COMMITTED— el lote del primero ya confirmado
  (R31). Sin este paso, cada uno sumaría sin ver el cambio no confirmado del otro y el último en
  confirmar dejaría `stock` desfasado. El `SELECT` crudo lleva la empresa por
  `companyScopeColumns(scope)`, como el de `addBatchToAlive`.
- **No filtra `deleted_at`**, a propósito: QC-92 no lo filtra hoy y esta ficha no cambia qué
  ajustes se aceptan (pregunta abierta 3 de `requirements.md`).
- **Paso 1 devuelve 0 filas → `null`** sin tocar nada: es el mismo resultado que hoy da el `P2025`
  del paso 2, que se conserva por si el lote desapareciera entre 1 y 2 (no puede: la FK es
  `RESTRICT` y no hay borrado de lotes, pero el adaptador no lo supone).
- **Negativo (R30)**: el CHECK `product_batches_stock_non_negative` rechaza el paso 2, la
  transacción entera se deshace —incluido el bloqueo— y `stock` no cambia. Traducción igual que hoy.
- **R32**: el recálculo es el mismo `UPDATE "products" SET "stock"` crudo de §5; no toca
  `updated_at` (tampoco lo tocaba el ajuste antes), ni `name`, `qty_alert` ni `unit_id`.
- **R29, aborto por mezcla**: `singleUnitStock` lanza si los lotes del producto mezclan unidades; el
  ajuste sale como `unexpected` y no queda ni el `UPDATE` del lote ni el asiento.
- **Lo que no cambia**: el caso de uso (`adjust-batch-stock.ts`), el puerto (firma y resultado
  `{ stock }` = existencia **del lote**), la action, el diálogo, `writeMovement` y el libro. El
  `UPDATE` relativo con `increment:` sigue siendo el de QC-92: aquí no se reescribe.

## 6. Presentación con lotes: la unidad se bloquea (D7)

**Mecanismo: disparador `BEFORE UPDATE OF unit_id ON presentations`** que rechaza con `23514` y
nombre `presentations_unit_locked_by_batches` cuando `NEW.unit_id IS DISTINCT FROM OLD.unit_id` y
existe algún lote con esa presentación (usa `product_batches_presentation_id_idx`). El adaptador
lo traduce a `'unit_locked'`, y el caso de uso a `PresentationUnitLockedError`
(`presentation_unit_locked`).

- **Sin comprobación previa en la aplicación**, por el mismo motivo que ya escribió el puerto para
  el duplicado (`presentation-repository.ts:29-35`): un `SELECT` previo no cierra la carrera; la
  garantía es la base.
- **La carrera, en los dos órdenes**: (a) si el alta inserta el lote primero, su disparador toma
  `FOR SHARE` sobre la presentación; el `UPDATE` espera y, al seguir, el `EXISTS` de su disparador
  —sentencia nueva, instantánea nueva— ve el lote y rechaza. (b) Si el `UPDATE` va primero, el
  `FOR SHARE` del lote espera; al seguir lee la unidad nueva, que no casa con la del producto, y
  rechaza el lote (§4.2). En ningún orden queda un producto con lotes en dos unidades.
- **Mismo valor, sin error** (R21): `IS DISTINCT FROM` deja pasar la edición que sólo cambia el
  nombre, que es lo que envía hoy el formulario (reemplazo completo, QC-80 R12).
- **Pantalla (R22)**: `CODE_TO_FIELD` gana `presentation_unit_locked: PRESENTATION_UNIT_FIELD`.
  No se deshabilita el selector de unidad por adelantado: `PresentationView` no sabe si hay lotes, y
  darle ese dato es otra consulta que nadie pidió.

## 7. Listado: orden, filtro, alerta y nombre (D5, D8, D10)

- `PRODUCT_QUERYABLE` (`product-queryable.ts:23-30`): `sortable` gana `'stock'`, `filterable` gana
  `stock: 'numberRange'`. El comentario de `:17-18` se reescribe.
- `productOrderBy`: `case 'stock': [{ stock: dir }, TIE_BREAKER]` (columna `NOT NULL`, sin
  `nulls`). `productFilterWhere`: `numberRange` sobre `stock` → `{ stock: condition }`.
- `product-list-params.ts`: vuelven los dos parámetros de rango y el id de columna tal como estaban
  antes de `9c5c8c43` (§2), con su lectura en `parseProductListParams` y su escritura en
  `buildProductListQuery`, y `parse(build(p)) = p` sigue siendo cierto.
- `product-columns.tsx`:
  - columna `name`: `productDisplayName(product.name, unitLabel(product.unitId, units))` (R18); el
    orden sigue siendo por `name`;
  - columna `stock` (sustituye a `stockByUnit`): `sortable`, `filter: { kind: 'numberRange' }`,
    celda `«15 kg»` o `«0»` sin unidad (R16);
  - `isBelowAlert`: `typeof qtyAlert === 'number' && qtyAlert > product.stock` (R17);
  - `HiddenProductField`: `latestBatchUnitId` → `unitId`.
- **Índices**: `products_stock_idx` sirve el orden y el filtro. No se añade índice para la búsqueda
  del alta `(company_id, name_normalized, unit_id)`: el alta no es ruta caliente y hoy tampoco lo
  tiene; si hiciera falta, sería especular aquí.

## 8. El código de error nuevo

`presentation_unit_locked` → `errors.presentation_unit_locked` → texto propuesto: «La presentacion
ya tiene lotes y no puede cambiar de unidad.» (único en el catálogo; sin acentos como el resto).

- **Cifra corregida en la enmienda del 2026-09-18.** El spec aprobado decía «46 → 47» y «séptima
  enmienda». Tras sincronizar, **la séptima la ocupó QC-92** (`batch_not_found`,
  `batch_stock_negative`) y **la octava QC-108** (`ai_unavailable`): `ERROR_CODES` tiene hoy
  **49** entradas (`error-codes.ts:14-72`). Esta ficha es la **novena enmienda**.
- `tests/unit/errores/catalogo.test.ts:42-44` y `:54` pasan de **49 a 50** (conteo literal a
  propósito, en el título de los dos casos y en `toHaveLength`).
- La cabecera de `error-codes.ts:6-12` recoge la **novena enmienda**, debajo de la octava. Los
  tests `:182-186` (sexta, QC-81), `:208-212` (séptima, QC-92) y `:233-237` (octava) exigen el
  texto literal de las anteriores, así que se **añade** debajo, no se reemplaza nada.
- **Choque con `docs/conventions.md > Comentarios`**: la sexta y la séptima citan su ficha, y la
  convención prohíbe citar fichas en producción. **La octava ya se escribió sin clave**
  («**Octava enmienda, el 2026-09-18**: `ai_unavailable`. Aprobada por el humano el 2026-09-18.»):
  hay precedente. Propuesta: la novena igual, **sin clave** («**Novena enmienda, el 2026-09-18**:
  `presentation_unit_locked`. Aprobada por el humano el 2026-09-18.»), y su test —en `tests/`,
  donde sí se puede— es quien la ata a esta ficha. **Lo decide el humano en F1.4.**

## 9. Alternativas descartadas

1. **FK compuesta con `unit_id` en el lote** —`product_batches(product_id, unit_id) → products(id,
   unit_id)` y `(presentation_id, unit_id) → presentations(id, unit_id)`—. Es declarativa y, con
   `ON UPDATE NO ACTION`, bloquearía gratis el cambio de unidad de la presentación (D7). Descartada:
   (a) mete en el lote una **segunda verdad** de la unidad que la aplicación tendría que escribir en
   cada lote leyendo antes la presentación, justo lo que `inventario-schema.test.ts:893-897` prohíbe
   con el argumento «el lote no declara unidad: la declara su presentación»; (b) exige dos índices
   únicos `(id, unit_id)` sólo para servir de destino de FK; (c) al añadirse **valida** las filas
   existentes, lo que D6 acepta pero no pide. El disparador consigue la misma garantía para toda
   escritura nueva sin columna redundante, con precedente exacto en el repo.
2. **Mantener `stock` con un disparador de la base.** Descartada por D4 literal.
3. **Recalcular con `stock = stock + delta`** en vez de volver a sumar los lotes. Es más barato y
   concurrente sin bloqueo, pero no es «la suma de los lotes» (D3): un desfase se arrastra para
   siempre en vez de corregirse en la siguiente escritura. _(El argumento «además
   `qc81-alcance.test.ts > R31` rechaza `increment:`» ya no vale: ese caso está acotado a la rama
   de QC-81 —`qc81-alcance.test.ts:444-467`— y QC-92 usa `increment:` en el lote. Lo que descarta
   la alternativa es D3, no la guardia.)_
   **Aplicado al ajuste (enmienda)**: sumar el mismo `delta` a `products.stock` en
   `adjustBatchStock` sería la versión más barata de §5.1. Descartada por lo mismo: D3 dice «suma de
   los lotes», y un `stock` que ya estuviera desfasado seguiría desfasado tras cada ajuste.
4. **Conservar `ProductView.stockByUnit`** junto a `stock`/`unitId`. Descartada por redundante:
   tres campos para un dato que ya es uno. D9 se cumple con el tipo, con la agregación (que calcula
   la columna) y con `ProductRef`, que sí lo necesita tal cual.
5. **`products.unit_id NOT NULL`**. Más fuerte, pero obliga a inventar unidad para productos sin
   lotes en la migración (no hay de dónde sacarla) y a tocar ~21 archivos de test de otros módulos
   que insertan productos sin lote. Se elige **anulable**, con `NULL` = «sin lotes». Ver §11.
6. **Índice único parcial `(company_id, name_normalized, unit_id) WHERE deleted_at IS NULL`**
   para cerrar la carrera de dos altas simultáneas del mismo nombre y unidad. No lo pide ninguna
   decisión, rechazaría altas que hoy entran y podría fallar sobre datos existentes. La carrera ya
   existía con el nombre solo (QC-90) y sigue igual.
7. **(Enmienda) En el ajuste, actualizar el lote primero y bloquear el producto después** —añadir
   sólo `SELECT … FOR NO KEY UPDATE` sobre el producto entre el `UPDATE` del lote y el recálculo—.
   Es el cambio más pequeño sobre el código de QC-92 y también cumple R31. Descartada: deja dos
   órdenes de bloqueo en el mismo archivo (el alta va producto → lote; el ajuste iría lote →
   producto), y el primer camino que parta del producto y toque un lote existente abriría un abrazo
   mortal con el ajuste. Un solo orden cuesta un `JOIN` y se razona una vez.
8. **(Enmienda) Recalcular `products.stock` con un disparador sólo para el ajuste**, dejando el alta
   en la aplicación. Descartada por D4 literal, que la enmienda no reabre, y porque tendríamos dos
   mecanismos para la misma columna.

## 10. Permisos, empresa, RLS, multiplataforma y dependencias

- **Permisos (D11, R24)**: nada nuevo. `create-product.ts:81` y `update-presentation.ts:45` ya
  exigen `inventario.modificar`; el listado, `inventario.consultar`. Se añaden los tests que lo
  afirman sobre los caminos cambiados.
- **Empresa**: cada lectura nueva (unidad de la presentación, lotes del recálculo) y la escritura
  cruda de `stock` llevan el ámbito por `./company-scope`. Los disparadores comparan filas que ya
  comparten empresa (lo garantiza `product_batches_check_company`).
- **RLS**: no hay tabla nueva. La migración abre y cierra el paréntesis `NO FORCE`/`FORCE` sobre
  `products`, `product_batches` y `presentations` para el relleno, como
  `20260911130000_inventory_company_scope` (que en local no se nota: `postgres` es superusuario).
- **Multiplataforma**: sólo texto nuevo («nombre · unidad», «15 kg») en celdas y opciones que ya
  existen, y un mensaje en un formulario que ya los pinta. Sin `hover`, sin `100vh`, sin target
  táctil nuevo. No se pide excepción de escritorio.
- **Dependencias (D15, R28)**: **ninguna nueva**. La suma es la de `sumStockByUnit` sobre enteros;
  el resto lo resuelven Prisma, zod y plpgsql, ya aprobados. `package.json` no se toca.

## 11. Migración

~~`db/migrations/20260918120000_product_unit_and_stored_stock/`~~ **→ cambia de timestamp
(enmienda del 2026-09-18)**: `20260918120000` lo ocupa ya
`20260918120000_inventory_movement_kind_enum_and_reason_catalog` (QC-92). La carpeta pasa a
`db/migrations/<ts>_product_unit_and_stored_stock/` con `<ts>` **estrictamente mayor que el de la
última carpeta de `db/migrations/`**, medido con `ls` por el implementer al empezar T3 (desde aquí
no se pudo listar el directorio; QC-68 y QC-108 también migraron el 2026-09-18). Propuesta:
`20260918130000` si nada lo supera. Ir **después** de las dos migraciones del libro es lo que pide
R33: el relleno suma los lotes ya ajustados. **Escrita a mano** (como
`drop_product_stock`: `migrate dev --create-only` no puede reproducir `inventory_company_scope`
sobre una base sombra vacía). Orden del UP:

1. `NO FORCE ROW LEVEL SECURITY` en `products`, `product_batches`, `presentations`.
2. `ADD COLUMN "unit_id" UUID` y `ADD COLUMN "stock" INTEGER NOT NULL DEFAULT 0`.
3. Relleno (R23): `unit_id` = unidad de la presentación del lote más reciente (`created_at DESC, id
   DESC`, el mismo desempate que `latestBatchUnitId`); `stock` = `COALESCE(SUM(lotes), 0)`. Sin
   comprobar mezcla (D6). El `SUM` vive en `db/`, no en el módulo: `qc81-alcance > R31` sólo barre
   `lib/modules/inventario`.
4. `products_stock_non_negative`, `products_unit_id_fkey` (`REFERENCES units(id) ON DELETE
   RESTRICT ON UPDATE CASCADE`, escrita a mano y drift, como `presentations_unit_id_fkey`),
   `products_unit_id_idx`, `products_stock_idx` (parcial).
5. Funciones y disparadores `product_batches_check_unit` y `presentations_check_unit_locked`
   **después** del relleno.
6. `ENABLE` + `FORCE ROW LEVEL SECURITY` de nuevo en las tres.

`down.sql`: quita los dos disparadores y sus funciones, los dos índices, la FK, el CHECK y las dos
columnas. Deja el esquema como tras QC-91 (R23) **más lo que ya añadió QC-92**: `inventory_movements`,
su enum `InventoryMovementKind`, sus CHECK y su disparador **no se tocan** (R33). Léase «como tras
QC-91» de R23 como «como estaba justo antes de esta migración». Se prueba aplicar → `db:rollback`
→ aplicar.

**Consecuencia de D6, dicha para que nadie la descubra**: el disparador no revalida lo que ya
existe, así que un producto que **ya** tuviera lotes en dos unidades **no** hace fallar la
migración: queda con la unidad de su lote más reciente y con una existencia que suma unidades
distintas, y cualquier lote nuevo en la otra unidad se rechazará. Medido el 2026-09-18 por el
leader: 1 producto, sin mezcla. D6 lo acepta («no se comprueba», «no se parte ningún producto»).

## 12. Guardias y tests que se tocan

Lección de QC-50, QC-59 y QC-91: los que **no importan** lo que vigilan no los selecciona
`--rapido` y sólo muerden en `./init.sh` completo o después del commit. Se listan aparte.
Las filas marcadas **(Enmienda, QC-92)** y las cifras corregidas son de la enmienda del
2026-09-18; lo que pide aprobación está en §15.

### 12.1 Los selecciona el grafo (`--rapido`)

`tests/unit/inventario/`: `product-prisma`, `product-catalog`, `product-stock`, `product-page`,
`product-service`, `create-product`, `authorization`, `company-scope`, `company-isolation-service`,
`product-input`, `product-field`, `list-query` (`:179-196` afirma que `stock` **no** es ordenable:
se invierte), `list-use-cases`, `product-list-params`, `presentation-actions`, `product-actions`;
`tests/unit/recetas/`: `recipe-service`, `recipe-lines-catalog`; `tests/unit/recetas-ui/`:
`recipe-form`, `recipe-line-unit-group`, `unit-group`; `tests/unit/configuracion-ui/` del formulario
de presentación; `tests/unit/errores/catalogo.test.ts` (`:42-44`, `:54`: **49 → 50**, cifra
corregida en la enmienda). **Enmienda**: los tests unitarios de `adjustBatchStock` del adaptador y
de `adjust-batch-stock.ts` en `tests/unit/inventario/` (nombres exactos **a medir**: sin búsqueda
por contenido en esta sesión) — si simulan la `tx` sólo con `productBatch.update` e
`inventoryMovement.create`, se ponen rojos al añadir el `SELECT … FOR NO KEY UPDATE` y el recálculo
de §5.1, y se amplían en T14.

### 12.2 NO los selecciona el grafo: se ponen rojos en el gate completo

| Archivo:línea | Qué afirma hoy | Qué pasa |
|---|---|---|
| `tests/unit/inventario/qc91-alcance.test.ts:255-309` (R1), `:315-403` (R11) — líneas re-medidas tras QC-92 | `toProductView` y `findProductRefs` suman lotes con `sumStockByUnit`; `ProductView` expone `stockByUnit` y no `stock`; `PRODUCT_SELECT` trae `batches` y no `stock`; los escritores no escriben `stock` | **ROJO**: D3/D4 derogan esas decisiones. Se reescriben con el argumento escrito (la agregación pasa al recálculo; la lectura va a la columna), sin borrar los detectores de `R21` (`:409-511`, ya enmendados por QC-92 para admitir el `update` de `adjustBatchStock`), que **siguen verdes**: el recálculo escribe `products`, no `product_batches` |
| `tests/unit/unidades/module-contract.test.ts:623-624` | `ProductView` declara `readonly latestBatchUnitId: UnitId \| null`; el archivo no contiene `readonly unitId` | **ROJO** las dos. Se actualizan con el argumento: el producto vuelve a declarar unidad, **por referencia** y como dato de lectura; `NewProduct` sigue sin ella. `:617` (`ProductRef` sin `unitId`) sigue verde |
| `tests/unit/inventario/product-route-contract.test.ts` — el caso que afirma que `HiddenProductField` contiene `'latestBatchUnitId'` (antes `:376-381`; **QC-92 movió el archivo**, localizar por contenido) | `HiddenProductField` contiene `'latestBatchUnitId'` | **ROJO**: pasa a `'unitId'` |
| `tests/unit/inventario/schema/inventario-schema.test.ts:267-269`, `:437-449`, `:602-606`, `:610-612` — re-medidas tras QC-92 | `Product` sin `stock`, sin `unitId`, sin `unit_id`, índices exactamente `['products_company_id_idx']`, sin `products_unit_id_idx` | **ROJO** los cuatro. El caso «el lote no declara unidad» (antes `:893-897`; localizar por contenido) **sigue verde**, y es el argumento de §9.1 |
| `tests/integration/inventario/list-query-indexes.int.test.ts:108-141` (`PARTIAL_INDEXES` y su nota), `:272-280`, `:282-285` — **cifra corregida** | **34** índices (QC-68 sumó `recipes_name_normalized_all_trgm_idx`); `products_stock_idx` no existe | **ROJO**: `products_stock_idx` vuelve a `PARTIAL_INDEXES` → **35** (no 34 como decía el spec aprobado), y el caso «R2: ya no existe» se invierte. La nota de `:213-219` sobre `products_unit_id_idx` se actualiza (el índice vuelve) |
| `tests/integration/inventario/list-query-products.int.test.ts` | dos lotes en dos unidades sobre un producto | **ROJO**: el disparador lo prohíbe; se reescribe con dos productos |
| `tests/integration/inventario/presentation-unit.int.test.ts` | cambiar la unidad de una presentación | **ROJO** si la presentación tiene lotes (R20) |
| Integración con lotes insertados a mano: `inventario/{company-scope,company-scope-queries,inventario-constraints,product-batch-write,product-batch-lot,presentation-uniqueness}.int.test.ts`, `unidades/unidades-constraints.int.test.ts`, `recetas/recetas-constraints.int.test.ts`, `e2e/aislamiento-inventario.spec.ts` | crean producto sin unidad y le cuelgan un lote | **ROJO**: el disparador rechaza lote sobre producto sin unidad. Hay que darle `unit_id` al producto del fixture (la de la presentación) |
| **(Enmienda, QC-92)** `tests/integration/inventario/inventory-movements-constraints.int.test.ts:111-121` (`createProduct` sin unidad) y su `createBatch` (`:137-…`) | producto sin unidad + lote a mano, para probar los CHECK y el disparador del libro | **ROJO**: mismo motivo. El producto del fixture gana la unidad de su presentación |
| **(Enmienda, QC-92)** `tests/integration/inventario/ledger-cuadre.int.test.ts:299-331` (R30 de QC-92: `prisma.product.create` sin unidad + `createBatchDirectly`) | lote fabricado a mano sobre producto sin unidad | **ROJO** ese caso. Los cuatro de `:226-297` pasan por `createWithFirstBatch`/`addBatchToAlive`/`adjustBatchStock` y quedan verdes cuando T4 y T14 estén |
| **(Enmienda, QC-92)** `e2e/ajuste-de-inventario.spec.ts:243-251` (producto sin unidad) y `:255-267` (lote a mano) | siembra del E2E del ajuste | **ROJO** al correrlo a mano (`init.sh` no corre Playwright): el producto sembrado gana `unitId` y `stock: 12` |
| **(Enmienda, QC-92)** `tests/guards/guard-libro-de-inventario.test.ts:18`, `:233-266` | el censo de caminos de escritura de lotes es **exactamente** `{ createWithFirstBatch, addBatchToAlive, adjustBatchStock }` y cada uno llama a `writeMovement(` | Corre siempre. **Verde** si `recalculateProductStock` no escribe `product_batches` (§5). **Muerde** si alguien mueve el `productBatch.create/update` al ayudante o a otra función exportada. No se toca |
| `tests/guards/guard-ambito-empresa-inventario.test.ts:249-340` | cada método del puerto está cableado con su nombre, y toda función que consulta declara y consume `scope` | Corre siempre. **Muerde** si el método renombrado no se cablea igual en `composition` o si `recalculateProductStock` o la lectura de la unidad de la presentación no llevan el ámbito |
| `tests/guards/guard-catalogo-de-errores.test.ts` | cada código de `errors.ts` está en el catálogo | Corre siempre; verde si T2 va entera |
| `tests/integration/aislamiento.json` | censo de archivos de integración | Todo archivo **nuevo** de integración se declara ahí o `guard-aislamiento-integracion` da rojo. **Enmienda**: `product-stock.int.test.ts` llama a los adaptadores reales, que abren su propia `prisma.$transaction` contra el cliente global (como `ledger-cuadre`, `:109-113`) y necesita confirmar para medir la concurrencia de R10/R31: va en **`commit`**, con `motivo` y `desde` |
| `tests/unit/inventario/qc81-alcance.test.ts:444-467` (R31) y `:621-629` (puerto, R32) | sin suma, sin ajuste, sin operaciones de lote en el puerto | **Acotados a la rama de QC-81**: aquí se saltan. Los «Cuidado» de T4 que los citaban dejaron de morder; se conservan por prudencia pero no son guardia |

Ninguno se «arregla» borrándolo: cada cambio va con su porqué en el propio test y en el mismo
commit que lo provoca.

## 13. Riesgos y decisiones que no salen de la acotación (para F1.4)

1. **`products.unit_id` anulable**, con `NULL` = producto sin lotes (§9.5). Consecuencia: un
   producto antiguo sin lotes **nunca gana unidad** —la búsqueda de D1 no lo encuentra— y un alta
   con su nombre crea otro producto. Es la lectura literal de D1; la alternativa («adoptar» la
   unidad en el primer lote) la contradiría.
2. **Código de error nuevo** `presentation_unit_locked` y su texto (§8), y cómo se redacta la
   séptima enmienda sin citar la ficha.
3. **`ProductView` pierde `stockByUnit`** y lo conserva `ProductRef` (§3.1, §9.4).
4. **El valor ya elegido en el selector de la receta**: al elegir de la lista se pinta «nombre ·
   unidad»; una línea **precargada** en la edición de receta muestra sólo el nombre, porque el
   detalle de receta no trae la unidad del producto y ampliarlo no está pedido. No decide la
   pregunta abierta 1.
5. **Mezcla previa silenciosa** (§11, D6).
6. **Carrera de dos altas simultáneas del mismo nombre y unidad**: pueden nacer dos productos
   iguales, como ya podía pasar con el nombre solo (§9.6).
7. ~~**QC-92** hereda llamar a `recalculateProductStock` y tomar el mismo bloqueo de fila.~~
   **Sustituido el 2026-09-18**: QC-92 entró antes; lo hace esta ficha (§5.1, R29–R32, T14). Lo
   que queda de este punto para aprobar está en §15.

## 14. Trazabilidad prevista (`R<n>` → test)

| R | Test previsto |
|---|---|
| R1, R3 | `tests/integration/inventario/product-unit.int.test.ts` (nuevo) + `create-product.test.ts` |
| R2 | `product-input.test.ts` (edición con `unitId` → `invalid_input`) + `product-prisma.test.ts` (`addBatchToAlive` no escribe `unit_id`) |
| R4 | `product-page.test.tsx`, `recipe-form.test.tsx` (unidad desde `ProductView.unitId`) |
| R5, R6, R7 | `create-product.test.ts` + `product-unit.int.test.ts` |
| R8, R9, R10, R11 | `product-stock.int.test.ts` (nuevo, incluye dos altas concurrentes) + `product-prisma.test.ts` |
| R12 | `inventario-migration` de la migración nueva (ningún disparador escribe `stock`) |
| R13 | `product-stock.test.ts` (`singleUnitStock`: 0, 1 y >1 filas) |
| R14, R19 | `product-catalog.test.ts`, `recipe-service.test.ts` |
| R15 | `list-query.test.ts`, `product-list-params.test.ts`, `list-query-products.int.test.ts` |
| R16, R17, R18 | `product-page.test.tsx`, `product-display-name.test.ts` (nuevo), `recipe-form.test.tsx` |
| R20, R21 | `presentation-unit.int.test.ts`, `presentation-service`/`presentation-actions.test.ts` |
| R22 | test del formulario de presentación en `tests/unit/configuracion-ui/` |
| R23 | test de la migración nueva (unitario sobre el SQL) + integración de relleno |
| R24 | `authorization.test.ts` |
| R25 | `inventario-schema.test.ts` (nombres snake_case en inglés) + `qc91-alcance > R21` |
| R26 | `e2e/inventario.spec.ts` |
| R27 | `./init.sh` completo verde |
| R28 | `tests/guards/guard-dependencias-aprobadas.test.ts` |
| R29 | `product-stock.int.test.ts` (ajuste +6 y −9 sobre un producto de tres lotes → `stock` = suma) + test unitario del adaptador (`adjustBatchStock` llama a `recalculateProductStock`; si el recálculo lanza, ni `UPDATE` ni asiento) + `qc121-alcance.test.ts` (el cuerpo de `adjustBatchStock` llama al ayudante) + `ledger-cuadre.int.test.ts` sigue verde |
| R30 | `product-stock.int.test.ts` (ajuste a negativo → `batch_stock_negative` y `stock` igual; lote de otra empresa → `null` y `stock` de los dos productos igual) |
| R31 | `product-stock.int.test.ts` (dos ajustes simultáneos sobre dos lotes del mismo producto; un ajuste y un `addBatchToAlive` simultáneos → `stock` = suma) |
| R32 | `product-stock.int.test.ts` (tras el ajuste, `name`, `qty_alert`, `unit_id` y `updated_at` del producto iguales) |
| R33 | test unitario del SQL de la migración (el `down.sql` no nombra `inventory_movements` ni `InventoryMovementKind`; el `<ts>` de la carpeta es mayor que `20260918120000`) + aplicar → `db:rollback` → aplicar con el libro intacto |
| R34 | `e2e/ajuste-de-inventario.spec.ts` (tras el ajuste feliz, la fila del producto en el listado muestra `INITIAL_STOCK + HAPPY_DELTA` con su unidad) |

## 15. Enmienda del 2026-09-18: QC-121 cubre el ajuste de QC-92

**APROBADA por el humano el 2026-09-18**, con todas las opciones recomendadas: las preguntas abiertas 2 y 3 pasan a la tabla de decisiones y T15 entra.

**Motivo.** El spec aprobado suponía que QC-92 entraría **después** y «heredaría la obligación de
recalcular `products.stock`» (D4, §5, §13.7). QC-92 entró **antes** (PR #91). El humano decidió el
2026-09-18: «Sí, QC-121 cubre el ajuste». La tabla de decisiones no se reescribe: la sustitución
queda en una nota bajo la tabla de `requirements.md`; **la fila formal la añade el leader si el
humano lo pide**.

**Qué cambia del plan aprobado.**

- Requisitos nuevos **R29–R34** (sin renumerar R1–R28); tasks nuevas **T14** (el ajuste recalcula)
  y **T15** (condicional a la pregunta abierta 2); T2, T3, T4, T10, T11, T12 y T13 ajustadas.
- Cifras corregidas: catálogo **49 → 50** (no 46 → 47) y **novena** enmienda (no séptima);
  índices de listado **34 → 35** (no 33 → 34); caminos de escritura de lotes **tres** (no dos).
- Migración: **cambia de timestamp** (colisión con QC-92 en `20260918120000`).

**Requiere aprobación humana (F1.4 de la enmienda).**

1. **R32 — el ajuste no toca `updated_at` del producto.** Extiende al ajuste lo que R11 fija para
   el alta. Hoy (QC-92) el ajuste tampoco lo toca, así que es conservar el comportamiento, pero
   ninguna decisión lo dice para el ajuste. Consecuencia: ajustar no mueve el producto en el orden
   por «última modificación».
2. **R34 — el E2E del ajuste pasa a afirmar la existencia del listado.** Se amplía
   `e2e/ajuste-de-inventario.spec.ts` (de QC-92) en vez de crear otro archivo. D13 sólo exigía el
   caso de las dos filas.
3. **§5.1 — orden de bloqueo producto → lote en el ajuste**, que cambia el cuerpo de
   `adjustBatchStock` más allá de añadir una llamada (alternativa 7 descartada).
4. **Pregunta abierta 2** — si el panel de lotes se titula «nombre · unidad» (T15 sólo si sí).
5. **Pregunta abierta 3** — el ajuste de un lote de producto dado de baja se sigue aceptando.
6. **Redacción de la novena enmienda sin clave de ficha** (§8), con la octava como precedente.
7. **Timestamp de la migración** (§11): el implementer lo mide; propuesta `20260918130000`.

**Archivos que se AÑADEN respecto al spec aprobado** (a tocar; ninguno se crea salvo que se diga):

| Archivo | Por qué | Task |
|---|---|---|
| `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts` → `adjustBatchStock` | bloqueo + recálculo (ya estaba el archivo; se añade la función) | T14 |
| `lib/modules/inventario/ports/product-repository.ts:123-141` | comentario del ajuste | T14 |
| tests unitarios de `adjustBatchStock` en `tests/unit/inventario/` (nombre a medir) | la `tx` simulada gana el `SELECT` y el recálculo | T14 |
| `tests/integration/inventario/inventory-movements-constraints.int.test.ts` | fixture con unidad | T4 |
| `tests/integration/inventario/ledger-cuadre.int.test.ts` | fixture del caso R30 de QC-92 con unidad | T4 |
| `e2e/ajuste-de-inventario.spec.ts` | fixture con unidad (T4) y aserción de R34 (T11) | T4, T11 |
| `tests/unit/errores/catalogo.test.ts` | 49 → 50 y caso de la novena | T2 (ya estaba; cambia la cifra) |
| `tests/integration/inventario/list-query-indexes.int.test.ts` | 34 → 35 | T3 (ya estaba; cambia la cifra) |
| `app/(private)/inventario/components/product-table.tsx` | sólo si se aprueba la pregunta abierta 2 | T15 |

**Lo que se comprobó que NO hace falta tocar**: el caso de uso `adjust-batch-stock.ts`, la action
`batch-actions.ts`, el diálogo de ajuste (ya hace `router.refresh()`), `batch-movement-prisma.ts`,
`inventory-movement.ts`, `movement-ledger.ts`, las dos migraciones del libro,
`product-batches-panel.tsx` y `guard-libro-de-inventario.test.ts`. El libro no gana unidad: la de
cada asiento es la de la presentación de su lote, y el disparador de §4.2 la iguala a la del
producto.
