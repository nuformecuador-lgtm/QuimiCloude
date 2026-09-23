# QC-141 — reserva-de-material-del-pedido · design.md

> **Enmendado el 2026-09-23 (review).** Segunda enmienda, tras el review F2.2 (RECHAZADO) y la
> decisión del humano registrada en **D21** (`requirements.md`). Resumen y mapa de lo que cambia en
> **§0.4**. Secciones tocadas: §0.3 (E1/E2 aprobadas), §4.0, §4.3 (nuevas §4.3.1 y §4.3.2), §5.2,
> §5.3, §5.4, §6.4, §8, §9.1, §9.2, §11, §12, §13 (nuevas §13.8-§13.10) y §15. **El código de
> `dev` que trae QC-145 (PR #112) no está en este worktree**: lo que aquí se dice de él sale del
> review y se confirma al mergear (task TR).

> **Enmendado el 2026-09-23** tras el merge de QC-147 (`cantidades-de-receta-en-porcentaje`,
> PR #108) en `dev`. Cambian §0 (nueva §0.3), §4 (nombres y §4.3), §5.1, §5.2, §6.1, §6.2, §6.4,
> §11, §12, §13 (nuevas §13.6 y §13.7) y §15. Las referencias de la enmienda marcadas «`dev`» son
> del árbol de `origin/dev` en `9003bf70`; el resto sigue siendo de esta rama al 2026-09-22.

> Cómo se construye lo que pide `requirements.md`. Las referencias `archivo:línea` son del árbol de
> la rama `feature/QC-141-reserva-de-material-del-pedido` al escribir este diseño (2026-09-22).
> Ninguna librería nueva (`[D18]`, `R47`).

---

## 0. Lo que necesita al humano en F1.4

Nada de esta sección se da por cerrado. Cada punto trae una **opción recomendada** para que F1.4
la apruebe o la cambie; los requisitos que dependen de ella están marcados **provisional** en
`requirements.md`.

### 0.1 Las cinco preguntas abiertas de la semilla

| # | Pregunta | Opción recomendada | Por qué | Requisitos |
|---|---|---|---|---|
| 1 | Pedido que nunca se cubre | **Espera indefinidamente**: sin material apartado no hay reserva que caduque, y el proceso diario no lo mira. | Es la lectura literal de D6 («la reserva caduca»), y QC-138 es quien le dará estado (`BLOQUEADO`). Cancelar a los 15 días de creado sería una segunda regla de caducidad que nadie decidió. | R22 |
| 2 | Entregar con el lote apartado mermado | **Completar desde otros lotes con disponible** (más antiguos primero) y, si ni así alcanza, **rechazar la entrega** con `insufficient_material` sin cambiar nada. | El inventario no puede quedar negativo (`CHECK stock >= 0` sigue) y «consumir lo que haya» deja la existencia contando material que salió de verdad. Rechazar solo ocurre si no hay material en ningún lote. | R30 |
| 3 | Canal de aviso de fallos del cron | **Registro estructurado en el log de Vercel** (una línea `console.error` con un nombre de evento fijo, `order_expiry_failed`, número de pedidos fallidos e identificadores de pedido y empresa, sin PII) **y respuesta `500`**, que Vercel marca como ejecución fallida en su panel de Cron Jobs. | No hay ningún canal en el repo, y el correo (Resend) vive en `identity` para otro fin: usarlo exigiría un módulo de notificaciones que nadie pidió. Alternativa si se quiere aviso activo: correo a una variable `OPS_ALERT_EMAIL`, en ficha propia. | R26 |
| 4 | Dónde se consulta el historial | **Dentro del «Historial del lote» que ya existe** (`app/(private)/inventario/components/batch-history.tsx`), intercalando apartados, liberaciones, caducidades y consumos con los movimientos, por fecha descendente. | Cada evento de reserva es de **un lote**, y ese desplegable ya se abre por lote, pide datos solo al abrirse y está protegido por `inventario.consultar`. No hace falta pantalla ni ruta nueva. | R38 |
| 5a | Decimales que se **muestran** | **Dos**, con el valor exacto en el `title` de la celda: `formatDecimalDisplay` y `exactDecimalTitle` de `lib/shared/ui/decimal-display.ts:119,137`. | Es el criterio que Pedidos ya usa desde el 2026-09-17 (`order-ingredients-table.tsx:53-62`); una segunda convención de pantalla sería otra verdad. | R6, R36, R37 |
| 5b | ¿`qty_alert` pasa a decimal? | **Sí**, a `Decimal(14,4)` en la misma migración. | La alerta se compara con la existencia (`product-columns.tsx:110`); comparar un entero con un decimal obliga a convertir uno de los dos en cada lectura. Si se decide que no, `T4` se queda sin ese punto y la comparación convierte el entero a cadena decimal. | — (no hay decisión que lo cubra: si se aprueba, se añade R) |

### 0.2 Preguntas nuevas que aparecen al diseñar

| # | Pregunta | Opción recomendada | Requisitos |
|---|---|---|---|
| N1 | *(Enmendada el 2026-09-23: la necesidad es ahora `pedido (4 dec.) × % (2 dec.) / 100`, hasta 8 decimales, sin conversión; el techo se mantiene. Ver §0.3.)* **D5 dice «sin redondear», pero no siempre cabe.** La cantidad necesaria es `línea (4 dec.) × pedido (4 dec.)`: hasta **8 decimales** (`0.1234 × 1.5678 = 0.19346652`), y convertir a la unidad del producto puede dar una división periódica (`convert-quantity.ts:128-153`, escala 12). La columna guarda 4. | **Redondear hacia arriba al cuarto decimal**, una vez por ingrediente y en la unidad del producto. Nunca aparta menos de lo necesario, y el exceso es menor que `0,0001` por ingrediente. Cuando cabe en 4 decimales no se redondea nada, que es D5 al pie de la letra. | R11 |
| N2 | **Entregar un pedido que no tiene nada apartado** (no alcanzó al crearlo). D12 dice que entregar consume, pero no hay qué. | **Calcular con la receta actual y consumir con la regla todo-o-nada de lo disponible**; si no alcanza, rechazar con `insufficient_material`. Misma respuesta que la pregunta 2 para que haya una sola regla de entrega. Coste: hoy el Finalizar de la planta nunca falla por material; con esto puede fallar. | R31 |
| N3 | *(**Derogada** el 2026-09-23: la línea ya no tiene unidad. La sustituye E1, §0.3.)* **D2 y D4 juntas.** D2: «si falta un solo ingrediente, no aparta ninguno». D4: el ingrediente de unidad incompatible «no se reserva». ¿Ese ingrediente cuenta como «falta»? | **No cuenta**: se salta y los demás se apartan. Es lo que QC-138 D1 fijó para el bloqueo («unidad sin base común no bloquea: es un dato incompleto, no falta de material»). | R9 |
| N4 | **La columna «restante» del formulario de pedido** (`order-ingredients-table.tsx:107-112`) resta lo requerido a la existencia **total**. Con reserva, dos pedidos de 1.500 sobre 2.000 se siguen viendo cubiertos en el formulario, que es el síntoma que originó la ficha. | Que reste de lo **disponible** (en una edición, sumando lo que el propio pedido tiene apartado). Cambia `RecipeLineView.productStock` de significado: pasa a ser «disponible». Si se prefiere no tocarlo, queda en total y solo cambia de tipo (R6). | R6 (tipo); el cambio de significado no está en ninguna decisión |
| N5 | **Borrar un pedido vivo** (`delete-order.ts:20` deja borrar `PENDIENTE` y `EN_CURSO`). Ninguna decisión lo menciona, y sin liberar, su material queda apartado para siempre por un pedido invisible. | **Liberar**, igual que cancelar, registrado como liberación. | R19 |
| N6 | **Cómo se ve la cobertura en Pedidos.** D9 exige «sin cobertura completa»; el E2E (D17) necesita ver que el segundo pedido «no aparta». | Una etiqueta en la fila del listado y en la hoja del pedido con tres valores: **«Apartado»**, **«Sin apartar»** y **«Sin cobertura completa»**. Texto y lugar a aprobar. | R35, R48 |
| N7 | **Hora del proceso diario.** Vercel programa en UTC y el repo no dice la zona horaria de la empresa. | `0 7 * * *` (07:00 UTC). En Hobby, Vercel lo ejecuta en algún momento de esa hora. | R23 |
| N8 | **La migración aparta con SQL** (§4.3), así que el reparto por lotes queda escrito **dos veces**: en TypeScript para la operación y en PL/pgSQL para la migración. | Aceptarlo, con un test de integración que compara las dos sobre los mismos datos (§12). La alternativa (un script de TypeScript en el `build`) está descartada en §13.3. | R43 |
| N9 | **Mensaje del alta** «Indica una existencia de 1 o más para derivar el costo del total» (`product-batch-input.ts:97`): con decimales el límite es «mayor que 0». | Cambiar a «Indica una existencia mayor que 0 para derivar el costo del total.». | R5 |
| N10 | **Material que entra después.** Un pedido que no apartó no vuelve a intentarlo cuando entra un lote: D3 solo recalcula al crear y al editar. | No hacer nada en esta ficha: es lo que QC-138 D2 hará al desbloquear. Se anota para que nadie lo lea como un olvido. | — |

F1.4 aprobó el 2026-09-22, por chat, todas las opciones recomendadas de §0.1 y §0.2
(`progress/current.md:19`). La enmienda de §0.3 toca dos de ellas: **N3 queda derogada** (ya no hay
unidad en la línea) y **N1 sigue en pie con otra escala**.

### 0.3 Enmienda del 2026-09-23: la fórmula de QC-147

**Qué cambió en `dev`** (`9003bf70`):

- `recipe_lines` pierde `quantity` y `unit_id` y gana `percentage DECIMAL(5,2)`, con
  `CHECK (percentage > 0 AND percentage <= 100)`
  (`db/migrations/20260922160000_recipe_lines_percentage/migration.sql:18-34`; modelo en
  `db/schema.prisma:407-420`). Las líneas de una receta suman exactamente 100,00 % (lo exige el
  service de `recetas`, no la base).
- Esa migración **borra todas las líneas de receta** (`migration.sql:13`). Una receta sin líneas no
  se puede guardar ni editar hasta traer líneas que sumen 100 % (R3 y R23 de QC-147).
- La cantidad consumida es `consumedQuantity(orderQuantity, percentage)`
  (`lib/modules/recetas/domain/recipe-percentage.ts:98-104`, publicada en
  `lib/modules/recetas/index.ts:45`): exacta, sin redondeo, con escala `s + 4` —hasta **8
  decimales** con una cantidad de pedido de 4—.
- La unidad del ingrediente es la del producto: `ProductRef.unitId`
  (`lib/modules/inventario/domain/product-catalog.ts:18-19`), `null` mientras el producto no tiene
  lotes. Un producto sin unidad **no puede tener lotes**: el disparador `product_batches_check_unit`
  rechaza el lote si `product_unit_id IS NULL`
  (`db/migrations/20260918130000_product_unit_and_stored_stock/migration.sql:89`).
- El coste ya la usa: `order-cost.ts:132` y `resolve-ingredients-cost.ts:26-36`.

**Lo que se corrige en este diseño:**

| Pieza | Antes | Ahora |
|---|---|---|
| Necesidad (§6.1, T6) | `línea.quantity × pedido`, en la unidad de la línea | `consumedQuantity(pedido, línea.percentage)`, en la unidad del producto |
| `ReservationRequirementLine` (§5.1) | `{ productId, quantity, unitId }` | `{ productId, quantity }` |
| Reparto (§6.2) | convierte de la unidad de la línea a la del producto; salta la unidad sin base común (N3) | sin conversión; producto sin unidad = no alcanza (E1) |
| Redondeo (N1, R11) | hasta 8 decimales por la multiplicación, más la división de la conversión | hasta 8 decimales por la multiplicación; se mantiene el techo al 4º decimal |
| `createMaterialReservations` (§5.2, T7) | recibe `UnitCatalog` para convertir | no lo necesita |
| Migración de pedidos vivos (§4.3, T11) | lee `recipe_lines.quantity` y `units` | lee `recipe_lines.percentage` y `products.unit_id`; la receta vacía no aparta (E2) |
| Nombres de migración (§4) | `20260922160000_…` choca con la de QC-147 | renumeradas (§4.0) |

**Decisiones nuevas para aprobar:**

| # | Pregunta | Opción recomendada | Por qué | Requisitos |
|---|---|---|---|---|
| E1 | **Producto sin unidad** (sin lotes). Con la línea sin unidad, R9/N3 ya no tienen objeto; queda el ingrediente cuyo producto no tiene unidad en la que expresar la necesidad. | **Cuenta como «no alcanza»**: el pedido no aparta nada (D2), y una entrega sin apartado (R31) se rechaza con `insufficient_material`. | Es la realidad física: un producto sin unidad no puede tener lotes (`migration.sql:89` de QC-121), así que no hay material. Saltarlo, como hacía N3, dejaría apartar un pedido al que le falta un ingrediente entero y verlo «Apartado» sin serlo. QC-138 lo bloqueará igual que cualquier otro pedido que no alcanza. | R9 |
| E2 | **Receta sin líneas.** Tras QC-147 todas las recetas existentes están vacías, y con ellas los pedidos vivos. | **Crear, editar y migrar: no aparta y no da error**; el pedido queda «Sin apartar» (sin `reserved_at`, no caduca, pregunta 1). **Entregar sin nada apartado: se rechaza** con el código nuevo `recipe_without_lines`, «La receta del pedido no tiene ingredientes: complétala antes de entregarlo.», por el Finalizar de la planta y por la edición en Pedidos. | Entregar sin consumir registraría producto terminado sin ninguna salida de material, en silencio. Con la receta recargada, la entrega consume por R31 con la receta actual. Coste, dicho a sabiendas: hasta que alguien recargue la receta, el Finalizar de esos pedidos falla con ese mensaje. Alternativa si ese coste no se acepta: entregar sin consumir (§13.7). | R49, R50 |

~~Mientras E1 y E2 no se aprueben, R9, R49 y R50 no se implementan (T6 y T10 esperan).~~
*(Enmendado el 2026-09-23 (review).)* **E1 y E2 están aprobadas** por el humano desde el
2026-09-23 (D21 de `requirements.md`); R9, R49 y R50 ya no son provisionales.

### 0.4 Enmienda del review (2026-09-23)

Lo que decidió el humano (D21) y dónde se construye:

| Hallazgo | Decisión | Diseño | Requisitos |
|---|---|---|---|
| **B1** Comentarios de producción que citan requisitos o `design.md` (`order-prisma.ts:772`, `lib/composition/index.ts:997`) | Se quitan las citas; queda el motivo | sin cambio de diseño; task TB1 | — (`docs/conventions.md > Comentarios`) |
| **B2** El proceso diario no re-comprueba `reserved_at` con la fila bloqueada | La fila bloqueada trae `reserved_at`; nada si es `null` o posterior al umbral | §9.2 | R53 |
| **B3** Alias `sharedPrismaClient` que esquiva `guard-ambito-empresa-pedidos` | **Excepción con nombre de archivo** en la guardia, con motivo que cita D21; vuelve `prisma` | §5.2.1 | R58 |
| **B4** Rama sin integrar con `dev` (QC-145, `a01c90cb`) | **Solo el Finalizar consume**, en la misma transacción que escribe `finished_at`; R29 retirado | §4.0, §5.3, §5.4, §8, §12 | R12, R27, R29 (retirado), R50, R51, R52 |
| **m1** Marcas «provisional» | Se quitan de `requirements.md` | — | R9, R19, R22, R26, R30, R31, R38, R49, R50 |
| **m2** `createOrder`, `transitionAliveOrder` sin uso e `INSERT` duplicado | Se retiran; `order-sequence.int` ejercita la unidad de trabajo | §5.3 | R15 (el test del correlativo) |
| **m3** Nadie vigila que quien llama a `consumeBatchStock` recalcule `products.stock` | Guardia nueva | §6.4 | R28 |
| **m4** Errores del cron | Log en todo fallo, fallo aislado por empresa, código de error, sin repetir un pedido que falla | §9.2 | R26, R54, R55 |
| **m5** El SQL de la migración no ordena los lotes como el comparador de TS | La migración usa el mismo comparador por pares | §4.3.1 | R43, R56; pregunta abierta 7 |
| **m6** `…/down.sql` de la migración que aparta deja el libro incoherente tras uso de la app | El `down` falla si hubo actividad posterior | §4.3.2 | R57 |
| **m7** La receta se lee con el cliente global dentro de la transacción | La unidad de trabajo ofrece también el lector de recetas sobre `tx` | §5.2.2 | — (no cambia comportamiento observable; test de dobles) |

---

## 1. Mapa de la solución

```
                         app / Server Actions / Route Handler del cron
                                        │
                              lib/composition (cablea)
          ┌─────────────────────────────┼──────────────────────────────┐
          ▼                             ▼                              ▼
   pedidos (dominio)             asignaciones (dominio)          inventario (dominio)
   create/update/cancel/         finishAssignedOrder ──► OrderCatalog  planReservation
   delete/transition/expire          (sin cambios de       .transitionAliveById   compareBatchesOldestFirst
        │                             lógica)               (ahora consume)       MaterialReservations (tipo)
        ▼                                                                           ▲
   OrderUnitOfWork.run(work) ──── una transacción ────► { orders(tx), reservations(tx) }
        │                                                                           │
   pedidos/driven: order-unit-of-work-prisma  ── pasa `tx` ──►  inventario/driven: reservation-prisma
                    order-prisma (factory)                                         product-prisma.consumeBatchStock
```

- **`inventario` es dueño de la reserva**: las tablas, el reparto por lotes y el consumo. Es el
  dueño de los lotes y de la existencia; nadie más escribe `product_batches`.
- **`pedidos` decide cuándo** se aparta, libera o consume, porque es quien sabe de la receta y del
  estado. Le pasa a `inventario` la **necesidad ya calculada** (producto y cantidad, ya en la unidad
  del producto; enmendado el 2026-09-23).
- **La transacción la abre un adaptador driven de `pedidos`** y la comparten los dos repositorios
  por inyección desde `lib/composition` (§5.2).
- **El grafo de módulos no cambia de forma**: `pedidos → inventario` ya existe
  (`create-order.ts:9`); `inventario` no importa ni `pedidos` ni `recetas`, que cerraría un ciclo
  (`tests/guards/guard-arquitectura-modulos.test.ts:749-832`).

---

## 2. Existencia decimal (absorbe QC-149)

### 2.1 Qué cambia y dónde

| Pieza | Hoy | Cambio |
|---|---|---|
| `db/schema.prisma:279` `Product.stock` | `Int @default(0)` | `Decimal @default(0) @db.Decimal(14, 4)` |
| `db/schema.prisma:280` `Product.qtyAlert` | `Int?` | `Decimal? @db.Decimal(14, 4)` **si se aprueba 0.1-5b** |
| `db/schema.prisma:305` `ProductBatch.stock` | `Int` | `Decimal @db.Decimal(14, 4)` |
| `db/schema.prisma:350` `InventoryMovement.quantity` | `Int` | `Decimal @db.Decimal(14, 4)` |
| `lib/modules/inventario/domain/product-view.ts:47,50` | `stock: number`, `qtyAlert: number \| null` | `stock: string` (4 decimales), `qtyAlert: string \| null` si 5b; más `reserved` y `available` (§10) |
| `.../domain/product-batch-view.ts` | `stock: number` | `stock: string`, más `reserved`, `available`, `overReserved` |
| `.../domain/inventory-movement.ts:5,16` | `quantity: number`, `kind: 'opening' \| 'adjustment'` | `quantity: string`; `kind` gana `'consumption'`; `NewInventoryMovement` gana `orderId: string \| null` |
| `.../domain/product-stock.ts:3-32` | suma `number` | `quantity: string`; `sumStockByUnit` suma con el decimal exacto de §2.3 |
| `.../domain/costing-batch.ts:10` | `stock: number` | `stock: string` |
| `.../domain/product-batch.ts` (`NewProductBatch.stock`) | `number` | `string` |
| `.../domain/product-batch-input.ts:28` | `z.number().int().min(0)` | cadena `^\d{1,10}(\.\d{1,4})?$` (el mismo `DECIMAL_PATTERN` de la línea 13), cero permitido |
| `.../domain/product-batch-input.ts:123,141,147` | `Number.isInteger`, `stock < 1`, `deriveUnitCost(total, stock)` | la existencia se compara como decimal; «mayor que 0» (N9) |
| `.../domain/unit-cost.ts:77-86` | `deriveUnitCost(totalCost: string, stock: number)` | `stock: string`; `total × 10^4 / stock` sobre enteros escalados, `HALF_UP` a 4 |
| `.../domain/adjust-batch-stock.ts:20-27,44` | `delta: z.number().int()`, devuelve `{ stock: number }` | `delta` cadena `^-?\d{1,10}(\.\d{1,4})?$` distinta de cero; devuelve `{ stock: string; reserved: string; overReserved: boolean }` (R33) |
| `.../domain/create-product.ts:33,97` | pasa `stock` numérico | pasa la cadena |
| `.../adapters/driving/batch-actions.ts:30,47-56,86` | `readOptionalFormInt`, mensaje «numero entero» | lector decimal con signo (`^-?\d+(\.\d+)?$`); mensaje «La cantidad del ajuste no es un número decimal válido.»; `AdjustBatchStockFormState.stock: string` |
| `.../adapters/driving/product-actions.ts:105` | `readOptionalFormInt(formData, 'stock')` | lector decimal sin signo |
| `.../adapters/driven/persistence/product-prisma.ts:55,671` | `stock: row.stock` | `row.stock.toFixed(4)` |
| `product-prisma.ts:175-179` | filtro `numberRange` de `stock` con `number` | a `Prisma.Decimal`, como `toDecimalRange` de `order-prisma.ts:368-375` |
| `product-prisma.ts:290-312` `recalculateProductStock` | suma en JS con `singleUnitStock` | `UPDATE products SET stock = COALESCE((SELECT sum(stock) FROM product_batches WHERE product_id = … AND company_id = …), 0)`: la suma la hace Postgres en `numeric`. La comprobación de unidades mezcladas la garantiza ya el disparador `product_batches_check_unit` (`20260918130000_product_unit_and_stored_stock/migration.sql:70-102`). Se exporta para el consumo (§6.4) |
| `product-prisma.ts:393,592,640` | `stock: batch.stock`, `quantity: batch.stock` | `new Prisma.Decimal(batch.stock)` |
| `product-prisma.ts:715-755` `adjustBatchStock` | `delta: number`, `increment: delta` | `delta: string` → `Prisma.Decimal`; además lee el apartado del lote para devolver `overReserved` |
| `.../persistence/batch-movement-prisma.ts:16-33,51-60` | `quantity` numérica | `Prisma.Decimal` al escribir, `.toFixed(4)` al leer; escribe `orderId` |
| `.../persistence/product-catalog-prisma.ts:42-48,79,101-110` | `stock: number` | cadena `.toFixed(4)` |
| `lib/modules/recetas/domain/recipe-view.ts:49`, `get-recipe.ts:19-23` | `productStock: number \| null` | `string \| null` (con `'0.0000'` en vez de `0`) |
| `lib/modules/pedidos/domain/order-cost.ts:154` | `String(batch.stock)` | `batch.stock` (ya es cadena) |
| `app/(private)/pedidos/components/order-ingredients-table.tsx:109,173,179` | `line.productStock.toString()` | la cadena tal cual; significado según N4 |
| `app/(private)/inventario/components/product-columns.tsx:110,129` | `qtyAlert > product.stock` y `String(product.stock)` | comparación decimal exacta (§2.3) y `formatDecimalDisplay` + `exactDecimalTitle` |
| `.../components/product-batches-panel.tsx:43-47` | `String(batch.stock)` | igual que arriba, más «Apartado», «Disponible» y la marca «Sobre-reservado» |
| `.../components/product-cost-amount.ts:85-86,101-102` | `quantity: number` entero | `quantity: string` decimal; el total/unitario de 2 decimales del panel sigue igual |
| `.../components/product-form.tsx:527-532` y `adjust-batch-dialog.tsx` | campo numérico entero | campo de texto decimal con `inputMode="decimal"`, `font-size >= 16px`; coma convertida a punto como en `sanitizeCostInput` (`product-cost-amount.ts:65-76`) |

### 2.2 Los `CHECK` que siguen

`product_batches_stock_non_negative` (`20260909120000_product_batches/migration.sql:57`),
`products_stock_non_negative` (`20260918130000_.../migration.sql:53`) e
`inventory_movements_quantity_not_zero` (`20260917130000_inventory_movements/migration.sql:33`)
**no se tocan**: `ALTER COLUMN ... TYPE numeric(14,4)` los conserva y Postgres los revalida. El
índice parcial `products_stock_idx` se reconstruye solo con el cambio de tipo.

### 2.3 Aritmética decimal sin librería

`inventario/domain/decimal-quantity.ts` (nuevo): `addQuantities`, `subtractQuantities`,
`compareQuantities`, `minQuantity`, `ceilToScale4`, todas sobre cadenas y `BigInt` a escala fija.
Es el mismo patrón que ya tienen `unidades` (`convert-quantity.ts`), `pedidos` (`order-cost.ts`) e
`inventario` (`unit-cost.ts`). **No se usa una librería de decimales** porque `[D18]` lo cierra y
porque QC-90 ya evaluó y descartó una (`unit-cost.ts:5-8`); lo que pide
`docs/architecture.md > Anti-patrones` («utilidad escrita a mano... sin que el design.md explique
por qué») queda explicado aquí. Las sumas por lote y por producto las hace Postgres en `numeric`;
en TypeScript solo se opera al repartir (§6).

### 2.4 Tests que hoy fijan enteros y hay que cambiar

| Test | Qué fija |
|---|---|
| `tests/unit/inventario/schema/inventario-schema.test.ts:270,344,927` | `stock.type === 'Int'` |
| `tests/unit/inventario/qc91-alcance.test.ts:447-450,585-590` | `stock Int` en el esquema |
| `tests/unit/inventario/adjust-batch-stock.test.ts:110` | `delta: 1.5` se rechaza |
| `tests/unit/inventario/batch-actions.test.ts:190` | «rechaza un delta que no es un entero» |
| `tests/unit/inventario/product-batch-input.test.ts:342-346` | `stock: 1.5` se rechaza, `stock` numérico |
| `tests/unit/inventario/product-cost-amount.test.ts:85` | `multiplyCost('12.50', 1.5)` es `null` |
| `tests/unit/inventario/product-batches-panel.test.tsx:76` | la cantidad pintada es `String(batch.stock)` |
| `tests/unit/inventario/product-input.test.ts:221-234` | `qtyAlert: 1.5` se rechaza (solo si 5b) |
| `tests/unit/inventario/authorization.test.ts:96` | entrada mínima del ajuste con delta entero |
| `tests/integration/inventario/product-stock.int.test.ts:386` | sumas enteras de lotes y ajustes |
| `e2e/ajuste-de-inventario.spec.ts` | revisar: teclea deltas enteros |

Los tests de migraciones viejas (`qc121-alcance.test.ts:408,597`,
`inventario-migration.test.ts:385-398`) leen archivos de migraciones ya aplicadas, que no se
tocan: **no cambian**.

---

## 3. Modelo de datos

### 3.1 Tabla nueva `reservation_movements` (módulo `inventario`)

Libro **append-only** de la reserva, con la misma filosofía que `inventory_movements`
(`schema.prisma:340`: «Un asiento no se corrige: se corrige con otro»). Sin `updated_at` ni
`deleted_at`, a propósito (`R39`).

```prisma
enum ReservationMovementKind {
  reserve
  release
  expire
  consume
}

/// @module inventario
model ReservationMovement {
  id        String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  companyId String                  @map("company_id") @db.Uuid
  orderId   String                  @map("order_id") @db.Uuid
  batchId   String                  @map("batch_id") @db.Uuid
  kind      ReservationMovementKind
  quantity  Decimal                 @db.Decimal(14, 4)
  createdBy String?                 @map("created_by") @db.Uuid
  createdAt DateTime                @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([batchId], map: "reservation_movements_batch_id_idx")
  @@index([orderId], map: "reservation_movements_order_id_idx")
  @@index([companyId], map: "reservation_movements_company_id_idx")
  @@index([createdBy], map: "reservation_movements_created_by_idx")
  @@map("reservation_movements")
}
```

- **`quantity` siempre positiva** (`CHECK (quantity > 0)`); el signo lo da `kind`: `reserve` suma,
  los otros tres restan. Lo apartado de un pedido en un lote es
  `Σ reserve − Σ (release + expire + consume)`.
- **FK escritas a mano, sin `@relation`** (drift, como `order_assignments`):
  - `(order_id, company_id) → orders (id, company_id)` contra `orders_id_company_id_key`
    (`schema.prisma:564`): una reserva no puede apuntar a un pedido de otra empresa (`R17`).
  - `(batch_id, company_id) → product_batches (id, company_id)` contra una clave nueva
    `product_batches_id_company_id_key` (`UNIQUE (id, company_id)`). Se prefiere a un disparador
    como `inventory_movements_check_company` porque es la forma que ya usan las tablas nuevas.
  - `company_id → companies`, `created_by → users` (`ON DELETE RESTRICT`).
- **`created_by` NULL = el sistema** (proceso diario, migración), igual que en el resto del repo.
- **`CHECK (kind <> 'expire' OR created_by IS NULL)`**: la caducidad **nunca** tiene autor
  (`[D7]`). No se exige lo contrario para el resto: la migración aparta sin persona (`reserve` sin
  autor), así que un `CHECK` más estricto la rechazaría.
- **RLS** `ENABLE` + `FORCE`, sin policies (`tests/guards/guard-rls-force.test.ts`).
- **`company_id` obligatoria** (`tests/guards/guard-empresa-en-esquema.test.ts`).

### 3.2 Cambios en `inventory_movements`

- `kind` gana **`consumption`** al final del enum (`ALTER TYPE ... ADD VALUE`, §4.1).
- Columna nueva **`order_id UUID NULL`** con FK compuesta `(order_id, company_id) → orders` y
  `CHECK ((kind = 'consumption') = (order_id IS NOT NULL))`: una salida por entrega siempre dice de
  qué pedido, y ningún otro asiento lleva pedido.
- `inventory_movements_reason_matches_kind` se reescribe: `consumption` va **sin** motivo, como
  `opening`.
- La salida se guarda con **cantidad negativa**, como el ajuste que resta.

### 3.3 Columna nueva en `orders` (módulo `pedidos`)

**`reserved_at TIMESTAMPTZ NULL`**: el instante desde el que cuentan los 15 días (`R20`). La
escribe `pedidos` en la misma transacción:

| Operación | `reserved_at` |
|---|---|
| Crear o editar y **aparta** | `now` (la edición reinicia el plazo, `[D3]`) |
| Crear o editar y **no aparta** | `NULL` |
| Cancelar, caducar, borrar, entregar | `NULL` |
| Migración, pedido que aparta | instante de la migración (`[D10]`) |

Índice parcial para el proceso diario:
`orders_expirable_idx ON orders (reserved_at) WHERE status = 'PENDIENTE' AND deleted_at IS NULL
AND reserved_at IS NOT NULL`.

**Por qué en `orders` y no derivado del libro:** la caducidad es del **pedido** —lo que se cancela
es el pedido— y con la diferencia por lote de `R12` una edición que no cambia lo apartado no
escribe ningún asiento, así que el libro no sabría que el plazo se reinició.

### 3.4 Lecturas derivadas, sin columnas desnormalizadas

- **Apartado por lote**: `Σ` con signo sobre `reservation_movements` agrupado por `batch_id`.
- **Disponible por lote**: `greatest(stock − apartado, 0)`. **Sobre-reservado**: `apartado > stock`.
- **Por producto**: `reserved = Σ apartado`, `available = Σ disponible` de sus lotes (`R36`).
  `total ≠ reserved + available` exactamente cuando hay algún lote sobre-reservado.
- **Cobertura de un pedido** (`R35`, N6): `none` sin apartado vivo; `partial` si alguno de sus lotes
  está sobre-reservado; `full` en otro caso.

No se guarda `reserved` en `product_batches` ni en `products`: sería una segunda verdad de lo que
ya dice el libro. El coste es una agregación por página del listado (≤ 25 productos) con índice
por `batch_id` (§13.4).

---

## 4. Migraciones

Tres, por orden. Cada una con su `down.sql`.

### 4.0 Nombres (enmendado el 2026-09-23)

T1 y T2 se crearon como `20260922160000_inventory_movement_kind_consumption` y
`20260922160100_reservations_and_decimal_stock`. La primera **comparte prefijo** con
`20260922160000_recipe_lines_percentage` de `dev`, y Prisma ordena por nombre: la nuestra quedaría
antes que la de QC-147 solo por el orden alfabético del sufijo. Se renumeran las dos, y la de T11
nace ya con prefijo posterior, **siempre por detrás de la última migración de `dev` en el momento
del merge**. Con la de `dev` en `9003bf70`:

| Migración | Nombre |
|---|---|
| §4.1 | `20260923120000_inventory_movement_kind_consumption` |
| §4.2 | `20260923120100_reservations_and_decimal_stock` |
| §4.3 | `20260923120200_reserve_existing_orders` |

Ninguna de las dos ha llegado a `dev`. Constan aplicadas en la base local y en la plantilla de
integración de esta rama (bitácora, «Salida de los comandos» de T1-T3); si alguna otra base las
aplicó —no consta—, hay que revertirlas allí igual antes de renombrar. El procedimiento está en la
task TM.

**Segunda renumeración (enmendado el 2026-09-23 (review), B4).** `dev` ganó con QC-145 y
`a01c90cb` dos migraciones: `20260923120000_orders_finished_at` —**mismo prefijo** que nuestra
§4.1— y `20260923140000_product_batch_nullable_machine`, que queda **por delante** de las tres
nuestras. Las tres se renumeran por detrás de `20260923140000`:

| Migración | Nombre anterior | Nombre nuevo |
|---|---|---|
| §4.1 | `20260923120000_inventory_movement_kind_consumption` | `20260923150000_inventory_movement_kind_consumption` |
| §4.2 | `20260923120100_reservations_and_decimal_stock` | `20260923150100_reservations_and_decimal_stock` |
| §4.3 | `20260923120200_reserve_existing_orders` | `20260923150200_reserve_existing_orders` |

Si al mergear `dev` trae otra migración posterior a `20260923140000`, el prefijo sube hasta quedar
por detrás de la última: la regla es la de arriba, no la cifra. La base propia de la rama
(`QuimiCloude_QC141`) tiene aplicadas las tres con el nombre anterior; el procedimiento para
ponerla al día está en la task TR.

### 4.1 `<ts>_inventory_movement_kind_consumption`

`ALTER TYPE "InventoryMovementKind" ADD VALUE 'consumption';` y nada más. Va sola porque Postgres
no deja **usar** un valor de enum añadido en la misma transacción, y la migración siguiente lo usa
en un `CHECK`.

`down.sql`: Postgres no sabe quitar un valor de enum. Se recrea el tipo sin él (renombrar,
crear, `ALTER COLUMN ... USING kind::text::"InventoryMovementKind"`, borrar el viejo), y **falla
a propósito** si queda algún asiento `consumption` (`DO $$ ... RAISE EXCEPTION`), porque borrarlo
sería perder una salida real.

### 4.2 `<ts>_reservations_and_decimal_stock`

Escrita a mano, con el paréntesis de RLS (`NO FORCE` / `FORCE`) de
`20260918130000_product_unit_and_stored_stock/migration.sql:10-12,129-134`.

1. `ALTER COLUMN ... TYPE numeric(14,4) USING <col>::numeric(14,4)` en `product_batches.stock`,
   `inventory_movements.quantity`, `products.stock` (y `products.qty_alert` si 5b). Los enteros se
   conservan exactos (`R2`).
2. `product_batches_id_company_id_key`.
3. Enum `ReservationMovementKind`, tabla `reservation_movements`, sus FK, `CHECK`, índices, RLS.
4. `inventory_movements.order_id`, su FK, su índice y los dos `CHECK` de §3.2.
5. `orders.reserved_at` y `orders_expirable_idx`.

`down.sql`, en orden inverso: quita lo añadido y devuelve los tipos a `integer`, **después** de un
bloque que falla si alguna de esas columnas tiene parte decimal
(`WHERE stock <> trunc(stock)`), para no truncar existencias en silencio (`R45`).

### 4.3 `<ts>_reserve_existing_orders` (el apartado de los pedidos vivos)

Un bloque `DO $$ ... $$` en PL/pgSQL que, **por empresa y por pedido vivo en orden de
`created_at, order_year, order_sequence, id`**:

*(Pasos 1, 2 y 4 y el paréntesis de RLS enmendados el 2026-09-23 por la fórmula de QC-147: la
versión anterior leía `recipe_lines.quantity` y la unidad de la línea, columnas que ya no existen en
`dev` — `migration.sql:18-26` de `20260922160000_recipe_lines_percentage`.)*

1. Lee las líneas de su receta (`recipe_lines.product_id`, `recipe_lines.percentage`), la cantidad
   del pedido y la unidad de cada producto (`products.unit_id`). **Si la receta no tiene líneas, el
   pedido no aparta y se pasa al siguiente** (E2, R43, R49). Tras QC-147, que vació todas las
   recetas (`migration.sql:13`), eso es lo esperable para todos los pedidos vivos cuya receta nadie
   haya recargado antes de que corra esta migración; la migración sigue haciendo falta para los que
   sí.
2. Por línea: si `products.unit_id IS NULL`, la línea **no se cubre** (E1). Si no,
   `need = ceil(order.quantity × line.percentage × 100) / 10000` como `numeric(14,4)`: es
   `pedido × % / 100` redondeado **hacia arriba** al cuarto decimal (N1), con `numeric` exacto y sin
   división real (el `× 100` y el `/ 10000` solo mueven la coma). Sin conversión de unidades: la
   necesidad ya está en la unidad del producto, que es la de sus lotes (`product_batches_check_unit`).
   Es la misma cifra que `ceilToScale4(consumedQuantity(...))` en TypeScript
   (`recipe-percentage.ts:98-104`).
3. Recorre los lotes del producto con disponible `> 0` por `purchase_date`, y desempata por
   `lot` —numérico si los dos son solo dígitos (`lot ~ '^[0-9]+$'`), texto si no—, restando lo que
   ya apartaron los pedidos anteriores de **esta misma** migración.
4. Si alguna línea no se cubre, no escribe nada para ese pedido (`[D2]`). Si todas se cubren,
   inserta un `reserve` por lote, sin autor, con `created_at = now()`, y pone
   `orders.reserved_at = now()` (`R44`).

El paréntesis de RLS abarca `orders`, `recipe_lines`, `products`, `product_batches` y
`reservation_movements` (ya no `units`).

`down.sql`: `UPDATE orders SET reserved_at = NULL` y el borrado de los asientos `reserve` con
`created_by IS NULL` y `created_at` igual al de la migración. Es la **única** baja física de la
ficha y es una reversión de esquema, no una operación de negocio. En la práctica, revertir 4.2
elimina la tabla entera.

**Por qué SQL y no un script:** §13.3.

### 4.3.1 El orden de lotes en SQL, igual que en TypeScript (enmendado el 2026-09-23 (review), m5)

**Qué falla hoy.** El paso 3 ordena con un `ORDER BY` que pone primero los lotes de solo dígitos y
compara el resto con la collation de la base. `compareBatchesOldestFirst` (TypeScript) compara **por
pares**: por número si los dos son de solo dígitos; si no, como texto **por unidad de código**
(operador `<`, sin `localeCompare`). Divergen en la misma fecha con `'-X'` y `'5'` (TS: `'-X'`
primero, porque `'-'` es U+002D y `'5'` es U+0035; SQL: `'5'` primero) y con `'a'` y `'B'` (TS:
`'B'` primero; la collation de la base puede poner `'a'` primero).

**Cómo se arregla.** La migración deja de ordenar con una clave y usa el **mismo comparador por
pares**:

- Una función `lot_precedes(a text, b text) returns boolean` **dentro del bloque de la migración**
  (`pg_temp`, para no dejar objetos en el esquema): si los dos casan con `'^[0-9]+$'`, compara
  `a::numeric < b::numeric`; si no, `a COLLATE "C" < b COLLATE "C"`.
- Por producto, los lotes con disponible se leen ordenados por `purchase_date` y, dentro de cada
  fecha, se colocan con **ordenación por inserción** usando `lot_precedes`. Es cuadrática en el
  número de lotes de una misma fecha y producto, que es pequeño; corre una sola vez.
- `COLLATE "C"` compara bytes UTF-8, que coinciden con el orden de unidades de código UTF-16 de JS
  **salvo** entre caracteres fuera del plano básico y los de U+E000-U+FFFF. No consta que el número
  de lote admita esos caracteres; si los admite, es la única diferencia que queda y se anota en el
  test.
- El número de lote es único por empresa (QC-81), así que no hay empates entre lotes distintos.

**Límite: el comparador no es un orden total.** Con tres lotes de la misma fecha puede cerrar un
ciclo (`'9' < '10'` por número, `'10' < '1a'` y `'1a' < '9'` por texto). Con un ciclo, ni
`Array.prototype.sort` ni la ordenación por inserción tienen un resultado único, y no hay forma de
garantizar la paridad sin cambiar el comparador. Eso es la **pregunta abierta 7** de
`requirements.md`; R56 exige la paridad solo en los conjuntos sin ciclo. Hasta que el humano
decida, no se cambia `compareBatchesOldestFirst` (su orden lo usa también el coste de QC-123).

**Test.** El de paridad (`reserve-existing-orders-migration.int.test.ts`) gana casos en la misma
fecha con `'-X'`/`'5'`, `'a'`/`'B'` y una mezcla de cuatro lotes sin ciclo (`'2'`, `'10'`, `'-X'`,
`'B'`), comparando el reparto de la migración con el de `planReservation`.

### 4.3.2 El `down` que no deja el libro incoherente (enmendado el 2026-09-23 (review), m6)

El `down.sql` de §4.3 empieza con un bloque `DO $$ ... RAISE EXCEPTION` que **falla sin cambiar
nada** si, sobre algún pedido que apartó la migración, existe cualquier asiento de
`reservation_movements` que **no** sea uno de los `reserve` de la propia migración (mismo criterio
de hoy: `created_by IS NULL` y el `created_at` de la migración), o si su `orders.reserved_at` ya no
es el instante de la migración (una edición volvió a apartar o lo dejó sin apartar). Solo si no hay
nada de eso borra los `reserve` de la migración y anula `reserved_at`. Así el `down` solo corre en el
caso para el que existe: revertir antes de que la app haya operado sobre esos pedidos (R57). Revertir
después sigue siendo posible por §4.2, que elimina la tabla entera.

Test en `reserve-existing-orders-migration.int.test.ts`: aplicar, registrar un `release` sobre un
pedido apartado por la migración, ejecutar el `down` y comprobar que falla y que el libro y
`reserved_at` no cambian; y el caso limpio, que revierte.

---

## 5. Contratos entre módulos

### 5.1 Lo que publica `inventario` (solo tipos y dominio puro)

En `lib/modules/inventario/index.ts`, bloque nuevo al final:

*(Enmendado el 2026-09-23: `ReservationRequirementLine` pierde `unitId` —hoy en
`lib/modules/inventario/domain/reservation.ts:16` de esta rama— y `ConsumptionOutcome` gana
`nothing_to_consume` para E2.)*

```ts
export type ReservationRequirementLine = {
  readonly productId: ProductId;
  /** Cantidad del pedido por el porcentaje de la línea, exacta y sin redondear, en la unidad del
   *  producto. */
  readonly quantity: string;
};

export type ReservationOutcome = { readonly kind: 'reserved' } | { readonly kind: 'not_reserved' };

export type ConsumptionOutcome =
  | { readonly kind: 'consumed' }
  | { readonly kind: 'insufficient'; readonly productIds: readonly ProductId[] }
  /** Sin nada apartado y con una necesidad de respaldo vacía (receta sin líneas). */
  | { readonly kind: 'nothing_to_consume' };

export type OrderCoverage = 'full' | 'partial' | 'none';

/** Escritura. Siempre dentro de la transacción que abre quien llama. */
export interface MaterialReservations {
  syncForOrder(input: {
    readonly orderId: string; readonly companyId: string;
    readonly requirement: readonly ReservationRequirementLine[];
    readonly actorId: string | null; readonly now: Date;
  }): Promise<ReservationOutcome>;

  releaseForOrder(input: {
    readonly orderId: string; readonly companyId: string;
    readonly reason: 'release' | 'expire';
    readonly actorId: string | null; readonly now: Date;
  }): Promise<void>;

  consumeForOrder(input: {
    readonly orderId: string; readonly companyId: string;
    /** Solo se usa si el pedido no tiene nada apartado (N2). */
    readonly fallbackRequirement: readonly ReservationRequirementLine[];
    readonly actorId: string; readonly now: Date;
  }): Promise<ConsumptionOutcome>;
}

/** Lectura, fuera de transacción. */
export interface ReservationQueries {
  findCoverageByOrderIds(companyId: string, orderIds: readonly string[]):
    Promise<ReadonlyMap<string, OrderCoverage>>;
}

export { compareBatchesOldestFirst } from './domain/batch-order';
export { planReservation } from './domain/plan-reservation';
```

`compareBatchesOldestFirst` es el comparador que hoy vive privado en
`pedidos/domain/order-cost.ts:94-117` (`compareLots` + `compareBatches`), **movido** al dueño de
los lotes y genérico sobre `{ purchaseDate; lot }`. `order-cost.ts` pasa a importarlo del barril
de `inventario` (arista `pedidos → inventario` que ya existe). Queda **una** definición del orden
para el coste y para la reserva, que es lo que pide `[D4]` al heredar QC-123 D3 y D18.

### 5.2 La transacción compartida

**El problema.** Crear un pedido y apartar su material escriben tablas de dos módulos, y `R15` pide
que las dos cosas pasen o ninguna. Hoy no hay ningún precedente de transacción entre módulos:
`lib/composition` no puede importar el cliente Prisma
(`guard-arquitectura-modulos.test.ts:638-645`), un driven no puede importar el driven de otro
módulo (`docs/architecture.md:299`), y `order-prisma.ts` abre sus propias transacciones
(`order-prisma.ts:180`).

**La solución** es la que dejó escrita `lib/composition/index.ts:1056-1061` para `asignaciones`:
«el día que la operación gane una segunda escritura, quien abre la transacción le pasa el cliente
transaccional a esta misma fábrica».

- **Puerto nuevo** `lib/modules/pedidos/ports/order-unit-of-work.ts`:

  ```ts
  export type OrderTransactionScope = {
    readonly orders: OrderWriteRepository;          // puerto nuevo, §5.3
    readonly reservations: MaterialReservations;    // tipo del barril de inventario
  };
  export interface OrderUnitOfWork {
    run<T>(work: (scope: OrderTransactionScope) => Promise<T>): Promise<T>;
  }
  ```

- **Adaptador** `lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma.ts`:
  exporta `withOrderTransaction(run: (tx) => Promise<T>)`, que envuelve `prisma.$transaction` con
  `timeout` explícito, y reintenta la unidad entera hasta 3 veces si el `INSERT` choca con
  `orders_company_year_sequence_key` (el reintento que hoy hace `order-prisma.ts:178-247`, que no
  puede vivir dentro de una transacción ya abortada).
- **Fábricas sobre cliente**: `createOrderWriteRepository(db = prisma)` en `pedidos` y
  `createMaterialReservations(db = prisma)` en `inventario`, mismo patrón que
  `createOrderAssignmentRepository` (`order-assignment-prisma.ts:69`).
- **Cableado** en `lib/composition/index.ts`, que solo ata:

  ```ts
  const orderUnitOfWork: OrderUnitOfWork = {
    run: (work) => withOrderTransaction((tx) =>
      work({
        orders: createOrderWriteRepository(tx),
        reservations: createMaterialReservations(tx),
      })),
  };
  ```

  El tipo de `tx` se infiere: la composición no nombra Prisma. *(Enmendado el 2026-09-23: la
  versión anterior pasaba también `unitCatalog` para convertir de la unidad de la línea a la del
  producto; con la fórmula de QC-147 la necesidad ya llega en la unidad del producto y
  `createMaterialReservations` deja de recibir `UnitCatalog` —hoy
  `reservation-prisma.ts:4,86-92,119` de esta rama—.)*

#### 5.2.1 La excepción con nombre en `guard-ambito-empresa-pedidos` (enmendado el 2026-09-23 (review), B3)

`withOrderTransaction` necesita el cliente global para llamar a `prisma.$transaction`, que no lee
ni escribe ninguna tabla. Hoy lo importa como `sharedPrismaClient` para que la expresión
`TOCA_LA_BASE` de la guardia (`/\b(?:prisma|tx)\s*\./`) no lo vea: una excepción sin nombre y un
patrón copiable. Por D21:

- `order-unit-of-work-prisma.ts` vuelve a `import { prisma } from '@/lib/shared/db/prisma'`.
- `tests/guards/guard-ambito-empresa-pedidos.test.ts` gana una lista de **archivos exentos por
  nombre**, con una sola entrada: `order-unit-of-work-prisma.ts`, y su motivo escrito junto a ella:
  «Solo abre la transacción que comparten pedidos e inventario (`prisma.$transaction`); no lee ni
  escribe tablas. Excepción aprobada por el humano en QC-141, decisión D21 (2026-09-23).» Los tests
  pueden citar fichas; los comentarios de producción no.
- **Para que el nombre no sea un cheque en blanco**, la guardia comprueba además en ese archivo que
  **todo** acceso `prisma.` es `prisma.$transaction`: cualquier otra consulta que alguien añada ahí
  pone la guardia en rojo. Y un caso anti-placebo con una fuente fabricada (`prisma.order.findMany`
  dentro de un archivo con ese nombre) demuestra que la exención no la deja pasar.
- **Sin alias en `pedidos`**: la guardia rechaza cualquier `import { prisma as X }` en los
  adaptadores de `pedidos`, con su anti-placebo. Es lo que impide que el truco se copie; no convierte
  la guardia en la opción (a) del review (reconocer cualquier alias como `prisma` y tratar
  `$transaction` como no-consulta en todos los archivos), descartada en §13.8.

*Nota para el humano:* la comprobación de «solo `$transaction`» y la prohibición del alias son
elección de este diseño para que la excepción quede estrecha; D21 fija la exención por nombre y el
motivo. Si se prefieren sin ellas, se retiran sin tocar lo demás.

#### 5.2.2 La receta se lee con el cliente de la transacción (enmendado el 2026-09-23 (review), m7)

`create-order.ts` y `transition-order.ts` leen la receta con el lector global **dentro** de
`unitOfWork.run`, así que piden una segunda conexión mientras la transacción retiene la suya: con el
pool pequeño del pooler de Supabase eso es espera o `P2024` bajo carga.

- `OrderTransactionScope` gana `recipes`: el lector de líneas de receta (`findExecutionContentById`,
  el tipo que ya usa `pedidos` del barril de `recetas`) construido **sobre `tx`**.
- `recetas` expone en su driven una fábrica sobre cliente (`db = prisma`), con el mismo patrón que
  `createOrderWriteRepository` y `createMaterialReservations`; si ya existe una, se reutiliza.
- `lib/composition` la ata con el mismo `tx` en `orderUnitOfWork.run`, sin nombrar Prisma.
- Crear y Finalizar leen la receta con `scope.recipes`. Editar hoy la lee **antes** de abrir la
  transacción, sin segunda conexión; se pasa también a `scope.recipes` para que haya **una sola**
  forma de leerla dentro de pedidos y la lectura vea la misma instantánea que el bloqueo.
- Test unitario con dobles: el lector global de recetas falla si se le llama mientras `run` está
  abierto.

### 5.3 `OrderWriteRepository` (puerto nuevo de `pedidos`)

Los métodos que escriben, sobre el cliente que se les da, más un bloqueo de fila:

| Método | Qué hace |
|---|---|
| `lockAliveById(id, scope)` | `SELECT ... FOR UPDATE` del pedido vivo; `null` si no existe, está borrado o es de otra empresa |
| `create(data, year, actorId, now, ingredientsCost, scope)` | el `INSERT` de `order-prisma.ts:183-210`, sin abrir transacción propia; el choque del correlativo **lanza** para que `withOrderTransaction` reintente |
| `updateAlive(..., scope)` | `order-prisma.ts:521-542` |
| `cancelAlive(id, reason, actorId: string \| null, now, scope)` | `order-prisma.ts:557-574`, con autor anulable (la caducidad no tiene) |
| `softDeleteAlive(...)` | `order-prisma.ts:588-599` |
| `setStatus(id, from, to, actorId, now, scope)` | el `UPDATE` condicional de `order-catalog-prisma.ts:152-155` |
| `setReservedAt(id, reservedAt: Date \| null, scope)` | la columna de §3.3, con `$executeRaw` para no mover `updated_at` |

`scope` sigue siendo el **último** parámetro de cada firma
(`tests/guards/guard-ambito-empresa-pedidos.test.ts`). `OrderRepository` (lecturas y listado) no
cambia; sus cuatro métodos de escritura se quedan hasta que T8 mueva a sus llamantes y luego se
retiran, para no dejar dos caminos de escritura.

*(Enmendado el 2026-09-23 (review).)*

- **`setStatus` y `finished_at` (B4).** Con QC-145, `orders` tiene `finished_at` y el `CHECK
  orders_finished_at_requires_delivered`. Cuando el destino es `ENTREGADO`, `setStatus` escribe
  `status` y `finished_at` en **el mismo `UPDATE` condicional**; para cualquier otro destino no toca
  `finished_at`. El valor es el que escribe hoy el Finalizar de QC-145 en `dev`: al mergear se lleva
  a `setStatus` tal cual (fuente y zona horaria incluidas), y la bitácora anota de dónde sale. Así
  el cambio de estado, `finished_at` y el consumo viven en la misma transacción (R51).
- **Lo que se retira (m2).** `createOrder` (`order-prisma.ts`), que solo mantenía vivo
  `order-sequence.int.test.ts`, y `transitionAliveOrder` (`order-catalog-prisma.ts`), sin llamantes
  y peligrosa: recableada, entregaría **sin consumir**. El `INSERT` del correlativo queda escrito
  **una vez**, en `insertAliveOrder`. `order-sequence.int.test.ts` pasa a ejercitar
  `withOrderTransaction` + `createOrderWriteRepository` (deja de ser «sin cambios», como pedía T8),
  y el anti-placebo de `guard-ambito-empresa-pedidos` que apuntaba a `createOrder` apunta a
  `insertAliveOrder`. **Ojo al mergear:** QC-145 cambia `transitionAliveOrder` para escribir
  `finished_at`; ese cambio **no se conserva ahí** (se borra la función), se traslada a `setStatus`.
- **`lockAliveById` devuelve también `reservedAt`** (B2, §9.2).

### 5.4 `OrderCatalog` (contrato que consume `asignaciones`)

`transitionAliveById` (`order-catalog.ts:69-76`) **conserva su firma** y gana un resultado:
`'ok' | 'not_found' | 'stale' | 'insufficient_material'`. Deja de ser la función cruda de
`order-catalog-prisma.ts:142-160` y pasa a cablearse con un caso de uso de `pedidos`,
`createTransitionOrder({ unitOfWork, recipes })`: abre la unidad, bloquea el pedido, aplica
`assertTransition`, y si el destino es `ENTREGADO` llama a `consumeForOrder`. Así **el Finalizar de
la planta consume sin que `asignaciones` sepa de inventario**: `finish-assigned-order.ts` solo
aprende a traducir `'insufficient_material'` a un error propio (`R27`, `R30`, `R31`).

*(Enmendado el 2026-09-23; E2 aprobada.)* El resultado gana también `'recipe_without_lines'`,
que `createTransitionOrder` devuelve cuando `consumeForOrder` responde `nothing_to_consume`, y que
`finish-assigned-order.ts` traduce a un segundo error propio (`R50`). ~~La edición en Pedidos lanza
`RecipeWithoutLinesError` de `pedidos` en el mismo caso.~~

*(Enmendado el 2026-09-23 (review), B4.)* **El Finalizar es el único camino a `ENTREGADO`.** Tras
QC-145 la edición en Pedidos no mueve el estado, así que `update-order.ts` pierde la rama que
consumía y los errores que solo ella lanzaba (`InsufficientMaterialError` y
`RecipeWithoutLinesError` desde la edición; si alguno se queda sin lanzador, se retira de `pedidos`
y su código **sigue** en el catálogo porque lo usa `asignaciones`). `createTransitionOrder`, con
destino `ENTREGADO`, hace dentro de **una** unidad de trabajo: `lockAliveById` → `assertTransition`
→ `consumeForOrder` → si no es `consumed`, **lanza** para deshacer la unidad y devuelve el resultado
(`'insufficient_material'` o `'recipe_without_lines'`) → `setStatus(..., 'ENTREGADO')` con
`finished_at` (§5.3) → `setReservedAt(null)`. Ningún resultado distinto de `'ok'` deja escrito el
estado, `finished_at` ni el inventario (R51). Con otro destino (`PENDIENTE → EN_CURSO`) no toca la
reserva ni `finished_at`.

### 5.5 Puertos que `inventario` declara para no importar `pedidos`

`inventario` no puede importar `pedidos` (ciclo). Para el historial (`R38`) necesita el número
visible del pedido; declara en su dominio:

```ts
export interface OrderNumberDirectory {
  findNumberTexts(companyId: string, orderIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
```

y `lib/composition` lo cabla con una función nueva del driven de `pedidos`,
`findOrderNumberTextsByIds` (incluye cancelados, entregados y borrados: el historial no pierde el
pedido), que compone con `formatOrderNumber`. Es el patrón de `people: assignmentDirectoryPrisma`
en `listBatchMovements` (`lib/composition/index.ts:720-723`).

---

## 6. Algoritmos

### 6.1 La necesidad (dominio de `pedidos`, `order-requirement.ts` nuevo)

*(Reescrita el 2026-09-23. La versión anterior, ya implementada en T6 —`order-requirement.ts:11-15`
con `RequirementSourceLine = { productId, quantity, unitId }` y `:47-57`, que multiplica
`line.quantity × orderQuantity`—, lee columnas que `dev` ya no tiene. **T6 se rehace.**)*

`buildRequirement(lines, orderQuantity)` con `lines: readonly { productId; percentage }[]` → por
línea `{ productId, quantity: consumedQuantity(orderQuantity, line.percentage) }`. Usa la función
de `recetas` (`recipe-percentage.ts:98-104`, publicada en `recetas/index.ts:45`) en vez de una
multiplicación propia: es la única definición de la fórmula, la misma que usan el coste
(`order-cost.ts:132`) y la tabla de ingredientes (`order-ingredients-table.tsx:113-114`), y
`pedidos → recetas` ya es una arista del grafo (`order-cost.ts:7`). Es exacta y **no redondea**;
el techo lo pone `inventario` al repartir (N1). Lee las líneas con
`RecipeCatalog.findExecutionContentById` (`RecipeExecutionLine = { productId, productName,
percentage }`, `recetas/domain/recipe-catalog.ts:61-64`), igual que el coste
(`resolve-ingredients-cost.ts:22`). La unidad **no** viaja en la necesidad: `inventario` ya conoce
la de cada producto y es la de sus lotes. Receta sin líneas → necesidad vacía (E2).

### 6.2 El reparto (dominio de `inventario`, `plan-reservation.ts` nuevo, puro)

*(Enmendado el 2026-09-23: sin conversión y con E1. La versión ya implementada en T7
—`plan-reservation.ts:45-68`, `resolveNeed`— convierte con `convertQuantity` y **salta** el producto
sin unidad (`:52`); las dos cosas cambian.)*

```
planReservation({ requirement, products: Map<productId, unitId|null>,
                  batches: [{ id, productId, lot, purchaseDate, available }] })
  para cada línea:
    si el producto no tiene unidad            -> la línea no se cubre (E1)
    need := ceilToScale4(line.quantity)                                   (N1)
    lotes := batches del producto con available > 0, ordenados con compareBatchesOldestFirst
    tomar min(available, pendiente) de cada lote hasta pendiente == 0
    si pendiente > 0 -> la línea no se cubre
  si alguna línea no se cubre -> devolver { kind: 'insufficient', productIds: [...] }
  devolver { kind: 'reserved', allocations: [{ batchId, quantity }] }
```

`need` nunca es cero: el pedido y el porcentaje son mayores que cero, y el techo de cualquier
positivo es al menos `0.0001`. Todos los lotes de un producto están en la unidad del producto
(`product_batches_check_unit`), así que la necesidad y el disponible se comparan sin convertir.
`planReservation` deja de recibir `units`. Una receta sin líneas da `reserved` con cero
asignaciones, que para `pedidos` es «sin apartar» (`reserved_at = NULL`, R49).

### 6.3 `syncForOrder` (driven de `inventario`, `reservation-prisma.ts` nuevo)

1. Bloquea las filas de `products` de la necesidad, **ordenadas por `id`**, con
   `FOR NO KEY UPDATE` (§7).
2. Lee los lotes de esos productos con su apartado **por otros pedidos**
   (`Σ` del libro excluyendo `order_id` propio) y el apartado **propio** por lote.
3. `planReservation` con `available = max(stock − apartado_por_otros, 0)`.
4. Diferencia por lote entre el plan (o vacío si `insufficient`) y lo propio: `reserve` por lo que
   sube, `release` por lo que baja (`R12`, `R13`).
5. Devuelve `reserved` si el plan cubrió y hay alguna asignación; `not_reserved` en otro caso.

`pedidos` pone `reserved_at` según el resultado (§3.3).

### 6.4 `consumeForOrder`

1. Bloquea los productos de los lotes que el pedido tiene apartados (o de la necesidad de
   respaldo, N2), ordenados por `id`.
2. Por cada lote con apartado propio `q`: decremento **condicional**
   `productBatch.updateMany({ where: { id, companyId, stock: { gte: q } }, data: { stock: { decrement: q } } })`
   —el `UPDATE` condicional de QC-111—. Si `count = 0`, el lote no tiene `q` (merma): lo que tenga
   se consume y el resto se reparte con `planReservation` sobre los demás lotes libres (pregunta 2).
   Si no alcanza → `insufficient` y la transacción se deshace entera.
3. Por cada lote consumido: `writeMovement` con `kind: 'consumption'`, `quantity` negativa y
   `orderId`; y un `consume` en `reservation_movements` por lo que estaba apartado.
4. `recalculateProductStock` de cada producto tocado, en la misma transacción (`[D14]`, `R28`).

*(Enmendado el 2026-09-23.)* La necesidad de respaldo de N2 se calcula como en §6.1 y se reparte
como en §6.2, sin `UnitCatalog` (hoy `consumeWithoutReservation`, `reservation-prisma.ts:342-375` de
esta rama, resuelve conversiones; deja de hacerlo). Si el pedido **no tiene nada apartado y la
necesidad de respaldo está vacía** (receta sin líneas), devuelve `nothing_to_consume` sin escribir
nada (E2, R50). El déficit por merma de la pregunta 2 (`reservation-prisma.ts:277-311`) ya se
expresa en la unidad del producto; solo pierde la unidad que hoy le cuelga a cada línea.

El decremento vive en una función **exportada de `product-prisma.ts`**, `consumeBatchStock`, con
su `writeMovement` en el cuerpo: `tests/guards/guard-libro-de-inventario.test.ts:18,244-265` exige
que toda escritura de `product_batches` esté en ese archivo y asiente, y su censo pasa de tres a
cuatro caminos. `reservation-prisma.ts` la llama (driven → driven del mismo módulo).

*(Enmendado el 2026-09-23 (review), m3.)* `qc121-alcance` saca `consumeBatchStock` de la garantía
«toda escritura de lotes recalcula `products.stock`» (`EXCEPCIONES_SIN_RECALCULO`), y la traslada a
sus llamantes sin que nadie la vigile. Se añade la comprobación en la misma guardia: **toda función
de `lib/**` que llame a `consumeBatchStock` llama también a `recalculateProductStock` en su cuerpo**
(o en el de la función que la envuelve dentro del mismo archivo, si el implementer lo prefiere así,
dicho en la guardia). Con dos anti-placebos de fuente fabricada: un llamante sin recálculo (rojo) y
uno con él (verde). Mapea a R28.

### 6.5 `releaseForOrder`

Lee lo apartado propio por lote e inserta un `release` o `expire` por cada lote con saldo positivo.
Si no hay saldo, no escribe nada (idempotente, `R25`).

---

## 7. Concurrencia

**Mecanismo elegido: el bloqueo de la fila del producto** (`FOR NO KEY UPDATE`), el mismo que ya
toman `adjustBatchStock` (`product-prisma.ts:727-734`) y `addBatchToAlive`
(`product-prisma.ts:618-625`), **más el `UPDATE` condicional** para el decremento del consumo.

- Dos pedidos que apartan del mismo lote bloquean el mismo producto: el segundo espera, y en
  `READ COMMITTED` su lectura del apartado es una sentencia posterior al bloqueo, así que ve lo que
  el primero comiteó (`R16`). Es el mismo razonamiento de «sentencia aparte» de
  `product-prisma.ts:345-347`.
- **Una merma concurrente se serializa también**, porque el ajuste ya bloquea el producto. Un
  bloqueo consultivo por empresa (QC-81) no lo haría: el ajuste y el alta no lo piden (§13.2).
- **Orden de bloqueos, siempre el mismo**: (1) bloqueo consultivo del correlativo, solo en el alta
  (`order-prisma.ts:183-185`); (2) fila del pedido; (3) filas de productos por `id` ascendente.
  El ajuste y el alta de lote solo toman (3) sobre un producto. Sin ciclos de espera posibles.
- El `CHECK stock >= 0` sigue siendo la última red.

---

## 8. Dónde se engancha

| Camino | Hoy | Con la ficha |
|---|---|---|
| Crear (`pedidos/domain/create-order.ts:99-123`) | calcula coste y `orders.create` | coste fuera de la transacción (igual que hoy); `unitOfWork.run`: `create` → `buildRequirement` → `syncForOrder` → `setReservedAt` |
| Editar (`update-order.ts:64-98`) | `findAliveById`, `assertTransition`, `updateAlive` | lectura previa igual; `unitOfWork.run`: `lockAliveById`, **repetir** `assertTransition` sobre la fila bloqueada, `updateAlive`; si el destino es `ENTREGADO` → `syncForOrder` + `consumeForOrder` (`R29`); si no → `syncForOrder` + `setReservedAt` |
| Cancelar (`cancel-order.ts:58-67`) | `cancelAlive` | `unitOfWork.run`: `lockAliveById`, `cancelAlive`, `releaseForOrder('release')`, `setReservedAt(null)` |
| Borrar (`delete-order.ts:46-56`) | `softDeleteAlive` | ídem con `softDeleteAlive` (N5) |
| Finalizar (`asignaciones/domain/finish-assigned-order.ts:68-87`) | `orders.transitionAliveById(..., 'ENTREGADO')` | **misma llamada**; el contrato consume por dentro (§5.4). Nuevo: `'insufficient_material'` → `MaterialShortageError` de `asignaciones` |
| Iniciar (`start-assigned-order.ts:50-67`) | `PENDIENTE → EN_CURSO` | la misma transición; al no ser `ENTREGADO`, no toca la reserva |
| Edición que deja `ENTREGADO` | permitida por `order-transitions.ts:23-24` y `order-input.ts:86-102` | consume (`[D12]`). QC-145 la retirará |
| Coste (`resolve-ingredients-cost.ts`) | total de lotes con existencia | **no cambia** (QC-123 sigue mandando sobre el importe) |

*(Enmendado el 2026-09-23 (review), B4 y m7.)* La tabla de arriba es la del spec original. Tras
QC-145 y D21 cambian tres filas:

| Camino | Con la enmienda |
|---|---|
| Editar | lectura previa igual; `unitOfWork.run`: `lockAliveById`, `updateAlive` **sin cambio de estado** (QC-145), receta con `scope.recipes`, `syncForOrder` + `setReservedAt`. **Nunca consume** (R52). Se retira la rama `ENTREGADO` y con ella R29 |
| Finalizar | misma llamada desde `asignaciones`; dentro, §5.4 enmendado: consumo + `status` + `finished_at` + `reserved_at = NULL` en una unidad (R27, R51) |
| Edición que deja `ENTREGADO` | **ya no existe** (QC-145). Fila retirada |

Crear lee la receta con `scope.recipes` (§5.2.2).

`CreateOrderDeps`, `UpdateOrderDeps`, `CancelOrderDeps` y `DeleteOrderDeps` ganan una dependencia
`unitOfWork`. Cancelar y borrar no necesitan la receta: liberar solo lee el libro.
`createTransitionOrder` sí recibe `recipes` para la necesidad de respaldo de N2.

---

## 9. El proceso diario (primer cron del sistema)

### 9.1 Piezas

> **Enmendado el 2026-09-23 por decisión del humano (F2.1, T12).** Los candidatos se buscan **empresa por empresa**: el proceso lista las empresas y, para cada una, llama a `findExpirableOrders(companyId, threshold, limit)` filtrando por esa empresa. Ninguna consulta lee pedidos de varias empresas a la vez y `guard-ambito-empresa-pedidos` se cumple **sin excepción**. Sustituye «todas las empresas» de la fila «Candidatos» y el pseudocódigo de abajo. Descartada: una excepción con nombre en la guardia.

| Pieza | Archivo |
|---|---|
| Declaración | `vercel.json` (nuevo): `{ "crons": [{ "path": "/api/cron/caducar-pedidos", "schedule": "0 7 * * *" }] }` (N7) |
| Ruta | `app/api/cron/caducar-pedidos/route.ts`: reexporta `GET` y declara `runtime = 'nodejs'` y `maxDuration = 300` **con literal**, igual que `app/api/documentos/trabajos/route.ts:19-57` |
| Handler | `lib/modules/pedidos/adapters/driving/order-expiry-cron-route.ts` |
| Secreto | `lib/modules/pedidos/adapters/driven/config/cron-secret-env.ts`: lee `CRON_SECRET` **al invocar**, compara `Authorization: Bearer <secreto>` con `timingSafeEqual`; devuelve `'ok' \| 'unauthorized' \| 'misconfigured'` |
| Caso de uso | `lib/modules/pedidos/domain/expire-stale-orders.ts` (`createExpireStaleOrders`) |
| Candidatos | `findExpirableOrders(threshold, limit)` en el driven de `pedidos`: todas las empresas, `status = 'PENDIENTE' AND deleted_at IS NULL AND reserved_at <= threshold`, orden `reserved_at, id`, usa `orders_expirable_idx` |
| Variable | `.env.example`: `CRON_SECRET=` con su bloque explicativo. Vercel lo envía solo como `Authorization: Bearer` cuando la variable existe en el proyecto |

`/api/**` no está en `PRIVATE_ROUTE_PREFIXES` (`lib/shared/routes.ts:206-244`), así que el
middleware no exige sesión: la única puerta es el secreto, como la firma del webhook de QC-111
(`document-job-route.ts:23-28`).

### 9.2 Flujo

```
GET /api/cron/caducar-pedidos
  auth = cronSecret.verify(header)
    'misconfigured' -> log order_expiry_misconfigured, 500, sin leer nada        (R24)
    'unauthorized'  -> 401, sin leer nada                                         (R24)
  now = reloj; threshold = now - 15 días
  hasta vaciar candidatos o agotar 240 s:
    lote = findExpirableOrders(threshold, 100)
    por cada { id, companyId }:
      try unitOfWork.run:
        fila = lockAliveById(id, { companyId })
        si fila == null o status != PENDIENTE o reserved_at > threshold -> nada (idempotencia, R25)
        cancelAlive(id, 'pedido caducado', null, now)                             (R21, [D7])
        releaseForOrder('expire', actorId null)
        setReservedAt(null)
      catch -> anotar { id, companyId, code } y seguir                             (R26)
  si hubo fallos -> console.error order_expiry_failed {...}, 500                   (pregunta 3)
  si no          -> 200 { expired: n }
```

- **Idempotente por construcción**: la segunda ejecución encuentra `CANCELADO` bajo el bloqueo y no
  hace nada; dos ejecuciones solapadas se serializan en la fila del pedido (`R25`).
- **Un pedido que falla no arrastra a los demás**: una transacción por pedido (`R26`). Si el mismo
  pedido falla siempre, sale en el log cada día hasta que alguien lo mire.

#### 9.2.1 Flujo enmendado (2026-09-23 (review), B2 y m4)

El pseudocódigo de arriba ya decía «`reserved_at > threshold` → nada», pero el código no lo hace y
el bucle no es el que pide §9.1 (empresa por empresa). Este es el que manda:

```
GET /api/cron/caducar-pedidos
  auth igual que arriba                                                            (R24)
  now = reloj; threshold = now - 15 días; failed = []
  try companies = listActiveCompanyIds()
  catch e -> failed += { stage: 'companies', code: codeOf(e) }; ir a «final»          (R54)
  por cada companyId, mientras no se agoten 240 s:
    cursor = null
    repetir:
      try lote = findExpirableOrders(companyId, threshold, cursor, 100, { companyId })
      catch e -> failed += { stage: 'candidates', companyId, code: codeOf(e) }; siguiente empresa  (R54)
      si lote vacío -> siguiente empresa
      por cada { id, reservedAt }:
        try unitOfWork.run:
          fila = lockAliveById(id, { companyId })          // trae status y reserved_at
          si fila == null
             o fila.status != PENDIENTE
             o fila.reservedAt == null
             o fila.reservedAt > threshold  -> nada                                (R22, R25, R53)
          cancelAlive(...); releaseForOrder('expire', null); setReservedAt(null)   (R21)
        catch e -> failed += { stage: 'order', id, companyId, code: codeOf(e) }    (R26, R55)
      cursor = último (reservedAt, id) del lote
  final:
  si failed no vacío -> console.error order_expiry_failed { failed, expired }, 500  (pregunta 3)
  si no              -> 200 { expired: n }
```

- **B2.** `lockAliveById` devuelve también `reserved_at` (su `SELECT ... FOR UPDATE` ya lee la
  fila; `OrderRow`, o el tipo que devuelva el bloqueo, gana `reservedAt: Date | null`). `expireOne`
  no hace nada si la fila bloqueada tiene `reserved_at` nulo o posterior al umbral: una edición
  intercalada entre la lectura del lote y el bloqueo gana.
- **Cursor, no «volver a pedir el primer lote» (m4).** `findExpirableOrders` recibe el último
  `(reserved_at, id)` visto y devuelve los siguientes con `(reserved_at, id) > cursor`, en el mismo
  orden del índice. Un pedido que falla queda **detrás** del cursor y no se vuelve a pedir en esa
  ejecución (R55); una empresa con 100 o más pedidos que fallan siempre termina en un número finito
  de páginas y no deja sin procesar a las siguientes. `scope` sigue siendo el último parámetro.
- **Todo fallo va al log (m4).** El `console.error` de `order_expiry_failed` sale también cuando
  falla `listActiveCompanyIds` o `findExpirableOrders`, con `stage` para distinguirlos. La ruta
  responde `500` si hubo cualquier fallo.
- **Código de error (m4).** `codeOf(e)` es el código del catálogo de errores si el error lo trae
  (los errores de dominio lo llevan), y si no, el literal `unexpected`. **Nunca** el mensaje ni datos
  del pedido: el log lleva solo identificadores y códigos (sin PII).
- **Aislamiento por empresa de verdad.** El fallo de una empresa —al buscar candidatos o en un
  pedido— no impide procesar las siguientes. Se corrige el docblock de `expire-stale-orders.ts`
  para que diga lo que el código hace, y el test `expire-stale-orders.test.ts` que hoy se llama
  «una empresa que falla al listar sus candidatos…» pasa a hacer que **falle** (doble que lanza
  para una empresa) y comprueba que la siguiente se procesa y que el fallo sale en `failed` con
  `stage: 'candidates'` y su código.
- **Tests (unit, con dobles):** edición intercalada con `reserved_at` reiniciado y con `reserved_at`
  nulo → no cancela (R53); fallo al listar empresas → log + 500 (R54); fallo al buscar candidatos
  de una empresa → sigue con la siguiente (R54); un pedido que falla siempre en una empresa con más
  de 100 candidatos → aparece **una** vez en `failed` y la empresa siguiente se procesa (R55);
  `code` presente en cada entrada (R26). **Integración:** un doble de `findExpirableOrders` que,
  tras devolver el lote, edita el pedido por otra conexión (reinicia `reserved_at`) antes del
  bloqueo, y el pedido sigue `PENDIENTE` con su material (R53).
- **Sin actor**: es una operación del sistema; no hay permiso que comprobar y la puerta es el
  secreto. `R41` no se contradice: no escribe fuera de una operación de `pedidos`.
- El motivo es la constante `EXPIRED_ORDER_REASON = 'pedido caducado'` de
  `pedidos/domain/order-expiry.ts`, y el plazo `ORDER_RESERVATION_TTL_DAYS = 15` (un solo sitio;
  el plazo configurable por empresa está fuera de alcance).

---

## 10. Lecturas y pantallas

| Qué | Dónde | Cambio |
|---|---|---|
| Listado de inventario | `listAliveProducts` (`product-prisma.ts:226-245`) | una segunda consulta agregada por página devuelve `reserved`/`available` por producto; `ProductView` gana los dos (cadenas de 4 decimales). Columnas «Total», «Reservado», «Disponible» en `product-columns.tsx` |
| Lotes de un producto | `findBatchesOfAliveProduct` (`product-prisma.ts:680-693`) | añade `reserved`, `available`, `overReserved` por lote. `product-batches-panel.tsx` pinta los tres y la marca «Sobre-reservado» (`R34`, `R37`) |
| Historial de un lote | `findBatchMovements` (`batch-movement-prisma.ts:67-84`) y `list-batch-movements.ts` | une asientos de `inventory_movements` y `reservation_movements` en un `BatchHistoryEntry` con `kind` (`opening`, `adjustment`, `consumption`, `reserve`, `release`, `expire`, `consume`), `quantity`, `reason`, `orderNumberText`, `authorName`, `createdAt`; resuelve autores con `PeopleDirectory` (como hoy) y números con `OrderNumberDirectory` (§5.5). `batch-history.tsx` etiqueta cada tipo y muestra «Sistema» cuando no hay autor (pregunta 4) |
| Respuesta del ajuste | `adjust-batch-dialog.tsx` | si `overReserved`, un aviso visible —no solo color— «El lote queda sobre-reservado: hay pedidos sin cobertura completa.» (`R33`) |
| Cobertura en Pedidos | `app/(private)/pedidos/...` | la página pide `pedidos.findCoverage(orderIds)` (nuevo, `ReservationQueries` detrás) una vez por página, como el lote de responsables de QC-102; etiqueta en fila y hoja (N6, `R35`) |
| Restante del formulario | `order-ingredients-table.tsx:107-112` | tipo cadena; significado según N4 |

Todo con `inventario.consultar` o `pedidos.consultar`, que ya exigen esas pantallas y sus
acciones (`R40`, `[D15]`). Targets táctiles de 44 px. El valor exacto del `title` no es la única
vía de verlo: la celda lleva también un `aria-label` con la cifra completa, así que no depende de
`:hover`.

---

## 11. Errores nuevos

En `lib/modules/errores/domain/error-codes.ts` y `error-catalog.ts` (la guardia
`guard-catalogo-de-errores.test.ts` exige las dos mitades):

| Código | Mensaje | Lo lanzan |
|---|---|---|
| `insufficient_material` | «No hay material suficiente en inventario para entregar el pedido.» | `asignaciones` (`MaterialShortageError`). *(Enmendado el 2026-09-23 (review): `InsufficientMaterialError` de `pedidos` solo lo lanzaba la edición; se retira si queda sin lanzador.)* |
| `recipe_without_lines` *(enmienda del 2026-09-23; E2 aprobada)* | «La receta del pedido no tiene ingredientes: complétala antes de entregarlo.» | `asignaciones` (su traducción en el Finalizar). *(Enmendado el 2026-09-23 (review): ya no lo lanza la edición en Pedidos.)* |

La respuesta del ajuste sobre-reservado **no es un error** (`R33`): es un campo del éxito.

---

## 12. Cómo se prueba

| Nivel | Qué |
|---|---|
| Unit, puro | `plan-reservation.test.ts` *(enmendado el 2026-09-23)*: FIFO, desempate `'9'`/`'10'`, todo-o-nada, **producto sin unidad = no alcanza y arrastra al pedido (E1)**, redondeo hacia arriba solo con más de 4 decimales (`0.0001 × 0.01 %` aparta `0.0001`; `200 × 10 %` aparta `20` exacto), receta vacía. Salen los casos de unidad sin base común y de conversión. `decimal-quantity.test.ts`. `batch-order.test.ts` y el `order-cost.test.ts` actual en verde con el comparador movido. `order-requirement.test.ts`: pedido × % con `consumedQuantity`, sin redondeo, receta vacía → necesidad vacía |
| Unit, casos de uso | crear/editar/cancelar/borrar/transicionar con dobles de `OrderUnitOfWork` que registran el orden de llamadas; autorización antes de abrir la unidad (dobles que fallan si los llaman); `expire-stale-orders.test.ts` (un fallo no para los demás, idempotencia); handler del cron (401, 500 sin secreto, 500 con fallos, 200) |
| Integración (`tests/integration/inventario/reservation.int.test.ts`, `.../pedidos/order-reservation.int.test.ts`) | carrera real de dos altas por 1.500 sobre 2.000 con dos conexiones (`R16`); edición a la baja deja solo la diferencia en el libro; cancelar y borrar liberan; entregar baja lote, asiento `consumption`, `products.stock` y `consume`; merma deja el lote sobre-reservado; la segunda entrega no consume (`R32`); aislamiento por empresa; `CHECK` y FK de §3 |
| Migraciones | tests de esquema de la tabla, enum, columnas, `numeric(14,4)`; `down.sql` falla con decimales; **paridad**: la migración 4.3 y `planReservation` producen el mismo reparto sobre los mismos datos (N8), *(enmendado el 2026-09-23)* con recetas en porcentaje, un caso de techo a 4 decimales, un producto sin unidad y una receta sin líneas |
| Guardias | `guard-libro-de-inventario` con cuatro caminos; `guard-empresa-en-esquema`, `guard-rls-force`, `guard-arquitectura-modulos` (sin ciclo, sin Prisma en composición), `guard-ambito-empresa-*`, `guard-dependencias-aprobadas` (sin cambios en `package.json`, `R47`) |
| E2E (`e2e/reserva-de-material.spec.ts`) | `R48` *(enmendado el 2026-09-23: la receta del recorrido tiene una sola línea al 100,00 % del producto, así que un pedido de 1.500 necesita 1.500)*: lote de 2.000; pedido A de 1.500 → inventario muestra 1.500 reservado y 500 disponible; pedido B de 1.500 → «Sin apartar» y el reservado sigue en 1.500; cancelar A → reservado 0; editar B (reintenta) → aparta; entregar B por la edición en Pedidos → total 500, reservado 0, historial con el consumo |

*(Enmendado el 2026-09-23 (review).)* Cambios sobre la tabla de arriba:

| Nivel | Qué |
|---|---|
| E2E (`e2e/reserva-de-material.spec.ts`) | El último paso **entrega B por el Finalizar de la planta** (asignar, iniciar y finalizar, como `e2e/ejecucion-receta.spec.ts`), no por la edición en Pedidos, que ya no entrega. Comprueba total 500, reservado 0 y el consumo en el historial. Se corre en Chromium y WebKit junto con `ejecucion-receta`, `ajuste-de-inventario` y los E2E que traiga QC-145 sobre Pedidos y Finalizar |
| Unit, casos de uso | `update-order`: ninguna llamada a `consumeForOrder` ni a `setStatus` en ningún caso (R52). `transition-order`: con `insufficient_material` y con `recipe_without_lines` no se llama a `setStatus` y la unidad se deshace (R51); con `ok`, `setStatus` recibe `finished_at`. Lector global de recetas que falla si se le llama dentro de `run` (m7). Cron: §9.2.1 |
| Integración | `order-reservation.int.test.ts`: Finalizar con material deja `ENTREGADO`, `finished_at` no nulo, lote bajado y `consume`; Finalizar con material insuficiente y con receta sin líneas deja `status`, `finished_at` (nulo), lotes, libro y `products.stock` intactos (R51, R50). `order-sequence.int.test.ts` sobre la unidad de trabajo (m2). `order-expiry.int.test.ts`: la edición intercalada (R53). Migración: §4.3.1 y §4.3.2 (R56, R57) |
| Guardias | `guard-ambito-empresa-pedidos`: exención por nombre con motivo, «solo `$transaction`» en el exento, sin alias, con anti-placebos (R58). `qc121-alcance`: llamante de `consumeBatchStock` recalcula (R28). La comprobación de comentarios de producción (B1) la hace el reviewer; si existe una guardia que la cubra, debe salir verde |
| Retirados | Los casos cuyo nombre cita `R29` se borran o se reescriben contra R52; el mapa de la bitácora dice «R29 — retirado (D21)» |

Cada `R<n>` va en el nombre de su caso; el mapa `R → test` lo escribe el implementer en
`progress/impl_QC-141-reserva-de-material-del-pedido.md`.

---

## 13. Alternativas descartadas

### 13.1 La reserva como filas con estado (`active` → `released`/`consumed`)

Una fila por pedido y lote que cambia de estado. Descartada: es una tabla transaccional que se
**actualiza**, y el historial completo de `[D11]` («cada apartado, liberación, caducidad y consumo»)
no cabe en una fila con un solo estado final: una edición que sube, otra que baja y una
cancelación dejarían una fila que ya no cuenta lo que pasó. El libro append-only lo cuenta
por construcción y sigue el precedente de `inventory_movements`.

### 13.2 Bloqueo consultivo por empresa (precedente QC-81)

`pg_advisory_xact_lock(141, hashtext('reservas:' || company_id))` en toda operación de reserva.
Descartada como mecanismo principal: **el ajuste y el alta de lote no lo piden**, así que una merma
podría bajar la existencia entre la lectura y la escritura de una reserva; habría que añadirlo a
los tres caminos de `product-prisma.ts`. Además serializa productos que no tienen nada que ver. El
bloqueo de la fila del producto ya existe en esos caminos y es más fino.

### 13.3 Apartar los pedidos existentes con un script de TypeScript en el `build`

Reutilizaría `planReservation` sin duplicarlo. Descartada: `build` corre en **cada** despliegue
(`package.json:7`), así que el script necesitaría una marca de «ya ejecutado», y guardarla exigiría
una tabla sin empresa que `guard-empresa-en-esquema` no admite. Además volvería a intentar apartar
en cada despliegue los pedidos que no alcanzaron, que no es lo que dice `[D10]`. La migración SQL
corre una sola vez por construcción (`_prisma_migrations`). El coste —la regla escrita dos veces—
se paga con el test de paridad (N8).

### 13.4 `reserved` desnormalizado en `product_batches` y `products`

Ahorraría la agregación de lectura. Descartada por ahora: sería una segunda verdad de lo que dice
el libro, mantenida a mano en cada camino, cuando el listado pagina a 25 y el índice por
`batch_id` basta. Si el libro crece hasta notarse, es una ficha propia con su medida.

### 13.5 Transacciones separadas y compensación

Guardar el pedido y apartar después, en otra transacción, deshaciendo a mano si falla. Descartada:
viola `R15`, y cancelar o entregar con la reserva fuera de la transacción deja material apartado
por un pedido muerto o existencia sin bajar por uno entregado.

### 13.6 Saltar el ingrediente cuyo producto no tiene unidad (enmienda del 2026-09-23)

Es lo que hacía N3 para la unidad sin base común, y lo que hoy hace `plan-reservation.ts:52`.
Descartada para E1: con la línea sin unidad, el único caso que queda es un producto sin lotes, es
decir, sin material. Saltarlo dejaría «Apartado» un pedido al que le falta un ingrediente entero, y
en la entrega sin apartado (N2) lo daría por consumido sin tocar ese ingrediente. D2 dice que si
falta uno, no aparta ninguno.

### 13.7 Entregar sin consumir un pedido con receta sin líneas (enmienda del 2026-09-23)

Mantendría el Finalizar de la planta sin fallos nuevos mientras las recetas vaciadas por QC-147 se
recargan. Descartada como recomendación de E2: registra producto terminado sin ninguna salida de
material ni rastro de por qué, que es justo lo que D11 (historial completo) y D12 (entregar consume)
quieren evitar. Es la alternativa si el humano no acepta que el Finalizar falle hasta recargar la
receta.

### 13.8 Que la guardia reconozca cualquier alias del cliente (opción (a) del review, B3)

La guardia resolvería el nombre local de cualquier import de `@/lib/shared/db/prisma` y trataría
`$transaction` como no-consulta en todos los archivos de `pedidos`. Descartada por decisión del
humano (D21): convierte una excepción concreta en una regla general —cualquier archivo podría
abrir transacciones con el cliente global sin que nadie lo apruebe— y la excepción deja de verse
en la guardia. Con la exención por nombre, el único archivo que la usa está escrito y motivado. Lo
que sí se toma de (a) es lo mínimo para cerrar el agujero: prohibir el alias (§5.2.1).

### 13.9 Seguir consumiendo en la edición en Pedidos tras QC-145 (B4)

Mantener la rama de `update-order.ts` que consumía al pasar a `ENTREGADO`, por si otra ficha
devolviera ese camino. Descartada (D21): QC-145 ya no deja que la edición mueva el estado, así que
esa rama sería código muerto que **escribe inventario**, y el review ya mostró lo que cuesta un
camino de escritura sin llamantes (m2, `transitionAliveOrder`). Si un camino nuevo vuelve a
entregar, se especifica con su ficha y pasa por `createTransitionOrder`.

### 13.10 Guardar la lista de pedidos fallidos y excluirlos por `id` (m4)

Pasar a `findExpirableOrders` los `id` que ya fallaron en la ejecución (`id NOT IN (...)`).
Descartada frente al cursor: la lista crece sin tope dentro de una ejecución y la consulta con ella,
y no aprovecha el orden `reserved_at, id` que ya da `orders_expirable_idx`. El cursor da lo mismo
(ningún pedido se pide dos veces) en espacio constante.

---

## 14. Dependencias

**Ninguna** (`[D18]`, `R47`). La tarea programada es `vercel.json`, que no es un paquete. La
comparación en tiempo constante es `node:crypto`. Los decimales, `BigInt` (§2.3).

---

## 15. Riesgos

- **La refactorización de `order-prisma.ts` a fábrica** toca el alta con su reintento del
  correlativo; su test `tests/integration/pedidos/order-sequence.int.test.ts` tiene que seguir
  verde sin cambiar.
- **La migración 4.3 sobre datos reales**: si hay muchos pedidos vivos, corre dentro del
  `prisma migrate deploy` del `build`. Se mide en la base de pruebas con un volumen parecido antes
  del PR.
- **El Finalizar puede fallar** por material si se aprueban 2 y N2: hoy nunca falla. La pantalla
  del operario tiene que mostrar el mensaje del catálogo.
- *(Enmienda del 2026-09-23.)* **Lotes anteriores al disparador de unidad de QC-121**: esa
  migración no partió ni rechazó los lotes que ya mezclaran unidades
  (`20260918130000_product_unit_and_stored_stock/migration.sql:23-27`). Sin conversión, un lote así
  se contaría como si estuviera en la unidad del producto —igual que ya lo cuenta
  `recalculateProductStock`, que suma todos los lotes—. No consta que exista ninguno; si aparece,
  es una ficha de saneamiento, no de esta.
- *(Enmienda del 2026-09-23.)* **Recetas vacías tras QC-147**: la migración §4.3 casi no apartará
  nada si corre antes de que se recarguen las recetas, y con E2 el Finalizar de esos pedidos falla
  hasta recargarlas.
- *(Enmienda del 2026-09-23 (review).)* **La base propia no revierte sola.** Los E2E dejaron en
  `QuimiCloude_QC141` asientos `consumption` y existencias con decimales (el ajuste de `-0.5`), y
  los `down` de §4.1 y §4.2 **fallan a propósito** con esos datos (R45). Revertir para renumerar
  (task TR) no pasa sin borrar datos o recrear la base: eso lo decide el humano, no el implementer.
- *(Enmienda del 2026-09-23 (review).)* **`dev` puede traer rojos ajenos**: el log de `dev`
  registra un baseline de QC-145 con `guard-arquitectura-modulos` en rojo por un import profundo de
  `a01c90cb` en `product-actions`. Si llega con el merge, se trata como rojo heredado según
  `docs/verification.md`, no se arregla aquí sin decirlo, y no cuenta como fallo de esta rama.
- **Paralelismo**: la ficha toca `lib/composition/index.ts`, `db/schema.prisma`,
  `order-prisma.ts`, `product-prisma.ts` y `finish-assigned-order.ts`. Cualquier otra ficha
  `in_progress` sobre esos archivos choca (`AGENTS.md > Paralelismo`).
