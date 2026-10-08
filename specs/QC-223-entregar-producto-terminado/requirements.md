# QC-223 — entregar-producto-terminado · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** — · **Rama:** `feature/QC-223-entregar-producto-terminado`
>
> **Alcance**
> - El Administrador entrega un pedido TERMINADO desde un sheet lateral. Por cada presentación del
>   pedido elige de qué lote o lotes sale y cuántos envases, y elige el cliente.
> - El pedido admite varias entregas parciales, y cada una puede ir a un cliente distinto.
> - Cuando lo entregado cubre lo pedido en todas las presentaciones, el pedido pasa a ENTREGADO.
> - Cada entrega descuenta la existencia de los lotes elegidos y queda registrada en el libro de
>   movimientos.
> - El sheet muestra lo que falta por entregar en cada presentación.
>
> **Lo que NO entra**
> - Anular una entrega: va en QC-224.
> - La ficha de detalle del producto terminado, con información general, stock, lotes, histórico
>   de producción y de entregas: va en QC-225.
> - Entregar sin pedido, directamente desde el inventario.
> - Precios y facturación.
>
> Sembrado por `/afinar-feature` el 2026-10-08. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- **Punto de entrada del sheet.** La propuesta es la acción «Entregar» en la fila de un pedido
  TERMINADO de la pantalla de Pedidos. El humano aprobó el alcance sin confirmarlo: se confirma en
  F1.3.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-08 | ¿De dónde sale la entrega? | De un pedido TERMINADO. Al completarse, el pedido pasa a ENTREGADO, que es la entrega al cliente (hereda QC-215 D11 y QC-156). No hay entrega sin pedido. |
| 2026-10-08 | ¿Entrega parcial? | Sí, en varias entregas. El pedido sigue TERMINADO hasta que lo entregado cubre lo pedido en todas las presentaciones; entonces pasa solo a ENTREGADO. |
| 2026-10-08 | ¿Se puede entregar más de lo pedido? | No. El tope por presentación son los envases pedidos menos los ya entregados, y nunca más de lo que haya en el lote. |
| 2026-10-08 | ¿Cliente? | Obligatorio en cada entrega. Se precarga el del pedido y se puede cambiar. Cada entrega lleva su cliente, que puede ser distinto en cada una. El cliente del pedido no cambia. No se ofrecen clientes borrados (hereda QC-156). |
| 2026-10-08 | ¿De qué lote sale? | Lo elige el Administrador, entre cualquier lote con existencia de ese producto terminado (misma receta y presentación), venga de este pedido, de otro o de una importación. Esto se aparta del «más antiguo primero» de QC-141. |
| 2026-10-08 | ¿Quién puede entregar? | Un permiso nuevo, `entregas.modificar`, que en el seed solo tiene el Administrador. Se comprueba en el caso de uso, por permiso y nunca por rol (hereda QC-168). |
| 2026-10-08 | ¿Anular una entrega? | Fuera de esta feature: va en QC-224. |
| 2026-10-08 | ¿Interfaz? | Un sheet lateral. El borrador se guarda en localStorage para no perderse al cerrar o recargar, y se limpia al guardar o al cancelar. |
| 2026-10-08 | ¿Historial de entregas? | En el sheet solo se ve lo que falta por entregar. El detalle de cada entrega queda guardado; su pantalla es QC-225. |
| 2026-10-08 | ¿Unidad de la existencia? | La existencia sigue en unidades base, con un producto por receta y presentación (hereda QC-150). La entrega se pide en envases y se convierte con el contenido de la presentación. |
| 2026-10-08 | ¿E2E? | Obligatorio: es un movimiento de inventario (hereda QC-213 D10). |
