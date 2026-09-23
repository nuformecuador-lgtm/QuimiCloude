# QC-150 — producto-terminado · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** QC-141 · **Rama** feature/QC-150-producto-terminado
>
> **Alcance.** Nace el tipo de producto «producto terminado» (`FINISHED_PRODUCT`). Al **Finalizar** un
> pedido, entra al inventario un **lote** del producto terminado de su **receta + presentación**
> («Desengrasante industrial · Botella 1L»), que nace solo la primera vez. La cantidad son **envases
> enteros**: ⌊cantidad del pedido / contenido de la presentación⌋, guardada en la unidad de la
> presentación. La presentación gana su **contenido** (lo que era QC-130). Un producto terminado no
> se crea a mano, no admite alta manual de lotes, no es ingrediente de receta y solo admite ajustes
> que **restan**.
>
> **Lo que NO entra.** Consumir los ingredientes al entregar y la existencia decimal → **QC-141**
> (bloquea esta). Una pantalla de ventas → sin ficha: la salida se hace hoy con el ajuste de
> **QC-92**. Arreglar los tests que rompió `cd7f07a6` → PR `fix/rojos-de-cd7f07a6`.
>
> Sembrado por `/afinar-feature` el 2026-09-23. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> **Cómo se citan las decisiones.** `[Dn]` es la **fila n** de la tabla `## Decisiones cerradas
> (no reabrir)`, contando de arriba abajo: D1 qué es un producto terminado, D2 qué producto entra,
> D3 cuándo entra, D4 qué entra, D5 cómo se cuenta, D6 contenido del envase, D7 qué se prohíbe,
> D8 existencia decimal, D9 E2E, D10 identificadores y borrado.
>
> **Vocabulario.** *Producto terminado*: producto de tipo `FINISHED_PRODUCT`. *Combinación* de un
> pedido: su receta más su presentación. *Contenido* de una presentación: la cantidad que cabe en un
> envase, en la unidad de la presentación. *Envases enteros* de un pedido: ⌊cantidad del pedido /
> contenido de su presentación⌋. *Cantidad que entra*: envases enteros × contenido.
>
> **Requisitos provisionales.** Los marcados **(provisional, pregunta N)** dependen de una pregunta
> abierta; llevan escrita la opción que recomienda `design.md > 0` y **no se implementan** hasta que
> el humano la confirme en F1.4. Los marcados **(abierto, pregunta N)** fijan solo lo que vale con
> cualquier respuesta.
>
> **Dependencia.** Esta ficha se construye sobre QC-141 ya mergeada: el Finalizar de la planta
> transiciona el pedido, consume su material y trabaja con existencias decimales dentro de una sola
> transacción. Los requisitos de abajo no repiten lo que QC-141 ya exige.

### A. El tipo «producto terminado»

**R1.** El sistema DEBE admitir el tipo de producto `FINISHED_PRODUCT`, declarado a continuación de
`PRODUCT`, `MACHINE` y `PACKAGING`, sin cambiar el tipo de ningún producto existente `[D1]` `[D10]`.

**R2.** CUANDO se registre el alta manual de un producto con tipo `FINISHED_PRODUCT`, el sistema DEBE
rechazarla con `invalid_input` sin escribir ningún producto ni lote `[D1]`.

**R3.** El formulario de alta y edición de producto NO DEBE ofrecer «Producto terminado» entre los
tipos que se pueden elegir `[D1]`.

**R4.** SI una edición de producto cambiaría su tipo a `FINISHED_PRODUCT`, o cambiaría el tipo de un
producto terminado a cualquier otro, ENTONCES el sistema DEBE rechazarla con `action_not_allowed`
sin modificar el producto `[D1]` `[D7]`.

**R5.** El sistema DEBE mostrar los productos terminados en el listado de inventario con la etiqueta
«Producto terminado» y DEBE permitir filtrar el listado por ese tipo `[D1]`.

### B. El contenido de la presentación (absorbe QC-130)

**R6.** El sistema DEBE permitir guardar en cada presentación un contenido opcional: un decimal
mayor que cero, de hasta diez cifras enteras y cuatro decimales, expresado en la unidad de la
presentación `[D6]`.

