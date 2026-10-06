import { describe, expect, it } from 'vitest';

import { errorMessage } from '@/lib/modules/errores';
import {
  INVENTORY_IMPORT_COLUMNS,
  buildInventoryImportErrorFile,
  buildInventoryImportTemplate,
  type InventoryImportPreview,
  type InventoryImportResult,
} from '@/lib/modules/inventario';
import {
  confirmInventoryImportAction,
  previewInventoryImportAction,
} from '@/lib/modules/inventario/adapters/driving/inventory-import-actions';

const ALREADY_IMPORTED_KEY = '00000000-0000-4000-8000-000000000000';
const OTHER_KEY = '9b2f7c1e-4a3d-4e5f-8a6b-1c2d3e4f5a6b';

function xlsx(name = 'inventario.xlsx'): File {
  return new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], name);
}

function form(entries: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const INVALID_INPUT = {
  status: 'error',
  code: 'invalid_input',
  message: errorMessage('invalid_input'),
};

async function preview(): Promise<InventoryImportPreview> {
  const result = await previewInventoryImportAction(form({ file: xlsx() }));
  if (result.status !== 'success' || result.data.kind !== 'preview') throw new Error('se esperaba vista previa');
  return result.data;
}

async function imported(): Promise<InventoryImportResult> {
  const result = await confirmInventoryImportAction(form({ file: xlsx(), importKey: OTHER_KEY }));
  if (result.status !== 'success' || result.data.kind !== 'imported') throw new Error('se esperaba resultado');
  return result.data;
}

describe('previewInventoryImportAction (stub)', () => {
  it('R32: sin file devuelve invalid_input', async () => {
    await expect(previewInventoryImportAction(new FormData())).resolves.toEqual(INVALID_INPUT);
  });

  it('R32: con file que no es un File devuelve invalid_input', async () => {
    await expect(previewInventoryImportAction(form({ file: 'texto' }))).resolves.toEqual(INVALID_INPUT);
  });

  it('R32: un archivo cuyo nombre empieza por rechazado devuelve file_rejected / missing_columns Existencia', async () => {
    const result = await previewInventoryImportAction(form({ file: xlsx('rechazado-inventario.xlsx') }));
    expect(result).toEqual({
      status: 'success',
      data: { kind: 'file_rejected', rejection: { code: 'missing_columns', columns: ['Existencia'] } },
    });
  });

  it('R32: la vista previa fija cubre los cuatro estados y lleva el nombre y formato del archivo', async () => {
    const data = await preview();
    expect(data.fileName).toBe('inventario.xlsx');
    expect(data.format).toBe('xlsx');
    expect(data.rows).toHaveLength(6);
    expect(new Set(data.rows.map((row) => row.status))).toEqual(
      new Set(['create', 'add_batch', 'duplicate', 'error']),
    );
    expect(data.exampleRowIgnored).toBe(true);
    expect(data.canCreateUnits).toBe(true);
    expect(data.canCreatePresentations).toBe(true);
  });

  it('R32: la vista previa fija trae los dos faltantes, cada uno apuntando a una fila en error', async () => {
    const data = await preview();
    expect(data.missingUnits.map((entry) => entry.name)).toEqual(['Galón']);
    expect(data.missingPresentations.map((entry) => entry.name)).toEqual(['Bidón 20 L']);
    const errorRows = new Set(data.rows.filter((row) => row.status === 'error').map((row) => row.rowNumber));
    for (const entry of [...data.missingUnits, ...data.missingPresentations]) {
      expect(entry.rowNumbers.length).toBeGreaterThan(0);
      for (const rowNumber of entry.rowNumbers) expect(errorRows.has(rowNumber)).toBe(true);
    }
  });

  it('R32: los totales de la vista previa cuadran con las filas', async () => {
    const data = await preview();
    const count = (status: string) => data.rows.filter((row) => row.status === status).length;
    expect(data.totals).toEqual({
      rows: 6,
      create: count('create'),
      addBatch: count('add_batch'),
      duplicate: count('duplicate'),
      error: count('error'),
    });
    expect(data.totals.create + data.totals.addBatch + data.totals.duplicate + data.totals.error).toBe(6);
  });

  it('R32: toda fila trae una celda por columna de la plantilla y los add_batch de archivo apuntan a una fila create anterior', async () => {
    const data = await preview();
    const keys = INVENTORY_IMPORT_COLUMNS.map((column) => column.key).sort();
    for (const row of data.rows) expect(Object.keys(row.cells).sort()).toEqual(keys);
    for (const row of data.rows) {
      if (row.status !== 'add_batch' || row.target.kind !== 'file_row') continue;
      const { rowNumber } = row.target;
      const targetRow = data.rows.find((candidate) => candidate.rowNumber === rowNumber);
      expect(targetRow?.status).toBe('create');
      expect(rowNumber).toBeLessThan(row.rowNumber);
    }
  });
});

describe('confirmInventoryImportAction (stub)', () => {
  it('R32: sin file devuelve invalid_input', async () => {
    await expect(confirmInventoryImportAction(form({ importKey: OTHER_KEY }))).resolves.toEqual(INVALID_INPUT);
  });

  it('R32: sin importKey devuelve invalid_input', async () => {
    await expect(confirmInventoryImportAction(form({ file: xlsx() }))).resolves.toEqual(INVALID_INPUT);
  });

  it('R32: con importKey que no es uuid devuelve invalid_input', async () => {
    await expect(confirmInventoryImportAction(form({ file: xlsx(), importKey: 'no-uuid' }))).resolves.toEqual(
      INVALID_INPUT,
    );
  });

  it('R32: con la clave fija devuelve already_imported', async () => {
    const result = await confirmInventoryImportAction(form({ file: xlsx(), importKey: ALREADY_IMPORTED_KEY }));
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.kind).toBe('already_imported');
  });

  it('R32: el resultado fijo es coherente con la vista previa fija y sus totales cuadran', async () => {
    const [before, after] = await Promise.all([preview(), imported()]);
    expect(after.fileName).toBe('inventario.xlsx');
    expect(after.exampleRowIgnored).toBe(before.exampleRowIgnored);
    expect(after.rows.map((row) => row.rowNumber)).toEqual(before.rows.map((row) => row.rowNumber));
    const expected: Record<string, string> = {
      create: 'created',
      add_batch: 'batch_added',
      duplicate: 'duplicate',
      error: 'error',
    };
    after.rows.forEach((row, index) => expect(row.status).toBe(expected[before.rows[index]!.status]));
    const count = (status: string) => after.rows.filter((row) => row.status === status).length;
    expect(after.totals).toEqual({
      rows: after.rows.length,
      created: count('created'),
      batchAdded: count('batch_added'),
      duplicate: count('duplicate'),
      error: count('error'),
    });
  });
});

describe('descargas (T0)', () => {
  it('R32: la plantilla lleva BOM, la cabecera en orden con ";" y una fila de ejemplo', () => {
    const template = buildInventoryImportTemplate();
    expect(template.fileName).toBe('plantilla-inventario.csv');
    expect(template.mimeType).toBe('text/csv;charset=utf-8');
    expect(template.content.startsWith('﻿')).toBe(true);
    const lines = template.content.slice(1).split('\r\n').filter((line) => line !== '');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(INVENTORY_IMPORT_COLUMNS.map((column) => column.header).join(';'));
  });

  it('R32: el archivo de errores (stub) lleva Fila + columnas + Motivo y solo las filas en error', async () => {
    const data = await preview();
    const file = buildInventoryImportErrorFile(data.rows, 'inventario.xlsx');
    expect(file.fileName).toBe('inventario-errores.csv');
    const lines = file.content.slice(1).split('\r\n').filter((line) => line !== '');
    expect(lines[0]).toBe(['Fila', ...INVENTORY_IMPORT_COLUMNS.map((column) => column.header), 'Motivo'].join(';'));
    expect(lines).toHaveLength(1 + data.totals.error);
  });
});
