# QC-138 — estado-bloqueado-por-inventario-insuficiente · requirements.md

> **Zona:** `fullstack` · **Complejidad:** `high` · **depends_on:** `QC-123`, `QC-141` ·
> **Rama:** `feature/QC-138-estado-bloqueado-por-inventario-insuficiente`
>
> **Alcance.** El pedido gana un quinto estado, `BLOQUEADO`. Al **crear** o al **editar**, si la
> existencia no cubre lo que su receta consume, un modal avisa y el pedido se guarda en ese
> estado. Al entrar existencia se revisan los pedidos bloqueados de esa empresa y se desbloquean
> los que ya se cubren, recalculando su importe. El Operador los ve pero no los puede iniciar.
>
> **Lo que NO entra.** La **reserva de material** → **QC-141**, que bloquea a ésta: sin ella dos
> pedidos creados el mismo día pueden contar con los mismos 2.000 gr y verse cubiertos los dos.
> Pintar el importe en la pantalla → **QC-122**. Que la presentación declare cuánto contiene →
> **QC-150**. Devoluciones, que no existen en el ERP.
>
> *(2026-09-25, F1.4: la referencia era QC-130, cancelada; el contenido de la presentación lo trajo
> QC-150. Cambio aprobado por el humano con P10, fila D26.)*
>
> Sembrado por `/afinar-feature` el 2026-09-21. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> **Cómo se citan las decisiones.** `[Dn]` es la **fila n** de la tabla `## Decisiones cerradas
> (no reabrir)`, contando de arriba abajo: D1 qué cuenta como «no alcanza», D2 cómo sale, D3
> recalcula importe, D4 qué movimientos disparan, D5 ajuste a la baja, D6 síncrono, D7 modal, D8
> bloquea al editar, D9 lo ve el Operador, D10 cancelable y editable, D11 no se arranca a mano, D12
> reserva (QC-141), D13 enum, D14 posición del valor, D15 sin permiso nuevo, D16 borrado e
> identificadores. D17-D27 son las filas cerradas en F1.4 (2026-09-25): D17 decisión central (P4),
> D18 P1, D19 P2, D20 P3, D21 P5, D22 P6, D23 P7, D24 P8, D25 P9, D26 P10, D27 distintivo.
>
> **Vocabulario** (heredado de QC-141). *Necesidad* de un ingrediente: cantidad del pedido × % de
> su línea / 100, en la unidad del producto. *Disponible* de un lote: su existencia menos lo que
> tienen apartado los pedidos vivos, nunca por debajo de cero. *No alcanza*: para al menos un
> ingrediente la suma de disponibles es menor que su necesidad —la misma regla con la que QC-141
> decide que un pedido no aparta nada (QC-141 R8-R11)—. *Pedido bloqueado*: pedido vivo en
> `BLOQUEADO`.

### A. Qué bloquea

**R1.** CUANDO se cree un pedido, o se edite uno `PENDIENTE` o `BLOQUEADO`, el sistema DEBE decidir
si alcanza en la misma operación que aparta su material y con la misma regla, midiendo contra el
**disponible** y contando como disponible, en la edición, lo que ese mismo pedido tenía apartado
`[D1]` `[D12]` (P2).

**R2.** SI la receta del pedido no tiene ninguna línea, ENTONCES el sistema NO DEBE bloquear el
pedido `[D1]`.

**R3.** SI el importe del pedido queda sin calcular por una causa distinta de que no alcance —un
ingrediente cuya unidad no comparte base con la del lote, un importe que desborda la columna, lotes
sin coste—, ENTONCES el sistema NO DEBE bloquear el pedido por esa causa `[D1]` (P4).

**R4.** SI el producto de un ingrediente no tiene unidad porque nunca tuvo
lotes, ENTONCES el sistema DEBE tratar ese ingrediente como que no alcanza `[D1]` `[D12]`.

**R5.** MIENTRAS un pedido esté `BLOQUEADO`, el sistema NO DEBE tener material apartado para él y
su instante de reserva DEBE estar vacío `[D12]` (P2).

