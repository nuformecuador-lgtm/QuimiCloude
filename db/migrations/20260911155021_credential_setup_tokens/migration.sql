-- QC-79: el enlace de un solo uso con el que una persona ESTABLECE su contrasena la primera
-- vez. Ver `specs/QC-79-alta-sin-contrasena-y-enlace/design.md` seccion 3.
--
-- La tabla, sus dos indices y la FK `user_id` -> `users` las produce Prisma a partir de
-- `db/schema.prisma`. COMPLETADO A MANO: el indice unico PARCIAL
-- `credential_setup_tokens_one_live_per_user` (design.md > 3.2) y los dos ALTER de RLS
-- (design.md > 3.3), porque Prisma no modela ni indices parciales ni RLS. El indice parcial es
-- por tanto DRIFT: toda migracion futura de esta tabla hay que revisarla a mano.
--
-- AVISO — `prisma migrate dev --create-only` emitio ADEMAS veintiun `DROP CONSTRAINT` y nueve
-- `DROP INDEX` por el drift ya conocido del repo (las FK de auditoria escritas a mano, las FK
-- compuestas de `work_group_members`, los indices GIN de QC-57...). Se borraron a mano, igual
-- que hizo QC-65. Si uno se colara, el esquema seguiria validando y la suite seguiria verde:
-- solo se entera `tests/unit/identity/schema/credential-setup-migration.test.ts`.
--
-- Esta migracion NO TOCA `users` (R37): ni una columna, ni un indice, y los tres indices
-- unicos funcionales y parciales de QC-4/QC-47 (`users_email_unique`, `users_username_unique`,
-- `users_document_unique`) se quedan exactamente como estan. La relacion inversa
-- `credentialSetupTokens` que gano el modelo `User` es VIRTUAL y no produce ningun DDL.
--
-- La tabla nace VACIA: no hay backfill ni ninguna escritura de filas.

-- CreateTable
CREATE TABLE "credential_setup_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_digest" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "superseded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_setup_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex -- Postgres no indexa automaticamente el lado hijo de una FK, y por ahi pasan
-- tanto «los enlaces de esta persona» como la verificacion del RESTRICT.
CREATE INDEX "credential_setup_tokens_user_id_idx" ON "credential_setup_tokens"("user_id");

-- CreateIndex -- la huella es unica: la comprobacion del enlace es UNA busqueda por indice
-- (design.md > 4.3), nunca un recorrido de las filas vivas.
CREATE UNIQUE INDEX "credential_setup_tokens_token_digest_key" ON "credential_setup_tokens"("token_digest");

-- AddForeignKey -- enlace -> usuario. Sale del @relation del esquema. RESTRICT: el borrado de
-- usuario es LOGICO (QC-66 R37), asi que en operacion normal no se dispara; pero un borrado
-- fisico con enlaces colgando tiene que ser ruidoso, no arrastrarlos en silencio. Mismo
-- criterio que `product_batches_*_fkey`.
ALTER TABLE "credential_setup_tokens" ADD CONSTRAINT "credential_setup_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex -- ESCRITO A MANO: Prisma no modela indices parciales (design.md > 3.2).
-- «Como maximo UN enlace vivo por persona» (R11). VIVO = ni consumido ni sustituido.
-- ES el requisito: con el, dos emisiones simultaneas para la misma persona acaban con UN solo
-- enlace vivo porque la segunda choca con 23505; sin el, haria falta un `SELECT` previo, que
-- es una carrera. El `WHERE` NO puede incluir `expires_at > now()`: `now()` no es IMMUTABLE y
-- Postgres rechaza el indice. Un enlace caducado ocupa la ranura a proposito, y el reenvio la
-- libera sustituyendolo en la misma transaccion.
CREATE UNIQUE INDEX "credential_setup_tokens_one_live_per_user"
  ON "credential_setup_tokens" ("user_id")
  WHERE "consumed_at" IS NULL AND "superseded_at" IS NULL;

-- RLS activado Y forzado (mismo patron que `product_batches`). Sin policies: deny-by-default
-- para cualquier via que no sea Prisma. NO sustituye a la autorizacion del service (R35).
ALTER TABLE "credential_setup_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credential_setup_tokens" FORCE ROW LEVEL SECURITY;
