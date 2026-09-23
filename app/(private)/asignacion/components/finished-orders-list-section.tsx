import type { DataTableParams } from '@/components/shared/data-table';
import { listFinishedOrdersAction } from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions';

import { AssignedOrdersError } from './assigned-orders-error';

export const FINISHED_ORDERS_SECTION_TESTID = 'finished-orders-list-section';

type FinishedOrdersListSectionProps = {
  /** Ya acotados por `parseAssignmentListParams`. */
  readonly params: DataTableParams;
};

/**
 * Punto de montaje de la vista «Terminados», conectado a su Server Action. Es un ESQUELETO MINIMO:
 * tabla, columnas y estados propios de vacio los completa la task siguiente.
 */
export async function FinishedOrdersListSection({ params }: FinishedOrdersListSectionProps) {
  const result = await listFinishedOrdersAction({ page: params.page, pageSize: params.pageSize });

  if (result.status === 'error') {
    return <AssignedOrdersError error={result} />;
  }

  return (
    <div data-testid={FINISHED_ORDERS_SECTION_TESTID}>
      {result.data.items.length} pedido(s) terminado(s).
    </div>
  );
}
