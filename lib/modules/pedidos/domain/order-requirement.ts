// lib/modules/pedidos/domain/order-requirement.ts
//
// Dominio puro: sin Prisma, sin framework, sin reloj. Multiplica cada linea de receta por la
// cantidad del pedido con aritmetica de cadenas exacta -sin escala interna fija, la escala del
// resultado es la suma de las dos-, para no perder ninguna cifra antes de que `inventario`
// convierta y redondee al repartir.

import type { ReservationRequirementLine } from '@/lib/modules/inventario';

/** Linea de receta con lo minimo que hace falta para calcular la necesidad. */
export type RequirementSourceLine = {
  readonly productId: string;
  readonly quantity: string;
  readonly unitId: string;
};

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

type Scaled = { readonly unscaled: bigint; readonly scale: number };

function parseDecimal(raw: string): Scaled {
  if (!DECIMAL_PATTERN.test(raw)) {
    throw new Error(`order-requirement: no es un decimal valido: ${JSON.stringify(raw)}`);
  }
  const [integerPart = '', fractionPart = ''] = raw.split('.');
  return { unscaled: BigInt(`${integerPart}${fractionPart}`), scale: fractionPart.length };
}

/** Producto exacto de dos decimales: la escala del resultado es la suma de las dos, sin truncar
 *  ni redondear ninguna cifra. */
function multiplyExact(a: Scaled, b: Scaled): Scaled {
  return { unscaled: a.unscaled * b.unscaled, scale: a.scale + b.scale };
}

function formatScaled({ unscaled, scale }: Scaled): string {
  if (scale === 0) return unscaled.toString();
  const negative = unscaled < BigInt(0);
  const magnitude = negative ? -unscaled : unscaled;
  const digits = magnitude.toString().padStart(scale + 1, '0');
  const cut = digits.length - scale;
  const sign = negative ? '-' : '';
  return `${sign}${digits.slice(0, cut)}.${digits.slice(cut)}`;
}

/** La necesidad de cada linea de receta para `orderQuantity` unidades del pedido, en la unidad
 *  de la propia linea. `inventario` es quien convierte a la unidad del producto y redondea. */
export function buildRequirement(
  lines: readonly RequirementSourceLine[],
  orderQuantity: string,
): readonly ReservationRequirementLine[] {
  const orderQuantityScaled = parseDecimal(orderQuantity);
  return lines.map((line) => ({
    productId: line.productId,
    unitId: line.unitId,
    quantity: formatScaled(multiplyExact(parseDecimal(line.quantity), orderQuantityScaled)),
  }));
}
