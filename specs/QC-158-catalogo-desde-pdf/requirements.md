# QC-158 — catalogo-desde-pdf · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** — · **Rama** feature/QC-158-catalogo-desde-pdf
>
> **Alcance.** Lo que la IA devuelve al leer un **PDF de catálogo** (subido en `/proveedores/[id]` con
> estrategia `catalogo`, por imagen; QC-107/QC-109/QC-111) se convierte en **líneas del catálogo de ese
> proveedor** tras una **revisión humana**: la pantalla muestra lo encontrado, se corrige y solo al
> confirmar se guarda. Las líneas ganan dos campos nuevos, `material` y `measurements`.
>
> **Lo que NO entra.** La receta desde PDF de fórmula (**QC-159**, bloqueada por QC-142). El permiso
> propio de documentos y el montaje en fórmulas (**QC-142**). Poner el prompt definitivo en Vercel y
> firmarlo (**QC-131**, humano). El catálogo visual (**QC-140**), que consume las imágenes que esta
> ficha asigna.
>
> Sembrado por `/afinar-feature` el 2026-09-23. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> **Qué es «el sistema» aquí.** Cuatro piezas: (1) en `documentos`, la **interpretación** del texto
> que la IA dejó guardado para un PDF de catálogo, la **vista previa** clasificada y la
> **confirmación**; (2) en `proveedores`, los campos nuevos de la línea y la **escritura por
> identidad** (crear o actualizar solo el costo); (3) en `inventario`, la búsqueda de presentaciones
> por nombre; (4) la **pantalla de revisión** bajo `/proveedores/[id]`. Fuera quedan, y no se
> re-especifican, la subida, la cola, la lectura con IA y el recorte (QC-106, QC-107, QC-108,
> QC-109, QC-110, QC-111): esta ficha **lee** lo que ya dejaron.
>
> **Cómo se citan las decisiones.** La tabla no trae etiquetas; se numeran `[D1]`…`[D9]` en el orden
> de sus filas, sin tocarlas: `[D1]` se convierte en líneas del catálogo de ese proveedor · `[D2]`
> revisión antes de guardar · `[D3]` producto existente, solo precios, «cambia» con viejo y nuevo ·
> `[D4]` presentación inexistente, se crea · `[D5]` imagen recortada por línea · `[D6]` `material` y
> `measurements` · `[D7]` fórmulas fuera · `[D8]` permiso `proveedores.modificar` en el service ·
> `[D9]` E2E con IA y cola simuladas. Las **nueve** quedan citadas al menos una vez.
>
> **Decisiones de F1.4.** Los requisitos que nacieron de una pregunta abierta citan ahora su decisión
> cerrada `[F1]`…`[F7]` (nota fechada al final del archivo).

### Entrada a la revisión

**R1.** CUANDO un archivo de una tanda con estrategia **`catalogo`** llega a «listo» en el componente
de carga del detalle de un proveedor, el sistema DEBE ofrecer en la fila de ese archivo un acceso a
**su revisión**, que abre la pantalla de revisión de **ese archivo para ese proveedor**. SI el
archivo está en otro estado, ENTONCES el acceso NO DEBE aparecer. `[D1]` `[D2]` `[F5]`

**R2.** SI la tanda del archivo tiene estrategia **`formula`**, ENTONCES el sistema NO DEBE ofrecer
ninguna revisión ni convertir su texto en nada. `[D7]`

**R3.** SI el archivo pedido no existe, pertenece a otra empresa, no está en «listo» o su tanda no es
`catalogo`, ENTONCES el sistema DEBE responder con **el mismo rechazo** (`invalid_input`) en los
cuatro casos, sin mostrar ninguna línea y sin revelar cuál de ellos ocurrió. `[D1]` `[D8]`

**R4.** SI el proveedor de la ruta no existe, está dado de baja o es de otra empresa, ENTONCES el
sistema DEBE responder `supplier_not_found` y NO DEBE mostrar ni escribir ninguna línea. `[D1]`

