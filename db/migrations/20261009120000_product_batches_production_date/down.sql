-- Reversion exacta de `migration.sql`, en orden inverso. El dia de produccion que tuviera algun
-- lote se pierde.

ALTER TABLE "product_batches" DROP CONSTRAINT "product_batches_production_date_requires_expiry";

ALTER TABLE "product_batches" DROP COLUMN "production_date";
