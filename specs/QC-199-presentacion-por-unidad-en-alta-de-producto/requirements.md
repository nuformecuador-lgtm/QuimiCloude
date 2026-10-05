# QC-199 — presentacion-por-unidad-en-alta-de-producto · requirements.md

> Zona: fullstack · Complejidad: medium · depends_on: — · Rama: feature/QC-199-presentacion-por-unidad-en-alta-de-producto
>
> **Alcance.** En el alta de un insumo (`PRODUCT`), el formulario deja de pedir una presentación
> y pide la **unidad** directamente. Esa unidad fija `products.unit_id`, igual que hoy lo hace la
> presentación (QC-121). El lote nuevo de un insumo se guarda sin presentación. Las lecturas que
> hoy sacan la unidad de la presentación del lote (vista de lotes, costeo) pasan a sacarla de la
> unidad del producto, para que los lotes viejos y los nuevos se vean igual. El alta de un lote
> sobre un insumo existente sigue buscando el homónimo por nombre + unidad.
>
> **Lo que NO entra.**
> - Envases (`PACKAGING`): siguen eligiendo presentación, porque el reparto del pedido necesita su contenido.
> - Máquinas (`MACHINE`) y producto terminado (`FINISHED_PRODUCT`): sin cambios.
> - Guardar en qué envase llegó el lote: no se guarda. Si hace falta, será otra ficha.
> - Migrar o limpiar los lotes que ya tienen presentación: se quedan como están.
> - Presentaciones que quedan sin uso: no se tocan.
> - Catálogo del proveedor (`SupplierCatalogLine.presentationId`): no se toca.
>
> Sembrado por `/afinar-feature` el 2026-10-04. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-04 | ¿A qué tipos afecta? | Solo `PRODUCT`. `PACKAGING` conserva la presentación (el reparto del pedido usa su contenido). `MACHINE` y `FINISHED_PRODUCT`, sin cambios. |
| 2026-10-04 | ¿Se guarda el envase de origen del lote? | No. El lote del insumo solo lleva la cantidad en la unidad del producto. |
| 2026-10-04 | ¿Qué pasa con los lotes existentes con presentación? | Se quedan como están, sin migración. Las lecturas usan la unidad del producto. |
| 2026-10-04 | ¿Qué pasa con las presentaciones que quedan sin uso? | Fuera de alcance: no se tocan. |
| 2026-10-04 | ¿Qué unidades ofrece el selector? | Todas las del catálogo de la empresa, incluida la unidad de sistema «unidad» (u), para insumos que se cuentan. |
| 2026-10-04 | ¿La base rechaza un lote de insumo cuyo producto no tiene unidad? | Sí. Se ajusta el control de la base que ya existe (`product_batches_check_unit`): un lote sin presentación solo entra si su producto tiene unidad. |
| 2026-10-04 | Permiso | Heredado: `inventario.modificar`, validado en el servicio. |
| 2026-10-04 | Identidad del insumo | Heredada de QC-121: nombre + unidad. |
| 2026-10-04 | E2E | Sí: el alta de un lote es un movimiento de inventario (`CHECKPOINTS.md`). |
