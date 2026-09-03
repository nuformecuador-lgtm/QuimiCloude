import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import { INVENTORY_ROUTE } from '@/lib/shared/routes';

import { buildProductListQuery, type ProductPageSize } from './product-list-params';
import { ProductListEmpty } from './product-list-empty';
import { ProductListError } from './product-list-error';
import { ProductListToolbar } from './product-list-toolbar';
import { ProductSheet } from './product-sheet';
import { ProductTable } from './product-table';

/** La primera pagina, a la que vuelve el estado vacio cuando la pedida se quedo atras. */
const FIRST_PAGE = 1;

type ProductListSectionProps = {
  readonly page: number;
  readonly pageSize: ProductPageSize;
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
 * **R5**: aqui no se decide nada sobre permisos. No se lee la sesion, no se repite `requireAdmin`
 * y no se ocultan columnas por rol: la autorizacion la aporta el caso de uso, y si responde
 * `unauthorized` se pinta el estado de error **sin un solo dato del catalogo**.
 *
 * **Una lista vacia NO se pinta como tabla sin filas** (R14, R16): son tres situaciones distintas
 * -fallo, catalogo vacio y pagina que se quedo atras tras un borrado- y cada una dice lo suyo.
 */
export async function ProductListSection({ page, pageSize }: ProductListSectionProps) {
  const result = await listProductsAction({ page, pageSize });

  if (result.status === 'error') {
    return <ProductListError code={result.code} message={result.message} />;
  }

  const { items, page: currentPage, totalPages } = result.data;

  if (items.length === 0) {
    return (
      <ProductListEmpty
        firstPageHref={
          currentPage > FIRST_PAGE
            ? `${INVENTORY_ROUTE}?${buildProductListQuery({ page: FIRST_PAGE, pageSize })}`
            : undefined
        }
      >
        <ProductSheet />
      </ProductListEmpty>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="product-list">
      <ProductTable products={items} />
      <ProductListToolbar page={currentPage} pageSize={pageSize} totalPages={totalPages} />
    </div>
  );
}
