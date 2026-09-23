# QC-151 — cotizacion-del-coste-en-el-pedido · requirements.md

> **Zona** fullstack · **Complejidad** medium · **depends_on** — · **Rama** feature/QC-151-cotizacion-del-coste-en-el-pedido
>
> **Alcance.** El formulario de pedido (alta y edición) muestra una **cotización del coste de producción**:
> el coste de los ingredientes de la receta elegida para la cantidad tecleada, calculado con
> `resolveIngredientsCost` (QC-123) por una **consulta nueva de solo lectura** que no escribe nada. En
> edición arranca con el importe guardado y se recotiza al cambiar receta o cantidad.
>
> **Lo que NO entra.** El cálculo del coste y cuándo se guarda (**QC-123**: se recalcula al guardar). La
> columna del importe en el listado: descartada por el humano el 2026-09-23. La búsqueda de pedidos
> (**QC-122**).
>
> Sembrado por `/afinar-feature` el 2026-09-23. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> **Vocabulario.** «Cotización»: el coste de ingredientes de una receta para una cantidad, pedido al
> servidor sin guardar nada. «Sin importe»: el caso en que ese coste no se puede calcular (receta sin
> líneas, unidad sin conversión, existencia insuficiente, desbordamiento; heredado de QC-123, y los
> cuatro son indistinguibles). «Cantidad válida»: la que acepta la regla de cantidad del alta del
> pedido (decimal de hasta 10 enteros y 4 decimales, mayor que cero). «Bloque de coste»: la zona del
> formulario donde se pinta el importe. «Guion»: el marcador de ausencia `—` que ya usa la pantalla.

### La consulta de cotización (servidor)

- **R1.** CUANDO se pide una cotización con una receta y una cantidad válida, el sistema DEBE devolver
  exactamente el mismo importe que el alta o la edición del pedido guardarían en ese mismo instante con
  esa receta y esa cantidad (la regla de coste de QC-123, sin ninguna otra), o «sin importe» cuando esa
  regla no da importe.
- **R2.** CUANDO se pide una cotización, el sistema NO DEBE crear, modificar ni borrar ninguna fila:
  ni pedidos, ni el importe guardado de ningún pedido, ni lotes, ni existencias.
- **R3.** SI quien pide la cotización no tiene sesión o no tiene el permiso `pedidos.modificar`,
  ENTONCES el sistema DEBE rechazarla con el error de autorización del módulo de pedidos, antes de
  validar la entrada y sin leer ninguna receta, lote ni unidad.
- **R4.** El sistema NO DEBE añadir ningún permiso nuevo para la cotización: el catálogo de permisos y
  los permisos que exige el módulo de pedidos (`pedidos.consultar` y `pedidos.modificar`) quedan como
  están.
- **R5.** SI la entrada de la cotización no trae una receta con forma de identificador válido o no trae
  una cantidad válida, ENTONCES el sistema DEBE rechazarla con el error de validación del módulo, sin
  leer ninguna receta, lote ni unidad.
- **R6.** SI la receta pedida no existe en la empresa de quien cotiza —incluida una receta que existe
  en otra empresa—, ENTONCES el sistema DEBE responder «sin importe», con la misma respuesta que
  cualquier otro «sin importe», y NO DEBE leer lotes ni unidades de ninguna otra empresa.
- **R7.** El sistema DEBE tomar la empresa de la cotización de la sesión de quien la pide, y NO DEBE
  aceptar una empresa que llegue en la entrada.

### Dónde se ve

- **R8.** El sistema DEBE mostrar el bloque de coste en el formulario de alta y en el de edición del
  pedido, y la tabla del listado de pedidos NO DEBE mostrar ningún importe.

### Qué se ve

- **R9.** MIENTRAS el formulario no tiene receta elegida o su cantidad no es válida, el bloque de
  coste DEBE mostrar el guion y el sistema NO DEBE pedir ninguna cotización.
- **R10.** CUANDO una cotización responde «sin importe», el bloque de coste DEBE mostrar el guion y
  NUNCA un cero.
- **R11.** CUANDO se abre el formulario de edición de un pedido, el bloque de coste DEBE mostrar el
  importe guardado de ese pedido —o el guion si el pedido no tiene importe— sin pedir ninguna
  cotización.
- **R12.** CUANDO, en la edición, cambia la receta o la cantidad, el bloque de coste DEBE dejar de
  mostrar el importe guardado y mostrar el resultado de la cotización nueva (o el guion, según
  R9 y R10).

### Cuándo se recotiza

- **R13.** CUANDO cambia la cantidad del formulario con una receta elegida y la cantidad resultante es
  válida, el sistema DEBE pedir una sola cotización 500 ms después de la última modificación de la
  cantidad, y NO DEBE pedir ninguna por las modificaciones que queden dentro de esa ventana.
- **R14.** CUANDO se elige una receta y la cantidad del formulario es válida, el sistema DEBE pedir la
  cotización sin esperar la ventana de R13.
- **R15.** SI llega la respuesta de una cotización que ya fue superada por otra pedida después, o por
  un paso al guion de R9, ENTONCES el sistema DEBE descartarla sin cambiar lo que muestra el bloque de
  coste.

### Mientras cotiza

- **R16.** MIENTRAS una cotización está en vuelo y el bloque de coste tenía una cifra visible, el
  bloque DEBE seguir mostrando esa cifra atenuada junto al rótulo «cotizando…».
- **R17.** MIENTRAS una cotización está en vuelo y el bloque de coste no tenía ninguna cifra visible
  (la primera vez, o tras un guion), el bloque DEBE mostrar solo el rótulo «cotizando…».

### Formato

