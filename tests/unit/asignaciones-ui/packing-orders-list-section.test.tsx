import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PackingOrdersListSection } from '@/app/(private)/asignacion/components';

const { getSessionUserMock, getSessionContextMock, listPackingOrdersMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  getSessionContextMock: vi.fn<() => Promise<unknown>>(),
  listPackingOrdersMock: vi.fn<(actor: unknown, query: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  asignaciones: { listPackingOrders: listPackingOrdersMock },
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

// `AssignedOrdersError` llama `useRouter()` para el reintento y jsdom no monta el App Router.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const ACTOR_SESSION = {
  id: 'u-1',
  username: 'empacador.prueba',
  displayName: 'Empacador de Prueba',
  roleName: 'Empacador',
  permissions: ['empaque.modificar'],
};

const PARAMS = { page: 1, pageSize: 10, sort: null, filters: {}, search: '' };

function paginaCon(items: readonly unknown[], overrides: Partial<Record<string, number>> = {}) {
  return {
    items,
    total: overrides.total ?? items.length,
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 10,
    totalPages: overrides.totalPages ?? 1,
  };
}

const ORDER_ROW = {
  id: 'order-1',
  numberText: '2026-0000030',
  recipeName: 'Jarabe simple',
  presentationName: 'Caja x 12',
  packages: '4',
  status: 'POR_EMPACAR',
  packedByName: null,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  getSessionUserMock.mockResolvedValue(ACTOR_SESSION);
  getSessionContextMock.mockResolvedValue({ companyId: 'company-1' });
});

describe('R14, R16 - la seccion pide la pagina y pinta la fila con sus seis datos', () => {
  it('pasa `page`/`pageSize` a `listPackingOrders` y pinta la fila', async () => {
    listPackingOrdersMock.mockResolvedValue(paginaCon([ORDER_ROW]));

    render(await PackingOrdersListSection({ params: PARAMS }));

    expect(listPackingOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u-1', companyId: 'company-1' }),
      { page: 1, pageSize: 10 },
    );
    expect(screen.getByTestId('packing-orders-list-section')).toBeInTheDocument();
    expect(screen.getAllByTestId('packing-order-row')).toHaveLength(1);
    expect(screen.getByTestId('packing-order-link')).toHaveAttribute(
      'href',
      '/asignacion/empaque/order-1',
    );
  });
});

describe('R14 - lista vacia: sin filas, sin tabla', () => {
  it('sin pedidos, pinta el mensaje de vacio y no la tabla', async () => {
    listPackingOrdersMock.mockResolvedValue(paginaCon([]));

    render(await PackingOrdersListSection({ params: PARAMS }));

    expect(screen.getByTestId('packing-orders-empty-message')).toHaveTextContent(
      'No hay pedidos por empacar en tu empresa.',
    );
    expect(screen.queryByTestId('packing-orders-table')).toBeNull();
  });

  it('pagina pasada del total: mensaje distinto y enlace de vuelta', async () => {
    listPackingOrdersMock.mockResolvedValue(paginaCon([], { page: 3, totalPages: 2 }));

    render(await PackingOrdersListSection({ params: { ...PARAMS, page: 3 } }));

    expect(screen.getByTestId('packing-orders-empty-message')).toHaveTextContent(
      'Esta página ya no tiene pedidos.',
    );
    expect(screen.getByTestId('packing-orders-first-page')).toHaveAttribute(
      'href',
      expect.stringContaining('vista=por_empacar'),
    );
  });
});

describe('fallo del caso de uso: se pinta el estado de error, no una tabla vacia', () => {
  it('un error inesperado no tumba la pantalla', async () => {
    listPackingOrdersMock.mockRejectedValue(new Error('fallo de base de datos'));

    render(await PackingOrdersListSection({ params: PARAMS }));

    expect(screen.getByTestId('assigned-orders-error')).toBeInTheDocument();
    expect(screen.queryByTestId('packing-orders-table')).toBeNull();
  });
});

describe('R43 - paginacion con objetivos tactiles de 44x44, sin depender de hover', () => {
  it('los enlaces de pagina anterior/siguiente cumplen el minimo tactil', async () => {
    listPackingOrdersMock.mockResolvedValue(paginaCon([ORDER_ROW], { page: 1, totalPages: 2 }));

    render(await PackingOrdersListSection({ params: PARAMS }));

    const siguiente = screen.getByTestId('packing-orders-next-page');
    expect(siguiente.className).toContain('min-h-11');
    expect(siguiente.className).toContain('min-w-11');
    expect(siguiente).toHaveAttribute('href', expect.stringContaining('page=2'));

    const anterior = screen.getByTestId('packing-orders-prev-page');
    expect(anterior).toHaveAttribute('aria-disabled', 'true');
  });
});
