// Selector de envases del reparto contra un doble de `listProductsAction`.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PACKAGING_OPTION_AVAILABLE_TESTID,
  PACKAGING_OPTION_PRESENTATION_TESTID,
  PACKAGING_OPTION_TESTID,
  PACKAGING_SELECT_FORBIDDEN_TESTID,
  PACKAGING_SELECT_TESTID,
  PackagingSelect,
  type PackagingOption,
} from '@/app/(private)/pedidos/components';
import { PRODUCT_PRESENTATION_UNIT_FILTER, PRODUCT_TYPES } from '@/lib/modules/inventario';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

const { listProductsActionMock } = vi.hoisted(() => ({
  listProductsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

const LITRO_ID = crypto.randomUUID();
const MILILITRO_ID = crypto.randomUUID();
const UNIDAD_U_ID = crypto.randomUUID();

function envase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    name: 'Botella PET 500 ml',
    imagePath: null,
    stock: '150.0000',
    unitId: UNIDAD_U_ID,
    qtyAlert: null,
    type: PRODUCT_TYPES.PACKAGING,
    createdAt: new Date(),
    updatedAt: new Date(),
    reserved: '30.0000',
    available: '120.0000',
    presentationId: crypto.randomUUID(),
    presentationName: '500 ml',
    presentationContent: '500.0000',
    presentationUnitId: MILILITRO_ID,
    ...overrides,
  };
}

const BOTELLA = envase();
const BIDON_AGOTADO = envase({
  name: 'Bidón 1 L',
  available: '0.0000',
  presentationName: '1 L',
  presentationContent: '1.0000',
  presentationUnitId: LITRO_ID,
});

function pagina(items: readonly unknown[]) {
  return {
    status: 'success',
    data: { items, total: items.length, page: 1, pageSize: MAX_PAGE_SIZE, totalPages: 1 },
  };
}

function opcion(id: string): HTMLElement {
  const encontrada = screen
    .getAllByTestId(PACKAGING_OPTION_TESTID)
    .find((el) => el.getAttribute('data-product-id') === id);
  if (encontrada === undefined) throw new Error(`no hay opcion para ${id}`);
  return encontrada;
}

beforeEach(() => {
  vi.clearAllMocks();
  listProductsActionMock.mockResolvedValue(pagina([BOTELLA, BIDON_AGOTADO]));
});

afterEach(() => {
  cleanup();
});

describe('selector de envases del reparto', () => {
  it('R8: pide solo envases con presentacion en las unidades compatibles con la del pedido', async () => {
    const user = setupUser();
    render(<PackagingSelect unitIds={[LITRO_ID, MILILITRO_ID]} onSelect={vi.fn()} />);

    await user.click(screen.getByTestId(PACKAGING_SELECT_TESTID));
    await screen.findAllByTestId(PACKAGING_OPTION_TESTID);

    expect(listProductsActionMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      filters: {
        type: { kind: 'select', values: [PRODUCT_TYPES.PACKAGING] },
        [PRODUCT_PRESENTATION_UNIT_FILTER]: { kind: 'select', values: [LITRO_ID, MILILITRO_ID] },
      },
    });
  });

  it('R8: la busqueda viaja al servidor con los mismos filtros', async () => {
    const user = setupUser();
    render(<PackagingSelect unitIds={[LITRO_ID]} onSelect={vi.fn()} />);

    await user.type(screen.getByTestId(PACKAGING_SELECT_TESTID), 'botella');

    await waitFor(() =>
      expect(listProductsActionMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: 'botella',
          filters: {
            type: { kind: 'select', values: [PRODUCT_TYPES.PACKAGING] },
            [PRODUCT_PRESENTATION_UNIT_FILTER]: { kind: 'select', values: [LITRO_ID] },
          },
        }),
      ),
    );
  });

  it('R10: cada opcion muestra nombre, presentacion y disponible en envases', async () => {
    const user = setupUser();
    render(<PackagingSelect unitIds={[LITRO_ID, MILILITRO_ID]} onSelect={vi.fn()} />);

    await user.click(screen.getByTestId(PACKAGING_SELECT_TESTID));
    await screen.findAllByTestId(PACKAGING_OPTION_TESTID);

    const botella = opcion(BOTELLA.id);
    expect(botella).toHaveTextContent('Botella PET 500 ml');
    expect(within(botella).getByTestId(PACKAGING_OPTION_PRESENTATION_TESTID)).toHaveTextContent(
      '500 ml',
    );
    expect(within(botella).getByTestId(PACKAGING_OPTION_AVAILABLE_TESTID)).toHaveTextContent(
      'Disponible: 120 envases',
    );
  });

  it('R10: el envase con disponible cero tambien se ofrece y se puede elegir', async () => {
    const user = setupUser();
    const onSelect = vi.fn<(option: PackagingOption | null) => void>();
    render(<PackagingSelect unitIds={[LITRO_ID, MILILITRO_ID]} onSelect={onSelect} />);

    await user.click(screen.getByTestId(PACKAGING_SELECT_TESTID));
    await screen.findAllByTestId(PACKAGING_OPTION_TESTID);
    const agotado = opcion(BIDON_AGOTADO.id);
    expect(within(agotado).getByTestId(PACKAGING_OPTION_AVAILABLE_TESTID)).toHaveTextContent(
      'Disponible: 0 envases',
    );

    await user.click(await esperarInteractiva(agotado));

    expect(onSelect).toHaveBeenLastCalledWith({
      id: BIDON_AGOTADO.id,
      name: 'Bidón 1 L',
      presentationId: BIDON_AGOTADO.presentationId,
      presentationName: '1 L',
      presentationContent: '1.0000',
      presentationUnitId: LITRO_ID,
      available: '0.0000',
    });
    expect(screen.getByTestId(PACKAGING_SELECT_TESTID)).toHaveValue('Bidón 1 L');
  });

  it('R8: escribir algo distinto de lo elegido retira la eleccion', async () => {
    const user = setupUser();
    const onSelect = vi.fn<(option: PackagingOption | null) => void>();
    render(<PackagingSelect unitIds={[MILILITRO_ID]} onSelect={onSelect} />);

    await user.click(screen.getByTestId(PACKAGING_SELECT_TESTID));
    await screen.findAllByTestId(PACKAGING_OPTION_TESTID);
    await user.click(await esperarInteractiva(opcion(BOTELLA.id)));
    await user.type(screen.getByTestId(PACKAGING_SELECT_TESTID), 'x');

    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('R38: sin permiso de consultar inventario avisa y no lista ningun envase', async () => {
    listProductsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso.',
    });
    const user = setupUser();
    render(<PackagingSelect unitIds={[LITRO_ID]} onSelect={vi.fn()} />);

    await user.click(screen.getByTestId(PACKAGING_SELECT_TESTID));

    const aviso = await screen.findByTestId(PACKAGING_SELECT_FORBIDDEN_TESTID);
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(aviso).toHaveTextContent('consultar inventario');
    expect(screen.queryAllByTestId(PACKAGING_OPTION_TESTID)).toHaveLength(0);
    expect(screen.getByTestId(PACKAGING_SELECT_TESTID)).toHaveAttribute(
      'aria-describedby',
      aviso.id,
    );
  });

  it('R38: un rechazo distinto del permiso no se pinta como falta de permiso', async () => {
    listProductsActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'Consulta no valida.',
    });
    const user = setupUser();
    render(<PackagingSelect unitIds={[LITRO_ID]} onSelect={vi.fn()} />);

    await user.click(screen.getByTestId(PACKAGING_SELECT_TESTID));

    expect(await screen.findByText('Consulta no valida.')).toBeInTheDocument();
    expect(screen.queryByTestId(PACKAGING_SELECT_FORBIDDEN_TESTID)).toBeNull();
  });
});