### Interpretación del texto de la IA

**R5.** El sistema DEBE interpretar el texto guardado del archivo según la **forma JSON fijada en
`design.md > 3`**, y DEBE tolerar: cercas de código markdown, texto antes o después del objeto,
`"lines": null` (cero líneas), claves ausentes y valores `null` (campo vacío), y claves desconocidas
(se ignoran). Un campo cuyo tipo no encaja DEBE tratarse como vacío, sin descartar la línea. `[F4]`
`[D2]` `[D6]`

**R6.** SI el texto no contiene un objeto JSON interpretable, o su `lines` no es ni lista ni `null`,
ENTONCES el sistema DEBE mostrar que el documento **no se pudo interpretar**, con código
`invalid_input`, sin ninguna línea y sin escribir nada. `[D2]`

**R7.** El sistema NO DEBE modificar el texto guardado en el archivo al interpretarlo: la
interpretación ocurre al abrir la revisión, y el texto sigue siendo el que dejó la IA. `[D2]`

### Vista previa

**R8.** CUANDO se abre la revisión, el sistema DEBE mostrar **una fila por línea interpretada**, en el
orden del documento, con nombre, presentación, unidad leída, costo, compra mínima, tiempo de entrega,
material, medidas e imagen, y NO DEBE escribir nada en la base de datos ni en el almacenamiento.
`[D2]` `[D5]` `[D6]`

**R9.** El sistema DEBE clasificar cada fila en exactamente una de estas clases, identificando la
línea por **(proveedor, nombre normalizado, presentación)** con las mismas normalizaciones que ya
usan el catálogo y las presentaciones:
- **«nueva»**: no hay línea viva con esa identidad (incluye toda línea cuya presentación no existe);
- **«cambia»**: hay línea viva con esa identidad y otro costo; la fila DEBE mostrar el **costo
  actual** y el **costo nuevo**;
- **«sin cambios»**: hay línea viva con esa identidad y el mismo costo;
- **«incompleta»**: falta o no es válido el nombre, la presentación o el costo, o cualquier otro
  campo no cumple su formato; la fila DEBE decir qué campo;
- **«duplicada»**: repite la identidad de una fila anterior del mismo documento. `[D3]`

**R10.** CUANDO el revisor cambia el nombre o la presentación de una fila, el sistema DEBE volver a
clasificarla **antes** de que pueda confirmar. `[D2]` `[D3]`

**R11.** El revisor DEBE poder corregir cada campo de una fila «nueva» e **incluir o excluir** cada
fila. Las filas «incompleta» y «duplicada» DEBEN mostrarse excluidas por defecto; las demás,
incluidas. `[D2]`

**R12.** MIENTRAS una fila sea «cambia» o «sin cambios», el sistema DEBE permitir editar solo su
**costo** y mostrar el resto de sus campos como no editables, porque la confirmación no los escribe.
`[D3]`

### Confirmación

**R13.** El sistema DEBE escribir **solo cuando el revisor confirma**. Salir de la pantalla sin
confirmar NO DEBE dejar ningún cambio en líneas ni en presentaciones. `[D2]`

**R14.** CUANDO se confirma, el sistema DEBE volver a leer el archivo, volver a resolver
presentaciones y líneas existentes **en el servidor** y clasificar con lo que hay en ese momento: NO
DEBE fiarse de la clasificación que envía el navegador. `[D2]` `[D3]`

**R15.** CUANDO se confirma una fila incluida cuya identidad coincide con una línea viva, el sistema
DEBE actualizar **solo su costo** —y el autor y la fecha de la última modificación— y NO DEBE cambiar
su nombre, presentación, unidad, compra mínima, tiempo de entrega, imagen, material ni medidas. Si el
costo es el mismo, NO DEBE escribir la línea. `[D3]` `[F7]`

**R16.** CUANDO se confirma una fila incluida sin línea viva con su identidad, el sistema DEBE crear
la línea en el catálogo **de ese proveedor** con los campos revisados, la imagen asignada, el material
y las medidas, con quien confirma como autor. `[D1]` `[D5]` `[D6]`

