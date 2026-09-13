// tests/integration/asignaciones/company-scope.int.test.ts
/**
 * QC-87 (T14) — La EMPRESA, contra Postgres real: R5, R6 y R7.
 *
 * Los tres requisitos tratan de lo mismo visto desde tres sitios: la empresa de una fila la pone
 * el ACTOR y nunca la entrada (R5); la persona o el grupo de OTRA empresa se rechazan igual que si
 * no existieran (R6); y la consulta no devuelve —ni revela— ninguna asignacion ajena (R7).
 *
 * POR QUE AQUI Y NO EN UNIDAD. En unidad el doble del directorio devuelve lo que se le diga, asi
 * que «el `where` lleva `company_id`» es una promesa del test, no del codigo. Aqui corren el SQL
 * de `assignment-directory-prisma` (T3) y el del repositorio (T4) contra dos empresas que existen
 * de verdad y tienen personas y grupos de verdad, que es lo unico que puede demostrar que el
 * filtro esta en la consulta.
 *
 * AISLAMIENTO: `transaccion` (ver la cabecera de `./use-case-fixture.ts` y el censo).
 *
 * CADA ASERCION CAE AL MUTAR:
 *   - quitar `companyId` del `where` de `findAliveRefsInCompany` -> cae «la persona de la otra
 *     empresa es `user_not_found`»;
 *   - quitar `companyId` del `where` de `findSnapshotAliveInCompany` -> cae el del grupo ajeno;
 *   - quitar `deletedAt: null` de cualquiera de las dos -> caen los casos de la persona y el
 *     grupo dados de baja;
 *   - quitar `companyId` del `where` de `listByOrderInCompany` -> cae el ultimo caso;
 *   - escribir en el dominio la empresa desde otro sitio que no sea `actor.companyId` -> cae el
 *     primero.
 */
import { describe, expect, it, vi } from 'vitest';

// El Proxy que hace que los adaptadores de T2 y T3 —que importan el cliente Prisma GLOBAL— hablen
// por la transaccion del test. No sustituye ninguna consulta: envuelve el cliente REAL
// (`vi.importActual`). El por que, entero, en `./prisma-tx-holder.ts`.
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

