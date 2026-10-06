// La revision de pedidos bloqueados con dobles: que desbloquea, en que orden, con que autor y
// que hace cuando un pedido falla. Los efectos sobre la base los prueba
// `tests/integration/pedidos/review-blocked-orders.int.test.ts`.

import { describe, expect, it, vi } from 'vitest';

import { createReviewBlockedOrders } from '@/lib/modules/pedidos/domain/review-blocked-orders';
import {
  fakeOrderRow,
  fakeScopeProducts,
  fakeScopeUnits,
  fakeUnitOfWork,
} from '@/tests/helpers/order-unit-of-work-double';
import { fakePackagingCatalog } from '@/tests/helpers/packaging-catalog-double';

import type { OrderStatus } from '@/lib/modules/pedidos/domain/order-classification';
import type { StoredOrderCost } from '@/lib/modules/pedidos/domain/order-cost';
import type { OrderScope } from '@/lib/modules/pedidos/domain/order-scope';
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository';
import type { LockedOrderRow } from '@/lib/modules/pedidos/ports/order-write-repository';
import type { CostingBatch, ProductCatalog, ReservationOutcome } from '@/lib/modules/inventario';
import type { RecipeCatalog, RecipeExecutionLine } from '@/lib/modules/recetas';
import type { UnitCatalog, UnitConversion, UnitRef } from '@/lib/modules/unidades';

const EMPRESA_A = '33333333-3333-4333-8333-333333333333';
const AHORA = new Date('2026-09-26T10:00:00.000Z');
const SCOPE: OrderScope = { companyId: EMPRESA_A };

const PEDIDO_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const PEDIDO_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const PEDIDO_3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const PRODUCTO_X = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LITRO: UnitConversion = { id: 'l', baseUnitId: null, factor: null };

function linea(): RecipeExecutionLine {
  return { productId: PRODUCTO_X, productName: null, percentage: '100.00' };
}

function lote(overrides: Partial<CostingBatch> = {}): CostingBatch {
  return {
    productId: PRODUCTO_X,
    lot: '1',
    stock: '100',
    unitCost: '2.0000',
    unitId: LITRO.id,
    purchaseDate: '2026-01-01',
    available: '100',
    ...overrides,
  };
}

function bloqueado(id: string, overrides: Partial<LockedOrderRow> = {}): LockedOrderRow {
  return fakeOrderRow({ id, status: 'BLOQUEADO', reservedAt: null, quantity: '10.0000', ...overrides });
}

type Escenario = {
  readonly ids?: readonly string[];
  readonly filas?: ReadonlyMap<string, LockedOrderRow>;
  /** Lo que devuelve `lockAliveById` si no es la misma fila que la lectura previa. */
  readonly bloqueadas?: ReadonlyMap<string, LockedOrderRow | null>;
  readonly resultado?: (orderId: string) => ReservationOutcome;
  readonly lineas?: readonly RecipeExecutionLine[];
  readonly lotes?: readonly CostingBatch[];
  /** La unidad del insumo y el catalogo de unidades; por defecto el insumo en `LITRO`. */
  readonly insumoUnitId?: string;
  readonly unidades?: readonly UnitRef[];
};

