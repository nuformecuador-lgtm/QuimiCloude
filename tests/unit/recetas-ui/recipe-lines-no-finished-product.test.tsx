import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setupUser } from '../../helpers/user-event';

import { RecipeLinesField } from '@/app/(private)/produccion/formulas/components';

/**
 * El selector de insumos del formulario de receta no debe ofrecer productos terminados,
 * ni en la pestaña de ingredientes ni en la de máquinas.
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

function renderField() {
  return render(
    <RecipeLinesField
      lines={[]}
      onChange={() => {}}
      units={[]}
      initialProductPage={EMPTY_PAGE}
      initialMachinePage={EMPTY_PAGE}
    />,
  );
}

describe('R30: el selector de insumos nunca pide productos terminados', () => {
  it('busca ingredientes con el filtro PRODUCT, nunca FINISHED_PRODUCT', async () => {
    const user = setupUser();
    listProductsActionMock.mockResolvedValue({
      status: 'success',
      data: { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 },
    });
    renderField();

    await user.click(screen.getByTestId('recipe-line-product-0'));
    await user.type(screen.getByTestId('recipe-line-product-0'), 'desengrasante');

    await waitFor(() => expect(listProductsActionMock).toHaveBeenCalled());
    for (const call of listProductsActionMock.mock.calls) {
      expect(call[0].filters?.type?.values).toEqual(['PRODUCT']);
    }
  });

  it('busca herramientas con el filtro MACHINE, nunca FINISHED_PRODUCT', async () => {
    const user = setupUser();
    listProductsActionMock.mockResolvedValue({
      status: 'success',
      data: { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 },
    });
    renderField();

    await user.click(screen.getByTestId('recipe-lines-tab-machines'));
    await user.click(screen.getByTestId('recipe-machine-product-0'));
    await user.type(screen.getByTestId('recipe-machine-product-0'), 'agitador');

    await waitFor(() => expect(listProductsActionMock).toHaveBeenCalled());
    for (const call of listProductsActionMock.mock.calls) {
      expect(call[0].filters?.type?.values).toEqual(['MACHINE']);
    }
  });

  it('un producto terminado precargado en la página inicial no aparece en ninguna pestaña', async () => {
    const user = setupUser();
    render(
      <RecipeLinesField
        lines={[]}
        onChange={() => {}}
        units={[]}
        initialProductPage={{
          items: [{ id: 'finished-1', name: 'Desengrasante industrial · Botella 1L', unitId: null }],
          totalPages: 1,
        }}
        initialMachinePage={{
          items: [{ id: 'finished-1', name: 'Desengrasante industrial · Botella 1L', unitId: null }],
          totalPages: 1,
        }}
      />,
    );

    // La página inicial ya viene filtrada por tipo desde el servidor: si un producto
    // terminado se colara ahí, esto lo detecta igual, con las dos pestañas abiertas.
    await user.click(screen.getByTestId('recipe-line-product-0'));
    expect(
      screen.queryByRole('option', { name: 'Desengrasante industrial · Botella 1L' }),
    ).toBeNull();

    await user.click(screen.getByTestId('recipe-lines-tab-machines'));
    await user.click(screen.getByTestId('recipe-machine-product-0'));
    expect(
      screen.queryByRole('option', { name: 'Desengrasante industrial · Botella 1L' }),
    ).toBeNull();
  });
});
