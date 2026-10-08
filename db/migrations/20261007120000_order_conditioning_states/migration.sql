-- Anade al final del tipo cerrado los dos estados de acondicionamiento y TERMINADO, la columna de
-- quien acondiciona y las restricciones que atan columnas y estado. De Prisma salen solo la
-- columna y su indice; los `ALTER TYPE`, la FK compuesta y los CHECK van a mano, como el resto de
-- `orders`.

-- Un valor recien anadido a un enum no se puede usar como valor del enum dentro de la misma
-- transaccion que lo anade (55P04), y Prisma Migrate ejecuta cada migracion en una: por eso todos
-- los CHECK de abajo comparan "status"::text.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'POR_ACONDICIONAR';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'EN_ACONDICIONAMIENTO';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'TERMINADO';

ALTER TABLE "orders" ADD COLUMN "conditioned_by" UUID;

CREATE INDEX "orders_conditioned_by_idx" ON "orders" ("conditioned_by");

-- Quien acondiciona es de la misma empresa que el pedido por construccion, con el mismo patron
-- que `orders_packed_by_company_id_fkey`.
ALTER TABLE "orders" ADD CONSTRAINT "orders_conditioned_by_company_id_fkey"
  FOREIGN KEY ("conditioned_by", "company_id") REFERENCES "users"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Obligatorio desde que se comienza el acondicionamiento, prohibido antes y opcional en
-- ENTREGADO, porque los entregados antiguos nunca pasaron por el acondicionamiento.
ALTER TABLE "orders" ADD CONSTRAINT "orders_conditioned_by_matches_status" CHECK (
  ("status"::text NOT IN ('EN_ACONDICIONAMIENTO', 'TERMINADO') OR "conditioned_by" IS NOT NULL)
  AND
  ("status"::text NOT IN ('PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'EN_EMPAQUE', 'POR_ACONDICIONAR', 'CANCELADO', 'BLOQUEADO') OR "conditioned_by" IS NULL)
);

-- Quien empaco se conserva en todos los estados posteriores al empaque.
ALTER TABLE "orders" DROP CONSTRAINT "orders_packed_by_matches_status";
ALTER TABLE "orders" ADD CONSTRAINT "orders_packed_by_matches_status" CHECK (
  ("status"::text NOT IN ('EN_EMPAQUE', 'POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO') OR "packed_by" IS NOT NULL)
  AND
  ("status"::text NOT IN ('PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'CANCELADO') OR "packed_by" IS NULL)
);

ALTER TABLE "orders" DROP CONSTRAINT "orders_delivered_not_deleted";
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_not_deleted"
  CHECK ("deleted_at" IS NULL OR "status"::text NOT IN ('ENTREGADO', 'CANCELADO', 'POR_EMPACAR', 'EN_EMPAQUE', 'POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'));

-- `finished_at` se escribe al pasar a TERMINADO; ENTREGADO lo admite porque lo hereda de
-- TERMINADO y porque los entregados antiguos ya lo tienen.
ALTER TABLE "orders" DROP CONSTRAINT "orders_finished_at_requires_delivered";
ALTER TABLE "orders" ADD CONSTRAINT "orders_finished_at_requires_delivered"
  CHECK ("finished_at" IS NULL OR "status"::text IN ('TERMINADO', 'ENTREGADO'));

ALTER TABLE "orders" ADD CONSTRAINT "orders_finished_requires_finished_at"
  CHECK ("status"::text <> 'TERMINADO' OR "finished_at" IS NOT NULL);
