// QC-102 T15 — Sin `asignaciones.modificar`, el panel en SOLO LECTURA: R28.
//
// R28 tiene DOS mitades y aqui estan las dos, porque por separado ninguna prueba lo que importa:
//
//   1. **La pantalla no monta ni un control de escritura** cuando `canWrite` es `false`. Es
//      presentacion: decide que se emite en el HTML.
//   2. **Y esa ocultacion NO es la barrera**: el caso de uso sigue rechazando la operacion. Esa
//      mitad ya esta demostrada por el test de autorizacion de QC-87, que este archivo **invoca
//      tal cual** (`import` de abajo) en vez de reescribirlo: duplicar su matriz aqui crearia una
//      segunda definicion de «quien puede asignar», libre de divergir de la primera en silencio
//      (R40: las reglas de QC-87 se consumen, no se reimplementan).
//
// `canWrite` baja **por props desde el servidor** (`design.md > 3.4`). Que el Server Component sea
// quien lo resuelve —y que sin el permiso ni siquiera pida los catalogos— lo afirma
// `order-list-section.test.tsx`; lo que se comprueba aqui es lo que el cliente hace con el.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_RESPONSIBLES_TESTID,
  ORDER_SHEET_RESPONSIBLES_TESTID,
  OrderResponsibles,
  OrderTable,
  RESPONSIBLE_CANDIDATES_EMPTY_TESTID,
  RESPONSIBLE_CANDIDATE_TESTID,
  RESPONSIBLE_CONFIRM_TESTID,
  RESPONSIBLE_GROUP_NAME_TESTID,
  RESPONSIBLE_PERSON_NAME_TESTID,
  RESPONSIBLE_PERSON_TESTID,
  RESPONSIBLE_REMOVE_GROUP_TESTID,
  RESPONSIBLE_REMOVE_PERSON_TESTID,
  RESPONSIBLE_SEARCH_TESTID,
  RESPONSIBLE_WORK_GROUPS_EMPTY_TESTID,
  RESPONSIBLE_WORK_GROUP_TESTID,
  type OrderResponsiblesCatalog,
  type RecipePickerPage,
} from '@/app/(private)/pedidos/components';
import type { DataTableParams } from '@/components/shared/data-table';
import type { OrderResponsible } from '@/lib/modules/asignaciones';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import { setupUser } from '../../helpers/user-event';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

// LA SEGUNDA MITAD DE R28, invocada y no reescrita: los casos de QC-87 corren tal cual estan en
// disco. Si alguien relajara `requirePermission` en `asignaciones`, esta suite se pone roja.
import '../asignaciones/authorization.test';