**R7.** CUANDO se cree o edite una presentación con un contenido igual a cero, negativo, con más de
cuatro decimales, con más de diez cifras enteras o que no sea un decimal en notación plana, el
sistema DEBE rechazarla con `invalid_input` sin escribir nada `[D6]`.

**R8.** La pantalla de presentaciones DEBE permitir introducir, cambiar y vaciar el contenido al
crear y al editar una presentación, y DEBE mostrar en el listado el contenido junto a la unidad, o
la indicación de que no lo tiene `[D6]`.

**R9.** CUANDO se aplique la migración, el sistema DEBE dejar todas las presentaciones existentes sin
contenido y NO DEBE cambiar ningún otro dato de ellas `[D6]`.

### C. Finalizar un pedido da de alta el producto terminado

**R10.** CUANDO un pedido pase a `ENTREGADO` por el Finalizar de `/asignacion/[id]`, el sistema DEBE,
en la misma operación que el cambio de estado y el consumo de material, dar de alta un lote del
producto terminado de la combinación del pedido `[D3]` `[D4]`.

**R11.** SI la empresa del pedido no tiene un producto terminado vivo de esa combinación, ENTONCES el
sistema DEBE crearlo en esa misma operación, con tipo `FINISHED_PRODUCT`, con el nombre
«`<nombre de la receta>` · `<nombre de la presentación>`» vigentes en ese instante y con la unidad de
la presentación; y SI ya lo tiene, ENTONCES el sistema DEBE añadir el lote a ese producto sin crear
otro `[D2]`.

**R12.** El sistema DEBE calcular la cantidad del lote como envases enteros × contenido, en la
unidad de la presentación y con aritmética decimal exacta: un pedido de `50.5` con contenido `1`
da `50` envases y `50`; un pedido de `10` con contenido `3` da `3` envases y `9`; un pedido de `50`
con contenido `0.75` da `66` envases y `49.5` `[D4]` `[D5]` `[D8]` **(provisional, pregunta 1: la
cantidad del pedido se lee en la unidad de su presentación)**.

**R13.** El sistema DEBE dar de alta el lote con la presentación del pedido, un número de lote
generado por el backend con el mismo correlativo por empresa que el alta de lotes, la fecha civil
UTC del Finalizar como fecha de compra, sin fecha de vencimiento y con quien finaliza como autor
`[D4]`.

**R14.** El sistema DEBE guardar como coste unitario del lote el coste de ingredientes guardado en el
pedido dividido entre la cantidad del lote, con aritmética decimal exacta y redondeo mitad arriba a
cuatro decimales `[D4]` **(provisional, pregunta 2: el divisor es la cantidad que entra, no la
cantidad del pedido)**.

**R15.** SI el pedido no tiene coste de ingredientes, ENTONCES el sistema NO DEBE guardar como coste
unitario del lote cero ni ningún valor que no salga del coste del pedido `[D4]` **(abierto, pregunta
3: el resto del comportamiento no se implementa hasta la respuesta)**.

**R16.** CUANDO entre el lote, el sistema DEBE registrar en el libro de movimientos de inventario un
asiento de **producción** con la cantidad del lote en positivo, el pedido que lo causa y quien
finaliza como autor `[D3]` `[D10]`.

**R17.** CUANDO entre el lote, el sistema DEBE recalcular la existencia guardada del producto
terminado en la misma transacción `[D3]` `[D8]`.

**R18.** SI el pedido que se finaliza no tiene presentación, o su presentación no tiene contenido,
ENTONCES el sistema DEBE rechazar el Finalizar con `presentation_without_content` sin cambiar el
pedido, el material apartado, las existencias ni ningún producto `[D6]`.

**R19.** SI los envases enteros del pedido son cero, ENTONCES el sistema DEBE rechazar el Finalizar
con `no_whole_package` sin cambiar el pedido, el material apartado, las existencias ni ningún
producto `[D5]` **(provisional, pregunta 4)**.

**R20.** SI falla cualquier paso del alta del producto terminado —crear el producto, el lote, el
asiento o el recálculo de su existencia—, ENTONCES el sistema NO DEBE dejar escrito ni el cambio de
estado del pedido, ni el consumo de su material, ni ninguna parte del producto terminado `[D3]`.

