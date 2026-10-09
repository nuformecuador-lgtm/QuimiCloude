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

export const PREVIEW_STATUS_LABELS = {
  create: 'Crear',
  add_batch: 'Sumar lote',
  duplicate: 'Duplicado',
  error: 'Error',
} as const;

export const RESULT_STATUS_LABELS = {
  created: 'Creado',
  batch_added: 'Lote sumado',
  duplicate: 'Duplicado',
  error: 'Error',
} as const;

export const STATUS_FILTER_ALL_LABEL = 'Todas';
export const STATUS_FILTER_GROUP_LABEL = 'Filtrar filas por estado';

export const ROWS_COLUMN_LABELS = {
  row: 'Fila',
  status: 'Estado',
  product: 'Producto',
  detail: 'Detalle',
} as const;

export const PREVIEW_DETAIL_CREATE = 'Se crea como producto nuevo.';
export const PREVIEW_DETAIL_ADD_EXISTING = 'Suma un lote a un producto que ya existe.';

export function previewDetailAddFileRow(rowNumber: number): string {
  return `Suma un lote al producto que crea la fila ${formatCount(rowNumber)}.`;
}

export function duplicateLotDetail(lot: string): string {
  return `El lote ${lot} ya existe en este producto: no se importa.`;
}

export function createdLotDetail(lot: string): string {
  return `Producto creado con el lote ${lot}.`;
}

export function addedLotDetail(lot: string): string {
  return `Lote ${lot} sumado al producto.`;
}

export const PREVIEW_TOTAL_LABELS = {
  rows: 'Filas',
  create: 'Se crean',
  addBatch: 'Suman lote',
  duplicate: 'Duplicadas',
  error: 'Con error',
} as const;

export const RESULT_TOTAL_LABELS = {
  rows: 'Filas',
  created: 'Creadas',
  batchAdded: 'Lotes sumados',
  duplicate: 'Duplicadas',
  error: 'Con error',
} as const;

export const EXAMPLE_ROW_IGNORED_NOTICE =
  'La fila de ejemplo de la plantilla venía en el archivo y se ignoró: no se importa.';

export function confirmLabel(validRows: number): string {
  return validRows === 1 ? 'Importar 1 fila válida' : `Importar ${formatCount(validRows)} filas válidas`;
}
export const CONFIRMING_LABEL = 'Importando…';
export const NO_VALID_ROWS_NOTICE = 'No hay ninguna fila válida que importar.';
export const PARTIAL_IMPORT_NOTICE =
  'Las filas con error o duplicadas no se importan. Puedes importar ahora las válidas y corregir el resto después.';
export const ERROR_FILE_BUTTON_LABEL = 'Descargar filas con error';

export const PREVIEW_SUMMARY_TESTID = 'inventory-import-preview-summary';
export const PREVIEW_TABLE_TESTID = 'inventory-import-preview-table';
export const RESULT_TABLE_TESTID = 'inventory-import-result-table';
export const EXAMPLE_ROW_NOTICE_TESTID = 'inventory-import-example-ignored';
export const CONFIRM_BUTTON_TESTID = 'inventory-import-confirm';
export const NO_VALID_ROWS_TESTID = 'inventory-import-no-valid-rows';
export const ERROR_FILE_BUTTON_TESTID = 'inventory-import-error-file';
export const STATUS_FILTER_TESTID = 'inventory-import-status-filter';
export const ROW_STATUS_TESTID = 'inventory-import-row-status';
export const ROW_DETAIL_TESTID = 'inventory-import-row-detail';
export const ROW_ISSUE_TESTID = 'inventory-import-row-issue';

export function totalTestId(key: string): string {
  return `inventory-import-total-${key}`;
}

export function statusFilterTestId(value: string): string {
  return `inventory-import-status-filter-${value}`;
}

export const ROWS_TABLE_TEXTS = {
  empty: 'No hay filas con este estado.',
  loading: 'Cargando filas…',
  error: 'No se pudieron mostrar las filas.',
  search: 'Buscar',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page: number, totalPages: number) => `Página ${page} de ${totalPages}`,
  pageSize: 'Filas por página',
  sortAscending: 'Orden ascendente',
  sortDescending: 'Orden descendente',
  pinColumn: 'Fijar columna',
  unpinColumn: 'Soltar columna',
  filterColumn: 'Filtrar columna',
  clearFilter: 'Limpiar filtro',
  lastWeek: 'Última semana',
  lastMonth: 'Último mes',
  lastYear: 'Último año',
  scrollLeft: 'Desplazar la tabla a la izquierda',
  scrollRight: 'Desplazar la tabla a la derecha',
} as const;

