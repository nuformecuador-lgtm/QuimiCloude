export const IMPORT_PAGE_TITLE = 'Importar inventario';
export const IMPORT_PAGE_DESCRIPTION =
  'Sube un archivo .xlsx o .csv con las columnas de la plantilla. Antes de importar verás qué se crea, qué suma un lote y qué filas tienen error.';
export const IMPORT_BACK_LABEL = 'Volver a inventario';

export const IMPORT_SCREEN_TESTID = 'inventory-import-screen';
export const IMPORT_TITLE_TESTID = 'inventory-import-title';
export const IMPORT_BACK_LINK_TESTID = 'inventory-import-back-link';

export const UPLOAD_INPUT_LABEL = 'Archivo de inventario';
export const UPLOAD_TRIGGER_LABEL = 'Elegir archivo';
export const UPLOAD_CHANGE_LABEL = 'Elegir otro archivo';
export const UPLOAD_NO_FILE = 'Ningún archivo elegido.';

export const UPLOAD_FIELD_TESTID = 'inventory-import-upload';
export const UPLOAD_INPUT_TESTID = 'inventory-import-upload-input';
export const UPLOAD_TRIGGER_TESTID = 'inventory-import-upload-trigger';
export const UPLOAD_FILE_NAME_TESTID = 'inventory-import-upload-file-name';
export const UPLOAD_TOO_LARGE_TESTID = 'inventory-import-upload-too-large';

export const TEMPLATE_BUTTON_LABEL = 'Descargar plantilla';
export const TEMPLATE_BUTTON_TESTID = 'inventory-import-template';

export const REJECTION_TITLE = 'El archivo se rechazó entero: no se revisó ninguna fila.';
export const REJECTION_TESTID = 'inventory-import-rejection';
export const REJECTION_MESSAGE_TESTID = 'inventory-import-rejection-message';
export const REJECTION_COLUMN_TESTID = 'inventory-import-rejection-column';

const NUMBER_LOCALE = 'es';

export function formatCount(value: number): string {
  return new Intl.NumberFormat(NUMBER_LOCALE).format(value);
}

export function formatBytes(bytes: number): string {
  const megabytes = bytes / 1_000_000;
  if (megabytes >= 1) {
    return new Intl.NumberFormat(NUMBER_LOCALE, {
      style: 'unit',
      unit: 'megabyte',
      maximumFractionDigits: 1,
    }).format(megabytes);
  }
  return new Intl.NumberFormat(NUMBER_LOCALE, {
    style: 'unit',
    unit: 'kilobyte',
    maximumFractionDigits: 0,
  }).format(Math.max(1, bytes / 1_000));
}

export function uploadHint(maxBytes: number, maxRows: number): string {
  return `Formatos .xlsx o .csv, hasta ${formatBytes(maxBytes)} y ${formatCount(maxRows)} filas.`;
}

export function tooLargeWarning(bytes: number, maxBytes: number): string {
  return `El archivo pesa ${formatBytes(bytes)} y el máximo es ${formatBytes(maxBytes)}. Pártelo en varios archivos más pequeños.`;
}

export const REJECTION_MESSAGES = {
  unsupported_format: 'El archivo no es un .xlsx ni un .csv, o su contenido no corresponde a su extensión.',
  unreadable: 'No se pudo leer el contenido del archivo.',
  empty: 'El archivo no trae ninguna fila de datos.',
  missing_columns: 'Faltan estas columnas obligatorias de la plantilla:',
  unknown_columns: 'Estas columnas no son de la plantilla:',
  duplicate_columns: 'Estas columnas están repetidas:',
} as const;

export function tooManyRowsMessage(rows: number, maxRows: number): string {
  return `El archivo trae ${formatCount(rows)} filas y el máximo es ${formatCount(maxRows)}. Pártelo en varios archivos.`;
}
