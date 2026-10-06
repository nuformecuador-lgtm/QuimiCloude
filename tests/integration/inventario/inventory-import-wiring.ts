/**
 * La vista previa y la confirmacion de la importacion atadas a los adaptadores reales, para los
 * tests de integracion. No es una suite.
 */
import { vi } from 'vitest';

import { INVENTORY_IMPORT_COLUMNS } from '@/lib/modules/inventario';
import { findBatchMovements } from '@/lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma';
import {
  claimImport,
  findAliveFinishedProducts,
  findAliveProductsByNormalizedNames,
  findBatchesByLots,
  finishImport,
  receiveImportedFinishedGoods,
} from '@/lib/modules/inventario/adapters/driven/persistence/inventory-import-prisma';
import {
  findPresentationRefs,
  findPresentationsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import {
  addBatchToAlive,
  adjustBatchStock,
  createProduct,
  createWithFirstBatch,
  findAliveIdByNameInPresentationUnit,
  findAliveIdByNameInUnit,
  findAlivePackagingByName,
  findAliveProductById,
  findBatchesOfAliveProduct,
  listAliveProducts,
  softDeleteAliveProduct,
  updateAliveProduct,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { readCsv } from '@/lib/modules/inventario/adapters/driven/spreadsheet/csv-reader';
import { fileDigest } from '@/lib/modules/inventario/adapters/driven/spreadsheet/file-digest';
import { readXlsx } from '@/lib/modules/inventario/adapters/driven/spreadsheet/xlsx-reader';
import { createConfirmInventoryImport } from '@/lib/modules/inventario/domain/confirm-inventory-import';
import { createCreateProduct } from '@/lib/modules/inventario/domain/create-product';
import { createPreviewInventoryImport } from '@/lib/modules/inventario/domain/preview-inventory-import';
import { findAliveRecipeByNormalizedName } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import {
  findPackageUnitId,
  findUnitRefs,
  listVisibleUnitRefs,
} from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';

import type { Actor } from '@/lib/modules/inventario/domain/actor';
import type { ImportCells } from '@/lib/modules/inventario';
import type { InventoryImportRepository } from '@/lib/modules/inventario/ports/inventory-import-repository';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';
import type { SpreadsheetReader } from '@/lib/modules/inventario/ports/spreadsheet-reader';

const products: ProductRepository = {
  create: createProduct,
  findAliveById: findAliveProductById,
  updateAlive: updateAliveProduct,
  softDeleteAlive: softDeleteAliveProduct,
  listAlive: listAliveProducts,
  findAliveIdByNameInPresentationUnit,
  findAliveIdByNameInUnit,
  findAlivePackagingByName,
  createWithFirstBatch,
  addBatchToAlive,
  adjustBatchStock,
  findBatchesOfAliveProduct,
  findBatchMovements,
};

export const importRepository: InventoryImportRepository = {
  findAliveProductsByNormalizedNames,
  findAliveFinishedProducts,
  findBatchesByLots,
  claimImport,
  finishImport,
  receiveImportedFinishedGoods,
};

const reader: SpreadsheetReader = {
  read: async (bytes, format) => (format === 'csv' ? readCsv(bytes) : readXlsx(bytes)),
};

const readDeps = {
  reader,
  imports: importRepository,
  units: { listVisibleRefs: listVisibleUnitRefs },
  presentations: { findRefs: findPresentationRefs, findByNormalizedNames: findPresentationsByNormalizedNames },
  formulas: { findAliveOriginalByName: findAliveRecipeByNormalizedName },
};

export type CreateProductUseCase = (input: unknown, actor: Actor) => Promise<{ id: string; lot?: string }>;

export function wireImport(options: { readonly createProduct?: CreateProductUseCase } = {}) {
  const stockIncreases = { onStockIncreased: vi.fn(async () => undefined) };
  const manualCreate = createCreateProduct({
    products,
    stockIncreases,
    packageUnit: { findPackageUnitId },
    units: { findRefs: findUnitRefs },
  });
  const createProductSpy = vi.fn(options.createProduct ?? manualCreate);
  return {
    stockIncreases,
    createProduct: createProductSpy,
    manualCreate,
    preview: createPreviewInventoryImport(readDeps),
    confirm: createConfirmInventoryImport({ ...readDeps, createProduct: createProductSpy, stockIncreases, digest: fileDigest }),
  };
}

/** Un .csv con la cabecera de la plantilla, separado por `;`. */
export function csvFile(rows: readonly Partial<ImportCells>[], fileName = 'inventario.csv') {
  const header = INVENTORY_IMPORT_COLUMNS.map((column) => column.header).join(';');
  const lines = rows.map((row) => INVENTORY_IMPORT_COLUMNS.map((column) => row[column.key] ?? '').join(';'));
  return { fileName, bytes: new TextEncoder().encode([header, ...lines].join('\r\n')) };
}

export function actorOf(empresa: { readonly companyId: string; readonly userId: string }): Actor {
  return { id: empresa.userId, companyId: empresa.companyId, permissions: ['inventario.modificar'] };
}
