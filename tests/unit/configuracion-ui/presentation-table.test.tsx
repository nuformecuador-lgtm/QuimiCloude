// QC-45 T6 — La tabla de la lista de presentaciones: R8, R10, R11, R12, R13.
//
// **`useRouter` esta mockeada**: la tabla no navega de verdad en jsdom, pero lo que importa es que
// emita **la consulta exacta**, y eso se afirma sobre el `href` que recibe `router.push`.
//
// **Ningun assert sobre copy** (R35): filas, celdas y controles se localizan por los
// `data-testid` del componente compartido (`data-table-*`) y por constantes exportadas. Que esos
// `data-testid` sean los del componente compartido es, ademas, la prueba de R8: si la pantalla
// hubiera escrito su propia tabla o su propia barra de paginacion, no existirian.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NAME_COLUMN_ID,
  PresentationTable,
  buildPresentationListQuery,
} from '@/app/(private)/configuracion/presentaciones/components';
import {
  PAGE_SIZE_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  type DataTableParams,
} from '@/components/shared/data-table';
import type { PresentationView } from '@/lib/modules/inventario';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { PRESENTATIONS_ROUTE } from '@/lib/shared/routes';
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

// Dobles que FALLAN si se les llama: la tabla no lee ni escribe nada (R32).
vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde la tabla`);
  };
  return {
    listPresentationsAction: vi.fn(noDebeInvocarse('listPresentationsAction')),
    createPresentationAction: vi.fn(noDebeInvocarse('createPresentationAction')),
    updatePresentationAction: vi.fn(noDebeInvocarse('updatePresentationAction')),
    deletePresentationAction: vi.fn(noDebeInvocarse('deletePresentationAction')),
  };
});

function presentacion(id: string, name: string): PresentationView {
  return {
    id,
    name,
    nameNormalized: name.toLowerCase(),
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
  };
}

/** Llegan a proposito DESORDENADAS alfabeticamente: R10 y R11 se comprueban con ellas. */
const PRESENTACIONES: readonly PresentationView[] = [
  presentacion('p3', 'Tambor 200 L'),
  presentacion('p1', 'Bidón 20 L'),
  presentacion('p2', 'Saco 25 kg'),
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

function montar(overrides: Partial<DataTableParams> = {}, totalPages = 3) {
  const params = parametros(overrides);
  render(
    <PresentationTable
      presentations={PRESENTACIONES}
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
  // (`tests/helpers/viewport.ts`), nunca con una copia local (R33).
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('la lista usa la tabla COMPARTIDA y no declara una propia (R8)', () => {
  it('monta `DataTable` con una fila por presentacion', () => {
    montar();

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    for (const item of PRESENTACIONES) {
      expect(screen.getByTestId(`data-table-row-${item.id}`)).toBeInTheDocument();
    }
  });

  it('el indicador de pagina y el selector de tamano son los del componente compartido (R12, R13)', () => {
    montar({ page: 2 }, 3);

    // Si la pantalla hubiera escrito su propia barra de paginacion, estos no existirian.
    expect(screen.getByTestId('data-table-pagination')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-page-indicator')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('data-table-previous')).toBeEnabled();
    expect(screen.getByTestId('data-table-next')).toBeEnabled();
    expect(screen.getByTestId('data-table-page-size')).toBeInTheDocument();
  });
});

describe('las filas se pintan en el orden en que llegan (R10, R11)', () => {
  it('no se reordena, ni se filtra, ni se recorta en el cliente aunque los parametros digan otra cosa', () => {
    montar({
      page: 99,
      sort: { columnId: NAME_COLUMN_ID, direction: 'asc' },
      search: 'no-casa-con-ninguna',
    });

    const filas = screen.getAllByRole('row').slice(1);
    expect(filas.map((fila) => fila.getAttribute('data-testid'))).toEqual([
      'data-table-row-p3',
      'data-table-row-p1',
      'data-table-row-p2',
    ]);
    // Ninguna fila desaparece por un termino de busqueda que ninguna cumple.
    expect(filas).toHaveLength(PRESENTACIONES.length);
  });
});

describe('cambiar pagina navega con la consulta esperada (R13)', () => {
  it('avanzar de pagina pide la lista de nuevo con la pagina siguiente', async () => {
    const params = montar({ page: 1 }, 3);

    await userEvent.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino()).toBe(
      `${PRESENTATIONS_ROUTE}?${buildPresentationListQuery({ ...params, page: 2 })}`,
    );
  });

  it('retroceder de pagina pide la lista de nuevo con la pagina anterior', async () => {
    const params = montar({ page: 3 }, 3);

    await userEvent.click(screen.getByTestId('data-table-previous'));

    expect(ultimoDestino()).toBe(
      `${PRESENTATIONS_ROUTE}?${buildPresentationListQuery({ ...params, page: 2 })}`,
    );
  });

  it('el destino sale SIEMPRE de la constante de ruta (R2)', async () => {
    montar();

    await userEvent.click(screen.getByTestId('data-table-next'));

    expect(ultimoDestino().startsWith(`${PRESENTATIONS_ROUTE}?`)).toBe(true);
  });
});

describe('el tamano de pagina ofrece 10 y 25 y recarga la lista (R12)', () => {
  it('las opciones son exactamente las del componente compartido', async () => {
    montar();

    await userEvent.click(screen.getByTestId('data-table-page-size'));

    expect(await screen.findAllByRole('option')).toHaveLength(PAGE_SIZE_OPTIONS.length);
    for (const tamano of PAGE_SIZE_OPTIONS) {
      expect(screen.getByTestId(`data-table-page-size-${tamano}`)).toBeInTheDocument();
    }
  });

  it('elegir otro tamano navega con ese tamano y vuelve a la primera pagina', async () => {
    const params = montar({ page: 3 }, 3);
    const otro = PAGE_SIZE_OPTIONS.find((option) => option !== params.pageSize)!;

    await userEvent.click(screen.getByTestId('data-table-page-size'));
    await userEvent.click(screen.getByTestId(`data-table-page-size-${otro}`));

    expect(ultimoDestino()).toBe(
      `${PRESENTATIONS_ROUTE}?${buildPresentationListQuery({ ...params, page: 1, pageSize: otro })}`,
    );
  });

  it('sin tamano en la URL la tabla parte del tamano por defecto (10)', () => {
    const params = montar();

    expect(params.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(PAGE_SIZE_OPTIONS).toContain(DEFAULT_PAGE_SIZE);
  });
});

describe('ordenar por la columna de nombre navega, no reordena en cliente (R11)', () => {
  it('la cabecera del nombre pide la lista de nuevo con ese orden', () => {
    const params = montar();

    const cabecera = screen.getByTestId(`data-table-head-${NAME_COLUMN_ID}`);
    fireEvent.click(within(cabecera).getAllByRole('button')[0]);

    expect(ultimoDestino()).toBe(
      `${PRESENTATIONS_ROUTE}?${buildPresentationListQuery({
        ...params,
        sort: { columnId: NAME_COLUMN_ID, direction: 'asc' },
      })}`,
    );
  });

  it('la columna de acciones no ofrece ningun control de orden en su cabecera', () => {
    montar();

    const cabecera = screen.getByTestId('data-table-head-actions');
    expect(within(cabecera).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('la busqueda existe y viaja al servidor (R10)', () => {
  it('la caja de busqueda SI se monta: el contrato declara `searchable: true`', () => {
    montar();

    const campo = screen.getByTestId('data-table-search');
    expect(campo).toHaveAttribute('type', 'search');
  });

  it('escribir un termino navega con ese termino en la URL, sobre el conjunto entero', async () => {
    vi.useFakeTimers();
    const params = montar();

    // `fireEvent.change` en vez de `userEvent.type`: con temporizadores falseados, `userEvent` no
    // resuelve su espera interna en este repo (ver `tests/unit/shared/data-table-filters.test.tsx`).
    fireEvent.change(screen.getByTestId('data-table-search'), { target: { value: 'bidón' } });

    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(ultimoDestino()).toBe(
      `${PRESENTATIONS_ROUTE}?${buildPresentationListQuery({ ...params, page: 1, search: 'bidón' })}`,
    );
    vi.useRealTimers();
  });
});
