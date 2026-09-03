import { requireAdmin, type Actor } from './actor';
import { ValidationError } from './errors';
import { pageQuerySchema, type Page } from './page';
import type { RecipeSummary } from './recipe-view';

import type { RecipeImageStorage } from '../ports/recipe-image-storage';
import type { RecipeRepository, RecipeRow } from '../ports/recipe-repository';

/**
 * Listado paginado de recetas (D12, D13, D14, R29-R34; `design.md > 11`). `domain/` NO
 * puede importar `lib/shared/**` (R40), asi que la aritmetica de paginacion -que R31
 * prohibe reimplementar aqui- llega INYECTADA desde quien cablea el modulo (el punto de
 * composicion, que si puede importar el util real de `lib/shared/pagination`). Este
 * archivo no calcula ningun `offset`, ningun `limit` ni ningun `totalPages` por su cuenta:
 * los dos unicos calculos posibles son los que hacen `toOffsetLimit`/`buildPage`
 * inyectados, y a los tests les basta pasar los mismos que usa el resto del repo.
 */
export type ListRecipesDeps = {
  readonly recipes: RecipeRepository;
  readonly images: RecipeImageStorage;
  readonly toOffsetLimit: (page: number, pageSize?: number) => { offset: number; limit: number };
  readonly buildPage: <T>(
    items: readonly T[],
    total: number,
    page: number,
    pageSize: number,
  ) => Page<T>;
};

/** D14, R33: la lista NO trae lineas -`RecipeSummary` no tiene ese campo-. */
function toSummary(row: RecipeRow, images: RecipeImageStorage): RecipeSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.imagePath !== null ? images.publicUrl(row.imagePath) : null,
    stepCount: row.steps.length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export function createListRecipes(
  deps: ListRecipesDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<Page<RecipeSummary>> {
  return async function listRecipes(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<Page<RecipeSummary>> {
    requireAdmin(actor);

    const parsed = pageQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { page, pageSize } = parsed.data;

    const { offset, limit } = deps.toOffsetLimit(page, pageSize);
    const { rows, total } = await deps.recipes.listAlive(offset, limit);

    return deps.buildPage(
      rows.map((row) => toSummary(row, deps.images)),
      total,
      page,
      limit,
    );
  };
}
