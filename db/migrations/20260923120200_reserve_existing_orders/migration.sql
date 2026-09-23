-- Aparta material para cada pedido vivo que ya existia antes de esta ficha: un bloque PL/pgSQL,
-- no un script aparte, porque corre una sola vez por construccion dentro de `_prisma_migrations`.

-- ---------------------------------------------------------------------------------------
-- Parentesis de RLS: el bloque lee y escribe estas cinco tablas directo por SQL.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders"                NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "recipe_lines"          NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "products"              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_batches"       NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "reservation_movements" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_now         TIMESTAMPTZ := now();
  order_row     RECORD;
  line_row      RECORD;
  batch_row     RECORD;
  alloc_row     RECORD;
  v_unit_id     UUID;
  v_line_count  INTEGER;
  v_need        NUMERIC(14,4);
  v_pending     NUMERIC(14,4);
  v_take        NUMERIC(14,4);
  v_covered     BOOLEAN;
BEGIN
  -- Cuanto lleva reservado cada lote dentro de ESTA migracion, para que un pedido posterior no
  -- vuelva a repartir lo que ya tomo uno anterior.
  CREATE TEMP TABLE tmp_migration_reserved (
    batch_id UUID PRIMARY KEY,
    reserved NUMERIC(14,4) NOT NULL DEFAULT 0
  ) ON COMMIT DROP;

  -- Lo apartado del pedido que se esta evaluando: se descarta si al final no cubre.
  CREATE TEMP TABLE tmp_order_allocations (
    batch_id UUID NOT NULL,
    quantity NUMERIC(14,4) NOT NULL
  ) ON COMMIT DROP;

  FOR order_row IN
    SELECT o.id, o.company_id, o.recipe_id, o.quantity
    FROM "orders" o
    WHERE o.status IN ('PENDIENTE', 'EN_CURSO') AND o.deleted_at IS NULL
    ORDER BY o.company_id, o.created_at, o.order_year, o.order_sequence, o.id
  LOOP
    SELECT count(*) INTO v_line_count FROM "recipe_lines" WHERE recipe_id = order_row.recipe_id;
    IF v_line_count = 0 THEN
      CONTINUE; -- receta sin lineas: no aparta, sin error (E2)
    END IF;

    DELETE FROM tmp_order_allocations;
    v_covered := TRUE;

    <<lines_loop>>
    FOR line_row IN
      SELECT product_id, percentage FROM "recipe_lines" WHERE recipe_id = order_row.recipe_id
    LOOP
      SELECT p.unit_id INTO v_unit_id FROM "products" p
        WHERE p.id = line_row.product_id AND p.company_id = order_row.company_id;

      IF v_unit_id IS NULL THEN
        v_covered := FALSE; -- producto sin unidad: no cubierto (E1)
        EXIT lines_loop;
      END IF;

      v_need := ceil(order_row.quantity * line_row.percentage * 100) / 10000;
      v_pending := v_need;

      FOR batch_row IN
        SELECT sub.batch_id, sub.available
        FROM (
          SELECT
            pb.id AS batch_id,
            pb.purchase_date,
            pb.lot,
            pb.stock
              - COALESCE((
                  SELECT sum(CASE WHEN rm.kind = 'reserve' THEN rm.quantity ELSE -rm.quantity END)
                  FROM "reservation_movements" rm
                  WHERE rm.batch_id = pb.id
                ), 0)
              - COALESCE((SELECT tmr.reserved FROM tmp_migration_reserved tmr WHERE tmr.batch_id = pb.id), 0)
              AS available
          FROM "product_batches" pb
          WHERE pb.product_id = line_row.product_id AND pb.company_id = order_row.company_id
        ) sub
        WHERE sub.available > 0
        ORDER BY
          sub.purchase_date ASC,
          (CASE WHEN sub.lot ~ '^[0-9]+$' THEN sub.lot::NUMERIC END) ASC,
          (CASE WHEN sub.lot ~ '^[0-9]+$' THEN NULL ELSE sub.lot END) ASC
      LOOP
        EXIT WHEN v_pending <= 0;

        v_take := LEAST(batch_row.available, v_pending);
        v_pending := v_pending - v_take;

        INSERT INTO tmp_order_allocations (batch_id, quantity) VALUES (batch_row.batch_id, v_take);
      END LOOP;

      IF v_pending > 0 THEN
        v_covered := FALSE; -- disponible insuficiente: no cubierto
        EXIT lines_loop;
      END IF;
    END LOOP;

    IF NOT v_covered THEN
      CONTINUE; -- todo o nada: no se escribe nada para este pedido
    END IF;

    FOR alloc_row IN
      SELECT batch_id, sum(quantity) AS quantity FROM tmp_order_allocations GROUP BY batch_id
    LOOP
      INSERT INTO "reservation_movements" ("company_id", "order_id", "batch_id", "kind", "quantity", "created_by", "created_at")
      VALUES (order_row.company_id, order_row.id, alloc_row.batch_id, 'reserve', alloc_row.quantity, NULL, v_now);

      INSERT INTO tmp_migration_reserved (batch_id, reserved)
      VALUES (alloc_row.batch_id, alloc_row.quantity)
      ON CONFLICT (batch_id) DO UPDATE SET reserved = tmp_migration_reserved.reserved + EXCLUDED.reserved;
    END LOOP;

    UPDATE "orders" SET reserved_at = v_now WHERE id = order_row.id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------
-- Se cierra el parentesis.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders"                FORCE  ROW LEVEL SECURITY;
ALTER TABLE "recipe_lines"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipe_lines"          FORCE  ROW LEVEL SECURITY;
ALTER TABLE "products"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products"              FORCE  ROW LEVEL SECURITY;
ALTER TABLE "product_batches"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_batches"       FORCE  ROW LEVEL SECURITY;
ALTER TABLE "reservation_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation_movements" FORCE  ROW LEVEL SECURITY;
