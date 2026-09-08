// QC-25 (R50) — Adaptador driven de `UnitCatalog` en `unidades`. Primer consumidor del
// puerto: lo implementa esta feature para sus casos de uso de alta y edicion de receta.
//
// HONESTIDAD: este archivo NO toca Postgres, mismo criterio que
// `tests/unit/inventario/product-catalog.test.ts`. Solo prueba el mapeo PURO
// (`toUnitRef`) y que `findRefs([])` no dispara ninguna consulta. La garantia real de
// existencia contra Postgres es de los tests de integracion de `recetas` (T14).

import {
  findUnitRefs,
  toUnitRef,
} from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';

describe('toUnitRef', () => {
  it('mapea id, name y symbol tal cual', () => {
    const ref = toUnitRef({ id: 'u-1', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null });
    expect(ref).toEqual({
      id: 'u-1',
      name: 'Litro',
      symbol: 'L',
      baseUnitId: null,
      factor: null,
    });
  });

  it('conserva symbol null cuando la unidad no lo declara (R3)', () => {
    const ref = toUnitRef({ id: 'u-1', name: 'Litro', symbol: null, baseUnitId: null, factor: null });
    expect(ref.symbol).toBeNull();
  });

  it('la derivacion viaja entera y el factor sale como TEXTO, nunca como number (QC-26bis)', () => {
    // El `Decimal` de Prisma no puede cruzar el contrato publico de `unidades`, y un
    // `decimal(14,4)` no se degrada a coma flotante: `toUnitRef` lo pasa por `toString()`.
    const ref = toUnitRef({
      id: 'u-kg',
      name: 'Kilogramo',
      symbol: 'kg',
      baseUnitId: 'u-g',
      factor: { toString: () => '1000.0000' },
    });

    expect(ref.baseUnitId).toBe('u-g');
    expect(ref.factor).toBe('1000.0000');
    expect(typeof ref.factor).toBe('string');
  });
});

describe('findRefs', () => {
  it('con una lista vacia de ids no consulta la base y devuelve una lista vacia', async () => {
    const refs = await findUnitRefs([]);
    expect(refs).toEqual([]);
  });
});