**R21.** El sistema NO DEBE dar de alta más de un lote de producto terminado por pedido, tampoco
cuando el Finalizar del mismo pedido se envía dos veces o dos veces a la vez `[D3]`.

**R22.** CUANDO dos pedidos de la misma combinación y la misma empresa se finalicen a la vez sin que
exista aún su producto terminado, el sistema DEBE terminar con un solo producto terminado vivo de
esa combinación que tenga los dos lotes `[D2]`.

**R23.** El sistema DEBE crear el producto terminado, su lote y su asiento en la empresa del pedido, y
NO DEBE añadir un lote a un producto terminado de otra empresa aunque coincidan receta, presentación
o nombre `[D2]` `[D10]`.

**R24.** CUANDO el Finalizar termine bien, el sistema DEBE mostrar en la confirmación cuántos envases
enteros entraron y el nombre del producto terminado que los recibió `[D5]`.

**R25.** MIENTRAS un lote pertenezca a un producto terminado y su presentación tenga contenido, el
sistema DEBE mostrar en el panel de lotes, junto a la cantidad en la unidad de la presentación, el
número de envases del lote `[D5]` **(provisional, pregunta 6)**.

**R26.** El sistema DEBE dar de alta el producto terminado solo dentro del Finalizar y con el permiso
que el Finalizar ya exige, validado en el service antes de leer o escribir nada, y NO DEBE añadir
ningún permiso al catálogo `[D3]` `[D7]`.

**R27.** CUANDO un pedido pase a `ENTREGADO` por la edición en Pedidos, el sistema DEBE dar de alta el
lote del producto terminado con las mismas reglas de R10 a R23 `[D3]` **(provisional, pregunta 5)**.

### D. Lo que se prohíbe

**R28.** CUANDO el alta manual de un producto coincidiría con un producto terminado vivo —el camino
que añade el lote a un producto que ya existe—, el sistema DEBE rechazarla con `action_not_allowed`
sin escribir ningún producto, lote ni asiento `[D7]`.

**R29.** CUANDO se cree o edite una receta con una línea cuyo producto es un producto terminado, el
sistema DEBE rechazarla con `action_not_allowed` sin escribir la receta ni sus líneas `[D7]`.

**R30.** El selector de insumos del formulario de receta NO DEBE ofrecer productos terminados `[D7]`.

**R31.** CUANDO se registre un ajuste con cantidad positiva sobre un lote de un producto terminado, el
sistema DEBE rechazarlo con `action_not_allowed` sin mover la existencia ni escribir ningún asiento
`[D7]`.

**R32.** CUANDO se registre un ajuste con cantidad negativa sobre un lote de un producto terminado, el
sistema DEBE aplicarlo con las mismas reglas que a cualquier otro lote, incluido el rechazo de una
existencia final negativa `[D7]`.

**R33.** MIENTRAS el lote que se ajusta pertenezca a un producto terminado, el diálogo de ajuste DEBE
indicar que solo se admiten cantidades que restan `[D7]`.

### E. Transversales

**R34.** El sistema DEBE nombrar en inglés toda tabla, columna, restricción y valor de enumeración
nuevos, y NO DEBE borrar físicamente ningún producto terminado, lote ni asiento `[D10]`.

**R35.** CUANDO se dé de baja un producto terminado con el borrado lógico existente y después se
finalice un pedido de su combinación, el sistema DEBE crear un producto terminado nuevo y NO DEBE
añadir el lote al dado de baja `[D2]` `[D10]` **(provisional, pregunta 7)**.

**R36.** CUANDO se revierta la migración, el sistema DEBE dejar el esquema como estaba, y SI existe
algún producto terminado o algún asiento de producción, ENTONCES la reversión DEBE fallar sin cambiar
nada `[D10]`.

**R37.** El sistema DEBE tener un test E2E que recorra: dar contenido a una presentación, crear y
asignar un pedido con esa presentación, finalizarlo en `/asignacion/[id]` y ver en inventario el
producto terminado con su lote, su cantidad y sus envases `[D9]`.

## Preguntas abiertas

1. **Unidad de la cantidad del pedido.** El pedido no guarda unidad propia (QC-147: el consumo es
   cantidad × % en la unidad de cada insumo). Esta ficha la lee en la unidad de su presentación
   (50 con «Botella 1L» = 50 L). Falta confirmar que siempre es así, p. ej. con un «Saco 25 kg».
