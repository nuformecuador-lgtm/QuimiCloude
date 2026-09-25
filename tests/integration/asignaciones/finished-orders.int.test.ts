// tests/integration/asignaciones/finished-orders.int.test.ts
/**
 * «Terminados» contra Postgres real.
 *
 * En unidad, `list-finished-orders.test.ts` prueba el dominio con puertos de mentira: «los nulos
 * van al final» es una promesa del doble, no del `ORDER BY` real. Aqui corre
 * `listAliveSummariesInCompany` (`order-catalog-prisma.ts`) contra Postgres, con pedidos
 * `ENTREGADO` de verdad -algunos con `finished_at`, otro sin ella porque nacio ENTREGADO antes de
 * la migracion- y comprueba que el orden y la estabilidad entre paginas son del MOTOR, no del
 * mock. La finalizacion se prueba llamando a `finishAssignedOrder`, el caso de uso real: es la
 * unica forma de demostrar que lo que finaliza en planta aparece despues con su fecha.
 *
 * AISLAMIENTO: `transaccion` (ver la cabecera de `./use-case-fixture.ts` y el censo).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/shared/db/prisma', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shared/db/prisma')>('@/lib/shared/db/prisma');
  const { txAwareProxy } = await import('./prisma-tx-holder');
  return { prisma: txAwareProxy(actual.prisma) };
});

import { createOrderAssignmentRepository } from '@/lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma';
import { createFinishAssignedOrder } from '@/lib/modules/asignaciones/domain/finish-assigned-order';
import { createFinishPacking } from '@/lib/modules/asignaciones/domain/finish-packing';
import { createListFinishedOrders } from '@/lib/modules/asignaciones/domain/list-finished-orders';
import { createStartPacking } from '@/lib/modules/asignaciones/domain/start-packing';
import { assignmentDirectoryPrisma } from '@/lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma';
import { ROLE_EMPACADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';
import {
  findPresentationRefs,
  findPresentationsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import { findRecipeRefsIncludingDeleted } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import {
  findAliveOrderTargetById,
  listAliveOrderSummariesByIds,
  listAliveSummariesInCompany,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma';
import {
  createOrderWriteRepository,
  finishPackingAliveOrder,
  startPackingAliveOrder,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { assertTransition } from '@/lib/modules/pedidos/domain/order-transitions';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { OrderCatalog } from '@/lib/modules/pedidos';
import type { OrderStatus } from '@/lib/modules/pedidos/domain/order-classification';

import { NOW, actorOf, createOrder, createPerson, inRolledBackTransaction } from './use-case-fixture';

const PERMISOS_DEL_EMPACADOR = SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR];
if (PERMISOS_DEL_EMPACADOR === undefined) {
  throw new Error('SEED_ROLE_PERMISSIONS no declara al Empacador: este archivo no puede construir su actor');
}

/**
 * `OrderCatalog['transitionAliveById']` real: `assertTransition` seguida del mismo `UPDATE`
 * condicional, `setStatus` de `createOrderWriteRepository()` sobre el cliente global -aqui, el
 * proxy de la transaccion del test-. NO consume material: `finishAssignedOrder` de este
 * archivo solo ejercita el cambio de estado y `finished_at`, nunca la reserva.
 */
async function transitionAliveByIdReal(
  id: string,
  companyId: string,
  from: OrderStatus,
  to: OrderStatus,
  actorId: string,
  now: Date,
): ReturnType<OrderCatalog['transitionAliveById']> {
  assertTransition(from, to);
  const resultado = await createOrderWriteRepository().setStatus(id, from, to, actorId, now, { companyId });
  // Yendo a `POR_EMPACAR`, el exito real lleva `finishedGoods` -aqui no hay producto
  // terminado que dar de alta, asi que el doble no inventa ninguno-. `finishAssignedOrder`
  // reconoce el exito por esta forma, no por el literal `'ok'`.
  if (resultado === 'ok' && to === 'POR_EMPACAR') {
    return { kind: 'ok', finishedGoods: { productName: '', packages: '0' } };
  }
  return resultado;
}

/** Cablea el caso de uso REAL sobre la `tx` del fixture, con los mismos adaptadores que
 *  `lib/composition` ata en produccion. */
