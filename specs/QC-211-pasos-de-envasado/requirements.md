# QC-211 — pasos-de-envasado · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: — · Rama: feature/QC-211-pasos-de-envasado
>
> **Alcance.** La fórmula guarda una segunda lista de pasos, los de envasado: es opcional,
> va separada de los pasos del operador y la ve solo el empacador. El Administrador la edita en
> alta, edición e importación desde PDF. El empacador la recorre con el mismo paso a paso
> del operador después de pulsar Comenzar empaque, y Terminar empaque es el botón del último paso.
>
> **Lo que NO entra.** Fases en los pasos (QC-173). El estado al que pasa el pedido al terminar el
> empaque (QC-202). Guardar el avance o registrar la ejecución (QC-82). Validar en servidor
> los checks o la espera. Duración de espera configurable.
>
> Sembrado por `/afinar-feature` el 2026-10-05. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Decisiones cerradas

| # | Decisión | Fuente | Cubierta por |
|---|---|---|---|
| D1 | Los pasos de envasado son opcionales: una fórmula sin ellos es válida. | Humano, 2026-10-05 | R1 |
| D2 | Cada paso de envasado tiene el mismo formato y los mismos topes que un paso del operador: documento QC-62, máximo 50 pasos y 30 elementos por paso, sin pasos vacíos. Se guardan aparte de `steps`. | Heredado QC-62 | R2, R3, R4, R17 |
| D3 | Se editan en el formulario de alta y edición, en una sección propia separada de los pasos del operador, con el mismo editor. Solo los edita el Administrador. | Humano 2026-10-05; heredado QC-64 | R6, R7, R8, R9 |
| D4 | Una versión no tiene pasos de envasado propios: hereda los de su original, los muestra solo para leer, y editar la original afecta a todas sus versiones. | Humano 2026-10-05; patrón de versiones actual | R10, R11, R12, R13 |
| D5 | La importación desde PDF separa los pasos de envasado de los del operador. El Administrador los revisa antes de guardar. | Humano, 2026-10-05 | R14, R15, R16, R17, R18 |
| D6 | El empacador ve los pasos de envasado solo después de pulsar Comenzar empaque. El último paso termina con Terminar empaque. Antes de Comenzar no se muestran. | Humano, 2026-10-05 | R19, R20, R21, R22 |
| D7 | La regla de avance es la del operador: no se avanza con checks sin marcar, y hay espera de 5 s por paso, también para Terminar. Se controla solo en el cliente, como hoy. | Humano 2026-10-05; heredado QC-64, QC-125 | R23, R24 |
| D8 | Sin pasos de envasado, la pantalla de empaque se ve como hoy. | Humano, 2026-10-05 | R25 |
| D9 | El operador no ve los pasos de envasado en su ejecución. El empacador no ve los pasos del operador. | Humano, 2026-10-05 | R26, R27 |
| D10 | El empacador lee los pasos con `empaque.modificar`, sin recibir `recetas.consultar` ni `asignaciones.ejecutar`. La autorización va en el caso de uso de empaque. | Heredado QC-168, QC-201 | R28, R29 |
| D11 | Lectura en vivo, sin copia en el pedido: editar los pasos de envasado afecta a los pedidos que ya están en empaque. El avance no se guarda. | Heredado QC-64; ejecución actual | R13, R30, R31 |
| D12 | Una prueba E2E: el Administrador crea la fórmula con pasos de envasado; el empacador comienza, recorre y termina; el operador no los ve. | Humano, 2026-10-05 | R32 |
| D13 | Las fórmulas existentes no se migran: quedan sin pasos de envasado. | Heredado, patrón QC-173 y D1 | R1, R5 |

## Preguntas abiertas
n> **F1.4 aprobado por el humano el 2026-10-05** con un «aprobado» sin matices: se toma el spec tal cual. Prompt de `design.md > 6.2` aprobado como está (T15 manual del humano); P1 = sin control para mover pasos; P2 = el botón del último paso sigue diciendo «Terminar»; al editar, `packingSteps` ausente = lista vacía.

