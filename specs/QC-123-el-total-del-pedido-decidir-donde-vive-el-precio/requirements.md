# QC-123 — el-total-del-pedido-decidir-donde-vive-el-precio · requirements.md

> **Zona** `backend` · **Complejidad** `high` *(sube desde `medium` al acotar)* · **depends_on** —
> · **Rama** `feature/QC-123-el-total-del-pedido-decidir-donde-vive-el-precio`
>
> **Alcance.** El pedido gana un **importe**, y no es un precio de venta: es el **coste de los
> ingredientes** que su receta consume, calculado desde los **lotes de inventario con existencia**.
> Se guarda en el pedido y se **recalcula en cada edición** con los lotes de ese día, nunca al leer.
> La consulta del listado lo devuelve como cadena decimal, y cuando no se puede calcular no
> devuelve número.
>
> **Lo que NO entra.** Pintar el importe en pantalla → **QC-122**, que recupera su columna.
> Que la presentación declare cuánto contiene («bidón = 20 L») → **QC-130**, creada al acotar esta.
> Guardar qué lotes se usaron o el coste por ingrediente: **solo se guarda el total**. **Descontar
> o reservar existencia**: esta ficha solo **lee** lotes y no mueve inventario. Precio de venta,
> facturación e impuestos, que no existen en el ERP → **QC-33**.
>
> *Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe `spec_author` (F1.2)._

## Preguntas abiertas

1. **Moneda por empresa.** Sigue abierta (`docs/architecture.md > Preguntas abiertas del dominio`,
   punto 5). El importe se guarda como número sin moneda, igual que los costes de compra de
   inventario y proveedores. Cerrarla después obliga a migrar los importes ya cargados. **No la
   cierra esta ficha**: `[D11]`.
2. **Cuántos productos reales caen en el caso «bidón».** Cuando la unidad de la línea de receta y
   la del lote no comparten base, el ingrediente no tiene coste y el pedido entero se queda sin
   importe `[D6]`. **No está medido** cuántos productos del catálogo real están en ese caso, y de
   eso depende si el importe es útil desde el primer día o casi siempre sale en blanco. La ficha
   que lo cierra de verdad es **QC-130**.
3. **Cómo habla `pedidos` con `inventario`.** El cálculo necesita las líneas de la receta y los
   lotes de cada producto. `pedidos` ya habla con `recetas`; con `inventario` no. Si nace un puerto
   nuevo `pedidos → inventario`, si se pasa por `recetas`, o si el cálculo vive en otro sitio, es
   decisión de `design.md` y **no la toma esta acotación**.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-18 | ¿De dónde sale el precio del pedido? | **No hay precio de venta en ninguna parte**, ni en el pedido ni en la receta. El importe es el **coste de los ingredientes** que la receta consume, leído de los lotes de inventario. **Deroga la premisa de la ficha** —que preguntaba entre tres sitios donde poner un precio— y **deroga el punto 4 de `docs/architecture.md > Preguntas abiertas del dominio`**, cerrado el 2026-09-03 por QC-33, que dice «el precio de venta del pedido nace aquí» y describe columnas que QC-35bis borró el 2026-09-07 `[D1]` |
