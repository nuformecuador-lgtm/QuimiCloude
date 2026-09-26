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
  DocumentUploadRow,
  rowReviewLinkTestId,
} from '@/components/shared/document-upload';
import type { DocumentFileStatus } from '@/lib/modules/documentos';

import { setupUser } from '../../helpers/user-event';
import { batch, entry, okResponse, pdf, signedUploads } from './helpers';

const fetchMock = vi.fn<() => Promise<Response>>();

const reviewHrefFor = (documentFileId: string) => `/proveedores/prov-1/importar/${documentFileId}`;

afterEach(() => {
  cleanup();
});

describe('la fila ofrece un acceso a revision solo cuando le llega la prop (R1)', () => {
  const NO_LISTOS: readonly DocumentFileStatus[] = ['queued', 'processing', 'error'];

  it.each(NO_LISTOS)('en estado "%s" no aparece el enlace aunque llegue la prop (R1)', (status) => {
    render(
      <DocumentUploadRow
        index={0}
        fileName="uno.pdf"
        phase="uploaded"
        entry={entry({ id: 'archivo-1', status })}
        reviewHrefFor={reviewHrefFor}
      />,
    );

    expect(screen.queryByTestId(rowReviewLinkTestId(0))).toBeNull();
  });

  it('en "listo" y con la prop, el enlace aparece con el href que devuelve la prop (R1)', () => {
    render(
      <DocumentUploadRow
        index={0}
        fileName="uno.pdf"
        phase="uploaded"
        entry={entry({ id: 'archivo-1', status: 'done' })}
        reviewHrefFor={reviewHrefFor}
      />,
    );

    const enlace = screen.getByTestId(rowReviewLinkTestId(0));
    expect(enlace).toHaveAttribute('href', reviewHrefFor('archivo-1'));
  });

  it('en "listo" pero sin la prop, no aparece ningun enlace (R1)', () => {
    render(
      <DocumentUploadRow
        index={0}
        fileName="uno.pdf"
        phase="uploaded"
        entry={entry({ id: 'archivo-1', status: 'done' })}
      />,
    );

    expect(screen.queryByTestId(rowReviewLinkTestId(0))).toBeNull();
  });
});

describe('sin la prop, el componente entero se comporta como antes de que existiera (R2)', () => {
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
    getBatchStatusActionMock.mockResolvedValue({
      status: 'success',
      data: batch([entry({ id: 'archivo-formula', status: 'done' })]),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('con estrategia "formula" y sin reviewHrefFor, un archivo listo no ofrece ningun enlace (R2)', async () => {
    render(<DocumentUpload strategy="formula" />);

    const user = setupUser();
    await user.upload(screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID), [pdf('receta.pdf')]);
    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID));

    await waitFor(() => expect(enqueueBatchActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getBatchStatusActionMock).toHaveBeenCalled());

    expect(screen.queryByTestId(rowReviewLinkTestId(0))).toBeNull();
  });
});
