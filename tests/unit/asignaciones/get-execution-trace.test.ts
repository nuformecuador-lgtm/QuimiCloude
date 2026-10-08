// tests/unit/asignaciones/get-execution-trace.test.ts
//
// El recorrido de un pedido, con los puertos simulados: autorizacion primero, un solo error para
// los tres casos de «no hay recorrido» y los dados de baja que si lo abren.

import { describe, expect, it, vi } from 'vitest';

import { OrderNotFoundError, UnauthorizedError } from '@/lib/modules/asignaciones/domain/errors';
import { createGetExecutionTrace } from '@/lib/modules/asignaciones/domain/get-execution-trace';
import { createListExecutionTraces } from '@/lib/modules/asignaciones/domain/list-execution-traces';
import { PERMISSIONS, type PersonRef } from '@/lib/modules/identity';
import { ORDER_STATUS_VALUES, type OrderCatalog, type OrderHistorySummary } from '@/lib/modules/pedidos';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { ExecutionAction, ExecutionEntryRecord } from '@/lib/modules/asignaciones/domain/execution-entry';
import type { ExecutionLogRepository } from '@/lib/modules/asignaciones/ports/execution-log-repository';
import type { PeopleDirectory } from '@/lib/modules/identity';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ANA = uuid('1');
const BEA = uuid('2');
const PEDIDO = uuid('a');

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['dashboard.consultar'] };

const T0 = Date.parse('2026-10-01T08:00:00.000Z');
const MIN = 60_000;
const NOW = new Date(T0 + 48 * 60 * MIN);

let seq = 0;
function anotacion(action: ExecutionAction, offsetMin: number, userId = ANA, stepPosition: number | null = 1) {
  seq += 1;
  return {
    id: `e-${String(seq).padStart(4, '0')}`,
    orderId: PEDIDO,
    userId,
    action,
    stepPosition,
    reason: action === 'cancel' ? 'sin material' : null,
    occurredAt: new Date(T0 + offsetMin * MIN),
  } satisfies ExecutionEntryRecord;
}

const RECORRIDO: readonly ExecutionEntryRecord[] = [
  anotacion('start', 0, ANA, 1),
  anotacion('advance', 10, ANA, 2),
  anotacion('go_back', 15, BEA, 1),
  anotacion('cancel', 40, BEA, 1),
];

function resumen(overrides?: Partial<OrderHistorySummary>): OrderHistorySummary {
  return { id: PEDIDO, number: { year: 2026, sequence: 42 }, status: 'CANCELADO', deleted: false, ...overrides };
}

function montar(options?: {
  readonly order?: OrderHistorySummary | null;
  readonly entries?: readonly ExecutionEntryRecord[];
  readonly people?: readonly PersonRef[];
}) {
  const order = options?.order === undefined ? resumen() : options.order;
  const entries = options?.entries ?? RECORRIDO;

  const listEntriesForOrders = vi.fn(async (_companyId: string, ids: readonly string[]) =>
    entries.filter((entry) => ids.includes(entry.orderId)),
  );
  const listExecutedOrderIds = vi.fn(async () => (entries.length === 0 ? [] : [PEDIDO]));
  const listUserIdsWithEntries = vi.fn(async () => [ANA, BEA]);
  const append = vi.fn();
  const findLastStepPosition = vi.fn();
  const log: ExecutionLogRepository = {
    append,
    findLastStepPosition,
    listExecutedOrderIds,
    listEntriesForOrders,
    listUserIdsWithEntries,
  };

  const listSummariesByIdsIncludingDeleted = vi.fn(
    async (_companyId: string, _ids: readonly string[], _statuses: readonly string[], page: number, pageSize?: number) => {
      const items = order === null ? [] : [order];
      return { items, total: items.length, page, pageSize: pageSize ?? 10, totalPages: 1 };
    },
  );
  const orders = { listSummariesByIdsIncludingDeleted } as unknown as OrderCatalog;

  const directorio = options?.people ?? [
    { id: ANA, displayName: 'Ana Perez', isActive: true, permissions: [] },
    { id: BEA, displayName: 'Bea Gomez', isActive: false, permissions: [] },
  ];
  const findRefsIncludingDeletedInCompany = vi.fn(
    async (_companyId: string, ids: readonly string[]) => directorio.filter((ref) => ids.includes(ref.id)),
  );
  const people = { findRefsIncludingDeletedInCompany } as unknown as PeopleDirectory;

  const todos = [
    listEntriesForOrders,
    listExecutedOrderIds,
    listUserIdsWithEntries,
    append,
    findLastStepPosition,
    listSummariesByIdsIncludingDeleted,
    findRefsIncludingDeletedInCompany,
  ];
  return {
    abrir: createGetExecutionTrace({ log, orders, people }),
    listar: createListExecutionTraces({ log, orders, people }),
    listEntriesForOrders,
    listSummariesByIdsIncludingDeleted,
    findRefsIncludingDeletedInCompany,
    ningunPuertoLlamado: () => todos.every((fn) => fn.mock.calls.length === 0),
  };
}

