ALTER TABLE "products" ADD COLUMN "stock" INTEGER;
ALTER TABLE "products" ADD CONSTRAINT "products_stock_non_negative" CHECK ("stock" >= 0);
CREATE INDEX "products_stock_idx" ON "products" ("stock") WHERE "deleted_at" IS NULL;
