-- DOWN de order_packing_states. Convencion del repo: Prisma Migrate no genera downs. Lo aplica
-- `pnpm run db:rollback`, que ejecuta este archivo entero en una sola transaccion.
--
-- `ALTER TYPE ... DROP VALUE` no existe en Postgres: quitar POR_EMPACAR y EN_EMPAQUE obliga a
-- recrear el tipo entero. Cualquier restriccion o indice que nombre "status" tiene que revalidar
-- contra el tipo nuevo, asi que caen ANTES del cambio de tipo y se recrean DESPUES, con su texto
-- LITERAL de antes de esta migracion.

-- 0. Revertir no puede inventar a que estado pasaria un pedido Por empacar o En empaque: no hay
--    ningun destino que signifique lo mismo. Si hay filas en esos estados, la reversion aborta
--    entera y no toca nada.
DO $$
DECLARE en_empaque bigint;
BEGIN
  SELECT count(*) INTO en_empaque
    FROM "orders" WHERE "status"::text IN ('POR_EMPACAR', 'EN_EMPAQUE');
  IF en_empaque > 0 THEN
    RAISE EXCEPTION 'ROLLBACK ABORTADO: hay % pedido(s) en POR_EMPACAR o EN_EMPAQUE. '
      'Revertir esta migracion los dejaria sin un estado valido. Resuelve esos pedidos '
      '(entregalos o cancela los que aun se pueda) y vuelve a intentarlo.', en_empaque;
  END IF;
END $$;

-- 1. Los CHECK que nombran "status", en el orden inverso al que los creo esta migracion y la
--    anterior. `orders_packed_by_matches_status` cae con la columna que revisa.
ALTER TABLE "orders" DROP CONSTRAINT "orders_packed_by_matches_status";
ALTER TABLE "orders" DROP CONSTRAINT "orders_delivered_not_deleted";
ALTER TABLE "orders" DROP CONSTRAINT "orders_cancellation_reason_matches_status";
ALTER TABLE "orders" DROP CONSTRAINT "orders_finished_at_requires_delivered";

-- 2. Los indices que nombran "status" en su predicado parcial.
DROP INDEX "orders_status_idx";
DROP INDEX "orders_expirable_idx";
DROP INDEX "orders_company_finished_idx";

-- 3. Todo lo que trajo esta migracion sobre quien empaca.
ALTER TABLE "orders" DROP CONSTRAINT "orders_packed_by_company_id_fkey";
DROP INDEX "orders_packed_by_idx";
ALTER TABLE "orders" DROP COLUMN "packed_by";

-- 4. El tipo se recrea con los cuatro valores de antes de esta migracion. El DEFAULT hay que
--    quitarlo antes del ALTER TYPE y volver a ponerlo despues: Postgres no sabe recastear un
--    default de un tipo que esta cambiando.
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
CREATE TYPE "OrderStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'ENTREGADO', 'CANCELADO');
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus"
  USING ("status"::text::"OrderStatus");
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE';
DROP TYPE "OrderStatus_old";

-- 5. Los CHECK, con su texto LITERAL de antes de esta migracion.
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancellation_reason_matches_status"
  CHECK (("status"::text = 'CANCELADO') = ("cancellation_reason" IS NOT NULL));
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_not_deleted"
  CHECK ("deleted_at" IS NULL OR "status"::text NOT IN ('ENTREGADO', 'CANCELADO'));
ALTER TABLE "orders" ADD CONSTRAINT "orders_finished_at_requires_delivered"
  CHECK ("finished_at" IS NULL OR "status" = 'ENTREGADO');

-- 6. Los indices, tambien con su texto LITERAL de antes de esta migracion.
CREATE INDEX "orders_status_idx" ON "orders" ("status") WHERE "deleted_at" IS NULL;
CREATE INDEX "orders_expirable_idx" ON "orders" ("reserved_at")
  WHERE "status" = 'PENDIENTE' AND "deleted_at" IS NULL AND "reserved_at" IS NOT NULL;
CREATE INDEX "orders_company_finished_idx"
  ON "orders" ("company_id", "finished_at" DESC NULLS LAST, "order_year" DESC, "order_sequence" DESC)
  WHERE "deleted_at" IS NULL AND "status" = 'ENTREGADO';
