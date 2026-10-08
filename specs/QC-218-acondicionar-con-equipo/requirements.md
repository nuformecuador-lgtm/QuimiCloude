# QC-218 — acondicionar-con-equipo · requirements.md

> Zona: fullstack · Complejidad: — (la asigna el leader en F1.0) · depends_on: QC-217 · Rama: feature/QC-218-acondicionar-con-equipo
>
> **Alcance.** En las acciones del detalle de un pedido por acondicionar aparece
> **Acondicionar**. Abre un modal donde se arma el equipo y se **comienza**. Después, en el mismo
> detalle, **Terminar**, con modal de confirmación. Los dos botones esperan 5 s con cuenta
> regresiva antes de habilitarse.
>
> **Lo que NO entra.** Los datos de lote y la regla de que Terminar los exige (QC-219). El
> registro en el log de ejecución (QC-82). Los estados (QC-215).
>
> Sembrado por `/afinar-feature` el 2026-10-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). Cada requisito cita entre corchetes las filas de «Decisiones
> cerradas» que lo originan, numeradas en el orden de la tabla:
>
> - **[D1]** quién comienza y termina · **[D2]** qué se elige · **[D3]** quién puede estar ·
>   **[D4]** cuándo se define;
> - **[D5]** qué hace el equipo · **[D6]** bloqueo de 5 s · **[D7]** confirmación antes de terminar
>   · **[D8]** autorización en el service · **[D9]** E2E · **[D10]** dependencia;
> - **[D11]** Terminar lleva a `TERMINADO` (enmienda D7) · **[D12]** el equipo se ve en el detalle
>   · **[D13]** tope de 25 en el selector · **[D14]** propuestas N1–N4 y enmiendas a lo mergeado.
>
> Contexto mergeado que esta ficha da por hecho (QC-215, QC-216 y QC-217, en `dev`):
>
> - la cadena es `POR_ACONDICIONAR → EN_ACONDICIONAMIENTO → TERMINADO → ENTREGADO`. Terminar el
>   acondicionamiento deja `TERMINADO` con `finishedAt` (QC-215 R12, D11), y ninguna vía de la
>   aplicación escribe `ENTREGADO` (QC-215 R33);
> - los casos de uso comenzar y terminar el acondicionamiento existen sin pantalla (QC-215 R8–R16);
> - el detalle `/asignacion/acondicionamiento/<id>` existe en solo lectura (QC-217 R15–R18).
>
> Vocabulario fijo:
>
> - «el permiso» = `acondicionamiento.modificar` (QC-216). «El acondicionador» = un actor con el
>   permiso.
> - «quien acondiciona» = la persona guardada en el pedido al comenzar (QC-215).
> - «el detalle» = la pantalla `/asignacion/acondicionamiento/<id>` de QC-217.
> - «Administrador» = una persona cuyo rol tiene `pedidos.consultar`. Es la misma regla por permiso
>   con la que la asignación excluye responsables (QC-87, `canBeResponsible`). Con los roles de
>   semilla, solo el rol `Administrador` la cumple (`design.md > 6`, N1, D14).
> - «persona elegible» = persona viva de la empresa del actor, con cuenta efectivamente activa y que
>   no es Administrador. El propio actor y los demás acondicionadores son elegibles.
> - «el equipo» = las personas guardadas en el pedido al comenzar, cada una con su origen: suelta,
>   o venida de un grupo de trabajo con la referencia al grupo y el nombre que tenía entonces.
> - «la espera» = el botón principal de un modal deshabilitado con cuenta regresiva de 5 s.

### Acciones del detalle

**R1.** MIENTRAS un acondicionador vea el detalle de un pedido `POR_ACONDICIONAR`, la pantalla DEBE
ofrecer el botón «Acondicionar» y NO DEBE ofrecer «Terminar». [D1, D4]

**R2.** MIENTRAS un acondicionador vea el detalle de un pedido `EN_ACONDICIONAMIENTO` del que es
quien acondiciona, la pantalla DEBE ofrecer el botón «Terminar» y NO DEBE ofrecer «Acondicionar».
[D1, D7]

**R3.** MIENTRAS el pedido del detalle esté `EN_ACONDICIONAMIENTO` con otra persona como quien
acondiciona, o esté `TERMINADO`, la pantalla NO DEBE ofrecer ningún control que cambie el pedido:
ni «Acondicionar» ni «Terminar». Con otra persona DEBE seguir diciendo «Lo acondiciona <nombre>.».
*(Enmienda QC-217 R16: el detalle deja de ser solo lectura en los casos de R1 y R2.)* [D1]

