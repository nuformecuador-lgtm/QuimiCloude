// lib/modules/recetas/index.ts — CONTRATO PUBLICO del modulo `recetas`.
// Solo reexporta de ./domain. Debe poder importarse desde un componente de cliente
// sin arrastrar servidor: nada de 'use server', @prisma/client ni next/* en su cierre de
// imports.
export { ADMIN_ROLE_NAME, requireAdmin, type Actor } from './domain/actor';
export {
  RecetasError,
  UnauthorizedError,
  NotFoundError,
  DuplicateNameError,
  ValidationError,
} from './domain/errors';
export { type Page, type PageQuery, pageQuerySchema } from './domain/page';
export type { RecipeId } from './domain/recipe-catalog';
export { normalizeRecipeName } from './domain/recipe-name';
export {
  MAX_IMAGE_BYTES,
  validateRecipeImage,
  type RecipeImageFormat,
  type RecipeImageValidation,
} from './domain/recipe-image';
export {
  recipeLineSchema,
  createRecipeSchema,
  updateRecipeSchema,
  type RecipeLineInput,
  type CreateRecipeInput,
  type UpdateRecipeInput,
} from './domain/recipe-input';
export { type RecipeSummary, type RecipeLineView, type RecipeDetail } from './domain/recipe-view';

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
