// tests/integration/asignaciones/batch-company-scope.int.test.ts
/**
 * QC-102 T2 — La consulta EN LOTE contra Postgres real: la EMPRESA (R3), el reparto por pedido
 * (R1, R7) y el orden (R6).
 *
 * POR QUE AQUI Y NO EN UNIDAD. En unidad el doble del repositorio devuelve lo que se le diga, asi
 * que «el `where` lleva `company_id` y `order_id IN (...)`» es una promesa del test, no del codigo.
 * Aqui corre el SQL de `listByOrdersInCompany` contra dos empresas que existen de verdad, con
 * pedidos y asignaciones de verdad, que es lo unico que puede demostrar que el filtro esta en la
 * consulta.
 *
 * AISLAMIENTO: `transaccion` (ver la cabecera de `./use-case-fixture.ts` y el censo
 * `tests/integration/aislamiento.json`).
 *
 * CADA ASERCION CAE AL MUTAR:
 *   - quitar `companyId` del `where` de `listByOrdersInCompany` -> cae «el pedido de la otra
 *     empresa vuelve VACIO»;
 *   - cambiar `orderId: { in: orderIds }` por un `findMany` sin filtro -> cae «un pedido que no se
 *     pidio no aparece»;
 *   - quitar `orderId` del `select` -> ni siquiera compila: sin el no hay por donde agrupar;
 *   - quitar el `sort` del caso de uso -> cae el orden por nombre mostrable.
 */
import { describe, expect, it, vi } from 'vitest';

// El Proxy que hace que los adaptadores que importan el cliente Prisma GLOBAL hablen por la
// transaccion del test. No sustituye ninguna consulta: envuelve el cliente REAL.
vi.mock('@/lib/shared/db/prisma', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shared/db/prisma')>('@/lib/shared/db/prisma');
  const { txAwareProxy } = await import('./prisma-tx-holder');
  return { prisma: txAwareProxy(actual.prisma) };
});

import {
  NOW,
  actorOf,
  codeOf,
  createOrder,
  createPerson,
  createWorkGroup,
  addMember,
  inRolledBackTransaction,
} from './use-case-fixture';

describe('asignaciones · la consulta EN LOTE y la empresa (integracion)', () => {
  it('R3: con dos pedidos propios y uno de OTRA empresa, el ajeno vuelve VACIO', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const pedidoA = await createOrder(fixture);
      const pedidoB = await createOrder(fixture);
      const pedidoAjeno = await createOrder(fixture);

      const propia = await createPerson(fixture, fixture.companyA, { lastNames: 'Alvarez', firstNames: 'Rosa' });
      const otra = await createPerson(fixture, fixture.companyA, { lastNames: 'Bernal', firstNames: 'Luis' });
      const ajena = await createPerson(fixture, fixture.companyB);

      await fixture.useCases.assign(actorOf(fixture.companyA), { orderId: pedidoA, userIds: [propia], workGroupIds: [] }, NOW);
      await fixture.useCases.assign(actorOf(fixture.companyA), { orderId: pedidoB, userIds: [otra], workGroupIds: [] }, NOW);
      // El pedido de la empresa B tiene responsable de verdad: lo que se comprueba es que NO vuelve,
      // no que no exista.
      await fixture.useCases.assign(actorOf(fixture.companyB), { orderId: pedidoAjeno, userIds: [ajena], workGroupIds: [] }, NOW);

      const salida = await fixture.useCases.listForOrders(actorOf(fixture.companyA), [
        pedidoA,
        pedidoB,
        pedidoAjeno,
      ]);

      // Una entrada por cada identificador pedido, en el mismo orden (R1).
      expect(salida.map((entrada) => entrada.orderId)).toEqual([pedidoA, pedidoB, pedidoAjeno]);
      expect(salida[0]?.responsibles.map((r) => r.userId)).toEqual([propia]);
      expect(salida[1]?.responsibles.map((r) => r.userId)).toEqual([otra]);
      // R3 y R7: el pedido de la otra empresa es indistinguible de uno sin responsables.
      expect(salida[2]?.responsibles).toEqual([]);
    });
  });

  it('R3: el actor de la OTRA empresa no ve ninguna de las asignaciones ajenas, ni que existan', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const pedido = await createOrder(fixture);
      const persona = await createPerson(fixture, fixture.companyA);
      await fixture.useCases.assign(actorOf(fixture.companyA), { orderId: pedido, userIds: [persona], workGroupIds: [] }, NOW);

      // El pedido existe y ES EL MISMO: lo unico que cambia es la empresa del actor.
      expect(await fixture.useCases.listForOrders(actorOf(fixture.companyB), [pedido])).toEqual([
        { orderId: pedido, responsibles: [] },
      ]);
    });
  });

  it('R7: un pedido inexistente, uno dado de baja y uno sin nadie devuelven los TRES entrada vacia', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const conNadie = await createOrder(fixture);
      const deBaja = await createOrder(fixture, { deletedAt: new Date('2026-01-01T00:00:00.000Z') });
      const inexistente = '00000000-0000-4000-8000-000000000003';

      const salida = await fixture.useCases.listForOrders(actorOf(fixture.companyA), [
        conNadie,
        deBaja,
        inexistente,
      ]);

      expect(salida).toEqual([
        { orderId: conNadie, responsibles: [] },
        { orderId: deBaja, responsibles: [] },
        { orderId: inexistente, responsibles: [] },
      ]);
    });
  });

  it('R6, R12: dentro de cada pedido el orden es por nombre, y el nombre del grupo es el CONGELADO', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const pedido = await createOrder(fixture);
      const zulema = await createPerson(fixture, fixture.companyA, { lastNames: 'Zapata', firstNames: 'Zulema' });
      const ana = await createPerson(fixture, fixture.companyA, { lastNames: 'Alvarez', firstNames: 'Ana' });
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA, `Turno manana ${pedido}`);
      await addMember(fixture.tx, fixture.companyA, grupo.id, zulema);

      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId: pedido, userIds: [ana], workGroupIds: [grupo.id] },
        NOW,
      );

      // El grupo se RENOMBRA despues de asignar: la fila conserva el nombre de entonces (R12).
      await fixture.tx.workGroup.update({
        where: { id: grupo.id },
        data: { name: `${grupo.name} (renombrado)` },
      });

      const [entrada] = await fixture.useCases.listForOrders(actorOf(fixture.companyA), [pedido]);

      expect(entrada?.responsibles.map((r) => r.userId)).toEqual([ana, zulema]);
      expect(entrada?.responsibles[1]?.origin).toEqual({
        kind: 'workGroup',
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      });
      // Y el lote ordena IGUAL que la consulta de un solo pedido (R6).
      expect(entrada?.responsibles).toEqual(
        await fixture.useCases.list(actorOf(fixture.companyA), pedido),
      );
    });
  });

  it('R8, R9: la lista vacia es exito y una lista invalida es `invalid_input`', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);

      expect(await fixture.useCases.listForOrders(actor, [])).toEqual([]);

      const error = await fixture.useCases
        .listForOrders(actor, ['no-soy-un-uuid'])
        .catch((caught: unknown) => caught);
      expect(codeOf(error)).toBe('invalid_input');
    });
  });
});
