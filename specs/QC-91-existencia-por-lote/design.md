# QC-91 — existencia-por-lote · design.md

> Escrito contra `feature/QC-91-existencia-por-lote`, ramada de `origin/dev` en `433bad2` (ya
> contiene QC-81, QC-90, QC-103 y QC-106). Todas las rutas y los números de línea de este documento
> se midieron **en ese árbol**, no de memoria.

## 1. El censo de `stock`: dónde vive hoy y qué pasa con cada sitio

Esta es la parte que decide el tamaño de la ficha. Quitar `products.stock` **rompe al compilar**,
así que lo que importa no es cuántos archivos «mencionan stock», sino cuáles hablan de
`products.stock` (se van o cambian de forma) y cuáles de `product_batches.stock` (se quedan
intactos y hay que no tocarlos por error).

**Medida:** `stock` (sin distinguir mayúsculas) aparece en **620 ocurrencias / 125 archivos** del
repo, de los que **22 están en `lib/` y `app/`** —la ficha decía 21— más `db/schema.prisma`, tres
migraciones y el resto en `tests/`, `e2e/`, `specs/` y `progress/`.

### 1.1 `lib/` — 15 archivos

| # | Archivo:línea | Qué es | Destino |
|---|---|---|---|
| 1 | `lib/modules/inventario/domain/product-view.ts:22` (`NewProduct.stock`), `:46` (`ProductView.stock`) | contrato de escritura y de lectura del producto | **CAMBIA**: `NewProduct` pierde `stock`; `ProductView.stock` se sustituye por `stockByUnit` (§3.2) |
| 2 | `lib/modules/inventario/domain/product-input.ts:68` (`productFieldsShape.stock`), comentarios `:35`, `:38`, `:44`, `:76` | esquema zod compartido por alta y edición | **CAMBIA**: `productFieldsShape` queda `{ name, qtyAlert }`; el `stock` se muda al esquema del alta (§3.4) |
| 3 | `lib/modules/inventario/domain/product-catalog.ts:19`, `:24-25` (`ProductRef.stock`) | contrato público hacia `recetas` | **CAMBIA**: `stock: number \| null` → `stockByUnit` (§3.3) |
| 4 | `lib/modules/inventario/domain/product-queryable.ts:22` (`sortable`), `:24` (`filterable`) | lista blanca del listado | **CAMBIA**: se cae `stock` de las dos listas (R8 / D2) |
| 5 | `lib/modules/inventario/domain/create-product.ts:126` | escribe `stock` en el producto | **CAMBIA**: se borra esa línea |
| 5b | `lib/modules/inventario/domain/create-product.ts:33`, `:97` | `deriveUnitCost(total, entrada.stock)` y `batch.stock` | **INTACTO**: es la existencia del **lote** |
| 6 | `lib/modules/inventario/domain/update-product.ts:14` | doc «reemplazo completo, `stock` incluido» | **CAMBIA**: sólo el comentario; el caso de uso deja de propagarlo por el tipo |
| 7 | `lib/modules/inventario/domain/product-batch-input.ts:119`, `:137-138`, `:143` | reglas del costo derivado contra la existencia del lote | **CAMBIA una línea**: al perder `productFieldsShape` el campo, el esquema del alta declara `stock` propio; la lógica no cambia |
| 8 | `lib/modules/inventario/domain/product-batch.ts:5` | `NewProductBatch.stock` | **INTACTO** |
| 9 | `lib/modules/inventario/domain/unit-cost.ts:12`, `:77-78`, `:83` | `deriveUnitCost(totalCost, stock)` | **INTACTO**: el `stock` es el del lote |
| 10 | `lib/modules/inventario/adapters/driving/product-actions.ts:83`, `:86`, `:92` | `buildProductFields` lee `stock` del `FormData` para alta **y** edición | **CAMBIA**: `stock` pasa a leerse sólo en `buildCreateProductCandidate` |
| 11 | `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:43` (`PRODUCT_SELECT`), `:57` (`toProductView`), `:75` (`createProduct`), `:109` (`updateAliveProduct`), `:154-155` (`orderBy`), `:181` (filtro), `:496` (`createWithFirstBatch`) | todo el acceso a la columna | **CAMBIA**: § 3.5 |
| 11b | `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:348`, `:397` | `toBatchCreateData` y el comentario del CHECK `23514` | **INTACTO** |
| 12 | `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts:37`, `:45`, `:61`, `:69` | `findRefs` selecciona `stock` | **CAMBIA**: § 3.3 |
| 13 | `lib/modules/inventario/ports/product-repository.ts:81`, `:99` | documentación de que la existencia «viaja dos veces» | **CAMBIA**: sólo comentarios — deja de viajar dos veces, que es el punto de la ficha |
| 14 | `lib/modules/recetas/domain/recipe-view.ts:34`, `:46-47` (`RecipeLineView.productStock`) | contrato del detalle de receta | **CAMBIA**: el tipo aguanta (`number \| null`), la **semántica** y su documentación no (§3.3) |
| 15 | `lib/modules/recetas/domain/get-recipe.ts:39`, `:59` | arma `productStock` desde `ProductRef.stock` | **CAMBIA**: elige la existencia de la unidad de la línea (§3.3) |

