// El envase en la interfaz de inventario: alta con presentacion fija, existencia en envases
// enteros, lotes en `u` y la marca del envase legado. Las Server Actions son dobles.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AdjustBatchDialog,
  ProductBatchesPanel,
  ProductForm,
} from '@/app/(private)/inventario/components';
import { Sheet } from '@/components/ui/sheet';
import {
  PRODUCT_TYPES,
  type ProductBatchView,
  type ProductView,
} from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

const {
  createProductActionMock,
  updateProductActionMock,
  listProductsActionMock,
  listPresentationsActionMock,
  adjustBatchStockActionMock,
} = vi.hoisted(() => ({
  createProductActionMock: vi.fn<(prev: unknown, data: FormData) => Promise<unknown>>(),
  updateProductActionMock: vi.fn<(id: string, prev: unknown, data: FormData) => Promise<unknown>>(),
  listProductsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  listPresentationsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  adjustBatchStockActionMock: vi.fn<(prev: unknown, data: FormData) => Promise<unknown>>(),
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
  createProductAction: createProductActionMock,
  updateProductAction: updateProductActionMock,
  listProductsAction: listProductsActionMock,
  deleteProductAction: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/batch-actions', () => ({
  adjustBatchStockAction: adjustBatchStockActionMock,
  listProductBatchesAction: vi.fn(),
  listBatchMovementsAction: vi.fn(),
}));

const MILILITRO: UnitRef = {
  id: crypto.randomUUID(),
  name: 'Mililitro',
  symbol: 'ml',
  baseUnitId: null,
  factor: null,
};
const UNIDAD_U: UnitRef = { id: crypto.randomUUID(), name: 'unidad', symbol: 'u', baseUnitId: null, factor: null };
const UNIDADES = [MILILITRO, UNIDAD_U];

const PRESENTACION_500 = {
  id: crypto.randomUUID(),
  name: '500 ml',
  unitId: MILILITRO.id,
  content: '500.0000',
};

function envase(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: crypto.randomUUID(),
    name: 'Botella PET 500 ml',
    imagePath: null,
    stock: '100.0000',
    unitId: UNIDAD_U.id,
    qtyAlert: '10.0000',
    type: PRODUCT_TYPES.PACKAGING,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    presentationId: PRESENTACION_500.id,
    presentationName: PRESENTACION_500.name,
    presentationContent: PRESENTACION_500.content,
    presentationUnitId: MILILITRO.id,
    ...overrides,
  };
}

function lote(overrides: Partial<ProductBatchView> = {}): ProductBatchView {
  return {
    id: crypto.randomUUID(),
    lot: 'L-001',
    stock: '100.0000',
    unitId: null,
    purchaseDate: '2026-10-01',
    expiryDate: null,
    packageContent: null,
    reserved: '40.0000',
    available: '60.0000',
    ...overrides,
  };
}

function montarAlta() {
  render(
    <Sheet open>
      <ProductForm units={UNIDADES} formUnits={UNIDADES} onSaved={vi.fn()} />
    </Sheet>,
  );
}

function montarEdicion(product: ProductView) {
  render(
    <Sheet open>
      <ProductForm product={product} units={UNIDADES} onSaved={vi.fn()} />
    </Sheet>,
  );
}

async function elegirEnvase(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByLabelText('Tipo'));
  await user.click(await esperarInteractiva(await screen.findByRole('option', { name: 'Envase' })));
}

async function elegirPresentacion(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId('presentation-select'));
  await user.click(
    await esperarInteractiva(await screen.findByRole('option', { name: PRESENTACION_500.name })),
  );
  await waitFor(() => expect(screen.queryByTestId('presentation-popup')).toBeNull());
}

async function rellenarEnvase(
  user: ReturnType<typeof setupUser>,
  { stock, conPresentacion = true }: { readonly stock: string; readonly conPresentacion?: boolean },
) {
  await user.type(screen.getByTestId('product-field-name'), 'Botella PET 500 ml');
  await elegirEnvase(user);
  if (conPresentacion) await elegirPresentacion(user);
  await user.type(screen.getByTestId('product-field-stock'), stock);
  await user.type(screen.getByTestId('product-field-qtyAlert'), '10');
  await user.type(screen.getByLabelText('Costo unitario'), '0.50');
}

