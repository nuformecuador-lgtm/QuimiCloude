-- DOWN de la migracion product_batch_lot_and_purchase_date (QC-81). Convencion propia del repo:
-- Prisma Migrate no genera down migrations (`docs/architecture.md > Migraciones up/down`). Lo
-- aplica `pnpm run db:rollback` (`scripts/db-rollback.ts`), que ejecuta este archivo y borra la
-- fila de `_prisma_migrations` en UNA SOLA TRANSACCION: cualquier error de aqui deshace todo y la
-- migracion sigue aplicada, entera, con su fila intacta.
--
-- Revierte EXACTAMENTE lo que ANADIO el `migration.sql`, en ORDEN INVERSO (R17): sin el indice
-- unico `product_batches_company_lot_unique`, sin los dos CHECK `product_batches_lot_length` y
-- `product_batches_lot_not_blank`, con `lot` ANULABLE otra vez, sin la columna `purchase_date` y
-- con la RLS activada y forzada, como estaba.
--
-- LO QUE ESTE DOWN NO HACE, Y POR QUE (R23): NO VACIA NINGUN `lot`. Ni los que escribio el relleno
-- del UP ni los que escribio una persona: NO SE PUEDEN DISTINGUIR --no hay columna que diga quien
-- puso cada valor--, asi que borrarlos «para dejarlo como estaba» tiraria dato ajeno. Revertir deja
-- la columna anulable CON todos sus valores puestos. Volver a aplicar el UP despues es entonces un
-- relleno de lote de CERO filas. Este archivo no tiene un solo `UPDATE` ni un solo `DELETE`.
--
-- LO QUE ESTE DOWN SI PIERDE, DICHO EN VOZ ALTA: `purchase_date` se va CON SU COLUMNA, y con ella
-- TODAS las fechas de compra, tambien las que alguien escribio de verdad despues de migrar. Es
-- exactamente «lo que el UP anadio» y no hay forma de revertir sin quitarla. Si despues se vuelve a
-- aplicar el UP, esas filas NO recuperan su fecha real: reciben la fecha civil de su `created_at`,
-- como cualquier fila vieja. Quien necesite conservarlas tiene que copiarlas aparte ANTES de
-- revertir.
--
-- LIMITE CONOCIDO, el mismo que anotan los down de QC-32, QC-76 y QC-49: `purchase_date` desaparece
-- del final de la tabla, que es donde `ADD COLUMN` la puso, asi que el orden ordinal de las
-- columnas queda como estaba.

-- ---------------------------------------------------------------------------------------
-- 0. PARENTESIS `NO FORCE`, simetrico con el del UP (design.md > 2.4).
--
-- Ninguna sentencia de este archivo LEE ni ESCRIBE filas: todo es DDL (`DROP INDEX`,
-- `DROP CONSTRAINT`, `DROP NOT NULL`, `DROP COLUMN`), que no pasa por la RLS. El parentesis se
-- escribe igual, por el mismo criterio que QC-49 tuvo que corregir en revision (su `down.sql:26-63`):
-- las dos mitades de una migracion abren y cierran lo mismo, y si alguien anade aqui una lectura
-- --una guardia-- no se encuentra con la mina puesta. Todo dentro de la unica transaccion de
-- `pnpm run db:rollback`: ninguna otra sesion ve la tabla sin forzar, y si algo falla el `ALTER` se
-- deshace con ella.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------
-- 1. El indice unico y los dos CHECK (paso 6 del UP, al reves). Se quitan EXPLICITAMENTE, antes de
-- tocar las columnas, para que este archivo diga exactamente que quita.
-- ---------------------------------------------------------------------------------------
DROP INDEX "product_batches_company_lot_unique";

ALTER TABLE "product_batches" DROP CONSTRAINT "product_batches_lot_length";
ALTER TABLE "product_batches" DROP CONSTRAINT "product_batches_lot_not_blank";

-- ---------------------------------------------------------------------------------------
-- 2. Las columnas (pasos 5 y 2 del UP, al reves).
--
-- `lot` vuelve a ANULABLE y CONSERVA SUS VALORES (R23, ver cabecera). `purchase_date` se va entera:
-- su `SET NOT NULL` no necesita revertirse por separado, cae con la columna.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "product_batches" ALTER COLUMN "lot" DROP NOT NULL;

ALTER TABLE "product_batches" DROP COLUMN "purchase_date";

-- ---------------------------------------------------------------------------------------
-- 3. Se CIERRA el parentesis del paso 0: la RLS vuelve ACTIVADA Y FORZADA, que es como estaba antes
-- del UP. Idempotente y explicito.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "product_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY;