- ~~Cómo separa la IA los pasos de envasado en la importación cuando el PDF no los distingue
  (heurística o prompt). Esto es diseño, lo resuelve `spec_author` en design.md.~~
  **Resuelta en `design.md > 6`:** la separa el **prompt**, no una heurística en código. La IA
  devuelve un campo propio (`packingSteps`); si el PDF no distingue, solo pasan a envasado los
  pasos que claramente son de envasar, tapar, sellar, etiquetar o embalar, y en la duda el paso se
  queda con el operador. El código solo lee los dos campos, y el Administrador lo revisa (R16).
  El texto del prompt vive fuera del repo (`FORMULA_PROMPT`), así que **el humano aprueba el
  añadido propuesto en `design.md > 6.2` y lo carga en `.env` y en Vercel** (task T15).
- **P1 (nueva).** En la revisión de la importación, ¿hace falta un control para **mover** un paso
  de una lista a la otra cuando la IA lo clasifica mal? El spec **no lo incluye**: el
  Administrador quita el paso de una lista y lo escribe en la otra con el mismo editor. Si se
  quiere el control, es un requisito nuevo.
- **P2 (nueva).** El alcance habla de «Comenzar empaque» y «Terminar empaque», y hoy los botones
  dicen «Comenzar» y «Terminar». El spec **no renombra** nada: el botón del último paso lleva el
  mismo texto que el botón Terminar de hoy (R21). Si se quiere el texto largo, se cambia una
  constante.

## Requisitos (EARS)

> Terminología. **Pasos del operador**: la lista que ya existe (`steps`). **Pasos de envasado**:
> la lista nueva. **Fórmula** y **receta** son lo mismo. **Pantalla de empaque**:
> `/asignacion/empaque/[id]`. **Ejecución del operador**: `/asignacion/[id]`.

### Modelo y validación

- **R1.** (D1, D13) El sistema DEBE aceptar el alta y la edición de una fórmula sin pasos de
  envasado. SI la entrada omite la lista de pasos de envasado, ENTONCES el sistema DEBE guardarla
  como lista vacía, y una fórmula con la lista vacía DEBE comportarse en todas las pantallas como
  una fórmula sin pasos de envasado.
- **R2.** (D2) El sistema DEBE validar cada paso de envasado con exactamente las mismas reglas que
  un paso del operador (estructura cerrada del documento, claves desconocidas rechazadas, sin paso
  vacío, como máximo 30 elementos) y DEBE rechazar una lista de más de 50 pasos de envasado. SI
  un paso de envasado o la lista incumple alguna regla, ENTONCES el sistema DEBE rechazar el
  guardado entero sin escribir nada.
- **R3.** (D2) Los topes de los pasos de envasado DEBEN contarse aparte de los del operador: una
  fórmula con 50 pasos del operador y 50 pasos de envasado DEBE poder guardarse.
- **R4.** (D2) El sistema DEBE guardar los pasos de envasado separados de los pasos del operador,
  en el orden recibido. CUANDO se lea una fórmula, el sistema DEBE devolver cada lista intacta,
  en su orden, y sin ningún paso de una lista dentro de la otra.
- **R5.** (D13) CUANDO se aplique la migración UP, toda fórmula existente DEBE quedar con la lista
  de pasos de envasado vacía y con sus pasos del operador sin cambios. CUANDO se aplique la
  migración DOWN, el sistema DEBE quitar los pasos de envasado sin tocar ningún otro dato.

### Edición en el formulario de fórmula

- **R6.** (D3) SI el actor no tiene `recetas.modificar`, ENTONCES el sistema NO DEBE guardar pasos
  de envasado por ninguna vía (alta, edición, importación desde PDF), y DEBE rechazar antes de
  validar la entrada y antes de tocar ningún puerto, igual que hoy con el resto de la fórmula.
