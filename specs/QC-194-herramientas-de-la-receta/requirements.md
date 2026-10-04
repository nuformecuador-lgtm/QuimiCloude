# QC-194 — herramientas-de-la-receta · requirements.md

> **Zona:** fullstack · **Complejidad:** medium · **depends_on:** — · **Rama:** `feature/QC-194-herramientas-de-la-receta`
>
> **Alcance:** una receta (original o versión) declara qué herramientas usa: productos de
> inventario de tipo MACHINE, cada una con una cantidad entera. Se guardan con la receta, se
> editan en el tab «Herramientas» que ya existe en el formulario y el operador las ve, solo para
> leer, en la pantalla de ejecución del pedido.
>
> **Lo que NO entra:** que las herramientas aparten, descuenten o sumen costo de stock; que
> cuenten en el 100 % de los porcentajes; que el import de PDF (QC-159) las detecte.
>
> Sembrado por `/afinar-feature` el 2026-10-03. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). Cada requisito cita entre corchetes la fila de «Decisiones
> cerradas» que lo funda, numeradas en el orden de la tabla: **[D1]** no consumen stock ·
> **[D2]** solo MACHINE, sin repetir · **[D3]** cantidad entera > 0, informativa · **[D4]**
> versiones: copia al nacer y propagación · **[D5]** el operador las ve · **[D6]** PDF: omitidas =
> no tocar · **[D7]** herramienta dada de baja · **[D8]** permisos. **[A]** = el bloque de Alcance.
>
> ⚑ = requisito escrito con la **opción recomendada** de una pregunta abierta de este archivo; se
> confirma o se corrige en F1.4.
>
> Vocabulario. **Herramienta**: par (producto de inventario, cantidad) que una receta declara usar.
> **Herramienta nueva**: la que no estaba ya en la receta que se edita (o, al crear una versión, en
> su original). **Original** / **versión** / **por revisar**: los de QC-172. **Tab «Herramientas»**:
> el que ya existe en el editor de líneas del formulario de receta y del de versión. **Pantalla del
> operador**: `/asignacion/<id>`. «Rechazar» = la operación falla con error de validación y la base
> queda exactamente como estaba.

### A. Qué guarda una receta

**R1.** CUANDO se da de alta o se edita una receta —original o versión— con una lista de
herramientas válida, el sistema DEBE guardar exactamente esa lista (producto y cantidad) con la
receta, en la misma escritura que el resto de la receta, y una lectura posterior de la receta DEBE
devolverla. [A]

**R2.** CUANDO se da de alta una receta sin indicar herramientas, el sistema DEBE guardarla con la
lista de herramientas vacía. [A]

**R3.** SI una herramienta nueva apunta a un producto que no es de tipo MACHINE, ENTONCES el sistema
DEBE rechazar el guardado. [D2]

**R4.** SI la lista de herramientas enviada contiene dos veces el mismo producto, ENTONCES el sistema
DEBE rechazar el guardado. [D2]

**R5.** SI una herramienta nueva apunta a un producto que no existe, que es de otra empresa o que
está dado de baja, ENTONCES el sistema DEBE rechazar el guardado. [D2] [D7]

**R6.** SI la cantidad de una herramienta falta o no es un número entero mayor que 0 (cero,
negativo, con decimales o no numérico), ENTONCES el sistema DEBE rechazar el guardado. [D3]

### B. Las herramientas no tocan stock, costo ni porcentajes

**R7.** El sistema NO DEBE contar las herramientas en la suma de porcentajes de una receta ni en el
cálculo de «por revisar»: una receta con líneas que suman 100,00 % DEBE poder guardarse con
cualquier número de herramientas, y una versión DEBE estar por revisar solo según sus líneas. [D1]

**R8.** CUANDO se crea, se edita o se revisa un pedido bloqueado cuya receta tiene herramientas, lo
que el sistema aparta de los lotes DEBE ser exactamente lo mismo que si la receta no las tuviera:
ningún apartado sobre un lote de un producto que solo es herramienta, y la falta de stock de una
herramienta NO DEBE bloquear el pedido. [D1]

**R9.** CUANDO se consume el material de un pedido cuya receta tiene herramientas, el sistema NO DEBE
registrar ningún asiento de consumo sobre un lote de un producto que solo es herramienta. [D1]

**R10.** El costo de ingredientes de un pedido cuya receta tiene herramientas DEBE ser igual al de la
misma receta sin herramientas. [D1]

### C. Versiones

**R11.** CUANDO se crea una versión sin indicar herramientas, el sistema DEBE darle una copia de las
herramientas actuales de su original —incluidas las de un producto dado de baja—, con sus
cantidades. [D4] [D7]

