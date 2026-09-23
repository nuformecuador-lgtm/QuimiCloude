# QC-147 — cantidades-de-receta-en-porcentaje · design.md

> Cómo se construye lo que pide `requirements.md`. Las decisiones `[D1]`–`[D16]` son del humano y
> no se reabren aquí; lo que este documento decide es técnico. D13–D16 cerraron el 2026-09-22 las
> cuatro preguntas que dejó abiertas la primera versión; no queda ninguna.

## 0. Lo medido en disco antes de diseñar

Verificado en esta rama (`feature/QC-147-cantidades-de-receta-en-porcentaje`), no supuesto:

| Punto | Dónde | Estado hoy |
|---|---|---|
| Línea de receta | `db/schema.prisma` `model RecipeLine` | `quantity Decimal(14,4)` + `unitId` obligatorio, `@@index([unitId])` |
| CHECK de cantidad | `20260902163256_recipes_and_recipe_lines/migration.sql:108` | `recipe_lines_quantity_positive` (`quantity > 0`) |
| FK e índice de unidad | `20260903121404_units_catalog/migration.sql:143,151` | `recipe_lines_unit_id_fkey` (RESTRICT) y `recipe_lines_unit_id_idx` |
| RLS de la tabla | misma migración de recetas, `:117-118` | `ENABLE` + `FORCE`, sin policies |
| **Unidad del insumo** | `20260918130000_product_unit_and_stored_stock` | **`products.unit_id` ya existe** (QC-121), anulable: `NULL` = sin lotes. Un disparador impide lotes en otra unidad |
| Contrato de inventario hacia fuera | `lib/modules/inventario/domain/product-catalog.ts` | `ProductRef = { id, name, stockByUnit }`. **No publica la unidad**; `stockByUnit` es `[]` o un único `{ unitId: products.unit_id, quantity: products.stock }` |
| Costo | `lib/modules/pedidos/domain/order-cost.ts:132` | `needed = line.quantity × orderQuantity` en la unidad de la línea; los lotes se convierten a ella con `convertQuantity` (`:154-155`) |
| Orquestación del costo | `resolve-ingredients-cost.ts`, llamado desde `create-order.ts:99` y `update-order.ts:85` | lee líneas por `RecipeCatalog.findExecutionContentById`, lotes por `findCostingBatches` y unidades de líneas + lotes |
| Tabla de Pedidos | `app/(private)/pedidos/components/order-ingredients-table.tsx:104-109` | requerida = `multiplyDecimal(line.quantity, quantity)`; unidad = la de la línea |
| Detalle de receta | `lib/modules/recetas/domain/get-recipe.ts:19-23` | `productStock` = existencia en la unidad **de la línea** |
| Ejecución (QC-63) | `get-assigned-order-execution.ts:66-122`, `assigned-order-execution-view.ts` | cantidad «tal cual en la receta»; `recipeBaseQuantity`/`scaleFactorText` siempre `null`; selector de unidad por unidades hermanas de la **línea** |
| Formulario | `recipe-lines-field.tsx`, `unit-picker.tsx`, `unit-group.ts`, `recipe-form-state.ts`, `recipe-input.ts:16-38` | cantidad + `UnitPicker` acotado por `unit-group.ts`; `UnitPicker` y `unit-group.ts` **solo** los usa este formulario |
| Pedido | `20260907120000_orders_drop_unit_and_unit_price` | sin unidad, `quantity Decimal(14,4)` |
| Decimales | `docs/dependencias.md` | **ninguna** librería de decimales aprobada; el repo hace aritmética decimal exacta con `BigInt` en `order-cost.ts`, `order-decimal.ts` y `convertQuantity` |

**Hallazgo que corrige el encargo:** el leader dio por hecho que la unidad del insumo es todavía la
del último lote (QC-80) y que QC-121 vive en otro worktree. En esta rama QC-121 ya está en la base
(migración, `Product.unitId`, `product-picker.tsx` pintando «nombre · unidad»). El diseño se apoya
en `products.unit_id`. Ver §10 para la convivencia y el cruce de archivos en F2.0.

## 1. Resumen

- `recipe_lines.quantity` + `unit_id` → **`recipe_lines.percentage DECIMAL(5,2)`**, CHECK
  `> 0 AND <= 100`. Sin unidad. La migración vacía la tabla. [D3] [D4] [D6]
- Una sola aritmética del porcentaje, pura y exacta, en el dominio de `recetas`, publicada por su
  barrel: la usan el esquema de entrada, el formulario, el costo, la tabla de Pedidos y la
  ejecución. Nadie reescribe `× % / 100` por su cuenta. [D1]
