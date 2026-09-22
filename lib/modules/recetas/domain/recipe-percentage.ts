// lib/modules/recetas/domain/recipe-percentage.ts — Aritmetica del porcentaje, en texto.
//
// Puro: sin Prisma, sin framework, sin `number` ni `Intl` en ningun paso (redondeo de coma
// flotante y separador dependiente de la configuracion regional, respectivamente). Publicado
// por el barrel del modulo: lo consumen recetas, pedidos y asignaciones.

const ZERO = BigInt(0);
const TEN = BigInt(10);

export const RECIPE_TOTAL_PERCENTAGE = '100.00';

/** Hasta 3 enteros y hasta 2 decimales, sin signo. */
export const PERCENTAGE_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

function pow10(exponent: number): bigint {
  return TEN ** BigInt(exponent);
}

/** Centesimas exactas de un porcentaje que ya casa con `PERCENTAGE_PATTERN`. */
function toHundredths(value: string): bigint {
  const [integerPart, fractionPart = ''] = value.split('.');
  const unscaled = BigInt(`${integerPart}${fractionPart}`);
  return unscaled * pow10(2 - fractionPart.length);
}

/** Centesimas exactas de un porcentaje valido ("97.5" -> 9750n), o `null` si no casa el patron. */
export function percentageToHundredths(value: string): bigint | null {
  if (!PERCENTAGE_PATTERN.test(value)) return null;
  return toHundredths(value);
}

/** Centesimas -> texto con exactamente 2 decimales, con signo si es negativo. */
function formatHundredths(hundredths: bigint): string {
  const negative = hundredths < ZERO;
  const digits = (negative ? -hundredths : hundredths).toString().padStart(3, '0');
  const cut = digits.length - 2;
  const sign = negative ? '-' : '';
  return `${sign}${digits.slice(0, cut)}.${digits.slice(cut)}`;
}

export type PercentageTotal = {
  readonly total: string;
  readonly difference: string;
  readonly isComplete: boolean;
};

/** Suma de las lineas; las que no casan el patron no suman (el formulario las marca aparte). */
export function sumPercentages(values: readonly string[]): PercentageTotal {
  const totalHundredths = values.reduce((sum, value) => {
    const hundredths = percentageToHundredths(value);
    return hundredths === null ? sum : sum + hundredths;
  }, ZERO);

  const targetHundredths = toHundredths(RECIPE_TOTAL_PERCENTAGE);

  return {
    total: formatHundredths(totalHundredths),
    difference: formatHundredths(targetHundredths - totalHundredths),
    isComplete: totalHundredths === targetHundredths,
  };
}

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

/** Decimal en texto partido en entero escalado y escala. */
function parseDecimal(value: string): { unscaled: bigint; scale: number } | null {
  if (!DECIMAL_PATTERN.test(value)) return null;
  const [integerPart, fractionPart = ''] = value.replace('-', '').split('.');
  const negative = value.startsWith('-');
  const unscaled = BigInt(`${integerPart}${fractionPart}`);
  return { unscaled: negative ? -unscaled : unscaled, scale: fractionPart.length };
}

/** Entero escalado -> texto, sin ceros de relleno a la derecha ni punto suelto. */
function formatScaled(unscaled: bigint, scale: number): string {
  if (scale === 0) return unscaled.toString();

  const negative = unscaled < ZERO;
  const digits = (negative ? -unscaled : unscaled).toString().padStart(scale + 1, '0');
  const cut = digits.length - scale;
  const integerPart = digits.slice(0, cut);
  const fractionPart = digits.slice(cut);

  let end = fractionPart.length;
  while (end > 0 && fractionPart[end - 1] === '0') {
    end -= 1;
  }
  const sign = negative ? '-' : '';
  const fraction = fractionPart.slice(0, end);
  return fraction === '' ? `${sign}${integerPart}` : `${sign}${integerPart}.${fraction}`;
}

/**
 * Cantidad del pedido x porcentaje / 100, exacta. `percentage` viaja en centesimas (escala 2) y
 * expresa un tanto por ciento, asi que convertirlo a fraccion suma otras 2 a la escala: el
 * producto final tiene escala `s + 4` y dividir entre 100 no hace ninguna division real.
 */
export function consumedQuantity(orderQuantity: string, percentage: string): string {
  const quantity = parseDecimal(orderQuantity);
  const hundredths = percentageToHundredths(percentage);
  if (quantity === null || hundredths === null) return '0';

  return formatScaled(quantity.unscaled * hundredths, quantity.scale + 4);
}

/** "12.5" -> "12,50". Coma y exactamente 2 decimales; sin " %" (lo pone quien pinta). */
export function formatPercentage(value: string): string {
  const parsed = parseDecimal(value);
  if (parsed === null) return value;

  const negative = parsed.unscaled < ZERO;
  const digits = (negative ? -parsed.unscaled : parsed.unscaled).toString();
  const scaled = digits.padStart(parsed.scale + 1, '0');
  const cut = scaled.length - parsed.scale;
  const integerPart = scaled.slice(0, cut);
  const fractionPart = scaled.slice(cut).padEnd(2, '0').slice(0, 2);

  const sign = negative ? '-' : '';
  return `${sign}${integerPart},${fractionPart}`;
}
