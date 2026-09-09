-- DOWN de la migracion `user_account_status` (QC-65). Convencion propia del repo: Prisma
-- Migrate no genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`), que ademas borra su fila de
-- `_prisma_migrations` en la MISMA transaccion.
--
-- Revierte EXACTAMENTE el `migration.sql`, en orden inverso, y deja `users` y el catalogo de
-- tipos de Postgres como estaban antes (R17): mismas columnas, mismos indices, mismas
-- restricciones y sin el tipo nuevo huerfano.
--
-- Tres cosas que no son evidentes:
--   1. El `DROP TYPE` va EL ULTIMO. Postgres lo rechaza mientras una columna dependa del
--      tipo, asi que primero hay que quitar `account_status` (es lo que documenta el
--      `down.sql` de `20260903191204_orders`).
--   2. Este archivo NO MENCIONA `deleted_at`, ni `failed_login_attempts`, `lock_level` o
--      `locked_until`, ni los tres indices unicos de `users`, ni el RLS, porque el UP tampoco
--      los toco (R17, R18). Un DOWN que recreara algo de eso seria la senal de que el UP se
--      salio de su alcance.
--   3. El dato del estado SE PIERDE al revertir, y es correcto: la columna entera desaparece.
--      No hay tabla de historial que salvar (R13) y no hay nada que preservar porque nadie lee
--      todavia el estado (R19).
--
-- LIMITE CONOCIDO DE «EXACTO»: un `DROP COLUMN` + `ADD COLUMN` no devuelve una tabla a su
-- orden ordinal original. Aqui no aplica: este DOWN solo QUITA las tres columnas que el UP
-- anadio al final, y ninguna columna anterior cambia de posicion.

-- 1. El indice del lado hijo de la FK.
DROP INDEX IF EXISTS "users_account_status_changed_by_idx";

-- 2. La FK escrita a mano por el UP.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_account_status_changed_by_fkey";

-- 3. Las tres columnas, en orden inverso al del `ADD COLUMN`.
ALTER TABLE "users"
  DROP COLUMN IF EXISTS "account_status_changed_by",
  DROP COLUMN IF EXISTS "account_status_changed_at",
  DROP COLUMN IF EXISTS "account_status";

-- 4. Y el tipo, EL ULTIMO: hasta aqui una columna dependia de el.
DROP TYPE IF EXISTS "UserAccountStatus";
