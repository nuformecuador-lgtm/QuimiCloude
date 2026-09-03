// T9 (QC-25) — Adaptador driven de `ProductCatalog` en `inventario`.
//
// HONESTIDAD: este archivo NO toca Postgres, mismo criterio que
// `tests/unit/inventario/product-prisma.test.ts`. Solo prueba el mapeo PURO
// (`toProductRef`) y documenta el contrato de `findRefs` (R17): que solo devuelve
// productos vivos. La garantia real de `deleted_at IS NULL` contra Postgres es del
// test de integracion de esta feature (T14, `recipe-lines.int.test.ts`), no de este.

import {
  findProductRefs,
  toProductRef,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';

describe('toProductRef', () => {
  it('mapea id, name y unitId tal cual', () => {
    const ref = toProductRef({ id: 'p-1', name: 'Acido sulfurico', unitId: 'u-1' });
    expect(ref).toEqual({ id: 'p-1', name: 'Acido sulfurico', unitId: 'u-1' });
  });

  it('conserva unitId null cuando el producto no la tiene', () => {
    const ref = toProductRef({ id: 'p-1', name: 'Acido sulfurico', unitId: null });
    expect(ref.unitId).toBeNull();
  });
});

describe('findRefs devuelve solo los productos vivos', () => {
  it('con una lista vacia de ids no consulta la base y devuelve una lista vacia', async () => {
    // R17: `findRefs([])` no dispara ninguna consulta -evita un `IN ()` sin sentido.
    const refs = await findProductRefs([]);
    expect(refs).toEqual([]);
  });
});
