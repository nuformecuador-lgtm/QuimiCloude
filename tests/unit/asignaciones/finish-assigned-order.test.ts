// tests/unit/asignaciones/finish-assigned-order.test.ts
import { describe, expect, it, vi } from 'vitest';

import {
  createFinishAssignedOrder,
  type FinishAssignedOrderDeps,
} from '@/lib/modules/asignaciones/domain/finish-assigned-order';
import {
  AsignacionesError,
  InvalidTransitionError,
  MaterialShortageError,
  OrderCancelledNotAssignableError,
  OrderDeliveredFrozenError,
  OrderProducedFrozenError,
  RecipeWithoutLinesError,
  UnauthorizedError,
} from '@/lib/modules/asignaciones/domain/errors';

import {
  ExecutionAbortedError,
  type NewExecutionEntry,
} from '@/lib/modules/asignaciones/domain/execution-entry';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { ExecutionLogRepository } from '@/lib/modules/asignaciones/ports/execution-log-repository';
import type {
  ExecutionTransaction,
  ExecutionWriters,
} from '@/lib/modules/asignaciones/ports/execution-transaction';
import type {
  AssignmentRow,
  OrderAssignmentRepository,
} from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type { OrderCatalog, OrderStatus } from '@/lib/modules/pedidos';
import type {
  PeopleDirectory,
  PermissionCode,
  PersonRef,
  WorkGroupDirectory,
  WorkGroupSnapshot,
} from '@/lib/modules/identity';

function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

const EMPRESA = uuid('3');
const ANA = uuid('1');
const PEDIDO = uuid('7');
const OPERARIO = uuid('2');
const EMPACADOR = uuid('4');
const OTRO_EMPACADOR = uuid('5');
const GRUPO = uuid('6');

const ACTOR: Actor = {
  id: ANA,
  companyId: EMPRESA,
  permissions: ['asignaciones.consultar', 'asignaciones.ejecutar'],
};

const NUMERO_PEDIDO = { year: 2026, sequence: 7 };

const ENTRADA = { orderId: PEDIDO, stepPosition: 3 };

// R15, R16: `transitionAliveById` yendo a `POR_EMPACAR` ya no da de alta ningun lote,
// asi que el exito es el literal `'ok'`, sin `finishedGoods`.
type TransitionResult = 'ok' | 'not_found' | 'stale' | 'insufficient_material' | 'recipe_without_lines';

type Dobles = {
  readonly deps: FinishAssignedOrderDeps;
  readonly listOrderIdsByUserInCompany: ReturnType<typeof vi.fn>;
  readonly findAliveById: ReturnType<typeof vi.fn>;
  readonly listAliveSummariesByIds: ReturnType<typeof vi.fn>;
  readonly transitionAliveById: ReturnType<typeof vi.fn>;
  readonly listByOrderInCompany: ReturnType<typeof vi.fn>;
  readonly insertMissing: ReturnType<typeof vi.fn>;
  readonly deleteOne: ReturnType<typeof vi.fn>;
  readonly findAliveRefsInCompany: ReturnType<typeof vi.fn>;
  readonly findSnapshotAliveInCompany: ReturnType<typeof vi.fn>;
  readonly append: ReturnType<typeof vi.fn>;
  readonly run: ReturnType<typeof vi.fn>;
  readonly anotaciones: Anotacion[];
};

type Anotacion = { readonly entry: NewExecutionEntry; readonly dentroDeRun: boolean };

function filaSuelta(userId: string): AssignmentRow {
  return { userId, workGroupId: null, workGroupName: null };
}

function filaDeGrupo(userId: string, workGroupId: string, workGroupName: string): AssignmentRow {
  return { userId, workGroupId, workGroupName };
}

function persona(
  id: string,
  permissions: readonly PermissionCode[],
  isActive = true,
): PersonRef {
  return { id, displayName: `Persona ${id.slice(0, 8)}`, isActive, permissions };
}

function grupo(id: string, name: string, activeMemberIds: readonly string[]): WorkGroupSnapshot {
  return { id, name, activeMemberIds };
}

