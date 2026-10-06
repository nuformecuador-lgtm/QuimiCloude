ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_count_balances";
ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_count_only_adjustment";
ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_count_pair";
ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "counted_stock";
ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "stock_before";
