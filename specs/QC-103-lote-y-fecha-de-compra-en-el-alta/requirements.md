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

_Pendiente: los escribe spec_author (F1.2)._

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