- **R7.** (D3) El formulario de alta y el de edición de una fórmula DEBEN mostrar una sección
  «Pasos de envasado», separada de la sección «Pasos», con el mismo editor: añadir un paso,
  escribir con negrilla, cursiva y lista de verificación, quitar un paso y reordenarlos por
  arrastre y por teclado.
- **R8.** (D3) CUANDO se guarde el formulario, el sistema DEBE enviar los pasos de envasado en el
  orden en que el usuario los ve. SI un paso de envasado no es válido, ENTONCES el formulario DEBE
  mostrar el error junto a ese paso de envasado y NO DEBE atribuirlo a ningún paso del operador; y
  el error de un paso del operador NO DEBE aparecer en un paso de envasado.
- **R9.** (D3) CUANDO se abra la edición de una fórmula con pasos de envasado, el formulario DEBE
  cargarlos con sus marcas y listas de verificación intactas, en su orden. Guardar sin tocarlos
  DEBE dejarlos idénticos.

### Versiones

- **R10.** (D4) CUANDO se cree o se edite una versión, el sistema NO DEBE guardar pasos de envasado
  propios de la versión, aunque la entrada los traiga.
- **R11.** (D4) CUANDO se lea una versión, ya sea en su ficha o en la pantalla de empaque de un
  pedido de esa versión, el sistema DEBE devolver los pasos de envasado de su original.
- **R12.** (D4) El formulario de una versión DEBE mostrar los pasos de envasado heredados solo para
  leer, sin ningún control de edición ni de marcado. SI la original no tiene pasos de envasado,
  ENTONCES DEBE mostrar un aviso de que no los tiene.
- **R13.** (D4, D11) CUANDO se editen los pasos de envasado de una original, todas sus versiones
  DEBEN mostrar los pasos nuevos en la siguiente lectura, sin ninguna otra acción.

### Importación desde PDF

- **R14.** (D5) CUANDO se interprete el texto que la IA devolvió para un PDF de fórmula, el sistema
  DEBE leer los pasos de envasado de un campo propio, separado del de los pasos del operador, y
  DEBE convertir cada uno a documento de paso igual que convierte hoy un paso del operador.
- **R15.** (D5) SI el texto de la IA no trae el campo de pasos de envasado, o lo trae a `null`,
  ENTONCES el sistema DEBE tratarlo como lista vacía sin rechazar la lectura. SI lo trae con un
  valor que no es ni lista ni `null`, ENTONCES el sistema DEBE rechazar la lectura igual que
  rechaza hoy un campo de pasos del operador con esa forma.
- **R16.** (D5) La pantalla de revisión de la importación DEBE mostrar los pasos de envasado leídos
  en su propia sección, separada de la de los pasos del operador, con el mismo editor, y el
  Administrador DEBE poder editarlos, añadir y quitar antes de confirmar.
- **R17.** (D5, D2) SI los pasos de envasado de la revisión superan 50 o alguno no es válido,
  ENTONCES la revisión NO DEBE permitir confirmar y DEBE decir el motivo, distinto del motivo de
  los pasos del operador. CUANDO se confirme, el sistema DEBE volver a validar los pasos de
  envasado en el servidor y DEBE rechazar la confirmación entera si alguno no pasa.
- **R18.** (D5) CUANDO se confirme una importación, el sistema DEBE guardar los pasos de envasado
  revisados en la fórmula creada o, si la confirmación reemplaza una fórmula, en la reemplazada,
  sustituyendo los que tenía.

### Pantalla de empaque

- **R19.** (D6) MIENTRAS el pedido esté `POR_EMPACAR`, el sistema NO DEBE entregar los pasos de
  envasado a la pantalla de empaque, y la pantalla NO DEBE mostrar ninguno.
