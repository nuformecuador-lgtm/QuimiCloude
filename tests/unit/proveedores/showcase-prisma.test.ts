// T4 — La FORMA del `where`/`orderBy` de `listShowcaseAliveSuppliers`, con un Prisma DOBLE
// (`design.md > 3`).
//
// HONESTIDAD: este archivo NO toca Postgres. El cliente Prisma esta sustituido por un doble que
// captura los argumentos, mismo patron que `tests/unit/unidades/unit-prisma-where.test.ts`. Que
// el `EXPLAIN` del `some` sea razonable contra datos reales es de
// `tests/integration/proveedores/supplier-showcase.int.test.ts`.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const findManySuppliers = vi.fn(async () => [] as unknown[]);
const findManyLines = vi.fn(async () => [] as unknown[]);
vi.mock('@/lib/shared/db/prisma', () => ({
  prisma: {
    supplier: { findMany: findManySuppliers },
    supplierCatalogLine: { findMany: findManyLines },
  },
}));

const { listShowcaseAliveSuppliers } = await import(
  '@/lib/modules/proveedores/adapters/driven/persistence/supplier-prisma'
);

import type { ShowcaseQuery } from '@/lib/modules/proveedores/domain/supplier-showcase';
import type { SupplierScope } from '@/lib/modules/proveedores/domain/supplier-scope';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const SCOPE: SupplierScope = { companyId: EMPRESA };

const CONSULTA_VACIA: ShowcaseQuery = { page: 1, supplierSearch: '', productSearch: '' };

function ultimoWhereDe(espia: typeof findManySuppliers): unknown {
  const ultima = espia.mock.calls.at(-1);
  if (ultima === undefined) throw new Error('el doble de Prisma no fue invocado');
  return (ultima as unknown as [{ where: unknown }])[0].where;
}

function ultimaLlamadaDe(espia: typeof findManySuppliers): Record<string, unknown> {
  const ultima = espia.mock.calls.at(-1);
  if (ultima === undefined) throw new Error('el doble de Prisma no fue invocado');
  return (ultima as unknown as [Record<string, unknown>])[0];
}

function filaDeProveedor(id: string, name: string): { id: string; name: string } {
  return { id, name };
}

beforeEach(() => {
  vi.clearAllMocks();
  findManySuppliers.mockResolvedValue([]);
  findManyLines.mockResolvedValue([]);
});

describe('el `where` de proveedores: sin filtro de producto no se exige ninguna linea (D15)', () => {
  it('sin busqueda de ninguno de los dos filtros, el where es solo vida y empresa', async () => {
    await listShowcaseAliveSuppliers(CONSULTA_VACIA, SCOPE);

    expect(ultimoWhereDe(findManySuppliers)).toEqual({ deletedAt: null, companyId: EMPRESA });
  });

  it('con supplierSearch, el where lleva la busqueda normalizada del proveedor', async () => {
    await listShowcaseAliveSuppliers({ ...CONSULTA_VACIA, supplierSearch: 'Quimicos' }, SCOPE);

    const where = ultimoWhereDe(findManySuppliers) as { nameNormalized?: unknown };
    expect(where.nameNormalized).toBeDefined();
    expect(JSON.stringify(where)).not.toMatch(/catalogLines/);
  });
});

describe('el `where` de proveedores: con filtro de producto, exige el `some` de lineas (R20)', () => {
  it('el `some` acota por vida, empresa y el termino de producto normalizado', async () => {
    await listShowcaseAliveSuppliers({ ...CONSULTA_VACIA, productSearch: 'Acido' }, SCOPE);

    const where = ultimoWhereDe(findManySuppliers) as {
      catalogLines?: { some?: Record<string, unknown> };
    };
    expect(where.catalogLines?.some).toBeDefined();
    expect(where.catalogLines?.some?.deletedAt).toBeNull();
    expect(where.catalogLines?.some?.companyId).toBe(EMPRESA);
    expect(where.catalogLines?.some?.nameNormalized).toBeDefined();
  });
});

