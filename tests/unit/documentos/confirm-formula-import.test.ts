// Confirmacion de una importacion de formula. Dobles de todos los puertos y de los casos de uso
// inyectados de `recetas` e `inventario`; sin base ni red. Reclasifica EN EL SERVIDOR: los dobles
// devuelven lo que hay «en ese momento», nunca lo que trae la entrada sin comprobar.

import { describe, expect, it, vi } from 'vitest';

import { FORMULA_IMPORT_PERMISSION, type Actor } from '@/lib/modules/documentos/domain/actor';
import { ValidationError } from '@/lib/modules/documentos/domain/errors';
import { createConfirmFormulaImport } from '@/lib/modules/documentos/domain/confirm-formula-import';
import type { FormulaImportDeps } from '@/lib/modules/documentos/domain/preview-formula-import';

import { PRODUCT_TYPES, type ProductRef } from '@/lib/modules/inventario';
import { ActionNotAllowedError, RecipeDuplicateNameError, RecipeNotFoundError } from '@/lib/modules/recetas';
import type { RecipeStepDocument } from '@/lib/modules/recetas';

import type { DocumentBatchRepository, FileForReview } from '@/lib/modules/documentos/ports/document-batch-repository';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const PERSONA = '11111111-1111-4111-8111-111111111111';
const ARCHIVO = '44444444-4444-4444-8444-444444444444';
const PRODUCTO_AGUA = '55555555-5555-4555-8555-555555555555';
const PRODUCTO_SODA = '66666666-6666-4666-8666-666666666666';
const RECETA_VIVA = '77777777-7777-4777-8777-777777777777';
const RECETA_OTRA = '88888888-8888-4888-8888-888888888888';

const ARCHIVO_LISTO: FileForReview = { status: 'done', strategy: 'formula', extractedText: null };

