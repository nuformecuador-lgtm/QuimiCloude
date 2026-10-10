// El estado vacio de la lista de clientes, que pinta `CustomerTable` con `empty`.
//
// La tabla se monta SOLA —sin la seccion— porque lo que aqui se mide es la forma del vacio: que
// disparador ofrece y bajo que condicion. El despacho real (cuando se pinta cada caso) lo cubre
// `customer-list-section.test.tsx`.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CUSTOMER_CREATE_OPEN_TESTID,
  CUSTOMER_LIST_EMPTY_MESSAGE_TESTID,
  CUSTOMER_LIST_EMPTY_TESTID,
  CUSTOMER_LIST_FIRST_PAGE_TESTID,
  CustomerTable,
} from '@/app/(private)/clientes/components';
import type { DataTableParams } from '@/components/shared/data-table';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

const { routerMock } = vi.hoisted(() => ({
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

vi.mock('@/lib/modules/clientes/adapters/driving/customer-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la lista`);
  };
  return {
    listCustomersAction: vi.fn(noDebeInvocarse('listCustomersAction')),
    getCustomerAction: vi.fn(noDebeInvocarse('getCustomerAction')),
    createCustomerAction: vi.fn(noDebeInvocarse('createCustomerAction')),
    updateCustomerAction: vi.fn(noDebeInvocarse('updateCustomerAction')),
    deleteCustomerAction: vi.fn(noDebeInvocarse('deleteCustomerAction')),
  };
});

const PARAMS: DataTableParams = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: null,
  filters: {},
  search: '',
};

function renderVacio(canModify: boolean, firstPageHref?: string) {
  return render(
    <CustomerTable
      customers={[]}
      params={PARAMS}
      totalPages={1}
      canModify={canModify}
      empty={{ firstPageHref }}
    />,
  );
}

beforeEach(() => {
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('el vacio es identificable y no finge que haya lista (R19)', () => {
  it('se pinta su region y su mensaje, y ninguna tabla', () => {
    renderVacio(false);

    expect(screen.getByTestId(CUSTOMER_LIST_EMPTY_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(CUSTOMER_LIST_EMPTY_MESSAGE_TESTID)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('el disparador de alta solo se monta con `canModify` (R5, R19)', () => {
  it('con `canModify=false` no se monta', () => {
    renderVacio(false);

    expect(screen.queryByTestId(CUSTOMER_CREATE_OPEN_TESTID)).toBeNull();
  });

  it('con `canModify=true` se monta el disparador de alta', () => {
    renderVacio(true);

    expect(screen.getByTestId(CUSTOMER_CREATE_OPEN_TESTID)).toBeInTheDocument();
  });

  it('con `firstPageHref` presente, el disparador no se monta aunque `canModify` sea true (R20)', () => {
    renderVacio(true, '/clientes?page=1');

    expect(screen.queryByTestId(CUSTOMER_CREATE_OPEN_TESTID)).toBeNull();
    expect(screen.getByTestId(CUSTOMER_LIST_FIRST_PAGE_TESTID)).toBeInTheDocument();
  });
});

describe('la vuelta a la primera pagina es un enlace real y alcanzable con el dedo (R20, R39, R40)', () => {
  it('es un `<a>` con destino, no un boton disfrazado, y mide al menos 44x44', () => {
    renderVacio(false, '/clientes?page=1');

    const enlace = screen.getByTestId(CUSTOMER_LIST_FIRST_PAGE_TESTID);
    expect(enlace.tagName).toBe('A');
    expect(enlace).toHaveAttribute('href', '/clientes?page=1');
    expect(enlace).not.toHaveAttribute('role', 'button');
    expect(enlace.className).toContain('min-h-11');
    expect(enlace.className).toContain('min-w-11');
  });

  it('sin `firstPageHref` no se ofrece esa salida', () => {
    renderVacio(false);

    expect(screen.queryByTestId(CUSTOMER_LIST_FIRST_PAGE_TESTID)).toBeNull();
  });
});
