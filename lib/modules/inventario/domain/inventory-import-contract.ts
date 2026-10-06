import type { Actor } from './actor';
import type { ProductType } from './product-type';

export const INVENTORY_IMPORT_MAX_ROWS = 2000;
export const INVENTORY_IMPORT_MAX_FILE_BYTES = 1_000_000;
export const INVENTORY_IMPORT_ACCEPT = '.xlsx,.csv';
export type InventoryImportFormat = 'xlsx' | 'csv';

/** El tipo de producto tal como viaja en el contrato. */
export type ImportRowType = ProductType;

/** Lo que se escribe en la columna «Tipo». Se compara sin mayúsculas, tildes ni espacios de los extremos. */
export const IMPORT_TYPE_LABELS = {
  PRODUCT: 'Insumo',
  PACKAGING: 'Envase',
  MACHINE: 'Instrumento',
  FINISHED_PRODUCT: 'Producto terminado',
} as const satisfies Record<ImportRowType, string>;

/** 'required' = la fila de ese tipo la exige; 'optional' = puede ir vacía; 'forbidden' = DEBE ir vacía. */
export type ImportColumnRule = 'required' | 'optional' | 'forbidden';

export const INVENTORY_IMPORT_COLUMNS = [
  { key: 'type',         header: 'Tipo',                 headerRequired: true,  rules: { PRODUCT: 'required',  PACKAGING: 'required',  MACHINE: 'required',  FINISHED_PRODUCT: 'required'  } },
  { key: 'name',         header: 'Nombre',               headerRequired: true,  rules: { PRODUCT: 'required',  PACKAGING: 'required',  MACHINE: 'required',  FINISHED_PRODUCT: 'forbidden' } },
  { key: 'unit',         header: 'Unidad',               headerRequired: false, rules: { PRODUCT: 'required',  PACKAGING: 'forbidden', MACHINE: 'forbidden', FINISHED_PRODUCT: 'forbidden' } },
  { key: 'presentation', header: 'Presentación',         headerRequired: false, rules: { PRODUCT: 'forbidden', PACKAGING: 'required',  MACHINE: 'forbidden', FINISHED_PRODUCT: 'required'  } },
  { key: 'formula',      header: 'Fórmula',              headerRequired: false, rules: { PRODUCT: 'forbidden', PACKAGING: 'forbidden', MACHINE: 'forbidden', FINISHED_PRODUCT: 'required'  } },
  { key: 'stock',        header: 'Existencia',           headerRequired: true,  rules: { PRODUCT: 'required',  PACKAGING: 'required',  MACHINE: 'required',  FINISHED_PRODUCT: 'required'  } },
  { key: 'unitCost',     header: 'Costo unitario',       headerRequired: false, rules: { PRODUCT: 'optional',  PACKAGING: 'optional',  MACHINE: 'optional',  FINISHED_PRODUCT: 'optional'  } },
  { key: 'totalCost',    header: 'Costo total',          headerRequired: false, rules: { PRODUCT: 'optional',  PACKAGING: 'optional',  MACHINE: 'optional',  FINISHED_PRODUCT: 'optional'  } },
  { key: 'lot',          header: 'Lote',                 headerRequired: false, rules: { PRODUCT: 'optional',  PACKAGING: 'optional',  MACHINE: 'optional',  FINISHED_PRODUCT: 'optional'  } },
  { key: 'purchaseDate', header: 'Fecha de compra',      headerRequired: false, rules: { PRODUCT: 'optional',  PACKAGING: 'optional',  MACHINE: 'optional',  FINISHED_PRODUCT: 'optional'  } },
  { key: 'expiryDate',   header: 'Fecha de vencimiento', headerRequired: false, rules: { PRODUCT: 'optional',  PACKAGING: 'forbidden', MACHINE: 'optional',  FINISHED_PRODUCT: 'optional'  } },
  { key: 'qtyAlert',     header: 'Alerta de cantidad',   headerRequired: false, rules: { PRODUCT: 'required',  PACKAGING: 'required',  MACHINE: 'forbidden', FINISHED_PRODUCT: 'forbidden' } },
] as const satisfies readonly {
  key: string;
  header: string;
  headerRequired: boolean;
  rules: Record<ImportRowType, ImportColumnRule>;
}[];

export type ImportColumnKey = (typeof INVENTORY_IMPORT_COLUMNS)[number]['key'];

/** Valores originales de la fila, como texto, tal como se leyeron (sin normalizar). Columna ausente = ''. */
export type ImportCells = Readonly<Record<ImportColumnKey, string>>;

export const IMPORT_ROW_ISSUE_CODES = [
  'type_invalid',
  'value_required',
  'column_not_applicable',
  'name_too_long',
  'unit_not_found',
  'unit_ambiguous',
  'presentation_not_found',
  'presentation_without_content',
  'presentation_mismatch',
  'formula_not_found',
  'finished_product_homonym',
  'stock_invalid',
  'stock_not_whole',
  'cost_required',
  'cost_invalid',
  'total_cost_too_low',
  'qty_alert_invalid',
  'number_format_invalid',
  'lot_invalid',
  'lot_used_by_other_product',
  'purchase_date_invalid',
  'purchase_date_future',
  'expiry_date_invalid',
  'write_failed',
] as const;
export type ImportRowIssueCode = (typeof IMPORT_ROW_ISSUE_CODES)[number];

