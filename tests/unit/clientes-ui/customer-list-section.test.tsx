// QC-155 T6 — Los cinco casos de la lista de clientes: R7, R19, R20, R22 (`design.md > 5.1`).
//
// `CustomerListSection` es un Server Component `async`, asi que se le llama como funcion y se
// renderiza lo que devuelve: es lo que permite ejercitar los cinco casos sin base de datos.
//
// **`listCustomersAction` esta mockeada.** Es el borde del modulo `clientes` (QC-154, `done` y
// mergeado), que esta ficha no abre (R35), y sustituirla es lo unico que permite ejercitar error,
// vacio, sin coincidencias y lista.
//
// **Los casos se distinguen por `data-testid` DISTINTOS** (R40), nunca por copy.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CUSTOMER_LIST_CLEAR_SEARCH_TESTID,
  CUSTOMER_LIST_NO_MATCHES_TESTID,
  CustomerListSection,
} from '@/app/(private)/clientes/components';
import type { DataTableParams } from '@/components/shared/data-table';
import type { CustomerView } from '@/lib/modules/clientes';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { CUSTOMERS_ROUTE } from '@/lib/shared/routes';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

const { listCustomersActionMock, routerMock } = vi.hoisted(() => ({
  listCustomersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
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
    listCustomersAction: listCustomersActionMock,
    getCustomerAction: vi.fn(noDebeInvocarse('getCustomerAction')),
    createCustomerAction: vi.fn(noDebeInvocarse('createCustomerAction')),
    updateCustomerAction: vi.fn(noDebeInvocarse('updateCustomerAction')),
    deleteCustomerAction: vi.fn(noDebeInvocarse('deleteCustomerAction')),
  };
});

const testId = {
  vacio: 'customer-list-empty',
  primeraPagina: 'customer-list-first-page',
  error: 'customer-list-error',
  errorMensaje: 'customer-list-error-message',
  errorCodigo: 'customer-list-error-code',
  tabla: 'customer-table',
} as const;

const DATO_QUE_NO_DEBE_VERSE = 'CLIENTE-SECRETO-NO-VISIBLE';

function parametros(overrides: Partial<DataTableParams> = {}): DataTableParams {
  return {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: null,
    filters: {},
    search: '',
    ...overrides,
  };
}