function montar(escenario: Escenario = {}) {
  const ids = escenario.ids ?? [PEDIDO_1];
  const filas = escenario.filas ?? new Map(ids.map((id) => [id, bloqueado(id)]));
  const lineas = escenario.lineas ?? [linea()];
  const orden: string[] = [];

  const findBlockedIds = vi.fn(async () => ids);
  const findAliveById = vi.fn(async (id: string) => filas.get(id) ?? null);
  const orders = { findBlockedIds, findAliveById } as unknown as Pick<
    OrderRepository,
    'findBlockedIds' | 'findAliveById'
  >;

  const lockAliveById = vi.fn(async (id: string) => {
    orden.push(`lock:${id}`);
    if (escenario.bloqueadas?.has(id) === true) return escenario.bloqueadas.get(id) ?? null;
    return filas.get(id) ?? null;
  });
  const syncForOrder = vi.fn(async (input: { orderId: string }) =>
    escenario.resultado === undefined ? ({ kind: 'reserved' } as const) : escenario.resultado(input.orderId),
  );
  const setStatus = vi.fn(
    async (id: string, from: OrderStatus, to: OrderStatus, actorId: string | null, now: Date, scope: OrderScope) => {
      void [from, to, actorId, now, scope];
      orden.push(`setStatus:${id}`);
      return 'ok' as const;
    },
  );
  const setIngredientsCost = vi.fn(
    async (id: string, cost: StoredOrderCost | null, actorId: string | null, now: Date, scope: OrderScope) => {
      void [id, cost, actorId, now, scope];
      return 'ok' as const;
    },
  );
  const setReservedAt = vi.fn(async (id: string, reservedAt: Date | null, scope: OrderScope) => {
    void [id, reservedAt, scope];
  });
  const findExecutionContentById = vi.fn(async (id: string) => ({
    id,
    name: 'Receta',
    isDeleted: false,
    steps: [],
    lines: lineas,
    tools: [],
  }));

  const insumoUnitId = escenario.insumoUnitId ?? LITRO.id;
  const unidades: readonly UnitConversion[] = escenario.unidades ?? [LITRO];
  const insumo = { id: PRODUCTO_X, name: 'x', unitId: insumoUnitId, stockByUnit: [], type: 'PRODUCT' as const };
  const uow = fakeUnitOfWork({
    orders: { lockAliveById, setStatus, setIngredientsCost, setReservedAt },
    reservations: { syncForOrder },
    recipes: { findExecutionContentById },
    products: fakeScopeProducts(escenario.insumoUnitId === undefined ? [] : [insumo]),
    units: fakeScopeUnits(escenario.unidades ?? []),
  });

  const recipes = {
    findRefsIncludingDeleted: vi.fn(),
    findExecutionContentById,
  } as unknown as RecipeCatalog;
  const products = {
    findRefs: vi.fn(async () => [insumo]),
    findCostingBatches: vi.fn(async () => escenario.lotes ?? [lote()]),
  } as unknown as ProductCatalog;
  const units = {
    findRefs: vi.fn(async (ids: readonly string[]) => unidades.filter((unidad) => ids.includes(unidad.id))),
    findRefsSharingBaseInCompany: vi.fn(async () => []),
    findMassVolumeBridge: vi.fn(async () => null),
  } as unknown as UnitCatalog;

  const review = createReviewBlockedOrders({ orders, recipes, products, units, packaging: fakePackagingCatalog(), unitOfWork: uow.unitOfWork });
  return {
    review,
    orden,
    findBlockedIds,
    findAliveById,
    lockAliveById,
    syncForOrder,
    setStatus,
    setIngredientsCost,
    setReservedAt,
    products,
  };
}

