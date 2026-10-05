# QC-204 — conversion-unidad-pedido-a-insumo · design.md

> Cómo se cumple `requirements.md` (R1–R26). Sin migración, sin tabla y sin dependencia nueva.
> Las Preguntas abiertas 1 y 2 no se cierran aquí: §8 propone opciones con recomendación.

## 1. Dónde está hoy el fallo

`consumedQuantity(orderQuantity, percentage)` (`recetas`) da una cifra que todos los consumidores
leen **directamente en la unidad del insumo**, sin mirar la unidad del pedido:

| Consumidor | Sitio | Llamantes |
|---|---|---|
| Costo de ingredientes | `pedidos/domain/order-cost.ts > calculateLineCost` | `resolve-ingredients-cost.ts` ← `create-order.ts`, `update-order.ts`, `review-blocked-orders.ts`, `update-order-presentation-lines.ts`, `order-packing.ts` (`resolveLotCost`), `quote-order-cost.ts` |
| Reserva | `pedidos/domain/order-requirement.ts > buildRequirement` | `buildOrderRequirement` ← alta, edición, desbloqueo, reparto, empaque (fase `materials_consumed`, sin receta) |
| Consumo al finalizar | `transition-order.ts` (`buildRequirement` como `fallbackRequirement`) | `asignaciones` vía `OrderCatalog.transitionAliveById` |
| Ejecución | `asignaciones/domain/get-assigned-order-execution.ts:119` | pantalla `/asignacion/[id]` |
| Tabla de ingredientes | `app/(private)/pedidos/components/order-ingredients-table.tsx:126` | `order-form.tsx` |

La cotización (`quoteOrderCostSchema`) ni siquiera recibe la unidad: hace `pick` de `recipeId` y
`quantity`.

## 2. Modelo de datos

**Sin cambios.** `orders.unit_id` ya existe (nullable, QC-150/QC-164) y `units` ya guarda
`base_unit_id` y `factor` (QC-76). No se persiste si un costo es aproximado: se **deriva** cada vez
de las unidades (§5.3), porque depende solo de las familias de las unidades y no de la existencia.
Sin migración de datos (D5, R22): los pedidos guardados conservan `ingredients_cost`,
`packaging_cost` y sus `reservation_movements`.

## 3. `unidades`: la conversión con aproximación

### 3.1 Contrato nuevo (dominio puro, `domain/convert-with-approximation.ts`)

```ts
export type MassVolumeBridge = { readonly volumeBaseId: UnitId; readonly massBaseId: UnitId }

export type ConvertedQuantity = { readonly quantity: string; readonly approximate: boolean }

/** @throws IncompatibleUnitsError si no cumple ni misma base ni masa↔volumen. */
export function convertWithApproximation(
  quantity: string, from: UnitConversion, to: UnitConversion, bridge: MassVolumeBridge | null,
): ConvertedQuantity
```

Algoritmo (R2–R4):

1. Si `base(from) === base(to)` → `{ quantity: convertQuantity(q, from, to), approximate: false }`.
2. Si `bridge !== null` y `{base(from), base(to)}` es exactamente `{volumeBaseId, massBaseId}` →
   `q1 = convertQuantity(q, from, baseRef(from))`; se toma `q1` tal cual en la base de `to`;
   `q2 = convertQuantity(q1, baseRef(to), to)`; `approximate: true`. `baseRef(u)` es
   `{ id: base(u), baseUnitId: null, factor: null }`: no hace falta leer la fila de la base.
3. Si no, `IncompatibleUnitsError` (el mismo error de QC-76: ya es distinguible por `code`).

Se exporta por el barrel junto a `convertQuantity`. `convertQuantity` **no cambia**.

### 3.2 El puente masa↔volumen (N1)

`UnitCatalog` gana un método:

```ts
/** Ids del mililitro y el gramo DE SISTEMA, o `null` si falta alguno. */
findMassVolumeBridge(): Promise<MassVolumeBridge | null>
```

Adaptador `unit-catalog-prisma.ts`: una lectura de `units` con `company_id IS NULL`,
`unit_id IS NULL` (la columna de `baseUnitId`; `units` no tiene borrado lógico) y
`name_normalized IN ('mililitro','gramo')` —los dos
nombres que siembra `20260903121404_units_catalog` y que `20260907190000` deja como bases—. Sin
`companyId`: las de sistema son las mismas para todas las empresas. Es el **único** sitio del
repo que sabe qué es masa y qué es volumen.

## 4. `pedidos`: la necesidad de una línea

### 4.1 `domain/order-line-need.ts` (dominio puro)