**R4.** Las acciones de R1 y R2 DEBEN ofrecerse solo en el detalle. Las filas de «Por acondicionar»
y de «Terminados» del acondicionador NO DEBEN ofrecer ninguna. [D1]

### El modal de Acondicionar

**R5.** CUANDO el acondicionador pulsa «Acondicionar», el sistema DEBE abrir un modal con:

- el selector de personas sueltas;
- el selector de grupos de trabajo;
- el botón «Comenzar»;
- el botón «Cancelar», que cierra el modal sin cambiar el pedido.

[D2, D4]

**R6.** El selector de personas DEBE ofrecer solo personas elegibles. NO DEBE ofrecer:

- un Administrador;
- una persona de otra empresa;
- una persona dada de baja o con la cuenta no activa.

El Maestro nunca aparece, porque no tiene empresa. El número de personas ofrecidas DEBE tener el
mismo tope que el selector de responsables de la asignación. [D3, D13, D14]

**R7.** El selector de grupos DEBE ofrecer los grupos de trabajo vivos de la empresa del actor. Cada
grupo DEBE mostrar su nombre y cuántas personas aportaría: sus miembros elegibles en ese momento.

- SI un grupo tiene miembros con la cuenta activa que son Administradores, ENTONCES DEBE decir debajo
  «<k> Administrador de este grupo no entra en el equipo.» o, con k > 1, «<k> Administradores de
  este grupo no entran en el equipo.».
- SI un grupo no aporta ninguna persona, ENTONCES su casilla DEBE estar deshabilitada y DEBE decir
  «Este grupo no aporta personas al equipo.».

*(N2 del `design.md > 6`.)* [D2, D3, D14]

**R8.** MIENTRAS en el modal no esté marcada ninguna persona ni ningún grupo, «Comenzar» DEBE estar
deshabilitado. [D4]

### La espera de 5 s

**R9.** CUANDO se abre el modal de Acondicionar, «Comenzar» DEBE estar deshabilitado y mostrar una
cuenta regresiva que empieza en «00:05». CUANDO la cuenta llega a «00:00», la espera DEBE dejar de
deshabilitarlo; R8 sigue aplicando. CUANDO el modal se cierra y se vuelve a abrir, la cuenta DEBE
empezar otra vez en «00:05». [D6]

**R10.** CUANDO se abre el modal de Terminar, su botón de confirmar DEBE estar deshabilitado con la
misma cuenta regresiva de R9, y DEBE habilitarse al llegar a «00:00». Al reabrir el modal, la cuenta
DEBE empezar otra vez. [D6, D7]

**R11.** La espera DEBE ser solo de cliente. El servidor NO DEBE exigir ningún tiempo mínimo para
comenzar ni para terminar, ni guardar cuándo se abrió un modal. [D6]

### Comenzar con equipo

**R12.** CUANDO un acondicionador comienza un pedido vivo de su empresa en `POR_ACONDICIONAR` con un
equipo válido, el sistema DEBE, en una sola transacción:

- hacer lo que fija QC-215 R8: `EN_ACONDICIONAMIENTO`, el actor como quien acondiciona y `packedBy`
  conservado;
- guardar el equipo en el pedido.

SI cualquiera de las dos escrituras falla, ENTONCES NO DEBE quedar ninguna: el pedido sigue
`POR_ACONDICIONAR` y sin equipo. [D1, D4, D5]

**R13.** El equipo guardado DEBE tener una fila por persona:

- una persona marcada suelta se guarda sin grupo;
- una persona que llega por un grupo se guarda con la referencia al grupo y con el nombre que el
  grupo tenía en el instante de comenzar;
- de un grupo se guardan sus miembros elegibles **en el instante de comenzar**, no en el de abrir el
  modal.

SI la misma persona llega por dos caminos, ENTONCES DEBE guardarse una sola vez, con el origen del
primero: primero las sueltas en el orden recibido, después cada grupo en el orden recibido. [D2]

**R14.** CUANDO, después de comenzar, un grupo se renombra o se da de baja, o una persona entra en
él, sale de él o se da de baja, el sistema NO DEBE modificar ninguna fila del equipo ya guardado.
[D2]

**R15.** CUANDO se resuelve un grupo al comenzar, sus miembros que son Administradores o que no
tienen la cuenta activa DEBEN omitirse en silencio. El resto del grupo DEBE guardarse. [D3]

