-- `orders` gana una columna opcional para el coste de los ingredientes. Nace ANULABLE y sin
-- rellenar: los pedidos existentes se quedan sin importe, no en cero.
ALTER TABLE "orders" ADD COLUMN "ingredients_cost" DECIMAL(14,4);
