import { RecipeNotFoundError, RecipeVersionUnderReviewError } from './errors';

import type { RecipeRef } from '@/lib/modules/recetas';

export type OrderRecipeResolution = { readonly effectiveId: string } | 'not_found' | 'under_review';

/** Los ids que hay que pedir al catalogo, en una sola lectura. */
export function orderRecipeIds(recipeId: string, recipeVersionId: string | null): string[] {
  return recipeVersionId === null ? [recipeId] : [recipeId, recipeVersionId];
}

/**
 * Decide que receta guarda el pedido a partir de las referencias que devolvio el catalogo.
 * El catalogo ya acota a la empresa del actor, asi que un id de otra empresa llega como ausente.
 */
export function resolveOrderRecipe(
  refs: readonly RecipeRef[],
  recipeId: string,
  recipeVersionId: string | null,
): OrderRecipeResolution {
  const recipe = refs.find((ref) => ref.id === recipeId);
  if (recipe === undefined || recipe.isDeleted || recipe.original !== null) return 'not_found';

  if (recipeVersionId === null) return { effectiveId: recipeId };

  const version = refs.find((ref) => ref.id === recipeVersionId);
  if (version === undefined || version.isDeleted || version.original?.id !== recipeId) return 'not_found';
  if (version.isUnderReview) return 'under_review';

  return { effectiveId: recipeVersionId };
}

/** `resolveOrderRecipe` traducido a los errores del modulo. */
export function requireOrderRecipe(
  refs: readonly RecipeRef[],
  recipeId: string,
  recipeVersionId: string | null,
): string {
  const resolution = resolveOrderRecipe(refs, recipeId, recipeVersionId);
  if (resolution === 'not_found') throw new RecipeNotFoundError();
  if (resolution === 'under_review') throw new RecipeVersionUnderReviewError();
  return resolution.effectiveId;
}
