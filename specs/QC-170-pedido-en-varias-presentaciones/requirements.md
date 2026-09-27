# QC-170 — pedido-en-varias-presentaciones · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** QC-168 · **Rama** feature/QC-170-pedido-en-varias-presentaciones
>
> **Alcance.** El pedido tiene un **reparto**: líneas de «N envases × presentación» (p. ej. 5 × Botella 200 ml,
> 60 × Botella 1 L). A medida que se añaden, el sistema muestra **cuánto queda disponible** en la unidad del
> pedido (100 L − 5 × 0,2 L = **99 L**), usando el contenido de cada presentación (QC-150) y la conversión de
> unidades (QC-76). Al **terminar el empaque** entra **un lote de producto terminado por línea**. Desaparece
> la presentación única del pedido (QC-146).
>
> **Lo que NO entra.** El flujo y los estados de empaque (**QC-168**, que bloquea esta). El registro del
> empaque en el log (**QC-82**). Ventas o salidas del producto terminado.
>
> Sembrado por `/afinar-feature` el 2026-09-25. El bloque de Alcance y la tabla de «Decisiones cerradas» los
> fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí
> es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Verificado contra `origin/dev` `0736e1ff` (incluye QC-150, QC-146, QC-121, QC-168 mergeadas). Los
> hechos citados aquí (columnas, enums, matriz de transiciones) están leídos en ese commit; nada se
> supone. Cada `R<n>` cita entre corchetes la fila de la tabla de decisiones que cubre, `[D1]`–`[D9]`
> por su orden en ella, y `[Q1]`–`[Q4]` para las cuatro preguntas que el humano cerró en F1.4
> (2026-09-26, tabla «Decisiones cerradas en F1.4» al final). Ningún requisito queda provisional.

### Modelo del reparto (sustituye a la presentación única de QC-146)

- **R1**: El sistema DEBE permitir que un pedido tenga cero o más líneas de reparto, cada una
  compuesta por una presentación (del catálogo de `inventario`) y un número entero de envases mayor
  que cero. [D1] [D7]
- **R2**: El sistema DEBE prohibir que un mismo pedido tenga dos líneas de reparto con la misma
  presentación. [D1]
- **R3**: CUANDO se añade una línea de reparto, el sistema DEBE copiar el contenido vigente de la
  presentación elegida (si lo tiene) sobre la línea, con el mismo criterio de copia que QC-150 D16
  para la presentación única. [D7]
- **R4**: El sistema DEBE eliminar la columna `orders.presentation_id` y la columna
  `orders.presentation_content`: un pedido ya no tiene una presentación propia, solo su reparto.
  [D7]
- **R5**: Los identificadores nuevos de base de datos DEBEN estar en inglés y toda cifra nueva DEBE
  usar decimal exacto (cadena, `Decimal`), nunca `number` de JavaScript. [D8]

### Cuánto queda disponible

- **R6**: MIENTRAS se edita el reparto de un pedido (alta, edición del pedido o pantalla del
  Empacador), el sistema DEBE mostrar cuánto de la cantidad del pedido no está aún cubierto por el
  reparto, expresado en la unidad del pedido (`orders.unit_id`, R40), convirtiendo la cantidad de
  cada línea (envases × contenido, en la unidad de su presentación) a esa unidad con la conversión
  de QC-76 cuando la unidad de la presentación no sea ya esa unidad. [Alcance] [Q4]
- **R7**: SI la unidad de la presentación de una línea y la unidad del pedido no comparten unidad
  base, ENTONCES el sistema DEBE rechazar esa línea con `incompatible_units` (ya en el catálogo,
  QC-76), tanto en el formulario como en el servidor, en vez de mostrar una cifra incorrecta.
  [Alcance] [Q4]
- **R8**: SI la cantidad ya repartida (convertida, R6) es igual o menor que la cantidad total del
  pedido, ENTONCES el sistema DEBE aceptar guardar el reparto, y la diferencia no entra al
  inventario al terminar el empaque (es merma, igual que el envase que no llena QC-150). El caso
  mayor lo cierra R36. [D4] [Q3]

