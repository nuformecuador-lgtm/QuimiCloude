import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CONFIRM_BUTTON_TESTID,
  ERROR_FILE_BUTTON_TESTID,
  EXAMPLE_ROW_NOTICE_TESTID,
  ImportPreviewSummary,
  ImportPreviewTable,
  NO_VALID_ROWS_TESTID,
  PREVIEW_DETAIL_ADD_EXISTING,
  ROW_DETAIL_TESTID,
  ROW_ISSUE_TESTID,
  ROW_STATUS_TESTID,
  duplicateLotDetail,
  previewDetailAddFileRow,
  statusFilterTestId,
  totalTestId,
} from '@/app/(private)/inventario/importar/components';

import { setupUser } from '../../../helpers/user-event';
import { FILAS_VISTA_PREVIA, vistaPrevia, vistaPreviaSinValidas } from './import-preview-fixtures';

afterEach(() => {
  cleanup();
});

function fila(rowNumber: number): HTMLElement {
  return screen.getByTestId(`data-table-row-${rowNumber}`);
}

function filasVisibles(): number[] {
  return screen
    .queryAllByTestId(/^data-table-row-\d+$/)
    .map((elemento) => Number(elemento.getAttribute('data-testid')?.replace('data-table-row-', '')));
}

function renderResumen(preview = vistaPrevia(), confirming = false) {
  const onConfirm = vi.fn<() => void>();
  const onDownloadErrors = vi.fn<() => void>();
  render(
    <ImportPreviewSummary
      preview={preview}
      confirming={confirming}
      onConfirm={onConfirm}
      onDownloadErrors={onDownloadErrors}
    />,
  );
  return { onConfirm, onDownloadErrors };
}

describe('resumen de la vista previa', () => {
  it('R9 pinta el total de filas y el de cada estado', () => {
    const preview = vistaPrevia();
    renderResumen(preview);

    expect(screen.getByTestId(totalTestId('rows'))).toHaveTextContent(String(preview.totals.rows));
    expect(screen.getByTestId(totalTestId('create'))).toHaveTextContent(String(preview.totals.create));
    expect(screen.getByTestId(totalTestId('addBatch'))).toHaveTextContent(String(preview.totals.addBatch));
    expect(screen.getByTestId(totalTestId('duplicate'))).toHaveTextContent(String(preview.totals.duplicate));
    expect(screen.getByTestId(totalTestId('error'))).toHaveTextContent(String(preview.totals.error));
  });

  it('R8 avisa de que la fila de ejemplo se ignoró solo cuando vino', () => {
    renderResumen(vistaPrevia({ exampleRowIgnored: true }));
    expect(screen.getByTestId(EXAMPLE_ROW_NOTICE_TESTID)).toHaveAttribute('role', 'status');
    cleanup();

    renderResumen(vistaPrevia({ exampleRowIgnored: false }));
    expect(screen.queryByTestId(EXAMPLE_ROW_NOTICE_TESTID)).toBeNull();
  });

  it('R24 «Confirmar» sigue disponible con filas en error y faltantes sin crear', async () => {
    const user = setupUser();
    const { onConfirm } = renderResumen(vistaPrevia());

    const confirmar = screen.getByTestId(CONFIRM_BUTTON_TESTID);
    expect(confirmar).toBeEnabled();
    await user.click(confirmar);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId(NO_VALID_ROWS_TESTID)).toBeNull();
  });

  it('R24 «Confirmar» queda deshabilitado sin ninguna fila válida', () => {
    renderResumen(vistaPreviaSinValidas());

    expect(screen.getByTestId(CONFIRM_BUTTON_TESTID)).toBeDisabled();
    expect(screen.getByTestId(NO_VALID_ROWS_TESTID)).toBeInTheDocument();
  });

  it('R24 mientras se confirma el botón está ocupado y no se puede pulsar otra vez', () => {
    renderResumen(vistaPrevia(), true);

    const confirmar = screen.getByTestId(CONFIRM_BUTTON_TESTID);
    expect(confirmar).toBeDisabled();
    expect(confirmar).toHaveAttribute('aria-busy', 'true');
  });

  it('R28 ofrece el archivo de errores solo si hay filas en error', async () => {
    const user = setupUser();
    const { onDownloadErrors } = renderResumen(vistaPrevia());

    await user.click(screen.getByTestId(ERROR_FILE_BUTTON_TESTID));
    expect(onDownloadErrors).toHaveBeenCalledTimes(1);
    cleanup();

    renderResumen(vistaPrevia({ rows: FILAS_VISTA_PREVIA.filter((f) => f.status !== 'error') }));
    expect(screen.queryByTestId(ERROR_FILE_BUTTON_TESTID)).toBeNull();
  });
});

