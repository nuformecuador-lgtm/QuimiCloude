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
> por su orden en ella.

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

- **R6**: MIENTRAS se edita el reparto de un pedido (alta o edición), el sistema DEBE mostrar cuánto
  de la cantidad del pedido no está aún cubierto por el reparto, expresado en la unidad de
  referencia del pedido, convirtiendo la cantidad de cada línea (envases × contenido) a esa unidad
  con la conversión de QC-76 cuando la unidad de la presentación no sea ya esa unidad. [Alcance]
- **R7**: SI dos unidades del cálculo de R6 no comparten unidad base, ENTONCES el sistema DEBE
  rechazar que esa línea se añada al reparto en vez de mostrar una cifra incorrecta. [Alcance]
- **R8**: SI la cantidad ya repartida no cubre la cantidad total del pedido, ENTONCES el sistema DEBE
  aceptar guardar el reparto igual, y la diferencia no entra al inventario al terminar el empaque
  (es merma, igual que el envase que no llena QC-150). [D4]

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
  con un error que identifique la línea. [D5] (relacionado con la pregunta abierta 2)
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
  Operador), el sistema DEBE mostrar en su lugar una representación del reparto (relacionado con la
  pregunta abierta 1; el formato exacto queda abierto).
- **R27**: El sistema DEBE seguir marcando «Sin presentación» / equivalente cuando el pedido no tiene
  ninguna línea de reparto, sin tratarlo como un error de carga.

### Errores

- **R28**: El sistema DEBE señalar con un código propio del catálogo cerrado de errores el intento de
  comenzar el empaque sin reparto (R10), el intento de repetir una presentación en el mismo reparto
  (R2), el intento de terminar el empaque con una línea sin contenido (R19) y el intento de editar el
  reparto de un pedido en un estado no editable (R13). Ninguno de los mensajes nuevos cita el
  identificador de esta ficha ni el de ninguna otra. [D8]
- **R29**: El sistema DEBE seguir usando `presentation_not_found` (ya en el catálogo, QC-146) cuando
  una línea de reparto nombra una presentación que no existe o no es de la empresa del actor.

### Trazabilidad con módulos que este cambio no toca

- **R30**: El sistema NO DEBE alterar el ciclo de reserva de material de QC-141 (apartar al crear o
  editar, liberar al cancelar o reducir, consumir al terminar la producción): el reparto no participa
  en la reserva.
- **R31**: El sistema NO DEBE alterar el flujo ni los estados de empaque de QC-168
  (`POR_EMPACAR`/`EN_EMPAQUE`, quién empaca, los dos métodos de un `UPDATE` condicional) salvo lo que
  R10, R17 y R21 exigen explícitamente.
- **R32**: El sistema NO DEBE registrar el reparto en el log de ejecución de QC-82: esa ficha decide
  por su cuenta si lo incorpora.

### Verificación de extremo a extremo

- **R33**: El sistema DEBE tener al menos un recorrido E2E que dé de alta un pedido con reparto de
  más de una presentación, lo lleve a través de producción y empaque, y compruebe que Terminar da de
  alta tantos lotes como líneas, cada uno con la cantidad y el coste unitario esperados, y que la
  existencia del inventario sube en consecuencia. [D9]

## Preguntas abiertas

## Preguntas abiertas

1. **Cómo se muestra el reparto en los listados** que hoy muestran la presentación del pedido (pedidos,
   «Terminados» de QC-145, «Por empacar» de QC-168). Por ejemplo: la primera línea y «+2», o «3 presentaciones».
2. **Una línea cuya presentación no tiene contenido** no puede calcular el disponible: ¿se prohíbe añadirla?
3. **¿Se puede pasar del total?** (p. ej. 60 × 1 L + 250 × 200 ml = 110 L sobre 100 L): ¿se rechaza?
4. **Añadida por `spec_author` (F1.2), no del humano.** `orders.quantity` no tiene columna de unidad
   propia desde QC-35bis («el pedido ya no tiene unidad ni precio unitario», `order-view.ts:13-17`):
   antes de QC-170 esa cantidad se interpretaba en la unidad de la ÚNICA presentación del pedido
   (QC-150 D11). Con varias presentaciones —posiblemente de unidades distintas— ya no hay una
   presentación de la que tomar prestada esa unidad. **¿En qué unidad se expresa y se muestra
   `quantity`, y de dónde sale, cuando el reparto está vacío o tiene presentaciones de más de una
   unidad?** `design.md > 0` propone una opción sin cerrarla.

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
