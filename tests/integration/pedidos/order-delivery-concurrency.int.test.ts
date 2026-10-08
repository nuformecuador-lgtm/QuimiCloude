/**
 * Dos entregas reales a la vez contra Postgres, por la fachada de `lib/composition`: lo que se
 * mide es que el bloqueo del pedido y el decremento condicional del lote serializan de verdad.
 *
 * AISLAMIENTO: `commit`. Cada `withOrderTransaction` tiene que confirmar para que la otra vea lo
 * que escribio, asi que una transaccion del test no puede envolverlas. Cada caso fabrica su empresa
 * efimera y la borra en un `finally` (`tests/helpers/order-delivery-seed.ts`).
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
} from '../../helpers/order-delivery-seed';

afterAll(async () => {
  await prisma.$disconnect();
});

function codigos(resultados: readonly PromiseSettledResult<unknown>[]): string[] {
  return resultados
    .map((r) => (r.status === 'fulfilled' ? 'aplicada' : ((r.reason as { code?: string }).code ?? String(r.reason))))
    .sort();
}

describe('R28: entregas simultaneas', () => {
  it('R28: dos entregas a la vez del mismo pedido que juntas superan lo que falta: una aplicada y la otra delivery_exceeds_remaining', async () => {
    const empresa = await crearEmpresaDeEntrega('concurrencia-pedido');
    try {
      const customerId = await crearCliente(empresa, 'Garcia');
      const presentationId = await crearPresentacion(empresa, '1.0000');
      const { orderId, lineIds } = await crearPedido(empresa, 'TERMINADO', customerId, [{ presentationId, packages: 5 }]);
      const productId = await crearTerminado(empresa, presentationId);
      const batchId = await crearLote(empresa, productId, presentationId, '10.0000', '1.0000');
      const entrega = () =>
        pedidos.deliverOrder(
          {
            orderId,
            deliveryKey: randomUUID(),
            customerId,
            allocations: [{ presentationLineId: lineIds[0], batchId, packages: 3 }],
          },
          empresa.actor,
        );

      // Sin `await` entre las dos: compiten de verdad por el bloqueo del pedido.
      const resultados = await Promise.allSettled([entrega(), entrega()]);

      expect(codigos(resultados)).toEqual(['aplicada', 'delivery_exceeds_remaining']);
      expect(await escritoPorEntregas(empresa.companyId)).toEqual({ entregas: 1, lineas: 1, asientos: 1 });
      expect(await stockDeLote(batchId)).toBe('7.0000');
      expect(await stockDeProducto(productId)).toBe('7.0000');
      const { status } = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
      expect(status).toBe('TERMINADO');
    } finally {
      await borrarEmpresaDeEntrega(empresa);
    }
  });

  it('R28: dos pedidos que piden a la vez al mismo lote mas de lo que tiene: uno aplicado, el otro delivery_batch_insufficient, y la existencia nunca queda negativa', async () => {
    const empresa = await crearEmpresaDeEntrega('concurrencia-lote');
    try {
      const customerId = await crearCliente(empresa, 'Garcia');
      const presentationId = await crearPresentacion(empresa, '2.0000');
      const uno = await crearPedido(empresa, 'TERMINADO', customerId, [{ presentationId, packages: 3 }]);
      const dos = await crearPedido(empresa, 'TERMINADO', customerId, [{ presentationId, packages: 3 }]);
      const productId = await crearTerminado(empresa, presentationId);
      const batchId = await crearLote(empresa, productId, presentationId, '8.0000', '2.0000');
      const entrega = (orderId: string, presentationLineId: string | undefined) =>
        pedidos.deliverOrder(
          {
            orderId,
            deliveryKey: randomUUID(),
            customerId,
            allocations: [{ presentationLineId, batchId, packages: 3 }],
          },
          empresa.actor,
        );

      const resultados = await Promise.allSettled([
        entrega(uno.orderId, uno.lineIds[0]),
        entrega(dos.orderId, dos.lineIds[0]),
      ]);

      expect(codigos(resultados)).toEqual(['aplicada', 'delivery_batch_insufficient']);
      expect(await stockDeLote(batchId)).toBe('2.0000');
      expect(await stockDeProducto(productId)).toBe('2.0000');
      expect(await escritoPorEntregas(empresa.companyId)).toEqual({ entregas: 1, lineas: 1, asientos: 1 });
      const negativos = await prisma.productBatch.count({
        where: { companyId: empresa.companyId, stock: { lt: 0 } },
      });
      expect(negativos).toBe(0);
      const estados = await prisma.order.findMany({
        where: { id: { in: [uno.orderId, dos.orderId] } },
        select: { status: true },
      });
      expect(estados.map((o) => o.status).sort()).toEqual(['ENTREGADO', 'TERMINADO']);
    } finally {
      await borrarEmpresaDeEntrega(empresa);
    }
  });
});
