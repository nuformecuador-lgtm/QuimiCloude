// tests/unit/asignaciones/record-step-move.test.ts
import { describe, expect, it, vi } from 'vitest';

import {
  createRecordStepMove,
  type RecordStepMoveDeps,
} from '@/lib/modules/asignaciones/domain/record-step-move';
import {
  AsignacionesError,
  OrderBlockedError,
  OrderNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { ExecutionLogRepository } from '@/lib/modules/asignaciones/ports/execution-log-repository';
import type { OrderAssignmentRepository } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type { PermissionCode } from '@/lib/modules/identity';
import type { OrderCatalog, OrderStatus } from '@/lib/modules/pedidos';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const OTRA_EMPRESA = uuid('9');
const ANA = uuid('1');
const PEDIDO = uuid('7');
const OTRO_PEDIDO = uuid('8');
const AHORA = new Date('2026-10-06T12:00:00.000Z');

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

function montar(options?: {
  readonly status?: OrderStatus | null;
  readonly ids?: readonly string[];
  readonly appendFalla?: Error;
}) {
  const listOrderIdsByUserInCompany = vi.fn(async () => options?.ids ?? [PEDIDO]);
  const status = options?.status === undefined ? 'EN_CURSO' : options.status;
  const findAliveById = vi.fn(async () => (status === null ? null : { id: PEDIDO, status }));
  const append = vi.fn<ExecutionLogRepository['append']>(async () => {
    if (options?.appendFalla) throw options.appendFalla;
  });
  const findLastStepPosition = vi.fn(async () => null);

  const deps: RecordStepMoveDeps = {
    assignments: { listOrderIdsByUserInCompany } as unknown as OrderAssignmentRepository,
    orders: { findAliveById } as unknown as OrderCatalog,
    log: {
      append,
      findLastStepPosition,
      listExecutedOrderIds: vi.fn(async () => []),
      listEntriesForOrders: vi.fn(async () => []),
      listUserIdsWithEntries: vi.fn(async () => []),
    } satisfies ExecutionLogRepository,
    now: () => AHORA,
  };
  return { deps, listOrderIdsByUserInCompany, findAliveById, append, findLastStepPosition };
}

function ningunDobleLlamado(d: ReturnType<typeof montar>): void {
  expect(d.listOrderIdsByUserInCompany).not.toHaveBeenCalled();
  expect(d.findAliveById).not.toHaveBeenCalled();
  expect(d.append).not.toHaveBeenCalled();
  expect(d.findLastStepPosition).not.toHaveBeenCalled();
}

const ENTRADA = { orderId: PEDIDO, direction: 'advance', stepPosition: 3 } as const;

describe('recordStepMove — prologo', () => {
  it('R26: sin actor o sin permisos rechaza sin llamar a ningun doble', async () => {
    for (const actor of [null, undefined, { id: ANA, companyId: EMPRESA, permissions: [] }]) {
      const d = montar();
      await expect(createRecordStepMove(d.deps)(actor, ENTRADA)).rejects.toThrow(UnauthorizedError);
      ningunDobleLlamado(d);
    }
  });

  it('R26: `asignaciones.consultar` solo NO basta', async () => {
    const d = montar();
    await expect(
      createRecordStepMove(d.deps)(
        { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.consultar'] },
        ENTRADA,
      ),
    ).rejects.toThrow(UnauthorizedError);
    ningunDobleLlamado(d);
  });

  it('R26, R27: un actor con exactamente los permisos del Empacador es rechazado sin llamar a ningun doble', async () => {
    const d = montar();
    await expect(
      createRecordStepMove(d.deps)({ id: ANA, companyId: EMPRESA, permissions: PERMISOS_EMPACADOR }, ENTRADA),
    ).rejects.toThrow(UnauthorizedError);
    ningunDobleLlamado(d);
  });

  it('R26: con `asignaciones.ejecutar` solo, sin `consultar`, anota', async () => {
    const d = montar();
    await createRecordStepMove(d.deps)(
      { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.ejecutar'] },
      ENTRADA,
    );
    expect(d.append).toHaveBeenCalledTimes(1);
  });

  it('R27: no asignado, otra empresa e inexistente dan la misma respuesta, sin escribir', async () => {
    const noAsignado = montar({ ids: [OTRO_PEDIDO] });
    const inexistente = montar({ status: null });
    const otraEmpresa = montar({ ids: [] });
    const errores: unknown[] = [];
    for (const [d, actor] of [
      [noAsignado, ACTOR],
      [inexistente, ACTOR],
      [otraEmpresa, { ...ACTOR, companyId: OTRA_EMPRESA }],
    ] as const) {
      const error = await createRecordStepMove(d.deps)(actor, ENTRADA).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(OrderNotFoundError);
      errores.push((error as AsignacionesError).code);
      expect(d.append).not.toHaveBeenCalled();
    }
    expect(new Set(errores)).toEqual(new Set(['order_not_found']));
    expect(noAsignado.findAliveById).not.toHaveBeenCalled();
  });

  it('R28: la empresa sale del actor, nunca de la entrada', async () => {
    const d = montar();
    await createRecordStepMove(d.deps)(ACTOR, ENTRADA);
    expect(d.listOrderIdsByUserInCompany).toHaveBeenCalledWith(EMPRESA, ANA);
    expect(d.findAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA);
    expect(d.append.mock.calls[0]?.[0]).toMatchObject({ companyId: EMPRESA, userId: ANA });
  });

  it('R28: el esquema estricto rechaza un `companyId` en la entrada, sin tocar ningun puerto', async () => {
    const d = montar();
    await expect(
      createRecordStepMove(d.deps)(ACTOR, { ...ENTRADA, companyId: OTRA_EMPRESA }),
    ).rejects.toThrow(ValidationError);
    ningunDobleLlamado(d);
  });

  it('R17, R18: entrada invalida -direccion desconocida, posicion 0, decimal o ausente- es invalid_input', async () => {
    for (const entrada of [
      { ...ENTRADA, direction: 'finish' },
      { ...ENTRADA, stepPosition: 0 },
      { ...ENTRADA, stepPosition: 1.5 },
      { orderId: PEDIDO, direction: 'advance' },
      { ...ENTRADA, orderId: 'no-uuid' },
    ]) {
      const d = montar();
      await expect(createRecordStepMove(d.deps)(ACTOR, entrada)).rejects.toThrow(ValidationError);
      ningunDobleLlamado(d);
    }
  });
});

describe('recordStepMove — que anota', () => {
  it('R17: `advance` escribe una anotacion `advance` con la posicion recibida', async () => {
    const d = montar();
    await createRecordStepMove(d.deps)(ACTOR, { orderId: PEDIDO, direction: 'advance', stepPosition: 4 });
    expect(d.append).toHaveBeenCalledTimes(1);
    expect(d.append).toHaveBeenCalledWith({
      action: 'advance',
      companyId: EMPRESA,
      orderId: PEDIDO,
      userId: ANA,
      stepPosition: 4,
      occurredAt: AHORA,
    });
  });

  it('R18: `go_back` escribe una anotacion `go_back` con la posicion recibida', async () => {
    const d = montar();
    await createRecordStepMove(d.deps)(ACTOR, { orderId: PEDIDO, direction: 'go_back', stepPosition: 2 });
    expect(d.append).toHaveBeenCalledWith({
      action: 'go_back',
      companyId: EMPRESA,
      orderId: PEDIDO,
      userId: ANA,
      stepPosition: 2,
      occurredAt: AHORA,
    });
  });

  it('R5: con una receta sin pasos la posicion `null` se anota tal cual', async () => {
    const d = montar();
    await createRecordStepMove(d.deps)(ACTOR, { orderId: PEDIDO, direction: 'advance', stepPosition: null });
    expect(d.append.mock.calls[0]?.[0]).toMatchObject({ stepPosition: null });
  });

  it('R17: no consulta la ultima posicion: anota la que recibe', async () => {
    const d = montar();
    await createRecordStepMove(d.deps)(ACTOR, ENTRADA);
    expect(d.findLastStepPosition).not.toHaveBeenCalled();
  });

  it('R19: si `append` falla, el error se propaga tal cual', async () => {
    const fallo = new Error('base caida');
    const d = montar({ appendFalla: fallo });
    await expect(createRecordStepMove(d.deps)(ACTOR, ENTRADA)).rejects.toBe(fallo);
  });
});

describe('recordStepMove — solo EN_CURSO (R20, R43)', () => {
  it.each([
    ['BLOQUEADO', 'order_blocked'],
    ['POR_EMPACAR', 'order_produced_frozen'],
    ['EN_EMPAQUE', 'order_produced_frozen'],
    ['ENTREGADO', 'order_delivered_frozen'],
    ['CANCELADO', 'order_cancelled_not_assignable'],
    ['PENDIENTE', 'order_not_found'],
  ] as const)('R20, R43: %s no escribe y rechaza con %s', async (status, code) => {
    const d = montar({ status });
    const error = await createRecordStepMove(d.deps)(ACTOR, ENTRADA).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AsignacionesError);
    expect((error as AsignacionesError).code).toBe(code);
    expect(d.append).not.toHaveBeenCalled();
  });

  it('R20: BLOQUEADO es OrderBlockedError aunque la tabla de escrituras de asignacion lo admita', async () => {
    const d = montar({ status: 'BLOQUEADO' });
    await expect(createRecordStepMove(d.deps)(ACTOR, ENTRADA)).rejects.toThrow(OrderBlockedError);
    expect(d.append).not.toHaveBeenCalled();
  });
});
