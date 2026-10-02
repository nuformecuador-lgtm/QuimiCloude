# QC-174 — crear-versiones-en-la-receta · requirements.md

> **Zona:** `frontend` · **Complejidad:** — (la asigna el leader en F1.1) · **depends_on:** `QC-172` (done) ·
> **Rama:** `feature/QC-174-crear-versiones-en-la-receta`
>
> **Alcance.** Desde la ficha de una receta se crean, editan, ven y borran sus versiones, con la regla del
> 100 % visible mientras se edita y la diferencia con la original marcada línea a línea. Al guardar la
> original con versiones, un aviso con una casilla por versión deja elegir a cuáles propagar y señala las
> que quedan por revisar. Los pasos de una versión se muestran en solo lectura, y son los de la original.
>
> **Lo que NO entra.** El modelo, las operaciones de servidor y el selector de versión del pedido
> (**QC-172**, cerrada). Las fases de los pasos (**QC-173**). Descripción e imagen propias de la versión
> (descartadas en QC-172 > P3: usa las de la original).
>
> Sembrado por `/afinar-feature` el 2026-10-02. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). Cada requisito cita entre corchetes la fila de «Decisiones
> cerradas» que lo funda, numeradas en el orden de la tabla: **[D1]** página propia por versión, lista
> en la ficha, editor de líneas reutilizado · **[D2]** diferencia por línea · **[D3]** casillas de
> propagación y «por revisar» · **[D4]** E2E · **[D5]** permisos · **[D6]** sin descripción ni imagen
> propias · **[D7]** pasos en solo lectura · **[D8]** borrar · **[D9]** estados y librerías.
> **[A]** = el bloque de Alcance (regla del 100 % visible mientras se edita).
>
> ⚑ = requisito escrito con la **opción recomendada** de una pregunta abierta de este archivo; se
> confirma o se corrige en F1.4.
>
> Vocabulario (el de QC-172). **Original**: receta que no es versión de ninguna. **Versión**: receta
> vinculada a una original. **Viva**: no dada de baja. **Por revisar**: versión cuyas líneas no suman
> exactamente 100,00 % (QC-172 R21); lo calcula el servidor y la pantalla lo pinta tal cual llega.
> **Ficha de la receta**: la página `/produccion/formulas/[id]` de una original. **Página de la
> versión**: `/produccion/formulas/[id]/versiones/[versionId]`. **Página de alta de versión**: la ruta de
> alta bajo la misma receta. **Editor de líneas**: el campo de ingredientes que ya usa el formulario de
> receta. «No encontrada» = el mismo estado identificable, con enlace a la lista, que hoy pinta la
> ficha para `recipe_not_found`.

### A. La ficha de la original

**R1.** CUANDO se abre la ficha de una receta original, el sistema DEBE mostrar una sección «Versiones»
con sus versiones vivas, en el orden por nombre en que las devuelve el servidor, cada una con su nombre
propio y un enlace a su página de la versión. [D1]

**R2.** MIENTRAS una versión de esa lista esté por revisar, el sistema DEBE mostrar junto a ella la
marca «Por revisar»; una versión que no lo esté NO DEBE llevarla. [D1] [D3]

**R3.** SI la original no tiene ninguna versión viva, ENTONCES la sección «Versiones» DEBE mostrar un
estado vacío con texto propio, sin lista. [D1] [D9]

**R4.** La ficha de una original DEBE ofrecer la acción «Nueva versión», que lleva a la página de alta
de versión de esa receta. [D1]

**R5.** SI al abrir la ficha no se pueden leer las versiones de la original, ENTONCES el sistema DEBE
mostrar el estado de error de las pantallas de fórmulas en lugar del formulario —nunca un formulario
que pueda guardar la original sin ofrecer la propagación—. [D9] [D3]

**R6.** La lista de fórmulas NO DEBE mostrar ninguna versión, tampoco después de crear una desde esta
pantalla. [D1]

**R7.** CUANDO se abre `/produccion/formulas/[id]` con el id de una versión viva, el sistema DEBE
llevar a la página de esa versión bajo su original, sin pintar el formulario de receta. [D1]

### B. Alta y edición de una versión

