# QC-121 — unidad-como-identidad-del-item · design.md

> Escrito contra `feature/QC-121-unidad-como-identidad-del-item` (worktree
> `.worktrees/QC-121-unidad-como-identidad-del-item`), que ya contiene QC-91 mergeada. Rutas y
> números de línea **medidos en ese árbol**, no de memoria. Lo que no se pudo medir desde aquí
> (sin shell: el historial de git y la base local) está marcado como tal.

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
| 11 | `lib/modules/inventario/ports/product-repository.ts:73` (`findAliveIdByName`), `:88-93`, `:113-118` | puerto del alta | **CAMBIA**: `findAliveIdByName` se sustituye por `findAliveIdByNameInPresentationUnit` (§4); las otras dos firmas no cambian |
| 12 | `lib/modules/inventario/ports/presentation-repository.ts:77-81` (`replace`) | unión `'ok' \| 'not_found' \| 'duplicate' \| 'invalid_unit'` | **CAMBIA**: gana `'unit_locked'` |
| 13 | `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:34-48` (`BATCH_STOCK_BY_UNIT`, `PRODUCT_SELECT`), `:52-65` (`toProductView`) | lee todos los lotes de cada producto de la página | **CAMBIA**: `PRODUCT_SELECT` lee `stock` y `unitId` de la fila y **deja de traer lotes** |
| 14 | `…/product-prisma.ts:145-163` (`productOrderBy`), `:165-196` (`productFilterWhere`) | sin `stock` | **CAMBIA**: `case 'stock'` en los dos (D5) |
| 15 | `…/product-prisma.ts:249-264` (`findAliveIdByName`) | filtra por `nameNormalized` | **SE SUSTITUYE** (§4) |
| 16 | `…/product-prisma.ts:387-414` (traducción de errores del lote) | `23514` de empresa → `ValidationError` | **CAMBIA**: añade el `23514` de unidad (§4.3) |
| 17 | `…/product-prisma.ts:482-510` (`createWithFirstBatch`), `:516-549` (`addBatchToAlive`) | escriben producto/lote | **CAMBIAN**: unidad del producto desde la presentación, y recálculo de `stock` en la misma transacción (§4, §5) |
| 18 | `…/product-catalog-prisma.ts:25-45`, `:52-91` (`findProductRefs`) | suma lotes con `sumStockByUnit` | **CAMBIA**: lee `stock` y `unitId` de la fila; ya no trae lotes (§3.2) |
| 19 | `…/presentation-prisma.ts:217-242` (`replacePresentation`) | traduce `P2002`/`P2003`/`23514` de empresa | **CAMBIA**: traduce el `23514` del disparador nuevo a `'unit_locked'` (§6) |
| 20 | `lib/modules/errores/domain/error-codes.ts:9-59`, `error-catalog.ts` | 46 códigos | **CAMBIA**: `presentation_unit_locked` (séptima enmienda, §8) |
| 21 | `lib/composition/index.ts:627-639` (`productRepository`) | cablea `findAliveIdByName` | **CAMBIA**: cablea el método renombrado |
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

### 1.3 Base de datos

| Archivo:línea | Qué es | Destino |
|---|---|---|
| `db/schema.prisma:265-286` (`model Product`) | sin `unitId` ni `stock`; comentario «la unidad no se guarda» | **CAMBIA**: `unitId String? @map("unit_id") @db.Uuid` (escalar, sin `@relation`: `units` es de otro módulo), `stock Int @default(0)`, `@@index([unitId], map: "products_unit_id_idx")` |
| `db/schema.prisma:295-323` (`model ProductBatch`) | sin unidad propia | **INTACTO**, a propósito: ver §9, alternativa 1 |
| `db/migrations/20260911130000_inventory_company_scope/migration.sql:279-316` | disparador `product_batches_check_company` | **INTACTO**; es el precedente de forma de los dos disparadores nuevos |
| `db/migrations/20260917120000_drop_product_stock/*` | quitó `products.stock`, su CHECK y su índice | histórico; la migración nueva vuelve a crear **los mismos nombres** |

## 2. Lo que se comprobó en disco antes de apoyarse en ello

