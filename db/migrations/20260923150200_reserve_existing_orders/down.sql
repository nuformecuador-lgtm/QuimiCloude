-- Revierte solo lo que escribio esta migracion: los asientos "reserve" sin autor son SIEMPRE
-- suyos (ningun otro camino inserta una reserva sin persona ni proceso diario), asi que basta
-- identificarlos por eso y por compartir el instante en que corrio. Antes de tocar nada, falla si
-- algun pedido que aparto la migracion tuvo actividad despues: otro asiento de reserva que no sea
-- el de la migracion, o un `reserved_at` que ya no es el suyo.

ALTER TABLE "orders"                NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "reservation_movements" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_migration_at      TIMESTAMPTZ;
  v_other_movements   INTEGER;
  v_changed_orders    INTEGER;
BEGIN
  SELECT max(created_at) INTO v_migration_at
    FROM "reservation_movements" WHERE kind = 'reserve' AND created_by IS NULL;

  IF v_migration_at IS NOT NULL THEN
    SELECT count(*) INTO v_other_movements
    FROM "reservation_movements" rm
    WHERE rm.order_id IN (
      SELECT order_id FROM "reservation_movements"
      WHERE kind = 'reserve' AND created_by IS NULL AND created_at = v_migration_at
    )
    AND NOT (rm.kind = 'reserve' AND rm.created_by IS NULL AND rm.created_at = v_migration_at);

    IF v_other_movements > 0 THEN
      RAISE EXCEPTION 'reserve_existing_orders: hay movimientos de reserva posteriores sobre pedidos que aparto esta migracion; revertir dejaria el libro incoherente';
    END IF;

    SELECT count(*) INTO v_changed_orders
    FROM "orders"
    WHERE id IN (
      SELECT order_id FROM "reservation_movements"
      WHERE kind = 'reserve' AND created_by IS NULL AND created_at = v_migration_at
    )
    AND reserved_at IS DISTINCT FROM v_migration_at;

    IF v_changed_orders > 0 THEN
      RAISE EXCEPTION 'reserve_existing_orders: un pedido que aparto esta migracion cambio su reserved_at; revertir dejaria el libro incoherente';
    END IF;

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
