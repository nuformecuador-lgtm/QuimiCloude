// QC-35 T6 — Los tres estados de la lista de pedidos: R6, R7 y R21.
//
// `OrderListSection` es un Server Component `async`, asi que se le llama como funcion y se
// renderiza lo que devuelve: es lo que permite ejercitar los tres estados sin base de datos.
//
// **`listOrdersAction` esta mockeada.** No es un atajo: es el borde del modulo `pedidos` (QC-34,
// `done` y mergeado), que esta ficha **no abre** (R46), y sustituirla es lo unico que permite
// ejercitar error, vacio y lista.
//
// **Los tres estados se distinguen por `data-testid` DISTINTOS** (R44), nunca por copy: el copy
// cambia sin avisar y un assert sobre el no dice nada sobre la exclusividad de los estados.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrderListSection, OrderListSkeleton } from '@/app/(private)/pedidos/components';
import type { DataTableParams } from '@/components/shared/data-table';
import type { OrderSummary } from '@/lib/modules/pedidos';
import type { OrderListResult } from '@/lib/modules/pedidos/adapters/driving/order-actions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { ORDERS_ROUTE } from '@/lib/shared/routes';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

const {
  routerMock,
  listOrdersActionMock,
  getOrderActionMock,
  listRecipesActionMock,
  listUnitsActionMock,
} = vi.hoisted(() => ({
  // T10: la seccion pide ademas los dos catalogos que alimentan el panel lateral de alta
  // (`design.md > 9`). Son el borde de modulos que esta ficha no abre (R46) y se sustituyen igual
  // que la lista: sin ellos, `listRecipesAction` intentaria leer la cookie de sesion real.
  listRecipesActionMock: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], total: 0, page: 1, pageSize: MAX_PAGE_SIZE, totalPages: 1 },
  })),
  listUnitsActionMock: vi.fn(async () => ({ status: 'success' as const, data: [] })),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  listOrdersActionMock: vi.fn<(query: unknown) => Promise<OrderListResult>>(),
  // Doble que FALLA si se le llama: la seccion nunca pide la ficha de un pedido por fila.
  getOrderActionMock: vi.fn(() => {
    throw new Error('getOrderAction no debe invocarse desde la lista');
  }),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  listOrdersAction: listOrdersActionMock,
  getOrderAction: getOrderActionMock,
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipesAction: listRecipesActionMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

const testId = {
  lista: 'order-list',
  vacio: 'order-list-empty',
  primeraPagina: 'order-list-first-page',
  error: 'order-list-error',
  errorMensaje: 'order-list-error-message',
  errorCodigo: 'order-list-error-code',
  esqueleto: 'order-list-skeleton',
  filaEsqueleto: 'order-row-skeleton',
} as const;

/**
 * Datos del fixture. Son cadenas **inconfundibles** a proposito: el test de `unauthorized` busca
 * su ausencia en todo el documento, y con valores realistas no distinguiria entre «no se muestra»
 * y «se muestra pero parece otra cosa».
 */
const DATO_QUE_NO_DEBE_VERSE = 'RECETA-SECRETA-NO-VISIBLE';
const CORRELATIVO_QUE_NO_DEBE_VERSE = 'PED-NO-VISIBLE-0001';

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

