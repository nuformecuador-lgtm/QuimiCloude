import { describe, expect, it } from 'vitest';

import { parseImportSheet } from '@/lib/modules/inventario/domain/import-sheet';
import type { SpreadsheetReadResult } from '@/lib/modules/inventario/ports/spreadsheet-reader';
import { INVENTORY_IMPORT_COLUMNS } from '@/lib/modules/inventario';

const ALL_HEADERS = INVENTORY_IMPORT_COLUMNS.map((column) => column.header);
const REQUIRED_HEADERS = INVENTORY_IMPORT_COLUMNS.filter((column) => column.headerRequired).map(
  (column) => column.header,
);

function sheet(rows: string[][]): SpreadsheetReadResult {
  return { kind: 'ok', rows: rows.map((row) => row.map((text) => ({ text, origin: 'text' as const }))) };
}

function dataRow(header: string[]): string[] {
  return header.map((name) => (name === 'Tipo' ? 'Insumo' : name === 'Existencia' ? '1' : 'x'));
}

function rejection(header: string[], rows: string[][] = [dataRow(header)]) {
  const outcome = parseImportSheet(sheet([header, ...rows]));
  return outcome.ok ? null : outcome.rejection;
}

describe('cabecera de la importacion', () => {
  it('R5 acepta la cabecera completa de la plantilla', () => {
    expect(rejection(ALL_HEADERS)).toBeNull();
  });

  it('R5 acepta solo las columnas obligatorias: las opcionales ausentes van vacias', () => {
    const outcome = parseImportSheet(sheet([REQUIRED_HEADERS, ['Insumo', 'Sal', '3']]));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.sheet.rows[0]?.cells).toMatchObject({ type: 'Insumo', name: 'Sal', stock: '3', unit: '', lot: '' });
  });

  it('R5 acepta las columnas en cualquier orden y lee cada valor por su cabecera', () => {
    const outcome = parseImportSheet(sheet([['Existencia', 'Nombre', 'Tipo'], ['7', 'Sal', 'Envase']]));
    expect(outcome.ok && outcome.sheet.rows[0]?.cells).toMatchObject({ type: 'Envase', name: 'Sal', stock: '7' });
  });

  it('R5 compara los nombres sin mayusculas, tildes ni espacios de los extremos', () => {
    const header = ['  TIPO ', 'nombre', 'EXISTENCIA', 'presentacion', 'FORMULA', ' fecha  de compra '];
    expect(rejection(header)).toBeNull();
  });

  it('R5 rechaza nombrando cada columna obligatoria que falta', () => {
    expect(rejection(['Tipo', 'Unidad'])).toEqual({ code: 'missing_columns', columns: ['Nombre', 'Existencia'] });
  });

  it('R5 rechaza nombrando la columna que no es de la plantilla, tal como viene escrita', () => {
    expect(rejection([...REQUIRED_HEADERS, 'Costo unitarios', 'Color'])).toEqual({
      code: 'unknown_columns',
      columns: ['Costo unitarios', 'Color'],
    });
  });

  it('R5 rechaza nombrando la columna repetida, aunque se escriba distinto', () => {
    expect(rejection([...REQUIRED_HEADERS, 'Lote', 'LOTE'])).toEqual({
      code: 'duplicate_columns',
      columns: ['Lote'],
    });
  });

  it('R5 una columna repetida se nombra una sola vez aunque venga tres veces', () => {
    expect(rejection([...REQUIRED_HEADERS, 'Lote', 'Lote', 'lote'])).toEqual({
      code: 'duplicate_columns',
      columns: ['Lote'],
    });
  });

  it('R5 acepta e ignora «Fila» y «Motivo» del archivo de errores', () => {
    const header = ['Fila', ...ALL_HEADERS, 'Motivo'];
    const outcome = parseImportSheet(sheet([header, dataRow(header)]));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(Object.keys(outcome.sheet.rows[0]?.cells ?? {})).toEqual(INVENTORY_IMPORT_COLUMNS.map((c) => c.key));
  });

  it('R5 una columna sin cabecera y sin datos se ignora', () => {
    expect(rejection([...REQUIRED_HEADERS, ''], [['Insumo', 'Sal', '1', '']])).toBeNull();
  });

  it('R5 una columna sin cabecera pero con datos se rechaza nombrando su posicion', () => {
    expect(rejection([...REQUIRED_HEADERS, ''], [['Insumo', 'Sal', '1', 'algo']])).toEqual({
      code: 'unknown_columns',
      columns: ['Columna 4'],
    });
  });

  it('R5 datos mas alla de la ultima cabecera tambien se rechazan', () => {
    expect(rejection(REQUIRED_HEADERS, [['Insumo', 'Sal', '1', '', 'suelto']])).toEqual({
      code: 'unknown_columns',
      columns: ['Columna 5'],
    });
  });

  it('R5 falta antes que sobra: con las dos cosas se nombran las que faltan', () => {
    expect(rejection(['Tipo', 'Nombre', 'Color'])).toEqual({ code: 'missing_columns', columns: ['Existencia'] });
  });
});
