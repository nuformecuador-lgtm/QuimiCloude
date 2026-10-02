-- Reversion exacta de `migration.sql`, en orden inverso.

-- 3. Vuelve la unicidad por pedido.
DROP INDEX "inventory_movements_one_production_per_line";

CREATE UNIQUE INDEX "inventory_movements_one_production_per_order"
  ON "inventory_movements"("order_id")
  WHERE "kind" = 'production';

-- 2. El CHECK nuevo.
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_presentation_line_id_matches_kind";

-- 1. La FK, el indice y la columna.
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_presentation_line_id_fkey";
DROP INDEX "inventory_movements_order_presentation_line_id_idx";
ALTER TABLE "inventory_movements" DROP COLUMN "order_presentation_line_id";
