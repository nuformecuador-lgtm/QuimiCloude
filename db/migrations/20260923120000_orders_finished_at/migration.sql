-- La fecha de terminado.
--
-- `orders` gana `finished_at`, anulable y sin DEFAULT: nace en NULL en todas las filas
-- existentes, incluidas las ya ENTREGADO. Un CHECK impide que quede con valor si el estado
-- no es ENTREGADO. El indice parcial es para "Terminados": solo cubre los pedidos vivos y
-- entregados, ordenados por fecha de terminado descendente con los nulos al final, y como
-- desempate por numero de pedido descendente.
--
-- Escrita a mano: el CHECK es drift para `prisma migrate dev`, como los demas CHECK de
-- `orders`. Se aplica con `pnpm run db:migrate` (`prisma migrate deploy`), que no mira drift.

ALTER TABLE "orders" ADD COLUMN "finished_at" TIMESTAMPTZ(6);

ALTER TABLE "orders" ADD CONSTRAINT "orders_finished_at_requires_delivered"
  CHECK ("finished_at" IS NULL OR "status" = 'ENTREGADO');

CREATE INDEX "orders_company_finished_idx"
  ON "orders" ("company_id", "finished_at" DESC NULLS LAST, "order_year" DESC, "order_sequence" DESC)
  WHERE "deleted_at" IS NULL AND "status" = 'ENTREGADO';
