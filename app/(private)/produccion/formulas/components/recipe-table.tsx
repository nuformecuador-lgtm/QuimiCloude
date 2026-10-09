'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useTransition, type MouseEvent } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableStates,
  type DataTableTexts,
} from '@/components/shared/data-table';
import { buttonVariants } from '@/components/ui/button';
import type { ErrorState as OperationError } from '@/lib/modules/errores';
import type { RecipeSummary } from '@/lib/modules/recetas';
import { NEW_RECIPE_ROUTE, recipeEditRoute } from '@/lib/shared/routes';
import { touchTarget } from '@/lib/shared/ui/touch-target';
import { cn } from '@/lib/utils';

import { DeleteRecipeDialog } from './delete-recipe-dialog';
import { buildRecipeColumns } from './recipe-columns';
import { RECIPE_SKELETON_COLUMN_COUNT } from './recipe-columns-skeleton';
import { recipeListHref } from './recipe-list-params';

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

type EmptySlot = {
  readonly firstPageHref?: string;
};

type RecipeTableStatusProps =
  | { readonly status?: 'idle'; readonly error?: undefined }
  | { readonly status: 'loading'; readonly error?: undefined }
  | { readonly status: 'error'; readonly error: OperationError };

export type RecipeTableProps = {
  readonly recipes: readonly RecipeSummary[];
  readonly params: DataTableParams;
  readonly totalPages: number;
  /** Solo con cero filas y búsqueda o filtro activos. */
  readonly noResults?: NoResultsSlot;
  /** Solo con cero filas y sin búsqueda ni filtro activos. */
  readonly empty?: EmptySlot;
} & RecipeTableStatusProps;

function buildRecipeTableStates(
  params: DataTableParams,
  error: OperationError | undefined,
  empty: EmptySlot | undefined,
): DataTableStates {
  return {
    loading: {
      columns: RECIPE_SKELETON_COLUMN_COUNT,
      rows: params.pageSize,
      label: RECIPE_TABLE_TEXTS.loading,
      testId: 'recipe-table-skeleton',
      rowTestId: 'recipe-row-skeleton',
    },
    error:
      error === undefined
        ? undefined
        : {
            error,
            title: 'No se pudo cargar el catálogo.',
            testId: 'recipe-list-error',
            messageTestId: 'recipe-list-error-message',
            codeTestId: 'recipe-list-error-code',
            retry: { kind: 'refresh' },
            retryTestId: 'recipe-list-retry',
          },
    empty:
      empty === undefined
        ? undefined
        : {
            testId: 'recipe-list-empty',
            message:
              empty.firstPageHref === undefined
                ? 'Todavía no hay recetas en el catálogo.'
                : 'Esta página ya no tiene recetas.',
            firstPage:
              empty.firstPageHref === undefined
                ? undefined
                : {
                    href: empty.firstPageHref,
                    label: FIRST_PAGE_LABEL,
                    testId: 'recipe-list-first-page',
                  },
            // Un enlace y no `Button` con `render`: Base UI le pondría `role="button"` al `<a>`.
            children: (
              <Link
                href={NEW_RECIPE_ROUTE}
                data-slot="button"
                data-testid="recipe-create-open"
                className={cn(buttonVariants({ variant: 'default', touch: true }))}
              >
                Nueva fórmula
              </Link>
            ),
          },
  };
}

// Con modificadores se deja al navegador abrir otra pestaña; si no, la navegación va por la
// transición para que la tabla siga montada.
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
  );
}

export function RecipeTable({
  recipes,
  params,
  totalPages,
  noResults,
  empty,
  status = 'idle',
  error,
}: RecipeTableProps) {
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
                touchTarget,
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
          className={cn(buttonVariants({ variant: 'default', touch: true }))}
          onClick={navigateOnPlainClick(noResults.clearHref)}
        >
          {CLEAR_SEARCH_LABEL}
        </Link>
        {noResults.firstPageHref === undefined ? null : (
          <Link
            href={noResults.firstPageHref}
            data-slot="button"
            data-testid="recipe-list-no-results-first-page"
            className={cn(buttonVariants({ variant: 'outline', touch: true }))}
            onClick={navigateOnPlainClick(noResults.firstPageHref)}
          >
            {FIRST_PAGE_LABEL}
          </Link>
        )}
      </div>
    );

  const table = (
    <DataTable
      tableId={RECIPE_TABLE_ID}
      columns={columns}
      rows={recipes}
      getRowId={(recipe) => recipe.id}
      params={params}
      totalPages={totalPages}
      onParamsChange={(next) => navigate(recipeListHref(next))}
      status={status}
      texts={
        noResults === undefined
          ? RECIPE_TABLE_TEXTS
          : { ...RECIPE_TABLE_TEXTS, empty: RECIPE_NO_RESULTS_TEXT }
      }
      emptyAction={emptyAction}
      states={buildRecipeTableStates(params, error, empty)}
    />
  );

  // Fuera de las filas la tabla pinta el estado sola: el envoltorio no existía en esos estados.
  if (status !== 'idle' || (recipes.length === 0 && empty !== undefined)) {
    return table;
  }

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
      {table}
    </div>
  );
}
