# QC-145 — pedidos-terminados-en-asignacion · requirements.md

> **Zona:** `fullstack` · **Complejidad:** — (la asigna el leader en F1.0) · **depends_on:** QC-144, QC-146 ·
> **Rama:** `feature/QC-145-pedidos-terminados-en-asignacion`
>
> **Alcance.** `/asignacion` pasa a mostrar vistas según permiso: «Mis asignados» (la de hoy),
> **«Terminados»** (los `ENTREGADO` de toda la empresa, ordenados por una **fecha de terminado** que
> empieza a guardarse) y, para quien tiene `pedidos.consultar`, **«Todos»** (todos los pedidos de la
> empresa en cualquier estado, filtrable por estado), que sustituye a las otras dos. Además, **el
> estado de un pedido lo mueve solo la planta**: la edición en Pedidos deja de cambiarlo.
>
> **Lo que NO entra.** El rol Empacador y el permiso de terminados → **QC-144**. Un estado «empacado»
> o cualquier acción sobre un pedido terminado. Una pantalla de detalle desde estas listas. Rellenar
> la fecha de los pedidos entregados antes de esta ficha.
>
> Sembrado por `/afinar-feature` el 2026-09-22. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-09-23. Cada requisito cita entre corchetes la fila de
> `## Decisiones cerradas` de la que sale, numeradas **por su orden en la tabla**: `[D1]` es la
> primera fila («¿Qué sale en "Terminados"?») y `[D12]` la última («¿"Terminados" muestra la
> presentación?»). La numeración solo sirve para citar: la tabla no se toca ni se reordena. El test
> concreto de cada `R<n>` está en `design.md > 10`.
>
> Vocabulario. **Permiso de terminados** = `terminados.consultar`, creado por QC-144.
> **Fecha de terminado** = el instante en que el pedido pasó a `ENTREGADO` por **Finalizar**.
> **Pedido vivo** = no dado de baja lógicamente (QC-34 R31: no existe ningún listado de borrados).
> **Orden de la lista de trabajo** = prioridad de mayor a menor, después antigüedad (alta más
> antigua primero) y después número de pedido. Es el orden de «Mis asignados» (QC-88).
> **Orden de terminados** = el de R20.

### Fecha de terminado (modelo de datos)

- **R1**: El sistema DEBE poder guardar en cada pedido una **fecha de terminado** opcional, como
  columna nueva de la tabla de pedidos con identificador en inglés, sin crear ninguna tabla.
  `[D3]` `[D11]`
- **R2**: CUANDO se aplique la migración de esta ficha, el sistema DEBE dejar **todos** los pedidos
  existentes sin fecha de terminado, incluidos los que ya están `ENTREGADO`. No DEBE tomarla de la
  fecha de última modificación ni de ninguna otra columna, y no DEBE modificar ningún otro dato. La
  migración DEBE poder revertirse. `[D3]`
- **R3**: CUANDO un responsable asignado activa **Finalizar** y el pedido pasa a `ENTREGADO`, el
  sistema DEBE guardar como fecha de terminado el instante de esa operación **en la misma escritura**
  que cambia el estado. SI esa escritura falla, ENTONCES NO DEBE quedar guardado ni el estado nuevo
  ni la fecha. `[D3]` `[D8]`
- **R4**: SI una escritura, venga de la aplicación o de cualquier otra vía, deja con fecha de
  terminado un pedido cuyo estado no es `ENTREGADO`, ENTONCES la base DEBE rechazarla. `[D3]`
- **R5**: El sistema NO DEBE escribir, cambiar ni borrar la fecha de terminado de un pedido al
  editarlo, cancelarlo o darlo de baja lógicamente. `[D3]` `[D8]`

### Quién mueve el estado

- **R6**: CUANDO se edita un pedido desde Pedidos, el sistema NO DEBE cambiar su estado, aunque la
  entrada de la edición incluya uno. El resto de la edición se aplica igual que hasta ahora. `[D8]`
