// QC-155 T6 — La tabla de la lista de clientes: R9, R12, R13, R18, R21, R23.
//
// **`useRouter` esta mockeada**: la tabla no navega de verdad en jsdom, pero lo que importa es
// que emita **la consulta exacta**, y eso se afirma sobre el `href` que recibe `router.push`.
//
// **La sincronizacion de la caja de busqueda es una COPIA de `order-table.test.tsx`**
// (`design.md > 5.3`): el eco de la propia caja no remonta (conserva foco y texto), y un cambio
// externo de `params.search` (Atras, otro enlace) si remonta con el termino nuevo.
//
// **Ningun assert sobre copy** (R40): filas, celdas y controles se localizan por los
// `data-testid` del componente compartido y por constantes exportadas.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Suspense, use, useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CUSTOMER_LIST_CLEAR_SEARCH_TESTID,
  CUSTOMER_LIST_NO_MATCHES_TESTID,
  CUSTOMER_TABLE_TEXTS,
  CustomerTable,
  buildCustomerListQuery,
} from '@/app/(private)/clientes/components';
import {
  PAGE_SIZE_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  type DataTableParams,
} from '@/components/shared/data-table';
import type { CustomerView } from '@/lib/modules/clientes';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { CUSTOMERS_ROUTE } from '@/lib/shared/routes';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
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

// Dobles que FALLAN si se les llama: la tabla no lee ni escribe nada.
vi.mock('@/lib/modules/clientes/adapters/driving/customer-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la tabla`);
  };
  return {
    listCustomersAction: vi.fn(noDebeInvocarse('listCustomersAction')),
    getCustomerAction: vi.fn(noDebeInvocarse('getCustomerAction')),
    createCustomerAction: vi.fn(noDebeInvocarse('createCustomerAction')),
    updateCustomerAction: vi.fn(noDebeInvocarse('updateCustomerAction')),
    deleteCustomerAction: vi.fn(noDebeInvocarse('deleteCustomerAction')),
  };
});

