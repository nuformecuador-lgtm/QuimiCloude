# QC-141 — reserva-de-material-del-pedido · requirements.md

> **Enmendado el 2026-09-23 (review).** Segunda enmienda, decidida por el humano tras el review
> F2.2 (RECHAZADO, `progress/review_QC-141-reserva-de-material-del-pedido.md`) y registrada en la
> fila **D21** de la tabla de decisiones. **Solo el Finalizar consume**, y lo hace en la misma
> transacción que escribe `finished_at` de QC-145: cambian R12, R26, R27 y R50; **R29 queda
> retirado**; nacen R51 a R58. Se quitan las marcas «provisional» y «pendiente de aprobación»: todo
> lo que colgaba de F1.4 (2026-09-22) y de E1/E2 (2026-09-23) está aprobado.

> **Enmendado el 2026-09-23**, a petición del humano, tras el merge de QC-147 en `dev`: adopta la
> fórmula «cantidad del pedido × %» en la unidad del producto (fila D19 de la tabla de decisiones).
> Cambian el vocabulario, R9, R11, R31 y R43; nacen R49 y R50. Las decisiones nuevas **E1** y
> **E2** (`design.md > 0.3`) las **aprobó el humano el 2026-09-23** (ver D21).

> **Zona:** `fullstack` · **Complejidad:** `high` · **depends_on:** — ·
> **Rama:** `feature/QC-141-reserva-de-material-del-pedido`
>
> **Alcance.** Un pedido vivo **aparta** el material que su receta necesita —todo o nada, de los
> lotes más antiguos primero—. Cancelar libera, editar recalcula lo apartado y entregar lo
> **consume** como salida real de inventario. La reserva de un pedido `PENDIENTE` **caduca a los 15
> días** y el pedido se cancela solo con motivo «pedido caducado», disparado por un **proceso diario
> programado** —el primero del sistema—. Inventario muestra total, disponible y reservado, con el
> **historial completo** de reservas. Los pedidos vivos existentes apartan al migrar. Además, la
> **existencia pasa de entero a decimal** (absorbe QC-149): lotes, movimientos y `products.stock`, y
> el alta de lote y el ajuste aceptan decimales.
>
> **Lo que NO entra.** El estado `BLOQUEADO`
> y su modal → **QC-138**, a la que ésta bloquea. Que solo la planta mueva el estado → **QC-145**.
> Pintar el importe → **QC-122**. Que la presentación declare cuánto contiene → **QC-130**. Plazo de
> caducidad configurable por empresa: otra ficha si hace falta.
>
> Sembrado por `/afinar-feature` el 2026-09-22. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> **Cómo se citan las decisiones.** `[Dn]` es la **fila n** de la tabla `## Decisiones cerradas
> (no reabrir)`, contando de arriba abajo: D1 ciclo de la reserva, D2 todo o nada, D3 qué sigue la
> reserva, D4 de qué lotes, D5 precisión y existencia decimal, D6 caducidad a 15 días, D7 qué pasa
> al caducar, D8 proceso diario, D9 merma sobre reservado, D10 pedidos existentes, D11 historial,
> D12 caminos de entrega, D13 concurrencia, D14 existencia del producto, D15 permisos, D16 borrado
> e identificadores, D17 E2E, D18 sin dependencia nueva, D19 enmienda del 2026-09-23 (fórmula de
> QC-147), D20 candidatos del proceso diario empresa por empresa, D21 enmienda del review del
> 2026-09-23 (excepción de la transacción compartida, solo el Finalizar consume, menores).
>
> **Vocabulario.** *Pedido vivo*: `PENDIENTE` o `EN_CURSO`, no borrado. *Cantidad necesaria* de un
> ingrediente: cantidad del pedido × porcentaje de su línea de receta / 100, expresada en la unidad
> del producto, sin conversión de unidades `[D19]`. *Apartado de un lote*: lo que los pedidos vivos tienen reservado en él. *Disponible de
> un lote*: su existencia menos su apartado, nunca por debajo de cero. *Sobre-reservado*: lote cuyo
> apartado supera su existencia.
>
> **Requisitos que salían de una pregunta.** Los marcados **(pregunta N)** o **(decisión E<n>)**
> llevan la opción que `design.md > 0` recomendaba. **Todas están aprobadas**: las preguntas 1-5 y
> N1-N10 en F1.4 el 2026-09-22, y E1 y E2 el 2026-09-23 (D21). *(Enmendado el 2026-09-23 (review):
> hasta esta enmienda se marcaban «provisional».)*

