import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EnqueueBatchResult,
  GetBatchStatusResult,
} from '@/lib/modules/documentos/adapters/driving/document-batch-actions';
import type { IssueUploadLinksResult } from '@/lib/modules/documentos/adapters/driving/document-upload-actions';

const { issueUploadLinksActionMock, enqueueBatchActionMock, getBatchStatusActionMock } = vi.hoisted(
  () => ({
    issueUploadLinksActionMock: vi.fn<(input: unknown) => Promise<IssueUploadLinksResult>>(),
    enqueueBatchActionMock: vi.fn<(input: unknown) => Promise<EnqueueBatchResult>>(),
    getBatchStatusActionMock: vi.fn<(batchId: string) => Promise<GetBatchStatusResult>>(),
  }),
);

vi.mock('@/lib/modules/documentos/adapters/driving/document-upload-actions', () => ({
  issueUploadLinksAction: issueUploadLinksActionMock,
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-batch-actions', () => ({
  enqueueBatchAction: enqueueBatchActionMock,
  getBatchStatusAction: getBatchStatusActionMock,
}));

import {
  BATCH_STATUS_POLL_INTERVAL_MS,
  DOCUMENT_UPLOAD_ERROR_TESTID,
  DOCUMENT_UPLOAD_INPUT_TESTID,
  DOCUMENT_UPLOAD_RESUME_TESTID,
  DOCUMENT_UPLOAD_SUBMIT_TESTID,
  DOCUMENT_UPLOAD_TRIGGER_TESTID,
  DocumentUpload,
  DocumentUploadRow,
  rowErrorTestId,
  rowReasonTestId,
} from '@/components/shared/document-upload';
import { errorMessage } from '@/lib/modules/errores';

import { setupUser } from '../../helpers/user-event';
import { batch, entry, okResponse, pdf, signedUploads } from './helpers';

const fetchMock = vi.fn<() => Promise<Response>>();

beforeEach(() => {
  issueUploadLinksActionMock.mockReset();
  enqueueBatchActionMock.mockReset();
  getBatchStatusActionMock.mockReset();
  fetchMock.mockReset();

  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(okResponse());
  issueUploadLinksActionMock.mockResolvedValue({
    status: 'success',
    data: { uploads: signedUploads(1) },
  });
  enqueueBatchActionMock.mockResolvedValue({ status: 'success', data: { batchId: 'batch-1' } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function subirUnArchivo(): Promise<void> {
  const user = setupUser();
  await user.upload(screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID), [pdf('uno.pdf')]);
  await user.click(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID));
}

describe('los errores de la subida', () => {
  it('el texto de un archivo en error se elige por su code y no por su mensaje (R12)', () => {
    const MISMO_MOTIVO = 'el proveedor de IA devolvio 503 tras tres intentos';

    render(
      <DocumentUploadRow
        index={0}
        fileName="uno.pdf"
        phase="uploaded"
        entry={entry({
          status: 'error',
          errorCode: 'ai_unavailable',
          errorReason: MISMO_MOTIVO,
        })}
      />,
    );
    render(
      <DocumentUploadRow
        index={1}
        fileName="dos.pdf"
        phase="uploaded"
        entry={entry({
          status: 'error',
          errorCode: 'invalid_input',
          errorReason: MISMO_MOTIVO,
        })}
      />,
    );

    expect(screen.getByTestId(rowErrorTestId(0))).toHaveTextContent(errorMessage('ai_unavailable'));
    expect(screen.getByTestId(rowErrorTestId(1))).toHaveTextContent(errorMessage('invalid_input'));

    // Mismo motivo de texto libre, textos distintos: quien decide es el `code`.
    expect(screen.getByTestId(rowErrorTestId(0)).textContent).not.toBe(
      screen.getByTestId(rowErrorTestId(1)).textContent,
    );

    // El motivo se muestra como detalle, pero no es el texto del error.
    expect(screen.getByTestId(rowReasonTestId(0))).toHaveTextContent(MISMO_MOTIVO);
    expect(screen.getByTestId(rowErrorTestId(0)).textContent).not.toContain(MISMO_MOTIVO);
  });

  it('un error de la consulta detiene el sondeo y se muestra por su code (R12)', async () => {
    getBatchStatusActionMock.mockResolvedValue({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      reference: 'req-1',
    });

    render(<DocumentUpload strategy="catalogo" />);
    await subirUnArchivo();

    const aviso = await screen.findByTestId(DOCUMENT_UPLOAD_ERROR_TESTID);
    expect(aviso).toHaveAttribute('data-code', 'unexpected');
    expect(aviso).toHaveTextContent(errorMessage('unexpected'));
    expect(getBatchStatusActionMock).toHaveBeenCalledTimes(1);

    // Mas de un intervalo entero sin una sola consulta nueva: el sondeo esta detenido de verdad.
    await new Promise((resolve) => setTimeout(resolve, BATCH_STATUS_POLL_INTERVAL_MS + 400));
    expect(getBatchStatusActionMock).toHaveBeenCalledTimes(1);

    getBatchStatusActionMock.mockResolvedValue({
      status: 'success',
      data: batch([entry({ path: signedUploads(1)[0]?.path, status: 'done' })]),
    });

    const user = setupUser();
    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_RESUME_TESTID));

    await waitFor(() => expect(getBatchStatusActionMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId(DOCUMENT_UPLOAD_ERROR_TESTID)).toBeNull());
  });

  it('el componente no comprueba ningun permiso y muestra el error de autorizacion como cualquier otro (R14)', async () => {
    issueUploadLinksActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });

    render(<DocumentUpload strategy="catalogo" />);

    // Se monta entero antes de saber nada de permisos: nada oculto, nada deshabilitado por rol.
    expect(screen.getByTestId(DOCUMENT_UPLOAD_TRIGGER_TESTID)).toBeVisible();
    expect(screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID)).toBeEnabled();

    await subirUnArchivo();

    const aviso = await screen.findByTestId(DOCUMENT_UPLOAD_ERROR_TESTID);
    expect(aviso).toHaveAttribute('data-code', 'unauthorized');
    expect(aviso).toHaveTextContent(errorMessage('unauthorized'));
    expect(screen.getByTestId(DOCUMENT_UPLOAD_TRIGGER_TESTID)).toBeVisible();
    expect(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID)).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
