// Dominio puro. La multiplicacion sigue siendo `consumedQuantity`: aqui solo se decide en que
// unidad esta su resultado y se lleva a la del insumo.

import { consumedQuantity } from '@/lib/modules/recetas';
import {
  convertWithApproximation,
  IncompatibleUnitsError,
  type MassVolumeBridge,
  type UnitConversion,
} from '@/lib/modules/unidades';

/** `quantity` siempre en la unidad del insumo, salvo `unconverted`, que es la cifra sin tocar. */
export type OrderLineNeed =
  | { readonly kind: 'unconverted'; readonly quantity: string }
  | { readonly kind: 'exact'; readonly quantity: string }
  | { readonly kind: 'approximate'; readonly quantity: string }
  | { readonly kind: 'not_convertible' };

export type LineNeedUnits = {
  /** Id guardado en el pedido; `null` = pedido sin unidad. */
  readonly orderUnitId: string | null;
  /** La unidad ya resuelta del catalogo; `null` si no hay id o si el id no se encontro. */
  readonly orderUnit: UnitConversion | null;
  readonly bridge: MassVolumeBridge | null;
};

/**
 * Un pedido con unidad cuya unidad no se pudo resolver es `not_convertible`, no `unconverted`:
 * un pedido con unidad nunca vuelve a leer la cifra directamente en la unidad del insumo.
 */
export function resolveLineNeed(
  orderQuantity: string,
  percentage: string,
  lineUnit: UnitConversion | null,
  units: LineNeedUnits,
): OrderLineNeed {
  const quantity = consumedQuantity(orderQuantity, percentage);
  if (units.orderUnitId === null || lineUnit === null) {
    return { kind: 'unconverted', quantity };
  }
  if (units.orderUnit === null) {
    return { kind: 'not_convertible' };
  }
  try {
    const converted = convertWithApproximation(quantity, units.orderUnit, lineUnit, units.bridge);
    return converted.approximate
      ? { kind: 'approximate', quantity: converted.quantity }
      : { kind: 'exact', quantity: converted.quantity };
  } catch (error) {
    if (error instanceof IncompatibleUnitsError) {
      return { kind: 'not_convertible' };
    }
    throw error;
  }
}
