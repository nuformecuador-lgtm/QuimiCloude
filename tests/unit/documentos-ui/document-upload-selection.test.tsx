import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IssueUploadLinksResult } from '@/lib/modules/documentos/adapters/driving/document-upload-actions';

const { issueUploadLinksActionMock, enqueueBatchActionMock, getBatchStatusActionMock } = vi.hoisted(
  () => ({
    issueUploadLinksActionMock: vi.fn<(input: unknown) => Promise<IssueUploadLinksResult>>(),
    enqueueBatchActionMock: vi.fn(),
    getBatchStatusActionMock: vi.fn(),
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
  DOCUMENT_UPLOAD_SELECTION_ERROR_TESTID,
  DOCUMENT_UPLOAD_SUBMIT_TESTID,
  DocumentUpload,
  rowTestId,
} from '@/components/shared/document-upload';
import { MAX_FILES_PER_BATCH } from '@/lib/modules/documentos';

import { setupUser } from '../../helpers/user-event';
import { batch, entry, pdf, signedUploads } from './helpers';

const fetchMock = vi.fn<() => Promise<Response>>();

beforeEach(() => {
  issueUploadLinksActionMock.mockReset();
  enqueueBatchActionMock.mockReset();
  getBatchStatusActionMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function nombres(cantidad: number): readonly string[] {
  return Array.from({ length: cantidad }, (_, index) => `archivo-${index}.pdf`);
}

describe('la seleccion de archivos de una tanda', () => {
  it('la seleccion admite hasta el tope de archivos que publica el modulo (R1)', async () => {
    const user = setupUser();
    render(<DocumentUpload strategy="catalogo" />);

    await user.upload(
      screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID),
      nombres(MAX_FILES_PER_BATCH).map((nombre) => pdf(nombre)),
    );

    expect(screen.getByTestId(rowTestId(MAX_FILES_PER_BATCH - 1))).toBeVisible();
    expect(screen.queryByTestId(rowTestId(MAX_FILES_PER_BATCH))).toBeNull();
    expect(screen.queryByTestId(DOCUMENT_UPLOAD_SELECTION_ERROR_TESTID)).toBeNull();
    expect(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID)).toBeEnabled();
  });

  it('una seleccion por encima del tope se rechaza entera y no llama a ninguna accion (R1)', async () => {
    // Dobles que REVIENTAN: contar llamadas dejaria pasar el dia en que se invoquen desde otro sitio.
    issueUploadLinksActionMock.mockImplementation(() => {
      throw new Error('la accion de enlaces no debe invocarse con una seleccion rechazada');
    });
    enqueueBatchActionMock.mockImplementation(() => {
      throw new Error('la accion de encolado no debe invocarse con una seleccion rechazada');
    });

    const user = setupUser();
    render(<DocumentUpload strategy="catalogo" />);

    await user.upload(
      screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID),
      nombres(MAX_FILES_PER_BATCH + 1).map((nombre) => pdf(nombre)),
    );

    expect(screen.getByTestId(DOCUMENT_UPLOAD_SELECTION_ERROR_TESTID)).toBeVisible();
    expect(screen.queryByTestId(rowTestId(0))).toBeNull();
    expect(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID)).toBeDisabled();
    expect(issueUploadLinksActionMock).not.toHaveBeenCalled();
    expect(enqueueBatchActionMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('la seleccion se restringe a PDF (R2)', async () => {
    issueUploadLinksActionMock.mockResolvedValue({
      status: 'success',
      data: { uploads: signedUploads(1) },
    });
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);
    enqueueBatchActionMock.mockResolvedValue({ status: 'success', data: { batchId: 'batch-1' } });
    getBatchStatusActionMock.mockResolvedValue({
      status: 'success',
      data: batch([entry({ path: signedUploads(1)[0]?.path, status: 'done' })]),
    });

    const user = setupUser();
    render(<DocumentUpload strategy="catalogo" />);

    const input = screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID);
    expect(input).toHaveAttribute('accept', 'application/pdf');
    expect(input).toHaveAttribute('multiple');

    await user.upload(input, [
      pdf('catalogo.pdf'),
      new File(['no soy un pdf'], 'nota.txt', { type: 'text/plain' }),
    ]);

    expect(screen.getByTestId(rowTestId(0))).toHaveTextContent('catalogo.pdf');
    expect(screen.queryByTestId(rowTestId(1))).toBeNull();

    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID));

    await waitFor(() => expect(issueUploadLinksActionMock).toHaveBeenCalledTimes(1));
    expect(issueUploadLinksActionMock).toHaveBeenCalledWith({
      files: [{ fileName: 'catalogo.pdf', contentType: 'application/pdf' }],
    });
  });
});
