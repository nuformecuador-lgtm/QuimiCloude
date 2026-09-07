// lib/modules/recetas/index.ts — CONTRATO PUBLICO del modulo `recetas`.
// Solo reexporta de ./domain. Debe poder importarse desde un componente de cliente
// sin arrastrar servidor: nada de 'use server', @prisma/client ni next/* en su cierre de
// imports.
export { requireAdmin, type Actor } from './domain/actor';
export {
  RecetasError,
  UnauthorizedError,
  NotFoundError,
  DuplicateNameError,
  ValidationError,
} from './domain/errors';
export { type Page, type PageQuery, pageQuerySchema } from './domain/page';
// QC-57 (R27, R31): el contrato generico de consulta de lista, publicado igual que en
// `inventario`. `pageQuerySchema` se queda publicado, pero ya NO valida el listado: de eso
// se ocupa `createListQuerySchema()` dentro de `domain/list-recipes.ts`.
export {
  type ListFilterKind,
  type ListFilterValue,
  type ListQuery,
  type ListQueryable,
  type ListSort,
  type SanitizedListQuery,
  type SortDirection,
  createListQuerySchema,
  sanitizeListQuery,
} from './domain/list-query';
export { RECIPE_QUERYABLE } from './domain/recipe-queryable';
// `RecipeCatalog` y `RecipeRef` los anade QC-34 (T10, R43/R44); `RecipeId` es de QC-33 y no
// cambia. Son SOLO TIPOS: el barrel no gana nada de servidor por reexportarlos.
export type { RecipeId, RecipeRef, RecipeCatalog } from './domain/recipe-catalog';
export { normalizeRecipeName } from './domain/recipe-name';
export {
  MAX_IMAGE_BYTES,
  validateRecipeImage,
  type RecipeImageFormat,
  type RecipeImageValidation,
} from './domain/recipe-image';
// QC-62: `RECIPE_STEP_TYPES` y `RecipeStepType` SE RETIRARON del contrato (R9). El paso es un
// documento y su forma es la unica fuente. `MAX_STEP_ELEMENTS` y `countRecipeStepElements` se
// publican aqui para que el tope viva en UNA sola constante (R11) y nadie lo reescriba a mano.
export {
  recipeStepSchema,
  recipeStepBlockSchema,
  recipeStepSpanSchema,
  recipeStepChecklistItemSchema,
  MAX_STEP_ELEMENTS,
  countRecipeStepElements,
  type RecipeStepInput,
  type RecipeStepDocument,
  type RecipeStepBlock,
  type RecipeStepSpan,
  type RecipeStepChecklistItem,
  recipeLineSchema,
  createRecipeSchema,
  updateRecipeSchema,
  type RecipeLineInput,
  type CreateRecipeInput,
  type UpdateRecipeInput,
} from './domain/recipe-input';
export {
  type RecipeSummary,
  type RecipeLineView,
  type RecipeStepView,
  type RecipeDetail,
} from './domain/recipe-view';

// Las cinco factories de caso de uso (`design.md > 3`).
export { createCreateRecipe, type CreateRecipeDeps } from './domain/create-recipe';
export { createGetRecipe, type GetRecipeDeps } from './domain/get-recipe';
export { createListRecipes, type ListRecipesDeps } from './domain/list-recipes';
export {
  createUpdateRecipe,
  type UpdateRecipeDeps,
  type UpdateRecipeResult,
  type StorageWarning,
} from './domain/update-recipe';
export { createDeleteRecipe, type DeleteRecipeDeps } from './domain/delete-recipe';