function montar(options?: {
  readonly ordenDeEstados?: readonly OrderStatus[];
  readonly transitionResults?: readonly TransitionResult[];
  readonly ids?: readonly string[];
  readonly filas?: readonly AssignmentRow[];
  readonly snapshots?: readonly (WorkGroupSnapshot | null)[];
  readonly personas?: readonly PersonRef[];
  readonly appendFalla?: boolean;
}): Dobles {
  const estados = [...(options?.ordenDeEstados ?? ['EN_CURSO'])];
  const resultados = [...(options?.transitionResults ?? ['ok' as const])];
  const snapshots = [...(options?.snapshots ?? [])];

  const listOrderIdsByUserInCompany = vi.fn(async () => options?.ids ?? [PEDIDO]);
  const findAliveById = vi.fn(async () => ({ id: PEDIDO, status: estados.shift() ?? 'ENTREGADO' }));
  const listAliveSummariesByIds = vi.fn(async () => ({
    items: [{ id: PEDIDO, number: NUMERO_PEDIDO, recipeId: 'receta-1', quantity: '10.0000', priority: 'MEDIA', status: 'EN_CURSO' }],
    total: 1,
    page: 1,
    pageSize: 1,
    totalPages: 1,
  }));
  const transitionAliveById = vi.fn(async () => resultados.shift() ?? 'ok');
  const listByOrderInCompany = vi.fn(async () => options?.filas ?? []);
  const insertMissing = vi.fn(async () => 1);
  const deleteOne = vi.fn(async () => 'ok' as const);
  const findAliveRefsInCompany = vi.fn(async () => options?.personas ?? []);
  const findSnapshotAliveInCompany = vi.fn(async () => snapshots.shift() ?? null);
  const anotaciones: Anotacion[] = [];
  let dentroDeRun = false;
  const append = vi.fn(async (entry: NewExecutionEntry) => {
    if (options?.appendFalla === true) throw new Error('la base no acepto la anotacion');
    anotaciones.push({ entry, dentroDeRun });
  });
  const log: ExecutionLogRepository = { append, findLastStepPosition: vi.fn(async () => null) };
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

  const deps: FinishAssignedOrderDeps = {
    assignments: {
      insertMissing,
      listByOrderInCompany,
      listByOrdersInCompany: vi.fn(),
      deleteOne,
      deleteByWorkGroup: vi.fn(),
      listOrderIdsByUserInCompany,
    } as unknown as OrderAssignmentRepository,
    orders: {
      findAliveById,
      listAliveSummariesByIds,
      transitionAliveById,
    } as unknown as OrderCatalog,
    people: { findAliveRefsInCompany } as unknown as PeopleDirectory,
    groups: { findSnapshotAliveInCompany } as unknown as WorkGroupDirectory,
    log,
    transaction: { run } as unknown as ExecutionTransaction,
    now: () => new Date('2026-09-17T12:00:00.000Z'),
  };

  return {
    deps,
    listOrderIdsByUserInCompany,
    findAliveById,
    listAliveSummariesByIds,
    transitionAliveById,
    listByOrderInCompany,
    insertMissing,
    deleteOne,
    findAliveRefsInCompany,
    findSnapshotAliveInCompany,
    append,
    run,
    anotaciones,
  };
}

