-- QC-23: el registro de sesiones. Ver `specs/QC-23-registro-de-sesiones/design.md` seccion 2.
--
-- Trae los DOS mecanismos de revocacion, que son distintos a proposito (decision cerrada 6):
--   1. `users.sessions_valid_from` — el SELLO por usuario (R7, R8): mata de golpe todo lo
--      emitido en ese instante o antes. Es una columna de `users`, asi que la comprobacion
--      por peticion no cuesta ninguna consulta nueva: sale del `findFirst` que ya se hacia.
--   2. `revoked_sessions` — las sesiones cerradas UNA A UNA (R10, R11, R12).
--
-- El `DEFAULT CURRENT_TIMESTAMP` de la columna RELLENA las filas que ya existen; no hace falta
-- backfill aparte. Su efecto es el aceptado por escrito: al desplegar, toda sesion viva cae (y
-- ya caia igualmente por la subida del formato de la cookie a `v4`).
--
-- AVISO — esta migracion SI TOCA `users`, asi que la revision a mano no es opcional:
-- `prisma migrate dev --create-only` emite ADEMAS los `DROP CONSTRAINT` y `DROP INDEX` del
-- drift ya conocido del repo (las FK de auditoria escritas a mano —entre ellas
-- `users_account_status_changed_by_fkey`—, los indices unicos FUNCIONALES de QC-4/QC-47
-- `users_email_unique` / `users_username_unique` / `users_document_unique`, y el indice unico
-- PARCIAL `credential_setup_tokens_one_live_per_user` de QC-79). Se han borrado a mano, igual
-- que hicieron QC-65 y QC-79. Si uno se colara, el esquema seguiria validando, el cliente
-- compilaria y la suite seguiria verde: solo se entera
-- `tests/unit/identity/schema/session-revocation-migration.test.ts`.
--
-- La tabla nace VACIA: no hay backfill de filas ni ninguna escritura.

-- AlterTable -- el SELLO (R7, R8). NOT NULL con DEFAULT: las filas existentes quedan selladas
-- en el instante del despliegue. SIN indice a proposito (design.md > 2.1): nunca se filtra por
-- esta columna, solo se lee de la fila que ya se lee por clave primaria.
ALTER TABLE "users" ADD COLUMN "sessions_valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable -- el registro de sesiones cerradas (R10). SIN `company_id` (R44): no es tabla de
-- operacion, cuelga 1-a-N de `users` y su empresa es la de la persona. SIN `updated_at` y SIN
-- `deleted_at` (R45): la fila es un hecho inmutable y su unica escritura posterior es el
-- borrado FISICO de la purga (R39).
CREATE TABLE "revoked_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex -- ES R11 y R12. La comprobacion por peticion es UNA busqueda por indice unico, y
-- registrar dos veces el cierre del mismo `sid` choca con 23505 y se traduce a «ya estaba», no
-- a un error. Sin el UNIQUE haria falta un `SELECT` previo, que es una carrera.
CREATE UNIQUE INDEX "revoked_sessions_session_id_key" ON "revoked_sessions"("session_id");

-- CreateIndex -- ES R39. La purga es un `DELETE ... WHERE user_id = ? AND expires_at <= ?`
-- acotado a UNA persona, que es exactamente este indice: nunca recorre la tabla entera. Cubre
-- ademas el lado hijo de la FK, que Postgres no indexa solo.
CREATE INDEX "revoked_sessions_user_id_expires_at_idx" ON "revoked_sessions"("user_id", "expires_at");

-- AddForeignKey -- sesion cerrada -> usuario. Sale del @relation del esquema. RESTRICT: el
-- borrado de usuario es LOGICO (QC-66 R37), asi que en operacion normal no se dispara; pero un
-- borrado fisico con filas colgando tiene que ser ruidoso, no arrastrarlas en silencio. Mismo
-- criterio que `credential_setup_tokens_user_id_fkey`.
ALTER TABLE "revoked_sessions" ADD CONSTRAINT "revoked_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS activada Y forzada (R42), mismo patron que `credential_setup_tokens` y `product_batches`.
-- Sin ninguna policy: deny-by-default para cualquier via que no sea Prisma. NO sustituye a la
-- autorizacion del service (R27).
ALTER TABLE "revoked_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "revoked_sessions" FORCE ROW LEVEL SECURITY;
