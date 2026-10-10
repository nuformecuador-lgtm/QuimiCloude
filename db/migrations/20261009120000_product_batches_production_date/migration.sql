-- Dia de produccion del lote. Anulable y sin DEFAULT: ninguna fila existente se reescribe y todas
-- quedan sin el dato.
--
-- El CHECK va a mano y es drift: Prisma no lo regenera. Exige el vencimiento cuando hay dia de
-- produccion, para que «el lote tiene sus datos» se decida con una sola columna.

-- AlterTable
ALTER TABLE "product_batches" ADD COLUMN "production_date" DATE;

ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_production_date_requires_expiry"
  CHECK ("production_date" IS NULL OR "expiry_date" IS NOT NULL);
