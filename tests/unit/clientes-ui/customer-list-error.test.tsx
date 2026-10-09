// El estado de error de la lista de clientes, que pinta `CustomerTable` con `status="error"`.
//
// El reintento es un ENLACE a `customerListHref(params)`, no
// `router.refresh()`: pedir de nuevo la misma URL vuelve a ejecutar el Server Component que hizo
// la consulta.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CUSTOMER_LIST_ERROR_CODE_TESTID,
  CUSTOMER_LIST_ERROR_MESSAGE_TESTID,
  CUSTOMER_LIST_ERROR_TESTID,
  CUSTOMER_LIST_RETRY_TESTID,
  CustomerTable,
  customerListHref,
} from '@/app/(private)/clientes/components';
import type { DataTableParams } from '@/components/shared/data-table';
import { UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID } from '@/components/shared/unexpected-error-notice';
import type { ErrorState } from '@/lib/modules/errores';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import { REFERENCIA_DEL_CASO, errorInesperado } from '../../helpers/identificador-de-request';
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

function parametros(overrides: Partial<DataTableParams> = {}): DataTableParams {
  return { page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: null, filters: {}, search: '', ...overrides };
}

const PARAMS = parametros();
const RETRY_HREF = customerListHref(PARAMS);

/** Los codigos con los que la lectura de la lista puede rechazarse. */
const CODIGOS: readonly ErrorState[] = [
  { status: 'error', code: 'unauthorized', message: 'No tienes permiso.' },
  { status: 'error', code: 'invalid_input', message: 'La consulta no es válida.' },
];

function renderError(error: ErrorState, params: DataTableParams = PARAMS) {
  return render(
    <CustomerTable
      status="error"
      error={error}
      customers={[]}
      params={params}
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

describe('el error es identificable y dice QUE paso, con su codigo estable (R22, R40)', () => {
  for (const error of CODIGOS) {
    it(`el codigo ${error.code} se pinta aparte del mensaje devuelto`, () => {
      renderError(error);

      expect(screen.getByTestId(CUSTOMER_LIST_ERROR_TESTID)).toHaveAttribute('role', 'alert');
      expect(screen.getByTestId(CUSTOMER_LIST_ERROR_MESSAGE_TESTID)).toHaveTextContent(error.message);
      expect(screen.getByTestId(CUSTOMER_LIST_ERROR_CODE_TESTID)).toHaveTextContent(error.code);
    });
  }

  it('NO pinta ninguna tabla: «fallo» no es «no hay clientes» (R7, R22)', () => {
    renderError(CODIGOS[0]!);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryAllByRole('row')).toHaveLength(0);
  });
});

describe('el reintento es un enlace real a la propia lista, alcanzable con el dedo (R22, R39, R40)', () => {
  it('es un `<a>` con el destino de `customerListHref(params)`, no un boton', () => {
    renderError(CODIGOS[0]!);

    const enlace = screen.getByTestId(CUSTOMER_LIST_RETRY_TESTID);
    expect(enlace.tagName).toBe('A');
    expect(enlace).toHaveAttribute('href', RETRY_HREF);
    expect(enlace).not.toHaveAttribute('role', 'button');
  });

  it('mide al menos 44x44 px y no depende de `:hover` para aparecer', () => {
    renderError(CODIGOS[0]!);

    const enlace = screen.getByTestId(CUSTOMER_LIST_RETRY_TESTID);
    expect(enlace.className).toContain('min-h-11');
    expect(enlace.className).toContain('min-w-11');
    expect(enlace.className).not.toContain('hover:block');
    expect(enlace).toBeVisible();
  });

  it('se alcanza por su rol de enlace y con un nombre accesible', () => {
    renderError(CODIGOS[0]!);

    const enlace = within(screen.getByTestId(CUSTOMER_LIST_ERROR_TESTID)).getByRole('link');
    expect(enlace).toBe(screen.getByTestId(CUSTOMER_LIST_RETRY_TESTID));
    expect(enlace).toHaveAccessibleName();
  });

  it('no recorta la consulta vigente: los parametros llegan intactos al `href`', () => {
    const params = parametros({
      page: 3,
      search: 'ana',
      pageSize: 25,
      sort: { columnId: 'createdAt', direction: 'asc' },
    });
    renderError(CODIGOS[0]!, params);

    const destino = new URL(
      screen.getByTestId(CUSTOMER_LIST_RETRY_TESTID).getAttribute('href') as string,
      'http://localhost',
    );
    expect(destino.searchParams.get('page')).toBe('3');
    expect(destino.searchParams.get('q')).toBe('ana');
    expect(destino.searchParams.get('pageSize')).toBe('25');
    expect(destino.searchParams.get('sort')).toBe('createdAt:asc');
  });
});

describe('el error INESPERADO conserva el identificador de la peticion (QC-71)', () => {
  it('lo pinta el componente compartido, no una segunda region propia', () => {
    renderError(errorInesperado());

    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      REFERENCIA_DEL_CASO,
    );
    expect(screen.queryByTestId(CUSTOMER_LIST_ERROR_CODE_TESTID)).toBeNull();
    expect(screen.getByTestId(CUSTOMER_LIST_RETRY_TESTID)).toBeVisible();
  });
});
