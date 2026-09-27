// lib/modules/pedidos/domain/order-distribution.ts — R5-R8, R35, R36, R42.
//
// Dominio PURO: sin Prisma, sin framework, sin reloj. `validateDistribution` es la unica regla
// del reparto contra el total del pedido (design.md > 2.2 bis): cuanto queda disponible, o el
// primer fallo. La llaman `createOrder`, `updateOrder` y `updateOrderPresentationLines`, cada
// una dentro de su propia transaccion con la fila del pedido bloqueada -esta funcion no bloquea
// nada, solo calcula sobre lo que quien llama ya releyo.

import { convertQuantity, IncompatibleUnitsError, type UnitConversion } from '@/lib/modules/unidades';

/** Una linea del reparto, con su presentacion ya resuelta: el contenido copiado (o vigente,
 *  `null` si falta, R35) y la conversion de la unidad de esa presentacion. */
export type DistributionLine = {
  readonly presentationId: string;
  /** Entero positivo (R1): validado rio arriba, esta funcion no lo repite. */
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

function addDecimals(a: Scaled, b: Scaled): Scaled {
  const scale = Math.max(a.scale, b.scale);
  return { unscaled: rescale(a, scale) + rescale(b, scale), scale };
}

function subtractDecimals(a: Scaled, b: Scaled): Scaled {
  const scale = Math.max(a.scale, b.scale);
  return { unscaled: rescale(a, scale) - rescale(b, scale), scale };
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
 * Cuanto queda disponible (R6) o el primer fallo, en el orden de `design.md > 4.2`:
 * `without_unit` (R42, sin unidad no hay a que convertir) -> por cada linea, en el orden dado,
 * `presentation_without_content` (R35) o `incompatible_units` (R7) -> `exceeds_quantity` (R36)
 * si la suma convertida pasa de `quantity`. Igual o menor SI se acepta (R8): `available` puede
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

  let total: Scaled = { unscaled: BigInt(0), scale: 0 };
  for (const line of lines) {
    if (line.content === null) {
      return { kind: 'presentation_without_content', presentationId: line.presentationId };
    }

    const lineQuantity = multiplyByPackages(parseDecimal(line.content), line.packages);

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

  const available = subtractDecimals(parseDecimal(quantity), total);
  if (available.unscaled < BigInt(0)) {
    return { kind: 'exceeds_quantity', available: formatDecimal(available) };
  }
  return { kind: 'ok', available: formatDecimal(available) };
}
