# QC-224 — anular-entrega · requirements.md

> **Zona:** fullstack · **Complejidad:** medium · **depends_on:** QC-223 (done) · **Rama:** feature/QC-224-anular-entrega
>
> **Alcance.** El admin anula, desde la lista de entregas del pedido, una entrega registrada en QC-223:
> completa o solo algunas presentaciones (cada presentación anulada se anula entera, en todos sus lotes).
> Los paquetes vuelven a los lotes de los que salieron, con un movimiento de inventario compensatorio.
> Si el pedido estaba ENTREGADO, vuelve a TERMINADO con lo anulado otra vez pendiente. La anulación
> guarda quién, cuándo y un motivo obligatorio.
>
> **Lo que NO entra:**
> - Anular solo una parte de los paquetes de una presentación (p. ej. 3 de 10 galones): no entra.
> - El historial de entregas en el detalle de producto terminado: QC-225 (reutiliza la lista de este spec).
> - Cancelar un pedido con entregas: no entra; no cambia lo que ya existe.
>
> Sembrado por `/afinar-feature` el 2026-10-09. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

**Leyenda.** `[D<n>]` es la fila n de `## Decisiones cerradas (no reabrir)`, contando desde arriba:
D1 pedido ENTREGADO · D2 parcial por presentación · D3 cantidad entera de la presentación ·
D4 permiso · D5 desde dónde · D6 motivo · D7 plazo · D8 no se toca la entrega · D9 identificadores y
borrado · D10 E2E · D11 idempotencia · D12 lote con producto dado de baja (era P1) · D13 permiso de
la lista (era P2). `[A]` marca una regla de `docs/architecture.md` (aislamiento por empresa;
operación que mueve existencias idempotente y auditable).

**Términos.**
- **Entrega**: una entrega registrada por QC-223, con sus líneas (una por lote y presentación).
- **Presentación de una entrega**: el conjunto de líneas de esa entrega que comparten línea del
  reparto del pedido.
- **Anular una presentación de una entrega**: anular todas sus líneas a la vez [D3].
- **Presentación anulada**: la que ya tiene sus líneas anuladas. Una presentación se anula una sola
  vez.
- **Anulación**: el registro nuevo que deja una anulación, con su motivo, su autor, su instante y
  las líneas de entrega que anula.
- **Clave de anulación**: identificador que la pantalla genera al abrir el diálogo de anular y que
  viaja con la anulación [D11].
- **Envases entregados** (redefine el término de QC-223): la suma de los envases de las líneas de
  entrega del pedido que no están anuladas.

### Acceso

- **R1** [D4] El catálogo de permisos DEBE contener `entregas.anular` (módulo `entregas`, acción
  `anular`), y el seed DEBE asignarlo solo al Administrador. CUANDO se aplica la migración sobre una
  base existente, el rol Administrador DEBE ganar el permiso y ningún otro rol DEBE ganarlo.
- **R2** [D4] SI el actor no tiene `entregas.anular`, ENTONCES el servidor DEBE responder
  `unauthorized` al registro de una anulación. DEBE hacerlo antes de validar la entrada y antes de
  leer o escribir nada.
- **R3** [D4] El servidor DEBE decidir el acceso a la anulación por el permiso y nunca por el rol:
  un actor con `entregas.anular` y un rol distinto de Administrador DEBE ser aceptado, y un
  Administrador sin ese permiso en su conjunto DEBE ser rechazado.
- **R4** [D5, D13] SI el actor no tiene `pedidos.consultar`, ENTONCES el servidor DEBE responder
  `unauthorized` a la lectura de la lista de entregas de un pedido, antes de leer nada.

### Lista de entregas del pedido

- **R5** [D5] El menú de fila de la pantalla de Pedidos DEBE ofrecer la acción «Entregas» en los
  pedidos `TERMINADO` y `ENTREGADO`, y en ningún otro estado.
- **R6** [D5, A] CUANDO se pide la lista de entregas de un pedido, SI el pedido no existe, está
  borrado o es de otra empresa, ENTONCES el servidor DEBE responder `order_not_found` en los tres
  casos, sin devolver datos.
- **R7** [D5] CUANDO el usuario abre la lista de entregas de un pedido, la lista DEBE mostrar cada
  entrega del pedido, de la más reciente a la más antigua, con su fecha, su cliente y su autor
  (aunque el cliente o el autor estén dados de baja). Por cada presentación de la entrega DEBE
  mostrar su nombre, sus envases y, por cada lote, el código de lote y sus envases.
