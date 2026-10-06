-- Un lote sin presentacion de un insumo solo entra si su producto tiene unidad: es la unidad en
-- que se cuenta su existencia. Instrumentos y envases siguen como antes. La rama con presentacion
-- no cambia. Solo reemplaza la funcion: el disparador que la llama sigue igual y no se escribe
-- ninguna fila.
CREATE OR REPLACE FUNCTION product_batches_check_unit()
  RETURNS TRIGGER AS $product_batches_check_unit$
DECLARE
  product_unit_id      UUID;
  product_type         "ProductType";
  presentation_unit_id UUID;
BEGIN
  SELECT parent."unit_id", parent."type" INTO product_unit_id, product_type
    FROM "products" AS parent
   WHERE parent."id" = NEW."product_id";

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW."presentation_id" IS NULL THEN
    IF product_type = 'PRODUCT' AND product_unit_id IS NULL THEN
      RAISE EXCEPTION
        'product_batches_product_without_unit: el lote % no tiene presentacion y su producto % no tiene unidad.',
        NEW."id", NEW."product_id"
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT parent."unit_id" INTO presentation_unit_id
    FROM "presentations" AS parent
   WHERE parent."id" = NEW."presentation_id"
     FOR SHARE;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF product_unit_id IS NULL OR product_unit_id <> presentation_unit_id THEN
    RAISE EXCEPTION
      'product_batches_unit_differs_from_product: el lote % declara la presentacion % (unidad %), pero su producto % tiene la unidad %.',
      NEW."id", NEW."presentation_id", presentation_unit_id, NEW."product_id", product_unit_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$product_batches_check_unit$ LANGUAGE plpgsql;