describe('orden, paginacion y el truco del +1 para no contar (D17, R11)', () => {
  it('orden name asc, id asc; take 6; skip por pagina de 5', async () => {
    await listShowcaseAliveSuppliers({ ...CONSULTA_VACIA, page: 2 }, SCOPE);

    const llamada = ultimaLlamadaDe(findManySuppliers);
    expect(llamada.orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    expect(llamada.take).toBe(6);
    expect(llamada.skip).toBe(5);
  });

  it('6 filas devueltas: hasMore true y solo 5 proveedores en la pagina', async () => {
    findManySuppliers.mockResolvedValue([
      filaDeProveedor('s1', 'A'),
      filaDeProveedor('s2', 'B'),
      filaDeProveedor('s3', 'C'),
      filaDeProveedor('s4', 'D'),
      filaDeProveedor('s5', 'E'),
      filaDeProveedor('s6', 'F'),
    ]);

    const pagina = await listShowcaseAliveSuppliers(CONSULTA_VACIA, SCOPE);

    expect(pagina.hasMore).toBe(true);
    expect(pagina.items.map((item) => item.id)).toEqual(['s1', 's2', 's3', 's4', 's5']);
  });

  it('3 filas devueltas: hasMore false', async () => {
    findManySuppliers.mockResolvedValue([
      filaDeProveedor('s1', 'A'),
      filaDeProveedor('s2', 'B'),
      filaDeProveedor('s3', 'C'),
    ]);

    const pagina = await listShowcaseAliveSuppliers(CONSULTA_VACIA, SCOPE);

    expect(pagina.hasMore).toBe(false);
    expect(pagina.items).toHaveLength(3);
  });
});

describe('las lineas de cada proveedor: mismo orden y filtro que «cargar mas» (R17)', () => {
  it('el `findMany` de lineas lleva take 11, orden name asc/id asc y el termino de producto', async () => {
    findManySuppliers.mockResolvedValue([filaDeProveedor('s1', 'A')]);

    await listShowcaseAliveSuppliers({ ...CONSULTA_VACIA, productSearch: 'Acido' }, SCOPE);

    expect(findManyLines).toHaveBeenCalledTimes(1);
    const llamada = ultimaLlamadaDe(findManyLines);
    expect(llamada.take).toBe(11);
    expect(llamada.orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    const where = llamada.where as { supplierId?: string; nameNormalized?: unknown };
    expect(where.supplierId).toBe('s1');
    expect(where.nameNormalized).toBeDefined();
  });

  it('11 lineas devueltas: hasMoreLines true y solo 10 en la fila', async () => {
    findManySuppliers.mockResolvedValue([filaDeProveedor('s1', 'A')]);
    findManyLines.mockResolvedValue(
      Array.from({ length: 11 }, (_unused, i) => ({
        id: `l${String(i)}`,
        name: `Linea ${String(i)}`,
        imagePath: null,
      })),
    );

    const pagina = await listShowcaseAliveSuppliers(CONSULTA_VACIA, SCOPE);

    expect(pagina.items[0]?.hasMoreLines).toBe(true);
    expect(pagina.items[0]?.lines).toHaveLength(10);
  });

  it('las lineas de cada proveedor se piden EN PARALELO (una findMany por proveedor)', async () => {
    findManySuppliers.mockResolvedValue([filaDeProveedor('s1', 'A'), filaDeProveedor('s2', 'B')]);

    await listShowcaseAliveSuppliers(CONSULTA_VACIA, SCOPE);

    expect(findManyLines).toHaveBeenCalledTimes(2);
    const llamadas = findManyLines.mock.calls as unknown as readonly [
      { where: { supplierId: string } },
    ][];
    const supplierIds = llamadas.map((llamada) => llamada[0].where.supplierId);
    expect(supplierIds.sort()).toEqual(['s1', 's2']);
  });
});
