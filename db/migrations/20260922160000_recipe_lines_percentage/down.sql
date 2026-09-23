-- Revierte exactamente el UP, en orden inverso. Un porcentaje no tiene traduccion a cantidad +
-- unidad, asi que este DOWN tambien vacia la tabla antes de recrear las columnas NOT NULL sin
-- DEFAULT. Las columnas vuelven al final de la tabla: Postgres no reordena.

ALTER TABLE "recipe_lines" NO FORCE ROW LEVEL SECURITY;

DELETE FROM "recipe_lines";

ALTER TABLE "recipe_lines" DROP CONSTRAINT "recipe_lines_percentage_range";
ALTER TABLE "recipe_lines" DROP COLUMN "percentage";

ALTER TABLE "recipe_lines" ADD COLUMN "quantity" DECIMAL(14,4) NOT NULL;
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "recipe_lines" ADD COLUMN "unit_id" UUID NOT NULL;
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "recipe_lines_unit_id_idx" ON "recipe_lines"("unit_id");

ALTER TABLE "recipe_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipe_lines" FORCE  ROW LEVEL SECURITY;