**R8.** CUANDO se abre la página de alta de versión de una original viva, el sistema DEBE mostrar un
campo de nombre vacío y el editor de líneas de la receta precargado con las líneas actuales de la
original. [D1]

**R9.** CUANDO se abre la página de una versión viva bajo su original, el sistema DEBE mostrar como
título su nombre mostrado («‹original› · ‹versión›»), el campo de nombre con su nombre propio y el
editor de líneas con sus líneas, incluidas las de un producto dado de baja. [D1]

**R10.** SI la página de alta o la de una versión se abre con un `[id]` que no es una original viva de
la empresa, o con un `[versionId]` que no es una versión viva de ese `[id]`, ENTONCES el sistema DEBE
mostrar el estado «no encontrada», sin formulario. [D1] [D9]

**R11.** MIENTRAS se editan las líneas en la página de alta o en la de una versión, el sistema DEBE
mostrar en todo momento la suma de los porcentajes y lo que falta para 100,00 %, y el botón de guardar
DEBE estar deshabilitado mientras la suma no sea exactamente 100,00 % o alguna línea no tenga
ingrediente. [A] [D1]

**R12.** CUANDO se guarda el alta de una versión con un nombre y unas líneas válidas, el sistema DEBE
crearla con el nombre y exactamente las líneas que muestra el editor, llevar a la ficha de la original
y avisar del éxito; la nueva versión DEBE aparecer en la sección «Versiones». [D1]

**R13.** CUANDO se guarda la edición de una versión con un nombre y unas líneas válidas, el sistema
DEBE reemplazar su nombre y sus líneas por los del formulario, llevar a la ficha de la original y
avisar del éxito. [D1]

**R14.** CUANDO se pulsa «Cancelar» en la página de alta o en la de una versión, el sistema DEBE llevar
a la ficha de la original sin invocar ninguna operación de guardado. [D1]

**R15.** SI el guardado de una versión responde nombre duplicado, ENTONCES el sistema DEBE mostrar su
mensaje junto al campo de nombre; SI responde cualquier otro error —incluido el de falta de permiso—,
ENTONCES DEBE mostrarlo en la región de error del formulario, y el error inesperado con su
identificador. En ningún caso DEBE navegar ni perder lo escrito. [D9] [D5]

**R16.** MIENTRAS el guardado de una versión está en curso, el botón de guardar DEBE estar
deshabilitado y decir «Guardando…». [D9]

### C. Diferencia con la original

**R17.** MIENTRAS se edita una versión —en la página de alta o en la suya—, cada línea con ingrediente
elegido DEBE llevar una de estas marcas respecto de las líneas actuales de la original: «Igual» si la
original tiene ese ingrediente con el mismo porcentaje; «Cambiado», con el porcentaje de la original al
lado, si lo tiene con otro; «Añadido» si la original no lo tiene. Una línea sin ingrediente NO DEBE
llevar marca. [D2]

**R18.** MIENTRAS se edita una versión, cada ingrediente de la original que no esté en ninguna línea
de la versión DEBE mostrarse como «Quitado», con su porcentaje en la original, fuera de las líneas
editables y sin contar en la suma. [D2]

**R19.** CUANDO cambia cualquier línea del editor —ingrediente, porcentaje, añadir o quitar—, las
marcas de R17 y R18 DEBEN recalcularse en ese mismo render. Dos porcentajes iguales por valor DEBEN
marcarse «Igual» aunque se escriban distinto (`5`, `5,0` y `5,00`); un porcentaje que todavía no es un
número válido DEBE marcarse «Cambiado» si la original tiene el ingrediente. [D2]

### D. Lo que la versión hereda de su original

**R20.** La página de una versión DEBE mostrar la descripción y la imagen de su original como
información de solo lectura, sin ningún campo para cambiarlas; la página de alta NO DEBE ofrecer
campos de descripción ni de imagen. [D6]

**R21.** La página de una versión DEBE mostrar los pasos de su original en solo lectura, sin editor de
pasos ni ningún control que los cambie; SI la original no tiene pasos, ENTONCES DEBE mostrar un texto
de vacío. [D7]

