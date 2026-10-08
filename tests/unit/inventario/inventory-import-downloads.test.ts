import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';

import { readCsv } from '@/lib/modules/inventario/adapters/driven/spreadsheet/csv-reader';
import { parseImportSheet } from '@/lib/modules/inventario/domain/import-sheet';
import {
  IMPORT_EXAMPLE_ROW,
  INVENTORY_IMPORT_COLUMNS,
  buildInventoryImportErrorFile,
  buildInventoryImportTemplate,
  type ImportCells,
  type ImportPreviewRow,
  type ImportResultRow,
} from '@/lib/modules/inventario';

const BOM = '﻿';
const HEADERS = INVENTORY_IMPORT_COLUMNS.map((column) => column.header);

function parse(content: string): string[][] {
  expect(content.startsWith(BOM)).toBe(true);
  const parsed = Papa.parse<string[]>(content.slice(BOM.length), { delimiter: ';', skipEmptyLines: true });
  expect(parsed.errors).toEqual([]);
  return parsed.data;
}

function cells(overrides: Partial<ImportCells>): ImportCells {
  const empty = Object.fromEntries(INVENTORY_IMPORT_COLUMNS.map((column) => [column.key, ''])) as ImportCells;
  return { ...empty, ...overrides };
}

const TRICKY = cells({
  type: 'Insumo',
  name: 'Sal; "fina"\nde mesa',
  unit: 'kg',
  stock: '1.234,5',
  qtyAlert: '5',
});

const ROWS: (ImportPreviewRow | ImportResultRow)[] = [
  { rowNumber: 2, cells: cells({ type: 'Insumo', name: 'Bien' }), type: 'PRODUCT', productName: 'Bien', status: 'create' },
  {
    rowNumber: 3,
    cells: TRICKY,
    type: 'PRODUCT',
    productName: null,
    status: 'error',
    issues: [
      { code: 'number_format_invalid', column: 'stock', message: 'Existencia: usa un solo separador decimal.' },
      { code: 'unit_not_found', column: 'unit', message: 'Unidad: no existe.' },
    ],
  },
  {
    rowNumber: 4,
    cells: cells({ type: 'Envase', name: 'Bidón', lot: 'L1' }),
    type: 'PACKAGING',
    productName: 'Bidón',
    status: 'duplicate',
    lot: 'L1',
    target: { kind: 'existing', productId: 'p1' },
  },
  {
    rowNumber: 7,
    cells: cells({ type: 'Maquina' }),
    type: null,
    productName: null,
    status: 'error',
    issues: [{ code: 'type_invalid', column: 'type', message: 'Tipo: no es uno de los tipos.' }],
  },
];

describe('plantilla', () => {
  it('R3 es un .csv con BOM, separador ; y el nombre fijo', () => {
    const template = buildInventoryImportTemplate();
    expect(template.fileName).toBe('plantilla-inventario.csv');
    expect(template.mimeType).toBe('text/csv;charset=utf-8');
    expect(template.content.startsWith(`${BOM}Tipo;Nombre;`)).toBe(true);
  });

  it('R3 trae exactamente las columnas de la plantilla, en orden, y una sola fila de ejemplo', () => {
    const [header, ...rows] = parse(buildInventoryImportTemplate().content);
    expect(header).toEqual([
      'Tipo',
      'Nombre',
      'Unidad',
      'Presentación',
      'Fórmula',
      'Existencia',
      'Costo unitario',
      'Costo total',
      'Lote',
      'Fecha de compra',
      'Fecha de vencimiento',
      'Alerta de cantidad',
    ]);
    expect(header).toEqual(HEADERS);
    expect(rows).toEqual([INVENTORY_IMPORT_COLUMNS.map((column) => IMPORT_EXAMPLE_ROW[column.key])]);
  });

  it('R3 R8 la plantilla sin tocar vuelve a leerse como solo la fila de ejemplo', () => {
    const read = readCsv(new TextEncoder().encode(buildInventoryImportTemplate().content));
    expect(parseImportSheet(read)).toEqual({ ok: false, rejection: { code: 'empty' } });
  });
});

describe('archivo de errores', () => {
  it('R28 se llama como el origen con -errores.csv, con BOM y separador ;', () => {
    const file = buildInventoryImportErrorFile(ROWS, 'inventario marzo.xlsx');
    expect(file.fileName).toBe('inventario marzo-errores.csv');
    expect(file.mimeType).toBe('text/csv;charset=utf-8');
    expect(file.content.startsWith(`${BOM}Fila;Tipo;`)).toBe(true);
  });

  it('R28 lleva «Fila», las columnas de la plantilla y «Motivo», en ese orden', () => {
    const [header] = parse(buildInventoryImportErrorFile(ROWS, 'a.csv').content);
    expect(header).toEqual(['Fila', ...HEADERS, 'Motivo']);
  });

  it('R28 solo lleva las filas en error, con su numero, sus valores originales y los motivos unidos', () => {
    const [, ...rows] = parse(buildInventoryImportErrorFile(ROWS, 'a.csv').content);
    expect(rows).toEqual([
      [
        '3',
        ...INVENTORY_IMPORT_COLUMNS.map((column) => TRICKY[column.key]),
        'Existencia: usa un solo separador decimal. | Unidad: no existe.',
      ],
      ['7', 'Maquina', ...HEADERS.slice(1).map(() => ''), 'Tipo: no es uno de los tipos.'],
    ]);
  });

  it('R28 escapa separador, comillas y saltos de linea dentro de una celda', () => {
    const { content } = buildInventoryImportErrorFile(ROWS, 'a.csv');
    expect(content).toContain('"Sal; ""fina""\nde mesa"');
  });

  it('R28 sin filas en error deja solo la cabecera', () => {
    const rows = parse(buildInventoryImportErrorFile([ROWS[0]!, ROWS[2]!], 'a.csv').content);
    expect(rows).toEqual([['Fila', ...HEADERS, 'Motivo']]);
  });

  it('R28 sirve con las filas del resultado de la confirmacion', () => {
    const result: ImportResultRow[] = [
      { rowNumber: 2, cells: cells({ name: 'A' }), type: 'PRODUCT', productName: 'A', status: 'created', productId: 'p', lot: '1' },
      {
        rowNumber: 3,
        cells: cells({ type: 'Insumo', name: 'B' }),
        type: 'PRODUCT',
        productName: 'B',
        status: 'error',
        issues: [{ code: 'write_failed', column: null, message: 'No se pudo guardar la fila.' }],
      },
    ];
    const [, ...rows] = parse(buildInventoryImportErrorFile(result, 'a.csv').content);
    expect(rows.map((row) => [row[0], row[2], row.at(-1)])).toEqual([['3', 'B', 'No se pudo guardar la fila.']]);
  });

  it('R28 el archivo de errores se vuelve a subir sin rechazo de cabecera y con los mismos valores', () => {
    const { content } = buildInventoryImportErrorFile(ROWS, 'a.csv');
    const outcome = parseImportSheet(readCsv(new TextEncoder().encode(content)));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.sheet.rows.map((row) => row.cells)).toEqual([TRICKY, cells({ type: 'Maquina' })]);
  });
});