**R17.** CUANDO una fila incluida nombra una presentación que no existe en la empresa (comparando por
nombre normalizado), el sistema DEBE **crearla al confirmar**, una sola vez aunque la usen varias
filas, y usarla en las líneas nuevas. `[D4]`

**R18.** El sistema NO DEBE crear ninguna presentación sin unidad, y NO DEBE crear unidades. SI una
fila incluida necesita una presentación nueva y esta no tiene unidad asignada, ENTONCES el sistema
DEBE rechazar la confirmación **entera** diciendo qué filas lo impiden. `[D4]`

**R19.** Para cada presentación nueva, el sistema DEBE **preseleccionar** la unidad visible para la
empresa (de sistema o propia) cuyo nombre o símbolo normalizado coincida con la unidad leída por la
IA, y DEBE dejarla **sin elegir** si no coincide ninguna o coincide más de una; el revisor DEBE poder
elegir cualquiera de las unidades visibles. `[F1]` `[D4]`

**R20.** SI una fila incluida es «incompleta» o «duplicada», o dos filas incluidas comparten
identidad tras las correcciones, ENTONCES el sistema DEBE rechazar la confirmación entera con
`invalid_input` y el motivo por fila, sin escribir nada. `[D2]`

**R21.** La escritura de las líneas de una confirmación DEBE ser **todo o nada**: si una falla,
ninguna línea queda creada ni actualizada. Las presentaciones creadas en esa confirmación PUEDEN
quedar creadas —limitación declarada en `design.md > 8`—, y una segunda confirmación DEBE
reutilizarlas en vez de duplicarlas. `[D1]` `[D4]`

**R22.** CUANDO la misma revisión se confirma dos veces con el mismo contenido, el estado final del
catálogo y de las presentaciones DEBE ser el mismo que tras la primera: ninguna línea ni presentación
duplicada. `[D1]` `[D3]`

**R23.** CUANDO la confirmación termina bien, el sistema DEBE mostrar cuántas líneas se **crearon**,
cuántas se **actualizaron**, cuántas quedaron **sin cambios** y cuántas **presentaciones** se crearon,
y DEBE llevar al detalle del proveedor, donde las líneas ya se ven. `[D1]`

### Imágenes

**R24.** El sistema DEBE mostrar en cada fila el **recorte asignado** de ese mismo archivo, y el
revisor DEBE poder **quitarlo** o **cambiarlo por otro recorte del mismo archivo**. CUANDO se confirma
una fila que crea línea, la imagen asignada DEBE quedar como imagen de la línea; una fila sin imagen
DEBE crear la línea sin imagen. `[D5]`

**R25.** El sistema DEBE proponer la imagen de cada fila emparejando por **página y orden** según
`design.md > 10.3`, y DEBE dejar la fila **sin imagen propuesta** cuando el emparejamiento no sea
unívoco. `[F3]` `[D5]`

**R26.** SI una fila confirmada trae una imagen que no es un recorte existente **de ese archivo y de
esa empresa**, ENTONCES el sistema DEBE rechazar la confirmación entera con `invalid_input`, sin
escribir nada. `[D5]` `[D8]`

### Campos nuevos de la línea

**R27.** La línea del catálogo DEBE admitir **`material`** (texto, opcional) y **`measurements`**
(opcional: diámetro, alto y medida de la boca, con la forma de `design.md > 2.2`). Un material en
blanco o unas medidas sin ningún valor DEBEN guardarse como **ausentes**. `[D6]` `[F2]`

**R28.** La pantalla del catálogo del proveedor DEBE **mostrar** el material y las medidas de cada
línea y DEBE permitir **escribirlos** en el alta y en la edición de una línea, con las mismas reglas
de validación que la importación. `[D6]`

**R29.** CUANDO se edita una línea desde la pantalla del catálogo, el sistema NO DEBE vaciar su
imagen, su material ni sus medidas salvo que el usuario los cambie. `[D5]` `[D6]`

