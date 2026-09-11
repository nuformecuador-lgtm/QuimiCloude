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
  it('mapea id, name y stock tal cual', () => {
    const ref = toProductRef({
      id: 'p-1',
      name: 'Acido sulfurico',
      stock: 12,
    });
    expect(ref).toEqual({
      id: 'p-1',
      name: 'Acido sulfurico',
      stock: 12,
    });
  });

  it('conserva stock null cuando el producto no declara existencia', () => {
    const ref = toProductRef({
      id: 'p-1',
      name: 'Acido sulfurico',
      stock: null,
    });
    expect(ref.stock).toBeNull();
  });

  it('la referencia publica NO lleva unidad, ni la vieja ni la derivada (QC-80, R21)', () => {
    // R21 — `ProductRef` es lo que `inventario` publica a OTROS modulos, y `unitId` se retira
    // de ahi SIN SUSTITUTO: el unico llamante de `findRefs` es `recetas`, que lo pide para
    // saber si el producto sigue vivo y para su nombre y su existencia. La unidad de una linea
    // de receta es `recipe_lines.unit_id`, propia de `recetas` y ajena a esta ficha.
    //
    // Se afirma sobre las CLAVES del objeto devuelto y no solo con el compilador: un `as` en el
    // adaptador dejaria pasar el campo sin que el typecheck dijera nada. Y tampoco aparece
    // `latestBatchUnitId`: el contrato publico no cambia de campo, pierde uno que nadie usaba.
    const ref = toProductRef({ id: 'p-1', name: 'Acido sulfurico', stock: 0 });
    expect(Object.keys(ref).sort()).toEqual(['id', 'name', 'stock']);
    expect(Object.keys(ref)).not.toContain('unitId');
    expect(Object.keys(ref)).not.toContain('latestBatchUnitId');
  });
});

describe('findRefs con lista vacia', () => {
  it('con una lista vacia de ids no consulta la base y devuelve una lista vacia', async () => {
    // R17: `findRefs([])` no dispara ninguna consulta -evita un `IN ()` sin sentido.
    const refs = await findProductRefs([]);
    expect(refs).toEqual([]);
  });
});
