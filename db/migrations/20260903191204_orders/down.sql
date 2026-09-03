-- DOWN de la migracion orders (QC-33). Convencion propia del repo: Prisma Migrate no genera
-- down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`).
--
-- Revierte exactamente el `migration.sql`, en orden inverso. Los cinco indices, los cinco CHECK
-- y las cuatro FK —tambien las cuatro escritas a mano— caen con la tabla, asi que no se dropean
-- aparte: un `ALTER TABLE ... DROP CONSTRAINT` «por simetria» sobraria. Cuelgan de `orders`, que
-- desaparece; no es el caso de QC-32, donde las FK colgaban de tablas ajenas que sobrevivian.
--
-- LOS DOS TIPOS SI HAY QUE BORRARLOS A MANO: un DROP TABLE no se lleva el tipo enumerado, y
-- dejarlos huerfanos NO es «el esquema exacto anterior» (R38). Son los primeros enum del
-- repositorio, asi que este es el primer down.sql que lo necesita.
--
-- EL ORDEN IMPORTA: los dos tipos se borran DESPUES de la tabla que los usa. Al reves, Postgres
-- rechaza el `DROP TYPE` por dependencia.
--
-- NO se elimina la extension `pgcrypto`: esta migracion no la crea en exclusiva
-- (`CREATE EXTENSION IF NOT EXISTS`) y `identity`, `inventario`, `recetas` y `unidades`
-- dependen de ella.

DROP TABLE IF EXISTS "orders";
DROP TYPE IF EXISTS "OrderStatus";
DROP TYPE IF EXISTS "OrderPriority";
