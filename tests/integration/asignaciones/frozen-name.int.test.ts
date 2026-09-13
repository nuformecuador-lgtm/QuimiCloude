// tests/integration/asignaciones/frozen-name.int.test.ts
/**
 * QC-87 (T14) — El NOMBRE CONGELADO: R28 y R36, contra Postgres real.
 *
 * R28: el nombre del grupo se escribe en la MISMA escritura que crea la fila y no se recalcula
 * nunca; cuando el grupo se renombre o se de de baja, ninguna fila ya creada cambia.
 * R36: la lista de responsables NO se deriva de la pertenencia VIGENTE al grupo ni sustituye el
 * nombre congelado por el de hoy.
 *
 * ES EL DATO QUE HACE POSIBLE LA DECISION 6 —«se muestra el nombre del grupo junto a los avatares
 * de sus personas»— y el motivo por el que QC-86 congelo el NOMBRE ademas de las personas: quien
 * mira el tablero de un pedido de hace tres meses tiene que ver como se llamaba el turno ENTONCES.
 *
 * POR QUE AQUI Y NO EN UNIDAD. Que el nombre este congelado en la FILA y no se relea es una
 * afirmacion sobre lo que hay escrito en `order_assignments` despues de que `work_groups` cambie.
 * Con dobles solo se puede comprobar lo que el caso de uso PIDE; aqui se comprueba lo que la tabla
 * GUARDA, y ademas que la consulta lo devuelve tal cual.
 *
 * AISLAMIENTO: `transaccion` (ver `./use-case-fixture.ts`).
 *
 * CADA ASERCION CAE AL MUTAR: hacer que la consulta resuelva el nombre del grupo con una lectura
 * de `work_groups` —el «arreglo» mas tentador— pone rojo el segundo caso (devolveria el nombre
 * nuevo, o nada para el grupo dado de baja); hacer que aplicar un grupo refresque el
 * `work_group_name` de las filas ya existentes pone rojo el primero; y derivar los responsables de
 * `work_group_members` pone rojo el tercero.
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

describe('asignaciones · el nombre congelado (integracion)', () => {
  it('R28: renombrar y dar de baja el grupo despues NO cambia ninguna fila ya creada', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA, `Turno noche ${Date.now()}`);
      await addMember(fixture.tx, fixture.companyA, grupo.id, await createPerson(fixture, fixture.companyA));
      await addMember(fixture.tx, fixture.companyA, grupo.id, await createPerson(fixture, fixture.companyA));

      await fixture.useCases.assign(actor, { orderId, userIds: [], workGroupIds: [grupo.id] }, NOW);
      const antes = await readRows(fixture.tx, orderId);
      expect(antes).toHaveLength(2);
      expect(antes.every((fila) => fila.workGroupName === grupo.name)).toBe(true);

      // El grupo cambia de nombre Y se da de baja. Las dos cosas, que es el caso peor.
      await fixture.tx.workGroup.update({
        where: { id: grupo.id },
        data: { name: `Turno renombrado ${Date.now()}`, deletedAt: new Date('2026-04-01T00:00:00.000Z') },
      });

      // NINGUNA fila cambia: ni el nombre, ni la referencia al grupo, ni las marcas de tiempo.
      expect(await readRows(fixture.tx, orderId)).toEqual(antes);
    });
  });

  it('R36: la consulta devuelve el nombre CONGELADO de la fila, no el nombre de hoy', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA, `Turno de entonces ${Date.now()}`);
      const persona = await createPerson(fixture, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, grupo.id, persona);

      await fixture.useCases.assign(actor, { orderId, userIds: [], workGroupIds: [grupo.id] }, NOW);

      const nombreDeHoy = `Turno de hoy ${Date.now()}`;
      await fixture.tx.workGroup.update({
        where: { id: grupo.id },
        data: { name: nombreDeHoy, deletedAt: new Date('2026-04-01T00:00:00.000Z') },
      });

      const responsables = await fixture.useCases.list(actor, orderId);
      expect(responsables).toHaveLength(1);
      // El grupo esta dado de baja y se llama de otra forma, y aun asi la pantalla podra escribir
      // «Turno de entonces» junto a su cara.
      expect(responsables[0]?.origin).toEqual({
        kind: 'workGroup',
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      });
      expect(responsables[0]?.origin).not.toEqual(
        expect.objectContaining({ workGroupName: nombreDeHoy }),
      );
    });
  });

  it('R36: la lista NO se deriva de la pertenencia vigente: sacar a la persona del grupo no la saca del pedido', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA);
      const persona = await createPerson(fixture, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, grupo.id, persona);
      await fixture.useCases.assign(actor, { orderId, userIds: [], workGroupIds: [grupo.id] }, NOW);

      // Se le quita la pertenencia: si la lista se derivara de `work_group_members`, aqui
      // desapareceria del pedido.
      await fixture.tx.workGroupMember.delete({
        where: { workGroupId_userId: { workGroupId: grupo.id, userId: persona } },
      });

      const responsables = await fixture.useCases.list(actor, orderId);
      expect(responsables.map((responsable) => responsable.userId)).toEqual([persona]);
      expect(responsables[0]?.origin).toEqual({
        kind: 'workGroup',
        workGroupId: grupo.id,
        workGroupName: grupo.name,
      });
    });
  });
});
