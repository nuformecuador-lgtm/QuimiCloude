# QC-172 — versiones-de-receta · requirements.md

> **Zona:** `fullstack` · **Complejidad:** `high` · **depends_on:** — · **Rama:** `feature/QC-172-versiones-de-receta`
>
> **Alcance.** Una receta original puede tener versiones: copias con vínculo a la original y sus propias
> líneas y porcentajes, que suman 100 %. Entran el modelo y las operaciones de servidor de las versiones
> (crear, editar, borrar, listar las de una receta, propagar), y en el formulario de pedido un segundo
> selector de versión («Original» + sus versiones), deshabilitado si la receta no tiene versiones.
>
> **Lo que NO entra.** La pantalla para crear y editar versiones desde la receta (**QC-174**). Las fases de
> los pasos (**QC-173**). Que un pedido conserve la fórmula con la que se creó si luego se edita la receta
> (sin ficha: pasa igual hoy).
>
> Sembrado por `/afinar-feature` el 2026-10-01. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). Cada requisito cita entre corchetes la fila de «Decisiones
> cerradas» que lo funda, numeradas en el orden de la tabla: **[D1]** modelo (copia con vínculo) ·
> **[D2]** 100 % · **[D3]** propagación asistida y «por revisar» · **[D4]** pasos de la original ·
> **[D5]** fuera de la lista de recetas · **[D6]** nombre · **[D7]** un solo nivel · **[D8]** borrar
> la original · **[D9]** producto terminado por versión · **[D10]** cambiar la versión al editar el
> pedido · **[D11]** importación de fórmula · **[D12]** permisos · **[D13]** E2E · **[D14]** librería.
>
> ⚑ = requisito escrito con la **opción recomendada** de una pregunta abierta de este archivo; se
> confirma o se corrige en F1.4.
>
> Vocabulario. **Original**: receta que no es versión de ninguna (todas las que existen hoy).
> **Versión**: receta vinculada a una original. **Viva**: no dada de baja. **Por revisar**: ver R21.
> **Versión ofrecible**: viva y no por revisar. «De otra empresa» se trata siempre igual que «no
> existe» (`docs/architecture.md > Dominio`, punto 1).

### A. Crear y editar versiones

**R1.** CUANDO un actor crea una versión de una receta original viva de su empresa, indicando un nombre
y unas líneas, el sistema DEBE guardarla como una receta nueva vinculada a esa original, con sus
propias líneas y porcentajes, y NO DEBE modificar la original ni sus otras versiones. [D1]

**R2.** CUANDO un actor crea una versión sin indicar líneas, el sistema DEBE darle una copia de las
líneas y porcentajes que la original tiene en ese momento. [D1]

**R3.** SI las líneas de una versión que se crea (indicadas o copiadas) o se edita no cumplen la
validación de líneas de las recetas —cada porcentaje con como mucho dos decimales, mayor que 0 y no
mayor que 100; ningún producto repetido; al menos una línea; suma exactamente 100,00 %; producto
existente en la empresa y que no sea producto terminado—, ENTONCES el sistema DEBE rechazar la
operación sin crear ni modificar ninguna fila. [D2]

**R4.** SI la receta indicada como original de una versión nueva es a su vez una versión, ENTONCES el
sistema DEBE rechazar la operación sin crear ninguna fila. [D7]

**R5.** SI la receta indicada como original de una versión nueva no existe, está dada de baja o es de
otra empresa, ENTONCES el sistema DEBE rechazarla con el error de receta no encontrada —el mismo en
los tres casos— y sin crear ninguna fila. [D1]

**R6.** CUANDO un actor edita una versión viva de su empresa, el sistema DEBE reemplazar su nombre y sus
líneas, y NO DEBE modificar su original ni las demás versiones. [D1]

**R7.** SI se pide editar una versión con la operación de edición de recetas originales, o una original
con la operación de edición de versiones, ENTONCES el sistema DEBE rechazarlo sin modificar ninguna
fila. [D1] [D4]

**R8.** El sistema NO DEBE guardar pasos propios en una versión. CUANDO se lean los pasos de una versión
—en su detalle o en la ejecución en planta de un pedido—, el sistema DEBE devolver los pasos actuales
de su original, también si la versión y la original están dadas de baja. [D4]

### B. Dónde aparecen y cómo se llaman

**R9.** La lista de recetas —su pantalla y el selector de receta del formulario de pedido— NO DEBE
incluir versiones, tampoco al buscar, filtrar u ordenar, y su total NO DEBE contarlas. [D5]