beforeEach(() => {
  vi.clearAllMocks();
  listProductsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  });
  listPresentationsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [PRESENTACION_500], page: 1, pageSize: 25, total: 1, totalPages: 1 },
  });
  createProductActionMock.mockResolvedValue({ status: 'success', id: crypto.randomUUID(), lot: '1' });
  adjustBatchStockActionMock.mockResolvedValue({
    status: 'success',
    stock: '90.0000',
    reserved: '0.0000',
    overReserved: false,
  });
});

afterEach(() => {
  cleanup();
});

describe('alta de un envase', () => {
  it('R1: la presentacion del envase se pide como fija del producto', async () => {
    const user = setupUser();
    montarAlta();

    await elegirEnvase(user);

    expect(screen.getByTestId('presentation-select')).toBeInTheDocument();
    expect(screen.getByTestId('product-packaging-presentation-note')).toHaveTextContent(
      'no se puede cambiar',
    );
  });

  it('R1: sin presentacion el alta del envase no llega a la operacion', async () => {
    const user = setupUser();
    montarAlta();

    await rellenarEnvase(user, { stock: '100', conPresentacion: false });
    await user.click(screen.getByRole('button', { name: /Guardar/ }));

    // El campo espejo es obligatorio: el navegador no deja enviar el formulario sin el.
    expect(screen.getByTestId('presentation-value')).toBeInvalid();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(createProductActionMock).not.toHaveBeenCalled();
  });

  it('R6: la existencia del envase se pide en envases', async () => {
    const user = setupUser();
    montarAlta();

    await elegirEnvase(user);

    expect(screen.getByText('Existencia (envases)')).toBeInTheDocument();
    expect(screen.getByTestId('product-field-stock')).toHaveAttribute('inputmode', 'numeric');
  });

  it('R7: una existencia de envases no entera se rechaza junto al campo sin llamar a la operacion', async () => {
    const user = setupUser();
    montarAlta();

    await rellenarEnvase(user, { stock: '10.5' });
    await user.click(screen.getByRole('button', { name: /Guardar/ }));

    expect(await screen.findByTestId('product-error-stock')).toHaveTextContent(
      'número entero de envases',
    );
    expect(createProductActionMock).not.toHaveBeenCalled();
  });

  it('R1, R7: con presentacion y envases enteros el alta viaja con la presentacion y la existencia', async () => {
    const user = setupUser();
    montarAlta();

    await rellenarEnvase(user, { stock: '100' });
    await user.click(screen.getByRole('button', { name: /Guardar/ }));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));
    const enviado = createProductActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get('type')).toBe(PRODUCT_TYPES.PACKAGING);
    expect(enviado.get('presentationId')).toBe(PRESENTACION_500.id);
    expect(enviado.get('stock')).toBe('100');
  });

  it('R7: la existencia decimal sigue valiendo para un producto que no es envase', async () => {
    const user = setupUser();
    montarAlta();

    await user.type(screen.getByTestId('product-field-name'), 'Sosa');
    await user.click(screen.getByTestId('presentation-unit-select'));
    await user.click(await esperarInteractiva(await screen.findByRole('option', { name: 'ml' })));
    await user.type(screen.getByTestId('product-field-stock'), '10.5');
    await user.type(screen.getByTestId('product-field-qtyAlert'), '1');
    await user.type(screen.getByLabelText('Costo unitario'), '2');
    await user.click(screen.getByRole('button', { name: /Guardar/ }));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('product-error-stock')).toBeNull();
  });
});

describe('edicion de un envase', () => {
  it('R1: la presentacion fija se muestra y no se puede cambiar', () => {
    montarEdicion(envase());

    expect(screen.getByTestId('product-packaging-presentation')).toHaveTextContent('500 ml');
    expect(screen.queryByTestId('presentation-select')).toBeNull();
    expect(screen.queryByTestId('product-packaging-legacy')).toBeNull();
  });

  it('R1: el envase legado sin presentacion fija lleva su marca', () => {
    montarEdicion(envase({ presentationId: null, presentationName: null, unitId: MILILITRO.id }));

    expect(screen.getByTestId('product-packaging-legacy')).toHaveTextContent(
      'Envase sin presentación fija',
    );
  });
});

