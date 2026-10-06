import { describe, expect, it } from 'vitest';

import { loadRequirementUnits } from '@/lib/modules/pedidos/domain/order-requirement-units';
import type { ProductRef } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';

import { fakeScopeProducts, fakeScopeUnits } from '../../helpers/order-unit-of-work-double';

const EMPRESA = 'empresa-1';
const GRAMO: UnitRef = { id: 'u-g', name: 'Gramo', symbol: 'g', baseUnitId: null, factor: null };
const KILO: UnitRef = { id: 'u-kg', name: 'Kilogramo', symbol: 'kg', baseUnitId: 'u-g', factor: '1000' };
const BRIDGE = { volumeBaseId: 'u-ml', massBaseId: 'u-g' };

function producto(id: string, unitId: string | null): ProductRef {
  return { id, name: id, unitId, stockByUnit: [], type: 'PRODUCT' };
}

describe('loadRequirementUnits', () => {
  it('R20 loadRequirementUnits sin unidad de pedido no lee el puente', async () => {
    const products = fakeScopeProducts([producto('p-1', 'u-kg')]);
    const units = fakeScopeUnits([KILO], BRIDGE);

    const result = await loadRequirementUnits({ products, units }, ['p-1'], null, EMPRESA);

    expect(units.findMassVolumeBridge).not.toHaveBeenCalled();
    expect(result.orderUnitId).toBeNull();
    expect(result.orderUnit).toBeNull();
    expect(result.bridge).toBeNull();
    expect(result.productUnits.get('p-1')).toEqual(KILO);
  });

  it('R10 loadRequirementUnits resuelve la unidad de cada insumo y la del pedido', async () => {
    const products = fakeScopeProducts([producto('p-1', 'u-kg'), producto('p-2', null)]);
    const units = fakeScopeUnits([GRAMO, KILO], BRIDGE);

    const result = await loadRequirementUnits({ products, units }, ['p-1', 'p-2', 'p-1'], 'u-g', EMPRESA);

    expect(products.findRefs).toHaveBeenCalledWith(['p-1', 'p-2'], EMPRESA);
    expect(units.findRefs).toHaveBeenCalledTimes(1);
    expect([...(units.findRefs.mock.calls[0]?.[0] as string[])].sort()).toEqual(['u-g', 'u-kg']);
    expect(result.orderUnitId).toBe('u-g');
    expect(result.orderUnit).toEqual(GRAMO);
    expect(result.bridge).toEqual(BRIDGE);
    expect(result.productUnits.get('p-1')).toEqual(KILO);
    expect(result.productUnits.get('p-2')).toBeNull();
  });
});
