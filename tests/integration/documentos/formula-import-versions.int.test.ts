/**
 * Importacion de formula frente a versiones de receta, contra Postgres real: vista previa y
 * confirmacion con los adaptadores de Prisma cableados a mano, como `formula-import.int.test.ts`.
 * Los adaptadores usan el cliente global y `createRecipe` abre su propia transaccion, asi que el
 * archivo COMMITEA: cada caso fabrica su empresa efimera y el `afterAll` la borra en el orden de
 * las FK. Entrada en `tests/integration/aislamiento.json > commit`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { createConfirmFormulaImport } from '@/lib/modules/documentos/domain/confirm-formula-import';
import {
  createPreviewFormulaImport,
  type FormulaImportDeps,
} from '@/lib/modules/documentos/domain/preview-formula-import';
import type { Actor } from '@/lib/modules/documentos/domain/actor';
import { documentBatchRepositoryPrisma } from '@/lib/modules/documentos/adapters/driven/persistence/document-batch-repository-prisma';

import { createCreateRawMaterial, PRODUCT_TYPES } from '@/lib/modules/inventario';
import type { ProductCatalog, ProductNameLookup } from '@/lib/modules/inventario';
import { createProduct, findFinishedGoodsReceipts } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import {
  findCostingBatches,
  findProductRefs,
  findProductsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';

import { createCreateRecipe, createUpdateRecipe, normalizeRecipeName } from '@/lib/modules/recetas';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import {
  createRecipe,
  createRecipeVersion,
  findAliveRecipeById,
  listAliveRecipes,
  listAliveRecipeVersions,
  replaceAliveRecipe,
  replaceAliveRecipeWithPropagation,
  softDeleteAliveRecipe,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-prisma';
import {
  findAliveRecipeByNormalizedName,
  findRecipeExecutionContentById,
  findRecipeIdsMatchingName,
  findRecipeRefsIncludingDeleted,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import type { RecipeRepository } from '@/lib/modules/recetas/ports/recipe-repository';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

const productCatalog: ProductCatalog = { findRefs: findProductRefs, findCostingBatches, findFinishedGoodsReceipts };
const productNameLookup: ProductNameLookup = { findAliveByNormalizedNames: findProductsByNormalizedNames };

const recipeRepository: RecipeRepository = {
  create: createRecipe,
  findAliveById: findAliveRecipeById,
  listAlive: listAliveRecipes,
  replaceAlive: replaceAliveRecipe,
  softDeleteAlive: softDeleteAliveRecipe,
  createVersion: createRecipeVersion,
  listAliveVersions: listAliveRecipeVersions,
  replaceAliveWithPropagation: replaceAliveRecipeWithPropagation,
};

const recipeImageStorage: RecipeImageStorage = {
  upload: () => {
    throw new Error('formula-import-versions.int.test.ts no sube ninguna imagen');
  },
  remove: () => {
    throw new Error('formula-import-versions.int.test.ts no borra ninguna imagen');
  },
  publicUrl: (path) => `https://firmada.invalid/${path}`,
};

const recipeCatalog: RecipeCatalog = {
  findRefsIncludingDeleted: findRecipeRefsIncludingDeleted,
  findExecutionContentById: findRecipeExecutionContentById,
  findIdsMatchingName: findRecipeIdsMatchingName,
  findAliveByNormalizedName: findAliveRecipeByNormalizedName,
};

const deps: FormulaImportDeps = {
  repository: documentBatchRepositoryPrisma,
  recipes: recipeCatalog,
  products: productCatalog,
  productNames: productNameLookup,
  createRawMaterial: createCreateRawMaterial({ products: { create: createProduct } }),
  createRecipe: createCreateRecipe({ recipes: recipeRepository, products: productCatalog, images: recipeImageStorage }),
  updateRecipe: createUpdateRecipe({ recipes: recipeRepository, products: productCatalog, images: recipeImageStorage }),
};

type Empresa = {
  readonly companyId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
};

const empresasCreadas: Empresa[] = [];

async function crearEmpresa(): Promise<Empresa> {
  const marker = token();
  const companyName = `Empresa versiones ${marker}`;
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marker}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marker}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marker.slice(0, 12),
      username: `ana.${marker}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId: company.id,
    },
    select: { id: true },
  });
  const empresa: Empresa = { companyId: company.id, userId: user.id, roleId: role.id, documentTypeCode: documentType.code };
  empresasCreadas.push(empresa);
  return empresa;
}

afterAll(async () => {
  for (const empresa of empresasCreadas) {
    // Las versiones antes que sus originales: la FK `parent_recipe_id` es RESTRICT.
    await prisma.recipe.deleteMany({ where: { companyId: empresa.companyId, parentRecipeId: { not: null } } });
    await prisma.recipe.deleteMany({ where: { companyId: empresa.companyId } });
    await prisma.documentFile.deleteMany({ where: { companyId: empresa.companyId } });
    await prisma.documentBatch.deleteMany({ where: { companyId: empresa.companyId } });
    await prisma.product.deleteMany({ where: { companyId: empresa.companyId } });
    await prisma.user.deleteMany({ where: { id: empresa.userId } });
    await prisma.role.deleteMany({ where: { id: empresa.roleId } });
    await prisma.documentType.deleteMany({ where: { code: empresa.documentTypeCode } });
    await prisma.company.deleteMany({ where: { id: empresa.companyId } });
  }
  await prisma.$disconnect();
});

function actorDe(empresa: Empresa): Actor {
  return { id: empresa.userId, companyId: empresa.companyId, permissions: ['recetas.modificar'] };
}

async function crearArchivoFormula(companyId: string, nombreLeido: string): Promise<string> {
  const batch = await prisma.documentBatch.create({ data: { companyId, strategy: 'formula' }, select: { id: true } });
  const file = await prisma.documentFile.create({
    data: {
      batchId: batch.id,
      companyId,
      path: `${companyId}/${token()}.pdf`,
      status: 'done',
      extractedText: JSON.stringify({
        name: nombreLeido,
        description: null,
        ingredients: [{ name: 'Agua', percentage: '100', quantity: null, unit: null }],
        steps: ['Mezclar'],
      }),
    },
    select: { id: true },
  });
  return file.id;
}

async function sembrarReceta(companyId: string, nombre: string, parentRecipeId: string | null = null): Promise<string> {
  const { id } = await prisma.recipe.create({
    data: { name: nombre, nameNormalized: normalizeRecipeName(nombre), companyId, parentRecipeId },
    select: { id: true },
  });
  return id;
}

async function crearProducto(companyId: string, name: string): Promise<string> {
  const created = await createProduct(
    { name, type: PRODUCT_TYPES.PRODUCT, qtyAlert: null },
    new Date(),
    { companyId } satisfies InventoryScope,
  );
  return created.id;
}

function paso(texto: string) {
  return { blocks: [{ kind: 'paragraph' as const, spans: [{ text: texto }] }] };
}

describe('importacion de formula frente a versiones de receta', () => {
  it('R37: en la vista previa un nombre que solo coincide con una version no marca choque; el de una original si', async () => {
    const empresa = await crearEmpresa();
    const originalId = await sembrarReceta(empresa.companyId, 'Crema base');
    await sembrarReceta(empresa.companyId, 'Sin perfume', originalId);
    const documentFileId = await crearArchivoFormula(empresa.companyId, 'Sin perfume');
    const preview = createPreviewFormulaImport(deps);

    const conNombreDeVersion = await preview(actorDe(empresa), { documentFileId });
    const conNombreDeOriginal = await preview(actorDe(empresa), { documentFileId, name: 'Crema base' });

    expect(conNombreDeVersion.name).toBe('Sin perfume');
    expect(conNombreDeVersion.nameClash).toBeNull();
    expect(conNombreDeOriginal.nameClash).toEqual({ recipeId: originalId, recipeName: 'Crema base' });
  });

  it('R37: confirmar con el nombre de una version crea una receta original nueva y deja la version intacta', async () => {
    const empresa = await crearEmpresa();
    const originalId = await sembrarReceta(empresa.companyId, 'Crema base');
    const versionId = await sembrarReceta(empresa.companyId, 'Sin perfume', originalId);
    const versionAntes = await prisma.recipe.findUniqueOrThrow({ where: { id: versionId } });
    const documentFileId = await crearArchivoFormula(empresa.companyId, 'Sin perfume');
    const producto = await crearProducto(empresa.companyId, `Agua ${token()}`);
    const confirm = createConfirmFormulaImport(deps);

    const resumen = await confirm(actorDe(empresa), {
      documentFileId,
      name: 'Sin perfume',
      description: null,
      lines: [{ kind: 'existing', productId: producto, percentage: '100.00' }],
      steps: [paso('Mezclar')],
      replaceRecipeId: null,
    });

    expect(resumen.outcome).toBe('created');
    expect(resumen.recipeId).not.toBe(versionId);
    expect(resumen.recipeId).not.toBe(originalId);

    const nueva = await prisma.recipe.findUniqueOrThrow({ where: { id: resumen.recipeId } });
    expect(nueva.name).toBe('Sin perfume');
    expect(nueva.parentRecipeId).toBeNull();
    expect(nueva.deletedAt).toBeNull();

    const versionDespues = await prisma.recipe.findUniqueOrThrow({ where: { id: versionId } });
    expect(versionDespues).toEqual(versionAntes);
  });
});
