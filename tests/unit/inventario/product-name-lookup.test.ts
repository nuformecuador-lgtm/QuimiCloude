// QC-159 T2 — `findProductsByNormalizedNames` (adaptador de `ProductNameLookup`), con doble de
// Prisma. Misma tecnica que `tests/unit/inventario/product-catalog.test.ts`: lo que se ve es la
// FORMA de la consulta, no que Postgres filtre de verdad -eso lo prueba
// `tests/integration/inventario/product-name-lookup.int.test.ts`.
//
// Cubre R11, R26 (parte dominio) y la atajo sin consulta con lista vacia.

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: { product: { findMany } } }));

import { beforeEach, describe, expect, it } from 'vitest';

import { findProductsByNormalizedNames } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';

const EMPRESA = 'empresa-1';

beforeEach(() => {
  findMany.mockReset();
});

describe('findProductsByNormalizedNames', () => {
  it('con una lista vacia no consulta la base y devuelve una lista vacia', async () => {
    const encontrados = await findProductsByNormalizedNames([], EMPRESA);

    expect(encontrados).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('normaliza cada nombre y quita duplicados antes de consultar', async () => {
    findMany.mockResolvedValue([]);

    await findProductsByNormalizedNames(['Sosa Cáustica', 'sosa-caustica', 'SOSA CAUSTICA'], EMPRESA);

    const args = findMany.mock.calls[0]?.[0];
    expect(args.where.AND[1].nameNormalized.in).toEqual(['sosacaustica']);
  });

  it('un nombre que normaliza a vacio no viaja a la consulta', async () => {
    findMany.mockResolvedValue([]);

    await findProductsByNormalizedNames(['   ', 'Cloro'], EMPRESA);

    const args = findMany.mock.calls[0]?.[0];
    expect(args.where.AND[1].nameNormalized.in).toEqual(['cloro']);
  });

  it('si todos los nombres normalizan a vacio, no consulta la base', async () => {
    const encontrados = await findProductsByNormalizedNames(['   ', '%%%'], EMPRESA);

    expect(encontrados).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('filtra por deleted_at IS NULL y compone la empresa con AND, nunca fundida con la busqueda', async () => {
    findMany.mockResolvedValue([]);

    await findProductsByNormalizedNames(['Cloro'], EMPRESA);

    const args = findMany.mock.calls[0]?.[0];
    expect(args.where).toEqual({
      AND: [{ companyId: EMPRESA }, { nameNormalized: { in: ['cloro'] }, deletedAt: null }],
    });
    expect(args.select).toEqual({ id: true, name: true, nameNormalized: true, type: true, unitId: true });
  });

  it('devuelve cada fila con su type y unitId tal cual (incluido un terminado)', async () => {
    findMany.mockResolvedValue([
      { id: 'p-1', name: 'Cloro', nameNormalized: 'cloro', type: 'PRODUCT', unitId: 'u-1' },
      { id: 'p-2', name: 'Jabon terminado', nameNormalized: 'jabonterminado', type: 'FINISHED_PRODUCT', unitId: null },
    ]);

    const encontrados = await findProductsByNormalizedNames(['Cloro', 'Jabon terminado'], EMPRESA);

    expect(encontrados).toEqual([
      { id: 'p-1', name: 'Cloro', nameNormalized: 'cloro', type: 'PRODUCT', unitId: 'u-1' },
      { id: 'p-2', name: 'Jabon terminado', nameNormalized: 'jabonterminado', type: 'FINISHED_PRODUCT', unitId: null },
    ]);
  });
});
