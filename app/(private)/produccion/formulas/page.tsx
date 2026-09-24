import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL, RECIPES_LABEL } from '@/lib/shared/navigation/private-nav';
import { NEW_RECIPE_ROUTE } from '@/lib/shared/routes';

import { parseRecipeListParams, RecipeListSection, RecipeTableSkeleton } from './components';

export const metadata: Metadata = {
  title: `${RECIPES_LABEL} · ${BRAND_LABEL}`,
};

const TOUCH_TARGET = 'min-h-11 min-w-11';

// El contenedor es un `div`: el landmark principal ya lo pone el layout privado y debe ser único.
export default async function FormulasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission('recetas.consultar');

  const params = parseRecipeListParams(await searchParams);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="recipes-title" className="text-2xl font-semibold">
          {RECIPES_LABEL}
        </h1>
        {/* Un enlace y no `Button` con `render`: Base UI le pondría `role="button"` al `<a>`. */}
        <Link
          href={NEW_RECIPE_ROUTE}
          data-slot="button"
          data-testid="recipe-create-open"
          className={cn(buttonVariants({ variant: 'default' }), TOUCH_TARGET)}
        >
          Nueva fórmula
        </Link>
      </div>
      {/* Sin `key`: remontar el límite en cada consulta borraría el foco del campo de búsqueda. */}
      <Suspense fallback={<RecipeTableSkeleton rows={params.pageSize} />}>
        <RecipeListSection params={params} />
      </Suspense>
    </div>
  );
}
