# QC-159 — formula-desde-pdf · requirements.md

> **Zona:** `fullstack` · **Complejidad:** `high` · **depends_on:** `QC-142` ·
> **Rama:** `feature/QC-159-formula-desde-pdf`
>
> **Alcance.** Lo que la IA lee de un PDF de fórmula (estrategia `formula`, por texto, subido desde
> el listado /produccion/formulas con el botón de QC-160) se convierte en una RECETA —nombre,
> descripción, ingredientes en porcentaje y pasos— tras una revisión humana en una pantalla propia.
> Cada ingrediente se asigna a un producto existente o se crea como materia prima; si la receta ya
> existe, el revisor elige entre reemplazarla o crear una nueva con otro nombre.
>
> **Lo que NO entra.** El texto del prompt de fórmula en Vercel y su revisión firmada → **QC-157**
> (ficha humana; no bloquea esta, el E2E simula la IA). La subida y el botón → **QC-107/QC-160**,
> ya en dev. Catálogo desde PDF → **QC-158**. Imagen de la receta: la estrategia de fórmula no
> recorta imágenes.
>
> Sembrado por `/afinar-feature` el 2026-09-25. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> **Qué es «el sistema» aquí.** Cuatro piezas: (1) en `documentos`, la **interpretación** del texto
> que la IA dejó guardado para un PDF de fórmula, la **vista previa** y la **confirmación** —el mismo
> reparto que QC-158: `documentos` interpreta y orquesta, el dueño del dato escribe—; (2) en
> `recetas`, la búsqueda de una receta viva por nombre (el alta y la edición ya existen y se
> reutilizan); (3) en `inventario`, la búsqueda de productos por nombre y el alta de una **materia
> prima** desde la revisión; (4) la **pantalla de revisión** `/produccion/formulas/importar/[documentoId]`
> y el acceso «Revisar» en la ventana de subida del listado de fórmulas. Fuera quedan, y no se
> re-especifican, la subida, la cola y la lectura con IA (QC-106, QC-107, QC-109, QC-111, QC-160):
> esta ficha **lee** lo que ya dejaron.
>
> **Cómo se citan las decisiones.** La tabla no trae etiquetas; se numeran `[D1]`…`[D11]` en el orden
> de sus filas, sin tocarlas: `[D1]` revisión antes de guardar · `[D2]` pantalla propia sin lista de
> pendientes · `[D3]` ingredientes en porcentaje, suma exacta 100,00 % · `[D4]` elegir o crear el
> producto · `[D5]` nunca un producto terminado · `[D6]` receta con el mismo nombre: reemplazar o
> renombrar · `[D7]` pasos editables del todo · `[D8]` sin imagen · `[D9]` permisos · `[D10]` E2E con
> IA y cola simuladas · `[D11]` borrado lógico e identificadores en inglés. Las **once** quedan citadas
> al menos una vez.
>
> **Requisitos provisionales.** Los marcados con ⚑ dependen de una pregunta abierta de abajo (`P1`…`P4`)
> y están escritos con la propuesta de `design.md > 11`. Si el humano decide otra cosa, se reescriben
> antes de F2.

### Entrada a la revisión

**R1.** CUANDO un archivo de una tanda con estrategia **`formula`** llega a «listo» en la ventana de
subida del listado de fórmulas, el sistema DEBE ofrecer en la fila de ese archivo un acceso a **su
revisión**, que abre la pantalla de revisión de **ese archivo**. SI el archivo está en otro estado,
ENTONCES el acceso NO DEBE aparecer. `[D1]` `[D2]`

**R2.** El sistema NO DEBE ofrecer una lista de fórmulas pendientes de revisar. La pantalla de
revisión DEBE poder abrirse de nuevo por su dirección y DEBE mostrar lo mismo tras recargar, mientras
el archivo siga en «listo». `[D2]`

**R3.** SI el archivo pedido no existe, pertenece a otra empresa, no está en «listo» o su tanda no es
`formula`, ENTONCES el sistema DEBE responder con **el mismo rechazo** (`invalid_input`) en los cuatro
casos, sin mostrar ningún dato del documento y sin revelar cuál de ellos ocurrió. `[D2]` `[D9]`

