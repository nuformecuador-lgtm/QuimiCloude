// QC-171 T4 (`design.md > 4.3`) — el cableado de `catalogImageUrl` en `lib/composition`.
//
// Lo que se afirma aqui es EL CABLEADO, no el dominio -eso ya lo cubre
// `tests/unit/proveedores/catalog-image-url.test.ts` con `images` mockeado-: que la composicion
// ata la URL de una linea de catalogo al MISMO bucket de recortes que ya lee `documentos` para la
// revision (R1), bifurcado por `documentsE2EDoublesEnabled()` igual que `cropCatalog`.
//
// Mismo criterio que `tests/unit/composition/documentos-facade.test.ts`: se sustituye el cliente
// Prisma entero -`lib/composition` arrastra todos los adaptadores del repo- y no hace falta ni
// Postgres ni `DATABASE_URL`. El repositorio del catalogo tambien se dobla, para controlar
// exactamente la ruta de la unica linea que devuelve.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/shared/db/prisma', () => ({ prisma: {} }));

const { CROP_PATH, listBySupplierAliveMock } = vi.hoisted(() => {
  const cropPath = 'empresa-1/archivo-1/1-1.png';
  const catalogLine = {
    id: 'linea-1',
    supplierId: 'proveedor-1',
    name: 'Acido citrico',
    presentationId: 'presentacion-1',
    unitId: null,
    imagePath: cropPath,
    cost: '10.0000',
    minPurchase: null,
    deliveryTime: null,
    material: null,
    measurements: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
  };
  return {
    CROP_PATH: cropPath,
    listBySupplierAliveMock: vi.fn(async () => ({
      items: [catalogLine],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })),
  };
});

vi.mock('@/lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma', () => ({
  createCatalogLine: vi.fn(),
  replaceAliveCatalogLine: vi.fn(),
  softDeleteAliveCatalogLine: vi.fn(),
  listCatalogLinesBySupplierAlive: listBySupplierAliveMock,
}));

import { cropPublicUrl } from '@/lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase';
import { proveedores } from '@/lib/composition';

import type { Actor } from '@/lib/modules/proveedores/domain/actor';

const ACTOR: Actor = { id: 'actor-1', companyId: 'empresa-1', permissions: ['proveedores.consultar'] };
const E2E_DOUBLES_VAR = 'DOCUMENTS_E2E_DOUBLES';

describe('QC-171 T4 — importar la composicion sin variables de almacenamiento no lanza', () => {
  it('la fachada `proveedores` queda construida: nada del bloque nuevo lee el entorno al importar', () => {
    expect(typeof proveedores.listCatalogLines).toBe('function');
  });
});

describe('QC-171 R1, R22 — la URL de una linea de catalogo sale del MISMO bucket de recortes que la revision', () => {
  beforeEach(() => {
    delete process.env[E2E_DOUBLES_VAR];
    listBySupplierAliveMock.mockClear();
  });

  afterEach(() => {
    delete process.env[E2E_DOUBLES_VAR];
  });

  it('R22 — con los dobles del E2E puestos, la URL sale en https://documentos-e2e.invalid/crops/<ruta>', async () => {
    process.env[E2E_DOUBLES_VAR] = '1';

    const pagina = await proveedores.listCatalogLines('proveedor-1', {}, ACTOR);

    expect(pagina.items[0]?.imageUrl).toBe(`https://documentos-e2e.invalid/crops/${CROP_PATH}`);
  });

  it('R1 — sin los dobles, la URL es la MISMA que compone `cropPublicUrl` para esa ruta', async () => {
    delete process.env[E2E_DOUBLES_VAR];

    const pagina = await proveedores.listCatalogLines('proveedor-1', {}, ACTOR);

    expect(pagina.items[0]?.imageUrl).toBe(cropPublicUrl(CROP_PATH));
  });
});
