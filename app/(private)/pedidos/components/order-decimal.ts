// app/(private)/pedidos/components/order-decimal.ts — Aritmetica de decimales en TEXTO.
//
// La columna «cantidad requerida» de la tabla de ingredientes multiplica la cantidad de la
// linea de receta por la cantidad escrita en el formulario, y la de «restante» resta ese
// resultado al stock del producto. Todos son DECIMALES EN CADENA —
// `decimal(14,4)`, el criterio de R39—, y un `number` no puede multiplicar ni restar dos de
// esos sin riesgo de redondeo (0.1 * 0.2 = 0.020000000000000004). Mismo patron que la
// conversion de cantidades de `lib/modules/unidades`: aritmetica con `BigInt` sobre enteros
// escalados, sin ninguna dependencia nueva.
//
// Esta funcion NO se usa para el envio: el `FormData` sigue llevando la cantidad TAL CUAL se
// escribio, y lo que aqui se calcula es solo presentacion. Es un numero de consulta, no un
// campo del pedido.
//
// Reglas de la ruta (R39): este archivo NO usa `parseFloat`, ni `.toFixed`, ni `Number(` ni
// `.replace(` sobre importes — la guardia `conversionesDeImporte` de
// `pedidos-convenciones.test.ts` escanea TODOS los archivos de la ruta y prohibe esas cuatro
// formas. Toda la conversion es de texto a `BigInt` y de vuelta a texto.

/** Un decimal en texto partido en entero escalado y escala: vale `unscaled / 10 ** scale`. */
type DecimalValue = {
  readonly unscaled: bigint;
  readonly scale: number;
};

const ZERO = BigInt(0);

/** Decimal con signo opcional y, si hay parte decimal, al menos un digito a cada lado del punto. */
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

/**
 * Texto decimal -> entero escalado. Devuelve `null` (y no lanza) cuando el texto no es un
 * decimal valido: la columna se muestra por la cantidad que el usuario pudo teclear a medias,
 * y un fallo de conversion ahi se pinta como `0`, no tumba el panel.
 */
function parseDecimal(value: string): DecimalValue | null {
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) return null;

  const [integerPart = '', fractionPart = ''] = trimmed.split('.');
  return {
    unscaled: BigInt(`${integerPart}${fractionPart}`),
    scale: fractionPart.length,
  };
}

/**
 * Entero escalado -> texto canonico: sin ceros de relleno a la derecha, sin punto suelto y
 * con `0` para el cero. `-` viaja dentro del `BigInt`, asi que el signo no se gestiona aparte.
 */
function formatDecimal({ unscaled, scale }: DecimalValue): string {
  if (unscaled === ZERO) return '0';

  const digits = (unscaled < ZERO ? -unscaled : unscaled).toString().padStart(scale + 1, '0');
  const cut = digits.length - scale;
  const integerPart = digits.slice(0, cut);
  const fractionPart = digits.slice(cut);

  // Recorte de ceros finales SIN `.replace`: la guardia R39 de la ruta lo prohibe sobre una
  // linea de importe, y un bucle lo hace sin patron.
  let end = fractionPart.length;
  while (end > 0 && fractionPart[end - 1] === '0') {
    end -= 1;
  }
  const fraction = fractionPart.slice(0, end);

  const sign = unscaled < ZERO ? '-' : '';
  return fraction === '' ? `${sign}${integerPart}` : `${sign}${integerPart}.${fraction}`;
}

/**
 * Producto de dos decimales en texto, con aritmetica exacta de enteros escalados:
 * `(a / 10^sa) * (b / 10^sb) = (a * b) / 10^(sa + sb)`. El resultado no se recorta a ninguna
 * escala fija: sale con todas sus cifras y sin ceros de relleno.
 *
 * Un operando que no es un decimal valido devuelve `'0'` (no lanza): es la senal de «aun no
 * hay cantidad que escalar», y quien la pinta decide como mostrarla.
 */
export function multiplyDecimal(a: string, b: string): string {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  if (left === null || right === null) return '0';

  return formatDecimal({
    unscaled: left.unscaled * right.unscaled,
    scale: left.scale + right.scale,
  });
}

/**
 * Resta de dos decimales en texto, con la misma aritmetica exacta que `multiplyDecimal`:
 * alinea las escalas a la mayor y resta los enteros escalados. El signo viaja dentro del
 * `BigInt` y `formatDecimal` lo pinta; un resultado negativo sale con `-` delante y la
 * columna de restante lo resalta en rojo.
 *
 * Un operando que no es un decimal valido devuelve `'0'` (no lanza), misma regla que la
 * multiplicacion.
 */
export function subtractDecimal(a: string, b: string): string {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  if (left === null || right === null) return '0';

  const scale = Math.max(left.scale, right.scale);
  const power = (digits: number): bigint => BigInt(10) ** BigInt(digits);
  const leftUnscaled = left.unscaled * power(scale - left.scale);
  const rightUnscaled = right.unscaled * power(scale - right.scale);

  return formatDecimal({ unscaled: leftUnscaled - rightUnscaled, scale });
}
/**
 * Cociente de dos decimales en texto, truncado a `scale` decimales. `null` si un operando no es
 * un decimal valido o el divisor es cero.
 */
export function divideDecimal(a: string, b: string, scale: number): string | null {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  if (left === null || right === null || right.unscaled === ZERO) return null;

  const power = (digits: number): bigint => BigInt(10) ** BigInt(digits);
  const unscaled =
    (left.unscaled * power(right.scale + scale)) / (right.unscaled * power(left.scale));
  return formatDecimal({ unscaled, scale });
}