- **R8** [D5] SI el pedido no tiene ninguna entrega, ENTONCES la lista DEBE mostrar el aviso de
  pedido sin entregas.
- **R9** [D6, D8] MIENTRAS una presentación de una entrega esté anulada, la lista DEBE mostrarla
  marcada como anulada, con el motivo, el autor y la fecha de su anulación, junto a sus envases y
  lotes originales.
- **R10** [D4, D5, D7] La lista DEBE ofrecer la acción «Anular» en una entrega solo MIENTRAS se
  cumplan las tres condiciones: el actor tiene `entregas.anular`, el pedido está `TERMINADO` o
  `ENTREGADO` y a la entrega le queda al menos una presentación sin anular. SI el actor no tiene el
  permiso, ENTONCES la acción NO DEBE existir en el DOM.

### Diálogo de anulación

- **R11** [D2] CUANDO el usuario pulsa «Anular» en una entrega, el diálogo DEBE listar las
  presentaciones de esa entrega que no están anuladas, cada una con sus envases y todas marcadas, y
  DEBE dejar desmarcar cualquiera. NO DEBE listar las presentaciones ya anuladas ni ofrecer ningún
  campo de cantidad [D3].
- **R12** [D2] SI el usuario confirma sin ninguna presentación marcada, ENTONCES el diálogo DEBE
  mostrar el aviso de que no hay nada que anular y NO DEBE enviar la anulación.
- **R13** [D6] SI el usuario confirma con el motivo vacío o solo con espacios, ENTONCES el diálogo
  DEBE mostrar el aviso de motivo obligatorio y NO DEBE enviar la anulación. SI el motivo supera los
  500 caracteres, ENTONCES DEBE mostrar el aviso de motivo demasiado largo y NO DEBE enviarla.
- **R14** [D11] CUANDO se abre el diálogo, la pantalla DEBE generar una clave de anulación nueva, y
  DEBE enviar esa misma clave en cada confirmación hasta que el diálogo se cierre.
- **R15** [D1, D5] CUANDO el servidor aplica la anulación o responde que ya estaba registrada, el
  diálogo DEBE cerrarse, avisar con un toast, volver a leer la lista y refrescar la pantalla de
  Pedidos. SI el pedido quedó `TERMINADO`, ENTONCES su fila DEBE mostrar «Terminado».
- **R16** [D2] CUANDO el servidor rechaza la anulación con `delivery_already_voided`, el diálogo DEBE
  mostrar el mensaje del rechazo y la lista DEBE volver a leerse. CUANDO la rechaza con cualquier
  otro error, el diálogo DEBE seguir abierto con el mensaje y conservar lo marcado y el motivo.

### Registro de la anulación (servidor)

- **R17** SI la entrada no tiene la forma acordada, ENTONCES el servidor DEBE responder
  `invalid_input` sin escribir nada. Son casos de forma no acordada: un identificador de entrega o
  una clave sin forma de uuid, ninguna presentación, una presentación repetida o sin forma de uuid,
  un motivo que tras recortar espacios queda vacío o supera los 500 caracteres, un campo de más o un
  campo ausente.
- **R18** [A] SI la entrega no existe o es de otra empresa, ENTONCES el servidor DEBE responder
  `delivery_not_found` en los dos casos, sin escribir nada.
- **R19** [D7, A] CUANDO el servidor recibe una anulación, DEBE bloquear el pedido de la entrega y
  comprobar sobre la fila bloqueada que sigue vivo y que está `TERMINADO` o `ENTREGADO`. SI no
  existe o está borrado, ENTONCES DEBE responder `order_not_found`. SI está en cualquier otro
  estado, `CANCELADO` incluido, ENTONCES DEBE responder `action_not_allowed`. En ningún caso DEBE
  escribir nada.
- **R20** [D2] SI alguna presentación pedida no es una presentación de esa entrega, ENTONCES el
  servidor DEBE responder `invalid_input` sin escribir nada.
- **R21** [D2, D3] SI alguna presentación pedida ya está anulada en esa entrega, ENTONCES el servidor
  DEBE responder `delivery_already_voided` y NO DEBE anular ninguna de las otras presentaciones
  pedidas.
- **R22** [D3, D6, A] CUANDO el servidor aplica una anulación, DEBE guardarla con la entrega, el
  motivo sin espacios al principio ni al final, el autor y el instante. DEBE anular todas las líneas
  de las presentaciones pedidas, en todos sus lotes, y ninguna línea de las presentaciones no
  pedidas.
