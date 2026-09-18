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

`[Dn]` cita la fila n de `## Decisiones cerradas`, contando desde arriba. «La guardia» es la
guardia del gate que nace con esta ficha; «columna de empresa» es la columna `company_id` de la
tabla; «lista de exentas» es la lista cerrada escrita en la propia guardia.

**Qué juzga la guardia**

- **R1** (ubicuo) — La guardia DEBE leer `db/schema.prisma` y juzgar **cada** modelo que declara,
  sin necesitar red, base de datos ni el cliente Prisma generado. [D5] [D7]
- **R2** (condicional) — SI un modelo no declara la columna de empresa y su tabla no está en la
  lista de exentas, ENTONCES la guardia DEBE dar rojo con un mensaje que nombre el modelo, su tabla
  y la columna que le falta. [D1] [D4]
- **R3** (condicional) — SI un modelo declara la columna de empresa, ENTONCES la guardia NO DEBE
  darle rojo, **tanto si la columna es obligatoria como si es opcional**. [D3]
- **R4** (condicional) — SI un modelo sin columna de empresa tiene su tabla en la lista de exentas,
  ENTONCES la guardia NO DEBE darle rojo, sin comprobar nada más sobre esa tabla —en particular,
  no comprueba de qué otra tabla hereda la empresa—. [D1] [D2]
- **R5** (condicional) — SI la columna de empresa aparece en un modelo solo dentro de un
  comentario o solo como referencia de una relación, sin estar declarada como campo propio,
  ENTONCES la guardia DEBE juzgar ese modelo como si no la declarase. [D3]
- **R6** (condicional) — SI un modelo sin columna de empresa tiene un **nombre de modelo** que
  coincide con el de una tabla exenta pero su **tabla** no está en la lista, ENTONCES la guardia
  DEBE darle rojo: la exención es por tabla, y la lista de exentas es el único camino por el que
  un modelo sin columna de empresa pasa la guardia. [D4] [D5]

**La lista de exentas**

- **R7** (ubicuo) — La lista de exentas DEBE contener exactamente estas ocho tablas:
  `document_types`, `roles`, `permissions`, `role_permissions`, `companies`,
  `credential_setup_tokens`, `revoked_sessions` y `recipe_lines`. `users` NO DEBE estar en ella.
  [D1] [D2]
- **R8** (ubicuo) — La lista de exentas DEBE vivir en el propio archivo de la guardia, con el
  motivo de cada entrada escrito junto a ella. [D5]
- **R9** (condicional) — SI una entrada de la lista de exentas no lleva motivo, o lo lleva vacío,
  ENTONCES la guardia DEBE dar rojo nombrando esa entrada. [D5]

**El esquema real**

- **R10** (ubicuo) — Sobre el `db/schema.prisma` de la rama, la guardia DEBE dar verde, y `users`
  DEBE ser juzgada como tabla que declara su columna de empresa, no como exenta. [D1] [D4]

**Que la guardia no se engañe a sí misma**

- **R11** (condicional) — SI `db/schema.prisma` tiene fines de línea CRLF, ENTONCES la guardia DEBE
  producir exactamente los mismos hallazgos que con fines de línea LF.
- **R12** (condicional) — SI la guardia no encuentra ningún modelo en `db/schema.prisma`, ENTONCES
  DEBE dar rojo en vez de pasar en verde sin haber juzgado nada.

**Gate y documentación**

- **R13** (ubicuo) — La guardia DEBE correr en `./init.sh --rapido` y en `./init.sh`, como el resto
  de las guardias del gate; la feature NO DEBE añadir tests E2E. [D7]
- **R14** (ubicuo) — La lista de exentas de `docs/architecture.md > Dominio` DEBE nombrar exactamente
  las mismas tablas que la lista de exentas de la guardia. [D6]
- **R15** (ubicuo) — La feature NO DEBE añadir ninguna dependencia a `package.json`. [D8]
- **R16** (no deseado) — SI una tabla de la lista de exentas no existe en `db/schema.prisma` o ya
  declara la columna de empresa, ENTONCES la guardia DEBE dar rojo nombrando la entrada que sobra.
  _Aprobado por el humano en F1.4 el 2026-09-18 (`design.md > 9`, F1.4-B)._

Cobertura de decisiones: D1 → R2, R4, R7, R10 · D2 → R4, R7 · D3 → R3, R5 · D4 → R2, R6, R10 ·
D5 → R1, R6, R8, R9 · D6 → R14 · D7 → R1, R13 · D8 → R15.

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
