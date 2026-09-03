import type { Metadata } from 'next';

import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { BRAND_LABEL, RECIPES_LABEL } from '@/lib/shared/navigation/private-nav';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import { RecipeForm, RecipeListError } from '../components';

export const metadata: Metadata = {
  title: `Nueva receta · ${RECIPES_LABEL} · ${BRAND_LABEL}`,
};

const FIRST_PAGE = 1;

/**
 * Página de alta de una receta (R2, R20; `design.md > 5`).
 *
 * **Server Component**: pide las unidades (`listUnitsAction`) y la primera página de productos
 * (`listProductsAction`, con `MAX_PAGE_SIZE` **importado**) y se las pasa a `RecipeForm` **por
 * props** (R49) -el formulario no las pide por su cuenta al montarse, así que no hay una petición
 * duplicada nada más abrir la pantalla-.
 *
 * **R7**: aquí no se decide ningún permiso. Si cualquiera de las dos operaciones responde con
 * error -incluido `unauthorized`- se presenta el estado de error y el formulario NO se monta.
 *
 * **Contenedor exterior `<div>`, sin `main` propio** (R1): `SidebarInset` del layout privado ya lo
 * es. **Los componentes se importan SOLO desde `../components`** (R46).
 */
export default async function NuevaRecetaPage() {
  const [unitsResult, productsResult] = await Promise.all([
    listUnitsAction(),
    listProductsAction({ page: FIRST_PAGE, pageSize: MAX_PAGE_SIZE }),
  ]);

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
        Nueva receta
      </h1>
      <RecipeForm
        mode="create"
        units={unitsResult.data}
        initialProductPage={{
          items: productsResult.data.items.map((item) => ({ id: item.id, name: item.name })),
          totalPages: productsResult.data.totalPages,
        }}
      />
    </div>
  );
}
