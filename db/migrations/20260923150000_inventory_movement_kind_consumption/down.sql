-- Postgres no sabe quitar un valor de un enum: hay que recrear el tipo sin el. Falla a
-- proposito si queda algun asiento 'consumption', porque borrarlo en silencio perderia una
-- salida real de inventario.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "inventory_movements" WHERE "kind" = 'consumption') THEN
    RAISE EXCEPTION
      'inventory_movement_kind_consumption_in_use: hay asientos con kind = consumption; revertir el tipo los dejaria sin representar.'
      USING ERRCODE = '23514';
  END IF;
END $$;

ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_matches_kind";

ALTER TYPE "InventoryMovementKind" RENAME TO "InventoryMovementKind_old";
CREATE TYPE "InventoryMovementKind" AS ENUM ('opening', 'adjustment');
ALTER TABLE "inventory_movements"
  ALTER COLUMN "kind" TYPE "InventoryMovementKind" USING "kind"::text::"InventoryMovementKind";
DROP TYPE "InventoryMovementKind_old";

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (("kind" = 'adjustment' AND "reason" IS NOT NULL) OR ("kind" = 'opening' AND "reason" IS NULL));
