-- DOWN de la migracion units_catalog (QC-32). Convencion propia del repo: Prisma Migrate no
-- genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`).
--
-- Revierte exactamente el `migration.sql`, en ORDEN INVERSO al UP, y deja el esquema EXACTO
-- anterior (R23): `products.unit` vuelve a ser TEXT anulable y `recipe_lines.unit` TEXT NOT
-- NULL. Ver `specs/QC-32-modelo-unidades/design.md` seccion 4.6.
--
-- Tres cosas que no son evidentes:
--   1. La GUARDIA de abajo (R24) no sale de ninguna decision cerrada: es la decision 6 leida al
--      reves -- fallar antes que perder el dato. Sin ella, el DOWN o pierde en silencio la
--      unidad de cada fila, o revienta con un error de Postgres que no explica nada.
--   2. `ADD COLUMN "unit" TEXT NOT NULL` sin DEFAULT solo es legal si `recipe_lines` esta
--      vacia, y la guardia acaba de garantizarlo. Es DELIBERADO no poner `DEFAULT ''`: dejaria
--      un esquema PARECIDO al anterior, no el EXACTO que R23 pide, y sembraria unidades en
--      blanco.
--   3. `pgcrypto` NO se toca: esta migracion no la crea en exclusiva
--      (`CREATE EXTENSION IF NOT EXISTS`) y `identity`, `inventario` y `recetas` dependen de
--      ella.
--
-- Las dos FK y los dos indices de `unit_id` si se dropean explicitamente: cuelgan de tablas
-- ajenas que sobreviven al rollback, asi que no caen solos como caerian con su tabla.

-- QC-32 DOWN. Simetrico al UP: primero la guardia, despues la reversion.
DO $$
DECLARE
  referencias BIGINT;
BEGIN
  SELECT (SELECT count(*) FROM "products" WHERE "unit_id" IS NOT NULL)
       + (SELECT count(*) FROM "recipe_lines")
    INTO referencias;
  IF referencias > 0 THEN
    RAISE EXCEPTION
      'QC-32 down: hay % fila(s) apuntando a una unidad del catalogo. Revertir borraria esa referencia sin poder reconstruir el texto anterior: vacia o migra esas filas a mano antes de revertir.',
      referencias;
  END IF;
END $$;

ALTER TABLE "recipe_lines" DROP CONSTRAINT "recipe_lines_unit_id_fkey";
ALTER TABLE "products"     DROP CONSTRAINT "products_unit_id_fkey";
DROP INDEX "recipe_lines_unit_id_idx";
DROP INDEX "products_unit_id_idx";
ALTER TABLE "recipe_lines" DROP COLUMN "unit_id";
ALTER TABLE "products"     DROP COLUMN "unit_id";
ALTER TABLE "products"     ADD COLUMN "unit" TEXT;
ALTER TABLE "recipe_lines" ADD COLUMN "unit" TEXT NOT NULL;
DROP TABLE "units";