- **R7**: El formulario de edición de pedidos NO DEBE ofrecer ningún control para elegir o cambiar
  el estado. `[D8]`
- **R8**: SI se intenta editar un pedido `ENTREGADO` o `CANCELADO`, ENTONCES el sistema DEBE
  rechazar la edición con `invalid_transition` y sin modificar el pedido, como hasta ahora. `[D8]`
- **R9**: MIENTRAS un pedido esté `PENDIENTE` o `EN_CURSO`, quien tenga `pedidos.modificar` DEBE
  poder seguir **cancelándolo** desde Pedidos con su motivo, con el comportamiento de QC-34. `[D8]`
- **R10**: El sistema DEBE dejar un pedido `EN_CURSO` solo al arrancarlo desde la ejecución de la
  planta y `ENTREGADO` solo con **Finalizar**. Ninguna otra operación de la aplicación DEBE dejar un
  pedido en ninguno de esos dos estados. `[D8]`

### Qué vistas ofrece `/asignacion`

- **R11**: CUANDO un usuario con `asignaciones.consultar` y sin `pedidos.consultar` abre
  `/asignacion`, el sistema DEBE mostrarle «Mis asignados» con el mismo contenido, orden,
  paginación y entrada a ejecución que tenía antes de esta ficha. `[D5]` `[D6]`
- **R12**: DONDE ese usuario tenga además el permiso de terminados, el sistema DEBE ofrecerle
  también la vista «Terminados» junto a «Mis asignados». SI no lo tiene, ENTONCES NO DEBE
  ofrecérsela. `[D1]` `[D5]`
- **R13**: SI el usuario tiene `pedidos.consultar`, ENTONCES `/asignacion` DEBE ofrecerle **solo**
  la vista «Todos», sin «Mis asignados» ni «Terminados», aunque tenga también el permiso de
  terminados o pedidos asignados a él. `[D4]` `[D5]`
- **R14**: El sistema DEBE decidir qué vistas ofrece solo por los permisos del usuario. Ninguna
  decisión de esta ficha DEBE depender del nombre de su rol. `[D4]` `[D5]`
- **R15**: SI la dirección de `/asignacion` pide una vista que no existe o que el usuario no tiene,
  ENTONCES el sistema DEBE mostrar la primera vista que el usuario sí tiene, sin error y sin revelar
  la otra. `[D5]`
- **R16**: Esta ficha NO DEBE añadir, quitar ni renombrar permisos, ni cambiar los que el seed
  asigna a cada rol. El catálogo DEBE seguir en dieciséis permisos. `[D4]`

### Vista «Terminados»

- **R17**: CUANDO se consulta «Terminados», el sistema DEBE devolver los pedidos vivos en estado
  `ENTREGADO` de la **empresa del usuario**, estén o no asignados a él. NO DEBE devolver pedidos
  `PENDIENTE`, `EN_CURSO` o `CANCELADO`, dados de baja lógicamente ni de otra empresa. `[D1]`
- **R18**: SI quien consulta «Terminados» no tiene el permiso de terminados, ENTONCES el caso de uso
  DEBE rechazar con `unauthorized` antes de validar la entrada y antes de leer ningún dato, aunque la
  pantalla no le haya ofrecido la vista. `[D1]`
- **R19**: SI la empresa del usuario no tiene ningún pedido que cumpla R17, ENTONCES «Terminados»
  DEBE mostrar un estado vacío y no un error. `[D1]`
- **R20**: El sistema DEBE ordenar «Terminados» por fecha de terminado, de la más reciente a la más
  antigua. Los pedidos sin fecha DEBEN ir **después** de todos los que la tienen y ordenarse entre sí
  por número de pedido (el sentido está en la Pregunta abierta 2). El orden DEBE ser total y
  estable entre páginas. `[D2]`
