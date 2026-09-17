# QC-91 — existencia-por-lote · requirements.md

> **Zona** `fullstack` · **Complejidad** `high` · **depends_on** `QC-90`, `QC-81` ·
> **Rama** `feature/QC-91-existencia-por-lote`
>
> ## Alcance
>
> La existencia de un producto deja de ser un número escrito a mano y pasa a ser la **suma de sus
> lotes**, calculada al consultar y **una por unidad** («10 kg · 20 L»). Se quita `products.stock`
> —con su orden y su filtro en el listado— y la leen de la forma nueva el listado de productos, su
> edición, el detalle de receta y el formulario de pedido.
>
> ## Lo que NO entra
>
> - **Corregir una existencia mal cargada** → **QC-92** (ajuste de inventario).
> - **Fecha de compra y lote en el panel de alta** → **QC-103**.
> - **Convertir entre unidades** (500 g contra 10 kg) → **QC-63**, único consumidor de la conversión de QC-76.
> - **Recuperar el orden y el filtro por existencia**: se pierden por decisión del 2026-09-10; sin ficha.
> - **Consumir por lote o avisar de lotes por vencer**: no se construye; sigue abierto en
>   `docs/architecture.md > Preguntas abiertas del dominio`, 2.
>
> _Sembrado por `/afinar-feature` el 2026-09-15. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

> Cada requisito cita entre corchetes la decisión de la tabla de abajo que lo origina, numeradas
> `D1`…`D18` **por orden de fila**. La tabla tiene **18 filas** (la 18 es la del 2026-09-17), y
> todas quedan citadas al menos una vez: una decisión sin `R<n>` nunca llega a tener test.

### Cálculo de la existencia

**R1.** El sistema DEBE calcular la existencia de un producto **al consultarla**, como la suma de
las existencias de sus lotes, y NO DEBE guardarla ni cachearla en ninguna columna, campo derivado
ni contrato de escritura del producto. [D1] [D6]

**R2.** CUANDO se aplique la migración de esta feature, el sistema DEBE eliminar la columna
`products.stock` junto con su restricción de no-negatividad y su índice, **sin leer, comprobar ni
trasladar** sus valores a ninguna otra tabla; y su `down.sql` DEBE restaurar la columna, la
restricción y el índice, vacíos de datos. [D1] [D11]

**R3.** El sistema DEBE contar la existencia de un lote como una cantidad **entera** expresada en
la **unidad de su presentación** (en «Bolsa 5 KG», 10 son 10 kg, no 10 bolsas). [D4]

**R4.** SI un lote tiene fecha de expiración pasada, ENTONCES el sistema DEBE sumarlo igual a la
existencia de su producto. [D5]

**R5.** El sistema DEBE agrupar la existencia **por unidad**: los lotes cuya presentación comparte
unidad se suman en un único valor aunque la presentación difiera, los de unidades distintas quedan
como valores separados, y NO DEBE convertir ninguna cantidad entre unidades. [D7]

**R6.** CUANDO el listado de productos muestre un producto con lotes, el sistema DEBE mostrar **una
existencia por unidad**, cada una acompañada de su unidad («Hipoclorito · 10 kg · 20 L»). [D7]

**R7.** SI un producto no tiene ningún lote, ENTONCES el sistema DEBE dar su existencia como
**0**. [D8]

### Lo que deja de existir

**R8.** El listado de productos NO DEBE ofrecer ordenar ni filtrar por existencia; y CUANDO la
consulta reciba un orden o un filtro por existencia, el sistema DEBE ignorarlo y responder la
página sin fallar. [D2]

**R9.** MIENTRAS se edita un producto, el sistema NO DEBE mostrar su existencia; y CUANDO la
edición reciba una existencia, el sistema DEBE rechazar la entrada como inválida y no escribir
nada. [D3]

**R10.** CUANDO el alta de producto reciba una existencia, el sistema DEBE escribirla **únicamente
en el lote** que crea, y NO DEBE escribir ninguna existencia en el producto. [D3]

