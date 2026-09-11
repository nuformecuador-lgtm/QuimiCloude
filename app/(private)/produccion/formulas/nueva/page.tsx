import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
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
 * **El corte por permiso vive AQUI, y pide `recetas.consultar` y NO `recetas.modificar`**
 * (QC-75 R6, R7; `design.md > 2.2`). No es un descuido: el permiso de escritura ya lo exige el
 * caso de uso al guardar (QC-74) y no hay implicacion entre permisos, asi que pedir `modificar`
 * en la ruta seria una SEGUNDA regla de autorizacion sobre la misma operacion, en un sitio que
 * no es la frontera. La ruta decide si se **ensena** una pantalla; el service decide si se puede
 * **hacer**. Quien solo tenga `recetas.consultar` vera este formulario y el guardado se lo negara
 * el service, que es donde tiene que doler.
 *
 * La llamada va **antes** de las dos lecturas, no despues (R6), y el middleware ya NO corta por
 * rol (QC-75 R16). Si cualquiera de las dos operaciones responde con error -incluido
 * `unauthorized`- se presenta el estado de error y el formulario NO se monta.
 *
 * **Contenedor exterior `<div>`, sin `main` propio** (R1): `SidebarInset` del layout privado ya lo
 * es. **Los componentes se importan SOLO desde `../components`** (R46).
 */
export default async function NuevaRecetaPage() {
  await requirePagePermission('recetas.consultar');

  const [unitsResult, productsResult] = await Promise.all([
    listUnitsAction(),
    listProductsAction({ page: FIRST_PAGE, pageSize: MAX_PAGE_SIZE }),
  ]);

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

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <h1 data-testid="recipe-form-title" className="text-2xl font-semibold">
        Nueva receta
      </h1>
      <RecipeForm
        mode="create"
        units={unitsResult.data}
        initialProductPage={{
          items: productsResult.data.items.map((item) => ({
            id: item.id,
            name: item.name,
            unitId: item.latestBatchUnitId,
          })),
          totalPages: productsResult.data.totalPages,
        }}
      />
    </div>
  );
}
