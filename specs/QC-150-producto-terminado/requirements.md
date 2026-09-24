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
> D8 existencia decimal, D9 E2E, D10 identificadores y borrado; y las filas añadidas en F1.4 el
> 2026-09-23: D11 unidad de la cantidad del pedido, D12 divisor del coste, D13 ingrediente sin coste,
> D14 cero envases, D15 solo por Finalizar, D16 copia del contenido, D17 producto dado de baja,
> D18 derivaciones confirmadas, D19 enmienda del catálogo de errores; y, al aprobar el spec,
> D20 pedido sin copia del contenido y D21 momento del cálculo del coste del lote.
>
> **Vocabulario.** *Producto terminado*: producto de tipo `FINISHED_PRODUCT`. *Combinación* de un
> pedido: su receta más su presentación. *Contenido* de una presentación: la cantidad que cabe en un
> envase, en la unidad de la presentación. *Contenido del pedido* (enmienda del 2026-09-23, D16): la
> copia del contenido de su presentación que el pedido guarda al crearse o al cambiar de
> presentación. *Envases enteros* de un pedido: ⌊cantidad del pedido / contenido del pedido⌋.
> *Cantidad que entra*: envases enteros × contenido del pedido.
>
> **Requisitos provisionales** *(ya no queda ninguno desde el 2026-09-23; se conserva la
> definición porque la citan las enmiendas)*. Los marcados **(provisional, pregunta N)** dependían de una pregunta
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
sin modificar el producto `[D1]` `[D7]` `[D18]` `[D19]`.

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

**R12.** *(Enmendado el 2026-09-23: deja de ser provisional por D11 y el contenido es el del pedido
por D16.)* El sistema DEBE leer la cantidad del pedido en la unidad de su presentación y calcular la
cantidad del lote como envases enteros × contenido del pedido, en esa unidad y con aritmética
decimal exacta: un pedido de `50.5` con contenido `1` da `50` envases y `50`; un pedido de `10` con
contenido `3` da `3` envases y `9`; un pedido de `50` con contenido `0.75` da `66` envases y `49.5`
`[D4]` `[D5]` `[D8]` `[D11]` `[D16]`.

**R13.** El sistema DEBE dar de alta el lote con la presentación del pedido, un número de lote
generado por el backend con el mismo correlativo por empresa que el alta de lotes, la fecha civil
UTC del Finalizar como fecha de compra, sin fecha de vencimiento y con quien finaliza como autor
`[D4]`.

**R14.** *(Enmendado el 2026-09-23: deja de ser provisional por D12; el coste que se divide es el de
R42.)* El sistema DEBE guardar como coste unitario del lote el coste del lote de R42 dividido entre
la cantidad que entra —no entre la cantidad del pedido—, con aritmética decimal exacta y redondeo
mitad arriba a cuatro decimales `[D4]` `[D12]`.

**R15.** *(Derogado el 2026-09-23 por D13: un lote sin ningún ingrediente con coste entra a coste
cero. Lo sustituyen R42 y R43.)* ~~SI el pedido no tiene coste de ingredientes, ENTONCES el sistema
NO DEBE guardar como coste unitario del lote cero ni ningún valor que no salga del coste del
pedido.~~

**R16.** CUANDO entre el lote, el sistema DEBE registrar en el libro de movimientos de inventario un
asiento de **producción** con la cantidad del lote en positivo, el pedido que lo causa y quien
finaliza como autor `[D3]` `[D10]`.

**R17.** CUANDO entre el lote, el sistema DEBE recalcular la existencia guardada del producto
terminado en la misma transacción `[D3]` `[D8]`.

**R18.** *(Enmendado el 2026-09-23: el contenido que cuenta es el del pedido, D16; lo que pasa con un
pedido sin copia lo fija R44.)* SI el pedido que se finaliza no tiene presentación, o no tiene
contenido con el que calcular los envases, ENTONCES el sistema DEBE rechazar el Finalizar con
`presentation_without_content` sin cambiar el pedido, el material apartado, las existencias ni
ningún producto `[D6]` `[D16]` `[D18]` `[D19]`.

**R19.** *(Enmendado el 2026-09-23: deja de ser provisional por D14.)* SI los envases enteros del
pedido son cero, ENTONCES el sistema DEBE rechazar el Finalizar con `no_whole_package` sin cambiar el
pedido, el material apartado, las existencias ni ningún producto `[D5]` `[D14]` `[D19]`.

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

**R25.** *(Enmendado el 2026-09-23 por D16: los envases salen del contenido guardado en el lote, no
del vigente de la presentación.)* MIENTRAS un lote pertenezca a un producto terminado, el sistema
DEBE mostrar en el panel de lotes, junto a la cantidad en la unidad de la presentación, el número de
envases del lote calculado con el contenido guardado en el lote, y SI esa división no da un número
entero, ENTONCES NO DEBE mostrar ninguna cifra de envases `[D5]` `[D16]`.

