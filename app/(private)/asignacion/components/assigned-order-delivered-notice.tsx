export const ASSIGNED_ORDER_DELIVERED_TESTID = 'assigned-order-delivered-notice';

/** Funcion y no literal, para que un test no pueda comparar contra una copia del texto. */
export function assignedOrderDeliveredNoticeText(orderNumber: string): string {
  return `Pedido ${orderNumber} entregado`;
}

export function AssignedOrderDeliveredNotice({
  orderNumber,
}: {
  readonly orderNumber: string;
}) {
  return (
    <p
      role="status"
      data-testid={ASSIGNED_ORDER_DELIVERED_TESTID}
      className="rounded-lg border border-emerald-400/40 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
    >
      {assignedOrderDeliveredNoticeText(orderNumber)}
    </p>
  );
}
