import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import { planFinishedGoodsLine } from '../../../domain/finished-goods';
import { normalizeProductName } from '../../../domain/product-name';
import { PRODUCT_TYPES } from '../../../domain/product-type';

import { batchCompanyScope, companyScopeColumns, productCompanyScope } from './company-scope';
import { addImportedFinishedGoodsBatch, isDuplicateBatchLot } from './product-prisma';

import type { ImportResultTotals } from '../../../domain/inventory-import-contract';
import type { InventoryScope } from '../../../domain/inventory-scope';
import type { NewProductBatch } from '../../../domain/product-batch';
import type { ProductType } from '../../../domain/product-type';
import type {
  ExistingImport,
  ImportClaim,
  ImportedFinishedGoods,
  ImportedFinishedGoodsOutcome,
  ImportProductRef,
} from '../../../ports/inventory-import-repository';

const IMPORT_PRODUCT_REF_SELECT = {
  id: true,
  nameNormalized: true,
  type: true,
  unitId: true,
  presentationId: true,
  recipeId: true,
} satisfies Prisma.ProductSelect;

type ImportProductRefRow = Prisma.ProductGetPayload<{ select: typeof IMPORT_PRODUCT_REF_SELECT }>;

function toImportProductRef(row: ImportProductRefRow): ImportProductRef {
  return {
    id: row.id,
    nameNormalized: row.nameNormalized,
    type: row.type as ProductType,
    unitId: row.unitId,
    presentationId: row.presentationId,
    recipeId: row.recipeId,
  };
}

export async function findAliveProductsByNormalizedNames(
  names: readonly string[],
  scope: InventoryScope,
): Promise<readonly ImportProductRef[]> {
  const normalized = [...new Set(names.map(normalizeProductName))].filter((name) => name !== '');
  if (normalized.length === 0) return [];

  const rows = await prisma.product.findMany({
    where: { AND: [productCompanyScope(scope), { nameNormalized: { in: normalized }, deletedAt: null }] },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: IMPORT_PRODUCT_REF_SELECT,
  });
  return rows.map(toImportProductRef);
}

