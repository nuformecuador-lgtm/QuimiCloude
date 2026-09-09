// QC-39 T9 — La tabla de la lista de unidades: R15, R18, R19, R20, R21, R22.
//
// **`useRouter` esta mockeada**: la tabla no navega de verdad en jsdom, pero lo que importa es que
// emita **la consulta exacta**, y eso se afirma sobre el `href` que recibe `router.push`.
//
// **Ningun assert sobre copy** (R49): filas, celdas y controles se localizan por los `data-testid`
// del componente compartido (`data-table-*`) y por constantes exportadas. Que esos `data-testid`
// sean los del componente compartido es, ademas, la prueba de R15: si la pantalla hubiera escrito
// su propia tabla o su propia barra de paginacion, no existirian.
//
// Es el hermano de `presentation-table.test.tsx` (QC-45), con lo que esta pantalla cambia: **cuatro
// columnas**, una de ellas NO ordenable (la equivalencia, R19) y **ningun filtro** (R20).

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EQUIVALENCE_COLUMN_ID,
  NAME_COLUMN_ID,
  SYMBOL_COLUMN_ID,
  UnitTable,
  buildUnitListQuery,
} from '@/app/(private)/configuracion/unidades/components';
import {
  PAGE_SIZE_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  type DataTableParams,
} from '@/components/shared/data-table';
import { UNIT_QUERYABLE, type UnitView } from '@/lib/modules/unidades';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { UNITS_ROUTE } from '@/lib/shared/routes';
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

