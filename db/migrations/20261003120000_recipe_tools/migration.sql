-- Herramientas de una receta: maquinas del catalogo con una cantidad entera. Tabla aparte de
-- `recipe_lines` para que nada de lo que lee las lineas (reserva, consumo, costo, suma de
-- porcentajes) vea una herramienta.
--
-- La tabla, la FK a la receta, el unico compuesto y el indice de producto los genera Prisma.
-- A mano: la FK a `products` (cruza de modulo y no lleva `@relation`), el CHECK de cantidad y
-- la RLS. Prisma no las regenera: si un drift las quita, nada falla.

-- CreateTable
CREATE TABLE "recipe_tools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipe_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recipe_tools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipe_tools_product_id_idx" ON "recipe_tools"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_tools_recipe_id_product_id_key" ON "recipe_tools"("recipe_id", "product_id");

-- AddForeignKey
ALTER TABLE "recipe_tools" ADD CONSTRAINT "recipe_tools_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A mano. RESTRICT porque la baja de producto es logica: solo actua ante un borrado fisico, que
-- no puede dejar herramientas apuntando al vacio.
ALTER TABLE "recipe_tools" ADD CONSTRAINT "recipe_tools_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A mano: Prisma no modela CHECK.
ALTER TABLE "recipe_tools" ADD CONSTRAINT "recipe_tools_quantity_positive" CHECK ("quantity" > 0);

-- Sin policies: Prisma se conecta como dueno y solo FORCE hace que la RLS le aplique.
ALTER TABLE "recipe_tools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipe_tools" FORCE ROW LEVEL SECURITY;
