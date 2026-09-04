import { listSuppliersAction } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';

import { SupplierListEmpty } from './supplier-list-empty';
import { SupplierListError } from './supplier-list-error';
import { buildSupplierListQuery, type SupplierPageSize } from './supplier-list-params';
import { SupplierListToolbar } from './supplier-list-toolbar';
import { SupplierTable } from './supplier-table';

/** La primera pagina, a la que vuelve el estado vacio cuando la pedida se quedo atras. */
const FIRST_PAGE = 1;

type SupplierListSectionProps = {
  readonly page: number;
  readonly pageSize: SupplierPageSize;
};

/**
 * Seccion de lista: pide los datos y despacha a uno de los tres estados (R14, R16, R17, R18,
 * `design.md > 5.2`).
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados. Es la parte que la pagina envuelve en `<Suspense>`, de modo que el esqueleto de
 * R17 aparece solo mientras esta consulta esta en vuelo —sin un estado de carga escrito a mano y
 * sin carreras entre peticiones—.
 *
 * **Una sola llamada a `listSuppliersAction`** (`design.md > 5.2`): nunca `getSupplierAction`
 * por fila. Toda lectura pasa por la Server Action del modulo; ningun `fetch` a rutas propias
 * (R43).
 *
 * **R7**: aqui no se decide nada sobre permisos. No se lee la sesion, no se repite `requireAdmin`
 * y no se ocultan columnas por rol: la autorizacion la aportan los nueve casos de uso de
 * `proveedores`, y si la operacion responde `unauthorized` se pinta el estado de error **sin un
 * solo dato**.
 *
 * **Una lista vacia NO se pinta como tabla sin filas** (R16, R18): son tres situaciones
 * distintas —fallo, lista realmente vacia y pagina que se quedo atras tras una baja— y cada una
 * dice lo suyo. El destino de «volver a la primera» se deriva de `SUPPLIERS_ROUTE` y de
 * `buildSupplierListQuery`, nunca de un literal (R2).
 */
export async function SupplierListSection({ page, pageSize }: SupplierListSectionProps) {
  const result = await listSuppliersAction({ page, pageSize });

  if (result.status === 'error') {
    return <SupplierListError code={result.code} message={result.message} />;
  }

  const { items, page: currentPage, totalPages } = result.data;

  if (items.length === 0) {
    // El slot de «crear el primer proveedor» (R16) lo llena T8 con `<SupplierSheet />`, que es
    // la task que construye el panel lateral. No se adelanta aqui un boton sin panel detras.
    return (
      <SupplierListEmpty
        firstPageHref={
          currentPage > FIRST_PAGE
            ? `${SUPPLIERS_ROUTE}?${buildSupplierListQuery({ page: FIRST_PAGE, pageSize })}`
            : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="supplier-list">
      <SupplierTable suppliers={items} />
      <SupplierListToolbar page={currentPage} pageSize={pageSize} totalPages={totalPages} />
    </div>
  );
}