### A. Existencia decimal (absorbe QC-149)

**R1.** El sistema DEBE guardar la existencia de cada lote, la cantidad de cada movimiento de
inventario y la existencia del producto como decimales de hasta diez cifras enteras y cuatro
decimales `[D5]`.

**R2.** CUANDO se aplique la migración que cambia el tipo de esas tres cantidades, el sistema DEBE
conservar exactamente el valor numérico de cada existencia y cada movimiento ya guardados `[D5]`.

**R3.** CUANDO se registre el alta de un lote —el primero del producto o uno adicional—, el sistema
DEBE aceptar una existencia decimal mayor o igual que cero con hasta cuatro decimales, y DEBE
rechazar con `invalid_input`, sin escribir nada, una existencia negativa, con más de cuatro
decimales, con más de diez cifras enteras o que no sea un decimal en notación plana `[D5]`.

**R4.** CUANDO se registre un ajuste de existencia, el sistema DEBE aceptar una cantidad decimal
con signo, distinta de cero y con hasta cuatro decimales, y DEBE rechazar con `invalid_input`, sin
escribir nada, el cero, más de cuatro decimales o una cantidad que no sea un decimal en notación
plana `[D5]`.

**R5.** CUANDO el alta de un lote derive el coste unitario del coste total, el sistema DEBE dividir
el total entre la existencia decimal con aritmética decimal exacta y redondeo a cuatro decimales
mitad arriba, y SI la existencia es cero, ENTONCES DEBE rechazar la derivación señalando el campo
de la existencia `[D5]`.

**R6.** El sistema NO DEBE convertir a coma flotante binaria ninguna existencia, cantidad apartada,
disponible o restante en ningún punto entre la base y la pantalla, incluida la columna «restante»
del formulario de pedido `[D5]`.

### B. Apartar

**R7.** CUANDO se cree un pedido, el sistema DEBE, en la misma operación que lo guarda, apartar para
cada ingrediente de su receta la cantidad necesaria, aplicando R8 a R12 `[D1]` `[D3]`.

**R8.** CUANDO el sistema aparte para un ingrediente, DEBE considerar solo los lotes de ese producto
de la empresa del pedido con disponible mayor que cero, recorrerlos por **fecha de compra
ascendente** desempatando por **número de lote** —numérico si los dos son solo dígitos, como texto
en otro caso—, y tomar de cada uno lo menor entre su disponible y lo que falte, hasta cubrir la
cantidad necesaria `[D4]`.

**R9.** *(Enmendado el 2026-09-23; sustituye a la versión que saltaba el ingrediente de unidad sin
base común, pregunta N3, que queda derogada.)* SI el producto de un ingrediente no tiene unidad,
ENTONCES el sistema DEBE tratar ese ingrediente como no cubierto, con el efecto de R10 sobre todo el
pedido `[D2]` `[D19]` `[D21]` (decisión E1).

**R10.** SI la existencia disponible no cubre la cantidad necesaria de al menos un ingrediente,
ENTONCES el sistema NO DEBE apartar nada para ese pedido, tampoco para los ingredientes que sí
alcanzan, y el material queda libre para otros pedidos `[D2]`.

