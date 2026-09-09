-- Revierte `product_batches`: devuelve la auditoria y la presentacion a `products` y elimina
-- la tabla de lotes.
--
-- Las columnas y FK de auditoria de `products` vuelven EXACTAMENTE como las dejo QC-20
-- (`product_audit_and_presentation_uniqueness`): UUID anulable, sin NOT NULL, y las dos FK
-- `products_created_by_fkey`/`products_updated_by_fkey` hacia `users` con
-- ON DELETE RESTRICT ON UPDATE CASCADE. La presentacion vuelve como la dejo QC-14: UUID
-- anulable (no hay forma segura de rellenar NOT NULL desde los lotes, que aqui se borran) con
-- su FK `products_presentation_id_fkey` y su indice `products_presentation_id_idx`. Los
-- valores de autoria y presentacion no se restauran: las columnas vuelven vacias.

-- Restaurar la auditoria y la presentacion en products.
ALTER TABLE "products" ADD COLUMN "created_by" UUID;
ALTER TABLE "products" ADD COLUMN "updated_by" UUID;
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD COLUMN "presentation_id" UUID;
ALTER TABLE "products" ADD CONSTRAINT "products_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "presentations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "products_presentation_id_idx" ON "products"("presentation_id");

-- Quitar la tabla de lotes, de abajo a arriba: CHECK, indices, FK y tabla.
ALTER TABLE "product_batches" DROP CONSTRAINT IF EXISTS "product_batches_unit_cost_positive";
ALTER TABLE "product_batches" DROP CONSTRAINT IF EXISTS "product_batches_stock_non_negative";
DROP INDEX IF EXISTS "product_batches_updated_by_idx";
DROP INDEX IF EXISTS "product_batches_created_by_idx";
DROP INDEX IF EXISTS "product_batches_presentation_id_idx";
DROP INDEX IF EXISTS "product_batches_product_id_idx";
ALTER TABLE "product_batches" DROP CONSTRAINT IF EXISTS "product_batches_updated_by_fkey";
ALTER TABLE "product_batches" DROP CONSTRAINT IF EXISTS "product_batches_created_by_fkey";
ALTER TABLE "product_batches" DROP CONSTRAINT IF EXISTS "product_batches_presentation_id_fkey";
ALTER TABLE "product_batches" DROP CONSTRAINT IF EXISTS "product_batches_product_id_fkey";
DROP TABLE IF EXISTS "product_batches";
