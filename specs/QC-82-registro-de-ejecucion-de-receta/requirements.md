# QC-82 — registro-de-ejecucion-de-receta · requirements.md

> **Zona** `fullstack` · **Complejidad** `high` · **depends_on** `QC-63`, `QC-168` ·
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
> **Enmienda del 2026-09-26 (A1–A6):** al entrar **QC-168** (`estado-por-empacar`, `done`) el gesto
> del operario ya no entrega: **deja el pedido `POR_EMPACAR`**, y quien lo recoge —el Empacador—
> lo lleva a `ENTREGADO` con dos gestos más, **comenzar empaque** y **terminar empaque**, que
> **también se anotan aquí** (QC-168 `D8`). Son **ocho** acciones, no seis. El resto de la ficha
> —qué se guarda, cómo se acota, cómo se cancela— **no cambia**: lo que cambia es el estado de
> salida del Finalizar, los dos estados nuevos, las dos acciones nuevas y quién puede cancelar.
>
> ## Lo que NO entra
>
> - **Purgar el registro** pasados X días desde que el pedido termina, con un cron automático y
>   X en `.env` → **QC-124** (`purga-del-registro-de-ejecucion`). Esta ficha no borra nada.
> - **Una pantalla para consultar el recorrido** (quién, cuánto tardó, dónde volvió atrás): sin
>   ficha; el registro queda escrito y legible por la base.
> - **Guardar lo que el operario marcó** dentro de cada paso: sigue fuera, como fijó QC-63.
>
> _Nota del 2026-09-24, añadida por decisión humana sin reescribir la lista de arriba: la consulta
> del recorrido se hará en el **dashboard del Administrador**, en su ficha propia **QC-167**
> (`recorrido-de-ejecucion-en-el-dashboard`), bloqueada por esta. Esta ficha sigue sin ofrecer ninguna pantalla de consulta._
>
> _Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

