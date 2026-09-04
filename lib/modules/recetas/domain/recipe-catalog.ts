// lib/modules/recetas/domain/recipe-catalog.ts
/** Identificador de una receta visto DESDE FUERA de `recetas`. Es lo unico que otro modulo
 *  guarda de una receta (p. ej. `orders.recipe_id`). Anadido por QC-33; el modelo de QC-24 NO
 *  se toca (R5). */
export type RecipeId = string;
