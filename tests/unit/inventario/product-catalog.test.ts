// T9 (QC-25) — Adaptador driven de `ProductCatalog` en `inventario`.
//
// HONESTIDAD: este archivo NO toca Postgres, mismo criterio que
// `tests/unit/inventario/product-prisma.test.ts`. Prueba el mapeo PURO (`toProductRef`), el
// atajo sin consulta de `findRefs([])` y -desde QC-50- que la consulta compone el ambito de
// empresa con el mismo doble de Prisma que usa `tests/unit/recetas/recipe-catalog.test.ts`: lo
// que se ve es la FORMA de la consulta, nunca que Postgres filtre de verdad. Esa garantia REAL
// (R17, `deleted_at IS NULL`, y ahora tambien `companyId`) la da el test de integracion contra
// Postgres real `tests/integration/recetas/recipe-lines.int.test.ts`, describe `'R17:
// findProductRefs solo devuelve productos vivos'` -ese es el que muerde si alguien quita un
// filtro; este archivo, con mocks, no podria detectarlo.

import {
  findProductRefs,
  toProductRef,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { productCompanyScope } from '@/lib/modules/inventario/adapters/driven/persistence/company-scope';

/**
 * Doble del cliente Prisma, SOLO para el bloque QC-50 R29 de mas abajo: cuenta invocaciones y
 * deja inspeccionar el `where` que de verdad viaja a `findMany`, que es lo unico observable sin
 * tocar Postgres -misma tecnica que `tests/unit/recetas/recipe-catalog.test.ts`-.
 */
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: { product: { findMany } } }));

describe('toProductRef', () => {
  it('mapea id, name, unitId y stockByUnit tal cual', () => {
    const ref = toProductRef({
      id: 'p-1',
      name: 'Acido sulfurico',
      unitId: 'kg',
      stockByUnit: [{ unitId: 'kg', quantity: 12 }],
    });
    expect(ref).toEqual({
      id: 'p-1',
      name: 'Acido sulfurico',
      unitId: 'kg',
      stockByUnit: [{ unitId: 'kg', quantity: 12 }],
    });
  });

  it('sin lotes, stockByUnit es un array vacio', () => {
    const ref = toProductRef({ id: 'p-1', name: 'Acido sulfurico', unitId: null, stockByUnit: [] });
    expect(ref.stockByUnit).toEqual([]);
  });

  it('la referencia publica NO lleva existencia total del producto (QC-91, R11)', () => {
    // R11 — `products.stock` ya no existe: la existencia sale UNICAMENTE de `stockByUnit`, que
    // agrupa por unidad (R5) y no es lo mismo que el producto declarando SU unidad.
    const ref = toProductRef({ id: 'p-1', name: 'Acido sulfurico', unitId: null, stockByUnit: [] });
    expect(Object.keys(ref).sort()).toEqual(['id', 'name', 'stockByUnit', 'unitId']);
    expect(Object.keys(ref)).not.toContain('stock');
    expect(Object.keys(ref)).not.toContain('latestBatchUnitId');
  });
});

describe('R14 — findRefs lee la existencia y la unidad de las columnas del producto', () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it('con unidad guardada, unitId y stockByUnit traen esa unidad', async () => {
    findMany.mockResolvedValue([{ id: 'p-1', name: 'Acido sulfurico', stock: 12, unitId: 'kg' }]);

    const [ref] = await findProductRefs(['p-1'], 'empresa-1');

    expect(ref?.unitId).toEqual('kg');
    expect(ref?.stockByUnit).toEqual([{ unitId: 'kg', quantity: 12 }]);
  });

  it('sin unidad guardada (sin lotes), unitId es null y stockByUnit es un array vacio', async () => {
    findMany.mockResolvedValue([{ id: 'p-1', name: 'Acido sulfurico', stock: 0, unitId: null }]);

    const [ref] = await findProductRefs(['p-1'], 'empresa-1');

    expect(ref?.unitId).toBeNull();
    expect(ref?.stockByUnit).toEqual([]);
  });
});

describe('findRefs con lista vacia', () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it('con una lista vacia de ids no consulta la base y devuelve una lista vacia', async () => {
    // R17: `findRefs([])` no dispara ninguna consulta -evita un `IN ()` sin sentido.
    const refs = await findProductRefs([], 'empresa-1');
    expect(refs).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

// CIERRE 2026-09-16 (QC-50, R22) — LA EXCEPCION DE R29 SE CERRO EN ESTA FICHA.
//
// Hasta QC-50, `findProductRefs` era la UNICA consulta de `inventario` sin ambito de empresa
// (QC-49 R29): un id de OTRA empresa volvia igual que uno propio, documentado como excepcion
// aprobada -con su motivo citado y su destino nombrado, QC-50- tanto en el adaptador como en
// `company-scope.ts`. QC-50 la cierra: `findProductRefs(ids, companyId)` ahora compone
// `productCompanyScope`, la MISMA definicion de «de la empresa» que usa el resto del modulo, y
// la lista `SIN_AMBITO_POR_DECISION_APROBADA` de `tests/guards/guard-ambito-empresa-inventario.test.ts`
// quedo vacia. Este bloque ya NO afirma que la excepcion sigue viva -lo contrario seria mentir
// sobre el codigo actual-: afirma que `findRefs` EXIGE la empresa y que la reutiliza desde el
// punto unico del modulo, no que la reinventa a mano.
describe('QC-50 R22 — findRefs exige el ambito de empresa (la excepcion de R29 esta cerrada)', () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it('la firma GANO el ambito: ids y companyId, los dos obligatorios', () => {
    // Dos argumentos, no uno: la firma que R29 documentaba como excepcion ya no existe.
    expect(findProductRefs).toHaveLength(2);
  });

  it('la consulta compone el ambito con productCompanyScope, el punto unico del modulo', async () => {
    findMany.mockResolvedValue([]);

    await findProductRefs(['p-1', 'p-2'], 'empresa-1');

    const args = findMany.mock.calls[0]?.[0];
    // No una copia escrita a mano: EXACTAMENTE lo que devuelve la misma funcion que usa el
    // resto de `inventario` para «de la empresa». Si `findProductRefs` compusiera el `where` a
    // mano, esta igualdad podria coincidir por casualidad hoy y divergir manana.
    expect(args.where).toEqual({
      AND: [productCompanyScope({ companyId: 'empresa-1' }), { id: { in: ['p-1', 'p-2'] }, deletedAt: null }],
    });
  });

  it('un producto de OTRA empresa se resuelve igual que uno inexistente: no vuelve', async () => {
    // Con mocks no se prueba que Postgres filtre de verdad -eso es de
    // `tests/integration/**`-, pero SI que el adaptador no vuelve a filtrar por su cuenta
    // despues: devuelve tal cual lo que el `where` (ya acotado) dejo pasar. Si `findMany`
    // filtro por empresa, un producto ajeno simplemente no aparece en la fila -mismo camino que
    // un id que no existe, sin distincion posible para quien pregunta.
    findMany.mockResolvedValue([{ id: 'p-propio', name: 'Acido sulfurico', stock: 0, unitId: null }]);

    const refs = await findProductRefs(['p-propio', 'p-de-otra-empresa'], 'empresa-1');

    expect(refs).toHaveLength(1);
    expect(refs.map((ref) => ref.id)).toEqual(['p-propio']);
  });

  it('sin ids no consulta la base, aunque llegue una empresa: sigue sin IN () sin sentido', async () => {
    const refs = await findProductRefs([], 'empresa-1');

    expect(refs).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