> **Cómo se citan las decisiones.** `[D<n>]` es la fila **n-ésima** de `## Decisiones cerradas (no
> reabrir)`, contando desde arriba y sin reordenar nada: `D1`–`D3` son las del 2026-09-08 y
> `D4`–`D18` las del 2026-09-18 y `D19`–`D20` las del 2026-09-24. **Donde chocan, manda la del
> 2026-09-18**: `D12` enmienda a `D1` (se añade **retomar**). **`[QC-168 D<n>]`** es una decisión de
> **QC-168**, no de esta ficha: quien manda sobre el empaque es esa, y solo ella. **`[QC-168 R<n>]`**
> es un requisito suyo, con la misma jerarquía. **Donde chocan, manda el de QC-168**: su `D8` (el
> empaque también se registra) y su `D9` (QC-150 → QC-168 → QC-82, esta ficha ajusta su spec antes de
> implementar) **ganan** a `D1`/`D12` de esta ficha, que quedan **cerradas y enmendadas**, no
> reabiertas. Ninguna decisión de QC-168 se copia aquí como si fuera de esta ficha, y esta ficha no
> inventa filas nuevas en la tabla de abajo: lo que QC-168 dejó sin contestar está en
> `## Preguntas abiertas`.
>
> **Vocabulario.** «La pantalla» es la pantalla de ejecución de QC-63 (`assignedOrderRoute(<id>)`).
> «Responsable asignado» es quien figura como responsable del pedido en su empresa. «Posición» es el
> número que la pantalla enseña como «Paso *n* de *N*», contando desde 1. «La misma operación»
> significa que o quedan escritas las dos cosas o no queda ninguna.
>
> **Lo marcado con ⚑** depende de un punto que **no sale de la acotación** y queda señalado para
> F1.4 en `design.md > 12` (ratificados) o en `design.md > 14.1` (abiertos: P1–P5). El requisito está
> escrito con la propuesta; si el humano la cambia, se reescribe ese requisito y nada más.
>
> **Revisión del 2026-09-24** (F1.2 contra el `dev` de ese día; detalle en `design.md > Revisión
> 2026-09-24`). Se ajustaron **R24, R27, R29 y R37** sin tocar lo decidido: el camino de
> cancelación de `pedidos` ahora libera el material apartado y el de entrega lo consume, y los dos
> abren su propia transacción. Las dos preguntas que abrió la revisión las cerró el humano el mismo
> día (`D19`, `D20`).
>
> **Enmienda del 2026-09-26 (A1–A6), en una pasada y sin reescribir nada de lo anterior.** Las seis
> filas que dejó QC-168 `design.md > 9`, apoyadas en su `R45` —que **prohíbe** a QC-168 tocar este
> spec—; cada una comprobada contra el código de `dev` tras el merge `811416cd`, no contra el spec de
> QC-168. Qué cambió y con qué evidencia, punto por punto, en `design.md > Revisión 2026-09-26`.
>
> | | Enmenda | Dónde cae | Requisitos |
> |---|---|---|---|
> | **A1** | El Finalizar deja **`POR_EMPACAR`**, no `ENTREGADO` | `design.md > 3.3` y `tasks.md > T11` | R21 |
> | **A2** | `POR_EMPACAR` y `EN_EMPAQUE` **congelan** la asignación, con `order_produced_frozen` | `design.md > 0`, fila «Estados que congelan» | **R43** |
> | **A3** | El enum pasa de **seis** a **ocho** acciones; las dos de empaque se anotan **dentro** de `transaction.run` | `design.md > 3.1`, `> 3.3` y `> 4` | R1, **R41**, **R42** |
> | **A4** | Las dos escrituras de empaque exigen **`empaque.modificar`**, no `asignaciones.consultar` | `design.md > 3.3` | R26, **R42** |
> | **A5** | Un pedido `POR_EMPACAR` o `EN_EMPAQUE` es **`not_cancellable`**, no `not_found` | `design.md > 5` | R29, **R43** |
> | **A6** | La E2E ya espera `POR_EMPACAR` tras Finalizar | `tasks.md > T11` y `> T23` | **R43** (como premisa) |
>
> **Consecuencia de fondo, y es la que obliga a mover T1 y T2:** las seis acciones de
> `order_execution_entries` pasan a **ocho**, y el enum `OrderExecutionAction` de la migración también.
> El tipo `ExecutionAction` del dominio y su mapa al enum se amplían, y el `CHECK` de la posición
> necesita **un tercero** para que las dos de empaque no lleven posición (R5bis). Nada de esto abre
> alcance fuera de las seis enmiendas: sale de ellas.
>
> **Lo que la enmienda NO toca:** `D1`–`D20` siguen cerradas. No se reescribe ningún requisito que no
> esté nombrado arriba, ni se reabre ninguna decisión. Lo único que se añade son **`R41`–`R43`**, tres
> requisitos nuevos, y **dos preguntas abiertas** que quedan abajo.
>
> **Revisión del 2026-10-06** (contra `dev` tras el merge `abd455b4`, 561 commits; detalle con
> `archivo:línea` en `design.md > Revisión 2026-10-06`). Mismo método: **gana el código de `dev`**, y
> cuando el código y otro spec no coinciden se dice. Entraron, entre otras, **QC-138** (`BLOQUEADO`),
> **QC-201** (`asignaciones.ejecutar`: el Empacador **ya no ejecuta**), **QC-211** (pasos de envasado
> con `StepReader` en la pantalla de empaque) y **QC-195** (Terminar empaque da de alta el lote y
> consume envases). Lo que cambia aquí:
>
> | | Qué | Requisitos |
> |---|---|---|
> | **B1** | `BLOQUEADO` existe: no se abre (`order_blocked`), no anota, y **sí es cancelable** por la definición única de `pedidos` | R20, R29, **R44** (nuevo) |
> | **B2** | La ejecución exige **`asignaciones.ejecutar`** (QC-201 `D5`), no `asignaciones.consultar`; el Empacador no lo tiene (QC-201 `D2`) | R26 ⚑, R27 ⚑ |
> | **B3** | Los rechazos del Finalizar son **dos**; los de lote y envase pasaron a **Terminar empaque**, que ya no comprueba asignación | R24, R41, R42 |
> | **B4** | `already_mine` solo lo devuelve **Comenzar**; Terminar no lo tiene | R41 |
> | **B5** | La pantalla de empaque **sí recorre pasos** (los de envasado, QC-211): cambia el porqué de R5bis, no su regla | R5bis, R37 |
>
> **Lo que la revisión NO toca:** `D1`–`D20` siguen cerradas y no se reabren. Dos quedan **enmendadas
> por decisión ajena**, igual que `D1` lo quedó por QC-168 `D8`: **`D20`** por QC-201 `D2`/`D5`/`D8`
> (el Empacador ya no ejecuta ni finaliza) y, **en su permiso**, **`D7`** por QC-201 `D5` para los
> tres casos de uso que ya existían. Si `D7` alcanza también a los dos casos de uso **nuevos** es la
> **P3**: no lo decide este spec. Se añaden **R44** y tres preguntas (**P3**–**P5**).

