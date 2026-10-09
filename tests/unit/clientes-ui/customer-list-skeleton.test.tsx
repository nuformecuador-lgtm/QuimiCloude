// El esqueleto declara tantas columnas como la tabla.
//
// `CUSTOMER_SKELETON_COLUMN_COUNT` es una constante escrita a mano, asi que lo unico que impide
// que se quede atras en silencio es que alguien cuente las dos cosas. El esqueleto lo pinta
// `CustomerTable` con `status="loading"`, que es el `fallback` de la pagina.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CUSTOMER_SKELETON_COLUMN_COUNT,
  CustomerTable,
  buildCustomerColumns,
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

const CUSTOMER_COLUMNS = buildCustomerColumns({ rowActions: () => null });

function parametros(pageSize: number = DEFAULT_PAGE_SIZE): DataTableParams {
  return { page: 1, pageSize, sort: null, filters: {}, search: '' };
}

function renderEsqueleto(rows: number) {
  return render(
    <CustomerTable
      status="loading"
      customers={[]}
      params={parametros(rows)}
      totalPages={0}
      canModify={false}
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

describe('el esqueleto y la tabla declaran el MISMO numero de columnas (R21)', () => {
  it('la constante del esqueleto coincide con cuantas columnas declara la tabla', () => {
    expect(CUSTOMER_SKELETON_COLUMN_COUNT).toBe(CUSTOMER_COLUMNS.length);
  });

  it('lo pintado coincide con lo declarado: tantas cabeceras como columnas', () => {
    renderEsqueleto(3);

    expect(screen.getAllByRole('columnheader')).toHaveLength(CUSTOMER_SKELETON_COLUMN_COUNT);
  });

  it('y tantas celdas por fila como columnas, en TODAS las filas', () => {
    renderEsqueleto(3);

    const filas = screen.getAllByTestId('customer-row-skeleton');
    expect(filas).toHaveLength(3);
    for (const fila of filas) {
      expect(fila.querySelectorAll('td')).toHaveLength(CUSTOMER_SKELETON_COLUMN_COUNT);
    }
  });

  it('se anuncia como region en carga, sin desmontar nada (R21)', () => {
    renderEsqueleto(2);

    const region = screen.getByTestId('customer-list-skeleton');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveAttribute('aria-busy', 'true');
  });
});
