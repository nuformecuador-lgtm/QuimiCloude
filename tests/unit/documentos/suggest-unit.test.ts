// Sugerencia de unidad de una presentacion nueva. Dominio puro.

import { describe, expect, it } from 'vitest';

import { suggestUnitId } from '@/lib/modules/documentos/domain/suggest-unit';

import type { UnitRef } from '@/lib/modules/unidades';

const LITRO: UnitRef = { id: 'u-litro', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null };
const MILILITRO: UnitRef = {
  id: 'u-mililitro',
  name: 'Mililitro',
  symbol: 'ml',
  baseUnitId: 'u-litro',
  factor: '0.0010',
};
const KILO: UnitRef = { id: 'u-kilo', name: 'Kilogramo', symbol: 'kg', baseUnitId: null, factor: null };
const SIN_SIMBOLO: UnitRef = { id: 'u-sin-simbolo', name: 'Litro', symbol: null, baseUnitId: null, factor: null };

describe('suggestUnitId — R19', () => {
  it('R19 — null si la unidad leida es null', () => {
    expect(suggestUnitId(null, [LITRO, KILO])).toBeNull();
  });

  it('R19 — null si no coincide ninguna (cero coincidencias)', () => {
    expect(suggestUnitId('galon', [LITRO, KILO])).toBeNull();
  });

  it('R19 — el id de la unica unidad cuyo nombre normalizado coincide', () => {
    expect(suggestUnitId('litro', [LITRO, KILO])).toBe('u-litro');
  });

  it('R19 — el id de la unica unidad cuyo simbolo normalizado coincide', () => {
    expect(suggestUnitId('L', [LITRO, KILO])).toBe('u-litro');
  });

  it('R19 — null si coincide mas de una (dos coincidencias)', () => {
    expect(suggestUnitId('litro', [LITRO, SIN_SIMBOLO])).toBeNull();
  });

  it('R19 — ignora mayusculas, acentos y signos al comparar', () => {
    expect(suggestUnitId('MILI-LITRO', [LITRO, MILILITRO])).toBe('u-mililitro');
  });
});
