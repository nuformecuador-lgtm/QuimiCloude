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

> Cada requisito cita entre corchetes la decisión cerrada de la que nace, en el orden de la tabla
> de abajo. Un requisito sin cita sería un requisito que nadie acordó.
>
> **`[D1]` y `[D7]` no las cita ningún requisito, y es correcto desde el 2026-09-17**: las dos
> hablan del **total del pedido**, que ese día salió de esta ficha a **QC-123** por decisión del
> humano (ver el encabezado de `## Preguntas abiertas` y `design.md > 5`). Se quedan escritas en la
> tabla porque una decisión cerrada no se borra; quien las convierta en requisitos es QC-123.

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
**antes de paginar**, de modo que el total **de resultados** devuelto describa el conjunto ya
buscado y no la página ya traída. `[D5]`

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
una **página vacía con cero resultados**, y NO un error. `[D4]`

**R11** — El sistema DEBE declarar el listado de pedidos como **buscable** en su lista blanca de
consulta, de modo que el término deje de omitirse y de anotarse como campo no declarado. `[D5]`

### Lo que no cambia

**R12** — El sistema DEBE seguir exigiendo el permiso `pedidos.consultar` como **primera acción**
del caso de uso —antes de validar la entrada y antes de tocar ningún puerto— y DEBE seguir tomando
la empresa **del actor** y nunca de la entrada, también cuando hay búsqueda. `[D6]`

**R13** — La migración DEBE incluir su `down.sql`, y ese `down.sql` DEBE revertir exactamente lo
que crea el `migration.sql`. `[D8]`

**R14** — El sistema DEBE disponer de un **índice que sirva la búsqueda por nombre de receta
incluyendo las dadas de baja**; el índice de búsqueda existente sobre ese nombre es parcial y
excluye precisamente esas filas, así que no sirve para R4. `[D8]` `[D2]`

**R15** — SIN término de búsqueda, el listado DEBE devolver **exactamente lo mismo que hoy**: el
mismo orden por defecto, los mismos filtros, la misma paginación y el mismo total de resultados.
`[D8]`

**R16** — La pantalla de pedidos NO DEBE ganar en esta feature caja de búsqueda: DEBE seguir
emitiendo la consulta con la búsqueda vacía y sin pintar ningún campo de búsqueda en el DOM.
`[D3]`

## Preguntas abiertas

Ninguna.

*`spec_author` abrió dos preguntas al verificar el código el 2026-09-17. **Las dos están cerradas
el mismo día**, así que la sección vuelve a «Ninguna». Se deja escrito **cómo** se cerraron, porque
las dos cambiaron el alcance de la ficha:*

- **P1 — de dónde sale el importe unitario del total. CERRADA PARTIENDO LA FICHA (humano,
  2026-09-17).** La premisa de la descripción del board —«la consulta devuelve cantidad y precio
  unitario por separado»— estaba **derogada**: el 2026-09-07 QC-35bis borró `unit_price` y
  `unit_id` de `orders` (`db/migrations/20260907120000_orders_drop_unit_and_unit_price`), y en
  `db/schema.prisma` el modelo `Order` tiene **un solo decimal, `quantity`**. El total no tenía
  segundo factor. **QC-68 se queda solo con la búsqueda y el total sale a QC-123**, que antes de
  ser tarea tiene que decidir de dónde sale el precio —es decisión de negocio, no de diseño—.
  Aquí ya no es pregunta abierta: es una ficha aparte.
- **P2 — si se pone tope a la lista de identificadores de receta que casan. CERRADA: NO se pone
  tope (humano, 2026-09-17).** Recortarla haría mentir al total de resultados (R5), y el conjunto
  está acotado por el catálogo de recetas **de una empresa**. Si alguna llega a tener miles de
  recetas, es ficha propia con su caso medido. El diseño se apoya en esta decisión
  (`design.md > 4`).

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
| 2026-09-17 | Al bajar a diseño: el total no tiene con qué multiplicarse. ¿Qué se hace con la ficha? | **La ficha SE PARTE y se queda solo con la búsqueda.** Verificado en el esquema, no supuesto: `Order` tiene **un solo decimal**, `quantity`. El precio unitario y la unidad **los borró QC-35bis el 2026-09-07** (`20260907120000_orders_drop_unit_and_unit_price`), por decisión del humano —«un pedido es receta + cantidad»—, y **ningún modelo del repo guarda un precio de venta de receta**: los que hay son costes de **compra**, de otros módulos. De dónde sale el precio es una **decisión de negocio sin tomar, no una tarea**, así que meterla aquí la disfrazaría. **El total sale a `QC-123`**, que nace con las cinco preguntas que arrastra. **`[D1]` y `[D7]` se quedan escritas pero ya no las cita nadie**: son herencia de QC-123, y una decisión cerrada no se borra. `QC-122` deja de llevar la columna del total |
