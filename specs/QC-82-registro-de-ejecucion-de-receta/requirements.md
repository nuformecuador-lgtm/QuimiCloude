# QC-82 — registro-de-ejecucion-de-receta · requirements.md

> **Zona** `fullstack` · **Complejidad** `high` · **depends_on** `QC-63` ·
> **Rama** `feature/QC-82-registro-de-ejecucion-de-receta`
>
> ## Alcance
>
> Queda constancia de cómo se ejecutó cada pedido en planta: cada **arrancar, retomar, avanzar,
> retroceder, cancelar y finalizar** se anota con el instante, el pedido, quién, la posición del
> paso y, solo al cancelar, el motivo. La ficha **lo conecta a la pantalla de ejecución** de QC-63,
> que gana un botón para **cancelar el pedido con motivo**, y que al **reentrar** en un pedido
> `EN_CURSO` lo **devuelve al último paso anotado**.
>
> ## Lo que NO entra
>
> - **Purgar el registro** pasados X días desde que el pedido termina, con un cron automático y
>   X en `.env` → **QC-124** (`purga-del-registro-de-ejecucion`). Esta ficha no borra nada.
> - **Una pantalla para consultar el recorrido** (quién, cuánto tardó, dónde volvió atrás): sin
>   ficha; el registro queda escrito y legible por la base.
> - **Guardar lo que el operario marcó** dentro de cada paso: sigue fuera, como fijó QC-63.
>
> _Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-08 | ¿Qué acciones hay? | Arrancar, avanzar, retroceder, cancelar y finalizar. **Enmendada el 2026-09-18** por la fila «¿Qué pasa al reentrar?»: se añade **retomar**, y son **seis** y ninguna más |
| 2026-09-08 | ¿El motivo puede quedar vacío? | **Sí**: la mayoría de las acciones no lo llevan |
| 2026-09-08 | ¿Se puede cancelar sin motivo? | **No.** Quien abandona una ejecución tiene que explicar por qué |
| 2026-09-18 | ¿El motivo acompaña a otras acciones? | **Solo a cancelar**: existe **si y solo si** la acción es cancelar, garantizado **en la base**, igual que `orders_cancellation_reason_matches_status` de **QC-34**. Retroceder sigue siendo un clic sin preguntas |
| 2026-09-18 | ¿La ficha conecta el registro a la pantalla o solo lo construye? | **Lo conecta**: QC-63 ya cerró sin él. Abrir anota arrancar (o retomar), Siguiente y Anterior anotan avanzar y retroceder, Finalizar anota finalizar. Por eso la ficha pasa a **`fullstack`** |
| 2026-09-18 | ¿Qué le pasa al pedido al cancelar la ejecución? | **Se cancela el pedido** (`CANCELADO`), por el camino único de cancelación de **QC-34** (`cancelOrder`, que ya admite `EN_CURSO`), no escribiendo la columna. La pantalla gana un **botón de cancelar que pide el motivo** |
| 2026-09-18 | ¿Quién puede cancelar desde la pantalla? | **Cualquier responsable asignado al pedido**, con **`asignaciones.consultar`**, mediante un **caso de uso nuevo de `asignaciones`** que pregunta al contrato de `pedidos`. Mismo camino que **QC-63** abrió para `EN_CURSO` y `ENTREGADO`. **El seed de permisos no cambia**: el Operador sigue sin `pedidos.modificar` |
| 2026-09-18 | ¿El motivo de cancelar va también al pedido? | **Sí, el mismo texto**: se escribe una vez y queda en la anotación y en el motivo de cancelación del pedido |
| 2026-09-18 | ¿Qué se guarda del paso? | **Su posición.** **Riesgo aceptado**: si luego se edita la receta, la posición puede señalar otro paso distinto del que vio el operario |
| 2026-09-18 | ¿Qué es «el tiempo»? | **El instante de la acción**, una sola columna. Cuánto se estuvo en un paso se calcula restando la anotación siguiente; no se guarda duración |
| 2026-09-18 | ¿Si falla anotar, se bloquea al operario? | **Avanzar y retroceder no se bloquean**: el paso cambia y esa anotación se pierde. **Arrancar, retomar, finalizar y cancelar** van en la **misma operación** que el cambio que hacen: o se guardan las dos cosas o ninguna |
| 2026-09-18 | ¿Qué pasa al reentrar en un pedido `EN_CURSO`? | **Se anota «retomar»** y la pantalla **vuelve al último paso anotado** de ese pedido. Consecuencia aceptada: como avanzar y retroceder pueden perderse, puede volver a un paso anterior al real. Lo marcado dentro de los pasos no se recupera (QC-63 no lo guarda) |
| 2026-09-18 | ¿Cuánto se conserva? | **Esta ficha no borra ni edita nada**: una anotación escrita no se corrige. La purga, **X días después de que el pedido termina** (entregado o cancelado), con **cron automático** y **X en `.env`**, va en **ficha nueva** |
| 2026-09-18 | ¿El pedido es obligatorio? | **Sí.** La ficha dudaba porque QC-63 iba a abrir recetas sin pedido; QC-63 cerró ejecutando **solo desde un pedido asignado** |
| 2026-09-18 | ¿Se acota por empresa? | **Sí, con columna propia**, heredado del arco multiempresa (**QC-48, QC-49, QC-59, QC-60**). La ficha lo dudaba porque `orders` no tenía empresa; **QC-60 ya se la dio** |
| 2026-09-18 | Identificadores | **En inglés**. Heredado de la **feature 4** |
| 2026-09-18 | ¿Hace falta E2E? | **Sí**: cambia el estado del pedido y es un flujo de permisos (`CHECKPOINTS.md`). Mínimo: el Operador abre un pedido, avanza dos pasos, **recarga y vuelve al paso 3**; y cancela otro con motivo y el pedido queda `CANCELADO` con ese motivo |
| 2026-09-18 | ¿Librería? | **Ninguna nueva** |
