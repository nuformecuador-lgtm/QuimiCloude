-- La entrega al cliente del producto terminado de un pedido, sus lotes y el asiento de salida.
-- Las dos tablas son solo de insercion: sin `updated_at` ni `deleted_at`.
--
-- Escrita a mano: las FK compuestas con `company_id`, los CHECK, el indice parcial y la columna de
-- `inventory_movements` son drift (cruzan los modulos `pedidos` e `inventario`). Se aplica con
-- `pnpm run db:migrate`. Depende de la migracion anterior, que crea el valor 'delivery'.
--
-- Los CHECK nuevos comparan "kind"::text y no el literal del tipo: los down.sql que recrean el
-- enum no tienen que soltarlos y reponerlos.

-- ---------------------------------------------------------------------------------------
-- 1. La entrega. `delivery_key` hace idempotente un reenvio de la misma entrega.
-- ---------------------------------------------------------------------------------------
CREATE TABLE "order_deliveries" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id"   UUID NOT NULL,
  "order_id"     UUID NOT NULL,
  "customer_id"  UUID NOT NULL,
  "delivery_key" UUID NOT NULL,
  "created_by"   UUID NOT NULL,
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_deliveries_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_id_company_id_key" UNIQUE ("id", "company_id");
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_company_key_unique" UNIQUE ("company_id", "delivery_key");
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_order_id_fkey"
  FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_customer_id_fkey"
  FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "order_deliveries_order_id_idx" ON "order_deliveries"("order_id");
CREATE INDEX "order_deliveries_customer_id_idx" ON "order_deliveries"("company_id", "customer_id");
CREATE INDEX "order_deliveries_created_by_idx" ON "order_deliveries"("created_by");

-- ---------------------------------------------------------------------------------------
-- 2. Un lote dentro de una entrega. La clave compuesta de `order_presentation_lines` es la que
-- admite la FK compuesta de la linea de entrega.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "order_presentation_lines"
  ADD CONSTRAINT "order_presentation_lines_id_company_id_key" UNIQUE ("id", "company_id");

CREATE TABLE "order_delivery_lines" (
  "id"                         UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id"                 UUID NOT NULL,
  "delivery_id"                UUID NOT NULL,
  "order_presentation_line_id" UUID NOT NULL,
  "batch_id"                   UUID NOT NULL,
  "packages"                   INTEGER NOT NULL,
  "quantity"                   DECIMAL(14,4) NOT NULL,
  CONSTRAINT "order_delivery_lines_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "order_delivery_lines" ADD CONSTRAINT "order_delivery_lines_packages_positive" CHECK ("packages" > 0);
ALTER TABLE "order_delivery_lines" ADD CONSTRAINT "order_delivery_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "order_delivery_lines" ADD CONSTRAINT "order_delivery_lines_delivery_batch_unique" UNIQUE ("delivery_id", "batch_id");
ALTER TABLE "order_delivery_lines" ADD CONSTRAINT "order_delivery_lines_delivery_id_fkey"
  FOREIGN KEY ("delivery_id", "company_id") REFERENCES "order_deliveries"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_delivery_lines" ADD CONSTRAINT "order_delivery_lines_presentation_line_id_fkey"
  FOREIGN KEY ("order_presentation_line_id", "company_id") REFERENCES "order_presentation_lines"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_delivery_lines" ADD CONSTRAINT "order_delivery_lines_batch_id_fkey"
  FOREIGN KEY ("batch_id", "company_id") REFERENCES "product_batches"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "order_delivery_lines_company_id_idx" ON "order_delivery_lines"("company_id");
CREATE INDEX "order_delivery_lines_presentation_line_id_idx" ON "order_delivery_lines"("order_presentation_line_id");
CREATE INDEX "order_delivery_lines_batch_id_idx" ON "order_delivery_lines"("batch_id");

-- ---------------------------------------------------------------------------------------
-- 3. inventory_movements: el asiento de entrega, con su entrega, en negativo y uno por lote y
-- entrega. Reescribe los dos CHECK que cruzan kind con order_id/reason para que delivery entre
-- como production: sin motivo y con order_id obligatorio.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "inventory_movements" ADD COLUMN "order_delivery_id" UUID;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_delivery_id_fkey"
  FOREIGN KEY ("order_delivery_id", "company_id") REFERENCES "order_deliveries"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "inventory_movements_order_delivery_id_idx" ON "inventory_movements"("order_delivery_id");
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_delivery_id_matches_kind"
  CHECK (("kind"::text = 'delivery') = ("order_delivery_id" IS NOT NULL));
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_delivery_quantity_negative"
  CHECK ("kind"::text <> 'delivery' OR "quantity" < 0);
-- El predicado no puede ser "kind"::text = 'delivery': el cast de enum a texto no es IMMUTABLE y
-- Postgres lo rechaza en un indice. Por el CHECK anterior, "order_delivery_id" IS NOT NULL
-- selecciona exactamente los asientos delivery.
CREATE UNIQUE INDEX "inventory_movements_one_delivery_per_batch"
  ON "inventory_movements" ("order_delivery_id", "batch_id") WHERE "order_delivery_id" IS NOT NULL;

ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_id_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_matches_kind"
  CHECK (("kind"::text IN ('consumption', 'production', 'delivery')) = ("order_id" IS NOT NULL));
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (("kind"::text = 'adjustment' AND "reason" IS NOT NULL)
      OR ("kind"::text IN ('opening', 'consumption', 'production', 'delivery') AND "reason" IS NULL));

-- ---------------------------------------------------------------------------------------
-- 4. RLS activada y forzada, sin policies.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "order_deliveries"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_deliveries"     FORCE  ROW LEVEL SECURITY;
ALTER TABLE "order_delivery_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_delivery_lines" FORCE  ROW LEVEL SECURITY;
