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
  NoWholePackageError,
  OrderCancelledNotAssignableError,
  OrderDeliveredFrozenError,
  OrderProducedFrozenError,
  PresentationWithoutContentError,
  RecipeNotFoundError,
  RecipeWithoutLinesError,
  UnauthorizedError,
} from '@/lib/modules/asignaciones/domain/errors';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
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

const ACTOR: Actor = { id: ANA, companyId: EMPRESA, permissions: ['asignaciones.consultar'] };

const NUMERO_PEDIDO = { year: 2026, sequence: 7 };

/** El exito por defecto de `transitionAliveById` yendo a `POR_EMPACAR`: un objeto
 *  con el lote de producto terminado que entro, no el literal `'ok'` -ese solo sale de una
 *  transicion que no es `POR_EMPACAR`, y `finishAssignedOrder` siempre pide esa-. */
const OK_CON_PRODUCCION = {
  kind: 'ok' as const,
  finishedGoods: { productName: 'Desengrasante industrial · Botella 1L', packages: '5' },
};

type TransitionResult =
  | typeof OK_CON_PRODUCCION
  | 'not_found'
  | 'stale'
  | 'insufficient_material'
  | 'recipe_without_lines'
  | 'presentation_without_content'
  | 'no_whole_package'
  | 'recipe_not_found';

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
};

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
}): Dobles {
  const estados = [...(options?.ordenDeEstados ?? ['EN_CURSO'])];
  const resultados = [...(options?.transitionResults ?? [OK_CON_PRODUCCION])];
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
  const transitionAliveById = vi.fn(async () => resultados.shift() ?? OK_CON_PRODUCCION);
  const listByOrderInCompany = vi.fn(async () => options?.filas ?? []);
  const insertMissing = vi.fn(async () => 1);
  const deleteOne = vi.fn(async () => 'ok' as const);
  const findAliveRefsInCompany = vi.fn(async () => options?.personas ?? []);
  const findSnapshotAliveInCompany = vi.fn(async () => snapshots.shift() ?? null);

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
  };
}

