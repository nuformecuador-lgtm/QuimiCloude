import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
  DOCUMENT_UPLOAD_CLEAR_TESTID,
  DOCUMENT_UPLOAD_INPUT_TESTID,
  DOCUMENT_UPLOAD_RESUME_TESTID,
  DOCUMENT_UPLOAD_SUBMIT_TESTID,
  DOCUMENT_UPLOAD_TESTID,
  DOCUMENT_UPLOAD_TRIGGER_TESTID,
  DocumentUpload,
} from '@/components/shared/document-upload';
import { errorMessage } from '@/lib/modules/errores';

import { setupUser } from '../../helpers/user-event';
import { okResponse, pdf, signedUploads } from './helpers';

/** Las dos clases que, en este repo, SON el objetivo tactil de 44x44. */
function esObjetivoTactil(elemento: Element): boolean {
  return elemento.className.includes('min-h-11') && elemento.className.includes('min-w-11');
}

/** `text-base` es la clase de Tailwind que da los 16 px que evitan el zoom de iOS al enfocar. */
function tieneTipografiaDe16(elemento: Element): boolean {
  return elemento.className.includes('text-base');
}

const CARPETA_DEL_COMPONENTE = join(__dirname, '..', '..', '..', 'components', 'shared', 'document-upload');

function fuentesDelComponente(): readonly string[] {
  return readdirSync(CARPETA_DEL_COMPONENTE)
    .filter((archivo) => archivo.endsWith('.ts') || archivo.endsWith('.tsx'))
    .map((archivo) => readFileSync(join(CARPETA_DEL_COMPONENTE, archivo), 'utf8'));
}

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
    status: 'error',
    code: 'unexpected',
    message: errorMessage('unexpected'),
    reference: 'req-1',
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('la subida en movil', () => {
  it('la subida se puede activar sin hover y con objetivos tactiles de 44px (R21)', async () => {
    const user = setupUser();
    render(<DocumentUpload strategy="catalogo" />);

    const disparador = screen.getByTestId(DOCUMENT_UPLOAD_TRIGGER_TESTID);
    const entrada = screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID);

    // El disparador es un `label` atado al `input` por id: un toque basta, sin puntero.
    expect(disparador.tagName).toBe('LABEL');
    expect(disparador.getAttribute('for')).toBe(entrada.getAttribute('id'));
    expect(disparador).not.toHaveAttribute('title');
    expect(esObjetivoTactil(disparador)).toBe(true);
    expect(tieneTipografiaDe16(disparador)).toBe(true);

    // El control de entrada, que es el que iOS ampliaria si midiera menos de 16 px.
    expect(tieneTipografiaDe16(entrada)).toBe(true);

    expect(esObjetivoTactil(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID))).toBe(true);

    await user.upload(entrada, [pdf('uno.pdf')]);
    expect(esObjetivoTactil(screen.getByTestId(DOCUMENT_UPLOAD_CLEAR_TESTID))).toBe(true);

    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID));

    const reanudar = await screen.findByTestId(DOCUMENT_UPLOAD_RESUME_TESTID);
    expect(esObjetivoTactil(reanudar)).toBe(true);

    // Nada del arbol se descubre ni se activa con el puntero: sin `:hover` no queda nada oculto.
    const componente = screen.getByTestId(DOCUMENT_UPLOAD_TESTID);
    for (const elemento of componente.querySelectorAll('*')) {
      expect(elemento.getAttribute('class') ?? '').not.toMatch(
        /group-hover:(opacity|visible|flex|block|inline)|hover:(opacity|visible)/,
      );
      expect(elemento).not.toHaveAttribute('title');
    }

    await waitFor(() => expect(getBatchStatusActionMock).toHaveBeenCalled());
  });

  it('ninguna parte del componente mide la pantalla con 100vh (R21)', () => {
    render(<DocumentUpload strategy="catalogo" />);

    const componente = screen.getByTestId(DOCUMENT_UPLOAD_TESTID);
    for (const elemento of [componente, ...componente.querySelectorAll('*')]) {
      expect(elemento.getAttribute('class') ?? '').not.toMatch(/100vh|h-screen/);
    }

    // Y tampoco en la fuente: una clase que solo aparece en un estado que este render no alcanza
    // seguiria siendo `100vh` en produccion.
    for (const fuente of fuentesDelComponente()) {
      expect(fuente).not.toMatch(/100vh|h-screen/);
    }
  });
});
