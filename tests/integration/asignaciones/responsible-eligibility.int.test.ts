// tests/integration/asignaciones/responsible-eligibility.int.test.ts
/**
 * Quien puede ser responsable de un pedido, contra Postgres real.
 *
 * POR QUE AQUI Y NO SOLO EN UNIDAD. `tests/unit/asignaciones/assign-responsibles.test.ts` prueba
 * el caso de uso con un doble de `PeopleDirectory` que contesta lo que el test le dicta. Aqui el
 * permiso `pedidos.consultar` sale de una fila real de `role_permissions`, leida por
 * `assignment-directory-prisma.ts` con el `select` que compone `role -> rolePermissions ->
 * permission.code`: solo contra la base se demuestra que esa lectura, y no una promesa del doble,
 * es lo que decide la elegibilidad.
 *
 * Este archivo ademas ejercita los TRES casos de uso de ejecucion (`get-`, `start-` y
 * `finish-assigned-order.ts`) sin tocarlos: la receta del fixture nace SIN lineas ni pasos
 * (`use-case-fixture.ts`) y el pedido sin presentacion, asi que `recipes.findExecutionContentById`
 * es el UNICO catalogo de la ejecucion que este archivo necesita real; `units`, `products` y
 * `presentations` no se llegan a invocar y se declaran con una implementacion que lanza si alguna
 * vez se tocan, para que un cambio que si los invocara no pase en silencio.
 *
 * AISLAMIENTO: `transaccion` (ver la cabecera de `./use-case-fixture.ts` y el censo en
 * `tests/integration/aislamiento.json`).
 */