**R11.** *(Enmendado el 2026-09-23: la cantidad necesaria sale ahora de una cantidad de hasta cuatro
decimales por un porcentaje de hasta dos, entre cien, así que puede traer hasta ocho decimales.)* El
sistema DEBE apartar exactamente la cantidad necesaria, sin redondear, cuando cabe en cuatro
decimales `[D5]`; SI la cantidad necesaria tiene más de cuatro decimales, ENTONCES el sistema DEBE
apartar esa cantidad redondeada **hacia arriba** al cuarto decimal, una vez por ingrediente: un
pedido de `0.0001` con un ingrediente al `0.01 %` aparta `0.0001` `[D5]` `[D19]` (pregunta N1).

**R12.** *(Enmendado el 2026-09-23 (review): tras QC-145 la edición en Pedidos ya no cambia el
estado, así que sale «estado» de la lista.)* CUANDO se edite un pedido vivo —cantidad, receta o
prioridad—, el sistema DEBE, en la misma operación, recalcular lo apartado desde cero con la regla
de R8 a R11, contando como disponible para ese pedido lo que él mismo tenía apartado, y DEBE
registrar por cada lote solo la diferencia: un apartado adicional si sube y una liberación de la
diferencia si baja `[D1]` `[D3]` `[D21]`.

**R13.** SI tras la edición el pedido ya no puede cubrirse, ENTONCES el sistema DEBE liberar todo lo
que tenía apartado `[D2]` `[D3]`.

**R14.** CUANDO se edite una receta, el sistema NO DEBE modificar lo apartado por ningún pedido que
la use `[D3]`.

**R15.** SI falla cualquier paso de crear, editar, cancelar, borrar o entregar un pedido, ENTONCES
el sistema NO DEBE dejar escrito ni el cambio del pedido ni ningún cambio de lo apartado o de la
existencia `[D1]` `[D13]`.

**R16.** MIENTRAS dos operaciones aparten sobre lotes del mismo producto, el sistema DEBE
serializarlas de modo que la suma apartada sobre un lote nunca supere su existencia en el instante
de apartar: con 2.000 disponibles y dos pedidos simultáneos de 1.500, exactamente uno aparta y el
otro no aparta nada `[D13]`.

**R17.** El sistema NO DEBE apartar, liberar ni consumir material de un lote de otra empresa que la
del pedido `[D15]`.

### C. Liberar

**R18.** CUANDO se cancele un pedido, el sistema DEBE liberar todo lo que tenía apartado en la misma
operación, registrando la liberación con quien canceló como autor `[D1]` `[D11]`.

**R19.** CUANDO se borre lógicamente un pedido vivo, el sistema DEBE liberar todo lo que tenía
apartado en la misma operación `[D1]` (pregunta N5).

### D. Caducidad

**R20.** El sistema DEBE contar el plazo de caducidad de un pedido desde el instante en que apartó o
desde su última edición, lo que sea posterior, y una edición DEBE reiniciarlo `[D3]` `[D6]`.

**R21.** CUANDO se ejecute el proceso diario, el sistema DEBE cancelar cada pedido `PENDIENTE` con
material apartado cuyo plazo más **15 días** sea anterior o igual al instante de ejecución, con el
motivo exacto «pedido caducado» y **sin persona autora**, y DEBE liberar su material registrándolo
como caducidad, todo en la misma operación por pedido `[D6]` `[D7]` `[D11]`.

**R22.** El proceso diario NO DEBE cancelar ni liberar un pedido `EN_CURSO`, `ENTREGADO`,
`CANCELADO` o borrado `[D6]`, ni un pedido `PENDIENTE` sin material apartado (pregunta 1).

**R23.** El sistema DEBE tener declarado el proceso diario como tarea programada de la plataforma
de despliegue, con una ejecución al día `[D8]` `[D18]`.

**R24.** SI una llamada al proceso diario no trae el secreto de acceso correcto, ENTONCES el sistema
DEBE responder `401` sin leer ni escribir ningún pedido; y SI el secreto no está configurado en el
entorno, ENTONCES DEBE responder `500` sin leer ni escribir ningún pedido `[D8]`.

