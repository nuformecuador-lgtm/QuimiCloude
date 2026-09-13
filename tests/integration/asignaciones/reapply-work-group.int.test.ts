// tests/integration/asignaciones/reapply-work-group.int.test.ts
/**
 * QC-87 (T14) — REAPLICAR un grupo, contra Postgres real: R15, R22, R23 (y R24 de paso).
 *
 * Es el riesgo n.o 1 de `design.md > 10` y el motivo por el que la decision cerrada 2 existe: la
 * implementacion corta —«borrar las filas del grupo y volver a insertarlas con la foto de hoy»—
 * deja la lista «correcta» y ROMPE tres cosas a la vez. Este archivo la mata de tres formas
 * independientes, y por eso los casos afirman sobre `created_at` y sobre el NOMBRE CONGELADO y no
 * solo sobre quien esta en la lista:
 *
 *   1. R22 — quien ya estaba no se toca: ni su origen, ni su `work_group_id`, ni su nombre
 *      congelado, ni sus marcas de tiempo. Vale para las filas SUELTAS, para las de ESE grupo y
 *      para las de OTRO grupo.
 *   2. R22 — quien salio del grupo NO sale del pedido. Una persona que lleva media hora
 *      ejecutando la receta no pierde el pedido porque alguien editara el turno.
 *   3. R23 — quien fue desasignado A MANO y sigue siendo miembro `active` VUELVE a entrar al
 *      reaplicar. Es la consecuencia escrita de la decision 2, no un efecto colateral.
 *
 * Y R15: la persona que YA estaba —por el camino que sea— conserva su fila EXACTAMENTE como
 * estaba, no se duplica y no hace fallar la operacion; `added` cuenta solo las creadas (R16).
 *
 * POR QUE AQUI Y NO EN UNIDAD. Que «quien ya estaba no se toca» lo garantice la BASE y no un `if`
 * es literalmente el diseno (`insertMissing` = `INSERT ... ON CONFLICT DO NOTHING` contra
 * `order_assignments_pkey`): con un doble del puerto, el test estaria comprobando el doble.
 *
 * AISLAMIENTO: `transaccion` (ver `./use-case-fixture.ts`).
 *
 * CADA ASERCION CAE AL MUTAR: cambiar `insertMissing` por `deleteByWorkGroup` + `createMany`
 * (el anti-patron de `design.md > 11.1`) pone rojos los tres primeros casos —las marcas de tiempo
 * y el nombre congelado pasarian a ser los de la segunda pasada, y la persona que salio del grupo
 * desapareceria—; quitar `skipDuplicates` los revienta con `23505`; y hacer que la deduplicacion
 * se quede con el ULTIMO camino en vez de con el primero pone rojo el de R24.
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

/** El segundo instante: distinto del primero en las dos partes de la marca de tiempo. */
const DESPUES = new Date('2026-03-02T18:30:00.000Z');

