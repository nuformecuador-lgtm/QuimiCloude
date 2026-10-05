import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ASSIGNED_ORDERS_SKELETON_COLUMN_COUNT,
  AssignedOrdersEmpty,
  AssignedOrdersError,
  AssignedOrdersSkeleton,
  buildAssignedOrdersColumns,
} from '@/app/(private)/asignacion/components';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';

// `AssignedOrdersError` usa `useRouter` para reintentar y en jsdom no hay router montado.
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

afterEach(() => {
  cleanup();
});

describe('R29 - el estado vacio, fuera de la tabla y distinguible del error', () => {
  it('sin firstPageHref: copy de «no tienes pedidos asignados», sin enlace de volver', () => {
    render(<AssignedOrdersEmpty />);

    expect(screen.getByTestId('assigned-orders-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('assigned-orders-first-page')).not.toBeInTheDocument();
  });

  it('con firstPageHref: ofrece volver a la primera pagina (la pagina pedida se quedo atras)', () => {
    render(<AssignedOrdersEmpty firstPageHref="/asignacion?page=1&pageSize=10" />);

    const link = screen.getByTestId('assigned-orders-first-page');
    expect(link).toHaveAttribute('href', '/asignacion?page=1&pageSize=10');
  });
});

describe('R28 - el estado de error, fuera de la tabla y sin ningun dato', () => {
  it('un error catalogado pinta su mensaje y su codigo', () => {
    const error: ErrorState = { status: 'error', code: 'unauthorized', message: 'No autorizado' };
    render(<AssignedOrdersError error={error} />);

    expect(screen.getByTestId('assigned-orders-error')).toBeInTheDocument();
    expect(screen.getByTestId('assigned-orders-error-message')).toHaveTextContent('No autorizado');
    expect(screen.getByTestId('assigned-orders-error-code')).toHaveTextContent('unauthorized');
  });

  it('el error INESPERADO usa el aviso compartido con su identificador de peticion', () => {
    const error: ErrorState = {
      status: 'error',
      code: UNEXPECTED_ERROR_CODE,
      message: 'Fallo inesperado',
      reference: 'req-123',
    };
    render(<AssignedOrdersError error={error} />);

    expect(screen.queryByTestId('assigned-orders-error-code')).not.toBeInTheDocument();
    expect(screen.getByText(/req-123/)).toBeInTheDocument();
  });
});

describe('R30 - el esqueleto declara tantas columnas como la tabla', () => {
  it('la constante del esqueleto coincide con cuantas columnas declara la tabla', () => {
    expect(ASSIGNED_ORDERS_SKELETON_COLUMN_COUNT).toBe(buildAssignedOrdersColumns({ canExecute: true }).length);
  });

  it('lo pintado coincide con lo declarado: tantas cabeceras como columnas', () => {
    render(<AssignedOrdersSkeleton rows={3} canExecute />);

    expect(screen.getAllByRole('columnheader')).toHaveLength(ASSIGNED_ORDERS_SKELETON_COLUMN_COUNT);
  });

  it('tantas filas como pide `rows`, y tantas celdas por fila como columnas', () => {
    render(<AssignedOrdersSkeleton rows={3} canExecute />);

    const filas = screen.getAllByTestId('assigned-order-row-skeleton');
    expect(filas).toHaveLength(3);
    for (const fila of filas) {
      expect(fila.querySelectorAll('td')).toHaveLength(ASSIGNED_ORDERS_SKELETON_COLUMN_COUNT);
    }
  });
});
