import type { DataTableParams } from '@/components/shared/data-table';
import { listRecipesAction } from '@/lib/modules/recetas/adapters/driving/recipe-actions';

import {
  FIRST_PAGE,
  clearSearchAndFilters,
  hasActiveSearchOrFilter,
  recipeListHref,
} from './recipe-list-params';
import { RecipeTable } from './recipe-table';

type RecipeListSectionProps = {
  readonly params: DataTableParams;
};

export async function RecipeListSection({ params }: RecipeListSectionProps) {
  const result = await listRecipesAction(params);

  if (result.status === 'error') {
    return (
      <RecipeTable status="error" error={result} recipes={[]} params={params} totalPages={0} />
    );
  }

  const { items, page: currentPage, totalPages } = result.data;
  const firstPageHref =
    currentPage > FIRST_PAGE ? recipeListHref({ ...params, page: FIRST_PAGE }) : undefined;

  if (items.length === 0 && !hasActiveSearchOrFilter(params)) {
    return (
      <RecipeTable
        recipes={items}
        params={{ ...params, page: currentPage }}
        totalPages={totalPages}
        empty={{ firstPageHref }}
      />
    );
  }

  // Mismo árbol con filas o sin resultados: si cambiara, React remontaría la tabla y el campo de
  // búsqueda perdería el foco y el texto a medio escribir.
  return (
    <div className="flex flex-col gap-4" data-testid="recipe-list">
      <RecipeTable
        recipes={items}
        params={{ ...params, page: currentPage }}
        totalPages={totalPages}
        noResults={
          items.length === 0
            ? { clearHref: recipeListHref(clearSearchAndFilters(params)), firstPageHref }
            : undefined
        }
      />
    </div>
  );
}
