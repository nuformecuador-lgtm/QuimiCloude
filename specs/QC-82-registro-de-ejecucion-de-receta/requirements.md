# QC-82 — registro-de-ejecucion-de-receta · requirements.md

> **Zona** `fullstack` · **Complejidad** `high` · **depends_on** `QC-63` ·
> **Rama** `feature/QC-82-registro-de-ejecucion-de-receta`
>
> ## Alcance
>
> Queda constancia de cómo se ejecutó cada pedido en planta: cada **arrancar, retomar, avanzar,
> retroceder, cancelar y finalizar** se anota con el instante, el pedido, quién, la posición del
> paso y, solo al cancelar, el motivo. La ficha **lo conecta a la pantalla de ejecución** de QC-63,
> que gana un botón para **cancelar el pedido con motivo**, y que al **reentrar** en un pedido
> `EN_CURSO` lo **devuelve al último paso anotado**.
>
> ## Lo que NO entra
>
> - **Purgar el registro** pasados X días desde que el pedido termina, con un cron automático y
>   X en `.env` → **QC-124** (`purga-del-registro-de-ejecucion`). Esta ficha no borra nada.
> - **Una pantalla para consultar el recorrido** (quién, cuánto tardó, dónde volvió atrás): sin
>   ficha; el registro queda escrito y legible por la base.
> - **Guardar lo que el operario marcó** dentro de cada paso: sigue fuera, como fijó QC-63.
>
> _Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

> **Cómo se citan las decisiones.** `[D<n>]` es la fila **n-ésima** de `## Decisiones cerradas (no
> reabrir)`, contando desde arriba y sin reordenar nada: `D1`–`D3` son las del 2026-09-08 y
> `D4`–`D18` las del 2026-09-18. **Donde chocan, manda la del 2026-09-18**: `D12` enmienda a `D1`
> (se añade **retomar**, y son **seis** acciones y ninguna más).
>
> **Vocabulario.** «La pantalla» es la pantalla de ejecución de QC-63 (`assignedOrderRoute(<id>)`).
> «Responsable asignado» es quien figura como responsable del pedido en su empresa. «Posición» es el
> número que la pantalla enseña como «Paso *n* de *N*», contando desde 1. «La misma operación»
> significa que o quedan escritas las dos cosas o no queda ninguna.
>
> **Lo marcado con ⚑** depende de un punto que **no sale de la acotación** y queda señalado para
> F1.4 en `design.md > 12`. El requisito está escrito con la propuesta; si el humano la cambia, se
> reescribe ese requisito y nada más.

### Qué se anota

**R1.** El sistema DEBE anotar en el registro de ejecución **exactamente seis acciones** —arrancar,
retomar, avanzar, retroceder, cancelar y finalizar— y la base DEBE rechazar cualquier anotación con
una acción distinta de esas seis. `[D1] [D12]`

**R2.** Cada anotación DEBE guardar la acción, el instante, el pedido, la persona que la hizo, su
empresa y la posición del paso; y, solo si la acción es cancelar, el motivo. `[D1] [D9] [D10] [D14]
[D15]`

**R3.** El sistema DEBE guardar del tiempo **un único instante** por anotación —el de la acción— y
**NO DEBE** guardar duración, ni hora de fin, ni ninguna otra marca de tiempo en la anotación. `[D10]`

**R4.** Del paso, el sistema DEBE guardar **solo su posición** y **NO DEBE** guardar su texto, su
contenido ni ningún identificador suyo. SI la receta se edita después, ENTONCES el sistema **NO
DEBE** corregir ni recalcular ninguna posición ya anotada. `[D9]`

**R5.** ⚑ SI la receta del pedido no tiene ningún paso, ENTONCES las anotaciones de ese pedido DEBEN
guardarse **sin posición**; en cualquier otro caso la posición DEBE existir y ser un entero mayor o
igual que 1, y la base DEBE rechazar una posición menor que 1. `[D9]`

