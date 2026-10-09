-- Tabla `whatsapp_connections`. Base generada con `prisma migrate diff` y completada a mano: las FK
-- de `company_id` y `created_by` son escalares sin `@relation` en el esquema (drift a proposito) y
-- los dos indices unicos parciales no se pueden declarar en Prisma. Se aplica con
-- `pnpm run db:migrate` (`prisma migrate deploy`).

-- 1. Los dos enums.
CREATE TYPE "whatsapp_connection_origin" AS ENUM ('MANUAL', 'EMBEDDED_SIGNUP');
CREATE TYPE "whatsapp_connection_status" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'DISABLED');

-- 2. La tabla. `id` sin default: el cifrado de los secretos necesita el id antes del INSERT.
-- `updated_at` sin default: lo escribe Prisma (`@updatedAt`) en cada UPDATE.
CREATE TABLE "whatsapp_connections" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "origin" "whatsapp_connection_origin" NOT NULL DEFAULT 'MANUAL',
    "display_name" TEXT NOT NULL,
    "meta_app_id" TEXT NOT NULL,
    "waba_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "display_phone_number" TEXT,
    "verified_name" TEXT,
    "access_token_enc" TEXT NOT NULL,
    "app_secret_enc" TEXT NOT NULL,
    "verify_token_hash" TEXT NOT NULL,
    "status" "whatsapp_connection_status" NOT NULL DEFAULT 'PENDING',
    "last_error" TEXT,
    "last_checked_at" TIMESTAMPTZ(6),
    "last_webhook_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

-- 3. Clave candidata (empresa, id): destino de las FK compuestas de las tablas hijas.
CREATE UNIQUE INDEX "whatsapp_connections_company_id_id_key" ON "whatsapp_connections"("company_id", "id");

-- 4. Una sola conexion viva por empresa, tambien con dos altas concurrentes.
CREATE UNIQUE INDEX "whatsapp_connections_company_live_key" ON "whatsapp_connections"("company_id")
  WHERE "deleted_at" IS NULL;

-- 5. Un numero de WhatsApp vivo en una sola conexion de cualquier empresa: un webhook tiene que
-- resolverse a una sola empresa.
CREATE UNIQUE INDEX "whatsapp_connections_phone_number_id_live_key" ON "whatsapp_connections"("phone_number_id")
  WHERE "deleted_at" IS NULL;

-- 6. FK a mano (drift).
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Lado hijo de la FK de auditoria (Postgres no lo indexa solo).
CREATE INDEX "whatsapp_connections_created_by_idx" ON "whatsapp_connections"("created_by");

-- 8. RLS activada y forzada, sin policies, al final.
ALTER TABLE "whatsapp_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_connections" FORCE ROW LEVEL SECURITY;
