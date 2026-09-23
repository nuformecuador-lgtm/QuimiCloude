// QC-145 T13 — `CompanyOrdersListSection` es un Server Component `async`, calcado del test de
// `FinishedOrdersListSection` (R19, R27). `listCompanyOrdersAction` esta mockeada: es el borde del
// modulo `asignaciones` (T11, ya en disco).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COMPANY_ORDERS_SECTION_TESTID,
  CompanyOrdersListSection,
} from '@/app/(private)/asignacion/components';
import type { DataTableParams } from '@/components/shared/data-table';
import type { CompanyOrderView } from '@/lib/modules/asignaciones';
import type { Page } from '@/lib/modules/pedidos';

const { listCompanyOrdersActionMock, routerMock } = vi.hoisted(() => ({
  listCompanyOrdersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
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
  listCompanyOrdersAction: listCompanyOrdersActionMock,
}));

function parametros(overrides: Partial<DataTableParams> = {}): DataTableParams {
  return { page: 1, pageSize: 10, sort: null, filters: {}, search: '', ...overrides };
}

const ORDER: CompanyOrderView = {
  id: 'order-1',
  numberText: '2026-000123',
  recipeName: 'Jarabe simple',
  quantity: '12.5000',
  presentationName: 'Caja x 12',
  priority: 'ALTA',
  status: 'ENTREGADO',
  responsibles: [],
  finishedAt: new Date('2026-09-20T15:30:00.000Z'),
};

function pagina(items: readonly CompanyOrderView[], overrides: Partial<Page<CompanyOrderView>> = {}): Page<CompanyOrderView> {
  return { items, total: items.length, page: 1, pageSize: 10, totalPages: 1, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('R19 - sin pedidos que cumplan el filtro, estado vacio y no error', () => {
  it('pinta el estado vacio sin enlace de «volver a la primera pagina»', async () => {
    listCompanyOrdersActionMock.mockResolvedValue({ status: 'success', data: pagina([]) });

    render(await CompanyOrdersListSection({ params: parametros(), statuses: [] }));

    expect(screen.getByTestId('company-orders-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('company-orders-first-page')).toBeNull();
  });

  it('R27 - la seccion expone su testid en el estado vacio', async () => {
    listCompanyOrdersActionMock.mockResolvedValue({ status: 'success', data: pagina([]) });

    render(await CompanyOrdersListSection({ params: parametros(), statuses: [] }));

    expect(screen.getByTestId(COMPANY_ORDERS_SECTION_TESTID)).toBeInTheDocument();
  });
});

describe('R27 - pagina inexistente: vacio con vuelta a la primera pagina, conservando el filtro', () => {
  it('con `page` mayor que 1 y sin resultados, ofrece el enlace de vuelta con el status vigente', async () => {
    listCompanyOrdersActionMock.mockResolvedValue({
      status: 'success',
      data: pagina([], { page: 3, totalPages: 1 }),
    });

    render(
      await CompanyOrdersListSection({
        params: parametros({ page: 3 }),
        statuses: ['ENTREGADO'],
      }),
    );

    const enlace = screen.getByTestId('company-orders-first-page');
    expect(enlace).toHaveAttribute('href', expect.stringContaining('page=1'));
    expect(enlace).toHaveAttribute('href', expect.stringContaining('vista=todos'));
    expect(enlace).toHaveAttribute('href', expect.stringContaining('status=ENTREGADO'));
  });
});

describe('con pedidos, pinta la tabla y no el estado vacio', () => {
  it('monta `CompanyOrdersTable` con las filas de la pagina, la accion recibe el filtro', async () => {
    listCompanyOrdersActionMock.mockResolvedValue({ status: 'success', data: pagina([ORDER]) });

    render(await CompanyOrdersListSection({ params: parametros(), statuses: ['ENTREGADO'] }));

    expect(screen.getByTestId('company-orders-table')).toBeInTheDocument();
    expect(screen.getByText('2026-000123')).toBeInTheDocument();
    expect(listCompanyOrdersActionMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      statuses: ['ENTREGADO'],
    });
  });

  it('sin filtro, la accion no recibe `statuses`', async () => {
    listCompanyOrdersActionMock.mockResolvedValue({ status: 'success', data: pagina([ORDER]) });

    render(await CompanyOrdersListSection({ params: parametros(), statuses: [] }));

    expect(listCompanyOrdersActionMock).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
  });

  it('R27 - la seccion expone su testid en el estado con tabla', async () => {
    listCompanyOrdersActionMock.mockResolvedValue({ status: 'success', data: pagina([ORDER]) });

    render(await CompanyOrdersListSection({ params: parametros(), statuses: [] }));

    expect(screen.getByTestId(COMPANY_ORDERS_SECTION_TESTID)).toBeInTheDocument();
  });
});

describe('un error de la accion se pinta con `AssignedOrdersError`, nunca una tabla vacia', () => {
  it('pinta el estado de error', async () => {
    listCompanyOrdersActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'sin permiso',
      reference: 'r-1',
    });

    render(await CompanyOrdersListSection({ params: parametros(), statuses: [] }));

    expect(screen.getByTestId('assigned-orders-error')).toBeInTheDocument();
  });

  it('R27 - la seccion expone su testid en el estado de error', async () => {
    listCompanyOrdersActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'sin permiso',
      reference: 'r-1',
    });

    render(await CompanyOrdersListSection({ params: parametros(), statuses: [] }));

    expect(screen.getByTestId(COMPANY_ORDERS_SECTION_TESTID)).toBeInTheDocument();
  });
});