**R25.** CUANDO el proceso diario se ejecute dos veces, o dos ejecuciones se solapen, el sistema DEBE
cancelar cada pedido caducado una sola vez y liberar su material una sola vez `[D8]`.

**R26.** *(Enmendado el 2026-09-23 (review).)* SI la caducidad de un pedido falla, ENTONCES el
sistema DEBE dejar ese pedido y su material como estaban, seguir con los demás pedidos y notificar
el fallo por el canal definido, indicando el pedido, su empresa y el código del error `[D8]`
`[D21]` (pregunta 3).

### E. Consumir al entregar

**R27.** *(Enmendado el 2026-09-23 (review): la edición en Pedidos ya no entrega tras QC-145; solo
queda el Finalizar.)* CUANDO un pedido pase a `ENTREGADO` por el Finalizar de la planta, el sistema
DEBE, en la misma operación que el cambio de estado, por cada lote apartado: bajar su existencia en
la cantidad apartada, registrar una **salida** en el libro de movimientos de inventario con esa
cantidad en negativo y el pedido que la causa, y registrar el **consumo** en el historial de
reservas `[D1]` `[D11]` `[D12]` `[D21]`.

**R28.** CUANDO el sistema consuma material, DEBE recalcular la existencia de cada producto afectado
en la misma transacción `[D14]`.

**R29.** *(Retirado el 2026-09-23 (review), `[D21]`.)* Pedía consumir al entregar desde la edición
en Pedidos cambiando la cantidad o la receta. Ese camino ya no existe tras QC-145; lo sustituye
R52. El número no se reutiliza.

**R30.** SI al entregar un lote apartado tiene menos existencia que lo apartado por ese pedido,
ENTONCES el sistema DEBE completar lo que falte desde otros lotes con disponible, en el orden de R8,
y SI ni así alcanza, ENTONCES DEBE rechazar la entrega con `insufficient_material` sin cambiar el
pedido ni el inventario `[D9]` `[D12]` (pregunta 2).

**R31.** SI el pedido que se entrega no tiene material apartado, ENTONCES el sistema DEBE calcular
su cantidad necesaria con su receta actual y consumirla de los lotes con disponible con la regla de
R8 a R11, y SI no alcanza, ENTONCES DEBE rechazar la entrega con `insufficient_material` sin
cambiar el pedido ni el inventario `[D2]` `[D12]` (pregunta N2). *(Enmendado el
2026-09-23: la cantidad necesaria es la de la fórmula de D19; si la receta actual no tiene líneas,
aplica R50.)*

**R32.** El sistema NO DEBE consumir dos veces el material de un mismo pedido `[D12]`.

### F. Merma sobre material reservado

**R33.** CUANDO un ajuste a la baja deje la existencia de un lote por debajo de su apartado sin
bajar de cero, el sistema DEBE aceptar el ajuste y DEBE indicar en su respuesta que el lote queda
sobre-reservado `[D9]`.

**R34.** MIENTRAS el apartado de un lote supere su existencia, el sistema DEBE mostrarlo marcado
«sobre-reservado» en inventario `[D9]`.

**R35.** MIENTRAS un pedido tenga material apartado en un lote sobre-reservado, el sistema DEBE
mostrar ese pedido como «sin cobertura completa» en Pedidos `[D9]`.

### G. Inventario y su historial

**R36.** El sistema DEBE mostrar en inventario, por producto, la existencia **total**, lo
**reservado** —suma de lo apartado en sus lotes— y lo **disponible** —suma de los disponibles de
sus lotes— `[D1]`.

**R37.** El sistema DEBE mostrar en inventario, por lote, su existencia, su apartado y su disponible
`[D1]` `[D9]`.