describe('lotes de un envase', () => {
  it('R6: un lote de envase se pinta en u, con la presentacion del producto', () => {
    render(
      <ProductBatchesPanel batches={[lote()]} units={UNIDADES} product={envase()} />,
    );

    const panel = screen.getByTestId('product-batches-panel');
    expect(within(panel).getByTestId('product-batch-quantity')).toHaveTextContent('100 u');
    expect(within(panel).getByTestId('product-batch-reserved')).toHaveTextContent('40 u');
    expect(within(panel).getByTestId('product-batch-available')).toHaveTextContent('60 u');
    expect(screen.getByTestId('product-batches-packaging-presentation')).toHaveTextContent(
      '500 ml',
    );
  });

  it('R6: el lote de un envase legado conserva la unidad de su presentacion y la marca', () => {
    render(
      <ProductBatchesPanel
        batches={[lote({ stock: '2000.0000', unitId: MILILITRO.id, reserved: undefined, available: undefined })]}
        units={UNIDADES}
        product={envase({ presentationId: null, presentationName: null, unitId: MILILITRO.id })}
      />,
    );

    expect(screen.getByTestId('product-batch-quantity')).toHaveTextContent('2000 ml');
    expect(screen.getByTestId('product-batches-packaging-legacy')).toHaveTextContent(
      'Envase sin presentación fija',
    );
  });

  it('R7: el ajuste de un lote de envase no acepta un total contado no entero y no envia nada', async () => {
    const user = setupUser();
    render(<AdjustBatchDialog batch={lote()} canAdjust productType={PRODUCT_TYPES.PACKAGING} wholePackages />);

    await user.click(screen.getByTestId('adjust-batch-open'));
    await user.type(await screen.findByTestId('adjust-batch-counted'), '97.5');
    await user.click(screen.getByTestId('adjust-batch-reason'));
    await user.click(await esperarInteractiva(await screen.findByRole('option', { name: 'Merma' })));
    await user.click(screen.getByRole('button', { name: 'Ajustar' }));

    expect(await screen.findByTestId('adjust-batch-whole-error')).toHaveTextContent(
      'número entero de envases',
    );
    expect(adjustBatchStockActionMock).not.toHaveBeenCalled();
  });

  it('R7: el ajuste de un lote de envase con un total entero se envia', async () => {
    const user = setupUser();
    const batch = lote();
    render(<AdjustBatchDialog batch={batch} canAdjust productType={PRODUCT_TYPES.PACKAGING} wholePackages />);

    await user.click(screen.getByTestId('adjust-batch-open'));
    await user.type(await screen.findByTestId('adjust-batch-counted'), '97');
    await user.click(screen.getByTestId('adjust-batch-reason'));
    await user.click(await esperarInteractiva(await screen.findByRole('option', { name: 'Merma' })));
    await user.click(screen.getByRole('button', { name: 'Ajustar' }));

    await waitFor(() => expect(adjustBatchStockActionMock).toHaveBeenCalledTimes(1));
    const enviado = adjustBatchStockActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get('batchId')).toBe(batch.id);
    expect(enviado.get('countedStock')).toBe('97');
    expect(enviado.get('seenStock')).toBe('100.0000');
    expect(screen.queryByTestId('adjust-batch-whole-error')).toBeNull();
  });

  it('R7: el total contado de un lote de envase usa teclado numerico y no admite signo', async () => {
    const user = setupUser();
    render(<AdjustBatchDialog batch={lote()} canAdjust productType={PRODUCT_TYPES.PACKAGING} wholePackages />);

    await user.click(screen.getByTestId('adjust-batch-open'));
    const total = await screen.findByTestId('adjust-batch-counted');
    expect(total).toHaveAttribute('inputmode', 'numeric');
    await user.type(total, '-3');
    expect(total).toHaveValue('3');
  });

  it('R7: el ajuste de un lote que no es envase sigue con teclado decimal', async () => {
    const user = setupUser();
    render(<AdjustBatchDialog batch={lote()} canAdjust />);

    await user.click(screen.getByTestId('adjust-batch-open'));
    expect(await screen.findByTestId('adjust-batch-counted')).toHaveAttribute('inputmode', 'decimal');
  });
});
