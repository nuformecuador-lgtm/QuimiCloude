import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  DOCUMENT_UPLOAD_CLOSE_TESTID,
  DOCUMENT_UPLOAD_DIALOG_TESTID,
  DOCUMENT_UPLOAD_ERROR_TESTID,
  DOCUMENT_UPLOAD_INPUT_TESTID,
  DOCUMENT_UPLOAD_OPEN_TESTID,
  DOCUMENT_UPLOAD_SUBMIT_TESTID,
  DOCUMENT_UPLOAD_TESTID,
  DocumentUploadDialog,
  rowNameTestId,
  rowPhaseTestId,
  rowReviewLinkTestId,
  rowStatusTestId,
} from '@/components/shared/document-upload';
import { MAX_FILES_PER_BATCH } from '@/lib/modules/documentos';
import { errorMessage } from '@/lib/modules/errores';

import { setupUser } from '../../helpers/user-event';
import { batch, entry, okResponse, pdf, signedUploads } from './helpers';

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

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
    data: batch([entry({ path: signedUploads(1)[0]?.path, status: 'processing' })]),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function abrir(user: ReturnType<typeof setupUser>): Promise<HTMLElement> {
  await user.click(screen.getByTestId(DOCUMENT_UPLOAD_OPEN_TESTID));
  return screen.getByTestId(DOCUMENT_UPLOAD_DIALOG_TESTID);
}

describe('cerrado, la subida no esta visible y el boton si (R1)', () => {
  it('con la ventana cerrada solo el boton es visible', () => {
    render(<DocumentUploadDialog strategy="catalogo" />);

    expect(screen.getByTestId(DOCUMENT_UPLOAD_OPEN_TESTID)).toBeVisible();
    expect(screen.getByTestId(DOCUMENT_UPLOAD_DIALOG_TESTID)).not.toBeVisible();
  });
});

describe('pulsar abre un dialogo accesible con la subida dentro (R2)', () => {
  it('el popup tiene role dialog, nombre accesible y el componente de subida dentro', async () => {
    const user = setupUser();
    render(<DocumentUploadDialog strategy="catalogo" />);

    await abrir(user);

    const dialogo = screen.getByRole('dialog', { name: 'Subir PDFs' });
    expect(dialogo).toBeVisible();
    expect(within(dialogo).getByTestId(DOCUMENT_UPLOAD_TESTID)).toBeInTheDocument();
  });
});

describe('cerrar con el boton propio y con Escape oculta la ventana y devuelve el foco (R3, R4)', () => {
  it('el boton document-upload-close cierra y devuelve el foco al disparador', async () => {
    const user = setupUser();
    render(<DocumentUploadDialog strategy="catalogo" />);

    await abrir(user);
    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_CLOSE_TESTID));

    await waitFor(() =>
      expect(screen.getByTestId(DOCUMENT_UPLOAD_DIALOG_TESTID)).not.toBeVisible(),
    );
    await waitFor(() => expect(screen.getByTestId(DOCUMENT_UPLOAD_OPEN_TESTID)).toHaveFocus());
  });

  it('Escape cierra y devuelve el foco al disparador', async () => {
    const user = setupUser();
    render(<DocumentUploadDialog strategy="catalogo" />);

    await abrir(user);
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.getByTestId(DOCUMENT_UPLOAD_DIALOG_TESTID)).not.toBeVisible(),
    );
    await waitFor(() => expect(screen.getByTestId(DOCUMENT_UPLOAD_OPEN_TESTID)).toHaveFocus());
  });
});

describe('la seleccion dentro de la ventana respeta el tope de la tanda (R8)', () => {
  it('el input acepta solo PDF y rechaza mas archivos que el tope', async () => {
    const user = setupUser();
    render(<DocumentUploadDialog strategy="catalogo" />);

    await abrir(user);

    const entrada = screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID);
    expect(entrada).toHaveAttribute('accept', 'application/pdf');

    const demasiados = Array.from({ length: MAX_FILES_PER_BATCH + 1 }, (_, index) =>
      pdf(`archivo-${index}.pdf`),
    );
    await user.upload(entrada, demasiados);

    const aviso = await screen.findByTestId('document-upload-selection-error');
    expect(aviso.textContent).toContain(`${MAX_FILES_PER_BATCH}`);
    expect(issueUploadLinksActionMock).not.toHaveBeenCalled();
  });
});

describe('sin permiso, la accion falla con unauthorized y no encola nada (R13)', () => {
  it('muestra el error con data-code unauthorized y no llama a enqueueBatchAction', async () => {
    issueUploadLinksActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });

    const user = setupUser();
    render(<DocumentUploadDialog strategy="catalogo" />);

    await abrir(user);
    await user.upload(screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID), [pdf('uno.pdf')]);
    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID));

    const aviso = await screen.findByTestId(DOCUMENT_UPLOAD_ERROR_TESTID);
    expect(aviso).toHaveAttribute('data-code', 'unauthorized');
    expect(enqueueBatchActionMock).not.toHaveBeenCalled();
  });
});

