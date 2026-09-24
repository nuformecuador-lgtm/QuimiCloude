import type { DataTableParams } from '@/components/shared/data-table';
import { identity } from '@/lib/composition';
import { canAdjustBatchStock } from '@/lib/modules/inventario';
import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import type { UnitRef } from '@/lib/modules/unidades';

import { FIRST_PAGE, productListHref, STOCK_COLUMN_ID, QTY_ALERT_COLUMN_ID, TYPE_COLUMN_ID } from './product-list-params';
import { ProductListEmpty } from './product-list-empty';
import { ProductListError } from './product-list-error';
import { ProductSheet } from './product-sheet';
import { ProductTable } from './product-table';

type ProductListSectionProps = {
  /**
   * Los parametros de lista YA ACOTADOS por `parseProductListParams`. Se pasan ENTEROS a la
   * operacion de consulta: `DataTableParams` es campo a campo la forma que `createListQuerySchema`
   * espera (QC-57), asi que aqui no se traduce ni se inventa ninguna clave.
   */
  readonly params: DataTableParams;
  /**
   * Catalogo de unidades, pedido **una sola vez** por la pagina. Lo necesita el panel de ALTA del
   * estado vacio -para el alta rapida de presentacion- y la columna de existencia, que lo usa
   * para resolver el simbolo de cada cantidad; sin el, ninguno de los dos se cae, se degradan.
   * Aqui no se consulta nada: baja por props.
   */
  readonly units?: readonly UnitRef[];
};

/**
 * Seccion de lista: pide los datos y despacha a uno de los tres estados (R14, R15, R16,
 * `design.md > 4.3`).
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados. Es la parte que la pagina envuelve en `<Suspense>`, de modo que el esqueleto de
 * R15 aparece solo mientras esta consulta esta en vuelo -sin un estado de carga escrito a mano y
 * sin carreras entre peticiones-.
 *
 * **Aqui no se decide autorizacion.** La sesion se lee solo para preguntar a
 * `canAdjustBatchStock` si se pinta el control de ajuste -presentacion, no permiso-; no se repite
 * `requireAdmin` ni se ocultan columnas por rol. La autorizacion sobre los datos la aporta el caso
 * de uso, y si responde `unauthorized` se pinta el estado de error **sin un solo dato del
 * catalogo**.
 *
 * **Una lista vacia NO se pinta como tabla sin filas** (R14, R16): son tres situaciones distintas
 * -fallo, catalogo vacio y pagina que se quedo atras tras un borrado- y cada una dice lo suyo.
 */
export async function ProductListSection({ params, units }: ProductListSectionProps) {
  const result = await listProductsAction(params);

  if (result.status === 'error') {
    return <ProductListError error={result} />;
  }

  const { items, page: currentPage, totalPages } = result.data;
  // Presentacion, no autorizacion: decide si se pinta el control de ajuste.
  // Quien autoriza de verdad es requirePermission en adjust-batch-stock.ts.
  const canAdjust = canAdjustBatchStock(await identity.getSessionUser());

  // Hay filtros activos si: busqueda, tipo, rango stock o rango alerta
  const hasActiveFilters =
    (params.search?.trim() ?? '') !== '' ||
    (params.filters[TYPE_COLUMN_ID]?.kind === 'select' && params.filters[TYPE_COLUMN_ID].values.length > 0) ||
    (params.filters[STOCK_COLUMN_ID]?.kind === 'numberRange' &&
      (params.filters[STOCK_COLUMN_ID].min !== null || params.filters[STOCK_COLUMN_ID].max !== null)) ||
    (params.filters[QTY_ALERT_COLUMN_ID]?.kind === 'numberRange' &&
      (params.filters[QTY_ALERT_COLUMN_ID].min !== null || params.filters[QTY_ALERT_COLUMN_ID].max !== null));

  // Si no hay items:
  // - Sin filtros -> catalogo vacio: muestra estado vacio completo con formulario de alta
  // - Con filtros -> resultado vacio filtrado: muestra la tabla con su estado vacio ("No hay productos que mostrar.")
  if (items.length === 0 && !hasActiveFilters) {
    return (
      <ProductListEmpty
        firstPageHref={
          currentPage > FIRST_PAGE
            ? productListHref({ ...params, page: FIRST_PAGE })
            : undefined
        }
      >
        <ProductSheet units={units} />
      </ProductListEmpty>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="product-list">
      {/*
        La paginacion y el tamano de pagina los pinta la tabla compartida desde el 2026-09-07:
        `product-list-toolbar.tsx` desaparecio y con el la barra propia de esta ruta.
      */}
      <ProductTable
        products={items}
        params={{ ...params, page: currentPage }}
        totalPages={totalPages}
        units={units}
        canAdjust={canAdjust}
      />
    </div>
  );
}
