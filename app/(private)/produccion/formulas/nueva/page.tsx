import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { PRODUCT_TYPES } from '@/lib/modules/inventario';
import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { BRAND_LABEL, RECIPES_LABEL } from '@/lib/shared/navigation/private-nav';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import { RecipeForm, RecipeListError } from '../components';

export const metadata: Metadata = {
  title: `Nueva fórmula · ${RECIPES_LABEL} · ${BRAND_LABEL}`,
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

  // El tab de ingredientes pide `PRODUCT` y el de máquinas `MACHINE`: cada primera página
  // llega ya filtrada por el servidor, igual que las búsquedas del selector.
  const [unitsResult, productsResult, machinesResult] = await Promise.all([
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
      <h1 data-testid="recipe-form-title" className="text-2xl font-semibold">
        Nueva fórmula
      </h1>
      <RecipeForm
        mode="create"
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
