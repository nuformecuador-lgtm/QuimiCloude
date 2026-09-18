import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BatchHistory, movementReasonLabel } from '@/app/(private)/inventario/components';
import type { InventoryMovementView } from '@/lib/modules/inventario';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

/**
 * `batch-history.tsx`: R23, R24 (`specs/QC-92-ajuste-de-inventario/tasks.md > T11`).
 *
 * La Server Action `listBatchMovementsAction` esta mockeada: es el borde del modulo `inventario`,
 * y sustituirla es lo que permite ejercitar los tres estados sin base de datos (mismo criterio que
 * `product-page.test.tsx`).
 */

const { listBatchMovementsActionMock } = vi.hoisted(() => ({
  listBatchMovementsActionMock: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/batch-actions', () => ({
  listBatchMovementsAction: listBatchMovementsActionMock,
}));

const BATCH_ID = 'batch-42';

function movimiento(overrides: Partial<InventoryMovementView> = {}): InventoryMovementView {
  return {
    id: crypto.randomUUID(),
    kind: 'adjustment',
    quantity: -3,
    reason: 'merma',
    authorName: 'Carla Duarte',
    createdAt: '2026-09-10T08:15:00.000Z',
    ...overrides,
  };
}

async function abrirDespliegue() {
  const user = setupUser();
  await user.click(await esperarInteractiva(screen.getByTestId('batch-history-trigger')));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('BatchHistory', () => {
  it('R23 — con asientos, muestra motivo, autor y fecha en el orden en que llegan, alta incluida', async () => {
    const reciente = movimiento({
      id: 'mov-reciente',
      reason: 'conteo_fisico',
      authorName: 'Carla Duarte',
      createdAt: '2026-09-15T10:00:00.000Z',
    });
    const alta = movimiento({
      id: 'mov-alta',
      kind: 'opening',
      reason: null,
      authorName: 'Ana Rios',
      createdAt: '2026-01-05T09:30:00.000Z',
    });
    // La action ya devuelve del mas reciente al mas antiguo: el componente NO reordena.
    listBatchMovementsActionMock.mockResolvedValue({ status: 'success', data: [reciente, alta] });

    render(<BatchHistory batchId={BATCH_ID} batchLot="L-2026-09" />);
    await abrirDespliegue();

    const lista = await screen.findByTestId('batch-history-list');
    const filas = screen.getAllByTestId(/^batch-history-entry-(?!reason|author|date)/);
    expect(filas.map((fila) => fila.getAttribute('data-testid'))).toEqual([
      'batch-history-entry-mov-reciente',
      'batch-history-entry-mov-alta',
    ]);

    const [filaReciente, filaAlta] = filas;
    expect(filaReciente).toHaveTextContent(movementReasonLabel('conteo_fisico'));
    expect(filaReciente).toHaveTextContent('Carla Duarte');
    expect(filaReciente).toHaveTextContent('2026-09-15');

    expect(filaAlta).toHaveTextContent('Ana Rios');
    expect(filaAlta).toHaveTextContent('2026-01-05');
    // El asiento de alta no tiene motivo: no se le inventa uno de los cuatro cerrados.
    for (const motivo of ['Merma', 'Rotura', 'Conteo fisico', 'Error de carga']) {
      expect(filaAlta).not.toHaveTextContent(motivo);
    }

    expect(screen.queryByTestId('batch-history-before-ledger')).toBeNull();
    expect(screen.queryByTestId('batch-history-error')).toBeNull();
    expect(lista).toBeInTheDocument();

    expect(within(filaReciente!).getByText('Motivo')).toBeVisible();
    expect(within(filaReciente!).getByText('Autor')).toBeVisible();
    expect(within(filaReciente!).getByText('Fecha')).toBeVisible();
  });

  it('R24 — sin ningun asiento, dice que el lote es anterior al libro y no parece un error ni una lista', async () => {
    listBatchMovementsActionMock.mockResolvedValue({ status: 'success', data: [] });

    render(<BatchHistory batchId={BATCH_ID} />);
    await abrirDespliegue();

    const sinLibro = await screen.findByTestId('batch-history-before-ledger');
    expect(sinLibro).toHaveTextContent(/anterior al libro/i);

    expect(screen.queryByTestId('batch-history-error')).toBeNull();
    expect(screen.queryByTestId('batch-history-list')).toBeNull();
  });

  it('distingue el error de carga de los otros dos estados, con su propio marcador y role="alert"', async () => {
    listBatchMovementsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unexpected_error',
      message: 'No se pudo cargar el historial.',
      reference: 'req-1',
    });

    render(<BatchHistory batchId={BATCH_ID} />);
    await abrirDespliegue();

    const error = await screen.findByTestId('batch-history-error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('No se pudo cargar el historial.');

    expect(screen.queryByTestId('batch-history-before-ledger')).toBeNull();
    expect(screen.queryByTestId('batch-history-list')).toBeNull();
  });

  it('no vuelve a pedir los movimientos en aperturas posteriores', async () => {
    listBatchMovementsActionMock.mockResolvedValue({ status: 'success', data: [movimiento()] });

    const user = setupUser();
    render(<BatchHistory batchId={BATCH_ID} />);

    await user.click(await esperarInteractiva(screen.getByTestId('batch-history-trigger')));
    await screen.findByTestId('batch-history-list');
    await user.click(screen.getByTestId('batch-history-trigger'));
    await user.click(await esperarInteractiva(screen.getByTestId('batch-history-trigger')));

    await waitFor(() => expect(listBatchMovementsActionMock).toHaveBeenCalledTimes(1));
  });

  it('deriva la etiqueta de un motivo del propio valor, sin enumerarlos a mano', () => {
    expect(movementReasonLabel('conteo_fisico')).toBe('Conteo fisico');
    expect(movementReasonLabel('error_de_carga')).toBe('Error de carga');
  });
});
