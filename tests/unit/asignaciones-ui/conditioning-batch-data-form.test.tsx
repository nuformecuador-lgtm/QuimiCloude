import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setupUser } from '../../helpers/user-event';

import {
  CONDITIONING_BATCH_DATA_ERROR_TESTID,
  CONDITIONING_BATCH_DATA_LINE_TESTID,
  CONDITIONING_BATCH_DATA_PROVISIONAL_TESTID,
  CONDITIONING_BATCH_DATA_SECTION_TESTID,
  CONDITIONING_BATCH_DATA_SUCCESS_TESTID,
  CONDITIONING_BATCH_DATA_TEXTS,
  ConditioningBatchDataForm,
  type ConditioningBatchFormLine,
} from '@/app/(private)/asignacion/acondicionamiento/[id]/components';
import type { SaveConditioningBatchDataResult } from '@/lib/modules/asignaciones/adapters/driving/order-conditioning-actions';

const { saveActionMock } = vi.hoisted(() => ({
  saveActionMock:
    vi.fn<(prev: SaveConditioningBatchDataResult, data: FormData) => Promise<SaveConditioningBatchDataResult>>(),
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-conditioning-actions', () => ({
  startConditioningAction: vi.fn(),
  finishConditioningAction: vi.fn(),
  saveConditioningBatchDataAction: saveActionMock,
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const ORDER_ID = '33333333-3333-4333-8333-333333333333';

const WITH_DATA: ConditioningBatchFormLine = {
  batchId: 'batch-1',
  presentationId: 'pres-1',
  presentationName: 'Botella',
  packagingName: '1 L',
  packages: 12,
  provisionalLot: null,
  lot: 'CR-2610-A',
  expiryDate: '2027-10-01',
  productionDate: '2026-10-01',
  label: '12 × 1 L',
};

const WITHOUT_DATA: ConditioningBatchFormLine = {
  batchId: 'batch-2',
  presentationId: 'pres-2',
  presentationName: 'Botella',
  packagingName: '200 ml',
  packages: 30,
  provisionalLot: '0000042',
  lot: null,
  expiryDate: null,
  productionDate: null,
  label: '30 × 200 ml',
};

function pintar(lines: readonly ConditioningBatchFormLine[] = [WITH_DATA, WITHOUT_DATA]) {
  return render(<ConditioningBatchDataForm orderId={ORDER_ID} lines={lines} />);
}

function bloques(): HTMLElement[] {
  return screen.getAllByTestId(CONDITIONING_BATCH_DATA_LINE_TESTID);
}

function campos(bloque: HTMLElement) {
  return {
    lot: within(bloque).getByLabelText(CONDITIONING_BATCH_DATA_TEXTS.lot) as HTMLInputElement,
    expiry: within(bloque).getByLabelText(CONDITIONING_BATCH_DATA_TEXTS.expiryDate) as HTMLInputElement,
    production: within(bloque).getByLabelText(CONDITIONING_BATCH_DATA_TEXTS.productionDate) as HTMLInputElement,
  };
}

describe('la sección «Datos de lote»', () => {
  it('R1: un bloque por línea en orden de alta, con la línea como en el reparto y un único botón', () => {
    pintar();

    const seccion = screen.getByTestId(CONDITIONING_BATCH_DATA_SECTION_TESTID);
    expect(within(seccion).getByRole('heading', { name: 'Datos de lote' })).toBeInTheDocument();
    expect(bloques().map((bloque) => bloque.tagName)).toEqual(['FIELDSET', 'FIELDSET']);
    expect(bloques().map((bloque) => within(bloque).getByText(/×/).textContent)).toEqual([
      '12 × 1 L',
      '30 × 200 ml',
    ]);
    expect(within(seccion).getAllByRole('button')).toHaveLength(1);
    expect(within(seccion).getByRole('button', { name: 'Guardar datos de lote' })).toHaveAttribute(
      'type',
      'submit',
    );
  });

  it('R2: una línea con datos viene rellena con lo guardado y sin «Lote provisional»', () => {
    pintar();

    const [conDatos] = bloques();
    if (conDatos === undefined) throw new Error('falta el bloque');
    const { lot, expiry, production } = campos(conDatos);
    expect(lot.value).toBe('CR-2610-A');
    expect(expiry.value).toBe('2027-10-01');
    expect(production.value).toBe('2026-10-01');
    expect(within(conDatos).queryByTestId(CONDITIONING_BATCH_DATA_PROVISIONAL_TESTID)).toBeNull();
  });

  it('R2: una línea sin datos viene vacía y dice «Lote provisional: <lote automático>.»', () => {
    pintar();

    const sinDatos = bloques()[1];
    if (sinDatos === undefined) throw new Error('falta el bloque');
    const { lot, expiry, production } = campos(sinDatos);
    expect([lot.value, expiry.value, production.value]).toEqual(['', '', '']);
    expect(within(sinDatos).getByTestId(CONDITIONING_BATCH_DATA_PROVISIONAL_TESTID)).toHaveTextContent(
      'Lote provisional: 0000042.',
    );
  });

  it('R5: cada campo tiene su etiqueta, 16 px, 44 px de alto y las fechas usan el selector nativo', () => {
    pintar();

    for (const bloque of bloques()) {
      const { lot, expiry, production } = campos(bloque);
      expect(lot).toHaveAttribute('type', 'text');
      expect(expiry).toHaveAttribute('type', 'date');
      expect(production).toHaveAttribute('type', 'date');
      for (const campo of [lot, expiry, production]) {
        expect(campo.className).toContain('text-base');
        expect(campo.className).toContain('md:text-base');
        expect(campo.className).toContain('min-h-11');
      }
    }
    expect(screen.getByRole('button', { name: 'Guardar datos de lote' }).className).toContain('min-h-11');
  });

  it('R5: los tres campos de una línea pasan a obligatorios en cuanto uno tiene valor', async () => {
    const user = setupUser();
    pintar([WITHOUT_DATA]);

    const [bloque] = bloques();
    if (bloque === undefined) throw new Error('falta el bloque');
    const { lot, expiry, production } = campos(bloque);
    expect(lot).not.toBeRequired();

    await user.type(lot, 'X');

    expect(lot).toBeRequired();
    expect(expiry).toBeRequired();
    expect(production).toBeRequired();
  });

  it('una línea sin lote de producción se pinta deshabilitada y no viaja en el envío', async () => {
    saveActionMock.mockResolvedValue({ status: 'success' });
    const user = setupUser();
    pintar([{ ...WITHOUT_DATA, batchId: null, provisionalLot: null }, WITH_DATA]);

    const [sinLote] = bloques();
    expect(sinLote).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Guardar datos de lote' }));

    await waitFor(() => expect(saveActionMock).toHaveBeenCalledTimes(1));
    const enviado = saveActionMock.mock.calls[0]?.[1];
    expect(enviado?.getAll('batchId')).toEqual(['batch-1']);
    expect(enviado?.getAll('lot')).toEqual(['CR-2610-A']);
  });
});

describe('guardar', () => {
  it('R1: envía orderId y las cuatro listas emparejadas por posición, y confirma en role="status"', async () => {
    saveActionMock.mockResolvedValue({ status: 'success' });
    const user = setupUser();
    pintar();

    const sinDatos = bloques()[1];
    if (sinDatos === undefined) throw new Error('falta el bloque');
    const { lot, expiry, production } = campos(sinDatos);
    await user.type(lot, 'CR-2610-B');
    await user.type(expiry, '2027-11-01');
    await user.type(production, '2026-10-02');
    await user.click(screen.getByRole('button', { name: 'Guardar datos de lote' }));

    await waitFor(() => expect(saveActionMock).toHaveBeenCalledTimes(1));
    const enviado = saveActionMock.mock.calls[0]?.[1];
    expect(enviado?.get('orderId')).toBe(ORDER_ID);
    expect(enviado?.getAll('batchId')).toEqual(['batch-1', 'batch-2']);
    expect(enviado?.getAll('lot')).toEqual(['CR-2610-A', 'CR-2610-B']);
    expect(enviado?.getAll('expiryDate')).toEqual(['2027-10-01', '2027-11-01']);
    expect(enviado?.getAll('productionDate')).toEqual(['2026-10-01', '2026-10-02']);
    const exito = await screen.findByTestId(CONDITIONING_BATCH_DATA_SUCCESS_TESTID);
    expect(exito).toHaveAttribute('role', 'status');
    expect(exito).toHaveTextContent('Datos de lote guardados.');
  });

  it('R5: si falla, muestra el mensaje en role="alert", marca aria-invalid la línea culpable y conserva lo escrito', async () => {
    saveActionMock.mockResolvedValue({
      status: 'error',
      code: 'batch_duplicate_lot',
      message: 'Ya existe un lote con ese valor en esta empresa.',
      batchId: 'batch-2',
    });
    const user = setupUser();
    pintar();

    const [conDatos, sinDatos] = bloques();
    if (conDatos === undefined || sinDatos === undefined) throw new Error('faltan bloques');
    const escritos = campos(sinDatos);
    await user.type(escritos.lot, 'CR-2610-A');
    await user.type(escritos.expiry, '2027-11-01');
    await user.type(escritos.production, '2026-10-02');
    await user.click(screen.getByRole('button', { name: 'Guardar datos de lote' }));

    const alerta = await screen.findByTestId(CONDITIONING_BATCH_DATA_ERROR_TESTID);
    expect(alerta).toHaveAttribute('role', 'alert');
    expect(alerta).toHaveAttribute('data-code', 'batch_duplicate_lot');
    expect(alerta).toHaveTextContent('Ya existe un lote con ese valor en esta empresa.');

    expect(sinDatos).toHaveAttribute('aria-invalid', 'true');
    expect(escritos.lot).toHaveAttribute('aria-invalid', 'true');
    expect(escritos.lot).toHaveAttribute('aria-describedby', alerta.id);
    expect(conDatos).not.toHaveAttribute('aria-invalid');
    expect(campos(conDatos).lot).not.toHaveAttribute('aria-invalid');

    const tras = campos(sinDatos);
    expect([tras.lot.value, tras.expiry.value, tras.production.value]).toEqual([
      'CR-2610-A',
      '2027-11-01',
      '2026-10-02',
    ]);
    expect(screen.queryByTestId(CONDITIONING_BATCH_DATA_SUCCESS_TESTID)).toBeNull();
  });

  it('R5: un error sin línea culpable va a role="alert" sin marcar ningún bloque', async () => {
    saveActionMock.mockResolvedValue({
      status: 'error',
      code: 'order_not_found',
      message: 'No se encontro el pedido.',
    });
    const user = setupUser();
    pintar();

    await user.click(screen.getByRole('button', { name: 'Guardar datos de lote' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontro el pedido.');
    for (const bloque of bloques()) expect(bloque).not.toHaveAttribute('aria-invalid');
  });
});