describe('finishAssignedOrder — autorizacion', () => {
  it('R5: exige `asignaciones.consultar` ANTES de tocar ningun puerto', async () => {
    const { deps, listOrderIdsByUserInCompany, findAliveById, transitionAliveById } = montar();
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(
      finishAssignedOrder({ id: ANA, companyId: EMPRESA, permissions: [] }, { orderId: PEDIDO }),
    ).rejects.toThrow(UnauthorizedError);
    expect(listOrderIdsByUserInCompany).not.toHaveBeenCalled();
    expect(findAliveById).not.toHaveBeenCalled();
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  it('rechaza sin actor, sin tocar ningun puerto', async () => {
    const { deps, transitionAliveById } = montar();
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(null, { orderId: PEDIDO })).rejects.toBeInstanceOf(AsignacionesError);
    expect(transitionAliveById).not.toHaveBeenCalled();
  });
});

describe('finishAssignedOrder — R6: no es tuyo', () => {
  it('un pedido no asignado a quien lo pide rechaza con `order_not_found`, sin leer el pedido', async () => {
    const { deps, findAliveById } = montar({ ids: [] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toMatchObject({
      code: 'order_not_found',
    });
    expect(findAliveById).not.toHaveBeenCalled();
  });
});

describe('finishAssignedOrder — R5: EN_CURSO transiciona a POR_EMPACAR', () => {
  it('llama a `transitionAliveById` con el estado leido y `POR_EMPACAR`', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['EN_CURSO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

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

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });
});

describe('finishAssignedOrder — `stale`: relee y reintenta contra el estado real', () => {
  it('si `transitionAliveById` devuelve `stale`, relee y reintenta sin lanzar un error visible', async () => {
    const { deps, findAliveById, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO', 'EN_CURSO'],
      transitionResults: ['stale', OK_CON_PRODUCCION],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).resolves.toEqual({
      numberText: '2026-0000007',
      productName: OK_CON_PRODUCCION.finishedGoods.productName,
      packages: OK_CON_PRODUCCION.finishedGoods.packages,
    });
    expect(findAliveById).toHaveBeenCalledTimes(2);
    expect(transitionAliveById).toHaveBeenCalledTimes(2);
  });
});

describe('finishAssignedOrder — confirmacion: devuelve el numero, leido ANTES de transicionar', () => {
  it('resuelve con el `numberText` formateado del pedido', async () => {
    const { deps } = montar({ ordenDeEstados: ['EN_CURSO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).resolves.toEqual({
      numberText: '2026-0000007',
      productName: OK_CON_PRODUCCION.finishedGoods.productName,
      packages: OK_CON_PRODUCCION.finishedGoods.packages,
    });
  });

  it('R24: el exito lleva el producto y los envases del lote de producto terminado que entro', async () => {
    const { deps } = montar({
      ordenDeEstados: ['EN_CURSO'],
      transitionResults: [{ kind: 'ok', finishedGoods: { productName: 'Acido citrico 50% · Bidon 20L', packages: '3' } }],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).resolves.toEqual({
      numberText: '2026-0000007',
      productName: 'Acido citrico 50% · Bidon 20L',
      packages: '3',
    });
  });

  it('lee el numero ANTES de transicionar: el pedido ya no aparece en los estados de trabajo despues de POR_EMPACAR', async () => {
    const { deps, listAliveSummariesByIds, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

    const [ordenLectura] = listAliveSummariesByIds.mock.invocationCallOrder;
    const [ordenTransicion] = transitionAliveById.mock.invocationCallOrder;
    expect(ordenLectura).toBeLessThan(ordenTransicion as number);
  });
});

describe('finishAssignedOrder — R10: solo EN_CURSO admite un Finalizar', () => {
  it('ENTREGADO rechaza con `order_delivered_frozen` sin escribir', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['ENTREGADO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderDeliveredFrozenError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  it('CANCELADO rechaza con `order_cancelled_not_assignable` sin escribir', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['CANCELADO'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderCancelledNotAssignableError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  it('POR_EMPACAR rechaza con `order_produced_frozen` sin escribir -un segundo Finalizar no da segundo lote-', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['POR_EMPACAR'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderProducedFrozenError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  it('EN_EMPAQUE rechaza con `order_produced_frozen` sin escribir', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['EN_EMPAQUE'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      OrderProducedFrozenError,
    );
    expect(transitionAliveById).not.toHaveBeenCalled();
  });

  it('PENDIENTE rechaza con `invalid_transition` sin escribir (A-1)', async () => {
    const { deps, transitionAliveById } = montar({ ordenDeEstados: ['PENDIENTE'] });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
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

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
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

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      RecipeWithoutLinesError,
    );
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });

  it('R18: `presentation_without_content` se traduce a PresentationWithoutContentError, sin reintentar', async () => {
    const { deps, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO'],
      transitionResults: ['presentation_without_content'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      PresentationWithoutContentError,
    );
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });

  it('R19: `no_whole_package` se traduce a NoWholePackageError, sin reintentar', async () => {
    const { deps, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO'],
      transitionResults: ['no_whole_package'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      NoWholePackageError,
    );
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });

  it('D24: `recipe_not_found` se traduce a RecipeNotFoundError, sin reintentar', async () => {
    const { deps, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO'],
      transitionResults: ['recipe_not_found'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      RecipeNotFoundError,
    );
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });
});

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
      finishAssignedOrder(ACTOR, { orderId: PEDIDO, checkedItems: ['a', 'b'] } as unknown),
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

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

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

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

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

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

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

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

    expect(insertMissing).not.toHaveBeenCalled();
    expect(transitionAliveById).toHaveBeenCalledTimes(1);
  });

  it('R2: sin responsables no se toca ni el directorio ni la escritura', async () => {
    const { deps, insertMissing, findAliveRefsInCompany, findSnapshotAliveInCompany } = montar({
      ordenDeEstados: ['EN_CURSO'],
      filas: [],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

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

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

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

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

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

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

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

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
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

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      MaterialShortageError,
    );
    expect(deleteOne).not.toHaveBeenCalled();
  });

  it('R7: el reintento `stale` no repite el auto-asignado', async () => {
    const { deps, listByOrderInCompany, insertMissing, transitionAliveById } = montar({
      ordenDeEstados: ['EN_CURSO', 'EN_CURSO'],
      transitionResults: ['stale', OK_CON_PRODUCCION],
      filas: [filaDeGrupo(OPERARIO, GRUPO, 'Turno noche')],
      snapshots: [grupo(GRUPO, 'Turno noche', [OPERARIO, EMPACADOR])],
      personas: [
        persona(OPERARIO, [PERMISO_OPERARIO]),
        persona(EMPACADOR, [PERMISO_EMPAQUE]),
      ],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await finishAssignedOrder(ACTOR, { orderId: PEDIDO });

    expect(transitionAliveById).toHaveBeenCalledTimes(2);
    expect(listByOrderInCompany).toHaveBeenCalledTimes(1);
    expect(insertMissing).toHaveBeenCalledTimes(1);
  });

  it('R8: un rechazo previo no lee ni escribe asignaciones nuevas', async () => {
    const { deps, listByOrderInCompany, insertMissing, transitionAliveById } = montar({
      ordenDeEstados: ['PENDIENTE'],
    });
    const finishAssignedOrder = createFinishAssignedOrder(deps);

    await expect(finishAssignedOrder(ACTOR, { orderId: PEDIDO })).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    expect(listByOrderInCompany).not.toHaveBeenCalled();
    expect(insertMissing).not.toHaveBeenCalled();
    expect(transitionAliveById).not.toHaveBeenCalled();
  });
});
