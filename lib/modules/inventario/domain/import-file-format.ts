import {
  INVENTORY_IMPORT_MAX_FILE_BYTES,
  type ImportFileRejection,
  type InventoryImportFormat,
} from './inventory-import-contract';

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04] as const;

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot + 1).trim().toLowerCase();
}

function startsWithZipSignature(bytes: Uint8Array): boolean {
  return ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function isUtf8Text(bytes: Uint8Array): boolean {
  if (startsWithZipSignature(bytes) || bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** Se mira la extension y tambien el contenido: un archivo renombrado no se lee como lo que no es. */
export function detectImportFileFormat(
  fileName: string,
  bytes: Uint8Array,
): InventoryImportFormat | ImportFileRejection {
  if (bytes.byteLength > INVENTORY_IMPORT_MAX_FILE_BYTES) {
    return { code: 'file_too_large', bytes: bytes.byteLength, maxBytes: INVENTORY_IMPORT_MAX_FILE_BYTES };
  }

  const extension = extensionOf(fileName);
  if (extension !== 'xlsx' && extension !== 'csv') return { code: 'unsupported_format' };
  if (bytes.byteLength === 0) return { code: 'empty' };

  if (extension === 'xlsx') return startsWithZipSignature(bytes) ? 'xlsx' : { code: 'unsupported_format' };
  return isUtf8Text(bytes) ? 'csv' : { code: 'unsupported_format' };
}