**R10.** CUANDO un actor pide las versiones de una receta original viva de su empresa, el sistema DEBE
devolver sus versiones vivas ordenadas por nombre, cada una con su nombre propio, su nombre mostrado
(R11) y si está por revisar. SI la receta pedida no existe, está dada de baja, es de otra empresa o es
una versión, ENTONCES DEBE responder receta no encontrada. [D5] [D3]

**R11.** El nombre mostrado de una versión DEBE ser «‹nombre de la original› · ‹nombre de la versión›»
(por ejemplo «Crema base · Sin perfume»), y DEBE ser el que se muestre como receta de un pedido que use
esa versión: ficha y lista de pedidos, pantallas de asignación y ejecución en planta. El nombre
mostrado de una original DEBE seguir siendo su nombre. [D6]

**R12.** SI al crear o editar una versión su nombre, normalizado como el de las recetas, coincide con el
de otra versión viva de la misma original, ENTONCES el sistema DEBE rechazar la operación con el error
de nombre duplicado sin crear ni modificar ninguna fila. [D6]

**R13.** CUANDO el nombre normalizado de una versión coincide con el de una receta original viva o con
el de una versión viva de otra original, el sistema DEBE aceptarlo; y CUANDO se crea o renombra una
original con el nombre de una versión, también. La unicidad entre originales vivas de una empresa
DEBE seguir como hoy. [D6]

### C. Propagación desde la original

**R14.** CUANDO un actor guarda una receta original indicando una o más de sus versiones a las que
propagar el cambio, el sistema DEBE, en la misma operación que guarda la original, aplicar a cada
versión indicada el cambio de líneas según R15, y NO DEBE tocar las versiones no indicadas. [D3]

**R15.** ⚑ (P1) Para cada ingrediente, una versión «no lo cambió» si y solo si su porcentaje en la versión
es igual al que tenía la original justo antes de este guardado, contando «ausente en las dos» como
igual. Al propagar, cada ingrediente no cambiado DEBE quedar en la versión con el porcentaje que la
original tiene tras el guardado —incluido desaparecer si la original lo quitó, o aparecer si lo
añadió—, y todo ingrediente que la versión sí cambió DEBE conservar su valor en la versión. [D3]

**R16.** CUANDO un actor guarda una receta original sin indicar versiones, el sistema NO DEBE modificar
ninguna de sus versiones. [D3]

**R17.** SI alguna de las versiones indicadas para propagar no es una versión viva de esa original,
ENTONCES el sistema DEBE rechazar la operación entera sin modificar ni la original ni ninguna versión.
[D3]

**R18.** SI cualquier escritura de un guardado con propagación falla, ENTONCES el sistema NO DEBE dejar
modificada ni la original ni ninguna de las versiones. [D3]

**R19.** CUANDO termina un guardado con propagación, el sistema DEBE devolver, por cada versión
propagada, si ha quedado por revisar. [D3]

**R20.** CUANDO la propagación deja una versión con una suma distinta de 100,00 % o sin líneas, el
sistema DEBE guardarla igualmente, por revisar, y NO DEBE rechazar el guardado de la original por
ello. [D3] [D2]

### D. «Por revisar»

**R21.** Una versión DEBE estar por revisar mientras la suma de sus líneas no sea exactamente 100,00 %,
incluido no tener líneas. Una receta original NUNCA DEBE estar por revisar, sumen lo que sumen sus
líneas. [D3] [D2]

**R22.** CUANDO un actor edita una versión por revisar con líneas válidas (R3), el sistema DEBE dejarla
de considerar por revisar. [D3]

### E. Borrar

**R23.** CUANDO un actor borra una receta original, el sistema DEBE dar de baja lógica, en la misma
operación, la original y todas sus versiones vivas, con fecha y autor de la baja, sin borrar
físicamente ninguna fila. [D8]

**R24.** CUANDO un actor borra una versión, el sistema DEBE darla de baja lógica solo a ella, y su nombre
DEBE quedar libre para otra versión de la misma original. [D8] [D6]

**R25.** MIENTRAS un pedido tenga como receta una versión dada de baja, el sistema DEBE seguir
mostrándolo, editándolo según R33 y ejecutándolo igual que hoy un pedido con una receta dada de
baja. [D8] [D10]

### F. El pedido: formulario

**R26.** CUANDO se elige una receta en el formulario de pedido, el sistema DEBE mostrar un segundo
selector «Versión» con la opción «Original» seleccionada, seguida de las versiones ofrecibles de esa
receta. Una versión por revisar NO DEBE ofrecerse. [D1] [D3]

**R27.** MIENTRAS no haya receta elegida, o la receta elegida no tenga ninguna versión ofrecible, el
selector «Versión» DEBE estar deshabilitado y mostrar «Original» —salvo el caso de R29—. [D1] [D3]

