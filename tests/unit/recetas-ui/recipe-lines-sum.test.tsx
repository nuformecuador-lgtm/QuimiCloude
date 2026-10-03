import { cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setupUser } from '../../helpers/user-event';

import {
  RecipeLinesField,
  clampPercentageToRemaining,
  referenceAmountForPercentage,
  sanitizePercentageInput,
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
      tools={[]}
      onToolsChange={() => {}}
      initialMachinePage={INITIAL_PRODUCT_PAGE}
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

  it('escribir 101 en una sola línea recorta a 100 y la suma queda completa', async () => {
    const user = setupUser();
    render(<Harness initialLines={[lineValue('a', ''), lineValue('b', '')]} />);

    await user.type(screen.getByTestId('recipe-line-percentage-0'), '101');

    expect(screen.getByTestId('recipe-line-percentage-0')).toHaveValue('100');
    const sum = screen.getByTestId(SUM_TEST_ID);
    expect(sum).toHaveTextContent('Suma: 100,00 %');
    expect(sum).toHaveAttribute('data-complete', 'true');
  });

  it('con 50 ya asignados, escribir 80 en la siguiente anota 50 y nunca pasa de 100', async () => {
    const user = setupUser();
    render(<Harness initialLines={[lineValue('a', ''), lineValue('b', '')]} />);

    await user.type(screen.getByTestId('recipe-line-percentage-0'), '50');
    await user.type(screen.getByTestId('recipe-line-percentage-1'), '80');

    expect(screen.getByTestId('recipe-line-percentage-1')).toHaveValue('50');
    const sum = screen.getByTestId(SUM_TEST_ID);
    expect(sum).toHaveTextContent('Suma: 100,00 %');
    expect(sum).toHaveAttribute('data-complete', 'true');
    expect(sum).not.toHaveTextContent('sobran');
  });

  it('el input solo acepta números: las letras no entran', async () => {
    const user = setupUser();
    render(<Harness initialLines={[lineValue('a', ''), lineValue('b', '')]} />);

    await user.type(screen.getByTestId('recipe-line-percentage-0'), 'ab2c0');

    expect(screen.getByTestId('recipe-line-percentage-0')).toHaveValue('20');
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

describe('saneado y tope del porcentaje (solo números, máx 100)', () => {
  it('sanitizePercentageInput deja dígitos y un separador con 2 decimales', () => {
    expect(sanitizePercentageInput('ab2c0')).toBe('20');
    expect(sanitizePercentageInput('7,567')).toBe('7,56');
    expect(sanitizePercentageInput('7.5')).toBe('7,5');
    expect(sanitizePercentageInput('1234')).toBe('123');
    expect(sanitizePercentageInput('')).toBe('');
    expect(sanitizePercentageInput('5,')).toBe('5,');
  });

  it('clampPercentageToRemaining recorta al restante: 80 con 50 libres anota 50', () => {
    expect(clampPercentageToRemaining('80', BigInt(5000))).toBe('50');
    expect(clampPercentageToRemaining('100', BigInt(10000))).toBe('100');
    expect(clampPercentageToRemaining('101', BigInt(10000))).toBe('100');
    expect(clampPercentageToRemaining('20', BigInt(5000))).toBe('20');
    expect(clampPercentageToRemaining('', BigInt(5000))).toBe('');
    expect(clampPercentageToRemaining('5,', BigInt(5000))).toBe('5,');
  });
});

describe('cantidad de referencia sobre base 1000 g (readonly)', () => {
  it('20 % muestra 200 y el campo es readonly', () => {
    render(<Harness initialLines={[lineValue('a', '20')]} />);

    const amount = screen.getByTestId('recipe-line-amount-0');
    expect(amount).toHaveValue('200');
    expect(amount).toHaveAttribute('readonly');
  });

  it('7,5 % muestra 75 y sin porcentaje el readonly queda vacío', () => {
    render(<Harness initialLines={[lineValue('a', '7,5'), lineValue('b', '')]} />);

    expect(screen.getByTestId('recipe-line-amount-0')).toHaveValue('75');
    expect(screen.getByTestId('recipe-line-amount-1')).toHaveValue('');
  });

  it('referenceAmountForPercentage: 20 → 200 y lo inválido → vacío', () => {
    expect(referenceAmountForPercentage('20')).toBe('200');
    expect(referenceAmountForPercentage('7,5')).toBe('75');
    expect(referenceAmountForPercentage('')).toBe('');
  });
});
