import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorMessage } from '@/lib/modules/errores';
import {
  INVENTORY_IMPORT_COLUMNS,
  UnauthorizedError,
  buildInventoryImportErrorFile,
  buildInventoryImportTemplate,
  type ImportCells,
  type ImportAlreadyDone,
  type ImportNothingImported,
  type InventoryImportPreview,
  type InventoryImportResult,
} from '@/lib/modules/inventario';
import {
  confirmInventoryImportAction,
  previewInventoryImportAction,
} from '@/lib/modules/inventario/adapters/driving/inventory-import-actions';
import { INVENTORY_ROUTE } from '@/lib/shared/routes';

const {
  previewMock,
  confirmMock,
  getSessionUserMock,
  getSessionContextMock,
  readRequestIdHeaderMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  previewMock: vi.fn(),
  confirmMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  readRequestIdHeaderMock: vi.fn(async (): Promise<string | null> => null),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  inventario: { previewInventoryImport: previewMock, confirmInventoryImport: confirmMock },
}));

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const IMPORT_KEY = '9b2f7c1e-4a3d-4e5f-8a6b-1c2d3e4f5a6b';
const BYTES = [0x50, 0x4b, 0x03, 0x04];

const SESSION_USER = {
  id: 'user-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['inventario.modificar'],
};
const SESSION_CONTEXT = { userId: 'user-1', companyId: 'company-1' };
const ACTOR = { id: 'user-1', companyId: 'company-1', permissions: ['inventario.modificar'] };

function cells(values: Partial<ImportCells>): ImportCells {
  return Object.fromEntries(INVENTORY_IMPORT_COLUMNS.map((column) => [column.key, values[column.key] ?? ''])) as ImportCells;
}

const PREVIEW: InventoryImportPreview = {
  kind: 'preview',
  fileName: 'inventario.xlsx',
  format: 'xlsx',
  exampleRowIgnored: false,
  totals: { rows: 2, create: 1, addBatch: 0, duplicate: 0, error: 1 },
  rows: [
    { rowNumber: 2, type: 'PRODUCT', productName: 'Sal', cells: cells({ type: 'Insumo', name: 'Sal' }), status: 'create' },
    {
      rowNumber: 3,
      type: 'PRODUCT',
      productName: 'Mal',
      cells: cells({ type: 'Insumo', name: 'Mal', stock: 'x' }),
      status: 'error',
      issues: [{ code: 'stock_invalid', column: 'stock', message: 'Existencia: no es un numero.' }],
    },
  ],
  missingUnits: [],
  missingPresentations: [],
  canCreateUnits: true,
  canCreatePresentations: true,
};

const IMPORTED: InventoryImportResult = {
  kind: 'imported',
  importId: '44444444-4444-4444-8444-444444444444',
  importedAt: '2026-10-06T12:00:00.000Z',
  fileName: 'inventario.xlsx',
  exampleRowIgnored: false,
  totals: { rows: 1, created: 1, batchAdded: 0, duplicate: 0, error: 0 },
  rows: [
    {
      rowNumber: 2,
      type: 'PRODUCT',
      productName: 'Sal',
      cells: cells({ type: 'Insumo', name: 'Sal' }),
      status: 'created',
      productId: '33333333-3333-4333-8333-333333333333',
      lot: 'L-1',
    },
  ],
};

const ALREADY: ImportAlreadyDone = {
  kind: 'already_imported',
  importId: IMPORTED.importId,
  importedAt: IMPORTED.importedAt,
};

const INVALID_INPUT = { status: 'error', code: 'invalid_input', message: errorMessage('invalid_input') };
const UNAUTHORIZED = { status: 'error', code: 'unauthorized', message: errorMessage('unauthorized') };

function xlsx(name = 'inventario.xlsx'): File {
  return new File([new Uint8Array(BYTES)], name);
}

function form(entries: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
  readRequestIdHeaderMock.mockResolvedValue(null);
});