**R22.** El guardado de una versión —alta o edición— DEBE enviar solo su nombre y sus líneas; NO DEBE
enviar pasos, descripción ni imagen. [D6] [D7]

**R23.** MIENTRAS la versión que se abre esté por revisar, su página DEBE mostrar la marca «Por
revisar». [D3]

### E. Guardar la original: propagación

**R24.** CUANDO se guarda la ficha de una original que tiene N ≥ 1 versiones vivas y el formulario pasa
su validación, el sistema DEBE, antes de invocar el guardado, abrir un aviso «N versiones parten de
esta receta» (en singular si N = 1) con una casilla por versión, con su nombre, todas marcadas. [D3]

**R25.** CUANDO en ese aviso se confirma «Guardar y propagar», el sistema DEBE guardar la original
indicando para propagar exactamente las versiones cuya casilla está marcada. MIENTRAS no haya ninguna
casilla marcada, esa acción DEBE estar deshabilitada. [D3]

**R26.** CUANDO en ese aviso se elige «Guardar sin propagar», el sistema DEBE guardar la original sin
indicar ninguna versión. [D3]

**R27.** CUANDO ese aviso se cierra sin elegir ninguna de las dos acciones, el sistema NO DEBE invocar
el guardado y el formulario DEBE conservar lo escrito. [D3]

**R28.** SI la original no tiene ninguna versión viva, ENTONCES guardar su ficha DEBE comportarse
exactamente como hoy, sin aviso. [D3]

**R29.** ⚑ (P1) CUANDO termina un guardado con propagación y la respuesta del guardado indica que una
o más de las versiones propagadas han quedado por revisar, el sistema DEBE quedarse en la ficha de la
original, avisar del éxito y mostrar, hasta que el usuario salga de la ficha, un aviso persistente que
nombra esas versiones —y solo esas—, cada una con un enlace a su página. [D3]

**R30.** CUANDO termina un guardado de la original —con o sin propagación— sin ninguna versión por
revisar en la respuesta, el sistema DEBE comportarse como hoy: aviso de éxito y vuelta a la lista de
fórmulas. [D3]

**R31.** SI el guardado de la original con propagación falla, ENTONCES el sistema DEBE mostrar el error
en la región de error del formulario como hoy, sin navegar ni perder lo escrito. [D3] [D9]

### F. Borrar

**R32.** Cada versión de la sección «Versiones» DEBE ofrecer «Borrar», con una confirmación que la
nombra y dice que no se puede deshacer; sin confirmar NO DEBE invocarse ninguna operación. CUANDO se
confirma, el sistema DEBE dar de baja solo esa versión y la sección DEBE dejar de mostrarla, con la
original y las demás versiones intactas. [D8]

**R33.** CUANDO se abre la confirmación de borrar una receta original que tiene N ≥ 1 versiones vivas,
el texto DEBE decir que se borrarán también sus N versiones (en singular si N = 1); con N = 0, el texto
DEBE ser el de hoy. [D8]

**R34.** MIENTRAS la confirmación de borrar una original está averiguando cuántas versiones tiene, el
botón de confirmar DEBE estar deshabilitado; SI no se puede averiguar, ENTONCES el diálogo DEBE mostrar
el error y mantener deshabilitado el botón de confirmar. [D8] [D9]

**R35.** SI el borrado de una receta o de una versión falla, ENTONCES el diálogo DEBE seguir abierto
con el error a la vista, como hoy. [D9]

### G. Permisos, plataforma y verificación

**R36.** La página de alta de versión y la página de una versión DEBEN exigir `recetas.consultar`
antes de leer ningún dato y, sin él, responder como las demás pantallas privadas sin ese permiso (404
que no nombra el módulo). Crear, editar, borrar y propagar dependen de `recetas.modificar`, que valida
el servidor (QC-172 R38); la pantalla NO DEBE añadir una regla de permiso propia. [D5]

**R37.** Todo control nuevo de estas pantallas —botones, enlaces, casillas— DEBE tener un objetivo
táctil de al menos 44×44 px, y todo campo de texto nuevo un tamaño de letra de al menos 16 px
(`docs/architecture.md > Regla: multiplataforma`). [D9]