### 1.2 `app/` — 7 archivos

| # | Archivo:línea | Qué es | Destino |
|---|---|---|---|
| 16 | `app/(private)/inventario/components/product-columns.tsx:111-115` (`isBelowAlert`), `:124-136` (`stockCell`), `:167-172` (columna «Existencia») | listado: celda y alerta | **CAMBIA**: R6, R16, R17, R18 y pierde `sortable`/`filter` |
| 17 | `app/(private)/inventario/components/product-form.tsx:47` (`INT_FIELDS`), `:90`, `:108`, `:206`, `:258`, `:527-533` (campo «Existencia») | alta **y** edición comparten formulario | **CAMBIA**: el campo sólo se pinta en el alta (§3.4) |
| 18 | `app/(private)/inventario/components/product-list-params.ts:49-50` (`stockMin`/`stockMax`), `:55` (`STOCK_COLUMN_ID`), `:156-160`, `:196-199` | filtro por existencia en la URL | **CAMBIA**: se va entero (D2) |
| 19 | `app/(private)/inventario/components/index.ts:50-52` | barrel que reexporta esas tres constantes | **CAMBIA** |
| 20 | `app/(private)/pedidos/components/order-ingredients-table.tsx:46-50`, `:95-97` (`remainingOf`), `:132` (cabecera «Stock»), `:151-152` | columna de existencia y de restante del pedido | **CAMBIA**: R12, R13, R14 |
| 21 | `app/(private)/pedidos/components/order-form.tsx:380` | comentario sobre lo que trae `findRefs` | **CAMBIA**: sólo el comentario |
| 22 | `app/(private)/pedidos/components/order-decimal.ts:5` | comentario | **INTACTO** |

### 1.3 Base de datos

| Archivo:línea | Qué es | Destino |
|---|---|---|
| `db/schema.prisma:272` (`Product.stock Int?`) | la columna | **SE VA** |
| `db/migrations/20260902005510_products_and_presentations/migration.sql:30`, `:56` | crea la columna y `products_stock_non_negative` | histórico, no se toca |
| `db/migrations/20260904160000_list_query_indexes/migration.sql:83` | `products_stock_idx` (parcial, `deleted_at IS NULL`) | histórico; el índice **se elimina** en la migración nueva |
| `db/migrations/20260909120000_product_batches/migration.sql:22`, `:57` | `product_batches.stock` + su CHECK | **INTACTO** |

### 1.4 Lo que el censo implica para las tasks

