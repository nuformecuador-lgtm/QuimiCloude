# QC-210 — versiones-desde-el-alta-de-formula · requirements.md

> **Zona:** frontend · **Complejidad:** medium · **depends_on:** QC-174 · **Rama:** `feature/QC-210-versiones-desde-el-alta-de-formula`
>
> **Alcance.** El alta de fórmula permite añadir una o varias versiones antes de guardar, cada una
> como copia viva de las líneas de la original. Los formularios de fórmula y de versión (alta y
> edición) pasan a tener tres acciones: «Guardar» (guarda y se queda), «Guardar y salir» (guarda y
> vuelve) y «Cancelar» (vuelve sin guardar, confirmando si hay cambios).
>
> **Lo que NO entra.** Versiones en línea dentro de la *edición* de la fórmula: allí sigue el enlace
> «Nueva versión» de QC-174. Ningún cambio de modelo, de propagación ni de «por revisar» (QC-172).
> Ninguna operación de servidor nueva: se reutilizan el alta de receta y el alta de versión que ya
> existen.
>
> Sembrado por `/afinar-feature` el 2026-10-05. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- **P1.** ¿El alta valida en el cliente cada versión (al menos una línea, suma 100,00 %, nombre no
  repetido entre las versiones del formulario) antes de enviar, o la deja llegar al servidor y caer
  en el fallo parcial de D3/D4? ⚑ Recomendado: validar en el cliente con los mismos esquemas del
  contrato que ya usa la original, y dejar el fallo parcial para lo que solo sabe el servidor.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-05 | ¿Cómo nace una versión en el alta? | **Copia de las líneas** de la original, con nombre propio. Se reutiliza el editor de líneas con la marca igual / cambiado / añadido / quitado de QC-174. |
| 2026-10-05 | ¿La copia sigue a la original antes de guardar? | **Sí, viva**: las líneas que la versión no cambió siguen a la original hasta guardar. Es la regla de propagación de QC-172 aplicada antes del primer guardado. |
| 2026-10-05 | ¿Qué pasa si una versión no es válida al guardar? | **La original se guarda igual; esa versión no.** No es todo-o-nada: las versiones válidas se guardan y las inválidas no. Por eso no hace falta transacción nueva en el servidor y la zona es `frontend`. |
| 2026-10-05 | ¿Qué se ve tras un fallo parcial? | **Edición con la versión fallida**: pasa a `/produccion/formulas/[id]` y conserva en el formulario las versiones que fallaron, con su error. «Guardar y salir» no sale mientras alguna falle; avisa «fórmula guardada, N versiones sin guardar». |
| 2026-10-05 | ¿A dónde lleva «Guardar» en el alta? | **A la edición** (`/produccion/formulas/[id]`). Un segundo «Guardar» no puede duplicar la fórmula. |
| 2026-10-05 | ¿Dónde van los tres botones? | **Fórmula y versión**, en alta y edición. En una versión, «Guardar y salir» y «Cancelar» vuelven a la ficha de la original; en una fórmula, a la lista. |
| 2026-10-05 | ¿«Cancelar» avisa? | **Sí**: pide confirmar si hay cambios sin guardar; si no hay cambios, sale directo. |
| 2026-10-05 | ¿Hace falta E2E? | **No**: tests de componente e integración. No cambia el modelo ni la reserva de material, y las operaciones de servidor que se reutilizan ya las cubre el E2E de QC-174. |
| 2026-10-05 | ¿Permisos? | **Heredado de QC-172 R38**: crear versiones y guardar piden `recetas.modificar`; ver, `recetas.consultar`. Sin permiso propio. |
| 2026-10-05 | ¿Nombre, niveles, pasos, descripción e imagen de la versión? | **Heredado de QC-172 y QC-174**: nombre libre, único entre las versiones de la misma original; un solo nivel; pasos de la original en solo lectura; sin descripción ni imagen propias. |
| 2026-10-05 | ¿Estados y librerías? | **Heredado de las pantallas de `produccion/formulas`** (QC-174 D9): vacío, cargando y error como ellas; sin dependencias nuevas. |
