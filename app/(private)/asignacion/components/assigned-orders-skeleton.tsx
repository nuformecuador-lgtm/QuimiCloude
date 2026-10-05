import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
  const columns = Array.from(
    { length: assignedOrdersSkeletonColumnCount(canExecute) },
    (_, index) => index,
  );

  return (
    <div role="status" aria-busy="true" data-testid="assigned-orders-skeleton">
      <span className="sr-only">Cargando pedidos asignados…</span>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column} scope="col">
                <Skeleton className="h-4 w-full" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, index) => index).map((index) => (
            <TableRow key={index} data-testid="assigned-order-row-skeleton">
              {columns.map((column) => (
                <TableCell key={column}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
