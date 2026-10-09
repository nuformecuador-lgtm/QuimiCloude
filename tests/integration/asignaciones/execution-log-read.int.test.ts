// tests/integration/asignaciones/execution-log-read.int.test.ts
/**
 * QC-167 (T4b) — Las tres lecturas del registro de ejecucion contra Postgres real.
 *
 * Que se mide: los tres metodos filtran por la empresa que reciben (R23), el filtro de persona (R7)
 * y el de rango con `gte` inclusivo y `lt` exclusivo (R8) estan en la consulta, y
 * `listEntriesForOrders` ordena por pedido y luego por instante e `id` (R14 lo consume).
 *
 * La empresa ajena. Con las FK compuestas de `order_execution_entries` (QC-82 R7) una anotacion de
 * la empresa B no puede llevar ni la persona ni el pedido de la A: la base la rechaza. Asi que «una
 * anotacion de otra empresa con la misma persona o el mismo pedido» no puede existir; lo que se
 * comprueba es lo equivalente: la empresa B tiene anotaciones propias, y pedir con la empresa B el
 * pedido o la persona de la A no devuelve nada (y al reves). Quitar `companyId` de cualquiera de
 * los tres `where` hace caer esos casos.
 *
 * AISLAMIENTO: `transaccion` (cabecera de `./use-case-fixture.ts` y el censo). El adaptador es una
 * fabrica y se construye sobre la `tx` del caso.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { createExecutionLogRepository } from '@/lib/modules/asignaciones/adapters/driven/persistence/execution-log-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import { createOrder, createPerson, inRolledBackTransaction, type Fixture } from './use-case-fixture';

import type { ExecutionLogRepository } from '@/lib/modules/asignaciones/ports/execution-log-repository';

const DAY = 24 * 60 * 60 * 1000;
const D1 = new Date('2026-09-01T00:00:00.000Z');
const D2 = new Date(D1.getTime() + DAY);
const D3 = new Date(D1.getTime() + 2 * DAY);

type Escena = {
  readonly log: ExecutionLogRepository;
  readonly ana: string;
  readonly luis: string;
  readonly ajena: string;
  readonly pedidoA1: string;
  readonly pedidoA2: string;
  readonly pedidoB: string;
};

/**
 * Empresa A: pedido A1 lo empieza Ana el dia 1 y lo avanza Luis el dia 2; pedido A2 solo lo toca
 * Luis, el dia 3 exacto a las 00:00. Empresa B: su propia persona anota en su propio pedido el dia 1.
 */
async function montarEscena(fixture: Fixture): Promise<Escena> {
  const log = createExecutionLogRepository(fixture.tx);
  const ana = await createPerson(fixture, fixture.companyA, { lastNames: 'Alba' });
  const luis = await createPerson(fixture, fixture.companyA, { lastNames: 'Luna' });
  const ajena = await createPerson(fixture, fixture.companyB, { lastNames: 'Bravo' });
  const pedidoA1 = await createOrder(fixture, { status: 'EN_CURSO' });
  const pedidoA2 = await createOrder(fixture, { status: 'EN_CURSO' });
  const pedidoB = await createOrder(fixture, { companyId: fixture.companyB, status: 'EN_CURSO' });

  const a = fixture.companyA;
  await log.append({ companyId: a, orderId: pedidoA1, userId: ana, action: 'start', stepPosition: 1, occurredAt: D1 });
  await log.append({
    companyId: a,
    orderId: pedidoA1,
    userId: luis,
    action: 'advance',
    stepPosition: 2,
    occurredAt: new Date(D2.getTime() + 60_000),
  });
  await log.append({ companyId: a, orderId: pedidoA2, userId: luis, action: 'start', stepPosition: 1, occurredAt: D3 });
  await log.append({
    companyId: fixture.companyB,
    orderId: pedidoB,
    userId: ajena,
    action: 'start',
    stepPosition: 1,
    occurredAt: D1,
  });
  return { log, ana, luis, ajena, pedidoA1, pedidoA2, pedidoB };
}