**R38.** CUANDO se consulte el historial de un lote, el sistema DEBE devolver cada apartado,
liberación, caducidad y consumo que lo tocó, con su fecha, su cantidad, el número visible del pedido
y su autor —o la indicación de que lo hizo el sistema—, junto con sus movimientos de inventario, del
más reciente al más antiguo `[D11]` (ubicación en pantalla: pregunta 4).

**R39.** El sistema NO DEBE modificar ni borrar ningún registro del historial de reservas ni del
libro de movimientos: toda corrección es un registro nuevo `[D11]` `[D16]`.

**R40.** CUANDO alguien consulte inventario o el historial de un lote sin el permiso
`inventario.consultar`, el sistema DEBE rechazarlo en el service con `unauthorized` antes de leer
ningún dato `[D15]`.

**R41.** El sistema DEBE ejecutar el apartado, la liberación y el consumo solo dentro de las
operaciones de pedidos y de asignaciones y con el permiso que cada una ya exige, validado en el
service, y NO DEBE añadir ningún permiso al catálogo `[D15]`.

**R42.** CUANDO se consulte el historial o lo reservado, el sistema NO DEBE devolver datos de otra
empresa, y un lote de otra empresa DEBE responderse igual que uno inexistente `[D15]`.

### H. Pedidos existentes

**R43.** *(Enmendado el 2026-09-23.)* CUANDO se aplique la migración, el sistema DEBE apartar
material para cada pedido vivo existente, empresa por empresa y del pedido más antiguo al más nuevo,
con la misma cantidad necesaria (cantidad del pedido × porcentaje / 100, en la unidad del
producto), la misma regla todo-o-nada, el mismo orden de lotes y la misma precisión que R8 a R11, y
NO DEBE apartar nada para un pedido cuya receta no tenga líneas `[D10]` `[D19]`.

**R44.** CUANDO un pedido aparte en la migración, el sistema DEBE contar su plazo de caducidad desde
el instante de la migración `[D10]` `[D6]`.

**R45.** CUANDO se revierta la migración, el sistema DEBE dejar el esquema como estaba, y SI alguna
existencia o cantidad guardada tiene parte decimal, ENTONCES la reversión DEBE fallar sin cambiar
nada `[D5]` `[D10]`.

### I. Transversales

**R46.** El sistema DEBE nombrar en inglés toda tabla, columna y valor de enumeración nuevos, y NO
DEBE borrar físicamente ninguna fila de reserva, movimiento o pedido `[D16]`.

**R47.** El sistema NO DEBE añadir ninguna dependencia a `package.json` `[D18]`.

**R48.** El sistema DEBE tener un test E2E que recorra: dos pedidos compiten por el mismo lote y el
segundo no aparta; cancelar el primero libera su material; entregar un pedido consume y baja la
existencia `[D17]`.

### J. Receta sin líneas (enmienda del 2026-09-23)

**R49.** SI la receta de un pedido no tiene ninguna línea al crearlo o editarlo, ENTONCES el
sistema DEBE guardar la operación sin apartar nada y sin error, y el pedido DEBE quedar sin material
apartado `[D2]` `[D19]` `[D21]` (decisión E2).

**R50.** *(Enmendado el 2026-09-23 (review): un solo camino de entrega.)* SI se finaliza un pedido
sin material apartado cuya receta actual no tiene ninguna línea, ENTONCES el sistema DEBE rechazar
la entrega con `recipe_without_lines`, sin cambiar el pedido —ni su estado ni su fecha de
terminado— ni el inventario `[D12]` `[D19]` `[D21]` (decisión E2).

### K. Enmienda del review (2026-09-23)

**R51.** CUANDO el Finalizar de la planta entregue un pedido, el sistema DEBE guardar en la misma
transacción el paso a `ENTREGADO`, la fecha de terminado del pedido y el consumo de su material, y
SI cualquiera de las tres cosas falla —incluidos `insufficient_material` y
`recipe_without_lines`—, ENTONCES NO DEBE quedar escrita ninguna de ellas `[D12]` `[D13]` `[D21]`.

