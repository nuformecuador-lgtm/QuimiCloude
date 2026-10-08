// Las dos secciones del acondicionador son Server Components `async`: se llaman como funcion y se
// renderiza lo que devuelven. La fachada esta mockeada: es el borde que permite ejercitar error,
// vacio y lista sin base de datos.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupUser } from '../../helpers/user-event';

import {
  CONDITIONED_ORDERS_SECTION_TESTID,
  CONDITIONING_ORDERS_SECTION_TESTID,
  ConditionedOrdersListSection,
  ConditioningOrdersListSection,
  conditionedOrdersHref,
  conditioningOrdersHref,
} from '@/app/(private)/asignacion/components';
import type { DataTableParams } from '@/components/shared/data-table';
import type { ConditioningOrderRow, FinishedOrderView } from '@/lib/modules/asignaciones';

const {
  getSessionUserMock,
  getSessionContextMock,
  listConditioningOrdersMock,
  listConditionedOrdersMock,
  routerMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  getSessionContextMock: vi.fn<() => Promise<unknown>>(),
  listConditioningOrdersMock: vi.fn<(actor: unknown, query: unknown) => Promise<unknown>>(),
  listConditionedOrdersMock: vi.fn<(actor: unknown, query: unknown) => Promise<unknown>>(),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  asignaciones: {
    listConditioningOrders: listConditioningOrdersMock,
    listConditionedOrders: listConditionedOrdersMock,
  },
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

const ACTOR_SESSION = {
  id: 'u-1',
  username: 'acondicionador.prueba',
  displayName: 'Acondicionador de Prueba',
  roleName: 'Administrador de acondicionamiento',
  permissions: ['asignaciones.consultar', 'acondicionamiento.modificar'],
};

function parametros(overrides: Partial<DataTableParams> = {}): DataTableParams {
  return { page: 1, pageSize: 10, sort: null, filters: {}, search: '', ...overrides };
}

function pagina<T>(items: readonly T[], overrides: Partial<Record<string, number>> = {}) {
  return {
    items,
    total: overrides.total ?? items.length,
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 10,
    totalPages: overrides.totalPages ?? 1,
  };
}

const QUEUE_ROW: ConditioningOrderRow = {
  id: 'order-a',
  numberText: '2026-0000040',
  recipeName: 'Jarabe simple',
  quantity: '20',
  unitId: null,
  unitLabel: null,
  presentationLines: [
    { presentationId: 'pres-1', presentationName: 'Frasco', packagingName: '500 g', packages: 12 },
    { presentationId: 'pres-2', presentationName: 'Bolsa', packagingName: '1 kg', packages: 4 },
  ],
  status: 'POR_ACONDICIONAR',
  conditionedByName: null,
  conditionedById: null,
};

const FINISHED_ROW: FinishedOrderView = {
  id: 'order-c',
  numberText: '2026-0000041',
  recipeName: 'Jarabe simple',
  quantity: '12.5000',
  presentationLines: [],
  unitId: null,
  unitLabel: null,
  finishedAt: new Date('2026-09-20T15:30:00.000Z'),
  responsibles: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  getSessionUserMock.mockResolvedValue(ACTOR_SESSION);
  getSessionContextMock.mockResolvedValue({ companyId: 'company-1' });
});

