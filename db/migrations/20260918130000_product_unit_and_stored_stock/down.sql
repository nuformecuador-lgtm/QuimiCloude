DROP TRIGGER IF EXISTS "presentations_check_unit_locked_trigger" ON "presentations";
DROP FUNCTION IF EXISTS presentations_check_unit_locked();

DROP TRIGGER IF EXISTS "product_batches_check_unit_trigger" ON "product_batches";
DROP FUNCTION IF EXISTS product_batches_check_unit();

DROP INDEX IF EXISTS "products_stock_idx";
DROP INDEX IF EXISTS "products_unit_id_idx";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_unit_id_fkey";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_stock_non_negative";

ALTER TABLE "products" DROP COLUMN IF EXISTS "stock";
ALTER TABLE "products" DROP COLUMN IF EXISTS "unit_id";
