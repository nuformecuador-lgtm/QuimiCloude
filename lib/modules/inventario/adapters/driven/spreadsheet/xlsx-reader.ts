import { readSheet, type CellValue } from 'read-excel-file/node';

import type { SpreadsheetCell, SpreadsheetReadResult } from '../../../ports/spreadsheet-reader';

const MAX_DECIMALS = 4;
const LIBRARY_ERRORS = new Set(['InvalidInputError', 'InvalidSpreadsheetError', 'SheetNotFoundError']);

const UP_TO_FOUR_DECIMALS = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  maximumFractionDigits: MAX_DECIMALS,
});
const ALL_DECIMALS = new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 20 });

/**
 * El ruido binario de un decimal (`0.1 + 0.2`) no cuenta como decimal de mas. Si sobran decimales de
 * verdad se escriben todos, para que la lectura los rechace en vez de redondearlos sin aviso.
 */
function numberText(value: number): string {
  const scaled = value * 10 ** MAX_DECIMALS;
  const hasMoreDecimals = Math.abs(scaled - Math.round(scaled)) > 1e-6;
  return (hasMoreDecimals ? ALL_DECIMALS : UP_TO_FOUR_DECIMALS).format(value);
}

function toCell(value: CellValue | null): SpreadsheetCell {
  if (value === null) return { text: '', origin: 'text' };
  if (typeof value === 'number') return { text: numberText(value), origin: 'number' };
  // Las fechas llegan como medianoche UTC del dia de la celda.
  if (value instanceof Date) return { text: value.toISOString().slice(0, 10), origin: 'date' };
  return { text: String(value), origin: 'text' };
}

function isLibraryError(error: unknown): boolean {
  return error instanceof Error && LIBRARY_ERRORS.has(error.name);
}

export async function readXlsx(bytes: Uint8Array): Promise<SpreadsheetReadResult> {
  try {
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const rows = await readSheet(buffer, 1, { trim: false });
    return { kind: 'ok', rows: rows.map((row) => row.map(toCell)) };
  } catch (error) {
    if (isLibraryError(error)) return { kind: 'unreadable' };
    throw error;
  }
}
