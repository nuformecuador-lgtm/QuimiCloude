import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ImportFileRejection,
  ImportTemplateButton,
  ImportUploadField,
  REJECTION_COLUMN_TESTID,
  REJECTION_MESSAGE_TESTID,
  REJECTION_TESTID,
  TEMPLATE_BUTTON_TESTID,
  UPLOAD_FILE_NAME_TESTID,
  UPLOAD_INPUT_TESTID,
  UPLOAD_TOO_LARGE_TESTID,
  UPLOAD_TRIGGER_TESTID,
  formatBytes,
  formatCount,
} from '@/app/(private)/inventario/importar/components';
import {
  INVENTORY_IMPORT_ACCEPT,
  INVENTORY_IMPORT_MAX_FILE_BYTES,
  INVENTORY_IMPORT_MAX_ROWS,
  buildInventoryImportTemplate,
  type ImportDownload,
  type ImportFileRejection as Rejection,
} from '@/lib/modules/inventario';

import { setupUser } from '../../../helpers/user-event';

const { downloadFileMock } = vi.hoisted(() => ({
  downloadFileMock: vi.fn<(download: ImportDownload) => void>(),
}));

vi.mock('@/app/(private)/inventario/importar/components/download-file', () => ({
  downloadFile: downloadFileMock,
}));

