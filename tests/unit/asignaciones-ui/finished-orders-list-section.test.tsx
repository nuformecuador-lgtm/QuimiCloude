// QC-145 T13 — `FinishedOrdersListSection` es un Server Component `async`, asi que se le llama
// como funcion y se renderiza lo que devuelve (R19, R27), calcado de `order-list-section.test.tsx`.
//
// `listFinishedOrdersAction` esta mockeada: es el borde del modulo `asignaciones` (T11, ya en
// disco), y sustituirla es lo unico que permite ejercitar error, vacio y lista sin base de datos.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FinishedOrdersListSection } from '@/app/(private)/asignacion/components';
import type { DataTableParams } from '@/components/shared/data-table';
import type { FinishedOrderView } from '@/lib/modules/asignaciones';
import type { Page } from '@/lib/modules/pedidos';

const { listFinishedOrdersActionMock, routerMock } = vi.hoisted(() => ({
  listFinishedOrdersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => ({
  listFinishedOrdersAction: listFinishedOrdersActionMock,
}));

function parametros(overrides: Partial<DataTableParams> = {}): DataTableParams {
  return { page: 1, pageSize: 10, sort: null, filters: {}, search: '', ...overrides };
}

const ORDER: FinishedOrderView = {
  id: 'order-1',
  numberText: '2026-000123',
  recipeName: 'Jarabe simple',
  quantity: '12.5000',
  presentationName: 'Caja x 12',
  finishedAt: new Date('2026-09-20T15:30:00.000Z'),
  responsibles: [],
};

function pagina(items: readonly FinishedOrderView[], overrides: Partial<Page<FinishedOrderView>> = {}): Page<FinishedOrderView> {
  return { items, total: items.length, page: 1, pageSize: 10, totalPages: 1, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('R19 - sin pedidos terminados en la empresa, estado vacio y no error', () => {
  it('pinta el estado vacio sin enlace de «volver a la primera pagina»', async () => {
    listFinishedOrdersActionMock.mockResolvedValue({ status: 'success', data: pagina([]) });

    render(await FinishedOrdersListSection({ params: parametros() }));

    expect(screen.getByTestId('finished-orders-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('finished-orders-first-page')).toBeNull();
  });
});

describe('R27 - pagina inexistente: vacio con vuelta a la primera pagina', () => {
  it('con `page` mayor que 1 y sin resultados, ofrece el enlace de vuelta', async () => {
    listFinishedOrdersActionMock.mockResolvedValue({
      status: 'success',
      data: pagina([], { page: 3, totalPages: 1 }),
    });

    render(await FinishedOrdersListSection({ params: parametros({ page: 3 }) }));

    const enlace = screen.getByTestId('finished-orders-first-page');
    expect(enlace).toHaveAttribute('href', expect.stringContaining('page=1'));
    expect(enlace).toHaveAttribute('href', expect.stringContaining('vista=terminados'));
  });
});

describe('con pedidos, pinta la tabla y no el estado vacio', () => {
  it('monta `FinishedOrdersTable` con las filas de la pagina', async () => {
    listFinishedOrdersActionMock.mockResolvedValue({ status: 'success', data: pagina([ORDER]) });

    render(await FinishedOrdersListSection({ params: parametros() }));

    expect(screen.getByTestId('finished-orders-table')).toBeInTheDocument();
    expect(screen.getByText('2026-000123')).toBeInTheDocument();
    expect(screen.queryByTestId('finished-orders-empty')).toBeNull();
  });
});

describe('un error de la accion se pinta con `AssignedOrdersError`, nunca una tabla vacia', () => {
  it('pinta el estado de error', async () => {
    listFinishedOrdersActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'sin permiso',
      reference: 'r-1',
    });

    render(await FinishedOrdersListSection({ params: parametros() }));

    expect(screen.getByTestId('assigned-orders-error')).toBeInTheDocument();
  });
});
