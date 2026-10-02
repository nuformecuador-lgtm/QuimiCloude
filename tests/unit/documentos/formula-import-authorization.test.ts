// Permiso de la vista previa y de la confirmacion de una importacion de formula (R30, R31).
// Dobles de todos los puertos; sin base ni red.

import { describe, expect, it, vi } from 'vitest';

import { FORMULA_IMPORT_PERMISSION, type Actor } from '@/lib/modules/documentos/domain/actor';
import { UnauthorizedError } from '@/lib/modules/documentos/domain/errors';
import { createPreviewFormulaImport } from '@/lib/modules/documentos/domain/preview-formula-import';
import { createConfirmFormulaImport } from '@/lib/modules/documentos/domain/confirm-formula-import';
import type { FormulaImportDeps } from '@/lib/modules/documentos/domain/preview-formula-import';

import { PRODUCT_TYPES } from '@/lib/modules/inventario';
import type { RecipeStepDocument } from '@/lib/modules/recetas';

import type { DocumentBatchRepository, FileForReview } from '@/lib/modules/documentos/ports/document-batch-repository';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const PERSONA = '11111111-1111-4111-8111-111111111111';
const ARCHIVO = '44444444-4444-4444-8444-444444444444';
const PRODUCTO_AGUA = '55555555-5555-4555-8555-555555555555';

const ARCHIVO_LISTO: FileForReview = {
  status: 'done',
  strategy: 'formula',
  extractedText: JSON.stringify({
    name: 'Detergente X',
    ingredients: [{ name: 'Agua', percentage: '100' }],
    steps: ['Mezclar'],
  }),
};

const PASO: RecipeStepDocument = { blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar' }] }] };

type Bitacora = string[];

function dobleDeRepositorio(bitacora: Bitacora): DocumentBatchRepository {
  return {
    createBatch: vi.fn(),
    attachMessageId: vi.fn(),
    claim: vi.fn(),
    finish: vi.fn(),
    expireStale: vi.fn(),
    readBatch: vi.fn(),
    readFileForReview: vi.fn(async () => {
      bitacora.push('repository.readFileForReview');
      return ARCHIVO_LISTO;
    }),
  } as unknown as DocumentBatchRepository;
}

function dobleDeRecetas(bitacora: Bitacora, choque: { id: string; name: string } | null = null) {
  return {
    findRefsIncludingDeleted: vi.fn(async () => {
      bitacora.push('recipes.findRefsIncludingDeleted');
      return [];
    }),
    findExecutionContentById: vi.fn(),
    findIdsMatchingName: vi.fn(),
    findAliveByNormalizedName: vi.fn(async () => {
      bitacora.push('recipes.findAliveByNormalizedName');
      return choque;
    }),
  };
}

function dobleDeProductos(bitacora: Bitacora, refs: readonly { id: string; name: string; unitId: string | null; stockByUnit: []; type: string }[]) {
  return {
    findRefs: vi.fn(async () => {
      bitacora.push('products.findRefs');
      return refs;
    }),
    findCostingBatches: vi.fn(),
  };
}

function dobleDeNombresDeProducto(
  bitacora: Bitacora,
  encontrados: readonly { id: string; name: string; nameNormalized: string; type: string; unitId: string | null }[] = [],
) {
  return {
    findAliveByNormalizedNames: vi.fn(async () => {
      bitacora.push('productNames.findAliveByNormalizedNames');
      return encontrados;
    }),
  };
}

function dobleDeCreateRawMaterial(bitacora: Bitacora) {
  return vi.fn(async (input: { name: string }) => {
    bitacora.push('createRawMaterial');
    return { id: `nueva-${input.name}` };
  });
}

function dobleDeCreateRecipe(bitacora: Bitacora) {
  return vi.fn(async () => {
    bitacora.push('createRecipe');
    return { id: 'receta-nueva' };
  });
}

function dobleDeUpdateRecipe(bitacora: Bitacora) {
  return vi.fn(async (id: string) => {
    bitacora.push('updateRecipe');
    return { id, warnings: [], propagated: [] };
  });
}

function crearDeps(bitacora: Bitacora, overrides: Partial<FormulaImportDeps> = {}): FormulaImportDeps {
  return {
    repository: dobleDeRepositorio(bitacora),
    recipes: dobleDeRecetas(bitacora) as unknown as FormulaImportDeps['recipes'],
    products: dobleDeProductos(bitacora, [
      { id: PRODUCTO_AGUA, name: 'Agua', unitId: null, stockByUnit: [], type: PRODUCT_TYPES.PRODUCT },
    ]) as unknown as FormulaImportDeps['products'],
    productNames: dobleDeNombresDeProducto(bitacora) as unknown as FormulaImportDeps['productNames'],
    createRawMaterial: dobleDeCreateRawMaterial(bitacora) as FormulaImportDeps['createRawMaterial'],
    createRecipe: dobleDeCreateRecipe(bitacora) as FormulaImportDeps['createRecipe'],
    updateRecipe: dobleDeUpdateRecipe(bitacora) as FormulaImportDeps['updateRecipe'],
    ...overrides,
  };
}

function entradaConfirmar(overrides: Record<string, unknown> = {}) {
  return {
    documentFileId: ARCHIVO,
    name: 'Detergente X',
    description: null,
    lines: [{ kind: 'existing', productId: PRODUCTO_AGUA, percentage: '100.00' }],
    steps: [PASO],
    replaceRecipeId: null,
    ...overrides,
  };
}

const ACTORES_DENEGADOS: readonly (readonly [string, Actor | null | undefined])[] = [
  ['actor nulo', null],
  ['actor ausente', undefined],
  ['sin el permiso exigido', { id: PERSONA, companyId: EMPRESA, permissions: ['inventario.consultar'] }],
  ['con el conjunto vacio', { id: PERSONA, companyId: EMPRESA, permissions: [] }],
  ['solo con `documentos.modificar`', { id: PERSONA, companyId: EMPRESA, permissions: ['documentos.modificar'] }],
];

describe('formula-import — autorizacion (R30)', () => {
  describe('la vista previa exige `recetas.modificar`, primera linea', () => {
    for (const [nombreCaso, actor] of ACTORES_DENEGADOS) {
      it(`${nombreCaso}: unauthorized y CERO llamadas a puertos`, async () => {
        const bitacora: Bitacora = [];
        const deps = crearDeps(bitacora);
        const preview = createPreviewFormulaImport(deps);

        await expect(preview(actor, { documentFileId: ARCHIVO })).rejects.toBeInstanceOf(UnauthorizedError);

        expect(bitacora).toEqual([]);
        expect(deps.repository.readFileForReview).not.toHaveBeenCalled();
      });
    }

    it('con permiso, el archivo se lee ANTES que cualquier otro puerto', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora);
      const preview = createPreviewFormulaImport(deps);
      const actor: Actor = { id: PERSONA, companyId: EMPRESA, permissions: [FORMULA_IMPORT_PERMISSION] };

      await preview(actor, { documentFileId: ARCHIVO });

      expect(bitacora[0]).toBe('repository.readFileForReview');
    });
  });

  describe('la confirmacion exige `recetas.modificar`, primera linea', () => {
    for (const [nombreCaso, actor] of ACTORES_DENEGADOS) {
      it(`${nombreCaso}: unauthorized y CERO llamadas a puertos`, async () => {
        const bitacora: Bitacora = [];
        const deps = crearDeps(bitacora);
        const confirm = createConfirmFormulaImport(deps);

        await expect(confirm(actor, entradaConfirmar())).rejects.toBeInstanceOf(UnauthorizedError);

        expect(bitacora).toEqual([]);
        expect(deps.createRawMaterial).not.toHaveBeenCalled();
        expect(deps.createRecipe).not.toHaveBeenCalled();
        expect(deps.updateRecipe).not.toHaveBeenCalled();
      });
    }

    it('con permiso, el archivo se lee ANTES que cualquier otro puerto', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora);
      const confirm = createConfirmFormulaImport(deps);
      const actor: Actor = { id: PERSONA, companyId: EMPRESA, permissions: [FORMULA_IMPORT_PERMISSION, 'inventario.modificar'] };

      await confirm(actor, entradaConfirmar());

      expect(bitacora[0]).toBe('repository.readFileForReview');
    });
  });
});

