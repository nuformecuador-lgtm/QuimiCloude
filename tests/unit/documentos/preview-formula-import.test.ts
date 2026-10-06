// Vista previa de una importacion de formula. Dobles de todos los puertos y de los casos de
// uso inyectados de `recetas` e `inventario`; sin base ni red.

import { describe, expect, it, vi } from 'vitest';

import { FORMULA_IMPORT_PERMISSION, type Actor } from '@/lib/modules/documentos/domain/actor';
import { ValidationError } from '@/lib/modules/documentos/domain/errors';
import {
  createPreviewFormulaImport,
  type FormulaImportDeps,
} from '@/lib/modules/documentos/domain/preview-formula-import';

import { PRODUCT_TYPES } from '@/lib/modules/inventario';

import type { DocumentBatchRepository, FileForReview } from '@/lib/modules/documentos/ports/document-batch-repository';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const PERSONA = '11111111-1111-4111-8111-111111111111';
const ARCHIVO = '44444444-4444-4444-8444-444444444444';
const PRODUCTO_AGUA = '55555555-5555-4555-8555-555555555555';
const PRODUCTO_AGUA_2 = '66666666-6666-4666-8666-666666666666';

function actorConPermiso(): Actor {
  return { id: PERSONA, companyId: EMPRESA, permissions: [FORMULA_IMPORT_PERMISSION] };
}

const JSON_UN_INGREDIENTE = JSON.stringify({
  name: 'Detergente X',
  description: 'Formula base',
  ingredients: [{ name: 'Agua', percentage: '60', quantity: null, unit: null }],
  steps: ['Mezclar'],
});

const ARCHIVO_LISTO: FileForReview = {
  status: 'done',
  strategy: 'formula',
  extractedText: JSON_UN_INGREDIENTE,
};

type Bitacora = string[];

function dobleDeRepositorio(bitacora: Bitacora, archivo: FileForReview | null = ARCHIVO_LISTO): DocumentBatchRepository {
  return {
    createBatch: vi.fn(),
    attachMessageId: vi.fn(),
    claim: vi.fn(),
    finish: vi.fn(),
    expireStale: vi.fn(),
    readBatch: vi.fn(),
    readFileForReview: vi.fn(async () => {
      bitacora.push('repository.readFileForReview');
      return archivo;
    }),
  } as unknown as DocumentBatchRepository;
}

function dobleDeRecetas(bitacora: Bitacora, choque: { id: string; name: string } | null = null) {
  return {
    findRefsIncludingDeleted: vi.fn(),
    findExecutionContentById: vi.fn(),
    findIdsMatchingName: vi.fn(),
    findAliveByNormalizedName: vi.fn(async () => {
      bitacora.push('recipes.findAliveByNormalizedName');
      return choque;
    }),
  };
}

