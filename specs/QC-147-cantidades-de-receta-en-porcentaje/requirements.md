# QC-147 — cantidades-de-receta-en-porcentaje · requirements.md

> **Zona:** `fullstack` · **Complejidad:** `high` · **depends_on:** — ·
> **Rama:** `feature/QC-147-cantidades-de-receta-en-porcentaje`
>
> **Alcance.** Las líneas de una receta se expresan en **porcentaje** (hasta 2 decimales) y **suman
> exactamente 100,00 %**; la línea deja de llevar unidad. Lo que consume un pedido es **cantidad del
> pedido × %**, en la **unidad del insumo**. Se aplica en el formulario de recetas, en el costo de
> ingredientes del pedido, en la tabla de ingredientes de Pedidos y en la pantalla del Operario.
>
> **Lo que NO entra.** Densidad y conversión masa/volumen. Los pasos de la receta (QC-62/QC-64).
> Consumo o reserva de inventario (QC-92, QC-141), que heredan la fórmula nueva. QC-120 (rendimiento)
> queda **cancelada**: la absorbe esta ficha.
>
> Sembrado por `/afinar-feature` el 2026-09-22. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Un insumo sin lotes no tiene unidad** (hoy la unidad del producto sale de la presentación de su
   último lote, QC-80). Queda abierto si la línea muestra la cantidad calculada sin unidad o si la
   receta rechaza ese insumo. `spec_author` lo lleva a F1.4.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-22 | ¿Cómo se calcula lo que consume un pedido? | **Cantidad del pedido × %**, y el resultado sale en la **unidad del insumo**: pedido 200 con 10 % de hipoclorito (L) consume 20 L; con 2 % de soda (kg), 4 kg. El pedido **sigue sin unidad** (la retiró `20260907120000_orders_drop_unit_and_unit_price`). **Sin densidad**: es una aproximación aceptada a sabiendas, mezcla L y kg |
| 2026-09-22 | ¿Cuál es la unidad del insumo? | La **del producto tal como la resuelve el código**: hoy, la presentación de su último lote (**QC-80**); con **QC-121**, su unidad fija. Esta ficha **no depende** de QC-121 |
| 2026-09-22 | ¿Qué pasa con la unidad de la línea? | **Desaparece**, y con ella el selector de unidad del formulario de recetas (**QC-26**). Deroga «la unidad es anotativa» del modelo de **QC-24** para las líneas |
| 2026-09-22 | ¿Precisión? | **Hasta 2 decimales**, mayor que 0 (hereda el `> 0` de **QC-24**). La suma de las líneas es **exactamente 100,00 %** |
| 2026-09-22 | ¿Se puede guardar si no suma 100 %? | **No.** El formulario muestra la suma mientras se escribe («Suma: 97,50 % — faltan 2,50 %») y no deja guardar. **El servidor también lo rechaza** |
| 2026-09-22 | ¿Recetas ya cargadas en gr/ml? | **Se empieza limpio**: no hay datos reales que conservar. La migración **no convierte**; elimina las líneas existentes y conserva las recetas con sus pasos, que se vuelven a cargar a mano en porcentaje |
| 2026-09-22 | ¿Qué ve el Operario al ejecutar? | **El % y la cantidad que le toca al pedido**: «Hipoclorito · 10 % · 20 L». **Cambia a sabiendas la decisión de QC-63** de mostrar la cantidad «tal cual está en la receta, sin escalar»: con porcentajes la receta ya no trae ninguna cantidad que contradiga los pasos. El hueco del factor (`recipeBaseQuantity` / `scaleFactorText`, banner de escala) se retira |
| 2026-09-22 | ¿Qué pasa con QC-120 (rendimiento)? | **Cancelada** en el board: una receta en % vale para cualquier cantidad, así que no hay rendimiento ni factor que guardar |
| 2026-09-22 | ¿Quién usa la fórmula nueva en esta ficha? | El **costo de ingredientes del pedido** (`order-cost.ts`, al crear y al editar), la **tabla de ingredientes de Pedidos** (`order-ingredients-table.tsx`) y la **pantalla de ejecución** (QC-63). QC-138, QC-139 y QC-141 la heredan cuando se especifiquen |
| 2026-09-22 | ¿Permisos? | **Sin cambios**: editar recetas sigue exigiendo `recetas.modificar` (**QC-86**), validado en el service |
| 2026-09-22 | ¿E2E? | **Sí**, porque toca importes (`CHECKPOINTS.md`): una receta al 97,50 % no se guarda y al 100,00 % sí; el costo del pedido sale con el %; el Operario ve «10 % · 20 L» |
| 2026-09-22 | ¿Dependencia o tabla nueva? | **Ninguna librería ni tabla.** Cambia `recipe_lines` por migración, con su `down.sql` |
