-- Reversion exacta de `migration.sql`, en orden inverso.

-- 1. `orders.unit_id` y su FK/indice.
ALTER TABLE "orders" DROP CONSTRAINT "orders_unit_id_fkey";
DROP INDEX "orders_unit_id_idx";
ALTER TABLE "orders" DROP COLUMN "unit_id";

-- 2. La tabla del reparto (se lleva sus indices y CHECK al caer).
DROP TABLE "order_presentation_lines";
