// QC-35 T7 — La tabla de la lista de pedidos: R7, R13, R14, R15, R17, R19, R20.
//
// **`useRouter` esta mockeada**: la tabla no navega de verdad en jsdom, pero lo que importa es
// que emita **la consulta exacta**, y eso se afirma sobre el `href` que recibe `router.push`.
//
// **Ningun assert sobre copy** (R44): filas, celdas y controles se localizan por los
// `data-testid` del componente compartido y por constantes exportadas.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupUser } from '../../helpers/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_NUMBER_COLUMN_ID,
  OrderTable,
  STATUS_COLUMN_ID,
  buildOrderListQuery,
} from '@/app/(private)/pedidos/components';
import type { DataTableParams } from '@/components/shared/data-table';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { ORDERS_ROUTE } from '@/lib/shared/routes';
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

// Dobles que FALLAN si se les llama: la tabla no lee ni escribe nada (R43).
vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la tabla`);
  };
  return {
    listOrdersAction: vi.fn(noDebeInvocarse('listOrdersAction')),
    getOrderAction: vi.fn(noDebeInvocarse('getOrderAction')),
    createOrderAction: vi.fn(noDebeInvocarse('createOrderAction')),
    updateOrderAction: vi.fn(noDebeInvocarse('updateOrderAction')),
    cancelOrderAction: vi.fn(noDebeInvocarse('cancelOrderAction')),
    deleteOrderAction: vi.fn(noDebeInvocarse('deleteOrderAction')),
  };
});

function pedido(id: string, sequence: number, overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id,
    number: { year: 2026, sequence },
    numberText: formatOrderNumber({ year: 2026, sequence }),
    recipeId: '22222222-2222-4222-8222-222222222222',
    recipeName: `Receta ${sequence}`,
    quantity: '1.0000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    cancellationReason: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

/** Llegan a proposito DESORDENADOS respecto de cualquier criterio: R13 se comprueba con ellos. */
const PEDIDOS: readonly OrderSummary[] = [
  pedido('o3', 30, { priority: 'BAJA' }),
  pedido('o1', 10, { priority: 'CRITICA' }),
  pedido('o2', 20, { priority: 'ALTA' }),
];

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

/**
 * Los dos catalogos que la tabla PROPAGA hasta la celda de acciones (panel de edicion). Vacios:
 * ningun caso de este archivo abre el panel, y lo que se comprueba aqui es la lista.
 */
const RECETAS = { items: [], totalPages: 1 };

function montar(overrides: Partial<DataTableParams> = {}, totalPages = 3) {
  const params = parametros(overrides);
  render(
    <OrderTable
      orders={PEDIDOS}
      params={params}
      totalPages={totalPages}
      recipes={RECETAS}
    />,
  );
  return params;
}

/** El ultimo destino al que la tabla pidio navegar. */
function ultimoDestino(): string {
  const ultima = routerMock.push.mock.calls.at(-1);
  if (ultima === undefined) throw new Error('La tabla no navego');
  return ultima[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // jsdom no implementa `window.matchMedia` y el filtro de fecha de la tabla compartida lo usa
  // para elegir 1 o 2 meses de calendario. Se stubea con el helper HEREDADO
  // (`tests/helpers/viewport.ts`), nunca con una copia local (R47).
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('la tabla estrena el componente compartido y no declara uno propio (R7)', () => {
  it('monta `DataTable` con una fila por pedido', () => {
    montar();

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-o1')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-o2')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-o3')).toBeInTheDocument();
  });
});

describe('las filas se pintan en el orden en que llegan (R13)', () => {
  it('no se reordena, ni se filtra, ni se recorta en el cliente aunque los parametros digan otra cosa', () => {
    montar({
      page: 99,
      sort: { columnId: ORDER_NUMBER_COLUMN_ID, direction: 'desc' },
      filters: { [STATUS_COLUMN_ID]: { kind: 'select', values: ['CANCELADO'] } },
    });

    const filas = screen.getAllByRole('row').slice(1);
    expect(filas.map((fila) => fila.getAttribute('data-testid'))).toEqual([
      'data-table-row-o3',
      'data-table-row-o1',
      'data-table-row-o2',
    ]);
    // Ninguna fila desaparece por el filtro de estado, que ninguna cumple.
    expect(filas).toHaveLength(PEDIDOS.length);
  });
});

describe('la caja de busqueda NO existe (R20)', () => {
  it('no se pinta inerte ni deshabilitada: no esta en el DOM', () => {
    montar();

    expect(screen.queryByTestId('data-table-search')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('ninguna navegacion de la tabla escribe un termino de busqueda en la URL', async () => {
    montar();

    await userEvent.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino()).not.toContain('search');
  });
});

describe('la columna del correlativo esta fijada al montar (R19)', () => {
  it('sin ninguna preferencia guardada, su cabecera y sus celdas nacen fijadas a la izquierda', () => {
    montar();

    expect(screen.getByTestId(`data-table-head-${ORDER_NUMBER_COLUMN_ID}`)).toHaveAttribute(
      'data-pinned',
      'left',
    );
    const celdas = screen.getAllByTestId(`data-table-cell-${ORDER_NUMBER_COLUMN_ID}`);
    expect(celdas).toHaveLength(PEDIDOS.length);
    for (const celda of celdas) {
      expect(celda).toHaveAttribute('data-pinned', 'left');
    }
  });

  it('la columna de acciones NO nace fijada: no puede tapar a la del correlativo', () => {
    montar();

    expect(screen.getByTestId('data-table-head-actions')).not.toHaveAttribute('data-pinned');
  });
});

describe('cambiar orden, filtro o pagina navega con la consulta esperada (R15, R17)', () => {
  it('ordenar por una cabecera pide la lista de nuevo con ese orden', () => {
    const params = montar();

    const cabecera = screen.getByTestId(`data-table-head-${ORDER_NUMBER_COLUMN_ID}`);
    fireEvent.click(within(cabecera).getAllByRole('button')[0]);

    const esperado = buildOrderListQuery({
      ...params,
      sort: { columnId: ORDER_NUMBER_COLUMN_ID, direction: 'asc' },
    });
    expect(ultimoDestino()).toBe(`${ORDERS_ROUTE}?${esperado}`);
  });

  it('marcar un valor del filtro de estado pide la lista de nuevo con ese filtro', async () => {
    const user = setupUser();
    const params = montar();

    // `fireEvent.click` para abrir el menu de Base UI en jsdom, como ya hace la suite de QC-55.
    fireEvent.click(screen.getByTestId(`data-table-filter-${STATUS_COLUMN_ID}`));
    await user.click(
      screen.getByTestId(`data-table-filter-option-${STATUS_COLUMN_ID}-CANCELADO`),
    );

    const esperado = buildOrderListQuery({
      ...params,
      filters: { [STATUS_COLUMN_ID]: { kind: 'select', values: ['CANCELADO'] } },
    });
    expect(ultimoDestino()).toBe(`${ORDERS_ROUTE}?${esperado}`);
  });

  it('avanzar de pagina pide la lista de nuevo con la pagina siguiente', async () => {
    const params = montar({ page: 1 }, 3);

    await userEvent.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino()).toBe(`${ORDERS_ROUTE}?${buildOrderListQuery({ ...params, page: 2 })}`);
  });

  it('el destino sale SIEMPRE de la constante de ruta (R2)', async () => {
    montar();

    await userEvent.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino().startsWith(`${ORDERS_ROUTE}?`)).toBe(true);
  });
});
