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

import { createOrderAssignmentRepository } from '@/lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma';
import { OrderBlockedError } from '@/lib/modules/asignaciones/domain/errors';
import { createListAssignedOrders } from '@/lib/modules/asignaciones/domain/list-assigned-orders';
import { createStartAssignedOrder } from '@/lib/modules/asignaciones/domain/start-assigned-order';
import { assignmentDirectoryPrisma } from '@/lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma';
import {
  findPresentationRefs,
  findPresentationsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import {
  findAliveOrderTargetById,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma';
import { findRecipeRefsIncludingDeleted } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { OrderCatalog } from '@/lib/modules/pedidos';
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

import { NOW, actorOf, codeOf, createOrder, createPerson, inRolledBackTransaction, type Fixture } from './use-case-fixture';
import { realOrderSummaries } from '../../helpers/order-summaries';
import { executionOnClient } from '../../helpers/execution-transaction-on-client';

const summaryReaders = realOrderSummaries();

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

function noUsado(nombre: string): () => Promise<never> {
  return async () => {
    throw new Error(`${nombre} no deberia llamarse en este caso`);
  };
}

/** La lista del Operador y el arranque, cableados con los adaptadores reales de lectura. La
 *  transicion explota: un BLOQUEADO no debe llegar a pedirla. */
function casosDelOperador(fixture: Fixture) {
  const orders: OrderCatalog = {
    findAliveById: findAliveOrderTargetById,
    listAliveSummariesByIds: summaryReaders.listAliveSummariesByIds,
    listAliveSummariesInCompany: noUsado('listAliveSummariesInCompany'),
    listSummariesByIdsIncludingDeleted: noUsado('listSummariesByIdsIncludingDeleted'),
    transitionAliveById: noUsado('transitionAliveById'),
    startPackingAliveById: noUsado('startPackingAliveById'),
    finishPackingAliveById: noUsado('finishPackingAliveById'),
  };
  const recipes = {
    findRefsIncludingDeleted: findRecipeRefsIncludingDeleted,
    findExecutionContentById: noUsado('findExecutionContentById'),
    findIdsMatchingName: noUsado('findIdsMatchingName'),
    findAliveByNormalizedName: noUsado('findAliveByNormalizedName'),
  } as unknown as RecipeCatalog;
  const presentations = {
    findRefs: findPresentationRefs,
    findByNormalizedNames: findPresentationsByNormalizedNames,
  } as unknown as PresentationCatalog;
  const assignments = createOrderAssignmentRepository(fixture.tx);

  return {
    list: createListAssignedOrders({
      assignments,
      orders,
      recipes,
      presentations,
      units: { findRefs: noUsado('units.findRefs') } as unknown as UnitCatalog,
      people: assignmentDirectoryPrisma,
      now: () => NOW,
    }),
    start: createStartAssignedOrder({
      assignments,
      orders,
      recipes,
      presentations,
      units: { findRefs: noUsado('units.findRefs'), findRefsSharingBaseInCompany: noUsado('units.sisters') } as unknown as UnitCatalog,
      products: { findRefs: noUsado('products.findRefs') } as unknown as ProductCatalog,
      ...executionOnClient(fixture.tx, orders),
      now: () => NOW,
    }),
  };
}

describe('QC-138 — el Operador ve el pedido BLOQUEADO y no lo arranca (integracion)', () => {
  it('R30 — la lista incluye el BLOQUEADO asignado junto a PENDIENTE y EN_CURSO, y deja fuera los finales', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const operador = await createPerson(fixture, fixture.companyA);
      const asignar = async (estado: 'PENDIENTE' | 'EN_CURSO' | 'BLOQUEADO' | 'ENTREGADO'): Promise<string> => {
        const pedido = await createOrder(fixture);
        await fixture.useCases.assign(actorOf(fixture.companyA), { orderId: pedido, userIds: [operador], workGroupIds: [] }, NOW);
        await fixture.tx.order.update({ where: { id: pedido }, data: { status: estado } });
        return pedido;
      };
      const pendiente = await asignar('PENDIENTE');
      const enCurso = await asignar('EN_CURSO');
      const bloqueado = await asignar('BLOQUEADO');
      const entregado = await asignar('ENTREGADO');

      const actor: Actor = { id: operador, companyId: fixture.companyA, permissions: ['asignaciones.consultar', 'asignaciones.ejecutar'] };
      const pagina = await casosDelOperador(fixture).list(actor, { page: 1 });

      const estados = new Map(pagina.items.map((item) => [item.id, item.status]));
      expect(estados.get(pendiente)).toBe('PENDIENTE');
      expect(estados.get(enCurso)).toBe('EN_CURSO');
      expect(estados.get(bloqueado)).toBe('BLOQUEADO');
      expect(estados.has(entregado)).toBe(false);
      expect(pagina.total).toBe(3);
    });
  });

  it('R28, R32 — arrancar un BLOQUEADO rechaza con order_blocked y el estado no cambia', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const operador = await createPerson(fixture, fixture.companyA);
      const pedido = await createOrder(fixture);
      await fixture.useCases.assign(actorOf(fixture.companyA), { orderId: pedido, userIds: [operador], workGroupIds: [] }, NOW);
      await fixture.tx.order.update({ where: { id: pedido }, data: { status: 'BLOQUEADO' } });

      const actor: Actor = { id: operador, companyId: fixture.companyA, permissions: ['asignaciones.consultar', 'asignaciones.ejecutar'] };
      const error = await casosDelOperador(fixture)
        .start(actor, { orderId: pedido })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(OrderBlockedError);
      expect(codeOf(error)).toBe('order_blocked');
      const fila = await fixture.tx.order.findUniqueOrThrow({ where: { id: pedido }, select: { status: true } });
      expect(fila.status).toBe('BLOQUEADO');
    });
  });
});