const PASO: RecipeStepDocument = { blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar' }] }] };

function actorConPermiso(): Actor {
  return { id: PERSONA, companyId: EMPRESA, permissions: [FORMULA_IMPORT_PERMISSION, 'inventario.modificar'] };
}

function filaExistente(productId: string, percentage: string | null = '100.00') {
  return { kind: 'existing' as const, productId, percentage };
}

function filaNueva(newProductName: string, percentage: string | null = '100.00') {
  return { kind: 'new' as const, newProductName, percentage };
}

function entradaBase(overrides: Record<string, unknown> = {}) {
  return {
    documentFileId: ARCHIVO,
    name: 'Detergente X',
    description: null,
    lines: [filaExistente(PRODUCTO_AGUA)],
    steps: [PASO],
    replaceRecipeId: null,
    ...overrides,
  };
}

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

function dobleDeRecetas(
  bitacora: Bitacora,
  choque: { id: string; name: string } | null = null,
  refsIncludingDeleted: readonly { id: string; name: string; isDeleted: boolean }[] = [],
) {
  return {
    findRefsIncludingDeleted: vi.fn(async () => {
      bitacora.push('recipes.findRefsIncludingDeleted');
      return refsIncludingDeleted.map((ref) => ({ ...ref, ownName: ref.name, isUnderReview: false, original: null }));
    }),
    findExecutionContentById: vi.fn(),
    findIdsMatchingName: vi.fn(),
    findAliveByNormalizedName: vi.fn(async () => {
      bitacora.push('recipes.findAliveByNormalizedName');
      return choque;
    }),
  };
}

function dobleDeProductos(bitacora: Bitacora, refs: readonly ProductRef[] = []) {
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

describe('createConfirmFormulaImport', () => {
  describe('R15, R16 — la revision del servidor rechaza antes de escribir nada', () => {
    it('sin lineas: invalid_input, cero escrituras', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora);
      const confirm = createConfirmFormulaImport(deps);

      await expect(confirm(actorConPermiso(), entradaBase({ lines: [] }))).rejects.toBeInstanceOf(ValidationError);

      expect(deps.createRawMaterial).not.toHaveBeenCalled();
      expect(deps.createRecipe).not.toHaveBeenCalled();
      expect(deps.updateRecipe).not.toHaveBeenCalled();
    });

    it('la suma no llega a 100,00%: invalid_input, cero escrituras', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora);
      const confirm = createConfirmFormulaImport(deps);

      await expect(
        confirm(actorConPermiso(), entradaBase({ lines: [filaExistente(PRODUCTO_AGUA, '50.00')] })),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(deps.createRawMaterial).not.toHaveBeenCalled();
      expect(deps.createRecipe).not.toHaveBeenCalled();
    });

    it('R16 — dos filas con el mismo producto: invalid_input, cero escrituras', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        products: dobleDeProductos(bitacora, [
          { id: PRODUCTO_AGUA, name: 'Agua', unitId: null, stockByUnit: [], type: PRODUCT_TYPES.PRODUCT },
        ]) as unknown as FormulaImportDeps['products'],
      });
      const confirm = createConfirmFormulaImport(deps);

      await expect(
        confirm(
          actorConPermiso(),
          entradaBase({
            lines: [filaExistente(PRODUCTO_AGUA, '50.00'), filaExistente(PRODUCTO_AGUA, '50.00')],
          }),
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(deps.createRawMaterial).not.toHaveBeenCalled();
      expect(deps.createRecipe).not.toHaveBeenCalled();
    });

    it('nombre vacio tras recortar: invalid_input, cero escrituras', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora);
      const confirm = createConfirmFormulaImport(deps);

      await expect(confirm(actorConPermiso(), entradaBase({ name: '   ' }))).rejects.toBeInstanceOf(ValidationError);

      expect(deps.createRecipe).not.toHaveBeenCalled();
    });
  });

  describe('R3, R23, R33 — la confirmacion vuelve a leer el archivo, no se fia de lo que ya vio el navegador', () => {
    it('R23 — archivo inexistente (o de otra empresa) con una entrada por lo demas valida: invalid_input, cero escrituras y cero lecturas de productos/recetas', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, { repository: dobleDeRepositorio(bitacora, null) });
      const confirm = createConfirmFormulaImport(deps);

      await expect(confirm(actorConPermiso(), entradaBase())).rejects.toMatchObject({ code: 'invalid_input' });

      expect(deps.products.findRefs).not.toHaveBeenCalled();
      expect(deps.recipes.findAliveByNormalizedName).not.toHaveBeenCalled();
      expect(deps.productNames.findAliveByNormalizedNames).not.toHaveBeenCalled();
      expect(deps.createRawMaterial).not.toHaveBeenCalled();
      expect(deps.createRecipe).not.toHaveBeenCalled();
      expect(deps.updateRecipe).not.toHaveBeenCalled();
    });

    it('R3 — archivo que todavia no llego a `done` con una entrada por lo demas valida: invalid_input, cero escrituras y cero lecturas de productos/recetas', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        repository: dobleDeRepositorio(bitacora, { status: 'processing', strategy: 'formula', extractedText: null }),
      });
      const confirm = createConfirmFormulaImport(deps);

      await expect(confirm(actorConPermiso(), entradaBase())).rejects.toMatchObject({ code: 'invalid_input' });

      expect(deps.products.findRefs).not.toHaveBeenCalled();
      expect(deps.recipes.findAliveByNormalizedName).not.toHaveBeenCalled();
      expect(deps.productNames.findAliveByNormalizedNames).not.toHaveBeenCalled();
      expect(deps.createRawMaterial).not.toHaveBeenCalled();
      expect(deps.createRecipe).not.toHaveBeenCalled();
      expect(deps.updateRecipe).not.toHaveBeenCalled();
    });

    it('R33 — archivo de una tanda `catalogo` con una entrada por lo demas valida: invalid_input, cero escrituras y cero lecturas de productos/recetas', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        repository: dobleDeRepositorio(bitacora, { status: 'done', strategy: 'catalogo', extractedText: null }),
      });
      const confirm = createConfirmFormulaImport(deps);

      await expect(confirm(actorConPermiso(), entradaBase())).rejects.toMatchObject({ code: 'invalid_input' });

      expect(deps.products.findRefs).not.toHaveBeenCalled();
      expect(deps.recipes.findAliveByNormalizedName).not.toHaveBeenCalled();
      expect(deps.productNames.findAliveByNormalizedNames).not.toHaveBeenCalled();
      expect(deps.createRawMaterial).not.toHaveBeenCalled();
      expect(deps.createRecipe).not.toHaveBeenCalled();
      expect(deps.updateRecipe).not.toHaveBeenCalled();
    });
  });

  describe('R24 — el producto elegido se relee en el servidor', () => {
    it('el producto no existe, esta de baja o es de otra empresa: invalid_input, cero escrituras', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        products: dobleDeProductos(bitacora, []) as unknown as FormulaImportDeps['products'],
      });
      const confirm = createConfirmFormulaImport(deps);

      await expect(confirm(actorConPermiso(), entradaBase())).rejects.toBeInstanceOf(ValidationError);

      expect(deps.createRawMaterial).not.toHaveBeenCalled();
      expect(deps.createRecipe).not.toHaveBeenCalled();
    });

    it('el producto es un PRODUCTO TERMINADO: action_not_allowed, cero escrituras', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        products: dobleDeProductos(bitacora, [
          { id: PRODUCTO_AGUA, name: 'Agua', unitId: null, stockByUnit: [], type: PRODUCT_TYPES.FINISHED_PRODUCT },
        ]) as unknown as FormulaImportDeps['products'],
      });
      const confirm = createConfirmFormulaImport(deps);

      await expect(confirm(actorConPermiso(), entradaBase())).rejects.toBeInstanceOf(ActionNotAllowedError);

      expect(deps.createRawMaterial).not.toHaveBeenCalled();
      expect(deps.createRecipe).not.toHaveBeenCalled();
    });

    it('R27 — el rechazo del producto ocurre ANTES de crear ninguna materia prima nueva', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        products: dobleDeProductos(bitacora, []) as unknown as FormulaImportDeps['products'],
      });
      const confirm = createConfirmFormulaImport(deps);

      await expect(
        confirm(
          actorConPermiso(),
          entradaBase({ lines: [filaExistente(PRODUCTO_AGUA, '50.00'), filaNueva('Sosa', '50.00')] }),
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(deps.createRawMaterial).not.toHaveBeenCalled();
    });
  });

  describe('R20, R27 — el choque contra la receta con la que confirma', () => {
    it('receta viva con ese nombre y sin `replaceRecipeId`: recipe_duplicate_name, cero materias primas', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        recipes: dobleDeRecetas(bitacora, { id: RECETA_VIVA, name: 'Detergente X' }) as unknown as FormulaImportDeps['recipes'],
      });
      const confirm = createConfirmFormulaImport(deps);

      await expect(confirm(actorConPermiso(), entradaBase())).rejects.toBeInstanceOf(RecipeDuplicateNameError);

      expect(deps.createRawMaterial).not.toHaveBeenCalled();
    });

    it('receta viva con ese nombre y `replaceRecipeId` apunta a OTRA receta: recipe_duplicate_name', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        recipes: dobleDeRecetas(bitacora, { id: RECETA_VIVA, name: 'Detergente X' }) as unknown as FormulaImportDeps['recipes'],
      });
      const confirm = createConfirmFormulaImport(deps);

      await expect(
        confirm(actorConPermiso(), entradaBase({ replaceRecipeId: RECETA_OTRA })),
      ).rejects.toBeInstanceOf(RecipeDuplicateNameError);

      expect(deps.createRawMaterial).not.toHaveBeenCalled();
    });

    it('`replaceRecipeId` de una receta dada de baja: recipe_not_found', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        recipes: dobleDeRecetas(bitacora, null, [{ id: RECETA_VIVA, name: 'Otro nombre', isDeleted: true }]) as unknown as FormulaImportDeps['recipes'],
      });
      const confirm = createConfirmFormulaImport(deps);

      await expect(
        confirm(actorConPermiso(), entradaBase({ replaceRecipeId: RECETA_VIVA })),
      ).rejects.toBeInstanceOf(RecipeNotFoundError);

      expect(deps.createRawMaterial).not.toHaveBeenCalled();
    });

    it('`replaceRecipeId` que no existe en absoluto: recipe_not_found', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        recipes: dobleDeRecetas(bitacora, null, []) as unknown as FormulaImportDeps['recipes'],
      });
      const confirm = createConfirmFormulaImport(deps);

      await expect(
        confirm(actorConPermiso(), entradaBase({ replaceRecipeId: RECETA_VIVA })),
      ).rejects.toBeInstanceOf(RecipeNotFoundError);
    });

    it('`replaceRecipeId` vivo pero con OTRO nombre normalizado: invalid_input', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        recipes: dobleDeRecetas(bitacora, null, [{ id: RECETA_VIVA, name: 'Otro nombre', isDeleted: false }]) as unknown as FormulaImportDeps['recipes'],
      });
      const confirm = createConfirmFormulaImport(deps);

      await expect(
        confirm(actorConPermiso(), entradaBase({ replaceRecipeId: RECETA_VIVA })),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(deps.createRawMaterial).not.toHaveBeenCalled();
    });
  });

  describe('R25, R26 — la materia prima nueva: 0 homonimos crea, 1 reutiliza, 2 rechaza', () => {
    it('0 homonimos: crea la materia prima y la usa como ingrediente', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        productNames: dobleDeNombresDeProducto(bitacora, []) as unknown as FormulaImportDeps['productNames'],
      });
      const confirm = createConfirmFormulaImport(deps);

      const resumen = await confirm(
        actorConPermiso(),
        entradaBase({ lines: [filaExistente(PRODUCTO_AGUA, '50.00'), filaNueva('Sosa', '50.00')] }),
      );

      expect(deps.createRawMaterial).toHaveBeenCalledWith({ name: 'Sosa' }, expect.anything());
      expect(resumen.rawMaterialsCreated).toBe(1);
      expect(resumen.rawMaterialsReused).toBe(0);
    });

    it('exactamente 1 homonimo vivo no terminado: reutiliza, no crea', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        productNames: dobleDeNombresDeProducto(bitacora, [
          { id: PRODUCTO_SODA, name: 'Sosa', nameNormalized: 'sosa', type: PRODUCT_TYPES.PRODUCT, unitId: null },
        ]) as unknown as FormulaImportDeps['productNames'],
      });
      const confirm = createConfirmFormulaImport(deps);

      const resumen = await confirm(
        actorConPermiso(),
        entradaBase({ lines: [filaExistente(PRODUCTO_AGUA, '50.00'), filaNueva('Sosa', '50.00')] }),
      );

      expect(deps.createRawMaterial).not.toHaveBeenCalled();
      expect(resumen.rawMaterialsCreated).toBe(0);
      expect(resumen.rawMaterialsReused).toBe(1);
    });

    it('2 homonimos vivos no terminados: invalid_input, cero escrituras', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        productNames: dobleDeNombresDeProducto(bitacora, [
          { id: PRODUCTO_SODA, name: 'Sosa', nameNormalized: 'sosa', type: PRODUCT_TYPES.PRODUCT, unitId: null },
          { id: 'otro-id', name: 'Sosa', nameNormalized: 'sosa', type: PRODUCT_TYPES.PRODUCT, unitId: null },
        ]) as unknown as FormulaImportDeps['productNames'],
      });
      const confirm = createConfirmFormulaImport(deps);

      await expect(
        confirm(actorConPermiso(), entradaBase({ lines: [filaExistente(PRODUCTO_AGUA, '50.00'), filaNueva('Sosa', '50.00')] })),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(deps.createRawMaterial).not.toHaveBeenCalled();
      expect(deps.createRecipe).not.toHaveBeenCalled();
    });

    it('el homonimo reutilizado coincide con el producto que otra fila ya eligio: invalid_input', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        products: dobleDeProductos(bitacora, [
          { id: PRODUCTO_AGUA, name: 'Agua', unitId: null, stockByUnit: [], type: PRODUCT_TYPES.PRODUCT },
        ]) as unknown as FormulaImportDeps['products'],
        productNames: dobleDeNombresDeProducto(bitacora, [
          { id: PRODUCTO_AGUA, name: 'Agua', nameNormalized: 'agua', type: PRODUCT_TYPES.PRODUCT, unitId: null },
        ]) as unknown as FormulaImportDeps['productNames'],
      });
      const confirm = createConfirmFormulaImport(deps);

      await expect(
        confirm(actorConPermiso(), entradaBase({ lines: [filaExistente(PRODUCTO_AGUA, '50.00'), filaNueva('Agua', '50.00')] })),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(deps.createRawMaterial).not.toHaveBeenCalled();
      expect(deps.createRecipe).not.toHaveBeenCalled();
    });
  });

  describe('R18, R19, R35 — reemplazar y crear, sin `image`', () => {
    it('reemplazar llama a `updateRecipe` con el NOMBRE VIVO de la receta, sin la clave `image`', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        recipes: dobleDeRecetas(bitacora, { id: RECETA_VIVA, name: 'Detergente X (vivo)' }) as unknown as FormulaImportDeps['recipes'],
      });
      const confirm = createConfirmFormulaImport(deps);

      const resumen = await confirm(
        actorConPermiso(),
        entradaBase({ name: 'Detergente X', replaceRecipeId: RECETA_VIVA }),
      );

      expect(deps.updateRecipe).toHaveBeenCalledWith(
        RECETA_VIVA,
        expect.objectContaining({ name: 'Detergente X (vivo)' }),
        expect.anything(),
      );
      const entrada = (deps.updateRecipe as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Record<string, unknown>;
      expect('image' in entrada).toBe(false);
      expect(resumen.outcome).toBe('replaced');
      expect(resumen.recipeId).toBe(RECETA_VIVA);
      expect(deps.createRecipe).not.toHaveBeenCalled();
    });

    it('crear (sin choque) llama a `createRecipe`, sin la clave `image`', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora);
      const confirm = createConfirmFormulaImport(deps);

      const resumen = await confirm(actorConPermiso(), entradaBase());

      expect(deps.createRecipe).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Detergente X' }),
        expect.anything(),
      );
      const entrada = (deps.createRecipe as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
      expect('image' in entrada).toBe(false);
      expect(resumen.outcome).toBe('created');
      expect(deps.updateRecipe).not.toHaveBeenCalled();
    });
  });

  describe('R29 — el resumen dice si se creo o reemplazo, y cuantas materias primas se crearon/reutilizaron', () => {
    it('crear con una materia prima nueva: outcome "created" y los recuentos correctos', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        productNames: dobleDeNombresDeProducto(bitacora, []) as unknown as FormulaImportDeps['productNames'],
      });
      const confirm = createConfirmFormulaImport(deps);

      const resumen = await confirm(
        actorConPermiso(),
        entradaBase({ lines: [filaExistente(PRODUCTO_AGUA, '50.00'), filaNueva('Sosa', '50.00')] }),
      );

      expect(resumen).toEqual({
        recipeId: 'receta-nueva',
        outcome: 'created',
        rawMaterialsCreated: 1,
        rawMaterialsReused: 0,
      });
    });
  });

  describe('R28 — confirmar dos veces con el mismo contenido no duplica nada', () => {
    it('receta nueva confirmada dos veces: la segunda choca con la que creo la primera', async () => {
      const bitacora: Bitacora = [];
      let recetaCreada: { id: string; name: string } | null = null;
      const deps = crearDeps(bitacora, {
        recipes: {
          findRefsIncludingDeleted: vi.fn(async () => []),
          findExecutionContentById: vi.fn(),
          findIdsMatchingName: vi.fn(),
          findAliveByNormalizedName: vi.fn(async () => recetaCreada),
        } as unknown as FormulaImportDeps['recipes'],
        createRecipe: vi.fn(async () => {
          recetaCreada = { id: 'receta-nueva', name: 'Detergente X' };
          return { id: 'receta-nueva' };
        }) as FormulaImportDeps['createRecipe'],
      });
      const confirm = createConfirmFormulaImport(deps);

      const primera = await confirm(actorConPermiso(), entradaBase());
      expect(primera.outcome).toBe('created');

      await expect(confirm(actorConPermiso(), entradaBase())).rejects.toBeInstanceOf(RecipeDuplicateNameError);
      expect(deps.createRecipe).toHaveBeenCalledTimes(1);
    });

    it('reemplazar confirmado dos veces: las dos reescriben la misma receta, ninguna materia prima duplicada', async () => {
      const bitacora: Bitacora = [];
      const deps = crearDeps(bitacora, {
        recipes: dobleDeRecetas(bitacora, { id: RECETA_VIVA, name: 'Detergente X' }) as unknown as FormulaImportDeps['recipes'],
      });
      const confirm = createConfirmFormulaImport(deps);
      const entrada = entradaBase({ replaceRecipeId: RECETA_VIVA });

      const primera = await confirm(actorConPermiso(), entrada);
      const segunda = await confirm(actorConPermiso(), entrada);

      expect(primera.outcome).toBe('replaced');
      expect(segunda.outcome).toBe('replaced');
      expect(primera.recipeId).toBe(segunda.recipeId);
      expect(deps.createRawMaterial).not.toHaveBeenCalled();
    });

    it('materia prima nueva confirmada dos veces: la primera la crea, la segunda la reutiliza', async () => {
      const bitacora: Bitacora = [];
      let creada: { id: string; name: string; nameNormalized: string; type: string; unitId: string | null } | null = null;
      const deps = crearDeps(bitacora, {
        productNames: {
          findAliveByNormalizedNames: vi.fn(async () => (creada === null ? [] : [creada])),
        } as unknown as FormulaImportDeps['productNames'],
        createRawMaterial: vi.fn(async (input: { name: string }) => {
          creada = { id: 'materia-nueva', name: input.name, nameNormalized: 'sosa', type: PRODUCT_TYPES.PRODUCT, unitId: null };
          return { id: 'materia-nueva' };
        }) as FormulaImportDeps['createRawMaterial'],
        recipes: {
          findRefsIncludingDeleted: vi.fn(async () => []),
          findExecutionContentById: vi.fn(),
          findIdsMatchingName: vi.fn(),
          findAliveByNormalizedName: vi.fn(async () => null),
        } as unknown as FormulaImportDeps['recipes'],
        createRecipe: vi.fn(async () => ({ id: `receta-${Math.random()}` })) as FormulaImportDeps['createRecipe'],
      });
      const confirm = createConfirmFormulaImport(deps);
      const entrada = entradaBase({ lines: [filaExistente(PRODUCTO_AGUA, '50.00'), filaNueva('Sosa', '50.00')] });

      const primera = await confirm(actorConPermiso(), entrada);
      const segunda = await confirm(actorConPermiso(), entrada);

      expect(primera.rawMaterialsCreated).toBe(1);
      expect(primera.rawMaterialsReused).toBe(0);
      expect(segunda.rawMaterialsCreated).toBe(0);
      expect(segunda.rawMaterialsReused).toBe(1);
      expect(deps.createRawMaterial).toHaveBeenCalledTimes(1);
    });
  });
});
