# QC-123 — el-total-del-pedido-decidir-donde-vive-el-precio · design.md

> Diseño técnico de los requisitos `R1`–`R23` de `requirements.md`. El Alcance y las decisiones
> cerradas vienen de `/afinar-feature` (2026-09-18) y aquí no se reabren: lo que este archivo
> decide es lo que la acotación dejó explícitamente para el diseño —cómo habla `pedidos` con
> `inventario`, dónde vive el cálculo, la migración y la aritmética—.

---

## 0. Lo verificado en el código (no supuesto)

Todo lo de esta sección se leyó en esta rama el 2026-09-18.

| Hecho | Dónde |
|---|---|
| `Order` tiene **un solo decimal**: `quantity Decimal(14,4)`. No hay precio, ni unidad, ni importe | `db/schema.prisma:536-560` (`quantity` en `:541`) |
| `orders` ya tiene `companyId`, borrado lógico y marcas de tiempo; su unicidad de correlativo es `(company_id, order_year, order_sequence)` | `db/schema.prisma:547`, `:552`, `:554` |
| `ProductBatch.stock` es **`Int`**; `unitCost` es `Decimal(14,4)`; `lot` es `String` (texto exacto, único por empresa); `purchaseDate` es `@db.Date` **obligatoria**; `expiryDate` es opcional | `db/schema.prisma:295-324` (`:299`, `:300`, `:302`, `:305`, `:306`, `:317`) |
| El lote **no** declara unidad: la unidad del lote es la de su **presentación** (`presentation.unitId`) | `db/schema.prisma:298`, `:313-314`; consulta real en `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts:60-71` |
| `Presentation` tiene nombre y `unitId` y **no declara cuánto contiene** — el caso «bidón» de `[D6]`, y la razón de QC-130 | `db/schema.prisma:248-263` |
| `RecipeLine` tiene `quantity Decimal(14,4)`, `productId` y `unitId`, y **no** tiene `companyId` (hereda la de su receta) | `db/schema.prisma:394-409` (`:397-399`) |
| `convertQuantity` está publicada por el contrato de `unidades` y es **dominio puro** (BigInt, sin dependencias); lanza `IncompatibleUnitsError` si las unidades no comparten base efectiva | `lib/modules/unidades/index.ts:55`; implementación en `lib/modules/unidades/domain/convert-quantity.ts:188-210`, incompatibilidad en `:197-202` |
| `UnitRef` publica `baseUnitId` y `factor` (texto), que es exactamente lo que pide `UnitConversion`; `UnitCatalog.findRefs(ids, companyId)` los devuelve acotados a empresa o de sistema | `lib/modules/unidades/domain/unit-catalog.ts:8-21`, `:38` |
| `pedidos` **ya consume el contrato público de `recetas`** (`RecipeCatalog`) en alta, edición, ficha y listado; nunca toca `prisma.recipe` | `lib/modules/pedidos/domain/create-order.ts:8,29-33,89`; `update-order.ts:7,71`; `get-order.ts:7,84`; `list-orders.ts:13,146,157` |
| `RecipeCatalog.findExecutionContentById` **ya devuelve las líneas** con `productId`, `quantity` (texto) y `unitId` | `lib/modules/recetas/domain/recipe-catalog.ts:43-46`, `:60-65` |
| `inventario` **ya publica** `ProductCatalog` por su barrel, y **otro módulo ya lo consume**: `asignaciones` lo recibe cableado desde composición | `lib/modules/inventario/index.ts:84`; `lib/composition/index.ts:712`, `:1092`, `:1099` |
| Hoy `ProductCatalog` **no** expone coste ni lotes: `ProductRef` es `{id, name, stockByUnit}` y dice a propósito que no expone costo | `lib/modules/inventario/domain/product-catalog.ts:9-26` |
| La lectura interna de lotes existe pero **`ProductBatchView` no lleva `unitCost`** | `lib/modules/inventario/domain/product-batch-view.ts:1-8`; consulta en `.../product-prisma.ts:610-623` |
| El decimal entra y sale de `orders` como **cadena** por un único par de funciones, con `.toFixed(4)` a la salida | `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts:70-77` |
| El `select` de las dos lecturas de pedido es único (`ORDER_SELECT`) y el mapeo a `OrderRow` también | `.../order-prisma.ts:52-65`, `:82-96` |
| La edición es un `updateMany` con ámbito y `deletedAt: null` en el `where` | `.../order-prisma.ts:508-527` |
| El alta inserta por SQL crudo con `RETURNING`, bajo lock de aviso por `(empresa, año)` | `.../order-prisma.ts:163-224` |
| `OrderView` documenta que **no hay campo `total`** y por qué (QC-34/QC-68) | `lib/modules/pedidos/domain/order-view.ts:76-78` |
| El catálogo de permisos son **quince**, cerrados; el Operador tiene exactamente `inventario.consultar` y `asignaciones.consultar` | `lib/modules/identity/domain/permissions.ts:38-130`, `:165` |
| El punto 4 de `docs/architecture.md > Preguntas abiertas del dominio` **ya trae escrita la enmienda de QC-123** | `docs/architecture.md:129-142` |
| El precedente que la acotación manda contrastar: «no nace ningún puerto de `proveedores` hacia `inventario`» (QC-52 D3, reafirmado por QC-59) | `specs/QC-59-aislamiento-por-empresa-en-proveedores/requirements.md:325` |

