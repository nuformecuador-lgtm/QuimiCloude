-- La anulacion de una entrega, las lineas de entrega que anula y el asiento que devuelve el
-- producto al lote. Las dos tablas son solo de insercion: sin `updated_at` ni `deleted_at`.
--
-- Escrita a mano: las FK compuestas con `company_id`, los CHECK, el indice parcial y la columna de
-- `inventory_movements` son drift (cruzan los modulos `pedidos` e `inventario`). Depende de la
-- migracion anterior, que crea el valor 'delivery_void'.
--
-- Los CHECK nuevos comparan "kind"::text y no el literal del tipo: los down.sql que recrean el
-- enum no tienen que soltarlos y reponerlos.

-- ---------------------------------------------------------------------------------------
-- 1. La anulacion. `void_key` hace idempotente un reenvio de la misma anulacion.
-- ---------------------------------------------------------------------------------------
CREATE TABLE "order_delivery_voids" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id"  UUID NOT NULL,
  "delivery_id" UUID NOT NULL,
  "void_key"    UUID NOT NULL,
  "reason"      TEXT NOT NULL,
  "created_by"  UUID NOT NULL,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_delivery_voids_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_id_company_id_key" UNIQUE ("id", "company_id");
ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_id_delivery_id_key" UNIQUE ("id", "delivery_id");
ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_company_key_unique" UNIQUE ("company_id", "void_key");
ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_reason_not_blank"
  CHECK (length(btrim("reason")) BETWEEN 1 AND 500);
ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_delivery_id_fkey"
  FOREIGN KEY ("delivery_id", "company_id") REFERENCES "order_deliveries"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_created_by_fkey"
  FOREIGN KEY ("created_by", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "order_delivery_voids_delivery_id_idx" ON "order_delivery_voids"("delivery_id");
CREATE INDEX "order_delivery_voids_created_by_idx" ON "order_delivery_voids"("created_by");

-- ---------------------------------------------------------------------------------------
-- 2. Una linea de entrega anulada. La clave compuesta de `order_delivery_lines` es la que admite
-- la FK que ata la linea a la entrega anulada.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "order_delivery_lines"
  ADD CONSTRAINT "order_delivery_lines_id_delivery_id_key" UNIQUE ("id", "delivery_id");

CREATE TABLE "order_delivery_void_lines" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id"       UUID NOT NULL,
  "void_id"          UUID NOT NULL,
  "delivery_id"      UUID NOT NULL,
  "delivery_line_id" UUID NOT NULL,
  CONSTRAINT "order_delivery_void_lines_pkey" PRIMARY KEY ("id")
);
-- Una linea de entrega se anula una sola vez.
ALTER TABLE "order_delivery_void_lines" ADD CONSTRAINT "order_delivery_void_lines_delivery_line_unique" UNIQUE ("delivery_line_id");
-- Las dos FK comparten "delivery_id": la linea anulada es de la misma entrega que la anulacion.
ALTER TABLE "order_delivery_void_lines" ADD CONSTRAINT "order_delivery_void_lines_void_fkey"
  FOREIGN KEY ("void_id", "delivery_id") REFERENCES "order_delivery_voids"("id", "delivery_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_delivery_void_lines" ADD CONSTRAINT "order_delivery_void_lines_delivery_line_fkey"
  FOREIGN KEY ("delivery_line_id", "delivery_id") REFERENCES "order_delivery_lines"("id", "delivery_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_delivery_void_lines" ADD CONSTRAINT "order_delivery_void_lines_void_company_fkey"
  FOREIGN KEY ("void_id", "company_id") REFERENCES "order_delivery_voids"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "order_delivery_void_lines_void_id_idx" ON "order_delivery_void_lines"("void_id");
CREATE INDEX "order_delivery_void_lines_company_id_idx" ON "order_delivery_void_lines"("company_id");

-- ---------------------------------------------------------------------------------------
-- 3. inventory_movements: el asiento de anulacion, con su anulacion, en positivo y uno por lote y
-- anulacion. Reescribe los dos CHECK que cruzan kind con order_id/reason para que delivery_void
-- entre como delivery: sin motivo y con order_id obligatorio.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "inventory_movements" ADD COLUMN "order_delivery_void_id" UUID;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_delivery_void_id_fkey"
  FOREIGN KEY ("order_delivery_void_id", "company_id") REFERENCES "order_delivery_voids"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "inventory_movements_order_delivery_void_id_idx" ON "inventory_movements"("order_delivery_void_id");
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_delivery_void_id_matches_kind"
  CHECK (("kind"::text = 'delivery_void') = ("order_delivery_void_id" IS NOT NULL));
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_delivery_void_quantity_positive"
  CHECK ("kind"::text <> 'delivery_void' OR "quantity" > 0);
-- El predicado no puede ser "kind"::text = 'delivery_void': el cast de enum a texto no es
-- IMMUTABLE y Postgres lo rechaza en un indice. Por el CHECK anterior, "order_delivery_void_id"
-- IS NOT NULL selecciona exactamente los asientos delivery_void.
CREATE UNIQUE INDEX "inventory_movements_one_delivery_void_per_batch"
  ON "inventory_movements" ("order_delivery_void_id", "batch_id") WHERE "order_delivery_void_id" IS NOT NULL;

ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_id_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_matches_kind"
  CHECK (("kind"::text IN ('consumption', 'production', 'delivery', 'delivery_void')) = ("order_id" IS NOT NULL));
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (("kind"::text = 'adjustment' AND "reason" IS NOT NULL)
      OR ("kind"::text IN ('opening', 'consumption', 'production', 'delivery', 'delivery_void') AND "reason" IS NULL));

-- ---------------------------------------------------------------------------------------
-- 4. RLS activada y forzada, sin policies.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "order_delivery_voids"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_delivery_voids"      FORCE  ROW LEVEL SECURITY;
ALTER TABLE "order_delivery_void_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_delivery_void_lines" FORCE  ROW LEVEL SECURITY;