function dobleDeProductos() {
  return { findRefs: vi.fn(), findCostingBatches: vi.fn() };
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

/** Puerto de ESCRITURA que falla si alguien lo llama: la vista previa no debe escribir nada. */
function dobleQueFallaSiSeLlama(nombre: string) {
  return vi.fn(async () => {
    throw new Error(`no debia llamarse: ${nombre}`);
  });
}

function crearDeps(bitacora: Bitacora, overrides: Partial<FormulaImportDeps> = {}): FormulaImportDeps {
  return {
    repository: dobleDeRepositorio(bitacora),
    recipes: dobleDeRecetas(bitacora) as unknown as FormulaImportDeps['recipes'],
    products: dobleDeProductos() as unknown as FormulaImportDeps['products'],
    productNames: dobleDeNombresDeProducto(bitacora) as unknown as FormulaImportDeps['productNames'],
    createRawMaterial: dobleQueFallaSiSeLlama('createRawMaterial') as FormulaImportDeps['createRawMaterial'],
    createRecipe: dobleQueFallaSiSeLlama('createRecipe') as FormulaImportDeps['createRecipe'],
    updateRecipe: dobleQueFallaSiSeLlama('updateRecipe') as FormulaImportDeps['updateRecipe'],
    ...overrides,
  };
}

describe('createPreviewFormulaImport', () => {
  describe('R3 — archivo invalido: el mismo rechazo en los cuatro casos', () => {
    it('R3 — el archivo no existe: invalid_input', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, { repository: dobleDeRepositorio(bitacora, null) });
      const preview = createPreviewFormulaImport(deps);

      await expect(preview(actorConPermiso(), { documentFileId: ARCHIVO })).rejects.toBeInstanceOf(ValidationError);
    });

    it('R3 — el archivo es de otra empresa: el repositorio ya lo ve igual que "no existe", invalid_input', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, { repository: dobleDeRepositorio(bitacora, null) });
      const preview = createPreviewFormulaImport(deps);

      await expect(preview(actorConPermiso(), { documentFileId: ARCHIVO })).rejects.toBeInstanceOf(ValidationError);
    });

    it('R3 — el archivo no esta en "done": invalid_input', async () => {
      const bitacora: Bitacora = [];
      const archivo: FileForReview = { status: 'processing', strategy: 'formula', extractedText: null };
      const deps = crearDeps(bitacora, { repository: dobleDeRepositorio(bitacora, archivo) });
      const preview = createPreviewFormulaImport(deps);

      await expect(preview(actorConPermiso(), { documentFileId: ARCHIVO })).rejects.toBeInstanceOf(ValidationError);
    });

    it('R3 — la tanda del archivo es "catalogo": invalid_input', async () => {
      const bitacora: Bitacora = [];
      const archivo: FileForReview = { status: 'done', strategy: 'catalogo', extractedText: '{}' };
      const deps = crearDeps(bitacora, { repository: dobleDeRepositorio(bitacora, archivo) });
      const preview = createPreviewFormulaImport(deps);

      await expect(preview(actorConPermiso(), { documentFileId: ARCHIVO })).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('R10 — la vista previa muestra nombre, descripcion, filas y pasos, y no escribe nada', () => {
    it('devuelve nombre, descripcion, la fila del ingrediente y los pasos, sin tocar ningun puerto de escritura', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora);
      const preview = createPreviewFormulaImport(deps);

      const resultado = await preview(actorConPermiso(), { documentFileId: ARCHIVO });

      expect(resultado.name).toBe('Detergente X');
      expect(resultado.description).toBe('Formula base');
      expect(resultado.ingredients).toHaveLength(1);
      expect(resultado.ingredients[0]?.readName).toBe('Agua');
      expect(resultado.ingredients[0]?.percentage).toBe('60');
      expect(resultado.steps).toHaveLength(1);
      expect(deps.createRawMaterial).not.toHaveBeenCalled();
      expect(deps.createRecipe).not.toHaveBeenCalled();
      expect(deps.updateRecipe).not.toHaveBeenCalled();
    });
  });

  describe('R11 — el match de cada fila: uno, ninguno, varios; un terminado nunca se preselecciona', () => {
    it('exactamente un producto vivo no terminado: match "one"', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        productNames: dobleDeNombresDeProducto(bitacora, [
          { id: PRODUCTO_AGUA, name: 'Agua', nameNormalized: 'agua', type: PRODUCT_TYPES.PRODUCT, unitId: null },
        ]) as unknown as FormulaImportDeps['productNames'],
      });
      const preview = createPreviewFormulaImport(deps);

      const resultado = await preview(actorConPermiso(), { documentFileId: ARCHIVO });

      expect(resultado.ingredients[0]?.match).toEqual({
        kind: 'one',
        productId: PRODUCTO_AGUA,
        productName: 'Agua',
        unitId: null,
      });
    });

    it('ningun producto vivo: match "none"', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora);
      const preview = createPreviewFormulaImport(deps);

      const resultado = await preview(actorConPermiso(), { documentFileId: ARCHIVO });

      expect(resultado.ingredients[0]?.match).toEqual({ kind: 'none' });
    });

    it('mas de un producto vivo no terminado: match "several", sin elegir ninguno', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        productNames: dobleDeNombresDeProducto(bitacora, [
          { id: PRODUCTO_AGUA, name: 'Agua', nameNormalized: 'agua', type: PRODUCT_TYPES.PRODUCT, unitId: null },
          { id: PRODUCTO_AGUA_2, name: 'Agua', nameNormalized: 'agua', type: PRODUCT_TYPES.PRODUCT, unitId: null },
        ]) as unknown as FormulaImportDeps['productNames'],
      });
      const preview = createPreviewFormulaImport(deps);

      const resultado = await preview(actorConPermiso(), { documentFileId: ARCHIVO });

      expect(resultado.ingredients[0]?.match).toEqual({ kind: 'several', count: 2 });
    });

    it('un producto terminado NUNCA se preselecciona: con un vivo y un terminado del mismo nombre, match "one" ignora el terminado', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        productNames: dobleDeNombresDeProducto(bitacora, [
          { id: PRODUCTO_AGUA, name: 'Agua', nameNormalized: 'agua', type: PRODUCT_TYPES.PRODUCT, unitId: null },
          { id: PRODUCTO_AGUA_2, name: 'Agua', nameNormalized: 'agua', type: PRODUCT_TYPES.FINISHED_PRODUCT, unitId: null },
        ]) as unknown as FormulaImportDeps['productNames'],
      });
      const preview = createPreviewFormulaImport(deps);

      const resultado = await preview(actorConPermiso(), { documentFileId: ARCHIVO });

      expect(resultado.ingredients[0]?.match).toEqual({
        kind: 'one',
        productId: PRODUCTO_AGUA,
        productName: 'Agua',
        unitId: null,
      });
    });

    it('QC-195 R41 — un envase como UNICO homonimo: match "none", nunca se propone', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        productNames: dobleDeNombresDeProducto(bitacora, [
          { id: PRODUCTO_AGUA, name: 'Agua', nameNormalized: 'agua', type: PRODUCT_TYPES.PACKAGING, unitId: null },
        ]) as unknown as FormulaImportDeps['productNames'],
      });
      const preview = createPreviewFormulaImport(deps);

      const resultado = await preview(actorConPermiso(), { documentFileId: ARCHIVO });

      expect(resultado.ingredients[0]?.match).toEqual({ kind: 'none' });
    });

    it('QC-195 R41 — un envase y una materia prima homonimos: se propone solo la materia prima', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        productNames: dobleDeNombresDeProducto(bitacora, [
          { id: PRODUCTO_AGUA, name: 'Agua', nameNormalized: 'agua', type: PRODUCT_TYPES.PRODUCT, unitId: null },
          { id: PRODUCTO_AGUA_2, name: 'Agua', nameNormalized: 'agua', type: PRODUCT_TYPES.PACKAGING, unitId: null },
        ]) as unknown as FormulaImportDeps['productNames'],
      });
      const preview = createPreviewFormulaImport(deps);

      const resultado = await preview(actorConPermiso(), { documentFileId: ARCHIVO });

      expect(resultado.ingredients[0]?.match).toEqual({ kind: 'one', productId: PRODUCTO_AGUA, productName: 'Agua', unitId: null });
    });

    it('un terminado como UNICO homonimo: match "none", nunca "one"', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        productNames: dobleDeNombresDeProducto(bitacora, [
          { id: PRODUCTO_AGUA, name: 'Agua', nameNormalized: 'agua', type: PRODUCT_TYPES.FINISHED_PRODUCT, unitId: null },
        ]) as unknown as FormulaImportDeps['productNames'],
      });
      const preview = createPreviewFormulaImport(deps);

      const resultado = await preview(actorConPermiso(), { documentFileId: ARCHIVO });

      expect(resultado.ingredients[0]?.match).toEqual({ kind: 'none' });
    });
  });

  describe('R17 — el choque de nombre, con el nombre extraido y con un nombre explicito', () => {
    it('sin `name` en la entrada, el choque se busca con el nombre EXTRAIDO', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        recipes: dobleDeRecetas(bitacora, { id: 'receta-viva', name: 'Detergente X' }) as unknown as FormulaImportDeps['recipes'],
      });
      const preview = createPreviewFormulaImport(deps);

      const resultado = await preview(actorConPermiso(), { documentFileId: ARCHIVO });

      expect(resultado.nameClash).toEqual({ recipeId: 'receta-viva', recipeName: 'Detergente X' });
    });

    it('con `name` explicito, el choque se busca con ESE nombre, no con el extraido', async () => {
      const bitacora: Bitacora = [];
      const buscados: string[] = [];
      const deps = crearDeps(bitacora, {
        recipes: {
          findRefsIncludingDeleted: vi.fn(),
          findExecutionContentById: vi.fn(),
          findIdsMatchingName: vi.fn(),
          findAliveByNormalizedName: vi.fn(async (name: string) => {
            buscados.push(name);
            return null;
          }),
        } as unknown as FormulaImportDeps['recipes'],
      });
      const preview = createPreviewFormulaImport(deps);

      await preview(actorConPermiso(), { documentFileId: ARCHIVO, name: 'Otro nombre' });

      expect(buscados).toEqual(['Otro nombre']);
    });

    it('sin choque, `nameClash` es null', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora);
      const preview = createPreviewFormulaImport(deps);

      const resultado = await preview(actorConPermiso(), { documentFileId: ARCHIVO });

      expect(resultado.nameClash).toBeNull();
    });
  });

  describe('R37 — el choque solo cuenta originales vivas', () => {
    // El catalogo solo devuelve originales; que una version con ese nombre no vuelva lo prueba
    // tests/integration/documentos/formula-import-versions.int.test.ts contra Postgres.
    it('R37: un nombre que solo coincide con una version no vuelve del catalogo y no marca choque', async () => {
      const bitacora: Bitacora = [];
      const recipes = dobleDeRecetas(bitacora, null);
      const deps = crearDeps(bitacora, { recipes: recipes as unknown as FormulaImportDeps['recipes'] });
      const preview = createPreviewFormulaImport(deps);

      const resultado = await preview(actorConPermiso(), { documentFileId: ARCHIVO, name: 'Sin perfume' });

      expect(recipes.findAliveByNormalizedName).toHaveBeenCalledWith('Sin perfume', EMPRESA);
      expect(recipes.findRefsIncludingDeleted).not.toHaveBeenCalled();
      expect(recipes.findIdsMatchingName).not.toHaveBeenCalled();
      expect(resultado.nameClash).toBeNull();
    });
  });
});

