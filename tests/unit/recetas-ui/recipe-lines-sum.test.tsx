import { cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setupUser } from '../../helpers/user-event';

import {
  RecipeLinesField,
  type RecipeLineFormValue,
} from '@/app/(private)/produccion/formulas/components';

/**
 * El indicador de suma del bloque de líneas.
 *
 * Se monta `RecipeLinesField` directamente -sin `RecipeForm`- porque el indicador es SUYO: se
 * calcula sobre `lines`, no sobre el estado del formulario entero. `listProductsAction` está
 * mockeada porque `ProductPicker` la importa; ningún caso de este archivo abre el selector de
 * ingrediente.
 */

const { listProductsActionMock } = vi.hoisted(() => ({ listProductsActionMock: vi.fn() }));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SUM_TEST_ID = 'recipe-lines-sum';
const INITIAL_PRODUCT_PAGE = { items: [], totalPages: 1 };

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
      initialProductPage={INITIAL_PRODUCT_PAGE}
    />
  );
}

describe('el indicador de suma (R10, R25)', () => {
  it('R11, R23 — sin ninguna línea dice "Suma: 0,00 % — faltan 100,00 %" y data-complete es false', () => {
    render(<Harness />);

    const sum = screen.getByTestId(SUM_TEST_ID);
    expect(sum).toHaveAttribute('role', 'status');
    expect(sum).toHaveAttribute('aria-live', 'polite');
    expect(sum).toHaveAttribute('data-complete', 'false');
    expect(sum).toHaveTextContent('Suma: 0,00 % — faltan 100,00 %');
  });

  it('R10 — 90 + 7,5 da "Suma: 97,50 % — faltan 2,50 %" y se recalcula con cada pulsación', async () => {
    const user = setupUser();
    render(<Harness initialLines={[lineValue('a', ''), lineValue('b', '')]} />);

    await user.type(screen.getByTestId('recipe-line-percentage-0'), '90');
    expect(screen.getByTestId(SUM_TEST_ID)).toHaveTextContent('Suma: 90,00 % — faltan 10,00 %');

    await user.type(screen.getByTestId('recipe-line-percentage-1'), '7,5');
    const sum = screen.getByTestId(SUM_TEST_ID);
    expect(sum).toHaveTextContent('Suma: 97,50 % — faltan 2,50 %');
    expect(sum).toHaveAttribute('data-complete', 'false');
    expect(listProductsActionMock).not.toHaveBeenCalled();
  });

  it('101 % dice "Suma: 101,00 % — sobran 1,00 %"', () => {
    render(<Harness initialLines={[lineValue('a', '60'), lineValue('b', '41')]} />);

    expect(screen.getByTestId(SUM_TEST_ID)).toHaveTextContent('Suma: 101,00 % — sobran 1,00 %');
  });

  it('100 % exacto dice "Suma: 100,00 %" y data-complete es true', () => {
    render(<Harness initialLines={[lineValue('a', '92.5'), lineValue('b', '7.5')]} />);

    const sum = screen.getByTestId(SUM_TEST_ID);
    expect(sum).toHaveTextContent('Suma: 100,00 %');
    expect(sum).not.toHaveTextContent('faltan');
    expect(sum).not.toHaveTextContent('sobran');
    expect(sum).toHaveAttribute('data-complete', 'true');
  });
});