function cliente(id: string, overrides: Partial<CustomerView> = {}): CustomerView {
  return {
    id,
    firstNames: 'Ana',
    lastNames: `Lopez-${id}`,
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

/** Llegan a proposito DESORDENADOS respecto de cualquier criterio: R13 se comprueba con ellos. */
const CLIENTES: readonly CustomerView[] = [
  cliente('c3', { lastNames: 'Zapata' }),
  cliente('c1', { lastNames: 'Alba' }),
  cliente('c2', { lastNames: 'Marin' }),
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

function montar(overrides: Partial<DataTableParams> = {}, totalPages = 3, canModify = false) {
  const params = parametros(overrides);
  render(
    <CustomerTable customers={CLIENTES} params={params} totalPages={totalPages} canModify={canModify} />,
  );
  return params;
}

// El `router.push` simulado termina al instante y la transicion no llegaria a verse en vuelo.
// Suspender una actualizacion dentro de esa misma transicion la retiene, como una navegacion que
// aun no ha recibido la pagina nueva (patron de `order-table.test.tsx`).
const NAVEGACION_QUE_NO_TERMINA: Promise<unknown> = new Promise(() => {});
let retenerNavegacion: (() => void) | null = null;

function NavegacionEnVuelo({ promesa = NAVEGACION_QUE_NO_TERMINA }: { readonly promesa?: Promise<unknown> }) {
  const [enVuelo, setEnVuelo] = useState(false);

  useEffect(() => {
    retenerNavegacion = () => setEnVuelo(true);
    return () => {
      retenerNavegacion = null;
    };
  }, []);

  if (enVuelo) use(promesa);
  return null;
}

function montarConNavegacionEnVuelo(
  overrides: Partial<DataTableParams> = {},
  totalPages = 3,
  promesa: Promise<unknown> = NAVEGACION_QUE_NO_TERMINA,
) {
  const params = parametros(overrides);
  const resultado = render(
    <>
      <CustomerTable customers={CLIENTES} params={params} totalPages={totalPages} canModify={false} />
      <Suspense fallback={null}>
        <NavegacionEnVuelo promesa={promesa} />
      </Suspense>
    </>,
  );
  routerMock.push.mockImplementationOnce(() => retenerNavegacion?.());
  return { params, ...resultado };
}

function crearNavegacionControlable(): { promesa: Promise<unknown>; liberar: () => void } {
  let resolver: (value: unknown) => void = () => {};
  const promesa = new Promise<unknown>((resolve) => {
    resolver = resolve;
  });
  return { promesa, liberar: () => resolver(undefined) };
}

const CLEAR_HREF = `${CUSTOMERS_ROUTE}?page=1&pageSize=${DEFAULT_PAGE_SIZE}`;

function montarSinCoincidencias(overrides: Partial<DataTableParams> = {}) {
  const params = parametros({ search: 'sin-coincidencias', ...overrides });
  const resultado = render(
    <CustomerTable
      customers={[]}
      params={params}
      totalPages={1}
      canModify={false}
      noMatches={{ clearHref: CLEAR_HREF }}
    />,
  );
  return { params, ...resultado };
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
  // jsdom no implementa `window.matchMedia`, que el filtro de fecha de la tabla compartida usa.
  // Se stubea con el helper HEREDADO (`tests/helpers/viewport.ts`), nunca con una copia local.
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('la tabla estrena el componente compartido y no declara uno propio (R9)', () => {
  it('monta `data-table` con una fila por cliente', () => {
    montar();

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-c1')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-c2')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-row-c3')).toBeInTheDocument();
  });
});

describe('las filas se pintan en el orden en que llegan (R13)', () => {
  it('no se reordena, ni se filtra, ni se recorta en el cliente aunque los parametros digan otra cosa', () => {
    montar({ page: 99, sort: { columnId: 'lastNames', direction: 'desc' } });

    const filas = screen.getAllByRole('row').slice(1);
    expect(filas.map((fila) => fila.getAttribute('data-testid'))).toEqual([
      'data-table-row-c3',
      'data-table-row-c1',
      'data-table-row-c2',
    ]);
  });
});

describe('escribir en la caja navega desde la primera pagina, conservando lo demas (R12, R13)', () => {
  it('un termino nuevo vuelve a la pagina 1 y conserva tamano y orden', async () => {
    vi.useFakeTimers();
    montar({ page: 3, sort: { columnId: 'lastNames', direction: 'asc' } }, 5);

    fireEvent.change(screen.getByTestId('data-table-search'), {
      target: { value: 'garcia' },
    });
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    vi.useRealTimers();

    const destino = new URL(ultimoDestino(), 'http://localhost');
    expect(destino.searchParams.get('q')).toBe('garcia');
    expect(destino.searchParams.get('page')).toBe('1');
    expect(destino.searchParams.get('sort')).toBe('lastNames:asc');
  });

  it('avanzar de pagina con un termino vigente conserva ese termino', async () => {
    const user = setupUser();
    montar({ page: 1, search: 'lopez' }, 3);

    await user.click(screen.getByTestId('data-table-next'));

    expect(new URL(ultimoDestino(), 'http://localhost').searchParams.get('q')).toBe('lopez');
  });

  it('el destino sale SIEMPRE de la constante de ruta', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino().startsWith(`${CUSTOMERS_ROUTE}?`)).toBe(true);
  });
});

describe('mientras la navegacion esta en vuelo, la caja conserva foco y texto (R21)', () => {
  it('aria-busy y atenuacion en vuelo; al soltar la navegacion, filas nuevas sin atenuar ni rotulo', async () => {
    const user = setupUser();
    const { liberar, promesa } = crearNavegacionControlable();
    const { rerender } = montarConNavegacionEnVuelo({}, 3, promesa);

    expect(screen.getByTestId('customer-table')).toHaveAttribute('aria-busy', 'false');

    const busqueda = screen.getByTestId('data-table-search');
    await user.type(busqueda, 'norte');

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('customer-table')).toHaveAttribute('aria-busy', 'true'),
    );

    expect(screen.getByText(CUSTOMER_TABLE_TEXTS.loading)).toBeInTheDocument();
    expect(screen.getByTestId('customer-table').className).toContain('opacity-60');
    expect(screen.getByTestId('data-table-search')).toBe(busqueda);
    expect(busqueda).toHaveFocus();
    expect(busqueda).toHaveValue('norte');

    liberar();
    await waitFor(() =>
      expect(screen.getByTestId('customer-table')).toHaveAttribute('aria-busy', 'false'),
    );

    rerender(
      <>
        <CustomerTable
          customers={[cliente('c9')]}
          params={parametros({ search: 'norte' })}
          totalPages={3}
          canModify={false}
        />
      </>,
    );

    expect(screen.getByTestId('customer-table').className).not.toContain('opacity-60');
    expect(screen.queryByText(CUSTOMER_TABLE_TEXTS.loading)).toBeNull();
    expect(screen.getByTestId('data-table-row-c9')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-row-c1')).toBeNull();
  });
});

