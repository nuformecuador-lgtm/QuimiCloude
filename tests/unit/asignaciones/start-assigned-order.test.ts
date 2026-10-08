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
  OrderBlockedError,
  OrderCancelledNotAssignableError,
  OrderDeliveredFrozenError,
  OrderNotFoundError,
  OrderProducedFrozenError,
  UnauthorizedError,
} from '@/lib/modules/asignaciones/domain/errors';
import { ExecutionAbortedError } from '@/lib/modules/asignaciones/domain/execution-entry';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { NewExecutionEntry } from '@/lib/modules/asignaciones/domain/execution-entry';
import type { ExecutionLogRepository } from '@/lib/modules/asignaciones/ports/execution-log-repository';
import type {
  ExecutionTransaction,
  ExecutionWriters,
} from '@/lib/modules/asignaciones/ports/execution-transaction';
import type { OrderAssignmentRepository } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type { AssignedOrderSummary, OrderCatalog, OrderStatus } from '@/lib/modules/pedidos';
import type { RecipeCatalog, RecipeExecutionContent } from '@/lib/modules/recetas';
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
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

const ACTOR: Actor = {
  id: ANA,
  companyId: EMPRESA,
  permissions: ['asignaciones.consultar', 'asignaciones.ejecutar'],
};

function resumen(overrides?: Partial<AssignedOrderSummary>): AssignedOrderSummary {
  return {
    id: PEDIDO,
    number: { year: 2026, sequence: 1 },
    recipeId: RECETA,
    quantity: '250.0000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    presentationLines: [],
    unitId: null,
    finishedAt: null,
    packedBy: null,
    ...overrides,
  };
}

function contenido(pasos: number): RecipeExecutionContent {
  return {
    id: RECETA,
    name: 'Jabon liquido',
    isDeleted: false,
    steps: Array.from({ length: pasos }, () => ({ blocks: [] })),
    lines: [{ productId: PRODUCTO, productName: null, percentage: '90.00' }],
    tools: [],
  };
}

function unidad(): UnitRef {
  return { id: LITRO, name: 'Litro', symbol: 'L', baseUnitId: null, factor: null };
}

type Anotacion = { readonly entry: NewExecutionEntry; readonly dentroDeRun: boolean };

type Dobles = {
  readonly deps: StartAssignedOrderDeps;
  readonly listOrderIdsByUserInCompany: ReturnType<typeof vi.fn>;
  readonly findAliveById: ReturnType<typeof vi.fn>;
  readonly transitionAliveById: ReturnType<typeof vi.fn>;
  readonly append: ReturnType<typeof vi.fn>;
  readonly findLastStepPosition: ReturnType<typeof vi.fn>;
  readonly run: ReturnType<typeof vi.fn>;
  readonly anotaciones: Anotacion[];
};

type TransitionResult = Awaited<ReturnType<OrderCatalog['transitionAliveById']>>;

