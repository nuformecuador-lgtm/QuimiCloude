# QC-132 — cantidad-del-pedido-sin-title-exacto · requirements.md

> **Zona** frontend · **Complejidad** low · **depends_on** — · **Rama** feature/QC-132-cantidad-del-pedido-sin-title-exacto
>
> **Alcance.** Tres cifras que se pintan redondeadas a dos decimales ganan su valor exacto en el `title`,
> con `exactDecimalTitle`: la columna Cantidad de `/pedidos`, la cantidad del pedido y la de cada línea
> de receta en la ejecución de `/asignacion/[id]`. Si lo pintado ya es exacto, no hay `title`.
>
> **Lo que NO entra.** Rehacer el redondeo de `lib/shared/ui/decimal-display.ts` (PR #85, no se toca);
> los tests que QC-127 ya dejó completos; `order-field.tsx`, que redondea lo tecleado.
>
> Sembrado por `/afinar-feature` el 2026-09-23. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> «Valor exacto» es la cifra de origen sin ceros de relleno y sin redondear (`0.1255` -> `0.1255`,
> `12.5000` -> `12.5`). «Valor pintado» es esa cifra redondeada a dos decimales y sin ceros de
> relleno (`0.1255` -> `0.13`). Los tres sitios existen hoy y ya pintan el valor redondeado; lo que
> cambia es solo el `title`.

### Columna Cantidad del listado de `/pedidos`

- **R1.** SI el valor exacto de la cantidad de un pedido difiere de su valor pintado, ENTONCES la
  celda de la columna Cantidad del listado de `/pedidos` DEBE exponer ese valor exacto como atributo
  `title` de un elemento de la celda (`'0.1255'` -> pinta `0.13`, `title` `0.1255`).
- **R2.** SI el valor exacto de la cantidad de un pedido coincide con su valor pintado, ENTONCES
  ningún elemento de la celda de la columna Cantidad DEBE tener atributo `title` (`'12.5000'` ->
  pinta `12.5`, sin `title`).

### Cantidad del pedido en la ejecución de `/asignacion/[id]`

- **R3.** SI el valor exacto de la cantidad del pedido difiere de su valor pintado, ENTONCES el
  elemento que muestra la cantidad del pedido en la pantalla de ejecución DEBE exponer ese valor
  exacto, y solo la cifra, como atributo `title` (`'0.1255'` -> pinta `Pedido 0.13`, `title`
  `0.1255`).
- **R4.** SI el valor exacto de la cantidad del pedido coincide con su valor pintado, ENTONCES el
  elemento que muestra la cantidad del pedido en la pantalla de ejecución NO DEBE tener atributo
  `title` (`'200.0000'` -> pinta `Pedido 200`, sin `title`).

### Cantidad de cada línea de receta en la ejecución de `/asignacion/[id]`

- **R5.** MIENTRAS una línea de receta se muestra en la unidad propia de su insumo —la que trae la
  línea, sin haber elegido otra en el selector—, o no tiene unidad resoluble, SI el valor exacto de su
  cantidad difiere de su valor pintado, ENTONCES el elemento que muestra la cantidad de esa línea DEBE
  exponer ese valor exacto como atributo `title` (`'0.1255'` -> pinta `0.13`, `title` `0.1255`).
- **R6.** MIENTRAS una línea de receta se muestra en la unidad propia de su insumo, o no tiene unidad
  resoluble, SI el valor exacto de su cantidad coincide con su valor pintado, ENTONCES el elemento
  que muestra la cantidad de esa línea NO DEBE tener atributo `title` (`'20'` -> pinta `20`, sin
  `title`).
- **Sin requisito todavía: la línea convertida a otra unidad.** Lo que expone el `title` MIENTRAS la
  línea se muestra en una unidad elegida en el selector depende de la pregunta abierta 1 y no se
  escribe hasta que el humano la responda. Ver `design.md > 4`.

### Comunes a los tres sitios

- **R7.** El sistema DEBE seguir pintando, en los tres sitios, exactamente el mismo texto visible que
  antes de esta feature: el valor redondeado a dos decimales y sin ceros de relleno, sin añadir el
  valor exacto, ningún marcador ni ningún texto adicional (cubre la decisión «el `title` no se ve en
  móvil ni en papel»: se acepta, y por tanto no se compensa con otra vía visible).
- **R8.** El sistema DEBE obtener el valor pintado y el valor del `title` de los tres sitios con la
  utilidad compartida de presentación de decimales existente, y la rama NO DEBE modificar
  `lib/shared/ui/decimal-display.ts` ni su test (decisión «Utilidad de redondeo»).
- **R9.** Cada comportamiento de R1–R6 DEBE quedar verificado por un test de componente que afirme,
  sobre el DOM, la presencia con valor exacto o la ausencia del atributo `title`, y la rama NO DEBE
  añadir ni modificar ningún spec E2E (decisión «¿E2E?»).
- **R10.** Al cerrar la feature, ningún uso de la función de redondeo para presentación en `app/` que
  pinte una cifra de solo lectura DEBE quedar sin su `title` exacto; la única excepción admitida es
  el campo editable de `order-field.tsx`, que queda fuera de alcance (decisiones «¿Otras pantallas en
  el mismo caso?» y «Lo que NO entra»).
- **R11.** La rama NO DEBE modificar `app/(private)/pedidos/components/order-field.tsx`, ni relajar,
  borrar o reescribir ninguna afirmación existente de los tests de las tres pantallas; solo puede
  añadir casos (bloque «Lo que NO entra»).

### Cobertura de las decisiones cerradas

| Decisión cerrada | Requisitos |
|---|---|
| La cantidad del listado lleva su valor exacto | R1, R2 |
| Otras pantallas: cantidad del pedido y de cada línea en `/asignacion/[id]` | R3, R4, R5, R6, R10 |
| Sin E2E, tests de componente sobre el `title` | R9 |
| El `title` no se ve en móvil ni en papel: se acepta | R7 |
| Se reutiliza `decimal-display.ts` sin tocarla | R8 |

## Preguntas abiertas

1. **Línea convertida a otra unidad.** En la ejecución, la cantidad de la línea puede mostrarse en otra
   unidad (`convertQuantity`, hasta 12 decimales, truncando). El `title` mostraría el valor convertido
   entero (p. ej. `0.333333333333`). No está decidido si eso vale tal cual o si hay que acotarlo; no
   se rellena con un supuesto.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿La cantidad del listado de pedidos lleva su valor exacto? | Sí. Fue un olvido, no una decisión: `title` con `exactDecimalTitle`, como el restante y el mínimo de compra. |
| 2026-09-23 | ¿Otras pantallas en el mismo caso? | Entran también la cantidad del pedido y la de cada línea en `/asignacion/[id]`. Censo del leader: son los únicos otros usos de `formatDecimalDisplay` que muestran una cifra sin `title`. |
| 2026-09-23 | ¿E2E? | No. Tests de componente que comprueban el `title` en el DOM; no es un flujo crítico de `CHECKPOINTS.md`. |
| 2026-09-23 | El `title` no se ve en móvil ni en papel | Se acepta, heredado de QC-127. |
| 2026-09-23 | Utilidad de redondeo | Se reutiliza `lib/shared/ui/decimal-display.ts` sin tocarla (PR #85). |