// Dobles que FALLAN si se les llama: la tabla no lee ni escribe nada (R44).
vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la tabla`);
  };
  return {
    listUnitsAction: vi.fn(noDebeInvocarse('listUnitsAction')),
    createUnitAction: vi.fn(noDebeInvocarse('createUnitAction')),
    updateUnitAction: vi.fn(noDebeInvocarse('updateUnitAction')),
    deleteUnitAction: vi.fn(noDebeInvocarse('deleteUnitAction')),
  };
});

function unidad(overrides: Partial<UnitView> & Pick<UnitView, 'id' | 'name'>): UnitView {
  return {
    symbol: null,
    baseUnitId: null,
    factor: null,
    isSystem: false,
    ...overrides,
  };
}

/** Llegan a proposito DESORDENADAS alfabeticamente: R18 y R19 se comprueban con ellas. */
const UNIDADES: readonly UnitView[] = [
  unidad({ id: 'u3', name: 'Tonelada', symbol: 't' }),
  unidad({ id: 'u1', name: 'Gramo', symbol: 'g', isSystem: true }),
  unidad({ id: 'u2', name: 'Kilogramo', symbol: 'kg', baseUnitId: 'u1', factor: '1000.0000' }),
];

const BASE_INDEX = { u1: { name: 'Gramo', symbol: 'g' } };
const BASES: readonly UnitView[] = [UNIDADES[1]!, UNIDADES[0]!];

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

function montar(overrides: Partial<DataTableParams> = {}, totalPages = 3) {
  const params = parametros(overrides);
  render(
    <UnitTable
      units={UNIDADES}
      baseIndex={BASE_INDEX}
      baseUnits={BASES}
      params={params}
      totalPages={totalPages}
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
  // jsdom no implementa `window.matchMedia`. Se stubea con el helper HEREDADO
  // (`tests/helpers/viewport.ts`), nunca con una copia local (R47).
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('la lista usa la tabla COMPARTIDA y no declara una propia (R15)', () => {
  it('monta `DataTable` con una fila por unidad', () => {
    montar();

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    for (const item of UNIDADES) {
      expect(screen.getByTestId(`data-table-row-${item.id}`)).toBeInTheDocument();
    }
  });

  it('el indicador de pagina y el selector de tamano son los del componente compartido (R21, R22)', () => {
    montar({ page: 2 }, 3);

    // Si la pantalla hubiera escrito su propia barra de paginacion, estos no existirian.
    expect(screen.getByTestId('data-table-pagination')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-page-indicator')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('data-table-previous')).toBeEnabled();
    expect(screen.getByTestId('data-table-next')).toBeEnabled();
    expect(screen.getByTestId('data-table-page-size')).toBeInTheDocument();
  });
});

describe('las filas se pintan en el orden en que llegan (R18, R19)', () => {
  it('no se reordena, ni se filtra, ni se recorta en el cliente aunque los parametros digan otra cosa', () => {
    montar({
      page: 99,
      sort: { columnId: NAME_COLUMN_ID, direction: 'asc' },
      search: 'no-casa-con-ninguna',
    });

    const filas = screen.getAllByRole('row').slice(1);
    expect(filas.map((fila) => fila.getAttribute('data-testid'))).toEqual([
      'data-table-row-u3',
      'data-table-row-u1',
      'data-table-row-u2',
    ]);
    // Ninguna fila desaparece por un termino de busqueda que ninguna cumple (R18).
    expect(filas).toHaveLength(UNIDADES.length);
  });
});

describe('cambiar pagina navega con la consulta esperada (R22)', () => {
  it('avanzar de pagina pide la lista de nuevo con la pagina siguiente', async () => {
    const user = setupUser();
    const params = montar({ page: 1 }, 3);

    await user.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino()).toBe(`${UNITS_ROUTE}?${buildUnitListQuery({ ...params, page: 2 })}`);
  });

  it('retroceder de pagina pide la lista de nuevo con la pagina anterior', async () => {
    const user = setupUser();
    const params = montar({ page: 3 }, 3);

    await user.click(screen.getByTestId('data-table-previous'));

    expect(ultimoDestino()).toBe(`${UNITS_ROUTE}?${buildUnitListQuery({ ...params, page: 2 })}`);
  });

  it('el destino sale SIEMPRE de la constante de ruta (R8)', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino().startsWith(`${UNITS_ROUTE}?`)).toBe(true);
  });
});

describe('el tamano de pagina ofrece 10 y 25 y recarga la lista (R21)', () => {
  it('las opciones son exactamente las del componente compartido', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId('data-table-page-size'));

    expect(await screen.findAllByRole('option')).toHaveLength(PAGE_SIZE_OPTIONS.length);
    for (const tamano of PAGE_SIZE_OPTIONS) {
      expect(screen.getByTestId(`data-table-page-size-${tamano}`)).toBeInTheDocument();
    }
  });

  it('elegir otro tamano navega con ese tamano y vuelve a la primera pagina', async () => {
    const user = setupUser();
    const params = montar({ page: 3 }, 3);
    const otro = PAGE_SIZE_OPTIONS.find((option) => option !== params.pageSize)!;

    await user.click(screen.getByTestId('data-table-page-size'));
    // Popup de Base UI recien abierto: se espera a que suelte `pointer-events: none` (QC-58).
    await user.click(await esperarInteractiva(screen.getByTestId(`data-table-page-size-${otro}`)));

    expect(ultimoDestino()).toBe(
      `${UNITS_ROUTE}?${buildUnitListQuery({ ...params, page: 1, pageSize: otro })}`,
    );
  });

  it('sin tamano en la URL la tabla parte del tamano por defecto (10)', () => {
    const params = montar();

    expect(params.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(PAGE_SIZE_OPTIONS).toContain(DEFAULT_PAGE_SIZE);
  });
});

describe('ordenar navega, no reordena en cliente (R19)', () => {
  it('la cabecera del nombre pide la lista de nuevo con ese orden', () => {
    const params = montar();

    const cabecera = screen.getByTestId(`data-table-head-${NAME_COLUMN_ID}`);
    fireEvent.click(within(cabecera).getAllByRole('button')[0]!);

    expect(ultimoDestino()).toBe(
      `${UNITS_ROUTE}?${buildUnitListQuery({
        ...params,
        sort: { columnId: NAME_COLUMN_ID, direction: 'asc' },
      })}`,
    );
  });

  it('la cabecera del simbolo tambien ordena, porque esta en la lista blanca del contrato', () => {
    const params = montar();

    expect(UNIT_QUERYABLE.sortable).toContain(SYMBOL_COLUMN_ID);
    const cabecera = screen.getByTestId(`data-table-head-${SYMBOL_COLUMN_ID}`);
    fireEvent.click(within(cabecera).getAllByRole('button')[0]!);

    expect(ultimoDestino()).toBe(
      `${UNITS_ROUTE}?${buildUnitListQuery({
        ...params,
        sort: { columnId: SYMBOL_COLUMN_ID, direction: 'asc' },
      })}`,
    );
  });

  it('ordenar por equivalencia NO SE OFRECE: no esta en la lista blanca (R19)', async () => {
    const user = setupUser();
    montar();

    expect(UNIT_QUERYABLE.sortable).not.toContain(EQUIVALENCE_COLUMN_ID);
    const cabecera = screen.getByTestId(`data-table-head-${EQUIVALENCE_COLUMN_ID}`);
    // Sin `sortable` no hay `aria-sort` y la etiqueta no es un boton.
    expect(cabecera).not.toHaveAttribute('aria-sort');

    // Y en su menu de columna tampoco aparece ninguna entrada de orden.
    await user.click(screen.getByTestId(`data-table-header-menu-${EQUIVALENCE_COLUMN_ID}`));
    await screen.findByTestId(`data-table-header-menu-content-${EQUIVALENCE_COLUMN_ID}`);
    expect(screen.queryByTestId(`data-table-sort-asc-${EQUIVALENCE_COLUMN_ID}`)).toBeNull();
    expect(screen.queryByTestId(`data-table-sort-desc-${EQUIVALENCE_COLUMN_ID}`)).toBeNull();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('la columna de acciones no ofrece ningun control de orden en su cabecera', () => {
    montar();

    const cabecera = screen.getByTestId('data-table-head-actions');
    expect(cabecera).not.toHaveAttribute('aria-sort');
    expect(within(cabecera).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('la pantalla no ofrece NINGUN filtro (R20)', () => {
  it('ni barra de filtros por columna, ni chips de filtro, ni entrada de filtro en los menus', async () => {
    const user = setupUser();
    montar();

    // La barra `data-table-filters` es el envoltorio compartido que hospeda la caja de busqueda:
    // lo que R20 prohibe es que haya un CONTROL de filtro dentro. Los controles del componente
    // compartido llevan todos el prefijo `data-table-filter-` (por columna, de fecha, de rango,
    // de opcion, de limpiar y la entrada «filtrar» del menu de columna).
    expect(document.querySelectorAll('[data-testid^="data-table-filter-"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-testid^="data-table-date-"]')).toHaveLength(0);

    // Y el menu de una columna abierta tampoco ofrece «filtrar»: ninguna columna declara `filter`.
    await user.click(screen.getByTestId(`data-table-header-menu-${NAME_COLUMN_ID}`));
    await screen.findByTestId(`data-table-header-menu-content-${NAME_COLUMN_ID}`);
    expect(screen.queryByTestId(`data-table-filter-open-${NAME_COLUMN_ID}`)).toBeNull();
  });

  it('los parametros que la tabla emite al navegar no llevan ningun filtro', async () => {
    const user = setupUser();
    const params = montar();

    await user.click(screen.getByTestId('data-table-next'));

    expect(params.filters).toEqual({});
    expect(ultimoDestino()).not.toContain('filters');
  });
});

describe('la busqueda existe, es por nombre y viaja al servidor (R18)', () => {
  it('la caja de busqueda SI se monta: el contrato declara `searchable: true`', () => {
    montar();

    expect(UNIT_QUERYABLE.searchable).toBe(true);
    const campo = screen.getByTestId('data-table-search');
    expect(campo).toHaveAttribute('type', 'search');
  });

  it('escribir un termino navega con ese termino en la URL, sobre el conjunto entero', async () => {
    vi.useFakeTimers();
    const params = montar();

    // `fireEvent.change` en vez de teclear: con temporizadores falseados, `user-event` no resuelve
    // su espera interna en este repo (ver `tests/unit/shared/data-table-filters.test.tsx`).
    fireEvent.change(screen.getByTestId('data-table-search'), { target: { value: 'kilo' } });

    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(ultimoDestino()).toBe(
      `${UNITS_ROUTE}?${buildUnitListQuery({ ...params, page: 1, search: 'kilo' })}`,
    );
    vi.useRealTimers();
  });

  it('el termino NO filtra en cliente: las tres filas siguen pintadas', async () => {
    vi.useFakeTimers();
    montar();

    fireEvent.change(screen.getByTestId('data-table-search'), { target: { value: 'kilo' } });
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(screen.getAllByRole('row').slice(1)).toHaveLength(UNIDADES.length);
    vi.useRealTimers();
  });
});
