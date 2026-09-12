-- Revierte QC-79 (R36): deja el esquema exactamente como estaba antes del UP y no toca ningun
-- otro objeto. La tabla nace vacia en el UP, asi que no se pierde ningun dato preexistente.
--
-- No hay nada que restaurar en `users`: el UP no le toco ni una columna ni un indice (R37).
-- El indice parcial y los dos `ENABLE`/`FORCE ROW LEVEL SECURITY` se caen con la tabla; el
-- indice se escribe explicito para que el DOWN se lea como el inverso linea a linea del UP, y
-- los ALTER de RLS no aparecen porque un ALTER sobre una tabla que ya no existe falla.
--
-- Sin CASCADE a proposito: si algo dependiera de esta tabla, el fallo tiene que ser ruidoso.

DROP INDEX IF EXISTS "credential_setup_tokens_one_live_per_user";
DROP TABLE IF EXISTS "credential_setup_tokens";