```ts
export type OrderLineNeed =
  | { readonly kind: 'unconverted'; readonly quantity: string }   // pedido o insumo sin unidad (R20, R21)
  | { readonly kind: 'exact'; readonly quantity: string }         // R2
  | { readonly kind: 'approximate'; readonly quantity: string }   // R3
  | { readonly kind: 'not_convertible' }                          // R4

export type LineNeedUnits = {
  readonly orderUnit: UnitConversion | null
  readonly bridge: MassVolumeBridge | null
}

export function resolveLineNeed(
  orderQuantity: string, percentage: string, lineUnit: UnitConversion | null, units: LineNeedUnits,
): OrderLineNeed
```

`consumedQuantity` sigue siendo la única multiplicación; `resolveLineNeed` la envuelve y convierte.
Una `orderUnit` que el llamante no pudo resolver (id que no aparece en el catálogo) se trata como
`not_convertible`, no como `unconverted`: un pedido **con** unidad nunca vuelve a la fórmula vieja.

Se exporta por el barrel de `pedidos`: lo consumen `asignaciones` (que ya importa de
`@/lib/modules/pedidos`) y la tabla de ingredientes (que ya importa `createOrderSchema` de ahí).

### 4.2 Costo — `order-cost.ts`

- `CostInput` gana `orderUnitId: string | null` y `bridge: MassVolumeBridge | null`.
- `calculateLineCost` sustituye `consumedQuantity(...)` por `resolveLineNeed(...)`:
  `not_convertible` → `null` (R6 vía `calculateIngredientsCost`, R7 vía
  `calculateLotIngredientsCost`, que ya cuenta `null` como cero); el resto usa `quantity`.
- `loadCostInput` (`resolve-ingredients-cost.ts`) recibe `orderUnitId`, añade ese id al
  `findRefs` de unidades que ya hace (una sola lectura) y pide `findMassVolumeBridge()` en el
  mismo `Promise.all`. Las firmas públicas `resolveIngredientsCost`, `resolveLotIngredientsCost`,
  `resolveOrderCost`, `resolveStoredOrderCost` y `resolveLotCost` ganan el parámetro
  `orderUnitId: string | null` justo después de `orderQuantity`. El compilador obliga a tocar los
  seis llamantes de §1; cada uno pasa la unidad que ya tiene a mano:
  - `create-order.ts`, `update-order.ts`: `data.unitId`.
  - `update-order-presentation-lines.ts`: el `unitId` **nuevo** de la entrada (ese formulario puede
    cambiar la unidad).
  - `review-blocked-orders.ts`: `row.unitId`.
  - `order-packing.ts`: `updated.unitId` (ya lo lee).
  - `quote-order-cost.ts`: `data.unitId` (§6).

### 4.3 Reserva y consumo — `order-requirement.ts`

```ts
export type RequirementUnits = LineNeedUnits & {
  readonly productUnits: ReadonlyMap<string, UnitConversion | null>
}
export type RecipeRequirement =
  | { readonly kind: 'ok'; readonly lines: readonly ReservationRequirementLine[] }
  | { readonly kind: 'not_convertible'; readonly productIds: readonly string[] }

buildRequirement(lines, orderQuantity, units: RequirementUnits): RecipeRequirement
buildOrderRequirement(input & { units: RequirementUnits }): RecipeRequirement
```

`unconverted` / `exact` / `approximate` → `quantity`; un insumo sin unidad pasa como hoy
(`unconverted`) y `planReservation` lo sigue dando por insuficiente (R21). La suma por producto de
`buildOrderRequirement` se hace **después** de convertir, todo ya en la unidad del insumo.
`inventario` no cambia: `ReservationRequirementLine.quantity` sigue llegando en la unidad del
producto, que es lo que `planReservation` y `consumeForOrder` ya esperan.

**Lectura de las unidades dentro de la transacción.** La necesidad se arma dentro de
`unitOfWork.run`, con la receta leída por `scope.recipes`. Leer productos y unidades con el
cliente global ahí dentro pediría una segunda conexión mientras la transacción retiene la suya
—lo que `lib/composition/index.ts:1181` prohíbe—. Por eso `OrderTransactionScope` gana:

```ts
readonly products: Pick<ProductCatalog, 'findRefs'>
readonly units: Pick<UnitCatalog, 'findRefs' | 'findMassVolumeBridge'>
```

cableados en `orderUnitOfWork` con el mismo `tx`. `findProductRefs` y `findUnitRefs` hoy usan el
`prisma` global: se les añade un parámetro opcional de cliente (o una factoría `(db) => …`, el
patrón que ya siguen `createMaterialReservations(tx)` y `createRecipeExecutionReader(tx)`), sin
cambiar su comportamiento con el cliente global. Un helper puro-de-orquestación
`loadRequirementUnits(scope, productIds, orderUnitId, companyId)` en
`pedidos/domain/order-requirement-units.ts` hace las tres lecturas y devuelve `RequirementUnits`;
con `orderUnitId === null` no lee el puente y deja `orderUnit: null` (R20).