describe('sin coincidencias: «Limpiar la busqueda» navega y vacia la caja (R20)', () => {
  it('el clic simple navega al `clearHref` y la caja queda vacia antes y despues del rerender', () => {
    const { params, rerender } = montarSinCoincidencias();

    expect(screen.getByTestId(CUSTOMER_LIST_NO_MATCHES_TESTID)).toBeInTheDocument();
    const boton = screen.getByTestId(CUSTOMER_LIST_CLEAR_SEARCH_TESTID);

    fireEvent.click(boton);

    expect(routerMock.push).toHaveBeenCalledWith(CLEAR_HREF);
    expect(screen.getByTestId('data-table-search')).toHaveValue('');

    rerender(
      <CustomerTable
        customers={[]}
        params={{ ...params, search: '' }}
        totalPages={1}
        canModify={false}
      />,
    );
    expect(screen.getByTestId('data-table-search')).toHaveValue('');
  });

  it('un clic con modificador no intercepta: el navegador decide abrir otra pestana', () => {
    montarSinCoincidencias();

    const boton = screen.getByTestId(CUSTOMER_LIST_CLEAR_SEARCH_TESTID);
    fireEvent.click(boton, { metaKey: true });

    expect(routerMock.push).not.toHaveBeenCalled();
  });
});

describe('la caja sigue a la URL cuando el termino cambia por fuera (R18)', () => {
  it('un `params.search` externo, ajeno a la caja, se muestra tras el rerender', () => {
    const params = parametros({ search: 'acido' });
    const { rerender } = render(
      <CustomerTable customers={CLIENTES} params={params} totalPages={3} canModify={false} />,
    );

    expect(screen.getByTestId('data-table-search')).toHaveValue('acido');

    rerender(
      <CustomerTable
        customers={CLIENTES}
        params={{ ...params, search: 'base' }}
        totalPages={3}
        canModify={false}
      />,
    );

    expect(screen.getByTestId('data-table-search')).toHaveValue('base');
  });

  it('el termino que la propia caja emitio no la remonta: mismo nodo, foco y texto (R18)', async () => {
    vi.useFakeTimers();
    const params = parametros();
    const { rerender } = render(
      <CustomerTable customers={CLIENTES} params={params} totalPages={3} canModify={false} />,
    );

    const caja = screen.getByTestId('data-table-search');
    caja.focus();
    fireEvent.change(caja, { target: { value: 'acido' } });
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    vi.useRealTimers();

    rerender(
      <CustomerTable
        customers={CLIENTES}
        params={{ ...params, search: 'acido' }}
        totalPages={3}
        canModify={false}
      />,
    );

    expect(screen.getByTestId('data-table-search')).toBe(caja);
    expect(caja).toHaveFocus();
    expect(caja).toHaveValue('acido');
  });

  it('tras «Limpiar», el eco y despues un cambio externo de `params` no dejan la caja atras (R18)', () => {
    const { rerender } = montarSinCoincidencias({ search: 'x' });

    fireEvent.click(screen.getByTestId(CUSTOMER_LIST_CLEAR_SEARCH_TESTID));
    expect(routerMock.push).toHaveBeenCalledWith(CLEAR_HREF);
    expect(screen.getByTestId('data-table-search')).toHaveValue('');

    // El eco de la limpieza: la lista vuelve sin termino.
    rerender(
      <CustomerTable customers={CLIENTES} params={parametros({ search: '' })} totalPages={3} canModify={false} />,
    );
    expect(screen.getByTestId('data-table-search')).toHaveValue('');

    // Un cambio externo posterior (p. ej. «Atras» del navegador): termino y pagina distintos.
    rerender(
      <CustomerTable
        customers={CLIENTES}
        params={parametros({ search: 'x', page: 2 })}
        totalPages={3}
        canModify={false}
      />,
    );

    expect(screen.getByTestId('data-table-search')).toHaveValue('x');
    expect(screen.getByTestId('data-table-page-indicator')).toHaveTextContent('Página 2 de 3');
  });
});