`products.stock` está en **12 archivos de `lib/` + 4 de `app/`** en forma de código (no de
comentario). No es un cambio de diez sitios ni de cuarenta: son **~20 archivos de producción**, y
la mitad del trabajo son los tests que hoy afirman lo contrario (`tests/unit/inventario/`,
`tests/integration/inventario/`, `e2e/inventario.spec.ts` con 19 apariciones). Por eso hay tasks
que **no pueden** dejar el árbol compilando por sí solas: están marcadas en `tasks.md`.

## 2. Lo que se comprobó en disco antes de apoyarse en ello

- **`latestBatchUnitId` existe** (QC-80): `lib/modules/inventario/domain/product-view.ts:62`
  (`readonly latestBatchUnitId: UnitId | null`) y se calcula en
  `product-prisma.ts:59` desde `LATEST_BATCH_UNIT` (`product-prisma.ts:32-37`: `orderBy [createdAt
  desc, id desc], take: 1`). Es la unidad del producto para R16.
- **El catálogo de unidades ya está en las dos pantallas**: `app/(private)/inventario/page.tsx:72`
  (`listUnitsAction()`, una sola vez por página) y el pedido ya resuelve etiquetas con
  `unitLabel(line.unitId, units)` (`order-ingredients-table.tsx:149`). **No hace falta ninguna
  consulta nueva** para pintar «10 kg».
- **`Presentation`, `Product` y `ProductBatch` son los tres del módulo `inventario`**
  (`db/schema.prisma:245`, `:267`, `:292`): agregar por `presentation.unitId` **no cruza** ninguna
  frontera de módulo. `units` sí es de otro módulo y se sigue tocando sólo por `unit_id`, como ya
  hace `LATEST_BATCH_UNIT`.
- **`findProductRefs` no tiene ámbito de empresa** y es una excepción declarada y aprobada
  (`product-catalog-prisma.ts:15-31`, QC-49 R29, destino QC-50). **Esta ficha no la cierra ni la
  amplía**: cambia el campo que devuelve, no su alcance.

## 3. Diseño

### 3.1 Migración

`db/migrations/<timestamp>_drop_product_stock/`

```sql
-- migration.sql (UP)
DROP INDEX IF EXISTS "products_stock_idx";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_stock_non_negative";
ALTER TABLE "products" DROP COLUMN "stock";
```

```sql
-- down.sql (DOWN)
ALTER TABLE "products" ADD COLUMN "stock" INTEGER;
ALTER TABLE "products" ADD CONSTRAINT "products_stock_non_negative" CHECK ("stock" >= 0);
CREATE INDEX "products_stock_idx" ON "products" ("stock") WHERE "deleted_at" IS NULL;
```

El `down.sql` **restaura la forma, no los datos**: los valores se pierden y vuelven como `NULL`.
Es exactamente el riesgo que D11 acepta por escrito, y se repite aquí para que nadie lo descubra
ejecutando el rollback. No hay RLS nueva ni tabla nueva: no se crea nada, sólo se quita.

**Índice para el cálculo:** ninguno nuevo. La agregación entra por `product_id` y ya existe
`product_batches_product_id_idx` (`db/schema.prisma:316`), más `product_batches_company_id_idx`
para el ámbito. Si el listado se volviera lento, el índice que faltaría sería
`(product_id, presentation_id)`; hoy sería especular.

### 3.2 El contrato de lectura del producto

El tipo y la suma viven en un archivo propio del dominio, **no dentro de `product-view.ts`**,
porque los usan los dos contratos —el de lectura del listado y el público hacia `recetas`— y
ninguno de ellos debe importar del otro:

```ts
// lib/modules/inventario/domain/product-stock.ts  (nuevo)
export type ProductStockByUnit = {
  readonly unitId: UnitId;
  /** Entera: es la suma de existencias enteras de lotes (R3). */
  readonly quantity: number;
};

/** Pura: agrupa filas `{ stock, unitId }` por unidad y ordena (ver más abajo). */
export function sumStockByUnit(
  rows: readonly { readonly stock: number; readonly unitId: UnitId }[],
): readonly ProductStockByUnit[];
```

