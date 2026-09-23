import { cleanup, render, screen, waitFor } from '@testing-library/react';
import {
  mockAllIsIntersecting,
  resetIntersectionMocking,
  setupIntersectionMocking,
} from 'react-intersection-observer/test-utils';

import { setupUser } from '../../helpers/user-event';

import {
  EMPTY_SHOWCASE_FILTERS,
  SupplierShowcaseList,
} from '@/app/(private)/proveedores/components';
import type {
  ShowcaseLinesResult,
  SupplierShowcaseResult,
} from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import type { ShowcaseRow } from '@/lib/modules/proveedores';

const { listSupplierShowcaseActionMock, listShowcaseLinesActionMock } = vi.hoisted(() => ({
  listSupplierShowcaseActionMock: vi.fn<(query: unknown) => Promise<SupplierShowcaseResult>>(),
  listShowcaseLinesActionMock:
    vi.fn<(supplierId: string, query: unknown) => Promise<ShowcaseLinesResult>>(),
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-actions', () => ({
  listSupplierShowcaseAction: listSupplierShowcaseActionMock,
  listShowcaseLinesAction: listShowcaseLinesActionMock,
}));

function fila(overrides: Partial<ShowcaseRow> = {}): ShowcaseRow {
  return {
    id: crypto.randomUUID(),
    name: 'Químicos del Norte',
    lines: [],
    hasMoreLines: false,
    ...overrides,
  };
}

function exito(items: readonly ShowcaseRow[], hasMore: boolean): SupplierShowcaseResult {
  return { status: 'success', data: { items, page: 1, hasMore } };
}

beforeAll(() => {
  setupIntersectionMocking(vi.fn);
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  resetIntersectionMocking();
});

describe('SupplierShowcaseList — acumulacion (R12, R17)', () => {
  it('añade la tanda siguiente al final sin perder la primera', async () => {
    const primera = fila({ name: 'Alfa' });
    const segunda = fila({ name: 'Beta' });
    listSupplierShowcaseActionMock.mockResolvedValue(exito([segunda], false));

    render(
      <SupplierShowcaseList
        initialPage={{ items: [primera], hasMore: true }}
        filters={EMPTY_SHOWCASE_FILTERS}
      />,
    );

    mockAllIsIntersecting(true);

    await waitFor(() =>
      expect(screen.getByTestId(`supplier-showcase-row-${segunda.id}`)).toBeInTheDocument(),
    );
    expect(screen.getByTestId(`supplier-showcase-row-${primera.id}`)).toBeInTheDocument();
  });

  it('descarta un id repetido en la tanda siguiente', async () => {
    const primera = fila({ name: 'Alfa' });
    const repetida = fila({ id: primera.id, name: 'Alfa' });
    const nueva = fila({ name: 'Gamma' });
    listSupplierShowcaseActionMock.mockResolvedValue(exito([repetida, nueva], false));

    render(
      <SupplierShowcaseList
        initialPage={{ items: [primera], hasMore: true }}
        filters={EMPTY_SHOWCASE_FILTERS}
      />,
    );

    mockAllIsIntersecting(true);

    await waitFor(() =>
      expect(screen.getByTestId(`supplier-showcase-row-${nueva.id}`)).toBeInTheDocument(),
    );
    // El sufijo es el `id` de la fila: un patron que solo termine en guion se colaria tambien por
    // `supplier-showcase-row-empty`, que es el aviso de «sin productos todavia» de cada fila.
    expect(screen.getAllByTestId(/^supplier-showcase-row-[0-9a-f-]{36}$/)).toHaveLength(2);
  });
});

describe('SupplierShowcaseList — un solo vuelo a la vez (R14)', () => {
  it('mientras una tanda esta en vuelo, un segundo disparo no pide otra', async () => {
    let resolver: (value: SupplierShowcaseResult) => void = () => {};
    listSupplierShowcaseActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    render(
      <SupplierShowcaseList
        initialPage={{ items: [fila()], hasMore: true }}
        filters={EMPTY_SHOWCASE_FILTERS}
      />,
    );

    mockAllIsIntersecting(true);
    await waitFor(() =>
      expect(screen.getByTestId('supplier-showcase-list')).toHaveAttribute('aria-busy', 'true'),
    );

    mockAllIsIntersecting(true);
    expect(listSupplierShowcaseActionMock).toHaveBeenCalledTimes(1);

    resolver(exito([], false));
    await waitFor(() =>
      expect(screen.getByTestId('supplier-showcase-list')).toHaveAttribute('aria-busy', 'false'),
    );
  });
});

