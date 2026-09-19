import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductTable } from '@/app/(private)/inventario/components';
import type { DataTableParams } from '@/components/shared/data-table';
import type { ProductBatchView, ProductView } from '@/lib/modules/inventario';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

/**
 * Enganche del panel de lotes al listado (R22, `specs/QC-92-ajuste-de-inventario/tasks.md > T13`).
 *
 * `ProductTable` se monta sola, con una fila, sin `ProductListSection` ni `lib/composition`: lo
 * que se afirma aqui es que la fila abre el panel del producto correcto y que este pide sus lotes
 * a `listProductBatchesAction`. Las tres Server Actions del modulo estan mockeadas, mismo criterio
 * que `batch-history.test.tsx` y `adjust-batch-dialog.test.tsx`.
 */

const {
  routerMock,
  listProductBatchesActionMock,
  listBatchMovementsActionMock,
  adjustBatchStockActionMock,
} = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  },
  listProductBatchesActionMock: vi.fn(),
  listBatchMovementsActionMock: vi.fn(),
  adjustBatchStockActionMock: vi.fn(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/batch-actions', () => ({
  listProductBatchesAction: listProductBatchesActionMock,
  listBatchMovementsAction: listBatchMovementsActionMock,
  adjustBatchStockAction: adjustBatchStockActionMock,
}));

const PARAMS: DataTableParams = {
  page: 1,
  pageSize: 20,
  sort: null,
  filters: {},
  search: '',
};

function producto(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: 'product-9',
    name: 'Acido citrico',
    imagePath: null,
    stockByUnit: [],
    stock: 0,
    unitId: null,
    qtyAlert: null,
    latestBatchUnitId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function lote(overrides: Partial<ProductBatchView> = {}): ProductBatchView {
  return {
    id: 'batch-1',
    lot: 'L-001',
    stock: 12,
    unitId: 'unit-kg',
    purchaseDate: '2026-03-05',
    expiryDate: null,
    ...overrides,
  };
}

async function abrirPanel() {
  const user = setupUser();
  await user.click(await esperarInteractiva(screen.getByTestId('product-batches-open')));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  listProductBatchesActionMock.mockResolvedValue({ status: 'success', data: [] });
});

afterEach(() => {
  cleanup();
});

describe('la fila abre el panel de lotes DEL producto (R22)', () => {
  it('pide los lotes de ese producto y pinta lote, cantidad con unidad y fecha', async () => {
    const batches = [lote({ id: 'b1', lot: 'L-001', stock: 12, purchaseDate: '2026-03-05' })];
    listProductBatchesActionMock.mockResolvedValue({ status: 'success', data: batches });

    render(
      <ProductTable
        products={[producto({ id: 'product-9' })]}
        params={PARAMS}
        totalPages={1}
      />,
    );

    await abrirPanel();

    await waitFor(() => expect(listProductBatchesActionMock).toHaveBeenCalledWith('product-9'));

    expect(await screen.findByTestId('product-batch-lot')).toHaveTextContent('L-001');
    expect(screen.getByTestId('product-batch-quantity')).toHaveTextContent('12');
    expect(screen.getByTestId('product-batch-purchase-date')).toHaveTextContent('2026-03-05');
  });
});

describe('el estado de error se distingue del panel con datos (R22)', () => {
  it('pinta el mensaje con role="alert" y no el panel de lotes', async () => {
    listProductBatchesActionMock.mockResolvedValue({
      status: 'error',
      code: 'unexpected_error',
      message: 'No se pudieron cargar los lotes.',
      reference: 'req-1',
    });

    render(
      <ProductTable
        products={[producto({ id: 'product-9' })]}
        params={PARAMS}
        totalPages={1}
      />,
    );

    await abrirPanel();

    const aviso = await screen.findByTestId('product-batches-error');
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(aviso).toHaveTextContent('No se pudieron cargar los lotes.');
    expect(screen.queryByTestId('product-batches-panel')).toBeNull();
  });
});

describe('canAdjust decide si el control de ajuste existe en el DOM (R22, R21)', () => {
  it('sin canAdjust el panel se ve pero el control de ajuste NO existe', async () => {
    listProductBatchesActionMock.mockResolvedValue({ status: 'success', data: [lote()] });

    render(
      <ProductTable
        products={[producto({ id: 'product-9' })]}
        params={PARAMS}
        totalPages={1}
        canAdjust={false}
      />,
    );

    await abrirPanel();

    expect(await screen.findByTestId('product-batches-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('adjust-batch-open')).toBeNull();
  });

  it('con canAdjust el control de ajuste SI existe', async () => {
    listProductBatchesActionMock.mockResolvedValue({ status: 'success', data: [lote()] });

    render(
      <ProductTable
        products={[producto({ id: 'product-9' })]}
        params={PARAMS}
        totalPages={1}
        canAdjust
      />,
    );

    await abrirPanel();

    expect(await screen.findByTestId('adjust-batch-open')).toBeInTheDocument();
  });
});