- **R21**: Cada fila de «Terminados» DEBE mostrar el número, la receta, la cantidad, la
  **presentación** del pedido y su **fecha de terminado**. SI el pedido no tiene presentación,
  ENTONCES DEBE mostrar «Sin presentación». SI no tiene fecha, ENTONCES DEBE mostrar «Sin fecha».
  `[D2]` `[D12]`

### Vista «Todos»

- **R22**: CUANDO se consulta «Todos» sin filtro de estado, el sistema DEBE devolver los pedidos
  vivos de la empresa del usuario **en cualquier estado** (`PENDIENTE`, `EN_CURSO`, `ENTREGADO` y
  `CANCELADO`), estén o no asignados a él, en el orden de la lista de trabajo. NO DEBE devolver
  pedidos dados de baja lógicamente ni de otra empresa. `[D4]` `[D7]`
- **R23**: SI quien consulta «Todos» no tiene `pedidos.consultar`, ENTONCES el caso de uso DEBE
  rechazar con `unauthorized` antes de validar la entrada y antes de leer ningún dato. `[D4]`
- **R24**: CUANDO se filtra «Todos» por estado, el sistema DEBE devolver solo los pedidos de los
  estados elegidos. SI el filtro es exactamente `ENTREGADO`, ENTONCES DEBE ordenarlos con el orden de
  terminados (R20). Con cualquier otro filtro DEBE mantener el orden de la lista de trabajo. `[D7]`
- **R25**: Cada fila de «Todos» DEBE mostrar el número del pedido, su **estado** y **todos sus
  responsables**, incluido el propio usuario si lo es. SI el pedido no tiene responsables, ENTONCES
  la celda DEBE quedar vacía y no dar error. `[D7]`

### Solo lectura

- **R26**: Las vistas «Terminados» y «Todos» NO DEBEN ofrecer ninguna acción sobre el pedido ni
  ninguna entrada a su detalle o a su ejecución. En «Todos» esto vale **también** para los pedidos
  asignados al propio usuario. `[D6]`

### Paginación

- **R27**: «Terminados» y «Todos» DEBEN paginarse en el servidor, con 10 filas por página por
  defecto y 25 como máximo, usando la tabla compartida. El total y el número de páginas DEBEN
  describir el conjunto ya filtrado. SI la página pedida no existe, ENTONCES DEBE mostrarse el estado
  vacío con vuelta a la primera página, como en «Mis asignados». `[D9]`

### E2E y alcance

- **R28**: Esta ficha DEBE incluir un E2E que entre con el rol real del seed: como **Operador** (ve
  «Mis asignados» y no ve «Terminados» ni «Todos»), como **Empacador** (ve «Mis asignados» y
  «Terminados» con un pedido entregado de la empresa no asignado a él, y no ve «Todos») y como
  **Administrador** (ve solo «Todos», con pedidos en varios estados y el filtro por estado). También
  DEBE comprobar que el formulario de edición de Pedidos ya no ofrece cambiar el estado. `[D10]`
- **R29**: Esta ficha NO DEBE añadir dependencias a `package.json` ni tablas a la base. El único
  cambio de esquema DEBE ser la columna de R1, con su migración y su `down.sql`. `[D11]`
- **R30**: CUANDO un pedido se entrega con **Finalizar** después de esta ficha, DEBE aparecer en
  «Terminados» con su fecha de terminado **sin ninguna otra acción**. Un pedido entregado antes de
  esta ficha DEBE aparecer marcado «Sin fecha». `[D2]` `[D3]` `[D8]`

### Cobertura de decisiones

| Decisión | Requisitos |
|---|---|
| D1: qué sale en «Terminados» | R12, R17, R18, R19 |
| D2: orden | R20, R21, R30 |
| D3: de dónde sale la fecha | R1, R2, R3, R4, R5, R30 |
| D4: qué ve el Administrador | R13, R14, R16, R22, R23 |
| D5: cómo se reparte la pantalla | R11, R12, R13, R14, R15 |
| D6: solo ver | R11, R26 |
| D7: cómo sale «Todos» | R22, R24, R25 |
| D8: quién mueve el estado | R3, R5, R6, R7, R8, R9, R10, R30 |
| D9: paginación | R27 |
| D10: E2E | R28 |
| D11: sin dependencia ni tabla | R1, R29 |
| D12: presentación en «Terminados» | R21 |