**Hallazgo H1 (importa al diseño).** `lot` es **texto libre** cuando se teclea a mano y
**correlativo numérico sin relleno de ceros** cuando lo genera el backend
(`lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:298-321`). Ordenar por
`lot` como texto pone `'10'` antes que `'9'`. Ver `> 5.2`.

**Hallazgo H2 (importa al diseño).** Un producto puede tener lotes en **presentaciones con
unidades distintas** —`sumStockByUnit` existe justamente porque la existencia se agrupa por
unidad (`lib/modules/inventario/domain/product-catalog.ts:24-25`)—. El cálculo no puede asumir
una unidad única por producto. Ver `> 5.3`.

---

## 1. Cómo habla `pedidos` con `inventario` (pregunta abierta 3)

**Decisión: `pedidos` consume el CONTRATO PÚBLICO de `inventario` (`ProductCatalog`), que gana un
segundo método. NO nace ningún puerto nuevo en `lib/modules/pedidos/ports/`.**

Mecanismo, idéntico al que `pedidos` ya usa con `recetas`:

1. `inventario` amplía su tipo publicado `ProductCatalog` con `findCostingBatches(...)`
   (`lib/modules/inventario/domain/product-catalog.ts`, reexportado por el barrel `index.ts:84`).
2. Lo implementa un **adaptador driven de `inventario`** —el único autorizado a tocar
   `prisma.productBatch`, por `/// @module inventario` (`db/schema.prisma:294`)—.
3. Lo **cablea `lib/composition`**, que ya construye `productCatalog` en `:712` y ya se lo pasa a
   `recetas` y a `asignaciones`. `pedidos` gana `products: productCatalog` en dos factories.
4. `pedidos/domain` solo conoce el **tipo** `ProductCatalog` importado por el barrel
   (`@/lib/modules/inventario`), nunca ruta profunda, nunca Prisma.

**Por qué esto y no un puerto `pedidos → inventario`.** `docs/architecture.md > Dominio` n.º 2 dice
que los módulos «comparten **servicios vía interfaz**, nunca repositorios ni tablas». Un puerto en
`pedidos/ports/` sería una **segunda definición**, escrita por `pedidos`, de datos que son de
`inventario`; sería además la puerta por la que el cableado del `where` de empresa se escaparía del
módulo dueño. El contrato publicado ya es el mecanismo previsto y ya tiene dos consumidores.

