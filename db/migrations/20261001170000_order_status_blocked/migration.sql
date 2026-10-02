-- Anade BLOQUEADO al final del tipo cerrado `OrderStatus`: el pedido cuyo material no alcanza
-- queda en ese estado en lugar de escribirse como PENDIENTE.
--
-- Va en su propia migracion y solo hace `ADD VALUE` porque Postgres no deja insertar el valor
-- recien anadido dentro de la transaccion que lo anade (55P04, `unsafe use of new value`) y
-- Prisma Migrate ejecuta cada migracion en una. El indice parcial que busca los bloqueados, que
-- si compara contra el valor, va en la migracion siguiente.
--
-- No hay columna nueva ni CHECK nuevo: `orders_cancellation_reason_matches_status` solo exige
-- motivo en CANCELADO, `orders_delivered_not_deleted` y `orders_finished_at_requires_delivered`
-- solo miran ENTREGADO, y `orders_packed_by_matches_status` se cumple con `packed_by` nulo en
-- cuanto el pedido no esta EN_EMPAQUE. Ninguno de los cuatro nombra el valor nuevo.

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'BLOQUEADO';
