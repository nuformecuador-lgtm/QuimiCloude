import { cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setupUser } from '../../helpers/user-event';

import {
  RecipeLinesField,
  sanitizeToolQuantityInput,
  type RecipeLineFormValue,
  type RecipeToolErrors,
  type RecipeToolFormValue,
} from '@/app/(private)/produccion/formulas/components';

/**
 * El tab «Herramientas» es controlado: el estado vive en quien lo monta. El harness guarda las
 * herramientas para poder afirmar sobre lo que el tab emite y sobre lo que pinta después.
 */

const { listProductsActionMock } = vi.hoisted(() => ({ listProductsActionMock: vi.fn() }));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const EMPTY_PAGE = { items: [], totalPages: 1 };
const MACHINE_PAGE = {
  items: [
    { id: 'machine-1', name: 'Agitador', unitId: null },
    { id: 'machine-2', name: 'Balanza', unitId: null },
  ],
  totalPages: 1,
};

function tool(overrides: Partial<RecipeToolFormValue>): RecipeToolFormValue {
  return { key: 'k', productId: 'machine-1', productName: 'Agitador', quantity: '1', ...overrides };
}

function line(key: string, percentage: string): RecipeLineFormValue {
  return { key, productId: `p-${key}`, productName: `Producto ${key}`, percentage, productUnitId: null };
}

let lastTools: readonly RecipeToolFormValue[] = [];

function Harness({
  initialTools = [],
  initialLines = [],
  toolErrors,
  toolsGeneralError,
}: {
  readonly initialTools?: readonly RecipeToolFormValue[];
  readonly initialLines?: readonly RecipeLineFormValue[];
  readonly toolErrors?: RecipeToolErrors;
  readonly toolsGeneralError?: string;
}) {
  const [lines, setLines] = useState(initialLines);
  const [tools, setTools] = useState(initialTools);
  return (
    <RecipeLinesField
      lines={lines}
      onChange={setLines}
      tools={tools}
      onToolsChange={(next) => {
        lastTools = next;
        setTools(next);
      }}
      units={[]}
      initialProductPage={EMPTY_PAGE}
      initialMachinePage={MACHINE_PAGE}
      toolErrors={toolErrors}
      toolsGeneralError={toolsGeneralError}
    />
  );
}

async function openToolsTab(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId('recipe-lines-tab-machines'));
}

describe('tab Herramientas — lo que pinta', () => {
  it('R22 — pinta nombre y cantidad de cada herramienta guardada', async () => {
    const user = setupUser();
    render(
      <Harness
        initialTools={[
          tool({ key: 'a', quantity: '2' }),
          tool({ key: 'b', productId: 'machine-2', productName: 'Balanza', quantity: '5' }),
        ]}
      />,
    );
    await openToolsTab(user);

    expect(screen.getByTestId('recipe-machine-product-0')).toHaveAttribute('placeholder', 'Agitador');
    expect(screen.getByTestId('recipe-machine-quantity-0')).toHaveValue('2');
    expect(screen.getByTestId('recipe-machine-product-1')).toHaveAttribute('placeholder', 'Balanza');
    expect(screen.getByTestId('recipe-machine-quantity-1')).toHaveValue('5');
  });

  it('R20 — la de baja se pinta como no disponible, con su cantidad y el aviso del tab', async () => {
    const user = setupUser();
    render(<Harness initialTools={[tool({ productId: 'gone', productName: null, quantity: '3' })]} />);
    await openToolsTab(user);

    expect(screen.getByTestId('recipe-machine-unavailable-0')).toBeInTheDocument();
    expect(screen.getByTestId('recipe-machine-product-0')).toHaveAttribute(
      'placeholder',
      'Herramienta no disponible',
    );
    expect(screen.getByTestId('recipe-machine-quantity-0')).toHaveValue('3');
    expect(screen.getByTestId('recipe-machines-unavailable-notice')).toHaveAttribute('data-count', '1');
  });
});

