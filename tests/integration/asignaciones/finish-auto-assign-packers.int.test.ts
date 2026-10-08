// tests/integration/asignaciones/finish-auto-assign-packers.int.test.ts
/**
 * El Finalizar asigna al empacador vinculado, contra Postgres real.
 *
 * POR QUE AQUI Y NO SOLO EN UNIDAD. El unit prueba la decision con dobles que contestan lo
 * dictado: que el permiso se lee de `PersonRef.permissions` y no del nombre del rol solo se
 * demuestra cuando ese permiso sale de una fila real de `role_permissions`, leida por el
 * directorio con su `select` de verdad, y cuando el equipo sale de `work_group_members` de
 * verdad. La transicion si va doblada a proposito: el consumo real ya lo cubre el test del
 * producto terminado, y aqui aisla lo que se mide —las filas que el Finalizar asegura—.
 *
 * AISLAMIENTO: `transaccion` (ver la cabecera de `./use-case-fixture.ts` y el censo en
 * `tests/integration/aislamiento.json`).
 */
import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

// El Proxy que hace que los adaptadores que importan el cliente Prisma GLOBAL hablen por la
// transaccion del test. No sustituye ninguna consulta: envuelve el cliente REAL.
vi.mock('@/lib/shared/db/prisma', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shared/db/prisma')>('@/lib/shared/db/prisma');
  const { txAwareProxy } = await import('./prisma-tx-holder');
  return { prisma: txAwareProxy(actual.prisma) };
});

import { createOrderAssignmentRepository } from '@/lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma';
import { createFinishAssignedOrder } from '@/lib/modules/asignaciones/domain/finish-assigned-order';
import { assignmentDirectoryPrisma } from '@/lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { OrderCatalog } from '@/lib/modules/pedidos';

import {
  addMember,
  createOrder,
  createPerson,
  createWorkGroup,
  inRolledBackTransaction,
  NOW,
  readRows,
  actorOf,
} from './use-case-fixture';
import { executionOnClient } from '../../helpers/execution-transaction-on-client';

