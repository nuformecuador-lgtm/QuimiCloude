-- Tabla nueva. De Prisma sale la tabla y sus columnas; las tres FK, los dos CHECK, el RLS y
-- el disparador estan escritos a mano porque Prisma no los modela y `company_id`/`created_by`
-- apuntan a modulos ajenos.

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "company_id" UUID NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey -- sale del `@relation` del esquema: `ProductBatch` es del mismo modulo.
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "product_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey -- escritas a mano: `companies` y `users` son de otro modulo y no llevan
-- `@relation` en el esquema, asi que son drift para Prisma.
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex -- Postgres no indexa el lado hijo de una FK.
CREATE INDEX "inventory_movements_batch_id_idx" ON "inventory_movements"("batch_id");
CREATE INDEX "inventory_movements_company_id_idx" ON "inventory_movements"("company_id");
CREATE INDEX "inventory_movements_created_by_idx" ON "inventory_movements"("created_by");

-- CHECK -- un asiento sin cantidad no explica nada.
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_quantity_not_zero" CHECK ("quantity" <> 0);

-- CHECK -- el motivo existe solo en un ajuste; el alta nunca lo lleva.
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (("kind" = 'adjustment' AND "reason" IS NOT NULL) OR ("kind" = 'opening' AND "reason" IS NULL));

-- RLS activado y forzado, sin policies: deny-by-default para cualquier via que no sea Prisma.
ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements" FORCE ROW LEVEL SECURITY;

-- Disparador: la empresa del asiento tiene que coincidir con la de su lote. `BEFORE INSERT`
-- porque el libro solo admite altas.
CREATE OR REPLACE FUNCTION inventory_movements_check_company()
  RETURNS TRIGGER AS $inventory_movements_check_company$
DECLARE
  batch_company_id UUID;
BEGIN
  SELECT parent."company_id" INTO batch_company_id
    FROM "product_batches" AS parent
   WHERE parent."id" = NEW."batch_id";

  -- Si el lote no existe, aqui no se dice nada: lo rechaza "inventory_movements_batch_id_fkey"
  -- con su 23503.
  IF FOUND AND batch_company_id <> NEW."company_id" THEN
    RAISE EXCEPTION
      'inventory_movements_company_differs_from_batch: el asiento % declara la empresa % pero su lote % pertenece a la empresa %.',
      NEW."id", NEW."company_id", NEW."batch_id", batch_company_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$inventory_movements_check_company$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_movements_check_company_trigger"
  BEFORE INSERT ON "inventory_movements"
  FOR EACH ROW EXECUTE FUNCTION inventory_movements_check_company();
