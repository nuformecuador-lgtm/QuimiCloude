export const ASSIGNED_ORDER_DELIVERED_TESTID = 'assigned-order-delivered-notice';

/** Funcion y no literal, para que un test no pueda comparar contra una copia del texto. */
export function assignedOrderDeliveredNoticeText(orderNumber: string): string {
  return `Pedido ${orderNumber} por empacar`;
}

/**
 * Cuando el Finalizar trae cuantos envases enteros entraron y el nombre del
 * producto terminado que los recibio, el aviso lo dice; sin esos dos datos -una URL de antes-,
 * se queda con el texto de siempre.
 */
export function assignedOrderDeliveredWithPackagesText(
  orderNumber: string,
  packages: string,
  productName: string,
): string {
  const count = Number(packages);
  const unit = count === 1 ? 'envase' : 'envases';
  return `${assignedOrderDeliveredNoticeText(orderNumber)}. Entraron ${packages} ${unit} de ${productName}.`;
}

export function AssignedOrderDeliveredNotice({
  orderNumber,
  packages,
  productName,
}: {
  readonly orderNumber: string;
  readonly packages?: string;
  readonly productName?: string;
}) {
  const text =
    packages !== undefined && productName !== undefined
      ? assignedOrderDeliveredWithPackagesText(orderNumber, packages, productName)
      : assignedOrderDeliveredNoticeText(orderNumber);

  return (
    <p
      role="status"
      data-testid={ASSIGNED_ORDER_DELIVERED_TESTID}
      className="rounded-lg border border-emerald-400/40 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
    >
      {text}
    </p>
  );
}
