// lib/modules/unidades/domain/convert-quantity.ts — QC-76 (R22-R25).
//
// La conversion de una cantidad entre dos unidades que comparten unidad base. Es dominio
// PURO: sin base de datos, sin framework, sin estado, sin reloj y sin registro (R22). Nadie
// la llama todavia —decision cerrada 18, R26—: el contrato la publica y este archivo la
// implementa, y punto.
//
// Los decimales entran y salen como TEXTO, igual que hace `pedidos` con `quantity` y
// `unitPrice`: un `decimal(14,4)` no cabe en un `number` sin riesgo de redondeo y el dominio
// no puede importar el `Decimal` de `@prisma/client`
// (`docs/architecture.md > Anti-patrones`). La aritmetica va con `BigInt` sobre enteros
// escalados, sin ninguna dependencia nueva (R38, decision cerrada 26).
import { IncompatibleUnitsError, ValidationError } from './errors'
import type { UnitId } from './unit-catalog'

/**
 * Escala interna con la que se calcula el resultado CUANDO LA DIVISION NO TERMINA —el factor
 * de destino tiene algun divisor distinto de 2 y de 5, por ejemplo un `3.0000`— (R23,
 * decision cerrada del 2026-09-07).
 *
 * Doce, y el porque: la escala maxima que guarda hoy cualquier columna del ERP son CUATRO
 * decimales (`decimal(14,4)`, QC-33), asi que doce dejan OCHO DIGITOS DE MARGEN por debajo de
 * lo que cualquier consumidor vaya a mostrar. Vive aqui, con nombre, y no repartida por el
 * calculo: quien la cambie la cambia en un solo sitio.
 *
 * No se aplica cuando la division SI termina: en ese caso el resultado sale exacto, con todas
 * sus cifras, sin recortarlo a esta escala y sin rellenarlo con ceros.
 */
export const CONVERSION_SCALE = 12

/**
 * Lo que hace falta saber de una unidad para convertir. Deliberadamente NO es `UnitRef`: quien
 * convierte no necesita el nombre ni el simbolo.
 *
 * `baseUnitId` y `factor` van JUNTOS O NINGUNO (R2): una unidad base no declara ninguno de los
 * dos, y una derivada declara los dos. El factor dice cuantas unidades de la apuntada caben en
 * una de esta, en decimal y en TEXTO —nunca `number`—.
 */
export type UnitConversion = {
  readonly id: UnitId
  readonly baseUnitId: UnitId | null
  readonly factor: string | null
}

/** Un decimal partido en entero escalado y escala: vale `unscaled / 10 ** scale`. */
type DecimalValue = {
  readonly unscaled: bigint
  readonly scale: number
}

const ZERO = BigInt(0)
const ONE = BigInt(1)
const TWO = BigInt(2)
const FIVE = BigInt(5)
const TEN = BigInt(10)

/** Factor efectivo de una unidad base: una unidad base equivale a una unidad de si misma. */
const NEUTRAL: DecimalValue = { unscaled: ONE, scale: 0 }

/** Entero con signo opcional y, si hay parte decimal, al menos un digito a cada lado del punto. */
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/

function parseDecimal(raw: string, subject: string): DecimalValue {
  if (!DECIMAL_PATTERN.test(raw)) {
    throw new ValidationError(`${subject} no es un decimal valido: ${JSON.stringify(raw)}.`)
  }
  const [integerPart = '', fractionPart = ''] = raw.split('.')
  return { unscaled: BigInt(`${integerPart}${fractionPart}`), scale: fractionPart.length }
}

function pow10(exponent: number): bigint {
  return TEN ** BigInt(exponent)
}

function greatestCommonDivisor(a: bigint, b: bigint): bigint {
  let left = a
  let right = b
  while (right !== ZERO) {
    const rest = left % right
    left = right
    right = rest
  }
  return left
}

/** La base efectiva de una unidad: la que declara, o ella misma si no deriva de nadie. */
function effectiveBaseId(unit: UnitConversion): UnitId {
  return unit.baseUnitId ?? unit.id
}

/**
 * El factor efectivo de una unidad: el que declara, o `1` si es una unidad base. Aqui viven las
 * tres mitades de R25 que miran a la unidad: la pareja incompleta, el decimal invalido y el
 * factor que no es mayor que cero.
 */
function effectiveFactor(unit: UnitConversion, subject: string): DecimalValue {
  if ((unit.baseUnitId === null) !== (unit.factor === null)) {
    throw new ValidationError(
      `${subject} declara la unidad de la que deriva sin factor, o el factor sin unidad de la que deriva.`,
    )
  }
  if (unit.factor === null) {
    return NEUTRAL
  }
  const factor = parseDecimal(unit.factor, `El factor de ${subject}`)
  if (factor.unscaled <= ZERO) {
    throw new ValidationError(`El factor de ${subject} debe ser mayor que cero: ${unit.factor}.`)
  }
  return factor
}

