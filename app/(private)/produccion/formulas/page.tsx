import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { identity } from '@/lib/composition';
import { canUploadDocuments } from '@/lib/modules/documentos';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL, RECIPES_LABEL } from '@/lib/shared/navigation/private-nav';
import { NEW_RECIPE_ROUTE } from '@/lib/shared/routes';

import { FormulaPdfUpload, parseRecipeListParams, RecipeListSection, RecipeTable } from './components';

export const metadata: Metadata = {
  title: `${RECIPES_LABEL} · ${BRAND_LABEL}`,
};

// El contenedor es un `div`: el landmark principal ya lo pone el layout privado y debe ser único.
export default async function FormulasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission('recetas.consultar');

  const params = parseRecipeListParams(await searchParams);
  const canUpload = canUploadDocuments(await identity.getSessionUser());

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="recipes-title" className="text-2xl font-semibold">
          {RECIPES_LABEL}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Un enlace y no `Button` con `render`: Base UI le pondría `role="button"` al `<a>`. */}
          <Link
            href={NEW_RECIPE_ROUTE}
            data-slot="button"
            data-testid="recipe-create-open"
            className={cn(buttonVariants({ variant: 'default', touch: true }))}
          >
            Nueva fórmula
          </Link>
          {canUpload ? <FormulaPdfUpload /> : null}
        </div>
      </div>
      {/* Sin `key`: remontar el límite en cada consulta borraría el foco del campo de búsqueda. */}
      <Suspense
        fallback={<RecipeTable status="loading" recipes={[]} params={params} totalPages={0} />}
      >
        <RecipeListSection params={params} />
      </Suspense>
    </div>
  );
}