### Qué se anota

**R1.** El sistema DEBE anotar en el registro de ejecución **exactamente ocho acciones** —arrancar,
retomar, avanzar, retroceder, cancelar, finalizar, **comenzar empaque** y **terminar empaque**— y la
base DEBE rechazar cualquier anotación con una acción distinta de esas ocho. `[D1] [D12] [QC-168 D8]
[QC-168 D9]`

**R2.** Cada anotación DEBE guardar la acción, el instante, el pedido, la persona que la hizo, su
empresa y la posición del paso **—salvo en las dos anotaciones de empaque, que van siempre sin
posición (R5bis)—**; y, solo si la acción es cancelar, el motivo. `[D1] [D9] [D10] [D14] [D15]
[QC-168 D8]`

**R3.** El sistema DEBE guardar del tiempo **un único instante** por anotación —el de la acción— y
**NO DEBE** guardar duración, ni hora de fin, ni ninguna otra marca de tiempo en la anotación. `[D10]`

**R4.** Del paso, el sistema DEBE guardar **solo su posición** y **NO DEBE** guardar su texto, su
contenido ni ningún identificador suyo. SI la receta se edita después, ENTONCES el sistema **NO
DEBE** corregir ni recalcular ninguna posición ya anotada. `[D9]`

**R5.** ⚑ SI la receta del pedido no tiene ningún paso, ENTONCES las anotaciones de ese pedido DEBEN
guardarse **sin posición**; en cualquier otro caso la posición DEBE existir y ser un entero mayor o
igual que 1, y la base DEBE rechazar una posición menor que 1. `[D9]`
**R5bis.** ⚑ Las dos anotaciones de empaque —**comenzar empaque** y **terminar empaque**— DEBEN
guardarse **siempre sin posición**. La base DEBE rechazar una posición distinta de `NULL` en esas dos
acciones, y **NO DEBE** exigirla en ellas aunque la receta tenga pasos del operador o de envasado.
`[D9] [QC-168 D8]`
_Nota del 2026-10-06 (B5): el porqué del 2026-09-26 —«la pantalla de empaque no recorre pasos»— dejó
de ser cierto con QC-211, que monta `StepReader` con los pasos de envasado. La regla no cambia: la
posición del registro es la de los **pasos del operador** (R4), Comenzar ocurre **antes** de que se
muestre ningún paso de envasado (QC-211 R19) y QC-211 R31 prohíbe guardar el avance del empacador.
Si se anota o no el recorrido de los pasos de envasado es la **P4**._

**R6.** El pedido DEBE ser **obligatorio**: la base DEBE rechazar una anotación sin pedido o con un
pedido que no existe. `[D14]`

**R7.** La anotación DEBE llevar **su propia columna de empresa**, y la base DEBE rechazar una
anotación cuya empresa no sea a la vez la del pedido y la de la persona que la hizo. `[D15]`

