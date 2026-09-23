-- `finished_at` nace anulable y sin DEFAULT para no obligar a rellenar los pedidos ya
-- entregados.
--
-- Escrita a mano: el CHECK es drift para `prisma migrate dev`, como los demas CHECK de
-- `orders`. Se aplica con `pnpm run db:migrate` (`prisma migrate deploy`), que no mira drift.

ALTER TABLE "orders" ADD COLUMN "finished_at" TIMESTAMPTZ(6);

ALTER TABLE "orders" ADD CONSTRAINT "orders_finished_at_requires_delivered"
  CHECK ("finished_at" IS NULL OR "status" = 'ENTREGADO');

CREATE INDEX "orders_company_finished_idx"
  ON "orders" ("company_id", "finished_at" DESC NULLS LAST, "order_year" DESC, "order_sequence" DESC)
  WHERE "deleted_at" IS NULL AND "status" = 'ENTREGADO';