describe('reviewBlockedOrders — desbloqueo', () => {
  it('R14, R15: el que alcanza se aparta, pasa a PENDIENTE, fija reserved_at al instante y recalcula el importe', async () => {
    const m = montar();

    const resultado = await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(resultado).toEqual({ unblocked: 1, failed: [] });
    expect(m.setStatus).toHaveBeenCalledWith(PEDIDO_1, 'BLOQUEADO', 'PENDIENTE', null, AHORA, SCOPE);
    // 10 * 100 % = 10 unidades a 2.0000.
    expect(m.setIngredientsCost).toHaveBeenCalledWith(PEDIDO_1, { total: '20.0000', packaging: '0.0000' }, null, AHORA, SCOPE);
    expect(m.setReservedAt).toHaveBeenCalledWith(PEDIDO_1, AHORA, SCOPE);
  });

  it('R15: si el importe no se puede calcular, lo sustituye por null', async () => {
    const m = montar({ lotes: [lote({ unitId: 'bidon' })] });

    await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(m.setStatus).toHaveBeenCalledTimes(1);
    expect(m.setIngredientsCost).toHaveBeenCalledWith(PEDIDO_1, null, null, AHORA, SCOPE);
  });

  it('R15: el importe se calcula contando como disponible lo apartado por el propio pedido', async () => {
    const m = montar();

    await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(m.products.findCostingBatches).toHaveBeenCalledWith([PRODUCTO_X], EMPRESA_A, {
      excludeOrderId: PEDIDO_1,
    });
  });

  it('R2: receta sin lineas -> not_reserved desbloquea sin apartar y deja reserved_at nulo', async () => {
    const m = montar({ lineas: [], resultado: () => ({ kind: 'not_reserved' }) });

    const resultado = await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(resultado.unblocked).toBe(1);
    expect(m.setStatus).toHaveBeenCalledWith(PEDIDO_1, 'BLOQUEADO', 'PENDIENTE', null, AHORA, SCOPE);
    expect(m.setReservedAt).toHaveBeenCalledWith(PEDIDO_1, null, SCOPE);
  });

  it('R17: el que sigue sin alcanzar queda intacto: ni estado, ni importe, ni reserved_at', async () => {
    const m = montar({ resultado: () => ({ kind: 'insufficient', productIds: [PRODUCTO_X] }) });

    const resultado = await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(resultado).toEqual({ unblocked: 0, failed: [] });
    expect(m.setStatus).not.toHaveBeenCalled();
    expect(m.setIngredientsCost).not.toHaveBeenCalled();
    expect(m.setReservedAt).not.toHaveBeenCalled();
  });

  it('R22: el pedido y los apartados quedan sin autor', async () => {
    const m = montar();

    await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(m.syncForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: PEDIDO_1, companyId: EMPRESA_A, actorId: null, now: AHORA }),
    );
    expect(m.setStatus.mock.calls[0]?.[3]).toBeNull();
    expect(m.setIngredientsCost.mock.calls[0]?.[2]).toBeNull();
  });
});

describe('reviewBlockedOrders — orden y alcance', () => {
  it('R16: recorre en el orden que devuelve findBlockedIds, del mas antiguo al mas nuevo', async () => {
    const m = montar({ ids: [PEDIDO_2, PEDIDO_1, PEDIDO_3] });

    await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(m.orden.filter((paso) => paso.startsWith('lock:'))).toEqual([
      `lock:${PEDIDO_2}`,
      `lock:${PEDIDO_1}`,
      `lock:${PEDIDO_3}`,
    ]);
  });

  it('R16: con material para uno solo, se desbloquea el primero de la lista', async () => {
    let disponible = true;
    const m = montar({
      ids: [PEDIDO_1, PEDIDO_2],
      resultado: () => {
        if (!disponible) return { kind: 'insufficient', productIds: [PRODUCTO_X] };
        disponible = false;
        return { kind: 'reserved' };
      },
    });

    const resultado = await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(resultado.unblocked).toBe(1);
    expect(m.setStatus).toHaveBeenCalledTimes(1);
    expect(m.setStatus.mock.calls[0]?.[0]).toBe(PEDIDO_1);
  });

  it('R18, R38: solo pide los bloqueados de la empresa del movimiento', async () => {
    const m = montar();

    await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(m.findBlockedIds).toHaveBeenCalledWith(SCOPE);
    for (const llamada of m.lockAliveById.mock.calls) {
      expect(llamada[llamada.length - 1]).toStrictEqual(SCOPE);
    }
  });

  it('R18: un pedido que ya no esta BLOQUEADO al leerlo no se bloquea ni se escribe', async () => {
    const m = montar({
      filas: new Map([[PEDIDO_1, bloqueado(PEDIDO_1, { status: 'PENDIENTE' })]]),
    });

    const resultado = await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(resultado).toEqual({ unblocked: 0, failed: [] });
    expect(m.lockAliveById).not.toHaveBeenCalled();
    expect(m.syncForOrder).not.toHaveBeenCalled();
  });

  it('sin bloqueados no abre ninguna transaccion', async () => {
    const m = montar({ ids: [] });

    expect(await m.review({ companyId: EMPRESA_A, now: AHORA })).toEqual({ unblocked: 0, failed: [] });
    expect(m.lockAliveById).not.toHaveBeenCalled();
  });
});

