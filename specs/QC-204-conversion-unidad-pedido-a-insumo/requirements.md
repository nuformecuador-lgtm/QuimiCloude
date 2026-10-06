# QC-204 — conversion-unidad-pedido-a-insumo · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** — · **Rama** feature/QC-204-conversion-unidad-pedido-a-insumo
>
> **Alcance.** La necesidad de cada insumo (cantidad del pedido × %) se expresa en la **unidad del
> pedido** y se **convierte** a la unidad del insumo antes de costear, apartar y mostrar. Hoy no se
> convierte: un pedido de 1000 kg y uno de 1000 g dan el mismo costo y apartan lo mismo.
>
> **Lo que NO entra.** La densidad por producto (descartada, sin ficha). La precisión de `unit_cost`
> (**QC-178**). Agrupar insumos homónimos por familia de unidad (**QC-203**). Bloquear el cambio de
> base o factor de una unidad en uso (**QC-206**). Recalcular o migrar los pedidos ya guardados.
>
> Sembrado por `/afinar-feature` el 2026-10-05. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

**Términos.** *Necesidad de una línea*: cantidad del pedido × porcentaje ÷ 100, expresada en la
unidad del pedido. *Unidad del insumo*: la unidad guardada del producto de la línea. *Familia de
volumen*: las unidades cuya base efectiva es el **mililitro de sistema**; *familia de masa*: las
cuya base efectiva es el **gramo de sistema** (ver N1). *Línea exacta / aproximada / no
convertible*: el resultado de R2, R3 y R4. *Recálculo*: alta, edición, desbloqueo, cambio de
reparto, costo del lote al terminar el empaque, consumo al finalizar y cotización.

### Conversión de la necesidad (D1–D4)

- **R1** (ubicuo) El sistema DEBE calcular la necesidad de cada línea de receta de un pedido con
  unidad como cantidad del pedido × porcentaje ÷ 100 **en la unidad del pedido**, y convertirla a
  la unidad del insumo antes de usarla para costear, apartar, consumir o mostrar.
- **R2** (condicional) SI la unidad del pedido y la unidad del insumo comparten base efectiva,
  ENTONCES el sistema DEBE convertir la necesidad de forma **exacta** con los factores del catálogo
  de unidades. *Ejemplo verificable:* pedido de 1000 g, línea al 10 %, insumo en kg → 0,1 kg.
- **R3** (condicional) SI una de las dos unidades pertenece a la familia de volumen y la otra a la
  familia de masa, ENTONCES el sistema DEBE convertir la necesidad a la base de su familia, tomar
  esa misma cifra en la base de la otra familia (1 ml ≈ 1 g) y convertirla a la unidad del insumo,
  y DEBE clasificar la línea como **aproximada**. *Ejemplo verificable:* pedido de 2 l, línea al
  50 %, insumo en kg → 1 kg, aproximada.
- **R4** (condicional) SI la unidad del pedido y la del insumo no cumplen ni R2 ni R3, ENTONCES el
  sistema DEBE clasificar la línea como **no convertible** y NO DEBE producir ninguna cantidad para
  ella.

### Costo (D4, D6, D8)

- **R5** (por evento) CUANDO se calcula el costo de ingredientes de un pedido con unidad en
  cualquier recálculo, el sistema DEBE usar la necesidad convertida por R1–R3. *Ejemplo
  verificable:* misma receta y mismos lotes, un pedido de 1000 kg cuesta 1000 veces lo que uno de
  1000 g.
- **R6** (condicional) SI alguna línea de la receta es no convertible, ENTONCES el costo del pedido
  —el que se guarda y el que devuelve la cotización— DEBE ser «sin costo» (`null`).
- **R7** (condicional) SI al terminar el empaque se calcula el costo del lote de un pedido con una
  línea no convertible, ENTONCES esa línea DEBE contar como cero, con la misma regla que ya aplica
  hoy a un ingrediente sin costo (ver N4).
- **R8** (por evento) CUANDO el formulario de pedido pide una cotización, DEBE enviar la unidad del
  pedido, y CUANDO cambia la unidad elegida, el formulario DEBE pedir una cotización nueva.
- **R9** (condicional) SI la cotización llega sin unidad del pedido, o con una unidad que no existe
  o no es visible para la empresa del actor, ENTONCES el sistema DEBE devolver «sin costo» sin
  calcular nada.

### Reserva y consumo (D8)

- **R10** (por evento) CUANDO se aparta material para un pedido con unidad (alta, edición,
  desbloqueo, cambio de reparto), el sistema DEBE apartar de cada insumo la necesidad convertida,
  en la unidad del insumo. *Ejemplo verificable:* pedido de 1000 g, línea al 10 %, insumo en kg →
  se apartan 0,1 kg.
- **R11** (por evento) CUANDO se finaliza un pedido con unidad que no tiene nada apartado, la
  necesidad de respaldo con la que se consume DEBE ser la necesidad convertida.
- **R12** (condicional) SI alguna línea de la receta es no convertible al guardar el pedido,
  ENTONCES el sistema DEBE rechazar el guardado con el error `order_unit_not_convertible`, que nombra
  los insumos no convertibles, y NO DEBE escribir nada (Pregunta 1, opción B, cerrada el 2026-10-05).

