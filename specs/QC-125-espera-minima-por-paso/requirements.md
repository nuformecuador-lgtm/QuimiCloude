# QC-125 — espera-minima-por-paso · requirements.md

> **Zona** `frontend` · **Complejidad** `low` · **depends_on** ninguna ·
> **Rama** `feature/QC-125-espera-minima-por-paso` · **Épica** QC-27 Recetas
>
> **Alcance** (transcrito de la `description` de QC-125 en `feature_list.json`, sin reescribirlo).
> En la pantalla donde el Operador ejecuta la receta de un pedido asignado (QC-63), cada paso exige
> que pasen **5 segundos** antes de poder avanzar. Mientras no pasan, el botón de avanzar está
> deshabilitado y la pantalla muestra una cuenta regresiva. Al avanzar, el cronómetro se reinicia
> para el paso nuevo. **Solo en la ejecución del Operador**: el lector de pasos es un componente
> compartido que también usa la vista previa del formulario de recetas, y ahí **no** hay espera. El
> comportamiento se activa desde la pantalla de ejecución y no afecta a nadie más.
>
> **Lo que NO entra.** Validar la espera en el servidor (hoy el servidor no conoce el paso actual;
> registrarlo es QC-82). Configurar la duración por receta o por paso: son 5 s fijos. Botones de
> pausa o reinicio del cronómetro.
>
> Este archivo **no vino sembrado** por `/afinar-feature`: la tabla de decisiones de abajo se
> transcribe literal de la ficha, donde el humano las cerró el 2026-09-18. No se reabren.

## Requisitos (EARS)

> Vocabulario heredado de QC-64: **asistente** es el lector de pasos compartido (`StepReader`);
> **avanzar** es activar Siguiente o, en el último paso, Finalizar; **elemento** es cada ítem de la
> lista de verificación de un paso. Aquí además: **espera** es el tiempo mínimo que un paso exige
> antes de permitir avanzar; **llegada** a un paso es cada vez que el asistente pasa a presentarlo,
> ya sea al montarse, con Siguiente o con Anterior. `[D<n>]` cita la fila n-ésima de la tabla de
> decisiones, contando desde arriba.

### Activación: solo donde se pide

**R1.** DONDE el consumidor del asistente active la espera indicando una duración en segundos, el
asistente DEBE impedir avanzar en cada paso hasta que haya transcurrido esa duración desde la
**llegada** a ese paso. `[D1] [D2]`

**R2.** DONDE el consumidor del asistente **no** active la espera, el asistente DEBE comportarse
exactamente como antes de esta ficha: sin cuenta regresiva, sin motivo de tiempo, y con el avance
condicionado **solo** a los elementos del paso (QC-64 R17, R18).

**R3.** La vista previa del formulario de recetas NO DEBE activar la espera: dentro de su modal NO
DEBE aparecer ninguna cuenta regresiva y Finalizar DEBE estar disponible sin esperar en un paso sin
elementos.

**R4.** La pantalla de ejecución del Operador DEBE activar la espera con una duración de
**exactamente 5 segundos** por paso: antes de los 5 s el avance DEBE seguir impedido y al cumplirse
DEBE dejar de estarlo por tiempo. El sistema NO DEBE leer esa duración de la receta, del pedido ni
de ninguna configuración, y NO DEBE ofrecer ningún control para cambiarla. `[D2]`

### El cronómetro

**R5.** CUANDO se abre la pantalla de ejecución, la cuenta del **primer** paso DEBE empezar sin
ninguna acción del usuario, y la pantalla NO DEBE ofrecer ningún control «Comenzar» ni equivalente.
`[D1]`

**R6.** MIENTRAS la espera del paso actual no se haya cumplido, el asistente DEBE mostrar una
**cuenta regresiva visible** del tiempo que falta para ese paso.

**R7.** CUANDO el usuario avanza con Siguiente, la cuenta DEBE reiniciarse a la duración completa
para el paso nuevo. `[D2]`

**R8.** CUANDO el usuario retrocede con Anterior, el paso al que llega DEBE exigir de nuevo la
duración completa aunque ya la hubiera cumplido antes; y CUANDO desde ahí vuelve a avanzar, el paso
al que llega DEBE exigirla también de nuevo. Ninguna llegada DEBE heredar el tiempo cumplido en una
llegada anterior, al mismo paso ni a otro. `[D2]`

