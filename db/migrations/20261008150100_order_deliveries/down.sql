-- Reversion exacta de `migration.sql`, en orden inverso. Sin CASCADE: con entregas registradas,
-- los CHECK repuestos rechazan los asientos delivery y el down falla, a proposito.

-- 3. inventory_movements: los dos CHECK vuelven a su texto previo, y se quitan el indice
-- parcial, los CHECK, la FK y la columna de la entrega.
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (
    ("kind" = 'adjustment' AND "reason" IS NOT NULL)
    OR ("kind" IN ('opening', 'consumption', 'production') AND "reason" IS NULL)
  );
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_id_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_matches_kind"
  CHECK (("kind" IN ('consumption', 'production')) = ("order_id" IS NOT NULL));

DROP INDEX "inventory_movements_one_delivery_per_batch";
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_delivery_quantity_negative";
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_delivery_id_matches_kind";
DROP INDEX "inventory_movements_order_delivery_id_idx";
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_delivery_id_fkey";
ALTER TABLE "inventory_movements" DROP COLUMN "order_delivery_id";

-- 2. Las lineas de entrega y la clave compuesta de `order_presentation_lines`.
DROP TABLE "order_delivery_lines";
ALTER TABLE "order_presentation_lines" DROP CONSTRAINT "order_presentation_lines_id_company_id_key";

-- 1. La entrega.
DROP TABLE "order_deliveries";