**R12.** CUANDO se crea una versión indicando herramientas, el sistema DEBE guardar exactamente esas;
solo las que no estén entre las de la original cuentan como herramientas nuevas para R3 y R5. [D4]

**R13.** CUANDO se edita una versión con una lista de herramientas, el sistema DEBE reemplazar las de
la versión por esa lista y NO DEBE cambiar las de su original ni las de otra versión. [D4]

**R14.** CUANDO se guarda una original indicando versiones a las que propagar, para cada una de esas
versiones el sistema DEBE dejar las herramientas así: la que la versión tenía igual (mismo producto
y misma cantidad) que la original antes de guardar sigue a la original de después —toma su nueva
cantidad, o desaparece si la original la quitó—; la que la versión había cambiado, añadido o quitado
se queda como estaba; y la que la original añade y la versión no tenía se añade. [D4]

**R15.** CUANDO se guarda una original con propagación, las versiones no indicadas NO DEBEN cambiar
sus herramientas; y SI la propagación falla por cualquier motivo, ENTONCES ninguna herramienta —ni
de la original ni de ninguna versión— DEBE quedar cambiada. [D4]

**R16.** El resultado «por revisar» que devuelve un guardado con propagación NO DEBE depender de las
herramientas. [D4] [D1]

### D. Edición sin herramientas e import de PDF

**R17.** CUANDO se edita una original o una versión sin enviar la clave de herramientas, el sistema
DEBE conservar exactamente las herramientas que tenía; y CUANDO se envía la lista vacía, DEBE
quitarlas todas. [D6]

**R18.** CUANDO el import de PDF reemplaza una receta existente, el sistema DEBE conservar sus
herramientas tal como estaban; y CUANDO el import crea una receta nueva, esta DEBE nacer sin
herramientas. [D6]

### E. Herramienta dada de baja

**R19.** SI una herramienta que la receta ya tenía apunta a un producto dado de baja, ENTONCES la
edición de esa receta —o el guardado con propagación que la incluye— DEBE aceptarla y conservarla
con su cantidad. [D7]

**R20.** CUANDO se lee una receta con una herramienta de un producto dado de baja, el sistema DEBE
devolverla sin nombre de producto, y el tab «Herramientas» DEBE mostrarla como «no disponible», con
su cantidad, junto al aviso de herramientas no disponibles que ya pinta el tab. [D7]

**R21.** CUANDO se da de baja un producto MACHINE que es herramienta de una o más recetas, el sistema
DEBE completar la baja igual que si no lo fuera, sin bloquearla ni pedir confirmación adicional.
[D7]

### F. El formulario

**R22.** CUANDO se abre el formulario de una original o la página de una versión, el tab
«Herramientas» DEBE mostrar sus herramientas guardadas, cada una con su nombre y su cantidad. [A]

**R23.** CUANDO se abre la página de alta de versión, el tab «Herramientas» DEBE venir precargado con
las herramientas actuales de la original, incluidas las no disponibles. [D4]

**R24.** CUANDO se elige una herramienta en una fila del tab, el sistema DEBE poner su cantidad en 1,
editable; y el selector DEBE ofrecer solo productos MACHINE vivos que no estén ya elegidos en otra
fila del tab. [D2] [D3]

**R25.** SI al guardar el formulario una fila del tab no tiene herramienta elegida o su cantidad no es
un entero mayor que 0, ENTONCES el sistema NO DEBE invocar el guardado y DEBE mostrar el error junto a
esa fila, conservando todo lo escrito. [D3]

**R26.** CUANDO se guarda el formulario —alta y edición de original, alta y edición de versión—, el
envío DEBE llevar exactamente las herramientas del tab (producto y cantidad), incluidas las no
disponibles; y la suma de porcentajes y lo que falta para 100,00 % que muestra el tab de ingredientes
NO DEBEN cambiar al añadir, quitar o modificar herramientas. [A] [D1]

**R27.** SI el servidor rechaza el guardado por las herramientas, ENTONCES el formulario DEBE mostrar
el error en su región de error, sin navegar ni perder lo escrito. [A]

### G. La pantalla del operador

**R28.** CUANDO el operador abre la pantalla de un pedido cuya receta tiene herramientas, el sistema
DEBE mostrar, junto a ingredientes y pasos, un bloque «Herramientas» de solo lectura con el nombre y
la cantidad de cada herramienta de esa receta —las de la versión, si el pedido es de una versión—,
sin ningún control que las cambie. [D5]

**R29.** La cantidad de una herramienta en la pantalla del operador DEBE ser la guardada en la
receta, sin escalar con la cantidad del pedido. [D3] [D5]