**R16.** SI una persona marcada suelta no es elegible, ENTONCES comenzar DEBE rechazar sin escribir
nada, con el pedido todavía `POR_ACONDICIONAR`:

- persona que no existe, dada de baja o de otra empresa → `user_not_found`;
- cuenta no activa → `user_not_assignable`;
- Administrador → `conditioning_team_member_not_allowed` (código nuevo).

SI un grupo marcado no existe, está dado de baja o es de otra empresa, ENTONCES DEBE rechazar con
`work_group_not_found`, también sin escribir. [D3, D8]

**R17.** SI, tras las omisiones de R15, el equipo queda sin ninguna persona, ENTONCES comenzar DEBE
rechazar con `conditioning_team_empty` (código nuevo) sin escribir nada. [D4]

**R18.** SI la entrada de comenzar no es exactamente `{ orderId, userIds, workGroupIds }`, ENTONCES el
sistema DEBE rechazar con `invalid_input` sin invocar ningún puerto. La forma válida es:

- `orderId`, un uuid;
- `userIds` y `workGroupIds`, listas de uuid sin repetidos;
- al menos una de las dos listas no vacía.

*(Enmienda QC-215 R16 para comenzar. Terminar sigue con `{ orderId }`.)* [D4, D8]

**R19.** SI el actor es nulo o no tiene el permiso, ENTONCES comenzar DEBE rechazar con
`unauthorized`, antes de validar la entrada y sin invocar ningún puerto (QC-215 R15, sin cambios).
Comenzar NO DEBE exigir que el actor sea responsable del pedido (QC-215 R11, sin cambios). [D1, D8]

**R20.** Comenzar DEBE decidir los errores del pedido antes de resolver el equipo, y sin escribir ni
el pedido ni el equipo:

- pedido inexistente, dado de baja o de otra empresa → `order_not_found`;
- estado distinto de `POR_ACONDICIONAR` y de `EN_ACONDICIONAMIENTO` → `order_not_conditionable`;
- `EN_ACONDICIONAMIENTO` con otra persona como quien acondiciona → `order_conditioning_taken`.

[D1, D8]

**R21.** SI el pedido ya está `EN_ACONDICIONAMIENTO` y quien acondiciona es el propio actor,
ENTONCES comenzar DEBE terminar con éxito sin escribir nada. El equipo ya guardado NO DEBE cambiar,
aunque la entrada traiga otro. [D1, D4]

**R22.** CUANDO dos acondicionadores comienzan a la vez el mismo pedido `POR_ACONDICIONAR` con
equipos distintos, el pedido DEBE quedar con un único quien acondiciona y con el equipo de ese mismo
actor, sin ninguna fila del otro. El otro DEBE recibir `order_conditioning_taken`. [D1, D5]

**R23.** La base DEBE rechazar, aunque la escritura no pase por la aplicación, una fila de equipo:

- cuya persona, cuyo grupo o cuyo pedido no sean de la empresa de la fila;
- con referencia a un grupo y sin nombre de grupo, o con nombre y sin referencia;
- que repita persona en el mismo pedido.

[D2, D3]

### El equipo es solo constancia

**R24.** Estar en el equipo NO DEBE dar ningún acceso al pedido:

- el pedido NO DEBE aparecer en «Mis asignados» de sus miembros;
- los responsables del pedido NO DEBEN cambiar;
- un miembro sin el permiso que intente comenzar o terminar DEBE recibir `unauthorized`;
- un miembro con el permiso que no es quien acondiciona DEBE recibir `order_conditioning_taken` al
  terminar.

[D5]

**R25.** MIENTRAS el pedido del detalle esté `EN_ACONDICIONAMIENTO` o `TERMINADO`, la
pantalla DEBE mostrar el equipo guardado en solo lectura. Las personas sueltas van juntas, y cada
grupo con el nombre que tenía al comenzar. El nombre de una persona DEBE mostrarse aunque esté dada
de baja. [D5]

### Terminar

**R26.** CUANDO quien acondiciona pulsa «Terminar», el sistema DEBE abrir un modal de confirmación
con «Terminar» (con la espera de R10) y «Cancelar». CUANDO pulsa «Cancelar», el pedido NO DEBE
cambiar. [D7]

