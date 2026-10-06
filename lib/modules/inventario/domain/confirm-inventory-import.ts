import { requirePermission, type Actor } from './actor';
import { ActionNotAllowedError, BatchDuplicateLotError } from './errors';
import { createImportFinishedGoods } from './import-finished-goods';
import { importRowIssue, type ImportRowWrite } from './plan-inventory-import';
import { civilDateUtc, readInventoryImport, type InventoryImportReadDeps } from './preview-inventory-import';
import { PRODUCT_TYPES } from './product-type';

import type {
  ConfirmInventoryImport,
  ImportPreviewRow,
  ImportResultRow,
  ImportResultTotals,
  ImportRowIssue,
} from './inventory-import-contract';
import type { InventoryScope } from './inventory-scope';
import type { StockIncreaseListener } from './stock-increase-listener';
import type { FileDigest } from '../ports/file-digest';
import type { InventoryImportRepository } from '../ports/inventory-import-repository';

export type ConfirmInventoryImportDeps = InventoryImportReadDeps & {
  readonly imports: InventoryImportRepository;
  /** El alta manual de producto y lote, ya cableada: cada fila de insumo, envase o instrumento pasa por ella. */
  readonly createProduct: (input: unknown, actor: Actor) => Promise<{ id: string; lot?: string }>;
  readonly stockIncreases?: StockIncreaseListener;
  readonly digest: FileDigest;
};

function resultTotals(rows: readonly ImportResultRow[]): ImportResultTotals {
  const count = (status: ImportResultRow['status']): number => rows.filter((row) => row.status === status).length;
  return {
    rows: rows.length,
    created: count('created'),
    batchAdded: count('batch_added'),
    duplicate: count('duplicate'),
    error: count('error'),
  };
}

function baseOf(row: ImportPreviewRow): Pick<ImportResultRow, 'rowNumber' | 'cells' | 'type' | 'productName'> {
  return { rowNumber: row.rowNumber, cells: row.cells, type: row.type, productName: row.productName };
}

function lotOf(write: ImportRowWrite): string | null {
  if (write.kind === 'finished') return write.input.lot;
  const lot = write.candidate.lot;
  return typeof lot === 'string' && lot.trim() !== '' ? lot.trim() : null;
}

type RowContext = {
  readonly deps: ConfirmInventoryImportDeps;
  readonly scope: InventoryScope;
  /** Producto que escribio cada fila, para resolver las que suman lote a una fila anterior. */
  readonly productByRow: Map<number, string>;
};

function targetProductId(row: ImportPreviewRow, context: RowContext): string | null {
  if (row.status !== 'add_batch') return null;
  if (row.target.kind === 'existing') return row.target.productId;
  return context.productByRow.get(row.target.rowNumber) ?? null;
}

const errorRow = (row: ImportPreviewRow, issue: ImportRowIssue): ImportResultRow => ({
  ...baseOf(row),
  status: 'error',
  issues: [issue],
});

/** El lote ya estaba al escribir: es duplicado si es del mismo producto y error si es de otro. */
async function lotClash(row: ImportPreviewRow, lot: string | null, context: RowContext): Promise<ImportResultRow> {
  if (lot === null) return errorRow(row, importRowIssue('write_failed', null));
  const [owner] = await context.deps.imports.findBatchesByLots([lot], context.scope);
  const target = targetProductId(row, context);
  if (owner !== undefined && target !== null && owner.productId === target) {
    return { ...baseOf(row), status: 'duplicate', lot };
  }
  return errorRow(row, importRowIssue('lot_used_by_other_product', 'lot'));
}

function written(row: ImportPreviewRow, productId: string, lot: string, context: RowContext): ImportResultRow {
  context.productByRow.set(row.rowNumber, productId);
  // Si la fila que debia crear el producto fallo, esta es la que lo crea.
  const createsIt =
    row.status === 'create' ||
    (row.status === 'add_batch' && row.target.kind === 'file_row' && !context.productByRow.has(row.target.rowNumber));
  return { ...baseOf(row), status: createsIt ? 'created' : 'batch_added', productId, lot };
}

type UnwrittenRow = Extract<ImportPreviewRow, { status: 'error' | 'duplicate' }>;

const isUnwritten = (row: ImportPreviewRow): row is UnwrittenRow =>
  row.status === 'error' || row.status === 'duplicate';