describe('formula-import — autorizacion de la materia prima nueva (R31)', () => {
  it('sin `inventario.modificar`, crear una materia prima nueva rechaza con unauthorized y CERO escrituras', async () => {
    const bitacora: Bitacora = [];
    const deps = crearDeps(bitacora, {
      productNames: dobleDeNombresDeProducto(bitacora, []) as unknown as FormulaImportDeps['productNames'],
    });
    const confirm = createConfirmFormulaImport(deps);
    const actorSinInventario: Actor = { id: PERSONA, companyId: EMPRESA, permissions: [FORMULA_IMPORT_PERMISSION] };

    await expect(
      confirm(
        actorSinInventario,
        entradaConfirmar({
          lines: [
            { kind: 'existing', productId: PRODUCTO_AGUA, percentage: '50.00' },
            { kind: 'new', newProductName: 'Sosa', percentage: '50.00' },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    expect(deps.createRawMaterial).not.toHaveBeenCalled();
    expect(deps.createRecipe).not.toHaveBeenCalled();
    expect(deps.updateRecipe).not.toHaveBeenCalled();
  });

  it('sin `inventario.modificar` pero sin ninguna materia prima que crear, confirma igual', async () => {
    const bitacora: Bitacora = [];
    const deps = crearDeps(bitacora);
    const confirm = createConfirmFormulaImport(deps);
    const actorSinInventario: Actor = { id: PERSONA, companyId: EMPRESA, permissions: [FORMULA_IMPORT_PERMISSION] };

    const resumen = await confirm(actorSinInventario, entradaConfirmar());

    expect(resumen.outcome).toBe('created');
  });
});
