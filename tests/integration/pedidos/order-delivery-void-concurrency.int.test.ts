/**
 * Anulaciones reales a la vez contra Postgres, por la fachada de `lib/composition`: lo que se mide
 * es que el bloqueo del pedido y el unico de `delivery_line_id` serializan de verdad, y que una
 * anulacion y una entrega del mismo pedido no dejan el libro descuadrado. El caso de la misma clave
 * ata `voidDelivery` a mano con los mismos adaptadores reales, para obligar a los dos envios a pasar
 * la lectura previa de la clave antes de competir por el bloqueo.
 *
 * AISLAMIENTO: `commit`. Cada `withOrderTransaction` tiene que confirmar para que la otra vea lo
 * que escribio, asi que una transaccion del test no puede envolverlas. Cada caso fabrica su empresa
 * efimera y la borra en un `finally` (`tests/helpers/order-delivery-seed.ts`), antes las filas de la
 * anulacion.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { pedidos } from '@/lib/composition';
import { createFinishedGoodsReturn } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-return-prisma';
import { createVoidDelivery, type Actor } from '@/lib/modules/pedidos';
import { createOrderDeliveryVoidRepository } from '@/lib/modules/pedidos/adapters/driven/persistence/order-delivery-void-prisma';
import {
  createOrderWriteRepository,
  findAliveOrderById,
  findBlockedOrderIds,
  listAliveOrders,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import {
  borrarEmpresaDeEntrega,
  crearCliente,
  crearEmpresaDeEntrega,
  crearLote,
  crearPedido,
  crearPresentacion,
  crearTerminado,
  stockDeLote,
  stockDeProducto,
  type EmpresaDeEntrega,
} from '../../helpers/order-delivery-seed';

afterAll(async () => {
  await prisma.$disconnect();
});

type Escenario = {
  readonly empresa: EmpresaDeEntrega;
  readonly admin: Actor;
  readonly customerId: string;
  readonly orderId: string;
  readonly lineId: string;
  readonly productId: string;
  /** 10 envases de 1 L. */
  readonly batchId: string;
  /** 10 envases de 1 L. */
  readonly secondBatchId: string;
};

/** Pedido TERMINADO de 5 envases de 1 L con dos lotes de 10 envases. */
async function crearEscenario(label: string): Promise<Escenario> {
  const empresa = await crearEmpresaDeEntrega(label);
  const customerId = await crearCliente(empresa, 'Garcia');
  const presentationId = await crearPresentacion(empresa, '1.0000');
  const { orderId, lineIds } = await crearPedido(empresa, 'TERMINADO', customerId, [{ presentationId, packages: 5 }]);
  const productId = await crearTerminado(empresa, presentationId);
  const batchId = await crearLote(empresa, productId, presentationId, '10.0000', '1.0000', '2026-09-01');
  const secondBatchId = await crearLote(empresa, productId, presentationId, '10.0000', '1.0000', '2026-09-02');
  return {
    empresa,
    admin: { ...empresa.actor, permissions: ['entregas.modificar', 'entregas.anular', 'pedidos.consultar'] },
    customerId,
    orderId,
    lineId: lineIds[0] as string,
    productId,
    batchId,
    secondBatchId,
  };
}

async function borrarEscenario(e: Escenario): Promise<void> {
  const companyId = e.empresa.companyId;
  await prisma.inventoryMovement.deleteMany({ where: { companyId } });
  await prisma.orderDeliveryVoidLine.deleteMany({ where: { companyId } });
  await prisma.orderDeliveryVoid.deleteMany({ where: { companyId } });
  await borrarEmpresaDeEntrega(e.empresa);
}

/** Entrega los envases de `porLote` desde el primer y el segundo lote y devuelve el id de la entrega. */
async function entregar(e: Escenario, porLote: readonly [number, number]): Promise<string> {
  const deliveryKey = randomUUID();
  await pedidos.deliverOrder(
    {
      orderId: e.orderId,
      deliveryKey,
      customerId: e.customerId,
      allocations: [
        { presentationLineId: e.lineId, batchId: e.batchId, packages: porLote[0] },
        { presentationLineId: e.lineId, batchId: e.secondBatchId, packages: porLote[1] },
      ].filter((a) => a.packages > 0),
    },
    e.empresa.actor,
  );
  const { id } = await prisma.orderDelivery.findFirstOrThrow({ where: { deliveryKey }, select: { id: true } });
  return id;
}

function codigos(resultados: readonly PromiseSettledResult<unknown>[]): string[] {
  return resultados
    .map((r) => (r.status === 'fulfilled' ? 'aplicada' : ((r.reason as { code?: string }).code ?? String(r.reason))))
    .sort();
}