describe('reviewBlockedOrders — concurrencia y fallos', () => {
  it('R24: si al bloquear la fila ya no esta BLOQUEADO (cancelado, desbloqueado), no se toca', async () => {
    for (const status of ['CANCELADO', 'PENDIENTE'] as const) {
      const m = montar({ bloqueadas: new Map([[PEDIDO_1, bloqueado(PEDIDO_1, { status })]]) });

      const resultado = await m.review({ companyId: EMPRESA_A, now: AHORA });

      expect(resultado, status).toEqual({ unblocked: 0, failed: [] });
      expect(m.syncForOrder, status).not.toHaveBeenCalled();
      expect(m.setStatus, status).not.toHaveBeenCalled();
    }
  });

  it('R24: si al bloquear la fila ya no existe (borrada), no se toca', async () => {
    const m = montar({ bloqueadas: new Map([[PEDIDO_1, null]]) });

    expect(await m.review({ companyId: EMPRESA_A, now: AHORA })).toEqual({ unblocked: 0, failed: [] });
    expect(m.syncForOrder).not.toHaveBeenCalled();
  });

  it('R15, R24: si una edicion cambio la cantidad entre la lectura y el candado, se deja para la siguiente revision', async () => {
    const m = montar({ bloqueadas: new Map([[PEDIDO_1, bloqueado(PEDIDO_1, { quantity: '4.0000' })]]) });

    expect(await m.review({ companyId: EMPRESA_A, now: AHORA })).toEqual({ unblocked: 0, failed: [] });
    expect(m.syncForOrder).not.toHaveBeenCalled();
  });

  it('R5: si una edicion cambio la unidad entre la lectura y el candado, se deja para la siguiente revision sin guardar el costo de la unidad vieja', async () => {
    const m = montar({ bloqueadas: new Map([[PEDIDO_1, bloqueado(PEDIDO_1, { unitId: 'ml' })]]) });

    expect(await m.review({ companyId: EMPRESA_A, now: AHORA })).toEqual({ unblocked: 0, failed: [] });
    expect(m.syncForOrder).not.toHaveBeenCalled();
    expect(m.setStatus).not.toHaveBeenCalled();
    expect(m.setIngredientsCost).not.toHaveBeenCalled();
  });

  it('R23: un fallo en un pedido no impide los demas y aparece en failed con su codigo', async () => {
    const m = montar({
      ids: [PEDIDO_1, PEDIDO_2, PEDIDO_3],
      resultado: (orderId) => {
        if (orderId === PEDIDO_2) throw Object.assign(new Error('boom'), { code: 'insufficient_material' });
        return { kind: 'reserved' };
      },
    });

    const resultado = await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(resultado).toEqual({
      unblocked: 2,
      failed: [{ orderId: PEDIDO_2, code: 'insufficient_material' }],
    });
    expect(m.setStatus.mock.calls.map((c) => c[0])).toEqual([PEDIDO_1, PEDIDO_3]);
  });

  it('R23: un error sin codigo se anota como unexpected, sin el mensaje', async () => {
    const m = montar({
      resultado: () => {
        throw new Error('detalle interno con datos');
      },
    });

    const resultado = await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(resultado.failed).toEqual([{ orderId: PEDIDO_1, code: 'unexpected' }]);
    expect(JSON.stringify(resultado)).not.toContain('detalle interno');
  });

  it('R23: un fallo al leer o costear un pedido tambien queda en failed', async () => {
    const m = montar({ ids: [PEDIDO_1, PEDIDO_2] });
    m.findAliveById.mockImplementationOnce(async () => {
      throw new Error('lectura caida');
    });

    const resultado = await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(resultado.failed).toEqual([{ orderId: PEDIDO_1, code: 'unexpected' }]);
    expect(resultado.unblocked).toBe(1);
  });
});

