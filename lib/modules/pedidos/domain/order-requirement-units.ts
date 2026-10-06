import type { ReservationRequirementLine } from '@/lib/modules/inventario';
import type { UnitConversion } from '@/lib/modules/unidades';

import type { OrderTransactionScope } from '../ports/order-unit-of-work';

import { OrderUnitNotConvertibleError } from './errors';
import type { RecipeRequirement, RequirementUnits } from './order-requirement';

/**
 * Las unidades con las que se convierte la necesidad de reserva, leidas con el cliente de la
 * transaccion abierta. Un pedido sin unidad no necesita el puente masa-volumen: su necesidad
 * no se convierte.
 */
export async function loadRequirementUnits(
  scope: Pick<OrderTransactionScope, 'products' | 'units'>,
  productIds: readonly string[],
  orderUnitId: string | null,
  companyId: string,
): Promise<RequirementUnits> {
  const productRefs = await scope.products.findRefs([...new Set(productIds)], companyId);

  const unitIds = new Set<string>();
  for (const ref of productRefs) {
    if (ref.unitId !== null) unitIds.add(ref.unitId);
  }
  if (orderUnitId !== null) unitIds.add(orderUnitId);

  const [unitRefs, bridge] = await Promise.all([
    scope.units.findRefs([...unitIds], companyId),
    orderUnitId === null ? Promise.resolve(null) : scope.units.findMassVolumeBridge(),
  ]);
  const unitById = new Map<string, UnitConversion>(unitRefs.map((ref) => [ref.id, ref]));

  const productUnits = new Map<string, UnitConversion | null>(
    productRefs.map((ref) => [ref.id, ref.unitId === null ? null : (unitById.get(ref.unitId) ?? null)]),
  );

  return {
    orderUnitId,
    orderUnit: orderUnitId === null ? null : (unitById.get(orderUnitId) ?? null),
    bridge,
    productUnits,
  };
}

/** Las lineas de una necesidad que se va a guardar: una linea no convertible rechaza el guardado,
 *  nombrando sus productos en el diagnostico. */
export function requireConvertibleRequirement(
  requirement: RecipeRequirement,
): readonly ReservationRequirementLine[] {
  if (requirement.kind === 'not_convertible') {
    throw new OrderUnitNotConvertibleError(`productIds=${requirement.productIds.join(',')}`);
  }
  return requirement.lines;
}
