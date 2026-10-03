import { ValidationError } from './errors';

import type { RecipeToolData } from '../ports/recipe-repository';

import { PRODUCT_TYPES, type ProductCatalog } from '@/lib/modules/inventario';

/**
 * Valida contra el catalogo solo las herramientas que la receta no tenia: una que ya estaba se
 * conserva aunque su producto se haya dado de baja despues. Una nueva tiene que existir, estar
 * viva, ser de la empresa y ser MACHINE; si no, la entrada es invalida.
 */
export async function assertToolsValid(
  sent: readonly RecipeToolData[],
  alreadyThere: readonly { readonly productId: string }[],
  products: ProductCatalog,
  companyId: string,
): Promise<void> {
  const known = new Set(alreadyThere.map((tool) => tool.productId));
  const newIds = sent.map((tool) => tool.productId).filter((productId) => !known.has(productId));
  if (newIds.length === 0) return;

  const refs = await products.findRefs(newIds, companyId);
  const refsById = new Map(refs.map((ref) => [ref.id, ref]));
  for (const productId of newIds) {
    const ref = refsById.get(productId);
    if (ref === undefined || ref.type !== PRODUCT_TYPES.MACHINE) throw new ValidationError();
  }
}
