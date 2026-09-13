// tests/integration/asignaciones/batch-states.int.test.ts
/**
 * QC-102 T2 — La consulta EN LOTE y los CUATRO estados del pedido (R10), contra Postgres real.
 *
 * Un pedido `ENTREGADO` o `CANCELADO` conserva sus responsables y hay que poder verlos: lo que se
 * congela son las ESCRITURAS (QC-87 R13). En el lote eso es todavia mas importante que en la
 * consulta singular, porque una pagina del listado mezcla los cuatro estados: si uno de ellos se
 * omitiera o rompiera la consulta, media pantalla se quedaria sin avatares.
 *
 * Las filas se asignan con el pedido en `PENDIENTE` —que es lo unico que QC-87 permite— y DESPUES
 * se mueve el estado directamente en la base, que es lo que pasa en produccion: el pedido avanza y
 * sus responsables se quedan.
 *
 * AISLAMIENTO: `transaccion` (ver la cabecera de `./use-case-fixture.ts` y el censo).
 *
 * CAE AL MUTAR: si alguien colara un filtro por `status` en el `where` del adaptador o un corte por
 * estado en el caso de uso, las entradas de `ENTREGADO` y `CANCELADO` se quedarian vacias y los dos
 * casos de este archivo se pondrian rojos.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/shared/db/prisma', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shared/db/prisma')>('@/lib/shared/db/prisma');
  const { txAwareProxy } = await import('./prisma-tx-holder');
  return { prisma: txAwareProxy(actual.prisma) };
});

import { NOW, actorOf, createOrder, createPerson, inRolledBackTransaction } from './use-case-fixture';

const ESTADOS = ['PENDIENTE', 'EN_CURSO', 'ENTREGADO', 'CANCELADO'] as const;

describe('asignaciones · la consulta EN LOTE y los cuatro estados (integracion)', () => {
  it('R10: los cuatro estados devuelven EXACTAMENTE el mismo resultado', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const persona = await createPerson(fixture, fixture.companyA, {
        lastNames: 'Alvarez',
        firstNames: 'Rosa',
      });

      const pedidos: string[] = [];
      for (const estado of ESTADOS) {
        // Se asigna en PENDIENTE -lo unico que QC-87 admite- y despues el pedido AVANZA.
        const pedido = await createOrder(fixture);
        await fixture.useCases.assign(actor, { orderId: pedido, userIds: [persona], workGroupIds: [] }, NOW);
        // `CANCELADO` exige motivo: lo pide el CHECK `orders_cancellation_reason_matches_status`
        // (QC-34 R27), asi que mover el estado a mano tiene que respetarlo igual que la pantalla.
        await fixture.tx.order.update({
          where: { id: pedido },
          data: {
            status: estado,
            cancellationReason: estado === 'CANCELADO' ? 'se cancelo en la prueba' : null,
          },
        });
        pedidos.push(pedido);
      }

      const salida = await fixture.useCases.listForOrders(actor, pedidos);

      // Una entrada por pedido, todas con la MISMA persona: el estado no cambia nada.
      expect(salida.map((entrada) => entrada.orderId)).toEqual(pedidos);
      expect(salida.map((entrada) => entrada.responsibles.map((r) => r.userId))).toEqual([
        [persona],
        [persona],
        [persona],
        [persona],
      ]);
    });
  });

  it('R10: una pagina que MEZCLA los cuatro estados se resuelve entera, sin rechazar la consulta', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const persona = await createPerson(fixture, fixture.companyA);

      const entregado = await createOrder(fixture);
      await fixture.useCases.assign(actor, { orderId: entregado, userIds: [persona], workGroupIds: [] }, NOW);
      await fixture.tx.order.update({ where: { id: entregado }, data: { status: 'ENTREGADO' } });

      const cancelado = await createOrder(fixture);
      await fixture.useCases.assign(actor, { orderId: cancelado, userIds: [persona], workGroupIds: [] }, NOW);
      await fixture.tx.order.update({
        where: { id: cancelado },
        data: { status: 'CANCELADO', cancellationReason: 'se cancelo en la prueba' },
      });

      const pendiente = await createOrder(fixture);
      await fixture.useCases.assign(actor, { orderId: pendiente, userIds: [persona], workGroupIds: [] }, NOW);

      const salida = await fixture.useCases.listForOrders(actor, [entregado, cancelado, pendiente]);

      expect(salida).toHaveLength(3);
      for (const entrada of salida) {
        expect(entrada.responsibles.map((r) => r.userId)).toEqual([persona]);
      }
    });
  });
});
