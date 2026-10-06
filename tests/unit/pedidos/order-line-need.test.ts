import { describe, expect, it } from 'vitest';

import { resolveLineNeed, type LineNeedUnits } from '@/lib/modules/pedidos';
import type { MassVolumeBridge, UnitConversion } from '@/lib/modules/unidades';

const GRAMO: UnitConversion = { id: 'g', baseUnitId: null, factor: null };
const KILOGRAMO: UnitConversion = { id: 'kg', baseUnitId: 'g', factor: '1000' };
const MILILITRO: UnitConversion = { id: 'ml', baseUnitId: null, factor: null };
const LITRO: UnitConversion = { id: 'l', baseUnitId: 'ml', factor: '1000' };
const PIEZA: UnitConversion = { id: 'pieza', baseUnitId: null, factor: null };

const BRIDGE: MassVolumeBridge = { volumeBaseId: MILILITRO.id, massBaseId: GRAMO.id };

function orderIn(unit: UnitConversion): LineNeedUnits {
  return { orderUnitId: unit.id, orderUnit: unit, bridge: BRIDGE };
}

describe('resolveLineNeed', () => {
  it('R1 la necesidad se calcula en la unidad del pedido y se convierte', () => {
    // 2 kg al 50 % son 1 kg; en la unidad del insumo (g) son 1000.
    const need = resolveLineNeed('2', '50', GRAMO, orderIn(KILOGRAMO));
    expect(need).toEqual({ kind: 'exact', quantity: '1000' });
  });

  it('R2 1000 g al 10 % sobre insumo en kg da 0.1 exacto', () => {
    const need = resolveLineNeed('1000', '10', KILOGRAMO, orderIn(GRAMO));
    expect(need).toEqual({ kind: 'exact', quantity: '0.1' });
  });

  it('R3 2 l al 50 % sobre insumo en kg da 1 aproximado', () => {
    const need = resolveLineNeed('2', '50', KILOGRAMO, orderIn(LITRO));
    expect(need).toEqual({ kind: 'approximate', quantity: '1' });
  });

  it('R4 kg sobre insumo en unidad da no convertible', () => {
    const need = resolveLineNeed('2', '50', PIEZA, orderIn(KILOGRAMO));
    expect(need).toEqual({ kind: 'not_convertible' });
  });

  it('R20 pedido sin unidad da la cifra sin convertir', () => {
    const need = resolveLineNeed('1000', '10', KILOGRAMO, { orderUnitId: null, orderUnit: null, bridge: null });
    expect(need).toEqual({ kind: 'unconverted', quantity: '100' });
  });

  it('R21 insumo sin unidad da la cifra sin convertir', () => {
    const need = resolveLineNeed('1000', '10', null, orderIn(GRAMO));
    expect(need).toEqual({ kind: 'unconverted', quantity: '100' });
  });

  it('R9 unidad de pedido no resuelta da no convertible', () => {
    const need = resolveLineNeed('1000', '10', KILOGRAMO, {
      orderUnitId: 'unidad-de-otra-empresa',
      orderUnit: null,
      bridge: BRIDGE,
    });
    expect(need).toEqual({ kind: 'not_convertible' });
  });
});