describe('asignaciones · reaplicar un grupo (integracion)', () => {
  it('R22, R23: reaplicar anade SOLO a los que faltan y no toca ni una fila vieja', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA, `Turno noche ${Date.now()}`);

      const sigueEnElGrupo = await createPerson(fixture, fixture.companyA);
      const desasignadaAMano = await createPerson(fixture, fixture.companyA);
      const saleDelGrupo = await createPerson(fixture, fixture.companyA);
      for (const persona of [sigueEnElGrupo, desasignadaAMano, saleDelGrupo]) {
        await addMember(fixture.tx, fixture.companyA, grupo.id, persona);
      }

      // Primera aplicacion: entran las tres, con el nombre de ENTONCES congelado.
      expect(
        (await fixture.useCases.assign(actor, { orderId, userIds: [], workGroupIds: [grupo.id] }, NOW)).added,
      ).toBe(3);
      const antes = await readRows(fixture.tx, orderId);
      expect(antes).toHaveLength(3);

      // Entre las dos aplicaciones pasan las tres cosas que el mundo real hace:
      // (a) a una la desasignan a mano —y sigue siendo miembro `active`— (R23);
      await fixture.useCases.unassign(actor, { orderId, userId: desasignadaAMano });
      // (b) a otra la SACAN DEL GRUPO, pero sigue siendo responsable del pedido (R22);
      await fixture.tx.workGroupMember.delete({
        where: { workGroupId_userId: { workGroupId: grupo.id, userId: saleDelGrupo } },
      });
      // (c) entra gente nueva al grupo y el grupo se RENOMBRA.
      const recienLlegada = await createPerson(fixture, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, grupo.id, recienLlegada);
      const nombreNuevo = `Turno noche renombrado ${Date.now()}`;
      await fixture.tx.workGroup.update({ where: { id: grupo.id }, data: { name: nombreNuevo } });

      const { added } = await fixture.useCases.assign(
        actor,
        { orderId, userIds: [], workGroupIds: [grupo.id] },
        DESPUES,
      );
      // DOS y no tres: la que sigue en el grupo Y en el pedido no se cuenta (R16).
      expect(added).toBe(2);

      const despues = await readRows(fixture.tx, orderId);
      expect(despues.map((fila) => fila.userId).sort()).toEqual(
        [sigueEnElGrupo, desasignadaAMano, saleDelGrupo, recienLlegada].sort(),
      );

      // R22, la parte fuerte: la fila que ya estaba esta EXACTAMENTE como estaba. Si alguien
      // borrara y reinsertara, `createdAt` seria `DESPUES` y el nombre seria el nuevo.
      const vieja = despues.find((fila) => fila.userId === sigueEnElGrupo);
      expect(vieja).toEqual(antes.find((fila) => fila.userId === sigueEnElGrupo));
      expect(vieja?.workGroupName).toBe(grupo.name);
      expect(vieja?.createdAt).toEqual(NOW);

      // R22: la que salio del grupo conserva su fila intacta y NO se fue del pedido.
      expect(despues.find((fila) => fila.userId === saleDelGrupo)).toEqual(
        antes.find((fila) => fila.userId === saleDelGrupo),
      );

      // R23: la desasignada a mano volvio, con fila NUEVA y el nombre de AHORA congelado.
      const vuelta = despues.find((fila) => fila.userId === desasignadaAMano);
      expect(vuelta?.createdAt).toEqual(DESPUES);
      expect(vuelta?.workGroupName).toBe(nombreNuevo);
    });
  });

  it('R15, R22: la persona que ya estaba SUELTA conserva su origen suelto cuando llega por el grupo', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA);
      const persona = await createPerson(fixture, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, grupo.id, persona);

      expect(
        (await fixture.useCases.assign(actor, { orderId, userIds: [persona], workGroupIds: [] }, NOW)).added,
      ).toBe(1);
      const [suelta] = await readRows(fixture.tx, orderId);
      expect(suelta?.workGroupId).toBeNull();

      // Ahora se aplica el grupo del que ES miembro: NO se le cambia el origen ni se le cuelga el
      // nombre del grupo. R15 dice «exactamente como estaba», y eso incluye no ganar un grupo.
      const { added } = await fixture.useCases.assign(
        actor,
        { orderId, userIds: [], workGroupIds: [grupo.id] },
        DESPUES,
      );
      expect(added).toBe(0);

      const filas = await readRows(fixture.tx, orderId);
      expect(filas).toHaveLength(1);
      expect(filas[0]).toEqual(suelta);
    });
  });

  it('R15, R22: la fila de OTRO grupo tampoco se toca al aplicar el grupo nuevo', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const primero = await createWorkGroup(fixture.tx, fixture.companyA, `Turno A ${Date.now()}`);
      const segundo = await createWorkGroup(fixture.tx, fixture.companyA, `Turno B ${Date.now()}`);
      // La misma persona esta en los DOS grupos: es el caso que mas facil se rompe.
      const enLosDos = await createPerson(fixture, fixture.companyA);
      const soloEnElSegundo = await createPerson(fixture, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, primero.id, enLosDos);
      await addMember(fixture.tx, fixture.companyA, segundo.id, enLosDos);
      await addMember(fixture.tx, fixture.companyA, segundo.id, soloEnElSegundo);

      await fixture.useCases.assign(actor, { orderId, userIds: [], workGroupIds: [primero.id] }, NOW);
      const { added } = await fixture.useCases.assign(
        actor,
        { orderId, userIds: [], workGroupIds: [segundo.id] },
        DESPUES,
      );
      expect(added).toBe(1);

      const filas = await readRows(fixture.tx, orderId);
      const compartida = filas.find((fila) => fila.userId === enLosDos);
      // Gana el PRIMER origen (decision 7, QC-86): sigue siendo del grupo A, con SU nombre.
      expect(compartida?.workGroupId).toBe(primero.id);
      expect(compartida?.workGroupName).toBe(primero.name);
      expect(compartida?.createdAt).toEqual(NOW);
      expect(filas.find((fila) => fila.userId === soloEnElSegundo)?.workGroupId).toBe(segundo.id);
    });
  });

  it('R24: en UNA sola operacion con suelta y grupo, gana el PRIMER camino —la suelta—', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA);
      const persona = await createPerson(fixture, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, grupo.id, persona);

      // La misma persona llega por los dos caminos a la vez. La base no puede decidirlo —seria
      // una fila duplicada contra la PK—: lo decide el dominio ANTES de escribir, y el orden es
      // «primero las sueltas, despues los grupos».
      const { added } = await fixture.useCases.assign(
        actor,
        { orderId, userIds: [persona], workGroupIds: [grupo.id] },
        NOW,
      );
      expect(added).toBe(1);

      const filas = await readRows(fixture.tx, orderId);
      expect(filas).toHaveLength(1);
      expect(filas[0]?.workGroupId).toBeNull();
      expect(filas[0]?.workGroupName).toBeNull();
    });
  });
});
