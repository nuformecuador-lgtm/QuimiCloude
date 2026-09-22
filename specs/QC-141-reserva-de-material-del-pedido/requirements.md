# QC-141 — reserva-de-material-del-pedido · requirements.md

> **Zona:** `fullstack` · **Complejidad:** `high` · **depends_on:** — ·
> **Rama:** `feature/QC-141-reserva-de-material-del-pedido`
>
> **Alcance.** Un pedido vivo **aparta** el material que su receta necesita —todo o nada, de los
> lotes más antiguos primero—. Cancelar libera, editar recalcula lo apartado y entregar lo
> **consume** como salida real de inventario. La reserva de un pedido `PENDIENTE` **caduca a los 15
> días** y el pedido se cancela solo con motivo «pedido caducado», disparado por un **proceso diario
> programado** —el primero del sistema—. Inventario muestra total, disponible y reservado, con el
> **historial completo** de reservas. Los pedidos vivos existentes apartan al migrar. Además, la
> **existencia pasa de entero a decimal** (absorbe QC-149): lotes, movimientos y `products.stock`, y
> el alta de lote y el ajuste aceptan decimales.
>
> **Lo que NO entra.** El estado `BLOQUEADO`
> y su modal → **QC-138**, a la que ésta bloquea. Que solo la planta mueva el estado → **QC-145**.
> Pintar el importe → **QC-122**. Que la presentación declare cuánto contiene → **QC-130**. Plazo de
> caducidad configurable por empresa: otra ficha si hace falta.
>
> Sembrado por `/afinar-feature` el 2026-09-22. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Pedido que nunca se cubre.** Con «todo o nada», un pedido que no alcanza no aparta nada, así
   que no tiene reserva que caduque. ¿Se cancela también a los 15 días de creado, o espera
   indefinidamente —que es donde QC-138 lo dejará `BLOQUEADO`—?
2. **Entregar un pedido cuyo lote reservado ya no tiene el material** (tras una merma). ¿Consume de
   otros lotes disponibles, consume lo que haya, o rechaza la entrega?
3. **Canal de aviso de fallos del proceso diario.** `docs/conventions.md` exige que en crons todo
   error relevante notifique «por el canal definido», y ese canal no está definido en el repo.
4. **Dónde se consulta el historial de reservas** en la pantalla de inventario. Lo propone
   `spec_author` y se aprueba en F1.4.
5. **Detalles de la existencia decimal** que traía QC-149 sin acotar: cuántos decimales se
   **muestran** en pantalla y si la **cantidad de alerta** del producto también pasa a decimal.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-21 | Ciclo de la reserva | **Cancelar libera**; **entregar consume** de verdad (la reserva se convierte en salida real y la existencia baja); **editar a la baja libera la diferencia**; inventario muestra **total, disponible y reservado**. Decidido al acotar **QC-138** |
| 2026-09-22 | ¿Qué aparta un pedido que no alcanza? | **Nada**, y **todo o nada por pedido**: si falta un solo ingrediente, no aparta ninguno —tampoco los que sí alcanzan—. El material queda libre para un pedido que sí se pueda fabricar |
| 2026-09-22 | ¿Qué sigue la reserva? | **Lo que el pedido necesita hoy.** Crear y editar —al alza, a la baja, cambio de receta o de cantidad— recalculan lo apartado con la misma regla todo-o-nada. Editar **reinicia** el plazo de 15 días. Una edición posterior **de la receta** no toca reservas ya hechas (mismo criterio que el importe congelado, **QC-123 D8**) |
| 2026-09-22 | ¿De qué lotes? | **Los más antiguos primero**: fecha de compra ascendente, desempate por número de lote —numérico si ambos son solo dígitos— (heredado de **QC-123 D3 y D18**). Un ingrediente cuya unidad **no comparte base** con la del lote **no se reserva** (**QC-123 D6**, **QC-138**) |
| 2026-09-22 | ¿Con qué precisión se aparta? | **Decimal de 4 decimales**, como la receta y el pedido: se aparta exactamente lo necesario, sin redondear. **Deroga** «existencia entera» (QC-14/QC-91/QC-121). El cambio de tipo **entra en esta ficha** (absorbe **QC-149**, cancelada el 2026-09-22): `product_batches.stock`, `inventory_movements.quantity` y `products.stock` a `Decimal(14,4)` sin perder los enteros existentes, y el alta de lote y el ajuste aceptan decimales |
| 2026-09-22 | ¿La reserva caduca? | **Sí, a los 15 días** desde que se apartó o desde la última edición del pedido. **Solo pedidos `PENDIENTE`**: un `EN_CURSO` ya está en planta y no caduca |
| 2026-09-22 | ¿Qué pasa al caducar? | El pedido **se cancela** con el motivo **«pedido caducado»**, sin persona autora, y su material se libera |
| 2026-09-22 | ¿Quién dispara la caducidad? | **Un proceso diario programado** (tarea programada de Vercel), el **primero del sistema**, con su secreto de acceso y su aviso de fallos (ver pregunta abierta 3) |
| 2026-09-22 | Merma sobre material reservado | **Se permite y se avisa.** El ajuste a la baja refleja lo que físicamente hay; el lote queda marcado **«sobre-reservado»** y sus pedidos se ven sin cobertura completa |
| 2026-09-22 | Pedidos existentes | **Apartan al migrar**, del más antiguo al más nuevo, con la regla todo-o-nada. Sus 15 días cuentan desde la migración |
| 2026-09-22 | ¿Historial? | **Completo**: cada apartado, liberación, caducidad y consumo queda registrado y consultable. El consumo al entregar es además **salida real de inventario**, como el alta y el ajuste |
| 2026-09-22 | ¿Por dónde se entrega? | Consume en **cualquier camino que deje el pedido `ENTREGADO`**: hoy el Finalizar de la planta (QC-63) y la edición en Pedidos, que **QC-145** retirará |
| 2026-09-22 | Concurrencia | Dos pedidos sobre el mismo lote **se serializan**. El mecanismo lo elige `spec_author` con los precedentes de **QC-81** (bloqueo consultivo por empresa) y **QC-111** (`UPDATE` condicional) |
| 2026-09-22 | Existencia del producto | Consumir recalcula `products.stock` **en la misma transacción** (heredado de **QC-121 D4**) |
| 2026-09-22 | Permisos | **Sin permiso nuevo.** Inventario, incluido el historial, con `inventario.consultar`; la reserva nace dentro de las operaciones de pedidos y de asignaciones, cada una con su permiso actual. Validado **en el service** (heredado de **QC-123** y **QC-138**) |
| Heredada de la feature 4 | Borrado e identificadores | Borrado **lógico** donde aplique e identificadores de base **en inglés** |
| 2026-09-22 | ¿E2E? | **Sí**: es movimiento de inventario (`CHECKPOINTS.md`). Mínimo: dos pedidos compiten por el mismo lote y el segundo no aparta; cancelar libera; entregar consume y baja la existencia |
| 2026-09-22 | ¿Dependencia nueva? | **Ninguna librería.** La tarea programada es configuración de Vercel, no dependencia |
