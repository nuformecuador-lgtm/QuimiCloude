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
> primera fila («¿Qué sale en "Terminados"?»), `[D12]` la de la presentación, y `[D13]`-`[D16]` las
> cuatro que el humano cerró el 2026-09-23 al revisar el spec (vuelta 2). La numeración solo sirve
> para citar: la tabla no se toca ni se reordena. El test concreto de cada `R<n>` está en
> `design.md > 10`.
>
> **Responsable elegible** = persona de la empresa **sin** `pedidos.consultar` [D13]. Se decide por
> permiso y nunca por el nombre del rol.
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
  por número de pedido **descendente**, del más nuevo al más viejo. El orden DEBE ser total y
  estable entre páginas. `[D2]` `[D14]`
- **R21**: Cada fila de «Terminados» DEBE mostrar el número, la receta, la cantidad, la
  **presentación**, la **fecha de terminado** y **todos los responsables** del pedido. SI el pedido
  no tiene presentación, ENTONCES DEBE mostrar «Sin presentación». SI no tiene fecha, ENTONCES DEBE
  mostrar «Sin fecha». SI no tiene responsables, ENTONCES esa celda DEBE quedar vacía y no dar
  error. `[D2]` `[D12]` `[D15]`

### Vista «Todos»

- **R22**: CUANDO se consulta «Todos» sin filtro de estado, el sistema DEBE devolver los pedidos
  vivos de la empresa del usuario **en cualquier estado** (`PENDIENTE`, `EN_CURSO`, `ENTREGADO` y
  `CANCELADO`), estén o no asignados a él, en el orden de la lista de trabajo. NO DEBE devolver
  pedidos dados de baja lógicamente ni de otra empresa. `[D4]` `[D7]`
- **R23**: SI quien consulta «Todos» no tiene `pedidos.consultar`, ENTONCES el caso de uso DEBE
  rechazar con `unauthorized` antes de validar la entrada y antes de leer ningún dato. `[D4]`
- **R24**: CUANDO se filtra «Todos» por estado, el sistema DEBE devolver solo los pedidos de los
  estados elegidos. SI el filtro es **exactamente** `ENTREGADO`, y solo ese estado, ENTONCES DEBE
  ordenarlos con el orden de terminados (R20). Con cualquier otra combinación, aunque incluya
  `ENTREGADO`, DEBE mantener el orden de la lista de trabajo. `[D7]` `[D16]`
- **R25**: Cada fila de «Todos» DEBE mostrar el número, la receta, la cantidad, la presentación
  («Sin presentación» si no tiene), la prioridad, el **estado** y **todos los responsables** del
  pedido. SI el pedido no tiene responsables, ENTONCES la celda DEBE quedar vacía y no dar error.
  `[D7]` `[D15]`
- **R31**: MIENTRAS el filtro de «Todos» sea exactamente `ENTREGADO`, cada fila DEBE mostrar además
  la **fecha de terminado**, o «Sin fecha» si no la tiene. Con cualquier otro filtro, o sin filtro,
  esa columna NO DEBE mostrarse. `[D15]` `[D16]`

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
  DEBE comprobar que el formulario de edición de Pedidos ya no ofrece cambiar el estado y que el
  selector de responsables de Pedidos no ofrece al Administrador. `[D10]` `[D13]`
- **R29**: Esta ficha NO DEBE añadir dependencias a `package.json` ni tablas a la base. El único
  cambio de esquema DEBE ser la columna de R1, con su migración y su `down.sql`. `[D11]`
- **R30**: CUANDO un pedido se entrega con **Finalizar** después de esta ficha, DEBE aparecer en
  «Terminados» con su fecha de terminado **sin ninguna otra acción**. Un pedido entregado antes de
  esta ficha DEBE aparecer marcado «Sin fecha». `[D2]` `[D3]` `[D8]`

### Quién puede ser responsable

- **R32**: CUANDO se carga el selector de responsables de un pedido en Pedidos, el sistema NO DEBE
  ofrecer a ninguna persona que tenga `pedidos.consultar`. Las demás personas de la empresa DEBEN
  seguir ofreciéndose como hasta ahora. `[D13]`
- **R33**: SI una operación de asignar incluye como persona suelta a alguien con `pedidos.consultar`,
  ENTONCES el caso de uso DEBE rechazar la operación **entera** con `user_cannot_be_responsible`, sin
  crear ninguna fila, venga o no la petición del formulario. `[D13]`
- **R34**: El sistema NO DEBE crear, por ninguna vía de la aplicación (persona suelta o miembro de
  un grupo de trabajo), una asignación de un pedido a una persona con `pedidos.consultar`. Qué pasa
  con el resto del grupo es la Pregunta abierta 2. `[D13]`
