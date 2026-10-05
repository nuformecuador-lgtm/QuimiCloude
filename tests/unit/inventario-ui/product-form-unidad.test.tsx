// El alta de un insumo pide la unidad, no la presentacion. Las Server Actions son dobles.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductForm } from '@/app/(private)/inventario/components';
import {
  PRESENTATION_UNIT_ERROR_TESTID,
  PRESENTATION_UNIT_OPTION_TESTID,
  PRESENTATION_UNIT_SELECT_TESTID,
} from '@/components/shared/presentation-unit-select';
import { Sheet } from '@/components/ui/sheet';
import { PRODUCT_TYPES, type ProductFormUnits, type ProductView } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

const {
  createProductActionMock,
  updateProductActionMock,
  listProductsActionMock,
  listProductFormUnitsActionMock,
  listPresentationsActionMock,
} = vi.hoisted(() => ({
  createProductActionMock: vi.fn<(prev: unknown, data: FormData) => Promise<unknown>>(),
  updateProductActionMock: vi.fn<(id: string, prev: unknown, data: FormData) => Promise<unknown>>(),
  listProductsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  listProductFormUnitsActionMock: vi.fn<() => Promise<unknown>>(),
  listPresentationsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  createProductAction: createProductActionMock,
  updateProductAction: updateProductActionMock,
  listProductsAction: listProductsActionMock,
  listProductFormUnitsAction: listProductFormUnitsActionMock,
  deleteProductAction: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: vi.fn(),
}));

function unidad(name: string, symbol: string | null): UnitRef {
  return { id: crypto.randomUUID(), name, symbol, baseUnitId: null, factor: null };
}

const KILOGRAMO = unidad('Kilogramo', 'kg');
const LITRO = unidad('Litro', 'L');
const UNIDAD_U = unidad('unidad', 'u');
const PIEZA_SIN_SIMBOLO = unidad('Pieza', null);
const UNIDADES_DEL_FORMULARIO: ProductFormUnits = [KILOGRAMO, LITRO, UNIDAD_U, PIEZA_SIN_SIMBOLO];

function insumoExistente(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: crypto.randomUUID(),
    name: 'Ácido cítrico',
    imagePath: null,
    stock: '10.0000',
    unitId: KILOGRAMO.id,
    qtyAlert: '3.0000',
    type: PRODUCT_TYPES.PRODUCT,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}

function montarAlta() {
  render(
    <Sheet open>
      <ProductForm units={UNIDADES_DEL_FORMULARIO} formUnits={UNIDADES_DEL_FORMULARIO} onSaved={vi.fn()} />
    </Sheet>,
  );
}

async function elegirTipo(user: ReturnType<typeof setupUser>, nombre: string) {
  await user.click(screen.getByLabelText('Tipo'));
  await user.click(await esperarInteractiva(await screen.findByRole('option', { name: nombre })));
}

async function elegirUnidad(user: ReturnType<typeof setupUser>, etiqueta: string) {
  await user.click(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID));
  await user.click(await esperarInteractiva(await screen.findByRole('option', { name: etiqueta })));
  await waitFor(() =>
    expect(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID)).not.toHaveAttribute('aria-expanded', 'true'),
  );
}

async function rellenarLote(user: ReturnType<typeof setupUser>) {
  await user.type(screen.getByTestId('product-field-stock'), '12');
  await user.type(screen.getByTestId('product-field-qtyAlert'), '1');
  await user.type(screen.getByLabelText('Costo unitario'), '2.50');
}

beforeEach(() => {
  vi.clearAllMocks();
  listProductsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  });
  listPresentationsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  });
  listProductFormUnitsActionMock.mockResolvedValue({ status: 'success', data: UNIDADES_DEL_FORMULARIO });
  createProductActionMock.mockResolvedValue({ status: 'success', id: crypto.randomUUID(), lot: '1' });
});

afterEach(() => {
  cleanup();
});

describe('alta de insumo por unidad', () => {
  it('R1 el alta de insumo muestra Unidad y no Presentacion', () => {
    montarAlta();

    const selector = screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID);
    expect(selector).toHaveAccessibleName('Unidad');
    expect(screen.queryByTestId('presentation-select')).toBeNull();
    expect(screen.queryByTestId('presentation-value')).toBeNull();
  });

  it('R2 el selector ofrece todas las unidades recibidas incluida unidad (u) y no ofrece sin unidad', async () => {
    const user = setupUser();
    montarAlta();

    const selector = screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID);
    expect(selector.tagName).not.toBe('INPUT');
    await user.click(selector);

    const opciones = await screen.findAllByTestId(PRESENTATION_UNIT_OPTION_TESTID);
    expect(opciones.map((opcion) => opcion.getAttribute('data-value'))).toEqual(
      UNIDADES_DEL_FORMULARIO.map((u) => u.id),
    );
    expect(opciones.map((opcion) => opcion.textContent?.trim())).toEqual(['kg', 'L', 'u', 'Pieza']);
    for (const opcion of opciones) {
      expect(opcion.getAttribute('data-value')).not.toBe('');
    }
  });

  it('R3 envase muestra Presentacion y no Unidad; instrumento ninguna de las dos', async () => {
    const user = setupUser();
    montarAlta();

    await elegirTipo(user, 'Envase');
    expect(screen.getByTestId('presentation-select')).toBeInTheDocument();
    expect(screen.queryByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toBeNull();

    await elegirTipo(user, 'Instrumento');
    expect(screen.queryByTestId('presentation-select')).toBeNull();
    expect(screen.queryByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toBeNull();
  });

  it('R4 sin unidad muestra Elige una unidad., no llama a la accion y conserva lo escrito', async () => {
    const user = setupUser();
    montarAlta();

    await user.type(screen.getByTestId('product-field-name'), 'Sosa');
    await rellenarLote(user);
    await user.click(screen.getByTestId('product-form-submit'));

    expect(await screen.findByTestId(PRESENTATION_UNIT_ERROR_TESTID)).toHaveTextContent(
      'Elige una unidad.',
    );
    expect(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toHaveAttribute('aria-invalid', 'true');
    expect(createProductActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('product-field-name')).toHaveValue('Sosa');
    expect(screen.getByTestId('product-field-stock')).toHaveValue('12');
    expect(screen.getByTestId('product-field-qtyAlert')).toHaveValue('1');
    expect(screen.getByLabelText('Costo unitario')).toHaveValue('2.50');
  });

  it('R5 elegir un insumo existente preselecciona su unidad y se puede cambiar', async () => {
    const user = setupUser();
    const existente = insumoExistente();
    listProductsActionMock.mockResolvedValue({
      status: 'success',
      data: { items: [existente], page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
    montarAlta();

    await user.click(screen.getByTestId('product-field-name'));
    await user.click(
      await esperarInteractiva(await screen.findByRole('option', { name: existente.name })),
    );

    await waitFor(() =>
      expect(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toHaveTextContent('kg'),
    );

    await elegirUnidad(user, 'L');
    expect(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toHaveTextContent('L');

    await rellenarLote(user);
    await user.click(screen.getByTestId('product-form-submit'));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));
    const enviado = createProductActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get('type')).toBe(PRODUCT_TYPES.PRODUCT);
    expect(enviado.get('unitId')).toBe(LITRO.id);
    expect(enviado.get('presentationId')).toBeNull();
  });
});