function pedido(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: { year: 2026, sequence: 1 },
    numberText: CORRELATIVO_QUE_NO_DEBE_VERSE,
    recipeId: '22222222-2222-4222-8222-222222222222',
    recipeName: DATO_QUE_NO_DEBE_VERSE,
    quantity: '12.5000',
    unitId: '33333333-3333-4333-8333-333333333333',
    unitName: 'kg',
    unitPrice: '0.1005',
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

function pagina(items: readonly OrderSummary[], overrides: Partial<{ page: number; totalPages: number }> = {}) {
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
  // Desde T7 el estado «lista» monta la tabla compartida, cuyo filtro de fecha usa
  // `window.matchMedia`, que jsdom no implementa. Se stubea con el helper HEREDADO
  // (`tests/helpers/viewport.ts`), nunca con una copia local (R47).
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('los tres estados son mutuamente excluyentes y se distinguen por data-testid (R21, R44)', () => {
  it('cargando: el esqueleto pinta tantas filas como el tamano de pagina pedido', () => {
    render(<OrderListSkeleton rows={MAX_PAGE_SIZE} />);

    const esqueleto = screen.getByTestId(testId.esqueleto);
    expect(esqueleto).toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByTestId(testId.filaEsqueleto)).toHaveLength(MAX_PAGE_SIZE);

    // Y no es ninguno de los otros dos estados.
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    expect(screen.queryByTestId(testId.error)).toBeNull();
    expect(screen.queryByTestId(testId.lista)).toBeNull();
  });

  it('vacio: sin ningun pedido se pinta el estado propio de pedidos, NO una tabla sin filas', async () => {
    listOrdersActionMock.mockResolvedValue(pagina([]));

    render(await OrderListSection({ params: parametros() }));

    expect(screen.getByTestId(testId.vacio)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.lista)).toBeNull();
    expect(screen.queryByTestId(testId.error)).toBeNull();
    expect(screen.queryByTestId(testId.esqueleto)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    // Vacio de verdad: no se ofrece «volver a la primera pagina», que es otro caso distinto.
    expect(screen.queryByTestId(testId.primeraPagina)).toBeNull();
  });

  it('lista: con pedidos se pinta la lista y ninguno de los otros dos estados', async () => {
    listOrdersActionMock.mockResolvedValue(pagina([pedido()]));

    render(await OrderListSection({ params: parametros() }));

    expect(screen.getByTestId(testId.lista)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    expect(screen.queryByTestId(testId.error)).toBeNull();
  });

  it('error: se dice que fallo, con su mensaje y su codigo, y NO se pinta una tabla vacia', async () => {
    listOrdersActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La consulta no es valida.',
    });

    render(await OrderListSection({ params: parametros() }));

    expect(screen.getByTestId(testId.error)).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(testId.errorMensaje)).toHaveTextContent('La consulta no es valida.');
    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('invalid_input');

    // Lo que R21 existe para impedir: confundir «fallo» con «no hay nada».
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId(testId.lista)).toBeNull();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    expect(screen.queryByTestId(testId.esqueleto)).toBeNull();
  });
});

describe('la pagina que se quedo atras vuelve a la primera (R21)', () => {
  it('con la pagina vacia y page > 1 se ofrece el enlace a la primera, derivado de ORDERS_ROUTE (R2)', async () => {
    listOrdersActionMock.mockResolvedValue(pagina([], { page: 4, totalPages: 2 }));

    render(await OrderListSection({ params: parametros({ page: 4 }) }));

    const enlace = screen.getByTestId(testId.primeraPagina);
    expect(enlace).toHaveAttribute('href', expect.stringContaining(`${ORDERS_ROUTE}?`));
    expect(enlace.getAttribute('href')).toContain('page=1');
  });
});

describe('la pantalla no autoriza nada por su cuenta (R6)', () => {
  it('con `unauthorized` no se muestra NI UN DATO de pedidos', async () => {
    listOrdersActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso para consultar pedidos.',
    });

    const { container } = render(await OrderListSection({ params: parametros() }));

    expect(screen.getByTestId(testId.error)).toBeInTheDocument();
    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('unauthorized');

    // Ni el correlativo, ni el nombre de la receta, ni ninguna fila. La pantalla no oculta
    // columnas por rol ni lee la sesion: simplemente no tiene datos que ensenar.
    expect(container.textContent).not.toContain(CORRELATIVO_QUE_NO_DEBE_VERSE);
    expect(container.textContent).not.toContain(DATO_QUE_NO_DEBE_VERSE);
    expect(screen.queryByTestId(testId.lista)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('una sola llamada de lectura por pantalla (R7, R41)', () => {
  it('se invoca listOrdersAction UNA vez, con los parametros enteros y sin traducir', async () => {
    const params = parametros({ page: 2, pageSize: MAX_PAGE_SIZE });
    listOrdersActionMock.mockResolvedValue(pagina([pedido()], { page: 2, totalPages: 3 }));

    render(await OrderListSection({ params }));

    expect(listOrdersActionMock).toHaveBeenCalledTimes(1);
    // Campo a campo la misma forma que `ListQuery`: sin claves de mas, `search` siempre vacio.
    expect(listOrdersActionMock).toHaveBeenCalledWith(params);
    expect(Object.keys(listOrdersActionMock.mock.calls[0][0] as object).sort()).toEqual([
      'filters',
      'page',
      'pageSize',
      'search',
      'sort',
    ]);
    // Nunca la ficha por fila (alternativa M, descartada).
    expect(getOrderActionMock).not.toHaveBeenCalled();
  });
});
