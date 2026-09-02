-- QC-20: crud-de-productos.
--
-- COMPLETADO A MANO: las dos claves foraneas de auditoria (`products_created_by_fkey`,
-- `products_updated_by_fkey`) y el backfill de `presentations.name_normalized` no salen
-- de `db/schema.prisma` porque Prisma no los modela (`created_by`/`updated_by` son campos
-- ESCALARES en el esquema, sin `@relation`; ver `specs/QC-20-crud-de-productos/design.md`
-- seccion 2.1). Las dos FK son por tanto DRIFT para Prisma: toda migracion futura de
-- `products` hay que revisarla a mano para que no las borre, exactamente igual que los
-- CHECK y el RLS que dejo QC-14.

-- ---------------------------------------------------------------------------------------
-- Auditoria en products (design.md > 2.1). Columnas anulables a proposito: `products` ya
-- tenia filas cuando se anaden estas columnas y no existe un «usuario del sistema» al que
-- apuntar en el backfill. La garantia de que todo alta y toda edicion registran al actor
-- (R6) es del service, no de la base (design.md > 11.2).
-- ---------------------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "products" ADD COLUMN "created_by" UUID;
ALTER TABLE "products" ADD COLUMN "updated_by" UUID;

-- AddForeignKey — escritas a mano, en ingles (R30). ON DELETE SET NULL, no RESTRICT ni
-- CASCADE: las columnas son anulables justo para este caso, y el producto NO se debe
-- perder si se borra el usuario que lo creo o lo edito por ultima vez (R7 exige una
-- referencia real mientras el usuario existe; nada exige que deba seguir existiendo para
-- siempre). Con RESTRICT, borrar cualquier usuario que alguna vez toco un producto
-- quedaria bloqueado para siempre, que es una garantia mas fuerte que la que pide esta
-- ficha. ON UPDATE CASCADE porque el id del usuario es su clave real y no cambia por
-- negocio, pero si cambiara, la referencia debe seguir el nuevo valor (mismo criterio que
-- las FK de `users` en `identity`).
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------
-- Unicidad normalizada en presentations (design.md > 2.2, D12, D13 -> R17, R18, R19, R20).
-- La columna nace NOT NULL, asi que hay que rellenar las filas existentes antes de fijar
-- la restriccion. El backfill replica en SQL los mismos cuatro pasos que hace la funcion
-- pura de TypeScript (`domain/presentation-name.ts`): trim, minusculas, sin diacriticos,
-- sin caracteres no alfanumericos.
--
-- Aviso 1: `translate` con una lista fija cubre MENOS que `\p{Diacritic}` de JavaScript
-- (por ejemplo, no toca alfabetos no latinos). Es una asimetria aceptada y ACOTADA AL
-- BACKFILL: a partir de esta migracion, toda escritura pasa por el service, que usa la
-- funcion de TypeScript. Se acepta porque `presentations` no tenia todavia ninguna fila
-- creada por la aplicacion cuando se escribio esta migracion.
-- Aviso 2: si en alguna base hubiera nombres duplicados previos, el `CREATE UNIQUE INDEX`
-- de abajo FALLA y la migracion no se aplica. Es el comportamiento correcto: mejor parar
-- que decidir en silencio cual de los duplicados sobrevive.
-- ---------------------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "presentations" ADD COLUMN "name_normalized" TEXT;

-- Backfill
UPDATE "presentations"
SET "name_normalized" = regexp_replace(
  translate(lower(btrim("name")),
            'áàäâãéèëêíìïîóòöôõúùüûñç',
            'aaaaaeeeeiiiiooooouuuunc'),
  '[^a-z0-9]', '', 'g');

ALTER TABLE "presentations" ALTER COLUMN "name_normalized" SET NOT NULL;

-- CreateIndex — la garantia real de R18/R20: dos altas simultaneas que superan la
-- comprobacion previa del dominio acaban con una sola fila creada y la otra rechazada.
CREATE UNIQUE INDEX "presentations_name_normalized_key" ON "presentations"("name_normalized");
