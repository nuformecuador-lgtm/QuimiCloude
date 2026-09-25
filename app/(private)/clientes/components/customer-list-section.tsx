import type { DataTableParams } from '@/components/shared/data-table';
import { listCustomersAction } from '@/lib/modules/clientes/adapters/driving/customer-actions';

import { CustomerListEmpty } from './customer-list-empty';
import { CustomerListError } from './customer-list-error';
import {
  FIRST_PAGE,
  clearSearchAndFilters,
  customerListHref,
  hasActiveSearchOrFilter,
} from './customer-list-params';
import { CustomerSheet } from './customer-sheet';
import { CustomerTable } from './customer-table';

/**
 * Seccion de lista: pide los datos y despacha a uno de los cinco casos (R7, R19, R20, R22,
 * `design.md > 5.1`).
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados. Es la parte que la pagina envuelve en `<Suspense>`, de modo que el esqueleto de
 * R21 aparece solo mientras esta consulta esta en vuelo.
 *
 * **Una sola llamada a `listCustomersAction`** (R7), importada por su RUTA EXACTA (R34), nunca
 * desde el barrel publico del modulo. `params` viaja **entero y sin traducir**: `DataTableParams`
 * es campo a campo la misma forma que `ListQuery`, y el esquema del caso de uso es un
 * `strictObject`.
 *
 * **Aqui no se decide nada sobre permisos** (R8): no se lee la sesion, no se repite ninguna
 * comprobacion y no se ocultan columnas por rol. `canModify` solo se transporta: lo resolvio la
 * pagina.
 *
 * **R7**: si la operacion responde con un error de autorizacion, se pinta el estado de error y
 * NO se presenta ni un dato de clientes.
 */

export type CustomerListSectionProps = {
  /** Los parametros ya acotados por `parseCustomerListParams`. */
  readonly params: DataTableParams;
  /** Si la sesion trae `clientes.modificar` (R5). Llega por props desde la pagina (R8). */
  readonly canModify: boolean;
};

export async function CustomerListSection({ params, canModify }: CustomerListSectionProps) {
  const result = await listCustomersAction(params);

  if (result.status === 'error') {
    return <CustomerListError error={result} retryHref={customerListHref(params)} />;
  }

  const { items, page: currentPage, totalPages } = result.data;

  if (items.length === 0 && !hasActiveSearchOrFilter(params)) {
    // Vacio de verdad, pagina 1: la unica situacion en la que se ofrece «dar de alta el primer
    // cliente» (R19). El disparador de alta es `<CustomerSheet />`, hijo de este estado y no de
    // la tabla, porque con cero clientes la tabla ni llega a montarse.
    return (
      <CustomerListEmpty
        canModify={canModify}
        firstPageHref={
          currentPage > FIRST_PAGE ? customerListHref({ ...params, page: FIRST_PAGE }) : undefined
        }
      >
        <CustomerSheet />
      </CustomerListEmpty>
    );
  }

  if (items.length === 0) {
    // La pagina pedida se quedo sin elementos (page > totalPages) o la busqueda/filtro no
    // encontro nada: en los dos casos sigue siendo la TABLA, con su caja de busqueda montada
    // (R20). `withSearchResetsPage`/`hasActiveSearchOrFilter` ya distinguen esto del vacio de R19.
    return (
      <CustomerTable
        customers={items}
        params={params}
        totalPages={totalPages}
        canModify={canModify}
        noMatches={{ clearHref: customerListHref(clearSearchAndFilters(params)) }}
      />
    );
  }

  return <CustomerTable customers={items} params={params} totalPages={totalPages} canModify={canModify} />;
}
