// lib/modules/inventario/domain/decimal-quantity.ts
//
// Dominio PURO: sin base de datos, sin framework, sin reloj. Las cantidades entran y salen como
// TEXTO, igual que `unidades/domain/convert-quantity.ts` y `inventario/domain/unit-cost.ts`: un
// `decimal(14,4)` no cabe en un `number` sin riesgo de redondeo binario. La aritmetica va con
// `BigInt` sobre enteros escalados a cuatro decimales, sin ninguna dependencia nueva.

const SCALE = 4;

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

type Scaled = { readonly unscaled: bigint; readonly scale: number };

function pow10(exponent: number): bigint {
  return TEN ** BigInt(exponent);
}

function parseDecimal(raw: string): Scaled {
  if (!DECIMAL_PATTERN.test(raw)) {
    throw new Error(`decimal-quantity: no es un decimal valido: ${JSON.stringify(raw)}`);
  }
  const [integerPart = '', fractionPart = ''] = raw.split('.');
  return { unscaled: BigInt(integerPart + fractionPart), scale: fractionPart.length };
}

/** Reescala a `SCALE`, TRUNCANDO si hay mas cifras de las que caben. Las cuatro operaciones
 *  basicas asumen cantidades ya guardadas en `decimal(14,4)`, asi que truncar aqui no pierde
 *  nada en su uso normal; `ceilToScale4` es la funcion que decide como se recorta cuando SI
 *  puede haber mas de cuatro decimales. */
function toScale(value: Scaled): bigint {
  if (value.scale === SCALE) return value.unscaled;
  if (value.scale < SCALE) return value.unscaled * pow10(SCALE - value.scale);
  return value.unscaled / pow10(value.scale - SCALE);
}

function formatScaled(unscaled: bigint): string {
  const negative = unscaled < ZERO;
  const magnitude = negative ? -unscaled : unscaled;
  const digits = magnitude.toString().padStart(SCALE + 1, '0');
  const cut = digits.length - SCALE;
  const sign = negative && unscaled !== ZERO ? '-' : '';
  return `${sign}${digits.slice(0, cut)}.${digits.slice(cut)}`;
}

/** Suma exacta de dos cantidades decimales de hasta cuatro decimales. */
export function addQuantities(a: string, b: string): string {
  return formatScaled(toScale(parseDecimal(a)) + toScale(parseDecimal(b)));
}

/** Resta exacta `a - b`; el resultado puede ser negativo. */
export function subtractQuantities(a: string, b: string): string {
  return formatScaled(toScale(parseDecimal(a)) - toScale(parseDecimal(b)));
}

/** `-1` si `a < b`, `1` si `a > b`, `0` si son el mismo valor. */
export function compareQuantities(a: string, b: string): -1 | 0 | 1 {
  const left = toScale(parseDecimal(a));
  const right = toScale(parseDecimal(b));
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** El menor de los dos, normalizado a cuatro decimales. */
export function minQuantity(a: string, b: string): string {
  return compareQuantities(a, b) <= 0 ? formatScaled(toScale(parseDecimal(a))) : formatScaled(toScale(parseDecimal(b)));
}

/**
 * Redondeo hacia arriba al cuarto decimal: nunca aparta menos de lo necesario. Pensada para una
 * cantidad no negativa que puede llegar con mas de cuatro decimales -una multiplicacion o una
 * conversion de unidades-; con cuatro o menos, no cambia nada.
 */
export function ceilToScale4(value: string): string {
  const parsed = parseDecimal(value);
  if (parsed.scale <= SCALE) return formatScaled(toScale(parsed));

  const divisor = pow10(parsed.scale - SCALE);
  const truncated = parsed.unscaled / divisor;
  const remainder = parsed.unscaled % divisor;
  return formatScaled(remainder === ZERO ? truncated : truncated + ONE);
}