describe('QC-195 reviewBlockedOrders — los envases del reparto', () => {
  const ENVASE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const PRESENTACION = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  function conReparto(): LockedOrderRow {
    return bloqueado(PEDIDO_1, {
      presentationLines: [
        { presentationId: PRESENTACION, packages: 10, packagingProductId: ENVASE },
        { presentationId: 'antigua', packages: 3, packagingProductId: null },
      ],
    });
  }

  it('R21: la necesidad que se evalua lleva la receta y los envases del reparto (las lineas antiguas no aportan)', async () => {
    const m = montar({ filas: new Map([[PEDIDO_1, conReparto()]]) });

    await m.review({ companyId: EMPRESA_A, now: AHORA });

    const entrada = (m.syncForOrder.mock.calls[0] as unknown as readonly [{ requirement: readonly unknown[] }])[0];
    expect(entrada.requirement).toEqual([
      { productId: PRODUCTO_X, quantity: '10' },
      { productId: ENVASE, quantity: '10' },
    ]);
  });

  it('R21: si falta un envase no se desbloquea: ni estado, ni importe, ni reserved_at', async () => {
    const m = montar({
      filas: new Map([[PEDIDO_1, conReparto()]]),
      resultado: () => ({ kind: 'insufficient', productIds: [ENVASE] }),
    });

    const resultado = await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(resultado).toEqual({ unblocked: 0, failed: [] });
    expect(m.setStatus).not.toHaveBeenCalled();
    expect(m.setIngredientsCost).not.toHaveBeenCalled();
    expect(m.setReservedAt).not.toHaveBeenCalled();
  });
});

describe('QC-204 reviewBlockedOrders — la necesidad en la unidad del pedido', () => {
  const GRAMO: UnitRef = { id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', name: 'Gramo', symbol: 'g', baseUnitId: null, factor: null };
  const KILO: UnitRef = { id: 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', name: 'Kilogramo', symbol: 'kg', baseUnitId: GRAMO.id, factor: '1000' };
  const PIEZA: UnitRef = { id: 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3', name: 'Pieza', symbol: 'pz', baseUnitId: null, factor: null };
  const UNIDADES = [GRAMO, KILO, PIEZA];

  /** 1000 g al 100 % sobre un insumo en `insumoUnitId`. */
  function montarEnGramos(insumoUnitId: string) {
    return montar({
      filas: new Map([[PEDIDO_1, bloqueado(PEDIDO_1, { quantity: '1000.0000', unitId: GRAMO.id })]]),
      lotes: [lote({ unitId: insumoUnitId, stock: '100', available: '100', unitCost: '2.0000' })],
      insumoUnitId,
      unidades: UNIDADES,
    });
  }

  it('R5 el desbloqueo recalcula con la unidad del pedido', async () => {
    const m = montarEnGramos(KILO.id);

    const resultado = await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(resultado).toEqual({ unblocked: 1, failed: [] });
    // 1000 g son 1 kg a 2.0000. Sin convertir serian 1000 kg: 2000.0000.
    expect(m.setIngredientsCost).toHaveBeenCalledWith(PEDIDO_1, { total: '2.0000', packaging: '0.0000' }, null, AHORA, SCOPE);
    const entrada = (m.syncForOrder.mock.calls[0] as unknown as readonly [{ requirement: readonly { quantity: string }[] }])[0];
    expect(Number(entrada.requirement[0]?.quantity)).toBe(1);
  });

  it('R12 el desbloqueo deja BLOQUEADO un pedido con una linea no convertible', async () => {
    const m = montarEnGramos(PIEZA.id);

    const resultado = await m.review({ companyId: EMPRESA_A, now: AHORA });

    expect(resultado).toEqual({ unblocked: 0, failed: [] });
    expect(m.syncForOrder).not.toHaveBeenCalled();
    expect(m.setStatus).not.toHaveBeenCalled();
    expect(m.setIngredientsCost).not.toHaveBeenCalled();
    expect(m.setReservedAt).not.toHaveBeenCalled();
  });
});
