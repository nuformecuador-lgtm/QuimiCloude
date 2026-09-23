# QC-122 — busqueda-y-total-en-la-pantalla-de-pedidos · requirements.md

> **Zona** frontend · **Complejidad** medium · **depends_on** QC-68, QC-123 (done) · **Rama** feature/QC-122-busqueda-y-total-en-la-pantalla-de-pedidos
>
> **Alcance.** La pantalla de `/pedidos` gana la **caja de búsqueda por nombre de receta** (la consulta
> ya existe desde QC-68: `list-orders.ts` recibe `search`) y la **columna Importe**, que pinta el
> `ingredientsCost` que QC-123 ya guarda y devuelve. Más el **E2E** de las dos cosas, diferido aquí por
> QC-68 y QC-123.
>
> **Lo que NO entra.** La consulta, la migración y el índice de la búsqueda (**QC-68**). El cálculo del
> importe, su columna en la base y la selección de lotes (**QC-123**). Ordenar o filtrar por importe.
> Pasar la app a coma decimal.
>
> Sembrado por `/afinar-feature` el 2026-09-23. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Vocabulario. **Término**: el texto de la caja de búsqueda, sin espacios al principio ni al final;
> vacío = sin búsqueda. **Consulta de lista**: la operación de listado de pedidos que ya existe
> (QC-68), la única que decide qué pedidos casan con el término. **Estado «no hay pedidos»**: el
> vacío que existe hoy (`order-list-empty`). **Estado «sin coincidencias»**: el vacío nuevo de esta
> ficha.
>
> **Cambio de alcance en F1.4 (2026-09-23):** el importe sale de esta ficha y se va a **QC-151**.
> R17–R24 y la parte (b) de R25 quedan **retirados sin renumerar**. R26 se añade por la misma nota
> (ver `## Cambio de alcance en F1.4` al final).

### Caja de búsqueda

- **R1.** La pantalla `/pedidos` DEBE mostrar, junto a la lista de pedidos, una caja de búsqueda
  editable, con un área táctil de al menos 44x44 px y un tamaño de letra de al menos 16 px.
- **R2.** CUANDO el usuario escribe en la caja, el sistema DEBE volver a pedir la lista a la consulta
  de lista con el término como búsqueda, conservando el tamaño de página, el orden y los filtros
  vigentes, y DEBE pedirla desde la primera página (la búsqueda es sobre el conjunto completo, no
  sobre la página en que se estaba).
- **R3.** El sistema NO DEBE filtrar, recortar ni reordenar en el navegador las filas por el término:
  las filas mostradas DEBEN ser exactamente las que devuelve la consulta de lista para ese término, y
  en su mismo orden.

### El término vive en la URL

- **R4.** CUANDO se carga `/pedidos` con el parámetro `q`, el sistema DEBE pasar su valor, sin
  espacios al principio ni al final, como búsqueda de la consulta de lista, y DEBE mostrarlo como
  texto de la caja.
- **R5.** El sistema DEBE escribir el término vigente en la URL como parámetro `q`, solo cuando no
  está vacío, y NO DEBE escribir en la URL ningún parámetro `search`. Leer la URL que el sistema
  escribe DEBE devolver exactamente los mismos parámetros de lista (término incluido).
- **R6.** SI `q` falta, está vacío o solo contiene espacios, ENTONCES el sistema DEBE pedir la lista
  sin búsqueda y la URL que escriba después NO DEBE llevar `q`.
- **R7.** SI el término de la URL es más largo que el máximo que admite la consulta de lista (120
  caracteres), ENTONCES el sistema DEBE recortarlo a ese máximo y mostrar la lista, y NO DEBE
  mostrar el estado de error.
- **R8.** MIENTRAS hay un término vigente, cambiar de página, de tamaño de página, de orden o de
  filtro DEBE conservar el término en la URL, en la caja y en la consulta.
- **R9.** MIENTRAS hay un término vigente, abrir y cerrar el panel lateral de un pedido (el detalle
  del pedido en esta pantalla) y recargar la página DEBEN conservar el término en la URL, en la caja
  y en la lista mostrada.
- **R26.** CUANDO, con un término vigente, el usuario va desde `/pedidos` a otra pantalla y vuelve
  con «Atrás» del navegador, el sistema DEBE mostrar de nuevo el mismo término en la URL y en la caja
  y la lista filtrada por él. *(Añadido en F1.4, 2026-09-23.)*