### B. Alta y edición con aviso

**R6.** CUANDO se envíe el alta o la edición de un pedido que no alcanza sin la confirmación de
guardarlo bloqueado, el sistema NO DEBE escribir nada —ni el pedido, ni lo apartado, ni lo
liberado— y DEBE responder con el código `order_would_block` `[D7]` `[D8]`.

**R7.** CUANDO el formulario de alta o de edición de Pedidos reciba `order_would_block`, DEBE
mostrar un modal con exactamente dos acciones, «Guardar bloqueado» y «Volver» `[D7]` `[D8]`.

**R8.** CUANDO se elija «Guardar bloqueado», el sistema DEBE repetir la misma operación con la
confirmación; SI sigue sin alcanzar, ENTONCES DEBE guardar el pedido en `BLOQUEADO`, y SI entre
tanto alcanza, ENTONCES DEBE guardarlo `PENDIENTE` apartando su material, sin volver a mostrar el
modal `[D7]`.

**R9.** CUANDO se elija «Volver», el sistema DEBE cerrar el modal sin escribir nada y dejar el
formulario abierto con los datos que se habían introducido `[D7]`.

**R10.** CUANDO se cree o se edite un pedido que alcanza, el sistema DEBE guardarlo `PENDIENTE`
sin mostrar el modal, también si antes estaba `BLOQUEADO`, y DEBE apartar su material según QC-141
`[D8]` `[D10]`.

**R11.** CUANDO la edición de un pedido `PENDIENTE` con material apartado lo guarde `BLOQUEADO`, el
sistema DEBE liberar todo lo apartado en la misma operación, con quien edita como autor `[D8]`
`[D12]`.

**R12.** SI se edita un pedido `EN_CURSO` y con los datos nuevos no alcanza,
ENTONCES el sistema DEBE rechazar la edición con `insufficient_material` sin escribir nada `[D11]`.

### C. Desbloqueo automático

**R13.** CUANDO se registre el alta de un lote —el primero de un producto o uno adicional— o un
ajuste de existencia con cantidad positiva, el sistema DEBE revisar, dentro de la misma petición y
antes de responder, los pedidos `BLOQUEADO` vivos de la empresa del movimiento `[D2]` `[D4]` `[D6]`.

**R14.** CUANDO la revisión encuentre que un pedido bloqueado alcanza, el sistema DEBE, en una sola
operación, apartar su material con la regla de QC-141, pasarlo a `PENDIENTE` y fijar su instante de
reserva al de la revisión; SI cualquiera de esos pasos falla, ENTONCES NO DEBE quedar escrito
ninguno `[D2]` `[D12]`.

**R15.** CUANDO se desbloquee un pedido por la revisión, el sistema DEBE sustituir su importe por
el calculado en ese instante con los lotes de ese momento (QC-141 R59-R61), también cuando el
resultado es «sin importe» `[D3]`.

**R16.** La revisión DEBE recorrer los pedidos bloqueados de la empresa del
más antiguo al más nuevo por fecha de creación, desempatando por identificador, de modo que el
material que entra se aparte antes para el más antiguo `[D2]`.

**R17.** SI un pedido bloqueado sigue sin alcanzar durante la revisión, ENTONCES el sistema DEBE
dejarlo `BLOQUEADO` sin escribir nada sobre él ni sobre su importe `[D2]`.

**R18.** Durante la revisión, el sistema NO DEBE leer, bloquear ni escribir ningún pedido que no
esté en `BLOQUEADO`, ni ningún pedido de otra empresa `[D6]`.

**R19.** CUANDO un ajuste a la baja deje sin cubrir la necesidad de un pedido `PENDIENTE`, el
sistema NO DEBE pasarlo a `BLOQUEADO` `[D5]`.

**R20.** El sistema NO DEBE disparar la revisión con ningún movimiento distinto
de los de R13: ni un ajuste negativo, ni un consumo, ni una entrada por producción, ni la
liberación de material por cancelar, caducar, borrar o editar otro pedido `[D4]` `[D5]`.

