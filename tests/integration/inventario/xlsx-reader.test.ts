import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readXlsx } from '@/lib/modules/inventario/adapters/driven/spreadsheet/xlsx-reader';
import { parseImportDecimal, parseImportDate } from '@/lib/modules/inventario/domain/import-cell-parsing';
import { detectImportFileFormat } from '@/lib/modules/inventario/domain/import-file-format';
import { parseImportSheet } from '@/lib/modules/inventario/domain/import-sheet';
import type { SpreadsheetReadResult } from '@/lib/modules/inventario/ports/spreadsheet-reader';
import { INVENTORY_IMPORT_COLUMNS } from '@/lib/modules/inventario';

// Hoja producida con Excel 16 (ver progress/impl_QC-209-importar-inventario-desde-excel.md).
// No toca la base: vive aqui porque lee un archivo real con la libreria real.
const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'fixtures',
  'inventario-importar',
  'mixto.xlsx',
);

const bytes = new Uint8Array(readFileSync(FIXTURE));

async function rows(): Promise<{ text: string; origin: string }[][]> {
  const result = await readXlsx(bytes);
  if (result.kind !== 'ok') throw new Error('esperaba ok');
  return result.rows.map((row) => [...row]);
}

function cell(all: { text: string; origin: string }[][], row: number, header: string) {
  const column = INVENTORY_IMPORT_COLUMNS.findIndex((c) => c.header === header);
  return all[row - 1]?.[column];
}

describe('lector .xlsx con mixto.xlsx', () => {
  it('R4 el fixture se reconoce como .xlsx por extension y firma', () => {
    expect(detectImportFileFormat('mixto.xlsx', bytes)).toBe('xlsx');
    expect(detectImportFileFormat('mixto.csv', bytes)).toEqual({ code: 'unsupported_format' });
  });

  it('R4 lee la cabecera de la plantilla como texto', async () => {
    const all = await rows();
    expect(all[0]?.map((c) => c.text)).toEqual(INVENTORY_IMPORT_COLUMNS.map((c) => c.header));
    expect(all[0]?.every((c) => c.origin === 'text')).toBe(true);
  });

  it('R4 solo lee la primera hoja', async () => {
    const all = await rows();
    expect(all.flat().some((c) => c.text.includes('NO LEER'))).toBe(false);
  });

  it('R4 R12 los numeros nativos llegan como decimal sin redondear ni rellenar', async () => {
    const all = await rows();
    expect(cell(all, 2, 'Existencia')).toEqual({ text: '25', origin: 'number' });
    expect(cell(all, 2, 'Costo unitario')).toEqual({ text: '3.5', origin: 'number' });
    expect(cell(all, 3, 'Costo unitario')).toEqual({ text: '0.0001', origin: 'number' });
    expect(cell(all, 5, 'Existencia')).toEqual({ text: '1234567', origin: 'number' });
    expect(cell(all, 5, 'Costo total')).toEqual({ text: '100.25', origin: 'number' });
  });

  it('R4 R12 un numero nativo con mas de 4 decimales no se redondea: queda number_format_invalid', async () => {
    const stock = cell(await rows(), 3, 'Existencia');
    expect(stock).toEqual({ text: '1.23456', origin: 'number' });
    expect(parseImportDecimal(stock!.text, 'number')).toEqual({ kind: 'number_format_invalid' });
  });

  it('R4 R13 una fecha nativa llega como AAAA-MM-DD', async () => {
    const all = await rows();
    expect(cell(all, 2, 'Fecha de compra')).toEqual({ text: '2026-01-15', origin: 'date' });
    expect(cell(all, 3, 'Fecha de vencimiento')).toEqual({ text: '2027-06-30', origin: 'date' });
  });

  it('R4 R13 una fecha escrita como texto llega tal cual y se lee con las formas aceptadas', async () => {
    const all = await rows();
    expect(cell(all, 2, 'Fecha de vencimiento')).toEqual({ text: '31/12/2026', origin: 'text' });
    expect(parseImportDate(cell(all, 2, 'Fecha de vencimiento')!.text)).toEqual({ kind: 'value', value: '2026-12-31' });
    expect(cell(all, 3, 'Fecha de compra')).toEqual({ text: '2026-02-01', origin: 'text' });
  });

  it('R4 un texto con ceros a la izquierda no se convierte en numero', async () => {
    expect(cell(await rows(), 3, 'Lote')).toEqual({ text: '007', origin: 'text' });
  });

  it('R4 R6 la hoja entera pasa a filas con su numero de hoja, sin la fila en blanco', async () => {
    const outcome = parseImportSheet(await readXlsx(bytes));
    if (!outcome.ok) throw new Error(`rechazo: ${outcome.rejection.code}`);
    expect(outcome.sheet.rows.map((row) => [row.rowNumber, row.cells.name])).toEqual([
      [2, 'Sal fina'],
      [3, 'Ácido cítrico'],
      [5, 'Bidón'],
    ]);
    expect(outcome.sheet.rows[1]?.origins).toMatchObject({ stock: 'number', purchaseDate: 'text', expiryDate: 'date' });
  });
});

describe('lector .xlsx con archivos que no se pueden leer', () => {
  const unreadable: SpreadsheetReadResult = { kind: 'unreadable' };

  it('R4 un ZIP corrupto tras la firma es unreadable', async () => {
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(await readXlsx(corrupt)).toEqual(unreadable);
  });

  it('R4 un .xlsx truncado es unreadable', async () => {
    expect(await readXlsx(bytes.slice(0, Math.floor(bytes.length / 2)))).toEqual(unreadable);
  });

  it('R4 bytes que no son ZIP son unreadable', async () => {
    expect(await readXlsx(new TextEncoder().encode('Tipo;Nombre\nInsumo;Sal'))).toEqual(unreadable);
  });
});