### Cuándo es obligatorio el reparto

- **R9**: El sistema DEBE aceptar un pedido sin ninguna línea de reparto al crearlo o mientras está
  `PENDIENTE`, `EN_CURSO` o `BLOQUEADO`. [D1]
- **R10**: CUANDO alguien intenta comenzar el empaque (`POR_EMPACAR → EN_EMPAQUE`) de un pedido sin
  ninguna línea de reparto, el sistema DEBE rechazarlo y el pedido DEBE seguir en `POR_EMPACAR`. [D1]

### Quién define el reparto y cuándo se puede cambiar

- **R11**: El sistema DEBE permitir definir o cambiar el reparto de un pedido a quien tenga
  `pedidos.modificar`, desde la edición del pedido, mientras el pedido esté en un estado editable
  por edición general (`PENDIENTE`, `EN_CURSO`). [D2] [D3]
- **R12**: El sistema DEBE permitir definir o cambiar el reparto de un pedido al Empacador que lo
  tiene en curso, desde su pantalla, mientras el pedido esté `POR_EMPACAR` o `EN_EMPAQUE`. [D2] [D3]
- **R13**: SI el pedido está `ENTREGADO` o `CANCELADO`, ENTONCES el sistema DEBE rechazar cualquier
  cambio de su reparto. [D3]
- **R14**: CUANDO el pedido pasa a `ENTREGADO` (Terminar empaque), el sistema DEBE fijar el reparto
  tal como quedó: ningún cambio posterior a ese instante es posible (ya lo cierra R13). [D3]

### Producto terminado: un lote por línea, al terminar el empaque

- **R15**: El sistema DEBE seguir consumiendo el material de la receta al terminar la producción
  (`EN_CURSO → POR_EMPACAR`, «Finalizar»), sin relación con el reparto ni con la existencia de
  ninguna línea. [D5]
- **R16**: El sistema NO DEBE dar de alta ningún lote de producto terminado al terminar la
  producción (`EN_CURSO → POR_EMPACAR`): esa entrada se retira de ese instante. **Enmienda a QC-168 y
  QC-150** (ver `design.md > 8`). [D5]
- **R17**: CUANDO el Empacador termina el empaque (`EN_EMPAQUE → ENTREGADO`), el sistema DEBE dar de
  alta, por cada línea del reparto, un lote de producto terminado de la combinación receta +
  presentación de esa línea, con cantidad `envases × contenido de la línea`. [D5]
- **R18**: El sistema DEBE calcular un único coste de los ingredientes del pedido (el guardado, o
  recalculado si no hay ninguno, con el mismo criterio de QC-150 D21) y DEBE derivar de él un único
  coste unitario, dividiendo entre la cantidad total producida (la suma de `envases × contenido` de
  todas las líneas): todos los lotes que nacen de un mismo pedido llevan el mismo coste por unidad.
  [D6]
- **R19**: SI alguna línea del reparto no tiene contenido copiado ni la presentación tiene hoy un
  contenido vigente, ENTONCES el sistema DEBE rechazar Terminar el empaque entero (ningún lote nace)
  con un error que identifique la línea. [D5] [Q2] (Con R34 ninguna línea nueva nace sin
  contenido y la migración solo crea líneas con contenido (R22); R19 queda como defensa en
  profundidad y se prueba con una fila escrita directamente en la base.)
- **R20**: El terminar el empaque DEBE seguir siendo la única operación que da de alta producto
  terminado: la edición de un pedido, en ningún estado, da de alta ningún lote. [D5]
- **R21**: Dos «Terminar» simultáneos sobre el mismo pedido NO DEBEN producir dos veces los lotes de
  sus líneas: la operación es idempotente por el mismo mecanismo que hoy usa `finishPackingAliveById`
  (`UPDATE` condicional bajo bloqueo de fila) más una restricción de unicidad por línea. [D5]

### Migración de los pedidos existentes (retiro de la presentación única)