**R30.** El cambio de esquema DEBE ir en una migración con su `down.sql`, que revierta exactamente
las columnas y restricciones que añade, probada contra una **base propia de la rama**, nunca la
compartida del `.env`. `[D6]`

### Permiso y empresa

**R31.** Ver la vista previa y confirmar DEBEN exigir **`proveedores.modificar`**, comprobado en el
service como **primera** operación, antes de leer el archivo, sus recortes o el catálogo. Sin él, el
sistema DEBE responder `unauthorized` sin leer ni escribir nada. `[D8]`

**R32.** La pantalla de revisión DEBE exigir `proveedores.consultar` y `proveedores.modificar` al
abrirse, y SI falta alguno DEBE responder **404** como el resto de pantallas privadas. `[D8]`

**R33.** SI la confirmación necesita crear alguna presentación y el actor no tiene
`inventario.modificar`, ENTONCES el sistema DEBE rechazar la confirmación entera con `unauthorized`
sin escribir ninguna línea. `[F6]` `[D4]` `[D8]`

**R34.** Toda lectura y escritura de esta ficha DEBE quedar acotada a la **empresa del actor**:
archivo, recortes, proveedor, líneas, presentaciones y unidades de otra empresa DEBEN comportarse como
inexistentes. `[D1]` `[D8]`

### Importes

**R35.** El costo, la compra mínima y los valores de las medidas DEBEN viajar como **cadena decimal**
desde el texto de la IA hasta la base, sin pasar por coma flotante; un valor numérico JSON en esos
campos DEBE tratarse como vacío. `[D3]` `[F4]`

### Contrato con el prompt

**R36.** Ningún archivo versionado DEBE contener el texto del prompt de catálogo, ni completo ni en
fragmento reconocible: esta ficha fija **solo la forma** del JSON que acepta, y el borrador de QC-131
(fuera de git) se ajusta a ella. `[D6]` `[F4]`

### Pantalla

**R37.** La pantalla de revisión DEBE funcionar en escritorio y en navegador móvil (iOS y Android):
objetivos táctiles de al menos 44×44 px, campos con letra de al menos 16 px, y ninguna acción
descubrible solo con `:hover`. `[D2]`

### Verificación extremo a extremo

**R38.** DEBE existir un recorrido **E2E**, en Chromium y WebKit, **sin red**, con la IA, la cola y
el almacenamiento (PDF y recortes) simulados, que: suba un PDF de catálogo desde el detalle de un
proveedor, abra su revisión, vea al menos una fila «nueva» y una «cambia» con su costo actual y el
nuevo, corrija un campo, quite una imagen, asigne la unidad de una presentación nueva, confirme, y
compruebe en la base y en la pantalla del catálogo el costo actualizado, la línea nueva con material,
medidas e imagen, y la presentación creada. `[D9]` `[D3]` `[D4]` `[D5]` `[D6]`

## Preguntas abiertas

Ninguna.

*(Las siete que hubo —cuatro sembradas y tres añadidas al medir el código— se cerraron en F1.4 el
2026-09-23; ver la nota fechada al final.)*

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Qué pasa al terminar la lectura? | Lo que devuelve la IA se convierte en **líneas del catálogo de ese proveedor**. |
| 2026-09-23 | ¿Directo o revisado? | **Revisión antes de guardar**: la pantalla muestra lo encontrado, se corrige y solo al confirmar se guarda. |
| 2026-09-23 | ¿Producto que ya está en el catálogo (mismo nombre y presentación)? | Se **actualizan solo sus precios**; en la revisión sale como «cambia» con el precio viejo y el nuevo. |
| 2026-09-23 | ¿Presentación que no existe? | **Se crea** al confirmar, con lo que leyó la IA (ver pregunta 1 sobre su unidad). |
| 2026-09-23 | ¿Imágenes? | Cada línea lleva su **imagen recortada** (QC-110): se ve en la revisión, se puede quitar, y al confirmar queda como imagen de la línea (alimenta QC-140). |
| 2026-09-23 | Campos nuevos de la línea de catálogo | **`material`** (texto, opcional) y **`measurements`** (JSON, opcional: diámetro, alto y medida de la boca). Los lee la IA del PDF y se pueden corregir en la revisión. |
| 2026-09-23 | ¿Fórmulas? | No entran: **QC-159**, bloqueada por QC-142. |
| 2026-09-23 | ¿Permiso? | Revisar y confirmar exige **`proveedores.modificar`** (heredado de QC-107) hasta que QC-142 traiga el permiso propio de documentos. Validado en el service. |
| 2026-09-23 | ¿E2E? | **Sí**: toca importes y datos del catálogo (`CHECKPOINTS.md`), con la IA y la cola **simuladas** para que el gate corra sin red (patrón de QC-107). |

