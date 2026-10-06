-- Registro de cada confirmacion de importacion de inventario. La clave unica por empresa es la
-- que hace idempotente una segunda confirmacion con la misma clave.
--
-- La tabla, el unico y el indice los genera Prisma. A mano: las FK a `companies` y `users`
-- (cruzan de modulo y no llevan `@relation`), los CHECK y la RLS. Prisma no las regenera: si un
-- drift las quita, nada falla.

-- CreateTable
CREATE TABLE "inventory_imports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "import_key" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_sha256" TEXT NOT NULL,
    "rows_total" INTEGER,
    "created_count" INTEGER,
    "batch_added_count" INTEGER,
    "duplicate_count" INTEGER,
    "error_count" INTEGER,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "inventory_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_imports_company_created_idx" ON "inventory_imports"("company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_imports_company_key_unique" ON "inventory_imports"("company_id", "import_key");

ALTER TABLE "inventory_imports" ADD CONSTRAINT "inventory_imports_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_imports" ADD CONSTRAINT "inventory_imports_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_imports" ADD CONSTRAINT "inventory_imports_counts_non_negative" CHECK (
  ("rows_total" IS NULL OR "rows_total" >= 0)
  AND ("created_count" IS NULL OR "created_count" >= 0)
  AND ("batch_added_count" IS NULL OR "batch_added_count" >= 0)
  AND ("duplicate_count" IS NULL OR "duplicate_count" >= 0)
  AND ("error_count" IS NULL OR "error_count" >= 0)
);

-- Una importacion cerrada siempre deja sus cuentas.
ALTER TABLE "inventory_imports" ADD CONSTRAINT "inventory_imports_completed_has_totals"
  CHECK ("completed_at" IS NULL OR "rows_total" IS NOT NULL);

-- Sin policies: Prisma se conecta como dueno y solo FORCE hace que la RLS le aplique.
ALTER TABLE "inventory_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_imports" FORCE ROW LEVEL SECURITY;
