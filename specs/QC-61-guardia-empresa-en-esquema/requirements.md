# QC-61 — guardia-empresa-en-esquema · requirements.md

> **Zona** `backend` · **Complejidad** `low` · **depends_on** `QC-47` ·
> **Rama** `feature/QC-61-guardia-empresa-en-esquema`
>
> ## Alcance
>
> Una guardia del gate lee `db/schema.prisma` y da **rojo** si un modelo no declara su columna de
> empresa y no está en la **lista cerrada de exentas**, escrita en la propia guardia con el motivo de
> cada entrada. Basta con que la columna **exista**: obligatoria u opcional. La lista de exentas de
> `docs/architecture.md > Dominio` se corrige para que diga lo mismo que la guardia.
>
> ## Lo que NO entra
>
> - **Dar empresa a alguna tabla exenta** (roles por empresa, líneas de receta con empresa propia):
>   no está pedido y no tiene ficha.
> - **Comprobar que las consultas filtran por empresa**: eso ya lo hacen las guardias
>   `guard-ambito-empresa-*` de cada módulo.
>
> _Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-18 | ¿Qué tablas están exentas? | **Ocho, en lista cerrada**: `document_types`, `roles`, `permissions`, `role_permissions` (catálogos compartidos por todas las empresas), `companies` (es la propia empresa), `credential_setup_tokens` y `revoked_sessions` (cuelgan de un usuario, que ya tiene empresa), y `recipe_lines` (ver la fila siguiente). **`users` sale de la lista**: ya lleva empresa (QC-47), y la guardia pasa a exigírsela. Medido en `db/schema.prisma` el 2026-09-18 |
| 2026-09-18 | ¿Cómo trata la guardia a `recipe_lines`, que hereda la empresa de su receta? | **Exenta sin más**, como una tabla de sistema. **Riesgo aceptado**: la guardia no nota si la receta perdiera la empresa o la línea dejara de colgar de ella. La herencia la decidió **QC-50** y no se reabre |
| 2026-09-18 | ¿La columna de empresa tiene que ser obligatoria? | **Basta con que exista**, obligatoria u opcional. `units` la lleva opcional a propósito (**QC-76**). **Riesgo aceptado**: una tabla nueva con la empresa opcional por descuido pasa la guardia |
| 2026-09-18 | ¿Hace falta la lista de «pendientes de aislar» que pedía la ficha? | **No se crea.** Medido el 2026-09-18: ninguna tabla está pendiente, porque el arco multiempresa (QC-49, QC-50, QC-59, QC-60, QC-76) ya cerró. Nacería vacía, y la ficha misma decía que una lista vacía se borra |
| 2026-09-18 | ¿Dónde viven las exentas? | **En la propia guardia**, con el motivo de cada entrada, siguiendo el patrón de la guardia que vigila `/// @module`. Añadir una exenta es editar esa lista, visible en la revisión |
| 2026-09-18 | ¿Qué pasa con `docs/architecture.md`? | **Su lista de exentas se corrige** para que coincida con la de la guardia; hoy nombra `users`, `roles` y `document_types` |
| 2026-09-18 | ¿Hace falta E2E? | **No**: es una guardia del gate, no un flujo de usuario |
| 2026-09-18 | ¿Librería? | **Ninguna nueva** |
