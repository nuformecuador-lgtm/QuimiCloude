# QC-174 — crear-versiones-en-la-receta · requirements.md

> **Zona:** `frontend` · **Complejidad:** — (la asigna el leader en F1.1) · **depends_on:** `QC-172` (done) ·
> **Rama:** `feature/QC-174-crear-versiones-en-la-receta`
>
> **Alcance.** Desde la ficha de una receta se crean, editan, ven y borran sus versiones, con la regla del
> 100 % visible mientras se edita y la diferencia con la original marcada línea a línea. Al guardar la
> original con versiones, un aviso con una casilla por versión deja elegir a cuáles propagar y señala las
> que quedan por revisar. Los pasos de una versión se muestran en solo lectura, y son los de la original.
>
> **Lo que NO entra.** El modelo, las operaciones de servidor y el selector de versión del pedido
> (**QC-172**, cerrada). Las fases de los pasos (**QC-173**). Descripción e imagen propias de la versión
> (descartadas en QC-172 > P3: usa las de la original).
>
> Sembrado por `/afinar-feature` el 2026-10-02. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-02 | ¿Dónde se crean y editan las versiones? | **Página propia por versión**: `/produccion/formulas/[id]/versiones/[versionId]` para editar, y una ruta de alta bajo la misma receta. La ficha de la receta lista sus versiones vivas, ordenadas por nombre, con la marca «por revisar»; las versiones no salen en la lista de fórmulas. Se reutiliza el editor de líneas de la receta; no se crea otro. |
| 2026-10-02 | ¿Se marca qué cambió respecto a la original? | **Sí, por línea**: cada ingrediente de la versión se marca como igual, cambiado (con el % de la original al lado), añadido o quitado. |
| 2026-10-02 | ¿Cómo se elige a qué versiones propagar? | **Casillas**: al guardar una original con versiones vivas, aviso «N versiones parten de esta receta» con una casilla por versión, todas marcadas por defecto, y opción de guardar sin propagar. Tras guardar se señalan las que quedaron por revisar (lo devuelve el servidor, QC-172 R19). |
| 2026-10-02 | ¿Hace falta E2E? | **Sí, uno**: crear una versión, editarla, guardar la original propagando y comprobar en Postgres qué versión quedó por revisar. La propagación cambia fórmulas que luego reservan material. |
| 2026-10-02 | ¿Quién puede crear versiones? | **Heredado de QC-172 R38**: crear, editar y borrar versiones y guardar con propagación piden `recetas.modificar`; ver, `recetas.consultar`. Sin permiso propio. |
| 2026-10-02 | ¿Descripción e imagen propias? | **No. Heredado de QC-172 P3 (a)**: la versión muestra las de su original. |
| 2026-10-02 | ¿Pasos editables en la versión? | **No. Heredado de QC-172 D4 / R8**: la página de la versión muestra los pasos de la original, sin editor. |
| 2026-10-02 | ¿Qué pasa al borrar? | **Heredado de QC-172 R23 y R24**: borrar una versión la da de baja solo a ella; borrar la original avisa de que se borran también sus N versiones. |
| 2026-10-02 | ¿Estados y librerías? | **Heredado de las pantallas de `produccion/formulas`**: vacío, cargando y error como ellas; sin dependencias nuevas. |