**R8.** La base DEBE garantizar que el motivo existe **si y solo si** la acción es cancelar: DEBE
rechazar una cancelación sin motivo y DEBE rechazar cualquier otra acción que traiga motivo. Las dos
acciones de empaque cuentan entre esas «cualquier otra acción»: no llevan motivo. `[D2]
[D4] [QC-168 D8]`

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
ENTONCES el sistema **NO DEBE** escribirla, y **NO DEBE** avisar de ello: la pantalla ya está
instruida para no propagar el fallo (R19). SI el estado es `ENTREGADO` o `CANCELADO`, el sistema DEBE
rechazar con su error de estado cerrado; SI es `POR_EMPACAR` o `EN_EMPAQUE`, con
**`order_produced_frozen`**; SI es `PENDIENTE`, con `order_not_found`; **SI es `BLOQUEADO`, con
`order_blocked`** (B1, el mismo código con el que hoy se niega abrirlo). `[D11] [D13] [QC-168 D8]`

**R21.** CUANDO se activa **Finalizar** en el último paso, el sistema DEBE anotar **finalizar** con la
posición de ese paso, en **la misma operación** que deja el pedido **`POR_EMPACAR`**. La entrega la
termina el Empacador, no el operario: desde QC-168 este requisito **no dice `ENTREGADO`**, y el
`finished_at` tampoco se escribe aquí —lo escribe **terminar empaque**—. `[D5] [D11] [QC-168 D8]
[QC-168 D9]`

**R22.** La pantalla DEBE ofrecer un **botón para cancelar el pedido** que, antes de hacer nada,
**pida el motivo** en un campo de texto visible. CUANDO se confirma con un motivo válido, el sistema
DEBE dejar el pedido **`CANCELADO`** y anotar **cancelar** con ese motivo y la posición del paso que se
está mostrando, en **la misma operación**. `[D5] [D6] [D11]`

**R23.** CUANDO se cancela desde la pantalla, el motivo de cancelación del pedido DEBE ser
**exactamente el mismo texto** que queda en la anotación, escrito una sola vez por quien cancela.
`[D8]`

**R24.** SI falla cualquiera de las dos escrituras de arrancar, retomar, finalizar, cancelar, **comenzar
empaque o terminar empaque**, ENTONCES **NO DEBE quedar ninguna**: ni la anotación sin el cambio del
pedido ni el cambio del pedido sin la anotación, y la pantalla DEBE mostrar el error. «El cambio del
pedido» incluye todo lo que `pedidos` escribe en esa misma operación: al finalizar, el consumo del
material y el alta del lote de producto terminado; al cancelar, la liberación del material apartado;
al comenzar el empaque, el estado y el `packed_by`; al terminarlo, el estado, el `finished_at`, el
consumo de los envases del reparto y el alta de un lote de producto terminado por línea. SI `pedidos`
rechaza el Finalizar —material insuficiente o receta sin líneas—, ENTONCES **NO DEBE** quedar la
anotación de finalizar ni nada de esa operación. SI `pedidos` rechaza Terminar empaque —receta no
encontrada, presentación sin contenido, unidades incompatibles, pedido sin unidad o envases
insuficientes—, ENTONCES **NO DEBE** quedar la anotación de terminar empaque ni nada de esa operación.
Las filas de responsable que el Finalizar crea para los empacadores **antes** de esa operación DEBEN
deshacerse con su compensación de siempre también cuando lo que falla es la anotación. `[D11]
[QC-168 D8] [QC-168 D9]`
_Nota del 2026-10-06 (B3): la lista del 2026-09-26 —«sin contenido de presentación, sin envase entero
o receta dada de baja»— era la del Finalizar de QC-150; desde QC-195 esos rechazos son de Terminar
empaque (`finish-assigned-order.ts:218-220`, `finish-packing.ts:76-83`)._

**R25.** ⚑ CUANDO el pedido queda `CANCELADO` desde la pantalla, el sistema DEBE devolver a quien la
usa a la lista de pedidos asignados mostrando una **confirmación visible** de la cancelación. `[D6]`

### Autorización, módulos y empresa