- **R23** [D3, A] CUANDO el servidor aplica una anulación, DEBE sumar a la existencia de cada lote de
  las líneas anuladas exactamente la cantidad que descontó esa línea de entrega, en la unidad base
  del lote. DEBE recalcular la existencia de cada producto terminado afectado como la suma de sus
  lotes.
- **R24** [D8, A] CUANDO el servidor aplica una anulación, DEBE escribir en el libro de movimientos,
  en la misma transacción, un asiento de tipo anulación de entrega por cada línea anulada. El
  asiento DEBE llevar la cantidad devuelta en positivo, el lote, el pedido, la anulación a la que
  pertenece, el autor y el instante, y ningún motivo de ajuste.
- **R25** [D8] CUANDO el servidor aplica una anulación, la entrega, sus líneas y sus asientos de
  entrega DEBEN quedar sin cambios en todas sus columnas.
- **R26** [D1, D2] CUANDO el servidor aplica una anulación, los envases entregados de cada
  presentación anulada DEBEN bajar exactamente en los envases anulados. CUANDO el usuario abre
  después el sheet de entrega de QC-223, ese sheet DEBE mostrar esos envases otra vez como
  pendientes y DEBE admitir entregarlos de nuevo.
- **R27** [D1] CUANDO el servidor aplica una anulación sobre un pedido `ENTREGADO`, DEBE pasarlo a
  `TERMINADO` en la misma transacción y DEBE conservar su `finishedAt`, quién empacó y quién
  acondicionó. CUANDO la aplica sobre un pedido `TERMINADO`, el pedido DEBE seguir `TERMINADO`.
- **R28** [D11, A] CUANDO llega una anulación cuya clave ya está registrada en la empresa, el
  servidor NO DEBE escribir nada y DEBE responder que la anulación ya estaba registrada, con el
  estado actual del pedido de esa anulación.
- **R29** [A] SI cualquier paso de una anulación falla, ENTONCES NO DEBE quedar escrito nada de ella:
  ni anulación, ni línea de anulación, ni asiento, ni cambio de existencia, ni cambio de estado del
  pedido.
- **R30** [D2, A] CUANDO dos anulaciones que comparten una presentación de la misma entrega se
  confirman a la vez, el servidor DEBE aplicar exactamente una y responder
  `delivery_already_voided` a la otra. CUANDO una anulación y una entrega del mismo pedido se
  confirman a la vez, el servidor DEBE aplicar las dos una detrás de otra o rechazar una con su
  código. En todos los casos, la existencia de cada lote DEBE ser igual a la suma de sus asientos, y
  ningún lote DEBE quedar con existencia negativa.
- **R31** [D12] SI el producto terminado de un lote de la entrega está dado de baja cuando se anula,
  ENTONCES el servidor DEBE devolver igual los envases a ese mismo lote, con su asiento, y DEBE
  recalcular la existencia de ese producto. NO DEBE rechazar la anulación por eso.

### Datos

- **R32** [D8, D9, A] La base DEBE rechazar cada uno de estos casos:
  - un asiento de anulación de entrega sin pedido, sin anulación, con motivo o con cantidad no
    positiva;
  - una referencia a anulación en un asiento que no es de anulación de entrega;
  - dos asientos de anulación del mismo lote en la misma anulación;
  - una segunda línea de anulación para la misma línea de entrega;
  - una línea de anulación cuya línea de entrega no es de la entrega anulada;
  - una anulación, una línea de anulación o un asiento cuya empresa no coincida con la de la
    entrega, la del lote o la del usuario que la registra;
  - dos anulaciones con la misma clave en la misma empresa;
  - una anulación con el motivo vacío o solo con espacios.
- **R33** [D8, D9] El sistema NO DEBE ofrecer ningún camino de aplicación que modifique o borre una
  anulación, una línea de anulación o su asiento: ningún caso de uso, Server Action ni control de
  UI. QC-223 R32 sigue vigente: el único caso de uso y la única Server Action que anulan una entrega
  solo insertan filas.
- **R34** [D9] Las tablas, columnas y valores de enumerado nuevos DEBEN tener nombres en inglés.

### Historial del lote

- **R35** [D8] CUANDO el usuario abre el historial de un lote, el sistema DEBE mostrar cada asiento
  de anulación de entrega con el tipo «Anulación de entrega», su cantidad en positivo, el número de
  pedido, el autor y la fecha.

### Verificación y dependencias

