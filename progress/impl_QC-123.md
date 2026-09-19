# QC-123 — el-total-del-pedido-decidir-donde-vive-el-precio · bitacora de implementacion

> Rama `feature/QC-123-el-total-del-pedido-decidir-donde-vive-el-precio`, worktree
> `.worktrees/QC-123-el-total-del-pedido-decidir-donde-vive-el-precio`. Tip de partida `235717e5`.
> Coordinado por `implementer`; todo el codigo lo escribieron subagentes `backend_dev`.
> **No hay una sola task de frontend**: pintar el importe es de QC-122 (`[D13]`, R18).

## Estado

**T0-T10 cerradas.** T11 (cierre) queda al leader: el `./init.sh` completo y el PR no son mios.

| Task | Estado | Commit |
|---|---|---|
| T0 — herencia, no se re-crea | verificada | — |
| T1 — esquema y migracion | hecha | `a1677a97` |
| T2 — el calculo, dominio puro | hecha | `2b0ff47b` |
| T3 — `inventario` publica los lotes costeables | hecha | `84824ad1` |
| T4 — el puerto acepta el importe | hecha | `5c08edc2` |
| T5 — alta y edicion calculan | hecha | `2081c69d` |
| T6 — composicion | hecha | `2081c69d` |
| T7 — las lecturas NO recalculan | hecha | `db5138f8` |
| T8 — `asignaciones` y permisos intactos | hecha | `db5138f8` |
| T9 — ni ordenable ni filtrable, sin pantalla | hecha | `db5138f8` |
| T10 — integracion contra la base real | hecha | `db5138f8` |
| — dos guardias rojas que abrio la ficha | cerradas | `959a54f7` |
| — deduplicacion y dos censos al dia | hecha | `aff9e441` |

## Archivos creados

- `db/migrations/20260918130000_orders_add_ingredients_cost/migration.sql` y `down.sql`
- `lib/modules/pedidos/domain/order-cost.ts` — el calculo, dominio puro
- `lib/modules/pedidos/domain/resolve-ingredients-cost.ts` — la orquestacion que comparten alta y edicion
- `tests/unit/pedidos/order-cost.test.ts`
- `tests/unit/pedidos/schema/orders-ingredients-cost-migration.test.ts`
- `tests/unit/inventario/product-catalog-costing.test.ts`
- `tests/integration/pedidos/order-ingredients-cost.int.test.ts`

## Archivos de produccion modificados

- `db/schema.prisma` — `Order.ingredientsCost Decimal? @map("ingredients_cost") @db.Decimal(14, 4)`
- `lib/modules/inventario/domain/product-catalog.ts` — tipo `CostingBatch` y metodo `findCostingBatches`
- `lib/modules/inventario/index.ts` — reexporta el tipo `CostingBatch`
- `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts` — la consulta de lotes costeables
- `lib/modules/pedidos/ports/order-repository.ts` — `create` y `updateAlive` ganan `ingredientsCost` **antes** de `scope`
- `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` — `ORDER_SELECT`, `toOrderRow`, el `INSERT` y el `updateMany`
- `lib/modules/pedidos/domain/order-view.ts` — `OrderRow` y `OrderView` lo declaran; `NewOrder` no
- `lib/modules/pedidos/domain/get-order.ts` — `toOrderView` lo mapea
- `lib/modules/pedidos/domain/create-order.ts` y `update-order.ts` — `products` y `units` en sus `Deps`, y el calculo
- `lib/composition/index.ts` — `productCatalog` gana `findCostingBatches`; `createOrder` y `updateOrder` reciben `products` y `units`

## Archivos de test modificados (ajustes de fixture y censos)

Los dobles de `ProductCatalog` de `recetas` y `asignaciones` (8 archivos), los fixtures de
`OrderRow`/`OrderView` de `tests/unit/pedidos/` (9) y `tests/unit/pedidos-ui/` (12), las llamadas
al puerto en `tests/integration/pedidos/` (6), mas
`tests/guards/guard-identificador-de-request.test.ts`, `tests/integration/aislamiento.json`,
`tests/integration/pedidos/pedidos-constraints.int.test.ts` y
`tests/unit/identity/permissions.test.ts`.

## Mapa `R<n> -> test`

Ningun `R<n>` mapea a un test E2E: es `[D15]`, y el E2E se difiere a QC-122 porque esta ficha no
tiene pantalla. La cobertura es **unidad + integracion contra la base real**.

