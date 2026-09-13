// tests/integration/asignaciones/remove-work-group.int.test.ts
/**
 * QC-87 (T14) — Quitar un GRUPO del pedido: R32 (y R33, R34 de paso), contra Postgres real.
 *
 * R32 pide dos cosas a la vez y las dos se rompen por separado:
 *   - se eliminan FISICAMENTE **todas** las filas de ese pedido cuyo origen sea ESE grupo;
 *   - y **ninguna otra**: ni las sueltas, ni las de otro grupo, ni las de ese grupo en OTRO pedido.
 *
 * Y una tercera que es la que nadie prueba: funciona **aunque el grupo se haya renombrado o dado
 * de baja despues de aplicarse**. Se borra por el `work_group_id` CONGELADO EN LA FILA, y por eso
 * este caso de uso NO pregunta por el grupo a `identity` (`design.md > 5`). Es exactamente lo que
 * pasaria en produccion: se aplica un turno, se borra el turno, y el pedido se queda con gente que
 * hay que poder sacar.
 *
 * AISLAMIENTO: `transaccion` (ver `./use-case-fixture.ts`).
 *
 * CADA ASERCION CAE AL MUTAR: quitar `workGroupId` del `where` del borrado se lleva las sueltas y
 * las del otro grupo -> rojo; quitar `orderId` se lleva las del otro pedido -> rojo; anadir una
 * comprobacion de que el grupo exista y este vivo pone rojo el caso del grupo dado de baja;
 * devolver `void` en vez del numero de filas pone rojo el conteo (R34), y convertir el cero en un
 * error pone rojo el ultimo (R33).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/shared/db/prisma', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shared/db/prisma')>('@/lib/shared/db/prisma');
  const { txAwareProxy } = await import('./prisma-tx-holder');
  return { prisma: txAwareProxy(actual.prisma) };
});

import {
  NOW,
  actorOf,
  addMember,
  createOrder,
  createPerson,
  createWorkGroup,
  inRolledBackTransaction,
  readRows,
} from './use-case-fixture';

describe('asignaciones · quitar un grupo del pedido (integracion)', () => {
  it('R32, R34: borra las filas de ESE grupo y ninguna otra, y dice cuantas', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const otroPedido = await createOrder(fixture);
      const objetivo = await createWorkGroup(fixture.tx, fixture.companyA, `Turno A ${Date.now()}`);
      const otroGrupo = await createWorkGroup(fixture.tx, fixture.companyA, `Turno B ${Date.now()}`);

      const delObjetivo1 = await createPerson(fixture, fixture.companyA);
      const delObjetivo2 = await createPerson(fixture, fixture.companyA);
      const delOtroGrupo = await createPerson(fixture, fixture.companyA);
      const suelta = await createPerson(fixture, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, objetivo.id, delObjetivo1);
      await addMember(fixture.tx, fixture.companyA, objetivo.id, delObjetivo2);
      await addMember(fixture.tx, fixture.companyA, otroGrupo.id, delOtroGrupo);

      await fixture.useCases.assign(
        actor,
        { orderId, userIds: [suelta], workGroupIds: [objetivo.id, otroGrupo.id] },
        NOW,
      );
      // El MISMO grupo aplicado a OTRO pedido: quitarlo de este no puede vaciar aquel.
      await fixture.useCases.assign(actor, { orderId: otroPedido, userIds: [], workGroupIds: [objetivo.id] }, NOW);
      expect(await readRows(fixture.tx, orderId)).toHaveLength(4);

      const { removed } = await fixture.useCases.removeWorkGroup(actor, { orderId, workGroupId: objetivo.id });
      // R34: el numero lo devuelve la base, no un conteo a mano.
      expect(removed).toBe(2);

      const quedan = await readRows(fixture.tx, orderId);
      expect(quedan.map((fila) => fila.userId).sort()).toEqual([delOtroGrupo, suelta].sort());
      expect(quedan.find((fila) => fila.userId === delOtroGrupo)?.workGroupId).toBe(otroGrupo.id);
      expect(quedan.find((fila) => fila.userId === suelta)?.workGroupId).toBeNull();
      expect(await readRows(fixture.tx, otroPedido)).toHaveLength(2);
    });
  });

  it('R32: quitar un grupo RENOMBRADO y DADO DE BAJA despues de aplicarse funciona igual', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA, `Turno que morira ${Date.now()}`);
      await addMember(fixture.tx, fixture.companyA, grupo.id, await createPerson(fixture, fixture.companyA));
      await addMember(fixture.tx, fixture.companyA, grupo.id, await createPerson(fixture, fixture.companyA));
      await fixture.useCases.assign(actor, { orderId, userIds: [], workGroupIds: [grupo.id] }, NOW);

      await fixture.tx.workGroup.update({
        where: { id: grupo.id },
        data: { name: `Turno renombrado ${Date.now()}`, deletedAt: new Date('2026-04-01T00:00:00.000Z') },
      });

      // Ni `work_group_not_found` ni nada parecido: se borra por el identificador congelado en la
      // fila. Si este caso de uso preguntara por el grupo, aqui el pedido se quedaria con dos
      // responsables imposibles de sacar.
      const { removed } = await fixture.useCases.removeWorkGroup(actor, { orderId, workGroupId: grupo.id });
      expect(removed).toBe(2);
      expect(await readRows(fixture.tx, orderId)).toEqual([]);
    });
  });

  it('R33: un grupo sin ninguna fila en ese pedido termina con exito y cero eliminadas', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const nuncaAplicado = await createWorkGroup(fixture.tx, fixture.companyA);
      const suelta = await createPerson(fixture, fixture.companyA);
      await fixture.useCases.assign(actor, { orderId, userIds: [suelta], workGroupIds: [] }, NOW);

      expect((await fixture.useCases.removeWorkGroup(actor, { orderId, workGroupId: nuncaAplicado.id })).removed).toBe(0);
      // Un grupo que NI SIQUIERA EXISTE tampoco es un error aqui: es cero.
      expect(
        (await fixture.useCases.removeWorkGroup(actor, {
          orderId,
          workGroupId: '00000000-0000-4000-8000-00000000003a',
        })).removed,
      ).toBe(0);
      expect(await readRows(fixture.tx, orderId)).toHaveLength(1);
    });
  });
});
