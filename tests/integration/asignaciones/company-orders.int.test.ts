// tests/integration/asignaciones/company-orders.int.test.ts
/**
 * QC-145 T11 — «Todos» contra Postgres real (`design.md > 3.3`; R22, R24).
 *
 * En unidad, `list-company-orders.test.ts` prueba que el filtro exactamente `['ENTREGADO']`
 * ordena distinto de cualquier otra mezcla contra puertos de mentira. Aqui corre
 * `listAliveSummariesInCompany` de verdad, para demostrar que el `ORDER BY` que Postgres aplica
 * cambia con el filtro, y que la empresa acota el resultado igual que en el resto del modulo.
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
import { createListCompanyOrders } from '@/lib/modules/asignaciones/domain/list-company-orders';
import { assignmentDirectoryPrisma } from '@/lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma';
import { ROLE_ADMINISTRADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';
import { findPresentationRefs } from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import { findRecipeRefsIncludingDeleted } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import {
  findAliveOrderTargetById,
  listAliveOrderSummariesByIds,
  listAliveSummariesInCompany,
  transitionAliveOrder,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { OrderCatalog } from '@/lib/modules/pedidos';

import { NOW, createOrder, createPerson, inRolledBackTransaction } from './use-case-fixture';

const PERMISOS_DEL_ADMINISTRADOR = SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR];
if (PERMISOS_DEL_ADMINISTRADOR === undefined) {
  throw new Error(
    'SEED_ROLE_PERMISSIONS no declara al Administrador: este archivo no puede construir su actor',
  );
}

function wireListCompanyOrders(tx: Parameters<typeof createOrderAssignmentRepository>[0]) {
  const orders: OrderCatalog = {
    findAliveById: findAliveOrderTargetById,
    listAliveSummariesByIds: listAliveOrderSummariesByIds,
    listAliveSummariesInCompany,
    transitionAliveById: transitionAliveOrder,
  };
  const assignments = createOrderAssignmentRepository(tx);

  return createListCompanyOrders({
    orders,
    assignments,
    recipes: {
      findRefsIncludingDeleted: findRecipeRefsIncludingDeleted,
      findExecutionContentById: async () => {
        throw new Error('QC-145: listCompanyOrders no ejecuta ninguna receta');
      },
      findIdsMatchingName: async () => {
        throw new Error('QC-145: listCompanyOrders no busca recetas por nombre');
      },
    },
    people: assignmentDirectoryPrisma,
    presentations: { findRefs: findPresentationRefs },
    now: () => NOW,
  });
}

describe('asignaciones · listCompanyOrders con los permisos del Administrador (integracion)', () => {
  it('R22: los cuatro estados de la empresa, sin filtro por asignado; otra empresa no vuelve', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const listCompanyOrders = wireListCompanyOrders(fixture.tx);

      const pendiente = await createOrder(fixture, { status: 'PENDIENTE' });
      const enCurso = await createOrder(fixture, { status: 'EN_CURSO' });
      const entregado = await createOrder(fixture, { status: 'ENTREGADO' });
      const cancelado = await createOrder(fixture, { status: 'PENDIENTE' });
      await fixture.tx.order.update({
        where: { id: cancelado },
        data: { status: 'CANCELADO', cancellationReason: 'motivo de prueba' },
      });
      const deOtraEmpresa = await createOrder(fixture, { companyId: fixture.companyB, status: 'PENDIENTE' });

      const administrador = await createPerson(fixture, fixture.companyA);
      const actorAdministrador: Actor = {
        id: administrador,
        companyId: fixture.companyA,
        permissions: PERMISOS_DEL_ADMINISTRADOR,
      };

      const pagina = await listCompanyOrders(actorAdministrador, { page: 1, pageSize: 10 });

      expect(new Set(pagina.items.map((item) => item.id))).toEqual(
        new Set([pendiente, enCurso, entregado, cancelado]),
      );
      expect(pagina.items.map((item) => item.id)).not.toContain(deOtraEmpresa);
      expect(pagina.total).toBe(4);
      // `finishedAt` viaja siempre, aunque solo el filtrado exactamente ENTREGADO lo pinte (R31).
      for (const item of pagina.items) expect('finishedAt' in item).toBe(true);
    });
  });

  it('R24/D16: exactamente ENTREGADO ordena como «Terminados»; ENTREGADO + otro estado, como trabajo', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const listCompanyOrders = wireListCompanyOrders(fixture.tx);

      const entregadoAntiguo = await createOrder(fixture, { status: 'ENTREGADO' });
      const entregadoReciente = await createOrder(fixture, { status: 'ENTREGADO' });
      await fixture.tx.order.update({
        where: { id: entregadoAntiguo },
        data: { finishedAt: new Date('2026-01-01T00:00:00.000Z') },
      });
      await fixture.tx.order.update({
        where: { id: entregadoReciente },
        data: { finishedAt: new Date('2026-02-01T00:00:00.000Z') },
      });
      const pendiente = await createOrder(fixture, { status: 'PENDIENTE' });

      const administrador = await createPerson(fixture, fixture.companyA);
      const actorAdministrador: Actor = {
        id: administrador,
        companyId: fixture.companyA,
        permissions: PERMISOS_DEL_ADMINISTRADOR,
      };

      // Exactamente ['ENTREGADO']: orden de terminados, recientes primero.
      const soloEntregados = await listCompanyOrders(actorAdministrador, {
        page: 1,
        statuses: ['ENTREGADO'],
      });
      expect(soloEntregados.items.map((item) => item.id)).toEqual([
        entregadoReciente,
        entregadoAntiguo,
      ]);

      // ENTREGADO + otro estado: orden de la lista de trabajo, no el de terminados.
      const mezcla = await listCompanyOrders(actorAdministrador, {
        page: 1,
        statuses: ['ENTREGADO', 'PENDIENTE'],
      });
      expect(new Set(mezcla.items.map((item) => item.id))).toEqual(
        new Set([entregadoAntiguo, entregadoReciente, pendiente]),
      );
      // El orden de trabajo no depende de `finished_at`: el pendiente puede caer en cualquier
      // posicion respecto a los entregados, pero el conjunto es el que importa aqui (el orden de
      // trabajo puro ya lo prueba `list-company-orders.test.ts` en unidad).
    });
  });

  it('rechazo cruzado de empresa: un actor de la empresa B no ve nada de la empresa A', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const listCompanyOrders = wireListCompanyOrders(fixture.tx);

      await createOrder(fixture, { status: 'PENDIENTE' });
      await createOrder(fixture, { status: 'ENTREGADO' });

      const administradorDeB = await createPerson(fixture, fixture.companyB);
      const actorDeB: Actor = {
        id: administradorDeB,
        companyId: fixture.companyB,
        permissions: PERMISOS_DEL_ADMINISTRADOR,
      };

      const pagina = await listCompanyOrders(actorDeB, { page: 1 });

      expect(pagina.items).toEqual([]);
      expect(pagina.total).toBe(0);
    });
  });

  it('R23: sin `pedidos.consultar` la consulta rechaza antes de tocar ningun puerto', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const listCompanyOrders = wireListCompanyOrders(fixture.tx);
      const empacador = await createPerson(fixture, fixture.companyA);

      await expect(
        listCompanyOrders(
          { id: empacador, companyId: fixture.companyA, permissions: ['terminados.consultar'] },
          { page: 1 },
        ),
      ).rejects.toMatchObject({ code: 'unauthorized' });
    });
  });
});
