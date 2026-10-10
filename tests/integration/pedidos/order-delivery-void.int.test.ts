/**
 * La anulacion de entregas de punta a punta contra Postgres real, por la fachada de
 * `lib/composition`: `pedidos.voidDelivery` y `pedidos.listOrderDeliveries` con su cableado real,
 * y `pedidos.getOrderDelivery` / `pedidos.deliverOrder` para ver que lo anulado vuelve a estar
 * pendiente. El caso del fallo forzado ata `voidDelivery` a mano con los mismos adaptadores reales
 * y una pieza que falla despues de la devolucion.
 *
 * AISLAMIENTO: `commit`. La anulacion abre su propia `withOrderTransaction` sobre el cliente
 * global, asi que una transaccion del test no la envolveria. Cada caso fabrica sus empresas
 * efimeras y las borra en un `finally` (`tests/helpers/order-delivery-seed.ts`), antes las filas de
 * la anulacion.
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
  escritoPorEntregas,
  stockDeLote,
  stockDeProducto,
  type EmpresaDeEntrega,
} from '../../helpers/order-delivery-seed';

afterAll(async () => {
  await prisma.$disconnect();
});

const PERMISOS_ADMIN = ['entregas.modificar', 'entregas.anular', 'pedidos.consultar'] as const;

function administrador(empresa: EmpresaDeEntrega): Actor {
  return { ...empresa.actor, permissions: [...PERMISOS_ADMIN] };
}

type Escenario = {
  readonly a: EmpresaDeEntrega;
  readonly b: EmpresaDeEntrega;
  readonly admin: Actor;
  readonly customerId: string;
  readonly orderId: string;
  /** Linea de 5 envases de 2 L y linea de 3 envases de 1 L. */
  readonly lineId: string;
  readonly smallLineId: string;
  readonly presentationId: string;
  readonly smallPresentationId: string;
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
    admin: administrador(a),
    customerId,
    orderId,
    lineId: lineIds[0] as string,
    smallLineId: lineIds[1] as string,
    presentationId,
    smallPresentationId,
    productId,
    smallProductId,
    batchId,
    secondBatchId,
    smallBatchId,
  };
}

async function borrarAnulaciones(companyId: string): Promise<void> {
  await prisma.inventoryMovement.deleteMany({ where: { companyId } });
  await prisma.orderDeliveryVoidLine.deleteMany({ where: { companyId } });
  await prisma.orderDeliveryVoid.deleteMany({ where: { companyId } });
}

async function borrarEscenario(e: Escenario): Promise<void> {
  await borrarAnulaciones(e.a.companyId);
  await borrarAnulaciones(e.b.companyId);
  await borrarEmpresaDeEntrega(e.a);
  await borrarEmpresaDeEntrega(e.b);
}

/** Entrega todo el pedido en una sola entrega: 2 L desde dos lotes (4 + 1) y 1 L (3). Queda ENTREGADO. */
async function entregarTodo(e: Escenario): Promise<string> {
  const deliveryKey = randomUUID();
  const resultado = await pedidos.deliverOrder(
    {
      orderId: e.orderId,
      deliveryKey,
      customerId: e.customerId,
      allocations: [
        { presentationLineId: e.lineId, batchId: e.batchId, packages: 4 },
        { presentationLineId: e.lineId, batchId: e.secondBatchId, packages: 1 },
        { presentationLineId: e.smallLineId, batchId: e.smallBatchId, packages: 3 },
      ],
    },
    e.a.actor,
  );
  expect(resultado).toEqual({ status: 'delivered', orderStatus: 'ENTREGADO' });
  const { id } = await prisma.orderDelivery.findFirstOrThrow({ where: { deliveryKey }, select: { id: true } });
  return id;
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

/** Lo que una anulacion escribe en la empresa: anulaciones, lineas de anulacion y asientos `delivery_void`. */
async function escritoPorAnulaciones(
  companyId: string,
): Promise<{ anulaciones: number; lineas: number; asientos: number }> {
  return {
    anulaciones: await prisma.orderDeliveryVoid.count({ where: { companyId } }),
    lineas: await prisma.orderDeliveryVoidLine.count({ where: { companyId } }),
    asientos: await prisma.inventoryMovement.count({ where: { companyId, kind: 'delivery_void' } }),
  };
}

/** La entrega, sus lineas y sus asientos `delivery`, en todas sus columnas. */
async function fotoDeEntregas(companyId: string) {
  return {
    entregas: await prisma.orderDelivery.findMany({ where: { companyId }, orderBy: { id: 'asc' } }),
    lineas: await prisma.orderDeliveryLine.findMany({ where: { companyId }, orderBy: { id: 'asc' } }),
    asientos: await prisma.inventoryMovement.findMany({ where: { companyId, kind: 'delivery' }, orderBy: { id: 'asc' } }),
  };
}

/** La existencia de cada lote es la suma de sus asientos. */
async function expectLibroCuadra(batchIds: readonly string[]): Promise<void> {
  for (const batchId of batchIds) {
    const { stock } = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } });
    const { _sum } = await prisma.inventoryMovement.aggregate({ where: { batchId }, _sum: { quantity: true } });
    expect(_sum.quantity?.toFixed(4)).toBe(stock.toFixed(4));
  }
}

