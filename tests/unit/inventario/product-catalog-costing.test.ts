// T3 (QC-123) — `inventario` publica los lotes costeables.
//
// HONESTIDAD: este archivo NO toca Postgres, mismo criterio que
// `tests/unit/inventario/product-prisma.test.ts` y `module-contract.test.ts`. Prueba el mapeo
// PURO (`toCostingBatch`) y la FORMA de las consultas de `findCostingBatches` con dobles de
// Prisma, nunca que Postgres filtre de verdad. Esa garantia real la da
// `tests/integration/pedidos/order-ingredients-cost.int.test.ts`.

import { Prisma } from '@prisma/client';

import {
  findCostingBatches,
  toCostingBatch,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { batchCompanyScope } from '@/lib/modules/inventario/adapters/driven/persistence/company-scope';

const { batchFindMany, reservationFindMany } = vi.hoisted(() => ({
  batchFindMany: vi.fn(),
  reservationFindMany: vi.fn(),
}));
vi.mock('@/lib/shared/db/prisma', () => ({
  prisma: {
    productBatch: { findMany: batchFindMany },
    reservationMovement: { findMany: reservationFindMany },
  },
}));

function batchRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'b-1',
    productId: 'p-1',
    lot: '1',
    stock: new Prisma.Decimal(10),
    unitCost: new Prisma.Decimal('1'),
    purchaseDate: new Date('2026-01-01T00:00:00.000Z'),
    presentation: { unitId: 'l' },
    ...overrides,
  };
}

describe('toCostingBatch', () => {
  it('mapea productId, lot, stock, unitCost como cadena, unitId desde la presentacion, purchaseDate en YYYY-MM-DD y el disponible que le llega calculado', () => {
    const batch = toCostingBatch(
      {
        id: 'b-1',
        productId: 'p-1',
        lot: 'L-7',
        stock: new Prisma.Decimal(12),
        unitCost: new Prisma.Decimal('3.5'),
        purchaseDate: new Date('2026-03-04T00:00:00.000Z'),
        presentation: { unitId: 'kg' },
      },
      '9.0000',
    );

    expect(batch).toEqual({
      productId: 'p-1',
      lot: 'L-7',
      stock: '12.0000',
      unitCost: '3.5000',
      unitId: 'kg',
      purchaseDate: '2026-03-04',
      available: '9.0000',
    });
  });
});

describe('findCostingBatches', () => {
  beforeEach(() => {
    batchFindMany.mockReset();
    reservationFindMany.mockReset();
  });

  it('con una lista vacia de ids no consulta la base y devuelve una lista vacia', async () => {
    const batches = await findCostingBatches([], 'empresa-1');
    expect(batches).toEqual([]);
    expect(batchFindMany).not.toHaveBeenCalled();
  });

  it('una sola consulta de lotes para todos los productId, con stock > 0, presentacion y costo, producto vivo y ambito de empresa (R3)', async () => {
    batchFindMany.mockResolvedValueOnce([]);

    await findCostingBatches(['p-1', 'p-2'], 'empresa-1');

    expect(batchFindMany).toHaveBeenCalledTimes(1);
    const args = batchFindMany.mock.calls[0]?.[0];
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

  it('no ordena: la consulta de lotes no declara ningun orderBy (el promedio no depende del orden)', async () => {
    batchFindMany.mockResolvedValueOnce([]);

    await findCostingBatches(['p-1'], 'empresa-1');

    const args = batchFindMany.mock.calls[0]?.[0];
    expect(args.orderBy).toBeUndefined();
  });

  it('el disponible sale del mismo agregado del libro de reservas que usan el listado de lotes y la cobertura, filtrado por empresa (R66)', async () => {
    batchFindMany
      .mockResolvedValueOnce([batchRow({ id: 'b-1', stock: new Prisma.Decimal(10) })])
      .mockResolvedValueOnce([{ id: 'b-1', stock: new Prisma.Decimal(10) }]);
    reservationFindMany.mockResolvedValueOnce([
      { batchId: 'b-1', kind: 'reserve', quantity: new Prisma.Decimal(4) },
    ]);

    const batches = await findCostingBatches(['p-1'], 'empresa-1');

    expect(batches).toHaveLength(1);
    expect(batches[0]?.available).toBe('6.0000');
    const reservationArgs = reservationFindMany.mock.calls[0]?.[0];
    expect(reservationArgs.where.companyId).toBe('empresa-1');
    expect(reservationArgs.where.batchId).toEqual({ in: ['b-1'] });
  });

  it('no devuelve un lote con disponible cero: uno agotado por reserva se excluye (R60)', async () => {
    batchFindMany
      .mockResolvedValueOnce([
        batchRow({ id: 'agotado', lot: 'A', stock: new Prisma.Decimal(10) }),
        batchRow({ id: 'con-disponible', lot: 'B', stock: new Prisma.Decimal(10) }),
      ])
      .mockResolvedValueOnce([
        { id: 'agotado', stock: new Prisma.Decimal(10) },
        { id: 'con-disponible', stock: new Prisma.Decimal(10) },
      ]);
    reservationFindMany.mockResolvedValueOnce([
      { batchId: 'agotado', kind: 'reserve', quantity: new Prisma.Decimal(10) },
      { batchId: 'con-disponible', kind: 'reserve', quantity: new Prisma.Decimal(4) },
    ]);

    const batches = await findCostingBatches(['p-1'], 'empresa-1');

    expect(batches.map((batch) => batch.lot)).toEqual(['B']);
  });

  it('con `excludeOrderId` no resta lo que ESE pedido tiene apartado del disponible (R65)', async () => {
    batchFindMany
      .mockResolvedValueOnce([batchRow({ id: 'b-1', stock: new Prisma.Decimal(10) })])
      .mockResolvedValueOnce([{ id: 'b-1', stock: new Prisma.Decimal(10) }]);
    // Simula lo que devolveria Postgres con el `NOT orderId` aplicado: ninguna fila del
    // pedido excluido -es el unico que tenia algo apartado en este lote.
    reservationFindMany.mockResolvedValueOnce([]);

    const batches = await findCostingBatches(['p-1'], 'empresa-1', { excludeOrderId: 'pedido-1' });

    const args = reservationFindMany.mock.calls[0]?.[0];
    expect(args.where.NOT).toEqual({ orderId: 'pedido-1' });
    // Con ese pedido excluido de lo apartado y sin nadie mas reservando, todo vuelve a estar
    // disponible: el lote que el propio pedido aparto entero no sale del costeo.
    expect(batches[0]?.available).toBe('10.0000');
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
