-- Escrita a mano: la identidad del producto terminado cruza `products`, `recipes` y
-- `presentations`, con dos FK compuestas y drift que `prisma migrate dev` no genera sobre una
-- base con datos. Se aplica con `pnpm run db:migrate` (`prisma migrate deploy`).

-- ---------------------------------------------------------------------------------------
-- 1. presentations.content: cuanto cabe en un envase, en la unidad de la presentacion.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "presentations" ADD COLUMN "content" DECIMAL(14,4);

ALTER TABLE "presentations" ADD CONSTRAINT "presentations_content_positive"
  CHECK ("content" IS NULL OR "content" > 0);

-- ---------------------------------------------------------------------------------------
-- 2. products.recipe_id / products.presentation_id: la identidad del producto terminado.
-- Ninguna de las dos lleva FK simple: la de presentacion es compuesta con company_id, mismo
-- patron que orders_company_id_presentation_id_fkey.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products" ADD COLUMN "recipe_id" UUID;
ALTER TABLE "products" ADD COLUMN "presentation_id" UUID;

ALTER TABLE "products" ADD CONSTRAINT "products_recipe_id_fkey"
  FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_presentation_id_fkey"
  FOREIGN KEY ("company_id", "presentation_id") REFERENCES "presentations"("company_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products" ADD CONSTRAINT "products_finished_identity_matches_type" CHECK (
  ("type" = 'FINISHED_PRODUCT') = ("recipe_id" IS NOT NULL AND "presentation_id" IS NOT NULL)
  AND ("recipe_id" IS NULL) = ("presentation_id" IS NULL)
);

CREATE UNIQUE INDEX "products_finished_identity_key"
  ON "products" ("company_id", "recipe_id", "presentation_id")
  WHERE "type" = 'FINISHED_PRODUCT' AND "deleted_at" IS NULL;

CREATE INDEX "products_recipe_id_idx" ON "products" ("recipe_id");

-- ---------------------------------------------------------------------------------------
-- 3. orders.presentation_content: copia del contenido de la presentacion del pedido.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "orders" ADD COLUMN "presentation_content" DECIMAL(14,4);

ALTER TABLE "orders" ADD CONSTRAINT "orders_presentation_content_positive"
  CHECK ("presentation_content" IS NULL OR "presentation_content" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_presentation_content_requires_presentation"
  CHECK ("presentation_id" IS NOT NULL OR "presentation_content" IS NULL);

-- ---------------------------------------------------------------------------------------
-- 4. product_batches.package_content: el contenido con el que se contaron los envases del
-- lote. Con el, un lote de produccion puede costar 0: el CHECK de costo positivo se reescribe
-- para permitirlo solo ahi, y uno nuevo exige unit_cost siempre que haya package_content.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "product_batches" ADD COLUMN "package_content" DECIMAL(14,4);

ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_package_content_positive"
  CHECK ("package_content" IS NULL OR "package_content" > 0);

ALTER TABLE "product_batches" DROP CONSTRAINT "product_batches_unit_cost_positive";
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_unit_cost_positive"
  CHECK ("unit_cost" > 0 OR ("unit_cost" = 0 AND "package_content" IS NOT NULL));

ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_package_content_requires_unit_cost"
  CHECK ("package_content" IS NULL OR "unit_cost" IS NOT NULL);

-- ---------------------------------------------------------------------------------------
-- 5. inventory_movements: el asiento de produccion. Reescribe los dos CHECK que ya cruzan
-- kind con order_id/reason para que production entre igual que consumption, sin motivo y con
-- order_id obligatorio; anade el CHECK de cantidad positiva y el indice de un asiento por
-- pedido.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_id_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_matches_kind"
  CHECK (("kind" IN ('consumption', 'production')) = ("order_id" IS NOT NULL));

ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (
    ("kind" = 'adjustment' AND "reason" IS NOT NULL)
    OR ("kind" IN ('opening', 'consumption', 'production') AND "reason" IS NULL)
  );

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_production_quantity_positive"
  CHECK ("kind" <> 'production' OR "quantity" > 0);

CREATE UNIQUE INDEX "inventory_movements_one_production_per_order"
  ON "inventory_movements" ("order_id")
  WHERE "kind" = 'production';