import { randomUUID } from 'node:crypto';

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
import { createGetAssignedOrderExecution } from '@/lib/modules/asignaciones/domain/get-assigned-order-execution';
import { createStartAssignedOrder } from '@/lib/modules/asignaciones/domain/start-assigned-order';
import { findRecipeExecutionContentById } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import {
  findAliveOrderTargetById,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma';
import { createOrderWriteRepository } from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { assertTransition } from '@/lib/modules/pedidos/domain/order-transitions';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { OrderCatalog } from '@/lib/modules/pedidos';
import type { OrderStatus } from '@/lib/modules/pedidos/domain/order-classification';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

import {
  NOW,
  actorOf,
  codeOf,
  createOrder,
  createPerson,
  createWorkGroup,
  addMember,
  inRolledBackTransaction,
  withSavepoint,
  type Fixture,
} from './use-case-fixture';
import { realOrderSummaries } from '../../helpers/order-summaries';

const summaryReaders = realOrderSummaries();

/** El error que ningun caso de este archivo tiene que disparar: si algo llama a estos catalogos,
 *  algo cambio en el contenido de la receta o de la orden que este archivo asume vacio. */
function noLlamar(nombre: string): never {
  throw new Error(`responsible-eligibility.int.test: ${nombre} no deberia invocarse aqui`);
}

const unitsQueNoSeLlaman = {
  findRefs: async () => noLlamar('units.findRefs'),
  findRefsSharingBaseInCompany: async () => noLlamar('units.findRefsSharingBaseInCompany'),
} as unknown as UnitCatalog;

const productsQueNoSeLlaman = {
  findRefs: async () => noLlamar('products.findRefs'),
} as unknown as ProductCatalog;

const presentationsQueNoSeLlaman = {
  findRefs: async () => noLlamar('presentations.findRefs'),
} as unknown as PresentationCatalog;

const recipes: RecipeCatalog = {
  findRefsIncludingDeleted: async () => noLlamar('recipes.findRefsIncludingDeleted'),
  findExecutionContentById: findRecipeExecutionContentById,
  findIdsMatchingName: async () => noLlamar('recipes.findIdsMatchingName'),
  findAliveByNormalizedName: async () => noLlamar('recipes.findAliveByNormalizedName'),
};

/**
 * `OrderCatalog['transitionAliveById']` real: `assertTransition` -la misma comprobacion que
 * `createTransitionOrder` hace en produccion antes de abrir la unidad de trabajo- seguida del
 * mismo `UPDATE` condicional, `setStatus` de `createOrderWriteRepository()` sobre el cliente
 * global -aqui, el proxy de la transaccion del test-. No pasa por `withOrderTransaction`: esa
 * funcion abre su PROPIA `prisma.$transaction` con el cliente REAL sin pasar por el proxy
 * (`$transaction` no viaja por el, ver `prisma-tx-holder.ts`), lo que confirmaria de verdad en
 * vez de participar en el `ROLLBACK` del fixture.
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
  // R15, R16: yendo a `POR_EMPACAR` el exito real vuelve a ser el literal `'ok'` -ya
  // no da de alta ningun lote-, asi que este doble no necesita distinguir el destino.
  return createOrderWriteRepository().setStatus(id, from, to, actorId, now, { companyId });
}

/** El `OrderCatalog` REAL: los tres metodos de escritura y lectura que la ejecucion necesita. */
function ordersReales(): OrderCatalog {
  return {
    findAliveById: findAliveOrderTargetById,
    listAliveSummariesByIds: summaryReaders.listAliveSummariesByIds,
    listAliveSummariesInCompany: async () => noLlamar('orders.listAliveSummariesInCompany'),
    transitionAliveById: transitionAliveByIdReal,
    startPackingAliveById: async () => noLlamar('orders.startPackingAliveById'),
    finishPackingAliveById: async () => noLlamar('orders.finishPackingAliveById'),
  };
}

/** Los tres casos de uso de EJECUCION, cableados con los adaptadores reales de la transaccion del
 *  test. Este archivo no toca esos tres modulos: solo demuestra su efecto desde fuera. */
function wireExecutionUseCases(fixture: Fixture) {
  const assignments = createOrderAssignmentRepository(fixture.tx);
  const orders = ordersReales();
  const deps = {
    assignments,
    orders,
    recipes,
    units: unitsQueNoSeLlaman,
    products: productsQueNoSeLlaman,
    presentations: presentationsQueNoSeLlaman,
  };

  return {
    get: createGetAssignedOrderExecution(deps),
    start: createStartAssignedOrder({ ...deps, now: () => NOW }),
    finish: createFinishAssignedOrder({
      assignments,
      orders,
      people: assignmentDirectoryPrisma,
      groups: assignmentDirectoryPrisma,
      now: () => NOW,
    }),
  };
}

/** Un rol efimero con el permiso indicado, para que `assignment-directory-prisma.ts` lo lea de
 *  `role_permissions` de verdad. */
async function createRoleWithPermission(
  fixture: Pick<Fixture, 'tx'>,
  permissionCode: string,
): Promise<string> {
  const role = await fixture.tx.role.create({
    data: { name: `rol-elegibilidad-${randomUUID()}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  await fixture.tx.rolePermission.create({
    data: { roleId: role.id, permissionCode },
  });
  return role.id;
}

describe('asignaciones · quien puede ser responsable, contra la base (integracion)', () => {
  it('R33: una persona con `pedidos.consultar` de verdad -> `user_cannot_be_responsible`, sin escribir', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const administradorRoleId = await createRoleWithPermission(fixture, 'pedidos.consultar');
      const administrador = await createPerson(
        { tx: fixture.tx, roleId: administradorRoleId },
        fixture.companyA,
      );
      const pedido = await createOrder(fixture);

      const error = await withSavepoint(fixture.tx, () =>
        fixture.useCases.assign(
          actorOf(fixture.companyA),
          { orderId: pedido, userIds: [administrador], workGroupIds: [] },
          NOW,
        ),
      );

      expect(codeOf(error)).toBe('user_cannot_be_responsible');
      expect(
        await fixture.tx.orderAssignment.findMany({ where: { orderId: pedido } }),
      ).toEqual([]);
    });
  });

  it('R34, R36: un grupo con un Administrador y un Operador de verdad -> el Operador queda asignado, el Administrador sin fila', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const administradorRoleId = await createRoleWithPermission(fixture, 'pedidos.consultar');
      const administrador = await createPerson(
        { tx: fixture.tx, roleId: administradorRoleId },
        fixture.companyA,
      );
      const operador = await createPerson(fixture, fixture.companyA);
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, grupo.id, administrador);
      await addMember(fixture.tx, fixture.companyA, grupo.id, operador);
      const pedido = await createOrder(fixture);

      const outcome = await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: pedido, userIds: [], workGroupIds: [grupo.id] },
        NOW,
      );

      expect(outcome).toEqual({ added: 1 });
      const filas = await fixture.tx.orderAssignment.findMany({
        where: { orderId: pedido },
        select: { userId: true },
      });
      expect(filas.map((fila) => fila.userId)).toEqual([operador]);
    });
  });

  it('R35: un Administrador NO asignado recibe `order_not_found` de los tres casos de ejecucion, y no se escribe nada', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const administradorRoleId = await createRoleWithPermission(fixture, 'pedidos.consultar');
      const administradorId = await createPerson(
        { tx: fixture.tx, roleId: administradorRoleId },
        fixture.companyA,
      );
      const pedido = await createOrder(fixture);
      const actor: Actor = {
        id: administradorId,
        companyId: fixture.companyA,
        permissions: ['asignaciones.consultar', 'pedidos.consultar'],
      };
      const ejecucion = wireExecutionUseCases(fixture);

      const antes = await fixture.tx.order.findUniqueOrThrow({
        where: { id: pedido },
        select: { status: true, finishedAt: true, updatedAt: true },
      });

      const errorGet = await withSavepoint(fixture.tx, () => ejecucion.get(actor, { orderId: pedido }));
      expect(codeOf(errorGet)).toBe('order_not_found');

      const errorStart = await withSavepoint(fixture.tx, () => ejecucion.start(actor, { orderId: pedido }));
      expect(codeOf(errorStart)).toBe('order_not_found');

      const errorFinish = await withSavepoint(fixture.tx, () => ejecucion.finish(actor, { orderId: pedido }));
      expect(codeOf(errorFinish)).toBe('order_not_found');

      const fila = await fixture.tx.order.findUniqueOrThrow({
        where: { id: pedido },
        select: { status: true, finishedAt: true, updatedAt: true },
      });
      expect(fila.status).toBe('PENDIENTE');
      expect(fila.finishedAt).toEqual(antes.finishedAt);
      expect(fila.updatedAt).toEqual(antes.updatedAt);

      const asignaciones = await fixture.tx.orderAssignment.findMany({ where: { orderId: pedido } });
      expect(asignaciones).toEqual([]);
    });
  });

  it('R37: un Administrador con una fila SEMBRADA directamente sigue pudiendo abrir, arrancar y finalizar ese pedido -que queda POR_EMPACAR-', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const administradorRoleId = await createRoleWithPermission(fixture, 'pedidos.consultar');
      const administradorId = await createPerson(
        { tx: fixture.tx, roleId: administradorRoleId },
        fixture.companyA,
      );
      const pedido = await createOrder(fixture);
      // Sembrada DIRECTAMENTE en la tabla, sin pasar por `assignResponsibles`: una asignacion que
      // ya existia se acepta tal cual, sin migrarla ni rechazarla.
      await fixture.tx.orderAssignment.create({
        data: {
          orderId: pedido,
          userId: administradorId,
          companyId: fixture.companyA,
          workGroupId: null,
          workGroupName: null,
        },
      });
      const actor: Actor = {
        id: administradorId,
        companyId: fixture.companyA,
        permissions: ['asignaciones.consultar', 'pedidos.consultar'],
      };
      const ejecucion = wireExecutionUseCases(fixture);

      const vista = await ejecucion.get(actor, { orderId: pedido });
      expect(vista.orderId).toBe(pedido);
      expect(vista.status).toBe('PENDIENTE');

      const trasArrancar = await ejecucion.start(actor, { orderId: pedido });
      expect(trasArrancar.status).toBe('EN_CURSO');

      const resultado = await ejecucion.finish(actor, { orderId: pedido });
      expect(resultado.numberText).toEqual(expect.any(String));

      const filaFinal = await fixture.tx.order.findUniqueOrThrow({
        where: { id: pedido },
        select: { status: true },
      });
      expect(filaFinal.status).toBe('POR_EMPACAR');
    });
  });
});
