import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ALREADY_IMPORTED_TESTID,
  CONFIRM_BUTTON_TESTID,
  DIALOG_SUBMIT_TESTID,
  ERROR_FILE_BUTTON_TESTID,
  InventoryImportScreen,
  MISSING_CREATE_TESTID,
  MISSING_UNIT_TESTID,
  PREVIEW_TABLE_TESTID,
  REJECTION_COLUMN_TESTID,
  REJECTION_TESTID,
  RESTART_TESTID,
  RESULT_TESTID,
  REVIEWING_TESTID,
  REVIEW_BUTTON_TESTID,
  ROW_STATUS_TESTID,
  SCREEN_ERROR_TESTID,
  UNIT_DIALOG_TESTID,
  UPLOAD_INPUT_TESTID,
  UPLOAD_TOO_LARGE_TESTID,
  alreadyImportedMessage,
} from '@/app/(private)/inventario/importar/components';
import { UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID } from '@/components/shared/unexpected-error-notice';
import {
  INVENTORY_IMPORT_MAX_FILE_BYTES,
  buildInventoryImportErrorFile,
  type ImportDownload,
} from '@/lib/modules/inventario';
import type {
  ConfirmInventoryImportResult,
  PreviewInventoryImportResult,
} from '@/lib/modules/inventario/adapters/driving/inventory-import-actions';
import type { CreateUnitFormState } from '@/lib/modules/unidades/adapters/driving/unit-actions';

import { setupUser } from '../../../helpers/user-event';
import { FILAS_RESULTADO, FILAS_VISTA_PREVIA, resultado, vistaPrevia } from './import-preview-fixtures';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const { previewMock, confirmMock, createUnitActionMock, downloadFileMock } = vi.hoisted(() => ({
  previewMock: vi.fn<(formData: FormData) => Promise<PreviewInventoryImportResult>>(),
  confirmMock: vi.fn<(formData: FormData) => Promise<ConfirmInventoryImportResult>>(),
  createUnitActionMock: vi.fn<(prev: CreateUnitFormState, formData: FormData) => Promise<CreateUnitFormState>>(),
  downloadFileMock: vi.fn<(download: ImportDownload) => void>(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/inventory-import-actions', () => ({
  previewInventoryImportAction: previewMock,
  confirmInventoryImportAction: confirmMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  createUnitAction: createUnitActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  createPresentationAction: vi.fn(),
}));

vi.mock('@/app/(private)/inventario/importar/components/download-file', () => ({
  downloadFile: downloadFileMock,
}));

const ARCHIVO = new File(['Tipo;Nombre'], 'inventario.csv', { type: 'text/csv' });

function enviado(mock: { mock: { calls: unknown[][] } }, llamada: number): FormData {
  const formData = mock.mock.calls[llamada]?.[0];
  if (!(formData instanceof FormData)) throw new Error('la acción no recibió FormData');
  return formData;
}

async function subirYRevisar(archivo: File = ARCHIVO) {
  const user = setupUser();
  render(<InventoryImportScreen units={[]} />);
  await user.upload(screen.getByTestId(UPLOAD_INPUT_TESTID), archivo);
  await user.click(screen.getByTestId(REVIEW_BUTTON_TESTID));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  previewMock.mockResolvedValue({ status: 'success', data: vistaPrevia() });
  confirmMock.mockResolvedValue({ status: 'success', data: resultado() });
  createUnitActionMock.mockResolvedValue({ status: 'success', id: 'nueva' });
});

afterEach(() => {
  cleanup();
});

