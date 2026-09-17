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

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Alerta de un producto sin lotes.** Su existencia es 0 (decisión «Existencia de un producto sin
   lotes»), pero no tiene lote más reciente y por tanto no tiene unidad contra la que comparar
   (decisión «¿Contra qué se compara la cantidad de alerta?»). ¿Se marca cuando la alerta es mayor
   que 0? No se decidió al acotar.

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
