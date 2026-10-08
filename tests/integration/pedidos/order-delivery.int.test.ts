/**
 * La entrega de producto terminado de punta a punta contra Postgres real, por la fachada de
 * `lib/composition`: `pedidos.deliverOrder` y `pedidos.getOrderDelivery` con su cableado real.
 *
 * AISLAMIENTO: `commit`. La entrega abre su propia `withOrderTransaction` sobre el cliente global,
 * asi que una transaccion del test no la envolveria. Cada caso fabrica sus empresas efimeras y las
 * borra en un `finally` (`tests/helpers/order-delivery-seed.ts`).
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { pedidos } from '@/lib/composition';
import { prisma } from '@/lib/shared/db/prisma';

import {
  borrarEmpresaDeEntrega,
  crearCliente,
  crearEmpresaDeEntrega,
  crearLote,
  crearPedido,
  crearPresentacion,
  crearTerminado,
  escritoPorEntregas,
  stockDeLote,
  stockDeProducto,
  type EmpresaDeEntrega,
} from '../../helpers/order-delivery-seed';

afterAll(async () => {
  await prisma.$disconnect();
});

type Escenario = {
  readonly a: EmpresaDeEntrega;
  readonly b: EmpresaDeEntrega;
  readonly customerId: string;
  readonly otherCustomerId: string;
  readonly orderId: string;
  /** Linea de 5 envases de 2 L y linea de 3 envases de 1 L. */
  readonly lineId: string;
  readonly smallLineId: string;
  readonly productId: string;
  readonly smallProductId: string;
  /** 4 envases de 2 L. */
  readonly batchId: string;
  /** 3 envases de 2 L. */
  readonly secondBatchId: string;
  /** 6 envases de 1 L. */
  readonly smallBatchId: string;
};

async function crearEscenario(): Promise<Escenario> {
  const a = await crearEmpresaDeEntrega('A');
  const b = await crearEmpresaDeEntrega('B');
  const customerId = await crearCliente(a, 'Garcia');
  const otherCustomerId = await crearCliente(a, 'Lopez');
  const presentationId = await crearPresentacion(a, '2.0000');
  const smallPresentationId = await crearPresentacion(a, '1.0000');
  const { orderId, lineIds } = await crearPedido(a, 'TERMINADO', customerId, [
    { presentationId, packages: 5 },
    { presentationId: smallPresentationId, packages: 3 },
  ]);
  const productId = await crearTerminado(a, presentationId);
  const smallProductId = await crearTerminado(a, smallPresentationId);
  const batchId = await crearLote(a, productId, presentationId, '8.0000', '2.0000', '2026-09-01');
  const secondBatchId = await crearLote(a, productId, presentationId, '6.0000', '2.0000', '2026-09-02');
  const smallBatchId = await crearLote(a, smallProductId, smallPresentationId, '6.0000', '1.0000');
  return {
    a,
    b,
    customerId,
    otherCustomerId,
    orderId,
    lineId: lineIds[0] as string,
    smallLineId: lineIds[1] as string,
    productId,
    smallProductId,
    batchId,
    secondBatchId,
    smallBatchId,
  };
}

async function borrarEscenario(e: Escenario): Promise<void> {
  await borrarEmpresaDeEntrega(e.a);
  await borrarEmpresaDeEntrega(e.b);
}

async function pedido(orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, customerId: true, finishedAt: true, packedBy: true, conditionedBy: true },
  });
}

async function codigoDe(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (error) {
    return (error as { code?: string }).code ?? 'sin-codigo';
  }
  return 'no-fallo';
}

