/**
 * `createConfirmFormulaImport` contra Postgres real, con los adaptadores de Prisma de
 * `documentos`, `recetas` e `inventario` cableados a mano -el mismo cableado que hace
 * `lib/composition`, sin pasar por el-. `replaceAliveRecipe` abre SU PROPIA
 * `prisma.$transaction` contra el cliente GLOBAL, y R18 necesita ver la receta EXACTAMENTE
 * como quedo tras un fallo real del CHECK de porcentaje: envolver la corrida en una
 * transaccion de test con ROLLBACK seria un aislamiento de mentira, igual que ya razona
 * `catalog-import-isolation.int.test.ts`. Por eso este archivo COMMITEA: cada caso fabrica su
 * propia empresa efimera y la limpia en un `finally`/`afterAll`, en el orden que exigen las FK.
 * Entrada en `tests/integration/aislamiento.json > commit`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { createConfirmFormulaImport } from '@/lib/modules/documentos/domain/confirm-formula-import';
import type { FormulaImportDeps } from '@/lib/modules/documentos/domain/preview-formula-import';
import type { Actor } from '@/lib/modules/documentos/domain/actor';
import { documentBatchRepositoryPrisma } from '@/lib/modules/documentos/adapters/driven/persistence/document-batch-repository-prisma';

import {
  createCreateRawMaterial,
  normalizeProductName,
  PRODUCT_TYPES,
} from '@/lib/modules/inventario';
import { createProduct, createWithFirstBatch, findFinishedGoodsReceipts } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import {
  findProductRefs,
  findCostingBatches,
  findProductsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import type { ProductCatalog, ProductNameLookup } from '@/lib/modules/inventario';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';
import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';

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
  createRecipeExecutionReader,
  findAliveRecipeByNormalizedName,
  findRecipeExecutionContentById,
  findRecipeIdsMatchingName,
  findRecipeRefsIncludingDeleted,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import { createCreateRecipe, createUpdateRecipe, normalizeRecipeName } from '@/lib/modules/recetas';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { RecipeRepository, NewRecipe } from '@/lib/modules/recetas/ports/recipe-repository';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { RecipeScope } from '@/lib/modules/recetas/domain/recipe-scope';

import { createOrderWriteRepository } from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma';
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { createFinishedGoodsIntake } from '@/lib/modules/inventario/adapters/driven/persistence/finished-goods-prisma';
import {
  findPresentationRefs,
  findPresentationsByNormalizedNames,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma';
import { findMassVolumeBridge, findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { findUnitRefsSharingBaseInCompany } from '@/lib/modules/unidades/adapters/driven/persistence/unit-prisma';
import { createCreateOrder } from '@/lib/modules/pedidos';
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work';
import type { Actor as OrderActor } from '@/lib/modules/pedidos';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';
import { findPackagingCostingBatches, findPackagingRefs } from '@/lib/modules/inventario/adapters/driven/persistence/packaging-catalog-prisma';
import type { PackagingCatalog } from '@/lib/modules/inventario';
import { orderScopeReaders } from '../../helpers/order-scope-readers';

const packagingCatalog: PackagingCatalog = { findRefs: findPackagingRefs, findCostingBatches: findPackagingCostingBatches };

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

// ---------------------------------------------------------------------------
// El cableado REAL: los mismos adaptadores que `lib/composition`, sin componer la app entera.
// ---------------------------------------------------------------------------

const productCatalog: ProductCatalog = { findRefs: findProductRefs, findCostingBatches, findFinishedGoodsReceipts };

const productNameLookup: ProductNameLookup = {
  findAliveByNormalizedNames: findProductsByNormalizedNames,
};

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

/** Nadie del archivo sube ni borra imagen: reemplazar (R18) omite `image`, asi que el caso de
 *  uso conserva la del original sin llamar a este puerto. Un doble que revienta si algo lo
 *  invocara por error deja el descuido a la vista en el propio fallo del test. */