### Lo que se muestra (D4, D7, D8)

- **R13** (ubicuo) La tabla de ingredientes del formulario de pedido DEBE mostrar la «cantidad
  requerida» y el «restante» de cada línea con la necesidad convertida y en la unidad del insumo,
  y DEBE recalcularlos CUANDO cambia la cantidad o la unidad del pedido.
- **R14** (condicional) SI una línea es no convertible, ENTONCES la tabla de ingredientes DEBE
  mostrar en esa línea un aviso de que la unidad del pedido no es convertible a la del insumo, sin
  cifra de «cantidad requerida» ni de «restante».
- **R15** (condicional) SI una línea es aproximada, ENTONCES la tabla de ingredientes DEBE mostrarla
  con la marca «aprox.».
- **R16** (ubicuo) La pantalla de ejecución del operario DEBE mostrar la cantidad de cada línea con
  la necesidad convertida y en la unidad del insumo; el cambio de unidad de visualización que ya
  ofrece DEBE partir de esa cantidad convertida.
- **R17** (condicional) SI una línea de la ejecución es aproximada, ENTONCES DEBE mostrarse con la
  marca «aprox.»; SI es no convertible, ENTONCES DEBE mostrarse sin cifra y con el aviso de R14.
- **R18** (de estado) MIENTRAS el bloque de costo del formulario muestre un importe y alguna línea
  de la receta sea aproximada, el bloque DEBE indicar que el importe incluye una aproximación.
- **R19** (de estado) MIENTRAS el formulario no tenga unidad del pedido elegida, la tabla de
  ingredientes NO DEBE mostrar cifra de «cantidad requerida» ni de «restante», y el bloque de costo
  DEBE mostrar el guion (ver N2).

### Pedidos sin unidad, insumos sin unidad y pedidos ya guardados (D5, D6)

- **R20** (condicional) SI el pedido no tiene unidad (`unit_id` NULL), ENTONCES el costo, la
  reserva, el consumo y la ejecución DEBEN calcular la necesidad como hoy —cantidad × porcentaje ÷
  100 leída directamente en la unidad del insumo— y ninguna línea DEBE marcarse «aprox.» ni
  «no convertible».
- **R21** (condicional) SI el insumo de una línea no tiene unidad, ENTONCES esa línea DEBE
  comportarse como hoy: sin costo, tratada como falta de material por la reserva y mostrada con la
  cifra sin convertir y sin unidad; NO DEBE clasificarse como no convertible (ver N3).
- **R22** (ubicuo) El sistema NO DEBE recalcular ni migrar el costo ni lo apartado de los pedidos ya
  guardados; un pedido guardado DEBE conservar ambos hasta que lo alcance un recálculo.

### Permisos, contrato y escenarios de extremo a extremo (D9–D11)

- **R23** (condicional) SI el actor no tiene `pedidos.modificar`, ENTONCES la cotización con unidad
  DEBE rechazarse en el service antes de validar la entrada y sin leer ningún catálogo.
- **R24** (por evento) CUANDO se crea un pedido de una cantidad en **g** sobre una receta cuyo insumo
  está en **kg**, el costo guardado y la cantidad apartada DEBEN corresponder a la conversión
  exacta de R2 (verificado E2E).
- **R25** (por evento) CUANDO se crea un pedido de una cantidad en **l** sobre una receta cuyo
  insumo está en **kg**, el costo guardado y la cantidad apartada DEBEN corresponder a la
  aproximación de R3, y la línea y el costo DEBEN llevar las marcas de R15 y R18 (verificado E2E).
- **R26** (ubicuo) Los identificadores nuevos DEBEN estar en inglés, el borrado lógico del pedido NO
  DEBE cambiar y la feature NO DEBE añadir dependencias de terceros.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| D1 Necesidad en la unidad del pedido | R1 |
| D2 Misma familia, exacta | R2, R24 |
| D3 Masa ↔ volumen, aproximación | R3, R25 |
| D4 Otra combinación, no convertible | R4, R6, R12, R14, R17 |
| D5 Sin migración | R22 |
| D6 Recálculos con la fórmula nueva; sin unidad como hoy | R5, R7, R10, R11, R20 |
| D7 Marca «aprox.» y aviso en el costo | R15, R17, R18, R25 |
| D8 Quién usa el cálculo | R5, R8, R9, R10, R11, R13, R16 |
| D9 Permisos | R23 |
| D10 E2E | R24, R25 |
| D11 Identificadores, borrado, dependencias | R26 |

### Decisiones nuevas que este spec propone (las aprueba el humano con el spec)

- **N1 — Qué es «masa» y «volumen».** La familia de volumen es la de base efectiva **mililitro de
  sistema** y la de masa la de **gramo de sistema**. Una unidad propia que derive de ellos entra en
  su familia; una base propia de la empresa (por ejemplo un «gramo» propio sin derivar del de
  sistema) no entra en ninguna y cruza solo con su propia familia. Sin esto R3 no tiene a qué
  agarrarse: el catálogo no guarda «dimensión».
