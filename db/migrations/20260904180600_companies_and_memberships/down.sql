-- DOWN de la migracion companies_and_memberships (QC-47). Convencion propia del repo: Prisma
-- Migrate no genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`), que ademas borra su fila de
-- `_prisma_migrations` en la MISMA transaccion.
--
-- Revierte exactamente el `migration.sql` y deja el esquema EXACTO anterior (R25):
-- `users.role_id` vuelve a existir, OBLIGATORIA, con el rol que la pertenencia guardaba, con
-- su FK `users_role_id_fkey` y con su indice `users_role_id_idx` tal como los dejo QC-4; y no
-- queda tabla, columna, indice ni restriccion residual de la empresa ni de la pertenencia.
-- Ver `specs/QC-47-modelo-empresa-y-membresias/design.md` seccion 4.3.
--
-- Cuatro cosas que no son evidentes:
--   1. La GUARDIA de abajo (R26) es R24 leida al reves: fallar antes que perder el dato. Se
--      dispara en dos situaciones REALES —un usuario con dos pertenencias, que el modelo
--      permite desde el dia uno (R8), y un usuario sin ninguna, metido a mano—. En las dos, el
--      `role_id` de vuelta seria inventado.
--   2. La FK y el indice de `role_id` NO vuelven solos con el `ADD COLUMN`: Postgres se los
--      llevo CON la columna en el UP y hay que recrearlos A MANO, con el texto literal de
--      `db/migrations/20260806122638_users_and_roles/migration.sql`. Misma trampa que QC-52
--      documento con los CHECK de `products`.
--   3. `pgcrypto` NO se toca: el UP no la crea en exclusiva (`CREATE EXTENSION IF NOT EXISTS`)
--      y `identity`, `inventario`, `recetas` y `unidades` dependen de ella.
--   4. Este archivo NO MENCIONA `users_email_unique`, `users_username_unique` ni
--      `users_document_unique`, porque el UP tampoco los toco (R27). Siguen byte a byte como
--      los dejo QC-4.
--
-- Los indices, las FK y el RLS de las dos tablas nuevas no se eliminan uno a uno: caen con su
-- tabla en el `DROP TABLE` del final.
--
-- LIMITE CONOCIDO (R25): el `ADD COLUMN` devuelve la columna con su tipo y su obligatoriedad
-- exactos, pero NO en su posicion ordinal original —`users.role_id` se creo entre
-- `password_hash` y `created_at` (ver 20260806122638_users_and_roles/migration.sql) y vuelve
-- al final de la tabla—. Postgres no
-- permite reordenar columnas sin reescribir la tabla, y ninguna consulta del repo depende del
-- orden ordinal (nadie usa `SELECT *` ni `INSERT` sin lista de columnas). Se anota aqui para
-- que R25 no se lea como «exacto» sin este matiz.

-- ---------------------------------------------------------------------------------------
-- 1. GUARDIA: fallar antes que perder o inventar un rol (R26). Va la PRIMERA, antes de tocar
-- el esquema, para que su mensaje llegue antes que cualquier error de Postgres.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  malos BIGINT;
BEGIN
  SELECT count(*) INTO malos FROM (
    SELECT u."id"
    FROM "users" u
    LEFT JOIN "memberships" m ON m."user_id" = u."id"
    GROUP BY u."id"
    HAVING count(m."id") <> 1
  ) AS ambiguos;
  IF malos > 0 THEN
    RAISE EXCEPTION
      'QC-47: % usuario(s) tienen un numero de pertenencias distinto de 1. La reversion se detiene: el rol de vuelta seria ambiguo o inexistente (requirements.md R26).',
      malos;
  END IF;
END $$;

-- 2. La columna vuelve, primero ANULABLE: no hay valor que darle todavia.
ALTER TABLE "users" ADD COLUMN "role_id" UUID;

-- 3. Se rellena desde la pertenencia. El paso 1 garantiza que hay exactamente una por usuario.
UPDATE "users" u SET "role_id" = m."role_id" FROM "memberships" m WHERE m."user_id" = u."id";

-- 4. Y solo entonces se endurece a NOT NULL, como la dejo QC-4.
ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;

-- 5. La FK y el indice, recreados a mano con el texto literal de QC-4.
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- 6. Y se van las dos tablas nuevas, en orden inverso a la FK que las une.
DROP TABLE "memberships";
DROP TABLE "companies";