```ts
// lib/modules/inventario/domain/product-view.ts
export type ProductView = {
  // ...
  readonly stockByUnit: readonly ProductStockByUnit[];   // sustituye a `stock: number | null`
  readonly latestBatchUnitId: UnitId | null;             // intacto (QC-80)
};
```

**Se renombra a propósito**, con el mismo criterio con el que QC-80 renombró `unitId` →
`latestBatchUnitId`: dejar `stock` con un significado nuevo sería un cambio invisible para el
compilador. Con el nombre nuevo, `pnpm run typecheck` obliga a visitar los 20 sitios del censo.

**Array vacío ⇒ el producto no tiene ningún lote.** No hace falta bandera aparte: todo lote tiene
presentación y toda presentación tiene unidad (`presentations.unit_id` es `NOT NULL`), así que
«tiene lotes» y «tiene alguna existencia por unidad» son la misma cosa. Eso es lo que distingue
R14 (0, se calcula) de R13 («—»).

**Orden del array:** cantidad descendente y, a igualdad, `unitId` ascendente. Determinista, para
que el test pueda afirmar «10 kg · 20 L» sin depender del orden en que Postgres devolvió las filas.

`NewProduct` pierde `stock`: el producto ya no tiene existencia que escribir.

### 3.3 El contrato hacia `recetas` y el pedido

```ts
// lib/modules/inventario/domain/product-catalog.ts
export type ProductRef = {
  readonly id: ProductId;
  readonly name: string;
  readonly stockByUnit: readonly ProductStockByUnit[];   // sustituye a `stock`
};
```

`recetas` no cambia de forma hacia fuera: `RecipeLineView.productStock` sigue siendo
`number | null` y `order-ingredients-table.tsx` sigue restando sobre él. Lo que cambia es **cómo se
elige**, en `get-recipe.ts` (dominio puro, testeable sin base):

| Situación | `productStock` | Pantalla |
|---|---|---|
| El producto no está vivo (no vuelve en `findRefs`) | `null` | «—» (comportamiento de hoy, R18 de QC-24) |
| `stockByUnit` vacío (sin lotes) | `0` | 0, y el restante se calcula: negativo en rojo (R14) |
| `stockByUnit` tiene la unidad de la línea | esa cantidad | resta normal (R12) |
| `stockByUnit` no vacío y sin la unidad de la línea | `null` | «—» en existencia y en restante (R13) |

Las tres últimas filas son D9 literal. La primera ya existía y no se toca.

### 3.4 Alta y edición

- `productFieldsShape` (`product-input.ts:66`) queda `{ name, qtyAlert }`. `createProductSchema` y
  `updateProductSchema` heredan el recorte: enviar `stock` a la edición es `invalid_input` porque
  el esquema es `strictObject` (R9) — no hace falta ninguna regla nueva, basta con quitar el campo.
- `createProductWithFirstBatchSchema` (`product-batch-input.ts:99`) **declara `stock` por su
  cuenta** con el mismo `z.number().int().min(0)` de hoy. El `superRefine` del costo derivado no se
  toca.
- `product-form.tsx`: `INT_FIELDS` se parte en `PRODUCT_INT_FIELDS = ['qtyAlert']` y el `stock` se
  suma a `BATCH_FIELDS`, que ya es «sólo en el alta». El campo «Existencia» se pinta únicamente
  cuando `product === undefined`, y su texto de ayuda deja de decir «se guarda tal cual»
  (`product-form.tsx:531`): ahora es la existencia **del lote** que se está dando de alta.
- `product-actions.ts`: `buildProductFields` deja de leer `stock`; lo lee
  `buildCreateProductCandidate`. La edición (`buildUpdateProductCandidate`) ya no lo ve.

### 3.5 La consulta del listado