describe('tab Herramientas — elegir y escribir', () => {
  it('R24 — elegir una herramienta pone la cantidad en 1, editable', async () => {
    const user = setupUser();
    render(<Harness />);
    await openToolsTab(user);

    await user.click(screen.getByTestId('recipe-machine-product-0'));
    await user.click(await screen.findByRole('option', { name: 'Agitador' }));

    expect(screen.getByTestId('recipe-machine-quantity-0')).toHaveValue('1');
    expect(lastTools).toEqual([
      expect.objectContaining({ productId: 'machine-1', productName: 'Agitador', quantity: '1' }),
    ]);

    await user.clear(screen.getByTestId('recipe-machine-quantity-0'));
    await user.type(screen.getByTestId('recipe-machine-quantity-0'), '4');
    expect(screen.getByTestId('recipe-machine-quantity-0')).toHaveValue('4');
  });

  it('R24 — cambiar de herramienta no pisa la cantidad ya escrita', async () => {
    const user = setupUser();
    render(<Harness initialTools={[tool({ quantity: '7' })]} />);
    await openToolsTab(user);

    await user.click(screen.getByTestId('recipe-machine-product-0'));
    await user.click(await screen.findByRole('option', { name: 'Balanza' }));

    expect(screen.getByTestId('recipe-machine-quantity-0')).toHaveValue('7');
  });

  it('R24 — el selector no ofrece la herramienta ya elegida en otra fila', async () => {
    const user = setupUser();
    render(
      <Harness
        initialTools={[tool({ key: 'a' }), tool({ key: 'b', productId: '', productName: '', quantity: '' })]}
      />,
    );
    await openToolsTab(user);

    await user.click(screen.getByTestId('recipe-machine-product-1'));
    expect(await screen.findByRole('option', { name: 'Balanza' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Agitador' })).toBeNull();
  });

  it('R25 — la cantidad solo admite dígitos', async () => {
    const user = setupUser();
    render(<Harness initialTools={[tool({ quantity: '' })]} />);
    await openToolsTab(user);

    await user.type(screen.getByTestId('recipe-machine-quantity-0'), '1,5a-2');
    expect(screen.getByTestId('recipe-machine-quantity-0')).toHaveValue('152');
    expect(sanitizeToolQuantityInput('12345678901234')).toBe('1234567890');
  });

  it('quitar una herramienta la saca del estado', async () => {
    const user = setupUser();
    render(
      <Harness
        initialTools={[tool({ key: 'a' }), tool({ key: 'b', productId: 'machine-2', productName: 'Balanza' })]}
      />,
    );
    await openToolsTab(user);

    await user.click(screen.getByTestId('recipe-machine-remove-0'));
    expect(lastTools.map((t) => t.productId)).toEqual(['machine-2']);
  });
});

describe('tab Herramientas — independencia de la suma', () => {
  it('R26 — añadir, cambiar y quitar herramientas no cambia la suma ni lo que falta', async () => {
    const user = setupUser();
    render(<Harness initialLines={[line('a', '60')]} />);
    const expected = 'Suma: 60,00 % — faltan 40,00 %';
    expect(screen.getByTestId('recipe-lines-sum')).toHaveTextContent(expected);

    await openToolsTab(user);
    await user.click(screen.getByTestId('recipe-machine-product-0'));
    await user.click(await screen.findByRole('option', { name: 'Agitador' }));
    await user.type(screen.getByTestId('recipe-machine-quantity-0'), '9');
    await user.click(screen.getByTestId('recipe-machine-add-0'));
    await user.click(screen.getByTestId('recipe-machine-remove-1'));

    await user.click(screen.getByTestId('recipe-lines-tab-ingredients'));
    expect(screen.getByTestId('recipe-lines-sum')).toHaveTextContent(expected);
  });
});

describe('tab Herramientas — errores', () => {
  it('R25 — el error de cantidad se pinta en su fila y abre el tab de herramientas', () => {
    render(
      <Harness
        initialTools={[tool({ key: 'a' }), tool({ key: 'b', productId: 'machine-2', quantity: '0' })]}
        toolErrors={{ 1: { quantity: 'Cantidad no válida.' } }}
      />,
    );

    expect(screen.getByTestId('recipe-machine-quantity-error-1')).toHaveTextContent('Cantidad no válida.');
    expect(screen.getByTestId('recipe-machine-quantity-1')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByTestId('recipe-machine-quantity-error-0')).toBeNull();
  });

  it('R25 — el error de producto se pinta en el selector de su fila', () => {
    render(
      <Harness
        initialTools={[tool({ productId: '', productName: '', quantity: '1' })]}
        toolErrors={{ 0: { productId: 'Elige una herramienta.' } }}
      />,
    );

    expect(screen.getByTestId('recipe-machine-product-0-field-error')).toHaveTextContent(
      'Elige una herramienta.',
    );
  });

  it('el error del conjunto (repetida) va arriba del tab, no en una fila', () => {
    render(<Harness initialTools={[tool({})]} toolsGeneralError="Repetida." />);

    expect(screen.getByTestId('recipe-machines-error')).toHaveTextContent('Repetida.');
    expect(screen.queryByTestId('recipe-machine-quantity-error-0')).toBeNull();
  });
});

describe('tab Herramientas — multiplataforma', () => {
  it('R33 — controles de al menos 44×44 px y campo de cantidad a 16 px', async () => {
    const user = setupUser();
    render(<Harness initialTools={[tool({})]} />);
    await openToolsTab(user);

    const quantity = screen.getByTestId('recipe-machine-quantity-0');
    expect(quantity).toHaveClass('min-h-11', 'text-base');
    expect(quantity).toHaveAttribute('inputMode', 'numeric');
    for (const testId of ['recipe-machine-remove-0', 'recipe-machine-add-0']) {
      expect(screen.getByTestId(testId)).toHaveClass('min-h-11', 'min-w-11');
    }
  });
});
