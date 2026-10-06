import type { ImportCellOrigin } from '../domain/import-cell-parsing';
import type { InventoryImportFormat } from '../domain/inventory-import-contract';

/** Texto canonico: los numeros nativos como decimal sin exponente, las fechas nativas como `AAAA-MM-DD`. */
export type SpreadsheetCell = { readonly text: string; readonly origin: ImportCellOrigin };

/** La fila 0 es la cabecera. Las filas en blanco llegan tambien, para que el numero de fila sea el de la hoja. */
export type SpreadsheetReadResult =
  | { readonly kind: 'ok'; readonly rows: readonly (readonly SpreadsheetCell[])[] }
  | { readonly kind: 'unreadable' };

export interface SpreadsheetReader {
  read(bytes: Uint8Array, format: InventoryImportFormat): Promise<SpreadsheetReadResult>;
}
