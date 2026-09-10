-- Lotes de producto (product_batches) y mudanza de auditoria + presentacion desde products.
--
-- El SQL de la tabla, las FK `product_id` -> `products` y `presentation_id` ->
-- `presentations` y sus indices lo produce Prisma a partir de `db/schema.prisma`. COMPLETADO
-- A MANO: las dos FK de auditoria (`product_batches_created_by_fkey`,
-- `product_batches_updated_by_fkey`), los dos CHECK (stock no negativo, unit_cost positivo) y
-- los dos ALTER de RLS no salen del esquema porque Prisma no modela CHECK ni RLS, y porque
-- `created_by`/`updated_by` son campos ESCALARES sin `@relation` (mismo patron que tuvieron
-- en `products`, `recipes`, `suppliers`, `orders`...). Las dos FK son por tanto DRIFT para
-- Prisma: toda migracion futura de `product_batches` hay que revisarla a mano.
--
-- La migracion ADEMAS quita de `products` la auditoria (`created_by`/`updated_by`) Y la
-- presentacion (`presentation_id`): DROP de las FK, el indice y las columnas. AVISO de perdida
-- de datos aceptada: no hay lotes que hereden los valores viejos de `products`, asi que la
-- autoria y la presentacion historicas del producto no se conservan.

-- CreateTable
CREATE TABLE "product_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "presentation_id" UUID NOT NULL,
    "stock" INTEGER NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "lot" TEXT,
    "expiry_date" DATE,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey -- lote -> producto. Sale del @relation del esquema. RESTRICT: el borrado de
-- producto es LOGICO, asi que en operacion normal no se dispara; pero un borrado fisico con
-- lotes vivos tiene que ser ruidoso, no arrastrarlos en silencio.
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey -- lote -> presentacion. Sale del @relation del esquema (presentacion obligatoria).
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "presentations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey -- escritas a mano, en ingles. Mismo criterio que las FK de auditoria que
-- este repo ya tiene (`recipes_created_by_fkey`, `suppliers_created_by_fkey`,
-- `orders_created_by_fkey`...): ON DELETE RESTRICT ON UPDATE CASCADE.
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex -- Postgres no indexa automaticamente el lado hijo de una FK, y por ahi pasan
-- tanto «lotes de este producto/presentacion» como la verificacion del RESTRICT.
CREATE INDEX "product_batches_product_id_idx" ON "product_batches"("product_id");
CREATE INDEX "product_batches_presentation_id_idx" ON "product_batches"("presentation_id");
CREATE INDEX "product_batches_created_by_idx" ON "product_batches"("created_by");
CREATE INDEX "product_batches_updated_by_idx" ON "product_batches"("updated_by");

-- CHECK de no negatividad del stock, escrito a mano: Prisma no modela CHECK. Replica el
-- `products_stock_non_negative` de QC-14: un lote no puede tener existencia negativa.
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_stock_non_negative" CHECK ("stock" >= 0);

-- CHECK de coste unitario positivo, escrito a mano (mismo patron que
-- `supplier_catalog_lines_cost_positive` de QC-43): un lote no puede costar <= 0.
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_unit_cost_positive" CHECK ("unit_cost" > 0);

-- RLS activado Y forzado (mismo patron que QC-14 para products/presentations). Sin policies:
-- deny-by-default para cualquier via que no sea Prisma.
ALTER TABLE "product_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY;

-- Mudanza de la auditoria y de la presentacion: fuera de `products`.
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_created_by_fkey";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_updated_by_fkey";
ALTER TABLE "products" DROP COLUMN IF EXISTS "created_by";
ALTER TABLE "products" DROP COLUMN IF EXISTS "updated_by";
DROP INDEX IF EXISTS "products_presentation_id_idx";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_presentation_id_fkey";
ALTER TABLE "products" DROP COLUMN IF EXISTS "presentation_id";
