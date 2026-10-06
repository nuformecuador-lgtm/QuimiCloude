import { convertQuantity, UnidadesError, type UnitConversion } from '@/lib/modules/unidades';

import { divideDecimal, multiplyDecimal } from './order-decimal';

/** Lo que hace falta saber de la presentacion de una linea para calcular lo que cubre. */
export type PresentationContent = {
  readonly content: string | null;
  readonly unitId: string;
};

export type LineCoverageInput = {
  readonly packages: string;
  readonly presentation: PresentationContent | undefined;
  /** Unidad del pedido. */
  readonly unitId: string;
  /** Cantidad del pedido, en su unidad. */
  readonly quantity: string;
  readonly units: readonly UnitConversion[];
};

export type LineCoverage = {
  /** Envases × contenido, ya en la unidad del pedido. */
  readonly amount: string;
  /** Porcentaje de la cantidad del pedido; `null` si la cantidad no es un positivo valido. */
  readonly percent: string | null;
};

const POSITIVE_INTEGER = /^[1-9]\d*$/;
const POSITIVE_DECIMAL = /^\d+(?:\.\d+)?$/;

/** Cuatro decimales para que el porcentaje redondee bien al pintarlo a dos. */
const PERCENT_SCALE = 4;

/**
 * Lo que cubre una linea del reparto en la unidad del pedido. `null` cuando no se puede saber:
 * envases no validos, presentacion sin resolver o sin contenido, o unidades no convertibles.
 */
export function lineCoverage({
  packages,
  presentation,
  unitId,
  quantity,
  units,
}: LineCoverageInput): LineCoverage | null {
  if (!POSITIVE_INTEGER.test(packages)) return null;
  if (presentation === undefined || presentation.content === null) return null;
  if (!POSITIVE_DECIMAL.test(presentation.content)) return null;

  const from = units.find((unit) => unit.id === presentation.unitId);
  const to = units.find((unit) => unit.id === unitId);
  if (from === undefined || to === undefined) return null;

  let amount: string;
  try {
    amount = convertQuantity(multiplyDecimal(packages, presentation.content), from, to);
  } catch (error) {
    if (error instanceof UnidadesError) return null;
    throw error;
  }

  const trimmed = quantity.trim();
  const percent = POSITIVE_DECIMAL.test(trimmed)
    ? divideDecimal(multiplyDecimal(amount, '100'), trimmed, PERCENT_SCALE)
    : null;
  return { amount, percent };
}
