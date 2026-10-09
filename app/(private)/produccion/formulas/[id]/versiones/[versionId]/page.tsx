import type { Metadata } from 'next';
import Link from 'next/link';

import { ErrorState } from '@/components/shared/error-state';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { errorMessage } from '@/lib/modules/errores';
import { PRODUCT_TYPES } from '@/lib/modules/inventario';
import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import { getRecipeAction } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { BRAND_LABEL, RECIPES_LABEL } from '@/lib/shared/navigation/private-nav';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { FORMULAS_ROUTE } from '@/lib/shared/routes';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { RecipeVersionForm } from '../../../components';

export const metadata: Metadata = {
  title: `Editar versión · ${RECIPES_LABEL} · ${BRAND_LABEL}`,
};

const FIRST_PAGE = 1;

// Los mismos testids que el error de la lista: los vigila el E2E de errores.
const LOAD_ERROR = {
  title: 'No se pudo cargar el catálogo.',
  testId: 'recipe-list-error',
  messageTestId: 'recipe-list-error-message',
  codeTestId: 'recipe-list-error-code',
  retry: { kind: 'refresh' },
  retryTestId: 'recipe-list-retry',
} as const;

export default async function EditarVersionPage({
  params,
}: {
  readonly params: Promise<{ id: string; versionId: string }>;
}) {
  // `consultar` y no `modificar`: el permiso de escritura lo exige el servicio al guardar.
  await requirePagePermission('recetas.consultar');

  const { id, versionId } = await params;

  // La original se lee aparte porque el formulario compara contra sus lineas.
  const [versionResult, originalResult, unitsResult, productsResult, machinesResult] =
    await Promise.all([
      getRecipeAction(versionId),
      getRecipeAction(id),
      listUnitsAction(),
      listProductsAction({
        page: FIRST_PAGE,
        pageSize: MAX_PAGE_SIZE,
        filters: { type: { kind: 'select', values: [PRODUCT_TYPES.PRODUCT] } },
      }),
      listProductsAction({
        page: FIRST_PAGE,
        pageSize: MAX_PAGE_SIZE,
        filters: { type: { kind: 'select', values: [PRODUCT_TYPES.MACHINE] } },
      }),
    ]);

  let notFoundMessage: string | null = null;
  if (versionResult.status === 'error' && versionResult.code === 'recipe_not_found') {
    notFoundMessage = versionResult.message;
  } else if (originalResult.status === 'error' && originalResult.code === 'recipe_not_found') {
    notFoundMessage = originalResult.message;
  } else if (
    (versionResult.status === 'success' && versionResult.data.original?.id !== id) ||
    (originalResult.status === 'success' && originalResult.data.original !== null)
  ) {
    notFoundMessage = errorMessage('recipe_not_found');
  }

  if (notFoundMessage !== null) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div
          role="alert"
          data-testid="recipe-not-found"
          className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
        >
          <p className="text-sm font-medium" data-testid="recipe-not-found-message">
            {notFoundMessage}
          </p>
          <Link
            href={FORMULAS_ROUTE}
            className={`${touchTarget} text-sm underline`}
            data-testid="recipe-not-found-link"
          >
            Volver a la lista
          </Link>
        </div>
      </div>
    );
  }

  if (versionResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <ErrorState error={versionResult} {...LOAD_ERROR} />
      </div>
    );
  }

  if (originalResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <ErrorState error={originalResult} {...LOAD_ERROR} />
      </div>
    );
  }

  if (unitsResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <ErrorState error={unitsResult} {...LOAD_ERROR} />
      </div>
    );
  }

  if (productsResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <ErrorState error={productsResult} {...LOAD_ERROR} />
      </div>
    );
  }

  if (machinesResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <ErrorState error={machinesResult} {...LOAD_ERROR} />
      </div>
    );
  }

  const version = versionResult.data;
  const original = originalResult.data;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <h1 data-testid="recipe-version-page-title" className="text-2xl font-semibold">
        {version.displayName}
      </h1>
      <RecipeVersionForm
        mode="edit"
        version={version}
        original={{
          id: original.id,
          name: original.name,
          lines: original.lines,
          tools: original.tools,
        }}
        units={unitsResult.data}
        initialProductPage={{
          items: productsResult.data.items.map((item) => ({
            id: item.id,
            name: item.name,
            unitId: item.unitId,
          })),
          totalPages: productsResult.data.totalPages,
        }}
        initialMachinePage={{
          items: machinesResult.data.items.map((item) => ({
            id: item.id,
            name: item.name,
            unitId: item.unitId,
          })),
          totalPages: machinesResult.data.totalPages,
        }}
      />
    </div>
  );
}
