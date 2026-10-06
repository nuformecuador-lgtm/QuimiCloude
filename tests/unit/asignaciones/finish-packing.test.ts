// tests/unit/asignaciones/finish-packing.test.ts
import { describe, expect, it, vi } from 'vitest';

import { createFinishPacking, type FinishPackingDeps } from '@/lib/modules/asignaciones/domain/finish-packing';
import {
  AsignacionesError,
  IncompatibleUnitsError,
  MaterialShortageError,
  OrderNotFoundError,
  OrderNotPackableError,
  OrderPackingTakenError,
  OrderWithoutUnitError,
  PresentationWithoutContentError,
  RecipeNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ANA = uuid('1');
const PEDIDO = uuid('7');

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['empaque.modificar'] };

type Resultado =
  | { readonly kind: 'ok'; readonly finishedGoods: readonly unknown[] }
  | 'not_packer'
  | 'not_packable'
  | 'not_found'
  | 'recipe_not_found'
  | 'presentation_without_content'
  | 'incompatible_units'
  | 'order_without_unit'
  | 'insufficient_material';

function montar(options?: {
  readonly target?: { readonly id: string; readonly status: string } | null;
  readonly summaryItems?: readonly unknown[];
  readonly resultado?: Resultado;
}): {
  readonly deps: FinishPackingDeps;
  readonly findAliveById: ReturnType<typeof vi.fn>;
  readonly listAliveSummariesByIds: ReturnType<typeof vi.fn>;
  readonly finishPackingAliveById: ReturnType<typeof vi.fn>;
} {
  const findAliveById = vi.fn(async () => (options?.target === undefined ? { id: PEDIDO, status: 'EN_EMPAQUE' } : options.target));
  const listAliveSummariesByIds = vi.fn(async () => ({
    items: options?.summaryItems ?? [{ id: PEDIDO, number: { year: 2026, sequence: 7 } }],
    total: 1,
    page: 1,
    pageSize: 1,
    totalPages: 1,
  }));
  const finishPackingAliveById = vi.fn(async () => options?.resultado ?? { kind: 'ok' as const, finishedGoods: [] });

  const deps = {
    orders: { findAliveById, listAliveSummariesByIds, finishPackingAliveById },
    now: () => new Date('2026-09-25T12:00:00.000Z'),
  } as unknown as FinishPackingDeps;

  return { deps, findAliveById, listAliveSummariesByIds, finishPackingAliveById };
}

describe('finishPacking — autorizacion (R13)', () => {
  it('actor ausente rechaza sin tocar ningun puerto', async () => {
    const { deps, findAliveById, finishPackingAliveById } = montar();
    const finishPacking = createFinishPacking(deps);

    await expect(finishPacking(null, { orderId: PEDIDO })).rejects.toBeInstanceOf(AsignacionesError);
    expect(findAliveById).not.toHaveBeenCalled();
    expect(finishPackingAliveById).not.toHaveBeenCalled();
  });

  it('actor sin `empaque.modificar` rechaza sin tocar ningun puerto', async () => {
    const { deps, findAliveById } = montar();
    const finishPacking = createFinishPacking(deps);
    const actor: Actor = { id: ANA, companyId: EMPRESA, permissions: [] };

    await expect(finishPacking(actor, { orderId: PEDIDO })).rejects.toThrow(UnauthorizedError);
    expect(findAliveById).not.toHaveBeenCalled();
  });

  it('la autorizacion corre ANTES que zod', async () => {
    const { deps, findAliveById } = montar();
    const finishPacking = createFinishPacking(deps);

    await expect(finishPacking({ id: ANA, companyId: EMPRESA, permissions: [] }, { orderId: 'x' })).rejects.toThrow(
      UnauthorizedError,
    );
    expect(findAliveById).not.toHaveBeenCalled();
  });
});

describe('finishPacking — R21, R26: exito devuelve el numero leido antes de escribir', () => {
  it('lee el numero antes de llamar a `finishPackingAliveById` y lo devuelve', async () => {
    const { deps, listAliveSummariesByIds, finishPackingAliveById } = montar();
    const finishPacking = createFinishPacking(deps);

    const result = await finishPacking(ACTOR, { orderId: PEDIDO });

    expect(result).toEqual({ numberText: expect.any(String) });
    expect(listAliveSummariesByIds).toHaveBeenCalledWith(EMPRESA, [PEDIDO], ['EN_EMPAQUE'], 1, 1);
    expect(finishPackingAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA, ANA, expect.any(Date));

    const ordenDeLlamadas = listAliveSummariesByIds.mock.invocationCallOrder[0]!;
    const ordenDeEscritura = finishPackingAliveById.mock.invocationCallOrder[0]!;
    expect(ordenDeLlamadas).toBeLessThan(ordenDeEscritura);
  });
});

