import { requirePermission, type Actor } from './actor';
import { RecipeNotFoundError } from './errors';
import type { RecipeScope } from './recipe-scope';
import { isVersionUnderReview, recipeDisplayName } from './recipe-version';
import type { RecipeVersionSummary } from './recipe-view';

import type { RecipeRepository } from '../ports/recipe-repository';

export type ListRecipeVersionsDeps = {
  readonly recipes: RecipeRepository;
};

export function createListRecipeVersions(
  deps: ListRecipeVersionsDeps,
): (originalId: string, actor: Actor | null | undefined) => Promise<readonly RecipeVersionSummary[]> {
  return async function listRecipeVersions(
    originalId: string,
    actor: Actor | null | undefined,
  ): Promise<readonly RecipeVersionSummary[]> {
    requirePermission(actor, 'recetas.consultar');
    const scope: RecipeScope = { companyId: actor.companyId };

    const original = await deps.recipes.findAliveById(originalId, scope);
    if (original === null || original.original !== null) throw new RecipeNotFoundError();

    const rows = await deps.recipes.listAliveVersions(originalId, scope);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      displayName: recipeDisplayName(row.name, original.name),
      isUnderReview: isVersionUnderReview(
        true,
        row.lines.map((line) => line.percentage),
      ),
      updatedAt: row.updatedAt,
    }));
  };
}
