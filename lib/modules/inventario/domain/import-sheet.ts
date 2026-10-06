import type { SpreadsheetCell, SpreadsheetReadResult } from '../ports/spreadsheet-reader';

import {
  normalizeHeader,
  parseImportDate,
  parseImportDecimal,
  type ImportCellOrigin,
} from './import-cell-parsing';
import {
  INVENTORY_IMPORT_COLUMNS,
  INVENTORY_IMPORT_MAX_ROWS,
  type ImportCells,
  type ImportColumnKey,
  type ImportFileRejection,
} from './inventory-import-contract';
import { IMPORT_EXAMPLE_ROW } from './inventory-import-downloads';

export type ParsedImportRow = {
  /** 1 = cabecera, como en la hoja. */
  readonly rowNumber: number;
  readonly cells: ImportCells;
  readonly origins: Readonly<Record<ImportColumnKey, ImportCellOrigin>>;
};

export type ParsedImportSheet = {
  readonly rows: readonly ParsedImportRow[];
  readonly exampleRowIgnored: boolean;
};

export type ImportSheetOutcome =
  | { readonly ok: true; readonly sheet: ParsedImportSheet }
  | { readonly ok: false; readonly rejection: ImportFileRejection };

/** Las que añade el archivo de errores: se aceptan para poder volver a subirlo y no se leen. */
const IGNORED_HEADERS = new Set(['Fila', 'Motivo'].map(normalizeHeader));

const KEY_BY_HEADER = new Map<string, ImportColumnKey>(
  INVENTORY_IMPORT_COLUMNS.map((column) => [normalizeHeader(column.header), column.key]),
);

const HEADER_BY_KEY = new Map<ImportColumnKey, string>(
  INVENTORY_IMPORT_COLUMNS.map((column) => [column.key, column.header]),
);

type ColumnMap = ReadonlyMap<number, ImportColumnKey>;

type HeaderOutcome =
  | { readonly ok: true; readonly columns: ColumnMap }
  | { readonly ok: false; readonly rejection: ImportFileRejection };

const reject = (rejection: ImportFileRejection): ImportSheetOutcome => ({ ok: false, rejection });

function isBlank(cell: SpreadsheetCell | undefined): boolean {
  return cell === undefined || cell.text.trim() === '';
}

function isBlankRow(row: readonly SpreadsheetCell[]): boolean {
  return row.every(isBlank);
}