**Por qué esto no contradice QC-52 D3** (`specs/QC-59-.../requirements.md:325`). Lo que QC-52 quitó
fue una consulta que **había dejado de tener sentido en su dominio**: la línea de catálogo de
proveedor pasó a ser artículo de **texto libre**, y el dato de `inventario` dejó de formar parte de
la feature; volver a atarlos «contradiría la ficha entera», y la frontera que quedaba —que la
presentación sea de la misma empresa— la puso la base con una FK compuesta, sin un solo `SELECT`.
Aquí la relación es la inversa y no es opcional: **el importe del pedido es, por definición
`[D1]`, coste de lotes de inventario**. No hay ninguna otra fuente, ni hay ninguna restricción de
base que pueda sustituir una lectura. Y —lo que más importa— **no se está creando un acoplamiento
nuevo de módulo a módulo por una vía nueva**: se usa la vía que `inventario` ya publica y que
`asignaciones` ya usa (`lib/composition/index.ts:1092`). La regla que QC-52 defiende —«no ates dos
módulos por un dato que uno de ellos ya no necesita»— sigue intacta.

### 1.1 El contrato nuevo

```ts
// lib/modules/inventario/domain/product-catalog.ts  (AMPLIACIÓN)

/** Un lote con existencia, visto desde fuera de `inventario` para costear. `stock` es `Int` en
 *  la base; `unitCost` viaja como cadena decimal; `unitId` es el de la PRESENTACIÓN del lote;
 *  `purchaseDate` en `YYYY-MM-DD` (la columna es `@db.Date`, sin hora). */
export type CostingBatch = {
  readonly productId: ProductId;
  readonly lot: string;
  readonly stock: number;
  readonly unitCost: string;
  readonly unitId: string;
  readonly purchaseDate: string;
};

export interface ProductCatalog {
  findRefs(ids: readonly ProductId[], companyId: string): Promise<readonly ProductRef[]>;

  /** Lotes CON EXISTENCIA (`stock > 0`) de los productos pedidos, de productos vivos y de esa
   *  empresa. Un producto sin lotes con existencia simplemente no aparece. NO ordena: el orden
   *  del cálculo es criterio de negocio de quien costea. */
  findCostingBatches(
    ids: readonly ProductId[],
    companyId: string,
  ): Promise<readonly CostingBatch[]>;
}
```

Una sola consulta para **todos** los productos de la receta (`productId in [...]`), como el
listado de pedidos hace con las recetas (`list-orders.ts:150-157`): el número de consultas no
crece con el número de ingredientes.

`where`: `batchCompanyScope(scope)` **AND** `{ productId: { in }, stock: { gt: 0 }, product: {
deletedAt: null } }`; `select`: `productId, lot, stock, unitCost, purchaseDate, presentation: {
select: { unitId: true } }`. Índices que ya existen y sirven: `product_batches_product_id_idx`
(`db/schema.prisma:319`) y `product_batches_company_id_idx` (`:318`). **No hace falta índice
nuevo**: son lotes de un puñado de productos, no una ruta caliente paginada.

---

## 2. Dónde vive el cálculo y cómo se prueba sin base

**El cálculo es dominio puro de `pedidos`**: `lib/modules/pedidos/domain/order-cost.ts`, una
función sin estado, sin reloj, sin Prisma y sin framework, que recibe **datos ya leídos** y
devuelve `string | null`.

```ts
export type CostInput = {
  readonly orderQuantity: string;                    // pedido: Decimal(14,4) como texto
  readonly lines: readonly RecipeCostLine[];         // {productId, quantity, unitId}
  readonly batches: readonly CostingBatch[];
  readonly units: ReadonlyMap<string, UnitConversion>;
};

/** `null` = sin importe, indistinguible entre los cinco casos (R8, R9). */
export function calculateIngredientsCost(input: CostInput): string | null;
```

Quien la llama (`create-order.ts`, `update-order.ts`) hace las lecturas y le pasa el resultado.
Así el **99 % de los casos de prueba son de unidad, sin base**: cubierta justa, existencia justa,
existencia insuficiente por una milésima, dos lotes con el mismo `purchase_date`, unidades que
comparten base, unidades que no, receta sin líneas, producto sin lotes.