## Preguntas abiertas

1. **Un Administrador asignado como responsable no tiene por dónde ejecutar el pedido**: su única
   vista es «Todos», que es de solo lectura (decisión «¿Qué se puede hacer desde…?»). El humano lo
   eligió sabiéndolo. Queda abierto si el selector de responsables deja de ofrecer Administradores o
   si se acepta tal cual. No se rellena con supuestos: `spec_author` lo lleva a F1.4.
   **Datos del código (spec_author, 2026-09-23, sobre `dev`). La pregunta sigue abierta.**
   - Hoy el selector de responsables **no filtra por rol ni por permiso**. `assign-responsibles.ts`
     solo exige que la persona exista, sea de la empresa y tenga la cuenta activa. Un Administrador
     se puede asignar hoy igual que un Operador.
   - Los tres casos de uso de la ejecución (`get-`, `start-` y `finish-assigned-order.ts`) solo
     exigen `asignaciones.consultar` y estar asignado. El Administrador tiene los dos en el seed.
     Por eso, después de esta ficha, un Administrador asignado **no ve entrada** a la ejecución
     desde `/asignacion` (R13, R26). Pero si escribe a mano la dirección `/asignacion/<id>`,
     **puede ejecutar y finalizar** el pedido. Esta ficha no cambia eso: ver la Pregunta 5.

2. **¿En qué sentido se ordenan por número los terminados «sin fecha»?** D2 dice «ordenados por
   número» y no dice si ascendente (el más viejo primero, como en la lista de trabajo) o descendente
   (coherente con el resto de «Terminados», que va del más reciente al más antiguo). R20 lo deja
   sin fijar y su test depende de la respuesta. El `design.md` deja preparado **descendente** como
   propuesta y no lo da por decidido. (Abierta al diseñar, 2026-09-23.)

3. **Columnas de «Terminados» y de «Todos» que las decisiones no fijan.** D7 fija estado y
   responsables en «Todos», y D12 y D2 fijan presentación y fecha en «Terminados». No está decidido:
   (a) si «Terminados» muestra también **prioridad** y **responsables**; (b) si «Todos» muestra
   receta, cantidad, presentación y prioridad (la propuesta de `design.md > 6.4` dice que sí, igual
   que «Mis asignados»); (c) si «Todos», filtrado por Entregado, muestra además la **fecha de
   terminado**. R21 y R25 exigen solo lo decidido. (Abierta al diseñar, 2026-09-23.)

4. **Filtro de «Todos» con varios estados, uno de ellos Entregado.** La tabla compartida permite
   elegir **varios** estados a la vez. D7 dice «filtrado por Entregado, se ordena como Terminados».
   R24 lo lee de forma literal: solo cuando el filtro es **exactamente** Entregado. Con Entregado más
   otro estado se mantiene el orden de trabajo. Queda por confirmar que esa lectura es la buscada.
   (Abierta al diseñar, 2026-09-23.)