2. **Coste unitario con sobrante.** Si se costó 50,5 L y entran 50 L, ¿el coste unitario es
   coste / 50 (el sobrante encarece lo que entra) o coste / 50,5 (el sobrante se pierde a su coste)?
3. **Pedido sin coste** (QC-123 lo deja en nulo): el lote entra sin coste unitario. ¿Vale un lote sin
   coste, o hay que admitir el nulo en `unit_cost`?

*Añadidas por `spec_author` en F1.2 (2026-09-23). Salen del código, no de la semilla; la propuesta
de cada una está en `design.md > 0`.*

4. **Menos de un envase.** Un pedido de 0,5 L en «Botella 1L» da cero envases enteros. No entra
   nada y no hay divisor para el coste. ¿Se rechaza el Finalizar (propuesta, R19, código nuevo
   `no_whole_package`) o se entrega sin lote?
5. **Entregar desde la edición en Pedidos.** QC-141 consume también cuando la edición en Pedidos deja
   el pedido `ENTREGADO`, y QC-145 (pendiente) retira ese camino. La decisión D3 habla solo del
   Finalizar. Mientras los dos caminos convivan, ¿la edición también da de alta el lote (propuesta,
   R27), o se acepta que un pedido entregado por ahí no genere producto terminado?
6. **Cambiar el contenido de una presentación que ya tiene lotes de producto terminado.** Las
   botellas se muestran dividiendo la cantidad guardada entre el contenido *vigente*: si el contenido
   cambia, los lotes viejos mostrarían otra cifra. ¿Se bloquea el cambio como el de la unidad
   (`presentations_check_unit_locked`, propuesta), o se permite y los envases dejan de mostrarse
   cuando no dan un número entero?
7. **Producto terminado dado de baja.** D10 dice que usa el borrado lógico existente, y D2 que nace
   «solo la primera vez». Si se da de baja y se finaliza otro pedido de su combinación, ¿nace uno
   nuevo (propuesta, R35) o se rechaza el Finalizar?

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Qué es un producto terminado? | Un valor nuevo del tipo de producto, `FINISHED_PRODUCT`, añadido al final del enum `ProductType` (el que creó `cd7f07a6`). No se puede elegir al crear un producto a mano. |
| 2026-09-23 | ¿Qué producto entra al terminar? | Uno por **receta + presentación**, con nombre «receta · presentación». Nace solo la primera vez que se finaliza un pedido de esa combinación. Su unidad es la de la presentación (encaja con QC-121). |
| 2026-09-23 | ¿Cuándo entra? | Al **Finalizar** en `/asignacion/[id]` (pedido → `ENTREGADO`, QC-63/QC-145), en la misma operación. |
| 2026-09-23 | ¿Qué entra? | Un **lote**: presentación = la del pedido (QC-146); cantidad = envases enteros × contenido; coste unitario = coste de ingredientes (QC-123) / cantidad (ver pregunta 2). |
| 2026-09-23 | ¿Cómo se cuenta? | En **envases enteros, redondeando hacia abajo**: 50,5 L en «Botella 1L» → 50 botellas; el sobrante no entra. Se guarda en la **unidad de la presentación** (50 L), como QC-91; las botellas solo se muestran. |
| 2026-09-23 | ¿De dónde sale el contenido del envase? | La **presentación gana el campo «contenido»** (cantidad en su unidad), editable en la pantalla de presentaciones (QC-45). Es el alcance de QC-130, absorbido aquí. Un pedido cuya presentación no tenga contenido **no se puede finalizar**. |
| 2026-09-23 | ¿Qué se prohíbe? | Alta manual de lotes; ser ingrediente de una receta; ajustes que **suman**. Se permiten los ajustes que **restan** (la «venta» de hoy, QC-92). |
| 2026-09-23 | Existencia decimal | La trae **QC-141**, que por eso bloquea esta ficha. |
| 2026-09-23 | ¿E2E? | **Sí**: es un movimiento de inventario (`CHECKPOINTS.md`). Finalizar un pedido y ver entrar el lote. |
| 2026-09-23 | Identificadores y borrado | En inglés (QC-4); el producto terminado usa el borrado lógico que ya existe. |
