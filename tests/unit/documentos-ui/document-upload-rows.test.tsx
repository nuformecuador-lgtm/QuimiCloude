import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// El barril arrastra el componente y, con el, las Server Actions: dobles para no montar el servidor.
vi.mock('@/lib/modules/documentos/adapters/driving/document-upload-actions', () => ({
  issueUploadLinksAction: vi.fn(),
}));
vi.mock('@/lib/modules/documentos/adapters/driving/document-batch-actions', () => ({
  enqueueBatchAction: vi.fn(),
  getBatchStatusAction: vi.fn(),
}));

import {
  BROWSER_PHASE_LABELS,
  DocumentUploadRow,
  FILE_STATUS_LABELS,
  rowErrorTestId,
  rowPhaseTestId,
  rowStatusTestId,
  rowTestId,
} from '@/components/shared/document-upload';
import type { DocumentFileStatus } from '@/lib/modules/documentos';

import { entry } from './helpers';

afterEach(() => {
  cleanup();
});

const LOS_CUATRO: readonly DocumentFileStatus[] = ['queued', 'processing', 'done', 'error'];

describe('la fila de un archivo', () => {
  it('la fila pinta solo los cuatro estados que publica el modulo (R11)', () => {
    for (const status of LOS_CUATRO) {
      render(
        <DocumentUploadRow index={0} fileName="uno.pdf" phase="uploaded" entry={entry({ status })} />,
      );

      const pintado = screen.getByTestId(rowStatusTestId(0));
      expect(pintado).toHaveAttribute('data-status', status);
      expect(pintado).toHaveTextContent(FILE_STATUS_LABELS[status]);
      expect(screen.queryByTestId(rowPhaseTestId(0))).toBeNull();
      expect(screen.getAllByTestId(rowStatusTestId(0))).toHaveLength(1);

      cleanup();
    }
  });

  it('mientras el archivo sube, la fila no muestra ningun estado del modulo (R6)', () => {
    render(<DocumentUploadRow index={0} fileName="uno.pdf" phase="uploading" entry={null} />);

    const fase = screen.getByTestId(rowPhaseTestId(0));
    expect(fase).toHaveAttribute('data-phase', 'uploading');
    expect(fase).toHaveTextContent(BROWSER_PHASE_LABELS.uploading);
    expect(screen.queryByTestId(rowStatusTestId(0))).toBeNull();

    const fila = screen.getByTestId(rowTestId(0));
    for (const status of LOS_CUATRO) {
      expect(fila.textContent ?? '').not.toContain(FILE_STATUS_LABELS[status]);
    }
  });

  it('un archivo listo no muestra el texto extraido (R13)', () => {
    const extractedText = 'ACIDO CITRICO 25 KG - precio 12,50';
    render(
      <DocumentUploadRow
        index={0}
        fileName="uno.pdf"
        phase="uploaded"
        entry={entry({ status: 'done', extractedText })}
      />,
    );

    const fila = screen.getByTestId(rowTestId(0));
    expect(fila).toHaveTextContent(FILE_STATUS_LABELS.done);
    expect(fila.textContent ?? '').not.toContain(extractedText);
    expect(screen.queryByText(extractedText)).toBeNull();
    expect(screen.queryByTestId(rowErrorTestId(0))).toBeNull();
  });
});
