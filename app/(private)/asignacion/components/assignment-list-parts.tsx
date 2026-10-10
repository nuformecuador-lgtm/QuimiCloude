import type { ReactNode } from 'react';

import type { DataTableColumn } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import {
  OrderDistributionLabel,
  type OrderDistributionLabelProps,
} from '@/components/shared/order-distribution-label';
import {
  ResponsibleAvatars,
  type ResponsibleAvatarsProps,
} from '@/components/shared/responsible-avatars';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import type { ErrorState as OperationError } from '@/lib/modules/errores';
import { EMPTY_MARK } from '@/lib/shared/ui/empty-mark';

const PAST_LAST_PAGE_MESSAGE = 'Esta página ya no tiene pedidos.';
const FIRST_PAGE_LABEL = 'Volver a la primera página';

export function AssignmentListSectionFrame({
  testId,
  className,
  children,
}: {
  readonly testId: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div data-testid={testId} className={className}>
      {children}
    </div>
  );
}

export function AssignmentListError({ error }: { readonly error: OperationError }) {
  return (
    <ErrorState
      error={error}
      title="No se pudo cargar la lista de pedidos asignados."
      testId="assigned-orders-error"
      messageTestId="assigned-orders-error-message"
      codeTestId="assigned-orders-error-code"
      retry={{ kind: 'refresh' }}
      retryTestId="assigned-orders-retry"
    />
  );
}

/** El enlace solo existe cuando la pagina pedida se paso del total. */
export function firstPageHrefWhenPast(
  currentPage: number,
  firstPage: number,
  buildHref: () => string,
): string | undefined {
  return currentPage > firstPage ? buildHref() : undefined;
}

export type AssignmentListEmptyProps = {
  /** `assigned-orders` da `assigned-orders-empty`, `-empty-message` y `-first-page`. */
  readonly testIdPrefix: string;
  /** El texto cuando no hay ningun pedido. */
  readonly message: string;
  readonly firstPageHref?: string;
};

export function AssignmentListEmpty({
  testIdPrefix,
  message,
  firstPageHref,
}: AssignmentListEmptyProps) {
  return (
    <EmptyState
      testId={`${testIdPrefix}-empty`}
      messageTestId={`${testIdPrefix}-empty-message`}
      message={firstPageHref === undefined ? message : PAST_LAST_PAGE_MESSAGE}
      firstPage={
        firstPageHref === undefined
          ? undefined
          : { href: firstPageHref, label: FIRST_PAGE_LABEL, testId: `${testIdPrefix}-first-page` }
      }
    />
  );
}

export type AssignmentListSkeletonProps = {
  readonly columns: number;
  readonly rows: number;
  readonly label: string;
  readonly testId: string;
  readonly rowTestId: string;
};

export function AssignmentListSkeleton(props: AssignmentListSkeletonProps) {
  return <TableSkeleton {...props} headCellClassName="h-4 w-full" />;
}

export function MissingValue({
  testIdPrefix,
  field,
}: {
  /** `assigned-order` da `assigned-order-missing-<field>`. */
  readonly testIdPrefix: string;
  readonly field: string;
}) {
  return (
    <span aria-label="Sin dato" data-testid={`${testIdPrefix}-missing-${field}`}>
      {EMPTY_MARK}
    </span>
  );
}

export function orderNumberColumn<TRow extends { readonly numberText: string }>(
  id: string,
): DataTableColumn<TRow> {
  return {
    id,
    label: 'Nº de pedido',
    align: 'start',
    // Es un defecto: con preferencia guardada gana la del usuario.
    defaultPinned: 'left',
    cell: (order) => order.numberText,
  };
}

export function recipeColumn<TRow extends { readonly recipeName: string | null }>(
  id: string,
  missingTestIdPrefix: string,
): DataTableColumn<TRow> {
  return {
    id,
    label: 'Receta',
    align: 'start',
    cell: (order) => order.recipeName ?? <MissingValue testIdPrefix={missingTestIdPrefix} field={id} />,
  };
}

export function quantityColumn<
  TRow extends { readonly quantity: string; readonly unitLabel: string | null },
>(id: string, formatQuantity: (quantity: string) => string): DataTableColumn<TRow> {
  return {
    id,
    label: 'Cantidad',
    align: 'end',
    cell: (order) =>
      order.unitLabel === null
        ? formatQuantity(order.quantity)
        : `${formatQuantity(order.quantity)} ${order.unitLabel}`,
  };
}

export function presentationColumn<
  TRow extends { readonly presentationLines: OrderDistributionLabelProps['lines'] },
>(id: string): DataTableColumn<TRow> {
  return {
    id,
    label: 'Presentación',
    align: 'start',
    cell: (order) => <OrderDistributionLabel lines={order.presentationLines} />,
  };
}

export function responsiblesColumn<TRow>(
  id: string,
  responsiblesOf: (order: TRow) => ResponsibleAvatarsProps['responsibles'],
): DataTableColumn<TRow> {
  return {
    id,
    label: 'Responsables',
    align: 'start',
    // Sin `onShowAll`: estas listas no tienen panel de edicion donde desplegar el resto.
    cell: (order) => <ResponsibleAvatars responsibles={responsiblesOf(order)} />,
  };
}
