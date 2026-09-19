DROP TRIGGER IF EXISTS "inventory_movements_check_company_trigger" ON "inventory_movements";
DROP FUNCTION IF EXISTS inventory_movements_check_company();

DROP INDEX IF EXISTS "inventory_movements_batch_id_idx";
DROP INDEX IF EXISTS "inventory_movements_company_id_idx";
DROP INDEX IF EXISTS "inventory_movements_created_by_idx";

ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_reason_matches_kind";
ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_quantity_not_zero";

ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_created_by_fkey";
ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_company_id_fkey";
ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_batch_id_fkey";

DROP TABLE IF EXISTS "inventory_movements";
