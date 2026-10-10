import { AssignmentListSkeleton } from './assignment-list-parts';

/**
 * Copia a mano el numero de columnas de `buildCompanyOrdersColumns()` SIN la fecha de terminado;
 * un test ata las dos. Con el filtro exactamente `ENTREGADO` o exactamente `TERMINADO` se suma una
 * columna mas: quien lo pinta pasa `showFinishedAt` desde `isExactlyDelivered`, la misma regla que
 * usa la tabla.
 */
export const COMPANY_ORDERS_SKELETON_BASE_COLUMN_COUNT = 7;

export function CompanyOrdersSkeleton({
  rows,
  showFinishedAt = false,
}: {
  readonly rows: number;
  readonly showFinishedAt?: boolean;
}) {
  return (
    <AssignmentListSkeleton
      columns={
        showFinishedAt
          ? COMPANY_ORDERS_SKELETON_BASE_COLUMN_COUNT + 1
          : COMPANY_ORDERS_SKELETON_BASE_COLUMN_COUNT
      }
      rows={rows}
      label="Cargando pedidos…"
      testId="company-orders-skeleton"
      rowTestId="company-order-row-skeleton"
    />
  );
}