**R28.** CUANDO se elige una versión en el formulario, los ingredientes y el coste estimado que muestra
DEBEN ser los de esa versión; CUANDO se vuelve a «Original», los de la original; y CUANDO se cambia de
receta, el selector DEBE volver a «Original». [D1]

**R29.** CUANDO se abre la edición de un pedido cuya receta es una versión, el formulario DEBE mostrar su
original en el selector de receta y esa versión elegida en el selector «Versión», aunque esté por
revisar o dada de baja; y guardarlo sin tocar ninguno de los dos selectores DEBE conservarla. [D10]

### G. El pedido: servidor

**R30.** CUANDO se crea un pedido con una receta y una versión de esa receta, el sistema DEBE guardar
esa versión como receta del pedido, de modo que la reserva de material, el coste, la ejecución en
planta y el producto terminado usen las líneas de la versión. [D1]

**R31.** CUANDO se crea o edita un pedido sin indicar versión, el sistema DEBE comportarse exactamente
como hoy con la receta indicada. [D1]

**R32.** SI al crear un pedido la receta indicada no es una original viva de la empresa, o la versión
indicada no existe, está dada de baja, es de otra empresa o no es versión de esa receta, ENTONCES el
sistema DEBE rechazarlo con el error de receta no encontrada sin crear ninguna fila. [D1] [D10]

**R33.** SI al crear un pedido la versión indicada está por revisar, ENTONCES el sistema DEBE rechazarlo
con un error propio de versión por revisar, distinto de receta no encontrada, sin crear ninguna fila.
[D3]

**R34.** CUANDO se edita un pedido `PENDIENTE` o `EN_CURSO` cambiando su receta o su versión, el sistema
DEBE exigir la nueva combinación con las mismas reglas de R32 y R33 y recalcular la reserva de
material y el coste con las líneas de la receta resultante. [D10]

**R35.** CUANDO se edita un pedido sin cambiar su receta ni su versión, el sistema DEBE aceptarlo aunque
esa versión esté por revisar o dada de baja, y recalcular la reserva y el coste con sus líneas
actuales, como hoy. [D10]

### H. Producto terminado

**R36.** CUANDO se finaliza un pedido cuya receta es una versión, el sistema DEBE dar la entrada de
producción al producto terminado de esa versión y esa presentación —distinto del de la original y del
de otras versiones, con su propio stock—, creándolo la primera vez con el nombre «‹original› ·
‹versión› · ‹presentación›». [D9] [D6]

### I. Importación de fórmula

**R37.** CUANDO la importación de fórmula compara el nombre de la receta —en la vista previa y al
confirmar—, el sistema DEBE compararlo solo con recetas originales vivas; SI el nombre coincide solo
con el de una versión, ENTONCES confirmar DEBE crear una receta original nueva. [D11]

### J. Permisos y empresa

**R38.** Crear, editar y borrar versiones y guardar una original con propagación DEBEN exigir
`recetas.modificar`; pedir las versiones de una receta y el detalle de una versión DEBEN exigir
`recetas.consultar`. Sin el permiso, el sistema DEBE rechazar antes de leer o escribir nada. [D12]

**R39.** El sistema NO DEBE añadir, quitar ni cambiar ningún permiso del catálogo; crear y editar un
pedido con versión DEBE exigir los mismos permisos que hoy sin versión. [D12]

**R40.** Toda operación sobre versiones DEBE limitarse a la empresa del actor: una receta o versión de
otra empresa DEBE tratarse como inexistente. [D1]

### K. Búsqueda de pedidos

**R41.** ⚑ (P2) CUANDO se buscan pedidos por nombre de receta, el sistema DEBE encontrar los pedidos de
una versión tanto por el nombre de la versión como por el de su original. [D6]

### L. Migración y verificación

**R42.** CUANDO se aplica la migración de esta ficha, el sistema NO DEBE cambiar ningún dato de recetas,
líneas ni pedidos existentes, y toda receta existente DEBE quedar como original. [D1]

**R43.** La migración DEBE revertirse con su `down.sql`; SI hay alguna versión guardada al revertir,
ENTONCES el `down.sql` DEBE abortar entero sin cambiar nada y decir cómo localizarlas. [D1]

**R44.** El sistema DEBE tener una prueba E2E que, en el formulario de pedido, elige una receta y una de
sus versiones, guarda el pedido y comprueba que la reserva de material corresponde a las líneas de la
versión y no a las de la original. [D13]

**R45.** Esta ficha NO DEBE añadir ninguna dependencia a `package.json`. [D14]

## Preguntas abiertas

Ninguna pendiente. **Las tres, RESUELTAS en F1.4 (2026-10-01) por el humano con la opción (a)
recomendada**, que es con la que ya estaban escritos los requisitos marcados ⚑. Se conservan abajo como
registro.

