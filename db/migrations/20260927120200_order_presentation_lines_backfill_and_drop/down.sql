-- DOWN de order_presentation_lines_backfill_and_drop. Convencion del repo: Prisma Migrate no
-- genera downs. Lo aplica `pnpm run db:rollback`, que ejecuta este archivo entero en una sola
-- transaccion.
--
-- Revierte `migration.sql` en orden inverso. Solo un pedido con UNA linea de reparto puede volver
-- a tener una presentacion unica; con mas de una no hay a cual volver, asi que la reversion
-- aborta entera. Es DESTRUCTIVO A CONCIENCIA: borra las lineas de reparto despues de copiarlas a
-- las columnas, y la reversion falla por la FK si alguna ya tiene un asiento de produccion.
-- `orders.unit_id` no se toca: la columna es de la migracion anterior y su `down.sql` la retira.

-- Parentesis de RLS, el mismo que abre el UP y por la misma razon.
ALTER TABLE "orders"                   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_presentation_lines" NO FORCE ROW LEVEL SECURITY;

-- 0. Ningun pedido con mas de una linea.
DO $$
DECLARE varias bigint;
BEGIN
  SELECT count(*) INTO varias
    FROM (SELECT "order_id"
            FROM "order_presentation_lines"
           GROUP BY "order_id"
          HAVING count(*) > 1) AS repartidos;
  IF varias > 0 THEN
    RAISE EXCEPTION 'ROLLBACK ABORTADO: hay % pedido(s) con mas de una linea de reparto. '
      'No pueden volver a una presentacion unica. Dejalos con una sola linea y vuelve a intentarlo.', varias;
  END IF;
END $$;

-- 3. Vuelven las columnas, el indice, la FK compuesta y los CHECK, con su texto de antes.
ALTER TABLE "orders" ADD COLUMN "presentation_id" UUID;
ALTER TABLE "orders" ADD COLUMN "presentation_content" DECIMAL(14,4);

CREATE INDEX "orders_presentation_id_idx" ON "orders" ("presentation_id");

ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_presentation_id_fkey"
  FOREIGN KEY ("company_id", "presentation_id") REFERENCES "presentations" ("company_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_presentation_content_positive"
  CHECK ("presentation_content" IS NULL OR "presentation_content" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_presentation_content_requires_presentation"
  CHECK ("presentation_id" IS NOT NULL OR "presentation_content" IS NULL);

-- 2. La linea unica vuelve a las columnas del pedido y desaparece.
UPDATE "orders" o
   SET "presentation_id" = l."presentation_id",
       "presentation_content" = l."presentation_content"
  FROM "order_presentation_lines" l
 WHERE l."order_id" = o."id";

DELETE FROM "order_presentation_lines";

-- Se cierra el parentesis.
ALTER TABLE "orders"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders"                   FORCE  ROW LEVEL SECURITY;
ALTER TABLE "order_presentation_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_presentation_lines" FORCE  ROW LEVEL SECURITY;