async function createRoleWithPermissions(
  tx: Prisma.TransactionClient,
  permissionCodes: readonly string[],
): Promise<string> {
  const role = await tx.role.create({
    data: { name: `rol-autoempacador-${randomUUID()}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  for (const permissionCode of permissionCodes) {
    await tx.rolePermission.create({ data: { roleId: role.id, permissionCode } });
  }
  return role.id;
}

/**
 * Transicion doblada: exito sin pasar por inventario. El `'ok'` del puerto es el literal: el
 * Finalizar ya no da de alta producto terminado (eso pasa a Terminar el empaque), asi que no
 * hay `finishedGoods` que devolver. Un objeto aqui no es `'ok'` para el caso de uso y lo
 * trataria como `'stale'`, reintentando sin fin.
 */
function ordersDoblados(orderId: string): OrderCatalog {
  return {
    findAliveById: async () => ({ id: orderId, status: 'EN_CURSO' as const }),
    listAliveSummariesByIds: async () => ({
      items: [
        {
          id: orderId,
          number: { year: 2026, sequence: 910001 },
          recipeId: 'receta',
          quantity: '10.0000',
          priority: 'MEDIA',
          status: 'EN_CURSO',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 1,
      totalPages: 1,
    }),
    transitionAliveById: async () => 'ok' as const,
  } as unknown as OrderCatalog;
}

describe('asignaciones · el Finalizar asigna al empacador vinculado (integracion)', () => {
  it('R1: el empacador que se unio al equipo despues de asignar queda asignado al finalizar', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const rolOperario = await createRoleWithPermissions(fixture.tx, ['asignaciones.consultar']);
      const rolEmpacador = await createRoleWithPermissions(fixture.tx, ['empaque.modificar']);
      const operarioActor = await createPerson({ tx: fixture.tx, roleId: rolOperario }, fixture.companyA);
      const operarioEquipo = await createPerson({ tx: fixture.tx, roleId: rolOperario }, fixture.companyA);
      const empacador = await createPerson({ tx: fixture.tx, roleId: rolEmpacador }, fixture.companyA);
      const equipo = await createWorkGroup(fixture.tx, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, equipo.id, operarioEquipo);

      const pedido = await createOrder(fixture, { status: 'EN_CURSO' });
      const asignado = await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: pedido, userIds: [operarioActor], workGroupIds: [equipo.id] },
        NOW,
      );
      expect(asignado).toEqual({ added: 2 });

      // El empacador entra al equipo CUANDO el pedido ya estaba en marcha.
      await addMember(fixture.tx, fixture.companyA, equipo.id, empacador);

      const finish = createFinishAssignedOrder({
        assignments: createOrderAssignmentRepository(fixture.tx),
        orders: ordersDoblados(pedido),
        people: assignmentDirectoryPrisma,
        groups: assignmentDirectoryPrisma,
        ...executionOnClient(fixture.tx, ordersDoblados(pedido)),
        now: () => NOW,
      });
      const actor: Actor = { id: operarioActor, companyId: fixture.companyA, permissions: ['asignaciones.consultar', 'asignaciones.ejecutar'] };
      await finish(actor, { orderId: pedido, stepPosition: null });

      const filas = await readRows(fixture.tx, pedido);
      expect(filas.map((fila) => fila.userId).sort()).toEqual(
        [operarioActor, operarioEquipo, empacador].sort(),
      );
      const filaEmpacador = filas.find((fila) => fila.userId === empacador);
      expect(filaEmpacador?.workGroupId).toBe(equipo.id);
      expect(filaEmpacador?.workGroupName).toBe(equipo.name);
    });
  });

  it('R2: sin empacadores vinculados el Finalizar no crea ninguna fila', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const rolOperario = await createRoleWithPermissions(fixture.tx, ['asignaciones.consultar']);
      const operarioActor = await createPerson({ tx: fixture.tx, roleId: rolOperario }, fixture.companyA);
      const operarioEquipo = await createPerson({ tx: fixture.tx, roleId: rolOperario }, fixture.companyA);
      const equipo = await createWorkGroup(fixture.tx, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, equipo.id, operarioEquipo);

      const pedido = await createOrder(fixture, { status: 'EN_CURSO' });
      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: pedido, userIds: [operarioActor], workGroupIds: [equipo.id] },
        NOW,
      );

      const finish = createFinishAssignedOrder({
        assignments: createOrderAssignmentRepository(fixture.tx),
        orders: ordersDoblados(pedido),
        people: assignmentDirectoryPrisma,
        groups: assignmentDirectoryPrisma,
        ...executionOnClient(fixture.tx, ordersDoblados(pedido)),
        now: () => NOW,
      });
      const actor: Actor = { id: operarioActor, companyId: fixture.companyA, permissions: ['asignaciones.consultar', 'asignaciones.ejecutar'] };
      await finish(actor, { orderId: pedido, stepPosition: null });

      const filas = await readRows(fixture.tx, pedido);
      expect(filas.map((fila) => fila.userId).sort()).toEqual(
        [operarioActor, operarioEquipo].sort(),
      );
    });
  });

  it('R5: el empacador ya asignado conserva su origen y no se duplica', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const rolOperario = await createRoleWithPermissions(fixture.tx, ['asignaciones.consultar']);
      const rolEmpacador = await createRoleWithPermissions(fixture.tx, ['empaque.modificar']);
      const operarioActor = await createPerson({ tx: fixture.tx, roleId: rolOperario }, fixture.companyA);
      const operarioEquipo = await createPerson({ tx: fixture.tx, roleId: rolOperario }, fixture.companyA);
      const empacador = await createPerson({ tx: fixture.tx, roleId: rolEmpacador }, fixture.companyA);
      const equipo = await createWorkGroup(fixture.tx, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, equipo.id, operarioEquipo);

      const pedido = await createOrder(fixture, { status: 'EN_CURSO' });
      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: pedido, userIds: [operarioActor, empacador], workGroupIds: [equipo.id] },
        NOW,
      );
      await addMember(fixture.tx, fixture.companyA, equipo.id, empacador);

      const finish = createFinishAssignedOrder({
        assignments: createOrderAssignmentRepository(fixture.tx),
        orders: ordersDoblados(pedido),
        people: assignmentDirectoryPrisma,
        groups: assignmentDirectoryPrisma,
        ...executionOnClient(fixture.tx, ordersDoblados(pedido)),
        now: () => NOW,
      });
      const actor: Actor = { id: operarioActor, companyId: fixture.companyA, permissions: ['asignaciones.consultar', 'asignaciones.ejecutar'] };
      await finish(actor, { orderId: pedido, stepPosition: null });

      const filas = await readRows(fixture.tx, pedido);
      expect(filas).toHaveLength(3);
      const filaEmpacador = filas.find((fila) => fila.userId === empacador);
      expect(filaEmpacador?.workGroupId).toBeNull();
      expect(filaEmpacador?.workGroupName).toBeNull();
    });
  });
});
