# QC-121 — unidad-como-identidad-del-item · requirements.md

> **Zona** `fullstack` · **Complejidad** `high` · **depends_on** `QC-91` ·
> **Rama** `feature/QC-121-unidad-como-identidad-del-item`
>
> ## Alcance
>
> La unidad pasa a formar parte de la identidad del producto: el producto **guarda su unidad**,
> fija desde que se crea, y todos sus lotes van en ella. El alta busca por **nombre y unidad**: si
> el nombre existe en otra unidad, **nace otro producto** con el mismo nombre. Vuelve
> `products.stock` como **columna guardada**, que la aplicación recalcula al escribir lotes, con su
> **orden y su filtro** en el listado. Una presentación con lotes ya no puede cambiar de unidad, y
> las pantallas muestran el producto como «nombre · unidad».
>
> ## Lo que NO entra
>
> - **Ajuste de inventario** → **QC-92**. Cuando escriba lotes, tendrá que recalcular la columna
>   como los demás caminos de esta ficha.
> - **Convertir entre unidades** → **QC-63**.
> - **Partir o sanear productos que ya tienen lotes en dos unidades**: no se hace; ver la decisión
>   «Datos existentes».
>
> _Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

> Cada requisito cita entre corchetes la decisión de la tabla de abajo que lo origina, numeradas
> `D1`…`D15` **por orden de fila**. La tabla tiene **15 filas** y todas quedan citadas al menos
> una vez: una decisión sin `R<n>` nunca llega a tener test. La pregunta abierta 1 (unidad de la
> línea de receta) **no se decide aquí**: R19 conserva lo que fijó QC-91 mientras siga abierta.
> R29–R34 (enmienda del 2026-09-18) citan además `[E1]`, la decisión del humano de que esta ficha
> cubra el recálculo en el camino del ajuste de QC-92; ver la nota bajo la tabla.

### Unidad del producto

**R1.** El sistema DEBE guardar en cada producto su propia unidad; y CUANDO el alta cree un
producto, el sistema DEBE asignarle la unidad de la presentación de su primer lote, en la misma
operación que escribe el producto y el lote. [D2]

**R2.** El sistema NO DEBE cambiar la unidad de un producto ya creado por ningún camino de la
aplicación: agregarle un lote no la toca, y CUANDO la edición del producto reciba una unidad, el
sistema DEBE rechazar la entrada como `invalid_input` sin escribir nada. [D2]

**R3.** SI se intenta escribir un lote cuya presentación está en una unidad distinta de la de su
producto, o un lote sobre un producto sin unidad, ENTONCES la base de datos DEBE rechazar la
escritura sin dejar el lote escrito, llegue por la aplicación o por SQL directo; y CUANDO el alta
reciba ese rechazo, el sistema DEBE responder `invalid_input` sin dejar escrito ni el lote ni, si lo
estaba creando, el producto. [D2]

**R4.** El sistema DEBE leer la unidad de un producto de la que el producto tiene guardada —en el
listado de inventario, en el selector de productos de la receta y en la alerta de cantidad— y NO
DEBE derivarla del lote más reciente. [D2]

### Alta por nombre y unidad

**R5.** CUANDO el alta reciba un nombre y una presentación, el sistema DEBE buscar, entre los
productos vivos de la empresa del actor, uno con el mismo nombre normalizado **y** la misma unidad
que esa presentación; SI existe, ENTONCES DEBE agregarle el lote sin crear ningún producto y sin
modificar su nombre, su cantidad de alerta ni su unidad. [D1]

**R6.** SI no hay ningún producto vivo de la empresa con ese nombre en esa unidad —aunque lo haya
con ese nombre en otra unidad, o sin unidad—, ENTONCES el sistema DEBE crear un producto nuevo con
ese nombre, la unidad de la presentación y ese lote, sin rechazar el alta y sin mostrar ningún aviso
ni pedir confirmación. [D1] [D8]