- **No hay índice único sobre el nombre del producto** (`db/schema.prisma:265`,
  `list_query_indexes/migration.sql:65`, `:82`): la mitad «el nombre se repite» de D1 no exige
  trabajo, como dice la propia decisión.
- **`create-product` es la única alta** (`create-product.ts:65-71`) y los **dos únicos escritores
  de lotes** son `createWithFirstBatch` y `addBatchToAlive` (`product-prisma.ts:503`, `:542`). El
  método de puerto `create` (`product-prisma.ts:68-85`, cableado en `composition/index.ts:628`) crea
  un producto **sin lote**, y ningún caso de uso lo llama: esta ficha no lo toca (queda un producto
  sin unidad y con existencia 0, que es coherente con R8 y R23).
- **`addBatchToAlive` ya toma el bloqueo de la fila del producto** (`FOR NO KEY UPDATE`,
  `product-prisma.ts:527-534`) antes de escribir el lote. El recálculo concurrente (R10) se apoya en
  ese mismo bloqueo; no hace falta uno nuevo.
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
  patrón que `isBatchCompanyScopeViolation` (`:396-406`): un `23514` sin nombre conocido se relanza.
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
  llamado por los **dos** escritores de lotes después de `tx.productBatch.create`:
  1. lee `stock` y `presentation.unitId` de **todos** los lotes del producto (con el ámbito de
     empresa llevado a una envoltura de `./company-scope`: lo exige
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
- **Riesgo aceptado (D4)**: un tercer escritor de lotes que no llame al ayudante deja `stock`
  desfasado sin que la base lo impida. Mitigación barata, no garantía: un test de alcance (T10)
  exige que **toda** función de `product-prisma.ts` que llama a `tx.productBatch.create` llame
  también a `recalculateProductStock`. QC-92 hereda la obligación y ese test la hará visible.

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

- `tests/unit/errores/catalogo.test.ts:44` pasa de **46 a 47** (conteo literal a propósito).
- La cabecera de `error-codes.ts:6-7` recoge la **séptima enmienda**. El test `:183-186` exige que
  la sexta siga escrita literalmente con «(QC-81)», así que se **añade** debajo, no se reemplaza.
- **Choque con `docs/conventions.md > Comentarios`**: las enmiendas anteriores citan su ficha, y la
  convención prohíbe citar fichas en producción. Propuesta: la séptima se escribe **sin clave**
  («Séptima enmienda, el 2026-09-18: `presentation_unit_locked`. Aprobada por el humano en la puerta
  de aprobación del spec.») y su test —en `tests/`, donde sí se puede— es quien la ata a esta ficha.
  **Lo decide el humano en F1.4.**

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
   siempre en vez de corregirse en la siguiente escritura. Además
   `qc81-alcance.test.ts > R31` rechaza `increment:`/`decrement:` en el módulo.
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

`db/migrations/20260918120000_product_unit_and_stored_stock/`, **escrita a mano** (como
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
columnas. Deja el esquema como tras QC-91 (R23). Se prueba aplicar → `db:rollback` → aplicar.

**Consecuencia de D6, dicha para que nadie la descubra**: el disparador no revalida lo que ya
existe, así que un producto que **ya** tuviera lotes en dos unidades **no** hace fallar la
migración: queda con la unidad de su lote más reciente y con una existencia que suma unidades
distintas, y cualquier lote nuevo en la otra unidad se rechazará. Medido el 2026-09-18 por el
leader: 1 producto, sin mezcla. D6 lo acepta («no se comprueba», «no se parte ningún producto»).

## 12. Guardias y tests que se tocan

Lección de QC-50, QC-59 y QC-91: los que **no importan** lo que vigilan no los selecciona
`--rapido` y sólo muerden en `./init.sh` completo o después del commit. Se listan aparte.

### 12.1 Los selecciona el grafo (`--rapido`)

`tests/unit/inventario/`: `product-prisma`, `product-catalog`, `product-stock`, `product-page`,
`product-service`, `create-product`, `authorization`, `company-scope`, `company-isolation-service`,
`product-input`, `product-field`, `list-query` (`:179-196` afirma que `stock` **no** es ordenable:
se invierte), `list-use-cases`, `product-list-params`, `presentation-actions`, `product-actions`;
`tests/unit/recetas/`: `recipe-service`, `recipe-lines-catalog`; `tests/unit/recetas-ui/`:
`recipe-form`, `recipe-line-unit-group`, `unit-group`; `tests/unit/configuracion-ui/` del formulario
de presentación; `tests/unit/errores/catalogo.test.ts` (`:44`, 46 → 47).

### 12.2 NO los selecciona el grafo: se ponen rojos en el gate completo

| Archivo:línea | Qué afirma hoy | Qué pasa |
|---|---|---|
| `tests/unit/inventario/qc91-alcance.test.ts:200-221` (R1), `:260-304` (R11) | `toProductView` y `findProductRefs` suman lotes con `sumStockByUnit`; `ProductView` expone `stockByUnit` y no `stock`; `PRODUCT_SELECT` trae `batches` y no `stock`; los escritores no escriben `stock` | **ROJO**: D3/D4 derogan esas decisiones. Se reescriben con el argumento escrito (la agregación pasa al recálculo; la lectura va a la columna), sin borrar los detectores de `R21` (`:354-392`), que siguen valiendo |
| `tests/unit/unidades/module-contract.test.ts:623-624` | `ProductView` declara `readonly latestBatchUnitId: UnitId \| null`; el archivo no contiene `readonly unitId` | **ROJO** las dos. Se actualizan con el argumento: el producto vuelve a declarar unidad, **por referencia** y como dato de lectura; `NewProduct` sigue sin ella. `:617` (`ProductRef` sin `unitId`) sigue verde |
| `tests/unit/inventario/product-route-contract.test.ts:376-381` | `HiddenProductField` contiene `'latestBatchUnitId'` | **ROJO**: pasa a `'unitId'` |
| `tests/unit/inventario/schema/inventario-schema.test.ts:259-262`, `:429-438`, `:598`, `:602-603` | `Product` sin `stock`, sin `unitId`, sin `unit_id`, índices exactamente `['products_company_id_idx']`, sin `products_unit_id_idx` | **ROJO** los cuatro. `:893-897` (lote sin unidad) **sigue verde**, y es el argumento de §9.1 |
| `tests/integration/inventario/list-query-indexes.int.test.ts:105-112`, `:257-269` | 33 índices; `products_stock_idx` no existe | **ROJO**: vuelve a `PARTIAL_INDEXES` (34) y el caso «ya no existe» se invierte |
| `tests/integration/inventario/list-query-products.int.test.ts` | dos lotes en dos unidades sobre un producto | **ROJO**: el disparador lo prohíbe; se reescribe con dos productos |
| `tests/integration/inventario/presentation-unit.int.test.ts` | cambiar la unidad de una presentación | **ROJO** si la presentación tiene lotes (R20) |
| Integración con lotes insertados a mano: `inventario/{company-scope,company-scope-queries,inventario-constraints,product-batch-write,product-batch-lot,presentation-uniqueness}.int.test.ts`, `unidades/unidades-constraints.int.test.ts`, `recetas/recetas-constraints.int.test.ts`, `e2e/aislamiento-inventario.spec.ts` | crean producto sin unidad y le cuelgan un lote | **ROJO**: el disparador rechaza lote sobre producto sin unidad. Hay que darle `unit_id` al producto del fixture (la de la presentación) |
| `tests/guards/guard-ambito-empresa-inventario.test.ts:249-340` | cada método del puerto está cableado con su nombre, y toda función que consulta declara y consume `scope` | Corre siempre. **Muerde** si el método renombrado no se cablea igual en `composition` o si `recalculateProductStock` o la lectura de la unidad de la presentación no llevan el ámbito |
| `tests/guards/guard-catalogo-de-errores.test.ts` | cada código de `errors.ts` está en el catálogo | Corre siempre; verde si T2 va entera |
| `tests/integration/aislamiento.json` | censo de archivos de integración | Todo archivo **nuevo** de integración se declara ahí o `guard-aislamiento-integracion` da rojo |

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
7. **QC-92** hereda llamar a `recalculateProductStock` y tomar el mismo bloqueo de fila.

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
