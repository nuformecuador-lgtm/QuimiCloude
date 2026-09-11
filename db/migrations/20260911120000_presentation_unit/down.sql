-- DOWN de la migracion presentation_unit (QC-80, R8). Convencion propia del repo: Prisma
-- Migrate no genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica
-- `pnpm run db:rollback` (`scripts/db-rollback.ts`), que ejecuta este archivo y borra la fila
-- de `_prisma_migrations` en UNA SOLA TRANSACCION: cualquier `RAISE EXCEPTION` de aqui deshace
-- todo y la migracion sigue aplicada, entera, con su fila intacta.
--
-- Revierte EXACTAMENTE el `migration.sql`, en ORDEN INVERSO: primero `products` recupera su
-- `unit_id` ANULABLE con su FK y su indice (bloque 7 del UP), y despues `presentations` pierde
-- indice, FK y columna (bloques 6, 5 y 1). La RLS de las dos tablas se queda ACTIVADA Y
-- FORZADA, que es como estaba antes del UP: su parentesis `NO FORCE`/`FORCE` (bloques 2 y 4)
-- se abrio y se cerro dentro del UP y este archivo no escribe datos, asi que no necesita
-- abrirlo.
--
-- ESTE DOWN NO RESTAURA EL RELLENO, Y NO PUEDE: la columna `presentations.unit_id` desaparece,
-- asi que con ella se va el dato. No hay guardia que lo proteja --a diferencia del down de
-- QC-76-- y es deliberado: el relleno es reconstruible al centimo (el UP pone `kilogramo` en
-- TODAS las presentaciones, sin excepcion), asi que volver a aplicar la migracion deja la base
-- igual que estaba. Lo que SI se perderia sin poder reconstruirse es la unidad que alguien
-- hubiera elegido a mano DESPUES de aplicar el UP; quien revierta tiene que saberlo, y esta
-- escrito aqui para que lo sepa.
--
-- `products.unit_id` vuelve VACIA y eso es reversion completa, no una concesion: estaba vacia
-- en las 7 filas vivas cuando el UP la borro (comprobado contra la base el 2026-09-11), asi
-- que no hay ningun valor que restaurar. Vuelve ANULABLE, que es como era desde QC-32
-- (decision cerrada 7 de aquella ficha, R10): la unidad del producto era OPCIONAL.

-- ---------------------------------------------------------------------------------------
-- 1. `products` recupera columna, FK e indice (deshace el bloque 7 del UP, en orden inverso).
--
-- La columna primero, porque la FK y el indice la necesitan. ANULABLE y SIN `DEFAULT`, tal
-- como la dejo `20260903121404_units_catalog`. La FK se recrea con el MISMO nombre y las
-- MISMAS acciones referenciales que tenia --`ON DELETE RESTRICT ON UPDATE CASCADE`--: un
-- `down` que devuelve la columna pero no su integridad no devuelve el esquema anterior, sino
-- uno mas flojo.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "products" ADD COLUMN "unit_id" UUID;

ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "products_unit_id_idx" ON "products"("unit_id");

-- ---------------------------------------------------------------------------------------
-- 2. `presentations` pierde el indice y la FK (deshace el bloque 6 del UP, en orden inverso).
--
-- Se dropean EXPLICITAMENTE en vez de dejar que caigan con la columna del bloque 3, para que
-- este archivo diga exactamente que quita --mismo criterio que el down de QC-76--.
-- ---------------------------------------------------------------------------------------
DROP INDEX "presentations_unit_id_idx";
ALTER TABLE "presentations" DROP CONSTRAINT "presentations_unit_id_fkey";

-- ---------------------------------------------------------------------------------------
-- 3. Y al final la columna (deshace los bloques 5 y 1 del UP de una vez: el `SET NOT NULL` se
-- va con ella, no hace falta soltarlo antes).
--
-- AQUI SE PIERDE EL RELLENO, como dice la cabecera. No hay forma de conservarlo: el dato vive
-- en la columna que esta linea borra.
--
-- LIMITE CONOCIDO, el mismo que anotan los down de QC-32 y QC-76: la columna desaparece del
-- final de la tabla, que es donde `ADD COLUMN` la puso, asi que el orden ordinal de
-- `presentations` queda como estaba. No hay nada que reordenar.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "presentations" DROP COLUMN "unit_id";

-- ---------------------------------------------------------------------------------------
-- 4. La RLS se queda ACTIVADA Y FORZADA en las dos tablas (deshace --por no hacer nada-- los
-- bloques 2 y 4 del UP). Los cuatro ALTER van igualmente, explicitos e idempotentes: si
-- alguien revierte a mitad de un UP fallido, ninguna de las dos tablas puede quedarse sin
-- forzar. Siguen SIN NINGUNA POLICY, como empezaron.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "presentations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "presentations" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "units"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units"         FORCE  ROW LEVEL SECURITY;