- La unidad del insumo la publica `inventario` en `ProductRef.unitId`; nadie la guarda en la receta. [D2]
- La suma = 100,00 la valida el **esquema zod** del contrato (servidor) y el formulario la
  **refleja** con la misma función. [D5]

## 2. Modelo de datos y migración

### 2.1 Esquema Prisma

```prisma
/// @module recetas
model RecipeLine {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recipeId   String   @map("recipe_id") @db.Uuid
  productId  String   @map("product_id") @db.Uuid
  percentage Decimal  @db.Decimal(5, 2)
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  recipe Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@unique([recipeId, productId], map: "recipe_lines_recipe_id_product_id_key")
  @@index([productId], map: "recipe_lines_product_id_idx")
  @@map("recipe_lines")
}
```

Se van `unitId` y `@@index([unitId])`. El comentario del modelo deja de decir «la unidad es
anotativa» (deroga lo de QC-24 para las líneas, [D3]) sin citar fichas (`docs/conventions.md`).
`recipe_lines` sigue en la lista cerrada de exentas de `company_id`: no cambia su relación con la
receta.

**Nombre de la columna: `percentage`, no `quantity`.** Ver alternativa §11.3.

**`DECIMAL(5,2)`**: tres enteros y dos decimales llegan justo a `100.00`, que es la precisión de
[D4]. El reparto de responsabilidades entre borde y base es deliberado:

- **Rango** (`> 0` y `<= 100`): lo rechaza la base con el CHECK `recipe_lines_percentage_range`
  (`23514`), además del borde. Es la parte de R6 que se prueba en integración con escrituras
  directas.
- **Más de dos decimales**: Postgres **no rechaza** `12.345` en una columna de escala 2, lo
  **redondea** al guardar. Un CHECK del tipo `percentage = round(percentage, 2)` sería tautológico
  después de ese redondeo, así que no se escribe. Lo que la base garantiza es que nunca **guarda**
  más de dos decimales (R6, probado en integración releyendo el valor); el **rechazo** de la
  entrada es del borde (R2). Rechazar también en base exigiría `NUMERIC` sin escala (§11.4).

### 2.2 `migration.sql` (UP) — escrita a mano

Nombre: `db/migrations/<timestamp>_recipe_lines_percentage/`, con `<timestamp>` posterior a la
última migración de la rama (`20260918130000_*`) y a cualquiera que haya entrado en `master` cuando
se escriba.

1. **Paréntesis de RLS**: `ALTER TABLE "recipe_lines" NO FORCE ROW LEVEL SECURITY;`. Con `FORCE` y
   sin policies, el dueño —quien corre la migración— está sujeto a RLS y **el `DELETE` borraría
   cero filas sin error**. Mismo patrón que `20260918130000_product_unit_and_stored_stock`.
2. `DELETE FROM "recipe_lines";` [D6]. No toca `recipes`: nombre, descripción, imagen, pasos,
   empresa, autoría, `updated_at` y `deleted_at` quedan como estaban (R8). El borrado físico está
   permitido aquí: `recipe_lines` no es transaccional —la edición de hoy ya hace `deleteMany`— y
   [D6] lo decide.
3. `ALTER TABLE "recipe_lines" DROP CONSTRAINT "recipe_lines_unit_id_fkey";`
   `DROP INDEX "recipe_lines_unit_id_idx";` `ALTER TABLE "recipe_lines" DROP COLUMN "unit_id";`
4. `ALTER TABLE "recipe_lines" DROP CONSTRAINT "recipe_lines_quantity_positive";`
   `ALTER TABLE "recipe_lines" DROP COLUMN "quantity";`
5. `ALTER TABLE "recipe_lines" ADD COLUMN "percentage" DECIMAL(5,2) NOT NULL;` — sin `DEFAULT`, legal
   porque la tabla está vacía (paso 2).
6. `ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_percentage_range" CHECK ("percentage" > 0 AND "percentage" <= 100);`
7. Cierre del paréntesis: `ENABLE` + `FORCE ROW LEVEL SECURITY`.

No toca `orders.ingredients_cost`: los importes ya guardados se quedan como estaban (se guardan a
propósito, QC-123) y cada pedido se recalcula en su siguiente edición. **Consecuencias que conviene
saber**: tras la migración ninguna receta tiene líneas, así que editar un pedido antes de recargar
su receta deja su costo sin importe (R16); y, por [D14], ninguna de esas recetas se puede guardar
—ni para renombrarla— hasta cargarle líneas que sumen 100 % (R23).

