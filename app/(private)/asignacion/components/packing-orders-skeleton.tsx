import { AssignmentListSkeleton } from './assignment-list-parts';
import { PACKING_ORDERS_COLUMN_COUNT } from './packing-orders-columns';

export function PackingOrdersSkeleton({ rows }: { readonly rows: number }) {
  return (
    <AssignmentListSkeleton
      columns={PACKING_ORDERS_COLUMN_COUNT}
      rows={rows}
      label="Cargando pedidos por empacar…"
      testId="packing-orders-skeleton"
      rowTestId="packing-order-row-skeleton"
    />
  );
}
