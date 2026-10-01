-- El reparto en presentaciones puede dar de alta varios asientos `production` por pedido -uno por
-- linea-, asi que la unicidad de un solo asiento `production` por pedido
-- (`inventory_movements_one_production_per_order`, `20260924190100_*`) queda falsa. Depende de
-- la migracion anterior: la FK nueva apunta a `order_presentation_lines`, que nace ahi.
--
-- Escrita a mano: la FK hacia `order_presentation_lines` es drift (`InventoryMovement` es de
-- `inventario`, `OrderPresentationLine` de `pedidos`). Se aplica con `pnpm run db:migrate`.

-- ---------------------------------------------------------------------------------------
-- 1. La columna y su FK simple.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "inventory_movements" ADD COLUMN "order_presentation_line_id" UUID;

CREATE INDEX "inventory_movements_order_presentation_line_id_idx"
  ON "inventory_movements"("order_presentation_line_id");

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_presentation_line_id_fkey"
  FOREIGN KEY ("order_presentation_line_id") REFERENCES "order_presentation_lines"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- 2. Un asiento `production` exige su linea de reparto (mismo criterio que ya exige `order_id`
-- en `inventory_movements_order_id_matches_kind`, que sigue igual: no se toca).
-- ---------------------------------------------------------------------------------------
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_presentation_line_id_matches_kind"
  CHECK (("kind" = 'production') = ("order_presentation_line_id" IS NOT NULL));

-- ---------------------------------------------------------------------------------------
-- 3. La unicidad pasa de ser por pedido a ser por linea: ahora puede haber varios asientos
-- `production` de un mismo pedido, uno por linea de su reparto.
-- ---------------------------------------------------------------------------------------
DROP INDEX "inventory_movements_one_production_per_order";

CREATE UNIQUE INDEX "inventory_movements_one_production_per_line"
  ON "inventory_movements"("order_presentation_line_id")
  WHERE "kind" = 'production';
