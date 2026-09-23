// T3 — Los dos casos de uso de la vista de catalogo visual, con los puertos MOCKEADOS
// (`design.md > 2.3`).
//
// Cubre R4 (los dos casos de uso), R8, R21, R28 y `hasMore` en la ultima pagina. Lo que NO se
// prueba aqui es como se traduce la consulta a SQL: eso es de
// `tests/integration/proveedores/supplier-showcase.int.test.ts`.

import { describe, expect, it, vi } from 'vitest';

import { SupplierNotFoundError, UnauthorizedError, ValidationError } from '@/lib/modules/proveedores/domain/errors';
import { createListShowcaseLines } from '@/lib/modules/proveedores/domain/list-showcase-lines';
import { createListSupplierShowcase } from '@/lib/modules/proveedores/domain/list-supplier-showcase';
import { SHOWCASE_LINE_BATCH, SHOWCASE_LINE_SORT } from '@/lib/modules/proveedores/domain/supplier-showcase';

import type { Actor } from '@/lib/modules/proveedores/domain/actor';
import type { CatalogLineView } from '@/lib/modules/proveedores/domain/catalog-line-view';
import type { Page } from '@/lib/modules/proveedores/domain/page';
import type { ShowcasePage } from '@/lib/modules/proveedores/domain/supplier-showcase';
import type { SupplierCatalogRepository } from '@/lib/modules/proveedores/ports/supplier-catalog-repository';
import type { SupplierRepository } from '@/lib/modules/proveedores/ports/supplier-repository';

const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
const ADMIN: Actor = { id: 'admin-1', companyId: COMPANY_ID, permissions: ['proveedores.consultar'] };
const OPERADOR: Actor = { id: 'operador-1', companyId: COMPANY_ID, permissions: ['inventario.consultar'] };
const SUPPLIER_ID = '22222222-2222-4222-8222-222222222222';
const PRESENTATION_ID = '11111111-1111-4111-8111-111111111111';

function paginaDeProveedoresVacia(): ShowcasePage {
  return { items: [], page: 1, hasMore: false };
}

function montarShowcase() {
  const listShowcaseAlive = vi.fn<SupplierRepository['listShowcaseAlive']>(
    async () => paginaDeProveedoresVacia(),
  );
  const suppliers = {
    create: vi.fn<SupplierRepository['create']>(),
    findAliveById: vi.fn<SupplierRepository['findAliveById']>(),
    updateAlive: vi.fn<SupplierRepository['updateAlive']>(),
    softDeleteAlive: vi.fn<SupplierRepository['softDeleteAlive']>(),
    listAlive: vi.fn<SupplierRepository['listAlive']>(),
    listShowcaseAlive,
  } satisfies SupplierRepository;
  return { suppliers, listSupplierShowcase: createListSupplierShowcase({ suppliers }) };
}

function paginaDeLineas(
  items: readonly CatalogLineView[] = [],
  page = 1,
  totalPages = 1,
): Page<CatalogLineView> {
  return { items, total: items.length, page, pageSize: SHOWCASE_LINE_BATCH, totalPages };
}

function montarLineas(resultado: Page<CatalogLineView> | 'supplier_not_found' = paginaDeLineas()) {
  const listBySupplierAlive = vi.fn<SupplierCatalogRepository['listBySupplierAlive']>(
    async () => resultado,
  );
  const catalog = {
    create: vi.fn<SupplierCatalogRepository['create']>(),
    replaceAlive: vi.fn<SupplierCatalogRepository['replaceAlive']>(),
    softDeleteAlive: vi.fn<SupplierCatalogRepository['softDeleteAlive']>(),
    listBySupplierAlive,
  } satisfies SupplierCatalogRepository;
  return { catalog, listShowcaseLines: createListShowcaseLines({ catalog }) };
}

function lineaDe(id: string, name: string): CatalogLineView {
  return {
    id,
    supplierId: SUPPLIER_ID,
    name,
    presentationId: PRESENTATION_ID,
    unitId: null,
    imagePath: null,
    cost: '10.0000',
    minPurchase: null,
    deliveryTime: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: 'user-1',
    updatedBy: 'user-1',
  };
}