describe('finishAssignedOrder — autorizacion', () => {
  it('R5: exige `asignaciones.ejecutar` ANTES de tocar ningun puerto', async () => {
    const { deps, listOrderIdsByUserInCompany, findAliveById, transitionAliveById } = montar();
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(
      finishAssignedOrder({ id: ANA, companyId: EMPRESA, permissions: [] }, ENTRADA),
    ).rejects.toThrow(UnauthorizedError);
    expect(listOrderIdsByUserInCompany).not.toHaveBeenCalled();
    expect(findAliveById).not.toHaveBeenCalled();
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  it('rechaza sin actor, sin tocar ningun puerto', async () => {
    const { deps, transitionAliveById } = montar();
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(null, ENTRADA)).rejects.toBeInstanceOf(AsignacionesError);
    expect(transitionAliveById).not.toHaveBeenCalled();
  });
});

describe('finishAssignedOrder — R6: no es tuyo', () => {
  it('un pedido no asignado a quien lo pide rechaza con `order_not_found`, sin leer el pedido', async () => {
    const { deps, findAliveById } = montar({ ids: [] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, ENTRADA)).rejects.toMatchObject({
      code: 'order_not_found',
    });
    expect(findAliveById).not.toHaveBeenCalled();
  });
});

describe('finishAssignedOrder — R5: EN_CURSO transiciona a POR_EMPACAR', () => {
  it('llama a `transitionAliveById` con el estado leido y `POR_EMPACAR`', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['EN_CURSO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, ENTRADA);

    expect(transitionAliveById).toHaveBeenCalledWith(
      PEDIDO,
      EMPRESA,
      'EN_CURSO',
      'POR_EMPACAR',
      ANA,
      new Date('2026-09-17T12:00:00.000Z'),
    );
  });

  it('sin `stale`, resuelve con una sola llamada de transicion', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['EN_CURSO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, ENTRADA);

    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });
});

describe('finishAssignedOrder — `stale`: relee y reintenta contra el estado real', () => {
  it('si `transitionAliveById` devuelve `stale`, relee y reintenta sin lanzar un error visible', async () => {
    const { deps, findAliveById, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO', 'EN_CURSO'],
      transitionResults: ['stale', 'ok'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, ENTRADA)).resolves.toEqual({
      numberText: '2026-0000007',
    });
    expect(findAliveById).toHaveBeenCalledTimes(2);
    expect(transitionAliveById).toHaveBeenCalledTimes(2);
  });
});

describe('finishAssignedOrder — confirmacion: devuelve el numero, leido ANTES de transicionar', () => {
  it('resuelve con el `numberText` formateado del pedido, sin envases ni producto (R16)', async () => {
    const { deps } = montar({ ordenDeEstados: ['EN_CURSO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, ENTRADA)).resolves.toEqual({
      numberText: '2026-0000007',
    });
  });

  it('lee el numero ANTES de transicionar: el pedido ya no aparece en los estados de trabajo despues de POR_EMPACAR', async () => {
    const { deps, listAliveSummariesByIds, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, ENTRADA);

    const [ordenLectura] = listAliveSummariesByIds.mock.invocationCallOrder;
    const [ordenTransicion] = transitionAliveById.mock.invocationCallOrder;
    expect(ordenLectura).toBeLessThan(ordenTransicion as number);
  });
});

describe('finishAssignedOrder — R10: solo EN_CURSO admite un Finalizar', () => {
  it('ENTREGADO rechaza con `order_delivered_frozen` sin escribir', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['ENTREGADO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, ENTRADA)).rejects.toBeInstanceOf(
      OrderDeliveredFrozenError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  it('CANCELADO rechaza con `order_cancelled_not_assignable` sin escribir', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['CANCELADO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, ENTRADA)).rejects.toBeInstanceOf(
      OrderCancelledNotAssignableError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  it('POR_EMPACAR rechaza con `order_produced_frozen` sin escribir -un segundo Finalizar no da segundo lote-', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['POR_EMPACAR'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, ENTRADA)).rejects.toBeInstanceOf(
      OrderProducedFrozenError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  it('EN_EMPAQUE rechaza con `order_produced_frozen` sin escribir', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['EN_EMPAQUE'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, ENTRADA)).rejects.toBeInstanceOf(
      OrderProducedFrozenError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  for (const estado of ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'] as const) {
    it(`R21, R30 (QC-215): ${estado} rechaza con el mismo error que EN_EMPAQUE, sin escribir ni anotar`, async () => {
      const empaque = montar({ ordenDeEstados: ['EN_EMPAQUE'] });
      const errorEmpaque = await createFinishAssignedOrder(empaque.deps)(ACTOR, ENTRADA).catch((e: unknown) => e);
      const { deps, transitionAliveById, append } = montar({ ordenDeEstados: [estado] });

      const error = await createFinishAssignedOrder(deps)(ACTOR, ENTRADA).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(OrderProducedFrozenError);
      expect((error as OrderProducedFrozenError).code).toBe((errorEmpaque as OrderProducedFrozenError).code);
      expect(transitionAliveById).not.toHaveBeenCalled();
      expect(append).not.toHaveBeenCalled();
    });
  }

  it('PENDIENTE rechaza con `invalid_transition` sin escribir (A-1)', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['PENDIENTE'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, ENTRADA)).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
  });
});

describe('finishAssignedOrder — QC-141: el Finalizar traduce lo que devuelve el consumo', () => {
  it('R27, R30, R31: `insufficient_material` se traduce a MaterialShortageError, sin reintentar', async () => {
    const { deps, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO'],
      transitionResults: ['insufficient_material'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, ENTRADA)).rejects.toBeInstanceOf(
      MaterialShortageError,
    );
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });

  it('R50: `recipe_without_lines` se traduce a RecipeWithoutLinesError, sin reintentar', async () => {
    const { deps, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO'],
      transitionResults: ['recipe_without_lines'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, ENTRADA)).rejects.toBeInstanceOf(
      RecipeWithoutLinesError,
    );
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });

  // R15, R16: `transitionAliveById` yendo a `POR_EMPACAR` ya no puede devolver
  // `presentation_without_content`, `no_whole_package` ni `recipe_not_found` -esos tres
  // resultados solo existian para el alta de producto terminado, que se traslado a Terminar el
  // empaque-, asi que los tres casos que los traducian se retiran de este archivo.
});

// Nota 2026-10-06 (QC-82 R21): la entrada gana `stepPosition`, la posicion del paso en que se
// finaliza; sigue rechazando cualquier dato de lo marcado.
describe('finishAssignedOrder — R16: no admite ningun dato de marcado', () => {
  it('la firma solo acepta el actor y el identificador del pedido: sin un tercer parametro', () => {
    const { deps } = montar();
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    expect(finishAssignedOrder.length).toBe(2);
  });

  it('un `input` con datos de marcado no cambia el resultado: el esquema estricto los rechaza', async () => {
    const { deps } = montar({ ordenDeEstados: ['EN_CURSO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(
      finishAssignedOrder(ACTOR, { ...ENTRADA, checkedItems: ['a', 'b'] } as unknown),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

const PERMISO_EMPAQUE: PermissionCode = 'empaque.modificar';
const PERMISO_OPERARIO: PermissionCode = 'asignaciones.consultar';

describe('finishAssignedOrder — auto-asignacion del empacador', () => {
  it('R1: un empacador del equipo vinculado sin fila queda asignado con el origen del grupo', async () => {
    const { deps, insertMissing, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO'],
      filas: [filaDeGrupo(OPERARIO, GRUPO, 'Turno noche')],
      snapshots: [grupo(GRUPO, 'Turno noche', [OPERARIO, EMPACADOR])],
      personas: [
        persona(OPERARIO, [PERMISO_OPERARIO]),
        persona(EMPACADOR, [PERMISO_OPERARIO, PERMISO_EMPAQUE]),
      ],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, ENTRADA);

    expect(insertMissing).toHaveBeenCalledTimes(1);
    expect(insertMissing).toHaveBeenCalledWith(
      [
        {
          orderId: PEDIDO,
          userId: EMPACADOR,
          companyId: EMPRESA,
          workGroupId: GRUPO,
          workGroupName: 'Turno noche',
        },
      ],
      new Date('2026-09-17T12:00:00.000Z'),
    );
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });

  it('R1: a todos los encontrados, no solo al primero', async () => {
    const { deps, insertMissing } = montar({
      ordenDeEstados: ['EN_CURSO'],
      filas: [filaDeGrupo(OPERARIO, GRUPO, 'Turno noche')],
      snapshots: [grupo(GRUPO, 'Turno noche', [OPERARIO, EMPACADOR, OTRO_EMPACADOR])],
      personas: [
        persona(OPERARIO, [PERMISO_OPERARIO]),
        persona(OTRO_EMPACADOR, [PERMISO_EMPAQUE]),
        persona(EMPACADOR, [PERMISO_EMPAQUE]),
      ],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, ENTRADA);

    expect(insertMissing).toHaveBeenCalledTimes(1);
    const filas = insertMissing.mock.calls[0]?.[0] as readonly { userId: string }[];
    expect(filas.map((fila) => fila.userId).sort()).toEqual([EMPACADOR, OTRO_EMPACADOR].sort());
  });

  it('R1: una persona suelta con permiso de empaque ya asignada no se reinserta', async () => {
    const { deps, insertMissing } = montar({
      ordenDeEstados: ['EN_CURSO'],
      filas: [filaSuelta(OPERARIO), filaSuelta(EMPACADOR)],
      personas: [
        persona(OPERARIO, [PERMISO_OPERARIO]),
        persona(EMPACADOR, [PERMISO_OPERARIO, PERMISO_EMPAQUE]),
      ],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, ENTRADA);

    expect(insertMissing).not.toHaveBeenCalled();
  });

  it('R2: sin empacadores vinculados no se escribe nada', async () => {
    const { deps, insertMissing, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO'],
      filas: [filaDeGrupo(OPERARIO, GRUPO, 'Turno noche')],
      snapshots: [grupo(GRUPO, 'Turno noche', [OPERARIO])],
      personas: [persona(OPERARIO, [PERMISO_OPERARIO])],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, ENTRADA);

    expect(insertMissing).not.toHaveBeenCalled();
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });

  it('R2: sin responsables no se toca ni el directorio ni la escritura', async () => {
    const { deps, insertMissing, findAliveRefsInCompany, findSnapshotAliveInCompany } = montar({
      ordenDeEstados: ['EN_CURSO'],
      filas: [],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, ENTRADA);

    expect(findSnapshotAliveInCompany).not.toHaveBeenCalled();
    expect(findAliveRefsInCompany).not.toHaveBeenCalled();
    expect(insertMissing).not.toHaveBeenCalled();
  });

  it('R3: decide por el permiso, nunca por el nombre del rol', async () => {
    const { deps, insertMissing } = montar({
      ordenDeEstados: ['EN_CURSO'],
      // OPERARIO trae todos los permisos menos el de empaque: aunque se llamara Empacador,
      // sin el codigo no es candidato.
      filas: [filaSuelta(OPERARIO)],
      personas: [persona(OPERARIO, [PERMISO_OPERARIO, 'terminados.consultar'])],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, ENTRADA);

    expect(insertMissing).not.toHaveBeenCalled();
  });

  it('R3: un empacador inactivo no se asigna', async () => {
    const { deps, insertMissing } = montar({
      ordenDeEstados: ['EN_CURSO'],
      filas: [filaDeGrupo(OPERARIO, GRUPO, 'Turno noche')],
      snapshots: [grupo(GRUPO, 'Turno noche', [OPERARIO, EMPACADOR])],
      personas: [
        persona(OPERARIO, [PERMISO_OPERARIO]),
        persona(EMPACADOR, [PERMISO_OPERARIO, PERMISO_EMPAQUE], false),
      ],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, ENTRADA);

    expect(insertMissing).not.toHaveBeenCalled();
  });

  it('R4: el nombre congelado es el vivo del snapshot, no el de la fila vieja', async () => {
    const { deps, insertMissing } = montar({
      ordenDeEstados: ['EN_CURSO'],
      filas: [filaDeGrupo(OPERARIO, GRUPO, 'Turno viejo')],
      snapshots: [grupo(GRUPO, 'Turno nuevo', [OPERARIO, EMPACADOR])],
      personas: [
        persona(OPERARIO, [PERMISO_OPERARIO]),
        persona(EMPACADOR, [PERMISO_EMPAQUE]),
      ],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, ENTRADA);

    expect(insertMissing).toHaveBeenCalledWith(
      [
        {
          orderId: PEDIDO,
          userId: EMPACADOR,
          companyId: EMPRESA,
          workGroupId: GRUPO,
          workGroupName: 'Turno nuevo',
        },
      ],
      expect.any(Date),
    );
  });

  it('R6: si la transicion falla, compensa lo creado y propaga el error original', async () => {
    const { deps, insertMissing, deleteOne } = montar({
      ordenDeEstados: ['EN_CURSO'],
      transitionResults: ['insufficient_material'],
      filas: [filaDeGrupo(OPERARIO, GRUPO, 'Turno noche')],
      snapshots: [grupo(GRUPO, 'Turno noche', [OPERARIO, EMPACADOR])],
      personas: [
        persona(OPERARIO, [PERMISO_OPERARIO]),
        persona(EMPACADOR, [PERMISO_EMPAQUE]),
      ],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, ENTRADA)).rejects.toBeInstanceOf(
      MaterialShortageError,
    );
    expect(insertMissing).toHaveBeenCalledTimes(1);
    expect(deleteOne).toHaveBeenCalledTimes(1);
    expect(deleteOne).toHaveBeenCalledWith(EMPRESA, PEDIDO, EMPACADOR);
  });

  it('R6: si la transicion falla sin nada creado, no hay compensacion', async () => {
    const { deps, deleteOne } = montar({
      ordenDeEstados: ['EN_CURSO'],
      transitionResults: ['insufficient_material'],
      filas: [filaSuelta(OPERARIO)],
      personas: [persona(OPERARIO, [PERMISO_OPERARIO])],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, ENTRADA)).rejects.toBeInstanceOf(
      MaterialShortageError,
    );
    expect(deleteOne).not.toHaveBeenCalled();
  });

  it('R7: el reintento `stale` no repite el auto-asignado', async () => {
    const { deps, listByOrderInCompany, insertMissing, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO', 'EN_CURSO'],
      transitionResults: ['stale', 'ok'],
      filas: [filaDeGrupo(OPERARIO, GRUPO, 'Turno noche')],
      snapshots: [grupo(GRUPO, 'Turno noche', [OPERARIO, EMPACADOR])],
      personas: [
        persona(OPERARIO, [PERMISO_OPERARIO]),
        persona(EMPACADOR, [PERMISO_EMPAQUE]),
      ],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, ENTRADA);

    expect(transitionAliveById).toHaveBeenCalledTimes(2);
    expect(listByOrderInCompany).toHaveBeenCalledTimes(1);
    expect(insertMissing).toHaveBeenCalledTimes(1);
  });

  it('R8: un rechazo previo no lee ni escribe asignaciones nuevas', async () => {
    const { deps, listByOrderInCompany, insertMissing, transitionAliveById } = montar({
      ordenDeEstados: ['PENDIENTE'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, ENTRADA)).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    expect(listByOrderInCompany).not.toHaveBeenCalled();
    expect(insertMissing).not.toHaveBeenCalled();
    expect(transitionAliveById).not.toHaveBeenCalled();
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

describe('finishAssignedOrder — exige `asignaciones.ejecutar`', () => {
  it.each(SIN_EJECUTAR)('R7, R7a: con %s rechaza con `unauthorized` sin invocar ningun puerto', async (_caso, permissions) => {
    const { deps } = montar({ ordenDeEstados: ['EN_CURSO'] });

    await expect(
      createFinishAssignedOrder(deps)({ id: ANA, companyId: EMPRESA, permissions }, ENTRADA),
    ).rejects.toThrow(UnauthorizedError);
    for (const doble of doblesDe(deps)) expect(doble).not.toHaveBeenCalled();
  });

  it('R7: sin el permiso rechaza antes de validar la entrada', async () => {
    const { deps } = montar({ ordenDeEstados: ['EN_CURSO'] });

    await expect(
      createFinishAssignedOrder(deps)(
        { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.consultar'] },
        { orderId: 'no-es-un-uuid' },
      ),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('R7b: con solo `asignaciones.ejecutar` terminar resuelve igual que con el conjunto del Operador', async () => {
    const soloEjecutar: Actor = { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.ejecutar'] };
    const conEjecutar = montar({ ordenDeEstados: ['EN_CURSO'] });
    const deReferencia = montar({ ordenDeEstados: ['EN_CURSO'] });

    const resultado = await createFinishAssignedOrder(conEjecutar.deps)(soloEjecutar, ENTRADA);
    const referencia = await createFinishAssignedOrder(deReferencia.deps)(ACTOR, ENTRADA);

    expect(resultado).toEqual(referencia);
  });
});

const AHORA = new Date('2026-09-17T12:00:00.000Z');

describe('QC-82 — finishAssignedOrder: anota `finish` en la misma transaccion', () => {
  it('R21: anota un `finish` con la posicion recibida y el mismo `now` que la transicion, DENTRO de `run`', async () => {
    const { deps, run, transitionAliveById, anotaciones } = montar({ ordenDeEstados: ['EN_CURSO'] });

    await createFinishAssignedOrder(deps)(ACTOR, { orderId: PEDIDO, stepPosition: 5 });

    expect(run).toHaveBeenCalledTimes(1);
    expect(transitionAliveById).toHaveBeenCalledWith(PEDIDO, EMPRESA, 'EN_CURSO', 'POR_EMPACAR', ANA, AHORA);
    expect(anotaciones).toEqual([
      {
        entry: {
          action: 'finish',
          companyId: EMPRESA,
          orderId: PEDIDO,
          userId: ANA,
          stepPosition: 5,
          occurredAt: AHORA,
        },
        dentroDeRun: true,
      },
    ]);
  });

  it('R21: el destino de la transicion es `POR_EMPACAR`, nunca `ENTREGADO`', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['EN_CURSO'] });

    await createFinishAssignedOrder(deps)(ACTOR, ENTRADA);

    const destinos = transitionAliveById.mock.calls.map((call: unknown[]) => call[3]);
    expect(destinos).toEqual(['POR_EMPACAR']);
    expect(destinos).not.toContain('ENTREGADO');
  });

  it('R5: una receta sin pasos finaliza con `stepPosition: null`', async () => {
    const { deps, anotaciones } = montar({ ordenDeEstados: ['EN_CURSO'] });

    await createFinishAssignedOrder(deps)(ACTOR, { orderId: PEDIDO, stepPosition: null });

    expect(anotaciones.map(({ entry }) => entry.stepPosition)).toEqual([null]);
  });

  it.each([
    ['sin `stepPosition`', { orderId: PEDIDO }],
    ['`stepPosition` 0', { orderId: PEDIDO, stepPosition: 0 }],
    ['`stepPosition` decimal', { orderId: PEDIDO, stepPosition: 1.5 }],
    ['`stepPosition` en texto', { orderId: PEDIDO, stepPosition: '3' }],
  ])('R21: la entrada estricta rechaza %s con `invalid_input` sin escribir', async (_caso, entrada) => {
    const { deps, run, insertMissing } = montar({ ordenDeEstados: ['EN_CURSO'] });

    await expect(createFinishAssignedOrder(deps)(ACTOR, entrada)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    expect(run).not.toHaveBeenCalled();
    expect(insertMissing).not.toHaveBeenCalled();
  });
});

describe('QC-82 — finishAssignedOrder: R24, nada a medias', () => {
  it.each([
    ['insufficient_material', MaterialShortageError],
    ['recipe_without_lines', RecipeWithoutLinesError],
  ] as const)('R24: `%s` se lanza DENTRO de `run`, con cero `append`, y sale como su error', async (resultado, Clase) => {
    const { deps, run, append } = montar({ ordenDeEstados: ['EN_CURSO'], transitionResults: [resultado] });

    await expect(createFinishAssignedOrder(deps)(ACTOR, ENTRADA)).rejects.toBeInstanceOf(Clase);
    await expect(run.mock.results[0]?.value).rejects.toBeInstanceOf(ExecutionAbortedError);
    expect(append).not.toHaveBeenCalled();
  });

  it('R24: `not_found` aborta dentro de `run` y sale como `order_not_found`', async () => {
    const { deps, run, append } = montar({ ordenDeEstados: ['EN_CURSO'], transitionResults: ['not_found'] });

    await expect(createFinishAssignedOrder(deps)(ACTOR, ENTRADA)).rejects.toMatchObject({
      code: 'order_not_found',
    });
    await expect(run.mock.results[0]?.value).rejects.toBeInstanceOf(ExecutionAbortedError);
    expect(append).not.toHaveBeenCalled();
  });

  it('R24: `stale` aborta la vuelta sin anotar y la siguiente anota un solo `finish`', async () => {
    const { deps, run, anotaciones } = montar({
      ordenDeEstados: ['EN_CURSO', 'EN_CURSO'],
      transitionResults: ['stale', 'ok'],
    });

    await createFinishAssignedOrder(deps)(ACTOR, ENTRADA);

    expect(run).toHaveBeenCalledTimes(2);
    await expect(run.mock.results[0]?.value).rejects.toBeInstanceOf(ExecutionAbortedError);
    expect(anotaciones.map(({ entry }) => entry.action)).toEqual(['finish']);
  });

  it('R24: si `append` lanza, se propaga desde dentro de `run` y se borra cada fila de empacador creada', async () => {
    const { deps, run, insertMissing, deleteOne } = montar({
      ordenDeEstados: ['EN_CURSO'],
      filas: [filaDeGrupo(OPERARIO, GRUPO, 'Turno noche')],
      snapshots: [grupo(GRUPO, 'Turno noche', [OPERARIO, EMPACADOR, OTRO_EMPACADOR])],
      personas: [
        persona(OPERARIO, [PERMISO_OPERARIO]),
        persona(EMPACADOR, [PERMISO_EMPAQUE]),
        persona(OTRO_EMPACADOR, [PERMISO_EMPAQUE]),
      ],
      appendFalla: true,
    });

    await expect(createFinishAssignedOrder(deps)(ACTOR, ENTRADA)).rejects.toThrow(
      'la base no acepto la anotacion',
    );
    await expect(run.mock.results[0]?.value).rejects.toThrow('la base no acepto la anotacion');
    expect(insertMissing).toHaveBeenCalledTimes(1);
    expect(deleteOne).toHaveBeenCalledTimes(2);
    expect(deleteOne).toHaveBeenCalledWith(EMPRESA, PEDIDO, EMPACADOR);
    expect(deleteOne).toHaveBeenCalledWith(EMPRESA, PEDIDO, OTRO_EMPACADOR);
  });

  it('R24: el auto-asignado corre ANTES y FUERA de `run`, una sola vez', async () => {
    const { deps, run, insertMissing } = montar({
      ordenDeEstados: ['EN_CURSO', 'EN_CURSO'],
      transitionResults: ['stale', 'ok'],
      filas: [filaDeGrupo(OPERARIO, GRUPO, 'Turno noche')],
      snapshots: [grupo(GRUPO, 'Turno noche', [OPERARIO, EMPACADOR])],
      personas: [persona(OPERARIO, [PERMISO_OPERARIO]), persona(EMPACADOR, [PERMISO_EMPAQUE])],
    });

    await createFinishAssignedOrder(deps)(ACTOR, ENTRADA);

    expect(insertMissing).toHaveBeenCalledTimes(1);
    const [insercion] = insertMissing.mock.invocationCallOrder;
    const [primeraTransaccion] = run.mock.invocationCallOrder;
    expect(insercion).toBeLessThan(primeraTransaccion as number);
  });
});

describe('QC-82 — finishAssignedOrder: el prologo no cambia', () => {
  it('R26: con solo `asignaciones.consultar` rechaza sin abrir la transaccion ni anotar', async () => {
    const { deps, run, append } = montar({ ordenDeEstados: ['EN_CURSO'] });

    await expect(
      createFinishAssignedOrder(deps)(
        { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.consultar'] },
        ENTRADA,
      ),
    ).rejects.toThrow(UnauthorizedError);
    expect(run).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });
});
