# QC-219 — datos-de-lote-en-acondicionamiento · requirements.md

> Zona: fullstack · Complejidad: — (la asigna el leader en F1.0) · depends_on: QC-218 · Rama: feature/QC-219-datos-de-lote-en-acondicionamiento
>
> **Alcance.** En el detalle de un pedido en acondicionamiento, por cada línea de presentación
> (cada una es un lote de producto terminado, QC-170), se escriben el **lote**, la **fecha de
> vencimiento** y el **día de producción**. El lote sustituye al automático en el inventario.
> Terminar exige los tres datos en todas las líneas. Se pueden corregir después de entregado.
>
> **Lo que NO entra.** Reservar o consumir por vencimiento (QC-196). El lote real que usa el
> operador (QC-197). Avisos por vencer.
>
> Sembrado por `/afinar-feature` el 2026-10-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Dónde vive el día de producción.** `product_batches` tiene `expiry_date` y fecha de compra
   (QC-81), pero no día de producción. Si va en el lote o en la línea del pedido lo propone
   `spec_author` en `design.md`. No cambia el comportamiento acordado.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-06 | ¿Qué es el lote que escribe el acondicionador? | **Reemplaza el lote automático** del producto terminado creado al terminar el empaque (QC-150/QC-170). Pasa a ser el lote real del inventario |
| 2026-10-06 | ¿Uno por pedido o uno por presentación? | **Uno por línea de presentación.** Ejemplo: 100 L de crema dan CR-2610-A para la botella 1 L y CR-2610-B para la de 200 ml. Cada línea lleva su lote, su vencimiento y su día de producción |
| 2026-10-06 | ¿El lote es único? | **Sí, único dentro de la empresa**, como todo lote. Dos empresas pueden repetirlo. Hereda QC-81 |
| 2026-10-06 | ¿Qué fechas valen? | **Vencimiento posterior a hoy. Día de producción hoy o antes.** Se validan en el servidor |
| 2026-10-06 | ¿Dónde se guarda el vencimiento? | En el lote del inventario (`expiry_date`) |
| 2026-10-06 | ¿Cuándo se escriben? | **Solo después de Comenzar**, y solo los escribe **quien comenzó** |
| 2026-10-06 | ¿Son obligatorios? | **Para terminar.** Terminar se bloquea mientras falte cualquier dato en cualquier línea. Enmienda QC-218 |
| 2026-10-06 | ¿Se corrigen después de entregado? | **Sí, por quien lo terminó**, desde su «Terminados» (QC-217). Aplican las mismas validaciones |
| 2026-10-06 | ¿Se autoriza en el servidor? | **Sí, en el service:** permiso de acondicionamiento (QC-216), pedido de la empresa y quien escribe es quien comenzó |
| 2026-10-06 | ¿Pregunta abierta del dominio? | **Avanza sin cerrar** la de lote y vencimiento (`docs/architecture.md > Preguntas abiertas del dominio`, punto 2): el vencimiento gana su primer escritor. Sigue abierto su consumo (QC-196) |
| 2026-10-06 | ¿E2E? | **Sí:** sin datos no termina; con datos termina y el lote del inventario muestra el código y el vencimiento; un vencimiento de hoy o un día de producción de mañana se rechazan; un lote repetido en la empresa se rechaza |
| 2026-10-06 | ¿Dependencia nueva? | **Ninguna.** |
