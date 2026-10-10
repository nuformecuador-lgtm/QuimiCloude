# QC-225 — detalle-de-producto-terminado · requirements.md

> **Zona:** fullstack · **Complejidad:** medium · **depends_on:** QC-223 · **Rama:** `feature/QC-225-detalle-de-producto-terminado`
>
> **Alcance.** Ficha de solo consulta de un producto terminado (`Product` con `type = FINISHED_PRODUCT`),
> en una ruta propia bajo /inventario, organizada en tabs: General, Stock, Lotes, Entradas, Salidas,
> Entregas y Costo de producción. Se llega desde la pestaña de producto terminado de /inventario y
> desde cada presentación ya producida de un pedido en /pedidos.
>
> **Lo que NO entra.**
> - Acciones desde la ficha (editar nombre o alerta, ajustar stock, entregar): siguen donde están hoy (QC-150 D23, QC-223).
> - Anular una entrega: QC-224.
> - Desglose de insumos consumidos por orden en el costo: fuera; solo costo por lote/orden.
> - Un concepto de «venta» propio, precios y facturación: no existe modelo; hoy la venta es un ajuste que resta (QC-150 D7). Sin ficha, igual que en QC-150.
> - Ficha de productos que no son terminados (insumos, materias primas).
>
> Sembrado por `/afinar-feature` el 2026-10-09. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-09 | ¿Desde dónde se llega? | Desde /inventario: el nombre del producto en cada línea de la pestaña de producto terminado enlaza a la ficha. Desde /pedidos: el nombre de cada presentación ya producida enlaza a la ficha de su producto, solo en pedidos TERMINADO o ENTREGADO y solo si el producto está vigente. |
| 2026-10-09 | ¿Cómo se organiza la ficha? | En tabs: General, Stock, Lotes, Entradas, Salidas, Entregas y Costo de producción. |
| 2026-10-09 | ¿Qué es «Entradas»? | Todo lo que sumó stock según el libro de movimientos: producción (con su orden) y cualquier otra entrada (apertura, importación). Cada fila muestra su origen. |
| 2026-10-09 | ¿Qué es «Salidas» y en qué se diferencia de «Entregas»? | Salidas es el libro completo de lo que restó stock: entregas y ajustes que restan. Entregas es el detalle de cada entrega: cliente, pedido, lote y envases. Una entrega aparece en los dos tabs. |
| 2026-10-09 | «Ventas» | No existe un modelo de venta. Las ventas registradas como ajustes que restan (QC-150 D7) se ven en Salidas. |
| 2026-10-09 | ¿Qué muestra «Costo de producción»? | Por cada lote producido: la orden, la cantidad que entró, el costo unitario y el costo total. Usa los datos guardados (QC-150 D4/D12). Sin desglose de insumos. |
| 2026-10-09 | ¿Se muestran costos? | Sí, igual que en /inventario: lo ve quien tiene `inventario.consultar`. |
| 2026-10-09 | ¿Solo consulta o con acciones? | Solo consulta. |
| 2026-10-09 | ¿Quién puede ver la ficha? | Quien tiene `inventario.consultar` (Administrador, Operador). Se valida en el service, por permiso y nunca por rol. El tab Entregas, incluido el cliente, no exige `pedidos.consultar`. |
| 2026-10-09 | ¿Qué pasa con un producto borrado (borrado lógico)? | La ficha muestra «no encontrado», como el detalle de proveedor. Lo mismo para un id de otra empresa o de un producto que no es terminado. |
| 2026-10-09 | ¿Lleva E2E? | Sí, un recorrido: finalizar una orden, entregar, abrir la ficha y ver el lote, la entrada, la salida y la entrega. Además, un acceso sin permiso que debe ser rechazado. |
| 2026-10-09 | Unidades | Heredado de QC-223 D10/D13: el stock se guarda en la unidad base y se muestra también en envases según el `package_content` de cada lote. |
| 2026-10-09 | Lote → orden que lo produjo | Heredado: se resuelve por el `InventoryMovement` de tipo `production` del lote (`orderId`, `orderPresentationLineId`). Sin migración nueva. |
| 2026-10-09 | Listados largos | Heredado: los tabs de historial se paginan con `lib/shared/pagination.ts` y `DataTable`. |
| 2026-10-09 | Identificadores y borrado | Heredado de QC-150 D10 / QC-4: identificadores en inglés, borrado lógico. |
