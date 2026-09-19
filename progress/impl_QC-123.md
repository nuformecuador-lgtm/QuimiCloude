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
| R9 | `order-cost.test.ts` — «los cuatro caminos sin importe del calculo devuelven exactamente la misma salida (R9)», que son los que la funcion pura puede producir; `order-ingredients-cost.int.test.ts` — «un pedido anterior a la columna sigue sin importe (R8, R13)» cubre el quinto, que es un estado de la fila y no un camino del calculo |
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
5. **El recuento de casos sin importe: dos vueltas, y esta es la buena (2026-09-18).**
   `[D17]` subio el recuento de cuatro a **cinco** y la fila de trazabilidad de `tasks.md` se
   habia quedado en cuatro. En la primera correccion se renombro el rotulo a «cinco» y se metio
   el desbordamiento en el caso; el `reviewer` señalo, con razon, que el cuerpo seguia sin
   cuadrar: **sustituia «pedido anterior a la columna» por «producto sin lotes»**, que no es un
   caso aparte sino otra forma de la existencia insuficiente.

   **Resolucion final.** El quinto caso cerrado —un pedido guardado antes de que existiera la
   columna— **no es alcanzable desde una funcion pura**: es el estado de una fila ya escrita, no
   un camino del calculo, y `calculateIngredientsCost` no lo puede ver ni producir. Forzarlo
   dentro del test de unidad solo se puede hacer falsificandolo. Asi que:
   - el caso de unidad se llama «los **cuatro caminos** sin importe del calculo devuelven
     exactamente la misma salida (R9)» y enumera **exactamente esos cuatro**: existencia
     insuficiente, unidad sin base comun, receta sin lineas y desbordamiento;
   - la fila de R9 en `tasks.md` **cita los dos tests**, y dice cual cubre el quinto:
     `order-ingredients-cost.int.test.ts` — «un pedido anterior a la columna sigue sin importe
     (R8, R13)».
   `R9` queda cubierto entero, y **ningun nombre afirma nada que su cuerpo no haga**.

   `producto sin lotes` no se pierde: tiene su propio caso, «un producto sin lotes deja el pedido
   sin importe».

   **Ningun comportamiento cambio en ninguna de las dos vueltas.** Las filas de `[D5]` y `[D17]`
   no se tocaron, y donde el spec dice «los **otros** cuatro casos» —R24 y su caso de test—
   sigue diciendolo: ahi cuatro es lo correcto, porque el desbordamiento es el quinto y se
   compara contra los otros cuatro.

6. **Las dos citas de ficha/requisito que el `reviewer` bloqueo, fuera (2026-09-19).** Los dos
   bloqueantes de la primera vuelta eran comentarios de produccion en lineas que la rama escribe,
   contra `docs/conventions.md > Comentarios` («Sin excepciones»):
   - `lib/modules/pedidos/domain/update-order.ts:14-15` citaba **`QC-35bis`** en un docblock que
     la rama reescribe entera. Se quita el identificador y **se conserva el porque**, redactado
     como lo que es y no como una referencia: la edicion recalcula el coste en cada escritura, y
     para eso necesita leer los lotes y convertir entre la unidad de la receta y la del lote.
   - `lib/modules/pedidos/ports/order-repository.ts:101` citaba **`R20`**. La cita era
     preexistente, pero la rama toca esa linea al extender el bloque con el parrafo de
     `ingredientsCost`, y la regla limpia **las lineas que la rama toca**. Fuera la cita, intacto
     el resto del bloque.

   **Alcance deliberadamente corto**: solo esas dos lineas. No se limpiaron los comentarios
   preexistentes que el diff no toca —eso es limpieza por modulo y va en ficha del board—.
   Repasado despues el diff entero `origin/dev...HEAD` sobre `lib/`, `app/` y `db/`: **no queda
   ninguna otra** cita de `QC-<n>`, `R<n>`, `design.md` ni «decision cerrada» en linea de
   produccion que la rama escriba.

   **Ningun comportamiento cambia**: los tres archivos tocados en esta vuelta solo mueven
   comentarios y nombres de casos de test.

## Verificacion de la vuelta de correcciones (2026-09-19)

`./init.sh --rapido` sobre el arbol con las correcciones: typecheck y lint verdes, **203/203**
archivos y **3100** tests pasados (6 skipped) relacionados con los 58 archivos del diff, y
**47/47** guardias verdes (588 tests, 9 skipped). Las migraciones tienen su `down.sql`.

**T11 sigue sin marcar a proposito**: se marca cuando el leader cierre con `./init.sh` completo y
abra el PR. El gate completo **no lo ha corrido nadie todavia** sobre esta rama.

