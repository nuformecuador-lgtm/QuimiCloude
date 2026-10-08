-- Reversion exacta de `migration.sql`, en orden inverso. Sin IF EXISTS: si algo de esto falta,
-- la base no esta en el estado que dejo la subida y el rollback debe fallar ruidosamente.

ALTER TABLE "orders" DROP CONSTRAINT "orders_company_id_customer_id_fkey";
DROP INDEX "orders_company_id_customer_id_idx";
ALTER TABLE "orders" DROP COLUMN "customer_id";
