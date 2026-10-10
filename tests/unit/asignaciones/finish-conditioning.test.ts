// tests/unit/asignaciones/finish-conditioning.test.ts
import { describe, expect, it, vi } from 'vitest';

import {
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  SEED_ROLE_PERMISSIONS,
} from '@/lib/modules/identity';

import {
  createFinishConditioning,
  type FinishConditioningDeps,
} from '@/lib/modules/asignaciones/domain/finish-conditioning';
import {
  ConditioningBatchDataMissingError,
  OrderConditioningTakenError,
  OrderNotConditionableError,
  OrderNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { FinishedBatchLabels, FinishedBatchOfOrderLine } from '@/lib/modules/inventario';
import type { OrderCatalog } from '@/lib/modules/pedidos';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ANA = uuid('1');
const BETO = uuid('2');
const LOTE = uuid('8');
const PEDIDO = uuid('7');
const AHORA = new Date('2026-10-08T12:00:00.000Z');

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['acondicionamiento.modificar'] };

type Resultado = 'ok' | 'not_conditioner' | 'not_conditionable' | 'not_found';

function montar(
  resultado: Resultado,
  options?: {
    readonly target?: { readonly id: string; readonly status: string } | null;
    readonly summaryItems?: readonly unknown[];
    readonly batches?: readonly FinishedBatchOfOrderLine[];
  },
): {
  readonly deps: FinishConditioningDeps;
  readonly findAliveById: ReturnType<typeof vi.fn>;
  readonly listAliveSummariesByIds: ReturnType<typeof vi.fn>;
  readonly finishConditioningAliveById: ReturnType<typeof vi.fn>;
  readonly listOfOrder: ReturnType<typeof vi.fn>;
} {
  const findAliveById = vi.fn(async () =>
    options?.target === undefined ? { id: PEDIDO, status: 'EN_ACONDICIONAMIENTO' } : options.target,
  );
  const listAliveSummariesByIds = vi.fn(async () => ({
    items: options?.summaryItems ?? [
      { id: PEDIDO, number: { year: 2026, sequence: 7 }, conditionedBy: ANA, presentationLines: [] },
    ],
    total: 1,
    page: 1,
    pageSize: 1,
  }));
  const finishConditioningAliveById = vi.fn(async () => resultado);
  const listOfOrder = vi.fn<FinishedBatchLabels['listOfOrder']>(async () => options?.batches ?? []);
  const deps = {
    orders: { findAliveById, listAliveSummariesByIds, finishConditioningAliveById } as unknown as OrderCatalog,
    batches: { listOfOrder },
    now: () => AHORA,
  } satisfies FinishConditioningDeps;
  return { deps, findAliveById, listAliveSummariesByIds, finishConditioningAliveById, listOfOrder };
}

/** Un catalogo que falla en cuanto se lee cualquiera de sus miembros. */
function catalogoIntocable(): OrderCatalog {
  return new Proxy({} as OrderCatalog, {
    get(_target, prop) {
      throw new Error(`se toco el puerto: ${String(prop)}`);
    },
  });
}

function depsIntocables(): FinishConditioningDeps {
  return {
    orders: catalogoIntocable(),
    batches: {
      listOfOrder: () => {
        throw new Error('se toco el puerto: listOfOrder');
      },
    },
    now: () => {
      throw new Error('se pidio la hora');
    },
  };
}

describe('finishConditioning — autorizacion', () => {
  const actoresSinPermiso: ReadonlyArray<readonly [string, Actor | null | undefined]> = [
    ['nulo', null],
    ['ausente', undefined],
    [
      'con los permisos de semilla del Administrador',
      { id: ANA, companyId: EMPRESA, permissions: SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]! },
    ],
    [
      'con los permisos de semilla del Empacador',
      { id: ANA, companyId: EMPRESA, permissions: SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]! },
    ],
    ['con el conjunto vacio', { id: ANA, companyId: EMPRESA, permissions: [] }],
  ];

  it.each(actoresSinPermiso)(
    'R15: actor %s rechaza con unauthorized sin tocar ningun puerto',
    async (_nombre, actor) => {
      const finishConditioning = createFinishConditioning(depsIntocables());
      await expect(finishConditioning(actor, { orderId: PEDIDO })).rejects.toBeInstanceOf(UnauthorizedError);
    },
  );

  it.each(actoresSinPermiso)(
    'R15: actor %s con entrada invalida sigue dando unauthorized: autorizar va antes de validar',
    async (_nombre, actor) => {
      const finishConditioning = createFinishConditioning(depsIntocables());
      await expect(finishConditioning(actor, { orderId: 'no-es-uuid', extra: 1 })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    },
  );

  it('R15: un actor con los permisos de semilla del Administrador de acondicionamiento termina', async () => {
    const { deps, finishConditioningAliveById } = montar('ok');
    const actor: Actor = { id: ANA, companyId: EMPRESA, permissions: SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO]! };

    await expect(createFinishConditioning(deps)(actor, { orderId: PEDIDO })).resolves.toEqual({
      numberText: '2026-0000007',
    });
    expect(finishConditioningAliveById).toHaveBeenCalledTimes(1);
  });
});

