import { describe, expect, it } from 'vitest';

import { parseImportSheet } from '@/lib/modules/inventario/domain/import-sheet';
import type { SpreadsheetCell, SpreadsheetReadResult } from '@/lib/modules/inventario/ports/spreadsheet-reader';
import {
  IMPORT_EXAMPLE_ROW,
  INVENTORY_IMPORT_COLUMNS,
  INVENTORY_IMPORT_MAX_ROWS,
} from '@/lib/modules/inventario';

const HEADER = INVENTORY_IMPORT_COLUMNS.map((column) => column.header);
const EXAMPLE = INVENTORY_IMPORT_COLUMNS.map((column) => IMPORT_EXAMPLE_ROW[column.key]);

function text(value: string): SpreadsheetCell {
  return { text: value, origin: 'text' };
}

function sheet(rows: (string[] | SpreadsheetCell[])[]): SpreadsheetReadResult {
  return {
    kind: 'ok',
    rows: rows.map((row) => row.map((cell) => (typeof cell === 'string' ? text(cell) : cell))),
  };
}

function item(name: string): string[] {
  return HEADER.map((header) => (header === 'Tipo' ? 'Insumo' : header === 'Nombre' ? name : ''));
}

function items(count: number): string[][] {
  return Array.from({ length: count }, (_, index) => item(`Producto ${index + 1}`));
}

describe('limites del archivo', () => {
  it(`R6 acepta ${INVENTORY_IMPORT_MAX_ROWS} filas`, () => {
    const outcome = parseImportSheet(sheet([HEADER, ...items(INVENTORY_IMPORT_MAX_ROWS)]));
    expect(outcome.ok && outcome.sheet.rows.length).toBe(INVENTORY_IMPORT_MAX_ROWS);
  });

  it(`R6 rechaza ${INVENTORY_IMPORT_MAX_ROWS + 1} filas diciendo cuantas trae y el tope`, () => {
    const outcome = parseImportSheet(sheet([HEADER, ...items(INVENTORY_IMPORT_MAX_ROWS + 1)]));
    expect(outcome).toEqual({
      ok: false,
      rejection: { code: 'too_many_rows', rows: INVENTORY_IMPORT_MAX_ROWS + 1, maxRows: INVENTORY_IMPORT_MAX_ROWS },
    });
  });

  it('R6 las filas en blanco no cuentan para el tope', () => {
    const blanks = Array.from({ length: 50 }, () => HEADER.map(() => '  '));
    const outcome = parseImportSheet(sheet([HEADER, ...items(INVENTORY_IMPORT_MAX_ROWS), ...blanks, ['']]));
    expect(outcome.ok && outcome.sheet.rows.length).toBe(INVENTORY_IMPORT_MAX_ROWS);
  });

  it('R6 las filas en blanco no se leen pero no corren la numeracion de la hoja', () => {
    const outcome = parseImportSheet(sheet([HEADER, item('A'), [''], HEADER.map(() => ''), item('B')]));
    expect(outcome.ok && outcome.sheet.rows.map((row) => [row.rowNumber, row.cells.name])).toEqual([
      [2, 'A'],
      [5, 'B'],
    ]);
  });

  it('R6 un archivo sin ninguna celda con valor es empty', () => {
    expect(parseImportSheet(sheet([]))).toEqual({ ok: false, rejection: { code: 'empty' } });
    expect(parseImportSheet(sheet([[''], ['', ' ']]))).toEqual({ ok: false, rejection: { code: 'empty' } });
  });

  it('R6 una cabecera sin filas es empty', () => {
    expect(parseImportSheet(sheet([HEADER, [''], HEADER.map(() => '')]))).toEqual({
      ok: false,
      rejection: { code: 'empty' },
    });
  });

  it('R4 un archivo ilegible se rechaza como unreadable sin mirar filas', () => {
    expect(parseImportSheet({ kind: 'unreadable' })).toEqual({ ok: false, rejection: { code: 'unreadable' } });
  });

  it('conserva el texto original de cada celda y su origen', () => {
    const row = HEADER.map((header) =>
      header === 'Existencia'
        ? { text: '2.5', origin: 'number' as const }
        : header === 'Fecha de compra'
          ? { text: '2026-01-15', origin: 'date' as const }
          : text(header === 'Tipo' ? ' Insumo ' : header === 'Nombre' ? 'Sal' : ''),
    );
    const outcome = parseImportSheet(sheet([HEADER, row]));
    if (!outcome.ok) throw new Error('esperaba hoja');
    const [parsed] = outcome.sheet.rows;
    expect(parsed?.cells).toMatchObject({ type: ' Insumo ', stock: '2.5', purchaseDate: '2026-01-15' });
    expect(parsed?.origins).toMatchObject({ type: 'text', stock: 'number', purchaseDate: 'date', lot: 'text' });
  });
});

describe('fila de ejemplo de la plantilla', () => {
  it('R8 la fila identica a la de ejemplo se ignora y se senala', () => {
    const outcome = parseImportSheet(sheet([HEADER, EXAMPLE, item('Sal')]));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.sheet.exampleRowIgnored).toBe(true);
    expect(outcome.sheet.rows.map((row) => [row.rowNumber, row.cells.name])).toEqual([[3, 'Sal']]);
  });

  it('R8 la comparacion recorta los espacios de cada celda', () => {
    const outcome = parseImportSheet(sheet([HEADER, EXAMPLE.map((value) => ` ${value}  `), item('Sal')]));
    expect(outcome.ok && outcome.sheet.exampleRowIgnored).toBe(true);
    expect(outcome.ok && outcome.sheet.rows).toHaveLength(1);
  });

  it('R8 una fila que difiere en una sola celda no es la de ejemplo y se lee', () => {
    const changed = EXAMPLE.map((value, index) => (HEADER[index] === 'Existencia' ? '26' : value));
    const outcome = parseImportSheet(sheet([HEADER, changed]));
    expect(outcome.ok && outcome.sheet.exampleRowIgnored).toBe(false);
    expect(outcome.ok && outcome.sheet.rows).toHaveLength(1);
  });

  it('R8 sin la fila de ejemplo no se senala nada', () => {
    const outcome = parseImportSheet(sheet([HEADER, item('Sal')]));
    expect(outcome.ok && outcome.sheet.exampleRowIgnored).toBe(false);
  });

  it('R8 la fila de ejemplo no cuenta para el tope de filas', () => {
    const outcome = parseImportSheet(sheet([HEADER, EXAMPLE, ...items(INVENTORY_IMPORT_MAX_ROWS)]));
    expect(outcome.ok && outcome.sheet.rows.length).toBe(INVENTORY_IMPORT_MAX_ROWS);
  });

  it('R8 la plantilla sin tocar, solo con la fila de ejemplo, es empty', () => {
    expect(parseImportSheet(sheet([HEADER, EXAMPLE]))).toEqual({ ok: false, rejection: { code: 'empty' } });
  });
});
