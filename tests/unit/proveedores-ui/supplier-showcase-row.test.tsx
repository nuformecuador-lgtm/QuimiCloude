import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { setupUser } from '../../helpers/user-event';

import { SupplierShowcaseRow } from '@/app/(private)/proveedores/components';
import type { ShowcaseLinesResult } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import type { ShowcaseLine, ShowcaseRow } from '@/lib/modules/proveedores';
import { supplierDetailRoute } from '@/lib/shared/routes';

const { listShowcaseLinesActionMock } = vi.hoisted(() => ({
  listShowcaseLinesActionMock:
    vi.fn<(supplierId: string, query: unknown) => Promise<ShowcaseLinesResult>>(),
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-actions', () => ({
  listShowcaseLinesAction: listShowcaseLinesActionMock,
}));

function linea(overrides: Partial<ShowcaseLine> = {}): ShowcaseLine {
  return {
    id: crypto.randomUUID(),
    name: 'Ácido cítrico anhidro',
    imageUrl: null,
    ...overrides,
  };
}

function fila(overrides: Partial<ShowcaseRow> = {}): ShowcaseRow {
  return {
    id: crypto.randomUUID(),
    name: 'Químicos del Norte',
    lines: [linea()],
    hasMoreLines: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('SupplierShowcaseRow — nombre del proveedor (R6)', () => {
  it('enlaza al detalle con supplierDetailRoute', () => {
    const proveedor = fila();

    render(<SupplierShowcaseRow row={proveedor} productSearch="" />);

    const enlace = screen.getByTestId('supplier-detail-link');
    expect(enlace).toHaveAttribute('href', supplierDetailRoute(proveedor.id));
    expect(enlace).toHaveTextContent(proveedor.name);
  });

  it('R39 — el nombre del proveedor puede encoger y partirse, aunque no tenga espacios', () => {
    const proveedor = fila({ name: 'a'.repeat(120) });

    render(<SupplierShowcaseRow row={proveedor} productSearch="" />);

    const enlace = screen.getByTestId('supplier-detail-link');
    expect(enlace.className).toContain('min-w-11');
    expect(enlace.className).toContain('max-w-full');

    // El texto de un `<a>` flex es un item anónimo que no encoge; por eso va en un `span`.
    const span = enlace.querySelector('span');
    expect(span).not.toBeNull();
    expect(span?.className).toContain('min-w-0');
    expect(span?.className).toContain('break-words');
    expect(span).toHaveTextContent(proveedor.name);
  });
});

describe('SupplierShowcaseRow — sin líneas (R30)', () => {
  it('pinta «Sin productos todavía» con un enlace a la ficha, en vez del carrusel', () => {
    const proveedor = fila({ lines: [], hasMoreLines: false });

    render(<SupplierShowcaseRow row={proveedor} productSearch="" />);

    expect(screen.getByTestId('supplier-showcase-row-empty')).toHaveTextContent(
      'Sin productos todavía',
    );
    const enlaces = screen.getAllByRole('link', { name: /ver ficha del proveedor|Químicos del Norte/i });
    expect(enlaces.some((enlace) => enlace.getAttribute('href') === supplierDetailRoute(proveedor.id)))
      .toBe(true);
    expect(screen.queryByRole('region', { name: `Productos de ${proveedor.name}` })).toBeNull();
  });
});

describe('SupplierShowcaseRow — carrusel (R7, R40)', () => {
  it('R40 — el carrusel expone un nombre accesible que identifica al proveedor', () => {
    const proveedor = fila();

    render(<SupplierShowcaseRow row={proveedor} productSearch="" />);

    expect(screen.getByRole('region', { name: `Productos de ${proveedor.name}` })).toBeInTheDocument();
  });

  it('R39 — la lista del carrusel usa scroll horizontal con snap y es enfocable por teclado', () => {
    const proveedor = fila();

    render(<SupplierShowcaseRow row={proveedor} productSearch="" />);

    const lista = screen.getByRole('region', { name: `Productos de ${proveedor.name}` }).querySelector('ul');
    expect(lista?.className).toContain('flex');
    expect(lista?.className).toContain('overflow-x-auto');
    expect(lista?.className).toContain('snap-x');
    expect(lista?.className).toContain('snap-mandatory');
    expect(lista?.className).toContain('overscroll-x-contain');
    expect(lista).toHaveAttribute('tabIndex', '0');
  });
});

describe('SupplierShowcaseRow — cargar más (R15, R16, R40)', () => {
  it('R16 — si la fila ya muestra todas sus líneas, no ofrece «cargar más»', () => {
    const proveedor = fila({ hasMoreLines: false });

    render(<SupplierShowcaseRow row={proveedor} productSearch="" />);

    expect(screen.queryByTestId('supplier-showcase-row-load-more')).toBeNull();
  });

  it('R15 — si quedan líneas, ofrece «cargar más» y al activarlo añade las siguientes sin afectar otra fila', async () => {
    const proveedor = fila({ hasMoreLines: true });
    const nuevaLinea = linea({ id: crypto.randomUUID(), name: 'Hipoclorito de sodio' });
    listShowcaseLinesActionMock.mockResolvedValue({
      status: 'success',
      data: { items: [nuevaLinea], page: 2, hasMore: false },
    });
    const user = setupUser();

    render(<SupplierShowcaseRow row={proveedor} productSearch="" />);

    const boton = screen.getByTestId('supplier-showcase-row-load-more');
    expect(boton).toHaveAccessibleName(`Cargar más productos de ${proveedor.name}`);
    expect(boton.className).toContain('min-h-11');
    expect(boton.className).toContain('min-w-11');

    await user.click(boton);

    await waitFor(() =>
      expect(screen.getByTestId(`showcase-line-card-${nuevaLinea.id}`)).toBeInTheDocument(),
    );
    expect(screen.getByTestId(`showcase-line-card-${proveedor.lines[0]!.id}`)).toBeInTheDocument();
    expect(listShowcaseLinesActionMock).toHaveBeenCalledExactlyOnceWith(proveedor.id, {
      page: 2,
      productSearch: '',
    });
    // Se agotó: el control desaparece.
    expect(screen.queryByTestId('supplier-showcase-row-load-more')).toBeNull();
  });

  it('R15 — mientras la carga está en vuelo, señala aria-busy y no lanza una segunda carga', async () => {
    const proveedor = fila({ hasMoreLines: true });
    let resolver: (value: ShowcaseLinesResult) => void = () => {};
    listShowcaseLinesActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );
    const user = setupUser();

    render(<SupplierShowcaseRow row={proveedor} productSearch="" />);
    const boton = screen.getByTestId('supplier-showcase-row-load-more');

    await user.click(boton);
    expect(boton).toHaveAttribute('aria-busy', 'true');

    await user.click(boton);
    expect(listShowcaseLinesActionMock).toHaveBeenCalledTimes(1);

    resolver({ status: 'success', data: { items: [], page: 2, hasMore: false } });
    await waitFor(() => expect(screen.queryByTestId('supplier-showcase-row-load-more')).toBeNull());
  });

  it('pasa la misma búsqueda de producto que la tanda inicial', async () => {
    const proveedor = fila({ hasMoreLines: true });
    listShowcaseLinesActionMock.mockResolvedValue({
      status: 'success',
      data: { items: [], page: 2, hasMore: false },
    });
    const user = setupUser();

    render(<SupplierShowcaseRow row={proveedor} productSearch="ácido" />);
    await user.click(screen.getByTestId('supplier-showcase-row-load-more'));

    await waitFor(() =>
      expect(listShowcaseLinesActionMock).toHaveBeenCalledExactlyOnceWith(proveedor.id, {
        page: 2,
        productSearch: 'ácido',
      }),
    );
  });
});

describe('SupplierShowcaseRow — fallo de «cargar más» (R35, R40)', () => {
  it('conserva lo ya cargado y pinta el aviso con Reintentar al final del carrusel, sin detalle técnico', async () => {
    const proveedor = fila({ hasMoreLines: true });
    listShowcaseLinesActionMock.mockResolvedValue({
      status: 'error',
      code: 'unexpected',
      message: 'algo salio mal',
      reference: 'req-123',
    });
    const user = setupUser();

    render(<SupplierShowcaseRow row={proveedor} productSearch="" />);
    await user.click(screen.getByTestId('supplier-showcase-row-load-more'));

    const aviso = await screen.findByRole('alert');
    expect(aviso).not.toHaveTextContent('algo salio mal');
    expect(aviso).not.toHaveTextContent('req-123');
    expect(screen.getByTestId(`showcase-line-card-${proveedor.lines[0]!.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId('supplier-showcase-row-load-more')).toBeNull();

    const reintentar = screen.getByTestId('supplier-showcase-row-retry');
    expect(reintentar).toHaveAccessibleName(`Reintentar carga de productos de ${proveedor.name}`);
    expect(reintentar.className).toContain('min-h-11');
    expect(reintentar.className).toContain('min-w-11');
  });

  it('R35 — «Reintentar» repite la misma carga y, si sale bien, retira el aviso', async () => {
    const proveedor = fila({ hasMoreLines: true });
    const nuevaLinea = linea({ id: crypto.randomUUID(), name: 'Hipoclorito de sodio' });
    listShowcaseLinesActionMock
      .mockResolvedValueOnce({ status: 'error', code: 'unexpected', message: 'x', reference: 'r-1' })
      .mockResolvedValueOnce({
        status: 'success',
        data: { items: [nuevaLinea], page: 2, hasMore: false },
      });
    const user = setupUser();

    render(<SupplierShowcaseRow row={proveedor} productSearch="" />);
    await user.click(screen.getByTestId('supplier-showcase-row-load-more'));
    await screen.findByRole('alert');

    await user.click(screen.getByTestId('supplier-showcase-row-retry'));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByTestId(`showcase-line-card-${nuevaLinea.id}`)).toBeInTheDocument();
    expect(listShowcaseLinesActionMock).toHaveBeenCalledTimes(2);
    expect(listShowcaseLinesActionMock.mock.calls[1]).toEqual([proveedor.id, { page: 2, productSearch: '' }]);
  });

  it('R35 — si «Reintentar» vuelve a fallar, el aviso sigue puesto', async () => {
    const proveedor = fila({ hasMoreLines: true });
    listShowcaseLinesActionMock.mockResolvedValue({
      status: 'error',
      code: 'unexpected',
      message: 'x',
      reference: 'r-1',
    });
    const user = setupUser();

    render(<SupplierShowcaseRow row={proveedor} productSearch="" />);
    await user.click(screen.getByTestId('supplier-showcase-row-load-more'));
    await screen.findByRole('alert');

    await user.click(screen.getByTestId('supplier-showcase-row-retry'));

    await waitFor(() => expect(listShowcaseLinesActionMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('R35: conserva lo ya cargado y pinta el aviso con Reintentar cuando la accion rechaza (fallo de red), sin detalle tecnico', async () => {
    const proveedor = fila({ hasMoreLines: true });
    listShowcaseLinesActionMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const user = setupUser();

    render(<SupplierShowcaseRow row={proveedor} productSearch="" />);
    const boton = screen.getByTestId('supplier-showcase-row-load-more');
    await user.click(boton);

    const aviso = await screen.findByRole('alert');
    expect(aviso).not.toHaveTextContent('Failed to fetch');
    expect(screen.getByTestId(`showcase-line-card-${proveedor.lines[0]!.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId('supplier-showcase-row-load-more')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('supplier-showcase-row-retry')).not.toHaveAttribute('aria-busy', 'true'));
  });

  it('R35: cuando la accion rechaza (fallo de red), «Reintentar» repite la misma carga y, si sale bien, retira el aviso', async () => {
    const proveedor = fila({ hasMoreLines: true });
    const nuevaLinea = linea({ id: crypto.randomUUID(), name: 'Hipoclorito de sodio' });
    listShowcaseLinesActionMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        status: 'success',
        data: { items: [nuevaLinea], page: 2, hasMore: false },
      });
    const user = setupUser();

    render(<SupplierShowcaseRow row={proveedor} productSearch="" />);
    await user.click(screen.getByTestId('supplier-showcase-row-load-more'));
    await screen.findByRole('alert');

    await user.click(screen.getByTestId('supplier-showcase-row-retry'));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByTestId(`showcase-line-card-${nuevaLinea.id}`)).toBeInTheDocument();
    expect(listShowcaseLinesActionMock).toHaveBeenCalledTimes(2);
  });
});

describe('SupplierShowcaseRow — sin autores (R8)', () => {
  it('no muestra quién creó ni quién modificó el proveedor ni sus líneas', () => {
    const proveedor = fila();

    render(<SupplierShowcaseRow row={proveedor} productSearch="" />);

    expect(document.body.textContent ?? '').not.toMatch(/creado por|modificado por|createdBy|updatedBy/i);
  });
});