| Req | Test |
|---|---|
| R1 | `tests/unit/pedidos/order-view.test.ts` — «la salida del pedido no declara ningun campo de precio de venta (R1)» · `tests/unit/pedidos/order-cost.test.ts` — «el importe sale del coste de los lotes y no de ningun precio (R1)» |
| R2 | `order-cost.test.ts` — «la cantidad necesaria es la de la linea por la del pedido (R2)» |
| R3 | `order-cost.test.ts` — «usa solo lotes con existencia, del mas antiguo al mas nuevo, hasta cubrir (R3)» y «desempata por numero de lote cuando la fecha de compra empata (R3)» · `tests/unit/inventario/product-catalog-costing.test.ts` — «no devuelve lotes con existencia cero (R3)» |
| R4 | `order-cost.test.ts` — «la fecha de vencimiento no altera el orden ni la seleccion (R4)» |
| R5 | `order-cost.test.ts` — «promedia los costes unitarios de los lotes usados sin ponderar (R5)» |
| R6 | `order-cost.test.ts` — «convierte la existencia y el coste cuando las unidades comparten base (R6)» |
| R7 | `order-cost.test.ts` — «un ingrediente con unidad sin base comun no tiene coste (R7)» |
| R8 | `order-cost.test.ts` — «devuelve sin importe si la existencia no cubre (R8)», «... si un ingrediente no se puede convertir (R8)», «... si la receta no tiene lineas (R8)», «nunca devuelve cero ni un importe parcial (R8)» · `order-ingredients-cost.int.test.ts` — «un pedido anterior a la columna sigue sin importe (R8, R13)» |
| R9 | `order-cost.test.ts` — «los cuatro casos sin importe devuelven exactamente la misma salida (R9)» |
| R10 | `tests/unit/pedidos/create-order.test.ts` — «el alta calcula el importe y lo pasa al puerto (R10)» · `order-ingredients-cost.int.test.ts` — «el alta lo deja guardado en la fila (R10)» |
| R11 | `tests/unit/pedidos/update-order.test.ts` — «la edicion recalcula y sustituye el importe (R11)» · `order-ingredients-cost.int.test.ts` — «la edicion lo reescribe, incluso a nulo (R11)» |
| R12 | `tests/unit/pedidos/list-orders.test.ts` — «el listado no recibe catalogo de productos ni de unidades (R12)» · `order-ingredients-cost.int.test.ts` — «comprar un lote despues no cambia el importe de un pedido ya creado (R12)» |
| R13 | `tests/unit/pedidos/schema/orders-ingredients-cost-migration.test.ts` — «la columna nace opcional y la migracion no rellena ninguna fila (R13)» · `order-ingredients-cost.int.test.ts` — «(R8, R13)» de arriba |
| R14 | `tests/unit/pedidos/order-service.test.ts` — «la ficha y el listado devuelven el importe a quien tiene pedidos.consultar (R14)» · `order-ingredients-cost.int.test.ts` — «un pedido de otra empresa no se alcanza ni por identificador (R14, R21)» |
| R15 | `tests/unit/asignaciones/list-assigned-orders.test.ts` — «el pedido asignado no lleva importe (R15)» · `tests/unit/asignaciones/get-assigned-order-execution.test.ts` — «la pantalla de ejecucion no lleva importe (R15)» · `tests/unit/identity/permissions.test.ts` — «el catalogo sigue teniendo quince permisos (R15)» |
| R16 | `tests/unit/pedidos/schema/pedidos-schema.test.ts` — «no nace ninguna columna de moneda (R16)» |
| R17 | `tests/unit/pedidos/list-orders.test.ts` — «el importe no esta en la lista blanca y pedirlo como orden o filtro se poda y se anota (R17)» |
| R18 | `tests/unit/pedidos-ui/order-columns.test.tsx` — «la tabla de pedidos no pinta el importe (R18)» |
| R19 | `order-cost.test.ts` — «el importe viaja como cadena decimal de cuatro decimales y nunca como numero (R19)» · `tests/guards/guard-dependencias-aprobadas.test.ts`, verde y sin dependencia nueva |
| R20 | `tests/unit/pedidos/schema/pedidos-schema.test.ts` — «orders gana una columna decimal(14,4) opcional en snake_case y ninguna tabla nueva (R20)» · `orders-ingredients-cost-migration.test.ts` — «la migracion tiene su down.sql y revierte exactamente (R20)» |
| R21 | `order-ingredients-cost.int.test.ts` — «un lote de otra empresa no entra en el calculo (R21)» y «(R14, R21)» de arriba |
| R22 | `order-ingredients-cost.int.test.ts` — «tras el alta y la edicion, los lotes y los asientos quedan intactos (R22)» · `product-catalog-costing.test.ts` — «el contrato de costeo no expone ninguna escritura (R22)» |
| R23 | `tests/unit/pedidos/create-order.test.ts` y `update-order.test.ts` — «sin pedidos.modificar no se lee ni un lote ni una unidad (R23)», con dobles que fallan si se los llama |
| R24 | `order-cost.test.ts` — «un importe que no cabe en decimal(14,4) sale sin numero y no distinguible de los otros cuatro casos (R24)» · `create-order.test.ts` — «el alta se completa aunque el importe desborde (R24)» · `order-ingredients-cost.int.test.ts` — «el pedido queda creado con el importe en blanco y la base no lanza 22003 (R24)» |
| R25 | `order-cost.test.ts` — «con la misma fecha de compra el lote 9 se usa antes que el 10 (R25)» y «si un numero de lote no es solo digitos el desempate es por texto (R25)» |
| R26 | `order-cost.test.ts` — «convierte tambien el coste unitario a la unidad de la linea: 20.000 por bidon de 20 L son 1.000 por litro (R26)» y «no promedia costes unitarios de unidades distintas (R26)» |