7. **El rojo que solo salio en el gate completo: `CostingBatch` se muda a su propio archivo
   (2026-09-19).** Con el `reviewer` ya en OK, `./init.sh` **completo** saco un rojo que
   `--rapido` no habia sacado: `tests/unit/unidades/module-contract.test.ts:617`, caso «la unidad
   del producto es la DERIVADA del lote y nunca un texto». La asercion que fallaba es

       expect(catalogo, 'ProductRef recupero una unidad que nadie consume').not.toMatch(/unitId/)

   **Es un rojo de esta rama, no deuda de `dev`**: no esta en `tests/baseline-rojos.json`. Lo
   provoco `CostingBatch`, que esta rama habia declarado dentro de
   `lib/modules/inventario/domain/product-catalog.ts` con un campo `unitId`.

   **Diagnostico.** El SUJETO de esa guardia es `ProductRef` —lo dicen su comentario y el propio
   mensaje de la asercion—, pero su IMPLEMENTACION es un regex sobre el texto entero del archivo,
   mas grueso que su sujeto. `CostingBatch` no es `ProductRef`: es un tipo auxiliar, su `unitId`
   **si lo consume alguien** (`order-cost.ts:146` lo necesita para convertir entre la unidad del
   lote y la de la linea de receta) y **no es texto libre** sino una referencia al catalogo, que
   es justo lo que el criterio de la guardia exige. La segunda asercion del caso
   (`CAMPO_UNIT_TEXTO`) nunca fallo: busca `unit:` y `unitId:` no la activa.

   **Por que se movio el tipo y NO se toco la guardia.** El criterio de la guardia es correcto y
   sigue vigente; cambiarlo para acomodar un caso que no es su sujeto seria aflojar una
   proteccion viva por comodidad, y ademas es una decision del humano, no del implementador. La
   guardia quedo **intacta**. Nota para quien lea el diff: el `unitId` que queda en
   `product-catalog.ts:15` esta dentro de un comentario y no cuenta — el ayudante `read()` de la
   guardia (`leerFuente`) borra comentarios antes de aplicar el regex, que es tambien la razon de
   que el archivo pasara la guardia antes de esta rama.

   **El precedente en que se apoya.** El repo ya habia resuelto exactamente este caso en este
   mismo modulo: `ProductStockByUnit` es tambien un tipo auxiliar alcanzable desde `ProductRef`
   que lleva `readonly unitId: UnitId`, y vive en su propio archivo
   `lib/modules/inventario/domain/product-stock.ts`, que la guardia no lee, reexportado por el
   barrel. `CostingBatch` sigue ese patron y nada mas.

   **Cambios.**
   - Nuevo `lib/modules/inventario/domain/costing-batch.ts` con `CostingBatch` y su docblock.
   - `unitId` pasa de `string` suelto a **`UnitId`** de `@/lib/modules/unidades`, como
     `product-stock.ts` y `product-view.ts:65`. `UnitId` es alias de `string`, asi que **no
     rompio a ningun consumidor**: `toCostingBatch` sigue asignando el `string` de Prisma sin
     cast ninguno.
   - `product-catalog.ts` solo importa el tipo; la firma de `findCostingBatches` **no cambia**.
   - `product-catalog-prisma.ts` ajusta su import de ruta profunda al archivo nuevo (era lo unico
     que no pasaba por el barrel; `tsc` lo saco con `TS2459`).
   - El barrel sigue exportando `CostingBatch` con el mismo nombre y desde el mismo sitio
     publico, ahora en su linea propia junto a `product-stock`: **`pedidos` no se entera**.
   - `design.md` deja de declarar el tipo dentro de `product-catalog.ts` y dice donde vive.

   **Ningun comportamiento cambia**: es una mudanza de tipo y un alias mas estrecho.

## Verificacion de la mudanza de `CostingBatch` (2026-09-19)

- `npx tsc --noEmit` — verde, sin salida.
- `npx vitest run tests/unit/unidades/module-contract.test.ts` — **8/8 verdes**; el caso que
  fallaba, en verde y con la guardia sin tocar.
- `npx vitest run "tests/unit/pedidos/" "tests/unit/inventario/"` — **73 archivos, 1155 pasados,
  5 skipped**.

Ojo con el segundo comando si se repite sin la barra final: `tests/unit/pedidos` casa por PREFIJO
y arrastra `tests/unit/pedidos-ui/`, cuya guardia de ficha ajena lee `git status --porcelain` sin
filtrar y por eso ve un arbol sucio como archivos «tocados» por esa otra ficha. Con el arbol ya
commiteado no aparece. **El gate completo no lo corre el implementador**: lo corre el leader al
cerrar.
