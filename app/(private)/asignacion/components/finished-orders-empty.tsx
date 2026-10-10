import { AssignmentListEmpty } from './assignment-list-parts';

export type FinishedOrdersEmptyProps = {
  /** Presente solo si la pagina pedida se paso del total; ausente si no hay ningun pedido. */
  readonly firstPageHref?: string;
};

export function FinishedOrdersEmpty({ firstPageHref }: FinishedOrdersEmptyProps) {
  return (
    <AssignmentListEmpty
      testIdPrefix="finished-orders"
      message="No hay pedidos terminados en tu empresa."
      firstPageHref={firstPageHref}
    />
  );
}
