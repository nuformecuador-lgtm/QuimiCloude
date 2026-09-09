import type { Metadata } from 'next';
import Link from 'next/link';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import { getRecipeAction } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { BRAND_LABEL, RECIPES_LABEL } from '@/lib/shared/navigation/private-nav';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { FORMULAS_ROUTE } from '@/lib/shared/routes';

import { RecipeForm, RecipeListError } from '../components';

export const metadata: Metadata = {
  title: `Editar receta · ${RECIPES_LABEL} · ${BRAND_LABEL}`,
};

const FIRST_PAGE = 1;
const NOT_FOUND_MESSAGE = 'Esta receta no existe o fue borrada.';

/**
 * Página de edición de una receta (R2, R6, R21; `design.md > 5`).
 *
 * **Server Component `async`**, con el `id` en la URL (R2: recargar o compartir el enlace vuelve
 * a esta misma receta). Llama a `getRecipeAction(id)` y a las mismas dos consultas que la página
 * de alta -unidades y primera página de productos-, todas en paralelo.
 *
 * **`not_found`**: estado «no encontrada» identificable, con enlace a la lista, en vez de un
 * formulario vacío (R21). **`unauthorized`** (y cualquier otro código): el mismo estado de error
 * que usa la lista (R7).
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

  const [recipeResult, unitsResult, productsResult] = await Promise.all([
    getRecipeAction(id),
    listUnitsAction(),
    listProductsAction({ page: FIRST_PAGE, pageSize: MAX_PAGE_SIZE }),
  ]);

  if (recipeResult.status === 'error') {
    if (recipeResult.code === 'not_found') {
      return (
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <div
            role="alert"
            data-testid="recipe-not-found"
            className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
          >
            <p className="text-sm font-medium" data-testid="recipe-not-found-message">
              {NOT_FOUND_MESSAGE}
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
        <RecipeListError code={recipeResult.code} message={recipeResult.message} />
      </div>
    );
  }

  if (unitsResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <RecipeListError code={unitsResult.code} message={unitsResult.message} />
      </div>
    );
  }

  if (productsResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <RecipeListError code={productsResult.code} message={productsResult.message} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <h1 data-testid="recipe-form-title" className="text-2xl font-semibold">
        Editar receta
      </h1>
      <RecipeForm
        mode="edit"
        recipe={recipeResult.data}
        units={unitsResult.data}
        initialProductPage={{
          items: productsResult.data.items.map((item) => ({
            id: item.id,
            name: item.name,
            unitId: item.unitId,
          })),
          totalPages: productsResult.data.totalPages,
        }}
      />
    </div>
  );
}