### 2.3 `down.sql` (DOWN)

Revierte exactamente el UP, en orden inverso: `NO FORCE`; `DELETE FROM "recipe_lines"` (un
porcentaje no tiene traducción a cantidad + unidad, y `unit_id NOT NULL` sin `DEFAULT` exige la
tabla vacía); `DROP CONSTRAINT recipe_lines_percentage_range`; `DROP COLUMN percentage`;
`ADD COLUMN "quantity" DECIMAL(14,4) NOT NULL` + `recipe_lines_quantity_positive`;
`ADD COLUMN "unit_id" UUID NOT NULL` + `recipe_lines_unit_id_fkey` (`ON DELETE RESTRICT ON UPDATE
CASCADE`) + `recipe_lines_unit_id_idx`; `ENABLE` + `FORCE`. Las columnas vuelven al final de la
tabla (Postgres no reordena), igual que asumió el `down.sql` de `units_catalog`. El DOWN pierde las
líneas en porcentaje: es simétrico a [D6] y se dice en su cabecera. `pnpm run db:rollback` lo
aplica y marca la migración como revertida en `_prisma_migrations` (R9).

## 3. La aritmética del porcentaje: `lib/modules/recetas/domain/recipe-percentage.ts`

Pura, sin dependencias, cadenas decimales dentro y fuera (el dominio no puede importar
`@prisma/client`, y el barrel tiene que poder importarse desde un componente de cliente).

```ts
export const RECIPE_TOTAL_PERCENTAGE = '100.00';
export const PERCENTAGE_PATTERN: RegExp;               // /^\d{1,3}(\.\d{1,2})?$/

/** Centésimas exactas de un porcentaje válido ("97.5" -> 9750n), o null si no casa el patrón. */
export function percentageToHundredths(value: string): bigint | null;

export type PercentageTotal = {
  readonly total: string;        // "97.50", siempre con 2 decimales
  readonly difference: string;   // 100.00 - total, con signo: "2.50" falta, "-1.00" sobra
  readonly isComplete: boolean;  // total === 100.00 exacto
};
/** Suma de las líneas; las que no casan el patrón no suman (el formulario las marca aparte). */
export function sumPercentages(values: readonly string[]): PercentageTotal;

/** R13: cantidad del pedido × porcentaje / 100, exacta. Sin unidad: la pone quien pinta. */
export function consumedQuantity(orderQuantity: string, percentage: string): string;

/** R25: "12.5" -> "12,50". Coma y exactamente 2 decimales; sin " %" (lo pone quien pinta). */
export function formatPercentage(value: string): string;
```

- Todo en enteros `BigInt`: `percentage` en centésimas, `orderQuantity` a su escala; el producto
  tiene escala `s + 2` y dividir entre 100 es sumar 2 a la escala. **No hay redondeo** en ningún
  paso: 200 × 10 % → `"20.000000"` (quien pinta recorta), 0,0001 × 0,01 % → `"0.00000001"`.
- `consumedQuantity` es lo único que heredan QC-92, QC-138, QC-139 y QC-141 [D9].
- Se exporta por `lib/modules/recetas/index.ts`. `pedidos` y `asignaciones` ya importan de ese
  barrel (`RecipeCatalog`), así que no aparece ninguna flecha nueva entre módulos.

**Por qué a mano y no una librería** (`docs/architecture.md > Anti-patrones`, «utilidad escrita a
mano que ya resuelve una librería»): no hay librería de decimales aprobada; la operación es una
multiplicación entera y un desplazamiento de escala, sin división real ni redondeo; y el repo ya
resuelve así el mismo tipo de dato en tres sitios. Proponer `decimal.js`/`big.js` para esto sería
una parada de aprobación para ahorrar ~30 líneas. **Sin dependencias nuevas** [D12].

## 4. Contrato de entrada y servicio de `recetas`

### 4.1 `recipe-input.ts`

```ts
const percentageSchema = z.string()
  .regex(PERCENTAGE_PATTERN, { message: 'El porcentaje admite hasta 3 enteros y 2 decimales.' })
  .refine((v) => hundredths(v) > 0n,     { message: 'El porcentaje debe ser mayor que cero.' })
  .refine((v) => hundredths(v) <= 10000n, { message: 'El porcentaje no puede pasar de 100.' });

export const recipeLineSchema = z.object({
  productId: z.string().uuid(),
  percentage: percentageSchema,
}).strict();                                           // R5: una línea con `unitId` se rechaza
```