function montar(options?: {
  readonly ordenDeEstados?: readonly OrderStatus[];
  readonly transitionResults?: readonly TransitionResult[];
  readonly pasos?: number;
  readonly ultimaPosicion?: number | null;
  readonly appendFalla?: boolean;
}): Dobles {
  const estados = [...(options?.ordenDeEstados ?? ['PENDIENTE'])];
  const resultados = [...(options?.transitionResults ?? ['ok'])];
  const anotaciones: Anotacion[] = [];
  let dentroDeRun = false;

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
  const append = vi.fn(async (entry: NewExecutionEntry) => {
    if (options?.appendFalla === true) throw new Error('la base no acepto la anotacion');
    anotaciones.push({ entry, dentroDeRun });
  });
  const findLastStepPosition = vi.fn(async () => options?.ultimaPosicion ?? null);
  const log: ExecutionLogRepository = { append, findLastStepPosition };
  const writers = {
    orders: { transitionAliveById, cancelAliveById: vi.fn() },
    packing: { startPackingAliveById: vi.fn(), finishPackingAliveById: vi.fn() },
    log,
  } as unknown as ExecutionWriters;
  const run = vi.fn(async (work: (w: ExecutionWriters) => Promise<unknown>) => {
    dentroDeRun = true;
    try {
      return await work(writers);
    } finally {
      dentroDeRun = false;
    }
  });

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
      findExecutionContentById: vi.fn(async () => contenido(options?.pasos ?? 0)),
    } as unknown as RecipeCatalog,
    units: {
      findRefs: vi.fn(async () => [unidad()]),
      listVisibleRefs: () => Promise.reject(new Error('no se usa')),
      findMassVolumeBridge: () => Promise.reject(new Error('no se usa')),
      findRefsSharingBaseInCompany: vi.fn(async () => []),
    } as UnitCatalog,
    products: {
      findRefs: vi.fn(async () => [
        { id: PRODUCTO, name: 'Sosa caustica', unitId: null, stockByUnit: [], type: 'PRODUCT' as const },
      ]),
      findCostingBatches: vi.fn(async () => {
        throw new Error('arrancar un pedido asignado no costea nada');
      }),
      findFinishedGoodsReceipts: vi.fn(async () => []),
    } as ProductCatalog,
    presentations: { findRefs: vi.fn(async () => []) } as unknown as PresentationCatalog,
    log,
    transaction: { run } as unknown as ExecutionTransaction,
    now: () => new Date('2026-09-17T10:00:00.000Z'),
  };

  return {
    deps,
    listOrderIdsByUserInCompany,
    findAliveById,
    transitionAliveById,
    append,
    findLastStepPosition,
    run,
    anotaciones,
  };
}

