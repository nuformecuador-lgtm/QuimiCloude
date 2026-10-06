// El autocomplete del nombre en el alta de producto: filtra por el tipo elegido y, si se cambia
// el tipo tras elegir un producto existente, vacia lo autocompletado. Las Server Actions son dobles.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductForm } from '@/app/(private)/inventario/components';
import { Sheet } from '@/components/ui/sheet';
import { PRODUCT_TYPES, type ProductType } from '@/lib/modules/inventario';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

const { listProductsActionMock, listPresentationsActionMock } = vi.hoisted(() => ({
  listProductsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  listPresentationsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
  listProductsAction: listProductsActionMock,
  deleteProductAction: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: vi.fn(),
}));

const BOTELLA = {
  id: crypto.randomUUID(),
  name: 'Botella PET 500 ml',
  qtyAlert: '10.0000',
  type: PRODUCT_TYPES.PACKAGING,
};

function filtroDeTipo(type: ProductType) {
  return { filters: { type: { kind: 'select', values: [type] } } };
}

function montarAlta() {
  render(
    <Sheet open>
      <ProductForm onSaved={vi.fn()} />
    </Sheet>,
  );
}

async function elegirTipo(user: ReturnType<typeof setupUser>, etiqueta: string) {
  await user.click(screen.getByLabelText('Tipo'));
  await user.click(await esperarInteractiva(await screen.findByRole('option', { name: etiqueta })));
}

async function elegirBotella(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId('product-field-name'));
  const opcion = await screen.findByRole('option', { name: BOTELLA.name });
  await user.click(await esperarInteractiva(opcion));
  await waitFor(() => expect(screen.getByTestId('product-name-value')).toHaveValue(BOTELLA.name));
}

beforeEach(() => {
  vi.clearAllMocks();
  listProductsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [BOTELLA], page: 1, pageSize: MAX_PAGE_SIZE, total: 1, totalPages: 1 },
  });
  listPresentationsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
});

describe('alta de producto — autocomplete del nombre por tipo', () => {
  it('el autocomplete pide al servidor solo productos del tipo elegido', async () => {
    const user = setupUser();
    montarAlta();

    await user.click(screen.getByTestId('product-field-name'));
    await waitFor(() =>
      expect(listProductsActionMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, ...filtroDeTipo(PRODUCT_TYPES.PRODUCT) }),
      ),
    );

    await user.keyboard('{Escape}');
    await elegirTipo(user, 'Instrumento');
    await user.click(screen.getByTestId('product-field-name'));

    await waitFor(() =>
      expect(listProductsActionMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, ...filtroDeTipo(PRODUCT_TYPES.MACHINE) }),
      ),
    );
  });

  it('cambiar el tipo tras elegir un producto vacia nombre, alerta y existencia', async () => {
    const user = setupUser();
    montarAlta();

    await elegirTipo(user, 'Envase');
    await elegirBotella(user);
    expect(screen.getByTestId('product-field-qtyAlert')).toHaveValue('10');
    await user.type(screen.getByTestId('product-field-stock'), '5');

    await elegirTipo(user, 'Producto');

    expect(screen.getByTestId('product-name-value')).toHaveValue('');
    expect(screen.getByTestId('product-field-name')).toHaveValue('');
    expect(screen.getByTestId('product-field-qtyAlert')).toHaveValue('');
    expect(screen.getByTestId('product-field-stock')).toHaveValue('');
    expect(screen.getByLabelText('Tipo')).toHaveTextContent('Producto');
  });

  it('cambiar el tipo con solo texto libre escrito conserva lo escrito', async () => {
    const user = setupUser();
    montarAlta();

    await user.type(screen.getByTestId('product-field-name'), 'Alcohol isopropilico');
    await user.keyboard('{Escape}');
    await user.type(screen.getByTestId('product-field-qtyAlert'), '3');
    await user.type(screen.getByTestId('product-field-stock'), '7');

    await elegirTipo(user, 'Envase');

    expect(screen.getByTestId('product-name-value')).toHaveValue('Alcohol isopropilico');
    expect(screen.getByTestId('product-field-qtyAlert')).toHaveValue('3');
    expect(screen.getByTestId('product-field-stock')).toHaveValue('7');
  });
});
