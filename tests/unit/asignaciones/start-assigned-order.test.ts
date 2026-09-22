// tests/unit/asignaciones/start-assigned-order.test.ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  createStartAssignedOrder,
  type StartAssignedOrderDeps,
} from '@/lib/modules/asignaciones/domain/start-assigned-order';
import {
  AsignacionesError,
  OrderCancelledNotAssignableError,
  OrderDeliveredFrozenError,
  UnauthorizedError,
} from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { OrderAssignmentRepository } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type { AssignedOrderSummary, OrderCatalog, OrderStatus } from '@/lib/modules/pedidos';
import type { RecipeCatalog, RecipeExecutionContent } from '@/lib/modules/recetas';
import type { ProductCatalog } from '@/lib/modules/inventario';
import type { UnitCatalog, UnitRef } from '@/lib/modules/unidades';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ANA = uuid('1');
const PEDIDO = uuid('7');
const RECETA = uuid('a');
const PRODUCTO = uuid('c');
const LITRO = uuid('d');

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.consultar'] };

function resumen(overrides?: Partial<AssignedOrderSummary>): AssignedOrderSummary {
  return {
    id: PEDIDO,
    number: { year: 2026, sequence: 1 },
    recipeId: RECETA,
    quantity: '250.0000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    ...overrides,
  };
}

function contenido(): RecipeExecutionContent {
  return {
    id: RECETA,
    name: 'Jabon liquido',
    isDeleted: false,
    steps: [],
    lines: [{ productId: PRODUCTO, productName: null, percentage: '90.00' }],
  };
}

function unidad(): UnitRef {
  return { id: LITRO, name: 'Litro', symbol: 'L', baseUnitId: null, factor: null };
}

type Dobles = {
  readonly deps: StartAssignedOrderDeps;
  readonly listOrderIdsByUserInCompany: ReturnType<typeof vi.fn>;
  readonly findAliveById: ReturnType<typeof vi.fn>;
  readonly transitionAliveById: ReturnType<typeof vi.fn>;
};

function montar(options?: {
  readonly ordenDeEstados?: readonly OrderStatus[];
  readonly transitionResults?: readonly ('ok' | 'not_found' | 'stale')[];
}): Dobles {
  const estados = [...(options?.ordenDeEstados ?? ['PENDIENTE'])];
  const resultados = [...(options?.transitionResults ?? ['ok'])];

  const listOrderIdsByUserInCompany = vi.fn(async () => [PEDIDO]);
  const findAliveById = vi.fn(async () => ({ id: PEDIDO, status: estados.shift() ?? 'EN_CURSO' }));
  const transitionAliveById = vi.fn(async () => resultados.shift() ?? 'ok');
  const listAliveSummariesByIds = vi.fn(async () => ({
    items: [resumen()],
    total: 1,
    page: 1,
    pageSize: 1,
    totalPages: 1,
  }));

  const deps: StartAssignedOrderDeps = {
    assignments: {
      insertMissing: vi.fn(),
      listByOrderInCompany: vi.fn(),
      listByOrdersInCompany: vi.fn(),
      deleteOne: vi.fn(),
      deleteByWorkGroup: vi.fn(),
      listOrderIdsByUserInCompany,
    } as unknown as OrderAssignmentRepository,
    orders: { findAliveById, listAliveSummariesByIds, transitionAliveById } as unknown as OrderCatalog,
    recipes: {
      findRefsIncludingDeleted: vi.fn(),
      findExecutionContentById: vi.fn(async () => contenido()),
    } as unknown as RecipeCatalog,
    units: {
      findRefs: vi.fn(async () => [unidad()]),
      findRefsSharingBaseInCompany: vi.fn(async () => []),
    } as UnitCatalog,
    products: {
      findRefs: vi.fn(async () => [
        { id: PRODUCTO, name: 'Sosa caustica', unitId: null, stockByUnit: [] },
      ]),
      findCostingBatches: vi.fn(async () => {
        throw new Error('arrancar un pedido asignado no costea nada');
      }),
    } as ProductCatalog,
    now: () => new Date('2026-09-17T10:00:00.000Z'),
  };

  return { deps, listOrderIdsByUserInCompany, findAliveById, transitionAliveById };
}