export const MISSING_SECTION_TITLE = 'Faltan en el catálogo';
export const MISSING_SECTION_DESCRIPTION =
  'Estas unidades y presentaciones no existen en la empresa. Las filas que las nombran quedan en error hasta que las crees; al crearlas se vuelve a revisar el archivo.';
export const MISSING_UNITS_TITLE = 'Unidades';
export const MISSING_PRESENTATIONS_TITLE = 'Presentaciones';
export const MISSING_CREATE_LABEL = 'Crear';

export function missingRowsLabel(rowNumbers: readonly number[]): string {
  const list = rowNumbers.map(formatCount).join(', ');
  return rowNumbers.length === 1 ? `Fila ${list}` : `Filas ${list}`;
}

export function missingCreateAriaLabel(name: string): string {
  return `Crear «${name}»`;
}

export const MISSING_SECTION_TESTID = 'inventory-import-missing';
export const MISSING_UNIT_TESTID = 'inventory-import-missing-unit';
export const MISSING_PRESENTATION_TESTID = 'inventory-import-missing-presentation';
export const MISSING_NAME_TESTID = 'inventory-import-missing-name';
export const MISSING_ROWS_TESTID = 'inventory-import-missing-rows';
export const MISSING_CREATE_TESTID = 'inventory-import-missing-create';

export const DIALOG_CANCEL_LABEL = 'Cancelar';
export const DIALOG_SAVE_LABEL = 'Crear';
export const DIALOG_SAVING_LABEL = 'Creando…';

export const UNIT_DIALOG_TITLE = 'Nueva unidad';
export const UNIT_DIALOG_DESCRIPTION = 'Se crea igual que desde la pantalla de unidades.';
export const UNIT_FIELD_LABELS = {
  name: 'Nombre',
  symbol: 'Símbolo',
  baseUnitId: 'Deriva de',
  factor: 'Factor',
} as const;
export const NO_BASE_UNIT_LABEL = 'No deriva de ninguna';

export const PRESENTATION_DIALOG_TITLE = 'Nueva presentación';
export const PRESENTATION_DIALOG_DESCRIPTION = 'Se crea igual que desde la pantalla de presentaciones.';
export const PRESENTATION_FIELD_LABELS = {
  name: 'Nombre',
  content: 'Contenido',
} as const;

export const UNIT_DIALOG_TESTID = 'inventory-import-unit-dialog';
export const PRESENTATION_DIALOG_TESTID = 'inventory-import-presentation-dialog';
export const DIALOG_FORM_ERROR_TESTID = 'inventory-import-dialog-error';
export const DIALOG_SUBMIT_TESTID = 'inventory-import-dialog-submit';
export const DIALOG_CANCEL_TESTID = 'inventory-import-dialog-cancel';

export function dialogFieldTestId(field: string): string {
  return `inventory-import-dialog-field-${field}`;
}

export function dialogFieldErrorTestId(field: string): string {
  return `inventory-import-dialog-error-${field}`;
}

export const REVIEW_BUTTON_LABEL = 'Revisar archivo';
export const REVIEWING_NOTICE = 'Revisando el archivo…';
export const PREVIEW_TITLE = 'Vista previa';
export const PREVIEW_DESCRIPTION = 'Todavía no se ha importado nada. Revisa las filas y confirma.';
export const RESULT_TITLE = 'Importación terminada';
export const RESTART_LABEL = 'Importar otro archivo';

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeStyle: 'short' });

export function formatImportedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME_FORMAT.format(date);
}

export function resultDescription(fileName: string, importedAt: string): string {
  return `«${fileName}» se importó el ${formatImportedAt(importedAt)}. Las filas duplicadas o con error no se importaron.`;
}

export const NOTHING_IMPORTED_TITLE = 'No se importó nada';

export function nothingImportedMessage(fileName: string): string {
  return `Al confirmar, «${fileName}» no tenía ninguna fila válida, así que no se ha importado nada. Revisa el motivo de cada fila, corrígelas y vuelve a subir el archivo.`;
}

export function alreadyImportedMessage(importedAt: string): string {
  return `Esta importación ya se había confirmado el ${formatImportedAt(importedAt)}. No se ha vuelto a escribir nada.`;
}

export const REVIEW_BUTTON_TESTID = 'inventory-import-review';
export const REVIEWING_TESTID = 'inventory-import-reviewing';
export const SCREEN_ERROR_TESTID = 'inventory-import-error';
export const RESULT_TESTID = 'inventory-import-result';
export const ALREADY_IMPORTED_TESTID = 'inventory-import-already-imported';
export const NOTHING_IMPORTED_TESTID = 'inventory-import-nothing-imported';
export const NOTHING_IMPORTED_MESSAGE_TESTID = 'inventory-import-nothing-imported-message';
export const RESTART_TESTID = 'inventory-import-restart';
