import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type TableSkeletonProps = {
  readonly columns: number;
  readonly rows: number;
  /** Texto solo para lectores de pantalla. */
  readonly label: string;
  readonly testId: string;
  readonly rowTestId: string;
  /** La primera celda de cada fila reserva el hueco de la miniatura de `EntityImage`. */
  readonly withImage?: boolean;
  readonly headCellClassName?: string;
  readonly cellClassName?: string;
};

export const TABLE_SKELETON_IMAGE_CLASS_NAME = 'size-[60px] shrink-0';

export function TableSkeleton({
  columns,
  rows,
  label,
  testId,
  rowTestId,
  withImage = false,
  headCellClassName = 'h-4 w-24',
  cellClassName = 'h-4 w-full',
}: TableSkeletonProps) {
  const cells = Array.from({ length: columns }, (_, index) => index);

  return (
    <div role="status" aria-busy="true" data-testid={testId}>
      <span className="sr-only">{label}</span>
      <Table>
        <TableHeader>
          <TableRow>
            {cells.map((cell) => (
              <TableHead key={cell} scope="col">
                <Skeleton className={headCellClassName} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, index) => index).map((index) => (
            <TableRow key={index} data-testid={rowTestId}>
              {cells.map((cell) => (
                <TableCell key={cell}>
                  <Skeleton
                    className={
                      withImage && cell === 0 ? TABLE_SKELETON_IMAGE_CLASS_NAME : cellClassName
                    }
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