describe('startAssignedOrder — autorizacion', () => {
  it('R5: exige `asignaciones.ejecutar` ANTES de tocar ningun puerto', async () => {
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

// Nota 2026-10-06 (QC-82 R13): EN_CURSO sigue sin transicionar, pero ya no «no escribe nada»:
// anota exactamente un `resume` en el registro de ejecucion.
describe('startAssignedOrder — R9: EN_CURSO no transiciona', () => {
  it('con el pedido ya EN_CURSO, `transitionAliveById` no se llama ni una vez y se anota exactamente un `resume`', async () => {
    const { deps, transitionAliveById, append } = montar({ ordenDeEstados: ['EN_CURSO'] });
    const startAssignedOrder = createStartAssignedOrder(deps);

    const view = await startAssignedOrder(ACTOR, { orderId: PEDIDO });

    expect(transitionAliveById).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0]?.[0]).toMatchObject({ action: 'resume' });
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

describe('startAssignedOrder — R11: POR_EMPACAR y EN_EMPAQUE no se pueden abrir', () => {
  it('POR_EMPACAR rechaza con `order_produced_frozen` sin escribir', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['POR_EMPACAR'] });
    const startAssignedOrder = createStartAssignedOrder(deps);

    await expect(startAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderProducedFrozenError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  it('EN_EMPAQUE rechaza con `order_produced_frozen` sin escribir', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['EN_EMPAQUE'] });
    const startAssignedOrder = createStartAssignedOrder(deps);

    await expect(startAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderProducedFrozenError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
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

describe('QC-138 — startAssignedOrder: un BLOQUEADO no se arranca', () => {
  it('R28, R32 — arrancar un BLOQUEADO rechaza con `order_blocked` sin escribir', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['BLOQUEADO'] });
    const startAssignedOrder = createStartAssignedOrder(deps);

    const error = await startAssignedOrder(ACTOR, { orderId: PEDIDO }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OrderBlockedError);
    expect((error as OrderBlockedError).code).toBe('order_blocked');
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  // Nota 2026-10-06 (QC-82): la vista se lee ANTES de transicionar, asi que hay una lectura
  // mas del pedido (PENDIENTE) entre la inicial y la relectura tras `stale`.
  it('R32 — bloqueado por una edicion entre la lectura y la transicion: `stale`, relee y rechaza con `order_blocked`', async () => {
    const { deps, findAliveById, transitionAliveById } = montar({
      ordenDeEstados: ['PENDIENTE', 'PENDIENTE', 'BLOQUEADO'],
      transitionResults: ['stale'],
    });
    const startAssignedOrder = createStartAssignedOrder(deps);

    await expect(startAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(OrderBlockedError);
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
    expect(findAliveById).toHaveBeenCalledTimes(3);
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

function doblesDe(deps: object): unknown[] {
  return Object.values(deps as Record<string, unknown>).flatMap((value) =>
    vi.isMockFunction(value) ? [value] : value !== null && typeof value === 'object' ? doblesDe(value) : [],
  );
}

const SIN_EJECUTAR: readonly (readonly [string, readonly string[]])[] = [
  ['solo asignaciones.consultar', ['asignaciones.consultar']],
  ['solo empaque.modificar', ['empaque.modificar']],
  ['asignaciones.consultar + empaque.modificar', ['asignaciones.consultar', 'empaque.modificar']],
  ['el conjunto vacio', []],
];

describe('startAssignedOrder — exige `asignaciones.ejecutar`', () => {
  it.each(SIN_EJECUTAR)('R6, R7a: con %s rechaza con `unauthorized` sin invocar ningun puerto', async (_caso, permissions) => {
    const { deps } = montar({ ordenDeEstados: ['PENDIENTE', 'EN_CURSO'] });

    await expect(
      createStartAssignedOrder(deps)({ id: ANA, companyId: EMPRESA, permissions }, { orderId: PEDIDO }),
    ).rejects.toThrow(UnauthorizedError);
    for (const doble of doblesDe(deps)) expect(doble).not.toHaveBeenCalled();
  });

  it('R6: sin el permiso rechaza antes de validar la entrada', async () => {
    const { deps } = montar({ ordenDeEstados: ['PENDIENTE', 'EN_CURSO'] });

    await expect(
      createStartAssignedOrder(deps)(
        { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.consultar'] },
        { orderId: 'no-es-un-uuid' },
      ),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('R7b: con solo `asignaciones.ejecutar` comenzar resuelve igual que con el conjunto del Operador', async () => {
    const soloEjecutar: Actor = { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.ejecutar'] };
    const conEjecutar = montar({ ordenDeEstados: ['PENDIENTE', 'EN_CURSO'] });
    const deReferencia = montar({ ordenDeEstados: ['PENDIENTE', 'EN_CURSO'] });

    const resultado = await createStartAssignedOrder(conEjecutar.deps)(soloEjecutar, { orderId: PEDIDO });
    const referencia = await createStartAssignedOrder(deReferencia.deps)(ACTOR, { orderId: PEDIDO });

    expect(resultado).toEqual(referencia);
  });
});

const AHORA = new Date('2026-09-17T10:00:00.000Z');

describe('QC-82 — startAssignedOrder: arrancar anota `start` en la misma transaccion', () => {
  it('R12: PENDIENTE con pasos anota un `start` con posicion 1 DENTRO de `run`, con el mismo `now` que la transicion', async () => {
    const { deps, run, transitionAliveById, anotaciones } = montar({
      ordenDeEstados: ['PENDIENTE', 'PENDIENTE'],
      pasos: 3,
    });

    const view = await createStartAssignedOrder(deps)(ACTOR, { orderId: PEDIDO });

    expect(run).toHaveBeenCalledTimes(1);
    expect(transitionAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA, 'PENDIENTE', 'EN_CURSO', ANA, AHORA);
    expect(anotaciones).toEqual([
      {
        entry: {
          action: 'start',
          companyId: EMPRESA,
          orderId: PEDIDO,
          userId: ANA,
          stepPosition: 1,
          occurredAt: AHORA,
        },
        dentroDeRun: true,
      },
    ]);
    expect(view.status).toBe('EN_CURSO');
    expect(view.resumeStepPosition).toBe(1);
  });

  it('R12: la vista se lee ANTES de escribir', async () => {
    const { deps, run } = montar({ ordenDeEstados: ['PENDIENTE', 'PENDIENTE'], pasos: 2 });
    const findExecutionContentById = deps.recipes.findExecutionContentById as ReturnType<typeof vi.fn>;

    await createStartAssignedOrder(deps)(ACTOR, { orderId: PEDIDO });

    const [lectura] = findExecutionContentById.mock.invocationCallOrder;
    const [escritura] = run.mock.invocationCallOrder;
    expect(lectura).toBeLessThan(escritura as number);
  });

  it('R5: una receta sin pasos anota el `start` sin posicion y la vista retoma en `null`', async () => {
    const { deps, anotaciones } = montar({ ordenDeEstados: ['PENDIENTE', 'PENDIENTE'], pasos: 0 });

    const view = await createStartAssignedOrder(deps)(ACTOR, { orderId: PEDIDO });

    expect(anotaciones.map(({ entry }) => [entry.action, entry.stepPosition])).toEqual([['start', null]]);
    expect(view.resumeStepPosition).toBeNull();
  });

  it.each<TransitionResult>(['not_found', 'stale', 'insufficient_material', 'recipe_without_lines'])(
    'R24: el desenlace `%s` aborta lanzando DENTRO de `run`, sin `start`',
    async (resultado) => {
      const { deps, run, append } = montar({
        ordenDeEstados: ['PENDIENTE', 'PENDIENTE', 'CANCELADO'],
        transitionResults: [resultado],
        pasos: 2,
      });

      await expect(createStartAssignedOrder(deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(Error);
      await expect(run.mock.results[0]?.value).rejects.toBeInstanceOf(ExecutionAbortedError);
      expect(append).not.toHaveBeenCalled();
    },
  );

  it('R24: `not_found` se traduce a `order_not_found`', async () => {
    const { deps } = montar({ ordenDeEstados: ['PENDIENTE', 'PENDIENTE'], transitionResults: ['not_found'] });

    await expect(createStartAssignedOrder(deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });

  it('R24: si `append(start)` lanza, el error sale de dentro de `run` y se propaga', async () => {
    const { deps, run } = montar({ ordenDeEstados: ['PENDIENTE', 'PENDIENTE'], pasos: 2, appendFalla: true });

    await expect(createStartAssignedOrder(deps)(ACTOR, { orderId: PEDIDO })).rejects.toThrow(
      'la base no acepto la anotacion',
    );
    await expect(run.mock.results[0]?.value).rejects.toThrow('la base no acepto la anotacion');
  });

  it('R16: `stale` porque otro arranco antes => cero `start` y exactamente un `resume`', async () => {
    const { deps, anotaciones, transitionAliveById } = montar({
      ordenDeEstados: ['PENDIENTE', 'PENDIENTE', 'EN_CURSO'],
      transitionResults: ['stale'],
      pasos: 4,
      ultimaPosicion: 1,
    });

    const view = await createStartAssignedOrder(deps)(ACTOR, { orderId: PEDIDO });

    expect(transitionAliveById).toHaveBeenCalledTimes(1);
    expect(anotaciones.map(({ entry }) => entry.action)).toEqual(['resume']);
    expect(anotaciones[0]?.dentroDeRun).toBe(false);
    expect(view.resumeStepPosition).toBe(1);
  });
});

describe('QC-82 — startAssignedOrder: retomar anota `resume` en la ultima posicion', () => {
  it('R13: EN_CURSO con ultima posicion 3 anota `resume` con 3 y la vista retoma en 3', async () => {
    const { deps, anotaciones, findLastStepPosition, run } = montar({
      ordenDeEstados: ['EN_CURSO'],
      pasos: 5,
      ultimaPosicion: 3,
    });

    const view = await createStartAssignedOrder(deps)(ACTOR, { orderId: PEDIDO });

    expect(findLastStepPosition).toHaveBeenCalledWith(EMPRESA, PEDIDO);
    expect(run).not.toHaveBeenCalled();
    expect(anotaciones).toEqual([
      {
        entry: {
          action: 'resume',
          companyId: EMPRESA,
          orderId: PEDIDO,
          userId: ANA,
          stepPosition: 3,
          occurredAt: AHORA,
        },
        dentroDeRun: false,
      },
    ]);
    expect(view.status).toBe('EN_CURSO');
    expect(view.resumeStepPosition).toBe(3);
  });

  it('R14: EN_CURSO sin ninguna anotacion con posicion retoma y anota en 1', async () => {
    const { deps, anotaciones } = montar({ ordenDeEstados: ['EN_CURSO'], pasos: 5, ultimaPosicion: null });

    const view = await createStartAssignedOrder(deps)(ACTOR, { orderId: PEDIDO });

    expect(anotaciones.map(({ entry }) => entry.stepPosition)).toEqual([1]);
    expect(view.resumeStepPosition).toBe(1);
  });

  it('R5: EN_CURSO con una receta sin pasos anota el `resume` sin posicion', async () => {
    const { deps, anotaciones } = montar({ ordenDeEstados: ['EN_CURSO'], pasos: 0, ultimaPosicion: null });

    const view = await createStartAssignedOrder(deps)(ACTOR, { orderId: PEDIDO });

    expect(anotaciones.map(({ entry }) => entry.stepPosition)).toEqual([null]);
    expect(view.resumeStepPosition).toBeNull();
  });

  it('R15: si `append(resume)` lanza, `startAssignedOrder` lanza y no devuelve vista', async () => {
    const { deps } = montar({ ordenDeEstados: ['EN_CURSO'], pasos: 2, ultimaPosicion: 2, appendFalla: true });

    await expect(createStartAssignedOrder(deps)(ACTOR, { orderId: PEDIDO })).rejects.toThrow(
      'la base no acepto la anotacion',
    );
  });
});

describe('QC-82 — startAssignedOrder: un BLOQUEADO no anota nada', () => {
  it('R44: BLOQUEADO de entrada rechaza con `order_blocked` con cero `append` y sin leer el registro', async () => {
    const { deps, append, findLastStepPosition, run } = montar({ ordenDeEstados: ['BLOQUEADO'] });

    const error = await createStartAssignedOrder(deps)(ACTOR, { orderId: PEDIDO }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OrderBlockedError);
    expect((error as OrderBlockedError).code).toBe('order_blocked');
    expect(append).not.toHaveBeenCalled();
    expect(findLastStepPosition).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('R44: `stale` que relee BLOQUEADO rechaza con `order_blocked` y cero `start`', async () => {
    const { deps, append } = montar({
      ordenDeEstados: ['PENDIENTE', 'PENDIENTE', 'BLOQUEADO'],
      transitionResults: ['stale'],
      pasos: 2,
    });

    await expect(createStartAssignedOrder(deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderBlockedError,
    );
    expect(append).not.toHaveBeenCalled();
  });
});

describe('QC-82 — startAssignedOrder: el prologo no cambia', () => {
  it('R26: con solo `asignaciones.consultar` rechaza sin tocar el registro ni la transaccion', async () => {
    const { deps, append, findLastStepPosition, run } = montar({ ordenDeEstados: ['EN_CURSO'] });

    await expect(
      createStartAssignedOrder(deps)(
        { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.consultar'] },
        { orderId: PEDIDO },
      ),
    ).rejects.toThrow(UnauthorizedError);
    expect(append).not.toHaveBeenCalled();
    expect(findLastStepPosition).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('R26: un pedido que no es tuyo es `order_not_found` sin anotar', async () => {
    const { deps, listOrderIdsByUserInCompany, append } = montar({ ordenDeEstados: ['EN_CURSO'] });
    listOrderIdsByUserInCompany.mockResolvedValueOnce([]);

    await expect(createStartAssignedOrder(deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    expect(append).not.toHaveBeenCalled();
  });
});

const RESUMEN_VACIO = { items: [], total: 0, page: 1, pageSize: 1, totalPages: 0 };

/** La vista lee PENDIENTE y el resumen filtrado por PENDIENTE sale vacio: otro arranco en medio. */
function conVistaQuePierdeLaCarrera(dobles: Dobles): ReturnType<typeof vi.fn> {
  const listAliveSummariesByIds = dobles.deps.orders.listAliveSummariesByIds as ReturnType<typeof vi.fn>;
  listAliveSummariesByIds.mockResolvedValueOnce(RESUMEN_VACIO);
  return listAliveSummariesByIds;
}

describe('QC-82 — startAssignedOrder: carrera de arrancar al leer la vista', () => {
  it('R16: el pedido pasa a EN_CURSO entre las dos lecturas de la vista => cero `start`, exactamente un `resume`', async () => {
    // Lectura inicial, lectura de la vista, relectura tras la carrera, vista de la rama EN_CURSO.
    const dobles = montar({
      ordenDeEstados: ['PENDIENTE', 'PENDIENTE', 'EN_CURSO', 'EN_CURSO'],
      pasos: 4,
      ultimaPosicion: 2,
    });
    const listAliveSummariesByIds = conVistaQuePierdeLaCarrera(dobles);

    const view = await createStartAssignedOrder(dobles.deps)(ACTOR, { orderId: PEDIDO });

    expect(dobles.transitionAliveById).not.toHaveBeenCalled();
    expect(dobles.run).not.toHaveBeenCalled();
    expect(dobles.anotaciones.map(({ entry }) => entry.action)).toEqual(['resume']);
    expect(dobles.anotaciones[0]?.entry.stepPosition).toBe(2);
    expect(listAliveSummariesByIds).toHaveBeenLastCalledWith(EMPRESA, [PEDIDO], ['EN_CURSO'], 1, 1);
    expect(view.status).toBe('EN_CURSO');
    expect(view.resumeStepPosition).toBe(2);
  });

  it('R16: si al releer el pedido esta BLOQUEADO rechaza con `order_blocked` sin anotar', async () => {
    const dobles = montar({ ordenDeEstados: ['PENDIENTE', 'PENDIENTE', 'BLOQUEADO'], pasos: 2 });
    conVistaQuePierdeLaCarrera(dobles);

    await expect(createStartAssignedOrder(dobles.deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderBlockedError,
    );
    expect(dobles.append).not.toHaveBeenCalled();
    expect(dobles.run).not.toHaveBeenCalled();
  });

  it('R26: si al releer el pedido sigue PENDIENTE, el `order_not_found` se propaga sin escribir', async () => {
    const dobles = montar({ ordenDeEstados: ['PENDIENTE', 'PENDIENTE', 'PENDIENTE', 'PENDIENTE'], pasos: 2 });
    conVistaQuePierdeLaCarrera(dobles);

    await expect(createStartAssignedOrder(dobles.deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    expect(dobles.transitionAliveById).not.toHaveBeenCalled();
    expect(dobles.append).not.toHaveBeenCalled();
  });

  it('R26: si al releer el pedido ya no existe, el `order_not_found` se propaga sin escribir', async () => {
    const dobles = montar({ ordenDeEstados: ['PENDIENTE', 'PENDIENTE'], pasos: 2 });
    conVistaQuePierdeLaCarrera(dobles);
    dobles.findAliveById.mockImplementationOnce(async () => ({ id: PEDIDO, status: 'PENDIENTE' }));
    dobles.findAliveById.mockImplementationOnce(async () => ({ id: PEDIDO, status: 'PENDIENTE' }));
    dobles.findAliveById.mockImplementationOnce(async () => null);

    await expect(createStartAssignedOrder(dobles.deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    expect(dobles.findAliveById).toHaveBeenCalledTimes(3);
    expect(dobles.transitionAliveById).not.toHaveBeenCalled();
    expect(dobles.append).not.toHaveBeenCalled();
  });

  it('R26: si al releer el pedido ya no esta asignado al actor, el `order_not_found` se propaga sin anotar', async () => {
    const dobles = montar({ ordenDeEstados: ['PENDIENTE', 'PENDIENTE', 'EN_CURSO', 'EN_CURSO'], pasos: 2 });
    conVistaQuePierdeLaCarrera(dobles);
    dobles.listOrderIdsByUserInCompany
      .mockResolvedValueOnce([PEDIDO])
      .mockResolvedValueOnce([PEDIDO])
      .mockResolvedValueOnce([]);

    await expect(createStartAssignedOrder(dobles.deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    expect(dobles.append).not.toHaveBeenCalled();
  });

  it('R16: el reintento por la carrera es uno solo: si la vista vuelve a faltar, se propaga', async () => {
    const dobles = montar({ ordenDeEstados: ['PENDIENTE', 'PENDIENTE', 'EN_CURSO', 'EN_CURSO'], pasos: 2 });
    const listAliveSummariesByIds = conVistaQuePierdeLaCarrera(dobles);
    listAliveSummariesByIds.mockResolvedValueOnce(RESUMEN_VACIO);

    await expect(createStartAssignedOrder(dobles.deps)(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    expect(listAliveSummariesByIds).toHaveBeenCalledTimes(2);
    expect(dobles.append).not.toHaveBeenCalled();
  });
});