**R7.** SI hay varios productos vivos de la empresa con el mismo nombre y la misma unidad, ENTONCES
el sistema DEBE agregar el lote siempre al mismo: el más antiguo, desempatando por identificador
ascendente. [D1]

### Existencia guardada

**R8.** El sistema DEBE guardar en cada producto su existencia como un entero no negativo igual a
la suma de las existencias de todos sus lotes, vencidos incluidos (tres lotes de 5 dan 15); un
producto sin lotes DEBE tener existencia 0. [D3]

**R9.** CUANDO se escriba un lote —al crear un producto con su primer lote o al agregarlo a uno
existente—, el sistema DEBE recalcular la existencia guardada del producto a partir de sus lotes en
la misma transacción que escribe el lote; y SI el recálculo falla, ENTONCES NO DEBE quedar escrito
ni el lote ni, en el alta de un producto nuevo, el producto. [D4]

**R10.** CUANDO dos altas simultáneas agreguen lotes al mismo producto, la existencia guardada DEBE
terminar igual a la suma de todos sus lotes, sin perder ninguno. [D4]

**R11.** CUANDO se agregue un lote a un producto existente, el sistema NO DEBE modificar su nombre,
su cantidad de alerta, su unidad ni su fecha de última modificación: solo su existencia guardada.
[D4]

**R12.** La base de datos NO DEBE mantener la existencia guardada por su cuenta —ni disparador ni
columna generada que la recalcule—: mantenerla es responsabilidad de la aplicación. [D4]

**R13.** El sistema DEBE conservar la agregación de existencias por unidad y DEBE calcular con ella
la existencia guardada; para un producto esa agregación DEBE dar como máximo un valor, y SI diera
más de uno, ENTONCES el sistema DEBE abortar la escritura del lote en vez de guardar una suma que
mezcle unidades. [D9]

**R14.** El sistema DEBE publicar hacia otros módulos la existencia de un producto como existencia
por unidad con **un único valor** —en la unidad del producto e igual a su existencia guardada—, o
vacía si el producto no tiene unidad. [D9]

### Listado de inventario

**R15.** El listado de productos DEBE permitir ordenar por la existencia guardada, ascendente y
descendente, con desempate estable por identificador, y filtrar por un rango de existencia con
mínimo y máximo opcionales, ambos aplicados antes de paginar y con el total contado sobre el mismo
filtro, usando el mismo identificador de columna y los mismos parámetros de URL que tenían antes de
que QC-91 los retirara. [D5]

**R16.** El listado DEBE mostrar la existencia guardada de cada producto acompañada de la unidad del
producto; SI el producto no tiene unidad, ENTONCES DEBE mostrar 0. [D3]

**R17.** SI un producto tiene cantidad de alerta configurada y esta es mayor que su existencia
guardada, ENTONCES el listado DEBE marcarlo en alerta —también cuando no tiene lotes y su existencia
es 0—; y SI no tiene cantidad de alerta configurada, ENTONCES NO DEBE marcarlo. [D10]

**R18.** DONDE el listado de inventario o el selector de productos de la receta muestren un
producto, el sistema DEBE mostrarlo como «nombre · unidad», con el símbolo de la unidad o, si la
unidad no tiene símbolo, su nombre; SI el producto no tiene unidad o el catálogo de unidades no se
pudo leer, ENTONCES DEBE mostrar solo el nombre. [D8]

### Receta y pedido

**R19.** El detalle de receta DEBE seguir exponiendo, por línea, la existencia del producto en la
unidad de la línea: 0 si el producto no tiene lotes, su existencia guardada si la unidad de la línea
es la del producto, y ausencia de dato —«—» en la existencia y en el restante del pedido— si no lo
es. [D9]

### Presentación

**R20.** SI la edición de una presentación que tiene al menos un lote cambia su unidad, ENTONCES el
sistema DEBE rechazarla con un código de error propio, distinto de `invalid_input`, sin modificar
ningún campo de la presentación; y la base de datos DEBE rechazar ese cambio aunque llegue por otro
camino o en carrera con el alta de un lote sobre esa presentación. [D7]

