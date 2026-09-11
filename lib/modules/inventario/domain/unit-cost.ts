/**
 * Derivacion del costo unitario a partir del costo total (R7, R9; `design.md > 5`).
 *
 * Esta es la UNICA operacion aritmetica sobre un importe en todo el repo: el resto de los
 * importes viajan como cadena decimal y la aritmetica la hace Postgres. Por eso se hace con
 * `BigInt` -del lenguaje- y no con una utilidad casera de decimales ni con una dependencia
 * nueva: `design.md > 5` evaluo la libreria de decimales y la descarto con argumento, y
 * `package.json` no cambia en QC-90.
 *
 * El importe NO se convierte a binario de coma flotante en ningun punto (R4,
 * `docs/architecture.md > Anti-patrones`): entra como cadena, se escala a entero exacto y
 * sale como cadena. `stock` si es `number`, y puede serlo sin riesgo: es un entero de
 * `z.number().int()`, no un importe.
 */

/** Decimales de `decimal(14,4)`: la escala con la que se guarda `product_batches.unit_cost`. */
const SCALE = 4;

/**
 * Las constantes enteras se construyen con `BigInt(...)` y NO con literales `0n`/`10n`: el
 * `target` del repo es `ES2017` y `tsc` rechaza el literal (TS2791). Cambiar el `target` por
 * este archivo seria una decision del repo entero, no de esta ficha.
 */
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

/** 10^SCALE como `BigInt`, el factor con el que un importe pasa a entero exacto. */
const SCALE_FACTOR = BigInt('1' + '0'.repeat(SCALE));

/** La forma exacta que `product-batch-input.ts` ya acepta: hasta 10 enteros y 4 decimales. */
const DECIMAL_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

/**
 * Cadena decimal -> entero escalado a 4 decimales. `'12.5'` -> `125000n`.
 *
 * Devuelve `null` en vez de lanzar cuando la cadena no tiene la forma acordada: quien llama
 * a esta funcion es el `superRefine` del esquema, y ahi una excepcion se veria como un fallo
 * del servidor en lugar de como el `invalid_input` que R4 exige.
 */
function toScaledInteger(amount: string): bigint | null {
  if (!DECIMAL_PATTERN.test(amount)) return null;
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole + fraction.padEnd(SCALE, '0'));
}

/** Entero escalado -> cadena `'d.dddd'`, siempre con sus cuatro decimales. */
function fromScaledInteger(scaled: bigint): string {
  const whole = scaled / SCALE_FACTOR;
  const fraction = scaled % SCALE_FACTOR;
  return `${whole}.${fraction.toString().padStart(SCALE, '0')}`;
}

/**
 * Division entera con redondeo MITAD ARRIBA. Los dos operandos son positivos, asi que
 * «mitad arriba» y «mitad lejos del cero» coinciden y no hace falta distinguirlos.
 *
 * El resto se compara duplicado (`rest * 2n >= divisor`) en vez de dividir por dos: sobre
 * enteros, dividir el divisor perderia el medio cuando es impar.
 */
function divideRoundingHalfUp(dividend: bigint, divisor: bigint): bigint {
  const quotient = dividend / divisor;
  const rest = dividend % divisor;
  return rest * TWO >= divisor ? quotient + ONE : quotient;
}

/**
 * Costo unitario = costo total / existencia, redondeado a 4 decimales (R7).
 *
 * Devuelve `null` cuando la division NO da un costo guardable:
 *  - el resultado redondea a `0.0000` (R9): la columna tiene `CHECK (unit_cost > 0)` y el
 *    esquema convierte ese `null` en un rechazo colgado del campo del costo total;
 *  - la existencia no es un entero de 1 o mas (R8, que el esquema rechaza antes, senalando
 *    el campo de la existencia);
 *  - el importe no tiene la forma de `decimal(14,4)` (R4, ya rechazado por el patron).
 */
export function deriveUnitCost(totalCost: string, stock: number): string | null {
  if (!Number.isInteger(stock) || stock < 1) return null;

  const scaledTotal = toScaledInteger(totalCost);
  if (scaledTotal === null) return null;

  const scaledUnitCost = divideRoundingHalfUp(scaledTotal, BigInt(stock));
  if (scaledUnitCost === ZERO) return null;

  return fromScaledInteger(scaledUnitCost);
}
