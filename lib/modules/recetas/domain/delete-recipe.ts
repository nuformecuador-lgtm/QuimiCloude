import { requirePermission, type Actor } from './actor';
import { NotFoundError } from './errors';

import type { RecipeRepository } from '../ports/recipe-repository';

export type DeleteRecipeDeps = {
  readonly recipes: RecipeRepository;
  /** Ver el comentario identico en `create-recipe.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Borrado de receta (R6, R27, R35, R37). Exige `recetas.modificar`: el borrado entra
 * dentro de modificar (QC-74 R3, R16). Logico y sin restaurar (D2): usa
 * `softDeleteAlive`, nunca un borrado fisico. NO llama al almacenamiento -el archivo
 * sobrevive (R27, D3)-.
 */
export function createDeleteRecipe(
  deps: DeleteRecipeDeps,
): (id: string, actor: Actor | null | undefined) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function deleteRecipe(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'recetas.modificar');

    const result = await deps.recipes.softDeleteAlive(id, actor.id, now());
    if (result === 'not_found') throw new NotFoundError();
  };
}
