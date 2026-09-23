// lib/modules/pedidos/domain/order-cost.ts
//
// Dominio puro: sin Prisma, sin framework, sin reloj y sin estado. Recibe datos ya leidos por
// quien orquesta (alta o edicion) y devuelve el importe, o `null` cuando no se puede calcular.

import { compareBatchesOldestFirst, type CostingBatch, type ProductId } from '@/lib/modules/inventario'
import { convertQuantity, IncompatibleUnitsError, type UnitConversion } from '@/lib/modules/unidades'

/** Linea de receta, vista con lo minimo que este calculo necesita. */
export type RecipeCostLine = {
  readonly productId: ProductId
  readonly quantity: string
  readonly unitId: string
}

export type CostInput = {
  readonly orderQuantity: string
  readonly lines: readonly RecipeCostLine[]
  readonly batches: readonly CostingBatch[]
  readonly units: ReadonlyMap<string, UnitConversion>
}

/**
 * Escala con la que se trabaja internamente: la misma que usa `convertQuantity` para una
 * division que no termina, asi que ningun paso intermedio pierde mas precision que la
 * conversion que ya se le confia.
 */
const INTERNAL_SCALE = 12

/** Escala de la columna donde se guarda el resultado. */
const OUTPUT_SCALE = 4

const ZERO = BigInt(0)
const TWO = BigInt(2)
const TEN = BigInt(10)

/** El mayor entero escalado a `OUTPUT_SCALE` que cabe en `Decimal(14,4)`: diez digitos enteros
 *  mas cuatro decimales. */
const MAX_OUTPUT_UNSCALED = TEN ** BigInt(14) - BigInt(1)

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/

type Scaled = { readonly unscaled: bigint; readonly scale: number }

function pow10(exponent: number): bigint {
  return TEN ** BigInt(exponent)
}

function parseDecimal(raw: string): Scaled | null {
  if (!DECIMAL_PATTERN.test(raw)) {
    return null
  }
  const [integerPart = '', fractionPart = ''] = raw.split('.')
  return { unscaled: BigInt(`${integerPart}${fractionPart}`), scale: fractionPart.length }
}

/** Reescala a `INTERNAL_SCALE`, truncando si hace falta perder digitos. */
function toInternal(value: Scaled): bigint {
  if (value.scale === INTERNAL_SCALE) {
    return value.unscaled
  }
  if (value.scale < INTERNAL_SCALE) {
    return value.unscaled * pow10(INTERNAL_SCALE - value.scale)
  }
  return value.unscaled / pow10(value.scale - INTERNAL_SCALE)
}

/** Producto de dos cantidades ya escaladas a `INTERNAL_SCALE`, reescalado de vuelta a
 *  `INTERNAL_SCALE`. */
function multiplyInternal(a: bigint, b: bigint): bigint {
  return (a * b) / pow10(INTERNAL_SCALE)
}

/** Promedio simple de costes unitarios ya escalados a `INTERNAL_SCALE`. */
function averageInternal(values: readonly bigint[]): bigint {
  const sum = values.reduce((total, value) => total + value, ZERO)
  return sum / BigInt(values.length)
}

/** Redondeo HALF_UP, una sola vez, de `INTERNAL_SCALE` a `OUTPUT_SCALE`. Los valores que llegan
 *  aqui nunca son negativos: un coste de ingredientes no lo es. */
function roundHalfUpToOutputScale(internal: bigint): bigint {
  const divisor = pow10(INTERNAL_SCALE - OUTPUT_SCALE)
  return (internal + divisor / TWO) / divisor
}

function formatFixedOutputScale(unscaled: bigint): string {
  const digits = unscaled.toString().padStart(OUTPUT_SCALE + 1, '0')
  const cut = digits.length - OUTPUT_SCALE
  return `${digits.slice(0, cut)}.${digits.slice(cut)}`
}

/** Coste (escalado a `INTERNAL_SCALE`) de un ingrediente, o `null` si no se puede componer. */
function calculateLineCost(
  line: RecipeCostLine,
  orderQuantityInternal: bigint,
  batches: readonly CostingBatch[],
  units: ReadonlyMap<string, UnitConversion>,
): bigint | null {
  const lineUnit = units.get(line.unitId)
  const lineQuantity = parseDecimal(line.quantity)
  if (lineUnit === undefined || lineQuantity === null) {
    return null
  }

  const neededInternal = multiplyInternal(toInternal(lineQuantity), orderQuantityInternal)
  if (neededInternal <= ZERO) {
    return ZERO
  }

  const productBatches = batches
    .filter((batch) => batch.productId === line.productId)
    .slice()
    .sort(compareBatchesOldestFirst)

  let coveredInternal = ZERO
  const usedUnitCostsInternal: bigint[] = []

  for (const batch of productBatches) {
    const batchUnit = units.get(batch.unitId)
    if (batchUnit === undefined) {
      return null
    }

    let stockConverted: string
    let unitFactor: string
    try {
      stockConverted = convertQuantity(batch.stock, batchUnit, lineUnit)
      unitFactor = convertQuantity('1', lineUnit, batchUnit)
    } catch (error) {
      if (error instanceof IncompatibleUnitsError) {
        return null
      }
      throw error
    }

    const stockScaled = parseDecimal(stockConverted)
    const factorScaled = parseDecimal(unitFactor)
    const unitCostScaled = parseDecimal(batch.unitCost)
    if (stockScaled === null || factorScaled === null || unitCostScaled === null) {
      return null
    }

    coveredInternal += toInternal(stockScaled)
    usedUnitCostsInternal.push(multiplyInternal(toInternal(unitCostScaled), toInternal(factorScaled)))

    if (coveredInternal >= neededInternal) {
      break
    }
  }

  if (coveredInternal < neededInternal) {
    return null
  }

  const averageUnitCostInternal = averageInternal(usedUnitCostsInternal)
  return multiplyInternal(averageUnitCostInternal, neededInternal)
}

/** `null` = sin importe, indistinguible entre los cuatro casos que puede producir esta funcion:
 *  receta sin lineas, unidad sin base comun para convertir, existencia insuficiente para cubrir
 *  la cantidad pedida, o resultado que desborda la precision de la columna. Quien llama recibe
 *  el mismo `null` en los cuatro y no puede saber cual ocurrio. */
export function calculateIngredientsCost(input: CostInput): string | null {
  if (input.lines.length === 0) {
    return null
  }

  const orderQuantity = parseDecimal(input.orderQuantity)
  if (orderQuantity === null) {
    return null
  }
  const orderQuantityInternal = toInternal(orderQuantity)

  let totalInternal = ZERO
  for (const line of input.lines) {
    const lineCostInternal = calculateLineCost(line, orderQuantityInternal, input.batches, input.units)
    if (lineCostInternal === null) {
      return null
    }
    totalInternal += lineCostInternal
  }

  const roundedOutput = roundHalfUpToOutputScale(totalInternal)
  if (roundedOutput > MAX_OUTPUT_UNSCALED) {
    return null
  }

  return formatFixedOutputScale(roundedOutput)
}