export type ImportRowIssue = {
  readonly code: ImportRowIssueCode;
  /** La columna a la que apunta el motivo; `null` solo en `write_failed`. */
  readonly column: ImportColumnKey | null;
  /** Texto en español, listo para pintar y para el archivo de errores. Nombra la columna. */
  readonly message: string;
};

type ImportRowBase = {
  /** Número de fila en la hoja, 1 = cabecera. Es el que ve el usuario en Excel. */
  readonly rowNumber: number;
  readonly cells: ImportCells;
  /** `null` cuando «Tipo» no se pudo leer. */
  readonly type: ImportRowType | null;
  /** Nombre con el que queda el producto (en terminado, el derivado). `null` si no se pudo resolver. */
  readonly productName: string | null;
};

/** A qué producto se suma el lote: uno que ya existe, o el que crea una fila anterior del mismo archivo. */
export type ImportBatchTarget =
  | { readonly kind: 'existing'; readonly productId: string }
  | { readonly kind: 'file_row'; readonly rowNumber: number };

export type ImportPreviewRow =
  | (ImportRowBase & { readonly status: 'create' })
  | (ImportRowBase & { readonly status: 'add_batch'; readonly target: ImportBatchTarget })
  | (ImportRowBase & { readonly status: 'duplicate'; readonly lot: string; readonly target: ImportBatchTarget })
  | (ImportRowBase & { readonly status: 'error'; readonly issues: readonly [ImportRowIssue, ...ImportRowIssue[]] });

export type ImportPreviewStatus = ImportPreviewRow['status'];

/** Un faltante, una sola vez, con las filas que lo nombran. `name` es el texto tal cual de la primera fila. */
export type ImportMissingEntry = { readonly name: string; readonly rowNumbers: readonly number[] };

export type ImportPreviewTotals = {
  readonly rows: number;
  readonly create: number;
  readonly addBatch: number;
  readonly duplicate: number;
  readonly error: number;
};

export type InventoryImportPreview = {
  readonly kind: 'preview';
  readonly fileName: string;
  readonly format: InventoryImportFormat;
  /** La fila de ejemplo de la plantilla vino y se ignoró. */
  readonly exampleRowIgnored: boolean;
  readonly totals: ImportPreviewTotals;
  /** En el orden del archivo. */
  readonly rows: readonly ImportPreviewRow[];
  readonly missingUnits: readonly ImportMissingEntry[];
  readonly missingPresentations: readonly ImportMissingEntry[];
  /** Solo decide si se ofrece el botón de alta; el service vuelve a mirar el permiso. */
  readonly canCreateUnits: boolean;
  readonly canCreatePresentations: boolean;
};

/** Va como dato y no como `ErrorState` porque lleva valores variables (columnas, cuentas) y
 *  `ErrorState` es un catálogo cerrado. */
export type ImportFileRejection =
  | { readonly code: 'unsupported_format' }
  | { readonly code: 'unreadable' }
  | { readonly code: 'empty' }
  | { readonly code: 'file_too_large'; readonly bytes: number; readonly maxBytes: number }
  | { readonly code: 'too_many_rows'; readonly rows: number; readonly maxRows: number }
  | { readonly code: 'missing_columns'; readonly columns: readonly string[] }
  | { readonly code: 'unknown_columns'; readonly columns: readonly string[] }
  | { readonly code: 'duplicate_columns'; readonly columns: readonly string[] };

export type ImportFileRejected = { readonly kind: 'file_rejected'; readonly rejection: ImportFileRejection };

export type InventoryImportPreviewOutcome = InventoryImportPreview | ImportFileRejected;

export type ImportResultRow =
  | (ImportRowBase & { readonly status: 'created'; readonly productId: string; readonly lot: string })
  | (ImportRowBase & { readonly status: 'batch_added'; readonly productId: string; readonly lot: string })
  | (ImportRowBase & { readonly status: 'duplicate'; readonly lot: string })
  | (ImportRowBase & { readonly status: 'error'; readonly issues: readonly [ImportRowIssue, ...ImportRowIssue[]] });

export type ImportResultTotals = {
  readonly rows: number;
  readonly created: number;
  readonly batchAdded: number;
  readonly duplicate: number;
  readonly error: number;
};

export type InventoryImportResult = {
  readonly kind: 'imported';
  readonly importId: string;
  /** ISO 8601, instante de la confirmación. */
  readonly importedAt: string;
  readonly fileName: string;
  readonly exampleRowIgnored: boolean;
  readonly totals: ImportResultTotals;
  readonly rows: readonly ImportResultRow[];
};

/** La misma `importKey` ya se confirmó en esta empresa. No se escribe nada. */
export type ImportAlreadyDone = {
  readonly kind: 'already_imported';
  readonly importId: string;
  readonly importedAt: string;
};

export type InventoryImportConfirmOutcome = InventoryImportResult | ImportAlreadyDone | ImportFileRejected;

export type InventoryImportFile = { readonly fileName: string; readonly bytes: Uint8Array };

export type PreviewInventoryImport = (
  input: InventoryImportFile,
  actor: Actor | null | undefined,
) => Promise<InventoryImportPreviewOutcome>;

export type ConfirmInventoryImport = (
  input: InventoryImportFile & { readonly importKey: string },
  actor: Actor | null | undefined,
) => Promise<InventoryImportConfirmOutcome>;
