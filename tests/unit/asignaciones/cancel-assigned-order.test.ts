// tests/unit/asignaciones/cancel-assigned-order.test.ts
import { describe, expect, it, vi } from 'vitest';

import {
  createCancelAssignedOrder,
  type CancelAssignedOrderDeps,
} from '@/lib/modules/asignaciones/domain/cancel-assigned-order';
import {
  NotCancellableError,
  OrderNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/asignaciones/domain/errors';
import { cancelOrderSchema } from '@/lib/modules/pedidos';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { NewExecutionEntry } from '@/lib/modules/asignaciones/domain/execution-entry';
import type { ExecutionLogRepository } from '@/lib/modules/asignaciones/ports/execution-log-repository';
import type {
  ExecutionTransaction,
  ExecutionWriters,
} from '@/lib/modules/asignaciones/ports/execution-transaction';
import type { OrderAssignmentRepository } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type { PermissionCode } from '@/lib/modules/identity';
import type { OrderCatalog, OrderStatus } from '@/lib/modules/pedidos';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const OTRA_EMPRESA = uuid('9');
const ANA = uuid('1');
const BETO = uuid('2');
const PEDIDO = uuid('7');
const OTRO_PEDIDO = uuid('8');
const AHORA = new Date('2026-10-06T12:00:00.000Z');
const NUMERO_PEDIDO = { year: 2026, sequence: 7 };

const ACTOR: Actor = {
  id: ANA,
  companyId: EMPRESA,
  permissions: ['asignaciones.consultar', 'asignaciones.ejecutar'],
};

const PERMISOS_EMPACADOR: readonly PermissionCode[] = [
  'asignaciones.consultar',
  'terminados.consultar',
  'empaque.modificar',
];

type CancelOutcome = 'ok' | 'not_found' | 'not_cancellable';

function montar(options?: {
  readonly status?: OrderStatus | null;
  readonly ids?: readonly string[];
  readonly outcome?: CancelOutcome;
  readonly appendFalla?: Error;
}) {
  const eventos: string[] = [];
  const listOrderIdsByUserInCompany = vi.fn(async () => options?.ids ?? [PEDIDO]);
  const status = options?.status === undefined ? 'EN_CURSO' : options.status;
  const findAliveById = vi.fn(async () => {
    eventos.push('findAliveById');
    return status === null ? null : { id: PEDIDO, status };
  });
  const listAliveSummariesByIds = vi.fn(async () => {
    eventos.push('listAliveSummariesByIds');
    return {
      items: [{ id: PEDIDO, number: NUMERO_PEDIDO, recipeId: 'receta-1', quantity: '10.0000', priority: 'MEDIA', status }],
      total: 1,
      page: 1,
      pageSize: 1,
      totalPages: 1,
    };
  });
  const cancelAliveById = vi.fn<ExecutionWriters['orders']['cancelAliveById']>(async () => {
    eventos.push('cancelAliveById');
    return options?.outcome ?? 'ok';
  });
  const append = vi.fn<ExecutionLogRepository['append']>(async () => {
    eventos.push('append');
    if (options?.appendFalla) throw options.appendFalla;
  });
  const transitionAliveById = vi.fn();
  const runRejections: unknown[] = [];
  const writers = {
    orders: { cancelAliveById, transitionAliveById },
    packing: { startPackingAliveById: vi.fn(), finishPackingAliveById: vi.fn() },
    log: { append, findLastStepPosition: vi.fn() },
  } as unknown as ExecutionWriters;
  const run = vi.fn(async <T,>(work: (w: ExecutionWriters) => Promise<T>): Promise<T> => {
    eventos.push('run:open');
    try {
      const value = await work(writers);
      eventos.push('run:commit');
      return value;
    } catch (error) {
      eventos.push('run:rollback');
      runRejections.push(error);
      throw error;
    }
  });

  const deps: CancelAssignedOrderDeps = {
    assignments: { listOrderIdsByUserInCompany } as unknown as OrderAssignmentRepository,
    orders: { findAliveById, listAliveSummariesByIds } as unknown as OrderCatalog,
    transaction: { run } as ExecutionTransaction,
    now: () => AHORA,
  };
  return {
    deps,
    eventos,
    runRejections,
    listOrderIdsByUserInCompany,
    findAliveById,
    listAliveSummariesByIds,
    cancelAliveById,
    append,
    run,
  };
}

function ningunDobleLlamado(d: ReturnType<typeof montar>): void {
  expect(d.listOrderIdsByUserInCompany).not.toHaveBeenCalled();
  expect(d.findAliveById).not.toHaveBeenCalled();
  expect(d.listAliveSummariesByIds).not.toHaveBeenCalled();
  expect(d.run).not.toHaveBeenCalled();
  expect(d.cancelAliveById).not.toHaveBeenCalled();
  expect(d.append).not.toHaveBeenCalled();
}

const ENTRADA = { orderId: PEDIDO, stepPosition: 2, reason: 'Se derramo el lote' } as const;

describe('cancelAssignedOrder — prologo (R26, R27, R28)', () => {
  it('R26: sin actor o sin permisos rechaza sin llamar a ningun doble', async () => {
    for (const actor of [null, undefined, { id: ANA, companyId: EMPRESA, permissions: [] }]) {
      const d = montar();
      await expect(createCancelAssignedOrder(d.deps)(actor, ENTRADA)).rejects.toThrow(UnauthorizedError);
      ningunDobleLlamado(d);
    }
  });

  it('R26: `asignaciones.consultar` solo NO basta', async () => {
    const d = montar();
    await expect(
      createCancelAssignedOrder(d.deps)(
        { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.consultar'] },
        ENTRADA,
      ),
    ).rejects.toThrow(UnauthorizedError);
    ningunDobleLlamado(d);
  });

  // Nota del 2026-10-06: el caso del 2026-09-26 «tambien con los permisos del Empacador» se
  // invierte. QC-201 dejo al Empacador sin `asignaciones.ejecutar`, que es lo que exige cancelar.
  it('R26, R27: un actor con exactamente los permisos del Empacador es rechazado sin llamar a ningun doble', async () => {
    const d = montar();
    await expect(
      createCancelAssignedOrder(d.deps)({ id: ANA, companyId: EMPRESA, permissions: PERMISOS_EMPACADOR }, ENTRADA),
    ).rejects.toThrow(UnauthorizedError);
    ningunDobleLlamado(d);
  });

  it('R27: no asignado, otra empresa e inexistente dan la misma respuesta, sin abrir la transaccion', async () => {
    for (const [d, actor] of [
      [montar({ ids: [OTRO_PEDIDO] }), ACTOR],
      [montar({ status: null }), ACTOR],
      [montar({ ids: [] }), { ...ACTOR, companyId: OTRA_EMPRESA }],
    ] as const) {
      const error = await createCancelAssignedOrder(d.deps)(actor, ENTRADA).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(OrderNotFoundError);
      expect((error as OrderNotFoundError).code).toBe('order_not_found');
      expect(d.run).not.toHaveBeenCalled();
      expect(d.cancelAliveById).not.toHaveBeenCalled();
      expect(d.append).not.toHaveBeenCalled();
    }
  });

  it('R27: lo cancela un responsable asignado que no lo arranco', async () => {
    const d = montar();
    const beto: Actor = { id: BETO, companyId: EMPRESA, permissions: ['asignaciones.ejecutar'] };
    await createCancelAssignedOrder(d.deps)(beto, ENTRADA);
    expect(d.listOrderIdsByUserInCompany).toHaveBeenCalledWith(EMPRESA, BETO);
    expect(d.cancelAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA, ENTRADA.reason, BETO, AHORA);
    expect(d.append.mock.calls[0]?.[0]).toMatchObject({ userId: BETO });
  });

  it('R28: la empresa sale del actor, nunca de la entrada', async () => {
    const d = montar();
    await createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA);
    expect(d.listOrderIdsByUserInCompany).toHaveBeenCalledWith(EMPRESA, ANA);
    expect(d.findAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA);
    expect(d.cancelAliveById.mock.calls[0]?.[1]).toBe(EMPRESA);
    expect(d.append.mock.calls[0]?.[0]).toMatchObject({ companyId: EMPRESA });
  });

  it('R28: el esquema estricto rechaza un `companyId` en la entrada, sin tocar ningun puerto', async () => {
    const d = montar();
    await expect(
      createCancelAssignedOrder(d.deps)(ACTOR, { ...ENTRADA, companyId: OTRA_EMPRESA }),
    ).rejects.toThrow(ValidationError);
    ningunDobleLlamado(d);
  });

  it('R30: no necesita `pedidos.modificar` ni `asignaciones.modificar`', async () => {
    const d = montar();
    const actor: Actor = { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.ejecutar'] };
    await expect(createCancelAssignedOrder(d.deps)(actor, ENTRADA)).resolves.toEqual({
      numberText: expect.any(String),
    });
    expect(d.cancelAliveById).toHaveBeenCalledTimes(1);
  });
});

describe('cancelAssignedOrder — el motivo (R9, R10)', () => {
  it.each([
    ['ausente', { orderId: PEDIDO, stepPosition: 2 }],
    ['vacio', { ...ENTRADA, reason: '' }],
    ['solo espacios', { ...ENTRADA, reason: '   \t  ' }],
    ['no texto', { ...ENTRADA, reason: 42 }],
  ])('R9: motivo %s es invalid_input sin abrir la transaccion', async (_caso, entrada) => {
    const d = montar();
    const error = await createCancelAssignedOrder(d.deps)(ACTOR, entrada).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe('invalid_input');
    ningunDobleLlamado(d);
  });

  it('R10: el tope es el mismo que `cancelOrderSchema`: 500 entra, 501 no', async () => {
    const quinientos = 'a'.repeat(500);
    const quinientosUno = 'a'.repeat(501);
    expect(cancelOrderSchema.safeParse({ reason: quinientos }).success).toBe(true);
    expect(cancelOrderSchema.safeParse({ reason: quinientosUno }).success).toBe(false);

    const ok = montar();
    await createCancelAssignedOrder(ok.deps)(ACTOR, { ...ENTRADA, reason: quinientos });
    expect(ok.cancelAliveById).toHaveBeenCalledTimes(1);

    const largo = montar();
    await expect(
      createCancelAssignedOrder(largo.deps)(ACTOR, { ...ENTRADA, reason: quinientosUno }),
    ).rejects.toThrow(ValidationError);
    ningunDobleLlamado(largo);
  });

  it('R9, R22: el motivo se normaliza igual que `cancelOrderSchema` y ese mismo llega a los dos', async () => {
    const d = montar();
    await createCancelAssignedOrder(d.deps)(ACTOR, { ...ENTRADA, reason: '  Se derramo  ' });
    expect(d.cancelAliveById.mock.calls[0]?.[2]).toBe('Se derramo');
    expect(d.append.mock.calls[0]?.[0]).toMatchObject({ reason: 'Se derramo' });
  });

  it('stepPosition invalida es invalid_input sin tocar ningun puerto', async () => {
    for (const stepPosition of [0, 1.5, '2', undefined]) {
      const d = montar();
      await expect(
        createCancelAssignedOrder(d.deps)(ACTOR, { ...ENTRADA, stepPosition }),
      ).rejects.toThrow(ValidationError);
      ningunDobleLlamado(d);
    }
  });
});

describe('cancelAssignedOrder — la escritura (R22, R23, R24, R29)', () => {
  it("R22, R23: 'ok' anota una vez `cancel` con el MISMO motivo y el MISMO instante que la cancelacion", async () => {
    const d = montar();
    const result = await createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA);

    expect(result).toEqual({ numberText: expect.stringContaining('7') });
    expect(d.cancelAliveById).toHaveBeenCalledTimes(1);
    expect(d.cancelAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA, ENTRADA.reason, ANA, AHORA);
    expect(d.append).toHaveBeenCalledTimes(1);
    expect(d.append).toHaveBeenCalledWith({
      action: 'cancel',
      companyId: EMPRESA,
      orderId: PEDIDO,
      userId: ANA,
      stepPosition: 2,
      reason: ENTRADA.reason,
      occurredAt: AHORA,
    });
    const [, , motivoCancelado, , instanteCancelado] = d.cancelAliveById.mock.calls[0] as unknown as [
      string,
      string,
      string,
      string,
      Date,
    ];
    const anotacion = d.append.mock.calls[0]?.[0] as Extract<NewExecutionEntry, { action: 'cancel' }>;
    expect(anotacion.reason).toBe(motivoCancelado);
    expect(anotacion.occurredAt).toBe(instanteCancelado);
  });

  it('R22, R24: la cancelacion y la anotacion van dentro de la MISMA transaccion, con el numero leido antes', async () => {
    const d = montar();
    await createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA);
    expect(d.run).toHaveBeenCalledTimes(1);
    expect(d.eventos).toEqual([
      'findAliveById',
      'listAliveSummariesByIds',
      'run:open',
      'cancelAliveById',
      'append',
      'run:commit',
    ]);
  });

  it('R25: devuelve el numero visible del pedido, leido con el estado que tenia', async () => {
    const d = montar({ status: 'BLOQUEADO' });
    const result = await createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA);
    expect(d.listAliveSummariesByIds).toHaveBeenCalledWith(EMPRESA, [PEDIDO], ['BLOQUEADO'], 1, 1);
    expect(result.numberText).toMatch(/7/);
  });

  it("R29: 'not_cancellable' es NotCancellableError, sin anotar, y sale desde DENTRO de run", async () => {
    const d = montar({ status: 'POR_EMPACAR', outcome: 'not_cancellable' });
    const error = await createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotCancellableError);
    expect((error as NotCancellableError).code).toBe('not_cancellable');
    expect(d.append).not.toHaveBeenCalled();
    expect(d.eventos).toContain('run:rollback');
    expect(d.eventos).not.toContain('run:commit');
    expect(d.runRejections).toHaveLength(1);
  });

  it.each(['POR_EMPACAR', 'EN_EMPAQUE', 'ENTREGADO', 'CANCELADO'] as const)(
    'R29: %s lo decide `pedidos` bajo el candado: se pide la cancelacion y su not_cancellable se traduce',
    async (status) => {
      const d = montar({ status, outcome: 'not_cancellable' });
      await expect(createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA)).rejects.toThrow(NotCancellableError);
      expect(d.cancelAliveById).toHaveBeenCalledTimes(1);
      expect(d.append).not.toHaveBeenCalled();
    },
  );

  it("R29: 'not_found' es OrderNotFoundError, sin anotar, y sale desde dentro de run", async () => {
    const d = montar({ outcome: 'not_found' });
    await expect(createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA)).rejects.toThrow(OrderNotFoundError);
    expect(d.append).not.toHaveBeenCalled();
    expect(d.eventos).toContain('run:rollback');
    expect(d.runRejections).toHaveLength(1);
  });

  it('R24: si `append` lanza, el error se propaga tal cual desde dentro de run y no se confirma nada', async () => {
    const fallo = new Error('registro caido');
    const d = montar({ appendFalla: fallo });
    await expect(createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA)).rejects.toBe(fallo);
    expect(d.cancelAliveById).toHaveBeenCalledTimes(1);
    expect(d.runRejections).toEqual([fallo]);
    expect(d.eventos).not.toContain('run:commit');
  });

  it("R29: un BLOQUEADO cancela por 'ok' y se anota", async () => {
    const d = montar({ status: 'BLOQUEADO', outcome: 'ok' });
    await createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA);
    expect(d.cancelAliveById).toHaveBeenCalledTimes(1);
    expect(d.append).toHaveBeenCalledTimes(1);
    expect(d.append.mock.calls[0]?.[0]).toMatchObject({ action: 'cancel', reason: ENTRADA.reason });
  });

  it('R5: con una receta sin pasos la posicion `null` se anota tal cual', async () => {
    const d = montar();
    await createCancelAssignedOrder(d.deps)(ACTOR, { ...ENTRADA, stepPosition: null });
    expect(d.append.mock.calls[0]?.[0]).toMatchObject({ stepPosition: null });
  });
});

