// tests/integration/asignaciones/assigned-orders.int.test.ts
/**
 * En unidad, «el `where` lleva `company_id`» seria una promesa del TEST: un adaptador que filtrara
 * solo por `user_id` pasaria todos los unitarios. Aqui corre el SQL contra dos empresas reales.
 *
 * El mismo `user_id` con filas en DOS empresas NO se puede sembrar: la FK de `order_assignments`
 * es compuesta -`(user_id, company_id) -> users(id, company_id)`- y `users.company_id` es una
 * sola. Por eso el alcance de empresa se prueba preguntando por la OTRA, y el ultimo caso del
 * archivo demuestra que la base rechaza la fila en vez de darlo por sabido.
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
import { createListAssignedOrders } from '@/lib/modules/asignaciones/domain/list-assigned-orders';
import { assignmentDirectoryPrisma } from '@/lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma';
import { ROLE_EMPACADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';
import { findPresentationRefs } from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import { findRecipeRefsIncludingDeleted } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import {
  findAliveOrderTargetById,
  listAliveOrderSummariesByIds,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';

import {
  NOW,
  actorOf,
  createOrder,
  createPerson,
  inRolledBackTransaction,
  withSavepoint,
} from './use-case-fixture';

describe('asignaciones · los pedidos de una persona en su empresa (integracion)', () => {
  it('R8: la asignacion de OTRA empresa no vuelve, y no se distingue de una que no existe', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const repo = createOrderAssignmentRepository(fixture.tx);

      const pedidoPropio = await createOrder(fixture);
      // El pedido ajeno tiene que nacer en la empresa B para que la asignacion (tambien de B) sea
      // coherente con su FK compuesta: `assign` resuelve el pedido con `findAliveById(id,
      // companyId)` y lo rechazaria como inexistente si las empresas no coinciden.
      const pedidoAjeno = await createOrder(fixture, { companyId: fixture.companyB });

      const propia = await createPerson(fixture, fixture.companyA);
      const ajena = await createPerson(fixture, fixture.companyB);

      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: pedidoPropio, userIds: [propia], workGroupIds: [] },
        NOW,
      );
      // La asignacion ajena EXISTE y tiene responsable de verdad: lo que se comprueba es que el
      // `where` la filtra, no que no haya datos.
      await fixture.useCases.assign(
        actorOf(fixture.companyB),
        { orderId: pedidoAjeno, userIds: [ajena], workGroupIds: [] },
        NOW,
      );

      // Leido AL MARGEN del adaptador: la fila ajena esta ahi, con su empresa y su pedido.
      expect(
        await fixture.tx.orderAssignment.findMany({
          where: { userId: ajena },
          select: { orderId: true, companyId: true },
        }),
      ).toEqual([{ orderId: pedidoAjeno, companyId: fixture.companyB }]);

      // Y aun asi, desde la empresa A esa persona no tiene nada...
      expect(await repo.listOrderIdsByUserInCompany(fixture.companyA, ajena)).toEqual([]);
      // ...exactamente lo mismo que una persona que NO EXISTE: indistinguibles.
      expect(await repo.listOrderIdsByUserInCompany(fixture.companyA, randomUUID())).toEqual([]);

      // El pedido ajeno tampoco se cuela en la lista de quien si es de la empresa A.
      const suyos = await repo.listOrderIdsByUserInCompany(fixture.companyA, propia);
      expect(suyos).toEqual([pedidoPropio]);
      expect(suyos).not.toContain(pedidoAjeno);
    });
  });

  it('R7: el mismo `user_id` preguntado por la OTRA empresa devuelve vacio, teniendo filas', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const repo = createOrderAssignmentRepository(fixture.tx);

      const uno = await createOrder(fixture);
      const dos = await createOrder(fixture);
      const persona = await createPerson(fixture, fixture.companyA);

      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: uno, userIds: [persona], workGroupIds: [] },
        NOW,
      );
      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: dos, userIds: [persona], workGroupIds: [] },
        NOW,
      );

      // Con su empresa: sus dos pedidos.
      expect(await repo.listOrderIdsByUserInCompany(fixture.companyA, persona)).toHaveLength(2);
      // Con la otra: nada. Esto es lo que cae si `companyId` desaparece del `where`, y es la
      // unica forma de probarlo que el esquema permite (ver la cabecera y el ultimo caso).
      expect(await repo.listOrderIdsByUserInCompany(fixture.companyB, persona)).toEqual([]);
    });
  });

  it('R7: solo los pedidos de ESA persona, no los de su companera de empresa', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const repo = createOrderAssignmentRepository(fixture.tx);

      const mio = await createOrder(fixture);
      const suyo = await createOrder(fixture);
      const yo = await createPerson(fixture, fixture.companyA);
      const ella = await createPerson(fixture, fixture.companyA);

      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: mio, userIds: [yo], workGroupIds: [] },
        NOW,
      );
      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: suyo, userIds: [ella], workGroupIds: [] },
        NOW,
      );

      expect(await repo.listOrderIdsByUserInCompany(fixture.companyA, yo)).toEqual([mio]);
      expect(await repo.listOrderIdsByUserInCompany(fixture.companyA, ella)).toEqual([suyo]);
    });
  });

  it('R15: devuelve identificadores DESNUDOS, ordenados, y dos lecturas seguidas dan lo mismo', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const repo = createOrderAssignmentRepository(fixture.tx);

      const pedidos = [
        await createOrder(fixture),
        await createOrder(fixture),
        await createOrder(fixture),
      ];
      const persona = await createPerson(fixture, fixture.companyA);

      for (const orderId of pedidos) {
        await fixture.useCases.assign(
          actorOf(fixture.companyA),
          { orderId, userIds: [persona], workGroupIds: [] },
          NOW,
        );
      }

      const salida = await repo.listOrderIdsByUserInCompany(fixture.companyA, persona);

      // DESNUDOS: cadenas, no filas. Si el adaptador devolviera `{ orderId }` esto cae.
      for (const id of salida) expect(typeof id).toBe('string');
      // Ordenado por `order_id`: el orden del uuid que decide el MOTOR. Coincide con el de
      // JavaScript porque los guiones estan en posiciones fijas y los digitos hexadecimales van en
      // minuscula; es el mismo ancla que usa `order-assignment-prisma.int.test.ts`.
      expect(salida).toEqual([...pedidos].sort());
      // Orden TOTAL y ESTABLE: sin cambios en los datos, la misma secuencia.
      expect(await repo.listOrderIdsByUserInCompany(fixture.companyA, persona)).toEqual(salida);
    });
  });

  it('una persona de la empresa SIN asignaciones devuelve lista vacia, no un fallo', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const repo = createOrderAssignmentRepository(fixture.tx);
      const persona = await createPerson(fixture, fixture.companyA);

      expect(await repo.listOrderIdsByUserInCompany(fixture.companyA, persona)).toEqual([]);
    });
  });

  it('R7: la BASE impide que un mismo `user_id` tenga filas en dos empresas (FK compuesta)', async () => {
    // Sin este caso, la cabecera seria una afirmacion sobre el esquema que nadie comprueba: el dia
    // que alguien simplifique la FK a `("user_id") REFERENCES users("id")` todo seguiria verde y
    // la coherencia de empresa desapareceria en silencio. Va con SAVEPOINT porque el error del
    // motor aborta la transaccion entera.
    await inRolledBackTransaction(async (fixture) => {
      const pedido = await createOrder(fixture);
      const persona = await createPerson(fixture, fixture.companyA);

      const error = await withSavepoint(fixture.tx, () =>
        fixture.tx.orderAssignment.create({
          data: {
            orderId: pedido,
            userId: persona,
            // La empresa EQUIVOCADA: la persona es de la A.
            companyId: fixture.companyB,
            workGroupId: null,
            workGroupName: null,
            createdAt: NOW,
            updatedAt: NOW,
          },
          select: { orderId: true },
        }),
      );

      expect(error, 'la base ACEPTO una asignacion con la empresa equivocada').not.toBeNull();
      // Se afirma sobre la CLASE de error y no sobre el nombre de la restriccion a proposito:
      // `order_assignments_user_id_fkey` esta escrita A MANO en el `migration.sql` y Prisma no la
      // modela, asi que el driver la reporta como «violated on the (not available)» —sin nombre—.
      // Pedirle el nombre seria afirmar sobre una limitacion del cliente, no sobre la base.
      expect(String((error as { message?: string }).message ?? error)).toContain(
        'Foreign key constraint violated',
      );

      // Y la transaccion sigue viva: no se creo nada.
      expect(await fixture.tx.orderAssignment.findMany({ where: { orderId: pedido } })).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// El caso de uso COMPLETO de `listAssignedOrders`, con un actor cuyos permisos son EXACTAMENTE
// los del Empacador (`SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]`, nunca una lista copiada a mano). El
// dominio ya prueba en unidad que ese conjunto concede; esto prueba, contra Postgres real, que lo
// que ve es solo lo suyo: su empresa y su responsabilidad.
// ---------------------------------------------------------------------------------------------

const PERMISOS_DEL_EMPACADOR = SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR];
if (PERMISOS_DEL_EMPACADOR === undefined) {
  throw new Error('SEED_ROLE_PERMISSIONS no declara al Empacador: este archivo no puede construir su actor');
}

describe('asignaciones · listAssignedOrders con los permisos del Empacador (integracion, R14)', () => {
  it('ve solo los pedidos de su empresa en los que es responsable: no los de otro responsable ni los de otra empresa', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const listAssignedOrders = createListAssignedOrders({
        assignments: createOrderAssignmentRepository(fixture.tx),
        orders: {
          findAliveById: findAliveOrderTargetById,
          listAliveSummariesByIds: listAliveOrderSummariesByIds,
          listAliveSummariesInCompany: async () => {
            throw new Error('QC-144: listAssignedOrders no lista toda la empresa')
          },
          transitionAliveById: async () => {
            throw new Error('QC-144: listAssignedOrders no escribe el estado del pedido');
          },
        },
        recipes: {
          findRefsIncludingDeleted: findRecipeRefsIncludingDeleted,
          findExecutionContentById: async () => {
            throw new Error('QC-144: listAssignedOrders no ejecuta ninguna receta');
          },
          findIdsMatchingName: async () => {
            throw new Error('QC-144: listAssignedOrders no busca recetas por nombre');
          },
        },
        presentations: { findRefs: findPresentationRefs },
        people: assignmentDirectoryPrisma,
        now: () => NOW,
      });

      const empacador = await createPerson(fixture, fixture.companyA);
      const otroResponsableDeLaMismaEmpresa = await createPerson(fixture, fixture.companyA);
      const responsableDeLaOtraEmpresa = await createPerson(fixture, fixture.companyB);

      const pedidoDelEmpacador = await createOrder(fixture);
      const pedidoDeOtroResponsable = await createOrder(fixture);
      const pedidoDeLaOtraEmpresa = await createOrder(fixture, { companyId: fixture.companyB });

      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: pedidoDelEmpacador, userIds: [empacador], workGroupIds: [] },
        NOW,
      );
      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: pedidoDeOtroResponsable, userIds: [otroResponsableDeLaMismaEmpresa], workGroupIds: [] },
        NOW,
      );
      await fixture.useCases.assign(
        actorOf(fixture.companyB),
        { orderId: pedidoDeLaOtraEmpresa, userIds: [responsableDeLaOtraEmpresa], workGroupIds: [] },
        NOW,
      );

      // El actor ES el Empacador: su id es el de la persona asignada, y sus permisos son
      // EXACTAMENTE los que el seed le declara.
      const actorEmpacador: Actor = {
        id: empacador,
        companyId: fixture.companyA,
        permissions: PERMISOS_DEL_EMPACADOR,
      };

      const pagina = await listAssignedOrders(actorEmpacador, { page: 1 });

      expect(pagina.items.map((item) => item.id)).toEqual([pedidoDelEmpacador]);
      expect(pagina.total).toBe(1);
    });
  });
});
