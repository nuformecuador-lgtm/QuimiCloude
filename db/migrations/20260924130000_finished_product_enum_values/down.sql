-- Postgres no sabe quitar un valor de un enum: hay que recrear el tipo sin el. Falla a
-- proposito si queda algun producto FINISHED_PRODUCT o algun asiento production, porque
-- borrarlos en silencio perderia datos reales.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "products" WHERE "type" = 'FINISHED_PRODUCT') THEN
    RAISE EXCEPTION
      'finished_product_enum_values_in_use: hay productos con type = FINISHED_PRODUCT; revertir el tipo los dejaria sin representar.'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "inventory_movements" WHERE "kind" = 'production') THEN
    RAISE EXCEPTION
      'finished_product_enum_values_in_use: hay asientos con kind = production; revertir el tipo los dejaria sin representar.'
      USING ERRCODE = '23514';
  END IF;
END $$;

-- ProductType: se suelta el DEFAULT antes de recrear el tipo y se repone despues.
ALTER TABLE "products" ALTER COLUMN "type" DROP DEFAULT;

ALTER TYPE "ProductType" RENAME TO "ProductType_old";
CREATE TYPE "ProductType" AS ENUM ('PRODUCT', 'MACHINE', 'PACKAGING');
ALTER TABLE "products"
  ALTER COLUMN "type" TYPE "ProductType" USING "type"::text::"ProductType";
DROP TYPE "ProductType_old";

ALTER TABLE "products" ALTER COLUMN "type" SET DEFAULT 'PRODUCT';

-- InventoryMovementKind: los dos CHECK que comparan "kind" se sueltan y se reponen alrededor
-- del cambio de tipo, igual que QC-141.
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_matches_kind";
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_id_matches_kind";

ALTER TYPE "InventoryMovementKind" RENAME TO "InventoryMovementKind_old";
CREATE TYPE "InventoryMovementKind" AS ENUM ('opening', 'adjustment', 'consumption');
ALTER TABLE "inventory_movements"
  ALTER COLUMN "kind" TYPE "InventoryMovementKind" USING "kind"::text::"InventoryMovementKind";
DROP TYPE "InventoryMovementKind_old";

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (("kind" = 'adjustment' AND "reason" IS NOT NULL) OR ("kind" IN ('opening', 'consumption') AND "reason" IS NULL));
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_matches_kind"
  CHECK (("kind" = 'consumption') = ("order_id" IS NOT NULL));