### Interpretación del texto de la IA

**R4.** El sistema DEBE interpretar el texto guardado del archivo según la **forma JSON fijada en
`design.md > 3`**, y DEBE tolerar: cercas de código markdown, texto antes o después del objeto,
`null` en cualquier campo (campo vacío), claves ausentes (campo vacío) y claves desconocidas (se
ignoran). Un campo cuyo tipo no encaja DEBE tratarse como vacío, sin descartar el ingrediente ni el
paso que lo contiene. `[D1]`

**R5.** SI el texto no contiene un objeto JSON interpretable, o su `ingredients` o su `steps` no es ni
lista ni `null`, ENTONCES el sistema DEBE mostrar que el documento **no se pudo interpretar**, con
código `invalid_input`, sin ningún dato y sin escribir nada. `[D1]`

**R6.** El sistema NO DEBE modificar el texto guardado en el archivo al interpretarlo: la
interpretación ocurre al abrir la revisión, y el texto sigue siendo el que dejó la IA. `[D1]`

**R7.** ⚑`P3` El sistema DEBE proponer como porcentaje de un ingrediente el valor leído **solo si**,
tras quitar espacios y un `%` final y aceptar la coma como separador decimal, es un número de hasta 3
enteros y 2 decimales, mayor que 0 y no mayor que 100 —venga como cadena o como número JSON—. En
cualquier otro caso (ausente, texto, más de 2 decimales, 0, negativo, mayor que 100) el porcentaje
DEBE llegar **vacío** y la fila DEBE mostrar al lado el valor leído tal cual. El sistema NO DEBE
redondear ningún porcentaje. `[D3]`

**R8.** SI un ingrediente trae **cantidad** o **unidad** leídas, ENTONCES el sistema DEBE mostrarlas
en su fila como referencia de lo que dice el PDF, y NO DEBE convertirlas en porcentaje ni guardarlas
en ninguna parte. `[D3]`

**R9.** El sistema DEBE convertir cada paso leído en un paso de receta **en el orden del documento**,
con **un párrafo por cada línea no vacía** de su texto, y DEBE descartar un paso leído que no tenga
ningún carácter visible. `[D7]`

### Vista previa

**R10.** CUANDO se abre la revisión, el sistema DEBE mostrar el nombre y la descripción leídos, **una
fila por ingrediente** en el orden del documento —nombre leído, porcentaje propuesto, referencia leída
y producto asignado—, los **pasos** en su orden y la **suma** de los porcentajes, recalculada en
cada cambio, y NO DEBE escribir nada en la base de datos. `[D1]` `[D3]`

**R11.** Para cada fila, el sistema DEBE **preseleccionar** el producto vivo de la empresa, que no sea
producto terminado, cuyo nombre normalizado coincida con el nombre leído **si hay exactamente uno**.
SI no hay ninguno, ENTONCES la fila DEBE quedar sin producto y ofrecer **crearlo como materia prima**
con el nombre leído. SI hay más de uno, ENTONCES la fila DEBE quedar sin producto y el revisor DEBE
elegir uno. `[D4]` `[D5]`

**R12.** El revisor DEBE poder, en cada fila: elegir otro producto existente de la empresa, **crearlo
como materia prima** con el nombre leído **editable**, corregir el porcentaje y **quitar** la fila; y
DEBE poder **añadir** una fila eligiendo un producto existente. El selector de producto NO DEBE ofrecer
productos terminados. `[D3]` `[D4]` `[D5]`

**R13.** El revisor DEBE poder corregir el nombre y la descripción, con las mismas reglas que el alta
de receta: nombre obligatorio, de 1 a 120 caracteres tras recortar y que no quede vacío al
normalizarlo; descripción opcional de hasta 500. `[D1]`

**R14.** El revisor DEBE poder **corregir, borrar, añadir y reordenar** los pasos, con los mismos
límites que la edición de receta (hasta 50 pasos, hasta 30 elementos por paso, ningún paso vacío). Una
revisión **sin pasos** DEBE poder confirmarse. `[D7]`