/** Cada lote cuadra con la suma de sus asientos, ninguno queda negativo y el producto es la suma de sus lotes. */
async function expectExistenciaCuadra(e: Escenario): Promise<void> {
  for (const batchId of [e.batchId, e.secondBatchId]) {
    const { stock } = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } });
    const { _sum } = await prisma.inventoryMovement.aggregate({ where: { batchId }, _sum: { quantity: true } });
    expect(_sum.quantity?.toFixed(4)).toBe(stock.toFixed(4));
  }
  const negativos = await prisma.productBatch.count({ where: { companyId: e.empresa.companyId, stock: { lt: 0 } } });
  expect(negativos).toBe(0);
  const { _sum } = await prisma.productBatch.aggregate({ where: { productId: e.productId }, _sum: { stock: true } });
  expect(await stockDeProducto(e.productId)).toBe(_sum.stock?.toFixed(4));
}

/** Envases entregados de la linea sin contar los anulados. */
async function entregadosVivos(e: Escenario): Promise<number> {
  const { _sum } = await prisma.orderDeliveryLine.aggregate({
    where: { orderPresentationLineId: e.lineId, voidLine: null },
    _sum: { packages: true },
  });
  return _sum.packages ?? 0;
}

/**
 * `voidDelivery` con los mismos adaptadores reales que ata `lib/composition`, salvo que la lectura
 * PREVIA de la clave espera a que las `participantes` peticiones la hayan hecho antes de devolver lo
 * que leyo. Las lecturas siguientes (la relectura tras la senal de clave ya registrada) van directas.
 */
function voidDeliveryConLecturaPreviaSincronizada(participantes: number) {
  const voids = createOrderDeliveryVoidRepository();
  let previas = 0;
  let soltar: () => void = () => undefined;
  const todasLeyeron = new Promise<void>((resolve) => {
    soltar = resolve;
  });
  return createVoidDelivery({
    unitOfWork: {
      run: (work) =>
        withOrderTransaction((tx) =>
          work({
            orders: createOrderWriteRepository(tx),
            voids: createOrderDeliveryVoidRepository(tx),
            finishedGoods: createFinishedGoodsReturn(tx),
          }),
        ),
    },
    voids: {
      findByKey: async (voidKey, scope) => {
        if (previas >= participantes) return voids.findByKey(voidKey, scope);
        previas += 1;
        const leida = await voids.findByKey(voidKey, scope);
        if (previas === participantes) soltar();
        await todasLeyeron;
        return leida;
      },
      findDelivery: (deliveryId, scope) => voids.findDelivery(deliveryId, scope),
    },
    orders: { findAliveById: findAliveOrderById, listAlive: listAliveOrders, findBlockedIds: findBlockedOrderIds },
  });
}

