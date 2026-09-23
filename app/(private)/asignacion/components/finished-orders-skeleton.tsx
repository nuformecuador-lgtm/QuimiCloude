import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** Copia a mano el numero de columnas de `buildFinishedOrdersColumns()`; un test ata las dos. */
export const FINISHED_ORDERS_SKELETON_COLUMN_COUNT = 6;

export function FinishedOrdersSkeleton({ rows }: { readonly rows: number }) {
  const columns = Array.from({ length: FINISHED_ORDERS_SKELETON_COLUMN_COUNT }, (_, index) => index);

  return (
    <div role="status" aria-busy="true" data-testid="finished-orders-skeleton">
      <span className="sr-only">Cargando pedidos terminados…</span>
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
            <TableRow key={index} data-testid="finished-order-row-skeleton">
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