`recipeLinesSchema` añade, detrás del `refine` de producto repetido, un `superRefine` con
`sumPercentages(lines.map(l => l.percentage))`: si `!isComplete`, un issue con `path: ['lines']`
(«Las líneas suman 97,50 %: deben sumar exactamente 100,00 %.») que el formulario ya sabe pintar
como error general (`extractGeneralLinesError`) (R3).

**Receta sin líneas [D14]:** **no hay guarda** para la lista vacía. `sumPercentages([])` da
`total = 0.00`, `isComplete = false`, y el mismo `superRefine` la rechaza con el mismo issue
(«Las líneas suman 0,00 %: …»). Se conserva `.default([])` en el esquema: un payload sin la clave
`lines` se trata como lista vacía y se rechaza igual, en vez de colarse como `undefined`. Como el
esquema es el mismo para alta y edición, R23 sale solo: editar una receta vaciada por la migración
sin traer líneas —aunque solo cambie el nombre— falla en el borde, antes de tocar el repositorio.
Es la consecuencia que [D14] acepta a sabiendas; no se añade ningún camino de «renombrar sin
líneas».

### 4.2 Casos de uso

- `create-recipe.ts` y `update-recipe.ts` **dejan de validar unidades** y pierden la dependencia
  `units: UnitCatalog`; `lib/composition/index.ts` deja de cablearla ahí. El orden no cambia:
  `requirePermission(actor, 'recetas.modificar')` primero, después el `safeParse`, después
  productos vivos, después repositorio (R7). No hay código de error nuevo: la suma rechazada es el
  mismo `ValidationError` de hoy con sus issues.
- `ports/recipe-repository.ts`: `NewRecipeLine = { productId, percentage }`; la fila de lectura
  igual.
- `recipe-prisma.ts`: `create`/`upsert` escriben `percentage`; `fromDecimal` pasa a `toFixed(2)`.
  `translateWriteError` sigue traduciendo `23514` a `ValidationError` (ahora lo dispara
  `recipe_lines_percentage_range`).
- `recipe-catalog-prisma.ts`: el `select` de ejecución pide `{ productId, percentage }`.

## 5. Contrato de `inventario`: `ProductRef.unitId`

```ts
export type ProductRef = {
  readonly id: ProductId;
  readonly name: string;
  /** La unidad del producto; `null` mientras no tiene ningún lote. */
  readonly unitId: string | null;
  readonly stockByUnit: readonly ProductStockByUnit[];
};
```

`findProductRefs` ya selecciona `unitId` (`product-catalog-prisma.ts:63`); solo hay que pasarlo.
Es el único cambio fuera de `recetas`/`pedidos`/`asignaciones`/UI. El comentario del tipo que dice
que la unidad se retiró «porque nadie la consumía» deja de ser cierto y se reescribe. `stockByUnit`
no se toca (QC-91/QC-121 tienen tests sobre él).

## 6. Vistas de lectura y «unidad desconocida»

```ts
// recetas/domain/recipe-view.ts
export type RecipeLineView = {
  readonly id: string;
  readonly productId: string;
  readonly productName: string | null;     // null = insumo dado de baja (como hoy)
  readonly percentage: string;             // "10.00"
  readonly productUnitId: string | null;   // R14; null = sin lotes o dado de baja
  readonly productStock: number | null;    // existencia en productUnitId; 0 sin lotes; null si de baja
};

// recetas/domain/recipe-catalog.ts
export type RecipeExecutionLine = {
  readonly productId: string;
  readonly productName: string | null;
  readonly percentage: string;
};
```

`get-recipe.ts` sustituye `stockInLineUnit` por la existencia en la unidad del propio producto:
`ref.unitId === null ? 0 : (ref.stockByUnit.find(e => e.unitId === ref.unitId)?.quantity ?? 0)`.

**Unidad desconocida [D13]** es un único estado con dos causas —insumo sin lotes, insumo dado de
baja—, y todas las vistas lo soportan igual: el porcentaje y la cantidad calculada se muestran **sin
unidad**. En la tabla de Pedidos la celda de unidad lleva el marcador de ausencia que ya usa (`—`);
en la frase del Operario simplemente no hay símbolo («Sosa · 2,00 % · 4»). El costo no necesita el
caso: un insumo sin lotes o de baja no tiene lotes con existencia y R16 ya lo deja sin importe.

La receta **se puede guardar** con esa línea (R24): alta y edición no miran `ref.unitId`, y el
`ProductPicker` no desactiva los productos sin unidad. No se añade ninguna validación.

