-- La presentacion del pedido.
--
-- `orders` gana `presentation_id`, anulable, con indice y FK COMPUESTA
-- `(company_id, presentation_id)` hacia `presentations(company_id, id)`, mismo patron que
-- `supplier_catalog_lines_company_id_presentation_id_fkey`
-- (`db/migrations/20260917120000_suppliers_company_scope/migration.sql`).
--
-- Escrita a mano: la FK es drift para `prisma migrate dev`, igual que las demas referencias de
-- `orders` hacia otros modulos. Se aplica con `pnpm run db:migrate` (`prisma migrate deploy`),
-- que no mira drift.
--
-- DDL puro sobre una columna nueva y anulable: sin backfill, sin `UPDATE`, sin `NO FORCE`. La
-- RLS forzada de `orders` no interviene y la FK no comprueba nada sobre las filas existentes
-- porque todas nacen con `presentation_id` en NULL.

ALTER TABLE "orders" ADD COLUMN "presentation_id" UUID;

CREATE INDEX "orders_presentation_id_idx" ON "orders" ("presentation_id");

ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_presentation_id_fkey"
  FOREIGN KEY ("company_id", "presentation_id") REFERENCES "presentations" ("company_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
