# QC-218 — acondicionar-con-equipo · requirements.md

> Zona: fullstack · Complejidad: — (la asigna el leader en F1.0) · depends_on: QC-217 · Rama: feature/QC-218-acondicionar-con-equipo
>
> **Alcance.** En las acciones del detalle de un pedido por acondicionar aparece
> **Acondicionar**. Abre un modal donde se arma el equipo y se **comienza**. Después, en el mismo
> detalle, **Terminar**, con modal de confirmación. Los dos botones esperan 5 s con cuenta
> regresiva antes de habilitarse.
>
> **Lo que NO entra.** Los datos de lote y la regla de que Terminar los exige (QC-219). El
> registro en el log de ejecución (QC-82). Los estados (QC-215).
>
> Sembrado por `/afinar-feature` el 2026-10-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-06 | ¿Quién comienza y termina? | **Cualquier Administrador de acondicionamiento de la empresa** toma cualquier pedido Por acondicionar. El primero que lo comienza se lo queda y **solo él** lo termina. Hereda QC-168 |
| 2026-10-06 | ¿Qué se elige para el equipo? | **Personas sueltas, grupos de trabajo o ambas**, como la asignación (QC-86). De un grupo se guardan **las personas que tiene en ese momento**, con la marca del grupo y su nombre (asignación congelada, QC-86) |
| 2026-10-06 | ¿Quién puede estar en el equipo? | **Cualquier usuario de la empresa salvo los Administradores.** El Maestro nunca aparece porque no tiene empresa (QC-161). Un grupo que contenga un Administrador no lo aporta al equipo; cómo se muestra eso lo fija `spec_author` |
| 2026-10-06 | ¿Cuándo se define el equipo? | **Al comenzar**, en el modal de Acondicionar. **Al menos una persona** |
| 2026-10-06 | ¿Qué hace el equipo? | **Solo constancia.** Queda guardado en el pedido. Sus personas no reciben el pedido en su lista ni pueden actuar sobre él |
| 2026-10-06 | ¿Cómo es el bloqueo de 5 s? | **El botón espera 5 s**, como QC-125: al abrir el modal de comenzar y el de terminar, el botón está deshabilitado con cuenta regresiva (`CountdownTimer`, `components/shared/countdown-timer.tsx`). Pasados los 5 s se puede pulsar. Solo de cliente, como en QC-125 |
| 2026-10-06 | ¿Qué pasa antes de terminar? | **Modal de confirmación.** Al confirmar, el pedido pasa a ENTREGADO (QC-215) |
| 2026-10-06 | ¿Se autoriza en el servidor? | **Sí, en el service:** permiso de acondicionamiento (QC-216), pedido de la empresa, y para terminar, que quien termina sea quien comenzó |
| 2026-10-06 | ¿E2E? | **Sí:** comenzar con equipo, esperar los 5 s, terminar con confirmación; otro acondicionador no puede terminar un pedido ajeno; un Administrador no aparece en el selector del equipo |
| 2026-10-06 | ¿Dependencia nueva? | **Ninguna.** Reutiliza `CountdownTimer` y el selector de personas y grupos de la asignación si encaja; si no, lo decide `spec_author` sin librería nueva |