describe('deliverOrder contra Postgres', () => {
  it('R17: un pedido de la empresa B es order_not_found y un pedido no TERMINADO es action_not_allowed, sin escribir nada', async () => {
    const e = await crearEscenario();
    try {
      const customerB = await crearCliente(e.b, 'Ajeno');
      const presentationB = await crearPresentacion(e.b, '2.0000');
      const { orderId: orderB, lineIds: linesB } = await crearPedido(e.b, 'TERMINADO', customerB, [
        { presentationId: presentationB, packages: 2 },
      ]);
      const { orderId: enCurso, lineIds: linesEnCurso } = await crearPedido(e.a, 'EN_ACONDICIONAMIENTO', e.customerId, [
        { presentationId: (await prisma.orderPresentationLine.findUniqueOrThrow({ where: { id: e.lineId } })).presentationId, packages: 2 },
      ]);

      expect(
        await codigoDe(
          pedidos.deliverOrder(
            {
              orderId: orderB,
              deliveryKey: randomUUID(),
              customerId: e.customerId,
              allocations: [{ presentationLineId: linesB[0], batchId: e.batchId, packages: 1 }],
            },
            e.a.actor,
          ),
        ),
      ).toBe('order_not_found');
      expect(
        await codigoDe(
          pedidos.deliverOrder(
            {
              orderId: enCurso,
              deliveryKey: randomUUID(),
              customerId: e.customerId,
              allocations: [{ presentationLineId: linesEnCurso[0], batchId: e.batchId, packages: 1 }],
            },
            e.a.actor,
          ),
        ),
      ).toBe('action_not_allowed');

      expect(await escritoPorEntregas(e.a.companyId)).toEqual({ entregas: 0, lineas: 0, asientos: 0 });
      expect(await escritoPorEntregas(e.b.companyId)).toEqual({ entregas: 0, lineas: 0, asientos: 0 });
      expect(await stockDeLote(e.batchId)).toBe('8.0000');
      expect((await pedido(orderB)).status).toBe('TERMINADO');
      expect((await pedido(enCurso)).status).toBe('EN_ACONDICIONAMIENTO');
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R21: un cliente de la empresa B o un cliente dado de baja es customer_not_found, sin escribir nada', async () => {
    const e = await crearEscenario();
    try {
      const customerB = await crearCliente(e.b, 'Ajeno');
      const baja = await crearCliente(e.a, 'DeBaja', new Date());

      for (const customerId of [customerB, baja]) {
        expect(
          await codigoDe(
            pedidos.deliverOrder(
              {
                orderId: e.orderId,
                deliveryKey: randomUUID(),
                customerId,
                allocations: [{ presentationLineId: e.lineId, batchId: e.batchId, packages: 1 }],
              },
              e.a.actor,
            ),
          ),
        ).toBe('customer_not_found');
      }

      expect(await escritoPorEntregas(e.a.companyId)).toEqual({ entregas: 0, lineas: 0, asientos: 0 });
      expect(await stockDeLote(e.batchId)).toBe('8.0000');
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R25, R26: una entrega parcial guarda entrega, lineas y asientos, baja los lotes, deja el pedido TERMINADO y no toca orders.customer_id', async () => {
    const e = await crearEscenario();
    try {
      const deliveryKey = randomUUID();
      const resultado = await pedidos.deliverOrder(
        {
          orderId: e.orderId,
          deliveryKey,
          customerId: e.otherCustomerId,
          allocations: [
            { presentationLineId: e.lineId, batchId: e.batchId, packages: 2 },
            { presentationLineId: e.smallLineId, batchId: e.smallBatchId, packages: 1 },
          ],
        },
        e.a.actor,
      );

      expect(resultado).toEqual({ status: 'delivered', orderStatus: 'TERMINADO' });

      const entrega = await prisma.orderDelivery.findFirstOrThrow({ where: { companyId: e.a.companyId } });
      expect(entrega).toMatchObject({
        orderId: e.orderId,
        customerId: e.otherCustomerId,
        deliveryKey,
        createdBy: e.a.actor.id,
      });
      const lineas = await prisma.orderDeliveryLine.findMany({
        where: { deliveryId: entrega.id },
        orderBy: { packages: 'desc' },
      });
      expect(lineas.map((l) => [l.orderPresentationLineId, l.batchId, l.packages, l.quantity.toFixed(4)])).toEqual([
        [e.lineId, e.batchId, 2, '4.0000'],
        [e.smallLineId, e.smallBatchId, 1, '1.0000'],
      ]);
      const asientos = await prisma.inventoryMovement.findMany({
        where: { orderDeliveryId: entrega.id },
        orderBy: { quantity: 'asc' },
      });
      expect(asientos.map((m) => [m.kind, m.batchId, m.quantity.toFixed(4), m.orderId, m.reason])).toEqual([
        ['delivery', e.batchId, '-4.0000', e.orderId, null],
        ['delivery', e.smallBatchId, '-1.0000', e.orderId, null],
      ]);

      expect(await stockDeLote(e.batchId)).toBe('4.0000');
      expect(await stockDeLote(e.smallBatchId)).toBe('5.0000');
      expect(await stockDeProducto(e.productId)).toBe('10.0000');

      const fila = await pedido(e.orderId);
      expect(fila.status).toBe('TERMINADO');
      expect(fila.customerId).toBe(e.customerId);
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R27: la entrega que completa todas las lineas deja ENTREGADO con finished_at, packed_by y conditioned_by intactos', async () => {
    const e = await crearEscenario();
    try {
      const antes = await pedido(e.orderId);
      const primera = await pedidos.deliverOrder(
        {
          orderId: e.orderId,
          deliveryKey: randomUUID(),
          customerId: e.customerId,
          allocations: [{ presentationLineId: e.lineId, batchId: e.batchId, packages: 2 }],
        },
        e.a.actor,
      );
      expect(primera).toEqual({ status: 'delivered', orderStatus: 'TERMINADO' });

      const segunda = await pedidos.deliverOrder(
        {
          orderId: e.orderId,
          deliveryKey: randomUUID(),
          customerId: e.customerId,
          allocations: [
            { presentationLineId: e.lineId, batchId: e.batchId, packages: 2 },
            { presentationLineId: e.lineId, batchId: e.secondBatchId, packages: 1 },
            { presentationLineId: e.smallLineId, batchId: e.smallBatchId, packages: 3 },
          ],
        },
        e.a.actor,
      );
      expect(segunda).toEqual({ status: 'delivered', orderStatus: 'ENTREGADO' });

      const despues = await pedido(e.orderId);
      expect(despues.status).toBe('ENTREGADO');
      expect(despues.finishedAt).toEqual(antes.finishedAt);
      expect(despues.packedBy).toBe(antes.packedBy);
      expect(despues.conditionedBy).toBe(antes.conditionedBy);
      expect(await stockDeLote(e.batchId)).toBe('0.0000');
      expect(await stockDeLote(e.secondBatchId)).toBe('4.0000');
      expect(await escritoPorEntregas(e.a.companyId)).toEqual({ entregas: 2, lineas: 4, asientos: 4 });
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R29: la misma clave dos veces deja un solo juego de filas y un solo asiento por lote, y la segunda es already_registered', async () => {
    const e = await crearEscenario();
    try {
      const entrada = {
        orderId: e.orderId,
        deliveryKey: randomUUID(),
        customerId: e.customerId,
        allocations: [
          { presentationLineId: e.lineId, batchId: e.batchId, packages: 2 },
          { presentationLineId: e.lineId, batchId: e.secondBatchId, packages: 1 },
        ],
      };

      expect(await pedidos.deliverOrder(entrada, e.a.actor)).toEqual({ status: 'delivered', orderStatus: 'TERMINADO' });
      expect(await pedidos.deliverOrder(entrada, e.a.actor)).toEqual({
        status: 'already_registered',
        orderStatus: 'TERMINADO',
      });

      expect(await escritoPorEntregas(e.a.companyId)).toEqual({ entregas: 1, lineas: 2, asientos: 2 });
      expect(await stockDeLote(e.batchId)).toBe('4.0000');
      expect(await stockDeLote(e.secondBatchId)).toBe('4.0000');
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R29: reintentar con la misma clave la entrega que dejo el pedido ENTREGADO es already_registered con ENTREGADO, sin escribir nada mas', async () => {
    const e = await crearEscenario();
    try {
      const entrada = {
        orderId: e.orderId,
        deliveryKey: randomUUID(),
        customerId: e.customerId,
        allocations: [
          { presentationLineId: e.lineId, batchId: e.batchId, packages: 4 },
          { presentationLineId: e.lineId, batchId: e.secondBatchId, packages: 1 },
          { presentationLineId: e.smallLineId, batchId: e.smallBatchId, packages: 3 },
        ],
      };

      expect(await pedidos.deliverOrder(entrada, e.a.actor)).toEqual({ status: 'delivered', orderStatus: 'ENTREGADO' });
      expect(await pedidos.deliverOrder(entrada, e.a.actor)).toEqual({
        status: 'already_registered',
        orderStatus: 'ENTREGADO',
      });

      expect((await pedido(e.orderId)).status).toBe('ENTREGADO');
      expect(await escritoPorEntregas(e.a.companyId)).toEqual({ entregas: 1, lineas: 3, asientos: 3 });
      expect(await stockDeLote(e.batchId)).toBe('0.0000');
      expect(await stockDeLote(e.secondBatchId)).toBe('4.0000');
      expect(await stockDeLote(e.smallBatchId)).toBe('3.0000');
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R30: si el segundo lote no alcanza no queda nada escrito, ni siquiera la salida del primero', async () => {
    const e = await crearEscenario();
    try {
      const antes = await pedido(e.orderId);
      const codigo = await codigoDe(
        pedidos.deliverOrder(
          {
            orderId: e.orderId,
            deliveryKey: randomUUID(),
            customerId: e.customerId,
            allocations: [
              { presentationLineId: e.lineId, batchId: e.batchId, packages: 1 },
              { presentationLineId: e.lineId, batchId: e.secondBatchId, packages: 4 },
            ],
          },
          e.a.actor,
        ),
      );

      expect(codigo).toBe('delivery_batch_insufficient');
      expect(await escritoPorEntregas(e.a.companyId)).toEqual({ entregas: 0, lineas: 0, asientos: 0 });
      expect(await stockDeLote(e.batchId)).toBe('8.0000');
      expect(await stockDeLote(e.secondBatchId)).toBe('6.0000');
      expect(await stockDeProducto(e.productId)).toBe('14.0000');
      expect(await pedido(e.orderId)).toEqual(antes);
    } finally {
      await borrarEscenario(e);
    }
  });
});

describe('getOrderDelivery contra Postgres', () => {
  it('R5, R6, R7, R9: devuelve pedidos, entregados y faltan por linea, los lotes entregables y el cliente vivo del pedido', async () => {
    const e = await crearEscenario();
    try {
      await pedidos.deliverOrder(
        {
          orderId: e.orderId,
          deliveryKey: randomUUID(),
          customerId: e.customerId,
          allocations: [{ presentationLineId: e.smallLineId, batchId: e.smallBatchId, packages: 3 }],
        },
        e.a.actor,
      );

      const vista = await pedidos.getOrderDelivery(e.orderId, e.a.actor);

      expect(vista.orderId).toBe(e.orderId);
      expect(vista.customer).toMatchObject({ id: e.customerId, isDeleted: false });
      const [grande, chica] = vista.lines;
      expect(grande).toMatchObject({
        presentationLineId: e.lineId,
        orderedPackages: 5,
        deliveredPackages: 0,
        remainingPackages: 5,
      });
      expect(grande?.batches.map((batch) => [batch.batchId, batch.availablePackages])).toEqual([
        [e.batchId, 4],
        [e.secondBatchId, 3],
      ]);
      expect(chica).toMatchObject({
        presentationLineId: e.smallLineId,
        orderedPackages: 3,
        deliveredPackages: 3,
        remainingPackages: 0,
        batches: [],
      });
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R5: un pedido de otra empresa es order_not_found y un pedido ENTREGADO es action_not_allowed', async () => {
    const e = await crearEscenario();
    try {
      const presentationB = await crearPresentacion(e.b, '1.0000');
      const { orderId: orderB } = await crearPedido(e.b, 'TERMINADO', null, [{ presentationId: presentationB, packages: 1 }]);
      const { orderId: entregado } = await crearPedido(e.a, 'ENTREGADO', e.customerId, []);

      expect(await codigoDe(pedidos.getOrderDelivery(orderB, e.a.actor))).toBe('order_not_found');
      expect(await codigoDe(pedidos.getOrderDelivery(entregado, e.a.actor))).toBe('action_not_allowed');
    } finally {
      await borrarEscenario(e);
    }
  });
});