function wireListFinishedOrders(tx: Parameters<typeof createOrderAssignmentRepository>[0]) {
  const orders: OrderCatalog = {
    findAliveById: findAliveOrderTargetById,
    listAliveSummariesByIds: listAliveOrderSummariesByIds,
    listAliveSummariesInCompany,
    transitionAliveById: transitionAliveByIdReal,
    // R27: las dos escrituras REALES de empaque, mismo patron que `setStatus` arriba -las dos
    // `UPDATE` condicionales de `order-prisma.ts` sobre el proxy de la `tx` del fixture-.
    startPackingAliveById: (id, companyId, packerId, now) =>
      startPackingAliveOrder(id, packerId, now, { companyId }),
    finishPackingAliveById: (id, companyId, packerId, now) =>
      finishPackingAliveOrder(id, packerId, now, { companyId }),
  };
  const assignments = createOrderAssignmentRepository(tx);

  return {
    orders,
    assignments,
    listFinishedOrders: createListFinishedOrders({
      orders,
      assignments,
      recipes: {
        findRefsIncludingDeleted: findRecipeRefsIncludingDeleted,
        findExecutionContentById: async () => {
          throw new Error('QC-145: listFinishedOrders no ejecuta ninguna receta');
        },
        findIdsMatchingName: async () => {
          throw new Error('QC-145: listFinishedOrders no busca recetas por nombre');
        },
      },
      people: assignmentDirectoryPrisma,
      presentations: { findRefs: findPresentationRefs, findByNormalizedNames: findPresentationsByNormalizedNames },
      now: () => NOW,
    }),
    finishAssignedOrder: createFinishAssignedOrder({
      assignments,
      orders,
      now: () => NOW,
    }),
    // R27: Comenzar y Terminar, mismos `orders` y mismo reloj que el resto del fixture.
    startPacking: createStartPacking({ orders, now: () => NOW }),
    finishPacking: createFinishPacking({ orders, now: () => NOW }),
  };
}

