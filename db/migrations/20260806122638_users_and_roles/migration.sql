-- Feature 1: modelo-usuarios-y-roles.
--
-- Generado con `pnpm run db:migrate:create` y COMPLETADO A MANO: la extension
-- pgcrypto, el INSERT del catalogo de tipos de documento, los tres indices unicos
-- funcionales/parciales y los ALTER de RLS no salen de `db/schema.prisma` porque
-- Prisma no los modela (ver `specs/1-modelo-usuarios-y-roles/design.md` §4, §5, §8, §9).
-- Toda migracion futura de estas tablas hay que revisarla a mano para que no los borre.

-- Extension: `gen_random_uuid()` para los PK uuid. Idempotente a proposito; el
-- `down.sql` no la elimina (puede haberla creado otro).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "document_types" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("code")
);

-- Definicion del conjunto cerrado de tipos de documento (R9). No es seed de negocio:
-- es el propio conjunto admitido, que en este diseno vive como datos.
-- `updated_at` se da explicito: es NOT NULL y su valor lo pone el cliente Prisma
-- (`@updatedAt`), no un DEFAULT de la base, asi que un INSERT crudo sin el falla.
INSERT INTO "document_types" ("code", "name", "is_active", "updated_at")
VALUES ('CC', 'Cedula de ciudadania', true, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "first_names" TEXT NOT NULL,
    "last_names" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "document_type_code" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_document_type_code_fkey" FOREIGN KEY ("document_type_code") REFERENCES "document_types"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Indices unicos FUNCIONALES y PARCIALES, escritos a mano: Prisma no modela ni
-- `lower(...)` ni `WHERE`. `lower(...)` da la unicidad insensible a mayusculas (R4, R5);
-- `WHERE deleted_at IS NULL` acota la unicidad a los usuarios vivos, para que un borrado
-- logico no queme el correo, el username ni el documento para siempre (R22, R23).
CREATE UNIQUE INDEX "users_email_unique" ON "users" (lower("email")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_username_unique" ON "users" (lower("username")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_document_unique" ON "users" ("document_type_code", "document_number") WHERE "deleted_at" IS NULL;

-- CreateIndex — Postgres no indexa automaticamente el lado hijo de una FK.
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "users_document_type_code_idx" ON "users"("document_type_code");

-- RLS activado Y forzado en las tres tablas (R19). Sin `FORCE`, el dueno de las tablas
-- —que es con quien se conecta Prisma— la ignora entera. Se activa sin policies:
-- deny-by-default para cualquier via que no sea Prisma. Es defensa en profundidad, no
-- la frontera de autorizacion (`docs/architecture.md > Acceso a datos y autorizacion`).
ALTER TABLE "document_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_types" FORCE ROW LEVEL SECURITY;
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