**R21.** El sistema NO DEBE ofrecer ninguna acción manual de desbloqueo: un pedido `BLOQUEADO` solo
sale a `PENDIENTE` por R10 o R14, o a `CANCELADO` por R25 `[D2]` `[D11]`.

**R22.** CUANDO la revisión desbloquee un pedido, el sistema DEBE registrar la modificación del
pedido y cada apartado con el instante de la revisión y **sin persona autora** —lo hizo el
sistema—, como hace la caducidad de QC-141 `[D2]`.

**R23.** SI la revisión de un pedido falla, ENTONCES el sistema DEBE dejar ese
pedido como estaba, seguir con los demás, notificar el fallo por el canal definido indicando la
empresa, el pedido y el código del error, y NO DEBE deshacer el movimiento de inventario que la
disparó `[D6]`.

**R24.** MIENTRAS dos operaciones —dos revisiones, o una revisión y una edición o cancelación—
actúen a la vez sobre el mismo pedido bloqueado, el sistema DEBE serializarlas, DEBE desbloquearlo
como mucho una vez y NO DEBE desbloquear un pedido que ya no esté `BLOQUEADO` cuando la revisión lo
tiene bloqueado para escribir `[D2]` `[D12]`.

### D. Transiciones

**R25.** El sistema DEBE permitir cancelar un pedido `BLOQUEADO` con su motivo, con las mismas
reglas que un `PENDIENTE` `[D10]`.

**R26.** El sistema DEBE permitir editar un pedido `BLOQUEADO` con el mismo formulario y las mismas
validaciones que un `PENDIENTE`, recalculando su importe como cualquier edición `[D10]`.

**R27.** El sistema DEBE permitir borrar lógicamente un pedido `BLOQUEADO`
como a un `PENDIENTE` `[D10]` `[D16]`.

**R28.** El sistema NO DEBE llevar un pedido `BLOQUEADO` a `EN_CURSO` ni a `ENTREGADO` por ninguna
vía —arranque del Operador, Finalizar, edición ni ninguna otra—, NI llevar un `EN_CURSO` a
`BLOQUEADO` `[D11]`.

**R29.** CUANDO se ejecute el proceso diario de caducidad, el sistema NO DEBE cancelar ni tocar un
pedido `BLOQUEADO` `[D12]`.

### E. Operador y pantallas

**R30.** CUANDO un Operador consulte sus pedidos asignados, el sistema DEBE incluir los `BLOQUEADO`
que tiene asignados junto a los `PENDIENTE` y `EN_CURSO`, con su estado `[D9]`.

**R31.** MIENTRAS un pedido asignado esté `BLOQUEADO`,
la lista del Operador DEBE mostrarlo marcado como bloqueado y con la acción de entrar deshabilitada,
con el motivo en texto visible —no solo en un tooltip— y un objetivo táctil de al menos 44×44 px
`[D9]`.

**R32.** CUANDO alguien intente arrancar o abrir la ejecución de un pedido `BLOQUEADO`, también
por la URL directa, el sistema DEBE rechazarlo en el service con `order_blocked` sin cambiar el
estado del pedido `[D9]` `[D11]`.

**R33.** El sistema DEBE admitir asignar y desasignar responsables de un pedido `BLOQUEADO` igual
que de uno `PENDIENTE` `[D9]`.

**R34.** El sistema DEBE mostrar el estado `BLOQUEADO` con su etiqueta legible, y ofrecerlo en el
filtro de estado, en la lista de Pedidos y en la vista «Todos» de Asignación `[D9]` `[D13]`.

### F. Modelo y transversales

**R35.** El sistema DEBE guardar `BLOQUEADO` como un valor más del enumerado de estado del pedido,
añadido **después de todos los existentes**, y la lista de estados del dominio DEBE coincidir con
el enumerado valor a valor y en orden `[D13]` `[D14]`.

**R36.** CUANDO se revierta la migración, SI existe algún pedido en `BLOQUEADO`, ENTONCES la
reversión DEBE fallar sin cambiar nada; y si no existe ninguno, DEBE dejar el enumerado y sus
restricciones exactamente como estaban `[D13]`.

