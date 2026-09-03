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
    const ref = toUnitRef({ id: 'u-1', name: 'Litro', symbol: 'L' });
    expect(ref).toEqual({ id: 'u-1', name: 'Litro', symbol: 'L' });
  });

  it('conserva symbol null cuando la unidad no lo declara (R3)', () => {
    const ref = toUnitRef({ id: 'u-1', name: 'Litro', symbol: null });
    expect(ref.symbol).toBeNull();
  });
});

describe('findRefs', () => {
  it('con una lista vacia de ids no consulta la base y devuelve una lista vacia', async () => {
    const refs = await findUnitRefs([]);
    expect(refs).toEqual([]);
  });
});