Llamantes: `create-order.ts`, `update-order.ts`, `update-order-presentation-lines.ts`,
`review-blocked-orders.ts`, `transition-order.ts` (`fallbackRequirement`, R11). `order-packing.ts`
usa la fase `materials_consumed`, sin receta: no lee unidades.

**`not_convertible` en la reserva** → §8, Pregunta 1. En `transition-order.ts` y en
`review-blocked-orders.ts` el resultado es el mismo con las dos opciones: finalizar devuelve
`insufficient_material` sin consumir, y el desbloqueo deja el pedido `BLOQUEADO`.

## 5. Lo que se muestra

### 5.1 Ejecución — `asignaciones`

`get-assigned-order-execution.ts` ya lee `summary.unitId`. Añade el id a la lectura de unidades
que ya hace, pide `findMassVolumeBridge()` y calcula `resolveLineNeed` por línea.
`ExecutionLineView` cambia:

```ts
readonly quantity: string | null          // null solo si no convertible
readonly need: 'unconverted' | 'exact' | 'approximate' | 'not_convertible'
```

`order-execution-lines.tsx`: con `need === 'approximate'` pinta la marca «aprox.»
(`data-testid="order-execution-line-approximate-<i>"`); con `not_convertible`, sin cifra ni
selector y con el aviso (`order-execution-line-not-convertible-<i>`). El selector de unidad
alternativa convierte desde `quantity` ya convertida (R16).

### 5.2 Tabla de ingredientes — `order-ingredients-table.tsx`

Props nuevas: `orderUnitId: string` (el estado `unitId` del formulario; `''` = sin elegir) y
`bridge: MassVolumeBridge | null`. `requiredOf(line)` pasa a `resolveLineNeed(quantity,
line.percentage, unitConversionOf(line.productUnitId), { orderUnit, bridge })` con las
`UnitView` que ya llegan por props (traen `baseUnitId` y `factor`).

- `orderUnitId === ''` → «cantidad requerida» y «restante» con el marcador `—` (R19, N2).
- `not_convertible` → la fila pinta el aviso en la celda de «cantidad requerida»
  (`data-testid="order-ingredient-not-convertible"`) y `—` en «restante» (R14).
- `approximate` → la cifra lleva la marca «aprox.» (`order-ingredient-approximate`) (R15).
- `restante = stock − requerida`, igual que hoy, ahora con la requerida convertida (R13).

`bridge` llega como prop desde `app/(private)/pedidos/page.tsx`, que ya hace
`listUnitsAction()` en su `Promise.all`: se añade una acción de solo lectura
`getMassVolumeBridgeAction()` en `unidades/adapters/driving/unit-actions.ts` sobre
`findMassVolumeBridge`, y baja por `OrderSheet`/`OrderListSection` → `OrderForm`, igual que `units`.

### 5.3 Aviso de aproximación en el costo — `order-cost-quote.tsx`

`OrderCostQuote` recibe `approximate: boolean`. `order-form.tsx` lo calcula con la misma
`resolveLineNeed` sobre las líneas ya cargadas de la tabla, la unidad elegida y el puente:
`approximate = amount !== null && lines.some(l => need(l).kind === 'approximate')` (R18). No
viaja en la respuesta de la cotización: así la edición, que arranca con el importe **guardado**
sin cotizar, también lo marca, y no hay dos fuentes que puedan discrepar.
Testid: `order-cost-quote-approximate`.

## 6. Cotización — contrato de entrada

```ts
export const quoteOrderCostSchema = createOrderSchema
  .pick({ recipeId: true, quantity: true, unitId: true })
  .extend({ orderId: z.string().uuid().optional(), presentationLines: distributionLinesSchema.optional() })
```

`unitId` pasa a ser obligatorio: sin él, `safeParse` falla y `canQuote` del hook deja el guion
(R19). `quoteOrderCost` sigue con `requirePermission` como primera línea (R23). Una unidad que no
existe o no es visible para la empresa no aparece en `findRefs` → `orderUnit` sin resolver →
`not_convertible` en todas las líneas → `null` (R9). `useOrderCostQuote` recibe `unitId` en sus
manejadores y gana `onUnitChange(recipeId, quantity, unitId)`, conectado al
`PresentationUnitSelect` de `order-form.tsx:797` (R8).

## 7. Integraciones y permisos

Ninguna integración externa. Permisos sin cambio (D9): `pedidos.modificar` en la cotización y las
escrituras, `asignaciones.ejecutar` en la ejecución; los dos se comprueban en el service antes de
validar la entrada.

## 8. Preguntas abiertas — opciones (no se cierran aquí)

