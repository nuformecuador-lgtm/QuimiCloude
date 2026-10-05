// `convertWithApproximation`: misma base exacta, masa<->volumen por el puente aproximado.
import { describe, expect, it } from 'vitest';

import {
  convertWithApproximation,
  IncompatibleUnitsError,
  type MassVolumeBridge,
  type UnitConversion,
} from '@/lib/modules/unidades';

const ML: UnitConversion = { id: 'unit-ml', baseUnitId: null, factor: null };
const L: UnitConversion = { id: 'unit-l', baseUnitId: 'unit-ml', factor: '1000' };
const G: UnitConversion = { id: 'unit-g', baseUnitId: null, factor: null };
const KG: UnitConversion = { id: 'unit-kg', baseUnitId: 'unit-g', factor: '1000' };
const UNIDAD: UnitConversion = { id: 'unit-u', baseUnitId: null, factor: null };

const BRIDGE: MassVolumeBridge = { volumeBaseId: 'unit-ml', massBaseId: 'unit-g' };

describe('convertWithApproximation', () => {
  it('R2 1000 g a kg da 1 exacto', () => {
    expect(convertWithApproximation('1000', G, KG, BRIDGE)).toEqual({ quantity: '1', approximate: false });
  });

  it('R2 500 ml a l da 0.5 exacto', () => {
    expect(convertWithApproximation('500', ML, L, BRIDGE)).toEqual({ quantity: '0.5', approximate: false });
  });

  it('R3 2 l a kg da 2 aproximado', () => {
    expect(convertWithApproximation('2', L, KG, BRIDGE)).toEqual({ quantity: '2', approximate: true });
  });

  it('R3 500 g a ml da 500 aproximado', () => {
    expect(convertWithApproximation('500', G, ML, BRIDGE)).toEqual({ quantity: '500', approximate: true });
  });

  it('R3 una unidad propia derivada del mililitro de sistema cruza a kg aproximado', () => {
    const garrafa: UnitConversion = { id: 'unit-garrafa', baseUnitId: 'unit-ml', factor: '5000' };
    expect(convertWithApproximation('3', garrafa, KG, BRIDGE)).toEqual({ quantity: '15', approximate: true });
  });

  it('R4 kg a una unidad sin base comun lanza IncompatibleUnitsError', () => {
    expect(() => convertWithApproximation('1', KG, UNIDAD, BRIDGE)).toThrow(IncompatibleUnitsError);
  });

  it('R4 sin puente masa-volumen, l a kg lanza IncompatibleUnitsError', () => {
    expect(() => convertWithApproximation('2', L, KG, null)).toThrow(IncompatibleUnitsError);
  });

  it('N1 una base propia llamada gramo no cruza con el mililitro de sistema', () => {
    const gramoPropio: UnitConversion = { id: 'unit-gramo-de-la-empresa', baseUnitId: null, factor: null };
    expect(() => convertWithApproximation('1', ML, gramoPropio, BRIDGE)).toThrow(IncompatibleUnitsError);
    expect(() => convertWithApproximation('1', gramoPropio, L, BRIDGE)).toThrow(IncompatibleUnitsError);
  });
});