## 7. Pantalla de ejecución (QC-63) [D7]

```ts
export type AssignedOrderExecutionView = {
  readonly orderId: string;
  readonly numberText: string;
  readonly status: 'PENDIENTE' | 'EN_CURSO';
  readonly recipeName: string | null;
  readonly orderQuantity: string;
  // recipeBaseQuantity y scaleFactorText: RETIRADOS (R19, R21)
  readonly steps: readonly RecipeStepView[];
  readonly lines: readonly ExecutionLineView[];
};

export type ExecutionLineView = {
  readonly productName: string | null;
  readonly percentage: string;
  readonly quantity: string;               // consumedQuantity(orderQuantity, percentage)
  readonly unit: UnitRef | null;           // la del insumo; null = desconocida (§6)
  readonly alternativeUnits: readonly UnitRef[];
};
```

`get-assigned-order-execution.ts`: las unidades ya no salen de las líneas sino de
`productRefs[].unitId` (la lectura de `findRefs` ya está ahí, línea 72); con esos ids se piden
`units.findRefs` y `findRefsSharingBaseInCompany` como hoy. La línea cuya unidad no se resuelve sale
con `unit: null` y sin alternativas (hoy fabrica un `UnitRef` con el id como nombre; eso se retira).

UI:
- `order-execution-lines.tsx`: «{insumo} · {porcentaje} · {cantidad} {unidad}», con el porcentaje
  en el formato de [D15] —«Hipoclorito · 10,00 % · 20 L»— (R18, R25). La cantidad calculada sigue
  el formato del resto de la aplicación (`formatDecimalDisplay`): [D15] habla del porcentaje. El
  selector de unidad (R20) convierte `line.quantity` —la calculada— con `convertQuantity`, igual que
  hoy; el porcentaje es texto fijo. Con `unit === null` no hay selector ni símbolo (R24).
- `order-scale-banner.tsx` **se borra** y `order-execution-screen.tsx` pinta la cantidad del pedido
  como un `<p>` propio, «Pedido 200», con `data-testid="order-execution-order-quantity"` [D16]
  (R26). Del banner solo desaparece el factor.

## 8. UI de recetas y de Pedidos

### 8.1 Formulario de recetas [D3] [D5]

- `recipe-form-state.ts`: `RecipeLineFormValue = { key, productId, productName, percentage,
  productUnitId }`; `RecipeLinePayload = { productId, percentage }`; `RecipeLineFieldName =
  'productId' | 'percentage'`. En el estado, `percentage` es **lo que el usuario escribió**, con
  coma. `buildRecipePayload` la pasa al formato del contrato con una única sustitución de cadena
  (`,` → `.`), sin `parseFloat`, `Number` ni `toFixed`: el valor sigue sin pasar nunca por `number`.
- `recipe-lines-field.tsx`: sin `UnitPicker`; la columna de unidad desaparece del grid. El campo
  «Porcentaje» pasa a **`type="text"` con `inputMode="decimal"`** y el sufijo «%» visual.
  **Esto cambia a sabiendas el `type="number"` de QC-26bis para este campo**, y es consecuencia
  directa de [D15]: un `input type="number"` pinta el separador según la configuración regional del
  navegador y, en los que usan punto, rechaza la coma —justo el coste que QC-26bis ya anotó—, así
  que con él no se puede garantizar «12,50». `inputMode="decimal"` sigue sacando el teclado numérico
  en iOS y Android. Se aceptan coma y punto al escribir (R25); el esquema valida lo que llega tras
  la sustitución. El ingrediente elegido ya se ve como «nombre · unidad» (`ProductPicker`, QC-121),
  y la precarga de edición gana `productUnitId` desde `RecipeLineView` (R12).
- **Precarga de edición** (`recipe-form.tsx`, hoy `trimDecimal(line.quantity)`): el campo se
  rellena con `formatPercentage(line.percentage)`, es decir «12,50», no «12.5» (R25).
- **Indicador de suma** al pie del bloque de líneas, `role="status"` + `aria-live="polite"`,
  `data-testid="recipe-lines-sum"` y `data-complete="true|false"`, calculado en cada render con
  `sumPercentages` sobre las líneas (el fantasma no suma). Texto: «Suma: 97,50 % — faltan 2,50 %»,
  «Suma: 101,00 % — sobran 1,00 %», «Suma: 100,00 %»; sin ninguna línea, «Suma: 0,00 % — faltan
  100,00 %» (R10, R25).