**R26.** ⚑ Las escrituras del registro DEBEN hacerse con **casos de uso del módulo `asignaciones`**
cuya **primera línea** sea la exigencia de **un único permiso**, antes de validar la entrada y antes
de tocar ninguna dependencia. SI el actor está ausente, no trae permisos, los trae vacíos o no trae
ese código, ENTONCES el caso de uso DEBE rechazar con su error de autorización **sin haber llamado a
ninguna dependencia**. El permiso es:
- **`asignaciones.ejecutar`** en arrancar, retomar y finalizar (los casos de uso que ya existen; lo
  fija QC-201 `D5` y ya está en `dev`);
- ⚑ **`asignaciones.ejecutar`** también en cancelar y en avanzar/retroceder (propuesta de la **P3**;
  la letra de `D7` dice `asignaciones.consultar`);
- **`empaque.modificar`** en comenzar y terminar empaque, que **NO** piden ninguno de los dos de
  `asignaciones` (R42).
`asignaciones.consultar` **NO DEBE** bastar para ninguna escritura del registro. `[D7] [QC-168 D8]
[QC-168 D9] [QC-201 D5]`

**R27.** ⚑ **Cualquier responsable asignado** al pedido **que tenga el permiso de R26** DEBE poder
cancelarlo desde la pantalla, no solo quien lo arrancó, sea cual sea su rol. SI el pedido no está
asignado a quien pide, o es de otra empresa, ENTONCES el caso de uso DEBE rechazar con **la misma
respuesta que si no existiera**, sin escribir nada. `[D7] [D15] [D20] [QC-201 D2]`
_Nota del 2026-10-06 (B2): la versión anterior decía «incluido el Empacador», por `D20`. QC-201 `D2`,
`D5` y `D8` lo dejaron sin `asignaciones.ejecutar`, sin pantalla de ejecución y sin ver ningún pedido
anterior a `POR_EMPACAR`: con la propuesta de la P3, el Empacador **no** cancela desde la pantalla, y
con la letra de `D7` podría hacerlo solo forjando la petición, porque no ve ni el pedido ni el botón._

**R28.** La empresa de cada anotación DEBE salir **del actor** y **nunca de la entrada**, y toda
lectura del registro DEBE filtrar por la empresa del actor. `[D15]`

**R29.** El sistema DEBE cancelar el pedido **preguntando al contrato público de `pedidos`**:
`asignaciones` **NO DEBE** escribir el estado ni el motivo del pedido y **NO DEBE** contener ninguna
lista propia de estados cancelables. `pedidos` DEBE decidir si el pedido es cancelable con **la misma
definición** que usa su caso de uso de cancelación, y DEBE existir **un solo camino de escritura**
del estado `CANCELADO` con su motivo. La cancelación desde la pantalla DEBE hacer en el pedido
**exactamente lo mismo** que hace el caso de uso de cancelación de `pedidos`, **incluida la liberación
de todo el material apartado** del pedido, con quien cancela como autor, y **NO DEBE** consumir ni dar
de baja ningún material. SI `pedidos` declara el pedido no cancelable, ENTONCES el sistema DEBE
responder `not_cancellable` sin escribir nada; y eso vale también, con el **mismo** código, para un
pedido `POR_EMPACAR` o `EN_EMPAQUE` (R43). Por esa misma definición, un pedido **`BLOQUEADO` es
cancelable** (B1, `cancel-order.ts:33`), y cancelarlo no libera nada porque no tiene nada apartado.
`[D6] [D7] [D19] [QC-168 D8]`

**R30.** **Esta ficha** no DEBE cambiar el conjunto de permisos que el seed asigna a cada rol: el
Operador DEBE poder cancelar desde la pantalla **sin** `pedidos.modificar` y **sin**
`asignaciones.modificar`, y las dos acciones de empaque **NO DEBE** añadir ningún código nuevo al
Operador. Esto no contradice a QC-168, que ya sembró `empaque.modificar` para el Empacador y con eso
cerró su propio `R30`: aquí se afirma que **QC-82 no añade ni quita permisos**, no que el repo no los
haya cambiado. `[D7] [QC-168 D9]`

**R31.** El registro **NO DEBE** ofrecer ninguna operación que modifique o borre una anotación, y
ninguna vía de la aplicación DEBE emitir una modificación ni un borrado sobre él: una anotación
escrita no se corrige. `[D13]`