**R6.** El pedido DEBE ser **obligatorio**: la base DEBE rechazar una anotación sin pedido o con un
pedido que no existe. `[D14]`

**R7.** La anotación DEBE llevar **su propia columna de empresa**, y la base DEBE rechazar una
anotación cuya empresa no sea a la vez la del pedido y la de la persona que la hizo. `[D15]`

**R8.** La base DEBE garantizar que el motivo existe **si y solo si** la acción es cancelar: DEBE
rechazar una cancelación sin motivo y DEBE rechazar cualquier otra acción que traiga motivo. `[D2]
[D4]`

**R9.** SI se pide cancelar con el motivo ausente, vacío o de solo espacios, ENTONCES el sistema DEBE
rechazarlo **sin escribir nada**: ni anotación ni cambio en el pedido. `[D3]`

**R10.** El sistema DEBE validar el motivo de cancelar con **la misma regla** que el contrato público
de `pedidos` aplica al motivo de cancelación de un pedido, y **NO DEBE** contener una segunda copia
de esa regla. `[D3] [D8]`

**R11.** Retroceder **NO DEBE** pedir motivo, confirmación ni ningún otro dato: DEBE bastar un clic en
Anterior. `[D4]`

### Lo que anota cada gesto de la pantalla

**R12.** CUANDO se abre la pantalla de un pedido asignado en `PENDIENTE`, el sistema DEBE anotar
**arrancar**, con la posición del primer paso, en **la misma operación** que lo deja `EN_CURSO`.
`[D5] [D11]`

**R13.** CUANDO se abre o se recarga la pantalla de un pedido asignado en `EN_CURSO`, el sistema DEBE
anotar **retomar** y DEBE mostrar el paso cuya posición es la de **la última anotación de ese
pedido**, la hiciera quien la hiciera; retomar DEBE anotarse con esa misma posición. `[D5] [D12]`

**R14.** ⚑ SI un pedido `EN_CURSO` no tiene ninguna anotación con posición, ENTONCES la pantalla DEBE
empezar en el primer paso y retomar DEBE anotarse con esa posición. SI la última posición anotada es
mayor que el número de pasos que la receta tiene hoy, ENTONCES la pantalla DEBE mostrar el último
paso, sin error. `[D9] [D12]`

**R15.** ⚑ SI la anotación de retomar no se puede guardar, ENTONCES la pantalla **NO DEBE** abrirse y
DEBE mostrar el error, igual que cuando falla arrancar. `[D11]`

**R16.** CUANDO dos responsables abren a la vez un pedido en `PENDIENTE`, el sistema DEBE dejar
**exactamente una** anotación de arrancar, y la otra apertura DEBE anotarse como retomar. `[D11]
[D12]`

**R17.** CUANDO se activa **Siguiente**, el sistema DEBE mostrar el paso siguiente y anotar
**avanzar** con la posición del paso al que se llega. `[D5] [D9]`

**R18.** CUANDO se activa **Anterior**, el sistema DEBE mostrar el paso anterior y anotar
**retroceder** con la posición del paso al que se llega. `[D4] [D5] [D9]`

**R19.** SI la anotación de avanzar o de retroceder no se puede guardar, ENTONCES el paso DEBE
cambiar igualmente, la pantalla **NO DEBE** bloquearse ni mostrar ningún error, y esa anotación **NO
DEBE** reintentarse: se pierde. `[D11]`

**R20.** SI el pedido ya no está en `EN_CURSO` cuando llega una anotación de avanzar o de retroceder,
ENTONCES el sistema **NO DEBE** escribirla. `[D11] [D13]`

**R21.** CUANDO se activa **Finalizar** en el último paso, el sistema DEBE anotar **finalizar** con la
posición de ese paso, en **la misma operación** que deja el pedido `ENTREGADO`. `[D5] [D11]`