- **R22**: La migración que retira `orders.presentation_id` y `orders.presentation_content` DEBE, en
  el mismo cambio, crear una línea de reparto por cada pedido vivo que tuviera presentación con
  contenido, con `envases = ⌊quantity / content⌋` (división entera, sin redondeo) de esa
  presentación. [D7]
- **R23**: SI el pedido no tenía presentación, o su presentación no tenía contenido en el momento de
  migrar, ENTONCES ese pedido DEBE quedar sin ninguna línea de reparto (no se inventa una). [D7]
- **R24**: SI `⌊quantity / content⌋` da cero (el pedido no llenaba ni un envase), ENTONCES ese pedido
  DEBE quedar también sin ninguna línea de reparto. [D7]
- **R25**: La migración DEBE ser reproducible: aplicarla dos veces sobre la misma base no debe
  duplicar líneas (o debe ser un no-op la segunda vez).

### Presentación de la información existente

- **R26**: DONDE una pantalla mostraba hoy la presentación única del pedido (alta y edición de
  `/pedidos`, listado de `/pedidos`, «Por empacar» y «Terminados» de `/asignacion`, ejecución del
  Operador), el sistema DEBE mostrar en su lugar la primera línea del reparto con el formato
  «<envases> × <nombre de la presentación>» seguida de «+N» cuando el reparto tiene N líneas más
  (p. ej. «5 × Botella 200 ml +1»); el formulario de alta/edición y la pantalla del Empacador
  muestran además todas las líneas. [Q1]
- **R27**: CUANDO el pedido no tiene ninguna línea de reparto, el sistema DEBE mostrar «Sin
  presentación» en el lugar de R26, sin tratarlo como un error de carga. [Q1]

### Errores

- **R28**: El sistema DEBE señalar con un código propio del catálogo cerrado de errores el intento de
  comenzar el empaque sin reparto (R10), el intento de repetir una presentación en el mismo reparto
  (R2), el intento de terminar el empaque con una línea sin contenido (R19) y el intento de editar el
  reparto de un pedido en un estado no editable (R13), el reparto que pasa del total (R36) y el
  reparto de un pedido sin unidad (R42). Los códigos exactos están en `design.md > 7`. Ninguno de
  los mensajes nuevos cita el identificador de esta ficha ni el de ninguna otra. [D8] [Q3] [Q4]
- **R29**: El sistema DEBE seguir usando `presentation_not_found` (ya en el catálogo, QC-146) cuando
  una línea de reparto nombra una presentación que no existe o no es de la empresa del actor.

### Trazabilidad con módulos que este cambio no toca

- **R30**: El sistema NO DEBE alterar el ciclo de reserva de material de QC-141 (apartar al crear o
  editar, liberar al cancelar o reducir, consumir al terminar la producción): el reparto no participa
  en la reserva.
- **R31**: El sistema NO DEBE alterar el flujo ni los estados de empaque de QC-168
  (`POR_EMPACAR`/`EN_EMPAQUE`, quién empaca, los dos métodos de un `UPDATE` condicional) salvo lo que
  R10, R17, R21 y R44 exigen explícitamente.
- **R32**: El sistema NO DEBE registrar el reparto en el log de ejecución de QC-82: esa ficha decide
  por su cuenta si lo incorpora.

### Verificación de extremo a extremo

- **R33**: El sistema DEBE tener al menos un recorrido E2E que dé de alta un pedido con reparto de
  más de una presentación, lo lleve a través de producción y empaque, y compruebe que Terminar da de
  alta tantos lotes como líneas, cada uno con la cantidad y el coste unitario esperados, y que la
  existencia del inventario sube en consecuencia. [D9]

### Línea sin contenido (F1.4, Q2)

- **R34**: SI la presentación elegida para una línea no tiene contenido vigente, ENTONCES el sistema
  DEBE impedir añadir esa línea: el selector la muestra marcada con un aviso de que le falta el
  contenido y no deja confirmarla. [Q2]
- **R35**: SI llega al servidor un reparto con una línea cuya presentación no tiene contenido
  vigente, ENTONCES el sistema DEBE rechazar el reparto entero con `presentation_without_content`
  sin escribir ninguna línea, venga de la edición del pedido, del alta o de la pantalla del
  Empacador. [Q2]