Esto cumple `CHECKPOINTS.md > Módulos hexagonales` («la lógica de negocio está en `domain/`, no en
la Server Action») y es lo contrario del anti-patrón de `docs/architecture.md` («lógica de negocio
dentro de componentes o handlers»).

### 2.1 Aritmética decimal: por qué a mano y sin dependencia

`[D14]` cierra que **no entra `decimal.js` ni ninguna otra dependencia**. El cálculo necesita
multiplicar (`cantidad de línea × cantidad de pedido`, `coste unitario × cantidad`) y dividir
(promedio de `n` lotes). Restricciones verificadas:

- `domain/` **no puede** importar `@prisma/client` (`docs/architecture.md > La regla de
  dependencias`), así que `Prisma.Decimal` está fuera de alcance ahí.
- `number` está prohibido para importes (`docs/architecture.md > Anti-patrones`).

Se usa **`BigInt` sobre enteros escalados**, exactamente el patrón que `unidades` ya emplea y que
QC-76 aprobó con el mismo argumento (`convert-quantity.ts:50-153`, decisión cerrada 26 de QC-76).
No se reimplementa una librería del stack: `Prisma.Decimal` **existe** pero es inalcanzable desde
la capa donde vive la regla de negocio, y eso es justo lo que `docs/architecture.md >
Anti-patrones` pide que el `design.md` explique.

**Dependencias nuevas: ninguna.** No se dispara la puerta de
`docs/architecture.md > Dependencias de terceros`, no se añade fila a `docs/dependencias.md` y
`package.json` no cambia.

**Escala y redondeo.** Se calcula a **escala interna 12** —la misma que `CONVERSION_SCALE`
(`convert-quantity.ts:34`)— y se redondea **una sola vez, al final**, a **4 decimales, medio
hacia arriba** (`HALF_UP`), que es la escala de la columna. El redondeo vive en una constante con
nombre en `order-cost.ts`, no repartido por el cálculo.

---

## 3. Modelo de datos y migración

**Columna nueva, y solo una** (`R20`, `[D16]`, `[D9]`):

```prisma
model Order {
  // ...
  /// Coste de los ingredientes de la receta del pedido, con los lotes del momento en que se
  /// escribió. NULL = no se pudo calcular; nunca 0.
  ingredientsCost Decimal? @map("ingredients_cost") @db.Decimal(14, 4)
}
```

- **Nombre.** `ingredients_cost` / `ingredientsCost`, en inglés y `snake_case` en la base
  (`[D16]`, `docs/conventions.md > Nombres`). **No** se llama `total` ni `price` ni `amount`:
  `[D1]` deroga la premisa del precio, y un nombre neutro invitaría a volver a leerlo como precio
  de venta. `docs/architecture.md:129-142` ya avisa de lo que costó esa confusión.
- **Opcional** (`R13`): las filas existentes quedan en `NULL`. La migración **no** rellena nada,
  **no** pone `0` y **no** tiene `UPDATE`.
- **Sin `CHECK` de no-negativo.** Un coste nunca es negativo, pero `unit_cost` ya lo garantiza
  aguas arriba con su propio `CHECK` (`db/schema.prisma:292-293`) y un `CHECK` aquí convertiría un
  error de cálculo en un `23514` sin traducir a mitad de un alta. Se prueba en el dominio.
- **Sin moneda** (`R16`, `[D11]`): ninguna columna nueva más.
- **Sin RLS nueva ni columna de empresa nueva**: `orders` ya tiene las dos
  (`db/schema.prisma:547`). `tests/guards/guard-empresa-en-esquema.test.ts` no cambia.

`db/migrations/<ts>_orders_add_ingredients_cost/`:

```sql
-- migration.sql (UP)
ALTER TABLE "orders" ADD COLUMN "ingredients_cost" DECIMAL(14,4);
```

```sql
-- down.sql (DOWN)
ALTER TABLE "orders" DROP COLUMN "ingredients_cost";
```

