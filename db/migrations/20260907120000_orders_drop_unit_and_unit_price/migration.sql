-- orders_drop_unit_and_unit_price — decision humana del 2026-09-07.
--
-- QUITA DEL MODELO DE PEDIDO la unidad (`unit_id`) y el precio unitario (`unit_price`). Un
-- pedido pasa a ser receta + cantidad + prioridad + estado, y el correlativo, los autores y el
-- borrado logico siguen intactos.
--
-- ESTO BORRA DATOS Y NO SE PUEDE DESHACER. El `down.sql` recrea LAS COLUMNAS, sus dos
-- restricciones y sus dos indices, pero NO PUEDE recrear su CONTENIDO: el precio y la unidad de
-- los pedidos ya registrados se pierden con este `DROP COLUMN`. Por eso el `down.sql` rellena
-- con un valor de relleno explicito y aborta si no puede hacerlo sin inventar una FK (ver alli).
--
-- QUE CAE, Y POR QUE CADA COSA:
--   1. `orders_unit_id_fkey`  — la FK hacia `units`, escrita a mano en la migracion de QC-33
--      (decision cerrada 17: las cuatro FK de `orders` son DRIFT para Prisma). Al irse la
--      columna, `pedidos` deja de tener frontera con el modulo `unidades` en la base.
--   2. `orders_unit_price_non_negative` — el CHECK de QC-33 R9. Sin columna no hay nada que
--      comprobar; dejarlo dependiendo de una columna inexistente ni siquiera es legal.
--   3. `orders_unit_id_idx` — el indice de la FK (QC-33).
--   4. `orders_unit_price_idx` — el indice PARCIAL de orden/filtro de QC-57
--      (`db/migrations/20260904160000_list_query_indexes`). `unitPrice` sale a la vez de
--      `ORDER_QUERYABLE.sortable`, asi que ninguna consulta puede volver a pedir ese orden.
--   5. Las dos columnas.
--
-- LO QUE **NO** SE TOCA, y hay que revisar que siga en pie tras cualquier `prisma migrate dev`
-- (mismo aviso que dejo QC-34): las otras TRES FK (`orders_recipe_id_fkey`,
-- `orders_created_by_fkey`, `orders_updated_by_fkey`), los CHECK que quedan —incluidos
-- `orders_quantity_positive`, `orders_delivered_not_deleted`,
-- `orders_cancellation_reason_matches_status` y `orders_order_year_matches_created_at`—, el
-- indice unico `orders_order_year_order_sequence_key`, la funcion `next_order_sequence` con sus
-- secuencias por ano, y el RLS activado Y forzado.
--
-- El orden importa: primero lo que DEPENDE de las columnas (FK, CHECK, indices) y luego las
-- columnas. Un `DROP COLUMN` arrastraria las dependencias por su cuenta, pero dejarlo implicito
-- esconderia que se estan tirando dos indices y una frontera entre modulos.

-- 1. La FK hacia `units`.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_unit_id_fkey";

-- 2. El CHECK del precio no negativo (QC-33 R9).
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_unit_price_non_negative";

-- 3 y 4. Los dos indices: el de la FK y el parcial de orden/filtro.
DROP INDEX IF EXISTS "orders_unit_id_idx";
DROP INDEX IF EXISTS "orders_unit_price_idx";

-- 5. Las dos columnas.
ALTER TABLE "orders" DROP COLUMN IF EXISTS "unit_id";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "unit_price";
