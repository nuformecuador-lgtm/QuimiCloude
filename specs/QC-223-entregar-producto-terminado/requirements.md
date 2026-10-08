# QC-223 — entregar-producto-terminado · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** — · **Rama:** `feature/QC-223-entregar-producto-terminado`
>
> **Alcance**
> - El Administrador entrega un pedido TERMINADO desde un sheet lateral. Por cada presentación del
>   pedido elige de qué lote o lotes sale y cuántos envases, y elige el cliente.
> - El pedido admite varias entregas parciales, y cada una puede ir a un cliente distinto.
> - Cuando lo entregado cubre lo pedido en todas las presentaciones, el pedido pasa a ENTREGADO.
> - Cada entrega descuenta la existencia de los lotes elegidos y queda registrada en el libro de
>   movimientos.
> - El sheet muestra lo que falta por entregar en cada presentación.
>
> **Lo que NO entra**
> - Anular una entrega: va en QC-224.
> - La ficha de detalle del producto terminado, con información general, stock, lotes, histórico
>   de producción y de entregas: va en QC-225.
> - Entregar sin pedido, directamente desde el inventario.
> - Precios y facturación.
>
> Sembrado por `/afinar-feature` el 2026-10-08. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

**Leyenda.** `[D<n>]` es la fila n de `## Decisiones cerradas (no reabrir)`, contando desde arriba:
D1 origen de la entrega · D2 entrega parcial · D3 tope · D4 cliente · D5 lote · D6 permiso ·
D7 anular · D8 interfaz · D9 historial · D10 unidad · D11 E2E · D12 punto de entrada (era P1) ·
D13 contenido de conversión (era P2). `[A]` marca una regla de `docs/architecture.md` (aislamiento por
empresa; operación que mueve existencias idempotente y auditable).

**Términos.**
- **Envases pedidos** de una presentación: los envases de la línea del reparto del pedido para esa
  presentación.
- **Envases entregados**: la suma de los envases de esa línea en todas las entregas registradas
  del pedido.
- **Faltan**: envases pedidos menos envases entregados.
- **Lote entregable** de una línea: un lote de la empresa del pedido, del producto terminado vivo de
  la misma receta del pedido y la presentación de la línea. Tiene contenido de envase guardado y al
  menos un envase entero disponible, y da igual de dónde venga: de este pedido, de otro o de una
  importación.
- **Envases disponibles** de un lote: la parte entera de su existencia dividida por el contenido de
  envase del lote [D13].
- **Clave de entrega**: identificador que la pantalla genera para cada borrador y que viaja con la
  entrega.

### Acceso

- **R1** [D6] El catálogo de permisos DEBE contener `entregas.modificar` (módulo `entregas`, acción
  `modificar`), y el seed DEBE asignarlo solo al Administrador. CUANDO se aplica la migración sobre
  una base existente, el rol Administrador DEBE ganar el permiso y ningún otro rol DEBE ganarlo.
- **R2** [D6] SI el actor no tiene `entregas.modificar`, ENTONCES el servidor DEBE responder
  `unauthorized` a la lectura del contenido de la entrega, a la búsqueda de clientes para entregar
  y al registro de una entrega. DEBE hacerlo antes de validar la entrada y antes de leer o escribir
  nada.
- **R3** [D6] El servidor DEBE decidir el acceso por el permiso y nunca por el rol: un actor con
  `entregas.modificar` y un rol distinto de Administrador DEBE ser aceptado, y un Administrador sin
  ese permiso en su conjunto DEBE ser rechazado.
- **R4** [D1, D6, D12] MIENTRAS el actor tenga `entregas.modificar`, el menú de fila de la pantalla
  de Pedidos DEBE ofrecer la acción «Entregar» en los pedidos `TERMINADO` y en ningún otro estado.
  SI el actor no tiene el permiso, ENTONCES la acción NO DEBE existir en el DOM.

### Lectura del sheet

- **R5** [D1, A] CUANDO se pide el contenido de la entrega de un pedido, SI el pedido no existe, está
  borrado o es de otra empresa, ENTONCES el servidor DEBE responder `order_not_found` en los tres
  casos. SI existe pero no está `TERMINADO`, ENTONCES DEBE responder `action_not_allowed`. En los
  dos casos NO DEBE devolver datos del pedido.
- **R6** [D9, D3] CUANDO el usuario abre el sheet de un pedido `TERMINADO`, el sheet DEBE mostrar,
  por cada presentación del pedido, su nombre, los envases pedidos, los entregados y los que
  faltan. NO DEBE mostrar ningún listado de las entregas anteriores.