function columnHasData(rows: readonly (readonly SpreadsheetCell[])[], index: number): boolean {
  return rows.some((row, rowIndex) => rowIndex > 0 && !isBlank(row[index]));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function mapHeader(rows: readonly (readonly SpreadsheetCell[])[]): HeaderOutcome {
  const header = rows[0] ?? [];
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columns = new Map<number, ImportColumnKey>();
  const unknown: string[] = [];
  const duplicated: string[] = [];

  for (let index = 0; index < width; index++) {
    const text = header[index]?.text.trim() ?? '';
    const normalized = normalizeHeader(text);
    if (normalized === '') {
      // Una columna con datos y sin cabecera tambien se nombra: ignorarla perderia esos valores sin aviso.
      if (columnHasData(rows, index)) unknown.push(`Columna ${index + 1}`);
      continue;
    }
    if (IGNORED_HEADERS.has(normalized)) continue;

    const key = KEY_BY_HEADER.get(normalized);
    if (key === undefined) unknown.push(text);
    else if ([...columns.values()].includes(key)) duplicated.push(HEADER_BY_KEY.get(key) ?? text);
    else columns.set(index, key);
  }

  const present = new Set(columns.values());
  const missing = INVENTORY_IMPORT_COLUMNS.filter((column) => column.headerRequired && !present.has(column.key));
  if (missing.length > 0) {
    return { ok: false, rejection: { code: 'missing_columns', columns: missing.map((column) => column.header) } };
  }
  if (unknown.length > 0) return { ok: false, rejection: { code: 'unknown_columns', columns: unique(unknown) } };
  if (duplicated.length > 0) {
    return { ok: false, rejection: { code: 'duplicate_columns', columns: unique(duplicated) } };
  }
  return { ok: true, columns };
}

function toParsedRow(row: readonly SpreadsheetCell[], rowNumber: number, columns: ColumnMap): ParsedImportRow {
  const cells = {} as Record<ImportColumnKey, string>;
  const origins = {} as Record<ImportColumnKey, ImportCellOrigin>;
  for (const column of INVENTORY_IMPORT_COLUMNS) {
    cells[column.key] = '';
    origins[column.key] = 'text';
  }
  for (const [index, key] of columns) {
    const cell = row[index];
    if (cell === undefined) continue;
    cells[key] = cell.text;
    origins[key] = cell.origin;
  }
  return { rowNumber, cells, origins };
}

const DECIMAL_COLUMNS = new Set<ImportColumnKey>(['stock', 'unitCost', 'totalCost', 'qtyAlert']);
const DATE_COLUMNS = new Set<ImportColumnKey>(['purchaseDate', 'expiryDate']);
const PLAIN_DECIMAL = /^(\d*)(?:\.(\d*))?$/;

function collapseSpaces(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** `3,50`, `3.5` y `03.500` son el mismo numero: se quitan ceros a la izquierda y a la derecha. */
function canonicalDecimal(value: string): string {
  const match = PLAIN_DECIMAL.exec(value);
  if (match === null) return value;
  const whole = (match[1] ?? '').replace(/^0+(?=\d)/, '') || '0';
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  return fraction === '' ? whole : `${whole}.${fraction}`;
}

/** Si la celda no se puede leer como numero o fecha, se compara como texto y no casa con el ejemplo. */
function canonicalCell(key: ImportColumnKey, text: string, origin: ImportCellOrigin): string {
  if (DECIMAL_COLUMNS.has(key)) {
    const parsed = parseImportDecimal(text, origin);
    if (parsed.kind === 'value') return canonicalDecimal(parsed.value);
  } else if (DATE_COLUMNS.has(key)) {
    const parsed = parseImportDate(text);
    if (parsed.kind === 'value') return parsed.value;
  }
  return collapseSpaces(text);
}

const CANONICAL_EXAMPLE = new Map<ImportColumnKey, string>(
  INVENTORY_IMPORT_COLUMNS.map((column) => [
    column.key,
    canonicalCell(column.key, IMPORT_EXAMPLE_ROW[column.key], 'text'),
  ]),
);

function isExampleRow(row: ParsedImportRow): boolean {
  return INVENTORY_IMPORT_COLUMNS.every(
    (column) =>
      canonicalCell(column.key, row.cells[column.key], row.origins[column.key]) ===
      CANONICAL_EXAMPLE.get(column.key),
  );
}

export function parseImportSheet(read: SpreadsheetReadResult): ImportSheetOutcome {
  if (read.kind === 'unreadable') return reject({ code: 'unreadable' });
  if (read.rows.every(isBlankRow)) return reject({ code: 'empty' });

  const header = mapHeader(read.rows);
  if (!header.ok) return header;
  const { columns } = header;

  const rows: ParsedImportRow[] = [];
  let exampleRowIgnored = false;
  read.rows.forEach((row, index) => {
    if (index === 0 || isBlankRow(row)) return;
    const parsed = toParsedRow(row, index + 1, columns);
    if (isExampleRow(parsed)) exampleRowIgnored = true;
    else rows.push(parsed);
  });

  if (rows.length === 0) return reject({ code: 'empty' });
  if (rows.length > INVENTORY_IMPORT_MAX_ROWS) {
    return reject({ code: 'too_many_rows', rows: rows.length, maxRows: INVENTORY_IMPORT_MAX_ROWS });
  }
  return { ok: true, sheet: { rows, exampleRowIgnored } };
}
