import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDefaultParams,
  DataTable,
  withSearch,
  type DataTableColumn,
  type DataTableParams,
  type DataTableProps,
  type DataTableStates,
  type DataTableTexts,
} from '@/components/shared/data-table';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
  UNEXPECTED_ERROR_NOTICE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import { UNEXPECTED_ERROR_CODE, errorMessage, type ErrorState as OperationError } from '@/lib/modules/errores';

/**
 * QC-231 T8: `states` en la `DataTable` (R16-R19, D4, D5). Con `states`, cargando, error y vacío
 * sustituyen a TODA la tabla: ni `data-table`, ni barras, ni paginación. Sin la clave del estado,
 * la tabla sigue como hoy (R19). Asserts sobre `data-testid` y rol, nunca sobre el copy.
 */

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

afterEach(cleanup);

const texts: DataTableTexts = {
  empty: 'vacio',
  loading: 'cargando',
  error: 'fallo',
  search: 'buscar',
  filters: 'filtros',
  columnMenu: 'menu-columna',
  previousPage: 'anterior',
  nextPage: 'siguiente',
  pageIndicator: (page, totalPages) => `${page}/${totalPages}`,
  pageSize: 'tamano',
  sortAscending: 'asc',
  sortDescending: 'desc',
  pinColumn: 'fijar',
  unpinColumn: 'soltar',
  filterColumn: 'filtrar',
  clearFilter: 'limpiar',
  lastWeek: 'ultima semana',
  lastMonth: 'ultimo mes',
  lastYear: 'ultimo año',
};

type Fila = { readonly id: string; readonly nombre: string };

const FILAS: readonly Fila[] = [
  { id: 'f1', nombre: 'Primera' },
  { id: 'f2', nombre: 'Segunda' },
];

const COLUMNAS: readonly DataTableColumn<Fila>[] = [
  { id: 'nombre', label: 'Nombre', align: 'start', cell: (row) => row.nombre },
  { id: 'id', label: 'Id', align: 'end', cell: (row) => row.id },
];

const REFERENCIA = '7b1c9f2e-4d3a-4f5b-9c0d-1e2f3a4b5c6d';

const INESPERADO: OperationError = {
  status: 'error',
  code: UNEXPECTED_ERROR_CODE,
  message: errorMessage(UNEXPECTED_ERROR_CODE),
  reference: REFERENCIA,
};

const PARAMS = createDefaultParams();

const STATES: DataTableStates = {
  loading: {
    columns: COLUMNAS.length,
    rows: PARAMS.pageSize,
    label: 'cargando-lista',
    testId: 'lista-skeleton',
    rowTestId: 'lista-skeleton-row',
  },
  error: {
    error: INESPERADO,
    title: 'no-se-pudo',
    testId: 'lista-error',
    retry: { kind: 'refresh' },
    retryTestId: 'lista-error-retry',
  },
  empty: {
    testId: 'lista-empty',
    message: 'sin-elementos',
    firstPage: { href: '/lista/nuevo', label: 'crear', testId: 'lista-empty-create' },
  },
};

function renderTabla(overrides: Partial<DataTableProps<Fila>> = {}) {
  const props: DataTableProps<Fila> = {
    tableId: 'states-test',
    columns: COLUMNAS,
    rows: FILAS,
    getRowId: (row) => row.id,
    params: PARAMS,
    totalPages: 1,
    onParamsChange: vi.fn<(next: DataTableParams) => void>(),
    status: 'idle',
    texts,
    ...overrides,
  };
  return render(<DataTable {...props} />);
}

function expectSinTablaNiBarras() {
  expect(screen.queryByTestId('data-table')).toBeNull();
  expect(screen.queryByTestId('data-table-filters')).toBeNull();
  expect(screen.queryByTestId('data-table-search')).toBeNull();
  expect(screen.queryByTestId('data-table-pagination')).toBeNull();
}

describe('DataTable con states: cargando (R16)', () => {
  it('pinta TableSkeleton en lugar de toda la tabla, con tantas filas como el tamaño de página', () => {
    const { container } = renderTabla({ status: 'loading', states: STATES });

    const esqueleto = screen.getByTestId('lista-skeleton');
    expect(esqueleto).toHaveAttribute('role', 'status');
    expect(screen.getAllByTestId('lista-skeleton-row')).toHaveLength(PARAMS.pageSize);
    expectSinTablaNiBarras();
    expect(screen.queryByTestId('data-table-loading')).toBeNull();
    // Sin envoltorio nuevo: el esqueleto es la raíz.
    expect(container.firstElementChild).toBe(esqueleto);
  });
});

describe('DataTable con states: error (R17)', () => {
  it('pinta ErrorState en lugar de toda la tabla, con Reintentar y la referencia del error inesperado', () => {
    const { container } = renderTabla({ status: 'error', states: STATES });

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveAttribute('data-testid', 'lista-error');
    expect(container.firstElementChild).toBe(alerta);
    expect(screen.getByTestId('lista-error-retry')).toBeInTheDocument();
    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(REFERENCIA);
    expectSinTablaNiBarras();
    expect(screen.queryByTestId('data-table-error')).toBeNull();
    // Ningún dato de la lista.
    expect(screen.queryByText('Primera')).toBeNull();
    expect(screen.queryByTestId('data-table-row-f1')).toBeNull();
  });
});

describe('DataTable con states: vacío (R18, D5)', () => {
  it('sin búsqueda ni filtro, pinta EmptyState en lugar de toda la tabla', () => {
    const { container } = renderTabla({ rows: [], states: STATES });

    const vacio = screen.getByTestId('lista-empty');
    expect(container.firstElementChild).toBe(vacio);
    expect(screen.getByTestId('lista-empty-create')).toHaveAttribute('href', '/lista/nuevo');
    expectSinTablaNiBarras();
    expect(screen.queryByTestId('data-table-empty')).toBeNull();
  });

  it('con búsqueda activa y sin states.empty, sigue el «sin resultados» de la tabla con sus barras', () => {
    const sinVacio: DataTableStates = { loading: STATES.loading, error: STATES.error };
    renderTabla({ rows: [], params: withSearch(PARAMS, 'zzz'), states: sinVacio });

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-empty')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-filters')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-search')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-pagination')).toBeInTheDocument();
    expect(screen.queryByTestId('lista-empty')).toBeNull();
  });
});

describe('DataTable sin la clave del estado: como hoy (R19)', () => {
  it('sin states, cargando, error y vacío pintan los estados internos dentro de data-table', () => {
    const { unmount } = renderTabla({ status: 'loading' });
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-loading')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-pagination')).toBeInTheDocument();
    unmount();

    const segundo = renderTabla({ status: 'error', errorMessage: 'fallo de red' });
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-error')).toBeInTheDocument();
    segundo.unmount();

    renderTabla({ rows: [] });
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-empty')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-filters')).toBeInTheDocument();
  });

  it('con states pero sin la clave de un estado, ese estado sigue como hoy', () => {
    renderTabla({ status: 'error', states: { loading: STATES.loading } });

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-error')).toBeInTheDocument();
    expect(screen.queryByTestId('lista-error')).toBeNull();
  });

  it('con filas, states no cambia nada: se pintan las filas con barras y paginación', () => {
    renderTabla({ states: STATES });

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-f1')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-pagination')).toBeInTheDocument();
    expect(screen.queryByTestId('lista-skeleton')).toBeNull();
    expect(screen.queryByTestId('lista-error')).toBeNull();
    expect(screen.queryByTestId('lista-empty')).toBeNull();
  });
});
