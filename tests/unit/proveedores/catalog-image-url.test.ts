// La URL publica del recorte en las tres lecturas de `proveedores`, con `images` MOCKEADO.
//
// Cubre R5, R13, R14 y R16. Lo que NO se prueba aqui es la formula real de `getPublicUrl`: eso
// es del adaptador que implementa `CatalogImageUrl` fuera de este modulo.

import { describe, expect, it, vi } from 'vitest';

import { toImageUrl } from '@/lib/modules/proveedores/domain/catalog-image-url';
import { createListCatalogLines } from '@/lib/modules/proveedores/domain/list-catalog-lines';
import { createListShowcaseLines } from '@/lib/modules/proveedores/domain/list-showcase-lines';
import { createListSupplierShowcase } from '@/lib/modules/proveedores/domain/list-supplier-showcase';

import type { Actor } from '@/lib/modules/proveedores/domain/actor';
import type { CatalogLineView } from '@/lib/modules/proveedores/domain/catalog-line-view';
import type { ShowcasePageRecord } from '@/lib/modules/proveedores/domain/supplier-showcase';
import type { CatalogImageUrl } from '@/lib/modules/proveedores/ports/catalog-image-url';
import type { ListQueryLog } from '@/lib/modules/proveedores/ports/list-query-log';
import type { SupplierCatalogRepository } from '@/lib/modules/proveedores/ports/supplier-catalog-repository';
import type { SupplierRepository } from '@/lib/modules/proveedores/ports/supplier-repository';

const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
const ADMIN: Actor = { id: 'admin-1', companyId: COMPANY_ID, permissions: ['proveedores.consultar'] };
const SUPPLIER_ID = '22222222-2222-4222-8222-222222222222';
const PRESENTATION_ID = '11111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-25T00:00:00.000Z');
const RUTA = `${COMPANY_ID}/33333333-3333-4333-8333-333333333333/1-1.png`;

/** Doble espiado: compone una URL reconocible y deja ver con que argumentos se llamo. */
function espiaImages(): { images: CatalogImageUrl; publicUrl: ReturnType<typeof vi.fn> } {
  const publicUrl = vi.fn((path: string) => `https://cdn.test/${path}`);
  return { images: { publicUrl }, publicUrl };
}

function lineaDe(id: string, imagePath: string | null): CatalogLineView {
  return {
    id,
    supplierId: SUPPLIER_ID,
    name: 'Acido citrico',
    presentationId: PRESENTATION_ID,
    unitId: null,
    imagePath,
    cost: '10.0000',
    minPurchase: null,
    deliveryTime: null,
    material: null,
    measurements: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    createdBy: null,
    updatedBy: null,
  };
}

function catalogRepoCon(pagina: {
  items: readonly CatalogLineView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}): SupplierCatalogRepository {
  return {
    create: vi.fn<SupplierCatalogRepository['create']>(),
    replaceAlive: vi.fn<SupplierCatalogRepository['replaceAlive']>(),
    softDeleteAlive: vi.fn<SupplierCatalogRepository['softDeleteAlive']>(),
    listBySupplierAlive: vi.fn<SupplierCatalogRepository['listBySupplierAlive']>(async () => pagina),
  } satisfies SupplierCatalogRepository;
}

describe('toImageUrl — la misma regla que `recetas/domain/list-recipes.ts:50`', () => {
  it('R16 — ruta null no compone nada: `null` y `publicUrl` sin llamar', () => {
    const { images, publicUrl } = espiaImages();

    expect(toImageUrl(null, images)).toBeNull();
    expect(publicUrl).not.toHaveBeenCalled();
  });

  it('R16 — ruta vacia tampoco compone nada', () => {
    const { images, publicUrl } = espiaImages();

    expect(toImageUrl('', images)).toBeNull();
    expect(publicUrl).not.toHaveBeenCalled();
  });

  it('R5 — con ruta, `publicUrl` recibe SOLO la ruta, sin la empresa como dato aparte', () => {
    const { images, publicUrl } = espiaImages();

    expect(toImageUrl(RUTA, images)).toBe(`https://cdn.test/${RUTA}`);
    expect(publicUrl).toHaveBeenCalledTimes(1);
    expect(publicUrl.mock.calls[0]).toEqual([RUTA]);
  });
});