describe('finishPacking — R22: quien no empaca el pedido', () => {
  it('`not_packer` rechaza con `order_packing_taken`', async () => {
    const { deps } = montar({ resultado: 'not_packer' });
    const finishPacking = createFinishPacking(deps);

    await expect(finishPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(OrderPackingTakenError);
  });
});

describe('finishPacking — R23: estado que no admite Terminar', () => {
  it('`not_packable` rechaza con `order_not_packable`', async () => {
    const { deps } = montar({ resultado: 'not_packable' });
    const finishPacking = createFinishPacking(deps);

    await expect(finishPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(OrderNotPackableError);
  });
});

describe('finishPacking — R17-R21: da de alta el lote por linea del reparto', () => {
  it('`recipe_not_found` rechaza con `RecipeNotFoundError`', async () => {
    const { deps } = montar({ resultado: 'recipe_not_found' });
    const finishPacking = createFinishPacking(deps);

    await expect(finishPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(RecipeNotFoundError);
  });

  it('`presentation_without_content` rechaza con `PresentationWithoutContentError`', async () => {
    const { deps } = montar({ resultado: 'presentation_without_content' });
    const finishPacking = createFinishPacking(deps);

    await expect(finishPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(PresentationWithoutContentError);
  });

  it('R7, R18: `incompatible_units` rechaza con `IncompatibleUnitsError`', async () => {
    const { deps } = montar({ resultado: 'incompatible_units' });
    const finishPacking = createFinishPacking(deps);

    await expect(finishPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(IncompatibleUnitsError);
  });

  it('R18: `order_without_unit` rechaza con `OrderWithoutUnitError`', async () => {
    const { deps } = montar({ resultado: 'order_without_unit' });
    const finishPacking = createFinishPacking(deps);

    await expect(finishPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(OrderWithoutUnitError);
  });

  it('QC-195 R25: `insufficient_material` (los envases no alcanzan) rechaza con `MaterialShortageError`, code insufficient_material', async () => {
    const { deps } = montar({ resultado: 'insufficient_material' });
    const finishPacking = createFinishPacking(deps);

    const fallo = finishPacking(ACTOR, { orderId: PEDIDO });
    await expect(fallo).rejects.toBeInstanceOf(MaterialShortageError);
    await expect(fallo).rejects.toMatchObject({ code: 'insufficient_material' });
  });
});

describe('finishPacking — R24: no existe, esta de baja o es de otra empresa', () => {
  it('sin pedido vivo rechaza con `order_not_found` sin leer el numero ni escribir', async () => {
    const { deps, listAliveSummariesByIds, finishPackingAliveById } = montar({ target: null });
    const finishPacking = createFinishPacking(deps);

    await expect(finishPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(listAliveSummariesByIds).not.toHaveBeenCalled();
    expect(finishPackingAliveById).not.toHaveBeenCalled();
  });

  it('`not_found` del puerto de escritura tambien rechaza con `order_not_found`', async () => {
    const { deps } = montar({ resultado: 'not_found' });
    const finishPacking = createFinishPacking(deps);

    await expect(finishPacking(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});

describe('finishPacking — R25: ningun puerto de inventario', () => {
  it('las dependencias declaradas son solo `orders`', () => {
    const { deps } = montar();
    expect(Object.keys(deps).sort()).toEqual(['now', 'orders']);
  });
});

describe('finishPacking — entrada', () => {
  it('un `orderId` que no es uuid rechaza con `invalid_input` sin tocar ningun puerto', async () => {
    const { deps, findAliveById } = montar();
    const finishPacking = createFinishPacking(deps);

    await expect(finishPacking(ACTOR, { orderId: 'no-es-uuid' })).rejects.toThrow(ValidationError);
    expect(findAliveById).not.toHaveBeenCalled();
  });
});

describe('QC-211 — finishPacking no comprueba el recorrido de los pasos de envasado', () => {
  it('R24: termina un `EN_EMPAQUE` del actor con `{ orderId }` solo, sin ninguna prueba de recorrido', async () => {
    const { deps, finishPackingAliveById } = montar();
    const finishPacking = createFinishPacking(deps);

    await expect(finishPacking(ACTOR, { orderId: PEDIDO })).resolves.toEqual({ numberText: expect.any(String) });
    expect(finishPackingAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA, ANA, expect.any(Date));
  });

  it.each([
    ['packingStepsDone', 3],
    ['packingSteps', []],
    ['walkthrough', { completed: true }],
  ])('R24: la entrada sigue siendo exactamente `{ orderId }`: `%s` de mas rechaza sin tocar ningun puerto', async (clave, valor) => {
    const { deps, findAliveById, finishPackingAliveById } = montar();
    const finishPacking = createFinishPacking(deps);

    await expect(finishPacking(ACTOR, { orderId: PEDIDO, [clave]: valor })).rejects.toThrow(ValidationError);
    expect(findAliveById).not.toHaveBeenCalled();
    expect(finishPackingAliveById).not.toHaveBeenCalled();
  });

  it('R24: las dependencias no incluyen ningun lector de pasos', () => {
    const { deps } = montar();
    expect(Object.keys(deps).filter((key) => /step/i.test(key))).toEqual([]);
  });
});
