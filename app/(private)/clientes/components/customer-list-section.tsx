import type { DataTableParams } from '@/components/shared/data-table';
import { listCustomersAction } from '@/lib/modules/clientes/adapters/driving/customer-actions';

import {
  FIRST_PAGE,
  clearSearchAndFilters,
  customerListHref,
  hasActiveSearchOrFilter,
} from './customer-list-params';
import { CustomerTable } from './customer-table';

/**
 * Seccion de lista: pide los datos y despacha a uno de los cinco casos.
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados. Es la parte que la pagina envuelve en `<Suspense>`, de modo que el esqueleto
 * aparece solo mientras esta consulta esta en vuelo.
 *
 * **Una sola llamada a `listCustomersAction`**, importada por su RUTA EXACTA, nunca desde el
 * barrel publico del modulo. `params` viaja **entero y sin traducir**: `DataTableParams` es
 * campo a campo la misma forma que `ListQuery`, y el esquema del caso de uso es un
 * `strictObject`.
 *
 * **Aqui no se decide nada sobre permisos**: no se lee la sesion, no se repite ninguna
 * comprobacion y no se ocultan columnas por rol. `canModify` solo se transporta: lo resolvio la
 * pagina.
 *
 * Si la operacion responde con un error de autorizacion, se pinta el estado de error y NO se
 * presenta ni un dato de clientes.
 */

export type CustomerListSectionProps = {
  /** Los parametros ya acotados por `parseCustomerListParams`. */
  readonly params: DataTableParams;
  /** Si la sesion trae `clientes.modificar`. Llega por props desde la pagina. */
  readonly canModify: boolean;
};

export async function CustomerListSection({ params, canModify }: CustomerListSectionProps) {
  const result = await listCustomersAction(params);

  if (result.status === 'error') {
    return (
      <CustomerTable
        status="error"
        error={result}
        customers={[]}
        params={params}
        totalPages={0}
        canModify={canModify}
      />
    );
  }

  const { items, page: currentPage, totalPages } = result.data;
  const outOfRange = items.length === 0 && currentPage > FIRST_PAGE;
  const active = hasActiveSearchOrFilter(params);

  if (items.length === 0 && !active) {
    // Vacio de verdad, o la pagina que se quedo atras sin termino ni filtro: es la unica
    // situacion en la que se ofrece «dar de alta el primer cliente».
    return (
      <CustomerTable
        customers={items}
        params={params}
        totalPages={totalPages}
        canModify={canModify}
        empty={{
          firstPageHref: outOfRange ? customerListHref({ ...params, page: FIRST_PAGE }) : undefined,
        }}
      />
    );
  }

  if (outOfRange) {
    // Con termino o filtro vigentes, la pagina que se quedo atras gana al «sin coincidencias»:
    // hay coincidencias, solo que en otra pagina. Sigue siendo la TABLA, con su caja montada, y
    // el enlace conserva termino, filtros, tamano y orden.
    return (
      <CustomerTable
        customers={items}
        params={params}
        totalPages={totalPages}
        canModify={canModify}
        outOfRange={{ firstPageHref: customerListHref({ ...params, page: FIRST_PAGE }) }}
      />
    );
  }

  if (items.length === 0) {
    // Dentro de rango y sin filas: la busqueda o el filtro no encontraron nada. Sigue siendo la
    // TABLA, con su caja de busqueda montada.
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
