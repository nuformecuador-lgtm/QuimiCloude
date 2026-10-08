// lib/modules/pedidos/domain/order-distribution.ts
//
// Dominio PURO: sin Prisma, sin framework, sin reloj. `validateDistribution` es la unica regla
// del reparto contra el total del pedido: cuanto queda disponible, o el
// primer fallo. La llaman `createOrder`, `updateOrder` y `updateOrderPresentationLines`, cada
// una dentro de su propia transaccion con la fila del pedido bloqueada -esta funcion no bloquea
// nada, solo calcula sobre lo que quien llama ya releyo.

import { convertQuantity, IncompatibleUnitsError, type UnitConversion } from '@/lib/modules/unidades';

/** Una linea del reparto, con su presentacion ya resuelta: el contenido copiado (o vigente,
 *  `null` si falta) y la conversion de la unidad de esa presentacion. */
export type DistributionLine = {
  readonly presentationId: string;
  /** Entero positivo: validado rio arriba, esta funcion no lo repite. */
  readonly packages: number;
  readonly content: string | null;
  readonly unit: UnitConversion;
};

export type DistributionResult =
  | { readonly kind: 'ok'; readonly available: string }
  | { readonly kind: 'without_unit' }
  | { readonly kind: 'presentation_without_content'; readonly presentationId: string }
  | { readonly kind: 'incompatible_units'; readonly presentationId: string }
  | { readonly kind: 'exceeds_quantity'; readonly available: string };

/** Un decimal partido en entero escalado y escala: vale `unscaled / 10 ** scale`. A diferencia
 *  de `finished-goods.ts` (siempre `decimal(14,4)`), aqui la escala varia: `convertQuantity`
 *  puede devolver hasta doce decimales (`CONVERSION_SCALE`) cuando la division no termina. */
type Scaled = { readonly unscaled: bigint; readonly scale: number };

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

/** Solo lo llaman valores que ya pasaron por `convertQuantity` o que vienen de una columna
 *  `decimal`: si no tienen esta forma, es un error de programacion, no una entrada de usuario. */
function parseDecimal(raw: string): Scaled {
  if (!DECIMAL_PATTERN.test(raw)) {
    throw new Error(`order-distribution: no es un decimal valido: ${JSON.stringify(raw)}`);
  }
  const [integerPart = '', fractionPart = ''] = raw.split('.');
  const negative = integerPart.startsWith('-');
  const digits = negative ? integerPart.slice(1) : integerPart;
  const unscaled = BigInt(`${digits}${fractionPart}`);
  return { unscaled: negative ? -unscaled : unscaled, scale: fractionPart.length };
}

function rescale(value: Scaled, scale: number): bigint {
  if (value.scale === scale) return value.unscaled;
  return value.unscaled * BigInt(10) ** BigInt(scale - value.scale);
}

/** Igualdad numerica de dos decimales en texto, sin importar los ceros de la parte decimal:
 *  `"10"` y `"10.0000"` son iguales. */
export function sameDecimal(a: string, b: string): boolean {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  const scale = Math.max(left.scale, right.scale);
  return rescale(left, scale) === rescale(right, scale);
}

function addDecimals(a: Scaled, b: Scaled): Scaled {
  const scale = Math.max(a.scale, b.scale);
  return { unscaled: rescale(a, scale) + rescale(b, scale), scale };
}

function subtractDecimals(a: Scaled, b: Scaled): Scaled {
  const scale = Math.max(a.scale, b.scale);
  return { unscaled: rescale(a, scale) - rescale(b, scale), scale };
}

/** Misma escala que devolveria `convertQuantity`, para que no convertir una linea no cambie
 *  el texto del disponible. */
function withoutTrailingZeros(value: Scaled): Scaled {
  let { unscaled, scale } = value;
  const ten = BigInt(10);
  while (scale > 0 && unscaled % ten === BigInt(0)) {
    unscaled /= ten;
    scale -= 1;
  }
  return { unscaled, scale };
}

/** `envases * contenido`, exacto: `packages` es entero, asi que multiplicar no cambia la escala
 *  del contenido. */
function multiplyByPackages(content: Scaled, packages: number): Scaled {
  return { unscaled: content.unscaled * BigInt(packages), scale: content.scale };
}

function formatDecimal(value: Scaled): string {
  const negative = value.unscaled < BigInt(0);
  const magnitude = negative ? -value.unscaled : value.unscaled;
  if (value.scale === 0) {
    return `${negative ? '-' : ''}${magnitude.toString()}`;
  }
  const digits = magnitude.toString().padStart(value.scale + 1, '0');
  const cut = digits.length - value.scale;
  return `${negative ? '-' : ''}${digits.slice(0, cut)}.${digits.slice(cut)}`;
}

/**
 * Cuanto queda disponible o el primer fallo, en este orden:
 * `without_unit` (sin unidad no hay a que convertir) -> por cada linea, en el orden dado,
 * `presentation_without_content` o `incompatible_units` -> `exceeds_quantity`
 * si la suma convertida pasa de `quantity`. Igual o menor SI se acepta: `available` puede
 * ser `'0'`.
 */
export function validateDistribution(
  quantity: string,
  orderUnit: UnitConversion | null,
  lines: readonly DistributionLine[],
): DistributionResult {
  if (orderUnit === null) {
    return { kind: 'without_unit' };
  }

  const summed = sumInOrderUnit(orderUnit, lines);
  if (summed.kind !== 'ok') return summed;

  const available = subtractDecimals(parseDecimal(quantity), parseDecimal(summed.total));
  if (available.unscaled < BigInt(0)) {
    return { kind: 'exceeds_quantity', available: formatDecimal(available) };
  }
  return { kind: 'ok', available: formatDecimal(available) };
}

export type SumInOrderUnitResult =
  | { readonly kind: 'ok'; readonly total: string }
  | { readonly kind: 'presentation_without_content'; readonly presentationId: string }
  | { readonly kind: 'incompatible_units'; readonly presentationId: string };

/**
 * Suma de `envases * contenido` de cada linea, pasada de la unidad de su presentacion a la del
 * pedido. La comparten el guardado del reparto y Terminar el empaque para que el total con el
 * que se valida y el total con el que se reparte el coste no puedan divergir. Una linea ya en la
 * unidad del pedido no se convierte. Se detiene en la primera linea sin contenido o
 * inconvertible, en el orden dado.
 */
export function sumInOrderUnit(orderUnit: UnitConversion, lines: readonly DistributionLine[]): SumInOrderUnitResult {
  let total: Scaled = { unscaled: BigInt(0), scale: 0 };
  for (const line of lines) {
    if (line.content === null) {
      return { kind: 'presentation_without_content', presentationId: line.presentationId };
    }

    const lineQuantity = multiplyByPackages(parseDecimal(line.content), line.packages);
    if (line.unit.id === orderUnit.id) {
      total = addDecimals(total, withoutTrailingZeros(lineQuantity));
      continue;
    }

    let converted: string;
    try {
      converted = convertQuantity(formatDecimal(lineQuantity), line.unit, orderUnit);
    } catch (error) {
      if (error instanceof IncompatibleUnitsError) {
        return { kind: 'incompatible_units', presentationId: line.presentationId };
      }
      throw error;
    }

    total = addDecimals(total, parseDecimal(converted));
  }
  return { kind: 'ok', total: formatDecimal(total) };
}
