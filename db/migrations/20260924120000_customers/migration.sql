-- Tabla `customers` mas los dos permisos de `clientes` en una instalacion que ya puede estar
-- sembrada. Escrita a mano, no generada por `prisma migrate dev`: las FK de `company_id`,
-- `created_by` y `updated_by` son escalares sin `@relation` en el esquema (drift a proposito),
-- y `migrate dev` las leeria como drift y propondria un reset. Se aplica con
-- `pnpm run db:migrate` (`prisma migrate deploy`).
--
-- No toca ninguna otra tabla: lo unico fuera de `customers` son filas de `permissions` y
-- `role_permissions`, ambas idempotentes por `ON CONFLICT`.

-- 1. La tabla. `updated_at` sin default: lo escribe Prisma (`@updatedAt`) en cada UPDATE.
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "first_names" TEXT NOT NULL,
    "last_names" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "company_id" UUID NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- 2. Clave candidata TOTAL (empresa, id): destino de las FK compuestas futuras e indice de empresa.
CREATE UNIQUE INDEX "customers_company_id_id_key" ON "customers"("company_id", "id");

-- 3. FK a mano (drift). RESTRICT y nunca SET NULL: borrar al usuario no es no haberlo creado nadie.
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Lado hijo de las dos FK de auditoria (Postgres no lo indexa solo).
CREATE INDEX "customers_created_by_idx" ON "customers"("created_by");
CREATE INDEX "customers_updated_by_idx" ON "customers"("updated_by");

-- 5. Los dos permisos en una instalacion que ya existe. Idempotente: el seed puede haberlos creado.
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('clientes.consultar', 'clientes', 'consultar', 'Consultar los clientes de la empresa.', CURRENT_TIMESTAMP),
  ('clientes.modificar', 'clientes', 'modificar', 'Crear, editar y borrar clientes de la empresa.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", "p"."code" FROM "roles" AS "r"
CROSS JOIN (VALUES ('clientes.consultar'), ('clientes.modificar')) AS "p"("code")
WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;

-- 6. RLS activada y forzada, sin policies, AL FINAL.
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
