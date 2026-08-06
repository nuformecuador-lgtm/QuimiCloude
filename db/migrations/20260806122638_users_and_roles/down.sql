-- DOWN de 20260806122638_users_and_roles. Convencion propia del repo: Prisma Migrate no
-- genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`).
--
-- Revierte exactamente el `migration.sql`, en orden inverso. Los indices (incluidos los
-- tres unicos parciales) y las FK caen con sus tablas, asi que no se dropean aparte.
-- La fila 'CC' de `document_types` desaparece con la tabla.
--
-- NO se elimina la extension `pgcrypto`: esta migracion no la crea en exclusiva
-- (`CREATE EXTENSION IF NOT EXISTS`) y otra cosa de la base puede depender de ella (R20).

DROP TABLE IF EXISTS "users";
DROP TABLE IF EXISTS "roles";
DROP TABLE IF EXISTS "document_types";
