import { compareBatchesOldestFirst, type OrderableBatch } from '@/lib/modules/inventario/domain/batch-order';

function batch(purchaseDate: string, lot: string): OrderableBatch {
  return { purchaseDate, lot };
}

describe('compareBatchesOldestFirst', () => {
  it('R8: ordena por fecha de compra ascendente', () => {
    const batches = [batch('2026-03-01', '1'), batch('2026-01-01', '2'), batch('2026-02-01', '3')];
    expect([...batches].sort(compareBatchesOldestFirst).map((b) => b.purchaseDate)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
    ]);
  });

  it('R8: con la misma fecha, desempata por numero de lote NUMERICO cuando los dos son solo digitos', () => {
    const batches = [batch('2026-01-01', '10'), batch('2026-01-01', '9')];
    expect([...batches].sort(compareBatchesOldestFirst).map((b) => b.lot)).toEqual(['9', '10']);
  });

  it('R8: con lotes que no son solo digitos, desempata como TEXTO', () => {
    const batches = [batch('2026-01-01', 'B-10'), batch('2026-01-01', 'B-9')];
    // Como texto, 'B-10' es menor que 'B-9': el '1' de '10' ordena antes que el '9'.
    expect([...batches].sort(compareBatchesOldestFirst).map((b) => b.lot)).toEqual(['B-10', 'B-9']);
  });

  it('R8: dos lotes con la misma fecha y el mismo numero comparan igual', () => {
    expect(compareBatchesOldestFirst(batch('2026-01-01', '9'), batch('2026-01-01', '9'))).toBe(0);
  });

  it('devuelve 0 solo si fecha y lote coinciden exactamente', () => {
    expect(compareBatchesOldestFirst(batch('2026-01-01', '1'), batch('2026-01-02', '1'))).toBeLessThan(0);
    expect(compareBatchesOldestFirst(batch('2026-01-02', '1'), batch('2026-01-01', '1'))).toBeGreaterThan(0);
  });
});
