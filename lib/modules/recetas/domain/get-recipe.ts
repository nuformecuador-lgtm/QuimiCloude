import { requirePermission, type Actor } from './actor';
import { RecipeNotFoundError } from './errors';
import type { RecipeDetail } from './recipe-view';

import type { RecipeImageStorage } from '../ports/recipe-image-storage';
import type { RecipeRepository } from '../ports/recipe-repository';

import type { ProductCatalog, ProductRef } from '@/lib/modules/inventario';

export type GetRecipeDeps = {
  readonly recipes: RecipeRepository;
  readonly products: ProductCatalog;
  readonly images: RecipeImageStorage;
};

/** Existencia del producto en la unidad de la linea que lo pide: 0 sin lotes, `null` cuando
 *  hay lotes pero ninguno en esa unidad. */
function stockInLineUnit(ref: ProductRef, unitId: string): number | null {
  if (ref.stockByUnit.length === 0) return 0;
  const match = ref.stockByUnit.find((entry) => entry.unitId === unitId);
  return match?.quantity ?? null;
}

/**
 * Detalle de una receta (R18, R24, R33, R34, R37). `requirePermission(actor,
 * 'recetas.consultar')` es la primera linea: consultar es su propio permiso y NO lo concede
 * `recetas.modificar` (QC-74 R13).
 */
export function createGetRecipe(
  deps: GetRecipeDeps,
): (id: string, actor: Actor | null | undefined) => Promise<RecipeDetail> {
  return async function getRecipe(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<RecipeDetail> {
    requirePermission(actor, 'recetas.consultar');

    const row = await deps.recipes.findAliveById(id);
    if (row === null) throw new RecipeNotFoundError();

    // R18: se pide `findRefs` sobre TODAS las lineas -incluida la de un producto de baja,
    // que sale con `productName: null`-. Es el uso que DECORA, distinto del que VALIDA en
    // el alta y en la edicion (`design.md > 6`).
    const productIds = row.lines.map((line) => line.productId);
    const refs = productIds.length > 0 ? await deps.products.findRefs(productIds) : [];
    const namesById = new Map(refs.map((ref) => [ref.id, ref.name]));
    const refsById = new Map(refs.map((ref) => [ref.id, ref]));

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      // R24: la ruta se compone a URL solo al leer, nunca se persiste la URL completa.
      imageUrl: row.imagePath !== null ? deps.images.publicUrl(row.imagePath) : null,
      stepCount: row.steps.length,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      steps: row.steps,
      lines: row.lines.map((line) => {
        const ref = refsById.get(line.productId);
        return {
          id: line.id,
          productId: line.productId,
          productName: namesById.get(line.productId) ?? null,
          quantity: line.quantity,
          unitId: line.unitId,
          productStock: ref === undefined ? null : stockInLineUnit(ref, line.unitId),
        };
      }),
    };
  };
}
