/**
 * Aritmetica de los dos importes del alta, la que el panel hace mientras se teclea.
 *
 * El dominio deriva el costo unitario a 4 decimales, la escala de la columna. Esto es otra cosa:
 * lo que el panel rellena y deja escribir, a 2. Son dos escalas con dos duenos, no el mismo
 * calculo parametrizado, y por eso el archivo vive junto a la pantalla y no en el modulo.
 *
 * El importe entra como cadena, se escala a entero exacto y sale como cadena: nunca pasa por el
 * binario de coma flotante. La cantidad si es `number`, y puede serlo: es un entero, no un importe.
 */

import { trimDecimal } from '@/lib/shared/ui/decimal-display';

/** Decimales que el panel deja escribir y con los que rellena el importe derivado. */
export const COST_INPUT_SCALE = 2;

/**
 * Enteros que admite la columna. Un derivado que se pase de ahi no se rellena: seria un valor que
 * el servidor rechaza y que nadie puede corregir en su propio campo.
 */
const MAX_WHOLE_DIGITS = 10;

/** `BigInt(...)` y no literales `0n`: el `target` del repo es `ES2017` y `tsc` los rechaza. */
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

const SCALE_FACTOR = BigInt('1' + '0'.repeat(COST_INPUT_SCALE));

/**
 * Admite el punto final sin decimales (`'12.'`), que es lo que hay en el campo justo despues de
 * teclearlo. Sin eso, el otro importe parpadearia a vacio en mitad de la escritura.
 */
const TYPED_AMOUNT_PATTERN = /^\d{1,10}(\.\d{0,2})?$/;

function toScaledInteger(amount: string): bigint | null {
  if (!TYPED_AMOUNT_PATTERN.test(amount)) return null;
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole + fraction.padEnd(COST_INPUT_SCALE, '0'));
}

/**
 * Sale sin ceros de relleno: `1500n` da `'15'`, no `'15.00'`. El `.00` no informa y se lee como
 * una precision que no hay; el numero es el mismo y el esquema acepta las dos formas.
 *
 * `null` cuando la parte entera ya no cabe en la columna.
 */
function fromScaledInteger(scaled: bigint): string | null {
  const whole = scaled / SCALE_FACTOR;
  if (whole.toString().length > MAX_WHOLE_DIGITS) return null;

  const fraction = scaled % SCALE_FACTOR;
  return trimDecimal(`${whole}.${fraction.toString().padStart(COST_INPUT_SCALE, '0')}`);
}

/**
 * Deja en el campo solo lo que puede ser un decimal SIN SIGNO, asi que no se puede escribir texto.
 *
 * La coma se convierte en punto en vez de descartarse: es el separador del teclado en castellano y
 * tirarla dejaria `150,00` en `15000`, cien veces el importe y en silencio.
 *
 * Lo tecleado no se recorta ni se redondea: reescribir el campo bajo el cursor mueve el punto de
 * insercion, y redondear cambiaria el digito que la persona acaba de escribir. Se recorta a
 * `scale` decimales -no menos, no mas de lo que ninguna columna decimal del modulo admite-.
 */
function sanitizeUnsignedDecimalInput(raw: string, scale: number): string {
  const onlyAmountCharacters = raw.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const [whole = '', ...afterFirstDot] = onlyAmountCharacters.split('.');

  // Un punto de mas no corta el importe: `'12.3.4'` queda en `'12.34'`, y teclear el punto dos
  // veces no borra lo ya escrito.
  const hasDot = afterFirstDot.length > 0;
  const head = (whole === '' && hasDot ? '0' : whole).slice(0, MAX_WHOLE_DIGITS);

  if (!hasDot) return head;
  return `${head}.${afterFirstDot.join('').slice(0, scale)}`;
}

/** Los dos importes del panel: siempre a `COST_INPUT_SCALE` (2) decimales. */
export function sanitizeCostInput(raw: string): string {
  return sanitizeUnsignedDecimalInput(raw, COST_INPUT_SCALE);
}

/** Escala de la columna decimal del modulo (`decimal(14,4)`): existencia y alerta de cantidad. */
export const QUANTITY_INPUT_SCALE = 4;

/** La existencia del alta y la alerta de cantidad: sin signo, a los 4 decimales de la columna. */
export function sanitizeQuantityInput(raw: string): string {
  return sanitizeUnsignedDecimalInput(raw, QUANTITY_INPUT_SCALE);
}

/** Cantidad admitida por los dos importes: la existencia del lote, decimal de hasta 4 cifras. */
const QUANTITY_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

/** Escala de la existencia (`decimal(14,4)`), para escalar la cantidad a entero exacto. */
const QUANTITY_SCALE_FACTOR = BigInt('1' + '0'.repeat(4));

/** `null` cuando la cadena no es una cantidad valida, o vale cero: nada que multiplicar o dividir. */
function toScaledQuantity(quantity: string): bigint | null {
  if (!QUANTITY_PATTERN.test(quantity)) return null;
  const [whole, fraction = ''] = quantity.split('.');
  const scaled = BigInt(whole + fraction.padEnd(4, '0'));
  return scaled === ZERO ? null : scaled;
}

/** Cociente redondeado MITAD ARRIBA, para dos operandos no negativos. */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const rest = numerator % denominator;
  return rest * TWO >= denominator ? quotient + ONE : quotient;
}

/**
 * Costo total = costo unitario x cantidad, redondeado a 2 decimales mitad arriba.
 *
 * `null` cuando no hay total que escribir: sin cantidad utilizable, sin importe con forma todavia,
 * en cero, o si el producto se sale de la columna. Quien llama vacia el campo, porque un total
 * obsoleto engana mas que uno en blanco.
 */
export function multiplyCost(unitCost: string, quantity: string): string | null {
  const scaledQuantity = toScaledQuantity(quantity);
  if (scaledQuantity === null) return null;

  const scaled = toScaledInteger(unitCost);
  if (scaled === null || scaled === ZERO) return null;

  const rounded = divideRoundHalfUp(scaled * scaledQuantity, QUANTITY_SCALE_FACTOR);
  return rounded === ZERO ? null : fromScaledInteger(rounded);
}

/**
 * Costo unitario = costo total / cantidad, redondeado a 2 decimales mitad arriba.
 *
 * Tambien devuelve `null` cuando el resultado redondea a cero: ahi el campo se deja vacio y no en
 * `0`, porque vacio significa «deducelo tu» y el servidor lo deriva a 4 decimales, donde un
 * importe que aqui se pierde todavia sale (`0.01 / 5` es `0` a dos decimales y `0.0020` a cuatro).
 */
export function divideCost(totalCost: string, quantity: string): string | null {
  const scaledQuantity = toScaledQuantity(quantity);
  if (scaledQuantity === null) return null;

  const scaled = toScaledInteger(totalCost);
  if (scaled === null || scaled === ZERO) return null;

  const rounded = divideRoundHalfUp(scaled * QUANTITY_SCALE_FACTOR, scaledQuantity);
  return rounded === ZERO ? null : fromScaledInteger(rounded);
}