**R9.** La espera NO DEBE impedir retroceder: MIENTRAS la cuenta esté corriendo, Anterior DEBE
seguir disponible en todo paso que no sea el primero (QC-64 R15). La ficha sólo condiciona el
**avance**.

**R10.** La cuenta regresiva DEBE ser la del componente compartido `CountdownTimer`, y el asistente
NO DEBE contener ninguna segunda implementación de la cuenta ni ningún temporizador propio. `[D5]`

**R11.** El sistema NO DEBE ofrecer ningún control para pausar, reanudar, reiniciar ni saltar la
cuenta: los únicos controles del asistente DEBEN seguir siendo los elementos del paso, Anterior y
Siguiente o Finalizar.

### El bloqueo con dos causas

**R12.** MIENTRAS el paso actual tenga algún elemento sin marcar **o** su espera no se haya
cumplido, el sistema DEBE impedir avanzar —tanto con Siguiente como con Finalizar, y tanto con el
puntero como con el teclado o por activación programática—. Avanzar DEBE requerir **las dos**
condiciones: marcar todos los elementos NO DEBE acortar la espera, y cumplir la espera NO DEBE
eximir de marcar. `[D4]`

**R13.** El **último** paso DEBE quedar sujeto a la misma espera que los demás: MIENTRAS no se haya
cumplido, activar Finalizar NO DEBE invocar el comportamiento de Finalizar que recibe el asistente
y, en la pantalla de ejecución, NO DEBE invocar la operación que entrega el pedido. `[D3]`

**R14.** MIENTRAS el avance esté impedido por la espera, el motivo DEBE presentarse como **texto
visible junto al botón**, asociado a él mediante `aria-describedby`, y NUNCA sólo como `title`,
`:hover` o atributo (QC-64 R17, QC-63 R19).

**R15.** SI en el paso actual coinciden las dos causas —elementos sin marcar y espera pendiente—,
ENTONCES el sistema DEBE presentar **los dos motivos** como texto visible a la vez, y el botón de
avanzar DEBE quedar asociado a **ambos** mediante `aria-describedby`.

**R16.** CUANDO se cumple la espera del paso actual, el motivo de tiempo y la cuenta regresiva DEBEN
dejar de mostrarse; y SI además no queda ningún elemento sin marcar, ENTONCES el botón de avanzar
DEBE quedar habilitado sin ninguna acción del usuario, y ya no DEBE estar asociado a ningún motivo.

**R17.** Cumplir la espera NO DEBE marcar ni desmarcar ningún elemento, y el marcado de un paso
DEBE conservarse al ir y volver exactamente como hoy (QC-64 R16), aunque la espera se reinicie en
cada llegada.

### Sin servidor y sin rastro

**R18.** El sistema NO DEBE enviar la espera, su duración ni su cumplimiento a ninguna operación del
servidor: Finalizar en la pantalla de ejecución DEBE seguir enviando exactamente lo mismo que antes
de esta ficha. El sistema NO DEBE guardar la espera en el navegador más allá de la vida del
asistente, y CUANDO la pantalla se vuelve a montar, la cuenta DEBE empezar de nuevo en el primer
paso.

### Herencia que no se rompe

**R19.** El asistente DEBE seguir recibiendo **todo por props** —incluida la activación de la
espera— y NO DEBE leer datos por su cuenta, importar `lib/composition`, Server Actions,
`next/navigation` ni nada de `app/` (QC-64 R20).

**R20.** La espera NO DEBE añadir ningún control interactivo; los controles existentes DEBEN
conservar su objetivo táctil de 44×44 px y seguir siendo operables por teclado, y CUANDO se cumple
la espera, avanzar DEBE poder hacerse sin ratón (QC-63 R26, QC-64 R26, R27).

**R21.** Los tests heredados de QC-64 y QC-63 que afirman el comportamiento del asistente y de la
pantalla DEBEN seguir en verde **sin aflojarse**; el único que se enmienda es el que prohíbe
cualquier cambio en `components/shared/step-reader/**` (QC-63 R18), y DEBE hacerse con **nota
fechada** y en los términos que ratifique el humano (pregunta abierta 1).