**R21.** CUANDO se edite una presentación con lotes sin cambiar su unidad, o una presentación sin
lotes cambiando o no su unidad, el sistema DEBE aceptar la edición igual que antes de esta feature.
[D7]

**R22.** CUANDO el formulario de presentación reciba el rechazo de R20, DEBE mostrar el mensaje del
catálogo para ese código junto al campo de unidad, conservar lo escrito y seguir abierto. [D7]

### Datos existentes

**R23.** CUANDO se aplique la migración de esta feature, el sistema DEBE dar a cada producto con
lotes la unidad de la presentación de su lote más reciente y como existencia la suma de sus lotes, y
a cada producto sin lotes existencia 0 y ninguna unidad; NO DEBE comprobar si los lotes de un
producto mezclan unidades ni partir, crear o borrar ningún producto ni lote; y su `down.sql` DEBE
retirar todo lo que añade, dejando el esquema como estaba tras QC-91. [D6]

### Permisos, identificadores y entrega

**R24.** El sistema DEBE exigir `inventario.modificar` para el alta de producto y la edición de
presentaciones, e `inventario.consultar` para el listado, validándolo **en el service** antes de
tocar el repositorio, y NO DEBE introducir ningún permiso nuevo. [D11]

**R25.** Todo identificador nuevo —columnas, restricciones, índices, disparadores, funciones,
códigos de error, tipos y campos— DEBE escribirse en inglés; el borrado del producto DEBE seguir
siendo lógico, y ninguna operación de esta feature DEBE borrar físicamente productos ni lotes. [D12]

**R26.** CUANDO se dé de alta «X» en una presentación en kg y después «X» en una presentación en L,
el listado DEBE mostrar **dos filas** «X», cada una con su unidad y su propia existencia; esto DEBE
quedar cubierto por al menos una prueba de extremo a extremo (Playwright). [D13]

**R27.** La feature DEBE entregarse como una sola unidad `fullstack` que deja el árbol compilando y
`./init.sh` completo en verde. [D14]

**R28.** El sistema NO DEBE incorporar ninguna dependencia nueva para esta feature: `package.json`
queda sin cambios. [D15]

### Enmienda del 2026-09-18 — el ajuste de lote (QC-92, ya mergeada)