### El reparto no puede pasar del total (F1.4, Q3)

- **R36**: SI la suma de las líneas de un reparto, convertida a la unidad del pedido (R6), es mayor
  que la cantidad del pedido, ENTONCES el sistema DEBE rechazar guardar ese reparto con
  `order_distribution_exceeds_quantity` sin escribir ninguna línea, tanto desde el alta y la edición
  del pedido como desde la pantalla del Empacador. [Q3]
- **R37**: CUANDO el servidor valida R36, el sistema DEBE hacerlo dentro de la misma transacción que
  reescribe el reparto, releyendo la cantidad, la unidad y el estado del pedido con la fila del
  pedido bloqueada, de modo que dos guardados simultáneos del reparto (o un guardado del reparto y
  una edición de la cantidad del pedido) nunca dejen un reparto que pase del total. [Q3]
- **R38**: SI una edición del pedido baja su cantidad o cambia su unidad de modo que el reparto
  vigente pasaría del total (R36) o dejaría de ser convertible (R7), ENTONCES el sistema DEBE
  rechazar esa edición con el mismo código (`order_distribution_exceeds_quantity` o
  `incompatible_units`) y el pedido DEBE quedar como estaba. [Q3] [Q4]
- **R39**: MIENTRAS se edita el reparto, el sistema DEBE mostrar el disponible (R6) y, SI la suma
  pasa del total, DEBE avisar antes de guardar (cifra de disponible en negativo y aviso visible) y
  no ofrecer el guardado como acción válida; el aviso no sustituye al rechazo de servidor de R36.
  [Q3]

### Unidad del pedido (F1.4, Q4 — deroga QC-35bis en lo que toca a la unidad)

- **R40**: El sistema DEBE guardar en cada pedido una unidad propia, del catálogo de unidades
  (QC-76) visible para la empresa del pedido, en la que se expresan su cantidad y el disponible de
  R6. **Deroga explícitamente la enmienda del 2026-09-07 de QC-35 (QC-35bis)** en lo relativo a la
  unidad; el precio unitario sigue fuera. [Q4]
- **R41**: CUANDO se crea un pedido, el sistema DEBE exigir su unidad y rechazar el alta sin ella
  (`invalid_input`) o con una unidad que no existe o no es visible para la empresa
  (`unit_not_found`); CUANDO se edita, la unidad DEBE poder cambiarse (sujeta a R38) y DEBE
  exigirse si el pedido no la tenía. [Q4]
- **R42**: SI un pedido no tiene unidad (solo posible en pedidos anteriores a esta ficha, R43),
  ENTONCES el sistema DEBE rechazar definir o cambiar su reparto con `order_without_unit` hasta que
  alguien le asigne una unidad desde la edición del pedido, y DEBE mostrar su cantidad sin unidad.
  [Q4]
- **R43**: La migración DEBE asignar a cada pedido existente la unidad de la presentación que tenía
  antes del retiro de R4; un pedido sin presentación DEBE quedar sin unidad. [Q4]
- **R44**: CUANDO alguien finaliza la producción (`EN_CURSO → POR_EMPACAR`) de un pedido sin unidad,
  el sistema DEBE rechazarlo con `order_without_unit` y el pedido DEBE seguir `EN_CURSO`, de modo
  que ningún pedido llegue a empaque sin unidad (y por tanto sin poder repartirse, R10 + R42).
  **Decisión de `spec_author`, no del humano** (ver pregunta abierta 5). [Q4]
- **R45**: La migración DEBE fallar (sin aplicar nada) SI encuentra algún pedido en `POR_EMPACAR` o
  `EN_EMPAQUE` que quedaría sin unidad, en vez de dejarlo varado. [Q4]

## Preguntas abiertas

