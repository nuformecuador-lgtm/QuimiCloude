import {
  INVENTORY_IMPORT_COLUMNS,
  type ImportCells,
  type ImportPreviewRow,
  type ImportResultRow,
} from './inventory-import-contract';

export type ImportDownload = {
  readonly fileName: string;
  readonly mimeType: 'text/csv;charset=utf-8';
  /** Con BOM UTF-8 al principio y separador ';': así lo abre en columnas Excel en español. */
  readonly content: string;
};

const BOM = '﻿';
const SEPARATOR = ';';
const LINE_BREAK = '\r\n';
const MIME_TYPE = 'text/csv;charset=utf-8';
const TEMPLATE_FILE_NAME = 'plantilla-inventario.csv';
const ERROR_ROW_HEADER = 'Fila';
const ERROR_REASON_HEADER = 'Motivo';
const REASON_SEPARATOR = ' | ';

/** La fila de ejemplo de la plantilla. Se compara celda a celda (recortada) para ignorarla al leer. */
export const IMPORT_EXAMPLE_ROW: ImportCells = {
  type: 'Insumo',
  name: 'Ejemplo ácido cítrico',
  unit: 'kilogramo',
  presentation: '',
  formula: '',
  stock: '25',
  unitCost: '3,50',
  totalCost: '',
  lot: 'EJEMPLO-001',
  purchaseDate: '2026-01-15',
  expiryDate: '2027-01-15',
  qtyAlert: '5',
};

function toCsv(lines: readonly (readonly string[])[]): string {
  return BOM + lines.map((cells) => cells.join(SEPARATOR)).join(LINE_BREAK) + LINE_BREAK;
}

function rowCells(cells: ImportCells): string[] {
  return INVENTORY_IMPORT_COLUMNS.map((column) => cells[column.key]);
}

export function buildInventoryImportTemplate(): ImportDownload {
  const header = INVENTORY_IMPORT_COLUMNS.map((column) => column.header);
  return {
    fileName: TEMPLATE_FILE_NAME,
    mimeType: MIME_TYPE,
    content: toCsv([header, rowCells(IMPORT_EXAMPLE_ROW)]),
  };
}

function errorFileName(sourceFileName: string): string {
  const dot = sourceFileName.lastIndexOf('.');
  const base = dot > 0 ? sourceFileName.slice(0, dot) : sourceFileName;
  return `${base}-errores.csv`;
}

// Todavía no escapa comillas ni separadores dentro de una celda.
export function buildInventoryImportErrorFile(
  rows: readonly (ImportPreviewRow | ImportResultRow)[],
  sourceFileName: string,
): ImportDownload {
  const header = [ERROR_ROW_HEADER, ...INVENTORY_IMPORT_COLUMNS.map((column) => column.header), ERROR_REASON_HEADER];
  const lines = rows.flatMap((row) =>
    row.status === 'error'
      ? [
          [
            String(row.rowNumber),
            ...rowCells(row.cells),
            row.issues.map((issue) => issue.message).join(REASON_SEPARATOR),
          ],
        ]
      : [],
  );
  return {
    fileName: errorFileName(sourceFileName),
    mimeType: MIME_TYPE,
    content: toCsv([header, ...lines]),
  };
}
