export const ASSIGNED_ORDER_CANCELLED_TESTID = 'assigned-order-cancelled-notice';

/** Funcion y no literal, para que un test no pueda comparar contra una copia del texto. */
export function assignedOrderCancelledNoticeText(orderNumber: string): string {
  return `Pedido ${orderNumber} cancelado`;
}

export function AssignedOrderCancelledNotice({ orderNumber }: { readonly orderNumber: string }) {
  return (
    <p
      role="status"
      data-testid={ASSIGNED_ORDER_CANCELLED_TESTID}
      className="rounded-lg border bg-muted p-3 text-sm font-medium text-foreground"
    >
      {assignedOrderCancelledNoticeText(orderNumber)}
    </p>
  );
}
