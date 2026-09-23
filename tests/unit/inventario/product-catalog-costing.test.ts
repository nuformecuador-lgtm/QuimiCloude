// T3 (QC-123) — `inventario` publica los lotes costeables.
//
// HONESTIDAD: este archivo NO toca Postgres, mismo criterio que
// `tests/unit/inventario/product-prisma.test.ts` y `module-contract.test.ts`. Prueba el mapeo
// PURO (`toCostingBatch`) y la FORMA de la consulta de `findCostingBatches` con un doble de
// Prisma, nunca que Postgres filtre de verdad. Esa garantia real la da
// `tests/integration/pedidos/order-ingredients-cost.int.test.ts`.

import { Prisma } from '@prisma/client';

import {
  findCostingBatches,
  toCostingBatch,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { batchCompanyScope } from '@/lib/modules/inventario/adapters/driven/persistence/company-scope';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: { productBatch: { findMany } } }));

describe('toCostingBatch', () => {
  it('mapea productId, lot, stock, unitCost como cadena, unitId desde la presentacion y purchaseDate en YYYY-MM-DD', () => {
    const batch = toCostingBatch({
      productId: 'p-1',
      lot: 'L-7',
      stock: new Prisma.Decimal(12),
      unitCost: new Prisma.Decimal('3.5'),
      purchaseDate: new Date('2026-03-04T00:00:00.000Z'),
      presentation: { unitId: 'kg' },
    });

    expect(batch).toEqual({
      productId: 'p-1',
      lot: 'L-7',
      stock: '12.0000',
      unitCost: '3.5000',
      unitId: 'kg',
      purchaseDate: '2026-03-04',
    });
  });
});

describe('findCostingBatches', () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it('con una lista vacia de ids no consulta la base y devuelve una lista vacia', async () => {
    const batches = await findCostingBatches([], 'empresa-1');
    expect(batches).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('una sola consulta para todos los productId, con stock > 0, presentacion y costo, producto vivo y ambito de empresa (R3)', async () => {
    findMany.mockResolvedValue([]);

    await findCostingBatches(['p-1', 'p-2'], 'empresa-1');

    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0]?.[0];
    expect(args.where).toEqual({
      AND: [
        batchCompanyScope({ companyId: 'empresa-1' }),
        {
          productId: { in: ['p-1', 'p-2'] },
          stock: { gt: 0 },
          presentationId: { not: null },
          unitCost: { not: null },
          product: { deletedAt: null },
        },
      ],
    });
  });

  it('no devuelve lotes con existencia cero (R3)', async () => {
    // Con mocks no se prueba que Postgres filtre de verdad -eso es de
    // `tests/integration/**`-, pero SI que la consulta pide `stock: { gt: 0 }` en el `where`,
    // que es lo que hace que un lote agotado nunca vuelva.
    findMany.mockResolvedValue([]);

    await findCostingBatches(['p-1'], 'empresa-1');

    const args = findMany.mock.calls[0]?.[0];
    expect(args.where.AND[1].stock).toEqual({ gt: 0 });
  });

  it('no ordena: la consulta no declara ningun orderBy (el orden es del dominio de pedidos)', async () => {
    findMany.mockResolvedValue([]);

    await findCostingBatches(['p-1'], 'empresa-1');

    const args = findMany.mock.calls[0]?.[0];
    expect(args.orderBy).toBeUndefined();
  });

  it('el contrato de costeo no expone ninguna escritura (R22)', () => {
    // El adaptador solo publica `findCostingBatches` (una lectura) y su mapeo puro
    // `toCostingBatch`: ningun nombre exportado por este archivo denota crear, actualizar,
    // borrar ni ajustar existencia.
    const modulo = { findCostingBatches, toCostingBatch };
    const nombresDeEscritura = Object.keys(modulo).filter((nombre) =>
      /create|update|delete|adjust|write|insert|remove/i.test(nombre),
    );
    expect(nombresDeEscritura).toEqual([]);
  });
});