El DOWN es **destructivo a conciencia**: revertir borra los importes calculados. Es aceptable
porque son **derivados y recalculables** editando el pedido, que es justo lo que `[D8]` dice que
pasa. Queda escrito aquí para que nadie lo descubra al hacer rollback.

**Índice: ninguno.** `[D12]` cierra que no se ordena ni se filtra por el importe, y un índice
sobre una columna que nadie usa en un `where` es peso muerto en cada escritura.

---

## 4. El cálculo, paso a paso

Entrada: el pedido (`quantity`), las líneas de su receta, los lotes con existencia de esos
productos, y las unidades implicadas.

1. **Sin líneas → `null`** (`R8`, `[D7]`). Se comprueba primero y no se lee nada más.
2. Para **cada línea**:
   1. `necesaria = línea.quantity × pedido.quantity` (`R2`, `[D2]`).
   2. Lotes de ese `productId`, **ordenados** por `purchase_date` ascendente y desempatados por
      número de lote (`R3`, `[D3]`, ver `> 5.2`).
   3. Para cada lote, **normalizar a la unidad de la línea** (ver `> 5.3`). Si alguna unidad no
      comparte base → **toda la función devuelve `null`** (`R7`, `R8`, `[D6]`).
   4. Acumular existencia normalizada **hasta cubrir** `necesaria`; el lote que la cubre es el
      último usado. Si al agotar los lotes **no se cubre** → `null` (`R8`, `[D5]`).
   5. `costeLínea = promedioSimple(costesUnitariosNormalizados de los lotes USADOS) × necesaria`
      (`R5`, `[D4]`).
3. `importe = Σ costeLínea`, redondeado una sola vez a 4 decimales. **Si el resultado redondeado
   no cabe en `Decimal(14,4)` → `null`** (`R24`, `[D17]`, quinto caso): se comprueba **aquí**, en
   el dominio, antes de que el valor llegue al puerto.
4. En **cualquier** camino de fallo se devuelve `null`, sin dato de diagnóstico en la salida
   (`R9`). El motivo sí puede ir al **registro del servidor** como diagnóstico, nunca al
   navegador — mismo criterio que `convert-quantity.ts:196-201` y `docs/conventions.md > Manejo de
   errores`.

**El cálculo solo LEE** (`R22`): no llama a ninguna escritura de `inventario`, y el contrato nuevo
(`> 1.1`) es de solo lectura por construcción — no hay método que mueva existencia al alcance de
`pedidos`.

---

## 5. Los tres puntos finos

### 5.1 De dónde salen las líneas de la receta

Se **reutiliza** `RecipeCatalog.findExecutionContentById(id, companyId)`
(`lib/modules/recetas/domain/recipe-catalog.ts:43-46`), que ya devuelve `lines` con `productId`,
`quantity` y `unitId`, y que ya trata la receta dada de baja devolviéndola con `isDeleted: true` en
vez de `null` — lo que hace falta aquí, porque editar un pedido viejo con receta de baja es legal
(`update-order.ts:66-73`).

**Coste aceptado:** ese método trae también `steps` (Json), que este cálculo no usa. Se acepta en
vez de añadir un tercer método casi idéntico al contrato de `recetas`: un contrato público se
amplía cuando alguien lo necesita, no para ahorrar una columna
(`lib/modules/inventario/domain/product-catalog.ts:11-13` fija ese criterio en el repo).
**Alternativa descartada:** `findCostingLines(...)` nuevo en `RecipeCatalog` — descartada porque
duplicaría el 90 % de un método existente y crearía dos verdades sobre «qué es una línea de
receta vista desde fuera».

### 5.2 El desempate por número de lote (hallazgo H1)

`[D3]` dice «desempata el número de lote, que es correlativo por empresa (QC-81)». Verificado: la
columna es `String` y el correlativo se genera **sin relleno de ceros**
(`product-prisma.ts:298-321`), así que `'10' < '9'` en orden de texto.

