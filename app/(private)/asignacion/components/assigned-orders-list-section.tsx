import type { DataTableParams } from '@/components/shared/data-table';
import { listAssignedOrdersAction } from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions';

import { AssignedOrdersEmpty } from './assigned-orders-empty';
import { AssignedOrdersError } from './assigned-orders-error';
import { FIRST_PAGE, assignedOrdersListHref, toAssignedOrdersQuery } from './assigned-orders-list-params';
import { AssignedOrdersTable } from './assigned-orders-table';

type AssignedOrdersListSectionProps = {
  /** Los parametros ya acotados por `parseAssignedOrdersListParams`. */
  readonly params: DataTableParams;
};

/**
 * Seccion de lista: pide los datos y despacha a uno de los tres estados (R27, R28, R29,
 * `design.md > 8.1`).
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados (R27). **Una sola llamada a `listAssignedOrdersAction`**, importada por su RUTA
 * EXACTA -nunca por el barrel del modulo, que no la reexporta a proposito-.
 *
 * **R28**: si la operacion falla, se pinta el estado de error sin mostrar ningun dato.
 * **R29**: si la persona no tiene ningun pedido asignado en `PENDIENTE`/`EN_CURSO`, se pinta el
 * vacio propio, con el destino a la primera pagina presente SOLO si la pagina pedida quedo vacia
 * por pasarse del total.
 */
export async function AssignedOrdersListSection({ params }: AssignedOrdersListSectionProps) {
  const result = await listAssignedOrdersAction(toAssignedOrdersQuery(params));

  if (result.status === 'error') {
    return <AssignedOrdersError error={result} />;
  }

  const { items, page: currentPage, totalPages } = result.data;

  if (items.length === 0) {
    return (
      <AssignedOrdersEmpty
        firstPageHref={
          currentPage > FIRST_PAGE ? assignedOrdersListHref({ ...params, page: FIRST_PAGE }) : undefined
        }
      />
    );
  }

  return (
    <AssignedOrdersTable rows={items} params={params} totalPages={totalPages} />
  );
}
