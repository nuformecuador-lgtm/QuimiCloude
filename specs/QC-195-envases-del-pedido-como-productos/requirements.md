# QC-195 — envases-del-pedido-como-productos · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** — · **Rama:** `feature/QC-195-envases-del-pedido-como-productos`
>
> **Alcance:** el reparto del pedido deja de elegir presentaciones y pasa a elegir productos
> PACKAGING (envases). Cada envase tiene una sola presentación fija, de la que sale el contenido
> para el cálculo actual. El selector solo lista los envases cuya presentación tiene la misma
> unidad base que la cantidad del pedido (l → l, ml). Los envases elegidos se apartan con el
> mismo flujo que las materias primas, con el aviso y el bloqueo de QC-138, y su costo se suma a
> la cotización.
>
> **Lo que NO entra:** migrar los repartos de pedidos ya existentes.
>
> Sembrado por `/afinar-feature` el 2026-10-03. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` en F1.2 (2026-10-03). Cada requisito cita entre corchetes la fila de
> «Decisiones cerradas» que lo origina: **[D1]** envase y presentación, **[D2]** stock en envases,
> **[D3]** qué lista el selector, **[D4]** reserva y aviso, **[D5]** cálculo del reparto, **[D6]**
> pedidos existentes, **[D7]** costo (en el orden de la tabla). Los marcados **[P1]**, **[P3]** o
> **[N<n>]** dependen de una decisión que el humano aún no ha tomado (`design.md > 1`): están
> escritos con la opción **recomendada** y se reescriben en F1.4 si el humano elige otra.
>
> Vocabulario. *Envase*: producto de inventario de tipo PACKAGING. *Presentación del envase*: la
> única presentación fija de ese producto. *Disponible*: el de QC-141 (existencia menos apartado,
> nunca por debajo de cero). *Línea antigua*: línea de reparto guardada antes de esta feature, que
> nombra una presentación y ningún envase.

### A. El envase como producto de inventario

**R1.** El sistema DEBE guardar en cada producto PACKAGING dado de alta a partir de esta feature
exactamente una presentación, la que se elige en su alta, y DEBE rechazar sin escribir nada el alta
de un producto PACKAGING que no la indique `[D1]`.

**R2.** SI se intenta cambiar la presentación de un producto PACKAGING que ya tiene una, ENTONCES
el sistema DEBE rechazar el cambio sin modificar el producto ni sus lotes `[D1]`.

**R3.** CUANDO se añada un lote a un producto PACKAGING, el sistema DEBE registrarlo en la
presentación fija del producto, y SI la entrada indica otra presentación, ENTONCES DEBE rechazar
el lote sin escribir nada `[D1]`.

**R4.** El sistema DEBE tratar como productos distintos dos envases con presentaciones distintas
—«Botella PET 500 ml» con la presentación de 500 ml y «Botella PET 1 L» con la de 1 l—, cada uno
con su propia existencia, sus lotes y su costo `[D1]`.

**R5.** El sistema NO DEBE permitir, ni desde la aplicación ni desde la base de datos, que un
producto de tipo PRODUCT o MACHINE tenga presentación propia, ni que un producto que no sea
FINISHED_PRODUCT tenga receta, ni que un FINISHED_PRODUCT carezca de receta o de presentación
`[D1]`.

**R6.** El sistema DEBE expresar en número de envases la existencia, la existencia de cada lote,
los ajustes, lo apartado y el disponible de un producto PACKAGING dado de alta a partir de esta
feature: un lote de 100 botellas tiene existencia `100` y se muestra como 100 envases `[D2]`
`[P1]`.

**R7.** SI la existencia declarada en el alta o en el ajuste de un lote de un producto PACKAGING no
es un número entero de envases, ENTONCES el sistema DEBE rechazarla sin escribir nada `[D2]`
`[N3]`.

### B. El selector del reparto

**R8.** CUANDO quien tiene `pedidos.modificar` busque envases para el reparto de un pedido con
unidad, el sistema DEBE ofrecer solo productos PACKAGING vivos de su empresa, con presentación fija
y con contenido, cuya presentación tenga la misma unidad base efectiva (`baseUnitId ?? id`) que la
unidad del pedido: con el pedido en `l` aparecen los envases en `l` y en `ml`, y no aparecen los
envases en `kg` ni en `g` `[D3]` `[N1]`.

**R9.** El selector del reparto NO DEBE ofrecer un producto PACKAGING sin presentación fija —los
dados de alta antes de esta feature mientras no se resuelva P2— ni un producto de otro tipo
`[D1]` `[D3]` `[D6]`.

**R10.** El selector del reparto DEBE mostrar por cada envase su nombre, el nombre de su
presentación y su disponible en envases, y DEBE ofrecer también los envases con disponible cero
`[D4]` `[N2]`.

**R11.** SI una línea del reparto que llega al servidor nombra un producto que no existe, es de otra
empresa, está dado de baja, no es PACKAGING, no tiene presentación fija o cuya presentación no
comparte unidad base con la unidad del pedido, ENTONCES el sistema DEBE rechazar el guardado entero
sin escribir el pedido, la unidad, las líneas ni ningún apartado `[D3]`.

**R12.** SI el reparto que llega al servidor nombra dos veces el mismo envase, o dos envases con la
misma presentación, ENTONCES el sistema DEBE rechazarlo sin escribir nada `[D1]` `[N6]`.

### C. El cálculo del reparto

**R13.** El sistema DEBE calcular lo que cubre cada línea con envase como su número de envases por
el contenido de la presentación del envase, convertido a la unidad del pedido, y DEBE aplicar al
reparto las mismas reglas que hoy: el disponible del pedido es la cantidad menos la suma de las
líneas, igual o menor se acepta, pasar de la cantidad se rechaza al guardar y una presentación sin
contenido se rechaza `[D5]`.

**R14.** CUANDO se guarde una línea con envase, el sistema DEBE copiar en ella la presentación y el
contenido que tiene en ese instante la presentación del envase, y CUANDO se termine el empaque DEBE
dar de alta el producto terminado de esa línea en esa presentación, igual que hoy `[D1]` `[D5]`.

### D. Reserva de los envases

**R15.** CUANDO se cree un pedido, se edite o se edite su reparto, el sistema DEBE apartar de cada
envase del reparto tantos envases como indique su línea, en la misma operación que aparta las
materias primas de la receta y con su misma regla: del lote más antiguo al más nuevo y todo o nada
para el pedido entero. Un reparto de 40 botellas aparta 40 envases `[D2]` `[D4]`.

**R16.** SI el disponible de algún envase del reparto, o de alguna materia prima de la receta, no
cubre lo que el pedido necesita, ENTONCES el sistema NO DEBE dejar nada apartado para ese pedido
`[D4]`.

**R17.** SI al crear un pedido, o al editar un pedido `PENDIENTE` o `BLOQUEADO` —con la edición
completa o con la de «Reparto y unidad»—, falta disponible de algún envase, ENTONCES el sistema
DEBE responder con el mismo aviso que hoy da la falta de materia prima (`order_would_block`) sin
escribir nada, y con la confirmación de quien guarda DEBE guardar el pedido en `BLOQUEADO`, sin
nada apartado y sin importe `[D4]`.

**R18.** SI al editar un pedido `EN_CURSO` o `POR_EMPACAR` falta disponible de algún envase,
ENTONCES el sistema DEBE rechazar el guardado con `insufficient_material` sin modificar el pedido,
su reparto ni lo apartado `[D4]` `[N9]`.

**R19.** CUANDO se guarde el reparto de un pedido `BLOQUEADO` y el disponible ya cubra sus materias
primas y sus envases, el sistema DEBE dejar el pedido en `PENDIENTE` con todo apartado, igual que
hoy hace la edición completa `[D4]`.

**R20.** CUANDO se edite el reparto de un pedido quitando un envase o bajando sus envases, el
sistema DEBE liberar lo apartado que sobre de ese envase, en la misma operación `[D4]`.

**R21.** CUANDO la revisión de pedidos bloqueados evalúe un pedido, el sistema DEBE exigir que el
disponible cubra también los envases de su reparto, y NO DEBE desbloquearlo si falta alguno `[D4]`.

**R22.** CUANDO un pedido se cancele, se borre o caduque su reserva, el sistema DEBE liberar
también lo apartado de sus envases `[D4]`.

**R23.** El sistema NO DEBE cambiar lo que otro pedido tiene apartado al apartar, liberar o
consumir los envases de un pedido `[D4]`.

**R24.** MIENTRAS un pedido esté en `POR_EMPACAR`, CUANDO se edite su reparto, el sistema DEBE
sincronizar solo lo apartado de sus envases y NO DEBE volver a apartar ninguna materia prima ya
consumida `[D4]` `[P3]`.

**R25.** CUANDO se termine el empaque de un pedido, el sistema DEBE consumir del inventario, en la
misma transacción que da de alta el producto terminado, los envases que el pedido tiene apartados;
SI el disponible no alcanza para consumirlos todos, ENTONCES DEBE rechazar Terminar con
`insufficient_material` sin mover el estado ni dar de alta producto terminado `[D2]` `[D4]` `[P3]`.

**R26.** CUANDO un pedido pase a `POR_EMPACAR`, el sistema DEBE consumir sus materias primas como
hoy y NO DEBE consumir sus envases `[P3]`.

### E. Costo

**R27.** CUANDO el sistema calcule el importe de un pedido —la cotización del formulario de alta y
de edición, y el importe que guarda al crear y al editar—, DEBE sumar al costo de ingredientes el
costo de cada envase del reparto, calculado como sus envases por el **promedio simple** del costo
unitario por envase de todos los lotes de ese envase con disponible mayor que cero: con 40 botellas
y lotes A (100 envases a `0.50`) y B (50 envases a `0.70`), el envase cuesta 40 × (0.50 + 0.70) / 2
= `24.0000`, que se suma al de los ingredientes `[D7]` `[N4]`.

**R28.** SI la suma de los disponibles de los lotes de un envase es menor que sus envases en el
reparto, ENTONCES el pedido DEBE quedar sin importe, con la misma salida que los demás casos sin
importe, en la cotización y en lo guardado `[D7]`.

**R29.** El sistema DEBE obtener la cotización del formulario y el importe guardado con el mismo
cálculo, de modo que con el mismo reparto, receta, cantidad, lotes y apartados devuelvan el mismo
valor o los dos queden sin importe, y la cotización del formulario DEBE recalcularse cuando cambie
el reparto `[D7]`.

**R30.** CUANDO se calcule el costo de los envases de un pedido que ya existe, el sistema DEBE
contar como disponible de cada lote lo que ese mismo pedido tiene apartado en él, y NO DEBE incluir
en el promedio un lote sin costo unitario `[D7]`.

**R31.** CUANDO se termine el empaque de un pedido sin importe guardado, el sistema DEBE costear el
lote de producto terminado incluyendo el costo de sus envases con la misma regla de R27 `[D7]`
`[N8]`.

### F. Pedidos existentes

**R32.** El sistema NO DEBE modificar, migrar ni apartar nada a partir de las líneas antiguas: los
pedidos guardados antes de esta feature conservan su reparto en presentaciones, sin envase y sin
envases apartados `[D6]`.

**R33.** El sistema DEBE seguir mostrando las líneas antiguas con el nombre de su presentación en
la ficha, el listado, la pantalla de empaque y la de ejecución, y DEBE seguir dando de alta su
producto terminado al terminar el empaque como hoy `[D6]`.

**R34.** SI al guardar el reparto de un pedido llega una línea nueva, o una línea antigua con sus
envases cambiados, que no nombra un producto PACKAGING, ENTONCES el sistema DEBE rechazar el
guardado entero sin escribir nada `[D6]`.

**R35.** CUANDO se guarde un pedido cuyo reparto conserva una línea antigua sin cambios —misma
presentación y mismos envases—, el sistema DEBE conservarla como línea antigua, sin pedir envase y
sin apartar nada por ella `[D6]` `[N5]`.

### G. Formulario

**R36.** El formulario de alta y de edición del pedido y el diálogo «Reparto y unidad» DEBEN
mostrar el reparto en envases: cada línea con el nombre del envase y el de su presentación, sus
envases y lo que cubre en la unidad del pedido, y el selector de R8 para añadir líneas `[D3]`
`[D5]`.

**R37.** CUANDO el diálogo «Reparto y unidad» reciba el aviso de R17, el sistema DEBE mostrar la
misma confirmación que muestra hoy el formulario del pedido, y solo con ella reenviar el guardado
`[D4]`.

## Preguntas abiertas

- **Unidad «envase».** No existe una unidad de sistema para contar piezas. Hay que decidir si
  se crea (por ejemplo `unidad`) y cómo convive con el trigger `product_batches_check_unit`,
  que hoy exige que el lote use la unidad de su presentación. Toca unidades de medida
  (`docs/architecture.md > Preguntas abiertas del dominio`).
- **Envases ya cargados.** Qué pasa con los productos PACKAGING que ya tienen stock en litros o
  kilos: si se convierten o si se exige darlos de alta de nuevo.
- **Cuándo se consume el envase.** Si es con las materias primas, al pasar a `POR_EMPACAR`, o
  al Terminar el empaque (`createFinishPacking`).

> *(F1.2, `spec_author`, 2026-10-03.)* Las tres siguen **abiertas**: no las decide `spec_author`.
> En `design.md > 1` van como **P1** (unidad «envase»), **P2** (envases ya cargados) y **P3**
> (cuándo se consume), cada una con sus opciones y una recomendada, para F1.4. Los requisitos que
> dependen de ellas llevan la marca `[P1]` o `[P3]` (P2 solo afecta a R9, que ya vale con cualquier
> opción). Al investigar el código salieron además **N1 a N10**, decisiones que la acotación no
> cubre; están en `design.md > 1.4`, también con recomendación, y las que tocan un requisito lo
> marcan `[N<n>]`.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-03 | Envase y presentación | Un producto PACKAGING tiene una sola presentación fija; «Botella PET 500 ml» y «Botella PET 1 L» son productos distintos. Requiere ajustar `products_finished_identity_matches_type`. |
| 2026-10-03 | ¿En qué se cuenta su stock? | En envases. Un reparto de 40 botellas aparta 40 envases. |
| 2026-10-03 | ¿Qué envases lista el selector? | Solo los que tienen la misma unidad base que la cantidad del pedido (QC-76: `baseUnitId ?? id`). |
| 2026-10-03 | Reserva y aviso | Mismo flujo que las materias primas (QC-141): todo o nada, del lote más antiguo al más nuevo. Si falta stock, aviso y `BLOQUEADO` como en QC-138. |
| 2026-10-03 | Cálculo del reparto | Se mantiene `order-distribution.ts`: envases × contenido de la presentación, convertido a la unidad del pedido. |
| 2026-10-03 | Pedidos existentes | Quedan como están, sin apartar envases. Si se edita su reparto, hay que elegir productos PACKAGING. |
| 2026-10-03 | Costo | El costo del envase se suma a la cotización, con el costo promedio de QC-141 D22. |
