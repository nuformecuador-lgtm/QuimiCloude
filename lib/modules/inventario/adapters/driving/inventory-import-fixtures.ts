import {
  INVENTORY_IMPORT_COLUMNS,
  PRODUCT_TYPES,
  type ImportAlreadyDone,
  type ImportCells,
  type ImportColumnKey,
  type ImportFileRejected,
  type ImportPreviewRow,
  type ImportResultRow,
  type InventoryImportFormat,
  type InventoryImportPreview,
  type InventoryImportResult,
} from '@/lib/modules/inventario';

export const REJECTED_FILE_NAME_PREFIX = 'rechazado';
export const ALREADY_IMPORTED_KEY = '00000000-0000-4000-8000-000000000000';

const EXISTING_PACKAGING_ID = '11111111-1111-4111-8111-111111111111';
const EXISTING_MACHINE_ID = '22222222-2222-4222-8222-222222222222';
const CREATED_PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const IMPORT_ID = '44444444-4444-4444-8444-444444444444';
const IMPORTED_AT = '2026-10-06T12:00:00.000Z';

function cells(values: Partial<Record<ImportColumnKey, string>>): ImportCells {
  const entries = INVENTORY_IMPORT_COLUMNS.map((column) => [column.key, values[column.key] ?? '']);
  return Object.fromEntries(entries) as ImportCells;
}

const ROW_CREATE = {
  rowNumber: 3,
  type: PRODUCT_TYPES.PRODUCT,
  productName: 'Ácido cítrico',
  cells: cells({ type: 'Insumo', name: 'Ácido cítrico', unit: 'kilogramo', stock: '25', unitCost: '3,50', lot: 'AC-001', qtyAlert: '5' }),
} as const;

const ROW_ADD_EXISTING = {
  rowNumber: 4,
  type: PRODUCT_TYPES.PACKAGING,
  productName: 'Frasco ámbar',
  cells: cells({ type: 'Envase', name: 'Frasco ámbar', presentation: 'Frasco 500 mL', stock: '100', totalCost: '250', lot: 'FA-017', qtyAlert: '20' }),
} as const;

const ROW_DUPLICATE = {
  rowNumber: 5,
  type: PRODUCT_TYPES.MACHINE,
  productName: 'Balanza analítica',
  cells: cells({ type: 'Instrumento', name: 'Balanza analítica', stock: '1', lot: 'BA-01' }),
} as const;

const ROW_ADD_FILE = {
  rowNumber: 6,
  type: PRODUCT_TYPES.PRODUCT,
  productName: 'Ácido cítrico',
  cells: cells({ type: 'Insumo', name: 'Ácido cítrico', unit: 'kilogramo', stock: '10', unitCost: '3,40', lot: 'AC-002', qtyAlert: '5' }),
} as const;

const ROW_MISSING_UNIT = {
  rowNumber: 7,
  type: PRODUCT_TYPES.PRODUCT,
  productName: 'Glicerina',
  cells: cells({ type: 'Insumo', name: 'Glicerina', unit: 'Galón', stock: '4', unitCost: '12', qtyAlert: '1' }),
  issues: [{ code: 'unit_not_found', column: 'unit', message: 'Unidad: «Galón» no existe.' }],
} as const;

const ROW_MISSING_PRESENTATION = {
  rowNumber: 8,
  type: PRODUCT_TYPES.PACKAGING,
  productName: 'Bidón',
  cells: cells({ type: 'Envase', name: 'Bidón', presentation: 'Bidón 20 L', stock: '30', unitCost: '2', qtyAlert: '10' }),
  issues: [{ code: 'presentation_not_found', column: 'presentation', message: 'Presentación: «Bidón 20 L» no existe.' }],
} as const;

const PREVIEW_ROWS: readonly ImportPreviewRow[] = [
  { ...ROW_CREATE, status: 'create' },
  { ...ROW_ADD_EXISTING, status: 'add_batch', target: { kind: 'existing', productId: EXISTING_PACKAGING_ID } },
  { ...ROW_DUPLICATE, status: 'duplicate', lot: 'BA-01', target: { kind: 'existing', productId: EXISTING_MACHINE_ID } },
  { ...ROW_ADD_FILE, status: 'add_batch', target: { kind: 'file_row', rowNumber: ROW_CREATE.rowNumber } },
  { ...ROW_MISSING_UNIT, status: 'error' },
  { ...ROW_MISSING_PRESENTATION, status: 'error' },
];

const RESULT_ROWS: readonly ImportResultRow[] = [
  { ...ROW_CREATE, status: 'created', productId: CREATED_PRODUCT_ID, lot: 'AC-001' },
  { ...ROW_ADD_EXISTING, status: 'batch_added', productId: EXISTING_PACKAGING_ID, lot: 'FA-017' },
  { ...ROW_DUPLICATE, status: 'duplicate', lot: 'BA-01' },
  { ...ROW_ADD_FILE, status: 'batch_added', productId: CREATED_PRODUCT_ID, lot: 'AC-002' },
  { ...ROW_MISSING_UNIT, status: 'error' },
  { ...ROW_MISSING_PRESENTATION, status: 'error' },
];

function countStatus(rows: readonly { status: string }[], status: string): number {
  return rows.filter((row) => row.status === status).length;
}

function formatOf(fileName: string): InventoryImportFormat {
  return fileName.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
}

export function previewFixture(fileName: string): InventoryImportPreview {
  return {
    kind: 'preview',
    fileName,
    format: formatOf(fileName),
    exampleRowIgnored: true,
    totals: {
      rows: PREVIEW_ROWS.length,
      create: countStatus(PREVIEW_ROWS, 'create'),
      addBatch: countStatus(PREVIEW_ROWS, 'add_batch'),
      duplicate: countStatus(PREVIEW_ROWS, 'duplicate'),
      error: countStatus(PREVIEW_ROWS, 'error'),
    },
    rows: PREVIEW_ROWS,
    missingUnits: [{ name: 'Galón', rowNumbers: [ROW_MISSING_UNIT.rowNumber] }],
    missingPresentations: [{ name: 'Bidón 20 L', rowNumbers: [ROW_MISSING_PRESENTATION.rowNumber] }],
    canCreateUnits: true,
    canCreatePresentations: true,
  };
}

export function resultFixture(fileName: string): InventoryImportResult {
  return {
    kind: 'imported',
    importId: IMPORT_ID,
    importedAt: IMPORTED_AT,
    fileName,
    exampleRowIgnored: true,
    totals: {
      rows: RESULT_ROWS.length,
      created: countStatus(RESULT_ROWS, 'created'),
      batchAdded: countStatus(RESULT_ROWS, 'batch_added'),
      duplicate: countStatus(RESULT_ROWS, 'duplicate'),
      error: countStatus(RESULT_ROWS, 'error'),
    },
    rows: RESULT_ROWS,
  };
}

export const ALREADY_IMPORTED_FIXTURE: ImportAlreadyDone = {
  kind: 'already_imported',
  importId: IMPORT_ID,
  importedAt: IMPORTED_AT,
};

export const REJECTED_FIXTURE: ImportFileRejected = {
  kind: 'file_rejected',
  rejection: { code: 'missing_columns', columns: ['Existencia'] },
};
