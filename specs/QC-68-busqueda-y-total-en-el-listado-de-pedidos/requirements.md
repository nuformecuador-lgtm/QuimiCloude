# QC-68 — busqueda-y-total-en-el-listado-de-pedidos · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** ninguna ·
> **Rama** `feature/QC-68-busqueda-y-total-en-el-listado-de-pedidos`
>
> **Alcance.** El listado de pedidos gana las dos cosas que le faltan y que caen en la misma
> consulta: **buscar por nombre de receta** —escribir «buffer» devuelve los pedidos cuya receta se
> llama así— y **el total del pedido calculado en el servidor**, devuelto como cadena decimal junto
> a la cantidad y el precio unitario. La migración lleva su `down` y los índices que la búsqueda
> necesite.
>
> **Lo que NO entra.** La pantalla —la caja de búsqueda y la columna— → **QC-122**, creada al
> acotar esta y que además carga con el **E2E de importes** diferido desde aquí. Ordenar o filtrar
> por el total → fuera de alcance por decisión de esta acotación; si hace falta, ficha propia con su
> caso medido. Cómo se resuelve la comparación —cruzando tablas o denormalizando el nombre— es
> decisión del `design.md`, no de este archivo.
>
> *Sembrado por `/afinar-feature` el 2026-09-17. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

> Cada requisito cita entre corchetes la decisión cerrada de la que nace (`[D1]`–`[D8]`, en el
> orden de la tabla de abajo). Un requisito sin cita sería un requisito que nadie acordó.

### La búsqueda por nombre de receta

**R1** — CUANDO se consulte el listado de pedidos con un término de búsqueda, el sistema DEBE
devolver **únicamente** los pedidos cuya receta contenga ese término en su nombre, y ningún
otro. `[D4]` `[D5]`

**R2** — El sistema DEBE comparar el término con el nombre de la receta **ignorando acentos,
mayúsculas y signos**, usando la **misma** definición de nombre normalizado con la que el módulo
de recetas ya busca en su propio listado, y NO DEBE introducir una segunda definición. `[D5]`

**R3** — El sistema NO DEBE buscar por ningún otro dato del pedido —ni el número correlativo, ni
el estado, ni la prioridad, ni la cantidad, ni el motivo de cancelación—: un término que coincida
con uno de esos valores y con ningún nombre de receta DEBE devolver cero pedidos. `[D4]`

**R4** — SI la receta de un pedido está **dada de baja**, ENTONCES ese pedido DEBE seguir
apareciendo entre los resultados de una búsqueda por su nombre, igual que hoy sigue apareciendo
con ese nombre en la lista sin buscar. `[D2]`

**R5** — El sistema DEBE aplicar la búsqueda **sobre el conjunto completo** de pedidos visibles y
**antes de paginar**, de modo que el total devuelto describa el conjunto ya buscado y no la página
ya traída. `[D5]`

**R6** — MIENTRAS haya un término de búsqueda en curso, el sistema DEBE combinarlo **por
conjunción** con el ámbito de empresa y con la exclusión de los borrados, de modo que una búsqueda
NO pueda ampliar lo visible: buscar el nombre exacto de la receta de un pedido de otra empresa, o
de un pedido borrado, DEBE devolver cero resultados. `[D6]`

**R7** — El sistema DEBE resolver qué recetas casan con el término **pidiéndoselo al módulo de
recetas por su interfaz pública**, pasándole la empresa del actor, y NO DEBE consultar las tablas
de recetas ni navegar ninguna relación de Prisma desde el pedido hasta la receta. `[D6]`

**R8** — El sistema DEBE ejecutar un número de consultas **constante por página**,
independiente del número de filas: la misma página con una fila y con veinticinco DEBE producir el
mismo número de consultas. `[D5]`

**R9** — SI el término no conserva ningún carácter significativo al normalizarlo —solo espacios o
solo signos—, ENTONCES el sistema DEBE tratarlo como **ausencia de búsqueda** y devolver la lista
sin filtrar por texto. `[D5]`

**R10** — SI ninguna receta de la empresa casa con el término, ENTONCES el sistema DEBE devolver
una **página vacía con total cero**, y NO un error. `[D4]`

**R11** — El sistema DEBE declarar el listado de pedidos como **buscable** en su lista blanca de
consulta, de modo que el término deje de omitirse y de anotarse como campo no declarado. `[D5]`