> QC-92 entró **antes** que esta ficha (PR #91), no después como suponía D4. El humano decidió el
> 2026-09-18: «Sí, QC-121 cubre el ajuste». Estos requisitos citan `[E1]` por esa decisión (ver la
> nota bajo la tabla de decisiones) y `[D4]` porque el cómo sigue siendo el de D4: lo hace la
> aplicación, en la misma transacción, sin disparador (R12 sigue en pie). Se numeran a
> continuación sin renumerar R1–R28.

**R29.** CUANDO se ajuste la existencia de un lote, el sistema DEBE recalcular la existencia
guardada de su producto a partir de todos sus lotes —con la misma agregación y el mismo aborto por
mezcla de unidades de R13— en la misma transacción que escribe el ajuste y su asiento del libro de
movimientos; y SI el recálculo falla, ENTONCES NO DEBE quedar escrito ni el ajuste ni su asiento.
[E1] [D4]

**R30.** SI un ajuste se rechaza —porque el lote no existe, es de otra empresa o quedaría con
existencia negativa—, ENTONCES la existencia guardada del producto NO DEBE cambiar. [E1] [D4]

**R31.** CUANDO dos ajustes simultáneos sobre lotes del mismo producto, o un ajuste y un alta de
lote simultáneos sobre el mismo producto, confirmen, la existencia guardada DEBE terminar igual a la
suma de todos sus lotes, sin perder ninguno de los dos cambios. [E1] [D4]

**R32.** CUANDO se ajuste un lote, el sistema NO DEBE modificar el nombre, la cantidad de alerta, la
unidad ni la fecha de última modificación de su producto: solo su existencia guardada. [E1] [D4]
_(Pendiente de confirmar en F1.4: extiende al ajuste lo que R11 fija para el alta; ver
`design.md > 15`.)_

**R33.** El `down.sql` de la migración de esta feature DEBE dejar intactos la tabla del libro de
movimientos, su tipo enumerado y sus restricciones; y la migración DEBE aplicarse después de las
dos migraciones del libro, de modo que su relleno sume la existencia de los lotes ya ajustada.
[E1] [D6]

**R34.** CUANDO un ajuste de lote confirme desde el panel de lotes del listado de inventario, el
listado DEBE mostrar la existencia guardada nueva del producto sin recargar la página a mano; esto
DEBE quedar cubierto por una prueba de extremo a extremo (Playwright). [E1] [D3] [D13]

**R35.** DONDE el panel de lotes del listado de inventario muestre un producto, su título DEBE
mostrarlo como «nombre · unidad», con la misma regla que el listado (R18): el símbolo de la unidad
o, si la unidad no tiene símbolo, su nombre; y SI el producto no tiene unidad o el catálogo de
unidades no se pudo leer, ENTONCES el título DEBE mostrar solo el nombre. [D8] [fila del
2026-09-18 «¿El panel de lotes se titula «nombre · unidad»?» → «Sí, como el listado»]
_(Añadido el 2026-09-19 por orden del humano: la decisión se aprobó el 2026-09-18 y entró como T15,
pero no se había escrito como requisito.)_

## Preguntas abiertas

1. **La unidad de la línea de receta.** Hoy la línea de receta elige producto y unidad por
   separado. Con la unidad fija en el producto, ¿la línea debe tomar la del producto? Mientras no
   se decida se mantiene lo que fijó QC-91: si la unidad de la línea no es la del producto, el
   «restante» del pedido muestra «—». No se decidió al acotar.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-18 | En el alta llega un nombre que ya existe, pero en una presentación de otra unidad. ¿Qué pasa? | **Se crea otro producto** con el mismo nombre y ese lote. El alta busca el producto vivo por **nombre y unidad**: si lo hay, el lote se le agrega; si no, se crea. **No se rechaza nada.** Esto **deroga** la decisión de QC-91 «sin crear productos y sin rechazar nada en el alta», y **sustituye** el «rechazo con código propio» que proponía la ficha. El nombre ya se puede repetir: no existe índice único sobre él (medido el 2026-09-17) |
| 2026-09-18 | ¿Dónde queda escrita la unidad del producto? | **En el producto, fija.** La gana al crearse, a partir de la presentación del primer lote, y no cambia. **La base** rechaza un lote cuya presentación esté en otra unidad. Deja de salir del lote más reciente (`latestBatchUnitId`, QC-80) |
| 2026-09-18 | ¿La existencia se guarda o se calcula? | **Se guarda**: vuelve `products.stock`, como la suma de los lotes del producto. **Deroga** la decisión de QC-91 «se calcula al consultar y no se guarda». La existencia sigue siendo **entera** y suma los lotes vencidos (heredado de QC-14 y QC-91) |
| 2026-09-18 | ¿Quién mantiene `products.stock` al día? | **La aplicación**, recalculándola en la **misma transacción** que escribe el lote. **Riesgo aceptado**: un camino que escriba lotes y no la recalcule la deja desfasada sin que la base lo impida. QC-92 hereda la obligación |
| 2026-09-18 | ¿Se recuperan el orden y el filtro por existencia del listado? | **Sí, los dos**: el mismo orden y el mismo filtro por rango (mínimo y máximo) que quitó QC-91. **Deroga** su decisión «se pierden, por ahora» |
| 2026-09-18 | Datos existentes con lotes en dos unidades | **No se comprueba**, en línea con QC-81 P1 y QC-91 («no los hay, es nuevo todo»); medido el 2026-09-18: 1 producto, una sola unidad. **Consecuencia aceptada**: si el rechazo de la base va como restricción sobre datos ya existentes, un producto mezclado hará fallar la migración por sí sola. No se parte ningún producto |
| 2026-09-18 | Cambiar la unidad de una presentación que ya tiene lotes | **Se bloquea.** El resto de la edición de la presentación sigue igual. Cierra el camino por el que un producto podría mezclar unidades sin pasar por el alta |
| 2026-09-18 | ¿Cómo se distinguen en pantalla dos productos con el mismo nombre? | **Nombre + unidad** («Hipoclorito · kg» / «Hipoclorito · L») donde sale un producto: el listado de inventario y el selector de productos de la receta. **Sin aviso** en el alta: repetir el nombre en otra unidad es la forma prevista |
| 2026-09-18 | ¿Qué pasa con la existencia por unidad de QC-91 (`sumStockByUnit`, `ProductStockByUnit`)? | **No se tira**: debe quedar en **un solo valor** por producto. Lo fija la ficha |
| 2026-09-18 | ¿Contra qué se compara la cantidad de alerta? | Contra **`products.stock`**, que ya está en la unidad del producto. Sustituye «la unidad del lote más reciente» de QC-91. Un producto sin lotes sigue marcando la alerta (QC-91, 2026-09-17) |
| 2026-09-18 | Permisos | **Sin permiso nuevo**: `inventario.modificar` para el alta y la edición de presentaciones, `inventario.consultar` para el listado, validados **en el service**. Heredado de QC-20 y QC-90 |
| 2026-09-18 | Identificadores y borrado | Identificadores **en inglés**; borrado del producto **lógico**. Heredado de la **feature 4** y QC-14 |
| 2026-09-18 | ¿Hace falta E2E? | **Sí**: es movimiento de inventario (`CHECKPOINTS.md`). Mínimo: dar de alta «X» en kg, darla de alta otra vez en L, y ver **dos filas** en el listado, cada una con su existencia |
| 2026-09-18 | ¿Una ficha o se parte en backend y pantalla? | **Una sola `fullstack`**: la columna nueva y la unidad del producto rompen al compilar el listado y los selectores. Mismo motivo que QC-91 y QC-93 |
| 2026-09-18 | ¿Librería? | **Ninguna nueva** |
| 2026-09-18 | QC-92 entró antes que esta ficha. ¿Quién recalcula `products.stock` en el ajuste de lote? | **Esta ficha** (decisión E1 de la enmienda): el ajuste recalcula en la **misma transacción**, como el alta. Sustituye «QC-92 hereda la obligación» de la fila de D4 |
| 2026-09-18 | ¿El ajuste de un lote cambia el `updated_at` del producto? | **No**: solo el del lote, como hace hoy QC-92 |
| 2026-09-18 | ¿El panel de lotes se titula «nombre · unidad»? | **Sí**, como el listado. Entra **T15** |
| 2026-09-18 | ¿Se puede ajustar un lote de un producto dado de baja? | **Sí, como hoy** (QC-92): la existencia del producto se recalcula igual |
| 2026-09-18 | Puntos técnicos de la enmienda (`design.md > 15`) | **Aprobados**: bloqueo producto→lote en el ajuste, se amplía el E2E de QC-92, el código de error nuevo sin citar la ficha, migración `20260918130000` |

> **Nota de `spec_author` bajo la tabla, no una fila (2026-09-18).** La tabla la fijó el humano y no
> se reescribe. En la fila de D4 («¿Quién mantiene `products.stock` al día?»), la frase **«QC-92
> hereda la obligación»** quedó **sustituida** por la decisión del humano del 2026-09-18 («Sí,
> QC-121 cubre el ajuste»), porque QC-92 entró antes que esta ficha (PR #91). Lo mismo vale para la
> segunda frase de la viñeta «Ajuste de inventario → QC-92» de «Lo que NO entra»: el ajuste en sí
> sigue siendo de QC-92, pero **el recálculo de `products.stock` en el camino del ajuste lo hace
> esta ficha**. El resto de D4 no cambia: lo hace la aplicación, en la misma transacción, sin
> disparador. Los requisitos citan esa decisión como `[E1]` (R29–R34). **La fila formal la añade
> el leader si el humano lo pide.**