describe('SupplierShowcaseList — se detiene (R13)', () => {
  it('con hasMore false desde el principio no pinta el centinela ni pide nada', () => {
    render(
      <SupplierShowcaseList
        initialPage={{ items: [fila()], hasMore: false }}
        filters={EMPTY_SHOWCASE_FILTERS}
      />,
    );

    expect(screen.queryByTestId('showcase-load-trigger')).toBeNull();
    expect(listSupplierShowcaseActionMock).not.toHaveBeenCalled();
  });
});

describe('SupplierShowcaseList — fallo y Reintentar (R35)', () => {
  it('conserva lo cargado, pinta el aviso sin detalle tecnico y deja de observar el centinela', async () => {
    listSupplierShowcaseActionMock.mockResolvedValue({
      status: 'error',
      code: 'unexpected',
      message: 'algo revento',
      reference: 'req-777',
    });

    render(
      <SupplierShowcaseList
        initialPage={{ items: [fila()], hasMore: true }}
        filters={EMPTY_SHOWCASE_FILTERS}
      />,
    );

    mockAllIsIntersecting(true);

    const aviso = await screen.findByRole('alert');
    expect(aviso).not.toHaveTextContent('algo revento');
    expect(aviso).not.toHaveTextContent('req-777');
    expect(screen.queryByTestId('showcase-load-trigger')).toBeNull();
  });

  it('Reintentar repite la misma pagina y, si sale bien, retira el aviso', async () => {
    const nueva = fila({ name: 'Beta' });
    listSupplierShowcaseActionMock
      .mockResolvedValueOnce({ status: 'error', code: 'unexpected', message: 'x', reference: 'r-1' })
      .mockResolvedValueOnce(exito([nueva], false));
    const user = setupUser();

    render(
      <SupplierShowcaseList
        initialPage={{ items: [fila()], hasMore: true }}
        filters={EMPTY_SHOWCASE_FILTERS}
      />,
    );

    mockAllIsIntersecting(true);
    await screen.findByRole('alert');

    await user.click(screen.getByTestId('supplier-showcase-list-retry'));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByTestId(`supplier-showcase-row-${nueva.id}`)).toBeInTheDocument();
    expect(listSupplierShowcaseActionMock).toHaveBeenCalledTimes(2);
    expect(listSupplierShowcaseActionMock.mock.calls[1]?.[0]).toEqual({
      page: 2,
      supplierSearch: '',
      productSearch: '',
    });
  });

  it('si «Reintentar» vuelve a fallar, el aviso sigue puesto', async () => {
    listSupplierShowcaseActionMock.mockResolvedValue({
      status: 'error',
      code: 'unexpected',
      message: 'x',
      reference: 'r-1',
    });
    const user = setupUser();

    render(
      <SupplierShowcaseList
        initialPage={{ items: [fila()], hasMore: true }}
        filters={EMPTY_SHOWCASE_FILTERS}
      />,
    );

    mockAllIsIntersecting(true);
    await screen.findByRole('alert');

    await user.click(screen.getByTestId('supplier-showcase-list-retry'));

    await waitFor(() => expect(listSupplierShowcaseActionMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('SupplierShowcaseList — filtros vigentes (D14)', () => {
  it('la tanda siguiente pide la misma busqueda de proveedor y de producto', async () => {
    listSupplierShowcaseActionMock.mockResolvedValue(exito([], false));

    render(
      <SupplierShowcaseList
        initialPage={{ items: [fila()], hasMore: true }}
        filters={{ supplierSearch: 'norte', productSearch: 'acido' }}
      />,
    );

    mockAllIsIntersecting(true);

    await waitFor(() =>
      expect(listSupplierShowcaseActionMock).toHaveBeenCalledExactlyOnceWith({
        page: 2,
        supplierSearch: 'norte',
        productSearch: 'acido',
      }),
    );
  });
});
