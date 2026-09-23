# QC-146 — presentacion-del-pedido · requirements.md

> **Zona:** fullstack · **Complejidad:** medium · **depends_on:** — · **Rama:** `feature/QC-146-presentacion-del-pedido`
>
> **Alcance.** Cada pedido declara en qué presentación se entrega lo fabricado, elegida del
> catálogo de presentaciones de su empresa (el mismo que usan los lotes). Es obligatoria al crear
> y al editar; los pedidos ya cargados quedan «sin presentación». Solo informa: no cambia la
> cantidad, ni el importe, ni el inventario. Se elige en el alta/edición de `/pedidos`, se muestra
> en su listado y en `/asignacion` (lista y pantalla de ejecución del Operador).
>
> **Lo que NO entra.** Mostrarla en la lista de terminados del Empacador → **QC-145** (queda
> bloqueada por esta). Contar la cantidad en envases o convertir envases a litros → **QC-130**.
> Descontar envases vacíos del inventario o reservarlos → fuera de alcance, sin ficha (QC-141 no
> los cubre). Filtrar u ordenar el listado por presentación → no se hace.
>
> Sembrado por `/afinar-feature` el 2026-09-22. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-09-22. Cada requisito cita entre corchetes la fila de
> `## Decisiones cerradas` de la que sale, numeradas **por su orden en la tabla** —`[D1]` es la
> primera fila, «¿Qué es la presentación del pedido?», y `[D13]` la última, «¿Dependencias
> nuevas?»—. La numeración es solo de cita: la tabla no se toca ni se reordena. El test concreto de
> cada `R<n>` está en `design.md > 10`.
>
> Vocabulario: **catálogo de presentaciones** = el de Configuración › Presentaciones (QC-20/QC-45),
> el mismo que usan los lotes. **Pedido editable** = en estado `PENDIENTE` o `EN_CURSO` (QC-34 D8).
> **«Sin presentación»** = el texto que se muestra en lugar del nombre cuando el pedido no tiene
> presentación.

### Modelo de datos

- **R1** — El sistema DEBE poder guardar en cada pedido la presentación en que se entrega lo
  fabricado, como referencia a una presentación **existente** del catálogo de presentaciones de la
  **misma empresa** del pedido. `[D1]` `[D2]`
- **R2** — CUANDO se aplique la migración de esta ficha, el sistema DEBE dejar **todos los pedidos
  existentes sin presentación**, sin asignarles ninguna por defecto y sin modificar ningún otro dato
  suyo; y la migración DEBE poder revertirse. `[D3]`
- **R3** — SI una escritura en la base asocia un pedido a una presentación que no existe o que es
  de **otra empresa** que la del pedido, ENTONCES la base DEBE rechazarla, venga de la aplicación o
  de cualquier otra vía. `[D5]`
- **R4** — SI se intenta borrar una presentación a la que apunta al menos un pedido —vivo, cancelado,
  entregado o dado de baja lógicamente—, ENTONCES el sistema DEBE rechazar el borrado, conservar la
  presentación y el pedido intactos, y la operación de borrado de presentaciones DEBE responder con
  el código `presentation_in_use`. `[D6]`
- **R5** — El sistema DEBE conservar el borrado **lógico** de pedidos: dar de baja un pedido NO DEBE
  quitarle ni cambiarle la presentación, y el identificador nuevo de la base DEBE estar en inglés.
  `[D12]`

### Escritura (alta y edición)

- **R6** — CUANDO se da de alta un pedido, el sistema DEBE exigir una presentación; SI falta o no
  tiene forma de identificador válido, ENTONCES DEBE rechazar el alta con `invalid_input` sin crear
  ninguna fila. `[D3]`
- **R7** — CUANDO se edita un pedido, el sistema DEBE exigir una presentación con las mismas reglas
  que en el alta, **también si el pedido estaba sin presentación**; SI falta, ENTONCES DEBE rechazar
  la edición con `invalid_input` sin modificar el pedido. `[D3]`
- **R8** — SI la presentación indicada en un alta o en una edición no existe en el catálogo de la
  empresa de quien escribe —incluida una presentación de otra empresa—, ENTONCES el sistema DEBE
  rechazar la operación con `presentation_not_found`, sin crear ni modificar ninguna fila. `[D2]`
  `[D5]`
- **R9** — MIENTRAS un pedido sea editable, el sistema DEBE permitir sustituir su presentación por
  cualquier otra del catálogo de su empresa. `[D7]`
- **R10** — SI se intenta editar un pedido `ENTREGADO` o `CANCELADO`, ENTONCES el sistema DEBE
  rechazar la edición con `invalid_transition` y su presentación DEBE quedar como estaba. `[D7]`
