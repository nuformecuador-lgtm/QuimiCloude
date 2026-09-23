import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BatchHistory, movementKindLabel, movementReasonLabel } from '@/app/(private)/inventario/components';
import type { BatchHistoryEntry } from '@/lib/modules/inventario';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

/**
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

function asiento(overrides: Partial<BatchHistoryEntry> = {}): BatchHistoryEntry {
  return {
    id: 'asiento-1',
    kind: 'adjustment',
    quantity: '-3',
    reason: 'merma',
    orderNumberText: null,
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
  it('R38 — con asientos, muestra tipo, cantidad, motivo, pedido, autor y fecha en el orden en que llegan', async () => {
    const apartado = asiento({
      kind: 'reserve',
      quantity: '5',
      reason: null,
      orderNumberText: 'PED-0042',
      authorName: 'Carla Duarte',
      createdAt: '2026-09-15T10:00:00.000Z',
    });
    const alta = asiento({
      kind: 'opening',
      quantity: '20',
      reason: null,
      orderNumberText: null,
      authorName: 'Ana Rios',
      createdAt: '2026-01-05T09:30:00.000Z',
    });
    // La action ya devuelve del mas reciente al mas antiguo: el componente NO reordena.
    listBatchMovementsActionMock.mockResolvedValue({ status: 'success', data: [apartado, alta] });

    render(<BatchHistory batchId={BATCH_ID} batchLot="L-2026-09" />);
    await abrirDespliegue();

    const lista = await screen.findByTestId('batch-history-list');
    const filas = within(lista).getAllByRole('listitem');
    expect(filas).toHaveLength(2);

    const [filaApartado, filaAlta] = filas;
    expect(filaApartado).toHaveTextContent(movementKindLabel('reserve'));
    expect(filaApartado).toHaveTextContent('5');
    expect(filaApartado).toHaveTextContent('PED-0042');
    expect(filaApartado).toHaveTextContent('Carla Duarte');
    expect(filaApartado).toHaveTextContent('2026-09-15');

    expect(filaAlta).toHaveTextContent(movementKindLabel('opening'));
    expect(filaAlta).toHaveTextContent('Ana Rios');
    expect(filaAlta).toHaveTextContent('2026-01-05');
    // El asiento de apertura no tiene ni motivo ni pedido: no se inventa ninguno de los dos.
    expect(within(filaAlta!).queryByTestId('batch-history-entry-reason')).toBeNull();
    expect(within(filaAlta!).queryByTestId('batch-history-entry-order')).toBeNull();

    expect(screen.queryByTestId('batch-history-before-ledger')).toBeNull();
    expect(screen.queryByTestId('batch-history-error')).toBeNull();
    expect(lista).toBeInTheDocument();

    expect(within(filaApartado!).getByText('Tipo')).toBeVisible();
    expect(within(filaApartado!).getByText('Cantidad')).toBeVisible();
    expect(within(filaApartado!).getByText('Pedido')).toBeVisible();
    expect(within(filaApartado!).getByText('Autor')).toBeVisible();
    expect(within(filaApartado!).getByText('Fecha')).toBeVisible();
  });

  it('R38 — sin autor, indica que lo hizo el sistema', async () => {
    const caducidad = asiento({
      kind: 'expire',
      quantity: '-2',
      reason: null,
      orderNumberText: 'PED-0007',
      authorName: null,
    });
    listBatchMovementsActionMock.mockResolvedValue({ status: 'success', data: [caducidad] });

    render(<BatchHistory batchId={BATCH_ID} />);
    await abrirDespliegue();

    const fila = (await screen.findAllByRole('listitem'))[0]!;
    expect(within(fila).getByTestId('batch-history-entry-author')).toHaveTextContent('Sistema');
    expect(within(fila).getByTestId('batch-history-entry-kind')).toHaveTextContent(
      movementKindLabel('expire'),
    );
  });

  it('R6 — la cantidad de cada asiento se pinta a dos decimales, con la cifra exacta en el title y el aria-label', async () => {
    const consumo = asiento({ kind: 'consume', quantity: '12345.6789', reason: null });
    listBatchMovementsActionMock.mockResolvedValue({ status: 'success', data: [consumo] });

    render(<BatchHistory batchId={BATCH_ID} />);
    await abrirDespliegue();

    const cantidad = await screen.findByTestId('batch-history-entry-quantity');
    expect(cantidad).toHaveTextContent('12345.68');
    expect(cantidad).toHaveAttribute('title', '12345.6789');
    expect(cantidad).toHaveAttribute('aria-label', '12345.6789');
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
    listBatchMovementsActionMock.mockResolvedValue({ status: 'success', data: [asiento()] });

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

  it('R38 — cada tipo de asiento tiene una etiqueta legible propia, sin reutilizar la de otro', () => {
    const kinds: readonly BatchHistoryEntry['kind'][] = [
      'opening',
      'adjustment',
      'consumption',
      'reserve',
      'release',
      'expire',
      'consume',
    ];
    const etiquetas = kinds.map(movementKindLabel);

    expect(new Set(etiquetas).size).toBe(kinds.length);
    for (const etiqueta of etiquetas) {
      expect(etiqueta.length).toBeGreaterThan(0);
    }
  });
});
