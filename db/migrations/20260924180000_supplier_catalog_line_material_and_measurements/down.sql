ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_measurements_check";
ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_material_check";
ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "measurements";
ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "material";