- **R11** — El sistema DEBE permitir **cancelar** y **dar de baja** un pedido sin presentación: la
  exigencia de R6 y R7 es solo del alta y de la edición. `[D3]`
- **R12** — SI quien da de alta o edita un pedido no tiene `pedidos.modificar`, ENTONCES el sistema
  DEBE rechazar con `unauthorized` **antes** de validar la entrada y antes de consultar el catálogo
  de presentaciones. `[D8]`
- **R13** — El sistema NO DEBE usar la presentación para calcular ni para cambiar nada: la cantidad
  del pedido se guarda tal cual se escribió, el pedido sigue sin unidad, y `ingredients_cost` es el
  mismo para dos pedidos de igual receta y cantidad aunque tengan presentaciones distintas. `[D1]`
  `[D4]`
- **R14** — CUANDO se da de alta o se edita un pedido con presentación, el sistema NO DEBE crear
  movimientos de inventario ni cambiar la existencia de ningún lote. `[D4]`
- **R15** — El sistema NO DEBE añadir ningún permiso nuevo ni cambiar los permisos de ningún rol
  por esta ficha. `[D8]`

### Pantalla de pedidos (`/pedidos`)

- **R16** — CUANDO el Administrador abre el panel de alta de un pedido, el sistema DEBE ofrecer un
  campo «Presentación» obligatorio que busca y lista **solo** presentaciones del catálogo de su
  empresa. `[D2]` `[D9]`
- **R17** — El campo «Presentación» del panel de pedidos NO DEBE ofrecer crear una presentación.
  `[D2]`
- **R18** — CUANDO se abre la edición de un pedido con presentación, el sistema DEBE mostrarla ya
  elegida; SI el pedido está sin presentación, ENTONCES el campo DEBE arrancar vacío y el panel NO
  DEBE guardar hasta que se elija una. `[D3]` `[D9]`
- **R19** — SI el alta o la edición se rechazan por la presentación (`presentation_not_found`, o la
  validación previa del formulario), ENTONCES el panel DEBE mostrar el mensaje junto al campo
  «Presentación», seguir abierto y conservar lo escrito en los demás campos. `[D2]` `[D3]`
- **R20** — El listado de pedidos DEBE mostrar una columna «Presentación» con el nombre de la
  presentación de cada pedido, y «Sin presentación» en los pedidos que no la tienen. `[D9]`
- **R21** — La columna «Presentación» NO DEBE ordenar ni filtrar, y SI una consulta de lista pide
  ordenar o filtrar por la presentación, ENTONCES el sistema DEBE ignorar ese criterio y registrarlo
  como campo omitido, igual que cualquier otro campo no declarado. `[D9]`
- **R22** — CUANDO se consulta una página del listado de pedidos, el sistema DEBE resolver los
  nombres de presentación de toda la página con **una sola** consulta al catálogo de presentaciones,
  tenga la página una fila o veinticinco, y con **ninguna** si ningún pedido de la página tiene
  presentación. `[D9]`
- **R23** — CUANDO se consulta la ficha de un pedido, el sistema DEBE devolver su presentación
  (identificador y nombre), o su ausencia si el pedido está sin presentación. `[D9]`

### Pantallas de asignación (`/asignacion`)

- **R24** — CUANDO un Operador consulta su lista de pedidos asignados, cada fila DEBE mostrar la
  presentación del pedido, o «Sin presentación». `[D8]` `[D9]`
- **R25** — CUANDO un Operador abre la pantalla de ejecución de un pedido asignado, el sistema DEBE
  mostrar la presentación del pedido, o «Sin presentación». `[D8]` `[D9]`
- **R26** — MIENTRAS un usuario tenga `asignaciones.consultar` y no `pedidos.consultar`, el sistema
  DEBE mostrarle la presentación de sus pedidos asignados en R24 y R25, y NO DEBE ofrecerle ningún
  control para cambiarla. `[D8]`
- **R27** — El resumen de pedido que `pedidos` publica a otros módulos DEBE incluir la presentación
  del pedido, para que cualquier pantalla de `asignaciones` —incluida la de terminados que pintará
  QC-145— la obtenga por ese contrato y no por la tabla. `[D9]` `[D10]`

### Aislamiento, E2E y dependencias

- **R28** — El sistema DEBE resolver el nombre de una presentación solo dentro de la empresa de quien
  consulta: el catálogo de presentaciones NO DEBE devolver presentaciones de otra empresa aunque se
  le pida su identificador. `[D5]`
- **R29** — CUANDO el Administrador da de alta un pedido eligiendo una presentación en `/pedidos`,
  el sistema DEBE mostrar esa presentación en la fila del pedido en el listado; esto DEBE quedar
  cubierto por el recorrido E2E de pedidos de QC-35. `[D11]`
