// tests/integration/asignaciones/assigned-orders.int.test.ts
/**
 * QC-88 T3 — «los pedidos que ESTA persona tiene asignados en ESTA empresa»
 * (`listOrderIdsByUserInCompany`) contra Postgres real: el rechazo cruzado (R8) y el alcance de
 * empresa (R7).
 *
 * QUE SE EJERCITA AQUI, Y QUE NO. El **adaptador** (`order-assignment-prisma.ts`, T2) construido
 * sobre la `tx` del test, NO un caso de uso: el caso de uso de esta ficha es **T6** y todavia no
 * existe (esta bloqueado por QC-60). Cuando exista, este archivo sigue valiendo tal cual: lo que
 * mide es el `where` del SQL, que es suyo y no del dominio.
 *
 * POR QUE EN INTEGRACION Y NO EN UNIDAD. En unidad el doble del repositorio devuelve lo que se le
 * diga, asi que «el `where` lleva `company_id`» seria una promesa **del test**, no del codigo: un
 * adaptador que filtrara solo por `user_id` pasaria todos los unitarios del mundo. Aqui corre el
 * SQL de verdad contra dos empresas que existen, con personas, pedidos y asignaciones de verdad, y
 * es lo unico que puede demostrar que el filtro esta **en la consulta**. Es el mismo argumento que
 * la cabecera de `./batch-company-scope.int.test.ts` (QC-102 T2).
 *
 * LA ASIGNACION AJENA SE SIEMBRA DE VERDAD —pedido real, persona real de la empresa B, alta por el
 * caso de uso real de QC-87— y el caso **lo comprueba leyendo la tabla al margen del adaptador**.
 * Sin eso, «no vuelve» seria indistinguible de «no habia nada que devolver», que es justo la
 * confusion que R8 prohibe.
 *
 * LA EMPRESA ENTRA POR LA ASIGNACION, NO POR EL PEDIDO (hallazgo H4 de `design.md > 0`): `orders`
 * no tiene `company_id` —es la deuda de QC-60—, asi que `createOrder` no recibe empresa y no puede.
 * Lo que acota es `(user_id, company_id)` de `order_assignments`.
 *
 * DESVIACION DECLARADA, y es del ESQUEMA, no del spec. «El mismo `user_id` con filas en DOS
 * empresas» **no se puede sembrar**: `order_assignments_user_id_fkey` es COMPUESTA
 * —`(user_id, company_id) -> users(id, company_id)`, migracion `20260911120000_order_assignments`
 * :168— y `users.company_id` es una sola. El ultimo caso de este archivo lo demuestra en vez de
 * darlo por sabido: la base RECHAZA la fila. Asi que R7 se prueba por el unico lado que existe, y
 * es el mismo lado que mata la mutacion: **el mismo `user_id` preguntado por la OTRA empresa
 * devuelve vacio**, teniendo filas.
 *
 * AISLAMIENTO: `transaccion` (ver la cabecera de `./use-case-fixture.ts` y el censo
 * `tests/integration/aislamiento.json`).
 *
 * CADA ASERCION CAE AL MUTAR:
 *   - quitar `companyId` del `where` de `listOrderIdsByUserInCompany` -> caen «la persona ajena no
 *     devuelve nada» (volveria su pedido) y «preguntada por la otra empresa devuelve vacio»
 *     (volverian sus dos pedidos);
 *   - quitar `userId` del `where` -> cae «solo los suyos»: volverian tambien los de la companera;
 *   - devolver las filas en vez de `fila.orderId` (quitar el `.map`) -> cae «ids DESNUDOS»;
 *   - quitar el `orderBy: { orderId: 'asc' }` -> cae el orden estable de R15, que es lo que hace
 *     que dos lecturas seguidas devuelvan la misma secuencia antes de paginar;
 *   - cambiar el `findMany` por algo que lance con cero filas -> cae «sin asignaciones devuelve
 *     lista vacia».
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
      const pedidoAjeno = await createOrder(fixture);

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
      // ...exactamente lo mismo que una persona que NO EXISTE (R8: indistinguibles).
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
      // Orden TOTAL y ESTABLE (R15): sin cambios en los datos, la misma secuencia.
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
    // Por que este caso existe: sin el, la cabecera se quedaria en una afirmacion sobre el esquema
    // que nadie comprueba, y el dia que alguien simplifique la FK a `("user_id") REFERENCES
    // users("id")` —el riesgo 1 que QC-86 dejo escrito en `db/schema.prisma`, OJO 2— todo seguiria
    // verde y la coherencia de empresa desapareceria en silencio. Va con SAVEPOINT porque el error
    // del motor aborta la transaccion entera.
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
