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
  DOCUMENT_UPLOAD_INPUT_TESTID,
  DOCUMENT_UPLOAD_SUBMIT_TESTID,
  DocumentUpload,
  rowPhaseTestId,
} from '@/components/shared/document-upload';
import * as documentosBarrel from '@/lib/modules/documentos';

import { setupUser } from '../../helpers/user-event';
import { batch, entry, failedResponse, okResponse, pdf, signedUploads } from './helpers';

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

beforeEach(() => {
  issueUploadLinksActionMock.mockReset();
  enqueueBatchActionMock.mockReset();
  getBatchStatusActionMock.mockReset();
  fetchMock.mockReset();

  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(okResponse());
  enqueueBatchActionMock.mockResolvedValue({ status: 'success', data: { batchId: 'batch-1' } });
  getBatchStatusActionMock.mockResolvedValue({
    status: 'success',
    data: batch([entry({ status: 'done' })]),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function elegirYSubir(nombres: readonly string[]): Promise<void> {
  const user = setupUser();
  await user.upload(
    screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID),
    nombres.map((nombre) => pdf(nombre)),
  );
  await user.click(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID));
}

describe('el camino de subida de una tanda', () => {
  it('los bytes del PDF viajan al enlace firmado y no a ninguna Server Action (R5)', async () => {
    const uploads = signedUploads(1);
    issueUploadLinksActionMock.mockResolvedValue({ status: 'success', data: { uploads } });

    render(<DocumentUpload strategy="catalogo" />);
    await elegirYSubir(['uno.pdf']);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(uploads[0]?.uploadUrl);
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBeInstanceOf(File);
    expect((init?.body as File).name).toBe('uno.pdf');

    const argumentos = [
      ...issueUploadLinksActionMock.mock.calls,
      ...enqueueBatchActionMock.mock.calls,
      ...getBatchStatusActionMock.mock.calls,
    ].flat();
    for (const argumento of argumentos) {
      expect(JSON.stringify(argumento) ?? '').not.toContain('%PDF');
      expect(argumento).not.toBeInstanceOf(File);
    }
  });

  it('pide los enlaces de subida con la accion del modulo importada por su ruta exacta (R4)', async () => {
    issueUploadLinksActionMock.mockResolvedValue({
      status: 'success',
      data: { uploads: signedUploads(2) },
    });

    render(<DocumentUpload strategy="catalogo" />);
    await elegirYSubir(['uno.pdf', 'dos.pdf']);

    await waitFor(() => expect(issueUploadLinksActionMock).toHaveBeenCalledTimes(1));
    expect(issueUploadLinksActionMock).toHaveBeenCalledWith({
      files: [
        { fileName: 'uno.pdf', contentType: 'application/pdf' },
        { fileName: 'dos.pdf', contentType: 'application/pdf' },
      ],
    });

    expect(Object.keys(documentosBarrel)).not.toContain('issueUploadLinksAction');
    expect(Object.keys(documentosBarrel)).not.toContain('enqueueBatchAction');
  });

  it('encola la tanda con las rutas devueltas y la estrategia de la prop (R7)', async () => {
    const uploads = signedUploads(3);
    issueUploadLinksActionMock.mockResolvedValue({ status: 'success', data: { uploads } });

    render(<DocumentUpload strategy="formula" />);
    await elegirYSubir(['uno.pdf', 'dos.pdf', 'tres.pdf']);

    await waitFor(() => expect(enqueueBatchActionMock).toHaveBeenCalledTimes(1));
    expect(enqueueBatchActionMock).toHaveBeenCalledWith({
      strategy: 'formula',
      paths: uploads.map((upload) => upload.path),
    });
  });

  it('un archivo cuya subida falla queda senalado y no se encola (R6)', async () => {
    const uploads = signedUploads(2);
    issueUploadLinksActionMock.mockResolvedValue({ status: 'success', data: { uploads } });
    fetchMock.mockImplementation(async (url) =>
      url === uploads[1]?.uploadUrl ? failedResponse() : okResponse(),
    );

    render(<DocumentUpload strategy="catalogo" />);
    await elegirYSubir(['uno.pdf', 'dos.pdf']);

    await waitFor(() => expect(enqueueBatchActionMock).toHaveBeenCalledTimes(1));
    expect(enqueueBatchActionMock).toHaveBeenCalledWith({
      strategy: 'catalogo',
      paths: [uploads[0]?.path],
    });

    expect(await screen.findByTestId(rowPhaseTestId(1))).toHaveAttribute('data-phase', 'failed');
  });

  it('si no sube ningun archivo no se encola nada (R6)', async () => {
    issueUploadLinksActionMock.mockResolvedValue({
      status: 'success',
      data: { uploads: signedUploads(2) },
    });
    fetchMock.mockResolvedValue(failedResponse());

    render(<DocumentUpload strategy="catalogo" />);
    await elegirYSubir(['uno.pdf', 'dos.pdf']);

    await waitFor(() =>
      expect(screen.getByTestId(rowPhaseTestId(0))).toHaveAttribute('data-phase', 'failed'),
    );
    expect(screen.getByTestId(rowPhaseTestId(1))).toHaveAttribute('data-phase', 'failed');
    expect(enqueueBatchActionMock).not.toHaveBeenCalled();
    expect(getBatchStatusActionMock).not.toHaveBeenCalled();
  });
});
