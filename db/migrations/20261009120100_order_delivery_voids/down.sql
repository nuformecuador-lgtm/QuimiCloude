-- Reversion exacta de `migration.sql`, en orden inverso. Sin CASCADE: con anulaciones
-- registradas, los CHECK repuestos rechazan los asientos delivery_void y el down falla, a
-- proposito.

-- 3. inventory_movements: los dos CHECK vuelven a su texto previo, y se quitan el indice
-- parcial, los CHECK, la FK y la columna de la anulacion.
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (("kind"::text = 'adjustment' AND "reason" IS NOT NULL)
      OR ("kind"::text IN ('opening', 'consumption', 'production', 'delivery') AND "reason" IS NULL));
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_id_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_matches_kind"
  CHECK (("kind"::text IN ('consumption', 'production', 'delivery')) = ("order_id" IS NOT NULL));

DROP INDEX "inventory_movements_one_delivery_void_per_batch";
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_delivery_void_quantity_positive";
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_delivery_void_id_matches_kind";
DROP INDEX "inventory_movements_order_delivery_void_id_idx";
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_delivery_void_id_fkey";
ALTER TABLE "inventory_movements" DROP COLUMN "order_delivery_void_id";

-- 2. Las lineas anuladas y la clave compuesta de `order_delivery_lines`.
DROP TABLE "order_delivery_void_lines";
ALTER TABLE "order_delivery_lines" DROP CONSTRAINT "order_delivery_lines_id_delivery_id_key";

-- 1. La anulacion.
DROP TABLE "order_delivery_voids";
