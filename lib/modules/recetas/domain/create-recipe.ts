import { requirePermission, type Actor } from './actor';
import { ActionNotAllowedError, RecipeDuplicateNameError, ValidationError } from './errors';
import { validateRecipeImage } from './recipe-image';
import { createRecipeSchema } from './recipe-input';
import type { RecipeScope } from './recipe-scope';

import type { RecipeImageStorage } from '../ports/recipe-image-storage';
import type { NewRecipe, RecipeRepository } from '../ports/recipe-repository';

import { PRODUCT_TYPES, type ProductCatalog } from '@/lib/modules/inventario';

export type CreateRecipeDeps = {
  readonly recipes: RecipeRepository;
  readonly products: ProductCatalog;
  readonly images: RecipeImageStorage;
  /**
   * El puerto exige un `now: Date`, sin decir de donde sale (no es entrada del actor ni
   * algo que valide el borde). Se resuelve como dependencia INYECTABLE, con
   * `() => new Date()` por defecto, para que el test de servicio pueda fijar el instante
   * sin tocar el reloj global -mismo criterio que `inventario` (`create-product.ts`).
   */
  readonly now?: () => Date;
};

/**
 * Alta de receta (R5, R6, R8, R17, R21, R46). `requirePermission(actor, 'recetas.modificar')` es la PRIMERA linea,
 * antes
 * de zod y antes de tocar cualquier puerto (R2, R3).
 */
export function createCreateRecipe(
  deps: CreateRecipeDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<{ id: string }> {
  const now = deps.now ?? (() => new Date());

  return async function createRecipe(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ id: string }> {
    requirePermission(actor, 'recetas.modificar');

    // La empresa sale del ACTOR y jamas de la entrada: nadie puede elegir dar de alta en
    // nombre de otra.
    const scope: RecipeScope = { companyId: actor.companyId };

    const parsed = createRecipeSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;

    // R17, R46: en el ALTA todas las lineas son "nuevas" a efecto de validar el
    // producto -no hay ninguna linea preexistente que eximir- (`design.md > 6`).
    const productIds = data.lines.map((line) => line.productId);
    if (productIds.length > 0) {
      const refs = await deps.products.findRefs(productIds, actor.companyId);
      const foundIds = new Set(refs.map((ref) => ref.id));
      const missing = productIds.some((id) => !foundIds.has(id));
      if (missing) throw new ValidationError();

      const finished = refs.some((ref) => ref.type === PRODUCT_TYPES.FINISHED_PRODUCT);
      if (finished) throw new ActionNotAllowedError();
    }

    // R21: sin imagen no se toca el almacenamiento en absoluto.
    let imagePath: string | null = null;
    if (data.image !== undefined) {
      const validation = validateRecipeImage(data.image.bytes);
      if (!validation.ok) throw new ValidationError();
      imagePath = await deps.images.upload({
        bytes: data.image.bytes,
        contentType: validation.contentType,
        extension: validation.extension,
      });
    }

    const newRecipe: NewRecipe = {
      name: data.name,
      description: data.description ?? null,
      steps: data.steps,
      lines: data.lines,
      imagePath,
      tools: data.tools,
    };

    // R8: el puerto traduce el `23505` del indice unico parcial a `'duplicate'`.
    const result = await deps.recipes.create(newRecipe, actor.id, now(), scope);
    if (result === 'duplicate') throw new RecipeDuplicateNameError();

    return result;
  };
}
