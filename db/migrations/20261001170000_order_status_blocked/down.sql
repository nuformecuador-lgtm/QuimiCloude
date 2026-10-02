-- DOWN de order_status_blocked. Convencion del repo: Prisma Migrate no genera downs. Lo aplica
-- `pnpm run db:rollback`, que ejecuta este archivo entero en una sola transaccion.
--
-- `ALTER TYPE ... DROP VALUE` no existe en Postgres: quitar BLOQUEADO obliga a recrear el tipo
-- entero. Cualquier restriccion o indice que nombre "status" tiene que revalidar contra el tipo
-- nuevo, asi que caen ANTES del cambio de tipo y se recrean DESPUES, con su texto LITERAL de
-- antes de esta migracion.

-- 0. Revertir no puede inventar a que estado pasaria un pedido Bloqueado: no hay ningun destino
--    que signifique lo mismo. Si hay filas, la reversion aborta entera y no toca nada.
DO $$
DECLARE bloqueados bigint;
BEGIN
  SELECT count(*) INTO bloqueados
    FROM "orders" WHERE "status"::text = 'BLOQUEADO';
  IF bloqueados > 0 THEN
    RAISE EXCEPTION 'ROLLBACK ABORTADO: hay % pedido(s) en BLOQUEADO. '
      'Revertir esta migracion los dejaria sin un estado valido. Cancelalos o '
      'desbloquealos y vuelve a intentarlo.', bloqueados;
  END IF;
END $$;

-- 1. Los CHECK que nombran "status".
ALTER TABLE "orders" DROP CONSTRAINT "orders_packed_by_matches_status";
ALTER TABLE "orders" DROP CONSTRAINT "orders_delivered_not_deleted";
ALTER TABLE "orders" DROP CONSTRAINT "orders_finished_at_requires_delivered";
ALTER TABLE "orders" DROP CONSTRAINT "orders_cancellation_reason_matches_status";

-- 2. Los indices que nombran "status" en su predicado parcial.
DROP INDEX "orders_status_idx";
DROP INDEX "orders_expirable_idx";
DROP INDEX "orders_company_finished_idx";

-- 3. El tipo se recrea con los seis valores de antes de esta migracion. El DEFAULT hay que
--    quitarlo antes del ALTER TYPE y volver a ponerlo despues: Postgres no sabe recastear un
--    default de un tipo que esta cambiando.
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
CREATE TYPE "OrderStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'ENTREGADO', 'CANCELADO', 'POR_EMPACAR', 'EN_EMPAQUE');
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus"
  USING ("status"::text::"OrderStatus");
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE';
DROP TYPE "OrderStatus_old";

-- 4. Los CHECK, con su texto LITERAL de antes de esta migracion.
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancellation_reason_matches_status"
  CHECK (("status"::text = 'CANCELADO') = ("cancellation_reason" IS NOT NULL));
ALTER TABLE "orders" ADD CONSTRAINT "orders_finished_at_requires_delivered"
  CHECK ("finished_at" IS NULL OR "status" = 'ENTREGADO');
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_not_deleted"
  CHECK ("deleted_at" IS NULL OR "status"::text NOT IN ('ENTREGADO', 'CANCELADO', 'POR_EMPACAR', 'EN_EMPAQUE'));
ALTER TABLE "orders" ADD CONSTRAINT "orders_packed_by_matches_status" CHECK (
  ("status"::text <> 'EN_EMPAQUE' OR "packed_by" IS NOT NULL)
  AND
  ("status"::text NOT IN ('PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'CANCELADO') OR "packed_by" IS NULL)
);

-- 5. Los indices, tambien con su texto LITERAL de antes de esta migracion.
CREATE INDEX "orders_status_idx" ON "orders" ("status") WHERE "deleted_at" IS NULL;
CREATE INDEX "orders_expirable_idx" ON "orders" ("reserved_at")
  WHERE "status" = 'PENDIENTE' AND "deleted_at" IS NULL AND "reserved_at" IS NOT NULL;
CREATE INDEX "orders_company_finished_idx"
  ON "orders" ("company_id", "finished_at" DESC NULLS LAST, "order_year" DESC, "order_sequence" DESC)
  WHERE "deleted_at" IS NULL AND "status" = 'ENTREGADO';