function archivo(nombre: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], nombre, { type: 'text/csv' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('campo de subida', () => {
  it('R4 el input acepta solo las extensiones del contrato', () => {
    render(<ImportUploadField file={null} onSelect={vi.fn()} />);

    expect(screen.getByTestId(UPLOAD_INPUT_TESTID)).toHaveAttribute('accept', INVENTORY_IMPORT_ACCEPT);
  });

  it('R4 entrega el archivo elegido al padre', async () => {
    const onSelect = vi.fn<(file: File) => void>();
    const user = setupUser();
    render(<ImportUploadField file={null} onSelect={onSelect} />);

    const elegido = archivo('inventario.csv', 10);
    await user.upload(screen.getByTestId(UPLOAD_INPUT_TESTID), elegido);

    expect(onSelect).toHaveBeenCalledWith(elegido);
  });

  it('el botón visible abre el selector del input', async () => {
    const user = setupUser();
    render(<ImportUploadField file={null} onSelect={vi.fn()} />);
    const input = screen.getByTestId(UPLOAD_INPUT_TESTID);
    const click = vi.spyOn(input, 'click');

    await user.click(screen.getByTestId(UPLOAD_TRIGGER_TESTID));

    expect(click).toHaveBeenCalled();
  });

  it('R6 avisa en local si el archivo pasa del tope, con su peso y el máximo', () => {
    const grande = archivo('grande.csv', INVENTORY_IMPORT_MAX_FILE_BYTES + 1);
    render(<ImportUploadField file={grande} onSelect={vi.fn()} />);

    const aviso = screen.getByTestId(UPLOAD_TOO_LARGE_TESTID);
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(aviso).toHaveTextContent(formatBytes(grande.size));
    expect(aviso).toHaveTextContent(formatBytes(INVENTORY_IMPORT_MAX_FILE_BYTES));
    expect(screen.getByTestId(UPLOAD_INPUT_TESTID)).toHaveAttribute('aria-invalid', 'true');
  });

  it('R6 no avisa con un archivo en el tope exacto', () => {
    render(
      <ImportUploadField file={archivo('justo.csv', INVENTORY_IMPORT_MAX_FILE_BYTES)} onSelect={vi.fn()} />,
    );

    expect(screen.queryByTestId(UPLOAD_TOO_LARGE_TESTID)).toBeNull();
    expect(screen.getByTestId(UPLOAD_FILE_NAME_TESTID)).toHaveTextContent('justo.csv');
  });
});

describe('rechazo del archivo entero', () => {
  const sinDetalle: readonly Rejection[] = [
    { code: 'unsupported_format' },
    { code: 'unreadable' },
    { code: 'empty' },
  ];

  for (const rechazo of sinDetalle) {
    it(`R4 R6 «${rechazo.code}» tiene su propio texto`, () => {
      render(<ImportFileRejection rejection={rechazo} />);

      const alerta = screen.getByTestId(REJECTION_TESTID);
      expect(alerta).toHaveAttribute('role', 'alert');
      expect(alerta).toHaveAttribute('data-code', rechazo.code);
      expect(screen.getByTestId(REJECTION_MESSAGE_TESTID).textContent).not.toBe('');
    });
  }

  it('R4 R6 los tres rechazos sin detalle tienen textos distintos', () => {
    const textos = sinDetalle.map((rechazo) => {
      const { unmount } = render(<ImportFileRejection rejection={rechazo} />);
      const texto = screen.getByTestId(REJECTION_MESSAGE_TESTID).textContent;
      unmount();
      return texto;
    });

    expect(new Set(textos).size).toBe(sinDetalle.length);
  });

  it('R6 «file_too_large» dice cuánto pesa y cuál es el máximo', () => {
    render(<ImportFileRejection rejection={{ code: 'file_too_large', bytes: 2_500_000, maxBytes: 1_000_000 }} />);

    const mensaje = screen.getByTestId(REJECTION_MESSAGE_TESTID);
    expect(mensaje).toHaveTextContent(formatBytes(2_500_000));
    expect(mensaje).toHaveTextContent(formatBytes(1_000_000));
  });

  it('R6 «too_many_rows» dice cuántas filas trae y el máximo', () => {
    render(
      <ImportFileRejection
        rejection={{ code: 'too_many_rows', rows: 2001, maxRows: INVENTORY_IMPORT_MAX_ROWS }}
      />,
    );

    const mensaje = screen.getByTestId(REJECTION_MESSAGE_TESTID);
    expect(mensaje).toHaveTextContent(formatCount(2001));
    expect(mensaje).toHaveTextContent(formatCount(INVENTORY_IMPORT_MAX_ROWS));
  });

  const conColumnas = ['missing_columns', 'unknown_columns', 'duplicate_columns'] as const;

  for (const code of conColumnas) {
    it(`R4 «${code}» nombra cada columna`, () => {
      render(<ImportFileRejection rejection={{ code, columns: ['Existencia', 'Costo unitarios'] }} />);

      const columnas = within(screen.getByTestId(REJECTION_TESTID))
        .getAllByTestId(REJECTION_COLUMN_TESTID)
        .map((item) => item.textContent);
      expect(columnas).toEqual(['Existencia', 'Costo unitarios']);
    });
  }
});

describe('plantilla', () => {
  it('R3 descarga lo que construye buildInventoryImportTemplate', async () => {
    const user = setupUser();
    render(<ImportTemplateButton />);

    await user.click(screen.getByTestId(TEMPLATE_BUTTON_TESTID));

    expect(downloadFileMock).toHaveBeenCalledTimes(1);
    expect(downloadFileMock).toHaveBeenCalledWith(buildInventoryImportTemplate());
  });
});

describe('downloadFile', () => {
  it('R3 R28 crea un Blob con el tipo y descarga con el nombre del archivo', async () => {
    const { downloadFile } = await vi.importActual<
      typeof import('@/app/(private)/inventario/importar/components/download-file')
    >('@/app/(private)/inventario/importar/components/download-file');
    const creados: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      creados.push(blob);
      return 'blob:prueba';
    });
    const originales = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const clicks: HTMLAnchorElement[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push(this);
      });

    const plantilla = buildInventoryImportTemplate();
    downloadFile(plantilla);

    expect(creados).toHaveLength(1);
    expect(creados[0]?.type).toBe(plantilla.mimeType);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.download).toBe(plantilla.fileName);
    expect(clicks[0]?.getAttribute('href')).toBe('blob:prueba');
    expect(clicks[0]?.isConnected).toBe(false);

    click.mockRestore();
    Object.assign(URL, originales);
  });
});