**R15.** MIENTRAS no haya ninguna fila, alguna fila no tenga producto asignado ni materia prima que
crear, algún porcentaje esté vacío o no sea válido (mayor que 0, hasta 2 decimales), la suma no sea
**exactamente 100,00 %**, haya filas repetidas (R16) o el nombre choque con una receta sin elección
(R17), el sistema DEBE mostrar el motivo nombrando las filas afectadas y NO DEBE permitir confirmar.
`[D3]` `[D4]` `[D6]`

**R16.** SI dos filas tienen asignado el **mismo producto**, o piden crear materias primas con el
**mismo nombre normalizado**, ENTONCES el sistema DEBE marcarlas como **repetidas**, nombrando las
filas, y NO DEBE sumarlas ni fusionarlas por su cuenta. `[D3]` `[D4]`

### Receta con el mismo nombre

**R17.** SI hay una receta viva en la empresa con el mismo nombre normalizado que el de la revisión,
ENTONCES el sistema DEBE avisarlo **antes de confirmar**, nombrando esa receta, y DEBE exigir que el
revisor elija entre **reemplazarla** o **cambiar el nombre**. CUANDO el revisor cambia el nombre, el
sistema DEBE volver a comprobar el choque antes de permitir confirmar. `[D6]`

**R18.** CUANDO se confirma eligiendo **reemplazar**, el sistema DEBE sustituir la descripción, los
ingredientes y los pasos de esa receta por los revisados, **conservando** su identificador, su nombre y
su imagen, **todo o nada**: si algo falla, la receta DEBE quedar como estaba. `[D6]` `[D8]`

**R19.** CUANDO se confirma sin choque de nombre, el sistema DEBE crear una **receta nueva** con el
nombre, la descripción, los ingredientes y los pasos revisados, **sin imagen**, con quien confirma como
autor. `[D1]` `[D8]`

**R20.** SI al confirmar hay una receta viva con el nombre normalizado de la revisión y el revisor no
eligió reemplazar **esa misma**, ENTONCES el sistema DEBE rechazar con `recipe_duplicate_name`. SI eligió
reemplazar una receta que ya no está viva, ENTONCES DEBE rechazar con `recipe_not_found`; y SI su nombre
normalizado ya no coincide con el de la revisión, con `invalid_input`. En los tres casos NO DEBE
escribir nada, tampoco materias primas. `[D6]`

**R21.** Reemplazar una receta NO DEBE modificar ningún pedido ni el coste guardado de ningún pedido:
ese coste se recalcula solo al editar el pedido (QC-123). `[D6]`

### Confirmación

**R22.** El sistema DEBE escribir **solo cuando el revisor confirma**. Salir de la pantalla sin confirmar
NO DEBE dejar ningún cambio en recetas ni en productos. `[D1]`

**R23.** CUANDO se confirma, el sistema DEBE volver a leer el archivo y volver a validar **en el
servidor** todo lo de R15 y R16, los productos asignados y la receta con la que choca, con lo que hay en
ese momento: NO DEBE fiarse de lo que calculó el navegador. `[D1]` `[D4]` `[D6]`

**R24.** SI una fila confirmada apunta a un producto que no existe, está dado de baja o es de otra
empresa, ENTONCES el sistema DEBE rechazar con `invalid_input`; SI apunta a un **producto terminado**,
ENTONCES con `action_not_allowed`. En los dos casos NO DEBE escribir nada. `[D5]`

**R25.** ⚑`P1` CUANDO se confirma una fila que pide crear una materia prima, el sistema DEBE crear en la
empresa del actor un producto de tipo **«Producto»** con el nombre revisado (de 1 a 200 caracteres tras
recortar), **sin lotes**, sin unidad y con existencia 0, y DEBE usarlo como ingrediente de esa fila.
`[D4]`

**R26.** SI al confirmar ya existe **exactamente un** producto vivo de la empresa, no terminado, con el
nombre normalizado de una materia prima que se pide crear, ENTONCES el sistema DEBE **reutilizarlo** en
vez de crear otro; SI existe más de uno, ENTONCES DEBE rechazar la confirmación con `invalid_input` sin
escribir nada. `[D4]`