Hoy `PRODUCT_SELECT` ya trae los lotes, pero sólo el más reciente (`take: 1`). Se amplía a **todos
los lotes del producto, con su unidad**, en la **misma** consulta:

```ts
const BATCH_STOCK_BY_UNIT = {
  select: { stock: true, presentation: { select: { unitId: true } } },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
} satisfies Prisma.Product$batchesArgs;
```

`toProductView` (función pura, `product-prisma.ts:52`) sigue siendo el traductor: la primera fila
da `latestBatchUnitId` —el `orderBy` es el mismo de hoy, así que R22 de QC-80 no cambia— y todas
juntas alimentan `sumStockByUnit(rows)`, **función pura en `domain/`**, que es donde
`CHECKPOINTS.md > Módulos hexagonales` exige que viva la lógica.

`findProductRefs` hace la misma lectura para los ids que le pasan, reutilizando `sumStockByUnit`.

**Lo que cuesta, dicho aquí:** una fila por lote y por producto de la página, en vez de una sola.
Con los volúmenes de hoy (el alta crea un lote por producto) es irrelevante; cuando un producto
acumule cientos de lotes habrá que pasar a agregación en la base. Queda anotado, no resuelto.

### 3.6 La alerta

`isBelowAlert` (`product-columns.tsx:111`) pasa a:

1. Si `qtyAlert` no es número → `false` (R18, y es el comportamiento de hoy).
2. Existencia a comparar = la de `latestBatchUnitId` dentro de `stockByUnit`; si no hay lotes
   (`stockByUnit` vacío, `latestBatchUnitId === null`) → **0** (R17).
3. Marca cuando `qtyAlert > existencia`.

El caso 2 con lotes pero sin entrada para `latestBatchUnitId` **no puede ocurrir**: si hay lote más
reciente, su unidad está en el agregado por construcción. Se codifica como `?? 0` y se prueba, para
que no dependa de razonamiento.

Sigue siendo **presentación**, no columna: `inventario-schema.test.ts` prohíbe `isBelowAlert` como
campo del esquema y eso no cambia.

### 3.7 Permisos, empresa y RLS

Nada nuevo (D14). El listado entra por `requirePagePermission('inventario.consultar')`
(`app/(private)/inventario/page.tsx:57`) y la autorización real sigue en el service; el detalle de
receta ya exige `recetas.consultar` en `get-recipe.ts:28`. El ámbito de empresa del listado sigue
saliendo de `productCompanyScope(scope)`, y los lotes cuelgan del producto ya filtrado, así que no
hace falta un segundo filtro. `findProductRefs` continúa sin ámbito, con su excepción ya escrita
(§2).

### 3.8 El orden del trabajo: aditivo primero, retirada después

Cambiar `stock` por `stockByUnit` de golpe rompe a la vez el esquema, el adaptador, el listado, el
formulario, el detalle de receta y el pedido: una sola task gigante que no se puede verificar por
partes. Se hace al revés: los contratos **ganan `stockByUnit` junto a `stock`**, cada consumidor se
muda en su propia task —y el árbol compila tras cada una— y al final **una sola task atómica**
retira `stock` de los contratos, del formulario de edición, del orden/filtro y de la base.

Esa última task **no se puede partir y no deja el árbol compilando a mitad**, y se dice en
`tasks.md` en vez de fingir lo contrario: quitar `NewProduct.stock` rompe simultáneamente
`product-prisma`, `product-actions`, `create-product`, `product-form` y la columna del listado. Es
exactamente lo que le pasó a QC-88 con T4/T5; la diferencia es que aquí está declarado antes.

### 3.9 Multiplataforma

La única UI nueva es texto: «10 kg · 20 L» en una celda que ya existe. Se apila en pantallas
estrechas con las utilidades de Tailwind ya usadas; no hay `hover`, ni target táctil nuevo, ni
`100vh`. No se pide ninguna excepción de escritorio.

## 4. Dependencias

