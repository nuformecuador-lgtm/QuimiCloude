import { describe, expect, it } from 'vitest';

import { compareWithOriginal } from '@/app/(private)/produccion/formulas/components/recipe-version-diff';

const ORIGINAL = [
  { productId: 'p-a', productName: 'Agua', percentage: '60.00' },
  { productId: 'p-b', productName: 'Sal', percentage: '5.00' },
  { productId: 'p-c', productName: 'Color', percentage: '35.00' },
] as const;

function line(productId: string, percentage: string) {
  return { productId, percentage };
}

describe('compareWithOriginal', () => {
  it('R17: ingrediente con el mismo porcentaje que la original se marca igual', () => {
    const { marks } = compareWithOriginal(ORIGINAL, [line('p-a', '60.00')]);
    expect(marks).toEqual([{ kind: 'same' }]);
  });

  it('R17: ingrediente con otro porcentaje se marca cambiado con el % de la original', () => {
    const { marks } = compareWithOriginal(ORIGINAL, [line('p-a', '55')]);
    expect(marks).toEqual([{ kind: 'changed', originalPercentage: '60.00' }]);
  });

  it('R17: ingrediente que la original no tiene se marca añadido', () => {
    const { marks, removed } = compareWithOriginal(ORIGINAL, [
      line('p-a', '60'),
      line('p-b', '5'),
      line('p-c', '30'),
      line('p-z', '5'),
    ]);
    expect(marks[3]).toEqual({ kind: 'added' });
    expect(removed).toEqual([]);
  });

  it('R17: línea sin producto no lleva marca (null)', () => {
    const { marks } = compareWithOriginal(ORIGINAL, [line('p-a', '60'), line('', '10')]);
    expect(marks).toEqual([{ kind: 'same' }, null]);
  });

  it('R18: ingredientes de la original ausentes en la versión salen en removed, en el orden de la original', () => {
    const { marks, removed } = compareWithOriginal(ORIGINAL, [line('p-b', '5')]);
    expect(marks).toEqual([{ kind: 'same' }]);
    expect(removed).toEqual([
      { productId: 'p-a', productName: 'Agua', percentage: '60.00' },
      { productId: 'p-c', productName: 'Color', percentage: '35.00' },
    ]);
  });

  it('R18: una línea sin producto no cuenta como presencia de ningún ingrediente', () => {
    const { removed } = compareWithOriginal(ORIGINAL, [line('', '60'), line('p-a', '60')]);
    expect(removed.map((r) => r.productId)).toEqual(['p-b', 'p-c']);
  });

  it('R19: 5, 5,0 y 5,00 contra 5.00 se marcan igual', () => {
    for (const percentage of ['5', '5,0', '5,00', '5.0']) {
      const { marks } = compareWithOriginal(ORIGINAL, [line('p-b', percentage)]);
      expect(marks, percentage).toEqual([{ kind: 'same' }]);
    }
  });

  it("R19: un % no válido ('5,' o '') contra un ingrediente de la original se marca cambiado", () => {
    for (const percentage of ['5,', '']) {
      const { marks } = compareWithOriginal(ORIGINAL, [line('p-b', percentage)]);
      expect(marks, JSON.stringify(percentage)).toEqual([
        { kind: 'changed', originalPercentage: '5.00' },
      ]);
    }
  });

  it('R19: recalcula al quitar o cambiar líneas: cada llamada refleja solo las líneas recibidas', () => {
    const before = compareWithOriginal(ORIGINAL, [line('p-a', '60'), line('p-b', '5')]);
    const after = compareWithOriginal(ORIGINAL, [line('p-a', '61')]);
    expect(before.marks).toEqual([{ kind: 'same' }, { kind: 'same' }]);
    expect(before.removed.map((r) => r.productId)).toEqual(['p-c']);
    expect(after.marks).toEqual([{ kind: 'changed', originalPercentage: '60.00' }]);
    expect(after.removed.map((r) => r.productId)).toEqual(['p-b', 'p-c']);
  });

  it('R17/R18: original vacía -> todo añadido y nada quitado', () => {
    const { marks, removed } = compareWithOriginal([], [line('p-a', '60'), line('p-b', '40')]);
    expect(marks).toEqual([{ kind: 'added' }, { kind: 'added' }]);
    expect(removed).toEqual([]);
  });

  it('R18: versión vacía -> todo quitado', () => {
    const { marks, removed } = compareWithOriginal(ORIGINAL, []);
    expect(marks).toEqual([]);
    expect(removed).toEqual(ORIGINAL.map((l) => ({ ...l })));
  });

  it('R18: ingrediente de la original con productName null sale en removed con null', () => {
    const original = [
      { productId: 'p-a', productName: 'Agua', percentage: '90.00' },
      { productId: 'p-x', productName: null, percentage: '10.00' },
    ];
    const { removed } = compareWithOriginal(original, [line('p-a', '90')]);
    expect(removed).toEqual([{ productId: 'p-x', productName: null, percentage: '10.00' }]);
  });
});
