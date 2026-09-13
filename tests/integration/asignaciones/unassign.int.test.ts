// tests/integration/asignaciones/unassign.int.test.ts
/**
 * QC-87 (T14) — Desasignar a UNA persona: R29 (y R30, R31 de paso), contra Postgres real.
 *
 * R29 es un requisito sobre lo que **NO** pasa: se elimina FISICAMENTE esa fila «y ninguna otra»
 * —ni las demas del mismo grupo en ese pedido, ni las sueltas, ni las del mismo grupo en OTRO
 * pedido—, y no se modifica el pedido, la persona ni el grupo. Un `deleteMany` mal acotado pasaria
 * cualquier test que solo mirase «la persona ya no esta».
 *
 * BORRADO FISICO, y es una excepcion DELIBERADA al borrado logico de QC-4 (QC-86 R15, decision
 * cerrada 5 de QC-86): por eso el caso afirma que la fila DESAPARECE de la tabla, no que quede
 * marcada.
 *
 * AISLAMIENTO: `transaccion` (ver `./use-case-fixture.ts`).
 *
 * CADA ASERCION CAE AL MUTAR: quitar `userId` del `where` del borrado (dejando `orderId`) pone
 * rojo el primer caso —se llevaria por delante a los otros tres—; quitar `orderId` se lleva la
 * fila del otro pedido y tambien lo pone rojo; cambiar el borrado fisico por un `update` de
 * baja logica pone rojo el conteo de filas; y traducir el `'not_found'` a exito mudo pone rojo el
 * segundo caso.
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
  codeOf,
  createOrder,
  createPerson,
  createWorkGroup,
  inRolledBackTransaction,
  readRows,
} from './use-case-fixture';

describe('asignaciones · desasignar a una persona (integracion)', () => {
  it('R29: borra FISICAMENTE su fila y ninguna otra, ni del grupo, ni suelta, ni de otro pedido', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const otroPedido = await createOrder(fixture);
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA);

      const sale = await createPerson(fixture, fixture.companyA);
      const companeraDeGrupo = await createPerson(fixture, fixture.companyA);
      const suelta = await createPerson(fixture, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, grupo.id, sale);
      await addMember(fixture.tx, fixture.companyA, grupo.id, companeraDeGrupo);

      await fixture.useCases.assign(actor, { orderId, userIds: [suelta], workGroupIds: [grupo.id] }, NOW);
      // La MISMA persona, por el MISMO grupo, en OTRO pedido: el borrado no puede alcanzarla.
      await fixture.useCases.assign(actor, { orderId: otroPedido, userIds: [], workGroupIds: [grupo.id] }, NOW);
      expect(await readRows(fixture.tx, orderId)).toHaveLength(3);

      await fixture.useCases.unassign(actor, { orderId, userId: sale });

      const quedan = await readRows(fixture.tx, orderId);
      // FISICO: la fila no queda marcada, desaparece. Y las otras dos siguen enteras.
      expect(quedan.map((fila) => fila.userId).sort()).toEqual([companeraDeGrupo, suelta].sort());
      expect(quedan.find((fila) => fila.userId === companeraDeGrupo)?.workGroupId).toBe(grupo.id);
      expect(quedan.find((fila) => fila.userId === suelta)?.workGroupId).toBeNull();
      // El otro pedido, INTACTO: la fila de la misma persona por el mismo grupo sigue ahi, y la
      // de su companera tambien. Si el `where` del borrado perdiera `order_id`, aqui faltaria una.
      expect((await readRows(fixture.tx, otroPedido)).map((fila) => fila.userId).sort()).toEqual(
        [sale, companeraDeGrupo].sort(),
      );

      // Y no se toco ni la persona, ni el grupo: siguen vivos.
      expect(await fixture.tx.user.count({ where: { id: sale, deletedAt: null } })).toBe(1);
      expect(await fixture.tx.workGroup.count({ where: { id: grupo.id, deletedAt: null } })).toBe(1);
    });
  });

  it('R30: desasignar a quien no es responsable de ESE pedido se rechaza y no borra nada', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const otroPedido = await createOrder(fixture);
      const responsable = await createPerson(fixture, fixture.companyA);
      // Existe, es de la empresa y esta `active`: lo unico que no es, es responsable de ESTE
      // pedido. Por eso el codigo no es `user_not_found`.
      const ajena = await createPerson(fixture, fixture.companyA);
      await fixture.useCases.assign(actor, { orderId, userIds: [responsable], workGroupIds: [] }, NOW);
      await fixture.useCases.assign(actor, { orderId: otroPedido, userIds: [ajena], workGroupIds: [] }, NOW);

      const error = await fixture.useCases
        .unassign(actor, { orderId, userId: ajena })
        .catch((caught: unknown) => caught);
      expect(codeOf(error)).toBe('order_assignment_not_found');
      expect((await readRows(fixture.tx, orderId)).map((fila) => fila.userId)).toEqual([responsable]);
      expect(await readRows(fixture.tx, otroPedido)).toHaveLength(1);

      // Y desasignar DOS VECES a la misma tampoco es idempotente en silencio: la segunda avisa.
      await fixture.useCases.unassign(actor, { orderId, userId: responsable });
      const segunda = await fixture.useCases
        .unassign(actor, { orderId, userId: responsable })
        .catch((caught: unknown) => caught);
      expect(codeOf(segunda)).toBe('order_assignment_not_found');
      expect(await readRows(fixture.tx, orderId)).toEqual([]);
    });
  });

  it('R31: la entrada no admite una lista de personas, asi que no puede expresar un borrado masivo', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const una = await createPerson(fixture, fixture.companyA);
      const otra = await createPerson(fixture, fixture.companyA);
      await fixture.useCases.assign(actor, { orderId, userIds: [una, otra], workGroupIds: [] }, NOW);

      // `strictObject`: `userIds` no se ignora en silencio —que dejaria pasar la operacion sin
      // `userId` y con una lista colgando—, falla. Y la tabla no se toca.
      const error = await fixture.useCases
        .unassign(actor, { orderId, userIds: [una, otra] })
        .catch((caught: unknown) => caught);
      expect(codeOf(error)).toBe('invalid_input');
      expect(await readRows(fixture.tx, orderId)).toHaveLength(2);
    });
  });
});