**R22.** La pantalla DEBE ofrecer un **botón para cancelar el pedido** que, antes de hacer nada,
**pida el motivo** en un campo de texto visible. CUANDO se confirma con un motivo válido, el sistema
DEBE dejar el pedido **`CANCELADO`** y anotar **cancelar** con ese motivo y la posición del paso que se
está mostrando, en **la misma operación**. `[D5] [D6] [D11]`

**R23.** CUANDO se cancela desde la pantalla, el motivo de cancelación del pedido DEBE ser
**exactamente el mismo texto** que queda en la anotación, escrito una sola vez por quien cancela.
`[D8]`

**R24.** SI falla cualquiera de las dos escrituras de arrancar, finalizar o cancelar, ENTONCES **NO
DEBE quedar ninguna**: ni la anotación sin el cambio del pedido ni el cambio del pedido sin la
anotación, y la pantalla DEBE mostrar el error. `[D11]`

**R25.** ⚑ CUANDO el pedido queda `CANCELADO` desde la pantalla, el sistema DEBE devolver a quien la
usa a la lista de pedidos asignados mostrando una **confirmación visible** de la cancelación. `[D6]`

### Autorización, módulos y empresa

**R26.** Las escrituras del registro DEBEN hacerse con **casos de uso del módulo `asignaciones`** cuya
**primera línea** sea la exigencia de `asignaciones.consultar`, antes de validar la entrada y antes
de tocar ninguna dependencia. SI el actor está ausente, no trae permisos, los trae vacíos o no trae
ese código, ENTONCES el caso de uso DEBE rechazar con su error de autorización **sin haber llamado a
ninguna dependencia**. `[D7]`

**R27.** **Cualquier responsable asignado** al pedido DEBE poder cancelarlo desde la pantalla, no solo
quien lo arrancó. SI el pedido no está asignado a quien pide, o es de otra empresa, ENTONCES el caso de
uso DEBE rechazar con **la misma respuesta que si no existiera**, sin escribir nada. `[D7] [D15]`

**R28.** La empresa de cada anotación DEBE salir **del actor** y **nunca de la entrada**, y toda
lectura del registro DEBE filtrar por la empresa del actor. `[D15]`

**R29.** El sistema DEBE cancelar el pedido **preguntando al contrato público de `pedidos`**:
`asignaciones` **NO DEBE** escribir el estado ni el motivo del pedido y **NO DEBE** contener ninguna
lista propia de estados cancelables. `pedidos` DEBE decidir si el pedido es cancelable con **la misma
definición** que usa su caso de uso de cancelación, y DEBE existir **un solo camino de escritura**
del estado `CANCELADO` con su motivo. SI `pedidos` declara el pedido no cancelable, ENTONCES el sistema
DEBE responder `not_cancellable` sin escribir nada. `[D6] [D7]`

**R30.** El conjunto de permisos que el seed asigna a cada rol DEBE quedar **sin cambios**: el
Operador DEBE poder cancelar desde la pantalla **sin** `pedidos.modificar` y **sin**
`asignaciones.modificar`. `[D7]`

**R31.** El registro **NO DEBE** ofrecer ninguna operación que modifique o borre una anotación, y
ninguna vía de la aplicación DEBE emitir una modificación ni un borrado sobre él: una anotación
escrita no se corrige. `[D13]`

**R32.** La tabla del registro DEBE tener RLS **activada y forzada**, y solo el módulo propietario
DEBE consultarla. *(`CHECKPOINTS.md > Datos y seguridad`, sin fila propia en la tabla.)*

**R33.** Todo identificador nuevo de base de datos —tabla, columnas, tipo, valores de la acción,
restricciones e índices— DEBE estar **en inglés** y en `snake_case` (los valores del tipo, en
mayúsculas). `[D16]`

**R34.** La migración que crea el registro DEBE tener su `down.sql`, y aplicarlo DEBE dejar la base
exactamente como estaba antes. *(`docs/architecture.md > Migraciones up/down`, sin fila propia en
la tabla.)*

**R35.** La feature **NO DEBE** añadir ninguna dependencia a `package.json`. `[D18]`

