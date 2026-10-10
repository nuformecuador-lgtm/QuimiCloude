import { AssignmentListSkeleton } from './assignment-list-parts';

/** Copia a mano el numero de columnas de `buildAssignedOrdersColumns`; un test ata las dos. */
export const ASSIGNED_ORDERS_SKELETON_COLUMN_COUNT = 8;

export function assignedOrdersSkeletonColumnCount(canExecute: boolean): number {
  return canExecute ? ASSIGNED_ORDERS_SKELETON_COLUMN_COUNT : ASSIGNED_ORDERS_SKELETON_COLUMN_COUNT - 1;
}

export function AssignedOrdersSkeleton({
  rows,
  canExecute,
}: {
  readonly rows: number;
  readonly canExecute: boolean;
}) {
  return (
    <AssignmentListSkeleton
      columns={assignedOrdersSkeletonColumnCount(canExecute)}
      rows={rows}
      label="Cargando pedidos asignados…"
      testId="assigned-orders-skeleton"
      rowTestId="assigned-order-row-skeleton"
    />
  );
}