describe('vista previa', () => {
  it('R9 manda el archivo elegido y pinta la vista previa', async () => {
    await subirYRevisar();

    expect(await screen.findByTestId(PREVIEW_TABLE_TESTID)).toBeInTheDocument();
    expect(previewMock).toHaveBeenCalledTimes(1);
    expect(enviado(previewMock, 0).get('file')).toBe(ARCHIVO);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('sin archivo no se puede pedir la vista previa', () => {
    render(<InventoryImportScreen units={[]} />);

    expect(screen.getByTestId(REVIEW_BUTTON_TESTID)).toBeDisabled();
  });

  it('R6 un archivo que pasa del tope se avisa y no se envía', async () => {
    const user = setupUser();
    render(<InventoryImportScreen units={[]} />);
    const grande = new File([new Uint8Array(INVENTORY_IMPORT_MAX_FILE_BYTES + 1)], 'grande.csv');

    await user.upload(screen.getByTestId(UPLOAD_INPUT_TESTID), grande);

    expect(screen.getByTestId(UPLOAD_TOO_LARGE_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(REVIEW_BUTTON_TESTID)).toBeDisabled();
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('muestra el estado de carga mientras se revisa el archivo', async () => {
    let responder: (value: PreviewInventoryImportResult) => void = () => undefined;
    previewMock.mockReturnValue(new Promise((resolve) => (responder = resolve)));

    await subirYRevisar();

    expect(await screen.findByTestId(REVIEWING_TESTID)).toHaveAttribute('role', 'status');
    responder({ status: 'success', data: vistaPrevia() });
    await waitFor(() => expect(screen.queryByTestId(REVIEWING_TESTID)).toBeNull());
  });

  it('R4 R5 un archivo rechazado entero muestra el motivo y no ofrece confirmar', async () => {
    previewMock.mockResolvedValue({
      status: 'success',
      data: { kind: 'file_rejected', rejection: { code: 'missing_columns', columns: ['Existencia'] } },
    });

    await subirYRevisar();

    const rechazo = await screen.findByTestId(REJECTION_TESTID);
    expect(within(rechazo).getByTestId(REJECTION_COLUMN_TESTID)).toHaveTextContent('Existencia');
    expect(screen.queryByTestId(CONFIRM_BUTTON_TESTID)).toBeNull();
  });

  it('un error inesperado se pinta con su referencia', async () => {
    previewMock.mockResolvedValue({
      status: 'error',
      code: 'unexpected',
      message: 'Algo falló.',
      reference: 'REF-PREVIEW',
    });

    await subirYRevisar();

    expect(await screen.findByTestId(SCREEN_ERROR_TESTID)).toHaveAttribute('data-code', 'unexpected');
    expect(screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent('REF-PREVIEW');
  });

  it('R1 «unauthorized» se pinta con su mensaje', async () => {
    previewMock.mockResolvedValue({ status: 'error', code: 'unauthorized', message: 'Sin permiso.' });

    await subirYRevisar();

    expect(await screen.findByTestId(SCREEN_ERROR_TESTID)).toHaveTextContent('Sin permiso.');
  });

  it('R28 el archivo de errores de la vista previa sale de buildInventoryImportErrorFile', async () => {
    const user = await subirYRevisar();

    await user.click(await screen.findByTestId(ERROR_FILE_BUTTON_TESTID));

    expect(downloadFileMock).toHaveBeenCalledWith(buildInventoryImportErrorFile(FILAS_VISTA_PREVIA, 'inventario.csv'));
  });
});

describe('alta de un faltante', () => {
  it('R23 tras crear la unidad vuelve a pedir la vista previa con el MISMO archivo y pinta la nueva', async () => {
    const corregida = vistaPrevia({
      rows: FILAS_VISTA_PREVIA.filter((fila) => fila.rowNumber !== 7),
      missingUnits: [],
    });
    previewMock
      .mockResolvedValueOnce({ status: 'success', data: vistaPrevia() })
      .mockResolvedValueOnce({ status: 'success', data: corregida });
    const user = await subirYRevisar();

    await user.click(
      within(await screen.findByTestId(MISSING_UNIT_TESTID)).getByTestId(MISSING_CREATE_TESTID),
    );
    await screen.findByTestId(UNIT_DIALOG_TESTID);
    await user.click(screen.getByTestId(DIALOG_SUBMIT_TESTID));

    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(2));
    expect(enviado(previewMock, 1).get('file')).toBe(enviado(previewMock, 0).get('file'));
    expect(enviado(previewMock, 1).get('file')).toBe(ARCHIVO);
    await waitFor(() => expect(screen.queryByTestId(MISSING_UNIT_TESTID)).toBeNull());
    expect(screen.queryByTestId('data-table-row-7')).toBeNull();
  });
});

describe('confirmación', () => {
  it('R24 confirma con el mismo archivo y una importKey uuid, y pinta el resultado fila a fila', async () => {
    const user = await subirYRevisar();

    await user.click(await screen.findByTestId(CONFIRM_BUTTON_TESTID));

    const resultadoPintado = await screen.findByTestId(RESULT_TESTID);
    const formData = enviado(confirmMock, 0);
    expect(formData.get('file')).toBe(ARCHIVO);
    expect(String(formData.get('importKey'))).toMatch(UUID);
    const estados = within(resultadoPintado)
      .getAllByTestId(ROW_STATUS_TESTID)
      .map((estado) => estado.getAttribute('data-status'));
    expect(estados).toEqual(FILAS_RESULTADO.map((fila) => fila.status));
  });

  it('R29 un reintento tras un fallo reutiliza la misma importKey', async () => {
    confirmMock
      .mockResolvedValueOnce({ status: 'error', code: 'unexpected', message: 'Algo falló.', reference: 'REF-1' })
      .mockResolvedValueOnce({ status: 'success', data: resultado() });
    const user = await subirYRevisar();

    await user.click(await screen.findByTestId(CONFIRM_BUTTON_TESTID));
    expect(await screen.findByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent('REF-1');
    await user.click(screen.getByTestId(CONFIRM_BUTTON_TESTID));

    await screen.findByTestId(RESULT_TESTID);
    expect(confirmMock).toHaveBeenCalledTimes(2);
    expect(enviado(confirmMock, 1).get('importKey')).toBe(enviado(confirmMock, 0).get('importKey'));
  });

  it('R29 una vista previa nueva estrena importKey', async () => {
    confirmMock.mockResolvedValue({ status: 'success', data: resultado() });
    const user = await subirYRevisar();
    await user.click(await screen.findByTestId(CONFIRM_BUTTON_TESTID));
    await user.click(await screen.findByTestId(RESTART_TESTID));

    await user.upload(screen.getByTestId(UPLOAD_INPUT_TESTID), ARCHIVO);
    await user.click(screen.getByTestId(REVIEW_BUTTON_TESTID));
    await user.click(await screen.findByTestId(CONFIRM_BUTTON_TESTID));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(2));
    expect(enviado(confirmMock, 1).get('importKey')).not.toBe(enviado(confirmMock, 0).get('importKey'));
  });

  it('R29 «already_imported» dice que esa importación ya se hizo', async () => {
    const importedAt = '2026-10-06T12:00:00.000Z';
    confirmMock.mockResolvedValue({
      status: 'success',
      data: { kind: 'already_imported', importId: '44444444-4444-4444-8444-444444444444', importedAt },
    });
    const user = await subirYRevisar();

    await user.click(await screen.findByTestId(CONFIRM_BUTTON_TESTID));

    expect(await screen.findByTestId(ALREADY_IMPORTED_TESTID)).toHaveTextContent(alreadyImportedMessage(importedAt));
    expect(screen.queryByTestId(RESULT_TESTID)).toBeNull();
  });

  it('R25 si al confirmar el archivo se rechaza, se muestra el rechazo', async () => {
    confirmMock.mockResolvedValue({
      status: 'success',
      data: { kind: 'file_rejected', rejection: { code: 'unreadable' } },
    });
    const user = await subirYRevisar();

    await user.click(await screen.findByTestId(CONFIRM_BUTTON_TESTID));

    expect(await screen.findByTestId(REJECTION_TESTID)).toHaveAttribute('data-code', 'unreadable');
  });

  it('R28 el archivo de errores del resultado sale de buildInventoryImportErrorFile', async () => {
    const user = await subirYRevisar();
    await user.click(await screen.findByTestId(CONFIRM_BUTTON_TESTID));

    await user.click(within(await screen.findByTestId(RESULT_TESTID)).getByTestId(ERROR_FILE_BUTTON_TESTID));

    expect(downloadFileMock).toHaveBeenCalledWith(buildInventoryImportErrorFile(FILAS_RESULTADO, 'inventario.csv'));
  });

  it('mientras confirma, el botón queda ocupado y no se puede volver a pulsar', async () => {
    let responder: (value: ConfirmInventoryImportResult) => void = () => undefined;
    confirmMock.mockReturnValue(new Promise((resolve) => (responder = resolve)));
    const user = await subirYRevisar();

    await user.click(await screen.findByTestId(CONFIRM_BUTTON_TESTID));

    await waitFor(() => expect(screen.getByTestId(CONFIRM_BUTTON_TESTID)).toBeDisabled());
    expect(screen.getByTestId(CONFIRM_BUTTON_TESTID)).toHaveAttribute('aria-busy', 'true');
    responder({ status: 'success', data: resultado() });
    await screen.findByTestId(RESULT_TESTID);
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });
});
