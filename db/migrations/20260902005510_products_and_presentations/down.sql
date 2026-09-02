-- DOWN de la migracion products_and_presentations. Convencion propia del repo: Prisma
-- Migrate no genera down migrations (`docs/architecture.md > Migraciones up/down`).
-- Lo aplica `pnpm run db:rollback` (`scripts/db-rollback.ts`).
--
-- Revierte exactamente el `migration.sql`, en orden inverso. El indice, la FK y los
-- cuatro CHECK caen con sus tablas, asi que no se dropean aparte.
--
-- NO se elimina la extension `pgcrypto`: esta migracion no la crea en exclusiva
-- (`CREATE EXTENSION IF NOT EXISTS`) y `identity` depende de ella (R22).

DROP TABLE IF EXISTS "products";
DROP TABLE IF EXISTS "presentations";
