import { TableSkeleton } from '@/components/shared/table-skeleton';

/**
 * Cuantas celdas por fila pinta el esqueleto: la misma cuenta que `ORDER_COLUMNS.length`, para que
 * resolverse la carga no cambie cuantas columnas hay.
 *
 * **No se importa `ORDER_COLUMNS`** a proposito: esa declaracion vive en un modulo de **cliente** y
 * este esqueleto lo renderiza un Server Component. Un test ata esta constante a
 * `ORDER_COLUMNS.length`.
 */
export const ORDER_SKELETON_COLUMN_COUNT = 12;

export function OrderListSkeleton({ rows }: { readonly rows: number }) {
  return (
    <TableSkeleton
      columns={ORDER_SKELETON_COLUMN_COUNT}
      rows={rows}
      label="Cargando pedidos…"
      testId="order-list-skeleton"
      rowTestId="order-row-skeleton"
      headCellClassName="h-4 w-full"
    />
  );
}
