# QC-224 — anular-entrega · requirements.md

> **Zona:** fullstack · **Complejidad:** medium · **depends_on:** QC-223 (done) · **Rama:** feature/QC-224-anular-entrega
>
> **Alcance.** El admin anula, desde la lista de entregas del pedido, una entrega registrada en QC-223:
> completa o solo algunas presentaciones (cada presentación anulada se anula entera, en todos sus lotes).
> Los paquetes vuelven a los lotes de los que salieron, con un movimiento de inventario compensatorio.
> Si el pedido estaba ENTREGADO, vuelve a TERMINADO con lo anulado otra vez pendiente. La anulación
> guarda quién, cuándo y un motivo obligatorio.
>
> **Lo que NO entra:**
> - Anular solo una parte de los paquetes de una presentación (p. ej. 3 de 10 galones): no entra.
> - El historial de entregas en el detalle de producto terminado: QC-225 (reutiliza la lista de este spec).
> - Cancelar un pedido con entregas: no entra; no cambia lo que ya existe.
>
> Sembrado por `/afinar-feature` el 2026-10-09. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- ¿Qué pasa si el lote de origen fue dado de baja (borrado lógico) después de la entrega? ¿Se devuelve
  igual a ese lote o se bloquea la anulación? Lo propone spec_author y lo cierra el humano en F1.3.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-09 | ¿Qué pasa con un pedido ENTREGADO al anular? | Vuelve a TERMINADO; lo anulado vuelve a contar como pendiente y se puede entregar de nuevo. |
| 2026-10-09 | ¿Completa o parcial? | Parcial por presentación: se eligen las presentaciones a anular (o todas). |
| 2026-10-09 | Dentro de una presentación | Se anula toda su cantidad, en todos sus lotes. No hay cantidad libre. |
| 2026-10-09 | ¿Quién puede? | Permiso nuevo `entregas.anular`, sembrado solo al Administrador (patrón de `entregas.modificar`, QC-223). |
| 2026-10-09 | ¿Desde dónde? | Lista de entregas del pedido, con acción Anular por entrega. QC-225 la reutiliza. |
| 2026-10-09 | Motivo | Obligatorio, texto libre; queda junto a quién y cuándo. |
| 2026-10-09 | Plazo | Sin límite, mientras el pedido no esté CANCELADO. |
| 2026-10-09 | ¿Se borra o modifica la entrega? | No. La entrega y sus movimientos no se tocan (R32 de QC-223); la anulación es un registro nuevo más un movimiento que compensa. Heredado de QC-223 y QC-18. |
| 2026-10-09 | Identificadores y borrado | En inglés, borrado lógico (heredado de la 4). |
| 2026-10-09 | ¿E2E? | Sí: mueve inventario (flujo crítico). |
| 2026-10-09 | Idempotencia | Clave de anulación generada en el cliente, como `deliveryKey` en QC-223. |
