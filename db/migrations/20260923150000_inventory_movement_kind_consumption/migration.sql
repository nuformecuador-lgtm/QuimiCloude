-- Va sola: Postgres no deja usar un valor de enum recien anadido en la misma transaccion que lo
-- crea, y la migracion siguiente lo usa en un CHECK.
ALTER TYPE "InventoryMovementKind" ADD VALUE 'consumption';