### Mientras la búsqueda está en vuelo

- **R10.** MIENTRAS la lista pedida por un cambio de término está en vuelo, el sistema DEBE seguir
  mostrando la lista anterior montada, atenuada, marcada como ocupada para la tecnología de asistencia
  (`aria-busy="true"`) y con un indicador de carga visible, y NO DEBE mostrar el esqueleto de carga.
- **R11.** MIENTRAS la lista está en vuelo, la caja DEBE seguir montada, con el foco y con el texto
  que el usuario está escribiendo.
- **R12.** CUANDO llega la lista nueva, el sistema DEBE sustituir con ella la anterior y retirar la
  atenuación, la marca de ocupada y el indicador de carga.

### Sin coincidencias

- **R13.** SI hay un término vigente y la consulta de lista devuelve cero pedidos, ENTONCES el
  sistema DEBE mostrar el estado «sin coincidencias», identificable por sí mismo, con el mensaje «No
  hay pedidos que coincidan…» y la acción «Limpiar la búsqueda», y NO DEBE mostrar el estado «no hay
  pedidos».
- **R14.** MIENTRAS se muestra el estado «sin coincidencias», la caja de búsqueda DEBE seguir montada
  con el término, de modo que el usuario pueda corregirlo sin limpiar.
- **R15.** CUANDO el usuario activa «Limpiar la búsqueda», el sistema DEBE mostrar la lista sin
  término desde la primera página, conservando el tamaño de página, el orden y los filtros; la URL
  NO DEBE llevar `q` y la caja DEBE quedar vacía.
- **R16.** SI no hay término y la consulta de lista devuelve cero pedidos, ENTONCES el sistema DEBE
  seguir mostrando el estado «no hay pedidos» de hoy, sin la acción «Limpiar la búsqueda».

### Columna Importe — retirada

- **R17.** *Retirado el 2026-09-23 (va a QC-151).*
- **R18.** *Retirado el 2026-09-23 (va a QC-151).*
- **R19.** *Retirado el 2026-09-23 (va a QC-151).*
- **R20.** *Retirado el 2026-09-23 (va a QC-151).*
- **R21.** *Retirado el 2026-09-23 (va a QC-151).*
- **R22.** *Retirado el 2026-09-23 (va a QC-151).*
- **R23.** *Retirado el 2026-09-23 (va a QC-151).*
- **R24.** *Retirado el 2026-09-23 (va a QC-151).* La tabla sigue con sus diez columnas y el
  esqueleto con diez; esta ficha no los toca.

### E2E

- **R25.** DEBE existir un spec E2E que corra sin más servicios que la aplicación y su Postgres
  local, sobre pedidos de una empresa creada para el propio spec, y que compruebe: (a) al escribir en
  la caja un término sin acentos ni mayúsculas, la lista se recorta a exactamente los pedidos cuya
  receta casa con él —incluida una receta con acentos y una dada de baja—, que es el resultado que la
  consulta de lista da para ese término, y la URL lleva `q`; (b) *retirado el 2026-09-23 (va a
  QC-151)*; (c) con un término sin coincidencias aparece el estado «sin coincidencias» y «Limpiar la
  búsqueda» devuelve la lista completa; (d) el término sobrevive a cambiar de página, a abrir y
  cerrar el panel lateral, y a ir a otra pantalla y volver con «Atrás».

### Lo que esta ficha retira

Una afirmación vigente deja de ser cierta con esta ficha, y sus tests se **sustituyen** por los de
R1–R16, no se relajan en silencio:

- «La pantalla no tiene caja de búsqueda y nunca lee ni escribe `search`» (QC-35 R20; nota de QC-68
  R16 en `order-list-params.test.ts`; bloque «la caja de busqueda NO existe» de `order-table.test.tsx`).

«La tabla de pedidos no pinta el importe» (QC-123 R18, en `order-columns.test.tsx`) **sigue en pie**:
esta ficha ya no la retira.

### Cobertura de las decisiones cerradas

