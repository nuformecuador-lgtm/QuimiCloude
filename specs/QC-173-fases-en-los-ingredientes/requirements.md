# QC-173 — fases-en-los-ingredientes · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** — · **Rama:** `feature/QC-173-fases-en-los-ingredientes`
>
> **Alcance.** Los ingredientes de una fórmula se pueden agrupar en fases con nombre libre y orden
> (p. ej. «Acuosa»: agua 60 %, glicerina 5 %; «Oleosa»: cera 10 %…). Puede haber ingredientes
> sueltos. Un producto puede repetirse una vez por fase. Las fases se editan en la ficha, se heredan
> en las versiones, se ven agrupadas en la ejecución del operador y la importación desde PDF las
> detecta.
>
> **Lo que NO entra.** Agrupar pasos o procedimiento: los pasos no cambian. Pasos de envasado
> (QC-211). Ver las fases en el formulario de pedido. 100 % por fase.
>
> Sembrado por `/afinar-feature` el 2026-10-05. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- **P1. Tope de fases por fórmula.** ⚑ Recomendado: sin tope de negocio; el mismo tope técnico de
  líneas que ya tenga la receta.
- **P2. Dónde se ven los ingredientes sueltos cuando hay fases.** ⚑ Recomendado: en un bloque
  «Sin fase» al final.
- **P3. ¿Puede haber dos fases con el mismo nombre en una fórmula?** ⚑ Recomendado: no, con la
  normalización de nombres heredada de QC-24.
- **P4. Orden de los ingredientes dentro de una fase.** Hoy las líneas no guardan orden. ⚑
  Recomendado: se guarda el orden en que el Administrador las deja.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-05 | ¿Qué agrupan las fases? | **Los ingredientes** (líneas de la fórmula), no los pasos. Corrige la descripción original del 2026-09-25; las decisiones de entonces sobre pasos quedan sin efecto. |
| 2026-10-05 | ¿Puede haber ingredientes sin fase? | **Sí, mezcla permitida**: una fórmula puede tener fases y además ingredientes sueltos. |
| 2026-10-05 | ¿Dónde aplica la regla del 100 %? | **Solo a la fórmula entera** (heredado de QC-147). Cada fase muestra su subtotal, pero ese subtotal no tiene que sumar nada concreto. |
| 2026-10-05 | ¿Un producto puede estar en dos fases? | **Sí, una vez por fase.** Cambia la unicidad de QC-147 (producto único por receta) a única por receta y fase. Tampoco puede repetirse entre los ingredientes sueltos. La reserva de material suma todas sus líneas. |
| 2026-10-05 | ¿Qué pasa al borrar una fase con ingredientes? | **Se borran con ella**, tras un aviso que dice que se borrarán los ingredientes de dentro. Antes de borrarla, cada ingrediente se puede arrastrar a otra fase o quitar uno a uno. |
| 2026-10-05 | ¿Cómo se nombra y ordena una fase? | **Nombre libre**, escrito por el Administrador. El orden se cambia arrastrando las fases. |
| 2026-10-05 | ¿Fases en las versiones? | **Heredan las de la original** (nombres y orden). La versión puede mover sus ingredientes entre fases, pero no puede crear, renombrar ni borrar fases. Si la original renombra una fase, se ve en todas sus versiones. |
| 2026-10-05 | ¿Qué pasa en una versión cuando la original borra una fase? | **Sus ingredientes quedan sueltos** en la versión; no se borran. |
| 2026-10-05 | ¿Cómo se propaga un cambio a las versiones? | **Por producto y fase**: un cambio en el agua de «Acuosa» solo toca el agua de «Acuosa» de cada versión, si esa versión no la había cambiado. Ajusta la propagación y la marca de diferencias de QC-172/QC-174, que hoy comparan por producto. |
| 2026-10-05 | ¿Dónde se ven las fases? | **Ficha de fórmula y de versión, ejecución del operador** (`/asignacion/[id]`) **e importación desde PDF**: la IA detecta las fases y el Administrador las revisa. Fuera queda el formulario de pedido. |
| 2026-10-05 | ¿Se migran las fórmulas existentes? | **No.** Quedan con todos sus ingredientes sueltos y se ven como hoy. |
| 2026-10-05 | ¿Hace falta E2E? | **Sí, uno**: fórmula con agua en dos fases → pedido → comprobar en Postgres que la reserva suma ambas líneas. La reserva es un flujo crítico (`CHECKPOINTS.md`). |
| 2026-10-05 | ¿Permisos? | **Sin cambios**: editar fases pide `recetas.modificar`; verlas, `recetas.consultar`. |
| 2026-10-05 | ¿Borrado e identificadores? | **Heredado de QC-24 y QC-4**: borrado lógico de la receta, identificadores de la DB en inglés. |
| 2026-10-05 | ¿Librería? | **Ninguna nueva.** El arrastre reutiliza lo que ya use el editor de pasos; si no hay nada, se aprueba aparte (regla 7). |
