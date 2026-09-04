# QC-64 — editor-y-lectura-de-pasos · requirements.md

> **Zona** `frontend` · **Complejidad** `high` · **depends_on** `QC-62` ·
> **Rama** `feature/QC-64-editor-y-lectura-de-pasos`
>
> **Alcance.** La mitad de pantalla de los pasos enriquecidos. En el formulario de receta
> (`/produccion/formulas`, QC-26), cada paso se escribe con un **editor enriquecido de terceros**
> de esquema cerrado —párrafo, negrilla, cursiva y lista de verificación— que produce el documento
> que define **QC-62**, y se quita el selector de tipo del paso. Se añade un **componente de
> lectura** que presenta la receta como formulario de **un paso por pantalla** —Anterior, Siguiente,
> Finalizar en el último, elementos que se marcan y desmarcan— y se monta **únicamente** dentro del
> modal de «Vista previa» del editor.
>
> **Lo que NO entra.** El contrato del documento, la desaparición de `type` y el borrado de los
> pasos viejos: **QC-62**, que bloquea a esta. El acceso del **Operador** al componente de lectura,
> con su ruta propia y la apertura de la lectura en el backend: **QC-63 —
> ejecutar-receta-operador**. Registrar quién marcó qué y cuándo: **no tiene ficha y esta acotación
> no la crea**. Buscar y ordenar recetas: sigue sin soporte del backend (QC-26, QC-57).
>
> Sembrado por `/afinar-feature` el 2026-09-04 y **nacida de la partición** de QC-62 el 2026-09-04,
> por la regla de partición de `fullstack` de `AGENTS.md > F1.0`. El bloque de Alcance y la tabla
> de «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Ninguna bloquea la pantalla.

1. **¿El bloqueo de Siguiente necesitará una vía de escape?** Hoy bloquea sin excepción
   (decisión 4), y quien lo sufre es el Administrador dentro de la vista previa. Cuando **QC-63** lo
   ponga en manos de un operario en turno puede hacer falta un «continuar de todos modos» con
   motivo escrito — y eso arrastra dónde se guarda ese motivo, que hoy no tiene ficha. **Se decide
   en QC-63, no aquí.**
2. **¿Qué librería?** El diseño acordado apunta a TipTap/ProseMirror, pero **no está cerrado**: lo
   propone el `design.md` con los cuatro checks corridos y se aprueba con el spec (decisión 7).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-04 | ¿Quién puede usar el editor y la vista previa? | **Solo el Administrador**, heredado de **QC-25 R2**. Esta ficha **no toca el backend de permisos**. |
| 2026-09-04 | ¿Y el Operador? | El componente de lectura se construye **independiente y reutilizable** justo porque más adelante lo usará él, pero aquí **no se le abre ningún acceso**. Va en **QC-63**. |
| 2026-09-04 | ¿El asistente tiene ruta propia? | **No.** Vive únicamente dentro del modal de «Vista previa» del editor: sin URL propia, sin entrada desde el listado del catálogo. |
| 2026-09-04 | ¿Se puede avanzar con elementos sin marcar? | **No.** Siguiente queda **bloqueado** hasta que todos los elementos marcables del paso estén marcados, con el motivo visible al lado del botón. |
| 2026-09-04 | ¿Se guarda lo que el usuario marca? | **No.** El marcado vive en el navegador mientras dura la vista previa y se pierde al cerrarla. |
| 2026-09-04 | ¿Sigue el selector de tipo de paso? | **No**: lo quita esta ficha, porque QC-62 elimina el campo `type` del contrato. |
| 2026-09-04 | ¿Editor a mano o librería? | **Librería**, por la **regla 7** de `CLAUDE.md`: el `design.md` la propone con los **cuatro checks de salud** y su fila en `docs/dependencias.md`, y se aprueba **junto con el spec (F1.4)**. Ver pregunta abierta 2. |
| 2026-09-04 | ¿Qué se hereda montado y no se re-crea? | El **reordenado por arrastre con equivalente por teclado** y `dnd-kit` como excepción ya aprobada (**QC-26 R33, R34, R45**); y el armazón de QC-26 —layout privado, Server Actions, sesión por props, rutas en constantes, `<Toaster />` ya montado, shadcn por CLI— más su E2E de recetas. |
| 2026-09-04 | ¿Hace falta E2E? | **Sí, el camino completo**: redactar un paso con negrilla y lista, guardar, reabrir la receta y comprobar que **se ve igual que se guardó**, y recorrer el asistente en la vista previa hasta **Finalizar**. Es lo que pide `CHECKPOINTS.md` para datos que se presentan a otros usuarios. |
| 2026-09-04 | ¿Multiplataforma? | Sin excepción, heredado de **QC-26 R19, R34, R50**: objetivos táctiles de 44×44 px, nada detrás de `:hover`, y el asistente y el editor operables por teclado. |