- **R7** [D5, A] MIENTRAS a una presentación le falten envases, el sheet DEBE listar sus lotes
  entregables, con el código de lote, los envases disponibles, la fecha de entrada y la de
  vencimiento si existe. NO DEBE listar lotes sin un envase entero, lotes de otra receta o
  presentación, de otra empresa ni de un producto dado de baja.
- **R8** [D3] MIENTRAS a una presentación no le falten envases, el sheet DEBE mostrarla como
  completa y sin ningún campo de envases.
- **R9** [D4] CUANDO el sheet se abre sin borrador guardado, el campo de cliente DEBE venir
  precargado con el cliente del pedido si existe y está vivo. SI el pedido no tiene cliente o el
  suyo está dado de baja, ENTONCES el campo DEBE quedar vacío.
- **R10** [D4, A] El selector de cliente del sheet DEBE ofrecer solo clientes vivos de la empresa
  del actor.

### Validación en el sheet

- **R11** [D3] MIENTRAS la suma de los envases escritos en una presentación supere los que le
  faltan, el sheet DEBE mostrar el aviso de exceso en esa presentación y NO DEBE enviar la entrega.
- **R12** [D3] MIENTRAS los envases escritos en un lote superen sus envases disponibles, el sheet
  DEBE mostrar el aviso de exceso en ese lote y NO DEBE enviar la entrega.
- **R13** [D10] SI un campo de envases contiene algo que no sea un entero no negativo, ENTONCES el
  sheet DEBE mostrar el aviso de envases enteros en ese campo y NO DEBE enviar la entrega.
- **R14** [D4] SI el usuario confirma sin cliente elegido, ENTONCES el sheet DEBE mostrar el aviso
  de cliente obligatorio y NO DEBE enviar la entrega.
- **R15** [D2] SI el usuario confirma con todos los campos de envases vacíos o en cero, ENTONCES el
  sheet DEBE mostrar el aviso de que no hay nada que entregar y NO DEBE enviar la entrega.
- **R16** [D3] El sistema DEBE calcular los envases que faltan y comprobar el tope por presentación
  y por lote con la misma función pura en el sheet y en el servidor.

### Registro de la entrega (servidor)

- **R17** [D1, A] CUANDO el servidor recibe una entrega, DEBE bloquear el pedido y comprobar sobre la
  fila bloqueada que sigue vivo, que es de la empresa del actor y que está `TERMINADO`. SI no
  existe, está borrado o es de otra empresa, ENTONCES DEBE responder `order_not_found`. SI no está
  `TERMINADO`, ENTONCES DEBE responder `action_not_allowed`. En ningún caso DEBE escribir nada.
- **R18** [D3] SI la suma de los envases pedidos para una presentación supera los que le faltan,
  calculados con el pedido bloqueado, ENTONCES el servidor DEBE responder
  `delivery_exceeds_remaining` sin escribir nada.
- **R19** [D5, A] SI un lote de la entrega no existe, es de otra empresa, no es del producto
  terminado de la receta del pedido y la presentación de su línea, o no tiene contenido de envase,
  ENTONCES el servidor DEBE responder `batch_not_found` en todos esos casos, sin escribir nada.
- **R20** [D3] SI los envases pedidos a un lote superan sus envases disponibles, leídos con el
  producto bloqueado, ENTONCES el servidor DEBE responder `delivery_batch_insufficient` sin
  escribir nada de la entrega entera.
- **R21** [D4, A] SI el cliente de la entrega no existe, está dado de baja o es de otra empresa,
  ENTONCES el servidor DEBE responder `customer_not_found` sin escribir nada.
- **R22** SI la entrada no tiene la forma acordada, ENTONCES el servidor DEBE responder
  `invalid_input` sin escribir nada. Son casos de forma no acordada: un identificador sin forma de
  uuid, envases no enteros o menores que uno, la misma línea y lote repetidos, ninguna línea, una
  línea del reparto que no es del pedido, un campo de más o un campo ausente.
- **R23** [D10] CUANDO el servidor aplica una entrega, DEBE descontar de cada lote elegido sus
  envases por el contenido de envase del lote, en la unidad base del lote [D13]. DEBE recalcular la
  existencia del producto terminado como la suma de sus lotes.
- **R24** [D10, A] CUANDO el servidor aplica una entrega, DEBE escribir en el libro de movimientos,
  en la misma transacción, un asiento de tipo entrega por cada lote. El asiento DEBE llevar la
  cantidad descontada en negativo, el pedido, la entrega a la que pertenece, el autor y el
  instante, y ningún motivo.
