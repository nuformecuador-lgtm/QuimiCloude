/**
 * El reparto entero de un pedido, todas sus lineas en orden de alta. Sin `'use client'` y sin
 * hooks: lo usan tanto la columna de una tabla de cliente como una pantalla de servidor.
 *
 * El nombre de cada linea sigue el criterio de `OrderDistributionLabel`: el envase y, si una linea
 * antigua no lo tiene, la presentacion.
 */

export type OrderDistributionFullLine = {
  readonly presentationId: string;
  readonly presentationName: string | null;
  readonly packagingName?: string | null;
  readonly packages: number;
};

export type OrderDistributionFullProps = {
  /** En orden de alta. */
  readonly lines: readonly OrderDistributionFullLine[];
};

export const ORDER_DISTRIBUTION_FULL_TESTID = 'order-distribution-full';
export const ORDER_DISTRIBUTION_FULL_SEPARATOR = ' / ';

const EMPTY_TEXT = 'Sin presentación';
const MISSING_NAME_MARK = '—';

export function orderDistributionFullText(lines: readonly OrderDistributionFullLine[]): string {
  if (lines.length === 0) return EMPTY_TEXT;
  return lines
    .map(
      (line) =>
        `${line.packages} × ${line.packagingName ?? line.presentationName ?? MISSING_NAME_MARK}`,
    )
    .join(ORDER_DISTRIBUTION_FULL_SEPARATOR);
}

export function OrderDistributionFull({ lines }: OrderDistributionFullProps) {
  return (
    <span
      data-testid={ORDER_DISTRIBUTION_FULL_TESTID}
      data-empty={lines.length === 0 ? 'true' : undefined}
    >
      {orderDistributionFullText(lines)}
    </span>
  );
}