**R32.** La tabla del registro DEBE tener RLS **activada y forzada**, y solo el módulo propietario
DEBE consultarla. *(`docs/checkpoints-proyecto.md > Datos y seguridad`, sin fila propia en la tabla.)*

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
props no se le pasan —ni en `mode="lectura"` ni en `mode="ejecucion"`—. En particular, la pantalla
de empaque, que desde QC-211 monta el mismo asistente con los pasos de envasado, **NO DEBE** recibir
esas props y DEBE seguir empezando en el primer paso (QC-211 R31). Esto **enmienda QC-63 R18**, que
prohibía modificar sus archivos (QC-125 ya la tensó a una lista cerrada que admite solo
`step-reader.tsx`). `[D5] [D12]`

**R38.** La reentrada en un pedido `EN_CURSO` DEBE dejar rastro de **quién entró y cuándo** (la
anotación de retomar). Esto **enmienda QC-63 R10**, que prohibía guardarlo. Los tests de QC-63 que
afirman lo enmendado DEBEN **tensarse con nota fechada** y **ninguna guardia DEBE aflojarse**. `[D5]
[D12]`

### Verificación de extremo a extremo

**R39.** El sistema DEBE tener un E2E en el que el Operador abre un pedido asignado, avanza dos pasos,
**recarga** la pantalla y la pantalla vuelve al **paso 3**. `[D17]`

**R40.** El sistema DEBE tener un E2E en el que el Operador cancela otro pedido asignado **con un
motivo**, y el pedido queda **`CANCELADO` con ese motivo**. `[D17]`

### Las dos acciones de empaque (A3, A4) y los dos estados que congelan (A2, A5, A6)

**R41.** CUANDO quien tiene `empaque.modificar` activa **Comenzar empaque** sobre un pedido
`POR_EMPACAR`, o **Terminar empaque** sobre un pedido `EN_EMPAQUE` a su nombre, el sistema DEBE anotar
**esa** acción —**comenzar empaque** o **terminar empaque**— con el instante, el pedido, la persona y
su empresa, **sin posición** (R5bis) y **sin motivo** (R8), y lo DEBE hacer **en la misma operación**
que deja el pedido en `EN_EMPAQUE` o en `ENTREGADO`. SI cualquiera de las dos escrituras falla,
ENTONCES **NO DEBE quedar ninguna**, y la pantalla DEBE mostrar el error (R24). ⚑ SI Comenzar empaque
responde que el pedido **ya está** en empaque a nombre de esa persona —`already_mine`—, ENTONCES **NO
DEBE** anotar nada, porque no hubo cambio (propuesta de la **P1**). `[D11] [D13] [QC-168 D8]
[QC-168 D9]`
_Nota del 2026-10-06 (B4): Terminar empaque ya no tiene `already_mine` (`order-catalog.ts:161-171`):
repetirlo sobre un pedido ya `ENTREGADO` es `not_packable`, que es un rechazo y no anota._

**R42.** Las dos escrituras de R41 DEBEN hacerse con los **casos de uso de empaque** de
`asignaciones` —los de **QC-168**— y **NO** con un caso de uso nuevo ni con uno de los otros cuatro
caminos: esos dos archivos ya existen, ya exigen **`empaque.modificar`** en su primera línea y ya
rechazan al actor sin ese permiso **antes de tocar nada**. Les corresponde además **compartir** la
transacción de la ejecución, por el mismo mecanismo que las otras cuatro escrituras (R24), de modo que
QC-82 **NO DEBE** duplicar la lógica de transición: la tiene que seguir llamando. QC-82 **NO DEBE**
añadirles la comprobación de responsable asignado que no tienen: en `dev`, cualquiera con
`empaque.modificar` empaca cualquier pedido vivo de su empresa (`start-packing.ts:3-5`,
`finish-packing.ts:3-6`). `[D7] [D11] [QC-168 D8] [QC-168 D9]`

