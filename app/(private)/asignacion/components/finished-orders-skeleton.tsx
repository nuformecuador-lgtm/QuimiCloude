import { AssignmentListSkeleton } from './assignment-list-parts';

/** Copia a mano el numero de columnas de `buildFinishedOrdersColumns()`; un test ata las dos. */
export const FINISHED_ORDERS_SKELETON_COLUMN_COUNT = 6;

export function FinishedOrdersSkeleton({ rows }: { readonly rows: number }) {
  return (
    <AssignmentListSkeleton
      columns={FINISHED_ORDERS_SKELETON_COLUMN_COUNT}
      rows={rows}
      label="Cargando pedidos terminados…"
      testId="finished-orders-skeleton"
      rowTestId="finished-order-row-skeleton"
    />
  );
}
