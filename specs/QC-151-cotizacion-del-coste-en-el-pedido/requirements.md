# QC-151 — cotizacion-del-coste-en-el-pedido · requirements.md

> **Zona** fullstack · **Complejidad** medium · **depends_on** — · **Rama** feature/QC-151-cotizacion-del-coste-en-el-pedido
>
> **Alcance.** El formulario de pedido (alta y edición) muestra una **cotización del coste de producción**:
> el coste de los ingredientes de la receta elegida para la cantidad tecleada, calculado con
> `resolveIngredientsCost` (QC-123) por una **consulta nueva de solo lectura** que no escribe nada. En
> edición arranca con el importe guardado y se recotiza al cambiar receta o cantidad.
>
> **Lo que NO entra.** El cálculo del coste y cuándo se guarda (**QC-123**: se recalcula al guardar). La
> columna del importe en el listado: descartada por el humano el 2026-09-23. La búsqueda de pedidos
> (**QC-122**).
>
> Sembrado por `/afinar-feature` el 2026-09-23. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Dónde se ve el importe? | En el **formulario** de alta y de edición del pedido, no en el listado (decisión del humano al aprobar QC-122). |
| 2026-09-23 | ¿Qué se guarda? | **Se recalcula al guardar** con los lotes de ese momento (heredado de **QC-123**). La cotización es orientativa; no se persiste lo mostrado. |
| 2026-09-23 | ¿Y en edición? | Al abrir se ve el importe guardado. Si cambian receta o cantidad, se muestra la cotización nueva. |
| 2026-09-23 | ¿Cuándo se recotiza? | **Al dejar de escribir** la cantidad (unos 500 ms después de la última tecla) y al cambiar la receta. Una respuesta vieja no pisa a una nueva. |
| 2026-09-23 | ¿Qué se ve mientras cotiza? | La cifra anterior **atenuada** con «cotizando…»; la primera vez, solo «cotizando…». |
| 2026-09-23 | ¿Formato? | `$ 1,234,567.50`: `$` fijo, coma de miles, punto decimal, dos decimales; valor exacto en el `title` (patrón de **QC-132**). Sin `Intl.NumberFormat` ni coma flotante. |
| 2026-09-23 | ¿Sin importe? | Un guion, nunca un cero (heredado de **QC-123**); también si aún no hay receta o cantidad válida. |
| 2026-09-23 | ¿Permiso? | `pedidos.modificar`, el del formulario, validado en el service. Sin permiso nuevo; el catálogo no cambia. |
| 2026-09-23 | ¿E2E? | **Sí**: los importes son flujo crítico (`CHECKPOINTS.md`). Elegir receta, teclear cantidad, ver la cotización y ver el importe guardado al reabrir. |
