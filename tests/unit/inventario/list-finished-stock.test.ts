import { describe, expect, it, vi } from 'vitest';

import { createListFinishedStock } from '@/lib/modules/inventario/domain/list-finished-stock';
import { UnauthorizedError, ValidationError } from '@/lib/modules/inventario/domain/errors';
import { PRODUCT_TYPES } from '@/lib/modules/inventario/domain/product-type';

import type { Actor } from '@/lib/modules/inventario/domain/actor';
import type { FinishedStockBatch, FinishedStockGroup } from '@/lib/modules/inventario/domain/finished-stock';
import type { Page } from '@/lib/modules/inventario/domain/page';
import type { ProductView } from '@/lib/modules/inventario/domain/product-view';
import type { FinishedOrderRepository } from '@/lib/modules/inventario/ports/finished-order-repository';
import type { ListQueryLog } from '@/lib/modules/inventario/ports/list-query-log';
import type { OrderNumberFormatter } from '@/lib/modules/inventario/ports/order-number-formatter';

const LECTOR: Actor = { id: 'actor-1', companyId: 'company-a', permissions: ['inventario.consultar'] };

function producto(id: string, name: string, overrides: Partial<ProductView> = {}): ProductView {
  return {
    id,
    name,
    imagePath: null,
    stock: '0.0000',
    unitId: 'unidad-l',
    qtyAlert: null,
    type: PRODUCT_TYPES.FINISHED_PRODUCT,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}

function lote(productId: string, presentationName: string, stock: string, content: string, ordered: number | null): FinishedStockBatch {
  return {
    productId,
    stock,
    packageContent: content,
    orderedPackages: ordered,
    presentationName,
    presentationUnitId: 'unidad-l',
  };
}

function pagina(items: readonly FinishedStockGroup[]): Page<FinishedStockGroup> {
  return { items, total: items.length, page: 1, pageSize: 10, totalPages: 1 };
}

function montar(items: readonly FinishedStockGroup[]) {
  const finishedOrders: FinishedOrderRepository = {
    findBatchesOfOrder: vi.fn<FinishedOrderRepository['findBatchesOfOrder']>(async () => []),
    listStockGroups: vi.fn<FinishedOrderRepository['listStockGroups']>(async () => pagina(items)),
  };
  const orderNumbers: OrderNumberFormatter = {
    format: vi.fn<OrderNumberFormatter['format']>(({ year, sequence }) => `${year}-${String(sequence).padStart(7, '0')}`),
  };
  const log: ListQueryLog = { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() };
  return { finishedOrders, orderNumbers, log, listar: createListFinishedStock({ finishedOrders, orderNumbers, log }) };
}

const CHICA = producto('p-chica', 'Limpiador · Botella 250 ml', { qtyAlert: '2.0000' });
const GRANDE = producto('p-grande', 'Limpiador · Botella 1 L');

describe('listFinishedStock', () => {
  it('una fila por pedido con la existencia en envases por presentacion y sus productos ordenados por nombre', async () => {
    const { listar, orderNumbers } = montar([
      {
        kind: 'order',
        orderId: 'pedido-1',
        orderNumber: { year: 2026, sequence: 12 },
        recipeName: 'Limpiador',
        products: [CHICA, GRANDE],
        batches: [lote('p-chica', 'Botella 250 ml', '1.5000', '0.25', 6), lote('p-grande', 'Botella 1 L', '1.0000', '1', 1)],
      },
    ]);

    const page = await listar({}, LECTOR);

    expect(orderNumbers.format).toHaveBeenCalledWith({ year: 2026, sequence: 12 });
    expect(page.items).toEqual([
      {
        kind: 'order',
        key: 'order:pedido-1',
        orderId: 'pedido-1',
        orderNumber: { year: 2026, sequence: 12 },
        numberText: '2026-0000012',
        recipeName: 'Limpiador',
        packagedStock: [
          { name: 'Botella 1 L', packages: '1', remainder: null, unitId: 'unidad-l' },
          { name: 'Botella 250 ml', packages: '6', remainder: null, unitId: 'unidad-l' },
        ],
        products: [
          {
            product: GRANDE,
            stock: '1.0000',
            packagedStock: [{ name: 'Botella 1 L', packages: '1', remainder: null, unitId: 'unidad-l' }],
          },
          {
            product: CHICA,
            stock: '1.5000',
            packagedStock: [{ name: 'Botella 250 ml', packages: '6', remainder: null, unitId: 'unidad-l' }],
          },
        ],
      },
    ]);
  });

  it('el resto tras un ajuste va en la unidad de la presentacion y el tope son los envases de la linea', async () => {
    const { listar } = montar([
      {
        kind: 'order',
        orderId: 'pedido-1',
        orderNumber: { year: 2026, sequence: 1 },
        recipeName: 'Limpiador',
        products: [CHICA],
        // 1.45 caben 5 envases de 0.25 con 0.2 de resto; 3.0 serian 12 envases, pero la linea pidio 10.
        batches: [lote('p-chica', 'Botella 250 ml', '1.4500', '0.25', 6), lote('p-chica', 'Botella 250 ml', '3.0000', '0.25', 10)],
      },
    ]);

    const [fila] = (await listar({}, LECTOR)).items;

    expect(fila?.kind === 'order' ? fila.packagedStock : undefined).toEqual([
      { name: 'Botella 250 ml', packages: '15', remainder: '0.7', unitId: 'unidad-l' },
    ]);
  });

  it('un producto del pedido sin existencia sale con envases vacios, no con null', async () => {
    const { listar } = montar([
      {
        kind: 'order',
        orderId: 'pedido-1',
        orderNumber: { year: 2026, sequence: 1 },
        recipeName: null,
        products: [CHICA, GRANDE],
        batches: [lote('p-chica', 'Botella 250 ml', '0.0000', '0.25', 6), lote('p-grande', 'Botella 1 L', '2.0000', '1', 2)],
      },
    ]);

    const [fila] = (await listar({}, LECTOR)).items;

    expect(fila?.products.map((linea) => [linea.product.id, linea.stock, linea.packagedStock])).toEqual([
      ['p-grande', '2.0000', [{ name: 'Botella 1 L', packages: '2', remainder: null, unitId: 'unidad-l' }]],
      ['p-chica', '0.0000', []],
    ]);
  });

  it('la fila sin pedido trae la existencia de sus lotes en la unidad del producto y el propio producto', async () => {
    const legado = producto('p-legado', 'Limpiador · Garrafa', { stock: '9.0000' });
    const { listar } = montar([
      {
        kind: 'withoutOrder',
        product: legado,
        batches: [lote('p-legado', 'Garrafa 5 L', '2.5000', '5', null), lote('p-legado', 'Garrafa 5 L', '1.0000', '5', null)],
      },
    ]);

    const page = await listar({}, LECTOR);

    expect(page.items).toEqual([
      {
        kind: 'withoutOrder',
        key: 'product:p-legado',
        productId: 'p-legado',
        stock: '3.5000',
        unitId: 'unidad-l',
        products: [{ product: legado, stock: '3.5000', packagedStock: null }],
      },
    ]);
  });

  it('pasa la busqueda y la pagina al repositorio con la empresa del actor, y poda orden y filtros', async () => {
    const { listar, finishedOrders, log } = montar([]);

    await listar(
      {
        page: 2,
        pageSize: 5,
        search: '2026-00',
        sort: { columnId: 'stock', direction: 'asc' },
        filters: { qtyAlert: { kind: 'numberRange', min: 1, max: null }, type: { kind: 'select', values: ['PRODUCT'] } },
      },
      LECTOR,
    );

    expect(finishedOrders.listStockGroups).toHaveBeenCalledWith(
      { page: 2, pageSize: 5, search: '2026-00', sort: null, filters: {} },
      { companyId: 'company-a' },
    );
    expect(log.ignoredFields).toHaveBeenCalledWith('finished-stock', ['stock', 'qtyAlert', 'type']);
  });

  it('sin inventario.consultar rechaza sin tocar el puerto; una consulta mal formada es ValidationError', async () => {
    const { listar, finishedOrders } = montar([]);

    await expect(listar({}, { ...LECTOR, permissions: ['inventario.modificar'] })).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(listar({ page: 0 }, LECTOR)).rejects.toBeInstanceOf(ValidationError);
    expect(finishedOrders.listStockGroups).not.toHaveBeenCalled();
  });
});
