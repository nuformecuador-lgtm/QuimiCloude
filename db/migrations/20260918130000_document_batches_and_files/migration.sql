-- Dos tablas nuevas del modulo documentos: la tanda y el archivo que la compone.
--
-- Las FK hacia `companies` y `users` van escritas a mano porque las columnas correspondientes se
-- declaran escalares en el esquema, sin `@relation`, para que `documentos` no atraviese a
-- `identity` con un `include`: son DRIFT para Prisma, y toda migracion generada despues sobre
-- estas tablas va a emitir su propio `DROP CONSTRAINT` para ellas, que hay que borrar a mano.
--
-- La FK de `document_files` hacia su tanda es COMPUESTA, con `company_id` dentro, y apunta a
-- `document_batches_id_company_id_key`: asi un archivo no puede declarar una empresa distinta de
-- la de su propia tanda.

-- CreateEnum
CREATE TYPE "DocumentStrategy" AS ENUM ('catalogo', 'formula');

-- CreateEnum
CREATE TYPE "DocumentFileStatus" AS ENUM ('queued', 'processing', 'done', 'error');

-- CreateTable
CREATE TABLE "document_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "strategy" "DocumentStrategy" NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "status" "DocumentFileStatus" NOT NULL DEFAULT 'queued',
    "extracted_text" TEXT,
    "error_code" TEXT,
    "error_reason" TEXT,
    "queue_message_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_files_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey (A MANO) — tanda -> empresa. Un borrado fisico de empresa no puede dejar tandas
-- huerfanas.
ALTER TABLE "document_batches" ADD CONSTRAINT "document_batches_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (A MANO) — auditoria: tanda -> quien la encolo. Columna anulable: NULL es una
-- tanda que no encolo una persona, y una FK solo se evalua cuando la columna trae valor.
ALTER TABLE "document_batches" ADD CONSTRAINT "document_batches_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex — tiene que existir ANTES de la FK compuesta de abajo: Postgres exige que la
-- restriccion unica a la que apunta una clave foranea ya exista al declararla, y si no falla con
-- 42830. Un indice unico sirve de destino; no hace falta un UNIQUE CONSTRAINT.
CREATE UNIQUE INDEX "document_batches_id_company_id_key" ON "document_batches"("id", "company_id");

-- AddForeignKey (A MANO, COMPUESTA) — archivo -> su tanda, con la empresa dentro. Apunta a
-- `document_batches_id_company_id_key`, asi que la empresa del archivo tiene que coincidir con
-- la de su propia tanda por construccion.
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_batch_id_company_id_fkey"
  FOREIGN KEY ("batch_id", "company_id") REFERENCES "document_batches"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "document_batches_company_id_idx" ON "document_batches"("company_id");

-- CreateIndex
CREATE INDEX "document_batches_created_by_idx" ON "document_batches"("created_by");

-- CreateIndex — la misma ruta no entra dos veces en dos tandas de la misma empresa.
CREATE UNIQUE INDEX "document_files_company_path_key" ON "document_files"("company_id", "path");

-- CreateIndex
CREATE INDEX "document_files_batch_id_idx" ON "document_files"("batch_id");

-- CreateIndex
CREATE INDEX "document_files_company_id_idx" ON "document_files"("company_id");

-- Check (A MANO) — una fila lista siempre trae su texto, y ninguna otra lo trae. Una vuelta de
-- `error` a `queued` por un reintento tiene que limpiar el texto en el mismo UPDATE, pero eso ya
-- es cierto de por si: solo `done` puede tenerlo.
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_text_matches_status"
  CHECK (("status" = 'done' AND "extracted_text" IS NOT NULL)
      OR ("status" <> 'done' AND "extracted_text" IS NULL));

-- Check (A MANO) — una fila en error siempre trae su codigo y su motivo, y ninguna otra los trae.
-- Un reintento que vuelve de `error` a `queued` tiene que limpiar las dos columnas en el mismo
-- UPDATE: este CHECK lo exige.
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_error_matches_status"
  CHECK (("status" = 'error' AND "error_code" IS NOT NULL AND "error_reason" IS NOT NULL)
      OR ("status" <> 'error' AND "error_code" IS NULL AND "error_reason" IS NULL));

-- RLS activada y forzada, sin policies: deny-by-default para cualquier via que no sea Prisma. El
-- aislamiento real vive en el service, no aqui.
ALTER TABLE "document_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_batches" FORCE ROW LEVEL SECURITY;
ALTER TABLE "document_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_files" FORCE ROW LEVEL SECURITY;