Los 26 requisitos tienen test. `[D15]` no genera requisito y se cumple: ningun `R<n>` de arriba
apunta a un E2E.

## Salida real del gate

`./init.sh --rapido` sobre `aff9e441`, 2026-09-18:

```
OK node v22.13.1
OK dependencias presentes
OK cliente de Prisma al dia
OK tipos de ruta de Next al dia
OK las 117 fichas vienen del proyecto QC
OK regla max-2-por-zona respetada (in_progress=2)
OK specs presentes para features sdd en vuelo
OK base de desarrollo QuimiCloude al dia: 37 migracion(es) aplicada(s)
OK typecheck paso
OK lint paso

[test:rapido] tests relacionados con 58 archivo(s) del diff vs origin/dev
 Test Files  203 passed (203)
      Tests  3100 passed | 6 skipped (3106)
   Duration  219.17s

[test:rapido] todas las guardias
 Test Files  47 passed (47)
      Tests  588 passed | 9 skipped (597)
   Duration  5.66s

OK test:rapido paso
OK todas las migraciones tienen down.sql
OK .env presente
== init OK ==
```

**Cero rojos, cero saltados por baseline.** El aviso de «10 worktrees ademas del principal» es el
unico amarillo y es del entorno, no de la ficha.

Contraste con el aviso que traia el encargo: aqui la comprobacion
`specs presentes para features sdd en vuelo` sale **verde**. El rojo de QC-82 que se esperaba **no
aparece en esta rama**.

Migracion, verificada contra Postgres: `db:migrate` aplica, `db:rollback` revierte dejando
`_prisma_migrations` coherente, y la columna queda `numeric(14,4)` con `is_nullable = YES`.

## Anti-placebo

Cada caso nuevo de T7-T10 se verifico **rompiendo a proposito** lo que vigila y confirmando el
rojo antes de deshacer: `ListOrdersDeps` ganando `products`, `get-order.ts` devolviendo `null` a
mano, `AssignedOrderSummary` y la vista de ejecucion ganando el campo, un permiso decimosexto, una
columna de importe en la tabla, `ingredientsCost` en `sortable`, un `stock` movido entre el alta y
el retrato, y un `unitCost` que deja de desbordar. Los nueve del bloque de unidad y los tres del
de integracion cayeron en rojo y se revirtieron; `git diff` confirma que no quedo huella.

## Lo que NO hace esta ficha, y esta probado que no lo hace

- **No pinta nada** (R18): es QC-122.
- **No mueve inventario** (R22): solo lee lotes. `product_batches` e `inventory_movements` quedan
  byte a byte iguales tras el alta y la edicion.
- **No enmienda el catalogo de quince permisos** (R15) ni abre la via de `asignaciones`.
- **No nace puerto `pedidos -> inventario`**: `inventario` amplia su contrato ya publicado.
- **No entra ninguna dependencia.** `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` sin
  diff; `guard-dependencias-aprobadas` verde.

## Decisiones de implementacion que el reviewer deberia mirar

1. **`INTERNAL_SCALE = 12` es constante propia de `order-cost.ts`.** `design.md > 2.1` pide «la
   misma escala que `CONVERSION_SCALE`», pero el barrel de `unidades` **no exporta**
   `CONVERSION_SCALE` e importarla por ruta profunda esta prohibido. Se declara con el mismo valor
   y se documenta. Para una sola verdad habria que publicarla en el barrel de `unidades`, que es
   tocar otro modulo.
2. **Sin diagnostico al registro del servidor.** `design.md > 4`, paso 4, dice que el motivo del
   `null` *puede* ir al log. No se hizo: el dominio puro no alcanza ningun logger del repo y
   meterle un puerto solo para esto no estaba en ninguna task. Queda como hueco consciente.
3. **`findCostingBatches` delega en un ayudante con `scope: InventoryScope`.** La firma publica del
   contrato es la de `design.md > 1.1` (`companyId: string`), pero
   `guard-ambito-empresa-inventario` exige que la funcion que toca la base declare el tipo de
   ambito del modulo. Es el patron que `findProductRefs` ya usaba en ese mismo archivo.
4. **`resolveIngredientsCost` vive en su propio archivo**, fuera de las dos listas de archivos de
   T5. Nacio duplicada literalmente en los dos casos de uso y se extrajo: duplicaba el invariante
   de «una sola lectura de lotes y una sola de unidades», que es justo lo que los tests cuentan.
5. **El nombre del caso de R9 dice «los cuatro casos»**, porque asi lo fija la tabla de
   trazabilidad de `tasks.md`, que no se reescribio cuando `[D17]` subio el recuento a cinco. El
   caso **si** prueba los cinco, desbordamiento incluido. Es un desfase de rotulo en el spec, no
   de comportamiento, y se deja como esta porque el reviewer compara el nombre contra `tasks.md`.