**Decisión cerrada `[D18]` (humano, 2026-09-18, al aprobar el spec): se adopta esta propuesta.** El
desempate lo hace el **dominio**, no el `ORDER BY` de SQL, y compara **numéricamente cuando los dos
números de lote son solo dígitos**; si alguno trae cualquier otro carácter, compara **como texto**
(`R25`). Es determinista en los dos casos, respeta la intención de `[D3]` para la serie que el
backend genera, y es **puro y testeable sin base**. Por eso `findCostingBatches` **no ordena**
(`> 1.1`): el orden es criterio de negocio de quien costea.

**No se toca la generación de lotes de QC-81 y no se migra nada**: el problema se resuelve en el
comparador, no en los datos.

### 5.3 Unidades distintas por lote (hallazgo H2) y dirección de la conversión

**Decisión cerrada `[D19]` (humano, 2026-09-18, al aprobar el spec).** Se convierte **la cantidad Y
el coste unitario**, los dos, a la unidad de la línea de receta (`R26`). Un lote a **20.000 por
bidón de 20 L son 1.000 por litro**. El porqué, escrito para que nadie lo «simplifique» después:
**convertir la cantidad sin convertir el coste promedia números que miden cosas distintas, y el
importe sale mal sin avisar** — no falla, no lanza, solo da un número equivocado.

Todo se normaliza **a la unidad de la línea de receta**, que es la única común a todos los lotes
de ese ingrediente:

- `existenciaNormalizada = convertQuantity(String(stock), unidadDelLote, unidadDeLínea)`.
- `costeUnitarioNormalizado = unitCost × convertQuantity('1', unidadDeLínea, unidadDelLote)`,
  es decir, cuántas unidades-de-lote caben en una unidad-de-línea. (Un litro a 8 por litro y una
  receta en mililitros: `1 ml` son `0.001 L`, luego `0.008` por mililitro.)

`convertQuantity` lanza `IncompatibleUnitsError` cuando no comparten base
(`convert-quantity.ts:197-202`); el cálculo lo **captura** y devuelve `null` (`R7`, `R8`) —no lo
propaga: un ingrediente incosteable no es un error de la edición, es un pedido sin importe
(`[D5]`). No hay `catch` vacío: se devuelve `null` y se anota el diagnóstico en el log.

Las `UnitConversion` salen de `UnitCatalog.findRefs(ids, companyId)`
(`unit-catalog.ts:38`), con **una sola llamada** para todas las unidades implicadas (las de las
líneas más las de los lotes, deduplicadas).

**Retroceso consciente sobre QC-35bis.** `pedidos` **recupera** la dependencia `units` que aquella
ficha le quitó a propósito el 2026-09-07 —al salir la unidad del pedido «se cayó la única razón por
la que `pedidos` hablaba con ese módulo» (`lib/modules/pedidos/domain/order-view.ts:13-17`)—. Se
vuelve atrás con un motivo nuevo y real: `[D6]` exige convertir, y convertir exige saber de qué
unidad deriva cada una y con qué factor, que es lo que `UnitCatalog` publica. **El humano lo dio
por bueno al aprobar el spec (2026-09-18)**: es consecuencia directa de `[D6]`. Lo que NO vuelve es
la unidad *del pedido*: `orders` no recupera ninguna columna de unidad y `NewOrder` sigue sin
declararla.

---

## 6. Rutas, contratos de entrada y salida

**No nace ninguna ruta, ningún endpoint y ninguna Server Action.** La feature entra por los casos
de uso que ya existen.

### 6.1 Escritura

| Caso de uso | Cambio |
|---|---|
| `createOrder` (`domain/create-order.ts`) | Tras `requirePermission` y la validación (`R23`), calcula y pasa el importe al puerto. `CreateOrderDeps` gana `products: ProductCatalog` y `units: UnitCatalog` |
| `updateOrder` (`domain/update-order.ts`) | Ídem, **recalcula** en cada edición (`R11`). `UpdateOrderDeps` gana los dos |
| `cancelOrder`, `deleteOrder` | **No cambian.** Cancelar y borrar no son ediciones del contenido: `[D8]` habla de la edición, y el importe queda como estaba |