- **N2 — Formulario sin unidad elegida.** Hasta elegir unidad, la tabla no muestra cantidades y el
  costo va con guion (R19), en vez de mostrar la cifra sin convertir que hoy induce al error que
  esta ficha corrige.
- **N3 — Insumo sin unidad.** Se queda como hoy (R21) y no pasa a «no convertible»: si pasara, la
  Pregunta 1 cambiaría también cómo se guardan los pedidos cuyo insumo aún no tiene lotes.
- **N4 — Costo del lote con una línea no convertible.** Cuenta cero (R7), la regla que ya rige para
  un ingrediente sin costo. Solo es alcanzable si la unidad del insumo cambia después de guardar
  (QC-206).
- **N5 — Redondeo de la conversión.** No se añade redondeo propio: la conversión trunca a 12
  decimales cuando la división no termina (QC-76), el costo redondea una vez a 4 al final, la
  reserva aparta redondeando hacia arriba a 4 (QC-141) y la pantalla pinta 2. Cierra la pregunta 2
  de QC-164 sin regla nueva.

## Preguntas abiertas

Ninguna. Las dos se cerraron el 2026-10-05 al aprobar el spec (ver la tabla).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-05 | ¿En qué unidad está la necesidad del insumo? | Cantidad × % en la **unidad del pedido**, convertida después a la unidad guardada del insumo. Heredado de **QC-147** (fórmula) y **QC-164** (conversión). |
| 2026-10-05 | ¿Misma familia (kg ↔ g, l ↔ ml)? | Conversión **exacta** con `convertQuantity` y los factores de **QC-76**. Heredado de **QC-164**. |
| 2026-10-05 | ¿Masa ↔ volumen (pedido en l, insumo en kg)? | **Aproximación sin densidad**: la cantidad en la base de su familia (mililitro) se toma igual en la base de la otra (gramo): 1 ml ≈ 1 g, 1 l ≈ 1 kg. Ratifica **QC-164**. |
| 2026-10-05 | ¿Cualquier otra combinación (kg ↔ unidad, docena…)? | **No convertible.** El pedido queda **sin costo** (`null`, como hoy cuando falta existencia) y la tabla de ingredientes **avisa** que la unidad no es convertible. |
| 2026-10-05 | ¿Pedidos ya creados? | **Sin migración**: conservan el costo y la reserva guardados. |
| 2026-10-05 | ¿Recálculos posteriores de esos pedidos? | Todo recálculo que ya ocurre hoy (editar, desbloquear, repartir, costo del lote al empacar, cotización) usa la **fórmula nueva**. Los pedidos **sin unidad** (`unit_id` NULL) se calculan como hoy (**QC-164**). |
| 2026-10-05 | ¿Se avisa de la aproximación? | **Sí.** La línea aproximada lleva la marca «aprox.» en la tabla de ingredientes y en la ejecución; el costo del pedido indica que incluye una aproximación. |
| 2026-10-05 | ¿Quién usa el cálculo nuevo? | El **costo** (`order-cost.ts` y sus llamantes, más la cotización `quote-order-cost.ts`, que pasa a recibir `unitId`), la **reserva** (`order-requirement.ts`, **QC-141**), la **ejecución** del operario (`get-assigned-order-execution.ts`) y la **tabla de ingredientes** de Pedidos. |
| 2026-10-05 | ¿Permisos? | **Sin cambios**: `pedidos.modificar`, validado en el service. Heredado de **QC-86**. |
| 2026-10-05 | ¿E2E? | **Sí**, toca importes (`CHECKPOINTS.md`): pedido en g sobre insumo en kg (exacto) y pedido en l sobre insumo en kg (aproximado), comprobando costo y cantidad apartada. |
| 2026-10-05 | Identificadores, borrado y dependencias | **Heredado**: identificadores en inglés y borrado lógico (**QC-4**). Sin dependencias nuevas. |
| 2026-10-05 | Pregunta 1: ¿reserva y guardado con una línea no convertible? | **Opción B**: el guardado se rechaza con `order_unit_not_convertible`, que nombra los insumos; no se escribe nada (R12). Humano, al aprobar el spec. |
| 2026-10-05 | Pregunta 2: ¿cómo se ve «aprox.» y el aviso en el costo? | **Opción a**: texto «aprox.» junto a la cifra y una línea bajo el importe (`design.md > 8`). Humano, al aprobar el spec. |
| 2026-10-05 | N1–N5 de `design.md` | **Aprobadas** con el spec. |
| 2026-10-05 | ¿Un ingrediente que es envase (unidad «envase») en un pedido en kg o l? | **No convertible, sin excepción** (R4, R12): el guardado se rechaza. Solo se ajusta el dato de prueba de los casos R43 de QC-195 (`finish-with-finished-goods.int.test.ts`) a una combinación convertible. Humano, en F2.1 (T9). |
| 2026-10-05 | ¿Qué muestra el costo al editar un pedido antiguo sin unidad? | **El importe guardado** (R20, R22), no el guion de R19, aunque la tabla de ingredientes muestre guiones. Al elegir una unidad se recalcula con la fórmula nueva. Humano, tras la review (m3). |
