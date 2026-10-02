import { requirePermission, type Actor } from './actor';
import {
  ActionNotAllowedError,
  RecipeDuplicateNameError,
  RecipeNotFoundError,
  ValidationError,
} from './errors';
import { updateRecipeVersionSchema } from './recipe-input';
import type { RecipeScope } from './recipe-scope';

import type { RecipeRepository } from '../ports/recipe-repository';

import { PRODUCT_TYPES, type ProductCatalog } from '@/lib/modules/inventario';

export type UpdateRecipeVersionDeps = {
  readonly recipes: RecipeRepository;
  readonly products: ProductCatalog;
  readonly now?: () => Date;
};

export function createUpdateRecipeVersion(
  deps: UpdateRecipeVersionDeps,
): (versionId: string, input: unknown, actor: Actor | null | undefined) => Promise<{ id: string }> {
  const now = deps.now ?? (() => new Date());

  return async function updateRecipeVersion(
    versionId: string,
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ id: string }> {
    requirePermission(actor, 'recetas.modificar');
    const scope: RecipeScope = { companyId: actor.companyId };

    const parsed = updateRecipeVersionSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;

    const existing = await deps.recipes.findAliveById(versionId, scope);
    if (existing === null) throw new RecipeNotFoundError();
    if (existing.original === null) throw new ActionNotAllowedError();

    // Como en la edicion de una original: solo se valida contra el catalogo el producto que la
    // version no tenia ya, para no rechazarla por un insumo dado de baja despues.
    const alreadyInVersion = new Set(existing.lines.map((line) => line.productId));
    const newProductIds = data.lines
      .map((line) => line.productId)
      .filter((productId) => !alreadyInVersion.has(productId));
    if (newProductIds.length > 0) {
      const refs = await deps.products.findRefs(newProductIds, actor.companyId);
      const foundIds = new Set(refs.map((ref) => ref.id));
      if (newProductIds.some((id) => !foundIds.has(id))) throw new ValidationError();
      if (refs.some((ref) => ref.type === PRODUCT_TYPES.FINISHED_PRODUCT)) {
        throw new ActionNotAllowedError();
      }
    }

    const result = await deps.recipes.replaceAlive(
      versionId,
      { name: data.name, description: null, steps: [], lines: data.lines, imagePath: null },
      actor.id,
      now(),
      scope,
    );
    if (result === 'not_found') throw new RecipeNotFoundError();
    if (result === 'duplicate') throw new RecipeDuplicateNameError();
    return { id: versionId };
  };
}