**R26.** El sistema DEBE dar de alta el producto terminado solo dentro del Finalizar y con el permiso
que el Finalizar ya exige, validado en el service antes de leer o escribir nada, y NO DEBE añadir
ningún permiso al catálogo `[D3]` `[D7]`.

**R27.** *(Enmendado el 2026-09-23 por D15: pasa a requisito negativo.)* CUANDO un pedido pase a
`ENTREGADO` por la edición en Pedidos, el sistema NO DEBE dar de alta ningún producto terminado, lote
ni asiento de producción `[D3]` `[D15]`.

### D. Lo que se prohíbe

**R28.** CUANDO el alta manual de un producto coincidiría con un producto terminado vivo —el camino
que añade el lote a un producto que ya existe—, el sistema DEBE rechazarla con `action_not_allowed`
sin escribir ningún producto, lote ni asiento `[D7]` `[D19]`.

**R29.** CUANDO se cree o edite una receta con una línea cuyo producto es un producto terminado, el
sistema DEBE rechazarla con `action_not_allowed` sin escribir la receta ni sus líneas `[D7]` `[D19]`.

**R30.** El selector de insumos del formulario de receta NO DEBE ofrecer productos terminados `[D7]`.

**R31.** CUANDO se registre un ajuste con cantidad positiva sobre un lote de un producto terminado, el
sistema DEBE rechazarlo con `action_not_allowed` sin mover la existencia ni escribir ningún asiento
`[D7]` `[D19]`.

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
añadir el lote al dado de baja `[D2]` `[D10]` `[D17]` *(deja de ser provisional el 2026-09-23)*.

**R36.** CUANDO se revierta la migración, el sistema DEBE dejar el esquema como estaba, y SI existe
algún producto terminado o algún asiento de producción, ENTONCES la reversión DEBE fallar sin cambiar
nada `[D10]`.

**R37.** El sistema DEBE tener un test E2E que recorra: dar contenido a una presentación, crear y
asignar un pedido con esa presentación, finalizarlo en `/asignacion/[id]` y ver en inventario el
producto terminado con su lote, su cantidad y sus envases `[D9]`.

### F. Enmienda de F1.4 (2026-09-23): copia del contenido y coste del lote

**R38.** CUANDO se cree un pedido, el sistema DEBE guardar en él, en la misma operación, una copia del
contenido que su presentación tenga en ese instante, o ninguna copia si la presentación no tiene
contenido `[D16]`.

**R39.** CUANDO una edición cambie la presentación de un pedido, el sistema DEBE sustituir su copia
por el contenido que la presentación nueva tenga en ese instante (o por ninguna); y SI la edición no
cambia la presentación, ENTONCES el sistema NO DEBE modificar la copia `[D16]`.

**R40.** CUANDO se cambie el contenido de una presentación, el sistema DEBE aceptarlo aunque la
presentación tenga pedidos o lotes, y NO DEBE modificar la copia de ningún pedido ni el contenido
guardado de ningún lote `[D16]`.

**R41.** CUANDO entre un lote de producto terminado, el sistema DEBE guardar en el lote el contenido
con el que se calcularon sus envases `[D16]`.

**R42.** *(Enmendado el 2026-09-23: deja de ser provisional por D21.)* SI el pedido tiene coste de
ingredientes guardado, ENTONCES el sistema DEBE usarlo como coste del lote; y SI no lo tiene,
ENTONCES el sistema DEBE calcular el coste del lote al Finalizar, antes de consumir el material, como
la suma de los costes de los ingredientes de la receta del pedido con la misma regla de coste que el
importe del pedido, contando como cero cada ingrediente cuyo coste no se pueda calcular; y SI ninguno
tiene coste, ENTONCES el coste del lote DEBE ser cero y el lote DEBE entrar con coste unitario cero
`[D4]` `[D13]` `[D21]`.

**R43.** El sistema NO DEBE cambiar, al finalizar un pedido ni por ninguna regla de esta ficha, el
coste de ingredientes que el pedido tiene guardado, que sigue siendo nulo cuando falta el coste de
algún ingrediente, y NO DEBE guardar nunca un lote de producto terminado sin coste unitario `[D13]`.

**R44.** *(Enmendado el 2026-09-23: deja de ser provisional por D20.)* SI el pedido que se finaliza
tiene presentación pero no tiene copia de su contenido, ENTONCES el sistema DEBE usar el contenido que
su presentación tenga en el instante del Finalizar, y SI tampoco lo tiene, ENTONCES DEBE rechazar el
Finalizar con `presentation_without_content` como dice R18 `[D16]` `[D20]`.

## Preguntas abiertas