describe('asignaciones · la empresa (integracion)', () => {
  it('R5: la empresa de cada fila sale del ACTOR, tambien cuando la persona llega por un grupo', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const orderId = await createOrder(fixture);
      const suelta = await createPerson(fixture, fixture.companyA);
      const delGrupo = await createPerson(fixture, fixture.companyA);
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, grupo.id, delGrupo);

      const { added } = await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId, userIds: [suelta], workGroupIds: [grupo.id] },
        NOW,
      );
      expect(added).toBe(2);

      // La empresa no viaja en la entrada —el esquema ni la admite— y aun asi las DOS filas la
      // llevan: solo pudo salir del actor.
      const filas = await readRows(fixture.tx, orderId);
      expect(filas.map((fila) => fila.companyId)).toEqual([fixture.companyA, fixture.companyA]);
    });
  });

  it('R5: mandar `companyId` en la entrada NO la cambia: la operacion se rechaza por invalida', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const orderId = await createOrder(fixture);
      const userId = await createPerson(fixture, fixture.companyA);

      // `strictObject`: un campo de mas no se ignora en silencio —que seria la version peligrosa
      // de R5, con la empresa entrando por una puerta de atras—, falla.
      const error = await fixture.useCases
        .assign(actorOf(fixture.companyA), { orderId, userIds: [userId], workGroupIds: [], companyId: fixture.companyB }, NOW)
        .catch((caught: unknown) => caught);
      expect(codeOf(error)).toBe('invalid_input');
      expect(await readRows(fixture.tx, orderId)).toEqual([]);
    });
  });

  it('R6: la persona de OTRA empresa, la dada de baja y la inexistente son el MISMO `user_not_found`, y no dejan ninguna fila', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const orderId = await createOrder(fixture);
      const propia = await createPerson(fixture, fixture.companyA);
      const ajena = await createPerson(fixture, fixture.companyB);
      const deBaja = await createPerson(fixture, fixture.companyA, { deletedAt: new Date('2026-01-01T00:00:00.000Z') });
      const inexistente = '00000000-0000-4000-8000-000000000001';
      const actor = actorOf(fixture.companyA);

      for (const sospechosa of [ajena, deBaja, inexistente]) {
        const error = await fixture.useCases
          .assign(actor, { orderId, userIds: [propia, sospechosa], workGroupIds: [] }, NOW)
          .catch((caught: unknown) => caught);
        expect(codeOf(error)).toBe('user_not_found');
      }

      // RECHAZO ENTERO: ni siquiera la persona buena de cada lote quedo creada.
      expect(await readRows(fixture.tx, orderId)).toEqual([]);
    });
  });

  it('R6: el grupo de OTRA empresa, el dado de baja y el inexistente son el MISMO `work_group_not_found`, y no dejan ninguna fila', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const orderId = await createOrder(fixture);
      const ajeno = await createWorkGroup(fixture.tx, fixture.companyB);
      await addMember(fixture.tx, fixture.companyB, ajeno.id, await createPerson(fixture, fixture.companyB));
      const propio = await createWorkGroup(fixture.tx, fixture.companyA);
      await addMember(fixture.tx, fixture.companyA, propio.id, await createPerson(fixture, fixture.companyA));
      const deBaja = await createWorkGroup(fixture.tx, fixture.companyA);
      await fixture.tx.workGroup.update({
        where: { id: deBaja.id },
        data: { deletedAt: new Date('2026-01-01T00:00:00.000Z') },
      });
      const inexistente = '00000000-0000-4000-8000-000000000002';
      const actor = actorOf(fixture.companyA);

      for (const sospechoso of [ajeno.id, deBaja.id, inexistente]) {
        const error = await fixture.useCases
          .assign(actor, { orderId, userIds: [], workGroupIds: [propio.id, sospechoso] }, NOW)
          .catch((caught: unknown) => caught);
        expect(codeOf(error)).toBe('work_group_not_found');
      }

      expect(await readRows(fixture.tx, orderId)).toEqual([]);
    });
  });

  it('R7: la consulta de OTRA empresa no ve las asignaciones ajenas ni revela que existen', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const orderId = await createOrder(fixture);
      const userId = await createPerson(fixture, fixture.companyA, { lastNames: 'Alvarez', firstNames: 'Rosa' });
      await fixture.useCases.assign(actorOf(fixture.companyA), { orderId, userIds: [userId], workGroupIds: [] }, NOW);

      // El pedido existe y ES EL MISMO: lo unico que cambia es la empresa del actor. La lista vacia
      // es exactamente «no hay nada que contarte», no un error que delate la asignacion ajena.
      expect(await fixture.useCases.list(actorOf(fixture.companyB), orderId)).toEqual([]);

      const propia = await fixture.useCases.list(actorOf(fixture.companyA), orderId);
      expect(propia).toHaveLength(1);
      expect(propia[0]?.userId).toBe(userId);
    });
  });

  it('R5, R7: desasignar desde la OTRA empresa no borra nada, y la fila sigue ahi', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const orderId = await createOrder(fixture);
      const userId = await createPerson(fixture, fixture.companyA);
      await fixture.useCases.assign(actorOf(fixture.companyA), { orderId, userIds: [userId], workGroupIds: [] }, NOW);

      // La empresa del actor entra en el `where` del borrado: para la empresa B esa fila no
      // existe, y el codigo es el de «no es responsable de este pedido» (R30), no un exito mudo.
      const error = await fixture.useCases
        .unassign(actorOf(fixture.companyB), { orderId, userId })
        .catch((caught: unknown) => caught);
      expect(codeOf(error)).toBe('order_assignment_not_found');
      expect(await readRows(fixture.tx, orderId)).toHaveLength(1);
    });
  });
});
