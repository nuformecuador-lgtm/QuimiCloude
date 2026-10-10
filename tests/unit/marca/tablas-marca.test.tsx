import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PackingOrdersListSection } from '@/app/(private)/asignacion/components';
import { DataTable } from '@/components/shared/data-table/data-table';
import { createDefaultParams } from '@/components/shared/data-table/data-table-params';
import type {
  DataTableColumn,
  DataTableParams,
  DataTableTexts,
} from '@/components/shared/data-table/data-table-types';

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

// La seccion de empaque pinta sus propias celdas: se le da una columna marcada para medir
// que respeta la prop sin depender de que lista de columnas lleve hoy la marca.
vi.mock('@/app/(private)/asignacion/components/packing-orders-columns', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('@/app/(private)/asignacion/components/packing-orders-columns')>();
  return {
    ...real,
    buildPackingOrdersColumns: () => [
      { id: 'numero', label: 'Numero', align: 'start', cell: (row: { numberText: string }) => row.numberText },
      {
        id: 'envases',
        label: 'Envases',
        align: 'end',
        tabular: true,
        cell: (row: { packages: string }) => row.packages,
      },
    ],
  };
});

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
  scrollLeft: 'ir-a-la-izquierda',
  scrollRight: 'ir-a-la-derecha',
};

type Lote = { readonly id: string; readonly nombre: string; readonly cantidad: string };

const LOTES: readonly Lote[] = [
  { id: 'l1', nombre: 'Primero', cantidad: '10' },
  { id: 'l2', nombre: 'Segundo', cantidad: '20' },
];

const COLUMNS: readonly DataTableColumn<Lote>[] = [
  { id: 'nombre', label: 'Nombre', align: 'start', cell: (row) => row.nombre, defaultPinned: 'left' },
  { id: 'cantidad', label: 'Cantidad', align: 'end', tabular: true, cell: (row) => row.cantidad },
];

function renderTabla(tableId: string) {
  return render(
    <DataTable
      tableId={tableId}
      columns={COLUMNS}
      rows={LOTES}
      getRowId={(row) => row.id}
      params={createDefaultParams()}
      totalPages={1}
      onParamsChange={vi.fn<(next: DataTableParams) => void>()}
      status="idle"
      texts={texts}
    />,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('tablas con la nueva marca', () => {
  it('R10: la cabecera de la tabla tiene fondo muted y texto muted-foreground', () => {
    renderTabla('marca-cabecera');
    const head = screen.getByTestId('data-table-head-cantidad');
    expect(head).toHaveClass('text-muted-foreground');
    expect(head).not.toHaveClass('text-foreground');
    const thead = head.closest('thead');
    expect(thead).not.toBeNull();
    expect(thead).toHaveClass('bg-muted');
  });

  it('R10: la columna fijada de la cabecera usa bg-muted y la del cuerpo sigue en bg-background', () => {
    renderTabla('marca-fijada');
    const head = screen.getByTestId('data-table-head-nombre');
    expect(head).toHaveAttribute('data-pinned', 'left');
    expect(head).toHaveClass('bg-muted');
    expect(head).not.toHaveClass('bg-background');

    const [cell] = screen.getAllByTestId('data-table-cell-nombre');
    expect(cell).toHaveAttribute('data-pinned', 'left');
    expect(cell).toHaveClass('bg-background');
  });

  it('R11: la celda de cuerpo de una columna tabular lleva Plex Mono y cifras tabulares', () => {
    renderTabla('marca-tabular');
    for (const cell of screen.getAllByTestId('data-table-cell-cantidad')) {
      expect(cell.tagName).toBe('TD');
      expect(cell).toHaveClass('font-mono', 'tabular-nums');
    }
  });

  it('R13: la cabecera de una columna tabular y las celdas sin la marca siguen en Sans', () => {
    renderTabla('marca-sans');
    const head = screen.getByTestId('data-table-head-cantidad');
    expect(head.tagName).toBe('TH');
    expect(head).not.toHaveClass('font-mono');
    expect(head).not.toHaveClass('tabular-nums');
    for (const cell of screen.getAllByTestId('data-table-cell-nombre')) {
      expect(cell).not.toHaveClass('font-mono');
      expect(cell).not.toHaveClass('tabular-nums');
    }
  });

  it('R11, R13: la lista de empaque respeta la marca en td y no en th', async () => {
    getSessionUserMock.mockResolvedValue({
      id: 'u-1',
      username: 'empacador.prueba',
      displayName: 'Empacador de Prueba',
      roleName: 'Empacador',
      permissions: ['empaque.modificar'],
    });
    getSessionContextMock.mockResolvedValue({ companyId: 'company-1' });
    listPackingOrdersMock.mockResolvedValue({
      items: [
        {
          id: 'order-1',
          numberText: '2026-0000030',
          recipeName: 'Jarabe simple',
          quantity: '20',
          presentationLines: [],
          unitId: null,
          unitLabel: null,
          packages: '4',
          status: 'POR_EMPACAR',
          packedByName: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    render(
      await PackingOrdersListSection({
        params: { page: 1, pageSize: 10, sort: null, filters: {}, search: '' },
      }),
    );

    const table = screen.getByTestId('packing-orders-table');
    const [numeroHead, envasesHead] = within(table).getAllByRole('columnheader');
    expect(envasesHead).not.toHaveClass('font-mono');
    expect(numeroHead).not.toHaveClass('font-mono');

    const row = screen.getByTestId('packing-order-row');
    const [numeroCell, envasesCell] = within(row).getAllByRole('cell');
    expect(envasesCell).toHaveClass('font-mono', 'tabular-nums');
    expect(numeroCell).not.toHaveClass('font-mono');
  });
});