describe('getExecutionTrace — autorizacion antes de todo', () => {
  const sinElPermiso = PERMISSIONS.map((p) => p.code).filter((code) => code !== 'dashboard.consultar');

  it.each([
    ['ausente (null)', null],
    ['ausente (undefined)', undefined],
    ['sin conjunto de permisos', { id: ANA, companyId: EMPRESA } as unknown as Actor],
    ['con el conjunto vacio', { id: ANA, companyId: EMPRESA, permissions: [] }],
    ['con todo el catalogo menos dashboard.consultar', { id: ANA, companyId: EMPRESA, permissions: sinElPermiso }],
  ])('R19: un actor %s se rechaza sin llamar a ningun puerto', async (_caso, actor) => {
    const m = montar();
    await expect(m.abrir(actor as Actor | null | undefined, { orderId: PEDIDO }, NOW)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(m.ningunPuertoLlamado()).toBe(true);
  });

  it('R19: con dashboard.consultar solo, el recorrido se lee', async () => {
    const m = montar();
    await expect(m.abrir(ACTOR, { orderId: PEDIDO }, NOW)).resolves.toBeDefined();
  });
});

describe('getExecutionTrace — sin recorrido, el mismo 404', () => {
  async function errorDe(promesa: Promise<unknown>): Promise<unknown> {
    try {
      await promesa;
    } catch (error) {
      return error;
    }
    throw new Error('se esperaba un error');
  }

  it('R18: id mal formado, pedido inexistente o de otra empresa y pedido sin anotaciones dan el mismo error', async () => {
    const malFormado = montar();
    const inexistente = montar({ order: null });
    const sinAnotaciones = montar({ entries: [] });

    const errores = [
      await errorDe(malFormado.abrir(ACTOR, { orderId: 'no-es-un-uuid' }, NOW)),
      await errorDe(inexistente.abrir(ACTOR, { orderId: PEDIDO }, NOW)),
      await errorDe(sinAnotaciones.abrir(ACTOR, { orderId: PEDIDO }, NOW)),
    ];
    for (const error of errores) {
      expect(error).toBeInstanceOf(OrderNotFoundError);
      expect((error as OrderNotFoundError).code).toBe('order_not_found');
      expect((error as Error).message).toBe((errores[0] as Error).message);
    }
    expect(malFormado.ningunPuertoLlamado()).toBe(true);
    expect(inexistente.listEntriesForOrders).not.toHaveBeenCalled();
  });

  it('R18: una entrada con claves de mas tambien es el mismo 404', async () => {
    const m = montar();
    await expect(m.abrir(ACTOR, { orderId: PEDIDO, companyId: uuid('7') }, NOW)).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    expect(m.ningunPuertoLlamado()).toBe(true);
  });

  it('R18: un pedido dado de baja con anotaciones no es 404, abre su recorrido marcado', async () => {
    const m = montar({ order: resumen({ status: 'EN_CURSO', deleted: true }) });
    const recorrido = await m.abrir(ACTOR, { orderId: PEDIDO }, NOW);
    expect(recorrido.deleted).toBe(true);
    expect(recorrido.steps).toHaveLength(RECORRIDO.length);
    expect(recorrido.duration.kind).not.toBe('open');
  });

  it('R12 R18: pide a pedidos el pedido en cualquier estado, incluidos los dados de baja', async () => {
    const m = montar();
    await m.abrir(ACTOR, { orderId: PEDIDO }, NOW);
    expect(m.listSummariesByIdsIncludingDeleted).toHaveBeenCalledWith(EMPRESA, [PEDIDO], ORDER_STATUS_VALUES, 1, 1);
  });
});

describe('getExecutionTrace — lo que muestra', () => {
  it('R13: las anotaciones en orden, con persona, posicion y motivo, y el numero y estado del pedido', async () => {
    const m = montar();
    const recorrido = await m.abrir(ACTOR, { orderId: PEDIDO }, NOW);

    expect(recorrido).toMatchObject({
      orderId: PEDIDO,
      numberText: '2026-0000042',
      status: 'CANCELADO',
      deleted: false,
      goBackCount: 1,
    });
    expect(
      recorrido.steps.map((step) => [step.action, step.userDisplayName, step.stepPosition, step.reason]),
    ).toEqual([
      ['start', 'Ana Perez', 1, null],
      ['advance', 'Ana Perez', 2, null],
      ['go_back', 'Bea Gomez', 1, null],
      ['cancel', 'Bea Gomez', 1, 'sin material'],
    ]);
    expect(recorrido.steps.map((step) => step.gapToNextMs)).toEqual([10 * MIN, 5 * MIN, 25 * MIN, null]);
    expect(recorrido.steps.map((step) => step.isGoBack)).toEqual([false, false, true, false]);
  });

  it('R13: una persona que el directorio ya no devuelve sale sin nombre, no rompe el recorrido', async () => {
    const m = montar({ people: [{ id: ANA, displayName: 'Ana Perez', isActive: true, permissions: [] }] });
    const recorrido = await m.abrir(ACTOR, { orderId: PEDIDO }, NOW);
    expect(recorrido.steps.map((step) => step.userDisplayName)).toEqual(['Ana Perez', 'Ana Perez', null, null]);
  });

  it('R15: la duracion del detalle es la misma cifra que la de la fila de la lista', async () => {
    for (const order of [
      resumen({ status: 'CANCELADO' }),
      resumen({ status: 'EN_CURSO' }),
      resumen({ status: 'EN_CURSO', deleted: true }),
    ]) {
      const m = montar({ order });
      const detalle = await m.abrir(ACTOR, { orderId: PEDIDO }, NOW);
      const { page } = await m.listar(ACTOR, {}, NOW);
      expect(detalle.duration).toEqual(page.items[0]!.duration);
      expect(detalle.goBackCount).toBe(page.items[0]!.goBackCount);
    }
  });

  it('R15: con la ultima anotacion de cierre y el pedido cancelado, la duracion es cerrada', async () => {
    const m = montar();
    const recorrido = await m.abrir(ACTOR, { orderId: PEDIDO }, NOW);
    expect(recorrido.duration).toEqual({ kind: 'closed', ms: 40 * MIN });
  });

  it('R23: todas las llamadas llevan la empresa del actor', async () => {
    const m = montar();
    await m.abrir(ACTOR, { orderId: PEDIDO }, NOW);
    expect(m.listSummariesByIdsIncludingDeleted.mock.calls[0]![0]).toBe(EMPRESA);
    expect(m.listEntriesForOrders).toHaveBeenCalledWith(EMPRESA, [PEDIDO]);
    expect(m.findRefsIncludingDeletedInCompany).toHaveBeenCalledWith(EMPRESA, [ANA, BEA], NOW);
  });
});