function cliente(overrides: Partial<CustomerView> = {}): CustomerView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    firstNames: 'Ana',
    lastNames: DATO_QUE_NO_DEBE_VERSE,
    city: 'Bogota',
    phone: null,
    email: null,
    address: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function pagina(items: readonly CustomerView[], overrides: Partial<{ page: number; totalPages: number }> = {}) {
  return {
    status: 'success' as const,
    data: {
      items,
      total: items.length,
      page: overrides.page ?? 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: overrides.totalPages ?? 1,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // El filtro de fecha de la tabla compartida usa `window.matchMedia`, que jsdom no implementa.
  // Se stubea con el helper HEREDADO (`tests/helpers/viewport.ts`), nunca con una copia local.
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('los casos se distinguen por data-testid (R19, R20, R22, R40)', () => {
  it('vacio: sin ningun cliente se pinta el estado propio de clientes, NO una tabla sin filas', async () => {
    listCustomersActionMock.mockResolvedValue(pagina([]));

    render(await CustomerListSection({ params: parametros(), canModify: false }));

    expect(screen.getByTestId(testId.vacio)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.error)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    // Vacio de verdad: no se ofrece «volver a la primera pagina», que es otro caso distinto (R20).
    expect(screen.queryByTestId(testId.primeraPagina)).toBeNull();
  });

  it('el disparador de alta del vacio solo aparece con `canModify` (R19, R5)', async () => {
    listCustomersActionMock.mockResolvedValue(pagina([]));

    render(await CustomerListSection({ params: parametros(), canModify: false }));
    expect(screen.queryByTestId('customer-create-open')).toBeNull();

    cleanup();
    render(await CustomerListSection({ params: parametros(), canModify: true }));
    expect(screen.getByTestId('customer-create-open')).toBeInTheDocument();
  });

  it('lista: con clientes se pinta la tabla y ninguno de los otros casos', async () => {
    listCustomersActionMock.mockResolvedValue(pagina([cliente()]));

    render(await CustomerListSection({ params: parametros(), canModify: false }));

    expect(screen.getByTestId(testId.tabla)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    expect(screen.queryByTestId(testId.error)).toBeNull();
  });

  it('error: se dice que fallo, con su mensaje y su codigo, y NO se pinta una tabla vacia (R22)', async () => {
    listCustomersActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La consulta no es valida.',
    });

    render(await CustomerListSection({ params: parametros(), canModify: false }));

    expect(screen.getByTestId(testId.error)).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(testId.errorMensaje)).toHaveTextContent('La consulta no es valida.');
    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('invalid_input');

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
  });

  it('el reintento del error enlaza a la MISMA consulta, derivada de CUSTOMERS_ROUTE (R22)', async () => {
    listCustomersActionMock.mockResolvedValue({
      status: 'error',
      code: 'unexpected',
      message: 'Fallo inesperado.',
    });

    render(
      await CustomerListSection({
        params: parametros({ page: 2, search: 'ana' }),
        canModify: false,
      }),
    );

    const enlace = screen.getByTestId('customer-list-retry');
    const destino = new URL(enlace.getAttribute('href') as string, 'http://localhost');
    expect(destino.pathname).toBe(CUSTOMERS_ROUTE);
    expect(destino.searchParams.get('page')).toBe('2');
    expect(destino.searchParams.get('q')).toBe('ana');
  });
});

describe('sin coincidencias: DENTRO de la tabla, con la caja montada (R20)', () => {
  it('con termino y cero filas pinta "sin coincidencias" dentro de la tabla, y NO el vacio de siempre', async () => {
    listCustomersActionMock.mockResolvedValue(pagina([]));

    render(
      await CustomerListSection({
        params: parametros({ search: 'sin-coincidencias' }),
        canModify: false,
      }),
    );

    const tabla = screen.getByTestId(testId.tabla);
    expect(within(tabla).getByTestId(CUSTOMER_LIST_NO_MATCHES_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    expect(within(tabla).getByTestId('data-table-search')).toHaveValue('sin-coincidencias');
  });

  it('«Limpiar la busqueda» enlaza sin `q`, con la primera pagina, y conserva tamano y orden', async () => {
    listCustomersActionMock.mockResolvedValue(pagina([]));

    render(
      await CustomerListSection({
        params: parametros({
          search: 'sin-coincidencias',
          page: 3,
          pageSize: 25,
          sort: { columnId: 'createdAt', direction: 'asc' },
          filters: { city: { kind: 'text', value: 'Cali' } },
        }),
        canModify: false,
      }),
    );

    const enlace = new URL(
      screen.getByTestId(CUSTOMER_LIST_CLEAR_SEARCH_TESTID).getAttribute('href') as string,
      'http://localhost',
    );
    expect(enlace.searchParams.has('q')).toBe(false);
    expect(enlace.searchParams.has('city')).toBe(false);
    expect(enlace.searchParams.get('page')).toBe('1');
    expect(enlace.searchParams.get('pageSize')).toBe('25');
    expect(enlace.searchParams.get('sort')).toBe('createdAt:asc');
  });

  it('sin termino y cero filas sigue siendo el vacio de siempre, sin "Limpiar la busqueda"', async () => {
    listCustomersActionMock.mockResolvedValue(pagina([]));

    render(await CustomerListSection({ params: parametros(), canModify: false }));

    expect(screen.getByTestId(testId.vacio)).toBeInTheDocument();
    expect(screen.queryByTestId(CUSTOMER_LIST_CLEAR_SEARCH_TESTID)).toBeNull();
  });
});

describe('la pagina que se quedo atras vuelve a la primera (R20)', () => {
  it('con la pagina vacia y page > 1 se ofrece el enlace a la primera, derivado de CUSTOMERS_ROUTE', async () => {
    listCustomersActionMock.mockResolvedValue(pagina([], { page: 4, totalPages: 2 }));

    render(await CustomerListSection({ params: parametros({ page: 4 }), canModify: false }));

    const enlace = screen.getByTestId(testId.primeraPagina);
    expect(enlace).toHaveAttribute('href', expect.stringContaining(`${CUSTOMERS_ROUTE}?`));
    expect(enlace.getAttribute('href')).toContain('page=1');
    // Sin busqueda ni filtro: NO es el caso «sin coincidencias».
    expect(screen.queryByTestId(CUSTOMER_LIST_NO_MATCHES_TESTID)).toBeNull();
  });
});

describe('la pantalla no autoriza nada por su cuenta (R7)', () => {
  it('con `unauthorized` no se muestra NI UN DATO de clientes', async () => {
    listCustomersActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso para consultar clientes.',
    });

    const { container } = render(
      await CustomerListSection({ params: parametros(), canModify: true }),
    );

    expect(screen.getByTestId(testId.error)).toBeInTheDocument();
    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('unauthorized');

    expect(container.textContent).not.toContain(DATO_QUE_NO_DEBE_VERSE);
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('una sola llamada de lectura por pantalla (R7)', () => {
  it('se invoca listCustomersAction UNA vez, con los parametros enteros y sin traducir', async () => {
    const params = parametros({ page: 2, pageSize: 25 });
    listCustomersActionMock.mockResolvedValue(pagina([cliente()], { page: 2, totalPages: 3 }));

    render(await CustomerListSection({ params, canModify: false }));

    expect(listCustomersActionMock).toHaveBeenCalledTimes(1);
    expect(listCustomersActionMock).toHaveBeenCalledWith(params);
    expect(Object.keys(listCustomersActionMock.mock.calls[0][0] as object).sort()).toEqual([
      'filters',
      'page',
      'pageSize',
      'search',
      'sort',
    ]);
  });
});

describe('`canModify` solo se transporta hasta la tabla (R5, R8)', () => {
  it('con `canModify=true` las acciones de fila se emiten', async () => {
    listCustomersActionMock.mockResolvedValue(pagina([cliente()]));

    render(await CustomerListSection({ params: parametros(), canModify: true }));

    expect(screen.getByTestId('customer-row-actions')).toBeInTheDocument();
  });

  it('con `canModify=false` no se emite ninguna escritura', async () => {
    listCustomersActionMock.mockResolvedValue(pagina([cliente()]));

    render(await CustomerListSection({ params: parametros(), canModify: false }));

    expect(screen.queryByTestId('customer-row-actions')).toBeNull();
    expect(screen.queryByTestId('customer-create-open')).toBeNull();
  });
});