**Ninguna nueva** (D17, R23). No hay ninguna utilidad que reimplementar: la suma es
`Array.prototype.reduce` sobre enteros —no hay decimales, D4 fija que la existencia es entera— y el
resto ya lo resuelven Prisma y zod, que están aprobadas en `docs/dependencias.md`. `package.json`
no se toca, y la guardia `guard-dependencias-aprobadas` seguirá verde sin tocar el registro.

## 5. Alternativas descartadas

1. **Mantener `products.stock` como caché denormalizada**, actualizada por trigger o por el caso de
   uso al escribir un lote. Descartada: contradice D6 y es exactamente el fallo que QC-90 dejó
   abierto —un número que puede discrepar de sus lotes—. Además obligaría a tocar cada camino de
   escritura de lote, presente y futuro (QC-92 incluida), para mantenerla honesta.
2. **Una sola existencia total, convirtiendo todas las unidades a una base** (500 g + 10 kg =
   10,5 kg). Descartada: D7 y la pregunta abierta 1 del dominio dejan la conversión en QC-76 con
   **QC-63 como único consumidor**; inventario trata la unidad como anotativa. Además devolvería
   gratis el orden y el filtro por existencia, lo que la hace tentadora — y por eso conviene decir
   que se descartó a sabiendas de ese premio.
3. **Agregar en la base con `$queryRaw ... GROUP BY presentation.unit_id`**. Descartada: duplicaría
   a mano el predicado de empresa que `company-scope.ts` centraliza —el sitio exacto por donde se
   escapan las filas ajenas—, perdería el tipado de Prisma y aun así haría falta una segunda
   consulta para el lote más reciente, que hoy viaja en la misma. Se acepta a cambio el coste de
   §3.5, que es real.
4. **Publicar en `ProductRef` sólo un `stock` total sumando todas las unidades**, para no cambiar
   la forma del contrato. Descartada: haría imposible R12 y R13 —el pedido necesita la existencia
   **de la unidad de la línea**— y volvería a sumar peras con litros, que es justo lo que D7 evita.

## 6. Riesgos y colisiones conocidas

- **`tests/unit/unidades/module-contract.test.ts` roza este cambio y hay que mirarlo.** Afirma
  `expect(catalogo).not.toMatch(/unitId/)` sobre `domain/product-catalog.ts` (`:617`) y
  `not.toMatch(/readonly unitId/)` sobre `product-view.ts` (`:624`). Con `ProductStockByUnit` en su
  **archivo propio** (§3.2), ninguno de los dos archivos escribe la cadena `unitId` —escriben
  `stockByUnit` y `ProductStockByUnit`—, así que en principio **las dos asertivas siguen verdes**.
  Eso hay que **verificarlo al implementar, no darlo por hecho**. Si alguna se pone roja, no se
  toca a la ligera: se actualiza con el argumento escrito —lo que prohíbe es que el **producto**
  declare *su* unidad, y menos como texto, y eso se sigue cumpliendo: `NewProduct` no gana ninguna
  unidad y no aparece ningún campo `unit:` de texto—, igual que QC-80 la actualizó en vez de
  borrarla. Colocar el tipo aparte **no** es para esquivar la guardia: es porque lo comparten los
  dos contratos. Que además no la despierte es una consecuencia, y se dice aquí para que nadie la
  descubra como sorpresa.
- **La existencia escrita a mano se pierde sin aviso** (D11). Asumido por decisión humana.
- **`e2e/inventario.spec.ts`** asume existencia editable del producto en 19 sitios: hay que
  reescribir esos flujos, no sólo añadir el de R22.
- **QC-88 vive en pedidos/asignaciones.** Esta ficha toca `app/(private)/pedidos/components/
  order-ingredients-table.tsx`, `order-form.tsx` (un comentario) y `lib/modules/recetas/domain/`.
  **No toca** `lib/modules/pedidos/` ni `lib/modules/asignaciones/`. El leader cruza esta lista en
  F1.4.