### Nota fechada — 2026-09-23, F1.4: preguntas abiertas cerradas

El humano aprobó el spec y aceptó **tal cual** las siete propuestas de `design.md > 10`. Pasan a
decisiones cerradas con las etiquetas `[F1]`…`[F7]`, que citan los requisitos afectados. La tabla de
arriba no se toca.

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | `[F1]` Unidad de una presentación nueva | El revisor **elige** entre las unidades visibles para la empresa, **preseleccionada** si la unidad leída coincide exactamente con una por nombre o símbolo normalizado. Sin unidad **no se confirma**. **No se crean unidades.** (R18, R19) |
| 2026-09-23 | `[F2]` Unidad de cada medida | Diámetro y alto con su unidad **`mm` o `cm`**, tal como se leyó, **sin convertir**; la boca como **texto libre**. (R27) |
| 2026-09-23 | `[F3]` Emparejar imagen y línea | El JSON trae **`page`** por línea; en cada página se empareja **en orden** solo si hay tantas líneas como recortes; si no, **sin imagen propuesta**. El revisor la quita o la cambia por **cualquier recorte del archivo**. (R24, R25) |
| 2026-09-23 | `[F4]` Contrato JSON del prompt | La forma de `design.md > 3`: **ocho datos más `page`**; **enmienda R10 de QC-129**; un costo **numérico** se trata como **vacío**; el texto del prompt, **fuera del repositorio**. (R5, R35, R36) |
| 2026-09-23 | `[F5]` Volver a revisar más tarde | **Pantalla propia** `/proveedores/[id]/importar/[documentoId]`; sin proveedor en la tanda y sin lista de pendientes. (R1, R32) |
| 2026-09-23 | `[F6]` Permiso para crear presentación | Crear presentación exige **también `inventario.modificar`**. (R33) |
| 2026-09-23 | `[F7]` Qué es «precio» | **Solo `cost`**. (R15) |

### Nota fechada — 2026-09-24, decisión humana durante la implementación

Se añade sin tocar R38 ni las tablas de arriba (detalle en `design.md > 16`).

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-24 | ¿Cómo comprueba R38 la imagen de la línea nueva, si la pantalla del catálogo aún no sabe pintar la clave del recorte? | R38 comprueba la imagen **solo en la base**; pintarla con URL firmada es de **QC-140**. Material, medidas, presentación y costo se comprueban en la base y en la pantalla. |

### Nota fechada — 2026-09-25, R2 superado en parte por QC-159

La primera mitad de R2 («SI la tanda es `formula` ENTONCES no ofrecer revisión») queda **superada** por
[`specs/QC-159-formula-desde-pdf/`](../QC-159-formula-desde-pdf/requirements.md): un archivo de fórmula
tiene revisión, pero en **su** pantalla (`/produccion/formulas/importar/[documentoId]`), a la que se llega
desde la ventana de subida del listado de fórmulas. La pantalla de revisión del catálogo **sigue
rechazando** un archivo `formula` (R3, intacto), y sin `reviewHrefFor` la fila sigue sin enlace. Ni R2 ni
las tablas de arriba se reescriben.
