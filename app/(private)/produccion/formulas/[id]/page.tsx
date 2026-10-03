import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { PRODUCT_TYPES } from '@/lib/modules/inventario';
import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import {
  getRecipeAction,
  listRecipeVersionsAction,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { BRAND_LABEL, RECIPES_LABEL } from '@/lib/shared/navigation/private-nav';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { FORMULAS_ROUTE, recipeVersionRoute } from '@/lib/shared/routes';

import { RecipeForm, RecipeListError, RecipeVersionList } from '../components';

export const metadata: Metadata = {
  title: `Editar fórmula · ${RECIPES_LABEL} · ${BRAND_LABEL}`,
};

const FIRST_PAGE = 1;

/**
 * Página de edición de una receta (R2, R6, R21; `design.md > 5`).
 *
 * **Server Component `async`**, con el `id` en la URL (R2: recargar o compartir el enlace vuelve
 * a esta misma receta). Llama a `getRecipeAction(id)` y a las mismas dos consultas que la página
 * de alta -unidades y primera página de productos-, todas en paralelo.
 *
 * **`recipe_not_found`**: estado «no encontrada» identificable, con enlace a la lista, en vez de
 * un formulario vacío (R21). **`unauthorized`** (y cualquier otro código): el mismo estado de
 * error que usa la lista (R7).
 *
 * QC-70 (R20, R32): el código que se compara es el ABIERTO por caso -`recipe_not_found`, no el
 * genérico `not_found` que ya no existe en el catálogo-, y el texto que se pinta es el `message`
 * que devuelve la operación: esta página ya no escribe una frase propia para ese mismo código.
 *
 * **El corte por permiso vive AQUI** (QC-75 R6, R7): la primera linea exige `recetas.consultar`
 * -no `modificar`, por el mismo motivo que la pagina de alta- **antes** de resolver `params` y de
 * lanzar las tres lecturas; redirige al login sin sesion y responde 404 sin nombrar el modulo ni
 * mencionar permisos. El middleware ya NO corta por rol (QC-75 R16): en el borde solo quedan
 * firma, caducidad y empresa. La autorizacion sobre los DATOS la siguen aportando los casos de
 * uso de `recetas`.
 *
 * **Éxito**: precarga el formulario con el detalle, **incluidas las líneas cuyo `productName` es
 * `null`** -producto dado de baja (R21, R53)-: `buildInitialState` de `recipe-form.tsx` las
 * conserva tal cual, sin que esta página tenga que saber nada de esa marca.
 */
export default async function EditarRecetaPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePagePermission('recetas.consultar');

  const { id } = await params;

  // Las versiones se piden a la vez que el detalle aunque el id resulte ser de una version: en ese
  // caso su respuesta se descarta, porque la redireccion se decide con el detalle.
  const [recipeResult, versionsResult, unitsResult, productsResult, machinesResult] =
    await Promise.all([
      getRecipeAction(id),
      listRecipeVersionsAction(id),
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

  if (recipeResult.status === 'error') {
    if (recipeResult.code === 'recipe_not_found') {
      return (
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <div
            role="alert"
            data-testid="recipe-not-found"
            className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
          >
            <p className="text-sm font-medium" data-testid="recipe-not-found-message">
              {recipeResult.message}
            </p>
            <Link
              href={FORMULAS_ROUTE}
              className="min-h-11 min-w-11 text-sm underline"
              data-testid="recipe-not-found-link"
            >
              Volver a la lista
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <RecipeListError error={recipeResult} />
      </div>
    );
  }

  if (recipeResult.data.original !== null) {
    redirect(recipeVersionRoute(recipeResult.data.original.id, id));
  }

  if (versionsResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <RecipeListError error={versionsResult} />
      </div>
    );
  }

  if (unitsResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <RecipeListError error={unitsResult} />
      </div>
    );
  }

  if (productsResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <RecipeListError error={productsResult} />
      </div>
    );
  }

  if (machinesResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <RecipeListError error={machinesResult} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <h1 data-testid="recipe-form-title" className="text-2xl font-semibold break-words">
        Editar fórmula · {recipeResult.data.name}
      </h1>
      <RecipeForm
        mode="edit"
        recipe={recipeResult.data}
        versions={versionsResult.data}
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
      <RecipeVersionList originalId={id} versions={versionsResult.data} />
    </div>
  );
}
