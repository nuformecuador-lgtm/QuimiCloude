import { exactDecimalTitle, formatDecimalDisplay } from '@/lib/shared/ui/decimal-display';

/** Simbolo fijo del importe que pinta el bloque de coste. */
export const ORDER_AMOUNT_SYMBOL = '$';

/**
 * Agrupa un entero (en texto) de tres en tres con comas, con un bucle sobre `slice` y sin
 * `.replace` ni expresion regular: la ruta de pedidos prohibe reescribir un importe con un
 * patron.
 */
function groupThousands(digits: string): string {
  const groups: string[] = [];
  let end = digits.length;
  while (end > 3) {
    groups.unshift(digits.slice(end - 3, end));
    end -= 3;
  }
  groups.unshift(digits.slice(0, end));
  return groups.join(',');
}

/**
 * Un decimal en texto -> `$ 1,234,567.50`. Redondea con el mismo redondeo que ya usa la ruta
 * (`formatDecimalDisplay`, empate lejos del cero, `BigInt`) y agrupa el resultado; nunca pasa
 * por `number`.
 */
export function formatOrderAmount(value: string): string {
  const rounded = formatDecimalDisplay(value, 2);
  const [integerPart = '0', fractionPart = ''] = rounded.split('.');
  const fraction = fractionPart.padEnd(2, '0');
  return `${ORDER_AMOUNT_SYMBOL} ${groupThousands(integerPart)}.${fraction}`;
}

/** El valor exacto para el `title`, o `undefined` cuando lo pintado ya coincide. */
export function orderAmountTitle(value: string): string | undefined {
  return exactDecimalTitle(value);
}