describe('los objetivos tactiles y el tamano de la ventana (R15)', () => {
  it('el boton de abrir y el de cerrar miden al menos 44x44, y el popup limita su alto con scroll', async () => {
    const user = setupUser();
    render(<DocumentUploadDialog strategy="catalogo" />);

    expect(screen.getByTestId(DOCUMENT_UPLOAD_OPEN_TESTID).className).toMatch(/min-h-11/);
    expect(screen.getByTestId(DOCUMENT_UPLOAD_OPEN_TESTID).className).toMatch(/min-w-11/);

    await abrir(user);

    expect(screen.getByTestId(DOCUMENT_UPLOAD_CLOSE_TESTID).className).toMatch(/min-h-11/);
    expect(screen.getByTestId(DOCUMENT_UPLOAD_CLOSE_TESTID).className).toMatch(/min-w-11/);
    expect(screen.getByTestId(DOCUMENT_UPLOAD_DIALOG_TESTID).className).toMatch(
      /max-h-\[85dvh\]/,
    );
    expect(screen.getByTestId(DOCUMENT_UPLOAD_DIALOG_TESTID).className).toMatch(/overflow-y-auto/);
  });
});

describe('cerrar y reabrir a mitad de tanda conserva las filas, sus fases y su estado (R21)', () => {
  it('sin dialogo de confirmacion al cerrar, y el sondeo sigue con la ventana cerrada', async () => {
    const user = setupUser();
    render(<DocumentUploadDialog strategy="catalogo" />);

    const popup = await abrir(user);
    expect(popup).toBeVisible();

    await user.upload(screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID), [pdf('uno.pdf')]);
    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID));

    await waitFor(() =>
      expect(screen.getByTestId(rowStatusTestId(0))).toHaveAttribute('data-status', 'processing'),
    );
    expect(screen.getByTestId(rowNameTestId(0))).toHaveTextContent('uno.pdf');

    const llamadasAntesDeCerrar = getBatchStatusActionMock.mock.calls.length;

    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_CLOSE_TESTID));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByText(/seguro|confirmar|descartar/i)).toBeNull();
    expect(screen.getByTestId(DOCUMENT_UPLOAD_DIALOG_TESTID)).not.toBeVisible();

    // El sondeo, como en `use-batch-status.test.tsx`: sigue vivo pasado de sobra un intervalo,
    // con la ventana cerrada.
    await new Promise((resolve) => setTimeout(resolve, BATCH_STATUS_POLL_INTERVAL_MS + 400));
    expect(getBatchStatusActionMock.mock.calls.length).toBeGreaterThan(llamadasAntesDeCerrar);

    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_OPEN_TESTID));

    expect(screen.getByTestId(DOCUMENT_UPLOAD_DIALOG_TESTID)).toBeVisible();
    expect(screen.getByTestId(rowNameTestId(0))).toBeVisible();
    expect(screen.getByTestId(rowNameTestId(0))).toHaveTextContent('uno.pdf');
    expect(screen.getByTestId(rowStatusTestId(0))).toHaveAttribute('data-status', 'processing');
  });

  it('con archivos elegidos antes de subir, cerrar y reabrir conserva la fila y su fase', async () => {
    const user = setupUser();
    render(<DocumentUploadDialog strategy="catalogo" />);

    const popup = await abrir(user);
    expect(popup).toBeVisible();

    await user.upload(screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID), [pdf('dos.pdf')]);

    expect(screen.getByTestId(rowNameTestId(0))).toHaveTextContent('dos.pdf');
    expect(screen.getByTestId(rowPhaseTestId(0))).toHaveAttribute('data-phase', 'pending');
    expect(issueUploadLinksActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_CLOSE_TESTID));

    expect(screen.getByTestId(DOCUMENT_UPLOAD_DIALOG_TESTID)).not.toBeVisible();

    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_OPEN_TESTID));

    expect(screen.getByTestId(DOCUMENT_UPLOAD_DIALOG_TESTID)).toBeVisible();
    expect(screen.getByTestId(rowNameTestId(0))).toBeVisible();
    expect(screen.getByTestId(rowNameTestId(0))).toHaveTextContent('dos.pdf');
    expect(screen.getByTestId(rowPhaseTestId(0))).toHaveAttribute('data-phase', 'pending');
  });
});

describe('con reviewHrefFor, una fila lista muestra el enlace de revision dentro de la ventana', () => {
  it('el enlace Revisar aparece con el href que devuelve la prop', async () => {
    getBatchStatusActionMock.mockResolvedValue({
      status: 'success',
      data: batch([
        entry({ id: 'archivo-1', path: signedUploads(1)[0]?.path, status: 'done' }),
      ]),
    });

    const reviewHrefFor = (documentFileId: string) => `/proveedores/prov-1/importar/${documentFileId}`;

    const user = setupUser();
    render(<DocumentUploadDialog strategy="catalogo" reviewHrefFor={reviewHrefFor} />);

    await abrir(user);
    await user.upload(screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID), [pdf('uno.pdf')]);
    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID));

    const enlace = await screen.findByTestId(rowReviewLinkTestId(0));
    expect(enlace).toHaveAttribute('href', reviewHrefFor('archivo-1'));
  });
});

describe('el boton dice «Subir PDFs» (R22)', () => {
  it('el disparador muestra el texto Subir PDFs', () => {
    render(<DocumentUploadDialog strategy="catalogo" />);
    expect(screen.getByTestId(DOCUMENT_UPLOAD_OPEN_TESTID)).toHaveTextContent('Subir PDFs');
  });
});
