# QC-63 — ejecutar-receta-operador · requirements.md

> **Zona** `fullstack` · **Complejidad** `high` (subida el 2026-09-17, ver las filas de esa fecha) · **depends_on** QC-62, QC-64, **QC-88** ·
> **Rama** `feature/QC-63-ejecutar-receta-operador`
>
> **Alcance.** La pantalla con la que un **Operador ejecuta la receta de un pedido que tiene
> asignado**: entra desde su lista de pedidos asignados, recorre los pasos de uno en uno marcando
> los elementos, y termina. **Abrirla pone el pedido `EN_CURSO`; Finalizar lo pone `ENTREGADO`**,
> mostrando una confirmación visible antes de volver a la lista. La pantalla tiene **dirección
> propia, enlazable y recargable**, no permite modificar nada, y deja **cambiar la unidad en que se
> ven las cantidades** —la misma línea en litros o en mililitros—.
>
> **Lo que NO entra.** Los grupos de trabajo → **QC-83**, **QC-84**, **QC-85**. La tabla de
> asignación y el asignar desde el pedido → **QC-86**, **QC-87**. La lista de pedidos asignados,
> incluido el bloqueo de un pedido que otro responsable ya está preparando → **QC-88**: esta ficha
> **empieza** en la pantalla de ejecución. El asistente de pasos → **QC-64**, que se **monta** y no
> se reescribe. Registrar **quién marcó qué y cuándo** → sigue **fuera de alcance** y esta acotación
> no le crea ficha.
>
> *Sembrado por `/afinar-feature` el 2026-09-08 y **reacotado el 2026-09-17**, cuando sus tres
> dependencias cerraron: las filas de esa fecha **corrigen** lo que el disco desmintio y la ficha del
> board se actualizo ANTES de escribirlas. Sembrado original:*
>
> *el 2026-09-08, y la ficha del board **reescrita entera** ese
> mismo día: su versión anterior daba por hecho que el Operador navegaría el catálogo de recetas.
> El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del spec.
> `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.*

## Requisitos (EARS)

> **Cómo se citan las decisiones.** `[D<n>]` es la fila **n-ésima** de `## Decisiones cerradas (no
> reabrir)`, contando desde arriba y sin reordenar nada: `D1`–`D12` son las del 2026-09-08 y
> `D13`–`D17` las del 2026-09-17. **Donde chocan, manda la del 2026-09-17**: `D13` corrige a `D1`
> en el permiso y en quién escribe, y `D16` corrige la línea de «Lo que NO entra» que mandaba el
> bloqueo del pedido `EN_CURSO` a QC-88.

### Ruta, corte por permiso y autorización

**R1.** CUANDO se solicita la dirección que produce `assignedOrderRoute(<id>)` —hoy
`/asignacion/<id>`, ya publicada en `lib/shared/routes.ts` y ya cubierta por el prefijo
`ASSIGNED_ORDERS_ROUTE` del middleware—, el sistema DEBE servir la pantalla de ejecución de la
receta del pedido `<id>`. La pantalla DEBE ser **enlazable y recargable**: la misma dirección,
pedida de nuevo, DEBE reconstruir la pantalla sin pasar por ninguna otra. El sistema **NO DEBE**
declarar ningún literal de ruta nuevo ni ninguna función de ruta nueva para esta pantalla. `[D2]`

**R2.** El sistema DEBE exigir el permiso **`asignaciones.consultar`, y solo ese**, antes de leer
ningún dato de la pantalla, en la propia página y con el mecanismo ya existente
(`requirePagePermission`). `[D1] [D10] [D13]`

**R3.** SI quien pide la pantalla no tiene `asignaciones.consultar`, ENTONCES el sistema DEBE
responder **404 y nunca 403**, con el mismo contenido que cualquier otro 404 de la zona privada: sin
nombrar el módulo pedido ni mencionar permisos. `[D10] [D11]`

**R4.** El sistema **NO DEBE** exigir, conceder ni depender de `recetas.consultar`,
`recetas.modificar`, `pedidos.modificar` ni `asignaciones.modificar` para nada de esta pantalla, y
el conjunto de permisos que el seed asigna al Operador —`inventario.consultar` +
`asignaciones.consultar`— DEBE quedar **sin cambios**. `[D1] [D13]`

**R5.** El sistema DEBE resolver la ejecución con un **caso de uso nuevo del módulo
`asignaciones`**, cuya **primera línea** sea la exigencia de `asignaciones.consultar`, **antes** de
validar la entrada y **antes** de tocar ninguna de sus dependencias —ni el repositorio de
asignaciones, ni el catálogo de pedidos, ni el de recetas, ni el de unidades—, igual que
`list-assigned-orders.ts`. SI el actor está ausente, no trae conjunto de permisos, lo trae vacío o
no trae el código exigido, ENTONCES el caso de uso DEBE rechazar con su error de autorización
**sin haber llamado a ninguna dependencia**. `[D10] [D13]`

**R6.** SI el pedido pedido **no está asignado** a quien lo pide, ENTONCES el caso de uso DEBE
rechazar, y DEBE hacerlo con la **misma respuesta** que si el pedido no existiera: desde fuera, «no
es tuyo» y «no existe» DEBEN ser indistinguibles. `[D13]`

**R7.** El sistema DEBE leer el pedido **filtrando por la empresa del actor**, tomada del actor y
jamás de la entrada. SI el pedido pertenece a otra empresa, ENTONCES la respuesta DEBE ser la misma
que si no existiera. `[D13]`

### Estado del pedido

**R8.** CUANDO se abre la pantalla de un pedido asignado en estado `PENDIENTE`, el sistema DEBE
dejarlo en **`EN_CURSO`** antes de darla por abierta. `[D6]`

**R9.** MIENTRAS el pedido esté en `EN_CURSO`, CUANDO **cualquier** responsable asignado abra o
recargue su pantalla, el sistema DEBE mostrarla **sin error** y DEBE **dejar el estado como está**.
La reentrada NO DEBE estar condicionada a que sea el mismo responsable que entró la primera vez.
`[D15]`

**R10.** El sistema DEBE lograr R8 y R9 **sin ninguna columna nueva, ninguna tabla nueva y ninguna
migración**: no DEBE guardar quién entró, cuándo entró, ni cuántos están dentro. `[D9] [D15]`

**R11.** CUANDO se activa **Finalizar** en el último paso, el sistema DEBE dejar el pedido en
**`ENTREGADO`**. `[D6]`

**R12.** El sistema DEBE **preguntar al contrato público de `pedidos`** si cada transición
(`→ EN_CURSO`, `→ ENTREGADO`) es legal, y **NO DEBE** contener ninguna segunda tabla, lista o
condición de estados que decida lo mismo. SI `pedidos` declara la transición ilegal, ENTONCES el
sistema **NO DEBE** escribir el estado y DEBE propagar ese rechazo. `[D14]`

**R13.** El sistema DEBE escribir el estado del pedido **a través de un servicio publicado por
`pedidos`**; ningún adaptador de `asignaciones` DEBE consultar ni actualizar el modelo `Order` con
Prisma. `[D6] [D14]`

**R14.** MIENTRAS el pedido esté en `ENTREGADO` o en `CANCELADO`, el sistema **NO DEBE** cambiar su
estado desde esta pantalla, y DEBE responder con el error correspondiente al estado
—`order_delivered_frozen` para el entregado— sin escribir nada. `[D17]`

**R15.** CUANDO el pedido queda en `ENTREGADO`, el sistema DEBE mostrar una **confirmación visible
en pantalla** y devolver a quien la usa a **la lista de pedidos asignados** (`/asignacion`). `[D5]`

**R16.** El sistema **NO DEBE** persistir nada de lo marcado durante el recorrido: ni qué elemento
se marcó, ni quién lo marcó, ni cuándo. Al volver a abrir la pantalla, el marcado DEBE estar
**vacío**. `[D5] [D9]`

**R17.** La pantalla **NO DEBE** ofrecer ninguna acción de reabrir, deshacer o devolver el pedido a
un estado anterior. El recorrido termina en `ENTREGADO`, y a partir de ahí el pedido deja de
aparecer en la lista de QC-88 y sus asignaciones quedan congeladas por
`order-state.ts`. `[D17]`

### El recorrido de pasos

**R18.** El sistema DEBE **montar** el asistente `StepReader` de `components/shared/step-reader`
pasándole los pasos y su propio `onFinish` **por props**, y **NO DEBE** modificar ninguno de sus
archivos ni hacerle leer datos, importar `lib/composition`, Server Actions o `next/navigation`.
`[D10]`

**R19.** MIENTRAS el paso actual tenga algún elemento de su lista de verificación sin marcar, el
sistema DEBE **impedir avanzar** (y finalizar), mostrando el motivo como **texto visible**. **NO
DEBE** existir ninguna vía de escape, ni con motivo escrito ni sin él. `[D4]`

**R20.** La pantalla **NO DEBE** permitir modificar nada: ni la receta, ni sus pasos, ni sus líneas,
ni el pedido más allá de las dos transiciones de estado de R8 y R11. `[D7]`

**R21.** El sistema DEBE mostrar de forma **visible y fija** el factor entre la cantidad del pedido
y la cantidad para la que está escrita la receta —con la forma «Pedido 250 L · receta para 100 L ·
×2,5»— y DEBE mostrar las **líneas y los pasos tal como están escritos**, sin escalar ninguna cifra.
`[D7]`

### Cantidades en otra unidad

**R22.** DONDE una línea de la receta esté expresada en una unidad que tenga **otras unidades con su
misma base efectiva** (`baseUnitId ?? id`), el sistema DEBE ofrecer **solo esas** como unidades
alternativas de visualización, y CUANDO se elija una, DEBE mostrar la cantidad convertida a ella.
`[D8]`

**R23.** SI se pide convertir entre dos unidades que **no** comparten base efectiva, ENTONCES el
sistema DEBE tratarlo como **error** y **NO DEBE** devolver ninguna cantidad. `[D8]`

**R24.** El cambio de unidad DEBE cambiar **solo cómo se ve**: **NO DEBE** alterar la receta ni el
pedido y **NO DEBE** persistirse. Al recargar la pantalla, las cantidades DEBEN volver a verse en su
unidad original. `[D8]`

**R25.** El sistema DEBE calcular la conversión con `convertQuantity` del contrato público de
`unidades`, y **NO DEBE** contener ninguna segunda implementación de la conversión ni del criterio
de convertibilidad. `[D8]`

### Multiplataforma

**R26.** Todo control que esta ficha monte DEBE tener un objetivo táctil de al menos **44×44 px**,
**NO DEBE** depender de `:hover` como única vía de descubrir o activar nada, y la pantalla DEBE ser
**operable por teclado**. `[D12]`

### Lo que esta ficha enmienda de QC-88

**R27.** CUANDO un pedido asignado esté en `EN_CURSO`, el disparador de entrar de la lista de QC-88
DEBE quedar **habilitado** y llevar a la pantalla de ejecución; el texto que hoy explica el bloqueo
DEBE pasar a ser un **aviso de presentación** —visible, no en `:hover`— y DEBE dejar de impedir la
entrada. Esto **enmienda QC-88 R21** y **cierra QC-88 R23**, cuyo rechazo real se remitía aquí y,
por `[D15]`, no existe. `[D16]`

**R28.** Los tests y guardias de QC-88 que hoy afirman el bloqueo DEBEN **enmendarse tensándolos**,
con **nota fechada**, y **NINGUNA guardia DEBE aflojarse**: la enmienda DEBE demostrarse **por
mutación** —romper a mano la conducta nueva DEBE poner rojo el test correspondiente—. `[D16]`

### Verificación de extremo a extremo

**R29.** El sistema DEBE tener un E2E del camino feliz: el Operador entra, ve su pedido asignado, lo
abre, el pedido queda **`EN_CURSO`**, recorre los pasos hasta Finalizar y el pedido queda
**`ENTREGADO`**. `[D11]`

**R30.** El sistema DEBE tener un E2E del camino negativo: quien **no** tiene `asignaciones.consultar`
pide la dirección de la pantalla y recibe **404**. `[D11]`

### Frontera de la ficha

**R31.** Esta ficha **NO DEBE** construir ni modificar la **lista** de pedidos asignados más allá de
lo que exigen R27 y R28: la lista es de QC-88 y la pantalla **empieza donde esa lista termina**. El
puente al contenido DEBE salir de `Order.recipeId`, que ya existe, y **NO DEBE** aparecer ninguna
navegación por el catálogo de recetas. `[D2] [D3]`

## Preguntas abiertas

**1. ¿De dónde sale la cantidad para la que está escrita la receta?** (abierta el 2026-09-17, al
escribir el spec; **bloquea la mitad de R21** y la task T12)

La decisión `[D7]` exige mostrar el factor —«Pedido 250 L · receta para 100 L · ×2,5»—, pero
**verificado en `db/schema.prisma`: el modelo `Recipe` no tiene ninguna columna de cantidad base ni
de rendimiento**, y `RecipeDetail` no publica ninguna. Sin ese dato el factor **no se puede
calcular**, y `[D15]` cierra que esta ficha no añade columna ni migración. No se rellena con un
supuesto: la decide el humano en F1.4. El diseño deja los dos campos tipados `| null` y una rama
degradada —mostrar la cantidad del pedido **sin factor**— para que la pantalla no quede a medias
mientras se decide (`design.md > 3.2`).

*Cuando se cierre, su fila baja a «Decisiones cerradas» con la fecha del día en que se decidió.*

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-08 | ¿Con qué permiso entra el Operador a la pantalla? | **No con `recetas.*`.** El permiso es del **módulo nuevo de asignación** (QC-86), con `asignaciones.consultar` y `asignaciones.modificar` — el patrón de **dos permisos por módulo** que fijó **QC-74**, sin inventar un tercero. El Operador nace con `inventario.consultar` + `asignaciones.consultar`. **No recibe `recetas.consultar`**: hoy ese permiso corta **las dos** pantallas de recetas —`formulas/page.tsx` y `formulas/[id]/page.tsx`, que es el **formulario de edición**—, así que dárselo le abriría justo lo que esta ficha dice que no debe ver |
| 2026-09-08 | ¿Cómo llega el Operador a la receta? | **Desde un pedido que tiene asignado**, no navegando el catálogo. `Order.recipeId` ya existe (QC-33), así que el puente pedido→receta no se inventa aquí. La lista de trabajo la construye **QC-88**; esta ficha empieza donde esa lista termina |
| 2026-09-08 | Con esa cadena por delante, ¿QC-63 se reduce o absorbe el listado? | **Se reduce y queda bloqueada.** Pasa a ser solo «ejecutar la receta de un pedido asignado», con `depends_on` hacia **QC-88**. No arranca hasta que la cadena exista. Cuando le toque, es una ficha pequeña de verdad |
| 2026-09-08 | ¿El bloqueo de *Siguiente* necesita una vía de escape con motivo escrito? | **No: bloquea sin excepción**, heredado tal cual de **QC-64 decisión 4**. Es lo que ya está construido y probado, y no arrastra dónde guardar un motivo —que hoy no tiene ficha ni tabla, y que sin el registro del marcado quedaría sin contexto—. **Esto cierra la pregunta abierta 1 de QC-64**, que estaba escrita esperando explícitamente a esta ficha. Si en planta duele, es ficha nueva con el caso real medido |
| 2026-09-08 | ¿Qué hace Finalizar? | **Confirmación visible en pantalla y vuelta a la lista** de pedidos asignados. Cierra el recorrido de forma visible **sin guardar nada de lo marcado**, que es lo que la ficha ya declaró fuera de alcance |
| 2026-09-08 | ¿Ejecutar mueve el estado del pedido? | **Sí: abrir → `EN_CURSO`, Finalizar → `ENTREGADO`.** El operario que prepara la mezcla es la señal más fiable de cuándo arrancó y cuándo está lista, y el Administrador deja de mover a mano dos estados que otro conoce mejor. **A través del caso de uso de transición de `pedidos` (QC-34)**: esta ficha **no escribe la columna por su cuenta** ni redefine las transiciones. Consecuencia asumida: esta pantalla **escribe**, no es solo de lectura |
| 2026-09-08 | ¿Se escalan las cantidades a la cantidad del pedido? | **No se escala nada.** La pantalla muestra el **factor bien visible y fijo** —«Pedido 250 L · receta para 100 L · ×2,5»— y las líneas y los pasos **tal como están escritos**. Escalar solo las líneas sería **peor** que no escalar: los pasos de **QC-62** son texto libre, y si el autor escribió «cargar el reactor con **90 L** de agua» dentro de un párrafo, ese número no se puede escalar sin adivinar — la pantalla mostraría `225 L` en la lista y `90 L` en el paso que el operario está leyendo, y eso en planta es un lote perdido. Ninguna cifra de esta pantalla se contradice con otra **porque ninguna se toca** |
| 2026-09-08 | ¿Se puede ver una cantidad en otra unidad? | **Sí**: la misma línea en **litros o en mililitros**, para no obligar a nadie a convertir de cabeza en planta. Cambia **solo cómo se ve**; no altera la receta ni el pedido, y no persiste nada. **Esta ficha es el PRIMER CONSUMIDOR de la conversión entre unidades de QC-76**, que hasta hoy no usaba nadie —`docs/architecture.md > Preguntas abiertas del dominio > 1` decía que quien la estrenara iría en su propia ficha, y la estrena esta—. Solo se ofrecen unidades que **comparten base efectiva**: ofrecer una conversión imposible es un **error**, no un resultado raro |
| 2026-09-08 | ¿Se registra quién marcó qué y cuándo? | **No. Fuera de alcance**, ya escrito en la ficha del board y reafirmado en **QC-62**. Esta acotación **no le crea ficha** |
| 2026-09-08 | ¿Qué se hereda montado y no se re-crea? | El asistente **`StepReader`** de **QC-64** (`components/shared/step-reader/`), que **recibe todo por props** y cuya propia cabecera dice que «QC-63 podrá montarlo pasándole otro `onFinish` sin tocar una línea de aquí» — no lee datos, no importa `lib/composition`, ni Server Actions, ni `next/navigation`, y un **test de fuente** lo afirma. Más el corte por permiso de pantalla de **QC-75** (`requirePagePermission`, **404 y no 403**) y la autorización **en el service** antes del repositorio |
| 2026-09-08 | ¿Hace falta E2E? | **Sí.** `CHECKPOINTS.md` la exige para flujos de permisos y este lo es: **Operador entra, ve su pedido asignado, lo abre, el pedido queda `EN_CURSO`, recorre los pasos hasta Finalizar y el pedido queda `ENTREGADO`**. Y el camino negativo: quien no tiene `asignaciones.consultar` recibe **404** |
| 2026-09-08 | ¿Multiplataforma? | **Sin excepción**, heredado de **QC-26 R19, R34, R50** y reafirmado en QC-64: objetivos táctiles de **44×44 px**, **nada detrás de `:hover`**, y la pantalla operable por teclado. Es la ficha donde más pesa: se usa en planta, en un móvil o una tablet, posiblemente con guantes |
| 2026-09-17 | ¿Con que permiso entra y con cual ESCRIBE el Operador? | **Corrige la fila del 2026-09-08, que ya no se sostiene contra el disco.** La pantalla se corta con **`asignaciones.consultar` a secas**: verificado en `lib/modules/identity/domain/permissions.ts`, el Operador nace con `inventario.consultar` + `asignaciones.consultar` y **no tiene `asignaciones.modificar`**, asi que exigir los dos lo dejaria fuera de su propia pantalla. El cambio de estado lo hace un **caso de uso NUEVO del modulo de asignacion**, cortado por el mismo permiso y que exige ademas que **el pedido este asignado a quien lo pide**. **No** se le da `pedidos.modificar` -hoy es lo que corta `updateOrder`, y le abriria editar cualquier pedido- ni `asignaciones.modificar` -hoy corta asignar y desasignar responsables, y podria repartirse pedidos a si mismo-. Misma clase de agujero que **QC-88 H1** evito a conciencia |
| 2026-09-17 | ¿Quien decide que transicion es legal? | **La tabla de `lib/modules/pedidos/domain/order-transitions.ts` (QC-34) sigue siendo la unica verdad.** El caso de uso nuevo **pregunta al contrato publico de `pedidos`** y no reimplementa la matriz ni escribe la columna por su cuenta. El motivo esta escrito en ese mismo archivo y en `order-state.ts` de QC-87: dos copias de la misma tabla **divergen en silencio** el dia que el catalogo de estados crezca |
| 2026-09-17 | ¿Puede el Operador volver a entrar a un pedido que ya esta `EN_CURSO`? | **Si: cualquier responsable asignado entra**, aunque el pedido ya este `EN_CURSO`. Es el caso real de planta -se apaga la tablet, se recarga la pantalla- y la alternativa dejaba el trabajo bloqueado hasta que alguien de oficina lo devolviera a `PENDIENTE`. **Sin dato nuevo, sin columna y sin migracion**, coherente con que esta ficha no registra quien hizo que. **Coste asumido y escrito**: dos responsables del mismo pedido pueden estar dentro a la vez y el sistema no lo sabra |
| 2026-09-17 | ¿Que pasa entonces con el disparador deshabilitado que dejo QC-88, ya mergeada? | **Pasa a ser un aviso de presentacion, y esta ficha lo enmienda.** QC-88 R21 deshabilita el disparador de entrar de todo pedido `EN_CURSO` y su **R23 remitia el rechazo real aqui**; con la fila anterior, ese rechazo **no existe**. La guardia y los tests de QC-88 se **enmiendan TENSANDOLOS, con nota fechada**, nunca aflojandolos, y probandolo por mutacion: el mismo procedimiento que QC-88 uso con la guardia de QC-102. **La linea de «Lo que NO entra» que mandaba este bloqueo a QC-88 queda corregida por esta fila** |
| 2026-09-17 | ¿Que deja detras Finalizar? | **Verificado en disco, no supuesto**: al pasar a `ENTREGADO`, `lib/modules/asignaciones/domain/order-state.ts` **congela las tres escrituras de asignacion** (`order_delivered_frozen`) y la lista de QC-88 **deja de mostrarlo** (su R11 solo trae `PENDIENTE` y `EN_CURSO`). Es el final del recorrido: desde esta pantalla **no hay vuelta atras**, y reabrir un pedido entregado no es de esta ficha |