describe('R30: anulaciones simultaneas', () => {
  it('R30: dos anulaciones a la vez de la misma presentacion: una aplicada y la otra delivery_already_voided, y los envases vuelven una sola vez', async () => {
    const e = await crearEscenario('anulacion-doble');
    try {
      const deliveryId = await entregar(e, [3, 2]);
      expect(await stockDeLote(e.batchId)).toBe('7.0000');
      expect(await stockDeLote(e.secondBatchId)).toBe('8.0000');
      const anulacion = () =>
        pedidos.voidDelivery(
          { deliveryId, voidKey: randomUUID(), presentationLineIds: [e.lineId], reason: 'Devolucion del cliente' },
          e.admin,
        );

      // Sin `await` entre las dos: compiten de verdad por el bloqueo del pedido.
      const resultados = await Promise.allSettled([anulacion(), anulacion()]);

      expect(codigos(resultados)).toEqual(['aplicada', 'delivery_already_voided']);
      expect(await prisma.orderDeliveryVoid.count({ where: { companyId: e.empresa.companyId } })).toBe(1);
      expect(await prisma.orderDeliveryVoidLine.count({ where: { companyId: e.empresa.companyId } })).toBe(2);
      expect(
        await prisma.inventoryMovement.count({ where: { companyId: e.empresa.companyId, kind: 'delivery_void' } }),
      ).toBe(2);
      expect(await stockDeLote(e.batchId)).toBe('10.0000');
      expect(await stockDeLote(e.secondBatchId)).toBe('10.0000');
      await expectExistenciaCuadra(e);
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R28, R30: dos envios a la vez con la misma clave: uno voided y el otro already_registered, y una sola anulacion escrita', async () => {
    const e = await crearEscenario('anulacion-clave');
    try {
      const deliveryId = await entregar(e, [5, 0]);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: e.orderId } })).status).toBe('ENTREGADO');
      const anular = voidDeliveryConLecturaPreviaSincronizada(2);
      const entrada = { deliveryId, voidKey: randomUUID(), presentationLineIds: [e.lineId], reason: 'Devolucion' };

      const resultados = await Promise.all([anular(entrada, e.admin), anular(entrada, e.admin)]);

      expect(resultados.map((r) => r.status).sort()).toEqual(['already_registered', 'voided']);
      expect(resultados.map((r) => r.orderStatus)).toEqual(['TERMINADO', 'TERMINADO']);
      expect(await prisma.orderDeliveryVoid.count({ where: { companyId: e.empresa.companyId } })).toBe(1);
      expect(
        await prisma.inventoryMovement.count({ where: { companyId: e.empresa.companyId, kind: 'delivery_void' } }),
      ).toBe(1);
      expect(await stockDeLote(e.batchId)).toBe('10.0000');
      await expectExistenciaCuadra(e);
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R27, R30: una anulacion y la entrega que completaria el pedido, a la vez: se aplican las dos una detras de otra, el pedido acaba TERMINADO y el libro cuadra', async () => {
    const e = await crearEscenario('anulacion-y-entrega');
    try {
      const deliveryId = await entregar(e, [3, 0]);
      expect(await stockDeLote(e.batchId)).toBe('7.0000');

      const resultados = await Promise.allSettled([
        pedidos.voidDelivery(
          { deliveryId, voidKey: randomUUID(), presentationLineIds: [e.lineId], reason: 'Devolucion del cliente' },
          e.admin,
        ),
        pedidos.deliverOrder(
          {
            orderId: e.orderId,
            deliveryKey: randomUUID(),
            customerId: e.customerId,
            allocations: [{ presentationLineId: e.lineId, batchId: e.secondBatchId, packages: 2 }],
          },
          e.empresa.actor,
        ),
      ]);

      // En cualquier orden caben las dos: con la entrega primero el pedido pasa a ENTREGADO y la
      // anulacion lo devuelve a TERMINADO; con la anulacion primero la entrega deja 2 de 5 vivos.
      expect(codigos(resultados)).toEqual(['aplicada', 'aplicada']);

      const anuladas = await prisma.orderDeliveryVoidLine.count({ where: { companyId: e.empresa.companyId } });
      expect(anuladas).toBe(1);
      expect(await stockDeLote(e.batchId)).toBe('10.0000');
      expect(await stockDeLote(e.secondBatchId)).toBe('8.0000');
      expect(await entregadosVivos(e)).toBe(2);
      const { status } = await prisma.order.findUniqueOrThrow({ where: { id: e.orderId }, select: { status: true } });
      expect(status).toBe('TERMINADO');
      await expectExistenciaCuadra(e);
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R30: una anulacion y una entrega que solo cabe si la anulacion va primero: o se aplican las dos o la entrega es delivery_exceeds_remaining, y el libro cuadra', async () => {
    const e = await crearEscenario('anulacion-y-exceso');
    try {
      const deliveryId = await entregar(e, [3, 0]);

      const resultados = await Promise.allSettled([
        pedidos.voidDelivery(
          { deliveryId, voidKey: randomUUID(), presentationLineIds: [e.lineId], reason: 'Devolucion del cliente' },
          e.admin,
        ),
        pedidos.deliverOrder(
          {
            orderId: e.orderId,
            deliveryKey: randomUUID(),
            customerId: e.customerId,
            allocations: [{ presentationLineId: e.lineId, batchId: e.secondBatchId, packages: 4 }],
          },
          e.empresa.actor,
        ),
      ]);

      const [anulacion, entrega] = codigos([resultados[0]]).concat(codigos([resultados[1]]));
      expect(anulacion).toBe('aplicada');
      expect(['aplicada', 'delivery_exceeds_remaining']).toContain(entrega);

      // Con la anulacion primero quedan 5 pendientes y caben los 4; con la entrega primero solo
      // quedaban 2. En los dos ordenes nunca hay mas envases vivos que los pedidos.
      const vivos = await entregadosVivos(e);
      expect(vivos).toBe(entrega === 'aplicada' ? 4 : 0);
      expect(await stockDeLote(e.batchId)).toBe('10.0000');
      expect(await stockDeLote(e.secondBatchId)).toBe(entrega === 'aplicada' ? '6.0000' : '10.0000');
      const { status } = await prisma.order.findUniqueOrThrow({ where: { id: e.orderId }, select: { status: true } });
      expect(status).toBe('TERMINADO');
      await expectExistenciaCuadra(e);
    } finally {
      await borrarEscenario(e);
    }
  });
});