export async function findAliveFinishedProducts(
  pairs: readonly { recipeId: string; presentationId: string }[],
  scope: InventoryScope,
): Promise<readonly ImportProductRef[]> {
  if (pairs.length === 0) return [];

  const rows = await prisma.product.findMany({
    where: {
      AND: [
        productCompanyScope(scope),
        { type: PRODUCT_TYPES.FINISHED_PRODUCT, deletedAt: null },
        { OR: pairs.map((pair) => ({ recipeId: pair.recipeId, presentationId: pair.presentationId })) },
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: IMPORT_PRODUCT_REF_SELECT,
  });
  return rows.map(toImportProductRef);
}

export async function findBatchesByLots(
  lots: readonly string[],
  scope: InventoryScope,
): Promise<readonly { lot: string; productId: string }[]> {
  const distinct = [...new Set(lots)];
  if (distinct.length === 0) return [];

  return prisma.productBatch.findMany({
    where: { AND: [batchCompanyScope(scope), { lot: { in: distinct } }] },
    orderBy: [{ lot: 'asc' }],
    select: { lot: true, productId: true },
  });
}

/** Por columnas, como `isDuplicateBatchLot`: `meta.target` trae las columnas, no el indice. */
const IMPORT_KEY_UNIQUE_COLUMNS: ReadonlySet<string> = new Set(['company_id', 'import_key']);

function isDuplicateImportKey(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target: unknown = error.meta?.target;
  const columns = new Set(
    typeof target === 'string'
      ? [target]
      : Array.isArray(target)
        ? target.filter((item): item is string => typeof item === 'string')
        : [],
  );
  if (columns.size !== IMPORT_KEY_UNIQUE_COLUMNS.size) return false;
  return [...IMPORT_KEY_UNIQUE_COLUMNS].every((column) => columns.has(column));
}

export async function claimImport(
  input: { importKey: string; fileName: string; fileSha256: string; createdBy: string; now: Date },
  scope: InventoryScope,
): Promise<ImportClaim> {
  try {
    const created = await prisma.inventoryImport.create({
      data: {
        ...companyScopeColumns(scope),
        importKey: input.importKey,
        fileName: input.fileName,
        fileSha256: input.fileSha256,
        createdBy: input.createdBy,
        createdAt: input.now,
      },
      select: { id: true },
    });
    return { kind: 'claimed', importId: created.id };
  } catch (error) {
    if (!isDuplicateImportKey(error)) throw error;
  }

  const existing = await findImport(input.importKey, scope);
  if (existing === null) {
    throw new Error('claimImport: la clave choco con el indice unico pero no aparece la importacion previa');
  }
  return { kind: 'already', ...existing };
}

export async function findImport(importKey: string, scope: InventoryScope): Promise<ExistingImport | null> {
  const existing = await prisma.inventoryImport.findFirst({
    where: { AND: [companyScopeColumns(scope), { importKey }] },
    select: { id: true, createdAt: true },
  });
  return existing === null ? null : { importId: existing.id, importedAt: existing.createdAt };
}

export async function finishImport(
  importId: string,
  totals: ImportResultTotals,
  now: Date,
  scope: InventoryScope,
): Promise<void> {
  const { count } = await prisma.inventoryImport.updateMany({
    where: { AND: [companyScopeColumns(scope), { id: importId }] },
    data: {
      rowsTotal: totals.rows,
      createdCount: totals.created,
      batchAddedCount: totals.batchAdded,
      duplicateCount: totals.duplicate,
      errorCount: totals.error,
      finishedAt: now,
    },
  });
  if (count !== 1) {
    throw new Error(`finishImport: la importacion ${importId} no existe en la empresa ${scope.companyId}`);
  }
}

type PresentationForShareRow = { readonly name: string; readonly unitId: string; readonly content: string | null };

/** Se lanza dentro de la transaccion para que el `ROLLBACK` deshaga lo escrito, y se traduce fuera. */
class PresentationWithoutContent extends Error {}

/** Acotado, como el alta manual: el lock ya evita el choque, y uno que se repite no es mala suerte. */
const GENERATED_LOT_MAX_ATTEMPTS = 3;

async function writeImportedFinishedGoods(
  tx: Prisma.TransactionClient,
  input: ImportedFinishedGoods,
  now: Date,
  scope: InventoryScope,
): Promise<{ productId: string; lot: string; created: boolean }> {
  const { companyId } = companyScopeColumns(scope);

  const presentationRows = await tx.$queryRaw<ReadonlyArray<PresentationForShareRow>>(Prisma.sql`
    SELECT "name", "unit_id" AS "unitId", "content"::text AS "content"
      FROM "presentations"
     WHERE "id" = ${input.presentationId}::uuid
       AND "company_id" = ${companyId}::uuid
       FOR SHARE
  `);
  const presentation = presentationRows[0];
  if (presentation === undefined || presentation.content === null) throw new PresentationWithoutContent();

  const plan = planFinishedGoodsLine({ packages: input.packages, content: presentation.content, unitCost: input.unitCost });
  if (plan.kind === 'no_content') throw new PresentationWithoutContent();

  const name = `${input.recipeName} · ${presentation.name}`;
  // El arbitro de `ON CONFLICT ... WHERE` se resuelve antes de ligar parametros: necesita el texto.
  const finishedProductTypeSql = Prisma.raw(`'${PRODUCT_TYPES.FINISHED_PRODUCT}'`);
  const inserted = await tx.$queryRaw<ReadonlyArray<{ id: string }>>(Prisma.sql`
    INSERT INTO "products"
      ("name", "name_normalized", "type", "unit_id", "company_id", "recipe_id", "presentation_id", "created_at", "updated_at")
    VALUES
      (${name}, ${normalizeProductName(name)}, ${PRODUCT_TYPES.FINISHED_PRODUCT}::"ProductType", ${presentation.unitId}::uuid, ${companyId}::uuid,
       ${input.recipeId}::uuid, ${input.presentationId}::uuid, ${now}, ${now})
    ON CONFLICT (company_id, recipe_id, presentation_id) WHERE type = ${finishedProductTypeSql} AND deleted_at IS NULL
    DO NOTHING
    RETURNING "id"
  `);

  const product = await tx.product.findFirst({
    where: {
      AND: [
        productCompanyScope(scope),
        {
          recipeId: input.recipeId,
          presentationId: input.presentationId,
          type: PRODUCT_TYPES.FINISHED_PRODUCT,
          deletedAt: null,
        },
      ],
    },
    select: { id: true },
  });
  if (product === null) {
    throw new Error('receiveImportedFinishedGoods: el producto terminado no aparecio tras el INSERT ON CONFLICT');
  }

  const batch: NewProductBatch = {
    presentationId: input.presentationId,
    stock: plan.quantity,
    unitCost: input.unitCost,
    lot: input.lot,
    purchaseDate: input.purchaseDate,
    expiryDate: input.expiryDate,
    createdBy: input.createdBy,
  };
  const { lot } = await addImportedFinishedGoodsBatch(tx, product.id, batch, presentation.content, now, scope);

  return { productId: product.id, lot, created: inserted.length > 0 };
}

/**
 * Una transaccion propia por llamada. El choque de lote se atrapa fuera: una transaccion abortada
 * no admite mas sentencias. Solo se reintenta el lote generado; uno escrito a mano chocaria igual.
 */
export async function receiveImportedFinishedGoods(
  input: ImportedFinishedGoods,
  now: Date,
  scope: InventoryScope,
): Promise<ImportedFinishedGoodsOutcome> {
  let lastCollision: unknown = null;

  for (let attempt = 1; attempt <= GENERATED_LOT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const written = await prisma.$transaction((tx) => writeImportedFinishedGoods(tx, input, now, scope));
      return { kind: 'received', ...written };
    } catch (error) {
      if (error instanceof PresentationWithoutContent) return { kind: 'presentation_without_content' };
      if (!isDuplicateBatchLot(error)) throw error;
      if (input.lot !== null) return { kind: 'duplicate_lot' };
      lastCollision = error;
    }
  }

  throw new Error(
    `receiveImportedFinishedGoods: no se pudo escribir un lote generado sin chocar con el indice unico (company_id, lot), ${GENERATED_LOT_MAX_ATTEMPTS} intentos`,
    { cause: lastCollision },
  );
}
