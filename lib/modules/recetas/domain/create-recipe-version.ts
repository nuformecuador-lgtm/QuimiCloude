import { requirePermission, type Actor } from './actor';
import {
  ActionNotAllowedError,
  RecipeDuplicateNameError,
  RecipeNotFoundError,
  ValidationError,
} from './errors';
import { createRecipeVersionSchema, recipeLinesSchema } from './recipe-input';
import type { RecipeScope } from './recipe-scope';
import { assertToolsValid } from './recipe-tools';

import type { RecipeRepository } from '../ports/recipe-repository';

import { isIngredientType, PRODUCT_TYPES, type ProductCatalog } from '@/lib/modules/inventario';

export type CreateRecipeVersionDeps = {
  readonly recipes: RecipeRepository;
  readonly products: ProductCatalog;
  readonly now?: () => Date;
};

export function createCreateRecipeVersion(
  deps: CreateRecipeVersionDeps,
): (originalId: string, input: unknown, actor: Actor | null | undefined) => Promise<{ id: string }> {
  const now = deps.now ?? (() => new Date());

  return async function createRecipeVersion(
    originalId: string,
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ id: string }> {
    requirePermission(actor, 'recetas.modificar');
    const scope: RecipeScope = { companyId: actor.companyId };

    const parsed = createRecipeVersionSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;

    const original = await deps.recipes.findAliveById(originalId, scope);
    if (original === null) throw new RecipeNotFoundError();
    if (original.original !== null) throw new ActionNotAllowedError();

    // Las lineas copiadas pasan por la misma validacion que las indicadas: la original puede no
    // sumar 100 o apuntar a un producto ya dado de baja.
    const candidate =
      data.lines ??
      original.lines.map((line) => ({ productId: line.productId, percentage: line.percentage }));
    const lines = recipeLinesSchema.safeParse(candidate);
    if (!lines.success) throw new ValidationError();

    const productIds = lines.data.map((line) => line.productId);
    const refs = await deps.products.findRefs(productIds, actor.companyId);
    const foundIds = new Set(refs.map((ref) => ref.id));
    if (productIds.some((id) => !foundIds.has(id))) throw new ValidationError();
    if (refs.some((ref) => ref.type === PRODUCT_TYPES.FINISHED_PRODUCT)) {
      throw new ActionNotAllowedError();
    }
    // Un envase que la original ya tenia como ingrediente se conserva al versionarla.
    const inOriginal = new Set(original.lines.map((line) => line.productId));
    if (refs.some((ref) => !inOriginal.has(ref.id) && !isIngredientType(ref.type))) {
      throw new ActionNotAllowedError();
    }

    // Las herramientas copiadas no se revalidan: una de baja se conserva, a diferencia de las lineas.
    const originalTools = original.tools.map((tool) => ({ productId: tool.productId, quantity: tool.quantity }));
    if (data.tools !== undefined) {
      await assertToolsValid(data.tools, originalTools, deps.products, actor.companyId);
    }

    const result = await deps.recipes.createVersion(
      originalId,
      { name: data.name, lines: lines.data, tools: data.tools ?? originalTools },
      actor.id,
      now(),
      scope,
    );
    if (result === 'not_found') throw new RecipeNotFoundError();
    if (result === 'duplicate') throw new RecipeDuplicateNameError();
    return result;
  };
}