describe('«Por acondicionar»: la sección pide la página y pinta la tabla compartida', () => {
  it('R8: pasa el actor y { page, pageSize } a listConditioningOrders y pinta la fila', async () => {
    listConditioningOrdersMock.mockResolvedValue(pagina([QUEUE_ROW]));

    render(await ConditioningOrdersListSection({ params: parametros() }));

    expect(listConditioningOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u-1', companyId: 'company-1' }),
      { page: 1, pageSize: 10 },
    );
    expect(screen.getByTestId(CONDITIONING_ORDERS_SECTION_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId('conditioning-orders-table')).toBeInTheDocument();
    expect(screen.getByTestId('order-distribution-full')).toHaveTextContent('12 × 500 g / 4 × 1 kg');
  });

  it('R9: sin pedidos dice «No hay pedidos por acondicionar en tu empresa.» y no pinta tabla', async () => {
    listConditioningOrdersMock.mockResolvedValue(pagina([]));

    render(await ConditioningOrdersListSection({ params: parametros() }));

    expect(screen.getByTestId('conditioning-orders-empty-message')).toHaveTextContent(
      'No hay pedidos por acondicionar en tu empresa.',
    );
    expect(screen.queryByTestId('conditioning-orders-first-page')).toBeNull();
    expect(screen.queryByTestId('conditioning-orders-table')).toBeNull();
  });

  it('R9: una página pasada del total dice «Esta página ya no tiene pedidos.» y enlaza a la primera', async () => {
    listConditioningOrdersMock.mockResolvedValue(pagina([], { page: 3, totalPages: 2 }));

    render(await ConditioningOrdersListSection({ params: parametros({ page: 3 }) }));

    expect(screen.getByTestId('conditioning-orders-empty-message')).toHaveTextContent(
      'Esta página ya no tiene pedidos.',
    );
    const enlace = screen.getByTestId('conditioning-orders-first-page');
    expect(enlace).toHaveAttribute('href', expect.stringContaining('page=1'));
    expect(enlace).toHaveAttribute('href', expect.stringContaining('vista=por_acondicionar'));
    expect(enlace.className).toContain('min-h-11');
  });

  it('R10: pasar de página conserva ?vista=por_acondicionar', async () => {
    listConditioningOrdersMock.mockResolvedValue(pagina([QUEUE_ROW], { page: 1, totalPages: 2 }));
    const user = setupUser();

    render(await ConditioningOrdersListSection({ params: parametros() }));
    await user.click(screen.getByTestId('data-table-next'));

    expect(routerMock.push).toHaveBeenCalledTimes(1);
    const href = routerMock.push.mock.calls[0]?.[0] ?? '';
    expect(href).toContain('vista=por_acondicionar');
    expect(href).toContain('page=2');
  });

  it('R10: la dirección de «Por acondicionar» lleva siempre su vista, también al cambiar de tamaño', () => {
    expect(conditioningOrdersHref({ page: 1, pageSize: 25 })).toBe(
      '/asignacion?page=1&pageSize=25&vista=por_acondicionar',
    );
  });

  it('un fallo del caso de uso pinta el estado de error, no una tabla vacía', async () => {
    listConditioningOrdersMock.mockRejectedValue(new Error('fallo de base de datos'));

    render(await ConditioningOrdersListSection({ params: parametros() }));

    expect(screen.getByTestId(CONDITIONING_ORDERS_SECTION_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId('assigned-orders-error')).toBeInTheDocument();
    expect(screen.queryByTestId('conditioning-orders-table')).toBeNull();
  });
});

describe('«Terminados» del acondicionador', () => {
  it('R12: pide listConditionedOrders con el actor y pinta la tabla con el número enlazado', async () => {
    listConditionedOrdersMock.mockResolvedValue(pagina([FINISHED_ROW]));

    render(await ConditionedOrdersListSection({ params: parametros() }));

    expect(listConditionedOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u-1', companyId: 'company-1' }),
      { page: 1, pageSize: 10 },
    );
    expect(listConditioningOrdersMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(CONDITIONED_ORDERS_SECTION_TESTID)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2026-0000041' })).toHaveAttribute(
      'href',
      '/asignacion/acondicionamiento/order-c',
    );
  });

  it('R12: vacía dice «Todavía no has terminado ningún acondicionamiento.»', async () => {
    listConditionedOrdersMock.mockResolvedValue(pagina([]));

    render(await ConditionedOrdersListSection({ params: parametros() }));

    expect(screen.getByTestId('conditioning-orders-empty-message')).toHaveTextContent(
      'Todavía no has terminado ningún acondicionamiento.',
    );
    expect(screen.queryByTestId('conditioned-orders-table')).toBeNull();
  });

  it('R9, R10: una página pasada del total enlaza a la primera conservando ?vista=acondicionados', async () => {
    listConditionedOrdersMock.mockResolvedValue(pagina([], { page: 4, totalPages: 1 }));

    render(await ConditionedOrdersListSection({ params: parametros({ page: 4 }) }));

    expect(screen.getByTestId('conditioning-orders-empty-message')).toHaveTextContent(
      'Esta página ya no tiene pedidos.',
    );
    expect(screen.getByTestId('conditioning-orders-first-page')).toHaveAttribute(
      'href',
      expect.stringContaining('vista=acondicionados'),
    );
  });

  it('R10: pasar de página conserva ?vista=acondicionados', async () => {
    listConditionedOrdersMock.mockResolvedValue(pagina([FINISHED_ROW], { page: 1, totalPages: 3 }));
    const user = setupUser();

    render(await ConditionedOrdersListSection({ params: parametros() }));
    await user.click(screen.getByTestId('data-table-next'));

    const href = routerMock.push.mock.calls[0]?.[0] ?? '';
    expect(href).toContain('vista=acondicionados');
    expect(href).toContain('page=2');
    expect(conditionedOrdersHref({ page: 1, pageSize: 50 })).toContain('vista=acondicionados');
  });

  it('un fallo del caso de uso pinta el estado de error', async () => {
    listConditionedOrdersMock.mockRejectedValue(new Error('fallo de base de datos'));

    render(await ConditionedOrdersListSection({ params: parametros() }));

    expect(screen.getByTestId(CONDITIONED_ORDERS_SECTION_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId('assigned-orders-error')).toBeInTheDocument();
  });
});
