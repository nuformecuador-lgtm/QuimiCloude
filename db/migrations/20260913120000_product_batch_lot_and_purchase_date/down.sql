-- Prisma Migrate no genera downs: lo aplica `pnpm run db:rollback` en una sola transaccion junto
-- con el borrado de su fila de `_prisma_migrations`.
--
-- NO VACIA NINGUN `lot` (R23): no se distingue lo que escribio el relleno de lo escrito a mano.
-- SI PIERDE todas las fechas de compra, porque `purchase_date` cae con su columna; si hacen falta,
-- se copian aparte antes de revertir.

-- Todo es DDL y no pasa por la RLS, pero se abre igual que en el UP: una lectura anadida aqui
-- despues no se encontraria la tabla forzada.
ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY;

DROP INDEX "product_batches_company_lot_unique";

ALTER TABLE "product_batches" DROP CONSTRAINT "product_batches_lot_length";
ALTER TABLE "product_batches" DROP CONSTRAINT "product_batches_lot_not_blank";

ALTER TABLE "product_batches" ALTER COLUMN "lot" DROP NOT NULL;

ALTER TABLE "product_batches" DROP COLUMN "purchase_date";

ALTER TABLE "product_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY;