/**
 * `numerator / denominator`, con `denominator > 0`. Si la division TERMINA el resultado es
 * exacto —todas sus cifras y ninguna de relleno—; si no termina se calcula con
 * `CONVERSION_SCALE` decimales TRUNCANDO (R23).
 *
 * Criterio del truncado con cantidades negativas: se divide sobre el VALOR ABSOLUTO y el signo
 * se aplica despues, asi que el truncado es HACIA CERO y el valor absoluto del resultado NUNCA
 * CRECE. Es lo que pide «truncando y nunca redondeando hacia arriba»: convertir muchas veces no
 * puede inflar una cantidad, ni en positivo ni en negativo.
 */
function divide(numerator: bigint, denominator: bigint): DecimalValue {
  const negative = numerator < ZERO
  const magnitude = negative ? -numerator : numerator
  const common = greatestCommonDivisor(magnitude, denominator)
  const reducedNumerator = magnitude / common
  const reducedDenominator = denominator / common

  // Una fraccion irreducible termina en decimal si su denominador solo tiene doses y cincos; el
  // numero de cifras que ocupa es entonces el mayor de los dos recuentos.
  let rest = reducedDenominator
  let twos = 0
  let fives = 0
  while (rest % TWO === ZERO) {
    rest /= TWO
    twos += 1
  }
  while (rest % FIVE === ZERO) {
    rest /= FIVE
    fives += 1
  }
  const terminates = rest === ONE
  const scale = terminates ? Math.max(twos, fives) : CONVERSION_SCALE
  const unscaled = (reducedNumerator * pow10(scale)) / reducedDenominator

  return { unscaled: negative ? -unscaled : unscaled, scale }
}

/** Texto canonico de un decimal: sin ceros de relleno a la derecha y sin punto suelto (R23). */
function formatDecimal({ unscaled, scale }: DecimalValue): string {
  if (unscaled === ZERO) {
    return '0'
  }
  const negative = unscaled < ZERO
  const digits = (negative ? -unscaled : unscaled).toString().padStart(scale + 1, '0')
  const cut = digits.length - scale
  const integerPart = digits.slice(0, cut)
  const fractionPart = digits.slice(cut).replace(/0+$/, '')
  const sign = negative ? '-' : ''
  return fractionPart === '' ? `${sign}${integerPart}` : `${sign}${integerPart}.${fractionPart}`
}

/**
 * Convierte `quantity` de la unidad `from` a la unidad `to`.
 *
 * Dos unidades se convierten si —y solo si— comparten unidad base efectiva (`baseUnitId ?? id`);
 * eso cubre con un mismo calculo los tres casos: una unidad consigo misma, una base contra una
 * derivada suya y dos derivadas de la misma base. Con la derivacion de UN SOLO NIVEL que
 * garantiza la base (R6) no hay nada que recorrer:
 *
 *     resultado = quantity * factorEfectivo(from) / factorEfectivo(to)
 *
 * El resultado NO se redondea a ninguna escala de presentacion y NO se guarda en ninguna
 * columna (decision cerrada 17): redondea quien lo muestre. Un gramo pasado a toneladas sale
 * `'0.000001'` y jamas `'0'`.
 *
 * @throws {IncompatibleUnitsError} si las dos unidades no comparten unidad base (R24).
 * @throws {ValidationError} si la cantidad o algun factor no es un decimal valido, si un factor
 *   no es mayor que cero, o si una unidad declara unidad base sin factor —o factor sin unidad
 *   base— (R25). En ninguno de esos casos se devuelve una cantidad.
 */
export function convertQuantity(
  quantity: string,
  from: UnitConversion,
  to: UnitConversion,
): string {
  const amount = parseDecimal(quantity, 'La cantidad')
  const fromFactor = effectiveFactor(from, 'la unidad de origen')
  const toFactor = effectiveFactor(to, 'la unidad de destino')

  if (effectiveBaseId(from) !== effectiveBaseId(to)) {
    throw new IncompatibleUnitsError(
      `Las unidades ${from.id} y ${to.id} no comparten unidad base: no son convertibles.`,
    )
  }

  // quantity * factorFrom / factorTo, con las escalas llevadas a enteros:
  //   (a / 10^sa) * (b / 10^sb) / (c / 10^sc) = (a * b * 10^sc) / (c * 10^(sa + sb))
  const numerator = amount.unscaled * fromFactor.unscaled * pow10(toFactor.scale)
  const denominator = toFactor.unscaled * pow10(amount.scale + fromFactor.scale)

  return formatDecimal(divide(numerator, denominator))
}