- `recipe-form.tsx`: el botón Guardar queda `disabled` mientras `!isComplete`, **también con cero
  líneas** [D14]. Además el `onSubmit` vuelve a comprobarlo antes de llamar a la Server Action, para
  que Enter en un campo no se lo salte (R11). El servidor lo rechaza igual (R3, R23).
- **Se borran** `unit-picker.tsx` y `unit-group.ts` y sus exportaciones del barrel. Sus tests
  (`unit-group.test.ts`, `recipe-line-unit-group.test.tsx`) se borran y
  `consumidores-catalogo.test.tsx` deja de montar `UnitPicker`.

**Formato [D15].** Una sola función, `formatPercentage(value: string): string`, en el dominio de
`recetas` junto a la aritmética (§3) y publicada por su barrel, porque la usan tres rutas distintas
(recetas, pedidos, asignación) y no puede vivir en una de ellas: «12.5» → «12,50», «100» →
«100,00», «-1.00» → «-1,00». Opera sobre la cadena —rellenar a 2 decimales y cambiar el
separador—, sin pasar por `number` ni por `Intl`, cuyo resultado depende de la configuración
regional del entorno. El símbolo « %» lo pone quien pinta. Aplica a todo porcentaje de receta:
formulario, indicador de suma, ficha de la receta, pantalla del Operario y la columna de porcentaje
de la tabla de Pedidos, que pinta el mismo dato (R25). **No** cambia `formatDecimalDisplay` ni el
formato de las cantidades, existencias o importes: [D15] trata del porcentaje.

### 8.2 Tabla de ingredientes de Pedidos [D9]

`order-ingredients-table.tsx`: columnas Producto · **Porcentaje** (con `formatPercentage`, «10,00 %»)
· Unidad (del insumo, `productUnitId`; `—` si es desconocida, R24) · Stock · Cantidad requerida ·
Restante. `requiredOf = quantity === '' ? '0' :
consumedQuantity(quantity, line.percentage)`. Restante y resaltado, igual que hoy (R17). La
multiplicación deja de usar `multiplyDecimal` local; `order-decimal.ts` sigue existiendo para la
resta.

## 9. Costo de ingredientes [D1] [D9]

```ts
export type RecipeCostLine = {
  readonly productId: ProductId;
  readonly percentage: string;
  readonly unitId: string | null;   // la del insumo (ProductRef.unitId)
};
```

- `resolve-ingredients-cost.ts` añade **una** lectura: `products.findRefs(productIds, companyId)`
  para la unidad de cada insumo, y construye `RecipeCostLine` juntándola con las líneas. Las
  unidades a resolver son las de los insumos más las de los lotes. Sigue siendo una llamada por
  catálogo, sin crecer con el número de ingredientes.
- `order-cost.ts`: `needed = consumedQuantity(orderQuantity, percentage)`, en la unidad del
  insumo. Una línea con `unitId === null` devuelve `null` (sin importe). Los lotes se siguen
  convirtiendo a la unidad del insumo con `convertQuantity` —hoy es la identidad, porque el
  disparador de QC-121 ya no deja lotes en otra unidad, pero se conserva: no cuesta nada y es la
  red si algún producto arrastra lotes previos a ese disparador (QC-121 no los sanea)—. Orden de
  lotes, promedio, redondeo `HALF_UP` a 4 y tope de `Decimal(14,4)`: sin cambios (R15, R16).
- `create-order.ts` y `update-order.ts` no cambian de firma.

## 10. Convivencia con QC-121 y con quien hereda la fórmula

- **QC-121**: esta ficha **no depende** de ella [D2], pero en esta rama su migración ya está y el
  diseño lee `products.unit_id` a través de `ProductRef`. Si QC-121 sigue abierta en su worktree,
  **en F2.0 hay que cruzar archivos**: los candidatos a solaparse son
  `lib/modules/inventario/domain/product-catalog.ts`,
  `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`,
  `tests/unit/inventario/product-catalog.test.ts`, `app/(private)/produccion/formulas/components/recipe-lines-field.tsx`,
  `product-picker.tsx` y `tests/unit/recetas-ui/recipe-form.test.tsx`.
- **QC-92, QC-138, QC-139, QC-141** heredan `consumedQuantity` del barrel de `recetas` y la unidad
  de `ProductRef.unitId`. No se les prepara nada más.
- `docs/architecture.md > Dominio` punto 1 dice que «la línea de receta apunta» al catálogo de
  unidades: deja de ser cierto y se corrige en la T11. El anti-patrón «cantidad sin unidad de
  medida» no aplica: un porcentaje no es una cantidad de producto ni de existencias, y la cantidad
  real (R13) se expresa siempre en la unidad del insumo.