### Pantalla, multiplataforma y lo que se enmienda de QC-63

**R36.** Todo control nuevo de la pantalla —el botón de cancelar, el campo del motivo y los botones
del diálogo— DEBE tener un objetivo táctil de al menos **44×44 px**, un tamaño de letra de al menos
**16 px** en el campo de texto, **NO DEBE** depender de `:hover`, y DEBE ser **operable por
teclado**. `[D5] [D6]`

**R37.** ⚑ El asistente de pasos compartido DEBE poder **empezar en una posición dada** y **avisar de
cada cambio de paso** recibiendo ambas cosas **por props**, sin leer datos, sin importar
`lib/composition`, Server Actions ni `next/navigation`, y sin cambiar su comportamiento cuando esas
props no se le pasan. Esto **enmienda QC-63 R18**, que prohibía modificar sus archivos. `[D5] [D12]`

**R38.** La reentrada en un pedido `EN_CURSO` DEBE dejar rastro de **quién entró y cuándo** (la
anotación de retomar). Esto **enmienda QC-63 R10**, que prohibía guardarlo. Los tests de QC-63 que
afirman lo enmendado DEBEN **tensarse con nota fechada** y **ninguna guardia DEBE aflojarse**. `[D5]
[D12]`

### Verificación de extremo a extremo

**R39.** El sistema DEBE tener un E2E en el que el Operador abre un pedido asignado, avanza dos pasos,
**recarga** la pantalla y la pantalla vuelve al **paso 3**. `[D17]`

**R40.** El sistema DEBE tener un E2E en el que el Operador cancela otro pedido asignado **con un
motivo**, y el pedido queda **`CANCELADO` con ese motivo**. `[D17]`

### Cobertura de las decisiones

