-- Postgres no sabe quitar un valor de un enum: hay que recrear el tipo sin el. Falla a
-- proposito si queda algun asiento delivery_void, porque borrarlo en silencio perderia una
-- devolucion real de producto terminado.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "inventory_movements" WHERE "kind"::text = 'delivery_void') THEN
    RAISE EXCEPTION
      'inventory_movement_kind_delivery_void_in_use: hay asientos con kind = delivery_void; revertir el tipo los dejaria sin representar.'
      USING ERRCODE = '23514';
  END IF;
END $$;

-- Los CHECK y el indice parcial que comparan "kind" con un literal del tipo dependen de la
-- columna que se recrea: se sueltan antes y se reponen despues con el mismo texto. Los que
-- comparan "kind"::text no dependen del tipo y se quedan.
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_presentation_line_id_matches_kind";
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_production_quantity_positive";
DROP INDEX "inventory_movements_one_production_per_line";

ALTER TYPE "InventoryMovementKind" RENAME TO "InventoryMovementKind_old";
CREATE TYPE "InventoryMovementKind" AS ENUM ('opening', 'adjustment', 'consumption', 'production', 'delivery');
ALTER TABLE "inventory_movements"
  ALTER COLUMN "kind" TYPE "InventoryMovementKind" USING "kind"::text::"InventoryMovementKind";
DROP TYPE "InventoryMovementKind_old";

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_presentation_line_id_matches_kind"
  CHECK (("kind" = 'production') = ("order_presentation_line_id" IS NOT NULL));
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_production_quantity_positive"
  CHECK ("kind" <> 'production' OR "quantity" > 0);
CREATE UNIQUE INDEX "inventory_movements_one_production_per_line"
  ON "inventory_movements"("order_presentation_line_id")
  WHERE "kind" = 'production';