**R37.** El sistema NO DEBE añadir ningún permiso al catálogo: crear y editar siguen exigiendo
`pedidos.modificar`, la revisión la desencadena quien registra existencia con
`inventario.modificar` sin exigirle ningún permiso de `pedidos`, y el Operador sigue con
`asignaciones.consultar` `[D15]` (P1).

**R38.** El sistema NO DEBE bloquear, desbloquear ni revisar pedidos de una empresa distinta de la
de quien escribe o de la del movimiento: un alta de lote en la empresa A no desbloquea ningún pedido
de la empresa B `[D6]` `[D15]`.

**R39.** El sistema DEBE nombrar en inglés todo identificador nuevo de base de datos salvo el valor
del enumerado, que sigue la convención en castellano de los estados existentes, NO DEBE borrar
físicamente ningún pedido ni ningún registro de reserva, y NO DEBE añadir ninguna dependencia a
`package.json` `[D16]`.

**R40.** El sistema DEBE tener un test E2E que recorra: crear un pedido sin material suficiente →
modal → «Guardar bloqueado» → el pedido aparece «Bloqueado»; el Operador asignado lo ve sin poder
entrar; un alta de lote que lo cubre lo deja `PENDIENTE` con material apartado `[D2]` `[D7]` `[D9]`.

### Cobertura de la tabla de decisiones

| Decisión | Requisitos |
|---|---|
| D1 qué cuenta como «no alcanza» | R1, R2, R3, R4 |
| D2 salida automática | R13, R14, R16, R17, R21, R22, R24, R40 |
| D3 recalcula importe | R15 |
| D4 movimientos que disparan | R13, R20 |
| D5 ajuste a la baja no bloquea | R19, R20 |
| D6 síncrono, solo `BLOQUEADO` | R13, R18, R23, R38 |
| D7 modal de dos botones | R6, R7, R8, R9, R40 |
| D8 bloquea también al editar | R6, R7, R10, R11 |
| D9 lo ve el Operador | R30, R31, R32, R33, R34, R40 |
| D10 cancelable y editable | R10, R25, R26, R27 |
| D11 no se arranca a mano | R12, R21, R28, R32 |
| D12 reserva (QC-141) | R1, R4, R5, R11, R14, R24, R29 |
| D13 enum | R34, R35, R36 |
| D14 último valor y duplicado vigilado | R35 |
| D15 sin permiso nuevo | R37, R38 |
| D16 borrado e identificadores | R27, R39 |
| D17 decisión central: «no alcanza» sale de la reserva | R1, R3 |
| D18 ningún permiso nuevo, sin cifra | R37 |
| D19 disponible y reserva del bloqueado | R1, R4, R5, R11, R14 |
| D20 fallo de la revisión no deshace el alta | R23 |
| D21 las liberaciones no disparan | R20 |
| D22 `EN_CURSO` que deja de alcanzar | R12 |
| D23 orden de la revisión | R16 |
| D24 `PENDIENTE` existentes no se migran | R1, R19 |
| D25 borrado lógico del bloqueado | R27 |
| D26 QC-150 en lugar de QC-130 | R20, R28 |
| D27 distintivo del bloqueado | R31, R34 |

## Preguntas abiertas

1. **¿Un lote vencido cuenta como existencia?** Depende de la **pregunta 2 del dominio**
   (`docs/architecture.md > Preguntas abiertas del dominio`), «respondida a medias, no cerrada»
   desde QC-90. Hoy no hay vencimiento en `ProductBatch`, así que la cuestión no bloquea esta
   ficha; el día que se cierre, «no alcanza» tendrá que decidir si descuenta lo vencido.

