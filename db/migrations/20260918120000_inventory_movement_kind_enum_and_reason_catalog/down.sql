-- Orden inverso al de `migration.sql`. El CHECK de coherencia vuelve a depender de la columna, asi
-- que se quita antes de devolver `kind` a TEXT y se vuelve a poner despues.

ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_reason_in_catalog";

ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_reason_matches_kind";

ALTER TABLE "inventory_movements"
  ALTER COLUMN "kind" TYPE TEXT USING "kind"::text;

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (("kind" = 'adjustment' AND "reason" IS NOT NULL) OR ("kind" = 'opening' AND "reason" IS NULL));

DROP TYPE IF EXISTS "InventoryMovementKind";
