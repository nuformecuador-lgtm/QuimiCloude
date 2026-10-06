import {
  INVENTORY_IMPORT_COLUMNS,
  PRODUCT_TYPES,
  type ImportCells,
  type ImportColumnKey,
  type ImportPreviewRow,
  type ImportResultRow,
  type InventoryImportPreview,
  type InventoryImportResult,
} from '@/lib/modules/inventario';

export const PRODUCTO_EXISTENTE = '11111111-1111-4111-8111-111111111111';
export const PRODUCTO_CREADO = '33333333-3333-4333-8333-333333333333';

export function celdas(valores: Partial<Record<ImportColumnKey, string>>): ImportCells {
  const entradas = INVENTORY_IMPORT_COLUMNS.map((columna) => [columna.key, valores[columna.key] ?? '']);
  return Object.fromEntries(entradas) as ImportCells;
}

const FILA_CREAR = {
  rowNumber: 3,
  type: PRODUCT_TYPES.PRODUCT,
  productName: 'Ácido cítrico',
  cells: celdas({ type: 'Insumo', name: 'Ácido cítrico', unit: 'kilogramo', stock: '25', lot: 'AC-001' }),
} as const;

const FILA_SUMA_EXISTENTE = {
  rowNumber: 4,
  type: PRODUCT_TYPES.PACKAGING,
  productName: 'Frasco ámbar',
  cells: celdas({ type: 'Envase', name: 'Frasco ámbar', presentation: 'Frasco 500 mL', stock: '100' }),
} as const;

const FILA_DUPLICADA = {
  rowNumber: 5,
  type: PRODUCT_TYPES.MACHINE,
  productName: 'Balanza analítica',
  cells: celdas({ type: 'Instrumento', name: 'Balanza analítica', stock: '1', lot: 'BA-01' }),
} as const;

const FILA_SUMA_ARCHIVO = {
  rowNumber: 6,
  type: PRODUCT_TYPES.PRODUCT,
  productName: 'Ácido cítrico',
  cells: celdas({ type: 'Insumo', name: 'Ácido cítrico', unit: 'kilogramo', stock: '10', lot: 'AC-002' }),
} as const;

const FILA_SIN_UNIDAD = {
  rowNumber: 7,
  type: PRODUCT_TYPES.PRODUCT,
  productName: 'Glicerina',
  cells: celdas({ type: 'Insumo', name: 'Glicerina', unit: 'Galón', stock: '4,5,1' }),
  issues: [
    { code: 'unit_not_found', column: 'unit', message: 'Unidad: «Galón» no existe.' },
    { code: 'number_format_invalid', column: 'stock', message: 'Existencia: «4,5,1» no es un número.' },
  ],
} as const;

const FILA_SIN_PRESENTACION = {
  rowNumber: 8,
  type: PRODUCT_TYPES.PACKAGING,
  productName: 'Bidón',
  cells: celdas({ type: 'Envase', name: 'Bidón', presentation: 'Bidón 20 L', stock: '30' }),
  issues: [
    { code: 'presentation_not_found', column: 'presentation', message: 'Presentación: «Bidón 20 L» no existe.' },
  ],
} as const;

export const FILAS_VISTA_PREVIA: readonly ImportPreviewRow[] = [
  { ...FILA_CREAR, status: 'create' },
  { ...FILA_SUMA_EXISTENTE, status: 'add_batch', target: { kind: 'existing', productId: PRODUCTO_EXISTENTE } },
  { ...FILA_DUPLICADA, status: 'duplicate', lot: 'BA-01', target: { kind: 'existing', productId: PRODUCTO_EXISTENTE } },
  { ...FILA_SUMA_ARCHIVO, status: 'add_batch', target: { kind: 'file_row', rowNumber: FILA_CREAR.rowNumber } },
  { ...FILA_SIN_UNIDAD, status: 'error' },
  { ...FILA_SIN_PRESENTACION, status: 'error' },
];

function contar<T extends { status: string }>(filas: readonly T[], estado: T['status']): number {
  return filas.filter((fila) => fila.status === estado).length;
}

export function vistaPrevia(cambios: Partial<InventoryImportPreview> = {}): InventoryImportPreview {
  const rows = cambios.rows ?? FILAS_VISTA_PREVIA;
  return {
    kind: 'preview',
    fileName: 'inventario.csv',
    format: 'csv',
    exampleRowIgnored: false,
    totals: {
      rows: rows.length,
      create: contar(rows, 'create'),
      addBatch: contar(rows, 'add_batch'),
      duplicate: contar(rows, 'duplicate'),
      error: contar(rows, 'error'),
    },
    rows,
    missingUnits: [{ name: 'Galón', rowNumbers: [7] }],
    missingPresentations: [{ name: 'Bidón 20 L', rowNumbers: [8] }],
    canCreateUnits: true,
    canCreatePresentations: true,
    ...cambios,
  };
}

/** Una vista previa en la que todas las filas fallan. */
export function vistaPreviaSinValidas(): InventoryImportPreview {
  return vistaPrevia({ rows: FILAS_VISTA_PREVIA.filter((fila) => fila.status === 'error') });
}

export const FILAS_RESULTADO: readonly ImportResultRow[] = [
  { ...FILA_CREAR, status: 'created', productId: PRODUCTO_CREADO, lot: 'AC-001' },
  { ...FILA_SUMA_EXISTENTE, status: 'batch_added', productId: PRODUCTO_EXISTENTE, lot: 'FA-017' },
  { ...FILA_DUPLICADA, status: 'duplicate', lot: 'BA-01' },
  { ...FILA_SUMA_ARCHIVO, status: 'batch_added', productId: PRODUCTO_CREADO, lot: 'AC-002' },
  { ...FILA_SIN_UNIDAD, status: 'error' },
  { ...FILA_SIN_PRESENTACION, status: 'error' },
];

export function resultado(cambios: Partial<InventoryImportResult> = {}): InventoryImportResult {
  const rows = cambios.rows ?? FILAS_RESULTADO;
  return {
    kind: 'imported',
    importId: '44444444-4444-4444-8444-444444444444',
    importedAt: '2026-10-06T12:00:00.000Z',
    fileName: 'inventario.csv',
    exampleRowIgnored: false,
    totals: {
      rows: rows.length,
      created: contar(rows, 'created'),
      batchAdded: contar(rows, 'batch_added'),
      duplicate: contar(rows, 'duplicate'),
      error: contar(rows, 'error'),
    },
    rows,
    ...cambios,
  };
}