const recipeImageStorage: RecipeImageStorage = {
  upload: () => {
    throw new Error('formula-import.int.test.ts no sube ninguna imagen');
  },
  remove: () => {
    throw new Error('formula-import.int.test.ts no borra ninguna imagen');
  },
  publicUrl: (path) => `https://firmada.invalid/${path}`,
};

const recipeCatalog: RecipeCatalog = {
  findRefsIncludingDeleted: findRecipeRefsIncludingDeleted,
  findExecutionContentById: findRecipeExecutionContentById,
  findIdsMatchingName: findRecipeIdsMatchingName,
  findAliveByNormalizedName: findAliveRecipeByNormalizedName,
};

const createRecipeUseCase = createCreateRecipe({ recipes: recipeRepository, products: productCatalog, images: recipeImageStorage });
const updateRecipeUseCase = createUpdateRecipe({ recipes: recipeRepository, products: productCatalog, images: recipeImageStorage });
const createRawMaterial = createCreateRawMaterial({ products: { create: createProduct } });

function crearDeps(overrides: Partial<FormulaImportDeps> = {}): FormulaImportDeps {
  return {
    repository: documentBatchRepositoryPrisma,
    recipes: recipeCatalog,
    products: productCatalog,
    productNames: productNameLookup,
    createRawMaterial,
    createRecipe: createRecipeUseCase,
    updateRecipe: updateRecipeUseCase,
    ...overrides,
  };
}

// El cableado REAL de `pedidos`, para R21: un pedido con coste guardado sobre la receta que se
// reemplaza. Solo hace falta `createCreateOrder`, que no recibe `OrderRepository`.
const orderUnitOfWork: OrderUnitOfWork = {
  run: (work) =>
    withOrderTransaction((tx) => {
      const scope: OrderTransactionScope = {
        orders: createOrderWriteRepository(tx),
        reservations: createMaterialReservations(tx),
        recipes: createRecipeExecutionReader(tx),
        ...orderScopeReaders(tx),
        finishedGoods: createFinishedGoodsIntake(tx),
      };
      return work(scope);
    }),
};
const orderPresentationCatalog = { findRefs: findPresentationRefs, findByNormalizedNames: findPresentationsByNormalizedNames };
const orderUnitCatalog = { findRefs: findUnitRefs, listVisibleRefs: () => Promise.reject(new Error('no se usa')), findMassVolumeBridge: () => findMassVolumeBridge(), findRefsSharingBaseInCompany: findUnitRefsSharingBaseInCompany };
const createOrderUseCase = createCreateOrder({
  recipes: recipeCatalog,
  products: productCatalog,
  units: orderUnitCatalog,
  presentations: orderPresentationCatalog,
  packaging: packagingCatalog,
  unitOfWork: orderUnitOfWork,
});

// ---------------------------------------------------------------------------
// Empresa efimera
// ---------------------------------------------------------------------------

type Empresa = {
  readonly companyId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly unitId: string;
};

const empresasCreadas: Empresa[] = [];

async function crearEmpresa(): Promise<Empresa> {
  const marker = token();
  const companyName = `Empresa formula ${marker}`;
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
  const unit = await prisma.unit.create({
    data: { name: `Unidad ${marker}`, nameNormalized: `unidad${marker}`, symbol: `u${marker}`, companyId: company.id },
    select: { id: true },
  });
  const empresa: Empresa = {
    companyId: company.id,
    userId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    unitId: unit.id,
  };
  empresasCreadas.push(empresa);
  return empresa;
}

async function borrarEmpresa(empresa: Empresa): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.order.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.recipe.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.documentFile.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.documentBatch.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.productBatch.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.product.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.presentation.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.unit.deleteMany({ where: { companyId: empresa.companyId } });
  await prisma.user.deleteMany({ where: { id: empresa.userId } });
  await prisma.role.deleteMany({ where: { id: empresa.roleId } });
  await prisma.documentType.deleteMany({ where: { code: empresa.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: empresa.companyId } });
}

