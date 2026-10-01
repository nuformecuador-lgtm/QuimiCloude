# QC-172 — versiones-de-receta · requirements.md

> **Zona:** `fullstack` · **Complejidad:** `high` · **depends_on:** — · **Rama:** `feature/QC-172-versiones-de-receta`
>
> **Alcance.** Una receta original puede tener versiones: copias con vínculo a la original y sus propias
> líneas y porcentajes, que suman 100 %. Entran el modelo y las operaciones de servidor de las versiones
> (crear, editar, borrar, listar las de una receta, propagar), y en el formulario de pedido un segundo
> selector de versión («Original» + sus versiones), deshabilitado si la receta no tiene versiones.
>
> **Lo que NO entra.** La pantalla para crear y editar versiones desde la receta (**QC-174**). Las fases de
> los pasos (**QC-173**). Que un pedido conserve la fórmula con la que se creó si luego se edita la receta
> (sin ficha: pasa igual hoy).
>
> Sembrado por `/afinar-feature` el 2026-10-01. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-25 | ¿Cómo se modela una versión? | **Copia con vínculo**: una receta nueva que apunta a la original. El pedido guarda la versión elegida, así que reserva, coste, ejecución en planta y producto terminado la leen como a cualquier receta. Descartadas una tabla de versiones aparte y guardar solo diferencias. |
| 2026-09-25 | ¿Cuánto suma una versión? | **100 %**, con la validación que ya tienen las recetas (heredado de QC-147: `Decimal(5,2)`, mayor que 0, suma exacta 100,00 % y nunca sin líneas). |
| 2026-09-25 | ¿Qué pasa al editar la original? | **Propagación asistida**: el sistema ofrece aplicar el cambio a las versiones, solo en los ingredientes que la versión no cambió. Si una versión deja de sumar 100 %, queda **por revisar** y no se ofrece en un pedido hasta que se ajuste. |
| 2026-09-25 | ¿Y los pasos? | Las versiones **comparten los pasos de la original**; se leen siempre de la original. |
| 2026-09-25 | ¿Salen en la lista de recetas? | **No**: cuelgan de su original. |
| 2026-10-01 | ¿Cómo se llama una versión? | **Nombre libre**, que se muestra como «Original · Versión» (por ejemplo «Crema base · Sin perfume»). Solo es único entre las versiones de la misma original, con la normalización de nombre heredada de QC-24. No choca con otras recetas ni con versiones de otras originales. |
| 2026-10-01 | ¿Versión de una versión? | **No.** Un solo nivel: las versiones solo nacen de una original y la propagación va siempre de la original a sus versiones. |
| 2026-10-01 | ¿Qué pasa al borrar la original? | **Se borran sus versiones con ella**, con borrado lógico (heredado de QC-24/QC-25). Los pedidos ya creados con una versión siguen funcionando, igual que hoy con una receta borrada (QC-34). |
| 2026-10-01 | ¿Producto terminado por versión? | **Sí, propio.** Una versión es una receta más para QC-150: un producto terminado por versión y presentación, con su propio stock. |
| 2026-10-01 | ¿Se cambia la versión al editar un pedido? | **Sí, como la receta** (heredado de QC-34 y QC-141): en PENDIENTE o EN_CURSO se puede cambiar, y se recalcula la reserva. La nueva versión tiene que estar viva y no estar por revisar. Si no se toca, se conserva aunque haya quedado por revisar o borrada. |
| 2026-10-01 | ¿La importación de fórmula (QC-159) compara con versiones? | **No: solo con originales.** Importar un nombre que coincide con una versión crea una receta original nueva. |
| 2026-10-01 | ¿Permisos? | **Sin cambios**: `recetas.consultar` y `recetas.modificar` cubren las versiones. El pedido conserva los suyos. |
| 2026-10-01 | ¿Hace falta E2E? | **Sí, en el pedido**: elegir receta y versión en el formulario y comprobar que la reserva de material usa las líneas de la versión. La reserva es flujo crítico según `CHECKPOINTS.md`. |
| 2026-10-01 | ¿Librería? | **Ninguna nueva.** |