**R27.** CUANDO quien acondiciona confirma Terminar, el pedido DEBE pasar a `TERMINADO` con
`finishedAt`, como fija QC-215 R12, y DEBE conservar el equipo. Después, la aplicación DEBE llevarlo
a «Por acondicionar» con el aviso «Pedido <número> acondicionado». NO DEBE pasar a `ENTREGADO`. *(N3 y N4.)* [D7, D11, D14]

**R28.** SI la acción de comenzar o de terminar falla, ENTONCES el modal DEBE seguir abierto y
mostrar el mensaje del catálogo de errores en una región `role="alert"`. En el de Acondicionar, lo
marcado DEBE seguir marcado. [D8]

**R29.** SI un acondicionador que no es quien acondiciona intenta terminar, ENTONCES el sistema DEBE
rechazar con `order_conditioning_taken`, y el pedido DEBE quedar `EN_ACONDICIONAMIENTO`, sin
`finishedAt` y con su equipo (QC-215 R13, sin cambios). [D1, D8]

### Autorización

**R30.** El caso de uso que da las personas y los grupos del modal DEBE rechazar con `unauthorized`
a un actor nulo o sin el permiso, antes de validar la entrada y sin invocar ningún puerto. NO DEBE
exigir `asignaciones.modificar` ni `usuarios.consultar`. [D3, D8]

**R31.** Ningún archivo de producción DEBE decidir el equipo ni las acciones por nombre de rol: la
guardia de autorización por permiso DEBE seguir en verde. El código del permiso DEBE aparecer solo
en las rutas de QC-217 R21 y, además, en el caso de uso de R30. *(Relaja QC-215 R17 y QC-217 R21
abriendo esa ruta exacta.)* [D8]

### Base de datos

**R32.** CUANDO se aplican las migraciones UP, el sistema DEBE crear el almacenamiento del equipo
sin modificar ninguna fila existente. Ningún pedido existente DEBE quedar con equipo. El
almacenamiento DEBE tener RLS activada y forzada. CUANDO se aplica `db:rollback` sobre la migración
de esta feature, DEBE desaparecer entero y la base DEBE quedar como antes de ella. [D5]

### Verificación y alcance

**R33.** El E2E DEBE recorrer, con los roles reales del seed:

- el acondicionador 1 abre el detalle de un pedido `POR_ACONDICIONAR` y pulsa «Acondicionar»;
- el selector no ofrece al Administrador sembrado de su empresa y sí ofrece al Operador sembrado;
- «Comenzar» empieza deshabilitado con la cuenta regresiva;
- marca una persona y un grupo, y pasados los 5 s «Comenzar» se habilita;
- tras comenzar, el detalle muestra «En acondicionamiento», «Terminar» y el equipo;
- pulsa «Terminar»: el modal empieza con el confirmar deshabilitado y se habilita a los 5 s;
- confirma y aterriza en «Por acondicionar» con el aviso;
- en «Terminados» aparece el pedido.

[D1, D3, D6, D7, D9]

**R34.** El E2E DEBE comprobar que el acondicionador 2, en el detalle del pedido que acondiciona el
acondicionador 1, no ve «Terminar» ni «Acondicionar» y ve «Lo acondiciona <nombre del 1>.». [D1, D9]

**R35.** El E2E existente de QC-217 que afirma cero botones en el detalle de un pedido
`POR_ACONDICIONAR` DEBE ajustarse para afirmar que el único botón es «Acondicionar». Ninguna otra
aserción de ese spec DEBE cambiar. [D9]

**R36.** El sistema DEBE probar R1–R32 con tests unitarios, de integración y guardias. Esta feature
NO DEBE añadir ninguna dependencia a `package.json`. [D9, D10]

### Cobertura de la tabla de decisiones

