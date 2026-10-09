// La sección es un Server Component `async`: se llama como funcion y se renderiza lo que devuelve.
// La fachada esta mockeada: es el borde que permite ejercitar error, vacio y lista sin base de datos.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupUser } from '../../helpers/user-event';

import {
  DELIVERED_CONDITIONED_ORDERS_SECTION_TESTID,
  DeliveredConditionedOrdersListSection,
  buildConditionedOrdersColumns,
  deliveredConditionedOrdersHref,
} from '@/app/(private)/asignacion/components';
import type { DataTableParams } from '@/components/shared/data-table';
import type { FinishedOrderView } from '@/lib/modules/asignaciones';

const {
  getSessionUserMock,
  getSessionContextMock,
  listDeliveredConditionedOrdersMock,
  listConditionedOrdersMock,
  routerMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  getSessionContextMock: vi.fn<() => Promise<unknown>>(),
  listDeliveredConditionedOrdersMock: vi.fn<(actor: unknown, query: unknown) => Promise<unknown>>(),
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
    listDeliveredConditionedOrders: listDeliveredConditionedOrdersMock,
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

const DELIVERED_ROW: FinishedOrderView = {
  id: 'order-d',
  numberText: '2026-0000050',
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

describe('«Entregados» del acondicionador', () => {
  it('R20: pide listDeliveredConditionedOrders con el actor y enlaza el número al detalle', async () => {
    listDeliveredConditionedOrdersMock.mockResolvedValue(pagina([DELIVERED_ROW]));

    render(await DeliveredConditionedOrdersListSection({ params: parametros() }));

    expect(listDeliveredConditionedOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u-1', companyId: 'company-1' }),
      { page: 1, pageSize: 10 },
    );
    expect(listConditionedOrdersMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(DELIVERED_CONDITIONED_ORDERS_SECTION_TESTID)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2026-0000050' })).toHaveAttribute(
      'href',
      '/asignacion/acondicionamiento/order-d',
    );
  });

  it('R20: las mismas columnas, en el mismo orden, que «Terminados»', async () => {
    listDeliveredConditionedOrdersMock.mockResolvedValue(pagina([DELIVERED_ROW]));

    render(await DeliveredConditionedOrdersListSection({ params: parametros() }));

    const cabeceras = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim() ?? '');
    const esperadas = buildConditionedOrdersColumns().map((column) => column.label);
    expect(cabeceras).toHaveLength(esperadas.length);
    esperadas.forEach((texto, index) => expect(cabeceras[index]).toContain(texto));
    expect(screen.getByTestId('conditioned-orders-table')).toBeInTheDocument();
  });

  it('R20: vacía dice «Todavía no se ha entregado ningún pedido que acondicionaste.»', async () => {
    listDeliveredConditionedOrdersMock.mockResolvedValue(pagina([]));

    render(await DeliveredConditionedOrdersListSection({ params: parametros() }));

    expect(screen.getByTestId('conditioning-orders-empty-message')).toHaveTextContent(
      'Todavía no se ha entregado ningún pedido que acondicionaste.',
    );
    expect(screen.queryByTestId('conditioning-orders-first-page')).toBeNull();
    expect(screen.queryByTestId('conditioned-orders-table')).toBeNull();
  });

  it('R20: una página pasada del total enlaza a la primera conservando ?vista=acondicionados_entregados', async () => {
    listDeliveredConditionedOrdersMock.mockResolvedValue(pagina([], { page: 4, totalPages: 1 }));

    render(await DeliveredConditionedOrdersListSection({ params: parametros({ page: 4 }) }));

    expect(screen.getByTestId('conditioning-orders-empty-message')).toHaveTextContent(
      'Esta página ya no tiene pedidos.',
    );
    const enlace = screen.getByTestId('conditioning-orders-first-page');
    expect(enlace).toHaveAttribute('href', '/asignacion?page=1&pageSize=10&vista=acondicionados_entregados');
    expect(enlace.className).toContain('min-h-11');
  });

  it('R20: pasar de página conserva ?vista=acondicionados_entregados', async () => {
    listDeliveredConditionedOrdersMock.mockResolvedValue(pagina([DELIVERED_ROW], { page: 1, totalPages: 3 }));
    const user = setupUser();

    render(await DeliveredConditionedOrdersListSection({ params: parametros() }));
    await user.click(screen.getByTestId('data-table-next'));

    const href = routerMock.push.mock.calls[0]?.[0] ?? '';
    expect(href).toContain('vista=acondicionados_entregados');
    expect(href).toContain('page=2');
    expect(deliveredConditionedOrdersHref({ page: 1, pageSize: 50 })).toBe(
      '/asignacion?page=1&pageSize=50&vista=acondicionados_entregados',
    );
  });

  it('un fallo del caso de uso pinta el estado de error', async () => {
    listDeliveredConditionedOrdersMock.mockRejectedValue(new Error('fallo de base de datos'));

    render(await DeliveredConditionedOrdersListSection({ params: parametros() }));

    expect(screen.getByTestId(DELIVERED_CONDITIONED_ORDERS_SECTION_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId('assigned-orders-error')).toBeInTheDocument();
  });
});