const ordenados = (ids: readonly string[]) => [...ids].sort();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('listExecutedOrderIds', () => {
  it('R23: sin filtro devuelve solo los pedidos de la empresa pedida, sin repetir', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const e = await montarEscena(fixture);
      expect(ordenados(await e.log.listExecutedOrderIds(fixture.companyA, {}))).toEqual(
        ordenados([e.pedidoA1, e.pedidoA2]),
      );
      expect(await e.log.listExecutedOrderIds(fixture.companyB, {})).toEqual([e.pedidoB]);
    });
  });

  it('R7: el filtro de persona deja solo los pedidos con alguna anotacion suya', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const e = await montarEscena(fixture);
      expect(await e.log.listExecutedOrderIds(fixture.companyA, { userId: e.ana })).toEqual([e.pedidoA1]);
      expect(ordenados(await e.log.listExecutedOrderIds(fixture.companyA, { userId: e.luis }))).toEqual(
        ordenados([e.pedidoA1, e.pedidoA2]),
      );
    });
  });

  it('R23: la persona de otra empresa con la empresa propia no devuelve nada, ni al reves', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const e = await montarEscena(fixture);
      expect(await e.log.listExecutedOrderIds(fixture.companyA, { userId: e.ajena })).toEqual([]);
      expect(await e.log.listExecutedOrderIds(fixture.companyB, { userId: e.ana })).toEqual([]);
    });
  });

  it('R8: el rango es gte inclusivo y lt exclusivo', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const e = await montarEscena(fixture);
      // [D1, D2): solo la anotacion de Ana del dia 1.
      expect(await e.log.listExecutedOrderIds(fixture.companyA, { occurredFrom: D1, occurredBefore: D2 })).toEqual([
        e.pedidoA1,
      ]);
      // [D2, D3): la de Luis del dia 2; la de D3 exacto queda fuera por `lt`.
      expect(await e.log.listExecutedOrderIds(fixture.companyA, { occurredFrom: D2, occurredBefore: D3 })).toEqual([
        e.pedidoA1,
      ]);
      // [D3, ...): D3 exacto entra por `gte`.
      expect(await e.log.listExecutedOrderIds(fixture.companyA, { occurredFrom: D3 })).toEqual([e.pedidoA2]);
    });
  });

  it('R8: un extremo ausente no acota por ese lado', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const e = await montarEscena(fixture);
      expect(await e.log.listExecutedOrderIds(fixture.companyA, { occurredBefore: D2 })).toEqual([e.pedidoA1]);
      expect(ordenados(await e.log.listExecutedOrderIds(fixture.companyA, { occurredFrom: D1 }))).toEqual(
        ordenados([e.pedidoA1, e.pedidoA2]),
      );
    });
  });

  it('R7 / R8: persona y rango se combinan', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const e = await montarEscena(fixture);
      expect(
        await e.log.listExecutedOrderIds(fixture.companyA, { userId: e.luis, occurredFrom: D1, occurredBefore: D2 }),
      ).toEqual([]);
      expect(await e.log.listExecutedOrderIds(fixture.companyA, { userId: e.luis, occurredFrom: D3 })).toEqual([
        e.pedidoA2,
      ]);
    });
  });
});

describe('listEntriesForOrders', () => {
  it('R14: devuelve las anotaciones ordenadas por pedido, instante e id, con la accion del dominio', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const e = await montarEscena(fixture);
      // Dos anotaciones en el mismo instante: desempata el `id`.
      await e.log.append({
        companyId: fixture.companyA,
        orderId: e.pedidoA2,
        userId: e.luis,
        action: 'cancel',
        stepPosition: 1,
        reason: 'sin material',
        occurredAt: D3,
      });

      const entries = await e.log.listEntriesForOrders(fixture.companyA, [e.pedidoA2, e.pedidoA1]);

      const orden = [...entries].sort(
        (x, y) =>
          x.orderId.localeCompare(y.orderId) ||
          x.occurredAt.getTime() - y.occurredAt.getTime() ||
          x.id.localeCompare(y.id),
      );
      expect(entries.map((x) => x.id)).toEqual(orden.map((x) => x.id));
      expect(entries).toHaveLength(4);

      const deA1 = entries.filter((x) => x.orderId === e.pedidoA1);
      expect(deA1.map((x) => [x.userId, x.action, x.stepPosition, x.reason])).toEqual([
        [e.ana, 'start', 1, null],
        [e.luis, 'advance', 2, null],
      ]);
      const deA2 = entries.filter((x) => x.orderId === e.pedidoA2);
      expect(deA2.map((x) => x.action).sort()).toEqual(['cancel', 'start']);
      expect(deA2.find((x) => x.action === 'cancel')?.reason).toBe('sin material');
      expect(deA1[0]?.occurredAt).toEqual(D1);
    });
  });

  it('R23: el pedido de otra empresa no vuelve aunque su id venga en la lista', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const e = await montarEscena(fixture);
      const entries = await e.log.listEntriesForOrders(fixture.companyA, [e.pedidoA1, e.pedidoB]);
      expect(new Set(entries.map((x) => x.orderId))).toEqual(new Set([e.pedidoA1]));
      expect(await e.log.listEntriesForOrders(fixture.companyB, [e.pedidoA1, e.pedidoA2])).toEqual([]);
    });
  });
});

describe('listUserIdsWithEntries', () => {
  it('R7: las personas con alguna anotacion en la empresa, sin repetir, incluida una dada de baja', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const e = await montarEscena(fixture);
      await fixture.tx.user.update({ where: { id: e.ana }, data: { deletedAt: D3, accountStatus: 'inactive' } });
      // Una persona de la empresa sin anotaciones no sale.
      await createPerson(fixture, fixture.companyA, { lastNames: 'Sin Anotar' });

      expect(ordenados(await e.log.listUserIdsWithEntries(fixture.companyA))).toEqual(ordenados([e.ana, e.luis]));
    });
  });

  it('R23: las personas de otra empresa no salen', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const e = await montarEscena(fixture);
      expect(await e.log.listUserIdsWithEntries(fixture.companyA)).not.toContain(e.ajena);
      expect(await e.log.listUserIdsWithEntries(fixture.companyB)).toEqual([e.ajena]);
    });
  });
});