- **R36** [D10] El sistema DEBE tener un E2E que, contra el navegador y Postgres reales, cubra lo
  siguiente:
  - el Administrador anula una presentación de una entrega de un pedido `ENTREGADO` con motivo,
    comprobando en Postgres la existencia de los lotes, los asientos, la anulación, la entrega
    intacta y el pedido `TERMINADO`;
  - la lista muestra la presentación anulada con su motivo, y el sheet de entrega la vuelve a
    ofrecer como pendiente;
  - el motivo vacío no envía nada;
  - un usuario sin `entregas.anular` no ve la acción «Anular».
- **R37** La feature NO DEBE añadir ninguna dependencia a `package.json`.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| D1 pedido ENTREGADO vuelve a TERMINADO | R15, R26, R27 |
| D2 parcial por presentación | R11, R12, R16, R20, R21, R26, R30 |
| D3 la presentación entera, en todos sus lotes | R11, R21, R22, R23 |
| D4 permiso `entregas.anular` | R1, R2, R3, R10 |
| D5 lista de entregas del pedido | R4, R5, R6, R7, R8, R10, R15 |
| D6 motivo obligatorio, con quién y cuándo | R9, R13, R22 |
| D7 sin plazo salvo CANCELADO | R10, R19 |
| D8 la entrega no se toca; registro nuevo y asiento que compensa | R9, R24, R25, R32, R33, R35 |
| D9 inglés y sin borrado físico | R32, R33, R34 |
| D10 E2E | R36 |
| D11 clave de anulación del cliente | R14, R28 |
| D12 lote con producto dado de baja (era P1) | R31 |
| D13 permiso de la lista (era P2) | R4 |

**Sobre D7.** Un pedido con entregas solo puede estar `TERMINADO` o `ENTREGADO`: ninguno de los dos
se cancela (`order-cancellation.ts`) ni se borra (`delete-order.ts`). R19 rechaza cualquier otro
estado, así que «mientras no esté `CANCELADO`» queda cubierto sin depender de que eso siga siendo así.

**Sobre QC-223 R32 y su guardia.** La anulación no modifica ni borra nada de la entrega (R25), así que
QC-223 R32 se cumple tal cual. Lo que sí cambia es su barrido
(`tests/unit/pedidos/order-delivery-append-only.test.ts`): hoy da rojo con cualquier nombre exportado
que junte `void` y `Deliver`. Se enmienda para admitir exactamente el caso de uso y la Server Action
de este spec, y se amplía a las tablas nuevas (`design.md > 8`).

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-09 | ¿Qué pasa con un pedido ENTREGADO al anular? | Vuelve a TERMINADO; lo anulado vuelve a contar como pendiente y se puede entregar de nuevo. |
| 2026-10-09 | ¿Completa o parcial? | Parcial por presentación: se eligen las presentaciones a anular (o todas). |
| 2026-10-09 | Dentro de una presentación | Se anula toda su cantidad, en todos sus lotes. No hay cantidad libre. |
| 2026-10-09 | ¿Quién puede? | Permiso nuevo `entregas.anular`, sembrado solo al Administrador (patrón de `entregas.modificar`, QC-223). |
| 2026-10-09 | ¿Desde dónde? | Lista de entregas del pedido, con acción Anular por entrega. QC-225 la reutiliza. |
| 2026-10-09 | Motivo | Obligatorio, texto libre; queda junto a quién y cuándo. |
| 2026-10-09 | Plazo | Sin límite, mientras el pedido no esté CANCELADO. |
| 2026-10-09 | ¿Se borra o modifica la entrega? | No. La entrega y sus movimientos no se tocan (R32 de QC-223); la anulación es un registro nuevo más un movimiento que compensa. Heredado de QC-223 y QC-18. |
| 2026-10-09 | Identificadores y borrado | En inglés, borrado lógico (heredado de la 4). |
| 2026-10-09 | ¿E2E? | Sí: mueve inventario (flujo crítico). |
| 2026-10-09 | Idempotencia | Clave de anulación generada en el cliente, como `deliveryKey` en QC-223. |
| 2026-10-09 | ¿Y si el lote de origen fue dado de baja tras la entrega? (era P1) | Un lote no tiene borrado lógico; lo que se da de baja es su producto terminado. Se devuelven igual los envases al mismo lote, con su asiento, y se recalcula ese producto; no se bloquea la anulación (R31). Humano, F1.3. |
| 2026-10-09 | ¿Qué permiso exige ver la lista de entregas? (era P2) | `pedidos.consultar`, el de la pantalla de Pedidos. «Anular» sigue exigiendo `entregas.anular` (R4, R10). Humano, F1.3. |
