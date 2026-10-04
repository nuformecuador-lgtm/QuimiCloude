-- Parte de envases del importe guardado. `ingredients_cost` sigue siendo el total; esta columna
-- solo lo desglosa para poder recalcular los envases sin tocar la parte de ingredientes.
-- Escrita a mano. Se aplica con `pnpm run db:migrate`, en una sola transaccion.

-- Parentesis de RLS: con RLS forzada y sin policies, el dueno no ve ninguna fila.
ALTER TABLE "orders"                   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_presentation_lines" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "orders" ADD COLUMN "packaging_cost" DECIMAL(14,4);

-- Un importe guardado sin lineas con envase no incluye envases, asi que su parte es 0. Con
-- lineas con envase no se puede saber que parte se sumo: se aborta en vez de inventarla.
DO $$
DECLARE con_envase bigint;
BEGIN
  SELECT count(*) INTO con_envase
    FROM "orders" o
   WHERE o."ingredients_cost" IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM "order_presentation_lines" l
        WHERE l."order_id" = o."id" AND l."packaging_product_id" IS NOT NULL
     );
  IF con_envase > 0 THEN
    RAISE EXCEPTION 'orders_packaging_cost_unknown: % pedido(s) con importe y envases en el reparto; '
      'no se puede separar la parte de envases', con_envase;
  END IF;
END $$;

UPDATE "orders" SET "packaging_cost" = 0 WHERE "ingredients_cost" IS NOT NULL;

ALTER TABLE "orders" ADD CONSTRAINT "orders_packaging_cost_matches_ingredients_cost"
  CHECK (("packaging_cost" IS NULL) = ("ingredients_cost" IS NULL));

ALTER TABLE "orders"                   FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_presentation_lines" FORCE ROW LEVEL SECURITY;
