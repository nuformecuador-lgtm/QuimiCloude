-- Cliente opcional en `orders`. Escrita a mano, no generada por `prisma migrate dev`: la FK es
-- compuesta y el escalar va sin `@relation` en el esquema (drift a proposito), asi que
-- `migrate dev` la leeria como drift y propondria un reset. Se aplica con
-- `pnpm run db:migrate` (`prisma migrate deploy`).
--
-- No toca ninguna otra tabla: `customers_company_id_id_key` ya existe, y `orders` ya tiene RLS
-- activada y forzada.

-- 1. La columna, nullable: los pedidos existentes quedan sin cliente. Sin DEFAULT ni UPDATE.
ALTER TABLE "orders" ADD COLUMN "customer_id" UUID;

-- 2. Indice del lado hijo con la empresa delante: sirve al filtro por cliente y a la comprobacion
--    de la FK. Completo y no parcial: tiene que cubrir tambien los pedidos dados de baja.
CREATE INDEX "orders_company_id_customer_id_idx" ON "orders" ("company_id", "customer_id");

-- 3. FK COMPUESTA: el cliente tiene que ser de la misma empresa que el pedido. MATCH SIMPLE (el
--    defecto): con `customer_id` NULL no se comprueba. RESTRICT: un cliente se da de baja logica,
--    nunca se borra fisicamente con pedidos apuntandolo.
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_customer_id_fkey"
  FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers"("company_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
