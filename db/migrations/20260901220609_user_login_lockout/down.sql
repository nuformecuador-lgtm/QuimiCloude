-- DOWN de 20260901220609_user_login_lockout. Convencion propia del repo: Prisma Migrate no
-- genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`).
--
-- Revierte exactamente el `migration.sql`, en orden inverso: las tres columnas de bloqueo
-- que el UP anade a `users`, nada mas. No hay indices ni restricciones que deshacer (el UP
-- no crea ninguno) y el RLS con FORCE de `users` no se toca: anadir o quitar columnas no
-- lo altera.

ALTER TABLE "users" DROP COLUMN "locked_until";
ALTER TABLE "users" DROP COLUMN "lock_level";
ALTER TABLE "users" DROP COLUMN "failed_login_attempts";
