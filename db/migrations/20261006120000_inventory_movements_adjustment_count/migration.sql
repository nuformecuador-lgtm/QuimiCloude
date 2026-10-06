-- Escrita a mano: las dos columnas salen del esquema; los tres CHECK son drift para Prisma.
-- No rellena filas ya escritas: un ajuste viejo queda con las dos columnas vacias.

ALTER TABLE "inventory_movements" ADD COLUMN "stock_before"  DECIMAL(14,4);
ALTER TABLE "inventory_movements" ADD COLUMN "counted_stock" DECIMAL(14,4);

-- o los dos o ninguno
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_count_pair"
  CHECK (("stock_before" IS NULL) = ("counted_stock" IS NULL));

-- solo un ajuste los lleva; `::text` para que el CHECK sobreviva a los downs que recrean el enum
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_count_only_adjustment"
  CHECK ("stock_before" IS NULL OR "kind"::text = 'adjustment');

-- el asiento cuadra: total = existencia de antes + cantidad, y ninguno es negativo
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_count_balances"
  CHECK ("counted_stock" IS NULL
         OR ("counted_stock" = "stock_before" + "quantity"
             AND "stock_before" >= 0 AND "counted_stock" >= 0));