### Pregunta 1 — Reserva y guardado con una línea no convertible

| Opción | Qué pasa | A favor | En contra |
|---|---|---|---|
| **A. Como falta de material** | `not_convertible` se trata como `insufficient`: sin confirmación, `OrderWouldBlockError`; con ella, `BLOQUEADO` sin nada apartado. En edición/reparto se libera lo apartado (`releaseForOrder`) antes de bloquear. | Encaja con la letra de D4 («queda sin costo, como hoy cuando falta existencia»); reutiliza todo el flujo de QC-138, sin error nuevo. | El diálogo dice «no alcanza el material» cuando el material sí está; el revisor diario no lo desbloquea nunca (solo editar la unidad lo arregla): pedido zombi en la lista de bloqueados. |
| **B. Rechazar al guardar** | Error de dominio nuevo `OrderUnitNotConvertibleError` (code `order_unit_not_convertible`, mensaje en el catálogo de errores, diagnóstico con los `productId`); no se escribe nada. | El aviso es exacto y llega antes de existir el pedido; no hay bloqueados que nadie puede desbloquear; la tabla ya avisó (R14), así que no sorprende. | Un código de error y un mensaje nuevos; «el pedido queda sin costo» de D4 solo aplica a la cotización. |
| C. Guardar sin apartar esa línea | Se aparta el resto y la línea no convertible se ignora. | — | Deja salir a producción un pedido con un insumo que nadie apartó: descartada. |

**Recomendación: B.** El material no falta, falla la unidad; mezclarlo con QC-138 deja pedidos que
el proceso automático nunca puede resolver. Si el humano elige A, R12 toma su texto A y la task
T9 cambia de «rechaza» a «bloquea» (el resto del spec no cambia).

### Pregunta 2 — Cómo se ve «aprox.» y el aviso en el costo

| Opción | Línea (tabla y ejecución) | Costo |
|---|---|---|
| **a. Texto visible** | Etiqueta corta «aprox.» junto a la cifra, `text-muted-foreground`, con `title` «Conversión aproximada: 1 ml ≈ 1 g». | Una línea bajo el importe: «Incluye una aproximación masa↔volumen (1 l ≈ 1 kg).» |
| b. Icono con tooltip | Icono `≈`/`InfoIcon` con tooltip. | Icono junto al importe con tooltip. |
| c. Prefijo `≈` | «≈ 1,00 kg». | «≈ $ 1.234,00». |

**Recomendación: a.** La ejecución se usa en tableta (`min-h-11`, `TOUCH_TARGET`): un tooltip no
existe en táctil, así que b deja la marca invisible justo donde más importa. c es compacto pero
un lector de pantalla lee «aproximadamente igual» de forma inconsistente. Los tests van por
`data-testid` (§5): la elección no cambia ningún requisito ni test, solo el copy.

## 9. Alternativas descartadas

1. **Columna `dimension` (`mass`/`volume`/`count`) en `units`.** Más explícita que N1, pero exige
   migración con relleno, UI en `/configuracion/unidades` y decidir la dimensión de cada unidad
   propia existente: es otra ficha. N1 resuelve el caso con lo que el catálogo ya guarda.
2. **Identificar las familias por nombre o símbolo en cada consumidor** («kg», «l»…). Repetiría
   el criterio en cuatro sitios y fallaría con las unidades propias que derivan de las de sistema.
   §3.2 lo deja en una sola consulta.
3. **Persistir `ingredients_cost_approximate` en `orders`.** Haría falta migración y mantenerla en
   los seis recálculos; la marca se puede derivar siempre de las unidades (§5.3).
4. **Convertir dentro de `inventario` (`planReservation`).** Obligaría a `inventario` a conocer la
   unidad del pedido y la regla masa↔volumen, que son de `pedidos`; hoy `inventario` recibe la
   necesidad ya en la unidad del producto y así sigue.
5. **Leer productos y unidades fuera de la transacción y pasarlos al cierre.** Evita tocar
   `OrderTransactionScope`, pero en `transition-order.ts` las líneas de la receta solo se conocen
   dentro de la transacción; leerlas fuera también duplicaría la lectura de receta.

## 10. Dependencias de terceros

Ninguna. La aritmética es la de `convertQuantity` (`BigInt`, QC-76).

## 11. Riesgos

- **Cambio de firma en seis llamantes y en el scope transaccional.** Lo detecta `tsc`; los dobles
  de `OrderTransactionScope` de los tests unitarios existentes deben ganar `products` y `units`.
- **QC-206 (cambiar base/factor de una unidad en uso)** queda fuera: entre tanto, editar la unidad
  de un insumo puede convertir una línea antes exacta en no convertible; la reserva ya guardada
  no se toca (R22) y el siguiente recálculo aplica §8.
