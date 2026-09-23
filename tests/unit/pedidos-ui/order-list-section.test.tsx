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

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_LIST_CLEAR_SEARCH_TESTID,
  ORDER_LIST_NO_MATCHES_TESTID,
  OrderListSection,
  OrderListSkeleton,
} from '@/app/(private)/pedidos/components';
import type { DataTableParams } from '@/components/shared/data-table';
import type { OrderSummary } from '@/lib/modules/pedidos';
import type { OrderListResult } from '@/lib/modules/pedidos/adapters/driving/order-actions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { ORDERS_ROUTE } from '@/lib/shared/routes';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
  UNEXPECTED_ERROR_NOTICE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../helpers/identificador-de-request';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

const {
  routerMock,
  listOrdersActionMock,
  getOrderActionMock,
  listRecipesActionMock,
  listUnitsActionMock,
  listResponsiblesForOrdersActionMock,
  listOrderResponsiblesActionMock,
  listResponsibleCandidatesActionMock,
  getSessionUserMock,
  listWorkGroupsActionMock,
} = vi.hoisted(() => ({
  // QC-102 T11: la SEGUNDA llamada de la seccion, el lote de responsables de la pagina. Es el
  // borde del modulo `asignaciones` (QC-87 + T6, ya en disco) y se sustituye igual que la lista:
  // sin doble, leeria la cookie de sesion real.
  listResponsiblesForOrdersActionMock: vi.fn(async () => ({
    status: 'success' as const,
    data: [] as readonly { orderId: string; responsibles: readonly unknown[] }[],
  })),
  // Doble que FALLA si se le llama: la consulta de UN pedido no tiene nada que hacer en el
  // listado (decision cerrada 5: un lote por pagina, jamas una consulta por fila).
  listOrderResponsiblesActionMock: vi.fn(() => {
    throw new Error('listOrderResponsiblesAction no debe invocarse desde la lista');
  }),
  // QC-102 T15: la sesion, que es de donde sale `canWrite`. Por defecto, CON el permiso.
  getSessionUserMock: vi.fn(async () => ({
    id: '55555555-5555-4555-8555-555555555555',
    permissions: ['pedidos.consultar', 'asignaciones.modificar', 'usuarios.consultar'],
  })),
  // El catalogo de personas del panel sale de esta accion, que ya filtra por
  // `asignaciones.modificar` y por elegibilidad.
  listResponsibleCandidatesActionMock: vi.fn(async () => ({
    status: 'success' as const,
    data: [] as readonly { id: string; displayName: string }[],
  })),
  listWorkGroupsActionMock: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 },
  })),
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
  // El panel de edicion monta `OrderForm` por fila y su efecto pide el detalle de la receta para
  // los ingredientes: sin este doble, la llamada iria a la sesion real (R43).
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

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

// El panel de edicion monta ahora `PresentationSelect` por fila: sin este doble, la llamada
// iria a la sesion real (mismo criterio que `listRecipesAction` justo arriba).
vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
  createPresentationAction: vi.fn(() => {
    throw new Error('createPresentationAction no debe invocarse desde este archivo');
  }),
}));

// QC-102 — el borde de `asignaciones`, importado por su RUTA EXACTA (R40), nunca por el barrel.
vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => ({
  listResponsiblesForOrdersAction: listResponsiblesForOrdersActionMock,
  listOrderResponsiblesAction: listOrderResponsiblesActionMock,
  listResponsibleCandidatesAction: listResponsibleCandidatesActionMock,
  assignResponsiblesAction: vi.fn(),
  unassignResponsibleAction: vi.fn(),
  removeWorkGroupFromOrderAction: vi.fn(),
}));

// QC-102 T15 — la sesion. `lib/composition` arrastra Prisma, asi que se sustituye como ya hacen
// las suites de `configuracion-ui`.
vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock },
}));

vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => ({
  listWorkGroupsAction: listWorkGroupsActionMock,
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

describe('sin coincidencias: DENTRO de la tabla, con la caja montada (R13, R14, R15, R16)', () => {
  it('con termino y cero filas pinta "sin coincidencias" dentro de la tabla, y NO el vacio de siempre', async () => {
    listOrdersActionMock.mockResolvedValue(pagina([]));

    render(await OrderListSection({ params: parametros({ search: 'sin-coincidencias' }) }));

    const tabla = screen.getByTestId('order-table');
    expect(within(tabla).getByTestId(ORDER_LIST_NO_MATCHES_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    expect(within(tabla).getByTestId('data-table-search')).toHaveValue('sin-coincidencias');
  });

  it('con termino y cero filas no se pide el lote de responsables: no hay filas a las que repartirlo', async () => {
    listOrdersActionMock.mockResolvedValue(pagina([]));

    render(await OrderListSection({ params: parametros({ search: 'sin-coincidencias' }) }));

    expect(listResponsiblesForOrdersActionMock).not.toHaveBeenCalled();
  });

  it('«Limpiar la busqueda» enlaza sin `q`, con la primera pagina, y conserva tamano, orden y filtros (R15)', async () => {
    listOrdersActionMock.mockResolvedValue(pagina([]));

    render(
      await OrderListSection({
        params: parametros({
          search: 'sin-coincidencias',
          page: 3,
          pageSize: MAX_PAGE_SIZE,
          sort: { columnId: 'createdAt', direction: 'asc' },
          filters: {
            status: { kind: 'select', values: ['CANCELADO'] },
            priority: { kind: 'select', values: ['ALTA'] },
            createdAt: { kind: 'dateRange', from: '2026-01-01', to: '2026-01-31' },
          },
        }),
      }),
    );

    const enlace = new URL(
      screen.getByTestId(ORDER_LIST_CLEAR_SEARCH_TESTID).getAttribute('href') as string,
      'http://localhost',
    );
    expect(enlace.searchParams.has('q')).toBe(false);
    expect(enlace.searchParams.get('page')).toBe('1');
    expect(enlace.searchParams.get('pageSize')).toBe(String(MAX_PAGE_SIZE));
    expect(enlace.searchParams.get('sort')).toBe('createdAt:asc');
    expect(enlace.searchParams.get('status')).toBe('CANCELADO');
    expect(enlace.searchParams.get('priority')).toBe('ALTA');
    expect(enlace.searchParams.get('createdFrom')).toBe('2026-01-01');
    expect(enlace.searchParams.get('createdTo')).toBe('2026-01-31');
  });

  it('sin termino y cero filas sigue siendo el vacio de siempre, sin "Limpiar la busqueda" (R16)', async () => {
    listOrdersActionMock.mockResolvedValue(pagina([]));

    render(await OrderListSection({ params: parametros() }));

    expect(screen.getByTestId(testId.vacio)).toBeInTheDocument();
    expect(screen.queryByTestId(ORDER_LIST_CLEAR_SEARCH_TESTID)).toBeNull();
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
    // Campo a campo la misma forma que `ListQuery`: sin claves de mas.
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

/** QC-71 T9 — R17 y R18 en el estado de error de la lista de pedidos. */
describe('lista de pedidos — el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    listOrdersActionMock.mockResolvedValue(errorInesperado());

    render(await OrderListSection({ params: parametros() }));

    const aviso = screen.getByTestId(UNEXPECTED_ERROR_NOTICE_TESTID);
    expect(within(aviso).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(aviso).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    listOrdersActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    render(await OrderListSection({ params: parametros() }));

    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('unauthorized');
    esperarSinIdentificador();
  });
});

// ---------------------------------------------------------------------------------------------
// QC-102 T11 — El lote de responsables se compone AQUI, en el Server Component: R16, R20.
//
// `design.md > 1`: la segunda llamada vive en la PANTALLA y no dentro de `listOrders`, porque
// `asignaciones` ya depende de `pedidos` y meterla alli cerraria el ciclo. Lo que estos casos
// vigilan es exactamente eso: que la seccion pida el lote **una vez**, con los ids de la pagina,
// y que un fallo del lote NO se lleve por delante la lista.
// ---------------------------------------------------------------------------------------------

const OTRO_PEDIDO = '44444444-4444-4444-8444-444444444444';

const ANA = {
  userId: '0000000a-0000-4000-8000-00000000000a',
  displayName: 'Ana Torres',
  origin: { kind: 'direct' as const },
};

describe('QC-102 — el listado trae los responsables de su pagina (R16)', () => {
  it('pide el lote UNA sola vez por render, con los ids de la pagina y en una sola llamada', async () => {
    listOrdersActionMock.mockResolvedValue(
      pagina([pedido(), pedido({ id: OTRO_PEDIDO, numberText: 'PED-2026-0002' })]),
    );

    render(await OrderListSection({ params: parametros() }));

    // UNA, no una por fila: son dos pedidos y sigue siendo una sola invocacion.
    expect(listResponsiblesForOrdersActionMock).toHaveBeenCalledTimes(1);
    expect(listResponsiblesForOrdersActionMock).toHaveBeenCalledWith([
      pedido().id,
      OTRO_PEDIDO,
    ]);
    // Y jamas la consulta de UN pedido: ese doble lanzaria si se le llamara.
    expect(listOrderResponsiblesActionMock).not.toHaveBeenCalled();
  });

  it('la llamada del lote va DESPUES de la de la lista: sus ids salen de ella', async () => {
    const orden: string[] = [];
    listOrdersActionMock.mockImplementation(async () => {
      orden.push('pedidos');
      return pagina([pedido()]);
    });
    listResponsiblesForOrdersActionMock.mockImplementation(async () => {
      orden.push('responsables');
      return { status: 'success' as const, data: [] };
    });

    render(await OrderListSection({ params: parametros() }));

    expect(orden).toEqual(['pedidos', 'responsables']);
  });

  it('cada fila recibe los suyos: el reparto se hace en el SERVIDOR y baja ya repartido', async () => {
    listOrdersActionMock.mockResolvedValue(
      pagina([pedido(), pedido({ id: OTRO_PEDIDO, numberText: 'PED-2026-0002' })]),
    );
    listResponsiblesForOrdersActionMock.mockResolvedValue({
      status: 'success',
      data: [
        { orderId: pedido().id, responsibles: [ANA] },
        { orderId: OTRO_PEDIDO, responsibles: [] },
      ],
    });

    render(await OrderListSection({ params: parametros() }));

    // La fila con responsable pinta su circulo con el nombre COMPLETO como nombre accesible; la
    // otra, el marcador de ausencia de esta pantalla (R19). Dos filas, dos celdas distintas.
    expect(screen.getByRole('img', { name: ANA.displayName })).toBeInTheDocument();
    expect(screen.getAllByTestId('order-missing-responsibles')).toHaveLength(1);
  });

  it('sin ningun pedido no se pregunta por responsables de nadie', async () => {
    listOrdersActionMock.mockResolvedValue(pagina([]));

    render(await OrderListSection({ params: parametros() }));

    expect(screen.getByTestId(testId.vacio)).toBeInTheDocument();
    expect(listResponsiblesForOrdersActionMock).not.toHaveBeenCalled();
  });
});

describe('QC-102 — si el lote falla, la lista NO se cae (R20)', () => {
  it.each(['unauthorized', 'invalid_input', 'unexpected'] as const)(
    'con el lote en `%s` se siguen pintando los pedidos y la columna queda sin resolver',
    async (code) => {
      listOrdersActionMock.mockResolvedValue(pagina([pedido()]));
      listResponsiblesForOrdersActionMock.mockResolvedValue({
        status: 'error',
        code,
        message: 'No se pudieron leer los responsables.',
      } as never);

      render(await OrderListSection({ params: parametros() }));

      // La lista entera sigue ahi, con su tabla y su fila.
      expect(screen.getByTestId(testId.lista)).toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
      // La fila del pedido sigue viva, con sus acciones: no es una tabla sin filas.
      expect(screen.getByTestId('order-row-actions')).toHaveAttribute('data-order-id', pedido().id);

      // La columna, sin resolver: el marcador de ausencia, nunca un identificador tecnico.
      expect(screen.getByTestId('order-missing-responsibles')).toBeInTheDocument();

      // Y el estado de error de la pantalla NO se monta: el error, el vacio y el esqueleto
      // siguen siendo los de la LISTA DE PEDIDOS.
      expect(screen.queryByTestId(testId.error)).toBeNull();
      expect(screen.queryByTestId(testId.vacio)).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------------------------
// QC-102 T15 — `canWrite` baja por props desde el servidor: R28 (la mitad de pantalla).
// ---------------------------------------------------------------------------------------------

describe('QC-102 — los catalogos del panel solo se piden si el actor puede escribir (R27, R28)', () => {
  it('con `asignaciones.modificar` se piden los dos, una vez cada uno', async () => {
    listOrdersActionMock.mockResolvedValue(pagina([pedido()]));

    render(await OrderListSection({ params: parametros() }));

    expect(listResponsibleCandidatesActionMock).toHaveBeenCalledTimes(1);
    expect(listWorkGroupsActionMock).toHaveBeenCalledTimes(1);
  });

  it('sin el permiso no se pide ningun catalogo: no hay control de escritura que alimentar', async () => {
    getSessionUserMock.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      permissions: ['pedidos.consultar'],
    });
    listOrdersActionMock.mockResolvedValue(pagina([pedido()]));

    render(await OrderListSection({ params: parametros() }));

    expect(listResponsibleCandidatesActionMock).not.toHaveBeenCalled();
    expect(listWorkGroupsActionMock).not.toHaveBeenCalled();
    // Y la lista se pinta igual: el permiso de escritura no condiciona la LECTURA.
    expect(screen.getByTestId(testId.lista)).toBeInTheDocument();
  });

  it('si un catalogo falla, el panel se degrada y la lista NO se tumba (H1)', async () => {
    listResponsibleCandidatesActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso para consultar usuarios.',
    } as never);
    listOrdersActionMock.mockResolvedValue(pagina([pedido()]));

    render(await OrderListSection({ params: parametros() }));

    expect(screen.getByTestId(testId.lista)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.error)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// El catalogo de personas ya no depende de `usuarios.consultar`.
//
// Antes el catalogo salia de `listUsersAction`, que exige `usuarios.consultar` y se degradaba a
// lista vacia sin ese permiso. Ahora la fuente es `listResponsibleCandidatesAction`, que solo
// exige `asignaciones.modificar` -el mismo permiso con el que ya se decide si el panel de
// escritura existe- y excluye ya a quien tiene `pedidos.consultar`. Reescribir la vieja prueba de
// degradacion por `usuarios.consultar` sin dejar rastro simularia un permiso que esta pantalla ya
// no consulta.
// ---------------------------------------------------------------------------------------------
describe('QC-145 — el catalogo de personas sale de listResponsibleCandidatesAction (R32)', () => {
  it('las personas del panel llegan de la accion nueva, no de listUsersAction', async () => {
    // `getSessionUserMock` queda con permisos limitados tras el test anterior de "sin el
    // permiso"; aqui hace falta `canWrite`, asi que se repone.
    getSessionUserMock.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      permissions: ['pedidos.consultar', 'asignaciones.modificar', 'usuarios.consultar'],
    });
    listOrdersActionMock.mockResolvedValue(pagina([pedido()]));
    listResponsibleCandidatesActionMock.mockResolvedValue({
      status: 'success',
      data: [{ id: '0000000c-0000-4000-8000-00000000000c', displayName: 'Rosa Vidal' }],
    });

    render(await OrderListSection({ params: parametros() }));

    expect(listResponsibleCandidatesActionMock).toHaveBeenCalledTimes(1);
    expect(listResponsibleCandidatesActionMock).toHaveBeenCalledWith();
  });

  it('si la accion nueva falla, el panel degrada personas a vacio y la lista sigue en pie', async () => {
    getSessionUserMock.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      permissions: ['pedidos.consultar', 'asignaciones.modificar', 'usuarios.consultar'],
    });
    listOrdersActionMock.mockResolvedValue(pagina([pedido()]));
    listResponsibleCandidatesActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso para asignar responsables.',
    } as never);

    render(await OrderListSection({ params: parametros() }));

    expect(screen.getByTestId(testId.lista)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.error)).toBeNull();
  });
});
