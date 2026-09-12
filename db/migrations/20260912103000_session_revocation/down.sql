-- Revierte QC-23 (R43): deja el esquema exactamente como estaba antes del UP y no toca ningun
-- otro objeto. La tabla nace vacia en el UP, asi que no se pierde ningun dato preexistente; la
-- columna del sello si se pierde, y es lo correcto — antes del UP no existia.
--
-- Los dos indices, la clave primaria, la FK y los dos `ENABLE`/`FORCE ROW LEVEL SECURITY` se
-- caen con la tabla, y por eso no aparecen escritos: un `ALTER`/`DROP INDEX` sobre una tabla
-- que ya no existe falla.
--
-- Sin CASCADE a proposito, ni en el `DROP TABLE` ni en el `DROP COLUMN`: si algo dependiera de
-- esta tabla o de esta columna, el fallo tiene que ser ruidoso.
--
-- De `users` se quita SOLO la columna que anadio el UP. Ni un indice, ni una restriccion, ni
-- una fila: los tres indices unicos funcionales de QC-4/QC-47 y la FK de auditoria de QC-65 no
-- se mencionan aqui porque el UP no los toco.

DROP TABLE IF EXISTS "revoked_sessions";
ALTER TABLE "users" DROP COLUMN IF EXISTS "sessions_valid_from";
