import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Copia a mano el numero de columnas de `buildCompanyOrdersColumns()` SIN la fecha de terminado;
 * un test ata las dos. Con el filtro exactamente `ENTREGADO` se suma una columna mas (R31).
 */
export const COMPANY_ORDERS_SKELETON_BASE_COLUMN_COUNT = 7;

export function CompanyOrdersSkeleton({
  rows,
  showFinishedAt = false,
}: {
  readonly rows: number;
  readonly showFinishedAt?: boolean;
}) {
  const columnCount = showFinishedAt
    ? COMPANY_ORDERS_SKELETON_BASE_COLUMN_COUNT + 1
    : COMPANY_ORDERS_SKELETON_BASE_COLUMN_COUNT;
  const columns = Array.from({ length: columnCount }, (_, index) => index);

  return (
    <div role="status" aria-busy="true" data-testid="company-orders-skeleton">
      <span className="sr-only">Cargando pedidos…</span>
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
            <TableRow key={index} data-testid="company-order-row-skeleton">
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
