import { describe, expect, it, vi } from 'vitest';

import { createListOrderBatches } from '@/lib/modules/inventario/domain/list-order-batches';
import { UnauthorizedError, ValidationError } from '@/lib/modules/inventario/domain/errors';

import type { Actor } from '@/lib/modules/inventario/domain/actor';
import type { FinishedOrderRepository } from '@/lib/modules/inventario/ports/finished-order-repository';

const ORDER_ID = '7d3f0c1e-2b4a-4c5d-8e9f-0a1b2c3d4e5f';
const PRODUCT_ID = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d';

const LECTOR: Actor = { id: 'actor-1', companyId: 'company-a', permissions: ['inventario.consultar'] };

const LOTE = {
  id: 'lote-1',
  lot: '7',
  stock: '5.0000',
  unitId: 'unidad-l',
  purchaseDate: '2026-10-01',
  expiryDate: null,
  packageContent: '0.5000',
  presentationName: 'Botella 500 ml',
  reserved: '0.0000',
  available: '5.0000',
  overReserved: false,
};

function repositorio(): FinishedOrderRepository & { findBatchesOfOrder: ReturnType<typeof vi.fn> } {
  return {
    findBatchesOfOrder: vi.fn<FinishedOrderRepository['findBatchesOfOrder']>(async () => [LOTE]),
    listStockGroups: vi.fn<FinishedOrderRepository['listStockGroups']>(async () => {
      throw new Error('no se usa aqui');
    }),
  };
}

describe('listOrderBatches', () => {
  it('devuelve los lotes del pedido pidiendolos con la empresa del actor', async () => {
    const finishedOrders = repositorio();

    const lotes = await createListOrderBatches({ finishedOrders })(ORDER_ID, LECTOR);

    expect(lotes).toEqual([LOTE]);
    expect(finishedOrders.findBatchesOfOrder).toHaveBeenCalledWith(ORDER_ID, { companyId: 'company-a' }, null);
  });

  it('con productId filtra por el producto dentro del pedido', async () => {
    const finishedOrders = repositorio();

    await createListOrderBatches({ finishedOrders })(ORDER_ID, LECTOR, PRODUCT_ID);

    expect(finishedOrders.findBatchesOfOrder).toHaveBeenCalledWith(ORDER_ID, { companyId: 'company-a' }, PRODUCT_ID);
  });

  it('sin pedido pide los lotes sin pedido del producto', async () => {
    const finishedOrders = repositorio();

    await createListOrderBatches({ finishedOrders })(null, LECTOR, PRODUCT_ID);

    expect(finishedOrders.findBatchesOfOrder).toHaveBeenCalledWith(null, { companyId: 'company-a' }, PRODUCT_ID);
  });

  it('sin pedido y sin producto es ValidationError y no llega al puerto', async () => {
    const finishedOrders = repositorio();

    await expect(createListOrderBatches({ finishedOrders })(null, LECTOR)).rejects.toBeInstanceOf(ValidationError);
    await expect(createListOrderBatches({ finishedOrders })(ORDER_ID, LECTOR, 'producto-1')).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(finishedOrders.findBatchesOfOrder).not.toHaveBeenCalled();
  });

  it('sin inventario.consultar rechaza sin tocar el puerto', async () => {
    const finishedOrders = repositorio();
    const sinPermiso: Actor = { ...LECTOR, permissions: ['inventario.modificar'] };

    await expect(createListOrderBatches({ finishedOrders })(ORDER_ID, sinPermiso)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(finishedOrders.findBatchesOfOrder).not.toHaveBeenCalled();
  });

  it('un orderId que no es uuid es ValidationError y no llega al puerto', async () => {
    const finishedOrders = repositorio();

    await expect(createListOrderBatches({ finishedOrders })('pedido-1', LECTOR)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(finishedOrders.findBatchesOfOrder).not.toHaveBeenCalled();
  });
});
