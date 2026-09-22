# QC-147 — cantidades-de-receta-en-porcentaje · requirements.md

> **Zona:** `fullstack` · **Complejidad:** `high` · **depends_on:** — ·
> **Rama:** `feature/QC-147-cantidades-de-receta-en-porcentaje`
>
> **Alcance.** Las líneas de una receta se expresan en **porcentaje** (hasta 2 decimales) y **suman
> exactamente 100,00 %**; la línea deja de llevar unidad. Lo que consume un pedido es **cantidad del
> pedido × %**, en la **unidad del insumo**. Se aplica en el formulario de recetas, en el costo de
> ingredientes del pedido, en la tabla de ingredientes de Pedidos y en la pantalla del Operario.
>
> **Lo que NO entra.** Densidad y conversión masa/volumen. Los pasos de la receta (QC-62/QC-64).
> Consumo o reserva de inventario (QC-92, QC-141), que heredan la fórmula nueva. QC-120 (rendimiento)
> queda **cancelada**: la absorbe esta ficha.
>
> Sembrado por `/afinar-feature` el 2026-09-22. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Cada requisito cita entre corchetes la decisión cerrada que lo origina: `[D1]` es la primera fila
de la tabla de abajo y `[D16]` la última, en el orden en que están escritas. D13–D16 cierran, en la
revisión del 2026-09-22, las cuatro preguntas que dejó abiertas la primera versión de este spec;
R23–R26 nacen de ellas y se numeran al final para no mover las referencias de `design.md` y
`tasks.md`.

### La línea de receta

- **R1** (ubicuo) — Cada línea de una receta DEBE expresar la parte del insumo como un
  **porcentaje** de hasta 2 decimales, mayor que 0, y NO DEBE llevar unidad de medida propia: ni al
  guardarla ni al leerla aparece unidad alguna en la línea. [D3] [D4]
- **R2** (condicional) — SI una línea llega con un porcentaje que no es un número decimal, que es
  menor o igual que 0, que es mayor que 100 o que tiene más de 2 decimales, ENTONCES el sistema DEBE
  rechazar el alta o la edición de la receta con un error de validación atribuido a esa línea, sin
  escribir ninguna fila. [D4]
- **R3** (condicional) — SI la suma de los porcentajes de las líneas de una receta que llega a
  guardarse no es exactamente 100,00 —incluida una receta **sin ninguna línea**, cuya suma es
  0,00—, ENTONCES el servicio DEBE rechazar el alta o la edición con un error de validación general
  de las líneas, sin escribir ninguna fila, también cuando la petición no la envía el formulario
  (llamada directa a la Server Action). [D4] [D5] [D14]
- **R4** (condicional) — SI la suma de los porcentajes de las líneas es exactamente 100,00 y el
  resto de la receta es válido, ENTONCES el sistema DEBE guardarla, y al leerla DEBE devolver cada
  porcentaje con el mismo valor que se envió (p. ej. 97,50 + 2,50 se guarda y se relee como 97,50 y
  2,50). [D4] [D5]
- **R5** (condicional) — SI una petición de alta o edición de receta trae una unidad en alguna
  línea, ENTONCES el sistema DEBE rechazarla como entrada inválida, sin escribir ninguna fila. [D3]
- **R6** (ubicuo) — La base de datos DEBE rechazar una línea de receta cuyo porcentaje sea menor o
  igual que 0 o mayor que 100 aunque la escritura no pase por el servicio, y NO DEBE guardar un
  porcentaje con más de 2 decimales (el rechazo de la entrada con más decimales es R2). [D4] [D12]
- **R7** (condicional) — SI un actor sin el permiso `recetas.modificar` intenta crear o editar una
  receta, ENTONCES el servicio DEBE rechazarlo antes de validar porcentajes o sumas y antes de tocar
  el repositorio, igual que hoy. [D10]

### La migración

- **R8** (por evento) — CUANDO se aplica la migración de esta ficha, el sistema DEBE eliminar todas
  las líneas de receta existentes, sin convertir ninguna cantidad, y DEBE conservar cada receta con
  su nombre, descripción, imagen, pasos, empresa, autoría y estado de baja intactos. [D6]
- **R9** (por evento) — CUANDO se revierte la migración, el sistema DEBE devolver `recipe_lines` a
  su forma anterior —cantidad `> 0` y unidad obligatoria— y dejar el registro de migraciones de
  Prisma coherente; la migración DEBE tener su `down.sql` y NO DEBE crear ninguna tabla ni añadir
  ninguna dependencia. [D6] [D12]

### El formulario de recetas

- **R10** (de estado) — MIENTRAS el usuario edita las líneas de una receta, el formulario DEBE
  mostrar la suma de los porcentajes con 2 decimales y lo que falta o sobra hasta 100,00 %
  («Suma: 97,50 % — faltan 2,50 %»), recalculada con cada cambio de cualquier línea, sin enviar
  nada al servidor, con el formato de R25. [D5] [D15]
