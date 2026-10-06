import { requirePermission, type Actor } from './actor';
import { RecipeNotFoundError } from './errors';
import type { RecipeScope } from './recipe-scope';
import { isVersionUnderReview, recipeDisplayName } from './recipe-version';
import type { RecipeDetail } from './recipe-view';

import type { RecipeImageStorage } from '../ports/recipe-image-storage';
import type { RecipeRepository } from '../ports/recipe-repository';

import type { ProductCatalog, ProductRef } from '@/lib/modules/inventario';

export type GetRecipeDeps = {
  readonly recipes: RecipeRepository;
  readonly products: ProductCatalog;
  readonly images: RecipeImageStorage;
};

const NO_BATCHES_STOCK = '0.0000';

/** Existencia del producto en SU PROPIA unidad: `'0.0000'` cuando no tiene lotes -y por
 *  tanto ninguna unidad resoluble-, la cantidad de esa unidad, en cadena, en el resto de los
 *  casos. */
function stockInProductUnit(ref: ProductRef): string {
  if (ref.unitId === null) return NO_BATCHES_STOCK;
  return ref.stockByUnit.find((entry) => entry.unitId === ref.unitId)?.quantity ?? NO_BATCHES_STOCK;
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

    // La empresa sale del ACTOR y jamas de la entrada: una receta de otra empresa se
    // trata igual que una receta que no existe.
    const scope: RecipeScope = { companyId: actor.companyId };

    const row = await deps.recipes.findAliveById(id, scope);
    if (row === null) throw new RecipeNotFoundError();

    // R18: se pide `findRefs` sobre TODAS las lineas -incluida la de un producto de baja,
    // que sale con `productName: null`-. Es el uso que DECORA, distinto del que VALIDA en
    // el alta y en la edicion (`design.md > 6`).
    const productIds = [
      ...new Set([...row.lines.map((line) => line.productId), ...row.tools.map((tool) => tool.productId)]),
    ];
    const refs = productIds.length > 0 ? await deps.products.findRefs(productIds, actor.companyId) : [];
    const namesById = new Map(refs.map((ref) => [ref.id, ref.name]));
    const refsById = new Map(refs.map((ref) => [ref.id, ref]));

    // Una version no guarda pasos, descripcion ni imagen: muestra los de su original.
    const shared = row.original ?? row;

    return {
      id: row.id,
      name: row.name,
      description: shared.description,
      // La ruta se compone a URL solo al leer; nunca se persiste la URL completa.
      imageUrl: shared.imagePath !== null ? deps.images.publicUrl(shared.imagePath) : null,
      stepCount: shared.steps.length,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      steps: shared.steps,
      packingSteps: shared.packingSteps,
      original: row.original === null ? null : { id: row.original.id, name: row.original.name },
      isUnderReview: isVersionUnderReview(
        row.original !== null,
        row.lines.map((line) => line.percentage),
      ),
      displayName: recipeDisplayName(row.name, row.original?.name ?? null),
      lines: row.lines.map((line) => {
        const ref = refsById.get(line.productId);
        return {
          id: line.id,
          productId: line.productId,
          productName: namesById.get(line.productId) ?? null,
          percentage: line.percentage,
          productUnitId: ref?.unitId ?? null,
          productStock: ref === undefined ? null : stockInProductUnit(ref),
        };
      }),
      tools: row.tools.map((tool) => ({
        id: tool.id,
        productId: tool.productId,
        productName: namesById.get(tool.productId) ?? null,
        quantity: tool.quantity,
      })),
    };
  };
}