- **R25** [D4, D9, A] CUANDO el servidor aplica una entrega, DEBE guardarla con el pedido, el
  cliente elegido, el autor y el instante. Por cada lote DEBE guardar la línea del reparto, el lote,
  los envases y la cantidad descontada. NO DEBE cambiar el cliente del pedido.
- **R26** [D2] CUANDO, tras aplicar una entrega, a alguna presentación del pedido le sigan faltando
  envases, el pedido DEBE seguir `TERMINADO`.
- **R27** [D1, D2] CUANDO, tras aplicar una entrega, no le falten envases a ninguna presentación del
  pedido, el servidor DEBE pasar el pedido a `ENTREGADO` en la misma transacción. DEBE conservar su
  `finishedAt`, quién empacó y quién acondicionó.
- **R28** [D3] CUANDO dos entregas del mismo pedido se confirman a la vez y juntas superan lo que
  falta, el servidor DEBE aplicar exactamente una y rechazar la otra. Responde
  `delivery_exceeds_remaining`, o `action_not_allowed` si la primera dejó el pedido `ENTREGADO`.
  CUANDO dos entregas de pedidos distintos piden a la vez al mismo lote más de lo que tiene, el
  servidor DEBE aplicar exactamente una y responder `delivery_batch_insufficient` a la otra. En
  ningún caso la existencia de un lote DEBE quedar negativa.
- **R29** [A] CUANDO llega una entrega cuya clave de entrega ya está registrada en la empresa, el
  servidor NO DEBE escribir nada y DEBE responder que la entrega ya estaba registrada, con el estado
  actual del pedido de esa entrega. *(Aprobado por el humano en F1.3, 2026-10-08. Enmienda,
  decisión del humano 2026-10-08: antes decía «con el mismo estado del pedido que dejó la primera»;
  si una entrega parcial se reintenta después de que otra completó el pedido, responde `ENTREGADO`.)*
- **R30** [A] SI cualquier paso de una entrega falla, ENTONCES NO DEBE quedar escrito nada de ella:
  ni entrega, ni línea, ni asiento, ni cambio de existencia, ni cambio de estado del pedido.
- **R31** [A, D10] La base DEBE rechazar cada uno de estos casos:
  - un asiento de entrega sin pedido, sin entrega, con motivo o con cantidad no negativa;
  - una referencia a entrega en un asiento que no es de entrega;
  - dos asientos de entrega del mismo lote en la misma entrega;
  - una línea de entrega con envases o cantidad menores o iguales a cero;
  - una entrega, una línea o un asiento cuya empresa no coincida con la del pedido, la del cliente,
    la del lote o la del usuario que la registra (este último caso, decisión del humano
    2026-10-08);
  - dos entregas con la misma clave en la misma empresa.
- **R32** [D7] El sistema NO DEBE ofrecer ningún camino de aplicación que modifique o borre una
  entrega, una línea de entrega o su asiento: ningún caso de uso, Server Action ni control de UI.

### Después de enviar

- **R33** [D8] CUANDO el servidor aplica la entrega o responde que ya estaba registrada, el sheet DEBE
  borrar el borrador de ese pedido, cerrarse, avisar con un toast y refrescar la lista. SI el pedido
  quedó `ENTREGADO`, ENTONCES su fila DEBE mostrar «Entregado».
- **R34** [D8] CUANDO el servidor rechaza la entrega con `delivery_exceeds_remaining` o
  `delivery_batch_insufficient`, el sheet DEBE seguir abierto, mostrar el mensaje del rechazo,
  volver a leer los envases que faltan y los lotes, y conservar el borrador.

### Borrador

- **R35** [D8] MIENTRAS el sheet esté abierto, cada cambio de cliente o de envases DEBE guardarse en
  `localStorage` bajo una clave propia del pedido, junto con la clave de entrega. CUANDO el usuario
  cierra el sheet sin cancelar (botón de cerrar, tecla Escape o clic fuera) o recarga la página, y
  vuelve a abrir el sheet del mismo pedido, el sheet DEBE restaurar el cliente, los envases y la
  clave de entrega del borrador.
- **R36** [D8] CUANDO el usuario pulsa «Cancelar», el sheet DEBE borrar el borrador de ese pedido y
  cerrarse.
- **R37** [D8] CUANDO el sheet restaura un borrador, DEBE descartar los envases de los lotes que ya no
  se ofrecen y mostrar el aviso de borrador ajustado. DEBE aplicar R11 y R12 a los valores
  restaurados.

### Historial del lote