`NewOrder` **no** gana el importe: no es un dato de entrada y el tipo no debe poder expresarlo
—mismo criterio que la empresa y los autores (`order-view.ts:20-38`)—. El importe viaja como
**parámetro aparte** del puerto:

```ts
create(data, year, actorId, now, ingredientsCost: string | null, scope): Promise<OrderRow | 'duplicate_number'>
updateAlive(id, data, actorId, now, ingredientsCost: string | null, scope): Promise<'ok' | 'not_found'>
```

`scope` sigue **al final** de la firma: `tests/guards/guard-ambito-empresa-pedidos.test.ts`
lo vigila y la posición no se toca.

### 6.2 Lectura

- `OrderRow` y `OrderView` ganan `ingredientsCost: string | null` (`R14`, `R19`).
  `OrderSummary` es alias de `OrderView` (`order-view.ts:101`), así que ficha y listado lo
  devuelven por construcción y no pueden divergir.
- `ORDER_SELECT` (`order-prisma.ts:52-65`) gana `ingredientsCost: true`; `toOrderRow`
  (`:82-96`) lo mapea con **`fromDecimal`** para la escala exacta, y `null` sigue siendo `null`
  (`R8`): `null` **nunca** se convierte a `'0.0000'`.
- **Ninguna lectura calcula nada** (`R12`): `getOrder` y `listOrders` no reciben `products` ni
  `units` y no pueden recalcular aunque quieran.

### 6.3 Lo que NO cambia

- `ORDER_QUERYABLE` (`domain/order-queryable.ts`) **no** gana el campo (`R17`, `[D12]`): una
  consulta que ordene o filtre por él se poda y se anota, como cualquier campo no declarado
  (`list-orders.ts:136-138`).
- `asignaciones`: `AssignedOrderSummary` y la vista de ejecución **no** ganan el campo (`R15`,
  `[D10]`). `OrderCatalog` (`lib/modules/pedidos/domain/order-catalog.ts`) tampoco: es el contrato
  por el que `asignaciones` pregunta el estado de un pedido, y añadirle el importe lo pondría al
  alcance del Operador, que solo tiene `inventario.consultar` y `asignaciones.consultar`
  (`permissions.ts:165`).
- `lib/modules/identity/domain/permissions.ts`: **no se toca** (`R15`). Catálogo de quince, sin
  enmienda.
- La UI de pedidos: **no se toca** (`R18`, `[D13]`). La columna la pinta QC-122.

---

## 7. Composición

```ts
// lib/composition/index.ts — bloque de `pedidos`, líneas 941-950 hoy
createOrder: createCreateOrder({ orders: orderRepository, recipes: recipeCatalog, products: productCatalog, units: unitCatalog }),
updateOrder: createUpdateOrder({ orders: orderRepository, recipes: recipeCatalog, products: productCatalog, units: unitCatalog }),
```

`productCatalog` (`:712`) y `unitCatalog` **ya existen cableados**: se reutilizan, no se
reconstruyen —mismo criterio escrito en `:786` y `:838`—. `productCatalog` gana la segunda
propiedad (`findCostingBatches`), apuntando al adaptador driven nuevo de `inventario`.

---

## 8. Alternativas descartadas

1. **Calcular el importe al LEER, sin columna.** Descartada por `[D8]`, y el código le da la
   razón: sus factores cambian cada día, así que el importe de un pedido de marzo cambiaría solo.
   Además metería dos consultas más (lotes + unidades) en **cada fila** de un listado paginado.
2. **Un puerto nuevo `pedidos/ports/inventory-batches.ts`.** Descartada en `> 1`: sería una
   segunda definición, escrita por `pedidos`, de datos de `inventario`, cuando el contrato
   publicado ya existe y ya tiene dos consumidores.