function unwrittenRow(row: UnwrittenRow): ImportResultRow {
  return row.status === 'error'
    ? { ...baseOf(row), status: 'error', issues: row.issues }
    : { ...baseOf(row), status: 'duplicate', lot: row.lot };
}

async function writeRow(
  row: ImportPreviewRow,
  write: ImportRowWrite | undefined,
  actor: Actor,
  context: RowContext,
  importFinishedGoods: ReturnType<typeof createImportFinishedGoods>,
): Promise<ImportResultRow> {
  if (isUnwritten(row)) return unwrittenRow(row);
  if (write === undefined) return errorRow(row, importRowIssue('write_failed', null));

  const lot = lotOf(write);
  try {
    if (write.kind === 'product') {
      const created = await context.deps.createProduct(write.candidate, actor);
      return written(row, created.id, created.lot ?? lot ?? '', context);
    }
    const outcome = await importFinishedGoods(write.input, actor);
    if (outcome.kind === 'received') return written(row, outcome.productId, outcome.lot, context);
    if (outcome.kind === 'duplicate_lot') return lotClash(row, lot, context);
    return errorRow(row, importRowIssue('presentation_without_content', 'presentation'));
  } catch (error) {
    if (error instanceof BatchDuplicateLotError) return lotClash(row, lot, context);
    if (error instanceof ActionNotAllowedError) {
      return errorRow(
        row,
        row.type === PRODUCT_TYPES.PACKAGING
          ? importRowIssue('presentation_mismatch', 'presentation')
          : importRowIssue('finished_product_homonym', 'name'),
      );
    }
    // La fila se da por fallida y las demas siguen: lo ya escrito se conserva.
    return errorRow(row, importRowIssue('write_failed', null));
  }
}

/**
 * Vuelve a planificar contra la base de ahora y escribe solo las filas validas, cada una en su
 * propia transaccion y en el orden del archivo. La clave se reserva antes de la primera escritura.
 * Si no queda ninguna fila valida no se escribe nada, tampoco la reserva de la clave.
 */
export function createConfirmInventoryImport(deps: ConfirmInventoryImportDeps): ConfirmInventoryImport {
  const now = deps.now ?? (() => new Date());
  const importFinishedGoods = createImportFinishedGoods({
    imports: deps.imports,
    stockIncreases: deps.stockIncreases,
    now,
  });

  return async function confirmInventoryImport(input, actor) {
    requirePermission(actor, 'inventario.modificar');
    const scope = { companyId: actor.companyId };
    const instant = now();

    const outcome = await readInventoryImport(deps, input, scope, civilDateUtc(instant));
    if (outcome.kind === 'file_rejected') return outcome;

    const unwritten = outcome.plan.rows.filter(isUnwritten);
    if (unwritten.length === outcome.plan.rows.length) {
      // Un reenvio de una confirmacion ya hecha replanifica sus filas como duplicadas: sigue siendo
      // la misma importacion y no una vacia.
      const previous = await deps.imports.findImport(input.importKey, scope);
      if (previous !== null) {
        return { kind: 'already_imported', importId: previous.importId, importedAt: previous.importedAt.toISOString() };
      }
      const rows = unwritten.map(unwrittenRow);
      return {
        kind: 'nothing_imported',
        fileName: input.fileName,
        exampleRowIgnored: outcome.sheet.exampleRowIgnored,
        totals: resultTotals(rows),
        rows,
      };
    }

    const claim = await deps.imports.claimImport(
      {
        importKey: input.importKey,
        fileName: input.fileName,
        fileSha256: await deps.digest.sha256Hex(input.bytes),
        createdBy: actor.id,
        now: instant,
      },
      scope,
    );
    if (claim.kind === 'already') {
      return { kind: 'already_imported', importId: claim.importId, importedAt: claim.importedAt.toISOString() };
    }

    const context: RowContext = { deps, scope, productByRow: new Map() };
    const rows: ImportResultRow[] = [];
    for (const row of outcome.plan.rows) {
      rows.push(await writeRow(row, outcome.plan.writes.get(row.rowNumber), actor, context, importFinishedGoods));
    }

    const totals = resultTotals(rows);
    await deps.imports.finishImport(claim.importId, totals, now(), scope);

    return {
      kind: 'imported',
      importId: claim.importId,
      importedAt: instant.toISOString(),
      fileName: input.fileName,
      exampleRowIgnored: outcome.sheet.exampleRowIgnored,
      totals,
      rows,
    };
  };
}
