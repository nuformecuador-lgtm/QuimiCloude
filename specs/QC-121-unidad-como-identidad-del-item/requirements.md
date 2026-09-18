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

_Pendiente: los escribe spec_author (F1.2)._

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