| Decisión | Requisitos |
|---|---|
| D1 Quién comienza y termina | R1, R2, R3, R4, R12, R19, R20, R21, R22, R29, R33, R34 |
| D2 Qué se elige (personas, grupos, congelado) | R5, R7, R13, R14, R23 |
| D3 Quién puede estar (salvo Administradores) | R6, R7, R15, R16, R23, R30, R33 |
| D4 Cuándo se define (al comenzar, al menos una) | R1, R5, R8, R12, R17, R18, R21 |
| D5 Solo constancia | R12, R22, R24, R25, R32 |
| D6 Bloqueo de 5 s, solo cliente | R9, R10, R11, R33 |
| D7 Confirmación antes de terminar | R2, R10, R26, R27, R33 |
| D8 Autorización en el service | R16, R18, R19, R20, R28, R29, R30, R31 |
| D9 E2E | R33, R34, R35, R36 |
| D10 Dependencia | R36 |
| D11 Terminar lleva a `TERMINADO` (enmienda D7) | R27, R29, R33 |
| D12 El equipo se ve en el detalle | R25, R33 |
| D13 Tope de 25 en el selector | R6 |
| D14 Propuestas N1–N4 y enmiendas a lo mergeado | R3, R6, R7, R18, R27, R31, R35 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-06 | ¿Quién comienza y termina? | **Cualquier Administrador de acondicionamiento de la empresa** toma cualquier pedido Por acondicionar. El primero que lo comienza se lo queda y **solo él** lo termina. Hereda QC-168 |
| 2026-10-06 | ¿Qué se elige para el equipo? | **Personas sueltas, grupos de trabajo o ambas**, como la asignación (QC-86). De un grupo se guardan **las personas que tiene en ese momento**, con la marca del grupo y su nombre (asignación congelada, QC-86) |
| 2026-10-06 | ¿Quién puede estar en el equipo? | **Cualquier usuario de la empresa salvo los Administradores.** El Maestro nunca aparece porque no tiene empresa (QC-161). Un grupo que contenga un Administrador no lo aporta al equipo; cómo se muestra eso lo fija `spec_author` |
| 2026-10-06 | ¿Cuándo se define el equipo? | **Al comenzar**, en el modal de Acondicionar. **Al menos una persona** |
| 2026-10-06 | ¿Qué hace el equipo? | **Solo constancia.** Queda guardado en el pedido. Sus personas no reciben el pedido en su lista ni pueden actuar sobre él |
| 2026-10-06 | ¿Cómo es el bloqueo de 5 s? | **El botón espera 5 s**, como QC-125: al abrir el modal de comenzar y el de terminar, el botón está deshabilitado con cuenta regresiva (`CountdownTimer`, `components/shared/countdown-timer.tsx`). Pasados los 5 s se puede pulsar. Solo de cliente, como en QC-125 |
| 2026-10-06 | ¿Qué pasa antes de terminar? | **Modal de confirmación.** Al confirmar, el pedido pasa a ENTREGADO (QC-215). **Enmendada el 2026-10-08 por la fila D11:** al confirmar, el pedido pasa a **TERMINADO** |
| 2026-10-06 | ¿Se autoriza en el servidor? | **Sí, en el service:** permiso de acondicionamiento (QC-216), pedido de la empresa, y para terminar, que quien termina sea quien comenzó |
| 2026-10-06 | ¿E2E? | **Sí:** comenzar con equipo, esperar los 5 s, terminar con confirmación; otro acondicionador no puede terminar un pedido ajeno; un Administrador no aparece en el selector del equipo |
| 2026-10-06 | ¿Dependencia nueva? | **Ninguna.** Reutiliza `CountdownTimer` y el selector de personas y grupos de la asignación si encaja; si no, lo decide `spec_author` sin librería nueva |
| 2026-10-08 | D11 (P1): ¿A qué estado pasa el pedido al confirmar Terminar? | **(a) TERMINADO**, con `finishedAt`, como fija QC-215 D11 y R12. El pedido sale en «Terminados» del acondicionador, y la entrega a `ENTREGADO` es de QC-223. **Enmienda la fila «¿Qué pasa antes de terminar?»** (decía ENTREGADO) |
| 2026-10-08 | D12 (P2): ¿Se muestra el equipo en el detalle? | **(a) Sí:** sección «Equipo» en el detalle, en solo lectura, en `EN_ACONDICIONAMIENTO` y `TERMINADO`. Las personas sueltas van juntas y cada grupo con su nombre congelado |
| 2026-10-08 | D13 (P3): ¿Tope de personas en el selector del equipo? | **(a) Se hereda el tope de 25** del selector de responsables de la asignación (`MAX_CANDIDATES`), con el mismo orden y el tope aplicado antes de filtrar |
| 2026-10-08 | D14: Propuestas N1–N4 del `design.md > 6` y enmiendas a lo mergeado | **Aprobadas con el spec.** N1: «Administrador» = tiene `pedidos.consultar` (`canBeResponsible`). N2: cómo se muestra un grupo con Administradores. N3: textos. N4: tras terminar se vuelve a «Por acondicionar» con el aviso. Enmiendas: QC-215 R16 (entrada de comenzar), QC-217 R16 (el detalle ofrece acciones), QC-215 R17 y QC-217 R21 (una ruta más nombra el permiso) y QC-217 R22 (aserción del E2E) |