**R27.** El sistema DEBE comprobar todo lo que puede rechazar la confirmación —R15, R16, R20, R24, R26 y
los permisos de R30 y R31— **antes** de crear ninguna materia prima. La escritura de la receta DEBE ser
**todo o nada**; las materias primas creadas en una confirmación cuya receta falla después PUEDEN quedar
creadas —limitación declarada en `design.md > 7`— y una confirmación posterior DEBE reutilizarlas (R26).
`[D4]` `[D6]`

**R28.** ⚑`P4` CUANDO la misma revisión se confirma dos veces con el mismo contenido, el estado final
de recetas y productos DEBE ser el mismo que tras la primera: ninguna receta ni materia prima
duplicada. `[D1]` `[D6]`

**R29.** CUANDO la confirmación termina bien, el sistema DEBE decir si la receta se **creó** o se
**reemplazó**, cuántas materias primas se **crearon** y cuántas se **reutilizaron**, y DEBE llevar a la
ficha de esa receta. `[D1]`

### Permiso y empresa

**R30.** ⚑`P2` Ver la vista previa y confirmar DEBEN exigir **`recetas.modificar`**, comprobado en el
service como **primera** operación, antes de leer el archivo, las recetas o los productos. Sin él, el
sistema DEBE responder `unauthorized` sin leer ni escribir nada. `[D9]`

**R31.** SI la confirmación necesita crear alguna materia prima y el actor no tiene
**`inventario.modificar`**, ENTONCES el sistema DEBE rechazar la confirmación entera con `unauthorized`,
sin crear la receta ni ningún producto. `[D9]`

**R32.** La pantalla de revisión DEBE exigir `recetas.consultar` y `recetas.modificar` al abrirse, y SI
falta alguno DEBE responder **404** como el resto de pantallas privadas. `[D9]`

**R33.** Toda lectura y escritura de esta ficha DEBE quedar acotada a la **empresa del actor**: archivo,
recetas y productos de otra empresa DEBEN comportarse como inexistentes. `[D9]`

**R34.** Subir un PDF de fórmula DEBE seguir exigiendo `documentos.modificar`, y el botón de subida del
listado de fórmulas DEBE seguir viéndolo solo quien lo tiene. `[D9]`

### Imagen, datos y contrato con el prompt

**R35.** La revisión NO DEBE ofrecer ni proponer ninguna imagen, y NO DEBE leer ni pedir recortes del
archivo. `[D8]`

**R36.** Esta ficha NO DEBE borrar físicamente ninguna receta ni ningún producto, y NO DEBE crear tablas
ni columnas. Todo identificador nuevo —claves del JSON que acepta, campos de entrada y salida, métodos y
tipos— DEBE estar **en inglés**. `[D11]`

**R37.** Ningún archivo versionado DEBE contener el texto del prompt de fórmula, ni completo ni en
fragmento reconocible: esta ficha fija **solo la forma** del JSON que acepta, y el prompt de QC-157
(fuera de git) se ajusta a ella. `[D1]` `[D3]`

### Pantalla

**R38.** La pantalla de revisión DEBE funcionar en escritorio y en navegador móvil (iOS y Android):
objetivos táctiles de al menos 44×44 px, campos con letra de al menos 16 px, y ninguna acción
descubrible solo con `:hover`. `[D2]` `[D7]`

### Verificación extremo a extremo

**R39.** DEBE existir un recorrido **E2E**, en Chromium y WebKit, **sin red**, con la IA, la cola y el
almacenamiento del PDF simulados, con dos casos:
- **reemplazar**: sube un PDF de fórmula desde el listado de fórmulas, abre su revisión desde la
  ventana de subida, ve un ingrediente **preseleccionado**, crea otro como **materia prima**, rellena
  un porcentaje que llegó **vacío** hasta sumar 100,00 %, borra un paso y añade otro, ve el **aviso de
  choque** con una receta sembrada con el mismo nombre, elige **reemplazar**, confirma y comprueba en
  la base y en la ficha de la receta los ingredientes, los pasos, el mismo identificador y la materia
  prima creada sin lotes;
