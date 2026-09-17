# QC-103 — lote-y-fecha-de-compra-en-el-alta · requirements.md

> **Zona** `fullstack` · **Complejidad** `medium` · **depends_on** `QC-81` (**`done`**, PR #75) ·
> **Rama** `feature/QC-103-lote-y-fecha-de-compra-en-el-alta`
>
> **Alcance.** El panel de alta de producto gana el campo **fecha de compra** —obligatorio, con hoy
> puesta por defecto y sin admitir futuras—, el campo **lote** pasa a explicar que si se deja vacío
> lo asigna el sistema, y al crear se **muestra el lote que quedó asignado** en el aviso que el panel
> ya da. Incluye el **cambio mínimo de backend** para que el alta devuelva ese lote, y el **E2E** que
> QC-81 difirió expresamente hasta aquí.
>
> **Lo que NO entra.** El correlativo por empresa, la unicidad, el backfill y la validación en el
> servicio → **QC-81**, ya `done`. Un listado de lotes o cualquier pantalla nueva → esto es el panel
> que ya existe desde **QC-90**. La edición del producto, que no conoce el lote → **QC-90 R26**.
> Duplicar en el formulario la regla del lote de solo dígitos → la rechaza el servicio.
>
> Sembrado por `/afinar-feature` el 2026-09-16. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

**R1.** MIENTRAS el panel de alta de producto esté abierto, el sistema DEBE mostrar un campo
**fecha de compra** para el primer lote, distinto del campo de fecha de vencimiento existente.

**R2.** CUANDO se abre el panel de alta de producto, el sistema DEBE mostrar el campo fecha de
compra con la fecha de hoy ya seleccionada `[D3]`.

**R3.** DONDE la fecha de compra se edita en el panel de alta, el sistema DEBE impedir que el
campo quede vacío antes de enviar el formulario, de forma que la interfaz nunca permita un envío
sin fecha escrita. SI la fecha de compra no llega a la Server Action -por una llamada que no pase
por este panel-, ENTONCES el sistema DEBE sustituirla por la fecha de hoy, como ya fija `[D9]`
(heredado de QC-81, no se reabre); esto NO es un rechazo del envío. `[D10]`

> **Enmendado el 2026-09-17.** La redacción original exigía que el sistema RECHAZARA un envío sin
> fecha de compra. Verificado en disco durante la implementación: `purchaseDateSchema` es
> `.nullish()` y `resolverFechaDeCompra` sustituye la ausencia por "hoy" en vez de rechazarla -
> comportamiento heredado de QC-81, que `design.md` marca "no se reabre" (D9). El sistema, en su
> frontera real -la Server Action, una superficie de red-, nunca rechaza una fecha de compra
> ausente: solo el widget de la UI lo hace imposible desde el panel de alta. Reabrir el esquema de
> QC-81 habría requerido una autorización explícita nueva, fuera de lo que esta ficha decidió
> pedir; en su lugar se enmienda R3 para exigir lo que el sistema sí garantiza: que el panel de
> alta nunca permite un envío vacío, y que si la fecha no llega, el servidor la sustituye por hoy.
> **Se acepta explícitamente** que una llamada directa a la Server Action -sin pasar por este
> panel- puede omitir la fecha de compra sin ser rechazada.

**R4.** El sistema DEBE escribir y leer la fecha de compra con el calendario de `react-day-picker`
`[D2]`.

**R5.** SI la persona intenta seleccionar en el calendario de fecha de compra un día posterior a
hoy, ENTONCES el sistema DEBE impedir esa selección sin necesidad de enviar el formulario `[D2]`.

**R6.** DONDE el lote se deja vacío en el alta, el campo lote DEBE mostrar una ayuda que explique
que, si se deja vacío, el sistema le asigna el lote `[D6]`.

**R7.** El sistema DEBE seguir aceptando que la persona escriba el lote a mano en el campo de
texto del alta, sin cambiar su tipo ni su comportamiento de envío `[D6]`.

**R8.** El sistema DEBE tomar los mensajes de rechazo del lote y de la fecha de compra del mismo
esquema de validación que revalida el alta en el servidor, sin duplicar en el formulario ninguna
regla de forma del lote `[D7]`.

**R9.** El campo lote y el campo fecha de compra DEBEN aparecer únicamente en el panel de ALTA de
producto: la edición de producto no DEBE mostrarlos ni enviarlos `[D8]`.

**R10.** CUANDO el alta de producto autoriza la operación, el sistema DEBE validar el permiso
`inventario.modificar` en el servicio antes de crear el producto o el lote `[D9]`.

**R11.** El sistema DEBE hacer viajar la fecha de compra, de cliente a servidor, como fecha civil
en formato `YYYY-MM-DD`, y DEBE ser el adaptador quien la convierta a un tipo de fecha `[D9]`.

**R12.** CUANDO el alta de producto crea el producto y su primer lote, el sistema DEBE devolver el
**valor del lote** que quedó escrito en ese primer lote -el texto que lo identifica, sea el que
generó el sistema o el que tecleó la persona, no el identificador interno de la fila-, junto con
el identificador del producto, reutilizando el dato que la transacción ya calcula sin sumar
ninguna regla ni tabla nueva `[D1] [D4]`.

**R13.** CUANDO el alta de producto agrega un lote a un producto homónimo ya existente, el sistema
DEBE devolver también el **valor del lote** que quedó escrito en ese lote, con el mismo criterio
de R12 `[D1]`.

**R14.** CUANDO el alta de producto termina con éxito, el sistema DEBE mostrar un aviso que nombre
el valor del lote del producto que se acaba de dar de alta, en el mismo aviso que ya se muestra al
crear `[D5]`.

**R15.** SI la persona escribió el lote a mano en el alta, ENTONCES el aviso de éxito DEBE nombrar
el lote tal como se escribió, sin sugerir que el sistema lo generó `[D5]`.

**R16.** El sistema NO DEBE introducir ninguna superficie nueva -pantalla, diálogo o región- para
mostrar el lote asignado, más allá del aviso que el panel de alta ya muestra al crear `[D5]`.

**R17.** El sistema DEBE contar con una prueba de extremo a extremo que dé de alta un producto con
fecha de compra por defecto, guarde con éxito y compruebe que el aviso final nombra el lote
asignado `[D9]`.

## Mapa de decisiones a requisitos

| Decisión (tabla, en orden) | Requisito(s) |
| --- | --- |
| [D1] Backend devuelve el lote asignado | R12, R13 |
| [D2] Fecha de compra con calendario `react-day-picker` | R4, R5 |
| [D3] Valor por defecto: hoy | R2 |
| [D4] Complejidad sigue `medium` | R12 (el requisito solo pide devolver un dato ya calculado, sin migración ni regla nueva) |
| [D5] El lote asignado se enseña en el aviso ya existente | R14, R15, R16 |
| [D6] Se puede seguir tecleando el lote a mano | R6, R7 |
| [D7] El formulario no duplica la regla de solo dígitos | R8 |
| [D8] Solo aparece en el alta | R9 |
| [D9] Autorización, forma de la fecha y verificación heredadas | R10, R11, R17 |
| [D10] **Enmienda a R3** (2026-09-17): la obligatoriedad se cumple en el panel de alta -nunca envía vacío-; si la fecha no llega, el servidor sigue sustituyéndola por hoy, heredado de D9 | R3 |

## Preguntas abiertas

**Ninguna.**

La ficha traía dos y **ninguna sobrevivió a la acotación**, pero por motivos distintos y conviene
que se sepa cuál fue cuál:

- **«¿Dónde se muestra el lote asignado?»** se **cerró** (decisión 4): en el aviso que el panel ya da.
- **«¿Qué se ve mientras el sistema lo está generando?»** **se disolvió, no se contestó**: no hay
  ventana que mirar. El correlativo se genera **dentro de la misma transacción que inserta la fila**,
  en el servidor, así que entre «pedir» y «tener» no existe ningún estado intermedio que pintar.
  Preguntarla habría sido pedir una decisión sobre algo que el diseño de QC-81 ya cerró.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-16 | La pantalla no tiene de dónde leer el lote asignado. ¿Qué se hace con esa promesa? | **La ficha CRECE a `fullstack` y se lo queda**: entra el cambio mínimo para que el alta **devuelva el lote que asignó**. **Medido en disco antes de decidir**: `createProduct` devuelve solo `{ id }` y `ProductView` no lleva el lote —solo `latestBatchUnitId`—, así que ni siquiera releyendo el producto se obtendría. Es el mismo camino que **QC-102**, que nació `frontend` y creció al descubrir que el listado no tenía de dónde sacar los responsables. **La alternativa descartada** fue sacarlo del alcance y abrir ficha nueva, como hizo **QC-85** con el conteo de personas: se rechazó porque dejaría una pantalla donde el sistema asigna un número y no lo dice, que es justo el motivo por el que la ficha existe |
| 2026-09-16 | ¿Sube la complejidad al crecer la zona? | **No: sigue `medium`.** Crece el alcance, no la dificultad: el cambio de backend es **devolver un dato que ya se calcula**, sin migración, sin tabla y sin regla nueva |
| 2026-09-16 | ¿Cómo se escribe la fecha de compra? | **Con el calendario de `react-day-picker`**, que **ya está aprobado e instalado desde QC-55** y tiene su fila en `docs/dependencias.md`. **No entra ninguna dependencia nueva**, así que la regla 7 no se activa. Trae navegación por teclado, ARIA y locale resueltos, y permite mostrar las fechas futuras **como no seleccionables** en vez de rechazarlas después de escribirlas. Descartados el campo nativo del navegador —aspecto dispar entre navegadores y el bloqueo de futuras dependiendo de que lo respete— y el texto libre con formato, que es donde más errores de tecleo aparecen |
| 2026-09-16 | ¿Qué valor trae la fecha al abrir el panel? | **La de hoy, ya puesta.** Quien registra mercancía que acaba de llegar no tiene que escribir nada |
| 2026-09-16 | ¿Dónde se le enseña a la persona el lote que quedó asignado? | **En el aviso que el panel YA muestra al crear** (`toast`, **QC-22 R21**): cambia lo que dice el aviso —«producto creado» pasa a nombrar el lote—, y **no aparece ninguna superficie nueva**. Se descartó dejarlo fijo en el panel, que obligaría a cambiar el comportamiento que QC-22 cerró —el panel se cierra al crear— y a decidir cuándo se limpia. **Coste aceptado y dicho**: el aviso se va solo, así que quien no lo mire en ese momento tendrá que buscar el lote en la lista |
| 2026-09-16 | ¿Se puede seguir tecleando el lote a mano? | **Sí.** El lote sigue siendo **texto** (**QC-81**) y el campo explica que dejarlo vacío significa que lo asigna el sistema. Lo que cambia es la explicación, no la capacidad |
| 2026-09-16 | ¿El formulario duplica la regla del lote de solo dígitos de QC-81? | **No.** Ese caso lo rechaza el **servicio** con su mensaje, y el formulario **ya toma sus mensajes del mismo esquema** que valida el alta: duplicar la regla sería tener dos sitios donde cambiarla y uno se quedaría viejo |
| 2026-09-16 | ¿En qué pantallas aparece el campo? | **Solo en el ALTA.** La edición del producto **no conoce el lote** (**QC-90 R26**) y esta ficha no lo cambia |
| 2026-09-16 | Autorización, forma de la fecha y verificación | **Heredados, no se reabren.** La autorización se valida **en el service** con `inventario.modificar` (**QC-20**, **QC-90**) y lleva su test. La fecha viaja como **fecha civil `YYYY-MM-DD`** y la convierte el adaptador (**QC-81**, **QC-90**). **El E2E entra AQUÍ**: QC-81 lo difirió expresamente porque no tenía recorrido que mirar, y `CHECKPOINTS.md` lo exige por tratarse de un **movimiento de inventario**. La UI cumple `docs/architecture.md > Componentes > multiplataforma`, que es obligación de toda pantalla nueva |
| 2026-09-17 | ¿R3 lo cumple el sistema de verdad -rechazo en la Server Action-, o solo lo impide la UI? (**ENMIENDA A R3**, D10) | **Se enmienda R3, no el servidor.** Medido durante la implementación: `purchaseDateSchema` es `.nullish()` y `resolverFechaDeCompra` sustituye una fecha de compra ausente por **hoy**, en vez de rechazarla -comportamiento heredado de **QC-81**, que `design.md` marca explícitamente «no se reabre» (decisión 9 de esta misma tabla). Reabrir ese esquema para que la Server Action rechace de verdad exigiría una autorización nueva, fuera de lo que esta ficha pidió. En su lugar, **R3 pasa a exigir lo que el sistema sí garantiza**: que el panel de alta nunca deja enviar el formulario sin fecha de compra -el campo no admite quedar vacío-, y que si la fecha no llega a la Server Action, el servidor la sustituye por hoy, tal como ya hacía. **Se acepta explícitamente** que una llamada que no pase por este panel -una integración futura, una petición directa- puede omitir la fecha de compra sin que el sistema la rechace |