Nuevas de F1.2; ninguna reabre la tabla de decisiones. Cada una lleva la opción recomendada, que es
con la que están escritos los requisitos marcados ⚑.

**P1. Con qué se compara para saber qué ingredientes «no cambió» la versión (R15).**
- **(a) Recomendada.** Con la original **justo antes de este guardado**. No guarda nada nuevo y se
  calcula dentro de la misma transacción. Consecuencia: si una vez se decide NO propagar a una
  versión, a partir de ahí esa versión cuenta como cambiada en los ingredientes que la original movió,
  y ya no se le propagan (rechazar la propagación es divergir).
- (b) Con una **base guardada** por versión (las líneas de la original cuando se creó o se propagó a
  ella por última vez). Recupera esos ingredientes después de un «no», a cambio de una tabla o columna
  más que mantener en cada guardado.

**P2. ¿Buscar pedidos por el nombre de la original encuentra los de sus versiones? (R41).**
- **(a) Recomendada: sí.** El nombre mostrado es «Original · Versión», y buscar «crema base» y no ver
  los pedidos de «Crema base · Sin perfume» parecería un fallo.
- (b) No: solo por el nombre propio de la versión, como hoy busca por `name_normalized`.

**P3. ¿La versión tiene descripción e imagen propias?**
- **(a) Recomendada: no.** La versión no guarda descripción ni imagen, y su detalle muestra las de su
  original igual que los pasos (D4). El formulario de pedido ya pinta la imagen de la receta elegida
  en el primer selector, que es la original.
- (b) Sí, propias y opcionales: entra en la pantalla de QC-174 y aquí solo cambia el modelo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-25 | ¿Cómo se modela una versión? | **Copia con vínculo**: una receta nueva que apunta a la original. El pedido guarda la versión elegida, así que reserva, coste, ejecución en planta y producto terminado la leen como a cualquier receta. Descartadas una tabla de versiones aparte y guardar solo diferencias. |
| 2026-09-25 | ¿Cuánto suma una versión? | **100 %**, con la validación que ya tienen las recetas (heredado de QC-147: `Decimal(5,2)`, mayor que 0, suma exacta 100,00 % y nunca sin líneas). |
| 2026-09-25 | ¿Qué pasa al editar la original? | **Propagación asistida**: el sistema ofrece aplicar el cambio a las versiones, solo en los ingredientes que la versión no cambió. Si una versión deja de sumar 100 %, queda **por revisar** y no se ofrece en un pedido hasta que se ajuste. |
| 2026-09-25 | ¿Y los pasos? | Las versiones **comparten los pasos de la original**; se leen siempre de la original. |
| 2026-09-25 | ¿Salen en la lista de recetas? | **No**: cuelgan de su original. |
| 2026-10-01 | ¿Cómo se llama una versión? | **Nombre libre**, que se muestra como «Original · Versión» (por ejemplo «Crema base · Sin perfume»). Solo es único entre las versiones de la misma original, con la normalización de nombre heredada de QC-24. No choca con otras recetas ni con versiones de otras originales. |
| 2026-10-01 | ¿Versión de una versión? | **No.** Un solo nivel: las versiones solo nacen de una original y la propagación va siempre de la original a sus versiones. |
| 2026-10-01 | ¿Qué pasa al borrar la original? | **Se borran sus versiones con ella**, con borrado lógico (heredado de QC-24/QC-25). Los pedidos ya creados con una versión siguen funcionando, igual que hoy con una receta borrada (QC-34). |
| 2026-10-01 | ¿Producto terminado por versión? | **Sí, propio.** Una versión es una receta más para QC-150: un producto terminado por versión y presentación, con su propio stock. |
| 2026-10-01 | ¿Se cambia la versión al editar un pedido? | **Sí, como la receta** (heredado de QC-34 y QC-141): en PENDIENTE o EN_CURSO se puede cambiar, y se recalcula la reserva. La nueva versión tiene que estar viva y no estar por revisar. Si no se toca, se conserva aunque haya quedado por revisar o borrada. |
| 2026-10-01 | ¿La importación de fórmula (QC-159) compara con versiones? | **No: solo con originales.** Importar un nombre que coincide con una versión crea una receta original nueva. |
| 2026-10-01 | ¿Permisos? | **Sin cambios**: `recetas.consultar` y `recetas.modificar` cubren las versiones. El pedido conserva los suyos. |
| 2026-10-01 | ¿Hace falta E2E? | **Sí, en el pedido**: elegir receta y versión en el formulario y comprobar que la reserva de material usa las líneas de la versión. La reserva es flujo crítico según `CHECKPOINTS.md`. |
| 2026-10-01 | ¿Librería? | **Ninguna nueva.** |
