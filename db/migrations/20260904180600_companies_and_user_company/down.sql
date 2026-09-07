-- DOWN de la migracion `companies_and_user_company` (QC-47). Convencion propia del repo:
-- Prisma Migrate no genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo
-- aplica `pnpm run db:rollback` (`scripts/db-rollback.ts`), que ademas borra su fila de
-- `_prisma_migrations` en la MISMA transaccion.
--
-- Revierte exactamente el `migration.sql` y deja el esquema EXACTO anterior (R25): no queda
-- tabla, columna, indice ni restriccion residual de la empresa, y los tres indices unicos del
-- usuario vuelven a tener la definicion LITERAL que tenian antes de esta feature.
-- Ver `specs/QC-47-modelo-empresa-y-membresias/design.md` seccion 3.3.
--
-- Cuatro cosas que no son evidentes:
--   1. La GUARDIA de abajo (R26) es R25 leida al reves: fallar antes que perder el dato. El UP
--      no puede fallar por colision —viene de un mundo donde las tres claves eran globales—,
--      pero el DOWN si: en cuanto exista una segunda empresa con su propio `admin`, recrear el
--      indice global choca con 23505. La guardia cuenta esos duplicados ANTES de tocar el
--      esquema para que el mensaje llegue antes que el SQLSTATE de Postgres, y NO borra,
--      renombra ni da de baja ninguna fila para poder recrear los indices. Prisma corre cada
--      SQL en una transaccion, asi que la reversion entera queda sin aplicar.
--   2. Los tres `CREATE UNIQUE INDEX` de abajo llevan el TEXTO LITERAL de
--      `db/migrations/20260806122638_users_and_roles/migration.sql`, byte a byte. Si el DOWN
--      los recreara CON `company_id`, el esquema revertido no seria el anterior y R25 seria
--      falso, pero el rollback terminaria en verde: por eso
--      `tests/unit/identity/schema/companies-migration.test.ts` los compara contra el texto
--      REAL de QC-4, leido de su archivo, y no contra una expectativa escrita a mano.
--   3. `pgcrypto` NO se toca: el UP no la crea en exclusiva (`CREATE EXTENSION IF NOT EXISTS`)
--      y `identity`, `inventario`, `recetas` y `unidades` dependen de ella.
--   4. Este archivo NO MENCIONA la columna del rol, ni su clave foranea, ni su indice, porque
--      el UP tampoco los toco (R13). Que el DOWN de la primera vuelta de la ficha tuviera que
--      recrearlos a mano era exactamente el sintoma del modelo equivocado.
--
-- El indice unico del nombre de empresa y la RLS de `companies` no se eliminan uno a uno:
-- caen con su tabla en el `DROP TABLE` del final.
--
-- LIMITE CONOCIDO DE «EXACTO» (R25): un `DROP COLUMN` + `ADD COLUMN` no devuelve una tabla a
-- su orden ordinal original. Aqui no aplica: este DOWN solo QUITA una columna que el UP anadio
-- al final, y la columna del rol mantiene su posicion original en todo momento, que es una
-- consecuencia agradable de no tocarla.

-- ---------------------------------------------------------------------------------------
-- 1. GUARDIA (R26): fallar antes que perder el dato. Va la PRIMERA, antes de tocar el
-- esquema. Cuenta los usuarios VIVOS que compartan, GLOBALMENTE, el correo, el nombre de
-- usuario o la pareja tipo+numero de documento — cosa que el modelo con empresa permite
-- (R16, R17, R18) y que la unicidad global de QC-4 no admite.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE
  duplicados BIGINT;
BEGIN
  SELECT
    (SELECT count(*) FROM (
       SELECT lower("email") FROM "users" WHERE "deleted_at" IS NULL
       GROUP BY lower("email") HAVING count(*) > 1
     ) AS correos)
  + (SELECT count(*) FROM (
       SELECT lower("username") FROM "users" WHERE "deleted_at" IS NULL
       GROUP BY lower("username") HAVING count(*) > 1
     ) AS usuarios)
  + (SELECT count(*) FROM (
       SELECT "document_type_code", "document_number" FROM "users" WHERE "deleted_at" IS NULL
       GROUP BY "document_type_code", "document_number" HAVING count(*) > 1
     ) AS documentos)
  INTO duplicados;

  IF duplicados > 0 THEN
    RAISE EXCEPTION
      'QC-47: hay % clave(s) de usuario (correo, nombre de usuario o documento) repetidas entre usuarios vivos de empresas distintas. La reversion se detiene: recrear los indices unicos GLOBALES de QC-4 obligaria a borrar o renombrar filas (requirements.md R26).',
      duplicados;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- 2. Los tres indices unicos vuelven a su forma GLOBAL, con el texto LITERAL de QC-4
-- (design.md > 2.3). Sin esto, el esquema revertido no seria el anterior (R25).
-- ---------------------------------------------------------------------------------------
DROP INDEX "users_email_unique";
DROP INDEX "users_username_unique";
DROP INDEX "users_document_unique";

CREATE UNIQUE INDEX "users_email_unique" ON "users" (lower("email")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_username_unique" ON "users" (lower("username")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_document_unique" ON "users" ("document_type_code", "document_number") WHERE "deleted_at" IS NULL;

-- 3. El indice de la FK.
DROP INDEX "users_company_id_idx";

-- 4. La FK.
ALTER TABLE "users" DROP CONSTRAINT "users_company_id_fkey";

-- 5. Y la columna.
ALTER TABLE "users" DROP COLUMN "company_id";

-- 6. La tabla nueva, la ultima: se lleva con ella su indice unico y su RLS.
DROP TABLE "companies";

-- 7. `pgcrypto` NO se toca (ver cabecera, punto 3).