**R11.** El sistema NO DEBE conservar ninguna lectura ni escritura de `products.stock` en el
árbol —esquema, migraciones vigentes, dominio, adaptadores ni pantallas—, y la feature DEBE
entregarse como una sola unidad que deja el árbol compilando y el gate en verde. [D11] [D12]

### Pedido y receta

**R12.** El formulario de pedido DEBE calcular el «restante» de cada línea restando la cantidad
requerida a la existencia del producto **en la unidad de la línea de receta** (10 kg − 5 kg =
5 kg), sin conversiones. [D9]

**R13.** SI el producto de una línea tiene lotes pero ninguno en la unidad de esa línea, ENTONCES
el sistema DEBE mostrar el marcador de dato ausente en su existencia y en su restante. [D9]

**R14.** SI el producto de una línea no tiene ningún lote, ENTONCES el sistema DEBE mostrar su
existencia como 0, calcular el restante y destacarlo como faltante cuando resulte negativo.
[D8] [D9]

**R15.** El detalle de receta DEBE exponer, por línea, la existencia del producto **en la unidad de
esa línea**, con las mismas tres respuestas que R12, R13 y R14. [D9]

### Alerta de cantidad

**R16.** El sistema DEBE comparar la cantidad de alerta de un producto contra su existencia **en la
unidad de su lote más reciente**, y NO DEBE tener en cuenta las existencias en otras unidades.
[D10]

**R17.** SI un producto no tiene ningún lote y sí tiene cantidad de alerta configurada, ENTONCES el
sistema DEBE marcarlo en alerta (su existencia es 0, menor que cualquier cantidad de alerta), sin
necesitar unidad para esa comparación. [D18]

**R18.** SI un producto no tiene cantidad de alerta configurada, ENTONCES el sistema NO DEBE
marcarlo en alerta, tenga o no lotes. [D18]

### Permisos, datos y verificación

**R19.** El sistema DEBE exigir `inventario.consultar` para leer la existencia desde el listado de
productos y `recetas.consultar` para leerla desde el detalle de receta, validándolo **en el
service** antes de tocar el repositorio, y NO DEBE introducir ningún permiso nuevo. [D14]

**R20.** El sistema DEBE calcular la existencia sobre el esquema de lote vigente tras QC-81 —lote
obligatorio con correlativo del backend y fecha de compra obligatoria—; CUANDO se agregue un lote
sin lote escrito a mano, el sistema DEBE generar su correlativo y sumar su existencia a la del
producto igual que la de los demás. [D13]

**R21.** El sistema NO DEBE borrar ni modificar ninguna fila de lotes al calcular, mostrar o dejar
de escribir la existencia; el borrado del producto sigue siendo lógico y todo identificador nuevo
DEBE escribirse en inglés. [D15]

**R22.** CUANDO se agregue un segundo lote a un producto que ya existe, el listado de productos
DEBE mostrar su existencia aumentada por la suma de los dos lotes; esto DEBE quedar cubierto por al
menos una prueba de extremo a extremo (Playwright). [D16]

**R23.** El sistema NO DEBE incorporar ninguna dependencia nueva para esta feature: `package.json`
queda sin cambios. [D17]

## Preguntas abiertas

