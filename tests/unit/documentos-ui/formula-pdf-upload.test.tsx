import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EnqueueBatchResult,
  GetBatchStatusResult,
} from '@/lib/modules/documentos/adapters/driving/document-batch-actions';
import type { IssueUploadLinksResult } from '@/lib/modules/documentos/adapters/driving/document-upload-actions';
import type { DocumentFileStatus } from '@/lib/modules/documentos';

/**
 * El envoltorio de fórmulas sobre la pieza compartida de subida: fija la estrategia `formula` y
 * el href de revisión de CADA archivo, con `formulaImportRoute`.
 */

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

import { FormulaPdfUpload } from '@/app/(private)/produccion/formulas/components';
import {
  DOCUMENT_UPLOAD_INPUT_TESTID,
  DOCUMENT_UPLOAD_OPEN_TESTID,
  DOCUMENT_UPLOAD_SUBMIT_TESTID,
  rowReviewLinkTestId,
} from '@/components/shared/document-upload';
import { formulaImportRoute } from '@/lib/shared/routes';

import { setupUser } from '../../helpers/user-event';
import { batch, entry, okResponse, pdf, signedUploads } from './helpers';

const ARCHIVO_ID = '22222222-2222-4222-8222-222222222222';

const fetchMock = vi.fn<() => Promise<Response>>();

function tandaDeFormula(status: DocumentFileStatus) {
  return { ...batch([entry({ id: ARCHIVO_ID, path: signedUploads(1)[0]?.path, status })]), strategy: 'formula' as const };
}

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

async function elegirYSubir(): Promise<void> {
  const user = setupUser();
  await user.click(screen.getByTestId(DOCUMENT_UPLOAD_OPEN_TESTID));
  await user.upload(screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID), [pdf('formula.pdf')]);
  await user.click(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID));
}

describe('el envoltorio de subida de formulas', () => {
  it('encola con la estrategia "formula" (R1)', async () => {
    getBatchStatusActionMock.mockResolvedValue({ status: 'success', data: tandaDeFormula('processing') });

    render(<FormulaPdfUpload />);

    await elegirYSubir();

    await waitFor(() => expect(enqueueBatchActionMock).toHaveBeenCalledTimes(1));
    const [encolado] = enqueueBatchActionMock.mock.calls[0] ?? [];
    expect(encolado).toMatchObject({ strategy: 'formula' });
  });

  it('en "listo" la fila ofrece el enlace a formulaImportRoute(id) (R1)', async () => {
    getBatchStatusActionMock.mockResolvedValue({ status: 'success', data: tandaDeFormula('done') });

    render(<FormulaPdfUpload />);

    await elegirYSubir();

    const enlace = await screen.findByTestId(rowReviewLinkTestId(0));
    expect(enlace).toBeVisible();
    expect(enlace).toHaveAttribute('href', formulaImportRoute(ARCHIVO_ID));
  });

  it.each<DocumentFileStatus>(['processing', 'error', 'queued'])(
    'en estado "%s" la fila no ofrece ningun enlace (R1)',
    async (status) => {
      getBatchStatusActionMock.mockResolvedValue({ status: 'success', data: tandaDeFormula(status) });

      render(<FormulaPdfUpload />);

      await elegirYSubir();

      await waitFor(() => expect(getBatchStatusActionMock).toHaveBeenCalled());
      expect(screen.queryByTestId(rowReviewLinkTestId(0))).toBeNull();
    },
  );
});
