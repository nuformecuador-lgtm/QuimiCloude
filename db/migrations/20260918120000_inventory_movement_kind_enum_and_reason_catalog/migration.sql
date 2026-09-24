-- `kind` pasa de TEXT a enum. Los datos ya estan escritos en minuscula, asi que la conversion es
-- un USING directo y no reescribe ninguna fila.
-- El CHECK de coherencia depende de la columna, asi que se quita antes de convertir el tipo y se
-- vuelve a poner despues, en vez de confiar en que Postgres lo revalide solo.

-- CreateEnum
CREATE TYPE "InventoryMovementKind" AS ENUM ('opening', 'adjustment');

ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_matches_kind";

-- AlterTable
ALTER TABLE "inventory_movements"
  ALTER COLUMN "kind" TYPE "InventoryMovementKind" USING "kind"::"InventoryMovementKind";

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (("kind" = 'adjustment' AND "reason" IS NOT NULL) OR ("kind" = 'opening' AND "reason" IS NULL));

-- CHECK -- el motivo solo puede ser uno de los del catalogo; la base deja de aceptar cualquier texto.
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_in_catalog"
  CHECK ("reason" IS NULL OR "reason" IN ('merma', 'rotura', 'conteo_fisico', 'error_de_carga'));
