'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useTransition, type MouseEvent } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableTexts,
} from '@/components/shared/data-table';
import { buttonVariants } from '@/components/ui/button';
import type { RecipeSummary } from '@/lib/modules/recetas';
import { recipeEditRoute } from '@/lib/shared/routes';
import { cn } from '@/lib/utils';

import { DeleteRecipeDialog } from './delete-recipe-dialog';
import { RECIPE_DEFAULT_PINNED_COLUMNS, buildRecipeColumns } from './recipe-columns';
import { recipeListHref } from './recipe-list-params';

const TOUCH_TARGET = 'min-h-11 min-w-11';

export const RECIPE_TABLE_ID = 'recetas';

export const RECIPE_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay recetas que mostrar.',
  loading: 'Cargando recetas…',
  error: 'No se pudo cargar el catálogo de recetas.',
  search: 'Buscar receta',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Recetas por página',
  sortAscending: 'Orden ascendente',
  sortDescending: 'Orden descendente',
  pinColumn: 'Fijar columna',
  unpinColumn: 'Soltar columna',
  filterColumn: 'Filtrar columna',
  clearFilter: 'Limpiar filtro',
  lastWeek: 'Última semana',
  lastMonth: 'Último mes',
  lastYear: 'Último año',
};

export const RECIPE_NO_RESULTS_TEXT = 'Ninguna receta coincide con la búsqueda o los filtros.';

const CLEAR_SEARCH_LABEL = 'Limpiar búsqueda y filtros';
const FIRST_PAGE_LABEL = 'Volver a la primera página';

type NoResultsSlot = {
  readonly clearHref: string;
  readonly firstPageHref?: string;
};

export type RecipeTableProps = {
  readonly recipes: readonly RecipeSummary[];
  readonly params: DataTableParams;
  readonly totalPages: number;
  /** Solo con cero filas y búsqueda o filtro activos. */
  readonly noResults?: NoResultsSlot;
};

// Con modificadores se deja al navegador abrir otra pestaña; si no, la navegación va por la
// transición para que la tabla siga montada.
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
  );
}

export function RecipeTable({ recipes, params, totalPages, noResults }: RecipeTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Identidad estable: si cambiara en cada render, la tabla reconstruiría todas sus columnas.
  const columns = useMemo(
    () =>
      buildRecipeColumns({
        rowActions: (recipe) => (
          <>
            <Link
              href={recipeEditRoute(recipe.id)}
              className={cn(
                TOUCH_TARGET,
                'inline-flex items-center justify-center rounded-lg px-2 text-sm hover:bg-muted',
              )}
              aria-label={`Editar ${recipe.name}`}
              data-testid="recipe-edit-open"
            >
              Editar
            </Link>
            <DeleteRecipeDialog recipe={recipe} />
          </>
        ),
      }),
    [],
  );

  // Una transición y no `status="loading"`: ese estado desmonta la barra y el campo de búsqueda
  // perdería el foco mientras se escribe.
  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  const navigateOnPlainClick = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    navigate(href);
  };

  const emptyAction =
    noResults === undefined ? undefined : (
      <div
        data-testid="recipe-list-no-results"
        className="flex flex-col items-center gap-2 sm:flex-row"
      >
        <Link
          href={noResults.clearHref}
          data-slot="button"
          data-testid="recipe-list-clear-search"
          className={cn(buttonVariants({ variant: 'default' }), TOUCH_TARGET)}
          onClick={navigateOnPlainClick(noResults.clearHref)}
        >
          {CLEAR_SEARCH_LABEL}
        </Link>
        {noResults.firstPageHref === undefined ? null : (
          <Link
            href={noResults.firstPageHref}
            data-slot="button"
            data-testid="recipe-list-no-results-first-page"
            className={cn(buttonVariants({ variant: 'outline' }), TOUCH_TARGET)}
            onClick={navigateOnPlainClick(noResults.firstPageHref)}
          >
            {FIRST_PAGE_LABEL}
          </Link>
        )}
      </div>
    );

  return (
    <div
      data-testid="recipe-table"
      aria-busy={isPending}
      className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
    >
      {/* Sin región viva propia: la zona privada ya tiene una y `aria-busy` basta. */}
      {isPending ? (
        <p className="text-xs text-muted-foreground">{RECIPE_TABLE_TEXTS.loading}</p>
      ) : null}
      <DataTable
        tableId={RECIPE_TABLE_ID}
        columns={columns}
        rows={recipes}
        getRowId={(recipe) => recipe.id}
        params={params}
        totalPages={totalPages}
        onParamsChange={(next) => navigate(recipeListHref(next))}
        status="idle"
        texts={
          noResults === undefined
            ? RECIPE_TABLE_TEXTS
            : { ...RECIPE_TABLE_TEXTS, empty: RECIPE_NO_RESULTS_TEXT }
        }
        emptyAction={emptyAction}
        defaultPinnedColumns={RECIPE_DEFAULT_PINNED_COLUMNS}
      />
    </div>
  );
}
