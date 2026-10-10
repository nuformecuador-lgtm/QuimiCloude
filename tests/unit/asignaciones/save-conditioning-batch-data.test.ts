// QC-219 T7 — Guardar los datos de lote: el orden de las reglas, con puertos simulados.
import { describe, expect, it, vi } from 'vitest';

import {
  createSaveConditioningBatchData,
  type SaveConditioningBatchDataDeps,
} from '@/lib/modules/asignaciones/domain/save-conditioning-batch-data';
import {
  BatchExpiryNotFutureError,
  BatchProductionDateFutureError,
  ConditioningBatchDuplicateLotError,
  ConditioningBatchNotFoundError,
  OrderConditioningTakenError,
  OrderNotConditionableError,
  OrderNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/asignaciones/domain/errors';
import { ROLE_ADMINISTRADOR, ROLE_EMPACADOR, ROLE_OPERADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { FinishedBatchLabels, FinishedBatchLabelsOutcome } from '@/lib/modules/inventario';
import type { OrderCatalog, OrderStatus } from '@/lib/modules/pedidos';

import { ACONDICIONADOR, AHORA, ANA, BETO, EMPRESA, PEDIDO_1, actoresSinElPermiso, uuid } from './conditioning-doubles';

// AHORA = 2026-10-08T10:00Z: «hoy» es 2026-10-08.
const HOY = '2026-10-08';
const MANANA = '2026-10-09';
const LOTE_A = uuid('7');
const LOTE_B = uuid('8');

function linea(batchId: string, overrides?: Partial<{ lot: string; expiryDate: string; productionDate: string }>) {
  return { batchId, lot: `L-${batchId.slice(0, 4)}`, expiryDate: '2027-04-30', productionDate: HOY, ...overrides };
}

function entrada(lines: readonly unknown[] = [linea(LOTE_A)]) {
  return { orderId: PEDIDO_1, lines };
}

function montar(options?: {
  readonly status?: OrderStatus | null;
  readonly conditionedBy?: string | null;
  readonly outcome?: FinishedBatchLabelsOutcome;
}) {
  const status = options?.status === undefined ? 'EN_ACONDICIONAMIENTO' : options.status;
  const conditionedBy = options?.conditionedBy === undefined ? ANA : options.conditionedBy;
  const findAliveById = vi.fn(async () => (status === null ? null : { id: PEDIDO_1, status }));
  const listAliveSummariesByIds = vi.fn(async () => ({
    items: status === null ? [] : [{ id: PEDIDO_1, status, conditionedBy, presentationLines: [] }],
    total: 1,
    page: 1,
    pageSize: 1,
    totalPages: 1,
  }));
  const writeForOrder = vi.fn<FinishedBatchLabels['writeForOrder']>(
    async () => options?.outcome ?? { kind: 'written' },
  );
  const deps = {
    orders: { findAliveById, listAliveSummariesByIds } as unknown as OrderCatalog,
    batches: { writeForOrder },
    now: () => AHORA,
  } satisfies SaveConditioningBatchDataDeps;
  return { deps, findAliveById, listAliveSummariesByIds, writeForOrder, todos: [findAliveById, listAliveSummariesByIds, writeForOrder] };
}

// Sin valor por defecto en `actor`: un `undefined` explicito tiene que llegar tal cual.
async function fallo(
  deps: SaveConditioningBatchDataDeps,
  input: unknown,
  ...actor: [] | [Actor | null | undefined]
): Promise<unknown> {
  return createSaveConditioningBatchData(deps)(actor.length === 0 ? ACONDICIONADOR : actor[0], input).then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe('R13 — el permiso antes de todo', () => {
  it.each(actoresSinElPermiso(SEED_ROLE_PERMISSIONS, [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR]))(
    'R13: %s recibe `unauthorized` aun con una entrada invalida, sin tocar ningun puerto',
    async (_nombre, actor) => {
      const { deps, todos } = montar();

      const error = await fallo(deps, { orderId: 'no-uuid' }, actor);

      expect(error).toBeInstanceOf(UnauthorizedError);
      for (const doble of todos) expect(doble).not.toHaveBeenCalled();
    },
  );
});

describe('R7 — la entrada es exactamente `{ orderId, lines }`', () => {
  it.each([
    ['no es un objeto', 7],
    ['sin lines', { orderId: PEDIDO_1 }],
    ['lines vacia', entrada([])],
    ['orderId no uuid', { orderId: 'pedido', lines: [linea(LOTE_A)] }],
    ['clave de mas', { ...entrada(), companyId: EMPRESA }],
    ['clave de mas en una linea', entrada([{ ...linea(LOTE_A), stock: '1' }])],
    ['batchId no uuid', entrada([linea('lote-1')])],
    ['batchId repetido', entrada([linea(LOTE_A), linea(LOTE_A, { lot: 'OTRO' })])],
    ['lote vacio', entrada([linea(LOTE_A, { lot: '' })])],
    ['lote de solo espacios', entrada([linea(LOTE_A, { lot: '   ' })])],
    ['lote de 61 caracteres', entrada([linea(LOTE_A, { lot: 'A'.repeat(61) })])],
    ['lote de 60 digitos', entrada([linea(LOTE_A, { lot: '9'.repeat(60) })])],
    ['vencimiento vacio', entrada([linea(LOTE_A, { expiryDate: '' })])],
    ['vencimiento sin forma', entrada([linea(LOTE_A, { expiryDate: '30/04/2027' })])],
    ['vencimiento que no existe', entrada([linea(LOTE_A, { expiryDate: '2027-02-30' })])],
    ['produccion vacia', entrada([linea(LOTE_A, { productionDate: '' })])],
    ['produccion que no existe', entrada([linea(LOTE_A, { productionDate: '2026-13-01' })])],
    ['un dato ausente', entrada([{ batchId: LOTE_A, lot: 'L', expiryDate: '2027-04-30' }])],
  ])('R7: %s se rechaza con `invalid_input` sin tocar ningun puerto', async (_nombre, input) => {
    const { deps, todos } = montar();

    const error = await fallo(deps, input);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe('invalid_input');
    for (const doble of todos) expect(doble).not.toHaveBeenCalled();
  });

  it('R7: el lote se recorta, y uno de 59 digitos o de 60 caracteres es valido', async () => {
    const { deps, writeForOrder } = montar();

    await createSaveConditioningBatchData(deps)(
      ACONDICIONADOR,
      entrada([linea(LOTE_A, { lot: '  CR-1  ' }), linea(LOTE_B, { lot: '9'.repeat(59) })]),
    );
    await createSaveConditioningBatchData(deps)(ACONDICIONADOR, entrada([linea(LOTE_A, { lot: 'A'.repeat(60) })]));

    expect(writeForOrder.mock.calls[0]?.[0].labels.map((label) => label.lot)).toEqual(['CR-1', '9'.repeat(59)]);
  });
});

describe('R14 — los errores del pedido, antes de mirar las lineas', () => {
  it('R14: inexistente, de baja o de otra empresa -> `order_not_found`', async () => {
    const { deps, writeForOrder } = montar({ status: null });

    expect(await fallo(deps, entrada([linea(LOTE_A, { expiryDate: HOY })]))).toBeInstanceOf(OrderNotFoundError);
    expect(writeForOrder).not.toHaveBeenCalled();
  });

  it.each([
    ['TERMINADO de otra persona', 'TERMINADO', BETO],
    ['TERMINADO sin quien acondiciona', 'TERMINADO', null],
    ['ENTREGADO de otra persona (D13)', 'ENTREGADO', BETO],
    ['ENTREGADO sin quien acondiciona (D13)', 'ENTREGADO', null],
  ] as const)('R14: %s -> `order_not_found`', async (_n, status, conditionedBy) => {
    const { deps, writeForOrder } = montar({ status, conditionedBy });

    expect(await fallo(deps, entrada([linea(LOTE_A, { expiryDate: HOY })]))).toBeInstanceOf(OrderNotFoundError);
    expect(writeForOrder).not.toHaveBeenCalled();
  });

  it('R14: EN_ACONDICIONAMIENTO de otra persona -> `order_conditioning_taken`, aunque las fechas fallen', async () => {
    const { deps, writeForOrder } = montar({ conditionedBy: BETO });

    expect(await fallo(deps, entrada([linea(LOTE_A, { expiryDate: HOY })]))).toBeInstanceOf(OrderConditioningTakenError);
    expect(writeForOrder).not.toHaveBeenCalled();
  });

  it.each(['POR_ACONDICIONAR', 'PENDIENTE', 'EN_CURSO', 'POR_EMPACAR', 'EN_EMPAQUE', 'CANCELADO', 'BLOQUEADO'] as const)(
    'R14: %s -> `order_not_conditionable`, sin leer el resumen ni escribir',
    async (status) => {
      const { deps, listAliveSummariesByIds, writeForOrder } = montar({ status, conditionedBy: null });

      expect(await fallo(deps, entrada())).toBeInstanceOf(OrderNotConditionableError);
      expect(listAliveSummariesByIds).not.toHaveBeenCalled();
      expect(writeForOrder).not.toHaveBeenCalled();
    },
  );

  it('R14: la empresa sale del actor, nunca de la entrada', async () => {
    const { deps, findAliveById, listAliveSummariesByIds, writeForOrder } = montar();

    await createSaveConditioningBatchData(deps)(ACONDICIONADOR, entrada());

    expect(findAliveById).toHaveBeenCalledWith(PEDIDO_1, EMPRESA);
    expect(listAliveSummariesByIds).toHaveBeenCalledWith(EMPRESA, [PEDIDO_1], ['EN_ACONDICIONAMIENTO'], 1, 1);
    expect(writeForOrder.mock.calls[0]?.[0]).toMatchObject({ companyId: EMPRESA, orderId: PEDIDO_1, actorId: ANA });
  });
});

describe('R8, R9 — fechas contra hoy en UTC', () => {
  it('R8: un vencimiento de hoy -> `batch_expiry_not_future` con la primera linea culpable, sin escribir', async () => {
    const { deps, writeForOrder } = montar();

    const error = await fallo(deps, entrada([linea(LOTE_A), linea(LOTE_B, { expiryDate: HOY })]));

    expect(error).toBeInstanceOf(BatchExpiryNotFutureError);
    expect((error as BatchExpiryNotFutureError).code).toBe('batch_expiry_not_future');
    expect((error as BatchExpiryNotFutureError).batchId).toBe(LOTE_B);
    expect(writeForOrder).not.toHaveBeenCalled();
  });

  it('R8: un vencimiento pasado tambien se rechaza; uno de manana es valido', async () => {
    expect(await fallo(montar().deps, entrada([linea(LOTE_A, { expiryDate: '2026-10-07' })]))).toBeInstanceOf(
      BatchExpiryNotFutureError,
    );
    const { deps, writeForOrder } = montar();
    await createSaveConditioningBatchData(deps)(ACONDICIONADOR, entrada([linea(LOTE_A, { expiryDate: MANANA })]));
    expect(writeForOrder).toHaveBeenCalledTimes(1);
  });

  it('R9: un dia de produccion de manana -> `batch_production_date_future` con la linea, sin escribir', async () => {
    const { deps, writeForOrder } = montar();

    const error = await fallo(deps, entrada([linea(LOTE_A, { productionDate: MANANA })]));

    expect(error).toBeInstanceOf(BatchProductionDateFutureError);
    expect((error as BatchProductionDateFutureError).code).toBe('batch_production_date_future');
    expect((error as BatchProductionDateFutureError).batchId).toBe(LOTE_A);
    expect(writeForOrder).not.toHaveBeenCalled();
  });

  it('R9: un dia de produccion de hoy o anterior es valido', async () => {
    const { deps, writeForOrder } = montar();
    await createSaveConditioningBatchData(deps)(
      ACONDICIONADOR,
      entrada([linea(LOTE_A, { productionDate: HOY }), linea(LOTE_B, { productionDate: '2026-01-15' })]),
    );
    expect(writeForOrder).toHaveBeenCalledTimes(1);
  });

  it('D16: «hoy» es el dia civil UTC aunque en otra zona ya sea manana', async () => {
    const { deps, writeForOrder } = montar();
    const casiMedianoche: SaveConditioningBatchDataDeps = { ...deps, now: () => new Date('2026-10-08T23:30:00.000Z') };

    expect(await fallo(casiMedianoche, entrada([linea(LOTE_A, { productionDate: MANANA })]))).toBeInstanceOf(
      BatchProductionDateFutureError,
    );
    expect(writeForOrder).not.toHaveBeenCalled();
  });
});

describe('R10 — lote repetido', () => {
  it('R10: dos lineas con el mismo lote -> `batch_duplicate_lot` con la segunda, sin escribir', async () => {
    const { deps, writeForOrder } = montar();

    const error = await fallo(deps, entrada([linea(LOTE_A, { lot: 'CR-1' }), linea(LOTE_B, { lot: 'CR-1' })]));

    expect(error).toBeInstanceOf(ConditioningBatchDuplicateLotError);
    expect((error as ConditioningBatchDuplicateLotError).code).toBe('batch_duplicate_lot');
    expect((error as ConditioningBatchDuplicateLotError).batchId).toBe(LOTE_B);
    expect(writeForOrder).not.toHaveBeenCalled();
  });

  it('R10: la comparacion distingue mayusculas, y compara el lote ya recortado', async () => {
    const { deps, writeForOrder } = montar();
    await createSaveConditioningBatchData(deps)(
      ACONDICIONADOR,
      entrada([linea(LOTE_A, { lot: 'cr-1' }), linea(LOTE_B, { lot: 'CR-1' })]),
    );
    expect(writeForOrder).toHaveBeenCalledTimes(1);

    expect(
      await fallo(montar().deps, entrada([linea(LOTE_A, { lot: 'CR-1' }), linea(LOTE_B, { lot: ' CR-1 ' })])),
    ).toBeInstanceOf(ConditioningBatchDuplicateLotError);
  });

  it('R10: `duplicate_lot` del puerto se traduce con su linea', async () => {
    const { deps } = montar({ outcome: { kind: 'duplicate_lot', batchId: LOTE_A } });

    const error = await fallo(deps, entrada());

    expect(error).toBeInstanceOf(ConditioningBatchDuplicateLotError);
    expect((error as ConditioningBatchDuplicateLotError).batchId).toBe(LOTE_A);
  });

  it('R11: `duplicate_lot` en carrera, sin linea, se traduce sin `batchId`', async () => {
    const { deps } = montar({ outcome: { kind: 'duplicate_lot', batchId: null } });

    const error = await fallo(deps, entrada());

    expect(error).toBeInstanceOf(ConditioningBatchDuplicateLotError);
    expect((error as ConditioningBatchDuplicateLotError).batchId).toBeUndefined();
  });
});

describe('R12 — lote que no es de una linea del pedido', () => {
  it('R12: `batch_not_found` del puerto se traduce con su linea', async () => {
    const { deps } = montar({ outcome: { kind: 'batch_not_found', batchId: LOTE_B } });

    const error = await fallo(deps, entrada([linea(LOTE_A), linea(LOTE_B)]));

    expect(error).toBeInstanceOf(ConditioningBatchNotFoundError);
    expect((error as ConditioningBatchNotFoundError).code).toBe('batch_not_found');
    expect((error as ConditioningBatchNotFoundError).batchId).toBe(LOTE_B);
  });
});

describe('R6, R18 — guarda en los estados corregibles', () => {
  it.each(['EN_ACONDICIONAMIENTO', 'TERMINADO', 'ENTREGADO'] as const)(
    'R6, R18, D13: en %s propio escribe las lineas enviadas, tal cual, con el reloj del caso de uso',
    async (status) => {
      const { deps, writeForOrder, listAliveSummariesByIds } = montar({ status });
      const lineas = [linea(LOTE_A, { lot: 'CR-2610-A' }), linea(LOTE_B, { lot: 'CR-2610-B' })];

      await expect(createSaveConditioningBatchData(deps)(ACONDICIONADOR, entrada(lineas))).resolves.toBeUndefined();

      expect(listAliveSummariesByIds).toHaveBeenCalledWith(EMPRESA, [PEDIDO_1], [status], 1, 1);
      expect(writeForOrder).toHaveBeenCalledTimes(1);
      expect(writeForOrder).toHaveBeenCalledWith({
        companyId: EMPRESA,
        orderId: PEDIDO_1,
        labels: lineas,
        actorId: ANA,
        now: AHORA,
      });
    },
  );
});
