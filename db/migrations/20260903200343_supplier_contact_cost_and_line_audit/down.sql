-- DOWN de la migracion `supplier_contact_cost_and_line_audit` (QC-43). Convencion propia
-- del repo: Prisma Migrate no genera down migrations
-- (`docs/architecture.md > Migraciones up/down`). Lo aplica `pnpm run db:rollback`
-- (`scripts/db-rollback.ts`).
--
-- REVIERTE al esquema EXACTO de QC-42, no solo deshace (R39, decision cerrada 15). Por eso
-- las dos restricciones viejas se vuelven a CREAR con su definicion literal: un `down.sql`
-- que solo dropeara dejaria la base sin ninguna regla de contacto y sin ninguna de costo,
-- que NO es el estado anterior. Esa es la diferencia entre «deshacer» y «revertir».
--
-- Orden inverso al del UP: primero los indices y las FK de la linea, luego sus columnas,
-- luego el CHECK del costo, y al final el del contacto.

DROP INDEX IF EXISTS "supplier_catalog_lines_updated_by_idx";

DROP INDEX IF EXISTS "supplier_catalog_lines_created_by_idx";

ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_updated_by_fkey";

ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_created_by_fkey";

ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "updated_by";

ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "created_by";

-- El costo vuelve a admitir cero, con el nombre que le dio QC-42.
ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_cost_positive";

ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_cost_non_negative"
  CHECK ("cost" >= 0);

-- El contacto vuelve a mirar solo AUSENCIA DE VALOR, en toda fila -- viva o no--, que es
-- la forma literal que le dio QC-42.
ALTER TABLE "suppliers" DROP CONSTRAINT IF EXISTS "suppliers_contact_required";

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_contact_required"
  CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL);