**R43.** Un pedido `POR_EMPACAR` o `EN_EMPAQUE` DEBE quedar **fuera del alcance de las anotaciones de
paso y de la cancelación**: (a) una anotación de avanzar o retroceder sobre él **NO DEBE** escribirse
y su error es **`order_produced_frozen`** (R20); (b) pedir su cancelación **NO DEBE** responder
`not_found` sino **`not_cancellable`** (R29); y (c) el E2E de empaque que espera `POR_EMPACAR` tras
finalizar —el de **QC-168**— es una **premisa ya cumplida en `dev`**, no un entregable de esta ficha:
lo que QC-82 le aporta es el **arreglo de limpieza** de esa E2E (R39) y las anotaciones que la
habilitan. `[D11] [D13] [QC-168 D8] [QC-168 D9]`

### El estado `BLOQUEADO` (B1, revisión del 2026-10-06)

**R44.** SI se abre o se recarga la pantalla de un pedido asignado en **`BLOQUEADO`**, ENTONCES el
sistema DEBE rechazar con **`order_blocked`**, **NO DEBE** anotar ni arrancar ni retomar, y **NO DEBE**
cambiar el estado del pedido. SI un pedido `PENDIENTE` pasa a `BLOQUEADO` entre la lectura y la
transición de arrancar, ENTONCES **NO DEBE** quedar ninguna anotación de arrancar. `[D11] [D12]`

### Cobertura de las decisiones

| Decisión | Requisitos |
|---|---|
| D1 — seis acciones (enmendada por D12; **y por A3, a ocho**) | R1, R2 |
| D2 — el motivo puede quedar vacío | R8 |
| D3 — no se cancela sin motivo | R9, R10 |
| D4 — motivo solo en cancelar, garantizado en la base; retroceder sin preguntas | R8, R11, R18 |
| D5 — la ficha conecta el registro a la pantalla | R12, R13, R17, R18, R21, R22, R36, R37, R38 |
| D6 — cancelar cancela el pedido por el camino único, con botón y motivo | R22, R25, R29, R36, R43 |
| D7 — cualquier responsable, `asignaciones.consultar`, caso de uso nuevo, seed igual | R26, R27, R29, R30, R42 |
| D8 — el mismo texto de motivo en la anotación y en el pedido | R10, R23 |
| D9 — se guarda la posición; riesgo aceptado | R2, R4, R5, R14, R17, R18, R5bis, R41 |
| D10 — un solo instante, sin duración | R2, R3 |
| D11 — avanzar/retroceder no bloquean; los otros cuatro, en la misma operación | R12, R15, R16, R19, R20, R21, R22, R24, R41, R42, R44 |
| D12 — reentrar anota retomar y vuelve al último paso anotado | R1, R13, R14, R16, R37, R38, R44 |
| D13 — no se borra ni se edita nada | R20, R31, R41, R43 |
| D14 — el pedido es obligatorio | R2, R6 |
| D15 — columna propia de empresa | R2, R7, R27, R28 |
| D16 — identificadores en inglés | R33 |
| D17 — E2E | R39, R40 |
| D18 — ninguna librería nueva | R35 |
| D19 — cancelar desde la ejecución libera todo el material, por el camino único | R24, R29 |
| D20 — el Empacador ejecuta, finaliza y (por D7) cancela lo que tenga asignado (**enmendada por QC-201 D2/D5/D8**, ver nota) | R27 |
| **QC-168 D8** — el empaque también se registra; `POR_EMPACAR` bloquea el avance | R1, R2, R5bis, R20, R21, R24, R26, R29, R41, R42, R43 |
| **QC-168 D9** — el orden es QC-150 → QC-168 → QC-82, y esta ficha ajusta su spec | R1, R21, R24, R30, R41, R42, R43 |
| **A1–A6** — la enmienda de QC-168 aplicada a los tres spec en una pasada | R20, R21, R24, R26, R29, R30, R39, **R41**, **R42**, **R43** |
| **QC-201 D2/D5/D8** — `asignaciones.ejecutar`; el Empacador no ejecuta ni ve pedidos anteriores a `POR_EMPACAR` | R26, R27 |
| **B1–B5** — la revisión del 2026-10-06 | R5bis, R20, R24, R26, R27, R29, R37, R41, R42, **R44** |