- **R20.** (D6) MIENTRAS el pedido esté `EN_EMPAQUE` a nombre del actor y su receta tenga pasos de
  envasado, la pantalla de empaque DEBE mostrar esos pasos con el mismo paso a paso de la
  ejecución del operador, un paso por pantalla y en su orden, y NO DEBE mostrar el botón Terminar
  fuera del paso a paso.
- **R21.** (D6) En ese paso a paso, el botón del último paso DEBE llevar el texto del botón
  Terminar de hoy. CUANDO se pulse sin estar bloqueado, el sistema DEBE terminar el empaque
  exactamente como lo termina hoy el botón Terminar: misma acción, mismos errores visibles y misma
  navegación al terminar.
- **R22.** (D6) MIENTRAS el pedido esté `EN_EMPAQUE` a nombre de otra persona, el sistema NO DEBE
  entregar los pasos de envasado a la pantalla, y la pantalla NO DEBE mostrar ninguno.
- **R23.** (D7) MIENTRAS el paso actual tenga elementos de lista de verificación sin marcar, o no
  hayan pasado 5 segundos desde que se llegó a él, la pantalla de empaque NO DEBE permitir avanzar
  ni, en el último paso, terminar, y DEBE decir el motivo con texto visible, igual que la ejecución
  del operador.
- **R24.** (D7) La regla de avance de R23 DEBE controlarse solo en el cliente: terminar el empaque
  en el servidor NO DEBE exigir ninguna prueba de que se recorrieron o marcaron los pasos.
- **R25.** (D8) SI la receta del pedido no tiene pasos de envasado (incluida una versión cuya
  original no los tiene, y un pedido cuya receta ya no se encuentra), ENTONCES la pantalla de
  empaque DEBE mostrarse y comportarse en todos sus estados exactamente como hoy.
- **R26.** (D9) La ejecución del operador NO DEBE recibir ni mostrar los pasos de envasado de la
  receta, en ninguna de sus pantallas.
- **R27.** (D9) La pantalla de empaque NO DEBE recibir ni mostrar los pasos del operador de la
  receta.

### Autorización y ámbito

- **R28.** (D10) CUANDO un actor con `empaque.modificar` y sin `recetas.consultar` ni
  `asignaciones.ejecutar` abra un pedido `EN_EMPAQUE` a su nombre, el sistema DEBE entregarle los
  pasos de envasado. SI el actor no tiene `empaque.modificar`, ENTONCES el caso de uso de empaque
  DEBE rechazar antes de validar la entrada y antes de leer ningún puerto, incluido el de pasos de
  envasado.
- **R29.** (D10) El sistema DEBE leer los pasos de envasado solo dentro de la empresa del actor: SI
  la receta del pedido no es de su empresa, ENTONCES NO DEBE entregar ningún paso de envasado.

### Lectura en vivo

- **R30.** (D11) CUANDO se editen los pasos de envasado de una fórmula con pedidos `EN_EMPAQUE`, la
  siguiente apertura de la pantalla de empaque de esos pedidos DEBE mostrar los pasos nuevos. El
  sistema NO DEBE copiar los pasos de envasado al pedido. SI la receta del pedido está dada de baja,
  ENTONCES el empacador DEBE seguir viendo sus pasos de envasado, igual que la ejecución del
  operador sigue mostrando los pasos de una receta dada de baja.
- **R31.** (D11) El sistema NO DEBE guardar el avance del empacador en el paso a paso: CUANDO se
  vuelva a abrir la pantalla de empaque, el recorrido DEBE empezar en el primer paso y sin ningún
  elemento marcado.

### Prueba de punta a punta

- **R32.** (D12) DEBE existir una prueba E2E en la que el Administrador crea una fórmula con pasos
  del operador y pasos de envasado; el operador ejecuta el pedido sin ver ningún paso de envasado;
  el empacador comienza el empaque, no ve los pasos de envasado antes de Comenzar, los recorre
  respetando checks y espera, termina con el botón del último paso, y no ve ningún paso del
  operador.