## 11. Alternativas descartadas

1. **Validar la suma = 100 en la base** (disparador de restricción `DEFERRABLE INITIALLY DEFERRED`
   sobre `recipe_lines`). Descartada: es una regla entre filas, la edición de hoy borra y hace
   `upsert` línea a línea dentro de la transacción, así que solo un disparador diferido la
   comprobaría en el momento correcto; añade PL/pgSQL que Prisma no modela, un código SQLSTATE más
   que traducir, y la receta sin filas (que [D14] rechaza) ni siquiera dispara un disparador por
  fila: habría que ponerlo también en `recipes`. [D5] pide «el servidor
   también lo rechaza», y en este repo la frontera es el service
   (`docs/architecture.md > Acceso a datos`). La base se queda con el rango por fila (R6).
2. **Guardar la fracción (0–1) en vez del porcentaje.** Descartada: [D4] define el dato en
   porcentaje con dos decimales; guardar otra cosa obliga a convertir en cada lectura y escritura
   y abre la puerta a que una pantalla pinte 0,1 donde se escribió 10.
3. **Conservar el nombre `quantity` y reinterpretarlo.** Descartada: diff más pequeño, pero todo
   consumidor —y los tres que heredan la fórmula— leería una «cantidad» que es un porcentaje, y
   ningún error de tipos lo avisaría. Renombrar a `percentage` hace que el compilador señale cada
   sitio que hay que revisar.
4. **Columna `NUMERIC` sin escala + CHECK de dos decimales**, para que la base rechace `12.345`.
   Descartada: pierde la precisión declarada de la columna, que es lo que el resto del esquema
   usa para dinero y cantidades, y el borde ya lo rechaza (R2).
5. **Sacar la unidad del insumo de `stockByUnit[0].unitId`** para no tocar `inventario`. Descartada:
   funciona hoy solo porque `stockByUnit` degeneró a un valor; es leer un dato por un efecto
   colateral de su forma. Un campo explícito cuesta una línea y un test.

## 12. Tests existentes que cambian

Se ponen rojos **por hacer lo que la ficha pide** y se actualizan en la task de su capa:

| Test | Por qué |
|---|---|
| `tests/unit/recetas/schema/recetas-schema.test.ts` (`:250`, `:644`), `tests/unit/recetas/scope.test.ts:417`, `tests/unit/unidades/schema/unidades-schema.test.ts` (`:572`, `:671`) | leen `db/schema.prisma` y esperan `unitId`/`recipe_lines_unit_id_idx` |
| `tests/integration/unidades/unidades-constraints.int.test.ts` (`:600`, `:820`), `tests/integration/recetas/recetas-constraints.int.test.ts:993`, `recipe-lines.int.test.ts` (`:213-276`), `recipe-crud.int.test.ts`, `company-scope*.int.test.ts` | leen la base migrada o insertan `quantity`/`unit_id` |
| `tests/unit/recetas/recipe-input.test.ts`, `recipe-service.test.ts`, `recipe-lines-catalog.test.ts`, `recipe-catalog.test.ts`, `recipe-actions.test.ts` | contrato de línea |
| `tests/unit/recetas-ui/*` (form, payload, unavailable, page, route-contract) y los dos de `unit-group` (se borran) | formulario |
| `tests/unit/pedidos/order-cost.test.ts`, `tests/unit/pedidos-ui/*` con fixtures de `RecipeLineView` | costo y tabla |
| `tests/unit/asignaciones/get-assigned-order-execution.test.ts`, `tests/unit/asignaciones-ui/order-execution-*.test.tsx`, `tests/unit/composition/asignaciones-facade.test.ts` | vista de ejecución |
| `tests/unit/inventario/product-catalog.test.ts:55` | enumera las claves exactas de `ProductRef` |
| `tests/unit/unidades/consumidores-catalogo.test.tsx` | monta `UnitPicker` |

**Tests que hoy guardan una receta sin líneas** —QC-26 lo permitía y [D14] lo prohíbe—. Medido
con `grep` de `lines: []` y «sin líneas» en `tests/` y `e2e/` de recetas. Cada uno se trata de una
de tres formas, y la task de su capa dice cuál:

| Test | Qué hace hoy | Tratamiento |
|---|---|---|
| `tests/unit/recetas-ui/recipe-form.test.tsx:753-765` («R27 — … una receta sin ninguna se guarda») | afirma que se guarda sin líneas | **Se invierte**: pasa a probar R11/R23 (sin líneas, Guardar deshabilitado y la acción no se llama) |
| `tests/unit/recetas/authorization.test.ts:43, :55, :134` | entradas de alta/edición con `lines: []` | los casos **sin** permiso siguen igual (el permiso va antes que la suma, R7); los casos **con** permiso pasan a una línea al 100 % |
| `tests/unit/recetas/company-isolation-service.test.ts:80, :96`, `tests/unit/recetas/company-scope.test.ts:69` | entradas de servicio con `lines: []` | pasan a una línea al 100 % (lo que prueban es el ámbito, no las líneas) |
| `tests/unit/recetas/recipe-image-url.test.ts:29, :108, :133, :161`, `recipe-image-lifecycle.test.ts:28, :44` | entradas de alta/edición con imagen y `lines: []` | pasan a una línea al 100 % |
| `tests/unit/recetas-ui/recipe-form-payload.test.ts:72` | arma el payload de un estado sin líneas | se queda: `buildRecipePayload` no valida; se revisa que ningún caso afirme que ese payload es **válido** |
| `tests/unit/recetas/recipe-catalog.test.ts:222, :238, :330` | filas **leídas** sin líneas | se quedan: son lecturas, y las recetas vacías existen tras la migración |
| `tests/integration/recetas/recipe-crud.int.test.ts:237`, `recipe-lines.int.test.ts:172`, `company-scope-queries.int.test.ts:154` | escriben por el **repositorio**, que no valida | se revisan una a una: si el caso pasa por el servicio, línea al 100 %; si va directo al repositorio, se queda |
| `e2e/recetas.spec.ts` (siembra de `:280`, «existe sin líneas») y `e2e/recetas-pasos.spec.ts` | crean o editan recetas por la UI | todo guardado por la UI lleva una línea al 100 %; una receta sembrada sin líneas que el spec **edita** tiene que cargar líneas antes de guardar (R23) |

Además, cualquier otro test que construya una entrada válida de alta o edición **sin** la clave
`lines` (el esquema la rellena con `[]`) cae en el mismo caso: el `grep` de T3/T4/T9 incluye las
constantes de entrada válidas de cada archivo, no solo el literal `lines: []`.

Los tests de migraciones **viejas** (`recetas-migration.test.ts`, `unidades-migration.test.ts`, …)
leen archivos que no cambian y siguen verdes. Si alguna guardia inventaría FK o índices del esquema
final, se ajusta en T1 y se dice en la bitácora.

## 13. E2E [D11]

`e2e/recetas-porcentaje.spec.ts`, datos propios con prefijo único y limpieza al final (patrón de
`e2e/recetas.spec.ts`):

1. En el formulario de recetas, dos insumos, escritos con coma, al «90» y «7,5»: el indicador dice
   «Suma: 97,50 % — faltan 2,50 %» y Guardar está deshabilitado; se cambia a «92,5»: «Suma:
   100,00 %», se guarda y la receta existe en la base con `92.50` y `7.50`. Al reabrirla, los campos
   muestran «92,50» y «7,50» (R25).
2. Una receta sin ninguna línea: el indicador dice «Suma: 0,00 % — faltan 100,00 %», Guardar está
   deshabilitado y la receta no se crea. Y una receta **sembrada** sin líneas (como las que deja la
   migración) no se puede guardar tras cambiarle solo el nombre: el nombre en la base no cambia
   (R3, R23).
3. Un pedido de 200 sobre una receta sembrada con 10 % de un insumo en L (lote con existencia y
   coste conocidos): la columna «Porcentaje» dice «10,00 %», «Cantidad requerida» dice 20 y
   `orders.ingredients_cost` es el que sale de 20 × coste.
4. Ese pedido asignado al Operario: la pantalla de ejecución muestra «Pedido 200» en su propia
   línea y «10,00 % · 20 L» en la del insumo (R18, R25, R26).

Se actualizan `e2e/recetas.spec.ts` y `e2e/recetas-pasos.spec.ts`: hoy rellenan «12.5» y eligen
unidad; pasan a una línea al 100 % sin unidad.

## 14. Multiplataforma

Sin excepción de escritorio. El campo de porcentaje mantiene `text-base` (16 px) y `min-h-11`; el
indicador de suma es texto, no depende de `:hover`; se borra un control (`UnitPicker`), no se añade
ninguno. La línea del Operario usa `flex-wrap` como hoy, así que «insumo · % · cantidad unidad» no
desborda en móvil.

## 15. Dependencias

Ninguna. Ni librería ni tabla [D12]. Justificación de la aritmética propia en §3.