describe('QC-211 — la vista previa trae los pasos de envasado', () => {
  it('R14: los pasos de envasado leidos viajan en `packingSteps`, en orden y separados de `steps`', async () => {
    const bitacora: Bitacora = [];
    const archivo: FileForReview = {
      status: 'done',
      strategy: 'formula',
      extractedText: JSON.stringify({
        name: 'Detergente X',
        ingredients: [],
        steps: ['Mezclar'],
        packingSteps: ['Envasar', 'Etiquetar'],
      }),
    };
    const deps = crearDeps(bitacora, { repository: dobleDeRepositorio(bitacora, archivo) });
    const preview = createPreviewFormulaImport(deps);

    const resultado = await preview(actorConPermiso(), { documentFileId: ARCHIVO });

    expect(resultado.steps).toEqual([{ blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar' }] }] }]);
    expect(resultado.packingSteps).toEqual([
      { blocks: [{ kind: 'paragraph', spans: [{ text: 'Envasar' }] }] },
      { blocks: [{ kind: 'paragraph', spans: [{ text: 'Etiquetar' }] }] },
    ]);
  });

  it('R15: un texto sin `packingSteps` da `packingSteps: []`', async () => {
    const bitacora: Bitacora = [];
    const preview = createPreviewFormulaImport(crearDeps(bitacora));

    const resultado = await preview(actorConPermiso(), { documentFileId: ARCHIVO });

    expect(resultado.packingSteps).toEqual([]);
    expect(resultado.steps).toHaveLength(1);
  });
});
