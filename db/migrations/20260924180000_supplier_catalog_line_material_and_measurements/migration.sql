ALTER TABLE "supplier_catalog_lines" ADD COLUMN "material" TEXT;
ALTER TABLE "supplier_catalog_lines" ADD COLUMN "measurements" JSONB;
ALTER TABLE "supplier_catalog_lines"
  ADD CONSTRAINT "supplier_catalog_lines_material_check"
  CHECK ("material" IS NULL OR btrim("material") <> '');
ALTER TABLE "supplier_catalog_lines"
  ADD CONSTRAINT "supplier_catalog_lines_measurements_check"
  CHECK ("measurements" IS NULL OR jsonb_typeof("measurements") = 'object');