const RESUMEN_VACIO = { items: [], total: 0, page: 1, pageSize: 1, totalPages: 0 };

/**
 * El pedido se lee con `inicial` y el resumen filtrado por ese estado sale vacio: otro lo movio
 * entre las dos lecturas. La relectura devuelve `releido` (o nada si es `null`).
 */
function conCarreraEntreLecturas(inicial: OrderStatus, releido: OrderStatus | null, outcome?: CancelOutcome) {
  const d = montar({ status: inicial, ...(outcome === undefined ? {} : { outcome }) });
  d.findAliveById
    .mockImplementationOnce(async () => ({ id: PEDIDO, status: inicial }))
    .mockImplementationOnce(async () => (releido === null ? null : { id: PEDIDO, status: releido }));
  d.listAliveSummariesByIds.mockResolvedValueOnce(RESUMEN_VACIO as never);
  return d;
}

// Nota 2026-10-06: revision vuelta 1, hallazgo 7. Misma ventana que la carrera de R16 en
// startAssignedOrder: el resumen se filtra por el estado leido justo antes.
describe('cancelAssignedOrder — el pedido cambia de estado entre las dos lecturas (R27, R29)', () => {
  it('R29: lo Finalizan en medio (EN_CURSO -> POR_EMPACAR) => not_cancellable de `pedidos`, sin anotar', async () => {
    const d = conCarreraEntreLecturas('EN_CURSO', 'POR_EMPACAR', 'not_cancellable');

    await expect(createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA)).rejects.toBeInstanceOf(NotCancellableError);
    expect(d.findAliveById).toHaveBeenCalledTimes(2);
    expect(d.listAliveSummariesByIds).toHaveBeenCalledTimes(2);
    expect(d.listAliveSummariesByIds).toHaveBeenLastCalledWith(EMPRESA, [PEDIDO], ['POR_EMPACAR'], 1, 1);
    expect(d.cancelAliveById).toHaveBeenCalledTimes(1);
    expect(d.append).not.toHaveBeenCalled();
    expect(d.eventos).not.toContain('run:commit');
  });

  it('R29: si el estado nuevo es BLOQUEADO, `pedidos` lo cancela y se anota (asignaciones no decide)', async () => {
    const d = conCarreraEntreLecturas('EN_CURSO', 'BLOQUEADO', 'ok');

    const result = await createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA);
    expect(result.numberText).toMatch(/7/);
    expect(d.cancelAliveById).toHaveBeenCalledTimes(1);
    expect(d.append).toHaveBeenCalledTimes(1);
  });

  it('R27: si al releer el pedido ya no existe, sigue siendo not_found y no se abre la transaccion', async () => {
    const d = conCarreraEntreLecturas('EN_CURSO', null);

    await expect(createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA)).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(d.findAliveById).toHaveBeenCalledTimes(2);
    expect(d.listAliveSummariesByIds).toHaveBeenCalledTimes(1);
    expect(d.run).not.toHaveBeenCalled();
  });

  it('R27: si al releer el estado no cambio, sigue siendo not_found y no se abre la transaccion', async () => {
    const d = conCarreraEntreLecturas('EN_CURSO', 'EN_CURSO');

    await expect(createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA)).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(d.listAliveSummariesByIds).toHaveBeenCalledTimes(1);
    expect(d.run).not.toHaveBeenCalled();
  });

  it('R27: si al releer ya no esta asignado al actor, sigue siendo not_found y no se abre la transaccion', async () => {
    const d = conCarreraEntreLecturas('EN_CURSO', 'POR_EMPACAR', 'not_cancellable');
    d.listOrderIdsByUserInCompany.mockResolvedValueOnce([PEDIDO]).mockResolvedValueOnce([]);

    await expect(createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA)).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(d.listOrderIdsByUserInCompany).toHaveBeenCalledTimes(2);
    expect(d.listAliveSummariesByIds).toHaveBeenCalledTimes(1);
    expect(d.run).not.toHaveBeenCalled();
  });

  it('R27: el reintento es uno solo: si el segundo resumen tambien falta, not_found sin abrir la transaccion', async () => {
    const d = conCarreraEntreLecturas('EN_CURSO', 'POR_EMPACAR', 'not_cancellable');
    d.listAliveSummariesByIds.mockResolvedValueOnce(RESUMEN_VACIO as never);

    await expect(createCancelAssignedOrder(d.deps)(ACTOR, ENTRADA)).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(d.findAliveById).toHaveBeenCalledTimes(2);
    expect(d.listAliveSummariesByIds).toHaveBeenCalledTimes(2);
    expect(d.run).not.toHaveBeenCalled();
  });
});