### El total del pedido

**R12** — El listado de pedidos DEBE devolver, por cada fila, el **total del pedido calculado en el
servidor**. `[D7]`

**R13** — El total DEBE viajar como **cadena decimal de cuatro decimales**, en la misma forma en
que ya viaja la cantidad, y NUNCA como número de coma flotante. `[D7]`

**R14** — El sistema DEBE calcular el total multiplicando la cantidad del pedido por su importe
unitario con **aritmética decimal exacta**, y NO DEBE incorporar ninguna dependencia nueva para
hacerlo. `[D7]` *(de dónde sale hoy ese importe unitario es la pregunta abierta **P1**: la columna
que la descripción de la ficha da por existente se eliminó el 2026-09-07. R12–R15 no se pueden
implementar hasta que P1 tenga respuesta.)*

**R15** — El sistema NO DEBE persistir el total: DEBE derivarlo de sus factores en cada consulta,
de modo que no pueda contradecirlos. `[D7]`

**R16** — El total NO DEBE aparecer en la lista blanca de consulta del listado: pedir orden o
filtro por él DEBE **omitirse y anotarse** como cualquier campo no declarado, sin hacer fallar la
consulta. `[D1]`

### Lo que no cambia

**R17** — El sistema DEBE seguir exigiendo el permiso `pedidos.consultar` como **primera acción**
del caso de uso —antes de validar la entrada y antes de tocar ningún puerto— y DEBE seguir tomando
la empresa **del actor** y nunca de la entrada, también cuando hay búsqueda. `[D6]`

**R18** — La migración DEBE incluir su `down.sql`, y ese `down.sql` DEBE revertir exactamente lo
que crea el `migration.sql`. `[D8]`

**R19** — El sistema DEBE disponer de un **índice que sirva la búsqueda por nombre de receta
incluyendo las dadas de baja**; el índice de búsqueda existente sobre ese nombre es parcial y
excluye precisamente esas filas, así que no sirve para R4. `[D8]` `[D2]`

**R20** — SIN término de búsqueda, el listado DEBE devolver **exactamente lo mismo que hoy**: el
mismo orden por defecto, los mismos filtros, la misma paginación y el mismo total. `[D8]`

**R21** — La pantalla de pedidos NO DEBE ganar en esta feature ni caja de búsqueda ni columna de
total: DEBE seguir emitiendo la consulta con la búsqueda vacía y sin pintar ningún campo de
búsqueda en el DOM. `[D3]`

## Preguntas abiertas

Ninguna.

*Eso es lo que quedó al acotar, y no se reabre. Lo de abajo lo abre `spec_author` al verificar el
código: es un hecho del disco que la descripción de la ficha no contempla y que la regla 6 de
`CLAUDE.md` prohíbe rellenar con un supuesto.*

**P1 — ¿De dónde sale el importe unitario con el que se multiplica la cantidad?** La descripción
de QC-68 dice «hoy la consulta devuelve cantidad y precio unitario por separado y nadie
multiplica». **Eso ya no es cierto.** El 2026-09-07, por decisión humana (QC-35bis), `unit_price`
y `unit_id` **salieron de la tabla `orders`** —migración
`db/migrations/20260907120000_orders_drop_unit_and_unit_price`, con pérdida de datos escrita en
`specs/QC-35-pantalla-de-pedidos/requirements.md`— y con ellos salieron `unitPriceSchema` de
`order-input.ts`, el campo de `order-view.ts`, `unitPrice` de `ORDER_QUERYABLE.sortable` y el
índice `orders_unit_price_idx`. Verificado además en `db/schema.prisma`: el modelo `Order` tiene
**un solo decimal, `quantity`**, y ningún otro modelo del repositorio guarda un precio de venta de
receta (`recipes` no tiene importe; `product_batches.unit_cost` y `supplier_catalog_lines.cost`
son costes de compra de otros módulos).

Consecuencia: **el total del pedido no tiene hoy un segundo factor**, y esta ficha no puede
inventárselo. Las tres salidas posibles —y la elige un humano, no el spec:

1. **Devolver `unit_price` a `orders`**, con su migración, su `down`, su validación de borde y su
   decisión sobre qué pasa con los pedidos ya creados (los datos viejos se perdieron). Es una
   ficha de modelo, no un añadido a ésta.
