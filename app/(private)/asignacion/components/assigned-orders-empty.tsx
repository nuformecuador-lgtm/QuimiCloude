import { AssignmentListEmpty } from './assignment-list-parts';

type AssignedOrdersEmptyProps = {
  /** Presente solo si la pagina pedida se paso del total; ausente si no hay ningun pedido. */
  readonly firstPageHref?: string;
};

export function AssignedOrdersEmpty({ firstPageHref }: AssignedOrdersEmptyProps) {
  return (
    <AssignmentListEmpty
      testIdPrefix="assigned-orders"
      message="No tienes pedidos asignados en curso o pendientes."
      firstPageHref={firstPageHref}
    />
  );
}
