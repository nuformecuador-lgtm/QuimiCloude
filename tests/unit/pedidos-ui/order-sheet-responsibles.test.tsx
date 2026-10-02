// QC-102 T14 — La seccion de responsables abre DENTRO del panel que ya existe: R23, R24, R26, R29.
//
// Se ejercita la fila VIVA —desde `<OrderTable>`, con la factoria de columnas por dentro—, que es
// la unica manera de comprobar lo que R23 dice de verdad: que la entrada «Responsables» de la fila
// y el `+N` de la columna abren **el mismo** panel, y que no aparece ninguna pantalla aparte.
//
// **Las actions de `asignaciones` estan mockeadas y se CUENTAN**: R26 es exactamente «abrir el
// panel no emite ninguna consulta», y eso solo se demuestra con el contador a cero.
//
// **Ninguna navegacion**: `router.push` es un doble, y que siga sin llamarse es la mitad de «ni
// ruta nueva» de R23.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_FORM_TESTID,
  ORDER_RESPONSIBLES_TESTID,
  ORDER_SHEET_RESPONSIBLES_TESTID,
  ORDER_SHEET_TESTID,
  OrderTable,
  RESPONSIBLE_CANDIDATE_TESTID,
  RESPONSIBLE_CONFIRM_TESTID,
  RESPONSIBLE_GROUP_NAME_TESTID,
  RESPONSIBLE_PERSON_TESTID,
  RESPONSIBLE_REMOVE_GROUP_TESTID,
  RESPONSIBLE_REMOVE_PERSON_TESTID,
  RESPONSIBLE_SEARCH_TESTID,
  RESPONSIBLE_WORK_GROUP_TESTID,
  responsiblesOverflowLabel,
  type OrderResponsiblesCatalog,
  type RecipePickerPage,
} from '@/app/(private)/pedidos/components';
import type { DataTableParams } from '@/components/shared/data-table';
import type { OrderResponsible } from '@/lib/modules/asignaciones';
import { formatOrderNumber, type OrderStatus, type OrderSummary } from '@/lib/modules/pedidos';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import { setupUser } from '../../helpers/user-event';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

const { routerMock, listaDeResponsables, listaEnLote } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  /** Contadores de R26: abrir el panel no debe moverlos del cero. */
  listaDeResponsables: vi.fn(async () => ({ status: 'success' as const, data: [] })),
  listaEnLote: vi.fn(async () => ({ status: 'success' as const, data: [] })),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse por abrir un panel`);
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

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse por abrir el panel`);
  };
  return {
    listOrderResponsiblesAction: listaDeResponsables,
    listResponsiblesForOrdersAction: listaEnLote,
    assignResponsiblesAction: vi.fn(noDebeInvocarse('assignResponsiblesAction')),
    unassignResponsibleAction: vi.fn(noDebeInvocarse('unassignResponsibleAction')),
    removeWorkGroupFromOrderAction: vi.fn(noDebeInvocarse('removeWorkGroupFromOrderAction')),
  };
});

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipeVersionsAction: vi.fn(async () => ({ status: 'success' as const, data: [] })),
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

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
  createPresentationAction: vi.fn(() => {
    throw new Error('createPresentationAction no debe invocarse desde este archivo');
  }),
}));

const RECETA = { id: '22222222-2222-4222-8222-222222222222', name: 'Esmalte azul', imageUrl: null };
const RECETAS: RecipePickerPage = { items: [RECETA], totalPages: 1 };
const UNIDADES = [
  { id: 'u-1', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null, isSystem: true },
];

const PEDIDO_ID = '11111111-1111-4111-8111-111111111111';
const TURNO = 'aaaaaaaa-0000-4000-8000-00000000aaaa';
const TURNO_NOMBRE = 'Turno de la mañana';

/** Cinco: tres caben en la fila y dos sobran, asi que el `+N` existe (R17). */
const RESPONSABLES: readonly OrderResponsible[] = [
  { userId: 'u-0', displayName: 'Ana Torres', origin: { kind: 'direct' } },
  {
    userId: 'u-1',
    displayName: 'Bruno Diaz',
    origin: { kind: 'workGroup', workGroupId: TURNO, workGroupName: TURNO_NOMBRE },
  },
  { userId: 'u-2', displayName: 'Carla Ruiz', origin: { kind: 'direct' } },
  { userId: 'u-3', displayName: 'Diego Sanz', origin: { kind: 'direct' } },
  { userId: 'u-4', displayName: 'Elena Mora', origin: { kind: 'direct' } },
];

