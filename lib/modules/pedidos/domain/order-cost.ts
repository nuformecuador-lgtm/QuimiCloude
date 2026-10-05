// lib/modules/pedidos/domain/order-cost.ts
//
// Dominio puro: sin Prisma, sin framework, sin reloj y sin estado. Recibe datos ya leidos por
// quien orquesta (alta o edicion) y devuelve el importe, o `null` cuando no se puede calcular.

import type { CostingBatch, PackagingCostingBatch, ProductId } from '@/lib/modules/inventario'
import { consumedQuantity } from '@/lib/modules/recetas'
import { convertQuantity, IncompatibleUnitsError, type UnitConversion } from '@/lib/modules/unidades'

/** Linea de receta, vista con lo minimo que este calculo necesita. `unitId` es la unidad guardada
 *  del insumo (`ProductRef.unitId`) y es `null` cuando el producto no tiene unidad guardada; en
 *  ese caso la linea no tiene coste. */
export type RecipeCostLine = {
  readonly productId: ProductId
  readonly percentage: string
  readonly unitId: string | null
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

/** Promedio simple de costes unitarios ya escalados a `INTERNAL_SCALE`, sin ponderar por la
 *  cantidad de ningun lote. */
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
  orderQuantity: string,
  batches: readonly CostingBatch[],
  units: ReadonlyMap<string, UnitConversion>,
): bigint | null {
  if (line.unitId === null) {
    return null
  }
  const lineUnit = units.get(line.unitId)
  const neededQuantity = parseDecimal(consumedQuantity(orderQuantity, line.percentage))
  if (lineUnit === undefined || neededQuantity === null) {
    return null
  }

  const neededInternal = toInternal(neededQuantity)
  if (neededInternal <= ZERO) {
    return ZERO
  }

  // Todos los lotes del producto con disponible mayor que cero entran en el promedio, se
  // necesiten o no para cubrir la cantidad necesaria; ni el orden de compra ni el numero de
  // lote importan ya para el coste.
  const productBatches = batches.filter((batch) => batch.productId === line.productId)

  let coveredInternal = ZERO
  const unitCostsInternal: bigint[] = []

  for (const batch of productBatches) {
    const availableScaled = parseDecimal(batch.available)
    if (availableScaled === null) {
      return null
    }
    const availableInternalNative = toInternal(availableScaled)
    if (availableInternalNative <= ZERO) {
      continue
    }

    const batchUnit = units.get(batch.unitId)
    if (batchUnit === undefined) {
      return null
    }

    let availableConverted: string
    let unitFactor: string
    try {
      availableConverted = convertQuantity(batch.available, batchUnit, lineUnit)
      unitFactor = convertQuantity('1', lineUnit, batchUnit)
    } catch (error) {
      if (error instanceof IncompatibleUnitsError) {
        return null
      }
      throw error
    }

    const availableConvertedScaled = parseDecimal(availableConverted)
    const factorScaled = parseDecimal(unitFactor)
    const unitCostScaled = parseDecimal(batch.unitCost)
    if (availableConvertedScaled === null || factorScaled === null || unitCostScaled === null) {
      return null
    }

    coveredInternal += toInternal(availableConvertedScaled)
    unitCostsInternal.push(multiplyInternal(toInternal(unitCostScaled), toInternal(factorScaled)))
  }

  if (coveredInternal < neededInternal || unitCostsInternal.length === 0) {
    return null
  }

  const averageUnitCostInternal = averageInternal(unitCostsInternal)
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

  if (parseDecimal(input.orderQuantity) === null) {
    return null
  }

  let totalInternal = ZERO
  for (const line of input.lines) {
    const lineCostInternal = calculateLineCost(line, input.orderQuantity, input.batches, input.units)
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

/**
 * Costo de los ingredientes de un LOTE de producto terminado: recorre las mismas
 * lineas con `calculateLineCost`, pero un ingrediente sin costo cuenta como CERO en vez de
 * invalidar el total entero -a diferencia de `calculateIngredientsCost`, que esta funcion no
 * toca-. Una receta sin lineas, o en la que ningun ingrediente tiene costo, da `'0.0000'`:
 * nunca `null`, porque el lote SIEMPRE entra con un costo unitario.
 */
export function calculateLotIngredientsCost(input: CostInput): string {
  if (input.lines.length === 0) {
    return '0.0000'
  }

  let totalInternal = ZERO
  for (const line of input.lines) {
    const lineCostInternal = calculateLineCost(line, input.orderQuantity, input.batches, input.units)
    if (lineCostInternal !== null) {
      totalInternal += lineCostInternal
    }
  }

  const roundedOutput = roundHalfUpToOutputScale(totalInternal)
  if (roundedOutput > MAX_OUTPUT_UNSCALED) {
    throw new Error('calculateLotIngredientsCost: el costo del lote desborda decimal(14,4)')
  }

  return formatFixedOutputScale(roundedOutput)
}

/** Un envase del reparto y cuantos lleva. */
export type PackagingCostLine = {
  readonly productId: ProductId
  readonly packages: number
}

/** Costo (escalado a `INTERNAL_SCALE`) de un envase: sus envases por el promedio simple del
 *  costo de sus lotes. `null` si no tiene lotes o, con `requireCoverage`, si su disponible no
 *  alcanza. */
function calculatePackagingLineCost(
  line: PackagingCostLine,
  batches: readonly PackagingCostingBatch[],
  requireCoverage: boolean,
): bigint | null {
  let coveredInternal = ZERO
  const unitCostsInternal: bigint[] = []
  for (const batch of batches) {
    if (batch.productId !== line.productId) continue
    const available = parseDecimal(batch.available)
    const unitCost = parseDecimal(batch.unitCost)
    if (available === null || unitCost === null) return null
    if (toInternal(available) <= ZERO) continue
    coveredInternal += toInternal(available)
    unitCostsInternal.push(toInternal(unitCost))
  }

  if (unitCostsInternal.length === 0) return null
  const packagesInternal = BigInt(line.packages) * pow10(INTERNAL_SCALE)
  if (requireCoverage && coveredInternal < packagesInternal) return null
  return multiplyInternal(averageInternal(unitCostsInternal), packagesInternal)
}

/** Costo de los envases del reparto, o `null` si alguno no tiene lote con costo o su disponible
 *  no cubre sus envases. Sin envases, `'0.0000'`. */
export function calculatePackagingCost(
  lines: readonly PackagingCostLine[],
  batches: readonly PackagingCostingBatch[],
): string | null {
  let totalInternal = ZERO
  for (const line of lines) {
    const lineCostInternal = calculatePackagingLineCost(line, batches, true)
    if (lineCostInternal === null) return null
    totalInternal += lineCostInternal
  }
  const roundedOutput = roundHalfUpToOutputScale(totalInternal)
  if (roundedOutput > MAX_OUTPUT_UNSCALED) return null
  return formatFixedOutputScale(roundedOutput)
}

/** Lo mismo para el lote de producto terminado: un envase sin lote con costo cuenta cero, como
 *  un ingrediente sin costo en `calculateLotIngredientsCost`. Nunca `null`. */
export function calculateLotPackagingCost(
  lines: readonly PackagingCostLine[],
  batches: readonly PackagingCostingBatch[],
): string {
  let totalInternal = ZERO
  for (const line of lines) {
    totalInternal += calculatePackagingLineCost(line, batches, false) ?? ZERO
  }
  const roundedOutput = roundHalfUpToOutputScale(totalInternal)
  if (roundedOutput > MAX_OUTPUT_UNSCALED) {
    throw new Error('calculateLotPackagingCost: el costo del lote desborda decimal(14,4)')
  }
  return formatFixedOutputScale(roundedOutput)
}

/** Importe del pedido: ingredientes mas envases, los dos ya con cuatro decimales. `null` si
 *  cualquiera de los dos lo es o la suma desborda la columna. */
export function calculateOrderCost(ingredientsCost: string | null, packagingCost: string | null): string | null {
  if (ingredientsCost === null || packagingCost === null) return null
  const ingredients = parseDecimal(ingredientsCost)
  const packaging = parseDecimal(packagingCost)
  if (ingredients === null || packaging === null) return null
  const total = roundHalfUpToOutputScale(toInternal(ingredients) + toInternal(packaging))
  if (total > MAX_OUTPUT_UNSCALED) return null
  return formatFixedOutputScale(total)
}

/** Lo que se guarda del importe: el total (ingredientes mas envases) y la parte de envases que
 *  incluye, para poder recalcular solo los envases cuando la receta ya se consumio. */
export type StoredOrderCost = { readonly total: string; readonly packaging: string }

/** Importe a guardar a partir de sus dos partes; `null` en los mismos casos que
 *  `calculateOrderCost`. */
export function storedOrderCost(ingredientsCost: string | null, packagingCost: string | null): StoredOrderCost | null {
  const total = calculateOrderCost(ingredientsCost, packagingCost)
  if (total === null || packagingCost === null) return null
  return { total, packaging: packagingCost }
}

/** Parte de ingredientes de un importe guardado: el total menos sus envases. `null` si la resta
 *  sale negativa, que solo pasa con una fila escrita fuera de la aplicacion. */
export function ingredientsPartOf(cost: StoredOrderCost): string | null {
  const total = parseDecimal(cost.total)
  const packaging = parseDecimal(cost.packaging)
  if (total === null || packaging === null) return null
  const differenceInternal = toInternal(total) - toInternal(packaging)
  if (differenceInternal < ZERO) return null
  return formatFixedOutputScale(roundHalfUpToOutputScale(differenceInternal))
}