describe('finishConditioning — validacion de la entrada', () => {
  const entradasInvalidas: ReadonlyArray<readonly [string, unknown]> = [
    ['nula', null],
    ['no objeto', 'texto'],
    ['vacia', {}],
    ['orderId no uuid', { orderId: 'no-es-uuid' }],
    ['orderId numerico', { orderId: 7 }],
    ['con una clave de mas', { orderId: PEDIDO, companyId: EMPRESA }],
  ];

  it.each(entradasInvalidas)('R16: entrada %s rechaza con invalid_input sin tocar ningun puerto', async (_n, entrada) => {
    const finishConditioning = createFinishConditioning({ ...depsIntocables(), now: () => AHORA });
    const error = await finishConditioning(ACTOR, entrada).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe('invalid_input');
  });
});

describe('finishConditioning — lectura del numero y traduccion del resultado', () => {
  it('R12: devuelve el numero visible leido ANTES de transicionar, con el estado actual del pedido', async () => {
    const { deps, findAliveById, listAliveSummariesByIds, finishConditioningAliveById } = montar('ok');

    const result = await createFinishConditioning(deps)(ACTOR, { orderId: PEDIDO });

    expect(result).toEqual({ numberText: '2026-0000007' });
    expect(findAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA);
    expect(listAliveSummariesByIds).toHaveBeenCalledWith(EMPRESA, [PEDIDO], ['EN_ACONDICIONAMIENTO'], 1, 1);
    expect(finishConditioningAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA, ANA, AHORA);
    expect(listAliveSummariesByIds.mock.invocationCallOrder[0]!).toBeLessThan(
      finishConditioningAliveById.mock.invocationCallOrder[0]!,
    );
  });

  it('R13: not_conditioner rechaza con order_conditioning_taken', async () => {
    const { deps } = montar('not_conditioner');
    const error = await createFinishConditioning(deps)(ACTOR, { orderId: PEDIDO }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OrderConditioningTakenError);
    expect((error as OrderConditioningTakenError).code).toBe('order_conditioning_taken');
  });

  it('R14: not_conditionable rechaza con order_not_conditionable', async () => {
    const { deps } = montar('not_conditionable', { target: { id: PEDIDO, status: 'POR_ACONDICIONAR' } });
    const error = await createFinishConditioning(deps)(ACTOR, { orderId: PEDIDO }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OrderNotConditionableError);
    expect((error as OrderNotConditionableError).code).toBe('order_not_conditionable');
  });

  it('R14: not_found del catalogo rechaza con order_not_found', async () => {
    const { deps } = montar('not_found');
    const error = await createFinishConditioning(deps)(ACTOR, { orderId: PEDIDO }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OrderNotFoundError);
    expect((error as OrderNotFoundError).code).toBe('order_not_found');
  });

  it('R14: pedido inexistente, de baja o de otra empresa rechaza con order_not_found sin transicionar', async () => {
    const { deps, listAliveSummariesByIds, finishConditioningAliveById } = montar('ok', { target: null });
    await expect(createFinishConditioning(deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    expect(listAliveSummariesByIds).not.toHaveBeenCalled();
    expect(finishConditioningAliveById).not.toHaveBeenCalled();
  });

  it('R14: si el resumen no aparece rechaza con order_not_found sin transicionar', async () => {
    const { deps, finishConditioningAliveById } = montar('ok', { summaryItems: [] });
    await expect(createFinishConditioning(deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    expect(finishConditioningAliveById).not.toHaveBeenCalled();
  });

  it('R14: la empresa sale del actor, nunca de la entrada', async () => {
    const { deps, findAliveById, finishConditioningAliveById } = montar('ok');
    const otro: Actor = { ...ACTOR, companyId: uuid('9') };

    await createFinishConditioning(deps)(otro, { orderId: PEDIDO });
    expect(findAliveById).toHaveBeenCalledWith(PEDIDO, uuid('9'));
    expect(finishConditioningAliveById).toHaveBeenCalledWith(PEDIDO, uuid('9'), ANA, AHORA);
  });
});

describe('QC-219 — Terminar exige los datos de lote', () => {
  const LINEA = { presentationId: 'pres-1', packages: 2, packagingName: 'Botella 1 L' };
  const CON_DATOS: FinishedBatchOfOrderLine = {
    batchId: LOTE,
    orderPresentationLineId: 'linea-1',
    presentationId: 'pres-1',
    lot: 'CR-2610-A',
    expiryDate: '2027-04-30',
    productionDate: '2026-10-01',
  };

  function resumenCon(conditionedBy: string, lineas: readonly unknown[]) {
    return [{ id: PEDIDO, number: { year: 2026, sequence: 7 }, conditionedBy, presentationLines: lineas }];
  }

  it('R15: si alguna linea no tiene datos rechaza con conditioning_batch_data_missing sin llamar a la transicion', async () => {
    const { deps, listOfOrder, finishConditioningAliveById } = montar('ok', {
      summaryItems: resumenCon(ANA, [LINEA]),
      batches: [{ ...CON_DATOS, lot: 'AUTO-1', expiryDate: null, productionDate: null }],
    });

    const error = await createFinishConditioning(deps)(ACTOR, { orderId: PEDIDO }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConditioningBatchDataMissingError);
    expect((error as ConditioningBatchDataMissingError).code).toBe('conditioning_batch_data_missing');
    expect(listOfOrder).toHaveBeenCalledWith(EMPRESA, PEDIDO);
    expect(finishConditioningAliveById).not.toHaveBeenCalled();
  });

  it('R17: una linea sin lote de produccion cuenta como sin datos', async () => {
    const { deps, finishConditioningAliveById } = montar('ok', { summaryItems: resumenCon(ANA, [LINEA]), batches: [] });

    await expect(createFinishConditioning(deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      ConditioningBatchDataMissingError,
    );
    expect(finishConditioningAliveById).not.toHaveBeenCalled();
  });

  it('R17: un pedido sin lineas termina sin pedir datos', async () => {
    const { deps, finishConditioningAliveById } = montar('ok', { summaryItems: resumenCon(ANA, []), batches: [] });

    await expect(createFinishConditioning(deps)(ACTOR, { orderId: PEDIDO })).resolves.toEqual({
      numberText: '2026-0000007',
    });
    expect(finishConditioningAliveById).toHaveBeenCalledTimes(1);
  });

  it('R15: con todas las lineas con datos termina', async () => {
    const { deps, finishConditioningAliveById } = montar('ok', {
      summaryItems: resumenCon(ANA, [LINEA]),
      batches: [CON_DATOS],
    });

    await expect(createFinishConditioning(deps)(ACTOR, { orderId: PEDIDO })).resolves.toEqual({
      numberText: '2026-0000007',
    });
    expect(finishConditioningAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA, ANA, AHORA);
  });

  it('R16: un acondicionador que no es quien acondiciona recibe order_conditioning_taken aunque falten datos, sin leer los lotes', async () => {
    const { deps, listOfOrder, finishConditioningAliveById } = montar('ok', {
      summaryItems: resumenCon(BETO, [LINEA]),
      batches: [],
    });

    await expect(createFinishConditioning(deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderConditioningTakenError,
    );
    expect(listOfOrder).not.toHaveBeenCalled();
    expect(finishConditioningAliveById).not.toHaveBeenCalled();
  });

  it('R16: un pedido que no esta EN_ACONDICIONAMIENTO da order_not_conditionable antes de mirar los datos', async () => {
    const { deps, listOfOrder } = montar('ok', {
      target: { id: PEDIDO, status: 'TERMINADO' },
      summaryItems: resumenCon(ANA, [LINEA]),
      batches: [],
    });

    await expect(createFinishConditioning(deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderNotConditionableError,
    );
    expect(listOfOrder).not.toHaveBeenCalled();
  });

  it('R16: un pedido inexistente da order_not_found antes de mirar los datos', async () => {
    const { deps, listOfOrder } = montar('ok', { target: null, batches: [] });

    await expect(createFinishConditioning(deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(listOfOrder).not.toHaveBeenCalled();
  });

  it('R16: sin permiso da unauthorized y una entrada invalida da invalid_input, sin leer los lotes', async () => {
    const finishConditioning = createFinishConditioning(depsIntocables());
    await expect(finishConditioning(null, { orderId: PEDIDO })).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(finishConditioning(ACTOR, { orderId: 'x' })).rejects.toBeInstanceOf(ValidationError);
  });
});