3. **Pasar por `recetas`** («que `recetas` devuelva las líneas ya costeadas»). Descartada: pondría
   a `recetas` a saber de costes y de lotes —dato que hoy no toca por ninguna vía— y convertiría un
   acoplamiento de dos en uno de tres, con la regla de negocio del pedido viviendo en otro módulo.
4. **Calcular en SQL** (una consulta con funciones de ventana que ordene, acumule y promedie).
   Descartada: sería más rápida y **no se puede probar sin base**, con la regla de negocio —el
   promedio simple, el «nunca parcial y nunca 0»— escondida en una cadena de texto que ni
   `typecheck` ni el dominio ven. Choca con `CHECKPOINTS.md > Módulos hexagonales`.
5. **Guardar además los lotes usados y el coste por ingrediente.** Descartada por el Alcance
   («solo se guarda el total»). Sería una tabla nueva, con su empresa, su RLS y su migración.
6. **Añadir `decimal.js`.** Descartada por `[D14]`. Y aunque pasara los cuatro checks de
   `docs/architecture.md > Dependencias de terceros`, costaría una parada humana para lo que
   `unidades` ya resuelve con `BigInt` desde QC-76.

---

## 9. Multiplataforma y E2E

- **UI: ninguna.** La regla de `docs/architecture.md > Componentes > Regla: multiplataforma` no
  aplica porque esta ficha no añade ni toca un componente.
- **E2E: ninguno**, `[D15]`. `CHECKPOINTS.md` lo exige para flujos con importes, y aquí se
  **difiere a QC-122** con el motivo escrito ahora: sin columna que leer no hay recorrido que
  ejercitar en un navegador. La cobertura de esta ficha es **unidad + integración contra la base
  real**. Mismo criterio y misma ficha destino que QC-68.

---

## 10. Lo que este diseño dejó abierto, y cómo se cerró (F1.4, 2026-09-18)

### 10.1 Desbordamiento de `Decimal(14,4)` — CERRADO `[D17]`

`quantity` del pedido y `quantity` de la línea son `(14,4)` cada una: su producto por un coste
unitario **puede** superar `9 999 999 999,9999`, y escribirlo haría que Postgres rechazara el
`INSERT`/`UPDATE` con `22003`.

**Decisión del humano (2026-09-18):** el importe que no cabe en la columna se trata como **sin
importe** (`null`); **el pedido se crea o se edita igual** (`R24`). El diagnóstico —que fue
desbordamiento y con qué factores— va **al registro del servidor**, nunca a la salida: hacia fuera
es indistinguible de los otros cuatro casos (`R9`). El motivo, con sus palabras: **el pedido nunca
se pierde por un importe demasiado grande**.

**Esto ENMIENDA `[D5]`, de cuatro casos a CINCO**, y así queda escrito en la tabla de decisiones de
`requirements.md` y en `R8`: la fila de `[D5]` **no se reescribe**, se anota. La comprobación es
**del dominio, antes de escribir** —`calculateIngredientsCost` devuelve `null` si el resultado
redondeado no cabe en `(14,4)`—, y no un `catch` del `22003` en el adaptador: así se prueba sin
base y el puerto nunca recibe un valor que la columna no admita.

### 10.2 Desempate por número de lote — CERRADO `[D18]`

Se adopta la propuesta del diseño. Detalle y motivo en `> 5.2`, requisito `R25`.

### 10.3 Unidades mezcladas — CERRADO `[D19]`

Se convierte cantidad **y** coste unitario. Detalle y motivo en `> 5.3`, requisito `R26`.

### 10.4 Lo que SIGUE abierto

Las **preguntas abiertas 1 y 2** de `requirements.md` siguen abiertas y **esta ficha no las
cierra**: la **moneda por empresa** (`[D11]`, punto 5 de `docs/architecture.md > Preguntas
abiertas del dominio`) y **cuántos productos reales caen en el caso «bidón»** (la cierra QC-130).
La pregunta abierta 3 —cómo habla `pedidos` con `inventario`— era la única que se dejó al diseño y
**queda resuelta en `> 1`**.