describe('startAssignedOrder — autorizacion', () => {
  it('R5: exige `asignaciones.consultar` ANTES de tocar ningun puerto', async () => {
    const { deps, listOrderIdsByUserInCompany, findAliveById, transitionAliveById } = montar();
    const startAssignedOrder = createStartAssignedOrder(deps);

    await expect(
      startAssignedOrder({ id: ANA, companyId: EMPRESA, permissions: [] }, { orderId: PEDIDO }),
    ).rejects.toThrow(UnauthorizedError);
    expect(listOrderIdsByUserInCompany).not.toHaveBeenCalled();
    expect(findAliveById).not.toHaveBeenCalled();
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  it('rechaza sin actor, sin tocar ningun puerto', async () => {
    const { deps, transitionAliveById } = montar();
    const startAssignedOrder = createStartAssignedOrder(deps);

    await expect(startAssignedOrder(undefined, { orderId: PEDIDO })).rejects.toBeInstanceOf(AsignacionesError);
    expect(transitionAliveById).not.toHaveBeenCalled();
  });
});

describe('startAssignedOrder — R8: PENDIENTE abre el pedido', () => {
  it('transiciona PENDIENTE a EN_CURSO', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['PENDIENTE', 'EN_CURSO'] });
    const startAssignedOrder = createStartAssignedOrder(deps);

    const view = await startAssignedOrder(ACTOR, { orderId: PEDIDO });

    expect(transitionAliveById).toHaveBeenCalledWith(
      PEDIDO,
      EMPRESA,
      'PENDIENTE',
      'EN_CURSO',
      ANA,
      new Date('2026-09-17T10:00:00.000Z'),
    );
    expect(view.orderId).toBe(PEDIDO);
  });
});

describe('startAssignedOrder — R9: EN_CURSO no escribe nada', () => {
  it('con el pedido ya EN_CURSO, `transitionAliveById` no se llama ni una vez', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['EN_CURSO'] });
    const startAssignedOrder = createStartAssignedOrder(deps);

    const view = await startAssignedOrder(ACTOR, { orderId: PEDIDO });

    expect(transitionAliveById).not.toHaveBeenCalled();
    expect(view.orderId).toBe(PEDIDO);
  });

  it('la reentrada no depende de quien entro primero: cualquier responsable la ve sin error', async () => {
    const { deps } = montar({ ordenDeEstados: ['EN_CURSO'] });
    const startAssignedOrder = createStartAssignedOrder(deps);

    await expect(startAssignedOrder(ACTOR, { orderId: PEDIDO })).resolves.toBeDefined();
  });
});

describe('startAssignedOrder — `stale`: se relee y se sigue', () => {
  it('si `transitionAliveById` devuelve `stale`, relee y no lanza ningun error visible', async () => {
    const { deps, findAliveById, transitionAliveById } = montar({
      ordenDeEstados: ['PENDIENTE', 'EN_CURSO'],
      transitionResults: ['stale'],
    });
    const startAssignedOrder = createStartAssignedOrder(deps);

    await expect(startAssignedOrder(ACTOR, { orderId: PEDIDO })).resolves.toBeDefined();
    // Una lectura inicial, una relectura por `stale` y una tercera dentro de
    // `getAssignedOrderExecution`, que compone la vista final.
    expect(findAliveById).toHaveBeenCalledTimes(3);
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });
});

describe('startAssignedOrder — R14: ENTREGADO y CANCELADO no admiten reapertura', () => {
  it('ENTREGADO rechaza con `order_delivered_frozen` sin escribir', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['ENTREGADO'] });
    const startAssignedOrder = createStartAssignedOrder(deps);

    await expect(startAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderDeliveredFrozenError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  it('CANCELADO rechaza con `order_cancelled_not_assignable` sin escribir', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['CANCELADO'] });
    const startAssignedOrder = createStartAssignedOrder(deps);

    await expect(startAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderCancelledNotAssignableError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
  });
});

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
      dir = parent;
    }
  }
}

describe('startAssignedOrder — R12: la legalidad la decide `pedidos`, no una segunda tabla', () => {
  it('el archivo no declara ninguna lista de estados propia', () => {
    const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
    const fuente = readFileSync(
      join(repoRoot, 'lib', 'modules', 'asignaciones', 'domain', 'start-assigned-order.ts'),
      'utf8',
    );

    expect(fuente).not.toMatch(/PENDIENTE['"]?\s*:\s*\[/);
    expect(fuente).not.toMatch(/const\s+ALLOWED\b/);
    expect(fuente).not.toMatch(/isAllowedTransition|assertTransition/);
  });
});