describe('el desbordamiento horizontal lo absorbe el primitivo (R23)', () => {
  it('la tabla vive dentro de un contenedor con scroll horizontal propio', () => {
    montar();

    const contenedor = screen.getByTestId('data-table').querySelector('[data-slot="table-container"]');
    expect(contenedor).not.toBeNull();
    expect(contenedor?.className).toContain('overflow-x-auto');
  });
});

describe('las acciones de fila respetan `canModify` (R5)', () => {
  it('con `canModify=false` no se emite ningun disparador de escritura', () => {
    montar({}, 3, false);

    expect(screen.queryByTestId('customer-row-actions')).toBeNull();
    expect(screen.queryByTestId('customer-create-open')).toBeNull();
  });

  it('con `canModify=true` se emiten las acciones de fila y el disparador de alta', () => {
    montar({}, 3, true);

    expect(screen.getAllByTestId('customer-row-actions')).toHaveLength(CLIENTES.length);
    expect(screen.getByTestId('customer-create-open')).toBeInTheDocument();
  });
});

describe('el selector de tamano ofrece exactamente 10 y 25, con 10 por defecto (R15)', () => {
  it('el selector abierto ofrece solo esas dos opciones', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId('data-table-page-size'));

    expect(await screen.findAllByRole('option')).toHaveLength(PAGE_SIZE_OPTIONS.length);
    expect(PAGE_SIZE_OPTIONS).toEqual([10, 25]);
    for (const tamano of PAGE_SIZE_OPTIONS) {
      expect(screen.getByTestId(`data-table-page-size-${tamano}`)).toBeInTheDocument();
    }
  });

  it('sin tamano en la URL la tabla parte del tamano por defecto (10)', () => {
    const params = montar();

    expect(params.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(DEFAULT_PAGE_SIZE).toBe(10);
  });

  it('elegir el otro tamano navega con ese tamano y vuelve a la primera pagina', async () => {
    const user = setupUser();
    const params = montar({ page: 3 }, 5);
    const otro = PAGE_SIZE_OPTIONS.find((option) => option !== params.pageSize)!;

    await user.click(screen.getByTestId('data-table-page-size'));
    // Popup de Base UI recien abierto: se espera a que suelte `pointer-events: none` (QC-58).
    await user.click(await esperarInteractiva(screen.getByTestId(`data-table-page-size-${otro}`)));

    expect(ultimoDestino()).toBe(
      `${CUSTOMERS_ROUTE}?${buildCustomerListQuery({ ...params, page: 1, pageSize: otro })}`,
    );
  });
});

describe('con mas clientes de los que caben, anterior y siguiente navegan a la pagina correcta e indican pagina y total (R15)', () => {
  it('el indicador muestra la pagina actual y el total de paginas', () => {
    montar({ page: 2 }, 3);

    expect(screen.getByTestId('data-table-page-indicator')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('data-table-page-indicator')).toHaveTextContent('Página 2 de 3');
  });

  it('«siguiente» navega a la pagina siguiente conservando lo demas', async () => {
    const user = setupUser();
    const params = montar({ page: 1 }, 3);

    await user.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino()).toBe(
      `${CUSTOMERS_ROUTE}?${buildCustomerListQuery({ ...params, page: 2 })}`,
    );
  });

  it('«anterior» navega a la pagina anterior conservando lo demas', async () => {
    const user = setupUser();
    const params = montar({ page: 3 }, 3);

    await user.click(screen.getByTestId('data-table-previous'));

    expect(ultimoDestino()).toBe(
      `${CUSTOMERS_ROUTE}?${buildCustomerListQuery({ ...params, page: 2 })}`,
    );
  });

  it('en la primera pagina «anterior» esta deshabilitado; en la ultima, «siguiente»', () => {
    montar({ page: 1 }, 3);
    expect(screen.getByTestId('data-table-previous')).toBeDisabled();
    expect(screen.getByTestId('data-table-next')).toBeEnabled();

    cleanup();
    montar({ page: 3 }, 3);
    expect(screen.getByTestId('data-table-previous')).toBeEnabled();
    expect(screen.getByTestId('data-table-next')).toBeDisabled();
  });
});
