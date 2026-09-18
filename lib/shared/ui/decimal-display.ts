// lib/shared/ui/decimal-display.ts — Presentacion de decimales en TEXTO.
//
// Los decimales del contrato (`Decimal(14, 4)`) cruzan el borde como CADENA y llegan a la
// pantalla con su escala completa: «15.0000», «0.1255». Leerlos asi cuesta —«15.0000» no dice
// nada que «15» no diga, y cuatro decimales de relleno compiten por la atencion con los que si
// informan—. Este modulo es la capa de PRESENTACION de esa cadena, y solo eso.
//
// **Aqui no hay coma flotante.** Ni `parseFloat`, ni `Number(`, ni `.toFixed`, ni `Intl`: toda
// la conversion es de texto a `BigInt` y de vuelta a texto, igual que `order-decimal.ts`. Un
// `number` no puede redondear un decimal de cuatro cifras sin arriesgar el caso que justifica
// todo esto (0.1 + 0.2). La guardia `conversionesDeImporte` de `pedidos-convenciones.test.ts`
// prohibe esas cuatro formas en la ruta de pedidos; este archivo vive fuera de la ruta, pero
// se somete a la misma regla por el mismo motivo, no por el alcance del escaner.
//
// **Estas funciones NO tocan el dato que se envia.** Lo que se manda en el `FormData` sigue
// siendo lo que el usuario escribio; lo que se guarda sigue siendo lo que el contrato valido.
// Por eso hay DOS funciones y no una, con una diferencia que importa:
//
//   - `trimDecimal` no redondea: solo quita los ceros de relleno. Es la que se usa para
//     PRECARGAR un campo editable, donde el valor mostrado es el que se volvera a guardar.
//     Redondear ahi convertiria una linea de 0.1255 en 0.13 la proxima vez que alguien abra y
//     guarde la receta, sin avisar y sin que nadie lo pidiera.
//   - `formatDecimalDisplay` redondea a dos decimales y luego recorta. Es la que se usa para
//     PINTAR una celda de solo lectura, donde nada de lo mostrado vuelve a la base.

/** Un decimal en texto partido en entero escalado y escala: vale `unscaled / 10 ** scale`. */
type DecimalValue = {
  readonly unscaled: bigint;
  readonly scale: number;
};

const ZERO = BigInt(0);
const TWO = BigInt(2);
const TEN = BigInt(10);

/** Decimales que se muestran por defecto en una celda de solo lectura. */
export const DISPLAY_FRACTION_DIGITS = 2;

/** Decimal con signo opcional y, si hay parte decimal, al menos un digito a cada lado del punto. */
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

/** Texto decimal -> entero escalado, o `null` si el texto no es un decimal en notacion plana. */
function parseDecimal(value: string): DecimalValue | null {
  if (!DECIMAL_PATTERN.test(value)) return null;

  const [integerPart = '', fractionPart = ''] = value.split('.');
  return {
    unscaled: BigInt(`${integerPart}${fractionPart}`),
    scale: fractionPart.length,
  };
}

/**
 * Entero escalado -> texto canonico: sin ceros de relleno a la derecha, sin punto suelto y con
 * `0` para el cero. El signo viaja dentro del `BigInt`, asi que no se gestiona aparte.
 */
function formatDecimal({ unscaled, scale }: DecimalValue): string {
  if (unscaled === ZERO) return '0';

  const digits = (unscaled < ZERO ? -unscaled : unscaled).toString().padStart(scale + 1, '0');
  const cut = digits.length - scale;
  const integerPart = digits.slice(0, cut);
  const fractionPart = digits.slice(cut);

  // Recorte de ceros finales con un bucle y no con `.replace`: la guardia R39 de la ruta de
  // pedidos prohibe reescribir una linea de importe con un patron, y el bucle hace lo mismo
  // sin necesitarlo.
  let end = fractionPart.length;
  while (end > 0 && fractionPart[end - 1] === '0') {
    end -= 1;
  }
  const fraction = fractionPart.slice(0, end);

  const sign = unscaled < ZERO ? '-' : '';
  return fraction === '' ? `${sign}${integerPart}` : `${sign}${integerPart}.${fraction}`;
}

/**
 * Redondeo a `digits` decimales, al mas cercano y con el empate ALEJANDOSE DEL CERO —el
 * redondeo que la gente espera de «2 decimales»: 0.125 -> 0.13, -0.125 -> -0.13—. Con menos
 * decimales de los pedidos, el valor no se toca.
 */
function roundDecimal({ unscaled, scale }: DecimalValue, digits: number): DecimalValue {
  if (scale <= digits) return { unscaled, scale };

  const divisor = TEN ** BigInt(scale - digits);
  const quotient = unscaled / divisor;
  const remainder = unscaled % divisor;
  const doubled = (remainder < ZERO ? -remainder : remainder) * TWO;
  if (doubled < divisor) return { unscaled: quotient, scale: digits };

  const carry = unscaled < ZERO ? BigInt(-1) : BigInt(1);
  return { unscaled: quotient + carry, scale: digits };
}

/**
 * Quita los ceros de relleno de un decimal en texto SIN redondear: «15.0000» -> «15»,
 * «15.5000» -> «15.5», y «0.1255» se queda como esta. El valor sigue siendo exactamente el
 * mismo numero, escrito sin las cifras que no aportan.
 *
 * Un texto que no es un decimal en notacion plana se devuelve TAL CUAL. Es lo correcto para el
 * caso que lo provoca: un campo a medio teclear («12.», «», «-») no debe desaparecer ni
 * convertirse en otra cosa mientras el usuario escribe.
 */
export function trimDecimal(value: string): string {
  const parsed = parseDecimal(value);
  return parsed === null ? value : formatDecimal(parsed);
}

/**
 * Decimal listo para PINTAR: redondeado a `digits` decimales (dos por defecto) y sin ceros de
 * relleno. «15.0000» -> «15», «0.1255» -> «0.13», «39.79900» -> «39.8».
 *
 * Solo para celdas de solo lectura. Para precargar un campo editable, `trimDecimal`: lo que
 * aqui se redondea es el pixel, no el dato, y confundir las dos cosas reescribe la base.
 *
 * Igual que `trimDecimal`, un texto que no es un decimal en notacion plana sale tal cual.
 */
export function formatDecimalDisplay(
  value: string,
  digits: number = DISPLAY_FRACTION_DIGITS,
): string {
  const parsed = parseDecimal(value);
  return parsed === null ? value : formatDecimal(roundDecimal(parsed, digits));
}

/**
 * El valor EXACTO para poner en un `title`, o `undefined` cuando no hace falta porque lo pintado
 * ya es exacto.
 *
 * Redondear a dos decimales es correcto para leer una tabla, pero hay un caso en que se come una
 * senal: un restante de -0.001 se pinta «0», y ese cero dice justo lo contrario de lo que pasa.
 * Con esto, la cifra completa sigue estando a un hover de distancia y el redondeo no esconde
 * nada. Devuelve `undefined` -y no la cadena- para no ensuciar el DOM con un `title` que repite
 * lo que ya se ve.
 */
export function exactDecimalTitle(
  value: string,
  digits: number = DISPLAY_FRACTION_DIGITS,
): string | undefined {
  const exact = trimDecimal(value);
  return exact === formatDecimalDisplay(value, digits) ? undefined : exact;
}