describe('R14 — listCatalogLines: cada linea trae la ruta Y la URL publica', () => {
  it('linea con ruta: `imagePath` se conserva y `imageUrl` es `publicUrl(ruta)`', async () => {
    const { images, publicUrl } = espiaImages();
    const catalog = catalogRepoCon({
      items: [lineaDe('l-1', RUTA)],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
    const log: ListQueryLog = { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() };

    const pagina = await createListCatalogLines({ catalog, log, images })(
      SUPPLIER_ID,
      { page: 1 },
      ADMIN,
    );

    expect(pagina.items[0]?.imagePath).toBe(RUTA);
    expect(pagina.items[0]?.imageUrl).toBe(`https://cdn.test/${RUTA}`);
    expect(publicUrl).toHaveBeenCalledWith(RUTA);
  });

  it('R16 — linea sin ruta: `imageUrl` sale `null` y `publicUrl` no se llama', async () => {
    const { images, publicUrl } = espiaImages();
    const catalog = catalogRepoCon({
      items: [lineaDe('l-1', null)],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
    const log: ListQueryLog = { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() };

    const pagina = await createListCatalogLines({ catalog, log, images })(
      SUPPLIER_ID,
      { page: 1 },
      ADMIN,
    );

    expect(pagina.items[0]?.imagePath).toBeNull();
    expect(pagina.items[0]?.imageUrl).toBeNull();
    expect(publicUrl).not.toHaveBeenCalled();
  });
});

describe('R13 — listSupplierShowcase: la primera tanda y «cargar mas» traen la URL publica', () => {
  it('cada linea de cada fila sale con `imageUrl` = `publicUrl(ruta)`', async () => {
    const { images, publicUrl } = espiaImages();
    const pagina: ShowcasePageRecord = {
      items: [
        {
          id: SUPPLIER_ID,
          name: 'Proveedor',
          lines: [{ id: 'l-1', name: 'Acido citrico', imagePath: RUTA }],
          hasMoreLines: false,
        },
      ],
      page: 1,
      hasMore: false,
    };
    const suppliers = {
      create: vi.fn<SupplierRepository['create']>(),
      findAliveById: vi.fn<SupplierRepository['findAliveById']>(),
      updateAlive: vi.fn<SupplierRepository['updateAlive']>(),
      softDeleteAlive: vi.fn<SupplierRepository['softDeleteAlive']>(),
      listAlive: vi.fn<SupplierRepository['listAlive']>(),
      listShowcaseAlive: vi.fn<SupplierRepository['listShowcaseAlive']>(async () => pagina),
    } satisfies SupplierRepository;

    const resultado = await createListSupplierShowcase({ suppliers, images })({ page: 1 }, ADMIN);

    expect(resultado.items[0]?.lines[0]?.imageUrl).toBe(`https://cdn.test/${RUTA}`);
    expect(publicUrl).toHaveBeenCalledWith(RUTA);
  });

  it('R16 — una fila con una linea sin ruta compone `imageUrl: null` sin llamar a `publicUrl`', async () => {
    const { images, publicUrl } = espiaImages();
    const pagina: ShowcasePageRecord = {
      items: [
        {
          id: SUPPLIER_ID,
          name: 'Proveedor',
          lines: [{ id: 'l-1', name: 'Sosa caustica', imagePath: null }],
          hasMoreLines: false,
        },
      ],
      page: 1,
      hasMore: false,
    };
    const suppliers = {
      create: vi.fn<SupplierRepository['create']>(),
      findAliveById: vi.fn<SupplierRepository['findAliveById']>(),
      updateAlive: vi.fn<SupplierRepository['updateAlive']>(),
      softDeleteAlive: vi.fn<SupplierRepository['softDeleteAlive']>(),
      listAlive: vi.fn<SupplierRepository['listAlive']>(),
      listShowcaseAlive: vi.fn<SupplierRepository['listShowcaseAlive']>(async () => pagina),
    } satisfies SupplierRepository;

    const resultado = await createListSupplierShowcase({ suppliers, images })({ page: 1 }, ADMIN);

    expect(resultado.items[0]?.lines[0]?.imageUrl).toBeNull();
    expect(publicUrl).not.toHaveBeenCalled();
  });

  it('«cargar mas» de una fila (listShowcaseLines) trae la misma URL publica que la primera tanda', async () => {
    const { images, publicUrl } = espiaImages();
    const catalog = catalogRepoCon({
      items: [lineaDe('l-1', RUTA)],
      total: 1,
      page: 2,
      pageSize: 10,
      totalPages: 2,
    });

    const resultado = await createListShowcaseLines({ catalog, images })(
      SUPPLIER_ID,
      { page: 2 },
      ADMIN,
    );

    expect(resultado.items[0]?.imageUrl).toBe(`https://cdn.test/${RUTA}`);
    expect(publicUrl).toHaveBeenCalledWith(RUTA);
  });

  it('R16 — «cargar mas» sin ruta compone `imageUrl: null` sin llamar a `publicUrl`', async () => {
    const { images, publicUrl } = espiaImages();
    const catalog = catalogRepoCon({
      items: [lineaDe('l-1', null)],
      total: 1,
      page: 2,
      pageSize: 10,
      totalPages: 2,
    });

    const resultado = await createListShowcaseLines({ catalog, images })(
      SUPPLIER_ID,
      { page: 2 },
      ADMIN,
    );

    expect(resultado.items[0]?.imageUrl).toBeNull();
    expect(publicUrl).not.toHaveBeenCalled();
  });
});