function anular(e: Escenario, deliveryId: string, presentationLineIds: readonly string[], extra: { voidKey?: string; reason?: string } = {}) {
  return pedidos.voidDelivery(
    {
      deliveryId,
      voidKey: extra.voidKey ?? randomUUID(),
      presentationLineIds,
      reason: extra.reason ?? 'El cliente devolvio el producto',
    },
    e.admin,
  );
}

describe('voidDelivery contra Postgres', () => {
  it('R18: la entrega de la empresa B y una que no existe son delivery_not_found, sin escribir nada', async () => {
    const e = await crearEscenario();
    try {
      const customerB = await crearCliente(e.b, 'Ajeno');
      const presentationB = await crearPresentacion(e.b, '1.0000');
      const { orderId: orderB, lineIds: linesB } = await crearPedido(e.b, 'TERMINADO', customerB, [
        { presentationId: presentationB, packages: 2 },
      ]);
      const productB = await crearTerminado(e.b, presentationB);
      const batchB = await crearLote(e.b, productB, presentationB, '4.0000', '1.0000');
      const keyB = randomUUID();
      await pedidos.deliverOrder(
        {
          orderId: orderB,
          deliveryKey: keyB,
          customerId: customerB,
          allocations: [{ presentationLineId: linesB[0], batchId: batchB, packages: 2 }],
        },
        e.b.actor,
      );
      const { id: deliveryB } = await prisma.orderDelivery.findFirstOrThrow({ where: { deliveryKey: keyB } });

      expect(await codigoDe(anular(e, deliveryB, [linesB[0] as string]))).toBe('delivery_not_found');
      expect(await codigoDe(anular(e, randomUUID(), [e.lineId]))).toBe('delivery_not_found');

      expect(await escritoPorAnulaciones(e.a.companyId)).toEqual({ anulaciones: 0, lineas: 0, asientos: 0 });
      expect(await escritoPorAnulaciones(e.b.companyId)).toEqual({ anulaciones: 0, lineas: 0, asientos: 0 });
      expect(await stockDeLote(batchB)).toBe('2.0000');
      expect((await pedido(orderB)).status).toBe('ENTREGADO');
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R19: un pedido que ya no esta TERMINADO ni ENTREGADO es action_not_allowed, sin escribir nada', async () => {
    const e = await crearEscenario();
    try {
      const deliveryId = await entregarTodo(e);
      await prisma.order.update({ where: { id: e.orderId }, data: { status: 'EN_ACONDICIONAMIENTO', finishedAt: null } });

      expect(await codigoDe(anular(e, deliveryId, [e.lineId]))).toBe('action_not_allowed');

      expect(await escritoPorAnulaciones(e.a.companyId)).toEqual({ anulaciones: 0, lineas: 0, asientos: 0 });
      expect(await stockDeLote(e.batchId)).toBe('0.0000');
      expect(await stockDeLote(e.secondBatchId)).toBe('4.0000');
      expect((await pedido(e.orderId)).status).toBe('EN_ACONDICIONAMIENTO');
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R20, R21: una presentacion que no es de la entrega es invalid_input, y una ya anulada es delivery_already_voided sin anular las otras', async () => {
    const e = await crearEscenario();
    try {
      const deliveryId = await entregarTodo(e);

      expect(await codigoDe(anular(e, deliveryId, [e.lineId, randomUUID()]))).toBe('invalid_input');
      expect(await escritoPorAnulaciones(e.a.companyId)).toEqual({ anulaciones: 0, lineas: 0, asientos: 0 });

      await anular(e, deliveryId, [e.lineId]);
      const despuesDeLaPrimera = await escritoPorAnulaciones(e.a.companyId);

      expect(await codigoDe(anular(e, deliveryId, [e.smallLineId, e.lineId]))).toBe('delivery_already_voided');
      expect(await escritoPorAnulaciones(e.a.companyId)).toEqual(despuesDeLaPrimera);
      expect(await stockDeLote(e.smallBatchId)).toBe('3.0000');
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R22, R23, R24, R25: guarda la anulacion y sus lineas, devuelve a cada lote lo que salio, asienta delivery_void y deja la entrega identica', async () => {
    const e = await crearEscenario();
    try {
      const deliveryId = await entregarTodo(e);
      const antes = await fotoDeEntregas(e.a.companyId);
      const voidKey = randomUUID();

      const resultado = await anular(e, deliveryId, [e.lineId], { voidKey, reason: '   Etiqueta equivocada  ' });

      expect(resultado).toEqual({ status: 'voided', orderStatus: 'TERMINADO' });

      const anulacion = await prisma.orderDeliveryVoid.findFirstOrThrow({ where: { companyId: e.a.companyId } });
      expect(anulacion).toMatchObject({
        companyId: e.a.companyId,
        deliveryId,
        voidKey,
        reason: 'Etiqueta equivocada',
        createdBy: e.admin.id,
      });
      const lineasDeLaPresentacion = antes.lineas.filter((l) => l.orderPresentationLineId === e.lineId);
      expect(lineasDeLaPresentacion).toHaveLength(2);
      const lineasAnuladas = await prisma.orderDeliveryVoidLine.findMany({ where: { voidId: anulacion.id } });
      expect(lineasAnuladas.map((l) => l.deliveryLineId).sort()).toEqual(lineasDeLaPresentacion.map((l) => l.id).sort());
      expect(lineasAnuladas.every((l) => l.deliveryId === deliveryId && l.companyId === e.a.companyId)).toBe(true);

      const asientos = await prisma.inventoryMovement.findMany({
        where: { companyId: e.a.companyId, kind: 'delivery_void' },
        orderBy: { quantity: 'desc' },
      });
      expect(
        asientos.map((m) => [m.batchId, m.quantity.toFixed(4), m.orderId, m.orderDeliveryVoidId, m.reason, m.createdBy]),
      ).toEqual([
        [e.batchId, '8.0000', e.orderId, anulacion.id, null, e.admin.id],
        [e.secondBatchId, '2.0000', e.orderId, anulacion.id, null, e.admin.id],
      ]);

      expect(await stockDeLote(e.batchId)).toBe('8.0000');
      expect(await stockDeLote(e.secondBatchId)).toBe('6.0000');
      expect(await stockDeLote(e.smallBatchId)).toBe('3.0000');
      expect(await stockDeProducto(e.productId)).toBe('14.0000');
      expect(await stockDeProducto(e.smallProductId)).toBe('3.0000');
      await expectLibroCuadra([e.batchId, e.secondBatchId, e.smallBatchId]);

      expect(await fotoDeEntregas(e.a.companyId)).toEqual(antes);
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R27: un pedido ENTREGADO pasa a TERMINADO con finished_at, packed_by y conditioned_by intactos; uno TERMINADO sigue TERMINADO', async () => {
    const e = await crearEscenario();
    try {
      const deliveryId = await entregarTodo(e);
      const antes = await pedido(e.orderId);
      expect(antes.status).toBe('ENTREGADO');

      expect(await anular(e, deliveryId, [e.smallLineId])).toEqual({ status: 'voided', orderStatus: 'TERMINADO' });

      const despues = await pedido(e.orderId);
      expect(despues.status).toBe('TERMINADO');
      expect(despues.finishedAt).toEqual(antes.finishedAt);
      expect(despues.packedBy).toBe(antes.packedBy);
      expect(despues.conditionedBy).toBe(antes.conditionedBy);
      expect(despues.customerId).toBe(antes.customerId);

      expect(await anular(e, deliveryId, [e.lineId])).toEqual({ status: 'voided', orderStatus: 'TERMINADO' });
      expect(await pedido(e.orderId)).toEqual(despues);
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R26: tras anular, getOrderDelivery vuelve a ofrecer lo anulado y deliverOrder lo entrega de nuevo y deja el pedido ENTREGADO', async () => {
    const e = await crearEscenario();
    try {
      const deliveryId = await entregarTodo(e);
      await anular(e, deliveryId, [e.lineId]);

      const vista = await pedidos.getOrderDelivery(e.orderId, e.a.actor);
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
      expect(chica).toMatchObject({ presentationLineId: e.smallLineId, deliveredPackages: 3, remainingPackages: 0 });

      const otraVez = await pedidos.deliverOrder(
        {
          orderId: e.orderId,
          deliveryKey: randomUUID(),
          customerId: e.customerId,
          allocations: [
            { presentationLineId: e.lineId, batchId: e.batchId, packages: 4 },
            { presentationLineId: e.lineId, batchId: e.secondBatchId, packages: 1 },
          ],
        },
        e.a.actor,
      );

      expect(otraVez).toEqual({ status: 'delivered', orderStatus: 'ENTREGADO' });
      expect((await pedido(e.orderId)).status).toBe('ENTREGADO');
      expect(await stockDeLote(e.batchId)).toBe('0.0000');
      expect(await stockDeLote(e.secondBatchId)).toBe('4.0000');
      await expectLibroCuadra([e.batchId, e.secondBatchId, e.smallBatchId]);
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R28: la misma clave dos veces deja un solo juego de filas y un solo asiento por lote, y la segunda es already_registered con el estado actual', async () => {
    const e = await crearEscenario();
    try {
      const deliveryId = await entregarTodo(e);
      const voidKey = randomUUID();

      expect(await anular(e, deliveryId, [e.lineId], { voidKey })).toEqual({ status: 'voided', orderStatus: 'TERMINADO' });
      expect(await anular(e, deliveryId, [e.lineId], { voidKey })).toEqual({
        status: 'already_registered',
        orderStatus: 'TERMINADO',
      });

      expect(await escritoPorAnulaciones(e.a.companyId)).toEqual({ anulaciones: 1, lineas: 2, asientos: 2 });
      expect(await stockDeLote(e.batchId)).toBe('8.0000');
      expect(await stockDeLote(e.secondBatchId)).toBe('6.0000');

      await pedidos.deliverOrder(
        {
          orderId: e.orderId,
          deliveryKey: randomUUID(),
          customerId: e.customerId,
          allocations: [
            { presentationLineId: e.lineId, batchId: e.batchId, packages: 4 },
            { presentationLineId: e.lineId, batchId: e.secondBatchId, packages: 1 },
          ],
        },
        e.a.actor,
      );

      // La clave responde con el estado ACTUAL del pedido, que la nueva entrega dejo ENTREGADO.
      expect(await anular(e, deliveryId, [e.smallLineId], { voidKey })).toEqual({
        status: 'already_registered',
        orderStatus: 'ENTREGADO',
      });
      expect(await escritoPorAnulaciones(e.a.companyId)).toEqual({ anulaciones: 1, lineas: 2, asientos: 2 });
    } finally {
      await borrarEscenario(e);
    }
  });

  /** `voidDelivery` con los mismos adaptadores reales que ata `lib/composition`, salvo la pieza indicada. */
  function voidDeliveryQueFalla(donde: 'despues-de-devolver' | 'set-status') {
    return createVoidDelivery({
      unitOfWork: {
        run: (work) =>
          withOrderTransaction((tx) => {
            const orders = createOrderWriteRepository(tx);
            const finishedGoods = createFinishedGoodsReturn(tx);
            return work({
              orders:
                donde === 'set-status'
                  ? {
                      lockAliveById: (id, scope) => orders.lockAliveById(id, scope),
                      setStatus: async () => {
                        throw new Error('fallo forzado al cambiar el estado');
                      },
                    }
                  : orders,
              voids: createOrderDeliveryVoidRepository(tx),
              finishedGoods:
                donde === 'despues-de-devolver'
                  ? {
                      returnForDeliveryVoid: async (input) => {
                        const devuelto = await finishedGoods.returnForDeliveryVoid(input);
                        expect(devuelto).toEqual({ kind: 'returned' });
                        throw new Error('fallo forzado tras la devolucion');
                      },
                    }
                  : finishedGoods,
            });
          }),
      },
      voids: createOrderDeliveryVoidRepository(),
      orders: { findAliveById: findAliveOrderById, listAlive: listAliveOrders, findBlockedIds: findBlockedOrderIds },
    });
  }

  for (const donde of ['despues-de-devolver', 'set-status'] as const) {
    it(`R29: un fallo forzado (${donde}) no deja nada escrito: ni anulacion, ni lineas, ni asientos, ni existencia, ni estado`, async () => {
      const e = await crearEscenario();
      try {
        const deliveryId = await entregarTodo(e);
        const pedidoAntes = await pedido(e.orderId);
        const entregasAntes = await fotoDeEntregas(e.a.companyId);

        const fallo = voidDeliveryQueFalla(donde)(
          { deliveryId, voidKey: randomUUID(), presentationLineIds: [e.lineId, e.smallLineId], reason: 'Devolucion' },
          e.admin,
        );

        await expect(fallo).rejects.toThrow(/fallo forzado/);
        expect(await escritoPorAnulaciones(e.a.companyId)).toEqual({ anulaciones: 0, lineas: 0, asientos: 0 });
        expect(await stockDeLote(e.batchId)).toBe('0.0000');
        expect(await stockDeLote(e.secondBatchId)).toBe('4.0000');
        expect(await stockDeLote(e.smallBatchId)).toBe('3.0000');
        expect(await stockDeProducto(e.productId)).toBe('4.0000');
        expect(await stockDeProducto(e.smallProductId)).toBe('3.0000');
        expect(await pedido(e.orderId)).toEqual(pedidoAntes);
        expect(await fotoDeEntregas(e.a.companyId)).toEqual(entregasAntes);
      } finally {
        await borrarEscenario(e);
      }
    });
  }
});

describe('listOrderDeliveries contra Postgres', () => {
  it('R7, R9: lista las entregas de la mas reciente a la mas antigua, con cliente dado de baja, autor, presentaciones, lotes y la anulacion', async () => {
    const e = await crearEscenario();
    try {
      const primeraKey = randomUUID();
      await pedidos.deliverOrder(
        {
          orderId: e.orderId,
          deliveryKey: primeraKey,
          customerId: e.customerId,
          allocations: [{ presentationLineId: e.smallLineId, batchId: e.smallBatchId, packages: 2 }],
        },
        e.a.actor,
      );
      const { id: primera } = await prisma.orderDelivery.findFirstOrThrow({ where: { deliveryKey: primeraKey } });
      // Las entregas se ordenan por su instante: la segunda va despues aunque caigan en el mismo milisegundo.
      await prisma.orderDelivery.update({ where: { id: primera }, data: { createdAt: new Date(Date.now() - 60_000) } });
      const segundaKey = randomUUID();
      await pedidos.deliverOrder(
        {
          orderId: e.orderId,
          deliveryKey: segundaKey,
          customerId: e.customerId,
          allocations: [
            { presentationLineId: e.lineId, batchId: e.batchId, packages: 3 },
            { presentationLineId: e.smallLineId, batchId: e.smallBatchId, packages: 1 },
            { presentationLineId: e.lineId, batchId: e.secondBatchId, packages: 1 },
          ],
        },
        e.a.actor,
      );
      const { id: segunda } = await prisma.orderDelivery.findFirstOrThrow({ where: { deliveryKey: segundaKey } });
      await anular(e, segunda, [e.lineId], { reason: '  Lote mal etiquetado ' });
      await prisma.customer.update({ where: { id: e.customerId }, data: { deletedAt: new Date() } });

      const vista = await pedidos.listOrderDeliveries(e.orderId, e.admin);

      const nombres = new Map(
        (
          await prisma.presentation.findMany({
            where: { id: { in: [e.presentationId, e.smallPresentationId] } },
            select: { id: true, name: true },
          })
        ).map((p) => [p.id, p.name]),
      );
      const lotes = new Map(
        (
          await prisma.productBatch.findMany({
            where: { id: { in: [e.batchId, e.secondBatchId, e.smallBatchId] } },
            select: { id: true, lot: true },
          })
        ).map((b) => [b.id, b.lot]),
      );
      const anulacion = await prisma.orderDeliveryVoid.findFirstOrThrow({ where: { deliveryId: segunda } });
      const { status } = await pedido(e.orderId);

      expect(vista.orderId).toBe(e.orderId);
      expect(vista.orderStatus).toBe(status);
      expect(vista.numberText).toMatch(/^\d{4}-\d{7}$/u);
      expect(vista.deliveries.map((d) => d.id)).toEqual([segunda, primera]);
      expect(vista.deliveries.map((d) => [d.customerName, d.authorName])).toEqual([
        ['Cliente Garcia', 'Ana Perez'],
        ['Cliente Garcia', 'Ana Perez'],
      ]);

      // El lector ordena las lineas por id de linea del reparto y de lote: el orden esperado sale de ahi.
      const porId = <T>(clave: (x: T) => string) => (x: T, y: T) => (clave(x) < clave(y) ? -1 : 1);
      const [reciente, antigua] = vista.deliveries;
      expect(reciente?.presentations).toEqual(
        [
          {
            presentationLineId: e.lineId,
            presentationName: nombres.get(e.presentationId),
            packages: 4,
            batches: [
              { batchId: e.batchId, lot: lotes.get(e.batchId), packages: 3 },
              { batchId: e.secondBatchId, lot: lotes.get(e.secondBatchId), packages: 1 },
            ].sort(porId((b) => b.batchId)),
            void: { reason: 'Lote mal etiquetado', authorName: 'Ana Perez', createdAt: anulacion.createdAt.toISOString() },
          },
          {
            presentationLineId: e.smallLineId,
            presentationName: nombres.get(e.smallPresentationId),
            packages: 1,
            batches: [{ batchId: e.smallBatchId, lot: lotes.get(e.smallBatchId), packages: 1 }],
            void: null,
          },
        ].sort(porId((p) => p.presentationLineId)),
      );
      expect(antigua?.presentations).toEqual([
        {
          presentationLineId: e.smallLineId,
          presentationName: nombres.get(e.smallPresentationId),
          packages: 2,
          batches: [{ batchId: e.smallBatchId, lot: lotes.get(e.smallBatchId), packages: 2 }],
          void: null,
        },
      ]);
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R8: un pedido sin entregas devuelve la lista vacia', async () => {
    const e = await crearEscenario();
    try {
      const vista = await pedidos.listOrderDeliveries(e.orderId, e.admin);

      expect(vista).toMatchObject({ orderId: e.orderId, orderStatus: 'TERMINADO', deliveries: [] });
    } finally {
      await borrarEscenario(e);
    }
  });

  it('R4, R6: sin pedidos.consultar es unauthorized; el pedido de la empresa B, uno que no existe y uno borrado son order_not_found', async () => {
    const e = await crearEscenario();
    try {
      await entregarTodo(e);
      const presentationB = await crearPresentacion(e.b, '1.0000');
      const { orderId: orderB } = await crearPedido(e.b, 'TERMINADO', null, [{ presentationId: presentationB, packages: 1 }]);
      const { orderId: borrado } = await crearPedido(e.a, 'PENDIENTE', e.customerId, []);
      await prisma.order.update({ where: { id: borrado }, data: { deletedAt: new Date() } });
      const sinPermiso: Actor = { ...e.admin, permissions: ['entregas.anular', 'entregas.modificar'] };

      expect(await codigoDe(pedidos.listOrderDeliveries(e.orderId, sinPermiso))).toBe('unauthorized');
      expect(await codigoDe(pedidos.listOrderDeliveries(orderB, e.admin))).toBe('order_not_found');
      expect(await codigoDe(pedidos.listOrderDeliveries(randomUUID(), e.admin))).toBe('order_not_found');
      expect(await codigoDe(pedidos.listOrderDeliveries(borrado, e.admin))).toBe('order_not_found');
      expect(await escritoPorEntregas(e.b.companyId)).toEqual({ entregas: 0, lineas: 0, asientos: 0 });
    } finally {
      await borrarEscenario(e);
    }
  });
});
