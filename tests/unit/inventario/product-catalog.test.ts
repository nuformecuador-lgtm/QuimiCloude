// T9 (QC-25) — Adaptador driven de `ProductCatalog` en `inventario`.
//
// HONESTIDAD: este archivo NO toca Postgres, mismo criterio que
// `tests/unit/inventario/product-prisma.test.ts`. Solo prueba el mapeo PURO
// (`toProductRef`) y el atajo sin consulta de `findRefs([])`. La garantia REAL de que
// `findRefs` solo devuelve productos vivos (R17, `deleted_at IS NULL` en el `where`) la
// da el test de integracion contra Postgres real
// `tests/integration/recetas/recipe-lines.int.test.ts`, describe `'R17: findProductRefs
// solo devuelve productos vivos'` -ese es el que muerde si alguien quita el filtro; este
// archivo, con mocks, no podria detectarlo.

import {
  findProductRefs,
  toProductRef,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';

describe('toProductRef', () => {
  it('mapea id, name, unitId y stock tal cual', () => {
    const ref = toProductRef({
      id: 'p-1',
      name: 'Acido sulfurico',
      unitId: 'u-1',
      stock: 12,
    });
    expect(ref).toEqual({
      id: 'p-1',
      name: 'Acido sulfurico',
      unitId: 'u-1',
      stock: 12,
    });
  });

  it('conserva unitId y stock null cuando el producto no los declara', () => {
    const ref = toProductRef({
      id: 'p-1',
      name: 'Acido sulfurico',
      unitId: null,
      stock: null,
    });
    expect(ref.unitId).toBeNull();
    expect(ref.stock).toBeNull();
  });
});

describe('findRefs con lista vacia', () => {
  it('con una lista vacia de ids no consulta la base y devuelve una lista vacia', async () => {
    // R17: `findRefs([])` no dispara ninguna consulta -evita un `IN ()` sin sentido.
    const refs = await findProductRefs([]);
    expect(refs).toEqual([]);
  });
});
