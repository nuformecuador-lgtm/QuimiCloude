import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { FINISHED_ORDERS_SKELETON_COLUMN_COUNT } from './finished-orders-skeleton';

/**
 * Copia a mano el numero de columnas de `buildConditioningOrdersColumns()`: ese archivo es de
 * cliente y su constante no llega a un componente de servidor. Un test ata las dos.
 */
export const CONDITIONING_ORDERS_SKELETON_COLUMN_COUNT = 5;

const SKELETON_SHAPE = {
  por_acondicionar: {
    columnCount: CONDITIONING_ORDERS_SKELETON_COLUMN_COUNT,
    label: 'Cargando pedidos por acondicionar…',
  },
  acondicionados: {
    columnCount: FINISHED_ORDERS_SKELETON_COLUMN_COUNT,
    label: 'Cargando pedidos terminados…',
  },
} as const;

export type ConditioningOrdersSkeletonProps = {
  readonly rows: number;
  /** Qué tabla se está cargando: decide el número de columnas y el texto. */
  readonly list: keyof typeof SKELETON_SHAPE;
};

/** El esqueleto de las dos tablas del acondicionador. */
export function ConditioningOrdersSkeleton({ rows, list }: ConditioningOrdersSkeletonProps) {
  const { columnCount, label } = SKELETON_SHAPE[list];
  const columns = Array.from({ length: columnCount }, (_, index) => index);

  return (
    <div
      role="status"
      aria-busy="true"
      data-testid="conditioning-orders-skeleton"
      data-list={list}
    >
      <span className="sr-only">{label}</span>
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
            <TableRow key={index} data-testid="conditioning-order-row-skeleton">
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