const { routerMock, accionesDeEscritura } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  /** Dobles que FALLAN: en solo lectura no hay manera de llegar a ninguna escritura. */
  accionesDeEscritura: {
    assign: vi.fn(() => {
      throw new Error('assignResponsiblesAction no debe invocarse en solo lectura');
    }),
    unassign: vi.fn(() => {
      throw new Error('unassignResponsibleAction no debe invocarse en solo lectura');
    }),
    removeGroup: vi.fn(() => {
      throw new Error('removeWorkGroupFromOrderAction no debe invocarse en solo lectura');
    }),
  },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => ({
  assignResponsiblesAction: accionesDeEscritura.assign,
  unassignResponsibleAction: accionesDeEscritura.unassign,
  removeWorkGroupFromOrderAction: accionesDeEscritura.removeGroup,
  listOrderResponsiblesAction: vi.fn(async () => ({ status: 'success', data: [] })),
  listResponsiblesForOrdersAction: vi.fn(async () => ({ status: 'success', data: [] })),
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse por abrir el panel`);
  };
  return {
    listOrdersAction: vi.fn(noDebeInvocarse('listOrdersAction')),
    getOrderAction: vi.fn(noDebeInvocarse('getOrderAction')),
    createOrderAction: vi.fn(noDebeInvocarse('createOrderAction')),
    updateOrderAction: vi.fn(noDebeInvocarse('updateOrderAction')),
    cancelOrderAction: vi.fn(noDebeInvocarse('cancelOrderAction')),
    deleteOrderAction: vi.fn(noDebeInvocarse('deleteOrderAction')),
  };
});

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipesAction: vi.fn(() => {
    throw new Error('listRecipesAction no debe invocarse: la primera pagina llega por props');
  }),
  getRecipeAction: vi.fn(async (id: string) => ({
    status: 'success' as const,
    data: {
      id,
      name: 'Esmalte azul',
      description: null,
      imageUrl: null,
      stepCount: 0,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: null,
      updatedBy: null,
      steps: [],
      lines: [],
    },
  })),
}));

const PEDIDO_ID = '11111111-1111-4111-8111-111111111111';
const TURNO = 'aaaaaaaa-0000-4000-8000-00000000aaaa';
const TURNO_NOMBRE = 'Turno de la mañana';

const RESPONSABLES: readonly OrderResponsible[] = [
  { userId: 'u-0', displayName: 'Ana Torres', origin: { kind: 'direct' } },
  {
    userId: 'u-1',
    displayName: 'Bruno Diaz',
    origin: { kind: 'workGroup', workGroupId: TURNO, workGroupName: TURNO_NOMBRE },
  },
];

/**
 * Lo que el servidor baja a quien NO tiene `asignaciones.modificar`: sin escritura y **sin
 * catalogos**, porque no hay ningun control que alimentar.
 */
const CATALOGO_SOLO_LECTURA: OrderResponsiblesCatalog = {
  canWrite: false,
  people: [],
  workGroups: [],
};

const CONTROLES_DE_ESCRITURA = [
  RESPONSIBLE_SEARCH_TESTID,
  RESPONSIBLE_CANDIDATE_TESTID,
  RESPONSIBLE_WORK_GROUP_TESTID,
  RESPONSIBLE_CONFIRM_TESTID,
  RESPONSIBLE_REMOVE_PERSON_TESTID,
  RESPONSIBLE_REMOVE_GROUP_TESTID,
  // Ni siquiera los textos de «catalogo vacio»: el bloque entero no se monta.
  RESPONSIBLE_CANDIDATES_EMPTY_TESTID,
  RESPONSIBLE_WORK_GROUPS_EMPTY_TESTID,
] as const;

const RECETA = { id: '22222222-2222-4222-8222-222222222222', name: 'Esmalte azul', imageUrl: null };
const RECETAS: RecipePickerPage = { items: [RECETA], totalPages: 1 };
const UNIDADES = [
  { id: 'u-1', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null, isSystem: true },
];
const PARAMS: DataTableParams = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: null,
  filters: {},
  search: '',
};

const PEDIDO: OrderSummary = {
  id: PEDIDO_ID,
  number: { year: 2026, sequence: 42 },
  numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
  recipeId: RECETA.id,
  recipeName: RECETA.name,
  quantity: '12.5000',
  priority: 'MEDIA',
  status: 'PENDIENTE',
  cancellationReason: null,
  ingredientsCost: null,
  createdAt: new Date('2026-01-15T10:00:00.000Z'),
  updatedAt: new Date('2026-01-15T10:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('QC-102 — sin `asignaciones.modificar` el panel es de SOLO LECTURA (R28)', () => {
  it('no se monta ningun control de escritura, y el pedido esta abierto: no es el corte por estado', () => {
    render(
      <OrderResponsibles
        orderId={PEDIDO_ID}
        responsibles={RESPONSABLES}
        canWrite={false}
        people={[{ id: 'u-9', displayName: 'Mara Vidal' }]}
        workGroups={[{ id: TURNO, name: TURNO_NOMBRE }]}
      />,
    );

    const seccion = screen.getByTestId(ORDER_RESPONSIBLES_TESTID);
    for (const testId of CONTROLES_DE_ESCRITURA) {
      expect(within(seccion).queryAllByTestId(testId)).toHaveLength(0);
    }

    // Los catalogos llegaron con datos y aun asi no se pinta ninguno: lo que manda es `canWrite`.
    expect(seccion.textContent).not.toContain('Mara Vidal');
  });

  it('lo que SI se ve es lo que R28 permite ver: iniciales, nombres y nombre de grupo', () => {
    render(
      <OrderResponsibles orderId={PEDIDO_ID} responsibles={RESPONSABLES} canWrite={false} />,
    );

    const seccion = screen.getByTestId(ORDER_RESPONSIBLES_TESTID);
    expect(within(seccion).getAllByTestId(RESPONSIBLE_PERSON_TESTID)).toHaveLength(2);
    expect(
      within(seccion)
        .getAllByTestId(RESPONSIBLE_PERSON_NAME_TESTID)
        .map((nodo) => nodo.textContent),
    ).toEqual(['Ana Torres', 'Bruno Diaz']);
    expect(
      within(seccion)
        .getAllByTestId(RESPONSIBLE_GROUP_NAME_TESTID)
        .map((nodo) => nodo.textContent),
    ).toContain(TURNO_NOMBRE);
    // El nombre completo tambien como nombre accesible del circulo, no solo dos letras (R21).
    expect(within(seccion).getByRole('img', { name: 'Ana Torres' })).toBeInTheDocument();
  });

  it('el defecto es SOLO LECTURA: sin la prop, tampoco hay controles', () => {
    render(<OrderResponsibles orderId={PEDIDO_ID} responsibles={RESPONSABLES} />);

    for (const testId of CONTROLES_DE_ESCRITURA) {
      expect(screen.queryAllByTestId(testId)).toHaveLength(0);
    }
  });

  it('desde la fila viva: se abre el panel y no hay por donde escribir, ni se invoca ninguna accion', async () => {
    const user = setupUser();
    render(
      <OrderTable
        orders={[PEDIDO]}
        params={PARAMS}
        totalPages={1}
        recipes={RECETAS}
        units={UNIDADES}
        responsiblesByOrder={{ [PEDIDO_ID]: RESPONSABLES }}
        responsiblesCatalog={CATALOGO_SOLO_LECTURA}
      />,
    );

    await user.click(screen.getByTestId('order-action-responsibles'));
    const seccion = await screen.findByTestId(ORDER_SHEET_RESPONSIBLES_TESTID);

    for (const testId of CONTROLES_DE_ESCRITURA) {
      expect(within(seccion).queryAllByTestId(testId)).toHaveLength(0);
    }
    // Y las tres operaciones de QC-87, sin tocar: los dobles lanzarian si alguien las llamara.
    expect(accionesDeEscritura.assign).not.toHaveBeenCalled();
    expect(accionesDeEscritura.unassign).not.toHaveBeenCalled();
    expect(accionesDeEscritura.removeGroup).not.toHaveBeenCalled();
  });
});