**R22.** El E2E existente del camino feliz de la ejecución (QC-63 R29) DEBE seguir en verde con la
espera activa, recorriendo los pasos hasta Finalizar.

### Cobertura de las decisiones cerradas

| Decisión cerrada | Requisitos que la cubren |
| --- | --- |
| D1 · Comenzar es abrir la pantalla | R1, R5 |
| D2 · Siempre 5 s por paso, también al volver con Anterior | R1, R4, R7, R8 |
| D3 · Finalizar también espera | R13 |
| D4 · La espera se suma al bloqueo existente | R12, R15, R16 |
| D5 · La cuenta usa el `CountdownTimer` compartido | R10 |
| Alcance · Solo en la ejecución del Operador | R2, R3, R4 |
| No entra · Validación en servidor | R18 |
| No entra · Duración configurable | R4 |
| No entra · Pausa o reinicio | R11 |

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **¿Cómo se enmienda el test de QC-63 R18?** — **bloqueante para cerrar la feature.**
   `tests/unit/asignaciones-ui/order-execution-screen.test.tsx`, caso «R18 — el asistente heredado
   no aparece en el diff de esta rama», exige que `git diff <merge-base con origin/dev>` sobre
   `components/shared/step-reader` salga **vacío**. QC-63 R18 dice además «NO DEBE modificar
   ninguno de sus archivos». Esta ficha **no puede cumplirse sin modificar `step-reader.tsx`**: los
   botones y el motivo del bloqueo son internos del asistente (ver `design.md > 7`). El caso se pondrá
   rojo en cuanto se toque el archivo. Opciones:
   - **(a) Retirarlo** con nota fechada: su sustancia —montar por props, sin leer datos ni importar
     lo prohibido— ya la afirman los tests de fuente de `step-reader.test.tsx` (QC-64 R19/R20), y la
     cláusula «no modifica sus archivos» era de la rama de QC-63.
   - **(b) Tensarlo a lista cerrada** con nota fechada: el diff sólo puede contener
     `components/shared/step-reader/step-reader.tsx`, y cualquier otro archivo de la carpeta
     (`step-document-view.tsx`, `index.ts`) sigue poniéndolo rojo. Es la que propone el diseño.
   - (c) Otra que diga el humano.
   Se ratifica al aprobar el spec; T1 de `tasks.md` no arranca sin esa respuesta.
2. **Texto del motivo de tiempo.** La ficha no fija el copy. El diseño propone
   «Espera `MM:SS` para continuar.», con la cuenta regresiva dentro de la frase. No bloquea: se da por
   bueno si el humano aprueba el spec sin cambiarlo.
3. **Color de la cuenta.** `CountdownTimer` pinta con `text-destructive` todo resto ≤ 10 s, así que
   con 5 s la cuenta se verá **siempre** en el tono de error. La ficha dice que se reutiliza el
   componente y no dice nada del tono. Este spec **no cambia** `CountdownTimer`; si el humano quiere
   otro tono para esta espera, es un cambio de su API (umbral configurable) y hay que decirlo al
   aprobar. No bloquea.

## Decisiones cerradas (no reabrir)

Transcritas de la ficha QC-125 (`feature_list.json > description`), cerradas con el humano el
2026-09-18.

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-18 | ¿Cuándo empieza a contar el primer paso? | **Comenzar es abrir la pantalla.** No se añade ningún botón «Comenzar»: los 5 s del paso 1 empiezan a correr al abrir el pedido, que ya lo pone `EN_CURSO`. |
| 2026-09-18 | ¿Volver con Anterior exige otra vez la espera? | **Siempre 5 s por paso.** Si el operario vuelve atrás con Anterior y luego avanza otra vez, el paso le vuelve a exigir los 5 s. |
| 2026-09-18 | ¿Finalizar también espera? | **Sí.** El último paso se trata igual que los demás. |
| 2026-09-18 | ¿Cómo convive con el bloqueo por elementos sin marcar? | **La espera se suma al bloqueo que ya existe** (QC-64). Para avanzar tienen que cumplirse las dos cosas: los elementos marcados y los 5 s cumplidos. |
| 2026-09-18 | ¿Qué cronómetro se usa? | **El componente compartido `CountdownTimer`** (`components/shared/countdown-timer.tsx`), ya construido en la rama `feat/cronometro-shared` y que se incorpora a esta ficha. |
