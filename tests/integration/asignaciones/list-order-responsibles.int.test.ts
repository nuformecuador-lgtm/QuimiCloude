// tests/integration/asignaciones/list-order-responsibles.int.test.ts
/**
 * QC-87 (T14) — La CONSULTA de responsables, contra Postgres real: R37 (y R35, R38, R40 de paso).
 *
 * R37 es el requisito que mas facil se «arregla» mal: MIENTRAS una persona responsable este dada
 * de baja, inactiva o bloqueada, la consulta DEBE seguir devolviendola con su nombre mostrable.
 * Un `filter` bienintencionado —o reusar `findAliveRefsInCompany` en vez de
 * `findRefsIncludingDeletedInCompany`— convertiria un responsable en un avatar invisible: el
 * pedido seguiria teniendo su fila y la pantalla diria que no la tiene. Es la decision 9 de QC-86
 * («la persona de baja sigue siendo responsable; quien lee la filtra»).
 *
 * POR QUE AQUI Y NO EN UNIDAD. El que decide si la persona de baja vuelve es el `where` del
 * adaptador de `identity` (T3), y en unidad eso lo decide el doble. Aqui la persona se da de baja
 * DE VERDAD y la consulta se hace contra la tabla.
 *
 * AISLAMIENTO: `transaccion` (ver `./use-case-fixture.ts`).
 *
 * CADA ASERCION CAE AL MUTAR: cambiar `findRefsIncludingDeletedInCompany` por
 * `findAliveRefsInCompany` —o anadir `deletedAt: null` a su `where`— pone rojo el primer caso;
 * quitar el desempate por `userId` del orden pone rojo el de las homonimas; devolver el estado de
 * cuenta en la proyeccion pone rojo el de R39; y lanzar en vez de devolver `[]` pone rojo el de
 * R40.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/shared/db/prisma', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shared/db/prisma')>('@/lib/shared/db/prisma');
  const { txAwareProxy } = await import('./prisma-tx-holder');
  return { prisma: txAwareProxy(actual.prisma) };
});

import {
  CONSULTAR_PEDIDOS,
  NOW,
  actorOf,
  addMember,
  createOrder,
  createPerson,
  createWorkGroup,
  inRolledBackTransaction,
} from './use-case-fixture';

describe('asignaciones · la consulta de responsables (integracion)', () => {
  it('R37: la persona de baja, la inactiva y la bloqueada siguen saliendo, con su nombre mostrable', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);

      const activa = await createPerson(fixture, fixture.companyA, { firstNames: 'Ana', lastNames: 'Uno' });
      const seDaraDeBaja = await createPerson(fixture, fixture.companyA, { firstNames: 'Bruno', lastNames: 'Dos' });
      const seDesactivara = await createPerson(fixture, fixture.companyA, { firstNames: 'Carla', lastNames: 'Tres' });
      const seBloqueara = await createPerson(fixture, fixture.companyA, { firstNames: 'Dario', lastNames: 'Cuatro' });

      // Se asignan mientras estan `active` —R18 no dejaria asignarlas si no lo estuvieran— y
      // DESPUES les pasa la vida.
      await fixture.useCases.assign(
        actor,
        { orderId, userIds: [activa, seDaraDeBaja, seDesactivara, seBloqueara], workGroupIds: [] },
        NOW,
      );

      await fixture.tx.user.update({
        where: { id: seDaraDeBaja },
        data: { deletedAt: new Date('2026-04-01T00:00:00.000Z') },
      });
      await fixture.tx.user.update({ where: { id: seDesactivara }, data: { accountStatus: 'inactive' } });
      await fixture.tx.user.update({ where: { id: seBloqueara }, data: { accountStatus: 'blocked' } });

      const responsables = await fixture.useCases.list(actor, orderId);
      // Las CUATRO, y con nombre: ninguna se convierte en un avatar invisible.
      expect(responsables.map((responsable) => responsable.displayName)).toEqual([
        'Ana Uno',
        'Bruno Dos',
        'Carla Tres',
        'Dario Cuatro',
      ]);
      expect(responsables.map((responsable) => responsable.userId).sort()).toEqual(
        [activa, seDaraDeBaja, seDesactivara, seBloqueara].sort(),
      );
    });
  });

  it('R35, R39: cada entrada trae identificador, nombre y origen, y NADA de la cuenta', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const grupo = await createWorkGroup(fixture.tx, fixture.companyA, `Turno noche ${Date.now()}`);
      const deGrupo = await createPerson(fixture, fixture.companyA, { firstNames: 'Elena', lastNames: 'Cinco' });
      const suelta = await createPerson(fixture, fixture.companyA, { firstNames: 'Fabio', lastNames: 'Seis' });
      await addMember(fixture.tx, fixture.companyA, grupo.id, deGrupo);

      await fixture.useCases.assign(actor, { orderId, userIds: [suelta], workGroupIds: [grupo.id] }, NOW);

      const responsables = await fixture.useCases.list(actor, orderId);
      expect(responsables).toEqual([
        {
          userId: deGrupo,
          displayName: 'Elena Cinco',
          origin: { kind: 'workGroup', workGroupId: grupo.id, workGroupName: grupo.name },
        },
        { userId: suelta, displayName: 'Fabio Seis', origin: { kind: 'direct' } },
      ]);
      // La comparacion de arriba es EXACTA (`toEqual` con objetos completos): si la proyeccion
      // ganara `email`, `documentNumber`, `accountStatus` o cualquier marca de baja, caeria.
    });
  });

  it('R38: dos homonimas salen siempre en el mismo orden, desempatadas por identificador', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      // MISMO nombre mostrable: sin el desempate, el orden dependeria de como las colocara la
      // lectura anterior, y «dos lecturas seguidas devuelven la misma secuencia» se caeria.
      const una = await createPerson(fixture, fixture.companyA, { firstNames: 'Zoe', lastNames: 'Mismo' });
      const otra = await createPerson(fixture, fixture.companyA, { firstNames: 'Zoe', lastNames: 'Mismo' });
      const primeraPorNombre = await createPerson(fixture, fixture.companyA, { firstNames: 'Aaron', lastNames: 'Primero' });

      await fixture.useCases.assign(actor, { orderId, userIds: [una, otra, primeraPorNombre], workGroupIds: [] }, NOW);

      const esperado = [primeraPorNombre, ...[una, otra].sort()];
      expect((await fixture.useCases.list(actor, orderId)).map((responsable) => responsable.userId)).toEqual(esperado);
      // Dos lecturas seguidas, la MISMA secuencia.
      expect((await fixture.useCases.list(actor, orderId)).map((responsable) => responsable.userId)).toEqual(esperado);
    });
  });

  it('R40, R13: un pedido sin asignaciones devuelve lista vacia, y un ENTREGADO o CANCELADO se consulta igual', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const vacio = await createOrder(fixture);
      expect(await fixture.useCases.list(actor, vacio)).toEqual([]);

      const persona = await createPerson(fixture, fixture.companyA, { firstNames: 'Gema', lastNames: 'Siete' });
      const conGente = await createOrder(fixture);
      await fixture.useCases.assign(actor, { orderId: conGente, userIds: [persona], workGroupIds: [] }, NOW);

      // El pedido se entrega DESPUES: la consulta sigue contestando lo mismo (R13), aunque las
      // tres escrituras ya no se admitan.
      for (const status of ['ENTREGADO', 'CANCELADO'] as const) {
        // El motivo es obligatorio en `CANCELADO` y prohibido fuera de el
        // (`orders_cancellation_reason_matches_status`, QC-34 R30): el pedido se deja como la
        // base exige, no como al test le venga bien.
        await fixture.tx.order.update({
          where: { id: conGente },
          data: { status, cancellationReason: status === 'CANCELADO' ? 'Prueba de T14' : null },
        });
        const responsables = await fixture.useCases.list(actor, conGente);
        expect(responsables.map((responsable) => responsable.userId)).toEqual([persona]);
      }
    });
  });

  it('R3: ver los responsables basta con `pedidos.consultar`, sin ningun permiso de asignaciones', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const orderId = await createOrder(fixture);
      const persona = await createPerson(fixture, fixture.companyA, { firstNames: 'Hugo', lastNames: 'Ocho' });
      await fixture.useCases.assign(
        actorOf(fixture.companyA),
        { orderId, userIds: [persona], workGroupIds: [] },
        NOW,
      );

      // El actor NO tiene `asignaciones.modificar` ni `asignaciones.consultar` —que sigue sin
      // estrenarse y es de QC-88 (`design.md > 0`, hallazgo 3)— y aun asi ve los avatares.
      const soloLector = actorOf(fixture.companyA, [CONSULTAR_PEDIDOS]);
      expect((await fixture.useCases.list(soloLector, orderId)).map((r) => r.userId)).toEqual([persona]);
    });
  });
});