| Decisión cerrada | Requisitos |
|---|---|
| ¿Qué busca la caja? (nombre de receta, sin acentos ni mayúsculas, conjunto completo, bajas incluidas) | R1, R2, R3, R25 (a) |
| ¿Qué es el importe? | Pasa a QC-151 (nota de F1.4) |
| ¿Pedido sin importe? | Pasa a QC-151 (nota de F1.4) |
| ¿Qué se ve mientras la búsqueda está en vuelo? | R10, R11, R12 |
| ¿Y sin coincidencias? | R13, R14, R15, R16, R25 (c) |
| ¿Se conserva el término? (`?q=`, paginación, volver del detalle) | R4, R5, R6, R7, R8, R9, R26, R25 (d) |
| ¿Formato del importe? | Pasa a QC-151 (nota de F1.4) |
| ¿E2E? | R25 (a), (c), (d); la parte del guion pasa a QC-151 |
| F1.4: sin coincidencias DENTRO de la tabla | R13, R14 |
| F1.4: búsqueda nueva vuelve a la página 1 | R2 |
| F1.4: el término sigue tras el panel lateral y tras Atrás | R9, R26, R25 (d) |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-17 | ¿Qué busca la caja? | Solo el nombre de receta, sin acentos ni mayúsculas, sobre el conjunto completo y no sobre la página; incluye recetas dadas de baja (heredado de **QC-68**). |
| 2026-09-18 | ¿Qué es el importe? | El coste de ingredientes de **QC-123**: esta ficha lo pinta, no lo calcula. Solo se muestra: no ordena ni filtra. |
| 2026-09-18 | ¿Pedido sin importe? | Un guion, nunca un cero; los motivos no se distinguen en pantalla (heredado de **QC-123**). |
| 2026-09-23 | ¿Qué se ve mientras la búsqueda está en vuelo? | La lista anterior, atenuada y con indicador de carga, hasta que llega la nueva. Sin esqueleto. |
| 2026-09-23 | ¿Y sin coincidencias? | Un estado propio, distinto de «no hay pedidos»: «No hay pedidos que coincidan…» con la acción «Limpiar la búsqueda» (patrón de `unit-list-empty.tsx` y `user-list-empty.tsx`). |
| 2026-09-23 | ¿Se conserva el término? | Sí: vive en la URL como `?q=` (patrón de `product-list-params.ts`); sobrevive a la paginación y a volver del detalle. |
| 2026-09-23 | ¿Formato del importe? | `$ 1,234,567.50`: símbolo `$` fijo (la moneda no se guarda), coma de miles, punto decimal (como el resto de la app) y siempre dos decimales. El valor exacto va en el `title` (patrón de **QC-132**). Sin `Intl.NumberFormat` ni coma flotante: aritmética sobre el texto (regla de `order-columns.tsx`). |
| 2026-09-23 | ¿E2E? | **Sí, aquí** (diferido por QC-68 y QC-123): escribir en la caja, ver la lista recortada, que coincide con la consulta, y que un pedido sin importe muestra el guion. |

## Cambio de alcance en F1.4 (2026-09-23)

El humano aprobó el spec en F1.4 con un cambio de alcance. El texto sembrado de arriba —bloque de
Alcance, «Lo que NO entra» y tabla de decisiones— **no se reescribe**; esta nota lo corrige:

- **El importe sale de esta ficha.** No será una columna del listado: es una cotización del coste que
  se ve en el formulario al generar el pedido y al editarlo, y va a la ficha nueva **QC-151**
  (fullstack). Las filas «¿Qué es el importe?», «¿Pedido sin importe?» y «¿Formato del importe?»
  **pasan a QC-151**, y la mitad de «¿E2E?» sobre el guion también. **QC-122 queda en solo
  búsqueda**: donde el Alcance dice «y la columna Importe» y «el E2E de las dos cosas», léase solo la
  búsqueda.
- R17–R24 y R25 (b) quedan retirados sin renumerar.

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Dónde se pinta «sin coincidencias»? | **Dentro de la tabla**, con la caja montada (patrón de `supplier-table.tsx`, proveedores), no fuera como `unit-list-empty.tsx`. |
| 2026-09-23 | ¿Qué página muestra una búsqueda nueva? | Vuelve a la **página 1**. |
| 2026-09-23 | ¿Qué es «volver del detalle»? | El término sigue al **abrir y cerrar el panel lateral** de un pedido **y** al **ir a otra pantalla y volver con Atrás**: vive en la URL. |
| 2026-09-23 | ¿Dónde va la columna Importe? | Descartado: no hay columna. |
