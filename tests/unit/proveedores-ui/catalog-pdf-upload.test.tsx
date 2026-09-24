import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EnqueueBatchResult,
  GetBatchStatusResult,
} from '@/lib/modules/documentos/adapters/driving/document-batch-actions';
import type { IssueUploadLinksResult } from '@/lib/modules/documentos/adapters/driving/document-upload-actions';

/**
 * El envoltorio de proveedores sobre la pieza compartida de subida: fija la estrategia de
 * catalogo y el href de revision de ESTE proveedor.
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

import { CatalogPdfUpload } from '@/app/(private)/proveedores/[id]/components';
import {
  DOCUMENT_UPLOAD_INPUT_TESTID,
  DOCUMENT_UPLOAD_SUBMIT_TESTID,
  rowReviewLinkTestId,
} from '@/components/shared/document-upload';
import { supplierCatalogImportRoute } from '@/lib/shared/routes';

import { setupUser } from '../../helpers/user-event';
import { batch, entry, okResponse, pdf, signedUploads } from '../documentos-ui/helpers';

const PROVEEDOR_ID = '11111111-1111-4111-8111-111111111111';
const ARCHIVO_ID = '22222222-2222-4222-8222-222222222222';

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
  getBatchStatusActionMock.mockResolvedValue({
    status: 'success',
    data: batch([
      entry({ id: ARCHIVO_ID, path: signedUploads(1)[0]?.path, status: 'done' }),
    ]),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function elegirYSubir(): Promise<void> {
  const user = setupUser();
  await user.upload(screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID), [pdf('catalogo.pdf')]);
  await user.click(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID));
}

describe('el envoltorio de subida de catalogo del proveedor', () => {
  it('encola con la estrategia "catalogo" (R1, R2)', async () => {
    render(<CatalogPdfUpload supplierId={PROVEEDOR_ID} />);

    await elegirYSubir();

    await waitFor(() => expect(enqueueBatchActionMock).toHaveBeenCalledTimes(1));
    const [encolado] = enqueueBatchActionMock.mock.calls[0] ?? [];
    expect(encolado).toMatchObject({ strategy: 'catalogo' });
  });

  it('cuando el archivo queda "listo", el enlace de revision apunta a la ruta de ESTE proveedor y ESTE archivo (R1)', async () => {
    render(<CatalogPdfUpload supplierId={PROVEEDOR_ID} />);

    await elegirYSubir();

    const enlace = await screen.findByTestId(rowReviewLinkTestId(0));
    expect(enlace).toHaveAttribute('href', supplierCatalogImportRoute(PROVEEDOR_ID, ARCHIVO_ID));
  });
});