**R30.** SI una herramienta de esa receta apunta a un producto dado de baja, ENTONCES el bloque DEBE
mostrarla como «no disponible», con su cantidad. [D5] [D7]

**R31.** ⚑ (P3) SI la receta del pedido no tiene herramientas, ENTONCES la pantalla del operador NO
DEBE mostrar el bloque «Herramientas». [D5]

### H. Permisos, plataforma y dependencias

**R32.** Guardar herramientas —en cualquiera de las operaciones de R1, R13, R14 y R17— DEBE exigir
`recetas.modificar` en el servidor y, sin él, rechazarse sin cambiar nada. Leerlas en el formulario
DEBE exigir `recetas.consultar`; en la pantalla del operador, el permiso que esa pantalla ya exige.
Ninguna de las dos lecturas DEBE añadir un permiso nuevo. [D8]

**R33.** Todo control nuevo del tab «Herramientas» y del bloque del operador DEBE tener un objetivo
táctil de al menos 44×44 px, y todo campo de texto nuevo un tamaño de letra de al menos 16 px
(`docs/architecture.md > Regla: multiplataforma`). [A]

**R34.** Esta ficha NO DEBE añadir ninguna dependencia a `package.json`. [A]

## Preguntas abiertas

Las dos primeras vienen de `/afinar-feature`; P3 y P4 son nuevas de F1.2. Ninguna reabre la tabla.
Cada una lleva la opción recomendada, desarrollada en `design.md > 12`.

**P1. Dónde se guardan.** Recomendada: **tabla aparte `recipe_tools`**, con la misma forma que
`recipe_lines` (receta, producto, cantidad entera; único por receta y producto). Así nada de lo que
hoy lee líneas —sumas, propagación de porcentajes, reservas, consumo, costo— ve una herramienta sin
que nadie la filtre, que es lo que D1 exige. Descartada la columna en `recipe_lines`
(`design.md > 11`).
**Sub-decisión que necesita al humano:** como `recipe_lines`, la tabla nueva no lleva `company_id`
(hereda la empresa de su receta y cae con ella). Eso **añade una novena tabla a la lista cerrada de
exentas** de `docs/architecture.md > Dominio` y de `guard-empresa-en-esquema.test.ts`, que hoy dice
«ocho» y llama BLOQUEANTE a añadir una tabla sin empresa. Alternativa: `company_id` propio con FK
compuesta a `recipes(id, company_id)`, que exige un índice único nuevo en `recipes`.

**P2. ¿Hace falta E2E?** Recomendada: **no**. No es un flujo crítico de `CHECKPOINTS.md`: las
herramientas no mueven inventario ni importes, y lo que lo demuestra (R8–R10) se prueba con tests de
integración contra Postgres real sobre las mismas funciones que reservan, consumen y costean.

**P3. Bloque del operador sin herramientas (R31).** Recomendada: **no se muestra**. Alternativa: un
bloque con el texto «Sin herramientas».

**P4. Marcas de diferencia en las herramientas de una versión.** QC-174 marca cada ingrediente de la
versión como igual / cambiado / añadido / quitado. Recomendada: **no se marcan las herramientas** en
esta ficha (no está en el Alcance y no hay requisito para ello); si se quiere, ficha aparte.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-03 | ¿Las herramientas consumen stock? | No. No se reservan, no se consumen, no suman costo y no entran en el 100 %. Quedan fuera de `buildRequirement`, `syncForOrder`/`consumeForOrder` y `resolve-ingredients-cost`. |
| 2026-10-03 | ¿Qué productos son herramientas? | Solo productos de tipo MACHINE, sin repetir uno en la misma receta. |
| 2026-10-03 | ¿Llevan cantidad? | Sí, un entero mayor que 0 y solo informativo. |
| 2026-10-03 | Versiones | La versión nace con una copia de las herramientas del original y las puede editar. Al editar el original, la propagación a versiones (QC-172, `propagateToVersionIds`) también lleva las herramientas. |
| 2026-10-03 | ¿El operador las ve? | Sí, como un bloque de lectura en `/asignacion/<id>`, junto a ingredientes y pasos. |
| 2026-10-03 | Reemplazar desde PDF (QC-159) | Las herramientas se conservan. En la edición, «herramientas omitidas» significa «no tocar», igual que `image`. |
| 2026-10-03 | Herramienta dada de baja | Heredado del trato de ingredientes: la línea se conserva y se muestra «no disponible». La baja no se bloquea. |
| 2026-10-03 | Permiso | Heredado: `recetas.modificar` para escribir y `recetas.consultar` para leer. |