afterAll(async () => {
  for (const empresa of empresasCreadas) await borrarEmpresa(empresa);
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Ayudantes de siembra por caso
// ---------------------------------------------------------------------------

function actorDe(empresa: Empresa, permissions: readonly string[] = ['recetas.modificar']): Actor {
  return { id: empresa.userId, companyId: empresa.companyId, permissions };
}

async function crearArchivoListoFormula(companyId: string): Promise<string> {
  const batch = await prisma.documentBatch.create({
    data: { companyId, strategy: 'formula' },
    select: { id: true },
  });
  const file = await prisma.documentFile.create({
    data: {
      batchId: batch.id,
      companyId,
      path: `${companyId}/${token()}.pdf`,
      status: 'done',
      // La confirmacion NUNCA reinterpreta el texto (`design.md > 5.1`, paso 5): su contenido
      // aqui es irrelevante para `createConfirmFormulaImport`.
      extractedText: '{}',
    },
    select: { id: true },
  });
  return file.id;
}

async function crearProducto(companyId: string, name: string): Promise<string> {
  const created = await createProduct(
    { name, type: PRODUCT_TYPES.PRODUCT, qtyAlert: null },
    new Date(),
    { companyId } satisfies InventoryScope,
  );
  return created.id;
}

async function crearProductoConLote(
  empresa: Empresa,
  presentationId: string,
  overrides: Partial<NewProductBatch> = {},
): Promise<string> {
  const created = await createWithFirstBatch(
    { name: `Ingrediente ${token()}` },
    {
      presentationId,
      stock: '10',
      unitCost: '5.0000',
      lot: null,
      purchaseDate: '2026-01-01',
      expiryDate: null,
      createdBy: empresa.userId,
      ...overrides,
    },
    new Date(),
    { companyId: empresa.companyId } satisfies InventoryScope,
  );
  return created.id;
}

async function crearPresentacion(empresa: Empresa): Promise<string> {
  const marker = token();
  const name = `Presentacion ${marker}`;
  const presentation = await prisma.presentation.create({
    data: { name, nameNormalized: name.toLowerCase().replace(/[^a-z0-9]/gu, ''), unitId: empresa.unitId, companyId: empresa.companyId },
    select: { id: true },
  });
  return presentation.id;
}

function paso(texto: string) {
  return { blocks: [{ kind: 'paragraph' as const, spans: [{ text: texto }] }] };
}

async function crearRecetaSembrada(
  empresa: Empresa,
  overrides: { readonly name?: string; readonly lines?: readonly { productId: string; percentage: string }[]; readonly imagePath?: string | null } = {},
): Promise<{ readonly id: string; readonly name: string }> {
  const name = overrides.name ?? `Formula ${token()}`;
  const created = await createRecipe(
    {
      name,
      description: 'Descripcion original',
      steps: [paso('Paso original 1')],
      lines: overrides.lines ?? [],
      imagePath: overrides.imagePath ?? `recetas/${token()}.jpg`,
      tools: [],
    } satisfies NewRecipe,
    empresa.userId,
    new Date(),
    { companyId: empresa.companyId } satisfies RecipeScope,
  );
  if (created === 'duplicate') throw new Error('la receta sembrada de prueba choco con un nombre duplicado');
  return { id: created.id, name };
}

describe('createConfirmFormulaImport — integracion contra Postgres real (T6)', () => {
  describe('R18 — reemplazar', () => {
    it('sustituye descripcion, ingredientes y pasos conservando id, nombre e imagen', async () => {
      const empresa = await crearEmpresa();
      const documentFileId = await crearArchivoListoFormula(empresa.companyId);
      const productoViejo = await crearProducto(empresa.companyId, `Ingrediente viejo ${token()}`);
      const sembrada = await crearRecetaSembrada(empresa, { lines: [{ productId: productoViejo, percentage: '100.00' }] });
      const productoNuevo = await crearProducto(empresa.companyId, `Ingrediente nuevo ${token()}`);
      const actor = actorDe(empresa);
      const confirm = createConfirmFormulaImport(crearDeps());

      const resumen = await confirm(actor, {
        documentFileId,
        name: sembrada.name,
        description: 'Descripcion revisada',
        lines: [{ kind: 'existing', productId: productoNuevo, percentage: '100.00' }],
        steps: [paso('Paso revisado 1'), paso('Paso revisado 2')],
        replaceRecipeId: sembrada.id,
      });

      expect(resumen).toEqual({ recipeId: sembrada.id, outcome: 'replaced', rawMaterialsCreated: 0, rawMaterialsReused: 0 });

      const receta = await prisma.recipe.findUniqueOrThrow({
        where: { id: sembrada.id },
        include: { lines: true },
      });
      expect(receta.id).toBe(sembrada.id);
      expect(receta.name).toBe(sembrada.name);
      expect(receta.imagePath).not.toBeNull();
      expect(receta.description).toBe('Descripcion revisada');
      expect(receta.lines).toHaveLength(1);
      expect(receta.lines[0]?.productId).toBe(productoNuevo);
      expect(receta.steps).toEqual([paso('Paso revisado 1'), paso('Paso revisado 2')]);
    });

    it('una linea que viola el CHECK de porcentaje, forzada en el adaptador: la receta queda como estaba', async () => {
      const empresa = await crearEmpresa();
      const documentFileId = await crearArchivoListoFormula(empresa.companyId);
      const producto = await crearProducto(empresa.companyId, `Ingrediente ${token()}`);
      const sembrada = await crearRecetaSembrada(empresa, { lines: [{ productId: producto, percentage: '100.00' }] });
      const antes = await prisma.recipe.findUniqueOrThrow({ where: { id: sembrada.id }, include: { lines: true } });
      const actor = actorDe(empresa);

      // El caso de uso YA valido el porcentaje con zod antes de llegar aqui (100.00 es valido);
      // el repositorio de este caso ENVUELVE `replaceAlive` real y lo corrompe DESPUES de esa
      // validacion, para que sea la base -el CHECK `recipe_lines_percentage_check`- quien lo
      // rechace, no el dominio.
      const repositorioRoto: RecipeRepository = {
        ...recipeRepository,
        replaceAlive: (id, data, actorId, now, scope) => {
          const lineasRotas = data.lines.map((line, index) => (index === 0 ? { ...line, percentage: '150.00' } : line));
          return replaceAliveRecipe(id, { ...data, lines: lineasRotas }, actorId, now, scope);
        },
      };
      const updateRecipeRoto = createUpdateRecipe({ recipes: repositorioRoto, products: productCatalog, images: recipeImageStorage });
      const confirmRoto = createConfirmFormulaImport(crearDeps({ updateRecipe: updateRecipeRoto }));

      await expect(
        confirmRoto(actor, {
          documentFileId,
          name: sembrada.name,
          description: 'Descripcion que no debe quedar',
          lines: [{ kind: 'existing', productId: producto, percentage: '100.00' }],
          steps: [paso('Paso que no debe quedar')],
          replaceRecipeId: sembrada.id,
        }),
      ).rejects.toThrow();

      const despues = await prisma.recipe.findUniqueOrThrow({ where: { id: sembrada.id }, include: { lines: true } });
      expect(despues.description).toBe(antes.description);
      expect(despues.steps).toEqual(antes.steps);
      expect(despues.lines.map((line) => ({ productId: line.productId, percentage: line.percentage.toFixed(2) }))).toEqual(
        antes.lines.map((line) => ({ productId: line.productId, percentage: line.percentage.toFixed(2) })),
      );
    });
  });

  describe('R21 — reemplazar no toca ningun pedido', () => {
    it('un pedido con coste guardado sobre la receta queda identico fila a fila tras reemplazar', async () => {
      const empresa = await crearEmpresa();
      const documentFileId = await crearArchivoListoFormula(empresa.companyId);
      const presentationId = await crearPresentacion(empresa);
      const ingrediente = await crearProductoConLote(empresa, presentationId);
      const sembrada = await crearRecetaSembrada(empresa, { lines: [{ productId: ingrediente, percentage: '100.00' }] });

      const pedido = await createOrderUseCase(
        { recipeId: sembrada.id, quantity: '6.0000', priority: 'MEDIA', unitId: empresa.unitId },
        { id: empresa.userId, companyId: empresa.companyId, permissions: ['pedidos.modificar'] } satisfies OrderActor,
      );
      const antes = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } });
      expect(antes.ingredientsCost?.toFixed(4)).toBe('30.0000');
      // `JSON.stringify`, no `toEqual`, para no depender de la igualdad estructural de
      // `Prisma.Decimal`: lo que R21 exige es la fila IDENTICA, campo a campo.
      const antesTextual = JSON.stringify(antes);

      const otroIngrediente = await crearProducto(empresa.companyId, `Otro ingrediente ${token()}`);
      const confirm = createConfirmFormulaImport(crearDeps());
      await confirm(actorDe(empresa), {
        documentFileId,
        name: sembrada.name,
        description: 'Formula reemplazada',
        lines: [{ kind: 'existing', productId: otroIngrediente, percentage: '100.00' }],
        steps: [],
        replaceRecipeId: sembrada.id,
      });

      const despues = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } });
      expect(JSON.stringify(despues)).toBe(antesTextual);
    });
  });

  describe('QC-194 R18 — el import de PDF y las herramientas de la receta', () => {
    async function crearMaquina(companyId: string): Promise<string> {
      const created = await createProduct(
        { name: `Maquina ${token()}`, type: PRODUCT_TYPES.MACHINE, qtyAlert: null },
        new Date(),
        { companyId } satisfies InventoryScope,
      );
      return created.id;
    }

    it('R18: reemplazar por PDF una receta con dos herramientas las deja intactas', async () => {
      const empresa = await crearEmpresa();
      const documentFileId = await crearArchivoListoFormula(empresa.companyId);
      const ingrediente = await crearProducto(empresa.companyId, `Ingrediente ${token()}`);
      const sembrada = await crearRecetaSembrada(empresa, { lines: [{ productId: ingrediente, percentage: '100.00' }] });
      const batidora = await crearMaquina(empresa.companyId);
      const balanza = await crearMaquina(empresa.companyId);
      await prisma.recipeTool.createMany({
        data: [
          { recipeId: sembrada.id, productId: batidora, quantity: 2 },
          { recipeId: sembrada.id, productId: balanza, quantity: 1 },
        ],
      });
      const herramientas = () =>
        prisma.recipeTool.findMany({ where: { recipeId: sembrada.id }, orderBy: { productId: 'asc' } });
      const antes = await herramientas();

      const otroIngrediente = await crearProducto(empresa.companyId, `Otro ingrediente ${token()}`);
      const resumen = await createConfirmFormulaImport(crearDeps())(actorDe(empresa), {
        documentFileId,
        name: sembrada.name,
        description: 'Formula reemplazada',
        lines: [{ kind: 'existing', productId: otroIngrediente, percentage: '100.00' }],
        steps: [],
        replaceRecipeId: sembrada.id,
      });

      expect(resumen.outcome).toBe('replaced');
      expect(antes).toHaveLength(2);
      expect(await herramientas()).toEqual(antes);
    });

    it('R18: crear por PDF una receta nueva la deja sin herramientas', async () => {
      const empresa = await crearEmpresa();
      const documentFileId = await crearArchivoListoFormula(empresa.companyId);
      const ingrediente = await crearProducto(empresa.companyId, `Ingrediente ${token()}`);

      const resumen = await createConfirmFormulaImport(crearDeps())(actorDe(empresa), {
        documentFileId,
        name: `Formula nueva ${token()}`,
        description: null,
        lines: [{ kind: 'existing', productId: ingrediente, percentage: '100.00' }],
        steps: [],
        replaceRecipeId: null,
      });

      expect(resumen.outcome).toBe('created');
      expect(await prisma.recipeTool.count({ where: { recipeId: resumen.recipeId } })).toBe(0);
    });
  });

  describe('R27, R28 — materias primas y doble confirmacion', () => {
    it('receta que falla tras crear la materia prima: la materia prima queda, y la segunda confirmacion la reutiliza', async () => {
      const empresa = await crearEmpresa();
      const documentFileId = await crearArchivoListoFormula(empresa.companyId);
      const actor = actorDe(empresa, ['recetas.modificar', 'inventario.modificar']);
      const nombreMateria = `Materia huerfana ${token()}`;
      const nombreReceta = `Formula huerfana ${token()}`;
      const entrada = {
        documentFileId,
        name: nombreReceta,
        description: 'Descripcion',
        lines: [{ kind: 'new' as const, newProductName: nombreMateria, percentage: '100.00' }],
        steps: [],
        replaceRecipeId: null,
      };

      // Primera confirmacion: `createRecipe` se sustituye por uno que SIEMPRE falla, DESPUES
      // de que la materia prima ya se haya creado (paso 9 antes que el paso 10, `design.md >
      // 5.1`): fuerza justo el orden que R27 declara como limitacion, sin tocar produccion.
      const confirmRoto = createConfirmFormulaImport(
        crearDeps({
          createRecipe: async () => {
            throw new Error('la escritura de la receta falla a proposito, tras crear la materia prima');
          },
        }),
      );
      await expect(confirmRoto(actor, entrada)).rejects.toThrow();

      const materiaNormalizada = normalizeProductName(nombreMateria);
      const materiasCreadas = await prisma.product.findMany({
        where: { companyId: empresa.companyId, nameNormalized: materiaNormalizada },
      });
      expect(materiasCreadas).toHaveLength(1);
      expect(materiasCreadas[0]?.type).toBe(PRODUCT_TYPES.PRODUCT);

      const recetaTrasFallo = await prisma.recipe.count({
        where: { companyId: empresa.companyId, nameNormalized: normalizeRecipeName(nombreReceta) },
      });
      expect(recetaTrasFallo).toBe(0);

      // Segunda confirmacion, con `createRecipe` real: reutiliza la materia prima ya creada.
      const confirmReal = createConfirmFormulaImport(crearDeps());
      const resumen = await confirmReal(actor, entrada);

      expect(resumen.outcome).toBe('created');
      expect(resumen.rawMaterialsCreated).toBe(0);
      expect(resumen.rawMaterialsReused).toBe(1);

      const materiasFinal = await prisma.product.count({ where: { companyId: empresa.companyId, nameNormalized: materiaNormalizada } });
      expect(materiasFinal).toBe(1);
    });

    it('dos confirmaciones reales seguidas -crear y reemplazar- dejan una receta y ninguna materia prima duplicada', async () => {
      const empresa = await crearEmpresa();
      const documentFileId = await crearArchivoListoFormula(empresa.companyId);
      const actor = actorDe(empresa, ['recetas.modificar', 'inventario.modificar']);
      const nombreMateria = `Materia reconfirmada ${token()}`;
      const nombreReceta = `Formula reconfirmada ${token()}`;
      const confirm = createConfirmFormulaImport(crearDeps());

      const primera = await confirm(actor, {
        documentFileId,
        name: nombreReceta,
        description: 'Primera confirmacion',
        lines: [{ kind: 'new', newProductName: nombreMateria, percentage: '100.00' }],
        steps: [],
        replaceRecipeId: null,
      });
      expect(primera).toEqual({ recipeId: primera.recipeId, outcome: 'created', rawMaterialsCreated: 1, rawMaterialsReused: 0 });

      // Reconfirma sobre la MISMA receta que acaba de crear -el patron de `design.md > 7.2`,
      // fila «Reemplazar»-, con el mismo contenido.
      const segunda = await confirm(actor, {
        documentFileId,
        name: nombreReceta,
        description: 'Primera confirmacion',
        lines: [{ kind: 'new', newProductName: nombreMateria, percentage: '100.00' }],
        steps: [],
        replaceRecipeId: primera.recipeId,
      });
      expect(segunda).toEqual({ recipeId: primera.recipeId, outcome: 'replaced', rawMaterialsCreated: 0, rawMaterialsReused: 1 });

      const recetas = await prisma.recipe.count({
        where: { companyId: empresa.companyId, nameNormalized: normalizeRecipeName(nombreReceta), deletedAt: null },
      });
      expect(recetas).toBe(1);

      const materias = await prisma.product.count({
        where: { companyId: empresa.companyId, nameNormalized: normalizeProductName(nombreMateria) },
      });
      expect(materias).toBe(1);
    });
  });

  describe('R33 — archivo, receta y producto de otra empresa se comportan como inexistentes', () => {
    it('archivo de otra empresa: invalid_input, nada escrito', async () => {
      const empresa = await crearEmpresa();
      const otra = await crearEmpresa();
      const documentFileDeOtra = await crearArchivoListoFormula(otra.companyId);
      const productoPropio = await crearProducto(empresa.companyId, `Ingrediente propio ${token()}`);
      const confirm = createConfirmFormulaImport(crearDeps());

      // La entrada es VALIDA por si sola -linea completa al 100,00 %, con un producto de la
      // propia empresa y sin choque de nombre-, para que el rechazo salga de la busqueda del
      // archivo acotada a la empresa del actor y no de una validacion mas temprana.
      await expect(
        confirm(actorDe(empresa), {
          documentFileId: documentFileDeOtra,
          name: `Formula ${token()}`,
          description: null,
          lines: [{ kind: 'existing', productId: productoPropio, percentage: '100.00' }],
          steps: [],
          replaceRecipeId: null,
        }),
      ).rejects.toMatchObject({ code: 'invalid_input' });

      const recetas = await prisma.recipe.count({ where: { companyId: empresa.companyId } });
      expect(recetas).toBe(0);
    });

    it('receta a reemplazar de otra empresa: se rechaza igual que si no existiera, nada escrito', async () => {
      const empresa = await crearEmpresa();
      const otra = await crearEmpresa();
      const documentFileId = await crearArchivoListoFormula(empresa.companyId);
      const recetaAjena = await crearRecetaSembrada(otra);
      const productoPropio = await crearProducto(empresa.companyId, `Ingrediente propio ${token()}`);
      const confirm = createConfirmFormulaImport(crearDeps());

      // La entrada es VALIDA por si sola -linea completa, suma 100,00 %, sin choque de nombre-,
      // para que el rechazo salga de la busqueda de `replaceRecipeId` acotada a la empresa del
      // actor (paso 7, `design.md > 5.1`) y no de una validacion mas temprana.
      await expect(
        confirm(actorDe(empresa), {
          documentFileId,
          name: `Formula propia ${token()}`,
          description: null,
          lines: [{ kind: 'existing', productId: productoPropio, percentage: '100.00' }],
          steps: [],
          replaceRecipeId: recetaAjena.id,
        }),
      ).rejects.toMatchObject({ code: 'recipe_not_found' });

      const recetasDeEmpresa = await prisma.recipe.count({ where: { companyId: empresa.companyId } });
      expect(recetasDeEmpresa).toBe(0);
      const recetaAjenaSigueViva = await prisma.recipe.findUniqueOrThrow({ where: { id: recetaAjena.id } });
      expect(recetaAjenaSigueViva.deletedAt).toBeNull();
    });

    it('producto elegido de otra empresa: invalid_input, nada escrito', async () => {
      const empresa = await crearEmpresa();
      const otra = await crearEmpresa();
      const documentFileId = await crearArchivoListoFormula(empresa.companyId);
      const productoAjeno = await crearProducto(otra.companyId, `Producto ajeno ${token()}`);
      const confirm = createConfirmFormulaImport(crearDeps());

      await expect(
        confirm(actorDe(empresa), {
          documentFileId,
          name: `Formula ${token()}`,
          description: null,
          lines: [{ kind: 'existing', productId: productoAjeno, percentage: '100.00' }],
          steps: [],
          replaceRecipeId: null,
        }),
      ).rejects.toMatchObject({ code: 'invalid_input' });

      const recetas = await prisma.recipe.count({ where: { companyId: empresa.companyId } });
      expect(recetas).toBe(0);
    });
  });
});