const CATALOGO_CON_ESCRITURA: OrderResponsiblesCatalog = {
  canWrite: true,
  people: [{ id: 'u-9', displayName: 'Mara Vidal' }],
  workGroups: [{ id: TURNO, name: TURNO_NOMBRE }],
};

const PARAMS: DataTableParams = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: null,
  filters: {},
  search: '',
};

function pedido(status: OrderStatus): OrderSummary {
  return {
    id: PEDIDO_ID,
    number: { year: 2026, sequence: 42 },
    numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
    recipeId: RECETA.id,
    recipeName: RECETA.name,
    recipeVersion: null,
    quantity: '12.5000',
    priority: 'MEDIA',
    status,
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationLines: [],
    unitId: null,
    unitLabel: null,
  };
}

/** La LISTA entera, con el lote ya repartido por el servidor (lo que hace `OrderListSection`). */
function montarLista(
  status: OrderStatus = 'PENDIENTE',
  catalogo: OrderResponsiblesCatalog = CATALOGO_CON_ESCRITURA,
) {
  render(
    <OrderTable
      orders={[pedido(status)]}
      params={PARAMS}
      totalPages={1}
      recipes={RECETAS}
      units={UNIDADES}
      responsiblesByOrder={{ [PEDIDO_ID]: RESPONSABLES }}
      responsiblesCatalog={catalogo}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('la seccion vive DENTRO del panel que ya existe (R23)', () => {
  it('la entrada «Responsables» de la fila abre UN solo panel, el de siempre, y no navega', async () => {
    const user = setupUser();
    montarLista();

    // Cerrada la fila, no hay ningun panel montado.
    expect(screen.queryByTestId(ORDER_SHEET_TESTID)).toBeNull();

    await user.click(screen.getByTestId('order-action-responsibles'));

    // UNA sola instancia de panel, y es el `order-sheet` de QC-35: no hay panel nuevo.
    const paneles = await screen.findAllByTestId(ORDER_SHEET_TESTID);
    expect(paneles).toHaveLength(1);
    // Y dentro de EL, la seccion de responsables, abierta por su seccion.
    const seccion = within(paneles[0]).getByTestId(ORDER_SHEET_RESPONSIBLES_TESTID);
    expect(seccion).toHaveAttribute('data-section', 'responsibles');
    expect(within(seccion).getByTestId(ORDER_RESPONSIBLES_TESTID)).toBeInTheDocument();

    // Ni ruta nueva ni pantalla aparte: nadie ha navegado.
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('el `+N` de la columna abre ESE MISMO panel, tambien uno solo (R35, H5)', async () => {
    const user = setupUser();
    montarLista();

    await user.click(screen.getByRole('button', { name: responsiblesOverflowLabel(2) }));

    const paneles = await screen.findAllByTestId(ORDER_SHEET_TESTID);
    expect(paneles).toHaveLength(1);
    expect(within(paneles[0]).getByTestId(ORDER_SHEET_RESPONSIBLES_TESTID)).toHaveAttribute(
      'data-section',
      'responsibles',
    );
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('editar abre el MISMO panel, pero en la seccion del formulario (R24)', async () => {
    const user = setupUser();
    montarLista();

    await user.click(screen.getByTestId('order-action-edit'));

    const paneles = await screen.findAllByTestId(ORDER_SHEET_TESTID);
    expect(paneles).toHaveLength(1);
    expect(screen.getByTestId(ORDER_FORM_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(ORDER_SHEET_RESPONSIBLES_TESTID)).toHaveAttribute(
      'data-section',
      'form',
    );
  });

  it('abierto por «Responsables», el panel sigue siendo el de siempre: no se duplica nada', async () => {
    const user = setupUser();
    montarLista();

    await user.click(screen.getByTestId('order-action-responsibles'));

    expect(await screen.findByTestId(ORDER_FORM_TESTID)).toBeInTheDocument();
    // Una sola seccion de responsables en todo el documento, no una por cada via de apertura.
    expect(screen.getAllByTestId(ORDER_RESPONSIBLES_TESTID)).toHaveLength(1);
  });
});

describe('abrir el panel NO emite ninguna consulta de responsables (R26)', () => {
  it('los contadores de las dos lecturas siguen a CERO tras abrir por la fila', async () => {
    const user = setupUser();
    montarLista();

    await user.click(screen.getByTestId('order-action-responsibles'));
    await screen.findByTestId(ORDER_SHEET_RESPONSIBLES_TESTID);

    expect(listaDeResponsables).toHaveBeenCalledTimes(0);
    expect(listaEnLote).toHaveBeenCalledTimes(0);
  });

  it('tambien a cero abriendo por el `+N`, y lo que se pinta es lo que la fila ya trajo', async () => {
    const user = setupUser();
    montarLista();

    await user.click(screen.getByRole('button', { name: responsiblesOverflowLabel(2) }));
    const seccion = await screen.findByTestId(ORDER_SHEET_RESPONSIBLES_TESTID);

    // Los CINCO, sin limite y con el nombre del grupo congelado de la propia fila (R25, R12).
    expect(within(seccion).getAllByTestId(RESPONSIBLE_PERSON_TESTID)).toHaveLength(5);
    expect(
      within(seccion)
        .getAllByTestId(RESPONSIBLE_GROUP_NAME_TESTID)
        .map((nodo) => nodo.textContent),
    ).toContain(TURNO_NOMBRE);

    expect(listaDeResponsables).toHaveBeenCalledTimes(0);
    expect(listaEnLote).toHaveBeenCalledTimes(0);
  });
});

describe('con el pedido ENTREGADO o CANCELADO la seccion CALLA (R29)', () => {
  const CONTROLES_DE_ESCRITURA = [
    RESPONSIBLE_SEARCH_TESTID,
    RESPONSIBLE_CANDIDATE_TESTID,
    RESPONSIBLE_WORK_GROUP_TESTID,
    RESPONSIBLE_CONFIRM_TESTID,
    RESPONSIBLE_REMOVE_PERSON_TESTID,
    RESPONSIBLE_REMOVE_GROUP_TESTID,
  ] as const;

  it.each(['ENTREGADO', 'CANCELADO'] as const)(
    'con un pedido %s: ningun control de asignar ni de quitar, y NINGUNA frase que lo explique',
    async (status) => {
      const user = setupUser();
      // Con `canWrite: true` a proposito: lo que apaga los controles aqui es el ESTADO, no el
      // permiso. Si se cayera el corte por estado, este caso lo dice.
      montarLista(status);

      await user.click(screen.getByTestId('order-action-responsibles'));
      const seccion = await screen.findByTestId(ORDER_SHEET_RESPONSIBLES_TESTID);

      for (const testId of CONTROLES_DE_ESCRITURA) {
        expect(within(seccion).queryAllByTestId(testId)).toHaveLength(0);
      }

      // Pero los responsables SI se ven: consultarlos es lo que QC-87 R13 permite en todo estado.
      expect(within(seccion).getAllByTestId(RESPONSIBLE_PERSON_TESTID)).toHaveLength(5);

      // Y la seccion no da explicaciones: ni «cerrado», ni «no se puede», ni «entregado».
      const texto = (seccion.textContent ?? '').toLocaleLowerCase();
      for (const palabra of [
        'no se puede',
        'cerrado',
        'bloquead',
        'ya no',
        'entregado',
        'cancelado',
      ]) {
        expect(texto).not.toContain(palabra);
      }
    },
  );

  it.each(['PENDIENTE', 'EN_CURSO'] as const)(
    'con un pedido %s los controles SI se montan: el corte es por estado y por nada mas',
    async (status) => {
      const user = setupUser();
      montarLista(status);

      await user.click(screen.getByTestId('order-action-responsibles'));
      const seccion = await screen.findByTestId(ORDER_SHEET_RESPONSIBLES_TESTID);

      expect(within(seccion).getByTestId(RESPONSIBLE_SEARCH_TESTID)).toBeInTheDocument();
      expect(within(seccion).getByTestId(RESPONSIBLE_CONFIRM_TESTID)).toBeInTheDocument();
      expect(within(seccion).getAllByTestId(RESPONSIBLE_REMOVE_PERSON_TESTID)).toHaveLength(5);
      expect(within(seccion).getAllByTestId(RESPONSIBLE_REMOVE_GROUP_TESTID)).toHaveLength(1);
    },
  );
});