- **R11** (de estado) — MIENTRAS la suma de los porcentajes de las líneas no sea exactamente
  100,00 % —también cuando la receta no tiene ninguna línea—, el formulario DEBE impedir guardar la
  receta; en cuanto la suma sea exactamente 100,00 % y el resto del formulario sea válido, DEBE
  permitirlo. [D5] [D14]
- **R12** (ubicuo) — El formulario de recetas NO DEBE ofrecer ningún selector de unidad en las
  líneas; el campo de cada línea DEBE pedir un porcentaje, y el ingrediente elegido DEBE mostrarse
  con la unidad del insumo cuando el insumo la tiene. [D2] [D3]

### Lo que consume un pedido

- **R13** (ubicuo) — La cantidad que un pedido consume de cada insumo DEBE ser **cantidad del
  pedido × porcentaje / 100**, calculada en decimal exacto y expresada en la unidad del insumo, sin
  densidad ni conversión entre masa y volumen y sin pedir unidad al pedido: un pedido de 200 con
  10 % de un insumo en L consume 20 L, y con 2 % de un insumo en kg consume 4 kg. [D1] [D2]
- **R14** (ubicuo) — La unidad del insumo DEBE ser la que el producto tiene en inventario en el
  momento de leer, tal como la resuelve el módulo de inventario; la receta NO DEBE guardarla. [D2]
- **R15** (por evento) — CUANDO se crea o se edita un pedido, el sistema DEBE calcular el costo de
  ingredientes con la cantidad consumida de R13 para cada línea, sobre los lotes con existencia y
  con las mismas reglas de orden de lotes, promedio y redondeo que ya aplica ese cálculo. [D9]
- **R16** (condicional) — SI la receta del pedido no tiene líneas, o la existencia de algún insumo
  no alcanza la cantidad consumida de R13, ENTONCES el costo de ingredientes del pedido DEBE quedar
  sin importe, igual que hoy. [D9]
- **R17** (de estado) — MIENTRAS el formulario de pedido tiene una receta elegida, la tabla de
  ingredientes DEBE mostrar por línea el producto, el porcentaje, la unidad del insumo, la
  existencia del insumo en esa unidad, la cantidad requerida (cantidad escrita × porcentaje / 100,
  y 0 sin cantidad escrita) y el restante (existencia − requerida), resaltado cuando es negativo.
  [D1] [D9]

### La pantalla del Operario

- **R18** (por evento) — CUANDO el Operario abre la ejecución de un pedido asignado, cada línea DEBE
  mostrar el insumo, su porcentaje y la cantidad que le toca a ese pedido según R13 en la unidad del
  insumo («Hipoclorito · 10 % · 20 L»). [D7] [D9]
- **R19** (ubicuo) — La pantalla de ejecución NO DEBE mostrar ningún factor de escala ni cantidad
  base de la receta, y la vista que la alimenta NO DEBE transportar esos datos. [D7]
- **R20** (opcional) — DONDE la unidad del insumo tenga unidades que comparten su base, el selector
  de unidad de visualización de la pantalla de ejecución DEBE convertir la cantidad calculada de
  R18, y el porcentaje NO DEBE cambiar al cambiar la unidad. [D7]
- **R21** (ubicuo) — La receta NO DEBE declarar rendimiento ni cantidad base: la misma receta DEBE
  producir, para dos pedidos de cantidades distintas, cantidades consumidas proporcionales a la
  cantidad de cada pedido, con los mismos porcentajes. [D8]

### Verificación

- **R22** (ubicuo) — Un test E2E (Playwright) DEBE cubrir, contra la base de test: que una receta
  cuyas líneas suman 97,50 % no se guarda y con 100,00 % sí; que una receta sin ninguna línea no se
  guarda; que el costo de ingredientes de un pedido sale calculado con el porcentaje; y que el
  Operario ve el porcentaje y «20 L» en la línea de un pedido de 200 con un insumo al 10 %, con el
  porcentaje en el formato de R25 («10,00 %»). [D11] [D14] [D15]

### Nacidos de la revisión del 2026-09-22

- **R23** (condicional) — SI una receta existente no tiene ninguna línea —como todas las que deja la
  migración de R8—, ENTONCES el sistema DEBE rechazar cualquier edición suya, aunque solo cambie el
  nombre, la descripción, la imagen o los pasos, hasta que la edición traiga líneas que sumen
  exactamente 100,00 %. Es una consecuencia aceptada a sabiendas. [D6] [D14]
- **R24** (condicional) — SI el insumo de una línea no tiene unidad resoluble —porque no tiene lotes
  o porque está dado de baja—, ENTONCES el sistema DEBE permitir guardar la receta con esa línea, y
  la tabla de ingredientes de Pedidos, la ficha de la receta y la pantalla del Operario DEBEN
  mostrar su porcentaje y su cantidad calculada sin ninguna unidad. [D13]
- **R25** (ubicuo) — Todo porcentaje de receta DEBE mostrarse con coma decimal y exactamente 2
  decimales («12,50 %», «10,00 %», «Suma: 97,50 % — faltan 2,50 %») en el formulario de recetas
  —incluido el valor del campo al precargar una receta—, en el indicador de suma, en la ficha de la
  receta y en la pantalla del Operario, y también en la columna de porcentaje de la tabla de
  ingredientes de Pedidos, que pinta el mismo dato; y el campo de porcentaje DEBE aceptar la coma como
  separador decimal al escribir. [D15]