describe('previewInventoryImportAction', () => {
  it('R32 sin file devuelve invalid_input sin leer la sesion ni llamar al caso de uso', async () => {
    await expect(previewInventoryImportAction(new FormData())).resolves.toEqual(INVALID_INPUT);
    expect(getSessionUserMock).not.toHaveBeenCalled();
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('R32 con file que no es un File devuelve invalid_input', async () => {
    await expect(previewInventoryImportAction(form({ file: 'texto' }))).resolves.toEqual(INVALID_INPUT);
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('R9 R32 pasa el nombre y los bytes del archivo con el actor de la sesion y devuelve la vista previa', async () => {
    previewMock.mockResolvedValue(PREVIEW);

    await expect(previewInventoryImportAction(form({ file: xlsx() }))).resolves.toEqual({ status: 'success', data: PREVIEW });

    expect(previewMock).toHaveBeenCalledTimes(1);
    const [input, actor] = previewMock.mock.calls[0]!;
    expect(input.fileName).toBe('inventario.xlsx');
    expect(input.bytes).toBeInstanceOf(Uint8Array);
    expect([...input.bytes]).toEqual(BYTES);
    expect(actor).toEqual(ACTOR);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('R32 un archivo rechazado es un exito con su motivo', async () => {
    const rejected = { kind: 'file_rejected', rejection: { code: 'missing_columns', columns: ['Existencia'] } };
    previewMock.mockResolvedValue(rejected);

    await expect(previewInventoryImportAction(form({ file: xlsx() }))).resolves.toEqual({ status: 'success', data: rejected });
  });

  it('R1 sin sesion sale unauthorized sin llegar al caso de uso', async () => {
    getSessionUserMock.mockResolvedValue(null);
    getSessionContextMock.mockResolvedValue(null);

    await expect(previewInventoryImportAction(form({ file: xlsx() }))).resolves.toEqual(UNAUTHORIZED);
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('R1 sin permiso la vista previa no lee los bytes del archivo', async () => {
    getSessionUserMock.mockResolvedValue({ ...SESSION_USER, permissions: ['inventario.consultar'] });
    const file = xlsx();
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer');

    await expect(previewInventoryImportAction(form({ file }))).resolves.toEqual(UNAUTHORIZED);
    expect(arrayBuffer).toHaveBeenCalledTimes(0);
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('R1 el caso de uso conserva su propio rechazo por permiso', async () => {
    previewMock.mockRejectedValue(new UnauthorizedError());

    await expect(previewInventoryImportAction(form({ file: xlsx() }))).resolves.toEqual(UNAUTHORIZED);
    expect(previewMock).toHaveBeenCalledTimes(1);
  });

  it('R32 un fallo ajeno sale como unexpected con la referencia de la peticion', async () => {
    readRequestIdHeaderMock.mockResolvedValue('req-preview-1');
    previewMock.mockRejectedValue(new Error('select * from products'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await previewInventoryImportAction(form({ file: xlsx() }));

    expect(result).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      reference: 'req-preview-1',
    });
    log.mockRestore();
  });
});

describe('confirmInventoryImportAction', () => {
  it('R32 sin file devuelve invalid_input', async () => {
    await expect(confirmInventoryImportAction(form({ importKey: IMPORT_KEY }))).resolves.toEqual(INVALID_INPUT);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('R32 sin importKey devuelve invalid_input', async () => {
    await expect(confirmInventoryImportAction(form({ file: xlsx() }))).resolves.toEqual(INVALID_INPUT);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('R29 R32 con importKey que no es uuid devuelve invalid_input sin leer la sesion', async () => {
    await expect(confirmInventoryImportAction(form({ file: xlsx(), importKey: 'no-uuid' }))).resolves.toEqual(INVALID_INPUT);
    expect(getSessionUserMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('R24 R29 pasa archivo, clave y actor, devuelve el resultado y revalida el inventario', async () => {
    confirmMock.mockResolvedValue(IMPORTED);

    await expect(confirmInventoryImportAction(form({ file: xlsx(), importKey: IMPORT_KEY }))).resolves.toEqual({
      status: 'success',
      data: IMPORTED,
    });

    const [input, actor] = confirmMock.mock.calls[0]!;
    expect(input.fileName).toBe('inventario.xlsx');
    expect([...input.bytes]).toEqual(BYTES);
    expect(input.importKey).toBe(IMPORT_KEY);
    expect(actor).toEqual(ACTOR);
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith(INVENTORY_ROUTE);
  });

  it('R29 ya importada es un exito y no revalida nada', async () => {
    confirmMock.mockResolvedValue(ALREADY);

    await expect(confirmInventoryImportAction(form({ file: xlsx(), importKey: IMPORT_KEY }))).resolves.toEqual({
      status: 'success',
      data: ALREADY,
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('R24 sin filas validas es un exito con nothing_imported y no revalida nada', async () => {
    const nothing: ImportNothingImported = {
      kind: 'nothing_imported',
      fileName: 'inventario.xlsx',
      exampleRowIgnored: false,
      totals: { rows: 1, created: 0, batchAdded: 0, duplicate: 1, error: 0 },
      rows: [
        {
          rowNumber: 2,
          type: 'PRODUCT',
          productName: 'Sal',
          cells: cells({ type: 'Insumo', name: 'Sal' }),
          status: 'duplicate',
          lot: 'L-1',
        },
      ],
    };
    confirmMock.mockResolvedValue(nothing);

    await expect(confirmInventoryImportAction(form({ file: xlsx(), importKey: IMPORT_KEY }))).resolves.toEqual({
      status: 'success',
      data: nothing,
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('R32 un archivo rechazado en la confirmacion no revalida nada', async () => {
    const rejected = { kind: 'file_rejected', rejection: { code: 'unreadable' } };
    confirmMock.mockResolvedValue(rejected);

    await expect(confirmInventoryImportAction(form({ file: xlsx(), importKey: IMPORT_KEY }))).resolves.toEqual({
      status: 'success',
      data: rejected,
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('R1 sin inventario.modificar sale unauthorized y no revalida', async () => {
    getSessionUserMock.mockResolvedValue({ ...SESSION_USER, permissions: [] });

    await expect(confirmInventoryImportAction(form({ file: xlsx(), importKey: IMPORT_KEY }))).resolves.toEqual(UNAUTHORIZED);
    expect(confirmMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('R1 sin permiso la confirmacion no lee los bytes del archivo', async () => {
    getSessionUserMock.mockResolvedValue({ ...SESSION_USER, permissions: ['inventario.consultar'] });
    const file = xlsx();
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer');

    await expect(confirmInventoryImportAction(form({ file, importKey: IMPORT_KEY }))).resolves.toEqual(UNAUTHORIZED);
    expect(arrayBuffer).toHaveBeenCalledTimes(0);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('R1 sin sesion la confirmacion sale unauthorized sin llegar al caso de uso', async () => {
    getSessionUserMock.mockResolvedValue(null);
    getSessionContextMock.mockResolvedValue(null);

    await expect(confirmInventoryImportAction(form({ file: xlsx(), importKey: IMPORT_KEY }))).resolves.toEqual(UNAUTHORIZED);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('R1 la confirmacion conserva el rechazo por permiso del caso de uso', async () => {
    confirmMock.mockRejectedValue(new UnauthorizedError());

    await expect(confirmInventoryImportAction(form({ file: xlsx(), importKey: IMPORT_KEY }))).resolves.toEqual(UNAUTHORIZED);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('R32 un fallo ajeno sale como unexpected con referencia y no revalida', async () => {
    readRequestIdHeaderMock.mockResolvedValue('req-confirm-1');
    confirmMock.mockRejectedValue(new Error('connection reset'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await confirmInventoryImportAction(form({ file: xlsx(), importKey: IMPORT_KEY }));

    expect(result).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      reference: 'req-confirm-1',
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('descargas', () => {
  it('R32 la plantilla lleva BOM, la cabecera en orden con ";" y una fila de ejemplo', () => {
    const template = buildInventoryImportTemplate();
    expect(template.fileName).toBe('plantilla-inventario.csv');
    expect(template.mimeType).toBe('text/csv;charset=utf-8');
    expect(template.content.startsWith('﻿')).toBe(true);
    const lines = template.content.slice(1).split('\r\n').filter((line) => line !== '');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(INVENTORY_IMPORT_COLUMNS.map((column) => column.header).join(';'));
  });

  it('R32 el archivo de errores lleva Fila + columnas + Motivo y solo las filas en error', () => {
    const file = buildInventoryImportErrorFile(PREVIEW.rows, 'inventario.xlsx');
    expect(file.fileName).toBe('inventario-errores.csv');
    const lines = file.content.slice(1).split('\r\n').filter((line) => line !== '');
    expect(lines[0]).toBe(['Fila', ...INVENTORY_IMPORT_COLUMNS.map((column) => column.header), 'Motivo'].join(';'));
    expect(lines).toHaveLength(1 + PREVIEW.totals.error);
  });
});