**R52.** CUANDO se edite un pedido en Pedidos, el sistema NO DEBE consumir material ni escribir
ninguna salida de inventario ni ningún consumo en el historial de reservas `[D12]` `[D21]`.

**R53.** SI entre que el proceso diario elige un pedido como caducado y lo caduca, una edición le
reinicia el plazo o lo deja sin material apartado, ENTONCES el proceso diario NO DEBE cancelar ese
pedido ni liberar su material `[D3]` `[D6]` `[D21]`.

**R54.** SI el proceso diario falla al buscar los pedidos caducados de una empresa, ENTONCES el
sistema DEBE notificar el fallo por el canal definido indicando la empresa y el código del error,
DEBE seguir con las demás empresas y DEBE terminar la ejecución marcada como fallida `[D8]` `[D20]`
`[D21]`.

**R55.** CUANDO la caducidad de un pedido falle durante una ejecución del proceso diario, el sistema
NO DEBE volver a intentar ese pedido en esa misma ejecución, y DEBE registrar ese fallo una sola vez
`[D8]` `[D21]`.

**R56.** CUANDO la migración aparte los pedidos existentes, el sistema DEBE recorrer los lotes de una
misma fecha de compra en el mismo orden que la operación, también cuando se mezclan números de lote
de solo dígitos con otros que no lo son (`'-X'` y `'5'`) y cuando dos números de lote difieren solo
en mayúsculas (`'a'` y `'B'`) `[D4]` `[D10]` `[D21]`.

**R57.** SI se revierte la migración que apartó los pedidos existentes y, después de aplicarla, algún
pedido registró otro movimiento de reserva o volvió a apartar, ENTONCES la reversión DEBE fallar sin
cambiar nada `[D10]` `[D16]` `[D21]`.

**R58.** El sistema DEBE filtrar por empresa toda lectura y escritura de la persistencia de pedidos,
y la única operación exenta de ese filtro DEBE ser la apertura de la transacción que comparten
pedidos e inventario, que no lee ni escribe ninguna tabla `[D15]` `[D21]`.

## Preguntas abiertas

> *(Enmendado el 2026-09-23 (review).)* Las preguntas 1 a 6 están **resueltas**: la 1-5 con las
> opciones recomendadas de `design.md > 0.1`, aprobadas en F1.4 el 2026-09-22; la 6 con E1 y E2,
> aprobadas el 2026-09-23 (D21). Se conservan como registro. La **7** es nueva y sigue abierta.

1. **Pedido que nunca se cubre.** Con «todo o nada», un pedido que no alcanza no aparta nada, así
   que no tiene reserva que caduque. ¿Se cancela también a los 15 días de creado, o espera
   indefinidamente —que es donde QC-138 lo dejará `BLOQUEADO`—?
2. **Entregar un pedido cuyo lote reservado ya no tiene el material** (tras una merma). ¿Consume de
   otros lotes disponibles, consume lo que haya, o rechaza la entrega?
3. **Canal de aviso de fallos del proceso diario.** `docs/conventions.md` exige que en crons todo
   error relevante notifique «por el canal definido», y ese canal no está definido en el repo.
4. **Dónde se consulta el historial de reservas** en la pantalla de inventario. Lo propone
   `spec_author` y se aprueba en F1.4.
5. **Detalles de la existencia decimal** que traía QC-149 sin acotar: cuántos decimales se
   **muestran** en pantalla y si la **cantidad de alerta** del producto también pasa a decimal.
6. **(Enmienda del 2026-09-23.)** Las decisiones **E1** (producto sin unidad) y **E2** (receta sin
   líneas) que recoge la fila D19, con su propuesta en `design.md > 0.3`. **Aprobadas el
   2026-09-23** (D21).