5. **¿La ejecución por dirección directa debe cerrarse para quien tiene `pedidos.consultar`?**
   Continúa la Pregunta 1. D6 hace «Todos» de solo lectura, pero `/asignacion/<id>` y
   arrancar/finalizar siguen aceptando a cualquier responsable asignado con
   `asignaciones.consultar`, incluido el Administrador. Cerrarla cambiaría los casos de uso de QC-63
   y QC-82. Esta ficha **no la cierra** y ningún `R<n>` la toca. Si el humano quiere cerrarla, es
   un requisito nuevo. (Abierta al diseñar, 2026-09-23.)

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-22 | ¿Qué sale en «Terminados»? | Los pedidos `ENTREGADO` **de toda la empresa**, sin filtro por usuario. **No** salen los `CANCELADO` ni los borrados lógicos (heredado de **QC-88**). La abre el **permiso de terminados de QC-144**, validado en el service |
| 2026-09-22 | ¿En qué orden? | Por **fecha de terminado**, de la más reciente a la más antigua. Los que no tienen fecha van **al final**, marcados **«sin fecha»**, ordenados por número. Los nulos al final se declaran explícitos: Postgres los pone primero en orden descendente (precedente `product-prisma.ts:158`) |
| 2026-09-22 | ¿De dónde sale la fecha? | **Columna nueva en `orders`**, anulable, identificador en inglés (heredado de **QC-4**). **No** se rellena hacia atrás ni con `updated_at`, que cambia con cualquier edición. Se escribe **en la misma operación** que deja el pedido `ENTREGADO` al **Finalizar** del operario, que pasa a ser el único camino (ver «¿Quién mueve el estado?»). Convive con la anotación «finalizar» de **QC-82 R21**, que no añade columna |
| 2026-09-22 | ¿Qué ve el Administrador en Asignación? | **«Todos»**: todos los pedidos de su empresa **en cualquier estado**, habilitado por **`pedidos.consultar`** (reutilizado: el catálogo **no** cambia, sigue en 16 tras QC-144). **Sustituye** a «Mis asignados» y a «Terminados» para quien tenga ese permiso. La diferencia se hace por permiso, nunca por nombre de rol (**QC-86/87**) |
| 2026-09-22 | ¿Cómo se reparte la pantalla? | Según permiso. **Operador**: «Mis asignados», sin cambios. **Empacador**: «Mis asignados» + «Terminados». **Administrador** (con `pedidos.consultar`): solo «Todos», con filtro por estado |
| 2026-09-22 | ¿Qué se puede hacer desde «Terminados» y «Todos»? | **Solo ver.** Sin acciones ni detalle. «Todos» es **de solo lectura aunque el pedido esté asignado al propio Administrador** (ver Pregunta abierta 1). «Mis asignados» conserva su entrada a ejecución, como hoy |
| 2026-09-22 | ¿Cómo sale «Todos»? | Arranca en **todos los estados**, en el orden de la lista de trabajo (prioridad y antigüedad, **QC-88**). **Filtrado por Entregado**, se ordena como «Terminados». Cada fila muestra **estado y responsables** |
| 2026-09-22 | ¿Quién mueve el estado de un pedido? | **Solo la planta**: arrancar lo pone `EN_CURSO` (QC-63) y **Finalizar** lo pone `ENTREGADO`. **La edición en Pedidos deja de cambiar el estado**: hoy admite `EN_CURSO`/`ENTREGADO` (`lib/modules/pedidos/domain/order-transitions.ts`, `update-order.ts`) y eso se retira del caso de uso y del formulario. Al Administrador le queda **Cancelar**, con su motivo (**QC-34**). **Entra en esta ficha**: es lo que garantiza que todo entregado desde hoy tenga fecha |
| 2026-09-22 | ¿Paginación? | En el servidor, 10/25 por página, con la tabla compartida (heredado de **QC-55/QC-88**) |
| 2026-09-22 | ¿E2E? | **Sí, aquí**: se difirió desde **QC-144**. Entra como **Operador** (no ve Terminados), como **Empacador** (ve Terminados, no Todos) y como **Administrador** (ve Todos). Más el caso de que **Pedidos ya no ofrece cambiar el estado** |
| 2026-09-22 | ¿Dependencia o tabla nueva? | **Ninguna dependencia ni tabla.** Una columna, por migración |
| 2026-09-22 | ¿«Terminados» muestra la presentación? | **Sí**, la de cada pedido; los viejos salen «sin presentación». La columna la crea **QC-146**, que por eso **bloquea a esta** (añadido al acotar QC-146; `depends_on` pasa a QC-144 + QC-146) |