describe('R4 — sin permiso o sin actor, los dos casos de uso rechazan antes de tocar el puerto', () => {
  for (const [etiqueta, actor] of [
    ['al Operador', OPERADOR],
    ['al actor ausente', null],
  ] as const) {
    it(`listSupplierShowcase rechaza ${etiqueta}`, async () => {
      const { suppliers, listSupplierShowcase } = montarShowcase();

      await expect(listSupplierShowcase({ page: 1 }, actor)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(suppliers.listShowcaseAlive).toHaveBeenCalledTimes(0);
    });

    it(`listShowcaseLines rechaza ${etiqueta}`, async () => {
      const { catalog, listShowcaseLines } = montarLineas();

      await expect(
        listShowcaseLines(SUPPLIER_ID, { page: 2 }, actor),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(catalog.listBySupplierAlive).toHaveBeenCalledTimes(0);
    });
  }
});

describe('listSupplierShowcase: lo que llega al puerto', () => {
  it('el actor decide la empresa y la consulta llega saneada, sin fiarse de la entrada', async () => {
    const { suppliers, listSupplierShowcase } = montarShowcase();

    await listSupplierShowcase(
      { page: 2, supplierSearch: '  quimicos  ', productSearch: '' },
      ADMIN,
    );

    expect(suppliers.listShowcaseAlive).toHaveBeenCalledWith(
      { page: 2, supplierSearch: 'quimicos', productSearch: '' },
      { companyId: COMPANY_ID },
    );
  });

  it('la entrada que no cumple la forma se rechaza antes de tocar el puerto', async () => {
    const { suppliers, listSupplierShowcase } = montarShowcase();

    await expect(listSupplierShowcase({ page: 0 }, ADMIN)).rejects.toBeInstanceOf(ValidationError);
    expect(suppliers.listShowcaseAlive).toHaveBeenCalledTimes(0);
  });
});

describe('R28 — listShowcaseLines: el proveedor de otra empresa o dado de baja es «no encontrado»', () => {
  it('traduce supplier_not_found en vez de devolver una pagina vacia', async () => {
    const { listShowcaseLines } = montarLineas('supplier_not_found');

    await expect(
      listShowcaseLines(SUPPLIER_ID, { page: 2 }, ADMIN),
    ).rejects.toBeInstanceOf(SupplierNotFoundError);
  });
});

describe('listShowcaseLines: la consulta que llega al puerto — pageSize 10, orden name asc y el termino de producto', () => {
  it('pageSize, orden y busqueda son los del dominio, no los de la entrada', async () => {
    const { catalog, listShowcaseLines } = montarLineas();

    await listShowcaseLines(SUPPLIER_ID, { page: 2, productSearch: 'acido' }, ADMIN);

    expect(catalog.listBySupplierAlive).toHaveBeenCalledTimes(1);
    const [supplierId, query] = catalog.listBySupplierAlive.mock.calls[0]!;
    expect(supplierId).toBe(SUPPLIER_ID);
    expect(query).toEqual({
      page: 2,
      pageSize: SHOWCASE_LINE_BATCH,
      sort: SHOWCASE_LINE_SORT,
      filters: {},
      search: 'acido',
    });
  });

  it('la entrada que no cumple la forma (page < 2) se rechaza antes de tocar el puerto', async () => {
    const { catalog, listShowcaseLines } = montarLineas();

    await expect(listShowcaseLines(SUPPLIER_ID, { page: 1 }, ADMIN)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(catalog.listBySupplierAlive).toHaveBeenCalledTimes(0);
  });
});

describe('R8 — la proyeccion de linea no lleva createdBy ni updatedBy', () => {
  it('la salida solo trae id, name e imagePath', async () => {
    const { listShowcaseLines } = montarLineas(paginaDeLineas([lineaDe('l-1', 'Acido citrico')]));

    const pagina = await listShowcaseLines(SUPPLIER_ID, { page: 2 }, ADMIN);

    expect(pagina.items).toEqual([{ id: 'l-1', name: 'Acido citrico', imagePath: null }]);
    const serializado = JSON.stringify(pagina.items);
    expect(serializado).not.toContain('createdBy');
    expect(serializado).not.toContain('updatedBy');
  });
});

describe('hasMore en la ultima pagina', () => {
  it('page === totalPages implica hasMore false', async () => {
    const { listShowcaseLines } = montarLineas(paginaDeLineas([lineaDe('l-1', 'Acido')], 3, 3));

    const pagina = await listShowcaseLines(SUPPLIER_ID, { page: 3 }, ADMIN);

    expect(pagina.hasMore).toBe(false);
  });

  it('page < totalPages implica hasMore true', async () => {
    const { listShowcaseLines } = montarLineas(paginaDeLineas([lineaDe('l-1', 'Acido')], 2, 3));

    const pagina = await listShowcaseLines(SUPPLIER_ID, { page: 2 }, ADMIN);

    expect(pagina.hasMore).toBe(true);
  });
});