**Ninguna.** La única que traía la acotación del 2026-09-15 —si un producto sin lotes marca la
alerta— se cerró el **2026-09-17** por decisión humana y está abajo, en la tabla.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-10 | ¿Quién manda en la existencia? | **El lote.** `products.stock` se quita y la existencia es la suma de los lotes. Heredado de la acotación de **QC-90** |
| 2026-09-10 | ¿Qué pasa con el orden y el filtro por existencia del listado? | **Se pierden, por ahora** |
| 2026-09-10 | ¿Cómo se corrige una existencia mal cargada? | **Con un ajuste de inventario, QC-92**, no editando el producto. Consecuencia: **la edición del producto deja de mostrar y de escribir la existencia**; el panel de alta la sigue pidiendo y va solo al lote |
| 2026-09-15 | ¿Qué cuenta la existencia de un lote? | **Cantidad en la unidad de su presentación**: en «Bolsa 5 KG», 10 son 10 kg, no 10 bolsas. Es lo que ya asume el «restante» del pedido. Sigue siendo **entera** (heredado de **QC-14**) |
| 2026-09-15 | ¿Un lote vencido suma? | **Sí, suman todos los lotes**, vencidos incluidos. La existencia no baja sola de un día para otro |
| 2026-09-15 | ¿Se calcula o se guarda? | **Se calcula al consultar y no se guarda**, para que no pueda contradecir a sus lotes. Mismo criterio que el costo total del lote y el total del pedido (**QC-33**) |
| 2026-09-15 | ¿Y si un producto tiene lotes en unidades distintas? | **Una existencia por unidad**: «Hipoclorito · 10 kg · 20 L». Los lotes de la **misma** unidad se suman aunque la presentación difiera (Bolsa 5 KG + Bolsa 25 KG). **Sin conversión** —la unidad sigue siendo anotativa, **QC-76**—, sin crear productos y sin rechazar nada en el alta |
| 2026-09-15 | ¿Existencia de un producto sin lotes? | **0** |
| 2026-09-15 | ¿Contra qué se calcula el «restante» del pedido? | **Contra la existencia en la unidad de la línea de receta**: 10 kg − 5 kg = 5 kg. Si el producto **tiene lotes pero ninguno en esa unidad**, «—». Si **no tiene lotes**, la existencia es 0 y el restante se calcula (negativo, en rojo). Sin conversiones |
| 2026-09-15 | ¿Contra qué se compara la cantidad de alerta? | **Contra la existencia en la unidad del producto**, que es la de su **lote más reciente** (**QC-80**, `latestBatchUnitId`). Las existencias en otras unidades no cuentan |
| 2026-09-15 | Al quitar la columna, ¿qué pasa con los productos que tienen existencia escrita y ningún lote? | **Se quita sin comprobar**, en línea con **QC-81 P1** («no los hay, es nuevo todo»). **Riesgo aceptado**: en un entorno con datos, esas existencias se pierden sin aviso, igual que el número del producto que no cuadraba con sus lotes desde QC-90. Un lote de rescate no es posible: exige presentación y costo |
| 2026-09-15 | ¿Una ficha o se parte en backend y pantalla? | **Una sola ficha `fullstack`**: quitar la existencia del producto rompe al compilar el formulario y la columna del listado. Mismo motivo que **QC-93** |
| 2026-09-15 | ¿Depende de QC-81? | **Sí.** QC-81 cambia el esquema de lotes que esta ficha lee —lote obligatorio, fecha de compra— y comparte con ella siete archivos. El spec se escribe contra un `dev` que ya contenga QC-81 |
| 2026-09-15 | Permisos | **Sin permiso nuevo**: `inventario.consultar` para el listado y `recetas.consultar` para el detalle, validados **en el service**. Heredado de **QC-20** y **QC-90** |
| 2026-09-15 | Identificadores y borrado | Identificadores **en inglés**; borrado del producto **lógico**. Heredado de la **feature 4** y **QC-14**. Esta ficha no borra lotes |
| 2026-09-15 | ¿Hace falta E2E? | **Sí**: es movimiento de inventario (`CHECKPOINTS.md`, heredado de **QC-90**). Mínimo: **agregar un segundo lote a un producto existente y ver subir su existencia en el listado**, lo que invierte la consecuencia que QC-90 aceptó |
| 2026-09-15 | ¿Librería? | **Ninguna nueva** |
| 2026-09-17 | ¿Un producto **sin lotes** marca la alerta de cantidad? | **Sí.** Su existencia es **0**, y 0 es menor que cualquier cantidad de alerta configurada, así que **se marca**. **No hace falta unidad para esta comparación**: la decisión «¿Contra qué se compara la cantidad de alerta?» fija la unidad para elegir *qué* existencia mirar, pero un producto sin lotes tiene una sola —0— y no hay ambigüedad que resolver. Si el producto **no tiene cantidad de alerta configurada**, no hay nada contra qué comparar y **no se marca**. Motivo: un producto sin lotes está **agotado**, que es exactamente lo que la alerta existe para avisar; callarla dejaría el caso más grave sin señal |
