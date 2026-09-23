// QC-35 T7 — La tabla de la lista de pedidos: R7, R13, R14, R15, R17, R19, R20.
//
// **`useRouter` esta mockeada**: la tabla no navega de verdad en jsdom, pero lo que importa es
// que emita **la consulta exacta**, y eso se afirma sobre el `href` que recibe `router.push`.
//
// **Ningun assert sobre copy** (R44): filas, celdas y controles se localizan por los
// `data-testid` del componente compartido y por constantes exportadas.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Suspense, use, useEffect, useState } from 'react';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_NUMBER_COLUMN_ID,
  ORDER_TABLE_TEXTS,
  OrderTable,
  STATUS_COLUMN_ID,
  buildOrderListQuery,
} from '@/app/(private)/pedidos/components';
import { SEARCH_DEBOUNCE_MS, type DataTableParams } from '@/components/shared/data-table';
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

// El panel de edicion monta `OrderForm` en cada fila y su efecto pide el detalle de la receta
// para los ingredientes: sin este doble, la llamada iria a la sesion real (R43).
vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipesAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 },
  })),
  getRecipeAction: vi.fn(async (id: string) => ({
    status: 'success' as const,
    data: {
      id,
      name: 'Receta',
      description: null,
      imageUrl: null,
      stepCount: 0,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: null,
      updatedBy: null,
      steps: [],
      lines: [],
    },
  })),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
  createPresentationAction: vi.fn(() => {
    throw new Error('createPresentationAction no debe invocarse desde la tabla');
  }),
}));

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
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationId: null,
    presentationName: null,
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
const UNIDADES = [] as const;

function montar(overrides: Partial<DataTableParams> = {}, totalPages = 3) {
  const params = parametros(overrides);
  render(
    <OrderTable
      orders={PEDIDOS}
      params={params}
      totalPages={totalPages}
      recipes={RECETAS}
      units={UNIDADES}
    />,
  );
  return params;
}

// El `router.push` simulado termina al instante y la transicion no llegaria a verse en vuelo.
// Suspender una actualizacion dentro de esa misma transicion la retiene, como una navegacion que
// aun no ha recibido la pagina nueva (patron de `supplier-page.test.tsx > R14`).
const NAVEGACION_QUE_NO_TERMINA = new Promise<never>(() => {});
let retenerNavegacion: (() => void) | null = null;

function NavegacionEnVuelo() {
  const [enVuelo, setEnVuelo] = useState(false);

  useEffect(() => {
    retenerNavegacion = () => setEnVuelo(true);
    return () => {
      retenerNavegacion = null;
    };
  }, []);

  if (enVuelo) use(NAVEGACION_QUE_NO_TERMINA);
  return null;
}

function montarConNavegacionEnVuelo(overrides: Partial<DataTableParams> = {}, totalPages = 3) {
  const params = parametros(overrides);
  render(
    <>
      <OrderTable
        orders={PEDIDOS}
        params={params}
        totalPages={totalPages}
        recipes={RECETAS}
        units={UNIDADES}
      />
      <Suspense fallback={null}>
        <NavegacionEnVuelo />
      </Suspense>
    </>,
  );
  routerMock.push.mockImplementationOnce(() => retenerNavegacion?.());
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

describe('la caja de busqueda existe y respeta el area tactil minima (R1)', () => {
  it('se pinta con al menos 44px de alto y 16px de letra', () => {
    montar();

    const busqueda = screen.getByTestId('data-table-search');
    expect(busqueda).toBeInTheDocument();
    expect(busqueda.className).toContain('min-h-11');
    expect(busqueda.className).toContain('text-base');
  });
});

describe('escribir en la caja navega desde la primera pagina, conservando lo demas (R2, R8)', () => {
  it('un termino nuevo vuelve a la pagina 1 y conserva tamano, orden y filtros', async () => {
    vi.useFakeTimers();
    montar(
      {
        page: 3,
        sort: { columnId: ORDER_NUMBER_COLUMN_ID, direction: 'asc' },
        filters: { [STATUS_COLUMN_ID]: { kind: 'select', values: ['CANCELADO'] } },
      },
      5,
    );

    fireEvent.change(screen.getByTestId('data-table-search'), {
      target: { value: 'acido citrico' },
    });
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    vi.useRealTimers();

    const destino = new URL(ultimoDestino(), 'http://localhost');
    expect(destino.searchParams.get('q')).toBe('acido citrico');
    expect(destino.searchParams.get('page')).toBe('1');
    expect(destino.searchParams.get('sort')).toBe(`${ORDER_NUMBER_COLUMN_ID}:asc`);
    expect(destino.searchParams.get('status')).toBe('CANCELADO');
  });

  it('avanzar de pagina con un termino vigente conserva ese termino (R8)', async () => {
    const user = setupUser();
    montar({ page: 1, search: 'sosa' }, 3);

    await user.click(screen.getByTestId('data-table-next'));

    expect(new URL(ultimoDestino(), 'http://localhost').searchParams.get('q')).toBe('sosa');
  });
});

describe('las filas se pintan tal cual llegan aunque ninguna contenga el termino (R3)', () => {
  it('la tabla no filtra, ni ordena, ni recorta en el cliente', () => {
    montar({ search: 'nada-que-vaya-a-coincidir' });

    const filas = screen.getAllByRole('row').slice(1);
    expect(filas.map((fila) => fila.getAttribute('data-testid'))).toEqual([
      'data-table-row-o3',
      'data-table-row-o1',
      'data-table-row-o2',
    ]);
  });
});

describe('mientras la navegacion esta en vuelo, la caja conserva foco y texto (R10, R11, R12)', () => {
  it('aria-busy, rotulo de carga, sin esqueleto, y la misma caja con foco y texto', async () => {
    const user = setupUser();
    montarConNavegacionEnVuelo();

    expect(screen.getByTestId('order-table')).toHaveAttribute('aria-busy', 'false');

    const busqueda = screen.getByTestId('data-table-search');
    await user.type(busqueda, 'norte');

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('order-table')).toHaveAttribute('aria-busy', 'true'),
    );

    expect(screen.getByText(ORDER_TABLE_TEXTS.loading)).toBeInTheDocument();
    expect(screen.queryByTestId('order-list-skeleton')).toBeNull();
    expect(screen.queryByTestId('data-table-loading')).toBeNull();
    expect(screen.getByTestId('data-table-search')).toBe(busqueda);
    expect(busqueda).toHaveFocus();
    expect(busqueda).toHaveValue('norte');
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
      await esperarInteractiva(
        screen.getByTestId(`data-table-filter-option-${STATUS_COLUMN_ID}-CANCELADO`),
      ),
    );

    const esperado = buildOrderListQuery({
      ...params,
      filters: { [STATUS_COLUMN_ID]: { kind: 'select', values: ['CANCELADO'] } },
    });
    expect(ultimoDestino()).toBe(`${ORDERS_ROUTE}?${esperado}`);
  });

  it('avanzar de pagina pide la lista de nuevo con la pagina siguiente', async () => {
    const user = setupUser();
    const params = montar({ page: 1 }, 3);

    await user.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino()).toBe(`${ORDERS_ROUTE}?${buildOrderListQuery({ ...params, page: 2 })}`);
  });

  it('el destino sale SIEMPRE de la constante de ruta (R2)', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino().startsWith(`${ORDERS_ROUTE}?`)).toBe(true);
  });
});
