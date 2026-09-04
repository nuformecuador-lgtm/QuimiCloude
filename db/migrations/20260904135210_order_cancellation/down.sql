-- DOWN de la migracion order_cancellation (QC-34). Convencion propia del repo: Prisma Migrate no
-- genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`), que ejecuta este archivo entero dentro de
-- UNA SOLA transaccion: o se revierte todo o no se revierte nada.
--
-- Revierte exactamente el `migration.sql` y deja el esquema EN EL ESTADO EXACTO QUE DEJO QC-33
-- (R49): sin la columna del motivo, con el CHECK de borrado en su forma LITERAL anterior, con
-- `OrderStatus` de TRES valores y sin ninguna secuencia ni funcion residual.
--
-- `ALTER TYPE ... DROP VALUE` NO EXISTE EN POSTGRES, en ninguna version. Quitar un valor de un
-- tipo enumerado obliga a RECREAR EL TIPO ENTERO (paso 3), y el orden de los cinco pasos no es
-- negociable.

-- 0. GUARDIA DE DATOS. Revertir NO puede convertir un pedido cancelado en otra cosa: no hay
--    ningun estado destino que signifique lo mismo, y elegir uno (PENDIENTE, ENTREGADO) seria
--    inventar un hecho de negocio en un script de rollback. Si hay filas CANCELADO, el rollback
--    ABORTA y no toca nada -- la transaccion entera se deshace con el RAISE (R50).
DO $$
DECLARE cancelled bigint;
BEGIN
  SELECT count(*) INTO cancelled FROM "orders" WHERE "status"::text = 'CANCELADO';
  IF cancelled > 0 THEN
    RAISE EXCEPTION 'ROLLBACK ABORTADO: hay % pedido(s) en estado CANCELADO. '
      'Revertir esta migracion los dejaria sin estado valido. Decide que hacer con ellos '
      '(borrarlos fisicamente o moverlos a mano) y vuelve a intentarlo.', cancelled;
  END IF;
END $$;

-- 1. Los dos CHECK que nombran 'CANCELADO' caen ANTES del cambio de tipo: un ALTER COLUMN TYPE
--    tiene que revalidar toda restriccion que toque la columna, y una que menciona un valor
--    inexistente en el tipo nuevo no se puede revalidar.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_cancellation_reason_matches_status";
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_delivered_not_deleted";

-- 2. La columna del motivo.
ALTER TABLE "orders" DROP COLUMN IF EXISTS "cancellation_reason";

-- 3. EL TIPO SE RECREA. No hay DROP VALUE: se renombra el viejo, se crea el nuevo con los tres
--    valores de QC-33, se reescribe la columna casteando por texto y se borra el viejo.
--    El DEFAULT hay que quitarlo antes del ALTER TYPE y volver a ponerlo despues: Postgres no
--    sabe recastear un default de un tipo que esta cambiando.
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
CREATE TYPE "OrderStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'ENTREGADO');
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus"
  USING ("status"::text::"OrderStatus");
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE';
DROP TYPE "OrderStatus_old";

-- 4. El CHECK de borrado vuelve a su definicion LITERAL de QC-33 (no basta con dropearlo: eso
--    dejaria la base sin ninguna regla de borrado, que NO es «el esquema anterior»).
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_not_deleted"
  CHECK ("deleted_at" IS NULL OR "status" <> 'ENTREGADO');

-- 5. El aparato de secuencias de la seccion 4 (funcion + todas las secuencias creadas al vuelo).
DROP FUNCTION IF EXISTS "next_order_sequence"(integer);
DO $$
DECLARE seq record;
BEGIN
  FOR seq IN SELECT c.relname FROM pg_class c
              WHERE c.relkind = 'S' AND c.relname LIKE 'orders_sequence_%'
  LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS %I', seq.relname);
  END LOOP;
END $$;
