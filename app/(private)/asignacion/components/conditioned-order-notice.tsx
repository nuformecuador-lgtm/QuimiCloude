export const CONDITIONED_ORDER_NOTICE_TESTID = 'conditioned-order-notice';

export function conditionedOrderNoticeText(orderNumber: string): string {
  return `Pedido ${orderNumber} acondicionado`;
}

/** Se pinta en «Por acondicionar» al volver de Terminar, con el número que trae la URL. */
export function ConditionedOrderNotice({ orderNumber }: { readonly orderNumber: string }) {
  return (
    <p
      role="status"
      data-testid={CONDITIONED_ORDER_NOTICE_TESTID}
      className="rounded-lg border border-emerald-400/40 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
    >
      {conditionedOrderNoticeText(orderNumber)}
    </p>
  );
}
