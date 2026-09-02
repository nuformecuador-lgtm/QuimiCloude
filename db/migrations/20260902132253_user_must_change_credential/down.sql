-- DOWN de 20260902132253_user_must_change_credential: elimina solo la columna anadida.
ALTER TABLE "users" DROP COLUMN IF EXISTS "must_change_credential";
