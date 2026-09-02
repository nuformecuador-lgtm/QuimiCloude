-- QC-24: modelo-recetas.
--
-- Las dos CREATE TABLE, la FK receta->linea, el indice unico compuesto y los tres indices
-- simples los produce Prisma a partir de `db/schema.prisma`.
--
-- COMPLETADO A MANO (ver `specs/QC-24-modelo-recetas/design.md` seccion 4):
--   1. La extension pgcrypto.
--   2. LAS TRES FK QUE CRUZAN DE MODULO: `recipe_lines_product_id_fkey` hacia `products` y
--      `recipes_created_by_fkey` / `recipes_updated_by_fkey` hacia `users`. Prisma NO las
--      regenera nunca, porque `product_id`, `created_by` y `updated_by` estan declarados en
--      el esquema como campos ESCALARES SIN `@relation` a proposito (decision cerrada 3,
--      R19): asi la base garantiza la integridad y el cliente Prisma no puede atravesar de
--      `recetas` a `inventario` ni a `identity` con un `include`. Si estas tres lineas se
--      pierden, el esquema sigue validando y el cliente sigue compilando: no se entera nadie.
--   3. El indice unico PARCIAL `recipes_name_unique` (Prisma no modela indices parciales).
--   4. El CHECK `recipe_lines_quantity_positive` (Prisma no modela CHECK).
--   5. Los cuatro ALTER de RLS.
--
-- Toda migracion futura sobre `recipes` o `recipe_lines` hay que revisarla A MANO para que
-- el drift de `prisma migrate dev` no borre ninguna de esas cinco cosas.

-- Extension: `gen_random_uuid()` para los PK uuid. Ya la crearon las migraciones de QC-4 y
-- QC-14; aqui se vuelve a declarar con IF NOT EXISTS para que esta migracion sea
-- autocontenida. El `down.sql` no la elimina (puede haberla creado otro).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "description" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "image_path" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipe_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recipe_lines_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey — receta -> linea. Intra-modulo, asi que SI lleva `@relation` en el esquema
-- y la genera Prisma. El CASCADE es la red del borrado FISICO (una purga, el `down.sql`):
-- no se dispara nunca en operacion normal, porque el borrado de una receta es LOGICO y
-- ninguna FK reacciona a un UPDATE (`design.md` seccion 4.2, R25, R26).
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (A MANO) — linea -> producto. Cruza a `inventario`: campo escalar en Prisma,
-- FK real aqui (R19, R16). RESTRICT porque el borrado de producto es LOGICO (QC-20 D5): en
-- operacion normal no se dispara, existe para que un borrado fisico por consola no deje
-- lineas apuntando al vacio. Es lo que hace verdadera la decision 13 (R27).
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (A MANO) — auditoria: receta -> usuario. Cruza a `identity`: campo escalar en
-- Prisma, FK real aqui (R19, R21). Las columnas son ANULABLES (decision cerrada 22, R33) y eso
-- no afloja nada: en SQL una FK solo se verifica cuando la columna tiene valor, asi que una
-- receta sin autor pasa y una receta con un autor inventado se rechaza con 23503.
-- NUNCA `ON DELETE SET NULL`, aunque la columna lo permitiria: convertiria «al usuario lo
-- borraron» en «no la creo una persona», que son cosas distintas y la decision 22 las separa
-- a proposito. RESTRICT mantiene esa distincion intacta (`design.md` seccion 4.1).
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recipes" ADD CONSTRAINT "recipes_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex — un producto no puede aparecer dos veces en la misma receta (R11). Sirve
-- ademas de indice para «lineas de esta receta» por el prefijo izquierdo, por eso no hay un
-- `recipe_lines_recipe_id_idx` aparte: seria redundante.
CREATE UNIQUE INDEX "recipe_lines_recipe_id_product_id_key" ON "recipe_lines"("recipe_id", "product_id");

-- CreateIndex — Postgres no indexa automaticamente el lado hijo de una FK, y por ahi pasan
-- tanto la verificacion del RESTRICT como «en que recetas se usa este producto».
CREATE INDEX "recipe_lines_product_id_idx" ON "recipe_lines"("product_id");

-- CreateIndex — mismo motivo, lado hijo de las dos FK de auditoria.
CREATE INDEX "recipes_created_by_idx" ON "recipes"("created_by");

-- CreateIndex
CREATE INDEX "recipes_updated_by_idx" ON "recipes"("updated_by");

-- CreateIndex (A MANO) — unicidad del nombre normalizado (decision cerrada 7, R7). PARCIAL:
-- una receta borrada logicamente libera su nombre (R9, decision cerrada 20). Prisma no modela
-- indices parciales, asi que este indice vive SOLO aqui: si alguien anade `@unique` en el
-- esquema, la unicidad pasa a alcanzar tambien a las recetas borradas y R9 deja de cumplirse
-- en silencio. La columna la normaliza `normalizeRecipeName` (`design.md` seccion 3).
CREATE UNIQUE INDEX "recipes_name_unique" ON "recipes"("name_normalized") WHERE "deleted_at" IS NULL;

-- CHECK (A MANO) — la cantidad de una linea es siempre positiva (decision cerrada 8, R14).
-- `> 0`, no `>= 0`: ni negativa ni cero. La columna es NOT NULL, asi que la ausencia la
-- rechaza el NOT NULL (23502) y el cero la rechaza este CHECK (23514).
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_quantity_positive" CHECK ("quantity" > 0);

-- RLS (A MANO) activado Y forzado en las dos tablas (R29). Sin `FORCE`, el dueno de las
-- tablas —que es con quien se conecta Prisma— la ignora entera. Se activa sin policies:
-- deny-by-default para cualquier via que no sea Prisma. Es defensa en profundidad, no la
-- frontera de autorizacion (`docs/architecture.md > Acceso a datos y autorizacion`), que
-- vive en el service y la fija QC-25.
ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "recipe_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipe_lines" FORCE ROW LEVEL SECURITY;
