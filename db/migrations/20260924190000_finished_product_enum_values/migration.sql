-- Va sola: Postgres no deja usar un valor de enum recien anadido en la misma transaccion que lo
-- crea, y la migracion siguiente los usa en CHECK e indices.
ALTER TYPE "ProductType" ADD VALUE 'FINISHED_PRODUCT';
ALTER TYPE "InventoryMovementKind" ADD VALUE 'production';