describe('asignaciones · listFinishedOrders con los permisos del Empacador (integracion)', () => {
  it('R17, R19: solo ENTREGADO de toda la empresa, sin filtro por asignado; otra empresa no vuelve', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { listFinishedOrders } = wireListFinishedOrders(fixture.tx);

      const empacador = await createPerson(fixture, fixture.companyA);
      const otraPersona = await createPerson(fixture, fixture.companyA);

      const entregadoAjeno = await createOrder(fixture, { status: 'ENTREGADO' });
      const pendiente = await createOrder(fixture, { status: 'PENDIENTE' });
      const entregadoDeOtraEmpresa = await createOrder(fixture, {
        companyId: fixture.companyB,
        status: 'ENTREGADO',
      });

      await fixture.tx.order.update({
        where: { id: entregadoAjeno },
        data: { finishedAt: NOW },
      });
      await fixture.tx.order.update({
        where: { id: entregadoDeOtraEmpresa },
        data: { finishedAt: NOW },
      });

      const actorEmpacador: Actor = {
        id: empacador,
        companyId: fixture.companyA,
        permissions: PERMISOS_DEL_EMPACADOR,
      };

      const pagina = await listFinishedOrders(actorEmpacador, { page: 1 });

      // El pendiente no sale; el de la otra empresa tampoco; el entregado sale aunque el
      // Empacador NO sea su responsable: sin filtro por usuario asignado.
      expect(pagina.items.map((item) => item.id)).toEqual([entregadoAjeno]);
      expect(pagina.total).toBe(1);
      void otraPersona;
      void pendiente;
    });
  });

  it('R20: recientes primero, «sin fecha» al final por numero de pedido descendente, estable entre paginas', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { listFinishedOrders } = wireListFinishedOrders(fixture.tx);

      const conFechaAntigua = await createOrder(fixture, { status: 'ENTREGADO' });
      const conFechaReciente = await createOrder(fixture, { status: 'ENTREGADO' });
      const sinFechaPrimero = await createOrder(fixture, { status: 'ENTREGADO' });
      const sinFechaSegundo = await createOrder(fixture, { status: 'ENTREGADO' });

      await fixture.tx.order.update({
        where: { id: conFechaAntigua },
        data: { finishedAt: new Date('2026-01-01T00:00:00.000Z') },
      });
      await fixture.tx.order.update({
        where: { id: conFechaReciente },
        data: { finishedAt: new Date('2026-02-01T00:00:00.000Z') },
      });
      // `sinFechaPrimero` y `sinFechaSegundo` se crean en ese orden, asi que su `order_sequence`
      // es creciente: «sin fecha» los ordena por numero DESCENDENTE, o sea al reves.

      const empacador = await createPerson(fixture, fixture.companyA);
      const actorEmpacador: Actor = {
        id: empacador,
        companyId: fixture.companyA,
        permissions: PERMISOS_DEL_EMPACADOR,
      };

      const primeraPagina = await listFinishedOrders(actorEmpacador, { page: 1, pageSize: 2 });
      const segundaPagina = await listFinishedOrders(actorEmpacador, { page: 2, pageSize: 2 });

      expect(primeraPagina.items.map((item) => item.id)).toEqual([conFechaReciente, conFechaAntigua]);
      expect(segundaPagina.items.map((item) => item.id)).toEqual([sinFechaSegundo, sinFechaPrimero]);
      expect(primeraPagina.total).toBe(4);

      // Estable entre paginas: leer otra vez la primera pagina da EXACTAMENTE lo mismo.
      const primeraPaginaDeNuevo = await listFinishedOrders(actorEmpacador, { page: 1, pageSize: 2 });
      expect(primeraPaginaDeNuevo.items.map((item) => item.id)).toEqual(
        primeraPagina.items.map((item) => item.id),
      );
    });
  });

  it('R27: finalizar por el caso de uso real deja el pedido POR_EMPACAR, y ese estado NO aparece en «Terminados»', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { listFinishedOrders, finishAssignedOrder } = wireListFinishedOrders(fixture.tx);

      const empacador = await createPerson(fixture, fixture.companyA);
      const pedido = await createOrder(fixture, { status: 'EN_CURSO' });

      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: pedido, userIds: [empacador], workGroupIds: [] },
        NOW,
      );

      const actorEmpacador: Actor = {
        id: empacador,
        companyId: fixture.companyA,
        permissions: PERMISOS_DEL_EMPACADOR,
      };

      // Antes de finalizar, no aparece: no esta ENTREGADO todavia.
      expect((await listFinishedOrders(actorEmpacador, { page: 1 })).items).toEqual([]);

      // El Finalizar de QC-168 deja el pedido POR_EMPACAR, no ENTREGADO: el lote de producto
      // terminado que entra viene en la respuesta, pero `finished_at` lo escribe Terminar.
      await finishAssignedOrder(actorEmpacador, { orderId: pedido });

      expect((await listFinishedOrders(actorEmpacador, { page: 1 })).items).toEqual([]);
    });
  });

  it('R27: Finalizar -> Comenzar -> Terminar deja el pedido en «Terminados» con la fecha de Terminar', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { listFinishedOrders, finishAssignedOrder, startPacking, finishPacking } = wireListFinishedOrders(
        fixture.tx,
      );

      const operario = await createPerson(fixture, fixture.companyA);
      const empacador = await createPerson(fixture, fixture.companyA);
      const pedido = await createOrder(fixture, { status: 'EN_CURSO' });

      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: pedido, userIds: [operario], workGroupIds: [] },
        NOW,
      );

      const actorOperario: Actor = {
        id: operario,
        companyId: fixture.companyA,
        permissions: ['asignaciones.consultar'],
      };
      const actorEmpacador: Actor = {
        id: empacador,
        companyId: fixture.companyA,
        permissions: PERMISOS_DEL_EMPACADOR,
      };

      // Finalizar: EN_CURSO -> POR_EMPACAR. Todavia no aparece en «Terminados».
      await finishAssignedOrder(actorOperario, { orderId: pedido });
      expect((await listFinishedOrders(actorEmpacador, { page: 1 })).items).toEqual([]);

      // Comenzar: POR_EMPACAR -> EN_EMPAQUE, a nombre del Empacador. Sigue sin aparecer.
      await startPacking(actorEmpacador, { orderId: pedido });
      expect((await listFinishedOrders(actorEmpacador, { page: 1 })).items).toEqual([]);

      // Terminar: EN_EMPAQUE -> ENTREGADO, con `finished_at` en la misma escritura (R21), en el
      // instante que el fixture cablea como reloj (`NOW`).
      const { numberText } = await finishPacking(actorEmpacador, { orderId: pedido });
      expect(numberText.length).toBeGreaterThan(0);

      // Ahora si aparece en «Terminados», con la fecha de Terminar.
      const pagina = await listFinishedOrders(actorEmpacador, { page: 1 });
      expect(pagina.items).toEqual([expect.objectContaining({ id: pedido, finishedAt: NOW })]);
    });
  });

  it('un ENTREGADO previo sin `finished_at` sale como «Sin fecha» (`finishedAt: null`)', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { listFinishedOrders } = wireListFinishedOrders(fixture.tx);

      const entregadoSinFecha = await createOrder(fixture, { status: 'ENTREGADO' });
      const empacador = await createPerson(fixture, fixture.companyA);
      const actorEmpacador: Actor = {
        id: empacador,
        companyId: fixture.companyA,
        permissions: PERMISOS_DEL_EMPACADOR,
      };

      const pagina = await listFinishedOrders(actorEmpacador, { page: 1 });

      expect(pagina.items).toEqual([
        expect.objectContaining({ id: entregadoSinFecha, finishedAt: null }),
      ]);
    });
  });

  it('R18: sin `terminados.consultar` la consulta rechaza antes de tocar ningun puerto', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const { listFinishedOrders } = wireListFinishedOrders(fixture.tx);
      const operador = await createPerson(fixture, fixture.companyA);

      await expect(
        listFinishedOrders(
          { id: operador, companyId: fixture.companyA, permissions: ['asignaciones.consultar'] },
          { page: 1 },
        ),
      ).rejects.toMatchObject({ code: 'unauthorized' });
    });
  });
});