7. **(Enmienda del review, 2026-09-23. ABIERTA.) El orden de lotes no es un orden total.** El
   desempate de D4 («numérico si los dos son solo dígitos, como texto en otro caso») compara cada
   par por separado, y con tres lotes de la misma fecha puede cerrar un ciclo: `'9' < '10'` por
   número, `'10' < '1a'` y `'1a' < '9'` por texto. Con un ciclo el resultado depende del algoritmo
   de ordenación, así que ni la operación es estable ni la migración puede reproducirla «exactamente»
   (m5). R56 exige la paridad en los casos sin ciclo (los del review). Para el caso con ciclo hay que
   decidir: **(a)** hacer el orden total en los dos lados —por ejemplo, los lotes de solo dígitos
   antes que los demás, que cambia el orden del **coste** de QC-123 cuando se mezclan tipos en una
   misma fecha—, o **(b)** aceptar que con ciclo no se garantiza la paridad y dejarlo escrito. Ver
   `design.md > 4.3.1`.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-21 | Ciclo de la reserva | **Cancelar libera**; **entregar consume** de verdad (la reserva se convierte en salida real y la existencia baja); **editar a la baja libera la diferencia**; inventario muestra **total, disponible y reservado**. Decidido al acotar **QC-138** |
| 2026-09-22 | ¿Qué aparta un pedido que no alcanza? | **Nada**, y **todo o nada por pedido**: si falta un solo ingrediente, no aparta ninguno —tampoco los que sí alcanzan—. El material queda libre para un pedido que sí se pueda fabricar |
| 2026-09-22 | ¿Qué sigue la reserva? | **Lo que el pedido necesita hoy.** Crear y editar —al alza, a la baja, cambio de receta o de cantidad— recalculan lo apartado con la misma regla todo-o-nada. Editar **reinicia** el plazo de 15 días. Una edición posterior **de la receta** no toca reservas ya hechas (mismo criterio que el importe congelado, **QC-123 D8**) |
| 2026-09-22 | ¿De qué lotes? | **Los más antiguos primero**: fecha de compra ascendente, desempate por número de lote —numérico si ambos son solo dígitos— (heredado de **QC-123 D3 y D18**). Un ingrediente cuya unidad **no comparte base** con la del lote **no se reserva** (**QC-123 D6**, **QC-138**) |
| 2026-09-22 | ¿Con qué precisión se aparta? | **Decimal de 4 decimales**, como la receta y el pedido: se aparta exactamente lo necesario, sin redondear. **Deroga** «existencia entera» (QC-14/QC-91/QC-121). El cambio de tipo **entra en esta ficha** (absorbe **QC-149**, cancelada el 2026-09-22): `product_batches.stock`, `inventory_movements.quantity` y `products.stock` a `Decimal(14,4)` sin perder los enteros existentes, y el alta de lote y el ajuste aceptan decimales |
| 2026-09-22 | ¿La reserva caduca? | **Sí, a los 15 días** desde que se apartó o desde la última edición del pedido. **Solo pedidos `PENDIENTE`**: un `EN_CURSO` ya está en planta y no caduca |
| 2026-09-22 | ¿Qué pasa al caducar? | El pedido **se cancela** con el motivo **«pedido caducado»**, sin persona autora, y su material se libera |
| 2026-09-22 | ¿Quién dispara la caducidad? | **Un proceso diario programado** (tarea programada de Vercel), el **primero del sistema**, con su secreto de acceso y su aviso de fallos (ver pregunta abierta 3) |
| 2026-09-22 | Merma sobre material reservado | **Se permite y se avisa.** El ajuste a la baja refleja lo que físicamente hay; el lote queda marcado **«sobre-reservado»** y sus pedidos se ven sin cobertura completa |
| 2026-09-22 | Pedidos existentes | **Apartan al migrar**, del más antiguo al más nuevo, con la regla todo-o-nada. Sus 15 días cuentan desde la migración |
| 2026-09-22 | ¿Historial? | **Completo**: cada apartado, liberación, caducidad y consumo queda registrado y consultable. El consumo al entregar es además **salida real de inventario**, como el alta y el ajuste |
| 2026-09-22 | ¿Por dónde se entrega? | Consume en **cualquier camino que deje el pedido `ENTREGADO`**: hoy el Finalizar de la planta (QC-63) y la edición en Pedidos, que **QC-145** retirará |
| 2026-09-22 | Concurrencia | Dos pedidos sobre el mismo lote **se serializan**. El mecanismo lo elige `spec_author` con los precedentes de **QC-81** (bloqueo consultivo por empresa) y **QC-111** (`UPDATE` condicional) |
| 2026-09-22 | Existencia del producto | Consumir recalcula `products.stock` **en la misma transacción** (heredado de **QC-121 D4**) |
| 2026-09-22 | Permisos | **Sin permiso nuevo.** Inventario, incluido el historial, con `inventario.consultar`; la reserva nace dentro de las operaciones de pedidos y de asignaciones, cada una con su permiso actual. Validado **en el service** (heredado de **QC-123** y **QC-138**) |
| Heredada de la feature 4 | Borrado e identificadores | Borrado **lógico** donde aplique e identificadores de base **en inglés** |
| 2026-09-22 | ¿E2E? | **Sí**: es movimiento de inventario (`CHECKPOINTS.md`). Mínimo: dos pedidos compiten por el mismo lote y el segundo no aparta; cancelar libera; entregar consume y baja la existencia |
| 2026-09-22 | ¿Dependencia nueva? | **Ninguna librería.** La tarea programada es configuración de Vercel, no dependencia |
| 2026-09-23 | ¿Qué fórmula usa la reserva tras QC-147? | **Adopta la fórmula de QC-147**: lo que aparta, libera y consume un pedido es **cantidad del pedido × % de la línea / 100**, en la **unidad fija del producto** (QC-121), sin unidad en la línea ni conversión; se retira la regla de «unidad sin base común» de D4 (pregunta N3). Enmienda pedida por el humano. **Pendientes de aprobar** (propuesta en `design.md > 0.3`): **E1** — un producto **sin unidad** (sin lotes) cuenta como **«no alcanza»**, y el pedido no aparta nada (todo o nada); **E2** — un pedido con receta **sin líneas** (todas tras la migración de QC-147) **no aparta** y no da error al crear, editar o migrar, y **su entrega se rechaza** con `recipe_without_lines` si no tiene nada apartado |
| 2026-09-23 | ¿Cómo encuentra el proceso diario los pedidos caducados? | **Empresa por empresa**, filtrando cada consulta por la empresa, sin excepción en la guardia de ámbito de pedidos (`design.md > 9.1`). Y en el registro de códigos de error **manda la convención de comentarios**: los códigos nuevos no citan la ficha. Decidido por el humano en F2.1 |
| 2026-09-23 | ¿Cómo se cierra el review F2.2 (RECHAZADO)? | Decidido por el humano. **(1) Excepción con nombre (B3):** `order-unit-of-work-prisma.ts` usa el cliente global de Prisma **solo** para abrir la transacción que comparten pedidos e inventario; queda exento de `guard-ambito-empresa-pedidos` **por nombre de archivo**, con el motivo escrito en la guardia citando esta decisión. Se retira el alias `sharedPrismaClient` y se vuelve a importar como `prisma`: la excepción es visible, no depende de que la guardia no reconozca un alias. **(2) Solo el Finalizar consume (B4):** se retira el consumo al entregar desde la edición en Pedidos (R29), camino que QC-145 ya quitó; el Finalizar consume el material **y** escribe `finished_at` (QC-145) **en la misma transacción**: las dos cosas o ninguna. Ajusta **D12**: el único camino que deja un pedido `ENTREGADO` es el Finalizar. **(3) Menores m1-m7, todos en esta vuelta.** Además, **E1 y E2 (D19) están aprobados desde el 2026-09-23**, y con ellos R9, R49 y R50 |