> **Cerradas en F1.4 (2026-09-25).** La 2 (distintivo) y la 3 (fallo de la revisión) de la semilla,
> y las añadidas en F1.2 (P1-P10), pasan a `## Decisiones cerradas`, filas D17-D27.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-21 | ¿Qué cuenta como «no alcanza el inventario»? | **Solo la existencia insuficiente.** La receta pide 2.000 gr y en los lotes con existencia hay 1.500: bloquea. Una receta **sin ingredientes**, o un ingrediente cuya unidad **no comparte base** con la de la receta —gramos contra bidones—, **no** bloquean: eso es un dato incompleto (QC-130), no falta de material, y llamarlo «bloqueado por inventario» sería mentir. |
| 2026-09-21 | ¿Cómo sale de `BLOQUEADO`? | **Automático, no a mano.** Al registrar existencia se revisan los pedidos bloqueados de esa empresa y se desbloquea el que ya se cubre. No hay acción manual de desbloqueo. |
| 2026-09-21 | Al desbloquearse, ¿recalcula el importe? | **Sí, con los lotes de ese día.** ⚠️ **DEROGA** una decisión cerrada de QC-123 —«se recalcula en cada edición… **no cambia por movimientos de inventario**: comprar un lote caro mañana no toca ningún pedido ya creado»—. Aceptado a sabiendas: si al crearlo no había material, el coste real es el del material que finalmente entró. |
| 2026-09-21 | ¿Qué movimientos disparan la revisión? | El **alta de lote** (`opening`) y el **ajuste al alza** (`adjustment` que sube existencia). Los dos son material que aparece. |
| 2026-09-21 | ¿Un ajuste a la baja bloquea un pedido pendiente? | **No.** El efecto es de **una sola dirección**: el inventario solo desbloquea, nunca bloquea un pedido que ya estaba `PENDIENTE`. Decidido así a propósito, para que a nadie se le bloquee solo un pedido que estaba a punto de empezar. |
| 2026-09-21 | ¿Síncrono o diferido? | **Síncrono**, dentro de la operación de inventario, pero recorriendo **únicamente los pedidos en `BLOQUEADO`**; los demás ni se miran. El motivo lo dio el humano: nunca habrá un número alto de pedidos bloqueados, así que el coste no crece sin techo. |
| 2026-09-21 | ¿Qué opciones da el modal? | **Dos botones: «Guardar bloqueado» y «Volver».** Quien crea el pedido puede corregir la cantidad antes de guardar en vez de meter un pedido imposible en la lista. |
| 2026-09-21 | ¿Bloquea también al **editar**? | **Sí, con el mismo modal.** La regla es una sola —un pedido sin material suficiente está bloqueado— y da igual por qué puerta entró. |
| 2026-09-21 | ¿Lo ve el Operador? | **Sí: aparece en su lista de asignados, marcado y con el arranque deshabilitado.** Obliga a ampliar la unión literal `'PENDIENTE' \| 'EN_CURSO'` de `assigned-order-view.ts` y `assigned-order-execution-view.ts`, el arreglo `ESTADOS_DE_TRABAJO` de `list-assigned-orders.ts` y el rechazo de `get-assigned-order-execution.ts`. |
| 2026-09-21 | ¿Es cancelable y editable? | **Las dos cosas, como un `PENDIENTE`.** Cancelar lleva su motivo, como hoy. Editar importa: bajar la cantidad de 200 a 50 puede desbloquearlo sin esperar a que entre material. |
| 2026-09-21 | ¿Se puede arrancar a mano? | **No.** `BLOQUEADO` **solo sale a `PENDIENTE`**, y desde ahí se arranca normal. Ni el Operador ni quien tenga `pedidos.modificar` lo llevan a `EN_CURSO` directo: un `EN_CURSO` tiene que seguir implicando que había con qué producirlo. |
| 2026-09-21 | ¿Hay reserva de material? | **Sí, pero en ficha propia (QC-141), que bloquea a ésta.** Su ciclo quedó decidido aquí: **cancelar libera**, **entregar consume** de verdad, **editar a la baja libera la diferencia**, y la pantalla de inventario muestra **total y disponible**, con lo reservado a la vista. |
| Heredada de QC-33 | ¿Enum de Prisma o tabla propia? | **Enum.** «El conjunto es cerrado a propósito y añadir un valor es una migración». |
| Heredada de QC-33 | ¿Dónde va el valor nuevo? | **El último, después de `CANCELADO`.** `ALTER TYPE … ADD VALUE` solo sabe añadir al final, y en este enum el orden no significa nada de negocio —a diferencia del de la prioridad—. `ORDER_STATUS_VALUES` en `order-classification.ts` es un duplicado a mano vigilado por `module-contract.test.ts` (QC-33 R35), que compara las dos listas valor a valor **y en orden**: se tocan juntas o el gate se pone rojo. |
| Heredada de QC-123 | ¿Nace un permiso nuevo? | **No.** El catálogo cerrado de quince permisos no se enmienda. |
| Heredada de la spec 4 | Borrado e identificadores | Borrado **lógico** con `created_at` / `updated_at` / `deleted_at`, e identificadores de base de datos **en inglés**. |
| 2026-09-25 | **Decisión central (P4):** ¿de dónde sale «no alcanza»? | De la **reserva de QC-141** (`ReservationOutcome` gana `insufficient`), en la misma transacción que aparta; **no** de `calculateIngredientsCost` ni de su `null`. |
| 2026-09-25 | (P1) ¿Cómo se lee D15 si el catálogo ya no tiene quince permisos? | **Ningún permiso nuevo, sin cifra**: el test comprueba que no aparece ningún código, no el tamaño del catálogo. |
| 2026-09-25 | (P2) ¿Contra qué se mide «alcanza» y qué aparta un bloqueado? | Contra el **disponible** de QC-141; un `BLOQUEADO` no aparta nada, libera al bloquearse y aparta al desbloquearse; un producto sin lotes **no alcanza**. |
| 2026-09-25 | (P3, pregunta 3 de la semilla) Si la revisión falla, ¿se deshace el alta del lote? | **No.** Misma petición, una transacción propia por pedido: el pedido que falla queda `BLOQUEADO`, se notifica y el movimiento de inventario se conserva. |
| 2026-09-25 | (P5) ¿Cancelar, caducar, borrar o editar otro pedido disparan la revisión? | **No.** Solo el alta de lote y el ajuste al alza, como dice D4. |
| 2026-09-25 | (P6) ¿Qué pasa al editar un `EN_CURSO` que deja de alcanzar? | Se **rechaza** con `insufficient_material` sin escribir nada. |
| 2026-09-25 | (P7) ¿En qué orden se revisan los bloqueados? | **Del más antiguo al más nuevo** por `created_at`, desempatando por `id`. |
| 2026-09-25 | (P8) ¿Se migran a `BLOQUEADO` los `PENDIENTE` existentes sin material apartado? | **No.** Solo se bloquean si alguien los edita y siguen sin alcanzar. |
| 2026-09-25 | (P9) ¿Se puede borrar lógicamente un `BLOQUEADO`? | **Sí**, como un `PENDIENTE`. |
| 2026-09-25 | (P10) ¿Qué cambia con QC-150 y QC-130 cancelada? | La referencia del Alcance pasa a **QC-150**; el contenido de la presentación no interviene en el bloqueo, la entrada por producción no dispara la revisión y el Finalizar no cambia. |
| 2026-09-25 | (Pregunta 2 de la semilla) ¿Qué distintivo lleva el bloqueado? | Etiqueta «Bloqueado» en Estado; en la lista del Operador, botón «Entrar» deshabilitado con el texto visible «Falta material: no se puede iniciar»; en Pedidos, insignia con la variante `destructive`. |

### Nota de diseño que la acotación deja planteada, no resuelta

La señal que esta ficha necesita **no existe hoy**. `calculateIngredientsCost` (QC-123) devuelve el
**mismo `null`** en los cuatro casos que puede producir —receta sin líneas, unidad sin base común,
existencia insuficiente, y desbordamiento— y su propio comentario dice que **no puede saber cuál
ocurrió**. Como aquí solo bloquea la existencia insuficiente, o esa función aprende a distinguir la
causa o hace falta una comprobación propia. **Es la decisión de diseño central de la ficha** y la
toma `spec_author` en F1.2, no esta acotación.