> **Nota fechada, 2026-09-26.** La fila de `D1` dice «seis» porque es lo que el humano cerró el
> 2026-09-18, y no se reescribe. Ese «seis» queda **superado** por `QC-168 D8`: son **ocho** (R1). Lo
> mismo con la etiqueta de la columna «caso de uso nuevo» de `D7`, que para las **dos** de empaque no
> es nuevo sino **el de QC-168** (R42). Ninguna de las dos cosas es una reopening.
>
> **Nota fechada, 2026-10-06.** La fila de `D20` no se reescribe: queda **superada** por QC-201 `D2`,
> `D5` y `D8`, cerradas por el humano el 2026-10-04 y ya en `dev` (`permissions.ts:254-255`,
> `start-assigned-order.ts:38`). La fila de `D7` dice `asignaciones.consultar`; para los tres casos de
> uso que ya existían la supera QC-201 `D5`, y para los dos nuevos de esta ficha **se pregunta** (P3).

## Preguntas abiertas

**Cinco**, todas para F1.4. La lista única, con el porqué de cada propuesta y qué cambia si el humano
elige la otra, está en **`design.md > 14.1`**; aquí va el resumen. P1 y P2 son del 2026-09-26; P3, P4
y P5 las abre la revisión del 2026-10-06. Ninguna reabre `D1`–`D20`. Los ocho puntos de
`design.md > 12` se ratificaron el 2026-09-18 y **no** están abiertos.

**P1 — Cuando Comenzar empaque responde `already_mine`, ¿se anota o no?** (R41) Desde el 2026-10-06
solo Comenzar lo devuelve. **Propuesta: cero anotaciones**, por R24 y `D13`.

**P2 — ¿Cómo se llaman los dos valores nuevos del enum `OrderExecutionAction`?** (R1, R33)
**Propuesta: `PACK_START` y `PACK_FINISH`**, por simetría con `GO_BACK`.

**P3 — ¿Qué permiso exigen los dos casos de uso nuevos, cancelar y avanzar/retroceder?** (R26, R27)
`D7` dice `asignaciones.consultar`; QC-201 `D5` pasó a **`asignaciones.ejecutar`** los tres casos de
uso de ejecución que ya existían, y la pantalla desde la que se cancela y se avanza ya lo exige
(`page.tsx:29`). **Propuesta: `asignaciones.ejecutar`**, porque es el permiso de la pantalla y la
letra de `D7` decía «el mismo camino que QC-63 abrió», que hoy es ese.

**P4 — ¿Se anota el recorrido de los pasos de envasado?** (R1, R5bis) QC-211 dejó fuera «registrar
la ejecución (QC-82)». **Propuesta: no**: R1 fija ocho acciones (`D1`, `D12`, QC-168 `D8`), QC-211 R31
prohíbe guardar ese avance, y anotarlo exige acciones o columnas nuevas, que es una ficha aparte.

**P5 — ¿Cómo entra Comenzar empaque en la transacción de la ejecución?** (R24, R42) En `dev` abre
su propia transacción sobre el cliente global (`order-prisma.ts:921-929`) y no admite otra.
**Propuesta: una fábrica `createOrderPackingRepository(db)` en el adaptador de `pedidos`**, la misma
figura que `createOrderWriteRepository(tx)`. Es técnica, pero toca el adaptador de otro módulo, que
este spec daba por intocable.

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
| 2026-09-24 | ¿Cancelar desde la ejecución un pedido `EN_CURSO` libera el material apartado? | **Sí, libera todo**, igual que la cancelación de oficina y **por el mismo camino único**. Lo que el operario ya gastó se da de baja después con un **ajuste de inventario (QC-92)**, fuera de esta ficha |
| 2026-09-24 | ¿El Empacador puede ejecutar los pedidos que tenga asignados? | **Sí: ejecuta y finaliza** los que tenga asignados. **La fila «¿Quién puede cancelar desde la pantalla?» se aplica tal cual**, sin código extra |
