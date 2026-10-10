import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCompanyOrdersColumns,
  buildConditioningOrdersColumns,
  buildFinishedOrdersColumns,
  PackingOrdersListSection,
} from '@/app/(private)/asignacion/components';
import { buildCustomerColumns } from '@/app/(private)/clientes/components';
import { buildPresentationColumns } from '@/app/(private)/configuracion/presentaciones/components';
import {
  buildExecutionTraceColumns,
  createDefaultExecutionTraceListParams,
} from '@/app/(private)/dashboard/components';
import {
  buildFinishedStockColumns,
  buildProductColumns,
  ProductBatchesPanel,
} from '@/app/(private)/inventario/components';
import { buildOrderColumns, OrderIngredientsTable } from '@/app/(private)/pedidos/components';
import { buildRecipeColumns } from '@/app/(private)/produccion/formulas/components';
import { buildCatalogColumns } from '@/app/(private)/proveedores/[id]/components';
import { DataTable } from '@/components/shared/data-table/data-table';
import { createDefaultParams } from '@/components/shared/data-table/data-table-params';
import type {
  DataTableColumn,
  DataTableParams,
  DataTableTexts,
} from '@/components/shared/data-table/data-table-types';
import type { ProductBatchView } from '@/lib/modules/inventario';

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

/** Columnas de cuerpo en Plex Mono, por archivo. Ninguna otra columna de esos archivos lo lleva. */
type ColumnasDeArchivo = {
  readonly archivo: string;
  readonly construir: () => Promise<readonly { readonly label: string; readonly tabular?: boolean }[]>;
  readonly esperadas: readonly string[];
};

const sinAcciones = () => null;

const LISTA_CERRADA: readonly ColumnasDeArchivo[] = [
  {
    archivo: 'order-columns.tsx',
    construir: async () =>
      buildOrderColumns({ recipes: { items: [], totalPages: 1 }, units: [], bridge: null }),
    esperadas: ['Cantidad', 'Fecha de solicitud'],
  },
  {
    archivo: 'customer-columns.tsx',
    construir: async () => buildCustomerColumns({ rowActions: sinAcciones }),
    esperadas: ['Fecha de alta', 'Última modificación'],
  },
  {
    archivo: 'recipe-columns.tsx',
    construir: async () => buildRecipeColumns({ rowActions: sinAcciones }),
    esperadas: ['Creado', 'Actualizado'],
  },
  {
    archivo: 'catalog-columns.tsx',
    construir: async () =>
      buildCatalogColumns({
        directories: { presentations: new Map(), units: new Map() },
        rowActions: sinAcciones,
      }),
    esperadas: ['Mínimo de compra', 'Creado', 'Actualizado'],
  },
  {
    archivo: 'product-columns.tsx',
    construir: async () => buildProductColumns({ rowActions: sinAcciones }),
    esperadas: ['Existencia', 'Alerta de cantidad', 'Reservado', 'Disponible'],
  },
  {
    archivo: 'finished-stock-columns.tsx',
    construir: async () => buildFinishedStockColumns({ onToggle: vi.fn(), lineActions: sinAcciones }),
    esperadas: ['Existencia', 'Alerta de cantidad'],
  },
  {
    archivo: 'presentation-columns.tsx',
    construir: async () => buildPresentationColumns([]),
    esperadas: ['Contenido'],
  },
  {
    archivo: 'company-orders-columns.tsx',
    construir: async () => buildCompanyOrdersColumns({ showFinishedAt: true }),
    esperadas: ['Fecha de terminado'],
  },
  {
    archivo: 'finished-orders-columns.tsx',
    construir: async () => buildFinishedOrdersColumns(),
    esperadas: ['Fecha de terminado'],
  },
  {
    archivo: 'conditioning-orders-columns.tsx',
    construir: async () => buildConditioningOrdersColumns(),
    esperadas: ['Envases'],
  },
  {
    archivo: 'packing-orders-columns.tsx',
    // Arriba se sustituye este modulo para la seccion de empaque: aqui se mide el real.
    construir: async () =>
      (
        await vi.importActual<
          typeof import('@/app/(private)/asignacion/components/packing-orders-columns')
        >('@/app/(private)/asignacion/components/packing-orders-columns')
      ).buildPackingOrdersColumns(),
    esperadas: ['Envases'],
  },
  {
    archivo: 'execution-trace-columns.tsx',
    construir: async () =>
      buildExecutionTraceColumns({
        personOptions: [],
        params: createDefaultExecutionTraceListParams(),
      }),
    esperadas: ['Primera anotación', 'Última anotación'],
  },
];

describe('lista cerrada de columnas en Plex Mono', () => {
  it.each(LISTA_CERRADA)(
    'R11, R13: en $archivo llevan tabular exactamente las columnas de la lista',
    async ({ construir, esperadas }) => {
      const columnas = await construir();
      const marcadas = columnas.filter((columna) => columna.tabular === true).map((c) => c.label);
      expect(marcadas).toEqual(esperadas);
    },
  );

  it('R11, R13: los ingredientes del pedido pintan en Mono sus cuatro cifras y no el producto ni la cabecera', () => {
    render(
      <OrderIngredientsTable
        lines={[
          {
            id: 'linea-1',
            productId: 'producto-1',
            productName: 'Hipoclorito',
            percentage: '10.00',
            productUnitId: null,
            productStock: '15.0000',
          },
        ]}
        units={[]}
        quantity="200"
        orderUnitId=""
        bridge={null}
        loading={false}
        error={null}
      />,
    );
    for (const testId of [
      'order-ingredient-percentage',
      'order-ingredient-stock',
      'order-ingredient-required',
      'order-ingredient-remaining',
    ]) {
      expect(screen.getByTestId(testId), testId).toHaveClass('font-mono', 'tabular-nums');
    }
    expect(screen.getByTestId('order-ingredient-product')).not.toHaveClass('font-mono');
    for (const head of screen.getAllByRole('columnheader')) {
      expect(head).not.toHaveClass('font-mono');
      expect(head).not.toHaveClass('tabular-nums');
    }
  });
});

describe('panel de lotes con la nueva marca', () => {
  it('R12: lote, cantidades y fechas del panel van en Mono con cifras tabulares, y sus etiquetas no', () => {
    const lote: ProductBatchView = {
      id: 'b1',
      lot: 'L-001',
      stock: '10',
      unitId: null,
      purchaseDate: '2026-03-05',
      expiryDate: '2027-03-05',
      packageContent: null,
      reserved: '4',
      available: '6',
    };
    render(<ProductBatchesPanel batches={[lote]} />);

    for (const testId of [
      'product-batch-lot',
      'product-batch-quantity',
      'product-batch-purchase-date',
      'product-batch-expiry-date',
      'product-batch-reserved',
      'product-batch-available',
    ]) {
      const dd = screen.getByTestId(testId);
      expect(dd.tagName, testId).toBe('DD');
      expect(dd, testId).toHaveClass('font-mono', 'tabular-nums');
    }
    const etiquetas = screen.getByTestId('product-batches-panel').querySelectorAll('dt');
    expect(etiquetas).toHaveLength(6);
    for (const dt of etiquetas) {
      expect(dt).not.toHaveClass('font-mono');
    }
  });
});