- **R26** (ubicuo) — La pantalla de ejecución DEBE mostrar la cantidad del pedido («Pedido 200») en
  una línea propia, separada de las líneas de la receta. [D16]

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-22 | ¿Cómo se calcula lo que consume un pedido? | **Cantidad del pedido × %**, y el resultado sale en la **unidad del insumo**: pedido 200 con 10 % de hipoclorito (L) consume 20 L; con 2 % de soda (kg), 4 kg. El pedido **sigue sin unidad** (la retiró `20260907120000_orders_drop_unit_and_unit_price`). **Sin densidad**: es una aproximación aceptada a sabiendas, mezcla L y kg |
| 2026-09-22 | ¿Cuál es la unidad del insumo? | La **del producto tal como la resuelve el código**: hoy, la presentación de su último lote (**QC-80**); con **QC-121**, su unidad fija. Esta ficha **no depende** de QC-121 |
| 2026-09-22 | ¿Qué pasa con la unidad de la línea? | **Desaparece**, y con ella el selector de unidad del formulario de recetas (**QC-26**). Deroga «la unidad es anotativa» del modelo de **QC-24** para las líneas |
| 2026-09-22 | ¿Precisión? | **Hasta 2 decimales**, mayor que 0 (hereda el `> 0` de **QC-24**). La suma de las líneas es **exactamente 100,00 %** |
| 2026-09-22 | ¿Se puede guardar si no suma 100 %? | **No.** El formulario muestra la suma mientras se escribe («Suma: 97,50 % — faltan 2,50 %») y no deja guardar. **El servidor también lo rechaza** |
| 2026-09-22 | ¿Recetas ya cargadas en gr/ml? | **Se empieza limpio**: no hay datos reales que conservar. La migración **no convierte**; elimina las líneas existentes y conserva las recetas con sus pasos, que se vuelven a cargar a mano en porcentaje |
| 2026-09-22 | ¿Qué ve el Operario al ejecutar? | **El % y la cantidad que le toca al pedido**: «Hipoclorito · 10 % · 20 L». **Cambia a sabiendas la decisión de QC-63** de mostrar la cantidad «tal cual está en la receta, sin escalar»: con porcentajes la receta ya no trae ninguna cantidad que contradiga los pasos. El hueco del factor (`recipeBaseQuantity` / `scaleFactorText`, banner de escala) se retira |
| 2026-09-22 | ¿Qué pasa con QC-120 (rendimiento)? | **Cancelada** en el board: una receta en % vale para cualquier cantidad, así que no hay rendimiento ni factor que guardar |
| 2026-09-22 | ¿Quién usa la fórmula nueva en esta ficha? | El **costo de ingredientes del pedido** (`order-cost.ts`, al crear y al editar), la **tabla de ingredientes de Pedidos** (`order-ingredients-table.tsx`) y la **pantalla de ejecución** (QC-63). QC-138, QC-139 y QC-141 la heredan cuando se especifiquen |
| 2026-09-22 | ¿Permisos? | **Sin cambios**: editar recetas sigue exigiendo `recetas.modificar` (**QC-86**), validado en el service |
| 2026-09-22 | ¿E2E? | **Sí**, porque toca importes (`CHECKPOINTS.md`): una receta al 97,50 % no se guarda y al 100,00 % sí; el costo del pedido sale con el %; el Operario ve «10 % · 20 L» |
| 2026-09-22 | ¿Dependencia o tabla nueva? | **Ninguna librería ni tabla.** Cambia `recipe_lines` por migración, con su `down.sql` |
| 2026-09-22 | **D13** — ¿Qué pasa con un insumo sin unidad? (sin lotes: en esta rama `products.unit_id` es `NULL` mientras el producto no tiene lotes; o dado de baja: inventario solo publica productos vivos) | **Se muestra sin unidad** —porcentaje y cantidad calculada, sin símbolo— y la receta **se puede guardar** con esa línea |
| 2026-09-22 | **D14** — ¿Se puede guardar una receta sin ninguna línea? | **No.** Lectura literal de D5: si no suma 100,00 %, no se guarda, y 0 líneas suman 0,00 %. Deroga para esta ficha «una receta sin líneas se puede guardar» de **QC-26**. **Consecuencia aceptada:** las recetas que la migración deja vacías (D6) no se pueden editar —ni siquiera renombrar— hasta cargarles líneas que sumen 100 % |
| 2026-09-22 | **D15** — ¿Formato del porcentaje en pantalla? | **Coma y 2 decimales en toda la receta** («12,50 %»): el formulario, el indicador de suma, el detalle y la pantalla del Operario. No solo en la suma |
| 2026-09-22 | **D16** — ¿Sigue visible «Pedido 200» en la pantalla del Operario? | **Sí**, como una línea propia. Se retira solo el factor |
