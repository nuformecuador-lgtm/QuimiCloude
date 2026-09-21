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
  DOCUMENT_UPLOAD_TESTID,
  DocumentUpload,
} from '@/components/shared/document-upload';
import type { PdfStrategy } from '@/lib/modules/documentos';

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
    data: { uploads: signedUploads(2) },
  });
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

describe('la estrategia de una tanda', () => {
  it('el componente exige la estrategia de toda la tanda por prop (R3)', async () => {
    // Tipado con el contrato del modulo: si la prop dejara de ser `PdfStrategy`, esto no compila.
    const strategy: PdfStrategy = 'formula';

    const user = setupUser();
    render(<DocumentUpload strategy={strategy} />);

    const componente = screen.getByTestId(DOCUMENT_UPLOAD_TESTID);
    expect(componente.querySelectorAll('select')).toHaveLength(0);
    expect(componente.querySelectorAll('input[type="radio"]')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);

    await user.upload(screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID), [
      pdf('uno.pdf'),
      pdf('dos.pdf'),
    ]);
    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID));

    await waitFor(() => expect(enqueueBatchActionMock).toHaveBeenCalledTimes(1));

    const [encolado] = enqueueBatchActionMock.mock.calls[0] ?? [];
    expect(encolado).toEqual({
      strategy: 'formula',
      paths: signedUploads(2).map((upload) => upload.path),
    });
  });
});
