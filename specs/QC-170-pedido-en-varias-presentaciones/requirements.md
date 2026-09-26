# QC-170 — pedido-en-varias-presentaciones · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** QC-168 · **Rama** feature/QC-170-pedido-en-varias-presentaciones
>
> **Alcance.** El pedido tiene un **reparto**: líneas de «N envases × presentación» (p. ej. 5 × Botella 200 ml,
> 60 × Botella 1 L). A medida que se añaden, el sistema muestra **cuánto queda disponible** en la unidad del
> pedido (100 L − 5 × 0,2 L = **99 L**), usando el contenido de cada presentación (QC-150) y la conversión de
> unidades (QC-76). Al **terminar el empaque** entra **un lote de producto terminado por línea**. Desaparece
> la presentación única del pedido (QC-146).
>
> **Lo que NO entra.** El flujo y los estados de empaque (**QC-168**, que bloquea esta). El registro del
> empaque en el log (**QC-82**). Ventas o salidas del producto terminado.
>
> Sembrado por `/afinar-feature` el 2026-09-25. El bloque de Alcance y la tabla de «Decisiones cerradas» los
> fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí
> es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Cómo se muestra el reparto en los listados** que hoy muestran la presentación del pedido (pedidos,
   «Terminados» de QC-145, «Por empacar» de QC-168). Por ejemplo: la primera línea y «+2», o «3 presentaciones».
2. **Una línea cuya presentación no tiene contenido** no puede calcular el disponible: ¿se prohíbe añadirla?
3. **¿Se puede pasar del total?** (p. ej. 60 × 1 L + 250 × 200 ml = 110 L sobre 100 L): ¿se rechaza?

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-25 | ¿Cuándo se reparte? | **Opcional al crear el pedido, obligatorio para comenzar el empaque**: sin reparto no se puede pulsar Comenzar. |
| 2026-09-25 | ¿Quién lo define? | Quien edita pedidos (`pedidos.modificar`) en la edición del pedido, y el **Empacador** en su pantalla. |
| 2026-09-25 | ¿Se puede cambiar en empaque? | **Sí, hasta pulsar Terminar**; ahí queda fijo. |
| 2026-09-25 | ¿Tiene que cubrir todo? | **No**: lo que no llena un envase es **merma** y no entra al inventario (igual que los envases enteros de QC-150). |
| 2026-09-25 | ¿Cuándo entra el producto terminado? | **Al terminar el empaque**: un lote por línea del reparto (producto receta + presentación, QC-150 D2). **Enmienda QC-168 y QC-150**: el material se sigue consumiendo al terminar la producción, pero el producto terminado ya no entra en ese momento. |
| 2026-09-25 | ¿Coste de cada lote? | El coste del pedido se reparte **por la cantidad de cada lote**: mismo coste por unidad en todos. |
| 2026-09-25 | ¿Y la presentación única del pedido (QC-146)? | **Desaparece.** Los pedidos existentes **convierten su presentación en su reparto** (⌊cantidad / contenido⌋ × esa presentación); sin contenido, quedan sin reparto. |
| 2026-09-25 | Identificadores y cifras | En inglés; decimal exacto (QC-4, QC-141). |
| 2026-09-25 | ¿E2E? | **Sí**: mueve inventario (`CHECKPOINTS.md`). |
