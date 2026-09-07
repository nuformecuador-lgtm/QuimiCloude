-- DOWN de orders_drop_unit_and_unit_price. Convencion propia del repo: Prisma Migrate no genera
-- down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica `pnpm run db:rollback`
-- (`scripts/db-rollback.ts`), que ejecuta este archivo entero dentro de UNA SOLA transaccion.
--
-- DEVUELVE LA FORMA, NO LOS DATOS. El `migration.sql` borro dos columnas; su contenido no esta
-- en ningun sitio y este script no lo puede inventar. Lo que se recupera es el ESQUEMA exacto
-- anterior: las dos columnas NOT NULL, la FK hacia `units`, el CHECK del precio no negativo y
-- los dos indices (el de la FK y el parcial de QC-57).
--
-- QUE PASA CON LAS FILAS QUE YA EXISTEN:
--   - `unit_price` vuelve con **0** en todas ellas. Es el unico valor que el CHECK
--     `>= 0` admite sin inventar un importe, y QC-33 R9 ya declara el cero valido -un pedido
--     puede registrar una entrega sin cargo-. NO es el precio original: ese se perdio.
--   - `unit_id` es una FK NOT NULL hacia `units` y NO hay ningun valor honesto que poner. Si la
--     tabla tiene pedidos, el rollback ABORTA y no toca nada: rellenar la unidad con cualquier
--     fila de `units` seria inventar un hecho de negocio dentro de un script de rollback, que es
--     justo lo que el `down.sql` de QC-34 se nego a hacer con los pedidos cancelados. Quien
--     necesite revertir con datos tiene que decidir a mano que unidad lleva cada pedido.
--   - Con la tabla vacia -o solo con filas borradas logicamente, que tambien cuentan aqui: la
--     columna es NOT NULL para todas- el rollback pasa sin ruido.

-- 0. GUARDIA DE DATOS. Sin unidad que poner, no se revierte.
DO $$
DECLARE pedidos bigint;
BEGIN
  SELECT count(*) INTO pedidos FROM "orders";
  IF pedidos > 0 THEN
    RAISE EXCEPTION 'ROLLBACK ABORTADO: hay % pedido(s) y "unit_id" es una FK NOT NULL hacia '
      '"units" cuyo valor original se perdio al dropear la columna. Decide a mano que unidad '
      'lleva cada pedido (o vacia la tabla) y vuelve a intentarlo.', pedidos;
  END IF;
END $$;

-- 1. Las dos columnas, con la MISMA forma que les dio QC-33.
ALTER TABLE "orders" ADD COLUMN "unit_id" UUID NOT NULL;
ALTER TABLE "orders" ADD COLUMN "unit_price" DECIMAL(14,4) NOT NULL DEFAULT 0;

-- El DEFAULT era un andamio para poder anadir la columna NOT NULL; QC-33 no lo tenia.
ALTER TABLE "orders" ALTER COLUMN "unit_price" DROP DEFAULT;

-- 2. El CHECK del precio no negativo (QC-33 R9). El cero cabe a proposito.
ALTER TABLE "orders" ADD CONSTRAINT "orders_unit_price_non_negative" CHECK ("unit_price" >= 0);

-- 3. El indice de la FK (QC-33) y el parcial de orden/filtro (QC-57), cada uno con su forma.
CREATE INDEX "orders_unit_id_idx" ON "orders"("unit_id");
CREATE INDEX "orders_unit_price_idx" ON "orders" ("unit_price") WHERE "deleted_at" IS NULL;

-- 4. La FK hacia `units`, escrita A MANO igual que en QC-33 (decision cerrada 17): Prisma no la
--    regenera nunca porque `unit_id` esta declarado como escalar sin `@relation`.
ALTER TABLE "orders" ADD CONSTRAINT "orders_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
