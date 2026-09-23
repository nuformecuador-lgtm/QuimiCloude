import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AdjustBatchDialog,
  ProductBatchesPanel,
} from '@/app/(private)/inventario/components';
import type { AdjustBatchStockFormState } from '@/lib/modules/inventario/adapters/driving/batch-actions';
import { MOVEMENT_REASONS, type ProductBatchView } from '@/lib/modules/inventario';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

/**
 * `adjust-batch-dialog.tsx`: R2, R8, R21, R25 (`specs/QC-92-ajuste-de-inventario/tasks.md > T12`).
 *
 * La Server Action `adjustBatchStockAction` esta mockeada: es el borde del modulo `inventario`,
 * mismo criterio que `batch-history.test.tsx` y `product-page.test.tsx`.
 */

const { routerMock, adjustBatchStockActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  adjustBatchStockActionMock:
    vi.fn<
      (prev: AdjustBatchStockFormState, data: FormData) => Promise<AdjustBatchStockFormState>
    >(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/batch-actions', () => ({
  adjustBatchStockAction: adjustBatchStockActionMock,
}));

function lote(overrides: Partial<ProductBatchView> = {}): ProductBatchView {
  return {
    id: 'batch-42',
    lot: 'L-001',
    stock: '10',
    unitId: 'unit-kg',
    purchaseDate: '2026-03-05',
    expiryDate: null,
    ...overrides,
  };
}

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  adjustBatchStockActionMock.mockResolvedValue({
    status: 'success',
    stock: '7',
    reserved: '0',
    overReserved: false,
  });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

/** Abre el dialogo, ya con sus campos listos. */
async function abrirDialogo(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId('adjust-batch-open'));
  return screen.getByTestId('adjust-batch-dialog');
}

/** Elige la primera opcion del motivo, del conjunto cerrado. */
async function elegirMotivo(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId('adjust-batch-reason'));
  const opciones = await screen.findAllByTestId('adjust-batch-reason-option');
  await user.click(await esperarInteractiva(opciones[0]!));
}

