// Dobles comunes de los tres casos de uso del acondicionador: el catalogo de pedidos y las
// dependencias de `composeOrderRows`, cada metodo un `vi.fn` que se puede inspeccionar.
import { vi } from 'vitest';

import type { Actor } from '@/lib/modules/asignaciones/domain/actor';
import type { ComposeOrderRowsDeps } from '@/lib/modules/asignaciones/domain/compose-order-rows';
import type {
  ConditioningTeamMemberRow,
  ConditioningTeamRepository,
} from '@/lib/modules/asignaciones/ports/conditioning-team-repository';
import type { OrderAssignmentRowWithOrder } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type { PersonRef } from '@/lib/modules/identity';
import type {
  FinishedBatchLabels,
  FinishedBatchOfOrderLine,
  PresentationCatalog,
  PresentationRef,
} from '@/lib/modules/inventario';
import type { AssignedOrderSummary, OrderCatalog, Page } from '@/lib/modules/pedidos';
import type { RecipeCatalog, RecipeRef } from '@/lib/modules/recetas';
import type { UnitCatalog, UnitRef } from '@/lib/modules/unidades';

export function uuid(seed: string): string {
  return `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
}

export const EMPRESA = uuid('3');
export const ANA = uuid('1');
export const BETO = uuid('2');
export const RECETA = uuid('a');
export const UNIDAD = uuid('b');
export const PEDIDO_1 = uuid('5');
export const PEDIDO_2 = uuid('6');
export const AHORA = new Date('2026-10-08T10:00:00.000Z');

export const ACONDICIONADOR: Actor = {
  id: ANA,
  companyId: EMPRESA,
  permissions: ['asignaciones.consultar', 'acondicionamiento.modificar'],
};

export function resumen(id: string, overrides?: Partial<AssignedOrderSummary>): AssignedOrderSummary {
  return {
    id,
    number: { year: 2026, sequence: 7 },
    recipeId: RECETA,
    quantity: '10.0000',
    priority: 'MEDIA',
    status: 'POR_ACONDICIONAR',
    presentationLines: [],
    unitId: UNIDAD,
    finishedAt: null,
    packedBy: BETO,
    conditionedBy: null,
    ...overrides,
  };
}

export function receta(overrides?: Partial<RecipeRef>): RecipeRef {
  return {
    id: RECETA,
    name: 'Jabon liquido',
    ownName: 'Jabon liquido',
    isUnderReview: false,
    original: null,
    isDeleted: false,
    ...overrides,
  };
}

export function persona(id: string, displayName: string): PersonRef {
  return { id, displayName, isActive: true, permissions: [] };
}

type Opciones = {
  readonly items?: readonly AssignedOrderSummary[];
  readonly total?: number;
  readonly refs?: readonly RecipeRef[];
  readonly rows?: readonly OrderAssignmentRowWithOrder[];
  readonly people?: readonly PersonRef[];
  readonly presentations?: readonly PresentationRef[];
  readonly units?: readonly UnitRef[];
  readonly team?: readonly ConditioningTeamMemberRow[];
  /** QC-219: los lotes de produccion del pedido que devuelve `listOfOrder`. */
  readonly batches?: readonly FinishedBatchOfOrderLine[];
};

function pagina(
  items: readonly AssignedOrderSummary[],
  total: number,
  page: number,
  pageSize?: number,
): Page<AssignedOrderSummary> {
  const size = pageSize ?? 10;
  return { items, total, page, pageSize: size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

export function montar(options?: Opciones) {
  const items = options?.items ?? [];
  const total = options?.total ?? items.length;

  // La firma lleva el filtro para que `mock.calls[n][5]` quede tipado; el doble no filtra.
  const listAliveSummariesInCompany = vi.fn(
    async (...args: [string, readonly string[], string, number, number?, unknown?]) =>
      pagina(items, total, args[3], args[4]),
  );
  const listAliveSummariesByIds = vi.fn(
    async (_companyId: string, _ids: readonly string[], _statuses: readonly string[], page: number, pageSize?: number) =>
      pagina(items, total, page, pageSize),
  );
  const listByOrdersInCompany = vi.fn(async () => options?.rows ?? []);
  const findRefsIncludingDeleted = vi.fn(async () => options?.refs ?? []);
  const findRefsIncludingDeletedInCompany = vi.fn(async () => options?.people ?? []);
  const findRefsPresentations = vi.fn(async () => options?.presentations ?? []);
  const findRefsUnits = vi.fn(async () => options?.units ?? []);
  const listTeamByOrderInCompany = vi.fn<ConditioningTeamRepository['listByOrderInCompany']>(async () => options?.team ?? []);
  const listOfOrder = vi.fn<FinishedBatchLabels['listOfOrder']>(async () => options?.batches ?? []);

  const deps = {
    assignments: {
      insertMissing: vi.fn(),
      listByOrderInCompany: vi.fn(),
      listByOrdersInCompany,
      deleteOne: vi.fn(),
      deleteByWorkGroup: vi.fn(),
      listOrderIdsByUserInCompany: vi.fn(),
    },
    orders: { listAliveSummariesInCompany, listAliveSummariesByIds } as unknown as OrderCatalog,
    recipes: { findRefsIncludingDeleted } as unknown as RecipeCatalog,
    people: { findRefsIncludingDeletedInCompany },
    presentations: { findRefs: findRefsPresentations } as unknown as PresentationCatalog,
    units: { findRefs: findRefsUnits } as unknown as UnitCatalog,
    team: { insertAll: vi.fn(), listByOrderInCompany: listTeamByOrderInCompany },
    batches: { listOfOrder },
    now: () => AHORA,
  } as unknown as ComposeOrderRowsDeps & {
    readonly orders: OrderCatalog;
    readonly team: ConditioningTeamRepository;
    readonly batches: Pick<FinishedBatchLabels, 'listOfOrder'>;
  };

  return {
    deps,
    listAliveSummariesInCompany,
    listAliveSummariesByIds,
    listByOrdersInCompany,
    findRefsIncludingDeleted,
    findRefsIncludingDeletedInCompany,
    findRefsPresentations,
    findRefsUnits,
    listTeamByOrderInCompany,
    listOfOrder,
    todos: [
      listAliveSummariesInCompany,
      listAliveSummariesByIds,
      listByOrdersInCompany,
      findRefsIncludingDeleted,
      findRefsIncludingDeletedInCompany,
      findRefsPresentations,
      findRefsUnits,
      listTeamByOrderInCompany,
      listOfOrder,
    ],
  };
}

/** Actores que no deben pasar: nulos, sin permisos y los permisos de semilla de cada rol sin el permiso. */
export function actoresSinElPermiso(seedPermissions: Readonly<Record<string, readonly string[]>>, roles: readonly string[]) {
  const sinPermiso: [string, Actor | null | undefined][] = [
    ['null', null],
    ['undefined', undefined],
    ['sin `permissions`', { id: ANA, companyId: EMPRESA } as unknown as Actor],
    ['permisos vacios', { id: ANA, companyId: EMPRESA, permissions: [] }],
  ];
  for (const rol of roles) {
    sinPermiso.push([`rol ${rol}`, { id: ANA, companyId: EMPRESA, permissions: seedPermissions[rol] ?? [] }]);
  }
  return sinPermiso;
}

/** QC-219: el lote de produccion de una linea; sin `conDatos`, con el lote automatico y sin fechas. */
export function loteDeLinea(
  presentationId: string,
  batchId: string,
  conDatos?: { readonly lot: string; readonly expiryDate: string; readonly productionDate: string },
): FinishedBatchOfOrderLine {
  return {
    batchId,
    orderPresentationLineId: `linea-${presentationId}`,
    presentationId,
    lot: conDatos?.lot ?? `AUTO-${presentationId}`,
    expiryDate: conDatos?.expiryDate ?? null,
    productionDate: conDatos?.productionDate ?? null,
  };
}