- **R30** — El sistema NO DEBE añadir ninguna dependencia de terceros por esta ficha. `[D13]`

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| `[D1]` Qué es | R1, R13 |
| `[D2]` De qué catálogo sale; el selector no crea | R1, R8, R16, R17, R19 |
| `[D3]` Obligatoria al crear y editar; los viejos sin presentación | R2, R6, R7, R11, R18, R19 |
| `[D4]` No afecta cantidad, importe ni inventario | R13, R14 |
| `[D5]` Otra empresa imposible por construcción | R3, R8, R28 |
| `[D6]` Borrar una presentación en uso se rechaza | R4 |
| `[D7]` Se puede cambiar mientras sea editable | R9, R10 |
| `[D8]` La escribe el Administrador; la ve el Operador; sin permiso nuevo | R12, R15, R24, R25, R26 |
| `[D9]` Dónde se ve | R16, R18, R20, R21, R22, R23, R24, R25, R27 |
| `[D10]` Terminados del Empacador → QC-145 | R27 |
| `[D11]` E2E ampliando el recorrido de QC-35 | R29 |
| `[D12]` Borrado lógico e identificadores en inglés | R5 |
| `[D13]` Sin dependencias nuevas | R30 |

## Preguntas abiertas

1. **El texto de `presentation_in_use` ya no es cierto.** El catálogo de errores dice «La
   presentacion tiene productos asignados y no se puede borrar.»
   (`lib/modules/errores/domain/error-catalog.ts:77`), pero con esta ficha el borrado lo puede
   bloquear un **pedido**, y ya hoy lo puede bloquear una línea de catálogo de proveedor. R4 prueba
   el **código**, no la frase. **Posición por defecto del diseño: esta ficha no cambia el texto.**
   Si el humano quiere una frase que no nombre «productos», es un cambio de una línea en el catálogo
   más su test, y se decide en F1.4.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-22 | ¿Qué es «la presentación del pedido»? | El **envase en que se entrega lo fabricado** (bidón, tambor, saco). No es la unidad de la cantidad |
| 2026-09-22 | ¿De qué catálogo sale? | **El catálogo existente** `presentations` (Configuración › Presentaciones, QC-20/QC-45), el mismo de los lotes. No nace catálogo propio. Solo se elige de las existentes: el selector no crea (heredado del selector de unidad de QC-35) |
| 2026-09-22 | ¿Es obligatoria? | **Sí, al crear y al editar.** Los pedidos que ya existen quedan **sin presentación** —en la base la columna admite vacío por ellos— y no se rellenan con una por defecto (regla 6). Al editar uno de esos hay que elegirla para guardar |
| 2026-09-22 | ¿Afecta a cantidad, importe o inventario? | **No: solo informa.** La cantidad sigue en unidades de la receta, `ingredients_cost` (QC-123) no cambia y no se descuentan envases del inventario |
| 2026-09-22 | ¿Presentación de otra empresa? | **Imposible por construcción**: FK compuesta con `company_id`, como las del pedido desde QC-60 |
| 2026-09-22 | ¿Y si se intenta borrar una presentación usada por un pedido? | **Se rechaza** por la FK (`ON DELETE RESTRICT`); el borrado de presentaciones ya es físico y bloqueado por FK. *Heredado de QC-20 D6 y QC-45* |
| 2026-09-22 | ¿Se puede cambiar? | **Sí, mientras el pedido sea editable** (`PENDIENTE`/`EN_CURSO`); `ENTREGADO` y `CANCELADO` no admiten edición. *Heredado de QC-34 D8* |
| 2026-09-22 | ¿Quién la escribe y quién la ve? | La escribe quien crea/edita pedidos: **solo el Administrador** (QC-34 D1). La ven también quienes llegan por `asignaciones` (Operador), porque quien prepara necesita saber el envase. **No nace permiso nuevo** |
| 2026-09-22 | ¿Dónde se ve? | **Alta y edición** (panel lateral de `/pedidos`), **listado de pedidos** (columna, solo se muestra, sin filtro ni orden —mismo criterio que el importe, QC-123/QC-68—) y **`/asignacion`**: su lista y la pantalla de ejecución. Los pedidos viejos se muestran «sin presentación» |
| 2026-09-22 | ¿Y en los terminados del Empacador? | **Sí, pero lo pinta QC-145**, que aún no existe; queda bloqueada por esta (issue link escrito en el board el 2026-09-22) |
| 2026-09-22 | ¿E2E? | **Sí, ampliando el recorrido de pedidos de QC-35**: crear con presentación → verla en la lista. Es barato porque Playwright y el recorrido ya existen |
| 2026-09-01 | Forma de la tabla | Borrado **lógico** de pedidos intacto e **identificadores en inglés**. *Heredado de QC-4/QC-33* |
| 2026-09-22 | ¿Dependencias nuevas? | **Ninguna** |