- **renombrar**: con el mismo documento, cambia el nombre, confirma y comprueba que hay una **receta
  nueva** y que la sembrada no cambió.
`[D10]` `[D3]` `[D4]` `[D6]` `[D7]`

## Preguntas abiertas

Cuatro, todas con propuesta en `design.md > 11`. Ninguna reabre la tabla de abajo: nacen al medir el
código contra ella. Los requisitos afectados llevan ⚑.

- **P1 — La materia prima nace sin lote** (R25). QC-90 cerró el 2026-09-10 «el alta SIEMPRE crea
  lote», y [D4] pide crear el producto «con el nombre leído», sin presentación ni costo. **Propuesta:**
  excepción acotada a esta revisión —producto de tipo «Producto», sin lote, sin unidad, existencia 0 y
  sin cantidad de alerta—; el alta manual de inventario sigue creando siempre su lote.
- **P2 — Permiso de la vista previa** (R30). [D9] fija el de confirmar, no el de ver. **Propuesta:**
  `recetas.modificar` también para la vista previa, y **no** `documentos.modificar`: revisar es trabajo
  de recetas, y quien sube no tiene por qué ser quien revisa.
- **P3 — Porcentaje que llega como número JSON** (R7). QC-158 trata un costo numérico como vacío.
  **Propuesta:** aceptarlo si su forma decimal cabe en 3 enteros y 2 decimales, porque con 5 cifras
  significativas la conversión es exacta; lo demás, vacío.
- **P4 — ¿Bloquear la segunda confirmación?** (R28). **Propuesta:** no marcar el archivo, como QC-158:
  la doble confirmación no duplica nada (receta nueva → `recipe_duplicate_name`; reemplazo → mismo
  contenido; materias primas → reutilizadas por R26). Marcarlo exigiría una columna nueva en
  `document_files`.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Directo o revisado? | **Revisión antes de guardar** (decidido al nacer, con QC-158). |
| 2026-09-25 | ¿Dónde se revisa? | **Pantalla propia** `/produccion/formulas/importar/[documentoId]`, sin lista de pendientes. Heredado de QC-158 [F5]. |
| 2026-09-25 | Ingredientes | **En porcentaje**, hasta 2 decimales, > 0, suma **exactamente 100,00 %**; la revisión muestra la suma y **no confirma** si no cuadra; sin líneas no se confirma. Heredado de QC-147 (D4, D5, D14, D15). Un % que la IA no trae llega vacío y lo rellena el revisor. |
| 2026-09-25 | ¿Ingrediente que no existe como producto? | **Elegir o crear.** Se preselecciona el producto si el nombre normalizado coincide; si no, el revisor elige uno existente o lo **crea ahí mismo como materia prima** con el nombre leído (editable). Sin producto asignado la línea no se confirma. |
| 2026-09-25 | ¿Qué productos pueden ser ingrediente? | Nunca un **producto terminado** (heredado de QC-150 R30). |
| 2026-09-25 | ¿Receta con el mismo nombre ya existe? | **El revisor elige**: *reemplazar* sus ingredientes, pasos y descripción por lo leído, o *cambiar el nombre* y crear una receta nueva. La revisión avisa del choque antes de confirmar. |
| 2026-09-25 | ¿Pasos? | **Editables del todo**: corregir, borrar, añadir y reordenar. Una receta sin pasos se puede guardar, como hoy. |
| 2026-09-25 | ¿Imagen? | **No**: la fórmula se procesa por texto. |
| 2026-09-25 | ¿Permiso? | Confirmar exige **`recetas.modificar`** (QC-86); crear un producto desde la revisión exige **también `inventario.modificar`** (análogo a QC-158 [F6]). Validado en el service. Subir sigue con `documentos.modificar` (QC-142). |
| 2026-09-25 | ¿E2E? | **Sí**, con la IA y la cola **simuladas** (patrón de QC-107/QC-158). |
| Heredada de la spec 4 | Borrado e identificadores | Borrado **lógico** e identificadores de base de datos **en inglés**. |