describe('el envio manda el batchId, la cantidad con signo y el motivo (R2, R8)', () => {
  it('un delta positivo viaja tal cual, junto al batchId y un motivo del conjunto cerrado', async () => {
    const user = setupUser();
    render(<AdjustBatchDialog batch={lote()} canAdjust />);

    await abrirDialogo(user);
    await user.type(screen.getByTestId('adjust-batch-delta'), '5');
    await elegirMotivo(user);
    await user.click(screen.getByTestId('adjust-batch-confirm'));

    await waitFor(() => expect(adjustBatchStockActionMock).toHaveBeenCalledTimes(1));
    const enviado = adjustBatchStockActionMock.mock.calls[0]![1];
    expect(enviado.get('batchId')).toBe('batch-42');
    expect(enviado.get('delta')).toBe('5');
    expect(MOVEMENT_REASONS).toContain(enviado.get('reason'));
  });

  it('un delta negativo conserva su signo: NUNCA el total nuevo del lote', async () => {
    const user = setupUser();
    render(<AdjustBatchDialog batch={lote()} canAdjust />);

    await abrirDialogo(user);
    await user.type(screen.getByTestId('adjust-batch-delta'), '-3');
    await elegirMotivo(user);
    await user.click(screen.getByTestId('adjust-batch-confirm'));

    await waitFor(() => expect(adjustBatchStockActionMock).toHaveBeenCalledTimes(1));
    const enviado = adjustBatchStockActionMock.mock.calls[0]![1];
    expect(enviado.get('delta')).toBe('-3');
  });

  it('R6 — un delta decimal viaja tal cual, sin pasar por coma flotante', async () => {
    const user = setupUser();
    render(<AdjustBatchDialog batch={lote()} canAdjust />);

    await abrirDialogo(user);
    await user.type(screen.getByTestId('adjust-batch-delta'), '-0.5');
    await elegirMotivo(user);
    await user.click(screen.getByTestId('adjust-batch-confirm'));

    await waitFor(() => expect(adjustBatchStockActionMock).toHaveBeenCalledTimes(1));
    const enviado = adjustBatchStockActionMock.mock.calls[0]![1];
    expect(enviado.get('delta')).toBe('-0.5');
  });

  it('R6 — la coma se convierte en punto mientras se teclea', async () => {
    const user = setupUser();
    render(<AdjustBatchDialog batch={lote()} canAdjust />);

    await abrirDialogo(user);
    await user.type(screen.getByTestId('adjust-batch-delta'), '1,5');
    expect((screen.getByTestId('adjust-batch-delta') as HTMLInputElement).value).toBe('1.5');
  });

  it('con exito cierra, avisa por toast y refresca (R21)', async () => {
    const user = setupUser();
    render(<AdjustBatchDialog batch={lote()} canAdjust />);

    await abrirDialogo(user);
    await user.type(screen.getByTestId('adjust-batch-delta'), '5');
    await elegirMotivo(user);
    await user.click(screen.getByTestId('adjust-batch-confirm'));

    await waitFor(() => expect(screen.queryByTestId('adjust-batch-dialog')).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('con error el dialogo sigue abierto con el mensaje a la vista', async () => {
    adjustBatchStockActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'No se pudo ajustar la existencia.',
    });
    const user = setupUser();
    render(<AdjustBatchDialog batch={lote()} canAdjust />);

    await abrirDialogo(user);
    await user.type(screen.getByTestId('adjust-batch-delta'), '5');
    await elegirMotivo(user);
    await user.click(screen.getByTestId('adjust-batch-confirm'));

    const aviso = await screen.findByTestId('adjust-batch-error');
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('adjust-batch-dialog')).toBeInTheDocument();
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

describe('la cantidad cero se rechaza en el cliente (R2)', () => {
  it('muestra el mensaje y NO invoca la action', async () => {
    const user = setupUser();
    render(<AdjustBatchDialog batch={lote()} canAdjust />);

    await abrirDialogo(user);
    await user.type(screen.getByTestId('adjust-batch-delta'), '0');
    await elegirMotivo(user);
    await user.click(screen.getByTestId('adjust-batch-confirm'));

    const aviso = await screen.findByTestId('adjust-batch-zero-error');
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(adjustBatchStockActionMock).not.toHaveBeenCalled();
  });

  it('el aria-describedby del campo resuelve a un elemento existente con el texto del error', async () => {
    const user = setupUser();
    render(<AdjustBatchDialog batch={lote()} canAdjust />);

    await abrirDialogo(user);
    await user.type(screen.getByTestId('adjust-batch-delta'), '0');
    await elegirMotivo(user);
    await user.click(screen.getByTestId('adjust-batch-confirm'));

    const aviso = await screen.findByTestId('adjust-batch-zero-error');
    const campo = screen.getByTestId('adjust-batch-delta');
    const describedById = campo.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();

    const descripcion = document.getElementById(describedById!);
    expect(descripcion).toBe(aviso);
    expect(descripcion).toHaveTextContent('La cantidad no puede ser cero.');
  });
});

describe('el motivo es obligatorio en el cliente', () => {
  it('sin motivo, muestra el mensaje y NO invoca la action', async () => {
    const user = setupUser();
    render(<AdjustBatchDialog batch={lote()} canAdjust />);

    await abrirDialogo(user);
    await user.type(screen.getByTestId('adjust-batch-delta'), '5');
    await user.click(screen.getByTestId('adjust-batch-confirm'));

    const aviso = await screen.findByTestId('adjust-batch-reason-error');
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(adjustBatchStockActionMock).not.toHaveBeenCalled();
  });
});

describe('el Operador, que solo tiene inventario.consultar, no encuentra el control (R21)', () => {
  it('sin canAdjust el panel se ve pero el disparador del ajuste no existe en el DOM', () => {
    const batches = [lote()];
    render(
      <ProductBatchesPanel
        batches={batches}
        renderBatchActions={(batch) => (
          <AdjustBatchDialog batch={batch} canAdjust={false} />
        )}
      />,
    );

    expect(screen.getByTestId('product-batches-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('adjust-batch-open')).toBeNull();
    expect(screen.queryByTestId('adjust-batch-dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ajustar existencia' })).toBeNull();
  });

  it('con canAdjust el control SI esta, para el mismo panel', () => {
    const batches = [lote()];
    render(
      <ProductBatchesPanel
        batches={batches}
        renderBatchActions={(batch) => <AdjustBatchDialog batch={batch} canAdjust />}
      />,
    );

    expect(screen.getByTestId('adjust-batch-open')).toBeInTheDocument();
  });
});

describe('multiplataforma (R25)', () => {
  it('el disparador y los campos llevan area tactil, y el campo de cantidad lleva text-base', async () => {
    const user = setupUser();
    render(<AdjustBatchDialog batch={lote()} canAdjust />);

    expect(screen.getByTestId('adjust-batch-open').className).toMatch(/min-h-11/);

    await abrirDialogo(user);
    const delta = screen.getByTestId('adjust-batch-delta');
    expect(delta.className).toMatch(/min-h-11/);
    expect(delta.className).toMatch(/text-base/);
    expect(screen.getByTestId('adjust-batch-reason').className).toMatch(/min-h-11/);
    expect(screen.getByTestId('adjust-batch-confirm').className).toMatch(/min-h-11/);
    expect(screen.getByTestId('adjust-batch-cancel').className).toMatch(/min-h-11/);
  });
});
