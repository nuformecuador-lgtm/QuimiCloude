/**
 * La vista previa de una importacion de formula. Nunca escribe nada: comprobar la receta con la
 * que choca es cosa de esta vista previa (R17), pero decidir que hacer con ese choque -reemplazar
 * o renombrar- es de la confirmacion. Archivo inexistente, de otra empresa, no `done` o de otra
 * tanda dan el mismo rechazo, para no filtrar cual de los cuatro es.
 *
 * `name` en la entrada, si viene, solo sirve para volver a comprobar el choque contra el nombre
 * que el revisor esta escribiendo, SIN reinterpretar el texto de la IA otra vez: la interpretacion
 * es siempre la misma mientras el archivo no cambie.
 *
 * `FormulaImportDeps` vive aqui porque la confirmacion (`confirm-formula-import.ts`) comparte el
 * MISMO tipo de dependencias; esta funcion no toca `createRawMaterial`, `createRecipe` ni
 * `updateRecipe`.
 */
import { requirePermission, FORMULA_IMPORT_PERMISSION, type Actor } from './actor';
import { extractFormulaFromText, type ExtractedIngredient } from './formula-extraction';
import { previewFormulaImportInputSchema } from './formula-import-input';
import { ValidationError } from './errors';

import type { DocumentBatchRepository } from '../ports/document-batch-repository';

import type { createCreateRawMaterial } from '@/lib/modules/inventario';
import {
  normalizeProductName,
  PRODUCT_TYPES,
  type ProductCatalog,
  type ProductNameLookup,
  type ProductNameMatch,
} from '@/lib/modules/inventario';
import type { createCreateRecipe, createUpdateRecipe } from '@/lib/modules/recetas';
import type { RecipeCatalog, RecipeStepDocument } from '@/lib/modules/recetas';

/** El caso de uso de `inventario` ya construido, no su fabrica: quien lo cablea es
 *  `lib/composition`, nunca este modulo. */
type CreateRawMaterial = ReturnType<typeof createCreateRawMaterial>;
/** Idem para las dos operaciones de `recetas` que escribe la confirmacion. */
type CreateRecipe = ReturnType<typeof createCreateRecipe>;
type UpdateRecipe = ReturnType<typeof createUpdateRecipe>;

/** Dependencias compartidas por la vista previa y la confirmacion: un solo tipo para que no haya
 *  dos copias que puedan divergir. */
export type FormulaImportDeps = {
  readonly repository: DocumentBatchRepository;
  readonly recipes: RecipeCatalog;
  readonly products: ProductCatalog;
  readonly productNames: ProductNameLookup;
  readonly createRawMaterial: CreateRawMaterial;
  readonly createRecipe: CreateRecipe;
  readonly updateRecipe: UpdateRecipe;
};

export type FormulaImportIngredientMatch =
  | { readonly kind: 'one'; readonly productId: string; readonly productName: string; readonly unitId: string | null }
  | { readonly kind: 'none' }
  | { readonly kind: 'several'; readonly count: number };

export type FormulaImportPreviewIngredient = {
  readonly readName: string | null;
  readonly percentage: string | null;
  readonly percentageRead: string | null;
  readonly quantityRead: string | null;
  readonly unitRead: string | null;
  readonly match: FormulaImportIngredientMatch;
};

export type FormulaImportPreview = {
  readonly name: string | null;
  readonly description: string | null;
  readonly ingredients: readonly FormulaImportPreviewIngredient[];
  readonly steps: readonly RecipeStepDocument[];
  readonly nameClash: { readonly recipeId: string; readonly recipeName: string } | null;
};

/** Los nombres normalizados y sin repetir de los ingredientes leidos, para una sola llamada a
 *  `findAliveByNormalizedNames`. Un ingrediente sin nombre no aporta ninguna clave. */
function distinctNormalizedReadNames(ingredients: readonly ExtractedIngredient[]): readonly string[] {
  const names = new Set<string>();
  for (const ingredient of ingredients) {
    if (ingredient.name === null) continue;
    const normalized = normalizeProductName(ingredient.name);
    if (normalized !== '') names.add(normalized);
  }
  return [...names];
}

/** El match de una fila (R11): solo cuentan los productos vivos que NO son producto terminado
 *  -uno nunca se preselecciona-. Sin nombre leido, la fila no tiene con que buscar. */
function matchIngredient(
  ingredient: ExtractedIngredient,
  byNormalizedName: ReadonlyMap<string, readonly ProductNameMatch[]>,
): FormulaImportIngredientMatch {
  if (ingredient.name === null) return { kind: 'none' };
  const candidates = byNormalizedName.get(normalizeProductName(ingredient.name)) ?? [];
  const eligible = candidates.filter((candidate) => candidate.type !== PRODUCT_TYPES.FINISHED_PRODUCT);
  if (eligible.length === 0) return { kind: 'none' };
  if (eligible.length === 1) {
    const match = eligible[0] as ProductNameMatch;
    return { kind: 'one', productId: match.id, productName: match.name, unitId: match.unitId };
  }
  return { kind: 'several', count: eligible.length };
}

export function createPreviewFormulaImport(
  deps: FormulaImportDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<FormulaImportPreview> {
  return async function previewFormulaImport(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<FormulaImportPreview> {
    requirePermission(actor, FORMULA_IMPORT_PERMISSION);

    const parsed = previewFormulaImportInputSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { documentFileId, name } = parsed.data;

    const file = await deps.repository.readFileForReview(documentFileId, actor.companyId);
    if (file === null || file.status !== 'done' || file.strategy !== 'formula') {
      throw new ValidationError();
    }

    const extraction = extractFormulaFromText(file.extractedText ?? '');

    const normalizedNames = distinctNormalizedReadNames(extraction.ingredients);
    const found =
      normalizedNames.length === 0
        ? []
        : await deps.productNames.findAliveByNormalizedNames(normalizedNames, actor.companyId);
    const byNormalizedName = new Map<string, ProductNameMatch[]>();
    for (const match of found) {
      const list = byNormalizedName.get(match.nameNormalized) ?? [];
      list.push(match);
      byNormalizedName.set(match.nameNormalized, list);
    }

    const ingredients: readonly FormulaImportPreviewIngredient[] = extraction.ingredients.map((ingredient) => ({
      readName: ingredient.name,
      percentage: ingredient.percentage,
      percentageRead: ingredient.percentageRead,
      quantityRead: ingredient.quantity,
      unitRead: ingredient.unit,
      match: matchIngredient(ingredient, byNormalizedName),
    }));

    const clashName = name ?? extraction.name ?? '';
    const clash = await deps.recipes.findAliveByNormalizedName(clashName, actor.companyId);
    const nameClash = clash === null ? null : { recipeId: clash.id, recipeName: clash.name };

    return {
      name: extraction.name,
      description: extraction.description,
      ingredients,
      steps: extraction.steps,
      nameClash,
    };
  };
}
