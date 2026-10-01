-- Anade los dos estados de empaque al final del tipo cerrado, la columna de quien empaca y las
-- restricciones que atan la una al otro. De Prisma sale solo la columna `packed_by`; los dos
-- `ALTER TYPE`, la FK compuesta, el indice y los dos CHECK van a mano, como el resto de `orders`.

-- Un valor recien anadido a un enum no se puede usar como VALOR DEL ENUM dentro de la misma
-- transaccion que lo anade (55P04), y Prisma Migrate ejecuta cada migracion en una: por eso los
-- dos CHECK de abajo comparan "status"::text en vez de "status" = 'POR_EMPACAR'.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'POR_EMPACAR';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'EN_EMPAQUE';

ALTER TABLE "orders" ADD COLUMN "packed_by" UUID;

CREATE INDEX "orders_packed_by_idx" ON "orders" ("packed_by");

-- El empacador es de la misma empresa que el pedido por construccion: FK compuesta contra la
-- clave candidata de `users`, mismo patron que `order_assignments_user_id_fkey`. `RESTRICT`
-- porque una persona no se borra fisicamente en este ERP.
ALTER TABLE "orders" ADD CONSTRAINT "orders_packed_by_company_id_fkey"
  FOREIGN KEY ("packed_by", "company_id") REFERENCES "users"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Quien empaca es obligatorio en EN_EMPAQUE (primera rama) y esta prohibido en PENDIENTE,
-- EN_CURSO, POR_EMPACAR y CANCELADO (segunda rama); en ENTREGADO puede llevar valor o no
-- (los entregados antiguos no lo tienen, los nuevos lo conservan).
ALTER TABLE "orders" ADD CONSTRAINT "orders_packed_by_matches_status" CHECK (
  ("status"::text <> 'EN_EMPAQUE' OR "packed_by" IS NOT NULL)
  AND
  ("status"::text NOT IN ('PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'CANCELADO') OR "packed_by" IS NULL)
);

-- El CHECK de borrado se amplia con los dos estados nuevos: un pedido cuyo material ya se
-- consumio no se borra logicamente hasta que se cancele o se entregue por el unico camino que
-- existe para eso. Mismo nombre que el de la migracion anterior: es la misma regla, ampliada.
ALTER TABLE "orders" DROP CONSTRAINT "orders_delivered_not_deleted";
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_not_deleted"
  CHECK ("deleted_at" IS NULL OR "status"::text NOT IN ('ENTREGADO', 'CANCELADO', 'POR_EMPACAR', 'EN_EMPAQUE'));