1. ~~Cómo se muestra el reparto en los listados.~~ **CERRADA 2026-09-26 [Q1]** → R26, R27.
2. ~~Una línea cuya presentación no tiene contenido.~~ **CERRADA 2026-09-26 [Q2]** → R34, R35.
3. ~~¿Se puede pasar del total?~~ **CERRADA 2026-09-26 [Q3]** → R8, R36-R39.
4. ~~Unidad de `orders.quantity`.~~ **CERRADA 2026-09-26 [Q4]** → R6, R7, R40-R45.
5. **Nueva (F1.4, `spec_author`).** Para que un pedido sin unidad (R43) no quede varado en
   `POR_EMPACAR` —sin reparto no se puede Comenzar (R10), sin unidad no se puede repartir (R42), y en
   `POR_EMPACAR` la edición general está cerrada (QC-168 R32)— R44 bloquea Finalizar sin unidad. Eso
   añade una condición a una transición de QC-168/QC-141 que R31 no lista. Alternativa: dejar que el
   Empacador asigne la unidad desde su pantalla cuando falta. `design.md > 0.5` razona la elección;
   se aplica R44 salvo que el humano diga otra cosa.

## Decisiones cerradas en F1.4 (humano, 2026-09-26)

| Id | Pregunta | Decisión |
|---|---|---|
| Q1 | Cómo se muestra el reparto en los listados | **CERRADA 2026-09-26 por el humano.** Primera línea + «+N» (p. ej. «5 × Botella 200 ml +1»); sin reparto, «Sin presentación». |
| Q2 | Línea cuya presentación no tiene contenido | **CERRADA 2026-09-26 por el humano.** Se prohíbe añadirla: aviso en el selector y rechazo también en servidor. |
| Q3 | ¿Se puede pasar del total? | **CERRADA 2026-09-26 por el humano.** **No**: un reparto cuya suma convertida a la unidad del pedido supera `quantity` se rechaza al guardar, en servidor (edición del pedido y pantalla del Empacador), dentro de la transacción que reescribe el reparto con la fila del pedido bloqueada. Igual o menor sí (D4). La UI muestra el disponible y avisa antes de guardar. Motivo: al terminar el empaque entraría producto que no se produjo. |
| Q4 | Unidad de `orders.quantity` | **CERRADA 2026-09-26 por el humano.** `orders.unit_id` nuevo (FK a `units`), obligatorio en el alta, editable; cada línea convierte envases × contenido a esa unidad con `convertQuantity`; sin base común la línea se rechaza. Deroga QC-35bis en la unidad. Pedidos existentes toman la unidad de su presentación; sin presentación quedan con `NULL`. |

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-25 | ¿Cuándo se reparte? | **Opcional al crear el pedido, obligatorio para comenzar el empaque**: sin reparto no se puede pulsar Comenzar. |
| 2026-09-25 | ¿Quién lo define? | Quien edita pedidos (`pedidos.modificar`) en la edición del pedido, y el **Empacador** en su pantalla. |
| 2026-09-25 | ¿Se puede cambiar en empaque? | **Sí, hasta pulsar Terminar**; ahí queda fijo. |
| 2026-09-25 | ¿Tiene que cubrir todo? | **No**: lo que no llena un envase es **merma** y no entra al inventario (igual que los envases enteros de QC-150). |
| 2026-09-25 | ¿Cuándo entra el producto terminado? | **Al terminar el empaque**: un lote por línea del reparto (producto receta + presentación, QC-150 D2). **Enmienda QC-168 y QC-150**: el material se sigue consumiendo al terminar la producción, pero el producto terminado ya no entra en ese momento. |
| 2026-09-25 | ¿Coste de cada lote? | El coste del pedido se reparte **por la cantidad de cada lote**: mismo coste por unidad en todos. |
| 2026-09-25 | ¿Y la presentación única del pedido (QC-146)? | **Desaparece.** Los pedidos existentes **convierten su presentación en su reparto** (⌊cantidad / contenido⌋ × esa presentación); sin contenido, quedan sin reparto. |
| 2026-09-25 | Identificadores y cifras | En inglés; decimal exacto (QC-4, QC-141). |
| 2026-09-25 | ¿E2E? | **Sí**: mueve inventario (`CHECKPOINTS.md`). |