describe('tabla de la vista previa', () => {
  it('R9 pinta cada fila con su número de fila en el orden del archivo', () => {
    render(<ImportPreviewTable rows={FILAS_VISTA_PREVIA} />);

    expect(filasVisibles()).toEqual(FILAS_VISTA_PREVIA.map((f) => f.rowNumber));
  });

  it('R9 los cuatro estados se distinguen sin color: texto propio e icono', () => {
    render(<ImportPreviewTable rows={FILAS_VISTA_PREVIA} />);

    const porEstado = new Map<string, string>();
    for (const f of FILAS_VISTA_PREVIA) {
      const estado = within(fila(f.rowNumber)).getByTestId(ROW_STATUS_TESTID);
      expect(estado).toHaveAttribute('data-status', f.status);
      expect(estado.querySelector('svg')).not.toBeNull();
      porEstado.set(f.status, estado.textContent ?? '');
    }

    expect(porEstado.size).toBe(4);
    expect(new Set(porEstado.values()).size).toBe(4);
    for (const texto of porEstado.values()) expect(texto.trim()).not.toBe('');
  });

  it('R10 una fila en error lista cada motivo con la columna a la que apunta', () => {
    render(<ImportPreviewTable rows={FILAS_VISTA_PREVIA} />);

    const motivos = within(fila(7)).getAllByTestId(ROW_ISSUE_TESTID);
    expect(motivos.map((m) => m.getAttribute('data-column'))).toEqual(['unit', 'stock']);
    expect(motivos.map((m) => m.textContent)).toEqual([
      'Unidad: «Galón» no existe.',
      'Existencia: «4,5,1» no es un número.',
    ]);
  });

  it('R20 la fila que nombra una presentación inexistente queda en error con ese motivo', () => {
    render(<ImportPreviewTable rows={FILAS_VISTA_PREVIA} />);

    const motivo = within(fila(8)).getByTestId(ROW_ISSUE_TESTID);
    expect(motivo).toHaveAttribute('data-code', 'presentation_not_found');
    expect(motivo).toHaveAttribute('data-column', 'presentation');
  });

  it('R14 R15 «sumar lote» dice si es sobre un producto existente o sobre el de la fila N', () => {
    render(<ImportPreviewTable rows={FILAS_VISTA_PREVIA} />);

    expect(within(fila(4)).getByTestId(ROW_DETAIL_TESTID)).toHaveTextContent(PREVIEW_DETAIL_ADD_EXISTING);
    expect(within(fila(6)).getByTestId(ROW_DETAIL_TESTID)).toHaveTextContent(previewDetailAddFileRow(3));
  });

  it('R18 la fila duplicada nombra el lote que ya existe', () => {
    render(<ImportPreviewTable rows={FILAS_VISTA_PREVIA} />);

    expect(within(fila(5)).getByTestId(ROW_DETAIL_TESTID)).toHaveTextContent(duplicateLotDetail('BA-01'));
  });

  it('R9 el filtro por estado deja solo las filas de ese estado y se puede quitar', async () => {
    const user = setupUser();
    render(<ImportPreviewTable rows={FILAS_VISTA_PREVIA} />);

    const error = screen.getByTestId(statusFilterTestId('error'));
    expect(error).toHaveAttribute('aria-pressed', 'false');
    await user.click(error);

    expect(error).toHaveAttribute('aria-pressed', 'true');
    expect(filasVisibles()).toEqual([7, 8]);

    await user.click(screen.getByTestId(statusFilterTestId('add_batch')));
    expect(filasVisibles()).toEqual([4, 6]);

    await user.click(screen.getByTestId(statusFilterTestId('all')));
    expect(filasVisibles()).toEqual(FILAS_VISTA_PREVIA.map((f) => f.rowNumber));
  });

  it('cada opción del filtro dice cuántas filas tiene', () => {
    render(<ImportPreviewTable rows={FILAS_VISTA_PREVIA} />);

    expect(screen.getByTestId(statusFilterTestId('error'))).toHaveTextContent('(2)');
    expect(screen.getByTestId(statusFilterTestId('duplicate'))).toHaveTextContent('(1)');
    expect(screen.getByTestId(statusFilterTestId('all'))).toHaveTextContent(`(${FILAS_VISTA_PREVIA.length})`);
  });

  it('pagina en el cliente sin perder filas: la tabla nunca pinta más de una página', () => {
    const muchas = Array.from({ length: 23 }, (_, indice) => ({
      ...FILAS_VISTA_PREVIA[0]!,
      rowNumber: indice + 2,
    }));
    render(<ImportPreviewTable rows={muchas} />);

    const visibles = filasVisibles();
    expect(visibles.length).toBeGreaterThan(0);
    expect(visibles.length).toBeLessThan(muchas.length);
    expect(visibles[0]).toBe(2);
  });
});