Ninguna.

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
| 2026-09-23 (F1.4) | ¿En qué unidad está la cantidad del pedido? (pregunta 1) | En la **unidad de su presentación**. |
| 2026-09-23 (F1.4) | ¿Divisor del coste unitario con sobrante? (pregunta 2) | **Coste / cantidad que entra**: el sobrante encarece lo que entra. |
| 2026-09-23 (F1.4) | ¿Y si falta el coste? (pregunta 3) | Un **ingrediente sin coste cuenta como 0** y el coste del lote se calcula con el resto. **Solo** para el coste del lote de producto terminado: el importe del pedido de QC-123, nulo si falta un ingrediente, **no cambia**. `unit_cost` **sigue sin admitir nulo**. Si ningún ingrediente tiene coste, el lote entra a **coste 0**. |
| 2026-09-23 (F1.4) | ¿Menos de un envase entero? (pregunta 4) | Se **rechaza el Finalizar** con `no_whole_package`. |
| 2026-09-23 (F1.4) | ¿Entregar desde la edición en Pedidos da de alta el lote? (pregunta 5) | **No. Solo el Finalizar.** La edición en Pedidos que deja el pedido `ENTREGADO` no da de alta producto terminado. |
| 2026-09-23 (F1.4) | ¿Se bloquea cambiar el contenido de una presentación? (pregunta 6) | **No se bloquea: se copia.** El pedido guarda el contenido de su presentación al crearse y al cambiar de presentación en la edición, y el Finalizar usa esa copia. El lote guarda también su contenido para mostrar los envases. Cambiar después la presentación no altera pedidos ya hechos ni lotes. Los pedidos vivos anteriores a esta ficha no tienen copia: queda como pregunta 8. |
| 2026-09-23 (F1.4) | ¿Producto terminado dado de baja? (pregunta 7) | **Nace uno nuevo** al finalizar otro pedido de su combinación. |
| 2026-09-23 (F1.4) | Derivaciones de `spec_author` | **Confirmadas**: un pedido sin presentación no se finaliza; el tipo de un producto terminado no se cambia y nadie pasa a serlo por edición; se acepta que el día del despliegue ningún pedido se pueda finalizar hasta rellenar el contenido de su presentación. |
| 2026-09-23 (F1.4) | Enmienda del catálogo de errores | **Aprobada**: códigos nuevos `presentation_without_content` y `no_whole_package`; las prohibiciones usan el existente `action_not_allowed`. |
| 2026-09-23 (aprobación) | ¿Y un pedido sin copia del contenido? (pregunta 8: vivos anteriores a la ficha, o creados cuando su presentación aún no tenía contenido) | Al Finalizar se usa el **contenido vigente** de su presentación; si tampoco lo tiene, se **rechaza** con `presentation_without_content`. |
| 2026-09-23 (aprobación) | ¿Cuándo se calcula el coste del lote? (pregunta 9) | Si el pedido tiene **importe guardado** (QC-123), se usa ese. Si es **nulo**, se **recalcula al Finalizar** —ingrediente sin coste = 0— **antes de consumir** el material. |

## Nota del 2026-09-23 — respuestas de F1.4

El humano respondió en F1.4 las preguntas 1 a 7 y confirmó las derivaciones y la enmienda del
catálogo. Las respuestas son las filas D11 a D19 de la tabla de arriba (se añadieron al final y no
se reordenó nada). Efecto sobre los requisitos, **sin renumerar**:

- **Dejan de ser provisionales:** R12 (D11, y ahora usa el contenido del pedido, D16), R14 (D12), R19
  (D14) y R35 (D17).
- **Enmendados:** R18 y R25 (D16), y R27, que pasa a ser **negativo** (D15).
- **Derogado:** R15 (D13). Lo sustituyen R42 y R43.
- **Nuevos:** R38 a R44 (copia del contenido y coste del lote). R42 queda provisional por la
  pregunta 9 y R44 por la pregunta 8.
- **Siguen abiertas:** las preguntas 8 y 9, que nacen de estas respuestas.

**Cierre, mismo día (aprobación del spec).** El humano aprobó el spec y respondió las preguntas 8 y 9
con las propuestas de `spec_author`: son las filas **D20** (pedido sin copia → contenido vigente, o
rechazo) y **D21** (coste del lote: el importe guardado, o recalculado al Finalizar antes de consumir).
R42 y R44 dejan de ser provisionales. No queda ninguna pregunta abierta.

**D22 — 2026-09-24, en F2.1 (T7).** Pregunta surgida al implementar: el nombre «receta · presentación»
de R11 puede llegar a 183 caracteres (120 + 3 + 60) y el tope del nombre de producto es 120. **El
humano decidió subir el tope del nombre de TODO producto a 200 caracteres.** Sin migración (la
columna es `text`); cambia solo la validación de entrada del nombre de producto, en alta y edición,
para cualquier tipo. El nombre del producto terminado se guarda completo, sin recortar.