- **R35**: SI quien tiene `pedidos.consultar` no está asignado a un pedido, ENTONCES abrir la
  ejecución de ese pedido por su dirección, arrancarlo o finalizarlo DEBE responder `order_not_found`
  sin escribir nada. `[D13]`

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
| D13: el Administrador no puede ser responsable | R28, R32, R33, R34, R35 |
| D14: «sin fecha» por número descendente | R20 |
| D15: columnas de «Terminados» y «Todos» | R21, R25, R31 |
| D16: orden de terminados solo con filtro exactamente Entregado | R24, R31 |

## Preguntas abiertas

> Las cinco preguntas de la vuelta 1 las cerró el humano el 2026-09-23 y pasaron a D13-D16. Estas
> dos salen de aplicar D13 y quedan abiertas. No se rellenan con supuestos.

1. **¿Qué se hace con los pedidos que ya tienen asignada a una persona con `pedidos.consultar`?**
   Medido en el código de `dev` el 2026-09-23 (sin acceso a la base, así que **no se sabe cuántas
   filas hay**):
   - Desde QC-87 nada lo impedía. `assign-responsibles.ts:113-120` solo exige que la persona exista,
     sea de la empresa y tenga la cuenta activa. El selector (`order-list-section.tsx:173-194`) ofrece
     todo lo que devuelve `listUsersAction`, sin filtro de rol ni de permiso. Ninguna restricción de
     la base (`order_assignments`) lo impide.
   - `scripts/seed.ts` no crea asignaciones. Las filas, si existen, las ha creado alguien desde la
     pantalla.
   - Consecuencia: para esas filas, D13 **no cierra** la ejecución por dirección directa. Los casos
     de uso de ejecución solo exigen `asignaciones.consultar` y estar asignado, y esa persona lo está.
     Esta ficha no las toca: ni las borra ni las filtra al leer. Siguen apareciendo como
     responsables en «Todos», «Terminados» y la lista de Pedidos, y se pueden quitar a mano con
     «quitar responsable», que no cambia.
   - Hay que decidir si se dejan así, si se quitan con una migración de datos (borrado físico, que
     es lo que hace «quitar responsable») o si los casos de uso de ejecución rechazan además a
     quien tenga `pedidos.consultar`. Esta última opción cambiaría QC-63 y QC-82.
   (Abierta al aplicar D13, 2026-09-23.)

2. **Grupo de trabajo con un miembro que tiene `pedidos.consultar`.** Asignar un grupo crea una fila
   por cada miembro con la cuenta activa (`WorkGroupSnapshot.activeMemberIds`). A los inactivos se
   les **omite en silencio**, sin rechazar la operación. R34 prohíbe crear la fila del miembro
   con `pedidos.consultar`, pero falta decidir qué pasa con el resto:
   (a) **se le omite** y los demás se asignan, como a un inactivo; o
   (b) **se rechaza la operación entera** con `user_cannot_be_responsible`, como con una persona
   suelta (R33).
   El `design.md > 3.5` deja preparada **(a)** como propuesta, sin darla por decidida. El test de R34
   vale para las dos: solo afirma que no queda fila de esa persona. (Abierta al aplicar D13,
   2026-09-23.)

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
| 2026-09-23 | ¿Puede un Administrador ser responsable de un pedido? (antes Preguntas abiertas 1 y 5) | **No.** Se aplica **por permiso, nunca por nombre de rol** (QC-86/87): quien tiene **`pedidos.consultar`**, el mismo permiso que abre «Todos», **no se ofrece** en el selector de responsables, y el **service rechaza** asignarlo aunque la petición no venga del formulario. Como ejecutar exige estar asignado, la ejecución por dirección directa queda cerrada sin tocar la ruta (para las asignaciones que ya existan, ver la Pregunta abierta 1). Requisitos y tests: selector, rechazo en el service y caso E2E. **D13** |
| 2026-09-23 | ¿En qué sentido se ordenan por número los «sin fecha»? (antes Pregunta abierta 2) | **Descendente**, del más nuevo al más viejo, como proponía el diseño. **D14** |
| 2026-09-23 | ¿Qué columnas llevan «Terminados» y «Todos»? (antes Pregunta abierta 3) | Las del spec, tal cual. **«Terminados»**: número, receta, cantidad, presentación, fecha de terminado y responsables. **«Todos»**: número, receta, cantidad, presentación, prioridad, estado y responsables; **filtrado por Entregado**, añade la fecha de terminado. **D15** |
| 2026-09-23 | ¿Cuándo se ordena «Todos» por fecha de terminado? (antes Pregunta abierta 4) | **Solo cuando el filtro es exactamente Entregado.** Con cualquier otra combinación, orden de la lista de trabajo. **D16** |
