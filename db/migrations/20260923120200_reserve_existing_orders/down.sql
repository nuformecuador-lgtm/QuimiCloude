-- Revierte solo lo que escribio esta migracion: los asientos "reserve" sin autor son SIEMPRE
-- suyos (ningun otro camino inserta una reserva sin persona ni proceso diario), asi que basta
-- identificarlos por eso y por compartir el instante en que corrio.

ALTER TABLE "orders"                NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "reservation_movements" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_migration_at TIMESTAMPTZ;
BEGIN
  SELECT max(created_at) INTO v_migration_at
    FROM "reservation_movements" WHERE kind = 'reserve' AND created_by IS NULL;

  IF v_migration_at IS NOT NULL THEN
    UPDATE "orders" SET reserved_at = NULL
      WHERE id IN (
        SELECT order_id FROM "reservation_movements"
        WHERE kind = 'reserve' AND created_by IS NULL AND created_at = v_migration_at
      );

    DELETE FROM "reservation_movements"
      WHERE kind = 'reserve' AND created_by IS NULL AND created_at = v_migration_at;
  END IF;
END $$;

ALTER TABLE "orders"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders"                FORCE  ROW LEVEL SECURITY;
ALTER TABLE "reservation_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation_movements" FORCE  ROW LEVEL SECURITY;
