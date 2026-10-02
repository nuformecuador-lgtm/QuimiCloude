-- Revierte `migration.sql` en orden inverso. Sin `CASCADE`, `UPDATE` ni `INSERT`.
--
-- El `SET NOT NULL` va antes de cualquier `DELETE`: si queda algun usuario sin empresa (un
-- Maestro, vivo o dado de baja), falla con 23502 antes de tocar datos y la reversion entera se
-- deshace. No se reasigna ni se borra a nadie.

DROP INDEX "users_document_without_company_unique";
DROP INDEX "users_email_without_company_unique";

-- El nombre de usuario vuelve a ser por empresa, con el texto literal de la migracion de empresas.
-- No puede fallar por colision: lo que era unico en todo el sistema lo es dentro de cada empresa.
DROP INDEX "users_username_unique";
CREATE UNIQUE INDEX "users_username_unique" ON "users" ("company_id", lower("username")) WHERE "deleted_at" IS NULL;

DROP TRIGGER "users_check_company_by_role_trigger" ON "users";
DROP FUNCTION users_check_company_by_role();

ALTER TABLE "users" ALTER COLUMN "company_id" SET NOT NULL;

DELETE FROM "role_permissions" WHERE "permission_code" IN ('empresas.consultar', 'empresas.modificar');
DELETE FROM "role_permissions" WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'Maestro');
DELETE FROM "permissions" WHERE "code" IN ('empresas.consultar', 'empresas.modificar');
DELETE FROM "roles" WHERE "name" = 'Maestro';