| 2026-09-18 | ¿Cuánto hace falta de cada ingrediente? | **Cantidad de la línea de receta × cantidad del pedido.** La receta es la fórmula de una unidad y el pedido dice cuántas se producen: 10 gr en la receta y 200 en el pedido son 2.000 gr `[D2]` |
| 2026-09-18 | ¿Qué lotes entran en el cálculo, y en qué orden? | Los que **tienen existencia**, ordenados por **fecha de compra** de la más antigua a la más nueva, acumulando hasta **cubrir** la cantidad necesaria. Desempata el **número de lote**, que es correlativo por empresa (QC-81). No se usa la fecha de vencimiento: es opcional y dejaría huecos en el orden `[D3]` |
| 2026-09-18 | ¿Cómo se combinan los costes de varios lotes? | **Promedio simple** de los costes unitarios de los lotes usados. **No ponderado**: dos lotes usados pesan igual aunque de uno salga más cantidad que del otro. Decidido así explícitamente, con el caso ponderado sobre la mesa `[D4]` |
| 2026-09-18 | ¿Y si la unidad de la receta y la del lote no son la misma? | Se convierte con **`convertQuantity`** (QC-76, un solo nivel de derivación) **si las dos unidades comparten base**. Si no la comparten —gramos contra bidones—, ese ingrediente **no tiene coste**. No se toca el esquema: la presentación **no** gana contenido aquí `[D6]` |
| 2026-09-18 | ¿Cuándo NO hay importe? | Cuatro casos, **indistinguibles entre sí** y todos con el mismo resultado —**sin número**—: la existencia no alcanza a cubrir lo necesario, algún ingrediente no se puede convertir, la receta **no tiene ingredientes**, y los pedidos anteriores a la columna. **Nunca un número parcial y nunca 0**: un cero no se distingue de un pedido cuyos ingredientes salen gratis `[D5]` `[D7]` `[D9]` |
| 2026-09-18 | ¿El importe se guarda o se calcula al leer? | **Se guarda en el pedido**, y **se recalcula en cada edición** con los lotes de ese día. Entre ediciones queda congelado: comprar un lote caro mañana **no toca** ningún pedido ya creado. **No se recalcula al leer** `[D8]` |
| 2026-09-18 | ¿Qué pasa con los pedidos que ya existen? | La columna es **opcional** y se quedan **sin importe**. No se rellenan con 0 ni se teclean a mano `[D9]` |
| 2026-09-18 | ¿Quién puede ver el importe? | Quien tenga **`pedidos.consultar`** —hoy solo el Administrador—. La vía de **`asignaciones`**, por la que el Operador llega a sus pedidos asignados, **no lleva importe**. **No nace permiso nuevo**: el catálogo cerrado de quince no se enmienda y se respeta su forma `<modulo>.consultar` / `<modulo>.modificar` `[D10]` |
| 2026-09-18 | ¿El importe lleva moneda? | **No.** Implícita y no se guarda, igual que `product_batches.unit_cost` y `supplier_catalog_lines.cost`. La pregunta 5 del dominio **sigue abierta** `[D11]` |
| 2026-09-18 | ¿Se puede ordenar y filtrar por el importe? | **Solo se muestra.** Se confirma lo que QC-68 cerró el 2026-09-17, ahora que el importe **sí** está guardado: el total sigue siendo el resultado de un cálculo sobre lotes, y ordenar o filtrar por él obliga a índice y a tocar la consulta paginada. Si hace falta, ficha nueva con el caso medido `[D12]` |
| 2026-09-18 | ¿Quién pinta el importe? | **QC-122**, que **recupera la columna** que perdió el 2026-09-17 —la perdió porque el importe no tenía de dónde salir, y ahora lo tiene—. Su ficha se actualizó en el board el mismo día y queda **bloqueada por esta** `[D13]` |
| 2026-09-17 | ¿Cómo viaja el importe? | Como **cadena decimal**, **calculado en el servidor**, en `Decimal(14,4)` y nunca `float`. **No entra `decimal.js`** ni ninguna otra dependencia: Prisma ya opera decimales. *Heredado de QC-33 y QC-68, no se reabre* `[D14]` |
| 2026-09-17 | ¿Hace falta E2E aquí? | **No: se difiere a QC-122, con el motivo escrito ahora.** `CHECKPOINTS.md` lo exige para flujos con importes, pero **esta ficha no tiene pantalla**: sin columna que leer no hay recorrido que ejercitar en un navegador. La cobertura de esta ficha es de **integración contra la base real**. *Mismo criterio y misma ficha destino que QC-68* `[D15]` |
| 2026-09-01 | Forma de la tabla | Borrado **lógico**, `created_at` / `updated_at` / `deleted_at`, e **identificadores de base en inglés**. *Heredado de QC-4* `[D16]` |