| Decisión | Requisitos |
|---|---|
| D1 — seis acciones (enmendada por D12) | R1, R2 |
| D2 — el motivo puede quedar vacío | R8 |
| D3 — no se cancela sin motivo | R9, R10 |
| D4 — motivo solo en cancelar, garantizado en la base; retroceder sin preguntas | R8, R11, R18 |
| D5 — la ficha conecta el registro a la pantalla | R12, R13, R17, R18, R21, R22, R36, R37, R38 |
| D6 — cancelar cancela el pedido por el camino único, con botón y motivo | R22, R25, R29, R36 |
| D7 — cualquier responsable, `asignaciones.consultar`, caso de uso nuevo, seed igual | R26, R27, R29, R30 |
| D8 — el mismo texto de motivo en la anotación y en el pedido | R10, R23 |
| D9 — se guarda la posición; riesgo aceptado | R2, R4, R5, R14, R17, R18 |
| D10 — un solo instante, sin duración | R2, R3 |
| D11 — avanzar/retroceder no bloquean; los otros cuatro, en la misma operación | R12, R15, R16, R19, R20, R21, R22, R24 |
| D12 — reentrar anota retomar y vuelve al último paso anotado | R1, R13, R14, R16, R37, R38 |
| D13 — no se borra ni se edita nada | R20, R31 |
| D14 — el pedido es obligatorio | R2, R6 |
| D15 — columna propia de empresa | R2, R7, R27, R28 |
| D16 — identificadores en inglés | R33 |
| D17 — E2E | R39, R40 |
| D18 — ninguna librería nueva | R35 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-08 | ¿Qué acciones hay? | Arrancar, avanzar, retroceder, cancelar y finalizar. **Enmendada el 2026-09-18** por la fila «¿Qué pasa al reentrar?»: se añade **retomar**, y son **seis** y ninguna más |
| 2026-09-08 | ¿El motivo puede quedar vacío? | **Sí**: la mayoría de las acciones no lo llevan |
| 2026-09-08 | ¿Se puede cancelar sin motivo? | **No.** Quien abandona una ejecución tiene que explicar por qué |
| 2026-09-18 | ¿El motivo acompaña a otras acciones? | **Solo a cancelar**: existe **si y solo si** la acción es cancelar, garantizado **en la base**, igual que `orders_cancellation_reason_matches_status` de **QC-34**. Retroceder sigue siendo un clic sin preguntas |
| 2026-09-18 | ¿La ficha conecta el registro a la pantalla o solo lo construye? | **Lo conecta**: QC-63 ya cerró sin él. Abrir anota arrancar (o retomar), Siguiente y Anterior anotan avanzar y retroceder, Finalizar anota finalizar. Por eso la ficha pasa a **`fullstack`** |
| 2026-09-18 | ¿Qué le pasa al pedido al cancelar la ejecución? | **Se cancela el pedido** (`CANCELADO`), por el camino único de cancelación de **QC-34** (`cancelOrder`, que ya admite `EN_CURSO`), no escribiendo la columna. La pantalla gana un **botón de cancelar que pide el motivo** |
| 2026-09-18 | ¿Quién puede cancelar desde la pantalla? | **Cualquier responsable asignado al pedido**, con **`asignaciones.consultar`**, mediante un **caso de uso nuevo de `asignaciones`** que pregunta al contrato de `pedidos`. Mismo camino que **QC-63** abrió para `EN_CURSO` y `ENTREGADO`. **El seed de permisos no cambia**: el Operador sigue sin `pedidos.modificar` |
| 2026-09-18 | ¿El motivo de cancelar va también al pedido? | **Sí, el mismo texto**: se escribe una vez y queda en la anotación y en el motivo de cancelación del pedido |
| 2026-09-18 | ¿Qué se guarda del paso? | **Su posición.** **Riesgo aceptado**: si luego se edita la receta, la posición puede señalar otro paso distinto del que vio el operario |
| 2026-09-18 | ¿Qué es «el tiempo»? | **El instante de la acción**, una sola columna. Cuánto se estuvo en un paso se calcula restando la anotación siguiente; no se guarda duración |
| 2026-09-18 | ¿Si falla anotar, se bloquea al operario? | **Avanzar y retroceder no se bloquean**: el paso cambia y esa anotación se pierde. **Arrancar, retomar, finalizar y cancelar** van en la **misma operación** que el cambio que hacen: o se guardan las dos cosas o ninguna |
| 2026-09-18 | ¿Qué pasa al reentrar en un pedido `EN_CURSO`? | **Se anota «retomar»** y la pantalla **vuelve al último paso anotado** de ese pedido. Consecuencia aceptada: como avanzar y retroceder pueden perderse, puede volver a un paso anterior al real. Lo marcado dentro de los pasos no se recupera (QC-63 no lo guarda) |
| 2026-09-18 | ¿Cuánto se conserva? | **Esta ficha no borra ni edita nada**: una anotación escrita no se corrige. La purga, **X días después de que el pedido termina** (entregado o cancelado), con **cron automático** y **X en `.env`**, va en **ficha nueva** |
| 2026-09-18 | ¿El pedido es obligatorio? | **Sí.** La ficha dudaba porque QC-63 iba a abrir recetas sin pedido; QC-63 cerró ejecutando **solo desde un pedido asignado** |
| 2026-09-18 | ¿Se acota por empresa? | **Sí, con columna propia**, heredado del arco multiempresa (**QC-48, QC-49, QC-59, QC-60**). La ficha lo dudaba porque `orders` no tenía empresa; **QC-60 ya se la dio** |
| 2026-09-18 | Identificadores | **En inglés**. Heredado de la **feature 4** |
| 2026-09-18 | ¿Hace falta E2E? | **Sí**: cambia el estado del pedido y es un flujo de permisos (`CHECKPOINTS.md`). Mínimo: el Operador abre un pedido, avanza dos pasos, **recarga y vuelve al paso 3**; y cancela otro con motivo y el pedido queda `CANCELADO` con ese motivo |
| 2026-09-18 | ¿Librería? | **Ninguna nueva** |
