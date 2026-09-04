-- DOWN de la migracion product_image_path. Convencion propia del repo: Prisma Migrate no
-- genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`).
--
-- Revierte exactamente el `migration.sql` y deja el esquema anterior: `products` sin
-- `image_path`.
--
-- LA GUARDIA no es simetrica por gusto: `DROP COLUMN` es irreversible y la ruta de imagen no
-- se puede reconstruir desde ninguna otra columna. Si alguna fila viva tiene ruta escrita, el
-- rollback SE PARA en vez de borrarla en silencio -mismo criterio que el down de QC-32-. Las
-- filas con borrado logico (`deleted_at` no nulo) tambien cuentan: siguen siendo datos.

DO $$
DECLARE
  con_imagen BIGINT;
BEGIN
  SELECT count(*) INTO con_imagen FROM "products" WHERE "image_path" IS NOT NULL;
  IF con_imagen > 0 THEN
    RAISE EXCEPTION
      'product_image_path down: hay % producto(s) con ruta de imagen escrita. Revertir la borraria sin poder reconstruirla: vacia esa columna a mano antes de revertir.',
      con_imagen;
  END IF;
END $$;

ALTER TABLE "products" DROP COLUMN "image_path";