**R38.** El sistema DEBE tener una prueba E2E que crea una versión desde la ficha de una original, la
edita, guarda la original propagando y comprueba en Postgres cuál de las versiones propagadas ha
quedado por revisar —suma de líneas distinta de 100,00 %— y cuál no, y que la pantalla marca «Por
revisar» solo a la primera. [D4]

**R39.** Esta ficha NO DEBE añadir ninguna dependencia a `package.json`. [D9]

## Preguntas abiertas

Nueva de F1.2; no reabre la tabla de decisiones. Lleva la opción recomendada, que es con la que está
escrito el requisito marcado ⚑.

**P1. La Server Action de guardar la original no devuelve qué versiones quedaron por revisar (R29).**
Hallazgo medido en el código: el caso de uso `updateRecipe` sí devuelve `propagated: [{ versionId,
isUnderReview }]` (QC-172 R19, `lib/modules/recetas/domain/update-recipe.ts:24-28,159`), pero
`updateRecipeAction` lo descarta y responde solo `{ status: 'success' }`
(`lib/modules/recetas/adapters/driving/recipe-actions.ts:63-66,169-173`). La pantalla, que es lo único
que esta ficha toca, no puede leerlo.
- **(a) Recomendada.** Ampliar el estado de éxito de `updateRecipeAction` con `propagated` (una línea en
  el adaptador *driving* y su test; sin tocar dominio, puerto ni base). Es lo que dice D3 —«lo devuelve
  el servidor, QC-172 R19»— y da el resultado de **esa** escritura, sin una segunda lectura en la que
  otra persona haya podido tocar ya una versión. Coste: la ficha es `frontend` y esta task la hace
  `backend_dev`, en un archivo de `lib/`.
- (b) Tras el guardado, volver a pedir `listRecipeVersionsAction(originalId)` y cruzar `isUnderReview`
  con las versiones propagadas. No toca servidor; a cambio son dos peticiones y lo que se pinta es el
  estado del instante de la segunda, no el resultado del guardado.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-02 | ¿Dónde se crean y editan las versiones? | **Página propia por versión**: `/produccion/formulas/[id]/versiones/[versionId]` para editar, y una ruta de alta bajo la misma receta. La ficha de la receta lista sus versiones vivas, ordenadas por nombre, con la marca «por revisar»; las versiones no salen en la lista de fórmulas. Se reutiliza el editor de líneas de la receta; no se crea otro. |
| 2026-10-02 | ¿Se marca qué cambió respecto a la original? | **Sí, por línea**: cada ingrediente de la versión se marca como igual, cambiado (con el % de la original al lado), añadido o quitado. |
| 2026-10-02 | ¿Cómo se elige a qué versiones propagar? | **Casillas**: al guardar una original con versiones vivas, aviso «N versiones parten de esta receta» con una casilla por versión, todas marcadas por defecto, y opción de guardar sin propagar. Tras guardar se señalan las que quedaron por revisar (lo devuelve el servidor, QC-172 R19). |
| 2026-10-02 | ¿Hace falta E2E? | **Sí, uno**: crear una versión, editarla, guardar la original propagando y comprobar en Postgres qué versión quedó por revisar. La propagación cambia fórmulas que luego reservan material. |
| 2026-10-02 | ¿Quién puede crear versiones? | **Heredado de QC-172 R38**: crear, editar y borrar versiones y guardar con propagación piden `recetas.modificar`; ver, `recetas.consultar`. Sin permiso propio. |
| 2026-10-02 | ¿Descripción e imagen propias? | **No. Heredado de QC-172 P3 (a)**: la versión muestra las de su original. |
| 2026-10-02 | ¿Pasos editables en la versión? | **No. Heredado de QC-172 D4 / R8**: la página de la versión muestra los pasos de la original, sin editor. |
| 2026-10-02 | ¿Qué pasa al borrar? | **Heredado de QC-172 R23 y R24**: borrar una versión la da de baja solo a ella; borrar la original avisa de que se borran también sus N versiones. |
| 2026-10-02 | ¿Estados y librerías? | **Heredado de las pantallas de `produccion/formulas`**: vacío, cargando y error como ellas; sin dependencias nuevas. |
