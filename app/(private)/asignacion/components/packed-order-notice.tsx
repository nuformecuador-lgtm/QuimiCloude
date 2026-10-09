export const PACKED_ORDER_NOTICE_TESTID = 'packed-order-notice';

/** Funcion y no literal, para que un test no pueda comparar contra una copia del texto. */
export function packedOrderNoticeText(orderNumber: string): string {
  return `Pedido ${orderNumber} empacado`;
}

/**
 * Confirmación de Terminar en la pestaña «Por empacar»: `finishPackingAction` redirige a
 * `?vista=por_empacar&empacado=<numero>` y esta seccion pinta el aviso al aterrizar.
 */
export function PackedOrderNotice({ orderNumber }: { readonly orderNumber: string }) {
  return (
    <p
      role="status"
      data-testid={PACKED_ORDER_NOTICE_TESTID}
      className="rounded-lg border border-emerald-400/40 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
    >
      {packedOrderNoticeText(orderNumber)}
    </p>
  );
}
