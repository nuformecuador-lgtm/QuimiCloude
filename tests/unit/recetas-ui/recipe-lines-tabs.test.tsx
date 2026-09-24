import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setupUser } from '../../helpers/user-event';

import {
  RecipeLinesField,
  type RecipeLineFormValue,
} from '@/app/(private)/produccion/formulas/components';

/**
 * Tabs de líneas de la receta: ingredientes (PRODUCT, con % y cantidad) y máquinas
 * (MACHINE, solo selección, UI-only: no entra a la suma ni al payload).
 *
 * Se monta `RecipeLinesField` directamente porque los tabs son SUYOS: el formulario solo le
 * pasa las dos primeras páginas ya filtradas por tipo. `listProductsAction` está mockeada
 * porque `ProductPicker` la importa; los casos de filtro SÍ la invocan (búsqueda con término).
 */

const { listProductsActionMock } = vi.hoisted(() => ({ listProductsActionMock: vi.fn() }));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PRODUCT_PAGE = {
  items: [{ id: 'product-1', name: 'Ácido cítrico', unitId: null }],
  totalPages: 1,
};
const MACHINE_PAGE = {
  items: [{ id: 'machine-1', name: 'Agitador industrial', unitId: null }],
  totalPages: 1,
};

function lineValue(key: string, percentage: string): RecipeLineFormValue {
  return { key, productId: `product-${key}`, productName: `Producto ${key}`, percentage, productUnitId: null };
}

function Harness({ initialLines = [] as readonly RecipeLineFormValue[] }) {
  const [lines, setLines] = useState(initialLines);
  return (
    <RecipeLinesField
      lines={lines}
      onChange={setLines}
      units={[]}
      initialProductPage={PRODUCT_PAGE}
      initialMachinePage={MACHINE_PAGE}
    />
  );
}

describe('tabs de líneas: ingredientes y máquinas', () => {
  it('pinta los dos tabs e ingredientes queda activo por defecto', () => {
    render(<Harness />);

    expect(screen.getByTestId('recipe-lines-tab-ingredients')).toBeInTheDocument();
    expect(screen.getByTestId('recipe-lines-tab-machines')).toBeInTheDocument();
    // El tab de ingredientes es el activo: su fila fantasma sigue en pantalla.
    expect(screen.getByTestId('recipe-line-product-0')).toBeInTheDocument();
  });

  it('al 100 % se puede pedir otra línea sin porcentaje: los `+` siguen habilitados', async () => {
    const user = setupUser();
    render(<Harness initialLines={[lineValue('a', '60'), lineValue('b', '40')]} />);

    expect(screen.getByTestId('recipe-lines-sum')).toHaveAttribute('data-complete', 'true');
    expect(screen.getByTestId('recipe-line-add-0')).toBeEnabled();

    await user.click(screen.getByTestId('recipe-line-add-0'));

    // La fila nueva nace vacía y no suma: el 100 % se conserva hasta que se reparta.
    expect(screen.getAllByTestId('recipe-line-row')).toHaveLength(3);
    expect(screen.getByTestId('recipe-lines-sum')).toHaveAttribute('data-complete', 'true');
  });

  it('al quitar una línea del 100 %, el `+` restante sigue habilitado', async () => {
    const user = setupUser();
    render(<Harness initialLines={[lineValue('a', '60'), lineValue('b', '40')]} />);

    expect(screen.getByTestId('recipe-line-add-0')).toBeEnabled();

    await user.click(screen.getByTestId('recipe-line-remove-1'));

    expect(screen.getByTestId('recipe-lines-sum')).toHaveAttribute('data-complete', 'false');
    expect(screen.getByTestId('recipe-line-add-0')).toBeEnabled();
  });

  it('el tab de máquinas no lleva % ni cantidad: solo selección', async () => {
    const user = setupUser();
    render(<Harness />);

    await user.click(screen.getByTestId('recipe-lines-tab-machines'));

    expect(screen.getByTestId('recipe-machine-product-0')).toBeInTheDocument();
    expect(screen.queryByTestId('recipe-machine-percentage-0')).toBeNull();
    expect(screen.queryByTestId('recipe-machine-amount-0')).toBeNull();
    // El fantasma de herramientas pide herramienta, no ingrediente.
    expect(screen.getByTestId('recipe-machine-product-0')).toHaveAttribute(
      'placeholder',
      'Buscar herramienta',
    );
  });

  it('las máquinas se agregan múltiples: elegir habilita el `+` y añade otra fila', async () => {
    const user = setupUser();
    render(<Harness />);

    await user.click(screen.getByTestId('recipe-lines-tab-machines'));
    expect(screen.getByTestId('recipe-machine-add-0')).toBeDisabled();

    await user.click(screen.getByTestId('recipe-machine-product-0'));
    await user.click(await screen.findByRole('option', { name: 'Agitador industrial' }));

    expect(screen.getByTestId('recipe-machine-add-0')).toBeEnabled();

    await user.click(screen.getByTestId('recipe-machine-add-0'));
    expect(screen.getAllByTestId('recipe-machine-row')).toHaveLength(2);
  });

  it('lo elegido en máquinas no toca la suma de ingredientes', async () => {
    const user = setupUser();
    render(<Harness initialLines={[lineValue('a', '60')]} />);

    await user.click(screen.getByTestId('recipe-lines-tab-machines'));
    await user.click(screen.getByTestId('recipe-machine-product-0'));
    await user.click(await screen.findByRole('option', { name: 'Agitador industrial' }));

    // El panel inactivo se desmonta: se vuelve al tab para leer la suma.
    await user.click(screen.getByTestId('recipe-lines-tab-ingredients'));
    expect(screen.getByTestId('recipe-lines-sum')).toHaveTextContent(
      'Suma: 60,00 % — faltan 40,00 %',
    );
  });
});

describe('el select filtra por tipo en el servidor', () => {
  it('buscar en ingredientes pide type=PRODUCT', async () => {
    const user = setupUser();
    listProductsActionMock.mockResolvedValue({
      status: 'success',
      data: { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 },
    });
    render(<Harness />);

    await user.click(screen.getByTestId('recipe-line-product-0'));
    await user.type(screen.getByTestId('recipe-line-product-0'), 'acido');

    await waitFor(() =>
      expect(listProductsActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'acido',
          filters: { type: { kind: 'select', values: ['PRODUCT'] } },
        }),
      ),
    );
  });

  it('buscar en máquinas pide type=MACHINE', async () => {
    const user = setupUser();
    listProductsActionMock.mockResolvedValue({
      status: 'success',
      data: { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 },
    });
    render(<Harness />);

    await user.click(screen.getByTestId('recipe-lines-tab-machines'));
    await user.click(screen.getByTestId('recipe-machine-product-0'));
    await user.type(screen.getByTestId('recipe-machine-product-0'), 'agitador');

    await waitFor(() =>
      expect(listProductsActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'agitador',
          filters: { type: { kind: 'select', values: ['MACHINE'] } },
        }),
      ),
    );
  });
});
