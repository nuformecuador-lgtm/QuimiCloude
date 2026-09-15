import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { SUPPLIER_SKELETON_COLUMN_COUNT } from './supplier-columns-skeleton';

// Cuenta con una constante y no con las columnas: son una factoría de cliente y este esqueleto lo
// pinta un Server Component.
export function SupplierTableSkeleton({ rows }: { readonly rows: number }) {
  const cells = Array.from({ length: SUPPLIER_SKELETON_COLUMN_COUNT }, (_, index) => index);

  return (
    <div role="status" aria-busy="true" data-testid="supplier-table-skeleton">
      <span className="sr-only">Cargando proveedores…</span>
      <Table>
        <TableHeader>
          <TableRow>
            {cells.map((cell) => (
              <TableHead key={cell} scope="col">
                <Skeleton className="h-4 w-24" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, index) => index).map((index) => (
            <TableRow key={index} data-testid="supplier-row-skeleton">
              {cells.map((cell) => (
                <TableCell key={cell}>
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