- **R18.** El sistema DEBE pintar el importe con el formato `$ 1,234,567.50`: el símbolo `$` fijo
  seguido de un espacio, la coma como separador de miles, el punto como separador decimal y siempre
  dos decimales (`40.0000` -> `$ 40.00`; `12752.5512` -> `$ 12,752.55`; `0.0050` -> `$ 0.01`), y NO
  DEBE usar `Intl.NumberFormat`, `toLocaleString` ni aritmética de coma flotante para obtenerlo.
- **R19.** SI el valor exacto del importe difiere del valor pintado a dos decimales, ENTONCES el
  elemento que lo pinta DEBE exponer ese valor exacto como atributo `title` (`12752.5512` -> `title`
  `12752.5512`); SI coincide, ENTONCES NO DEBE tener atributo `title` (`40.0000` -> sin `title`).

### Lo que se guarda

- **R20.** El sistema NO DEBE enviar la cotización mostrada al guardar el pedido ni usarla para
  habilitar o deshabilitar Guardar: el importe que queda guardado es el que calcula el guardado con los
  lotes de ese momento.
- **R21.** SI la petición de cotización falla —rechazo de autorización, de validación o error
  inesperado—, ENTONCES el bloque de coste DEBE mostrar, bajo el bloque, el mensaje de ese error tal
  como lo da el catálogo de errores (p. ej. «No se pudo cotizar: <mensaje>»), NO DEBE mostrar el guion
  ni ninguna cifra, y el formulario DEBE seguir permitiendo guardar. *(Cerrada el 2026-09-23 en F1.4:
  ver la nota al final.)*

### E2E

- **R22.** El sistema DEBE tener un test E2E, en Chromium y WebKit y sin llamadas a servicios
  externos, que: (a) elige una receta y teclea una cantidad y ve la cotización con el formato de R18;
  (b) cambia la cantidad y ve la cotización nueva; (c) teclea una cantidad sin existencia suficiente y
  ve el guion; (d) guarda, reabre la edición del pedido y ve el importe guardado, igual a lo que
  guardó la base.

### Cobertura de las decisiones cerradas

| Decisión cerrada | Requisitos |
|---|---|
| ¿Dónde se ve el importe? En el formulario de alta y edición, no en el listado | R8 |
| ¿Qué se guarda? Se recalcula al guardar; la cotización es orientativa y no se persiste | R1, R2, R20 |
| ¿Y en edición? Al abrir, el guardado; si cambian receta o cantidad, la cotización nueva | R11, R12 |
| ¿Cuándo se recotiza? 500 ms tras la última tecla y al cambiar la receta; una respuesta vieja no pisa a una nueva | R13, R14, R15 |
| ¿Qué se ve mientras cotiza? Cifra anterior atenuada con «cotizando…»; la primera vez, solo «cotizando…» | R16, R17 |
| ¿Formato? `$ 1,234,567.50`, valor exacto en el `title`, sin `Intl` ni coma flotante | R18, R19 |
| ¿Sin importe? Guion, nunca cero; también sin receta o cantidad válida | R9, R10 |
| ¿Permiso? `pedidos.modificar` validado en el service; sin permiso nuevo | R3, R4 (y R5, R6, R7 como frontera del mismo service) |
| ¿E2E? Sí: elegir receta, teclear cantidad, ver la cotización y el importe guardado al reabrir | R22 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Dónde se ve el importe? | En el **formulario** de alta y de edición del pedido, no en el listado (decisión del humano al aprobar QC-122). |
| 2026-09-23 | ¿Qué se guarda? | **Se recalcula al guardar** con los lotes de ese momento (heredado de **QC-123**). La cotización es orientativa; no se persiste lo mostrado. |
| 2026-09-23 | ¿Y en edición? | Al abrir se ve el importe guardado. Si cambian receta o cantidad, se muestra la cotización nueva. |
| 2026-09-23 | ¿Cuándo se recotiza? | **Al dejar de escribir** la cantidad (unos 500 ms después de la última tecla) y al cambiar la receta. Una respuesta vieja no pisa a una nueva. |
| 2026-09-23 | ¿Qué se ve mientras cotiza? | La cifra anterior **atenuada** con «cotizando…»; la primera vez, solo «cotizando…». |
| 2026-09-23 | ¿Formato? | `$ 1,234,567.50`: `$` fijo, coma de miles, punto decimal, dos decimales; valor exacto en el `title` (patrón de **QC-132**). Sin `Intl.NumberFormat` ni coma flotante. |
| 2026-09-23 | ¿Sin importe? | Un guion, nunca un cero (heredado de **QC-123**); también si aún no hay receta o cantidad válida. |
| 2026-09-23 | ¿Permiso? | `pedidos.modificar`, el del formulario, validado en el service. Sin permiso nuevo; el catálogo no cambia. |
| 2026-09-23 | ¿E2E? | **Sí**: los importes son flujo crítico (`CHECKPOINTS.md`). Elegir receta, teclear cantidad, ver la cotización y ver el importe guardado al reabrir. |

## Nota del 2026-09-23 — F1.4: spec aprobado y pregunta abierta 1 cerrada

El humano aprobó el spec y respondió la única pregunta abierta. Se ajusta R21 sin renumerar.

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Qué muestra el bloque de coste si la cotización falla (sesión caducada, error inesperado)? | Se pinta el **mensaje del error** bajo el bloque (p. ej. «No se pudo cotizar: …», con el mensaje que ya da el catálogo de errores) y Guardar sigue disponible. **Nunca un guion**, para no confundir un fallo con «sin importe». |

Cobertura: R21. Consecuencia sobre R17: un fallo no deja cifra visible, así que la siguiente
cotización en vuelo muestra solo «cotizando…».