- **R38** [D9, D10] CUANDO el usuario abre el historial de un lote, el sistema DEBE mostrar cada
  asiento de entrega con el tipo «Entrega a cliente», su cantidad en negativo, el número de pedido,
  el autor y la fecha.

### Verificación y dependencias

- **R39** [D11] El sistema DEBE tener un E2E que, contra el navegador y Postgres reales, cubra lo
  siguiente:
  - una entrega parcial de un pedido `TERMINADO` con dos presentaciones, desde dos lotes, a un
    cliente distinto del del pedido, comprobando en Postgres la existencia de los lotes, los asientos,
    la entrega y que el pedido sigue `TERMINADO`;
  - el borrador sobrevive a una recarga;
  - una segunda entrega que completa el pedido y lo deja `ENTREGADO`;
  - un usuario sin `entregas.modificar` no ve la acción.
- **R40** La feature NO DEBE añadir ninguna dependencia a `package.json`.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| D1 origen de la entrega | R4, R5, R17, R27 |
| D2 entrega parcial | R15, R26, R27 |
| D3 tope | R6, R8, R11, R12, R16, R18, R20, R28 |
| D4 cliente | R9, R10, R14, R21, R25 |
| D5 lote | R7, R19 |
| D6 permiso | R1, R2, R3, R4 |
| D7 anular fuera | R32 |
| D8 interfaz | R33, R34, R35, R36, R37 |
| D9 historial | R6, R25, R38 |
| D10 unidad | R13, R23, R24, R31, R38 |
| D11 E2E | R39 |
| D12 punto de entrada | R4 |
| D13 contenido de conversión | R23 |

R27 enmienda la primera frase de QC-215 R33 («ningún camino de aplicación escribe `ENTREGADO`»):
la entrega que completa el pedido es ese camino. *(Enmienda aprobada por el humano en F1.3,
2026-10-08; `design.md > 8`.)*

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-08 | ¿De dónde sale la entrega? | De un pedido TERMINADO. Al completarse, el pedido pasa a ENTREGADO, que es la entrega al cliente (hereda QC-215 D11 y QC-156). No hay entrega sin pedido. |
| 2026-10-08 | ¿Entrega parcial? | Sí, en varias entregas. El pedido sigue TERMINADO hasta que lo entregado cubre lo pedido en todas las presentaciones; entonces pasa solo a ENTREGADO. |
| 2026-10-08 | ¿Se puede entregar más de lo pedido? | No. El tope por presentación son los envases pedidos menos los ya entregados, y nunca más de lo que haya en el lote. |
| 2026-10-08 | ¿Cliente? | Obligatorio en cada entrega. Se precarga el del pedido y se puede cambiar. Cada entrega lleva su cliente, que puede ser distinto en cada una. El cliente del pedido no cambia. No se ofrecen clientes borrados (hereda QC-156). |
| 2026-10-08 | ¿De qué lote sale? | Lo elige el Administrador, entre cualquier lote con existencia de ese producto terminado (misma receta y presentación), venga de este pedido, de otro o de una importación. Esto se aparta del «más antiguo primero» de QC-141. |
| 2026-10-08 | ¿Quién puede entregar? | Un permiso nuevo, `entregas.modificar`, que en el seed solo tiene el Administrador. Se comprueba en el caso de uso, por permiso y nunca por rol (hereda QC-168). |
| 2026-10-08 | ¿Anular una entrega? | Fuera de esta feature: va en QC-224. |
| 2026-10-08 | ¿Interfaz? | Un sheet lateral. El borrador se guarda en localStorage para no perderse al cerrar o recargar, y se limpia al guardar o al cancelar. |
| 2026-10-08 | ¿Historial de entregas? | En el sheet solo se ve lo que falta por entregar. El detalle de cada entrega queda guardado; su pantalla es QC-225. |
| 2026-10-08 | ¿Unidad de la existencia? | La existencia sigue en unidades base, con un producto por receta y presentación (hereda QC-150). La entrega se pide en envases y se convierte con el contenido de la presentación. |
| 2026-10-08 | ¿E2E? | Obligatorio: es un movimiento de inventario (hereda QC-213 D10). |
| 2026-10-08 | ¿Punto de entrada del sheet? (era P1) | La acción «Entregar» va en el menú de fila de `/pedidos`, solo en pedidos TERMINADO y solo con `entregas.modificar` (R4). Humano, F1.3. |
| 2026-10-08 | ¿Con qué contenido se convierten los envases de un lote? (era P2) | Con el contenido de envase guardado en cada lote (`product_batches.package_content`), no con el contenido vigente de la presentación (R23). Humano, F1.3. |
