# QC-194 — herramientas-de-la-receta · requirements.md

> **Zona:** fullstack · **Complejidad:** medium · **depends_on:** — · **Rama:** `feature/QC-194-herramientas-de-la-receta`
>
> **Alcance:** una receta (original o versión) declara qué herramientas usa: productos de
> inventario de tipo MACHINE, cada una con una cantidad entera. Se guardan con la receta, se
> editan en el tab «Herramientas» que ya existe en el formulario y el operador las ve, solo para
> leer, en la pantalla de ejecución del pedido.
>
> **Lo que NO entra:** que las herramientas aparten, descuenten o sumen costo de stock; que
> cuenten en el 100 % de los porcentajes; que el import de PDF (QC-159) las detecte.
>
> Sembrado por `/afinar-feature` el 2026-10-03. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- Dónde se guardan (columna en `recipe_lines` o tabla aparte). Es decisión de diseño, pero
  tiene que respetar la fila «¿Las herramientas consumen stock?».
- E2E: no es un flujo crítico de `CHECKPOINTS.md`, porque no mueve inventario ni importes.
  `spec_author` confirma si basta con tests de integración.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-03 | ¿Las herramientas consumen stock? | No. No se reservan, no se consumen, no suman costo y no entran en el 100 %. Quedan fuera de `buildRequirement`, `syncForOrder`/`consumeForOrder` y `resolve-ingredients-cost`. |
| 2026-10-03 | ¿Qué productos son herramientas? | Solo productos de tipo MACHINE, sin repetir uno en la misma receta. |
| 2026-10-03 | ¿Llevan cantidad? | Sí, un entero mayor que 0 y solo informativo. |
| 2026-10-03 | Versiones | La versión nace con una copia de las herramientas del original y las puede editar. Al editar el original, la propagación a versiones (QC-172, `propagateToVersionIds`) también lleva las herramientas. |
| 2026-10-03 | ¿El operador las ve? | Sí, como un bloque de lectura en `/asignacion/<id>`, junto a ingredientes y pasos. |
| 2026-10-03 | Reemplazar desde PDF (QC-159) | Las herramientas se conservan. En la edición, «herramientas omitidas» significa «no tocar», igual que `image`. |
| 2026-10-03 | Herramienta dada de baja | Heredado del trato de ingredientes: la línea se conserva y se muestra «no disponible». La baja no se bloquea. |
| 2026-10-03 | Permiso | Heredado: `recetas.modificar` para escribir y `recetas.consultar` para leer. |