2. **Poner el importe en la receta** y pedirlo por `RecipeCatalog`. Cambia el significado del
   total (pasa a ser «precio de catálogo × cantidad», que se mueve al editar la receta) y toca la
   pregunta abierta 5 del dominio (moneda por empresa), que sigue sin cerrar.
3. **Sacar el total de esta ficha** y dejarla como «búsqueda por nombre de receta», con el total
   en la ficha que resuelva 1 o 2.

Mientras P1 no se responda, **R12–R15 y las tareas T10–T13 quedan bloqueadas**; R1–R11 y R16–R21
no dependen de ella y se pueden implementar enteros.

**P2 — ¿Hay un tope para la lista de identificadores de receta que casan?** El diseño elegido
(`design.md > 3`) pasa a la consulta de pedidos los identificadores de las recetas que casan. Ese
conjunto está acotado por el catálogo de recetas **de una empresa**, que hoy es de orden de
decenas, y por eso el diseño **no pone cota**: una cota silenciosa recortaría resultados y haría
mentir al total. Si alguna empresa llega a tener miles de recetas, es ficha propia con su caso
medido. Se deja escrito por si el humano prefiere decidirlo ahora.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-17 | ¿Se puede ordenar y filtrar por el total, o solo mostrarlo? | **Solo se muestra.** No entra en `ORDER_QUERYABLE`. Ordenar o filtrar obligaría a que el total **exista en la base como dato calculado con su índice** —no basta con calcularlo al devolver la fila—, y esa es una migración mayor para algo que **nadie ha pedido todavía**. Si en uso real hace falta, es ficha nueva con el caso medido. **Cierra la única pregunta que la ficha traía abierta** |
| 2026-09-17 | ¿La búsqueda encuentra los pedidos cuya receta está **de baja**? | **Sí.** Verificado en disco: `list-orders.ts:149` resuelve los nombres con `findRefsIncludingDeleted`, así que **la lista ya muestra el nombre de una receta dada de baja**. Si al buscar ese mismo nombre el pedido no saliera, parecería que se ha perdido. La búsqueda es coherente con lo que el usuario ve en pantalla |
| 2026-09-17 | ¿Hace falta E2E aquí? | **No: se difiere a QC-122, y el motivo se escribe ahora.** `CHECKPOINTS.md` lo exige para flujos con importes y el total lo es, pero **esta ficha no tiene pantalla**: sin caja de búsqueda ni columna que manejar no hay recorrido que ejercitar en un navegador, y montar uno obligaría a inventar una interfaz que otra ficha va a construir. **La ficha destino se creó el mismo día** para que la exigencia no quedara sin dueño. La cobertura de esta ficha es de **integración contra la base real** |
| 2026-09-17 | ¿Qué se busca exactamente? | **Solo el nombre de la receta**, no el número de pedido ni ningún otro campo. Viene de la `description` y no se amplía aquí |
| 2026-09-17 | ¿Cómo se comporta la búsqueda? | **Heredado del contrato genérico de QC-57**: se aplica **sobre el conjunto completo y nunca sobre la página ya traída**, e **ignora acentos y mayúsculas** igual que las otras seis listas. Verificado en disco: `recipes.name_normalized` **ya existe**, así que la parte normalizada del dato no se inventa aquí |
| 2026-09-17 | ¿Con qué permiso y con qué ámbito? | **Heredado, sin cambios**: `pedidos.consultar` como primera línea del caso de uso y ámbito de empresa por `OrderScope`. Verificado en `list-orders.ts:91` y `:131`. Esta ficha **no toca la autorización** ni añade un permiso nuevo |
| 2026-09-17 | ¿Cómo viaja el total? | **Como cadena decimal**, igual que la cantidad y el precio unitario, y **calculado en el servidor**. Multiplicar dos `Decimal(14,4)` con el tipo numérico de JavaScript pierde precisión. **NO entra `decimal.js` ni ninguna otra dependencia**: Prisma ya opera decimales |
| 2026-09-17 | ¿Qué exige la migración? | **Su `down.sql`** y **los índices que la búsqueda necesite**, mismo criterio con el que QC-57 metió los suyos: buscar u ordenar por un campo sin índice es el anti-patrón que el reviewer rechaza en cuanto las tablas crezcan. **Los tests que hoy pasan tienen que seguir pasando** |
